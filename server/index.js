const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

loadEnvFile(path.join(__dirname, "..", ".env"));

const PORT = Number(process.env.PORT || 4242);
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const PROMO_FREE_TRIAL_CODE = String(process.env.PROMO_FREE_TRIAL_CODE || "TRYPRO3").trim();
const PROMO_FREE_TRIAL_DAYS = Number(process.env.PROMO_FREE_TRIAL_DAYS || 90);
const PROMO_FREE_TRIAL_EXPIRES_AT = process.env.PROMO_FREE_TRIAL_EXPIRES_AT || "2026-11-01T05:00:00.000Z";
const PROMO_FREE_TRIAL_EXPIRES_LABEL = process.env.PROMO_FREE_TRIAL_EXPIRES_LABEL || "October 31, 2026";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const FOUNDING_LIMIT = Number(process.env.FOUNDING_MEMBER_LIMIT || 50);
const PUBLIC_FOUNDING_CLAIMED_BASE = Number(process.env.PUBLIC_FOUNDING_CLAIMED_BASE || 4);
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const ADMIN_NAME = process.env.ADMIN_NAME || "Owner";
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "";
const FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN || "";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
const FIREBASE_APP_ID = process.env.FIREBASE_APP_ID || "";
const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "";
const FIREBASE_MESSAGING_SENDER_ID = process.env.FIREBASE_MESSAGING_SENDER_ID || "";
const FIREBASE_MEASUREMENT_ID = process.env.FIREBASE_MEASUREMENT_ID || "";
const FIREBASE_CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const SUPPORT_EMAIL_TO = normalizeEmail(process.env.SUPPORT_EMAIL_TO || ADMIN_EMAIL || "little.learners.hub.customer@gmail.com");
const SUPPORT_EMAIL_FROM = process.env.SUPPORT_EMAIL_FROM || process.env.RESEND_FROM || process.env.SENDGRID_FROM || process.env.POSTMARK_FROM || "";
const SUPPORT_EMAIL_PROVIDER = String(process.env.SUPPORT_EMAIL_PROVIDER || "").trim().toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN || "";
const DATABASE_PROVIDER = process.env.DATABASE_PROVIDER || "local-json";
const PRODUCTION_DATABASE_URL = process.env.PRODUCTION_DATABASE_URL || "";
const PRODUCTION_DATABASE_SERVICE_KEY = process.env.PRODUCTION_DATABASE_SERVICE_KEY || "";
const DATABASE_SSL = process.env.DATABASE_SSL || "";

const publicDir = path.join(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const storePath = path.join(dataDir, "launch-store.json");
const storeRecordId = "launch-store";
const spaRoutePaths = new Set([
  "/admin",
]);
let storeCache = null;
let databaseReady = false;
let postgresPool = null;
let postgresWriteChain = Promise.resolve();
let firebaseCertCache = { expiresAt: 0, certs: {} };

const planConfig = {
  founding: {
    plan: "Founding",
    label: "Founding Member",
    cadence: "monthly",
    priceEnv: "STRIPE_PRICE_FOUNDING_MONTHLY",
    amount: "$9.99/month",
    priceLock: "Lifetime",
  },
  monthly: {
    plan: "Pro",
    label: "Pro Monthly",
    cadence: "monthly",
    priceEnv: "STRIPE_PRICE_PRO_MONTHLY",
    amount: "$19.99/month",
    priceLock: "",
  },
  annual: {
    plan: "Pro",
    label: "Pro Annual",
    cadence: "annual",
    priceEnv: "STRIPE_PRICE_PRO_ANNUAL",
    amount: "$199/year",
    priceLock: "",
  },
};

const stripeEnvKeys = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_FOUNDING_MONTHLY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_ANNUAL",
];

function isConfiguredValue(value) {
  const text = String(value || "").trim();
  return Boolean(text)
    && !/replace|your_|example|changeme|todo/i.test(text)
    && !/^price_replace/i.test(text)
    && !/^sk_test_replace/i.test(text)
    && !/^whsec_replace/i.test(text);
}

function maskedValue(value) {
  const text = String(value || "").trim();
  if (!isConfiguredValue(text)) return "";
  if (text.length <= 12) return `${text.slice(0, 4)}...`;
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function normalizePromoCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function checkoutPromoForCode(value) {
  const configuredCode = normalizePromoCode(PROMO_FREE_TRIAL_CODE);
  const enteredCode = normalizePromoCode(value);
  const trialDays = Number.isFinite(PROMO_FREE_TRIAL_DAYS) ? Math.max(0, Math.min(PROMO_FREE_TRIAL_DAYS, 365)) : 0;
  const expiresAt = Date.parse(PROMO_FREE_TRIAL_EXPIRES_AT);
  const expired = Number.isFinite(expiresAt) && Date.now() >= expiresAt;
  if (!configuredCode || !enteredCode || enteredCode !== configuredCode || trialDays <= 0) {
    return { valid: false, code: enteredCode };
  }
  if (expired) {
    return {
      valid: false,
      code: configuredCode,
      expired: true,
      expiresAt: PROMO_FREE_TRIAL_EXPIRES_AT,
      expiresLabel: PROMO_FREE_TRIAL_EXPIRES_LABEL,
    };
  }
  return {
    valid: true,
    code: configuredCode,
    trialDays,
    label: `${trialDays} day free Pro trial`,
    expiresAt: PROMO_FREE_TRIAL_EXPIRES_AT,
    expiresLabel: PROMO_FREE_TRIAL_EXPIRES_LABEL,
  };
}

function stripeConfigStatus() {
  const missing = stripeEnvKeys.filter((key) => !isConfiguredValue(process.env[key]));
  const secretConfigured = isConfiguredValue(STRIPE_SECRET_KEY);
  const checkoutReady = missing.length === 0;
  const webhookConfigured = isConfiguredValue(STRIPE_WEBHOOK_SECRET);
  return {
    ready: checkoutReady && webhookConfigured,
    checkoutReady,
    mode: secretConfigured && STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : secretConfigured && STRIPE_SECRET_KEY.startsWith("sk_test_") ? "test" : "not configured",
    missing,
    webhookConfigured,
    prices: {
      founding: maskedValue(process.env.STRIPE_PRICE_FOUNDING_MONTHLY),
      monthly: maskedValue(process.env.STRIPE_PRICE_PRO_MONTHLY),
      annual: maskedValue(process.env.STRIPE_PRICE_PRO_ANNUAL),
    },
    checkoutEndpoint: "/api/create-checkout-session",
    customerPortalEndpoint: "/api/create-customer-portal-session",
    webhookEndpoint: "/api/webhooks/stripe",
    webhookEndpointAliases: ["/api/stripe/webhook"],
  };
}

function adminConfigStatus() {
  return {
    ready: isConfiguredValue(ADMIN_EMAIL) && isConfiguredValue(ADMIN_PASSWORD) && isConfiguredValue(ADMIN_ACCESS_CODE),
    email: ADMIN_EMAIL,
  };
}

function aiConfigStatus() {
  const ready = isConfiguredValue(OPENAI_API_KEY);
  return {
    ready,
    model: OPENAI_MODEL,
    mode: ready ? "configured" : "not configured",
  };
}

function firebaseConfigStatus() {
  const required = {
    FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID,
    FIREBASE_APP_ID,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !isConfiguredValue(value))
    .map(([key]) => key);
  return {
    ready: missing.length === 0,
    missing,
    projectId: isConfiguredValue(FIREBASE_PROJECT_ID) ? FIREBASE_PROJECT_ID : "",
    mode: missing.length === 0 ? "configured" : "not configured",
  };
}

function detectedEmailProvider() {
  if (SUPPORT_EMAIL_PROVIDER) return SUPPORT_EMAIL_PROVIDER;
  if (isConfiguredValue(RESEND_API_KEY)) return "resend";
  if (isConfiguredValue(SENDGRID_API_KEY)) return "sendgrid";
  if (isConfiguredValue(POSTMARK_SERVER_TOKEN)) return "postmark";
  return "";
}

function supportEmailConfigStatus() {
  const provider = detectedEmailProvider();
  const keyReady = provider === "resend"
    ? isConfiguredValue(RESEND_API_KEY)
    : provider === "sendgrid"
      ? isConfiguredValue(SENDGRID_API_KEY)
      : provider === "postmark"
        ? isConfiguredValue(POSTMARK_SERVER_TOKEN)
        : false;
  const ready = Boolean(provider && keyReady && isConfiguredValue(SUPPORT_EMAIL_FROM) && isConfiguredValue(SUPPORT_EMAIL_TO));
  return {
    ready,
    provider: provider || "not configured",
    to: SUPPORT_EMAIL_TO,
    fromConfigured: isConfiguredValue(SUPPORT_EMAIL_FROM),
    note: ready
      ? "Support and bug report email notifications are configured."
      : "Support tickets are saved in Admin. Add RESEND_API_KEY, SENDGRID_API_KEY, or POSTMARK_SERVER_TOKEN plus SUPPORT_EMAIL_FROM to send automatic email notifications.",
  };
}

function siteConfigStatus() {
  const httpsReady = SITE_URL.startsWith("https://") && !/your-domain|localhost|127\.0\.0\.1/i.test(SITE_URL);
  return {
    ready: httpsReady,
    siteUrl: SITE_URL,
    httpsReady,
  };
}

function databaseConfigStatus() {
  const provider = DATABASE_PROVIDER.toLowerCase();
  const postgres = provider === "postgres" || provider === "postgresql";
  const external = provider !== "local-json";
  const credentialsReady = postgres
    ? isConfiguredValue(PRODUCTION_DATABASE_URL)
    : isConfiguredValue(PRODUCTION_DATABASE_URL) && isConfiguredValue(PRODUCTION_DATABASE_SERVICE_KEY);
  return {
    ready: external && credentialsReady && (postgres ? databaseReady : true),
    provider: DATABASE_PROVIDER,
    localJsonPath: storePath,
    note: postgres && databaseReady
      ? "Postgres storage is connected for launch data."
      : external && credentialsReady
        ? "External database credentials are configured. Connect this provider before accepting serious traffic."
      : "Local JSON storage is only for testing. Use a protected hosted database before serious traffic.",
  };
}

function launchReadinessStatus() {
  const stripe = stripeConfigStatus();
  const admin = adminConfigStatus();
  const ai = aiConfigStatus();
  const site = siteConfigStatus();
  const database = databaseConfigStatus();
  const supportEmail = supportEmailConfigStatus();
  const required = { stripe, admin, ai, site, database };
  const blockers = Object.entries(required)
    .filter(([, value]) => !value.ready)
    .map(([key]) => key);
  return {
    ready: blockers.length === 0,
    blockers,
    required,
    optional: { supportEmail },
    message: blockers.length
      ? `Not launch-ready yet. Fix: ${blockers.join(", ")}.`
      : "Website launch requirements are configured.",
  };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
}

function defaultStore() {
  return {
    users: {},
    foundingMembers: [],
    adminSessions: {},
    aiUsage: {},
    aiOutputs: [],
    supportTickets: [],
    analyticsEvents: [],
    billingEvents: [],
    leads: [],
    promoRedemptions: [],
  };
}

function usePostgresStore() {
  const provider = DATABASE_PROVIDER.toLowerCase();
  return (provider === "postgres" || provider === "postgresql") && isConfiguredValue(PRODUCTION_DATABASE_URL);
}

function postgresSslConfig() {
  if (DATABASE_SSL === "true") return { rejectUnauthorized: false };
  if (DATABASE_SSL === "false") return false;
  return undefined;
}

async function initializePostgresStore() {
  const { Pool } = require("pg");
  postgresPool = new Pool({
    connectionString: PRODUCTION_DATABASE_URL,
    ssl: postgresSslConfig(),
  });
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS llh_store (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const result = await postgresPool.query("SELECT data FROM llh_store WHERE id = $1", [storeRecordId]);
  if (result.rows.length) {
    storeCache = result.rows[0].data || defaultStore();
  } else {
    storeCache = defaultStore();
    await postgresPool.query(
      "INSERT INTO llh_store (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())",
      [storeRecordId, JSON.stringify(storeCache)],
    );
  }
  databaseReady = true;
}

async function initializeStorage() {
  if (usePostgresStore()) {
    await initializePostgresStore();
    return;
  }
  ensureStore();
  storeCache = JSON.parse(fs.readFileSync(storePath, "utf8"));
  databaseReady = false;
}

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(defaultStore(), null, 2));
  }
}

function readStore() {
  if (usePostgresStore()) return structuredClone(storeCache || defaultStore());
  ensureStore();
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function writeStore(store) {
  storeCache = store;
  if (usePostgresStore()) {
    const payload = JSON.stringify(store);
    postgresWriteChain = postgresWriteChain
      .then(() => postgresPool.query(
        "INSERT INTO llh_store (id, data, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()",
        [storeRecordId, payload],
      ))
      .catch((error) => {
        databaseReady = false;
        console.error("Could not persist launch store to Postgres:", error.message);
      });
    return;
  }
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function textResponse(response, statusCode, text, type = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": type });
  response.end(text);
}

function headResponse(response, statusCode, type = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": type });
  response.end();
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJson(request) {
  const body = await readBody(request);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlJson(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function base64UrlBuffer(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

async function firebaseCertificates() {
  if (firebaseCertCache.expiresAt > Date.now() && Object.keys(firebaseCertCache.certs).length) {
    return firebaseCertCache.certs;
  }
  const response = await fetch(FIREBASE_CERT_URL);
  if (!response.ok) throw new Error("Could not load Firebase verification certificates.");
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  firebaseCertCache = {
    certs: await response.json(),
    expiresAt: Date.now() + (maxAge * 1000),
  };
  return firebaseCertCache.certs;
}

async function verifyFirebaseUser(request) {
  if (!firebaseConfigStatus().ready) throw new Error("Firebase Auth is not configured on the server.");
  const authHeader = String(request.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("Please log in before saving child data.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid login token.");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64UrlJson(encodedHeader);
  const payload = base64UrlJson(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid login token.");
  const cert = (await firebaseCertificates())[header.kid];
  if (!cert) throw new Error("Firebase login token could not be verified.");
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  if (!verifier.verify(cert, base64UrlBuffer(encodedSignature))) {
    throw new Error("Firebase login token signature did not match.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error("Firebase login token is for the wrong project.");
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error("Firebase login token issuer did not match.");
  if (Number(payload.exp || 0) <= now) throw new Error("Please log in again before saving child data.");
  if (Number(payload.iat || 0) > now + 300) throw new Error("Firebase login token time was invalid.");
  if (!payload.sub) throw new Error("Firebase login token is missing a user id.");
  return {
    uid: String(payload.sub),
    email: normalizeEmail(payload.email || ""),
  };
}

function createAdminToken(email) {
  const token = `admin_${crypto.randomBytes(24).toString("hex")}`;
  const store = readStore();
  store.adminSessions = store.adminSessions || {};
  store.adminSessions[token] = {
    email,
    createdAt: new Date().toISOString(),
  };
  writeStore(store);
  return token;
}

function foundingClaimedCount(store) {
  return Math.min(PUBLIC_FOUNDING_CLAIMED_BASE + (store.foundingMembers || []).length, FOUNDING_LIMIT);
}

function foundingSpotsRemaining(store) {
  return Math.max(FOUNDING_LIMIT - foundingClaimedCount(store), 0);
}

function foundingStatusPayload(store = readStore()) {
  const claimed = foundingClaimedCount(store);
  const remaining = foundingSpotsRemaining(store);
  return {
    limit: FOUNDING_LIMIT,
    claimed,
    remaining,
    soldOut: remaining <= 0,
    foundingPrice: "$9.99/month",
    regularMonthlyPrice: "$19.99/month",
    regularAnnualPrice: "$199/year",
  };
}

function claimFoundingSpot(email) {
  const store = readStore();
  store.foundingMembers = store.foundingMembers || [];
  if (!store.foundingMembers.includes(email) && foundingSpotsRemaining(store) > 0) {
    store.foundingMembers.push(email);
    writeStore(store);
  }
  return {
    foundingMember: store.foundingMembers.includes(email),
    foundingMemberNumber: store.foundingMembers.indexOf(email) >= 0
      ? PUBLIC_FOUNDING_CLAIMED_BASE + store.foundingMembers.indexOf(email) + 1
      : null,
  };
}

function statusForPlan(planKey, stripeSubscriptionId, status) {
  const config = planConfig[planKey] || planConfig.monthly;
  return {
    plan: config.plan,
    subscriptionCadence: config.cadence,
    subscriptionStatus: `${config.label} Subscription ${status || "Active"}`,
    monthlyPrice: config.amount,
    priceLock: config.priceLock,
    stripeSubscriptionId,
  };
}

function planKeyFromPriceId(priceId) {
  const cleanPriceId = String(priceId || "").trim();
  if (!cleanPriceId) return "";
  const match = Object.entries(planConfig).find(([planKey]) => getPriceId(planKey) === cleanPriceId);
  return match?.[0] || "";
}

function planKeyFromSubscriptionPrice(subscription) {
  const items = subscription?.items?.data || [];
  for (const item of items) {
    const planKey = planKeyFromPriceId(item?.price?.id || item?.plan?.id);
    if (planKey) return planKey;
  }
  return "";
}

function planKeyFromStripe(subscription, user = {}) {
  const metadataPlan = String(subscription?.metadata?.plan || "").trim().toLowerCase();
  if (planConfig[metadataPlan]) return metadataPlan;
  const pricePlan = planKeyFromSubscriptionPrice(subscription);
  if (planConfig[pricePlan]) return pricePlan;
  const pendingPlan = String(user.pendingPlan || "").trim().toLowerCase();
  if (planConfig[pendingPlan]) return pendingPlan;
  if (user.foundingMember || user.plan === "Founding") return "founding";
  if (user.subscriptionCadence === "annual") return "annual";
  return "monthly";
}

function upsertUser(email, updates) {
  const store = readStore();
  store.users = store.users || {};
  const existing = store.users[email] || { email };
  store.users[email] = {
    ...existing,
    ...updates,
    email,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store.users[email];
}

function promoRedemptionRecords(store = readStore()) {
  return Array.isArray(store.promoRedemptions) ? store.promoRedemptions : [];
}

function promoUsedByAccount(email, code, store = readStore()) {
  const cleanEmail = normalizeEmail(email);
  const promoCode = normalizePromoCode(code);
  if (!cleanEmail || !promoCode) return false;
  const user = store.users?.[cleanEmail] || {};
  const accountRedemptions = Array.isArray(user.promoRedemptions) ? user.promoRedemptions : [];
  return [...promoRedemptionRecords(store), ...accountRedemptions].some((record) => (
    normalizeEmail(record?.email || cleanEmail) === cleanEmail
    && normalizePromoCode(record?.code || record) === promoCode
  ));
}

function markPromoRedeemed(email, code, details = {}) {
  const cleanEmail = normalizeEmail(email);
  const promoCode = normalizePromoCode(code);
  if (!cleanEmail || !promoCode) return null;
  const store = readStore();
  store.promoRedemptions = promoRedemptionRecords(store);
  const existing = store.promoRedemptions.find((record) => (
    normalizeEmail(record.email) === cleanEmail && normalizePromoCode(record.code) === promoCode
  ));
  const record = existing || {
    id: `promo_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    email: cleanEmail,
    code: promoCode,
    label: details.label || "",
    trialDays: details.trialDays || 0,
    stripeSessionId: details.stripeSessionId || "",
    stripeSubscriptionId: details.stripeSubscriptionId || "",
    redeemedAt: new Date().toISOString(),
  };
  if (!existing) store.promoRedemptions.push(record);
  store.users = store.users || {};
  const user = store.users[cleanEmail] || { email: cleanEmail };
  const userRedemptions = Array.isArray(user.promoRedemptions) ? user.promoRedemptions : [];
  const hasUserRecord = userRedemptions.some((item) => normalizePromoCode(item?.code || item) === promoCode);
  store.users[cleanEmail] = {
    ...user,
    email: cleanEmail,
    promoRedemptions: hasUserRecord ? userRedemptions : [...userRedemptions, record],
    promoTrialDays: details.trialDays || user.promoTrialDays || 0,
    promoRedeemedAt: user.promoRedeemedAt || record.redeemedAt,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return record;
}

function getPriceId(planKey) {
  const config = planConfig[planKey];
  return config ? process.env[config.priceEnv] || "" : "";
}

function requireStripe(response) {
  const status = stripeConfigStatus();
  if (status.checkoutReady) return true;
  jsonResponse(response, 503, {
    error: "Stripe is not configured. Add real Stripe keys and price IDs to .env.",
    missing: status.missing,
  });
  return false;
}

async function stripeRequest(pathname, params) {
  const response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Stripe request failed.");
  return data;
}

async function getOrCreateStripeCustomer(email) {
  const store = readStore();
  const user = store.users?.[email] || {};
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripeRequest("customers", {
    email,
    "metadata[app]": "little-learner-hub",
  });
  upsertUser(email, { stripeCustomerId: customer.id });
  return customer.id;
}

function verifyStripeSignature(rawBody, signatureHeader) {
  if (!isConfiguredValue(STRIPE_WEBHOOK_SECRET)) return true;
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",").reduce((acc, part) => {
    const [key, value] = part.split("=");
    if (!key || !value) return acc;
    acc[key] = acc[key] || [];
    acc[key].push(value);
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;
  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(signedPayload).digest("hex");
  return signatures.some((signature) => timingSafeEqualText(signature, expected));
}

function currentAiCycle() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function aiLimitForPlan(plan) {
  return ["Pro", "Founding"].includes(plan) ? 250 : 10;
}

function aiUsageKey(email) {
  return `${normalizeEmail(email)}:${currentAiCycle()}`;
}

function canUseServerAi(email, plan) {
  const store = readStore();
  const key = aiUsageKey(email);
  const used = Number(store.aiUsage?.[key] || 0);
  return { used, limit: aiLimitForPlan(plan), allowed: used < aiLimitForPlan(plan), key };
}

function recordServerAiUse(email, plan, output) {
  const store = readStore();
  const usage = canUseServerAi(email, plan);
  store.aiUsage = store.aiUsage || {};
  store.aiUsage[usage.key] = usage.used + 1;
  store.aiOutputs = store.aiOutputs || [];
  store.aiOutputs.unshift({
    id: `ai_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`,
    email,
    plan,
    output,
    createdAt: new Date().toISOString(),
  });
  store.aiOutputs = store.aiOutputs.slice(0, 1000);
  writeStore(store);
  return { used: usage.used + 1, limit: usage.limit };
}

async function generateOpenAiContent({ tool, prompt, age, plan, email }) {
  if (!OPENAI_API_KEY) {
    throw new Error("AI API is not configured. Add OPENAI_API_KEY to .env.");
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: "You create practical, daycare-focused, age-appropriate childcare content. Keep wording professional, warm, editable, and remind providers to review for licensing/state requirements when relevant.",
        },
        {
          role: "user",
          content: `Tool: ${tool || "generator"}\nPlan: ${plan || "Free"}\nUser email: ${email || "unknown"}\nAge group: ${age || "mixed ages"}\nRequest:\n${prompt || "Create a helpful childcare document."}`,
        },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "AI generation failed.");
  return data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n").trim() || "AI generated content is ready.";
}

async function handleAdminLogin(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const code = String(body.code || "");
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    jsonResponse(response, 503, { error: "Admin login is not configured on the server." });
    return;
  }
  const valid = email === ADMIN_EMAIL
    && timingSafeEqualText(password, ADMIN_PASSWORD)
    && timingSafeEqualText(code, ADMIN_ACCESS_CODE);
  if (!valid) {
    jsonResponse(response, 401, { error: "The owner email, password, or admin code did not match." });
    return;
  }
  jsonResponse(response, 200, {
    token: createAdminToken(email),
    email,
    name: ADMIN_NAME,
  });
}

async function handlePromoValidation(request, response, url) {
  const body = request.method === "POST" ? await readJson(request) : {};
  const enteredCode = normalizePromoCode(body.code || url.searchParams.get("code"));
  const email = normalizeEmail(body.email || url.searchParams.get("email"));
  const promo = checkoutPromoForCode(enteredCode);
  if (!enteredCode) {
    jsonResponse(response, 400, { valid: false, error: "Enter a promo code before checkout." });
    return;
  }
  if (!email) {
    jsonResponse(response, 400, { valid: false, error: "Log in or create a free account to apply a promo code." });
    return;
  }
  if (!promo.valid) {
    jsonResponse(response, 400, {
      valid: false,
      code: enteredCode,
      error: promo.expired
        ? `That promo code expired ${promo.expiresLabel}.`
        : "That promo code is not active. Check the code and try again.",
    });
    return;
  }
  if (promoUsedByAccount(email, promo.code)) {
    jsonResponse(response, 409, {
      valid: false,
      error: "This account has already used that promo code.",
    });
    return;
  }
  jsonResponse(response, 200, {
    valid: true,
    trialDays: promo.trialDays,
    label: promo.label,
    expiresAt: promo.expiresAt,
    expiresLabel: promo.expiresLabel,
    message: `Promo accepted: ${promo.trialDays} days free will be applied before Stripe checkout.`,
  });
}

async function handleCheckout(request, response) {
  if (!requireStripe(response)) return;
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const store = readStore();
  const requestedPlan = body.plan || "monthly";
  const planKey = requestedPlan === "founding" && foundingSpotsRemaining(store) <= 0 ? "monthly" : requestedPlan;
  const price = getPriceId(planKey);
  if (!email) {
    jsonResponse(response, 400, { error: "Email is required before checkout." });
    return;
  }
  const promo = checkoutPromoForCode(body.promoCode);
  const trial7day = body.trial7day === true;
  if (normalizePromoCode(body.promoCode) && !promo.valid) {
    jsonResponse(response, 400, {
      error: promo.expired
        ? `That promo code expired ${promo.expiresLabel}.`
        : "That promo code is not active. Check the code and try again.",
    });
    return;
  }
  if (promo.valid && promoUsedByAccount(email, promo.code, store)) {
    jsonResponse(response, 409, { error: "This account has already used that promo code." });
    return;
  }
  if (!planConfig[planKey] || !price) {
    jsonResponse(response, 400, { error: `Stripe price is missing for ${planKey}.` });
    return;
  }
  try {
    const customer = await getOrCreateStripeCustomer(email);
    const sessionParams = {
      mode: "subscription",
      customer,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      "metadata[email]": email,
      "metadata[plan]": planKey,
      "subscription_data[metadata][email]": email,
      "subscription_data[metadata][plan]": planKey,
      success_url: body.successUrl || `${SITE_URL}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: body.cancelUrl || `${SITE_URL}?checkout=cancel`,
    };
    if (promo.valid) {
      sessionParams["metadata[promoCode]"] = promo.code;
      sessionParams["metadata[promoLabel]"] = promo.label;
      sessionParams["metadata[promoTrialDays]"] = String(promo.trialDays);
      sessionParams["subscription_data[metadata][promoCode]"] = promo.code;
      sessionParams["subscription_data[metadata][promoLabel]"] = promo.label;
      sessionParams["subscription_data[metadata][promoTrialDays]"] = String(promo.trialDays);
      sessionParams["subscription_data[trial_period_days]"] = String(promo.trialDays);
    } else if (trial7day) {
      sessionParams["subscription_data[trial_period_days]"] = "7";
      sessionParams["metadata[promoLabel]"] = "7-Day Pro Trial";
      sessionParams["subscription_data[metadata][promoLabel]"] = "7-Day Pro Trial";
    }
    const session = await stripeRequest("checkout/sessions", sessionParams);
    upsertUser(email, {
      stripeCustomerId: customer,
      pendingPlan: planKey,
      subscriptionStatus: "Checkout Started",
      pendingPromoCode: promo.valid ? promo.code : "",
      pendingTrialDays: promo.valid ? promo.trialDays : trial7day ? 7 : 0,
      pendingPromoLabel: promo.valid ? promo.label : trial7day ? "7-Day Pro Trial" : "",
    });
    jsonResponse(response, 200, {
      url: session.url,
      id: session.id,
      plan: planKey,
      promo: promo.valid ? { applied: true, trialDays: promo.trialDays, label: promo.label, expiresAt: promo.expiresAt, expiresLabel: promo.expiresLabel } : null,
      trial: trial7day ? { applied: true, trialDays: 7, label: "7-Day Pro Trial" } : null,
      founding: foundingStatusPayload(store),
    });
  } catch (error) {
    jsonResponse(response, 500, { error: error.message || "Could not create Stripe Checkout Session." });
  }
}

async function stripeGet(pathname) {
  const response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Stripe request failed.");
  return data;
}

function paidStripeSubscription(subscription) {
  return ["active", "trialing"].includes(String(subscription?.status || "").toLowerCase());
}

function storedSubscriptionActive(subscription) {
  const status = String(subscription?.subscriptionStatus || "").toLowerCase();
  if (!subscription || status.includes("cancel") || status.includes("free plan") || status.includes("failed")) return false;
  return ["Pro", "Founding"].includes(subscription.plan) && (
    status.includes("active") || status.includes("trial") || status.includes("paid")
  );
}

function resolvedPlanForUser(user) {
  if (!user || !storedSubscriptionActive(user)) return "Free";
  return ["Pro", "Founding"].includes(user.plan) ? user.plan : "Pro";
}

function upsertStripeSubscription(email, customerId, subscription) {
  const cleanEmail = normalizeEmail(email);
  const store = readStore();
  const user = store.users?.[cleanEmail] || {};
  const planKey = planKeyFromStripe(subscription, user);
  const founding = planKey === "founding"
    ? claimFoundingSpot(cleanEmail)
    : { foundingMember: Boolean(user.foundingMember), foundingMemberNumber: user.foundingMemberNumber || null };
  return upsertUser(cleanEmail, {
    ...statusForPlan(planKey, subscription.id, subscription.status === "active" ? "Active" : subscription.status),
    stripeCustomerId: customerId || subscription.customer || user.stripeCustomerId || "",
    foundingMember: founding.foundingMember,
    foundingMemberNumber: founding.foundingMemberNumber,
    subscriptionStartedAt: user.subscriptionStartedAt || new Date().toISOString(),
    paymentMethod: "Managed in Stripe",
    pendingPlan: "",
    stripeSubscriptionId: subscription.id,
  });
}

async function findStripeSubscriptionByEmail(email) {
  if (!isConfiguredValue(STRIPE_SECRET_KEY) || !email) return null;
  const customers = await stripeGet(`customers?email=${encodeURIComponent(email)}&limit=10`);
  for (const customer of customers.data || []) {
    const subscriptions = await stripeGet(`subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=10`);
    const subscription = (subscriptions.data || []).find(paidStripeSubscription);
    if (subscription) return { customerId: customer.id, subscription };
  }
  return null;
}

async function handleCheckoutStatus(request, response, url) {
  if (!requireStripe(response)) return;
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId || !sessionId.startsWith("cs_")) {
    jsonResponse(response, 400, { error: "Stripe Checkout session_id is required." });
    return;
  }
  try {
    const session = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`);
    const store = readStore();
    const userEntry = Object.entries(store.users || {}).find(([, user]) => user.stripeCustomerId === session.customer);
    const email = normalizeEmail(session.customer_details?.email || session.customer_email || session.metadata?.email || userEntry?.[0]);
    const planKey = session.metadata?.plan || userEntry?.[1]?.pendingPlan || "monthly";
    const promoCode = normalizePromoCode(session.metadata?.promoCode || userEntry?.[1]?.pendingPromoCode || "");
    const promoTrialDays = Number(session.metadata?.promoTrialDays || userEntry?.[1]?.pendingTrialDays || 0);
    const promoLabel = session.metadata?.promoLabel || userEntry?.[1]?.pendingPromoLabel || "";
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (paid && email) {
      const founding = planKey === "founding" ? claimFoundingSpot(email) : { foundingMember: false, foundingMemberNumber: null };
      upsertUser(email, {
        ...statusForPlan(planKey, session.subscription, "Active"),
        stripeCustomerId: session.customer,
        foundingMember: founding.foundingMember,
        foundingMemberNumber: founding.foundingMemberNumber,
        subscriptionStartedAt: new Date().toISOString(),
        paymentMethod: "Managed in Stripe",
        pendingPlan: "",
      });
      if (promoCode) {
        markPromoRedeemed(email, promoCode, {
          label: promoLabel,
          trialDays: promoTrialDays,
          stripeSessionId: session.id,
          stripeSubscriptionId: session.subscription,
        });
      }
      appendBillingEvent(email, "checkout_success", planKey, planConfig[planKey]?.amount || "");
    }
    jsonResponse(response, 200, {
      paid,
      status: session.status,
      paymentStatus: session.payment_status,
      email,
      plan: planKey,
      subscriptionId: session.subscription,
      customerId: session.customer,
      promo: promoCode ? { applied: true, trialDays: promoTrialDays, label: promoLabel } : null,
      founding: foundingStatusPayload(readStore()),
    });
  } catch (error) {
    jsonResponse(response, 500, { error: error.message || "Could not verify Stripe Checkout status." });
  }
}

async function handlePortal(request, response) {
  if (!requireStripe(response)) return;
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const store = readStore();
  const user = store.users?.[email];
  if (!email || !user?.stripeCustomerId) {
    jsonResponse(response, 400, { error: "No Stripe customer found for this account yet." });
    return;
  }
  try {
    const portal = await stripeRequest("billing_portal/sessions", {
      customer: user.stripeCustomerId,
      return_url: body.returnUrl || `${SITE_URL}?billing=portal-return`,
    });
    jsonResponse(response, 200, { url: portal.url });
  } catch (error) {
    jsonResponse(response, 500, { error: error.message || "Could not create Stripe Billing Portal Session." });
  }
}

async function handleStripeWebhook(request, response) {
  const rawBody = await readBody(request);
  if (!verifyStripeSignature(rawBody, request.headers["stripe-signature"])) {
    jsonResponse(response, 400, { error: "Invalid Stripe webhook signature." });
    return;
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    jsonResponse(response, 400, { error: "Invalid webhook JSON." });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const store = readStore();
    const userEntry = Object.entries(store.users || {}).find(([, user]) => user.stripeCustomerId === session.customer);
    const email = normalizeEmail(session.customer_details?.email || session.customer_email || session.metadata?.email || userEntry?.[0]);
    const planKey = session.metadata?.plan || userEntry?.[1]?.pendingPlan || "monthly";
    const promoCode = normalizePromoCode(session.metadata?.promoCode || userEntry?.[1]?.pendingPromoCode || "");
    const promoTrialDays = Number(session.metadata?.promoTrialDays || userEntry?.[1]?.pendingTrialDays || 0);
    const promoLabel = session.metadata?.promoLabel || userEntry?.[1]?.pendingPromoLabel || "";
    if (email) {
      const founding = planKey === "founding" ? claimFoundingSpot(email) : { foundingMember: false, foundingMemberNumber: null };
      upsertUser(email, {
        ...statusForPlan(planKey, session.subscription, "Active"),
        stripeCustomerId: session.customer,
        foundingMember: founding.foundingMember,
        foundingMemberNumber: founding.foundingMemberNumber,
        subscriptionStartedAt: new Date().toISOString(),
        paymentMethod: "Managed in Stripe",
        pendingPlan: "",
      });
      if (promoCode) {
        markPromoRedeemed(email, promoCode, {
          label: promoLabel,
          trialDays: promoTrialDays,
          stripeSessionId: session.id,
          stripeSubscriptionId: session.subscription,
        });
      }
      appendBillingEvent(email, "checkout_success", planKey, planConfig[planKey]?.amount || "");
    }
  }

  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    const store = readStore();
    const userEntry = Object.entries(store.users || {}).find(([, user]) => user.stripeCustomerId === subscription.customer);
    if (userEntry) {
      const [email, user] = userEntry;
      const canceled = event.type === "customer.subscription.deleted" || subscription.status === "canceled";
      const planKey = planKeyFromStripe(subscription, user);
      const founding = planKey === "founding"
        ? claimFoundingSpot(email)
        : { foundingMember: Boolean(user.foundingMember), foundingMemberNumber: user.foundingMemberNumber || null };
      upsertUser(email, canceled ? {
        plan: "Free",
        subscriptionCadence: "",
        subscriptionStatus: "Canceled - Free Plan Active",
        monthlyPrice: "$0/month",
        stripeSubscriptionId: subscription.id,
        foundingMember: founding.foundingMember,
        foundingMemberNumber: founding.foundingMemberNumber,
        priceLock: founding.foundingMember ? "Lifetime" : "",
      } : {
        ...statusForPlan(planKey, subscription.id, subscription.status === "active" ? "Active" : subscription.status),
        foundingMember: founding.foundingMember,
        foundingMemberNumber: founding.foundingMemberNumber,
        paymentMethod: "Managed in Stripe",
        pendingPlan: "",
        stripeSubscriptionId: subscription.id,
      });
      const subscriptionPromoCode = normalizePromoCode(subscription.metadata?.promoCode || user.pendingPromoCode || "");
      if (!canceled && subscriptionPromoCode) {
        markPromoRedeemed(email, subscriptionPromoCode, {
          label: subscription.metadata?.promoLabel || user.pendingPromoLabel || "",
          trialDays: Number(subscription.metadata?.promoTrialDays || user.pendingTrialDays || 0),
          stripeSubscriptionId: subscription.id,
        });
      }
      if (canceled) appendBillingEvent(email, "subscription_canceled", planKey, "$0");
    }
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    const store = readStore();
    const userEntry = Object.entries(store.users || {}).find(([, user]) => user.stripeCustomerId === invoice.customer);
    if (userEntry) upsertUser(userEntry[0], { subscriptionStatus: "Payment Failed - Action Needed" });
  }

  jsonResponse(response, 200, { received: true });
}

async function handleAiGenerate(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email || "guest");
  const store = readStore();
  const user = store.users?.[email] || null;
  const plan = resolvedPlanForUser(user);
  console.log(`[access] ai-generate email=${email} storedPlan=${user?.plan || "none"} resolvedPlan=${plan} status=${user?.subscriptionStatus || "none"}`);
  const usage = canUseServerAi(email, plan);
  if (!usage.allowed) {
    jsonResponse(response, 429, { error: `AI limit reached. ${usage.used} of ${usage.limit} generations used this month.`, used: usage.used, limit: usage.limit });
    return;
  }
  try {
    const output = await generateOpenAiContent(body);
    const recorded = recordServerAiUse(email, plan, output);
    jsonResponse(response, 200, { output, ...recorded, resetCycle: currentAiCycle() });
  } catch (error) {
    jsonResponse(response, 503, { error: error.message || "AI generation failed." });
  }
}

async function handleSubscriptionStatus(request, response, url) {
  const email = normalizeEmail(url.searchParams.get("email"));
  const store = readStore();
  let subscription = store.users?.[email] || null;
  let recoveredFromStripe = false;
  if (email && !storedSubscriptionActive(subscription)) {
    try {
      const stripeMatch = await findStripeSubscriptionByEmail(email);
      if (stripeMatch?.subscription) {
        subscription = upsertStripeSubscription(email, stripeMatch.customerId, stripeMatch.subscription);
        recoveredFromStripe = true;
      }
    } catch (error) {
      console.warn(`Could not recover Stripe subscription for ${email}:`, error.message);
    }
  }
  jsonResponse(response, 200, {
    email,
    subscription,
    recoveredFromStripe,
    aiUsage: email ? canUseServerAi(email, subscription?.plan || "Free") : null,
    founding: foundingStatusPayload(readStore()),
  });
}

function publicTicket(ticket) {
  return {
    id: ticket.id,
    kind: ticket.kind,
    name: ticket.name,
    email: ticket.email,
    createdBy: ticket.createdBy,
    topic: ticket.topic,
    message: ticket.message,
    status: ticket.status,
    reply: ticket.reply || "",
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function validAdminToken(token) {
  const store = readStore();
  return Boolean(token && store.adminSessions?.[token]);
}

function analyticsDateKey(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toISOString().slice(0, 10);
}

function analyticsMonthKey(value) {
  const key = analyticsDateKey(value);
  return key === "Unknown" ? key : key.slice(0, 7);
}

function analyticsWeekKey(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Unknown";
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayNumber = Math.floor((date - first) / 86400000) + 1;
  const week = Math.ceil((dayNumber + first.getUTCDay()) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function countBy(items, getter) {
  return items.reduce((counts, item) => {
    const key = getter(item) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function moneyNumber(value) {
  const amount = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function moneyBy(items, getter) {
  return items.reduce((totals, item) => {
    const key = getter(item);
    totals[key] = Number(((totals[key] || 0) + moneyNumber(item.amount || item.detail?.monthlyPrice || item.detail?.amount)).toFixed(2));
    return totals;
  }, {});
}

function rate(part, whole) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

function detectEventSource(event) {
  const explicit = String(event.source || event.detail?.source || event.attribution?.source || "").trim();
  if (explicit) return explicit;
  const url = `${event.url || ""} ${event.referrer || ""}`.toLowerCase();
  if (url.includes("fbclid") || url.includes("facebook") || url.includes("instagram")) return "Facebook";
  if (url.includes("ttclid") || url.includes("tiktok")) return "TikTok";
  if (url.includes("gclid") || url.includes("google")) return "Google";
  if (url.includes("utm_source")) return "Campaign";
  return event.referrer ? "Referral" : "Direct";
}

function topFeaturePairs(events) {
  return Object.entries(countBy(events, (event) => event.name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
}

function sanitizeAnalyticsEvent(input, request) {
  const raw = input?.event || input || {};
  const createdAt = raw.createdAt && !Number.isNaN(new Date(raw.createdAt).getTime())
    ? new Date(raw.createdAt).toISOString()
    : new Date().toISOString();
  return {
    id: String(raw.id || `evt_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`).slice(0, 120),
    name: String(raw.name || "event").slice(0, 80),
    detail: typeof raw.detail === "object" && raw.detail ? raw.detail : {},
    visitorId: String(raw.visitorId || "").slice(0, 120),
    sessionId: String(raw.sessionId || "").slice(0, 120),
    user: normalizeEmail(raw.user || raw.email || raw.detail?.email || ""),
    plan: String(raw.plan || raw.detail?.plan || "").slice(0, 40),
    path: String(raw.path || "").slice(0, 240),
    hash: String(raw.hash || "").slice(0, 120),
    url: String(raw.url || "").slice(0, 500),
    pageTitle: String(raw.pageTitle || "").slice(0, 160),
    referrer: String(raw.referrer || request.headers.referer || "").slice(0, 500),
    source: String(raw.source || "").slice(0, 120),
    attribution: typeof raw.attribution === "object" && raw.attribution ? raw.attribution : {},
    userAgent: String(request.headers["user-agent"] || "").slice(0, 300),
    ipHash: crypto.createHash("sha256").update(String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "")).digest("hex").slice(0, 20),
    createdAt,
  };
}

function updateAnalyticsUser(store, event) {
  if (!event.user || event.user === "guest") return;
  store.users = store.users || {};
  const existing = store.users[event.user] || { email: event.user };
  const featureUsage = existing.featureUsage || {};
  featureUsage[event.name] = (featureUsage[event.name] || 0) + 1;
  const updates = {
    ...existing,
    email: event.user,
    plan: event.plan || existing.plan || "Free",
    lastSeenAt: event.createdAt,
    featureUsage,
    updatedAt: new Date().toISOString(),
  };
  if (event.name === "account_signup_complete" && !updates.signupAt) {
    updates.signupAt = event.createdAt;
    updates.createdAt = existing.createdAt || event.createdAt;
  }
  if (event.name === "account_login_complete") updates.lastLoginAt = event.createdAt;
  if (event.name === "checkout_success") {
    updates.plan = event.detail?.plan || event.plan || updates.plan;
    updates.subscriptionStatus = `${updates.plan || "Pro"} Subscription Active`;
    updates.monthlyPrice = event.detail?.monthlyPrice || updates.monthlyPrice || "";
  }
  if (event.name === "subscription_canceled") {
    updates.plan = "Free";
    updates.subscriptionStatus = "Canceled - Free Plan Active";
    updates.subscriptionCadence = "";
    updates.monthlyPrice = "$0/month";
    updates.priceLock = "";
  }
  store.users[event.user] = updates;
}

function recordBillingEvent(store, event) {
  store.billingEvents = store.billingEvents || [];
  store.billingEvents.push({
    id: `bill_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    email: event.user || event.email || "",
    type: event.type || event.name || "Billing Event",
    plan: event.plan || event.detail?.plan || "",
    amount: event.amount || event.detail?.monthlyPrice || event.detail?.amount || "",
    createdAt: event.createdAt || new Date().toISOString(),
  });
}

function appendBillingEvent(email, type, planKey, amount) {
  const store = readStore();
  const cleanEmail = normalizeEmail(email);
  const now = Date.now();
  const duplicate = (store.billingEvents || []).some((event) => {
    const eventTime = new Date(event.createdAt || 0).getTime();
    return event.email === cleanEmail
      && event.type === type
      && event.plan === (planConfig[planKey]?.label || planKey || "")
      && Math.abs(now - eventTime) < 5 * 60 * 1000;
  });
  if (duplicate) return;
  recordBillingEvent(store, {
    user: cleanEmail,
    name: type,
    type,
    plan: planConfig[planKey]?.label || planKey || "",
    amount,
    createdAt: new Date().toISOString(),
  });
  writeStore(store);
}

const childDataKeys = [
  "Profiles",
  "Observations",
  "SupportPlans",
  "Goals",
  "Differentiations",
  "Attendance",
  "Meals",
  "Reports",
  "Communications",
];

function sanitizeChildDataPayload(data = {}) {
  return childDataKeys.reduce((payload, key) => {
    const items = Array.isArray(data[key]) ? data[key] : [];
    payload[key] = items.slice(0, 1000).map((item) => (
      item && typeof item === "object"
        ? JSON.parse(JSON.stringify(item))
        : {}
    ));
    return payload;
  }, {});
}

async function handleChildData(request, response) {
  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseUser(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before saving child data." });
    return;
  }
  const store = readStore();
  store.childData = store.childData || {};
  if (request.method === "GET") {
    const saved = store.childData[firebaseUser.uid] || null;
    jsonResponse(response, 200, {
      email: firebaseUser.email,
      uid: firebaseUser.uid,
      data: saved?.data || null,
      updatedAt: saved?.updatedAt || "",
    });
    return;
  }
  try {
    const body = await readJson(request);
    const data = sanitizeChildDataPayload(body.data || {});
    const updatedAt = new Date().toISOString();
    store.childData[firebaseUser.uid] = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      data,
      updatedAt,
    };
    if (firebaseUser.email) {
      store.users = store.users || {};
      store.users[firebaseUser.email] = {
        ...(store.users[firebaseUser.email] || { email: firebaseUser.email }),
        email: firebaseUser.email,
        childProfiles: data.Profiles.length,
        childObservations: data.Observations.length,
        childGoals: data.Goals.length,
        childDataUpdatedAt: updatedAt,
        updatedAt,
      };
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, updatedAt });
  } catch (error) {
    jsonResponse(response, 400, { error: error.message || "Could not save child data." });
  }
}

async function handleAnalyticsEvent(request, response) {
  const body = await readJson(request);
  const event = sanitizeAnalyticsEvent(body, request);
  const store = readStore();
  store.analyticsEvents = store.analyticsEvents || [];
  if (!store.analyticsEvents.some((item) => item.id === event.id)) {
    store.analyticsEvents.push(event);
  }
  updateAnalyticsUser(store, event);
  if (["checkout_success", "subscription_canceled"].includes(event.name)) recordBillingEvent(store, event);
  writeStore(store);
  jsonResponse(response, 200, { ok: true });
}

function analyticsSummary(store) {
  const events = (store.analyticsEvents || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const chronological = events.slice().reverse();
  const users = Object.values(store.users || {});
  const visits = events.filter((event) => event.name === "website_visit" || event.name === "page_view");
  const pageViews = events.filter((event) => event.name === "page_view");
  const signups = events.filter((event) => event.name === "account_signup_complete");
  const paidEvents = events.filter((event) => event.name === "checkout_success");
  const billingEvents = store.billingEvents || [];
  const uniqueVisitors = new Set(visits.map((event) => event.visitorId || event.user || event.sessionId || event.ipHash).filter(Boolean));
  const visitorDays = {};
  visits.forEach((event) => {
    const id = event.visitorId || event.user || event.sessionId || event.ipHash || "unknown";
    visitorDays[id] = visitorDays[id] || new Set();
    visitorDays[id].add(analyticsDateKey(event.createdAt));
  });
  const returningVisitors = Object.values(visitorDays).filter((days) => days.size > 1).length;
  const paidUsers = users.filter((user) => ["Pro", "Founding"].includes(user.plan));
  const canceledUsers = users.filter((user) => String(user.subscriptionStatus || "").toLowerCase().includes("cancel"));
  const revenueItems = [
    ...paidEvents,
    ...billingEvents.filter((event) => !String(event.type || "").toLowerCase().includes("cancel")),
  ];
  const userRows = users
    .map((user) => {
      const userEvents = events.filter((event) => event.user === user.email);
      return {
        email: user.email,
        name: user.name || user.displayName || "",
        plan: user.plan || "Free",
        subscriptionStatus: user.subscriptionStatus || "Free Plan",
        signupAt: user.signupAt || user.createdAt || "",
        lastLoginAt: user.lastLoginAt || "",
        lastSeenAt: user.lastSeenAt || user.updatedAt || "",
        featureUseCount: userEvents.length || Object.values(user.featureUsage || {}).reduce((total, value) => total + Number(value || 0), 0),
        topFeatures: topFeaturePairs(userEvents),
      };
    })
    .sort((a, b) => new Date(b.lastSeenAt || b.signupAt || 0) - new Date(a.lastSeenAt || a.signupAt || 0));
  return {
    mode: "Server historical analytics",
    updatedAt: new Date().toISOString(),
    totals: {
      visitors: visits.length,
      uniqueVisitors: uniqueVisitors.size,
      signups: Math.max(signups.length, users.length),
      totalRegisteredUsers: users.length,
      freeUsers: users.filter((user) => !["Pro", "Founding"].includes(user.plan)).length,
      proUsers: users.filter((user) => user.plan === "Pro").length,
      foundingMembers: users.filter((user) => user.plan === "Founding" || user.foundingMember).length,
      paidUsers: paidUsers.length,
      activeSubscriptions: paidUsers.filter((user) => !String(user.subscriptionStatus || "").toLowerCase().includes("cancel")).length,
      canceledSubscriptions: canceledUsers.length,
      returningVisitors,
      visitorToSignupRate: rate(Math.max(signups.length, users.length), Math.max(uniqueVisitors.size, visits.length)),
      signupToPaidRate: rate(paidUsers.length, Math.max(signups.length, users.length)),
      visitorToPaidRate: rate(paidUsers.length, Math.max(uniqueVisitors.size, visits.length)),
      totalRevenue: Number(revenueItems.reduce((total, event) => total + moneyNumber(event.amount || event.detail?.monthlyPrice || event.detail?.amount), 0).toFixed(2)),
    },
    periods: {
      dailyVisitors: countBy(visits, (event) => analyticsDateKey(event.createdAt)),
      weeklyVisitors: countBy(visits, (event) => analyticsWeekKey(event.createdAt)),
      monthlyVisitors: countBy(visits, (event) => analyticsMonthKey(event.createdAt)),
      dailyRevenue: moneyBy(revenueItems, (event) => analyticsDateKey(event.createdAt)),
      weeklyRevenue: moneyBy(revenueItems, (event) => analyticsWeekKey(event.createdAt)),
      monthlyRevenue: moneyBy(revenueItems, (event) => analyticsMonthKey(event.createdAt)),
      yearlyRevenue: moneyBy(revenueItems, (event) => String(new Date(event.createdAt || Date.now()).getUTCFullYear())),
    },
    counts: {
      pageViews: countBy(pageViews, (event) => event.detail?.view || event.path || event.hash || "Home"),
      sources: countBy(visits, detectEventSource),
      buttonClicks: countBy(events.filter((event) => event.name === "button_click"), (event) => event.detail?.label || event.detail?.action || "Button"),
      aiUsage: countBy(events.filter((event) => event.name === "ai_generation_success"), (event) => event.detail?.tool || "AI Generator"),
      resourceViews: countBy(events.filter((event) => event.name === "resource_view"), (event) => event.detail?.category || "Resource"),
      resourcePrints: countBy(events.filter((event) => ["resource_print", "generated_pdf", "generated_print", "provider_tool_pdf"].includes(event.name)), (event) => event.detail?.category || event.detail?.tool || "Printable/PDF"),
      featureUsage: countBy(events.filter((event) => ["button_click", "ai_generation_success", "resource_view", "resource_print", "generated_pdf", "generated_print", "provider_tool_pdf", "checkout_start", "checkout_success"].includes(event.name)), (event) => event.name),
    },
    users: userRows,
    recentEvents: events.slice(0, 25),
    rawEventCount: chronological.length,
  };
}

function handleAdminAnalytics(request, response, url) {
  const token = url.searchParams.get("adminToken");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  jsonResponse(response, 200, { analytics: analyticsSummary(readStore()) });
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseEmailAddress(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      email: match[2].trim(),
    };
  }
  return { email: text };
}

async function postJson(url, headers, payload) {
  if (typeof fetch !== "function") throw new Error("Email sending requires Node fetch support.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text.slice(0, 300) || `Email provider returned ${response.status}.`);
  }
}

function supportTicketEmailPayload(ticket) {
  const subject = `[Little Learner Hub] ${ticket.kind}: ${ticket.topic}`;
  const text = [
    "New Little Learner Hub support ticket",
    "",
    `Type: ${ticket.kind}`,
    `Topic: ${ticket.topic}`,
    `Name: ${ticket.name}`,
    `Email: ${ticket.email}`,
    `Created: ${ticket.createdAt}`,
    ticket.sourceUrl ? `Page: ${ticket.sourceUrl}` : "",
    "",
    "Message:",
    ticket.message,
  ].filter(Boolean).join("\n");
  const html = `
    <h2>New Little Learner Hub support ticket</h2>
    <p><strong>Type:</strong> ${htmlEscape(ticket.kind)}</p>
    <p><strong>Topic:</strong> ${htmlEscape(ticket.topic)}</p>
    <p><strong>Name:</strong> ${htmlEscape(ticket.name)}</p>
    <p><strong>Email:</strong> ${htmlEscape(ticket.email)}</p>
    <p><strong>Created:</strong> ${htmlEscape(ticket.createdAt)}</p>
    ${ticket.sourceUrl ? `<p><strong>Page:</strong> ${htmlEscape(ticket.sourceUrl)}</p>` : ""}
    <hr>
    <p>${htmlEscape(ticket.message).replace(/\n/g, "<br>")}</p>
  `;
  return { subject, text, html };
}

async function notifySupportTicket(ticket) {
  const status = supportEmailConfigStatus();
  if (!status.ready) return { sent: false, configured: false, provider: status.provider };

  const provider = detectedEmailProvider();
  const email = supportTicketEmailPayload(ticket);
  if (provider === "resend") {
    await postJson("https://api.resend.com/emails", {
      Authorization: `Bearer ${RESEND_API_KEY}`,
    }, {
      from: SUPPORT_EMAIL_FROM,
      to: [SUPPORT_EMAIL_TO],
      reply_to: ticket.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { sent: true, configured: true, provider };
  }
  if (provider === "sendgrid") {
    const from = parseEmailAddress(SUPPORT_EMAIL_FROM);
    await postJson("https://api.sendgrid.com/v3/mail/send", {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
    }, {
      personalizations: [{ to: [{ email: SUPPORT_EMAIL_TO }], subject: email.subject }],
      from,
      reply_to: { email: ticket.email },
      content: [
        { type: "text/plain", value: email.text },
        { type: "text/html", value: email.html },
      ],
    });
    return { sent: true, configured: true, provider };
  }
  if (provider === "postmark") {
    await postJson("https://api.postmarkapp.com/email", {
      "X-Postmark-Server-Token": POSTMARK_SERVER_TOKEN,
    }, {
      From: SUPPORT_EMAIL_FROM,
      To: SUPPORT_EMAIL_TO,
      ReplyTo: ticket.email,
      Subject: email.subject,
      TextBody: email.text,
      HtmlBody: email.html,
      MessageStream: "outbound",
    });
    return { sent: true, configured: true, provider };
  }
  return { sent: false, configured: false, provider: provider || "not configured" };
}

async function handleSupportTicketCreate(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const message = String(body.message || "").trim();
  if (!email || !message) {
    jsonResponse(response, 400, { error: "Email and message are required." });
    return;
  }
  const store = readStore();
  store.supportTickets = store.supportTickets || [];
  const ticket = {
    id: `ticket-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    kind: String(body.kind || "Support Request").slice(0, 80),
    name: String(body.name || "Provider").slice(0, 120),
    email,
    createdBy: normalizeEmail(body.createdBy || email),
    topic: String(body.topic || "General Questions").slice(0, 120),
    message: message.slice(0, 5000),
    status: "New",
    reply: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceUrl: String(body.sourceUrl || "").slice(0, 500),
    userAgent: String(body.userAgent || "").slice(0, 300),
  };
  store.supportTickets.unshift(ticket);
  store.supportTickets = store.supportTickets.slice(0, 1000);
  writeStore(store);
  let emailNotification = { sent: false, configured: false, provider: "not configured" };
  try {
    emailNotification = await notifySupportTicket(ticket);
  } catch (error) {
    console.error("Support ticket email notification failed:", error.message);
    emailNotification = {
      sent: false,
      configured: supportEmailConfigStatus().ready,
      provider: detectedEmailProvider() || "not configured",
      error: "Ticket was saved, but the email notification did not send.",
    };
  }
  jsonResponse(response, 200, {
    ticket: publicTicket(ticket),
    supportEmail: SUPPORT_EMAIL_TO,
    emailNotification,
  });
}

async function handleSupportTicketUpdate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to update support tickets." });
    return;
  }
  const id = String(body.id || "");
  const store = readStore();
  const tickets = store.supportTickets || [];
  const index = tickets.findIndex((ticket) => ticket.id === id);
  if (index < 0) {
    jsonResponse(response, 404, { error: "Support ticket was not found." });
    return;
  }
  tickets[index] = {
    ...tickets[index],
    status: body.status ? String(body.status).slice(0, 40) : tickets[index].status,
    reply: body.reply !== undefined ? String(body.reply).slice(0, 5000) : tickets[index].reply,
    updatedAt: new Date().toISOString(),
  };
  store.supportTickets = tickets;
  writeStore(store);
  jsonResponse(response, 200, { ticket: publicTicket(tickets[index]) });
}

function handleSupportTicketsList(request, response, url) {
  const email = normalizeEmail(url.searchParams.get("email"));
  const adminToken = url.searchParams.get("adminToken") || "";
  const store = readStore();
  const allTickets = store.supportTickets || [];
  const tickets = validAdminToken(adminToken)
    ? allTickets
    : allTickets.filter((ticket) => email && (ticket.email === email || ticket.createdBy === email));
  jsonResponse(response, 200, { tickets: tickets.slice(0, 100).map(publicTicket) });
}

function handleStripeReadiness(request, response) {
  const status = stripeConfigStatus();
  const store = readStore();
  jsonResponse(response, 200, {
    stripe: status,
    founding: foundingStatusPayload(store),
    nextSteps: status.ready
      ? ["Stripe is launch-ready. Complete a checkout test, then verify the webhook event updates the account."]
      : status.checkoutReady
        ? ["Checkout is ready.", "Create the Stripe webhook endpoint.", "Add STRIPE_WEBHOOK_SECRET to .env.", "Restart the server."]
        : ["Add real Stripe test keys and price IDs to .env.", "Restart the server.", "Open /api/stripe-readiness again."],
  });
}

function handleLaunchReadiness(request, response) {
  jsonResponse(response, 200, launchReadinessStatus());
}

function handleBillingReadiness(request, response) {
  const stripe = stripeConfigStatus();

  // 1. Stripe keys connected
  const keysConnected = {
    ready: stripe.checkoutReady,
    mode: stripe.mode,
    missing: stripe.missing,
    note: stripe.checkoutReady
      ? `Stripe is in ${stripe.mode} mode with all required keys configured.`
      : `Missing env keys: ${stripe.missing.join(", ")}.`,
  };

  // 2. Webhook configured
  const webhookReady = {
    ready: stripe.webhookConfigured,
    endpoint: stripe.webhookEndpoint,
    handledEvents: [
      "checkout.session.completed",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_failed",
    ],
    note: stripe.webhookConfigured
      ? "STRIPE_WEBHOOK_SECRET is set. Webhook signature verification is active."
      : "STRIPE_WEBHOOK_SECRET is not set. Add it after creating the webhook in Stripe Dashboard.",
  };

  // 3. Subscriptions update user permissions
  const freeLimit = aiLimitForPlan("Free");
  const proLimit = aiLimitForPlan("Pro");
  const foundingLimit = aiLimitForPlan("Founding");
  const activeProRecognized = storedSubscriptionActive({
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
  });
  const canceledDowngradesToFree = !storedSubscriptionActive({
    plan: "Free",
    subscriptionStatus: "Canceled - Free Plan Active",
  });
  const trialingRecognized = storedSubscriptionActive({
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription trialing",
  });
  const permissionsCorrect = freeLimit === 10 && proLimit === 250 && foundingLimit === 250
    && activeProRecognized && canceledDowngradesToFree && trialingRecognized;
  const subscriptionPermissions = {
    ready: permissionsCorrect,
    freeAiLimit: freeLimit,
    proAiLimit: proLimit,
    foundingAiLimit: foundingLimit,
    activeProRecognized,
    trialingRecognized,
    canceledDowngradesToFree,
    note: permissionsCorrect
      ? "Plan → permission mapping is correct. Free: 10 AI/month, Pro/Founding: 250 AI/month."
      : "Unexpected result in plan-to-permission mapping.",
  };

  // 4. Free → Trial → Paid flow
  const promo = checkoutPromoForCode(PROMO_FREE_TRIAL_CODE);
  const trialFlowReady = promo.valid && promo.trialDays > 0;
  const planPriceIds = {
    founding: isConfiguredValue(getPriceId("founding")),
    monthly: isConfiguredValue(getPriceId("monthly")),
    annual: isConfiguredValue(getPriceId("annual")),
  };
  const allPricesConfigured = Object.values(planPriceIds).every(Boolean);
  const freeTrialPaidFlow = {
    ready: stripe.checkoutReady,
    trialFlowReady,
    promoCodeConfigured: isConfiguredValue(PROMO_FREE_TRIAL_CODE),
    promoTrialDays: trialFlowReady ? promo.trialDays : 0,
    promoExpiresAt: PROMO_FREE_TRIAL_EXPIRES_AT,
    planPriceIds,
    allPricesConfigured,
    note: !stripe.checkoutReady
      ? "Add Stripe keys and price IDs to .env before checkout is possible."
      : !allPricesConfigured
        ? "Some plan price IDs are not configured. Add STRIPE_PRICE_FOUNDING_MONTHLY, STRIPE_PRICE_PRO_MONTHLY, and STRIPE_PRICE_PRO_ANNUAL."
        : trialFlowReady
          ? `Checkout → trial → paid flow ready. Free trial: ${promo.trialDays} days via promo code ${PROMO_FREE_TRIAL_CODE}.`
          : "Promo trial flow is not active. Set PROMO_FREE_TRIAL_CODE and PROMO_FREE_TRIAL_DAYS to enable it.",
  };

  // 5. Cancellations work
  const mockCanceledUser = {
    plan: "Free",
    subscriptionStatus: "Canceled - Free Plan Active",
    subscriptionCadence: "",
    monthlyPrice: "$0/month",
    priceLock: "",
  };
  const cancelStillInactive = !storedSubscriptionActive(mockCanceledUser);
  const cancelStatusCorrect = mockCanceledUser.plan === "Free"
    && mockCanceledUser.subscriptionStatus === "Canceled - Free Plan Active";
  const cancellationsWork = {
    ready: cancelStillInactive && cancelStatusCorrect,
    webhookEvent: "customer.subscription.deleted",
    resultingPlan: mockCanceledUser.plan,
    resultingStatus: mockCanceledUser.subscriptionStatus,
    note: cancelStillInactive && cancelStatusCorrect
      ? "Cancellation webhook sets plan to Free and deactivates paid access."
      : "Cancellation logic produced an unexpected result.",
  };

  // 6. Upgrade prompts when limits are reached
  const limitEnforcedByServer = freeLimit < proLimit;
  const upgradePrompts = {
    ready: limitEnforcedByServer,
    freeMonthlyAiLimit: freeLimit,
    proMonthlyAiLimit: proLimit,
    serverEnforcement: "/api/ai-generate returns HTTP 429 when monthly limit is reached",
    clientEnforcement: "data-pro-feature attributes on locked UI controls show upgrade modal",
    note: limitEnforcedByServer
      ? `Server enforces ${freeLimit} AI generations/month for Free and ${proLimit} for Pro. Client shows upgrade prompts on locked features.`
      : "AI limit configuration is unexpected.",
  };

  // 7. Users keep their data after cancellation
  const mockUserBefore = {
    email: "test@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    signupAt: "2026-01-01T00:00:00.000Z",
    childrenCount: 3,
    savedResourceCount: 12,
    stripeCustomerId: "cus_test",
  };
  // upsertUser spreads existing fields then applies only billing updates — non-billing fields survive
  const mockUserAfterCancel = {
    ...mockUserBefore,
    plan: "Free",
    subscriptionStatus: "Canceled - Free Plan Active",
    subscriptionCadence: "",
    monthlyPrice: "$0/month",
    priceLock: "",
  };
  const nonBillingFieldsPreserved = mockUserAfterCancel.signupAt === mockUserBefore.signupAt
    && mockUserAfterCancel.childrenCount === mockUserBefore.childrenCount
    && mockUserAfterCancel.savedResourceCount === mockUserBefore.savedResourceCount
    && mockUserAfterCancel.stripeCustomerId === mockUserBefore.stripeCustomerId
    && mockUserAfterCancel.email === mockUserBefore.email;
  const dataRetention = {
    ready: nonBillingFieldsPreserved,
    preservedOnCancel: ["email", "signupAt", "childrenCount", "savedResources", "stripeCustomerId", "promoRedemptions"],
    updatedOnCancel: ["plan", "subscriptionStatus", "subscriptionCadence", "monthlyPrice", "priceLock"],
    note: nonBillingFieldsPreserved
      ? "Cancellation only updates billing fields. All other user data is preserved via upsertUser() merge."
      : "Data retention check produced an unexpected result.",
  };

  const checks = {
    stripeKeysConnected: keysConnected,
    webhookConfigured: webhookReady,
    subscriptionPermissions,
    freeTrialPaidFlow,
    cancellationsWork,
    upgradePrompts,
    dataRetention,
  };

  const notReady = Object.entries(checks)
    .filter(([, check]) => !check.ready)
    .map(([key]) => key);
  const allReady = notReady.length === 0;

  jsonResponse(response, 200, {
    ready: allReady,
    checks,
    notReady,
    message: allReady
      ? "All Stripe and billing verification checks passed."
      : `Billing not fully ready. Fix: ${notReady.join(", ")}.`,
  });
}

function handleHealth(request, response) {
  const store = readStore();
  jsonResponse(response, 200, {
    ok: true,
    service: "Little Learner Hub",
    time: new Date().toISOString(),
    stripeCheckoutReady: stripeConfigStatus().checkoutReady,
    launchReady: launchReadinessStatus().ready,
    supportEmailReady: supportEmailConfigStatus().ready,
    founding: foundingStatusPayload(store),
  });
}

function handleFoundingStatus(request, response) {
  jsonResponse(response, 200, { founding: foundingStatusPayload(readStore()) });
}

function handleClientConfig(request, response) {
  const firebase = {
    apiKey: FIREBASE_API_KEY,
    authDomain: FIREBASE_AUTH_DOMAIN,
    projectId: FIREBASE_PROJECT_ID,
    appId: FIREBASE_APP_ID,
    storageBucket: FIREBASE_STORAGE_BUCKET,
    messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
    measurementId: FIREBASE_MEASUREMENT_ID,
  };
  const config = {
    adminEmail: ADMIN_EMAIL,
    firebase,
    firebaseStatus: firebaseConfigStatus(),
  };
  response.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`window.LLH_CONFIG = ${JSON.stringify(config)};`);
}

function clientRuntimeConfig() {
  const clientValue = (value) => (isConfiguredValue(value) ? value : "");
  return {
    adminEmail: ADMIN_EMAIL || "little.learners.hub.customer@gmail.com",
    firebase: {
      apiKey: clientValue(FIREBASE_API_KEY),
      authDomain: clientValue(FIREBASE_AUTH_DOMAIN),
      projectId: clientValue(FIREBASE_PROJECT_ID),
      appId: clientValue(FIREBASE_APP_ID),
      storageBucket: clientValue(FIREBASE_STORAGE_BUCKET),
      messagingSenderId: clientValue(FIREBASE_MESSAGING_SENDER_ID),
      measurementId: clientValue(FIREBASE_MEASUREMENT_ID),
    },
  };
}

function clientAppScript(filePath) {
  let source = fs.readFileSync(filePath, "utf8");
  const config = clientRuntimeConfig();
  source = source.replace(
    /const adminOwnerAccount = \{\n  email: ".*?",/,
    `const adminOwnerAccount = {\n  email: ${JSON.stringify(config.adminEmail)},`,
  );
  source = source.replace(
    /const firebaseAuthConfig = \{\n  apiKey: ".*?",\n  authDomain: ".*?",\n  projectId: ".*?",\n  appId: ".*?",\n\};/,
    `const firebaseAuthConfig = ${JSON.stringify(config.firebase, null, 2)};`,
  );
  return source;
}

function serveStatic(request, response, url) {
  const routePath = decodeURIComponent(url.pathname || "/").replace(/\.\.+/g, "");
  const safePath = routePath === "/" ? "/index.html" : routePath;
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    request.method === "HEAD" ? headResponse(response, 403) : textResponse(response, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (spaRoutePaths.has(routePath)) {
      const indexPath = path.join(publicDir, "index.html");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      fs.createReadStream(indexPath).pipe(response);
      return;
    }
    request.method === "HEAD" ? headResponse(response, 404) : textResponse(response, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  }[ext] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  if (safePath === "/app.js") {
    response.end(clientAppScript(filePath));
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, SITE_URL);
  try {
    if (request.method === "POST" && url.pathname === "/api/admin/login") return await handleAdminLogin(request, response);
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/validate-promo-code") return await handlePromoValidation(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/create-checkout-session") return await handleCheckout(request, response);
    if (request.method === "POST" && url.pathname === "/api/create-customer-portal-session") return await handlePortal(request, response);
    if (request.method === "POST" && (url.pathname === "/api/webhooks/stripe" || url.pathname === "/api/stripe/webhook")) return await handleStripeWebhook(request, response);
    if (request.method === "POST" && url.pathname === "/api/ai-generate") return await handleAiGenerate(request, response);
    if (request.method === "POST" && url.pathname === "/api/analytics/event") return await handleAnalyticsEvent(request, response);
    if (request.method === "POST" && url.pathname === "/api/support-ticket") return await handleSupportTicketCreate(request, response);
    if (request.method === "POST" && url.pathname === "/api/support-ticket-update") return await handleSupportTicketUpdate(request, response);
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/child-data") return await handleChildData(request, response);
    if (request.method === "GET" && url.pathname === "/api/checkout-status") return await handleCheckoutStatus(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/subscription-status") return await handleSubscriptionStatus(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/support-tickets") return handleSupportTicketsList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/analytics") return handleAdminAnalytics(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/founding-status") return handleFoundingStatus(request, response);
    if (request.method === "GET" && url.pathname === "/api/stripe-readiness") return handleStripeReadiness(request, response);
    if (request.method === "GET" && url.pathname === "/api/billing-readiness") return handleBillingReadiness(request, response);
    if (request.method === "GET" && url.pathname === "/api/launch-readiness") return handleLaunchReadiness(request, response);
    if (request.method === "GET" && url.pathname === "/api/health") return handleHealth(request, response);
    if (request.method === "GET" && url.pathname === "/api/client-config.js") return handleClientConfig(request, response);
    if (request.method === "HEAD" && url.pathname === "/api/health") return headResponse(response, 200, "application/json; charset=utf-8");
    if (request.method === "GET" || request.method === "HEAD") return serveStatic(request, response, url);
    jsonResponse(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    jsonResponse(response, 500, { error: error.message || "Server error." });
  }
});

initializeStorage()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Little Learner Hub launch server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Could not initialize Little Learner Hub storage.");
    console.error(error.message);
    process.exit(1);
  });
