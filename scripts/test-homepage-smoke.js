#!/usr/bin/env node
/**
 * Homepage + navigation smoke test (desktop + mobile).
 * Run: node scripts/test-homepage-smoke.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19440 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-home-smoke-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "homepage-smoke@test.local",
  password: "homepage-smoke-pass",
  code: "homepage-smoke-code",
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
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

async function seedProLessonForLockedPreview(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(sample, "utf8"));
  if (!parsed.ok) return null;
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-smoke-pro-${crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: "Smoke Test Pro Garden",
      plan: "Pro",
      status: "published",
    },
  });
  if (save.status !== 200) return null;
  return { planId, title: "Smoke Test Pro Garden" };
}

async function runViewportSmoke(playwright, baseUrl, viewport, label, proLesson) {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const rejections = [];
  const scriptResponses = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) => {
    if (req.url().includes(".js")) scriptResponses.push({ url: req.url(), failed: true });
  });
  page.on("response", (res) => {
    if (res.url().includes(".js")) scriptResponses.push({ url: res.url(), status: res.status() });
  });
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  const step = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      throw new Error(`${label} step "${name}": ${error.message}`);
    }
  };

  await page.addInitScript(() => {
    window.__smokeRejections = [];
    window.addEventListener("unhandledrejection", (event) => {
      window.__smokeRejections.push(String(event.reason?.message || event.reason || "unknown"));
    });
  });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function" && typeof openAuthModal === "function", null, { timeout: 30000 });

  const initState = await page.evaluate(() => ({
    setView: typeof setView === "function",
    openAuthModal: typeof openAuthModal === "function",
    resources: Array.isArray(resources),
    lessonCount: Array.isArray(resources) ? resources.filter((r) => r.category === "Lesson Plans").length : 0,
    homeActive: document.querySelector("#view-home")?.classList.contains("active-view"),
  }));
  assert(initState.setView && initState.openAuthModal, `${label}: app.js did not initialize core handlers`);
  assert(initState.resources, `${label}: resources array missing`);
  assert(initState.homeActive, `${label}: home view not active on fresh load`);

  const duplicateDecl = pageErrors.filter((msg) => /already been declared/i.test(msg));
  assert(!duplicateDecl.length, `${label}: duplicate declaration errors: ${duplicateDecl.join(" | ")}`);

  const js404 = scriptResponses.filter((entry) => entry.status === 404 || entry.failed);
  assert(!js404.length, `${label}: JavaScript 404/failed loads: ${js404.map((e) => e.url).join(", ")}`);

  // Sign Up / Log In (topbar Sign up is hidden on narrow home view)
  await step("signup button", async () => {
    if (viewport.width <= 600) {
      await page.locator(".lp-hero-actions [data-action='start-free']").click();
    } else {
      await page.click("#signupButton");
    }
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    assert((await page.locator("#authTitle").innerText()).toLowerCase().includes("create"), `${label}: signup modal title`);
    await page.click("#closeModal");
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("login button", async () => {
    await page.locator("#signinButton").click();
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    assert((await page.locator("#authTitle").innerText()).toLowerCase().includes("log in"), `${label}: login modal title`);
    await page.click("#closeModal");
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("upgrade trial button", async () => {
    await page.locator(".lp-pro-card [data-action='upgrade-trial']").scrollIntoViewIfNeeded();
    await page.click(".lp-pro-card [data-action='upgrade-trial']");
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    await page.click("#closeModal");
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("start free button", async () => {
    await page.locator(".lp-hero-actions [data-action='start-free']").scrollIntoViewIfNeeded();
    await page.click(".lp-hero-actions [data-action='start-free']");
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    await page.click("#closeModal");
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("pricing navigation", async () => {
    await page.evaluate(() => setView("plans"));
    await page.waitForSelector("#view-plans.active-view", { timeout: 5000 });
    await page.waitForSelector("#pricingApp .pricing-grid", { timeout: 10000 });
    const monthlyBtn = page.locator('#pricingApp [data-checkout-plan="monthly"]');
    const foundingPlanBtn = page.locator('#pricingApp [data-checkout-plan="founding"]');
    const annualBtn = page.locator('#pricingApp [data-checkout-plan="annual"]').first();
    await annualBtn.waitFor({ timeout: 5000 });
    if (await monthlyBtn.count()) {
      await monthlyBtn.first().click();
    } else {
      await foundingPlanBtn.first().waitFor({ timeout: 5000 });
      await foundingPlanBtn.first().click();
    }
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    await page.click("#closeModal");
  });

  await step("upgrade page buttons", async () => {
    await page.evaluate(() => setView("upgrade"));
    await page.waitForSelector("#view-upgrade.active-view", { timeout: 5000 });
    await page.waitForSelector("#upgradeApp .pricing-grid", { timeout: 10000 });
    const upgradeFounding = page.locator('#upgradeApp [data-checkout-plan="founding"]');
    const upgradeAnnual = page.locator('#upgradeApp [data-checkout-plan="annual"]').first();
    const upgradeMonthly = page.locator('#upgradeApp [data-checkout-plan="monthly"]');
    // Pro plans stay hidden while founding spots remain; click what is visible.
    if (await upgradeFounding.count()) {
      await upgradeFounding.first().click();
    } else if (await upgradeAnnual.count()) {
      await upgradeAnnual.click();
    } else {
      await upgradeMonthly.first().waitFor({ timeout: 5000 });
      await upgradeMonthly.first().click();
    }
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    await page.click("#closeModal");
    if (await upgradeMonthly.count()) {
      await upgradeMonthly.first().click();
      await page.waitForSelector("#authModal.open", { timeout: 5000 });
      await page.click("#closeModal");
    }
  });

  await step("founding member button", async () => {
    await page.evaluate(() => setView("home"));
    await page.waitForSelector("#view-home.active-view", { timeout: 5000 });
    await page.waitForSelector("#homeFoundingOffer .founding-cta-button", { timeout: 10000 });
    const foundingBtn = page.locator("#homeFoundingOffer .founding-cta-button");
    const foundingPlan = await foundingBtn.getAttribute("data-checkout-plan");
    assert(foundingPlan === "founding" || foundingPlan === "monthly", `${label}: founding CTA has checkout plan`);
    await foundingBtn.click();
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    await page.click("#closeModal");
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("navigation links", async () => {
    if (viewport.width <= 500) {
      await page.evaluate(() => setView("home"));
      await page.waitForSelector("#view-home.active-view", { timeout: 5000 });
      await page.click("#mobileMenuToggle");
      await page.waitForFunction(() => document.body.classList.contains("mobile-nav-open"), null, { timeout: 5000 });
      await page.waitForSelector('.sidebar button.nav-link[data-view="help"]', { state: "attached", timeout: 5000 });
      await page.evaluate(() => {
        const btn = document.querySelector('.sidebar button.nav-link[data-view="help"]');
        if (!btn) throw new Error("mobile help nav link missing");
        btn.click();
      });
      await page.waitForSelector("#view-contact.active-view", { timeout: 5000 });
      await page.evaluate(() => {
        document.body.classList.remove("mobile-nav-open");
        document.querySelector("#mobileMenuToggle")?.setAttribute("aria-expanded", "false");
      });
      await page.waitForFunction(() => !document.body.classList.contains("mobile-nav-open"), null, { timeout: 5000 });
    } else {
      await page.evaluate(() => setView("help"));
      await page.waitForSelector("#view-contact.active-view", { timeout: 5000 });
    }
    await page.evaluate(() => setView("legal"));
    await page.waitForSelector("#view-legal.active-view", { timeout: 5000 });
    await page.evaluate(() => setView("faq"));
    await page.waitForSelector("#view-faq.active-view", { timeout: 5000 });
    await page.evaluate(() => setView("home"));
  });

  if (proLesson) {
    await step("locked pro lesson upgrade", async () => {
      // Free logged-in user can open Lesson Plans; locked Pro cards show Preview.
      // Trial CTA then runs startProTrial (confirm → upgrade/test checkout), not signup.
      await page.route("**/api/create-checkout-session", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, message: "smoke-test-no-stripe-url" }),
        });
      });
      await page.evaluate(() => {
        localStorage.setItem("llhUser", "smoke-free@example.com");
        localStorage.setItem("llhAccounts", JSON.stringify({
          "smoke-free@example.com": {
            email: "smoke-free@example.com",
            plan: "Free",
            subscriptionStatus: "Free Plan",
          },
        }));
        localStorage.setItem("llhPlan", "Free");
      });
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
        page.reload({ waitUntil: "domcontentloaded" }),
      ]);
      await page.waitForFunction(() => typeof setView === "function" && typeof openAuthModal === "function", null, { timeout: 30000 });
      const duplicateAfterReload = pageErrors.filter((msg) => /already been declared/i.test(msg));
      assert(!duplicateAfterReload.length, `${label}: duplicate declaration after reload: ${duplicateAfterReload.join(" | ")}`);

      await page.evaluate(() => setView("lessons"));
      await page.waitForSelector("#view-lessons.active-view", { timeout: 5000 });
      await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
      await page.fill("#lessonPlanSearch", proLesson.title);
      await page.waitForTimeout(500);
      const card = page.locator("#view-lessons .resource-card").filter({ hasText: proLesson.title }).first();
      await card.waitFor({ timeout: 10000 });
      const previewBtn = card.locator("button[data-view-resource]").first();
      const btnText = await previewBtn.innerText();
      assert(/preview/i.test(btnText), `${label}: pro lesson should show Preview`);
      await previewBtn.click({ force: true });
      await page.waitForSelector("#featurePreviewModal.open", { timeout: 10000 });
      // Free owners see Founding checkout while spots remain; otherwise Pro trial CTA.
      const foundingBtn = page.locator("#featurePreviewModal [data-checkout-plan='founding']");
      const trialBtn = page.locator("#featurePreviewModal [data-start-pro-trial]");
      if (await foundingBtn.count()) {
        await foundingBtn.first().waitFor({ timeout: 5000 });
        await foundingBtn.first().click();
        // Confirm dialog is auto-accepted; local/test checkout may land on upgrade or stay put.
        await page.waitForTimeout(800);
      } else {
        await trialBtn.waitFor({ timeout: 5000 });
        await trialBtn.click();
        await page.waitForSelector("#view-upgrade.active-view", { timeout: 10000 });
        await page.waitForSelector("#upgradeApp .pricing-grid, #upgradeApp .checkout-test-panel", { timeout: 10000 });
      }

  await step("admin login", async () => {
    await page.evaluate(() => setView("admin"));
    await page.waitForSelector("#view-admin.active-view", { timeout: 5000 });
    await page.waitForSelector("#adminUnlockForm", { timeout: 10000 });
    await page.fill('input[name="adminEmail"]', ADMIN.email);
    await page.fill('input[name="adminPassword"]', ADMIN.password);
    await page.fill('input[name="adminCode"]', ADMIN.code);
    await page.click("#adminUnlockForm button[type='submit']");
    await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 15000 });
    await page.waitForSelector("#adminSectionNav", { timeout: 10000 });
    const navButtons = await page.locator("#adminSectionNav button").count();
    assert(navButtons > 0, `${label}: admin section navigation missing`);
  });

  const unhandled = await page.evaluate(() => window.__smokeRejections || []);
  const badConsole = consoleErrors.filter((msg) =>
    !/favicon|manifest|Failed to load resource.*(404|favicon)/i.test(msg)
    && !/net::ERR_/i.test(msg)
  );
  assert(!pageErrors.length, `${label}: pageerror: ${pageErrors.join(" | ")}`);
  assert(!unhandled.length, `${label}: unhandled rejections: ${unhandled.join(" | ")}`);
  assert(!badConsole.length, `${label}: console errors: ${badConsole.join(" | ")}`);

  await browser.close();
  return { label, ok: true };
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required for homepage smoke test");
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
    assert(login.status === 200, `Admin bootstrap login failed: ${login.status}`);
    const proLesson = await seedProLessonForLockedPreview(login.json.token);
    assert(proLesson, "Failed to seed Pro lesson for locked preview smoke");
    const baseUrl = `http://127.0.0.1:${PORT}`;

    console.log("1) Desktop homepage smoke (1280px)");
    await runViewportSmoke(playwright, baseUrl, { width: 1280, height: 900 }, "desktop", proLesson);

    console.log("2) Mobile homepage smoke (412px)");
    await runViewportSmoke(playwright, baseUrl, { width: 412, height: 915 }, "mobile", proLesson);

    console.log("\nHomepage smoke checks passed (desktop + mobile).");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
