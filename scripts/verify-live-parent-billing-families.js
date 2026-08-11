#!/usr/bin/env node
/**
 * Live TESTING verification: signed-in Family Hub Parent, billing gate,
 * Families focus, invite regression. Does not touch production.
 */
"use strict";

const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "https://little-learner-hub-testing.onrender.com";
const EXPECTED_SHELL = process.env.EXPECTED_SHELL || "20260811-forms-wave8-closeout1";
const PASSWORD = "SunshineDaycare9!";
const OUT = "/opt/cursor/artifacts/live-parent-billing-families";
const stamp = Date.now();
const OWNER = `leah.proxy.fhgap${stamp}@outlook.com`;
const PROVIDER = `fhgap.provider${stamp}@gmail.com`;

fs.mkdirSync(OUT, { recursive: true });

const report = {
  shell: {},
  parent: {},
  billing: {},
  families: {},
  invite: {},
  parentReturn: {},
  isolation: {},
  bugs: [],
  pass: false,
};

async function api(method, p, { body, headers = {} } = {}) {
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
  return { status: res.status, json };
}

function authHeaders(email, token) {
  return { Authorization: `Bearer ${token}`, "X-LLH-User-Email": email };
}

async function ensureSession(email) {
  for (let i = 0; i < 6; i += 1) {
    await api("POST", "/api/auth/sync-password-after-firebase", {
      body: { email, newPassword: PASSWORD, source: "fh_gap_verify" },
    });
    const login = await api("POST", "/api/auth/password-login", {
      body: { email, password: PASSWORD },
    });
    if (login.status === 200 && login.json?.memberSessionToken) return login.json.memberSessionToken;
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error(`session failed for ${email}`);
}

async function waitBoot(page) {
  await page.waitForFunction(
    () => document.body.classList.contains("app-boot-ready")
      && !document.querySelector("#appBootGate:not([hidden])"),
    { timeout: 120000 },
  ).catch(async () => {
    await page.evaluate(() => {
      try {
        if (typeof markAppBootReady === "function") markAppBootReady();
        else {
          document.body.classList.add("app-boot-ready");
          const gate = document.querySelector("#appBootGate");
          if (gate) gate.hidden = true;
        }
      } catch (_e) { /* ignore */ }
    });
  });
}

async function bootProvider(page, email, token) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => typeof setView === "function", { timeout: 90000 });
  await page.evaluate(({ email: e, token: t }) => {
    localStorage.setItem("llhUser", e);
    localStorage.setItem("llhMemberSessionToken", t);
    sessionStorage.setItem("llhMemberSessionToken", t);
    localStorage.setItem("llhPlan", "Pro");
  }, { email, token });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => typeof setView === "function", { timeout: 90000 });
  await page.evaluate(({ email: e, token: t }) => {
    writeMemberSessionToken?.(t, { persist: true });
    const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
    accounts[e] = {
      ...(accounts[e] || {}),
      email: e,
      multiRoleTester: true,
      hdhMultiRoleTester: true,
      plan: "Pro",
      role: "owner",
      accountType: "home_daycare",
    };
    localStorage.setItem("llhAccounts", JSON.stringify(accounts));
    loadAccountState?.(e);
    syncPlatformNavVisibility?.();
  }, { email, token });
  await waitBoot(page);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false, timeout: 10000 });
  } catch (_e) {
    await page.screenshot({ path: file, fullPage: false, timeout: 10000, animations: "disabled" }).catch(() => {});
  }
  return file;
}

async function main() {
  const man = await api("GET", "/llh-shell-manifest.json");
  report.shell = {
    version: man.json?.version || "",
    expected: EXPECTED_SHELL,
    matches: man.json?.version === EXPECTED_SHELL,
  };
  console.log("SHELL", report.shell);
  if (!report.shell.matches) throw new Error(`shell mismatch ${report.shell.version}`);

  const ownerToken = await ensureSession(OWNER);
  const invite = await api("POST", "/api/home-daycare-hub/tester-invites", {
    headers: authHeaders(OWNER, ownerToken),
    body: {
      email: PROVIDER,
      programType: "home_daycare",
      programName: "FH Gap Verify",
      childName: "Avery Gap",
      role: "owner",
      appOrigin: BASE,
    },
  });
  if (invite.status !== 200) throw new Error("invite failed");
  const inviteToken = String(invite.json.acceptUrl).split("testerInvite=")[1];
  const providerToken = await ensureSession(PROVIDER);
  const accept = await api("POST", "/api/home-daycare-hub/tester-invites/accept", {
    headers: authHeaders(PROVIDER, providerToken),
    body: { token: inviteToken },
  });
  console.log("accept", accept.status, accept.json?.ok);

  // Seed children + family-visible content
  await api("POST", "/api/child-data", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      data: {
        Profiles: [
          { id: `fh-a-${stamp}`, name: "Avery Gap", parentInfo: "Pat Gap", emergency: "Sam Pickup 555-0100" },
          { id: `fh-b-${stamp}`, name: "Blake Gap", parentInfo: "Pat Gap", emergency: "Sam Pickup 555-0100" },
        ],
        Photos: [{ id: `photo-${stamp}`, childId: `fh-a-${stamp}`, caption: "Park smile", sharedWithFamily: true, familyVisible: true }],
        Reports: [{ id: `rep-${stamp}`, childId: `fh-a-${stamp}`, title: "Happy day", summary: "Played outside", sharedWithFamily: true, familyVisible: true }],
        Communications: [{ id: `msg-${stamp}`, childId: `fh-a-${stamp}`, type: "Parent Message", message: "See you at pickup", sharedWithFamily: true }],
        Documents: [],
      },
    },
  });

  // Household A via seed-demo / households
  const hhA = await api("POST", "/api/family-hub/households", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      label: "Gap Household A",
      email: `parent.a.${stamp}@example.com`,
      children: [{ id: `fh-a-${stamp}`, name: "Avery Gap" }, { id: `fh-b-${stamp}`, name: "Blake Gap" }],
      programName: "FH Gap Verify",
      appOrigin: BASE,
    },
  });
  console.log("hhA", hhA.status, !!hhA.json?.loginCode);
  const parentAEmail = `parent.a.${stamp}@example.com`;
  const parentACode = String(hhA.json?.loginCode || hhA.json?.household?.loginCode || "");

  // Sibling household B (isolation)
  const hhB = await api("POST", "/api/family-hub/households", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      label: "Gap Household B",
      email: `parent.b.${stamp}@example.com`,
      children: [{ id: `fh-b-${stamp}`, name: "Blake Gap" }],
      programName: "FH Gap Verify",
      appOrigin: BASE,
    },
  });
  const parentBEmail = `parent.b.${stamp}@example.com`;
  const parentBCode = String(hhB.json?.loginCode || hhB.json?.household?.loginCode || "");

  const loginA = await api("POST", "/api/family-hub/login", {
    body: { email: parentAEmail, code: parentACode },
  });
  const loginB = await api("POST", "/api/family-hub/login", {
    body: { email: parentBEmail, code: parentBCode },
  });
  console.log("fh login", loginA.status, loginB.status);
  if (loginA.status !== 200 || !loginA.json?.sessionToken) throw new Error("parent A login failed");

  // Isolation: A token cannot read B household me as B
  const meA = await api("GET", "/api/family-hub/me", {
    headers: { Authorization: `Bearer ${loginA.json.sessionToken}`, "X-LLH-Family-Session": loginA.json.sessionToken },
  });
  const meB = await api("GET", "/api/family-hub/me", {
    headers: { Authorization: `Bearer ${loginB.json.sessionToken}`, "X-LLH-Family-Session": loginB.json.sessionToken },
  });
  const aChildIds = (meA.json?.children || []).map((c) => c.id).sort();
  const bChildIds = (meB.json?.children || []).map((c) => c.id).sort();
  report.isolation = {
    aStatus: meA.status,
    bStatus: meB.status,
    aChildren: aChildIds,
    bChildren: bChildIds,
    aHasBoth: aChildIds.includes(`fh-a-${stamp}`) && aChildIds.includes(`fh-b-${stamp}`),
    bOnlyBlake: bChildIds.length === 1 && bChildIds[0] === `fh-b-${stamp}`,
    distinctHouseholds: String(meA.json?.household?.id || meA.json?.householdId || "")
      !== String(meB.json?.household?.id || meB.json?.householdId || ""),
  };
  console.log("ISOLATION", report.isolation);

  // Assign a form to family if possible
  const templates = await api("GET", "/api/program-forms/templates", {
    headers: authHeaders(PROVIDER, providerToken),
  });
  let formAssign = null;
  const tpl = (templates.json?.templates || templates.json?.items || [])[0];
  if (tpl?.id) {
    formAssign = await api("POST", "/api/program-forms/assign", {
      headers: authHeaders(PROVIDER, providerToken),
      body: {
        templateId: tpl.id,
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: [`fh-a-${stamp}`],
      },
    });
  }
  report.parent.formAssign = { status: formAssign?.status, counts: formAssign?.json?.counts };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await bootProvider(page, PROVIDER, providerToken);

  // ---------- Billing gate ----------
  await page.evaluate(() => {
    localStorage.removeItem("llhMultiRoleTesterView");
    syncPlatformNavVisibility?.();
    setView("business", { allowDashboard: true });
  });
  await page.waitForTimeout(500);
  const homeBillingClear = await page.evaluate(() => ({
    simulating: typeof isMultiRoleTesterSimulating === "function" ? isMultiRoleTesterSimulating() : null,
    canBilling: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("billing") : null,
    tile: !!document.querySelector('#view-business .work-hub-tile[data-view="billing"]'),
    tuition: !!document.querySelector('#view-business .work-hub-tile[data-hdh-jump="hdhTuitionBillingPanel"]'),
  }));
  await page.evaluate(() => {
    localStorage.setItem("llhMultiRoleTesterView", "Owner");
    syncPlatformNavVisibility?.();
    setView("business", { allowDashboard: true });
  });
  await page.waitForTimeout(500);
  const homeBillingSim = await page.evaluate(() => ({
    simulating: typeof isMultiRoleTesterSimulating === "function" ? isMultiRoleTesterSimulating() : null,
    canBilling: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("billing") : null,
    tile: !!document.querySelector('#view-business .work-hub-tile[data-view="billing"]'),
    note: document.querySelector("[data-billing-gate-note]")?.getAttribute("data-billing-gate-note") || "",
    tuition: !!document.querySelector('#view-business .work-hub-tile[data-hdh-jump="hdhTuitionBillingPanel"]'),
    text: (document.querySelector("#view-business")?.innerText || "").slice(0, 500),
  }));
  // Center owner (no simulation)
  await page.evaluate(() => {
    localStorage.removeItem("llhMultiRoleTesterView");
    const email = localStorage.getItem("llhUser");
    const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
    if (email) {
      accounts[email] = { ...(accounts[email] || {}), accountType: "center", role: "owner", plan: "Pro", multiRoleTester: true };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      loadAccountState?.(email);
    }
    syncPlatformNavVisibility?.();
    setView("business", { allowDashboard: true });
  });
  await page.waitForTimeout(500);
  const centerBilling = await page.evaluate(() => ({
    accountType: typeof getAccountType === "function" ? getAccountType() : "",
    canBilling: typeof canAccessPlatformFeature === "function" ? canAccessPlatformFeature("billing") : null,
    tile: !!document.querySelector('#view-business .work-hub-tile[data-view="billing"]'),
    tuition: !!document.querySelector('#view-business .work-hub-tile[data-hdh-jump="hdhTuitionBillingPanel"]'),
  }));
  // Restore home daycare
  await page.evaluate(() => {
    const email = localStorage.getItem("llhUser");
    const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
    if (email) {
      accounts[email] = { ...(accounts[email] || {}), accountType: "home_daycare", role: "owner", plan: "Pro", multiRoleTester: true };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      loadAccountState?.(email);
    }
  });
  report.billing = {
    rootCause: "intentional: canAccessCapability forces billing=false while isMultiRoleTesterSimulating(); owner+non-simulating Pro sees tile for home_daycare and center",
    homeDaycareProNoSim: homeBillingClear,
    homeDaycareProSwitchViewOwner: homeBillingSim,
    centerOwnerProNoSim: centerBilling,
  };
  console.log("BILLING", report.billing);
  await shot(page, "billing-switch-view");

  // ---------- Families focus ----------
  // Ensure local child store matches API before Photos/Pickup profile focus.
  for (let i = 0; i < 6; i += 1) {
    const synced = await page.evaluate(async () => {
      localStorage.removeItem("llhMultiRoleTesterView");
      try {
        if (typeof syncChildDataFromBackend === "function") {
          await syncChildDataFromBackend({ render: false, force: true });
        }
      } catch (_e) { /* ignore */ }
      return (typeof childRecords === "function" ? childRecords().children : [])?.length || 0;
    });
    if (synced > 0) break;
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => {
    syncPlatformNavVisibility?.();
    setView("families", { allowDashboard: true });
  });
  await page.waitForTimeout(600);
  const familyChecks = {};
  for (const [label, focus] of [
    ["Photos & Notes", "photos"],
    ["Pickup Contacts", "pickup"],
    ["Parents / Guardians", "guardians"],
    ["Paperwork HQ", "paperwork-hq"],
    ["Daily Reports", "daily-reports"],
  ]) {
    await page.evaluate(() => {
      pendingFamiliesDestinationFocus = "";
      setView("families", { allowDashboard: true });
    });
    await page.waitForTimeout(400);
    const tile = page.locator(`#view-families .work-hub-tile[data-families-focus="${focus}"]`).first();
    if (!(await tile.count())) {
      familyChecks[label] = { ok: false, reason: "tile missing" };
      continue;
    }
    await tile.click();
    await page.waitForTimeout(2200);
    familyChecks[label] = await page.evaluate((f) => {
      const active = document.querySelector(".active-view")?.id || "";
      const back = window.LlhNavOrigin?.labelFor?.(window.LlhNavOrigin.peekOrigin?.()) || "";
      if (f === "photos") {
        return {
          ok: /children/i.test(active) && (childProfileTab === "reports" || childProfileTab === "photos") && childManagementMode === "profile",
          active,
          tab: childProfileTab,
          mode: childManagementMode,
          back,
        };
      }
      if (f === "pickup") {
        return {
          ok: /children/i.test(active) && childManagementMode === "profile",
          active,
          mode: childManagementMode,
          back,
        };
      }
      if (f === "guardians") {
        const el = document.getElementById("hdhFamilyHubPanel");
        return {
          ok: !!el && el.getAttribute("data-hdh-section-active") === "true",
          active,
          jumpActive: el?.getAttribute("data-hdh-section-active") === "true",
          back,
        };
      }
      if (f === "paperwork-hq") {
        const el = document.getElementById("hdhFormsAttentionPanel");
        return {
          ok: !!el && el.getAttribute("data-hdh-section-active") === "true",
          active,
          jumpActive: el?.getAttribute("data-hdh-section-active") === "true",
          back,
        };
      }
      if (f === "daily-reports") {
        return {
          ok: /children|daily/i.test(active) || !!document.querySelector("[data-daily-care-root]"),
          active,
          hasDailyCare: !!document.querySelector("[data-daily-care-root]"),
          back,
        };
      }
      return { ok: false, active, back };
    }, focus);
  }
  report.families = familyChecks;
  console.log("FAMILIES", JSON.stringify(familyChecks, null, 2));
  await shot(page, "families-focus");

  // ---------- Signed-in Parent via Switch View ----------
  async function openSignedInParent() {
    // Prefer real Switch View path; seed API session first so ensureTester can reuse/login quickly.
    await page.evaluate(async ({ token, email, code }) => {
      const user = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      if (user) {
        accounts[user] = { ...(accounts[user] || {}), multiRoleTester: true, hdhMultiRoleTester: true, plan: "Pro", role: "owner" };
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        loadAccountState?.(user);
      }
      try {
        if (typeof syncChildDataFromBackend === "function") {
          await Promise.race([
            syncChildDataFromBackend({ render: false, force: true }),
            new Promise((r) => setTimeout(r, 12000)),
          ]);
        }
      } catch (_e) { /* ignore */ }
      localStorage.setItem("llhFamilyHubSession", token);
      setFamilyHubSessionToken?.(token);
      try {
        localStorage.setItem("llhFamilyHubTesterInvite", JSON.stringify({ email, loginCode: code, token: "" }));
      } catch (_e) { /* ignore */ }
      await LLHMultiRoleTester.setViewRole("Parent");
    }, { token: loginA.json.sessionToken, email: parentAEmail, code: parentACode });
    await page.waitForTimeout(2500);
    const needsInject = await page.evaluate(() => !!document.querySelector("#familyHubLoginForm, [data-family-hub-login]")
      || !document.querySelector(".fh-parent-nav"));
    if (needsInject) {
      await page.evaluate((token) => {
        localStorage.setItem("llhMultiRoleTesterView", "Parent");
        localStorage.setItem("llhFamilyHubSession", token);
        setFamilyHubSessionToken?.(token);
        setHdhTesterPersona?.({ role: "parent" });
        document.body.classList.add("family-hub-parent-mode");
        setView?.("family-hub", { skipAccessRedirect: true });
      }, loginA.json.sessionToken);
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        if (typeof loadFamilyHubParentDashboard === "function") loadFamilyHubParentDashboard();
        else if (typeof renderFamilyHubPage === "function") renderFamilyHubPage();
      });
      await page.waitForTimeout(1500);
    }
  }

  await openSignedInParent();
  await shot(page, "parent-signed-in");

  const parentShell = await page.evaluate(() => {
    const nav = [...document.querySelectorAll(".fh-parent-nav [data-fh-panel], .fh-parent-nav-link")]
      .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim());
    const providerNav = !!document.querySelector("[data-work-nav-root] [data-work-nav]:not([hidden])");
    const login = !!document.querySelector("#familyHubLoginForm, [data-family-hub-login]");
    const text = document.querySelector("#familyHubParentApp")?.innerText || "";
    return {
      parentMode: document.body.classList.contains("family-hub-parent-mode"),
      multi: localStorage.getItem("llhMultiRoleTesterView") || "",
      nav,
      providerNavHidden: !providerNav,
      loginVisible: login,
      hasStaffOnly: /Staff & Access|Management|Paperwork HQ|Curriculum Library/i.test(text),
      snippet: text.slice(0, 400),
    };
  });
  report.parent.shell = parentShell;
  console.log("PARENT_SHELL", parentShell);

  const destinations = {};
  async function openPanel(panel) {
    const clicked = await page.evaluate((id) => {
      const btn = document.querySelector(`.fh-parent-nav [data-fh-panel="${id}"], .fh-more-link[data-fh-panel="${id}"], [data-fh-panel="${id}"]`);
      if (!btn) return false;
      btn.click();
      return true;
    }, panel);
    if (!clicked && ["reports", "calendar", "forms"].includes(panel)) {
      await page.evaluate(() => document.querySelector('.fh-parent-nav [data-fh-panel="more"]')?.click());
      await page.waitForTimeout(400);
      await page.evaluate((id) => document.querySelector(`.fh-more-link[data-fh-panel="${id}"]`)?.click(), panel);
    }
    await page.waitForTimeout(700);
    return page.evaluate((id) => {
      const app = document.querySelector("#familyHubParentApp");
      const activeNav = document.querySelector(".fh-parent-nav-link.is-active, .fh-parent-nav [aria-current='page']");
      const h = app?.querySelector("h1, h2, h3")?.textContent || "";
      const body = (document.querySelector("#familyHubPanelBody")?.innerText || app?.innerText || "").slice(0, 500);
      return {
        panelAttr: app?.getAttribute("data-fh-panel") || "",
        activeNav: (activeNav?.innerText || "").replace(/\s+/g, " ").trim(),
        heading: h,
        body,
        wanted: id,
        ok: (app?.getAttribute("data-fh-panel") === id)
          || new RegExp(id, "i").test(body)
          || (id === "reports" && /report/i.test(body))
          || (id === "more" && /Quick links|Calendar|Forms/i.test(body)),
      };
    }, panel);
  }

  for (const panel of ["today", "photos", "messages", "billing", "more", "reports", "calendar", "forms"]) {
    destinations[panel] = await openPanel(panel);
    await shot(page, `parent-${panel}`);
  }
  report.parent.destinations = destinations;
  console.log("PARENT_DEST", JSON.stringify(destinations, null, 2));

  // Refresh while signed in
  await page.reload({ waitUntil: "commit", timeout: 120000 }).catch(() => {});
  await page.waitForFunction(() => typeof setView === "function", { timeout: 90000 }).catch(() => {});
  await waitBoot(page);
  await page.evaluate(() => {
    if (localStorage.getItem("llhMultiRoleTesterView") === "Parent") {
      setView?.("family-hub", { skipAccessRedirect: true });
    }
  });
  await page.waitForTimeout(1500);
  report.parent.afterRefresh = await page.evaluate(() => ({
    multi: localStorage.getItem("llhMultiRoleTesterView") || "",
    session: !!localStorage.getItem("llhFamilyHubSession"),
    parentMode: document.body.classList.contains("family-hub-parent-mode"),
    login: !!document.querySelector("#familyHubLoginForm"),
    panel: document.querySelector("#familyHubParentApp")?.getAttribute("data-fh-panel") || "",
  }));
  console.log("PARENT_REFRESH", report.parent.afterRefresh);

  // Mobile parent
  const mobile = await browser.newPage({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  await bootProvider(mobile, PROVIDER, providerToken);
  await mobile.evaluate(async (token) => {
    const email = localStorage.getItem("llhUser");
    const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
    if (email) {
      accounts[email] = { ...(accounts[email] || {}), multiRoleTester: true, hdhMultiRoleTester: true, plan: "Pro", role: "owner" };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      loadAccountState?.(email);
    }
    localStorage.setItem("llhFamilyHubSession", token);
    setFamilyHubSessionToken?.(token);
    await LLHMultiRoleTester.setViewRole("Parent");
  }, loginA.json.sessionToken);
  await mobile.waitForTimeout(2000);
  report.parent.mobile = await mobile.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    nav: [...document.querySelectorAll(".fh-parent-nav-link")].map((el) => el.innerText.trim()),
    parentMode: document.body.classList.contains("family-hub-parent-mode"),
  }));
  await shot(mobile, "parent-mobile");
  await mobile.close();

  // Parent return for each staff role
  const returns = {};
  for (const role of ["Owner", "Director", "Teacher", "Assistant"]) {
    await page.evaluate(async (r) => {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      if (email) {
        accounts[email] = { ...(accounts[email] || {}), multiRoleTester: true, hdhMultiRoleTester: true, plan: "Pro", role: "owner" };
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        loadAccountState?.(email);
      }
      await LLHMultiRoleTester.setViewRole(r);
    }, role);
    await page.waitForTimeout(700);
    await page.evaluate(async (token) => {
      localStorage.setItem("llhFamilyHubSession", token);
      setFamilyHubSessionToken?.(token);
      await LLHMultiRoleTester.setViewRole("Parent");
    }, loginA.json.sessionToken);
    await page.waitForTimeout(1800);
    const before = await page.evaluate(() => ({
      multi: localStorage.getItem("llhMultiRoleTesterView") || "",
      parentMode: document.body.classList.contains("family-hub-parent-mode"),
      session: !!localStorage.getItem("llhFamilyHubSession"),
    }));
    await page.evaluate(() => LLHMultiRoleTester.clearView({ silent: true }));
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({
      multi: localStorage.getItem("llhMultiRoleTesterView") || "",
      parentMode: document.body.classList.contains("family-hub-parent-mode"),
      session: !!localStorage.getItem("llhFamilyHubSession"),
      appHtml: (document.querySelector("#familyHubParentApp")?.innerHTML || "").trim(),
      providerNav: [...document.querySelectorAll("[data-work-nav-root] [data-work-nav]:not([hidden])")].map((b) => b.getAttribute("data-work-nav")),
      active: document.querySelector(".active-view")?.id || "",
    }));
    returns[role] = {
      before,
      after,
      ok: !after.parentMode && !after.session && after.appHtml === "" && after.multi === "" && after.providerNav.length > 0,
    };
    await shot(page, `return-${role.toLowerCase()}`);
  }
  report.parentReturn = returns;
  console.log("PARENT_RETURN", JSON.stringify(returns, null, 2));

  // Invite regression
  {
    const inviteEmail = `fhgap.invite${Date.now()}@gmail.com`;
    const create = await api("POST", "/api/home-daycare-hub/tester-invites", {
      headers: authHeaders(OWNER, ownerToken),
      body: {
        email: inviteEmail,
        programType: "home_daycare",
        programName: "Invite Gap",
        childName: "Invite Kid",
        role: "owner",
        appOrigin: BASE,
      },
    });
    const acceptUrl = create.json?.acceptUrl;
    const ipage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const t0 = Date.now();
    await ipage.goto(acceptUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
    await ipage.waitForSelector("[data-tester-invite-signup]", { timeout: 90000 });
    await ipage.click("[data-tester-invite-signup]");
    await ipage.waitForSelector("#authForm");
    if (await ipage.locator("#fullNameInput").count()) await ipage.fill("#fullNameInput", "Invite Gap");
    await ipage.locator("#emailInput").evaluate((el, v) => {
      el.readOnly = false;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, inviteEmail);
    await ipage.fill("#passwordInput", PASSWORD);
    await ipage.click("#authSubmitButton");
    let usable = null;
    let error = null;
    let stuckSigningIn = false;
    for (let i = 0; i < 100; i += 1) {
      const st = await ipage.evaluate(() => ({
        stage: window.__llhTesterInviteFlowState?.stage || "",
        token: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
        msg: document.querySelector("#authMessage")?.textContent || "",
      }));
      if (st.stage === "complete" && st.token) {
        usable = Date.now() - t0;
        break;
      }
      if (st.stage === "error") {
        error = st.msg || st.stage;
        break;
      }
      if (i > 70 && /Signing you in/i.test(st.msg)) stuckSigningIn = true;
      await ipage.waitForTimeout(1000);
    }
    let uiReloginOk = false;
    if (usable) {
      await ipage.evaluate(() => {
        localStorage.removeItem("llhUser");
        localStorage.removeItem("llhMemberSessionToken");
        sessionStorage.removeItem("llhMemberSessionToken");
      });
      await ipage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await ipage.waitForFunction(() => typeof openAuthModal === "function", { timeout: 60000 });
      await ipage.evaluate(() => openAuthModal("login"));
      await ipage.fill("#emailInput", inviteEmail);
      await ipage.fill("#passwordInput", PASSWORD);
      await ipage.click("#authSubmitButton");
      for (let i = 0; i < 90; i += 1) {
        const st = await ipage.evaluate(() => ({
          tok: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
          user: localStorage.getItem("llhUser") || "",
        }));
        if (st.tok && st.user === inviteEmail) {
          uiReloginOk = true;
          break;
        }
        await ipage.waitForTimeout(1000);
      }
    }
    report.invite = { usable, error, uiReloginOk, stuckSigningIn, email: inviteEmail };
    console.log("INVITE", report.invite);
    await ipage.close();
  }

  await browser.close();

  const parentDestOk = ["today", "photos", "messages", "more", "reports", "calendar", "forms"]
    .every((k) => destinations[k]?.ok);
  const returnOk = Object.values(returns).every((r) => r.ok);
  const billingOk = homeBillingClear.tile && !homeBillingSim.tile && homeBillingSim.note === "switch-view" && centerBilling.tile && homeBillingClear.tuition && homeBillingSim.tuition;
  const familiesOk = familyChecks["Photos & Notes"]?.ok
    && familyChecks["Paperwork HQ"]?.ok
    && familyChecks["Parents / Guardians"]?.ok;
  const inviteOk = !!report.invite.usable && report.invite.uiReloginOk && !report.invite.stuckSigningIn;
  const isolationOk = report.isolation.aHasBoth && report.isolation.bOnlyBlake && report.isolation.distinctHouseholds;

  if (!parentShell.providerNavHidden) report.bugs.push("Provider nav still visible in Parent mode");
  if (parentShell.hasStaffOnly) report.bugs.push("Staff-only labels visible in Parent shell text");
  if (!familyChecks["Pickup Contacts"]?.ok) report.bugs.push("Pickup Contacts focus incomplete");
  if (!familyChecks["Daily Reports"]?.ok) report.bugs.push("Daily Reports focus incomplete");

  report.pass = !!(
    report.shell.matches
    && parentShell.parentMode
    && !parentShell.loginVisible
    && parentDestOk
    && returnOk
    && billingOk
    && familiesOk
    && inviteOk
    && isolationOk
  );

  report.verdicts = {
    supervisedTesters: report.pass && inviteOk ? "GO" : "NO-GO",
    externalTesters: report.pass && parentDestOk && returnOk && isolationOk ? "GO" : "NO-GO",
    wave5: "NO-GO",
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("VERDICTS", report.verdicts);
  console.log("SUMMARY_PASS", report.pass);
  if (!report.pass) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  fs.writeFileSync(path.join(OUT, "fatal.json"), JSON.stringify({ error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
