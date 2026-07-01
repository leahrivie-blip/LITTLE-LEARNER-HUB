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
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
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
    siteContent: defaultSiteContentStore(),
  };
}

function defaultSiteContentStore() {
  return {
    lessonPlans: {},
    reviews: [],
    founder: {},
    homepage: {},
    images: [],
    updatedAt: "",
  };
}

function normalizedMultilineText(value, maxLength = 12000) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function normalizedShortText(value, maxLength = 240) {
  return normalizedMultilineText(value, maxLength);
}

function sanitizedImageSource(value, maxLength = 1_000_000) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(text)) return text.slice(0, maxLength);
  if (/^(https?:)?\/\//i.test(text) || text.startsWith("/")) return text.slice(0, 4000);
  return "";
}

function sanitizedUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text.slice(0, 2000);
  return "";
}

function normalizedList(items, limit, mapper) {
  return Array.isArray(items) ? items.slice(0, limit).map(mapper).filter(Boolean) : [];
}

function normalizedLessonPlanOverride(id, value) {
  const entry = value && typeof value === "object" ? value : {};
  const days = entry.dailyActivities && typeof entry.dailyActivities === "object" ? entry.dailyActivities : {};
  return {
    id: normalizedShortText(id, 160),
    title: normalizedShortText(entry.title, 180),
    age: normalizedShortText(entry.age, 40),
    theme: normalizedShortText(entry.theme, 120),
    weeklyOverview: normalizedMultilineText(entry.weeklyOverview, 4000),
    materials: normalizedMultilineText(entry.materials, 4000),
    teacherLanguage: normalizedMultilineText(entry.teacherLanguage, 4000),
    objectives: normalizedMultilineText(entry.objectives, 4000),
    elgConnections: normalizedMultilineText(entry.elgConnections, 4000),
    familyConnection: normalizedMultilineText(entry.familyConnection, 4000),
    reflectionNotes: normalizedMultilineText(entry.reflectionNotes, 4000),
    plan: normalizedShortText(entry.plan, 20),
    visible: entry.visible !== false,
    thumbnailUrl: sanitizedImageSource(entry.thumbnailUrl),
    dailyActivities: {
      monday: normalizedMultilineText(days.monday, 4000),
      tuesday: normalizedMultilineText(days.tuesday, 4000),
      wednesday: normalizedMultilineText(days.wednesday, 4000),
      thursday: normalizedMultilineText(days.thursday, 4000),
      friday: normalizedMultilineText(days.friday, 4000),
    },
  };
}

function normalizedReviewEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  return {
    id: normalizedShortText(entry.id || `review-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`, 120),
    name: normalizedShortText(entry.name, 120),
    businessName: normalizedShortText(entry.businessName, 140),
    text: normalizedMultilineText(entry.text, 2400),
    imageUrl: sanitizedImageSource(entry.imageUrl),
    visible: entry.visible !== false,
    order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 0,
  };
}

function normalizedSimpleCard(value, fallbackId = "") {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id || fallbackId, 120);
  return {
    id,
    title: normalizedShortText(entry.title, 180),
    text: normalizedMultilineText(entry.text, 2000),
    imageUrl: sanitizedImageSource(entry.imageUrl),
  };
}

function normalizedSiteContent(value) {
  const input = value && typeof value === "object" ? value : {};
  const lessonPlansInput = input.lessonPlans && typeof input.lessonPlans === "object" ? input.lessonPlans : {};
  const lessonPlans = Object.fromEntries(
    Object.entries(lessonPlansInput)
      .slice(0, 2000)
      .map(([id, item]) => {
        const normalized = normalizedLessonPlanOverride(id, item);
        return normalized.id ? [normalized.id, normalized] : null;
      })
      .filter(Boolean),
  );
  return {
    lessonPlans,
    reviews: normalizedList(input.reviews, 100, normalizedReviewEntry),
    founder: {
      name: normalizedShortText(input.founder?.name, 120),
      title: normalizedShortText(input.founder?.title, 120),
      aboutText: normalizedMultilineText(input.founder?.aboutText, 4000),
      shortBio: normalizedMultilineText(input.founder?.shortBio, 1200),
      profileImageUrl: sanitizedImageSource(input.founder?.profileImageUrl),
      homeImageUrl: sanitizedImageSource(input.founder?.homeImageUrl),
      websiteUrl: sanitizedUrl(input.founder?.websiteUrl),
      instagramUrl: sanitizedUrl(input.founder?.instagramUrl),
      linkedInUrl: sanitizedUrl(input.founder?.linkedInUrl),
    },
    homepage: {
      heroBadge: normalizedShortText(input.homepage?.heroBadge, 180),
      heroHeadline: normalizedShortText(input.homepage?.heroHeadline, 240),
      heroSubheadline: normalizedMultilineText(input.homepage?.heroSubheadline, 1200),
      heroCtaText: normalizedShortText(input.homepage?.heroCtaText, 120),
      heroSecondaryCtaText: normalizedShortText(input.homepage?.heroSecondaryCtaText, 120),
      socialProofText: normalizedMultilineText(input.homepage?.socialProofText, 400),
      heroImageUrl: sanitizedImageSource(input.homepage?.heroImageUrl),
      featureCards: normalizedList(input.homepage?.featureCards, 12, (item, index) => normalizedSimpleCard(item, `feature-${index + 1}`)),
      howItWorks: normalizedList(input.homepage?.howItWorks, 12, (item, index) => normalizedSimpleCard(item, `how-${index + 1}`)),
      comingSoon: normalizedList(input.homepage?.comingSoon, 12, (item, index) => normalizedSimpleCard(item, `soon-${index + 1}`)),
      previewCards: normalizedList(input.homepage?.previewCards, 12, (item, index) => normalizedSimpleCard(item, `preview-${index + 1}`)),
      finalCtaHeadline: normalizedShortText(input.homepage?.finalCtaHeadline, 240),
      finalCtaText: normalizedMultilineText(input.homepage?.finalCtaText, 1200),
      finalCtaButtonText: normalizedShortText(input.homepage?.finalCtaButtonText, 120),
    },
    images: normalizedList(input.images, 200, (item, index) => {
      const entry = item && typeof item === "object" ? item : {};
      const normalized = {
        id: normalizedShortText(entry.id || `image-${index + 1}`, 120),
        label: normalizedShortText(entry.label, 180),
        group: normalizedShortText(entry.group, 120),
        imageUrl: sanitizedImageSource(entry.imageUrl),
      };
      return normalized.id ? normalized : null;
    }),
    updatedAt: normalizedShortText(input.updatedAt, 80),
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

function buildPromptSection(title, content) {
  return `${title}\n${content.trim()}`;
}

function buildObservationSystemPrompt() {
  const sections = [
    buildPromptSection("Master Observation Prompt", `
You are the professional Observation Assistant for Little Learner Hub.
Your purpose is to help childcare providers create high-quality, professional, objective, and developmentally appropriate observations from a short teacher note.
The provider using Little Learner Hub is busy caring for children. Assume they have very little time to type, so do the hard work for them.
Never require a long explanation. A quick sentence or two should be enough to generate a complete observation.
Never mention AI. Never apologize. Never say there is not enough information. Make the best professional observation possible using the information available.
Only two items should ever be required: the selected child and the teacher quick note. Everything else should be determined automatically whenever possible.
`),
    buildPromptSection("Observation Writing Intelligence Rules", `
Step 1: Read the teacher's note closely. Identify what happened, what the child was trying to accomplish, what skills were demonstrated, and whether the experience was child-led, teacher-guided, [...]
Step 2: Understand the child. Use the child's age, developmental stage, goals, prior context, classroom details, and provider notes when they are supplied.
Step 3: Identify only the learning that is actually supported by the note and context. Never invent unsupported learning.
Step 4: Write like an experienced childcare professional. Use natural, warm, professional language. Stay objective, specific, and non-judgmental. Do not copy the teacher's note word-for-word.
Step 5: Explain why the observed experience matters developmentally and what should be watched for next.
Step 6: Recommend realistic next steps and a practical activity that fit the child's age and the provider's real classroom setting.
Step 7: Before returning, verify the writing is developmentally appropriate, licensing-friendly, clear, polished, and ready to save.
`),
    buildPromptSection("Observation Output Formatting Rules", `
Return the observation in this exact order:
1. Observation Title — 3-8 words summarizing the child's learning.
2. Observation Narrative — one polished paragraph for a short note or two to three short paragraphs for a detailed note. Describe what happened, explain the learning, highlight strengths, and r[...]
3. Developmental Areas — list all areas clearly supported by the observation.
4. Skills Demonstrated — 3-8 specific skills shown.
5. Why This Learning Matters — one short paragraph connecting today's experience to future learning.
6. Suggested Next Steps — 2-4 realistic recommendations using common classroom materials.
7. Suggested Activity — include activity name, materials needed, simple instructions, learning objective, and approximate time.
8. Family Summary — warm, positive, jargon-free summary families can easily understand.
9. Teacher Reflection — one professional reflection statement.
10. Tags — relevant tags only.
Never leave sections blank.
`),
    buildPromptSection("Childcare Professional Reasoning Layer", `
Provider and teacher notes are the highest-priority source. Understand exactly what happened before writing.
Use only the details provided. Never invent injuries, triggers, witness names, diagnoses, timelines, or developmental concerns that were not entered.
Only include developmental areas, skills, recommendations, and milestone links that are clearly supported by the note and context.
Avoid generic developmental template language that could apply to any child. Make each response specific to this child and this exact situation.
If the note is brief, write "Based on the note provided..." and use only minimal, realistic childcare context to complete the documentation without inventing major facts.
Determine the primary developmental domain from the note itself. Do not default to Cognitive unless the note truly supports it.
All content must match the child's stated age group.
- Infant (0-12 months): tummy time, songs, simple sensory exploration, tracking objects, reaching/grasping, babbling, bonding, responsive feeding, safe floor play, safe sleep.
- Young Toddler (12-24 months): simple movement, stacking, naming objects, cause-and-effect, parallel play, simple songs, toddler-safe sensory play, early choices.
- Older Toddler (24-36 months): pretend play, matching, sorting, simple art, running/jumping, beginning sharing, short directions, simple routines.
- Preschool (3-5 years): vocabulary building, pre-literacy, counting, science exploration, cooperative play, problem-solving, growing independence, simple writing experiences.
- School Age (5+ years): projects, discussions, writing, STEM, problem-solving, leadership, reflection, responsibility, and age-appropriate independence.
`),
    buildPromptSection("Global Writing Quality Standards", `
Use warm, professional childcare language that providers can copy and use right away.
Write like a seasoned, creative educator — not a template or a robot. Every output should feel specific, genuine, and freshly written.
Keep outputs organized, clearly labeled, and easy to read.
Use the child's name, age, goals, observations, program name, and provider notes whenever they are provided.
Recommendations must be directly tied to what was observed, not generic filler.
Generate fresh, specific content every time. Vary sentence openings, vocabulary, structure, transitions, and examples.
Avoid empty filler phrases and repetitive AI-sounding wording.
Correct spelling, grammar, punctuation, and natural sentence structure before returning the final version.
Do not return incomplete drafts, duplicated paragraphs, placeholders, contradictions, or awkward formatting.
`),
  ];
  return sections.join("\n\n---\n\n");
}

function buildOpenAiUserPrompt(prompt, age) {
  const isShortNote = !prompt || prompt.trim().length < AI_SHORT_NOTE_THRESHOLD;
  return [
    prompt || "Create a helpful childcare document.",
    age ? `Age group: ${age}` : "",
    isShortNote ? "Note: The provider's note is brief. Stay tightly grounded in the exact details provided, use only minimal context to keep the response practical, and avoid generic developmenta[...]" : "",
  ].filter(Boolean).join("\n\n");
}

function buildDebugPromptSnapshot(systemPrompt, userPrompt) {
  return [
    "System Prompt:",
    systemPrompt,
    "",
    "---",
    "",
    "User Prompt:",
    userPrompt,
  ].join("\n");
}

function getToolSystemPrompt(tool) {
  const base = [
    "You are an expert early childhood educator and curriculum specialist writing content for real childcare providers.",
    "Use warm, professional childcare language that providers can copy and use right away.",
    "Write like a seasoned, creative educator — not a template or a robot. Every output should feel specific, genuine, and freshly written.",
    "Keep outputs organized, clearly labeled, and easy to read.",
    "Use the child's name, age, goals, observations, program name, and provider notes whenever they are provided.",
    "Include the program/daycare name in all formal documents when it is supplied.",
    "Use only the details provided. Never invent injuries, triggers, witness names, diagnoses, timelines, or developmental concerns that were not entered.",
    "Provider and teacher notes are the highest-priority source. Understand exactly what happened before writing.",
    "Only include developmental areas, skills, and recommendations that are clearly supported by the note and context provided.",
    "Avoid generic developmental template language that could apply to any child. Make each response specific to this child and this exact situation.",
    "Recommendations must be directly tied to what was observed, not generic filler.",
    "If the provider's note is brief or minimal, produce a helpful result using appropriate general childcare context — note 'Based on the note provided...' and keep details realistic but not i[...]",
    "VARIETY: Generate fresh, specific content every single time. Vary your sentence openings, vocabulary, structure, transitions, and examples. Never reuse the same phrases, openers, or conclusi[...]",
    "Avoid empty filler phrases like 'had a great day,' 'very engaged,' 'wonderful experience,' 'it is a pleasure to share,' 'I hope this message finds you well,' 'in today's fast-paced world,' o[...]",
    "Do not use repetitive or generic phrasing such as 'This supports future learning,' 'Making meaningful connections,' or 'Growing cognitive skills' unless it is truly specific and necessary.",
    "If a curriculum framework is mentioned (Creative Curriculum, HighScope, Frog Street, Montessori, Reggio Emilia, Mother Goose Time, or a custom curriculum), align your language, documentation[...]",
    "If a state or state standards are mentioned, reference relevant domain indicators and align developmental language accordingly.",
    "",
    "FINAL QUALITY REVIEW — complete before returning any response:",
    "- Correct spelling, grammar, punctuation, and natural sentence structure.",
    "- Professional writing with a warm, friendly, age-appropriate tone.",
    "- No repetitive wording, awkward AI phrasing, incomplete sentences, placeholders, template language, duplicated paragraphs, or contradictions.",
    "- Consistent formatting and polished readability.",
    "- If any issue is found, revise and return the corrected final version (never return a first draft).",
    "",
    "CRITICAL — DEVELOPMENTAL APPROPRIATENESS:",
    "All content MUST match the child's stated age group. Never suggest activities, milestones, goals, behaviors, lesson plans, or expectations outside the correct age range.",
    "Age ranges and what belongs in each:",
    "- Infant (0-12 months): tummy time, songs, simple sensory exploration, tracking objects, reaching/grasping, babbling, bonding, responsive feeding, safe floor play, safe sleep. NEVER suggest[...]",
    "- Young Toddler (12-24 months): simple movement, stacking, naming objects, cause-and-effect, parallel play, simple songs, toddler-safe sensory play, early choices. NEVER suggest tracing, wo[...]",
    "- Older Toddler (24-36 months): pretend play, matching, sorting, simple art, running/jumping, beginning sharing, short directions, simple routines. NEVER suggest kindergarten or school-age [...]")