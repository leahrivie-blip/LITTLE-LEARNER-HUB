#!/usr/bin/env node
/**
 * AI reliability regression: tool normalization, request IDs, health endpoint, guards.
 * Run: npm run test:ai-reliability
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4480 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-ai-reliability-${crypto.randomBytes(4).toString("hex")}.json`);
const PRO_USER = "ai-reliability-pro@example.com";
const ADMIN_TOKEN = "test-admin-token";

function request(method, urlPath, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${PORT}${urlPath}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(serverJs, /function normalizeAiToolId/);
  assert.match(serverJs, /function createAiRequestId/);
  assert.match(serverJs, /max_output_tokens/);
  assert.match(serverJs, /\/api\/admin\/ai-health/);
  assert.match(serverJs, /behaviorNote/);
  assert.match(serverJs, /incidentReport/);
  assert.match(appJs, /let aiGenerationInFlight = false/);
  assert.match(appJs, /data-doc-draft-action/);
  assert.match(appJs, /adminAiHealthConfig/);
  assert.match(appJs, /"behavior-note": "behaviorNote"/);
  assert.match(indexHtml, /docHelperDraftActions/);
  assert.match(indexHtml, /adminAiHealthApp/);

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [PRO_USER]: {
        email: PRO_USER,
        plan: "Pro",
        subscriptionStatus: "Active",
        stripeSubscriptionStatus: "active",
        internalAccessOverride: true,
      },
    },
    aiSettings: {
      masterEnabled: true,
      tools: {
        behaviorNote: { enabled: false, generationLimit: null, fallbackMessage: "Behavior notes are temporarily unavailable." },
        observation: { enabled: true, generationLimit: null, fallbackMessage: "" },
      },
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverLog = "";
  child.stdout.on("data", (chunk) => { serverLog += chunk; });
  child.stderr.on("data", (chunk) => { serverLog += chunk; });

  try {
    await waitForHealth();

    const missingKey = await request("POST", "/api/ai-generate", {
      body: { email: PRO_USER, tool: "behavior", prompt: "Child shared a toy.", age: "Preschool" },
    });
    assert.equal(missingKey.status, 503);
    assert.match(missingKey.json.error || "", /not available|unavailable/i);
    assert.ok(missingKey.json.requestId, "failure responses should include requestId");

    const login = await request("POST", "/api/admin/login", {
      body: { email: "admin@example.com", password: "test-password", code: "test-code" },
    });
    assert.equal(login.status, 200);
    const token = login.json.token;
    assert.ok(token);

    const saveSettings = await request("POST", "/api/admin/ai-settings", {
      headers: { Authorization: `Bearer ${token}` },
      body: {
        aiSettings: {
          masterEnabled: true,
          tools: {
            observation: { enabled: true, generationLimit: null, fallbackMessage: "" },
            lesson: { enabled: true, generationLimit: null, fallbackMessage: "" },
            daily: { enabled: true, generationLimit: null, fallbackMessage: "" },
            parentMessage: { enabled: true, generationLimit: null, fallbackMessage: "" },
            activity: { enabled: true, generationLimit: null, fallbackMessage: "" },
            behaviorNote: { enabled: false, generationLimit: null, fallbackMessage: "Behavior notes are temporarily unavailable." },
            incidentReport: { enabled: true, generationLimit: null, fallbackMessage: "" },
          },
        },
      },
    });
    assert.equal(saveSettings.status, 200);

    const disabledTool = await request("POST", "/api/ai-generate", {
      body: { email: PRO_USER, tool: "behavior-note", prompt: "Child used words instead of hitting.", age: "Preschool" },
    });
    assert.equal(disabledTool.status, 503);
    assert.match(disabledTool.json.error || "", /Behavior notes are temporarily unavailable/);
    assert.ok(disabledTool.json.requestId);

    const healthDenied = await request("GET", "/api/admin/ai-health");
    assert.equal(healthDenied.status, 401);

    const health = await request("GET", "/api/admin/ai-health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(health.status, 200);
    assert.equal(health.json.aiHealth.provider, "openai");
    assert.equal(typeof health.json.aiHealth.operational, "boolean");
    assert.ok(health.json.aiHealth.toolSettings.behaviorNote);

    console.log("test-ai-reliability: all checks passed");
  } finally {
    child.kill("SIGTERM");
    if (serverLog.trim()) {
      console.error(serverLog.slice(-4000));
    }
  }
}

main().catch((error) => {
  console.error("test-ai-reliability failed:", error.message || error);
  process.exit(1);
});
