#!/usr/bin/env node
/**
 * Tester invite onboarding FSM + idempotent accept (Firebase-less testing path).
 * Run: HOME_DAYCARE_HUB_TESTING=1 NODE_ENV=test node scripts/test-tester-invite-login-fsm.js
 */
"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 4560 + Math.floor(Math.random() * 80);
const STORE = path.join(os.tmpdir(), `llh-tester-invite-fsm-${process.pid}.json`);
const OWNER = `owner.invite.${Date.now().toString(36)}@llhmail.app`;
const TESTER = `jamie.rivera.provider.${Date.now().toString(36)}@gmail.com`;
const PASSWORD = "SunshineDaycare9!";

function request(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          let json = {};
          try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitHealth(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /async function completeTesterInviteCredentialFlow/);
  assert.match(appJs, /async function fetchWithAuthTimeout/);
  assert.match(appJs, /function beginAuthNetworkPriority/);
  assert.match(appJs, /function endAuthNetworkPriority/);
  assert.match(appJs, /function scheduleDeferredPublicBootLoads/);
  assert.match(appJs, /creating_credentials/);
  assert.match(appJs, /creating_session/);
  assert.match(appJs, /accepting_invite/);
  assert.match(appJs, /memberSessionToken/);
  assert.match(appJs, /Sign-in is taking longer than usual\. Wait a moment and try Log In again/);
  // Sticky auth priority must be caller-owned; fetchWithAuthTimeout only aborts sockets.
  assert.match(appJs, /abortNonCriticalBootFetches\("auth-priority"\)/);
  {
    const start = appJs.indexOf("async function fetchWithAuthTimeout");
    const end = appJs.indexOf("function setTesterInviteFlowMessage", start);
    const fetchFn = start >= 0 && end > start ? appJs.slice(start, end) : "";
    assert.ok(fetchFn.includes("abortNonCriticalBootFetches"));
    assert.ok(!fetchFn.includes("beginAuthNetworkPriority"), "fetchWithAuthTimeout must not sticky-begin auth priority");
  }
  console.log("PASS  client FSM / timeout markers");

  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  assert.match(sw, /INVITE_NAV_TIMEOUT_MS/);
  assert.match(sw, /20260811-forms-wave5-signatures1/);
  console.log("PASS  service worker invite nav timeout + shell");

  const punch = fs.readFileSync(path.join(ROOT, "docs/audits/REAL_PROVIDER_TESTING_FEEDBACK_PUNCH_LIST.md"), "utf8");
  assert.match(punch, /YES — NEW REAL TESTER INVITES ARE RELIABLE/);
  assert.match(punch, /\bC1\b/);
  assert.match(punch, /\|\s*verified\s*\|/);
  console.log("PASS  punch list gate is READY (live verify PASS)");

  fs.writeFileSync(STORE, JSON.stringify({ users: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE,
      DATABASE_PROVIDER: "local-json",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitHealth(child);

    const inviteCreate = await request("POST", "/api/home-daycare-hub/tester-invites", {
      headers: {
        Authorization: `Bearer test:${OWNER}`,
        "X-LLH-User-Email": OWNER,
      },
      body: {
        email: TESTER,
        childName: "Jamie Kid",
        programName: "Jamie Home Daycare",
        programType: "home_daycare",
        role: "owner",
        appOrigin: `http://127.0.0.1:${PORT}`,
      },
    });
    assert.equal(inviteCreate.status, 200, JSON.stringify(inviteCreate.json));
    const token = inviteCreate.json?.invite?.token || String(inviteCreate.json?.acceptUrl || "").split("testerInvite=")[1];
    assert.ok(token, "invite token");
    console.log("PASS  create tester invite");

    const sync = await request("POST", "/api/auth/sync-password-after-firebase", {
      body: { email: TESTER, newPassword: PASSWORD, source: "tester_invite_signup" },
    });
    assert.equal(sync.status, 200, JSON.stringify(sync.json));
    assert.notEqual(sync.json?.skipped, true, "password must persist for realistic email");
    console.log("PASS  password sync for invited email");

    const login = await request("POST", "/api/auth/password-login", {
      body: { email: TESTER, password: PASSWORD },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const memberToken = login.json?.memberSessionToken || "";
    assert.ok(memberToken, "member session");
    console.log("PASS  password-login session");

    const accept1 = await request("POST", "/api/home-daycare-hub/tester-invites/accept", {
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "X-LLH-User-Email": TESTER,
      },
      body: { token },
    });
    assert.equal(accept1.status, 200, JSON.stringify(accept1.json));
    const programId1 = accept1.json?.account?.programId || "";
    assert.ok(programId1, "programId after accept");
    console.log("PASS  accept invite");

    const accept2 = await request("POST", "/api/home-daycare-hub/tester-invites/accept", {
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "X-LLH-User-Email": TESTER,
      },
      body: { token },
    });
    assert.equal(accept2.status, 200, JSON.stringify(accept2.json));
    assert.equal(accept2.json?.alreadyAccepted, true);
    assert.equal(accept2.json?.account?.programId, programId1);
    console.log("PASS  idempotent re-accept (same programId)");

    const peek = await request("GET", "/api/home-daycare-hub/tester-invites/peek", {
      headers: { "X-LLH-Invite-Token": token },
    });
    assert.equal(peek.status, 200, JSON.stringify(peek.json));
    assert.equal(String(peek.json?.invite?.status || "").toLowerCase(), "accepted");
    console.log("PASS  peek shows accepted");

    // Second disposable invite for browser FSM path (center-like labels still owner program).
    const tester2 = `center.provider.${Date.now().toString(36)}@outlook.com`;
    const invite2 = await request("POST", "/api/home-daycare-hub/tester-invites", {
      headers: {
        Authorization: `Bearer test:${OWNER}`,
        "X-LLH-User-Email": OWNER,
      },
      body: {
        email: tester2,
        childName: "Center Kid",
        programName: "Center Test Program",
        programType: "center",
        role: "owner",
        appOrigin: `http://127.0.0.1:${PORT}`,
      },
    });
    assert.equal(invite2.status, 200, JSON.stringify(invite2.json));
    const token2 = invite2.json?.invite?.token || String(invite2.json?.acceptUrl || "").split("testerInvite=")[1];
    assert.ok(token2);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${PORT}/?testerInvite=${token2}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-tester-invite-signup]", { timeout: 20000 });
    const panelMs = Date.now() - t0;
    assert.ok(panelMs < 15000, `invite panel too slow locally: ${panelMs}ms`);
    await page.click("[data-tester-invite-signup]");
    await page.waitForSelector("#authForm");
    if (await page.locator("#fullNameInput").count()) await page.fill("#fullNameInput", "Center Provider");
    await page.locator("#emailInput").evaluate((el, v) => {
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, tester2);
    await page.fill("#passwordInput", PASSWORD);
    await page.click("#authSubmitButton");

    await page.waitForFunction(() => {
      const stage = window.__llhTesterInviteFlowState?.stage || "";
      const tokenReady = !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken"));
      const onChildren = document.querySelector("#view-children.active-view, .view.active-view#view-children");
      return stage === "complete" || stage === "error" || (tokenReady && onChildren);
    }, { timeout: 45000 });

    const finalState = await page.evaluate(() => ({
      stage: window.__llhTesterInviteFlowState?.stage || "",
      error: window.__llhTesterInviteFlowState?.error || window.__llhLastTesterInviteAcceptError || "",
      user: localStorage.getItem("llhUser") || "",
      token: !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken")),
      view: document.querySelector(".view.active-view")?.id || "",
    }));
    assert.equal(finalState.user, tester2);
    assert.equal(finalState.token, true);
    assert.equal(finalState.stage, "complete", JSON.stringify(finalState));
    assert.equal(finalState.view, "view-children", JSON.stringify(finalState));
    console.log("PASS  browser invite signup FSM → session + program", `panel=${panelMs}ms`);

    // Refresh + logout + login still works.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), { timeout: 20000 });
    await page.evaluate(async () => {
      if (typeof logout === "function") await logout();
      else {
        localStorage.removeItem("llhUser");
        localStorage.removeItem("llhMemberSessionToken");
        sessionStorage.removeItem("llhMemberSessionToken");
      }
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof openAuthModal === "function");
    await page.evaluate(() => openAuthModal("login"));
    await page.fill("#emailInput", tester2);
    await page.fill("#passwordInput", PASSWORD);
    await page.click("#authSubmitButton");
    await page.waitForFunction(() => {
      return !!(localStorage.getItem("llhMemberSessionToken") || sessionStorage.getItem("llhMemberSessionToken"));
    }, { timeout: 30000 });
    console.log("PASS  normal login after invite acceptance");

    console.log(JSON.stringify({
      ok: true,
      panelMs,
      programId1,
      shell: "20260811-forms-wave5-signatures1",
    }));
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
