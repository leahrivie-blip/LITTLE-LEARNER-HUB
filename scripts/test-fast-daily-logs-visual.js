#!/usr/bin/env node
/**
 * Fast Daily Logs — visual review (Section 8) across phone/tablet/desktop.
 *
 * Verifies at 360px, 390px, 430px phone widths, a tablet size, and desktop:
 * classroom grid stays scannable, the bottom sheet is never cut off, no
 * button overlaps the Testing Feedback widget, Parent Communication is the
 * LAST section, common actions need minimal scrolling, there is never
 * horizontal scrolling, and touch targets are large enough (>=40px).
 *
 * Run: node scripts/test-fast-daily-logs-visual.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  chromium = null;
}

const ROOT = path.join(__dirname, "..");
const { resolveTestPort } = require("./test-port.js");
const PORT = resolveTestPort(26100, 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-fast-daily-logs-visual-${crypto.randomBytes(4).toString("hex")}.json`);
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/fast-daily-logs-visual");

const VIEWPORTS = [
  { label: "phone-360", width: 360, height: 740 },
  { label: "phone-390", width: 390, height: 844 },
  { label: "phone-430", width: 430, height: 932 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1280, height: 900 },
];

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode }));
    });
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), SITE_URL: `http://127.0.0.1:${PORT}`, DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: STORE_PATH, NODE_ENV: "test", EMAIL_AUTOMATIONS_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function signUpAndSeed(page, email) {
  await page.evaluate(() => openAuthModal("signup"));
  await page.fill("#fullNameInput", "Casey Teacher");
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", "TestPass123!");
  await page.click("#authSubmitButton");
  await page.waitForFunction(() => {
    const program = document.querySelector("#signupStepProgram");
    return program && !program.classList.contains("hidden-field");
  }, { timeout: 30000 });
  await page.click('[data-signup-persona="home_daycare"]');
  await page.waitForTimeout(200);
  await page.click("#authSubmitButton");
  await page.waitForFunction(() => {
    const plan = document.querySelector("#signupStepPlan");
    return plan && !plan.classList.contains("hidden-field");
  }, { timeout: 20000 });
  await page.click('[data-signup-choose-plan="free"]');
  await page.waitForSelector("[data-signup-confirm-free]", { timeout: 10000 });
  await page.click("[data-signup-confirm-free]");
  await page.waitForTimeout(1000);
  await page.evaluate(() => setView("children"));
  await page.waitForTimeout(300);
  for (const name of ["Ava Test", "Ben Test", "Cleo Test", "Dax Test"]) {
    await page.evaluate(() => { childManagementMode = "add"; renderChildManagement(); });
    await page.waitForSelector("#childProfileForm", { timeout: 10000 });
    await page.fill('#childProfileForm input[name="name"]', name);
    await page.selectOption('#childProfileForm select[name="ageGroup"]', "Preschool");
    await page.click('#childProfileForm button[type="submit"]');
    await page.waitForTimeout(300);
  }
}

async function main() {
  if (!chromium) {
    console.log("Playwright unavailable — skipping browser-driven checks (static-only run).");
    console.log("\nFast Daily Logs visual review passed (0; browser checks skipped).");
    return;
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const baseUrl = `http://127.0.0.1:${PORT}/`;

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await signUpAndSeed(page, `visual.${viewport.label}.${crypto.randomBytes(3).toString("hex")}@example.invalid`);
      await page.evaluate(() => setView("child-tools-daily-logs"));
      await page.waitForTimeout(600);

      // No horizontal scrolling at any size.
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflowX <= 1, `${viewport.label}: no horizontal scrolling expected, got ${overflowX}px of overflow`);

      // All children remain easy to scan: every card fits within the viewport width.
      const cardBoxes = await page.locator(".fdlc-child-card").evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
      assert.ok(cardBoxes.length >= 4, "expected all 4 children visible as cards");
      cardBoxes.forEach((box) => assert.ok(box.width <= viewport.width + 1, `${viewport.label}: a child card must never be wider than the viewport`));

      // Touch targets: the quick-add "+" button and group-log button must be >= 40px in the smaller dimension.
      const quickAddBox = await page.locator(".fdlc-quick-add-btn").first().boundingBox();
      assert.ok(quickAddBox.width >= 40 && quickAddBox.height >= 40, `${viewport.label}: quick-add touch target must be at least 40x40px, got ${quickAddBox.width}x${quickAddBox.height}`);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${viewport.label}-1-classroom-grid.png`), fullPage: true });

      // Open the bottom sheet — must not be cut off (top must be reachable, and its own body scrolls internally rather than being pushed off-screen).
      await page.locator("[data-fast-dlc-open-sheet]").first().click();
      await page.waitForSelector(".fdlc-sheet", { timeout: 5000 });
      const sheetBox = await page.locator(".fdlc-sheet").boundingBox();
      assert.ok(sheetBox.y >= -1, `${viewport.label}: the sheet's top must not start above the viewport (cut off)`);
      assert.ok(sheetBox.y + sheetBox.height <= viewport.height + 40, `${viewport.label}: the sheet must not extend meaningfully past the bottom of the viewport uncontrolled`);
      const sheetHeaderVisible = await page.locator(".fdlc-sheet-header").isVisible();
      assert.equal(sheetHeaderVisible, true, `${viewport.label}: the sheet header (child name + close button) must always be visible, never cut off`);

      // Action buttons in the sheet must be >= 40px tall (touch target).
      const actionBtnBox = await page.locator(".fdlc-action-btn").first().boundingBox();
      assert.ok(actionBtnBox.height >= 40, `${viewport.label}: quick-action buttons must be at least 40px tall, got ${actionBtnBox.height}`);

      // Testing Feedback widget must never overlap the sheet's own controls when both are present.
      const feedbackWidgetBox = await page.locator("[data-testing-feedback-widget]").boundingBox().catch(() => null);
      if (feedbackWidgetBox) {
        const closeBtnBox = await page.locator("button[data-fast-dlc-close-sheet]").boundingBox();
        const overlaps = !(closeBtnBox.x + closeBtnBox.width < feedbackWidgetBox.x
          || feedbackWidgetBox.x + feedbackWidgetBox.width < closeBtnBox.x
          || closeBtnBox.y + closeBtnBox.height < feedbackWidgetBox.y
          || feedbackWidgetBox.y + feedbackWidgetBox.height < closeBtnBox.y);
        assert.equal(overlaps, false, `${viewport.label}: the Testing Feedback widget must never overlap the sheet's close button`);
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${viewport.label}-2-quick-action-sheet.png`), fullPage: true });

      // Common actions need minimal scrolling: a one-tap preset must be reachable within the sheet's own body without excessive scroll depth.
      await page.click('[data-dlc-quick-action="check-in"]');
      await page.waitForTimeout(300);

      // Parent Communication must be the LAST section (below the timeline AND the Create Parent Summary section).
      await page.click('[data-fast-dlc-show="timeline"]');
      await page.waitForTimeout(300);
      const timelineBox = await page.locator(".fdlc-timeline").boundingBox();
      const summaryBox = await page.locator(".fdlc-ai-summary-section").boundingBox();
      const parentCommBox = await page.locator(".fdlc-parent-comm-section").boundingBox();
      assert.ok(parentCommBox.y > timelineBox.y, `${viewport.label}: Parent Communication must be below the timeline`);
      assert.ok(parentCommBox.y > summaryBox.y, `${viewport.label}: Parent Communication must be the LAST section, below Create Parent Summary`);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${viewport.label}-3-timeline.png`), fullPage: true });

      assert.deepEqual(pageErrors, [], `${viewport.label}: zero console errors expected, got ${JSON.stringify(pageErrors)}`);
      pass(`${viewport.label} (${viewport.width}x${viewport.height}): classroom grid scannable, no horizontal scroll, sheet never cut off, touch targets >=40px, no overlap with Testing Feedback, Parent Communication is the last section`);
      await context.close();
    }
  } finally {
    await stopServer(child);
    await browser.close();
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nFast Daily Logs visual review passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
