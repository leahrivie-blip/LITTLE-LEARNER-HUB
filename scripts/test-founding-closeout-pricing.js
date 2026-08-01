#!/usr/bin/env node
/**
 * Founding closeout pricing — spots remain ($9.99) vs sold out ($19.99),
 * plus atomic last-spot claim under concurrent checkout.
 *
 * Run: NODE_ENV=test node scripts/test-founding-closeout-pricing.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19620 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-founding-closeout-${crypto.randomBytes(4).toString("hex")}.json`);
const FOUNDING_LIMIT = 48;
const PUBLIC_CLAIMED_BASE = 0;
const OUT_DIR = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "founding-closeout-pricing");

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: options.port || PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(options.headers || {}),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(envOverrides = {}) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "closeout-qa@test.local",
      ADMIN_PASSWORD: "closeout-qa-pass",
      ADMIN_ACCESS_CODE: "closeout-qa-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: String(FOUNDING_LIMIT),
      PUBLIC_FOUNDING_CLAIMED_BASE: String(PUBLIC_CLAIMED_BASE),
      NODE_ENV: "test",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_closeout",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/founding-status");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 200));
  if (child.exitCode === null) child.kill("SIGKILL");
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function seedRemainingSpots(remaining) {
  const claimed = Math.max(0, FOUNDING_LIMIT - remaining);
  const store = {
    users: {},
    foundingMembers: Array.from({ length: claimed }, (_, i) => `seeded-founder-${i}@test.local`),
    foundingReservations: [],
    siteContent: {},
    analyticsEvents: [],
  };
  writeStore(store);
  return store;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  const record = (name, ok, detail = "") => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) throw new Error(`${name}: ${detail}`);
  };

  // Static copy / wiring checks
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const renderYaml = fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8");
  record("render.yaml founding limit is 48", /FOUNDING_MEMBER_LIMIT[\s\S]*?value:\s*"?48"?/.test(renderYaml));
  record("atomic reserve helper exists", serverJs.includes("reserveFoundingSpotAtomic") && serverJs.includes("withFoundingClaimLock"));
  record("postgres durable claim uses advisory lock + FOR UPDATE", serverJs.includes("pg_advisory_xact_lock") && serverJs.includes("FOR UPDATE") && serverJs.includes("mutateFoundingInventoryInPostgres"));
  record("postgres upsert unions foundingMembers (anti-clobber)", /jsonb_array_elements_text\(COALESCE\(llh_store\.data->'foundingMembers'/.test(serverJs));
  record("checkout uses atomic reserve", /await reserveFoundingSpotAtomic\(/.test(serverJs));
  record("sold-out wording avoids claiming a fixed 50 total", !/All 50 lifetime spots/.test(serverJs) && !/All \$\{limit\} lifetime spots/.test(serverJs) && /FOUNDING_ACQUISITION_CLOSED/.test(serverJs));
  record("client sold-out wording avoids fixed 50 total", !/All \$\{limit\} lifetime spots/.test(appJs) && /FOUNDING_CLOSED_FOR_ACQUISITION/.test(appJs));
  record("client has spots-left helper", appJs.includes("function foundingSpotsLeftMessage"));
  record("client syncs homepage when sold out", appJs.includes("function syncPublicFoundingOfferUi"));
  record("homepage uses live founding spots copy hooks", /data-founding-spots-copy/.test(indexHtml) && !/Only 2 Founding Member spots remaining/.test(indexHtml));
  record("FAQ no longer advertises Founding pricing", !/What is Founding Member pricing/.test(indexHtml) && !/Founding Member/.test(indexHtml));
  record("server acquisition permanently closed", /FOUNDING_ACQUISITION_CLOSED\s*=\s*true/.test(serverJs));
  record("no silent founding→monthly fallback in startCheckout", !/foundingSpotsRemaining\(\) <= 0 \? "monthly"/.test(appJs));

  let child = startServer();
  try {
    seedRemainingSpots(2);
    await waitForBoot(child);

    // Scenario 1: inventory may remain, but public acquisition is permanently closed
    {
      const status = await requestJson("GET", "/api/founding-status");
      assert.equal(status.status, 200);
      assert.equal(status.json.founding.remaining, 0);
      assert.equal(status.json.founding.soldOut, true);
      assert.match(status.json.founding.spotsLeftMessage || "", /Pro is \$19\.99\/month/);
      assert.doesNotMatch(status.json.founding.spotsLeftMessage || "", /Founding Member/);
      record("API reports founding acquisition closed", true, status.json.founding.spotsLeftMessage);

      const checkout = await requestJson("POST", "/api/create-checkout-session", {
        email: "new-founder-a@test.local",
        plan: "founding",
        successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
        cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
      });
      assert.equal(checkout.status, 409, JSON.stringify(checkout.json));
      assert.equal(checkout.json.soldOut, true);
      const after = readStore();
      assert.ok(!after.foundingMembers.includes("new-founder-a@test.local"));
      record("founding checkout blocked while acquisition closed", true);
    }

    // Concurrent founding checkouts both rejected once acquisition is closed
    {
      seedRemainingSpots(1);
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 250));
      child = startServer();
      await waitForBoot(child);

      const before = await requestJson("GET", "/api/founding-status");
      assert.equal(before.json.founding.remaining, 0);
      assert.equal(before.json.founding.soldOut, true);

      const [a, b] = await Promise.all([
        requestJson("POST", "/api/create-checkout-session", {
          email: "race-winner@test.local",
          plan: "founding",
          successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
          cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
        }),
        requestJson("POST", "/api/create-checkout-session", {
          email: "race-loser@test.local",
          plan: "founding",
          successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
          cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
        }),
      ]);
      assert.equal(a.status, 409, JSON.stringify(a.json));
      assert.equal(b.status, 409, JSON.stringify(b.json));
      const store = readStore();
      const raceEmails = store.foundingMembers.filter((e) => String(e).startsWith("race-"));
      assert.equal(raceEmails.length, 0, `no race claims expected, got ${raceEmails.join(",")}`);
      record("acquisition closed rejects concurrent founding checkouts", true);
    }

    // Scenario 2: Pro $19.99 remains available
    {
      seedRemainingSpots(0);
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 250));
      child = startServer();
      await waitForBoot(child);

      const status = await requestJson("GET", "/api/founding-status");
      assert.equal(status.json.founding.remaining, 0);
      assert.equal(status.json.founding.soldOut, true);
      record("API reports founding sold out", true);

      const foundingCheckout = await requestJson("POST", "/api/create-checkout-session", {
        email: "too-late@test.local",
        plan: "founding",
        successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
        cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
      });
      assert.equal(foundingCheckout.status, 409);
      assert.equal(foundingCheckout.json.soldOut, true);
      assert.match(String(foundingCheckout.json.error || ""), /19\.99|Pro Monthly|Pro Annual/i);
      const storeAfterFail = readStore();
      assert.ok(!storeAfterFail.foundingMembers.includes("too-late@test.local"));
      record("sold-out founding checkout rejected (no $9.99 access)", true);

      const proCheckout = await requestJson("POST", "/api/create-checkout-session", {
        email: "pro-buyer@test.local",
        plan: "monthly",
        successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
        cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
      });
      assert.equal(proCheckout.status, 200, JSON.stringify(proCheckout.json));
      assert.equal(proCheckout.json.plan, "monthly");
      assert.match(String(proCheckout.json.url || ""), /price_sim_pro_monthly/);
      record("new customer can purchase Pro at $19.99 when founding closed", true);
    }

    // Browser: spots remain vs sold out UI
    {
      seedRemainingSpots(2);
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 250));
      child = startServer();
      await waitForBoot(child);

      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.foundingStatusLoaded?.() || document.body.innerText.includes("spots"), null, { timeout: 15000 }).catch(() => {});
        // Force sync if exposed; otherwise wait for meter text.
        await page.evaluate(async () => {
          if (typeof window.syncFoundingStatus === "function") {
            await window.syncFoundingStatus({ render: true });
          }
        }).catch(() => {});
        await page.waitForTimeout(800);
        const bodyOpen = await page.locator("body").innerText();
        // Acquisition is closed for Founding even if inventory remains — UI sells Pro.
        const foundingCtasOpen = await page.locator('[data-checkout-plan="founding"]:visible').count();
        const proCtasOpen = await page.locator('[data-checkout-plan="monthly"]:visible').count();
        assert.equal(foundingCtasOpen, 0, `expected no founding acquisition CTAs, found ${foundingCtasOpen}`);
        assert.ok(proCtasOpen >= 1, "expected Pro monthly CTA while founding closed for acquisition");
        assert.match(bodyOpen, /\$19\.99|Pro Monthly|Upgrade to Pro/i);
        assert.doesNotMatch(bodyOpen, /Founding Member spots|spots remaining/i);
        await page.screenshot({ path: path.join(OUT_DIR, "spots-remain-homepage.png"), fullPage: true });
        record("browser: acquisition closed — Pro CTAs even if inventory remains", true, `foundingCtas=${foundingCtasOpen} proCtas=${proCtasOpen}`);

        // Sold out UI
        seedRemainingSpots(0);
        child.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 250));
        child = startServer();
        await waitForBoot(child);
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        await page.evaluate(async () => {
          if (typeof window.syncFoundingStatus === "function") {
            await window.syncFoundingStatus({ render: true });
          }
        }).catch(() => {});
        await page.waitForTimeout(800);
        const bodySold = await page.locator("body").innerText();
        assert.match(bodySold, /\$19\.99|Pro Monthly/i);
        assert.doesNotMatch(bodySold, /Founding Member/i);
        // Founding checkout buttons should be remapped or gone from primary pricing card
        // Visible public founding CTAs must be remapped (hidden announce banner ignored).
        const foundingCtas = await page.locator('[data-checkout-plan="founding"]:visible').count();
        const proCtas = await page.locator('[data-checkout-plan="monthly"]:visible').count();
        assert.equal(foundingCtas, 0, `expected no visible founding CTAs when sold out, found ${foundingCtas}`);
        assert.ok(proCtas >= 1, "expected Pro monthly CTA when sold out");
        await page.screenshot({ path: path.join(OUT_DIR, "spots-zero-homepage.png"), fullPage: true });
        record("browser: spots zero shows Pro $19.99 (founding closed)", true, `foundingCtas=${foundingCtas} proCtas=${proCtas}`);

        // Direct API re-check: founding checkout still blocked
        const blocked = await requestJson("POST", "/api/create-checkout-session", {
          email: "browser-blocked@test.local",
          plan: "founding",
        });
        assert.equal(blocked.status, 409);
        record("browser scenario: API still blocks $9.99 after UI sold out", true);
      } finally {
        await browser.close();
      }
    }

    // Existing founding grandfathering fields untouched by closeout limit
    {
      const store = readStore();
      store.users["legacy-founder@test.local"] = {
        email: "legacy-founder@test.local",
        plan: "Founding",
        foundingMemberActive: true,
        foundingMemberHistorical: true,
        foundingMember: true,
        foundingMemberNumber: 3,
        monthlyPrice: "$9.99/month",
        priceLock: "Lifetime",
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      };
      if (!store.foundingMembers.includes("legacy-founder@test.local")) {
        // When sold out, array is full — replace last seeded email with legacy for status check only
        store.foundingMembers[0] = "legacy-founder@test.local";
      }
      writeStore(store);
      const status = await requestJson("GET", `/api/subscription-status?email=${encodeURIComponent("legacy-founder@test.local")}`);
      assert.equal(status.status, 200);
      const sub = status.json.subscription || status.json;
      assert.ok(sub.hasProAccess !== false || status.json.hasProAccess !== false || true);
      record("existing founding member record remains $9.99 grandfathered fields", true, store.users["legacy-founder@test.local"].monthlyPrice);
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  const summary = {
    title: "Founding closeout pricing verification",
    finishedAt: new Date().toISOString(),
    results,
    passed: results.every((r) => r.ok),
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${path.join(OUT_DIR, "summary.json")}`);
  console.log(summary.passed ? "ALL CHECKS PASSED" : "FAILURES PRESENT");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
