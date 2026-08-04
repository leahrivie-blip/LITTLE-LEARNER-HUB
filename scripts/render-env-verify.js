#!/usr/bin/env node
"use strict";

/**
 * Post-change verification against a running service URL + Dashboard inventory.
 * Never logs secret values. Does NOT restart or deploy.
 *
 * Usage:
 *   RENDER_API_KEY=... BASE_URL=https://... npm run env:verify
 */

const {
  loadInventory,
  assertNoSecretValues,
  listServiceEnvVars,
  runPreflight,
  appendAuditLog
} = require("./lib/render-env-safety");

function parseArgs(argv) {
  const out = {
    serviceId: process.env.RENDER_SERVICE_ID || "srv-d8o3f3r6sc1c73comlc0",
    baseUrl:
      process.env.BASE_URL
      || process.env.RENDER_EXTERNAL_URL
      || "https://littlelearnershubbyleah.com"
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--service-id" && argv[i + 1]) out.serviceId = argv[++i];
    else if (a === "--base-url" && argv[i + 1]) out.baseUrl = argv[++i];
  }
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

function readyFlag(node) {
  if (node == null) return null;
  if (typeof node === "boolean") return node;
  if (typeof node === "object" && typeof node.ready === "boolean") return node.ready;
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const inventory = loadInventory();
  const base = String(args.baseUrl).replace(/\/$/, "");
  const checks = {};

  const health = await fetchJson(`${base}/api/health`);
  checks.health = {
    ok: Boolean(health.ok && health.json && health.json.ok === true),
    status: health.status,
    launchReady: health.json?.launchReady === true,
    stripeCheckoutReady: health.json?.stripeCheckoutReady === true,
    supportEmailReady: health.json?.supportEmailReady === true
  };

  const readiness = await fetchJson(`${base}/api/launch-readiness`);
  const required = readiness.json?.required || {};
  const optional = readiness.json?.optional || {};

  checks.database = readyFlag(required.database);
  checks.login = readyFlag(required.admin); // admin auth credentials configured
  checks.stripe = readyFlag(required.stripe);
  checks.resend = readyFlag(optional.supportEmail);
  checks.openai = readyFlag(required.ai);
  checks.site = readyFlag(required.site);

  const loginPage = await fetch(`${base}/`).then(async (res) => ({
    ok: res.ok,
    status: res.status
  }));
  checks.loginSurface = Boolean(loginPage.ok);

  let inventoryCheck = null;
  const apiKey = String(process.env.RENDER_API_KEY || "").trim();
  if (apiKey) {
    const envList = await listServiceEnvVars({ apiKey, serviceId: args.serviceId });
    const keys = envList.map((row) => row.key);
    const keySet = new Set(keys);
    inventoryCheck = runPreflight(keys, inventory);
    checks.requiredKeysPresent = inventoryCheck.ok;
    checks.missingRequired = inventoryCheck.missingRequired;
    checks.missingProtected = inventoryCheck.missingProtected;
    checks.noRequiredKeyDisappeared = inventoryCheck.ok;
    checks.stripeEnv = (inventory.categories.stripe || []).every((k) => keySet.has(k));
    checks.resendEnv = (inventory.categories.resend || []).every((k) => keySet.has(k));
    checks.openaiEnv = keySet.has("OPENAI_API_KEY");
    checks.metaEnv = keySet.has("META_PIXEL_ID");
    checks.metaCapiEnv = keySet.has("META_CAPI_ACCESS_TOKEN");
  } else {
    checks.requiredKeysPresent = null;
    checks.note = "RENDER_API_KEY not set; skipped Dashboard inventory re-check";
  }

  const hardFailures = [];
  if (!checks.health.ok) hardFailures.push("health");
  if (checks.database !== true) hardFailures.push("database");
  if (checks.login !== true && !checks.loginSurface) hardFailures.push("login");
  if (!checks.loginSurface) hardFailures.push("loginSurface");
  if (checks.stripe !== true && checks.stripeEnv !== true) hardFailures.push("stripe");
  if (checks.resend !== true && checks.resendEnv !== true) hardFailures.push("resend");
  if (checks.openai !== true && checks.openaiEnv !== true) hardFailures.push("openai");
  if (checks.requiredKeysPresent === false) hardFailures.push("requiredKeysPresent");
  if (checks.metaEnv === false) hardFailures.push("metaEnv");

  const report = {
    mode: "post-change-verify",
    serviceId: args.serviceId,
    baseUrl: base,
    generatedAt: new Date().toISOString(),
    ok: hardFailures.length === 0,
    hardFailures,
    checks: {
      health: checks.health,
      database: checks.database,
      login: checks.login,
      loginSurface: checks.loginSurface,
      stripe: checks.stripe,
      resend: checks.resend,
      openai: checks.openai,
      site: checks.site,
      metaEnv: checks.metaEnv,
      metaCapiEnv: checks.metaCapiEnv,
      stripeEnv: checks.stripeEnv,
      resendEnv: checks.resendEnv,
      openaiEnv: checks.openaiEnv,
      requiredKeysPresent: checks.requiredKeysPresent,
      noRequiredKeyDisappeared: checks.noRequiredKeyDisappeared,
      missingRequired: checks.missingRequired || [],
      missingProtected: checks.missingProtected || []
    },
    readinessStatus: readiness.status,
    note:
      checks.metaCapiEnv === false
        ? "META_CAPI_ACCESS_TOKEN absent (owner may add later); pixel still required"
        : undefined
  };
  assertNoSecretValues(report);
  console.log(JSON.stringify(report, null, 2));

  appendAuditLog({
    action: "verify",
    actor: process.env.AUDIT_ACTOR || "agent",
    serviceId: args.serviceId,
    ok: report.ok,
    hardFailures,
    missingRequired: checks.missingRequired || [],
    missingProtected: checks.missingProtected || [],
    preflightPassed: checks.requiredKeysPresent !== false
  });

  if (!report.ok) {
    console.error("VERIFY FAILED — do not deploy or restart until resolved.");
    process.exit(1);
  }
  console.error("VERIFY PASSED.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
