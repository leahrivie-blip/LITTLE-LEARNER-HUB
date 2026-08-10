#!/usr/bin/env node
/**
 * Live testing-site verification after tester-invite login/perf fix.
 * Creates disposable invites via provider API, then runs Playwright flows.
 */
"use strict";

const { chromium, devices } = require("playwright");

const BASE = process.env.TESTING_BASE_URL || "https://little-learner-hub-testing.onrender.com";
const PASSWORD = "SunshineDaycare9!";
const OWNER = `leah.proxy.owner${Date.now()}@outlook.com`;

async function api(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms: 0 };
}

async function timedFetch(path, init = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, init);
  const ms = Date.now() - t0;
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, ms, json, text };
}

async function createInvite({ email, programType, programName, childName }) {
  // Ensure owner exists with password session first (Firebase-less path).
  await api("POST", "/api/auth/sync-password-after-firebase", {
    body: { email: OWNER, newPassword: PASSWORD, source: "live_verify_owner" },
  });
  const login = await api("POST", "/api/auth/password-login", {
    body: { email: OWNER, password: PASSWORD },
  });
  const token = login.json?.memberSessionToken || "";
  const create = await api("POST", "/api/home-daycare-hub/tester-invites", {
    headers: {
      Authorization: token ? `Bearer ${token}` : `Bearer test:${OWNER}`,
      "X-LLH-User-Email": OWNER,
    },
    body: {
      email,
      childName,
      programName,
      programType,
      role: "owner",
      appOrigin: BASE,
    },
  });
  const acceptUrl = create.json?.acceptUrl || "";
  const inviteToken = acceptUrl.split("testerInvite=")[1] || "";
  return { create, acceptUrl, inviteToken, ownerToken: token };
}

async function runInviteFlow({ label, acceptUrl, email, slow = false, mobile = false }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    mobile
      ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }
      : { viewport: { width: 1280, height: 800 } },
  );
  if (slow) {
    // Intentionally slow network (~Regular 3G-ish).
    await context.route("**/*", async (route) => {
      await new Promise((r) => setTimeout(r, 120));
      return route.continue();
    });
  }
  const page = await context.newPage();
  const t0 = Date.now();
  const timings = { label, slow, mobile };
  const apiCalls = [];
  page.on("request", (req) => { req._t = Date.now(); });
  page.on("response", (res) => {
    const u = res.url().replace(BASE, "");
    if (!/\/api\//.test(u) && !/app\.js|llh-shell|service-worker/.test(u)) return;
    apiCalls.push({
      method: res.request().method(),
      status: res.status(),
      ms: Date.now() - (res.request()._t || Date.now()),
      u: u.split("?")[0],
      at: Date.now() - t0,
    });
  });

  await page.goto(acceptUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  timings.domContentLoaded = Date.now() - t0;
  await page.waitForSelector("[data-tester-invite-signup], [data-tester-invite-login]", { timeout: 120000 });
  timings.invitePanelVisible = Date.now() - t0;

  const signup = page.locator("[data-tester-invite-signup]");
  if (await signup.count()) {
    await signup.click();
  } else {
    await page.click("[data-tester-invite-login]");
  }
  await page.waitForSelector("#authForm", { timeout: 30000 });
  timings.setupPanelOpen = Date.now() - t0;
  if (await page.locator("#fullNameInput").count()) await page.fill("#fullNameInput", "Live Verify Provider");
  else if (await page.locator("#firstNameInput").count()) {
    await page.fill("#firstNameInput", "Live");
    if (await page.locator("#lastNameInput").count()) await page.fill("#lastNameInput", "Verify");
  }
  await page.locator("#emailInput").evaluate((el, v) => {
    el.readOnly = false;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, email);
  await page.fill("#passwordInput", PASSWORD);
  timings.passwordSubmit = Date.now() - t0;
  await page.click("#authSubmitButton");

  let stuck = false;
  for (let i = 0; i < 120; i += 1) {
    const state = await page.evaluate(() => ({
      stage: window.__llhTesterInviteFlowState?.stage || "",
      error: window.__llhTesterInviteFlowState?.error || window.__llhLastTesterInviteAcceptError || "",
      msg: document.querySelector("#authMessage")?.textContent || "",
      user: localStorage.getItem("llhUser") || "",
      token: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
      view: document.querySelector(".view.active-view")?.id || "",
      inviteOpen: document.body.classList.contains("tester-invite-open"),
    }));
    if (i % 3 === 0) console.log(`[${label}] T+${Date.now() - t0}`, JSON.stringify(state));
    if (state.stage === "complete" && state.token && state.view === "view-children") {
      timings.usable = Date.now() - t0;
      timings.finalStage = state.stage;
      break;
    }
    if (state.stage === "error" || /could not|failed|try again|tap Log In/i.test(`${state.msg} ${state.error}`)) {
      timings.errorAt = Date.now() - t0;
      timings.error = state.error || state.msg;
      break;
    }
    if (i > 90 && /signing|creating|connecting|saving/i.test(state.msg) && !state.token) {
      stuck = true;
      timings.stuckAt = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(1000);
  }

  // refresh persistence
  if (timings.usable) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const afterRefresh = await page.evaluate(() => ({
      user: localStorage.getItem("llhUser") || "",
      token: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
    }));
    timings.refreshOk = afterRefresh.user === email && afterRefresh.token === true;

    // logout + login
    await page.evaluate(() => {
      try {
        localStorage.removeItem("llhUser");
        localStorage.removeItem("llhMemberSessionToken");
        sessionStorage.removeItem("llhMemberSessionToken");
      } catch (_e) { /* ignore */ }
    });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof openAuthModal === "function", { timeout: 60000 });
    await page.evaluate(() => openAuthModal("login"));
    await page.fill("#emailInput", email);
    await page.fill("#passwordInput", PASSWORD);
    const loginStart = Date.now();
    await page.click("#authSubmitButton");
    await page.waitForFunction(() => {
      return !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken"));
    }, { timeout: 60000 });
    timings.reloginMs = Date.now() - loginStart;
    timings.reloginOk = true;
  }

  const authApis = apiCalls.filter((a) => /password|invite|auth|child-data/.test(a.u));
  const repeats = {};
  apiCalls.filter((a) => a.u.startsWith("/api/")).forEach((a) => {
    const k = `${a.method} ${a.u}`;
    repeats[k] = (repeats[k] || 0) + 1;
  });
  timings.authApis = authApis;
  timings.apiRepeatCounts = repeats;
  timings.stuck = stuck;
  timings.shell = await page.evaluate(() => {
    const scripts = [...document.scripts].map((s) => s.src);
    return scripts.find((s) => /app\.js/.test(s)) || "";
  });

  await browser.close();
  return timings;
}

async function main() {
  const health1 = await timedFetch("/api/health");
  const health2 = await timedFetch("/api/health");
  const manifest = await timedFetch("/llh-shell-manifest.json");
  const index = await timedFetch("/");
  console.log("HEALTH_1", health1.status, health1.ms);
  console.log("HEALTH_2", health2.status, health2.ms);
  console.log("MANIFEST", manifest.json);
  console.log("INDEX", index.status, index.ms);

  const hdEmail = `jamie.hd.provider${Date.now()}@gmail.com`;
  const centerEmail = `center.live.provider${Date.now()}@outlook.com`;
  const hd = await createInvite({
    email: hdEmail,
    programType: "home_daycare",
    programName: "Jamie Live Home Daycare",
    childName: "Jamie Kid",
  });
  const center = await createInvite({
    email: centerEmail,
    programType: "center",
    programName: "Live Center Program",
    childName: "Center Kid",
  });
  console.log("HD_INVITE", hd.create.status, hd.acceptUrl);
  console.log("CENTER_INVITE", center.create.status, center.acceptUrl);
  if (!hd.acceptUrl || !center.acceptUrl) {
    throw new Error(`invite create failed hd=${JSON.stringify(hd.create.json)} center=${JSON.stringify(center.create.json)}`);
  }

  const hdResult = await runInviteFlow({
    label: "home-daycare-mobile",
    acceptUrl: hd.acceptUrl,
    email: hdEmail,
    mobile: true,
  });
  console.log("HD_RESULT", JSON.stringify(hdResult, null, 2));

  const centerResult = await runInviteFlow({
    label: "center-desktop",
    acceptUrl: center.acceptUrl,
    email: centerEmail,
    mobile: false,
  });
  console.log("CENTER_RESULT", JSON.stringify(centerResult, null, 2));

  // Slow-network HD using a third invite
  const slowEmail = `slow.hd.provider${Date.now()}@gmail.com`;
  const slowInvite = await createInvite({
    email: slowEmail,
    programType: "home_daycare",
    programName: "Slow Net Home",
    childName: "Slow Kid",
  });
  const slowResult = await runInviteFlow({
    label: "home-daycare-slow",
    acceptUrl: slowInvite.acceptUrl,
    email: slowEmail,
    mobile: true,
    slow: true,
  });
  console.log("SLOW_RESULT", JSON.stringify(slowResult, null, 2));

  // Existing accepted tester relogin (from earlier repro), if still valid.
  const existingEmail = process.env.EXISTING_TESTER_EMAIL || "jamie.rivera.provider1786387111@gmail.com";
  const existingLogin = await timedFetch("/api/auth/password-login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: existingEmail, password: PASSWORD }),
  });
  console.log("EXISTING_TESTER_LOGIN", existingLogin.status, existingLogin.ms, existingLogin.json?.ok || existingLogin.json?.error || "");

  // Already-accepted invite should not hang
  const peekAccepted = await timedFetch("/api/home-daycare-hub/tester-invites/peek", {
    headers: { Accept: "application/json", "X-LLH-Invite-Token": hd.inviteToken },
  });
  console.log("PEEK_AFTER_ACCEPT", peekAccepted.status, peekAccepted.ms, peekAccepted.json?.invite?.status);

  const report = {
    shell: manifest.json?.version || null,
    healthColdMs: health1.ms,
    healthWarmMs: health2.ms,
    indexMs: index.ms,
    hdResult,
    centerResult,
    slowResult,
    existingTesterLogin: { status: existingLogin.status, ms: existingLogin.ms, ok: existingLogin.status === 200 },
    peekAcceptedStatus: peekAccepted.json?.invite?.status || null,
  };
  const pass = report.shell === "20260810-tester-invite-login-fix"
    && hdResult.usable
    && centerResult.usable
    && slowResult.usable
    && !hdResult.stuck
    && !centerResult.stuck
    && !slowResult.stuck
    && hdResult.refreshOk
    && hdResult.reloginOk
    && centerResult.reloginOk;
  report.pass = pass;
  report.verdict = pass
    ? "YES — NEW REAL TESTER INVITES ARE RELIABLE"
    : "NO — TESTER INVITES STILL NOT RELIABLE";
  console.log("REPORT", JSON.stringify(report, null, 2));
  if (!pass) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
