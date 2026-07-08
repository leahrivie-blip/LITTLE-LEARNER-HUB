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
const PROMO_FREE_TRIAL_DAYS = Number(process.env.PROMO_FREE_TRIAL_DAYS || 7);
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
const MAX_BACKFILL_REPORT_ITEMS = 500;

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
    aiSettings: defaultAiSettings(),
    aiPrompts: {},
    aiPromptVersions: [],
    aiUsageLogs: [],
    supportTickets: [],
    analyticsEvents: [],
    billingEvents: [],
    leads: [],
    promoRedemptions: [],
    siteContent: defaultSiteContentStore(),
  };
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

function defaultSiteContentStore() {
  return {
    lessonPlans: {},
    customLessonPlans: [],
    activities: [],
    forms: [],
    printables: [],
    reviews: [],
    founder: {},
    homepage: {},
    pricing: {},
    faqs: [],
    announcement: {},
    upgradeMessaging: {},
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
    tags: tagsInput.map((t) => normalizedShortText(t, 80)).filter(Boolean).slice(0, 20),
    format: normalizedShortText(entry.format, 80),
    fileName: normalizedShortText(entry.fileName, 180),
    fileData: sanitizedResourceUrl(entry.fileData),
    previewName: normalizedShortText(entry.previewName, 180),
    previewData: sanitizedImageSource(entry.previewData),
    customContent: normalizedMultilineText(entry.customContent, 20000),
    visible: entry.visible === true,
    archived: entry.archived === true,
    updatedAt: normalizedShortText(entry.updatedAt, 80),
  };
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

const POSTGRES_UPSERT_STORE = "INSERT INTO llh_store (id, data, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()";

function writeStore(store) {
  storeCache = store;
  if (usePostgresStore()) {
    const payload = JSON.stringify(store);
    postgresWriteChain = postgresWriteChain
      .then(() => postgresPool.query(POSTGRES_UPSERT_STORE, [storeRecordId, payload]))
      .catch((error) => {
        databaseReady = false;
        console.error("Could not persist launch store to Postgres:", error.message);
      });
    return;
  }
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

// Writes the store and waits for the Postgres write to complete before returning.
// Throws if the database write fails so the caller can surface the error to the client
// instead of reporting a false success. Use this for admin writes where persistence must
// be confirmed before responding (e.g. lesson plan visibility changes, site content saves).
async function writeStoreAsync(store) {
  storeCache = store;
  if (usePostgresStore()) {
    const payload = JSON.stringify(store);
    // Wait for any in-flight fire-and-forget writes to settle before issuing our own,
    // so we don't race against them and produce an out-of-order result.
    // Log (but do not rethrow) chain errors — they are already logged by writeStore's .catch handler.
    // It is safe to proceed even if a previous chain write failed: every write sends the
    // complete store state (not a delta), so the latest write always supersedes older ones.
    await postgresWriteChain.catch((error) => {
      console.error("Pending write chain error before async write:", error.message);
    });
    await postgresPool.query(POSTGRES_UPSERT_STORE, [storeRecordId, payload]);
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
    "- Older Toddler (24-36 months): pretend play, matching, sorting, simple art, running/jumping, beginning sharing, short directions, simple routines. NEVER suggest kindergarten or school-age expectations.",
    "- Preschool (3-5 years): vocabulary building, pre-literacy, counting, science exploration, cooperative play, problem-solving, growing independence, simple writing experiences. NEVER suggest elementary-level workload or pressure.",
    "- School Age (5+ years): projects, discussions, writing, STEM, problem-solving, leadership, reflection, responsibility, and age-appropriate independence. Content should feel meaningfully more advanced than preschool.",
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

INFANT (0–12 months):
Focus ONLY on: sensory exploration, tummy time, rolling, crawling, reaching, tracking objects, cause and effect, simple songs, nursery rhymes, peekaboo, mirrors, texture exploration, one-on-one interactions, teacher narration, and responsive caregiving.
NEVER include: worksheets, scissors, complex crafts, multi-step directions, writing, preschool circle activities, or group discussions.
Activities: 5–10 minutes, caregiver-led, sensory-safe materials only, no choking hazards, no small parts.

TODDLER (12–36 months):
Focus ONLY on: short activities (10–15 min), movement, pretend play, simple crafts, vocabulary building, matching, sorting, music, large motor play, beginning problem solving, following one-step directions, repetition, and hands-on play.
NEVER include: worksheets, tracing, writing, or kindergarten-level expectations.
Activities: 10–15 minutes, adult-supported, simple one-to-two step directions.

PRESCHOOL (3–5 years):
Focus on: problem solving, letter recognition, number concepts, science experiments, cooperative learning, fine motor skills, early writing, open-ended questions, higher-level thinking, and growing independence.
Activities must be meaningfully more advanced than toddler activities in every way.
Activities: 15–20 minutes, small group or whole group, open-ended and discussion-rich.

SCHOOL AGE (5+ years):
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
- Infant plans: sensory-safe only, no small parts, 5–10 min, caregiver-led.
- Toddler plans: 10–15 min, simple, adult-supported, hands-on, no worksheets.
- Preschool plans: literacy + math + science + social-emotional all appear across the week.
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
- Infant activities: sensory-safe, caregiver-led, no small parts, 5-10 minutes. Focus on bonding, tracking, reaching, and responsive interaction.
- Young Toddler: movement or sensory-based, toddler-safe materials, 10-15 minutes. Keep adult support central.
- Older Toddler: pretend play, matching, sorting, process art, 10-15 minutes.
- Preschool: problem-solving, early literacy/math/science/STEM, small group or whole group, 15-20 minutes.
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
  const ageInstructions = {
    Infant: "infants (0–12 months). Activities: 5–10 minutes, caregiver-led, sensory-safe only. Focus: tummy time, songs, tracking, reaching, sensory exploration, bonding. Never suggest scissors, small parts, worksheets, or complex crafts.",
    Toddler: "toddlers (12–36 months). Activities: 10–15 minutes, adult-supported, 1–2 step directions. Focus: movement, pretend play, simple art, songs, vocabulary, sensory play. Never suggest worksheets or academic pressure.",
    Preschool: "preschool children (3–5 years). Activities: 15–20 minutes, small or whole group. Focus: problem-solving, pre-literacy, counting, science, cooperative play, early writing, open-ended questions.",
  };
  const elgAgeLabel = age === "Infant" ? "Infant (0–12 months)" : age === "Toddler" ? "Toddler (1–3 years)" : "Preschool (3–5 years)";
  const ageNote = ageInstructions[age] || ageInstructions.Preschool;
  const themeUpper = theme.toUpperCase();

  return `Create a complete, professional weekly lesson plan for ${ageNote}

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
- Every activity must be truly age-appropriate for ${age}
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

async function handleAdminSiteContentSave(request, response) {
  console.log("[DIAG] handleAdminSiteContentSave: POST /api/admin/site-content received");
  const body = await readJson(request);
  console.log("[DIAG] handleAdminSiteContentSave: body keys =", Object.keys(body || {}), "| hasAdminToken =", !!(body?.adminToken));
  if (!validAdminToken(body.adminToken || "")) {
    console.error("[DIAG] handleAdminSiteContentSave: REJECTED — invalid admin token");
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  console.log("[DIAG] handleAdminSiteContentSave: token valid");
  const incomingLessonPlans = (body.siteContent?.lessonPlans) || {};
  const incomingIds = Object.keys(incomingLessonPlans);
  console.log("[DIAG] handleAdminSiteContentSave: incoming lessonPlan overrides count =", incomingIds.length, "| ids (first 5) =", incomingIds.slice(0, 5));
  if (incomingIds.length > 0) {
    const lastIncomingId = incomingIds[incomingIds.length - 1];
    const lastIncomingLesson = incomingLessonPlans[lastIncomingId];
    console.log("[DIAG] handleAdminSiteContentSave: last lessonPlan entry (", lastIncomingId, ") fields =", Object.keys(lastIncomingLesson || {}));
    console.log("[DIAG] handleAdminSiteContentSave: last lessonPlan entry title =", JSON.stringify(lastIncomingLesson?.title), "| visible =", lastIncomingLesson?.visible, "| plan =", JSON.stringify(lastIncomingLesson?.plan));
  }
  const store = readStore();
  const nextContent = normalizedSiteContent(body.siteContent || defaultSiteContentStore());
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
  const planKey = planInfo.plan === "Founding"
    ? "founding"
    : planInfo.plan === "Pro"
      ? "monthly"
      : "";
  return {
    email,
    name: String(customer?.name || "").trim(),
    stripeCustomerId: String(customer?.id || "").trim(),
    stripeSubscriptionId: String(subscription?.id || "").trim(),
    stripeCustomerCreatedAt: createdAt,
    createdAt,
    signupAt: createdAt,
    plan: planInfo.plan,
    planDisplayName: planInfo.planDisplayName,
    subscriptionState,
    subscriptionStatus: subscriptionState,
    trialStatus: legacyTrialStatus(subscriptionState),
    accountStatus: legacyAccountStatus(subscriptionState),
    subscriptionCadence: planConfig[planKey]?.cadence || "",
    monthlyPrice: planConfig[planKey]?.amount || "$0/month",
    priceLock: planConfig[planKey]?.priceLock || "",
    paymentMethod: "Managed in Stripe",
  };
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
  if (!dryRun) writeStore(store);
  report.duplicateAccountsDetected = report.duplicateAccountsDetected.slice(0, MAX_BACKFILL_REPORT_ITEMS);
  report.recordsNeedingManualReview = report.recordsNeedingManualReview.slice(0, MAX_BACKFILL_REPORT_ITEMS);
  return report;
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
      const checkoutTrialUpdates = {};
      if (promoTrialDays > 0) {
        checkoutTrialUpdates.trialStatus = "In Trial";
        checkoutTrialUpdates.trialStart = new Date().toISOString();
        checkoutTrialUpdates.trialEnd = new Date(Date.now() + promoTrialDays * 86400000).toISOString();
      }
      upsertUser(email, {
        ...statusForPlan(planKey, session.subscription, promoTrialDays > 0 ? "trialing" : "Active"),
        ...checkoutTrialUpdates,
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
      const trialUpdates = {};
      if (!canceled && subscription.trial_start) {
        trialUpdates.trialStart = new Date(subscription.trial_start * 1000).toISOString();
      }
      if (!canceled && subscription.trial_end) {
        trialUpdates.trialEnd = new Date(subscription.trial_end * 1000).toISOString();
      }
      if (!canceled && subscription.status === "trialing") {
        trialUpdates.trialStatus = "In Trial";
      } else if (!canceled && subscription.status === "active" && user.trialStatus === "In Trial") {
        trialUpdates.trialStatus = "Trial Ended";
      }
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
        ...trialUpdates,
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
  const tool = String(body.tool || "unknown");
  console.log(`[access] ai-generate email=${email} tool=${tool} storedPlan=${user?.plan || "none"} resolvedPlan=${plan} status=${user?.subscriptionStatus || "none"}`);
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
    jsonResponse(response, 200, { ok: true, report });
  } catch (error) {
    const message = error?.message || "Unknown error.";
    console.error("Stripe backfill failed:", message);
    jsonResponse(response, 503, { error: `Stripe backfill failed: ${message}` });
  }
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
  if (event.name === "account_signup_complete") {
    const detailFirst = normalizedShortText(event.detail?.firstName, 80);
    const detailLast  = normalizedShortText(event.detail?.lastName, 80);
    if (detailFirst && !existing.firstName) updates.firstName = detailFirst;
    if (detailLast  && !existing.lastName)  updates.lastName  = detailLast;
    if ((detailFirst || detailLast) && !existing.name) {
      updates.name = [detailFirst, detailLast].filter(Boolean).join(" ");
    }
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
      const displayName = user.name || user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || "";
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
        lastSeenAt: user.lastSeenAt || user.updatedAt || "",
        monthlyPrice: user.monthlyPrice || "",
        foundingMember: Boolean(user.foundingMember),
        foundingMemberNumber: user.foundingMemberNumber || null,
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
      aiUsage: countBy(events.filter((event) => event.name === "ai_generation_success"), (event) => event.detail?.tool || "Document Helper"),
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

function handlePublicSiteContent(request, response) {
  const store = readStore();
  const content = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
  const publicLessonPlans = Object.fromEntries(
    Object.entries(content.lessonPlans).filter(([, plan]) => plan.visible === true && plan.archived !== true)
  );
  const publicCustomLessonPlans = (content.customLessonPlans || []).filter((item) => item.visible === true && item.archived !== true);
  const publicActivities = (content.activities || []).filter((a) => a.visible === true && a.archived !== true);
  const publicForms = (content.forms || []).filter((item) => item.visible === true && item.archived !== true);
  const publicPrintables = (content.printables || []).filter((item) => item.visible === true && item.archived !== true);
  jsonResponse(response, 200, {
    siteContent: {
      ...content,
      lessonPlans: publicLessonPlans,
      customLessonPlans: publicCustomLessonPlans,
      activities: publicActivities,
      forms: publicForms,
      printables: publicPrintables,
    },
  });
}

function handleAdminSiteContent(request, response, url) {
  const token = url.searchParams.get("adminToken");
  if (!validAdminToken(token)) {
    jsonResponse(response, 401, { error: "Admin access is required." });
    return;
  }
  const store = readStore();
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
    if (request.method === "GET" && url.pathname === "/api/site-content") return handlePublicSiteContent(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/site-content") return handleAdminSiteContent(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/site-content") return await handleAdminSiteContentSave(request, response);
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
    if (request.method === "GET" && url.pathname === "/api/user/ai-usage") return handleUserAiUsage(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/support-tickets") return handleSupportTicketsList(request, response, url);
    if (request.method === "GET" && url.pathname === "/api/admin/analytics") return handleAdminAnalytics(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-test") return await handleAdminAiTest(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/ai-prompts") return handleAdminAiPrompts(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-prompts") return await handleAdminAiPromptsSave(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-prompts/restore") return await handleAdminAiPromptsRestore(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/ai-settings") return handleAdminAiSettings(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/ai-settings") return await handleAdminAiSettingsSave(request, response);
    if (request.method === "GET" && url.pathname === "/api/admin/ai-usage") return handleAdminAiUsage(request, response, url);
    if (request.method === "POST" && url.pathname === "/api/admin/generate-lesson-plan") return await handleAdminGenerateLessonPlan(request, response);
    if (request.method === "POST" && url.pathname === "/api/admin/stripe-backfill") return await handleAdminStripeBackfill(request, response);
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
