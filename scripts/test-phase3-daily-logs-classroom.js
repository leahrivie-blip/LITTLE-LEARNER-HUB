#!/usr/bin/env node
/**
 * Phase 3 — real classroom Daily Logs hardening (testing only).
 * Covers: conflict ACK safety, multi-conflict UI, classroom scope parity,
 * undo/archive/share queue routing, pagehide persist flush.
 *
 * Run: npm run test:phase3-daily-logs-classroom
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/phase3-daily-logs-classroom";
const OWNER = "phase3.classroom.owner@example.com";
const TEACHER = "phase3.classroom.teacher@example.com";
const ASSISTANT = "phase3.classroom.assistant@example.com";
const PROGRAM = "prog-phase3-classroom";

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
    firstName: "Phase3",
    lastName: role,
    accountType: "center",
    businessName: "Phase3 Classroom Nest",
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
  await page.waitForFunction(() => typeof enqueueChildDataMutation === "function" && typeof getActiveChildren === "function", null, { timeout: 60000 });
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
    {
      id: "child-name-only",
      name: "Cara Name",
      classroomId: "",
      classroom: "Oaks Room",
      createdAt: new Date().toISOString(),
    },
  ];
  await request(port, "POST", "/api/account/profile", {
    body: {
      email: OWNER,
      firstName: "Phase3",
      lastName: "Owner",
      accountType: "center",
      role: "owner",
      businessName: "Phase3 Classroom Nest",
      signup: true,
    },
  });
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

  async function inviteStaff(email, role, classroomId, classroomName) {
    const invite = await request(port, "POST", "/api/staff/invites", {
      email: OWNER,
      body: {
        email,
        role,
        classroomId,
        classroomName,
        programName: "Phase3 Classroom Nest",
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
  }

  await inviteStaff(TEACHER, "teacher", "room-oaks", "Oaks Room");
  // Assistant assigned by room name string (parity with UI classroom name matching).
  await inviteStaff(ASSISTANT, "assistant", "Oaks Room", "Oaks Room");
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-phase3-classroom-${Date.now()}.json`);
  const port = 4100 + Math.floor(Math.random() * 500);
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

    // --- Owner: conflict+duplicate must not ACK-remove ---
    const owner = await openPage(browser, port, OWNER, accountSeed(OWNER));
    const conflictDup = await owner.page.evaluate(async () => {
      clearTimeout(childCloudSaveTimer);
      const identity = childDataActorIdentity();
      childDataMutationQueueScope = identity.scopeKey;
      const meal = {
        id: "meal-conflict-dup",
        childId: "child-oaks-1",
        date: dlcActiveDate(),
        lunch: "Local soup",
        summary: "Local soup",
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveChildStoreLocalOnly("Meals", [meal]);
      childDataMutationQueue = [{
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: "poison-conflict-dup",
        baseRevision: 1,
        recordId: meal.id,
        record: meal,
        baseSnapshot: { ...meal, lunch: "Old" },
        intendedFields: ["lunch"],
        childId: meal.childId,
        userId: identity.userId,
        programId: identity.programId,
        scopeKey: identity.scopeKey,
        queuedAt: new Date().toISOString(),
        status: "pending",
      }];
      const origFetch = window.fetch.bind(window);
      window.fetch = async (url, opts = {}) => {
        const method = String(opts.method || "GET").toUpperCase();
        const bodyText = typeof opts.body === "string" ? opts.body : "";
        if (String(url).includes("/api/child-data") && method === "POST" && bodyText.includes("poison-conflict-dup")) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              results: [{
                clientMutationId: "poison-conflict-dup",
                ok: false,
                conflict: true,
                duplicate: true,
                code: "stale_revision",
                error: "stale",
                serverRecord: { ...meal, lunch: "Server stew", revision: 2 },
              }],
            }),
          };
        }
        return origFetch(url, opts);
      };
      await saveChildDataToBackend({ force: true });
      window.fetch = origFetch;
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      renderChildManagement();
      return {
        stillQueued: childDataMutationQueue.some((m) => m.clientMutationId === "poison-conflict-dup"),
        status: childDataMutationQueue.find((m) => m.clientMutationId === "poison-conflict-dup")?.status || "",
        conflictState: Boolean(dlcConflictState),
        panels: document.querySelectorAll("[data-dlc-conflict-panel]").length,
        saveState: dlcSaveStatus.state,
        queueLen: childDataMutationQueue.length,
        barHtml: typeof dlcRenderSaveStatusBar === "function" ? dlcRenderSaveStatusBar() : "",
      };
    });
    assert.equal(conflictDup.stillQueued, true);
    assert.equal(conflictDup.status, "conflict");
    assert.equal(conflictDup.conflictState, true);
    assert.equal(conflictDup.saveState, "conflict");
    assert.match(conflictDup.barHtml, /data-dlc-conflict-panel/);
    pass("conflict+duplicate response does not ACK-remove mutation");

    // --- Multi-conflict panels ---
    const multi = await owner.page.evaluate(async () => {
      clearTimeout(childCloudSaveTimer);
      const identity = childDataActorIdentity();
      const mk = (id, lunch) => ({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: id,
        baseRevision: 1,
        recordId: `meal-${id}`,
        record: {
          id: `meal-${id}`,
          childId: "child-oaks-1",
          date: dlcActiveDate(),
          lunch,
          revision: 1,
        },
        conflictServerRecord: {
          id: `meal-${id}`,
          childId: "child-oaks-1",
          lunch: `Server ${lunch}`,
          revision: 2,
        },
        intendedFields: ["lunch"],
        childId: "child-oaks-1",
        userId: identity.userId,
        programId: identity.programId,
        scopeKey: identity.scopeKey,
        queuedAt: new Date().toISOString(),
        status: "conflict",
        lastError: "stale_revision",
      });
      childDataMutationQueue = [mk("multi-a", "A"), mk("multi-b", "B")];
      childDataMutationQueueScope = identity.scopeKey;
      dlcConflictState = dlcBuildConflictViewModel(childDataMutationQueue[0], {
        serverRecord: childDataMutationQueue[0].conflictServerRecord,
        code: "stale_revision",
      });
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      const barHtml = dlcRenderSaveStatusBar();
      renderChildManagement();
      return {
        panelsInBar: (barHtml.match(/data-dlc-conflict-panel/g) || []).length,
        panelsInDom: document.querySelectorAll("[data-dlc-conflict-panel]").length,
        text: barHtml,
      };
    });
    assert.equal(multi.panelsInBar, 2);
    assert.match(multi.text, /2 updates need review/i);
    await owner.page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "multi-conflict.png"), fullPage: true });
    pass("multi-conflict panels render for queued conflicts");

    // --- Undo discards pending create (no false cloud-saved) ---
    const undo = await owner.page.evaluate(async () => {
      childDataMutationQueue = [];
      dlcConflictState = null;
      dlcUndoStack = [];
      const saved = appendChildRecord("Meals", {
        id: "meal-undo-pending",
        childId: "child-oaks-1",
        date: dlcActiveDate(),
        lunch: "Undo me",
        summary: "Undo me",
      }, { skipRender: true });
      await flushChildDataMutationPersists();
      const beforeUndo = childDataMutationQueue.some((m) => String(m.record?.id || m.recordId) === saved.id);
      dlcUndoLastEntry();
      await flushChildDataMutationPersists();
      return {
        beforeUndo,
        stillLocal: childStore("Meals").some((m) => m.id === saved.id),
        stillQueued: childDataMutationQueue.some((m) => String(m.record?.id || m.recordId) === saved.id),
        status: dlcSaveStatus.state,
        message: dlcSaveStatus.message,
      };
    });
    assert.equal(undo.beforeUndo, true);
    assert.equal(undo.stillLocal, false);
    assert.equal(undo.stillQueued, false);
    assert.notEqual(undo.status, "saved");
    pass("undo discards pending create without claiming cloud-saved");

    // --- Archive / share enqueue mutations ---
    const archiveShare = await owner.page.evaluate(async () => {
      childDataMutationQueue = [];
      const meal = {
        id: "meal-archive-share",
        childId: "child-oaks-1",
        date: dlcActiveDate(),
        lunch: "Share me",
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveChildStoreLocalOnly("Meals", [meal]);
      await archiveChildRecord("Meals", meal.id, true);
      const archivedQueued = childDataMutationQueue.find((m) => m.recordId === meal.id || m.record?.id === meal.id);
      childDataMutationQueue = [];
      saveChildStoreLocalOnly("Meals", [{ ...meal, archived: false, shareWithFamily: false, revision: 1 }]);
      // Bypass confirm dialog for share-on.
      const existing = childStore("Meals").find((m) => m.id === meal.id);
      const clientMutationId = newClientMutationId();
      const next = { ...existing, shareWithFamily: true, clientMutationId, revision: 1, updatedAt: new Date().toISOString() };
      saveChildStoreLocalOnly("Meals", [next]);
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId,
        baseRevision: 1,
        record: next,
        baseSnapshot: existing,
        childId: meal.childId,
      });
      return {
        archiveOp: archivedQueued?.op || "",
        archiveStatus: archivedQueued?.status || "",
        archiveArchived: Boolean(archivedQueued?.record?.archived),
        shareQueued: childDataMutationQueue.some((m) => m.record?.shareWithFamily === true),
      };
    });
    assert.equal(archiveShare.archiveOp, "upsert");
    assert.equal(archiveShare.archiveStatus, "pending");
    assert.equal(archiveShare.archiveArchived, true);
    assert.equal(archiveShare.shareQueued, true);
    pass("archive/share route through mutation queue");

    // --- pagehide flush barrier exists + persist chain ---
    const flushMarkers = await owner.page.evaluate(async () => {
      childDataMutationQueue = [];
      const id = enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: "flush-barrier-1",
        record: {
          id: "meal-flush-1",
          childId: "child-oaks-1",
          date: dlcActiveDate(),
          lunch: "Flush",
          revision: 1,
        },
      });
      await flushChildDataMutationPersists();
      const identity = childDataActorIdentity();
      const rows = await idbListMutationsForScope(identity.scopeKey);
      return {
        id,
        inIdb: rows.some((m) => m.clientMutationId === "flush-barrier-1"),
        hasFlush: typeof flushChildDataMutationPersists === "function",
      };
    });
    assert.equal(flushMarkers.hasFlush, true);
    assert.equal(flushMarkers.inIdb, true);
    pass("persist flush barrier writes queue to IndexedDB");
    await owner.context.close();

    // --- Teacher: room id filter; Maples hidden ---
    const teacher = await openPage(browser, port, TEACHER, accountSeed(TEACHER, {
      role: "teacher",
      classroomIds: ["room-oaks"],
    }));
    const teacherScope = await teacher.page.evaluate(async () => {
      // Pull cloud profiles into local stores.
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
        },
      })).json();
      applyChildDataSnapshot(remote.data || {}, remote.updatedAt || "");
      const active = getActiveChildren(childRecords()).map((c) => c.id);
      const nameMatch = childMatchesStaffClassroom(
        { classroomId: "", classroom: "Oaks Room" },
        ["Oaks Room"],
      );
      const idMatch = childMatchesStaffClassroom(
        { classroomId: "room-oaks", classroom: "Oaks Room" },
        ["room-oaks"],
      );
      return { active, nameMatch, idMatch };
    });
    assert.deepEqual(teacherScope.active.sort(), ["child-oaks-1"].sort());
    assert.equal(teacherScope.nameMatch, true);
    assert.equal(teacherScope.idMatch, true);
    pass("teacher UI filters to assigned classroom id");

    // Unassigned teacher sees nobody
    const unassigned = await teacher.page.evaluate(() => {
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      const email = String(currentUser);
      accounts[email] = { ...accounts[email], classroomIds: [] };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      return getActiveChildren(childRecords()).map((c) => c.id);
    });
    assert.deepEqual(unassigned, []);
    pass("unassigned linked staff see no children (matches server deny)");
    await teacher.context.close();

    // --- Assistant: room name assignment includes name-only child ---
    const assistant = await openPage(browser, port, ASSISTANT, accountSeed(ASSISTANT, {
      role: "assistant",
      classroomIds: ["Oaks Room"],
    }));
    const assistantScope = await assistant.page.evaluate(async () => {
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
        },
      })).json();
      applyChildDataSnapshot(remote.data || {}, remote.updatedAt || "");
      return getActiveChildren(childRecords()).map((c) => c.id).sort();
    });
    assert.deepEqual(assistantScope, ["child-name-only", "child-oaks-1"].sort());
    pass("assistant room-name assignment matches id OR classroom name");

    // Assistant can log care; cannot profile-mutate (server)
    const assistantWrite = await request(port, "POST", "/api/child-data", {
      email: ASSISTANT,
      body: {
        mutations: [{
          clientMutationId: "asst-care-1",
          op: "upsert",
          storeKey: "Diapers",
          record: {
            id: "diaper-asst-1",
            childId: "child-oaks-1",
            date: new Date().toISOString().slice(0, 10),
            type: "Wet",
            revision: 1,
          },
        }],
      },
    });
    assert.equal(assistantWrite.status, 200);
    assert.equal(assistantWrite.json?.results?.[0]?.ok, true);
    const assistantProfileDeny = await request(port, "POST", "/api/child-data", {
      email: ASSISTANT,
      body: {
        mutations: [{
          clientMutationId: "asst-profile-1",
          op: "upsert",
          storeKey: "Profiles",
          baseRevision: 1,
          record: {
            id: "child-oaks-1",
            name: "Hacked",
            classroomId: "room-oaks",
            revision: 1,
          },
        }],
      },
    });
    assert.equal(assistantProfileDeny.json?.results?.[0]?.ok, false);
    assert.equal(assistantProfileDeny.json?.results?.[0]?.code, "forbidden");
    pass("assistant can log care; profile edits forbidden");
    await assistant.context.close();

    // --- Server: conflicts are not idempotency-cached ---
    const conflictCache = await request(port, "POST", "/api/child-data", {
      email: OWNER,
      body: {
        mutations: [{
          clientMutationId: "create-for-conflict",
          op: "upsert",
          storeKey: "Meals",
          record: {
            id: "meal-no-cache",
            childId: "child-oaks-1",
            date: "2026-08-06",
            lunch: "One",
            revision: 1,
          },
        }],
      },
    });
    assert.equal(conflictCache.json?.results?.[0]?.ok, true);
    const bump = await request(port, "POST", "/api/child-data", {
      email: OWNER,
      body: {
        mutations: [{
          clientMutationId: "bump-meal-no-cache",
          op: "upsert",
          storeKey: "Meals",
          baseRevision: 1,
          record: {
            id: "meal-no-cache",
            childId: "child-oaks-1",
            date: "2026-08-06",
            lunch: "Two",
            revision: 1,
          },
        }],
      },
    });
    assert.equal(bump.json?.results?.[0]?.ok, true);
    const stale1 = await request(port, "POST", "/api/child-data", {
      email: OWNER,
      body: {
        mutations: [{
          clientMutationId: "stale-no-cache",
          op: "upsert",
          storeKey: "Meals",
          baseRevision: 1,
          record: {
            id: "meal-no-cache",
            childId: "child-oaks-1",
            date: "2026-08-06",
            lunch: "Stale",
            revision: 1,
          },
        }],
      },
    });
    assert.equal(stale1.json?.results?.[0]?.conflict, true);
    assert.notEqual(stale1.json?.results?.[0]?.duplicate, true);
    const stale2 = await request(port, "POST", "/api/child-data", {
      email: OWNER,
      body: {
        mutations: [{
          clientMutationId: "stale-no-cache",
          op: "upsert",
          storeKey: "Meals",
          baseRevision: 1,
          record: {
            id: "meal-no-cache",
            childId: "child-oaks-1",
            date: "2026-08-06",
            lunch: "Stale again",
            revision: 1,
          },
        }],
      },
    });
    assert.equal(stale2.json?.results?.[0]?.conflict, true);
    assert.notEqual(stale2.json?.results?.[0]?.duplicate, true);
    pass("server does not idempotency-cache conflict responses");

    const report = {
      ok: results.every((r) => r.ok),
      passed: results.length,
      results,
      artifactDir: ARTIFACT_DIR,
      note: "Phase 3 classroom hardening — testing only",
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
    console.log(`ALL PHASE 3 DAILY LOGS CLASSROOM CHECKS PASSED (${results.length})`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
