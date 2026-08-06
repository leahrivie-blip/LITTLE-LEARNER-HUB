#!/usr/bin/env node
/**
 * Live testing verification for Settings/billing role hardening (PR #552).
 * Targets https://little-learner-hub-testing.onrender.com with password sessions.
 * Creates disposable non-ephemeral emails, verifies access, then locks/cleans them.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { chromium } = require("playwright");

const BASE = process.env.LLH_LIVE_BASE || "https://little-learner-hub-testing.onrender.com";
const ARTIFACT_DIR = "/opt/cursor/artifacts/live-testing-settings-perm-verify";
const PASS = `LiveAccess.${Date.now()}.Aa1!`;
const TS = Date.now();

const ROLES = [
  { key: "owner", email: `llh.access.owner.${TS}@yopmail.com`, role: "owner" },
  { key: "director", email: `llh.access.director.${TS}@yopmail.com`, role: "director" },
  { key: "teacher", email: `llh.access.teacher.${TS}@yopmail.com`, role: "teacher" },
  { key: "assistant", email: `llh.access.assistant.${TS}@yopmail.com`, role: "assistant" },
];

function requestJson(method, urlPath, body, headers = {}) {
  const payload = body ? JSON.stringify(body) : null;
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
      timeout: 60000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { json = null; }
        resolve({ status: res.statusCode, json, raw: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createPasswordUser(email, { role, accountType = "center", linkedOwner = "", firstName = "Live" }) {
  const profile = await requestJson("POST", "/api/account/profile", {
    email,
    firstName,
    lastName: role,
    accountType,
    role,
    signup: true,
    businessName: linkedOwner ? undefined : `Live Access Program ${TS}`,
    linkedProgramOwnerEmail: linkedOwner || undefined,
  });
  // Retry sync a few times — first write can race on testing Postgres.
  let sync = null;
  for (let i = 0; i < 4; i += 1) {
    sync = await requestJson("POST", "/api/auth/sync-password-after-firebase", {
      email,
      newPassword: PASS,
      source: "live_settings_perm_verify",
    });
    if (sync.status === 200 && sync.json?.ok) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  let login = null;
  for (let i = 0; i < 4; i += 1) {
    login = await requestJson("POST", "/api/auth/password-login", { email, password: PASS });
    if (login.status === 200 && login.json?.memberSessionToken) break;
    await requestJson("POST", "/api/auth/sync-password-after-firebase", {
      email,
      newPassword: PASS,
      source: "live_settings_perm_verify_retry",
    });
    await new Promise((r) => setTimeout(r, 800));
  }
  assert.equal(login.status, 200, `login ${email}: ${login.status} ${login.raw?.slice(0, 200)}`);
  return {
    email,
    token: login.json.memberSessionToken,
    profile,
    sync,
    membership: login.json.membership || {},
  };
}

async function inviteAndAccept(ownerSession, persona) {
  const inviteRes = await requestJson("POST", "/api/staff/invites", {
    email: persona.email,
    role: persona.role,
    classroomId: persona.role === "teacher" || persona.role === "assistant" ? "room-a" : "",
    classroomName: persona.role === "teacher" || persona.role === "assistant" ? "Room A" : "",
  }, { Authorization: `Bearer ${ownerSession.token}` });
  assert.ok(inviteRes.status === 200 || inviteRes.status === 201, `invite ${persona.key}: ${inviteRes.status} ${inviteRes.raw?.slice(0, 240)}`);
  const token = inviteRes.json?.invite?.token || inviteRes.json?.token;
  const acceptUrl = inviteRes.json?.acceptUrl || "";
  assert.ok(token || acceptUrl, "invite token missing");
  const inviteToken = token || String(acceptUrl).split("token=")[1]?.split("&")[0];
  const accept = await requestJson("POST", "/api/staff/invites/accept", {
    token: inviteToken,
    email: persona.email,
    password: PASS,
    firstName: "Live",
    lastName: persona.key,
  });
  // Accept may create the user; ensure password login works.
  if (accept.status >= 400) {
    // Fallback: profile + password sync with linked owner
    await createPasswordUser(persona.email, {
      role: persona.role,
      linkedOwner: ownerSession.email,
      firstName: "Live",
    });
  } else {
    await requestJson("POST", "/api/auth/sync-password-after-firebase", {
      email: persona.email,
      newPassword: PASS,
      source: "live_settings_perm_accept",
    });
  }
  const login = await requestJson("POST", "/api/auth/password-login", { email: persona.email, password: PASS });
  assert.equal(login.status, 200, `staff login ${persona.key}: ${login.status} ${login.raw?.slice(0, 200)}`);
  return {
    email: persona.email,
    token: login.json.memberSessionToken,
    membership: login.json.membership || {},
    inviteId: inviteRes.json?.invite?.id || "",
    inviteToken,
  };
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const report = {
    base: BASE,
    build: null,
    production: null,
    matrixLocal: null,
    roles: {},
    api: {},
    guest: {},
    cleanup: { emails: [], actions: [], locked: false },
    failures: [],
  };

  const build = await requestJson("GET", "/api/build-version");
  report.build = build.json;
  assert.equal(build.json?.ok, true);
  assert.equal(build.json?.commit, "cfa8845d9f12c37e180702675931a6c19370ea55");
  assert.equal(build.json?.branch, "cursor/family-hub-testing-readiness-d3df");
  console.log("PASS  live build-version", build.json.shortSha);

  const prod = await new Promise((resolve, reject) => {
    https.get("https://littlelearnershubbyleah.com/api/build-version", (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
    }).on("error", reject);
  });
  report.production = prod;
  assert.notEqual(prod.commit, build.json.commit);
  assert.equal(prod.branch, "main");
  console.log("PASS  production unchanged", prod.shortSha);

  // Create owner first, then invite staff roles when possible.
  const sessions = {};
  sessions.owner = await createPasswordUser(ROLES[0].email, { role: "owner", firstName: "LiveOwner" });
  console.log("PASS  password-login owner");
  for (const persona of ROLES.slice(1)) {
    try {
      sessions[persona.key] = await inviteAndAccept(sessions.owner, persona);
      console.log(`PASS  password-login ${persona.key} via staff invite`);
    } catch (error) {
      // Fallback: independent linked profile bootstrap
      sessions[persona.key] = await createPasswordUser(persona.email, {
        role: persona.role,
        linkedOwner: sessions.owner.email,
        firstName: `Live${persona.key}`,
      });
      // Patch role linkage via profile if needed
      await requestJson("POST", "/api/account/profile", {
        email: persona.email,
        role: persona.role,
        accountType: "center",
        linkedProgramOwnerEmail: sessions.owner.email,
      }, { Authorization: `Bearer ${sessions[persona.key].token}` });
      console.log(`PASS  password-login ${persona.key} via linked profile fallback (${error.message})`);
    }
  }

  for (const persona of ROLES) {
    const auth = { Authorization: `Bearer ${sessions[persona.key].token}` };
    const portal = await requestJson("POST", "/api/create-customer-portal-session", { email: persona.email }, auth);
    const checkout = await requestJson("POST", "/api/create-checkout-session", { email: persona.email, plan: "monthly" }, auth);
    const staffInvite = await requestJson("POST", "/api/staff/invites", {
      email: `llh.access.invitee.${persona.key}.${TS}@yopmail.com`,
      role: "teacher",
    }, auth);
    const staffList = await requestJson("GET", "/api/staff/invites", null, auth);

    const expectBillingOwnerOnly = persona.key !== "owner";
    const expectStaffOk = persona.key === "owner" || persona.key === "director";

    if (expectBillingOwnerOnly) {
      assert.equal(portal.status, 403, `${persona.key} portal`);
      assert.equal(portal.json?.code, "billing_owner_only", `${persona.key} portal code`);
      assert.equal(checkout.status, 403, `${persona.key} checkout`);
      assert.equal(checkout.json?.code, "billing_owner_only", `${persona.key} checkout code`);
    } else {
      assert.notEqual(portal.json?.code, "billing_owner_only");
      assert.notEqual(checkout.json?.code, "billing_owner_only");
    }
    if (expectStaffOk) {
      assert.notEqual(staffInvite.status, 403, `${persona.key} staff invite`);
      assert.notEqual(staffList.status, 403, `${persona.key} staff list`);
    } else {
      assert.equal(staffInvite.status, 403, `${persona.key} staff invite denied`);
      assert.equal(staffList.status, 403, `${persona.key} staff list denied`);
    }
    report.api[persona.key] = {
      portal: { status: portal.status, code: portal.json?.code || null },
      checkout: { status: checkout.status, code: checkout.json?.code || null },
      staffInvite: { status: staffInvite.status, error: staffInvite.json?.error || null },
      staffList: { status: staffList.status },
    };
    console.log(`PASS  API matrix ${persona.key}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const persona of ROLES) {
      for (const device of [
        { label: "desktop", width: 1280, height: 800 },
        { label: "phone", width: 390, height: 844 },
      ]) {
        if (persona.key === "assistant" && device.label === "phone") continue;
        const context = await browser.newContext({ viewport: { width: device.width, height: device.height } });
        const page = await context.newPage();
        const consoleErrors = [];
        const failed = [];
        page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
        page.on("response", (res) => {
          if (res.url().startsWith(BASE) && res.status() >= 400) {
            failed.push(`${res.status()} ${res.request().method()} ${res.url()}`);
          }
        });

        const account = {
          email: persona.email,
          firstName: "Live",
          lastName: persona.key,
          plan: "Pro",
          subscriptionStatus: "active",
          role: persona.role,
          accountType: "center",
          programAccessViaOwner: persona.key !== "owner",
          linkedProgramOwnerEmail: persona.key === "owner" ? "" : sessions.owner.email,
          programId: `live-access-${TS}`,
          serverPasswordAuth: true,
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
        }, { email: persona.email, token: sessions[persona.key].token, account });

        await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
        await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 60000 });

        const snap = await page.evaluate(() => {
          const role = typeof getUserRole === "function" ? getUserRole() : "";
          const landing = typeof defaultAuthLandingView === "function" ? defaultAuthLandingView() : "";
          if (typeof setView === "function") {
            setView(landing, { allowDashboard: true, fromAuthLanding: true, skipAccessRedirect: true });
          }
          const settingsVisible = [...document.querySelectorAll('.sidebar .nav-link[data-view="settings"]')]
            .some((n) => !n.hidden && n.getAttribute("aria-hidden") !== "true" && n.offsetParent !== null);
          const workNav = [...document.querySelectorAll("[data-work-nav]")]
            .filter((b) => !b.hidden && b.offsetParent !== null)
            .map((b) => b.getAttribute("data-work-nav"));
          const can = (view) => (typeof canOpenViewForCurrentAccess === "function" ? canOpenViewForCurrentAccess(view) : null);
          const probe = (view) => {
            if (typeof setView === "function") setView(view);
            return document.querySelector(".active-view")?.id || "";
          };
          const afterSettings = probe("settings");
          const afterBilling = probe("billing");
          const afterPlans = probe("plans");
          const afterUpgrade = probe("upgrade");
          const afterStaff = probe("staff");
          const afterProgram = probe("program-settings");
          const afterAccount = probe("account");
          if (typeof renderAccountPage === "function") renderAccountPage();
          const afterDaily = probe("child-tools-daily-logs");
          const upgradeBtn = document.querySelector("#accountUpgradeButton");
          const upgradeVisible = Boolean(
            upgradeBtn && !upgradeBtn.hidden && upgradeBtn.style.display !== "none" && upgradeBtn.offsetParent !== null,
          );
          return {
            role,
            landing,
            settingsVisible,
            workNav,
            canSettings: can("settings"),
            canBilling: can("billing"),
            canStaff: can("staff"),
            canProgramSettings: can("program-settings"),
            canPlans: can("plans"),
            canUpgrade: can("upgrade"),
            canDailyLogs: can("child-tools-daily-logs") || can("children"),
            afterSettings,
            afterBilling,
            afterPlans,
            afterUpgrade,
            afterStaff,
            afterProgram,
            afterAccount,
            afterDaily,
            upgradeVisible,
          };
        });

        if (persona.key === "owner") {
          assert.equal(snap.settingsVisible, true);
          assert.equal(snap.canSettings, true);
          assert.equal(snap.canBilling, true);
          assert.equal(snap.canStaff, true);
        } else if (persona.key === "director") {
          assert.equal(snap.settingsVisible, true);
          assert.equal(snap.canSettings, true);
          assert.equal(snap.canBilling, false);
          assert.equal(snap.canStaff, true);
          assert.notEqual(snap.afterBilling, "view-billing");
          assert.equal(snap.upgradeVisible, false);
        } else {
          assert.equal(snap.settingsVisible, false, `${persona.key} settings nav hidden`);
          assert.equal(snap.canSettings, false);
          assert.equal(snap.canBilling, false);
          assert.equal(snap.canStaff, false);
          assert.equal(snap.canProgramSettings, false);
          assert.equal(snap.canPlans, false);
          assert.equal(snap.canUpgrade, false);
          assert.notEqual(snap.afterSettings, "view-settings");
          assert.notEqual(snap.afterBilling, "view-billing");
          assert.notEqual(snap.afterPlans, "view-plans");
          assert.notEqual(snap.afterUpgrade, "view-upgrade");
          assert.notEqual(snap.afterStaff, "view-staff");
          assert.notEqual(snap.afterProgram, "view-program-settings");
          assert.equal(snap.afterAccount, "view-account");
          assert.equal(snap.upgradeVisible, false);
          assert.ok(
            snap.workNav.includes("daily-logs") || snap.workNav.includes("today") || snap.afterDaily.includes("child"),
            `${persona.key} keeps classroom tools`,
          );
        }

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, "screenshots", `${persona.key}-${device.label}.png`),
          fullPage: true,
        });
        report.roles[`${persona.key}/${device.label}`] = {
          ...snap,
          consoleErrors: consoleErrors.filter((e) => !/favicon|404/i.test(e)).slice(0, 20),
          failedNetwork: failed.filter((f) => !/favicon|teaching-kit|stripe/i.test(f)).slice(0, 20),
        };
        console.log(`PASS  browser ${persona.key}/${device.label}`);
        await context.close();
      }
    }

    // Guest smoke desktop + phone
    for (const device of [
      { label: "desktop", width: 1280, height: 800 },
      { label: "phone", width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport: { width: device.width, height: device.height } });
      const page = await context.newPage();
      const consoleErrors = [];
      const failed = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("response", (res) => {
        if (res.url().startsWith(BASE) && res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
      });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(1500);
      const guest = await page.evaluate(async () => {
        const health = await (await fetch("/api/health")).json();
        const buildInfo = await (await fetch("/api/build-version")).json();
        const tk = await (await fetch("/api/curriculum/lesson-plans/nonexistent/teaching-kit")).json().catch(() => ({}));
        return {
          healthOk: health.ok,
          hdhTesting: health.homeDaycareHubTesting,
          build: buildInfo,
          workNav: !!document.querySelector("[data-work-nav-root]"),
          dailyLogs: !!document.querySelector('[data-work-nav="daily-logs"]'),
          settingsRoles: document.querySelector('[data-work-nav="settings"]')?.getAttribute("data-work-roles") || "",
          tkCode: tk.code || null,
        };
      });
      assert.equal(guest.healthOk, true);
      assert.equal(guest.build.commit, "cfa8845d9f12c37e180702675931a6c19370ea55");
      assert.equal(guest.tkCode, "teaching_kit_disabled");
      assert.equal(guest.settingsRoles, "owner,director");
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "screenshots", `guest-${device.label}.png`),
        fullPage: true,
      });
      report.guest[device.label] = {
        ...guest,
        consoleErrors: consoleErrors.filter((e) => !/teaching-kit|404/i.test(e)),
        failed: failed.filter((f) => !/teaching-kit/i.test(f)),
      };
      console.log(`PASS  guest smoke ${device.label}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  // Cleanup: revoke invites, rotate passwords to random lock values.
  const lockPass = `Locked.${TS}.${Math.random().toString(36).slice(2)}.Aa1!`;
  for (const persona of ROLES) {
    report.cleanup.emails.push(persona.email);
    const auth = { Authorization: `Bearer ${sessions[persona.key].token}` };
    if (persona.key === "owner" || persona.key === "director") {
      const list = await requestJson("GET", "/api/staff/invites", null, auth);
      const invites = list.json?.invites || list.json?.pending || [];
      for (const invite of invites) {
        const id = invite.id;
        if (!id) continue;
        const revoked = await requestJson("DELETE", `/api/staff/invites/${encodeURIComponent(id)}`, null, auth);
        report.cleanup.actions.push(`revoke ${id}: ${revoked.status}`);
      }
    }
    const sync = await requestJson("POST", "/api/auth/sync-password-after-firebase", {
      email: persona.email,
      newPassword: lockPass,
      source: "live_settings_perm_cleanup_lock",
    });
    report.cleanup.actions.push(`lock ${persona.email}: ${sync.status}`);
  }
  // Confirm old password no longer works
  const locked = await requestJson("POST", "/api/auth/password-login", {
    email: sessions.owner.email,
    password: PASS,
  });
  report.cleanup.locked = locked.status === 401;
  assert.equal(locked.status, 401, "owner old password must fail after lock");
  console.log("PASS  disposable credentials locked; invites revoked where possible");
  console.log("NOTE  Postgres rows remain with locked passwords (no public delete API). Emails listed in report for manual purge if desired.");

  fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("ALL LIVE TESTING SETTINGS PERM CHECKS PASSED");
  console.log(`Artifacts: ${ARTIFACT_DIR}`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
