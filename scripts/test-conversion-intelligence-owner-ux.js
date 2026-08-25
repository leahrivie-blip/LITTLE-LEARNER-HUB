#!/usr/bin/env node
/**
 * Conversion Intelligence Owner Follow-Up UX — browser checks + screenshots.
 * Run: NODE_ENV=test node scripts/test-conversion-intelligence-owner-ux.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { unlockAdminInBrowser } = require("./lib/admin-browser-unlock.js");

const ROOT = path.join(__dirname, "..");
const OUT = "/opt/cursor/artifacts/screenshots";
const PORT = 19880 + Math.floor(Math.random() * 40);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = "conv-ux@test.local";
const ADMIN_PASSWORD = "conv-ux-pass";
const ADMIN_CODE = "conv-ux-code";

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildStore() {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  return {
    users: {
      "alice@free.test": {
        email: "alice@free.test",
        plan: "Free",
        signupAt: iso(2 * 86400000),
        attribution: { source: "Facebook" },
      },
      "carol@intent.test": {
        email: "carol@intent.test",
        plan: "Free",
        signupAt: iso(86400000),
        attribution: { source: "TikTok" },
      },
    },
    analyticsEvents: [
      { id: "e1", name: "account_signup_complete", user: "alice@free.test", visitorId: "v1", sessionId: "s1", createdAt: iso(2 * 86400000) },
      { id: "e2", name: "lesson_viewed", user: "alice@free.test", visitorId: "v1", sessionId: "s1", createdAt: iso(2 * 86400000 - 30000), detail: { resourceId: "a", title: "Farm", age: "Toddler" } },
      { id: "e3", name: "activity_viewed", user: "alice@free.test", visitorId: "v1", sessionId: "s1", createdAt: iso(2 * 86400000 - 20000), detail: { resourceId: "b", title: "Act", age: "Toddler" } },
      { id: "e4", name: "pricing_viewed", user: "alice@free.test", visitorId: "v1", sessionId: "s1", createdAt: iso(2 * 86400000 - 5000) },
      { id: "e5", name: "checkout_started", user: "alice@free.test", visitorId: "v1", sessionId: "s1", createdAt: iso(2 * 86400000 - 3000) },
      { id: "e6", name: "account_signup_complete", user: "carol@intent.test", visitorId: "v2", sessionId: "s2", createdAt: iso(86400000) },
      { id: "e7", name: "lesson_viewed", user: "carol@intent.test", visitorId: "v2", sessionId: "s2", createdAt: iso(86000000), detail: { resourceId: "l1", title: "L1", age: "Toddler" } },
      { id: "e8", name: "lesson_viewed", user: "carol@intent.test", visitorId: "v2", sessionId: "s3", createdAt: iso(80000000), detail: { resourceId: "l2", title: "L2", age: "Toddler" } },
      { id: "e9", name: "pricing_viewed", user: "carol@intent.test", visitorId: "v2", sessionId: "s3", createdAt: iso(69000000) },
      { id: "e10", name: "pricing_viewed", user: "carol@intent.test", visitorId: "v2", sessionId: "s3", createdAt: iso(68000000) },
    ],
    conversionLeads: {
      "alice@free.test": {
        email: "alice@free.test",
        status: "follow_up",
        reasons: [{ reason: "price", context: "", at: iso(1000) }],
        notes: [{ text: "Called once", at: iso(2000) }],
      },
      "carol@intent.test": {
        email: "carol@intent.test",
        status: "high_intent",
        reasons: [{ reason: "not_ready_yet", context: "", at: iso(1000) }],
        notes: [],
      },
    },
    siteContent: {},
  };
}

async function waitForHealth() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not become healthy");
}

async function openConversionIntelligence(page) {
  await page.waitForFunction(
    () => typeof window.setAdminSectionTab === "function"
      && typeof window.renderAdminConversionIntelligence === "function",
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    window.setAdminSectionTab("conversion-intelligence");
  });
  await page.waitForSelector(".admin-conversion-intelligence-panel:not([hidden])", { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#adminConversionIntelligenceApp");
      return el && /Owner Follow-Up/i.test(el.textContent || "");
    },
    null,
    { timeout: 90000 },
  );
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-conv-ux-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify(buildStore(), null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  try {
    await waitForHealth();
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      code: ADMIN_CODE,
    });
    assert.equal(login.status, 200);
    const token = login.json?.token;
    assert.ok(token);

    const report = await requestJson("GET", "/api/admin/conversion-intelligence?range=all", null, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(report.status, 200);
    assert.ok(Array.isArray(report.json?.data?.ownerReasonFrequency));
    assert.ok(report.json.data.ownerReasonFrequency.some((row) => row.reason === "price"));

    for (const vp of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "iphone-390", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await unlockAdminInBrowser(page, BASE, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        code: ADMIN_CODE,
      });
      await openConversionIntelligence(page);

      const text = await page.locator("#adminConversionIntelligenceApp").innerText();
      assert.match(text, /owner follow-up/i);
      assert.doesNotMatch(text, /phase 2b/i);
      assert.match(text, /owner-entered/i);
      assert.match(text, /Owner Action Queue/);

      const followUp = page.locator("#convOwnerFollowUp");
      await followUp.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(OUT, `conv-intel-owner-followup-${vp.name}.png`),
        fullPage: false,
      });

      const queue = page.locator("#convOwnerActionQueue");
      await queue.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(OUT, `conv-intel-action-queue-${vp.name}.png`),
        fullPage: false,
      });

      if (vp.width <= 640) {
        const mobileVisible = await page.locator(".conv-queue-mobile").isVisible();
        const desktopHidden = await page.locator(".conv-queue-desktop").isHidden();
        assert.equal(mobileVisible, true);
        assert.equal(desktopHidden, true);
        const cardCount = await page.locator(".conv-lead-card").count();
        assert.ok(cardCount >= 1);
        const btnBox = await page.locator(".conv-lead-card .conv-lead-action").first().boundingBox();
        assert.ok(btnBox);
        assert.ok(btnBox.height >= 40, `tap target height ${btnBox.height}`);
        const kpiCols = await page.evaluate(() => {
          const grid = document.querySelector(".conv-owner-followup-kpis");
          if (!grid) return 0;
          return window.getComputedStyle(grid).gridTemplateColumns.split(" ").length;
        });
        assert.equal(kpiCols, 2, "follow-up KPI grid should be 2 columns on iPhone width");
      } else {
        const desktopVisible = await page.locator(".conv-queue-desktop").isVisible();
        assert.equal(desktopVisible, true);
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const scrollBefore = await page.evaluate(() => window.scrollY);
      assert.ok(scrollBefore > 200, "page should be scrolled down before save");

      const saveBtn = vp.width <= 640
        ? page.locator(".conv-queue-mobile [data-lead-save]").first()
        : page.locator(".conv-queue-desktop [data-lead-save]").first();
      await saveBtn.scrollIntoViewIfNeeded();
      const email = await saveBtn.getAttribute("data-lead-save");
      assert.ok(email);

      await saveBtn.click();
      await page.waitForFunction(
        () => window.scrollY > 100,
        null,
        { timeout: 15000 },
      );

      const scrollAfter = await page.evaluate(() => window.scrollY);
      assert.ok(scrollAfter > 100, `scroll should be preserved after save (before=${scrollBefore}, after=${scrollAfter})`);

      await page.close();
      console.log(`PASS browser UX ${vp.name}`);
    }

    console.log("\nConversion Intelligence owner UX browser checks passed.");
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    if (child.exitCode === null) child.kill("SIGKILL");
    fs.unlinkSync(storePath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
