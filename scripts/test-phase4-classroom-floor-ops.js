#!/usr/bin/env node
/**
 * Phase 4 — Classroom floor ops (testing only).
 * Covers: unassigned empty-state guidance, Owner/Director classroom assign API,
 * room-mode one-tap Meal/Diaper/Nap/Note (mutation queue intact), staff ACL.
 *
 * Run: npm run test:phase4-classroom-floor-ops
 * Do not merge to production. Do not deploy production.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/phase4-classroom-floor-ops";
const OWNER = "phase4.floor.owner@example.com";
const TEACHER = "phase4.floor.teacher@example.com";
const ASSISTANT = "phase4.floor.assistant@example.com";
const PROGRAM = "prog-phase4-floor";

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

async function waitForHealth(port, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server not healthy");
}

function accountSeed(email, { role = "owner", classroomIds = [] } = {}) {
  return {
    email,
    plan: "Pro",
    role,
    firstName: "Phase4",
    lastName: role,
    accountType: "center",
    businessName: "Phase4 Floor Nest",
    subscriptionStatus: "Pro",
    programId: PROGRAM,
    localActorId: `actor_${email.split("@")[0]}`,
    classroomIds,
    linkedProgramOwnerEmail: role === "owner" ? "" : OWNER,
    programAccessViaOwner: role !== "owner",
    createdAt: new Date().toISOString(),
  };
}

async function openPage(browser, port, email, account) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(({ email: user, account: acc }) => {
    localStorage.setItem("llhUser", user);
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({ [user]: acc }));
    localStorage.setItem("llhMemberSessionToken", `test:${user}`);
    localStorage.setItem("llhAuthToken", `test:${user}`);
    localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
    localStorage.removeItem("llhAdminPreviewMode");
    localStorage.removeItem("llhMultiRoleTesterView");
  }, { email, account });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => typeof enqueueChildDataMutation === "function"
      && typeof getActiveChildren === "function"
      && typeof isUnassignedLinkedClassroomStaff === "function",
    null,
    { timeout: 60000 },
  );
  return { context, page };
}

async function seedProgram(port) {
  const profiles = [
    {
      id: "child-oaks-1",
      name: "Ava Oaks",
      classroomId: "room-oaks",
      classroom: "Oaks Room",
      createdAt: new Date().toISOString(),
    },
    {
      id: "child-maples-1",
      name: "Ben Maples",
      classroomId: "room-maples",
      classroom: "Maples Room",
      createdAt: new Date().toISOString(),
    },
  ];
  await request(port, "POST", "/api/account/profile", {
    body: {
      email: OWNER,
      firstName: "Phase4",
      lastName: "Owner",
      accountType: "center",
      role: "owner",
      businessName: "Phase4 Floor Nest",
      signup: true,
    },
  });
  const schedule = await request(port, "PUT", "/api/schedule", {
    email: OWNER,
    body: {
      classrooms: [
        { id: "room-oaks", name: "Oaks Room" },
        { id: "room-maples", name: "Maples Room" },
      ],
      items: [],
      weeks: {},
    },
  });
  if (schedule.status !== 200) throw new Error(`schedule seed failed: ${JSON.stringify(schedule.json)}`);

  const seed = await request(port, "POST", "/api/child-data", {
    email: OWNER,
    body: {
      data: {
        Profiles: profiles,
        Attendance: [],
        Meals: [],
        Naps: [],
        Diapers: [],
        ActivityLogs: [],
        Communications: [],
        Observations: [],
        Photos: [],
        Reports: [],
        Documents: [],
        Goals: [],
        SupportPlans: [],
        Differentiations: [],
        MealPresets: [],
      },
    },
  });
  if (seed.status !== 200) throw new Error(`child-data seed failed: ${JSON.stringify(seed.json)}`);

  async function inviteStaff(email, role, classroomId = "", classroomName = "") {
    const invite = await request(port, "POST", "/api/staff/invites", {
      email: OWNER,
      body: {
        email,
        role,
        classroomId,
        classroomName,
        programName: "Phase4 Floor Nest",
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    if (invite.status !== 200) throw new Error(`invite ${email} failed: ${JSON.stringify(invite.json)}`);
    const token = new URL(invite.json.acceptUrl).searchParams.get("staffInvite");
    const accept = await request(port, "POST", "/api/staff/invites/accept", {
      email,
      body: { token },
    });
    if (accept.status !== 200) throw new Error(`accept ${email} failed: ${JSON.stringify(accept.json)}`);
    return accept.json;
  }

  // Teacher starts unassigned (Phase 4 empty-state + assign flow).
  await inviteStaff(TEACHER, "teacher", "", "");
  await inviteStaff(ASSISTANT, "assistant", "room-oaks", "Oaks Room");
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-phase4-floor-${Date.now()}.json`);
  const port = 4200 + Math.floor(Math.random() * 500);
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LAUNCH_STORE_PATH: storePath,
      HOME_DAYCARE_HUB_TESTING: "1",
      ALLOW_TEST_BEARER: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  const results = [];
  const pass = (name) => { results.push({ name, ok: true }); console.log(`PASS  ${name}`); };
  try {
    await waitForHealth(port, server);
    await seedProgram(port);
    browser = await chromium.launch({ headless: true });

    // --- API: teacher cannot assign classrooms ---
    const teacherDeny = await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: TEACHER,
      body: { memberEmail: TEACHER, classroomId: "room-oaks", classroomName: "Oaks Room" },
    });
    assert.equal(teacherDeny.status, 403);
    pass("teacher cannot assign classrooms (403)");

    // --- API: owner assigns classroom ---
    const assign = await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: OWNER,
      body: { memberEmail: TEACHER, classroomId: "room-oaks", classroomName: "Oaks Room" },
    });
    assert.equal(assign.status, 200, JSON.stringify(assign.json));
    assert.deepEqual(assign.json?.account?.classroomIds, ["room-oaks"]);
    assert.equal(assign.json?.member?.classroomId, "room-oaks");
    pass("owner assign-classroom updates member + account");

    // --- Membership summary exposes classroomIds for staff refresh ---
    const sub = await request(port, "GET", `/api/subscription-status?email=${encodeURIComponent(TEACHER)}`);
    assert.equal(sub.status, 200);
    assert.deepEqual(sub.json?.subscription?.classroomIds, ["room-oaks"]);
    assert.equal(sub.json?.subscription?.classroomName, "Oaks Room");
    pass("subscription-status includes classroom assignment");

    // --- UI: unassigned empty-state guidance ---
    const unassignedTeacher = await openPage(browser, port, TEACHER, accountSeed(TEACHER, {
      role: "teacher",
      classroomIds: [],
    }));
    const emptyState = await unassignedTeacher.page.evaluate(async () => {
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
        },
      })).json();
      applyChildDataSnapshot(remote.data || {}, remote.updatedAt || "");
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      renderChildManagement();
      const empty = document.querySelector("[data-dlc-empty-reason]");
      return {
        reason: empty?.getAttribute("data-dlc-empty-reason") || "",
        text: empty?.textContent || "",
        activeCount: getActiveChildren(childRecords()).length,
        unassignedHelper: isUnassignedLinkedClassroomStaff(),
      };
    });
    assert.equal(emptyState.unassignedHelper, true);
    assert.equal(emptyState.activeCount, 0);
    assert.equal(emptyState.reason, "unassigned-staff");
    assert.match(emptyState.text, /assign your classroom/i);
    await unassignedTeacher.page.screenshot({
      path: path.join(ARTIFACT_DIR, "screenshots", "unassigned-empty-state.png"),
      fullPage: true,
    });
    pass("unassigned teacher sees assign-classroom empty state");

    // --- UI: after local classroomIds sync, Oaks child appears ---
    const afterAssign = await unassignedTeacher.page.evaluate(async () => {
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      const email = String(currentUser);
      accounts[email] = {
        ...accounts[email],
        classroomIds: ["room-oaks"],
        classroomName: "Oaks Room",
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      renderChildManagement();
      return {
        active: getActiveChildren(childRecords()).map((c) => c.id),
        unassigned: isUnassignedLinkedClassroomStaff(),
        emptyReason: document.querySelector("[data-dlc-empty-reason]")?.getAttribute("data-dlc-empty-reason") || "",
      };
    });
    assert.equal(afterAssign.unassigned, false);
    assert.deepEqual(afterAssign.active, ["child-oaks-1"]);
    assert.equal(afterAssign.emptyReason, "");
    pass("assigned teacher sees only Oaks classroom children");
    await unassignedTeacher.context.close();

    // --- Owner Staff UI exposes assign select ---
    const owner = await openPage(browser, port, OWNER, accountSeed(OWNER));
    const staffUi = await owner.page.evaluate(async () => {
      // Seed schedule classrooms for the assign dropdown.
      scheduleDocCache = {
        classrooms: [
          { id: "room-oaks", name: "Oaks Room" },
          { id: "room-maples", name: "Maples Room" },
        ],
        items: [],
        weeks: {},
      };
      await refreshStaffInvitesFromBackend();
      if (typeof setView === "function") setView("staff", { skipAccessRedirect: true });
      renderStaffManagementPage({ refresh: false });
      const select = document.querySelector(`[data-staff-assign-classroom="${TEACHER}"]`);
      return {
        hasSelect: Boolean(select),
        value: select?.value || "",
        options: Array.from(select?.options || []).map((o) => o.value),
        rowCount: document.querySelectorAll("[data-staff-assign-classroom]").length,
      };
    });
    assert.equal(staffUi.hasSelect, true);
    assert.equal(staffUi.value, "room-oaks");
    assert.ok(staffUi.options.includes("room-maples"));
    assert.ok(staffUi.rowCount >= 2);
    await owner.page.screenshot({
      path: path.join(ARTIFACT_DIR, "screenshots", "staff-assign-ui.png"),
      fullPage: true,
    });
    pass("Staff UI shows classroom assign controls for members");

    // Reassign via API (Maples) then clear — regression-safe ACL path
    const reassign = await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: OWNER,
      body: { memberEmail: TEACHER, classroomId: "room-maples", classroomName: "Maples Room" },
    });
    assert.equal(reassign.status, 200);
    assert.deepEqual(reassign.json?.account?.classroomIds, ["room-maples"]);
    const clear = await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: OWNER,
      body: { memberEmail: TEACHER, classroomId: "", classroomName: "" },
    });
    assert.equal(clear.status, 200);
    assert.deepEqual(clear.json?.account?.classroomIds, []);
    // Restore Oaks for room-mode tests
    await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: OWNER,
      body: { memberEmail: TEACHER, classroomId: "room-oaks", classroomName: "Oaks Room" },
    });
    pass("owner can reassign and clear classroom assignment");
    await owner.context.close();

    // --- Room-mode quick logs stay on roster and enqueue mutations ---
    const floorTeacher = await openPage(browser, port, TEACHER, accountSeed(TEACHER, {
      role: "teacher",
      classroomIds: ["room-oaks"],
    }));
    const roomMode = await floorTeacher.page.evaluate(async () => {
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
        },
      })).json();
      applyChildDataSnapshot(remote.data || {}, remote.updatedAt || "");
      // Check in first so room-mode buttons render.
      saveDailyLogQuickAction("check-in", "child-oaks-1", { date: dlcActiveDate(), time: "08:00" });
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      renderChildManagement();
      const beforeSection = dailyLogsSection;
      const mealBtn = document.querySelector('[data-dlc-quick-action="room-meal"][data-dlc-quick-child="child-oaks-1"]');
      const diaperBtn = document.querySelector('[data-dlc-quick-action="room-diaper"][data-dlc-quick-child="child-oaks-1"]');
      const napBtn = document.querySelector('[data-dlc-quick-action="room-nap"][data-dlc-quick-child="child-oaks-1"]');
      const noteBtn = document.querySelector('[data-dlc-quick-action="room-note"][data-dlc-quick-child="child-oaks-1"]');
      const beforeQueue = childDataMutationQueue.length;
      // Click path for Meal (must stay on roster); remaining actions via save helper
      // because the UI debounce lock is 450ms between taps.
      mealBtn?.click();
      await new Promise((r) => setTimeout(r, 80));
      const sectionAfterMealClick = dailyLogsSection;
      const modeAfterMealClick = childManagementMode;
      saveDailyLogQuickAction("room-diaper", "child-oaks-1", { date: dlcActiveDate() });
      saveDailyLogQuickAction("room-nap", "child-oaks-1", { date: dlcActiveDate() });
      saveDailyLogQuickAction("room-note", "child-oaks-1", { date: dlcActiveDate() });
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      renderChildManagement();
      const records = childRecords();
      const meals = (records.meals || []).filter((m) => m.childId === "child-oaks-1");
      const diapers = (records.diapers || []).filter((m) => m.childId === "child-oaks-1");
      const naps = (records.naps || []).filter((m) => m.childId === "child-oaks-1");
      const notes = (records.communications || []).filter((m) => m.childId === "child-oaks-1");
      return {
        hasButtons: Boolean(mealBtn && diaperBtn && napBtn && noteBtn),
        beforeSection,
        sectionAfterMealClick,
        modeAfterMealClick,
        afterSection: dailyLogsSection,
        beforeQueue,
        afterQueue: childDataMutationQueue.length,
        queueStores: childDataMutationQueue.map((m) => m.storeKey),
        mealCount: meals.length,
        diaperCount: diapers.length,
        napCount: naps.length,
        noteCount: notes.length,
        stillHome: sectionAfterMealClick === "home" && modeAfterMealClick === "daily-logs",
      };
    });
    assert.equal(roomMode.hasButtons, true);
    assert.equal(roomMode.stillHome, true);
    assert.equal(roomMode.sectionAfterMealClick, "home");
    assert.ok(roomMode.afterQueue > roomMode.beforeQueue);
    assert.ok(roomMode.mealCount >= 1);
    assert.ok(roomMode.diaperCount >= 1);
    assert.ok(roomMode.napCount >= 1);
    assert.ok(roomMode.noteCount >= 1);
    assert.ok(roomMode.queueStores.includes("Meals"));
    assert.ok(roomMode.queueStores.includes("Diapers"));
    await floorTeacher.page.screenshot({
      path: path.join(ARTIFACT_DIR, "screenshots", "room-mode-actions.png"),
      fullPage: true,
    });
    pass("room-mode Meal/Diaper/Nap/Note log without leaving roster + enqueue queue");

    // Maples child still inaccessible to Oaks teacher
    const isolation = await floorTeacher.page.evaluate(() => {
      const active = getActiveChildren(childRecords()).map((c) => c.id);
      return { active, hasMaples: active.includes("child-maples-1") };
    });
    assert.equal(isolation.hasMaples, false);
    assert.deepEqual(isolation.active, ["child-oaks-1"]);
    pass("room-mode path keeps classroom isolation intact");
    await floorTeacher.context.close();

    // --- Assistant still can care-log; Settings/staff assign denied ---
    const assistant = await openPage(browser, port, ASSISTANT, accountSeed(ASSISTANT, {
      role: "assistant",
      classroomIds: ["room-oaks"],
    }));
    const assistantAcl = await assistant.page.evaluate(() => ({
      staff: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("staff_management") : null,
      billing: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("billing") : null,
      settings: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("settings") : null,
    }));
    assert.equal(assistantAcl.staff, false);
    assert.equal(assistantAcl.billing, false);
    assert.equal(assistantAcl.settings, false);
    const assistantCare = await request(port, "POST", "/api/child-data", {
      email: ASSISTANT,
      body: {
        mutations: [{
          clientMutationId: "phase4-asst-care",
          op: "upsert",
          storeKey: "Diapers",
          record: {
            id: "diaper-phase4-asst",
            childId: "child-oaks-1",
            date: new Date().toISOString().slice(0, 10),
            type: "Wet",
            revision: 1,
          },
        }],
      },
    });
    assert.equal(assistantCare.status, 200);
    assert.equal(assistantCare.json?.results?.[0]?.ok, true);
    pass("assistant care access preserved; staff/billing still denied");
    await assistant.context.close();

    const report = {
      ok: true,
      passed: results.length,
      results,
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
    console.log(`\nPhase 4 classroom floor ops: ${results.length}/${results.length} PASS`);
  } catch (error) {
    console.error("FAIL", error);
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify({
      ok: false,
      error: String(error?.stack || error),
      results,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main();
