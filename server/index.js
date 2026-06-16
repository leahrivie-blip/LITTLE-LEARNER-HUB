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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const FOUNDING_LIMIT = Number(process.env.FOUNDING_MEMBER_LIMIT || 50);
const PUBLIC_FOUNDING_CLAIMED_BASE = Number(process.env.PUBLIC_FOUNDING_CLAIMED_BASE || 15);
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
const DATABASE_PROVIDER = process.env.DATABASE_PROVIDER || "local-json";
const PRODUCTION_DATABASE_URL = process.env.PRODUCTION_DATABASE_URL || "";
const PRODUCTION_DATABASE_SERVICE_KEY = process.env.PRODUCTION_DATABASE_SERVICE_KEY || "";
const DATABASE_SSL = process.env.DATABASE_SSL || "";

const publicDir = path.join(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const storePath = path.join(dataDir, "launch-store.json");
const storeRecordId = "launch-store";
let storeCache = null;
let databaseReady = false;
let postgresPool = null;
let postgresWriteChain = Promise.resolve();

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
  const required = { stripe, admin, ai, site, database };
  const blockers = Object.entries(required)
    .filter(([, value]) => !value.ready)
    .map(([key]) => key);
  return {
    ready: blockers.length === 0,
    blockers,
    required,
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
    leads: [],
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

function planKeyFromStripe(subscription, user = {}) {
  const metadataPlan = String(subscription?.metadata?.plan || "").trim().toLowerCase();
  if (planConfig[metadataPlan]) return metadataPlan;
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
  if (!planConfig[planKey] || !price) {
    jsonResponse(response, 400, { error: `Stripe price is missing for ${planKey}.` });
    return;
  }
  try {
    const customer = await getOrCreateStripeCustomer(email);
    const session = await stripeRequest("checkout/sessions", {
      mode: "subscription",
      customer,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      allow_promotion_codes: "true",
      "metadata[email]": email,
      "metadata[plan]": planKey,
      "subscription_data[metadata][email]": email,
      "subscription_data[metadata][plan]": planKey,
      success_url: body.successUrl || `${SITE_URL}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: body.cancelUrl || `${SITE_URL}?checkout=cancel`,
    });
    upsertUser(email, {
      stripeCustomerId: customer,
      pendingPlan: planKey,
      subscriptionStatus: "Checkout Started",
    });
    jsonResponse(response, 200, { url: session.url, id: session.id, plan: planKey });
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
    }
    jsonResponse(response, 200, {
      paid,
      status: session.status,
      paymentStatus: session.payment_status,
      email,
      plan: planKey,
      subscriptionId: session.subscription,
      customerId: session.customer,
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
        monthlyPrice: "$0",
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
  const plan = body.plan || "Free";
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

function handleSubscriptionStatus(request, response, url) {
  const email = normalizeEmail(url.searchParams.get("email"));
  const store = readStore();
  jsonResponse(response, 200, {
    email,
    subscription: store.users?.[email] || null,
    aiUsage: email ? canUseServerAi(email, store.users?.[email]?.plan || "Free") : null,
    founding: {
      limit: FOUNDING_LIMIT,
      claimed: foundingClaimedCount(store),
      remaining: foundingSpotsRemaining(store),
    },
  });
}

function handleStripeReadiness(request, response) {
  const status = stripeConfigStatus();
  const store = readStore();
  jsonResponse(response, 200, {
    stripe: status,
    founding: {
      limit: FOUNDING_LIMIT,
      claimed: foundingClaimedCount(store),
      remaining: foundingSpotsRemaining(store),
    },
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

function handleHealth(request, response) {
  jsonResponse(response, 200, {
    ok: true,
    service: "Little Learner Hub",
    time: new Date().toISOString(),
    stripeCheckoutReady: stripeConfigStatus().checkoutReady,
    launchReady: launchReadinessStatus().ready,
  });
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
  const safePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).replace(/\.\.+/g, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    request.method === "HEAD" ? headResponse(response, 403) : textResponse(response, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
    if (request.method === "POST" && url.pathname === "/api/create-checkout-session") return await handleCheckout(request, response);
    if (request.method === "POST" && url.pathname === "/api/create-customer-portal-session") return await handlePortal(request, response);
    if (request.method === "POST" && (url.pathname === "/api/webhooks/stripe" || url.pathname === "/api/stripe/webhook")) return await handleStripeWebhook(request, response);
    if (request.method === "POST" && url.pathname === "/api/ai-generate") return await handleAiGenerate(request, response);
    if (request.method === "GET" && url.pathname === "/api/checkout-status") return await handleCheckoutStatus(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/subscription-status") return handleSubscriptionStatus(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/stripe-readiness") return handleStripeReadiness(request, response);
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
