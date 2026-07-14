#!/usr/bin/env node
/**
 * Step 7 — Lesson plan print + download QA suite.
 * Run: npm run test:lesson-print-qa
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const docx = require("./llh-lesson-docx.js");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19920 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-print-qa-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-print-qa-admin@test.local",
  password: "lesson-print-qa-pass",
  code: "lesson-print-qa-code",
};
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");

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
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  if (!parsed.ok) return null;
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-print-qa-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Print QA Lesson Plan";
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
      theme: "Print QA",
    },
  });
  if (save.status !== 200) return null;
  return { planId, title };
}

async function main() {
  // Static builder checks first (no browser).
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert(parsed.ok, "sample parse failed");
  const weekly = docx.buildWeeklyCalendarDocxBlob({ title: "QA", plan: parsed.data, weekOfLabel: "Jul 14" });
  const full = docx.buildFullLessonPlanDocxBlob({ title: "QA Full", plan: parsed.data, weekOfLabel: "Jul 14" });
  assert((await weekly.arrayBuffer()).byteLength > 500, "weekly docx too small");
  assert((await full.arrayBuffer()).byteLength > 500, "full docx too small");
  console.log("✓ Static DOCX builders produce packages");

  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert(/printing-lesson-week/.test(styles), "missing printing-lesson-week styles");
  assert(/lesson-week-landscape/.test(styles), "missing landscape print page rule");
  assert(/grid-template-columns:\s*repeat\(5/.test(styles), "missing 5-column week print board");
  console.log("✓ Print CSS includes landscape weekly board");

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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-print-qa@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-print-qa@example.com": {
          email: "lesson-print-qa@example.com",
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
    await page.waitForFunction(() => typeof printResourceViewer === "function" && typeof downloadLessonPlanVariant === "function", null, { timeout: 30000 });

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.waitForFunction((title) => resources.some((item) => item.title === title), lesson.title, { timeout: 15000 });
    await page.fill("#lessonPlanSearch", lesson.title);
    await page.waitForTimeout(300);
    await page.locator("#view-lessons .lesson-plan-card").first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });

    await page.evaluate(() => {
      window.__printInvocations = [];
      window.print = () => {
        window.__printInvocations.push({
          weekClass: document.body.classList.contains("printing-lesson-week"),
          fullClass: document.body.classList.contains("printing-lesson-full"),
          hasBoard: Boolean(document.querySelector(".lesson-week-day-stack")),
          dayCount: document.querySelectorAll(".lesson-week-day-block").length,
          request: window.__llhLastResourceOutputRequest || null,
        });
        window.dispatchEvent(new Event("afterprint"));
      };
    });

    await page.locator('[data-lesson-action-bars="top"] [data-lesson-print-variant="week"]').click();
    await page.waitForFunction(() => (window.__printInvocations || []).length >= 1, null, { timeout: 5000 });
    const printState = await page.evaluate(() => window.__printInvocations[0]);
    check("Print weekly sets printing-lesson-week", printState.weekClass);
    check("Print weekly renders day board", printState.hasBoard && printState.dayCount === 5, JSON.stringify(printState));
    check("Print request variant is week", printState.request?.printVariant === "week");

    const weekDownload = page.waitForEvent("download", { timeout: 10000 });
    await page.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="week"]').click();
    const weekFile = await weekDownload;
    check("Download weekly is DOCX", /\.docx$/i.test(weekFile.suggestedFilename()), weekFile.suggestedFilename());

    const fullDownload = page.waitForEvent("download", { timeout: 10000 });
    await page.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="full"]').click();
    const fullFile = await fullDownload;
    check("Download full is DOCX", /\.docx$/i.test(fullFile.suggestedFilename()), fullFile.suggestedFilename());

    if (failures.length) {
      throw new Error(`${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    }
    console.log("\nAll lesson print/download QA checks passed.");
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
