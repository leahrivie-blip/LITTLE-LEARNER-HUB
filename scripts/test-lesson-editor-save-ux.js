#!/usr/bin/env node
/**
 * Step 3 — Lesson editor save UX (leave dialog + after-save actions).
 * Run: node scripts/test-lesson-editor-save-ux.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19790 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-save-ux-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-save-ux-admin@test.local",
  password: "lesson-save-ux-pass",
  code: "lesson-save-ux-code",
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
  const planId = `cur-lp-save-ux-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Save UX Lesson Plan";
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
      theme: "Save UX",
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-save-ux@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-save-ux@example.com": {
          email: "lesson-save-ux@example.com",
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
    await page.waitForFunction(() => typeof openLessonPlanEditor === "function", null, { timeout: 30000 });

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.waitForFunction((title) => resources.some((item) => item.title === title), lesson.title, { timeout: 15000 });
    await page.evaluate((id) => openLessonPlanEditor(id), lesson.planId);
    await page.waitForSelector("#view-lesson-editor.active-view #userLessonPlanEditorForm", { timeout: 10000 });

    await page.fill('#userLessonPlanEditorForm input[name="theme"]', "Unsaved Theme");
    await page.waitForTimeout(100);
    const dirtyStatus = await page.locator("[data-lesson-editor-save-status]").innerText();
    check("Dirty status shows unsaved changes", /Unsaved changes/i.test(dirtyStatus), dirtyStatus);

    await page.click("[data-lesson-editor-back]");
    await page.waitForSelector("[data-lesson-editor-leave-dialog]:not([hidden])", { timeout: 5000 });
    const leaveCopy = await page.evaluate(() => ({
      title: document.querySelector("#lessonEditorLeaveTitle")?.textContent.trim() || "",
      hasSave: Boolean(document.querySelector("[data-lesson-editor-leave-save]")),
      hasDiscard: Boolean(document.querySelector("[data-lesson-editor-leave-discard]")),
      hasCancel: Boolean(document.querySelector('[data-lesson-editor-leave-cancel="button"]')),
    }));
    check("Leave dialog title", /unsaved changes/i.test(leaveCopy.title), leaveCopy.title);
    check("Leave dialog has Save", leaveCopy.hasSave);
    check("Leave dialog has Discard", leaveCopy.hasDiscard);
    check("Leave dialog has Cancel", leaveCopy.hasCancel);

    await page.click('[data-lesson-editor-leave-cancel="button"]');
    await page.waitForFunction(() => document.querySelector("[data-lesson-editor-leave-dialog]")?.hidden === true, null, { timeout: 5000 });
    check("Cancel keeps editor open", await page.locator("#view-lesson-editor.active-view #userLessonPlanEditorForm").count() > 0);

    await page.click("[data-lesson-editor-back]");
    await page.waitForSelector("[data-lesson-editor-leave-dialog]:not([hidden])", { timeout: 5000 });
    await page.click("[data-lesson-editor-leave-save]");
    await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
    check("Leave + Save returns to library", await page.locator("#view-lessons.active-view").count() > 0);

    const storedTheme = await page.evaluate((sourceId) => {
      const uploads = JSON.parse(localStorage.getItem("llhUploadedResources") || "[]");
      const copy = uploads.find((item) => item._userLessonCopy && item._sourceLessonPlanId === sourceId);
      return copy?._curriculumLessonPlan?.theme || "";
    }, lesson.planId);
    check("Leave + Save persisted theme", storedTheme === "Unsaved Theme", storedTheme);

    await page.evaluate((id) => openLessonPlanEditor(id), lesson.planId);
    await page.waitForSelector("#userLessonPlanEditorForm", { timeout: 10000 });
    await page.fill('#userLessonPlanEditorForm input[name="theme"]', "After Save Theme");
    await page.click('button[form="userLessonPlanEditorForm"]');
    await page.waitForSelector("[data-lesson-editor-success]", { timeout: 5000 });
    const success = await page.evaluate(() => {
      const root = document.querySelector("[data-lesson-editor-success]");
      const labels = [...(root?.querySelectorAll("button") || [])].map((el) => el.textContent.trim());
      return {
        title: root?.querySelector("h3")?.textContent.trim() || "",
        labels,
        formHidden: document.querySelector(".lesson-editor-form-wrap")?.hidden === true,
        status: document.querySelector("[data-lesson-editor-save-status]")?.textContent.trim() || "",
      };
    });
    check("Success title", /Lesson Plan Saved Successfully/i.test(success.title), success.title);
    check("Form hidden while success shows", success.formHidden);
    check("Success has Continue Editing", success.labels.includes("Continue Editing"));
    check("Success has Use This Plan", success.labels.includes("Use This Plan"));
    check("Success has Print", success.labels.includes("Print"));
    check("Success has Download", success.labels.includes("Download"));
    check("Success has Download Full Lesson Plan", success.labels.includes("Download Full Lesson Plan"));
    check("Success has Return to Library", success.labels.includes("Return to Library"));
    check("Status shows last saved", /Last saved/i.test(success.status), success.status);

    await page.click("[data-lesson-editor-continue]");
    await page.waitForFunction(() => document.querySelector(".lesson-editor-form-wrap")?.hidden !== true, null, { timeout: 5000 });
    check("Continue Editing restores form", await page.locator("#userLessonPlanEditorForm").count() > 0);

    await page.fill('#userLessonPlanEditorForm input[name="theme"]', "Discard Theme");
    await page.click("[data-lesson-editor-back]");
    await page.waitForSelector("[data-lesson-editor-leave-dialog]:not([hidden])", { timeout: 5000 });
    await page.click("[data-lesson-editor-leave-discard]");
    await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
    const discardedTheme = await page.evaluate((sourceId) => {
      const uploads = JSON.parse(localStorage.getItem("llhUploadedResources") || "[]");
      const copy = uploads.find((item) => item._userLessonCopy && item._sourceLessonPlanId === sourceId);
      return copy?._curriculumLessonPlan?.theme || "";
    }, lesson.planId);
    check("Discard leaves previous saved theme", discardedTheme === "After Save Theme", discardedTheme);

    if (failures.length) throw new Error(`${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    console.log("\nAll lesson editor save UX checks passed.");
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
