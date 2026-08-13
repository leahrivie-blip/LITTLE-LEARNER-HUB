#!/usr/bin/env node
/**
 * Authenticated owner `/#/admin` deep-link boot: capture intended route before
 * auth hydration so Admin Content Manager is not overwritten by Calendar/home.
 *
 * Run: npm run test:admin-deeplink-boot
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 20410 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-deeplink-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const ADMIN = {
  email: "admin-deeplink@test.local",
  password: "admin-deeplink-pass",
  code: "admin-deeplink-code",
};
const MEMBER = {
  email: "member-deeplink@test.local",
  password: "member-deeplink-pass-1",
};

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: BASE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function assertStaticContract() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /let pendingIntendedBootView = ""/);
  assert.match(appJs, /function captureIntendedBootViewFromLocation\(/);
  assert.match(appJs, /function locationRouteKey\(/);
  assert.match(appJs, /hashKey === "#\/admin" \|\| hashKey === "#admin"/);
  assert.match(appJs, /pendingAuthReturnView = pendingAuthReturnView \|\| "admin"/);
  const bootStart = appJs.indexOf("async function initializeAppView(");
  const bootEnd = appJs.indexOf("initializeAppView();", bootStart);
  const boot = appJs.slice(bootStart, bootEnd);
  assert.match(boot, /const intendedView = captureIntendedBootViewFromLocation\(\)/);
  assert.match(boot, /pendingIntendedBootView \|\| intendedView \|\| initialViewFromLocation\(\)/);
  assert.doesNotMatch(
    boot,
    /if \(params\.get\("view"\) === "admin" && \(canSeeAdminNav/,
    "admin deep-link recognition must not wait on hydrated owner nav",
  );
  console.log("PASS  static contract: pending intended admin route is captured before hydration");
}

async function adminLoginToken() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert.equal(res.status, 200, `admin login failed: ${res.text}`);
  assert.ok(res.json?.token, "admin login token missing");
  return res.json.token;
}

function seedOwnerAdmin(page, token) {
  return page.addInitScript(({ email, token: adminToken }) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: {
        email,
        plan: "Pro",
        subscriptionStatus: "Active",
        stripeSubscriptionStatus: "active",
        accountType: "home_daycare",
        role: "owner",
      },
    }));
    localStorage.setItem("llhAdminUnlocked", "true");
    localStorage.setItem("llhAdminSession", JSON.stringify({
      token: adminToken,
      email,
      mode: "server",
      trustedDevice: true,
    }));
    localStorage.setItem("llhAdminPreviewMode", "Admin");
    sessionStorage.setItem("llhLastPlatformView", "calendar");
  }, { email: ADMIN.email, token });
}

function seedMember(page) {
  return page.addInitScript(({ email }) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhPlan", "Free");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: {
        email,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        accountType: "home_daycare",
        role: "owner",
      },
    }));
    sessionStorage.setItem("llhLastPlatformView", "calendar");
  }, { email: MEMBER.email });
}

async function delayMembershipSync(page, ms = 1200) {
  await page.route("**/api/subscription-status**", async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

async function waitForBootReady(page) {
  await page.waitForFunction(
    () => document.body.classList.contains("app-boot-ready") && typeof setView === "function",
    null,
    { timeout: 45000 },
  );
}

async function adminViewState(page) {
  return page.evaluate(() => {
    const active = document.querySelector(".active-view")?.id.replace("view-", "") || "";
    const heading = document.querySelector("#view-admin h2")?.textContent || "";
    const protectedVisible = Boolean(document.querySelector("#adminProtectedContent:not([hidden])"));
    const unlockVisible = Boolean(document.querySelector("#adminUnlockForm"));
    return {
      active,
      heading,
      protectedVisible,
      unlockVisible,
      hash: window.location.hash || "",
      pathname: window.location.pathname || "",
      intended: typeof pendingIntendedBootView !== "undefined" ? pendingIntendedBootView : "",
      pendingReturn: typeof pendingAuthReturnView !== "undefined" ? pendingAuthReturnView : "",
      adminFull: typeof hasAdminFullAccess === "function" ? hasAdminFullAccess() : false,
    };
  });
}

async function screenshot(page, name) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, name), fullPage: true });
  } catch {
    /* artifacts are optional */
  }
}

async function main() {
  assertStaticContract();
  const child = startServer();
  try {
    await waitForBoot(child);
    const token = await adminLoginToken();
    const { chromium, devices } = require("playwright");
    const browser = await chromium.launch({ headless: true });

    try {
      console.log("1) Authenticated owner direct-open /#/admin → Admin");
      {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await delayMembershipSync(page);
        await seedOwnerAdmin(page, token);
        await page.goto(`${BASE}/#/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(page);
        await page.waitForSelector("#view-admin.active-view", { timeout: 20000 });
        const state = await adminViewState(page);
        assert.equal(state.active, "admin", `expected admin view, got ${state.active}`);
        assert.match(state.heading, /Admin Content Manager/);
        assert.equal(state.protectedVisible, true, "owner should see unlocked Admin Content Manager");
        assert.equal(state.adminFull, true);
        await screenshot(page, "admin-deeplink-owner-direct-desktop.png");
        await page.close();
        console.log("PASS  authenticated owner direct-open /#/admin → Admin");
      }

      console.log("2) Authenticated owner refresh /#/admin → Admin");
      {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await delayMembershipSync(page);
        await seedOwnerAdmin(page, token);
        await page.goto(`${BASE}/#/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(page);
        await page.waitForSelector("#view-admin.active-view", { timeout: 20000 });
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(page);
        await page.waitForSelector("#view-admin.active-view", { timeout: 20000 });
        const state = await adminViewState(page);
        assert.equal(state.active, "admin", `refresh expected admin, got ${state.active}`);
        assert.equal(state.protectedVisible, true);
        await screenshot(page, "admin-deeplink-owner-refresh-desktop.png");
        await page.close();
        console.log("PASS  authenticated owner refresh /#/admin → Admin");
      }

      console.log("3) Logged-out direct-open /#/admin → login → Admin");
      {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(`${BASE}/#/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(page);
        await page.waitForSelector("#view-admin.active-view", { timeout: 20000 });
        const beforeLogin = await adminViewState(page);
        assert.equal(beforeLogin.active, "admin", `logged-out should keep admin destination, got ${beforeLogin.active}`);
        assert.equal(beforeLogin.pendingReturn, "admin", "logged-out /#/admin must preserve pendingAuthReturnView");
        assert.equal(beforeLogin.protectedVisible, false, "logged-out must not see protected admin content");
        assert.equal(beforeLogin.unlockVisible, true, "logged-out owner should see Admin unlock/login");

        const afterLogin = await page.evaluate(async ({ email, password }) => {
          const result = await signUpWithProvider(email, password, "", "Owner", "Deeplink");
          loadAccountState(result.email);
          const returnView = pendingAuthReturnView
            && canOpenViewForCurrentAccess(pendingAuthReturnView)
            ? pendingAuthReturnView
            : "calendar";
          pendingAuthReturnView = "";
          setView(returnView, { fromAuthLanding: true });
          return {
            active: document.querySelector(".active-view")?.id.replace("view-", "") || "",
            returnView,
          };
        }, { email: `owner-return-${ADMIN.email}`, password: ADMIN.password });
        assert.equal(afterLogin.returnView, "admin", "member login must return to admin, not calendar");
        assert.equal(afterLogin.active, "admin");
        await screenshot(page, "admin-deeplink-logged-out-return.png");
        await page.close();
        console.log("PASS  logged-out direct-open /#/admin → login → Admin");
      }

      console.log("4) Normal user direct-open /#/admin → denied");
      {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await delayMembershipSync(page, 400);
        await seedMember(page);
        await page.goto(`${BASE}/#/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(page);
        const state = await adminViewState(page);
        assert.equal(state.adminFull, false, "non-admin must not receive full admin access");
        assert.equal(state.protectedVisible, false, "non-admin must not see protected Admin Content Manager");
        const siteContent = await page.evaluate(async () => {
          const res = await fetch("/api/admin/site-content", {
            method: "GET",
            headers: { Accept: "application/json" },
          });
          return res.status;
        });
        assert.equal(siteContent, 401, `non-admin admin API must stay 401, got ${siteContent}`);
        await screenshot(page, "admin-deeplink-member-denied.png");
        await page.close();
        console.log("PASS  normal user direct-open /#/admin → denied");
      }

      console.log("5) Existing Admin navigation still works");
      {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await seedOwnerAdmin(page, token);
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(page);
        await page.evaluate(() => {
          if (typeof setView === "function") setView("admin");
        });
        await page.waitForSelector("#view-admin.active-view", { timeout: 20000 });
        const state = await adminViewState(page);
        assert.equal(state.active, "admin");
        assert.equal(state.protectedVisible, true);
        await screenshot(page, "admin-deeplink-existing-nav.png");
        await page.close();
        console.log("PASS  existing Admin navigation → Admin");
      }

      console.log("6) Normal customer homepage/dashboard routing");
      {
        const guest = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await guest.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(guest);
        const guestState = await guest.evaluate(() => ({
          active: document.querySelector(".active-view")?.id.replace("view-", "") || "",
          landing: document.querySelector("#view-home")?.classList.contains("landing-home") || false,
          adminActive: document.querySelector("#view-admin")?.classList.contains("active-view") || false,
        }));
        assert.equal(guestState.adminActive, false, "guest homepage must not open Admin");
        assert.ok(guestState.active === "home" || guestState.landing, `guest should see homepage, got ${guestState.active}`);
        await guest.close();

        const member = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await seedMember(member);
        await member.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(member);
        const memberState = await member.evaluate(() => ({
          active: document.querySelector(".active-view")?.id.replace("view-", "") || "",
          adminActive: document.querySelector("#view-admin")?.classList.contains("active-view") || false,
        }));
        assert.equal(memberState.adminActive, false, "signed-in customer / must not open Admin");
        assert.notEqual(memberState.active, "admin");
        await member.close();
        console.log("PASS  normal customer homepage/dashboard routing");
      }

      console.log("7) Mobile-width direct-load /#/admin");
      {
        const iphone = devices["iPhone 13"];
        const page = await browser.newPage({ ...iphone, viewport: { width: 390, height: 844 } });
        await delayMembershipSync(page);
        await seedOwnerAdmin(page, token);
        await page.goto(`${BASE}/#/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForBootReady(page);
        await page.waitForSelector("#view-admin.active-view", { timeout: 20000 });
        const state = await adminViewState(page);
        assert.equal(state.active, "admin");
        assert.equal(state.protectedVisible, true);
        await screenshot(page, "admin-deeplink-owner-direct-mobile.png");
        await page.close();
        console.log("PASS  mobile-width/direct-load /#/admin → Admin");
      }
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
  console.log("\nAll admin deep-link boot tests passed.");
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
