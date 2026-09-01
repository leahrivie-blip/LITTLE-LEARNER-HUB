#!/usr/bin/env node
/**
 * Proves Forgot Password no longer auto-opens the Reset Password page
 * without a resetToken, while a real reset-link URL still does.
 *
 * Run: NODE_ENV=test node scripts/test-forgot-password-no-tokenless-handoff.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 20310 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-forgot-handoff-${crypto.randomBytes(4).toString("hex")}.json`);

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
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      "handoff.user@example.com": {
        email: "handoff.user@example.com",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        passwordHash: crypto.createHash("sha256").update("OldPassword-1!").digest("hex"),
        serverPasswordAuth: true,
        emailVerified: true,
      },
    },
    siteContent: {},
    adminSessions: {},
    memberSessions: {},
    emailAuth: { tokens: [] },
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "handoff-admin@example.com",
      ADMIN_PASSWORD: "handoff-admin-pass",
      ADMIN_ACCESS_CODE: "handoff-admin-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
      FIREBASE_API_KEY: "",
      FIREBASE_AUTH_DOMAIN: "",
      FIREBASE_PROJECT_ID: "",
      FIREBASE_APP_ID: "",
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

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const candidates = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      path.join(os.homedir(), ".cache/ms-playwright/chromium-1228/chrome-linux64/chrome"),
    ].filter(Boolean);
    for (const executablePath of candidates) {
      if (fs.existsSync(executablePath)) {
        return chromium.launch({ headless: true, executablePath });
      }
    }
    throw error;
  }
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
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const forgotStart = appJs.indexOf("const message = await sendPasswordReset(email);");
  const signupStart = appJs.indexOf('if (currentAuthMode === "signup")', forgotStart);
  const forgotSuccessHandler = appJs.slice(forgotStart, signupStart);
  assert.match(forgotSuccessHandler, /sendPasswordReset\(/);
  assert.match(forgotSuccessHandler, /setFormMessage\("#authMessage", message, true\)/);
  assert.doesNotMatch(forgotSuccessHandler, /setView\(\s*["']reset-password["']\s*\)/);
  assert.match(appJs, /fetch\("\/api\/auth\/request-password-reset"/);
  assert.match(appJs, /fetch\("\/api\/auth\/password-reset\/complete"/);
  assert.match(appJs, /function loginWithProvider/);
  assert.match(appJs, /async function signUpWithProvider/);
  assert.match(appJs, /sendPasswordResetEmail\(client\.auth/);

  const child = startServer();
  try {
    await waitForBoot(child);
    const resetReq = await requestJson("POST", "/api/auth/request-password-reset", {
      email: "handoff.user@example.com",
    });
    assert.equal(resetReq.status, 200);
    assert.equal(resetReq.json.ok, true);

    const browser = await launchChromium();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await page.evaluate(() => openAuthModal("login"));
    await page.waitForSelector("#authModal.open", { timeout: 10000 });
    await page.click("#forgotPasswordButton");
    await page.fill("#emailInput", "handoff.user@example.com");
    await page.click("#authSubmitButton");
    await page.waitForTimeout(800);

    const afterForgot = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      resetActive: document.querySelector("#view-reset-password")?.classList.contains("active-view") || false,
    }));
    assert.notEqual(afterForgot.active, "view-reset-password", "Forgot Password must not auto-open Reset Password");
    assert.equal(afterForgot.resetActive, false, "Reset Password view must stay inactive after a reset-email request");

    await page.goto(`http://127.0.0.1:${PORT}/?view=reset-password&resetToken=VALID_TOKEN`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector(".active-view")?.id === "view-reset-password",
      null,
      { timeout: 30000 },
    );
    const fromLink = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      message: document.querySelector("#resetPasswordMessage")?.textContent || "",
    }));
    assert.equal(fromLink.active, "view-reset-password");
    assert.match(fromLink.message, /new password/i);

    await browser.close();
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
  console.log("PASS  forgot-password no longer auto-opens Reset Password; resetToken URL still does");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
