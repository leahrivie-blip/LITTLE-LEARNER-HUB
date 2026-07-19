#!/usr/bin/env node
/**
 * Browser E2E for Phase 2 Smart Import admin workflow (desktop + mobile).
 * Run: npm run test:smart-import-e2e
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19820 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-smart-import-e2e-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "smart-import-e2e@test.local",
  password: "smart-import-e2e-pass",
  code: "smart-import-e2e-code",
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
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const health = await requestJson("GET", "/api/health");
      if (health.status === 200 && health.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server boot timeout");
}

async function main() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
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

  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, `login failed ${login.status}`);
    const token = login.json.token;

    // Seed one plan so library search has content.
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    let expectedUpdatedAt = bootstrap.json?.siteContent?.updatedAt || "";
    const seed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: {
        id: "seed-apple-lib",
        title: "Seed Apple Library Plan",
        age: "Preschool",
        theme: "Apples",
        plan: "Free",
        status: "published",
        learningDomains: ["Math", "Science"],
        weeklyOverview: "Apple exploration",
        objectives: "Explore apples",
        weeklyMaterials: "Apples, trays",
        vocabularyWords: "apple, orchard",
        books: [{ title: "Apple Farmer Annie", author: "Monica Wellington", notes: "" }],
        songs: [{ title: "Way Up High in an Apple Tree", notes: "" }],
        dailyPlans: {
          monday: { theme: "Apples", items: [{ itemId: "a1", title: "Apple sort", activityCategory: "Open-Ended Exploration", description: "Sort", materials: "Apples", steps: "1. Sort.\n2. Count." }] },
          tuesday: { theme: "Apples", items: [{ itemId: "a2", title: "Apple count", activityCategory: "Open-Ended Exploration", description: "Count", materials: "Apples", steps: "1. Count." }] },
          wednesday: { theme: "Apples", items: [{ itemId: "a3", title: "Apple paint", activityCategory: "Creative Arts and Expression", description: "Paint", materials: "Paint", steps: "1. Paint." }] },
          thursday: { theme: "Apples", items: [{ itemId: "a4", title: "Taste test", activityCategory: "Open-Ended Exploration", description: "Taste", materials: "Apples", steps: "1. Taste." }] },
          friday: { theme: "Apples", items: [{ itemId: "a5", title: "Dramatic play", activityCategory: "Dramatic Play and Imagination", description: "Play", materials: "Props", steps: "1. Play." }] },
        },
      },
    });
    assert(seed.status === 200, `seed failed ${seed.status} ${JSON.stringify(seed.json)}`);
    expectedUpdatedAt = seed.json.siteContentUpdatedAt;

    // Offline AI assist endpoint should still return heuristic suggestions.
    const assist = await requestJson("POST", "/api/admin/smart-import/assist", {
      adminToken: token,
      action: "fill-missing",
      plan: {
        title: "Preschool Apple Week",
        theme: "Apples",
        weeklyOverview: "Focus on counting, science, and vocabulary.",
      },
    });
    assert(assist.status === 200, `assist ${assist.status}`);
    assert(assist.json?.ok, "assist ok");
    assert(assist.json?.assist?.learningDomains?.includes("Math"), "assist should suggest Math");

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const base = `http://127.0.0.1:${PORT}`;

    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(({ email, token: adminToken }) => {
      localStorage.setItem("llhAdminSession", JSON.stringify({
        email,
        token: adminToken,
        name: "Smart Import E2E",
        mode: "server",
        loggedInAt: new Date().toISOString(),
        trustedDevice: true,
      }));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, { ...ADMIN, token });

    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function" && typeof setAdminSectionTab === "function");
    await page.evaluate(async () => {
      setView("admin");
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent().catch(() => {});
      setAdminSectionTab("curriculum-lesson-plans");
    });
    await page.waitForSelector("#smartLessonImportApp", { timeout: 10000 });
    await page.waitForSelector("[data-smart-workflow='import-multiple']", { timeout: 8000 });
    await page.click("[data-smart-workflow='import-multiple']");
    await page.waitForSelector("#smartImportPasteText", { timeout: 8000 });

    const multiPaste = `Preschool Apple Week
Focus on counting, colors, fine motor, science, and vocabulary.
Monday: Apple investigation
Tuesday: Apple counting
Wednesday: Apple painting
Thursday: Taste test
Friday: Apple pie dramatic play

Toddler Pumpkin Week
Monday: Pumpkin wash
Tuesday: Pumpkin roll
Wednesday: Pumpkin paint
Thursday: Pumpkin song
Friday: Pumpkin patch pretend`;

    await page.fill("#smartImportPasteText", multiPaste);
    await page.click("[data-smart-run-import]");
    await page.waitForSelector(".smart-import-bulk", { timeout: 10000 });
    const reviewCount = await page.locator(".smart-import-table tbody tr").count();
    assert(reviewCount >= 2, `expected >=2 organized plans, got ${reviewCount}`);

    await page.click("[data-smart-library-search]");
    await page.fill("[data-smart-library-query]", "apple");
    await page.click("[data-smart-library-search]");
    await page.waitForTimeout(300);
    const bookAdd = page.locator("[data-smart-add-book]").first();
    if (await bookAdd.count()) {
      await bookAdd.click();
    }

    await page.click("[data-smart-ai-enhance]");
    await page.waitForTimeout(500);
    const suggestionCount = await page.locator(".smart-import-suggestion-row").count();
    assert(suggestionCount >= 1, "expected AI/heuristic suggestions after enhance");

    await page.click("[data-smart-snapshot]");
    await page.click("[data-smart-week-down]");
    await page.waitForTimeout(200);

    // Mobile admin pass
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const hubVisible = await page.locator(".smart-import-bulk, .smart-import-hub").count();
    assert(hubVisible >= 1, "smart import should remain usable on mobile width");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    assert(overflow, "mobile admin smart import should not horizontally overflow");

    await page.click("[data-smart-save-drafts]");
    await page.waitForTimeout(1200);
    const message = await page.locator("[data-smart-message]").innerText();
    assert(/saved/i.test(message), `expected save message, got: ${message}`);

    await browser.close();
    console.log("PASS  smart import admin e2e (desktop + mobile)");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL  smart import admin e2e");
  console.error(error);
  process.exitCode = 1;
});
