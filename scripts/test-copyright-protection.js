#!/usr/bin/env node
/**
 * Copyright protection: static surfaces + desktop/tablet/mobile visibility.
 * Run: npm run test:copyright-protection
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19520 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-copyright-${crypto.randomBytes(4).toString("hex")}.json`);
const COPYRIGHT = "© 2026 Little Learner Hub by Leah. All Rights Reserved.";
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";

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

function runStaticChecks() {
  const copyrightMod = require("./llh-copyright.js");
  assert(copyrightMod.TEXT === COPYRIGHT, "llh-copyright TEXT mismatch");
  assert(copyrightMod.PDF_FOOTER === COPYRIGHT, "llh-copyright PDF_FOOTER mismatch");

  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert(indexHtml.includes(COPYRIGHT), "index.html missing copyright text");
  assert(indexHtml.includes('class="llh-app-footer"'), "index.html missing app footer");
  assert(indexHtml.includes('class="llh-public-footer"'), "index.html missing public footer");
  assert(indexHtml.includes('id="legalTerms"'), "index.html missing Terms of Service card");
  assert(indexHtml.includes('id="legalCopyright"'), "index.html missing copyright anchor in Terms");
  assert(indexHtml.includes("Terms of Service"), "index.html missing Terms of Service label");
  assert(indexHtml.includes("llh-copyright.js?v=20260717-copyright"), "index.html missing copyright script");

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(appJs.includes("llhCopyrightPdfFooter()"), "app.js missing PDF copyright helper usage");
  assert((appJs.match(/llhCopyrightPdfFooter\(\)/g) || []).length >= 5, "app.js PDF footers not wired widely enough");
  assert(appJs.includes("lesson-workspace-copyright"), "app.js missing lesson workspace copyright");
  assert(appJs.includes("printable-copyright-footer"), "app.js missing printable copyright footer");

  const viewer = require("./curriculum-lesson-viewer-render.js");
  const lessonHtml = viewer.renderCurriculumLessonPlanHtml({
    title: "Copyright Check Plan",
    age: "Preschool",
    plan: "Free",
    status: "published",
    dailyPlans: {},
  });
  const activityHtml = viewer.renderCurriculumActivityHtml({
    title: "Copyright Check Activity",
    activityCategory: "Art",
    objective: "Practice copyright notice rendering",
  });
  assert(lessonHtml.includes(COPYRIGHT), "lesson plan HTML missing copyright");
  assert(activityHtml.includes(COPYRIGHT), "activity HTML missing copyright");
  assert(lessonHtml.includes("curriculum-copyright-footer"), "lesson plan missing copyright footer class");
  assert(activityHtml.includes("curriculum-copyright-footer"), "activity missing copyright footer class");

  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert(styles.includes(".llh-app-footer"), "styles.css missing app footer rules");
  assert(styles.includes("body.home-view .llh-app-footer"), "styles.css missing home-view footer hide");

  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  assert(sw.includes("llh-copyright.js?v=20260717-copyright"), "service-worker missing copyright script");
  assert(sw.includes("styles.css?v=20260719-weekday-activities"), "service-worker missing styles cache bust");
}

async function ensureVisibleCopyright(page, selector, label) {
  const loc = page.locator(selector).filter({ hasText: COPYRIGHT }).first();
  await loc.waitFor({ state: "attached", timeout: 10000 });
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  assert(box && box.height > 0 && box.width > 0, `${label}: copyright not laid out (${selector})`);
  const text = (await loc.innerText()).replace(/\s+/g, " ").trim();
  assert(text.includes(COPYRIGHT), `${label}: copyright text mismatch at ${selector}`);
}

async function runViewportChecks(playwright, baseUrl) {
  const viewports = [
    { name: "desktop", width: 1280, height: 800 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

      await ensureVisibleCopyright(page, ".llh-public-footer .llh-footer-copy", `${vp.name} home`);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `copyright-${vp.name}-home.png`),
        fullPage: true,
      });

      await page.evaluate(() => setView("legal"));
      await page.waitForSelector("#view-legal.active-view", { timeout: 5000 });
      await ensureVisibleCopyright(page, "#legalCopyright, #legalTerms", `${vp.name} terms`);
      await ensureVisibleCopyright(page, ".llh-app-footer .llh-copyright-notice", `${vp.name} app footer`);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `copyright-${vp.name}-legal.png`),
        fullPage: true,
      });

      await page.evaluate(() => setView("lessons"));
      await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
      await ensureVisibleCopyright(page, ".llh-app-footer .llh-copyright-notice", `${vp.name} lessons`);

      // Navigation still works after footer presence checks.
      await page.evaluate(() => setView("activities"));
      await page.waitForSelector("#view-activities.active-view", { timeout: 8000 });
      await ensureVisibleCopyright(page, ".llh-app-footer .llh-copyright-notice", `${vp.name} activities`);

      await context.close();
      console.log(`PASS viewport ${vp.name}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("Static copyright checks…");
  runStaticChecks();
  console.log("PASS static copyright checks");

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error("playwright is required for copyright viewport checks");
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    await runViewportChecks(playwright, `http://127.0.0.1:${PORT}`);
    console.log("PASS copyright protection checks");
  } finally {
    await stopServer(child);
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error.message);
  process.exit(1);
});
