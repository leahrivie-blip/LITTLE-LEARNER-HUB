#!/usr/bin/env node
/**
 * Step 2 — Lesson Plan Viewer action bar rebuild.
 * Run: node scripts/test-lesson-viewer-action-bar.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19750 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-action-bar-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-action-bar-admin@test.local",
  password: "lesson-action-bar-pass",
  code: "lesson-action-bar-code",
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
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server failed to boot");
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
  const planId = `cur-lp-action-bar-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Viewer Action Bar Plan";
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
      theme: "Action Bar",
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
  let browser;
  const failures = [];
  const check = (name, condition, detail = "") => {
    if (condition) console.log(`✓ ${name}`);
    else {
      failures.push(detail ? `${name}: ${detail}` : name);
      console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
    }
  };

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
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-action-bar@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-action-bar@example.com": {
          email: "lesson-action-bar@example.com",
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
    await page.fill("#lessonPlanSearch", lesson.title);
    await page.waitForTimeout(400);
    await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: lesson.title }).first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

    const bars = await page.evaluate(() => {
      const labels = (root) => [...root.querySelectorAll("button")].map((el) => el.textContent.trim());
      const top = document.querySelector('[data-lesson-action-bars="top"]');
      const bottom = document.querySelector('[data-lesson-action-bars="bottom"]');
      const allBars = document.querySelectorAll(".lesson-workspace-action-bars");
      const primary = document.querySelector(".lesson-workspace-primary-actions");
      const primaryVisible = [...(primary?.children || [])]
        .filter((el) => el.matches("button"))
        .map((el) => el.textContent.trim());
      const moreLabels = [...document.querySelectorAll(".lesson-workspace-more-menu button")]
        .map((el) => el.textContent.trim());
      const overviewPresent = Boolean(document.querySelector(".lesson-workspace-week-overview, [data-lesson-plan-section]"));
      const actionsAfterPanels = (() => {
        const workspace = document.querySelector(".lesson-workspace");
        if (!workspace) return false;
        const panels = workspace.querySelector(".lesson-workspace-panels");
        const actions = workspace.querySelector(".lesson-workspace-action-bars");
        if (!panels || !actions) return false;
        return Boolean(panels.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING);
      })();
      return {
        top: labels(top || document.createElement("div")),
        bottom: labels(bottom || document.createElement("div")),
        barCount: allBars.length,
        hasMore: Boolean(document.querySelector("[data-lesson-workspace-more-toggle]")),
        primaryVisible,
        moreLabels,
        overviewPresent,
        actionsAfterPanels,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });

    check("Only one action bar rendered", bars.barCount === 1, `found ${bars.barCount}`);
    check("Bottom duplicate action bar removed", bars.bottom.length === 0);
    check("Primary has Use This Plan", bars.primaryVisible.includes("Use This Plan"));
    check("Primary has Print", bars.primaryVisible.includes("Print"));
    check("Primary has Download", bars.primaryVisible.includes("Download"));
    check("No duplicate Add to My Week on primary", !bars.primaryVisible.includes("Add to My Week"));
    check("No duplicate Add to Calendar on primary", !bars.primaryVisible.includes("Add to Calendar"));
    check("Edit lives in More menu", bars.moreLabels.includes("Edit Lesson Plan") && !bars.primaryVisible.includes("Edit Lesson Plan"));
    check("Detailed weekly lives in More menu", bars.moreLabels.some((label) => /Detailed Weekly Lesson Plan/i.test(label)));
    check("Planning sheet lives in More menu", bars.moreLabels.some((label) => /Classroom Planning Sheet/i.test(label)));
    check("Full lesson plan lives in More menu", bars.moreLabels.some((label) => /Full Lesson Plan/i.test(label)));
    check("More menu toggle present", bars.hasMore);
    check("Lesson content appears before actions", bars.actionsAfterPanels);
    check("Week overview content is visible", bars.overviewPresent);
    check("No horizontal overflow on mobile", !bars.overflow);

    await page.locator('[data-lesson-action-bars="top"] [data-lesson-use-this-plan]').click();
    await page.waitForSelector('[data-lesson-workspace-action-panel="use-plan"]:not([hidden])', { timeout: 5000 });
    const choiceSheet = await page.evaluate(() => ({
      title: document.querySelector('[data-lesson-workspace-action-panel="use-plan"] .lesson-workspace-action-sheet-title')?.textContent.trim() || "",
      choices: [...document.querySelectorAll("[data-lesson-use-plan-choice]")].map((el) => el.textContent.trim()),
    }));
    check("Use This Plan opens choice sheet", choiceSheet.title === "Use This Plan", choiceSheet.title);
    check("Choice includes Weekly Plan", choiceSheet.choices.includes("Add to Weekly Plan"));
    check("Choice includes Calendar", choiceSheet.choices.includes("Add to Calendar"));

    await page.locator('[data-lesson-use-plan-choice="my-week"]').click();
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const myWeekSheet = await page.evaluate(() => ({
      title: document.querySelector("[data-lesson-assign-sheet-title]")?.textContent.trim() || "",
      submit: document.querySelector("[data-lesson-assign-submit]")?.textContent.trim() || "",
      intent: document.querySelector('[name="assignIntent"]')?.value || "",
      hasPrint: Boolean(document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-print-variant]')),
    }));
    check("Weekly Plan opens assign sheet", myWeekSheet.title === "Add to Weekly Plan", myWeekSheet.title);
    check("Weekly Plan submit label matches", myWeekSheet.submit === "Add to Weekly Plan", myWeekSheet.submit);
    check("Assign intent is my-week", myWeekSheet.intent === "my-week", myWeekSheet.intent);
    check("Assign sheet has no print options", !myWeekSheet.hasPrint);

    const week = await page.evaluate(() => curriculumPlannerWeekStartIso(new Date()));
    await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', week);
    await page.click("[data-lesson-assign-submit]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
    const success = await page.evaluate(() => ({
      title: document.querySelector("[data-lesson-assign-success-title]")?.textContent.trim() || "",
      plannerPrimary: document.querySelector("[data-lesson-open-weekly-planner]")?.classList.contains("primary-button"),
    }));
    check("Weekly Plan success title", /Added to Weekly Plan/i.test(success.title), success.title);
    check("Weekly Planner is primary success CTA", success.plannerPrimary);

    await page.click("[data-lesson-workspace-action-sheet-dismiss]");
    await page.locator('[data-lesson-action-bars="top"] [data-lesson-use-this-plan]').click();
    await page.waitForSelector('[data-lesson-workspace-action-panel="use-plan"]:not([hidden])', { timeout: 5000 });
    await page.locator('[data-lesson-use-plan-choice="calendar"]').click();
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const calendarSheet = await page.evaluate(() => document.querySelector("[data-lesson-assign-sheet-title]")?.textContent.trim() || "");
    check("Add to Calendar opens pick-week form", calendarSheet === "Add to Calendar", calendarSheet);

    await page.click("[data-lesson-workspace-action-sheet-dismiss]");
    await page.locator("[data-lesson-workspace-more-toggle]").click();
    await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
    await page.locator('.lesson-workspace-more-menu [data-lesson-workspace-back]').click();
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
    check("More → Back to Library closes viewer", true);

    if (failures.length) throw new Error(`${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    console.log("\nAll lesson viewer action bar checks passed.");
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
