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
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/ocean-explorers-chatgpt-format.txt");
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
  assert(appJs.includes("buildTeacherWeeklyPlannerPdfBlob"), "teacher weekly planner PDF builder missing");
  assert(appJs.includes("buildLessonPlanWeeklyCalendarBoardPdfBlob"), "calendar PDF alias missing");
  assert(appJs.includes("buildLessonPlanPlanningSheetPdfBlob"), "planning sheet PDF builder missing");
  assert(appJs.includes("Download Teacher Weekly Planner"), "teacher weekly planner download label missing");
  assert(appJs.includes("Download Full Lesson Plan"), "full lesson plan download label missing");
  assert(appJs.includes('data-lesson-download-variant="week-detail"'), "detailed weekly download missing");
  assert(appJs.includes('data-lesson-download-variant="planning"'), "planning sheet download missing");
  assert(appJs.includes("lesson-plan-weekly-export") || fs.existsSync(path.join(ROOT, "scripts/lesson-plan-weekly-export.js")), "weekly export module missing");
  assert(appJs.includes("Theme Focus") && appJs.includes("Circle Time") && appJs.includes("Book of the Day"), "planner calendar rows missing");
  assert(appJs.includes("Teacher Planning Notes"), "planner notes page missing");
  assert(appJs.includes("0.42 0.275 0.757"), "purple branding missing from weekly PDF");
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
    const title = "Weekly PDF Classroom Ocean";
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
        theme: "Ocean Life",
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
    assert(/Weekly Summary|Weekly Objectives|Theme Focus|Materials Needed|Teacher Notes|Circle Time|Book of the Day/i.test(richHtml), "detailed HTML missing classroom sections");
    assert(/Activities/i.test(richHtml), "detailed HTML missing activities label");
    assert(!/Open exploration|Follow child interest with familiar classroom materials/i.test(richHtml), "detailed HTML should not use placeholder filler");

    const weekHtml = await page.evaluate(() => {
      const resource = activeResourceViewerResource;
      return lessonPlanWeeklyScheduleHtml(resource, resource._curriculumLessonPlan, { layout: "week" });
    });
    assert(/Weekly Overview|Family Connection|Theme Focus|Circle Time|Book of the Day/i.test(weekHtml), "week HTML missing rich sections");

    const pdfProbe = await page.evaluate(async () => {
      const resource = activeResourceViewerResource;
      const blob = buildTeacherWeeklyPlannerPdfBlob(resource, {});
      const buf = new Uint8Array(await blob.arrayBuffer());
      const text = new TextDecoder("latin1").decode(buf);
      return {
        size: buf.length,
        header: text.slice(0, 8),
        hasPlanner: /TEACHER WEEKLY PLANNER|Teacher Weekly Planner/.test(text),
        hasOverview: /Weekly Overview|Learning Domains|Weekly Objectives/.test(text),
        hasThemeFocus: /Theme Focus/.test(text),
        hasCircle: /Circle Time/.test(text),
        hasBook: /Book of the Day/.test(text),
        hasNotes: /Teacher Planning Notes/.test(text),
        hasFamilyDump: /Family Connection|WEEKLY ADAPTATIONS|Observation Opportunities/.test(text),
        hasOcean: /Ocean/i.test(text),
        hasSensory: /Sensory|Ocean Sensory/i.test(text),
        hasPlaceholder: /Open exploration|____________________/.test(text),
        landscape: /MediaBox \[0 0 792 612\]/.test(text),
        pageCount: (text.match(/\/Type \/Page\b/g) || []).length,
      };
    });
    assert(pdfProbe.header.startsWith("%PDF-"), "generated weekly PDF invalid");
    assert(pdfProbe.hasPlanner && pdfProbe.hasOverview && pdfProbe.hasThemeFocus && pdfProbe.hasCircle && pdfProbe.hasBook && pdfProbe.hasNotes, `planner pages missing: ${JSON.stringify(pdfProbe)}`);
    assert(pdfProbe.hasOcean, `actual lesson content missing: ${JSON.stringify(pdfProbe)}`);
    assert(!pdfProbe.hasFamilyDump, "planner should omit long family/adaptation/observation dumps");
    assert(!pdfProbe.hasPlaceholder, "weekly PDF contains placeholder text");
    assert(pdfProbe.landscape, "weekly PDF should be landscape");
    assert(pdfProbe.pageCount === 3, `expected 3 pages (overview, calendar, notes), got ${pdfProbe.pageCount}`);

    console.log("1) Teacher Weekly Planner downloads as PDF");
    const weekDownload = page.waitForEvent("download", { timeout: 10000 });
    await page.locator('[data-lesson-action-bars="top"] .lesson-workspace-primary-actions > [data-lesson-download-variant="week"]').click();
    const weekFile = await weekDownload;
    assert(/\.pdf$/i.test(weekFile.suggestedFilename()), `weekly should be PDF, got ${weekFile.suggestedFilename()}`);
    assert(/teacher-weekly-planner\.pdf$/i.test(weekFile.suggestedFilename()), `filename should be teacher-weekly-planner, got ${weekFile.suggestedFilename()}`);
    const weekPath = path.join(os.tmpdir(), `llh-week-${crypto.randomBytes(3).toString("hex")}.pdf`);
    await weekFile.saveAs(weekPath);
    assertPdf(fs.readFileSync(weekPath), "teacher weekly planner");
    const weekText = fs.readFileSync(weekPath).toString("latin1");
    assert(/Theme Focus|Circle Time|Book of the Day|Teacher Planning Notes/.test(weekText), "downloaded planner PDF missing calendar/notes");
    assert(!/Open exploration/.test(weekText), "downloaded weekly PDF has placeholder");

    console.log("2) Detailed Weekly Lesson Plan downloads as PDF");
    const detailPath = path.join(os.tmpdir(), `llh-detail-${crypto.randomBytes(3).toString("hex")}.pdf`);
    const detailMeta = await page.evaluate(async () => {
      const resource = activeResourceViewerResource;
      const blob = buildLessonPlanWeeklySchedulePdfBlob(resource, {
        weekStartDate: lessonPlanAssignedWeekStart(resource.id),
      });
      const buf = new Uint8Array(await blob.arrayBuffer());
      const text = new TextDecoder("latin1").decode(buf);
      return {
        bytes: Array.from(buf),
        hasThemeFocus: /Theme Focus/.test(text),
        hasCircle: /Circle Time/.test(text),
        hasOcean: /Ocean/i.test(text),
        hasPlaceholder: /Open exploration/.test(text),
      };
    });
    fs.writeFileSync(detailPath, Buffer.from(detailMeta.bytes));
    assertPdf(fs.readFileSync(detailPath), "detailed weekly");
    assert(detailMeta.hasThemeFocus && detailMeta.hasCircle && detailMeta.hasOcean, `detailed PDF missing content: ${JSON.stringify(detailMeta)}`);
    assert(!detailMeta.hasPlaceholder, "detailed PDF has placeholder");

    console.log("3) Classroom Planning Sheet downloads as PDF");
    const planPath = path.join(os.tmpdir(), `llh-plan-${crypto.randomBytes(3).toString("hex")}.pdf`);
    const planMeta = await page.evaluate(async () => {
      const resource = activeResourceViewerResource;
      const blob = buildLessonPlanPlanningSheetPdfBlob(resource, {
        weekStartDate: lessonPlanAssignedWeekStart(resource.id),
      });
      const buf = new Uint8Array(await blob.arrayBuffer());
      return { bytes: Array.from(buf), size: buf.length };
    });
    fs.writeFileSync(planPath, Buffer.from(planMeta.bytes));
    assertPdf(fs.readFileSync(planPath), "planning sheet");

    // Exercise download orchestrator for detail + planning variants (same path as More menu).
    const orchestrator = await page.evaluate(() => {
      const before = window.__llhLastResourceOutputRequest || null;
      downloadLessonPlanVariant("week-detail");
      const afterDetail = window.__llhLastResourceOutputRequest || null;
      downloadLessonPlanVariant("planning");
      const afterPlanning = window.__llhLastResourceOutputRequest || null;
      return { before, afterDetail, afterPlanning };
    });
    assert(orchestrator.afterDetail?.printVariant === "week-detail", `week-detail not recorded: ${JSON.stringify(orchestrator.afterDetail)}`);
    assert(orchestrator.afterDetail?.format === "pdf", "week-detail should be pdf");
    assert(orchestrator.afterPlanning?.printVariant === "planning", `planning not recorded: ${JSON.stringify(orchestrator.afterPlanning)}`);
    assert(orchestrator.afterPlanning?.format === "pdf", "planning should be pdf");

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
