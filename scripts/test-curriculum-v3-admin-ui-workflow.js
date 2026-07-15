#!/usr/bin/env node
/**
 * Browser regression: label-only admin import workflow.
 * Run: node scripts/test-curriculum-v3-admin-ui-workflow.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19610 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-v3-ui-${crypto.randomBytes(4).toString("hex")}.json`);
const V3_FULL = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const OCEAN = path.join(ROOT, "scripts/curriculum-import-samples/ocean-explorers-chatgpt-format.txt");
const ADMIN = {
  email: "v3-ui-test@test.local",
  password: "v3-ui-test-pass",
  code: "v3-ui-test-code",
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
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
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

async function openAdminImporter(page) {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(() => setView("admin"));
  const unlockForm = page.locator("#adminUnlockForm");
  if (await unlockForm.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.fill('input[name="adminEmail"]', ADMIN.email);
    await page.fill('input[name="adminPassword"]', ADMIN.password);
    await page.fill('input[name="adminCode"]', ADMIN.code);
    await page.click("#adminUnlockForm button[type='submit']");
    await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
  }
  await page.evaluate(() => {
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
    if (typeof createAdminCurriculumLessonPlan === "function") createAdminCurriculumLessonPlan();
  });
  await page.waitForSelector("#adminCurriculumLessonImportText", { timeout: 15000 });
}

async function runImportSaveWorkflow(page, label, pasteText) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await openAdminImporter(page);
  await page.fill("#adminCurriculumLessonImportText", pasteText);

  // Prefer one-click Import Lesson Plan (parse + save).
  const importBtn = page.locator("#adminCurriculumLessonImportSaveButton");
  if (await importBtn.count()) {
    await importBtn.click();
  } else {
    await page.click("#adminCurriculumLessonParseButton");
    await page.waitForSelector(".curriculum-import-preview", { timeout: 15000 });
    const duplicateBtn = page.locator('[data-import-title-action="new-copy"]');
    if (await duplicateBtn.isVisible().catch(() => false)) await duplicateBtn.click();
    await page.click("#adminCurriculumLessonConfirmImportButton");
  }

  // If preview opened because of errors/duplicates, resolve and Import & Save.
  if (await page.locator(".curriculum-import-preview").isVisible().catch(() => false)) {
    const previewText = await page.locator(".curriculum-import-preview").innerText();
    assert(!/Render failed/i.test(previewText), `${label}: preview shows Render failed`);
    const duplicateBtn = page.locator('[data-import-title-action="new-copy"]');
    if (await duplicateBtn.isVisible().catch(() => false)) {
      await duplicateBtn.click();
      await page.waitForTimeout(300);
    }
    const confirm = page.locator("#adminCurriculumLessonConfirmImportButton");
    if (await confirm.isVisible().catch(() => false)) {
      if (await confirm.isDisabled()) {
        const errors = await page.locator(".curriculum-import-issue-list.is-error").innerText().catch(() => "");
        throw new Error(`${label}: preview blocked import. ${errors}`);
      }
      await confirm.click();
    }
  }

  await page.waitForSelector("#adminCurriculumLessonPlanForm", { timeout: 20000 });
  await page.waitForFunction(() => {
    const msg = document.querySelector("#adminCurriculumLessonPlanMessage, #adminCurriculumLessonPlanBanner");
    return msg && /saved|✅|linked activities/i.test(msg.textContent || "");
  }, null, { timeout: 45000 });

  const formText = await page.locator("#adminCurriculumLessonPlanForm").innerText();
  assert(!/Render failed/i.test(formText), `${label}: editor shows Render failed`);

  const planId = await page.evaluate(() => adminCurriculumLessonEditorId || "");
  assert(planId, `${label}: missing plan id after import/save`);

  await page.evaluate((id) => {
    if (typeof openResourceViewer === "function") openResourceViewer(id);
  }, planId);
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
  const viewerText = await page.locator("#resourceViewerBody").innerText();
  assert(viewerText.length > 20, `${label}: viewer empty`);
  assert(!/Render failed/i.test(viewerText), `${label}: viewer shows Render failed`);

  await page.click("#resourceViewerModal .modal-close, #resourceViewerModal button[aria-label='Close']")
    .catch(() => page.keyboard.press("Escape"));

  const renderFailed = [...consoleErrors, ...pageErrors].filter((entry) => /render failed|TypeError|Cannot read propert/i.test(entry));
  if (renderFailed.length) {
    throw new Error(`${label}: runtime errors:\n${renderFailed.join("\n")}`);
  }
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.log("Playwright not installed — skipping browser UI workflow (install with npm install).");
    return;
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("dialog", async (dialog) => { await dialog.accept(); });

    console.log("1) Full label-only lesson plan Import & Save");
    await runImportSaveWorkflow(page, "v3-full", fs.readFileSync(V3_FULL, "utf8"));

    console.log("2) ChatGPT Ocean Explorers format Import & Save");
    await runImportSaveWorkflow(page, "ocean-chatgpt", fs.readFileSync(OCEAN, "utf8"));

    console.log("3) Optional fields stripped still Import & Save");
    const minimal = fs.readFileSync(V3_FULL, "utf8")
      .replace(/^TITLE:\n[^\n]+\n/m, "TITLE:\nGarden Scientists Optional Fields Missing\n")
      .replace(/^OBJECTIVE:\n[^\n]+\n/gm, "")
      .replace(/^OBSERVATION_OPPORTUNITIES:\n[^\n]+\n/gm, "")
      .replace(/^SETUP:\n[^\n]+\n/gm, "");
    await runImportSaveWorkflow(page, "v3-minimal-optional", minimal);

    await browser.close();
    console.log("\nAll label-only admin UI workflow checks passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
});
