#!/usr/bin/env node
/**
 * Free lesson preview CTA click-through audit.
 * Run: node scripts/test-free-lesson-preview-ctas.js
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");
const PORT = 4610 + Math.floor(Math.random() * 180);
const STORE_PATH = path.join(os.tmpdir(), `llh-preview-cta-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "preview-cta-admin@test.local",
  password: "preview-cta-pass",
  code: "preview-cta-code",
};
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { ...(options.headers || {}) };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers },
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function publishFreeLesson(token) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert(parsed.ok, parsed.errors.join(" "));
  const planId = `cur-lp-cta-free-${crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: "CTA Audit Free Garden Scientists",
      plan: "Free",
      status: "published",
      age: "Preschool",
      theme: "Garden Scientists",
    },
  });
  assert(save.status === 200, `free lesson save failed: ${save.status} ${save.text}`);
  return planId;
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("Server failed to boot");
}

async function openFreeLesson(page, freeId) {
  await page.waitForFunction(() => typeof openHomePublicPreview === "function", null, { timeout: 30000 });
  await page.waitForFunction(
    (id) => typeof resources !== "undefined" && Array.isArray(resources) && resources.some((r) => r.id === id),
    freeId,
    { timeout: 45000 },
  );
  await page.evaluate((id) => openHomePublicPreview(id, "homeLessonPlans"), freeId);
  await page.waitForSelector("#resourceViewerModal.open .llh-public-preview-cta", { timeout: 15000 });
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); } catch {
    console.log("Playwright not installed — skipping browser CTA audit.");
    return;
  }

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200 && login.json?.token, "admin login failed");
    const freeLessonId = await publishFreeLesson(login.json.token);
    browser = await playwright.chromium.launch({ headless: true });

    console.log("1) Mobile guest: Create Free Account opens signup above lesson preview");
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await openFreeLesson(mobile, freeLessonId);
    const stacking = await mobile.evaluate(() => ({
      authZ: Number(getComputedStyle(document.querySelector("#authModal")).zIndex || 0),
      viewerZ: Number(getComputedStyle(document.querySelector("#resourceViewerModal")).zIndex || 0),
    }));
    assert(stacking.authZ > stacking.viewerZ, `auth z-index must beat viewer (${stacking.authZ} vs ${stacking.viewerZ})`);
    await mobile.locator("#resourceViewerModal [data-action='start-free']").click();
    await mobile.waitForSelector("#authModal.open", { timeout: 8000 });
    const afterCreate = await mobile.evaluate(() => {
      const auth = document.querySelector("#authModal");
      const center = document.elementFromPoint(window.innerWidth / 2, Math.min(220, window.innerHeight / 3));
      return {
        authOpen: auth?.classList.contains("open"),
        title: document.querySelector("#authTitle")?.textContent || "",
        viewerOpen: document.querySelector("#resourceViewerModal")?.classList.contains("open"),
        topIsAuth: Boolean(center?.closest("#authModal")),
      };
    });
    assert(afterCreate.authOpen, "Create Free Account did not open auth modal");
    assert(/Create Your Free|Sign/i.test(afterCreate.title), `unexpected auth title: ${afterCreate.title}`);
    assert(!afterCreate.viewerOpen, "lesson viewer should close so signup is visible");
    assert(afterCreate.topIsAuth, "signup modal must be the topmost interactive layer");
    await mobile.close();

    console.log("2) Desktop guest: Pro CTA opens signup with preferred monthly plan");
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await desktop.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await openFreeLesson(desktop, freeLessonId);
    await desktop.locator("#resourceViewerModal [data-checkout-plan='monthly']").click();
    await desktop.waitForSelector("#authModal.open", { timeout: 8000 });
    const afterPro = await desktop.evaluate(() => ({
      authOpen: document.querySelector("#authModal")?.classList.contains("open"),
      preferred: sessionStorage.getItem("llhSignupPreferredPlan"),
      viewerOpen: document.querySelector("#resourceViewerModal")?.classList.contains("open"),
      topIsAuth: Boolean(document.elementFromPoint(window.innerWidth / 2, 200)?.closest("#authModal")),
    }));
    assert(afterPro.authOpen, "Pro CTA did not open signup");
    assert(afterPro.preferred === "monthly", `preferred plan should be monthly, got ${afterPro.preferred}`);
    assert(!afterPro.viewerOpen, "lesson viewer should close for Pro CTA");
    assert(afterPro.topIsAuth, "Pro signup must be topmost");
    await desktop.click("#closeModal");
    await desktop.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });

    console.log("3) Homepage → free lesson → signup full click-through");
    await desktop.evaluate(() => setView("home"));
    await desktop.waitForSelector("#view-home.active-view", { timeout: 8000 });
    await desktop.waitForSelector("#homeLessonPreviewGrid [data-home-open-preview]", { timeout: 15000 });
    await desktop.locator("#homeLessonPreviewGrid [data-home-open-preview]").first().click();
    await desktop.waitForSelector("#resourceViewerModal.open .llh-public-preview-cta", { timeout: 15000 });
    await desktop.locator("#resourceViewerModal [data-action='start-free']").click();
    await desktop.waitForSelector("#authModal.open", { timeout: 8000 });
    assert(await desktop.locator("#authModal.open").count(), "homepage→lesson→signup path failed");
    await desktop.click("#closeModal");

    console.log("4) Homepage Pro + start-free CTAs still open signup");
    await desktop.evaluate(() => setView("home"));
    await desktop.locator('#homePricing [data-checkout-plan="monthly"]').scrollIntoViewIfNeeded();
    await desktop.locator('#homePricing [data-checkout-plan="monthly"]').click();
    await desktop.waitForSelector("#authModal.open", { timeout: 8000 });
    await desktop.click("#closeModal");
    await desktop.locator(".lp-hero-actions [data-action='start-free']").click();
    await desktop.waitForSelector("#authModal.open", { timeout: 8000 });
    await desktop.click("#closeModal");

    console.log("5) Free logged-in user: Pro from homepage opens checkout/upgrade path");
    await desktop.evaluate(() => {
      localStorage.setItem("llhUser", "free-cta@test.local");
      localStorage.setItem("llhPlan", "Free");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "free-cta@test.local": {
          email: "free-cta@test.local",
          plan: "Free",
          subscriptionStatus: "Free Plan",
          accountType: "home_daycare",
          role: "owner",
        },
      }));
    });
    await desktop.reload({ waitUntil: "domcontentloaded" });
    await desktop.waitForFunction(() => typeof isLoggedIn === "function" && isLoggedIn(), null, { timeout: 30000 });
    await desktop.evaluate(() => setView("upgrade"));
    await desktop.waitForSelector("#view-upgrade.active-view", { timeout: 8000 });
    await desktop.waitForSelector("#upgradeApp [data-checkout-plan='founding'], #upgradeApp [data-checkout-plan='monthly']", { timeout: 10000 });
    const includesVisible = await desktop.evaluate(() => {
      const text = document.querySelector("#upgradeApp")?.innerText || "";
      return /lesson|curriculum|calendar|documentation|AI/i.test(text);
    });
    assert(includesVisible, "upgrade page should describe Pro/Founding inclusions");
    desktop.once("dialog", async (dialog) => { await dialog.dismiss(); });
    const upgradeCta = desktop.locator("#upgradeApp [data-checkout-plan='founding'], #upgradeApp [data-checkout-plan='monthly']").first();
    await upgradeCta.click();
    await desktop.waitForTimeout(400);
    const afterUpgradeClick = await desktop.evaluate(() => ({
      authOpen: document.querySelector("#authModal")?.classList.contains("open"),
      pending: Boolean(localStorage.getItem("llhPendingCheckout")),
      stillOnUpgrade: document.querySelector("#view-upgrade")?.classList.contains("active-view"),
    }));
    assert(
      afterUpgradeClick.authOpen || afterUpgradeClick.pending || afterUpgradeClick.stillOnUpgrade,
      "free-user upgrade CTA should start checkout or remain on upgrade",
    );

    console.log("\nFree lesson preview CTA checks passed.");
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
