"use strict";

const REQUIRED_KEYS = Object.freeze([
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_PAID_SUBSCRIPTION_CONVERSION_ACTION",
]);

function enabled(env = process.env) {
  return String(env.GOOGLE_ADS_API_ENABLED || "").trim().toLowerCase() === "true";
}

function status(env = process.env) {
  const missing = REQUIRED_KEYS.filter((key) => !String(env[key] || "").trim());
  return {
    enabled: enabled(env),
    configured: missing.length === 0,
    ready: enabled(env) && missing.length === 0,
    missing,
  };
}

module.exports = { REQUIRED_KEYS, status };
