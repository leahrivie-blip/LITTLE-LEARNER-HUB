#!/usr/bin/env node
/**
 * Homepage "Request an Idea" section + modal → /api/feature-request (admin Feature Requests).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19810 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-request-idea-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = "/opt/cursor/artifacts/screenshots";

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {},
    featureRequests: [],
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      SITE_URL: `http://127.0.0.1:${PORT}`,
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
    await new Promise((r) => setTimeout(r, 150));
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const lessonsIdx = html.indexOf('id="homeLessonPlans"');
  const ideaIdx = html.indexOf('id="homeRequestIdea"');
  const activitiesIdx = html.indexOf('id="homeActivities"');
  const pricingIdx = html.indexOf('id="homePricing"');
  assert.ok(lessonsIdx > -1 && ideaIdx > lessonsIdx, "idea section should follow lesson preview");
  assert.ok(activitiesIdx > ideaIdx, "idea section should sit before activities");
  assert.ok(pricingIdx > ideaIdx, "idea section should sit before pricing");
  assert.match(html, /Help Shape What Gets Built Next/);
  assert.match(html, /Request an Idea/);
  assert.match(html, /id="ideaRequestModal"/);
  assert.match(html, /value="Lesson Plan"/);
  assert.match(html, /value="School Age"/);
  assert.match(html, /joining early/i);
  assert.match(appJs, /openIdeaRequestModal/);
  assert.match(appJs, /homepage_idea_request/);
  assert.match(appJs, /\/api\/feature-request/);

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  const report = { ok: true, checks: [] };
  try {
    await waitForBoot(child);

    for (const viewport of [
      { name: "desktop", width: 1280, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#homeRequestIdea", { timeout: 15000 });

      await page.evaluate(() => {
        document.querySelector("#homeRequestIdea")?.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(200);
      const sectionShot = path.join(OUT_DIR, `request-idea-section-${viewport.name}.png`);
      await page.screenshot({ path: sectionShot, fullPage: false });

      await page.click("#homeRequestIdeaButton");
      await page.waitForSelector("#ideaRequestModal.open", { timeout: 8000 });

      const modalShot = path.join(OUT_DIR, `request-idea-modal-${viewport.name}.png`);
      await page.screenshot({ path: modalShot, fullPage: false });

      await page.fill("#ideaRequestName", "Test Provider");
      await page.fill("#ideaRequestEmail", `idea-${viewport.name}@example.com`);
      await page.selectOption("#ideaRequestType", "Lesson Plan");
      await page.selectOption("#ideaRequestAgeGroup", "Toddler");
      await page.fill("#ideaRequestDetails", "Please add a toddler weather week with outdoor sensory play.");
      await page.click("#ideaRequestSubmit");
      await page.waitForFunction(() => {
        const msg = document.querySelector("#ideaRequestMessage")?.textContent || "";
        return /Thank you! Your request has been sent for review/i.test(msg);
      }, null, { timeout: 10000 });

      const thanksShot = path.join(OUT_DIR, `request-idea-thanks-${viewport.name}.png`);
      await page.screenshot({ path: thanksShot, fullPage: false });

      report.checks.push({
        viewport: viewport.name,
        sectionShot,
        modalShot,
        thanksShot,
      });
      await page.close();
      console.log(`PASS ${viewport.name}`);
    }

    // Confirm persistence in store / list API shape via direct POST + file.
    const apiRes = await request("POST", "/api/feature-request", {
      title: "Activity request: music circles",
      description: "Need more infant music circle ideas.\n\nRequest type: Activity\nAge group: Infant",
      category: "Activity",
      ageGroup: "Infant",
      name: "API Tester",
      email: "api-idea@example.com",
      source: "homepage_idea_request",
      sourceUrl: "http://127.0.0.1/test",
    });
    assert.equal(apiRes.status, 200, apiRes.body);
    const apiJson = JSON.parse(apiRes.body);
    assert.equal(apiJson.featureRequest?.category, "Activity");
    assert.equal(apiJson.featureRequest?.ageGroup, "Infant");
    assert.equal(apiJson.featureRequest?.source, "homepage_idea_request");

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    assert.ok(Array.isArray(store.featureRequests));
    assert.ok(store.featureRequests.length >= 3, `expected >=3 saved requests, got ${store.featureRequests.length}`);
    const homepageOnes = store.featureRequests.filter((r) => r.source === "homepage_idea_request");
    assert.ok(homepageOnes.length >= 3, "homepage idea requests should be stored in featureRequests");
    assert.ok(homepageOnes.some((r) => /weather week/i.test(r.description || "")));

    report.storage = {
      path: STORE_PATH,
      key: "featureRequests",
      adminPanel: "Admin → Advanced → Feature Requests",
      api: "POST /api/feature-request → store.featureRequests (local-json or Postgres llh_store JSONB)",
      count: store.featureRequests.length,
      sampleIds: store.featureRequests.slice(0, 3).map((r) => r.id),
    };

    fs.writeFileSync(path.join(OUT_DIR, "request-idea-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log("homepage-request-idea: PASS");
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
