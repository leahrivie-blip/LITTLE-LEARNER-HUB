#!/usr/bin/env node
/**
 * Phase 2 — durable IndexedDB mutation queue + human conflict UX proof.
 * Run: npm run test:child-data-durable-queue
 * Do not merge. Do not deploy.
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/phase2-durable-queue";
const OWNER = "phase2.durable.owner@example.com";
const TEACHER_A = "phase2.durable.teacher.a@example.com";
const TEACHER_B = "phase2.durable.teacher.b@example.com";
const PROGRAM_A = "prog-durable-a";
const PROGRAM_B = "prog-durable-b";

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

function accountSeed(email, {
  role = "owner",
  programId = PROGRAM_A,
  localActorId = "",
  firstName = "Durable",
} = {}) {
  return {
    email,
    plan: "Pro",
    role,
    firstName,
    accountType: "home_daycare",
    businessName: "Durable Nest",
    subscriptionStatus: "Pro",
    programId,
    localActorId: localActorId || `actor_${email.split("@")[0]}`,
    classroomIds: role === "teacher" || role === "assistant" ? ["room-oaks"] : [],
    createdAt: new Date().toISOString(),
  };
}

async function openPage(browser, port, email, opts = {}) {
  const {
    role = "owner",
    programId = PROGRAM_A,
    localActorId = "",
    viewport = { width: 1280, height: 900 },
  } = opts;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(({ userEmail, account }) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({ [userEmail]: account }));
    localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
  }, { userEmail: email, account: accountSeed(email, { role, programId, localActorId }) });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.enqueueChildDataMutation === "function"
    && typeof window.loadChildDataMutationQueue === "function"
    && Boolean(window.LLH_CONFIG?.homeDaycareHubTesting), null, { timeout: 30000 });
  return { context, page };
}

async function seedChild(page) {
  await page.evaluate(async () => {
    saveChildStore("Profiles", [
      { id: "child-ava", name: "Ava Durable", classroomId: "room-oaks", classroom: "Oaks", parentInfo: "Pat Family" },
    ]);
    ["Attendance", "Meals", "Naps", "Diapers", "ActivityLogs", "Communications", "Photos", "Reports", "Observations"]
      .forEach((key) => saveChildStore(key, []));
    await saveChildDataToBackend({ force: true });
    await loadChildDataMutationQueue();
    childManagementMode = "daily-logs";
    dailyLogsSection = "home";
    if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
  });
}

function assertNoChildMutationLocalStorage(keys) {
  const leaked = keys.filter((key) => (
    /^llhChildMutations:/i.test(key)
    || /child.*mutation/i.test(key)
  ));
  assert.equal(leaked.length, 0, `child-data queue must not use localStorage: ${leaked.join(", ")}`);
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /CHILD_MUTATION_IDB_NAME\s*=\s*["']llh-child-mutations-v2["']/);
  assert.match(appJs, /CHILD_MUTATION_MAX_AGE_MS\s*=\s*14\s*\*\s*24/);
  assert.match(appJs, /function childDataActorIdentity/);
  assert.match(appJs, /function rebaseLocalChangeOntoServer/);
  assert.match(appJs, /function promptLogoutWithUnsyncedWork/);
  assert.match(appJs, /dlc-conflict-diff-list/);
  assert.match(appJs, /Apply my change to the latest version/);
  assert.match(appJs, /Needs review because another person updated it/);
  assert.match(appJs, /Waiting for connection/);
  assert.match(appJs, /Saved to cloud/);
  assert.doesNotMatch(appJs, /localStorage\.setItem\(\s*[`'"]llhChildMutations/);
  assert.match(appJs, /CHILD_MUTATION_LS_LEGACY_PREFIX/);
  console.log("PASS  static durable-queue / human-conflict markers");

  const port = 48100 + Math.floor(Math.random() * 800);
  const storePath = path.join(os.tmpdir(), `llh-durable-${crypto.randomBytes(4).toString("hex")}.json`);
  const server = spawn(process.execPath, ["server/index.js"], {
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
  let browser;
  try {
    await waitForHealth(port, server);
    browser = await chromium.launch({ headless: true });
    const { context, page } = await openPage(browser, port, OWNER, {
      localActorId: "actor_owner_durable",
      programId: PROGRAM_A,
    });
    await seedChild(page);

    // Block child-data POSTs so offline work cannot be acknowledged across reload.
    let blockChildDataPosts = true;
    await page.route("**/api/child-data", async (route) => {
      if (blockChildDataPosts && route.request().method() === "POST") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    });

    // Offline entry → IndexedDB only (never localStorage)
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      window.dispatchEvent(new Event("offline"));
    });
    await page.evaluate(() => {
      appendChildRecord("Meals", {
        childId: "child-ava",
        date: dlcActiveDate(),
        lunch: "Offline pasta",
        title: "Meals",
        summary: "Offline pasta",
        shareWithFamily: true,
      }, { skipRender: true });
    });
    await page.waitForTimeout(900);
    const offlineState = await page.evaluate(async () => {
      const identity = childDataActorIdentity();
      let idbCount = 0;
      try {
        idbCount = (await idbListMutationsForScope(identity.scopeKey)).length;
      } catch (_e) {
        idbCount = -1;
      }
      const lsKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) lsKeys.push(localStorage.key(i));
      const legacy = lsKeys.filter((k) => String(k || "").startsWith("llhChildMutations:"));
      return {
        status: dlcSaveStatus.state,
        message: dlcSaveStatus.message,
        mem: childDataMutationQueue.length,
        idbCount,
        legacyLs: legacy.length,
        lsKeys,
        scope: childDataMutationQueueScope,
        userId: identity.userId,
        programId: identity.programId,
        claimsSaved: /^(saved)$/i.test(String(dlcSaveStatus.state || ""))
          || /^saved to cloud$/i.test(String(dlcSaveStatus.message || "")),
        hasWaiting: /waiting for connection/i.test(`${dlcSaveStatus.message || ""}`),
      };
    });
    assert.ok(["offline", "pending", "failed", "saving"].includes(offlineState.status), offlineState.status);
    assert.equal(offlineState.claimsSaved, false);
    assert.ok(offlineState.mem >= 1);
    assert.ok(offlineState.idbCount >= 1, "must persist in IndexedDB");
    assert.equal(offlineState.legacyLs, 0);
    assertNoChildMutationLocalStorage(offlineState.lsKeys);
    assert.ok(offlineState.userId && !offlineState.userId.includes("@"));
    assert.ok(offlineState.programId && !String(offlineState.programId).includes("@"));
    // Persist the live actor/program scope so reload uses the same identity before backend sync mutates accounts.
    await page.evaluate(({ userId, programId }) => {
      const email = String(currentUser || "");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      if (accounts[email]) {
        accounts[email].localActorId = userId;
        accounts[email].programId = programId;
        accounts[email].linkedProgramId = programId;
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      }
      dailyLogsSection = "home";
      renderChildManagement();
    }, { userId: offlineState.userId, programId: offlineState.programId });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "status-offline.png") });
    console.log("PASS  offline entry persists in IndexedDB only (not claimed cloud-saved)");

    // Refresh before acknowledgement preserves queue
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => typeof window.loadChildDataMutationQueue === "function", null, { timeout: 30000 });
    const afterRefresh = await page.evaluate(async () => {
      await loadChildDataMutationQueue();
      return {
        count: childDataMutationQueue.length,
        lunchPending: childDataMutationQueue.some((m) => m.record?.lunch === "Offline pasta"),
        scope: childDataMutationQueueScope,
        emailScoped: childDataMutationQueue.some((m) => m.userEmail),
        identity: childDataActorIdentity(),
      };
    });
    assert.ok(afterRefresh.count >= 1, "refresh must restore pending mutations");
    assert.equal(afterRefresh.lunchPending, true);
    assert.equal(afterRefresh.emailScoped, false);
    console.log("PASS  refresh before acknowledgement preserves pending mutation");

    // Reconnect flushes + idempotent replay
    blockChildDataPosts = false;
    await page.unroute("**/api/child-data");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      window.dispatchEvent(new Event("online"));
    });
    await page.waitForTimeout(1200);
    const afterOnline = await page.evaluate(async () => {
      await saveChildDataToBackend({ force: true, retryFailed: true });
      const mid = "replay-mid-1";
      const record = {
        id: "meal-replay-1",
        childId: "child-ava",
        date: dlcActiveDate(),
        lunch: "Replay beans",
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: mid,
        record,
      });
      const first = await saveChildDataToBackend({ force: true });
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: mid,
        record: { ...record, lunch: "SHOULD NOT DUPLICATE" },
      });
      const second = await saveChildDataToBackend({ force: true });
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
        },
      })).json();
      const meals = remote.data?.Meals || [];
      return {
        offlineMeal: meals.some((m) => m.lunch === "Offline pasta"),
        replayLunch: (meals.find((m) => m.id === "meal-replay-1") || {}).lunch,
        secondDup: second?.duplicates || 0,
        firstApplied: first?.applied,
        status: dlcSaveStatus.state,
        message: dlcSaveStatus.message,
      };
    });
    assert.equal(afterOnline.offlineMeal, true);
    assert.equal(afterOnline.replayLunch, "Replay beans");
    assert.ok(afterOnline.secondDup >= 1 || afterOnline.replayLunch === "Replay beans");
    await page.evaluate(() => {
      dlcSetSaveStatus("saving", "Saving…");
      dailyLogsSection = "home";
      childManagementMode = "daily-logs";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      renderChildManagement();
    });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "status-saving.png") });
    await page.evaluate(async () => {
      await saveChildDataToBackend({ force: true });
      renderChildManagement();
    });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "status-saved.png") });
    console.log("PASS  reconnect flush + idempotent replay");

    // Human-readable conflict: different fields + rebase apply-my-change
    const conflictDiffFields = await page.evaluate(async () => {
      const today = dlcActiveDate();
      const created = appendChildRecord("Meals", {
        id: "meal-conflict-1",
        childId: "child-ava",
        date: today,
        breakfast: "Oats",
        lunch: "Original",
        title: "Meals",
        summary: "Original",
        shareWithFamily: true,
      }, { skipRender: true });
      await saveChildDataToBackend({ force: true });
      clearTimeout(childCloudSaveTimer);
      const serverEdit = await fetch("/api/child-data", {
        method: "POST",
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutations: [{
            clientMutationId: "server-newer-1",
            op: "upsert",
            storeKey: "Meals",
            baseRevision: 1,
            record: {
              ...created,
              breakfast: "Server oats",
              lunch: "Server newer",
              revision: 1,
              updatedAt: new Date().toISOString(),
            },
          }],
        }),
      }).then((res) => res.json());
      if (!serverEdit?.applied) throw new Error(`server-newer edit failed: ${JSON.stringify(serverEdit)}`);
      const baseSnapshot = { ...created };
      const local = { ...created, lunch: "Local lunch only", revision: 1, updatedAt: new Date().toISOString() };
      saveChildStoreLocalOnly("Meals", childStore("Meals").map((m) => (m.id === local.id ? local : m)));
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: "local-stale-1",
        baseRevision: 1,
        record: local,
        baseSnapshot,
        intendedFields: ["lunch"],
      });
      await saveChildDataToBackend({ force: true });
      dailyLogsSection = "home";
      renderChildManagement();
      const panel = document.querySelector("[data-dlc-conflict-panel]");
      const html = panel ? panel.innerHTML : "";
      return {
        status: dlcSaveStatus.state,
        conflict: Boolean(dlcConflictState),
        panel: Boolean(panel),
        childName: /Ava Durable/i.test(html),
        recordType: /Meal/i.test(html),
        yourChange: /Your change/i.test(html),
        latestSaved: /Latest saved information/i.test(html),
        rawJson: /"revision"\s*:|"baseRevision"\s*:|"clientMutationId"\s*:/.test(html)
          || Boolean(panel?.querySelector("pre")),
        lunchLabel: /Lunch/i.test(html),
        applyBtn: Boolean(document.querySelector("[data-dlc-conflict-retry]")),
        keepBtn: Boolean(document.querySelector("[data-dlc-conflict-reload]")),
        editBtn: Boolean(document.querySelector("[data-dlc-conflict-edit]")),
        cancelBtn: Boolean(document.querySelector("[data-dlc-conflict-discard]")),
        explanation: /another staff member/i.test(html),
      };
    });
    assert.equal(conflictDiffFields.conflict, true);
    assert.equal(conflictDiffFields.panel, true);
    assert.equal(conflictDiffFields.status, "conflict");
    assert.equal(conflictDiffFields.childName, true);
    assert.equal(conflictDiffFields.recordType, true);
    assert.equal(conflictDiffFields.yourChange, true);
    assert.equal(conflictDiffFields.latestSaved, true);
    assert.equal(conflictDiffFields.rawJson, false);
    assert.equal(conflictDiffFields.lunchLabel, true);
    assert.equal(conflictDiffFields.applyBtn, true);
    assert.equal(conflictDiffFields.keepBtn, true);
    assert.equal(conflictDiffFields.editBtn, true);
    assert.equal(conflictDiffFields.cancelBtn, true);
    assert.equal(conflictDiffFields.explanation, true);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "status-conflict-desktop.png") });
    console.log("PASS  human-readable conflict UI (no raw JSON)");

    // Apply my change rebases onto latest (preserves server breakfast, applies local lunch)
    await page.click("[data-dlc-conflict-retry]");
    await page.waitForFunction(() => !dlcConflictState && !childDataMutationQueue.some((m) => m.clientMutationId === "local-stale-1"), null, { timeout: 10000 });
    const rebased = await page.evaluate(async () => {
      clearTimeout(childCloudSaveTimer);
      await saveChildDataToBackend({ force: true, retryFailed: true });
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
        },
      })).json();
      const meal = (remote.data?.Meals || []).find((m) => m.id === "meal-conflict-1") || {};
      return {
        conflict: Boolean(dlcConflictState),
        breakfast: meal.breakfast,
        lunch: meal.lunch,
        revision: meal.revision,
        queueHasStale: childDataMutationQueue.some((m) => m.clientMutationId === "local-stale-1"),
        serverHad: meal,
      };
    });
    assert.equal(rebased.conflict, false);
    assert.equal(rebased.breakfast, "Server oats");
    assert.equal(rebased.lunch, "Local lunch only");
    assert.ok(Number(rebased.revision) >= 2);
    assert.equal(rebased.queueHasStale, false);
    console.log("PASS  409 rebase apply-my-change (different fields)");

    // Same-field conflict → Keep latest
    await page.evaluate(async () => {
      const created = appendChildRecord("Naps", {
        id: "nap-conflict-1",
        childId: "child-ava",
        date: dlcActiveDate(),
        napStart: "12:00",
        napEnd: "13:00",
        notes: "Original nap",
        summary: "Original nap",
      }, { skipRender: true });
      await saveChildDataToBackend({ force: true });
      await fetch("/api/child-data", {
        method: "POST",
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutations: [{
            clientMutationId: "server-nap-1",
            op: "upsert",
            storeKey: "Naps",
            baseRevision: 1,
            record: { ...created, notes: "Server nap note", revision: 1, updatedAt: new Date().toISOString() },
          }],
        }),
      });
      const local = { ...created, notes: "Local nap note", revision: 1, updatedAt: new Date().toISOString() };
      saveChildStoreLocalOnly("Naps", childStore("Naps").map((m) => (m.id === local.id ? local : m)));
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Naps",
        clientMutationId: "local-nap-stale",
        baseRevision: 1,
        record: local,
        baseSnapshot: created,
        intendedFields: ["notes"],
      });
      await saveChildDataToBackend({ force: true });
      renderChildManagement();
    });
    assert.equal(await page.evaluate(() => dlcSaveStatus.state), "conflict");
    await page.click("[data-dlc-conflict-reload]");
    await page.waitForTimeout(200);
    const kept = await page.evaluate(() => ({
      conflict: Boolean(dlcConflictState),
      notes: (childStore("Naps").find((m) => m.id === "nap-conflict-1") || {}).notes,
    }));
    assert.equal(kept.conflict, false);
    assert.equal(kept.notes, "Server nap note");
    console.log("PASS  same-field conflict + keep latest");

    // Attendance / activity / note / diaper conflicts surface friendly types
    const typeLabels = await page.evaluate(async () => {
      const cases = [
        {
          storeKey: "Attendance",
          id: "att-conflict-1",
          record: {
            id: "att-conflict-1",
            childId: "child-ava",
            date: dlcActiveDate(),
            status: "checked_in",
            checkIn: "08:00",
            summary: "In",
          },
          serverPatch: { checkIn: "08:15", summary: "Server in" },
          localPatch: { checkIn: "08:05", summary: "Local in" },
          fields: ["checkIn"],
        },
        {
          storeKey: "ActivityLogs",
          id: "act-conflict-1",
          record: {
            id: "act-conflict-1",
            childId: "child-ava",
            date: dlcActiveDate(),
            activity: "Blocks",
            summary: "Blocks",
          },
          serverPatch: { activity: "Server blocks" },
          localPatch: { activity: "Local blocks" },
          fields: ["activity"],
        },
        {
          storeKey: "Communications",
          id: "note-conflict-1",
          record: {
            id: "note-conflict-1",
            childId: "child-ava",
            date: dlcActiveDate(),
            type: "Note",
            message: "Original note",
            summary: "Original note",
          },
          serverPatch: { message: "Server note" },
          localPatch: { message: "Local note" },
          fields: ["message"],
        },
        {
          storeKey: "Diapers",
          id: "diaper-conflict-1",
          record: {
            id: "diaper-conflict-1",
            childId: "child-ava",
            date: dlcActiveDate(),
            type: "Wet",
            time: "10:00",
            summary: "Wet",
          },
          serverPatch: { type: "BM" },
          localPatch: { type: "Potty" },
          fields: ["type"],
        },
      ];
      const labels = [];
      for (const item of cases) {
        dlcConflictState = null;
        const created = appendChildRecord(item.storeKey, item.record, { skipRender: true });
        await saveChildDataToBackend({ force: true });
        await fetch("/api/child-data", {
          method: "POST",
          headers: {
            Authorization: `Bearer test:${currentUser}`,
            "X-LLH-User-Email": String(currentUser),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mutations: [{
              clientMutationId: `server-${item.id}`,
              op: "upsert",
              storeKey: item.storeKey,
              baseRevision: 1,
              record: { ...created, ...item.serverPatch, revision: 1, updatedAt: new Date().toISOString() },
            }],
          }),
        });
        const local = { ...created, ...item.localPatch, revision: 1, updatedAt: new Date().toISOString() };
        saveChildStoreLocalOnly(item.storeKey, childStore(item.storeKey).map((row) => (row.id === local.id ? local : row)));
        enqueueChildDataMutation({
          op: "upsert",
          storeKey: item.storeKey,
          clientMutationId: `local-${item.id}`,
          baseRevision: 1,
          record: local,
          baseSnapshot: created,
          intendedFields: item.fields,
        });
        await saveChildDataToBackend({ force: true });
        renderChildManagement();
        const html = document.querySelector("[data-dlc-conflict-panel]")?.innerHTML || "";
        labels.push({
          storeKey: item.storeKey,
          typeLabel: dlcConflictState?.recordType || "",
          rawJson: /"revision"\s*:/.test(html) || Boolean(document.querySelector("[data-dlc-conflict-panel] pre")),
          child: /Ava Durable/i.test(html),
        });
        await resolveDlcConflict(`local-${item.id}`, "discard");
      }
      return labels;
    });
    assert.ok(typeLabels.some((row) => row.storeKey === "Attendance" && row.typeLabel === "Attendance"));
    assert.ok(typeLabels.some((row) => row.storeKey === "ActivityLogs" && row.typeLabel === "Activity"));
    assert.ok(typeLabels.some((row) => row.storeKey === "Communications" && /Note/i.test(row.typeLabel)));
    assert.ok(typeLabels.some((row) => row.storeKey === "Diapers" && /Diaper|Potty/i.test(row.typeLabel)));
    assert.equal(typeLabels.every((row) => row.rawJson === false && row.child === true), true);
    console.log("PASS  attendance / activity / note / diaper conflict labels");

    // Deleted record conflict
    const deletedConflict = await page.evaluate(async () => {
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: "local-deleted-1",
        baseRevision: 1,
        record: {
          id: "meal-gone-1",
          childId: "child-ava",
          date: dlcActiveDate(),
          lunch: "Ghost",
          revision: 1,
          updatedAt: new Date().toISOString(),
        },
        baseSnapshot: { id: "meal-gone-1", lunch: "Was here", revision: 1 },
        intendedFields: ["lunch"],
      });
      await saveChildDataToBackend({ force: true });
      renderChildManagement();
      const html = document.querySelector("[data-dlc-conflict-panel]")?.innerHTML || "";
      return {
        status: dlcSaveStatus.state,
        deleted: Boolean(dlcConflictState?.deleted),
        noApply: !document.querySelector("[data-dlc-conflict-retry]"),
        text: /no longer/i.test(html),
      };
    });
    assert.equal(deletedConflict.status, "conflict");
    assert.equal(deletedConflict.deleted, true);
    assert.equal(deletedConflict.noApply, true);
    assert.equal(deletedConflict.text, true);
    await page.evaluate(() => resolveDlcConflict("local-deleted-1", "discard"));
    console.log("PASS  deleted/unavailable record conflict");

    // Mobile conflict layout screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      const created = appendChildRecord("Meals", {
        id: "meal-mobile-1",
        childId: "child-ava",
        date: dlcActiveDate(),
        lunch: "Mobile original",
        summary: "Mobile original",
      }, { skipRender: true });
      await saveChildDataToBackend({ force: true });
      await fetch("/api/child-data", {
        method: "POST",
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutations: [{
            clientMutationId: "server-mobile-1",
            op: "upsert",
            storeKey: "Meals",
            baseRevision: 1,
            record: { ...created, lunch: "Mobile server", revision: 1, updatedAt: new Date().toISOString() },
          }],
        }),
      });
      const local = { ...created, lunch: "Mobile local", revision: 1, updatedAt: new Date().toISOString() };
      saveChildStoreLocalOnly("Meals", childStore("Meals").map((m) => (m.id === local.id ? local : m)));
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: "local-mobile-1",
        baseRevision: 1,
        record: local,
        baseSnapshot: created,
        intendedFields: ["lunch"],
      });
      await saveChildDataToBackend({ force: true });
      renderChildManagement();
    });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "status-conflict-mobile.png") });
    await page.evaluate(() => resolveDlcConflict("local-mobile-1", "discard"));
    await page.setViewportSize({ width: 1280, height: 900 });
    console.log("PASS  mobile conflict screenshot");

    // Failed state wording
    await page.evaluate(async () => {
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: "fail-demo-1",
        record: {
          id: "meal-fail-demo",
          childId: "child-ava",
          date: dlcActiveDate(),
          lunch: "Fail demo",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        status: "failed",
        lastError: "simulated",
      });
      dlcSetSaveStatus("failed", "Sync failed");
      renderChildManagement();
    });
    const failedUi = await page.evaluate(() => {
      const html = document.body.innerHTML;
      return {
        retry: /Retry sync/i.test(html),
        discard: /Discard failed change/i.test(html),
        ambiguousUndo: /data-dlc-mutation-discard[^>]*>\s*Undo/i.test(html),
      };
    });
    assert.equal(failedUi.retry, true);
    assert.equal(failedUi.discard, true);
    assert.equal(failedUi.ambiguousUndo, false);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "status-failed.png") });
    await page.evaluate(async () => { await discardChildDataMutation("fail-demo-1"); });
    console.log("PASS  failed state wording (Retry sync / Discard failed change)");

    // Logout with unsynced work warns; discard path clears queue for this actor
    const logoutWarn = await page.evaluate(async () => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      const blockedFetch = window.fetch;
      window.fetch = async (url, init = {}) => {
        if (String(url).includes("/api/child-data") && String(init.method || "GET").toUpperCase() === "POST") {
          throw new TypeError("Failed to fetch (logout offline simulation)");
        }
        return blockedFetch(url, init);
      };
      appendChildRecord("Meals", {
        id: "meal-logout-pending",
        childId: "child-ava",
        date: dlcActiveDate(),
        lunch: "Logout pending",
        summary: "Logout pending",
      }, { skipRender: true });
      const originalConfirm = window.confirmAction;
      const prompts = [];
      window.confirmAction = async (options = {}) => {
        prompts.push({ title: options.title || "", message: options.message || "", confirmLabel: options.confirmLabel || "" });
        if (/Discard unsynced/i.test(options.title || "") || /Discard unsynced/i.test(options.confirmLabel || "")) {
          return true;
        }
        if (/Sync now/i.test(options.confirmLabel || "")) return true;
        return false;
      };
      const choice = await promptLogoutWithUnsyncedWork();
      window.confirmAction = originalConfirm;
      window.fetch = blockedFetch;
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      const leakedNamesOnPrompt = prompts.some((p) => /Ava Durable|Logout pending/i.test(`${p.title} ${p.message}`));
      return {
        choice,
        prompts: prompts.length,
        hasSync: prompts.some((p) => /Sync now/i.test(p.confirmLabel)),
        hasDiscard: prompts.some((p) => /Discard unsynced/i.test(p.confirmLabel)),
        leakedNamesOnPrompt,
        remaining: childDataMutationQueue.length,
      };
    });
    assert.equal(logoutWarn.choice, "continue");
    assert.ok(logoutWarn.prompts >= 1);
    assert.equal(logoutWarn.hasSync, true);
    assert.equal(logoutWarn.hasDiscard, true);
    assert.equal(logoutWarn.leakedNamesOnPrompt, false);
    assert.equal(logoutWarn.remaining, 0);
    console.log("PASS  logout unsynced warning (Sync now / Discard) without child-name leak");

    // Owner memory clear + Teacher A must not see owner queue
    await page.evaluate(() => {
      clearChildDataMutationMemory();
      currentUser = "";
      localStorage.setItem("llhUser", "");
    });
    await context.close();

    const teacherA = await openPage(browser, port, TEACHER_A, {
      role: "teacher",
      localActorId: "actor_teacher_a",
      programId: PROGRAM_A,
    });
    const isolationA = await teacherA.page.evaluate(async () => {
      await loadChildDataMutationQueue();
      const lsKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) lsKeys.push(localStorage.key(i));
      return {
        count: childDataMutationQueue.length,
        scope: childDataMutationQueueScope,
        leaked: childDataMutationQueue.some((m) => /Offline pasta|Logout pending|local-stale|fail-demo/i.test(JSON.stringify(m))),
        conflictPanel: Boolean(document.querySelector("[data-dlc-conflict-panel]")),
        lsMutationKeys: lsKeys.filter((k) => String(k || "").startsWith("llhChildMutations:")),
      };
    });
    assert.equal(isolationA.leaked, false);
    assert.equal(isolationA.count, 0);
    assert.equal(isolationA.conflictPanel, false);
    assert.equal(isolationA.lsMutationKeys.length, 0);
    console.log("PASS  owner → teacher A isolation (no queue replay / no conflict panel)");

    // Teacher A queues offline work; Teacher B on same device must not see it
    await teacherA.page.evaluate(async () => {
      saveChildStore("Profiles", [
        { id: "child-ava", name: "Ava Durable", classroomId: "room-oaks", classroom: "Oaks" },
      ]);
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      appendChildRecord("Meals", {
        id: "meal-teacher-a-private",
        childId: "child-ava",
        date: dlcActiveDate(),
        lunch: "Teacher A private",
        summary: "Teacher A private",
      }, { skipRender: true });
      await loadChildDataMutationQueue();
    });
    const teacherAQueued = await teacherA.page.evaluate(() => ({
      count: childDataMutationQueue.length,
      userId: childDataActorIdentity().userId,
    }));
    assert.ok(teacherAQueued.count >= 1);
    await teacherA.page.evaluate(() => {
      clearChildDataMutationMemory();
      currentUser = "";
    });
    await teacherA.context.close();

    const teacherB = await openPage(browser, port, TEACHER_B, {
      role: "teacher",
      localActorId: "actor_teacher_b",
      programId: PROGRAM_A,
    });
    const isolationB = await teacherB.page.evaluate(async () => {
      await loadChildDataMutationQueue();
      return {
        count: childDataMutationQueue.length,
        leaked: childDataMutationQueue.some((m) => /Teacher A private/i.test(JSON.stringify(m))),
        userId: childDataActorIdentity().userId,
      };
    });
    assert.equal(isolationB.count, 0);
    assert.equal(isolationB.leaked, false);
    assert.notEqual(isolationB.userId, teacherAQueued.userId);
    console.log("PASS  teacher A → teacher B isolation");

    // Email change keeps actor id boundary (localActorId), not email string
    const emailChange = await teacherB.page.evaluate(async () => {
      const before = childDataActorIdentity();
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      appendChildRecord("Meals", {
        id: "meal-email-change",
        childId: "child-ava",
        date: dlcActiveDate(),
        lunch: "Before email change",
        summary: "Before email change",
      }, { skipRender: true });
      const midCount = childDataMutationQueue.length;
      const oldEmail = String(currentUser);
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      const account = accounts[oldEmail];
      const newEmail = "phase2.durable.teacher.b.renamed@example.com";
      accounts[newEmail] = { ...account, email: newEmail };
      delete accounts[oldEmail];
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      localStorage.setItem("llhUser", newEmail);
      currentUser = newEmail;
      await loadChildDataMutationQueue();
      const after = childDataActorIdentity();
      return {
        midCount,
        beforeUserId: before.userId,
        afterUserId: after.userId,
        stillVisible: childDataMutationQueue.some((m) => m.record?.lunch === "Before email change"),
        scopedByEmail: childDataMutationQueue.some((m) => String(m.userEmail || "").includes("@")),
      };
    });
    assert.ok(emailChange.midCount >= 1);
    assert.equal(emailChange.beforeUserId, emailChange.afterUserId);
    assert.equal(emailChange.stillVisible, true);
    assert.equal(emailChange.scopedByEmail, false);
    console.log("PASS  email change keeps immutable actor scope");

    // Program change must not flush prior program mutations
    const programSwitch = await teacherB.page.evaluate(async () => {
      const beforeScope = childDataMutationQueueScope;
      const beforeCount = childDataMutationQueue.length;
      const beforeProgram = childDataActorIdentity().programId;
      clearChildDataMutationMemory();
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      const email = String(currentUser);
      const nextProgram = beforeProgram === "prog-durable-b" ? "prog-durable-c" : "prog-durable-b";
      accounts[email] = { ...accounts[email], programId: nextProgram, linkedProgramId: nextProgram };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      await loadChildDataMutationQueue();
      return {
        beforeScope,
        beforeCount,
        beforeProgram,
        afterProgram: childDataActorIdentity().programId,
        afterScope: childDataMutationQueueScope,
        afterCount: childDataMutationQueue.length,
        leaked: childDataMutationQueue.some((m) => /Before email change|Teacher A private/i.test(JSON.stringify(m))),
      };
    });
    assert.ok(programSwitch.beforeCount >= 1);
    assert.notEqual(programSwitch.afterProgram, programSwitch.beforeProgram);
    assert.notEqual(programSwitch.afterScope, programSwitch.beforeScope);
    assert.equal(programSwitch.afterCount, 0);
    assert.equal(programSwitch.leaked, false);
    console.log("PASS  program change isolates prior program queue");

    // Session-expired pending stays failed (not silently saved)
    await teacherB.context.close();
    const owner2 = await openPage(browser, port, OWNER, {
      localActorId: "actor_owner_durable",
      programId: PROGRAM_A,
    });
    await seedChild(owner2.page);
    const sessionExpired = await owner2.page.evaluate(async () => {
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: "session-expired-1",
        record: {
          id: "meal-session-1",
          childId: "child-ava",
          date: dlcActiveDate(),
          lunch: "Session expire",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      const original = window.fetch;
      window.fetch = async (url, init = {}) => {
        if (String(url).includes("/api/child-data") && String(init.method || "").toUpperCase() === "POST") {
          return new Response(JSON.stringify({
            ok: false,
            failed: 1,
            applied: 0,
            results: [{
              ok: false,
              clientMutationId: "session-expired-1",
              authFailed: true,
              code: "forbidden",
              error: "Session expired",
            }],
          }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
        return original(url, init);
      };
      await saveChildDataToBackend({ force: true });
      window.fetch = original;
      const entry = childDataMutationQueue.find((m) => m.clientMutationId === "session-expired-1");
      return {
        status: dlcSaveStatus.state,
        entryStatus: entry?.status,
        remains: Boolean(entry),
        claimsSaved: dlcSaveStatus.state === "saved",
      };
    });
    assert.equal(sessionExpired.remains, true);
    assert.equal(sessionExpired.entryStatus, "failed");
    assert.equal(sessionExpired.status, "failed");
    assert.equal(sessionExpired.claimsSaved, false);
    console.log("PASS  session expired keeps failed pending work");

    // Corrupted / obsolete queue entries cleaned
    const cleanupCorrupt = await owner2.page.evaluate(async () => {
      const identity = childDataActorIdentity();
      await idbPutMutation({
        clientMutationId: "corrupt-no-date",
        userId: identity.userId,
        programId: identity.programId,
        scopeKey: identity.scopeKey,
        storeKey: "Meals",
        status: "pending",
        record: { lunch: "corrupt" },
      });
      await idbPutMutation({
        clientMutationId: "obsolete-old",
        userId: identity.userId,
        programId: identity.programId,
        scopeKey: identity.scopeKey,
        storeKey: "Meals",
        status: "pending",
        queuedAt: new Date(Date.now() - (20 * 24 * 60 * 60 * 1000)).toISOString(),
        record: { lunch: "too old" },
      });
      await idbPutMutation({
        clientMutationId: "wrong-scope",
        userId: "other-actor",
        programId: identity.programId,
        scopeKey: `other-actor::${identity.programId}`,
        storeKey: "Meals",
        status: "pending",
        queuedAt: new Date().toISOString(),
        record: { lunch: "wrong scope" },
      });
      await loadChildDataMutationQueue();
      return {
        hasCorrupt: childDataMutationQueue.some((m) => m.clientMutationId === "corrupt-no-date"),
        hasOld: childDataMutationQueue.some((m) => m.clientMutationId === "obsolete-old"),
        hasWrong: childDataMutationQueue.some((m) => m.clientMutationId === "wrong-scope"),
      };
    });
    assert.equal(cleanupCorrupt.hasCorrupt, false);
    assert.equal(cleanupCorrupt.hasOld, false);
    assert.equal(cleanupCorrupt.hasWrong, false);
    console.log("PASS  corrupted / obsolete / wrong-scope queue cleanup");

    // IndexedDB unavailable fails safely (no localStorage fallback)
    const idbFail = await owner2.page.evaluate(async () => {
      await discardChildDataMutation("session-expired-1").catch(() => {});
      childDataMutationIdbAvailable = false;
      const beforeKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) beforeKeys.push(localStorage.key(i));
      const id = enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: "idb-down-1",
        record: {
          id: "meal-idb-down",
          childId: "child-ava",
          date: dlcActiveDate(),
          lunch: "Should stay on screen",
          summary: "Should stay on screen",
        },
      });
      // Keep entry visibly on screen via local store write path
      saveChildStoreLocalOnly("Meals", [
        ...childStore("Meals").filter((m) => m.id !== "meal-idb-down"),
        {
          id: "meal-idb-down",
          childId: "child-ava",
          lunch: "Should stay on screen",
          summary: "Should stay on screen",
          date: dlcActiveDate(),
        },
      ]);
      const afterKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) afterKeys.push(localStorage.key(i));
      const newLs = afterKeys.filter((k) => !beforeKeys.includes(k) && String(k || "").startsWith("llhChildMutations:"));
      return {
        id,
        status: dlcSaveStatus.state,
        message: dlcSaveStatus.message,
        queued: childDataMutationQueue.some((m) => m.clientMutationId === "idb-down-1"),
        onScreen: (childStore("Meals").find((m) => m.id === "meal-idb-down") || {}).lunch,
        newLs,
      };
    });
    assert.equal(idbFail.id, "");
    assert.equal(idbFail.queued, false);
    assert.equal(idbFail.status, "failed");
    assert.match(String(idbFail.message || ""), /unavailable/i);
    assert.equal(idbFail.onScreen, "Should stay on screen");
    assert.equal(idbFail.newLs.length, 0);
    console.log("PASS  IndexedDB unavailable fails safely (no localStorage fallback)");

    // Queue cleanup after ack + retention policy constant
    const cleanup = await owner2.page.evaluate(async () => {
      childDataMutationIdbAvailable = true;
      const mid = "cleanup-mid-1";
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: mid,
        record: {
          id: "meal-cleanup-1",
          childId: "child-ava",
          date: dlcActiveDate(),
          lunch: "Cleanup",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      await saveChildDataToBackend({ force: true });
      const still = childDataMutationQueue.some((m) => m.clientMutationId === mid);
      const identity = childDataActorIdentity();
      let idbStill = false;
      try {
        const rows = await idbListMutationsForScope(identity.scopeKey);
        idbStill = rows.some((m) => m.clientMutationId === mid);
      } catch (_e) {
        idbStill = true;
      }
      return {
        still,
        idbStill,
        status: dlcSaveStatus.state,
        maxAgeMs: CHILD_MUTATION_MAX_AGE_MS,
      };
    });
    assert.equal(cleanup.still, false);
    assert.equal(cleanup.idbStill, false);
    assert.equal(cleanup.maxAgeMs, 14 * 24 * 60 * 60 * 1000);
    console.log("PASS  queue cleanup after ack; retention = 14 days");

    // Final proof: no child mutation keys in localStorage on shared device path
    const finalLs = await owner2.page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
      return keys.filter((k) => String(k || "").startsWith("llhChildMutations:"));
    });
    assert.equal(finalLs.length, 0);

    await owner2.context.close();
    console.log("ALL DURABLE QUEUE / HUMAN CONFLICT CHECKS PASSED");
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
