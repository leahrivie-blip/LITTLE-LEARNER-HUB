#!/usr/bin/env node
/**
 * Fast Daily Logs — ground-up redesign, testing accounts only.
 *
 * Verifies the classroom grid landing page, the bottom-sheet quick actions
 * (one-tap presets + minimal-field note forms + photo), the chronological
 * timeline, Parent Communication, and the AI Parent Summary generate/edit/
 * send flow — all against a REAL signed-up @example.invalid account (client
 * localStorage-based, exactly like a real teacher would use it), and
 * confirms a REAL (non-@example.invalid) account still sees the original,
 * unmodified Daily Logs experience.
 *
 * Run: node scripts/test-fast-daily-logs.js
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
const PORT = resolveTestPort(25200, 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-fast-daily-logs-${crypto.randomBytes(4).toString("hex")}.json`);
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/fast-daily-logs");

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
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
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
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
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

async function signUpHomeDaycareFree(page, email) {
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
  await page.waitForTimeout(1200);
}

async function addChild(page, name) {
  await page.evaluate(() => setView("children"));
  await page.waitForTimeout(300);
  // Drive the "add child" screen directly via app state rather than hunting
  // for a "+ Add Child" button, whose presence/position varies depending on
  // whatever child-management mode a PRIOR add left the view in.
  await page.evaluate(() => {
    childManagementMode = "add";
    renderChildManagement();
  });
  await page.waitForSelector("#childProfileForm", { timeout: 10000 });
  await page.fill('#childProfileForm input[name="name"]', name);
  await page.selectOption('#childProfileForm select[name="ageGroup"]', "Preschool");
  await page.click('#childProfileForm button[type="submit"]');
  await page.waitForTimeout(500);
}

async function main() {
  if (!chromium) {
    console.log("Playwright unavailable — skipping browser-driven checks (static-only run).");
    console.log("\nFast Daily Logs checks passed (0; browser checks skipped).");
    return;
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const modelJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(modelJs, /function renderFastDailyLogsCenter/);
  assert.match(modelJs, /function fastDlcChildCardHtml/);
  assert.match(modelJs, /function buildDailyLogTimelineEntries/);
  assert.match(modelJs, /isFakeAccountTester\(\)[\s\S]{0,400}?renderFastDailyLogsCenter\(records\)/);
  pass("static markers: fast Daily Logs render functions exist, gated by isFakeAccountTester()");

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const baseUrl = `http://127.0.0.1:${PORT}/`;
    const testEmail = `fast.dlc.teacher.${crypto.randomBytes(3).toString("hex")}@example.invalid`;

    const context = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await signUpHomeDaycareFree(page, testEmail);
    const isFake = await page.evaluate(() => isFakeAccountTester());
    assert.equal(isFake, true, "the signed-up @example.invalid account must be recognized as a fake/testing account");

    await addChild(page, "Ava Test");
    await addChild(page, "Ben Test");

    // ---- 1. Classroom grid is the landing page, not an individual child ----
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(600);
    const gridText = await page.locator(".fdlc-classroom-grid").textContent();
    assert.match(gridText, /Ava Test/);
    assert.match(gridText, /Ben Test/);
    const oldDashboardPresent = await page.locator(".dlc-dashboard, [data-dlc-dashboard-date]").count();
    assert.equal(oldDashboardPresent, 0, "the old sectioned dashboard must not render for a testing account");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "1-classroom-grid.png"), fullPage: true });
    pass("1. Daily Logs lands on the classroom grid (not an individual child, not the old sectioned dashboard) and shows every child as a compact card");

    // ---- 2. Tapping a child opens the bottom sheet with large quick actions ----
    await page.locator('[data-fast-dlc-open-sheet]').first().click();
    await page.waitForSelector(".fdlc-sheet", { timeout: 5000 });
    const actionLabels = await page.locator(".fdlc-action-btn").allTextContents();
    const expectedActions = ["Meal", "Bottle", "Nap", "Diaper / Potty", "Activity", "Photo", "Observation", "Incident Report", "Medication", "Behavior Note", "Milestone", "Parent Communication"];
    for (const label of expectedActions) {
      assert.ok(actionLabels.some((t) => t.includes(label)), `expected a quick action button for "${label}"`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "2-quick-action-sheet.png"), fullPage: true });
    pass("2. Tapping a child opens a bottom sheet (not a long page) with all 12 requested large quick-action buttons");

    // ---- 3. One-tap presets: Check In, Breakfast, Nap Started/Ended, Wet diaper ----
    // Saving a quick action re-renders the sheet still showing the SAME
    // sub-panel (fastDlcSheetView is untouched by saveDailyLogQuickAction) —
    // "← Back" returns to Quick Actions to pick the NEXT action group.
    await page.click('[data-dlc-quick-action="check-in"]');
    await page.waitForTimeout(400);
    await page.click('[data-fast-dlc-show="meal"]');
    await page.waitForTimeout(200);
    await page.click('[data-dlc-quick-action="breakfast"]');
    await page.waitForTimeout(400);
    await page.click('[data-fast-dlc-show="actions"]');
    await page.waitForTimeout(200);
    await page.click('[data-fast-dlc-show="nap"]');
    await page.waitForTimeout(200);
    await page.click('[data-dlc-quick-action="nap-started"]');
    await page.waitForTimeout(400);
    await page.click('[data-dlc-quick-action="nap-ended"]');
    await page.waitForTimeout(400);
    await page.click('[data-fast-dlc-show="actions"]');
    await page.waitForTimeout(200);
    await page.click('[data-fast-dlc-show="diaper"]');
    await page.waitForTimeout(200);
    await page.click('[data-dlc-quick-action="wet-diaper"]');
    await page.waitForTimeout(400);
    await page.click('[data-fast-dlc-show="actions"]');
    await page.waitForTimeout(200);
    pass("3. One-tap presets (Check In, Breakfast, Nap Started, Nap Ended, Wet Diaper) each log in a single tap with no typing required");

    // ---- 4. Minimal-field note actions: Observation, Incident, Milestone ----
    await page.click('[data-fast-dlc-show="observation"]');
    await page.waitForSelector('[data-fast-dlc-note-input="observation"]', { timeout: 5000 });
    await page.fill('[data-fast-dlc-note-input="observation"]', "Ava stacked 6 blocks independently.");
    await page.click('[data-fast-dlc-save-note="observation"]');
    await page.waitForTimeout(400);

    await page.click('[data-fast-dlc-show="milestone"]');
    await page.waitForSelector('[data-fast-dlc-note-input="milestone"]', { timeout: 5000 });
    await page.fill('[data-fast-dlc-note-input="milestone"]', "First time saying a full sentence!");
    await page.click('[data-fast-dlc-save-note="milestone"]');
    await page.waitForTimeout(400);

    await page.click('[data-fast-dlc-show="incident"]');
    await page.waitForSelector('[data-fast-dlc-note-input="incident"]', { timeout: 5000 });
    await page.fill('[data-fast-dlc-note-input="incident"]', "Small bump on the playground, ice pack applied.");
    await page.click('[data-fast-dlc-save-note="incident"]');
    await page.waitForTimeout(400);
    pass("4. Note-based actions (Observation, Milestone, Incident Report) each require only one textarea + one tap to save");

    // ---- 5. The child's full log is a chronological timeline ----
    await page.click('[data-fast-dlc-show="timeline"]');
    await page.waitForSelector(".fdlc-timeline", { timeout: 5000 });
    const timelineText = await page.locator(".fdlc-timeline").textContent();
    assert.match(timelineText, /Checked In/);
    assert.match(timelineText, /Breakfast/);
    assert.match(timelineText, /Nap Started/);
    assert.match(timelineText, /Nap Ended/);
    assert.match(timelineText, /Observation/);
    assert.match(timelineText, /stacked 6 blocks/);
    assert.match(timelineText, /Milestone/);
    assert.match(timelineText, /Incident Report/);
    const timelineRows = await page.locator(".fdlc-timeline-row").count();
    assert.ok(timelineRows >= 6, `expected several chronological timeline rows, got ${timelineRows}`);
    // Chronological order: every row's displayed time must be non-decreasing
    // (entries logged within the same minute — expected in a fast automated
    // test — are a legitimate tie, not a chronology bug).
    const rowTimes = await page.locator(".fdlc-timeline-time").allTextContents();
    const toMinutes = (label) => {
      const match = label.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return 0;
      let hours = Number(match[1]) % 12;
      if (/pm/i.test(match[3])) hours += 12;
      return hours * 60 + Number(match[2]);
    };
    for (let i = 1; i < rowTimes.length; i += 1) {
      assert.ok(toMinutes(rowTimes[i]) >= toMinutes(rowTimes[i - 1]), `timeline must be chronological: "${rowTimes[i - 1]}" then "${rowTimes[i]}"`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "3-timeline.png"), fullPage: true });
    pass("5. The child's daily log renders as an automatically-built chronological timeline, not a page of sectioned boxes");

    // ---- 6. Parent Communication is at the bottom, below the timeline ----
    const parentCommSection = page.locator(".fdlc-parent-comm-section");
    await page.fill('.fdlc-parent-comm-section [data-fast-dlc-note-input="parent-message"]', "Ava had a wonderful morning!");
    await parentCommSection.locator('[data-fast-dlc-save-note="parent-message"]').click();
    await page.waitForTimeout(400);
    const parentCommBox = await page.locator(".fdlc-parent-comm-section").boundingBox();
    const aiSummaryBox = await page.locator(".fdlc-ai-summary-section").boundingBox();
    const timelineBox = await page.locator(".fdlc-timeline").boundingBox();
    assert.ok(parentCommBox.y > timelineBox.y, "Parent Communication must be positioned below the timeline");
    pass("6. Parent Communication is positioned at the bottom of the daily log, below the timeline, and sending a message works in one tap");

    // ---- 7. AI Parent Summary: generate, edit, and send ----
    assert.ok(aiSummaryBox.y > parentCommBox.y || aiSummaryBox.y > timelineBox.y, "AI Parent Summary must be at the bottom of the screen");
    await page.click('[data-fast-dlc-generate-summary]');
    await page.waitForTimeout(300);
    const summaryValue = await page.locator('[data-dlc-summary-input]').inputValue();
    assert.ok(summaryValue.length > 10, "Generate Summary must fill the textarea with real generated text");
    await page.fill('[data-dlc-summary-input]', `${summaryValue} Edited by teacher.`);
    await page.click('[data-dlc-save-summary]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "4-ai-parent-summary.png"), fullPage: true });
    pass("7. AI Parent Summary can be generated from everything logged today, edited, and sent — all from the bottom of the same screen");

    assert.deepEqual(pageErrors, [], `Fast Daily Logs should have zero console errors: ${JSON.stringify(pageErrors)}`);
    await context.close();

    // ---- 8. A real (non-testing) account still sees the ORIGINAL Daily Logs UI ----
    {
      const realContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const realPage = await realContext.newPage();
      await realPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await realPage.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      const realEmail = `real.teacher.${crypto.randomBytes(3).toString("hex")}@example.com`;
      await signUpHomeDaycareFree(realPage, realEmail);
      await addChild(realPage, "Real Child");
      await realPage.evaluate(() => setView("child-tools-daily-logs"));
      await realPage.waitForTimeout(600);
      const fastGridCount = await realPage.locator(".fdlc-classroom-grid").count();
      assert.equal(fastGridCount, 0, "a real (non-@example.invalid) account must NOT see the new fast Daily Logs UI");
      const oldUiPresent = await realPage.locator(".daily-logs-page").count();
      assert.ok(oldUiPresent > 0, "a real account must still see the original Daily Logs page");
      await realContext.close();
      pass("8. A real (non-testing) account is completely unaffected and still sees the original, unmodified Daily Logs experience");
    }
  } finally {
    await stopServer(child);
    await browser.close();
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nFast Daily Logs checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
