#!/usr/bin/env node
/**
 * Classroom-ready weekly calendar PDF downloads (no garbled DOCX).
 * Run: node scripts/test-lesson-weekly-calendar-pdf.js
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
const PORT = 19780 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-weekly-pdf-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "weekly-pdf-admin@test.local",
  password: "weekly-pdf-pass",
  code: "weekly-pdf-code",
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

function assertPdf(buf, label) {
  assert(buf.slice(0, 5).toString() === "%PDF-", `${label} is not a PDF`);
  assert(buf.length > 900, `${label} too small: ${buf.length}`);
  const text = buf.toString("latin1");
  assert(!/PK\x03\x04/.test(text.slice(0, 20)), `${label} looks like a DOCX/ZIP`);
}

async function main() {
  console.log("0) Static HTML helpers include classroom-ready day fields");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(appJs.includes("buildLessonPlanWeeklyCalendarBoardPdfBlob"), "landscape calendar PDF builder missing");
  assert(appJs.includes("buildLessonPlanPlanningSheetPdfBlob"), "planning sheet PDF builder missing");
  assert(appJs.includes('data-lesson-download-variant="week-detail"'), "detailed weekly download missing");
  assert(appJs.includes('data-lesson-download-variant="planning"'), "planning sheet download missing");
  assert(!/preferDocx = options\.format[\s\S]{0,80}safeVariant === "week"/.test(appJs)
    || appJs.includes('preferDocx = options.format === "docx" && safeVariant === "full"'),
  "weekly download should not default to DOCX");

  let playwright;
  try { playwright = require("playwright"); } catch {
    console.log("Browser checks skipped — playwright not installed");
    console.log("\nWeekly calendar PDF static checks passed.");
    return;
  }

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200 && login.json?.token, "admin login failed");
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(login.json.token)}`);
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: login.json.token,
      siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
    });
    const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
    assert(parsed.ok, parsed.errors.join(" "));
    const title = "Weekly PDF Classroom Garden";
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: login.json.token,
      expectedUpdatedAt: touch.json.siteContent.updatedAt,
      lessonPlan: {
        ...parsed.data,
        id: `cur-lp-week-pdf-${crypto.randomBytes(3).toString("hex")}`,
        title,
        plan: "Free",
        status: "published",
        age: "Preschool",
        theme: "Garden Scientists",
      },
    });
    assert(save.status === 200, `save failed ${save.status}`);

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "weekly-pdf@test.local");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "weekly-pdf@test.local": { email: "weekly-pdf@test.local", plan: "Free", subscriptionStatus: "Free Plan" },
      }));
      localStorage.setItem("llhPlan", "Free");
    });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => setView("lessons"));
    await page.fill("#lessonPlanSearch", title);
    await page.waitForTimeout(350);
    await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: title }).first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

    const richHtml = await page.evaluate(() => {
      const resource = activeResourceViewerResource;
      const html = lessonPlanWeeklyScheduleHtml(resource, resource._curriculumLessonPlan, { layout: "week-detail" });
      return html;
    });
    assert(/Weekly Summary|Weekly Objectives|Books of the Week|Daily Focus|Materials Needed|Teacher Notes/i.test(richHtml), "detailed HTML missing classroom sections");
    assert(/Activities/i.test(richHtml), "detailed HTML missing activities label");

    console.log("1) Weekly Calendar View downloads as PDF");
    const weekDownload = page.waitForEvent("download", { timeout: 10000 });
    await page.locator('[data-lesson-action-bars="top"] .lesson-workspace-primary-actions > [data-lesson-download-variant="week"]').click();
    const weekFile = await weekDownload;
    assert(/\.pdf$/i.test(weekFile.suggestedFilename()), `weekly should be PDF, got ${weekFile.suggestedFilename()}`);
    const weekPath = path.join(os.tmpdir(), `llh-week-${crypto.randomBytes(3).toString("hex")}.pdf`);
    await weekFile.saveAs(weekPath);
    assertPdf(fs.readFileSync(weekPath), "weekly calendar");

    console.log("2) Detailed Weekly Lesson Plan downloads as PDF");
    await page.locator("[data-lesson-workspace-more-toggle]").click();
    await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
    const detailDownload = page.waitForEvent("download", { timeout: 10000 });
    await page.locator('.lesson-workspace-more-menu [data-lesson-download-variant="week-detail"]').click();
    const detailFile = await detailDownload;
    assert(/\.pdf$/i.test(detailFile.suggestedFilename()), `detail should be PDF, got ${detailFile.suggestedFilename()}`);
    const detailPath = path.join(os.tmpdir(), `llh-detail-${crypto.randomBytes(3).toString("hex")}.pdf`);
    await detailFile.saveAs(detailPath);
    assertPdf(fs.readFileSync(detailPath), "detailed weekly");

    console.log("3) Classroom Planning Sheet downloads as PDF");
    await page.locator("[data-lesson-workspace-more-toggle]").click();
    await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
    const planDownload = page.waitForEvent("download", { timeout: 10000 });
    await page.locator('.lesson-workspace-more-menu [data-lesson-download-variant="planning"]').click();
    const planFile = await planDownload;
    assert(/\.pdf$/i.test(planFile.suggestedFilename()), `planning should be PDF, got ${planFile.suggestedFilename()}`);
    const planPath = path.join(os.tmpdir(), `llh-plan-${crypto.randomBytes(3).toString("hex")}.pdf`);
    await planFile.saveAs(planPath);
    assertPdf(fs.readFileSync(planPath), "planning sheet");

    const meta = await page.evaluate(() => window.__llhLastResourceOutputRequest || null);
    assert(meta?.format === "pdf", `last download should record pdf, got ${JSON.stringify(meta)}`);

    try { fs.unlinkSync(weekPath); } catch { /* ignore */ }
    try { fs.unlinkSync(detailPath); } catch { /* ignore */ }
    try { fs.unlinkSync(planPath); } catch { /* ignore */ }

    console.log("\nWeekly calendar PDF checks passed.");
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
