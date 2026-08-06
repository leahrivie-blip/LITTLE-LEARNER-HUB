#!/usr/bin/env node
/**
 * Authenticated Owner/Director/Teacher/Assistant Settings permission proof.
 * Uses real password-login sessions + server API calls (not Admin View As).
 * Disposable local-json store only — never production.
 *
 * Run: npm run test:role-settings-auth-matrix
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const tempPasswordAuth = require("../server/temp-password-auth.js");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/role-settings-auth-matrix";
const PASSWORD = "DispRolePass123!";

const ROLES = [
  {
    key: "owner",
    email: "disp-settings-owner@test.local",
    role: "owner",
    accountType: "center",
    programAccessViaOwner: false,
    linkedProgramOwnerEmail: "",
  },
  {
    key: "director",
    email: "disp-settings-director@test.local",
    role: "director",
    accountType: "center",
    programAccessViaOwner: true,
    linkedProgramOwnerEmail: "disp-settings-owner@test.local",
  },
  {
    key: "teacher",
    email: "disp-settings-teacher@test.local",
    role: "teacher",
    accountType: "center",
    programAccessViaOwner: true,
    linkedProgramOwnerEmail: "disp-settings-owner@test.local",
  },
  {
    key: "assistant",
    email: "disp-settings-assistant@test.local",
    role: "assistant",
    accountType: "center",
    programAccessViaOwner: true,
    linkedProgramOwnerEmail: "disp-settings-owner@test.local",
  },
];

function requestJson(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      timeout: 30000,
      headers: {
        ...(payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { json = null; }
        resolve({ status: res.statusCode, json, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-role-settings-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 20400 + Math.floor(Math.random() * 80);
  const passwordHash = tempPasswordAuth.hashPasswordSha256(PASSWORD);
  const users = {};
  for (const persona of ROLES) {
    users[persona.email] = {
      email: persona.email,
      firstName: persona.key,
      lastName: "Disposable",
      plan: "Pro",
      subscriptionStatus: "active",
      stripeSubscriptionStatus: "active",
      role: persona.role,
      accountType: persona.accountType,
      programId: "prog-disp-settings",
      programAccessViaOwner: persona.programAccessViaOwner,
      linkedProgramOwnerEmail: persona.linkedProgramOwnerEmail || "",
      serverPasswordAuth: true,
      passwordHash,
      emailVerified: true,
      createdAt: new Date().toISOString(),
      // Owner only — fake Stripe id so portal path exercises role denial for staff.
      stripeCustomerId: persona.key === "owner" ? "cus_disp_owner_test" : undefined,
    };
  }
  fs.writeFileSync(storePath, JSON.stringify({
    users,
    memberSessions: {},
    siteContent: { curriculumLibrary: { lessonPlans: [], activities: [], resources: [] } },
    adminSessions: {},
  }, null, 2));

  const env = {
    ...process.env,
    PORT: String(port),
    SITE_URL: `http://127.0.0.1:${port}`,
    DATABASE_PROVIDER: "local-json",
    LLH_STORE_PATH: storePath,
    NODE_ENV: "test",
    HOME_DAYCARE_HUB_TESTING: "true",
    EMAIL_AUTOMATIONS_ENABLED: "false",
    // Stripe unset → portal/checkout return not-configured after role check, or 403 first.
  };
  delete env.STRIPE_SECRET_KEY;
  delete env.STRIPE_SECRET;

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { child, port, tmpDir, storePath };
}

async function waitForBoot(port, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("boot timeout");
}

async function passwordLogin(port, email) {
  const res = await requestJson(port, "POST", "/api/auth/password-login", { email, password: PASSWORD });
  assert.equal(res.status, 200, `password-login ${email}: ${res.status} ${JSON.stringify(res.json)}`);
  const token = res.json?.memberSessionToken || res.json?.token || res.json?.sessionToken || "";
  assert.ok(token, `password-login must return session token for ${email}`);
  return { token, user: res.json?.user || res.json?.account || {}, raw: res.json };
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const { child, port, tmpDir, storePath } = startServer();
  const report = { roles: {}, api: {}, cleanup: false };
  let browser;
  try {
    await waitForBoot(port, child);
    const sessions = {};
    for (const persona of ROLES) {
      sessions[persona.key] = await passwordLogin(port, persona.email);
      console.log(`PASS  password-login ${persona.key}`);
    }

    // Server-side API denials with authenticated member sessions
    for (const persona of ROLES) {
      const auth = { Authorization: `Bearer ${sessions[persona.key].token}` };
      const portal = await requestJson(port, "POST", "/api/create-customer-portal-session", {
        email: persona.email,
      }, auth);
      const checkout = await requestJson(port, "POST", "/api/create-checkout-session", {
        email: persona.email,
        plan: "monthly",
      }, auth);
      const staffInvite = await requestJson(port, "POST", "/api/staff/invites", {
        email: `invitee-${persona.key}@test.local`,
        role: "teacher",
      }, auth);
      const staffList = await requestJson(port, "GET", "/api/staff/invites", null, auth);

      const expectBillingOk = persona.key === "owner";
      const expectStaffOk = persona.key === "owner" || persona.key === "director";

      if (expectBillingOk) {
        // Owner reaches Stripe gate (no key in this harness) — must NOT be role 403.
        assert.notEqual(portal.json?.code, "billing_owner_only");
        assert.notEqual(checkout.json?.code, "billing_owner_only");
      } else {
        assert.equal(portal.status, 403, `${persona.key} portal status`);
        assert.equal(portal.json?.code, "billing_owner_only", `${persona.key} portal code`);
        assert.equal(checkout.status, 403, `${persona.key} checkout status`);
        assert.equal(checkout.json?.code, "billing_owner_only", `${persona.key} checkout code`);
      }
      if (expectStaffOk) {
        assert.notEqual(staffInvite.status, 403, `${persona.key} staff invite should not be role-denied`);
        assert.notEqual(staffList.status, 403, `${persona.key} staff list should not be role-denied`);
      } else {
        assert.equal(staffInvite.status, 403, `${persona.key} staff invite denied`);
        assert.equal(staffList.status, 403, `${persona.key} staff list denied`);
      }
      report.api[persona.key] = {
        portal: { status: portal.status, code: portal.json?.code || null },
        checkout: { status: checkout.status, code: checkout.json?.code || null },
        staffInvite: { status: staffInvite.status, error: staffInvite.json?.error || null },
        staffList: { status: staffList.status, error: staffList.json?.error || null },
      };
      console.log(`PASS  API auth matrix ${persona.key}`);
    }

    browser = await chromium.launch({ headless: true });
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
          if (res.url().includes(`127.0.0.1:${port}`) && res.status() >= 400) {
            failed.push(`${res.status()} ${res.request().method()} ${res.url()}`);
          }
        });

        // Authenticated browser session via password-login token + matching account row.
        // Not Admin View As / Multi-Role Tester.
        await page.addInitScript(({ email, token, account }) => {
          localStorage.setItem("llhUser", email);
          localStorage.setItem("llhPlan", account.plan || "Pro");
          localStorage.setItem("llhAccounts", JSON.stringify({ [email]: account }));
          localStorage.setItem("llhMemberSessionToken", token);
          localStorage.setItem("llhAuthToken", token);
          localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
          // Explicitly clear View As / multi-role overlays.
          localStorage.removeItem("llhAdminPreviewMode");
          localStorage.removeItem("llhAdminUnlocked");
          localStorage.removeItem("llhMultiRoleTesterView");
          localStorage.removeItem("llhHdhTesterPersona");
        }, {
          email: persona.email,
          token: sessions[persona.key].token,
          account: {
            email: persona.email,
            firstName: persona.key,
            lastName: "Disposable",
            plan: "Pro",
            subscriptionStatus: "active",
            role: persona.role,
            accountType: persona.accountType,
            programAccessViaOwner: persona.programAccessViaOwner,
            linkedProgramOwnerEmail: persona.linkedProgramOwnerEmail || "",
            programId: "prog-disp-settings",
          },
        });

        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 90000 });
        await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 45000 });

        const snap = await page.evaluate(() => {
          const role = typeof getUserRole === "function" ? getUserRole() : "";
          const landing = typeof defaultAuthLandingView === "function" ? defaultAuthLandingView() : "";
          if (typeof setView === "function") {
            setView(landing, { allowDashboard: true, fromAuthLanding: true, skipAccessRedirect: true });
          }
          const active = document.querySelector(".active-view")?.id || "";
          const workNav = [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden && b.offsetParent !== null)
            .map((b) => b.getAttribute("data-work-nav"));
          const settingsVisible = [...document.querySelectorAll('.sidebar .nav-link[data-view="settings"]')]
            .some((n) => !n.hidden && n.getAttribute("aria-hidden") !== "true" && n.offsetParent !== null);
          const can = (view) => (typeof canOpenViewForCurrentAccess === "function" ? canOpenViewForCurrentAccess(view) : null);
          // Probe restricted deep links
          if (typeof setView === "function") setView("settings");
          const afterSettings = document.querySelector(".active-view")?.id || "";
          if (typeof setView === "function") setView("billing");
          const afterBilling = document.querySelector(".active-view")?.id || "";
          if (typeof setView === "function") setView("program-settings");
          const afterProgram = document.querySelector(".active-view")?.id || "";
          if (typeof setView === "function") setView("account");
          if (typeof renderAccountPage === "function") renderAccountPage();
          const afterAccount = document.querySelector(".active-view")?.id || "";
          const accountText = document.querySelector("#view-account")?.innerText || "";
          const upgradeBtn = document.querySelector("#accountUpgradeButton");
          const upgradeVisible = Boolean(
            upgradeBtn
            && !upgradeBtn.hidden
            && upgradeBtn.style.display !== "none"
            && upgradeBtn.offsetParent !== null,
          );
          return {
            role,
            landing,
            active,
            workNav,
            settingsVisible,
            canSettings: can("settings"),
            canBilling: can("billing"),
            canStaff: can("staff"),
            canProgramSettings: can("program-settings"),
            afterSettings,
            afterBilling,
            afterProgram,
            afterAccount,
            upgradeVisible,
            accountManagedCopy: /managed by the program owner/i.test(accountText),
          };
        });

        if (persona.key === "owner" || persona.key === "director") {
          assert.equal(snap.settingsVisible, true, `${persona.key} settings nav visible`);
          assert.equal(snap.canSettings, true);
          assert.equal(snap.canProgramSettings, true);
          if (persona.key === "owner") {
            assert.equal(snap.canBilling, true);
            assert.equal(snap.canStaff, true);
            assert.equal(snap.upgradeVisible, true, "owner sees billing CTA on Account");
          } else {
            assert.equal(snap.canBilling, false);
            assert.equal(snap.canStaff, true);
            assert.equal(snap.upgradeVisible, false, "director must not see billing CTA");
          }
        } else {
          assert.equal(snap.settingsVisible, false, `${persona.key} settings nav hidden`);
          assert.equal(snap.canSettings, false);
          assert.equal(snap.canBilling, false);
          assert.equal(snap.canStaff, false);
          assert.equal(snap.canProgramSettings, false);
          assert.notEqual(snap.afterSettings, "view-settings");
          assert.notEqual(snap.afterBilling, "view-billing");
          assert.notEqual(snap.afterProgram, "view-program-settings");
          assert.equal(snap.afterAccount, "view-account");
          assert.equal(snap.upgradeVisible, false, "staff must not see Upgrade/Manage Billing CTA");
          assert.equal(snap.accountManagedCopy, true);
        }

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, "screenshots", `${persona.key}-${device.label}.png`),
          fullPage: true,
        });
        report.roles[`${persona.key}/${device.label}`] = {
          ...snap,
          consoleErrors,
          failedNetwork: failed.filter((f) => !/favicon|stripe/i.test(f)).slice(0, 20),
        };
        console.log(`PASS  browser ${persona.key}/${device.label}`);
        await context.close();
      }
    }

    // Cleanup disposable role users (+ any invitees they created) from temp store.
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const disposableEmails = new Set(ROLES.map((p) => p.email));
    for (const email of Object.keys(store.users || {})) {
      if (disposableEmails.has(email) || /@test\.local$/i.test(email)) {
        delete store.users[email];
      }
    }
    if (store.staffInvites) {
      for (const id of Object.keys(store.staffInvites)) {
        const invite = store.staffInvites[id];
        if (disposableEmails.has(invite?.email) || /@test\.local$/i.test(invite?.email || "")
          || disposableEmails.has(invite?.invitedBy) || disposableEmails.has(invite?.ownerEmail)) {
          delete store.staffInvites[id];
        }
      }
    }
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    const remainingDisp = Object.keys(store.users || {}).filter((e) => disposableEmails.has(e) || /disp-settings-|invitee-/i.test(e));
    report.cleanup = remainingDisp.length === 0;
    assert.equal(report.cleanup, true, `disposable users removed from temp store (left: ${remainingDisp.join(",")})`);
    console.log("PASS  disposable records cleaned from temp store");

    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
    console.log("ALL ROLE SETTINGS AUTH MATRIX CHECKS PASSED");
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
