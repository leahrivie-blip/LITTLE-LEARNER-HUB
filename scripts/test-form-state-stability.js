#!/usr/bin/env node
/**
 * Regression: auth + admin forms must keep in-progress input across background re-renders.
 *
 * Run: npm run test:form-state-stability
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(21400, 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-form-state-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "form-state-admin@example.com",
  password: "form-state-admin-pass",
  code: "form-state-admin-code",
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

async function waitForApp(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof openAuthModal === "function" && typeof renderAdminDashboard === "function", null, { timeout: 30000 });
  await page.waitForFunction(() => document.body.classList.contains("app-booted"), null, { timeout: 30000 });
}

async function testLoginPreservesOnRerender(page) {
  const memberEmail = "login-preserve@example.com";
  const password = "login-preserve-password";
  await page.evaluate(async ({ email, pass }) => {
    const result = await signUpWithProvider(email, pass, "", "Login", "Preserve");
    loadAccountState(result.email);
    if (typeof signOut === "function") signOut();
  }, { email: memberEmail, pass: password });
  await page.evaluate(() => openAuthModal("login"));
  await page.waitForSelector("#authModal.open");
  await page.fill("#emailInput", memberEmail);
  await page.evaluate(() => {
    if (typeof refreshFoundingDisplays === "function") refreshFoundingDisplays();
    if (typeof updateAuthButtons === "function") updateAuthButtons();
    if (typeof openAuthModal === "function") openAuthModal("login");
  });
  assert.equal(await page.inputValue("#emailInput"), memberEmail, "login email survives background rerender");
  await page.fill("#passwordInput", password);
  await page.evaluate(() => {
    if (typeof syncPublicFoundingOfferUi === "function") syncPublicFoundingOfferUi();
    if (typeof openAuthModal === "function") openAuthModal("login");
  });
  assert.equal(await page.inputValue("#passwordInput"), password, "login password survives background rerender");
  await page.fill("#passwordInput", `${password}-wrong`);
  await page.click("#authSubmitButton");
  await page.waitForFunction(() => /did not match|try again/i.test(document.querySelector("#authMessage")?.textContent || ""), null, { timeout: 10000 });
  assert.equal(await page.inputValue("#emailInput"), memberEmail, "failed login keeps email");
  assert.equal(await page.inputValue("#passwordInput"), `${password}-wrong`, "failed login keeps password");
  console.log("PASS  login form preserves input across rerender + failed login");
}

async function testSignupPreservesOnRerender(page) {
  await page.evaluate(() => {
    if (typeof closeAuthModal === "function") closeAuthModal();
    openAuthModal("signup");
  });
  await page.waitForSelector("#authModal.open");
  await page.fill("#fullNameInput", "Form State Tester");
  await page.fill("#emailInput", "signup-preserve@example.com");
  await page.fill("#passwordInput", "signup-preserve-pass");
  await page.evaluate(() => {
    if (typeof renderSignupWizardStep === "function") renderSignupWizardStep();
    if (typeof refreshFoundingDisplays === "function") refreshFoundingDisplays();
    if (typeof openAuthModal === "function") openAuthModal("signup");
  });
  const values = await page.evaluate(() => ({
    name: document.querySelector("#fullNameInput")?.value || "",
    email: document.querySelector("#emailInput")?.value || "",
    password: document.querySelector("#passwordInput")?.value || "",
  }));
  assert.equal(values.name, "Form State Tester");
  assert.equal(values.email, "signup-preserve@example.com");
  assert.equal(values.password, "signup-preserve-pass");
  await page.fill("#emailInput", "not-an-email");
  await page.click("#authSubmitButton");
  await page.waitForTimeout(250);
  const afterValidation = await page.evaluate(() => ({
    name: document.querySelector("#fullNameInput")?.value || "",
    email: document.querySelector("#emailInput")?.value || "",
    message: document.querySelector("#authMessage")?.textContent || "",
  }));
  assert.match(afterValidation.message, /valid email/i);
  assert.equal(afterValidation.name, "Form State Tester", "signup validation keeps name");
  assert.equal(afterValidation.email, "not-an-email", "signup validation keeps edited email");
  console.log("PASS  signup form preserves input across rerender + validation");
}

async function testAdminUnlockPreservesOnRerender(page) {
  await page.evaluate(() => setView("admin"));
  await page.waitForSelector("#adminUnlockForm");
  const genBefore = await page.evaluate(() => window.adminUnlockShellGeneration || 0);
  await page.fill('input[name="adminEmail"]', ADMIN.email);
  await page.fill('input[name="adminPassword"]', "typing-owner-password");
  await page.fill('input[name="adminCode"]', "typing-access-code");
  await page.focus('input[name="adminPassword"]');
  await page.evaluate(() => {
    if (typeof renderAdminDashboard === "function") renderAdminDashboard();
    if (typeof refreshFoundingDisplays === "function") refreshFoundingDisplays();
  });
  const genAfter = await page.evaluate(() => window.adminUnlockShellGeneration || 0);
  assert.equal(genAfter, genBefore, "admin unlock form must not be recreated while user is typing");
  assert.equal(await page.inputValue('input[name="adminEmail"]'), ADMIN.email);
  assert.equal(await page.inputValue('input[name="adminPassword"]'), "typing-owner-password");
  assert.equal(await page.inputValue('input[name="adminCode"]'), "typing-access-code");
  console.log("PASS  admin unlock form preserves input and avoids remount during rerender");
}

async function testAdminFounderFormPreservesOnRerender(page) {
  await page.evaluate(({ adminEmail }) => {
    localStorage.setItem("llhAdminUnlocked", "true");
    localStorage.setItem("llhAdminSession", JSON.stringify({
      email: adminEmail,
      token: "local-preview-admin",
      unlockedAt: new Date().toISOString(),
    }));
  }, { adminEmail: ADMIN.email });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await page.evaluate(() => {
    setView("admin");
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("founder");
    if (typeof renderAdminContentManager === "function") renderAdminContentManager();
  });
  await page.waitForSelector("#adminFounderForm");
  const draftName = "Unsaved Founder Draft Name";
  await page.fill('#adminFounderForm input[name="name"]', draftName);
  await page.focus('#adminFounderForm input[name="name"]');
  await page.evaluate(() => {
    if (typeof renderAdminDashboard === "function") renderAdminDashboard();
    if (typeof refreshFoundingDisplays === "function") refreshFoundingDisplays();
  });
  assert.equal(await page.inputValue('#adminFounderForm input[name="name"]'), draftName, "admin founder draft survives rerender");
  console.log("PASS  admin content form preserves unsaved edits across rerender");
}

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await waitForApp(page);
      await testLoginPreservesOnRerender(page);
      await testSignupPreservesOnRerender(page);
      await testAdminUnlockPreservesOnRerender(page);
      await testAdminFounderFormPreservesOnRerender(page);
    } finally {
      await page.close();
      await browser.close();
    }
    console.log("\nAll form-state stability tests passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
