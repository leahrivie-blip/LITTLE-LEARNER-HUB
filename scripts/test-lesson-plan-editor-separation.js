#!/usr/bin/env node
/**
 * Step 1 — Lesson Plan Create vs Edit separation.
 * Verifies Edit opens the true editor (not Lesson Plan Helper).
 * Run: node scripts/test-lesson-plan-editor-separation.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19710 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-editor-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-editor-admin@test.local",
  password: "lesson-editor-pass",
  code: "lesson-editor-code",
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
    } catch {
      /* retry */
    }
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
  const planId = `cur-lp-editor-sep-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Editor Separation Test Plan";
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
      theme: "Colors",
    },
  });
  if (save.status !== 200) {
    console.error("Seed failed", save.status, save.text);
    return null;
  }
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
  const pass = (name) => console.log(`✓ ${name}`);
  const check = (name, condition, detail = "") => {
    if (condition) pass(name);
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
    assert(login.status === 200 && login.json?.token, `Admin login failed: ${login.status}`);
    const freeLesson = await seedFreeLesson(login.json.token);
    assert(freeLesson, "Failed to seed lesson plan");

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-editor@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-editor@example.com": {
          email: "lesson-editor@example.com",
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
    await page.waitForFunction(() => typeof setView === "function" && typeof openLessonPlanEditor === "function", null, { timeout: 30000 });

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.fill("#lessonPlanSearch", freeLesson.title);
    await page.waitForTimeout(400);
    await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${freeLesson.title}")`, { timeout: 15000 });
    await page.locator("#view-lessons .lesson-plan-card").first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

    const editCount = await page.locator("[data-edit-lesson-plan]").count();
    check("Edit Lesson Plan button visible in viewer", editCount > 0);
    await page.locator("[data-edit-lesson-plan]").first().click();
    await page.waitForSelector("#view-lesson-editor.active-view #userLessonPlanEditorForm", { timeout: 10000 });

    check("True lesson editor view opens", await page.locator("#view-lesson-editor.active-view #userLessonPlanEditorForm").count() > 0);
    check("Lesson Plan Helper is not shown", await page.locator("#view-generators.active-view").count() === 0);

    const editorText = await page.locator("#view-lesson-editor.active-view").innerText();
    check(
      "Editor has no generator helper chrome",
      !/What do you need today\?/i.test(editorText)
        && !/Documentation Helpers/i.test(editorText)
        && !/Childcare Generators/i.test(editorText),
    );
    check("Jump nav includes Weekly Info", await page.locator('a[href="#lesson-editor-weekly"]').count() > 0);
    check("Jump nav includes Monday", await page.locator('a[href="#lesson-editor-day-monday"]').count() > 0);
    check("Sticky save bar present", await page.locator("[data-lesson-editor-sticky]").count() > 0);
    check("Route hash points at /edit", /#\/lesson-plans\/.+\/edit/i.test(page.url()));

    await page.fill('#userLessonPlanEditorForm input[name="theme"]', "Edited Colors Theme");
    await page.click('button[form="userLessonPlanEditorForm"], #userLessonPlanEditorForm button[type="submit"]');
    await page.waitForTimeout(600);
    const statusText = await page.locator("[data-lesson-editor-save-status]").innerText();
    check("Save status updates after save", /saved|Saving/i.test(statusText));

    const stored = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("llhUploadedResources") || "[]");
      } catch {
        return [];
      }
    });
    const copy = stored.find((item) => item._userLessonCopy && item._sourceLessonPlanId === freeLesson.planId);
    check("Personal editable copy created", Boolean(copy), `uploads=${stored.length}`);
    check("Saved theme persisted on copy", copy?._curriculumLessonPlan?.theme === "Edited Colors Theme");

    await page.click("[data-lesson-editor-back]");
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    check("Back returns to library", await page.locator("#view-lessons.active-view").count() > 0);

    await page.evaluate((id) => openLessonPlanEditor(id), freeLesson.planId);
    await page.waitForSelector("#view-lesson-editor.active-view #userLessonPlanEditorForm", { timeout: 10000 });
    check("Re-open editor from source plan id works", await page.locator("#view-lesson-editor.active-view #userLessonPlanEditorForm").count() > 0);

    await page.evaluate((id) => {
      const btn = document.createElement("button");
      btn.setAttribute("data-customize-lesson-ai", id);
      document.body.appendChild(btn);
      btn.click();
      btn.remove();
    }, freeLesson.planId);
    await page.waitForTimeout(500);
    check("Legacy Customize attribute opens editor not helper", await page.locator("#view-lesson-editor.active-view #userLessonPlanEditorForm").count() > 0);
    check("Legacy path still avoids generators view", await page.locator("#view-generators.active-view").count() === 0);

    if (failures.length) {
      throw new Error(`${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    }
    console.log("\nAll lesson editor separation checks passed.");
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
