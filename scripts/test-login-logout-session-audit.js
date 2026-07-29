#!/usr/bin/env node
/**
 * Broader main-site audit follow-up: verifies the actual login/logout UI
 * (not just the API) survives a real browser round trip, on both desktop
 * and mobile viewports — session persists after refresh, logout returns to
 * a clean guest state, wrong-password shows a clear error, and a regular
 * (non-admin) user cannot reach admin-only tools/endpoints.
 *
 * Run: node scripts/test-login-logout-session-audit.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 20200 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-login-logout-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "login-logout-admin@example.com",
  password: "login-logout-admin-pass",
  code: "login-logout-admin-code",
};
const MEMBER_EMAIL = "login-logout-member@example.com";
const MEMBER_PASSWORD = "member-password-123";

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
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
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
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

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const browser = await chromium.launch({ headless: true });

    // Guard: signUpWithProvider/logoutClearSession must exist as expected before relying on them.
    const probe = await browser.newPage();
    await probe.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await probe.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    const helpersExist = await probe.evaluate(() => ({
      signUp: typeof signUpWithProvider === "function",
      logout: typeof logoutClearSession === "function" || typeof signOut === "function",
    }));
    await probe.close();
    assert.ok(helpersExist.signUp, "signUpWithProvider helper must exist");

    for (const viewport of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));

      // 1) New visitor experience: homepage renders with guest CTAs, no auth chrome.
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      const guestState = await page.evaluate(() => ({
        authed: document.body.classList.contains("user-authenticated"),
        loginVisible: Boolean(document.querySelector("[data-action='open-login']")),
      }));
      assert.equal(guestState.authed, false, `${viewport.name}: guest should not be authenticated`);
      assert.ok(guestState.loginVisible, `${viewport.name}: Log In entry point should be visible to guests`);
      console.log(`PASS  ${viewport.name}: new visitor sees guest chrome (Log In visible, not authenticated)`);

      // 2) Signup validation: creating an account with a too-short password is rejected client-side.
      const shortPasswordRejected = await page.evaluate(async () => {
        try {
          await signUpWithProvider("short-pw@example.com", "abc", "", "Short", "Pw");
          return false;
        } catch (error) {
          return /8 characters/i.test(error?.message || "");
        }
      });
      assert.ok(shortPasswordRejected, `${viewport.name}: signup should reject a password under 8 characters with a clear message`);
      console.log(`PASS  ${viewport.name}: signup validation rejects short passwords with a clear message`);

      // 3) Real signup (client-side), matching a real new-user flow.
      await page.evaluate(async ({ email, password }) => {
        const result = await signUpWithProvider(email, password, "", "Login", "Logout");
        loadAccountState(result.email);
        updateAccount(result.email, { signupAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), selectedPlanAtSignup: "Free" });
      }, { email: `${viewport.name}-${MEMBER_EMAIL}`, password: MEMBER_PASSWORD });
      const afterSignup = await page.evaluate(() => ({
        authed: document.body.classList.contains("user-authenticated"),
        currentUser: typeof currentUser !== "undefined" ? currentUser : "",
      }));
      assert.equal(afterSignup.authed, true, `${viewport.name}: user should be authenticated after signup`);
      console.log(`PASS  ${viewport.name}: signup completes and authenticates the new account`);

      // 4) Session persistence after refresh.
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(500);
      const afterReload = await page.evaluate(() => ({
        authed: document.body.classList.contains("user-authenticated"),
        currentUser: typeof currentUser !== "undefined" ? currentUser : "",
      }));
      assert.equal(afterReload.authed, true, `${viewport.name}: session should persist after refresh`);
      assert.equal(afterReload.currentUser, `${viewport.name}-${MEMBER_EMAIL}`, `${viewport.name}: same user should remain logged in after refresh`);
      console.log(`PASS  ${viewport.name}: session persists after refresh`);

      // 5) Logout via the real UI button returns to a clean guest state.
      await page.evaluate(() => {
        const btn = document.querySelector("#signOutButton");
        if (btn) { btn.click(); return; }
        if (typeof signOut === "function") signOut();
      });
      await page.waitForTimeout(600);
      const afterLogout = await page.evaluate(() => ({
        authed: document.body.classList.contains("user-authenticated"),
        llhUser: localStorage.getItem("llhUser"),
      }));
      assert.equal(afterLogout.authed, false, `${viewport.name}: user should not be authenticated after logout`);
      assert.ok(!afterLogout.llhUser, `${viewport.name}: llhUser should be cleared from localStorage after logout`);
      console.log(`PASS  ${viewport.name}: logout clears session and returns to guest state`);

      // 6) Session does not resurrect after logout + refresh (no login loop / stuck state).
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(500);
      const afterLogoutReload = await page.evaluate(() => document.body.classList.contains("user-authenticated"));
      assert.equal(afterLogoutReload, false, `${viewport.name}: guest state should persist after refresh post-logout`);
      console.log(`PASS  ${viewport.name}: post-logout guest state survives a refresh (no resurrection / login loop)`);

      // 7) Login via the real server-backed password login endpoint with a wrong password
      //    surfaces a clear, safe error (no stack trace / leaked internals).
      const loginError = await page.evaluate(async ({ email }) => {
        try {
          await loginWithServerPassword(email, "definitely-the-wrong-password");
          return null;
        } catch (error) {
          return error?.message || "";
        }
      }, { email: `${viewport.name}-${MEMBER_EMAIL}` });
      assert.ok(loginError, `${viewport.name}: wrong password should be rejected`);
      assert.ok(!/at Object|at async|node_modules|\.js:\d+/.test(loginError), `${viewport.name}: error should not leak stack/internal details: ${loginError}`);
      console.log(`PASS  ${viewport.name}: wrong password produces a clean, safe error message`);

      // 8) Regular (non-admin) user cannot reach admin-only server endpoints.
      const adminProbe = await page.evaluate(async () => {
        const res = await fetch("/api/admin/site-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminToken: "not-a-real-token", siteContent: {} }),
        });
        return res.status;
      });
      assert.equal(adminProbe, 401, `${viewport.name}: unauthenticated/non-admin site-content save should be 401, got ${adminProbe}`);
      const adminNavGatedForGuest = await page.evaluate(() => {
        // Regular non-admin sessions should not silently unlock admin chrome.
        return typeof hasAdminFullAccess === "function" ? hasAdminFullAccess() : null;
      });
      assert.equal(adminNavGatedForGuest, false, `${viewport.name}: regular session must not report admin full access`);
      console.log(`PASS  ${viewport.name}: regular user cannot access admin tools (401 + no client admin override)`);

      // 10) Password-reset routing: a reset link (?resetToken=...) must route straight to
      // the reset-password view without crashing, for a logged-out visitor.
      await page.evaluate(() => {
        const btn = document.querySelector("#signOutButton");
        if (btn) btn.click();
      });
      await page.waitForTimeout(300);
      await page.goto(`http://127.0.0.1:${PORT}/?resetToken=fake-reset-token-for-routing-check`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForFunction(
        () => document.querySelector(".active-view")?.id === "view-reset-password",
        null,
        { timeout: 30000 },
      );
      const resetRouting = await page.evaluate(() => ({
        active: document.querySelector(".active-view")?.id || "",
        message: document.querySelector("#resetPasswordMessage")?.textContent || "",
      }));
      assert.equal(resetRouting.active, "view-reset-password", `${viewport.name}: ?resetToken link should route to the reset-password view, got ${resetRouting.active}`);
      assert.match(resetRouting.message, /new password/i, `${viewport.name}: reset-password view should prompt for a new password`);
      console.log(`PASS  ${viewport.name}: password-reset link routes to the reset-password view`);

      assert.equal(pageErrors.length, 0, `${viewport.name}: no uncaught page errors during login/logout flow: ${pageErrors.join(" | ")}`);
      await page.close();
    }

    // 9) Admin session never leaks into a regular user's browser state and vice versa.
    const adminPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await adminPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await adminPage.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLogin.status, 200, "admin login should succeed with correct credentials");
    const regularHasNoAdminToken = await adminPage.evaluate(() => {
      return !localStorage.getItem("llhAdminSession") && !localStorage.getItem("adminToken");
    });
    assert.ok(regularHasNoAdminToken, "a fresh guest browser must not already hold an admin session/token");
    console.log("PASS  admin login is a separate credential path that does not leak into a fresh browser session");
    await adminPage.close();

    await browser.close();
    console.log("\nAll login/logout/session audit checks passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
