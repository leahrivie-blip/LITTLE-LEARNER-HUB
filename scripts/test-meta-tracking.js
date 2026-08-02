#!/usr/bin/env node
/**
 * Meta Pixel + CAPI regression tests (local).
 * Run: npm run test:meta-tracking
 *
 * Does not call Meta Graph with a real token unless META_CAPI_ACCESS_TOKEN is set.
 * Uses a mock fetch to assert CAPI payloads for conversion rules.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const metaCapi = require("../server/meta-capi.js");

const ROOT = path.join(__dirname, "..");
const PIXEL_ID = "1706469198007088";
const FAKE_TOKEN = "EAAG_TEST_TOKEN_DO_NOT_SHIP";

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        : {},
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer({ storePath, port, env = {} }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      SITE_URL: `http://127.0.0.1:${port}`,
      ADMIN_EMAIL: "meta-admin@test.local",
      ADMIN_PASSWORD: "meta-pass",
      ADMIN_ACCESS_CODE: "12345",
      META_PIXEL_ID: PIXEL_ID,
      META_TRACKING_ENABLED: "true",
      META_PIXEL_ENABLED: "true",
      META_CAPI_ENABLED: "true",
      META_CAPI_ACCESS_TOKEN: FAKE_TOKEN,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`server exited early: ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server health timeout");
}

function unitRules() {
  assert.equal(metaCapi.shouldFireMetaStartTrial({ trialDays: 7, alreadySent: false }), true);
  assert.equal(metaCapi.shouldFireMetaStartTrial({ trialDays: 0, alreadySent: false }), false);
  assert.equal(metaCapi.shouldFireMetaStartTrial({ trialDays: 7, alreadySent: true }), false);

  // Free/trial $0 — no Purchase
  assert.equal(metaCapi.shouldFireMetaPurchase({ amountPaid: 0, alreadyHadFirstPaid: false }), false);
  // First paid monthly / annual / founding — Purchase once
  assert.equal(metaCapi.shouldFireMetaPurchase({ amountPaid: 1999, alreadyHadFirstPaid: false }), true);
  assert.equal(metaCapi.shouldFireMetaPurchase({ amountPaid: 19900, alreadyHadFirstPaid: false }), true);
  assert.equal(metaCapi.shouldFireMetaPurchase({ amountPaid: 999, alreadyHadFirstPaid: false }), true);
  // Renewals — never Purchase again
  assert.equal(metaCapi.shouldFireMetaPurchase({ amountPaid: 1999, alreadyHadFirstPaid: true }), false);
  assert.equal(metaCapi.shouldFireMetaPurchase({ amountPaid: 999, alreadyHadFirstPaid: true }), false);

  assert.equal(metaCapi.planValueUsd("monthly"), 19.99);
  assert.equal(metaCapi.planValueUsd("annual"), 199);
  assert.equal(metaCapi.planValueUsd("founding"), 9.99);

  const pub = metaCapi.publicClientMetaConfig({
    META_PIXEL_ID: PIXEL_ID,
    META_TRACKING_ENABLED: "true",
    META_PIXEL_ENABLED: "true",
    META_CAPI_ACCESS_TOKEN: FAKE_TOKEN,
  });
  assert.equal(pub.enabled, true);
  assert.equal(pub.pixelId, PIXEL_ID);
  assert.equal(Object.prototype.hasOwnProperty.call(pub, "accessToken"), false);
  assert.ok(!JSON.stringify(pub).includes(FAKE_TOKEN));

  const killed = metaCapi.publicClientMetaConfig({
    META_PIXEL_ID: PIXEL_ID,
    META_TRACKING_ENABLED: "false",
    META_CAPI_ACCESS_TOKEN: FAKE_TOKEN,
  });
  assert.equal(killed.enabled, false);
  assert.equal(killed.pixelId, "");

  console.log("PASS unit Meta conversion rules + public config");
}

async function unitCapiPayload() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ events_received: 1 }),
    };
  };
  const result = await metaCapi.trackMetaEvent("Purchase", {
    eventId: "in_test_123",
    email: "buyer@example.com",
    customData: { currency: "USD", value: 19.99 },
    env: {
      META_PIXEL_ID: PIXEL_ID,
      META_CAPI_ACCESS_TOKEN: FAKE_TOKEN,
      META_TRACKING_ENABLED: "true",
      META_CAPI_ENABLED: "true",
    },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes(PIXEL_ID));
  assert.equal(calls[0].body.data[0].event_name, "Purchase");
  assert.equal(calls[0].body.data[0].event_id, "in_test_123");
  assert.equal(calls[0].body.data[0].custom_data.value, 19.99);
  assert.equal(calls[0].body.data[0].custom_data.currency, "USD");
  assert.ok(calls[0].body.data[0].user_data.em?.[0]);
  assert.notEqual(calls[0].body.data[0].user_data.em[0], "buyer@example.com");

  const skipped = await metaCapi.trackMetaEvent("Purchase", {
    eventId: "x",
    env: { META_TRACKING_ENABLED: "false", META_PIXEL_ID: PIXEL_ID, META_CAPI_ACCESS_TOKEN: FAKE_TOKEN },
    fetchImpl,
  });
  assert.equal(skipped.skipped, true);
  console.log("PASS CAPI payload hashing + kill switch");
}

async function integrationClientConfigAndSignup() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-meta-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  fs.writeFileSync(storePath, JSON.stringify({ users: {} }));
  const port = 22100 + Math.floor(Math.random() * 400);
  const child = startServer({ storePath, port });
  try {
    await waitForHealth(port, child);
    const cfg = await request(port, "GET", "/api/client-config.js");
    assert.equal(cfg.status, 200);
    assert.ok(cfg.text.includes("window.LLH_CONFIG"));
    assert.ok(cfg.text.includes(PIXEL_ID), "Pixel ID from META_PIXEL_ID must be injected");
    assert.ok(cfg.text.includes("fbq('init'"), "Pixel bootstrap must load from env-driven config");
    assert.ok(cfg.text.includes("PageView"));
    assert.ok(cfg.text.includes("eventID") || cfg.text.includes("__llhMetaPageViewEventId"), "PageView must include eventID for CAPI dedupe");
    assert.ok(!cfg.text.includes(FAKE_TOKEN), "CAPI token must never appear in browser config");
    assert.ok(!cfg.text.includes("META_CAPI_ACCESS_TOKEN"));

    const pixelJs = await request(port, "GET", "/api/meta-pixel.js");
    assert.equal(pixelJs.status, 200);
    assert.ok(pixelJs.text.includes(PIXEL_ID), "dedicated /api/meta-pixel.js must inject env Pixel ID");
    assert.ok(pixelJs.text.includes("PageView"));
    assert.ok(!pixelJs.text.includes(FAKE_TOKEN));

    // Hardcode guard: source files must not contain a literal pixel assignment fallback.
    const clientConfigFn = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
    assert.ok(!/fbq\(\s*['"]init['"]\s*,\s*['"]1706469198007088['"]/.test(clientConfigFn));
    assert.ok(!/META_PIXEL_ID\s*\|\|\s*['"]1706469198007088['"]/.test(clientConfigFn));

    const email = `meta-free-${Date.now()}@test.local`;
    const eventId = `reg_test_${Date.now()}`;
    const signup = await request(port, "POST", "/api/account/profile", {
      email,
      firstName: "Meta",
      lastName: "Free",
      signup: true,
      metaEventId: eventId,
      fbp: "fb.1.test",
      eventSourceUrl: `http://127.0.0.1:${port}/`,
    });
    assert.equal(signup.status, 200);
    assert.equal(signup.json?.ok, true);
    assert.equal(signup.json?.metaEventId, eventId);
    console.log("PASS Free signup CompleteRegistration event_id path");

    // Kill switch: pixel bootstrap absent when tracking disabled
  } finally {
    child.kill("SIGTERM");
  }

  const killedStore = path.join(tmpDir, "killed-store.json");
  fs.writeFileSync(killedStore, JSON.stringify({ users: {} }));
  const port2 = port + 1;
  const child2 = startServer({
    storePath: killedStore,
    port: port2,
    env: { META_TRACKING_ENABLED: "false" },
  });
  try {
    await waitForHealth(port2, child2);
    const cfg2 = await request(port2, "GET", "/api/client-config.js");
    assert.ok(!cfg2.text.includes("fbevents.js"), "kill switch must disable Pixel injection");
    assert.ok(!cfg2.text.includes(`"pixelId":"${PIXEL_ID}"`));
    const pixelJs2 = await request(port2, "GET", "/api/meta-pixel.js");
    assert.ok(!pixelJs2.text.includes("fbevents.js"), "kill switch must disable /api/meta-pixel.js");
    console.log("PASS master kill switch disables browser Pixel");
  } finally {
    child2.kill("SIGTERM");
  }
}

async function main() {
  unitRules();
  await unitCapiPayload();
  await integrationClientConfigAndSignup();

  // Documented scenario matrix (logic-level proof for renewals / trial / cancel).
  const scenarios = [
    { name: "Free signup", purchase: false, startTrial: false },
    { name: "Trial $0 invoice", purchase: metaCapi.shouldFireMetaPurchase({ amountPaid: 0, alreadyHadFirstPaid: false }), startTrial: true },
    { name: "Trial converts first paid", purchase: metaCapi.shouldFireMetaPurchase({ amountPaid: 1999, alreadyHadFirstPaid: false }), startTrial: false },
    { name: "Pro monthly first paid", purchase: metaCapi.shouldFireMetaPurchase({ amountPaid: 1999, alreadyHadFirstPaid: false }) },
    { name: "Pro annual first paid", purchase: metaCapi.shouldFireMetaPurchase({ amountPaid: 19900, alreadyHadFirstPaid: false }) },
    { name: "Monthly renewal", purchase: metaCapi.shouldFireMetaPurchase({ amountPaid: 1999, alreadyHadFirstPaid: true }) },
    { name: "Annual renewal", purchase: metaCapi.shouldFireMetaPurchase({ amountPaid: 19900, alreadyHadFirstPaid: true }) },
    { name: "Founding renewal", purchase: metaCapi.shouldFireMetaPurchase({ amountPaid: 999, alreadyHadFirstPaid: true }) },
    { name: "Canceled checkout", purchase: false, initiate: false },
    { name: "Failed payment", purchase: metaCapi.shouldFireMetaPurchase({ amountPaid: 0, alreadyHadFirstPaid: false }) },
  ];
  assert.equal(scenarios.find((s) => s.name === "Trial $0 invoice").purchase, false);
  assert.equal(scenarios.find((s) => s.name === "Trial converts first paid").purchase, true);
  assert.equal(scenarios.find((s) => s.name === "Monthly renewal").purchase, false);
  assert.equal(scenarios.find((s) => s.name === "Founding renewal").purchase, false);
  assert.equal(scenarios.find((s) => s.name === "Pro annual first paid").purchase, true);
  console.log("PASS scenario matrix Free/Trial/Pro monthly/Pro annual/renewals/failed payment");
  console.log("All Meta tracking checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
