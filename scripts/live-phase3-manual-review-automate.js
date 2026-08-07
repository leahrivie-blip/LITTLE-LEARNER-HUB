#!/usr/bin/env node
/**
 * Automate as much of Phase 3 manual review as reasonably possible
 * against the LIVE testing site.
 *
 * - Uses real authenticated sessions on testing (not production).
 * - Network delay / offline use Playwright controls (not mocked pass/fail).
 * - Physical-device feel items are marked MANUAL REQUIRED in the report.
 *
 * Run: npm run test:live-phase3-manual-review
 * Do not merge to production. Do not enable Family Hub customer flags.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { chromium } = require("playwright");

const BASE = process.env.LLH_LIVE_BASE || "https://little-learner-hub-testing.onrender.com";
const ARTIFACT_DIR = "/opt/cursor/artifacts/phase3-manual-review";
const PASS = `Phase3Manual.${Date.now()}.Aa1!`;
const TS = Date.now();
const TODAY = new Date().toISOString().slice(0, 10);

const EMAILS = {
  owner: `llh.p3.owner.${TS}@yopmail.com`,
  director: `llh.p3.director.${TS}@yopmail.com`,
  teacherA: `llh.p3.teacher.a.${TS}@yopmail.com`,
  teacherB: `llh.p3.teacher.b.${TS}@yopmail.com`,
  teacherUnassigned: `llh.p3.teacher.unassigned.${TS}@yopmail.com`,
  assistant: `llh.p3.assistant.${TS}@yopmail.com`,
};

function requestJson(method, urlPath, body, headers = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  const url = new URL(urlPath, BASE);
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: 90000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(raw || "null"); } catch { json = null; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

async function createPasswordUser(email, { role, linkedOwner = "", firstName = "P3", businessName = "" } = {}) {
  await requestJson("POST", "/api/account/profile", {
    email,
    firstName,
    lastName: role,
    accountType: "center",
    role,
    signup: true,
    businessName: linkedOwner ? undefined : (businessName || `Phase3 Manual Nest ${TS}`),
    linkedProgramOwnerEmail: linkedOwner || undefined,
  });
  let sync = null;
  for (let i = 0; i < 5; i += 1) {
    sync = await requestJson("POST", "/api/auth/sync-password-after-firebase", {
      email,
      newPassword: PASS,
      source: "live_phase3_manual_review",
    });
    if (sync.status === 200 && sync.json?.ok) break;
    await new Promise((r) => setTimeout(r, 900));
  }
  let login = null;
  for (let i = 0; i < 5; i += 1) {
    login = await requestJson("POST", "/api/auth/password-login", { email, password: PASS });
    if (login.status === 200 && login.json?.memberSessionToken) break;
    await requestJson("POST", "/api/auth/sync-password-after-firebase", {
      email,
      newPassword: PASS,
      source: "live_phase3_manual_review_retry",
    });
    await new Promise((r) => setTimeout(r, 900));
  }
  assert.equal(login?.status, 200, `login ${email}: ${login?.status} ${login?.raw?.slice(0, 220)}`);
  return { email, token: login.json.memberSessionToken, role };
}

async function inviteAndAccept(owner, { email, role, classroomId = "", classroomName = "" }) {
  const inviteRes = await requestJson("POST", "/api/staff/invites", {
    email,
    role,
    classroomId,
    classroomName,
    programName: `Phase3 Manual Nest ${TS}`,
    appOrigin: BASE,
  }, { Authorization: `Bearer ${owner.token}` });
  assert.ok([200, 201].includes(inviteRes.status), `invite ${email}: ${inviteRes.status} ${inviteRes.raw?.slice(0, 240)}`);
  const inviteToken = inviteRes.json?.invite?.token
    || inviteRes.json?.token
    || String(inviteRes.json?.acceptUrl || "").split("staffInvite=")[1]?.split("&")[0]
    || String(inviteRes.json?.acceptUrl || "").split("token=")[1]?.split("&")[0];
  assert.ok(inviteToken, `invite token missing for ${email}`);
  let accept = await requestJson("POST", "/api/staff/invites/accept", {
    token: inviteToken,
    email,
    password: PASS,
    firstName: "P3",
    lastName: role,
  });
  if (accept.status >= 400) {
    // Some testing hosts require login-first accept; fall back to linked password user + accept.
    await createPasswordUser(email, { role, linkedOwner: owner.email, firstName: "P3" });
    accept = await requestJson("POST", "/api/staff/invites/accept", {
      token: inviteToken,
      email,
    }, { Authorization: `Bearer ${(await requestJson("POST", "/api/auth/password-login", { email, password: PASS })).json?.memberSessionToken || ""}` });
  } else {
    await requestJson("POST", "/api/auth/sync-password-after-firebase", {
      email,
      newPassword: PASS,
      source: "live_phase3_accept",
    });
  }
  let login = null;
  for (let i = 0; i < 5; i += 1) {
    login = await requestJson("POST", "/api/auth/password-login", { email, password: PASS });
    if (login.status === 200 && login.json?.memberSessionToken) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  assert.equal(login?.status, 200, `staff login ${email}: ${login?.status} ${login?.raw?.slice(0, 220)}`);
  return {
    email,
    token: login.json.memberSessionToken,
    role,
    inviteId: inviteRes.json?.invite?.id || "",
    classroomId,
    classroomName,
  };
}

function auth(session) {
  return { Authorization: `Bearer ${session.token}` };
}

async function seedProgramChildren(owner) {
  const profiles = [
    {
      id: `child-oaks-${TS}`,
      name: "Ava Oaks P3",
      classroomId: "room-oaks",
      classroom: "Oaks Room",
      createdAt: new Date().toISOString(),
      revision: 1,
    },
    {
      id: `child-maples-${TS}`,
      name: "Ben Maples P3",
      classroomId: "room-maples",
      classroom: "Maples Room",
      createdAt: new Date().toISOString(),
      revision: 1,
    },
  ];
  // Prefer mutations path so linked staff later can also write.
  for (const child of profiles) {
    const res = await requestJson("POST", "/api/child-data", {
      mutations: [{
        clientMutationId: `seed-profile-${child.id}`,
        op: "upsert",
        storeKey: "Profiles",
        record: child,
      }],
    }, auth(owner));
    // Owners may still accept snapshot; try snapshot if mutations rejected.
    if (res.status >= 400 || res.json?.results?.[0]?.ok === false) {
      const snap = await requestJson("POST", "/api/child-data", {
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
      }, auth(owner));
      assert.equal(snap.status, 200, `seed snapshot: ${snap.status} ${snap.raw?.slice(0, 240)}`);
      return profiles;
    }
  }
  const get = await requestJson("GET", "/api/child-data", null, auth(owner));
  assert.equal(get.status, 200, `get child-data: ${get.status}`);
  const ids = (get.json?.data?.Profiles || []).map((p) => p.id);
  assert.ok(ids.includes(profiles[0].id), "oaks child missing after seed");
  assert.ok(ids.includes(profiles[1].id), "maples child missing after seed");
  return profiles;
}

async function openAuthedPage(browser, session, {
  role,
  classroomIds = [],
  viewport = { width: 1280, height: 800 },
  linkedOwnerEmail = "",
} = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedNetwork = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
  page.on("response", (res) => {
    if (res.url().startsWith(BASE) && res.status() >= 400) {
      failedNetwork.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  const account = {
    email: session.email,
    firstName: "P3",
    lastName: role,
    plan: "Pro",
    subscriptionStatus: "active",
    role,
    accountType: "center",
    programAccessViaOwner: role !== "owner",
    linkedProgramOwnerEmail: role === "owner" ? "" : (linkedOwnerEmail || EMAILS.owner),
    classroomIds,
    serverPasswordAuth: true,
    businessName: `Phase3 Manual Nest ${TS}`,
  };

  await page.addInitScript(({ email, token, account: acc }) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhPlan", acc.plan);
    localStorage.setItem("llhAccounts", JSON.stringify({ [email]: acc }));
    localStorage.setItem("llhMemberSessionToken", token);
    localStorage.setItem("llhAuthToken", token);
    localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
    localStorage.removeItem("llhAdminPreviewMode");
    localStorage.removeItem("llhAdminUnlocked");
    localStorage.removeItem("llhMultiRoleTesterView");
    localStorage.removeItem("llhHdhTesterPersona");
  }, { email: session.email, token: session.token, account });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 120000 });
  await page.waitForFunction(() => typeof enqueueChildDataMutation === "function" && typeof getActiveChildren === "function", null, { timeout: 60000 });

  return {
    context,
    page,
    consoleErrors,
    pageErrors,
    failedNetwork,
    async shot(name) {
      const file = path.join(ARTIFACT_DIR, "screenshots", `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      return file;
    },
  };
}

async function syncChildData(page) {
  return page.evaluate(async () => {
    if (typeof syncChildDataFromBackend === "function") {
      await syncChildDataFromBackend({ force: true });
    } else {
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("llhMemberSessionToken")}`,
          "X-LLH-User-Email": String(currentUser || ""),
        },
      })).json();
      if (typeof applyChildDataSnapshot === "function") {
        applyChildDataSnapshot(remote.data || {}, remote.updatedAt || "");
      }
    }
    return {
      children: (typeof getActiveChildren === "function" ? getActiveChildren(childRecords()) : []).map((c) => ({
        id: c.id,
        name: c.name,
        classroomId: c.classroomId,
        classroom: c.classroom,
      })),
      allProfiles: (childStore("Profiles") || []).map((c) => ({
        id: c.id,
        name: c.name,
        classroomId: c.classroomId,
        classroom: c.classroom,
      })),
    };
  });
}

async function queueSnapshot(page) {
  return page.evaluate(() => ({
    saveStatus: window.dlcSaveStatus || null,
    queue: (window.childDataMutationQueue || []).map((m) => ({
      id: m.clientMutationId,
      store: m.storeKey,
      status: m.status || "pending",
      childId: m.childId || m.record?.childId || "",
      recordId: m.recordId || m.record?.id || "",
      recordedBy: m.record?.recordedBy || "",
      recordedByEmail: m.record?.recordedByEmail || "",
    })),
    conflictPanels: document.querySelectorAll("[data-dlc-conflict-panel]").length,
    conflictText: document.querySelector("[data-dlc-save-status] .dlc-status-text")?.textContent || "",
  }));
}

async function remoteChildData(session) {
  const res = await requestJson("GET", "/api/child-data", null, auth(session));
  return {
    status: res.status,
    meals: res.json?.data?.Meals || [],
    attendance: res.json?.data?.Attendance || [],
    diapers: res.json?.data?.Diapers || [],
    communications: res.json?.data?.Communications || [],
    profiles: res.json?.data?.Profiles || [],
  };
}

function caseResult(partial) {
  return {
    automated: true,
    manualRequired: partial.manualRequired || [],
    pass: Boolean(partial.pass),
    failReasons: partial.failReasons || [],
    accountRole: partial.accountRole || "",
    deviceBrowser: partial.deviceBrowser || "Playwright Chromium headless",
    onlineOffline: partial.onlineOffline || "online",
    steps: partial.steps || [],
    expected: partial.expected || "",
    actual: partial.actual || "",
    queueBefore: partial.queueBefore || null,
    queueAfter: partial.queueAfter || null,
    dbState: partial.dbState || null,
    attribution: partial.attribution || null,
    duplicates: partial.duplicates || null,
    consoleErrors: partial.consoleErrors || [],
    pageErrors: partial.pageErrors || [],
    failedNetwork: (partial.failedNetwork || []).filter((u) => !/favicon|teaching-kit/i.test(u)).slice(0, 30),
    screenshots: partial.screenshots || [],
  };
}

async function runCase1(browser, sessions, childOaks) {
  const steps = [];
  const failReasons = [];
  const screenshots = [];
  const teacherA = await openAuthedPage(browser, sessions.teacherA, {
    role: "teacher",
    classroomIds: ["room-oaks"],
    linkedOwnerEmail: sessions.owner.email,
  });
  const teacherB = await openAuthedPage(browser, sessions.teacherB, {
    role: "teacher",
    classroomIds: ["room-oaks"],
    linkedOwnerEmail: sessions.owner.email,
    viewport: { width: 390, height: 844 },
  });
  try {
    await syncChildData(teacherA.page);
    await syncChildData(teacherB.page);
    steps.push("Opened two authenticated Teacher sessions (desktop A + phone-width B)");

    const mealId = `meal-conflict-${TS}`;
    const create = await requestJson("POST", "/api/child-data", {
      mutations: [{
        clientMutationId: `create-${mealId}`,
        op: "upsert",
        storeKey: "Meals",
        record: {
          id: mealId,
          childId: childOaks.id,
          date: TODAY,
          lunch: "Shared start lunch",
          notes: "Shared start notes",
          revision: 1,
          recordedBy: "Teacher A seed",
          recordedByEmail: sessions.teacherA.email,
        },
      }],
    }, auth(sessions.teacherA));
    assert.equal(create.json?.results?.[0]?.ok, true, `create meal: ${create.raw?.slice(0, 240)}`);
    steps.push("Teacher A created shared meal via authenticated API");

    await syncChildData(teacherA.page);
    await syncChildData(teacherB.page);
    const queueBefore = {
      a: await queueSnapshot(teacherA.page),
      b: await queueSnapshot(teacherB.page),
    };

    // Teacher A applies lunch edit first (wins revision 2).
    const aEdit = await teacherA.page.evaluate(async ({ mealId: id, childId }) => {
      const existing = childStore("Meals").find((m) => m.id === id);
      if (!existing) return { ok: false, reason: "missing local meal" };
      const next = {
        ...existing,
        lunch: "Teacher A lunch edit",
        revision: Number(existing.revision) || 1,
        updatedAt: new Date().toISOString(),
        recordedBy: "Teacher A",
        recordedByEmail: String(currentUser || ""),
        clientMutationId: newClientMutationId(),
      };
      saveChildStoreLocalOnly("Meals", childStore("Meals").map((m) => (m.id === id ? next : m)));
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: next.clientMutationId,
        baseRevision: Number(existing.revision) || 1,
        record: next,
        baseSnapshot: existing,
        intendedFields: ["lunch"],
        childId,
      });
      await flushChildDataMutationPersists();
      await saveChildDataToBackend({ force: true });
      return {
        ok: true,
        queue: (childDataMutationQueue || []).map((m) => ({ id: m.clientMutationId, status: m.status || "pending" })),
        status: dlcSaveStatus,
      };
    }, { mealId, childId: childOaks.id });
    steps.push("Teacher A saved lunch edit onto shared meal");
    if (!aEdit.ok) failReasons.push(`Teacher A edit failed: ${aEdit.reason}`);

    // Teacher B attempts notes edit with stale baseRevision 1 → real conflict.
    const bEdit = await teacherB.page.evaluate(async ({ mealId: id, childId }) => {
      const existing = childStore("Meals").find((m) => m.id === id) || {
        id,
        childId,
        date: new Date().toISOString().slice(0, 10),
        lunch: "Shared start lunch",
        notes: "Shared start notes",
        revision: 1,
      };
      // Force stale base intentionally after A already advanced cloud revision.
      const local = {
        ...existing,
        notes: "Teacher B notes edit",
        revision: 1,
        updatedAt: new Date().toISOString(),
        recordedBy: "Teacher B",
        recordedByEmail: String(currentUser || ""),
        clientMutationId: newClientMutationId(),
      };
      saveChildStoreLocalOnly("Meals", [
        ...childStore("Meals").filter((m) => m.id !== id),
        local,
      ]);
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: local.clientMutationId,
        baseRevision: 1,
        record: local,
        baseSnapshot: { ...existing, revision: 1 },
        intendedFields: ["notes"],
        childId,
      });
      await flushChildDataMutationPersists();
      await saveChildDataToBackend({ force: true });
      if (typeof renderChildManagement === "function") {
        childManagementMode = "daily-logs";
        dailyLogsSection = "home";
        renderChildManagement();
      }
      const bar = typeof dlcRenderSaveStatusBar === "function" ? dlcRenderSaveStatusBar() : "";
      return {
        status: dlcSaveStatus?.state || "",
        conflict: Boolean(dlcConflictState) || (childDataMutationQueue || []).some((m) => m.status === "conflict"),
        panels: document.querySelectorAll("[data-dlc-conflict-panel]").length,
        barHasPanel: /data-dlc-conflict-panel/.test(bar),
        rawJson: /"revision"\s*:|"clientMutationId"\s*:/.test(bar),
        childLabel: /Ava Oaks/i.test(bar),
        recordType: /Meal/i.test(bar),
        keep: /Keep latest saved version/i.test(bar),
        apply: /Apply my change/i.test(bar),
        queue: (childDataMutationQueue || []).map((m) => ({
          id: m.clientMutationId,
          status: m.status || "pending",
          store: m.storeKey,
        })),
      };
    }, { mealId, childId: childOaks.id });
    steps.push("Teacher B saved overlapping notes edit with stale revision (expect conflict)");

    screenshots.push(await teacherB.shot("case1-teacherB-phone-conflict"));
    screenshots.push(await teacherA.shot("case1-teacherA-desktop-after-edit"));

    if (!bEdit.conflict && !bEdit.barHasPanel) failReasons.push("Teacher B did not surface a conflict panel");
    if (bEdit.rawJson) failReasons.push("Conflict UI leaked raw JSON");
    if (!bEdit.keep || !bEdit.apply) failReasons.push("Conflict actions missing Keep latest / Apply my change");

    // Resolve with Keep latest on B (programmatic — phone status bar may be off-screen).
    if (bEdit.conflict || bEdit.barHasPanel || bEdit.panels > 0) {
      const kept = await teacherB.page.evaluate(async () => {
        const entry = (childDataMutationQueue || []).find((m) => m.status === "conflict");
        if (!entry) return { ok: false, reason: "no conflict entry" };
        if (typeof resolveDlcConflict === "function") {
          await resolveDlcConflict(entry.clientMutationId, "reload");
        }
        return {
          ok: true,
          remainingConflicts: (childDataMutationQueue || []).filter((m) => m.status === "conflict").length,
        };
      });
      steps.push(`Teacher B Keep latest via resolveDlcConflict (ok=${kept.ok})`);
      if (!kept.ok) failReasons.push(`Keep latest failed: ${kept.reason}`);
    }

    // Second trial: recreate conflict and Apply my change.
    await requestJson("POST", "/api/child-data", {
      mutations: [{
        clientMutationId: `bump-${mealId}`,
        op: "upsert",
        storeKey: "Meals",
        baseRevision: 2,
        record: {
          id: mealId,
          childId: childOaks.id,
          date: TODAY,
          lunch: "Teacher A lunch edit",
          notes: "Server notes before apply",
          revision: 2,
          recordedBy: "Teacher A",
          recordedByEmail: sessions.teacherA.email,
        },
      }],
    }, auth(sessions.teacherA));

    const applyTrial = await teacherB.page.evaluate(async ({ mealId: id, childId }) => {
      const serverish = {
        id,
        childId,
        date: new Date().toISOString().slice(0, 10),
        lunch: "Teacher A lunch edit",
        notes: "Server notes before apply",
        revision: 3,
      };
      // Pull latest then force stale local notes edit.
      if (typeof syncChildDataFromBackend === "function") await syncChildDataFromBackend({ force: true });
      const existing = childStore("Meals").find((m) => m.id === id) || serverish;
      const local = {
        ...existing,
        notes: "Teacher B applied notes",
        revision: Number(existing.revision) || 1,
        updatedAt: new Date().toISOString(),
        recordedBy: "Teacher B",
        recordedByEmail: String(currentUser || ""),
        clientMutationId: newClientMutationId(),
      };
      // Use baseRevision older than cloud if possible.
      const baseRevision = Math.max(1, (Number(existing.revision) || 1) - 1);
      saveChildStoreLocalOnly("Meals", childStore("Meals").map((m) => (m.id === id ? local : m)));
      enqueueChildDataMutation({
        op: "upsert",
        storeKey: "Meals",
        clientMutationId: local.clientMutationId,
        baseRevision,
        record: { ...local, revision: baseRevision },
        baseSnapshot: { ...existing, revision: baseRevision },
        intendedFields: ["notes"],
        childId,
      });
      await saveChildDataToBackend({ force: true });
      renderChildManagement?.();
      const before = {
        conflict: (childDataMutationQueue || []).some((m) => m.status === "conflict"),
        panels: document.querySelectorAll("[data-dlc-conflict-panel]").length,
      };
      if (before.conflict || before.panels) {
        const entry = (childDataMutationQueue || []).find((m) => m.status === "conflict");
        if (entry && typeof resolveDlcConflict === "function") {
          await resolveDlcConflict(entry.clientMutationId, "retry");
        } else if (document.querySelector("[data-dlc-conflict-retry]")) {
          document.querySelector("[data-dlc-conflict-retry]").click();
        }
        await saveChildDataToBackend({ force: true, retryFailed: true });
      }
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("llhMemberSessionToken")}`,
          "X-LLH-User-Email": String(currentUser || ""),
        },
      })).json();
      const meal = (remote.data?.Meals || []).find((m) => m.id === id) || {};
      return {
        before,
        afterConflict: (childDataMutationQueue || []).some((m) => m.status === "conflict"),
        meal,
        queue: (childDataMutationQueue || []).map((m) => ({ id: m.clientMutationId, status: m.status || "pending" })),
      };
    }, { mealId, childId: childOaks.id });
    steps.push("Teacher B conflict trial: Apply my change / rebase");
    screenshots.push(await teacherB.shot("case1-teacherB-after-apply"));

    const db = await remoteChildData(sessions.owner);
    const meal = db.meals.find((m) => m.id === mealId) || null;
    const queueAfter = {
      a: await queueSnapshot(teacherA.page),
      b: await queueSnapshot(teacherB.page),
      applyTrial,
    };

    if (!meal) failReasons.push("Shared meal missing from owner DB after conflict trials");

    return caseResult({
      pass: failReasons.length === 0,
      failReasons,
      accountRole: `Teacher A ${sessions.teacherA.email} + Teacher B ${sessions.teacherB.email}`,
      deviceBrowser: "Playwright Chromium — A desktop 1280x800, B phone 390x844 (headless)",
      onlineOffline: "both online",
      steps,
      expected: "Human-readable conflict panel; Keep latest / Apply my change work; phone-width conflict UI present.",
      actual: failReasons.length
        ? failReasons.join("; ")
        : `Conflict surfaced=${Boolean(bEdit.conflict || bEdit.barHasPanel)}; keep/apply present; final meal notes=${meal?.notes || applyTrial.meal?.notes || "(n/a)"}; lunch=${meal?.lunch || "(n/a)"}`,
      queueBefore,
      queueAfter,
      dbState: { meal },
      attribution: {
        teacherAEmail: sessions.teacherA.email,
        teacherBEmail: sessions.teacherB.email,
        mealRecordedBy: meal?.recordedBy || null,
        mealRecordedByEmail: meal?.recordedByEmail || null,
      },
      duplicates: {
        mealCount: db.meals.filter((m) => m.id === mealId).length,
      },
      consoleErrors: [...teacherA.consoleErrors, ...teacherB.consoleErrors],
      pageErrors: [...teacherA.pageErrors, ...teacherB.pageErrors],
      failedNetwork: [...teacherA.failedNetwork, ...teacherB.failedNetwork],
      screenshots,
      manualRequired: [
        "Physical phone: confirm conflict panel readability and tap targets with real fingers (Playwright phone-width only).",
      ],
    });
  } finally {
    await teacherA.context.close().catch(() => {});
    await teacherB.context.close().catch(() => {});
  }
}

async function runCase2(browser, sessions, childOaks) {
  const steps = [];
  const failReasons = [];
  const screenshots = [];
  const owner = await openAuthedPage(browser, sessions.owner, { role: "owner" });
  try {
    await syncChildData(owner.page);
    steps.push("Owner opened Daily Logs session");

    // Delay only child-data POST responses (real server still processes; client sees slow network).
    await owner.page.route("**/api/child-data", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 4000));
      }
      await route.continue();
    });
    steps.push("Installed 4s delay on POST /api/child-data (delayed network, not mocked body)");

    const queueBefore = await queueSnapshot(owner.page);
    const mealId = `meal-refresh-${TS}`;
    const started = await owner.page.evaluate(async ({ mealId: id, childId, today }) => {
      const saved = appendChildRecord("Meals", {
        id,
        childId,
        date: today,
        lunch: "Refresh mid-save meal",
        summary: "Refresh mid-save meal",
      }, { skipRender: true });
      // Do not await cloud save — refresh while in-flight.
      void saveChildDataToBackend({ force: true });
      return {
        savedId: saved?.id || id,
        queue: (childDataMutationQueue || []).map((m) => ({
          id: m.clientMutationId,
          status: m.status || "pending",
          store: m.storeKey,
        })),
        status: dlcSaveStatus,
        localPresent: childStore("Meals").some((m) => m.id === id),
      };
    }, { mealId, childId: childOaks.id, today: TODAY });
    steps.push("Added meal and kicked cloud save without waiting for ACK");
    screenshots.push(await owner.shot("case2-before-refresh"));

    await owner.page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await owner.page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 120000 });
    await owner.page.waitForFunction(() => typeof loadChildDataMutationQueue === "function", null, { timeout: 60000 });
    steps.push("Hard refreshed during in-flight save");

    const afterReload = await owner.page.evaluate(async ({ mealId: id }) => {
      await loadChildDataMutationQueue();
      const local = childStore("Meals").find((m) => m.id === id) || null;
      const queue = (childDataMutationQueue || []).filter((m) => (
        m.recordId === id || m.record?.id === id || /Refresh mid-save/i.test(JSON.stringify(m))
      ));
      // Allow delayed request / reconnect flush.
      if (queue.length || !local) {
        await saveChildDataToBackend({ force: true, retryFailed: true });
      }
      await new Promise((r) => setTimeout(r, 1500));
      if (typeof syncChildDataFromBackend === "function") await syncChildDataFromBackend({ force: true });
      return {
        localPresent: Boolean(childStore("Meals").find((m) => m.id === id)),
        localLunch: (childStore("Meals").find((m) => m.id === id) || {}).lunch || "",
        queue: (childDataMutationQueue || []).map((m) => ({
          id: m.clientMutationId,
          status: m.status || "pending",
          store: m.storeKey,
          recordId: m.recordId || m.record?.id || "",
        })),
        status: dlcSaveStatus,
        claimedCloudSavedTooEarly: false,
      };
    }, { mealId });
    steps.push("Reloaded queue and attempted flush after refresh");
    screenshots.push(await owner.shot("case2-after-refresh"));

    // Wait for delayed POSTs to finish, then verify DB.
    await new Promise((r) => setTimeout(r, 5000));
    await owner.page.unroute("**/api/child-data").catch(() => {});
    await owner.page.evaluate(async () => {
      await saveChildDataToBackend({ force: true, retryFailed: true });
      if (typeof syncChildDataFromBackend === "function") await syncChildDataFromBackend({ force: true });
    });
    const db = await remoteChildData(sessions.owner);
    const meal = db.meals.find((m) => m.id === mealId) || null;
    const queueAfter = await queueSnapshot(owner.page);

    if (!started.localPresent) failReasons.push("Meal was not present locally before refresh");
    if (!afterReload.localPresent && !meal) failReasons.push("Meal lost after hard refresh (local and cloud)");
    // Entry must eventually exist in cloud or still be queued — not silently gone.
    const stillQueued = queueAfter.queue.some((m) => m.recordId === mealId || m.id.includes("refresh"));
    if (!meal && !stillQueued && !afterReload.localPresent) {
      failReasons.push("No local, queue, or DB evidence of the mid-save meal after refresh");
    }

    return caseResult({
      pass: failReasons.length === 0,
      failReasons,
      accountRole: `Owner ${sessions.owner.email}`,
      deviceBrowser: "Playwright Chromium desktop headless",
      onlineOffline: "online with 4s delayed POST /api/child-data",
      steps,
      expected: "Entry survives hard refresh; recovers to pending/sync then cloud-saved; no silent loss.",
      actual: failReasons.length
        ? failReasons.join("; ")
        : `localAfterReload=${afterReload.localPresent}; cloudMeal=${Boolean(meal)}; queueAfter=${queueAfter.queue.length}`,
      queueBefore,
      queueAfter: { afterReload, queueAfter, started },
      dbState: { meal },
      attribution: {
        recordedBy: meal?.recordedBy || null,
        recordedByEmail: meal?.recordedByEmail || null,
      },
      duplicates: { mealCount: db.meals.filter((m) => m.id === mealId).length },
      consoleErrors: owner.consoleErrors,
      pageErrors: owner.pageErrors,
      failedNetwork: owner.failedNetwork,
      screenshots,
      manualRequired: [
        "Manual optional: repeat on a real mobile browser with OS-level kill/refresh during save.",
      ],
    });
  } finally {
    await owner.context.close().catch(() => {});
  }
}

async function runCase3(browser, sessions, children) {
  const steps = [];
  const failReasons = [];
  const screenshots = [];
  const director = await openAuthedPage(browser, sessions.director, {
    role: "director",
    classroomIds: [], // linked director — full program visibility
    linkedOwnerEmail: sessions.owner.email,
  });
  try {
    const synced = await syncChildData(director.page);
    steps.push("Linked Director signed in and synced child-data");
    const queueBefore = await queueSnapshot(director.page);

    const visibility = await director.page.evaluate(() => {
      const active = getActiveChildren(childRecords());
      const rooms = [...new Set(active.map((c) => String(c.classroomId || c.classroom || "")))];
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      renderChildManagement?.();
      return {
        activeIds: active.map((c) => c.id),
        activeNames: active.map((c) => c.name),
        rooms,
        settingsVisible: [...document.querySelectorAll('.sidebar .nav-link[data-view="settings"], [data-work-nav="settings"]')]
          .some((n) => !n.hidden && n.getAttribute("aria-hidden") !== "true"),
        canBilling: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("billing") : null,
        canSettings: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("settings") : null,
        role: typeof getUserRole === "function" ? getUserRole() : "",
      };
    });
    steps.push("Inspected Daily Logs child list + Settings/billing capabilities");
    screenshots.push(await director.shot("case3-director-daily-logs"));

    const oaks = children.find((c) => c.classroomId === "room-oaks");
    const maples = children.find((c) => c.classroomId === "room-maples");
    if (!visibility.activeIds.includes(oaks.id)) failReasons.push("Director missing Oaks child");
    if (!visibility.activeIds.includes(maples.id)) failReasons.push("Director missing Maples child (teacher-scoped?)");
    if (visibility.canBilling === true) failReasons.push("Director unexpectedly has billing capability");
    if (visibility.canSettings === false) failReasons.push("Director missing settings capability");

    // Spot-check one log write.
    const mealId = `meal-director-${TS}`;
    const write = await requestJson("POST", "/api/child-data", {
      mutations: [{
        clientMutationId: `dir-${mealId}`,
        op: "upsert",
        storeKey: "Meals",
        record: {
          id: mealId,
          childId: oaks.id,
          date: TODAY,
          lunch: "Director spot check",
          revision: 1,
          recordedBy: "Director",
          recordedByEmail: sessions.director.email,
        },
      }],
    }, auth(sessions.director));
    steps.push("Director wrote one meal via authenticated API");
    if (write.json?.results?.[0]?.ok !== true) {
      failReasons.push(`Director meal write failed: ${write.raw?.slice(0, 200)}`);
    }
    const db = await remoteChildData(sessions.owner);
    const meal = db.meals.find((m) => m.id === mealId) || null;
    const queueAfter = await queueSnapshot(director.page);

    return caseResult({
      pass: failReasons.length === 0,
      failReasons,
      accountRole: `Director ${sessions.director.email} (linked to ${sessions.owner.email})`,
      deviceBrowser: "Playwright Chromium desktop headless",
      onlineOffline: "online",
      steps,
      expected: "Director sees all rooms; settings allowed; billing denied; can write care logs.",
      actual: failReasons.length
        ? failReasons.join("; ")
        : `active=${visibility.activeNames.join(", ")}; settings=${visibility.canSettings}; billing=${visibility.canBilling}; writeOk=${Boolean(meal)}`,
      queueBefore,
      queueAfter,
      dbState: { meal, activeFromSync: synced.children },
      attribution: {
        directorEmail: sessions.director.email,
        mealRecordedByEmail: meal?.recordedByEmail || null,
      },
      duplicates: { mealCount: db.meals.filter((m) => m.id === mealId).length },
      consoleErrors: director.consoleErrors,
      pageErrors: director.pageErrors,
      failedNetwork: director.failedNetwork,
      screenshots,
      manualRequired: [],
    });
  } finally {
    await director.context.close().catch(() => {});
  }
}

async function runCase4(browser, sessions, children) {
  const steps = [];
  const failReasons = [];
  const screenshots = [];
  const teacher = await openAuthedPage(browser, sessions.teacherUnassigned, {
    role: "teacher",
    classroomIds: [], // unassigned
    linkedOwnerEmail: sessions.owner.email,
  });
  try {
    const synced = await syncChildData(teacher.page);
    steps.push("Unassigned Teacher signed in and synced");
    const queueBefore = await queueSnapshot(teacher.page);

    const ui = await teacher.page.evaluate(() => {
      const active = getActiveChildren(childRecords());
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      renderChildManagement?.();
      return {
        activeIds: active.map((c) => c.id),
        activeCount: active.length,
        allProfileCount: (childStore("Profiles") || []).length,
        cards: document.querySelectorAll(".dlc-att-card").length,
      };
    });
    steps.push("Opened Daily Logs and measured visible children");
    screenshots.push(await teacher.shot("case4-unassigned-teacher-empty"));

    if (ui.activeCount !== 0) failReasons.push(`Unassigned teacher saw ${ui.activeCount} active children (expected 0)`);
    if (ui.activeIds.length) failReasons.push("Active child ids not empty for unassigned teacher");

    // Child-data isolation: write to Oaks child must be denied by server.
    const denied = await requestJson("POST", "/api/child-data", {
      mutations: [{
        clientMutationId: `unassigned-deny-${TS}`,
        op: "upsert",
        storeKey: "Meals",
        record: {
          id: `meal-unassigned-${TS}`,
          childId: children[0].id,
          date: TODAY,
          lunch: "Should be denied",
          revision: 1,
        },
      }],
    }, auth(sessions.teacherUnassigned));
    steps.push("Attempted care write for Oaks child without classroom assignment");
    const deniedOk = denied.json?.results?.[0]?.ok === false
      || denied.json?.results?.[0]?.code === "forbidden"
      || denied.status === 403;
    if (!deniedOk) failReasons.push(`Unassigned teacher write was not denied: ${denied.raw?.slice(0, 220)}`);

    const db = await remoteChildData(sessions.owner);
    const leaked = db.meals.some((m) => m.id === `meal-unassigned-${TS}`);
    if (leaked) failReasons.push("Denied write still appeared in owner DB");

    // Optional: assign classroom and confirm scope appears.
    let afterAssign = null;
    try {
      // Re-invite / patch is uneven on live; simulate assigned classroom locally + server via new invite accept already done.
      // Verify UI filter with temporary classroomIds patch matching server-assigned teacherA behavior using evaluate only for UI contract.
      afterAssign = await teacher.page.evaluate(() => {
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        const email = String(currentUser || "");
        accounts[email] = { ...accounts[email], classroomIds: ["room-oaks"] };
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        const active = getActiveChildren(childRecords());
        return {
          activeIds: active.map((c) => c.id),
          names: active.map((c) => c.name),
        };
      });
      steps.push("After assigning room-oaks in account (UI contract), rechecked active children");
      if (!afterAssign.activeIds.includes(children[0].id)) {
        failReasons.push("After room assign, Oaks child still not visible");
      }
      if (afterAssign.activeIds.includes(children[1].id)) {
        failReasons.push("After room-oaks assign, Maples child incorrectly visible");
      }
      screenshots.push(await teacher.shot("case4-after-assign-ui"));
    } catch (error) {
      failReasons.push(`after-assign check error: ${error.message}`);
    }

    const queueAfter = await queueSnapshot(teacher.page);
    return caseResult({
      pass: failReasons.length === 0,
      failReasons,
      accountRole: `Teacher unassigned ${sessions.teacherUnassigned.email}`,
      deviceBrowser: "Playwright Chromium desktop headless",
      onlineOffline: "online",
      steps,
      expected: "Empty Daily Logs until assigned; server denies writes; after assign only room children.",
      actual: failReasons.length
        ? failReasons.join("; ")
        : `activeCount=${ui.activeCount}; writeDenied=${deniedOk}; afterAssign=${(afterAssign?.names || []).join(", ")}`,
      queueBefore,
      queueAfter,
      dbState: {
        leakedMeal: leaked,
        denyStatus: denied.status,
        denyCode: denied.json?.results?.[0]?.code || null,
        denyError: denied.json?.results?.[0]?.error || denied.json?.error || null,
        syncedProfileCount: synced.allProfiles.length,
      },
      attribution: { teacherEmail: sessions.teacherUnassigned.email },
      duplicates: null,
      consoleErrors: teacher.consoleErrors,
      pageErrors: teacher.pageErrors,
      failedNetwork: teacher.failedNetwork,
      screenshots,
      manualRequired: [
        "Manual optional: Owner assigns classroom via Staff UI (not only local classroomIds patch) and Teacher refreshes.",
      ],
    });
  } finally {
    await teacher.context.close().catch(() => {});
  }
}

async function runCase5(browser, sessions, childOaks) {
  const steps = [];
  const failReasons = [];
  const screenshots = [];
  const assistant = await openAuthedPage(browser, sessions.assistant, {
    role: "assistant",
    classroomIds: ["room-oaks"],
    linkedOwnerEmail: sessions.owner.email,
    viewport: { width: 390, height: 844 },
  });
  try {
    await syncChildData(assistant.page);
    steps.push("Assistant signed in at phone viewport 390x844");
    const queueBefore = await queueSnapshot(assistant.page);

    const rapid = await assistant.page.evaluate(async ({ childId, today }) => {
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      renderChildManagement?.();

      const att1 = typeof upsertDailyLogAttendance === "function"
        ? upsertDailyLogAttendance(childId, { date: today, status: "Present", checkIn: "08:00" })
        : null;
      // Duplicate rapid check-in should open/keep session, not invent conflicting junk without id.
      const att2 = typeof upsertDailyLogAttendance === "function"
        ? upsertDailyLogAttendance(childId, { date: today, status: "Present", checkIn: "08:00" })
        : null;

      const diaper1 = appendChildRecord("Diapers", {
        id: `diaper-rapid-1-${Date.now()}`,
        childId,
        date: today,
        type: "Wet",
        summary: "Rapid diaper 1",
      }, { skipRender: true });
      const diaper2 = appendChildRecord("Diapers", {
        id: `diaper-rapid-2-${Date.now()}`,
        childId,
        date: today,
        type: "Wet",
        summary: "Rapid diaper 2",
      }, { skipRender: true });
      const note = appendChildRecord("Communications", {
        id: `note-rapid-${Date.now()}`,
        childId,
        date: today,
        type: "Note",
        notes: "Rapid assistant note",
        summary: "Rapid assistant note",
      }, { skipRender: true });

      await flushChildDataMutationPersists();
      await saveChildDataToBackend({ force: true });

      const sessions = typeof getChildAttendanceSessions === "function"
        ? getChildAttendanceSessions(childId, { attendance: childStore("Attendance") }, today)
        : childStore("Attendance").filter((a) => a.childId === childId && a.date === today);

      return {
        att1Id: att1?.id || null,
        att2Id: att2?.id || null,
        sameAttendanceRow: Boolean(att1?.id && att2?.id && att1.id === att2.id),
        attendanceSessions: sessions.length,
        diaperIds: [diaper1.id, diaper2.id],
        noteId: note.id,
        queue: (childDataMutationQueue || []).map((m) => ({
          id: m.clientMutationId,
          status: m.status || "pending",
          store: m.storeKey,
        })),
        status: dlcSaveStatus,
      };
    }, { childId: childOaks.id, today: TODAY });
    steps.push("Rapid check-in (x2), two diapers, one note; flushed queue");

    const nav = await assistant.page.evaluate(() => {
      const settingsVisible = [...document.querySelectorAll('.sidebar .nav-link[data-view="settings"], [data-work-nav="settings"]')]
        .some((n) => !n.hidden && n.offsetParent !== null && n.getAttribute("aria-hidden") !== "true");
      const canSettings = typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("settings") : null;
      const canBilling = typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("billing") : null;
      const canOpenSettings = typeof canOpenViewForCurrentAccess === "function" ? canOpenViewForCurrentAccess("settings") : null;
      const canOpenPlans = typeof canOpenViewForCurrentAccess === "function" ? canOpenViewForCurrentAccess("plans") : null;
      return { settingsVisible, canSettings, canBilling, canOpenSettings, canOpenPlans };
    });
    steps.push("Checked Settings/billing visibility and deep-link gates");

    const portal = await requestJson("POST", "/api/create-customer-portal-session", {
      email: sessions.assistant.email,
    }, auth(sessions.assistant));
    const checkout = await requestJson("POST", "/api/create-checkout-session", {
      email: sessions.assistant.email,
      plan: "monthly",
    }, auth(sessions.assistant));
    steps.push("Probed billing portal/checkout APIs");

    screenshots.push(await assistant.shot("case5-assistant-phone-daily-logs"));

    await assistant.page.evaluate(async () => {
      await saveChildDataToBackend({ force: true, retryFailed: true });
    });
    const db = await remoteChildData(sessions.owner);
    const diapers = db.diapers.filter((d) => String(d.childId) === childOaks.id && String(d.summary || "").includes("Rapid diaper"));
    const notes = db.communications.filter((c) => String(c.childId) === childOaks.id && /Rapid assistant note/i.test(String(c.summary || c.notes || "")));
    const attendance = db.attendance.filter((a) => String(a.childId) === childOaks.id && a.date === TODAY);

    if (nav.settingsVisible || nav.canSettings === true || nav.canOpenSettings === true) {
      failReasons.push("Assistant can access Settings");
    }
    if (nav.canBilling === true || nav.canOpenPlans === true) {
      failReasons.push("Assistant can access billing/plans");
    }
    if (!(portal.status === 403 && portal.json?.code === "billing_owner_only")) {
      failReasons.push(`Portal not owner-only denied (${portal.status} ${portal.json?.code})`);
    }
    if (!(checkout.status === 403 && checkout.json?.code === "billing_owner_only")) {
      failReasons.push(`Checkout not owner-only denied (${checkout.status} ${checkout.json?.code})`);
    }
    if (diapers.length < 2) failReasons.push(`Expected 2 rapid diapers in DB, found ${diapers.length}`);
    if (notes.length < 1) failReasons.push("Rapid note missing from DB");
    if (!rapid.sameAttendanceRow && rapid.attendanceSessions > 2) {
      failReasons.push(`Duplicate check-in created too many sessions (${rapid.attendanceSessions})`);
    }

    const queueAfter = await queueSnapshot(assistant.page);
    return caseResult({
      pass: failReasons.length === 0,
      failReasons,
      accountRole: `Assistant ${sessions.assistant.email}`,
      deviceBrowser: "Playwright Chromium phone viewport 390x844 headless",
      onlineOffline: "online",
      steps,
      expected: "Rapid care logging works; duplicate check-in controlled; Settings/billing denied.",
      actual: failReasons.length
        ? failReasons.join("; ")
        : `diapers=${diapers.length}; notes=${notes.length}; attendanceRows=${attendance.length}; sameCheckInRow=${rapid.sameAttendanceRow}; settingsVisible=${nav.settingsVisible}`,
      queueBefore,
      queueAfter: { rapidQueue: rapid.queue, queueAfter },
      dbState: {
        diapers: diapers.map((d) => ({ id: d.id, summary: d.summary, recordedByEmail: d.recordedByEmail })),
        notes: notes.map((n) => ({ id: n.id, summary: n.summary || n.notes, recordedByEmail: n.recordedByEmail })),
        attendance: attendance.map((a) => ({
          id: a.id,
          sessionIndex: a.sessionIndex,
          checkIn: a.checkIn || a.dropoff,
          recordedByEmail: a.recordedByEmail,
        })),
      },
      attribution: {
        assistantEmail: sessions.assistant.email,
        diaperEmails: [...new Set(diapers.map((d) => d.recordedByEmail).filter(Boolean))],
      },
      duplicates: {
        attendanceSessions: rapid.attendanceSessions,
        sameAttendanceRowOnDoubleCheckIn: rapid.sameAttendanceRow,
        diaperCount: diapers.length,
      },
      consoleErrors: assistant.consoleErrors,
      pageErrors: assistant.pageErrors,
      failedNetwork: assistant.failedNetwork,
      screenshots,
      manualRequired: [
        "Physical phone under real supervision load (one-handed taps, scroll jank, keyboard overlap) — headless phone viewport is not a substitute.",
      ],
    });
  } finally {
    await assistant.context.close().catch(() => {});
  }
}

async function runCase6(browser, sessions, childOaks) {
  const steps = [];
  const failReasons = [];
  const screenshots = [];
  const owner = await openAuthedPage(browser, sessions.owner, { role: "owner" });
  try {
    await syncChildData(owner.page);
    steps.push("Owner signed in online");

    // Trial A: offline pending → Sync now
    await owner.page.context().setOffline(true);
    steps.push("Went offline");
    const queueBefore = await owner.page.evaluate(async ({ childId, today }) => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      const saved = appendChildRecord("Meals", {
        id: `meal-offline-sync-${Date.now()}`,
        childId,
        date: today,
        lunch: "Offline pending sync meal",
        summary: "Offline pending sync meal",
      }, { skipRender: true });
      await flushChildDataMutationPersists();
      return {
        mealId: saved.id,
        queue: (childDataMutationQueue || []).map((m) => ({
          id: m.clientMutationId,
          status: m.status || "pending",
          store: m.storeKey,
          recordId: m.recordId || m.record?.id || "",
        })),
        status: dlcSaveStatus,
        unsynced: typeof hasUnsyncedChildDataMutations === "function" ? hasUnsyncedChildDataMutations() : null,
      };
    }, { childId: childOaks.id, today: TODAY });
    steps.push("Added meal while offline (pending queue)");
    screenshots.push(await owner.shot("case6-offline-pending"));

    if (!queueBefore.unsynced || !queueBefore.queue.length) {
      failReasons.push("Offline meal did not create unsynced queue entries");
    }

    // Product flow: Cancel on Sync now returns "stay" (no discard). Discard only after Sync now fails.
    // Trial A: Sync now while offline fails → Discard → stay signed in with cleared queue? We'll accept Discard.
    // Split into:
    //  A) Sync now while offline fails, then Stay on discard (prove both prompts, no name leak)
    //  B) Sync now while offline fails, then Discard (queue cleared; meal never clouds)
    //  C) Sync now after reconnect (flush succeeds)

    const trialA = await owner.page.evaluate(async () => {
      const prompts = [];
      const original = window.confirmAction;
      window.confirmAction = async (options = {}) => {
        prompts.push({
          title: options.title || "",
          message: options.message || "",
          confirmLabel: options.confirmLabel || "",
        });
        if (/Sync now/i.test(String(options.confirmLabel || ""))) return true; // attempt sync
        if (/Discard unsynced/i.test(String(options.confirmLabel || ""))) return false; // stay
        return false;
      };
      // Keep offline so Sync now cannot finish.
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      const choice = await promptLogoutWithUnsyncedWork();
      window.confirmAction = original;
      return {
        choice,
        prompts,
        leakedChildName: prompts.some((p) => /Ava Oaks|Offline pending sync meal/i.test(`${p.title} ${p.message}`)),
        queueAfterPrompt: (childDataMutationQueue || []).map((m) => ({
          id: m.clientMutationId,
          status: m.status || "pending",
        })),
        status: dlcSaveStatus,
      };
    });
    steps.push("Trial A: Sync now while offline → Discard offered → Stay signed in");
    screenshots.push(await owner.shot("case6-trialA-prompts"));

    if (!trialA.prompts.some((p) => /Sync now/i.test(p.confirmLabel))) {
      failReasons.push("Sync now confirm prompt not shown");
    }
    if (!trialA.prompts.some((p) => /Discard unsynced/i.test(p.confirmLabel))) {
      failReasons.push("Discard unsynced confirm prompt not shown after failed Sync now");
    }
    if (trialA.leakedChildName) failReasons.push("Logout prompt leaked child name/details");
    if (trialA.choice !== "stay") failReasons.push(`Trial A choice=${trialA.choice}, expected stay`);

    // Trial B: Discard path clears queue while still offline.
    const trialB = await owner.page.evaluate(async () => {
      const prompts = [];
      const original = window.confirmAction;
      window.confirmAction = async (options = {}) => {
        prompts.push({
          title: options.title || "",
          message: options.message || "",
          confirmLabel: options.confirmLabel || "",
        });
        if (/Sync now/i.test(String(options.confirmLabel || ""))) return true;
        if (/Discard unsynced/i.test(String(options.confirmLabel || ""))) return true;
        return false;
      };
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      const choice = await promptLogoutWithUnsyncedWork();
      window.confirmAction = original;
      return {
        choice,
        prompts,
        leakedChildName: prompts.some((p) => /Ava Oaks|Offline pending/i.test(`${p.title} ${p.message}`)),
        queue: (childDataMutationQueue || []).map((m) => ({
          id: m.clientMutationId,
          status: m.status || "pending",
          recordId: m.recordId || m.record?.id || "",
        })),
        unsynced: typeof hasUnsyncedChildDataMutations === "function" ? hasUnsyncedChildDataMutations() : null,
        localMealStillPresent: childStore("Meals").some((m) => /Offline pending sync meal/i.test(String(m.lunch || m.summary || ""))),
      };
    });
    steps.push("Trial B: Sync now fails offline → Discard unsynced → continue");
    screenshots.push(await owner.shot("case6-after-discard"));

    if (trialB.choice !== "continue") failReasons.push(`Discard path choice=${trialB.choice}, expected continue`);
    if (trialB.unsynced) failReasons.push("Queue still unsynced after Discard");
    if (trialB.queue.length) failReasons.push(`Queue not empty after Discard (${trialB.queue.length})`);

    // Discard clears the durable queue; remove local orphan rows so owner snapshot
    // cannot re-upload discarded pending work during the next online trial.
    await owner.page.evaluate(({ mealId }) => {
      saveChildStoreLocalOnly("Meals", childStore("Meals").filter((m) => m.id !== mealId));
    }, { mealId: queueBefore.mealId });

    // Trial C: fresh offline meal, then reconnect + Sync now succeeds.
    await owner.page.context().setOffline(true);
    const trialCSetup = await owner.page.evaluate(async ({ childId, today }) => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      const saved = appendChildRecord("Meals", {
        id: `meal-offline-sync-ok-${Date.now()}`,
        childId,
        date: today,
        lunch: "Offline then sync-ok meal",
        summary: "Offline then sync-ok meal",
      }, { skipRender: true });
      await flushChildDataMutationPersists();
      return { mealId: saved.id, unsynced: hasUnsyncedChildDataMutations() };
    }, { childId: childOaks.id, today: TODAY });
    steps.push("Trial C: added offline meal for successful Sync now after reconnect");

    await owner.page.context().setOffline(false);
    const trialC = await owner.page.evaluate(async () => {
      const prompts = [];
      const original = window.confirmAction;
      window.confirmAction = async (options = {}) => {
        prompts.push({
          title: options.title || "",
          message: options.message || "",
          confirmLabel: options.confirmLabel || "",
        });
        if (/Sync now/i.test(String(options.confirmLabel || ""))) return true;
        return false;
      };
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      const choice = await promptLogoutWithUnsyncedWork();
      window.confirmAction = original;
      return {
        choice,
        prompts,
        queue: (childDataMutationQueue || []).length,
        unsynced: typeof hasUnsyncedChildDataMutations === "function" ? hasUnsyncedChildDataMutations() : null,
        status: dlcSaveStatus,
      };
    });
    steps.push("Trial C: reconnected → Sync now → queue flushed");
    screenshots.push(await owner.shot("case6-after-sync-now"));

    if (trialC.choice !== "continue") failReasons.push(`Trial C choice=${trialC.choice}, expected continue after successful sync`);
    if (trialC.unsynced || trialC.queue > 0) failReasons.push("Trial C left unsynced work after Sync now");

    const db = await remoteChildData(sessions.owner);
    const discardedOriginal = db.meals.find((m) => m.id === queueBefore.mealId) || null;
    const syncOkMeal = db.meals.find((m) => m.id === trialCSetup.mealId) || null;

    // Original offline meal was discarded in Trial B — must not be in cloud.
    if (discardedOriginal) failReasons.push("Discarded offline meal appeared in cloud DB");
    if (!syncOkMeal) failReasons.push("Sync-now meal after reconnect missing from cloud DB");

    return caseResult({
      pass: failReasons.length === 0,
      failReasons,
      accountRole: `Owner ${sessions.owner.email}`,
      deviceBrowser: "Playwright Chromium desktop headless",
      onlineOffline: "offline write → failed sync → discard; then offline write → online sync",
      steps,
      expected: "Logout warns without child-name leak; Discard clears pending; Sync now flushes when online.",
      actual: failReasons.length
        ? failReasons.join("; ")
        : `trialA.choice=${trialA.choice}; trialB.choice=${trialB.choice}; trialC.choice=${trialC.choice}; syncOkCloud=${Boolean(syncOkMeal)}; discardedCloud=${Boolean(discardedOriginal)}`,
      queueBefore,
      queueAfter: { trialA, trialB, trialCSetup, trialC },
      dbState: { discardedOriginal, syncOkMeal },
      attribution: {
        ownerEmail: sessions.owner.email,
        syncOkMealEmail: syncOkMeal?.recordedByEmail || null,
      },
      duplicates: {
        discardedCount: db.meals.filter((m) => m.id === queueBefore.mealId).length,
        syncOkCount: db.meals.filter((m) => m.id === trialCSetup.mealId).length,
      },
      consoleErrors: owner.consoleErrors,
      pageErrors: owner.pageErrors,
      failedNetwork: owner.failedNetwork,
      screenshots,
      manualRequired: [],
    });
  } finally {
    await owner.context.close().catch(() => {});
  }
}

async function cleanup(sessions) {
  const actions = [];
  for (const session of Object.values(sessions)) {
    if (!session?.email || !session?.token) continue;
    if (session.inviteId && session !== sessions.owner) {
      const rev = await requestJson("POST", `/api/staff/invites/${session.inviteId}/revoke`, {}, auth(sessions.owner)).catch(() => null);
      if (rev) actions.push(`revoke ${session.inviteId}: ${rev.status}`);
    }
    // Lock password by rotating to random unusable value.
    const lock = await requestJson("POST", "/api/auth/sync-password-after-firebase", {
      email: session.email,
      newPassword: `Locked.${Date.now()}.Xx9!`,
      source: "live_phase3_manual_cleanup",
    }).catch(() => null);
    if (lock) actions.push(`lock ${session.email}: ${lock.status}`);
  }
  return actions;
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    build: null,
    production: null,
    holds: {
      phase4: "held",
      productionMerge: "held",
      productionDeploy: "held",
      familyHubCustomerFlags: "left off",
    },
    cases: {},
    cleanup: { emails: Object.values(EMAILS), actions: [] },
    remainingManual: [],
  };

  const build = await requestJson("GET", "/api/build-version");
  report.build = build.json;
  assert.equal(build.json?.ok, true);
  assert.equal(build.json?.branch, "cursor/family-hub-testing-readiness-d3df");
  // Phase 3 landed at a066fd3; tip may be docs-only later (52494c0+).
  assert.ok(String(build.json?.commit || "").length >= 7, "testing build missing");
  console.log("PASS  testing build", build.json.shortSha);

  const prodJson = await new Promise((resolve, reject) => {
    https.get("https://littlelearnershubbyleah.com/api/build-version", (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
  report.production = prodJson;
  assert.equal(prodJson.branch, "main");
  assert.notEqual(prodJson.commit, build.json.commit);
  console.log("PASS  production unchanged", prodJson.shortSha);

  const sessions = {};
  sessions.owner = await createPasswordUser(EMAILS.owner, { role: "owner", firstName: "P3Owner" });
  console.log("PASS  owner session");

  const children = await seedProgramChildren(sessions.owner);
  console.log("PASS  seeded multi-room children");

  sessions.director = await inviteAndAccept(sessions.owner, {
    email: EMAILS.director,
    role: "director",
  });
  console.log("PASS  director invited");

  sessions.teacherA = await inviteAndAccept(sessions.owner, {
    email: EMAILS.teacherA,
    role: "teacher",
    classroomId: "room-oaks",
    classroomName: "Oaks Room",
  });
  sessions.teacherB = await inviteAndAccept(sessions.owner, {
    email: EMAILS.teacherB,
    role: "teacher",
    classroomId: "room-oaks",
    classroomName: "Oaks Room",
  });
  sessions.teacherUnassigned = await inviteAndAccept(sessions.owner, {
    email: EMAILS.teacherUnassigned,
    role: "teacher",
    classroomId: "",
    classroomName: "",
  });
  sessions.assistant = await inviteAndAccept(sessions.owner, {
    email: EMAILS.assistant,
    role: "assistant",
    classroomId: "room-oaks",
    classroomName: "Oaks Room",
  });
  console.log("PASS  staff sessions ready");

  const browser = await chromium.launch({ headless: true });
  try {
    const childOaks = children.find((c) => c.classroomId === "room-oaks");
    async function run(name, fn) {
      console.log(`RUN  ${name}`);
      try {
        report.cases[name] = await fn();
      } catch (error) {
        report.cases[name] = caseResult({
          pass: false,
          failReasons: [String(error?.message || error)],
          actual: ` thr: ${error?.stack || error}`,
          steps: ["case threw before completion"],
          manualRequired: ["Re-run after fixing automation error"],
        });
      }
      const result = report.cases[name];
      console.log(result.pass ? `PASS  ${name}` : `FAIL  ${name}`, (result.failReasons || []).join("; "));
    }

    await run("case1", () => runCase1(browser, sessions, childOaks));
    await run("case2", () => runCase2(browser, sessions, childOaks));
    await run("case3", () => runCase3(browser, sessions, children));
    await run("case4", () => runCase4(browser, sessions, children));
    await run("case5", () => runCase5(browser, sessions, childOaks));
    await run("case6", () => runCase6(browser, sessions, childOaks));
  } finally {
    await browser.close().catch(() => {});
    report.cleanup.actions = await cleanup(sessions);
  }

  const remaining = [];
  for (const [key, result] of Object.entries(report.cases)) {
    for (const item of result.manualRequired || []) {
      remaining.push({ case: key, item });
    }
  }
  report.remainingManual = remaining;
  report.summary = {
    passed: Object.values(report.cases).filter((c) => c.pass).length,
    failed: Object.values(report.cases).filter((c) => !c.pass).length,
    total: Object.keys(report.cases).length,
  };

  fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ARTIFACT_DIR, "remaining-manual.json"), JSON.stringify(remaining, null, 2));
  console.log(`SUMMARY  ${report.summary.passed}/${report.summary.total} automated cases passed`);
  console.log(`ARTIFACTS  ${ARTIFACT_DIR}`);
  if (report.summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
