#!/usr/bin/env node
/**
 * Weekly classroom downloads are PDF calendars (not garbled DOCX).
 * Full lesson plan download is also PDF by default.
 * Run: npm run test:lesson-weekly-docx
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const PORT = 19640 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-weekly-docx-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-weekly-docx-admin@test.local",
  password: "lesson-weekly-docx-pass",
  code: "lesson-weekly-docx-code",
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
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function seedFreeLesson(token) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  if (!parsed.ok) return null;
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-weekly-docx-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Weekly Calendar PDF Lesson";
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
      theme: "Garden Scientists",
    },
  });
  if (save.status !== 200) return null;
  return { planId, title };
}

function assertPdf(buf, label) {
  assert(buf.slice(0, 5).toString() === "%PDF-", `${label} is not a PDF`);
  assert(buf.length > 900, `${label} too small: ${buf.length}`);
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(appJs.includes('preferDocx = options.format === "docx" && safeVariant === "full"'),
    "weekly downloads must not default to DOCX");

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.log("Browser checks skipped — playwright not installed");
    console.log("Static weekly PDF routing checks passed.");
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-weekly-docx@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-weekly-docx@example.com": {
          email: "lesson-weekly-docx@example.com",
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
    await page.waitForFunction(() => typeof downloadLessonPlanVariant === "function", null, { timeout: 30000 });

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.waitForFunction((title) => resources.some((item) => item.title === title), lesson.title, { timeout: 15000 });
    await page.fill("#lessonPlanSearch", lesson.title);
    await page.waitForTimeout(300);
    await page.locator("#view-lessons .lesson-plan-card").first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

    const weekDownload = page.waitForEvent("download", { timeout: 10000 });
    await page.locator('[data-lesson-action-bars="top"] .lesson-workspace-primary-actions > [data-lesson-download-variant="week"]').click();
    const weekFile = await weekDownload;
    const weekName = weekFile.suggestedFilename();
    check("Weekly download filename ends with .pdf", /\.pdf$/i.test(weekName), weekName);
    const weekPath = path.join(os.tmpdir(), `llh-week-${crypto.randomBytes(3).toString("hex")}.pdf`);
    await weekFile.saveAs(weekPath);
    const weekBuf = fs.readFileSync(weekPath);
    try {
      assertPdf(weekBuf, "weekly calendar");
      check("Weekly download is a PDF package", true);
    } catch (error) {
      check("Weekly download is a PDF package", false, error.message);
    }
    check("Weekly PDF has meaningful size", weekBuf.length > 900, `bytes=${weekBuf.length}`);

    await page.locator("[data-lesson-workspace-more-toggle]").click();
    await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
    const fullDownload = page.waitForEvent("download", { timeout: 10000 });
    await page.locator('.lesson-workspace-more-menu [data-lesson-download-variant="full"]').click();
    const fullFile = await fullDownload;
    const fullName = fullFile.suggestedFilename();
    check("Full download filename ends with .pdf", /\.pdf$/i.test(fullName), fullName);
    const fullPath = path.join(os.tmpdir(), `llh-full-${crypto.randomBytes(3).toString("hex")}.pdf`);
    await fullFile.saveAs(fullPath);
    const fullBuf = fs.readFileSync(fullPath);
    try {
      assertPdf(fullBuf, "full lesson plan");
      check("Full download is a PDF package", true);
    } catch (error) {
      check("Full download is a PDF package", false, error.message);
    }
    check("Full PDF has meaningful size", fullBuf.length > 900, `bytes=${fullBuf.length}`);

    const requestMeta = await page.evaluate(() => window.__llhLastResourceOutputRequest || null);
    check("Last download recorded as PDF", requestMeta?.format === "pdf", JSON.stringify(requestMeta));

    try { fs.unlinkSync(weekPath); } catch { /* ignore */ }
    try { fs.unlinkSync(fullPath); } catch { /* ignore */ }

    if (failures.length) {
      throw new Error(`${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    }
    console.log("\nAll weekly/full PDF download checks passed.");
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
