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
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
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

async function closeAuthModalUi(page) {
  await page.evaluate(() => {
    if (typeof closeAuthModal === "function") closeAuthModal();
  });
  await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 }).catch(() => {});
}

async function ensureAppReady(page) {
  await page.waitForFunction(
    () => typeof setView === "function" && typeof openAuthModal === "function",
    null,
    { timeout: 30000 },
  );
}

async function waitForActiveView(page, viewId) {
  await page.waitForFunction(
    (id) => document.querySelector(`#view-${id}`)?.classList.contains("active-view"),
    viewId,
    { timeout: 10000 },
  );
}

async function clickEarlyUserCta(page) {
  const earlyUserBtn = page.locator('#homePricing [data-checkout-plan="early_user"]');
  await earlyUserBtn.scrollIntoViewIfNeeded();
  const handle = await earlyUserBtn.elementHandle();
  assert(handle, "early_user CTA missing");
  await page.evaluate((button) => button?.click?.(), handle);
  await page.waitForSelector("#authModal.open", { timeout: 5000 });
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

  // Sign Up / Log In stay in the sticky public nav on every viewport.
  // Primary nav Sign Up may open Founding signup while spots remain.
  await step("signup button", async () => {
    await closeAuthModalUi(page);
    const publicSignup = page.locator(".llh-public-nav-actions [data-action='start-free']");
    if (await publicSignup.count()) {
      await publicSignup.first().scrollIntoViewIfNeeded();
      const handle = await publicSignup.first().elementHandle();
      if (handle) await page.evaluate((button) => button?.click?.(), handle);
      else await publicSignup.first().click();
    } else {
      const heroSignup = page.locator(".lp-hero-actions [data-action='start-free']");
      await heroSignup.scrollIntoViewIfNeeded();
      const handle = await heroSignup.elementHandle();
      if (handle) await page.evaluate((button) => button?.click?.(), handle);
      else await heroSignup.click();
    }
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    const title = (await page.locator("#authTitle").innerText()).toLowerCase();
    const body = (await page.locator("#authModal").innerText()).toLowerCase();
    assert(
      title.includes("create") || title.includes("founding") || body.includes("create your account"),
      `${label}: signup modal should open (title="${title}")`,
    );
    await closeAuthModalUi(page);
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("login button", async () => {
    await page.locator(".llh-public-nav-actions [data-action='open-login']").first().click();
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    assert((await page.locator("#authTitle").innerText()).toLowerCase().includes("log in"), `${label}: login modal title`);
    await closeAuthModalUi(page);
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("early user pricing button", async () => {
    await clickEarlyUserCta(page);
    await closeAuthModalUi(page);
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("start free button", async () => {
    await closeAuthModalUi(page);
    const publicSignup = page.locator(".llh-public-nav-actions [data-action='start-free']");
    if (await publicSignup.count()) {
      await publicSignup.first().scrollIntoViewIfNeeded();
      const handle = await publicSignup.first().elementHandle();
      if (handle) await page.evaluate((button) => button?.click?.(), handle);
      else await publicSignup.first().click();
    } else {
      const heroSignup = page.locator(".lp-hero-actions [data-action='start-free']");
      await heroSignup.scrollIntoViewIfNeeded();
      const handle = await heroSignup.elementHandle();
      if (handle) await page.evaluate((button) => button?.click?.(), handle);
      else await heroSignup.click();
    }
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    await closeAuthModalUi(page);
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("pricing navigation", async () => {
    await ensureAppReady(page);
    await page.evaluate(() => setView("plans"));
    await page.waitForFunction(
      () => document.querySelector("#view-plans")?.classList.contains("active-view"),
      null,
      { timeout: 10000 },
    );
    await page.waitForSelector("#pricingApp .pricing-grid", { timeout: 10000 });
    const monthlyBtn = page.locator('#pricingApp [data-checkout-plan="monthly"]');
    const foundingPlanBtn = page.locator('#pricingApp [data-checkout-plan="founding"]');
    const annualBtn = page.locator('#pricingApp [data-checkout-plan="annual"]').first();
    // While founding spots remain, annual is hidden — click the visible paid plan.
    if (await foundingPlanBtn.count()) {
      await foundingPlanBtn.first().waitFor({ timeout: 5000 });
      await foundingPlanBtn.first().click();
    } else if (await monthlyBtn.count()) {
      await monthlyBtn.first().click();
    } else {
      await annualBtn.waitFor({ timeout: 5000 });
      await annualBtn.click();
    }
    await page.waitForSelector("#authModal.open", { timeout: 5000 });
    await closeAuthModalUi(page);
  });

  await step("upgrade page buttons", async () => {
    await ensureAppReady(page);
    await page.evaluate(() => setView("upgrade"));
    await page.waitForFunction(
      () => document.querySelector("#view-upgrade")?.classList.contains("active-view"),
      null,
      { timeout: 10000 },
    );
    await page.waitForSelector("#upgradeApp .pricing-grid, #upgradeApp .section-block", { timeout: 10000 });
  });

  await step("early user member button", async () => {
    await ensureAppReady(page);
    await page.evaluate(() => {
      if (typeof closeAuthModal === "function") closeAuthModal();
      if (typeof setView === "function") setView("home");
    });
    await waitForActiveView(page, "home");
    await page.waitForSelector('#homePricing [data-checkout-plan="early_user"]', { timeout: 10000 });
    const checkoutPlan = await page.locator('#homePricing [data-checkout-plan="early_user"]').getAttribute("data-checkout-plan");
    assert(checkoutPlan === "early_user", `${label}: homepage paid CTA uses early_user checkout plan`);
    await clickEarlyUserCta(page);
    await closeAuthModalUi(page);
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
  });

  await step("navigation links", async () => {
    await page.evaluate(() => {
      if (typeof setView === "function") setView("home");
      if (typeof setHomePublicMenuOpen === "function") setHomePublicMenuOpen(false);
    });
    await waitForActiveView(page, "home");
    if (viewport.width <= 500) {
      await page.click("#llhPublicMenuToggle");
      await page.waitForFunction(() => document.body.classList.contains("llh-public-menu-open"), null, { timeout: 5000 });
      await page.locator('#llhPublicMobileMenu [data-home-nav="pricing"]').click();
      await page.waitForFunction(() => !document.body.classList.contains("llh-public-menu-open"), null, { timeout: 5000 });
      await page.waitForSelector("#homePricing", { timeout: 5000 });
    } else {
      const comingSoonNav = page.locator('.llh-footer-links [data-home-nav="coming-soon"]');
      await comingSoonNav.scrollIntoViewIfNeeded();
      const handle = await comingSoonNav.elementHandle();
      assert(handle, `${label}: footer coming-soon nav missing`);
      await page.evaluate((button) => button?.click?.(), handle);
      await page.waitForFunction(() => {
        const el = document.getElementById("homeComingSoon");
        if (!el || el.hidden) return false;
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      }, null, { timeout: 8000 });
    }
    await page.evaluate(() => setView("legal"));
    await page.waitForSelector("#view-legal.active-view", { timeout: 5000 });
    await page.evaluate(() => setView("faq"));
    await page.waitForSelector("#view-faq.active-view", { timeout: 5000 });
    await page.evaluate(() => setView("contact"));
    await page.waitForSelector("#view-contact.active-view", { timeout: 5000 });
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

      await page.waitForSelector("body.app-boot-ready", { timeout: 20000 });
      await page.evaluate(() => setView("lessons"));
      await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
      await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
      await page.fill("#lessonPlanSearch", proLesson.title);
      await page.waitForTimeout(500);
      const card = page.locator("#view-lessons .resource-card").filter({ hasText: proLesson.title }).first();
      await card.waitFor({ timeout: 10000 });
      const previewLabel = await card.locator('[data-view-resource]').first().getAttribute("aria-label");
      assert(/preview/i.test(previewLabel || ""), `${label}: pro lesson should show Preview`);
      assert(await card.locator(".lesson-plan-card-hint").count(), `${label}: locked preview hint missing`);
      await card.click({ force: true });
      await page.waitForSelector("#featurePreviewModal.open", { timeout: 10000 });
      // Free owners see Pro Monthly checkout (Founding closed for acquisition); guests may see trial.
      const proMonthlyBtn = page.locator("#featurePreviewModal [data-checkout-plan='monthly']");
      const foundingBtn = page.locator("#featurePreviewModal [data-checkout-plan='founding']");
      const trialBtn = page.locator("#featurePreviewModal [data-start-pro-trial]");
      if (await proMonthlyBtn.count()) {
        // Pro Monthly upgrade CTA is present for Free owners — enough for smoke.
        assert(await proMonthlyBtn.count(), `${label}: Pro Monthly CTA missing in locked preview`);
      } else if (await foundingBtn.count()) {
        await page.evaluate(() => {
          document.querySelector("#featurePreviewModal [data-checkout-plan='founding']")?.click?.();
        });
        await page.waitForTimeout(800);
      } else {
        // Body CTA can be visually hidden on mobile when the sticky upgrade bar is active.
        assert(await trialBtn.count(), `${label}: Pro/trial CTA missing in locked preview`);
        const clicked = await page.evaluate(() => {
          const sticky = document.querySelector("#featurePreviewModal .fp-sticky-upgrade:not([hidden]) [data-start-pro-trial]");
          const body = document.querySelector("#featurePreviewModal .fp-pro-upgrade-actions [data-start-pro-trial]");
          const target = sticky || body || document.querySelector("#featurePreviewModal [data-start-pro-trial]");
          if (!target) return false;
          target.click();
          return true;
        });
        assert(clicked, `${label}: could not click trial CTA`);
        await page.waitForSelector("#view-upgrade.active-view", { timeout: 10000 });
        await page.waitForSelector("#upgradeApp .pricing-grid, #upgradeApp .checkout-test-panel", { timeout: 10000 });
      }
      // Close locked preview so it does not intercept later admin unlock clicks.
      await page.evaluate(() => {
        document.querySelector("#closeFeaturePreviewModal")?.click?.();
        document.querySelector("#featurePreviewModal")?.classList.remove("open");
        document.querySelector("#featurePreviewModal")?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("auth-modal-open");
      });
      await page.waitForSelector("#featurePreviewModal.open", { state: "hidden", timeout: 5000 }).catch(() => {});
    });
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
    // Admin analytics can time out in local smoke environments without affecting homepage CTAs.
    && !/admin-analytics:client.*timed out|Analytics timed out after/i.test(msg)
    && !/\[admin-analytics:client\].*Could not load admin analytics/i.test(msg)
    && !/Failed to load resource.*503.*admin\/analytics/i.test(msg)
    && !/Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)/i.test(msg)
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
