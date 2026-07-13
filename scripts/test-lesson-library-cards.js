#!/usr/bin/env node
/**
 * Compact lesson cards + filter/search persistence (Batch 2).
 * Run: node scripts/test-lesson-library-cards.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19560 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-cards-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-cards-admin@test.local",
  password: "lesson-cards-pass",
  code: "lesson-cards-code",
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

async function seedFreeLesson(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(sample, "utf8"));
  if (!parsed.ok) return null;
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-card-free-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Compact Card Readiness Week";
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title,
      plan: "Free",
      status: "published",
      age: "Preschool",
    },
  });
  if (save.status !== 200) return null;
  return { planId, title };
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required");
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
    const freeLesson = await seedFreeLesson(login.json.token);
    assert(freeLesson, "Failed to seed free lesson for card test");

    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-cards@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-cards@example.com": {
          email: "lesson-cards@example.com",
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
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
    await page.fill("#lessonPlanSearch", freeLesson.title);
    await page.waitForTimeout(400);
    await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${freeLesson.title}")`, { timeout: 15000 });

    const cardStats = await page.evaluate((title) => {
      const cards = [...document.querySelectorAll("#view-lessons .lesson-plan-card")];
      const match = cards.find((card) => card.textContent.includes(title));
      const heights = cards.map((card) => card.getBoundingClientRect().height);
      const actionStacks = cards.filter((card) => card.querySelector(".resource-actions")).length;
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return {
        count: cards.length,
        matched: Boolean(match),
        maxHeight: heights.length ? Math.max(...heights) : 0,
        actionStacks,
        hasFiltersBtn: Boolean(document.querySelector("[data-lesson-library-filters-toggle]")),
        hasSavedDestination: Boolean(document.querySelector('[data-lesson-library-mode="saved"]')),
        hasSavedFilterToggle: Boolean(document.querySelector("[data-lesson-library-saved-toggle]")),
        overflow,
        hasOldButtons: match ? /Customize AI|Assign to Week|Add Support|Download PDF/.test(match.textContent) : false,
      };
    }, freeLesson.title);

    assert(cardStats.matched, "seeded free lesson card missing");
    assert(cardStats.hasFiltersBtn && cardStats.hasSavedDestination, "More filters and Saved Plans controls missing");
    assert(!cardStats.hasSavedFilterToggle, "Saved filter toggle should not render");
    assert(cardStats.actionStacks === 0, "compact cards should not show the old action button stack");
    assert(!cardStats.hasOldButtons, "old card action labels should be removed from lesson cards");
    assert(cardStats.maxHeight < 320, `cards too tall: max ${cardStats.maxHeight}px`);
    assert(!cardStats.overflow, "horizontal overflow on mobile library");

    await page.click('button[data-filter="Preschool"]');
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => ({
      search: document.querySelector("#lessonPlanSearch")?.value || "",
      filter: document.querySelector(".lesson-library-age-filters .active-filter")?.textContent || "",
    }));

    await page.locator("#view-lessons .lesson-plan-card").first().click();
    await page.waitForSelector("#resourceViewerModal.open, #featurePreviewModal.open", { timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);

    const after = await page.evaluate(() => ({
      search: document.querySelector("#lessonPlanSearch")?.value || "",
      filter: document.querySelector(".lesson-library-age-filters .active-filter")?.textContent || "",
      viewerOpen: document.querySelector("#resourceViewerModal.open, #featurePreviewModal.open") != null,
    }));
    assert(!after.viewerOpen, "viewer should close");
    assert(after.search === before.search, "search should persist after closing lesson");
    assert(after.filter === before.filter, "age filter should persist after closing lesson");

    console.log("Lesson library compact card checks passed.");
    await browser.close();
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
