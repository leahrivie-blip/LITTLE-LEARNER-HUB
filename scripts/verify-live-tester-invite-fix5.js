#!/usr/bin/env node
"use strict";

const { chromium, devices } = require("playwright");

const BASE = "https://little-learner-hub-testing.onrender.com";
const PASSWORD = "SunshineDaycare9!";
const OWNER = `leah.proxy.owner${Date.now()}@outlook.com`;
const EXPECTED_SHELL = process.env.EXPECTED_SHELL || "20260810-provider-nav-ia-cleanup4";

async function api(method, path, { body, headers = {} } = {}) {
  const t0 = Date.now();
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
  return { status: res.status, json, ms: Date.now() - t0 };
}

async function ensureOwner() {
  for (let i = 0; i < 5; i += 1) {
    await api("POST", "/api/auth/sync-password-after-firebase", {
      body: { email: OWNER, newPassword: PASSWORD, source: "live_verify_owner" },
    });
    const login = await api("POST", "/api/auth/password-login", {
      body: { email: OWNER, password: PASSWORD },
    });
    if (login.status === 200 && login.json?.memberSessionToken) return login.json.memberSessionToken;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error("owner session failed");
}

async function createInvite(ownerToken, fields) {
  for (let i = 0; i < 5; i += 1) {
    const create = await api("POST", "/api/home-daycare-hub/tester-invites", {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "X-LLH-User-Email": OWNER,
      },
      body: { ...fields, role: "owner", appOrigin: BASE },
    });
    console.log("create", fields.programType, create.status, create.ms, create.json?.acceptUrl || create.json?.error || "");
    if (create.status === 200 && create.json?.acceptUrl) {
      return { acceptUrl: create.json.acceptUrl, email: fields.email };
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`create failed for ${fields.email}`);
}

async function runFlow({ label, acceptUrl, email, mobile = false, slow = false }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    mobile
      ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }
      : { viewport: { width: 1280, height: 800 } },
  );
  context.setDefaultTimeout(90000);
  if (slow) {
    await context.route("**/*", async (route) => {
      await new Promise((r) => setTimeout(r, 70));
      return route.continue();
    });
  }
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(acceptUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("[data-tester-invite-signup]", { timeout: 90000 });
  const panel = Date.now() - t0;
  await page.click("[data-tester-invite-signup]");
  await page.waitForSelector("#authForm");
  if (await page.locator("#fullNameInput").count()) await page.fill("#fullNameInput", "Live Verify");
  await page.locator("#emailInput").evaluate((el, v) => {
    el.readOnly = false;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, email);
  await page.fill("#passwordInput", PASSWORD);
  await page.click("#authSubmitButton");

  let usable = null;
  let error = null;
  let final = null;
  for (let i = 0; i < 120; i += 1) {
    const state = await page.evaluate(() => ({
      stage: window.__llhTesterInviteFlowState?.stage || "",
      error: window.__llhTesterInviteFlowState?.error || "",
      token: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
      view: document.querySelector(".view.active-view")?.id || "",
      msg: document.querySelector("#authMessage")?.textContent || "",
      inviteMsg: document.querySelector("#hdhTesterInviteAcceptMessage")?.textContent || "",
    }));
    if (i % 5 === 0) {
      console.log(label, `T+${Date.now() - t0}`, state.stage, "token="+state.token, state.view, (state.msg || state.inviteMsg).slice(0, 70));
    }
    if (state.stage === "complete" && state.token) {
      usable = Date.now() - t0;
      final = state;
      break;
    }
    if (state.stage === "error") {
      error = state.error || state.msg || state.inviteMsg;
      final = state;
      break;
    }
    await page.waitForTimeout(1000);
  }

  let reloginOk = false;
  let reloginMs = null;
  let refreshOk = false;
  let uiReloginOk = false;
  if (usable) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    refreshOk = await page.evaluate(
      (e) => localStorage.getItem("llhUser") === e
        && !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
      email,
    );
    await page.evaluate(() => {
      localStorage.removeItem("llhUser");
      localStorage.removeItem("llhMemberSessionToken");
      sessionStorage.removeItem("llhMemberSessionToken");
    });
    const apiLogin = await api("POST", "/api/auth/password-login", {
      body: { email, password: PASSWORD },
    });
    console.log(label, "apiRelogin", apiLogin.status, apiLogin.ms, !!apiLogin.json?.memberSessionToken);
    reloginOk = apiLogin.status === 200 && !!apiLogin.json?.memberSessionToken;
    reloginMs = apiLogin.ms;

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof openAuthModal === "function", { timeout: 60000 });
    await page.evaluate(() => {
      if (typeof abortNonCriticalBootFetches === "function") abortNonCriticalBootFetches("verify-relogin");
      openAuthModal("login");
    });
    await page.fill("#emailInput", email);
    await page.fill("#passwordInput", PASSWORD);
    const ls = Date.now();
    await page.click("#authSubmitButton");
    // password-login timeout is 35s with a retry — allow enough wall time.
    for (let i = 0; i < 90; i += 1) {
      const st = await page.evaluate(() => ({
        tok: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
        user: localStorage.getItem("llhUser") || "",
        msg: document.querySelector("#authMessage")?.textContent || "",
        modalOpen: document.body.classList.contains("auth-modal-open"),
      }));
      if (i % 5 === 0) console.log(label, "uiRelogin", i, st.msg.slice(0, 60), st.tok, "modal="+st.modalOpen);
      if (st.tok && st.user === email) {
        uiReloginOk = true;
        reloginMs = Date.now() - ls;
        break;
      }
      // Finite error (not still "Signing you in…") — fail this UI path.
      if (/did not match|taking longer than usual|try Log In again|could not create a session|could not be saved/i.test(st.msg) && i > 3) {
        error = `${error ? `${error}; ` : ""}ui-relogin:${st.msg}`;
        break;
      }
      await page.waitForTimeout(1000);
    }
    if (!uiReloginOk && !error) {
      error = `${error ? `${error}; ` : ""}ui-relogin:no-member-session-after-login`;
    }
  }

  await browser.close();
  return {
    label,
    panel,
    usable,
    error,
    refreshOk,
    reloginOk,
    uiReloginOk,
    reloginMs,
    final,
  };
}

async function main() {
  const man = await api("GET", "/llh-shell-manifest.json");
  const h1 = await api("GET", "/api/health");
  const h2 = await api("GET", "/api/health");
  console.log({ shell: man.json?.version, health1: h1.ms, health2: h2.ms });
  if (man.json?.version !== EXPECTED_SHELL) throw new Error(`shell mismatch ${man.json?.version}`);

  const ownerToken = await ensureOwner();
  const hd = await createInvite(ownerToken, {
    email: `jamie.hd.provider${Date.now()}@gmail.com`,
    programType: "home_daycare",
    programName: "Jamie Live HD",
    childName: "Jamie Kid",
  });
  const center = await createInvite(ownerToken, {
    email: `center.live.provider${Date.now()}@outlook.com`,
    programType: "center",
    programName: "Live Center",
    childName: "Center Kid",
  });
  const slow = await createInvite(ownerToken, {
    email: `slow.hd.provider${Date.now()}@gmail.com`,
    programType: "home_daycare",
    programName: "Slow HD",
    childName: "Slow Kid",
  });

  const hdResult = await runFlow({
    label: "HD-mobile",
    acceptUrl: hd.acceptUrl,
    email: hd.email,
    mobile: true,
  });
  console.log("HD_RESULT", JSON.stringify(hdResult, null, 2));

  const centerResult = await runFlow({
    label: "Center-desktop",
    acceptUrl: center.acceptUrl,
    email: center.email,
  });
  console.log("CENTER_RESULT", JSON.stringify(centerResult, null, 2));

  const slowResult = await runFlow({
    label: "HD-slow",
    acceptUrl: slow.acceptUrl,
    email: slow.email,
    mobile: true,
    slow: true,
  });
  console.log("SLOW_RESULT", JSON.stringify(slowResult, null, 2));

  const existing = await api("POST", "/api/auth/password-login", {
    body: { email: "jamie.rivera.provider1786387111@gmail.com", password: PASSWORD },
  });
  console.log("EXISTING", existing.status, existing.ms, !!existing.json?.memberSessionToken);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const t0 = Date.now();
  await page.goto(hd.acceptUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("#hdhTesterInviteAcceptPanel", { timeout: 60000 });
  const txt = await page.innerText("#hdhTesterInviteAcceptPanel");
  const alreadyMs = Date.now() - t0;
  console.log("ALREADY", alreadyMs, /already set up/i.test(txt), txt.slice(0, 120).replace(/\s+/g, " "));
  await browser.close();

  const pr590 = await fetch("https://api.github.com/repos/leahrivie-blip/LITTLE-LEARNER-HUB/pulls/590")
    .then((r) => r.json());

  const pass = !!(
    hdResult.usable
    && centerResult.usable
    && slowResult.usable
    && hdResult.reloginOk
    && centerResult.reloginOk
    && slowResult.reloginOk
    && hdResult.uiReloginOk
    && centerResult.uiReloginOk
    && slowResult.uiReloginOk
    && hdResult.refreshOk
    && centerResult.refreshOk
    && slowResult.refreshOk
    && existing.status === 200
    && man.json?.version === EXPECTED_SHELL
  );
  const verdict = pass
    ? "YES — NEW REAL TESTER INVITES ARE RELIABLE"
    : "NO — TESTER INVITES STILL NOT RELIABLE";
  console.log("VERDICT", verdict);
  console.log("SUMMARY", JSON.stringify({
    shell: man.json?.version,
    health1: h1.ms,
    health2: h2.ms,
    before: { panelMs: 24000, syncNeverStarted: true, stuckSigningIn: true },
    hd: hdResult,
    center: centerResult,
    slow: slowResult,
    existingMs: existing.ms,
    alreadyMs,
    pr590: { state: pr590.state, merged_at: pr590.merged_at },
    prodShaProtected: "4030596",
    pass,
    verdict,
  }, null, 2));
  if (!pass) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
