#!/usr/bin/env node
/**
 * Unit + light integration tests for read-only production monitoring.
 * Run: npm run test:production-monitoring
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createProductionMonitoring } = require("../server/production-monitoring.js");

const ROOT = path.join(__dirname, "..");

function requestJson(port, method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port, child, tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function unitTests() {
  const monitor = createProductionMonitoring({
    windowMs: 60_000,
    errorSpikeCount: 3,
    errorSpikeRate: 0.5,
    memoryCriticalMb: 10_000,
    dbSizeCriticalMb: 10_000,
    metaSilenceHours: 24,
    webhookFailWindowMs: 60_000,
    alertCooldownMs: 1,
    alertsEnabled: true,
  });

  monitor.recordHttpStatus(200, "/api/health");
  monitor.recordHttpStatus(200, "/lessons");
  monitor.recordHttpStatus(500, "/api/foo");
  monitor.recordHttpStatus(502, "/api/bar");
  monitor.recordHttpStatus(503, "/api/baz");
  const httpStats = monitor.httpWindowStats();
  assert.equal(httpStats.failed5xx, 3);
  assert.ok(httpStats.total >= 3);

  monitor.recordStripeWebhookFailure("invoice.paid", "boom");

  const snapshot = await monitor.buildSnapshot({
    getStore: () => ({
      metaTrackingEvents: [{
        eventName: "PageView",
        ok: true,
        skipped: false,
        createdAt: new Date().toISOString(),
      }],
    }),
    getMetaConfig: () => ({
      pixelId: "1400795025275614",
      accessToken: "secret",
      pixelEnabled: true,
      capiEnabled: true,
    }),
    isDatabaseReady: () => true,
    getDatabaseProvider: () => "postgres",
    getDatabaseSizeMb: async () => 100,
    getHealthHints: () => ({ websiteOk: true }),
  });

  assert.equal(snapshot.checks.length, 7);
  const byId = Object.fromEntries(snapshot.checks.map((c) => [c.id, c]));
  assert.equal(byId.error_rate_5xx.ok, false);
  assert.equal(byId.stripe_webhooks.ok, false);
  assert.equal(byId.website_health.ok, true);
  assert.equal(byId.database.ok, true);
  assert.equal(byId.memory.ok, true);
  assert.equal(byId.database_storage.ok, true);
  assert.equal(byId.meta_tracking.ok, true);

  const due = monitor.alertsDue(snapshot);
  assert.ok(due.some((c) => c.id === "error_rate_5xx"));
  assert.ok(due.some((c) => c.id === "stripe_webhooks"));
  const email = monitor.formatAlertEmail(snapshot, due, "https://example.com");
  assert.match(email.subject, /LLH Alert/);
  assert.match(email.text, /Stripe webhook/);
  monitor.markAlertsSent(due);
  assert.equal(monitor.alertsDue(snapshot).length, 0);
  console.log("PASS production-monitoring unit checks");
}

async function integrationTest() {
  const storePath = path.join(os.tmpdir(), `llh-monitor-${crypto.randomBytes(4).toString("hex")}.json`);
  const port = 19800 + Math.floor(Math.random() * 200);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {},
    analyticsEvents: [],
    metaTrackingEvents: [],
    foundingMembers: [],
  }));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      ADMIN_EMAIL: "owner@monitor.test",
      ADMIN_PASSWORD: "monitor-pass",
      ADMIN_ACCESS_CODE: "99999",
      MONITOR_ALERTS_ENABLED: "false",
      MONITOR_CHECK_INTERVAL_MS: "600000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHealth(port, child);
    const unauth = await requestJson(port, "GET", "/api/admin/production-monitoring");
    assert.equal(unauth.status, 401);

    const login = await requestJson(port, "POST", "/api/admin/login", {
      body: {
        email: "owner@monitor.test",
        password: "monitor-pass",
        accessCode: "99999",
        code: "99999",
      },
    });
    assert.equal(login.status, 200, `login failed ${login.text?.slice(0, 300)}`);
    const token = login.json?.token || login.json?.adminToken;
    assert.ok(token, "admin token missing");

    const mon = await requestJson(port, "GET", "/api/admin/production-monitoring", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(mon.status, 200, mon.text?.slice(0, 300));
    assert.ok(mon.json?.monitoring?.checks?.length >= 7);
    assert.ok(["healthy", "attention", "critical"].includes(mon.json.monitoring.overall));
    assert.ok(!JSON.stringify(mon.json).includes("META_CAPI_ACCESS_TOKEN"));
    console.log("PASS production-monitoring admin API");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

async function main() {
  await unitTests();
  await integrationTest();
  const adminWs = fs.readFileSync(path.join(ROOT, "admin-workspace.js"), "utf8");
  assert.match(adminWs, /production-monitoring/);
  assert.match(adminWs, /Production monitoring/);
  const indexJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(indexJs, /\/api\/admin\/production-monitoring/);
  assert.match(indexJs, /recordStripeWebhookFailure/);
  console.log("PASS production-monitoring wiring");
  console.log("All production-monitoring checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
