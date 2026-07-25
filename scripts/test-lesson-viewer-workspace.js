#!/usr/bin/env node
/**
 * Lesson plan workspace viewer + Week at a Glance (Batches 3–4).
 * Run: node scripts/test-lesson-viewer-workspace.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19610 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-workspace-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-workspace-admin@test.local",
  password: "lesson-workspace-pass",
  code: "lesson-workspace-code",
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
  const planId = `cur-lp-workspace-free-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Workspace Week Readiness Plan";
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
    assert(freeLesson, "Failed to seed free lesson for workspace test");

    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-workspace@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-workspace@example.com": {
          email: "lesson-workspace@example.com",
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
    // Phase 23: logged-in boot finishes on Today (not Calendar).
    await page.waitForSelector("#view-today.active-view", { timeout: 30000 });

    await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 10000 });
    await page.fill("#view-lessons.active-view #lessonPlanSearch", freeLesson.title);
    await page.waitForTimeout(400);
    await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${freeLesson.title}")`, { timeout: 15000 });
    await page.locator("#view-lessons .lesson-plan-card").first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

    const workspace = await page.evaluate(() => {
      const modal = document.querySelector("#resourceViewerModal");
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      const tabs = [...document.querySelectorAll("[data-lesson-workspace-tab]")].map((el) => el.textContent.trim());
      const dayTabs = [...document.querySelectorAll("[data-lesson-workspace-week-day]")].map((el) => el.textContent.trim());
      const activityRows = document.querySelectorAll(".lesson-workspace-activity-row, .lesson-workspace-activity-card").length;
      return {
        hasBack: Boolean(document.querySelector("[data-lesson-workspace-back]")),
        hasUseThisPlan: Boolean(document.querySelector("[data-lesson-use-this-plan]")),
        hasEdit: Boolean(document.querySelector("[data-edit-lesson-plan]")),
        hasPrintWeekly: Boolean(document.querySelector('[data-lesson-action-bars="top"] [data-lesson-print-variant="week"]')),
        hasDownloadWeekly: Boolean(document.querySelector('[data-lesson-action-bars="top"] [data-lesson-download-variant="week"]')),
        hasBottomBar: Boolean(document.querySelector('[data-lesson-action-bars="bottom"]')),
        actionBarCount: document.querySelectorAll(".lesson-workspace-action-bars").length,
        hasMore: Boolean(document.querySelector("[data-lesson-workspace-more-toggle]")),
        hasOverview: Boolean(document.querySelector(".lesson-workspace-week-overview, [data-lesson-plan-section]")),
        actionsAfterPanels: (() => {
          const panels = document.querySelector(".lesson-workspace-panels");
          const actions = document.querySelector(".lesson-workspace-action-bars");
          return Boolean(panels && actions && (panels.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING));
        })(),
        tabs,
        dayTabs,
        activityRows,
        weekPanelActive: document.querySelector('[data-lesson-workspace-panel="week"]')?.classList.contains("is-active"),
        title: document.querySelector(".lesson-workspace-title")?.textContent || "",
        meta: document.querySelector(".lesson-workspace-meta")?.textContent || "",
        toolbarHidden: document.querySelector(".resource-viewer-toolbar")?.hidden === true,
        overflow,
        modalClass: modal?.className || "",
      };
    });

    assert(workspace.modalClass.includes("lesson-workspace-mode"), "lesson workspace mode not applied");
    assert(workspace.hasBack, "workspace back button missing");
    assert(workspace.hasUseThisPlan && workspace.hasEdit, "primary/manage actions missing");
    assert(workspace.hasPrintWeekly && workspace.hasDownloadWeekly, "print/download weekly actions missing");
    assert(!workspace.hasBottomBar, "duplicate bottom action bar should be removed");
    assert(workspace.actionBarCount === 1, "exactly one action bar should render");
    assert(workspace.hasMore, "More actions menu should be present");
    assert(workspace.hasOverview, "Week tab should show weekly overview content");
    assert(workspace.actionsAfterPanels, "actions should appear after lesson content");
    assert(workspace.toolbarHidden, "duplicate toolbar should be hidden for lessons");
    assert(workspace.tabs.join(",") === "Week,Plan,Activities,Materials", `unexpected tabs: ${workspace.tabs.join(",")}`);
    assert(workspace.weekPanelActive, "Week tab should be active by default");
    assert(workspace.dayTabs.length === 5, `expected 5 weekday tabs, got ${workspace.dayTabs.length}`);
    assert(workspace.dayTabs.includes("Mon") && workspace.dayTabs.includes("Fri"), "weekday labels missing");
    assert(workspace.activityRows > 0, "Week at a Glance should list activities");
    assert(workspace.title.includes("Workspace"), "workspace title missing");
    assert(/Preschool/.test(workspace.meta) && /Free/.test(workspace.meta), "workspace meta should show age and plan");
    assert(!workspace.overflow, "horizontal overflow in workspace viewer");

    await page.click("[data-lesson-workspace-tab='plan']");
    await page.waitForSelector('[data-lesson-workspace-panel="plan"].is-active', { timeout: 3000 });

    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const sheetCopy = await page.evaluate(() => ({
      title: document.querySelector("[data-lesson-assign-sheet-title]")?.textContent.trim() || "",
      submit: document.querySelector("[data-lesson-assign-submit]")?.textContent.trim() || "",
      hasCancel: Boolean(document.querySelector("[data-lesson-workspace-action-sheet-dismiss]")),
      hasPrintInSheet: Boolean(document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-print-variant]')),
    }));
    assert(sheetCopy.title === "Add to Calendar", `sheet title wrong: ${sheetCopy.title}`);
    assert(sheetCopy.submit === "Add to Calendar", `sheet submit wrong: ${sheetCopy.submit}`);
    assert(sheetCopy.hasCancel, "Cancel missing from assign sheet");
    assert(!sheetCopy.hasPrintInSheet, "assign sheet should not mix in print options");
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");
    await page.waitForFunction(() => document.querySelector(".lesson-workspace-action-sheet")?.hidden === true, null, { timeout: 3000 });

    await page.click("[data-lesson-workspace-back]");
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });

    console.log("Lesson viewer workspace checks passed.");
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
