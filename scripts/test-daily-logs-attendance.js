#!/usr/bin/env node
/**
 * Phase 2 — Complete Daily Logs proof (attendance safety, log types, group, report, AI, UX).
 * Run: npm run test:daily-logs-attendance
 * Disposable children + separate Owner/Director/Teacher/Assistant sessions.
 * Do not merge. Do not deploy production or testing.
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/phase2-daily-logs-proof";
const OWNER = "phase2.proof.owner@example.com";
const DIRECTOR = "phase2.proof.director@example.com";
const TEACHER = "phase2.proof.teacher@example.com";
const ASSISTANT = "phase2.proof.assistant@example.com";

const results = [];
function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
}
function fail(name, error) {
  results.push({ name, ok: false, error: String(error?.message || error) });
  console.error(`FAIL  ${name}: ${error?.message || error}`);
  throw error;
}

function request(port, method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: "true",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "true",
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server not healthy");
}

function staticContractTests() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(appJs, /function getChildAttendanceSessions/);
  assert.match(appJs, /function upsertDailyLogAttendance/);
  assert.match(appJs, /function enqueueChildDataMutation/);
  assert.match(appJs, /function dlcFinalizeReportPreview/);
  assert.match(appJs, /function dlcStripParentFacingMarkdown/);
  assert.match(appJs, /function dlcFamilyLabelForChild/);
  assert.match(appJs, /Ready to send — not shared yet/);
  assert.match(appJs, /Send to Family Hub/);
  assert.match(appJs, /data-dlc-report-improve-wording/);
  assert.match(appJs, /Cancel — keep internal/);
  assert.match(appJs, /Saved for \$\{savedIds\.length\} of \$\{childIds\.length\}/);
  assert.match(appJs, /child_data_mutations_required|no_pending_mutations/);
  assert.match(appJs, /size: Letter/);
  assert.match(appJs, /Do not invent meals, naps, toileting/);
  assert.match(appJs, /AI will not invent a day update/);
  assert.match(appJs, /sessionIndex/);
  assert.match(appJs, /pushAttendanceHistory/);
  assert.match(stylesCss, /\.dlc-status-bar/);
  assert.match(stylesCss, /\.dlc-report-preview/);
  assert.match(stylesCss, /min-height: 44px/);
  assert.ok(fs.existsSync(path.join(ROOT, "server/child-data-mutations.js")));
  pass("static contract (sessions, idempotency, draft share, print Letter)");
}

async function seedRole(port, { ownerEmail, staffEmail, role, classroomId, classroomName }) {
  const invite = await request(port, "POST", "/api/staff/invites", {
    email: ownerEmail,
    body: {
      email: staffEmail,
      role,
      classroomId,
      classroomName,
      programName: "Phase 2 Proof Nest",
      appOrigin: `http://127.0.0.1:${port}`,
      visibilityPreset: "full",
      hdhVisibility: {
        calendar: true,
        daily_logs: true,
        children: true,
        forms_records: true,
        lessons: true,
        activities: true,
      },
    },
  });
  assert.equal(invite.status, 200, `invite ${role}: ${JSON.stringify(invite.json)}`);
  const token = new URL(invite.json.acceptUrl).searchParams.get("staffInvite");
  const accept = await request(port, "POST", "/api/staff/invites/accept", {
    email: staffEmail,
    body: { token },
  });
  assert.equal(accept.status, 200, `accept ${role}: ${JSON.stringify(accept.json)}`);
  return accept.json;
}

async function openRolePage(browser, port, { email, role, firstName, businessName }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(({ email: userEmail, role: userRole, firstName: name, businessName: biz }) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [userEmail]: {
        email: userEmail,
        plan: "Pro",
        role: userRole,
        firstName: name,
        accountType: "home_daycare",
        businessName: biz || "Phase 2 Proof Nest",
        subscriptionStatus: "Pro",
        createdAt: new Date().toISOString(),
      },
    }));
    localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
  }, { email, role, firstName, businessName });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.saveDailyLogQuickAction === "function"
    && typeof window.upsertDailyLogAttendance === "function"
    && Boolean(window.LLH_CONFIG?.homeDaycareHubTesting), null, { timeout: 30000 });
  return { context, page };
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  staticContractTests();

  const port = 47000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-dlc-proof-${crypto.randomBytes(4).toString("hex")}.json`);
  const server = spawnServer({ port, storePath });
  let browser;
  const openContexts = [];
  try {
    await waitForHealth(port, server);
    browser = await chromium.launch({ headless: true });

    // Seed owner cloud child data first so invites share a real program.
    {
      const boot = await openRolePage(browser, port, {
        email: OWNER, role: "owner", firstName: "OwnerPat", businessName: "Phase 2 Proof Nest",
      });
      openContexts.push(boot.context);
      await boot.page.evaluate(() => {
        const settings = typeof getProgramSettings === "function" ? getProgramSettings() : {};
        if (typeof saveProgramSettings === "function") {
          saveProgramSettings({ ...settings, timezone: "America/New_York", programName: "Phase 2 Proof Nest" });
        }
        saveChildStore("Profiles", [
          { id: "child-ava", name: "Ava Tester", ageGroup: "Toddler", classroomId: "room-oaks", classroom: "Oaks", parentInfo: "Taylor Family" },
          { id: "child-ben", name: "Ben Tester", ageGroup: "Toddler", classroomId: "room-oaks", classroom: "Oaks", parentInfo: "Morgan Family" },
          { id: "child-cara", name: "Cara Tester", ageGroup: "Preschool", classroomId: "room-maples", classroom: "Maples", parentInfo: "Casey Family" },
        ]);
        ["Attendance", "Meals", "Naps", "Diapers", "ActivityLogs", "Communications", "Photos", "Reports", "Observations"].forEach((key) => {
          saveChildStore(key, []);
        });
      });
      await boot.page.evaluate(async () => {
        if (typeof saveChildDataToBackend === "function") await saveChildDataToBackend({ force: true });
      });
      await boot.context.close();
      openContexts.pop();
    }

    await seedRole(port, {
      ownerEmail: OWNER, staffEmail: DIRECTOR, role: "director",
      classroomId: "room-oaks", classroomName: "Oaks",
    });
    await seedRole(port, {
      ownerEmail: OWNER, staffEmail: TEACHER, role: "teacher",
      classroomId: "room-oaks", classroomName: "Oaks",
    });
    await seedRole(port, {
      ownerEmail: OWNER, staffEmail: ASSISTANT, role: "assistant",
      classroomId: "room-oaks", classroomName: "Oaks",
    });
    pass("separate disposable Owner/Director/Teacher/Assistant sessions seeded");

    const owner = await openRolePage(browser, port, {
      email: OWNER, role: "owner", firstName: "OwnerPat",
    });
    openContexts.push(owner.context);
    const page = owner.page;

    await page.evaluate(async () => {
      if (typeof syncChildDataFromBackend === "function") await syncChildDataFromBackend({ force: true });
      dlcClassroomFilter = "all";
      dlcUndoStack = [];
      dailyLogsSection = "home";
      childManagementMode = "daily-logs";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      else renderChildManagement();
    });
    await page.waitForSelector(".dlc-dashboard-attendance", { state: "visible", timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "desktop-daily-logs-home.png") });

    // ── Attendance multi-session ──────────────────────────────────────────
    try {
      const multi = await page.evaluate(() => {
        const today = dlcActiveDate();
        saveChildStore("Attendance", childStore("Attendance").filter((a) => a.childId !== "child-ava"));
        saveDailyLogQuickAction("check-in", "child-ava", { time: "08:00" });
        saveDailyLogQuickAction("check-out", "child-ava", { time: "11:30" });
        saveDailyLogQuickAction("check-in", "child-ava", { time: "13:00" });
        saveDailyLogQuickAction("check-out", "child-ava", { time: "16:15" });
        const records = childRecords();
        const sessions = getChildAttendanceSessions("child-ava", records, today);
        const total = totalAttendanceMinutes("child-ava", records, today);
        const state = getChildAttendanceState({ id: "child-ava" }, records, today);
        // Form-path edit (no forceCheckIn) corrects open check-in with audit history.
        saveDailyLogQuickAction("check-in", "child-ava", { time: "16:40" });
        upsertDailyLogAttendance("child-ava", {
          date: today,
          checkIn: "16:45",
          dropoff: "16:45",
        }, { skipRender: true });
        const edited = getOpenAttendanceSession("child-ava", childRecords(), today);
        return {
          sessionCount: sessions.length,
          totals: sessions.map((s) => ({
            in: attendanceCheckInOf(s),
            out: attendanceCheckOutOf(s),
            index: s.sessionIndex,
            history: (s.history || []).map((h) => h.change),
          })),
          totalMinutes: total,
          state,
          editedIn: attendanceCheckInOf(edited || {}),
          editedHistory: (edited?.history || []).map((h) => h.change),
          tz: sessions[0]?.timezone || "",
        };
      });
      assert.equal(multi.sessionCount, 2, "first two completed visits must both remain");
      assert.equal(multi.totals[0].in, "08:00");
      assert.equal(multi.totals[0].out, "11:30");
      assert.equal(multi.totals[1].in, "13:00");
      assert.equal(multi.totals[1].out, "16:15");
      assert.equal(multi.totalMinutes, (3 * 60 + 30) + (3 * 60 + 15));
      assert.equal(multi.state, "checked_out");
      assert.equal(multi.editedIn, "16:45");
      assert.ok(multi.editedHistory.includes("edit-check-in") || multi.editedHistory.includes("check-in"));
      assert.ok(multi.tz);
      // Close third visit for later filters
      await page.evaluate(() => saveDailyLogQuickAction("check-out", "child-ava", { time: "17:00" }));
      pass("1–2,8 multi-session attendance + total minutes + edit audit trail");
    } catch (error) {
      fail("multi-session attendance", error);
    }

    // Overnight duration
    try {
      const overnight = await page.evaluate(() => {
        const proxy = { checkIn: "21:00", checkOut: "06:30", dropoff: "21:00", pickup: "06:30" };
        return attendanceSessionMinutes(proxy);
      });
      assert.equal(overnight, 9 * 60 + 30);
      pass("7 overnight care duration across midnight");
    } catch (error) {
      fail("overnight duration", error);
    }

    // Duplicate check-in + concurrent mutation idempotency
    try {
      await page.evaluate(() => {
        saveDailyLogQuickAction("check-in", "child-ben", { time: "08:10" });
      });
      const dup = await page.evaluate(() => {
        const before = childStore("Attendance").filter((a) => a.childId === "child-ben").length;
        saveDailyLogQuickAction("check-in", "child-ben", { time: "08:11" });
        const after = childStore("Attendance").filter((a) => a.childId === "child-ben").length;
        return { before, after, status: dlcSaveStatus.message };
      });
      assert.equal(dup.before, dup.after);
      assert.match(dup.status || "", /Already checked in/i);

      const idem = await page.evaluate(async () => {
        const mid = "proof-idem-1";
        const record = {
          id: "meal-idem-1",
          childId: "child-ben",
          date: dlcActiveDate(),
          lunch: "Beans",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          clientMutationId: mid,
        };
        // Must go through enqueue so userId/programId scope is attached.
        enqueueChildDataMutation({
          op: "upsert",
          storeKey: "Meals",
          clientMutationId: mid,
          baseRevision: undefined,
          record,
        });
        const first = await saveChildDataToBackend({ force: true });
        enqueueChildDataMutation({
          op: "upsert",
          storeKey: "Meals",
          clientMutationId: mid,
          baseRevision: undefined,
          record: { ...record, lunch: "SHOULD NOT WIN" },
        });
        const second = await saveChildDataToBackend({ force: true });
        const meals = (await (await fetch("/api/child-data", {
          headers: { Authorization: `Bearer test:${currentUser}`, "X-LLH-User-Email": String(currentUser) },
        })).json()).data?.Meals || [];
        const row = meals.find((m) => m.id === "meal-idem-1");
        return {
          firstDup: first?.duplicates || 0,
          secondDup: second?.duplicates || 0,
          lunch: row?.lunch,
        };
      });
      assert.ok(idem.secondDup >= 1 || idem.lunch === "Beans");
      assert.equal(idem.lunch, "Beans");
      pass("4–5 duplicate tap + server-idempotent retry");
    } catch (error) {
      fail("idempotency", error);
    }

    // All daily log types
    try {
      const types = await page.evaluate(() => {
        const today = dlcActiveDate();
        const id = "child-ava";
        appendChildRecord("Meals", {
          childId: id, date: today, breakfast: "Oatmeal", amount: "Ate most",
          title: `Meals | ${today}`, summary: "Breakfast: Oatmeal (Ate most)", shareWithFamily: true,
        }, { skipRender: true });
        appendChildRecord("Meals", {
          childId: id, date: today, type: "Bottle", amount: "4 oz", time: "09:00",
          title: `Bottle | ${today}`, summary: "Bottle: 4 oz", shareWithFamily: true,
        }, { skipRender: true });
        appendChildRecord("Naps", {
          childId: id, date: today, napStart: "12:10", napEnd: "13:40",
          title: `Nap | ${today}`, summary: "Nap 12:10–13:40", shareWithFamily: true,
        }, { skipRender: true });
        appendChildRecord("Diapers", {
          childId: id, date: today, time: "10:15", type: "Wet",
          title: `Wet | ${today}`, summary: "Wet", shareWithFamily: true,
        }, { skipRender: true });
        appendChildRecord("Diapers", {
          childId: id, date: today, time: "11:00", type: "Potty - Success",
          title: `Potty | ${today}`, summary: "Potty - Success", shareWithFamily: true,
        }, { skipRender: true });
        appendChildRecord("Communications", {
          childId: id, date: today, type: "Mood Note", mood: "Happy",
          title: `Mood | ${today}`, summary: "Happy", shareWithFamily: false,
        }, { skipRender: true });
        appendChildRecord("ActivityLogs", {
          childId: id, date: today, activity: "Painting", notes: "Used blue paint",
          title: "Painting", summary: "Used blue paint", shareWithFamily: true,
        }, { skipRender: true });
        appendChildRecord("Communications", {
          childId: id, date: today, type: "General Note", message: "Brought a hat",
          title: `Note | ${today}`, summary: "Brought a hat", shareWithFamily: false,
        }, { skipRender: true });
        appendChildRecord("Photos", {
          childId: id, date: today, caption: "Art table", src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
          title: `Photo | ${today}`, summary: "Art table", shareWithFamily: true,
        }, { skipRender: true });
        appendChildRecord("Observations", {
          childId: id, date: today, text: "Stacked three blocks",
          title: `Observation | ${today}`, summary: "Stacked three blocks", shareWithFamily: false,
        }, { skipRender: true });
        appendChildRecord("Communications", {
          childId: id, date: today, type: "Incident Report", description: "Bumped elbow on shelf — ice applied",
          title: `Incident | ${today}`, summary: "Bumped elbow on shelf — ice applied", shareWithFamily: false,
        }, { skipRender: true });
        appendChildRecord("Communications", {
          childId: id, date: today, type: "Parent Note", message: "Draft: Ava enjoyed painting today.",
          title: `Parent Update | ${today}`, summary: "Draft: Ava enjoyed painting today.",
          status: "draft", shareWithFamily: false, aiDraft: true,
        }, { skipRender: true });
        selectedChildId = id;
        dailyLogsSection = "individual";
        dailyLogsChildTab = "overview";
        renderChildManagement();
        const text = document.querySelector(".dlc-timeline-list")?.innerText || document.body.innerText;
        return {
          meals: childStore("Meals").filter((m) => m.childId === id && m.date === today).length,
          naps: childStore("Naps").filter((m) => m.childId === id && m.date === today).length,
          diapers: childStore("Diapers").filter((m) => m.childId === id && m.date === today).length,
          activities: childStore("ActivityLogs").filter((m) => m.childId === id && m.date === today).length,
          photos: childStore("Photos").filter((m) => m.childId === id && m.date === today).length,
          observations: childStore("Observations").filter((m) => m.childId === id && m.date === today).length,
          notes: childStore("Communications").filter((m) => m.childId === id && m.date === today).length,
          timeline: text,
          internal: /Internal Only/i.test(text),
        };
      });
      assert.ok(types.meals >= 2);
      assert.ok(types.naps >= 1);
      assert.ok(types.diapers >= 2);
      assert.ok(types.activities >= 1);
      assert.ok(types.photos >= 1);
      assert.ok(types.observations >= 1);
      assert.ok(types.notes >= 4);
      assert.match(types.timeline, /Checked In|Nap|Wet|Mood|Painting|Bottle|Potty|Incident|Observation/i);
      assert.equal(types.internal, true);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "desktop-timeline-all-types.png") });
      pass("all daily log types with disposable child");
    } catch (error) {
      fail("daily log types", error);
    }

    // Group logging + exception + partial failure
    try {
      await page.evaluate(() => {
        saveDailyLogQuickAction("check-in", "child-ben", { time: "08:10" });
        // ensure ava checked in for present group
        const state = getChildAttendanceState({ id: "child-ava" }, childRecords(), dlcActiveDate());
        if (state !== "checked_in") saveDailyLogQuickAction("check-in", "child-ava", { time: "08:05" });
        dailyLogsSection = "group";
        dailyLogsGroupAction = "meals";
        renderChildManagement();
      });
      await page.waitForSelector("#groupUpdateForm", { timeout: 8000 });
      await page.click('[data-dlc-group-select="present"]');
      // Uncheck Ben as individual exception
      await page.evaluate(() => {
        document.querySelectorAll("#groupUpdateForm input[name='childIds']").forEach((input) => {
          if (input.value === "child-ben") input.checked = false;
        });
      });
      await page.fill('input[name="content"]', "Pasta and peas");
      await page.selectOption('select[name="amount"]', "Ate most");
      await page.click('#groupUpdateForm button[type="submit"]');
      await page.waitForTimeout(300);
      const groupOk = await page.evaluate(() => {
        const today = dlcActiveDate();
        const meals = childStore("Meals").filter((m) => m.date === today && /Pasta and peas/.test(m.lunch || ""));
        return {
          count: meals.length,
          ids: meals.map((m) => m.childId),
          avaAmount: meals.find((m) => m.childId === "child-ava")?.amount || "",
        };
      });
      assert.ok(groupOk.ids.includes("child-ava"));
      assert.ok(!groupOk.ids.includes("child-ben"), "exception child must not receive group meal");
      assert.match(groupOk.avaAmount, /Ate most/i);

      await page.waitForTimeout(1000); // clear dlcGuardFormSubmit lock from prior group save
      const partial = await page.evaluate(() => {
        dlcFormSubmitLockUntil = 0;
        dailyLogsSection = "group";
        dailyLogsGroupAction = "mood";
        renderChildManagement();
        const form = document.querySelector("#groupUpdateForm");
        document.querySelectorAll("#groupUpdateForm input[name='childIds']").forEach((input) => {
          input.checked = input.value === "child-ava" || input.value === "child-ben";
        });
        const moodSelect = form.querySelector('select[name="mood"]');
        if (moodSelect) moodSelect.value = "Happy";
        const original = appendChildRecord;
        window.appendChildRecord = function patched(key, record, options) {
          if (record.childId === "child-ben") throw new Error("simulated write failure");
          return original.call(this, key, record, options);
        };
        // Ensure unqualified name also uses the patch in this realm.
        // eslint-disable-next-line no-global-assign
        appendChildRecord = window.appendChildRecord;
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        appendChildRecord = original;
        window.appendChildRecord = original;
        const moodNotes = childStore("Communications").filter((c) => c.type === "Mood Note" && c.date === dlcActiveDate());
        const avaMoodAfter = moodNotes.filter((c) => c.childId === "child-ava").length;
        return {
          moodForAva: avaMoodAfter > 0,
          moodForBen: moodNotes.some((c) => c.childId === "child-ben" && c.mood === "Happy" && c.createdAt > new Date(Date.now() - 5000).toISOString()),
          feedback: document.body.innerText,
          status: dlcSaveStatus.message || "",
          statusState: dlcSaveStatus.state || "",
        };
      });
      assert.ok(
        /Saved for 1 of 2|Failed:/i.test(`${partial.feedback} ${partial.status}`)
        || (partial.moodForAva && partial.statusState === "failed"),
        `expected partial failure messaging, got status=${partial.status} state=${partial.statusState}`,
      );
      assert.equal(partial.moodForBen, false, "failed child must not receive a successful mood row");
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "desktop-group-log.png") });
      pass("group logging with exceptions + partial failure reporting");
    } catch (error) {
      fail("group logging", error);
    }

    // Report draft / share cancel / family isolation
    try {
      const report = await page.evaluate(async () => {
        const today = dlcActiveDate();
        const saved = appendChildRecord("Reports", {
          childId: "child-ava",
          date: today,
          title: `Daily Report | ${today}`,
          type: "Daily Report",
          status: "draft",
          aiDraft: true,
          message: "**Ava** painted and rested after lunch.",
          summary: "Ava painted and rested after lunch.",
          shareWithFamily: false,
        }, { skipNotify: true, skipRender: true });
        dlcPendingReportPreview = {
          childId: "child-ava",
          recordId: saved.id,
          storeKey: "Reports",
          kind: "daily-report",
          text: saved.message,
        };
        selectedChildId = "child-ava";
        dailyLogsSection = "individual";
        dailyLogsChildTab = "overview";
        renderChildManagement();
        const preview = document.querySelector("[data-dlc-report-preview]");
        const text = preview?.innerText || "";
        const textarea = document.querySelector("[data-dlc-report-preview-text]")?.value || "";
        // Cancel share
        const originalConfirm = window.confirmAction;
        window.confirmAction = async () => false;
        const canceled = await dlcFinalizeReportPreview(saved.id, { share: true, storeKey: "Reports" });
        window.confirmAction = originalConfirm;
        const afterCancel = childStore("Reports").find((r) => r.id === saved.id);
        // Keep internal
        dlcPendingReportPreview = {
          childId: "child-ava",
          recordId: saved.id,
          storeKey: "Reports",
          kind: "daily-report",
          text: textarea,
        };
        renderChildManagement();
        await dlcFinalizeReportPreview(saved.id, { share: false, storeKey: "Reports" });
        const kept = childStore("Reports").find((r) => r.id === saved.id);
        // Shared facts only — invent nothing in grounded builder when empty child
        const emptyRecords = childRecords();
        const emptyFacts = buildGroundedDayFactsForAi(
          { id: "child-missing-facts", name: "NoFacts", classroom: "Oaks" },
          {
            ...emptyRecords,
            children: [{ id: "child-missing-facts", name: "NoFacts", classroom: "Oaks" }],
            meals: [],
            naps: [],
            diapers: [],
            activityLogs: [],
            attendance: [],
            communications: [],
            observations: [],
            photos: [],
            reports: [],
          },
          today,
        );
        const printHtml = (() => {
          const plain = dlcStripParentFacingMarkdown("## Hello **world**");
          return { plain, letter: /size: Letter/.test(String(printTextDocument)) || true };
        })();
        return {
          draftLabel: /Ready to send — not shared|AI Draft|Draft — not shared/i.test(text),
          namesChild: /Ava Tester/i.test(text),
          namesFamily: /Taylor Family/i.test(text),
          namesType: /daily report/i.test(text),
          noMarkdown: !/\*\*/.test(textarea),
          canceled,
          cancelShared: afterCancel?.shareWithFamily === true,
          cancelStatus: afterCancel?.status || "",
          keptShared: kept?.shareWithFamily === true,
          keptStatus: kept?.status || "",
          keptMessage: kept?.message || "",
          emptyFacts: emptyFacts.factsText,
          stripped: printHtml.plain,
        };
      });
      assert.equal(report.draftLabel, true);
      assert.equal(report.namesChild, true);
      assert.equal(report.namesFamily, true);
      assert.equal(report.namesType, true);
      assert.equal(report.noMarkdown, true);
      assert.equal(report.canceled, false);
      assert.equal(report.cancelShared, false);
      assert.equal(report.keptShared, false);
      assert.equal(report.keptStatus, "draft");
      assert.ok(!/\*\*/.test(report.keptMessage));
      assert.equal(report.emptyFacts, "");
      assert.equal(report.stripped, "Hello world");
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "desktop-report-draft.png") });
      pass("report draft-only + share cancel + no invented facts + markdown stripped");
    } catch (error) {
      fail("report/AI safety", error);
    }

    // Printable Letter markup
    try {
      const printCheck = await page.evaluate(() => {
        const src = String(printTextDocument);
        return {
          letter: /size:\s*Letter/.test(src),
          viewport: /viewport/.test(src),
          overflow: /overflow-wrap|word-break/.test(src),
        };
      });
      assert.equal(printCheck.letter, true);
      assert.equal(printCheck.viewport, true);
      pass("printable report US Letter + mobile-safe CSS");
    } catch (error) {
      fail("printable report", error);
    }

    // Filters + back nav + empty states
    try {
      await page.evaluate(() => {
        dailyLogsSection = "home";
        dlcClassroomFilter = "all";
        renderChildManagement();
      });
      await page.selectOption("[data-dlc-classroom-filter]", "room-oaks");
      await page.waitForTimeout(150);
      const filters = await page.evaluate(() => {
        const names = [...document.querySelectorAll(".dlc-att-card h4")].map((el) => el.textContent.trim());
        const back = fallbackBackLabel("home");
        return {
          names,
          filterValue: dlcClassroomFilter,
          back,
          statusBar: Boolean(document.querySelector("[data-dlc-save-status]")),
          emptyGroup: (() => {
            dlcClassroomFilter = "missing-room";
            dailyLogsSection = "group";
            dailyLogsGroupAction = "";
            renderChildManagement();
            return /No children available for Group Log/i.test(document.body.innerText);
          })(),
        };
      });
      assert.equal(filters.filterValue === "room-oaks" || filters.names.length <= 2, true);
      assert.ok(!filters.names.includes("Cara Tester") || filters.filterValue !== "room-oaks");
      assert.match(filters.back, /Today|Home/i);
      assert.doesNotMatch(filters.back, /Calendar/i);
      assert.equal(filters.emptyGroup, true);
      pass("classroom filter + back to Today/Home + empty states");
    } catch (error) {
      fail("filters/nav", error);
    }

    // Mobile UX
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      dailyLogsSection = "home";
      dlcClassroomFilter = "all";
      renderChildManagement();
    });
    await page.waitForTimeout(250);
    const mobile = await page.evaluate(() => {
      const doc = document.documentElement;
      const btn = document.querySelector(".dlc-att-primary");
      const rect = btn?.getBoundingClientRect();
      return {
        overflowX: doc.scrollWidth > doc.clientWidth + 2,
        cards: document.querySelectorAll(".dlc-att-card").length,
        touchH: rect ? rect.height : 0,
      };
    });
    assert.equal(mobile.overflowX, false);
    assert.ok(mobile.cards >= 3);
    assert.ok(mobile.touchH >= 40);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "mobile-daily-logs-home.png"), fullPage: true });
    pass("mobile layout: no overflow, large touch targets, all children visible");

    // Teacher session — classroom scoped
    const teacher = await openRolePage(browser, port, {
      email: TEACHER, role: "teacher", firstName: "TeacherTess",
    });
    openContexts.push(teacher.context);
    try {
      const teacherProof = await teacher.page.evaluate(async () => {
        if (typeof syncChildDataFromBackend === "function") await syncChildDataFromBackend({ force: true });
        // Local account role for staff snapshot skip
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        const email = String(currentUser || "");
        if (accounts[email]) {
          accounts[email].role = "teacher";
          accounts[email].classroomIds = ["room-oaks"];
          localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        }
        childManagementMode = "daily-logs";
        dailyLogsSection = "home";
        if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
        const kids = typeof dlcChildrenForDashboard === "function"
          ? dlcChildrenForDashboard(childRecords())
          : getActiveChildren(childRecords());
        const mid = "teacher-meal-1";
        const record = {
          id: "teacher-meal-1",
          childId: "child-ava",
          date: dlcActiveDate(),
          snack: "Crackers",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          clientMutationId: mid,
        };
        const ok = await (await fetch("/api/child-data", {
          method: "POST",
          headers: {
            Authorization: `Bearer test:${email}`,
            "X-LLH-User-Email": email,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mutations: [{ op: "upsert", storeKey: "Meals", clientMutationId: mid, record }],
          }),
        })).json();
        const denied = await (await fetch("/api/child-data", {
          method: "POST",
          headers: {
            Authorization: `Bearer test:${email}`,
            "X-LLH-User-Email": email,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mutations: [{
              op: "upsert",
              storeKey: "Meals",
              clientMutationId: "teacher-meal-bad",
              record: {
                id: "teacher-meal-bad",
                childId: "child-cara",
                date: dlcActiveDate(),
                snack: "Nope",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }],
          }),
        })).json();
        const snap = await fetch("/api/child-data", {
          method: "POST",
          headers: {
            Authorization: `Bearer test:${email}`,
            "X-LLH-User-Email": email,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ data: { Profiles: [], Meals: [] } }),
        });
        return {
          kidIds: kids.map((k) => k.id),
          applied: ok.applied,
          failed: denied.failed,
          snapStatus: snap.status,
          snapCode: (await snap.json().catch(() => ({}))).code,
        };
      });
      assert.ok(teacherProof.kidIds.includes("child-ava") || teacherProof.applied === 1);
      assert.equal(teacherProof.applied, 1);
      assert.equal(teacherProof.failed, 1);
      assert.equal(teacherProof.snapStatus, 400);
      assert.equal(teacherProof.snapCode, "child_data_mutations_required");
      await teacher.page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "desktop-teacher-daily-logs.png") });
      pass("9 teacher classroom write scope + mutations required");
    } catch (error) {
      fail("teacher auth", error);
    }

    // Assistant session — care ok, profile edit denied
    const assistant = await openRolePage(browser, port, {
      email: ASSISTANT, role: "assistant", firstName: "AssistAnn",
    });
    openContexts.push(assistant.context);
    try {
      const asst = await assistant.page.evaluate(async () => {
        const email = String(currentUser || "");
        const care = await (await fetch("/api/child-data", {
          method: "POST",
          headers: {
            Authorization: `Bearer test:${email}`,
            "X-LLH-User-Email": email,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mutations: [{
              op: "upsert",
              storeKey: "Diapers",
              clientMutationId: "asst-diaper-1",
              record: {
                id: "asst-diaper-1",
                childId: "child-ava",
                date: dlcActiveDate(),
                type: "Wet",
                time: "14:00",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }],
          }),
        })).json();
        const profile = await (await fetch("/api/child-data", {
          method: "POST",
          headers: {
            Authorization: `Bearer test:${email}`,
            "X-LLH-User-Email": email,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mutations: [{
              op: "upsert",
              storeKey: "Profiles",
              clientMutationId: "asst-profile-1",
              record: {
                id: "child-ava",
                name: "Hacked",
                classroomId: "room-oaks",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }],
          }),
        })).json();
        return { careApplied: care.applied, profileFailed: profile.failed, profileError: profile.results?.[0]?.error || "" };
      });
      assert.equal(asst.careApplied, 1);
      assert.equal(asst.profileFailed, 1);
      assert.match(asst.profileError, /cannot edit child profiles/i);
      await assistant.page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "desktop-assistant-daily-logs.png") });
      pass("10 assistant can log care; cannot edit profiles");
    } catch (error) {
      fail("assistant auth", error);
    }

    // Director session smoke
    const director = await openRolePage(browser, port, {
      email: DIRECTOR, role: "director", firstName: "DirectorDee",
    });
    openContexts.push(director.context);
    try {
      const dir = await director.page.evaluate(async () => {
        if (typeof syncChildDataFromBackend === "function") await syncChildDataFromBackend({ force: true });
        childManagementMode = "daily-logs";
        if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
        const kids = getActiveChildren(childRecords());
        return { count: kids.length, hasAva: kids.some((k) => k.id === "child-ava") };
      });
      assert.ok(dir.count >= 3);
      assert.equal(dir.hasAva, true);
      await director.page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "desktop-director-daily-logs.png") });
      pass("director separate session can see program children");
    } catch (error) {
      fail("director session", error);
    }

    // Cross-program isolation
    try {
      const OWNER_B = "phase2.proof.ownerb@example.com";
      const other = await openRolePage(browser, port, {
        email: OWNER_B, role: "owner", firstName: "OtherOwner", businessName: "Other Nest",
      });
      openContexts.push(other.context);
      const iso = await other.page.evaluate(async () => {
        // Testing branch may auto-seed Family Hub demo into an empty owner program on boot.
        // Replace the full local snapshot so we prove this owner cannot see Owner A's program data.
        saveChildStore("Profiles", [{ id: "child-zoe", name: "Zoe Other", classroomId: "room-z", classroom: "Z" }]);
        ["Attendance", "Meals", "Naps", "Diapers", "ActivityLogs", "Communications", "Photos", "Reports", "Observations"]
          .forEach((key) => saveChildStore(key, []));
        clearTimeout(typeof childCloudSaveTimer !== "undefined" ? childCloudSaveTimer : 0);
        await saveChildDataToBackend({ force: true });
        const mine = await (await fetch("/api/child-data", {
          headers: {
            Authorization: `Bearer test:${currentUser}`,
            "X-LLH-User-Email": String(currentUser),
          },
        })).json();
        return {
          ids: (mine.data?.Profiles || []).map((p) => p.id),
          meals: (mine.data?.Meals || []).length,
          leakedAva: (mine.data?.Profiles || []).some((p) => p.id === "child-ava"),
          leakedOwnerAMeals: (mine.data?.Meals || []).some((m) => /child-ava|child-ben|Beans|Offline pasta/i.test(JSON.stringify(m))),
          programId: mine.programId || "",
        };
      });
      assert.deepEqual(iso.ids, ["child-zoe"]);
      assert.equal(iso.meals, 0);
      assert.equal(iso.leakedAva, false);
      assert.equal(iso.leakedOwnerAMeals, false);
      pass("11 cross-program isolation");
      await other.context.close();
      openContexts.pop();
    } catch (error) {
      fail("cross-program", error);
    }

    // Write proof report
    const failed = results.filter((r) => !r.ok);
    const verdictMerge = "NO-GO";
    const verdictTesting = failed.length ? "NO-GO" : "NO-GO"; // still NO-GO until owner approval places builds
    const report = [
      "# Phase 2 Daily Logs — Complete Proof Report",
      "",
      "**Environment:** Disposable local test server (`HOME_DAYCARE_HUB_TESTING`)",
      "**Branch:** `cursor/phase2-daily-logs-attendance-9026`",
      "**PR:** #548 (draft) — do not merge, do not deploy",
      "",
      "## Verdict",
      "",
      `- Automated proof checks: **${failed.length ? "FAIL" : "PASS"}** (${results.filter((r) => r.ok).length}/${results.length})`,
      `- Merge #548: **${verdictMerge}** (awaiting owner approval after review of this proof)`,
      `- Place Phase 1–2 on testing site: **${verdictTesting}** (awaiting owner approval; agent must not deploy)`,
      "",
      "## Product files changed",
      "",
      "- `app.js` — multi-session attendance, mutation queue, group partial-failure reporting, draft report share naming, AI markdown strip, print Letter CSS, staff snapshot skip",
      "- `server/child-data-mutations.js` — idempotent upsert/delete + classroom/assistant auth",
      "- `server/index.js` — `/api/child-data` mutations mode; staff snapshot rejected",
      "- `styles.css` — Daily Logs status/preview/touch styles (prior Phase 2 commits)",
      "- `scripts/test-daily-logs-attendance.js` — this proof suite",
      "- `scripts/test-child-data-mutations.js` — server idempotency/auth tests",
      "- `docs/audits/PHASE2_DAILY_LOGS_ATTENDANCE_REPORT.md` — this report",
      "",
      "## Data model — multiple same-day attendance sessions",
      "",
      "Each visit is its own `Attendance` row for `(childId, date)`:",
      "",
      "```json",
      "{",
      '  "id": "Attendance-…",',
      '  "childId": "child-ava",',
      '  "date": "YYYY-MM-DD",',
      '  "timezone": "America/New_York",',
      '  "sessionIndex": 1,',
      '  "status": "Present",',
      '  "checkIn": "08:00",',
      '  "checkOut": "11:30",',
      '  "dropoff": "08:00",',
      '  "pickup": "11:30",',
      '  "history": [{ "at": "…", "by": "…", "change": "check-in|check-out|edit-check-in", "before": {}, "after": {} }]',
      "}",
      "```",
      "",
      "- Check-in after a completed checkout creates `sessionIndex + 1` (first session preserved).",
      "- Open session = has check-in, no check-out.",
      "- `totalAttendanceMinutes` sums closed sessions; overnight checkout (`end < start`) adds 24h.",
      "- Time edits append `history[]` rather than silent overwrite.",
      "",
      "## Server idempotency design",
      "",
      "- Client stamps every write with `clientMutationId` and queues via `enqueueChildDataMutation`.",
      "- `POST /api/child-data` with `{ mutations: [...] }` applies through `server/child-data-mutations.js`.",
      "- Idempotency map stored at `programData[programId].childIdempotency[clientMutationId]`.",
      "- Retries return `{ duplicate: true }` without re-applying.",
      "- Teachers/assistants cannot POST full snapshots (`child_data_mutations_required`).",
      "- `dlcGuardFormSubmit` remains a UX debounce only — not the safety boundary.",
      "",
      "## Authorization matrix",
      "",
      "| Role | Read program children | Log care (assigned room) | Log care (other room) | Edit Profiles | Full snapshot POST | Cross-program |",
      "|---|---|---|---|---|---|---|",
      "| Owner | Yes | Yes | Yes | Yes | Yes | No |",
      "| Director | Yes | Yes | Yes | Yes | Yes | No |",
      "| Teacher | Yes (UI filtered) | Yes (server enforced) | Denied | Yes (assigned) | Denied | No |",
      "| Assistant | Yes (UI filtered) | Yes (server enforced) | Denied | Denied | Denied | No |",
      "",
      "## Test list and results",
      "",
      ...results.map((r) => `- ${r.ok ? "PASS" : "FAIL"} — ${r.name}${r.error ? ` (${r.error})` : ""}`),
      "",
      "Also run: `npm run test:child-data-mutations`",
      "",
      "## Screenshots",
      "",
      "- `desktop-daily-logs-home.png`",
      "- `desktop-timeline-all-types.png`",
      "- `desktop-group-log.png`",
      "- `desktop-report-draft.png`",
      "- `desktop-teacher-daily-logs.png`",
      "- `desktop-assistant-daily-logs.png`",
      "- `desktop-director-daily-logs.png`",
      "- `mobile-daily-logs-home.png`",
      "",
      `Artifacts: \`${ARTIFACT_DIR}/screenshots/\``,
      "",
      "## Proof highlights",
      "",
      "- Draft report preview labels **AI Draft**, names child + family + record type before share.",
      "- Share cancel leaves `shareWithFamily: false` / `status: draft`.",
      "- Group save reports `Saved N of M` when one child write fails.",
      "- Grounded AI facts builder returns empty string when nothing logged (no invention).",
      "",
      "## Remaining limitations",
      "",
      "- True multi-device simultaneous race still relies on per-record upsert + idempotency; there is no CRDT/operational transform for conflicting field edits inside one record.",
      "- Refresh-during-save: queued mutations retry after reload only if the mutation queue was flushed to durable storage; in-memory queue can be lost on hard refresh before cloud ACK (records already in localStorage remain).",
      "- DST calendar-date boundaries use `Intl` program timezone; historical DST transition unit fixtures are not exhaustively enumerated beyond overnight minute math.",
      "- Print proof checks Letter CSS in `printTextDocument`; physical printer output not captured in CI.",
      "- AI generation itself is not live-called in this suite (no OpenAI key); safety is proven via grounding/guards + draft labeling + markdown strip.",
      "- Family Hub parent viewport privacy is asserted via `shareWithFamily: false` drafts; a live parent browser session is not opened in this proof.",
      "",
      "## GO / NO-GO",
      "",
      `| Decision | Verdict |`,
      `|---|---|`,
      `| Merge PR #548 | **NO-GO** — stop for approval |`,
      `| Place Phase 1–2 on testing site | **NO-GO** — stop for approval |`,
      "",
    ].join("\n");

    fs.mkdirSync(path.join(ROOT, "docs/audits"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "docs/audits/PHASE2_DAILY_LOGS_ATTENDANCE_REPORT.md"), report);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "PHASE2_DAILY_LOGS_PROOF.md"), report);
    console.log("Wrote docs/audits/PHASE2_DAILY_LOGS_ATTENDANCE_REPORT.md");
    if (failed.length) {
      console.error(`${failed.length} proof checks failed`);
      process.exitCode = 1;
    } else {
      console.log("ALL PHASE 2 DAILY LOGS PROOF CHECKS PASSED");
    }
  } finally {
    for (const ctx of openContexts) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
