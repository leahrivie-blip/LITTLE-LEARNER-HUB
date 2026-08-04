#!/usr/bin/env node
"use strict";
/**
 * Live acceptance checks against the deployed testing site.
 * Usage: node scripts/verify-testing-live-acceptance.js
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SITE = process.env.LLH_TESTING_URL || "https://little-learner-hub-testing.onrender.com";
const OUT = "/opt/cursor/artifacts/testing-final-acceptance";
fs.mkdirSync(OUT, { recursive: true });

async function evalTimed(page, fn, timeoutMs = 8000) {
  return Promise.race([
    page.evaluate(fn),
    new Promise((_, reject) => setTimeout(() => reject(new Error("eval-timeout")), timeoutMs)),
  ]);
}

async function waitReady(page, label) {
  // Important: do not evaluate immediately after commit — sync head work can
  // deadlock HTML parsing if the main world is entered too early.
  await new Promise((r) => setTimeout(r, 8000));
  const start = Date.now();
  for (let i = 0; i < 60; i += 1) {
    try {
      const s = await evalTimed(page, () => ({
        ready: document.readyState,
        authMode: window.LLH_CONFIG?.authMode || null,
        openAuth: typeof openAuthModal,
        setAuth: typeof setAuthMode,
        textLen: (document.body?.innerText || "").length,
      }), 10000);
      console.log(label, i, s, `${Date.now() - start}ms`);
      if (s.setAuth === "function" && s.authMode) return s;
      if (s.ready === "complete" && s.textLen > 200 && s.authMode) return s;
    } catch (error) {
      console.log(label, i, "blocked", `${Date.now() - start}ms`, String(error.message || error).slice(0, 80));
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`${label} never ready`);
}

async function main() {
  console.log("launch browser");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 240)));

  const t0 = Date.now();
  await page.goto(SITE, { waitUntil: "commit", timeout: 120000 });
  console.log("commit", Date.now() - t0);
  const ready = await waitReady(page, "boot");
  console.log("APP_READY", ready, Date.now() - t0);
  await page.screenshot({ path: path.join(OUT, "boot-ready-home.png") });

  await page.evaluate(() => openAuthModal("login"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "boot-ready-login.png") });

  await page.click("#forgotPasswordButton");
  await page.waitForTimeout(300);
  const forgotLabel = String(await page.locator("#authSubmitButton").textContent() || "").trim();
  console.log("forgotLabel", forgotLabel);
  await page.fill("#emailInput", "api-key-check.reset@example.com");
  const tReset = Date.now();
  await page.click("#authSubmitButton");
  await page.waitForTimeout(3000);
  const panel = await page.locator("#testingPasswordResetPanel.open").count();
  const body = await page.innerText("body");
  console.log(JSON.stringify({
    resetMs: Date.now() - tReset,
    panel,
    forgotLabel,
    honest: /email delivery is (off|disabled)|Reset without email|testing site recovery/i.test(body),
    fakeSent: /password reset email sent/i.test(body),
  }));
  await page.screenshot({ path: path.join(OUT, "boot-ready-reset.png") });

  await page.evaluate(() => {
    document.querySelector("#testingPasswordResetPanel")?.remove();
    document.body.classList.remove("auth-modal-open");
    openAuthModal("signup");
  });
  const email = `apikey.tester.${Date.now()}@example.com`;
  const password = "ApiKey-Tester-99!";
  await page.fill("#fullNameInput", "ApiKey Tester");
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", password);
  const tSignup = Date.now();
  await page.click("#authSubmitButton");
  await page.waitForFunction(() => !!localStorage.getItem("llhUser"), null, { timeout: 25000 }).catch(() => {});
  console.log("signup", Date.now() - tSignup, await page.evaluate(() => localStorage.getItem("llhUser")));
  await page.screenshot({ path: path.join(OUT, "boot-ready-signup.png") });

  await page.evaluate(async () => {
    try {
      if (typeof logout === "function") await logout();
    } catch (_e) { /* ignore */ }
    localStorage.removeItem("llhUser");
  });
  await page.reload({ waitUntil: "commit", timeout: 120000 });
  await waitReady(page, "reboot");
  await page.evaluate(() => openAuthModal("login"));
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", password);
  const tLogin = Date.now();
  await page.click("#authSubmitButton");
  await page.waitForFunction(() => !!localStorage.getItem("llhUser"), null, { timeout: 20000 }).catch(() => {});
  const loginMs = Date.now() - tLogin;
  const user = await page.evaluate(() => localStorage.getItem("llhUser"));
  console.log("login", loginMs, user);
  await page.screenshot({ path: path.join(OUT, "boot-ready-relogin.png") });

  const viewports = [
    { id: "iphone-se", width: 375, height: 667 },
    { id: "iphone-14", width: 390, height: 844 },
    { id: "pixel-5", width: 393, height: 851 },
    { id: "ipad-portrait", width: 834, height: 1194 },
    { id: "ipad-landscape", width: 1194, height: 834 },
    { id: "desktop-1366", width: 1366, height: 768 },
    { id: "desktop-1920", width: 1920, height: 1080 },
  ];
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log("viewport", vp.id, "overflowX", overflowX);
    await page.screenshot({ path: path.join(OUT, `matrix-${vp.id}.png`) });
  }

  const admin = JSON.parse(fs.readFileSync("/tmp/llh-db/testing-admin.json", "utf8"));
  const adminPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await adminPage.goto(`${SITE}/admin`, { waitUntil: "commit", timeout: 120000 });
  await waitReady(adminPage, "admin");
  await adminPage.evaluate(({ email: adminEmail, password: adminPassword, code }) => {
    const emailEl = document.querySelector("#adminEmail, input[type='email'], input[name='email']");
    const passEl = document.querySelector("#adminPassword, input[type='password']");
    const codeEl = document.querySelector("#adminAccessCode, input[name='accessCode']");
    if (emailEl) {
      emailEl.value = adminEmail;
      emailEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (passEl) {
      passEl.value = adminPassword;
      passEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (codeEl) {
      codeEl.value = code;
      codeEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, admin);
  await adminPage.locator('button:has-text("Unlock"), button[type="submit"]').first().click({ timeout: 10000 }).catch(() => {});
  await adminPage.waitForTimeout(3500);
  const adminBody = await adminPage.innerText("body");
  console.log("adminUnlocked", /Testing Center|Users|Curriculum|Analytics|Multi-Role|Owner/i.test(adminBody));
  await adminPage.screenshot({ path: path.join(OUT, "boot-ready-admin.png") });

  await browser.close();
  console.log("DONE_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
