#!/usr/bin/env node
/**
 * Homepage "Request an Idea" section + modal → /api/feature-request (admin Feature Requests).
 * Covers guest empty prefill, signed-in prefill, validation, and persistence.
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

async function openIdeaModal(page) {
  await page.locator('.llh-footer-links [data-action="open-idea-request"]').click();
  await page.waitForSelector("#ideaRequestModal.open", { timeout: 8000 });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(html, /data-action="open-idea-request"/);
  assert.match(html, /Have a lesson idea\? Send Leah a request/);
  assert.match(html, /id="ideaRequestModal"/);
  assert.match(html, /value="Lesson Plan"/);
  assert.match(html, /value="School Age"/);
  assert.match(appJs, /openIdeaRequestModal/);
  assert.match(appJs, /ideaRequestSavedContact/);
  assert.match(appJs, /homepage_idea_request/);
  assert.match(appJs, /\/api\/feature-request/);
  assert.ok(html.indexOf('id="homePricing"') > html.indexOf('id="homeLessonPlans"'));

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  const report = { ok: true, checks: [] };
  try {
    await waitForBoot(child);

    // Guest flow + validation + empty prefill
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForSelector(".llh-public-footer", { timeout: 15000 });
      await page.evaluate(() => {
        document.querySelector(".llh-public-footer")?.scrollIntoView({ block: "center" });
      });
      await page.screenshot({ path: path.join(OUT_DIR, "request-idea-section-desktop.png"), fullPage: false });

      await openIdeaModal(page);
      const guestFields = await page.evaluate(() => ({
        name: document.querySelector("#ideaRequestName")?.value || "",
        email: document.querySelector("#ideaRequestEmail")?.value || "",
        namePlaceholder: document.querySelector("#ideaRequestName")?.getAttribute("placeholder") || "",
        emailPlaceholder: document.querySelector("#ideaRequestEmail")?.getAttribute("placeholder") || "",
      }));
      assert.equal(guestFields.name, "", "guest name must be empty");
      assert.equal(guestFields.email, "", "guest email must be empty");
      assert.equal(guestFields.namePlaceholder, "");
      assert.equal(guestFields.emailPlaceholder, "");
      assert.doesNotMatch(guestFields.name, /provider|test/i);

      await page.screenshot({ path: path.join(OUT_DIR, "request-idea-modal-desktop.png"), fullPage: false });

      // Validation: empty submit should error and keep typed values
      await page.fill("#ideaRequestName", "Guest Name Keep");
      await page.fill("#ideaRequestEmail", "not-an-email");
      await page.fill("#ideaRequestDetails", "Keep this text after validation");
      await page.click("#ideaRequestSubmit");
      await page.waitForFunction(() => {
        const msg = document.querySelector("#ideaRequestMessage")?.textContent || "";
        return /valid email|choose a request type|please/i.test(msg);
      }, null, { timeout: 5000 });
      const afterInvalid = await page.evaluate(() => ({
        name: document.querySelector("#ideaRequestName")?.value || "",
        email: document.querySelector("#ideaRequestEmail")?.value || "",
        details: document.querySelector("#ideaRequestDetails")?.value || "",
        message: document.querySelector("#ideaRequestMessage")?.textContent || "",
        error: document.querySelector("#ideaRequestMessage")?.classList.contains("is-error"),
      }));
      assert.equal(afterInvalid.name, "Guest Name Keep");
      assert.equal(afterInvalid.email, "not-an-email");
      assert.equal(afterInvalid.details, "Keep this text after validation");
      assert.equal(afterInvalid.error, true);

      // Successful guest submit
      await page.fill("#ideaRequestEmail", "guest-idea@example.com");
      await page.selectOption("#ideaRequestType", "Feature");
      await page.selectOption("#ideaRequestAgeGroup", "Preschool");
      await page.fill("#ideaRequestDetails", "Add a printable attendance tracker for preschool rooms.");
      await page.click("#ideaRequestSubmit");
      await page.waitForFunction(() => {
        const msg = document.querySelector("#ideaRequestMessage")?.textContent || "";
        return /Thank you! Your request has been sent for review/i.test(msg);
      }, null, { timeout: 10000 });
      await page.screenshot({ path: path.join(OUT_DIR, "request-idea-thanks-desktop.png"), fullPage: false });
      await page.click("#closeIdeaRequestModal");
      report.checks.push({ flow: "guest", ok: true });
      await page.close();
      console.log("PASS guest");
    }

    // Signed-in flow with prefilled contact (modal works even when marketing home is hidden)
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.addInitScript(() => {
        const email = "signed-in-idea@example.com";
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhAccounts", JSON.stringify({
          [email]: {
            email,
            firstName: "Jordan",
            lastName: "Lee",
            plan: "Free",
            accountType: "home_daycare",
            role: "owner",
          },
        }));
        localStorage.setItem("llhPlan", "Free");
      });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => typeof openIdeaRequestModal === "function" && Boolean(document.querySelector("#ideaRequestForm")), null, { timeout: 20000 });
      // Capture mobile marketing section while still available as guest snapshot already covers UI;
      // for signed-in, open the shared modal directly.
      await page.evaluate(() => openIdeaRequestModal());
      await page.waitForSelector("#ideaRequestModal.open", { timeout: 8000 });
      const signedFields = await page.evaluate(() => ({
        name: document.querySelector("#ideaRequestName")?.value || "",
        email: document.querySelector("#ideaRequestEmail")?.value || "",
        currentUser: typeof currentUser === "string" ? currentUser : "",
      }));
      assert.match(signedFields.name, /Jordan\s+Lee/);
      assert.equal(signedFields.email, "signed-in-idea@example.com");
      assert.equal(signedFields.currentUser, "signed-in-idea@example.com");
      await page.screenshot({ path: path.join(OUT_DIR, "request-idea-modal-mobile.png"), fullPage: false });

      await page.selectOption("#ideaRequestType", "Activity");
      await page.selectOption("#ideaRequestAgeGroup", "Infant");
      await page.fill("#ideaRequestDetails", "Need more infant music circle ideas with caregiver prompts.");
      await page.click("#ideaRequestSubmit");
      await page.waitForFunction(() => {
        const msg = document.querySelector("#ideaRequestMessage")?.textContent || "";
        return /Thank you! Your request has been sent for review/i.test(msg);
      }, null, { timeout: 10000 });
      await page.screenshot({ path: path.join(OUT_DIR, "request-idea-thanks-mobile.png"), fullPage: false });
      report.checks.push({ flow: "signed-in", ok: true, prefill: signedFields });
      await page.close();
      console.log("PASS signed-in");
    }

    // Mobile section screenshot (guest) for approval artifacts
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForSelector(".llh-public-footer", { timeout: 15000 });
      await page.evaluate(() => {
        document.querySelector(".llh-public-footer")?.scrollIntoView({ block: "center" });
      });
      await page.screenshot({ path: path.join(OUT_DIR, "request-idea-section-mobile.png"), fullPage: false });
      await page.close();
    }

    // Confirm persistence + field integrity
    const apiRes = await request("POST", "/api/feature-request", {
      title: "Lesson Plan request: weather week",
      description: "Please add a toddler weather week.\n\nRequest type: Lesson Plan\nAge group: Toddler",
      category: "Lesson Plan",
      ageGroup: "Toddler",
      name: "API Tester",
      email: "api-idea@example.com",
      source: "homepage_idea_request",
      sourceUrl: "http://127.0.0.1/test",
    });
    assert.equal(apiRes.status, 200, apiRes.body);
    const apiJson = JSON.parse(apiRes.body);
    assert.equal(apiJson.featureRequest?.category, "Lesson Plan");
    assert.equal(apiJson.featureRequest?.ageGroup, "Toddler");
    assert.equal(apiJson.featureRequest?.source, "homepage_idea_request");
    assert.equal(apiJson.featureRequest?.name, "API Tester");
    assert.equal(apiJson.featureRequest?.email, "api-idea@example.com");

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    assert.ok(Array.isArray(store.featureRequests));
    const homepageOnes = store.featureRequests.filter((r) => r.source === "homepage_idea_request");
    assert.ok(homepageOnes.length >= 3, `expected >=3 homepage requests, got ${homepageOnes.length}`);
    const guestItem = homepageOnes.find((r) => r.email === "guest-idea@example.com");
    const signedItem = homepageOnes.find((r) => r.email === "signed-in-idea@example.com");
    assert.ok(guestItem, "guest submission missing from store");
    assert.ok(signedItem, "signed-in submission missing from store");
    assert.equal(guestItem.category, "Feature");
    assert.equal(guestItem.ageGroup, "Preschool");
    assert.match(guestItem.description || "", /attendance tracker/i);
    assert.equal(signedItem.category, "Activity");
    assert.equal(signedItem.ageGroup, "Infant");
    assert.match(signedItem.name || "", /Jordan/i);
    assert.match(signedItem.description || "", /music circle/i);

    // Empty/invalid API rejection
    const bad = await request("POST", "/api/feature-request", {
      title: "",
      description: "",
      email: "bad@example.com",
    });
    assert.equal(bad.status, 400);

    report.storage = {
      key: "featureRequests",
      adminPanel: "Admin → Advanced → Feature Requests",
      api: "POST /api/feature-request → store.featureRequests",
      count: store.featureRequests.length,
      homepageCount: homepageOnes.length,
      sample: homepageOnes.slice(0, 3).map((r) => ({
        id: r.id,
        category: r.category,
        ageGroup: r.ageGroup,
        email: r.email,
        source: r.source,
      })),
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
