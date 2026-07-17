#!/usr/bin/env node
/**
 * Generate Teacher Weekly Planner PDF page screenshots for review.
 * Run: node scripts/capture-teacher-weekly-planner-screenshots.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn, execFileSync } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/ocean-explorers-chatgpt-format.txt");
const PORT = 19820 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-planner-shot-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = "/opt/cursor/artifacts/screenshots";
const MOCKUP_DIR = path.join(ROOT, "mockups/teacher-weekly-planner");
const ADMIN = {
  email: "planner-shot@test.local",
  password: "planner-shot-pass",
  code: "planner-shot-code",
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

async function main() {
  const playwright = require("playwright");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(MOCKUP_DIR, { recursive: true });

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
    const title = "Teacher Planner Ocean Review";
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: login.json.token,
      expectedUpdatedAt: touch.json.siteContent.updatedAt,
      lessonPlan: {
        ...parsed.data,
        id: `cur-lp-planner-shot-${crypto.randomBytes(3).toString("hex")}`,
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
      localStorage.setItem("llhUser", "planner-shot@test.local");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "planner-shot@test.local": { email: "planner-shot@test.local", plan: "Free", subscriptionStatus: "Free Plan" },
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

    await page.screenshot({
      path: path.join(OUT_DIR, "teacher-planner-download-buttons.png"),
      fullPage: false,
    });
    fs.copyFileSync(
      path.join(OUT_DIR, "teacher-planner-download-buttons.png"),
      path.join(MOCKUP_DIR, "download-buttons.png"),
    );

    const pdfMeta = await page.evaluate(async () => {
      const resource = activeResourceViewerResource;
      const built = LlhTeacherWeeklyPlanner.buildTeacherPlannerDays(
        LlhTeacherWeeklyPlanner.repairLessonPlanForPlanner(resource._curriculumLessonPlan),
        { validate: true },
      );
      const validation = LlhTeacherWeeklyPlanner.validateTeacherPlannerDays(built.days);
      if (!validation.ok) throw new Error(validation.message);
      const blob = buildTeacherWeeklyPlannerPdfBlob(resource, {
        weekStartDate: lessonPlanAssignedWeekStart(resource.id),
        silent: true,
      });
      if (!blob) throw new Error("Planner PDF blob was null");
      const buf = new Uint8Array(await blob.arrayBuffer());
      return {
        bytes: Array.from(buf),
        pageCount: (new TextDecoder("latin1").decode(buf).match(/\/Type \/Page\b/g) || []).length,
        emptyCells: built.days.flatMap((day) => (
          ["themeFocus", "circleTime", "activity1", "activity2", "activity3", "outdoorPlay", "bookOfTheDay"]
            .filter((key) => !String(day[key] || "").trim())
            .map((key) => `${day.label}:${key}`)
        )),
        tuesday: built.days.find((day) => day.day === "tuesday"),
      };
    });
    assert(!pdfMeta.emptyCells.length, `screenshot capture found empty cells: ${pdfMeta.emptyCells.join(", ")}`);
    assert(pdfMeta.tuesday?.activity1 && pdfMeta.tuesday?.activity2 && pdfMeta.tuesday?.activity3, "Tuesday must have 3 activities");
    const pdfPath = path.join(OUT_DIR, "teacher-weekly-planner-preview.pdf");
    fs.writeFileSync(pdfPath, Buffer.from(pdfMeta.bytes));
    fs.copyFileSync(pdfPath, path.join(MOCKUP_DIR, "teacher-weekly-planner-preview.pdf"));

    const prefix = path.join(OUT_DIR, "teacher-planner-page");
    execFileSync("pdftoppm", ["-png", "-r", "160", pdfPath, prefix], { stdio: "inherit" });
    for (let i = 1; i <= 4; i += 1) {
      const src = `${prefix}-${i}.png`;
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, path.join(MOCKUP_DIR, `page-${i}.png`));
      fs.copyFileSync(src, path.join(OUT_DIR, `teacher-planner-page-${i}.png`));
      console.log(`Wrote ${src}`);
    }

    console.log(`PDF pages: ${pdfMeta.pageCount}`);
    console.log(`Artifacts: ${OUT_DIR}`);
    console.log(`Mockups: ${MOCKUP_DIR}`);
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
