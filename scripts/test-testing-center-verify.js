#!/usr/bin/env node
/**
 * Testing Center + View As verification (testing site only).
 * Covers invite ACL, Testing Pro, View As isolation, role caps, disabled login, API fences.
 *
 * Run: npm run test:testing-center-verify
 */
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/testing-center-verify";
// Use a configured platform-owner alias so hasAdminFullAccess() is true while unlocked.
const ADMIN_EMAIL = "leahivie@icloud.com";
const ADMIN_PASSWORD = "VerifyAdmin!23456";
const ADMIN_ACCESS_CODE = "verify-access-99";
const results = [];

function record(id, ok, detail) {
  results.push({ id, ok: !!ok, detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
}

function requestJson(port, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": payload.length }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json, text });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function authHeaders(email) {
  return {
    Authorization: `Bearer test:${email}`,
    "X-LLH-User-Email": email,
  };
}

async function waitForHealth(port, child, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server health timeout");
}

function startServer(port, storePath) {
  fs.writeFileSync(
    storePath,
    JSON.stringify(
      {
        users: {
          [ADMIN_EMAIL]: {
            email: ADMIN_EMAIL,
            role: "owner",
            accountType: "home_daycare",
            plan: "Pro",
            subscriptionStatus: "active",
          },
        },
        messages: [],
        notifications: [],
        hdhTesterInvites: {},
      },
      null,
      2
    )
  );
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      HOME_DAYCARE_HUB_TESTING: "1",
      ALLOW_TEST_ENDPOINTS: "1",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
      BILLING_ENFORCEMENT_MODE: "off",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function patchStoreUser(storePath, email, fields) {
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  store.users = store.users || {};
  const key = String(email || "").trim().toLowerCase();
  store.users[key] = {
    ...(store.users[key] || {}),
    email: key,
    ...fields,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

async function seedMember(page, base, account) {
  const context = page.context();
  await context.addInitScript((acct) => {
    if (sessionStorage.getItem("llhVerifyMemberSeeded") === "1") return;
    sessionStorage.setItem("llhVerifyMemberSeeded", "1");
    localStorage.clear();
    localStorage.setItem("llhUser", acct.email);
    localStorage.setItem("llhPlan", acct.plan || "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({ [acct.email]: acct }));
    localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
  }, account);
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.body.classList.contains("app-boot-ready") &&
      typeof hasTestingProEntitlement === "function" &&
      typeof setAdminPreviewMode === "function",
    null,
    { timeout: 45000 }
  );
  // Membership sync can overwrite role from server defaults — re-assert intended role.
  await page.evaluate((acct) => {
    updateAccount(acct.email, {
      role: acct.role,
      accountType: acct.accountType,
      linkedProgramOwnerEmail: acct.linkedProgramOwnerEmail || "",
      programAccessViaOwner: !!acct.programAccessViaOwner,
      plan: acct.plan || "Pro",
      hdhIndependentTester: !!acct.hdhIndependentTester,
    });
    currentUser = acct.email;
    syncPlatformNavVisibility?.();
  }, account);
  await page.waitForTimeout(200);
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const port = 22000 + Math.floor(Math.random() * 700);
  const storePath = path.join(os.tmpdir(), `llh-tcv-${crypto.randomBytes(4).toString("hex")}.json`);
  const child = startServer(port, storePath);
  let bootLog = "";
  child.stdout.on("data", (d) => {
    bootLog += String(d);
  });
  child.stderr.on("data", (d) => {
    bootLog += String(d);
  });

  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    await waitForHealth(port, child);

    const ownerEmail = `owner.verify.${Date.now()}@example.com`;
    patchStoreUser(storePath, ownerEmail, {
      role: "owner",
      accountType: "home_daycare",
      plan: "Pro",
      subscriptionStatus: "active",
    });

    // --- 1) Admin/owner can add tester ---
    const inviteEmail = `invitee.${Date.now()}@example.com`;
    const invite = await requestJson(port, "POST", "/api/home-daycare-hub/tester-invites", {
      headers: authHeaders(ownerEmail),
      body: { email: inviteEmail, childName: "Starter Kid", appOrigin: base },
    });
    const acceptUrl = invite.json?.acceptUrl || invite.json?.invite?.acceptUrl || "";
    const inviteToken = (() => {
      try {
        return new URL(acceptUrl).searchParams.get("testerInvite") || "";
      } catch {
        const m = String(acceptUrl).match(/testerInvite=([^&]+)/);
        return m ? decodeURIComponent(m[1]) : "";
      }
    })();
    record(
      "1-admin-add-tester-api",
      invite.status === 200 && !!inviteToken && !!acceptUrl,
      `status=${invite.status} tokenLen=${inviteToken.length} err=${invite.json?.error || ""}`
    );

    // --- Linked teacher cannot invite ---
    const linkedTeacherEmail = `linked.teacher.${Date.now()}@example.com`;
    patchStoreUser(storePath, linkedTeacherEmail, {
      role: "teacher",
      linkedProgramOwnerEmail: ownerEmail,
      programAccessViaOwner: true,
      plan: "Pro",
      accountStatus: "Active",
    });
    const linkedTeacherInvite = await requestJson(port, "POST", "/api/home-daycare-hub/tester-invites", {
      headers: authHeaders(linkedTeacherEmail),
      body: { email: "should-fail@example.com", childName: "Nope", appOrigin: base },
    });
    record(
      "6-linked-teacher-cannot-invite",
      linkedTeacherInvite.status === 403,
      `status=${linkedTeacherInvite.status}`
    );

    // --- Accept invite → Testing Pro independent sandbox ---
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await seedMember(page, base, {
      email: inviteEmail,
      plan: "Free",
      role: "teacher",
      accountType: "home_daycare",
      subscriptionStatus: "Free Plan",
      name: "Invitee Tester",
      createdAt: new Date().toISOString(),
    });

    const accept = await page.evaluate(async (token) => {
      const data = await acceptHdhTesterInviteToken(token);
      const account = currentAccount() || {};
      const kids =
        (typeof childRecords === "function" ? childRecords()?.children : null) ||
        state?.children ||
        [];
      return {
        ok: !!data?.ok,
        role: account.role || "",
        plan: account.plan || "",
        independent: !!account.hdhIndependentTester,
        testingPro: !!hasTestingProEntitlement(),
        isPro: !!isProUser(),
        adminFull: !!hasAdminFullAccess(),
        adminUnlocked: !!isAdminUnlocked(),
        children: Array.isArray(kids) ? kids.length : 0,
      };
    }, inviteToken);
    record(
      "2-tester-gets-testing-pro",
      accept.ok &&
        accept.testingPro &&
        accept.isPro &&
        accept.independent &&
        String(accept.plan).toLowerCase() === "pro",
      JSON.stringify(accept)
    );
    record(
      "3-testing-pro-no-admin",
      !accept.adminFull && !accept.adminUnlocked,
      JSON.stringify({ adminFull: accept.adminFull, adminUnlocked: accept.adminUnlocked })
    );
    record("2b-tester-starter-child", accept.children >= 1, `children=${accept.children}`);

    const indieInvite = await requestJson(port, "POST", "/api/home-daycare-hub/tester-invites", {
      headers: authHeaders(inviteEmail),
      body: { email: "another@example.com", childName: "Nope", appOrigin: base },
    });
    record(
      "6-independent-tester-cannot-invite",
      indieInvite.status === 403,
      `status=${indieInvite.status}`
    );

    // Messages surface for tester
    await page.evaluate(() => {
      if (typeof setView === "function") setView("messages", { skipAccessRedirect: true });
    });
    await page.waitForTimeout(500);
    const msgUi = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return {
        hasMessageLeah: /message leah/i.test(text),
        hasAdminTestingCenter: /Admin Testing Center/i.test(text),
        adminUnlocked: !!isAdminUnlocked(),
      };
    });
    record(
      "13-tester-messages-message-leah",
      msgUi.hasMessageLeah && !msgUi.hasAdminTestingCenter && !msgUi.adminUnlocked,
      JSON.stringify(msgUi)
    );

    // Fresh teacher account (not independent) with Testing Pro
    const teacherCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const teacherPage = await teacherCtx.newPage();
    const teacherCapsEmail = `teacher.caps.${Date.now()}@example.com`;
    patchStoreUser(storePath, teacherCapsEmail, {
      role: "teacher",
      linkedProgramOwnerEmail: ownerEmail,
      programAccessViaOwner: true,
      plan: "Pro",
      accountType: "center",
    });
    await seedMember(teacherPage, base, {
      email: teacherCapsEmail,
      plan: "Pro",
      role: "teacher",
      accountType: "center",
      subscriptionStatus: "active",
      linkedProgramOwnerEmail: ownerEmail,
      programAccessViaOwner: true,
      createdAt: new Date().toISOString(),
    });
    const proCaps = await teacherPage.evaluate(() => {
      const account = currentAccount() || {};
      return {
        testingPro: !!hasTestingProEntitlement(),
        isPro: !!isProUser(),
        billing: !!canAccessCapability(account, "billing"),
        staff: !!canAccessCapability(account, "staff_management"),
        adminFull: !!hasAdminFullAccess(),
        role: getUserRole(),
      };
    });
    record(
      "3-testing-pro-no-role-elevation",
      proCaps.testingPro &&
        proCaps.isPro &&
        !proCaps.billing &&
        !proCaps.staff &&
        !proCaps.adminFull &&
        proCaps.role === "teacher",
      JSON.stringify(proCaps)
    );
    await teacherCtx.close();

    // --- Fresh role logins (seeded sessions) ---
    const roleDefs = [
      {
        role: "owner",
        label: "owner",
        expect: { billing: true, staff: true },
      },
      {
        role: "director",
        label: "director",
        expect: { billing: false, staff: true },
      },
      {
        role: "teacher",
        label: "teacher",
        expect: { billing: false, staff: false },
      },
      {
        role: "assistant",
        label: "assistant",
        expect: { billing: false, staff: false },
      },
    ];
    for (const def of roleDefs) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage();
      const email = `${def.label}.fresh.${Date.now()}@example.com`;
      const accountType = "center";
      patchStoreUser(storePath, email, {
        role: def.role,
        accountType,
        plan: "Pro",
        ...(def.role !== "owner"
          ? { linkedProgramOwnerEmail: ownerEmail, programAccessViaOwner: true }
          : {}),
      });
      await seedMember(p, base, {
        email,
        plan: "Pro",
        role: def.role,
        accountType,
        subscriptionStatus: "active",
        createdAt: new Date().toISOString(),
        ...(def.role !== "owner"
          ? { linkedProgramOwnerEmail: ownerEmail, programAccessViaOwner: true }
          : {}),
      });
      const snap = await p.evaluate(() => {
        const account = currentAccount() || {};
        syncPlatformNavVisibility?.();
        const work = [...document.querySelectorAll("[data-work-nav]")]
          .filter((b) => !b.hidden)
          .map((b) => b.getAttribute("data-work-nav"));
        return {
          role: getUserRole(),
          testingPro: !!hasTestingProEntitlement(),
          isPro: !!isProUser(),
          adminFull: !!hasAdminFullAccess(),
          adminUnlocked: !!isAdminUnlocked(),
          billing: !!canAccessCapability(account, "billing"),
          staff: !!canAccessCapability(account, "staff_management"),
          work,
          workRole: typeof workModeRole === "function" ? workModeRole() : "",
        };
      });
      const ok =
        snap.testingPro &&
        snap.isPro &&
        !snap.adminFull &&
        !snap.adminUnlocked &&
        snap.role === def.role &&
        snap.billing === def.expect.billing &&
        snap.staff === def.expect.staff;
      record(`fresh-login-${def.label}`, ok, JSON.stringify(snap));
      await ctx.close();
    }

    // Parent fresh session via Family Hub parent mode markers
    const parentCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const parentPage = await parentCtx.newPage();
    await parentCtx.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
    });
    await parentPage.goto(`${base}/?view=family-hub`, { waitUntil: "domcontentloaded" });
    await parentPage.waitForFunction(
      () => document.body.classList.contains("app-boot-ready"),
      null,
      { timeout: 45000 }
    );
    const parentSnap = await parentPage.evaluate(() => {
      const text = document.body?.innerText || "";
      return {
        adminUnlocked: !!isAdminUnlocked?.(),
        hasAdminTestingCenter: /Admin Testing Center/i.test(text),
        hasViewAs: /View As \(roles\)/i.test(text),
        familyHubView: !!document.querySelector("#view-family-hub"),
      };
    });
    record(
      "fresh-login-parent-surface",
      !parentSnap.adminUnlocked && !parentSnap.hasAdminTestingCenter && !parentSnap.hasViewAs,
      JSON.stringify(parentSnap)
    );
    await parentCtx.close();

    // --- Admin unlock + View As ---
    await page.close();
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const adminPage = await adminCtx.newPage();
    await adminCtx.addInitScript(
      ({ email, password, code }) => {
        // Seed once only — must not clear on refresh (View As + admin session persist).
        if (sessionStorage.getItem("llhVerifyAdminSeeded") === "1") return;
        sessionStorage.setItem("llhVerifyAdminSeeded", "1");
        localStorage.clear();
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem(
          "llhAccounts",
          JSON.stringify({
            [email]: {
              email,
              plan: "Pro",
              role: "owner",
              accountType: "home_daycare",
              subscriptionStatus: "active",
              createdAt: new Date().toISOString(),
            },
          })
        );
        localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
        sessionStorage.setItem(
          "llhVerifyAdminCreds",
          JSON.stringify({ email, password, code })
        );
      },
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_ACCESS_CODE }
    );
    await adminPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await adminPage.waitForFunction(
      () =>
        document.body.classList.contains("app-boot-ready") &&
        typeof adminLogin === "function" &&
        typeof setAdminSession === "function" &&
        typeof setAdminPreviewMode === "function",
      null,
      { timeout: 45000 }
    );
    const adminUnlock = await adminPage.evaluate(async () => {
      const creds = JSON.parse(sessionStorage.getItem("llhVerifyAdminCreds") || "{}");
      const session = await adminLogin(creds.email, creds.password, creds.code);
      setAdminSession({ ...session, trustedDevice: true });
      setAdminPreviewMode("Admin");
      if (typeof setView === "function") setView("admin", { skipAccessRedirect: true });
      if (typeof renderAdminDashboard === "function") renderAdminDashboard();
      return {
        unlocked: !!isAdminUnlocked(),
        adminFull: !!hasAdminFullAccess(),
        token: Boolean(session?.token),
      };
    });
    record("4-admin-unlock", adminUnlock.unlocked && adminUnlock.token && adminUnlock.adminFull, JSON.stringify(adminUnlock));
    await adminPage.waitForTimeout(900);

    const viewAsUi = await adminPage.evaluate(() => {
      const center = document.querySelector("#adminTestingCenter, [data-admin-testing-center]");
      const buttons = Array.from(
        document.querySelectorAll(
          "#adminTestingCenter [data-admin-preview], [data-admin-testing-center] [data-admin-preview]"
        )
      ).map((b) => String(b.getAttribute("data-admin-preview") || "").trim());
      return {
        centerPresent: !!center,
        Owner: buttons.includes("Owner"),
        Director: buttons.includes("Director"),
        Teacher: buttons.includes("Teacher"),
        Assistant: buttons.includes("Assistant"),
        Parent: buttons.includes("Parent"),
      };
    });
    record(
      "4-view-as-controls",
      viewAsUi.centerPresent &&
        viewAsUi.Owner &&
        viewAsUi.Director &&
        viewAsUi.Teacher &&
        viewAsUi.Assistant &&
        viewAsUi.Parent,
      JSON.stringify(viewAsUi)
    );

    async function probeViewAs(role) {
      return adminPage.evaluate(async (r) => {
        setAdminPreviewMode(r);
        await new Promise((resolve) => setTimeout(resolve, r === "Parent" ? 900 : 250));
        syncPlatformNavVisibility?.();
        updateAdminNavVisibility?.();
        const account = currentAccount() || {};
        const preview = adminPreviewMode();
        const nav = [...document.querySelectorAll("[data-work-nav], .nav-links [data-view], #platformNav [data-view]")]
          .filter((el) => !el.hidden && el.getAttribute("aria-hidden") !== "true")
          .map((el) =>
            String(el.getAttribute("data-work-nav") || el.getAttribute("data-view") || el.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
          );
        const text = document.body?.innerText || "";
        const persona = typeof getHdhTesterPersona === "function" ? getHdhTesterPersona() : {};
        return {
          preview,
          role: getUserRole(),
          personaRole: persona.role || "",
          adminFull: !!hasAdminFullAccess(),
          testingPro: !!hasTestingProEntitlement(),
          isPro: !!isProUser(),
          billing: !!canAccessCapability(account, "billing"),
          staff: !!canAccessCapability(account, "staff_management"),
          navHasAdmin: nav.some((t) => /^admin$/i.test(t)),
          hasTestingCenterText: /Admin Testing Center/i.test(text),
          navHasBilling: nav.some((t) => /billing|membership/i.test(t)),
          workRole: typeof workModeRole === "function" ? workModeRole() : "",
          bodyParent:
            document.body.classList.contains("family-hub-parent-mode") ||
            document.body.classList.contains("hdh-persona-parent"),
          activeView: document.querySelector(".active-view")?.id || "",
        };
      }, role);
    }

    const ownerView = await probeViewAs("Owner");
    record(
      "4-view-as-owner",
      ownerView.preview === "Owner" &&
        !ownerView.adminFull &&
        ownerView.billing &&
        ownerView.staff &&
        ownerView.testingPro,
      JSON.stringify(ownerView)
    );
    const directorView = await probeViewAs("Director");
    record(
      "4-view-as-director",
      directorView.preview === "Director" &&
        !directorView.adminFull &&
        directorView.staff &&
        !directorView.billing,
      JSON.stringify(directorView)
    );
    const teacherView = await probeViewAs("Teacher");
    record(
      "4-view-as-teacher",
      teacherView.preview === "Teacher" &&
        !teacherView.adminFull &&
        !teacherView.staff &&
        !teacherView.billing &&
        teacherView.role === "teacher",
      JSON.stringify(teacherView)
    );
    const assistantView = await probeViewAs("Assistant");
    record(
      "4-view-as-assistant",
      assistantView.preview === "Assistant" &&
        !assistantView.adminFull &&
        !assistantView.staff &&
        !assistantView.billing,
      JSON.stringify(assistantView)
    );
    const parentView = await probeViewAs("Parent");
    record(
      "4-view-as-parent",
      parentView.preview === "Parent" &&
        !parentView.adminFull &&
        (parentView.personaRole === "parent" ||
          parentView.bodyParent ||
          /family-hub/i.test(parentView.activeView)),
      JSON.stringify(parentView)
    );

    // Switch back — no permission leak
    const backAdmin = await adminPage.evaluate(() => {
      setAdminPreviewMode("Admin");
      return {
        preview: adminPreviewMode(),
        adminFull: !!hasAdminFullAccess(),
        personaRole: typeof getHdhTesterPersona === "function" ? getHdhTesterPersona().role : "",
      };
    });
    record(
      "10-switch-back-admin",
      backAdmin.preview === "Admin" && backAdmin.adminFull,
      JSON.stringify(backAdmin)
    );

    // Refresh persistence of View As
    await adminPage.evaluate(() => setAdminPreviewMode("Teacher"));
    await adminPage.reload({ waitUntil: "domcontentloaded" });
    await adminPage.waitForFunction(
      () => document.body.classList.contains("app-boot-ready") && typeof adminPreviewMode === "function",
      null,
      { timeout: 45000 }
    );
    const afterRefresh = await adminPage.evaluate(() => ({
      preview: adminPreviewMode() || localStorage.getItem("llhAdminPreviewMode") || "",
      adminFull: !!hasAdminFullAccess(),
      unlocked: !!isAdminUnlocked(),
    }));
    record(
      "15-view-as-survives-refresh",
      afterRefresh.preview === "Teacher" && !afterRefresh.adminFull && afterRefresh.unlocked,
      JSON.stringify(afterRefresh)
    );
    await adminPage.evaluate(() => setAdminPreviewMode("Admin"));

    // --- Disabled cannot login ---
    const disableEmail = `disabled.${Date.now()}@example.com`;
    const disablePass = "DisableMe!234";
    // Create server user then disable
    const created = await requestJson(port, "POST", "/api/auth/password-login", {
      body: { email: disableEmail, password: disablePass },
    });
    // Ensure user exists with password by signing up via store + hash path:
    // Use client local hash login path.
    const disablePage = await browser.newPage();
    await disablePage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await disablePage.waitForFunction(
      () => document.body.classList.contains("app-boot-ready") && typeof signUpWithProvider === "function",
      null,
      { timeout: 45000 }
    );
    await disablePage.evaluate(async ({ email, password }) => {
      localStorage.clear();
      await signUpWithProvider(email, password, "", "Soon", "Disabled");
      const accountsMap = accounts();
      if (accountsMap[email]) {
        accountsMap[email].accountStatus = "Disabled";
        accountsMap[email].disabled = true;
        localStorage.setItem("llhAccounts", JSON.stringify(accountsMap));
      }
      currentUser = null;
      localStorage.removeItem("llhUser");
    }, { email: disableEmail, password: disablePass });
    patchStoreUser(storePath, disableEmail, {
      role: "teacher",
      accountStatus: "Disabled",
      disabled: true,
      plan: "Pro",
    });
    const disabledLogin = await disablePage.evaluate(async ({ email, password }) => {
      try {
        await loginWithProvider(email, password);
        return { ok: true, user: currentUser };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    }, { email: disableEmail, password: disablePass });
    record(
      "11-disabled-cannot-login",
      !disabledLogin.ok && /disabled/i.test(disabledLogin.error || ""),
      JSON.stringify({ ...disabledLogin, createdStatus: created.status })
    );
    await disablePage.close();

    // --- API fences ---
    const analytics = await requestJson(port, "GET", "/api/admin/analytics");
    record(
      "12-api-admin-analytics-blocked",
      analytics.status === 401 || analytics.status === 403,
      `status=${analytics.status}`
    );
    const indieList = await requestJson(port, "GET", "/api/home-daycare-hub/tester-invites", {
      headers: authHeaders(inviteEmail),
    });
    record("12-api-tester-invites-indie-blocked", indieList.status === 403, `status=${indieList.status}`);
    const ownerList = await requestJson(port, "GET", "/api/home-daycare-hub/tester-invites", {
      headers: authHeaders(ownerEmail),
    });
    record("12-owner-can-list-invites", ownerList.status === 200, `status=${ownerList.status}`);

    // Feedback stays in Admin (static marker)
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    record(
      "14-feedback-admin-surface",
      /adminFeedbackApp/.test(appJs) && /Admin Testing Center/.test(appJs) && /Message Leah/.test(appJs),
      "adminFeedbackApp + Testing Center + Message Leah markers"
    );

    // Seed connectivity markers in client after owner seed
    const seedPage = await browser.newPage();
    await seedMember(seedPage, base, {
      email: ownerEmail,
      plan: "Pro",
      role: "owner",
      accountType: "home_daycare",
      subscriptionStatus: "active",
      createdAt: new Date().toISOString(),
    });
    const seed = await seedPage.evaluate(() => {
      if (typeof ensureTesterDemoChild === "function") {
        try {
          ensureTesterDemoChild();
        } catch (_e) {
          /* optional */
        }
      }
      const children =
        (typeof childRecords === "function" ? childRecords()?.children : null) ||
        state?.children ||
        [];
      return {
        testingPro: !!hasTestingProEntitlement(),
        children: Array.isArray(children) ? children.length : 0,
        canStaff: !!canAccessCapability(currentAccount() || {}, "staff_management"),
      };
    });
    record("16-seed-surface", seed.testingPro && seed.canStaff, JSON.stringify(seed));

    // Logout
    const logoutOk = await seedPage.evaluate(() => {
      if (typeof logout === "function") logout();
      else {
        localStorage.removeItem("llhUser");
        currentUser = null;
      }
      return !currentUser && !localStorage.getItem("llhUser");
    });
    record("15-logout", logoutOk, `loggedOut=${logoutOk}`);

    await adminPage.screenshot({
      path: path.join(ARTIFACT_DIR, "01-admin-testing-center.png"),
      fullPage: true,
    });
    await seedPage.close();
    await adminCtx.close();
  } catch (error) {
    console.error(error);
    console.error("bootLog tail:\n", bootLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  fs.writeFileSync(path.join(ARTIFACT_DIR, "results.json"), JSON.stringify(report, null, 2));
  console.log(`\nSummary: ${report.passed}/${report.total} passed`);
  if (report.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
