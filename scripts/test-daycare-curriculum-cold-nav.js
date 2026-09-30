#!/usr/bin/env node
/**
 * Regression: /daycare-curriculum must not fall back to stale SPA index.html on first navigation.
 * Run: npm run test:daycare-curriculum-cold-nav
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium, devices } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19740 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-curriculum-cold-${crypto.randomBytes(4).toString("hex")}.json`);
const BASE = `http://127.0.0.1:${PORT}`;

const STALE_MARKERS = [
  /ALL-IN-ONE CHILDCARE PLATFORM/i,
  /Plan, Organize, Document & Save Time/i,
  /id="homeHero"/,
  /id="view-home"/,
  /app\.js\?v=/,
];
const CURRENT_MARKERS = [
  /Your Next Week of Lesson Plans Is Already Done/,
  /curriculum-hero/,
  /Find a Lesson Plan for Your Classroom/,
];

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
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
      SITE_URL: BASE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
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

function assertCurriculumHtml(html, label) {
  for (const pattern of CURRENT_MARKERS) {
    assert.match(html, pattern, `${label}: missing current curriculum marker ${pattern}`);
  }
  for (const pattern of STALE_MARKERS) {
    assert.doesNotMatch(html, pattern, `${label}: stale SPA/home marker ${pattern}`);
  }
  assert.doesNotMatch(html, /\b\d+\s+published lesson plans\b/i, `${label}: must not show homepage inventory counts`);
}

async function main() {
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  assert.match(sw, /llh-shell-v213-curriculum-nav-r1/, "service worker cache must bump for curriculum nav fix");
  assert.match(sw, /SERVER_RENDERED_PUBLIC_PATHS/, "service worker must list server-rendered public paths");
  assert.match(sw, /\/daycare-curriculum/, "service worker must include daycare-curriculum path");
  assert.match(sw, /respondToServerRenderedNavigation/, "service worker must use dedicated SEO navigation handler");
  const seoBranch = sw.split("isServerRenderedPublicPath(requestUrl.pathname)")[1] || "";
  assert.doesNotMatch(seoBranch.split("return;")[0] || "", /caches\.match\("\/index\.html"\)/, "SEO navigation must not fall back to SPA index.html");

  const child = startServer();
  try {
    await waitForBoot(child);

    const cold = await request("GET", "/daycare-curriculum");
    assert.equal(cold.status, 200, "cold GET /daycare-curriculum must succeed");
    assertCurriculumHtml(cold.body, "cold HTTP");

    const browser = await chromium.launch();
    const iPhone = devices["iPhone 13"];
    const context = await browser.newContext({
      ...iPhone,
      serviceWorkers: "allow",
      baseURL: BASE,
    });
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return;
      await navigator.serviceWorker.register("/service-worker.js");
      await navigator.serviceWorker.ready;
    });

    let curriculumDelayMs = 3200;
    await page.route("**/daycare-curriculum", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, curriculumDelayMs));
      curriculumDelayMs = 0;
      await route.continue();
    });

    await page.goto("/daycare-curriculum", { waitUntil: "domcontentloaded", timeout: 60000 });
    const firstPaintHtml = await page.content();
    assertCurriculumHtml(firstPaintHtml, "SW slow first navigation (mobile)");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    assertCurriculumHtml(await page.content(), "reload after curriculum landing");

    await page.goto("/daycare-curriculum", { waitUntil: "domcontentloaded", timeout: 60000 });
    assertCurriculumHtml(await page.content(), "reopen curriculum route");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const homeHtml = await page.content();
    assert.match(homeHtml, /lp-hero-headline/, "homepage hero must still render after curriculum visit");
    assert.match(homeHtml, /app\.js\?v=/, "homepage must still load SPA shell");

    await browser.close();
    console.log("PASS  daycare-curriculum cold navigation regression");
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error("FAIL  daycare-curriculum cold navigation regression");
  console.error(error);
  process.exit(1);
});
