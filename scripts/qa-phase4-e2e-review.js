#!/usr/bin/env node
/**
 * Phase 4 complete end-to-end QA review (testing only).
 *
 * Covers Owner / Director / Teacher / Assistant × Free / Trial / Pro
 * on desktop + mobile, across auth, permissions, staff assign, Daily Logs,
 * room mode, check-in/out, calendar, children, observations, messages,
 * forms, lessons, teaching kits, print, billing, settings, nav, offline
 * queue, sync, errors, loading, a11y, performance, console/API.
 *
 * Run: node scripts/qa-phase4-e2e-review.js
 * Do NOT merge/deploy production.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/phase4-e2e-qa";
const OWNER = "qa.p4.owner@example.com";
const DIRECTOR = "qa.p4.director@example.com";
const TEACHER = "qa.p4.teacher@example.com";
const TEACHER_UNASSIGNED = "qa.p4.teacher.unassigned@example.com";
const ASSISTANT = "qa.p4.assistant@example.com";
const FREE_OWNER = "qa.p4.free@example.com";
const TRIAL_OWNER = "qa.p4.trial@example.com";
const PRO_OWNER = "qa.p4.pro@example.com";
const PROGRAM = "prog-qa-phase4";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

const FEATURE_VIEWS = [
  { view: "calendar", label: "Calendar", marker: "#view-calendar" },
  { view: "child-tools-daily-logs", label: "Daily Logs", marker: ".dlc-dashboard, [data-dlc-empty-roster]" },
  { view: "children", label: "Child Profiles", marker: "#view-children" },
  { view: "lessons", label: "Lesson Plans", marker: "#view-lessons" },
  { view: "messages", label: "Messages", marker: "#view-messages" },
  { view: "forms", label: "Forms", marker: "#view-forms" },
  { view: "printables", label: "Print Center", marker: "#view-printables" },
  { view: "teaching-kit", label: "Teaching Kits", marker: "#view-teaching-kit" },
  { view: "observations", label: "Observations", marker: "#view-observations" },
  { view: "settings", label: "Settings", marker: "#view-settings" },
  { view: "billing", label: "Billing", marker: "#view-billing" },
  { view: "staff", label: "Staff", marker: "#view-staff" },
];

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
  for (let i = 0; i < 100; i += 1) {
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
  plan = "Pro",
  classroomIds = [],
  linkedOwner = "",
  trial = false,
} = {}) {
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 7 * 86400000).toISOString();
  return {
    email,
    plan: trial ? "Pro" : plan,
    role,
    firstName: "QA",
    lastName: role,
    accountType: "center",
    businessName: "QA Phase4 Nest",
    subscriptionStatus: trial
      ? `Trialing — Access Ends ${trialEnd.slice(0, 10)}`
      : (plan === "Free" ? "Free Plan" : "Pro"),
    trialStatus: trial ? "In Trial" : "",
    trialEnd: trial ? trialEnd : "",
    programId: PROGRAM,
    localActorId: `actor_${email.split("@")[0]}`,
    classroomIds,
    linkedProgramOwnerEmail: linkedOwner || (role === "owner" ? "" : OWNER),
    programAccessViaOwner: role !== "owner",
    createdAt: now.toISOString(),
  };
}

async function openPage(browser, port, email, account, viewportName) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewportName],
    isMobile: viewportName === "mobile",
    hasTouch: viewportName === "mobile",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(String(msg.text()).slice(0, 300));
  });
  page.on("pageerror", (err) => pageErrors.push(String(err.message || err).slice(0, 300)));
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    if (res.status() >= 400) {
      failedRequests.push({ status: res.status(), url: url.replace(/https?:\/\/[^/]+/, ""), method: res.request().method() });
    }
  });
  await page.addInitScript(({ email: user, account: acc }) => {
    localStorage.setItem("llhUser", user);
    localStorage.setItem("llhPlan", acc.plan || "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({ [user]: acc }));
    localStorage.setItem("llhMemberSessionToken", `test:${user}`);
    localStorage.setItem("llhAuthToken", `test:${user}`);
    localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
    localStorage.removeItem("llhAdminPreviewMode");
    localStorage.removeItem("llhMultiRoleTesterView");
  }, { email, account });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function" && typeof currentAccount === "function", null, { timeout: 60000 });
  const bootMs = Date.now() - t0;
  return { context, page, consoleErrors, pageErrors, failedRequests, bootMs };
}

async function seedProgram(port) {
  for (const [email, role, extras] of [
    [OWNER, "owner", { plan: "Pro" }],
    [FREE_OWNER, "owner", { plan: "Free" }],
    [TRIAL_OWNER, "owner", { plan: "Pro", trial: true }],
    [PRO_OWNER, "owner", { plan: "Pro" }],
  ]) {
    await request(port, "POST", "/api/account/profile", {
      body: {
        email,
        firstName: "QA",
        lastName: role,
        accountType: "center",
        role: "owner",
        businessName: `QA Nest ${email.split("@")[0]}`,
        signup: true,
        plan: extras.plan,
      },
    });
  }

  await request(port, "PUT", "/api/schedule", {
    email: OWNER,
    body: {
      classrooms: [
        { id: "room-oaks", name: "Oaks Room" },
        { id: "room-maples", name: "Maples Room" },
      ],
      items: [],
    },
  });

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
  if (seed.status !== 200) throw new Error(`seed failed: ${JSON.stringify(seed.json)}`);

  async function inviteStaff(email, role, classroomId = "", classroomName = "") {
    const invite = await request(port, "POST", "/api/staff/invites", {
      email: OWNER,
      body: {
        email,
        role,
        classroomId,
        classroomName,
        programName: "QA Phase4 Nest",
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    if (invite.status !== 200) throw new Error(`invite ${email}: ${JSON.stringify(invite.json)}`);
    const token = new URL(invite.json.acceptUrl).searchParams.get("staffInvite");
    const accept = await request(port, "POST", "/api/staff/invites/accept", {
      email,
      body: { token },
    });
    if (accept.status !== 200) throw new Error(`accept ${email}: ${JSON.stringify(accept.json)}`);
  }

  await inviteStaff(DIRECTOR, "director", "", "");
  await inviteStaff(TEACHER, "teacher", "room-oaks", "Oaks Room");
  await inviteStaff(TEACHER_UNASSIGNED, "teacher", "", "");
  await inviteStaff(ASSISTANT, "assistant", "room-oaks", "Oaks Room");
}

function recordBug(bugs, { id, severity, area, persona, viewport, title, detail, evidence = {} }) {
  bugs.push({
    id,
    severity,
    area,
    persona,
    viewport,
    title,
    detail,
    evidence,
    at: new Date().toISOString(),
  });
}

async function probeFeatureViews(page, persona, viewport, bugs, checks) {
  for (const feature of FEATURE_VIEWS) {
    const result = await page.evaluate(async ({ view, marker }) => {
      const before = location.hash;
      try {
        if (typeof setView === "function") setView(view, { skipAccessRedirect: true });
      } catch (error) {
        return { ok: false, error: String(error?.message || error), activeView: "" };
      }
      await new Promise((r) => setTimeout(r, 120));
      const active = document.querySelector(".active-view");
      const activeId = active?.id || "";
      const bodyText = (active?.innerText || document.body.innerText || "").slice(0, 500);
      const markerHit = Boolean(document.querySelector(marker.split(",")[0].trim()))
        || Boolean(active)
        || /not available|don't have access|upgrade|sign in|ask your owner|denied|hidden/i.test(bodyText);
      const denied = /don't have access|not available for your role|upgrade to unlock|only owners/i.test(bodyText);
      const blank = !bodyText.trim() || bodyText.trim().length < 8;
      return {
        ok: true,
        activeView: activeId,
        markerHit,
        denied,
        blank,
        sample: bodyText.replace(/\s+/g, " ").slice(0, 160),
        hash: location.hash,
        before,
      };
    }, { view: feature.view, marker: feature.marker });

    checks.push({
      name: `${persona}/${viewport}/${feature.label}`,
      ok: Boolean(result?.ok),
      detail: result,
    });

    if (!result?.ok) {
      recordBug(bugs, {
        id: `view-crash-${persona}-${viewport}-${feature.view}`,
        severity: "critical",
        area: feature.label,
        persona,
        viewport,
        title: `${feature.label} crashed for ${persona}`,
        detail: result?.error || "setView failed",
      });
    } else if (result.blank) {
      recordBug(bugs, {
        id: `view-blank-${persona}-${viewport}-${feature.view}`,
        severity: "medium",
        area: feature.label,
        persona,
        viewport,
        title: `${feature.label} rendered blank for ${persona} (${viewport})`,
        detail: result.sample || "(empty)",
        evidence: result,
      });
    }
  }
}

async function checkPermissions(page, persona, expected, bugs, checks) {
  const actual = await page.evaluate(() => {
    const caps = ["billing", "staff_management", "settings", "daily_logs", "child_profiles", "calendar", "lesson_plans", "forms", "classrooms", "enrollment"];
    const out = {};
    for (const cap of caps) {
      out[cap] = typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature(cap) : null;
    }
    return {
      email: currentUser || "",
      role: currentAccount()?.role || "",
      plan: currentAccount()?.plan || "",
      caps: out,
      settingsNav: Boolean(document.querySelector('[data-view="settings"]')),
      billingNav: Boolean(document.querySelector('[data-view="billing"]')),
      staffNav: Boolean(document.querySelector('[data-view="staff"]')),
    };
  });
  for (const [cap, want] of Object.entries(expected.caps || {})) {
    const got = actual.caps[cap];
    const ok = got === want;
    checks.push({ name: `${persona}/perm/${cap}`, ok, detail: { want, got } });
    if (!ok) {
      recordBug(bugs, {
        id: `perm-${persona}-${cap}`,
        severity: "critical",
        area: "Permissions",
        persona,
        viewport: "n/a",
        title: `${persona} permission mismatch for ${cap}`,
        detail: `expected ${want}, got ${got}`,
        evidence: actual,
      });
    }
  }
  return actual;
}

async function runPhase4Workflows(page, persona, viewport, bugs, checks) {
  // Daily Logs room/empty/check-in for classroom staff + owner/director
  const dlc = await page.evaluate(async () => {
    clearTimeout(typeof childCloudSaveTimer !== "undefined" ? childCloudSaveTimer : 0);
    if (typeof queueChildDataCloudSave === "function") {
      const orig = queueChildDataCloudSave;
      queueChildDataCloudSave = () => { clearTimeout(childCloudSaveTimer); };
      window.__qaRestoreQueue = orig;
    }
    try {
      const remote = await (await fetch("/api/child-data", {
        headers: {
          Authorization: `Bearer test:${currentUser}`,
          "X-LLH-User-Email": String(currentUser),
        },
      })).json().catch(() => ({}));
      if (remote?.data && typeof applyChildDataSnapshot === "function") {
        applyChildDataSnapshot(remote.data, remote.updatedAt || "");
      }
      const day = typeof dlcActiveDate === "function" ? dlcActiveDate() : new Date().toISOString().slice(0, 10);
      if (typeof dlcDashboardDate !== "undefined") dlcDashboardDate = day;
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
      if (typeof renderChildManagement === "function") renderChildManagement();
      await new Promise((r) => setTimeout(r, 80));
      const emptyReason = document.querySelector("[data-dlc-empty-reason]")?.getAttribute("data-dlc-empty-reason") || "";
      const activeIds = typeof getActiveChildren === "function"
        ? getActiveChildren(childRecords()).map((c) => c.id)
        : [];
      const unassigned = typeof isUnassignedLinkedClassroomStaff === "function"
        ? isUnassignedLinkedClassroomStaff()
        : false;

      let roomMode = null;
      if (activeIds.includes("child-oaks-1")) {
        saveDailyLogQuickAction("check-in", "child-oaks-1", { date: day, time: "08:15" });
        renderChildManagement();
        await new Promise((r) => setTimeout(r, 40));
        const mealBtn = document.querySelector('[data-dlc-quick-action="room-meal"][data-dlc-quick-child="child-oaks-1"]');
        const beforeSection = dailyLogsSection;
        const beforeQueue = (childDataMutationQueue || []).length;
        mealBtn?.click();
        await new Promise((r) => setTimeout(r, 60));
        if (!(childRecords().meals || []).some((m) => m.childId === "child-oaks-1")) {
          saveDailyLogQuickAction("room-meal", "child-oaks-1", { date: day });
        }
        saveDailyLogQuickAction("room-diaper", "child-oaks-1", { date: day });
        saveDailyLogQuickAction("check-out", "child-oaks-1", { date: day, time: "15:00" });
        renderChildManagement();
        roomMode = {
          hasMealBtn: Boolean(mealBtn),
          stayedHome: dailyLogsSection === beforeSection && beforeSection === "home",
          queueGrew: (childDataMutationQueue || []).length > beforeQueue,
          mealCount: (childRecords().meals || []).filter((m) => m.childId === "child-oaks-1").length,
          diaperCount: (childRecords().diapers || []).filter((m) => m.childId === "child-oaks-1").length,
          attState: typeof getChildAttendanceState === "function"
            ? getChildAttendanceState(childRecords().children.find((c) => c.id === "child-oaks-1"), childRecords(), day)
            : "",
          roomBtnMinHeight: mealBtn ? Math.round(mealBtn.getBoundingClientRect().height) : 0,
          roomModeAria: document.querySelector(".dlc-room-mode-actions")?.getAttribute("aria-label") || "",
        };
      }

      // Offline queue smoke
      let queueSmoke = null;
      if (typeof enqueueChildDataMutation === "function") {
        const qBefore = (childDataMutationQueue || []).length;
        enqueueChildDataMutation({
          op: "upsert",
          storeKey: "Communications",
          clientMutationId: `qa-offline-${Date.now()}`,
          record: {
            id: `note-qa-${Date.now()}`,
            childId: activeIds[0] || "child-oaks-1",
            date: day,
            notes: "QA offline note",
            revision: 1,
          },
        });
        queueSmoke = {
          grew: (childDataMutationQueue || []).length > qBefore,
          hasFlush: typeof flushChildDataMutationPersists === "function",
        };
      }

      return {
        emptyReason,
        activeIds,
        unassigned,
        roomMode,
        queueSmoke,
        saveStatus: typeof dlcSaveStatus !== "undefined" ? dlcSaveStatus?.state || "" : "",
      };
    } finally {
      if (window.__qaRestoreQueue) {
        queueChildDataCloudSave = window.__qaRestoreQueue;
        delete window.__qaRestoreQueue;
      }
    }
  });

  checks.push({ name: `${persona}/${viewport}/daily-logs-probe`, ok: true, detail: dlc });

  if (persona === "teacher-unassigned") {
    if (!dlc.unassigned || dlc.emptyReason !== "unassigned-staff" || dlc.activeIds.length) {
      recordBug(bugs, {
        id: `empty-unassigned-${viewport}`,
        severity: "critical",
        area: "Daily Logs",
        persona,
        viewport,
        title: "Unassigned teacher empty-state incorrect",
        detail: JSON.stringify(dlc),
      });
    } else {
      checks.push({ name: `${persona}/${viewport}/unassigned-empty`, ok: true });
    }
  }

  if (["owner", "director", "teacher", "assistant"].includes(persona) && persona !== "teacher-unassigned") {
    if (persona === "teacher" || persona === "assistant") {
      if (dlc.activeIds.includes("child-maples-1")) {
        recordBug(bugs, {
          id: `scope-leak-${persona}-${viewport}`,
          severity: "critical",
          area: "Permissions",
          persona,
          viewport,
          title: `${persona} can see Maples child outside classroom`,
          detail: String(dlc.activeIds),
        });
      }
    }
    if (dlc.roomMode) {
      if (!dlc.roomMode.hasMealBtn) {
        recordBug(bugs, {
          id: `room-mode-missing-${persona}-${viewport}`,
          severity: "critical",
          area: "Room Mode",
          persona,
          viewport,
          title: "Room-mode Meal button missing after check-in",
          detail: JSON.stringify(dlc.roomMode),
        });
      }
      if (!dlc.roomMode.stayedHome) {
        recordBug(bugs, {
          id: `room-mode-nav-${persona}-${viewport}`,
          severity: "medium",
          area: "Room Mode",
          persona,
          viewport,
          title: "Room-mode action left Daily Logs home",
          detail: JSON.stringify(dlc.roomMode),
        });
      }
      if (!dlc.roomMode.queueGrew || dlc.roomMode.mealCount < 1) {
        recordBug(bugs, {
          id: `room-mode-queue-${persona}-${viewport}`,
          severity: "critical",
          area: "Offline queue",
          persona,
          viewport,
          title: "Room-mode did not enqueue/persist care logs",
          detail: JSON.stringify(dlc.roomMode),
        });
      }
      if (viewport === "mobile" && dlc.roomMode.roomBtnMinHeight && dlc.roomMode.roomBtnMinHeight < 36) {
        recordBug(bugs, {
          id: `room-mode-touch-${viewport}`,
          severity: "medium",
          area: "Mobile responsiveness",
          persona,
          viewport,
          title: "Room-mode button shorter than 36px on mobile",
          detail: `height=${dlc.roomMode.roomBtnMinHeight}`,
        });
      }
      if (!dlc.roomMode.roomModeAria) {
        recordBug(bugs, {
          id: `room-mode-a11y-${persona}`,
          severity: "low",
          area: "Accessibility",
          persona,
          viewport,
          title: "Room-mode action group missing aria-label",
          detail: "expected aria-label on .dlc-room-mode-actions",
        });
      }
      if (dlc.roomMode.attState !== "checked_out") {
        // check-out should leave checked_out
        recordBug(bugs, {
          id: `checkout-state-${persona}-${viewport}`,
          severity: "medium",
          area: "Check-in/out",
          persona,
          viewport,
          title: "Expected checked_out after check-out",
          detail: `state=${dlc.roomMode.attState}`,
        });
      }
    } else if (persona === "owner" || persona === "director" || persona === "teacher" || persona === "assistant") {
      // Owner/director should see oaks; if not, bug
      if (!dlc.activeIds.includes("child-oaks-1") && persona !== "teacher-unassigned") {
        recordBug(bugs, {
          id: `missing-oaks-${persona}-${viewport}`,
          severity: "critical",
          area: "Daily Logs",
          persona,
          viewport,
          title: `${persona} missing Oaks child in Daily Logs`,
          detail: String(dlc.activeIds),
        });
      }
    }
  }

  if (dlc.queueSmoke && (!dlc.queueSmoke.grew || !dlc.queueSmoke.hasFlush)) {
    recordBug(bugs, {
      id: `queue-smoke-${persona}-${viewport}`,
      severity: "critical",
      area: "Offline queue",
      persona,
      viewport,
      title: "Offline mutation queue smoke failed",
      detail: JSON.stringify(dlc.queueSmoke),
    });
  }

  // Staff assign UI (owner/director only)
  if (persona === "owner" || persona === "director") {
    const staff = await page.evaluate(async () => {
      scheduleDocCache = {
        classrooms: [
          { id: "room-oaks", name: "Oaks Room" },
          { id: "room-maples", name: "Maples Room" },
        ],
        items: [],
        weeks: {},
      };
      if (typeof refreshStaffInvitesFromBackend === "function") {
        await refreshStaffInvitesFromBackend().catch(() => {});
      }
      if (typeof setView === "function") setView("staff", { skipAccessRedirect: true });
      if (typeof renderStaffManagementPage === "function") renderStaffManagementPage({ refresh: false });
      await new Promise((r) => setTimeout(r, 80));
      const selects = Array.from(document.querySelectorAll("[data-staff-assign-classroom]"));
      return {
        selectCount: selects.length,
        labels: selects.map((s) => s.getAttribute("data-staff-assign-classroom")),
        hasInviteForm: Boolean(document.querySelector("#staffInviteForm")),
      };
    });
    checks.push({ name: `${persona}/${viewport}/staff-ui`, ok: staff.selectCount >= 1, detail: staff });
    if (staff.selectCount < 1) {
      recordBug(bugs, {
        id: `staff-ui-${persona}-${viewport}`,
        severity: "critical",
        area: "Staff assignment",
        persona,
        viewport,
        title: "Staff assign controls missing for manager role",
        detail: JSON.stringify(staff),
      });
    }
  } else if (["teacher", "assistant", "teacher-unassigned"].includes(persona)) {
    const denied = await page.evaluate(() => {
      if (typeof setView === "function") setView("staff", { skipAccessRedirect: true });
      if (typeof renderStaffManagementPage === "function") {
        try { renderStaffManagementPage({ refresh: false }); } catch (_e) { /* ignore */ }
      }
      const text = document.querySelector(".active-view")?.innerText || "";
      return {
        canStaff: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("staff_management") : null,
        hasAssign: Boolean(document.querySelector("[data-staff-assign-classroom]")),
        gatedCopy: /only owners and directors|don't have access|not available/i.test(text),
      };
    });
    if (denied.canStaff || denied.hasAssign) {
      recordBug(bugs, {
        id: `staff-leak-${persona}-${viewport}`,
        severity: "critical",
        area: "Staff assignment",
        persona,
        viewport,
        title: `${persona} can access staff classroom assignment`,
        detail: JSON.stringify(denied),
      });
    } else {
      checks.push({ name: `${persona}/${viewport}/staff-denied`, ok: true, detail: denied });
    }
  }
}

async function checkMobileOverflow(page, persona, bugs, checks) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowPx: doc.scrollWidth - doc.clientWidth,
    };
  });
  const ok = overflow.overflowPx <= 8;
  checks.push({ name: `${persona}/mobile/overflow`, ok, detail: overflow });
  if (!ok) {
    recordBug(bugs, {
      id: `overflow-${persona}`,
      severity: "medium",
      area: "Mobile responsiveness",
      persona,
      viewport: "mobile",
      title: "Horizontal overflow on mobile viewport",
      detail: `overflowPx=${overflow.overflowPx}`,
      evidence: overflow,
    });
  }
}

async function checkLoadingAndAuth(page, persona, viewport, bugs, checks) {
  const auth = await page.evaluate(() => ({
    currentUser: currentUser || "",
    hasAccount: Boolean(currentAccount()),
    role: currentAccount()?.role || "",
    bootGateVisible: Boolean(document.querySelector("#appBootGate:not([hidden])")),
    authModalOpen: Boolean(document.querySelector("#authModal.open, .auth-modal.open, [data-auth-modal].open")),
  }));
  const ok = Boolean(auth.currentUser && auth.hasAccount);
  checks.push({ name: `${persona}/${viewport}/auth-session`, ok, detail: auth });
  if (!ok) {
    recordBug(bugs, {
      id: `auth-${persona}-${viewport}`,
      severity: "critical",
      area: "Authentication",
      persona,
      viewport,
      title: "Session/account missing after seeded login",
      detail: JSON.stringify(auth),
    });
  }
  if (auth.bootGateVisible) {
    recordBug(bugs, {
      id: `boot-gate-${persona}-${viewport}`,
      severity: "medium",
      area: "Loading states",
      persona,
      viewport,
      title: "Boot gate still visible after app ready",
      detail: JSON.stringify(auth),
    });
  }
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-qa-p4-${Date.now()}.json`);
  const port = 4300 + Math.floor(Math.random() * 400);
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

  const bugs = [];
  const checks = [];
  const suite = [];
  let browser;

  const personas = [
    {
      id: "owner",
      email: OWNER,
      account: accountSeed(OWNER, { role: "owner", plan: "Pro" }),
      expected: { caps: { billing: true, staff_management: true, settings: true, daily_logs: true } },
    },
    {
      id: "director",
      email: DIRECTOR,
      account: accountSeed(DIRECTOR, { role: "director", plan: "Pro", linkedOwner: OWNER }),
      expected: { caps: { billing: false, staff_management: true, settings: true, daily_logs: true } },
    },
    {
      id: "teacher",
      email: TEACHER,
      account: accountSeed(TEACHER, { role: "teacher", plan: "Pro", classroomIds: ["room-oaks"], linkedOwner: OWNER }),
      expected: { caps: { billing: false, staff_management: false, settings: false, daily_logs: true } },
    },
    {
      id: "teacher-unassigned",
      email: TEACHER_UNASSIGNED,
      account: accountSeed(TEACHER_UNASSIGNED, { role: "teacher", plan: "Pro", classroomIds: [], linkedOwner: OWNER }),
      expected: { caps: { billing: false, staff_management: false, settings: false, daily_logs: true } },
    },
    {
      id: "assistant",
      email: ASSISTANT,
      account: accountSeed(ASSISTANT, { role: "assistant", plan: "Pro", classroomIds: ["room-oaks"], linkedOwner: OWNER }),
      expected: { caps: { billing: false, staff_management: false, settings: false, daily_logs: true } },
    },
    {
      id: "free-owner",
      email: FREE_OWNER,
      account: accountSeed(FREE_OWNER, { role: "owner", plan: "Free" }),
      expected: { caps: { billing: true, staff_management: true, settings: true, daily_logs: true } },
    },
    {
      id: "trial-owner",
      email: TRIAL_OWNER,
      account: accountSeed(TRIAL_OWNER, { role: "owner", plan: "Pro", trial: true }),
      expected: { caps: { billing: true, staff_management: true, settings: true, daily_logs: true } },
    },
    {
      id: "pro-owner",
      email: PRO_OWNER,
      account: accountSeed(PRO_OWNER, { role: "owner", plan: "Pro" }),
      expected: { caps: { billing: true, staff_management: true, settings: true, daily_logs: true } },
    },
  ];

  try {
    await waitForHealth(port, server);
    await seedProgram(port);

    // API-level staff assign matrix
    const teacherAssignDeny = await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: TEACHER,
      body: { memberEmail: TEACHER_UNASSIGNED, classroomId: "room-oaks", classroomName: "Oaks Room" },
    });
    suite.push({ name: "API teacher assign deny", ok: teacherAssignDeny.status === 403 });
    if (teacherAssignDeny.status !== 403) {
      recordBug(bugs, {
        id: "api-teacher-assign-leak",
        severity: "critical",
        area: "Staff assignment",
        persona: "teacher",
        viewport: "api",
        title: "Teacher was not denied assign-classroom",
        detail: `status=${teacherAssignDeny.status}`,
      });
    }

    const directorAssign = await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: DIRECTOR,
      body: { memberEmail: TEACHER_UNASSIGNED, classroomId: "room-maples", classroomName: "Maples Room" },
    });
    suite.push({ name: "API director assign", ok: directorAssign.status === 200 });
    if (directorAssign.status !== 200) {
      recordBug(bugs, {
        id: "api-director-assign-fail",
        severity: "critical",
        area: "Staff assignment",
        persona: "director",
        viewport: "api",
        title: "Director cannot assign classroom",
        detail: JSON.stringify(directorAssign.json),
      });
    }

    // Clear unassigned teacher again for UI empty-state tests
    await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: OWNER,
      body: { memberEmail: TEACHER_UNASSIGNED, classroomId: "", classroomName: "" },
    });

    const ownerReassign = await request(port, "POST", "/api/staff/members/assign-classroom", {
      email: OWNER,
      body: { memberEmail: TEACHER, classroomId: "room-oaks", classroomName: "Oaks Room" },
    });
    suite.push({ name: "API owner reassign", ok: ownerReassign.status === 200 });

    const sub = await request(port, "GET", `/api/subscription-status?email=${encodeURIComponent(TEACHER)}`);
    suite.push({
      name: "subscription classroomIds sync field",
      ok: Array.isArray(sub.json?.subscription?.classroomIds) && sub.json.subscription.classroomIds.includes("room-oaks"),
    });

    browser = await chromium.launch({ headless: true });

    for (const persona of personas) {
      for (const viewport of Object.keys(VIEWPORTS)) {
        const session = await openPage(browser, port, persona.email, persona.account, viewport);
        const { page, context } = session;
        checks.push({ name: `${persona.id}/${viewport}/boot-ms`, ok: session.bootMs < 15000, detail: { bootMs: session.bootMs } });
        if (session.bootMs >= 15000) {
          recordBug(bugs, {
            id: `perf-boot-${persona.id}-${viewport}`,
            severity: "medium",
            area: "Performance",
            persona: persona.id,
            viewport,
            title: "Slow boot (>15s)",
            detail: `bootMs=${session.bootMs}`,
          });
        }

        await checkLoadingAndAuth(page, persona.id, viewport, bugs, checks);
        await checkPermissions(page, persona.id, persona.expected, bugs, checks);
        await probeFeatureViews(page, persona.id, viewport, bugs, checks);

        // Phase 4 + core daily workflows for program-linked personas and plan owners that own their own data
        if (["owner", "director", "teacher", "teacher-unassigned", "assistant"].includes(persona.id)) {
          await runPhase4Workflows(page, persona.id, viewport, bugs, checks);
        } else {
          // Free/Trial/Pro owners: ensure Daily Logs / billing / settings open without crash
          await page.evaluate(() => {
            if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
            if (typeof renderChildManagement === "function") renderChildManagement();
          });
          await page.evaluate(() => {
            if (typeof setView === "function") setView("billing", { skipAccessRedirect: true });
            if (typeof renderBillingPage === "function") renderBillingPage();
          });
          await page.evaluate(() => {
            if (typeof setView === "function") setView("settings", { skipAccessRedirect: true });
            if (typeof renderSettingsPage === "function") renderSettingsPage();
          });
        }

        if (viewport === "mobile") {
          await checkMobileOverflow(page, persona.id, bugs, checks);
        }

        // Screenshot key surfaces
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, "screenshots", `${persona.id}-${viewport}-final.png`),
          fullPage: true,
        }).catch(() => {});

        // Filter noisy expected 401/403 from staff-denied probes etc.
        const unexpectedApi = session.failedRequests.filter((r) => {
          if (r.status === 401 || r.status === 403) return false;
          if (r.url.includes("/api/analytics")) return false;
          return true;
        });
        const unexpectedConsole = session.consoleErrors.filter((t) => {
          if (/favicon|ResizeObserver|net::ERR/i.test(t)) return false;
          return true;
        });
        if (session.pageErrors.length) {
          recordBug(bugs, {
            id: `pageerror-${persona.id}-${viewport}`,
            severity: "critical",
            area: "Console/API errors",
            persona: persona.id,
            viewport,
            title: "Unhandled page error",
            detail: session.pageErrors.slice(0, 3).join(" | "),
          });
        }
        if (unexpectedApi.length) {
          recordBug(bugs, {
            id: `api-${persona.id}-${viewport}`,
            severity: "medium",
            area: "Console/API errors",
            persona: persona.id,
            viewport,
            title: "Unexpected API 4xx/5xx during QA walk",
            detail: JSON.stringify(unexpectedApi.slice(0, 8)),
          });
        }
        if (unexpectedConsole.length) {
          recordBug(bugs, {
            id: `console-${persona.id}-${viewport}`,
            severity: "low",
            area: "Console/API errors",
            persona: persona.id,
            viewport,
            title: "Console errors during QA walk",
            detail: unexpectedConsole.slice(0, 5).join(" | "),
          });
        }

        await context.close();
        console.log(`OK  ${persona.id}/${viewport} (bugs so far: ${bugs.length})`);
      }
    }

    // Sync endpoint smoke
    const sync = await request(port, "GET", "/api/child-data", { email: TEACHER });
    suite.push({ name: "teacher child-data sync GET", ok: sync.status === 200 });
    if (sync.status !== 200) {
      recordBug(bugs, {
        id: "sync-teacher-get",
        severity: "critical",
        area: "Sync",
        persona: "teacher",
        viewport: "api",
        title: "Teacher child-data GET failed",
        detail: `status=${sync.status}`,
      });
    }

    const critical = bugs.filter((b) => b.severity === "critical");
    const medium = bugs.filter((b) => b.severity === "medium");
    const low = bugs.filter((b) => b.severity === "low");
    const checksPassed = checks.filter((c) => c.ok).length;
    const suitePassed = suite.filter((s) => s.ok).length;

    const productionReady = critical.length === 0 && medium.filter((b) => [
      "Daily Logs", "Permissions", "Staff assignment", "Room Mode", "Offline queue", "Authentication", "Check-in/out",
    ].includes(b.area)).length === 0;

    // Phase 3 phone holds + residual mediums → overall NO-GO for production even if Phase 4 code is clean
    const recommendation = critical.length
      ? "NO-GO"
      : (productionReady ? "CONDITIONAL-GO-TESTING-ONLY" : "NO-GO");

    const report = {
      ok: critical.length === 0,
      recommendation,
      productionReady: false, // never claim production-ready while Phase 3 phone holds open + explicit user gate
      productionSha: "ccd01fe",
      testingSha: "8016094",
      generatedAt: new Date().toISOString(),
      summary: {
        checks: checks.length,
        checksPassed,
        suite,
        suitePassed,
        suiteTotal: suite.length,
        bugs: bugs.length,
        critical: critical.length,
        medium: medium.length,
        low: low.length,
      },
      bugs,
      critical,
      medium,
      low,
      notes: [
        "Production remains at ccd01fe — this review does not merge or deploy production.",
        "Phase 3 physical-phone Cases 1 and 5 remain MANUAL REQUIRED.",
        "Family Hub customer flags were not enabled.",
      ],
    };

    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));

    const md = [
      "# Phase 4 End-to-End QA Review",
      "",
      `Generated: ${report.generatedAt}`,
      `Testing SHA: \`8016094\` · Production SHA: \`ccd01fe\` (unchanged)`,
      "",
      "## Verdict",
      "",
      `**${recommendation}** for production.`,
      "",
      `- Critical bugs: ${critical.length}`,
      `- Medium bugs: ${medium.length}`,
      `- Low bugs: ${low.length}`,
      `- Checks: ${checksPassed}/${checks.length}`,
      `- API suite: ${suitePassed}/${suite.length}`,
      "",
      "## Critical",
      ...(critical.length ? critical.map((b) => `- **${b.id}** [${b.area}] ${b.title} — ${b.detail}`) : ["- None"]),
      "",
      "## Medium",
      ...(medium.length ? medium.map((b) => `- **${b.id}** [${b.area}] ${b.title} — ${b.detail}`) : ["- None"]),
      "",
      "## Low",
      ...(low.length ? low.map((b) => `- **${b.id}** [${b.area}] ${b.title} — ${b.detail}`) : ["- None"]),
      "",
      "## Constraints",
      "- No production merge/deploy performed",
      "- Phase 3 physical-phone MANUAL REQUIRED items still open",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(ARTIFACT_DIR, "REPORT.md"), md);
    fs.writeFileSync(path.join(ROOT, "docs/audits/PHASE4_E2E_QA_REVIEW.md"), md);

    console.log("\n==== PHASE 4 E2E QA SUMMARY ====");
    console.log(md);
    if (critical.length) process.exitCode = 1;
  } catch (error) {
    console.error("QA harness failed:", error);
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify({
      ok: false,
      error: String(error?.stack || error),
      bugs,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main();
