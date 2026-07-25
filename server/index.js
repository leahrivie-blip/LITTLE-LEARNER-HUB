const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const membershipAccess = require("../scripts/membership-access.js");
const accountAccess = require("../scripts/account-access.js");
const curriculumStandards = require("../scripts/curriculum-standards.js");
const freeCurriculumSample = require("../scripts/free-curriculum-sample.js");
const freePlanGrandfathering = require("../scripts/free-plan-grandfathering.js");
const scheduleLib = require("./schedule-lib.js");
const { createEmailEngagement, defaultEmailEngagementStore } = require("./email-engagement.js");
const { createFoundingMemberEmail } = require("./founding-member-email.js");
const { createFreeUserWelcomeEmail } = require("./free-user-welcome-email.js");
const billingLifecycleEmail = require("./billing-lifecycle-email.js");
const { createPushService } = require("./push-lib.js");
const messagingLib = require("./messaging-lib.js");
const { createCommsApi } = require("./comms-api.js");
const commsLib = require("./comms-lib.js");
const tempPasswordAuth = require("./temp-password-auth.js");
const emailAuth = require("./email-auth.js");
const adminNotifications = require("./admin-notifications.js");
const programOwnership = require("./program-ownership.js");
const expansionFeatureFlags = require("../scripts/expansion-feature-flags.js");
const foundationDataModel = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const entitlementModel = require("../scripts/entitlement-model.js");
const { createDirectorCenterApi } = require("./director-center-api.js");
const { createPhase3TeacherApi } = require("./phase3-teacher-api.js");
const { createFormsCenterApi } = require("./forms-center-api.js");
const { createBuiltInFormLibraryApi } = require("./built-in-form-library-api.js");
const { createFormResponsesApi } = require("./form-responses-api.js");
const { createAiFormBuilderApi } = require("./ai-form-builder-api.js");
const { createFormRecipientApi } = require("./form-recipient-api.js");
const { createFamilyFoundationApi } = require("./family-foundation-api.js");
const { createFamilyHubApi } = require("./family-hub-api.js");
const { createFamilyUpdatesApi } = require("./family-updates-api.js");
const { createFamilyMessagingApi } = require("./family-messaging-api.js");
const { createEnrollmentApi } = require("./enrollment-api.js");
const { createRecordsCenterApi } = require("./records-center-api.js");
const { createLicensingCenterApi } = require("./licensing-center-api.js");
const { createTodayHubApi } = require("./today-hub-api.js");
const { createProviderProductivityApi } = require("./provider-productivity-api.js");
const { createClassroomAssistantApi } = require("./classroom-assistant-api.js");
const { createStaffExperienceApi } = require("./staff-experience-api.js");
const { createBillingSimulatorApi } = require("./billing-simulator-api.js");
const { createTestingLabApi } = require("./testing-lab-api.js");
const { createAiTestingApi } = require("./ai-testing-api.js");
const { createTestingFeedbackApi } = require("./testing-feedback-api.js");
const { createExternalTesterSandboxApi } = require("./external-tester-sandbox-api.js");
const externalTesterSandboxModel = require("../scripts/external-tester-sandbox-data-model.js");
const { createHomeDaycarePilotApi } = require("./home-daycare-pilot-api.js");
const {
  RENDER_SERVICE_HOST,
  RENDER_LOAD_BALANCER_IPV4,
  CUSTOM_BRAND_DOMAINS,
  WORKING_BRAND_DOMAINS,
  buildDomainDnsReport,
} = require("./domain-dns.js");

loadEnvFile(path.join(__dirname, "..", ".env"));

const PORT = Number(process.env.PORT || 4242);
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const PROMO_FREE_TRIAL_CODE = String(process.env.PROMO_FREE_TRIAL_CODE || "TRY1MONTH").trim();
const PROMO_FREE_TRIAL_DAYS = Number(process.env.PROMO_FREE_TRIAL_DAYS || 30);
const PROMO_FREE_TRIAL_EXPIRES_AT = process.env.PROMO_FREE_TRIAL_EXPIRES_AT || "";
const PROMO_FREE_TRIAL_EXPIRES_LABEL = process.env.PROMO_FREE_TRIAL_EXPIRES_LABEL || "";
const STRIPE_AUTOMATIC_TAX = String(process.env.STRIPE_AUTOMATIC_TAX || "").toLowerCase() === "true"
  || String(process.env.STRIPE_AUTOMATIC_TAX || "") === "1";
const FOUNDING_CHECKOUT_HOLD_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.FOUNDING_CHECKOUT_HOLD_MS || 48 * 60 * 60 * 1000) || (48 * 60 * 60 * 1000),
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const FOUNDING_LIMIT = Number(process.env.FOUNDING_MEMBER_LIMIT || 50);
// Optional marketing offset only — defaults to 0 so claimed counts reflect real foundingMembers[].
const PUBLIC_FOUNDING_CLAIMED_BASE = Number(process.env.PUBLIC_FOUNDING_CLAIMED_BASE || 0);
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const ADMIN_NAME = process.env.ADMIN_NAME || "Owner";
// Extra owner logins that share the same admin password/code (iCloud + aliases).
// These emails get full Pro curriculum access in the app (see resolveCurriculumAccessUser)
// so Leah can open every lesson plan while signed in — even if the store membership
// row is still Free for billing/upgrade testing. Admin Free preview remains available
// in the client for simulating a Free member.
const DEFAULT_ADMIN_EMAIL_ALIASES = [
  "leahivie@icloud.com",
  "leahrivie@icloud.com",
  "leahrivie@gmail.com",
];
const ADMIN_EMAILS = [...new Set([
  ADMIN_EMAIL,
  ...DEFAULT_ADMIN_EMAIL_ALIASES.map((value) => normalizeEmail(value)),
  ...String(process.env.ADMIN_EMAILS || "")
    .split(/[,;\s]+/)
    .map((value) => normalizeEmail(value))
    .filter(Boolean),
])].filter(Boolean);
function isConfiguredAdminEmail(email) {
  return ADMIN_EMAILS.includes(normalizeEmail(email));
}
function isAdminOnlyNotificationType(type) {
  const key = String(type || "").trim().toLowerCase();
  return key.startsWith("admin_") || key === "admin_message_reply";
}
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "";
const FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN || "";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
const FIREBASE_APP_ID = process.env.FIREBASE_APP_ID || "";
const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "";
const FIREBASE_MESSAGING_SENDER_ID = process.env.FIREBASE_MESSAGING_SENDER_ID || "";
const FIREBASE_MEASUREMENT_ID = process.env.FIREBASE_MEASUREMENT_ID || "";
const FIREBASE_CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const SUPPORT_EMAIL_TO = normalizeEmail(process.env.SUPPORT_EMAIL_TO || ADMIN_EMAIL || "little.learners.hub.customer@gmail.com");
// Canonical production sender — must match the verified Resend domain.
const EXPECTED_EMAIL_FROM_NAME = "Little Learner Hub";
const EXPECTED_EMAIL_FROM_ADDRESS = "support@littlelearnershubbyleah.com";
const EXPECTED_EMAIL_FROM_DOMAIN = "littlelearnershubbyleah.com";
const EXPECTED_SUPPORT_EMAIL_FROM = `${EXPECTED_EMAIL_FROM_NAME} <${EXPECTED_EMAIL_FROM_ADDRESS}>`;
const SUPPORT_EMAIL_FROM_ENV = process.env.SUPPORT_EMAIL_FROM || process.env.RESEND_FROM || process.env.SENDGRID_FROM || process.env.POSTMARK_FROM || "";
const SUPPORT_EMAIL_FROM = resolveSupportEmailFrom(SUPPORT_EMAIL_FROM_ENV);
const SUPPORT_EMAIL_PROVIDER = String(process.env.SUPPORT_EMAIL_PROVIDER || "").trim().toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_API_BASE_URL = process.env.RESEND_API_BASE_URL || "https://api.resend.com";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN || "";
// Master kill-switch for scheduled/marketing/bulk engagement mail. Transactional
// support notifications still use sendEmail() when the provider is configured.
// Default OFF until content is approved after the email-system rebuild.
const EMAIL_AUTOMATIONS_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.EMAIL_AUTOMATIONS_ENABLED || "false").trim().toLowerCase(),
);
// Absolute outbound-email kill switch for testing/preview environments.
// When true, sendEmail() never contacts Resend/SendGrid/Postmark.
const DISABLE_OUTBOUND_EMAIL = ["1", "true", "yes", "on"].includes(
  String(process.env.DISABLE_OUTBOUND_EMAIL || "false").trim().toLowerCase(),
);
// Testing/preview: block paid Stripe checkout and AI calls (Phase 2 preview safety).
const DISABLE_STRIPE_CHECKOUT = ["1", "true", "yes", "on"].includes(
  String(process.env.DISABLE_STRIPE_CHECKOUT || "false").trim().toLowerCase(),
);
const DISABLE_AI_CALLS = ["1", "true", "yes", "on"].includes(
  String(process.env.DISABLE_AI_CALLS || "false").trim().toLowerCase(),
);

function isDirectorCenterPreviewSafeMode() {
  // Preview-safe mode when Director Center or Forms Center admin preview is opted in on a
  // non-live host. Live production hosts never enter this mode.
  const directorOptIn = ["1", "true", "yes", "on"].includes(
    String(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW || "").trim().toLowerCase(),
  );
  const formsOptIn = ["1", "true", "yes", "on"].includes(
    String(process.env.ALLOW_FORMS_CENTER_ADMIN_PREVIEW || "").trim().toLowerCase(),
  );
  if (!directorOptIn && !formsOptIn) return false;
  try {
    return !expansionFeatureFlags.isLiveProductionSite(SITE_URL);
  } catch {
    return false;
  }
}

function outboundEmailIsDisabled() {
  return DISABLE_OUTBOUND_EMAIL === true || isDirectorCenterPreviewSafeMode();
}

function stripeCheckoutIsDisabled() {
  return DISABLE_STRIPE_CHECKOUT === true || isDirectorCenterPreviewSafeMode();
}

function aiCallsAreDisabled() {
  return DISABLE_AI_CALLS === true || isDirectorCenterPreviewSafeMode();
}
const SUPPORT_POSTAL_ADDRESS = String(process.env.SUPPORT_POSTAL_ADDRESS || "").trim();
const EMAIL_UNSUBSCRIBE_SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET || ADMIN_ACCESS_CODE;
const DATABASE_PROVIDER = process.env.DATABASE_PROVIDER || "local-json";
const PRODUCTION_DATABASE_URL = process.env.PRODUCTION_DATABASE_URL || "";
const PRODUCTION_DATABASE_SERVICE_KEY = process.env.PRODUCTION_DATABASE_SERVICE_KEY || "";
// A separate, testing-only Postgres connection string. On a live production host this
// is never read at all — PRODUCTION_DATABASE_URL is used instead (see activeDatabaseUrl()
// below). On every other host (a testing deployment, local dev, etc.) PRODUCTION_DATABASE_URL
// is never read at all, even if it happens to be set, so a testing service can never
// accidentally connect to — or be pointed at — the real production database.
const TESTING_DATABASE_URL = process.env.TESTING_DATABASE_URL || "";

/**
 * Which Postgres connection string THIS deployment should use. A live production
 * host always uses PRODUCTION_DATABASE_URL; every other host (a testing deployment,
 * local dev, CI, etc.) always uses TESTING_DATABASE_URL instead — PRODUCTION_DATABASE_URL
 * is never even read in that branch, so a testing service configured with both env
 * vars set (e.g. by copy-paste mistake) still can never reach the real production
 * database. If neither var is set for the current host, this returns "" and Postgres
 * storage stays unavailable — never a silent fallback to the OTHER host's database.
 */
function activeDatabaseUrl() {
  return expansionFeatureFlags.isLiveProductionSite(SITE_URL) ? PRODUCTION_DATABASE_URL : TESTING_DATABASE_URL;
}
const DATABASE_SSL = process.env.DATABASE_SSL || "";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || `mailto:${SUPPORT_EMAIL_TO || "support@littlelearnerhub.com"}`;
const PUSH_BULK_BATCH_SIZE = Number(process.env.PUSH_BULK_BATCH_SIZE || 20);
const PUSH_BULK_BATCH_DELAY_MS = Number(process.env.PUSH_BULK_BATCH_DELAY_MS || 75);
const PUSH_BULK_MAX_RECIPIENTS = Number(process.env.PUSH_BULK_MAX_RECIPIENTS || 2000);
const MAX_PUSH_DEVICES_PER_USER = Number(process.env.MAX_PUSH_DEVICES_PER_USER || 8);

const publicDir = path.join(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const storePath = process.env.LLH_STORE_PATH || path.join(dataDir, "launch-store.json");
const storeRecordId = "launch-store";
const spaRoutePaths = new Set([
  "/admin",
]);
let storeCache = null;
let databaseReady = false;
let lastPostgresError = "";
let postgresPool = null;
let postgresWriteChain = Promise.resolve();
let firebaseCertCache = { expiresAt: 0, certs: {} };
let clientAppScriptCache = null;
const MAX_BACKFILL_REPORT_ITEMS = 500;
// Last successfully persisted inventory — used to abort catastrophic full-store drops.
let lastPersistedStoreCounts = null;
let lastStoreSafetyAlertAt = 0;
let lastPostgresDisconnectAlertAt = 0;
const STORE_BACKUP_RETENTION = Math.max(3, Number(process.env.STORE_BACKUP_RETENTION || 14));
const STORE_BACKUP_INTERVAL_MS = Math.max(60 * 60 * 1000, Number(process.env.STORE_BACKUP_INTERVAL_MS || 24 * 60 * 60 * 1000));
const ALLOW_DESTRUCTIVE_STORE_WRITE = ["1", "true", "yes", "on"].includes(
  String(process.env.ALLOW_DESTRUCTIVE_STORE_WRITE || "").trim().toLowerCase(),
);

// Member Messaging Center + Web Push — initialized once storage is ready (see
// initializeStorage().then(...) near the bottom) so VAPID key persistence can
// safely read/write the store.
let pushService = null;
const messagingCenter = messagingLib.createMessagingCenter({ membershipAccess });
const MAX_MESSAGES = 5000;
const MAX_NOTIFICATIONS = 20000;
const MAX_PUSH_DELIVERY_LOG = 5000;
const recentSendFingerprints = new Map(); // dedupes accidental double-submits of the same send
const SEND_FINGERPRINT_TTL_MS = 15000;

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

function parseEmailAddress(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      email: match[2].trim(),
    };
  }
  return { name: "", email: text };
}

function emailDomainOf(address) {
  const email = String(parseEmailAddress(address).email || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function isResendTestSender(address) {
  const email = String(parseEmailAddress(address).email || "").trim().toLowerCase();
  const domain = emailDomainOf(email);
  return domain === "resend.dev" || email.endsWith("@resend.dev");
}

/**
 * Prefer an env From only when it uses the verified production domain.
 * Otherwise force the canonical sender so a mis-set Render env (test sender,
 * personal inbox, wrong domain) cannot keep Resend in recipient-restricted mode.
 */
function resolveSupportEmailFrom(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!isConfiguredValue(raw)) return EXPECTED_SUPPORT_EMAIL_FROM;
  const parsed = parseEmailAddress(raw);
  const email = String(parsed.email || "").trim().toLowerCase();
  const domain = emailDomainOf(email);
  if (domain === EXPECTED_EMAIL_FROM_DOMAIN && email.includes("@")) {
    const name = String(parsed.name || EXPECTED_EMAIL_FROM_NAME).trim() || EXPECTED_EMAIL_FROM_NAME;
    return `${name} <${email}>`;
  }
  return EXPECTED_SUPPORT_EMAIL_FROM;
}

function emailAutomationsEnabled() {
  return EMAIL_AUTOMATIONS_ENABLED === true;
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

function promoCodeRecords(store = peekStore()) {
  return Array.isArray(store.promoCodes) ? store.promoCodes : [];
}

function seedDefaultPromoCodes(store) {
  if (!store || typeof store !== "object") return false;
  store.promoCodes = Array.isArray(store.promoCodes) ? store.promoCodes : [];
  store.foundingReservations = Array.isArray(store.foundingReservations) ? store.foundingReservations : [];
  let changed = false;
  const try1 = normalizePromoCode("TRY1MONTH");
  if (try1 && !store.promoCodes.some((item) => normalizePromoCode(item?.code) === try1)) {
    store.promoCodes.unshift({
      id: "promo_try1month_default",
      code: try1,
      label: "1 Month Free — card required, then membership continues",
      trialDays: 30,
      status: "active",
      expiresAt: "",
      expiresLabel: "",
      maxRedemptions: null,
      notes: "Default 1-month free promo for creators/influencers. Locks Founding Member pricing when spots remain.",
      source: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    changed = true;
  }
  return changed;
}

function purgeExpiredFoundingReservations(store, { persist = false } = {}) {
  if (!store) return 0;
  store.foundingReservations = Array.isArray(store.foundingReservations) ? store.foundingReservations : [];
  const now = Date.now();
  let changed = 0;
  store.foundingReservations = store.foundingReservations.map((row) => {
    if (!row || row.status !== "held") return row;
    const expiresMs = row.expiresAt ? Date.parse(row.expiresAt) : NaN;
    if (!Number.isFinite(expiresMs) || expiresMs > now) return row;
    // Abandoned checkout holds expire — free the inventory for someone else.
    const email = normalizeEmail(row.email);
    if (email && !(store.users?.[email]?.stripeSubscriptionId)) {
      store.foundingMembers = (store.foundingMembers || []).filter((value) => normalizeEmail(value) !== email);
    }
    changed += 1;
    return {
      ...row,
      status: "released",
      releasedAt: new Date().toISOString(),
      releaseReason: "checkout_hold_expired",
    };
  });
  if (changed && persist) writeStore(store);
  return changed;
}

function publicPromoCode(item = {}) {
  const redemptions = promoRedemptionRecords(peekStore()).filter(
    (record) => normalizePromoCode(record?.code) === normalizePromoCode(item.code),
  );
  return {
    id: item.id || "",
    code: normalizePromoCode(item.code),
    label: String(item.label || "").slice(0, 200),
    trialDays: Number(item.trialDays) || 0,
    status: String(item.status || "active").toLowerCase(),
    expiresAt: item.expiresAt || "",
    expiresLabel: item.expiresLabel || "",
    maxRedemptions: (item.maxRedemptions === null || item.maxRedemptions === undefined || item.maxRedemptions === "")
      ? null
      : (Number.isFinite(Number(item.maxRedemptions)) ? Number(item.maxRedemptions) : null),
    notes: String(item.notes || "").slice(0, 500),
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    redemptionCount: redemptions.length,
    source: item.source || "store",
  };
}

function checkoutPromoForCode(value, store = peekStore()) {
  seedDefaultPromoCodes(store);
  const enteredCode = normalizePromoCode(value);
  if (!enteredCode) return { valid: false, code: "" };

  // Prefer admin-managed promo codes in the store.
  const storePromo = promoCodeRecords(store).find((item) => (
    normalizePromoCode(item?.code) === enteredCode
    && String(item?.status || "active").toLowerCase() === "active"
  ));
  if (storePromo) {
    const trialDays = Math.max(0, Math.min(Number(storePromo.trialDays) || 0, 365));
    const expiresAt = storePromo.expiresAt ? Date.parse(storePromo.expiresAt) : NaN;
    const expired = Number.isFinite(expiresAt) && Date.now() >= expiresAt;
    const rawMax = storePromo.maxRedemptions;
    const max = rawMax === null || rawMax === undefined || rawMax === ""
      ? null
      : (Number.isFinite(Number(rawMax)) ? Number(rawMax) : null);
    const used = promoRedemptionRecords(store).filter(
      (record) => normalizePromoCode(record?.code) === enteredCode,
    ).length;
    if (!trialDays) return { valid: false, code: enteredCode };
    if (expired) {
      return {
        valid: false,
        code: enteredCode,
        expired: true,
        expiresAt: storePromo.expiresAt || "",
        expiresLabel: storePromo.expiresLabel || "",
      };
    }
    if (max != null && used >= max) {
      return { valid: false, code: enteredCode, exhausted: true };
    }
    return {
      valid: true,
      code: enteredCode,
      trialDays,
      label: storePromo.label || `${trialDays} day free Pro trial`,
      expiresAt: storePromo.expiresAt || "",
      expiresLabel: storePromo.expiresLabel || "",
      source: "store",
    };
  }

  // Env fallback (single configured launch promo).
  const configuredCode = normalizePromoCode(PROMO_FREE_TRIAL_CODE);
  const trialDays = Number.isFinite(PROMO_FREE_TRIAL_DAYS) ? Math.max(0, Math.min(PROMO_FREE_TRIAL_DAYS, 365)) : 0;
  const expiresAt = Date.parse(PROMO_FREE_TRIAL_EXPIRES_AT);
  const expired = Number.isFinite(expiresAt) && Date.now() >= expiresAt;
  if (!configuredCode || enteredCode !== configuredCode || trialDays <= 0) {
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
    source: "env",
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
  const fromParsed = parseEmailAddress(SUPPORT_EMAIL_FROM);
  const fromEmail = String(fromParsed.email || "").trim().toLowerCase();
  const fromName = String(fromParsed.name || "").trim();
  const fromDomain = emailDomainOf(fromEmail);
  const envRaw = String(SUPPORT_EMAIL_FROM_ENV || "").trim();
  const envParsed = parseEmailAddress(envRaw);
  const envEmail = String(envParsed.email || "").trim().toLowerCase();
  const envDomain = emailDomainOf(envEmail);
  const domainVerifiedMatch = fromDomain === EXPECTED_EMAIL_FROM_DOMAIN;
  const envWasOverridden = Boolean(envRaw) && resolveSupportEmailFrom(envRaw) !== envRaw
    && !(envDomain === EXPECTED_EMAIL_FROM_DOMAIN);
  const usingResendTestSender = isResendTestSender(envRaw) || isResendTestSender(SUPPORT_EMAIL_FROM);
  const ready = Boolean(provider && keyReady && isConfiguredValue(SUPPORT_EMAIL_FROM) && isConfiguredValue(SUPPORT_EMAIL_TO));
  let note = "Support tickets are saved in Admin. Add RESEND_API_KEY, SENDGRID_API_KEY, or POSTMARK_SERVER_TOKEN plus SUPPORT_EMAIL_FROM to send automatic email notifications.";
  if (ready && domainVerifiedMatch) {
    note = `Outbound From is ${SUPPORT_EMAIL_FROM}. Domain ${EXPECTED_EMAIL_FROM_DOMAIN} matches the canonical verified sender.`;
  } else if (ready && !domainVerifiedMatch) {
    note = `Outbound From domain "${fromDomain || "(empty)"}" does not match verified domain ${EXPECTED_EMAIL_FROM_DOMAIN}. Resend will stay in testing mode until this is fixed.`;
  }
  if (envWasOverridden) {
    note += ` Env SUPPORT_EMAIL_FROM/RESEND_FROM was overridden (was domain "${envDomain || "(empty)"}").`;
  }
  if (usingResendTestSender) {
    note += " A Resend test sender (@resend.dev) was detected in env and is not used.";
  }
  const outboundDisabled = outboundEmailIsDisabled();
  if (outboundDisabled) {
    note = "Outbound email is DISABLED for this environment (DISABLE_OUTBOUND_EMAIL or Director Center preview safe mode). No messages will be sent.";
  }
  return {
    ready: outboundDisabled ? false : ready,
    provider: provider || "not configured",
    to: SUPPORT_EMAIL_TO,
    fromConfigured: isConfiguredValue(SUPPORT_EMAIL_FROM),
    from: SUPPORT_EMAIL_FROM,
    fromName: fromName || EXPECTED_EMAIL_FROM_NAME,
    fromEmail: fromEmail || EXPECTED_EMAIL_FROM_ADDRESS,
    fromDomain: fromDomain || EXPECTED_EMAIL_FROM_DOMAIN,
    expectedFrom: EXPECTED_SUPPORT_EMAIL_FROM,
    expectedDomain: EXPECTED_EMAIL_FROM_DOMAIN,
    domainMatchesExpected: domainVerifiedMatch,
    envFromConfigured: isConfiguredValue(envRaw),
    envFromEmail: envEmail || "",
    envFromDomain: envDomain || "",
    envFromOverridden: envWasOverridden,
    usingResendTestSender,
    automationsEnabled: emailAutomationsEnabled(),
    outboundEmailDisabled: outboundDisabled,
    disableOutboundEmailEnv: DISABLE_OUTBOUND_EMAIL,
    previewSafeMode: isDirectorCenterPreviewSafeMode(),
    note,
  };
}

/**
 * Fail-closed gate for server-owned password-reset / verification emails.
 * Requires Resend + canonical verified From domain. Firebase remains the
 * production auth-email path until this returns true.
 */
function transactionalAuthEmailReady() {
  const status = supportEmailConfigStatus();
  return Boolean(
    status.ready
    && status.provider === "resend"
    && status.domainMatchesExpected
    && !status.usingResendTestSender,
  );
}


function emailUnsubscribeToken(email) {
  if (!isConfiguredValue(EMAIL_UNSUBSCRIBE_SECRET)) return "";
  return crypto
    .createHmac("sha256", EMAIL_UNSUBSCRIBE_SECRET)
    .update(normalizeEmail(email))
    .digest("hex");
}

function validEmailUnsubscribeToken(email, token) {
  const expected = emailUnsubscribeToken(email);
  const supplied = String(token || "");
  if (!expected || expected.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function unsubscribeUrlForEmail(email) {
  const clean = normalizeEmail(email);
  const token = emailUnsubscribeToken(clean);
  return `${SITE_URL.replace(/\/$/, "")}/unsubscribe?email=${encodeURIComponent(clean)}&token=${encodeURIComponent(token)}`;
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
    ? isConfiguredValue(activeDatabaseUrl())
    : isConfiguredValue(activeDatabaseUrl()) && isConfiguredValue(PRODUCTION_DATABASE_SERVICE_KEY);
  const onLiveProduction = expansionFeatureFlags.isLiveProductionSite(SITE_URL);
  let note = onLiveProduction
    ? "Local JSON storage is only for testing. Use a protected hosted database before serious traffic."
    : "Local JSON storage on a non-production host is not durable across restarts/redeploys unless a persistent disk is attached — see docs/OWNER_AND_PROVIDER_TESTING_GUIDE.md.";
  if (postgres && databaseReady) {
    note = onLiveProduction ? "Postgres storage is connected for launch data." : "Postgres storage (TESTING_DATABASE_URL, a separate testing-only database) is connected.";
  } else if (postgres && credentialsReady && lastPostgresError) {
    note = `Postgres is configured, but the last connection/write failed: ${lastPostgresError}`;
  } else if (external && credentialsReady) {
    note = "External database credentials are configured, but readiness is not confirmed yet.";
  }
  return {
    ready: external && credentialsReady && (postgres ? databaseReady : true),
    provider: DATABASE_PROVIDER,
    localJsonPath: storePath,
    lastError: lastPostgresError || "",
    note,
  };
}

async function probePostgresReadiness() {
  if (!usePostgresStore() || !postgresPool) return false;
  try {
    await withTimeout(
      postgresPool.query("SELECT 1 AS ok"),
      5000,
      "Postgres readiness probe",
    );
    // Connectivity only — do NOT mark databaseReady here. Ready means the authentic
    // Postgres store has been loaded into memory. Marking ready on SELECT 1 would let
    // a sparse local fallback get upserted over real membership data.
    return true;
  } catch (error) {
    lastPostgresError = error.message || "Postgres readiness probe failed.";
    console.error("Postgres readiness probe failed:", lastPostgresError);
    return false;
  }
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
    aiSettings: defaultAiSettings(),
    aiPrompts: {},
    aiPromptVersions: [],
    aiUsageLogs: [],
    supportTickets: [],
    bugReports: [],
    featureRequests: [],
    feedbackItems: [],
    communications: [],
    announcements: [],
    releaseNotes: [],
    knowledgeBase: [],
    uploadedResources: [],
    analyticsEvents: [],
    billingEvents: [],
    membershipAudit: [],
    processedStripeEvents: {},
    leads: [],
    promoRedemptions: [],
    promoCodes: [],
    foundingReservations: [],
    siteContent: defaultSiteContentStore(),
    scheduleByUser: {},
    programs: {},
    programData: {},
    programDataBackups: {},
    emailEngagement: defaultEmailEngagementStore(),
    messages: [],
    messageDrafts: [],
    notifications: [],
    pushSubscriptions: [],
    notificationPreferences: {},
    pushDeliveryLog: [],
    pushConfig: {},
    universalDrafts: [],
    messageTemplates: [],
    userTags: {},
    userTimeline: [],
    broadcastLog: [],
    automations: [],
    automationRuns: [],
    archivedConversations: [],
    memberSessions: {},
    ...foundationDataModel.emptyFoundationCollections(),
    foundationMeta: {
      schemaVersion: foundationDataModel.FOUNDATION_SCHEMA_VERSION,
      createdAt: "",
      updatedAt: "",
      migratedExistingUsers: false,
      note: "Phase 1 foundation collections only. No production user migration has run.",
    },
  };
}

// Older stores predate the Messaging Center — default any missing collections
// in place so existing installs upgrade without a migration step.
function ensureMessagingStore(store) {
  store.messages = Array.isArray(store.messages) ? store.messages : [];
  store.messageDrafts = Array.isArray(store.messageDrafts) ? store.messageDrafts : [];
  store.notifications = Array.isArray(store.notifications) ? store.notifications : [];
  store.pushSubscriptions = Array.isArray(store.pushSubscriptions) ? store.pushSubscriptions : [];
  store.notificationPreferences = store.notificationPreferences && typeof store.notificationPreferences === "object"
    ? store.notificationPreferences
    : {};
  store.pushDeliveryLog = Array.isArray(store.pushDeliveryLog) ? store.pushDeliveryLog : [];
  store.pushConfig = store.pushConfig && typeof store.pushConfig === "object" ? store.pushConfig : {};
  return store;
}

// Phase 1 Director/Family foundation — additive empty collections only.
function ensureFoundationCollections(store) {
  return foundationDataModel.ensureFoundationStore(store);
}

function expansionEnvironment() {
  return expansionFeatureFlags.resolveExpansionEnvironment({
    env: process.env,
    siteUrl: SITE_URL,
  });
}

function expansionFlagsFromStore(store = peekStore()) {
  const siteContent = store?.siteContent && typeof store.siteContent === "object"
    ? store.siteContent
    : {};
  return expansionFeatureFlags.normalizeExpansionFeatureFlags(siteContent.featureFlags);
}

function adminTokenFromRequest(request, url = null, options = {}) {
  const allowQueryToken = options.allowQueryToken !== false;
  const authHeader = String(request?.headers?.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const headerToken = String(request?.headers?.["x-llh-admin-token"] || "").trim();
  if (headerToken) return headerToken;
  if (allowQueryToken && url && typeof url.searchParams?.get === "function") {
    return String(url.searchParams.get("adminToken") || "").trim();
  }
  return "";
}

function resolveVerifiedAdminFromRequest(request, url = null, options = {}) {
  // Director Center / foundation admin surfaces reject query-string tokens.
  const token = adminTokenFromRequest(request, url, options);
  if (!token || !validAdminToken(token)) return null;
  const store = peekStore();
  const session = store.adminSessions?.[token] || storeCache?.adminSessions?.[token] || null;
  const email = normalizeEmail(session?.email || "");
  if (!email || !isConfiguredAdminEmail(email)) return null;
  return { token, email, session };
}

function defaultAiSettings() {
  const toolDefaults = () => ({ enabled: true, generationLimit: null, fallbackMessage: "" });
  return {
    masterEnabled: true,
    tools: {
      observation:    toolDefaults(),
      lesson:         toolDefaults(),
      daily:          toolDefaults(),
      parentMessage:  toolDefaults(),
      activity:       toolDefaults(),
      behaviorNote:   toolDefaults(),
      incidentReport: toolDefaults(),
    },
  };
}

function defaultFeatureFlags() {
  // Phase 2H: play-based curriculum is the permanent lesson/activity system.
  // Expansion flags (Director Center / Forms Center / Family Hub) default OFF.
  return {
    playBasedCurriculum: true,
    ...expansionFeatureFlags.defaultExpansionFeatureFlags(),
  };
}

function normalizedFeatureFlags(value) {
  // play-based curriculum is permanently active.
  // directorCenter / formsCenter / familyHub may be stored only in private/testing
  // preview environments — never on live production.
  const merged = expansionFeatureFlags.mergeFeatureFlags(value);
  const env = expansionEnvironment();
  if (env.liveProduction || !env.allowDirectorCenterAdminPreview) {
    merged.directorCenter = false;
  }
  if (env.liveProduction || !env.allowFormsCenterAdminPreview) {
    merged.formsCenter = false;
  }
  if (env.liveProduction || !env.allowFamilyHubTestingPreview) {
    merged.familyHub = false;
  }
  return merged;
}

function defaultFreePlanAccessStore() {
  return {
    enabled: true,
    curatedCutoffAt: "2026-07-18T00:00:00.000Z",
    missingDateMeansLegacy: true,
    earlySupporterTitle: "Early supporter Free access",
    earlySupporterBody:
      "You’re an early Little Learner Hub supporter, so you were grandfathered into the original Free plan. You keep the Free lesson plans and Free tools you’ve already been using. New Free accounts after our Free-plan update get a smaller curated sample — upgrade anytime for unlimited Pro access.",
    freeCalendarPlanningDays: 30,
    freeFavoriteLimit: 20,
    freeChildProfileLimit: 5,
  };
}

function defaultSiteContentStore() {
  return {
    lessonPlans: {},
    customLessonPlans: [],
    activities: [],
    forms: [],
    printables: [],
    menus: [],
    observations: [],
    lessonPlanResourceCategories: [],
    reviews: [],
    founder: {},
    homepage: {},
    pricing: {},
    faqs: [],
    announcement: {},
    upgradeMessaging: {},
    freePlanAccess: defaultFreePlanAccessStore(),
    images: [],
    featureFlags: defaultFeatureFlags(),
    curriculum: defaultCurriculumStore(),
    updatedAt: "",
  };
}

function normalizedFreePlanAccess(value) {
  const defaults = defaultFreePlanAccessStore();
  const entry = value && typeof value === "object" ? value : {};
  const days = Number(entry.freeCalendarPlanningDays);
  const favorites = Number(entry.freeFavoriteLimit);
  const children = Number(entry.freeChildProfileLimit);
  return {
    enabled: typeof entry.enabled === "boolean" ? entry.enabled : defaults.enabled,
    curatedCutoffAt: normalizedShortText(entry.curatedCutoffAt, 80) || defaults.curatedCutoffAt,
    missingDateMeansLegacy: typeof entry.missingDateMeansLegacy === "boolean"
      ? entry.missingDateMeansLegacy
      : defaults.missingDateMeansLegacy,
    earlySupporterTitle: normalizedShortText(entry.earlySupporterTitle, 200) || defaults.earlySupporterTitle,
    earlySupporterBody: normalizedMultilineText(entry.earlySupporterBody, 1200) || defaults.earlySupporterBody,
    freeCalendarPlanningDays: Number.isFinite(days) && days >= 1 ? Math.min(365, Math.floor(days)) : defaults.freeCalendarPlanningDays,
    freeFavoriteLimit: Number.isFinite(favorites) && favorites >= 1 ? Math.min(500, Math.floor(favorites)) : defaults.freeFavoriteLimit,
    freeChildProfileLimit: Number.isFinite(children) && children >= 1 ? Math.min(200, Math.floor(children)) : defaults.freeChildProfileLimit,
  };
}

function normalizedMultilineText(value, maxLength = 12000) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function normalizedShortText(value, maxLength = 240) {
  return normalizedMultilineText(value, maxLength);
}

const AI_VALID_TOOLS = new Set(["observation", "lesson", "daily", "parentMessage", "activity", "behaviorNote", "incidentReport"]);
const AI_PROMPT_LAYERS = ["masterPrompt", "toolSpecificPrompt", "writingIntelligence", "outputFormatting"];
const AI_PROMPT_MAX_CHARS = 32000;

function normalizedAiToolSettings(value) {
  const entry = value && typeof value === "object" ? value : {};
  return {
    enabled: entry.enabled !== false,
    generationLimit: Number.isFinite(Number(entry.generationLimit)) && Number(entry.generationLimit) > 0
      ? Math.floor(Number(entry.generationLimit))
      : null,
    fallbackMessage: normalizedShortText(entry.fallbackMessage, 500),
  };
}

function normalizedAiSettings(value) {
  const entry = value && typeof value === "object" ? value : {};
  const tools = entry.tools && typeof entry.tools === "object" ? entry.tools : {};
  const defaults = defaultAiSettings();
  const normalizedTools = {};
  for (const toolId of AI_VALID_TOOLS) {
    normalizedTools[toolId] = normalizedAiToolSettings(tools[toolId] || defaults.tools[toolId] || {});
  }
  return {
    masterEnabled: entry.masterEnabled !== false,
    tools: normalizedTools,
  };
}

function normalizedAiPromptEntry(value, updatedBy) {
  const entry = value && typeof value === "object" ? value : {};
  const result = { updatedAt: String(entry.updatedAt || ""), updatedBy: String(entry.updatedBy || updatedBy || "") };
  for (const layer of AI_PROMPT_LAYERS) {
    result[layer] = normalizedMultilineText(entry[layer], AI_PROMPT_MAX_CHARS);
  }
  return result;
}

function normalizedAiPrompts(value, updatedBy) {
  const obj = value && typeof value === "object" ? value : {};
  const result = {};
  for (const toolId of AI_VALID_TOOLS) {
    if (obj[toolId]) result[toolId] = normalizedAiPromptEntry(obj[toolId], updatedBy);
  }
  return result;
}

function sanitizedImageSource(value, maxLength = 1_000_000) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(text)) return text.slice(0, maxLength);
  if (/^(https?:)?\/\//i.test(text) || text.startsWith("/")) return text.slice(0, 4000);
  return "";
}

// Accepts image data URLs, PDF data URLs, and external HTTPS URLs for lesson plan resources.
function sanitizedResourceUrl(value, maxLength = 8_000_000) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(text)) return text.slice(0, maxLength);
  if (/^data:application\/pdf;base64,[a-z0-9+/=]+$/i.test(text)) return text.slice(0, maxLength);
  // External URLs: HTTPS only, validated via URL parser
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:") return "";
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

const validLessonPlanResourceCategories = new Set([
  "Coloring Pages",
  "Tracing Activities",
  "Counting Activities",
  "Matching Activities",
  "Crafts",
  "Teacher Resources",
  "Activity Photos",
  "General",
]);

function normalizedLessonPlanResource(value) {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id, 120);
  if (!id) return null;
  const category = validLessonPlanResourceCategories.has(entry.category) ? entry.category : "General";
  const url = sanitizedResourceUrl(entry.url);
  if (!url) return null;
  return {
    id,
    title: normalizedShortText(entry.title, 180) || "Resource",
    category,
    url,
    mimeType: normalizedShortText(entry.mimeType, 60),
    order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 0,
  };
}

function sanitizedUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text.slice(0, 2000);
  return "";
}

function normalizedList(items, limit, mapper) {
  const source = Array.isArray(items)
    ? items
    : typeof items === "string" && items.trim()
      ? items.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
      : [];
  return source.slice(0, limit).map(mapper).filter(Boolean);
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
    visible: entry.visible === true,
    archived: entry.archived === true,
    featured: entry.featured === true,
    thumbnailUrl: sanitizedImageSource(entry.thumbnailUrl),
    updatedAt: normalizedShortText(entry.updatedAt, 80),
    titleThemeImporterUpdated: entry.titleThemeImporterUpdated === true,
    titleThemeImporterUpdatedAt: normalizedShortText(entry.titleThemeImporterUpdatedAt, 80),
    dailyActivities: {
      monday: normalizedMultilineText(days.monday, 4000),
      tuesday: normalizedMultilineText(days.tuesday, 4000),
      wednesday: normalizedMultilineText(days.wednesday, 4000),
      thursday: normalizedMultilineText(days.thursday, 4000),
      friday: normalizedMultilineText(days.friday, 4000),
    },
    resources: normalizedList(entry.resources, 50, normalizedLessonPlanResource),
  };
}

function normalizedFaqEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id, 120);
  if (!id) return null;
  return {
    id,
    question: normalizedShortText(entry.question, 400),
    answer: normalizedMultilineText(entry.answer, 4000),
    visible: entry.visible !== false,
    order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 0,
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

function normalizedActivityEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id, 160);
  if (!id) return null;
  const tagsInput = Array.isArray(entry.tags) ? entry.tags : [];
  return {
    id,
    title: normalizedShortText(entry.title, 200),
    age: normalizedShortText(entry.age, 40),
    activityCategory: normalizedShortText(entry.activityCategory, 80),
    theme: normalizedShortText(entry.theme, 120),
    description: normalizedMultilineText(entry.description, 2000),
    tags: tagsInput.map((t) => normalizedShortText(t, 80)).filter(Boolean).slice(0, 20),
    plan: normalizedShortText(entry.plan, 20),
    format: normalizedShortText(entry.format, 80),
    fileData: sanitizedResourceUrl(entry.fileData),
    previewData: sanitizedImageSource(entry.previewData),
    customContent: normalizedMultilineText(entry.customContent, 20000),
    printableUrl: sanitizedImageSource(entry.printableUrl),
    thumbnailUrl: sanitizedImageSource(entry.thumbnailUrl),
    visible: entry.visible === true,
    archived: entry.archived === true,
    featured: entry.featured === true,
    updatedAt: normalizedShortText(entry.updatedAt, 80),
  };
}

function normalizedLibraryItemEntry(value, defaultCategory) {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id, 160);
  if (!id) return null;
  const tagsInput = Array.isArray(entry.tags) ? entry.tags : [];
  return {
    id,
    title: normalizedShortText(entry.title, 200),
    category: normalizedShortText(entry.category, 80) || defaultCategory,
    age: normalizedShortText(entry.age, 40),
    plan: normalizedShortText(entry.plan, 20),
    description: normalizedMultilineText(entry.description, 2000),
    theme: normalizedShortText(entry.theme, 120),
    formCategory: normalizedShortText(entry.formCategory, 120),
    printableType: normalizedShortText(entry.printableType, 120),
    menuCategory: normalizedShortText(entry.menuCategory, 120),
    learningArea: normalizedShortText(entry.learningArea, 120),
    observationText: normalizedMultilineText(entry.observationText, 20000),
    lookFor: normalizedMultilineText(entry.lookFor, 4000),
    nextSteps: normalizedMultilineText(entry.nextSteps, 4000),
    standard: normalizedMultilineText(entry.standard, 2000),
    tags: tagsInput.map((t) => normalizedShortText(t, 80)).filter(Boolean).slice(0, 20),
    format: normalizedShortText(entry.format, 80),
    fileName: normalizedShortText(entry.fileName, 180),
    fileData: sanitizedResourceUrl(entry.fileData),
    previewName: normalizedShortText(entry.previewName, 180),
    previewData: sanitizedImageSource(entry.previewData),
    customContent: normalizedMultilineText(entry.customContent, 20000),
    visible: entry.visible === true,
    archived: entry.archived === true,
    featured: entry.featured === true,
    updatedAt: normalizedShortText(entry.updatedAt, 80),
  };
}

const UPLOADED_RESOURCE_LIMITS = Object.freeze({
  // Keep aligned with existing frontend form constraints and storage payload sizes.
  id: 180,
  category: 80,
  title: 200,
  age: 40,
  plan: 20,
  month: 40,
  tag: 80,
  format: 80,
  fileName: 180,
  previewName: 180,
});
const DEFAULT_UPLOADED_RESOURCE_CATEGORY = "Forms Library";
const MAX_UPLOADED_RESOURCE_TAGS = 25;
const MAX_UPLOADED_RESOURCES = 3000;
const MAX_UPLOADED_RESOURCES_INCOMING = 1000;

function normalizedUploadedResourceTags(tags) {
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => normalizedShortText(tag, UPLOADED_RESOURCE_LIMITS.tag))
    .filter(Boolean)
    .slice(0, MAX_UPLOADED_RESOURCE_TAGS);
}

function uploadedResourceFingerprint(entry) {
  const payload = {
    category: normalizedShortText(entry.category, UPLOADED_RESOURCE_LIMITS.category),
    title: normalizedShortText(entry.title, UPLOADED_RESOURCE_LIMITS.title),
    age: normalizedShortText(entry.age, UPLOADED_RESOURCE_LIMITS.age),
    plan: normalizedShortText(entry.plan, UPLOADED_RESOURCE_LIMITS.plan),
    month: normalizedShortText(entry.month, UPLOADED_RESOURCE_LIMITS.month),
    tags: normalizedUploadedResourceTags(entry.tags),
    format: normalizedShortText(entry.format, UPLOADED_RESOURCE_LIMITS.format),
    fileName: normalizedShortText(entry.fileName, UPLOADED_RESOURCE_LIMITS.fileName),
    fileData: sanitizedResourceUrl(entry.fileData),
    previewName: normalizedShortText(entry.previewName, UPLOADED_RESOURCE_LIMITS.previewName),
    previewData: sanitizedImageSource(entry.previewData),
    description: normalizedMultilineText(entry.description, 2000),
    customContent: normalizedMultilineText(entry.customContent, 20000),
    visible: entry.visible !== false,
    archived: entry.archived === true,
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 40);
}

function normalizedUploadedResourceEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id, UPLOADED_RESOURCE_LIMITS.id);
  if (!id) return null;
  const normalized = {
    id,
    category: normalizedShortText(entry.category, UPLOADED_RESOURCE_LIMITS.category) || DEFAULT_UPLOADED_RESOURCE_CATEGORY,
    title: normalizedShortText(entry.title, UPLOADED_RESOURCE_LIMITS.title) || "Uploaded Resource",
    age: normalizedShortText(entry.age, UPLOADED_RESOURCE_LIMITS.age) || "All Ages",
    plan: normalizedShortText(entry.plan, UPLOADED_RESOURCE_LIMITS.plan) || "Free",
    month: normalizedShortText(entry.month, UPLOADED_RESOURCE_LIMITS.month),
    tags: normalizedUploadedResourceTags(entry.tags),
    format: normalizedShortText(entry.format, UPLOADED_RESOURCE_LIMITS.format),
    fileName: normalizedShortText(entry.fileName, UPLOADED_RESOURCE_LIMITS.fileName),
    fileData: sanitizedResourceUrl(entry.fileData),
    previewName: normalizedShortText(entry.previewName, UPLOADED_RESOURCE_LIMITS.previewName),
    previewData: sanitizedImageSource(entry.previewData),
    description: normalizedMultilineText(entry.description, 2000),
    customContent: normalizedMultilineText(entry.customContent, 20000),
    visible: entry.visible !== false,
    archived: entry.archived === true,
    updatedAt: normalizedShortText(entry.updatedAt, 80),
  };
  const incomingFingerprint = normalizedShortText(entry.fingerprint, 80);
  normalized.fingerprint = incomingFingerprint || uploadedResourceFingerprint(normalized);
  return normalized;
}

function dedupeUploadedResources(items = [], limit = MAX_UPLOADED_RESOURCES) {
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const unique = [];
  for (const item of items) {
    const normalized = normalizedUploadedResourceEntry(item);
    if (!normalized) continue;
    const fingerprint = normalized.fingerprint;
    if (seenIds.has(normalized.id) || (fingerprint && seenFingerprints.has(fingerprint))) continue;
    seenIds.add(normalized.id);
    if (fingerprint) seenFingerprints.add(fingerprint);
    unique.push(normalized);
    if (unique.length >= limit) break;
  }
  return unique;
}

function mergeUploadedResources(existingItems = [], incomingItems = []) {
  const incoming = dedupeUploadedResources(incomingItems, MAX_UPLOADED_RESOURCES_INCOMING);
  const incomingIds = new Set(incoming.map((item) => item.id));
  const existingRemainder = dedupeUploadedResources(existingItems, MAX_UPLOADED_RESOURCES).filter((item) => !incomingIds.has(item.id));
  return dedupeUploadedResources([...incoming, ...existingRemainder], MAX_UPLOADED_RESOURCES);
}

function normalizedCustomLessonPlanEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  const normalized = normalizedLessonPlanOverride(entry.id, entry);
  if (!normalized.id) return null;
  const tagsInput = Array.isArray(entry.tags) ? entry.tags : [];
  return {
    ...normalized,
    sourceId: normalizedShortText(entry.sourceId, 160),
    month: normalizedShortText(entry.month, 40),
    holiday: normalizedShortText(entry.holiday, 40),
    developmentalArea: normalizedShortText(entry.developmentalArea, 120),
    activityFocus: normalizedShortText(entry.activityFocus, 120),
    description: normalizedMultilineText(entry.description, 2000),
    tags: tagsInput.map((t) => normalizedShortText(t, 80)).filter(Boolean).slice(0, 20),
    archived: entry.archived === true,
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

const CURRICULUM_LEARNING_DOMAINS = new Set([
  "Social Emotional",
  "Language & Literacy",
  "Math",
  "Science",
  "Physical Development",
  "Creative Arts",
]);
const PLAY_ACTIVITY_CATEGORIES = new Set([
  "Circle Time",
  "Literacy",
  "Sensory Play",
  "Fine Motor",
  "Gross Motor",
  "Music & Movement",
  "Art",
  "STEM/Discovery",
  "Dramatic Play",
  "Outdoor Play",
  "Open-Ended Exploration",
]);
const CURRICULUM_LESSON_STATUSES = new Set(["draft", "published", "featured", "archived"]);
const CURRICULUM_ITEM_STATUSES = new Set(["draft", "published", "archived"]);
const CURRICULUM_WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]);
const CURRICULUM_RESOURCE_CATEGORIES = new Set([
  "Classroom Resources",
  "Behavior & Social Emotional",
  "Printables",
]);
const MAX_CURRICULUM_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_CURRICULUM_UPLOAD_MB = 5;
const CURRICULUM_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_LESSON_COVER_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_LESSON_COVER_UPLOAD_MB = 2;
const LESSON_COVER_UPLOAD_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function sanitizedLessonCoverUrl(value) {
  const source = sanitizedImageSource(value);
  return source && !source.startsWith("data:") ? source : "";
}

function defaultCurriculumStore() {
  return {
    lessonPlans: [],
    activities: [],
    resources: [],
    series: [],
    updatedAt: "",
  };
}

const curriculumSeriesApi = (() => {
  try {
    return require("../scripts/curriculum-series.js");
  } catch {
    return null;
  }
})();

function normalizedCurriculumSeries(value) {
  if (curriculumSeriesApi?.normalizedCurriculumSeries) {
    return curriculumSeriesApi.normalizedCurriculumSeries(value);
  }
  return null;
}

function validateCurriculumSeriesForPublish(series, lessonPlans) {
  if (curriculumSeriesApi?.validateCurriculumSeriesForPublish) {
    return curriculumSeriesApi.validateCurriculumSeriesForPublish(series, lessonPlans);
  }
  return ["Curriculum series validation is unavailable."];
}

function generateCurriculumSeriesId() {
  return `cur-series-${crypto.randomBytes(8).toString("hex")}`;
}

function normalizedCurriculumLearningDomains(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => normalizedShortText(item, 80))
    .filter((item) => CURRICULUM_LEARNING_DOMAINS.has(item))
    .slice(0, 6);
}

function normalizedCurriculumBookEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  const title = normalizedShortText(entry.title, 180);
  if (!title) return null;
  return {
    title,
    author: normalizedShortText(entry.author, 120),
    notes: normalizedMultilineText(entry.notes, 1000),
  };
}

function normalizedCurriculumSongEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  const title = normalizedShortText(entry.title, 180);
  if (!title) return null;
  return {
    title,
    notes: normalizedMultilineText(entry.notes, 1000),
  };
}

function generateCurriculumItemId() {
  return `item-${crypto.randomBytes(8).toString("hex")}`;
}

function curriculumActivitySourceKey(lessonPlanId, itemId) {
  const planId = normalizedShortText(lessonPlanId, 160);
  const planItemId = normalizedShortText(itemId, 120);
  if (!planId || !planItemId) return "";
  return `${planId}:${planItemId}`;
}

const CURRICULUM_PREMIUM_TEXT_LIMIT = 12000;

function normalizedCurriculumTextList(value, maxItems = 30, maxItemLength = 4000) {
  return normalizedList(value, maxItems, (item) => normalizedMultilineText(item, maxItemLength)).filter(Boolean);
}

function normalizedCurriculumDailyPlanDay(value) {
  const entry = value && typeof value === "object" ? value : {};
  return {
    theme: normalizedMultilineText(entry.theme, 2000),
    objectives: normalizedMultilineText(entry.objectives, 4000),
    learningDomains: normalizedCurriculumLearningDomains(entry.learningDomains),
    materials: normalizedMultilineText(entry.materials, 4000),
    vocabulary: normalizedMultilineText(entry.vocabulary, 2000),
    books: normalizedList(entry.books, 20, normalizedCurriculumBookEntry),
    songs: normalizedList(entry.songs, 20, normalizedCurriculumSongEntry),
    circleTime: normalizedCurriculumTextList(entry.circleTime, 20, 4000),
    transitions: normalizedCurriculumTextList(entry.transitions, 20, 4000),
    outdoorPlay: normalizedMultilineText(entry.outdoorPlay, 4000),
    familyConnection: normalizedMultilineText(entry.familyConnection, 4000),
    observations: normalizedCurriculumTextList(entry.observations, 20, 4000),
    adaptations: normalizedMultilineText(entry.adaptations, 4000),
    safetyNotes: normalizedMultilineText(entry.safetyNotes, 4000),
    items: [],
  };
}

function normalizedCurriculumDailyPlanItem(value) {
  const entry = value && typeof value === "object" ? value : {};
  const title = normalizedShortText(entry.title, 180);
  if (!title) return null;
  const category = normalizedShortText(entry.activityCategory, 80);
  let itemId = normalizedShortText(entry.itemId, 120);
  if (!itemId) itemId = generateCurriculumItemId();
  return {
    itemId,
    importKey: normalizedShortText(entry.importKey, 160),
    activityCategory: PLAY_ACTIVITY_CATEGORIES.has(category) ? category : "Open-Ended Exploration",
    title,
    objective: normalizedMultilineText(entry.objective, 4000),
    description: normalizedMultilineText(entry.description, 4000),
    learningDomains: normalizedCurriculumLearningDomains(entry.learningDomains),
    materials: normalizedMultilineText(entry.materials, 4000),
    setup: normalizedMultilineText(entry.setup, CURRICULUM_PREMIUM_TEXT_LIMIT),
    steps: normalizedMultilineText(entry.steps || entry.directions, CURRICULUM_PREMIUM_TEXT_LIMIT),
    teacherRole: normalizedMultilineText(entry.teacherRole, 4000),
    teacherLanguage: normalizedMultilineText(entry.teacherLanguage, CURRICULUM_PREMIUM_TEXT_LIMIT),
    learningGoals: normalizedList(entry.learningGoals, 20, (item) => normalizedMultilineText(item, 500)).filter(Boolean),
    observationOpportunities: normalizedMultilineText(entry.observationOpportunities, 4000),
    vocabulary: normalizedMultilineText(entry.vocabulary, 4000),
    extensions: normalizedMultilineText(entry.extensions, 4000),
    adaptations: normalizedMultilineText(entry.adaptations, 4000),
    safetyNotes: normalizedMultilineText(entry.safetyNotes, 4000),
    ageModifications: normalizedMultilineText(entry.ageModifications, 4000),
  };
}

function normalizedCurriculumDailyPlans(value, lessonPlanId) {
  const input = value && typeof value === "object" ? value : {};
  const days = {};
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const dayInput = input[day] && typeof input[day] === "object" ? input[day] : {};
    const normalizedDay = normalizedCurriculumDailyPlanDay(dayInput);
    normalizedDay.items = normalizedList(dayInput.items, 30, normalizedCurriculumDailyPlanItem).map((item) => ({
      ...item,
      sourceKey: curriculumActivitySourceKey(lessonPlanId, item.itemId),
    }));
    days[day] = normalizedDay;
  });
  return days;
}

function normalizedCurriculumLessonPlan(value) {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id, 160);
  if (!id) return null;
  const status = normalizedShortText(entry.status, 20);
  const plan = normalizedShortText(entry.plan, 20);
  return {
    id,
    title: normalizedShortText(entry.title, 180) || "Untitled Lesson Plan",
    age: normalizedShortText(entry.age, 40) || "Preschool",
    theme: normalizedShortText(entry.theme, 120),
    plan: plan === "Pro" ? "Pro" : "Free",
    status: CURRICULUM_LESSON_STATUSES.has(status) ? status : "draft",
    learningDomains: normalizedCurriculumLearningDomains(entry.learningDomains),
    weeklyOverview: normalizedMultilineText(entry.weeklyOverview, 4000),
    objectives: normalizedMultilineText(entry.objectives, 4000),
    books: normalizedList(entry.books, 20, normalizedCurriculumBookEntry),
    songs: normalizedList(entry.songs, 20, normalizedCurriculumSongEntry),
    weeklyMaterials: normalizedMultilineText(entry.weeklyMaterials, 4000),
    vocabularyWords: normalizedMultilineText(entry.vocabularyWords, 2000),
    observationOpportunities: normalizedMultilineText(entry.observationOpportunities, 4000),
    adaptations: normalizedMultilineText(entry.adaptations, 4000),
    familyConnection: normalizedMultilineText(entry.familyConnection, 4000),
    dailyPlans: normalizedCurriculumDailyPlans(entry.dailyPlans, id),
    activityIds: normalizedList(entry.activityIds, 200, (item) => normalizedShortText(item, 160)).filter(Boolean),
    resourceIds: normalizedList(entry.resourceIds, 200, (item) => normalizedShortText(item, 160)).filter(Boolean),
    // Cover records store URLs only. Uploaded bytes live in llh_media_assets,
    // never in the lesson-plan JSON or Render's ephemeral filesystem.
    coverImageUrl: sanitizedLessonCoverUrl(entry.coverImageUrl || entry.thumbnailUrl || ""),
    coverImageAlt: normalizedShortText(entry.coverImageAlt, 240),
    coverImageSource: ["uploaded", "generated", "default", "mapped"].includes(String(entry.coverImageSource || "").trim())
      ? String(entry.coverImageSource).trim()
      : (sanitizedLessonCoverUrl(entry.coverImageUrl || entry.thumbnailUrl || "") ? "uploaded" : ""),
    coverImagePosition: normalizedShortText(entry.coverImagePosition, 40) || "center",
    createdAt: normalizedShortText(entry.createdAt, 80),
    updatedAt: normalizedShortText(entry.updatedAt, 80),
    // Set when status first becomes published/featured; used by weekly "What's New" digests.
    publishedAt: normalizedShortText(entry.publishedAt, 80),
  };
}

function normalizedCurriculumActivity(value) {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id, 160);
  const lessonPlanId = normalizedShortText(entry.lessonPlanId, 160);
  if (!id || !lessonPlanId) return null;
  const status = normalizedShortText(entry.status, 20);
  const category = normalizedShortText(entry.activityCategory, 80);
  const dayOfWeek = normalizedShortText(entry.dayOfWeek, 20).toLowerCase();
  const incomingItemId = normalizedShortText(entry.itemId, 120);
  const incomingSourceKey = normalizedShortText(entry.sourceKey, 200);
  const prefix = `${lessonPlanId}:`;
  let itemId = incomingItemId;
  if (!itemId && incomingSourceKey.startsWith(prefix) && incomingSourceKey.length > prefix.length) {
    itemId = incomingSourceKey.slice(prefix.length);
  }
  const sourceKey = itemId
    ? curriculumActivitySourceKey(lessonPlanId, itemId)
    : incomingSourceKey.startsWith(prefix)
      ? incomingSourceKey
      : "";
  return {
    id,
    lessonPlanId,
    itemId: itemId || "",
    sourceKey,
    dayOfWeek: CURRICULUM_WEEKDAYS.has(dayOfWeek) ? dayOfWeek : "",
    activityCategory: PLAY_ACTIVITY_CATEGORIES.has(category) ? category : "Open-Ended Exploration",
    title: normalizedShortText(entry.title, 180) || "Activity",
    objective: normalizedMultilineText(entry.objective, 4000),
    description: normalizedMultilineText(entry.description, 4000),
    learningDomains: normalizedCurriculumLearningDomains(entry.learningDomains),
    materials: normalizedMultilineText(entry.materials, 4000),
    setup: normalizedMultilineText(entry.setup, CURRICULUM_PREMIUM_TEXT_LIMIT),
    steps: normalizedMultilineText(entry.steps || entry.directions, CURRICULUM_PREMIUM_TEXT_LIMIT),
    teacherRole: normalizedMultilineText(entry.teacherRole, 4000),
    teacherLanguage: normalizedMultilineText(entry.teacherLanguage, CURRICULUM_PREMIUM_TEXT_LIMIT),
    learningGoals: normalizedList(entry.learningGoals, 20, (item) => normalizedMultilineText(item, 500)).filter(Boolean),
    observationOpportunities: normalizedMultilineText(entry.observationOpportunities, 4000),
    vocabulary: normalizedMultilineText(entry.vocabulary, 4000),
    extensions: normalizedMultilineText(entry.extensions, 4000),
    adaptations: normalizedMultilineText(entry.adaptations, 4000),
    safetyNotes: normalizedMultilineText(entry.safetyNotes, 4000),
    ageModifications: normalizedMultilineText(entry.ageModifications, 4000),
    status: CURRICULUM_ITEM_STATUSES.has(status) ? status : "draft",
    createdAt: normalizedShortText(entry.createdAt, 80),
    updatedAt: normalizedShortText(entry.updatedAt, 80),
    publishedAt: normalizedShortText(entry.publishedAt, 80),
  };
}

function sanitizedCurriculumFileData(value) {
  // Same durable pattern as Forms / Printables / legacy Uploads / lesson attachments:
  // PDF/image data URLs or HTTPS URLs stored in the Postgres JSON store.
  return sanitizedResourceUrl(value);
}

function normalizedCurriculumResource(value) {
  const entry = value && typeof value === "object" ? value : {};
  const id = normalizedShortText(entry.id, 160);
  if (!id) return null;
  const status = normalizedShortText(entry.status, 20);
  const category = normalizedShortText(entry.resourceCategory, 80);
  // Prefer fileData; accept legacy fileUrl only when it is an HTTPS URL (not disk paths).
  const legacyUrl = String(entry.fileUrl || "").trim();
  const legacyHttps = /^https:\/\//i.test(legacyUrl) ? sanitizedCurriculumFileData(legacyUrl) : "";
  const fileData = sanitizedCurriculumFileData(entry.fileData) || legacyHttps;
  return {
    id,
    title: normalizedShortText(entry.title, 180) || "Resource",
    resourceCategory: CURRICULUM_RESOURCE_CATEGORIES.has(category) ? category : "Classroom Resources",
    fileData,
    mimeType: normalizedShortText(entry.mimeType, 80),
    fileName: normalizedShortText(entry.fileName, 180),
    lessonPlanIds: normalizedList(entry.lessonPlanIds, 50, (item) => normalizedShortText(item, 160)).filter(Boolean),
    status: CURRICULUM_ITEM_STATUSES.has(status) ? status : "draft",
    createdAt: normalizedShortText(entry.createdAt, 80),
    updatedAt: normalizedShortText(entry.updatedAt, 80),
    publishedAt: normalizedShortText(entry.publishedAt, 80),
  };
}

function normalizedCurriculumStore(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    lessonPlans: normalizedList(input.lessonPlans, 500, normalizedCurriculumLessonPlan),
    activities: normalizedList(input.activities, 3000, normalizedCurriculumActivity),
    resources: normalizedList(input.resources, 3000, normalizedCurriculumResource),
    series: normalizedList(input.series, 500, normalizedCurriculumSeries),
    updatedAt: normalizedShortText(input.updatedAt, 80),
  };
}

function validateCurriculumIntegrity(curriculum) {
  const store = normalizedCurriculumStore(curriculum);
  const lessonPlanIds = new Set(store.lessonPlans.map((item) => item.id));
  const activityIds = new Set(store.activities.map((item) => item.id));
  const resourceIds = new Set(store.resources.map((item) => item.id));
  const errors = [];
  store.activities.forEach((activity) => {
    if (!lessonPlanIds.has(activity.lessonPlanId)) {
      errors.push(`Activity ${activity.id} references missing lesson plan ${activity.lessonPlanId}.`);
    }
  });
  store.resources.forEach((resource) => {
    resource.lessonPlanIds.forEach((lessonPlanId) => {
      if (!lessonPlanIds.has(lessonPlanId)) {
        errors.push(`Resource ${resource.id} references missing lesson plan ${lessonPlanId}.`);
      }
    });
  });
  store.lessonPlans.forEach((lessonPlan) => {
    lessonPlan.activityIds.forEach((activityId) => {
      if (!activityIds.has(activityId)) {
        errors.push(`Lesson plan ${lessonPlan.id} references missing activity ${activityId}.`);
      }
    });
    lessonPlan.resourceIds.forEach((resourceId) => {
      if (!resourceIds.has(resourceId)) {
        errors.push(`Lesson plan ${lessonPlan.id} references missing resource ${resourceId}.`);
      }
    });
  });
  // Series only link existing weekly plans — never require nested plan copies.
  store.series.forEach((series) => {
    (series.weeks || []).forEach((week) => {
      if (week.lessonPlanId && !lessonPlanIds.has(week.lessonPlanId)) {
        errors.push(`Curriculum series ${series.id} Week ${week.weekNumber} references missing lesson plan ${week.lessonPlanId}.`);
      }
    });
  });
  return { valid: errors.length === 0, errors };
}

function curriculumResourceMetadata(resource) {
  const entry = normalizedCurriculumResource(resource);
  if (!entry) return null;
  return {
    id: entry.id,
    title: entry.title,
    resourceCategory: entry.resourceCategory,
    mimeType: entry.mimeType,
    fileName: entry.fileName,
    lessonPlanIds: entry.lessonPlanIds,
    status: entry.status,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    hasFile: Boolean(entry.fileData),
  };
}

function curriculumWithoutFileData(curriculum) {
  const store = normalizedCurriculumStore(curriculum);
  return {
    ...store,
    resources: store.resources.map((item) => curriculumResourceMetadata(item)).filter(Boolean),
  };
}

function isCurriculumLessonPublic(status) {
  return status === "published" || status === "featured";
}

function isCurriculumResourcePublic(status) {
  return status === "published";
}

function curriculumTextExcerpt(text, maxWords = 40) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return words.slice(0, maxWords).join(" ");
}

function isCurriculumProLesson(plan) {
  return normalizedCurriculumLessonPlan(plan)?.plan === "Pro";
}

function authorizedCurriculumDailyPlanItemDto(item) {
  if (!item || typeof item !== "object") return null;
  return {
    activityCategory: item.activityCategory,
    title: item.title,
    objective: item.objective,
    description: item.description,
    learningDomains: item.learningDomains,
    materials: item.materials,
    setup: item.setup,
    steps: item.steps,
    teacherRole: item.teacherRole,
    teacherLanguage: item.teacherLanguage,
    learningGoals: item.learningGoals,
    observationOpportunities: item.observationOpportunities,
    vocabulary: item.vocabulary,
    extensions: item.extensions,
    adaptations: item.adaptations,
    safetyNotes: item.safetyNotes,
    ageModifications: item.ageModifications,
    itemId: item.itemId || "",
  };
}

function authorizedCurriculumDailyPlansDto(dailyPlans) {
  const input = dailyPlans && typeof dailyPlans === "object" ? dailyPlans : {};
  const days = {};
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const dayInput = input[day] && typeof input[day] === "object" ? input[day] : {};
    days[day] = {
      theme: dayInput.theme || "",
      objectives: dayInput.objectives || "",
      learningDomains: dayInput.learningDomains || [],
      materials: dayInput.materials || "",
      vocabulary: dayInput.vocabulary || "",
      books: dayInput.books || [],
      songs: dayInput.songs || [],
      circleTime: dayInput.circleTime || [],
      transitions: dayInput.transitions || [],
      outdoorPlay: dayInput.outdoorPlay || "",
      familyConnection: dayInput.familyConnection || "",
      observations: dayInput.observations || [],
      adaptations: dayInput.adaptations || "",
      safetyNotes: dayInput.safetyNotes || "",
      items: (Array.isArray(dayInput.items) ? dayInput.items : [])
        .map((item) => authorizedCurriculumDailyPlanItemDto(item))
        .filter(Boolean),
    };
  });
  return days;
}

function publicCurriculumLessonPlanPreviewDto(plan) {
  const entry = normalizedCurriculumLessonPlan(plan);
  if (!entry || !isCurriculumLessonPublic(entry.status)) return null;
  if (freeCurriculumSample.isCuratedFreeLessonPlan(entry)) return null;
  // Public Pro teaser: overview metadata only. Do not ship objectives, materials,
  // vocabulary, books, songs, or activity names — those unlock with paid access.
  let activityCount = 0;
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const items = Array.isArray(entry.dailyPlans?.[day]?.items) ? entry.dailyPlans[day].items : [];
    activityCount += items.filter((item) => String(item?.title || "").trim()).length;
  });
  return {
    id: entry.id,
    title: entry.title,
    age: entry.age,
    theme: entry.theme,
    plan: "Pro",
    status: entry.status,
    locked: true,
    learningDomains: entry.learningDomains.slice(0, 6),
    weeklyOverview: curriculumTextExcerpt(entry.weeklyOverview, 80),
    activityCount,
    coverImageUrl: entry.coverImageUrl,
    coverImageAlt: entry.coverImageAlt,
    coverImageSource: entry.coverImageSource,
    coverImagePosition: entry.coverImagePosition,
    updatedAt: entry.updatedAt,
  };
}

function curriculumLessonPlanUnlockedFreeDto(plan) {
  const entry = normalizedCurriculumLessonPlan(plan);
  if (!entry || !isCurriculumLessonPublic(entry.status)) return null;
  return {
    id: entry.id,
    title: entry.title,
    age: entry.age,
    theme: entry.theme,
    plan: freePlanGrandfathering.isLegacyStoreFreePlan(entry) ? "Free" : (entry.plan || "Free"),
    status: entry.status,
    locked: false,
    learningDomains: entry.learningDomains,
    weeklyOverview: entry.weeklyOverview,
    objectives: entry.objectives,
    books: entry.books,
    songs: entry.songs,
    weeklyMaterials: entry.weeklyMaterials,
    vocabularyWords: entry.vocabularyWords,
    observationOpportunities: entry.observationOpportunities,
    adaptations: entry.adaptations,
    familyConnection: entry.familyConnection,
    dailyPlans: authorizedCurriculumDailyPlansDto(entry.dailyPlans),
    resourceIds: entry.resourceIds,
    coverImageUrl: entry.coverImageUrl,
    coverImageAlt: entry.coverImageAlt,
    coverImageSource: entry.coverImageSource,
    coverImagePosition: entry.coverImagePosition,
    updatedAt: entry.updatedAt,
  };
}

function publicCurriculumLessonPlanFreeDto(plan) {
  const entry = normalizedCurriculumLessonPlan(plan);
  if (!entry || !isCurriculumLessonPublic(entry.status)) return null;
  if (!freeCurriculumSample.isCuratedFreeLessonPlan(entry)) return null;
  return curriculumLessonPlanUnlockedFreeDto(plan);
}

function freePlanAccessContextFromUser(user, siteContent = null) {
  return {
    siteContent: siteContent || null,
    legacyFree: freePlanGrandfathering.hasLegacyFreeLessonAccess(user || {}, { siteContent }),
    mode: freePlanGrandfathering.resolveFreeLessonAccessMode(user || {}, { siteContent }),
  };
}

function userMayUnlockFreeCurriculumPlan(plan, accessContext = {}) {
  const entry = normalizedCurriculumLessonPlan(plan);
  if (!entry) return false;
  if (freeCurriculumSample.isCuratedFreeLessonPlan(entry)) return true;
  if (accessContext?.legacyFree && freePlanGrandfathering.isLegacyStoreFreePlan(entry)) return true;
  return false;
}

function authorizedCurriculumLessonPlanDto(plan) {
  const entry = normalizedCurriculumLessonPlan(plan);
  if (!entry || !isCurriculumLessonPublic(entry.status)) return null;
  return {
    id: entry.id,
    title: entry.title,
    age: entry.age,
    theme: entry.theme,
    plan: entry.plan,
    status: entry.status,
    locked: false,
    learningDomains: entry.learningDomains,
    weeklyOverview: entry.weeklyOverview,
    objectives: entry.objectives,
    books: entry.books,
    songs: entry.songs,
    weeklyMaterials: entry.weeklyMaterials,
    vocabularyWords: entry.vocabularyWords,
    observationOpportunities: entry.observationOpportunities,
    adaptations: entry.adaptations,
    familyConnection: entry.familyConnection,
    dailyPlans: authorizedCurriculumDailyPlansDto(entry.dailyPlans),
    activityIds: entry.activityIds,
    resourceIds: entry.resourceIds,
    coverImageUrl: entry.coverImageUrl,
    coverImageAlt: entry.coverImageAlt,
    coverImageSource: entry.coverImageSource,
    coverImagePosition: entry.coverImagePosition,
    updatedAt: entry.updatedAt,
  };
}

function publicCurriculumLessonPlanDto(plan, accessContext = {}) {
  const entry = normalizedCurriculumLessonPlan(plan);
  if (!entry || !isCurriculumLessonPublic(entry.status)) return null;
  if (userMayUnlockFreeCurriculumPlan(entry, accessContext)) {
    return curriculumLessonPlanUnlockedFreeDto(plan);
  }
  return publicCurriculumLessonPlanPreviewDto(plan);
}

function publicCurriculumActivityPreviewDto(activity, parentPlan) {
  const entry = normalizedCurriculumActivity(activity);
  if (!entry || entry.status !== "published") return null;
  if (!parentPlan || !isCurriculumLessonPublic(parentPlan.status)) return null;
  if (freeCurriculumSample.isCuratedFreeLessonPlan(parentPlan)) return null;
  // Overview teaser only — no description/materials/steps/teacher language/etc.
  return {
    id: entry.id,
    lessonPlanId: entry.lessonPlanId,
    title: entry.title,
    activityCategory: entry.activityCategory,
    dayOfWeek: entry.dayOfWeek,
    plan: parentPlan.plan,
    locked: true,
    learningDomains: entry.learningDomains.slice(0, 3),
    parentTitle: parentPlan.title,
    parentAge: parentPlan.age,
    parentPlan: parentPlan.plan,
    updatedAt: entry.updatedAt,
  };
}

function curriculumActivityUnlockedFreeDto(activity, parentPlan) {
  const entry = normalizedCurriculumActivity(activity);
  if (!entry || entry.status !== "published") return null;
  if (!parentPlan || !isCurriculumLessonPublic(parentPlan.status)) return null;
  return {
    id: entry.id,
    lessonPlanId: entry.lessonPlanId,
    title: entry.title,
    activityCategory: entry.activityCategory,
    dayOfWeek: entry.dayOfWeek,
    plan: "Free",
    locked: false,
    objective: entry.objective,
    description: entry.description,
    materials: entry.materials,
    setup: entry.setup,
    steps: entry.steps,
    teacherRole: entry.teacherRole,
    teacherLanguage: entry.teacherLanguage,
    observationOpportunities: entry.observationOpportunities,
    vocabulary: entry.vocabulary,
    extensions: entry.extensions,
    adaptations: entry.adaptations,
    safetyNotes: entry.safetyNotes,
    ageModifications: entry.ageModifications,
    learningDomains: entry.learningDomains,
    learningGoals: entry.learningGoals,
    parentTitle: parentPlan.title,
    parentAge: parentPlan.age,
    parentPlan: parentPlan.plan,
    updatedAt: entry.updatedAt,
  };
}

function publicCurriculumActivityFreeDto(activity, parentPlan) {
  if (!parentPlan || !freeCurriculumSample.isCuratedFreeLessonPlan(parentPlan)) return null;
  return curriculumActivityUnlockedFreeDto(activity, parentPlan);
}

function authorizedCurriculumActivityDto(activity, parentPlan) {
  const entry = normalizedCurriculumActivity(activity);
  if (!entry || entry.status !== "published") return null;
  if (!parentPlan || !isCurriculumLessonPublic(parentPlan.status)) return null;
  return {
    id: entry.id,
    lessonPlanId: entry.lessonPlanId,
    dayOfWeek: entry.dayOfWeek,
    activityCategory: entry.activityCategory,
    title: entry.title,
    objective: entry.objective,
    description: entry.description,
    materials: entry.materials,
    setup: entry.setup,
    steps: entry.steps,
    teacherRole: entry.teacherRole,
    teacherLanguage: entry.teacherLanguage,
    observationOpportunities: entry.observationOpportunities,
    vocabulary: entry.vocabulary,
    extensions: entry.extensions,
    adaptations: entry.adaptations,
    safetyNotes: entry.safetyNotes,
    ageModifications: entry.ageModifications,
    learningDomains: entry.learningDomains,
    learningGoals: entry.learningGoals,
    plan: parentPlan.plan,
    locked: false,
    parentTitle: parentPlan.title,
    parentAge: parentPlan.age,
    parentPlan: parentPlan.plan,
    updatedAt: entry.updatedAt,
  };
}

/** Browse/list card for Activity Center — full how-to stays on the detail endpoint. */
function authorizedCurriculumActivityListDto(activity, parentPlan) {
  const entry = normalizedCurriculumActivity(activity);
  if (!entry || entry.status !== "published") return null;
  if (!parentPlan || !isCurriculumLessonPublic(parentPlan.status)) return null;
  return {
    id: entry.id,
    lessonPlanId: entry.lessonPlanId,
    title: entry.title,
    activityCategory: entry.activityCategory,
    dayOfWeek: entry.dayOfWeek,
    plan: parentPlan.plan,
    locked: false,
    learningDomains: (entry.learningDomains || []).slice(0, 3),
    parentTitle: parentPlan.title,
    parentAge: parentPlan.age,
    parentPlan: parentPlan.plan,
    updatedAt: entry.updatedAt,
  };
}

/** Browse/list card for Lesson Plan Library — full dailyPlans stay on the detail endpoint. */
function authorizedCurriculumLessonPlanListDto(plan) {
  const entry = normalizedCurriculumLessonPlan(plan);
  if (!entry || !isCurriculumLessonPublic(entry.status)) return null;
  let activityCount = 0;
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const items = Array.isArray(entry.dailyPlans?.[day]?.items) ? entry.dailyPlans[day].items : [];
    activityCount += items.filter((item) => String(item?.title || "").trim()).length;
  });
  return {
    id: entry.id,
    title: entry.title,
    age: entry.age,
    theme: entry.theme,
    plan: entry.plan,
    status: entry.status,
    locked: false,
    learningDomains: entry.learningDomains,
    weeklyOverview: curriculumTextExcerpt(entry.weeklyOverview, 80),
    activityCount,
    activityIds: entry.activityIds,
    resourceIds: entry.resourceIds,
    coverImageUrl: entry.coverImageUrl,
    coverImageAlt: entry.coverImageAlt,
    coverImageSource: entry.coverImageSource,
    coverImagePosition: entry.coverImagePosition,
    updatedAt: entry.updatedAt,
  };
}

function publicCurriculumActivityDto(activity, parentPlan, accessContext = {}) {
  const entry = normalizedCurriculumActivity(activity);
  if (!entry || entry.status !== "published") return null;
  if (!parentPlan || !isCurriculumLessonPublic(parentPlan.status)) return null;
  if (userMayUnlockFreeCurriculumPlan(parentPlan, accessContext)) {
    return curriculumActivityUnlockedFreeDto(activity, parentPlan);
  }
  return publicCurriculumActivityPreviewDto(activity, parentPlan);
}

function curriculumParentPlanMeta(plan) {
  const entry = normalizedCurriculumLessonPlan(plan);
  if (!entry || !isCurriculumLessonPublic(entry.status)) return null;
  return {
    id: entry.id,
    title: entry.title,
    age: entry.age,
    plan: entry.plan,
    status: entry.status,
  };
}

function authorizedCurriculumLibraryDto(siteContent) {
  // Pro / Founding / Trial / admin-override users get an unlocked *browse* library.
  // Full dailyPlans / activity how-to stay on the detail endpoints so /api/site-content
  // stays small enough for installed-app cold starts on mobile.
  const store = normalizedCurriculumStore(siteContent?.curriculum);
  const lessonPlans = store.lessonPlans
    .map((plan) => authorizedCurriculumLessonPlanListDto(plan))
    .filter(Boolean)
    .sort((a, b) => {
      const featuredDelta = (b.status === "featured" ? 1 : 0) - (a.status === "featured" ? 1 : 0);
      if (featuredDelta) return featuredDelta;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  const parentPlanById = new Map(
    store.lessonPlans
      .map((plan) => curriculumParentPlanMeta(plan))
      .filter(Boolean)
      .map((plan) => [plan.id, plan]),
  );
  const publicLessonIds = new Set(lessonPlans.map((plan) => plan.id));
  const activities = store.activities
    .map((activity) => authorizedCurriculumActivityListDto(activity, parentPlanById.get(activity.lessonPlanId)))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const resources = store.resources
    .map((resource) => {
      const meta = curriculumResourceMetadata(resource);
      if (!meta || !isCurriculumResourcePublic(meta.status)) return null;
      const linkedToPublicLesson = (meta.lessonPlanIds || []).some((id) => publicLessonIds.has(id));
      if (!linkedToPublicLesson) return null;
      return meta;
    })
    .filter(Boolean);
  return {
    lessonPlans,
    activities,
    resources,
    series: store.series || [],
    updatedAt: store.updatedAt || "",
    freeLessonAccessMode: "pro",
  };
}

function publicCurriculumLibraryDto(siteContent, accessContext = {}) {
  // Phase 2H: curriculum library is always the public lesson/activity source.
  // accessContext.legacyFree unlocks all store Free-tier plans for grandfathered accounts.
  const store = normalizedCurriculumStore(siteContent?.curriculum);
  const lessonPlans = store.lessonPlans
    .map((plan) => publicCurriculumLessonPlanDto(plan, accessContext))
    .filter(Boolean)
    .sort((a, b) => {
      const featuredDelta = (b.status === "featured" ? 1 : 0) - (a.status === "featured" ? 1 : 0);
      if (featuredDelta) return featuredDelta;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  const parentPlanById = new Map(
    store.lessonPlans
      .map((plan) => curriculumParentPlanMeta(plan))
      .filter(Boolean)
      .map((plan) => [plan.id, plan]),
  );
  const publicLessonIds = new Set(lessonPlans.map((plan) => plan.id));
  const activities = store.activities
    .map((activity) => publicCurriculumActivityDto(activity, parentPlanById.get(activity.lessonPlanId), accessContext))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const resources = store.resources
    .map((resource) => {
      const meta = curriculumResourceMetadata(resource);
      if (!meta || !isCurriculumResourcePublic(meta.status)) return null;
      const linkedToPublicLesson = (meta.lessonPlanIds || []).some((id) => publicLessonIds.has(id));
      if (!linkedToPublicLesson) return null;
      return meta;
    })
    .filter(Boolean);
  const series = (store.series || [])
    .filter((entry) => entry && ["published", "featured", "needs_review"].includes(entry.status))
    .map((entry) => ({
      ...entry,
      weeks: (entry.weeks || []).map((week) => ({
        weekNumber: week.weekNumber,
        lessonPlanId: week.lessonPlanId,
        displayOrder: week.displayOrder,
        label: week.label || "",
      })),
    }))
    .sort((a, b) => {
      const featuredDelta = (b.featured || b.status === "featured" ? 1 : 0) - (a.featured || a.status === "featured" ? 1 : 0);
      if (featuredDelta) return featuredDelta;
      return (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0)
        || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  return {
    lessonPlans,
    activities,
    resources,
    series,
    updatedAt: store.updatedAt || "",
    freeLessonAccessMode: accessContext?.mode || "curated",
  };
}

function assertCurriculumIntegrityOrError(curriculum) {
  const integrity = validateCurriculumIntegrity(curriculum);
  if (integrity.valid) return null;
  return {
    error: "Curriculum integrity check failed.",
    details: integrity.errors.slice(0, 20),
  };
}

function curriculumConcurrencyConflict(siteContent, expectedUpdatedAt) {
  const existingUpdatedAt = normalizedShortText(siteContent?.updatedAt, 80);
  const incomingUpdatedAt = normalizedShortText(expectedUpdatedAt, 80);
  // Same rule as handleAdminSiteContentSave: once stamped, client must send the current value.
  if (existingUpdatedAt && incomingUpdatedAt !== existingUpdatedAt) {
    return true;
  }
  return false;
}

function curriculumConflictResponse(response, siteContent) {
  jsonResponse(response, 409, {
    error: "Content was updated elsewhere. Reload admin content and try again.",
    conflict: true,
    siteContentUpdatedAt: normalizedShortText(siteContent?.updatedAt, 80),
    curriculum: curriculumWithoutFileData(siteContent?.curriculum || defaultCurriculumStore()),
  });
}

function generateCurriculumLessonPlanId() {
  return `cur-lp-${crypto.randomBytes(8).toString("hex")}`;
}

function generateCurriculumResourceId() {
  return `cur-res-${crypto.randomBytes(8).toString("hex")}`;
}

function sanitizeCurriculumUploadFileName(value) {
  return String(value || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "file";
}

function parseCurriculumUploadDataUrl(value) {
  const text = String(value || "").trim();
  const match = text.match(/^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = normalizedShortText(match[1], 80).toLowerCase();
  if (!CURRICULUM_UPLOAD_MIME_TYPES.has(mimeType)) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > MAX_CURRICULUM_UPLOAD_BYTES) return null;
  // Keep the original data URL, but enforce the shared sanitizer length/format rules.
  const fileData = sanitizedCurriculumFileData(text);
  if (!fileData.startsWith("data:")) return null;
  return { mimeType, buffer, fileData };
}

function parseLessonCoverUploadDataUrl(value) {
  const text = String(value || "").trim();
  const match = text.match(/^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = normalizedShortText(match[1], 80).toLowerCase();
  if (!LESSON_COVER_UPLOAD_MIME_TYPES.has(mimeType)) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > MAX_LESSON_COVER_UPLOAD_BYTES) return null;
  return { mimeType, buffer };
}

function readSiteCurriculum(store) {
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  return siteContent.curriculum || defaultCurriculumStore();
}

function writeSiteCurriculum(store, curriculum, { updatedAt } = {}) {
  // Avoid full normalizedSiteContent() here — production siteContent can embed
  // multi-MB lesson-plan resource data URLs. Curriculum saves only touch curriculum + stamp.
  const existing = store.siteContent && typeof store.siteContent === "object"
    ? store.siteContent
    : defaultSiteContentStore();
  const stamp = normalizedShortText(updatedAt, 80) || new Date().toISOString();
  store.siteContent = {
    ...existing,
    curriculum: normalizedCurriculumStore(curriculum),
    updatedAt: stamp,
  };
  return stamp;
}

function unlinkCurriculumResourceFromAllLessonPlans(curriculum, resourceId) {
  const now = new Date().toISOString();
  const store = normalizedCurriculumStore(curriculum);
  const targetResourceId = normalizedShortText(resourceId, 160);
  if (!targetResourceId) return null;
  return normalizedCurriculumStore({
    ...store,
    resources: store.resources.map((item) => (
      item.id === targetResourceId
        ? { ...item, lessonPlanIds: [], updatedAt: now }
        : item
    )),
    lessonPlans: store.lessonPlans.map((item) => (
      item.resourceIds.includes(targetResourceId)
        ? {
          ...item,
          resourceIds: item.resourceIds.filter((id) => id !== targetResourceId),
          updatedAt: now,
        }
        : item
    )),
    updatedAt: now,
  });
}

function linkCurriculumResourceToLessonPlan(curriculum, resourceId, lessonPlanId) {
  const now = new Date().toISOString();
  const store = normalizedCurriculumStore(curriculum);
  const targetResourceId = normalizedShortText(resourceId, 160);
  const targetLessonPlanId = normalizedShortText(lessonPlanId, 160);
  if (!targetResourceId || !targetLessonPlanId) return null;
  const resource = store.resources.find((item) => item.id === targetResourceId);
  const lessonPlan = store.lessonPlans.find((item) => item.id === targetLessonPlanId);
  if (!resource || !lessonPlan) return null;

  const lessonPlanIds = [...new Set([...resource.lessonPlanIds, targetLessonPlanId])];
  const resourceIds = [...new Set([...lessonPlan.resourceIds, targetResourceId])];
  return normalizedCurriculumStore({
    ...store,
    resources: store.resources.map((item) => (
      item.id === targetResourceId ? { ...item, lessonPlanIds, updatedAt: now } : item
    )),
    lessonPlans: store.lessonPlans.map((item) => (
      item.id === targetLessonPlanId ? { ...item, resourceIds, updatedAt: now } : item
    )),
    updatedAt: now,
  });
}

function unlinkCurriculumResourceFromLessonPlan(curriculum, resourceId, lessonPlanId) {
  const now = new Date().toISOString();
  const store = normalizedCurriculumStore(curriculum);
  const targetResourceId = normalizedShortText(resourceId, 160);
  const targetLessonPlanId = normalizedShortText(lessonPlanId, 160);
  if (!targetResourceId || !targetLessonPlanId) return null;

  return normalizedCurriculumStore({
    ...store,
    resources: store.resources.map((item) => (
      item.id === targetResourceId
        ? { ...item, lessonPlanIds: item.lessonPlanIds.filter((id) => id !== targetLessonPlanId), updatedAt: now }
        : item
    )),
    lessonPlans: store.lessonPlans.map((item) => (
      item.id === targetLessonPlanId
        ? { ...item, resourceIds: item.resourceIds.filter((id) => id !== targetResourceId), updatedAt: now }
        : item
    )),
    updatedAt: now,
  });
}

function curriculumActivityIdFromItemId(itemId, lessonPlanId = "") {
  const normalized = normalizedShortText(itemId, 120);
  if (!normalized) return "";
  const suffix = normalized.startsWith("item-") ? normalized.slice(5) : normalized;
  const planKey = normalizedShortText(lessonPlanId, 160);
  // Namespace by lesson plan so Free/Pro copies of the same import sample never share an id.
  if (planKey) {
    const digest = crypto.createHash("sha1").update(`${planKey}:${suffix}`).digest("hex").slice(0, 16);
    return `cur-act-${digest}`;
  }
  return `cur-act-${suffix}`;
}

function curriculumActivityStatusFromLessonPlan(lessonPlanStatus) {
  const status = normalizedShortText(lessonPlanStatus, 20);
  if (status === "archived") return "archived";
  if (status === "published" || status === "featured") return "published";
  return "draft";
}

function flattenCurriculumDailyItems(dailyPlans) {
  const items = [];
  const days = dailyPlans && typeof dailyPlans === "object" ? dailyPlans : {};
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const dayItems = Array.isArray(days[day]?.items) ? days[day].items : [];
    dayItems.forEach((item) => {
      items.push({ ...item, dayOfWeek: day });
    });
  });
  return items;
}

function syncCurriculumActivitiesForLessonPlan(curriculum, lessonPlanInput) {
  const now = new Date().toISOString();
  const store = normalizedCurriculumStore(curriculum);
  const plan = normalizedCurriculumLessonPlan(lessonPlanInput);
  if (!plan) return null;

  const activityStatus = curriculumActivityStatusFromLessonPlan(plan.status);
  const dailyItems = flattenCurriculumDailyItems(plan.dailyPlans);
  const activeSourceKeys = new Set(dailyItems.map((item) => item.sourceKey).filter(Boolean));
  const activitiesBySourceKey = new Map();
  store.activities.forEach((activity) => {
    if (activity.lessonPlanId === plan.id && activity.sourceKey) {
      activitiesBySourceKey.set(activity.sourceKey, activity);
    }
  });

  const syncedForPlan = [];
  dailyItems.forEach((item) => {
    const sourceKey = item.sourceKey || curriculumActivitySourceKey(plan.id, item.itemId);
    const existing = activitiesBySourceKey.get(sourceKey);
    const becomingPublished = activityStatus === "published"
      && Boolean(existing)
      && existing.status !== "published";
    let publishedAt = existing?.publishedAt || "";
    if (becomingPublished) {
      publishedAt = now;
    } else if (activityStatus === "published" && !publishedAt) {
      // Inherit lesson publish stamp when available. Leave empty for seed/bootstrap
      // imports so weekly digests do not treat every startup seed as "new this week".
      publishedAt = plan.publishedAt || "";
    }
    syncedForPlan.push(normalizedCurriculumActivity({
      id: existing?.id || curriculumActivityIdFromItemId(item.itemId, plan.id),
      lessonPlanId: plan.id,
      itemId: item.itemId,
      sourceKey,
      dayOfWeek: item.dayOfWeek,
      activityCategory: item.activityCategory,
      title: item.title,
      objective: item.objective,
      description: item.description,
      learningDomains: item.learningDomains,
      materials: item.materials,
      setup: item.setup,
      steps: item.steps,
      teacherRole: item.teacherRole,
      teacherLanguage: item.teacherLanguage,
      learningGoals: item.learningGoals,
      observationOpportunities: item.observationOpportunities,
      vocabulary: item.vocabulary,
      extensions: item.extensions,
      adaptations: item.adaptations,
      safetyNotes: item.safetyNotes,
      ageModifications: item.ageModifications,
      status: activityStatus,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      publishedAt,
    }));
  });

  store.activities.forEach((activity) => {
    if (activity.lessonPlanId !== plan.id) return;
    if (activeSourceKeys.has(activity.sourceKey)) return;
    syncedForPlan.push(normalizedCurriculumActivity({
      ...activity,
      status: "archived",
      updatedAt: now,
    }));
  });

  const normalizedSynced = syncedForPlan.filter(Boolean);
  const activityIds = normalizedSynced
    .filter((activity) => activity.status !== "archived")
    .map((activity) => activity.id);
  const updatedPlan = normalizedCurriculumLessonPlan({
    ...plan,
    activityIds,
    updatedAt: now,
  });
  if (!updatedPlan) return null;

  const otherPlans = store.lessonPlans.filter((item) => item.id !== plan.id);
  const otherActivities = store.activities.filter((activity) => activity.lessonPlanId !== plan.id);

  return normalizedCurriculumStore({
    lessonPlans: [...otherPlans, updatedPlan],
    activities: [...otherActivities, ...normalizedSynced],
    resources: store.resources,
    updatedAt: now,
  });
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
    customLessonPlans: normalizedList(input.customLessonPlans, 500, normalizedCustomLessonPlanEntry),
    activities: normalizedList(input.activities, 500, normalizedActivityEntry),
    forms: normalizedList(input.forms, 500, (item) => normalizedLibraryItemEntry(item, "Forms Library")),
    printables: normalizedList(input.printables, 500, (item) => normalizedLibraryItemEntry(item, "Printables")),
    menus: normalizedList(input.menus, 500, (item) => normalizedLibraryItemEntry(item, "Menu Center")),
    observations: normalizedList(input.observations, 500, (item) => normalizedLibraryItemEntry(item, "Observation Hub")),
    lessonPlanResourceCategories: Array.isArray(input.lessonPlanResourceCategories)
      ? input.lessonPlanResourceCategories
        .map((item) => normalizedShortText(item, 80))
        .filter(Boolean)
        .slice(0, 40)
      : [],
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
      finalCtaSubtext: normalizedShortText(input.homepage?.finalCtaSubtext, 300),
      heroBenefits: normalizedList(input.homepage?.heroBenefits, 20, (item) => {
        const text = normalizedShortText(typeof item === "string" ? item : String(item?.text || ""), 200);
        return text || null;
      }),
      trustSectionHeading: normalizedShortText(input.homepage?.trustSectionHeading, 240),
      showcaseSectionHeading: normalizedShortText(input.homepage?.showcaseSectionHeading, 240),
      showcaseSectionSubtitle: normalizedMultilineText(input.homepage?.showcaseSectionSubtitle, 600),
      journeySectionHeading: normalizedShortText(input.homepage?.journeySectionHeading, 240),
      journeySectionSubtitle: normalizedMultilineText(input.homepage?.journeySectionSubtitle, 600),
      journeyHowItWorksHeading: normalizedShortText(input.homepage?.journeyHowItWorksHeading, 120),
      journeyComingSoonHeading: normalizedShortText(input.homepage?.journeyComingSoonHeading, 120),
      whySectionHeading: normalizedShortText(input.homepage?.whySectionHeading, 240),
      whyItems: normalizedList(input.homepage?.whyItems, 12, (item, index) => {
        const entry = item && typeof item === "object" ? item : { title: String(item || "") };
        const title = normalizedShortText(entry.title, 200);
        return title ? { id: normalizedShortText(entry.id, 80) || `why-${index + 1}`, title } : null;
      }),
      reviewsSectionHeading: normalizedShortText(input.homepage?.reviewsSectionHeading, 240),
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
    pricing: {
      sectionTitle: normalizedShortText(input.pricing?.sectionTitle, 240),
      sectionSubtitle: normalizedMultilineText(input.pricing?.sectionSubtitle, 600),
      freePlanName: normalizedShortText(input.pricing?.freePlanName, 120),
      freePlanDescription: normalizedMultilineText(input.pricing?.freePlanDescription, 600),
      proPlanName: normalizedShortText(input.pricing?.proPlanName, 120),
      proPlanDescription: normalizedMultilineText(input.pricing?.proPlanDescription, 600),
      proPlanHighlightBadge: normalizedShortText(input.pricing?.proPlanHighlightBadge, 120),
      trialButtonText: normalizedShortText(input.pricing?.trialButtonText, 200),
      trialNoteText: normalizedMultilineText(input.pricing?.trialNoteText, 400),
      creditCardText: normalizedShortText(input.pricing?.creditCardText, 200),
      cancelText: normalizedShortText(input.pricing?.cancelText, 200),
      freePlanPrice: normalizedShortText(input.pricing?.freePlanPrice, 40),
      freePlanPriceInterval: normalizedShortText(input.pricing?.freePlanPriceInterval, 40),
      proPlanPrice: normalizedShortText(input.pricing?.proPlanPrice, 40),
      proPlanPriceInterval: normalizedShortText(input.pricing?.proPlanPriceInterval, 40),
      freePlanCtaText: normalizedShortText(input.pricing?.freePlanCtaText, 120),
      freePlanFeatures: normalizedList(input.pricing?.freePlanFeatures, 20, (item) => {
        const text = normalizedShortText(typeof item === "string" ? item : String(item?.text || ""), 200);
        return text || null;
      }),
      proPlanFeatures: normalizedList(input.pricing?.proPlanFeatures, 20, (item) => {
        const text = normalizedShortText(typeof item === "string" ? item : String(item?.text || ""), 200);
        return text || null;
      }),
      _draft: input.pricing?._draft === true,
    },
    faqs: normalizedList(input.faqs, 100, normalizedFaqEntry),
    announcement: {
      text: normalizedMultilineText(input.announcement?.text, 1000),
      visible: input.announcement?.visible === true,
      expiresAt: normalizedShortText(input.announcement?.expiresAt, 80),
      location: ["top", "homepage", "all"].includes(input.announcement?.location) ? input.announcement.location : "top",
      _draft: input.announcement?._draft === true,
    },
    upgradeMessaging: {
      upgradePopupHeadline: normalizedShortText(input.upgradeMessaging?.upgradePopupHeadline, 200),
      upgradeLimitHeadline: normalizedShortText(input.upgradeMessaging?.upgradeLimitHeadline, 200),
      upgradePopupBody: normalizedMultilineText(input.upgradeMessaging?.upgradePopupBody, 800),
      proTrialButtonText: normalizedShortText(input.upgradeMessaging?.proTrialButtonText, 200),
      freeLimitMessage: normalizedMultilineText(input.upgradeMessaging?.freeLimitMessage, 400),
      trialUpgradeSummary: normalizedMultilineText(input.upgradeMessaging?.trialUpgradeSummary, 400),
      _draft: input.upgradeMessaging?._draft === true,
    },
    founding: {
      heading: normalizedShortText(input.founding?.heading, 200),
      soldOutHeading: normalizedShortText(input.founding?.soldOutHeading, 200),
      pricePrefix: normalizedShortText(input.founding?.pricePrefix, 120),
      priceLifeLabel: normalizedShortText(input.founding?.priceLifeLabel, 60),
      ctaButtonText: normalizedShortText(input.founding?.ctaButtonText, 120),
      soldOutCtaText: normalizedShortText(input.founding?.soldOutCtaText, 120),
      _draft: input.founding?._draft === true,
    },
    freePlanAccess: normalizedFreePlanAccess(input.freePlanAccess),
    featureFlags: normalizedFeatureFlags(input.featureFlags),
    curriculum: normalizedCurriculumStore(input.curriculum),
    updatedAt: normalizedShortText(input.updatedAt, 80),
  };
}

// Keeps existing top-level siteContent keys when the incoming payload omits them
// (undefined / missing). Explicit [] or {} from the client is preserved as intentional.
function mergeSiteContentKeepMissingKeys(existingContent, incomingContent) {
  const existing = existingContent && typeof existingContent === "object" ? existingContent : {};
  const incoming = incomingContent && typeof incomingContent === "object" ? incomingContent : {};
  const merged = { ...existing };
  Object.keys(incoming).forEach((key) => {
    if (incoming[key] !== undefined) merged[key] = incoming[key];
  });
  return merged;
}

function uploadedResourcesForResponse(items = [], { admin = false } = {}) {
  const normalized = dedupeUploadedResources(items, MAX_UPLOADED_RESOURCES);
  if (admin) return normalized;
  return normalized.filter((item) => item.visible !== false && item.archived !== true);
}

function usePostgresStore() {
  const provider = DATABASE_PROVIDER.toLowerCase();
  return (provider === "postgres" || provider === "postgresql") && isConfiguredValue(activeDatabaseUrl());
}

function postgresSslConfig() {
  if (DATABASE_SSL === "true") return { rejectUnauthorized: false };
  if (DATABASE_SSL === "false") return false;
  return undefined;
}

async function initializePostgresStore() {
  const { Pool } = require("pg");
  postgresPool = new Pool({
    connectionString: activeDatabaseUrl(),
    ssl: postgresSslConfig(),
  });
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS llh_store (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS llh_media_assets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS llh_email_campaign_deliveries (
      campaign_id TEXT NOT NULL,
      email TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      message_id TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      PRIMARY KEY (campaign_id, email)
    )
  `);
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS llh_store_backups (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'scheduled',
      user_count INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      founding_count INTEGER NOT NULL DEFAULT 0,
      notification_count INTEGER NOT NULL DEFAULT 0,
      support_ticket_count INTEGER NOT NULL DEFAULT 0,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      data JSONB NOT NULL
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
  lastPostgresError = "";
  lastPersistedStoreCounts = storeInventoryCounts(storeCache);
}

function loadLocalJsonStoreFallback() {
  ensureStore();
  try {
    storeCache = JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    storeCache = defaultStore();
    fs.writeFileSync(storePath, JSON.stringify(storeCache, null, 2));
  }
}

function ensurePostgresPool() {
  if (!usePostgresStore() || postgresPool) return postgresPool;
  try {
    const { Pool } = require("pg");
    postgresPool = new Pool({
      connectionString: activeDatabaseUrl(),
      ssl: postgresSslConfig(),
    });
  } catch (error) {
    console.warn("[store] could not create Postgres pool:", error.message);
  }
  return postgresPool;
}

async function reloadStoreFromPostgres() {
  if (!usePostgresStore() || !postgresPool) return false;
  const result = await postgresPool.query("SELECT data FROM llh_store WHERE id = $1", [storeRecordId]);
  if (!result.rows.length) return false;
  storeCache = result.rows[0].data || defaultStore();
  databaseReady = true;
  lastPostgresError = "";
  return true;
}

function startPostgresReconnectLoop() {
  if (!usePostgresStore()) return;
  if (global.__llhPostgresReconnectStarted) return;
  global.__llhPostgresReconnectStarted = true;
  setInterval(() => {
    if (databaseReady) {
      return;
    }
    maybeAlertPostgresDisconnect("reconnect_loop_still_down");
    ensurePostgresPool();
    (async () => {
      const ok = await probePostgresReadiness();
      if (!ok) return;
      // NEVER push a sparse local fallback over Postgres. Reload the real store,
      // then re-apply sealed auth recovery onto the authentic user row.
      const loaded = await reloadStoreFromPostgres();
      if (!loaded) return;
      lastPersistedStoreCounts = storeInventoryCounts(storeCache);
      try {
        const store = readStore();
        const oneShot = tempPasswordAuth.applyOneShotTempPasswordIfNeeded(store);
        if (oneShot.applied) {
          await writeStoreAsync(store);
          console.log(`[temp-password] one-shot applied after Postgres reconnect for ${oneShot.email}`);
        }
      } catch (error) {
        console.warn("[temp-password] reconnect apply skipped:", error.message);
      }
    })().catch((error) => {
      console.warn("[store] Postgres reconnect failed:", error.message || error);
    });
  }, 15000);
}

async function initializeStorage() {
  if (usePostgresStore()) {
    try {
      await initializePostgresStore();
    } catch (error) {
      // Do not crash the web service when Postgres is briefly unreachable — that left
      // production stuck on an old deploy and broke urgent auth recovery.
      databaseReady = false;
      lastPostgresError = error.message || "Postgres initialization failed.";
      console.error("[store] Postgres unavailable at boot — using local JSON fallback until reconnect:", lastPostgresError);
      ensurePostgresPool();
      loadLocalJsonStoreFallback();
    }
  } else {
    loadLocalJsonStoreFallback();
    databaseReady = false;
    lastPostgresError = "";
  }
  startPostgresReconnectLoop();
  try {
    // One-user sealed temp-password apply (hash only). Never logs plaintext.
    const store = readStore();
    const oneShot = tempPasswordAuth.applyOneShotTempPasswordIfNeeded(store);
    if (oneShot.applied) {
      await writeStoreAsync(store);
      console.log(`[temp-password] one-shot applied for ${oneShot.email} (expires ${oneShot.expiresAt})`);
    }
  } catch (error) {
    console.warn("[temp-password] one-shot apply skipped:", error.message);
  }
  try {
    // Security fix: invalidate any testing-only fake-account password hash still
    // in the legacy raw-SHA-256 format from before this fix. Never touches a real
    // user's hash (those migrate transparently on next login instead) and never
    // invents a plaintext to re-hash — an invalidated fake account simply needs
    // its password reissued via Testing Lab, which is safe and lossless by design.
    const store = readStore();
    const migrated = tempPasswordAuth.invalidateLegacyFakeAccountPasswordHashes(store);
    if (migrated.invalidatedFakeAccounts > 0 || migrated.invalidatedUsers > 0) {
      await writeStoreAsync(store);
      console.log(`[temp-password] invalidated ${migrated.invalidatedFakeAccounts} legacy-hashed fake account(s) and ${migrated.invalidatedUsers} mirrored user row(s) — reissue their passwords via Testing Lab.`);
    }
  } catch (error) {
    console.warn("[temp-password] legacy fake-account hash migration skipped:", error.message);
  }
  try {
    const { ensurePreschoolCurriculumSeeded } = require("./curriculum-preschool-seed.js");
    await ensurePreschoolCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-preschool-seed] startup seed failed:", error.message);
  }
  try {
    const { ensureToddlerCurriculumSeeded } = require("./curriculum-toddler-seed.js");
    await ensureToddlerCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-toddler-seed] startup seed failed:", error.message);
  }
  try {
    const { ensureToddlerCoreCurriculumSeeded } = require("./curriculum-toddler-core-seed.js");
    await ensureToddlerCoreCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-toddler-core-seed] startup seed failed:", error.message);
  }
  try {
    const { ensureInfantCoreCurriculumSeeded } = require("./curriculum-infant-core-seed.js");
    await ensureInfantCoreCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-infant-core-seed] startup seed failed:", error.message);
  }
  try {
    const { ensureInfantHolidayCurriculumSeeded } = require("./curriculum-infant-holiday-seed.js");
    await ensureInfantHolidayCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-infant-holiday-seed] startup seed failed:", error.message);
  }
  try {
    const { ensureToddlerHolidayCurriculumSeeded } = require("./curriculum-toddler-holiday-seed.js");
    await ensureToddlerHolidayCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-toddler-holiday-seed] startup seed failed:", error.message);
  }
  try {
    const { ensurePreschoolHolidayCurriculumSeeded } = require("./curriculum-preschool-holiday-seed.js");
    await ensurePreschoolHolidayCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-preschool-holiday-seed] startup seed failed:", error.message);
  }
  try {
    const { ensureInfantSummerCurriculumSeeded } = require("./curriculum-infant-summer-seed.js");
    await ensureInfantSummerCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-infant-summer-seed] startup seed failed:", error.message);
  }
  try {
    const { ensurePreschoolSummerCurriculumSeeded } = require("./curriculum-preschool-summer-seed.js");
    await ensurePreschoolSummerCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-preschool-summer-seed] startup seed failed:", error.message);
  }
  try {
    const { ensurePreschoolPriorityCurriculumSeeded } = require("./curriculum-preschool-priority-seed.js");
    await ensurePreschoolPriorityCurriculumSeeded({
      readStore,
      writeStoreAsync,
      writeSiteCurriculum,
      syncCurriculumActivitiesForLessonPlan,
      assertCurriculumIntegrityOrError,
      defaultSiteContentStore,
      defaultCurriculumStore,
    });
  } catch (error) {
    console.error("[curriculum-preschool-priority-seed] startup seed failed:", error.message);
  }
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

async function readStoreFresh() {
  if (usePostgresStore()) {
    await postgresWriteChain.catch(() => {});
    if (postgresPool && databaseReady) {
      const result = await postgresPool.query("SELECT data FROM llh_store WHERE id = $1", [storeRecordId]);
      if (result.rows[0]?.data) storeCache = result.rows[0].data;
    }
    return structuredClone(storeCache || defaultStore());
  }
  return readStore();
}

// Returns the store without deep-cloning. Safe for read-only handlers that never
// mutate the returned object (or that intentionally mutate storeCache in place).
// For Postgres this avoids an expensive structuredClone of lesson plans, analytics,
// and child records on every request — the prior OOM crash source on Render starter.
function peekStore() {
  if (usePostgresStore()) {
    if (!storeCache) readStore();
    return storeCache || defaultStore();
  }
  ensureStore();
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

const POSTGRES_UPSERT_STORE = "INSERT INTO llh_store (id, data, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()";
const POSTGRES_WRITE_CHAIN_WAIT_MS = 20000;
const POSTGRES_QUERY_TIMEOUT_MS = 45000;
// Monotonic generation so a stale write queued behind a newer write cannot clobber it.
// Production bug: analytics/adminSession writeStore(readStore()) captured an old clone and
// overwrote a successful curriculum writeStoreAsync on the Postgres chain.
let postgresWriteGeneration = 0;

function withTimeout(promise, timeoutMs, label = "Operation") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Persist the latest in-memory storeCache. Stale generations are skipped so concurrent
// fire-and-forget writeStore() callers cannot erase a newer writeStoreAsync() result.
function storeInventoryCounts(store = peekStore()) {
  const users = store?.users || {};
  const messages = Array.isArray(store?.messages) ? store.messages : [];
  const notifications = Array.isArray(store?.notifications) ? store.notifications : [];
  const conversations = new Set(
    messages
      .map((m) => normalizeEmail(m.conversationEmail || m.toEmail || ""))
      .filter(Boolean),
  );
  return {
    users: Object.keys(users).length,
    messages: messages.length,
    conversations: conversations.size,
    foundingMembers: Array.isArray(store?.foundingMembers) ? store.foundingMembers.length : 0,
    notifications: notifications.length,
    supportTickets: Array.isArray(store?.supportTickets) ? store.supportTickets.length : 0,
  };
}

function storeCountDropReasons(nextCounts, prevCounts = lastPersistedStoreCounts) {
  if (!prevCounts || !nextCounts) return [];
  const reasons = [];
  const droppedHalf = (prev, next, minPrev) => prev >= minPrev && next < Math.floor(prev * 0.5);
  if (droppedHalf(prevCounts.users, nextCounts.users, 10)) {
    reasons.push(`users ${prevCounts.users} → ${nextCounts.users}`);
  }
  if (droppedHalf(prevCounts.messages, nextCounts.messages, 10)) {
    reasons.push(`messages ${prevCounts.messages} → ${nextCounts.messages}`);
  }
  if (droppedHalf(prevCounts.foundingMembers, nextCounts.foundingMembers, 5)) {
    reasons.push(`foundingMembers ${prevCounts.foundingMembers} → ${nextCounts.foundingMembers}`);
  }
  return reasons;
}

async function maybeAlertStoreSafety(kind, detail = {}) {
  const now = Date.now();
  if (now - lastStoreSafetyAlertAt < 15 * 60 * 1000) return;
  lastStoreSafetyAlertAt = now;
  const subject = `[LLH SAFETY] ${kind}`;
  const text = [
    `Little Learner Hub store safety alert: ${kind}`,
    `Time: ${new Date(now).toISOString()}`,
    `Detail: ${JSON.stringify(detail)}`,
    `Database ready: ${databaseReady}`,
    `Last Postgres error: ${lastPostgresError || "(none)"}`,
  ].join("\n");
  console.error("[store-safety]", kind, detail);
  try {
    if (supportEmailConfigStatus().ready) {
      await sendEmail({
        to: SUPPORT_EMAIL_TO,
        subject,
        text,
        html: `<pre>${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>`,
      });
    }
  } catch (error) {
    console.warn("[store-safety] alert email failed:", error.message);
  }
}

function maybeAlertPostgresDisconnect(reason = "postgres_unavailable") {
  const now = Date.now();
  if (now - lastPostgresDisconnectAlertAt < 15 * 60 * 1000) return;
  lastPostgresDisconnectAlertAt = now;
  maybeAlertStoreSafety("postgres_disconnect", {
    reason,
    lastError: lastPostgresError || "",
  }).catch(() => {});
}

function assertSafePostgresStoreReplacement(nextStore) {
  const nextCounts = storeInventoryCounts(nextStore);
  const dropReasons = storeCountDropReasons(nextCounts);
  if (!dropReasons.length) return nextCounts;
  if (ALLOW_DESTRUCTIVE_STORE_WRITE) {
    console.warn("[store-safety] destructive store write allowed by ALLOW_DESTRUCTIVE_STORE_WRITE:", dropReasons);
    return nextCounts;
  }
  const err = new Error(
    `Refusing full-store Postgres write that would drop inventory (${dropReasons.join("; ")}). Set ALLOW_DESTRUCTIVE_STORE_WRITE=true only for an intentional rebuild.`,
  );
  err.code = "store_count_drop_blocked";
  err.dropReasons = dropReasons;
  err.previousCounts = lastPersistedStoreCounts;
  err.nextCounts = nextCounts;
  throw err;
}

async function createLogicalStoreBackup({ source = "scheduled" } = {}) {
  if (!usePostgresStore() || !postgresPool || !databaseReady) {
    return { ok: false, reason: "postgres_not_ready" };
  }
  const store = peekStore();
  const counts = storeInventoryCounts(store);
  const id = `backup_${new Date().toISOString().replace(/[:.]/g, "-")}_${source}`;
  const payload = JSON.stringify(store);
  await postgresPool.query(
    `INSERT INTO llh_store_backups (
      id, source, user_count, message_count, founding_count, notification_count, support_ticket_count, verified, data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,$8::jsonb)`,
    [
      id,
      source,
      counts.users,
      counts.messages,
      counts.foundingMembers,
      counts.notifications,
      counts.supportTickets,
      payload,
    ],
  );
  const verify = await postgresPool.query(
    "SELECT user_count, message_count, founding_count FROM llh_store_backups WHERE id = $1",
    [id],
  );
  const row = verify.rows[0] || {};
  const verified = Number(row.user_count) === counts.users
    && Number(row.message_count) === counts.messages
    && Number(row.founding_count) === counts.foundingMembers;
  if (verified) {
    await postgresPool.query("UPDATE llh_store_backups SET verified = TRUE WHERE id = $1", [id]);
  }
  await postgresPool.query(`
    DELETE FROM llh_store_backups
    WHERE id IN (
      SELECT id FROM llh_store_backups
      ORDER BY created_at DESC
      OFFSET $1
    )
  `, [STORE_BACKUP_RETENTION]);
  return { ok: true, id, counts, verified, source };
}

function startStoreBackupScheduler() {
  if (!usePostgresStore()) return;
  if (global.__llhStoreBackupSchedulerStarted) return;
  global.__llhStoreBackupSchedulerStarted = true;
  const tick = async () => {
    if (!databaseReady || !postgresPool) return;
    try {
      const latest = await postgresPool.query(
        "SELECT created_at FROM llh_store_backups ORDER BY created_at DESC LIMIT 1",
      );
      const lastMs = latest.rows[0]?.created_at ? new Date(latest.rows[0].created_at).getTime() : 0;
      if (lastMs && Date.now() - lastMs < STORE_BACKUP_INTERVAL_MS) return;
      const result = await createLogicalStoreBackup({ source: "daily" });
      if (result.ok) {
        console.log(`[store-backup] created ${result.id} users=${result.counts.users} verified=${result.verified}`);
      }
    } catch (error) {
      console.warn("[store-backup] scheduled backup failed:", error.message || error);
    }
  };
  setTimeout(() => { tick().catch(() => {}); }, 45 * 1000);
  setInterval(() => { tick().catch(() => {}); }, 60 * 60 * 1000);
}

function enqueuePostgresStoreWrite() {
  const writeGeneration = ++postgresWriteGeneration;
  const writePromise = (async () => {
    try {
      await withTimeout(
        postgresWriteChain.catch((error) => {
          console.error("Pending write chain error before async write:", error.message);
        }),
        POSTGRES_WRITE_CHAIN_WAIT_MS,
        "Pending Postgres write chain",
      );
    } catch (error) {
      console.error(error.message);
      // Break a stuck chain so the latest full-state write can proceed.
      postgresWriteChain = Promise.resolve();
    }
    if (writeGeneration !== postgresWriteGeneration) {
      console.log("[store-write] skip stale generation", {
        writeGeneration,
        latest: postgresWriteGeneration,
      });
      return;
    }
    let nextCounts;
    try {
      nextCounts = assertSafePostgresStoreReplacement(storeCache);
    } catch (error) {
      maybeAlertStoreSafety("store_replacement_blocked", {
        code: error.code || "store_count_drop_blocked",
        dropReasons: error.dropReasons || [],
        previousCounts: error.previousCounts || lastPersistedStoreCounts,
        nextCounts: error.nextCounts || storeInventoryCounts(storeCache),
      }).catch(() => {});
      throw error;
    }
    const payload = JSON.stringify(storeCache);
    await withTimeout(
      postgresPool.query(POSTGRES_UPSERT_STORE, [storeRecordId, payload]),
      POSTGRES_QUERY_TIMEOUT_MS,
      "Postgres store upsert",
    );
    databaseReady = true;
    lastPostgresError = "";
    lastPersistedStoreCounts = nextCounts;
  })();
  postgresWriteChain = writePromise.catch((error) => {
    if (error?.code !== "store_count_drop_blocked") {
      databaseReady = false;
      lastPostgresError = error.message || "Postgres store write failed.";
      maybeAlertPostgresDisconnect("postgres_write_failed");
    }
    console.error("Could not persist launch store to Postgres:", lastPostgresError || error.message);
  });
  return { writeGeneration, writePromise };
}

// Analytics/adminSession/etc. often do readStore() → mutate → writeStore().
// If a curriculum/site-content write landed in between, the stale clone would wipe
// siteContent (including curriculum). Keep the newer siteContent by updatedAt stamp.
function mergeStorePreferNewerSiteContent(incomingStore) {
  if (!storeCache || !incomingStore || typeof incomingStore !== "object") return incomingStore;
  const incomingStamp = normalizedShortText(incomingStore.siteContent?.updatedAt, 80);
  const cachedStamp = normalizedShortText(storeCache.siteContent?.updatedAt, 80);
  if (cachedStamp && (!incomingStamp || cachedStamp > incomingStamp)) {
    console.log("[store-write] preserve newer siteContent", {
      incomingStamp: incomingStamp || "(empty)",
      cachedStamp,
    });
    return {
      ...incomingStore,
      siteContent: storeCache.siteContent,
    };
  }
  return incomingStore;
}

// Same race class as siteContent: a stale writeStore(readStore()) clone captured before
// createAdminToken() used to wipe live adminSessions, leaving the browser "unlocked"
// while every /api/admin/* call returned "Admin access is required."
function mergeStorePreserveAdminSessions(incomingStore) {
  if (!incomingStore || typeof incomingStore !== "object") return incomingStore;
  const cachedSessions = storeCache?.adminSessions || {};
  const incomingSessions = incomingStore.adminSessions || {};
  if (!Object.keys(cachedSessions).length && !Object.keys(incomingSessions).length) {
    return incomingStore;
  }
  const mergedSessions = { ...incomingSessions };
  let preserved = 0;
  Object.entries(cachedSessions).forEach(([token, session]) => {
    if (!mergedSessions[token]) {
      mergedSessions[token] = session;
      preserved += 1;
      return;
    }
    const cachedMs = Date.parse(session?.createdAt || "") || 0;
    const incomingMs = Date.parse(mergedSessions[token]?.createdAt || "") || 0;
    if (cachedMs > incomingMs) {
      mergedSessions[token] = session;
      preserved += 1;
    }
  });
  if (preserved) {
    console.log("[store-write] preserve adminSessions", {
      preserved,
      total: Object.keys(mergedSessions).length,
    });
  }
  return {
    ...incomingStore,
    adminSessions: mergedSessions,
  };
}

function writeLocalJsonStore(store) {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}


function mergeStorePreserveEmailCampaigns(incomingStore) {
  const cachedCampaigns = storeCache?.emailEngagement?.campaigns;
  if (!cachedCampaigns || typeof cachedCampaigns !== "object" || !Object.keys(cachedCampaigns).length) {
    return incomingStore;
  }
  const incomingEngagement = incomingStore?.emailEngagement && typeof incomingStore.emailEngagement === "object"
    ? incomingStore.emailEngagement
    : {};
  return {
    ...incomingStore,
    emailEngagement: {
      ...incomingEngagement,
      campaigns: {
        ...(incomingEngagement.campaigns || {}),
        ...cachedCampaigns,
      },
    },
  };
}

function writeStore(store) {
  const nextStore = mergeStorePreserveEmailCampaigns(
    mergeStorePreserveAdminSessions(mergeStorePreferNewerSiteContent(store)),
  );
  storeCache = nextStore;
  // Only upsert to Postgres after the authentic DB store is loaded. While on local
  // fallback, never push a sparse in-memory store over production membership data.
  if (usePostgresStore() && postgresPool && databaseReady) {
    enqueuePostgresStoreWrite().writePromise.catch((error) => {
      if (error?.code === "store_count_drop_blocked") {
        console.error("[store] fire-and-forget write blocked by inventory guard:", error.message);
      }
    });
    return;
  }
  if (usePostgresStore() && !databaseReady) {
    // Degraded mode: keep an emergency local copy, but do not pretend Postgres accepted it.
    writeLocalJsonStore(nextStore);
    return;
  }
  writeLocalJsonStore(nextStore);
}

// Writes the store and waits for the Postgres write to complete before returning.
// Throws if the database write fails so the caller can surface the error to the client
// instead of reporting a false success. Use this for admin writes where persistence must
// be confirmed before responding (e.g. lesson plan visibility changes, site content saves).
async function writeStoreAsync(store) {
  // Intentional full-state writes (curriculum / site-content) may carry a newer stamp.
  // Do not merge-prefer siteContent from cache — the caller already built the next siteContent.
  // Always preserve adminSessions so a concurrent login is not erased mid-save.
  storeCache = mergeStorePreserveEmailCampaigns(mergeStorePreserveAdminSessions(store));
  if (usePostgresStore() && postgresPool && databaseReady) {
    try {
      const { writeGeneration, writePromise } = enqueuePostgresStoreWrite();
      await writePromise;
      // If a newer write superseded us while we waited, wait for that newer persist too
      // so the caller does not return success before the latest state is durable.
      if (writeGeneration !== postgresWriteGeneration) {
        await postgresWriteChain.catch(() => {});
      }
      return;
    } catch (error) {
      // Never persist a blocked destructive replacement to local JSON — that recreates the wipe path.
      if (error?.code === "store_count_drop_blocked") {
        console.error("[store] Postgres writeAsync blocked by inventory guard:", error.message);
        throw error;
      }
      // Keep auth recovery and admin writes available during Postgres blips.
      databaseReady = false;
      lastPostgresError = error.message || "Postgres store write failed.";
      maybeAlertPostgresDisconnect("postgres_write_async_failed");
      console.error("[store] Postgres writeAsync failed — persisting local JSON fallback:", lastPostgresError);
      writeLocalJsonStore(storeCache);
      return;
    }
  }
  // Production Postgres mode with DB not ready: emergency local JSON only.
  // Reconnect reloads Postgres and must never upsert this local copy over production.
  if (usePostgresStore() && !databaseReady) {
    console.warn("[store] writeAsync in degraded mode — local JSON only; Postgres upsert blocked until authentic reload");
  }
  writeLocalJsonStore(storeCache);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function claimEmailCampaignDelivery({ campaignId, email, contentHash }) {
  const cleanEmail = normalizeEmail(email);
  if (usePostgresStore()) {
    const inserted = await postgresPool.query(
      `INSERT INTO llh_email_campaign_deliveries
        (campaign_id, email, content_hash, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (campaign_id, email) DO NOTHING
       RETURNING campaign_id, email, content_hash, status, provider, message_id, error, claimed_at, completed_at`,
      [campaignId, cleanEmail, contentHash],
    );
    if (inserted.rows[0]) return { claimed: true, delivery: inserted.rows[0] };
    const reclaimed = await postgresPool.query(
      `UPDATE llh_email_campaign_deliveries
       SET claimed_at = NOW(), error = ''
       WHERE campaign_id = $1 AND email = $2 AND status = 'pending'
         AND claimed_at < NOW() - INTERVAL '30 minutes'
         AND claimed_at > NOW() - INTERVAL '24 hours'
       RETURNING campaign_id, email, content_hash, status, provider, message_id, error, claimed_at, completed_at`,
      [campaignId, cleanEmail],
    );
    if (reclaimed.rows[0]) return { claimed: true, reclaimed: true, delivery: reclaimed.rows[0] };
    const existing = await postgresPool.query(
      `SELECT campaign_id, email, content_hash, status, provider, message_id, error, claimed_at, completed_at
       FROM llh_email_campaign_deliveries WHERE campaign_id = $1 AND email = $2`,
      [campaignId, cleanEmail],
    );
    return { claimed: false, delivery: existing.rows[0] || null };
  }
  const store = readStore();
  store.emailCampaignDeliveries = store.emailCampaignDeliveries || {};
  const key = `${campaignId}:${cleanEmail}`;
  if (store.emailCampaignDeliveries[key]) {
    return { claimed: false, delivery: store.emailCampaignDeliveries[key] };
  }
  const delivery = {
    campaign_id: campaignId,
    email: cleanEmail,
    content_hash: contentHash,
    status: "pending",
    provider: "",
    message_id: "",
    error: "",
    claimed_at: new Date().toISOString(),
    completed_at: null,
  };
  store.emailCampaignDeliveries[key] = delivery;
  await writeStoreAsync(store);
  return { claimed: true, delivery };
}

async function completeEmailCampaignDelivery({ campaignId, email, status, provider = "", messageId = "", error = "" }) {
  const cleanEmail = normalizeEmail(email);
  if (usePostgresStore()) {
    await postgresPool.query(
      `UPDATE llh_email_campaign_deliveries
       SET status = $3, provider = $4, message_id = $5, error = $6, completed_at = NOW()
       WHERE campaign_id = $1 AND email = $2`,
      [campaignId, cleanEmail, status, provider, messageId, error],
    );
    return;
  }
  const store = readStore();
  store.emailCampaignDeliveries = store.emailCampaignDeliveries || {};
  const key = `${campaignId}:${cleanEmail}`;
  if (store.emailCampaignDeliveries[key]) {
    Object.assign(store.emailCampaignDeliveries[key], {
      status,
      provider,
      message_id: messageId,
      error,
      completed_at: new Date().toISOString(),
    });
    await writeStoreAsync(store);
  }
}

async function listEmailCampaignDeliveries(campaignId) {
  if (usePostgresStore()) {
    const result = await postgresPool.query(
      `SELECT campaign_id, email, content_hash, status, provider, message_id, error, claimed_at, completed_at
       FROM llh_email_campaign_deliveries WHERE campaign_id = $1 ORDER BY claimed_at ASC`,
      [campaignId],
    );
    return result.rows;
  }
  const store = readStore();
  return Object.values(store.emailCampaignDeliveries || {}).filter((delivery) => delivery.campaign_id === campaignId);
}

async function patchEmailCampaignState(campaignId, patch = {}) {
  if (usePostgresStore()) {
    const previousWrites = postgresWriteChain;
    const patchPromise = (async () => {
      await previousWrites.catch(() => {});
      await postgresPool.query(
        `UPDATE llh_store
         SET data = jsonb_set(
           data, '{emailEngagement}',
           COALESCE(data -> 'emailEngagement', '{}'::jsonb)
           || jsonb_build_object(
             'campaigns',
             COALESCE(data #> '{emailEngagement,campaigns}', '{}'::jsonb)
             || jsonb_build_object(
               $2::text,
               COALESCE(data #> ARRAY['emailEngagement', 'campaigns', $2::text], '{}'::jsonb) || $3::jsonb
             )
           ),
           true
         ), updated_at = NOW()
         WHERE id = $1`,
        [storeRecordId, campaignId, JSON.stringify(patch)],
      );
      storeCache = storeCache || defaultStore();
      storeCache.emailEngagement = storeCache.emailEngagement && typeof storeCache.emailEngagement === "object"
        ? storeCache.emailEngagement
        : defaultEmailEngagementStore();
      storeCache.emailEngagement.campaigns = storeCache.emailEngagement.campaigns || {};
      storeCache.emailEngagement.campaigns[campaignId] = {
        ...(storeCache.emailEngagement.campaigns[campaignId] || {}),
        ...patch,
      };
      return storeCache.emailEngagement.campaigns[campaignId];
    })();
    postgresWriteChain = patchPromise.catch((error) => {
      databaseReady = false;
      lastPostgresError = error.message || "Postgres email campaign patch failed.";
      console.error(lastPostgresError);
    });
    return await patchPromise;
  }
  const store = readStore();
  store.emailEngagement = store.emailEngagement && typeof store.emailEngagement === "object"
    ? store.emailEngagement
    : defaultEmailEngagementStore();
  store.emailEngagement.campaigns = store.emailEngagement.campaigns || {};
  store.emailEngagement.campaigns[campaignId] = {
    ...(store.emailEngagement.campaigns[campaignId] || {}),
    ...patch,
  };
  await writeStoreAsync(store);
  return store.emailEngagement.campaigns[campaignId];
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

async function resolveCurriculumAccessUser(request, url) {
  const adminToken = String(url?.searchParams?.get("adminToken") || "").trim();
  if (adminToken && validAdminToken(adminToken)) {
    return { authorized: true, email: "", user: null, source: "admin" };
  }
  let identity = null;
  if (firebaseConfigStatus().ready) {
    try {
      identity = await verifyFirebaseUser(request);
    } catch {
      identity = null;
    }
  }
  if (!identity && process.env.NODE_ENV === "test") {
    const authHeader = String(request.headers.authorization || "");
    if (authHeader.startsWith("Bearer test:")) {
      const email = normalizeEmail(authHeader.slice("Bearer test:".length).trim());
      if (email) identity = { uid: `test-${email}`, email };
    }
  }
  // Local/demo fallback so Free grandfathering can personalize curriculum without Firebase.
  if (!identity) {
    const allowHeaderIdentity = process.env.NODE_ENV === "test"
      || String(process.env.DATABASE_PROVIDER || "").toLowerCase() === "local-json";
    if (allowHeaderIdentity) {
      const headerEmail = normalizeEmail(request.headers["x-llh-user-email"] || "");
      if (headerEmail) identity = { uid: `local-${headerEmail}`, email: headerEmail };
    }
  }
  if (!identity?.email) {
    return { authorized: false, email: "", user: null, source: "anonymous" };
  }
  const store = readStore();
  const user = store.users?.[identity.email] || { email: identity.email };
  // Platform owner aliases always receive full curriculum content, independent of
  // the Free/Pro membership row used for billing experiments.
  if (isConfiguredAdminEmail(identity.email)) {
    return {
      authorized: true,
      email: identity.email,
      user,
      source: "admin-owner",
    };
  }
  // Staff/directors inherit the program owner's paid access for curriculum gates.
  const ownerEmail = programOwnership.resolveOwnerEmailForUser(user, identity.email);
  const accessRecord = (ownerEmail && store.users?.[ownerEmail]) || user;
  return {
    authorized: membershipHasProAccess(accessRecord),
    email: identity.email,
    user: accessRecord,
    source: "user",
  };
}

async function createAdminToken(email) {
  const token = `admin_${crypto.randomBytes(24).toString("hex")}`;
  // Always mutate the live cache (not a stale readStore clone) so concurrent
  // analytics writeStore(readStore()) calls cannot drop this session.
  if (!storeCache) readStore();
  storeCache = storeCache || defaultStore();
  storeCache.adminSessions = storeCache.adminSessions || {};
  const nowIso = new Date().toISOString();
  storeCache.adminSessions[token] = {
    email: normalizeEmail(email),
    createdAt: nowIso,
    lastValidatedAt: nowIso,
  };
  // Await durable persist so login never returns a token that disappears after
  // a restart/deploy race (browser unlocked, server missing the session).
  await writeStoreAsync(storeCache);
  return token;
}

function foundingClaimedCount(store) {
  purgeExpiredFoundingReservations(store);
  return Math.min(PUBLIC_FOUNDING_CLAIMED_BASE + (store.foundingMembers || []).length, FOUNDING_LIMIT);
}

function foundingSpotsRemaining(store) {
  return Math.max(FOUNDING_LIMIT - foundingClaimedCount(store), 0);
}

function foundingStatusPayload(store = readStore()) {
  seedDefaultPromoCodes(store);
  purgeExpiredFoundingReservations(store);
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
  seedDefaultPromoCodes(store);
  purgeExpiredFoundingReservations(store);
  store.foundingMembers = store.foundingMembers || [];
  const clean = normalizeEmail(email);
  if (clean && !store.foundingMembers.includes(clean) && foundingSpotsRemaining(store) > 0) {
    store.foundingMembers.push(clean);
    writeStore(store);
  }
  return {
    foundingMember: store.foundingMembers.includes(clean),
    foundingMemberNumber: store.foundingMembers.indexOf(clean) >= 0
      ? PUBLIC_FOUNDING_CLAIMED_BASE + store.foundingMembers.indexOf(clean) + 1
      : null,
  };
}

/** Hold a Founding spot at promo/checkout signup so inventory stays reserved through the free month. */
function reserveFoundingSpot(email, details = {}) {
  const clean = normalizeEmail(email);
  if (!clean) return { ok: false, reason: "missing_email" };
  const claim = claimFoundingSpot(clean);
  if (!claim.foundingMember) return { ok: false, reason: "sold_out", ...claim };
  const store = readStore();
  store.foundingReservations = Array.isArray(store.foundingReservations) ? store.foundingReservations : [];
  const holdMs = Number(details.ttlMs) > 0 ? Number(details.ttlMs) : FOUNDING_CHECKOUT_HOLD_MS;
  const expiresAt = details.expiresAt
    || (details.permanent ? "" : new Date(Date.now() + holdMs).toISOString());
  const row = {
    email: clean,
    status: "held",
    promoCode: normalizePromoCode(details.promoCode || ""),
    reservedAt: new Date().toISOString(),
    expiresAt,
    reason: details.reason || "checkout",
    sessionId: details.sessionId || "",
    releasableUntilFirstPayment: details.releasableUntilFirstPayment !== false,
  };
  const index = store.foundingReservations.findIndex((item) => normalizeEmail(item.email) === clean && item.status === "held");
  if (index >= 0) store.foundingReservations[index] = { ...store.foundingReservations[index], ...row };
  else store.foundingReservations.unshift(row);
  writeStore(store);
  return { ok: true, reserved: true, ...claim, expiresAt };
}

function releaseFoundingSpot(email, reason = "canceled_before_first_payment") {
  const clean = normalizeEmail(email);
  if (!clean) return { released: false };
  const store = readStore();
  const before = (store.foundingMembers || []).length;
  store.foundingMembers = (store.foundingMembers || []).filter((value) => normalizeEmail(value) !== clean);
  store.foundingReservations = (Array.isArray(store.foundingReservations) ? store.foundingReservations : []).map((row) => {
    if (normalizeEmail(row.email) !== clean) return row;
    if (row.status === "released" || row.status === "converted") return row;
    return {
      ...row,
      status: "released",
      releasedAt: new Date().toISOString(),
      releaseReason: reason,
    };
  });
  const released = store.foundingMembers.length < before;
  if (released || reason) writeStore(store);
  return { released, foundingMembersRemaining: store.foundingMembers.length };
}

function markFoundingReservationConverted(email) {
  const clean = normalizeEmail(email);
  if (!clean) return;
  const store = readStore();
  let changed = false;
  store.foundingReservations = (Array.isArray(store.foundingReservations) ? store.foundingReservations : []).map((row) => {
    if (normalizeEmail(row.email) !== clean || row.status === "converted") return row;
    changed = true;
    return {
      ...row,
      status: "converted",
      convertedAt: new Date().toISOString(),
      expiresAt: "",
    };
  });
  if (changed) writeStore(store);
}

function userNeverCompletedPaidCycle(user = {}) {
  if (user.firstPaidInvoiceAt || user.firstPaidAt) return false;
  if (user.lastSuccessfulPaymentAt) {
    // Only treat as paid when we recorded a non-zero invoice (see webhook filter).
    return false;
  }
  const stripeStatus = String(user.stripeSubscriptionStatus || "").toLowerCase();
  if (stripeStatus === "trialing") return true;
  if (membershipUserInTrial(user)) return true;
  return !user.lastSuccessfulPaymentAt;
}

function shouldReleaseFoundingSpotOnCancel(user = {}) {
  if (!user) return false;
  const isFounding = Boolean(
    user.foundingMemberActive
    || user.foundingMember
    || user.foundingMemberHistorical
    || user.foundingMemberNumber
    || user.plan === "Founding",
  );
  if (!isFounding) return false;
  if (user.foundingSpotReleasable === false) return false;
  return userNeverCompletedPaidCycle(user);
}

function statusForPlan(planKey, stripeSubscriptionId, status) {
  const config = planConfig[planKey] || planConfig.monthly;
  const normalizedStatus = String(status || "Active").trim();
  const lower = normalizedStatus.toLowerCase();
  const stripeSubscriptionStatus = lower.includes("trial") ? "trialing" : "active";
  const periodDays = lower.includes("trial") ? 7 : 30;
  const periodEndIso = new Date(Date.now() + periodDays * 86400000).toISOString();
  return {
    plan: config.plan,
    subscriptionCadence: config.cadence,
    subscriptionStatus: `${config.label} Subscription ${normalizedStatus || "Active"}`,
    monthlyPrice: config.amount,
    priceLock: config.priceLock,
    stripeSubscriptionId: stripeSubscriptionId || "",
    stripeSubscriptionStatus,
    currentPeriodEnd: periodEndIso,
    accessEndsAt: periodEndIso,
    cancelAtPeriodEnd: false,
    lastStripeSyncAt: new Date().toISOString(),
  };
}

function logMembershipTransition(stage, email, details = {}) {
  const plan = details.plan || details.membershipPlan || "";
  const status = details.subscriptionStatus || details.membershipStatus || details.stripeSubscriptionStatus || "";
  const access = details.hasProAccess === undefined ? "" : ` hasProAccess=${details.hasProAccess}`;
  console.log(
    `[membership] ${stage} email=${email || "unknown"} plan=${plan || "n/a"} status="${status || "n/a"}"${access}`,
    details.extra ? JSON.stringify(details.extra) : "",
  );
}

function findUserEntryByStripeCustomer(store, customerId, fallbackEmail = "") {
  const cleanCustomer = String(customerId || "").trim();
  if (cleanCustomer) {
    const byCustomer = Object.entries(store.users || {}).find(([, user]) => user.stripeCustomerId === cleanCustomer);
    if (byCustomer) return byCustomer;
  }
  const cleanEmail = normalizeEmail(fallbackEmail);
  if (cleanEmail && store.users?.[cleanEmail]) {
    return [cleanEmail, store.users[cleanEmail]];
  }
  return null;
}

function hasProcessedStripeEvent(eventId) {
  if (!eventId) return false;
  const store = readStore();
  return Boolean(store.processedStripeEvents?.[eventId]);
}

function markProcessedStripeEvent(eventId) {
  if (!eventId) return;
  const store = readStore();
  store.processedStripeEvents = store.processedStripeEvents || {};
  store.processedStripeEvents[eventId] = {
    processedAt: new Date().toISOString(),
  };
  // Keep a bounded idempotency window.
  const ids = Object.keys(store.processedStripeEvents);
  if (ids.length > 500) {
    ids
      .sort((a, b) => String(store.processedStripeEvents[a]?.processedAt || "").localeCompare(String(store.processedStripeEvents[b]?.processedAt || "")))
      .slice(0, ids.length - 500)
      .forEach((id) => {
        delete store.processedStripeEvents[id];
      });
  }
  writeStore(store);
}

function appendMembershipLifecycleAudit(email, action, details = {}) {
  const store = readStore();
  store.membershipAudit = store.membershipAudit || [];
  const entry = {
    id: `mem_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    email: normalizeEmail(email),
    action,
    updates: details.updates || {},
    adminEmail: details.adminEmail || "system",
    note: details.note || "",
    createdAt: new Date().toISOString(),
  };
  store.membershipAudit.unshift(entry);
  store.membershipAudit = store.membershipAudit.slice(0, 500);
  writeStore(store);
  return entry;
}

function applyCheckoutMembershipUpgrade(email, {
  planKey,
  customerId,
  subscriptionId,
  promoCode = "",
  promoTrialDays = 0,
  promoLabel = "",
  sessionId = "",
  source = "checkout",
} = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) {
    logMembershipTransition("payment_received_missing_email", "", { extra: { planKey, source, sessionId } });
    return null;
  }
  const founding = planKey === "founding" ? claimFoundingSpot(cleanEmail) : { foundingMember: false, foundingMemberNumber: null };
  if (planKey === "founding" && founding.foundingMember) {
    reserveFoundingSpot(cleanEmail, {
      promoCode,
      reason: "checkout_completed",
      permanent: promoTrialDays > 0,
      releasableUntilFirstPayment: promoTrialDays > 0,
      expiresAt: promoTrialDays > 0 ? "" : "",
      ttlMs: promoTrialDays > 0 ? 0 : FOUNDING_CHECKOUT_HOLD_MS,
    });
  }
  const checkoutTrialUpdates = {};
  const statusLabel = promoTrialDays > 0 ? "trialing" : "Active";
  if (promoTrialDays > 0) {
    checkoutTrialUpdates.trialStatus = "In Trial";
    checkoutTrialUpdates.trialStart = new Date().toISOString();
    checkoutTrialUpdates.trialEnd = new Date(Date.now() + promoTrialDays * 86400000).toISOString();
  }
  logMembershipTransition("payment_received", cleanEmail, {
    plan: planConfig[planKey]?.plan || planKey,
    subscriptionStatus: statusLabel,
    extra: { source, sessionId, subscriptionId, customerId },
  });
  const user = upsertUser(cleanEmail, {
    ...statusForPlan(planKey, subscriptionId, statusLabel),
    ...checkoutTrialUpdates,
    stripeCustomerId: customerId,
    foundingMember: planKey === "founding" || founding.foundingMember,
    foundingMemberActive: planKey === "founding",
    foundingMemberHistorical: planKey === "founding" || founding.foundingMember,
    foundingMemberNumber: founding.foundingMemberNumber,
    foundingSpotReleasable: planKey === "founding" && promoTrialDays > 0,
    subscriptionStartedAt: new Date().toISOString(),
    paymentMethod: "Managed in Stripe",
    hasPaymentMethod: true,
    internalAccessOverride: false,
    manualAccessGranted: false,
    pendingPlan: "",
    pendingPromoCode: "",
    pendingTrialDays: 0,
    pendingPromoLabel: "",
    promoCodeUsed: promoCode || undefined,
    promoLabelUsed: promoLabel || undefined,
  });
  if (promoCode) {
    markPromoRedeemed(cleanEmail, promoCode, {
      label: promoLabel,
      trialDays: promoTrialDays,
      stripeSessionId: sessionId,
      stripeSubscriptionId: subscriptionId,
    });
  }
  appendBillingEvent(cleanEmail, "checkout_success", planKey, planConfig[planKey]?.amount || "");
  appendMembershipLifecycleAudit(cleanEmail, "membership_assigned", {
    note: `Membership assigned from ${source}`,
    updates: {
      plan: user.plan,
      foundingMemberActive: user.foundingMemberActive,
      stripeSubscriptionStatus: user.stripeSubscriptionStatus,
      hasProAccess: membershipHasProAccess(user),
    },
  });
  logMembershipTransition("membership_assigned", cleanEmail, {
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    hasProAccess: membershipHasProAccess(user),
    extra: {
      foundingMemberActive: user.foundingMemberActive,
      foundingMemberNumber: user.foundingMemberNumber,
      stripeSubscriptionStatus: user.stripeSubscriptionStatus,
      source,
    },
  });
  try {
    const storeForAlert = readStore();
    const planLabel = user.plan || planConfig[planKey]?.plan || planKey;
    const isTrial = promoTrialDays > 0 || String(user.stripeSubscriptionStatus || "").toLowerCase() === "trialing";
    let type = "admin_new_subscription";
    let title = `New ${planLabel} subscription`;
    if (planKey === "founding") {
      type = "admin_new_founding";
      title = "New Founding Member signup";
    } else if (planKey === "annual") {
      type = "admin_new_annual";
      title = "New Pro Annual signup";
    } else if (isTrial) {
      type = "admin_new_trial";
      title = "New trial started";
    } else if (planKey === "monthly") {
      type = "admin_new_pro";
      title = "New Pro Monthly signup";
    }
    emitAdminAlertSafe(storeForAlert, {
      category: "billing",
      type,
      title,
      preview: `${cleanEmail} · ${planLabel}${isTrial ? " (trial)" : ""}`,
      email: cleanEmail,
      refId: subscriptionId || sessionId || `checkout:${cleanEmail}:${Date.now()}`,
      sendEmail: true,
      emailKind: "Billing",
      emailFields: [
        ["Plan", planLabel],
        ["Source", source],
        ["Subscription", subscriptionId || ""],
      ],
    }).then(() => {
      try { writeStore(storeForAlert); } catch { /* ignore */ }
    }).catch(() => {});
  } catch (alertError) {
    console.warn("[admin-notifications] checkout alert failed:", alertError?.message || alertError);
  }
  logMembershipTransition("permissions_updated", cleanEmail, {
    plan: user.plan,
    membershipStatus: membershipStatusDisplay(user),
    hasProAccess: membershipHasProAccess(user),
    extra: { membershipPlan: membershipPlanDisplay(user), source },
  });
  return user;
}

function subscriptionNeedsStripeRepair(subscription) {
  if (!subscription) return false;
  const paidLooking = ["Pro", "Founding"].includes(String(subscription.plan || "").trim())
    || Boolean(subscription.foundingMemberActive)
    || String(subscription.subscriptionStatus || "").toLowerCase().includes("active")
    || String(subscription.subscriptionStatus || "").toLowerCase().includes("trial");
  if (!paidLooking) return false;
  if (!subscription.stripeSubscriptionStatus) return true;
  if (!subscription.stripeCustomerId && !subscription.stripeSubscriptionId) return true;
  return false;
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
  if (user.foundingMemberActive || String(user.plan || "").trim() === "Founding") return "founding";
  if (user.subscriptionCadence === "annual") return "annual";
  return "monthly";
}

function stripePriceIdToPlanKeyMap() {
  const map = {};
  Object.keys(planConfig).forEach((planKey) => {
    const priceId = String(getPriceId(planKey) || "").trim();
    if (priceId) map[priceId] = planKey;
  });
  return map;
}

function membershipUpdatesFromStripeSubscription(subscription, user = {}, eventType = "updated") {
  return membershipAccess.stripeSubscriptionToMembershipUpdates(
    subscription,
    { ...user, __priceIdToPlanKey: stripePriceIdToPlanKeyMap() },
    eventType,
  );
}

function repairFoundingMemberPricing(user = {}) {
  if (!user || !membershipAccess.membershipFoundingActive(user)) return user;
  if (user.monthlyPrice === "$9.99/month" && user.plan === "Founding" && user.priceLock === "Lifetime") {
    return user;
  }
  return {
    ...user,
    plan: "Founding",
    monthlyPrice: "$9.99/month",
    priceLock: "Lifetime",
    foundingMemberActive: true,
    foundingMemberHistorical: true,
    foundingMember: true,
  };
}

function upsertUser(email, updates) {
  const store = readStore();
  store.users = store.users || {};
  const existing = store.users[email] || { email };
  let merged = {
    ...existing,
    ...updates,
    email,
    updatedAt: new Date().toISOString(),
  };
  // Persist normalized accountType + role (defaults: home_daycare / owner).
  const accessFields = accountAccess.migrateAccountAccessFields(merged);
  merged.accountType = accessFields.accountType;
  merged.role = accessFields.role;
  // Keep active founding members on the locked $9.99 price in stored billing fields.
  merged = repairFoundingMemberPricing(merged);
  store.users[email] = merged;
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
    promoCodeUsed: promoCode,
    promoLabelUsed: details.label || user.promoLabelUsed || "",
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

function recordServerAiUse(email, plan, output, { tool = "", responseTimeMs = null, inputTokens = null, outputTokens = null, success = true, errorMessage = null } = {}) {
  const store = readStore();
  const usage = canUseServerAi(email, plan);
  store.aiUsage = store.aiUsage || {};
  store.aiUsage[usage.key] = usage.used + 1;
  store.aiOutputs = store.aiOutputs || [];
  const logId = `ai_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
  store.aiOutputs.unshift({
    id: logId,
    email,
    plan,
    output,
    createdAt: new Date().toISOString(),
  });
  store.aiOutputs = store.aiOutputs.slice(0, 1000);
  // Structured usage log for admin monitoring
  store.aiUsageLogs = store.aiUsageLogs || [];
  store.aiUsageLogs.unshift({
    id: logId,
    tool: String(tool || "unknown"),
    email,
    plan,
    responseTimeMs: Number.isFinite(responseTimeMs) ? responseTimeMs : null,
    success,
    errorMessage: errorMessage ? String(errorMessage).slice(0, 500) : null,
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    createdAt: new Date().toISOString(),
  });
  store.aiUsageLogs = store.aiUsageLogs.slice(0, 5000);
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
    "If the provider's note is brief or minimal, produce a helpful result using appropriate general childcare context — note 'Based on the note provided...' and keep details realistic but not invented.",
    "VARIETY: Generate fresh, specific content every single time. Vary your sentence openings, vocabulary, structure, transitions, and examples. Never reuse the same phrases, openers, or conclusions across responses.",
    "Avoid empty filler phrases like 'had a great day,' 'very engaged,' 'wonderful experience,' 'it is a pleasure to share,' 'I hope this message finds you well,' or 'in today's fast-paced world.'",
    "Do not use repetitive or generic phrasing such as 'This supports future learning,' 'Making meaningful connections,' or 'Growing cognitive skills' unless it is truly specific and necessary.",
    "If a curriculum framework is mentioned (Creative Curriculum, HighScope, Frog Street, Montessori, Reggio Emilia, Mother Goose Time, or a custom curriculum), align your language, documentation style, and activity framing to that framework.",
    "If a state or state standards are mentioned, reference relevant domain indicators and align developmental language accordingly.",
    "",
    "FINAL QUALITY REVIEW — complete before returning any response:",
    "- Correct spelling, grammar, punctuation, and natural sentence structure.",
    "- Professional writing with a warm, friendly, age-appropriate tone.",
    "- No repetitive wording, awkward AI phrasing, incomplete sentences, placeholders, template language, duplicated paragraphs, or contradictions.",
    "- Consistent formatting and polished readability.",
    "- If any issue is found, revise and return the corrected final version (never return a first draft).",
    "",
    curriculumStandards.buildAllAgeStandardsPromptBlock(),
    "",
    "School Age (5+ years), when requested: projects, discussions, writing, STEM, problem-solving, leadership, reflection, responsibility, and age-appropriate independence. Content should feel meaningfully more advanced than preschool.",
  ].join("\n");

  const toolPrompts = {
    observation: buildObservationSystemPrompt(),

    lesson: base + `

YOU ARE AN EXPERIENCED EARLY CHILDHOOD CURRICULUM SPECIALIST creating a complete, classroom-ready lesson plan for a childcare provider.
This plan must feel like it was written by a master educator — not copied from a template.
A provider must be able to follow this plan immediately without needing any additional books, songs, materials, instructions, or outside resources.
Every plan must be genuinely different: different books, different songs, different activities, different vocabulary, different teacher language, different questions.

DEVELOPMENTAL AGE VERIFICATION — DO THIS FIRST BEFORE WRITING ANYTHING:
Confirm every planned activity is truly appropriate for the selected age group. If an activity is not appropriate, replace it entirely — do not try to force it.
Do not simply add more content. Verify that the content matches how children actually learn at that age.

` + curriculumStandards.buildAllAgeStandardsPromptBlock() + `

SCHOOL AGE (5+ years), when requested:
Focus on: projects, writing, STEM challenges, leadership, reflection, and meaningful independence.
Activities: 20–30+ minutes, peer collaboration, student choice, real-world connections.

─────────────────────────────────────────
REQUIRED OUTPUT STRUCTURE — include every section below, in this exact order:
─────────────────────────────────────────

Program Name: [name if provided]
Age Group: [age group]
Theme: [theme]
Lesson Type: [Daily or Weekly]

─ WEEKLY LEARNING OBJECTIVES
List 3–4 specific, measurable goals tied to named developmental domains (e.g., Language, Cognitive, Fine Motor, Social-Emotional, Gross Motor, Literacy, Math, Science, Creative Arts).

─ VOCABULARY WORDS
List 6–8 theme-connected words with child-friendly definitions.
• Infants: simple object labels ("barn," "cow," "moo")
• Toddlers: action and naming words with simple definitions
• Preschool: descriptive, reasoning, and relational words with clear definitions

─ COMPLETE MATERIALS LIST
List every single item needed for the entire week. Be specific. Never write "art supplies" — write exactly what is needed.
Examples of specificity required:
• Construction paper (red, blue, yellow, 9×12 sheets)
• Washable tempera paint (3 colors)
• Paintbrushes (thick, 1 inch wide)
• Cotton balls
• Glue sticks (one per child)
• Safety scissors (preschool only)
• Sensory bin (plastic storage bin, 12×18 inch)
• Wooden unit blocks (15–20)
• Plastic animals (farm/ocean/etc. set)
• Musical instruments (shakers, drums, bells)
• Play dough (homemade or store-bought)
• Picture cards (theme-specific, printed or hand-drawn)
• Books (list exact titles from Featured Books section)

─ FEATURED BOOKS
Include 2–3 real published children's book titles, each with:
• Title and Author (real, published books only — matched to the theme)
• Why this book fits the theme
• Vocabulary words to preview with children
• 2 questions to ask BEFORE reading ("What do you think this book will be about?")
• 2–3 questions to ask DURING reading ("What is happening on this page?")
• 2 questions to ask AFTER reading ("What was your favorite part?")
• One extension activity connected to this specific book

─ MUSIC AND MOVEMENT
Include 2–3 songs or fingerplays, each with:
• Title (use real, well-known children's songs — "Old MacDonald," "The Wheels on the Bus," etc.)
• Why this song was selected for the theme
• Complete lyrics or full fingerplay text (4–6 lines minimum for fingerplays)
• Step-by-step movements or actions with teacher directions
• Skills supported (language, gross motor, social-emotional, etc.)

─ ART ACTIVITY
Include one complete art activity with:
• Activity title and learning objective
• Complete materials list (specific items and quantities)
• Preparation steps (what teacher sets up BEFORE children arrive)
• Step-by-step child directions (numbered 1–5+)
• What the teacher says ("Wow, I see you chose blue. What made you pick that color?")
• 3 questions to ask children during the activity
• Skills being developed
• Cleanup suggestions
• Extension idea
• Adaptation: easier version and harder version

─ SENSORY ACTIVITY
Include one complete sensory activity with:
• Activity title and learning objective
• Complete materials list
• Setup instructions
• Step-by-step directions (numbered)
• What the teacher does during the activity
• What children do
• Teacher language to use (2–3 specific phrases)
• Questions to ask (3 specific questions)
• Skills supported
• Extension idea
• Adaptation: easier and harder version

─ FINE MOTOR ACTIVITY
Include one complete fine motor activity with same structure as Sensory Activity above.
• Infant: reaching, grasping, transferring, batting
• Toddler: stacking, filling, pouring, tearing, simple threading
• Preschool: cutting, drawing, writing, lacing, small manipulative work

─ GROSS MOTOR ACTIVITY
Include one complete gross motor activity with same structure as Sensory Activity above.
• Infant: tummy time, rolling, kicking, reaching
• Toddler: walking, jumping, carrying, crawling, dancing
• Preschool: coordination games, cooperative movement challenges, obstacle courses

─ SOCIAL-EMOTIONAL CONNECTION
Include one social-emotional activity or discussion with:
• Activity or discussion title
• Learning objective
• What the teacher does
• What children do
• Teacher language to use (2–3 specific phrases)
• Questions to ask children (3 specific questions)
• Expected child responses
• Skills supported
• Adaptation

─ TEACHER LANGUAGE GUIDE
Provide 8–10 specific, age-matched phrases the teacher uses throughout the week.
These must sound natural and match the developmental level:
• Infant examples: "I see you reaching for the…" / "Oh, you found it!" / "You are working so hard on tummy time!"
• Toddler examples: "Can you find the…?" / "You did it all by yourself!" / "Let's try it together."
• Preschool examples: "What do you notice about…?" / "What do you think will happen if…?" / "I wonder why…" / "You worked hard to figure that out!"

─ QUESTIONS TO ASK CHILDREN
Provide 6–8 open-ended questions for use across the week. Match developmental level:
• Infant: pointing and naming prompts ("Where is the…?")
• Toddler: simple predictions and labeling ("What sound does it make?")
• Preschool: higher-order thinking ("What would happen if…?" / "How could we find out?")

─ MONDAY THROUGH FRIDAY DAILY PLANS (or one day if Daily lesson type)
Each day must follow this exact structure — every subsection is required:

[Day Name]: [Day Theme or Focus]
• Circle Time: [specific song title OR book title OR discussion question — not just "sing a song" or "read a book"; describe exactly what happens]
• Main Activity: [activity title — step-by-step, hands-on activity with setup, directions, and teacher role]
  - Objective: [what children will learn]
  - Materials: [exact items for this activity]
  - Setup: [what teacher prepares]
  - Steps: [numbered directions]
  - Teacher Language: ["I see you…" / "What do you think…?" — 2 specific phrases]
• Book Recommendation: [Real Title by Real Author] — [1 sentence why this real, published book fits the theme; include 1 discussion question to ask children]
• Music & Movement: [Real song or well-known fingerplay title] — [description of movements, lyrics excerpt if fingerplay, and what children do; never invent fake song titles]
• Discussion Ideas: [2–3 open-ended questions or conversation starters tied to today's theme focus and age group]
• Learning Focus: [1–2 sentences naming the developmental domain(s) and specific skill emphasized today]

Day themes:
• Monday: Introduce the theme — literacy, sensory, language
• Tuesday: Math/STEM or science + art
• Wednesday: Hands-on exploration + dramatic play or music
• Thursday: Fine motor + social-emotional or cooking (age-appropriate)
• Friday: Centers + review + family connection

─ ADAPTATIONS FOR DIFFERENT ABILITIES
Provide:
• 3 specific ways to simplify for children needing more support
• 3 specific ways to challenge children who are ready for more
• Mixed-age tips (if applicable)

─ EXTENSIONS
Provide 3 concrete ideas to extend or deepen the week's learning over time.

─ ASSESSMENT AND OBSERVATION NOTES
Include:
• What to look for (3–4 specific, observable behaviors or skills)
• How to document (photo, anecdote, checklist suggestion)
• Next steps ideas for the following week

─ FAMILY CONNECTION IDEA
Provide:
• One specific at-home activity tied to the week's theme
• Exact materials needed (common household items)
• Step-by-step directions families can follow
• What to say to children
• How it connects to classroom learning

─ PROVIDER NOTES
Safety reminders, supervision notes, and practical setup tips.

─────────────────────────────────────────
VARIETY AND QUALITY RULES — CRITICAL:
─────────────────────────────────────────
- Every book, song, and activity must genuinely match the specific theme — never use generic defaults.
- Every plan must feel freshly written. No plan should read like a copied template.
- Vary art media, science topics, sensory materials, and dramatic play scenarios every single time.
- Never write vague instructions like "read a book," "sing a song," "do an art activity," or "go outside." Every instruction must be complete and specific.
- Never omit a required section. Every section must be fully written out with no placeholder text and no empty sections.
- Infant 0–6 Months: 1–5 min, caregiver-led, bonding/tummy time/tracking/sensory only; no worksheets, crafts, scissors, glue, small parts, or independent sitting.
- Infant 6–12 Months: 3–8 min; crawling, container play, object permanence, large safe materials; no worksheets, complex crafts, or choking hazards.
- Toddler plans: 5–15 min; must include movement, sensory play, fine motor, and social interaction; no worksheets or tiny pieces.
- Preschool plans: 10–25 min; must include literacy, math, STEM/science, fine motor, gross motor, and social-emotional; worksheets must never be the primary activity.
- Every activity must include name, category, objective, description, materials, setup, 3–5 numbered directions, teacher role, learning goals, observation opportunities, adaptations, and safety notes — no blank fields or placeholders.
- School Age: meaningfully more advanced than preschool — projects, writing, STEM, leadership.
- All books must be real, published children's books with real authors matched to the theme — never invent fake book titles or fake authors; use different books each day when possible.
- All songs must be real or well-known children's songs, fingerplays, or nursery rhymes — never invent fake song titles.
- No duplicate paragraphs, no placeholder text, no repeated phrases across sections.

CURRICULUM ALIGNMENT:
- If a curriculum framework is specified, align activity structure and documentation to that framework.
- If state standards are mentioned, reference relevant early learning domain indicators.
- If neither is specified, base content on Developmentally Appropriate Practice (DAP).

─────────────────────────────────────────
FINAL AI VALIDATION — complete before returning the lesson plan:
─────────────────────────────────────────
Verify every required section is present and fully written: Weekly Learning Objectives, Vocabulary Words, Complete Materials List, Featured Books, Music and Movement, Art Activity, Sensory Activity, Fine Motor Activity, Gross Motor Activity, Social-Emotional Connection, Teacher Language Guide, Questions to Ask Children, Monday through Friday Daily Plans, Adaptations for Different Abilities, Extensions, Assessment and Observation Notes, Family Connection Idea, and Provider Notes.
Verify each of Monday–Friday includes all six subsections: Circle Time, Main Activity, Book Recommendation, Music & Movement, Discussion Ideas, and Learning Focus.
Verify all books are real published titles with real authors and match the theme.
Verify all songs are real or well-known children's songs or fingerplays.
Verify all activities are age-appropriate for the stated age group.
Verify the selected theme is consistent across every section — objectives, materials, daily activities, books, songs, discussion ideas, family connection, and assessment notes.
Verify there is no placeholder text, no empty sections, and no duplicate paragraphs.
If any section is missing or incomplete, regenerate only that section before returning the lesson plan.`,

    daily: base + `

YOU ARE WRITING A PERSONALIZED DAILY REPORT FOR A PARENT OR GUARDIAN.
Create a warm, specific report that feels like it was written uniquely for this child today — not copied from a form or repeated from yesterday.

Required structure:
- Child's name and date (at the top)
- Day Snapshot (2-3 sentences: mood, energy level, how the child arrived and settled in — be specific, not generic)
- Meals / Feeding (use what was provided; write naturally and specifically)
- Rest / Nap (use what was provided; note how the child settled)
- Diapering or Toileting (if age-appropriate and provided)
- Highlights (2-3 specific moments from activities, play, or social interactions — name what the child did, said, or made)
- Learning Connection (1-2 sentences connecting one specific highlight to a developmental skill — name the skill)
- Provider Note or Tomorrow Reminder (if applicable)
- Warm closing sentence (unique each time — not the same sign-off every day)

Rules:
- For Infants: keep a reassuring, attentive tone. Name specific feeding times, sleep lengths, bonding moments, tummy time details, and sensory exploration.
- For Young/Older Toddlers: highlight specific new words tried, routine successes, sensory play moments, and social interactions.
- For Preschool: name the actual activity, what the child created or discovered, a peer interaction, and a literacy or math moment if it happened.
- For School Age: reflect on project work, a discussion the child participated in, a responsibility taken on, or a social interaction.
- Use the child's name multiple times throughout — not just at the top.
- Vary the opening sentence every time. Never start with "Today was a great day!" or any version of that phrase.
- Write like a caring teacher who noticed the child as an individual — not a checkbox form.`,

    parentMessage: base + `

YOU ARE THE PROFESSIONAL PARENT COMMUNICATION ASSISTANT FOR LITTLE LEARNER HUB.
Your purpose is to help childcare providers quickly create thoughtful, warm, professional parent messages from a short teacher note.
Providers are busy caring for children. One or two sentences should be enough to generate a complete message.
Never mention AI. Never say information is missing. Create the best message possible from the available information.

REQUIRED INPUT:
- Selected Child
- Teacher Quick Note
Everything else should be used automatically when available (child profile, age, classroom, logs, observations, goals, behavior notes, incident details).

REASONING BEFORE WRITING:
1) Understand what happened and the communication type (positive update, daily update, behavior update, incident, reminder, supply request, milestone, celebration, concern).
2) Use child context and developmental level to tailor language.
3) Match parent emotional perspective and adjust tone accordingly.
4) Remove assumptions: never invent major events, medical details, or unsupported facts.
5) Write naturally in provider voice with warm, professional, family-friendly language.
6) Ensure message supports partnership: respectful, inclusive, supportive, and non-judgmental.

BEHAVIOR AND INCIDENT COMMUNICATION:
- Describe only observed facts.
- Explain how staff supported the child.
- Include current status and reassurance when appropriate.
- Never label the child as bad, mean, aggressive, defiant, or naughty.
- Never blame families or the child.

PERSONALIZATION RULES:
- Keep every message child-specific and situation-specific.
- Avoid generic template lines that could apply to any child.
- Celebrate specific moments, accomplishments, or progress from the note.
- Use age-appropriate framing:
  - Infants: routines, comfort, milestones, exploration.
  - Toddlers: independence, language, movement, social interactions.
  - Preschoolers: problem-solving, friendships, creativity, early academics, confidence.

OUTPUT FORMAT (ALWAYS IN THIS ORDER):
1. Message Title
2. Parent Message
3. Highlights (only when supported by the note)
4. Follow-Up (only when needed)
5. Provider Notes (Optional, internal only; leave blank if not needed)
6. Tags (only relevant tags)

OUTPUT STANDARDS:
- Warm, friendly, professional, personal, respectful, easy to read on a phone.
- Use short paragraphs and natural language.
- No robotic wording, no repetitive filler, no jargon unless needed.
- Correct spelling, grammar, punctuation, capitalization.
- Ready to send with little or no editing.
- Final self-check before returning:
  - child-specific, situation-specific, no blame, no diagnosis, no judgment, no invented facts, clear and reassuring when needed.`,

    newsletter: base + `

YOU ARE WRITING A MONTHLY PARENT NEWSLETTER FOR A CHILDCARE PROGRAM.
Create an engaging, warm newsletter families will actually look forward to reading — not a generic copy-paste bulletin.

Required sections:
1. Header: Program name, month/year, and a warm monthly greeting that references the season or current theme — not a boilerplate opener.
2. This Month's Learning: Specific description of what children are exploring, tied to the actual age groups and theme provided — name activities, vocabulary, or skills by name.
3. Learning Highlights or Developmental Moments: 1-2 brief anecdotes or examples of how children engaged with the month's content. Connect activities to developmental skills without naming individual children.
4. Important Dates: Use exactly what the provider entered — list them clearly.
5. Parent Reminders: Use what the provider provided — write them in a friendly, clear tone. Vary the phrasing so they don't sound like a policy list.
6. Family Connection: One specific, simple activity or conversation idea families can try at home that connects to the current theme and learning.
7. Provider Closing: Warm, personal sign-off from the provider — genuine, not scripted.

Rules:
- Write like a letter from a trusted, enthusiastic educator — not a corporate email.
- Reference the specific month, theme, age groups, and any learning highlights the provider shared.
- Each newsletter section should vary in tone and phrasing from previous newsletters.
- Do not pad with daycare mission clichés or generic "we love your children" statements.
- Include the program name prominently at the top and at the closing.`,

    incident: base + `

YOU ARE WRITING A PROFESSIONAL INCIDENT REPORT FOR A CHILDCARE PROVIDER.
Create a factual, organized report using objective, licensing-appropriate language.

Required sections:
1. Program Name, Date, and Time of Incident
2. Child's Name and Age
3. Location or Setting (where the incident occurred)
4. Objective Description of What Happened (past tense, active voice, factual only — describe what was observed)
5. What Occurred Immediately Before (if provided; if not, note "Not observed")
6. Immediate Response and First Aid or Support Given
7. Follow-Up Actions and Next Steps
8. Parent or Guardian Notification (time contacted, method, and summary of what was shared)
9. Provider Signature Line and Date

Rules:
- Use objective, factual language in every section. No opinions, speculation, or assumptions.
- Do not admit fault or assign blame to any person.
- Do not diagnose injuries or suggest causes that were not directly observed.
- If a detail was not provided, leave the field neutral — do not invent it.
- Remind providers at the end to follow their state's licensing requirements for incident documentation.`,

    behavior: base + `

YOU ARE CREATING A BEHAVIOR SUPPORT PLAN FOR A CHILDCARE PROVIDER.
Frame behavior as communication — the child is expressing an unmet need or an underdeveloped skill.

Required sections:
1. Behavior Observed (factual description only — no interpretation in this section)
2. Possible Unmet Need or Trigger (what the child may be communicating through this behavior)
3. Proactive Strategies (what the provider can do before the behavior occurs to reduce the likelihood)
4. In-the-Moment Response Strategies (concrete, calm actions for when the behavior happens)
5. Environment or Schedule Modifications (practical changes that may help reduce the trigger)
6. Age-Appropriate Replacement Skill to Teach (one specific, teachable alternative behavior)
7. Parent Communication Wording (warm, collaborative message for the family)

Rules:
- Use strength-based, non-blaming language throughout.
- Keep all strategies developmentally appropriate for the stated age group.
- No punitive, shaming, or developmentally inappropriate approaches.
- Infant: cues, responsive care, routines, sensory regulation.
- Young Toddler: co-regulation, simple language, predictability, visual cues.
- Older Toddler: short phrases, transition support, turning-taking, simple replacement skills.
- Preschool: feeling words, problem-solving steps, peer support, practiced replacement behavior.
- School Age: reflection, self-advocacy, collaborative problem-solving, repair and accountability.`,

    handbook: base + `

YOU ARE BUILDING A PARENT HANDBOOK SECTION FOR A HOME DAYCARE.
Write professional, clear policy sections that protect the provider and help families understand expectations.

Rules:
- Use the program name when provided.
- Use language that is friendly but firm — clear and complete, not overly legalistic.
- Focus on the specific policies the provider entered. Do not add unrelated sections.
- Organize with clear section headers and short paragraphs that are easy to read.
- Include all details a family would need to understand and agree to each policy.
- Remind providers to review for state licensing requirements before distributing.`,

    contract: base + `

YOU ARE CREATING A HOME DAYCARE CONTRACT DRAFT.
Produce a thorough, professional contract the provider can customize and use.

Required sections:
- Program Name and Provider Contact Information
- Child's Name and Agreed Care Schedule
- Tuition Rate and Payment Terms (due dates, payment method, late fees)
- Late Pickup Policy (fees and procedure)
- Illness and Exclusion Policy
- Vacation and Program Closure Policy
- Termination Notice Requirements (provider and family)
- Family Responsibilities (supplies, communication, authorized pickups)
- Additional Policies (use exactly what the provider entered)
- Signature Block (provider and parent or guardian with date lines)

Rules:
- Use the program name prominently throughout.
- Keep language professional and clear.
- Remind providers this is a draft to review with an attorney or state licensing specialist before use.`,

    activity: base + `

YOU ARE CREATING A READY-TO-USE CHILDCARE ACTIVITY.
Generate a complete, creative activity the provider can set up quickly with minimal prep. Every activity should feel fresh and genuinely useful.

Required sections:
1. Activity Title (creative, specific, and inviting — describe what children will actually do, not just "Sensory Play" or "Art Project")
2. Age Group, Activity Type, and Estimated Time
3. Developmental Domains and Learning Goals (2-3 specific, named skills — not vague outcomes like "promotes learning")
4. Materials List (specific items, realistic for a home daycare or small center — use common, low-cost materials)
5. Setup Notes (how to prepare the space before children arrive)
6. Step-by-Step Instructions (clear, numbered steps — what the teacher does and says)
7. What to Watch For (1-2 specific developmental behaviors to observe during this activity)
8. Safety Notes (specific to this activity and age group — name actual hazards)
9. Extension Ideas (2-3 concrete ways to deepen, vary, or continue the activity on another day)

Rules:
- Make the title descriptive and engaging — it should make a provider want to try it.
- Vary activity types: art, STEM, sensory, dramatic play, literacy, math, gross motor, fine motor, cooking, outdoor, music — never suggest the same type each time.
- Follow Little Learner Hub Curriculum Standards for the stated age group (focus areas, appropriate activities, avoid lists, and activity length).
- Infant 0–6 Months: 1–5 minutes; bonding, tummy time, tracking, soft sensory, songs; never worksheets, crafts, scissors, glue, small parts, or independent sitting.
- Infant 6–12 Months: 3–8 minutes; crawling, fill/dump, stacking cups, large blocks, safe sensory; never worksheets, complex crafts, or choking hazards.
- Toddlers (1–2 years): 5–15 minutes; include movement, sensory, fine motor, and social interaction; no worksheets or tiny pieces.
- Preschool (3–5 years): 10–25 minutes; support literacy, math, STEM/science, fine/gross motor, and social-emotional learning; worksheets must not be the primary activity.
- Every activity must include: title, category, objective, description, materials, setup, 3–5 numbered directions, teacher role, learning goals, observation opportunities, adaptations, and safety notes. No blank fields or placeholders.
- School Age: projects, writing, STEM challenges, leadership-based, 20-30+ minutes.
- Never suggest the same activity type, materials, or format back-to-back.`,

    menu: base + `

YOU ARE CREATING A CHILDCARE MEAL PLAN.
Write a clear, organized, CACFP-friendly menu that is practical and age-appropriate.

Rules:
- Organize clearly by meal type (Breakfast, Lunch, AM Snack, PM Snack, or as the provider requested).
- Keep textures and portions appropriate for the stated age group.
- For infants: responsive feeding only — do not list specific table foods without family or provider guidance.
- Include allergy or restriction notes when the provider provided them.
- Suggest simple, budget-friendly, whole food options with some variety.
- If creating a weekly menu, vary the meals across days so nothing repeats.`,

    form: base + `

YOU ARE BUILDING A CHILDCARE FORM DRAFT.
Create a clean, professional form the provider can print or customize immediately.

Rules:
- Use the program name when provided.
- Include clearly labeled sections, blank lines or fields for required information, and signature areas when appropriate.
- Keep the form factual, practical, and complete.
- Do not add sections the provider did not request — focus on what was asked.
- Remind providers to review for state licensing requirements before use.`,

    assessment: base + `

YOU ARE WRITING A DEVELOPMENTAL ASSESSMENT DRAFT FOR A CHILDCARE PROVIDER.
This document will be shared with families and kept in the child's file — it must be specific, evidence-based, and professional.

Required sections:
- Child's Name, Age Group, and Assessment Period
- Strengths Observed: 3-5 specific, observable skills and behaviors demonstrated during the period — each with a brief concrete example. Never use generic phrases like "doing great" or "making good progress."
- Skills Emerging or In Progress: 2-3 skills the child is actively developing, described with observable evidence. Frame as growth, not deficits.
- Developmental Next Goals: 2-3 realistic, age-appropriate targets for the next period — specific enough to observe and document.
- Recommended Experiences or Activities: 1-2 practical activity ideas aligned with the next goals.
- Note for Families: A warm, forward-looking paragraph written in plain language for the family.

Rules:
- Ground every strength and goal in the developmental domains listed.
- Vary the language and structure each time — no two assessments should read identically.
- Use factual, supportive language grounded in observed evidence or provider notes.
- Do not diagnose, compare to other children, or overstate concerns.
- All expectations must match the stated age group precisely.`,

    progress: base + `

YOU ARE WRITING A CHILD PROGRESS REPORT FOR A CHILDCARE PROVIDER.
Create a parent-friendly report that clearly highlights growth, strengths, and next steps — a document families will read, value, and keep.

Required sections:
- Child's Name, Age Group, and Report Period
- How This Child Shines: 3-4 specific strengths observed during this period — each described with a brief concrete example. Use the child's name naturally.
- Growth Since the Last Period: What changed or developed? Be specific about what looks different now compared to before. If this is an initial report, describe current skills against expected developmental benchmarks.
- Goals for the Next Period: 2-3 realistic, age-appropriate targets. Write them as positive goals, not deficiencies.
- Learning Experiences That Will Help: 1-2 activity types or classroom strategies that will support the goals.
- A Note for Families: A warm, genuine 2-3 sentence paragraph that celebrates this child and looks ahead. Invite connection and home support.

Rules:
- Use the child's name throughout — this should never read as a generic report.
- Sound warm and professional — parents read these carefully.
- Be specific at every point. Never use "doing well overall," "making progress," or "continues to develop."
- Keep all content, expectations, and comparisons appropriate for the stated age group.
- Vary sentence structure and vocabulary each time — no two reports should use the same phrasing.`,

    portfolio: base + `

YOU ARE WRITING A CHILD PORTFOLIO ENTRY FOR A CHILDCARE PROVIDER.
Capture a meaningful learning moment in a format families will treasure — specific, warm, and developmental.

Required sections:
- Entry Title: Specific and evocative — describe the moment, not just the domain (e.g., "Building a Bridge: Emilio Explores Engineering" not just "Block Play")
- Child's Name, Age, and Date
- The Moment (2-3 sentences): A narrative snapshot of what happened — what the child did, said, created, or figured out. Write it so the family can picture the moment.
- Skills at Work: Name 2-3 specific developmental skills visible in this moment, with a brief explanation of why each matters.
- Provider's Reflection: In 2-3 sentences, explain what this moment reveals about this child's learning, curiosity, or growth trajectory. Be genuine and specific.
- What's Next: One concrete next step — an activity, experience, or challenge to build on what was seen.
- Optional: One simple way families can extend or celebrate this learning at home.

Rules:
- Ground every sentence in the specific observation, photo note, or activity provided.
- Sound warm and celebratory — families treasure portfolio entries and return to them.
- Write in a narrative, story-like tone — not a clinical list.
- Make the title unique and memorable every time.
- Keep all interpretations and next steps matched to the child's developmental stage.`,

    curriculum: base + `

YOU ARE CREATING A THEMED CURRICULUM UNIT FOR A CHILDCARE PROVIDER.
Build a cohesive, creative unit that feels like it was designed by an experienced curriculum coordinator — not a template.

Required sections:
- Unit Title and Theme (make the title engaging and specific)
- Age Group and Unit Length
- Overarching Learning Goals: 3-4 goals tied to specific developmental domains — name the domains explicitly.
- Week-by-Week Focus: Each week has a distinct emphasis and includes genuinely different activity types. Include:
  • Week 1: Introduction — vocabulary, sensory exploration, books
  • Week 2: Hands-on — centers, props, dramatic play, art
  • Week 3: Deeper exploration — STEM, science, writing/literacy, music
  • Week 4: Culminating — review, documentation, family sharing
- Featured Activities: 2-3 per week — specific, practical, named activities with brief setup descriptions
- Book and Song Suggestions: 1-2 real book titles and 1-2 real songs per week that connect to the theme
- Vocabulary Words: 6-8 theme-connected words across the unit
- Materials List: common, low-cost, home-daycare-friendly items
- Family Connection Suggestions: 2-3 simple activities or conversation ideas families can try at home

Rules:
- Make activities build on each other — week 2 should deepen week 1, week 3 should extend week 2.
- If a curriculum framework is specified, align the structure and language to that framework.
- Infant and toddler units: play-based, sensory, and routine-friendly — no academic pressure.
- Preschool: early literacy, math, science, and social-emotional learning woven in throughout.
- School Age: projects, writing, STEM challenges, discussion, and leadership opportunities.
- Vary the activity types, art media, and science topics every time.`,

    learningStory: base + `

YOU ARE WRITING A LEARNING STORY FOR A CHILDCARE PROVIDER.
Transform an observation into a warm, engaging narrative that captures learning in action — the kind families save and teachers are proud to share.

Required sections:
1. Story Title: Engaging and specific to this particular moment — not "Learning Story" or generic developmental labels. Make it evocative and memorable.
2. The Story (3-4 sentences): A narrative account of what happened — what the child did, said, tried, created, or discovered. Write it so the reader can picture the scene. Use the child's name.
3. The Learning: Name 2-3 specific developmental skills, concepts, or dispositions visible in this moment. Briefly explain why each is significant.
4. The Provider's Voice (2-3 sentences): A genuine reflection — what this moment reveals about this child, why it was worth documenting, what it shows about who they are as a learner.
5. What's Next: One specific, creative next step — an experience, provocation, or challenge that would deepen or extend what was seen.
6. A Note for Families (optional but encouraged): A 1-2 sentence message families can read that celebrates the learning.

Rules:
- Write in a warm, narrative, story-like tone — not a clinical observation form.
- Ground every detail in the specific observation or note provided.
- Vary the story structure and sentence rhythm each time — no two learning stories should read alike.
- Do not exaggerate or add details not supported by the observation.
- Keep all interpretations developmentally appropriate for the child's stated age.`,

    schedule: base + `

YOU ARE CREATING A DAILY CHILDCARE SCHEDULE.
Build a realistic, balanced routine that fits the ages served and the program's hours.

Rules:
- Label each time block clearly (time, activity name, brief notes).
- Infant schedules: allow for individualized feeding, sleep, diapering, and responsive care — no rigid timetable. Note flexibility.
- Toddler and Preschool: balance routines with free play, outdoor time, meals, group time, rest, and learning moments.
- School Age: include structured and choice-based time, outdoor time, homework support when relevant, and age-appropriate independence.
- Keep timing realistic for a home daycare — transitions take time, especially with mixed ages.`,

    classroomSetup: base + `

YOU ARE CREATING CLASSROOM SETUP RECOMMENDATIONS FOR A HOME DAYCARE PROVIDER.
Suggest practical, specific layout ideas and safety considerations tailored to the ages served and the space described.

Required sections:
- Overall Space Organization (flow, sightlines, calm vs. active zones)
- Recommended Learning Centers (specific to what the provider requested)
- Safety Considerations (specific to the ages served and the space)
- Furniture and Storage Suggestions (practical, home-daycare-friendly)
- Low-Cost Enhancement Ideas (simple additions that support learning)

Rules:
- Prioritize supervision sightlines, clear pathways, and age-specific safety.
- Infant spaces: eliminate all choking hazards, prioritize floor play and safe sleep area.
- Toddler spaces: open movement area, safe sensory corner, simple dramatic play.
- Preschool: small-group work area, book corner, art and science centers.
- Be practical — suggestions must work in a real home, not a commercial school.`,

    emergency: base + `

YOU ARE WRITING AN EMERGENCY PLAN DRAFT FOR A CHILDCARE PROGRAM.

For each emergency type the provider listed, include:
- Immediate Response Steps (numbered, clear, calm)
- Evacuation or Shelter-in-Place Procedure
- Child Attendance and Accountability Method
- Parent Notification Procedure
- Documentation Steps After the Event

Rules:
- Keep language calm, organized, and licensing-aware throughout.
- Prioritize child safety, supervision ratios, and clear communication at every step.
- Remind providers to post emergency procedures, practice drills, and keep the plan updated with licensing.`,

    substitute: base + `

YOU ARE WRITING A SUBSTITUTE PROVIDER PLAN FOR A CHILDCARE PROGRAM.
Create a clear, scannable summary a substitute can follow immediately.

Required sections:
- Date and Program Details
- Children Present (names, ages, allergies, comfort items, authorized pickups)
- Daily Routine Overview (with time blocks)
- Meals and Snack Notes (what to serve and how)
- Rest or Nap Procedure
- Behavior or Support Notes (any children who need extra support)
- Emergency Contacts and Procedure Location
- 2-3 Ready Activity Ideas (low-prep, appropriate for the ages)
- Provider Contact Information

Rules:
- Put safety-critical information at the top.
- Keep it clear and scannable — the substitute may read this under pressure.
- Keep activity ideas simple, low-prep, and appropriate for the ages served.`,

    grant: base + `

YOU ARE WRITING A CHILDCARE GRANT OR FUNDING LETTER FOR A HOME DAYCARE PROVIDER.
Create a professional, persuasive letter that makes a strong, credible case for the funding requested.

Required sections:
- Program Introduction and Mission (specific, not generic)
- Statement of Need (factual, compelling, tied to the specific funding request)
- Proposed Use of Funds (clear, itemized if helpful)
- Expected Child and Community Impact (grounded in developmental benefits for the ages served)
- Provider Qualifications or Program History (if the provider shared any)
- Professional Closing with contact information

Rules:
- Use the program name prominently.
- Keep the tone credible, specific, and warm — not vague or over-promising.
- Describe benefits in terms of child development and family outcomes, not just equipment or items.
- Avoid generic mission filler that could apply to any program.`,
  };

  return toolPrompts[tool] || (base + "\n\nCreate practical, daycare-focused, age-appropriate childcare content. Keep wording professional, warm, and ready to use. Remind providers to review for licensing and state requirements when relevant.");
}

// Returns the system prompt for a tool, using store-saved prompt layers if present, or falling back to the hardcoded default.
function getToolSystemPromptResolved(tool) {
  const store = readStore();
  const entry = store.aiPrompts?.[tool];
  if (entry) {
    const combined = AI_PROMPT_LAYERS
      .map((layer) => String(entry[layer] || "").trim())
      .filter(Boolean)
      .join("\n\n---\n\n");
    if (combined) return combined;
  }
  return getToolSystemPrompt(tool);
}

// Prompts shorter than this character count receive an extra context hint
const AI_SHORT_NOTE_THRESHOLD = 25;
// Timeout in ms for OpenAI API requests — 90s allows gpt-4o time for detailed lesson plans
const AI_REQUEST_TIMEOUT_MS = 90000;
// Max retry attempts for transient failures (network errors, timeouts, rate limits)
const AI_MAX_RETRIES = 2;
// Base delay in ms between retry attempts (multiplied by attempt number)
const AI_RETRY_BASE_DELAY_MS = 3000;
// Temperature for generation: high enough for variety, conservative enough for consistency
const AI_TEMPERATURE = 0.9;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAiOnce(systemPrompt, userContent, email, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: AI_TEMPERATURE,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();
    if (!response.ok) {
      const errType = String(data?.error?.type || "unknown");
      const errMsg = String(data?.error?.message || "");
      const errCode = String(data?.error?.code || "");
      console.error(`[openai-error] ${label} status=${response.status} type=${errType} code=${errCode} model=${OPENAI_MODEL} email=${email} message=${errMsg}`);
      if (errCode === "insufficient_quota" || errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("billing")) {
        const err = new Error("Document creation quota has been reached. Please contact support or try again later.");
        err.noRetry = true;
        throw err;
      }
      if (response.status === 429 || errMsg.toLowerCase().includes("rate")) {
        throw new Error("The system is busy right now. Please wait a moment and try again.");
      }
      if (response.status === 401) {
        const err = new Error("Document creation service is temporarily unavailable. Please contact support.");
        err.noRetry = true;
        throw err;
      }
      throw new Error("Document creation could not be completed. Please try again.");
    }
    const output = data.output_text
      || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n").trim()
      || "";
    if (!output) throw new Error("No content was returned. Please try again.");
    return { output, rawResponse: data };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      throw new Error("Document creation took too long. Please try again — your usage was not charged.");
    }
    throw error;
  }
}

async function generateOpenAiContent({ tool, prompt, age, plan, email, debug }) {
  if (!OPENAI_API_KEY) {
    throw new Error("Document creation is not available right now. Please contact support or try again later.");
  }

  // Check per-tool enabled flag and global master switch
  const store = readStore();
  const aiSettings = normalizedAiSettings(store.aiSettings || defaultAiSettings());
  if (!aiSettings.masterEnabled) {
    const err = new Error("AI document creation is currently unavailable. Please try again later.");
    err.toolDisabled = true;
    throw err;
  }
  const toolConfig = aiSettings.tools[tool];
  if (toolConfig && !toolConfig.enabled) {
    const msg = toolConfig.fallbackMessage?.trim() || "This AI tool is currently unavailable. Please try again later.";
    const err = new Error(msg);
    err.toolDisabled = true;
    throw err;
  }

  const systemPrompt = getToolSystemPromptResolved(tool);
  const userContent = buildOpenAiUserPrompt(prompt, age);

  let lastError;
  for (let attempt = 1; attempt <= AI_MAX_RETRIES + 1; attempt++) {
    try {
      const label = `tool=${tool} attempt=${attempt}`;
      const { output, rawResponse } = await callOpenAiOnce(systemPrompt, userContent, email, label);
      if (attempt > 1) {
        console.log(`[helper-retry-success] tool=${tool} email=${email} attempt=${attempt}`);
      }
      return {
        output,
        model: OPENAI_MODEL,
        // Always capture token usage for monitoring; rawResponse.usage is available in both /v1/responses and /v1/chat/completions
        inputTokens: rawResponse?.usage?.input_tokens ?? rawResponse?.usage?.prompt_tokens ?? null,
        outputTokens: rawResponse?.usage?.output_tokens ?? rawResponse?.usage?.completion_tokens ?? null,
        debug: debug ? {
          tool,
          model: OPENAI_MODEL,
          systemPrompt,
          userPrompt: userContent,
          finalPrompt: buildDebugPromptSnapshot(systemPrompt, userContent),
          rawResponse,
          finalResponse: output,
          attempts: attempt,
        } : null,
      };
    } catch (error) {
      lastError = error;
      const isRetryable = !error.noRetry && attempt <= AI_MAX_RETRIES;
      console.error(`[helper-generate-error] tool=${tool} email=${email} attempt=${attempt}/${AI_MAX_RETRIES + 1} retryable=${isRetryable} error=${error.message}`);
      if (!isRetryable) break;
      const delay = AI_RETRY_BASE_DELAY_MS * attempt;
      console.log(`[helper-retry] tool=${tool} email=${email} waiting ${delay}ms before attempt ${attempt + 1}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function callOpenAiRaw(systemPrompt, userPrompt) {
  if (!OPENAI_API_KEY) {
    throw new Error("Document creation is not available. OPENAI_API_KEY is not configured.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: AI_TEMPERATURE,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) {
      const errType = String(data?.error?.type || "unknown");
      const errMsg = String(data?.error?.message || "");
      const errCode = String(data?.error?.code || "");
      console.error(`[openai-error] status=${res.status} type=${errType} code=${errCode} model=${OPENAI_MODEL} message=${errMsg}`);
      throw new Error("Document creation could not be completed. Please try again.");
    }
    const output = data.output_text
      || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n").trim()
      || "";
    if (!output) throw new Error("No content was returned.");
    return output;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") throw new Error("Document creation took too long. Please try again.");
    throw error;
  }
}

async function scoreAiOutput(text) {
  const scoringSystem = "You are a quality reviewer for early childhood education documentation. Respond ONLY with a valid JSON object. No markdown, no explanation, no code fences.";
  const scoringUser = `Score this observation from 1–10 in each area (10 = excellent). Return exactly this JSON shape and nothing else:\n{"professionalWriting":0,"grammar":0,"developmentalAccuracy":0,"ageAppropriateness":0,"licensingReadiness":0,"familyFriendliness":0,"completeness":0,"naturalTone":0,"overallQuality":0}\n\nDocument:\n${text.slice(0, 2000)}`;
  try {
    const raw = await callOpenAiRaw(scoringSystem, scoringUser);
    const clean = raw.replace(/```[a-z]*\n?|\n?```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function buildAdminLessonGeneratorPrompt(age, theme, lessonNumber) {
  const standardsBlock = curriculumStandards.buildFullCurriculumStandardsPrompt(age);
  const elgAgeLabel = /infant/i.test(age)
    ? (/0\s*[–-]\s*6/i.test(age) ? "Infant (0–6 months)" : /6\s*[–-]\s*12/i.test(age) ? "Infant (6–12 months)" : "Infant (0–12 months)")
    : /toddler/i.test(age)
      ? "Toddler (1–2 years)"
      : "Preschool (3–5 years)";
  const themeUpper = theme.toUpperCase();

  return `Create a complete, professional weekly lesson plan for ${age}.

${standardsBlock}

Theme: ${theme}
${lessonNumber ? `Lesson Plan Number: ${lessonNumber}` : ""}

Return ONLY a valid JSON object — no markdown, no code fences, no text before or after the JSON.

Required JSON keys and content:

{
  "title": "Descriptive lesson plan title including the theme and age group",
  "weeklyOverview": "3–4 sentence paragraph introducing the weekly theme, what children will explore, and the developmental focus. Written in warm, provider-friendly language.",
  "materials": "Complete list of ALL materials needed for the entire week. One item per line starting with a dash. Be specific — write exact items and quantities. Example:\\n- Plastic bug figures (ants, butterflies, bees) x 12\\n- Blue and yellow washable tempera paint\\n- 12x18 white construction paper (5 sheets per child)",
  "objectives": "3–5 developmental objectives written in provider-friendly language. One per line. Each names a specific developmental domain (Language, Cognitive, Fine Motor, Gross Motor, Social-Emotional, Literacy, Math, Science, or Creative Arts). Example:\\n- Language: Children will use 5 new theme-related vocabulary words during activities and conversations.\\n- Fine Motor: Children will strengthen hand control through art and sensory exploration.",
  "teacherLanguage": "6–8 helpful phrases teachers can naturally say throughout the week. One phrase per line starting with a dash. These should NOT appear inside the daily plans. Example:\\n- \\"What do you notice about this? Tell me more!\\"\\n- \\"Let's try that together — you go first.\\"",
  "monday": "Circle Time:\\n[2–3 sentence description of Monday's circle time activity]\\n\\nMain Activity:\\n[Activity title]\\n[Step-by-step numbered instructions the provider follows]\\n\\nBook Recommendation:\\n[Title by Author] — [1 sentence why this fits the theme and one discussion question]\\n\\nMusic & Movement:\\n[Song or fingerplay title] — [description of movements and what children do]\\n\\nDiscussion Ideas:\\n[2–3 open-ended questions or conversation starters tied to Monday's theme focus and age group]\\n\\nLearning Focus:\\n[1–2 sentences naming the developmental domain(s) and specific skill emphasized on Monday]",
  "tuesday": "[Same six-section format as monday — Circle Time, Main Activity, Book Recommendation, Music & Movement, Discussion Ideas, Learning Focus — with completely different content]",
  "wednesday": "[Same six-section format as monday — Circle Time, Main Activity, Book Recommendation, Music & Movement, Discussion Ideas, Learning Focus — with completely different content]",
  "thursday": "[Same six-section format as monday — Circle Time, Main Activity, Book Recommendation, Music & Movement, Discussion Ideas, Learning Focus — with completely different content]",
  "friday": "[Same six-section format as monday — Circle Time, Main Activity, Book Recommendation, Music & Movement, Discussion Ideas, Learning Focus — with completely different content]",
  "elgConnections": "3–4 specific Oklahoma Early Learning Guideline connections for ${elgAgeLabel}. Format: [Domain]: [Indicator description] — [brief explanation of how this lesson connects]",
  "familyConnection": "2–3 sentence summary families can read about the week's theme. Then: Home Activity: [title and 2–3 step description families can do at home using common household items]",
  "reflectionNotes": "4–5 thoughtful reflection questions for providers, one per line starting with a dash. Examples:\\n- Which activities were most engaging for your group?\\n- Which children showed the most interest or made unexpected connections?\\n- What vocabulary or skills were observed during activities?\\n- What would you extend or repeat next week?\\n- What family shares or home connections did you notice?",
  "thumbnailPrompt": "Clean Canva-style lesson plan cover: white background, soft pastel accent colors, large bold title '${themeUpper}', subtitle '${age} Weekly Lesson Plan', small theme-related illustrations for ${theme}, modern clean layout, professional appearance"
}

Critical rules:
- Every daily plan (Monday–Friday) MUST include all six sections: Circle Time, Main Activity, Book Recommendation, Music & Movement, Discussion Ideas, and Learning Focus
- Do NOT include materials lists or teacher language phrases inside the daily plans — they belong in their own top-level sections
- All books must be real, published children's books matched to the theme — never invent fake book titles or fake authors
- All songs must be real, well-known children's songs or fingerplays — never invent fake song titles
- Each day must have a completely different circle time, activity, book, and song
- Every activity must follow Little Learner Hub Curriculum Standards for ${age} (developmental focus, avoid list, activity length, and required components)
- Every activity must include name, category, objective, description, materials, setup, 3–5 numbered directions, teacher role, learning goals, observation opportunities, adaptations, and safety notes with no blank fields
- This lesson plan must be specific and professional — use specific book titles, specific song names, and detailed step-by-step instructions
- Every section (weeklyOverview, materials, objectives, teacherLanguage, monday–friday, elgConnections, familyConnection, reflectionNotes, thumbnailPrompt) must be fully written with no placeholder text, no empty values, and no duplicate paragraphs
- The theme "${theme}" must be consistent across every section: overview, materials, objectives, daily activities, books, songs, discussion ideas, family connection, and reflection notes
- Do not mix unrelated themes

FINAL AI VALIDATION — complete before returning the JSON:
- Confirm every required JSON key is present and fully written (no empty strings, no placeholder text)
- Confirm each of Monday–Friday includes all six sections: Circle Time, Main Activity, Book Recommendation, Music & Movement, Discussion Ideas, and Learning Focus
- Confirm all books are real published titles with real authors matched to the theme
- Confirm all songs are real or well-known children's songs or fingerplays
- Confirm all activities are appropriate for ${age}
- Confirm the theme is consistent throughout the entire plan
- If any section is incomplete or missing, regenerate only that section before returning
- Output ONLY the JSON object with no surrounding text`;
}

async function handleAdminGenerateLessonPlan(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const age = String(body.age || "Preschool").trim();
  const theme = String(body.theme || "").trim();
  const lessonNumber = String(body.lessonNumber || "").trim();
  if (!theme) {
    jsonResponse(response, 400, { error: "Theme is required to generate a lesson plan." });
    return;
  }
  const systemPrompt = "You are an expert early childhood educator and curriculum specialist creating complete, classroom-ready weekly lesson plans for real childcare providers. Your lesson plans are detailed, age-appropriate, provider-ready, and genuinely specific — never generic or template-like. Books must be real published titles with real authors. Songs must be real or well-known children's songs or fingerplays. Never invent fake book titles, fake authors, or fake song titles. Every section must be fully written with no placeholder text and no empty values. Before returning, verify every required field is complete, every daily plan includes all six required sections (Circle Time, Main Activity, Book Recommendation, Music & Movement, Discussion Ideas, Learning Focus), all books and songs are real, all activities match the age group, and the theme is consistent throughout. Regenerate any incomplete section before returning. Return ONLY a valid JSON object. No markdown, no code fences, no text before or after the JSON.";
  const userPrompt = buildAdminLessonGeneratorPrompt(age, theme, lessonNumber);
  try {
    const rawOutput = await callOpenAiRaw(systemPrompt, userPrompt);
    const clean = rawOutput.replace(/```[a-z]*\n?|\n?```/g, "").trim();
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("The AI did not return structured lesson plan data. Please try again.");
    }
    // Replace unescaped literal newlines inside JSON string values with \n so JSON.parse succeeds
    // even when the AI emits actual newlines instead of escape sequences inside strings.
    const jsonSlice = clean.slice(jsonStart, jsonEnd + 1);
    const sanitized = jsonSlice.replace(/"((?:[^"\\]|\\.)*)"/g, (match) =>
      match.replace(/\n/g, "\\n").replace(/\r/g, "\\r")
    );
    const fields = JSON.parse(sanitized);
    jsonResponse(response, 200, { fields });
  } catch (error) {
    if (error instanceof SyntaxError) {
      jsonResponse(response, 503, { error: "Lesson plan could not be generated. Please try again." });
      return;
    }
    jsonResponse(response, 503, { error: error.message || "Lesson plan could not be generated. Please try again." });
  }
}

async function handleAdminAiTest(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const systemPrompt = String(body.systemPrompt || "").trim();
  const userPrompt = String(body.userPrompt || "").trim();
  const wantScore = Boolean(body.score);
  if (!systemPrompt || !userPrompt) {
    jsonResponse(response, 400, { error: "Both systemPrompt and userPrompt are required." });
    return;
  }
  try {
    const output = await callOpenAiRaw(systemPrompt, userPrompt);
    const scores = wantScore ? await scoreAiOutput(output) : null;
    jsonResponse(response, 200, { output, scores, model: OPENAI_MODEL });
  } catch (error) {
    jsonResponse(response, 503, { error: error.message || "AI generation failed." });
  }
}

const ADMIN_AI_CONTENT_TYPES = new Set(["lesson", "activity", "printable", "email", "social", "theme"]);

function adminAiContentSystemPrompt(contentType) {
  const shared = [
    "You are an early childhood curriculum and marketing assistant for Little Learner Hub.",
    "Write warm, practical, play-based content for home daycares and childcare centers.",
    "Never invent private child data. Keep language teacher-friendly and developmentally appropriate.",
    "Return useful plain text that an owner can copy into Admin and edit before publishing.",
  ].join(" ");
  const byType = {
    lesson: `${shared} Produce a weekly preschool/toddler lesson plan draft with: Title, Theme, Age, Weekly Overview, Objectives, Materials, Vocabulary, Family Connection, then Monday–Friday with a daily theme and 3–4 named activities (category + short directions).`,
    activity: `${shared} Produce one standalone classroom activity with: Activity Name, Category, Age, Objective, Materials, Setup, Directions, Teacher Language, Observation Opportunities, Adaptations.`,
    printable: `${shared} Produce a printable worksheet/take-home idea with: Title, Type, Age, Purpose, Materials, Instructions for teachers, Optional parent note, and a short description suitable for a library card.`,
    email: `${shared} Produce an email campaign draft with: Subject, Preview Text, Body (short paragraphs), CTA, and a plain-text PS. Tone: helpful owner-to-provider, not salesy spam.`,
    social: `${shared} Produce 3 social post options for Facebook/Instagram. For each: Hook, Caption (under 120 words), Hashtags (5–8), and Suggested image idea. Keep it childcare-authentic.`,
    theme: `${shared} Suggest 8 trending or seasonal early-childhood themes. For each: Theme name, Best ages, Why it works now, 3 activity seeds, and 1 printable idea.`,
  };
  return byType[contentType] || shared;
}

function buildAdminAiContentUserPrompt(body = {}) {
  const contentType = String(body.contentType || "lesson").trim();
  const age = normalizedShortText(body.age, 80) || "Preschool";
  const theme = normalizedShortText(body.theme, 160);
  const tone = normalizedShortText(body.tone, 80) || "warm and practical";
  const notes = normalizedMultilineText(body.notes, 4000);
  const audience = normalizedShortText(body.audience, 120) || "childcare providers";
  return [
    `Content type: ${contentType}`,
    `Age group: ${age}`,
    theme ? `Theme / topic: ${theme}` : "",
    `Tone: ${tone}`,
    `Audience: ${audience}`,
    notes ? `Extra notes from owner:\n${notes}` : "",
    "Write the full draft now.",
  ].filter(Boolean).join("\n");
}

async function handleAdminAiGenerateContent(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const contentType = String(body.contentType || "lesson").trim().toLowerCase();
  if (!ADMIN_AI_CONTENT_TYPES.has(contentType)) {
    jsonResponse(response, 400, { error: "Invalid contentType. Use lesson, activity, printable, email, social, or theme." });
    return;
  }
  if (!OPENAI_API_KEY) {
    jsonResponse(response, 503, { error: "AI generation is unavailable. OPENAI_API_KEY is not configured." });
    return;
  }
  const systemPrompt = adminAiContentSystemPrompt(contentType);
  const userPrompt = buildAdminAiContentUserPrompt({ ...body, contentType });
  try {
    const output = await callOpenAiRaw(systemPrompt, userPrompt);
    jsonResponse(response, 200, {
      ok: true,
      contentType,
      output,
      model: OPENAI_MODEL,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    jsonResponse(response, 503, { error: error.message || "AI content generation failed." });
  }
}

async function handleAdminGenerateLessonPlan(request, response) {
  // Compatibility wrapper for the retired dedicated endpoint — uses the content generator.
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (!OPENAI_API_KEY) {
    jsonResponse(response, 503, { error: "AI generation is unavailable. OPENAI_API_KEY is not configured." });
    return;
  }
  const age = normalizedShortText(body.age, 80) || "Preschool";
  const theme = normalizedShortText(body.theme, 160) || "All About Me";
  const lessonNumber = normalizedShortText(body.lessonNumber, 40);
  const systemPrompt = [
    adminAiContentSystemPrompt("lesson"),
    "Also return a compact JSON object AFTER the prose draft, fenced as ```json ... ``` with keys:",
    "title, theme, age, weeklyOverview, objectives, weeklyMaterials, vocabularyWords, familyConnection, thumbnailPrompt.",
  ].join(" ");
  const userPrompt = buildAdminAiContentUserPrompt({
    contentType: "lesson",
    age,
    theme,
    notes: lessonNumber ? `Lesson number focus: ${lessonNumber}` : "",
  });
  try {
    const output = await callOpenAiRaw(systemPrompt, userPrompt);
    const jsonMatch = String(output || "").match(/```json\s*([\s\S]*?)```/i);
    let fields = { title: `${theme} Weekly Plan`, theme, age, weeklyOverview: output };
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed && typeof parsed === "object") fields = { ...fields, ...parsed, theme: parsed.theme || theme, age: parsed.age || age };
      } catch {
        /* keep prose fallback */
      }
    }
    jsonResponse(response, 200, { fields, output, model: OPENAI_MODEL });
  } catch (error) {
    jsonResponse(response, 503, { error: error.message || "Lesson plan could not be generated. Please try again." });
  }
}

function handleAdminAiPrompts(request, response, url) {
  const token = url.searchParams.get("adminToken");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = readStore();
  const aiPrompts = normalizedAiPrompts(store.aiPrompts || {});
  const aiPromptVersions = (store.aiPromptVersions || []).slice(0, 200);
  // Expose the current resolved prompt (store or hardcoded) for each tool as defaults
  const hardcodedDefaults = {};
  for (const toolId of AI_VALID_TOOLS) {
    hardcodedDefaults[toolId] = getToolSystemPrompt(toolId);
  }
  jsonResponse(response, 200, { aiPrompts, aiPromptVersions, hardcodedDefaults });
}

async function handleAdminAiPromptsSave(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const toolId = String(body.tool || "").trim();
  if (!AI_VALID_TOOLS.has(toolId)) {
    jsonResponse(response, 400, { error: "Invalid tool identifier." });
    return;
  }
  const now = new Date().toISOString();
  const savedBy = (body.adminEmail ? String(body.adminEmail) : ADMIN_EMAIL) || "admin";
  const newEntry = normalizedAiPromptEntry({
    masterPrompt: body.masterPrompt,
    toolSpecificPrompt: body.toolSpecificPrompt,
    writingIntelligence: body.writingIntelligence,
    outputFormatting: body.outputFormatting,
    updatedAt: now,
    updatedBy: savedBy,
  }, savedBy);
  const store = readStore();
  store.aiPrompts = store.aiPrompts || {};
  const previous = store.aiPrompts[toolId];
  store.aiPrompts[toolId] = newEntry;
  // Save version history for each changed layer
  store.aiPromptVersions = store.aiPromptVersions || [];
  for (const layer of AI_PROMPT_LAYERS) {
    const prev = String((previous || {})[layer] || "");
    const next = String(newEntry[layer] || "");
    if (prev !== next) {
      store.aiPromptVersions.unshift({
        id: `pv_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
        tool: toolId,
        layer,
        previousValue: prev,
        newValue: next,
        savedAt: now,
        savedBy,
      });
    }
  }
  store.aiPromptVersions = store.aiPromptVersions.slice(0, 200);
  await writeStoreAsync(store);
  jsonResponse(response, 200, { ok: true, aiPrompts: normalizedAiPrompts(store.aiPrompts), aiPromptVersions: store.aiPromptVersions.slice(0, 200) });
}

async function handleAdminAiPromptsRestore(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const versionId = String(body.versionId || "").trim();
  const store = readStore();
  const version = (store.aiPromptVersions || []).find((v) => v.id === versionId);
  if (!version) {
    jsonResponse(response, 404, { error: "Version not found." });
    return;
  }
  const { tool, layer, previousValue } = version;
  if (!AI_VALID_TOOLS.has(tool) || !AI_PROMPT_LAYERS.includes(layer)) {
    jsonResponse(response, 400, { error: "Invalid version data." });
    return;
  }
  const now = new Date().toISOString();
  const restoredBy = (body.adminEmail ? String(body.adminEmail) : ADMIN_EMAIL) || "admin";
  store.aiPrompts = store.aiPrompts || {};
  store.aiPrompts[tool] = store.aiPrompts[tool] || {};
  const before = String(store.aiPrompts[tool][layer] || "");
  store.aiPrompts[tool][layer] = String(previousValue || "");
  store.aiPrompts[tool].updatedAt = now;
  store.aiPrompts[tool].updatedBy = restoredBy;
  // Record the restore as a new version entry
  store.aiPromptVersions.unshift({
    id: `pv_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    tool,
    layer,
    previousValue: before,
    newValue: String(previousValue || ""),
    savedAt: now,
    savedBy: restoredBy,
    restoredFrom: versionId,
  });
  store.aiPromptVersions = store.aiPromptVersions.slice(0, 200);
  await writeStoreAsync(store);
  jsonResponse(response, 200, { ok: true, aiPrompts: normalizedAiPrompts(store.aiPrompts), aiPromptVersions: store.aiPromptVersions.slice(0, 200) });
}

function handleAdminAiSettings(request, response, url) {
  const token = url.searchParams.get("adminToken");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = readStore();
  const aiSettings = normalizedAiSettings(store.aiSettings || defaultAiSettings());
  jsonResponse(response, 200, { aiSettings });
}

async function handleAdminAiSettingsSave(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const nextSettings = normalizedAiSettings(body.aiSettings || {});
  const store = readStore();
  store.aiSettings = nextSettings;
  await writeStoreAsync(store);
  jsonResponse(response, 200, { ok: true, aiSettings: nextSettings });
}

function handleAdminAiUsage(request, response, url) {
  const token = url.searchParams.get("adminToken");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = readStore();
  const logs = (store.aiUsageLogs || []).slice(0, 5000);
  // Aggregate stats
  const total = logs.length;
  const successful = logs.filter((l) => l.success).length;
  const failed = logs.filter((l) => !l.success).length;
  const byTool = {};
  const successTimings = logs.filter((l) => l.success && Number.isFinite(l.responseTimeMs)).map((l) => l.responseTimeMs);
  const avgResponseMs = successTimings.length ? Math.round(successTimings.reduce((a, b) => a + b, 0) / successTimings.length) : null;
  const totalInputTokens = logs.reduce((sum, l) => sum + (Number.isFinite(l.inputTokens) ? l.inputTokens : 0), 0);
  const totalOutputTokens = logs.reduce((sum, l) => sum + (Number.isFinite(l.outputTokens) ? l.outputTokens : 0), 0);
  // Cost estimate uses approximate gpt-4o pricing ($0.0025/1K input + $0.01/1K output).
  // This is an approximation only — actual costs depend on the configured model and OpenAI's current rates.
  const estimatedCostUsd = Number(((totalInputTokens / 1000) * 0.0025 + (totalOutputTokens / 1000) * 0.01).toFixed(4));
  for (const log of logs) {
    const t = log.tool || "unknown";
    if (!byTool[t]) byTool[t] = { total: 0, successful: 0, failed: 0 };
    byTool[t].total++;
    if (log.success) byTool[t].successful++;
    else byTool[t].failed++;
  }
  // Recent 100 log entries for the table
  const recentLogs = logs.slice(0, 100).map((l) => ({
    id: l.id,
    tool: l.tool,
    email: l.email,
    plan: l.plan,
    success: l.success,
    responseTimeMs: l.responseTimeMs,
    errorMessage: l.errorMessage,
    inputTokens: l.inputTokens,
    outputTokens: l.outputTokens,
    createdAt: l.createdAt,
  }));
  jsonResponse(response, 200, {
    aiUsage: {
      total,
      successful,
      failed,
      byTool,
      avgResponseMs,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostUsd,
      recentLogs,
    },
  });
}

async function handleAccountProfileSync(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    jsonResponse(response, 400, { error: "Email is required." });
    return;
  }
  const firstName = normalizedShortText(body.firstName, 80);
  const lastName = normalizedShortText(body.lastName, 80);
  const businessName = normalizedShortText(body.businessName || body.daycareName || body.programName, 160);
  const accountType = body.accountType ? accountAccess.normalizeAccountType(body.accountType) : undefined;
  const role = body.role ? accountAccess.normalizeUserRole(body.role) : undefined;
  const phone = normalizedShortText(body.phone, 40);
  const existing = readStore().users?.[email] || {};
  const name = [firstName || existing.firstName, lastName || existing.lastName].filter(Boolean).join(" ")
    || existing.name
    || "";
  const updates = {
    firstName: firstName || existing.firstName || "",
    lastName: lastName || existing.lastName || "",
    name: name || undefined,
    displayName: name || existing.displayName || "",
    phone: phone || existing.phone || "",
    accountStatus: existing.accountStatus || "Active",
  };
  if (businessName) {
    updates.businessName = businessName;
    updates.daycareName = businessName;
    updates.programName = businessName;
  }
  if (accountType) updates.accountType = accountType;
  if (role) updates.role = role;
  // Optional signup center pathway metadata (join/create/independent/skip).
  // Only set when provided — never clears existing associations on unrelated profile syncs.
  const centerAssociation = normalizedShortText(body.centerAssociation, 40);
  const centerInviteCode = normalizedShortText(body.centerInviteCode, 80);
  if (centerAssociation) updates.centerAssociation = centerAssociation;
  if (Object.prototype.hasOwnProperty.call(body, "centerInviteCode")) {
    updates.centerInviteCode = centerInviteCode || "";
  }
  if (body.signup === true && !existing.signupAt) {
    updates.signupAt = new Date().toISOString();
    updates.createdAt = existing.createdAt || updates.signupAt;
    updates.plan = existing.plan || "Free";
    updates.subscriptionStatus = existing.subscriptionStatus || "Free Plan";
    const modeFromBody = freePlanGrandfathering.normalizeAccessMode(body.freeLessonAccessMode);
    updates.freeLessonAccessMode = modeFromBody
      || freePlanGrandfathering.modeForNewSignup({
        siteContent: normalizedSiteContent(readStore().siteContent || defaultSiteContentStore()),
      });
  } else if (body.freeLessonAccessMode) {
    const modeFromBody = freePlanGrandfathering.normalizeAccessMode(body.freeLessonAccessMode);
    if (modeFromBody) updates.freeLessonAccessMode = modeFromBody;
  }
  if (body.lastLogin === true) {
    updates.lastLoginAt = new Date().toISOString();
    updates.lastSeenAt = updates.lastLoginAt;
  }
  const user = upsertUser(email, updates);
  // Once-only welcome email on first signup stamp (soft-fail if email unconfigured).
  // Hard-gated by EMAIL_AUTOMATIONS_ENABLED — no automatic welcome until approved.
  // Await before admin-alert fan-out so a stale store snapshot cannot wipe the stamp.
  if (body.signup === true && !existing.signupAt && emailAutomationsEnabled()) {
    try {
      await emailEngagement.maybeSendWelcomeOnSignup(email);
    } catch (err) {
      console.warn("[email-engagement] welcome email failed:", err.message);
    }
  }
  if (body.signup === true && !existing.signupAt) {
    const storeForAlert = readStore();
    emitAdminAlertSafe(storeForAlert, {
      category: "signup",
      type: "admin_new_signup",
      title: "New account created",
      preview: `${user.name || email} signed up (${user.accountType || "provider"} · ${user.plan || "Free"})`,
      email,
      name: user.name || "",
      refId: `signup:${email}`,
      sendEmail: true,
      emailKind: "Signup",
      emailFields: [
        ["Account type", user.accountType || ""],
        ["Role", user.role || ""],
        ["Plan", user.plan || "Free"],
      ],
    }).then(() => {
      try { writeStore(storeForAlert); } catch { /* ignore */ }
    }).catch(() => {});
  }
  jsonResponse(response, 200, {
    ok: true,
    user: {
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      name: user.name || "",
      businessName: user.businessName || "",
      accountType: user.accountType || "",
      role: user.role || "",
      centerAssociation: user.centerAssociation || "",
      centerInviteCode: user.centerInviteCode || "",
      plan: user.plan || "Free",
      accountStatus: user.accountStatus || "Active",
      ...tempPasswordAuth.publicAuthFlags(user),
    },
  });
}

async function handleAdminIssueTempPassword(request, response) {
  const body = await readJson(request);
  const adminToken = String(body.adminToken || "").trim();
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, adminAuthFailurePayload());
    return;
  }
  const email = tempPasswordAuth.normalizeEmail(body.email);
  if (!email) {
    jsonResponse(response, 400, { error: "User email is required." });
    return;
  }
  const store = readStore();
  store.users = store.users || {};
  const existing = store.users[email];
  if (!existing) {
    jsonResponse(response, 404, { error: "No account was found for that email." });
    return;
  }
  const temporaryPassword = tempPasswordAuth.generateTemporaryPassword();
  const passwordHash = tempPasswordAuth.hashPassword(temporaryPassword);
  // Auth fields only — leave plan, founding, promo, role, and all other data untouched.
  store.users[email] = tempPasswordAuth.applyTempPasswordToUser(existing, { passwordHash });
  await writeStoreAsync(store);
  // Return plaintext once in this response only. Do not log it.
  jsonResponse(response, 200, {
    ok: true,
    email,
    temporaryPassword,
    expiresAt: store.users[email].tempPasswordExpiresAt,
    mustChangePassword: true,
  });
}

async function handlePasswordResetRequest(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    jsonResponse(response, 400, { error: "Email is required." });
    return;
  }
  let delivery = "not_ready";
  try {
    const result = await sendPasswordResetEmail(email);
    if (result?.reason === "provider_not_ready") delivery = "not_ready";
    else if (result?.skipped && result?.reason === "user_not_found") delivery = "skipped";
    else if (result?.ok && result?.emailResult?.sent) delivery = "sent";
    else if (result?.ok) delivery = "skipped";
    else delivery = "failed";
  } catch (error) {
    console.warn("[email] Password reset email failed:", error.message);
    delivery = "failed";
  }
  // Always return a generic success body so callers cannot enumerate accounts.
  // `delivery` lets the client keep Firebase/demo paths when Resend is not ready.
  jsonResponse(response, 200, {
    ok: true,
    delivery,
    message: delivery === "not_ready"
      ? "Server password-reset email is not ready yet. Use Firebase Auth recovery or try again after Resend is configured."
      : "If that email is in Little Learner Hub, a password reset link has been sent.",
  });
}

function handlePasswordResetVerify(request, response, url) {
  const token = String(url.searchParams.get("token") || "");
  const store = readStore();
  const inspected = emailAuth.inspectToken(store, token, "password_reset");
  if (!inspected.ok) {
    jsonResponse(response, 400, { ok: false, error: "This reset link is missing or expired." });
    return;
  }
  jsonResponse(response, 200, {
    ok: true,
    email: inspected.email,
    expiresAt: inspected.expiresAt,
  });
}

async function handlePasswordResetComplete(request, response) {
  const body = await readJson(request);
  const token = String(body.token || "");
  const newPassword = String(body.newPassword || "");
  const confirmPassword = String(body.confirmPassword || "");
  if (newPassword.length < 8) {
    jsonResponse(response, 400, { error: "Please use a new password with at least 8 characters." });
    return;
  }
  if (newPassword !== confirmPassword) {
    jsonResponse(response, 400, { error: "The new passwords did not match." });
    return;
  }
  const store = readStore();
  const consumed = emailAuth.consumeToken(store, token, "password_reset");
  if (!consumed.ok || !consumed.email) {
    jsonResponse(response, 400, { error: "This reset link is missing or expired." });
    return;
  }
  const user = store.users?.[consumed.email];
  if (!user) {
    jsonResponse(response, 404, { error: "Account not found." });
    return;
  }
  store.users[consumed.email] = {
    ...tempPasswordAuth.clearTempPasswordFields(user, { keepServerPasswordAuth: true }),
    passwordHash: tempPasswordAuth.hashPassword(newPassword),
    serverPasswordAuth: true,
    mustChangePassword: false,
    emailVerified: user.emailVerified !== false,
    lastPasswordResetAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeStoreAsync(store);
  jsonResponse(response, 200, {
    ok: true,
    email: consumed.email,
    message: "Password reset complete. You can now log in.",
  });
}

async function handleVerificationEmailRequest(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    jsonResponse(response, 400, { error: "Email is required." });
    return;
  }
  try {
    const result = await sendVerificationEmail(email);
    if (result?.reason === "provider_not_ready") {
      jsonResponse(response, 200, {
        ok: true,
        delivery: "not_ready",
        message: "Server verification email is not ready yet. Use Firebase Auth verification or try again after Resend is configured.",
      });
      return;
    }
    jsonResponse(response, 200, {
      ok: true,
      delivery: result?.emailResult?.sent ? "sent" : (result?.skipped ? "skipped" : "failed"),
      message: result?.reason === "already_verified"
        ? "This email is already verified."
        : "If that account exists, a verification email has been sent.",
    });
  } catch (error) {
    console.warn("[email] Verification email failed:", error.message);
    jsonResponse(response, 200, {
      ok: true,
      delivery: "failed",
      message: "If that account exists, a verification email has been sent.",
    });
  }
}

async function handleVerifyEmailToken(request, response, url) {
  const token = String(url.searchParams.get("token") || "");
  const store = readStore();
  const consumed = emailAuth.consumeToken(store, token, "email_verification");
  const redirectBase = appBaseUrl();
  if (!consumed.ok || !consumed.email || !store.users?.[consumed.email]) {
    response.writeHead(302, { Location: `${redirectBase}/?emailVerification=expired` });
    response.end();
    return;
  }
  store.users[consumed.email] = {
    ...store.users[consumed.email],
    emailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeStoreAsync(store);
  response.writeHead(302, { Location: `${redirectBase}/?emailVerification=success` });
  response.end();
}

function authAuditLog(event, details = {}) {
  const safe = { ...details };
  delete safe.password;
  delete safe.newPassword;
  delete safe.confirmPassword;
  delete safe.temporaryPassword;
  delete safe.passwordHash;
  delete safe.tempPasswordHash;
  console.log(`[auth] ${event} ${JSON.stringify(safe)}`);
}

async function handlePasswordLogin(request, response) {
  const body = await readJson(request);
  const email = tempPasswordAuth.normalizeEmail(body.email);
  const password = String(body.password || "");
  authAuditLog("password_login_attempt", { email: email || "(missing)" });
  if (!email || !password) {
    authAuditLog("password_login_rejected", { email: email || "(missing)", reason: "missing_credentials" });
    jsonResponse(response, 400, { error: "Email and password are required." });
    return;
  }
  const store = readStore();
  // Phase 8: production must reject fake-account login mode.
  if (getFamilyFoundationApi().rejectFakeAccountLogin(store, email, response)) {
    authAuditLog("password_login_rejected", { email, reason: "fake_account_forbidden_in_production" });
    return;
  }
  store.users = store.users || {};
  let user = store.users[email];
  // During a Postgres outage the durable user row may be unavailable. Still allow
  // the sealed one-shot recovery hash for this exact member so she can get in and
  // set a new password. Never invent plan/Founding fields here.
  if (!user) {
    const sealed = tempPasswordAuth.ONE_SHOT_TEMP_PASSWORD;
    const hashed = tempPasswordAuth.hashPasswordSha256(password);
    if (email === sealed.email && hashed === sealed.passwordHash) {
      user = tempPasswordAuth.applyTempPasswordToUser({
        email,
        recoveryStub: true,
        appliedOneShotTempPasswordId: sealed.id,
      }, { passwordHash: sealed.passwordHash });
      store.users[email] = user;
      authAuditLog("password_login_recovery_stub", { email });
    }
  }
  if (!user) {
    authAuditLog("password_login_failed", { email, reason: "account_not_found" });
    jsonResponse(response, 401, { error: "The email or password did not match. Please try again." });
    return;
  }
  if (String(user.accountStatus || "").toLowerCase() === "disabled" || user.disabled === true) {
    authAuditLog("password_login_failed", { email, reason: "account_disabled" });
    jsonResponse(response, 403, { error: "This account has been disabled. Please contact support." });
    return;
  }
  const verified = tempPasswordAuth.verifyServerPasswordLogin(user, password);
  if (!verified.ok) {
    if (verified.clearExpiredTemp) {
      store.users[email] = tempPasswordAuth.clearTempPasswordFields(user, {
        keepServerPasswordAuth: Boolean(user.passwordHash || user.serverPasswordAuth),
      });
      await writeStoreAsync(store);
      authAuditLog("password_login_cleared_expired_temp", { email });
    }
    authAuditLog("password_login_failed", { email, reason: "bad_password", hadTemp: Boolean(user.tempPasswordHash) });
    jsonResponse(response, 401, { error: verified.error || "The email or password did not match. Please try again." });
    return;
  }
  // Audit first temp login; password remains valid until forced change or 24h expiry.
  let nextUser = { ...user };
  if (verified.clearExpiredTemp || (verified.mode === "server" && verified.mustChangePassword === false)) {
    nextUser = tempPasswordAuth.clearTempPasswordFields(nextUser, { keepServerPasswordAuth: true });
  }
  if (verified.mode === "temporary") {
    nextUser = {
      ...nextUser,
      tempPasswordConsumedAt: user.tempPasswordConsumedAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    nextUser = {
      ...nextUser,
      mustChangePassword: false,
      lastLoginAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  // Transparently upgrade a legacy-format password hash to the current secure
  // format the first time it's ever successfully used — this is the only point
  // the plaintext is available; there is no bulk "re-hash everyone" path.
  if (verified.upgradeField && verified.upgradeHash) {
    nextUser = { ...nextUser, [verified.upgradeField]: verified.upgradeHash };
    authAuditLog("password_hash_upgraded", { email, field: verified.upgradeField });
  }
  store.users[email] = nextUser;
  // External Tester Sandbox: record this login (timestamp only, never
  // anything sensitive) for the admin "login activity" view.
  if (nextUser.externalTesterSandbox === true && nextUser.fakeAccountId) {
    try {
      externalTesterSandboxModel.recordLoginActivity(store, nextUser.fakeAccountId);
    } catch { /* never block a real login over an activity-log write */ }
  }
  const sessionToken = tempPasswordAuth.createMemberSession(
    store,
    email,
    verified.mustChangePassword ? "temp-password" : "server-password",
  );
  await writeStoreAsync(store);
  authAuditLog("password_login_success", {
    email,
    mode: verified.mode,
    mustChangePassword: Boolean(verified.mustChangePassword),
    plan: nextUser.plan || "Free",
  });
  jsonResponse(response, 200, {
    ok: true,
    email,
    memberSessionToken: sessionToken,
    mustChangePassword: Boolean(verified.mustChangePassword),
    ...tempPasswordAuth.publicAuthFlags(store.users[email]),
    membership: membershipSummaryForUser(store.users[email], store),
    // Phase 23: only present on testing fake accounts (see handleIssueFakePassword) —
    // lets the client land Director/Solo/Teacher/Assistant/Curriculum Only fake
    // accounts on the correct provider experience, and guardians in Family Hub,
    // straight after a real password login instead of only inside admin-preview APIs.
    accountType: store.users[email].accountType || "",
    role: store.users[email].role || "",
    familyHubGuardian: Boolean(store.users[email].familyHubGuardian),
    // Lets the client recognize a connected testing account (Home Daycare
    // Pilot owner/staff, or any other Testing Lab fake account now served
    // by /api/pilot/*) straight after a real password login — see
    // isHomeDaycarePilotAccount() in app.js.
    organizationId: store.users[email].organizationId || "",
  });
}

async function handleCompleteForcedPasswordChange(request, response) {
  const body = await readJson(request);
  const authHeader = String(request.headers.authorization || "");
  const store = readStore();
  const session = tempPasswordAuth.resolveMemberSession(store, authHeader);
  if (!session?.email) {
    authAuditLog("forced_password_change_rejected", { reason: "missing_member_session" });
    jsonResponse(response, 401, { error: "Please log in again to create a new password." });
    return;
  }
  const newPassword = String(body.newPassword || "");
  const confirmPassword = String(body.confirmPassword || "");
  authAuditLog("forced_password_change_attempt", { email: session.email });
  if (newPassword.length < 8) {
    authAuditLog("forced_password_change_rejected", { email: session.email, reason: "password_too_short" });
    jsonResponse(response, 400, { error: "Please use a new password with at least 8 characters." });
    return;
  }
  if (newPassword !== confirmPassword) {
    authAuditLog("forced_password_change_rejected", { email: session.email, reason: "password_mismatch" });
    jsonResponse(response, 400, { error: "The new passwords did not match." });
    return;
  }
  const email = session.email;
  const user = store.users?.[email];
  if (!user) {
    authAuditLog("forced_password_change_rejected", { email, reason: "account_not_found" });
    jsonResponse(response, 404, { error: "Account not found." });
    return;
  }
  if (!user.mustChangePassword && !user.serverPasswordAuth) {
    authAuditLog("forced_password_change_rejected", { email, reason: "not_required" });
    jsonResponse(response, 400, { error: "A forced password change is not required for this account." });
    return;
  }
  const passwordHash = tempPasswordAuth.hashPassword(newPassword);
  store.users[email] = {
    ...tempPasswordAuth.clearTempPasswordFields(user, { keepServerPasswordAuth: true }),
    passwordHash,
    mustChangePassword: false,
    passwordUpdatedAt: new Date().toISOString(),
    passwordUpdatedVia: "forced_change",
  };
  // Invalidate the recovery session that was tied to the temporary password.
  tempPasswordAuth.revokeMemberSession(store, session.token);
  const nextSession = tempPasswordAuth.createMemberSession(store, email, "server-password");
  await writeStoreAsync(store);
  authAuditLog("forced_password_change_success", { email, passwordUpdatedVia: "forced_change" });
  jsonResponse(response, 200, {
    ok: true,
    email,
    memberSessionToken: nextSession,
    mustChangePassword: false,
    ...tempPasswordAuth.publicAuthFlags(store.users[email]),
  });
}

/**
 * After a successful Firebase password reset/login, sync the permanent hash into
 * the server store and clear sticky temp-password recovery flags so login cannot
 * get stuck behind mustChangePassword without a member session.
 */
async function handleSyncPasswordAfterFirebase(request, response) {
  const body = await readJson(request);
  let identity = null;
  try {
    if (firebaseConfigStatus().ready) {
      identity = await verifyFirebaseUser(request);
    } else {
      // Local/demo or automated tests when Firebase Auth is not configured.
      const authHeader = String(request.headers.authorization || "");
      if (authHeader.startsWith("Bearer test:")) {
        identity = { email: normalizeEmail(authHeader.slice("Bearer test:".length)), uid: "test" };
      } else if (normalizeEmail(body.email) && String(body.newPassword || "").length >= 8) {
        identity = { email: normalizeEmail(body.email), uid: `local-${normalizeEmail(body.email)}` };
      }
    }
  } catch (error) {
    authAuditLog("firebase_password_sync_rejected", { reason: "invalid_firebase_token", error: error.message });
    jsonResponse(response, 401, { error: "Please log in again before syncing your password." });
    return;
  }
  const email = normalizeEmail(identity?.email || body.email || "");
  const newPassword = String(body.newPassword || "");
  authAuditLog("firebase_password_sync_attempt", { email: email || "(missing)" });
  if (!email || !identity) {
    jsonResponse(response, 401, { error: "A verified account email is required." });
    return;
  }
  if (newPassword && newPassword.length < 8) {
    jsonResponse(response, 400, { error: "Please use a password with at least 8 characters." });
    return;
  }
  const store = readStore();
  store.users = store.users || {};
  const existing = store.users[email] || { email };
  const passwordHash = newPassword
    ? tempPasswordAuth.hashPassword(newPassword)
    : (existing.passwordHash || "");
  store.users[email] = {
    ...tempPasswordAuth.clearTempPasswordFields(existing, { keepServerPasswordAuth: true }),
    email,
    passwordHash: passwordHash || existing.passwordHash || "",
    serverPasswordAuth: true,
    mustChangePassword: false,
    passwordUpdatedAt: new Date().toISOString(),
    passwordUpdatedVia: body.source || "firebase_sync",
    firebaseUid: identity?.uid || existing.firebaseUid || "",
    lastLoginAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  await writeStoreAsync(store);
  authAuditLog("firebase_password_sync_success", {
    email,
    clearedRecoveryFlags: true,
    passwordHashUpdated: Boolean(newPassword),
    source: body.source || "firebase_sync",
  });
  jsonResponse(response, 200, {
    ok: true,
    email,
    mustChangePassword: false,
    ...tempPasswordAuth.publicAuthFlags(store.users[email]),
  });
}

async function handleAdminLogin(request, response) {
  const security = require("../scripts/phase20-security-data-model.js");
  const rate = security.checkRateLimit(security.clientKeyFromRequest(request, "admin-login"), {
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    jsonResponse(response, 429, {
      error: "Too many admin login attempts. Try again shortly.",
      code: "rate_limited",
      retryAfterSec: rate.retryAfterSec,
    });
    return;
  }
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const code = String(body.code || "");
  if (!ADMIN_EMAILS.length || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    jsonResponse(response, 503, { error: "Admin login is not configured on the server." });
    return;
  }
  const valid = isConfiguredAdminEmail(email)
    && timingSafeEqualText(password, ADMIN_PASSWORD)
    && timingSafeEqualText(code, ADMIN_ACCESS_CODE);
  if (!valid) {
    // Do not echo which field failed; never log password/code.
    console.warn("[admin-login]", JSON.stringify(security.sanitizeErrorForLog({
      code: "admin_login_failed",
      message: "Invalid admin credentials",
      surface: "admin_login",
    })));
    jsonResponse(response, 401, { error: "The owner email, password, or admin code did not match." });
    return;
  }
  try {
    const token = await createAdminToken(email);
    jsonResponse(response, 200, {
      token,
      email,
      name: ADMIN_NAME,
      mode: "server",
    });
  } catch (error) {
    jsonResponse(response, 500, {
      error: "Admin login succeeded locally but the session could not be saved. Please try again.",
      code: "admin_session_persist_failed",
      hint: security.sanitizeErrorForLog({ message: error?.message || "Store write failed.", code: "admin_session_persist_failed" }).message,
    });
  }
}

/**
 * Lock Admin / logout — revoke the current admin session token server-side.
 * Clears live cache first so mergeStorePreserveAdminSessions cannot reinject it.
 */
async function handleAdminLogout(request, response) {
  const body = await readJson(request);
  const authHeader = String(request.headers.authorization || "");
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const token = String(body.adminToken || bearer || "").trim();
  if (!token) {
    jsonResponse(response, 400, { error: "Admin token is required." });
    return;
  }
  let revoked = false;
  if (storeCache?.adminSessions && storeCache.adminSessions[token]) {
    delete storeCache.adminSessions[token];
    revoked = true;
  }
  try {
    const store = readStore();
    store.adminSessions = store.adminSessions || {};
    if (store.adminSessions[token]) {
      delete store.adminSessions[token];
      revoked = true;
      writeStore(store);
    }
  } catch (error) {
    jsonResponse(response, 500, {
      error: "Could not revoke admin session.",
      hint: error?.message || "Store write failed.",
    });
    return;
  }
  jsonResponse(response, 200, { ok: true, revoked });
}

async function handleAdminNotificationsList(request, response, url) {
  const token = String(url.searchParams.get("adminToken") || "").trim();
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, adminAuthFailurePayload());
    return;
  }
  const store = ensureMessagingStore(readStore());
  const category = String(url.searchParams.get("category") || "").trim();
  const unreadOnly = ["1", "true", "yes"].includes(String(url.searchParams.get("unreadOnly") || "").toLowerCase());
  const limit = Number(url.searchParams.get("limit") || 100);
  const items = adminNotifications.listAdminNotifications(store, ADMIN_EMAIL, {
    category,
    unreadOnly,
    limit,
    adminEmails: ADMIN_EMAILS,
  });
  const unreadCount = (store.notifications || []).filter(
    (n) => n && isConfiguredAdminEmail(n.email) && !n.read,
  ).length;
  const byCategory = {};
  adminNotifications.CATEGORIES.forEach((key) => { byCategory[key] = 0; });
  items.forEach((item) => {
    const key = item.category || "system";
    byCategory[key] = (byCategory[key] || 0) + 1;
  });
  jsonResponse(response, 200, {
    ok: true,
    unreadCount,
    categories: adminNotifications.CATEGORIES,
    byCategory,
    notifications: items,
  });
}

async function handleAdminNotificationsMarkRead(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "").trim();
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, adminAuthFailurePayload());
    return;
  }
  const store = ensureMessagingStore(readStore());
  const changed = adminNotifications.markAdminNotificationsRead(store, ADMIN_EMAIL, {
    ids: Array.isArray(body.ids) ? body.ids : [],
    all: Boolean(body.all),
    adminEmails: ADMIN_EMAILS,
  });
  writeStore(store);
  const unreadCount = (store.notifications || []).filter(
    (n) => n && isConfiguredAdminEmail(n.email) && !n.read,
  ).length;
  jsonResponse(response, 200, { ok: true, changed, unreadCount });
}

async function handleAdminSiteContentSave(request, response) {
  console.log("[DIAG] handleAdminSiteContentSave: POST /api/admin/site-content received");
  const body = await readJson(request);
  console.log("[DIAG] handleAdminSiteContentSave: body keys =", Object.keys(body || {}), "| hasAdminToken =", !!(body?.adminToken));
  if (!validAdminToken(body.adminToken || "")) {
    console.error("[DIAG] handleAdminSiteContentSave: REJECTED — invalid admin token");
    jsonResponse(response, 401, adminAuthFailurePayload());
    return;
  }
  console.log("[DIAG] handleAdminSiteContentSave: token valid");
  const store = readStore();
  const existingContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  const incomingRaw = body.siteContent && typeof body.siteContent === "object" ? body.siteContent : {};
  const existingUpdatedAt = normalizedShortText(existingContent.updatedAt, 80);
  const incomingUpdatedAt = normalizedShortText(incomingRaw.updatedAt, 80);
  // First save (empty existing updatedAt) is allowed. After that, client must send the
  // same updatedAt it last loaded, or we reject to avoid stale full-document overwrites.
  if (existingUpdatedAt && incomingUpdatedAt !== existingUpdatedAt) {
    console.error("[DIAG] handleAdminSiteContentSave: CONFLICT — incoming updatedAt =", JSON.stringify(incomingUpdatedAt), "| existing =", JSON.stringify(existingUpdatedAt));
    jsonResponse(response, 409, {
      error: "Content was updated elsewhere. Reload admin content and try again.",
      conflict: true,
      siteContent: existingContent,
    });
    return;
  }
  const incomingLessonPlans = incomingRaw.lessonPlans || {};
  const incomingIds = Object.keys(incomingLessonPlans);
  console.log("[DIAG] handleAdminSiteContentSave: incoming lessonPlan overrides count =", incomingIds.length, "| ids (first 5) =", incomingIds.slice(0, 5));
  if (incomingIds.length > 0) {
    const lastIncomingId = incomingIds[incomingIds.length - 1];
    const lastIncomingLesson = incomingLessonPlans[lastIncomingId];
    console.log("[DIAG] handleAdminSiteContentSave: last lessonPlan entry (", lastIncomingId, ") fields =", Object.keys(lastIncomingLesson || {}));
    console.log("[DIAG] handleAdminSiteContentSave: last lessonPlan entry title =", JSON.stringify(lastIncomingLesson?.title), "| visible =", lastIncomingLesson?.visible, "| plan =", JSON.stringify(lastIncomingLesson?.plan));
  }
  const mergedIncoming = mergeSiteContentKeepMissingKeys(existingContent, incomingRaw);
  const nextContent = normalizedSiteContent(mergedIncoming);
  const normalizedIds = Object.keys(nextContent.lessonPlans || {});
  console.log("[DIAG] handleAdminSiteContentSave: after normalizedSiteContent, lessonPlan count =", normalizedIds.length);
  if (normalizedIds.length > 0) {
    const lastNormalizedId = normalizedIds[normalizedIds.length - 1];
    const lastNormalizedLesson = nextContent.lessonPlans[lastNormalizedId];
    console.log("[DIAG] handleAdminSiteContentSave: normalized last lessonPlan (", lastNormalizedId, ") fields =", Object.keys(lastNormalizedLesson || {}));
    console.log("[DIAG] handleAdminSiteContentSave: normalized last lessonPlan title =", JSON.stringify(lastNormalizedLesson?.title), "| visible =", lastNormalizedLesson?.visible, "| plan =", JSON.stringify(lastNormalizedLesson?.plan));
  }
  nextContent.updatedAt = new Date().toISOString();
  store.siteContent = nextContent;
  console.log("[DIAG] handleAdminSiteContentSave: calling writeStoreAsync…");
  try {
    await writeStoreAsync(store);
    console.log("[DIAG] handleAdminSiteContentSave: writeStoreAsync succeeded");
  } catch (error) {
    console.error("[DIAG] handleAdminSiteContentSave: writeStoreAsync FAILED →", error.message);
    console.error("Admin site content save failed:", error.message);
    jsonResponse(response, 503, { error: "Changes could not be saved to the database. Please try again." });
    return;
  }
  console.log("[DIAG] handleAdminSiteContentSave: responding 200 OK");
  jsonResponse(response, 200, { siteContent: nextContent });
}

async function handlePromoValidation(request, response, url) {
  const body = request.method === "POST" ? await readJson(request) : {};
  const enteredCode = normalizePromoCode(body.code || url.searchParams.get("code"));
  const email = normalizeEmail(body.email || url.searchParams.get("email"));
  const store = peekStore();
  const promo = checkoutPromoForCode(enteredCode, store);
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
        ? `That promo code expired ${promo.expiresLabel || ""}.`.trim()
        : promo.exhausted
          ? "That promo code has reached its redemption limit."
          : "That promo code is not active. Check the code and try again.",
    });
    return;
  }
  if (promoUsedByAccount(email, promo.code, store)) {
    jsonResponse(response, 409, {
      valid: false,
      error: "This account has already used that promo code.",
    });
    return;
  }
  const founding = foundingStatusPayload(store);
  jsonResponse(response, 200, {
    valid: true,
    trialDays: promo.trialDays,
    label: promo.label,
    expiresAt: promo.expiresAt,
    expiresLabel: promo.expiresLabel,
    paymentMethodRequired: true,
    foundingSpotsRemaining: founding.remaining,
    locksFoundingPrice: founding.remaining > 0,
    message: founding.remaining > 0
      ? `Promo accepted: ${promo.trialDays} days free ($0 now, card required). A Founding Member spot will be reserved so you lock in $9.99/month after the free month.`
      : `Promo accepted: ${promo.trialDays} days free ($0 now, card required). Founding spots are sold out — after the free month you continue at regular Pro pricing.`,
  });
}

async function handleCheckout(request, response) {
  if (stripeCheckoutIsDisabled()) {
    jsonResponse(response, 403, {
      error: "Checkout is disabled in this testing/preview environment.",
      code: "stripe_checkout_disabled",
      previewSafeMode: isDirectorCenterPreviewSafeMode(),
    });
    return;
  }
  if (!requireStripe(response)) return;
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const store = readStore();
  seedDefaultPromoCodes(store);
  purgeExpiredFoundingReservations(store, { persist: true });
  let requestedPlan = body.plan || "monthly";
  if (requestedPlan === "founding" && foundingSpotsRemaining(store) <= 0) {
    jsonResponse(response, 409, {
      error: "Founding Membership is sold out. All 50 lifetime spots have been claimed. Choose Pro Monthly ($19.99/month) or Pro Annual ($199/year) instead.",
      founding: foundingStatusPayload(store),
      soldOut: true,
    });
    return;
  }
  const existingUser = store.users?.[email] || {};
  // Block a second Checkout while the account already has paid/trial/manual Pro access.
  // Prevents double billing from duplicate clicks or returning to the upgrade page.
  if (membershipAccess.membershipHasProAccess(existingUser)) {
    const alreadyFounding = membershipAccess.membershipFoundingActive(existingUser);
    const alreadyTrial = membershipAccess.membershipUserInTrial(existingUser);
    jsonResponse(response, 409, {
      error: alreadyFounding
        ? "This account already has an active Founding Member subscription. Manage billing from Settings → Billing & Subscription instead of starting a new checkout."
        : alreadyTrial
          ? "This account already has an active Pro trial. Manage billing from Settings → Billing & Subscription instead of starting a new checkout."
          : "This account already has an active Pro subscription. Manage billing from Settings → Billing & Subscription instead of starting a new checkout.",
      code: "already_subscribed",
      alreadySubscribed: true,
      planDisplay: membershipAccess.membershipPlanDisplay(existingUser),
    });
    return;
  }
  if (requestedPlan === "founding"
    && membershipAccess.membershipFoundingHistorical(existingUser)
    && !membershipAccess.membershipFoundingActive(existingUser)
    && !existingUser.foundingSpotReleasedAt
    && (existingUser.firstPaidInvoiceAt || existingUser.lastSuccessfulPaymentAt || existingUser.foundingMemberNumber)) {
    jsonResponse(response, 400, {
      error: "Former Founding Members are not automatically eligible for $9.99 pricing. Choose Pro Monthly or Pro Annual, or contact support for an intentional admin review.",
      formerFounding: true,
    });
    return;
  }
  const promo = checkoutPromoForCode(body.promoCode, store);
  const trial7day = body.trial7day === true;
  if (normalizePromoCode(body.promoCode) && !promo.valid) {
    jsonResponse(response, 400, {
      error: promo.expired
        ? `That promo code expired ${promo.expiresLabel || ""}.`.trim()
        : promo.exhausted
          ? "That promo code has reached its redemption limit."
          : "That promo code is not active. Check the code and try again.",
    });
    return;
  }
  if (promo.valid && promoUsedByAccount(email, promo.code, store)) {
    jsonResponse(response, 409, { error: "This account has already used that promo code." });
    return;
  }

  // Promo signups: lock Founding $9.99 when spots remain; otherwise roll into regular Pro.
  let planKey = requestedPlan;
  let planRemapped = null;
  if (promo.valid && (planKey === "founding" || planKey === "monthly")) {
    if (foundingSpotsRemaining(store) > 0) {
      if (planKey !== "founding") planRemapped = "founding";
      planKey = "founding";
    } else if (planKey === "founding") {
      planKey = "monthly";
      planRemapped = "monthly_sold_out";
    }
  }

  const price = getPriceId(planKey);
  if (!email) {
    jsonResponse(response, 400, { error: "Email is required before checkout." });
    return;
  }
  if (!planConfig[planKey] || !price) {
    jsonResponse(response, 400, { error: `Stripe price is missing for ${planKey}.` });
    return;
  }

  // Reserve Founding inventory as soon as checkout starts so the free month cannot lose the spot.
  let foundingReservation = null;
  if (planKey === "founding") {
    foundingReservation = reserveFoundingSpot(email, {
      promoCode: promo.valid ? promo.code : "",
      reason: "checkout_started",
      releasableUntilFirstPayment: Boolean(promo.valid || trial7day),
      ttlMs: FOUNDING_CHECKOUT_HOLD_MS,
    });
    if (!foundingReservation.ok) {
      if (promo.valid) {
        planKey = "monthly";
        planRemapped = "monthly_sold_out";
      } else {
        jsonResponse(response, 409, {
          error: "Founding Membership just sold out. Choose Pro Monthly or Pro Annual instead.",
          founding: foundingStatusPayload(readStore()),
          soldOut: true,
        });
        return;
      }
    }
  }

  try {
    const customer = await getOrCreateStripeCustomer(email);
    const resolvedPrice = getPriceId(planKey);
    const sessionParams = {
      mode: "subscription",
      customer,
      "line_items[0][price]": resolvedPrice,
      "line_items[0][quantity]": "1",
      // Card is always collected — including during promo free months / trials.
      payment_method_collection: "always",
      "metadata[email]": email,
      "metadata[plan]": planKey,
      "subscription_data[metadata][email]": email,
      "subscription_data[metadata][plan]": planKey,
      success_url: body.successUrl || `${SITE_URL}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: body.cancelUrl || `${SITE_URL}?checkout=cancel`,
    };
    if (STRIPE_AUTOMATIC_TAX) {
      sessionParams["automatic_tax[enabled]"] = "true";
      sessionParams.billing_address_collection = "required";
    }
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
    if (planKey === "founding" && foundingReservation?.ok) {
      reserveFoundingSpot(email, {
        promoCode: promo.valid ? promo.code : "",
        reason: "checkout_started",
        sessionId: session.id || "",
        releasableUntilFirstPayment: Boolean(promo.valid || trial7day),
        ttlMs: FOUNDING_CHECKOUT_HOLD_MS,
      });
    }
    upsertUser(email, {
      stripeCustomerId: customer,
      pendingPlan: planKey,
      subscriptionStatus: "Checkout Started",
      pendingPromoCode: promo.valid ? promo.code : "",
      pendingTrialDays: promo.valid ? promo.trialDays : trial7day ? 7 : 0,
      pendingPromoLabel: promo.valid ? promo.label : trial7day ? "7-Day Pro Trial" : "",
      foundingSpotReleasable: planKey === "founding" && Boolean(promo.valid || trial7day),
    });
    jsonResponse(response, 200, {
      url: session.url,
      id: session.id,
      plan: planKey,
      planRemapped,
      promo: promo.valid ? {
        applied: true,
        trialDays: promo.trialDays,
        label: promo.label,
        expiresAt: promo.expiresAt,
        expiresLabel: promo.expiresLabel,
        foundingReserved: planKey === "founding",
        locksFoundingPrice: planKey === "founding",
      } : null,
      trial: trial7day ? { applied: true, trialDays: 7, label: "7-Day Pro Trial" } : null,
      founding: foundingStatusPayload(readStore()),
      paymentMethodRequired: true,
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

async function stripeListAll(resource, query = {}) {
  const results = [];
  let startingAfterId = "";
  while (true) {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      params.set(key, String(value));
    });
    if (!params.has("limit")) params.set("limit", "100");
    if (startingAfterId) params.set("starting_after", startingAfterId);
    const page = await stripeGet(`${resource}?${params.toString()}`);
    const pageItems = Array.isArray(page?.data) ? page.data : [];
    results.push(...pageItems);
    if (!page?.has_more || !pageItems.length) break;
    startingAfterId = pageItems[pageItems.length - 1]?.id || "";
    if (!startingAfterId) break;
  }
  return results;
}

function legacySubscriptionPriority(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "trialing") return 6;
  if (normalized === "active") return 5;
  if (normalized === "past_due" || normalized === "unpaid") return 4;
  if (normalized === "canceled") return 3;
  if (normalized === "incomplete" || normalized === "incomplete_expired") return 2;
  return 1;
}

function selectLegacySubscription(subscriptions = []) {
  const list = Array.isArray(subscriptions) ? subscriptions.slice() : [];
  if (!list.length) return null;
  list.sort((left, right) => {
    const priorityDiff = legacySubscriptionPriority(right?.status) - legacySubscriptionPriority(left?.status);
    if (priorityDiff) return priorityDiff;
    return Number(right?.created || 0) - Number(left?.created || 0);
  });
  return list[0] || null;
}

function legacySubscriptionState(subscription) {
  if (!subscription) return "No Subscription";
  const status = String(subscription?.status || "").toLowerCase();
  if (status === "trialing") return "Trial";
  if (status === "active" || status === "past_due" || status === "unpaid") return "Active";
  if (status === "canceled" || status === "incomplete_expired") return "Canceled";
  return "No Subscription";
}

function legacyPlanFromSubscription(subscription) {
  if (!subscription) return { plan: "Free", planDisplayName: "Free" };
  const planKey = planKeyFromStripe(subscription, {});
  if (planKey === "founding") return { plan: "Founding", planDisplayName: "Founding Member" };
  if (planKey === "monthly" || planKey === "annual") return { plan: "Pro", planDisplayName: "Pro" };
  const metadataPlan = String(subscription?.metadata?.plan || "").trim().toLowerCase();
  if (metadataPlan.includes("found")) return { plan: "Founding", planDisplayName: "Founding Member" };
  if (metadataPlan.includes("pro")) return { plan: "Pro", planDisplayName: "Pro" };
  return { plan: "Free", planDisplayName: "Free" };
}

function legacyTrialStatus(subscriptionState) {
  return subscriptionState === "Trial" ? "Trial Active" : "No Trial";
}

function legacyAccountStatus(subscriptionState) {
  return subscriptionState === "Canceled" ? "Canceled" : "Active";
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  return true;
}

function mergeLegacyStripeIntoUser(existing, incoming, report) {
  const merged = {
    ...existing,
    email: incoming.email || existing.email || "",
    updatedAt: new Date().toISOString(),
  };
  if (!hasMeaningfulValue(existing.name) && hasMeaningfulValue(incoming.name)) merged.name = incoming.name;
  if (!hasMeaningfulValue(existing.displayName) && hasMeaningfulValue(incoming.name)) merged.displayName = incoming.name;
  if (!hasMeaningfulValue(existing.signupAt) && hasMeaningfulValue(incoming.signupAt)) merged.signupAt = incoming.signupAt;
  if (!hasMeaningfulValue(existing.createdAt) && hasMeaningfulValue(incoming.createdAt)) merged.createdAt = incoming.createdAt;
  if (!hasMeaningfulValue(existing.accountStatus) && hasMeaningfulValue(incoming.accountStatus)) merged.accountStatus = incoming.accountStatus;
  if (!hasMeaningfulValue(existing.trialStatus) && hasMeaningfulValue(incoming.trialStatus)) merged.trialStatus = incoming.trialStatus;
  if (!hasMeaningfulValue(existing.stripeCustomerCreatedAt) && hasMeaningfulValue(incoming.stripeCustomerCreatedAt)) {
    merged.stripeCustomerCreatedAt = incoming.stripeCustomerCreatedAt;
  }
  if (!hasMeaningfulValue(existing.stripeCustomerId) && hasMeaningfulValue(incoming.stripeCustomerId)) {
    merged.stripeCustomerId = incoming.stripeCustomerId;
  } else if (
    hasMeaningfulValue(existing.stripeCustomerId)
    && hasMeaningfulValue(incoming.stripeCustomerId)
    && existing.stripeCustomerId !== incoming.stripeCustomerId
  ) {
    report.duplicateAccountsDetected.push({
      type: "existing_user_multiple_stripe_customers",
      email: incoming.email,
      existingStripeCustomerId: existing.stripeCustomerId,
      incomingStripeCustomerId: incoming.stripeCustomerId,
    });
    report.recordsNeedingManualReview.push({
      type: "conflicting_stripe_customer_id",
      email: incoming.email,
      existingStripeCustomerId: existing.stripeCustomerId,
      incomingStripeCustomerId: incoming.stripeCustomerId,
      note: "User already has a different Stripe customer ID. Review before changing linkage.",
    });
  }
  if (!hasMeaningfulValue(existing.stripeSubscriptionId) && hasMeaningfulValue(incoming.stripeSubscriptionId)) {
    merged.stripeSubscriptionId = incoming.stripeSubscriptionId;
  }
  const existingIsPaid = ["Pro", "Founding"].includes(String(existing.plan || ""));
  const incomingIsPaid = ["Pro", "Founding"].includes(String(incoming.plan || ""));
  if (!hasMeaningfulValue(existing.plan) || existing.plan === "Free" || (!existingIsPaid && incomingIsPaid)) merged.plan = incoming.plan;
  if (!hasMeaningfulValue(existing.planDisplayName) || existing.planDisplayName === "Free" || (!existingIsPaid && incomingIsPaid)) {
    merged.planDisplayName = incoming.planDisplayName;
  }
  const shouldUpdateSubscriptionState = !hasMeaningfulValue(existing.subscriptionState)
    || existing.subscriptionState === "No Subscription"
    || incoming.subscriptionState === "Active"
    || incoming.subscriptionState === "Trial";
  if (shouldUpdateSubscriptionState) {
    merged.subscriptionState = incoming.subscriptionState;
  }
  const shouldUpdateSubscriptionStatus = !hasMeaningfulValue(existing.subscriptionStatus)
    || existing.subscriptionStatus === "Free Plan"
    || incoming.subscriptionState === "Active"
    || incoming.subscriptionState === "Trial";
  if (shouldUpdateSubscriptionStatus) {
    merged.subscriptionStatus = incoming.subscriptionStatus;
  }
  if (!hasMeaningfulValue(existing.subscriptionCadence) && hasMeaningfulValue(incoming.subscriptionCadence)) {
    merged.subscriptionCadence = incoming.subscriptionCadence;
  }
  if (!hasMeaningfulValue(existing.monthlyPrice) && hasMeaningfulValue(incoming.monthlyPrice)) {
    merged.monthlyPrice = incoming.monthlyPrice;
  }
  if (!hasMeaningfulValue(existing.priceLock) && hasMeaningfulValue(incoming.priceLock)) {
    merged.priceLock = incoming.priceLock;
  }
  return merged;
}

function normalizeLegacyStripeUser(customer, subscription) {
  const email = normalizeEmail(customer?.email || "");
  const createdAt = unixTimestampToIso(customer?.created);
  const subscriptionState = legacySubscriptionState(subscription);
  const planInfo = legacyPlanFromSubscription(subscription);
  const base = {
    email,
    name: String(customer?.name || "").trim(),
    stripeCustomerId: String(customer?.id || "").trim(),
    stripeCustomerCreatedAt: createdAt,
    createdAt,
    signupAt: createdAt,
    accountStatus: legacyAccountStatus(subscriptionState),
    subscriptionState,
    paymentMethod: "Managed in Stripe",
  };
  if (!subscription) {
    return {
      ...base,
      plan: "Free",
      planDisplayName: "Free",
      subscriptionStatus: "Free Plan",
      trialStatus: "No Trial",
      stripeSubscriptionId: "",
      stripeSubscriptionStatus: "",
      foundingMemberActive: false,
      monthlyPrice: "$0/month",
    };
  }
  // Use the same Stripe→membership mapping as live webhooks so restored users
  // get foundingMemberActive, period dates, and access keys — not just plan labels.
  const membership = membershipUpdatesFromStripeSubscription(subscription, {
    email,
    plan: planInfo.plan,
    foundingMemberActive: planInfo.plan === "Founding",
    foundingMemberHistorical: planInfo.plan === "Founding",
  });
  return {
    ...base,
    ...membership,
    planDisplayName: planInfo.planDisplayName,
    trialStatus: membership.trialStatus || legacyTrialStatus(subscriptionState),
    subscriptionStartedAt: unixTimestampToIso(subscription?.start_date || subscription?.created) || createdAt,
  };
}

function rebuildFoundingMembersFromUsers(store) {
  const users = store.users || {};
  const next = [];
  Object.values(users).forEach((user) => {
    const email = normalizeEmail(user?.email || "");
    if (!email) return;
    const isFounding = Boolean(
      user.foundingMemberActive
      || user.foundingMemberHistorical
      || user.foundingMember
      || user.foundingMemberNumber
      || String(user.plan || "") === "Founding",
    );
    if (isFounding && !next.includes(email)) next.push(email);
  });
  // Preserve any emails already listed that may not have been rebuilt yet.
  (store.foundingMembers || []).forEach((email) => {
    const clean = normalizeEmail(email);
    if (clean && !next.includes(clean)) next.push(clean);
  });
  store.foundingMembers = next;
  return next.length;
}

function unixTimestampToIso(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return new Date(numeric * 1000).toISOString();
}

async function backfillLegacyStripeUsers({ dryRun = false } = {}) {
  if (!isConfiguredValue(STRIPE_SECRET_KEY)) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY before running backfill.");
  }
  const store = readStore();
  store.users = store.users || {};
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: dryRun === true,
    stripeCustomersFound: 0,
    usersMatchedByEmail: 0,
    usersNotMatched: 0,
    usersCreatedFromStripeRecords: 0,
    duplicateAccountsDetected: [],
    recordsNeedingManualReview: [],
  };
  const stripeCustomers = await stripeListAll("customers");
  report.stripeCustomersFound = stripeCustomers.length;
  const allSubscriptions = await stripeListAll("subscriptions", { status: "all" });
  const subscriptionsByCustomer = allSubscriptions.reduce((map, subscription) => {
    const customerId = String(subscription?.customer || "").trim();
    if (!customerId) return map;
    map[customerId] = map[customerId] || [];
    map[customerId].push(subscription);
    return map;
  }, {});

  const customerIdsByEmail = {};
  for (const customer of stripeCustomers) {
    const email = normalizeEmail(customer?.email || "");
    if (!email) continue;
    customerIdsByEmail[email] = customerIdsByEmail[email] || [];
    customerIdsByEmail[email].push(customer.id);
  }
  Object.entries(customerIdsByEmail).forEach(([email, ids]) => {
    if (ids.length <= 1) return;
    report.duplicateAccountsDetected.push({
      type: "stripe_duplicate_email",
      email,
      stripeCustomerIds: ids,
    });
    report.recordsNeedingManualReview.push({
      type: "stripe_duplicate_email",
      email,
      stripeCustomerIds: ids,
      note: "Multiple Stripe customers share the same email. Confirm the correct primary customer.",
    });
  });

  const userEmailsByStripeCustomerId = {};
  Object.entries(store.users).forEach(([email, user]) => {
    const customerId = String(user?.stripeCustomerId || "").trim();
    if (!customerId) return;
    userEmailsByStripeCustomerId[customerId] = userEmailsByStripeCustomerId[customerId] || [];
    userEmailsByStripeCustomerId[customerId].push(email);
  });
  Object.entries(userEmailsByStripeCustomerId).forEach(([customerId, emails]) => {
    if (emails.length <= 1) return;
    report.duplicateAccountsDetected.push({
      type: "backend_duplicate_stripe_customer",
      stripeCustomerId: customerId,
      emails,
    });
    report.recordsNeedingManualReview.push({
      type: "backend_duplicate_stripe_customer",
      stripeCustomerId: customerId,
      emails,
      note: "Multiple backend users are linked to the same Stripe customer ID.",
    });
  });

  report.userCountBefore = Object.keys(store.users).length;
  for (const customer of stripeCustomers) {
    const email = normalizeEmail(customer?.email || "");
    if (!email) {
      report.recordsNeedingManualReview.push({
        type: "missing_customer_email",
        stripeCustomerId: customer?.id || "",
        note: "Stripe customer has no email and cannot be matched to or created as a backend user.",
      });
      continue;
    }
    const subscriptions = subscriptionsByCustomer[customer.id] || [];
    const subscription = selectLegacySubscription(subscriptions);
    const incomingUser = normalizeLegacyStripeUser(customer, subscription);
    const existing = store.users[email];
    if (existing) {
      report.usersMatchedByEmail += 1;
      store.users[email] = mergeLegacyStripeIntoUser(existing, incomingUser, report);
      // Always refresh Stripe-authoritative membership fields for paid subscriptions.
      if (subscription && ["active", "trialing", "past_due"].includes(String(subscription.status || "").toLowerCase())) {
        const membership = membershipUpdatesFromStripeSubscription(subscription, store.users[email]);
        store.users[email] = {
          ...store.users[email],
          ...membership,
          email,
          stripeCustomerId: store.users[email].stripeCustomerId || incomingUser.stripeCustomerId,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      report.usersNotMatched += 1;
      report.usersCreatedFromStripeRecords += 1;
      store.users[email] = {
        email,
        ...incomingUser,
        lastSeenAt: "",
        lastLoginAt: "",
        updatedAt: new Date().toISOString(),
      };
    }
  }
  report.foundingMembersRestored = rebuildFoundingMembersFromUsers(store);
  report.userCountAfter = Object.keys(store.users).length;
  if (!dryRun) await writeStoreAsync(store);
  report.duplicateAccountsDetected = report.duplicateAccountsDetected.slice(0, MAX_BACKFILL_REPORT_ITEMS);
  report.recordsNeedingManualReview = report.recordsNeedingManualReview.slice(0, MAX_BACKFILL_REPORT_ITEMS);
  return report;
}

function storeHealthSnapshot(store = peekStore()) {
  const users = store.users || {};
  const userEmails = Object.keys(users);
  const messages = Array.isArray(store.messages) ? store.messages : [];
  const notifications = Array.isArray(store.notifications) ? store.notifications : [];
  const conversations = new Set(
    messages
      .map((m) => normalizeEmail(m.conversationEmail || m.toEmail || ""))
      .filter(Boolean),
  );
  const recovery = store.systemRecovery && typeof store.systemRecovery === "object"
    ? store.systemRecovery
    : {};
  const sparse = userEmails.length > 0 && userEmails.length <= 5;
  return {
    database: {
      provider: DATABASE_PROVIDER,
      ready: databaseReady,
      lastError: lastPostgresError || "",
      usingPostgres: usePostgresStore(),
    },
    counts: {
      users: userEmails.length,
      activeUsers: userEmails.filter((email) => {
        const status = String(users[email]?.accountStatus || "Active").toLowerCase();
        return status !== "disabled" && status !== "deleted";
      }).length,
      messages: messages.length,
      conversations: conversations.size,
      notifications: notifications.length,
      foundingMembers: Array.isArray(store.foundingMembers) ? store.foundingMembers.length : 0,
      supportTickets: Array.isArray(store.supportTickets) ? store.supportTickets.length : 0,
    },
    sampleUsers: userEmails.slice(0, 12),
    sparseStoreSuspected: sparse,
    recovery,
    note: sparse
      ? "User directory looks sparse (≤5 users). Run Stripe sparse-store recovery to rebuild paid accounts from Stripe."
      : "User directory does not look sparse.",
  };
}

/**
 * One-shot recovery after the 2026-07-16 temp-password Postgres wipe race:
 * if the live store has only a handful of users but Stripe has many customers,
 * recreate missing users from Stripe. Does not invent free-only accounts that
 * never touched Stripe; those return on next login via profile sync.
 */
async function recoverSparseStoreFromStripeIfNeeded({ force = false, source = "boot" } = {}) {
  if (!databaseReady || !usePostgresStore()) {
    return { ran: false, reason: "postgres_not_ready" };
  }
  if (!isConfiguredValue(STRIPE_SECRET_KEY)) {
    return { ran: false, reason: "stripe_not_configured" };
  }
  const store = peekStore();
  store.systemRecovery = store.systemRecovery && typeof store.systemRecovery === "object"
    ? store.systemRecovery
    : {};
  if (store.systemRecovery.sparseStripeBackfillAt && !force) {
    return {
      ran: false,
      reason: "already_recovered",
      recoveredAt: store.systemRecovery.sparseStripeBackfillAt,
      userCount: Object.keys(store.users || {}).length,
    };
  }
  const userCount = Object.keys(store.users || {}).length;
  if (!force && userCount > 5) {
    return { ran: false, reason: "not_sparse", userCount };
  }

  console.warn(`[store-recovery] sparse store detected (${userCount} users). Starting Stripe rebuild (source=${source}).`);
  // Peek Stripe first so a brand-new empty install with zero customers is left alone.
  const preview = await backfillLegacyStripeUsers({ dryRun: true });
  if (!force && preview.stripeCustomersFound <= Math.max(userCount, 2)) {
    return {
      ran: false,
      reason: "stripe_not_larger",
      userCount,
      stripeCustomersFound: preview.stripeCustomersFound,
    };
  }
  const report = await backfillLegacyStripeUsers({ dryRun: false });
  const afterCount = Object.keys(peekStore().users || {}).length;
  const recoveryStore = readStore();
  recoveryStore.systemRecovery = {
    ...(recoveryStore.systemRecovery || {}),
    sparseStripeBackfillAt: new Date().toISOString(),
    sparseStripeBackfillSource: source,
    userCountBefore: report.userCountBefore,
    userCountAfter: afterCount,
    stripeCustomersFound: report.stripeCustomersFound,
    usersCreatedFromStripeRecords: report.usersCreatedFromStripeRecords,
    foundingMembersRestored: report.foundingMembersRestored,
  };
  await writeStoreAsync(recoveryStore);
  console.warn(`[store-recovery] complete: ${report.userCountBefore} → ${afterCount} users (created ${report.usersCreatedFromStripeRecords} from Stripe).`);
  return {
    ran: true,
    reason: "recovered",
    report,
    userCountBefore: report.userCountBefore,
    userCountAfter: afterCount,
  };
}

function paidStripeSubscription(subscription) {
  return ["active", "trialing"].includes(String(subscription?.status || "").toLowerCase());
}

function storedSubscriptionActive(subscription) {
  return membershipAccess.membershipHasProAccess(subscription);
}

function resolvedPlanForUser(user) {
  if (!membershipAccess.membershipHasProAccess(user)) return "Free";
  if (membershipAccess.membershipFoundingActive(user)) return "Founding";
  return ["Pro", "Founding"].includes(user.plan) ? user.plan : "Pro";
}

function membershipUserInTrial(user) {
  return membershipAccess.membershipUserInTrial(user);
}

function membershipUserIsFounding(user) {
  return membershipAccess.membershipFoundingActive(user);
}

function membershipHasProAccess(user, storeRef = null) {
  if (membershipAccess.membershipHasProAccess(user)) return true;
  // Directors/staff inherit the program owner's paid/Founding access.
  if (!user?.programAccessViaOwner) return false;
  const ownerEmail = normalizeEmail(user.linkedProgramOwnerEmail || "");
  if (!ownerEmail) return false;
  const store = storeRef || peekStore();
  const owner = store?.users?.[ownerEmail];
  return membershipAccess.membershipHasProAccess(owner || {});
}

function membershipCurrentAccessKeyResolved(user, storeRef = null) {
  const own = membershipAccess.membershipCurrentAccessKey(user);
  if (own && own !== "free") return own;
  if (!user?.programAccessViaOwner) return own || "free";
  const ownerEmail = normalizeEmail(user.linkedProgramOwnerEmail || "");
  if (!ownerEmail) return own || "free";
  const store = storeRef || peekStore();
  const owner = store?.users?.[ownerEmail];
  return membershipAccess.membershipCurrentAccessKey(owner || user) || "free";
}

function membershipPlanDisplay(user) {
  return membershipAccess.membershipPlanDisplay(user);
}

function membershipStatusDisplay(user) {
  return membershipAccess.membershipStatusDisplay(user);
}

async function maybeSendBillingLifecycleEmails(email, previousUser, nextUser) {
  if (!email || !nextUser) return;
  const before = membershipAccess.membershipProductStatus(previousUser || {});
  const after = membershipAccess.membershipProductStatus(nextUser);
  const updates = {};

  if (after.hasProAccess && (previousUser?.lastAccessExpiredEmailAt || previousUser?.lastPaymentFailedEmailAt)) {
    if (previousUser?.lastAccessExpiredEmailAt) updates.lastAccessExpiredEmailAt = "";
    if (after.banner !== "payment_failed" && previousUser?.lastPaymentFailedEmailAt) {
      // Keep payment-failed cooldown until recovered fully; clear when access restored.
      updates.lastPaymentFailedEmailAt = "";
    }
  }

  if (after.banner === "payment_failed" && before.banner !== "payment_failed") {
    const result = await billingLifecycleEmail.sendPaymentFailedUserEmail({
      user: nextUser,
      email,
      sendEmail,
    });
    if (result.sent) {
      updates.lastPaymentFailedEmailAt = new Date().toISOString();
      console.log(`[billing-email] payment_failed sent to ${email}`);
    } else if (result.error) {
      console.warn(`[billing-email] payment_failed failed for ${email}:`, result.error);
    }
  }

  if (
    after.banner === "access_lost"
    && before.hasProAccess
    && !after.hasProAccess
  ) {
    const result = await billingLifecycleEmail.sendAccessExpiredUserEmail({
      user: nextUser,
      email,
      sendEmail,
    });
    if (result.sent) {
      updates.lastAccessExpiredEmailAt = new Date().toISOString();
      console.log(`[billing-email] access_expired sent to ${email}`);
    } else if (result.error) {
      console.warn(`[billing-email] access_expired failed for ${email}:`, result.error);
    }
  }

  if (Object.keys(updates).length) {
    try { upsertUser(email, updates); } catch (error) {
      console.warn(`[billing-email] could not persist email markers for ${email}:`, error.message || error);
    }
  }
}

function membershipSummaryForUser(user, storeRef = null) {
  // NEVER call readStore() here — analytics maps this over every user and a full
  // structuredClone per user OOMs the Render starter plan (512MB).
  const store = storeRef || peekStore();
  const audits = (store.membershipAudit || []).filter((entry) => entry.email === user?.email).slice(0, 5);
  const endMs = membershipAccess.accessEndMs(user);
  const access = accountAccess.summarizeAccountAccess(user || {});
  const ownerEmail = normalizeEmail(user?.linkedProgramOwnerEmail || "");
  const owner = ownerEmail ? (store?.users?.[ownerEmail] || null) : null;
  const ownPro = membershipAccess.membershipHasProAccess(user);
  const inheritedPro = !ownPro && Boolean(user?.programAccessViaOwner) && membershipAccess.membershipHasProAccess(owner || {});
  const hasPro = ownPro || inheritedPro;
  const currentAccess = inheritedPro
    ? membershipAccess.membershipCurrentAccessKey(owner)
    : membershipCurrentAccessKeyResolved(user, store);
  return {
    accountType: access.accountType,
    role: access.role,
    capabilities: access.capabilities,
    membershipPlan: inheritedPro
      ? membershipAccess.membershipPlanDisplay(owner)
      : membershipPlanDisplay(user),
    membershipStatus: membershipStatusDisplay(user),
    productStatus: membershipAccess.membershipProductStatus(user),
    currentAccess,
    billingStatus: membershipAccess.membershipBillingStatusKey(user),
    adminAuditKey: membershipAccess.membershipAdminAuditKey(user),
    previousPlan: membershipAccess.membershipPreviousPlanDisplay(user),
    hasProAccess: hasPro,
    accessInheritedFromOwner: inheritedPro ? ownerEmail : "",
    foundingMemberHistorical: membershipAccess.membershipFoundingHistorical(user),
    foundingMemberActive: membershipAccess.membershipFoundingActive(user),
    foundingEligibilityLabel: membershipAccess.membershipFoundingActive(user)
      ? "Active Founding Member"
      : membershipAccess.membershipFoundingHistorical(user)
        ? "Historical Founding Member (no auto $9.99)"
        : "Not a Founding Member",
    foundingPriceLock: user?.foundingMemberActive ? (user?.priceLock || "Lifetime") : "",
    displayPrice: hasPro
      ? (inheritedPro
        ? (membershipAccess.membershipFoundingActive(owner) ? "$9.99/month" : (owner?.subscriptionCadence === "annual" ? "$199/year" : "$19.99/month"))
        : (membershipUserIsFounding(user) ? "$9.99/month" : user?.subscriptionCadence === "annual" ? "$199/year" : "$19.99/month"))
      : "$0/month",
    subscriptionStartedAt: user?.subscriptionStartedAt || "",
    trialStart: user?.trialStart || "",
    trialEnd: user?.trialEnd || "",
    currentPeriodEnd: user?.currentPeriodEnd || "",
    accessEndsAt: user?.accessEndsAt || "",
    nextRenewalDate: user?.cancelAtPeriodEnd ? "" : (user?.currentPeriodEnd || ""),
    cancelAtPeriodEnd: Boolean(user?.cancelAtPeriodEnd),
    scheduledCancellation: Boolean(user?.cancelAtPeriodEnd),
    accessEndLabel: endMs ? new Date(endMs).toLocaleDateString() : "",
    canceledAt: !hasPro && String(user?.subscriptionStatus || "").toLowerCase().includes("ended")
      ? (user?.accessEndsAt || user?.updatedAt || "")
      : "",
    subscriptionEndedAt: user?.subscriptionEndedAt || "",
    lastSuccessfulPaymentAt: user?.lastSuccessfulPaymentAt || "",
    lastFailedPaymentAt: user?.lastFailedPaymentAt || "",
    nextPaymentRetryAt: user?.nextPaymentRetryAt || "",
    hasPaymentMethod: typeof user?.hasPaymentMethod === "boolean" ? user.hasPaymentMethod : null,
    willTrialConvertToPaid: membershipUserInTrial(user) ? !user?.cancelAtPeriodEnd : null,
    mustChangePassword: Boolean(user?.mustChangePassword),
    serverPasswordAuth: Boolean(user?.serverPasswordAuth),
    tempPasswordExpiresAt: user?.tempPasswordExpiresAt || "",
    programId: user?.programId || "",
    linkedProgramOwnerEmail: ownerEmail,
    programAccessViaOwner: Boolean(user?.programAccessViaOwner),
    accessSource: inheritedPro
      ? "Program owner access (Director/staff)"
      : user?.internalAccessOverride && !user?.stripeSubscriptionId
        ? "Manual admin grant"
        : user?.promoRedeemedAt && membershipUserInTrial(user)
          ? "Promo trial"
          : membershipAccess.membershipFoundingActive(user)
            ? "Founding subscription"
            : user?.stripeSubscriptionId
              ? "Stripe subscription"
              : user?.manualAccessGranted
                ? "Previous manual admin grant"
                : "Free account",
    lastMembershipSyncAt: user?.lastStripeSyncAt || user?.updatedAt || "",
    lastStripeSyncAt: user?.lastStripeSyncAt || user?.updatedAt || "",
    stripeSubscriptionStatus: user?.stripeSubscriptionStatus || "",
    stripeCustomerRef: user?.stripeCustomerId ? `cus_…${String(user.stripeCustomerId).slice(-6)}` : "",
    stripeCustomerId: user?.stripeCustomerId || "",
    stripeSubscriptionId: user?.stripeSubscriptionId || "",
    internalAccessOverride: Boolean(user?.internalAccessOverride),
    membershipAuditRecent: audits,
  };
}

function upsertStripeSubscription(email, customerId, subscription) {
  const cleanEmail = normalizeEmail(email);
  const store = readStore();
  const user = store.users?.[cleanEmail] || {};
  const updates = membershipUpdatesFromStripeSubscription(subscription, user, "updated");
  if (updates.foundingMemberActive && !user.foundingMemberNumber) {
    const claim = claimFoundingSpot(cleanEmail);
    updates.foundingMemberNumber = claim.foundingMemberNumber;
  } else if (user.foundingMemberNumber) {
    updates.foundingMemberNumber = user.foundingMemberNumber;
  }
  // Stamp a watermark so a later stale subscription.updated webhook cannot overwrite
  // fresher checkout/live-sync data when lastStripeEventCreatedAt was previously 0.
  const watermark = Math.max(
    Number(user.lastStripeEventCreatedAt || 0),
    Number(subscription?.created || 0),
    Math.floor(Date.now() / 1000),
  );
  return upsertUser(cleanEmail, {
    ...updates,
    stripeCustomerId: customerId || subscription.customer || user.stripeCustomerId || "",
    subscriptionStartedAt: user.subscriptionStartedAt || new Date().toISOString(),
    paymentMethod: "Managed in Stripe",
    pendingPlan: "",
    lastStripeEventCreatedAt: watermark,
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
    const userEntry = findUserEntryByStripeCustomer(
      store,
      session.customer,
      session.customer_details?.email || session.customer_email || session.metadata?.email,
    );
    const email = normalizeEmail(session.metadata?.email || session.customer_details?.email || session.customer_email || userEntry?.[0]);
    const planKey = session.metadata?.plan || userEntry?.[1]?.pendingPlan || "monthly";
    const promoCode = normalizePromoCode(session.metadata?.promoCode || userEntry?.[1]?.pendingPromoCode || "");
    const promoTrialDays = Number(session.metadata?.promoTrialDays || userEntry?.[1]?.pendingTrialDays || 0);
    const promoLabel = session.metadata?.promoLabel || userEntry?.[1]?.pendingPromoLabel || "";
    const paid = session.payment_status === "paid" || session.status === "complete";
    let upgradedUser = null;
    if (paid && email) {
      upgradedUser = applyCheckoutMembershipUpgrade(email, {
        planKey,
        customerId: session.customer,
        subscriptionId: session.subscription,
        promoCode,
        promoTrialDays,
        promoLabel,
        sessionId: session.id,
        source: "checkout_status",
      });
      // Prefer live Stripe subscription fields when available so period end is exact.
      if (session.subscription && typeof session.subscription === "string") {
        try {
          const liveSub = await stripeGet(`subscriptions/${encodeURIComponent(session.subscription)}`);
          if (liveSub?.id) {
            upgradedUser = upsertStripeSubscription(email, session.customer, liveSub);
            logMembershipTransition("membership_synced_from_subscription", email, {
              plan: upgradedUser.plan,
              subscriptionStatus: upgradedUser.subscriptionStatus,
              hasProAccess: membershipHasProAccess(upgradedUser),
              extra: { source: "checkout_status" },
            });
          }
        } catch (syncError) {
          console.warn(`[membership] checkout_status subscription sync failed email=${email}:`, syncError.message);
        }
      }
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
      membership: upgradedUser ? membershipSummaryForUser(upgradedUser) : null,
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
    console.warn("[membership] webhook_signature_invalid");
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

  if (event?.id && hasProcessedStripeEvent(event.id)) {
    console.log(`[membership] webhook_duplicate event=${event.id} type=${event.type}`);
    jsonResponse(response, 200, { received: true, duplicate: true });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const store = readStore();
      const userEntry = findUserEntryByStripeCustomer(
        store,
        session.customer,
        session.metadata?.email || session.customer_details?.email || session.customer_email,
      );
      const email = normalizeEmail(session.metadata?.email || session.customer_details?.email || session.customer_email || userEntry?.[0]);
      const planKey = session.metadata?.plan || userEntry?.[1]?.pendingPlan || "monthly";
      const promoCode = normalizePromoCode(session.metadata?.promoCode || userEntry?.[1]?.pendingPromoCode || "");
      const promoTrialDays = Number(session.metadata?.promoTrialDays || userEntry?.[1]?.pendingTrialDays || 0);
      const promoLabel = session.metadata?.promoLabel || userEntry?.[1]?.pendingPromoLabel || "";
      if (email) {
        applyCheckoutMembershipUpgrade(email, {
          planKey,
          customerId: session.customer,
          subscriptionId: session.subscription,
          promoCode,
          promoTrialDays,
          promoLabel,
          sessionId: session.id,
          source: "webhook_checkout.session.completed",
        });
        if (session.subscription && typeof session.subscription === "string") {
          try {
            const liveSub = await stripeGet(`subscriptions/${encodeURIComponent(session.subscription)}`);
            if (liveSub?.id) {
              const synced = upsertStripeSubscription(email, session.customer, liveSub);
              logMembershipTransition("permissions_updated", email, {
                plan: synced.plan,
                membershipStatus: membershipStatusDisplay(synced),
                hasProAccess: membershipHasProAccess(synced),
                extra: { source: "webhook_checkout_subscription_sync" },
              });
            }
          } catch (syncError) {
            console.warn(`[membership] webhook checkout subscription sync failed email=${email}:`, syncError.message);
          }
        }
      } else {
        console.warn("[membership] webhook checkout.session.completed missing email", session.id);
      }
    }

    if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const store = readStore();
      const userEntry = findUserEntryByStripeCustomer(
        store,
        subscription.customer,
        subscription.metadata?.email,
      );
      if (userEntry) {
        const [email, user] = userEntry;
        const eventType = event.type === "customer.subscription.deleted" ? "deleted" : "updated";
        const eventCreated = Number(event.created || 0);
        const lastEventCreated = Number(user.lastStripeEventCreatedAt || 0);
        if (eventCreated && lastEventCreated && eventCreated < lastEventCreated) {
          console.warn(`[membership] webhook_stale_ignored event=${event.id} email=${email} created=${eventCreated} last=${lastEventCreated}`);
          if (event?.id) markProcessedStripeEvent(event.id);
          jsonResponse(response, 200, { received: true, stale: true });
          return;
        }
        const updates = membershipUpdatesFromStripeSubscription(subscription, user, eventType);
        if (updates.cancelAtPeriodEnd && shouldReleaseFoundingSpotOnCancel(user)) {
          releaseFoundingSpot(email, "canceled_before_first_payment");
          updates.foundingMemberActive = false;
          updates.foundingMemberHistorical = false;
          updates.foundingMember = false;
          updates.foundingMemberNumber = null;
          updates.foundingSpotReleasable = false;
          updates.foundingSpotReleasedAt = new Date().toISOString();
          updates.priceLock = "";
        } else if (updates.foundingMemberActive && !user.foundingMemberNumber) {
          const claim = claimFoundingSpot(email);
          updates.foundingMemberNumber = claim.foundingMemberNumber;
          updates.foundingMemberHistorical = true;
          updates.foundingMember = true;
        } else if (user.foundingMemberNumber && !updates.foundingSpotReleasedAt) {
          updates.foundingMemberNumber = user.foundingMemberNumber;
          updates.foundingMemberHistorical = true;
          updates.foundingMember = true;
        }
        if (eventType === "deleted" && shouldReleaseFoundingSpotOnCancel(user)) {
          releaseFoundingSpot(email, "subscription_deleted_before_first_payment");
          updates.foundingMemberActive = false;
          updates.foundingMemberHistorical = false;
          updates.foundingMember = false;
          updates.foundingMemberNumber = null;
          updates.foundingSpotReleasedAt = new Date().toISOString();
        }
        const saved = upsertUser(email, {
          ...updates,
          lastStripeEventCreatedAt: eventCreated || lastEventCreated,
          lastStripeEventId: event.id || user.lastStripeEventId || "",
          paymentMethod: updates.plan === "Free" ? user.paymentMethod || "Managed in Stripe" : "Managed in Stripe",
          pendingPlan: "",
        });
        logMembershipTransition("membership_assigned", email, {
          plan: saved.plan,
          subscriptionStatus: saved.subscriptionStatus,
          hasProAccess: membershipHasProAccess(saved),
          extra: { source: event.type, stripeStatus: subscription.status },
        });
        await maybeSendBillingLifecycleEmails(email, user, saved);
        const subscriptionPromoCode = normalizePromoCode(subscription.metadata?.promoCode || user.pendingPromoCode || "");
        if (membershipAccess.membershipHasProAccess({ ...user, ...updates }) && subscriptionPromoCode) {
          markPromoRedeemed(email, subscriptionPromoCode, {
            label: subscription.metadata?.promoLabel || user.pendingPromoLabel || "",
            trialDays: Number(subscription.metadata?.promoTrialDays || user.pendingTrialDays || 0),
            stripeSubscriptionId: subscription.id,
          });
        }
        if (!membershipAccess.membershipHasProAccess({ ...user, ...updates })) {
          appendBillingEvent(email, "subscription_canceled", planKeyFromStripe(subscription, user), "$0");
          const cancelStore = readStore();
          await emitAdminAlertSafe(cancelStore, {
            category: "billing",
            type: "admin_subscription_canceled",
            title: "Subscription canceled / ended",
            preview: `${email} · ${saved.subscriptionStatus || "ended"}`,
            email,
            refId: subscription.id || `cancel:${email}`,
            sendEmail: true,
            emailKind: "Billing",
          });
          try { writeStore(cancelStore); } catch { /* ignore */ }
        } else if (updates.cancelAtPeriodEnd && !user.cancelAtPeriodEnd) {
          const cancelStore = readStore();
          await emitAdminAlertSafe(cancelStore, {
            category: "billing",
            type: "admin_subscription_canceling",
            title: "Subscription set to cancel at period end",
            preview: `${email} · access until ${saved.accessEndsAt || saved.currentPeriodEnd || "period end"}`,
            email,
            refId: `canceling:${subscription.id || email}`,
            sendEmail: false,
          });
          try { writeStore(cancelStore); } catch { /* ignore */ }
        }
      } else {
        console.warn(`[membership] webhook ${event.type} unmatched customer=${subscription.customer}`);
      }
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const store = readStore();
      const userEntry = findUserEntryByStripeCustomer(store, invoice.customer, invoice.customer_email);
      if (userEntry?.[0] && invoice.subscription) {
        try {
          const liveSub = await stripeGet(`subscriptions/${encodeURIComponent(invoice.subscription)}`);
          if (liveSub?.id) {
            const synced = upsertStripeSubscription(userEntry[0], invoice.customer, liveSub);
            const amountPaid = Number(invoice.amount_paid || 0);
            const paidUpdates = {
              lastFailedPaymentAt: "",
              nextPaymentRetryAt: "",
              hasPaymentMethod: Boolean(invoice.payment_intent || invoice.default_payment_method || synced.hasPaymentMethod || amountPaid > 0),
              lastStripeEventCreatedAt: Math.max(Number(synced.lastStripeEventCreatedAt || 0), Number(event.created || 0)),
              lastStripeEventId: event.id || synced.lastStripeEventId || "",
            };
            // $0 trial invoices must not mark the first paid cycle complete.
            if (amountPaid > 0) {
              const paidAt = new Date(Number(invoice.created || event.created || Date.now() / 1000) * 1000).toISOString();
              paidUpdates.lastSuccessfulPaymentAt = paidAt;
              paidUpdates.firstPaidInvoiceAt = store.users?.[userEntry[0]]?.firstPaidInvoiceAt || paidAt;
              paidUpdates.foundingSpotReleasable = false;
              markFoundingReservationConverted(userEntry[0]);
            }
            upsertUser(userEntry[0], paidUpdates);
            logMembershipTransition("payment_received", userEntry[0], {
              plan: synced.plan,
              subscriptionStatus: synced.subscriptionStatus,
              hasProAccess: membershipHasProAccess(synced),
              extra: { source: event.type, invoiceId: invoice.id, amountPaid },
            });
            // Renewal / successful invoice — skip noisy first checkout duplicates via refId window.
            const billingReason = String(invoice.billing_reason || "");
            if (amountPaid > 0 && (billingReason === "subscription_cycle" || billingReason === "subscription_update")) {
              const renewStore = readStore();
              await emitAdminAlertSafe(renewStore, {
                category: "billing",
                type: "admin_subscription_renewed",
                title: "Subscription renewed",
                preview: `${userEntry[0]} · ${synced.plan || "Paid"}`,
                email: userEntry[0],
                refId: invoice.id || `renew:${userEntry[0]}`,
                sendEmail: false,
              });
              try { writeStore(renewStore); } catch { /* ignore */ }
            }
          }
        } catch (syncError) {
          console.warn(`[membership] invoice paid sync failed email=${userEntry[0]}:`, syncError.message);
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const store = readStore();
      const userEntry = findUserEntryByStripeCustomer(store, invoice.customer, invoice.customer_email);
      if (userEntry) {
        const [email, existing] = userEntry;
        const eventCreated = Number(event.created || 0);
        const lastEventCreated = Number(existing.lastStripeEventCreatedAt || 0);
        if (eventCreated && lastEventCreated && eventCreated < lastEventCreated) {
          console.warn(`[membership] webhook_stale_ignored event=${event.id} email=${email} created=${eventCreated} last=${lastEventCreated}`);
          if (event?.id) markProcessedStripeEvent(event.id);
          jsonResponse(response, 200, { received: true, stale: true });
          return;
        }
        const wasFounding = Boolean(existing?.foundingMemberHistorical || existing?.foundingMember || existing?.foundingMemberActive || existing?.plan === "Founding");
        const updated = upsertUser(email, {
          plan: "Free",
          subscriptionStatus: "Payment Failed — Access Locked",
          stripeSubscriptionStatus: "unpaid",
          monthlyPrice: "$0/month",
          foundingMemberActive: false,
          foundingMemberHistorical: wasFounding,
          foundingMember: wasFounding,
          foundingMemberNumber: existing?.foundingMemberNumber || null,
          priceLock: wasFounding ? "Lifetime" : "",
          previousPlan: wasFounding ? "Founding Member" : (existing?.previousPlan || "Pro"),
          lastStripeSyncAt: new Date().toISOString(),
          lastFailedPaymentAt: new Date(Number(invoice.created || event.created || Date.now() / 1000) * 1000).toISOString(),
          nextPaymentRetryAt: invoice.next_payment_attempt
            ? new Date(Number(invoice.next_payment_attempt) * 1000).toISOString()
            : "",
          lastStripeEventCreatedAt: eventCreated || lastEventCreated,
          lastStripeEventId: event.id || existing.lastStripeEventId || "",
        });
        appendMembershipLifecycleAudit(email, "payment_failed", {
          note: "Payment failed — Pro access revoked until Stripe recovers",
          updates: { stripeSubscriptionStatus: "unpaid", invoiceId: invoice.id },
        });
        logMembershipTransition("payment_failed", email, {
          plan: updated.plan,
          subscriptionStatus: updated.subscriptionStatus,
          hasProAccess: false,
          extra: { invoiceId: invoice.id },
        });
        await maybeSendBillingLifecycleEmails(email, existing, updated);
        const alertStore = readStore();
        await emitAdminAlertSafe(alertStore, {
          category: "billing",
          type: "admin_payment_failed",
          title: "Payment failed",
          preview: `${email} — Pro access locked until payment recovers`,
          email,
          refId: invoice.id || `payfail:${email}`,
          sendEmail: true,
          emailKind: "Billing",
          emailFields: [["Invoice", invoice.id || ""]],
        });
        try { writeStore(alertStore); } catch { /* ignore */ }
      }
    }

    if (event?.id) markProcessedStripeEvent(event.id);
    jsonResponse(response, 200, { received: true });
  } catch (error) {
    // Return 500 so Stripe retries failed webhook processing.
    console.error(`[membership] webhook_processing_failed type=${event?.type}:`, error.message || error);
    jsonResponse(response, 500, { error: error.message || "Webhook processing failed." });
  }
}

async function handleAiGenerate(request, response) {
  if (aiCallsAreDisabled()) {
    jsonResponse(response, 403, {
      error: "AI features are disabled in this testing/preview environment.",
      code: "ai_calls_disabled",
      previewSafeMode: isDirectorCenterPreviewSafeMode(),
    });
    return;
  }
  const body = await readJson(request);
  const email = normalizeEmail(body.email || "guest");
  const store = readStore();
  const user = store.users?.[email] || null;
  const plan = resolvedPlanForUser(user);
  const tool = String(body.tool || "unknown");
  console.log(`[access] ai-generate email=${email} tool=${tool} storedPlan=${user?.plan || "none"} resolvedPlan=${plan} status=${user?.subscriptionStatus || "none"}`);
  const lessonTools = new Set(["lesson", "lesson-plan", "lesson_plan"]);
  if (lessonTools.has(tool) && !membershipHasProAccess(user || {})) {
    jsonResponse(response, 403, {
      error: "Generate custom lesson plans in seconds. Available with Pro Membership. Start Your 7-Day Free Trial. Card required. Cancel anytime.",
      code: "pro_required",
      tool,
    });
    return;
  }
  const usage = canUseServerAi(email, plan);
  if (!usage.allowed) {
    jsonResponse(response, 429, { error: `Monthly helper limit reached. ${usage.used} of ${usage.limit} documents created this month.`, used: usage.used, limit: usage.limit });
    return;
  }
  const startTime = Date.now();
  try {
    const aiResult = await generateOpenAiContent(body);
    const responseTimeMs = Date.now() - startTime;
    const inputTokens = aiResult.inputTokens ?? null;
    const outputTokens = aiResult.outputTokens ?? null;
    const recorded = recordServerAiUse(email, plan, aiResult.output, { tool, responseTimeMs, inputTokens, outputTokens, success: true });
    jsonResponse(response, 200, {
      output: aiResult.output,
      model: aiResult.model,
      debug: aiResult.debug,
      ...recorded,
      resetCycle: currentAiCycle(),
    });
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    console.error(`[helper-generate-failure] email=${email} tool=${tool} plan=${plan} error=${error.message || "unknown"}`);
    // Log failed generations to aiUsageLogs without incrementing the monthly counter
    try {
      const failStore = readStore();
      failStore.aiUsageLogs = failStore.aiUsageLogs || [];
      failStore.aiUsageLogs.unshift({
        id: `ai_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`,
        tool,
        email,
        plan,
        responseTimeMs,
        success: false,
        errorMessage: String(error.message || "unknown").slice(0, 500),
        inputTokens: null,
        outputTokens: null,
        createdAt: new Date().toISOString(),
      });
      failStore.aiUsageLogs = failStore.aiUsageLogs.slice(0, 5000);
      writeStore(failStore);
    } catch (err) { console.warn("[ai-fail-log] Could not write failure to aiUsageLogs:", err.message); }
    if (error.toolDisabled) {
      jsonResponse(response, 503, { error: error.message });
      return;
    }
    jsonResponse(response, 503, { error: error.message || "We couldn't create your document right now. Please try again." });
  }
}

function scheduleSubscriptionCancelLocal(user) {
  const inTrial = membershipUserInTrial(user);
  const periodEndIso = user.accessEndsAt || user.currentPeriodEnd || user.trialEnd
    || new Date(Date.now() + 30 * 86400000).toISOString();
  const endMs = new Date(periodEndIso).getTime();
  const endLabel = Number.isFinite(endMs) ? new Date(endMs).toLocaleDateString() : "period end";
  return {
    cancelAtPeriodEnd: true,
    accessEndsAt: periodEndIso,
    currentPeriodEnd: user.currentPeriodEnd || periodEndIso,
    subscriptionStatus: inTrial
      ? `Canceled — Access Ends ${endLabel} (Trial — no future charge)`
      : `Canceled — Access Ends ${endLabel}`,
    lastStripeSyncAt: new Date().toISOString(),
  };
}

async function handleCancelSubscription(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    jsonResponse(response, 400, { error: "email is required." });
    return;
  }
  const store = readStore();
  const user = store.users?.[email];
  if (!user) {
    jsonResponse(response, 404, { error: "User not found." });
    return;
  }
  if (!membershipHasProAccess(user)) {
    jsonResponse(response, 400, { error: "No active paid subscription to cancel." });
    return;
  }
  const releaseFounding = shouldReleaseFoundingSpotOnCancel(user);
  const inFreeMonth = userNeverCompletedPaidCycle(user);
  try {
    let subscription;
    if (user.stripeSubscriptionId && isConfiguredValue(STRIPE_SECRET_KEY)) {
      const stripeSub = await stripeRequest(`subscriptions/${user.stripeSubscriptionId}`, {
        cancel_at_period_end: "true",
      });
      const updates = membershipUpdatesFromStripeSubscription(stripeSub, user, "updated");
      if (releaseFounding) {
        releaseFoundingSpot(email, "canceled_before_first_payment");
        Object.assign(updates, {
          foundingMemberActive: false,
          foundingMemberHistorical: false,
          foundingMember: false,
          foundingMemberNumber: null,
          foundingSpotReleasable: false,
          foundingSpotReleasedAt: new Date().toISOString(),
          priceLock: "",
        });
      } else if (user.foundingMemberNumber) {
        updates.foundingMemberNumber = user.foundingMemberNumber;
        updates.foundingMemberHistorical = true;
        updates.foundingMember = true;
      }
      subscription = upsertUser(email, updates);
    } else {
      const localUpdates = scheduleSubscriptionCancelLocal(user);
      if (releaseFounding) {
        releaseFoundingSpot(email, "canceled_before_first_payment");
        Object.assign(localUpdates, {
          foundingMemberActive: false,
          foundingMemberHistorical: false,
          foundingMember: false,
          foundingMemberNumber: null,
          foundingSpotReleasable: false,
          foundingSpotReleasedAt: new Date().toISOString(),
          priceLock: "",
        });
      }
      subscription = upsertUser(email, localUpdates);
    }
    appendBillingEvent(email, "subscription_cancel_scheduled", resolvedPlanForUser(user), user.monthlyPrice || "");
    appendMembershipLifecycleAudit(email, "subscription_cancel_scheduled", {
      note: releaseFounding
        ? "Canceled during free month — Founding spot released; no charge"
        : inFreeMonth
          ? "Canceled during free/trial period — access through period end; no future charge"
          : "Canceled at period end — access continues until accessEndsAt",
      updates: {
        cancelAtPeriodEnd: true,
        accessEndsAt: subscription.accessEndsAt,
        foundingSpotReleased: releaseFounding,
      },
    });
    let cancelEmail = { sent: false, skipped: "not_attempted" };
    try {
      cancelEmail = await billingLifecycleEmail.sendCancellationUserEmail({
        user: subscription,
        email,
        sendEmail,
        inFreeMonth,
        foundingReleased: releaseFounding,
        wasFounding: Boolean(user.foundingMemberActive || user.plan === "Founding"),
      });
      if (cancelEmail.sent) {
        upsertUser(email, { lastCancellationEmailAt: new Date().toISOString() });
      }
    } catch (emailError) {
      console.warn("[email] Cancellation confirmation failed:", emailError.message);
      cancelEmail = { sent: false, error: emailError.message };
    }
    jsonResponse(response, 200, {
      ok: true,
      subscription: { ...subscription, ...membershipSummaryForUser(subscription) },
      foundingSpotReleased: releaseFounding,
      inFreeMonth,
      cancelEmail,
    });
  } catch (error) {
    jsonResponse(response, 500, { error: error.message || "Could not cancel subscription." });
  }
}

async function syncUserMembershipFromStripe(email, { force = false, reason = "subscription_status" } = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { subscription: null, recoveredFromStripe: false };
  const store = readStore();
  let subscription = store.users?.[cleanEmail] || null;
  let recoveredFromStripe = false;
  const shouldQueryStripe = force
    || !storedSubscriptionActive(subscription)
    || subscriptionNeedsStripeRepair(subscription);
  if (shouldQueryStripe && isConfiguredValue(STRIPE_SECRET_KEY)) {
    try {
      const stripeMatch = await findStripeSubscriptionByEmail(cleanEmail);
      if (stripeMatch?.subscription) {
        subscription = upsertStripeSubscription(cleanEmail, stripeMatch.customerId, stripeMatch.subscription);
        recoveredFromStripe = true;
        logMembershipTransition("membership_assigned", cleanEmail, {
          plan: subscription.plan,
          subscriptionStatus: subscription.subscriptionStatus,
          hasProAccess: membershipHasProAccess(subscription),
          extra: { source: reason, force, recoveredFromStripe: true },
        });
      } else if (force) {
        logMembershipTransition("stripe_refresh_no_active_subscription", cleanEmail, {
          plan: subscription?.plan || "Free",
          subscriptionStatus: subscription?.subscriptionStatus || "",
          extra: { source: reason },
        });
      }
    } catch (error) {
      console.warn(`[membership] Could not sync Stripe subscription for ${cleanEmail}:`, error.message);
      if (force) throw error;
    }
  }
  if (subscription && membershipAccess.membershipFoundingActive(subscription)) {
    const repaired = repairFoundingMemberPricing(subscription);
    if (repaired.monthlyPrice !== subscription.monthlyPrice || repaired.plan !== subscription.plan) {
      subscription = upsertUser(cleanEmail, repaired);
    } else {
      subscription = repaired;
    }
  }
  if (subscription) {
    logMembershipTransition("permissions_updated", cleanEmail, {
      plan: subscription.plan,
      membershipStatus: membershipStatusDisplay(subscription),
      hasProAccess: membershipHasProAccess(subscription),
      extra: { source: reason, recoveredFromStripe },
    });
  }
  return { subscription, recoveredFromStripe };
}

async function handleSubscriptionStatus(request, response, url) {
  const email = normalizeEmail(url.searchParams.get("email"));
  const forceRefresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("force") === "1";
  try {
    const { subscription, recoveredFromStripe } = await syncUserMembershipFromStripe(email, {
      force: forceRefresh,
      reason: forceRefresh ? "subscription_status_force_refresh" : "subscription_status",
    });
    jsonResponse(response, 200, {
      email,
      subscription: subscription ? { ...subscription, ...membershipSummaryForUser(subscription) } : null,
      recoveredFromStripe,
      aiUsage: email ? canUseServerAi(email, subscription?.plan || "Free") : null,
      founding: foundingStatusPayload(readStore()),
    });
  } catch (error) {
    jsonResponse(response, 500, { error: error.message || "Could not refresh subscription status." });
  }
}

async function handleAdminSubscriptionRefresh(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const email = normalizeEmail(body.email);
  if (!email) {
    jsonResponse(response, 400, { error: "email is required." });
    return;
  }
  if (!requireStripe(response)) return;
  try {
    const before = readStore().users?.[email] || null;
    const { subscription, recoveredFromStripe } = await syncUserMembershipFromStripe(email, {
      force: true,
      reason: "admin_subscription_refresh",
    });
    appendMembershipLifecycleAudit(email, "admin_stripe_refresh", {
      adminEmail: body.adminEmail || ADMIN_EMAIL || "admin",
      note: recoveredFromStripe
        ? "Admin refreshed membership from Stripe and applied active subscription."
        : "Admin refreshed membership from Stripe; no active paid subscription found.",
      updates: {
        beforePlan: before?.plan || "Free",
        afterPlan: subscription?.plan || "Free",
        recoveredFromStripe,
      },
    });
    jsonResponse(response, 200, {
      ok: true,
      email,
      recoveredFromStripe,
      subscription: subscription ? { ...subscription, ...membershipSummaryForUser(subscription) } : null,
    });
  } catch (error) {
    console.error(`[membership] admin refresh failed email=${email}:`, error.message || error);
    jsonResponse(response, 503, { error: error.message || "Could not refresh subscription from Stripe." });
  }
}

function handleUserAiUsage(request, response, url) {
  const email = normalizeEmail(url.searchParams.get("email"));
  if (!email) {
    jsonResponse(response, 400, { error: "email is required." });
    return;
  }
  const store = readStore();
  const user = store.users?.[email] || null;
  const plan = user?.plan || "Free";
  const usage = canUseServerAi(email, plan);
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  jsonResponse(response, 200, {
    aiUsage: {
      email,
      used: usage.used,
      limit: usage.limit,
      remaining: Math.max(usage.limit - usage.used, 0),
      plan,
      resetDate: nextMonth.toISOString().slice(0, 10),
    },
  });
}

async function handleAdminStripeBackfill(request, response) {
  const body = await readJson(request);
  const token = String(body.adminToken || "");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const dryRun = body.dryRun === true;
  try {
    const report = await backfillLegacyStripeUsers({ dryRun });
    jsonResponse(response, 200, { ok: true, report, health: storeHealthSnapshot() });
  } catch (error) {
    const message = error?.message || "Unknown error.";
    console.error("Stripe backfill failed:", message);
    jsonResponse(response, 503, { error: `Stripe backfill failed: ${message}` });
  }
}

function handleAdminStoreHealth(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  jsonResponse(response, 200, { ok: true, health: storeHealthSnapshot() });
}

const LIVE_CONNECT_CONFIRM_PHRASE = "CONNECT_ASHLEY_LADIISHA";

function isAshleyLadiishaPair(ownerEmail, memberEmail) {
  const owner = normalizeEmail(ownerEmail);
  const member = normalizeEmail(memberEmail);
  return (
    (owner === "tclashley@icloud.com" && member === "ladiisha01@gmail.com")
    || (owner === "ladiisha01@gmail.com" && member === "tclashley@icloud.com")
  );
}

function liveConnectAuthorized(urlOrBody = {}) {
  const confirm = String(urlOrBody.confirm || urlOrBody.get?.("confirm") || "").trim();
  const envOk = process.env.ALLOW_LIVE_PROGRAM_MIGRATE === "true"
    || process.env.ALLOW_LIVE_ACCOUNT_LINK === "true";
  return envOk || confirm === LIVE_CONNECT_CONFIRM_PHRASE;
}

/**
 * Read-only (default) shared-program migration planner.
 * Live Ashley/Ladiisha apply requires admin token + confirm=CONNECT_ASHLEY_LADIISHA
 * (or ALLOW_LIVE_PROGRAM_MIGRATE / ALLOW_LIVE_ACCOUNT_LINK env flags).
 */
function handleAdminProgramMigrationPlan(request, response, url) {
  const token = String(url.searchParams.get("adminToken") || "").trim();
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const ownerEmail = normalizeEmail(url.searchParams.get("ownerEmail") || "");
  const memberEmail = normalizeEmail(url.searchParams.get("memberEmail") || "");
  const apply = String(url.searchParams.get("apply") || "") === "1";
  const linkMember = String(url.searchParams.get("linkMember") || "") === "1";
  const clearMemberFounding = String(url.searchParams.get("clearMemberFounding") || "") === "1";
  const forceAmbiguities = String(url.searchParams.get("forceAmbiguities") || "") === "1";
  const livePair = isAshleyLadiishaPair(ownerEmail, memberEmail);
  const confirmed = liveConnectAuthorized(url.searchParams);
  if (apply && livePair && !confirmed) {
    jsonResponse(response, 403, {
      error: "Live Ashley/Ladiisha changes require confirm=CONNECT_ASHLEY_LADIISHA (or ALLOW_LIVE_* env).",
      code: "live_pair_apply_blocked",
    });
    return;
  }
  const store = readStore();
  // Force Ashley as program/billing owner for the known live pair, regardless of query order.
  const programOwnerEmail = livePair ? "tclashley@icloud.com" : ownerEmail;
  const directorEmail = livePair ? "ladiisha01@gmail.com" : memberEmail;
  const ownerUidParam = String(url.searchParams.get("ownerUid") || "").trim();
  const memberUidParam = String(url.searchParams.get("memberUid") || "").trim();
  if (apply && (!store.users?.[programOwnerEmail] || (directorEmail && !store.users?.[directorEmail]))) {
    jsonResponse(response, 404, {
      error: "One or both accounts were not found in the production store. Refusing apply.",
      code: "accounts_missing",
      programOwnerEmail,
      directorEmail,
      ownerExists: Boolean(store.users?.[programOwnerEmail]),
      directorExists: Boolean(directorEmail && store.users?.[directorEmail]),
    });
    return;
  }
  // Always dry-run first for reporting; apply only when requested.
  const dryReport = programOwnership.planProgramDataMigration(store, {
    ownerEmail: programOwnerEmail,
    memberEmail: directorEmail,
    ownerUid: ownerUidParam,
    memberUid: memberUidParam,
    apply: false,
  });
  if (!apply) {
    jsonResponse(response, 200, {
      ...dryReport,
      livePair,
      linkMemberRequested: linkMember,
      clearMemberFoundingRequested: clearMemberFounding,
      confirmed,
      mode: "dry-run",
      programOwnerEmail,
      directorEmail,
    });
    return;
  }
  const blockingAmbiguities = (dryReport.ambiguities || []).filter((item) => item.severity === "manual_review");
  const infoAmbiguities = (dryReport.ambiguities || []).filter((item) => item.severity !== "manual_review");
  if (blockingAmbiguities.length && !forceAmbiguities) {
    jsonResponse(response, 409, {
      error: "Dry-run found ambiguities that need manual review. Resolve or pass forceAmbiguities=1 after review.",
      code: "ambiguities_present",
      dryRun: dryReport,
      blockingAmbiguities,
      infoAmbiguities,
      livePair,
      programOwnerEmail,
      directorEmail,
    });
    return;
  }
  const report = programOwnership.planProgramDataMigration(store, {
    ownerEmail: programOwnerEmail,
    memberEmail: directorEmail,
    ownerUid: ownerUidParam,
    memberUid: memberUidParam,
    apply: true,
    backupId: dryReport.backupId || undefined,
  });
  if (apply && report.ok && report.applied) {
    // programOwnerEmail / directorEmail already normalized above for the live pair.
    const program = programOwnership.ensureProgramForOwner(store, programOwnerEmail, {
      actorEmail: programOwnerEmail,
      ownerUid: store.users?.[programOwnerEmail]?.firebaseUid || "",
    });
    const ownerUser = store.users?.[programOwnerEmail] || { email: programOwnerEmail };
    store.users[programOwnerEmail] = {
      ...ownerUser,
      email: programOwnerEmail,
      role: "owner",
      programId: program.id,
      // Never strip Ashley founding / stripe in this path.
      foundingMemberActive: livePair ? true : ownerUser.foundingMemberActive,
      foundingMember: livePair ? true : ownerUser.foundingMember,
      foundingMemberHistorical: livePair ? true : ownerUser.foundingMemberHistorical,
      plan: livePair && ownerUser.plan === "Free" && ownerUser.stripeSubscriptionId
        ? "Founding"
        : (ownerUser.plan || (livePair ? "Founding" : ownerUser.plan)),
      updatedAt: new Date().toISOString(),
    };

    if (linkMember && directorEmail) {
      ensureStaffInviteCollections(store);
      const member = store.users?.[directorEmail] || { email: directorEmail };
      const ownerHasPro = membershipHasProAccess(store.users[programOwnerEmail]);
      store.users[directorEmail] = {
        ...member,
        email: directorEmail,
        role: "director",
        accountType: store.users[programOwnerEmail].accountType || member.accountType || "home_daycare",
        linkedProgramOwnerEmail: programOwnerEmail,
        programId: program.id,
        programAccessViaOwner: ownerHasPro,
        updatedAt: new Date().toISOString(),
      };
      const existingMembers = listProgramMembers(store, programOwnerEmail)
        .filter((entry) => normalizeEmail(entry.email) !== directorEmail);
      store.programMembers[programOwnerKey(programOwnerEmail)] = [
        ...existingMembers,
        {
          email: directorEmail,
          uid: member.firebaseUid || "",
          role: "director",
          classroomId: "",
          classroomName: "",
          status: "active",
          joinedAt: new Date().toISOString(),
          inviteId: "admin-live-connect",
          programId: program.id,
        },
      ];
      report.memberLinked = true;
      report.programOwnerEmail = programOwnerEmail;
      report.directorEmail = directorEmail;

      // Only clear temporary Founding after director inheritance is in place.
      if (clearMemberFounding && livePair && store.users[directorEmail].programAccessViaOwner) {
        const before = { ...store.users[directorEmail] };
        store.users[directorEmail] = {
          ...store.users[directorEmail],
          foundingMemberActive: false,
          plan: store.users[directorEmail].stripeSubscriptionId ? store.users[directorEmail].plan : "Free",
          internalAccessOverride: false,
          monthlyPrice: store.users[directorEmail].programAccessViaOwner
            ? (store.users[programOwnerEmail].monthlyPrice || "$9.99/month")
            : "$0/month",
          subscriptionStatus: store.users[directorEmail].programAccessViaOwner
            ? "Access via program owner (Director)"
            : (store.users[directorEmail].subscriptionStatus || "Free Plan"),
          // Preserve historical marker if she was ever founding; do not remove Ashley from foundingMembers[].
          foundingMemberHistorical: Boolean(before.foundingMember || before.foundingMemberHistorical || before.foundingMemberActive),
          foundingMember: Boolean(before.foundingMember || before.foundingMemberHistorical || before.foundingMemberActive),
          updatedAt: new Date().toISOString(),
        };
        // Do not remove Ashley from foundingMembers. Optionally keep Ladiisha historical entry.
        report.memberFoundingCleared = true;
        report.memberFoundingBefore = {
          plan: before.plan || "",
          foundingMemberActive: Boolean(before.foundingMemberActive),
          internalAccessOverride: Boolean(before.internalAccessOverride),
          stripeSubscriptionId: before.stripeSubscriptionId ? "present" : "",
        };
      }
    }
    writeStore(store);
    report.ashleyBillingProtected = {
      email: programOwnerEmail,
      plan: store.users[programOwnerEmail]?.plan || "",
      foundingMemberActive: Boolean(store.users[programOwnerEmail]?.foundingMemberActive),
      stripeSubscriptionId: store.users[programOwnerEmail]?.stripeSubscriptionId ? "present" : "",
      stripeCustomerId: store.users[programOwnerEmail]?.stripeCustomerId ? "present" : "",
    };
  }
  console.log("[program] migration_plan", {
    ownerEmail,
    memberEmail,
    apply,
    applied: Boolean(report.applied),
    ambiguities: (report.ambiguities || []).length,
    memberLinked: Boolean(report.memberLinked),
    memberFoundingCleared: Boolean(report.memberFoundingCleared),
  });
  jsonResponse(response, 200, {
    ...report,
    livePair,
    linkMemberRequested: linkMember,
    clearMemberFoundingRequested: clearMemberFounding,
    confirmed,
    mode: "apply",
  });
}

function handleAdminProgramMigrationRollback(request, response) {
  return readJson(request).then((body) => {
    const token = String(body.adminToken || "").trim();
    if (!validAdminToken(token)) {
      jsonResponse(response, 401, { error: "Admin access is required." });
      return;
    }
    const backupId = String(body.backupId || "").trim();
    if (!backupId) {
      jsonResponse(response, 400, { error: "backupId is required." });
      return;
    }
    const store = readStore();
    const result = programOwnership.rollbackProgramDataMigration(store, backupId);
    if (!result.ok) {
      jsonResponse(response, 404, result);
      return;
    }
    writeStore(store);
    jsonResponse(response, 200, result);
  }).catch((error) => {
    jsonResponse(response, 400, { error: error.message || "Invalid rollback payload." });
  });
}

/**
 * Read-only full launch-store export for incident preservation.
 * Does not modify Postgres. Media bytes stay in llh_media_assets (IDs listed only).
 */
function handleAdminStoreExport(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = readStore();
  const users = store.users || {};
  const mediaIds = new Set();
  const collectMediaIds = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      if (value.startsWith("lesson-cover-") || value.includes("/api/media/")) mediaIds.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collectMediaIds);
      return;
    }
    if (typeof value === "object") Object.values(value).forEach(collectMediaIds);
  };
  collectMediaIds(store.siteContent);
  collectMediaIds(store.uploadedResources);
  jsonResponse(response, 200, {
    ok: true,
    exportedAt: new Date().toISOString(),
    purpose: "read-only-production-store-preservation",
    destructive: false,
    database: {
      provider: DATABASE_PROVIDER,
      ready: databaseReady,
      usingPostgres: usePostgresStore(),
    },
    health: storeHealthSnapshot(store),
    mediaAssetIdsReferenced: [...mediaIds].slice(0, 5000),
    store,
  });
}

async function handleAdminRecoverSparseStore(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (String(body.confirm || "").trim() !== "RECOVER_SPARSE_STORE") {
    jsonResponse(response, 400, {
      error: "Confirmation required. Send confirm: \"RECOVER_SPARSE_STORE\" to run sparse-store recovery.",
      requiresConfirm: "RECOVER_SPARSE_STORE",
    });
    return;
  }
  try {
    const result = await recoverSparseStoreFromStripeIfNeeded({
      force: body.force === true,
      source: "admin",
    });
    jsonResponse(response, 200, { ok: true, result, health: storeHealthSnapshot() });
  } catch (error) {
    console.error("[store-recovery] admin recover failed:", error.message || error);
    jsonResponse(response, 503, { error: error.message || "Sparse store recovery failed." });
  }
}

/**
 * Create-missing-only Free profile stubs from an approved Firebase email list.
 * Never overwrites existing Postgres users (preserves Stripe/Founding/subscription).
 * Never resets passwords. Never sends email.
 */
async function handleAdminRecoverFirebaseProfiles(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (String(body.confirm || "").trim() !== "RECOVER_FIREBASE_PROFILES") {
    jsonResponse(response, 400, {
      error: "Confirmation required. Send confirm: \"RECOVER_FIREBASE_PROFILES\".",
      requiresConfirm: "RECOVER_FIREBASE_PROFILES",
    });
    return;
  }
  const dryRun = body.dryRun === true;
  const profiles = Array.isArray(body.profiles) ? body.profiles : [];
  if (!profiles.length) {
    jsonResponse(response, 400, { error: "profiles array is required (email + optional firebaseUid/createdAt)." });
    return;
  }
  const store = readStore();
  store.users = store.users || {};
  const report = {
    dryRun,
    generatedAt: new Date().toISOString(),
    requested: profiles.length,
    created: [],
    skippedExisting: [],
    failed: [],
    duplicateRequests: [],
  };
  const seen = new Set();
  for (const profile of profiles) {
    const email = normalizeEmail(profile?.email || profile);
    if (!email || !email.includes("@")) {
      report.failed.push({ email: String(profile?.email || ""), reason: "invalid_email" });
      continue;
    }
    if (seen.has(email)) {
      report.duplicateRequests.push(email);
      continue;
    }
    seen.add(email);
    if (store.users[email]) {
      report.skippedExisting.push({
        email,
        plan: store.users[email].plan || "Free",
        hasStripe: Boolean(store.users[email].stripeCustomerId),
        foundingMemberActive: Boolean(store.users[email].foundingMemberActive),
      });
      continue;
    }
    const createdAt = profile.createdAt || profile.signupAt || new Date().toISOString();
    const stub = {
      email,
      plan: "Free",
      subscriptionStatus: "Free Plan",
      accountStatus: "Active",
      authProvider: "Firebase Authentication",
      firebaseUid: String(profile.firebaseUid || profile.uid || "").trim(),
      signupAt: createdAt,
      createdAt,
      recoveredFromFirebaseAt: new Date().toISOString(),
      recoverySource: "firebase-hybrid-approved-free-stubs",
      updatedAt: new Date().toISOString(),
    };
    if (dryRun) {
      report.created.push({ email, dryRun: true, firebaseUid: stub.firebaseUid });
      continue;
    }
    try {
      const accessFields = accountAccess.migrateAccountAccessFields(stub);
      store.users[email] = {
        ...stub,
        accountType: accessFields.accountType,
        role: accessFields.role,
      };
      report.created.push({ email, firebaseUid: stub.firebaseUid });
    } catch (error) {
      report.failed.push({ email, reason: error.message || "create_failed" });
    }
  }
  if (!dryRun && report.created.length) {
    store.systemRecovery = {
      ...(store.systemRecovery || {}),
      firebaseHybridRecoveredAt: new Date().toISOString(),
      firebaseHybridCreatedCount: report.created.length,
      firebaseHybridRequestedCount: report.requested,
    };
    await writeStoreAsync(store);
  }
  jsonResponse(response, 200, {
    ok: true,
    report,
    health: storeHealthSnapshot(dryRun ? peekStore() : peekStore()),
  });
}

async function handleAdminStoreBackupsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (!usePostgresStore() || !postgresPool || !databaseReady) {
    jsonResponse(response, 503, { error: "Postgres backups are unavailable while the database is not ready." });
    return;
  }
  const result = await postgresPool.query(`
    SELECT id, created_at, source, user_count, message_count, founding_count,
           notification_count, support_ticket_count, verified
    FROM llh_store_backups
    ORDER BY created_at DESC
    LIMIT 50
  `);
  jsonResponse(response, 200, {
    ok: true,
    retention: STORE_BACKUP_RETENTION,
    intervalMs: STORE_BACKUP_INTERVAL_MS,
    backups: result.rows,
    liveCounts: storeInventoryCounts(),
  });
}

async function handleAdminStoreBackupCreate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  try {
    const result = await createLogicalStoreBackup({ source: body.source || "manual" });
    if (!result.ok) {
      jsonResponse(response, 503, { error: "Could not create backup.", result });
      return;
    }
    jsonResponse(response, 200, { ok: true, result });
  } catch (error) {
    jsonResponse(response, 503, { error: error.message || "Backup failed." });
  }
}

async function handleAdminStoreBackupDownload(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) {
    jsonResponse(response, 400, { error: "Backup id is required." });
    return;
  }
  if (!usePostgresStore() || !postgresPool || !databaseReady) {
    jsonResponse(response, 503, { error: "Postgres backups are unavailable while the database is not ready." });
    return;
  }
  const result = await postgresPool.query(
    `SELECT id, created_at, source, user_count, message_count, founding_count,
            notification_count, support_ticket_count, verified, data
     FROM llh_store_backups WHERE id = $1`,
    [id],
  );
  if (!result.rows.length) {
    jsonResponse(response, 404, { error: "Backup not found." });
    return;
  }
  const row = result.rows[0];
  jsonResponse(response, 200, {
    ok: true,
    exportedAt: new Date().toISOString(),
    backup: {
      id: row.id,
      createdAt: row.created_at,
      source: row.source,
      counts: {
        users: row.user_count,
        messages: row.message_count,
        foundingMembers: row.founding_count,
        notifications: row.notification_count,
        supportTickets: row.support_ticket_count,
      },
      verified: row.verified,
      store: row.data,
    },
  });
}

/**
 * Restore launch store from a Postgres backup id OR an uploaded store JSON body.
 * Requires confirm: "RESTORE_STORE_FROM_BACKUP". High-risk — creates a safety backup first when possible.
 */
async function handleAdminStoreRestore(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (String(body.confirm || "").trim() !== "RESTORE_STORE_FROM_BACKUP") {
    jsonResponse(response, 400, {
      error: "Confirmation required. Send confirm: \"RESTORE_STORE_FROM_BACKUP\".",
      requiresConfirm: "RESTORE_STORE_FROM_BACKUP",
    });
    return;
  }
  let incoming = null;
  const backupId = String(body.backupId || "").trim();
  if (backupId) {
    if (!usePostgresStore() || !postgresPool || !databaseReady) {
      jsonResponse(response, 503, { error: "Postgres backups are unavailable while the database is not ready." });
      return;
    }
    const result = await postgresPool.query(
      `SELECT id, created_at, source, data FROM llh_store_backups WHERE id = $1`,
      [backupId],
    );
    if (!result.rows.length) {
      jsonResponse(response, 404, { error: "Backup not found." });
      return;
    }
    incoming = result.rows[0].data;
  } else if (body.store && typeof body.store === "object") {
    incoming = body.store;
  } else {
    jsonResponse(response, 400, { error: "Provide backupId or store JSON to restore." });
    return;
  }
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    jsonResponse(response, 400, { error: "Restore payload must be a store object." });
    return;
  }
  if (!incoming.users || typeof incoming.users !== "object") {
    jsonResponse(response, 400, { error: "Restore store is missing users map." });
    return;
  }
  let safetyBackup = null;
  try {
    if (usePostgresStore() && postgresPool && databaseReady) {
      safetyBackup = await createLogicalStoreBackup({ source: "pre-restore-safety" });
    }
  } catch (error) {
    console.warn("[store-restore] safety backup failed:", error.message || error);
  }
  const next = {
    ...defaultStore(),
    ...incoming,
    users: incoming.users || {},
    updatedAt: new Date().toISOString(),
    systemRecovery: {
      ...((incoming.systemRecovery && typeof incoming.systemRecovery === "object") ? incoming.systemRecovery : {}),
      restoredAt: new Date().toISOString(),
      restoredFromBackupId: backupId || "",
      restoredBy: "admin",
    },
  };
  await writeStoreAsync(next);
  jsonResponse(response, 200, {
    ok: true,
    restoredAt: next.systemRecovery.restoredAt,
    backupId: backupId || null,
    safetyBackup,
    health: storeHealthSnapshot(peekStore()),
    counts: storeInventoryCounts(peekStore()),
  });
}

function handleAdminPromoCodesList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = peekStore();
  seedDefaultPromoCodes(store);
  const envCode = normalizePromoCode(PROMO_FREE_TRIAL_CODE);
  const managed = promoCodeRecords(store).map(publicPromoCode);
  const envRow = envCode ? publicPromoCode({
    id: "env-promo",
    code: envCode,
    label: `${PROMO_FREE_TRIAL_DAYS} day free membership (env)`,
    trialDays: PROMO_FREE_TRIAL_DAYS,
    status: "active",
    expiresAt: PROMO_FREE_TRIAL_EXPIRES_AT,
    expiresLabel: PROMO_FREE_TRIAL_EXPIRES_LABEL,
    source: "env",
    createdAt: "",
    updatedAt: "",
  }) : null;
  jsonResponse(response, 200, {
    ok: true,
    promoCodes: managed,
    envPromo: envRow,
    redemptions: promoRedemptionRecords(store).slice(0, 200),
  });
}

async function handleAdminPromoCodeSave(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const code = normalizePromoCode(body.code);
  const trialDays = Math.max(0, Math.min(Number(body.trialDays) || 0, 365));
  if (!code || trialDays <= 0) {
    jsonResponse(response, 400, { error: "code and trialDays (>0) are required." });
    return;
  }
  const store = readStore();
  store.promoCodes = promoCodeRecords(store);
  const id = String(body.id || "").trim() || `promo_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const existingIndex = store.promoCodes.findIndex((item) => item.id === id || normalizePromoCode(item.code) === code);
  const next = {
    id: existingIndex >= 0 ? store.promoCodes[existingIndex].id : id,
    code,
    label: String(body.label || `${trialDays} day free Pro trial`).trim().slice(0, 200),
    trialDays,
    status: ["active", "disabled", "archived"].includes(String(body.status || "").toLowerCase())
      ? String(body.status).toLowerCase()
      : "active",
    expiresAt: body.expiresAt ? String(body.expiresAt) : "",
    expiresLabel: String(body.expiresLabel || "").trim().slice(0, 120),
    maxRedemptions: body.maxRedemptions === "" || body.maxRedemptions == null
      ? null
      : Math.max(0, Number(body.maxRedemptions) || 0),
    notes: String(body.notes || "").trim().slice(0, 500),
    source: "store",
    createdAt: existingIndex >= 0 ? (store.promoCodes[existingIndex].createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const conflict = store.promoCodes.find((item) => normalizePromoCode(item.code) === code && item.id !== next.id);
  if (conflict) {
    jsonResponse(response, 409, { error: `Promo code ${code} already exists.` });
    return;
  }
  if (existingIndex >= 0) store.promoCodes[existingIndex] = next;
  else store.promoCodes.unshift(next);
  store.promoCodes = store.promoCodes.slice(0, 200);
  await writeStoreAsync(store);
  jsonResponse(response, 200, { ok: true, promoCode: publicPromoCode(next) });
}

async function handleAdminPromoCodeDelete(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const id = String(body.id || "").trim();
  const code = normalizePromoCode(body.code);
  if (!id && !code) {
    jsonResponse(response, 400, { error: "id or code is required." });
    return;
  }
  const store = readStore();
  store.promoCodes = promoCodeRecords(store);
  const before = store.promoCodes.length;
  store.promoCodes = store.promoCodes.filter((item) => {
    if (id && item.id === id) return false;
    if (code && normalizePromoCode(item.code) === code) return false;
    return true;
  });
  if (store.promoCodes.length === before) {
    jsonResponse(response, 404, { error: "Promo code not found." });
    return;
  }
  await writeStoreAsync(store);
  jsonResponse(response, 200, { ok: true, promoCodes: store.promoCodes.map(publicPromoCode) });
}

function handleAdminUserDetail(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const email = normalizeEmail(url.searchParams.get("email") || url.searchParams.get("userEmail") || "");
  if (!email) {
    jsonResponse(response, 400, { error: "email is required." });
    return;
  }
  const store = peekStore();
  const user = store.users?.[email];
  if (!user) {
    jsonResponse(response, 404, { error: "User not found." });
    return;
  }
  const events = (store.analyticsEvents || []).filter((event) => normalizeEmail(event.user) === email);
  const loginEvents = events
    .filter((event) => ["account_login", "password_login", "session_restore", "website_visit"].includes(event.name) || event.name?.includes("login"))
    .slice(0, 40)
    .map((event) => ({
      name: event.name,
      createdAt: event.createdAt || "",
      detail: event.detail || {},
      path: event.path || event.hash || "",
      userAgent: event.userAgent || event.detail?.userAgent || "",
    }));
  const downloadEvents = events
    .filter((event) => ["resource_print", "generated_pdf", "generated_print", "provider_tool_pdf", "resource_download", "lesson_docx_download"].includes(event.name))
    .slice(0, 40)
    .map((event) => ({
      name: event.name,
      createdAt: event.createdAt || "",
      label: event.detail?.title || event.detail?.category || event.detail?.tool || event.name,
    }));
  const schedule = store.scheduleByUser?.[email] || null;
  const calendarEntryCount = Array.isArray(schedule?.entries)
    ? schedule.entries.length
    : Array.isArray(schedule?.weeks)
      ? schedule.weeks.length
      : (schedule && typeof schedule === "object" ? Object.keys(schedule).length : 0);
  const programKeys = Object.keys(store.programData || {}).filter((key) => {
    const row = store.programData[key];
    return normalizeEmail(row?.ownerEmail || row?.email || key) === email;
  });
  let childrenCount = Number(user.childrenCount) || 0;
  const childrenSample = [];
  programKeys.forEach((key) => {
    const row = store.programData[key] || {};
    const kids = Array.isArray(row.children) ? row.children : (Array.isArray(row.childProfiles) ? row.childProfiles : []);
    childrenCount = Math.max(childrenCount, kids.length);
    kids.slice(0, 12).forEach((child) => {
      childrenSample.push({
        id: child.id || "",
        name: child.name || child.firstName || "Child",
        ageGroup: child.ageGroup || child.age || "",
      });
    });
  });
  const billingHistory = (store.billingEvents || [])
    .filter((event) => normalizeEmail(event.email || event.user || event.detail?.email) === email)
    .slice(0, 30);
  const promoRedemptions = [
    ...promoRedemptionRecords(store).filter((record) => normalizeEmail(record.email) === email),
    ...(Array.isArray(user.promoRedemptions) ? user.promoRedemptions : []),
  ].slice(0, 20);
  const membership = membershipSummaryForUser(user, store);
  jsonResponse(response, 200, {
    ok: true,
    user: {
      email,
      name: user.name || user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || "",
      plan: user.plan || "Free",
      accountStatus: user.accountStatus || "Active",
      subscriptionStatus: user.subscriptionStatus || "",
      stripeCustomerId: user.stripeCustomerId || "",
      stripeSubscriptionId: user.stripeSubscriptionId || "",
      lastLoginAt: user.lastLoginAt || "",
      lastSeenAt: user.lastSeenAt || "",
      signupAt: user.signupAt || user.createdAt || "",
      businessName: user.businessName || user.daycareName || "",
      ...membership,
    },
    impersonation: {
      email,
      planPreview: membershipAccess.membershipCurrentAccessKey(user) === "trial"
        ? "Trial"
        : membershipAccess.membershipCurrentAccessKey(user) === "founding"
          ? "Founding"
          : membershipAccess.membershipCurrentAccessKey(user) === "pro"
            ? "Pro"
            : "Free",
      readOnly: true,
    },
    activity: {
      eventCount: events.length,
      loginHistory: loginEvents,
      downloads: downloadEvents,
      calendarEntryCount,
      childrenCount,
      childrenSample: childrenSample.slice(0, 12),
      savedResourcesCount: Array.isArray(user.savedResources) ? user.savedResources.length : 0,
      promoRedemptions,
      billingHistory,
      recentEvents: events.slice(0, 25).map((event) => ({
        name: event.name,
        createdAt: event.createdAt || "",
        detail: event.detail || {},
      })),
    },
  });
}

function publicTicket(ticket) {
  const replyEmail = ticket.replyEmail && typeof ticket.replyEmail === "object" ? ticket.replyEmail : null;
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
    replyEmail: replyEmail
      ? {
          to: replyEmail.to || "",
          subject: replyEmail.subject || "",
          sent: Boolean(replyEmail.sent),
          configured: replyEmail.configured !== false,
          provider: replyEmail.provider || "",
          messageId: replyEmail.messageId || "",
          sentAt: replyEmail.sentAt || "",
          status: replyEmail.status || "",
          lastEvent: replyEmail.lastEvent || "",
          error: replyEmail.error || "",
          refreshedAt: replyEmail.refreshedAt || "",
        }
      : null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function adminAuthFailurePayload(extra = {}) {
  return {
    valid: false,
    code: "admin_session_invalid",
    error: "Admin access is required.",
    hint: "Your Admin unlock session is no longer on the server. Unlock Admin again with owner email, password, and access code.",
    ...extra,
  };
}

function validAdminToken(token) {
  const clean = String(token || "").trim();
  if (!clean) return false;
  const store = readStore();
  return Boolean(store.adminSessions?.[clean]);
}

function handleAdminSession(request, response, url) {
  const token = String(url.searchParams.get("adminToken") || "").trim();
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, adminAuthFailurePayload());
    return;
  }
  // Soft-touch the live session so unlock stays warm without a full disk write on every poll.
  const nowIso = new Date().toISOString();
  if (storeCache?.adminSessions?.[token]) {
    storeCache.adminSessions[token] = {
      ...storeCache.adminSessions[token],
      lastValidatedAt: nowIso,
    };
  }
  const session = (storeCache?.adminSessions?.[token]) || readStore().adminSessions?.[token] || {};
  jsonResponse(response, 200, {
    valid: true,
    email: session.email || "",
    createdAt: session.createdAt || "",
    lastValidatedAt: session.lastValidatedAt || nowIso,
    adminConfigured: adminConfigStatus().ready,
  });
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
  if (event.name === "account_signup_complete") {
    const detailFirst = normalizedShortText(event.detail?.firstName, 80);
    const detailLast  = normalizedShortText(event.detail?.lastName, 80);
    if (detailFirst && !existing.firstName) updates.firstName = detailFirst;
    if (detailLast  && !existing.lastName)  updates.lastName  = detailLast;
    if ((detailFirst || detailLast) && !existing.name) {
      updates.name = [detailFirst, detailLast].filter(Boolean).join(" ");
    }
    const businessName = normalizedShortText(event.detail?.businessName || event.detail?.daycareName || event.detail?.programName, 160);
    if (businessName) {
      updates.businessName = businessName;
      updates.daycareName = businessName;
      updates.programName = businessName;
    }
    if (event.detail?.accountType) {
      updates.accountType = accountAccess.normalizeAccountType(event.detail.accountType);
    }
    if (event.detail?.role) {
      updates.role = accountAccess.normalizeUserRole(event.detail.role);
    }
    if (event.detail?.phone) updates.phone = normalizedShortText(event.detail.phone, 40);
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

async function resolveScheduleIdentity(request) {
  const authHeader = String(request.headers.authorization || "");
  if (process.env.NODE_ENV === "test" && authHeader.startsWith("Bearer test:")) {
    const email = normalizeEmail(authHeader.slice("Bearer test:".length).trim());
    if (!email) throw new Error("Please log in before using the schedule.");
    return { uid: `test-${email}`, email, source: "test" };
  }
  // Scoped member recovery / server-password sessions (temp-password force-change path).
  // Only tokens minted by /api/auth/password-login are accepted — not a general auth bypass.
  const memberSession = tempPasswordAuth.resolveMemberSession(readStore(), authHeader);
  if (memberSession?.email) {
    return {
      uid: memberSession.uid,
      email: memberSession.email,
      source: "member-session",
      memberSessionToken: memberSession.token,
    };
  }
  if (firebaseConfigStatus().ready) {
    try {
      const identity = await verifyFirebaseUser(request);
      if (identity?.uid) return { ...identity, source: "firebase" };
    } catch (error) {
      // Fall through to email auth when Firebase token is missing/invalid and Firebase-less mode is allowed.
      if (authHeader.startsWith("Bearer ") && !authHeader.startsWith("Bearer test:") && !authHeader.includes(tempPasswordAuth.MEMBER_SESSION_PREFIX)) {
        throw error;
      }
    }
  }
  // Local / email-session bridge: used when Firebase Auth is not configured.
  // Production with Firebase ready requires a verified Bearer token above.
  if (!firebaseConfigStatus().ready || process.env.ALLOW_EMAIL_SCHEDULE_AUTH === "true" || process.env.NODE_ENV === "test") {
    const email = normalizeEmail(
      request.headers["x-llh-user-email"]
      || "",
    );
    if (email) return { uid: `email-${email}`, email, source: "email" };
  }
  throw new Error("Please log in before using the schedule.");
}

function emptyScheduleRecord(identity) {
  const doc = scheduleLib.normalizeScheduleDocument({
    classrooms: [{ id: "classroom-main", name: "Main Classroom" }],
    items: [],
    updatedAt: "",
  });
  return {
    uid: identity.uid,
    email: identity.email,
    programId: "",
    ownerEmail: identity.email || "",
    ...doc,
  };
}

function readScheduleRecord(store, identity) {
  const context = programOwnership.resolveProgramContext(store, identity);
  if (!context.ok) return emptyScheduleRecord(identity);
  return programOwnership.readProgramSchedule(store, context, scheduleLib);
}

function writeScheduleRecord(store, identity, doc) {
  const context = programOwnership.resolveProgramContext(store, identity);
  if (!context.ok) throw new Error(context.error || "Could not resolve shared program.");
  return programOwnership.writeProgramSchedule(store, context, doc, scheduleLib);
}

async function handleScheduleGet(request, response, url) {
  let identity;
  try {
    identity = await resolveScheduleIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before using the schedule." });
    return;
  }
  const store = readStore();
  const record = readScheduleRecord(store, identity);
  const filtered = scheduleLib.filterScheduleItems(record.items, {
    from: url.searchParams.get("from") || "",
    to: url.searchParams.get("to") || "",
    classroomId: url.searchParams.get("classroomId") || "",
    types: url.searchParams.get("types") || "",
  });
  jsonResponse(response, 200, {
    uid: record.uid,
    email: record.email,
    programId: record.programId || "",
    ownerEmail: record.ownerEmail || record.email || "",
    classrooms: record.classrooms,
    items: filtered,
    updatedAt: record.updatedAt || "",
    schemaVersion: 1,
    source: record.source || "",
  });
}

async function handleSchedulePut(request, response) {
  let identity;
  try {
    identity = await resolveScheduleIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before using the schedule." });
    return;
  }
  try {
    const body = await readJson(request);
    const store = readStore();
    const saved = writeScheduleRecord(store, identity, {
      classrooms: body.classrooms,
      items: body.items,
      updatedAt: new Date().toISOString(),
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      uid: saved.uid,
      email: saved.email,
      classrooms: saved.classrooms,
      items: saved.items,
      updatedAt: saved.updatedAt,
      schemaVersion: 1,
    });
  } catch (error) {
    jsonResponse(response, 400, { error: error.message || "Could not save schedule." });
  }
}

async function handleScheduleItemUpsert(request, response, itemId) {
  let identity;
  try {
    identity = await resolveScheduleIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before using the schedule." });
    return;
  }
  try {
    const body = await readJson(request);
    const store = readStore();
    const current = readScheduleRecord(store, identity);
    const { doc, item } = scheduleLib.upsertScheduleItem(current, {
      ...body,
      id: itemId || body.id,
    });
    const saved = writeScheduleRecord(store, identity, doc);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, item, updatedAt: saved.updatedAt, classrooms: saved.classrooms });
  } catch (error) {
    jsonResponse(response, 400, { error: error.message || "Could not save schedule item." });
  }
}

async function handleScheduleItemDelete(request, response, itemId) {
  let identity;
  try {
    identity = await resolveScheduleIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before using the schedule." });
    return;
  }
  const store = readStore();
  const current = readScheduleRecord(store, identity);
  const doc = scheduleLib.deleteScheduleItem(current, itemId);
  const saved = writeScheduleRecord(store, identity, doc);
  writeStore(store);
  jsonResponse(response, 200, { ok: true, updatedAt: saved.updatedAt });
}

async function handleScheduleWeekAssign(request, response, weekStartParam) {
  let identity;
  try {
    identity = await resolveScheduleIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before using the schedule." });
    return;
  }
  try {
    const body = await readJson(request);
    const weekStart = scheduleLib.isoDateOnly(weekStartParam || body.weekStartDate);
    if (!weekStart) {
      jsonResponse(response, 400, { error: "weekStartDate is required (YYYY-MM-DD Monday)." });
      return;
    }
    const store = readStore();
    const current = readScheduleRecord(store, identity);
    const classroomId = String(body.classroomId || current.classrooms[0]?.id || "classroom-main").trim();
    const item = scheduleLib.normalizeScheduleItem({
      ...body,
      type: "lesson_plan",
      weekStartDate: weekStart,
      startDate: weekStart,
      endDate: scheduleLib.weekEndFromStart(weekStart),
      classroomId,
      assignedBy: identity.email,
    });
    const { doc, item: savedItem } = scheduleLib.upsertScheduleItem(current, item);
    const saved = writeScheduleRecord(store, identity, doc);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      item: savedItem,
      updatedAt: saved.updatedAt,
      classrooms: saved.classrooms,
    });
  } catch (error) {
    jsonResponse(response, 400, { error: error.message || "Could not assign lesson plan to week." });
  }
}

async function handleScheduleMigrate(request, response) {
  let identity;
  try {
    identity = await resolveScheduleIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before using the schedule." });
    return;
  }
  try {
    const body = await readJson(request);
    const store = readStore();
    const current = readScheduleRecord(store, identity);
    const migrated = scheduleLib.migrateCurriculumAssignmentsToSchedule({
      curriculumAssignments: body.curriculumAssignments || [],
      weeklyPlanner: body.weeklyPlanner || null,
      classroomLabel: body.classroomLabel || "",
      classrooms: body.classrooms || current.classrooms,
    });
    // Prefer existing cloud items; fill gaps from migration.
    const byId = new Map();
    current.items.forEach((item) => byId.set(item.id, item));
    migrated.items.forEach((item) => {
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
    // Also avoid duplicate lesson_plan weeks from migration when cloud already has that week.
    const cloudLessonWeeks = new Set(
      current.items
        .filter((item) => item.type === "lesson_plan")
        .map((item) => `${item.classroomId}:${item.weekStartDate}`),
    );
    const mergedItems = [];
    byId.forEach((item) => {
      if (item.type === "lesson_plan") {
        const key = `${item.classroomId}:${item.weekStartDate}`;
        const fromCloud = current.items.find((entry) => entry.id === item.id);
        if (!fromCloud && cloudLessonWeeks.has(key)) return;
      }
      mergedItems.push(item);
    });
    const saved = writeScheduleRecord(store, identity, {
      classrooms: migrated.classrooms.length ? migrated.classrooms : current.classrooms,
      items: mergedItems,
      updatedAt: new Date().toISOString(),
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      migratedCount: migrated.items.length,
      itemCount: saved.items.length,
      classrooms: saved.classrooms,
      items: saved.items,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    jsonResponse(response, 400, { error: error.message || "Could not migrate schedule data." });
  }
}

const childDataKeys = [
  "Profiles",
  "Observations",
  "SupportPlans",
  "Goals",
  "Differentiations",
  "Attendance",
  "Meals",
  "MealPresets",
  "Reports",
  "Communications",
  "Naps",
  "Diapers",
  "ActivityLogs",
  "Photos",
  "Documents",
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

async function resolveChildDataIdentity(request) {
  // Prefer Firebase in production; allow the same test/email bridges as schedule.
  if (firebaseConfigStatus().ready) {
    try {
      return { ...(await verifyFirebaseUser(request)), source: "firebase" };
    } catch (error) {
      const authHeader = String(request.headers.authorization || "");
      if (authHeader.startsWith("Bearer ") && !authHeader.startsWith("Bearer test:")) {
        throw error;
      }
    }
  }
  return resolveScheduleIdentity(request);
}

async function handleChildData(request, response) {
  let identity;
  try {
    identity = await resolveChildDataIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before saving child data." });
    return;
  }
  const store = readStore();
  const context = programOwnership.resolveProgramContext(store, identity);
  if (!context.ok) {
    jsonResponse(response, 403, { error: context.error || "Could not resolve shared program." });
    return;
  }
  if (request.method === "GET") {
    const saved = programOwnership.readProgramChildData(store, context);
    jsonResponse(response, 200, {
      email: identity.email,
      uid: identity.uid,
      programId: context.programId,
      ownerEmail: context.ownerEmail,
      data: saved.data || null,
      updatedAt: saved.updatedAt || "",
      updatedByUid: saved.updatedByUid || "",
      updatedByEmail: saved.updatedByEmail || "",
      source: saved.source || "",
    });
    return;
  }
  try {
    const body = await readJson(request);
    const data = sanitizeChildDataPayload(body.data || {});
    const result = programOwnership.writeProgramChildData(store, context, data);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      updatedAt: result.updatedAt,
      programId: result.programId,
      ownerEmail: context.ownerEmail,
    });
  } catch (error) {
    jsonResponse(response, 400, { error: error.message || "Could not save child data." });
  }
}

const STAFF_INVITE_ROLES = new Set(["teacher", "assistant", "director", "owner"]);
const STAFF_INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function publicStaffInvite(invite = {}) {
  return {
    id: invite.id || "",
    email: invite.email || "",
    role: invite.role || "teacher",
    classroomId: invite.classroomId || "",
    classroomName: invite.classroomName || "",
    status: invite.status || "pending",
    invitedAt: invite.invitedAt || "",
    invitedByEmail: invite.invitedByEmail || "",
    acceptedAt: invite.acceptedAt || "",
    expiresAt: invite.expiresAt || "",
    emailSent: Boolean(invite.emailSent),
    programName: invite.programName || "Little Learner Hub program",
  };
}

function staffInviteIsExpired(invite, nowMs = Date.now()) {
  const exp = Date.parse(invite?.expiresAt || "");
  if (Number.isFinite(exp)) return exp <= nowMs;
  const created = Date.parse(invite?.invitedAt || "");
  if (!Number.isFinite(created)) return false;
  return created + STAFF_INVITE_TTL_MS <= nowMs;
}

function ensureStaffInviteCollections(store) {
  store.staffInvites = store.staffInvites && typeof store.staffInvites === "object" ? store.staffInvites : {};
  store.programMembers = store.programMembers && typeof store.programMembers === "object" ? store.programMembers : {};
  return store;
}

function programOwnerKey(email) {
  return normalizeEmail(email);
}

function listProgramInvites(store, ownerEmail) {
  const key = programOwnerKey(ownerEmail);
  return Object.values(store.staffInvites || {})
    .filter((invite) => programOwnerKey(invite.invitedByEmail) === key)
    .sort((a, b) => String(b.invitedAt || "").localeCompare(String(a.invitedAt || "")));
}

function listProgramMembers(store, ownerEmail) {
  const key = programOwnerKey(ownerEmail);
  const members = Array.isArray(store.programMembers?.[key]) ? store.programMembers[key] : [];
  return members.slice().sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
}

function canManageStaffInvites(user = {}) {
  const role = String(user.role || "owner").trim().toLowerCase();
  return role === "owner" || role === "director" || !user.role;
}

async function resolveStaffIdentity(request) {
  return resolveScheduleIdentity(request);
}

async function handleStaffInvitesList(request, response) {
  let identity;
  try {
    identity = await resolveStaffIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before managing staff." });
    return;
  }
  const store = ensureStaffInviteCollections(readStore());
  const user = store.users?.[identity.email] || { email: identity.email, role: "owner" };
  if (!canManageStaffInvites(user)) {
    jsonResponse(response, 403, { error: "Only owners and directors can manage staff invites." });
    return;
  }
  const ownerEmail = user.linkedProgramOwnerEmail || identity.email;
  jsonResponse(response, 200, {
    ok: true,
    invites: listProgramInvites(store, ownerEmail).map(publicStaffInvite),
    members: listProgramMembers(store, ownerEmail),
    emailDeliveryReady: supportEmailConfigStatus().ready,
  });
}

async function handleStaffInviteCreate(request, response) {
  let identity;
  try {
    identity = await resolveStaffIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before inviting staff." });
    return;
  }
  const store = ensureStaffInviteCollections(readStore());
  const inviter = store.users?.[identity.email] || { email: identity.email, role: "owner", accountType: "home_daycare" };
  if (!canManageStaffInvites(inviter)) {
    jsonResponse(response, 403, { error: "Only owners and directors can invite staff." });
    return;
  }
  let body;
  try {
    body = await readJson(request);
  } catch {
    jsonResponse(response, 400, { error: "Invalid invite payload." });
    return;
  }
  const email = normalizeEmail(body.email || "");
  const role = String(body.role || "teacher").trim().toLowerCase();
  if (!email) {
    jsonResponse(response, 400, { error: "Enter the staff member's email address." });
    return;
  }
  if (!STAFF_INVITE_ROLES.has(role)) {
    jsonResponse(response, 400, { error: "Choose a valid staff role." });
    return;
  }
  if (email === identity.email) {
    jsonResponse(response, 400, { error: "You cannot invite your own account." });
    return;
  }
  const ownerEmail = normalizeEmail(inviter.linkedProgramOwnerEmail || identity.email);
  const existing = listProgramInvites(store, ownerEmail).find(
    (invite) => invite.email === email && invite.status === "pending" && !staffInviteIsExpired(invite),
  );
  if (existing) {
    jsonResponse(response, 409, { error: "That email already has a pending invite.", invite: publicStaffInvite(existing) });
    return;
  }
  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  const invite = {
    id: `invite-${Date.now().toString(36)}`,
    token,
    email,
    role,
    classroomId: String(body.classroomId || "").trim(),
    classroomName: String(body.classroomName || "").trim(),
    status: "pending",
    invitedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + STAFF_INVITE_TTL_MS).toISOString(),
    invitedByEmail: identity.email,
    invitedByUid: identity.uid,
    ownerEmail,
    accountType: inviter.accountType || "home_daycare",
    programName: String(body.programName || inviter.programSettings?.programName || "Little Learner Hub program").trim(),
    emailSent: false,
  };
  store.staffInvites[token] = invite;
  writeStore(store);

  const origin = String(body.appOrigin || "").replace(/\/$/, "") || "https://little-learner-hub.onrender.com";
  const acceptUrl = `${origin}/?staffInvite=${encodeURIComponent(token)}`;
  const roleLabel = role.replace(/_/g, " ");
  let emailResult = { sent: false, configured: supportEmailConfigStatus().ready };
  try {
    emailResult = await sendEmail({
      to: email,
      replyTo: identity.email,
      subject: `You're invited to join ${invite.programName} on Little Learner Hub`,
      text: [
        `Hi,`,
        ``,
        `${identity.email} invited you to join ${invite.programName} as a ${roleLabel}.`,
        invite.classroomName ? `Classroom: ${invite.classroomName}` : "",
        ``,
        `Accept your invite:`,
        acceptUrl,
        ``,
        `This invite expires on ${invite.expiresAt.slice(0, 10)}.`,
        ``,
        `— Little Learner Hub`,
      ].filter(Boolean).join("\n"),
      html: `
        <p>Hi,</p>
        <p><strong>${htmlEscape(identity.email)}</strong> invited you to join <strong>${htmlEscape(invite.programName)}</strong> as a <strong>${htmlEscape(roleLabel)}</strong>.</p>
        ${invite.classroomName ? `<p>Classroom: ${htmlEscape(invite.classroomName)}</p>` : ""}
        <p><a href="${htmlEscape(acceptUrl)}">Accept your invite</a></p>
        <p>This invite expires on ${htmlEscape(invite.expiresAt.slice(0, 10))}.</p>
        <p>— Little Learner Hub</p>
      `,
    });
  } catch (error) {
    emailResult = { sent: false, configured: supportEmailConfigStatus().ready, error: error.message };
  }
  invite.emailSent = Boolean(emailResult.sent);
  invite.emailError = emailResult.error || "";
  store.staffInvites[token] = invite;
  writeStore(store);

  jsonResponse(response, 200, {
    ok: true,
    invite: publicStaffInvite(invite),
    acceptUrl,
    email: emailResult,
    message: emailResult.sent
      ? "Invite created and email sent."
      : (emailResult.configured
        ? "Invite created, but the email could not be sent. Share the accept link manually."
        : "Invite created. Email delivery is not configured yet — share the accept link with your staff member."),
  });
}

async function handleStaffInviteRevoke(request, response, inviteId) {
  let identity;
  try {
    identity = await resolveStaffIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in before managing staff." });
    return;
  }
  const store = ensureStaffInviteCollections(readStore());
  const inviter = store.users?.[identity.email] || { email: identity.email, role: "owner" };
  if (!canManageStaffInvites(inviter)) {
    jsonResponse(response, 403, { error: "Only owners and directors can remove staff invites." });
    return;
  }
  const ownerEmail = normalizeEmail(inviter.linkedProgramOwnerEmail || identity.email);
  const match = Object.entries(store.staffInvites).find(([, invite]) => invite.id === inviteId && programOwnerKey(invite.ownerEmail || invite.invitedByEmail) === programOwnerKey(ownerEmail));
  if (!match) {
    jsonResponse(response, 404, { error: "Invite not found." });
    return;
  }
  const [token, invite] = match;
  invite.status = "revoked";
  invite.revokedAt = new Date().toISOString();
  store.staffInvites[token] = invite;
  writeStore(store);
  jsonResponse(response, 200, { ok: true, invite: publicStaffInvite(invite) });
}

function handleStaffInvitePeek(request, response, url) {
  const token = String(url.searchParams.get("token") || "").trim();
  if (!token) {
    jsonResponse(response, 400, { error: "Missing invite token." });
    return;
  }
  const store = ensureStaffInviteCollections(readStore());
  const invite = store.staffInvites[token];
  if (!invite) {
    jsonResponse(response, 404, { error: "This invite link is invalid or has already been removed." });
    return;
  }
  if (invite.status === "revoked") {
    jsonResponse(response, 410, { error: "This invite was revoked by the program owner.", invite: publicStaffInvite(invite) });
    return;
  }
  if (invite.status === "accepted") {
    jsonResponse(response, 200, { ok: true, invite: publicStaffInvite(invite), alreadyAccepted: true });
    return;
  }
  if (staffInviteIsExpired(invite)) {
    invite.status = "expired";
    store.staffInvites[token] = invite;
    writeStore(store);
    jsonResponse(response, 410, { error: "This invite has expired. Ask the owner to send a new one.", invite: publicStaffInvite(invite) });
    return;
  }
  jsonResponse(response, 200, { ok: true, invite: publicStaffInvite(invite) });
}

async function handleStaffInviteAccept(request, response) {
  let identity;
  try {
    identity = await resolveStaffIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Log in or create an account to accept this invite." });
    return;
  }
  let body;
  try {
    body = await readJson(request);
  } catch {
    jsonResponse(response, 400, { error: "Invalid accept payload." });
    return;
  }
  const token = String(body.token || "").trim();
  if (!token) {
    jsonResponse(response, 400, { error: "Missing invite token." });
    return;
  }
  const store = ensureStaffInviteCollections(readStore());
  const invite = store.staffInvites[token];
  if (!invite) {
    jsonResponse(response, 404, { error: "This invite link is invalid or has already been removed." });
    return;
  }
  if (invite.status === "revoked") {
    jsonResponse(response, 410, { error: "This invite was revoked by the program owner." });
    return;
  }
  if (staffInviteIsExpired(invite)) {
    invite.status = "expired";
    store.staffInvites[token] = invite;
    writeStore(store);
    jsonResponse(response, 410, { error: "This invite has expired. Ask the owner to send a new one." });
    return;
  }
  if (normalizeEmail(identity.email) !== normalizeEmail(invite.email)) {
    jsonResponse(response, 403, {
      error: `Sign in as ${invite.email} to accept this invite. You are currently signed in as ${identity.email}.`,
      requiredEmail: invite.email,
    });
    return;
  }
  const ownerEmail = normalizeEmail(invite.ownerEmail || invite.invitedByEmail);
  const owner = store.users?.[ownerEmail] || { email: ownerEmail };
  const ownerHasPro = membershipHasProAccess(owner);
  const program = programOwnership.ensureProgramForOwner(store, ownerEmail, {
    ownerUid: owner.firebaseUid || "",
    name: invite.programName || owner.businessName || owner.daycareName || "",
    actorEmail: identity.email,
  });
  const now = new Date().toISOString();
  const memberRecord = {
    email: identity.email,
    uid: identity.uid,
    role: invite.role,
    classroomId: invite.classroomId || "",
    classroomName: invite.classroomName || "",
    status: "active",
    joinedAt: now,
    inviteId: invite.id,
    programId: program.id,
  };
  const existingMembers = listProgramMembers(store, ownerEmail).filter((member) => normalizeEmail(member.email) !== identity.email);
  store.programMembers[programOwnerKey(ownerEmail)] = [...existingMembers, memberRecord];
  invite.status = "accepted";
  invite.acceptedAt = now;
  invite.acceptedByUid = identity.uid;
  invite.programId = program.id;
  store.staffInvites[token] = invite;
  store.users = store.users || {};
  store.users[identity.email] = {
    ...(store.users[identity.email] || { email: identity.email }),
    email: identity.email,
    role: invite.role,
    accountType: invite.accountType || owner.accountType || "home_daycare",
    linkedProgramOwnerEmail: ownerEmail,
    programId: program.id,
    classroomIds: invite.classroomId ? [invite.classroomId] : [],
    classroomName: invite.classroomName || "",
    programAccessViaOwner: ownerHasPro,
    staffInviteAcceptedAt: now,
    updatedAt: now,
  };
  writeStore(store);
  jsonResponse(response, 200, {
    ok: true,
    invite: publicStaffInvite(invite),
    member: memberRecord,
    account: {
      email: identity.email,
      role: invite.role,
      accountType: invite.accountType || owner.accountType || "home_daycare",
      linkedProgramOwnerEmail: ownerEmail,
      programId: program.id,
      classroomIds: invite.classroomId ? [invite.classroomId] : [],
      classroomName: invite.classroomName || "",
      programAccessViaOwner: ownerHasPro,
    },
  });
}


const MAX_ANALYTICS_EVENTS = 25000;

async function handleAnalyticsEvent(request, response) {
  const body = await readJson(request);
  const event = sanitizeAnalyticsEvent(body, request);
  const store = readStore();
  store.analyticsEvents = store.analyticsEvents || [];
  if (!store.analyticsEvents.some((item) => item.id === event.id)) {
    store.analyticsEvents.push(event);
  }
  if (store.analyticsEvents.length > MAX_ANALYTICS_EVENTS) {
    store.analyticsEvents = store.analyticsEvents.slice(-MAX_ANALYTICS_EVENTS);
  }
  updateAnalyticsUser(store, event);
  if (["checkout_success", "subscription_canceled"].includes(event.name)) recordBillingEvent(store, event);
  writeStore(store);
  jsonResponse(response, 200, { ok: true });
}

function countEventsNamed(events, names) {
  const set = new Set(Array.isArray(names) ? names : [names]);
  return events.filter((event) => set.has(event.name)).length;
}

function isWithinDays(iso, days) {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= days * 24 * 60 * 60 * 1000;
}

function isSameUtcDay(iso, now = new Date()) {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return d.getUTCFullYear() === now.getUTCFullYear()
    && d.getUTCMonth() === now.getUTCMonth()
    && d.getUTCDate() === now.getUTCDate();
}

function ensureFoundingMemberUserStubs(store) {
  store.users = store.users || {};
  store.foundingMembers = store.foundingMembers || [];
  let changed = false;
  store.foundingMembers.forEach((email, idx) => {
    const clean = normalizeEmail(email);
    if (!clean) return;
    const existing = store.users[clean];
    if (!existing) {
      store.users[clean] = {
        email: clean,
        plan: "Founding",
        planDisplayName: "Founding Member",
        foundingMember: true,
        foundingMemberActive: true,
        foundingMemberHistorical: true,
        foundingMemberNumber: PUBLIC_FOUNDING_CLAIMED_BASE + idx + 1,
        monthlyPrice: "$9.99/month",
        priceLock: "Lifetime",
        subscriptionCadence: "monthly",
        subscriptionStatus: "Founding Member Subscription Active",
        accountStatus: "Active",
        createdAt: new Date().toISOString(),
        signupAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      changed = true;
      return;
    }
    if (!existing.foundingMemberNumber) {
      existing.foundingMemberNumber = PUBLIC_FOUNDING_CLAIMED_BASE + idx + 1;
      existing.foundingMember = true;
      existing.foundingMemberHistorical = true;
      existing.updatedAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) writeStore(store);
  return changed;
}

function analyticsSummary(store) {
  ensureFoundingMemberUserStubs(store);
  const events = (store.analyticsEvents || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const chronological = events.slice().reverse();
  const users = Object.values(store.users || {});
  // Session visits = website_visit only. Page views are counted separately so one
  // homepage load is not counted as 2–3 "visitors".
  const sessionVisits = events.filter((event) => event.name === "website_visit");
  const pageViews = events.filter((event) => event.name === "page_view");
  const trafficEvents = events.filter((event) => event.name === "website_visit" || event.name === "page_view");
  const signups = events.filter((event) => event.name === "account_signup_complete");
  const paidEvents = events.filter((event) => event.name === "checkout_success");
  const billingEvents = store.billingEvents || [];
  const uniqueVisitors = new Set(trafficEvents.map((event) => event.visitorId || event.user || event.sessionId || event.ipHash).filter(Boolean));
  const visitorDays = {};
  trafficEvents.forEach((event) => {
    const id = event.visitorId || event.user || event.sessionId || event.ipHash || "unknown";
    visitorDays[id] = visitorDays[id] || new Set();
    visitorDays[id].add(analyticsDateKey(event.createdAt));
  });
  const returningVisitors = Object.values(visitorDays).filter((days) => days.size > 1).length;
  const paidUsers = users.filter((user) => membershipHasProAccess(user) && String(user.accountStatus || "Active") !== "Disabled");
  const currentAccessCounts = {
    free: users.filter((user) => membershipAccess.membershipCurrentAccessKey(user) === "free").length,
    trial: users.filter((user) => membershipAccess.membershipCurrentAccessKey(user) === "trial").length,
    pro: users.filter((user) => membershipAccess.membershipCurrentAccessKey(user) === "pro").length,
    founding: users.filter((user) => membershipAccess.membershipCurrentAccessKey(user) === "founding").length,
    pastDue: users.filter((user) => membershipAccess.membershipCurrentAccessKey(user) === "past_due").length,
  };
  const billingStatusCounts = {
    active: users.filter((user) => membershipAccess.membershipBillingStatusKey(user) === "active").length,
    canceling: users.filter((user) => membershipAccess.membershipBillingStatusKey(user) === "canceling").length,
    canceled: users.filter((user) => membershipAccess.membershipBillingStatusKey(user) === "canceled").length,
    ended: users.filter((user) => membershipAccess.membershipBillingStatusKey(user) === "ended").length,
    paymentFailed: users.filter((user) => membershipAccess.membershipBillingStatusKey(user) === "payment_failed").length,
    neverSubscribed: users.filter((user) => membershipAccess.membershipBillingStatusKey(user) === "never_subscribed").length,
  };
  const subscriptionAccessAudit = membershipAccess.membershipAdminAuditBuckets(users);
  const canceledUsers = users.filter((user) => ["canceled", "ended"].includes(membershipAccess.membershipBillingStatusKey(user)));
  const cancelingUsers = users.filter((user) => membershipAccess.membershipBillingStatusKey(user) === "canceling");
  const trialUsers = users.filter((user) => membershipAccess.membershipCurrentAccessKey(user) === "trial");
  const pastDueUsers = users.filter((user) => membershipAccess.membershipCurrentAccessKey(user) === "past_due");
  const failedPaymentUsers = users.filter((user) => membershipAccess.membershipBillingStatusKey(user) === "payment_failed");
  const revenueItems = [
    ...paidEvents,
    ...billingEvents.filter((event) => !String(event.type || "").toLowerCase().includes("cancel")),
  ];
  const now = new Date();
  const activityAt = (user) => user.lastSeenAt || user.lastLoginAt || "";
  const onlineWindowMs = 15 * 60 * 1000;
  const usersOnlineNow = users.filter((user) => {
    const ts = new Date(activityAt(user) || 0).getTime();
    return Number.isFinite(ts) && (Date.now() - ts) <= onlineWindowMs;
  }).length;
  const activeUsersToday = users.filter((user) => isSameUtcDay(activityAt(user), now)).length;
  const activeUsersWeek = users.filter((user) => isWithinDays(activityAt(user), 7)).length;
  const activeUsersMonth = users.filter((user) => isWithinDays(activityAt(user), 30)).length;
  const newSignupsToday = users.filter((user) => isSameUtcDay(user.signupAt || user.createdAt, now)).length;
  const newUsersWeek = users.filter((user) => isWithinDays(user.signupAt || user.createdAt, 7)).length;
  const newUsersMonth = users.filter((user) => isWithinDays(user.signupAt || user.createdAt, 30)).length;
  const monthKeyNow = analyticsMonthKey(now.toISOString());
  const revenueThisMonth = Number((revenueItems
    .filter((event) => analyticsMonthKey(event.createdAt) === monthKeyNow)
    .reduce((total, event) => total + moneyNumber(event.amount || event.detail?.monthlyPrice || event.detail?.amount), 0)
  ).toFixed(2));
  const monthlyRecurringRevenue = Number(paidUsers.reduce((total, user) => {
    const price = moneyNumber(user.monthlyPrice || user.displayPrice || "");
    if (price > 0) return total + (String(user.subscriptionCadence || "").toLowerCase().includes("year") ? Number((price / 12).toFixed(2)) : price);
    if (membershipAccess.membershipCurrentAccessKey(user) === "founding") return total + 9.99;
    if (membershipAccess.membershipCurrentAccessKey(user) === "pro") return total + 19.99;
    return total;
  }, 0).toFixed(2));
  const trialEndingSoon = trialUsers.filter((user) => {
    if (!user.trialEnd) return false;
    const end = new Date(user.trialEnd).getTime();
    if (!Number.isFinite(end)) return false;
    const daysLeft = (end - Date.now()) / (24 * 60 * 60 * 1000);
    return daysLeft >= 0 && daysLeft <= 3;
  }).length;
  const inactiveUsers = users.filter((user) => {
    const ts = user.lastSeenAt || user.lastLoginAt || user.signupAt || user.createdAt;
    return !isWithinDays(ts, 14);
  }).length;
  // Peek curriculum arrays only — avoid normalizedSiteContent() here (can be multi-MB).
  const rawCurriculum = store.siteContent?.curriculum && typeof store.siteContent.curriculum === "object"
    ? store.siteContent.curriculum
    : {};
  const lessonPlans = Array.isArray(rawCurriculum.lessonPlans) ? rawCurriculum.lessonPlans : [];
  const activities = Array.isArray(rawCurriculum.activities) ? rawCurriculum.activities : [];
  const draftLessonPlans = lessonPlans.filter((plan) => String(plan.status || "").toLowerCase() === "draft").length;
  const publishedLessonPlans = lessonPlans.filter((plan) => ["published", "featured", "approved"].includes(String(plan.status || "").toLowerCase())).length;
  const printableCount = Array.isArray(store.siteContent?.printables) ? store.siteContent.printables.length : 0;
  const newFoundingMembers = users.filter((user) => (
    membershipAccess.membershipFoundingActive(user) && isWithinDays(user.subscriptionStartedAt || user.signupAt || user.createdAt, 30)
  )).length;
  const homeDaycareAccounts = users.filter((user) => accountAccess.resolveAccountType(user) === "home_daycare").length;
  const centerAccounts = users.filter((user) => accountAccess.resolveAccountType(user) === "center").length;
  const singleProviderAccounts = users.filter((user) => accountAccess.resolveAccountType(user) === "single_provider").length;
  const isLessonResourceView = (event) => {
    if (event.name === "lesson_plan_view" || event.name === "curriculum_lesson_view") return true;
    if (event.name !== "resource_view") return false;
    const category = String(event.detail?.category || "").toLowerCase();
    return category.includes("lesson");
  };
  const lessonPlansViewed = events.filter(isLessonResourceView).length;
  const lessonPlansAddedToCalendar = countEventsNamed(events, [
    "lesson_plan_added_to_calendar",
    "calendar_lesson_assigned",
    "add_to_calendar",
    "schedule_assign_lesson",
    "curriculum_planner_assign",
    "lesson_use_this_plan_main_calendar",
    "lesson_add_to_my_week",
  ]);
  const dailyLogsCreated = countEventsNamed(events, ["daily_log_created", "daily_report_saved"]);
  const observationsCreated = countEventsNamed(events, ["observation_created", "observation_saved"]);
  const incidentReportsCreated = countEventsNamed(events, ["incident_report_created", "incident_report_generated"]);
  // Parent messages only — do not treat every AI generation as a parent message.
  const parentMessagesGenerated = countEventsNamed(events, ["parent_message_generated"]);
  const formsSubmitted = countEventsNamed(events, ["form_submitted", "forms_submitted", "feedback_submitted"]);
  const feedbackItems = store.feedbackItems || [];
  const supportTickets = store.supportTickets || [];
  const openFeedback = feedbackItems.filter((item) => !["Resolved", "Completed", "Archived"].includes(item.status)).length;
  const openTickets = supportTickets.filter((ticket) => ticket.status !== "Complete").length;
  const bugReports = supportTickets.filter((ticket) => /bug/i.test(String(ticket.type || ticket.category || ticket.subject || ""))).length;
  const featureRequests = supportTickets.filter((ticket) => /feature/i.test(String(ticket.type || ticket.category || ticket.subject || ""))).length;
  const openBugReports = supportTickets.filter((ticket) => ticket.status !== "Complete" && /bug/i.test(String(ticket.type || ticket.category || ticket.subject || ""))).length;
  const openFeatureRequests = supportTickets.filter((ticket) => ticket.status !== "Complete" && /feature/i.test(String(ticket.type || ticket.category || ticket.subject || ""))).length;

  // Index events once — nested events.filter per user was O(users * events) and
  // combined with per-user readStore() clones this endpoint OOMed on Render.
  const eventsByUser = new Map();
  for (const event of events) {
    const email = event.user;
    if (!email || email === "guest") continue;
    let list = eventsByUser.get(email);
    if (!list) {
      list = [];
      eventsByUser.set(email, list);
    }
    list.push(event);
  }

  const userRows = users
    .map((user) => {
      const userEvents = eventsByUser.get(user.email) || [];
      const displayName = user.name || user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || "";
      const featureUsage = user.featureUsage || {};
      const countUsage = (names, featureKeys = names) => {
        const fromEvents = userEvents.filter((event) => names.includes(event.name)).length;
        const fromFeatures = featureKeys.reduce((total, key) => total + Number(featureUsage[key] || 0), 0);
        // Prefer event history; featureUsage is a fallback when events were not retained.
        return Math.max(fromEvents, fromFeatures);
      };
      const usage = {
        lessonPlansViewed: Math.max(
          userEvents.filter(isLessonResourceView).length,
          Number(featureUsage.lesson_plan_view || featureUsage.curriculum_lesson_view || 0),
        ),
        lessonPlansAddedToCalendar: countUsage([
          "lesson_plan_added_to_calendar",
          "calendar_lesson_assigned",
          "add_to_calendar",
          "schedule_assign_lesson",
          "curriculum_planner_assign",
          "lesson_use_this_plan_main_calendar",
          "lesson_add_to_my_week",
        ]),
        observationsCreated: countUsage(["observation_created", "observation_saved"]),
        dailyLogsCreated: countUsage(["daily_log_created", "daily_report_saved"]),
        formsSubmitted: countUsage(["form_submitted", "forms_submitted", "feedback_submitted"]),
      };
      return {
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        fullName: displayName,
        name: displayName,
        plan: user.plan || "Free",
        planDisplayName: user.planDisplayName || user.plan || "Free",
        accountStatus: user.accountStatus || "Active",
        trialStatus: user.trialStatus || "No Trial",
        trialStart: user.trialStart || "",
        trialEnd: user.trialEnd || "",
        stripeCustomerId: user.stripeCustomerId || "",
        stripeSubscriptionId: user.stripeSubscriptionId || "",
        subscriptionStatus: user.subscriptionStatus || "Free Plan",
        subscriptionState: user.subscriptionState || "No Subscription",
        signupAt: user.signupAt || user.createdAt || "",
        createdAt: user.createdAt || user.signupAt || "",
        lastLoginAt: user.lastLoginAt || "",
        // Activity must not fall back to updatedAt (admin edits / stubs looked "active").
        lastSeenAt: user.lastSeenAt || user.lastLoginAt || "",
        monthlyPrice: user.monthlyPrice || "",
        foundingMember: Boolean(user.foundingMember),
        foundingMemberNumber: user.foundingMemberNumber || null,
        featureUseCount: userEvents.length || Object.values(featureUsage).reduce((total, value) => total + Number(value || 0), 0),
        topFeatures: topFeaturePairs(userEvents),
        businessName: user.businessName || user.daycareName || user.programName || "",
        daycareName: user.daycareName || user.businessName || user.programName || "",
        subscriptionCadence: user.subscriptionCadence || "",
        subscriptionStartedAt: user.subscriptionStartedAt || "",
        priceLock: user.priceLock || "",
        usage,
        ...membershipSummaryForUser(user, store),
        accountTypeLabel: accountAccess.accountTypeLabel(user.accountType || accountAccess.resolveAccountType(user)),
        roleLabel: accountAccess.roleLabel(user.role || accountAccess.resolveUserRole(user)),
      };
    })
    .sort((a, b) => new Date(b.lastSeenAt || b.signupAt || 0) - new Date(a.lastSeenAt || a.signupAt || 0));
  return {
    mode: "Server historical analytics",
    updatedAt: new Date().toISOString(),
    totals: {
      // Unique browsers/devices that visited (primary "how many viewers" number).
      uniqueVisitors: uniqueVisitors.size,
      // Session visits = website_visit events (one per browser session boot).
      visitors: sessionVisits.length,
      sessionVisits: sessionVisits.length,
      pageViewCount: pageViews.length,
      // Completed signup events only — registered users are tracked separately.
      signups: signups.length,
      totalRegisteredUsers: users.length,
      freeUsers: currentAccessCounts.free,
      trialUsers: trialUsers.length,
      proUsers: currentAccessCounts.pro,
      foundingMembers: currentAccessCounts.founding,
      homeDaycareAccounts,
      centerAccounts,
      singleProviderAccounts,
      paidUsers: paidUsers.length,
      // Align with Users drill-down (billingStatus === "active").
      activeSubscriptions: billingStatusCounts.active,
      paidAccessNotCanceling: paidUsers.filter((user) => !user.cancelAtPeriodEnd).length,
      // Active usage (not "paid users") — keep paidUsers for billing metrics.
      activeUsers: activeUsersMonth,
      usersOnlineNow,
      activeUsersToday,
      activeUsersWeek,
      activeUsersMonth,
      cancelingSubscriptions: cancelingUsers.length,
      canceledSubscriptions: canceledUsers.length,
      pastDueUsers: pastDueUsers.length,
      failedPayments: failedPaymentUsers.length,
      currentAccessCounts,
      billingStatusCounts,
      subscriptionAccessAudit,
      returningVisitors,
      visitorToSignupRate: rate(users.length, Math.max(uniqueVisitors.size, 1)),
      signupToPaidRate: rate(paidUsers.length, Math.max(users.length, 1)),
      visitorToPaidRate: rate(paidUsers.length, Math.max(uniqueVisitors.size, 1)),
      trialConversionRate: rate(
        paidUsers.filter((user) => membershipAccess.membershipHasTrialHistory(user)).length,
        Math.max(
          trialUsers.length + paidUsers.filter((user) => membershipAccess.membershipHasTrialHistory(user)).length,
          1,
        ),
      ),
      totalRevenue: Number(revenueItems.reduce((total, event) => total + moneyNumber(event.amount || event.detail?.monthlyPrice || event.detail?.amount), 0).toFixed(2)),
      revenueThisMonth,
      monthlyRecurringRevenue,
      newSignupsToday,
      newUsersWeek,
      newUsersMonth,
      newFoundingMembers,
      trialEndingSoon,
      inactiveUsers,
      trialConversions: paidEvents.filter((event) => isWithinDays(event.createdAt, 30)).length,
      subscriptionConversions: paidUsers.filter((user) => isWithinDays(user.subscriptionStartedAt || user.signupAt, 30)).length,
      lessonPlansViewed,
      lessonPlansAddedToCalendar,
      dailyLogsCreated,
      observationsCreated,
      incidentReportsCreated,
      parentMessagesGenerated,
      formsSubmitted,
      openFeedback,
      openSupportTickets: openTickets,
      bugReports,
      featureRequests,
      openBugReports,
      openFeatureRequests,
      draftLessonPlans,
      publishedLessonPlans,
      activityCount: activities.length,
      printableCount,
      promoRedemptionsTotal: promoRedemptionRecords(store).length,
      promoCodesActive: promoCodeRecords(store).filter((item) => String(item.status || "active").toLowerCase() === "active").length,
      topLessonViews: Object.entries(countBy(
        events.filter(isLessonResourceView),
        (event) => event.detail?.title || event.detail?.resourceId || event.detail?.lessonId || "Lesson",
      )).sort((a, b) => b[1] - a[1]).slice(0, 8),
      topDownloads: Object.entries(countBy(
        events.filter((event) => ["resource_print", "generated_pdf", "generated_print", "provider_tool_pdf", "resource_download", "lesson_docx_download"].includes(event.name)),
        (event) => event.detail?.title || event.detail?.category || event.detail?.tool || event.name,
      )).sort((a, b) => b[1] - a[1]).slice(0, 8),
    },
    periods: {
      dailyVisitors: countBy(sessionVisits, (event) => analyticsDateKey(event.createdAt)),
      weeklyVisitors: countBy(sessionVisits, (event) => analyticsWeekKey(event.createdAt)),
      monthlyVisitors: countBy(sessionVisits, (event) => analyticsMonthKey(event.createdAt)),
      dailyPageViews: countBy(pageViews, (event) => analyticsDateKey(event.createdAt)),
      dailyRevenue: moneyBy(revenueItems, (event) => analyticsDateKey(event.createdAt)),
      weeklyRevenue: moneyBy(revenueItems, (event) => analyticsWeekKey(event.createdAt)),
      monthlyRevenue: moneyBy(revenueItems, (event) => analyticsMonthKey(event.createdAt)),
      yearlyRevenue: moneyBy(revenueItems, (event) => String(new Date(event.createdAt || Date.now()).getUTCFullYear())),
    },
    counts: {
      pageViews: countBy(pageViews, (event) => event.detail?.view || event.path || event.hash || "Home"),
      sources: countBy(sessionVisits.length ? sessionVisits : trafficEvents, detectEventSource),
      buttonClicks: countBy(events.filter((event) => event.name === "button_click"), (event) => event.detail?.label || event.detail?.action || "Button"),
      aiUsage: countBy(events.filter((event) => event.name === "ai_generation_success"), (event) => event.detail?.tool || "Document Helper"),
      resourceViews: countBy(events.filter((event) => event.name === "resource_view"), (event) => event.detail?.category || "Resource"),
      resourcePrints: countBy(events.filter((event) => ["resource_print", "generated_pdf", "generated_print", "provider_tool_pdf"].includes(event.name)), (event) => event.detail?.category || event.detail?.tool || "Printable/PDF"),
      featureUsage: countBy(events.filter((event) => [
        "button_click",
        "ai_generation_success",
        "resource_view",
        "resource_print",
        "generated_pdf",
        "generated_print",
        "provider_tool_pdf",
        "checkout_start",
        "checkout_success",
        "lesson_plan_added_to_calendar",
        "schedule_assign_lesson",
        "curriculum_planner_assign",
        "observation_created",
        "daily_log_created",
        "form_submitted",
        "feedback_submitted",
        "parent_message_generated",
        "incident_report_created",
      ].includes(event.name)), (event) => event.name),
    },
    users: userRows,
    feedback: feedbackItems.slice(0, 200),
    supportTickets: supportTickets.slice(0, 200).map(publicTicket),
    recentEvents: events.slice(0, 25),
    rawEventCount: chronological.length,
  };
}

function handleAdminAnalytics(request, response, url) {
  const startedAt = Date.now();
  const token = String(url.searchParams.get("adminToken") || "").trim();
  const tokenPrefix = token ? `${token.slice(0, 12)}…` : "(empty)";
  console.log("[admin-analytics] request", {
    tokenPrefix,
    tokenValid: validAdminToken(token),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
  if (!validAdminToken(token)) {
    console.warn("[admin-analytics] rejected — invalid admin token", { tokenPrefix });
    jsonResponse(response, 401, {
      error: "Admin access is required.",
      code: "admin_session_invalid",
      hint: "Unlock Admin again with owner email, password, and access code. Browser unlock state can outlive a lost server session after deploy or store sync.",
    });
    return;
  }
  try {
    // peekStore: do not structuredClone the entire production store for this read.
    const store = peekStore();
    const session = store.adminSessions?.[token] || {};
    const userCount = Object.keys(store.users || {}).length;
    const eventCount = (store.analyticsEvents || []).length;
    console.log("[admin-analytics] building summary", {
      email: session.email || "",
      userCount,
      eventCount,
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
    const analytics = analyticsSummary(store);
    console.log("[admin-analytics] success", {
      email: session.email || "",
      ms: Date.now() - startedAt,
      usersReturned: (analytics.users || []).length,
      rawEventCount: analytics.rawEventCount,
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
    jsonResponse(response, 200, { analytics });
  } catch (error) {
    console.error("[admin-analytics] FAILED", {
      message: error?.message,
      stack: error?.stack,
      ms: Date.now() - startedAt,
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
    jsonResponse(response, 500, {
      error: error?.message || "Admin analytics failed.",
      code: "admin_analytics_failed",
      hint: "Server failed while building analytics. Check Render logs for [admin-analytics] FAILED.",
    });
  }
}

async function handleAdminMembershipUpdate(request, response) {
  const body = await readJson(request);
  const token = body.adminToken || "";
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const email = normalizeEmail(body.email);
  const updates = body.updates && typeof body.updates === "object" ? body.updates : null;
  if (!email || !updates) {
    jsonResponse(response, 400, { error: "email and updates are required." });
    return;
  }
  if (updates.plan === "Founding" && !updates.foundingMember && !updates.foundingMemberActive && !updates.restoreFoundingPrice) {
    jsonResponse(response, 400, {
      error: "Founding Member can only be assigned with an explicit foundingMemberActive or restoreFoundingPrice admin override.",
    });
    return;
  }
  const store = readStore();
  const existing = store.users?.[email] || { email };
  const restoringFounding = updates.restoreFoundingPrice === true || (updates.foundingMemberActive === true && membershipAccess.membershipFoundingHistorical(existing));
  const assigningNewFounding = (updates.plan === "Founding" || updates.foundingMemberActive) && !existing.foundingMemberNumber && !(store.foundingMembers || []).includes(email);
  if (assigningNewFounding && foundingSpotsRemaining(store) <= 0) {
    jsonResponse(response, 409, { error: "All 50 Founding Member spots are claimed. Cannot assign a new founding spot." });
    return;
  }
  const auditEntry = {
    id: `mem_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    email,
    action: body.action || "admin_membership_update",
    updates,
    adminEmail: body.adminEmail || ADMIN_EMAIL || "admin",
    note: String(body.note || "Internal admin access override — does not change Stripe billing automatically."),
    createdAt: new Date().toISOString(),
  };
  store.membershipAudit = store.membershipAudit || [];
  store.membershipAudit.unshift(auditEntry);
  store.membershipAudit = store.membershipAudit.slice(0, 500);
  const merged = { ...existing, ...updates, email, updatedAt: new Date().toISOString() };
  if (updates.internalAccessOverride === true) {
    merged.internalAccessOverride = true;
  }
  if (restoringFounding || updates.foundingMemberActive === true) {
    merged.foundingMemberActive = true;
    merged.foundingMemberHistorical = true;
    merged.foundingMember = true;
    merged.plan = "Founding";
    merged.monthlyPrice = "$9.99/month";
    merged.priceLock = "Lifetime";
    merged.subscriptionCadence = "monthly";
    if (existing.foundingMemberNumber || (store.foundingMembers || []).includes(email)) {
      const idx = (store.foundingMembers || []).indexOf(email);
      merged.foundingMemberNumber = existing.foundingMemberNumber
        || (idx >= 0 ? PUBLIC_FOUNDING_CLAIMED_BASE + idx + 1 : null);
    } else if (assigningNewFounding) {
      const claim = claimFoundingSpot(email);
      merged.foundingMemberNumber = claim.foundingMemberNumber || merged.foundingMemberNumber;
    }
  } else if (merged.plan === "Founding" && merged.foundingMember) {
    const claim = claimFoundingSpot(email);
    merged.foundingMemberNumber = claim.foundingMemberNumber || merged.foundingMemberNumber;
    merged.foundingMemberActive = true;
    merged.foundingMemberHistorical = true;
  }
  if (merged.plan === "Free" && !restoringFounding) {
    merged.foundingMemberActive = false;
  }
  if (updates.accountStatus === "Disabled" || updates.disabled === true) {
    merged.accountStatus = "Disabled";
  } else if (updates.accountStatus === "Active" || updates.disabled === false || updates.reenable === true) {
    merged.accountStatus = "Active";
  }
  if (Number.isFinite(Number(updates.extendTrialDays)) && Number(updates.extendTrialDays) > 0) {
    const base = merged.trialEnd ? new Date(merged.trialEnd) : new Date();
    if (!Number.isFinite(base.getTime())) base.setTime(Date.now());
    base.setUTCDate(base.getUTCDate() + Number(updates.extendTrialDays));
    merged.trialEnd = base.toISOString();
    // Access layer matches trialStatus.includes("in trial") — keep that wording.
    merged.trialStatus = "In Trial";
    merged.accessEndsAt = merged.trialEnd;
    if (!merged.plan || merged.plan === "Free") merged.plan = "Pro";
    if (!merged.subscriptionStatus || String(merged.subscriptionStatus).toLowerCase().includes("free")) {
      merged.subscriptionStatus = "Trialing — Access Ends " + merged.trialEnd.slice(0, 10);
    }
    if (!merged.trialStart) merged.trialStart = new Date().toISOString();
  }
  const accessFields = accountAccess.migrateAccountAccessFields(merged);
  merged.accountType = accessFields.accountType;
  merged.role = accessFields.role;
  store.users = store.users || {};
  store.users[email] = merged;
  writeStore(store);
  jsonResponse(response, 200, {
    ok: true,
    user: { ...merged, ...membershipSummaryForUser(merged) },
    audit: auditEntry,
  });
}

async function handlePublicSiteContent(request, response, url) {
  const store = peekStore();
  const content = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  const defaults = normalizedSiteContent(defaultSiteContentStore());
  const publicForms = (content.forms || []).filter((item) => item.visible === true && item.archived !== true);
  // Printables marketplace removed from the public product surface.
  const publicPrintables = [];
  const publicMenus = (content.menus || []).filter((item) => item.visible === true && item.archived !== true);
  const publicObservations = (content.observations || []).filter((item) => item.visible === true && item.archived !== true);
  const publicReviews = (content.reviews || []).filter((item) => item.visible !== false);
  const publicFaqs = (content.faqs || []).filter((item) => item.visible !== false);
  // Draft/hidden marketing copy must not ship on the public API. Admin GET keeps full content.
  const publicPricing = content.pricing?._draft === true ? defaults.pricing : content.pricing;
  const publicFounding = content.founding?._draft === true ? defaults.founding : content.founding;
  const publicAnnouncementContent = (content.announcement?._draft === true || content.announcement?.visible !== true)
    ? defaults.announcement
    : content.announcement;
  const publicUpgradeMessaging = content.upgradeMessaging?._draft === true
    ? defaults.upgradeMessaging
    : content.upgradeMessaging;
  const { featureFlags, curriculum, lessonPlans, customLessonPlans, activities, ...publicSiteContent } = content;
  // Paid users get the full unlocked library. Grandfathered Free get legacy Free.
  // Guests / new Free get the curated sample.
  let curriculumLibrary = {
    lessonPlans: [],
    activities: [],
    resources: [],
    updatedAt: "",
  };
  try {
    const access = await resolveCurriculumAccessUser(request, url);
    if (access?.authorized) {
      curriculumLibrary = authorizedCurriculumLibraryDto(content) || curriculumLibrary;
    } else {
      const accessContext = access?.user
        ? freePlanAccessContextFromUser(access.user, content)
        : { legacyFree: false, mode: "curated", siteContent: content };
      curriculumLibrary = publicCurriculumLibraryDto(content, accessContext) || curriculumLibrary;
    }
  } catch {
    curriculumLibrary = publicCurriculumLibraryDto(content, {
      legacyFree: false,
      mode: "curated",
      siteContent: content,
    }) || curriculumLibrary;
  }
  const grandfatherConfig = freePlanGrandfathering.resolveConfig({ siteContent: content });
  const freePlanAccess = normalizedFreePlanAccess({
    ...(content.freePlanAccess || {}),
    enabled: grandfatherConfig.enabled,
    curatedCutoffAt: grandfatherConfig.curatedCutoffAt,
    missingDateMeansLegacy: grandfatherConfig.missingDateMeansLegacy,
    earlySupporterTitle: grandfatherConfig.earlySupporterTitle,
    earlySupporterBody: grandfatherConfig.earlySupporterBody,
  });
  jsonResponse(response, 200, {
    siteContent: {
      ...publicSiteContent,
      // Phase 2H: legacy lesson/activity CMS fields are retired from the public API.
      lessonPlans: {},
      customLessonPlans: [],
      activities: [],
      forms: publicForms,
      printables: publicPrintables,
      menus: publicMenus,
      observations: publicObservations,
      reviews: publicReviews,
      faqs: publicFaqs,
      pricing: publicPricing,
      founding: publicFounding,
      announcement: publicAnnouncementContent,
      upgradeMessaging: publicUpgradeMessaging,
      playBasedCurriculum: true,
      freePlanAccess,
      curriculumLibrary,
    },
  });
}

async function handleCurriculumLessonPlanDetail(request, response, url, planId) {
  const cleanId = normalizedShortText(planId, 160);
  if (!cleanId) {
    jsonResponse(response, 400, { error: "Lesson plan id is required." });
    return;
  }
  const store = readStore();
  const curriculum = readSiteCurriculum(store);
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  const rawPlan = curriculum.lessonPlans.find((item) => item.id === cleanId);
  const plan = normalizedCurriculumLessonPlan(rawPlan);
  if (!plan || !isCurriculumLessonPublic(plan.status)) {
    jsonResponse(response, 404, { error: "Lesson plan not found." });
    return;
  }
  const access = await resolveCurriculumAccessUser(request, url);
  if (access.authorized) {
    jsonResponse(response, 200, { lessonPlan: authorizedCurriculumLessonPlanDto(rawPlan) });
    return;
  }
  const accessContext = freePlanAccessContextFromUser(access.user, siteContent);
  if (userMayUnlockFreeCurriculumPlan(plan, accessContext)) {
    jsonResponse(response, 200, { lessonPlan: curriculumLessonPlanUnlockedFreeDto(rawPlan) });
    return;
  }
  if (freePlanGrandfathering.isLegacyStoreFreePlan(plan) || freeCurriculumSample.isCuratedFreeLessonPlan(plan)) {
    // Should be unlocked above; keep preview fallback for safety.
    jsonResponse(response, 200, { lessonPlan: publicCurriculumLessonPlanPreviewDto(rawPlan) });
    return;
  }
  jsonResponse(response, 403, { error: "Pro access is required for this lesson plan." });
}

async function handleCurriculumActivityDetail(request, response, url, activityId) {
  const cleanId = normalizedShortText(activityId, 160);
  if (!cleanId) {
    jsonResponse(response, 400, { error: "Activity id is required." });
    return;
  }
  const store = readStore();
  const curriculum = readSiteCurriculum(store);
  const candidates = curriculum.activities.filter((item) => item.id === cleanId && item.status === "published");
  if (!candidates.length) {
    jsonResponse(response, 404, { error: "Activity not found." });
    return;
  }
  const entries = candidates.map((rawActivity) => {
    const rawParent = curriculum.lessonPlans.find((item) => item.id === rawActivity.lessonPlanId);
    return {
      rawActivity,
      parentMeta: curriculumParentPlanMeta(rawParent),
    };
  }).filter((entry) => entry.parentMeta);
  if (!entries.length) {
    jsonResponse(response, 404, { error: "Activity not found." });
    return;
  }
  const access = await resolveCurriculumAccessUser(request, url);
  if (access.authorized) {
    const proEntry = entries.find((entry) => entry.parentMeta.plan === "Pro") || entries[0];
    jsonResponse(response, 200, { activity: authorizedCurriculumActivityDto(proEntry.rawActivity, proEntry.parentMeta) });
    return;
  }
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  const accessContext = freePlanAccessContextFromUser(access.user, siteContent);
  const unlockedEntry = entries.find((entry) => userMayUnlockFreeCurriculumPlan(entry.parentMeta, accessContext));
  if (unlockedEntry) {
    jsonResponse(response, 200, {
      activity: curriculumActivityUnlockedFreeDto(unlockedEntry.rawActivity, unlockedEntry.parentMeta),
    });
    return;
  }
  jsonResponse(response, 403, { error: "Pro access is required for this activity." });
}

async function handlePublicCurriculumResourceFile(request, response, url) {
  const store = readStore();
  const id = normalizedShortText(url.searchParams.get("id"), 160);
  if (!id) {
    jsonResponse(response, 400, { error: "Resource id is required." });
    return;
  }
  const curriculum = readSiteCurriculum(store);
  const resource = curriculum.resources.find((item) => item.id === id);
  if (!resource || !isCurriculumResourcePublic(resource.status)) {
    jsonResponse(response, 404, { error: "Resource not found." });
    return;
  }
  const publicLessons = curriculum.lessonPlans
    .map((plan) => curriculumParentPlanMeta(plan))
    .filter(Boolean);
  const publicLessonIds = new Set(publicLessons.map((plan) => plan.id));
  const linkedLessons = publicLessons.filter((plan) => (resource.lessonPlanIds || []).includes(plan.id));
  const linkedToPublicLesson = linkedLessons.length > 0;
  if (!linkedToPublicLesson) {
    jsonResponse(response, 404, { error: "Resource not found." });
    return;
  }
  const requiresProAccess = linkedLessons.some((plan) => plan.plan === "Pro");
  if (requiresProAccess) {
    const access = await resolveCurriculumAccessUser(request, url);
    if (!access.authorized) {
      jsonResponse(response, 403, { error: "Pro access is required for this resource." });
      return;
    }
  }
  if (!resource.fileData) {
    jsonResponse(response, 404, { error: "Resource file data is not available." });
    return;
  }
  jsonResponse(response, 200, {
    resource: {
      id: resource.id,
      title: resource.title,
      resourceCategory: resource.resourceCategory,
      mimeType: resource.mimeType,
      fileName: resource.fileName,
      status: resource.status,
      fileData: resource.fileData,
      hasFile: true,
    },
  });
}

function handleAdminSiteContent(request, response, url) {
  const token = url.searchParams.get("adminToken");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = peekStore();
  jsonResponse(response, 200, { siteContent: normalizedSiteContent(store.siteContent || defaultSiteContentStore()) });
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(text.slice(0, 300) || `Email provider returned ${response.status}.`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── Shared email helper ──────────────────────────────────────────────────────
// All outbound email passes through sendEmail() so that switching the provider
// or from/to addresses only requires env var changes — no code changes needed.
//
// opts: { to, replyTo, subject, text, html }
// Returns { sent, configured, provider }
async function sendEmail(opts = {}) {
  if (outboundEmailIsDisabled()) {
    return {
      sent: false,
      configured: true,
      provider: detectedEmailProvider() || "disabled",
      disabled: true,
      code: "outbound_email_disabled",
      reason: DISABLE_OUTBOUND_EMAIL
        ? "DISABLE_OUTBOUND_EMAIL=true"
        : "director_center_preview_safe_mode",
    };
  }
  const status = supportEmailConfigStatus();
  if (!status.ready) return { sent: false, configured: false, provider: status.provider };

  const provider = detectedEmailProvider();
  const toAddr = opts.to || SUPPORT_EMAIL_TO;
  const toList = Array.isArray(toAddr) ? toAddr : [toAddr];
  const replyTo = String(opts.replyTo || "");
  const subject = String(opts.subject || "").slice(0, 500);
  const text = String(opts.text || "");
  const html = String(opts.html || "");
  const listUnsubscribeUrl = String(opts.listUnsubscribeUrl || "");
  const idempotencyKey = String(opts.idempotencyKey || "").slice(0, 256);

  if (provider === "resend") {
    const payload = { from: SUPPORT_EMAIL_FROM, to: toList, subject, text, html };
    if (replyTo) payload.reply_to = replyTo;
    if (Array.isArray(opts.tags) && opts.tags.length) payload.tags = opts.tags;
    if (listUnsubscribeUrl) {
      payload.headers = {
        "List-Unsubscribe": `<${listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
    const headers = { Authorization: "Bearer " + RESEND_API_KEY };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const providerResponse = await postJson(
      `${String(RESEND_API_BASE_URL || "https://api.resend.com").replace(/\/$/, "")}/emails`,
      headers,
      payload,
    );
    return {
      sent: true,
      configured: true,
      provider,
      messageId: providerResponse?.id || "",
    };
  }
  if (provider === "sendgrid") {
    const from = parseEmailAddress(SUPPORT_EMAIL_FROM);
    const payload = {
      personalizations: [{ to: [{ email: toList[0] }], subject }],
      from,
      content: [{ type: "text/plain", value: text }, { type: "text/html", value: html }],
    };
    if (replyTo) payload.reply_to = { email: replyTo };
    if (listUnsubscribeUrl) {
      payload.headers = {
        "List-Unsubscribe": `<${listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
    const providerResponse = await postJson("https://api.sendgrid.com/v3/mail/send", { Authorization: "Bearer " + SENDGRID_API_KEY }, payload);
    return {
      sent: true,
      configured: true,
      provider,
      messageId: providerResponse?.headers?.["x-message-id"] || providerResponse?.id || "",
    };
  }
  if (provider === "postmark") {
    const payload = {
      From: SUPPORT_EMAIL_FROM,
      To: toList[0],
      Subject: subject,
      TextBody: text,
      HtmlBody: html,
      MessageStream: "outbound",
    };
    if (replyTo) payload.ReplyTo = replyTo;
    if (listUnsubscribeUrl) {
      payload.Headers = [
        { Name: "List-Unsubscribe", Value: `<${listUnsubscribeUrl}>` },
        { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
      ];
    }
    const providerResponse = await postJson("https://api.postmarkapp.com/email", { "X-Postmark-Server-Token": POSTMARK_SERVER_TOKEN }, payload);
    return {
      sent: true,
      configured: true,
      provider,
      messageId: providerResponse?.MessageID || providerResponse?.MessageId || "",
    };
  }
  return { sent: false, configured: false, provider: provider || "not configured" };
}

// Email engagement (onboarding drip + weekly What's New) reuses sendEmail().
// One-time all-users welcome/update is audit-gated and never scheduled.
// Automations default OFF via EMAIL_AUTOMATIONS_ENABLED until content is approved.
const emailEngagement = createEmailEngagement({
  sendEmail,
  SITE_URL,
  reviewEmail: ADMIN_EMAIL,
  unsubscribeUrlForEmail,
  postalAddress: SUPPORT_POSTAL_ADDRESS,
  htmlEscape,
  readStore,
  readStoreFresh,
  writeStore,
  writeStoreAsync,
  claimEmailCampaignDelivery,
  completeEmailCampaignDelivery,
  listEmailCampaignDeliveries,
  patchEmailCampaignState,
  isCurriculumLessonPublic,
  getDatabaseStatus: () => ({
    ...databaseConfigStatus(),
    connectionString: activeDatabaseUrl() || "",
  }),
  getAdminEmail: () => ADMIN_EMAIL,
  getSupportEmailStatus: () => supportEmailConfigStatus(),
  areAutomationsEnabled: () => emailAutomationsEnabled(),
  resolveAudienceRecipients: (store, opts) => messagingCenter.resolveAudienceRecipients(store, opts),
});

function appBaseUrl() {
  return String(SITE_URL || "").replace(/\/$/, "") || `http://localhost:${PORT}`;
}

function transactionalEmailShell({ title, introHtml, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  const safeTitle = htmlEscape(title || "");
  const safeCta = htmlEscape(ctaLabel || "Open Little Learner Hub");
  const safeUrl = htmlEscape(ctaUrl || appBaseUrl());
  const safeFooter = htmlEscape(footerNote || "Little Learner Hub");
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.6">
      <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7048;margin:0 0 8px">Little Learner Hub</p>
      <h1 style="font-size:24px;margin:0 0 16px;color:#111827">${safeTitle}</h1>
      ${introHtml || ""}
      ${bodyHtml || ""}
      <p style="margin:24px 0 12px">
        <a href="${safeUrl}" style="display:inline-block;background:#2f6f5e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px">${safeCta}</a>
      </p>
      <p style="font-size:12px;color:#6b7280;margin-top:24px">${safeFooter}</p>
    </div>
  `.trim();
}

function passwordResetEmailPayload({ token, expiresAt }) {
  const resetUrl = `${appBaseUrl()}/?view=reset-password&resetToken=${encodeURIComponent(token)}`;
  const expiryLabel = new Date(expiresAt).toLocaleString();
  return {
    subject: "Reset your Little Learner Hub password",
    text: [
      "Hi,",
      "",
      "We received a request to reset your Little Learner Hub password.",
      "",
      "Use this secure link to choose a new password:",
      resetUrl,
      "",
      `This link expires on ${expiryLabel}. If you did not request this, you can ignore this email.`,
      "",
      "— Little Learner Hub",
    ].join("\n"),
    html: transactionalEmailShell({
      title: "Reset your password",
      introHtml: "<p>We received a request to reset your Little Learner Hub password.</p>",
      bodyHtml: `<p>Use the secure button below to choose a new password.</p><p><strong>This link expires on ${htmlEscape(expiryLabel)}.</strong> If you did not request this, you can safely ignore this email.</p>`,
      ctaLabel: "Choose a New Password",
      ctaUrl: resetUrl,
      footerNote: "If you did not request a password reset, no changes will be made to your account.",
    }),
  };
}

function verificationEmailPayload({ token, expiresAt }) {
  const verifyUrl = `${appBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const expiryLabel = new Date(expiresAt).toLocaleDateString();
  return {
    subject: "Verify your Little Learner Hub email",
    text: [
      "Hi,",
      "",
      "Please verify your email address for Little Learner Hub.",
      "",
      "Use this secure link to verify your account:",
      verifyUrl,
      "",
      `This verification link expires on ${expiryLabel}.`,
      "",
      "— Little Learner Hub",
    ].join("\n"),
    html: transactionalEmailShell({
      title: "Verify your email",
      introHtml: "<p>Please verify your email address for Little Learner Hub.</p>",
      bodyHtml: "<p>Verifying helps protect your account and confirms you can receive important account and billing emails.</p>",
      ctaLabel: "Verify Email Address",
      ctaUrl: verifyUrl,
      footerNote: `This verification link expires on ${expiryLabel}.`,
    }),
  };
}

async function sendPasswordResetEmail(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { ok: false, reason: "missing_email" };
  if (!transactionalAuthEmailReady()) {
    return { ok: false, skipped: true, reason: "provider_not_ready" };
  }
  const store = readStore();
  const user = store.users?.[cleanEmail];
  if (!user) return { ok: true, skipped: true, reason: "user_not_found" };
  const tokenData = emailAuth.createToken(store, {
    email: cleanEmail,
    purpose: "password_reset",
    ttlMs: emailAuth.PASSWORD_RESET_TTL_MS,
  });
  if (!tokenData) return { ok: false, reason: "token_create_failed" };
  await writeStoreAsync(store);
  const payload = passwordResetEmailPayload({ token: tokenData.token, expiresAt: tokenData.expiresAt });
  const emailResult = await sendEmail({
    to: cleanEmail,
    replyTo: SUPPORT_EMAIL_TO,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  return { ok: true, email: cleanEmail, expiresAt: tokenData.expiresAt, emailResult };
}

async function sendVerificationEmail(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { ok: false, reason: "missing_email" };
  if (!transactionalAuthEmailReady()) {
    return { ok: false, skipped: true, reason: "provider_not_ready" };
  }
  const store = readStore();
  const user = store.users?.[cleanEmail];
  if (!user) return { ok: true, skipped: true, reason: "user_not_found" };
  if (user.emailVerified) return { ok: true, skipped: true, reason: "already_verified" };
  const tokenData = emailAuth.createToken(store, {
    email: cleanEmail,
    purpose: "email_verification",
    ttlMs: emailAuth.EMAIL_VERIFICATION_TTL_MS,
  });
  if (!tokenData) return { ok: false, reason: "token_create_failed" };
  await writeStoreAsync(store);
  const payload = verificationEmailPayload({ token: tokenData.token, expiresAt: tokenData.expiresAt });
  const emailResult = await sendEmail({
    to: cleanEmail,
    replyTo: SUPPORT_EMAIL_TO,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  return { ok: true, email: cleanEmail, expiresAt: tokenData.expiresAt, emailResult };
}

async function fetchResendEmailStatus(messageId) {
  const id = String(messageId || "").trim();
  if (!id || !isConfiguredValue(RESEND_API_KEY) || typeof fetch !== "function") return null;
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Authorization: "Bearer " + RESEND_API_KEY },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

// One-time Founding Member thank-you — independent of EMAIL_AUTOMATIONS_ENABLED.
const foundingMemberEmail = createFoundingMemberEmail({
  sendEmail,
  readStore,
  writeStore,
  htmlEscape,
  getAdminEmail: () => ADMIN_EMAIL,
  getSupportEmailStatus: () => supportEmailConfigStatus(),
  fetchResendEmailStatus,
});

// One-time Free Users welcome/upgrade — independent of EMAIL_AUTOMATIONS_ENABLED.
const freeUserWelcomeEmail = createFreeUserWelcomeEmail({
  sendEmail,
  readStore,
  writeStore,
  htmlEscape,
  getAdminEmail: () => ADMIN_EMAIL,
  getSupportEmailStatus: () => supportEmailConfigStatus(),
  fetchResendEmailStatus,
});

function pauseEmailAutomationsInStore(reason = "EMAIL_AUTOMATIONS_ENABLED=false") {
  const store = readStore();
  const eng = emailEngagement.ensureEmailEngagement(store);
  const before = {
    onboardingEnabled: Boolean(eng.settings.onboardingEnabled),
    weeklyWhatsNewEnabled: Boolean(eng.settings.weeklyWhatsNewEnabled),
  };
  let changed = false;
  if (eng.settings.onboardingEnabled) {
    eng.settings.onboardingEnabled = false;
    changed = true;
  }
  if (eng.settings.weeklyWhatsNewEnabled) {
    eng.settings.weeklyWhatsNewEnabled = false;
    changed = true;
  }
  if (changed) {
    eng.settings.automationsPausedAt = new Date().toISOString();
    eng.settings.automationsPausedReason = String(reason || "").slice(0, 200);
    writeStore(store);
  }
  return { changed, before, after: { onboardingEnabled: false, weeklyWhatsNewEnabled: false }, reason };
}

// ─── User acknowledgment email ────────────────────────────────────────────────
// Sent to the submitter right after any new submission (ticket, bug, feature, feedback).
async function notifyUserAck({ toEmail, toName, submissionType, topic }) {
  if (!toEmail) return { sent: false, configured: false, reason: "no user email" };
  const displayType = String(submissionType || "submission");
  const displayTopic = String(topic || "");
  const subject = `[Little Learner Hub] We received your ${displayType}`;
  const greeting = toName ? `Hi ${toName},` : "Hi there,";
  const topicLine = displayTopic ? ` regarding "${displayTopic}"` : "";
  const text = [
    greeting,
    "",
    `Thank you for submitting your ${displayType}${topicLine}.`,
    "",
    "We received your submission and will review it shortly. If you have anything to add, please reply to this email.",
    "",
    "— The Little Learner Hub Team",
  ].join("\n");
  const html = `
    <p>${htmlEscape(greeting)}</p>
    <p>Thank you for submitting your ${htmlEscape(displayType)}${htmlEscape(topicLine)}.</p>
    <p>We received your submission and will review it shortly. If you have anything to add, please reply to this email.</p>
    <p>— The Little Learner Hub Team</p>
  `;
  try {
    return await sendEmail({ to: toEmail, replyTo: SUPPORT_EMAIL_TO, subject, text, html });
  } catch (err) {
    console.warn("[email] User ack email failed:", err.message);
    return { sent: false, configured: supportEmailConfigStatus().ready, error: err.message };
  }
}

// ─── Admin notification email ─────────────────────────────────────────────────
// Sent to the admin inbox when a new submission arrives.
// opts: { kind, topic, name, email, message, createdAt, sourceUrl, fields }
// `fields` is an optional array of [label, value] pairs for type-specific data.
async function notifyAdmin(opts = {}) {
  const kind = String(opts.kind || "Submission");
  const topicOrTitle = String(opts.topic || opts.title || "");
  const subject = `[Little Learner Hub] New ${kind}: ${topicOrTitle}`;
  const baseFields = [
    ["Type", kind],
    topicOrTitle ? ["Topic", topicOrTitle] : null,
    ["Name", opts.name || ""],
    ["Email", opts.email || ""],
    ["Created", opts.createdAt || ""],
  ].filter(Boolean);
  const extraFields = Array.isArray(opts.fields) ? opts.fields : [];
  const sourceField = opts.sourceUrl ? [["Page", opts.sourceUrl]] : [];
  const allFields = [...baseFields, ...extraFields, ...sourceField];
  const text = [
    `New Little Learner Hub ${kind}`,
    "",
    ...allFields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Message:",
    opts.message || "",
  ].join("\n");
  const html = `
    <h2>New Little Learner Hub ${htmlEscape(kind)}</h2>
    ${allFields.map(([label, value]) => `<p><strong>${htmlEscape(String(label))}:</strong> ${htmlEscape(String(value || ""))}</p>`).join("")}
    <hr>
    <p>${htmlEscape(String(opts.message || "")).replace(/\n/g, "<br>")}</p>
  `;
  try {
    return await sendEmail({ to: SUPPORT_EMAIL_TO, replyTo: opts.email || "", subject, text, html });
  } catch (err) {
    console.warn(`[email] Admin notification for ${kind} failed:`, err.message);
    return { sent: false, configured: supportEmailConfigStatus().ready, error: err.message };
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
  const email = supportTicketEmailPayload(ticket);
  return sendEmail({ to: SUPPORT_EMAIL_TO, replyTo: ticket.email, subject: email.subject, text: email.text, html: email.html });
}

function adminAlertDeps() {
  return {
    ADMIN_EMAIL,
    ADMIN_EMAILS,
    fanOutNotificationsAndPush,
    notifyAdminEmail: notifyAdmin,
  };
}

/** Fire-and-forget admin alert (in-app + push; optional email). Never throws to callers. */
async function emitAdminAlertSafe(store, opts = {}) {
  try {
    return await adminNotifications.emitAdminAlert(store, adminAlertDeps(), opts);
  } catch (error) {
    console.warn("[admin-notifications] emit failed:", error?.message || error);
    return { ok: false, error: error?.message || "emit_failed" };
  }
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
  try {
    const { recordTimeline, notifyAdminsInApp } = getCommsApi();
    recordTimeline(store, {
      email: ticket.email,
      type: "support_request",
      title: ticket.topic || ticket.kind,
      detail: ticket.message.slice(0, 400),
    });
    notifyAdminsInApp(store, {
      type: "admin_new_support",
      title: "New support request",
      preview: ticket.topic || ticket.message.slice(0, 120),
      refId: ticket.id,
    }).catch(() => {});
  } catch {}
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
      // Include provider detail so production delivery debugging is not blind.
      detail: String(error && error.message ? error.message : error).slice(0, 500),
    };
  }
  // Send auto-acknowledgment to the user (best-effort; does not affect the response)
  notifyUserAck({ toEmail: ticket.email, toName: ticket.name, submissionType: "support request", topic: ticket.topic }).catch((err) => console.warn("[email] Support ticket ack failed:", err.message));
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
  const store = ensureMessagingStore(readStore());
  const tickets = store.supportTickets || [];
  const index = tickets.findIndex((ticket) => ticket.id === id);
  if (index < 0) {
    jsonResponse(response, 404, { error: "Support ticket was not found." });
    return;
  }
  const previousReply = tickets[index].reply || "";
  const nextReply = body.reply !== undefined ? String(body.reply).slice(0, 5000) : tickets[index].reply;
  const replyChanged = body.reply !== undefined && nextReply !== previousReply;
  const forceResend = body.forceResend === true || body.resendEmail === true;
  const refreshOnly = body.refreshReplyEmail === true;
  tickets[index] = {
    ...tickets[index],
    status: body.status ? String(body.status).slice(0, 40) : tickets[index].status,
    reply: nextReply,
    updatedAt: new Date().toISOString(),
  };

  let emailResult = null;
  const ticketOwnerEmail = normalizeEmail(tickets[index].email || tickets[index].createdBy || "");
  const shouldSendReplyEmail = Boolean(nextReply)
    && ticketOwnerEmail
    && (replyChanged || forceResend)
    && !refreshOnly;

  if (refreshOnly) {
    const existing = tickets[index].replyEmail || {};
    const messageId = existing.messageId || "";
    if (messageId && detectedEmailProvider() === "resend") {
      try {
        const remote = await fetchResendEmailStatus(messageId);
        const lastEvent = String(remote?.last_event || remote?.lastEvent || "").trim();
        tickets[index].replyEmail = {
          ...existing,
          lastEvent,
          status: lastEvent || existing.status || "accepted",
          refreshedAt: new Date().toISOString(),
        };
      } catch (error) {
        tickets[index].replyEmail = {
          ...existing,
          error: error.message || "Could not refresh delivery status.",
          refreshedAt: new Date().toISOString(),
        };
      }
    }
  }

  if (shouldSendReplyEmail) {
    const topic = String(tickets[index].topic || "Support").trim() || "Support";
    const subject = `Re: ${topic} — Little Learner Hub`;
    const text = `${nextReply}\n\n— The Little Learner Hub Team\n\n(You wrote: ${String(tickets[index].message || "").slice(0, 500)})`;
    const html = `<p>${htmlEscape(nextReply).replace(/\n/g, "<br>")}</p><p>— The Little Learner Hub Team</p><hr><p style="color:#666;font-size:13px">Your original message:<br>${htmlEscape(String(tickets[index].message || "")).replace(/\n/g, "<br>")}</p>`;
    try {
      emailResult = await sendEmail({
        to: ticketOwnerEmail,
        replyTo: SUPPORT_EMAIL_TO,
        subject,
        text,
        html,
        tags: [
          { name: "category", value: "support_reply" },
          { name: "ticket_id", value: String(id).slice(0, 64) },
        ],
      });
    } catch (err) {
      console.warn("[email] Support ticket reply failed:", err.message);
      emailResult = {
        sent: false,
        configured: supportEmailConfigStatus().ready,
        provider: detectedEmailProvider() || "",
        error: err.message || "Could not send reply email.",
      };
    }
    const now = new Date().toISOString();
    tickets[index].replyEmail = {
      to: ticketOwnerEmail,
      subject,
      sent: Boolean(emailResult?.sent),
      configured: Boolean(emailResult?.configured),
      provider: emailResult?.provider || "",
      messageId: emailResult?.messageId || "",
      sentAt: now,
      status: emailResult?.sent ? "accepted" : (emailResult?.configured ? "failed" : "not_configured"),
      lastEvent: emailResult?.sent ? "accepted" : "",
      error: emailResult?.error || (emailResult?.sent ? "" : (emailResult?.configured ? "Email provider did not accept the message." : "Email delivery is not configured on the server.")),
      refreshedAt: now,
    };
    store.communications = store.communications || [];
    store.communications.unshift({
      id: `comm-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      relatedId: id,
      relatedType: "support_ticket",
      direction: "out",
      from: SUPPORT_EMAIL_FROM || SUPPORT_EMAIL_TO,
      to: ticketOwnerEmail,
      subject,
      body: nextReply,
      sentAt: now,
      method: "email",
      emailResult,
    });
    store.communications = store.communications.slice(0, 5000);
  }

  store.supportTickets = tickets;
  writeStore(store);
  // Notify the ticket owner (bell + push) only when there is an actual new
  // reply for them to read — never on trivial internal status housekeeping.
  if (ticketOwnerEmail && nextReply && (replyChanged || forceResend) && !refreshOnly) {
    await fanOutNotificationsAndPush(store, {
      type: "support_reply",
      recipients: [ticketOwnerEmail],
      title: "Support request update",
      preview: messagePreviewText(nextReply),
      refId: id,
    }).catch((error) => console.warn("[messaging] support reply notification failed:", error.message));
  }
  jsonResponse(response, 200, {
    ticket: publicTicket(tickets[index]),
    emailResult: emailResult || tickets[index].replyEmail || null,
  });
}

async function handleSupportTicketsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  const store = peekStore();
  const allTickets = store.supportTickets || [];
  if (validAdminToken(adminToken)) {
    jsonResponse(response, 200, { tickets: allTickets.slice(0, 100).map(publicTicket) });
    return;
  }
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in to view your support tickets." });
    return;
  }
  const myEmail = normalizeEmail(identity.email);
  const tickets = allTickets.filter((ticket) => (
    normalizeEmail(ticket.email) === myEmail || normalizeEmail(ticket.createdBy) === myEmail
  ));
  jsonResponse(response, 200, { tickets: tickets.slice(0, 100).map(publicTicket) });
}

// Legacy hardcoded seed count (removed from client in Phase 2H; retained for backup metadata only).
const HARDCODED_LESSON_PLAN_SEED_COUNT = 900;

function buildCurriculumBackupPayload(store) {
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  const allUploads = dedupeUploadedResources(store.uploadedResources || [], MAX_UPLOADED_RESOURCES);
  const legacyCurriculumUploads = allUploads.filter(
    (item) => item.category === "Lesson Plans" || item.category === "Activity Center",
  );
  const lessonPlanOverrides = siteContent.lessonPlans || {};
  const customLessonPlans = siteContent.customLessonPlans || [];
  const cmsActivities = siteContent.activities || [];
  const payload = {
    exportedAt: new Date().toISOString(),
    purpose: "legacy-curriculum-backup-before-play-based-rebuild",
    counts: {
      hardcodedSeedCount: HARDCODED_LESSON_PLAN_SEED_COUNT,
      lessonPlanOverrides: Object.keys(lessonPlanOverrides).length,
      customLessonPlans: customLessonPlans.length,
      cmsActivities: cmsActivities.length,
      legacyCurriculumUploads: legacyCurriculumUploads.length,
      totalUploadedResources: allUploads.length,
    },
    siteContent: {
      lessonPlans: lessonPlanOverrides,
      customLessonPlans,
      activities: cmsActivities,
    },
    uploadedResources: legacyCurriculumUploads,
  };
  const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { ...payload, checksum };
}

function buildNewCurriculumBackupPayload(store) {
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  const curriculum = normalizedCurriculumStore(siteContent.curriculum);
  const payload = {
    exportedAt: new Date().toISOString(),
    purpose: "phase-2h-new-curriculum-backup",
    counts: {
      curriculumLessonPlans: curriculum.lessonPlans.length,
      curriculumActivities: curriculum.activities.length,
      curriculumResources: curriculum.resources.length,
    },
    siteContent: {
      curriculum,
      featureFlags: normalizedFeatureFlags(siteContent.featureFlags),
      playBasedCurriculum: true,
    },
  };
  const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { ...payload, checksum };
}

function buildFullCurriculumBackupPayload(store) {
  const legacy = buildCurriculumBackupPayload(store);
  const next = buildNewCurriculumBackupPayload(store);
  const payload = {
    exportedAt: new Date().toISOString(),
    purpose: "phase-2h-full-curriculum-backup",
    legacy,
    curriculum: next,
    counts: {
      ...legacy.counts,
      ...next.counts,
    },
  };
  const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { ...payload, checksum };
}

function handleAdminCurriculumBackup(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required to export the curriculum backup." });
    return;
  }
  const store = readStore();
  jsonResponse(response, 200, buildCurriculumBackupPayload(store));
}

function handleAdminCurriculumBackupFull(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required to export the curriculum backup." });
    return;
  }
  const store = readStore();
  jsonResponse(response, 200, buildFullCurriculumBackupPayload(store));
}

function handleAdminCurriculumBackupNew(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required to export the curriculum backup." });
    return;
  }
  const store = readStore();
  jsonResponse(response, 200, buildNewCurriculumBackupPayload(store));
}

async function handleAdminCurriculumWipe(request, response) {
  const startedAt = Date.now();
  // Phase 2H: wipe is one-time / emergency only. Disabled unless explicitly enabled.
  if (String(process.env.ALLOW_CURRICULUM_WIPE || "").trim().toLowerCase() !== "true") {
    console.warn("[curriculum-wipe] rejected — endpoint disabled (ALLOW_CURRICULUM_WIPE!=true)");
    jsonResponse(response, 404, { error: "Curriculum wipe endpoint is disabled." });
    return;
  }
  try {
    const body = await readJson(request);
    if (!validAdminToken(body.adminToken || "")) {
      console.warn("[curriculum-wipe] rejected unauthorized wipe attempt", {
        hasToken: Boolean(body?.adminToken),
        ip: request.socket?.remoteAddress || "",
      });
      jsonResponse(response, 401, { error: "Admin access is required to wipe curriculum content." });
      return;
    }
    if (body.confirm !== "WIPE_CURRICULUM") {
      console.warn("[curriculum-wipe] rejected missing/invalid confirm phrase", {
        confirmPresent: typeof body?.confirm === "string",
      });
      jsonResponse(response, 400, {
        error: "Confirmation required. Send confirm: \"WIPE_CURRICULUM\" after taking a backup.",
      });
      return;
    }
    const store = readStore();
    const siteContent = store.siteContent && typeof store.siteContent === "object"
      ? store.siteContent
      : defaultSiteContentStore();
    const before = normalizedCurriculumStore(siteContent.curriculum);
    const beforeLegacy = {
      lessonPlanOverrides: Object.keys(siteContent.lessonPlans || {}).length,
      customLessonPlans: Array.isArray(siteContent.customLessonPlans) ? siteContent.customLessonPlans.length : 0,
      cmsActivities: Array.isArray(siteContent.activities) ? siteContent.activities.length : 0,
    };
    console.log("[curriculum-wipe] starting authorized wipe", {
      before: {
        curriculumLessonPlans: before.lessonPlans.length,
        curriculumActivities: before.activities.length,
        curriculumResources: before.resources.length,
        ...beforeLegacy,
      },
      // Scope guard: wipe only touches curriculum + legacy lesson/activity CMS fields.
      untouched: ["forms", "printables", "users", "billing", "observations", "uploadedResources", "reviews"],
    });
    const now = new Date().toISOString();
    const empty = defaultCurriculumStore();
    empty.updatedAt = now;
    // Also clear obsolete legacy lesson/activity CMS storage.
    siteContent.lessonPlans = {};
    siteContent.customLessonPlans = [];
    siteContent.activities = [];
    siteContent.curriculum = empty;
    siteContent.featureFlags = { ...(siteContent.featureFlags || {}), playBasedCurriculum: true };
    siteContent.playBasedCurriculum = true;
    siteContent.updatedAt = now;
    store.siteContent = siteContent;
    await writeStoreAsync(store);
    console.log("[curriculum-wipe] completed", {
      wipedAt: now,
      durationMs: Date.now() - startedAt,
      before: {
        curriculumLessonPlans: before.lessonPlans.length,
        curriculumActivities: before.activities.length,
        curriculumResources: before.resources.length,
        ...beforeLegacy,
      },
      after: {
        curriculumLessonPlans: 0,
        curriculumActivities: 0,
        curriculumResources: 0,
        legacyLessonOverrides: 0,
        legacyCustomLessonPlans: 0,
        legacyCmsActivities: 0,
      },
    });
    jsonResponse(response, 200, {
      ok: true,
      wipedAt: now,
      before: {
        curriculumLessonPlans: before.lessonPlans.length,
        curriculumActivities: before.activities.length,
        curriculumResources: before.resources.length,
        ...beforeLegacy,
      },
      after: {
        curriculumLessonPlans: 0,
        curriculumActivities: 0,
        curriculumResources: 0,
        legacyLessonOverrides: 0,
        legacyCustomLessonPlans: 0,
        legacyCmsActivities: 0,
      },
    });
  } catch (error) {
    console.error("[curriculum-wipe] failed", { error: error.message, durationMs: Date.now() - startedAt });
    jsonResponse(response, 503, { error: "Curriculum wipe failed. Please try again." });
  }
}

async function handleAdminCurriculumSeriesSave(request, response) {
  try {
    const body = await readJson(request);
    if (!validAdminToken(body.adminToken || "")) {
      jsonResponse(response, 401, { error: "Admin access is required to save curriculum series." });
      return;
    }
    const incoming = body.series && typeof body.series === "object" ? body.series : null;
    if (!incoming) {
      jsonResponse(response, 400, { error: "A curriculum series payload is required." });
      return;
    }
    const now = new Date().toISOString();
    const store = readStore();
    const siteContent = store.siteContent && typeof store.siteContent === "object"
      ? store.siteContent
      : defaultSiteContentStore();
    if (curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
      curriculumConflictResponse(response, siteContent);
      return;
    }
    const curriculum = normalizedCurriculumStore(siteContent.curriculum);
    const id = normalizedShortText(incoming.id, 160) || generateCurriculumSeriesId();
    const existing = curriculum.series.find((item) => item.id === id);
    const nextStatus = normalizedShortText(incoming.status || existing?.status || "draft", 20).toLowerCase().replace(/\s+/g, "_");
    let publishedAt = existing?.publishedAt || "";
    if (["published", "featured"].includes(nextStatus) && !["published", "featured"].includes(existing?.status || "")) {
      publishedAt = now;
    } else if (["published", "featured"].includes(nextStatus) && !publishedAt) {
      publishedAt = existing?.createdAt || now;
    }
    const series = normalizedCurriculumSeries({
      ...existing,
      ...incoming,
      id,
      status: nextStatus,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      publishedAt,
    });
    if (!series) {
      jsonResponse(response, 400, { error: "Curriculum series could not be normalized." });
      return;
    }
    if (["published", "featured"].includes(series.status)) {
      const publishErrors = validateCurriculumSeriesForPublish(series, curriculum.lessonPlans);
      if (publishErrors.length) {
        jsonResponse(response, 400, {
          error: "Curriculum series cannot be published until validation passes.",
          validationErrors: publishErrors,
          series,
        });
        return;
      }
    }
    const nextCurriculum = normalizedCurriculumStore({
      ...curriculum,
      series: [...curriculum.series.filter((item) => item.id !== id), series],
      updatedAt: now,
    });
    const integrityError = assertCurriculumIntegrityOrError(nextCurriculum);
    if (integrityError) {
      jsonResponse(response, 400, integrityError);
      return;
    }
    const siteContentUpdatedAt = writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
    await writeStoreAsync(store);
    jsonResponse(response, 200, {
      series,
      curriculum: curriculumWithoutFileData(nextCurriculum),
      siteContentUpdatedAt,
    });
  } catch (error) {
    console.error("[curriculum-series-save] failed", error);
    jsonResponse(response, 500, { error: error.message || "Curriculum series save failed." });
  }
}

async function handleAdminCurriculumLessonPlanSave(request, response) {
  const startedAt = Date.now();
  let step = "received";
  console.log("[curriculum-lesson-save] request received");
  try {
    step = "readJson";
    const body = await readJson(request);
    step = "auth";
    if (!validAdminToken(body.adminToken || "")) {
      jsonResponse(response, 401, { error: "Admin access is required to save curriculum lesson plans." });
      return;
    }
    const incomingPlan = body.lessonPlan && typeof body.lessonPlan === "object" ? body.lessonPlan : null;
    if (!incomingPlan) {
      jsonResponse(response, 400, { error: "A lesson plan payload is required." });
      return;
    }

    const incomingId = normalizedShortText(incomingPlan.id, 160);
    const id = incomingId || generateCurriculumLessonPlanId();
    const now = new Date().toISOString();
    step = "readStore";
    const store = readStore();
    // Read stamp/curriculum without re-normalizing the entire siteContent blob
    // (production lessonPlans can embed multi-MB data URLs).
    const siteContent = store.siteContent && typeof store.siteContent === "object"
      ? store.siteContent
      : defaultSiteContentStore();
    step = "concurrency";
    if (curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
      console.log("[curriculum-lesson-save] conflict 409", {
        id,
        expectedUpdatedAt: normalizedShortText(body.expectedUpdatedAt, 80),
        siteContentUpdatedAt: normalizedShortText(siteContent.updatedAt, 80),
      });
      curriculumConflictResponse(response, siteContent);
      return;
    }
    const existingCurriculum = siteContent.curriculum || defaultCurriculumStore();
    const existingPlan = (existingCurriculum.lessonPlans || []).find((item) => item.id === id);
    const nextStatus = normalizedShortText(incomingPlan.status, 20);
    const wasPublic = isCurriculumLessonPublic(existingPlan?.status || "");
    const willBePublic = isCurriculumLessonPublic(nextStatus);
    let publishedAt = normalizedShortText(existingPlan?.publishedAt, 80)
      || normalizedShortText(incomingPlan.publishedAt, 80)
      || "";
    if (willBePublic && !wasPublic) {
      publishedAt = now;
    } else if (willBePublic && !publishedAt) {
      // Legacy public plans: keep a stable stamp so weekly digests don't re-fire on every edit.
      publishedAt = existingPlan?.createdAt || now;
    }
    const planInput = {
      ...incomingPlan,
      id,
      createdAt: existingPlan?.createdAt || normalizedShortText(incomingPlan.createdAt, 80) || now,
      updatedAt: now,
      publishedAt,
    };

    // Published/featured plans must keep activities on every weekday so the
    // lesson viewer never shows "No activities scheduled." after a save.
    if (willBePublic) {
      const emptyWeekdays = [];
      CURRICULUM_WEEKDAYS.forEach((day) => {
        const items = Array.isArray(planInput?.dailyPlans?.[day]?.items)
          ? planInput.dailyPlans[day].items
          : [];
        const hasTitle = items.some((item) => String(item?.title || "").trim());
        if (!hasTitle) emptyWeekdays.push(day);
      });
      if (emptyWeekdays.length) {
        jsonResponse(response, 400, {
          error: `Published lesson plans need activities on every weekday. Missing: ${emptyWeekdays.join(", ")}.`,
          emptyWeekdays,
        });
        return;
      }
    }

    step = "syncActivities";
    const syncedCurriculum = syncCurriculumActivitiesForLessonPlan(existingCurriculum, planInput);
    if (!syncedCurriculum) {
      jsonResponse(response, 400, { error: "Lesson plan could not be normalized." });
      return;
    }
    step = "integrity";
    const integrityError = assertCurriculumIntegrityOrError(syncedCurriculum);
    if (integrityError) {
      console.error("[curriculum-lesson-save] integrity failed", integrityError.details?.slice?.(0, 5) || integrityError);
      jsonResponse(response, 400, integrityError);
      return;
    }

    const savedPlan = syncedCurriculum.lessonPlans.find((item) => item.id === id);
    const savedActivities = syncedCurriculum.activities.filter((activity) => activity.lessonPlanId === id);
    step = "writeSiteCurriculum";
    const siteContentUpdatedAt = writeSiteCurriculum(store, syncedCurriculum, { updatedAt: now });

    step = "writeStoreAsync";
    try {
      await writeStoreAsync(store);
    } catch (error) {
      console.error("Curriculum lesson plan save failed:", error.message, { step });
      jsonResponse(response, 503, { error: "Curriculum could not be saved. Please try again.", step });
      return;
    }

    console.log("[curriculum-lesson-save] ok", {
      id,
      activities: savedActivities.filter((item) => item.status !== "archived").length,
      ms: Date.now() - startedAt,
    });
    jsonResponse(response, 200, {
      lessonPlan: savedPlan,
      activities: savedActivities,
      curriculum: curriculumWithoutFileData(syncedCurriculum),
      siteContentUpdatedAt,
    });
  } catch (error) {
    console.error("[curriculum-lesson-save] failed at step", step, error);
    jsonResponse(response, 500, {
      error: error.message || "Curriculum lesson plan save failed.",
      step,
    });
  }
}

function handleAdminCurriculumResourcesList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required to list curriculum resources." });
    return;
  }
  const store = readStore();
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  const curriculum = siteContent.curriculum || defaultCurriculumStore();
  jsonResponse(response, 200, {
    resources: (curriculum.resources || []).map((item) => curriculumResourceMetadata(item)).filter(Boolean),
    curriculum: curriculumWithoutFileData(curriculum),
    siteContentUpdatedAt: normalizedShortText(siteContent.updatedAt, 80),
  });
}

function handleAdminCurriculumResourceFile(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required to open curriculum resource files." });
    return;
  }
  const id = normalizedShortText(url.searchParams.get("id"), 160);
  if (!id) {
    jsonResponse(response, 400, { error: "Resource id is required." });
    return;
  }
  const store = readStore();
  const curriculum = readSiteCurriculum(store);
  const resource = curriculum.resources.find((item) => item.id === id);
  if (!resource) {
    jsonResponse(response, 404, { error: "Resource not found." });
    return;
  }
  if (!resource.fileData) {
    jsonResponse(response, 404, { error: "Resource file data is not available." });
    return;
  }
  jsonResponse(response, 200, { resource });
}

async function handleAdminCurriculumResourceUpload(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to upload curriculum resources." });
    return;
  }
  const resourceId = normalizedShortText(body.resourceId, 160) || generateCurriculumResourceId();
  const fileName = sanitizeCurriculumUploadFileName(body.fileName);
  const parsed = parseCurriculumUploadDataUrl(body.fileData);
  if (!parsed) {
    jsonResponse(response, 400, {
      error: `A valid PDF or image upload is required (max ${MAX_CURRICULUM_UPLOAD_MB} MB).`,
    });
    return;
  }
  // Validate only — durable bytes are saved with the resource metadata in Postgres.
  jsonResponse(response, 200, {
    resourceId,
    fileName,
    mimeType: parsed.mimeType,
    fileData: parsed.fileData,
  });
}

async function handleAdminLessonCoverUpload(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to upload lesson-plan covers." });
    return;
  }
  if (!usePostgresStore() || !postgresPool || !databaseReady) {
    jsonResponse(response, 503, {
      error: "Persistent media storage is unavailable. The image was not saved; choose an existing cover or paste a durable HTTPS URL.",
    });
    return;
  }
  const parsed = parseLessonCoverUploadDataUrl(body.fileData);
  if (!parsed) {
    jsonResponse(response, 400, {
      error: `Use a PNG, JPG, or WebP image no larger than ${MAX_LESSON_COVER_UPLOAD_MB} MB.`,
    });
    return;
  }
  const id = `lesson-cover-${crypto.randomBytes(16).toString("hex")}`;
  const fileName = sanitizeCurriculumUploadFileName(body.fileName || "lesson-cover");
  try {
    await postgresPool.query(
      `INSERT INTO llh_media_assets (id, kind, mime_type, file_name, bytes)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, "lesson-plan-cover", parsed.mimeType, fileName, parsed.buffer],
    );
    jsonResponse(response, 200, {
      id,
      url: `/api/media/lesson-covers/${encodeURIComponent(id)}`,
      mimeType: parsed.mimeType,
      fileName,
      persistent: true,
    });
  } catch (error) {
    console.error("[lesson-cover-upload] persistent write failed", error.message);
    jsonResponse(response, 503, {
      error: "The cover could not be saved to persistent media storage. The lesson plan was not changed.",
    });
  }
}

async function handleLessonCoverMedia(request, response, assetId) {
  const id = normalizedShortText(assetId, 120);
  if (!id || !id.startsWith("lesson-cover-") || !usePostgresStore() || !postgresPool || !databaseReady) {
    textResponse(response, 404, "Cover not found.");
    return;
  }
  try {
    const result = await postgresPool.query(
      `SELECT mime_type, bytes
       FROM llh_media_assets
       WHERE id = $1 AND kind = $2
       LIMIT 1`,
      [id, "lesson-plan-cover"],
    );
    const asset = result.rows[0];
    if (!asset?.bytes) {
      textResponse(response, 404, "Cover not found.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": asset.mime_type,
      "Content-Length": asset.bytes.length,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(asset.bytes);
  } catch (error) {
    console.error("[lesson-cover-media] read failed", error.message);
    textResponse(response, 503, "Cover temporarily unavailable.");
  }
}

async function handleAdminCurriculumResourceSave(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to save curriculum resources." });
    return;
  }
  const incoming = body.resource && typeof body.resource === "object" ? body.resource : null;
  if (!incoming) {
    jsonResponse(response, 400, { error: "A resource payload is required." });
    return;
  }
  const now = new Date().toISOString();
  const store = readStore();
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  if (curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
    curriculumConflictResponse(response, siteContent);
    return;
  }
  const curriculum = siteContent.curriculum || defaultCurriculumStore();
  const incomingId = normalizedShortText(incoming.id, 160);
  const id = incomingId || generateCurriculumResourceId();
  const existing = curriculum.resources.find((item) => item.id === id);
  const incomingFileData = sanitizedCurriculumFileData(incoming.fileData)
    || sanitizedCurriculumFileData(incoming.fileUrl);
  const fileData = incomingFileData || existing?.fileData || "";
  if (!fileData) {
    jsonResponse(response, 400, { error: "A file upload or HTTPS URL is required." });
    return;
  }
  if (fileData.startsWith("data:")) {
    const parsed = parseCurriculumUploadDataUrl(fileData);
    if (!parsed) {
      jsonResponse(response, 400, {
        error: `Uploaded file must be a PDF or image under ${MAX_CURRICULUM_UPLOAD_MB} MB.`,
      });
      return;
    }
  }
  const nextStatus = normalizedShortText(incoming.status || existing?.status || "draft", 20);
  const wasPublished = existing?.status === "published";
  const willBePublished = nextStatus === "published";
  let publishedAt = existing?.publishedAt || "";
  if (willBePublished && !wasPublished) publishedAt = now;
  else if (willBePublished && !publishedAt) publishedAt = existing?.createdAt || now;
  const resource = normalizedCurriculumResource({
    ...existing,
    ...incoming,
    id,
    fileData,
    fileName: normalizedShortText(incoming.fileName, 180) || existing?.fileName || "",
    mimeType: normalizedShortText(incoming.mimeType, 80) || existing?.mimeType || "",
    lessonPlanIds: existing?.lessonPlanIds || incoming.lessonPlanIds || [],
    status: nextStatus,
    createdAt: existing?.createdAt || normalizedShortText(incoming.createdAt, 80) || now,
    updatedAt: now,
    publishedAt,
  });
  if (!resource) {
    jsonResponse(response, 400, { error: "Resource could not be normalized." });
    return;
  }
  const nextResources = [...curriculum.resources.filter((item) => item.id !== id), resource];
  const nextCurriculum = normalizedCurriculumStore({
    ...curriculum,
    resources: nextResources,
    updatedAt: now,
  });
  const integrityError = assertCurriculumIntegrityOrError(nextCurriculum);
  if (integrityError) {
    jsonResponse(response, 400, integrityError);
    return;
  }
  const siteContentUpdatedAt = writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
  try {
    await writeStoreAsync(store);
  } catch (error) {
    console.error("Curriculum resource save failed:", error.message);
    jsonResponse(response, 503, { error: "Resource could not be saved." });
    return;
  }
  jsonResponse(response, 200, {
    resource,
    curriculum: curriculumWithoutFileData(nextCurriculum),
    siteContentUpdatedAt,
  });
}

async function handleAdminCurriculumResourceArchive(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to archive curriculum resources." });
    return;
  }
  const id = normalizedShortText(body.id, 160);
  if (!id) {
    jsonResponse(response, 400, { error: "Resource id is required." });
    return;
  }
  const now = new Date().toISOString();
  const store = readStore();
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  if (curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
    curriculumConflictResponse(response, siteContent);
    return;
  }
  const curriculum = siteContent.curriculum || defaultCurriculumStore();
  const existing = curriculum.resources.find((item) => item.id === id);
  if (!existing) {
    jsonResponse(response, 404, { error: "Resource not found." });
    return;
  }
  const unlinked = unlinkCurriculumResourceFromAllLessonPlans(curriculum, id);
  if (!unlinked) {
    jsonResponse(response, 400, { error: "Resource could not be unlinked from lesson plans." });
    return;
  }
  const resource = normalizedCurriculumResource({
    ...(unlinked.resources.find((item) => item.id === id) || existing),
    status: "archived",
    lessonPlanIds: [],
    updatedAt: now,
  });
  const nextCurriculum = normalizedCurriculumStore({
    ...unlinked,
    resources: unlinked.resources.map((item) => (item.id === id ? resource : item)),
    updatedAt: now,
  });
  const integrityError = assertCurriculumIntegrityOrError(nextCurriculum);
  if (integrityError) {
    jsonResponse(response, 400, integrityError);
    return;
  }
  const siteContentUpdatedAt = writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
  try {
    await writeStoreAsync(store);
  } catch (error) {
    jsonResponse(response, 503, { error: "Resource could not be archived." });
    return;
  }
  jsonResponse(response, 200, {
    resource: curriculumResourceMetadata(resource),
    curriculum: curriculumWithoutFileData(nextCurriculum),
    siteContentUpdatedAt,
  });
}

async function handleAdminCurriculumResourceLink(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to link curriculum resources." });
    return;
  }
  const resourceId = normalizedShortText(body.resourceId, 160);
  const lessonPlanId = normalizedShortText(body.lessonPlanId, 160);
  if (!resourceId || !lessonPlanId) {
    jsonResponse(response, 400, { error: "resourceId and lessonPlanId are required." });
    return;
  }
  const store = readStore();
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  if (curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
    curriculumConflictResponse(response, siteContent);
    return;
  }
  const curriculum = siteContent.curriculum || defaultCurriculumStore();
  const nextCurriculum = linkCurriculumResourceToLessonPlan(curriculum, resourceId, lessonPlanId);
  if (!nextCurriculum) {
    jsonResponse(response, 404, { error: "Resource or lesson plan not found." });
    return;
  }
  const integrityError = assertCurriculumIntegrityOrError(nextCurriculum);
  if (integrityError) {
    jsonResponse(response, 400, integrityError);
    return;
  }
  const now = new Date().toISOString();
  const siteContentUpdatedAt = writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
  try {
    await writeStoreAsync(store);
  } catch (error) {
    jsonResponse(response, 503, { error: "Resource could not be linked." });
    return;
  }
  jsonResponse(response, 200, {
    resource: curriculumResourceMetadata(nextCurriculum.resources.find((item) => item.id === resourceId)),
    lessonPlan: nextCurriculum.lessonPlans.find((item) => item.id === lessonPlanId),
    curriculum: curriculumWithoutFileData(nextCurriculum),
    siteContentUpdatedAt,
  });
}

async function handleAdminCurriculumResourceUnlink(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to unlink curriculum resources." });
    return;
  }
  const resourceId = normalizedShortText(body.resourceId, 160);
  const lessonPlanId = normalizedShortText(body.lessonPlanId, 160);
  if (!resourceId || !lessonPlanId) {
    jsonResponse(response, 400, { error: "resourceId and lessonPlanId are required." });
    return;
  }
  const store = readStore();
  const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  if (curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
    curriculumConflictResponse(response, siteContent);
    return;
  }
  const curriculum = siteContent.curriculum || defaultCurriculumStore();
  const nextCurriculum = unlinkCurriculumResourceFromLessonPlan(curriculum, resourceId, lessonPlanId);
  if (!nextCurriculum) {
    jsonResponse(response, 404, { error: "Resource or lesson plan not found." });
    return;
  }
  const integrityError = assertCurriculumIntegrityOrError(nextCurriculum);
  if (integrityError) {
    jsonResponse(response, 400, integrityError);
    return;
  }
  const now = new Date().toISOString();
  const siteContentUpdatedAt = writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
  try {
    await writeStoreAsync(store);
  } catch (error) {
    jsonResponse(response, 503, { error: "Resource could not be unlinked." });
    return;
  }
  jsonResponse(response, 200, {
    resource: curriculumResourceMetadata(nextCurriculum.resources.find((item) => item.id === resourceId)),
    lessonPlan: nextCurriculum.lessonPlans.find((item) => item.id === lessonPlanId),
    curriculum: curriculumWithoutFileData(nextCurriculum),
    siteContentUpdatedAt,
  });
}

function handleUploadedResourcesList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  const admin = validAdminToken(adminToken);
  const store = readStore();
  store.uploadedResources = dedupeUploadedResources(store.uploadedResources || [], MAX_UPLOADED_RESOURCES);
  jsonResponse(response, 200, { uploads: uploadedResourcesForResponse(store.uploadedResources, { admin }) });
}

async function handleAdminUploadedResourcesMigrate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required for upload migration." });
    return;
  }
  const incoming = Array.isArray(body.uploads) ? body.uploads : [];
  const store = readStore();
  const existing = store.uploadedResources || [];
  const merged = mergeUploadedResources(existing, incoming);
  const before = dedupeUploadedResources(existing, MAX_UPLOADED_RESOURCES).length;
  const after = merged.length;
  store.uploadedResources = merged;
  try {
    await writeStoreAsync(store);
  } catch (error) {
    console.error("Admin upload migration failed:", error.message);
    jsonResponse(response, 503, { error: "Uploads could not be saved to the database. Please try again." });
    return;
  }
  jsonResponse(response, 200, {
    uploads: uploadedResourcesForResponse(merged, { admin: true }),
    migration: {
      incoming: incoming.length,
      before,
      after,
      added: Math.max(0, after - before),
    },
  });
}

async function handleAdminUploadedResourceUpsert(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to save uploads." });
    return;
  }
  const upload = normalizedUploadedResourceEntry(body.upload || {});
  if (!upload) {
    jsonResponse(response, 400, { error: "A valid upload with an id is required." });
    return;
  }
  upload.updatedAt = new Date().toISOString();
  const store = readStore();
  store.uploadedResources = mergeUploadedResources(store.uploadedResources || [], [upload]);
  try {
    await writeStoreAsync(store);
  } catch (error) {
    console.error("Admin upload upsert failed:", error.message);
    jsonResponse(response, 503, { error: "Upload could not be saved to the database. Please try again." });
    return;
  }
  jsonResponse(response, 200, {
    upload,
    uploads: uploadedResourcesForResponse(store.uploadedResources, { admin: true }),
  });
}

async function handleAdminUploadedResourceDelete(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to delete uploads." });
    return;
  }
  const id = normalizedShortText(body.id, 180);
  if (!id) {
    jsonResponse(response, 400, { error: "Upload id is required." });
    return;
  }
  const store = readStore();
  const existing = dedupeUploadedResources(store.uploadedResources || [], MAX_UPLOADED_RESOURCES);
  store.uploadedResources = existing.filter((item) => item.id !== id);
  try {
    await writeStoreAsync(store);
  } catch (error) {
    console.error("Admin upload delete failed:", error.message);
    jsonResponse(response, 503, { error: "Upload could not be deleted from the database. Please try again." });
    return;
  }
  jsonResponse(response, 200, { uploads: uploadedResourcesForResponse(store.uploadedResources, { admin: true }) });
}

function handleStripeReadiness(request, response) {
  const status = stripeConfigStatus();
  const store = peekStore();
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

async function handleLaunchReadiness(request, response) {
  // Recover from transient write failures so launchReady is not stuck false
  // after a single timed-out upsert while Postgres is otherwise healthy.
  if (usePostgresStore() && postgresPool && !databaseReady) {
    await probePostgresReadiness();
  }
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
      "invoice.paid",
      "invoice.payment_succeeded",
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
  const cancelAtPeriodEndStillActive = storedSubscriptionActive({
    plan: "Pro",
    subscriptionStatus: "Canceled — Access Ends Dec 31, 2027",
    cancelAtPeriodEnd: true,
    accessEndsAt: new Date(Date.now() + 86400000).toISOString(),
    stripeSubscriptionStatus: "active",
  });
  const canceledDowngradesToFree = !storedSubscriptionActive({
    plan: "Free",
    subscriptionStatus: "Canceled and Ended",
    stripeSubscriptionStatus: "canceled",
  });
  const trialingRecognized = storedSubscriptionActive({
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription trialing",
  });
  const permissionsCorrect = freeLimit === 10 && proLimit === 250 && foundingLimit === 250
    && activeProRecognized && canceledDowngradesToFree && trialingRecognized && cancelAtPeriodEndStillActive;
  const subscriptionPermissions = {
    ready: permissionsCorrect,
    freeAiLimit: freeLimit,
    proAiLimit: proLimit,
    foundingAiLimit: foundingLimit,
    activeProRecognized,
    trialingRecognized,
    cancelAtPeriodEndStillActive,
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
    subscriptionStatus: "Canceled and Ended",
    subscriptionCadence: "",
    monthlyPrice: "$0/month",
    stripeSubscriptionStatus: "canceled",
  };
  const cancelStillInactive = !storedSubscriptionActive(mockCanceledUser);
  const cancelStatusCorrect = mockCanceledUser.plan === "Free"
    && mockCanceledUser.subscriptionStatus === "Canceled and Ended";
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

async function handleDomainDnsCheck(request, response) {
  try {
    const report = await buildDomainDnsReport({ siteUrl: SITE_URL });
    jsonResponse(response, 200, { ok: true, domainDns: report });
  } catch (error) {
    jsonResponse(response, 500, { ok: false, error: error.message || "Domain DNS check failed." });
  }
}

// The one deployed-build identifier every environment can report without any
// extra configuration: LLH_GIT_SHA/GIT_COMMIT (set manually, or by a CI
// step) take priority when present, otherwise RENDER_GIT_COMMIT — which
// Render injects automatically into every service's environment for the
// commit it deployed, no setup required. SERVER_BOOT_TIME is this exact
// running process's own start time, used so the client's stale-build check
// can also detect "the server restarted" even on the rare occasion the git
// SHA didn't change (e.g. an env-var-only redeploy).
const SERVER_BOOT_TIME = new Date().toISOString();
function deployedGitSha() {
  return String(process.env.LLH_GIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "").slice(0, 40);
}

function handleBuildVersion(request, response) {
  jsonResponse(response, 200, {
    ok: true,
    gitSha: deployedGitSha(),
    bootTime: SERVER_BOOT_TIME,
    time: new Date().toISOString(),
  });
}

function handleHealth(request, response) {
  const store = peekStore();
  const host = String(request.headers.host || "").split(":")[0].toLowerCase();
  const configuredHost = (() => {
    try {
      return new URL(SITE_URL).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const knownAppHosts = new Set([
    configuredHost,
    RENDER_SERVICE_HOST,
    "localhost",
    "127.0.0.1",
    ...WORKING_BRAND_DOMAINS,
    ...CUSTOM_BRAND_DOMAINS,
  ].filter(Boolean));
  jsonResponse(response, 200, {
    ok: true,
    service: "Little Learner Hub",
    time: new Date().toISOString(),
    stripeCheckoutReady: stripeConfigStatus().checkoutReady,
    launchReady: launchReadinessStatus().ready,
    supportEmailReady: supportEmailConfigStatus().ready,
    founding: foundingStatusPayload(store),
    domain: {
      requestHost: host || null,
      configuredSiteUrl: SITE_URL,
      configuredHost: configuredHost || null,
      servingKnownAppHost: knownAppHosts.has(host),
      customDomainTargets: CUSTOM_BRAND_DOMAINS,
      workingBrandDomains: WORKING_BRAND_DOMAINS,
      renderServiceHost: RENDER_SERVICE_HOST,
      renderApexARecord: RENDER_LOAD_BALANCER_IPV4,
      dnsCheckEndpoint: "/api/domain-dns-check",
      note: "Brand domain must resolve to Render (www CNAME → little-learner-hub.onrender.com, apex A → 216.24.57.1). Provider-agnostic live status: GET /api/domain-dns-check.",
    },
  });
}

function handleFoundingStatus(request, response) {
  jsonResponse(response, 200, { founding: foundingStatusPayload(peekStore()) });
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
    push: {
      supported: Boolean(pushService && pushService.configured()),
      publicKey: pushService ? pushService.publicKey() : "",
    },
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
  if (clientAppScriptCache !== null) return clientAppScriptCache;
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
  clientAppScriptCache = source;
  return clientAppScriptCache;
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

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6-A: Bug Reports, Feature Requests, Feedback, Admin Reply,
//            Announcements, Release Notes handlers
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Normalizers ──────────────────────────────────────────────────────────────

function publicBugReport(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    screenshotUrl: item.screenshotUrl || "",
    recordingUrl: item.recordingUrl || "",
    deviceInfo: item.deviceInfo || "",
    browserInfo: item.browserInfo || "",
    email: item.email,
    name: item.name,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicFeatureRequest(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    email: item.email,
    name: item.name,
    status: item.status,
    votes: item.votes || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicFeatureRequestPublicBoard(item) {
  // Public feature board must not expose submitter emails to other members.
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    email: "",
    name: item.name ? String(item.name).trim().split(/\s+/)[0] || "Member" : "Member",
    status: item.status,
    votes: item.votes || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicFeedback(item) {
  return {
    id: item.id,
    type: item.type,
    message: item.message,
    email: item.email,
    name: item.name,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicAnnouncement(item) {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    audience: item.audience,
    deliveryMode: item.deliveryMode,
    status: item.status,
    publishedAt: item.publishedAt || "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || item.createdAt || "",
  };
}

function publicReleaseNote(item) {
  return {
    id: item.id,
    version: item.version,
    releaseDate: item.releaseDate,
    featuresAdded: item.featuresAdded || [],
    bugsFixed: item.bugsFixed || [],
    improvements: item.improvements || [],
    lessonPlanAdditions: item.lessonPlanAdditions || [],
    activityAdditions: item.activityAdditions || [],
    status: item.status,
    createdAt: item.createdAt,
  };
}

// ─── Bug Report handlers ───────────────────────────────────────────────────────

const BUG_REPORT_CATEGORIES = new Set([
  "Broken Feature", "Error", "Lesson Plan Issue", "Billing Issue",
  "Mobile Issue", "Content Issue", "Login Problem", "Other",
]);
const BUG_REPORT_STATUSES = new Set(["New", "Investigating", "Fix In Progress", "Fixed", "Closed"]);

async function handleBugReportCreate(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const title = String(body.title || "").trim().slice(0, 200);
  const description = String(body.description || "").trim().slice(0, 5000);
  if (!title || !description) {
    jsonResponse(response, 400, { error: "Title and description are required." });
    return;
  }
  const store = readStore();
  store.bugReports = store.bugReports || [];
  const rawCategory = String(body.category || "Other");
  const report = {
    id: `bug-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    title,
    description,
    category: BUG_REPORT_CATEGORIES.has(rawCategory) ? rawCategory : "Other",
    screenshotUrl: String(body.screenshotUrl || "").slice(0, 1000),
    recordingUrl: String(body.recordingUrl || "").slice(0, 1000),
    deviceInfo: String(body.deviceInfo || "").slice(0, 500),
    browserInfo: String(body.browserInfo || body.userAgent || "").slice(0, 500),
    email,
    name: String(body.name || "Provider").slice(0, 120),
    status: "New",
    adminNotes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceUrl: String(body.sourceUrl || "").slice(0, 500),
    userAgent: String(body.userAgent || "").slice(0, 300),
  };
  store.bugReports.unshift(report);
  store.bugReports = store.bugReports.slice(0, 1000);
  try {
    const { recordTimeline, notifyAdminsInApp } = getCommsApi();
    recordTimeline(store, {
      email,
      type: "bug_report",
      title: report.title,
      detail: report.description.slice(0, 400),
    });
    notifyAdminsInApp(store, {
      type: "admin_new_bug",
      title: "New bug report",
      preview: report.title,
      refId: report.id,
    }).catch(() => {});
  } catch {}
  writeStore(store);
  // Admin notification (best-effort)
  notifyAdmin({
    kind: "Bug Report",
    title: report.title,
    name: report.name,
    email: report.email,
    message: report.description,
    createdAt: report.createdAt,
    sourceUrl: report.sourceUrl,
    fields: [["Category", report.category]],
  }).catch((err) => console.warn("[email] Bug report admin notification failed:", err.message));
  // User auto-ack (best-effort)
  notifyUserAck({ toEmail: report.email, toName: report.name, submissionType: "bug report", topic: report.title }).catch((err) => console.warn("[email] Bug report ack failed:", err.message));
  jsonResponse(response, 200, { bugReport: publicBugReport(report), supportEmail: SUPPORT_EMAIL_TO });
}

async function handleBugReportUpdate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to update bug reports." });
    return;
  }
  const id = String(body.id || "");
  const store = ensureMessagingStore(readStore());
  const items = store.bugReports || [];
  const index = items.findIndex((r) => r.id === id);
  if (index < 0) {
    jsonResponse(response, 404, { error: "Bug report was not found." });
    return;
  }
  const previousStatus = items[index].status;
  const rawStatus = body.status ? String(body.status).slice(0, 40) : "";
  items[index] = {
    ...items[index],
    status: rawStatus && BUG_REPORT_STATUSES.has(rawStatus) ? rawStatus : items[index].status,
    updatedAt: new Date().toISOString(),
  };
  if (body.adminNote) {
    items[index].adminNotes = items[index].adminNotes || [];
    items[index].adminNotes.push({
      note: String(body.adminNote).slice(0, 2000),
      addedAt: new Date().toISOString(),
    });
  }
  store.bugReports = items;
  writeStore(store);
  // Notify the reporter (bug-fix update) only on a real status change.
  const reporterEmail = normalizeEmail(items[index].email || "");
  if (reporterEmail && items[index].status !== previousStatus) {
    await fanOutNotificationsAndPush(store, {
      type: "bug_update",
      recipients: [reporterEmail],
      title: "Bug report update",
      preview: `Status: ${items[index].status}`,
      refId: id,
    }).catch((error) => console.warn("[messaging] bug update notification failed:", error.message));
  }
  jsonResponse(response, 200, { bugReport: publicBugReport(items[index]) });
}

async function handleBugReportsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  const store = readStore();
  const allReports = store.bugReports || [];
  if (validAdminToken(adminToken)) {
    jsonResponse(response, 200, { bugReports: allReports.slice(0, 200).map(publicBugReport) });
    return;
  }
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in to view your bug reports." });
    return;
  }
  const myEmail = normalizeEmail(identity.email);
  const reports = allReports.filter((r) => normalizeEmail(r.email) === myEmail);
  jsonResponse(response, 200, { bugReports: reports.slice(0, 200).map(publicBugReport) });
}

// ─── Feature Request handlers ─────────────────────────────────────────────────

const FEATURE_REQUEST_STATUSES = new Set(commsLib.FEATURE_REQUEST_STATUSES);

async function handleFeatureRequestCreate(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const title = String(body.title || "").trim().slice(0, 200);
  const description = String(body.description || "").trim().slice(0, 5000);
  if (!title || !description) {
    jsonResponse(response, 400, { error: "Title and description are required." });
    return;
  }
  const store = readStore();
  store.featureRequests = store.featureRequests || [];
  const item = {
    id: `feature-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    title,
    description,
    category: String(body.category || "General").slice(0, 80),
    email,
    name: String(body.name || "Provider").slice(0, 120),
    status: "New",
    votes: 1,
    voterEmails: email ? [email] : [],
    adminNotes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceUrl: String(body.sourceUrl || "").slice(0, 500),
  };
  store.featureRequests.unshift(item);
  store.featureRequests = store.featureRequests.slice(0, 1000);
  try {
    const { recordTimeline, notifyAdminsInApp } = getCommsApi();
    recordTimeline(store, {
      email,
      type: "feature_request",
      title: item.title,
      detail: item.description.slice(0, 400),
    });
    notifyAdminsInApp(store, {
      type: "admin_new_feature",
      title: "New feature request",
      preview: item.title,
      refId: item.id,
    }).catch(() => {});
  } catch {}
  writeStore(store);
  notifyAdmin({
    kind: "Feature Request",
    title: item.title,
    name: item.name,
    email: item.email,
    message: item.description,
    createdAt: item.createdAt,
    sourceUrl: item.sourceUrl,
    fields: [["Category", item.category]],
  }).catch((err) => console.warn("[email] Feature request admin notification failed:", err.message));
  notifyUserAck({ toEmail: item.email, toName: item.name, submissionType: "feature request", topic: item.title }).catch((err) => console.warn("[email] Feature request ack failed:", err.message));
  jsonResponse(response, 200, { featureRequest: publicFeatureRequest(item), supportEmail: SUPPORT_EMAIL_TO });
}

async function handleFeatureRequestVote(request, response) {
  const body = await readJson(request);
  const id = String(body.id || "");
  const voterEmail = normalizeEmail(body.email);
  if (!id || !voterEmail) {
    jsonResponse(response, 400, { error: "Feature request id and email are required to vote." });
    return;
  }
  const store = readStore();
  const items = store.featureRequests || [];
  const index = items.findIndex((r) => r.id === id);
  if (index < 0) {
    jsonResponse(response, 404, { error: "Feature request was not found." });
    return;
  }
  const alreadyVoted = (items[index].voterEmails || []).includes(voterEmail);
  if (!alreadyVoted) {
    items[index].voterEmails = [...(items[index].voterEmails || []), voterEmail];
    items[index].votes = items[index].voterEmails.length;
    items[index].updatedAt = new Date().toISOString();
    store.featureRequests = items;
    writeStore(store);
  }
  jsonResponse(response, 200, { featureRequest: publicFeatureRequest(items[index]), alreadyVoted });
}

async function handleFeatureRequestUpdate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to update feature requests." });
    return;
  }
  const id = String(body.id || "");
  const store = readStore();
  const items = store.featureRequests || [];
  const index = items.findIndex((r) => r.id === id);
  if (index < 0) {
    jsonResponse(response, 404, { error: "Feature request was not found." });
    return;
  }
  const rawStatus = body.status ? String(body.status).slice(0, 40) : "";
  const previousStatus = items[index].status;
  const nextStatus = rawStatus ? commsLib.normalizeFeatureStatus(rawStatus) : items[index].status;
  items[index] = {
    ...items[index],
    status: FEATURE_REQUEST_STATUSES.has(nextStatus) ? nextStatus : items[index].status,
    updatedAt: new Date().toISOString(),
  };
  if (body.adminNote) {
    items[index].adminNotes = items[index].adminNotes || [];
    items[index].adminNotes.push({
      note: String(body.adminNote).slice(0, 2000),
      addedAt: new Date().toISOString(),
    });
  }
  // Merge duplicate: transfer votes and voter emails to a target feature request
  if (body.mergeIntoId) {
    const targetIdx = items.findIndex((r) => r.id === String(body.mergeIntoId));
    if (targetIdx >= 0 && targetIdx !== index) {
      const mergedVoters = [...new Set([...(items[targetIdx].voterEmails || []), ...(items[index].voterEmails || [])])];
      items[targetIdx].voterEmails = mergedVoters;
      items[targetIdx].votes = mergedVoters.length;
      items[targetIdx].updatedAt = new Date().toISOString();
      items[index].status = "Declined";
      items[index].updatedAt = new Date().toISOString();
    }
  }
  store.featureRequests = items;
  writeStore(store);
  const reporterEmail = normalizeEmail(items[index].email || "");
  if (reporterEmail && items[index].status !== previousStatus) {
    const messagingStore = ensureMessagingStore(readStore());
    await fanOutNotificationsAndPush(messagingStore, {
      type: "feature_status",
      recipients: [reporterEmail],
      title: "Feature request update",
      preview: `Status: ${items[index].status}`,
      refId: id,
    }).catch((error) => console.warn("[messaging] feature status notification failed:", error.message));
  }
  jsonResponse(response, 200, { featureRequest: publicFeatureRequest(items[index]) });
}

function handleFeatureRequestsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  const store = readStore();
  const allItems = store.featureRequests || [];
  const isAdmin = validAdminToken(adminToken);
  const items = isAdmin
    ? allItems
    : allItems.filter((r) => r.status !== "Declined");
  // Sort by votes descending for public; by createdAt for admin
  const sorted = isAdmin
    ? items.slice()
    : items.slice().sort((a, b) => (b.votes || 0) - (a.votes || 0));
  jsonResponse(response, 200, {
    featureRequests: sorted.slice(0, 200).map((item) => (
      isAdmin ? publicFeatureRequest(item) : publicFeatureRequestPublicBoard(item)
    )),
  });
}

// ─── Feedback handlers ────────────────────────────────────────────────────────

const FEEDBACK_TYPES = new Set([
  "General Feedback", "Suggestion", "Idea", "Compliment", "Improvement Request",
  "Bug", "Problem", "Missing Feature", "Question", "Feature Request", "Support",
  "Lesson Plan Feedback",
]);
const FEEDBACK_STATUSES = new Set(["New", "In Progress", "Reviewed", "Planned", "Resolved", "Completed", "Archived"]);

async function handleFeedbackCreate(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const message = String(body.message || "").trim().slice(0, 5000);
  if (!message) {
    jsonResponse(response, 400, { error: "Message is required." });
    return;
  }
  const rawType = String(body.type || "General Feedback");
  const store = readStore();
  store.feedbackItems = store.feedbackItems || [];
  const item = {
    id: `feedback-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    type: FEEDBACK_TYPES.has(rawType) ? rawType : "General Feedback",
    message,
    email,
    name: String(body.name || "Provider").slice(0, 120),
    status: "New",
    adminNotes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceUrl: String(body.sourceUrl || "").slice(0, 500),
    accountType: String(body.accountType || "").slice(0, 80),
    role: String(body.role || "").slice(0, 80),
    subject: String(body.subject || body.type || "Feedback").slice(0, 200),
    page: String(body.page || body.sourceUrl || "").slice(0, 500),
  };
  store.feedbackItems.unshift(item);
  store.feedbackItems = store.feedbackItems.slice(0, 1000);
  try {
    const { recordTimeline, notifyAdminsInApp } = getCommsApi();
    recordTimeline(store, {
      email,
      type: "feedback",
      title: item.subject || item.type,
      detail: item.message.slice(0, 400),
    });
    const adminType = item.type === "Bug" || item.type === "Problem"
      ? "admin_new_bug"
      : item.type === "Feature Request" || item.type === "Missing Feature"
        ? "admin_new_feature"
        : "admin_new_support";
    notifyAdminsInApp(store, {
      type: adminType,
      title: `New ${item.type}`,
      preview: item.subject || item.message.slice(0, 120),
      refId: item.id,
    }).catch(() => {});
  } catch {}
  writeStore(store);
  notifyAdmin({
    kind: "Feedback",
    title: item.subject || item.type,
    name: item.name,
    email: item.email,
    message: item.message,
    createdAt: item.createdAt,
    sourceUrl: item.page || item.sourceUrl,
    fields: [
      ["Feedback Type", item.type],
      ["Subject", item.subject],
      ["Account Type", item.accountType || "—"],
      ["Role", item.role || "—"],
      ["Page", item.page || item.sourceUrl || "—"],
    ],
  }).catch((err) => console.warn("[email] Feedback admin notification failed:", err.message));
  notifyUserAck({ toEmail: item.email, toName: item.name, submissionType: "feedback", topic: item.type }).catch((err) => console.warn("[email] Feedback ack failed:", err.message));
  jsonResponse(response, 200, { feedback: publicFeedback(item), supportEmail: SUPPORT_EMAIL_TO });
}

async function handleFeedbackUpdate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to update feedback." });
    return;
  }
  const id = String(body.id || "");
  const store = readStore();
  const items = store.feedbackItems || [];
  const index = items.findIndex((r) => r.id === id);
  if (index < 0) {
    jsonResponse(response, 404, { error: "Feedback item was not found." });
    return;
  }
  const rawStatus = body.status ? String(body.status).slice(0, 40) : "";
  items[index] = {
    ...items[index],
    status: rawStatus && FEEDBACK_STATUSES.has(rawStatus) ? rawStatus : items[index].status,
    updatedAt: new Date().toISOString(),
  };
  if (body.adminNote) {
    items[index].adminNotes = items[index].adminNotes || [];
    items[index].adminNotes.push({
      note: String(body.adminNote).slice(0, 2000),
      addedAt: new Date().toISOString(),
    });
  }
  store.feedbackItems = items;
  writeStore(store);
  jsonResponse(response, 200, { feedback: publicFeedback(items[index]) });
}

async function handleFeedbackList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  const store = readStore();
  const allItems = store.feedbackItems || [];
  if (validAdminToken(adminToken)) {
    jsonResponse(response, 200, { feedback: allItems.slice(0, 200).map(publicFeedback) });
    return;
  }
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message || "Please log in to view your feedback." });
    return;
  }
  const myEmail = normalizeEmail(identity.email);
  const items = allItems.filter((r) => normalizeEmail(r.email) === myEmail);
  jsonResponse(response, 200, { feedback: items.slice(0, 200).map(publicFeedback) });
}

// ─── Admin Reply handler ───────────────────────────────────────────────────────
// Sends an email from admin to a user, and logs it to communications[].

async function handleAdminReply(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to send replies." });
    return;
  }
  const toEmail = normalizeEmail(body.toEmail);
  const subject = String(body.subject || "").trim().slice(0, 500);
  const message = String(body.message || "").trim().slice(0, 10000);
  if (!toEmail || !subject || !message) {
    jsonResponse(response, 400, { error: "toEmail, subject, and message are required." });
    return;
  }
  const relatedId = String(body.relatedId || "");
  const relatedType = String(body.relatedType || "ticket").slice(0, 40);
  const now = new Date().toISOString();
  const text = `${message}\n\n— The Little Learner Hub Team`;
  const html = `<p>${htmlEscape(message).replace(/\n/g, "<br>")}</p><p>— The Little Learner Hub Team</p>`;
  let emailResult = { sent: false, configured: false };
  try {
    emailResult = await sendEmail({ to: toEmail, replyTo: SUPPORT_EMAIL_TO, subject, text, html });
  } catch (err) {
    console.warn("[email] Admin reply failed:", err.message);
    emailResult = { sent: false, configured: supportEmailConfigStatus().ready, error: err.message };
  }
  const entry = {
    id: `comm-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    relatedId,
    relatedType,
    direction: "out",
    from: SUPPORT_EMAIL_FROM || SUPPORT_EMAIL_TO,
    to: toEmail,
    subject,
    body: message,
    sentAt: now,
    method: "email",
    emailResult,
  };
  const store = readStore();
  store.communications = store.communications || [];
  store.communications.unshift(entry);
  store.communications = store.communications.slice(0, 5000);
  writeStore(store);
  jsonResponse(response, 200, { ok: true, communication: entry, emailResult });
}

function handleCommunicationsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const relatedId = url.searchParams.get("relatedId") || "";
  const store = readStore();
  const all = store.communications || [];
  const items = relatedId ? all.filter((c) => c.relatedId === relatedId) : all;
  jsonResponse(response, 200, { communications: items.slice(0, 500) });
}

// ─── Announcements handlers ───────────────────────────────────────────────────

const ANNOUNCEMENT_AUDIENCES = new Set(["all", "free", "pro", "founding"]);
const ANNOUNCEMENT_DELIVERY_MODES = new Set(["in-app", "email", "both"]);
const ANNOUNCEMENT_STATUSES = new Set(["draft", "published", "archived"]);

async function handleAnnouncementCreate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to create announcements." });
    return;
  }
  const title = String(body.title || "").trim().slice(0, 300);
  const announcementBody = String(body.body || "").trim().slice(0, 10000);
  if (!title || !announcementBody) {
    jsonResponse(response, 400, { error: "Title and body are required." });
    return;
  }
  const rawAudience = String(body.audience || "all").toLowerCase();
  const rawDelivery = String(body.deliveryMode || "in-app").toLowerCase();
  const rawStatus = String(body.status || "draft").toLowerCase();
  const store = readStore();
  store.announcements = store.announcements || [];
  const item = {
    id: `ann-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    title,
    body: announcementBody,
    audience: ANNOUNCEMENT_AUDIENCES.has(rawAudience) ? rawAudience : "all",
    deliveryMode: ANNOUNCEMENT_DELIVERY_MODES.has(rawDelivery) ? rawDelivery : "in-app",
    status: ANNOUNCEMENT_STATUSES.has(rawStatus) ? rawStatus : "draft",
    publishedAt: rawStatus === "published" ? new Date().toISOString() : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.announcements.unshift(item);
  store.announcements = store.announcements.slice(0, 500);
  writeStore(store);
  jsonResponse(response, 200, { announcement: publicAnnouncement(item) });
}

async function handleAnnouncementUpdate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to update announcements." });
    return;
  }
  const id = String(body.id || "");
  const store = readStore();
  const items = store.announcements || [];
  const index = items.findIndex((r) => r.id === id);
  if (index < 0) {
    jsonResponse(response, 404, { error: "Announcement was not found." });
    return;
  }
  const rawStatus = body.status ? String(body.status).toLowerCase() : "";
  const prevStatus = items[index].status;
  const nextStatus = rawStatus && ANNOUNCEMENT_STATUSES.has(rawStatus) ? rawStatus : prevStatus;
  items[index] = {
    ...items[index],
    title: body.title ? String(body.title).slice(0, 300) : items[index].title,
    body: body.body ? String(body.body).slice(0, 10000) : items[index].body,
    audience: body.audience && ANNOUNCEMENT_AUDIENCES.has(String(body.audience).toLowerCase()) ? String(body.audience).toLowerCase() : items[index].audience,
    deliveryMode: body.deliveryMode && ANNOUNCEMENT_DELIVERY_MODES.has(String(body.deliveryMode).toLowerCase()) ? String(body.deliveryMode).toLowerCase() : items[index].deliveryMode,
    status: nextStatus,
    publishedAt: nextStatus === "published" && !items[index].publishedAt ? new Date().toISOString() : items[index].publishedAt,
    updatedAt: new Date().toISOString(),
  };
  store.announcements = items;
  writeStore(store);
  jsonResponse(response, 200, { announcement: publicAnnouncement(items[index]) });
}

function handleAnnouncementsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  const store = readStore();
  const all = store.announcements || [];
  if (validAdminToken(adminToken)) {
    jsonResponse(response, 200, { announcements: all.slice(0, 200).map(publicAnnouncement) });
    return;
  }
  // Public: only published in-app announcements
  const published = all.filter((a) => a.status === "published" && (a.deliveryMode === "in-app" || a.deliveryMode === "both"));
  jsonResponse(response, 200, { announcements: published.slice(0, 50).map(publicAnnouncement) });
}

// ─── Member Messaging Center + Web Push ────────────────────────────────────────
// In-app messaging is always the source of truth: a message is saved and an
// unread notification created *before* any push attempt. Push is best-effort
// on top — if it is unavailable, unconfigured, declined, or fails, the
// in-app message and notification remain intact either way.

async function resolveMemberIdentity(request) {
  // Reuses the same Firebase/test/email-header identity resolution already
  // used for the schedule API so messaging never introduces a second,
  // divergent auth path.
  return resolveScheduleIdentity(request);
}

function capArray(list, max) {
  return list.length > max ? list.slice(0, max) : list;
}

function messagingRandomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function sendFingerprintKey(parts) {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function isDuplicateSend(fingerprint) {
  const now = Date.now();
  for (const [key, expiresAt] of recentSendFingerprints) {
    if (expiresAt <= now) recentSendFingerprints.delete(key);
  }
  if (recentSendFingerprints.has(fingerprint)) return true;
  recentSendFingerprints.set(fingerprint, now + SEND_FINGERPRINT_TTL_MS);
  return false;
}

function publicMessage(message) {
  return {
    id: message.id,
    kind: message.kind,
    audience: message.audience,
    senderType: message.senderType,
    senderEmail: message.senderType === "admin" ? "" : message.senderEmail,
    senderName: message.senderType === "admin" ? (ADMIN_NAME || "Leah") : (message.senderName || "You"),
    toEmail: message.toEmail || "",
    conversationEmail: message.conversationEmail || "",
    subject: message.subject || "",
    body: message.body || "",
    recipientCount: message.recipientCount || 0,
    createdAt: message.createdAt,
    sentAt: message.sentAt || message.createdAt,
    pushSummary: message.pushSummary || null,
  };
}

function publicNotification(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title || "",
    preview: notification.preview || "",
    messageId: notification.messageId || "",
    conversationEmail: notification.conversationEmail || "",
    refId: notification.refId || "",
    createdAt: notification.createdAt,
    read: Boolean(notification.read),
    readAt: notification.readAt || "",
  };
}

function publicPushSubscription(sub) {
  return {
    id: sub.id,
    deviceLabel: sub.deviceLabel || describeUserAgent(sub.userAgent),
    createdAt: sub.createdAt,
    lastSeenAt: sub.lastSeenAt || sub.createdAt,
    lastSuccessAt: sub.lastSuccessAt || "",
    lastFailureAt: sub.lastFailureAt || "",
    failureCount: sub.failureCount || 0,
  };
}

function describeUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS device";
  if (/android/i.test(ua)) return "Android device";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/linux/i.test(ua)) return "Linux device";
  return "Device";
}

function logPushDelivery(store, entry) {
  store.pushDeliveryLog.unshift({
    id: messagingRandomId("pushlog"),
    at: new Date().toISOString(),
    ...entry,
  });
  store.pushDeliveryLog = capArray(store.pushDeliveryLog, MAX_PUSH_DELIVERY_LOG);
}

function userNotificationPreference(store, email) {
  const raw = store.notificationPreferences[email];
  return {
    pushEnabled: Boolean(raw?.pushEnabled),
    decision: raw?.decision || "default",
    promptedAt: raw?.promptedAt || "",
    respondedAt: raw?.respondedAt || "",
    updatedAt: raw?.updatedAt || "",
  };
}

/**
 * Creates one notification row per recipient (always — this is the in-app
 * source of truth for the bell + unread badges), then best-effort attempts
 * push for recipients who explicitly opted in and have live subscriptions.
 * Never throws: push failures are logged, never allowed to roll back the
 * in-app notifications that were already persisted.
 *
 * @returns {Promise<{targeted:number, optedIn:number, attempted:number, sent:number, failed:number, skipped:number, expired:number}>}
 */
async function fanOutNotificationsAndPush(store, {
  type,
  recipients,
  title,
  preview,
  messageId = "",
  conversationEmail = "",
  refId = "",
  senderName = ADMIN_NAME || "Leah",
  url = "",
  category = "",
  deepLink = "",
}) {
  const uniqueRecipients = [...new Set((recipients || []).map((e) => normalizeEmail(e)).filter(Boolean))];
  const now = new Date().toISOString();
  const notificationByEmail = new Map();
  const resolvedDeepLink = deepLink || url || "";
  store.notifications = Array.isArray(store.notifications) ? store.notifications : [];
  uniqueRecipients.forEach((email) => {
    const notification = {
      id: messagingRandomId("notif"),
      email,
      type,
      category: category || "",
      title: messagingLib.clampText(title, 200),
      preview: messagingLib.clampText(preview, 240),
      messageId,
      conversationEmail,
      refId,
      deepLink: resolvedDeepLink,
      createdAt: now,
      read: false,
      readAt: "",
      pushAttempted: false,
      pushSent: false,
      pushError: "",
    };
    notificationByEmail.set(email, notification);
    store.notifications.unshift(notification);
  });
  store.notifications = capArray(store.notifications, MAX_NOTIFICATIONS);

  const summary = {
    targeted: uniqueRecipients.length,
    optedIn: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    expired: 0,
  };

  if (!pushService || !pushService.configured()) {
    writeStore(store);
    return summary;
  }

  // Build one push job per (subscription) so a user with multiple devices
  // gets the notification on every device they opted in on.
  const jobs = [];
  uniqueRecipients.forEach((email) => {
    const pref = userNotificationPreference(store, email);
    if (!pref.pushEnabled) return; // explicit opt-in required — never nag or auto-enable
    const subs = store.pushSubscriptions.filter((s) => s.email === email && !s.expired);
    if (!subs.length) return;
    summary.optedIn += 1;
    subs.forEach((subscription) => jobs.push({ email, subscription, notification: notificationByEmail.get(email) }));
  });

  if (jobs.length) {
    const copy = messagingLib.pushCopyForNotification({ type, senderName, title });
    const results = await pushService.sendBatch(
      jobs.map((job) => job.subscription),
      () => ({
        title: copy.title,
        body: copy.body,
        icon: "/images/icons/icon-192.png",
        badge: "/images/icons/badge-72.png",
        data: {
          url: resolvedDeepLink
            || (conversationEmail
              ? `/?view=messages&conversation=${encodeURIComponent(conversationEmail)}`
              : "/?view=messages"),
          type,
          category: category || "",
        },
      }),
      { batchSize: PUSH_BULK_BATCH_SIZE, batchDelayMs: PUSH_BULK_BATCH_DELAY_MS, maxRecipientsPerSend: PUSH_BULK_MAX_RECIPIENTS },
    );

    results.forEach((entry, index) => {
      const job = jobs[index];
      const { result } = entry;
      const notification = job.notification;
      if (result.skipped) {
        summary.skipped += 1;
        logPushDelivery(store, { email: job.email, notificationId: notification.id, result: "skipped", reason: "rate_limit_skipped" });
        return;
      }
      summary.attempted += 1;
      notification.pushAttempted = true;
      if (result.ok) {
        summary.sent += 1;
        notification.pushSent = true;
        job.subscription.lastSuccessAt = new Date().toISOString();
        job.subscription.failureCount = 0;
        logPushDelivery(store, { email: job.email, notificationId: notification.id, result: "sent" });
      } else if (result.expired) {
        summary.expired += 1;
        notification.pushError = "subscription_expired";
        job.subscription.expired = true;
        store.pushSubscriptions = store.pushSubscriptions.filter((s) => s.id !== job.subscription.id);
        logPushDelivery(store, { email: job.email, notificationId: notification.id, result: "expired", reason: result.error });
      } else {
        summary.failed += 1;
        notification.pushError = String(result.error || "push_failed").slice(0, 300);
        job.subscription.lastFailureAt = new Date().toISOString();
        job.subscription.failureCount = (job.subscription.failureCount || 0) + 1;
        logPushDelivery(store, { email: job.email, notificationId: notification.id, result: "failed", reason: result.error });
      }
    });
  }

  writeStore(store);
  return summary;
}

// Kept in sync with the audience selector in the admin composer UI.
function messagePreviewText(body, maxLength = 160) {
  const clean = String(body || "").replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

async function handleAdminMessagePreview(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const audience = String(body.audience || "").trim().toLowerCase();
  if (!messagingLib.AUDIENCES.includes(audience)) {
    jsonResponse(response, 400, { error: "Unknown audience." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const recipients = messagingCenter.resolveAudienceRecipients(store, {
    audience,
    toEmail: normalizeEmail(body.toEmail),
    selectedEmails: Array.isArray(body.selectedEmails) ? body.selectedEmails : [],
    adminEmail: ADMIN_EMAIL,
    adminEmails: ADMIN_EMAILS,
  });
  jsonResponse(response, 200, {
    audience,
    audienceLabel: messagingLib.audienceLabel(audience),
    recipientCount: recipients.length,
    sampleRecipients: recipients.slice(0, 10),
    messagePreview: messagePreviewText(body.body || ""),
    requiresConfirmation: audience !== "private",
  });
}

async function handleAdminMessageSend(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to send messages." });
    return;
  }
  const audience = String(body.audience || "").trim().toLowerCase();
  if (!messagingLib.AUDIENCES.includes(audience)) {
    jsonResponse(response, 400, { error: "Unknown audience." });
    return;
  }
  const subject = messagingLib.clampText(body.subject, 300);
  const messageBody = messagingLib.clampText(body.body, 8000);
  if (!messageBody) {
    jsonResponse(response, 400, { error: "Message body is required." });
    return;
  }
  const kind = messagingLib.MESSAGE_KINDS.includes(body.kind)
    ? body.kind
    : (audience === "private" ? "message" : "announcement");
  // feature_update is an announcement-style broadcast with a distinct bell icon.
  const toEmail = normalizeEmail(body.toEmail);
  if (audience === "private" && !toEmail) {
    jsonResponse(response, 400, { error: "toEmail is required for a private message." });
    return;
  }
  const selectedEmails = Array.isArray(body.selectedEmails) ? body.selectedEmails.map(normalizeEmail).filter(Boolean) : [];
  if (audience === "selected" && !selectedEmails.length) {
    jsonResponse(response, 400, { error: "Select at least one user." });
    return;
  }
  // Group sends must show a recipient-count confirmation before this call —
  // never allow one accidental click to notify everyone.
  if (audience !== "private" && body.confirm !== true) {
    jsonResponse(response, 400, { error: "Group messages require confirmation (confirm: true) after reviewing the recipient count and preview." });
    return;
  }

  const fingerprint = sendFingerprintKey([audience, toEmail, selectedEmails.sort(), subject, messageBody]);
  if (isDuplicateSend(fingerprint)) {
    jsonResponse(response, 409, { error: "This message was already sent moments ago (duplicate submission blocked)." });
    return;
  }

  const store = ensureMessagingStore(readStore());
  const recipients = messagingCenter.resolveAudienceRecipients(store, {
    audience,
    toEmail,
    selectedEmails,
    adminEmail: ADMIN_EMAIL,
    adminEmails: ADMIN_EMAILS,
  });
  if (!recipients.length) {
    jsonResponse(response, 400, { error: "No recipients matched this audience." });
    return;
  }

  const now = new Date().toISOString();
  const message = {
    id: messagingRandomId("msg"),
    kind,
    audience,
    senderType: "admin",
    senderEmail: ADMIN_EMAIL,
    senderName: ADMIN_NAME || "Leah",
    toEmail: audience === "private" ? toEmail : "",
    conversationEmail: audience === "private" ? toEmail : "",
    selectedEmails: audience === "selected" ? selectedEmails : [],
    subject,
    body: messageBody,
    recipientCount: recipients.length,
    createdAt: now,
    sentAt: now,
    status: "sent",
    pushSummary: null,
  };
  store.messages.unshift(message);
  store.messages = capArray(store.messages, MAX_MESSAGES);

  const deliverVia = commsLib.BROADCAST_DELIVERY.includes(body.deliverVia) ? body.deliverVia : "in_app";
  message.deliverVia = deliverVia;

  try {
    const { recordTimeline, logBroadcast } = getCommsApi();
    if (audience === "private" && toEmail) {
      recordTimeline(store, {
        email: toEmail,
        type: "message_received",
        title: subject || "Message from Leah",
        detail: messageBody.slice(0, 400),
      });
    }
    if (audience !== "private") {
      logBroadcast(store, {
        audience,
        kind,
        subject,
        recipientCount: recipients.length,
        delivery: deliverVia,
        messageId: message.id,
        preview: messagePreviewText(messageBody),
      });
    }
  } catch {}
  writeStore(store);

  let summary = { targeted: 0, sent: 0, failed: 0, skipped: 0 };
  if (deliverVia === "in_app" || deliverVia === "both") {
    const notificationType = kind === "feature_update"
      ? "feature_update"
      : kind === "announcement"
        ? "announcement"
        : "message";
    summary = await fanOutNotificationsAndPush(store, {
      type: notificationType,
      recipients,
      title: audience === "private" ? "New message from Leah" : (subject || "Little Learner Hub"),
      preview: messagePreviewText(messageBody),
      messageId: message.id,
      conversationEmail: message.conversationEmail,
      senderName: ADMIN_NAME || "Leah",
    });
  }

  let emailSummary = { attempted: 0, sent: 0, failed: 0, truncated: false };
  if (deliverVia === "email" || deliverVia === "both") {
    // Send to the full resolved audience — never silently truncate bulk email lists.
    for (const recipient of recipients) {
      emailSummary.attempted += 1;
      try {
        const result = await sendEmail({
          to: recipient,
          replyTo: SUPPORT_EMAIL_TO,
          subject: subject || "Message from Little Learner Hub",
          text: `${messageBody}\n\n— ${ADMIN_NAME || "Leah"}\nLittle Learner Hub`,
          html: `<p>${String(messageBody).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p><p>— ${ADMIN_NAME || "Leah"}<br>Little Learner Hub</p>`,
        });
        if (result?.sent) emailSummary.sent += 1;
        else emailSummary.failed += 1;
      } catch {
        emailSummary.failed += 1;
      }
    }
  }

  const store2 = readStore();
  const index = store2.messages.findIndex((m) => m.id === message.id);
  if (index >= 0) {
    store2.messages[index].pushSummary = summary;
    store2.messages[index].emailSummary = emailSummary;
    store2.messages[index].deliverVia = deliverVia;
    writeStore(store2);
  }

  jsonResponse(response, 200, {
    ok: true,
    message: publicMessage({ ...message, pushSummary: summary }),
    recipientCount: recipients.length,
    pushSummary: summary,
    emailSummary,
    deliverVia,
  });
}

async function handleAdminMessageDraftSave(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const audience = String(body.audience || "all").trim().toLowerCase();
  const store = ensureMessagingStore(readStore());
  const id = String(body.id || "") || messagingRandomId("draft");
  const existingIndex = store.messageDrafts.findIndex((d) => d.id === id);
  const draft = {
    id,
    audience: messagingLib.AUDIENCES.includes(audience) ? audience : "all",
    toEmail: normalizeEmail(body.toEmail || ""),
    selectedEmails: Array.isArray(body.selectedEmails) ? body.selectedEmails.map(normalizeEmail).filter(Boolean) : [],
    subject: messagingLib.clampText(body.subject, 300),
    body: messagingLib.clampText(body.body, 8000),
    kind: messagingLib.MESSAGE_KINDS.includes(body.kind) ? body.kind : "announcement",
    updatedAt: new Date().toISOString(),
    createdAt: existingIndex >= 0 ? store.messageDrafts[existingIndex].createdAt : new Date().toISOString(),
  };
  if (existingIndex >= 0) {
    store.messageDrafts[existingIndex] = draft;
  } else {
    store.messageDrafts.unshift(draft);
  }
  store.messageDrafts = capArray(store.messageDrafts, 500);
  writeStore(store);
  // Drafts are never fanned out to notifications and never trigger push.
  jsonResponse(response, 200, { ok: true, draft });
}

function handleAdminMessageDraftsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  jsonResponse(response, 200, { drafts: store.messageDrafts });
}

async function handleAdminMessageDraftDelete(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  store.messageDrafts = store.messageDrafts.filter((d) => d.id !== String(body.id || ""));
  writeStore(store);
  jsonResponse(response, 200, { ok: true });
}

function isAdminConversationUnreadNotification(n, adminEmail = ADMIN_EMAIL) {
  if (!n || n.read) return false;
  if (!isConfiguredAdminEmail(n.email) && normalizeEmail(n.email) !== normalizeEmail(adminEmail || "")) {
    return false;
  }
  if (!normalizeEmail(n.conversationEmail || "")) return false;
  const type = String(n.type || "");
  return type === "message"
    || type === "admin_new_message"
    || type === "admin_message_reply";
}

function handleAdminConversationsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const byUser = new Map();
  store.messages
    .filter((m) => m.audience === "private" && m.conversationEmail)
    .forEach((m) => {
      const existing = byUser.get(m.conversationEmail);
      if (!existing || m.createdAt > existing.lastMessageAt) {
        byUser.set(m.conversationEmail, {
          userEmail: m.conversationEmail,
          lastMessageAt: m.createdAt,
          lastMessagePreview: messagePreviewText(m.body, 100),
          lastMessageSender: m.senderType,
        });
      }
    });
  // Count unread user messages once per messageId — admin aliases each get a
  // notification copy, which must not inflate the Conversations badge.
  const unreadFromUser = new Map();
  const seenUnreadKeys = new Set();
  store.notifications
    .filter((n) => isAdminConversationUnreadNotification(n))
    .forEach((n) => {
      const key = normalizeEmail(n.conversationEmail);
      if (!key) return;
      const dedupe = `${key}:${String(n.messageId || n.refId || n.id || "")}`;
      if (seenUnreadKeys.has(dedupe)) return;
      seenUnreadKeys.add(dedupe);
      unreadFromUser.set(key, (unreadFromUser.get(key) || 0) + 1);
    });
  const conversations = [...byUser.values()]
    .map((c) => {
      const profile = publicConversationUserProfile(store, c.userEmail);
      return {
        ...c,
        userName: profile.name || c.userEmail,
        businessName: profile.businessName || "",
        plan: profile.plan || "Free",
        unreadFromUser: unreadFromUser.get(normalizeEmail(c.userEmail)) || 0,
      };
    })
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  jsonResponse(response, 200, { conversations });
}

function publicConversationUserProfile(store, email) {
  const user = store.users?.[email] || { email };
  const accessGroup = messagingCenter.accessGroupForUser(store, user);
  const planLabel = accessGroup === "founding"
    ? "Founding Member"
    : accessGroup === "pro"
      ? "Pro"
      : "Free";
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ")
    || user.name
    || user.displayName
    || "";
  return {
    email,
    name: displayName || email,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    businessName: user.businessName || user.daycareName || user.programName || "",
    accountType: accountAccess.accountTypeLabel(accountAccess.resolveAccountType(user)),
    role: accountAccess.roleLabel(accountAccess.resolveUserRole(user)),
    plan: planLabel,
    accessGroup,
    signupAt: user.signupAt || user.createdAt || "",
    lastActiveAt: user.lastSeenAt || user.lastLoginAt || user.updatedAt || "",
    lastLoginAt: user.lastLoginAt || "",
  };
}

function handleAdminConversationMessages(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const userEmail = normalizeEmail(url.searchParams.get("userEmail") || "");
  if (!userEmail) {
    jsonResponse(response, 400, { error: "userEmail is required." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  // Opening a thread marks Leah's unread badges for that member as read so the
  // Conversations list updates immediately (and stays correct after live refresh).
  if (ADMIN_EMAILS.length) {
    const now = new Date().toISOString();
    let marked = 0;
    store.notifications.forEach((n) => {
      if (!isAdminConversationUnreadNotification(n)) return;
      if (normalizeEmail(n.conversationEmail) !== userEmail) return;
      n.read = true;
      n.readAt = now;
      marked += 1;
    });
    if (marked) writeStore(store);
  }
  const messages = store.messages
    .filter((m) => m.audience === "private" && m.conversationEmail === userEmail)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map(publicMessage);
  jsonResponse(response, 200, {
    userEmail,
    messages,
    user: publicConversationUserProfile(store, userEmail),
  });
}

// ─── Member-facing messaging endpoints ─────────────────────────────────────────

async function handleMemberConversation(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const myEmail = normalizeEmail(identity.email);
  const messages = store.messages
    .filter((m) => m.audience === "private" && normalizeEmail(m.conversationEmail) === myEmail)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map(publicMessage);
  jsonResponse(response, 200, { messages });
}

async function handleMemberMessageReply(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const body = await readJson(request);
  const messageBody = messagingLib.clampText(body.body, 4000);
  if (!messageBody) {
    jsonResponse(response, 400, { error: "Message body is required." });
    return;
  }
  const fingerprint = sendFingerprintKey(["member-reply", identity.email, messageBody]);
  if (isDuplicateSend(fingerprint)) {
    jsonResponse(response, 200, {
      ok: true,
      duplicate: true,
      message: "That message was already sent. Refresh to see it in the conversation.",
    });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const user = store.users?.[identity.email] || { email: identity.email };
  const now = new Date().toISOString();
  const message = {
    id: messagingRandomId("msg"),
    kind: "message",
    audience: "private",
    senderType: "user",
    senderEmail: identity.email,
    senderName: user.firstName || user.name || identity.email,
    toEmail: "",
    conversationEmail: identity.email,
    subject: "",
    body: messageBody,
    recipientCount: 1,
    createdAt: now,
    sentAt: now,
    status: "sent",
    pushSummary: null,
  };
  store.messages.unshift(message);
  store.messages = capArray(store.messages, MAX_MESSAGES);
  try {
    const { recordTimeline } = getCommsApi();
    recordTimeline(store, {
      email: identity.email,
      type: "message_sent",
      title: "Message to Leah",
      detail: messageBody.slice(0, 400),
    });
  } catch {}

  // Single admin alert (deduped) — previously notifyAdminsInApp + fanOut both fired.
  if (ADMIN_EMAIL) {
    const priorAdminMessages = store.messages.filter(
      (m) => m.audience === "private"
        && m.conversationEmail === identity.email
        && m.senderType === "admin"
        && m.id !== message.id,
    );
    await emitAdminAlertSafe(store, {
      category: "messaging",
      type: priorAdminMessages.length ? "admin_message_reply" : "admin_new_message",
      title: priorAdminMessages.length
        ? `Reply from ${message.senderName}`
        : `New message from ${message.senderName}`,
      preview: messagePreviewText(messageBody),
      email: identity.email,
      name: message.senderName,
      conversationEmail: identity.email,
      messageId: message.id,
      refId: message.id,
      sendEmail: false,
      deepLink: `/?view=admin&adminPanel=inbox&adminFocusConversation=${encodeURIComponent(identity.email)}`,
    });
  }
  writeStore(store);

  jsonResponse(response, 200, { ok: true, message: publicMessage(message) });
}

async function handleMemberInbox(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const myEmail = normalizeEmail(identity.email);
  const messageById = new Map(store.messages.map((m) => [m.id, m]));
  const broadcastNotifications = store.notifications
    .filter((n) => {
      if (normalizeEmail(n.email) !== myEmail || n.conversationEmail) return false;
      if (isAdminOnlyNotificationType(n.type) && !isConfiguredAdminEmail(myEmail)) return false;
      return n.type === "message" || n.type === "announcement" || n.type === "feature_update";
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 200)
    .map((n) => ({
      notification: publicNotification(n),
      message: messageById.has(n.messageId) ? publicMessage(messageById.get(n.messageId)) : null,
    }));
  jsonResponse(response, 200, { items: broadcastNotifications });
}

async function handleMemberMarkRead(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const body = await readJson(request);
  const store = ensureMessagingStore(readStore());
  const myEmail = normalizeEmail(identity.email);
  const now = new Date().toISOString();
  let updated = 0;
  store.notifications.forEach((n) => {
    if (normalizeEmail(n.email) !== myEmail || n.read) return;
    if (isAdminOnlyNotificationType(n.type) && !isConfiguredAdminEmail(myEmail)) return;
    const matchesConversation = body.conversationEmail
      && normalizeEmail(n.conversationEmail) === normalizeEmail(body.conversationEmail);
    const matchesId = Array.isArray(body.notificationIds) && body.notificationIds.includes(n.id);
    const matchesAll = body.all === true;
    if (matchesConversation || matchesId || matchesAll) {
      n.read = true;
      n.readAt = now;
      updated += 1;
    }
  });
  if (updated) writeStore(store);
  jsonResponse(response, 200, { ok: true, updated });
}

async function handleMemberNotificationsList(request, response, url) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const myEmail = normalizeEmail(identity.email);
  const allowAdminTypes = isConfiguredAdminEmail(myEmail);
  const mine = store.notifications
    .filter((n) => normalizeEmail(n.email) === myEmail)
    .filter((n) => allowAdminTypes || !isAdminOnlyNotificationType(n.type))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const unreadCount = mine.filter((n) => !n.read).length;
  jsonResponse(response, 200, {
    notifications: mine.slice(0, limit).map(publicNotification),
    unreadCount,
  });
}

async function handleMemberNotificationsMarkAllRead(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const myEmail = normalizeEmail(identity.email);
  const now = new Date().toISOString();
  let updated = 0;
  store.notifications.forEach((n) => {
    if (normalizeEmail(n.email) !== myEmail || n.read) return;
    if (isAdminOnlyNotificationType(n.type) && !isConfiguredAdminEmail(myEmail)) return;
    n.read = true;
    n.readAt = now;
    updated += 1;
  });
  if (updated) writeStore(store);
  jsonResponse(response, 200, { ok: true, updated });
}

async function handleNotificationPreferencesGet(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const store = ensureMessagingStore(readStore());
  jsonResponse(response, 200, {
    preference: userNotificationPreference(store, identity.email),
    pushSupportedOnServer: Boolean(pushService && pushService.configured()),
    deviceCount: store.pushSubscriptions.filter((s) => s.email === identity.email).length,
  });
}

async function handleNotificationPreferencesSet(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const body = await readJson(request);
  const store = ensureMessagingStore(readStore());
  const now = new Date().toISOString();
  const existing = store.notificationPreferences[identity.email] || {};
  const decision = ["granted", "denied", "default"].includes(body.decision) ? body.decision : existing.decision || "default";
  const next = {
    pushEnabled: decision === "granted",
    decision,
    promptedAt: existing.promptedAt || (decision !== "default" ? now : ""),
    respondedAt: decision !== "default" ? now : existing.respondedAt || "",
    updatedAt: now,
  };
  store.notificationPreferences[identity.email] = next;
  // Turning notifications off is a soft toggle — subscriptions stay on file so
  // re-enabling does not require the browser permission dance again. Denying
  // does not delete devices either; it only stops future push sends.
  writeStore(store);
  jsonResponse(response, 200, { ok: true, preference: next });
}

function subscriptionEndpointFingerprint(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint || "")).digest("hex");
}

async function handlePushSubscribe(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const body = await readJson(request);
  const subscription = body.subscription || {};
  const endpoint = String(subscription.endpoint || "").trim();
  const p256dh = String(subscription.keys?.p256dh || "").trim();
  const auth = String(subscription.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    jsonResponse(response, 400, { error: "A valid push subscription (endpoint + keys) is required." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const fingerprint = subscriptionEndpointFingerprint(endpoint);
  const now = new Date().toISOString();
  // Duplicate-prevention: re-subscribing the same device (same endpoint)
  // updates the existing row instead of creating a second one.
  const existingIndex = store.pushSubscriptions.findIndex((s) => s.fingerprint === fingerprint);
  if (existingIndex >= 0) {
    store.pushSubscriptions[existingIndex] = {
      ...store.pushSubscriptions[existingIndex],
      email: identity.email,
      endpoint,
      keys: { p256dh, auth },
      userAgent: messagingLib.clampText(body.userAgent, 300),
      lastSeenAt: now,
      expired: false,
    };
  } else {
    const existingForUser = store.pushSubscriptions.filter((s) => s.email === identity.email);
    if (existingForUser.length >= MAX_PUSH_DEVICES_PER_USER) {
      // Evict the oldest device for this user before adding a new one.
      const oldestId = existingForUser.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? -1 : 1))[0]?.id;
      store.pushSubscriptions = store.pushSubscriptions.filter((s) => s.id !== oldestId);
    }
    store.pushSubscriptions.push({
      id: messagingRandomId("sub"),
      email: identity.email,
      endpoint,
      keys: { p256dh, auth },
      fingerprint,
      userAgent: messagingLib.clampText(body.userAgent, 300),
      deviceLabel: describeUserAgent(body.userAgent),
      createdAt: now,
      lastSeenAt: now,
      lastSuccessAt: "",
      lastFailureAt: "",
      failureCount: 0,
      expired: false,
    });
  }
  writeStore(store);
  jsonResponse(response, 200, { ok: true, deviceCount: store.pushSubscriptions.filter((s) => s.email === identity.email).length });
}

async function handlePushUnsubscribe(request, response) {
  let identity;
  try {
    identity = await resolveMemberIdentity(request);
  } catch (error) {
    jsonResponse(response, 401, { error: error.message });
    return;
  }
  const body = await readJson(request);
  const endpoint = String(body.endpoint || "").trim();
  const store = ensureMessagingStore(readStore());
  const before = store.pushSubscriptions.length;
  // Only ever remove the caller's OWN device — never another user's, even if
  // an endpoint value is guessed or replayed.
  store.pushSubscriptions = store.pushSubscriptions.filter((s) => !(s.email === identity.email && (!endpoint || s.endpoint === endpoint)));
  const removed = before - store.pushSubscriptions.length;
  writeStore(store);
  jsonResponse(response, 200, { ok: true, removed });
}

function handleVapidPublicKey(request, response) {
  jsonResponse(response, 200, {
    supported: Boolean(pushService && pushService.configured()),
    publicKey: pushService ? pushService.publicKey() : "",
  });
}

function handleAdminPushSubscriptionsList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const byUser = new Map();
  store.pushSubscriptions.forEach((sub) => {
    if (!byUser.has(sub.email)) byUser.set(sub.email, []);
    byUser.get(sub.email).push(publicPushSubscription(sub));
  });
  jsonResponse(response, 200, {
    totalDevices: store.pushSubscriptions.length,
    totalUsersWithDevices: byUser.size,
    byUser: [...byUser.entries()].map(([email, devices]) => ({ email, devices })),
    pushStatus: pushService ? pushService.statusInfo() : { configured: false },
  });
}

function handleAdminPushDeliveryLog(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 1000);
  jsonResponse(response, 200, { log: store.pushDeliveryLog.slice(0, limit) });
}

// Admin test-send: strictly limited to the admin's OWN subscribed devices.
// This intentionally cannot target any other address — test notifications
// must never reach a real member.
async function handleAdminPushTest(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (!ADMIN_EMAIL) {
    jsonResponse(response, 503, { error: "ADMIN_EMAIL is not configured on the server." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  const pref = userNotificationPreference(store, ADMIN_EMAIL);
  if (!pref.pushEnabled) {
    jsonResponse(response, 400, { error: "Enable push notifications on the admin's own account first (Settings → Notifications), then retry the test." });
    return;
  }
  const devices = store.pushSubscriptions.filter((s) => s.email === ADMIN_EMAIL);
  if (!devices.length) {
    jsonResponse(response, 400, { error: "No subscribed devices found for the admin account. Install the app and enable notifications on this device first." });
    return;
  }
  const summary = await fanOutNotificationsAndPush(store, {
    type: "message",
    recipients: [ADMIN_EMAIL],
    title: "Test notification",
    preview: "This is a test notification — only visible to the admin's own device(s).",
    senderName: ADMIN_NAME || "Leah",
  });
  jsonResponse(response, 200, { ok: true, pushSummary: summary, deviceCount: devices.length });
}

// ─── Email Engagement (onboarding + weekly What's New) ─────────────────────────

function handleAdminEmailEngagementGet(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = readStore();
  const summary = emailEngagement.getAnalyticsSummary(store);
  const digest = emailEngagement.newlyPublishedCurriculum(store, 7 * 24 * 60 * 60 * 1000);
  const oneTime = summary.oneTimeWelcomeUpdate || {};
  const audience = emailEngagement.buildAudienceReport(store);
  jsonResponse(response, 200, {
    ok: true,
    supportEmail: supportEmailConfigStatus(),
    freeReengagement: freeReengagementSafetyStatus(store),
    database: databaseConfigStatus(),
    automations: {
      enabled: emailAutomationsEnabled(),
      envVar: "EMAIL_AUTOMATIONS_ENABLED",
      note: emailAutomationsEnabled()
        ? "Automations are enabled. Scheduled/onboarding/bulk engagement mail may send."
        : "Automations are DISABLED. No scheduled, signup-welcome, weekly, or bulk engagement email will send until EMAIL_AUTOMATIONS_ENABLED=true.",
    },
    audience,
    summary,
    previewLessons: digest.lessons,
    previewDigest: digest,
    oneTimeWelcomeUpdate: {
      ...oneTime,
      recurring: false,
      sendUnlocked: Boolean(
        emailAutomationsEnabled()
        && oneTime.lastAuditPassed
        && oneTime.lastAuditToken
        && !oneTime.sentAt,
      ),
    },
    onboardingSteps: emailEngagement.ONBOARDING_STEPS.map((s) => ({
      key: s.key,
      subject: s.subject,
      delayDays: s.delayDays,
    })),
  });
}

function handleAdminEmailDiagnostics(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(adminToken)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = readStore();
  const support = supportEmailConfigStatus();
  const summary = emailEngagement.getAnalyticsSummary(store);
  const audience = emailEngagement.buildAudienceReport(store);
  jsonResponse(response, 200, {
    ok: true,
    diagnostics: {
      senderEmail: support.fromEmail,
      fromEmail: support.fromEmail,
      fromAddress: support.from,
      fromDisplayName: support.fromName,
      domain: support.fromDomain,
      expectedFrom: support.expectedFrom,
      expectedDomain: support.expectedDomain,
      supportEmailFromSetCorrectly: support.domainMatchesExpected && support.fromEmail === EXPECTED_EMAIL_FROM_ADDRESS,
      domainMatchesVerifiedTarget: support.domainMatchesExpected,
      envFromConfigured: support.envFromConfigured,
      envFromEmail: support.envFromEmail,
      envFromDomain: support.envFromDomain,
      envFromOverridden: support.envFromOverridden,
      usingResendTestSender: support.usingResendTestSender,
      provider: support.provider,
      providerReady: support.ready,
      transactionalAuthEmailReady: transactionalAuthEmailReady(),
      to: support.to,
      automationsEnabled: emailAutomationsEnabled(),
      storeOnboardingEnabled: Boolean(summary.settings?.onboardingEnabled),
      storeWeeklyEnabled: Boolean(summary.settings?.weeklyWhatsNewEnabled),
      oneTimeWelcomeSentAt: summary.oneTimeWelcomeUpdate?.sentAt || "",
      recentFailureSample: (summary.recentEvents || [])
        .filter((ev) => ev.type === "failed")
        .slice(0, 5)
        .map((ev) => ({
          at: ev.at,
          to: ev.to,
          templateKey: ev.templateKey,
          error: String(ev.error || "").slice(0, 400),
        })),
      resendTestingModeHint: !support.domainMatchesExpected || support.usingResendTestSender
        ? "Resend restricts sending to the account owner when From is not on a verified domain (or uses @resend.dev)."
        : "From uses the expected verified domain. If Resend still errors, confirm littlelearnershubbyleah.com is Verified in the Resend dashboard for this API key.",
      note: support.note,
    },
    audience,
  });
}

async function handleAdminEmailEngagementPreflightAudit(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = ensureMessagingStore(readStore());
  // Rebuild inbox totals from the same store collections the admin inbox uses.
  const inboxSummary = emailEngagement.countAdminInboxFromStore(store, ADMIN_EMAIL);
  const audit = emailEngagement.runPreflightAudit({
    store,
    adminEmail: ADMIN_EMAIL,
    inboxSummary,
    nodeEnv: process.env.NODE_ENV || "",
    allowLocalForTests: process.env.NODE_ENV === "test",
  });
  jsonResponse(response, 200, { ok: true, audit });
}

async function handleAdminEmailEngagementPrepareOneTime(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  // Dry-run only — builds subject/body/recipients and never calls sendEmail().
  const prepared = emailEngagement.prepareOneTimeWelcomeUpdate({
    adminEmail: ADMIN_EMAIL,
  });
  jsonResponse(response, 200, { ok: true, prepared, sent: false });
}

async function handleAdminEmailEngagementSendOneTime(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (!emailAutomationsEnabled()) {
    jsonResponse(response, 400, {
      error: "Bulk / one-time welcome sends are blocked while EMAIL_AUTOMATIONS_ENABLED=false. Approve content, then enable the env flag before sending.",
      result: { sent: 0, failed: 0, skipped: true, reason: "automations_disabled" },
    });
    return;
  }
  const result = await emailEngagement.sendOneTimeWelcomeUpdate({
    auditToken: body.auditToken || "",
    confirm: body.confirm === true,
    adminEmail: ADMIN_EMAIL,
    forceResend: false,
    skipAuditToken: false,
  });
  if (result.skipped && result.reason === "audit_required") {
    jsonResponse(response, 400, { error: "Run and pass the admin preflight audit before sending.", result });
    return;
  }
  if (result.skipped && result.reason === "audit_expired") {
    jsonResponse(response, 400, { error: "Audit expired. Re-run the preflight audit.", result });
    return;
  }
  if (result.skipped && result.reason === "confirmation_required") {
    jsonResponse(response, 400, { error: "Confirmation required (confirm: true).", result });
    return;
  }
  if (result.skipped && result.reason === "already_sent") {
    jsonResponse(response, 409, { error: "This one-time welcome/update email was already sent.", result });
    return;
  }
  jsonResponse(response, 200, { ok: true, result });
}

/**
 * Founding Members thank-you — dry-run only. Never sends.
 * Keep EMAIL_AUTOMATIONS_ENABLED=false; this path does not enable drip/weekly/bulk.
 */
async function handleAdminFoundingMemberEmailDryRun(request, response, url) {
  let includeAdmin = false;
  let token = "";
  if (request.method === "GET") {
    token = url.searchParams.get("adminToken") || "";
    includeAdmin = url.searchParams.get("includeAdmin") === "true";
  } else {
    const body = await readJson(request);
    token = body.adminToken || "";
    includeAdmin = body.includeAdmin === true;
  }
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const preview = foundingMemberEmail.dryRun({
    adminEmail: ADMIN_EMAIL,
    includeAdmin,
    persist: true,
  });
  jsonResponse(response, 200, {
    ok: true,
    sent: false,
    willSend: false,
    preview,
    automationsEnabled: emailAutomationsEnabled(),
    note: "Dry-run only. Nothing was sent. Approve the recipient list, then send with confirmPhrase SEND_FOUNDING_MEMBER_EMAIL.",
  });
}

/**
 * Founding Members thank-you — gated one-time send.
 * Requires prior dry-run token + confirmPhrase SEND_FOUNDING_MEMBER_EMAIL + confirm:true.
 * Does not enable EMAIL_AUTOMATIONS_ENABLED and does not modify membership records.
 */
async function handleAdminFoundingMemberEmailSend(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const result = await foundingMemberEmail.send({
    adminEmail: ADMIN_EMAIL,
    includeAdmin: body.includeAdmin === true,
    confirm: body.confirm === true,
    confirmPhrase: body.confirmPhrase || "",
    dryRunToken: body.dryRunToken || "",
    confirmationToken: body.confirmationToken || "",
    forceResend: false,
  });
  if (result.skipped && result.reason === "confirmation_required") {
    jsonResponse(response, 400, {
      error: "Confirmation required. Pass confirm:true and confirmPhrase SEND_FOUNDING_MEMBER_EMAIL after reviewing the Final Confirmation Screen.",
      result,
    });
    return;
  }
  if (result.skipped && (
    result.reason === "dry_run_required"
    || result.reason === "dry_run_expired"
    || result.reason === "recipient_drift"
    || result.reason === "confirmation_screen_required"
  )) {
    jsonResponse(response, 400, {
      error: result.detail || "Re-run dry-run and approve the Final Confirmation Screen before sending.",
      result,
    });
    return;
  }
  if (result.skipped && result.reason === "already_sent") {
    jsonResponse(response, 409, {
      error: "This one-time Founding Member thank-you was already sent.",
      result,
    });
    return;
  }
  if (result.skipped && result.reason === "no_recipients") {
    jsonResponse(response, 400, {
      error: "No verified active Founding Members qualify for this send.",
      result,
    });
    return;
  }
  jsonResponse(response, 200, {
    ok: true,
    result,
    report: result.report || null,
    confirmationScreen: result.confirmationScreen || null,
    membershipRecordsModified: false,
    billingRecordsModified: false,
    foundingMemberStatusModified: false,
    automationsEnabled: emailAutomationsEnabled(),
  });
}

async function handleAdminFoundingMemberEmailReport(request, response, url) {
  const token = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
  if (refresh) {
    const refreshed = await foundingMemberEmail.refreshDeliveryStatuses();
    jsonResponse(response, 200, { ok: true, refreshed: true, ...refreshed });
    return;
  }
  jsonResponse(response, 200, foundingMemberEmail.getReport());
}

async function handleResendEmailWebhook(request, response) {
  const rawBody = await readBody(request);
  const secret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (secret) {
    const verified = foundingMemberEmail.verifyResendWebhookSignature(
      rawBody,
      request.headers || {},
      secret,
    );
    if (!verified.ok) {
      jsonResponse(response, 401, { error: "Invalid Resend webhook signature.", reason: verified.reason });
      return;
    }
  }
  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || ""));
  } catch {
    jsonResponse(response, 400, { error: "Invalid webhook JSON." });
    return;
  }
  const foundingResult = foundingMemberEmail.handleResendWebhook(event, { persistAlways: false });
  const freeResult = freeUserWelcomeEmail.handleResendWebhook(event, { persistAlways: false });
  if (foundingResult.updated || freeResult.updated) {
    // Persist whichever campaign matched (handlers write when updated).
  } else {
    // Still persist webhook audit on founding campaign store path when neither matches.
    foundingMemberEmail.handleResendWebhook(event, { persistAlways: true });
  }
  jsonResponse(response, 200, {
    received: true,
    founding: foundingResult,
    freeUserWelcome: freeResult,
  });
}

/**
 * Free Users welcome/upgrade — dry-run only. Never sends.
 * Keep EMAIL_AUTOMATIONS_ENABLED=false; this path does not enable drip/weekly/bulk.
 */
async function handleAdminFreeUserWelcomeEmailDryRun(request, response, url) {
  let token = "";
  if (request.method === "GET") {
    token = url.searchParams.get("adminToken") || "";
  } else {
    const body = await readJson(request);
    token = body.adminToken || "";
  }
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const preview = freeUserWelcomeEmail.dryRun({
    adminEmail: ADMIN_EMAIL,
    persist: true,
  });
  jsonResponse(response, 200, {
    ok: true,
    sent: false,
    willSend: false,
    preview,
    automationsEnabled: emailAutomationsEnabled(),
    note: "Dry-run only. Nothing was sent. Approve the recipient list, then send with confirmPhrase SEND_FREE_USER_WELCOME_EMAIL.",
  });
}

async function handleAdminFreeUserWelcomeEmailSend(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const result = await freeUserWelcomeEmail.send({
    adminEmail: ADMIN_EMAIL,
    confirm: body.confirm === true,
    confirmPhrase: body.confirmPhrase || "",
    dryRunToken: body.dryRunToken || "",
    confirmationToken: body.confirmationToken || "",
    forceResend: false,
  });
  if (result.skipped && result.reason === "confirmation_required") {
    jsonResponse(response, 400, {
      error: "Confirmation required. Pass confirm:true and confirmPhrase SEND_FREE_USER_WELCOME_EMAIL after reviewing the Final Confirmation Screen.",
      result,
    });
    return;
  }
  if (result.skipped && (
    result.reason === "dry_run_required"
    || result.reason === "dry_run_expired"
    || result.reason === "recipient_drift"
    || result.reason === "confirmation_screen_required"
  )) {
    jsonResponse(response, 400, {
      error: result.detail || "Re-run dry-run and approve the Final Confirmation Screen before sending.",
      result,
    });
    return;
  }
  if (result.skipped && result.reason === "already_sent") {
    jsonResponse(response, 409, {
      error: "This one-time Free User welcome email was already sent.",
      result,
    });
    return;
  }
  if (result.skipped && result.reason === "no_recipients") {
    jsonResponse(response, 400, {
      error: "No Free users qualify for this send.",
      result,
    });
    return;
  }
  jsonResponse(response, 200, {
    ok: true,
    result,
    report: result.report || null,
    confirmationScreen: result.confirmationScreen || null,
    membershipRecordsModified: false,
    billingRecordsModified: false,
    accountAccessModified: false,
    automationsEnabled: emailAutomationsEnabled(),
  });
}

async function handleAdminFreeUserWelcomeEmailReport(request, response, url) {
  const token = url.searchParams.get("adminToken") || "";
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
  if (refresh) {
    const refreshed = await freeUserWelcomeEmail.refreshDeliveryStatuses();
    jsonResponse(response, 200, { ok: true, refreshed: true, ...refreshed });
    return;
  }
  jsonResponse(response, 200, freeUserWelcomeEmail.getReport());
}

async function handleAdminEmailEngagementSettings(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const wantsOn = body.onboardingEnabled === true || body.weeklyWhatsNewEnabled === true;
  if (wantsOn && !emailAutomationsEnabled()) {
    jsonResponse(response, 400, {
      error: "EMAIL_AUTOMATIONS_ENABLED is false. Scheduled/marketing email stays off until that env flag is enabled after content approval.",
      automationsEnabled: false,
    });
    return;
  }
  const settings = await emailEngagement.updateSettings({
    onboardingEnabled: body.onboardingEnabled,
    weeklyWhatsNewEnabled: body.weeklyWhatsNewEnabled,
  });
  jsonResponse(response, 200, {
    ok: true,
    settings,
    automationsEnabled: emailAutomationsEnabled(),
  });
}

async function handleAdminEmailEngagementRunOnboarding(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (!emailAutomationsEnabled()) {
    jsonResponse(response, 400, {
      error: "Onboarding sweeps are blocked while EMAIL_AUTOMATIONS_ENABLED=false.",
      result: { processed: 0, sent: 0, skipped: 0, reason: "automations_disabled" },
    });
    return;
  }
  const result = await emailEngagement.processOnboardingDrip({ force: Boolean(body.force) });
  jsonResponse(response, 200, { ok: true, result });
}

async function handleAdminEmailEngagementRunWeekly(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  if (!emailAutomationsEnabled()) {
    jsonResponse(response, 400, {
      error: "Weekly digests are blocked while EMAIL_AUTOMATIONS_ENABLED=false.",
      result: { sent: 0, skipped: true, reason: "automations_disabled" },
    });
    return;
  }
  const result = await emailEngagement.runWeeklyWhatsNew({ force: Boolean(body.force) });
  jsonResponse(response, 200, { ok: true, result });
}

async function handleAdminEmailEngagementSendStep(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const email = normalizeEmail(body.email);
  const step = String(body.step || "welcome");
  if (!email) {
    jsonResponse(response, 400, { error: "Email is required." });
    return;
  }
  // Single-user admin test sends are allowed even when automations are paused,
  // so delivery can be verified with test accounts before re-enabling campaigns.
  const result = await emailEngagement.sendOnboardingStep(email, step, {
    force: true,
    adminTest: true,
    forceStampOnSoftFail: true,
  });
  jsonResponse(response, 200, {
    ok: true,
    result,
    automationsEnabled: emailAutomationsEnabled(),
    note: "Admin single-user test send (force). Not a bulk campaign.",
  });
}


function freeReengagementSafetyStatus(store = readStore()) {
  const audience = emailEngagement.freeReengagementAudience(store);
  const emailService = supportEmailConfigStatus();
  const unsubscribeHttpsReady = unsubscribeUrlForEmail(ADMIN_EMAIL).startsWith("https://");
  const postalAddressConfigured = isConfiguredValue(SUPPORT_POSTAL_ADDRESS);
  const atomicDeliveryReady = usePostgresStore() && databaseReady;
  const idempotentProviderReady = emailService.provider === "resend";
  return {
    ready: emailService.ready
      && isConfiguredValue(EMAIL_UNSUBSCRIBE_SECRET)
      && unsubscribeHttpsReady
      && postalAddressConfigured
      && atomicDeliveryReady
      && idempotentProviderReady,
    emailService,
    unsubscribeConfigured: isConfiguredValue(EMAIL_UNSUBSCRIBE_SECRET),
    unsubscribeHttpsReady,
    postalAddressConfigured,
    atomicDeliveryReady,
    idempotentProviderReady,
    campaignId: audience.campaignId,
    subject: audience.subject,
    eligibleCount: audience.eligibleCount,
    eligibleEmails: audience.eligible.map((entry) => entry.email),
    invalidEmails: audience.invalid,
    excluded: audience.excluded,
    campaignState: store.emailEngagement?.campaigns?.[audience.campaignId] || {},
  };
}

async function handleAdminFreeReengagementPreview(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  jsonResponse(response, 200, { ok: true, safety: freeReengagementSafetyStatus() });
}

async function handleAdminFreeReengagementTest(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const safety = freeReengagementSafetyStatus();
  if (!safety.ready) {
    jsonResponse(response, 503, { error: "Email provider or unsubscribe compliance is not configured.", safety });
    return;
  }
  const result = await emailEngagement.sendFreeReengagementTest();
  jsonResponse(response, result.sent ? 200 : 502, { ok: result.sent, result, safety: freeReengagementSafetyStatus() });
}

async function handleAdminFreeReengagementSend(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const safety = freeReengagementSafetyStatus();
  if (!safety.ready) {
    jsonResponse(response, 503, { error: "Email provider or unsubscribe compliance is not configured.", safety });
    return;
  }
  const result = await emailEngagement.runFreeReengagementCampaign({
    confirmCampaignId: String(body.confirmCampaignId || ""),
    reviewApproved: body.reviewApproved === true,
  });
  if (result.reason) {
    jsonResponse(response, 409, { error: result.reason, result, safety: freeReengagementSafetyStatus() });
    return;
  }
  jsonResponse(response, 200, { ok: result.failedSends === 0, result, safety: freeReengagementSafetyStatus() });
}

function handleFreeReengagementPublicStatus(response) {
  const state = readStore().emailEngagement?.campaigns?.["free-reengagement-2026-07"] || {};
  const status = state.sendCompletedAt
    ? "completed"
    : state.sendStartedAt
      ? "sending"
      : state.testSentAt
        ? "test_sent"
        : state.testError
          ? "test_failed"
          : state.queuedAt
            ? "queued"
            : "not_queued";
  jsonResponse(response, 200, {
    campaignId: "free-reengagement-2026-07",
    status,
    testCopyAccepted: Boolean(state.testSentAt),
    testSentAt: state.testSentAt || "",
    targetCount: Number(state.targetCount || 0),
    successfulSends: Number(state.successfulSends || 0),
    failedSends: Number(state.failedSends || 0),
    invalidEmailCount: Array.isArray(state.invalidEmails) ? state.invalidEmails.length : 0,
    bouncedEmailCount: Array.isArray(state.bouncedEmails) ? state.bouncedEmails.length : 0,
    bounceTrackingAvailable: Boolean(state.bounceTrackingAvailable),
    sendCompletedAt: state.sendCompletedAt || "",
  });
}

function handleEmailUnsubscribePage(response, url) {
  const email = normalizeEmail(url.searchParams.get("email") || "");
  const token = url.searchParams.get("token") || "";
  if (!email || !validEmailUnsubscribeToken(email, token)) {
    textResponse(response, 400, "<h1>Invalid unsubscribe link</h1><p>Please contact support for help.</p>", "text/html; charset=utf-8");
    return;
  }
  const action = `/api/email/unsubscribe-one-click?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  textResponse(response, 200, `
    <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>Email preferences · Little Learner Hub</title></head>
    <body style="font-family:Arial,sans-serif;max-width:560px;margin:60px auto;padding:20px;color:#2c2416">
      <h1>Unsubscribe from marketing emails?</h1>
      <p>This will stop onboarding, weekly update, and re-engagement emails for <strong>${htmlEscape(email)}</strong>.</p>
      <form method="post" action="${htmlEscape(action)}">
        <button type="submit" style="padding:12px 18px">Unsubscribe</button>
      </form>
    </body></html>
  `, "text/html; charset=utf-8");
}

async function handleEmailUnsubscribeOneClick(response, url) {
  const email = normalizeEmail(url.searchParams.get("email") || "");
  const token = url.searchParams.get("token") || "";
  if (!email || !validEmailUnsubscribeToken(email, token)) {
    textResponse(response, 400, "<h1>Invalid unsubscribe request</h1>", "text/html; charset=utf-8");
    return;
  }
  const result = await emailEngagement.unsubscribeUser(email);
  if (!result.ok) {
    textResponse(response, 404, "<h1>Account not found</h1>", "text/html; charset=utf-8");
    return;
  }
  textResponse(response, 200, "<h1>You’re unsubscribed.</h1><p>You will no longer receive marketing emails from Little Learner Hub.</p>", "text/html; charset=utf-8");
}

async function handleEmailUnsubscribe(request, response) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    jsonResponse(response, 400, { error: "Email is required." });
    return;
  }
  // Soft public unsubscribe: requires matching account email. Prefer authenticated users in future.
  const result = await emailEngagement.unsubscribeUser(email);
  if (!result.ok) {
    jsonResponse(response, 404, { error: "Account not found." });
    return;
  }
  jsonResponse(response, 200, { ok: true });
}

// ─── Release Notes handlers ───────────────────────────────────────────────────

const RELEASE_NOTE_STATUSES = new Set(["draft", "published"]);

async function handleReleaseNoteCreate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to create release notes." });
    return;
  }
  const version = String(body.version || "").trim().slice(0, 80);
  const releaseDate = String(body.releaseDate || "").trim().slice(0, 30);
  if (!version) {
    jsonResponse(response, 400, { error: "Version is required." });
    return;
  }
  const toArray = (val) => (Array.isArray(val) ? val.map((v) => String(v).slice(0, 500)) : []).slice(0, 100);
  const rawStatus = String(body.status || "draft").toLowerCase();
  const store = readStore();
  store.releaseNotes = store.releaseNotes || [];
  const item = {
    id: `release-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    version,
    releaseDate,
    featuresAdded: toArray(body.featuresAdded),
    bugsFixed: toArray(body.bugsFixed),
    improvements: toArray(body.improvements),
    lessonPlanAdditions: toArray(body.lessonPlanAdditions),
    activityAdditions: toArray(body.activityAdditions),
    status: RELEASE_NOTE_STATUSES.has(rawStatus) ? rawStatus : "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.releaseNotes.unshift(item);
  store.releaseNotes = store.releaseNotes.slice(0, 200);
  writeStore(store);
  jsonResponse(response, 200, { releaseNote: publicReleaseNote(item) });
}

async function handleReleaseNoteUpdate(request, response) {
  const body = await readJson(request);
  if (!validAdminToken(body.adminToken || "")) {
    jsonResponse(response, 401, { error: "Admin access is required to update release notes." });
    return;
  }
  const id = String(body.id || "");
  const store = readStore();
  const items = store.releaseNotes || [];
  const index = items.findIndex((r) => r.id === id);
  if (index < 0) {
    jsonResponse(response, 404, { error: "Release note was not found." });
    return;
  }
  const toArray = (val) => (Array.isArray(val) ? val.map((v) => String(v).slice(0, 500)) : null);
  const rawStatus = body.status ? String(body.status).toLowerCase() : "";
  items[index] = {
    ...items[index],
    version: body.version ? String(body.version).slice(0, 80) : items[index].version,
    releaseDate: body.releaseDate ? String(body.releaseDate).slice(0, 30) : items[index].releaseDate,
    featuresAdded: toArray(body.featuresAdded) ?? items[index].featuresAdded,
    bugsFixed: toArray(body.bugsFixed) ?? items[index].bugsFixed,
    improvements: toArray(body.improvements) ?? items[index].improvements,
    lessonPlanAdditions: toArray(body.lessonPlanAdditions) ?? items[index].lessonPlanAdditions,
    activityAdditions: toArray(body.activityAdditions) ?? items[index].activityAdditions,
    status: rawStatus && RELEASE_NOTE_STATUSES.has(rawStatus) ? rawStatus : items[index].status,
    updatedAt: new Date().toISOString(),
  };
  store.releaseNotes = items;
  writeStore(store);
  jsonResponse(response, 200, { releaseNote: publicReleaseNote(items[index]) });
}

function handleReleaseNotesList(request, response, url) {
  const adminToken = url.searchParams.get("adminToken") || "";
  const store = readStore();
  const all = store.releaseNotes || [];
  if (validAdminToken(adminToken)) {
    jsonResponse(response, 200, { releaseNotes: all.slice(0, 200).map(publicReleaseNote) });
    return;
  }
  // Public: only published notes
  const published = all.filter((n) => n.status === "published");
  jsonResponse(response, 200, { releaseNotes: published.slice(0, 50).map(publicReleaseNote) });
}

// ─── Phase 1/2 Director / Family / Forms foundation (hidden; admin preview only) ───

function handleFoundationFeatureFlags(request, response, url) {
  const store = peekStore();
  const flags = expansionFlagsFromStore(store);
  const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
  const env = expansionEnvironment();
  const effective = expansionFeatureFlags.resolveEffectiveExpansionFlags(flags, env);
  let canAccessFamilyHub = false;
  if (effective.familyHub === true) {
    try {
      const familyHubModel = require("../scripts/family-hub-data-model.js");
      familyHubModel.ensureFamilyHubStore(store);
      const authHeader = String(request?.headers?.authorization || "");
      const memberSession = tempPasswordAuth.resolveMemberSession(store, authHeader);
      let email = memberSession?.email || "";
      if (!email && process.env.NODE_ENV === "test" && authHeader.startsWith("Bearer test:")) {
        email = normalizeEmail(authHeader.slice("Bearer test:".length));
      }
      if (email && familyHubModel.findContactByEmailAnyOrg(store, email)) {
        canAccessFamilyHub = true;
      } else if (email) {
        // Phase 23 fix: alias guardian fake accounts (financial_guardian,
        // non_financial_guardian, emergency_only) intentionally share an existing
        // contact record — e.g. Priya's — under a different login email, so an
        // email-only contact lookup never matches. Fall back to the fake account's
        // own contactId, which family-foundation-fixtures.js always sets for these.
        const familyFoundationModel = require("../scripts/family-foundation-data-model.js");
        familyFoundationModel.ensureFamilyFoundationStore(store);
        const fakeAccountByEmail = Object.values(store.familyFoundation.fakeAccounts || {})
          .find((row) => String(row?.email || "").toLowerCase() === email);
        const linkedContact = fakeAccountByEmail?.contactId
          ? store.familyFoundation.contacts?.[fakeAccountByEmail.contactId]
          : null;
        if (linkedContact && linkedContact.status === "active") {
          canAccessFamilyHub = true;
        }
      }
    } catch {
      canAccessFamilyHub = false;
    }
  }
  jsonResponse(response, 200, expansionFeatureFlags.publicExpansionFeatureFlagsPayload(flags, {
    environment: env,
    isVerifiedAdmin: Boolean(admin),
    canAccessFamilyHub,
    siteUrl: SITE_URL,
  }));
}

function requireFoundationAdmin(request, response, url) {
  const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
  if (admin) return admin;
  jsonResponse(response, 403, {
    error: "Verified approved admin access is required.",
    code: "admin_required",
  });
  return null;
}

function handleFoundationStatus(request, response, url) {
  const admin = requireFoundationAdmin(request, response, url);
  if (!admin) return;
  const store = readStore();
  ensureFoundationCollections(store);
  const flags = expansionFlagsFromStore(store);
  jsonResponse(response, 200, {
    phase: 2,
    liveExposure: false,
    featureFlags: expansionFeatureFlags.publicExpansionFeatureFlagsPayload(flags, {
      environment: expansionEnvironment(),
      isVerifiedAdmin: true,
      siteUrl: SITE_URL,
    }),
    foundation: foundationDataModel.foundationStatusSummary(store),
    permissions: {
      roles: orgPermissions.ORG_ROLES,
      actions: Object.keys(orgPermissions.ACTIONS),
    },
    entitlements: {
      live: false,
      plannedPlans: Object.keys(entitlementModel.PLANNED_PLAN_CATALOG),
      classroomAddOn: {
        monthlyPriceCents: entitlementModel.CLASSROOM_ADD_ON.monthlyPriceCents,
        annualPriceCents: entitlementModel.CLASSROOM_ADD_ON.annualPriceCents,
      },
      currentLiveBilling: entitlementModel.describeCurrentLiveBillingModel().livePlans,
    },
    migration: {
      executed: store.foundationMeta?.migratedExistingUsers === true,
      dryRunOnlyInPhase1: true,
    },
  });
}

function handleFoundationMigrationPlan(request, response, url) {
  const admin = requireFoundationAdmin(request, response, url);
  if (!admin) return;
  const store = readStore();
  ensureFoundationCollections(store);
  jsonResponse(response, 200, {
    phase: 1,
    executed: false,
    plan: foundationDataModel.buildExistingUserMigrationPlan(store),
    note: "Dry-run only. Phase 1 does not apply this migration to production users.",
  });
}

function handleFoundationPermissionCatalog(request, response, url) {
  const admin = requireFoundationAdmin(request, response, url);
  if (!admin) return;
  jsonResponse(response, 200, {
    phase: 1,
    catalog: orgPermissions.permissionCatalog(),
  });
}

function handleFoundationEntitlementCatalog(request, response, url) {
  const admin = requireFoundationAdmin(request, response, url);
  if (!admin) return;
  jsonResponse(response, 200, {
    phase: 1,
    live: false,
    catalog: entitlementModel.PLANNED_PLAN_CATALOG,
    classroomAddOn: entitlementModel.CLASSROOM_ADD_ON,
    currentLiveBilling: entitlementModel.describeCurrentLiveBillingModel(),
    downgradeSafety: entitlementModel.downgradeSafetyRules(),
    failedPayment: entitlementModel.failedPaymentRules(),
    annualMessage: "Choose annual billing and get approximately two months free.",
  });
}

/**
 * Reject unfinished expansion APIs unless private-preview + verified admin.
 * Query-string admin tokens are rejected for Director Center.
 */
function rejectDisabledExpansionRoute(request, response, url) {
  const flagKey = expansionFeatureFlags.expansionFlagForRoute(url.pathname);
  if (!flagKey) return false;
  if (url.searchParams?.get("adminToken")) {
    jsonResponse(response, 403, {
      error: "Query-string admin tokens are not accepted for expansion APIs.",
      code: "query_admin_token_rejected",
      feature: flagKey,
    });
    return true;
  }
  const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
  const decision = expansionFeatureFlags.evaluateExpansionAccess({
    flagKey,
    storedFlags: expansionFlagsFromStore(peekStore()),
    environment: expansionEnvironment(),
    isVerifiedAdmin: Boolean(admin),
  });
  if (decision.allowed) return false;
  jsonResponse(response, decision.status || 403, decision.payload || expansionFeatureFlags.unavailableExpansionPayload(flagKey));
  return true;
}

function handleExpansionUnavailableStub(request, response, flagKey) {
  jsonResponse(response, 403, expansionFeatureFlags.unavailableExpansionPayload(flagKey));
}

let _directorCenterApi;
function getDirectorCenterApi() {
  if (!_directorCenterApi) {
    _directorCenterApi = createDirectorCenterApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
    });
  }
  return _directorCenterApi;
}

let _phase3TeacherApi;
function getPhase3TeacherApi() {
  if (!_phase3TeacherApi) {
    _phase3TeacherApi = createPhase3TeacherApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _phase3TeacherApi;
}

let _formsCenterApi;
function getFormsCenterApi() {
  if (!_formsCenterApi) {
    _formsCenterApi = createFormsCenterApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _formsCenterApi;
}

let _builtInFormLibraryApi;
function getBuiltInFormLibraryApi() {
  if (!_builtInFormLibraryApi) {
    _builtInFormLibraryApi = createBuiltInFormLibraryApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _builtInFormLibraryApi;
}

let _formResponsesApi;
function getFormResponsesApi() {
  if (!_formResponsesApi) {
    _formResponsesApi = createFormResponsesApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _formResponsesApi;
}

let _formRecipientApi;
function getFormRecipientApi() {
  if (!_formRecipientApi) {
    _formRecipientApi = createFormRecipientApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      expansionEnvironment,
    });
  }
  return _formRecipientApi;
}

let _aiFormBuilderApi;
function getAiFormBuilderApi() {
  if (!_aiFormBuilderApi) {
    _aiFormBuilderApi = createAiFormBuilderApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _aiFormBuilderApi;
}

let _familyFoundationApi;
function getFamilyFoundationApi() {
  if (!_familyFoundationApi) {
    _familyFoundationApi = createFamilyFoundationApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _familyFoundationApi;
}

let _familyHubApi;
function getFamilyHubApi() {
  if (!_familyHubApi) {
    _familyHubApi = createFamilyHubApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _familyHubApi;
}

let _familyUpdatesApi;
function getFamilyUpdatesApi() {
  if (!_familyUpdatesApi) {
    _familyUpdatesApi = createFamilyUpdatesApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _familyUpdatesApi;
}

let _familyMessagingApi;
function getFamilyMessagingApi() {
  if (!_familyMessagingApi) {
    _familyMessagingApi = createFamilyMessagingApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _familyMessagingApi;
}

let _enrollmentApi;
function getEnrollmentApi() {
  if (!_enrollmentApi) {
    _enrollmentApi = createEnrollmentApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _enrollmentApi;
}

let _recordsCenterApi;
function getRecordsCenterApi() {
  if (!_recordsCenterApi) {
    _recordsCenterApi = createRecordsCenterApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _recordsCenterApi;
}

let _licensingCenterApi;
function getLicensingCenterApi() {
  if (!_licensingCenterApi) {
    _licensingCenterApi = createLicensingCenterApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _licensingCenterApi;
}

let _todayHubApi;
function getTodayHubApi() {
  if (!_todayHubApi) {
    _todayHubApi = createTodayHubApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _todayHubApi;
}

let _providerProductivityApi;
function getProviderProductivityApi() {
  if (!_providerProductivityApi) {
    _providerProductivityApi = createProviderProductivityApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _providerProductivityApi;
}

let _classroomAssistantApi;
function getClassroomAssistantApi() {
  if (!_classroomAssistantApi) {
    _classroomAssistantApi = createClassroomAssistantApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _classroomAssistantApi;
}

let _staffExperienceApi;
function getStaffExperienceApi() {
  if (!_staffExperienceApi) {
    _staffExperienceApi = createStaffExperienceApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _staffExperienceApi;
}

let _billingSimulatorApi;
function getBillingSimulatorApi() {
  if (!_billingSimulatorApi) {
    _billingSimulatorApi = createBillingSimulatorApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
    });
  }
  return _billingSimulatorApi;
}

let _testingLabApi;
function getTestingLabApi() {
  if (!_testingLabApi) {
    _testingLabApi = createTestingLabApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      expansionEnvironment,
      getLaunchReadiness: launchReadinessStatus,
      getGitSha: () => deployedGitSha(),
      getBranchName: () => String(process.env.LLH_GIT_BRANCH || "cursor/director-family-foundation-bc66"),
      getStripeConfigStatus: () => stripeConfigStatus(),
      getAiConfigStatus: () => aiConfigStatus(),
      getSupportEmailConfigStatus: () => supportEmailConfigStatus(),
    });
  }
  return _testingLabApi;
}

let _aiTestingApi;
function getAiTestingApi() {
  if (!_aiTestingApi) {
    _aiTestingApi = createAiTestingApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      rawEnv: () => process.env,
    });
  }
  return _aiTestingApi;
}

let _testingFeedbackApi;
function getTestingFeedbackApi() {
  if (!_testingFeedbackApi) {
    _testingFeedbackApi = createTestingFeedbackApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      getGitSha: () => deployedGitSha(),
    });
  }
  return _testingFeedbackApi;
}

let _externalTesterSandboxApi;
function getExternalTesterSandboxApi() {
  if (!_externalTesterSandboxApi) {
    _externalTesterSandboxApi = createExternalTesterSandboxApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      expansionEnvironment,
    });
  }
  return _externalTesterSandboxApi;
}

let _homeDaycarePilotApi;
function getHomeDaycarePilotApi() {
  if (!_homeDaycarePilotApi) {
    _homeDaycarePilotApi = createHomeDaycarePilotApi({
      readStore,
      writeStore,
      jsonResponse,
      readJson,
      expansionEnvironment,
    });
  }
  return _homeDaycarePilotApi;
}


// ─── Communication ecosystem API (drafts, message center, tags, health, …) ───
let _commsApi;
function getCommsApi() {
  if (!_commsApi) {
    _commsApi = createCommsApi({
      readStore,
      writeStore,
      ensureMessagingStore,
      jsonResponse,
      readJson,
      normalizeEmail,
      validAdminToken,
      resolveMemberIdentity,
      fanOutNotificationsAndPush,
      notifyAdmin,
      messagingCenter,
      messagingLib,
      membershipAccess,
      accountAccess,
      ADMIN_EMAIL,
      ADMIN_EMAILS,
      ADMIN_NAME,
      sendEmail,
      SUPPORT_EMAIL_TO,
      publicMessage,
      publicNotification,
    });
  }
  return _commsApi;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, SITE_URL);
  const comms = getCommsApi();
  try {
    // Phase 1: unfinished expansion APIs stay unavailable while flags are OFF.
    if (rejectDisabledExpansionRoute(request, response, url)) return;

    if (request.method === "POST" && url.pathname === "/api/admin/login") return await handleAdminLogin(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/logout") return await handleAdminLogout(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/session") return handleAdminSession(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/site-content") return await handlePublicSiteContent(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/foundation/feature-flags") return handleFoundationFeatureFlags(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/foundation/status") return handleFoundationStatus(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/foundation/migration-plan") return handleFoundationMigrationPlan(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/foundation/permissions") return handleFoundationPermissionCatalog(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/foundation/entitlements") return handleFoundationEntitlementCatalog(request, response, url);
    // Director Center Phase 2 — only reached after rejectDisabledExpansionRoute allows verified admin preview.
    if (url.pathname === "/api/director-center" || url.pathname.startsWith("/api/director-center/")) {
      const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
      const handler = getTodayHubApi().matchRoute(request.method, url.pathname, url)
        || getStaffExperienceApi().matchRoute(request.method, url.pathname, url)
        || getBillingSimulatorApi().matchRoute(request.method, url.pathname, url)
        || getLicensingCenterApi().matchRoute(request.method, url.pathname, url)
        || getRecordsCenterApi().matchRoute(request.method, url.pathname, url)
        || getEnrollmentApi().matchRoute(request.method, url.pathname, url)
        || getFamilyMessagingApi().matchRoute(request.method, url.pathname, url)
        || getFamilyUpdatesApi().matchRoute(request.method, url.pathname, url)
        || getFamilyFoundationApi().matchDirectorRoute(request.method, url.pathname, url)
        || getPhase3TeacherApi().matchRoute(request.method, url.pathname, url)
        || getProviderProductivityApi().matchRoute(request.method, url.pathname, url)
        || getClassroomAssistantApi().matchRoute(request.method, url.pathname, url)
        || getDirectorCenterApi().matchRoute(request.method, url.pathname, url);
      if (handler && admin) return handler(request, response, { adminEmail: admin.email, adminToken: admin.token });
      return handleExpansionUnavailableStub(request, response, expansionFeatureFlags.EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER);
    }
    // Phase 8 family foundation public/guardian routes (NOT Family Hub product).
    if (url.pathname === "/api/family-foundation" || url.pathname.startsWith("/api/family-foundation/")) {
      const handler = getFamilyFoundationApi().matchPublicRoute(request.method, url.pathname);
      if (handler) return handler(request, response);
      jsonResponse(response, 404, { error: "Not found.", code: "not_found", familyHub: false });
      return;
    }
    if (url.pathname === "/api/forms-center" || url.pathname.startsWith("/api/forms-center/")) {
      const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
      const handler = getBuiltInFormLibraryApi().matchRoute(request.method, url.pathname, url)
        || getFormResponsesApi().matchRoute(request.method, url.pathname, url)
        || getAiFormBuilderApi().matchRoute(request.method, url.pathname, url)
        || getFormsCenterApi().matchRoute(request.method, url.pathname, url);
      if (handler && admin) return handler(request, response, { adminEmail: admin.email, adminToken: admin.token });
      return handleExpansionUnavailableStub(request, response, expansionFeatureFlags.EXPANSION_FEATURE_KEYS.FORMS_CENTER);
    }
    // Phase 6 recipient routes: public, token-authenticated, never behind the
    // admin expansion-flag gate above (recipients are not verified admins).
    // The handler itself rejects live production hosts and invalid tokens.
    if (url.pathname === "/api/form-recipient" || url.pathname.startsWith("/api/form-recipient/")) {
      const handler = getFormRecipientApi().matchRoute(request.method, url.pathname);
      if (handler) return handler(request, response);
      jsonResponse(response, 404, { error: "Not found.", code: "not_found" });
      return;
    }
    if (url.pathname === "/api/family-hub" || url.pathname.startsWith("/api/family-hub/")) {
      // Testing-preview only. rejectDisabledExpansionRoute already enforced
      // non-production + ALLOW_FAMILY_HUB_TESTING_PREVIEW + stored flag.
      // Handlers require authenticated guardian + child-specific access.
      // Query-string tokens are rejected by rejectDisabledExpansionRoute.
      const handler = getFamilyHubApi().matchRoute(request.method, url.pathname, url);
      if (handler) return handler(request, response);
      return handleExpansionUnavailableStub(request, response, expansionFeatureFlags.EXPANSION_FEATURE_KEYS.FAMILY_HUB);
    }
    if (url.pathname === "/api/testing-lab" || url.pathname.startsWith("/api/testing-lab/")) {
      const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
      const handler = getTestingLabApi().matchRoute(request.method, url.pathname, url);
      if (handler && admin) return handler(request, response, { adminEmail: admin.email, adminToken: admin.token });
      return handleExpansionUnavailableStub(request, response, expansionFeatureFlags.EXPANSION_FEATURE_KEYS.TESTING_LAB);
    }
    if (url.pathname === "/api/ai-testing" || url.pathname.startsWith("/api/ai-testing/")) {
      // Admin-only AI Evaluation Lab routes AND the fake-account-usable AI
      // review-screen routes both live under this same prefix — every real
      // safety decision (production lock, ALLOW_OPENAI_TESTING, stored flag,
      // key presence, rate limit) happens inside ai-testing-safety.js, not
      // here. This mount only resolves WHO is asking.
      const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
      let fakeAccountEmail = "";
      if (!admin) {
        const authHeader = String(request.headers.authorization || "");
        const memberSession = tempPasswordAuth.resolveMemberSession(peekStore(), authHeader);
        if (memberSession?.email && memberSession.email.endsWith("@example.invalid")) {
          fakeAccountEmail = memberSession.email;
        }
      }
      const handler = getAiTestingApi().matchRoute(request.method, url.pathname, url);
      if (handler && (admin || fakeAccountEmail)) {
        return handler(request, response, { adminEmail: admin?.email || "", adminToken: admin?.token || "", fakeAccountEmail });
      }
      return handleExpansionUnavailableStub(request, response, expansionFeatureFlags.EXPANSION_FEATURE_KEYS.AI_TESTING);
    }
    if (url.pathname === "/api/testing-feedback" || url.pathname.startsWith("/api/testing-feedback/")) {
      // Deliberately the ONE expansion feature with no stored-flag/env-preview
      // requirement — see evaluateTestingFeedbackAccess. Production still always
      // rejects outright. This mount resolves WHO is asking (admin vs. an
      // authenticated fake-account tester); server/testing-feedback-api.js's own
      // handlers enforce which routes each identity may use and every isolation
      // guarantee (a tester only ever sees her own threads).
      const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
      let fakeAccountEmail = "";
      if (!admin) {
        const authHeader = String(request.headers.authorization || "");
        const memberSession = tempPasswordAuth.resolveMemberSession(peekStore(), authHeader);
        if (memberSession?.email && memberSession.email.endsWith("@example.invalid")) {
          fakeAccountEmail = memberSession.email;
        }
      }
      const access = expansionFeatureFlags.evaluateTestingFeedbackAccess({
        isAuthenticatedTester: Boolean(admin || fakeAccountEmail),
      });
      const handler = getTestingFeedbackApi().matchRoute(request.method, url.pathname, url);
      if (handler && access.allowed) {
        return handler(request, response, { adminEmail: admin?.email || "", adminToken: admin?.token || "", fakeAccountEmail });
      }
      return jsonResponse(response, access.status || 403, access.payload || expansionFeatureFlags.unavailableExpansionPayload(expansionFeatureFlags.EXPANSION_FEATURE_KEYS.TESTING_FEEDBACK));
    }
    if (url.pathname === "/api/external-tester" || url.pathname.startsWith("/api/external-tester/")) {
      // Same identity-resolution pattern as Testing Lab / Testing Feedback —
      // this mount only resolves WHO is asking (verified admin vs. an
      // authenticated fake-account tester). Every real safety decision
      // (production lock, stored testingLab flag, which roles this specific
      // sandbox account may use, which organization it's locked to) lives in
      // scripts/external-tester-sandbox-data-model.js and
      // server/external-tester-sandbox-api.js, not here.
      const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
      let fakeAccountEmail = "";
      if (!admin) {
        const authHeader = String(request.headers.authorization || "");
        const memberSession = tempPasswordAuth.resolveMemberSession(peekStore(), authHeader);
        if (memberSession?.email && memberSession.email.endsWith("@example.invalid")) {
          fakeAccountEmail = memberSession.email;
        }
      }
      const handler = getExternalTesterSandboxApi().matchRoute(request.method, url.pathname, url);
      if (handler && (admin || fakeAccountEmail)) {
        return handler(request, response, { adminEmail: admin?.email || "", adminToken: admin?.token || "", fakeAccountEmail });
      }
      return jsonResponse(response, 403, { ok: false, error: "External Tester Sandbox unavailable.", code: "feature_unavailable" });
    }
    if (url.pathname === "/api/pilot" || url.pathname.startsWith("/api/pilot/")) {
      // Home Daycare Pilot's connected provider<->parent data surface.
      // Same identity-resolution pattern as /api/external-tester above —
      // every real isolation decision (which organization, which child, is
      // this a provider or a parent-preview request) lives in
      // server/home-daycare-pilot-api.js, not here.
      const admin = resolveVerifiedAdminFromRequest(request, url, { allowQueryToken: false });
      let fakeAccountEmail = "";
      if (!admin) {
        const authHeader = String(request.headers.authorization || "");
        const memberSession = tempPasswordAuth.resolveMemberSession(peekStore(), authHeader);
        if (memberSession?.email && memberSession.email.endsWith("@example.invalid")) {
          fakeAccountEmail = memberSession.email;
        }
      }
      const handler = getHomeDaycarePilotApi().matchRoute(request.method, url.pathname, url);
      if (handler && (admin || fakeAccountEmail)) {
        return handler(request, response, { adminEmail: admin?.email || "", adminToken: admin?.token || "", fakeAccountEmail });
      }
      return jsonResponse(response, 403, { ok: false, error: "Home Daycare Pilot unavailable.", code: "feature_unavailable" });
    }
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/api/media/lesson-covers/")) {
      const assetId = decodeURIComponent(url.pathname.slice("/api/media/lesson-covers/".length));
      return await handleLessonCoverMedia(request, response, assetId);
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/curriculum/lesson-plans/")) {
      const planId = decodeURIComponent(url.pathname.slice("/api/curriculum/lesson-plans/".length));
      return await handleCurriculumLessonPlanDetail(request, response, url, planId);
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/curriculum/activities/")) {
      const activityId = decodeURIComponent(url.pathname.slice("/api/curriculum/activities/".length));
      return await handleCurriculumActivityDetail(request, response, url, activityId);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/site-content") return handleAdminSiteContent(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/site-content") return await handleAdminSiteContentSave(request, response);
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/validate-promo-code") return await handlePromoValidation(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/create-checkout-session") return await handleCheckout(request, response);
    if (request.method === "POST" && url.pathname === "/api/create-customer-portal-session") return await handlePortal(request, response);
    if (request.method === "POST" && (url.pathname === "/api/webhooks/stripe" || url.pathname === "/api/stripe/webhook")) return await handleStripeWebhook(request, response);
    if (request.method === "POST" && url.pathname === "/api/ai-generate") return await handleAiGenerate(request, response);
    if (request.method === "POST" && url.pathname === "/api/analytics/event") return await handleAnalyticsEvent(request, response);
    if (request.method === "POST" && url.pathname === "/api/account/profile") return await handleAccountProfileSync(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/users/issue-temp-password") return await handleAdminIssueTempPassword(request, response);
    if (request.method === "POST" && url.pathname === "/api/auth/request-password-reset") return await handlePasswordResetRequest(request, response);
    if (request.method === "GET" && url.pathname === "/api/auth/password-reset/verify") return handlePasswordResetVerify(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/auth/password-reset/complete") return await handlePasswordResetComplete(request, response);
    if (request.method === "POST" && url.pathname === "/api/auth/send-verification-email") return await handleVerificationEmailRequest(request, response);
    if (request.method === "GET" && url.pathname === "/api/auth/verify-email") return await handleVerifyEmailToken(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/auth/password-login") return await handlePasswordLogin(request, response);
    if (request.method === "POST" && url.pathname === "/api/auth/complete-forced-password-change") return await handleCompleteForcedPasswordChange(request, response);
    if (request.method === "POST" && url.pathname === "/api/auth/sync-password-after-firebase") return await handleSyncPasswordAfterFirebase(request, response);
    if (request.method === "POST" && url.pathname === "/api/support-ticket") return await handleSupportTicketCreate(request, response);
    if (request.method === "POST" && url.pathname === "/api/support-ticket-update") return await handleSupportTicketUpdate(request, response);
    if (request.method === "GET" && url.pathname === "/api/support-tickets") return await handleSupportTicketsList(request, response, url);
    // Phase 6-A: Bug Reports
    if (request.method === "POST" && url.pathname === "/api/bug-report") return await handleBugReportCreate(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/bug-report-update") return await handleBugReportUpdate(request, response);
    if (request.method === "GET" && url.pathname === "/api/bug-reports") return await handleBugReportsList(request, response, url);
    // Phase 6-A: Feature Requests
    if (request.method === "POST" && url.pathname === "/api/feature-request") return await handleFeatureRequestCreate(request, response);
    if (request.method === "POST" && url.pathname === "/api/feature-request/vote") return await handleFeatureRequestVote(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/feature-request-update") return await handleFeatureRequestUpdate(request, response);
    if (request.method === "GET" && url.pathname === "/api/feature-requests") return handleFeatureRequestsList(request, response, url);
    // Phase 6-A: Feedback
    if (request.method === "POST" && url.pathname === "/api/feedback") return await handleFeedbackCreate(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/feedback-update") return await handleFeedbackUpdate(request, response);
    if (request.method === "GET" && url.pathname === "/api/feedback") return await handleFeedbackList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/email-engagement") return handleAdminEmailEngagementGet(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/email-diagnostics") return handleAdminEmailDiagnostics(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/settings") return await handleAdminEmailEngagementSettings(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/run-onboarding") return await handleAdminEmailEngagementRunOnboarding(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/run-weekly") return await handleAdminEmailEngagementRunWeekly(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/send-step") return await handleAdminEmailEngagementSendStep(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/free-reengagement-preview") return await handleAdminFreeReengagementPreview(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/free-reengagement-test") return await handleAdminFreeReengagementTest(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/free-reengagement-send") return await handleAdminFreeReengagementSend(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/preflight-audit") return await handleAdminEmailEngagementPreflightAudit(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/prepare-one-time") return await handleAdminEmailEngagementPrepareOneTime(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/email-engagement/send-one-time") return await handleAdminEmailEngagementSendOneTime(request, response);
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/admin/founding-member-email/dry-run") {
      return await handleAdminFoundingMemberEmailDryRun(request, response, url);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/founding-member-email/send") {
      return await handleAdminFoundingMemberEmailSend(request, response);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/founding-member-email/report") {
      return await handleAdminFoundingMemberEmailReport(request, response, url);
    }
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/admin/free-user-welcome-email/dry-run") {
      return await handleAdminFreeUserWelcomeEmailDryRun(request, response, url);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/free-user-welcome-email/send") {
      return await handleAdminFreeUserWelcomeEmailSend(request, response);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/free-user-welcome-email/report") {
      return await handleAdminFreeUserWelcomeEmailReport(request, response, url);
    }
    if (request.method === "POST" && url.pathname === "/api/webhooks/resend") {
      return await handleResendEmailWebhook(request, response);
    }
    if (request.method === "POST" && url.pathname === "/api/email/unsubscribe") return await handleEmailUnsubscribe(request, response);
    if (request.method === "GET" && url.pathname === "/unsubscribe") return handleEmailUnsubscribePage(response, url);
    if (request.method === "POST" && url.pathname === "/api/email/unsubscribe-one-click") return await handleEmailUnsubscribeOneClick(response, url);
    if (request.method === "GET" && url.pathname === "/api/email-campaign/free-reengagement-status") return handleFreeReengagementPublicStatus(response);
    // Phase 6-A: Admin Reply & Communications
    if (request.method === "POST" && url.pathname === "/api/admin/reply") return await handleAdminReply(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/communications") return handleCommunicationsList(request, response, url);
    // Phase 6-A: Announcements
    if (request.method === "POST" && url.pathname === "/api/admin/announcements") return await handleAnnouncementCreate(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/announcement-update") return await handleAnnouncementUpdate(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/announcements") return handleAnnouncementsList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/announcements") return handleAnnouncementsList(request, response, url);
    // Communication ecosystem — drafts, message center, templates, tags, health
    if (request.method === "GET" && url.pathname === "/api/drafts") return await comms.handleDraftsGet(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/drafts") return await comms.handleDraftsSave(request, response);
    if ((request.method === "DELETE" && url.pathname === "/api/drafts") || (request.method === "POST" && url.pathname === "/api/drafts/delete")) {
      return await comms.handleDraftsDelete(request, response);
    }
    if (request.method === "GET" && url.pathname === "/api/messages/center") return await comms.handleMessageCenter(request, response);
    if (request.method === "POST" && url.pathname === "/api/messages/archive") return await comms.handleArchiveConversation(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/message-templates") return comms.handleTemplatesGet(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/message-templates") return await comms.handleTemplatesSave(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/message-templates/delete") return await comms.handleTemplatesDelete(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/user-tags") return comms.handleUserTagsGet(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/user-tags") return await comms.handleUserTagsSet(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/user-timeline") return comms.handleUserTimelineGet(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/user-health") return comms.handleUserHealthGet(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/inbox") return comms.handleAdminInboxGet(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/automations") return comms.handleAutomationsGet(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/automations") return await comms.handleAutomationsSave(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/broadcast-log") return comms.handleBroadcastLogGet(request, response, url);
    // Member Messaging Center — admin composer + delivery
    if (request.method === "POST" && url.pathname === "/api/admin/messages/preview") return await handleAdminMessagePreview(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/messages/send") return await handleAdminMessageSend(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/messages/draft") return await handleAdminMessageDraftSave(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/messages/drafts") return handleAdminMessageDraftsList(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/messages/draft-delete") return await handleAdminMessageDraftDelete(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/conversations") return handleAdminConversationsList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/messages/conversation") return handleAdminConversationMessages(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/push/subscriptions") return handleAdminPushSubscriptionsList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/push/log") return handleAdminPushDeliveryLog(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/push/test") return await handleAdminPushTest(request, response);
    // Member Messaging Center — member-facing inbox, replies, notifications, push opt-in
    if (request.method === "GET" && url.pathname === "/api/messages/conversation") return await handleMemberConversation(request, response);
    if (request.method === "POST" && url.pathname === "/api/messages/reply") return await handleMemberMessageReply(request, response);
    if (request.method === "GET" && url.pathname === "/api/messages/inbox") return await handleMemberInbox(request, response);
    if (request.method === "POST" && url.pathname === "/api/messages/mark-read") return await handleMemberMarkRead(request, response);
    if (request.method === "GET" && url.pathname === "/api/notifications") return await handleMemberNotificationsList(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/notifications/mark-all-read") return await handleMemberNotificationsMarkAllRead(request, response);
    if (request.method === "GET" && url.pathname === "/api/notification-preferences") return await handleNotificationPreferencesGet(request, response);
    if (request.method === "POST" && url.pathname === "/api/notification-preferences") return await handleNotificationPreferencesSet(request, response);
    if (request.method === "POST" && url.pathname === "/api/push/subscribe") return await handlePushSubscribe(request, response);
    if (request.method === "POST" && url.pathname === "/api/push/unsubscribe") return await handlePushUnsubscribe(request, response);
    if (request.method === "GET" && url.pathname === "/api/push/vapid-public-key") return handleVapidPublicKey(request, response);
    // Phase 6-A: Release Notes
    if (request.method === "POST" && url.pathname === "/api/admin/release-notes") return await handleReleaseNoteCreate(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/release-note-update") return await handleReleaseNoteUpdate(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/release-notes") return handleReleaseNotesList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/release-notes") return handleReleaseNotesList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/curriculum/backup") return handleAdminCurriculumBackup(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/curriculum/backup/new") return handleAdminCurriculumBackupNew(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/curriculum/backup/full") return handleAdminCurriculumBackupFull(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/wipe") {
      // Kept behind ALLOW_CURRICULUM_WIPE=true; returns 404 when disabled.
      return await handleAdminCurriculumWipe(request, response);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/series") return await handleAdminCurriculumSeriesSave(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/lesson-plans") return await handleAdminCurriculumLessonPlanSave(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/lesson-covers/upload") return await handleAdminLessonCoverUpload(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/curriculum/resources") return handleAdminCurriculumResourcesList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/curriculum/resources/file") return handleAdminCurriculumResourceFile(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/curriculum/resources/file") return await handlePublicCurriculumResourceFile(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/resources/upload") return await handleAdminCurriculumResourceUpload(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/resources/save") return await handleAdminCurriculumResourceSave(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/resources/archive") return await handleAdminCurriculumResourceArchive(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/resources/link") return await handleAdminCurriculumResourceLink(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/curriculum/resources/unlink") return await handleAdminCurriculumResourceUnlink(request, response);
    if (request.method === "GET" && url.pathname === "/api/uploads") return handleUploadedResourcesList(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/uploads/migrate") return await handleAdminUploadedResourcesMigrate(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/uploads/upsert") return await handleAdminUploadedResourceUpsert(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/uploads/delete") return await handleAdminUploadedResourceDelete(request, response);
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/child-data") return await handleChildData(request, response);
    if (request.method === "GET" && url.pathname === "/api/staff/invites") return await handleStaffInvitesList(request, response);
    if (request.method === "POST" && url.pathname === "/api/staff/invites") return await handleStaffInviteCreate(request, response);
    if (request.method === "GET" && url.pathname === "/api/staff/invites/peek") return handleStaffInvitePeek(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/staff/invites/accept") return await handleStaffInviteAccept(request, response);
    if (request.method === "DELETE" && url.pathname.startsWith("/api/staff/invites/")) {
      const inviteId = decodeURIComponent(url.pathname.slice("/api/staff/invites/".length));
      return await handleStaffInviteRevoke(request, response, inviteId);
    }
    if (request.method === "GET" && url.pathname === "/api/schedule") return await handleScheduleGet(request, response, url);
    if (request.method === "PUT" && url.pathname === "/api/schedule") return await handleSchedulePut(request, response);
    if (request.method === "POST" && url.pathname === "/api/schedule/migrate") return await handleScheduleMigrate(request, response);
    if (request.method === "PUT" && url.pathname.startsWith("/api/schedule/weeks/")) {
      const weekStart = decodeURIComponent(url.pathname.slice("/api/schedule/weeks/".length));
      return await handleScheduleWeekAssign(request, response, weekStart);
    }
    if (request.method === "PUT" && url.pathname.startsWith("/api/schedule/items/")) {
      const itemId = decodeURIComponent(url.pathname.slice("/api/schedule/items/".length));
      return await handleScheduleItemUpsert(request, response, itemId);
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/schedule/items/")) {
      const itemId = decodeURIComponent(url.pathname.slice("/api/schedule/items/".length));
      return await handleScheduleItemDelete(request, response, itemId);
    }
    if (request.method === "GET" && url.pathname === "/api/checkout-status") return await handleCheckoutStatus(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/cancel-subscription") return await handleCancelSubscription(request, response);
    if (request.method === "GET" && url.pathname === "/api/subscription-status") return await handleSubscriptionStatus(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/user/ai-usage") return handleUserAiUsage(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/analytics") return handleAdminAnalytics(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/notifications") return await handleAdminNotificationsList(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/notifications/mark-read") return await handleAdminNotificationsMarkRead(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/membership-update") return await handleAdminMembershipUpdate(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/subscription-refresh") return await handleAdminSubscriptionRefresh(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-test") return await handleAdminAiTest(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-generate-content") return await handleAdminAiGenerateContent(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/ai-prompts") return handleAdminAiPrompts(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-prompts") return await handleAdminAiPromptsSave(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-prompts/restore") return await handleAdminAiPromptsRestore(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/ai-settings") return handleAdminAiSettings(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-settings") return await handleAdminAiSettingsSave(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/ai-usage") return handleAdminAiUsage(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/generate-lesson-plan") return await handleAdminGenerateLessonPlan(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/stripe-backfill") return await handleAdminStripeBackfill(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/store-health") return handleAdminStoreHealth(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/program-migration-plan") return handleAdminProgramMigrationPlan(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/program-migration-rollback") return handleAdminProgramMigrationRollback(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/store-export") return handleAdminStoreExport(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/store-backups") return await handleAdminStoreBackupsList(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/store-backups") return await handleAdminStoreBackupCreate(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/store-backups/download") return await handleAdminStoreBackupDownload(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/store-restore") return await handleAdminStoreRestore(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/promo-codes") return handleAdminPromoCodesList(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/promo-codes") return await handleAdminPromoCodeSave(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/promo-code-delete") return await handleAdminPromoCodeDelete(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/user-detail") return handleAdminUserDetail(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/recover-sparse-store") return await handleAdminRecoverSparseStore(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/recover-firebase-profiles") return await handleAdminRecoverFirebaseProfiles(request, response);
    if (request.method === "GET" && url.pathname === "/api/founding-status") return handleFoundingStatus(request, response);
    if (request.method === "GET" && url.pathname === "/api/stripe-readiness") return handleStripeReadiness(request, response);
    if (request.method === "GET" && url.pathname === "/api/billing-readiness") return handleBillingReadiness(request, response);
    if (request.method === "GET" && url.pathname === "/api/launch-readiness") return await handleLaunchReadiness(request, response);
    if (request.method === "GET" && url.pathname === "/api/domain-dns-check") return await handleDomainDnsCheck(request, response);
    if (request.method === "GET" && url.pathname === "/api/health") return handleHealth(request, response);
    if (request.method === "GET" && url.pathname === "/api/build-version") return handleBuildVersion(request, response);
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
  .then(async () => {
    try {
      pushService = createPushService({
        envPublicKey: VAPID_PUBLIC_KEY,
        envPrivateKey: VAPID_PRIVATE_KEY,
        subject: VAPID_SUBJECT,
        loadStoredKeys: () => peekStore().pushConfig?.vapid || null,
        persistKeys: (keys) => {
          const store = readStore();
          store.pushConfig = store.pushConfig || {};
          store.pushConfig.vapid = { ...keys, generatedAt: new Date().toISOString() };
          writeStore(store);
        },
        batchSize: PUSH_BULK_BATCH_SIZE,
        batchDelayMs: PUSH_BULK_BATCH_DELAY_MS,
        maxRecipientsPerSend: PUSH_BULK_MAX_RECIPIENTS,
      });
      console.log(`[push] Web Push ${pushService.configured() ? "ready" : "not configured"} (key source: ${pushService.statusInfo().keySource}).`);
    } catch (error) {
      console.warn("[push] could not initialize Web Push service — push notifications will be unavailable, in-app messaging is unaffected:", error.message);
      pushService = null;
    }
    // Boot-time Stripe sparse recovery is opt-in. Prefer explicit Admin recover after review.
    // Set ALLOW_BOOT_SPARSE_STORE_RECOVERY=true only when an unattended rebuild is intentional.
    const allowBootSparseRecovery = ["1", "true", "yes", "on"].includes(
      String(process.env.ALLOW_BOOT_SPARSE_STORE_RECOVERY || "").trim().toLowerCase(),
    );
    if (!allowBootSparseRecovery) {
      console.log("[store-recovery] boot check skipped — set ALLOW_BOOT_SPARSE_STORE_RECOVERY=true to enable automatic rebuild");
    } else {
      try {
        const recovery = await recoverSparseStoreFromStripeIfNeeded({ source: "boot" });
        if (recovery.ran) {
          console.warn(`[store-recovery] boot recovery restored users ${recovery.userCountBefore} → ${recovery.userCountAfter}`);
        } else {
          console.log(`[store-recovery] boot check: ${recovery.reason}${recovery.userCount != null ? ` (users=${recovery.userCount})` : ""}`);
        }
      } catch (error) {
        console.error("[store-recovery] boot recovery failed:", error.message || error);
      }
    }
    try {
      startStoreBackupScheduler();
      console.log(`[store-backup] scheduler ready (intervalMs=${STORE_BACKUP_INTERVAL_MS}, retention=${STORE_BACKUP_RETENTION})`);
    } catch (error) {
      console.warn("[store-backup] scheduler failed to start:", error.message || error);
    }
    server.listen(PORT, () => {
      console.log(`Little Learner Hub launch server running on http://localhost:${PORT}`);
      try {
        if (!emailAutomationsEnabled()) {
          const paused = pauseEmailAutomationsInStore("boot:EMAIL_AUTOMATIONS_ENABLED=false");
          console.log(
            `[email-engagement] automations paused (EMAIL_AUTOMATIONS_ENABLED=false)`
            + `${paused.changed ? "; store toggles forced off" : "; store toggles already off"}`
            + `; From=${SUPPORT_EMAIL_FROM}`,
          );
        } else {
          emailEngagement.startScheduler();
          console.log("[email-engagement] scheduler started (hourly onboarding + Monday What's New)");
        }
      } catch (err) {
        console.warn("[email-engagement] scheduler/bootstrap failed:", err.message);
      }
    });
  })
  .catch((error) => {
    console.error("Could not initialize Little Learner Hub storage.");
    console.error(error.message);
    process.exit(1);
  });
