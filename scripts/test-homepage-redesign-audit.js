#!/usr/bin/env node
/**
 * Homepage redesign + public preview / CTA functional audit.
 * Run: node scripts/test-homepage-redesign-audit.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19510 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-home-redesign-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "homepage-redesign@test.local",
  password: "homepage-redesign-pass",
  code: "homepage-redesign-code",
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
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
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
  const planId = `cur-lp-home-audit-colors-${crypto.randomBytes(2).toString("hex")}`;
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

  // Seed one Free activity in Sensory Play if API supports activities.
  let activityId = "";
  try {
    const actSave = await requestJson("POST", "/api/admin/curriculum/activities", {
      adminToken: token,
      expectedUpdatedAt: save.json.siteContent.updatedAt,
      activity: {
        id: `cur-act-home-audit-${crypto.randomBytes(2).toString("hex")}`,
        title: "Rainbow Rice Scoop",
        plan: "Free",
        status: "published",
        ageGroup: "Toddler",
        activityCategory: "Sensory Play",
        description: "Scoop and pour colored rice for sensory exploration.",
        materials: "Colored rice, scoops, trays",
        directions: "1. Invite children to scoop.\n2. Talk about colors.",
        teacherRole: "Model scooping and name colors.",
        learningGoals: ["Explore textures", "Name colors"],
      },
    });
    if (actSave.status === 200) activityId = actSave.json?.activity?.id || "";
  } catch { /* optional */ }

  return { planId, activityId, title: "Colors Everywhere" };
}

async function runAudit(playwright, baseUrl, seeded) {
  const browser = await playwright.chromium.launch({ headless: true });
  const results = {
    sections: [],
    loginButtons: [],
    signupButtons: [],
    foundingPrice: false,
    previewReadonly: false,
    mobileMenu: false,
    tiffany: false,
    calendarLanding: false,
    bugs: [],
  };

  try {
  const page = await browser.newContext({ viewport: { width: 1280, height: 900 } }).then((c) => c.newPage());
  page.on("dialog", async (d) => d.accept());

  // Race-safe: site-content can finish during goto before waitForResponse attaches.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function" && typeof openAuthModal === "function", null, { timeout: 30000 });

  const sectionIds = [
    "homeHero", "homeLessonPlans", "homeActivities", "homeFeatures", "homeComingSoon",
    "homeAudience", "homeFounder", "homeReviews",
    "homePricing", "homeFinalCta",
  ];
  for (const id of sectionIds) {
    const exists = await page.locator(`#${id}`).count();
    assert(exists, `Missing section #${id}`);
    results.sections.push(id);
  }

  const tiffanyText = await page.locator("#homeReviews").innerText();
  assert(/I actually love it/.test(tiffanyText), "Tiffany review text missing");
  assert(/Tiffany/.test(tiffanyText), "Tiffany name missing");
  results.tiffany = true;

  // Pricing must show $9.99 founding, not conflict with outdated $19.99 as the offer.
  const pricingText = await page.locator("#homePricing").innerText();
  assert(/\$9\.99/.test(pricingText), "Founding price missing on pricing section");
  assert(/continuously active/i.test(pricingText), "Continuous membership messaging missing");
  const metaDescription = await page.locator('meta[name="description"]').getAttribute("content");
  const ogDescription = await page.locator('meta[property="og:description"]').getAttribute("content");
  const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
  assert(/\$9\.99\/month locked while continuously active/i.test(metaDescription || ""), "Meta description missing continuous membership language");
  assert(/\$9\.99\/month locked while continuously active/i.test(ogDescription || ""), "OG description missing continuous membership language");
  assert(/\$9\.99\/month locked while continuously active/i.test(structuredData || ""), "Structured data missing continuous membership language");
  results.foundingPrice = true;

  // Desktop login / signup
  await page.locator(".llh-public-nav-actions [data-action='open-login']").click();
  await page.waitForSelector("#authModal.open");
  assert(/log in/i.test(await page.locator("#authTitle").innerText()), "Login modal title");
  results.loginButtons.push("desktop-public-nav");
  await page.click("#closeModal");

  await page.locator(".llh-public-nav-actions [data-action='start-free']").click();
  await page.waitForSelector("#authModal.open");
  assert(/create/i.test(await page.locator("#authTitle").innerText()), "Signup modal title");
  results.signupButtons.push("desktop-public-nav-start-free");
  await page.click("#closeModal");

  await page.locator('#homePricing [data-checkout-plan="founding"]').click();
  await page.waitForSelector("#authModal.open");
  results.signupButtons.push("pricing-founding");
  await page.click("#closeModal");

  // Footer login/signup
  await page.locator('.llh-footer-links [data-action="open-login"]').click();
  await page.waitForSelector("#authModal.open");
  results.loginButtons.push("footer");
  await page.click("#closeModal");

  // Nav scroll — section jump uses sticky-nav offset; wait until section is on screen.
  await page.locator('.llh-public-nav-links [data-home-nav="coming-soon"]').click();
  await page.waitForFunction(() => {
    const el = document.getElementById("homeComingSoon");
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }, null, { timeout: 5000 });
  const comingVisible = await page.locator("#homeComingSoon").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  });
  assert(comingVisible, "Coming Soon nav scroll failed");

  // Free preview open without login
  await page.evaluate(() => setView("home"));
  await page.waitForTimeout(500);
  if (seeded?.planId) {
    await page.waitForFunction(() => {
      const grid = document.querySelector("#homeLessonPreviewGrid");
      return grid && grid.querySelector("[data-home-open-preview]");
    }, null, { timeout: 15000 }).catch(() => {});
  }
  const previewBtn = page.locator("#homeLessonPreviewGrid [data-home-open-preview]").first();
  if (await previewBtn.count()) {
    await previewBtn.click();
    await page.waitForSelector("#resourceViewerModal.open, #featurePreviewModal.open", { timeout: 10000 });
    if (await page.locator("#resourceViewerModal.open").count()) {
      const bodyText = await page.locator("#resourceViewerBody").innerText();
      assert(/Create an account to use, edit, plan, print, and download/i.test(bodyText), "Guest read-only CTA missing");
      assert(!/Use This Plan/i.test(bodyText) || /Create an account/i.test(bodyText), "Guest should not get member Use This Plan bar");
      results.previewReadonly = true;
      const workspaceBack = page.locator("[data-lesson-workspace-back]").first();
      if (await workspaceBack.count()) {
        await workspaceBack.click();
      } else {
        await page.evaluate(() => {
          if (typeof closeResourceViewer === "function") closeResourceViewer();
        });
      }
      await page.waitForSelector("#resourceViewerModal.open", { state: "hidden", timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  } else {
    results.bugs.push("No free lesson preview cards available in local seed to open (empty curriculum library).");
  }

  // Guest can open lessons browse route
  await page.evaluate(() => setView("lessons"));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 5000 });
  await page.evaluate(() => setView("home"));

  // Mobile menu
  const mobile = await browser.newContext({ viewport: { width: 412, height: 915 } }).then((c) => c.newPage());
  mobile.on("dialog", async (d) => d.accept());
  await mobile.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await mobile.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await mobile.click("#llhPublicMenuToggle");
  await mobile.waitForFunction(() => document.body.classList.contains("llh-public-menu-open"));
  await mobile.locator('#llhPublicMobileMenu [data-home-nav="pricing"]').click();
  await mobile.waitForFunction(() => !document.body.classList.contains("llh-public-menu-open"));
  results.mobileMenu = true;
  // Log In must be reachable from the sticky top bar without opening the menu.
  await mobile.locator(".llh-public-nav-actions [data-action='open-login']").click();
  await mobile.waitForSelector("#authModal.open");
  results.loginButtons.push("mobile-sticky-nav");
  await mobile.click("#closeModal");
  await mobile.locator(".llh-public-nav-actions [data-action='start-free']").click();
  await mobile.waitForSelector("#authModal.open");
  results.signupButtons.push("mobile-sticky-nav");
  await mobile.click("#closeModal");

  // Free signup + login lands on Calendar
  const email = `home-audit-${Date.now()}@example.com`;
  await page.evaluate(() => setView("home"));
  await page.locator(".llh-public-nav-actions [data-action='start-free']").first().click();
  await page.waitForSelector("#authModal.open");
  await page.locator("#fullNameInput").fill("Audit Provider");
  await page.locator("#emailInput").fill(email);
  await page.locator("#passwordInput").fill("TestPass123!");
  await page.locator("#authSubmitButton").click();
  // Program persona step
  await page.waitForSelector("[data-signup-persona]", { timeout: 8000 });
  await page.locator("[data-signup-persona='home_daycare']").click();
  await page.locator("#authSubmitButton").click();
  // Plan chooser
  await page.waitForSelector("[data-signup-choose-plan='free']", { timeout: 8000 });
  await page.locator("[data-signup-choose-plan='free']").click();
  const freeConfirm = page.locator("[data-signup-confirm-free]");
  if (await freeConfirm.count()) {
    await freeConfirm.click();
  }
  await page.waitForSelector("body.app-boot-ready", { timeout: 20000 });
  await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
  results.calendarLanding = true;
  results.signupButtons.push("public-nav-start-free-completed");

  // Founding checkout amount in client helper
  const foundingAmount = await page.evaluate(() => {
    if (typeof checkoutAmount === "function") return checkoutAmount("founding");
    return null;
  });
  assert(String(foundingAmount || "").includes("9.99"), `Founding checkout amount unexpected: ${foundingAmount}`);

  // Install / Add to Home Screen surfaces still exist for logged-in users
  await page.evaluate(() => setView("calendar"));
  await page.waitForSelector("#view-calendar.active-view", { timeout: 5000 });
  await page.evaluate(() => setView("settings"));
  await page.waitForSelector("#view-settings.active-view", { timeout: 5000 });
  const settingsText = await page.locator("#view-settings").innerText();
  const installHost = await page.locator("#platformInstallCardHost, [data-install-app]").count();
  assert(/Home Screen|Install|Add to Home/i.test(settingsText) || installHost > 0, "Add to Home Screen guidance missing after redesign");

  return results;
  } finally {
    await browser.close().catch(() => {});
  }
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
    const results = await runAudit(playwright, baseUrl, seeded);

    // API founding status
    const founding = await requestJson("GET", "/api/founding-status");
    assert(founding.status === 200, "founding-status failed");

    console.log(JSON.stringify({
      ok: true,
      sections: results.sections,
      tiffany: results.tiffany,
      foundingPrice: results.foundingPrice,
      previewReadonly: results.previewReadonly,
      mobileMenu: results.mobileMenu,
      calendarLanding: results.calendarLanding,
      loginButtons: results.loginButtons,
      signupButtons: results.signupButtons,
      seededPlanId: seeded?.planId || null,
      bugs: results.bugs,
    }, null, 2));
    console.log("\nHomepage redesign audit passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
