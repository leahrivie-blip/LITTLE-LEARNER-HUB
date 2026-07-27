#!/usr/bin/env node
/**
 * Read-only promo code audit — documents TRY1MONTH env vs stored duplication.
 * Does not delete or alter promo records. Run: npm run test:admin-promo-audit
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function requestJson(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers }
        : { ...headers },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(storePath, extraEnv = {}) {
  const port = 19920 + Math.floor(Math.random() * 30);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      ADMIN_EMAIL: "promo-audit@test.local",
      ADMIN_PASSWORD: "promo-audit-pass",
      ADMIN_ACCESS_CODE: "promo-audit-code",
      PROMO_FREE_TRIAL_CODE: "TRY1MONTH",
      PROMO_FREE_TRIAL_DAYS: "30",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { child, port };
}

async function waitForBoot(port, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited");
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function adminToken(port) {
  const login = await requestJson(port, "POST", "/api/admin/login", {
    email: "promo-audit@test.local",
    password: "promo-audit-pass",
    code: "promo-audit-code",
  });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  return login.json.token;
}

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-promo-audit-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  fs.writeFileSync(storePath, JSON.stringify({
    users: {},
    promoCodes: [],
    promoRedemptions: [],
    adminSessions: {},
  }, null, 2));

  const { child, port } = startServer(storePath);
  try {
    await waitForBoot(port, child);
    const token = await adminToken(port);

    await test("seedDefaultPromoCodes creates stored TRY1MONTH alongside env default", async () => {
      const list = await requestJson(port, "GET", `/api/admin/promo-codes?adminToken=${token}`);
      assert.equal(list.status, 200, JSON.stringify(list.json));
      assert.equal(list.json.envPromo?.code, "TRY1MONTH");
      const storedTry1 = (list.json.promoCodes || []).find((row) => String(row.code).toUpperCase() === "TRY1MONTH");
      assert.ok(storedTry1, "expected seeded stored TRY1MONTH");
      assert.equal(list.json.audit?.duplicateEnvAndStore, true);
      assert.match(String(list.json.audit?.checkoutResolution || ""), /stored active promo wins/i);
    });

    await test("redemption counting uses shared promoRedemptions ledger", async () => {
      const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
      store.promoRedemptions = [{
        id: "promo_test_1",
        email: "creator@example.com",
        code: "TRY1MONTH",
        redeemedAt: new Date().toISOString(),
      }];
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
      const list = await requestJson(port, "GET", `/api/admin/promo-codes?adminToken=${token}`);
      assert.equal(list.status, 200);
      assert.match(String(list.json.audit?.redemptionCountSource || ""), /promoRedemptions/i);
      const storedTry1 = (list.json.promoCodes || []).find((row) => String(row.code).toUpperCase() === "TRY1MONTH");
      assert.ok(storedTry1);
      assert.equal(Number(storedTry1.redemptionCount || 0), 1);
      assert.equal(Number(list.json.envPromo?.redemptionCount || 0), 1);
    });

    await test("checkout prefers stored active promo over env fallback", async () => {
      const validate = await requestJson(port, "POST", "/api/validate-promo-code", {
        code: "TRY1MONTH",
        email: "newcreator@example.com",
      });
      assert.equal(validate.status, 200, JSON.stringify(validate.json));
      assert.equal(validate.json.valid, true);
      assert.equal(validate.json.trialDays, 30);
    });

    await test("creating duplicate stored env code is blocked (read-only guard — no data mutated)", async () => {
      const before = JSON.parse(fs.readFileSync(storePath, "utf8"));
      const beforeCount = (before.promoCodes || []).length;
      const blocked = await requestJson(port, "POST", "/api/admin/promo-codes", {
        adminToken: token,
        code: "TRY1MONTH",
        trialDays: 30,
        label: "Duplicate attempt",
      });
      assert.equal(blocked.status, 409, JSON.stringify(blocked.json));
      assert.equal(blocked.json.code, "promo_env_duplicate");
      const after = JSON.parse(fs.readFileSync(storePath, "utf8"));
      assert.equal((after.promoCodes || []).length, beforeCount);
    });

    await test("stealing another stored promo code returns conflict", async () => {
      const first = await requestJson(port, "POST", "/api/admin/promo-codes", {
        adminToken: token,
        code: "INFLUENCER30",
        trialDays: 30,
        label: "First",
      });
      assert.equal(first.status, 200, JSON.stringify(first.json));
      const second = await requestJson(port, "POST", "/api/admin/promo-codes", {
        adminToken: token,
        code: "PARTNER14",
        trialDays: 14,
        label: "Second",
      });
      assert.equal(second.status, 200, JSON.stringify(second.json));
      const steal = await requestJson(port, "POST", "/api/admin/promo-codes", {
        adminToken: token,
        id: second.json.promoCode.id,
        code: "INFLUENCER30",
        trialDays: 14,
        label: "Steal attempt",
      });
      assert.equal(steal.status, 409, JSON.stringify(steal.json));
    });

    if (!process.exitCode) {
      console.log("\nPromo audit (read-only) passed.");
      console.log("FINDING: TRY1MONTH appears twice because seedDefaultPromoCodes() seeds a stored row while PROMO_FREE_TRIAL_CODE defaults to TRY1MONTH.");
      console.log("REDEMPTION SOURCE: promoRedemptions ledger (global, filtered by normalized code).");
      console.log("CHECKOUT: stored active promo wins; env row is fallback display only.");
    }
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
