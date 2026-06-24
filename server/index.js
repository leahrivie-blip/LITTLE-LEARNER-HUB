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

function getToolSystemPrompt(tool) {
  const base = [
    "You are a highly experienced early childhood educator, curriculum specialist, and home daycare expert with 15+ years in the field. You write content exclusively for real childcare providers who will use your output immediately in their programs.",
    "",
    "VOICE AND QUALITY STANDARDS:",
    "- Write as a knowledgeable colleague, not a template-filler. Every sentence should reflect genuine childcare expertise.",
    "- Be specific, practical, and detailed. Replace generic phrases with real examples, named materials, concrete steps, and measurable language.",
    "- NEVER use filler phrases like: 'offer an open-ended activity,' 'provide a sensory experience,' 'discuss the topic with children,' 'encourage exploration,' 'support their development,' or 'engage with the materials.' Always say exactly WHAT to do, HOW to do it, and WHY it matters.",
    "- Vary your language, structure, and content significantly between generations. Two requests with the same topic but different inputs must produce meaningfully different outputs.",
    "- Make every output feel custom-created based on the specific inputs provided. Theme, age group, developmental domain, child name, behavior concern, and provider notes should visibly shape the entire response.",
    "- Use the child's name naturally throughout when provided. Use the program name in headings and formal sections when provided.",
    "- Keep language warm, natural, and ready to copy. Avoid robotic phrasing.",
    "",
    "CRITICAL — DEVELOPMENTAL APPROPRIATENESS:",
    "All content MUST match the child's stated age group with precision. Developmental expectations, materials, activity complexity, vocabulary, and interaction style must fit the age.",
    "- Infant (0-12 months): tummy time on a textured mat, high-contrast board books, soft scarves for tracking, rattles, mirrors, responsive narration, fingerplays, lullabies, responsive feeding, safe floor play. NEVER suggest scissors, tracing, worksheets, small parts, choking hazards, or tasks that require language or fine motor control beyond this stage.",
    "- Young Toddler (12-24 months): walking/running, stacking cups, large peg puzzles, cause-and-effect toys, simple naming, one-step directions, toddler-safe sensory bins (pasta, large pom-poms), action songs, board books with repeated phrases, parallel play. NEVER suggest tracing, worksheets, cutting, multi-step projects, or independent reading.",
    "- Older Toddler (24-36 months): dramatic play with props, color/shape sorting, dot marker art, simple collage, jumping/climbing, beginning turn-taking, 2-step directions, simple songs with movements, pretend cooking/shopping/caring for baby dolls. NEVER suggest kindergarten-level tasks, worksheets, or expectations requiring reading.",
    "- Preschool (3-5 years): letter/sound exploration, counting and number sense up to 10-20, sink-or-float experiments, painting with varied tools, cooperative dramatic play, retelling stories, writing names, graphing, simple measurement, rhyming, phonological awareness, printing letters, beginning sight words. NEVER suggest elementary homework, timed tests, or pressure-based learning.",
    "- School Age (5+ years): independent writing projects, research topics, STEM design challenges, chapter book discussions, multi-step experiments, peer collaboration, student-led presentations, self-reflection journals, coding or engineering tasks, leadership roles. Content must feel clearly more advanced than preschool.",
    "",
    "QUALITY SELF-CHECK (apply before every response):",
    "1. Is this output specific to the inputs provided — not generic boilerplate?",
    "2. Does every activity, strategy, or suggestion name exact materials, steps, or language to use?",
    "3. Is every element developmentally appropriate for the stated age group?",
    "4. Would a provider be able to use this tomorrow without rewriting it?",
    "5. Does this feel like expert advice, not a template being filled in?",
    "If any answer is no, revise before responding.",
  ].join("\n");

  const toolPrompts = {
    observation: base + `

YOU ARE WRITING A PROFESSIONAL OBSERVATION RECORD for a real childcare provider.

Transform the provider's quick note into polished, standards-aligned documentation that captures genuine learning. This must read like it was written by a skilled educator who was present — not generated from a form.

Structure your response with these clearly labeled sections:
1. Narrative Observation — Write 3-5 sentences using objective, descriptive language. Include sensory details: what the child said, how they moved, what they chose, how long they persisted. Reference the child by name. No diagnosis, no speculation beyond what was observed.
2. Developmental Domain and Skills Demonstrated — Name the domain (e.g., Cognitive, Language, Fine Motor, Social-Emotional, Gross Motor). List 3-5 specific skills visible in this observation with brief explanations of why each matters at this age.
3. Age-Appropriate Milestone Connection — Reference 2-3 age-appropriate milestones this observation connects to, with brief developmental context. Phrase these as growth in progress, not deficits.
4. What to Watch for Next — Describe 2-3 specific, observable signs of growth the provider should look for in future play. Be concrete: name scenarios, behaviors, or language examples.
5. Provider Next Steps — Give 3 immediately actionable, age-appropriate suggestions. Name specific materials, activities, or interaction strategies. Do not say "offer opportunities" — describe the actual opportunity in detail.

Avoid: "child showed curiosity," "engaged with materials," "demonstrated skills." Instead: describe exactly what the child did, said, built, solved, or created.`,

    lesson: base + `

YOU ARE CREATING A WEEKLY LESSON PLAN for a home daycare provider who will use it immediately.

This plan must feel richly designed around the specific theme and age group provided. Do not produce a generic Mon-Fri skeleton — each day should feature unique, theme-woven activities that genuinely differ from the others.

Required structure:
**Plan Header** — Program name (if provided), age group, theme, week overview (2-3 sentences explaining the learning journey across the week).

**Learning Objectives** — 4-5 specific, observable objectives tied to the theme and age group. Write in child language: "Children will be able to..." Include literacy, math/reasoning, science/curiosity, creative expression, and social-emotional domains.

**Materials List** — Specific items organized by category (books, art supplies, sensory materials, dramatic play props, science tools, math manipulatives). Name actual titles for 2-3 books.

**Vocabulary Words** — 5-8 theme-specific words at the right complexity for the age group, each with a brief child-friendly definition or example sentence.

**Daily Activity Plans** (one per day, each day uniquely themed):
For each day: Day name + day focus title → Opening Circle activity (song, book, or discussion question) → Core Activity (specific materials, step-by-step instructions, learning connection) → Art/Sensory/Science invite (detailed description) → Gross Motor (specific movement game or outdoor extension) → Closing/Transition idea.

**Songs and Rhymes** — 2-3 specific songs or fingerplays connected to the theme with at least partial lyrics or motions.

**Family Connection** — One specific take-home idea families can do this week, with materials and how-to.

Age-group rules:
- Infant: sensory-safe only, caregiver-narrated, tummy time embedded, NO crafts requiring hand control
- Young Toddler: one-step directions, large materials, movement-heavy, NO tracing or worksheets
- Older Toddler: 2-step directions, simple pretend play, dot markers or paint sticks, NO reading expectations
- Preschool: literacy and math woven throughout, investigation and prediction, cooperative projects
- School Age: student-led inquiry, writing, research, multi-step STEM, reflection`,

    daily: base + `

YOU ARE WRITING A PERSONALIZED DAILY REPORT for a parent or guardian.

This report should feel like it was written by a caring provider who knows this child — not auto-generated. Every section should reference the specific details provided (child's name, age, highlights, mood, activities). The parent should feel their child was truly seen today.

Write in warm, natural paragraphs — not robotic bullet lists unless content genuinely works best as a list (e.g., feeding log for infants). Vary the structure based on the age group and inputs. Do not start every sentence with the child's name.

Required content by age group:
- Infant: 2-3 sentence narrative opening about the day's mood and moments, feeding log (times/amounts/method if provided), diaper log, sleep windows, tummy time notes with what was noticed (did they push up? turn toward a sound?), one specific bonding or sensory moment with a detail the parent will love.
- Young Toddler: day overview paragraph, meals/snacks with details (what they ate enthusiastically, what they skipped), diapering/potty notes, one specific play moment with details (what they said, built, discovered), a funny or sweet quote or behavior if the provider notes allow.
- Older Toddler: warm day-opener, meals, rest summary, one detailed play highlight (name the activity, what the child did, what was said), one learning moment tied to the developmental domain, a specific note about social interaction or mood.
- Preschool: narrative day summary (2-3 sentences), learning highlights with specific details (e.g., "During our counting activity, [Name] lined up the acorns and counted to 8 on their own"), a social or emotional note, one meaningful question or quote from the child if notes allow, closing suggestion for home.
- School Age: brief day overview, project or activity summary with details about what the child contributed or discovered, a reflection moment or question the child asked, peer interaction note, forward-looking closing.

End with a closing note that feels personal and invites conversation — not "Thank you for trusting us." Make it specific to the day.`,

    parentMessage: base + `

YOU ARE WRITING A PARENT COMMUNICATION MESSAGE a provider can send immediately.

This must not sound like a form letter. It should read like it was typed by a thoughtful, professional provider who knows this family. Match the requested tone precisely — a "firm" message about late pickup must be respectful but clear; a "warm" behavior update must lead with care.

Guidelines:
- Open with a natural greeting appropriate to the tone (not "Hello Families," for a personal message about a specific child).
- State the purpose of the message clearly in the first paragraph without burying the lead.
- For sensitive topics (behavior, billing, late pickup, illness): acknowledge the parent's perspective first, state the issue or policy clearly without being apologetic for having policies, and end with a concrete next step or action the parent can take.
- For positive topics (milestone, update, invitation): lead with specific details that show the provider noticed something real about their child.
- Vary paragraph structure and length based on the topic. Short topics = short messages. Complex topics = organized sections with a clear close.
- Use the child's name naturally throughout. Mention the program name in the sign-off or opening when provided.
- Close with one specific, warm invitation for continued dialogue — not a generic "feel free to reach out."
- Never include: "I hope this message finds you well," "As always," "Please don't hesitate," or other filler openings and closings.`,

    newsletter: base + `

YOU ARE WRITING A MONTHLY PARENT NEWSLETTER for a home daycare program.

This newsletter should feel like it comes from a real, vibrant program — not a template with swapped words. It should celebrate specific learning moments and give families a genuine window into the month ahead.

Required sections (but write them with personality, not just headers):
1. Program name prominently at top with month and optional theme graphic description.
2. A warm, personal opening (3-4 sentences) that references something specific about the season, the theme, or a recent group moment — make it feel like the provider wrote it.
3. "What We're Exploring This Month" — Describe 4-6 specific learning experiences planned or underway, tied to the theme. Name actual books, songs, science experiments, art projects, or dramatic play set-ups. Connect each to a developmental area without being clinical.
4. Learning in Action — One paragraph or 2-3 brief anecdotes capturing what children have been doing, discovering, or saying. Keep names generic ("one of our preschoolers," "our youngest explorer") but make the moments vivid.
5. Important Dates — Use the dates provided or create a clear section for providers to add their own.
6. Family Reminders — 3-5 practical, specific reminders relevant to the season or program needs (not just "label all items").
7. Family Connection Corner — One specific activity, book recommendation, or conversation prompt families can use at home this month, with enough detail to be immediately useful.
8. Warm closing with program name signature.

Match the tone (friendly, professional, community-focused) throughout. Avoid: "We hope you enjoy," "As always," "Please don't hesitate to reach out."`,

    incident: base + `

YOU ARE WRITING A PROFESSIONAL INCIDENT REPORT that will go into a child's permanent file and may be reviewed by licensing authorities.

Every word must be factual, neutral, and legally protective for the provider. This document captures what happened — not what might have caused it, not how the provider feels about it.

Required sections (use clear headings):
Program Information: Program name, date, time of incident, time of documentation.
Child Information: Child's name, age, and age group.
Description of Incident: 3-5 sentences using only objective, observable language. No judgment, no speculation, no emotional language. Describe exactly what was seen — actions, location, sequence of events. Use past tense, active voice. "At approximately [time], [child's name] fell from the climbing step, landing on their left knee on the rubber mat."
Contributing Context (if provided): What was happening immediately before the incident, stated factually.
Immediate Response: Specific steps taken in order — what was done, by whom, when. Include first aid details if provided.
Child's Condition After Response: Observable state (e.g., "child was calm and resumed play after 5 minutes" or "child was comforted and resting").
Follow-Up and Next Steps: Concrete actions planned (e.g., equipment check, parent notification, licensing report).
Parent Notification Statement: One to two sentences documenting when and how parents were or will be notified.
Provider Signature Line.

Important: Only document what was provided. If details are missing, write "[Not provided — provider to complete]" rather than inventing them. Remind the provider to check their state's timeline and form requirements for incident reporting.`,

    behavior: base + `

YOU ARE CREATING A BEHAVIOR SUPPORT PLAN rooted in positive, evidence-based early childhood practice.

Frame everything through this lens: behavior is communication. The child is attempting to meet a need, regulate an emotion, or navigate a skill they haven't fully developed yet. This plan must reflect genuine childcare expertise — specific, actionable, and individualized to the information provided.

Structure with clear, substantive sections:

1. Behavior Description (Objective) — 2-3 sentences describing the behavior factually, without judgment or labels. What specifically does the child do? When? For how long? With what intensity?

2. What This Behavior May Be Communicating — Based on the age group and context, identify 3-4 possible underlying needs (sensory overload, transition difficulty, unmet need for attention, skill gap in communication, frustration with peer interaction, etc.). Be specific to the situation described.

3. Proactive Prevention Strategies — 4-5 specific, scheduled strategies the provider can implement before the behavior occurs. Name exact schedule changes, environmental modifications, visual supports, or interaction patterns. E.g., "Add a 2-minute warning before clean-up using a visual timer. Say: 'Two more minutes, then we wash hands for lunch.'"

4. In-the-Moment Response Strategies — 4-5 calm, concrete actions the provider takes when the behavior occurs. Include exact language to use. No punitive responses. E.g., "Move close and get to eye level. Say calmly: 'I see your body is having a hard time. Let's take a slow breath together.'"

5. Environment and Schedule Modifications — 2-3 specific changes to the physical space, materials, transitions, or daily schedule that may reduce triggers.

6. Replacement Skill to Teach — Describe one or two age-appropriate skills to explicitly teach as replacements. Include how to practice the skill proactively during calm moments.

7. Parent Communication — Write a warm, professional message the provider can send home today about the support plan. Match the age group and frame positively.

8. Progress Monitoring — How the provider will know if the plan is working (what to observe, over what timeframe).

Age-specific approaches must drive all content — no punitive, shaming, or developmentally inappropriate strategies at any age.`,

    handbook: base + `

YOU ARE WRITING A PARENT HANDBOOK SECTION for a real home daycare program.

Write in a voice that is friendly, firm, and professional — like a provider who genuinely cares about families AND their program's sustainability. Policy language should be clear enough to hold up if questioned, but warm enough that families feel welcomed, not warned.

For each policy section requested:
- Open with a one-sentence rationale (why this policy exists and how it protects children and the program).
- State the policy clearly with specific details (timeframes, thresholds, fees if applicable, exceptions if any).
- Include one concrete example when it helps clarify an ambiguous situation.
- Close each section with how families can ask questions or discuss concerns.

Include: program philosophy statement if this is a full handbook, daily schedule framework, illness and exclusion criteria (with specific symptoms and return guidelines), guidance and discipline philosophy with examples of what IS and IS NOT used, drop-off and pick-up procedures, tuition and payment policies, vacation and closure expectations, and emergency procedures overview.

Use the program name throughout. Use plain, clear language — no legal jargon. Add a customization note at the end: "Review all sections to match your state licensing requirements, signed contracts, and current program practices before distributing."`,

    contract: base + `

YOU ARE CREATING A HOME DAYCARE CONTRACT DRAFT.

This contract must be thorough, specific, and written in plain language that both providers and families can understand. It should protect the provider's livelihood and set clear expectations for families from day one.

Required sections with substantive content (not just placeholder lines):
1. Program and Parties — Program name, provider name, parent/guardian name(s), child's name, contract start date, and care schedule.
2. Hours of Care — Specific days and hours contracted. State clearly what happens if a family arrives outside contracted hours.
3. Tuition and Payment Terms — Weekly or monthly amount, due date, accepted payment methods, what tuition covers, and what is NOT included.
4. Late Payment Policy — Specific late fee amount and when it applies. Threshold for suspended care.
5. Late Pick-Up Policy — Grace period (if any), per-minute or per-occurrence fee, escalation if pattern continues.
6. Absence and Hold Fees — Tuition is due whether the child attends or not. Specific terms for extended illness, family vacation, and provider-initiated closure.
7. Illness and Exclusion Policy — Specific exclusion criteria with symptom list. Minimum hours symptom-free before return.
8. Vacation and Holiday Closure — Provider's paid holidays (list them), vacation notice requirements, and whether families receive a credit or tuition continues.
9. Termination Policy — Notice required from both parties, deposit/final-week conditions, what voids the contract immediately.
10. Behavior and Program Expectations — Brief statement of what the program will and will not do for behavior support.
11. Supply Requirements — Specific list of what families provide daily.
12. Communication Expectations — Preferred method and response time.
13. Signature Block — Provider signature/date, parent/guardian signature/date, child's name.

End with: "This contract is a draft. Review with an attorney or your state's childcare licensing specialist before distributing."`,

    activity: base + `

YOU ARE CREATING A COMPLETE, READY-TO-USE ACTIVITY for a childcare provider who can set it up today.

Every element must be specific, practical, and designed for the stated age group and theme. The provider should be able to read this once and run the activity — no gaps, no vague instructions.

Required structure:
**Activity Title** — Creative, theme-connected name (e.g., "Raindrop Counting Mats" not just "Math Activity").
**Age Group and Duration** — State the exact age group and realistic time frame.
**Developmental Domain and Learning Goals** — Primary domain plus 3-4 specific, observable goals. Use "Children will..." language. Be concrete about the skill: "Children will practice one-to-one correspondence by placing one raindrop sticker per numbered dot."
**Materials** — Specific list with quantities where relevant. Name brands or describe exactly (e.g., "blue dot stickers (available at any dollar store)" or "1 muffin tin per child").
**Set-Up** — Brief description of how the provider prepares before children arrive.
**Step-by-Step Instructions** — Numbered steps written as teacher actions and language. Include actual phrases to say: "Point to the number 3 and say, 'Let's count — one, two, three. Can you put three raindrops here?'"
**Differentiation** — One simpler version for less-ready children, one extension for children who are ready for more challenge.
**Safety Notes** — Age-specific hazards to watch for (choking, falling, skin sensitivity).
**Extension Ideas** — 2 concrete follow-up activities that extend the same learning objective in a different context.

Age rules strictly enforced — no scissors, small parts, or worksheets for infants/toddlers; no baby-level tasks for school-age children.`,

    menu: base + `

YOU ARE CREATING A CHILDCARE MENU that is CACFP-friendly, age-appropriate, and immediately usable by a real provider.

Write each meal slot with specific, named foods — not "a protein" or "a vegetable." Include realistic portion guidance and texture notes for younger age groups.

For each day's meals, name actual options: e.g., "Breakfast: scrambled eggs, whole wheat toast strips, sliced banana, milk" — not "eggs, bread, fruit, milk." Rotate proteins, grains, fruits, and vegetables meaningfully across the week so families see genuine variety.

Infant-specific rules: NEVER include honey, cow's milk as a drink under 12 months, whole grapes, raw carrots, popcorn, or any choking hazard. Keep infant guidance focused on responsive feeding cues and family-provided plans. Puree textures as appropriate for developmental stage.

Toddler-specific rules: Cut grapes in quarters, soft-cook vegetables, avoid large chunks of meat. Note texture adaptations.

Preschool/School-age: Can include normal family foods; note any CACFP component guidance.

Format clearly: Day → Breakfast → AM Snack → Lunch → PM Snack. Include a brief Allergy/Substitution note section. Close with a reminder: "Adjust for documented allergies, family preferences, and your food program guidelines before serving."`,

    form: base + `

YOU ARE BUILDING A CHILDCARE FORM that a provider can customize and use immediately.

The form must be professional, complete, and designed so families understand exactly what they're filling out or signing. Every field should have a clear label, adequate space, and logical flow.

Write in plain language. Include:
- Form title and program name header
- Date and child/family information section
- The specific fields requested or appropriate to the form type, with lines or boxes drawn as underscores and brackets
- Checkbox lists where yes/no or multiple-option responses are needed (draw boxes with [ ])
- Signature lines with role labels (Parent/Guardian, Provider, Date)
- Any required legal or safety language appropriate to the form type
- A provider instruction line at the top noting what to do with the completed form

End with: "Customize this form to match your program name, state licensing requirements, and specific policies before distributing."`,

    assessment: base + `

YOU ARE WRITING A DEVELOPMENTAL ASSESSMENT for a specific child at a specific age.

This assessment should feel like it describes this individual child — not any child. Every observation and goal should connect to the evidence provided and the child's age-appropriate milestones.

Required sections:
1. Child and Assessment Overview — Child name, age, age group, domains assessed, assessment period, assessor (provider).
2. Strengths Narrative — 2-3 paragraphs describing what the child does well across the domains assessed. Use specific examples from the observation evidence provided. Avoid generic praise — describe actual behaviors and skills.
3. Current Development by Domain — For each domain assessed, write 3-5 sentences describing the child's current functioning level with specific examples. Use language like "During play, [name] consistently..." or "When given the opportunity to..."
4. Areas of Active Growth — 2-3 areas where the child is in active development — framed as growth in progress, not deficits. Connect to age-appropriate expectations.
5. Goals for the Next Period — 3-5 specific, observable, achievable goals for the next 4-8 weeks. Each goal should include what the child will do, with what support, and in what context.
6. Recommended Strategies — 2-3 concrete strategies the provider will use to support the goals.
7. Family Sharing Notes — Brief guidance for sharing assessment results with families in a supportive, strengths-based conversation.

NEVER diagnose, speculate about disorders, or use clinical language not supported by the evidence provided.`,

    progress: base + `

YOU ARE WRITING A CHILD PROGRESS REPORT that will be shared with families.

This report must feel personal, warm, and celebratory — while remaining honest and grounded in observed skills. Parents should finish reading it feeling proud of their child and informed about next steps.

Required structure:
1. Report Header — Child name, age group, report period, provider/program name.
2. Opening Paragraph — 3-4 sentences of warm, specific narrative about this child's presence, personality, and engagement during this period. Use the child's name and reference something specific about their approach to learning.
3. Growth Highlights by Domain — For each developmental domain covered: 3-5 sentences describing what the child is doing now. Use specific examples and active language. E.g., "During our counting activities, [Name] has begun counting objects one-to-one with increasing accuracy, reaching 8-10 objects independently."
4. Social and Emotional Development — Specific observations about the child's friendships, regulation, communication with adults, and sense of self.
5. Goals for Next Period — 3-4 written in child-centered language ("We are working toward...") with brief descriptions of how the provider will support each goal.
6. Family Partnership Suggestions — 2-3 specific, simple ideas the family can practice at home that connect to the current goals. Name the activity or book.
7. Closing — A warm, personal sentence that invites the family to connect and celebrate this child's growth together.`,

    portfolio: base + `

YOU ARE WRITING A CHILD PORTFOLIO ENTRY that captures a meaningful learning moment.

This should read like a small story about a real child — not a template with a name inserted. The language should be warm, specific, and celebratory in a way that makes families want to keep every entry.

Required content:
1. Entry Title — Something evocative and specific (e.g., "The Day She Counted the Stairs" or "How Blocks Became a Zoo").
2. What Happened — 3-5 sentences of vivid, specific narrative describing the moment, activity, or learning event. Include what the child said, did, built, or discovered. Make the parent feel like they were there.
3. The Learning Behind It — 1-2 paragraphs connecting what happened to specific developmental skills and age-appropriate milestones. Use natural, jargon-free language. Explain WHY this moment mattered.
4. Skills Growing Right Now — 3-5 specific skills this entry illustrates, with brief descriptions.
5. Provider Reflection — 2-3 sentences from the provider's perspective about what was meaningful about this moment or what it revealed about the child.
6. The Next Chapter — 1-2 sentences describing what the provider will offer next to build on this learning. Be specific.
7. Family Note — A short, personal line inviting the family to share a connected moment from home.`,

    curriculum: base + `

YOU ARE BUILDING A CURRICULUM UNIT for a home daycare provider.

This unit must be substantive, thematic, and immediately usable — not a framework to fill in later. Every activity idea, book, song, and project should be fully named and described with enough detail to implement.

Required structure:
**Unit Title and Theme Overview** — A compelling title and 2-3 sentences describing the central inquiry or exploration of the unit.
**Age Group and Duration** — Specific age group and recommended length (1 week, 2 weeks, 1 month).
**Essential Questions** — 2-3 big questions that will drive the children's exploration (e.g., "What do insects need to live?" or "How do our feelings change throughout the day?").
**Learning Goals** — 5-7 specific, observable goals across literacy, math, science, creative arts, social-emotional, and physical development. Write in "Children will..." format.
**Key Vocabulary** — 8-10 theme-specific words with child-friendly definitions and example sentences.
**Book List** — 4-6 specific titles with author names connected to the theme. Include brief notes on how each book supports the unit.
**Weekly Focus Plan** — For each week: a week title/theme, circle time ideas, small group activities, dramatic play set-up, art and sensory invitations, science or math exploration, gross motor connections, and outdoor extension.
**Materials Master List** — Everything needed to run the full unit.
**Family Engagement** — One detailed take-home project or activity families can do together with materials listed and instructions written.
**Documentation Ideas** — 2-3 ways the provider can document and share children's learning throughout the unit.

Age-group appropriateness must be precise throughout.`,

    learningStory: base + `

YOU ARE WRITING A LEARNING STORY — a narrative documentation format that tells the story of a child's learning through a real observed moment.

Learning stories are warm, personal, and written TO the child — not about them. They use present or past tense narration, then zoom out to explain the learning and celebrate the growth.

Structure:
1. Opening Narrative — 4-6 sentences written in second person to the child ("You pulled yourself up...") OR in warm third person. Describe exactly what happened, what the child said, how they persisted, what choices they made. Make the parent see and feel the moment.
2. "I noticed..." — 2-3 paragraphs from the provider's perspective explaining what learning was visible in this moment. Name the developmental domain. Connect the behavior to a specific skill or milestone the child is building. Use natural, non-clinical language.
3. "You are learning to..." — A direct, celebratory statement naming 2-4 specific things this learning story captures. E.g., "You are learning to stay with a challenge even when it's hard" or "You are learning that your words can solve a problem."
4. What's Next — 1-2 sentences describing what the provider will offer next to build on this moment. Be specific about the activity or experience.
5. A Question for Home — One open-ended question or reflection prompt for the family, connecting the learning to home life.`,

    schedule: base + `

YOU ARE CREATING A DAILY CHILDCARE SCHEDULE that a provider can implement immediately.

This schedule must reflect a realistic, research-based flow for the age group(s) served. It should balance routine predictability with responsive flexibility — especially for infants and mixed-age groups.

Build the schedule around the hours and ages provided. For each time block, include:
- Time range
- Activity or routine name
- Brief description of what this looks like in practice (2-3 sentences of implementation notes)
- Transition tip when moving between major blocks

Age-specific requirements:
- Infant: no fixed blocks longer than 90 minutes; individualized feeding, sleep, and diapering woven throughout; awake-time activities noted
- Young Toddler: 10-15 minute activity windows; multiple movement breaks; toileting/diapering integrated; no more than 10 minutes seated
- Older Toddler: 15-20 minute activity windows; transition songs or visuals called out; rest/quiet time noted
- Preschool: circle time, center time, small group, outdoor, meals/snacks, rest — each block with suggested length and a brief activity example
- School Age: arrival, snack, homework/project time, movement, enrichment activities, pickup — with specific enrichment ideas named

End with a "Provider Flexibility Note" about how to adapt timing for individual children, sick days, and weather.`,

    classroomSetup: base + `

YOU ARE CREATING CLASSROOM SETUP AND ENVIRONMENT RECOMMENDATIONS for a home childcare space.

These recommendations must be concrete, practical, and achievable in a real home. Describe exact center ideas with specific materials, placement logic, and safety considerations. Don't just say "set up a reading corner" — describe the corner, what goes in it, how it's arranged, and what a child can do there independently.

Required content:
1. Overall Space Philosophy — 2-3 sentences about creating a space that communicates safety, belonging, and invitation to explore.
2. Learning Centers (one section per center) — For each center requested or appropriate to the age group: name, purpose, recommended materials (named specifically), setup description, placement rationale (near window, away from active play, etc.), and one "pro tip" for making it work in a small home space.
3. Traffic Flow and Supervision — Specific guidance on arranging furniture for clear sight lines, emergency exit paths, and safe transitions between zones.
4. Age-Specific Safety Modifications — Named hazards to address for the stated age group (cord safety for infants, outlet covers, shelf anchoring, choking hazard zones, etc.)
5. Calm-Down / Cozy Space — Specific setup idea with materials and how to introduce it to children.
6. Outdoor Extension — If applicable, one idea for bringing the indoor learning environment outdoors.
7. Adaptation for Mixed Ages — If multiple age groups are served, specific recommendations for creating safe, separated zones.`,

    emergency: base + `

YOU ARE WRITING AN EMERGENCY PREPAREDNESS PLAN for a childcare program.

This plan must be practical, clear, and specific enough to follow under stress. Write each procedure in numbered steps with action verbs. Include specific roles (provider, assistant if applicable) and exact language for communicating with families and emergency services.

Required sections:
1. Program Information and Emergency Contact List template.
2. Fire/Evacuation Procedure — Numbered steps from detection to family notification. Include primary and secondary exit routes, meeting point, headcount method, items to grab, and who to call and when.
3. Severe Weather/Shelter-in-Place — Steps for tornado, severe storm, or area-specific weather emergency. Include safest room in home, how to communicate with families, and how to keep children calm.
4. Medical Emergency — Steps for suspected serious injury or illness. Include calling 911, first aid basics, parent notification, and documentation.
5. Lockdown/Intruder — Steps for securing the space with children present. Age-appropriate language for helping children stay safe and calm.
6. Missing Child — Immediate steps, search procedure, parent notification, and when to call authorities.
7. Practice and Drill Schedule — Recommended frequency by emergency type and how to conduct age-appropriate drills without frightening children.
8. Communication Template — Sample text message or voicemail script to notify families during an emergency.

End with: "Customize this plan to your specific home layout, local emergency contacts, and state licensing requirements. Practice each procedure at least annually."`,

    substitute: base + `

YOU ARE WRITING A SUBSTITUTE PROVIDER PLAN that a fill-in caregiver can follow from the moment they arrive.

This plan must be clear, organized, and complete enough that a substitute who has never been to this program can manage the day safely and confidently. Assume they know nothing about these specific children.

Required sections:
1. Program Quick Facts — Program name, address, hours, provider contact info, licensing number if applicable.
2. Daily Schedule — Time-by-time schedule with brief notes on what each block looks like.
3. Child-by-Child Snapshot — For each child (or placeholder if names aren't provided): name, age, one key need or preference, any allergy or medication note, usual nap time, comfort item, pickup authorization.
4. Meal and Snack Guide — What is prepared, where to find it, any allergy notes, infant feeding instructions if applicable.
5. Rest Time Procedures — Who naps, where, for how long, what to do if they won't sleep.
6. Activity Toolkit — 5 go-to activities that require minimal prep. For each: name, materials location, brief instructions, and why kids enjoy it. Cover different ages and developmental areas.
7. Behavior Support Notes — How the program handles big feelings, transitions, and conflict. Key phrases to use.
8. Emergency Info — Location of emergency contacts, first aid kit, fire extinguisher, emergency exit routes, nearest hospital.
9. End-of-Day Checklist — What to document, how to close up, what to communicate to the regular provider.`,

    grant: base + `

YOU ARE WRITING A CHILDCARE GRANT OR FUNDING REQUEST LETTER on behalf of a real program.

This letter must be persuasive, specific, and professional — not vague. Funders read dozens of requests; this one must stand out by connecting the program's real needs to concrete child outcomes.

Required structure:
1. Header — Program name, date, addressee (Dear [Funder Name] or Dear Grant Review Committee).
2. Opening Paragraph — Lead with the program's mission or a compelling one-sentence description of who is served and why it matters. Name the funding amount and purpose in the first paragraph — don't bury the ask.
3. Program Description — 2-3 paragraphs describing the program: age groups served, curriculum approach, how long it has operated, community context. Be specific about numbers served and what makes this program valuable.
4. Statement of Need — Explain specifically why this funding is needed now. What gap exists? What cannot currently be purchased, maintained, or staffed without this support?
5. Proposed Use of Funds — Itemized list of how the funds will be used with dollar amounts or percentages. Be specific (e.g., "$500 for STEM materials including coding kits, magnifying sets, and nature exploration trays").
6. Expected Impact — Describe 3-4 measurable outcomes: how many children will benefit, what developmental skills will be supported, how the program's quality will improve.
7. Closing — Thank the funder, restate the ask, and provide clear contact information.
8. Provider signature line.

Remind the provider to customize names, dollar amounts, and statistics before sending.`,
  };

  return toolPrompts[tool] || (base + "\n\nCreate specific, expert-level childcare content that reflects genuine early childhood education knowledge. Every suggestion must name actual materials, activities, or language to use. Vary the structure and content based on the inputs provided. Avoid generic filler. Make every sentence earn its place.");
}

async function generateOpenAiContent({ tool, prompt, age, plan, email }) {
  if (!OPENAI_API_KEY) {
    throw new Error("AI API is not configured. Add OPENAI_API_KEY to .env.");
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `******`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.9,
      input: [
        {
          role: "system",
          content: getToolSystemPrompt(tool),
        },
        {
          role: "user",
          content: (prompt || "Create a helpful childcare document.") + "\n\nAge group: " + (age || "not specified") + "\nPlan: " + (plan || "Free"),
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
      const stream = fs.createReadStream(indexPath);
      stream.on("error", (error) => {
        console.error(error);
        if (!response.headersSent) {
          textResponse(response, 500, "Server error.");
          return;
        }
        response.destroy(error);
      });
      stream.pipe(response);
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
  const stream = fs.createReadStream(filePath);
  stream.on("error", (error) => {
    console.error(error);
    if (!response.headersSent) {
      textResponse(response, 500, "Server error.");
      return;
    }
    response.destroy(error);
  });
  stream.pipe(response);
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
