#!/usr/bin/env node
/**
 * Multi-Role Tester verification (testing site only).
 * API + Admin permission checks against a real server.
 * UI module checks use a lightweight harness (full app boot is flaky under SW/load).
 *
 * Run: npm run test:multi-role-tester
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/multi-role-tester";
const ADMIN_EMAIL = "leahivie@icloud.com";
const ADMIN_PASSWORD = "MultiRoleAdmin!234";
const ADMIN_ACCESS_CODE = "multi-role-99";
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

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const moduleJs = fs.readFileSync(path.join(ROOT, "scripts/multi-role-tester.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  record("static-module", /LLHMultiRoleTester/.test(moduleJs) && /multi-role-tester\.js/.test(indexHtml), "module + index include");
  record("static-admin-toggle", /Enable Multi-Role Tester/.test(appJs), "admin membership toggle");
  record("static-api", /tester-role-switches/.test(serverJs) && /multiRoleTester/.test(serverJs), "role-switch API + flag");
  record("static-billing-fence", /isMultiRoleTesterSimulating/.test(appJs), "billing fence hook");
  record("static-banner-css", /\.multi-role-tester-banner/.test(stylesCss) && /\.report-bug-fab/.test(stylesCss), "banner + fab CSS");
  record("static-smart-feedback", /feedback-smart-block|buildMultiRoleSmartFeedbackMessage|openSmartFeedback/.test(moduleJs + appJs), "smart feedback wiring");
  record("static-session-prompt", /Which role did you test today/.test(moduleJs), "session end prompt");

  const port = 23100 + Math.floor(Math.random() * 500);
  const storePath = path.join(os.tmpdir(), `llh-mrt-${crypto.randomBytes(4).toString("hex")}.json`);
  const testerEmail = `multi.role.${Date.now()}@example.com`;
  fs.writeFileSync(
    storePath,
    JSON.stringify(
      {
        users: {
          [ADMIN_EMAIL]: {
            email: ADMIN_EMAIL,
            role: "owner",
            plan: "Pro",
            accountType: "home_daycare",
          },
          [testerEmail]: {
            email: testerEmail,
            role: "owner",
            plan: "Pro",
            accountType: "home_daycare",
            hdhIndependentTester: true,
            multiRoleTester: true,
            subscriptionStatus: "active",
          },
        },
        testerRoleSwitches: [],
        feedbackItems: [],
      },
      null,
      2
    )
  );

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      HOME_DAYCARE_HUB_TESTING: "1",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      BILLING_ENFORCEMENT_MODE: "off",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    await waitForHealth(port, child);

    const noPermEmail = `noperm.${Date.now()}@example.com`;
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    store.users[noPermEmail] = {
      email: noPermEmail,
      role: "owner",
      plan: "Pro",
      hdhIndependentTester: true,
      multiRoleTester: false,
    };
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

    const blocked = await requestJson(port, "POST", "/api/home-daycare-hub/tester-role-switches", {
      headers: authHeaders(noPermEmail),
      body: { email: noPermEmail, fromRole: "My Tester View", toRole: "Teacher", source: "test" },
    });
    record("api-requires-permission", blocked.status === 403, `status=${blocked.status}`);

    const logged = await requestJson(port, "POST", "/api/home-daycare-hub/tester-role-switches", {
      headers: authHeaders(testerEmail),
      body: {
        email: testerEmail,
        fromRole: "My Tester View",
        toRole: "Teacher",
        source: "test",
        context: { page: "today", deviceClass: "Desktop" },
      },
    });
    record("api-log-switch", logged.status === 200 && !!logged.json?.switch?.id, `status=${logged.status}`);

    const adminLogin = await requestJson(port, "POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_ACCESS_CODE },
    });
    const adminToken = adminLogin.json?.token || "";
    record("admin-login", adminLogin.status === 200 && !!adminToken, `status=${adminLogin.status}`);

    const enable = await requestJson(port, "POST", "/api/admin/membership-update", {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: noPermEmail,
        updates: { multiRoleTester: true },
        action: "enable-multi-role",
        adminEmail: ADMIN_EMAIL,
      },
    });
    record(
      "admin-enable-flag",
      enable.status === 200 && enable.json?.user?.multiRoleTester === true,
      `status=${enable.status}`
    );

    const disable = await requestJson(port, "POST", "/api/admin/membership-update", {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: noPermEmail,
        updates: { multiRoleTester: false },
        action: "disable-multi-role",
        adminEmail: ADMIN_EMAIL,
      },
    });
    record(
      "admin-disable-flag",
      disable.status === 200 && disable.json?.user?.multiRoleTester === false,
      `status=${disable.status}`
    );

    const list = await requestJson(port, "GET", `/api/admin/tester-role-switches?email=${encodeURIComponent(testerEmail)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    record(
      "admin-list-switches",
      list.status === 200 && Array.isArray(list.json?.switches) && list.json.switches.length >= 1,
      `status=${list.status} count=${list.json?.switches?.length}`
    );

    // Lightweight UI harness on the real server origin so role-switch fetch reaches the API.
    // Full app.js boot is flaky under SW/meta-pixel load in this environment.
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const moduleSource = fs.readFileSync(path.join(ROOT, "scripts/multi-role-tester.js"), "utf8");
    const harnessHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>MRT harness</title>
<style>
.multi-role-tester-banner{padding:12px;background:#eef6f4}
.report-bug-fab{position:fixed;right:16px;bottom:16px}
.topbar .account-actions{display:flex;gap:8px}
.modal{display:none}.modal.open{display:block}
</style></head>
<body>
<header class="topbar"><div class="account-actions"><button id="messageSupportBtn">Message Leah</button></div></header>
<main><div id="siteAnnouncementBanner"></div><div id="view-home" class="view active-view"></div></main>
<script>
window.isHomeDaycareHubTestingEnabled = () => true;
window.isLoggedIn = () => true;
window.currentUser = ${JSON.stringify(testerEmail)};
window.currentAccount = () => ({
  email: ${JSON.stringify(testerEmail)},
  role: "owner",
  multiRoleTester: true,
  hdhIndependentTester: true,
  accountType: "home_daycare",
});
window.isAdminUnlocked = () => false;
window.hasAdminFullAccess = () => false;
window.canSeeAdminNav = () => false;
window.showActionFeedback = () => {};
window.syncPlatformNavVisibility = () => {};
window.updateAdminNavVisibility = () => {};
window.updateAuthButtons = () => {};
window.syncFamilyHubParentChrome = () => {};
window.setView = (v) => { document.querySelector(".active-view")?.classList.remove("active-view");
  let el = document.querySelector("#view-"+v); if(!el){ el=document.createElement("div"); el.id="view-"+v; el.className="view"; document.querySelector("main").appendChild(el);} el.classList.add("active-view"); };
window.setHdhTesterPersona = () => {};
window.getHdhTesterPersona = () => ({ role: "teacher" });
window.staffAuthHeaders = async () => ({ "Content-Type":"application/json", "X-LLH-User-Email": window.currentUser, Authorization: "Bearer test:"+window.currentUser });
window.trackEvent = () => {};
window.openFeedbackModal = () => { document.querySelector("#feedbackModal")?.classList.add("open"); };
</script>
<form id="feedbackForm"><textarea id="feedbackMessageInput"></textarea><div class="form-actions"></div></form>
<div class="modal" id="feedbackModal"></div>
<script>${moduleSource.replace(/<\/script>/gi, "<\\/script>")}</script>
</body></html>`;
    await page.goto(`http://127.0.0.1:${port}/api/health`, { waitUntil: "domcontentloaded" });
    await page.evaluate((html) => {
      document.open();
      document.write(html);
      document.close();
    }, harnessHtml);

    await page.waitForFunction(() => typeof window.LLHMultiRoleTester !== "undefined");
    await page.waitForTimeout(200);

    const boot = await page.evaluate(() => {
      LLHMultiRoleTester.init();
      return {
        can: !!canUseMultiRoleTester(),
        switchVisible: !document.querySelector("#multiRoleSwitchBtn")?.hidden,
        fabVisible: !document.querySelector("#reportBugFab")?.hidden,
      };
    });
    record("ui-switch-and-fab", boot.can && boot.switchVisible && boot.fabVisible, JSON.stringify(boot));

    const teacher = await page.evaluate(async () => {
      await LLHMultiRoleTester.setViewRole("Teacher");
      return {
        active: LLHMultiRoleTester.getActiveViewRole(),
        key: LLHMultiRoleTester.getActiveViewRoleKey(),
        banner: document.querySelector("#multiRoleTesterBanner")?.innerText || "",
        simulating: !!isMultiRoleTesterSimulating(),
      };
    });
    record(
      "switch-teacher-banner",
      teacher.active === "Teacher" &&
        teacher.key === "teacher" &&
        teacher.simulating &&
        /viewing the app as a Teacher/i.test(teacher.banner) &&
        /Classroom tools/i.test(teacher.banner),
      JSON.stringify(teacher)
    );

    const owner = await page.evaluate(async () => {
      await LLHMultiRoleTester.setViewRole("Owner");
      return {
        active: LLHMultiRoleTester.getActiveViewRole(),
        banner: document.querySelector("#multiRoleTesterBanner")?.innerText || "",
      };
    });
    record(
      "switch-owner-banner",
      owner.active === "Owner" &&
        /viewing the app as an Owner/i.test(owner.banner) &&
        /Business management/i.test(owner.banner),
      JSON.stringify(owner)
    );

    const parent = await page.evaluate(async () => {
      await LLHMultiRoleTester.setViewRole("Parent");
      return {
        active: LLHMultiRoleTester.getActiveViewRole(),
        banner: document.querySelector("#multiRoleTesterBanner")?.innerText || "",
        familyView: !!document.querySelector("#view-family-hub.active-view"),
      };
    });
    record(
      "switch-parent",
      parent.active === "Parent" && /as a Parent/i.test(parent.banner) && parent.familyView,
      JSON.stringify(parent)
    );

    const back = await page.evaluate(() => {
      LLHMultiRoleTester.clearView({ silent: true });
      return {
        active: LLHMultiRoleTester.getActiveViewRole(),
        bannerHidden: document.querySelector("#multiRoleTesterBanner")?.hidden !== false,
      };
    });
    record("return-my-view", !back.active && back.bannerHidden, JSON.stringify(back));

    const feedback = await page.evaluate(() => {
      LLHMultiRoleTester.openSmartFeedback({ type: "Bug" });
      const ctxText = document.querySelector("#feedbackAutoContext")?.textContent || "";
      return {
        trying: !!document.querySelector("#feedbackTryingInput"),
        hasRole: /Current role:/i.test(ctxText),
        hasPage: /Page:/i.test(ctxText),
        hasDevice: /Device:/i.test(ctxText),
      };
    });
    record(
      "smart-feedback",
      feedback.trying && feedback.hasRole && feedback.hasPage && feedback.hasDevice,
      JSON.stringify(feedback)
    );

    const help = await page.evaluate(() => {
      LLHMultiRoleTester.openHelp("Teacher");
      const text = document.querySelector("#multiRoleHelpBody")?.innerText || "";
      return {
        open: document.querySelector("#multiRoleHelpModal")?.classList.contains("open"),
        can: /Daily logs/i.test(text),
        cannot: /Billing/i.test(text) && /Admin/i.test(text),
      };
    });
    record("role-help", help.open && help.can && help.cannot, JSON.stringify(help));

    // Confirm switches reached the server from harness fetches
    const list2 = await requestJson(port, "GET", `/api/admin/tester-role-switches?email=${encodeURIComponent(testerEmail)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    record(
      "harness-logged-switches",
      (list2.json?.switches || []).length >= 2,
      `count=${list2.json?.switches?.length}`
    );

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "01-multi-role-harness.png"),
      fullPage: true,
    });
    await page.close();
  } catch (error) {
    console.error(error);
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
