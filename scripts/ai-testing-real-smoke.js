#!/usr/bin/env node
/**
 * Phase 23 — AI Testing REAL smoke test (manual only, never part of the
 * automated regression suite in spirit even though it lives under `test:*`).
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
 * Safe by construction:
 *   - Skips (exit code 0, not a failure) unless BOTH a real OPENAI_API_KEY
 *     AND an explicit AI_TESTING_REAL_SMOKE_CONFIRM=yes are present. Simply
 *     having OPENAI_API_KEY set in the environment for some other reason is
 *     never enough by itself to spend real money.
 *   - Spins up its own throwaway server on a random port with a temp
 *     local-json store — never touches server/data/launch-store.json, a
 *     real database, or any already-running dev server.
 *   - Uses a non-production SITE_URL, so this is exercising exactly the
 *     same "testing host" path a real tester would use.
 *   - Also spins up a SECOND server with a production-style SITE_URL to
 *     re-confirm, live, that the production lock still stands (zero real
 *     network calls made in that second pass — this is the same guarantee
 *     scripts/test-ai-testing-openai-integration.js's mocked "Production AI
 *     rejection" check makes, just re-verified here against the real
 *     provider client code path instead of a mock).
 *   - Makes at most 4 real calls total (one per workflow type), each on a
 *     short, obviously-fake fixture note. Prints the exact token usage and
 *     estimated cost for every call so a human can see precisely what was
 *     spent.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... AI_TESTING_REAL_SMOKE_CONFIRM=yes \
 *     npm run test:ai-testing-real-smoke
 *
 * Optional:
 *   OPENAI_MODEL=gpt-4o-mini (default if unset)
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 23400 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-ai-real-smoke-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "ai-real-smoke-admin@example.invalid", password: "ai-real-smoke-pass", code: "ai-real-smoke-code" };

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
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
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
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

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
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

async function enableAiTesting(token) {
  const auth = { Authorization: `Bearer ${token}` };
  const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
  await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
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

async function main() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const confirmed = String(process.env.AI_TESTING_REAL_SMOKE_CONFIRM || "").trim().toLowerCase() === "yes";

  if (!apiKey || !confirmed) {
    console.log("SKIPPED — this is a manual-only smoke test that makes real, billed calls to api.openai.com.");
    console.log("To run it on purpose:");
    console.log("  OPENAI_API_KEY=sk-... AI_TESTING_REAL_SMOKE_CONFIRM=yes npm run test:ai-testing-real-smoke");
    if (!apiKey) console.log("(missing: OPENAI_API_KEY)");
    if (!confirmed) console.log('(missing: AI_TESTING_REAL_SMOKE_CONFIRM=yes)');
    process.exitCode = 0;
    return;
  }

  console.log(`Model under test: ${process.env.OPENAI_MODEL || "gpt-4o-mini"}`);
  console.log("This will make a small number of REAL, billed OpenAI calls using fixture-only text.\n");

  // ---- Pass 1: production lock, verified live (zero real network calls) --
  {
    const child = startServer({ OPENAI_API_KEY: apiKey, SITE_URL: "https://littlelearnershubbyleah.com" });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
      const status = await requestJson("GET", "/api/ai-testing/status", null, auth);
      assert.equal(status.json.enabled, false, "AI testing must show disabled on a production-style host even with a real key present");
      assert.equal(status.json.reason, "production_locked");
      const interpret = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: "test note", organizationId: "org_x" }, auth);
      assert.equal(interpret.json.usedFallback, true, "production must fall back to the heuristic — the real key must never be used here");
      console.log("PASS  Production lock re-verified live: a real key present + production hostname = zero real network calls, heuristic fallback used.");
    } finally {
      await stopServer(child);
    }
  }

  // ---- Pass 2: the real calls, on a non-production testing host ---------
  const child = startServer({ OPENAI_API_KEY: apiKey });
  let totalCostCents = 0;
  let totalTokens = 0;
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const auth = await enableAiTesting(adminLogin.json.token);

    const status = await requestJson("GET", "/api/ai-testing/status", null, auth);
    assert.equal(status.json.enabled, true, "AI testing should report enabled on a non-production host with a real key and the flag on");
    console.log(`PASS  Status check: enabled=true, model=${status.json.model}, hasApiKey=${status.json.hasApiKey}\n`);

    for (const call of REAL_CALLS) {
      const started = Date.now();
      const res = await requestJson("POST", call.path, call.body, auth);
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

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
