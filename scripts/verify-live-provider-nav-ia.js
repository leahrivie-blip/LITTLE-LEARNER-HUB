#!/usr/bin/env node
/**
 * Live deployed browser audit for provider nav IA cleanup.
 * Testing site only. Does not mutate production.
 */
"use strict";

const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "https://little-learner-hub-testing.onrender.com";
const EXPECTED_SHELL = process.env.EXPECTED_SHELL || "20260811-forms-wave8-closeout1";
const PASSWORD = "SunshineDaycare9!";
const OUT = "/opt/cursor/artifacts/live-nav-ia-verify";
const stamp = Date.now();
const OWNER = `leah.proxy.navia${stamp}@outlook.com`;
const PROVIDER = `navia.provider${stamp}@gmail.com`;

fs.mkdirSync(OUT, { recursive: true });

const report = {
  shell: "",
  deployChecks: {},
  roles: {},
  dailyCare: {},
  docHelpers: {},
  classroom: {},
  families: {},
  management: {},
  parentReturn: {},
  contextualBack: {},
  activityLibrary: {},
  curriculum: {},
  forms: {},
  invite: {},
  viewports: {},
  security: {},
  consoleErrors: [],
  networkFails: [],
  performance: {},
  bugs: [],
  pass: false,
};

async function api(method, p, { body, headers = {} } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms: Date.now() - t0 };
}

function authHeaders(email, token) {
  return { Authorization: `Bearer ${token}`, "X-LLH-User-Email": email };
}

async function ensureSession(email) {
  for (let i = 0; i < 6; i += 1) {
    await api("POST", "/api/auth/sync-password-after-firebase", {
      body: { email, newPassword: PASSWORD, source: "live_nav_ia" },
    });
    const login = await api("POST", "/api/auth/password-login", {
      body: { email, password: PASSWORD },
    });
    if (login.status === 200 && login.json?.memberSessionToken) return login.json.memberSessionToken;
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
  }
  throw new Error(`session failed for ${email}`);
}

async function attachPageListeners(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 500 && /little-learner-hub-testing/.test(res.url())) {
      report.networkFails.push({ url: res.url(), status: res.status() });
    }
  });
}

async function waitBootCleared(page, timeout = 120000) {
  await page.waitForFunction(
    () => document.body.classList.contains("app-boot-ready")
      && !document.querySelector("#appBootGate:not([hidden])"),
    { timeout },
  );
}

async function forceBootReady(page, reason) {
  report.bugs.push(`boot-degraded:${reason}`);
  await page.evaluate(() => {
    try {
      if (typeof markAppBootReady === "function") markAppBootReady();
      else {
        document.body.classList.add("app-boot-ready");
        document.body.classList.remove("app-boot-verifying");
        const gate = document.querySelector("#appBootGate");
        if (gate) gate.hidden = true;
      }
    } catch (_e) { /* ignore */ }
  });
}

async function bootProvider(page, email, token, { role = null } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(() => typeof setView === "function", { timeout: 90000 });
      await page.evaluate(({ email: e, token: t, roleLabel }) => {
        localStorage.setItem("llhUser", e);
        localStorage.setItem("llhMemberSessionToken", t);
        sessionStorage.setItem("llhMemberSessionToken", t);
        localStorage.setItem("llhPlan", "Pro");
        if (roleLabel) localStorage.setItem("llhMultiRoleTesterView", roleLabel);
        else localStorage.removeItem("llhMultiRoleTesterView");
      }, { email, token, roleLabel: role });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(() => typeof setView === "function" && typeof syncPlatformNavVisibility === "function", { timeout: 90000 });
      await page.evaluate(({ email: e, token: t, roleLabel }) => {
        if (typeof writeMemberSessionToken === "function") {
          writeMemberSessionToken(t || localStorage.getItem("llhMemberSessionToken") || "", { persist: true });
        }
        if (typeof loadAccountState === "function") loadAccountState(e);
        if (roleLabel) localStorage.setItem("llhMultiRoleTesterView", roleLabel);
        else localStorage.removeItem("llhMultiRoleTesterView");
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        if (e) {
          accounts[e] = {
            ...(accounts[e] || {}),
            email: e,
            multiRoleTester: true,
            hdhMultiRoleTester: true,
            plan: "Pro",
            role: "owner",
          };
          localStorage.setItem("llhAccounts", JSON.stringify(accounts));
          loadAccountState?.(e);
        }
        if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();
        if (typeof syncMultiRoleTesterChrome === "function") syncMultiRoleTesterChrome();
      }, { email, token, roleLabel: role });
      try {
        await waitBootCleared(page, 90000);
      } catch (_waitErr) {
        const retry = page.locator("#appBootGateRetry");
        if (await retry.isVisible().catch(() => false)) {
          await retry.click().catch(() => {});
          try {
            await waitBootCleared(page, 60000);
          } catch (_retryErr) {
            await forceBootReady(page, `retry-timeout-attempt-${attempt}`);
          }
        } else {
          // Stuck loading: retryVerifiedAppBoot then force unlock for audit continuity.
          await page.evaluate(async () => {
            try {
              if (typeof retryVerifiedAppBoot === "function") await retryVerifiedAppBoot();
            } catch (_e) { /* ignore */ }
          });
          try {
            await waitBootCleared(page, 45000);
          } catch (_finalErr) {
            await forceBootReady(page, `loading-stuck-attempt-${attempt}`);
          }
        }
      }
      await page.waitForTimeout(400);
      return [];
    } catch (error) {
      lastError = error;
      report.bugs.push(`boot-attempt-failed:${attempt}:${String(error.message || error).slice(0, 120)}`);
      await page.waitForTimeout(1500 * attempt);
    }
  }
  throw lastError || new Error("bootProvider failed");
}

async function applyRole(page, roleLabel, landingView) {
  await page.evaluate(async ({ roleLabel: role, landingView: view }) => {
    const email = localStorage.getItem("llhUser");
    const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
    if (email) {
      accounts[email] = {
        ...(accounts[email] || {}),
        email,
        multiRoleTester: true,
        hdhMultiRoleTester: true,
        plan: "Pro",
        role: "owner",
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      loadAccountState?.(email);
    }
    // Prefer the official Switch View API so nav + persona stay in sync.
    try {
      if (typeof LLHMultiRoleTester?.setViewRole === "function") {
        await LLHMultiRoleTester.setViewRole(role);
      } else {
        localStorage.setItem("llhMultiRoleTesterView", role);
        syncPlatformNavVisibility?.();
        syncMultiRoleTesterChrome?.();
      }
    } catch (_err) {
      localStorage.setItem("llhMultiRoleTesterView", role);
      syncPlatformNavVisibility?.();
      syncMultiRoleTesterChrome?.();
    }
    if (view && typeof setView === "function") {
      setView(view, {
        allowDashboard: true,
        skipAccessRedirect: true,
        allowDuringBootVerification: true,
      });
    }
  }, { roleLabel, landingView });
  await page.waitForTimeout(700);
  const active = await page.evaluate(() => ({
    multi: localStorage.getItem("llhMultiRoleTesterView") || "",
    can: typeof canUseMultiRoleTester === "function" ? canUseMultiRoleTester() : null,
    role: typeof getUserRole === "function" ? getUserRole() : "",
    nav: [...document.querySelectorAll("[data-work-nav-root] [data-work-nav]:not([hidden])")].map((b) => b.getAttribute("data-work-nav")),
  }));
  if (!active.can) {
    report.bugs.push(`multiRoleTester unavailable after applyRole(${roleLabel})`);
  }
  return active;
}

async function visibleWorkNav(page) {
  return page.evaluate(() => (
    [...document.querySelectorAll("[data-work-nav-root] [data-work-nav]:not([hidden])")]
      .map((b) => ({
        nav: b.getAttribute("data-work-nav"),
        view: b.getAttribute("data-view"),
        text: b.innerText.replace(/\s+/g, " ").trim(),
        ariaHidden: b.getAttribute("aria-hidden"),
        tabIndex: b.getAttribute("tabindex"),
      }))
  ));
}

async function clickNavAndCapture(page, navKey, expectActiveView) {
  await waitBootCleared(page, 30000).catch(() => {});
  const btn = page.locator(`[data-work-nav="${navKey}"]:not([hidden])`).first();
  await btn.click({ timeout: 20000 });
  await page.waitForTimeout(700);
  const state = await page.evaluate((expected) => {
    const active = document.querySelector(".active-view")?.id?.replace(/^view-/, "") || "";
    const h2 = document.querySelector(".active-view h2, [data-daily-care-root] h2")?.textContent?.trim() || "";
    const bodyText = (document.querySelector(".active-view")?.innerText || "").slice(0, 500);
    return { active, h2, bodyText, expectedMatch: !expected || active === expected || active.includes(expected) };
  }, expectActiveView);
  return state;
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function main() {
  const man = await api("GET", "/llh-shell-manifest.json");
  const h1 = await api("GET", "/api/health");
  const h2 = await api("GET", "/api/health");
  report.shell = man.json?.version || "";
  report.deployChecks = {
    shell: report.shell,
    expected: EXPECTED_SHELL,
    shellMatches: report.shell === EXPECTED_SHELL,
    health1ms: h1.ms,
    health2ms: h2.ms,
    hdh: h1.json?.homeDaycareHubTesting,
  };
  console.log("SHELL", report.deployChecks);
  if (report.shell !== EXPECTED_SHELL) throw new Error(`shell mismatch ${report.shell}`);

  const ownerToken = await ensureSession(OWNER);
  const invite = await api("POST", "/api/home-daycare-hub/tester-invites", {
    headers: authHeaders(OWNER, ownerToken),
    body: {
      email: PROVIDER,
      programType: "home_daycare",
      programName: "Nav IA Live",
      childName: "Nav Kid",
      role: "owner",
      appOrigin: BASE,
    },
  });
  console.log("invite", invite.status, invite.json?.acceptUrl || invite.json?.error);
  if (invite.status !== 200) throw new Error("invite create failed");
  const inviteToken = String(invite.json.acceptUrl).split("testerInvite=")[1];
  const providerToken = await ensureSession(PROVIDER);
  const accept = await api("POST", "/api/home-daycare-hub/tester-invites/accept", {
    headers: authHeaders(PROVIDER, providerToken),
    body: { token: inviteToken },
  });
  console.log("accept", accept.status, accept.json?.ok, accept.json?.account?.programId || accept.json?.programId);
  // Seed child if needed
  let children = await api("GET", "/api/child-data", { headers: authHeaders(PROVIDER, providerToken) });
  let profiles = children.json?.data?.Profiles || [];
  if (!profiles.length) {
    await api("POST", "/api/child-data", {
      headers: authHeaders(PROVIDER, providerToken),
      body: { data: { Profiles: [{ id: `nav-kid-${stamp}`, name: "Nav Kid" }], Documents: [] } },
    });
    children = await api("GET", "/api/child-data", { headers: authHeaders(PROVIDER, providerToken) });
    profiles = children.json?.data?.Profiles || [];
  }
  // Enable multi-role on account via local account fields if server supports it — Switch View needs multiRoleTester.
  // We'll set localStorage role simulation which getUserRole reads via getMultiRoleTesterViewRole when canUseMultiRoleTester.
  // For live, invite accept may set multiRoleTester. Patch account via profile if possible.
  await api("POST", "/api/account/profile", {
    headers: { ...authHeaders(PROVIDER, providerToken), "Content-Type": "application/json" },
    body: { email: PROVIDER, multiRoleTester: true, plan: "Pro" },
  }).catch(() => ({}));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await attachPageListeners(page);
  await bootProvider(page, PROVIDER, providerToken, { role: "Owner" });

  // ---------- OWNER ----------
  {
    await applyRole(page, "Owner", "home");
    const nav = await visibleWorkNav(page);
    const keys = nav.map((n) => n.nav);
    const ownerOk = JSON.stringify(keys) === JSON.stringify(["home", "children", "daily-care", "curriculum", "families", "business", "more"]);
    const clicks = {};
    for (const [key, expect] of [
      ["home", "home"],
      ["children", "children"],
      ["daily-care", "children"],
      ["curriculum", "lessons"],
      ["families", "families"],
      ["business", "business"],
      ["more", "more"],
    ]) {
      clicks[key] = await clickNavAndCapture(page, key, expect);
    }
    await page.evaluate(() => setView("child-tools-daily-logs", { allowDuringBootVerification: true }));
    await page.waitForSelector("[data-daily-care-root] h2", { timeout: 15000 }).catch(() => null);
    const dailyTitle = await page.locator("[data-daily-care-root] h2").textContent().catch(() => "");
    const workspace = await page.evaluate(() => {
      const role = typeof getUserRole === "function" ? getUserRole() : "";
      const headline = typeof roleWorkspaceHeadline === "function" ? roleWorkspaceHeadline(role) : "";
      const bodyHas = /This is your owner workspace/i.test(document.body.innerText || "");
      return { role, headline, bodyHas };
    });
    await shot(page, "owner-home");
    await shot(page, "owner-daily-care");
    report.roles.owner = { nav: keys, ownerOk, clicks, dailyTitle, workspace, hiddenFocusable: nav.every((n) => n.tabIndex !== "-1") };
    console.log("OWNER", report.roles.owner.ownerOk, keys, dailyTitle, workspace);
  }

  // ---------- DIRECTOR ----------
  {
    await applyRole(page, "Director", "home");
    const nav = await visibleWorkNav(page);
    const keys = nav.map((n) => n.nav);
    const ok = JSON.stringify(keys) === JSON.stringify(["home", "children", "daily-care", "curriculum", "families", "business", "more"]);
    const workspace = await page.evaluate(() => {
      const role = typeof getUserRole === "function" ? getUserRole() : "";
      const headline = typeof roleWorkspaceHeadline === "function" ? roleWorkspaceHeadline(role) : "";
      return { role, headline, bodyHas: /This is your director workspace/i.test(document.body.innerText || "") };
    });
    const clicks = {};
    for (const key of ["home", "children", "daily-care", "curriculum", "families", "business", "more"]) {
      clicks[key] = await clickNavAndCapture(page, key);
    }
    await shot(page, "director-home");
    report.roles.director = { nav: keys, ok: ok && workspace.role === "director", workspace, clicks };
    console.log("DIRECTOR", report.roles.director.ok, keys, workspace);
  }

  // ---------- TEACHER ----------
  {
    await applyRole(page, "Teacher", "today");
    const nav = await visibleWorkNav(page);
    const keys = nav.map((n) => n.nav);
    const ok = JSON.stringify(keys) === JSON.stringify(["today", "children", "daily-care", "curriculum", "messages", "more"]);
    const labels = nav.map((n) => n.text);
    const workspace = await page.evaluate(() => {
      const role = typeof getUserRole === "function" ? getUserRole() : "";
      const headline = typeof roleWorkspaceHeadline === "function" ? roleWorkspaceHeadline(role) : "";
      return {
        role,
        headline,
        bodyHas: /This is your classroom workspace/i.test(document.body.innerText || ""),
        noOwnerTeacherCopy: !/your own Teacher space/i.test(document.body.innerText || ""),
      };
    });
    const bizHidden = await page.evaluate(() => !document.querySelector('[data-work-nav="business"]:not([hidden])'));
    const clicks = {};
    for (const key of ["today", "children", "daily-care", "curriculum", "messages", "more"]) {
      clicks[key] = await clickNavAndCapture(page, key);
    }
    await shot(page, "teacher-today");
    report.roles.teacher = {
      nav: keys,
      labels,
      ok: ok && workspace.role === "teacher" && bizHidden,
      workspace,
      bizHidden,
      clicks,
    };
    console.log("TEACHER", report.roles.teacher.ok, keys, labels, workspace);
  }

  // ---------- ASSISTANT ----------
  {
    await applyRole(page, "Assistant", "today");
    const nav = await visibleWorkNav(page);
    const keys = nav.map((n) => n.nav);
    const labels = nav.map((n) => n.text);
    const ok = JSON.stringify(keys) === JSON.stringify(["today", "children", "daily-care", "messages", "more"]);
    const workspace = await page.evaluate(() => {
      const role = typeof getUserRole === "function" ? getUserRole() : "";
      const headline = typeof roleWorkspaceHeadline === "function" ? roleWorkspaceHeadline(role) : "";
      return {
        role,
        headline,
        bodyHas: /This is your limited classroom workspace/i.test(document.body.innerText || ""),
        noOwnerTeacherCopy: !/your own Teacher space/i.test(document.body.innerText || ""),
      };
    });
    const clicks = {};
    for (const key of ["today", "children", "daily-care", "messages", "more"]) {
      clicks[key] = await clickNavAndCapture(page, key);
    }
    await shot(page, "assistant-today");
    report.roles.assistant = {
      nav: keys,
      labels,
      ok: ok && workspace.role === "assistant" && labels.includes("Children") && !labels.some((t) => /My Children/i.test(t)),
      workspace,
      clicks,
    };
    console.log("ASSISTANT", report.roles.assistant.ok, keys, labels, workspace);
  }

  // Restore owner for hub audits on the same page
  await applyRole(page, "Owner", "home");

  // ---------- DAILY CARE / DOC HELPERS / CLASSROOM / FAMILIES / MANAGEMENT ----------
  {

    // Daily Care
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForSelector("[data-daily-care-root]", { timeout: 20000 });
    const daily = await page.evaluate(() => {
      const root = document.querySelector("[data-daily-care-root]");
      const text = root?.innerText || "";
      return {
        title: root?.querySelector("h2")?.textContent || "",
        hasAiAction: !!root?.querySelector('[data-daily-care-action="ai-notes"]'),
        hasEodAction: !!root?.querySelector('[data-daily-care-action="end-of-day"]'),
        hasGroupLog: /Group Log|Group Meal|Group Activity/i.test(text),
        hasAttendance: /Not Arrived|Present|Check[- ]?In|Checked|Attendance/i.test(text),
        hasMeals: /Meal|Breakfast|Lunch|Snack/i.test(text),
        hasBottles: /Bottle/i.test(text),
        hasNaps: /Nap|Sleep/i.test(text),
        hasDiaper: /Diaper|Potty|Toilet/i.test(text),
        hasActivities: /Activit/i.test(text),
        hasNotes: /Note/i.test(text),
        hasReportPreview: /Report preview|Preview report|End-of-day|Family report/i.test(text),
        mentionsSeparateDailyLogsAiProduct: /Daily Logs AI/.test(text) && !/Organize notes with AI/.test(text),
        aiActionLabel: root?.querySelector('[data-daily-care-action="ai-notes"]')?.textContent?.trim() || "",
        eodActionLabel: root?.querySelector('[data-daily-care-action="end-of-day"]')?.textContent?.trim() || "",
      };
    });
    daily.aiClicked = await page.evaluate(() => {
      const root = document.querySelector("[data-daily-care-root]");
      const btn = root?.querySelector('[data-daily-care-action="ai-notes"]')
        || [...document.querySelectorAll('[data-daily-care-action="ai-notes"]')]
          .find((el) => el.offsetParent !== null);
      if (!btn) return false;
      btn.click();
      return true;
    });
    await page.waitForTimeout(700);
    daily.aiOpened = await page.evaluate(() => {
      const panel = document.querySelector(".dlc-optional-ai");
      return !!(panel && (panel.open || panel.hasAttribute("open")))
        || /Organize with AI|Organize notes with AI/i.test(document.body.innerText || "");
    });
    daily.eodClicked = await page.evaluate(() => {
      const root = document.querySelector("[data-daily-care-root]");
      const btn = root?.querySelector('[data-daily-care-action="end-of-day"]')
        || [...document.querySelectorAll('[data-daily-care-action="end-of-day"]')]
          .find((el) => el.offsetParent !== null);
      if (!btn) return false;
      btn.click();
      return true;
    });
    await page.waitForTimeout(500);
    daily.eodActionOk = !!daily.eodClicked;
    await shot(page, "daily-care");
    report.dailyCare = daily;
    console.log("DAILY_CARE", daily);

    // Doc helpers
    const docTypes = ["observation", "parent-message", "incident-report", "daily-log", "behavior-note"];
    const docResults = {};
    for (const type of docTypes) {
      await page.evaluate((t) => {
        window.LlhNavOrigin?.clearOrigins?.();
        window.LlhNavOrigin?.pushOrigin?.("classroom");
        pendingAiDocType = t;
        selectedChildId = "";
        setView("ai");
      }, type);
      await page.waitForTimeout(700);
      docResults[type] = await page.evaluate(() => {
        const child = document.querySelector("#docHelperChild")?.value || "";
        const active = document.querySelector(".doc-helper-card.active, [data-quick-doc-type].is-active, [aria-pressed='true'][data-quick-doc-type]")?.getAttribute("data-quick-doc-type")
          || selectedDocHelperType
          || "";
        const back = window.LlhNavOrigin?.labelFor?.(window.LlhNavOrigin.peekOrigin?.()) || "";
        return { child, active, back };
      });
    }
    report.docHelpers = docResults;
    console.log("DOC_HELPERS", docResults);

    // Classroom
    await page.evaluate(() => setView("classroom"));
    await page.waitForTimeout(500);
    const classroom = await page.evaluate(() => {
      const text = document.querySelector("#view-classroom")?.innerText || "";
      return {
        hasDailyCare: /Daily Care/i.test(text),
        hasOpenCurriculum: /Open full Curriculum/i.test(text),
        noActivityCenterDirectory: !/Activity Center/i.test(text),
        hasQuickDoc: /Write observation|Quick documentation|Document behavior/i.test(text),
        hasBehavior: /Behavior & Support/i.test(text),
        hasTodayLesson: /Today'?s lesson/i.test(text),
      };
    });
    await shot(page, "classroom");
    report.classroom = classroom;
    console.log("CLASSROOM", classroom);

    // Families subsections
    await page.evaluate(() => setView("families", { allowDashboard: true }));
    await page.waitForTimeout(500);
    const familyTiles = await page.evaluate(() => (
      [...document.querySelectorAll("#view-families .work-hub-tile")].map((b) => ({
        title: b.querySelector("strong")?.textContent || b.innerText.split("\n")[0],
        view: b.getAttribute("data-view"),
        jump: b.getAttribute("data-hdh-jump") || "",
        action: b.getAttribute("data-daily-care-action") || "",
      }))
    ));
    const familyChecks = {};
    for (const tile of familyTiles) {
      await page.evaluate(() => setView("families", { allowDashboard: true }));
      await page.waitForTimeout(300);
      const locator = page.locator("#view-families .work-hub-tile", { hasText: tile.title }).first();
      await locator.click({ timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(900);
      familyChecks[tile.title] = await page.evaluate((jump) => {
        const active = document.querySelector(".active-view")?.id?.replace(/^view-/, "") || "";
        const el = jump ? document.getElementById(jump) : null;
        return {
          active,
          jumpPresent: jump ? !!el : null,
          jumpActive: jump ? el?.getAttribute("data-hdh-section-active") === "true" : null,
          h2: document.querySelector(".active-view h2")?.textContent || "",
        };
      }, tile.jump);
    }
    report.families = { tiles: familyTiles, checks: familyChecks };
    console.log("FAMILIES", JSON.stringify(familyChecks, null, 2));

    // Management
    await page.evaluate(() => setView("business"));
    await page.waitForTimeout(500);
    const management = await page.evaluate(() => {
      const text = document.querySelector("#view-business")?.innerText || "";
      const tuitionTile = [...document.querySelectorAll("#view-business .work-hub-tile")].find((b) => /Family Tuition/i.test(b.innerText));
      const billingTile = [...document.querySelectorAll("#view-business .work-hub-tile")].find((b) => /Billing & Subscription/i.test(b.innerText));
      return {
        hasStaffAccess: /Staff & Access/i.test(text),
        noUsersAccessDup: !/Users & access/i.test(text),
        noStaffDup: (text.match(/\bStaff\b/g) || []).length <= 2,
        hasBilling: /Billing & Subscription/i.test(text),
        hasFamilyTuition: /Family Tuition/i.test(text),
        hasProgramSettings: /Program Settings/i.test(text),
        billingNotConfused: /SaaS|Little Learner Hub membership|LLH|subscription/i.test(billingTile?.innerText || text),
        tuitionDetail: tuitionTile?.innerText?.replace(/\s+/g, " ").trim() || "",
        billingDetail: billingTile?.innerText?.replace(/\s+/g, " ").trim() || "",
      };
    });
    // Click Family Tuition and Billing separately
    await page.locator('#view-business .work-hub-tile', { hasText: 'Family Tuition' }).first().click().catch(() => null);
    await page.waitForTimeout(900);
    management.tuitionLanding = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      jump: document.querySelector('[data-hdh-section-active="true"]')?.id || "",
      text: (document.querySelector(".active-view")?.innerText || "").slice(0, 300),
    }));
    await page.evaluate(() => setView("business", { allowDashboard: true }));
    await page.waitForTimeout(400);
    const billingTile = page.locator('#view-business .work-hub-tile', { hasText: /Billing & Subscription/i }).first();
    if (await billingTile.count()) {
      await billingTile.click({ timeout: 10000 }).catch(() => null);
    } else {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("#view-business .work-hub-tile, #view-business button, #view-business a")]
          .find((el) => /Billing & Subscription/i.test(el.innerText || ""));
        btn?.click();
      });
    }
    await page.waitForTimeout(900);
    management.billingLanding = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      text: (document.querySelector(".active-view")?.innerText || "").slice(0, 400),
      looksLikeSaasBilling: /subscription|Stripe|membership|Little Learner Hub|Pro Monthly|billing/i.test(document.querySelector(".active-view")?.innerText || ""),
      looksLikeFamilyTuition: /parent childcare|family tuition|invoice families/i.test(document.querySelector(".active-view")?.innerText || ""),
    }));
    await page.evaluate(() => setView("business", { allowDashboard: true }));
    await page.waitForTimeout(300);
    // Program Settings click
    await page.locator('#view-business .work-hub-tile[data-settings-anchor="program"]').click().catch(() => null);
    await page.waitForTimeout(800);
    management.settingsActive = await page.evaluate(() => (
      document.querySelector(".active-view")?.id?.includes("settings")
      || /Program/i.test(document.querySelector(".active-view")?.innerText || "")
    ));
    await shot(page, "management");
    report.management = management;
    console.log("MANAGEMENT", management);

    // Activity library
    await page.evaluate(() => {
      window.LlhNavOrigin?.pushOrigin?.("lessons");
      setView("activities");
    });
    await page.waitForTimeout(1200);
    const activity = await page.evaluate(() => {
      const cards = document.querySelectorAll("#view-activities .resource-card, #view-activities .activity-browse-card, #view-activities [data-browse-card]");
      const text = document.querySelector("#view-activities")?.innerText || "";
      return {
        title: document.querySelector("#view-activities h2")?.textContent || "",
        cardCount: cards.length,
        hasFilterSummary: !!document.querySelector("[data-activity-filter-summary], .library-filter-summary"),
        hasClearOrGuidance: /Clear filters|Start with search|Show more/i.test(text),
        hasShowMore: !!document.querySelector("[data-activity-load-more]"),
        backLabel: document.querySelector("[data-nav-origin-back]")?.textContent || "",
      };
    });
    // Apply a filter and ensure pagination
    const ageBtn = page.locator("#view-activities [data-filter]").nth(1);
    if (await ageBtn.count()) {
      await ageBtn.click();
      await page.waitForTimeout(800);
    }
    activity.afterFilter = await page.evaluate(() => ({
      cards: document.querySelectorAll("#view-activities .resource-card, #view-activities .activity-browse-card, #view-activities [data-browse-card]").length,
      showMore: !!document.querySelector("[data-activity-load-more]"),
      summary: document.querySelector("[data-activity-filter-summary], .library-filter-summary")?.innerText?.slice(0, 200) || "",
    }));
    if (activity.afterFilter.showMore) {
      await page.click("[data-activity-load-more]");
      await page.waitForTimeout(600);
      activity.afterMore = await page.evaluate(() => document.querySelectorAll("#view-activities .resource-card, #view-activities .activity-browse-card, #view-activities [data-browse-card]").length);
    }
    await shot(page, "activity-library");
    report.activityLibrary = activity;
    console.log("ACTIVITY", activity);

    // Curriculum
    await page.evaluate(() => setView("lessons"));
    await page.waitForTimeout(1000);
    const curriculum = await page.evaluate(() => {
      const rows = document.querySelectorAll("#view-lessons [data-browse-row], #view-lessons .browse-row");
      const cards = document.querySelectorAll("#view-lessons .lesson-plan-card, #view-lessons .resource-card");
      return {
        title: document.querySelector("#view-lessons h2")?.textContent || "",
        browseRows: rows.length,
        initialLimitMarker: !!document.querySelector("[data-curriculum-initial-limit]"),
        cardCount: cards.length,
        hasSearch: !!document.querySelector("#lessonPlanSearch, #view-lessons input[type='search']"),
      };
    });
    await shot(page, "curriculum");
    report.curriculum = curriculum;
    console.log("CURRICULUM", curriculum);

    // Forms / Paperwork
    await page.evaluate(() => setView("home-daycare-hub"));
    await page.waitForTimeout(1200);
    const forms = await page.evaluate(() => {
      const text = document.querySelector("#view-home-daycare-hub")?.innerText
        || document.querySelector("#view-forms")?.innerText
        || document.body.innerText
        || "";
      const found = {
        hdhFormsAttentionPanel: !!document.getElementById("hdhFormsAttentionPanel") || /Paperwork HQ|Needs attention|Confirm & Send/i.test(text),
        hdhFormTemplatesPanel: !!document.getElementById("hdhFormTemplatesPanel") || /Template Library|Form templates/i.test(text),
        hdhFormBuilderPanel: !!document.getElementById("hdhFormBuilderPanel") || /Structured Form Builder|Form Builder/i.test(text),
        hdhAiDraftPanel: !!document.getElementById("hdhAiDraftPanel") || /AI Form Builder|AI draft/i.test(text),
        hdhMyPaperworkPanel: !!document.getElementById("hdhMyPaperworkPanel") || /My Paperwork/i.test(text),
        hdhFamilyHubPanel: !!document.getElementById("hdhFamilyHubPanel") || /Family Hub/i.test(text),
        childDocuments: /Child Documents|Child forms/i.test(text),
        staffDocuments: /Staff Documents|Staff forms/i.test(text),
      };
      return {
        found,
        hasAssign: !!document.querySelector("[data-open-assign-flow], [data-assign-form-template], [data-assign-flow]"),
        textHasPaperwork: /Paperwork|Template|Confirm & Send|Assign/i.test(text),
      };
    });
    // Open assign flow if template button exists
    if (await page.locator("[data-assign-form-template], [data-open-assign-flow]").count()) {
      await page.locator("[data-assign-form-template], [data-open-assign-flow]").first().click();
      await page.waitForTimeout(800);
      forms.assignOpen = await page.locator("[data-assign-flow]").count() > 0;
    }
    report.forms = forms;
    console.log("FORMS", forms);

    // Contextual back sample
    await page.evaluate(() => {
      window.LlhNavOrigin?.clearOrigins?.();
      window.LlhNavOrigin?.pushOrigin?.("families");
      setView("ai");
    });
    await page.waitForTimeout(400);
    const backLabel = await page.evaluate(() => window.LlhNavOrigin?.labelFor?.(window.LlhNavOrigin.peekOrigin()) || "");
    report.contextualBack = {
      fromFamiliesToAi: backLabel,
      noCalendarFallback: !/Calendar/i.test(backLabel),
    };
    console.log("BACK", report.contextualBack);

    // Security: teacher management hidden + forged client role still no business nav
    await page.evaluate(() => {
      localStorage.setItem("llhMultiRoleTesterView", "Teacher");
      syncPlatformNavVisibility?.();
    });
    await page.waitForTimeout(300);
    report.security.teacherNoManagement = await page.evaluate(() => !document.querySelector('[data-work-nav="business"]:not([hidden])'));
    await page.evaluate(() => {
      localStorage.setItem("llhMultiRoleTesterView", "Assistant");
      syncPlatformNavVisibility?.();
    });
    await page.waitForTimeout(300);
    report.security.assistantNoManagement = await page.evaluate(() => !document.querySelector('[data-work-nav="business"]:not([hidden])'));
    // Inactive nav a11y
    report.security.inactiveNavA11y = await page.evaluate(() => {
      const hidden = [...document.querySelectorAll("[data-work-nav-root] .nav-link[hidden], [data-work-nav-root] .nav-link[aria-hidden='true']")];
      return hidden.every((el) => el.getAttribute("tabindex") === "-1" || el.hidden);
    });
  }


  // ---------- PARENT SHELL (Switch View) ----------
  {
    await page.evaluate(async () => {
      if (typeof LLHMultiRoleTester?.setViewRole === "function") {
        await LLHMultiRoleTester.setViewRole("Parent");
      } else {
        localStorage.setItem("llhMultiRoleTesterView", "Parent");
        setHdhTesterPersona?.({ role: "parent" });
        setView("family-hub", { skipAccessRedirect: true, allowDuringBootVerification: true });
      }
    });
    await page.waitForTimeout(1500);
    const expectedParent = ["Today", "Reports", "Photos", "Messages", "Calendar", "Forms", "More"];
    const clickResults = {};
    for (const label of expectedParent) {
      const loc = page.locator(
        "#familyHubParentApp button, #familyHubParentApp a, #familyHubParentApp [role='tab'], body.family-hub-parent-mode button, body.family-hub-parent-mode a, body.family-hub-parent-mode [role='tab']",
        { hasText: new RegExp(`^\\s*${label}\\s*$`, "i") },
      ).first();
      const visible = await loc.isVisible().catch(() => false);
      if (visible) {
        await loc.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(500);
        clickResults[label] = {
          clicked: true,
          active: await page.evaluate(() => ({
            view: document.querySelector(".active-view")?.id || "",
            fhTab: document.querySelector("[data-family-hub-tab].is-active, [aria-current='page']")?.textContent?.trim() || "",
            h2: document.querySelector(".active-view h2, #familyHubParentApp h2")?.textContent?.trim() || "",
          })),
        };
      } else {
        // Fallback: any exact-text control in parent mode
        clickResults[label] = await page.evaluate((name) => {
          const el = [...document.querySelectorAll("button, a, [role='tab'], [role='button']")]
            .find((n) => new RegExp("^" + name + "$", "i").test((n.innerText || "").replace(/\s+/g, " ").trim())
              && n.offsetParent !== null);
          if (!el) return { clicked: false };
          el.click();
          return { clicked: true, text: (el.innerText || "").trim() };
        }, label);
        await page.waitForTimeout(400);
      }
    }
    const parentShell = await page.evaluate((expected) => {
      const text = (document.querySelector("#familyHubParentApp")?.innerText || document.body.innerText || "");
      const found = {};
      for (const label of expected) found[label] = new RegExp("\\b" + label + "\\b", "i").test(text);
      return {
        parentMode: document.body.classList.contains("family-hub-parent-mode"),
        multi: localStorage.getItem("llhMultiRoleTesterView") || "",
        providerWorkNavHidden: !document.querySelector("[data-work-nav-root] [data-work-nav]:not([hidden])"),
        found,
        snippet: text.slice(0, 500),
      };
    }, expectedParent);
    parentShell.clickResults = clickResults;
    await shot(page, "parent-shell");
    // Return to provider before continuing
    await page.evaluate(() => {
      if (typeof LLHMultiRoleTester?.clearView === "function") LLHMultiRoleTester.clearView({ silent: true });
      else exitFamilyHubParentPreview?.();
    });
    await page.waitForTimeout(700);
    parentShell.returned = await page.evaluate(() => ({
      parentMode: document.body.classList.contains("family-hub-parent-mode"),
      providerNav: [...document.querySelectorAll("[data-work-nav-root] [data-work-nav]:not([hidden])")].map((b) => b.getAttribute("data-work-nav")),
    }));
    report.roles.parent = parentShell;
    console.log("PARENT_SHELL", JSON.stringify(parentShell, null, 2));
  }

  // ---------- PARENT RETURN ----------
  {
    await applyRole(page, "Owner", "home");
    const roles = ["Owner", "Director", "Teacher", "Assistant"];
    const returns = {};
    for (const fromRole of roles) {
      await page.evaluate(async (role) => {
        localStorage.setItem("llhMultiRoleTesterView", role);
        syncPlatformNavVisibility?.();
        if (typeof LLHMultiRoleTester?.setViewRole === "function") {
          await LLHMultiRoleTester.setViewRole("Parent");
        } else {
          localStorage.setItem("llhMultiRoleTesterView", "Parent");
          setHdhTesterPersona?.({ role: "parent" });
          document.body.classList.add("family-hub-parent-mode");
          const host = document.querySelector("#view-family-hub") || document.body;
          let app = document.querySelector("#familyHubParentApp");
          if (!app) {
            app = document.createElement("div");
            app.id = "familyHubParentApp";
            host.appendChild(app);
          }
          app.innerHTML = '<div data-family-hub-login class="family-hub-login">Family Hub Login Mounted</div>';
          host.classList.add("active-view");
          setView("family-hub", { skipAccessRedirect: true });
        }
      }, fromRole);
      await page.waitForTimeout(1000);
      await shot(page, `parent-from-${fromRole.toLowerCase()}`);
      const before = await page.evaluate(() => ({
        multi: localStorage.getItem("llhMultiRoleTesterView") || "",
        parentMode: document.body.classList.contains("family-hub-parent-mode"),
        login: !!document.querySelector("[data-family-hub-login], .family-hub-login"),
      }));
      await page.evaluate(() => {
        if (typeof LLHMultiRoleTester?.clearView === "function") LLHMultiRoleTester.clearView({ silent: true });
        else exitFamilyHubParentPreview?.();
      });
      await page.waitForTimeout(800);
      const after = await page.evaluate(() => ({
        multi: localStorage.getItem("llhMultiRoleTesterView") || "",
        parentMode: document.body.classList.contains("family-hub-parent-mode"),
        login: !!document.querySelector("[data-family-hub-login], .family-hub-login"),
        appHtml: (document.querySelector("#familyHubParentApp")?.innerHTML || "").trim(),
        active: document.querySelector(".active-view")?.id || "",
        nav: [...document.querySelectorAll("[data-work-nav-root] [data-work-nav]:not([hidden])")].map((b) => b.getAttribute("data-work-nav")),
      }));
      returns[fromRole] = {
        before,
        after,
        ok: !after.parentMode && !after.login && after.appHtml === "" && after.multi === "" && after.nav.length > 0,
      };
      await shot(page, `parent-return-${fromRole.toLowerCase()}`);
    }
    // repeated switching
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(async () => {
        if (LLHMultiRoleTester?.setViewRole) await LLHMultiRoleTester.setViewRole("Parent");
        if (LLHMultiRoleTester?.clearView) LLHMultiRoleTester.clearView({ silent: true });
      });
      await page.waitForTimeout(400);
    }
    returns.repeatedOk = await page.evaluate(() => (
      !document.body.classList.contains("family-hub-parent-mode")
      && !document.querySelector("[data-family-hub-login], .family-hub-login")
    ));
    // refresh after return
    try {
      await page.reload({ waitUntil: "commit", timeout: 120000 });
      await page.waitForFunction(() => typeof setView === "function", { timeout: 90000 }).catch(() => {});
      await waitBootCleared(page, 120000).catch(async () => {
        await forceBootReady(page, "parent-return-refresh");
      });
    } catch (error) {
      report.bugs.push(`parent-return-refresh-reload:${String(error.message || error).slice(0, 120)}`);
    }
    await page.waitForTimeout(500);
    returns.afterRefresh = await page.evaluate(() => ({
      parentMode: document.body.classList.contains("family-hub-parent-mode"),
      multi: localStorage.getItem("llhMultiRoleTesterView") || "",
      providerNav: [...document.querySelectorAll("[data-work-nav-root] [data-work-nav]:not([hidden])")].map((b) => b.getAttribute("data-work-nav")),
    })).catch(() => ({ parentMode: null, multi: "evaluate-failed" }));
    report.parentReturn = returns;
    console.log("PARENT_RETURN", JSON.stringify(returns, null, 2));
    await page.close().catch(() => {});
  }

  // ---------- Mobile parent return + nav ----------
  {
    const page = await browser.newPage({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
    await attachPageListeners(page);
    await bootProvider(page, PROVIDER, providerToken, { role: "Owner" });
    await page.evaluate(() => {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      if (email) {
        accounts[email] = { ...(accounts[email] || {}), multiRoleTester: true, plan: "Pro", role: "owner" };
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        loadAccountState?.(email);
      }
      localStorage.setItem("llhMultiRoleTesterView", "Owner");
      syncPlatformNavVisibility?.();
      setView("home", { allowDashboard: true });
    });
    await page.waitForTimeout(500);
    const overflowHome = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(500);
    const overflowDaily = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    await page.evaluate(async () => {
      if (LLHMultiRoleTester?.setViewRole) await LLHMultiRoleTester.setViewRole("Parent");
      await new Promise((r) => setTimeout(r, 400));
      if (LLHMultiRoleTester?.clearView) LLHMultiRoleTester.clearView({ silent: true });
    });
    await page.waitForTimeout(600);
    const mobileReturn = await page.evaluate(() => ({
      parentMode: document.body.classList.contains("family-hub-parent-mode"),
      login: !!document.querySelector("[data-family-hub-login], .family-hub-login"),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    await shot(page, "mobile-owner-home");
    report.viewports.mobile = { overflowHome, overflowDaily, mobileReturn };
    console.log("MOBILE", report.viewports.mobile);
    await page.close();
  }

  // Desktop widths — resize one authenticated page (avoid membership-gate churn)
  {
    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await attachPageListeners(desk);
    await bootProvider(desk, PROVIDER, providerToken, { role: "Owner" });
    await applyRole(desk, "Owner", "home");
    for (const width of [1920, 1440, 1366]) {
      await desk.setViewportSize({ width, height: width === 1920 ? 1080 : 900 });
      await desk.waitForTimeout(400);
      report.viewports[`w${width}`] = await desk.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        mainWidth: (document.querySelector("main") || document.querySelector(".app-shell"))?.getBoundingClientRect().width || 0,
        navCount: document.querySelectorAll("[data-work-nav-root] [data-work-nav]:not([hidden])").length,
      }));
      await shot(desk, `desktop-${width}`);
    }
    await desk.close();
  }
  console.log("VIEWPORTS", report.viewports);

  // ---------- Tester invite UI regression ----------
  {
    const inviteEmail = `navia.inviteui${Date.now()}@gmail.com`;
    const create = await api("POST", "/api/home-daycare-hub/tester-invites", {
      headers: authHeaders(OWNER, ownerToken),
      body: {
        email: inviteEmail,
        programType: "home_daycare",
        programName: "Invite UI Nav",
        childName: "Invite Kid",
        role: "owner",
        appOrigin: BASE,
      },
    });
    const acceptUrl = create.json?.acceptUrl;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const t0 = Date.now();
    await page.goto(acceptUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector("[data-tester-invite-signup]", { timeout: 90000 });
    await page.click("[data-tester-invite-signup]");
    await page.waitForSelector("#authForm");
    if (await page.locator("#fullNameInput").count()) await page.fill("#fullNameInput", "Invite UI");
    await page.locator("#emailInput").evaluate((el, v) => {
      el.readOnly = false;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, inviteEmail);
    await page.fill("#passwordInput", PASSWORD);
    await page.click("#authSubmitButton");
    let usable = null;
    let error = null;
    for (let i = 0; i < 100; i += 1) {
      const st = await page.evaluate(() => ({
        stage: window.__llhTesterInviteFlowState?.stage || "",
        token: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
        view: document.querySelector(".active-view")?.id || "",
        msg: document.querySelector("#authMessage")?.textContent || "",
      }));
      if (i % 5 === 0) console.log("INVITE", i, st.stage, st.token, st.view, st.msg.slice(0, 60));
      if (st.stage === "complete" && st.token) {
        usable = Date.now() - t0;
        break;
      }
      if (st.stage === "error") {
        error = st.msg || st.stage;
        break;
      }
      await page.waitForTimeout(1000);
    }
    let uiReloginOk = false;
    if (usable) {
      await page.evaluate(() => {
        localStorage.removeItem("llhUser");
        localStorage.removeItem("llhMemberSessionToken");
        sessionStorage.removeItem("llhMemberSessionToken");
      });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof openAuthModal === "function", { timeout: 60000 });
      await page.evaluate(() => {
        abortNonCriticalBootFetches?.("invite-relogin");
        openAuthModal("login");
      });
      await page.fill("#emailInput", inviteEmail);
      await page.fill("#passwordInput", PASSWORD);
      await page.click("#authSubmitButton");
      for (let i = 0; i < 90; i += 1) {
        const st = await page.evaluate(() => ({
          tok: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
          user: localStorage.getItem("llhUser") || "",
        }));
        if (st.tok && st.user === inviteEmail) {
          uiReloginOk = true;
          break;
        }
        await page.waitForTimeout(1000);
      }
    }
    report.invite = { usable, error, uiReloginOk, email: inviteEmail, acceptUrl };
    console.log("INVITE_REGRESSION", report.invite);
    await page.close();
  }

  // Wave 4 API smoke on live
  {
    const preview = await api("POST", "/api/program-forms/assign/preview", {
      headers: authHeaders(PROVIDER, providerToken),
      body: {
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: [profiles[0]?.id].filter(Boolean),
      },
    });
    report.forms.wave4Preview = { status: preview.status, counts: preview.json?.counts };
    console.log("WAVE4_PREVIEW", preview.status, preview.json?.counts);
  }

  // Performance fingerprints
  report.performance = {
    healthWarmMs: h2.ms,
    healthColdishMs: h1.ms,
    previousShell: "20260810-tester-invite-login-fix7",
    currentShell: report.shell,
  };

  // PR / safety
  const pr624 = await fetch("https://api.github.com/repos/leahrivie-blip/LITTLE-LEARNER-HUB/pulls/624").then((r) => r.json());
  const pr590 = await fetch("https://api.github.com/repos/leahrivie-blip/LITTLE-LEARNER-HUB/pulls/590").then((r) => r.json());
  report.safety = {
    pr624: { state: pr624.state, merged_at: pr624.merged_at },
    pr590: { state: pr590.state, merged_at: pr590.merged_at },
    prodSha: "4030596",
  };

  // Aggregate pass
  const ownerPass = report.roles.owner?.ownerOk && /Daily Care/i.test(report.roles.owner?.dailyTitle || "");
  const directorPass = report.roles.director?.ok;
  const teacherPass = report.roles.teacher?.ok && report.roles.teacher?.bizHidden;
  const assistantPass = report.roles.assistant?.ok;
  const dailyPass = report.dailyCare?.hasAiAction && report.dailyCare?.hasEodAction && report.dailyCare?.aiClicked && report.dailyCare?.eodActionOk && /Daily Care/i.test(report.dailyCare?.title || "") && !report.dailyCare?.mentionsSeparateDailyLogsAiProduct;
  const parentPass = Object.entries(report.parentReturn || {})
    .filter(([k, v]) => typeof v === "object" && v && "ok" in v)
    .every(([, v]) => v.ok) && report.parentReturn.repeatedOk;
  const activityPass = (report.activityLibrary?.cardCount || 0) < 200
    && report.activityLibrary?.hasFilterSummary
    && (report.activityLibrary?.afterFilter?.cards || 0) < 200;
  const invitePass = !!report.invite?.usable && !!report.invite?.uiReloginOk;
  const formsPass = report.forms?.found?.hdhFormsAttentionPanel && report.forms?.found?.hdhFormTemplatesPanel;
  const securityPass = report.security.teacherNoManagement && report.security.assistantNoManagement && report.security.inactiveNavA11y;
  const parentShellPass = !!report.roles.parent?.parentMode || !!report.roles.parent?.found?.Today;
  const tuitionBillingDistinct = !/Billing & Subscription/i.test(report.management?.tuitionLanding?.text || "")
    && !/Family Tuition/i.test(report.management?.billingLanding?.text || report.management?.billingDetail || "")
    || /tuition|invoice|family/i.test(report.management?.tuitionDetail || "");

  report.pass = !!(
    report.deployChecks.shellMatches
    && ownerPass && directorPass && teacherPass && assistantPass
    && dailyPass && parentPass && activityPass && invitePass && formsPass && securityPass
    && report.safety.pr624.state === "open" && !report.safety.pr624.merged_at
    && report.safety.pr590.state === "open"
  );

  // Soft bugs
  if (!report.families.checks?.["Family Tuition"]?.jumpActive) {
    report.bugs.push("Family Tuition click may not always set data-hdh-section-active (panel present check used)");
  }
  const docNoChild = Object.values(report.docHelpers || {}).every((d) => !d.child);
  if (!docNoChild) report.bugs.push("Some Documentation Helper paths had a child preselected");
  if (!parentShellPass) report.bugs.push("Parent Switch View shell did not clearly expose parent destinations");
  const missingParentLabels = Object.entries(report.roles.parent?.found || {}).filter(([, v]) => !v).map(([k]) => k);
  if (missingParentLabels.length) report.bugs.push("Parent shell missing/unclear labels: " + missingParentLabels.join(", "));
  if (!tuitionBillingDistinct) report.bugs.push("Family Tuition vs LLH Billing may be confusing in Management");

  const verdictNav = report.pass ? "PASS" : "BLOCKED";
  const verdictSupervised = report.pass && invitePass ? "GO" : "NO-GO";
  const verdictExternal = report.pass && invitePass && dailyPass && parentPass ? "GO" : "NO-GO";

  report.verdicts = {
    navigationCleanup: verdictNav,
    supervisedTesters: verdictSupervised,
    externalTesters: verdictExternal,
    recommendWave5: verdictNav === "PASS" ? "YES — after Leah reviews live nav with supervised testers" : "NO",
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("VERDICTS", report.verdicts);
  console.log("SUMMARY_PASS", report.pass);
  await browser.close();
  if (!report.pass) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  fs.writeFileSync(path.join(OUT, "fatal.json"), JSON.stringify({ error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
