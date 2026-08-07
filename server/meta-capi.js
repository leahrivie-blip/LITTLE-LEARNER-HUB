/**
 * Meta Pixel + Conversions API helpers.
 *
 * Secrets (META_CAPI_ACCESS_TOKEN) stay server-only.
 * Browser may only receive META_PIXEL_ID via /api/client-config.js.
 *
 * Failures never throw to callers — Meta must not interrupt signup, Stripe, or webhooks.
 */

const crypto = require("node:crypto");

const META_GRAPH_VERSION = "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

function envFlag(name, defaultValue = false, env = process.env) {
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sha256Normalize(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readConfig(env = process.env) {
  const pixelId = String(env.META_PIXEL_ID || "").trim();
  const accessToken = String(env.META_CAPI_ACCESS_TOKEN || "").trim();
  const testEventCode = String(env.META_CAPI_TEST_EVENT_CODE || "").trim();
  // Master kill switch: META_TRACKING_ENABLED=false disables Pixel + CAPI.
  // Default ON when a Pixel ID is configured so production can enable with one env var.
  const masterEnabled = env.META_TRACKING_ENABLED === undefined || String(env.META_TRACKING_ENABLED).trim() === ""
    ? Boolean(pixelId)
    : envFlag("META_TRACKING_ENABLED", false, env);
  const pixelEnabled = masterEnabled && envFlag("META_PIXEL_ENABLED", true, env) && Boolean(pixelId);
  const capiEnabled = masterEnabled && envFlag("META_CAPI_ENABLED", true, env) && Boolean(pixelId) && Boolean(accessToken);
  return {
    pixelId,
    accessToken,
    testEventCode,
    masterEnabled,
    pixelEnabled,
    capiEnabled,
  };
}

function publicClientMetaConfig(env = process.env) {
  const cfg = readConfig(env);
  return {
    enabled: cfg.pixelEnabled,
    pixelId: cfg.pixelEnabled ? cfg.pixelId : "",
    // Never expose access token or test codes to the browser.
  };
}

function planValueUsd(planKey) {
  const key = String(planKey || "").trim().toLowerCase();
  if (key === "annual") return 199;
  if (key === "founding") return 9.99;
  if (key === "early_user" || key === "early-user" || key === "earlyuser") return 13.99;
  if (key === "monthly" || key === "pro") return 19.99;
  return 0;
}

/** StartTrial only when checkout completes with a trial and we have not already sent it. */
function shouldFireMetaStartTrial({ trialDays = 0, alreadySent = false } = {}) {
  return Number(trialDays) > 0 && !alreadySent;
}

/**
 * Purchase only for the first successful paid invoice.
 * Renewals (including Founding) and $0 trial invoices must not fire Purchase.
 */
function shouldFireMetaPurchase({
  amountPaid = 0,
  alreadyHadFirstPaid = false,
} = {}) {
  return Number(amountPaid) > 0 && !alreadyHadFirstPaid;
}

function buildUserData({
  email = "",
  firstName = "",
  lastName = "",
  phone = "",
  fbp = "",
  fbc = "",
  clientIpAddress = "",
  clientUserAgent = "",
  externalId = "",
} = {}) {
  const userData = {};
  const hashedEmail = sha256Normalize(normalizeEmail(email));
  if (hashedEmail) userData.em = [hashedEmail];
  const hashedFirst = sha256Normalize(firstName);
  if (hashedFirst) userData.fn = [hashedFirst];
  const hashedLast = sha256Normalize(lastName);
  if (hashedLast) userData.ln = [hashedLast];
  const phoneDigits = String(phone || "").replace(/\D+/g, "");
  if (phoneDigits) userData.ph = [sha256Normalize(phoneDigits)];
  if (fbp) userData.fbp = String(fbp).slice(0, 200);
  if (fbc) userData.fbc = String(fbc).slice(0, 500);
  if (clientIpAddress) userData.client_ip_address = String(clientIpAddress).slice(0, 64);
  if (clientUserAgent) userData.client_user_agent = String(clientUserAgent).slice(0, 512);
  const ext = normalizeEmail(externalId || email);
  if (ext) userData.external_id = [sha256Normalize(ext)];
  return userData;
}

function buildEventPayload({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl = "",
  actionSource = "website",
  customData = {},
  userData = {},
} = {}) {
  const payload = {
    event_name: eventName,
    event_time: Number(eventTime) || Math.floor(Date.now() / 1000),
    event_id: String(eventId || "").slice(0, 200),
    action_source: actionSource,
    user_data: userData,
  };
  if (eventSourceUrl) payload.event_source_url = String(eventSourceUrl).slice(0, 2000);
  if (customData && Object.keys(customData).length) payload.custom_data = customData;
  return payload;
}

/**
 * Send one or more CAPI events. Never throws.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, status?: number, body?: any }>}
 */
async function sendCapiEvents(events, {
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    const cfg = readConfig(env);
    if (!cfg.capiEnabled) {
      return { ok: true, skipped: true, reason: "capi_disabled" };
    }
    const list = (Array.isArray(events) ? events : [events]).filter((item) => item && item.event_name && item.event_id);
    if (!list.length) return { ok: true, skipped: true, reason: "no_events" };

    const body = {
      data: list,
      access_token: cfg.accessToken,
    };
    if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;

    const url = `${META_GRAPH_BASE}/${encodeURIComponent(cfg.pixelId)}/events`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }
    if (!response.ok) {
      console.warn("[meta-capi] send failed", response.status, parsed?.error?.message || text.slice(0, 200));
      return { ok: false, status: response.status, body: parsed };
    }
    return { ok: true, status: response.status, body: parsed };
  } catch (error) {
    console.warn("[meta-capi] send error:", error?.message || error);
    return { ok: false, reason: error?.message || "meta_capi_error" };
  }
}

async function trackMetaEvent(eventName, {
  eventId,
  email = "",
  firstName = "",
  lastName = "",
  phone = "",
  fbp = "",
  fbc = "",
  clientIpAddress = "",
  clientUserAgent = "",
  eventSourceUrl = "",
  customData = {},
  eventTime,
  actionSource = "website",
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!eventName || !eventId) return { ok: true, skipped: true, reason: "missing_event_name_or_id" };
  const userData = buildUserData({
    email,
    firstName,
    lastName,
    phone,
    fbp,
    fbc,
    clientIpAddress,
    clientUserAgent,
    externalId: email,
  });
  const payload = buildEventPayload({
    eventName,
    eventId,
    eventTime,
    eventSourceUrl,
    actionSource,
    customData,
    userData,
  });
  return sendCapiEvents([payload], { env, fetchImpl });
}

function requestClientHints(request) {
  const headers = request?.headers || {};
  const forwarded = String(headers["x-forwarded-for"] || "").split(",")[0].trim();
  const realIp = String(headers["x-real-ip"] || "").trim();
  return {
    clientIpAddress: forwarded || realIp || "",
    clientUserAgent: String(headers["user-agent"] || "").slice(0, 512),
  };
}

module.exports = {
  META_GRAPH_VERSION,
  readConfig,
  publicClientMetaConfig,
  planValueUsd,
  shouldFireMetaStartTrial,
  shouldFireMetaPurchase,
  sha256Normalize,
  buildUserData,
  buildEventPayload,
  sendCapiEvents,
  trackMetaEvent,
  requestClientHints,
  envFlag,
};
