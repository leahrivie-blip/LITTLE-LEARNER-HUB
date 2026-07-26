#!/usr/bin/env node
/**
 * Public signed-out homepage cleanup regression tests.
 * Run: npm run test:homepage-cleanup
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19620 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-home-cleanup-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "homepage-cleanup@test.local",
  password: "homepage-cleanup-pass",
  code: "homepage-cleanup-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
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
      NODE_ENV: "test",
      FOUNDING_MEMBER_LIMIT: "50",
      PUBLIC_FOUNDING_CLAIMED_BASE: "32",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function seedFreeCurriculum(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const samplePath = path.join(ROOT, "scripts/curriculum-preschool-free-imports/01-preschool-colors-everywhere-free.txt");
  if (!fs.existsSync(samplePath)) return null;
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(samplePath, "utf8"));
  if (!parsed.ok) return null;
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-home-cleanup-${crypto.randomBytes(2).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: "Colors Everywhere",
      theme: "Colors Everywhere",
      plan: "Free",
      status: "published",
    },
  });
  if (save.status !== 200) return null;
  return { planId, title: "Colors Everywhere" };
}

async function runViewportAudit(browser, baseUrl, viewport, label, seeded) {
  const stripeCalls = [];
  const page = await browser.newPage();
  page.on("dialog", async (d) => d.accept());
  page.on("request", (req) => {
    const url = req.url();
    if (/stripe\.com|api\.openai\.com|\/api\/create-checkout-session|\/api\/email|\/api\/sms/i.test(url)) {
      stripeCalls.push(url);
    }
  });

  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function" && typeof openAuthModal === "function", null, { timeout: 30000 });

  const meterBefore = await page.locator("#homeFoundingMeter").innerText().catch(() => "");
  assert(/Checking Founding Member availability/i.test(meterBefore) || !/0 of 50 claimed/i.test(meterBefore),
    `${label}: founding meter must not show fake zero before load`);

  await page.waitForFunction(() => {
    const text = document.querySelector("#homeFoundingMeter")?.innerText || "";
    return /claimed/i.test(text) && !/Checking Founding Member availability/i.test(text);
  }, null, { timeout: 15000 });

  const meterAfter = await page.locator("#homeFoundingMeter").innerText();
  assert(!/0 of 50 claimed/i.test(meterAfter) || /32 of 50 claimed/i.test(meterAfter),
    `${label}: founding meter should show live count, got: ${meterAfter}`);

  const announceCount = await page.locator(".llh-announce-banner:visible, #siteAnnouncementBanner:not([hidden])").count();
  assert(announceCount === 1, `${label}: expected one top announcement, found ${announceCount}`);

  const freeFeatures = await page.locator(".lp-free-card .lp-price-features li").allTextContents();
  const uniqueFeatures = new Set(freeFeatures.map((t) => t.trim()).filter(Boolean));
  assert(uniqueFeatures.size === freeFeatures.length, `${label}: free plan benefits must be distinct`);
  assert(freeFeatures.some((t) => /across age groups/i.test(t)), `${label}: free plan age-group benefit missing`);

  const pricingText = await page.locator("#homePricing").innerText();
  assert(/continuously active/i.test(pricingText), `${label}: pricing must mention continuously active membership`);

  const metaDescription = await page.locator('meta[name="description"]').getAttribute("content");
  const ogDescription = await page.locator('meta[property="og:description"]').getAttribute("content");
  const twitterDescription = await page.locator('meta[name="twitter:description"]').getAttribute("content");
  const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
  for (const text of [metaDescription, ogDescription, twitterDescription, structuredData]) {
    assert(/\$9\.99\/month locked while continuously active/i.test(text || ""), `${label}: social/meta pricing language missing continuous-membership condition`);
  }

  assert(await page.locator("#homeCompare").count() === 0, `${label}: duplicate compare section should be removed`);
  assert(await page.locator("#homeFoundingOffer").count() === 0, `${label}: duplicate founding offer block should be removed`);

  const pricingSections = await page.locator("#homePricing .lp-pricing-grid").count();
  assert(pricingSections === 1, `${label}: expected one pricing grid`);

  const orderOk = await page.evaluate(() => {
    const ids = ["homeHero", "homeLessonPlans", "homeActivities", "homeFeatures", "homeComingSoon", "homeAudience", "homeFounder", "homeReviews", "homePricing", "homeFinalCta"];
    const positions = ids.map((id) => document.getElementById(id)).filter(Boolean).map((node) => node.getBoundingClientRect().top + window.scrollY);
    for (let i = 1; i < positions.length; i += 1) {
      if (positions[i] < positions[i - 1]) return false;
    }
    return positions.length === ids.length;
  });
  assert(orderOk, `${label}: homepage section order invalid`);

  const comingSoonText = await page.locator("#homeComingSoon").innerText();
  assert(/Children and Documentation/i.test(comingSoonText), `${label}: coming soon category missing`);
  assert(/Family Communication and Forms/i.test(comingSoonText), `${label}: family communication category missing`);
  assert(/Daily Operations/i.test(comingSoonText), `${label}: daily operations category missing`);
  assert(/Staff and Program Management/i.test(comingSoonText), `${label}: staff category missing`);

  await page.locator(".llh-public-nav-actions [data-action='open-login']").click();
  await page.waitForSelector("#authModal.open");
  await page.click("#closeModal");

  await page.locator(".llh-public-nav-actions [data-action='start-free']").click();
  await page.waitForSelector("#authModal.open");
  await page.click("#closeModal");

  await page.locator('#homePricing [data-checkout-plan="founding"]').click();
  await page.waitForSelector("#authModal.open");
  await page.click("#closeModal");

  if (seeded?.planId) {
    await page.waitForFunction(() => document.querySelector("#homeLessonPreviewGrid [data-home-open-preview]"), null, { timeout: 15000 }).catch(() => {});
    const previewBtn = page.locator("#homeLessonPreviewGrid [data-home-open-preview]").first();
    if (await previewBtn.count()) {
      await previewBtn.click();
      await page.waitForSelector("#resourceViewerModal.open, #featurePreviewModal.open", { timeout: 10000 });
      await page.evaluate(() => {
        if (typeof closeResourceViewer === "function") closeResourceViewer();
      });
      await page.waitForTimeout(300);
    }
  }

  const activityBtn = page.locator("#homeActivityPreviewGrid [data-home-open-preview]").first();
  if (await activityBtn.count()) {
    await activityBtn.click();
    await page.waitForSelector("#resourceViewerModal.open, #featurePreviewModal.open", { timeout: 10000 });
    await page.evaluate(() => {
      if (typeof closeResourceViewer === "function") closeResourceViewer();
    });
  }

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  assert(scrollWidth <= clientWidth + 1, `${label}: horizontal scroll detected (${scrollWidth} > ${clientWidth})`);

  const screenshotPath = path.join("/opt/cursor/artifacts/screenshots", `homepage-cleanup-${label}.png`);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });

  await page.close();
  return { label, stripeCalls: stripeCalls.length, screenshotPath };
}

async function testFoundingFailure(playwright, baseUrl) {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route("**/api/founding-status**", (route) => route.abort("failed"));
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof syncFoundingStatus === "function", null, { timeout: 30000 });
  await page.evaluate(() => syncFoundingStatus({ render: true }));
  await page.waitForFunction(() => /could not be loaded/i.test(document.querySelector("#homeFoundingMeter")?.innerText || ""), null, { timeout: 15000 });
  const text = await page.locator("#homeFoundingMeter").innerText();
  assert(/could not be loaded/i.test(text), "founding failure message missing");
  assert(!/0 of 50/i.test(text), "founding failure must not show fake zero");
  await browser.close();
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200, `Admin login failed: ${login.status}`);
    const seeded = await seedFreeCurriculum(login.json.token);
    const baseUrl = `http://127.0.0.1:${PORT}`;

    const founding = await requestJson("GET", "/api/founding-status");
    assert(founding.status === 200, "founding-status failed");

    const viewports = [
      { width: 1280, height: 900, label: "desktop" },
      { width: 834, height: 1112, label: "tablet" },
      { width: 360, height: 800, label: "phone-360" },
      { width: 390, height: 844, label: "phone-390" },
      { width: 430, height: 932, label: "phone-430" },
    ];

    const browser = await playwright.chromium.launch({ headless: true });
    const results = [];
    try {
      for (const vp of viewports) {
        results.push(await runViewportAudit(browser, baseUrl, vp, vp.label, seeded));
      }
    } finally {
      await browser.close();
    }
    await testFoundingFailure(playwright, baseUrl);

    console.log(JSON.stringify({ ok: true, viewports: results.map((r) => r.label), screenshots: results.map((r) => r.screenshotPath) }, null, 2));
    console.log("\nhomepage-cleanup: PASS");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
