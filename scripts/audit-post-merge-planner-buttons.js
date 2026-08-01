#!/usr/bin/env node
/**
 * Post-merge audit: lesson workspace buttons + PDF downloads.
 * Run: npm run audit:post-merge-planner-buttons
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
const PORT = 19910 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-post-merge-planner-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = "/opt/cursor/artifacts/audit";
const ADMIN = {
  email: "post-merge-planner@test.local",
  password: "post-merge-planner-pass",
  code: "post-merge-planner-code",
};

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
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

async function probePdfDownload(page, selector, label) {
  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  await target.click({ timeout: 8000 });
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const tmp = path.join(os.tmpdir(), `llh-audit-${crypto.randomBytes(4).toString("hex")}.pdf`);
  await download.saveAs(tmp);
  const buf = fs.readFileSync(tmp);
  const text = buf.toString("latin1");
  fs.unlinkSync(tmp);
  return {
    label,
    suggested,
    size: buf.length,
    isPdf: buf.slice(0, 4).toString() === "%PDF",
    pageCount: (text.match(/\/Type \/Page\b/g) || []).length,
    text,
  };
}

async function openMoreMenu(page) {
  const menu = page.locator(".lesson-workspace-more-menu");
  if (await menu.isVisible().catch(() => false)) return;
  await page.locator("[data-lesson-workspace-more-toggle]").click();
  await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("playwright is required");
    process.exit(1);
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
    const title = "Post-Merge Planner Button Audit";
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: login.json.token,
      expectedUpdatedAt: touch.json.siteContent.updatedAt,
      lessonPlan: {
        ...parsed.data,
        id: `cur-lp-post-merge-${crypto.randomBytes(3).toString("hex")}`,
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
      localStorage.setItem("llhUser", "post-merge-planner@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "post-merge-planner@example.com": {
          email: "post-merge-planner@example.com",
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
    await page.waitForSelector("#view-calendar.active-view", { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(
      () => document.body.classList.contains("app-booted")
        && document.body.classList.contains("app-boot-ready")
        && !document.body.classList.contains("app-boot-verifying"),
      null,
      { timeout: 30000 },
    );
    await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
    await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 20000 });
    await page.waitForFunction(() => typeof resources !== "undefined" && Array.isArray(resources) && resources.some((item) => item.category === "Lesson Plans"), null, { timeout: 30000 });
    await page.fill("#view-lessons.active-view #lessonPlanSearch", title);
    await page.waitForTimeout(350);
    const card = page.locator("#view-lessons .lesson-plan-card, #view-lessons .resource-card").filter({ hasText: title }).first();
    await card.waitFor({ timeout: 15000 });
    await card.click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

    const labels = await page.evaluate(() => ({
      primary: [...document.querySelectorAll(".lesson-workspace-primary-actions > button")]
        .map((el) => el.textContent.trim()),
      more: [...document.querySelectorAll(".lesson-workspace-more-menu button")]
        .map((el) => el.textContent.trim()),
    }));
    record("Primary shows Use This Plan", labels.primary.includes("Use This Plan"));
    record("Primary shows Teacher Weekly Planner download", labels.primary.some((t) => /Download Teacher Weekly Planner/i.test(t)));
    record("Primary shows Full Lesson Plan download", labels.primary.some((t) => /Download Full Lesson Plan/i.test(t)));
    record("More has Print Teacher Weekly Planner", labels.more.some((t) => /Print Teacher Weekly Planner/i.test(t)));
    record("More has Detailed Weekly Lesson Plan", labels.more.some((t) => /Detailed Weekly/i.test(t)));
    record("More has Classroom Planning Sheet", labels.more.some((t) => /Classroom Planning Sheet/i.test(t)));

    const plannerReady = await page.evaluate(() => {
      const resource = activeResourceViewerResource;
      const repaired = LlhTeacherWeeklyPlanner.repairLessonPlanForPlanner(resource._curriculumLessonPlan);
      const built = LlhTeacherWeeklyPlanner.buildTeacherPlannerDays(repaired, { validate: true });
      const validation = LlhTeacherWeeklyPlanner.validateTeacherPlannerDays(built.days);
      const empty = [];
      built.days.forEach((day) => {
        ["themeFocus", "circleTime", "activity1", "activity2", "activity3", "outdoorPlay", "bookOfTheDay"].forEach((key) => {
          if (!String(day[key] || "").trim()) empty.push(`${day.label}:${key}`);
        });
      });
      return { ok: validation.ok, empty, tuesday: built.days.find((d) => d.day === "tuesday") };
    });
    record("Planner days validate with no empty cells", plannerReady.ok && !plannerReady.empty.length, plannerReady.empty.join(", "));
    record(
      "Tuesday has 3 activities",
      Boolean(plannerReady.tuesday?.activity1 && plannerReady.tuesday?.activity2 && plannerReady.tuesday?.activity3),
    );

    const weekPdf = await probePdfDownload(
      page,
      '[data-lesson-action-bars="top"] .lesson-workspace-primary-actions > [data-lesson-download-variant="week"]',
      "Teacher Weekly Planner",
    );
    record("Teacher Weekly Planner downloads PDF", weekPdf.isPdf && /\.pdf$/i.test(weekPdf.suggested), weekPdf.suggested);
    record("Teacher Weekly Planner is 2 pages", weekPdf.pageCount === 2, `pages=${weekPdf.pageCount}`);
    record("Teacher Weekly Planner has calendar header", /WEEKLY SNAPSHOT|Weekly Classroom Calendar/i.test(weekPdf.text));
    record("Teacher Weekly Planner has Outdoor Play", /Outdoor Play/.test(weekPdf.text));
    record("Teacher Weekly Planner has Book of the Day", /Book of the Day/.test(weekPdf.text));
    record("Teacher Weekly Planner has no blank notes page", !/Teacher Planning Notes/.test(weekPdf.text));

    const fullPdf = await probePdfDownload(
      page,
      '[data-lesson-action-bars="top"] .lesson-workspace-primary-actions > [data-lesson-download-variant="full"]',
      "Full Lesson Plan",
    );
    record("Full Lesson Plan downloads PDF", fullPdf.isPdf && /\.pdf$/i.test(fullPdf.suggested), fullPdf.suggested);
    record("Full Lesson Plan has content pages", fullPdf.pageCount >= 1, `pages=${fullPdf.pageCount}`);

    await openMoreMenu(page);
    const detailPdf = await probePdfDownload(
      page,
      '.lesson-workspace-more-menu [data-lesson-download-variant="week-detail"]',
      "Detailed Weekly",
    );
    record("Detailed Weekly downloads PDF", detailPdf.isPdf, detailPdf.suggested);

    await openMoreMenu(page);
    const planningPdf = await probePdfDownload(
      page,
      '.lesson-workspace-more-menu [data-lesson-download-variant="planning"]',
      "Planning Sheet",
    );
    record("Classroom Planning Sheet downloads PDF", planningPdf.isPdf, planningPdf.suggested);

    await page.locator("[data-lesson-use-this-plan]").click();
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const assignOpen = await page.evaluate(() => (
      document.querySelector("[data-lesson-assign-sheet-title]")?.textContent.trim() || ""
    ));
    record("Use This Plan opens Add to Calendar", assignOpen === "Add to Calendar", assignOpen);

    const failed = results.filter((item) => !item.ok);
    const report = {
      ok: failed.length === 0,
      failed: failed.map((item) => item.name),
      results,
      generatedAt: new Date().toISOString(),
    };
    const jsonPath = path.join(OUT_DIR, "post-merge-planner-buttons.json");
    const mdPath = path.join(OUT_DIR, "post-merge-planner-buttons.md");
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(
      mdPath,
      [
        "# Post-merge planner button audit",
        "",
        `Status: **${report.ok ? "PASS" : "FAIL"}**`,
        "",
        ...results.map((item) => `- ${item.ok ? "PASS" : "FAIL"}: ${item.name}${item.detail ? ` (${item.detail})` : ""}`),
        "",
      ].join("\n"),
    );
    console.log(`\nReport: ${mdPath}`);
    if (failed.length) {
      throw new Error(`${failed.length} audit check(s) failed:\n- ${failed.map((item) => item.name).join("\n- ")}`);
    }
    console.log("\nPost-merge planner button audit passed.");
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
