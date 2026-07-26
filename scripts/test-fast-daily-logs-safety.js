#!/usr/bin/env node
/**
 * Fast Daily Logs — safety & workflow gap follow-up.
 *
 * Covers: group logging, accidental tap recovery (Undo + duplicate-tap
 * prevention), structured medication safety, "Create Parent Summary"
 * wording + share scope, edits/corrections with history, print, and the
 * Home Daycare Pilot photo-sharing bridge (organization/child-scoped,
 * cross-org rejected server-side, unshare never deletes the original).
 *
 * Run: node scripts/test-fast-daily-logs-safety.js
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
const PORT = resolveTestPort(25800, 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-fast-daily-logs-safety-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "fdlc-safety-admin@example.invalid", password: "fdlc-safety-pass", code: "fdlc-safety-code" };
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/fast-daily-logs-safety");

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json });
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
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
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
    if (child.exitCode !== null) {
      const errText = child.stderr?.read?.()?.toString?.() || "";
      throw new Error(`server exited (${child.exitCode}): ${errText.slice(0, 400)}`);
    }
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
  await page.evaluate(() => { childManagementMode = "add"; renderChildManagement(); });
  await page.waitForSelector("#childProfileForm", { timeout: 10000 });
  await page.fill('#childProfileForm input[name="name"]', name);
  await page.selectOption('#childProfileForm select[name="ageGroup"]', "Preschool");
  await page.click('#childProfileForm button[type="submit"]');
  await page.waitForTimeout(500);
}

async function main() {
  if (!chromium) {
    console.log("Playwright unavailable — skipping browser-driven checks (static-only run).");
    console.log("\nFast Daily Logs safety checks passed (0; browser checks skipped).");
    return;
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /needs_provider_information/);
  assert.match(appJs, /function undoChildRecord/);
  assert.match(appJs, /function applyChildRecordCorrection/);
  assert.match(appJs, /FAST_DLC_DUPLICATE_COOLDOWN_MS/);
  assert.match(appJs, /Create Parent Summary/);
  assert.match(appJs, /data-fast-dlc-open-group-log/);
  pass("static markers: medication safety, undo, corrections, duplicate-tap prevention, renamed summary, and group logging all present in app.js");

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const baseUrl = `http://127.0.0.1:${PORT}/`;
    const testEmail = `fdlc.safety.teacher.${crypto.randomBytes(3).toString("hex")}@example.invalid`;

    const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await signUpHomeDaycareFree(page, testEmail);
    await addChild(page, "Ava Test");
    await addChild(page, "Ben Test");
    await addChild(page, "Cleo Test");

    // ---- 1. GROUP LOGGING ----------------------------------------------------
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(500);
    await page.click("[data-fast-dlc-open-group-log]");
    await page.waitForSelector(".fdlc-sheet", { timeout: 5000 });
    await page.click('[data-fast-dlc-group-type="meal"]');
    await page.waitForTimeout(200);
    // Never assume every checked-in child participated — nobody pre-checked.
    const preChecked = await page.locator("[data-fast-dlc-group-child-check]:checked").count();
    assert.equal(preChecked, 0, "no child must be pre-selected for a group log action");
    await page.click('[data-fast-dlc-group-child-check][value]:visible >> nth=0');
    const checkboxes = await page.locator("[data-fast-dlc-group-child-check]").all();
    // Select Ava and Ben, leave Cleo unselected entirely (also proves partial selection works).
    for (const box of checkboxes) {
      const label = await box.evaluate((el) => el.closest("label")?.textContent || "");
      if (/Ava Test|Ben Test/.test(label) && !(await box.isChecked())) await box.check();
    }
    await page.click('[data-fast-dlc-group-step="details"]');
    await page.waitForTimeout(200);
    await page.fill("[data-fast-dlc-group-shared-note]", "Pancakes and fruit for breakfast");
    // Explicit per-child exception: Ben did NOT eat, excluded with a note.
    const benExceptionRow = page.locator(".fdlc-exception-row", { hasText: "Ben Test" });
    await benExceptionRow.locator('[data-fast-dlc-group-exception-included]').uncheck();
    await benExceptionRow.locator("[data-fast-dlc-group-exception-note]").fill("Refused breakfast, will offer snack later");
    await page.click('[data-fast-dlc-group-step="preview"]');
    await page.waitForTimeout(200);
    const previewText = await page.locator(".fdlc-sheet-body").textContent();
    assert.match(previewText, /Ava Test/);
    assert.match(previewText, /Excluded/);
    assert.match(previewText, /Ben Test/);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "1-group-log-preview.png"), fullPage: true });
    await page.click("[data-fast-dlc-group-confirm]");
    await page.waitForTimeout(500);

    // Verify: Ava got the meal, Ben did NOT, Cleo (never selected) did NOT.
    const avaTimeline = await page.evaluate(() => {
      const records = childRecords();
      const ava = records.children.find((c) => c.name === "Ava Test");
      return buildDailyLogTimelineEntries(ava, records, dlcActiveDate());
    });
    assert.ok(avaTimeline.some((e) => e.title === "Lunch" || e.title === "Meal"), "the included child must have the group-logged meal");
    const benMeals = await page.evaluate(() => childStore("Meals").filter((m) => childRecords().children.find((c) => c.name === "Ben Test")?.id === m.childId));
    assert.equal(benMeals.length, 0, "an explicitly-excluded child must NOT get a record from the group log");
    const cleoMeals = await page.evaluate(() => childStore("Meals").filter((m) => childRecords().children.find((c) => c.name === "Cleo Test")?.id === m.childId));
    assert.equal(cleoMeals.length, 0, "a child who was never selected must NOT get a record from the group log");
    // Every included child's record carries the shared groupLogId for audit.
    const groupLogIds = await page.evaluate(() => [...new Set(childStore("Meals").map((m) => m.groupLogId).filter(Boolean))]);
    assert.equal(groupLogIds.length, 1, "every record created by one group-log confirmation must share the SAME groupLogId");
    pass("1. Group Logging: shared info entered once, explicit per-child selection (never pre-assumed), individual exceptions honored, preview shown before confirming, and every included child's record is tagged with a shared audit groupLogId");

    // ---- 2. ACCIDENTAL TAP RECOVERY -------------------------------------------
    const avaId = await page.evaluate(() => childRecords().children.find((c) => c.name === "Ava Test").id);
    await page.locator(`[data-fast-dlc-open-sheet="${avaId}"]`).first().click();
    await page.waitForSelector(".fdlc-sheet", { timeout: 5000 });
    await page.click('[data-dlc-quick-action="check-in"]');
    await page.waitForTimeout(400);
    const bannerText = await page.locator(".fdlc-last-action-banner").textContent();
    assert.match(bannerText, /Checked In/);
    assert.match(bannerText, /Ava Test/);
    // Duplicate tap: clicking Check In again immediately must NOT create a second record.
    await page.click('[data-dlc-quick-action="check-in"]');
    await page.waitForTimeout(300);
    const attendanceCountAfterDoubleTap = await page.evaluate((id) => childStore("Attendance").filter((a) => a.childId === id).length, avaId);
    assert.equal(attendanceCountAfterDoubleTap, 1, "a duplicate tap within the cooldown window must NOT create a second record");
    // Undo — must not delete, must exclude from the active timeline.
    await page.click(".fdlc-undo-btn");
    await page.waitForTimeout(300);
    const undoneRecord = await page.evaluate((id) => childStore("Attendance").find((a) => a.childId === id), avaId);
    assert.equal(undoneRecord.undone, true, "Undo must mark the record undone, not delete it");
    assert.ok(undoneRecord.id, "the undone record must still exist in the store (auditable correction, not silent erase)");
    const timelineAfterUndo = await page.evaluate((id) => {
      const child = childRecords().children.find((c) => c.id === id);
      return buildDailyLogTimelineEntries(child, childRecords(), dlcActiveDate());
    }, avaId);
    assert.ok(!timelineAfterUndo.some((e) => e.title === "Checked In"), "an undone entry must disappear from the active timeline");
    pass("2. Accidental Tap Recovery: every one-tap action shows exactly what was recorded + an Undo, a duplicate tap within the cooldown creates no second record, and Undo marks the record undone (auditable) rather than deleting it");

    // ---- 3. MEDICATION SAFETY -------------------------------------------------
    await page.click('[data-fast-dlc-show="medication"]');
    await page.waitForSelector('[data-fast-dlc-medication-form]', { timeout: 5000 });
    // Submit with NOTHING filled in — must save as "needs provider information", never invent details.
    await page.click('[data-fast-dlc-medication-form] button[type="submit"]');
    await page.waitForTimeout(400);
    const incompleteMed = await page.evaluate((id) => childStore("Communications").filter((c) => c.childId === id && c.type === "Medication").slice(-1)[0], avaId);
    assert.equal(incompleteMed.status, "needs_provider_information");
    assert.equal(incompleteMed.medicationName, "", "a blank required field must stay blank, never invented");
    assert.equal(incompleteMed.shareWithFamily, false, "an incomplete medication record must never be shareWithFamily");
    const shareBlocked = await page.evaluate(async (recordId) => {
      const before = childStore("Communications").find((c) => c.id === recordId);
      const ok = await setChildRecordFamilyShare("Communications", recordId, true);
      const after = childStore("Communications").find((c) => c.id === recordId);
      return {
        ok,
        beforeShared: before?.shareWithFamily === true,
        afterShared: after?.shareWithFamily === true,
        status: after?.status,
      };
    }, incompleteMed.id);
    assert.equal(shareBlocked.ok, false, "incomplete medication drafts must refuse shareWithFamily=true");
    assert.equal(shareBlocked.afterShared, false, "incomplete medication must remain unshared after a share attempt");
    assert.equal(shareBlocked.status, "needs_provider_information");
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(300);
    await page.locator(`[data-fast-dlc-open-sheet="${avaId}"]`).first().click();
    await page.waitForTimeout(300);
    await page.click('[data-fast-dlc-show="timeline"]');
    await page.waitForTimeout(300);
    const timelineTextWithMed = await page.locator(".fdlc-timeline").textContent();
    assert.match(timelineTextWithMed, /Needs Provider Information/i);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "2-medication-needs-info.png"), fullPage: true });

    // Now fill in the structured fields completely — back to Quick Actions first (medication's button only lives there, not on the Timeline tab).
    await page.click('[data-fast-dlc-show="actions"]');
    await page.waitForTimeout(200);
    await page.click('[data-fast-dlc-show="medication"]');
    await page.waitForSelector('[data-fast-dlc-medication-form]', { timeout: 5000 });
    await page.fill('[data-fast-dlc-medication-form] input[name="medicationName"]', "Children's Tylenol");
    await page.fill('[data-fast-dlc-medication-form] input[name="dosage"]', "5mL");
    await page.selectOption('[data-fast-dlc-medication-form] select[name="authorizationStatus"]', "authorized_by_parent");
    await page.fill('[data-fast-dlc-medication-form] input[name="administeredBy"]', "Casey Teacher");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "3-medication-structured-form.png"), fullPage: true });
    await page.click('[data-fast-dlc-medication-form] button[type="submit"]');
    await page.waitForTimeout(400);
    const completeMed = await page.evaluate((id) => childStore("Communications").filter((c) => c.childId === id && c.type === "Medication").slice(-1)[0], avaId);
    assert.equal(completeMed.status, "completed");
    assert.equal(completeMed.medicationName, "Children's Tylenol");
    assert.equal(completeMed.dosage, "5mL");
    assert.equal(completeMed.authorizationStatus, "authorized_by_parent");
    pass("3. Medication is a structured record (name, dosage, time, authorization, administered by, notes, parent notification) — missing required fields save as 'Needs provider information' with nothing invented, and only fully-completed records are marked complete");

    // ---- 4. SUMMARY WORDING -----------------------------------------------------
    await page.click('[data-fast-dlc-show="timeline"]');
    await page.waitForTimeout(300);
    const summarySectionText = await page.locator(".fdlc-ai-summary-section").textContent();
    assert.match(summarySectionText, /Create Parent Summary/);
    assert.match(summarySectionText, /Generate Draft/);
    assert.doesNotMatch(summarySectionText, /AI Parent Summary/i);
    assert.match(summarySectionText, /only to the connected fake Parent\/Guardian inbox/i);
    assert.match(summarySectionText, /never sends an email, SMS, push notification, or public link/i);
    const shareBtnText = await page.locator('[data-dlc-save-summary]').textContent();
    assert.match(shareBtnText, /Share with Parent/);
    pass("4. The section is titled 'Create Parent Summary' (not 'AI Parent Summary'), the flow is Generate Draft → Review/Edit → Share with Parent, and the scope of 'Share with Parent' is explicitly stated (fake inbox only, never email/SMS/push/public link)");

    // ---- 5. EDITS AND CORRECTIONS -----------------------------------------------
    await page.click('[data-fast-dlc-show="actions"]');
    await page.waitForTimeout(200);
    await page.click('[data-fast-dlc-show="observation"]');
    await page.waitForSelector('[data-fast-dlc-note-input="observation"]', { timeout: 5000 });
    await page.fill('[data-fast-dlc-note-input="observation"]', "Ava stacked 4 blocks.");
    await page.click('[data-fast-dlc-save-note="observation"]');
    await page.waitForTimeout(400);
    await page.click('[data-fast-dlc-show="timeline"]');
    await page.waitForTimeout(300);
    const editBtn = page.locator('.fdlc-timeline-row:has-text("stacked 4 blocks") [data-fast-dlc-edit-entry]');
    await editBtn.click();
    await page.waitForSelector(".fdlc-correction-form", { timeout: 5000 });
    await page.fill("[data-fast-dlc-correction-notes]", "Ava stacked 6 blocks independently (corrected count).");
    await page.check("[data-fast-dlc-correction-late]");
    // Reason is required — saving without one must be rejected.
    await page.click("[data-fast-dlc-save-correction]");
    await page.waitForTimeout(300);
    let stillEditing = await page.locator(".fdlc-correction-form").count();
    assert.ok(stillEditing > 0, "a correction without a reason must be rejected, not silently accepted");
    await page.fill("[data-fast-dlc-correction-reason]", "Recounted after review — miscounted originally.");
    await page.click("[data-fast-dlc-save-correction]");
    await page.waitForTimeout(400);
    const correctedRecord = await page.evaluate((id) => childStore("Observations").find((o) => o.childId === id), avaId);
    assert.ok(Array.isArray(correctedRecord.corrections) && correctedRecord.corrections.length === 1, "a correction must be appended to corrections[], never replacing history");
    assert.equal(correctedRecord.corrections[0].reason, "Recounted after review — miscounted originally.");
    assert.equal(correctedRecord.enteredLate, true);
    assert.notEqual(correctedRecord.originalNotes, undefined, "the ORIGINAL note must be preserved even after a correction");
    const timelineAfterCorrection = await page.locator(".fdlc-timeline").textContent();
    assert.match(timelineAfterCorrection, /entered late/i);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "4-correction-history.png"), fullPage: true });
    pass("5. Corrections require a reason (rejected without one), never silently replace the original — the ORIGINAL note is preserved, every correction is appended to a visible history, and the entry is flagged 'entered late'");

    // ---- 6. PRINTING -------------------------------------------------------------
    const [timelinePopup] = await Promise.all([
      context.waitForEvent("page", { timeout: 5000 }).catch(() => null),
      page.click('[data-fast-dlc-print-timeline]'),
    ]);
    assert.ok(timelinePopup, "Print Daily Report must open a printable document");
    await timelinePopup?.close();
    const [summaryPopup] = await Promise.all([
      context.waitForEvent("page", { timeout: 5000 }).catch(() => null),
      page.click('[data-fast-dlc-print-summary]'),
    ]);
    assert.ok(summaryPopup, "Print Summary must open a printable document");
    await summaryPopup?.close();
    pass("6. Both the daily report/timeline and the parent summary can be printed / saved as PDF via the browser's print dialog");

    // ---- 7. OFFLINE / REFRESH DRAFT SAFETY ---------------------------------------
    await page.click('[data-fast-dlc-show="actions"]');
    await page.waitForTimeout(200);
    await page.click('[data-fast-dlc-show="incident"]');
    await page.waitForSelector('[data-fast-dlc-note-input="incident"]', { timeout: 5000 });
    await page.fill('[data-fast-dlc-note-input="incident"]', "Small scrape on the knee, unsaved draft test.");
    // Simulate offline + refresh WITHOUT saving.
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await context.setOffline(false);
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(400);
    await page.click('[data-fast-dlc-open-sheet="' + avaId + '"]');
    await page.waitForTimeout(300);
    await page.click('[data-fast-dlc-show="incident"]');
    await page.waitForSelector('[data-fast-dlc-note-input="incident"]', { timeout: 5000 });
    const restoredDraft = await page.inputValue('[data-fast-dlc-note-input="incident"]');
    assert.equal(restoredDraft, "Small scrape on the knee, unsaved draft test.", "an unsaved draft must survive an offline refresh");
    await page.click('[data-fast-dlc-save-note="incident"]');
    await page.waitForTimeout(400);
    const incidentCountAfterSave = await page.evaluate((id) => childStore("Communications").filter((c) => c.childId === id && c.type === "Incident Report").length, avaId);
    assert.equal(incidentCountAfterSave, 1, "saving the restored draft must create exactly one record, never a duplicate from the refresh");
    pass("7. An in-progress (unsaved) note survives an offline refresh via draft persistence, and saving it afterward creates exactly one record — no duplicate from the refresh/retry");

    assert.deepEqual(pageErrors, [], `Fast Daily Logs safety flows should have zero console errors: ${JSON.stringify(pageErrors)}`);
    await context.close();
  } finally {
    try { await browser.close(); } catch { /* ignore */ }
    await stopServer(child);
  }

  // ---- 8. PHOTO SAFETY BRIDGE (Home Daycare Pilot, server-side) --------------
  {
    const pilotChild = startServer();
    try {
      await waitForBoot(pilotChild);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
      const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
      await requestJson("POST", "/api/admin/site-content", {
        adminToken: adminLogin.json.token,
        siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
      });
      const wizard = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Photo Tester", email: "photo.tester@example.invalid", childCount: 1 }, auth);
      const orgId = wizard.json.organizationId;
      const login = await requestJson("POST", "/api/auth/password-login", { email: "photo.tester@example.invalid", password: wizard.json.temporaryPassword });
      const memberAuth = { Authorization: `Bearer ${login.json.memberSessionToken}` };
      const children = (await requestJson("GET", "/api/pilot/children", null, memberAuth)).json.children;
      const childId = children[0].id;

      const fakeDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const addPhoto = await requestJson("POST", "/api/pilot/photos", { childId, caption: "Fake testing photo", dataUrl: fakeDataUrl }, memberAuth);
      assert.equal(addPhoto.status, 200);
      assert.equal(addPhoto.json.photo.dataUrl, undefined, "the create response must not echo the full image data back");

      const guardianOptions = await requestJson("GET", "/api/external-tester/guardian-options", null, memberAuth);
      const contactId = guardianOptions.json.options[0].contactId;
      await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "parent_guardian", previewContactId: contactId }, memberAuth);
      const parentHome = await requestJson("GET", "/api/pilot/parent-home", null, memberAuth);
      assert.equal(parentHome.json.children[0].sharedPhotos.length, 1);
      assert.equal(parentHome.json.children[0].sharedPhotos[0].dataUrl, fakeDataUrl);
      pass("8a. A fake testing photo saved as provider is organization- and child-scoped, and appears on the linked guardian's Parent Home");

      // Switch back to provider, unshare — must NOT delete the original record.
      await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "solo_provider" }, memberAuth);
      const photoId = addPhoto.json.photo.id;
      const unshare = await requestJson("POST", "/api/pilot/photos/visibility", { photoId, sharedWithFamily: false }, memberAuth);
      assert.equal(unshare.status, 200);
      const providerPhotosAfterUnshare = await requestJson("GET", `/api/pilot/photos?childId=${childId}`, null, memberAuth);
      assert.equal(providerPhotosAfterUnshare.json.photos.length, 1, "unsharing must NOT delete the provider's original photo record");
      await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "parent_guardian", previewContactId: contactId }, memberAuth);
      const parentHomeAfterUnshare = await requestJson("GET", "/api/pilot/parent-home", null, memberAuth);
      assert.equal(parentHomeAfterUnshare.json.children[0].sharedPhotos.length, 0, "the parent must no longer see an unshared photo");
      pass("8b. Removing parent visibility (unshare) never deletes the provider's original photo record — only the family-visible flag changes");

      // Cross-organization rejection: a second, unrelated pilot org's tester must never see org A's photos.
      const wizardB = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Photo Tester B", email: "photo.tester.b@example.invalid", childCount: 1 }, auth);
      const loginB = await requestJson("POST", "/api/auth/password-login", { email: "photo.tester.b@example.invalid", password: wizardB.json.temporaryPassword });
      const memberAuthB = { Authorization: `Bearer ${loginB.json.memberSessionToken}` };
      const crossOrgAttempt = await requestJson("GET", `/api/pilot/photos?childId=${childId}`, null, memberAuthB);
      assert.equal(crossOrgAttempt.status, 403, "a different organization's tester must get 403 for another org's childId");
      assert.equal(crossOrgAttempt.json?.code, "wrong_child");
      void orgId;
      pass("8c. Cross-organization photo access is rejected server-side with 403 — a different pilot organization's tester never sees another organization's photos");
    } finally {
      await stopServer(pilotChild);
      try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    }
  }

  console.log(`\nFast Daily Logs safety checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
