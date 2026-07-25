#!/usr/bin/env node
/**
 * AI Testing REAL smoke test (manual only, never part of the automated
 * regression suite in spirit even though it lives under `test:*`).
 *
 * Every other AI-testing test in this repository (scripts/test-ai-testing-
 * openai-integration.js and friends) mocks the OpenAI transport via
 * AI_TESTING_MOCK_TRANSPORT_MODULE and makes ZERO real network calls. This
 * script is the deliberate, opt-in exception: it makes a small, fixed
 * number of REAL calls to api.openai.com, using real fixture-only text
 * (fake children, fake families — same "(Fixture)" naming convention as the
 * rest of the AI Testing scenario library), so a human can confirm the live
 * integration actually works end-to-end before relying on it.
 *
 * TWO modes:
 *
 * 1. LOCAL mode (default) — spins up its OWN throwaway server on a random
 *    port with a temp local-json store, using an OPENAI_API_KEY you pass on
 *    this command line. Useful for developing this feature itself, before
 *    anything is deployed. The key is only ever in THIS local process/shell.
 *
 * 2. REMOTE mode (AI_TESTING_SMOKE_TARGET_URL is set) — makes real HTTPS
 *    calls against an ALREADY-DEPLOYED testing service (e.g. Render). This
 *    is the mode to use to verify a real deployment. It NEVER needs the
 *    OpenAI key at all: the deployed service already has its own
 *    OPENAI_API_KEY configured server-side (as a Render secret/environment
 *    variable on that service, never entered here) — this script only logs
 *    in as the testing site's admin (a normal admin login, not the OpenAI
 *    key) and calls the same public AI Testing endpoints a real admin
 *    session would, letting the ALREADY-CONFIGURED server-side key do the
 *    work. Nothing about the OpenAI key ever appears in this script's
 *    command line, environment, terminal output, or logs, in this mode.
 *
 * Safe by construction:
 *   - Skips (exit code 0, not a failure) unless explicitly confirmed via
 *     AI_TESTING_REAL_SMOKE_CONFIRM=yes, AND (local mode: a real
 *     OPENAI_API_KEY; remote mode: a target URL + admin login).
 *   - Refuses to run in remote mode against anything that looks like the
 *     live production hostname, even if someone points it there by mistake.
 *   - Makes at most 4 real calls total (one per workflow type), each on a
 *     short, obviously-fake fixture note. Prints the exact token usage and
 *     estimated cost for every call so a human can see precisely what was
 *     spent — never the request/response content itself beyond the small,
 *     already-fixture-only summaries below.
 *
 * Usage (local):
 *   OPENAI_API_KEY=sk-... AI_TESTING_REAL_SMOKE_CONFIRM=yes \
 *     npm run test:ai-testing-real-smoke
 *
 * Usage (remote, against an already-deployed testing service — see
 * docs/TESTING_DEPLOYMENT_RENDER_STEPS.md for the exact safe procedure):
 *   AI_TESTING_SMOKE_TARGET_URL=https://little-learner-hub-testing.onrender.com \
 *   AI_TESTING_SMOKE_ADMIN_EMAIL=... AI_TESTING_SMOKE_ADMIN_PASSWORD=... AI_TESTING_SMOKE_ADMIN_CODE=... \
 *   AI_TESTING_REAL_SMOKE_CONFIRM=yes \
 *     npm run test:ai-testing-real-smoke
 *
 * Optional:
 *   OPENAI_MODEL=gpt-4o-mini (local mode only — remote mode always uses
 *   whatever OPENAI_MODEL is already configured on the deployed service)
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const expansionFeatureFlags = require("./expansion-feature-flags.js");

const ROOT = path.join(__dirname, "..");
const PORT = 23400 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-ai-real-smoke-${crypto.randomBytes(4).toString("hex")}.json`);
const LOCAL_ADMIN = { email: "ai-real-smoke-admin@example.invalid", password: "ai-real-smoke-pass", code: "ai-real-smoke-code" };

function requestJson(baseUrl, method, urlPath, body, headers = {}) {
  const payload = body ? JSON.stringify(body) : undefined;
  return fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: { ...headers, ...(payload ? { "Content-Type": "application/json" } : {}) },
    body: payload,
  }).then(async (res) => {
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json };
  });
}

function startServer(envOverrides = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: LOCAL_ADMIN.email,
      ADMIN_PASSWORD: LOCAL_ADMIN.password,
      ADMIN_ACCESS_CODE: LOCAL_ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      ALLOW_OPENAI_TESTING: "true",
      OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
      ...envOverrides,
      // Deliberately never set AI_TESTING_MOCK_TRANSPORT_MODULE here — this
      // is the one script in the repository that must NOT mock the transport.
      AI_TESTING_MOCK_TRANSPORT_MODULE: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(baseUrl, child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson(baseUrl, "GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited before becoming healthy");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function loginAsAdmin(baseUrl, admin) {
  const login = await requestJson(baseUrl, "POST", "/api/admin/login", admin);
  if (login.status !== 200 || !login.json?.token) {
    throw new Error(`Admin login failed against ${baseUrl} (status ${login.status}). Check the admin email/password/code.`);
  }
  return { Authorization: `Bearer ${login.json.token}` };
}

async function enableAiTesting(baseUrl, auth) {
  const siteContentGet = await requestJson(baseUrl, "GET", `/api/admin/site-content?adminToken=${auth.Authorization.slice(7)}`);
  await requestJson(baseUrl, "POST", "/api/admin/site-content", {
    adminToken: auth.Authorization.slice(7),
    siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { aiTesting: true, directorCenter: true, testingLab: true } },
  });
  return auth;
}

const REAL_CALLS = [
  {
    label: "Classroom Assistant — scraped knee (fixture)",
    path: "/api/ai-testing/classroom-assistant/interpret",
    body: { text: "Timmy Fixture fell on the playground and scraped his knee. We cleaned it with soap and water and put on a bandage. He was a little upset but calmed down after a few minutes.", organizationId: "org_real_smoke" },
    describe: (r) => `usedFallback=${r.usedFallback}, recordTypes=${JSON.stringify(r.aiRawResult?.recordTypes || [])}`,
  },
  {
    label: "Professional draft — end-of-day update (fixture)",
    path: "/api/ai-testing/draft",
    body: { text: "Overall a good day — Ben Fixture ate well at lunch, napped for about an hour, and spent the afternoon building with blocks.", draftType: "daily_report", organizationId: "org_real_smoke" },
    describe: (r) => `draftType=${r.result?.draftType}, subjectLength=${(r.result?.subject || "").length}`,
  },
  {
    label: "Lesson-plan assist — pasted weekly curriculum (fixture)",
    path: "/api/ai-testing/lesson-plan/assist",
    body: { text: "Monday: Colors Everywhere - sorting activity with color cards. Tuesday: Nature Walk - collect leaves, sort by shape. No materials list for Wednesday through Friday.", organizationId: "org_real_smoke" },
    describe: (r) => `organizedActivities=${(r.result?.organizedActivities || []).length}, missingFields=${(r.result?.missingFields || []).length}`,
  },
  {
    label: "Form Builder draft — sunscreen permission (fixture)",
    path: "/api/ai-testing/form-builder/draft",
    body: { text: "I need a simple form asking parents for permission to apply sunscreen before outdoor play.", organizationId: "org_real_smoke" },
    describe: (r) => `title=${r.result?.title}, sections=${(r.result?.sections || []).length}`,
  },
];

async function runRealCalls(baseUrl, auth) {
  let totalCostCents = 0;
  let totalTokens = 0;
  const status = await requestJson(baseUrl, "GET", "/api/ai-testing/status", null, auth);
  assert.equal(status.json.enabled, true, "AI testing should report enabled on a non-production host with a real key and the flag on");
  console.log(`PASS  Status check: enabled=true, model=${status.json.model}, hasApiKey=${status.json.hasApiKey}\n`);

  for (const call of REAL_CALLS) {
    const started = Date.now();
    const res = await requestJson(baseUrl, "POST", call.path, call.body, auth);
    const elapsedMs = Date.now() - started;
    if (res.status !== 200 || res.json?.ok === false || res.json?.usedFallback === true) {
      console.log(`FAIL  ${call.label}`);
      console.log(`      status=${res.status} body=${JSON.stringify(res.json)}`);
      process.exitCode = 1;
      continue;
    }
    const tokensUsed = res.json.tokensUsed || {};
    const costCents = Number(res.json.costCents || 0);
    totalCostCents += costCents;
    totalTokens += Number(tokensUsed.total || 0);
    console.log(`PASS  ${call.label}`);
    console.log(`      ${call.describe(res.json)}`);
    console.log(`      tokens=${JSON.stringify(tokensUsed)}  estimatedCost=${costCents.toFixed(4)}c  latency=${res.json.latencyMs || elapsedMs}ms`);
  }

  console.log(`\nTotal for this run: ~${totalTokens} tokens, ~${totalCostCents.toFixed(4)}c estimated.`);
  console.log("(Estimate only — check your OpenAI dashboard for the authoritative billed amount.)");
}

async function runRemote() {
  const targetUrl = String(process.env.AI_TESTING_SMOKE_TARGET_URL || "").trim().replace(/\/+$/, "");
  const adminEmail = String(process.env.AI_TESTING_SMOKE_ADMIN_EMAIL || "").trim();
  const adminPassword = String(process.env.AI_TESTING_SMOKE_ADMIN_PASSWORD || "").trim();
  const adminCode = String(process.env.AI_TESTING_SMOKE_ADMIN_CODE || "").trim();
  const confirmed = String(process.env.AI_TESTING_REAL_SMOKE_CONFIRM || "").trim().toLowerCase() === "yes";

  if (!adminEmail || !adminPassword || !confirmed) {
    console.log("SKIPPED — AI_TESTING_SMOKE_TARGET_URL is set, but admin login credentials and/or confirmation are missing.");
    console.log("Set AI_TESTING_SMOKE_ADMIN_EMAIL / AI_TESTING_SMOKE_ADMIN_PASSWORD / AI_TESTING_SMOKE_ADMIN_CODE (the testing site's own admin login — never the OpenAI key) and AI_TESTING_REAL_SMOKE_CONFIRM=yes.");
    if (!adminEmail || !adminPassword) console.log("(missing: AI_TESTING_SMOKE_ADMIN_EMAIL / AI_TESTING_SMOKE_ADMIN_PASSWORD)");
    if (!confirmed) console.log("(missing: AI_TESTING_REAL_SMOKE_CONFIRM=yes)");
    process.exitCode = 0;
    return;
  }

  // Refuse outright if this ever points at the real production hostname —
  // this is a REMOTE call over the real network, so this check matters even
  // though the local-mode "Pass 1" production-lock re-verification below is
  // skipped (there is no local server to spawn with a manipulated SITE_URL
  // in remote mode; the deployed target's own SITE_URL is fixed server-side
  // and is exactly what scripts/test-ai-testing-openai-integration.js's
  // "Production AI rejection" test already proves cannot be bypassed).
  if (expansionFeatureFlags.isLiveProductionSite(targetUrl)) {
    console.error(`REFUSED — AI_TESTING_SMOKE_TARGET_URL (${targetUrl}) looks like the live production hostname. This script will never run against production.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Remote mode: ${targetUrl}`);
  console.log("Using the deployed service's own server-side OPENAI_API_KEY (a Render secret on that service) — this script never sees or needs that key.");
  console.log("This will make a small number of REAL, billed OpenAI calls using fixture-only text.\n");

  const auth = await enableAiTesting(targetUrl, await loginAsAdmin(targetUrl, { email: adminEmail, password: adminPassword, code: adminCode }));
  await runRealCalls(targetUrl, auth);

  if (process.exitCode === 1) {
    console.log("\nOne or more real calls did not succeed — see FAIL lines above.");
  } else {
    console.log("\nAll real smoke calls succeeded against the deployed testing service.");
  }
}

async function runLocal() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const confirmed = String(process.env.AI_TESTING_REAL_SMOKE_CONFIRM || "").trim().toLowerCase() === "yes";

  if (!apiKey || !confirmed) {
    console.log("SKIPPED — this is a manual-only smoke test that makes real, billed calls to api.openai.com.");
    console.log("To run it locally:");
    console.log("  OPENAI_API_KEY=sk-... AI_TESTING_REAL_SMOKE_CONFIRM=yes npm run test:ai-testing-real-smoke");
    console.log("To run it against an already-deployed testing service instead (recommended — never exposes the OpenAI key locally):");
    console.log("  AI_TESTING_SMOKE_TARGET_URL=https://... AI_TESTING_SMOKE_ADMIN_EMAIL=... AI_TESTING_SMOKE_ADMIN_PASSWORD=... AI_TESTING_REAL_SMOKE_CONFIRM=yes npm run test:ai-testing-real-smoke");
    if (!apiKey) console.log("(missing: OPENAI_API_KEY)");
    if (!confirmed) console.log('(missing: AI_TESTING_REAL_SMOKE_CONFIRM=yes)');
    process.exitCode = 0;
    return;
  }

  const localBaseUrl = () => `http://127.0.0.1:${PORT}`;

  console.log(`Local mode. Model under test: ${process.env.OPENAI_MODEL || "gpt-4o-mini"}`);
  console.log("This will make a small number of REAL, billed OpenAI calls using fixture-only text.\n");

  // ---- Pass 1: production lock, verified live (zero real network calls) --
  {
    const child = startServer({ OPENAI_API_KEY: apiKey, SITE_URL: "https://littlelearnershubbyleah.com" });
    try {
      await waitForBoot(localBaseUrl(), child);
      const auth = await loginAsAdmin(localBaseUrl(), LOCAL_ADMIN);
      const status = await requestJson(localBaseUrl(), "GET", "/api/ai-testing/status", null, auth);
      assert.equal(status.json.enabled, false, "AI testing must show disabled on a production-style host even with a real key present");
      assert.equal(status.json.reason, "production_locked");
      const interpret = await requestJson(localBaseUrl(), "POST", "/api/ai-testing/classroom-assistant/interpret", { text: "test note", organizationId: "org_x" }, auth);
      assert.equal(interpret.json.usedFallback, true, "production must fall back to the heuristic — the real key must never be used here");
      console.log("PASS  Production lock re-verified live: a real key present + production hostname = zero real network calls, heuristic fallback used.");
    } finally {
      await stopServer(child);
    }
  }

  // ---- Pass 2: the real calls, on a non-production testing host ---------
  const child = startServer({ OPENAI_API_KEY: apiKey });
  try {
    await waitForBoot(localBaseUrl(), child);
    const auth = await enableAiTesting(localBaseUrl(), await loginAsAdmin(localBaseUrl(), LOCAL_ADMIN));
    await runRealCalls(localBaseUrl(), auth);
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  if (process.exitCode === 1) {
    console.log("\nOne or more real calls did not succeed — see FAIL lines above.");
  } else {
    console.log("\nAll real smoke calls succeeded.");
  }
}

async function main() {
  if (String(process.env.AI_TESTING_SMOKE_TARGET_URL || "").trim()) {
    await runRemote();
  } else {
    await runLocal();
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
