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
const {
  createProductionMonitoring,
  classifyThreshold,
  aggregateOverall,
  resolveMemoryThresholds,
} = require("../server/production-monitoring.js");

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

function byId(snapshot) {
  return Object.fromEntries((snapshot.checks || []).map((c) => [c.id, c]));
}

async function snapshotWithMemory(rssMb, hints = {}) {
  const monitor = createProductionMonitoring({
    memoryWarningMb: 220,
    memoryCriticalMb: 280,
    memoryCriticalMbAlias: 280,
    alertsEnabled: true,
    alertCooldownMs: 1,
    errorSpikeCount: 100,
    errorSpikeRate: 0.99,
    dbSizeCriticalMb: 10_000,
  });
  return monitor.buildSnapshot({
    getStore: () => ({}),
    getMetaConfig: () => ({}),
    isDatabaseReady: () => true,
    getDatabaseProvider: () => "local-json",
    getDatabaseSizeMb: async () => 10,
    getMemoryStats: () => ({
      rssMb,
      heapUsedMb: Math.min(rssMb, 100),
      maxOldSpaceMb: 300,
    }),
    getHealthHints: () => ({
      websiteOk: true,
      stripeWebhookSecretConfigured: true,
      stripeKeysConfigured: true,
      ...hints,
    }),
  });
}

async function unitTests() {
  assert.equal(classifyThreshold(100, { warningAt: 220, criticalAt: 280 }).state, "healthy");
  assert.equal(classifyThreshold(220, { warningAt: 220, criticalAt: 280 }).state, "warning");
  assert.equal(classifyThreshold(280, { warningAt: 220, criticalAt: 280 }).state, "critical");
  assert.equal(classifyThreshold(311, { warningAt: 220, criticalAt: 280 }).state, "critical");
  assert.equal(classifyThreshold(null, { warningAt: 220, criticalAt: 280 }).state, "unknown");
  assert.equal(aggregateOverall([{ state: "critical" }, { state: "healthy" }]), "critical");
  assert.equal(aggregateOverall([{ state: "warning" }, { state: "healthy" }]), "warning");
  assert.equal(aggregateOverall([{ state: "unknown" }, { state: "healthy" }]), "unknown");
  assert.equal(aggregateOverall([{ state: "healthy" }, { state: "healthy" }]), "healthy");

  // Standard (2GB): thresholds scale from instance RAM unless explicitly overridden.
  const prevInstance = process.env.MONITOR_INSTANCE_MEMORY_MB;
  const prevCritical = process.env.MONITOR_MEMORY_CRITICAL_MB;
  const prevWarning = process.env.MONITOR_MEMORY_WARNING_MB;
  delete process.env.MONITOR_MEMORY_CRITICAL_MB;
  delete process.env.MONITOR_MEMORY_WARNING_MB;
  process.env.MONITOR_INSTANCE_MEMORY_MB = "2048";
  const scaled = resolveMemoryThresholds({});
  assert.equal(scaled.thresholdMode, "instance-percent");
  assert.equal(scaled.memoryCriticalMb, Math.floor(2048 * 0.70));
  assert.equal(scaled.memoryWarningMb, Math.floor(2048 * 0.45));
  // ~300MB RSS (production steady-state) must be healthy on Standard — not critical.
  const standardSteady = await createProductionMonitoring({
    instanceMemoryMb: 2048,
    alertsEnabled: false,
  }).buildSnapshot({
    getStore: () => ({}),
    getMetaConfig: () => ({}),
    isDatabaseReady: () => true,
    getDatabaseProvider: () => "postgres",
    getDatabaseSizeMb: async () => 10,
    getMemoryStats: () => ({ rssMb: 300, heapUsedMb: 120, instanceMemoryMb: 2048, pctOfInstance: 14.6 }),
    getHealthHints: () => ({
      websiteOk: true,
      stripeWebhookSecretConfigured: true,
      stripeKeysConfigured: true,
    }),
  });
  assert.equal(byId(standardSteady).memory.state, "healthy", "300MB RSS on 2GB must be healthy");
  assert.notEqual(standardSteady.overall, "critical");
  if (prevInstance == null) delete process.env.MONITOR_INSTANCE_MEMORY_MB;
  else process.env.MONITOR_INSTANCE_MEMORY_MB = prevInstance;
  if (prevCritical == null) delete process.env.MONITOR_MEMORY_CRITICAL_MB;
  else process.env.MONITOR_MEMORY_CRITICAL_MB = prevCritical;
  if (prevWarning == null) delete process.env.MONITOR_MEMORY_WARNING_MB;
  else process.env.MONITOR_MEMORY_WARNING_MB = prevWarning;

  const below = await snapshotWithMemory(100);
  assert.equal(byId(below).memory.state, "healthy");
  assert.equal(below.overall === "critical", false);

  const warn = await snapshotWithMemory(220);
  assert.equal(byId(warn).memory.state, "warning");
  assert.equal(byId(warn).memory.status, "warning");
  assert.notEqual(warn.overall, "healthy");

  const critical = await snapshotWithMemory(280);
  assert.equal(byId(critical).memory.state, "critical");
  assert.equal(critical.overall, "critical");
  assert.match(byId(critical).memory.recommendedAction || "", /Restart|Render|memory|Thresholds|instance/i);

  const above = await snapshotWithMemory(311);
  assert.equal(byId(above).memory.state, "critical");
  assert.equal(above.overall, "critical");
  assert.equal(above.ok, false);

  const missingMem = await snapshotWithMemory(null);
  assert.equal(byId(missingMem).memory.state, "unknown");
  assert.notEqual(missingMem.overall, "healthy");

  const stripeHealthy = await snapshotWithMemory(100, {
    stripeWebhookSecretConfigured: true,
    stripeKeysConfigured: true,
  });
  assert.equal(byId(stripeHealthy).stripe_webhooks.state, "healthy");
  assert.equal(byId(stripeHealthy).stripe_api_keys.state, "healthy");

  const stripeMissing = await snapshotWithMemory(100, {
    stripeWebhookSecretConfigured: false,
    stripeKeysConfigured: false,
  });
  assert.equal(byId(stripeMissing).stripe_webhooks.state, "not-configured");
  assert.equal(byId(stripeMissing).stripe_webhooks.status, "not-configured");
  assert.equal(byId(stripeMissing).stripe_api_keys.state, "not-configured");
  assert.notEqual(stripeMissing.overall, "healthy");

  const stripeUnknown = await snapshotWithMemory(100, {
    stripeWebhookSecretConfigured: null,
    stripeVerificationUnavailable: true,
    stripeKeysConfigured: null,
  });
  assert.equal(byId(stripeUnknown).stripe_webhooks.state, "unknown");
  assert.notEqual(stripeUnknown.overall, "healthy");

  const failingMonitor = createProductionMonitoring({
    memoryWarningMb: 220,
    memoryCriticalMb: 280,
    alertsEnabled: true,
    alertCooldownMs: 1,
    errorSpikeCount: 3,
    errorSpikeRate: 0.5,
    webhookFailWindowMs: 60_000,
    dbSizeCriticalMb: 10_000,
  });
  failingMonitor.recordHttpStatus(500, "/api/foo");
  failingMonitor.recordHttpStatus(502, "/api/bar");
  failingMonitor.recordHttpStatus(503, "/api/baz");
  failingMonitor.recordStripeWebhookFailure("invoice.paid", "boom");
  const failingSnap = await failingMonitor.buildSnapshot({
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
    getMemoryStats: () => ({ rssMb: 100, heapUsedMb: 80, maxOldSpaceMb: 300 }),
    getHealthHints: () => ({
      websiteOk: true,
      stripeWebhookSecretConfigured: true,
      stripeKeysConfigured: true,
    }),
  });
  const failing = byId(failingSnap);
  assert.equal(failing.error_rate_5xx.state, "critical");
  assert.equal(failing.stripe_webhooks.state, "critical");
  assert.equal(failingSnap.overall, "critical");
  const due = failingMonitor.alertsDue(failingSnap);
  assert.ok(due.some((c) => c.id === "error_rate_5xx"));
  assert.ok(due.some((c) => c.id === "stripe_webhooks"));
  const email = failingMonitor.formatAlertEmail(failingSnap, due, "https://example.com");
  assert.match(email.subject, /LLH Alert/);
  assert.match(email.text, /Stripe webhook/);
  failingMonitor.markAlertsSent(due);
  assert.equal(failingMonitor.alertsDue(failingSnap).length, 0);

  // Fresh monitor after recovery conditions — no residual failures.
  const recoveredMonitor = createProductionMonitoring({
    memoryWarningMb: 220,
    memoryCriticalMb: 280,
    alertsEnabled: true,
    alertCooldownMs: 1,
    errorSpikeCount: 100,
    errorSpikeRate: 0.99,
    dbSizeCriticalMb: 10_000,
  });
  const recovered = await recoveredMonitor.buildSnapshot({
    getStore: () => ({}),
    getMetaConfig: () => ({}),
    isDatabaseReady: () => true,
    getDatabaseProvider: () => "local-json",
    getDatabaseSizeMb: async () => 10,
    getMemoryStats: () => ({ rssMb: 100, heapUsedMb: 50, maxOldSpaceMb: 300 }),
    getHealthHints: () => ({
      websiteOk: true,
      stripeWebhookSecretConfigured: true,
      stripeKeysConfigured: true,
    }),
  });
  assert.notEqual(recovered.overall, "critical");
  assert.equal(recoveredMonitor.alertsDue(recovered).length, 0);
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
    assert.ok(["healthy", "warning", "attention", "critical", "unknown"].includes(mon.json.monitoring.overall));
    const mem = (mon.json.monitoring.checks || []).find((c) => c.id === "memory");
    assert.ok(mem, "memory check present");
    assert.ok(["healthy", "warning", "critical", "unknown"].includes(mem.state));
    if (mem.state === "critical") {
      assert.equal(mon.json.monitoring.overall, "critical");
      assert.ok(mem.recommendedAction);
    }
    const stripe = (mon.json.monitoring.checks || []).find((c) => c.id === "stripe_webhooks");
    assert.ok(stripe);
    assert.notEqual(stripe.state, "healthy"); // local test has no webhook secret → not-configured/unknown
    assert.ok(["not-configured", "unknown", "critical", "warning"].includes(stripe.state));
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
  assert.match(adminWs, /Configured and healthy/);
  assert.match(adminWs, /monitorCheckToCard/);
  assert.match(adminWs, /Not configured/);
  const indexJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(indexJs, /\/api\/admin\/production-monitoring/);
  assert.match(indexJs, /recordStripeWebhookFailure/);
  assert.match(indexJs, /stripeKeysConfigured/);
  console.log("PASS production-monitoring wiring");
  console.log("All production-monitoring checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
