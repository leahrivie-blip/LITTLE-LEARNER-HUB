#!/usr/bin/env node
/**
 * Regression: Lesson Plan Library card buttons (Use This Plan + Save)
 * must work when nested inside clickable [data-view-resource] cards.
 * Run: npm run test:lesson-card-buttons
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19810 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-card-buttons-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-card-buttons-admin@test.local",
  password: "lesson-card-buttons-pass",
  code: "lesson-card-buttons-code",
};
const USER_EMAIL = "lesson-card-buttons@example.com";

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

function staticWiringChecks() {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(
    !/lesson-plan-card-actions"[^>]*onclick\s*=\s*["'][^"']*stopPropagation/.test(app),
    "lesson-plan-card-actions must not stopPropagation (blocks Use This Plan)",
  );
  const favoriteIdx = app.indexOf('const favoriteButton = event.target.closest("[data-favorite]")');
  const usePlanIdx = app.indexOf('const lessonCardUsePlan = event.target.closest("[data-lesson-card-use-plan]")');
  const viewResourceIdx = app.indexOf('const viewResourceButton = event.target.closest("[data-view-resource]")');
  assert(favoriteIdx > 0, "favorite click handler missing");
  assert(usePlanIdx > 0, "Use This Plan click handler missing");
  assert(viewResourceIdx > 0, "view-resource click handler missing");
  assert(favoriteIdx < viewResourceIdx, "favorite handler must run before view-resource");
  assert(usePlanIdx < viewResourceIdx, "Use This Plan handler must run before view-resource");
  assert(
    app.includes("lessonWorkspaceSaveButtonHtml(resource.id)"),
    "workspace chrome must render the Save button",
  );
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
  const planId = `cur-lp-card-btns-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Card Buttons Wiring Plan";
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
      theme: "Card Buttons",
    },
  });
  if (save.status !== 200) return null;
  return { planId, title };
}

async function main() {
  staticWiringChecks();
  console.log("✓ static click-handler wiring");

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200 && login.json?.token, "Admin login failed");
    const lesson = await seedFreeLesson(login.json.token);
    assert(lesson, "Failed to seed lesson");

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await page.evaluate((email) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
        },
      }));
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhFavorites", JSON.stringify([]));
    }, USER_EMAIL);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function" && typeof isProUser === "function" && isProUser(), null, { timeout: 30000 });
    // Logged-in boot finishes on Calendar; wait for that before opening Lessons.
    await page.waitForSelector("#view-calendar.active-view", { timeout: 30000 });

    await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 10000 });
    await page.fill("#view-lessons.active-view #lessonPlanSearch", lesson.title);
    await page.waitForTimeout(400);
    await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${lesson.title}")`, { timeout: 15000 });

    const card = page.locator(`#view-lessons .lesson-plan-card:has-text("${lesson.title}")`).first();
    await card.locator(".lesson-plan-save-btn").click();
    await page.waitForTimeout(200);
    const savedOnCard = await page.evaluate((title) => {
      const match = [...document.querySelectorAll("#view-lessons .lesson-plan-card")]
        .find((el) => el.textContent.includes(title));
      const btn = match?.querySelector(".lesson-plan-save-btn");
      const favs = JSON.parse(localStorage.getItem("llhFavorites") || "[]");
      const id = match?.getAttribute("data-lesson-card") || "";
      return {
        isSaved: btn?.classList.contains("is-saved") || false,
        pressed: btn?.getAttribute("aria-pressed") === "true",
        inFavorites: favs.includes(id),
        viewerOpen: Boolean(document.querySelector("#resourceViewerModal.open")),
        id,
      };
    }, lesson.title);
    assert(!savedOnCard.viewerOpen, "Save star should not open the viewer");
    assert(savedOnCard.inFavorites && savedOnCard.isSaved && savedOnCard.pressed, "Save star should toggle favorite on the card");
    console.log("✓ library Save star toggles favorite without opening viewer");

    await card.locator("[data-lesson-card-use-plan]").click();
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
    await page.waitForSelector(".lesson-workspace-action-sheet:not([hidden])", { timeout: 10000 });
    const usePlanState = await page.evaluate(() => {
      const sheet = document.querySelector(".lesson-workspace-action-sheet");
      const saveBtn = document.querySelector(".lesson-workspace-save-btn");
      return {
        sheetOpen: sheet && !sheet.hidden,
        hasSave: Boolean(saveBtn),
        saveLabel: (saveBtn?.textContent || "").trim(),
      };
    });
    assert(usePlanState.sheetOpen, "Use This Plan should open the assign sheet");
    assert(usePlanState.hasSave, "workspace Save button should render");
    assert(/Saved|Save/.test(usePlanState.saveLabel), "workspace Save button label missing");
    console.log("✓ Use This Plan opens assign sheet");
    console.log("✓ workspace Save button is present");

    await page.locator('.lesson-workspace-use-plan-choices [data-lesson-workspace-action-sheet-dismiss]').click();
    await page.waitForSelector(".lesson-workspace-action-sheet[hidden]", { state: "attached", timeout: 5000 });
    await page.locator(".lesson-workspace-save-btn").click();
    await page.waitForTimeout(200);
    const afterWorkspaceSave = await page.evaluate((id) => {
      const favs = JSON.parse(localStorage.getItem("llhFavorites") || "[]");
      const btn = document.querySelector(".lesson-workspace-save-btn");
      return {
        inFavorites: favs.includes(id),
        label: (btn?.textContent || "").trim(),
        isSaved: btn?.classList.contains("is-saved") || false,
      };
    }, savedOnCard.id);
    assert(!afterWorkspaceSave.inFavorites && afterWorkspaceSave.label === "Save" && !afterWorkspaceSave.isSaved, "workspace Save should unfavorite");
    console.log("✓ workspace Save toggles favorite");

    console.log("Lesson card button wiring checks passed.");
    await browser.close();
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
    if (browser) await browser.close().catch(() => {});
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
