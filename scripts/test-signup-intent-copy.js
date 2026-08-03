#!/usr/bin/env node
/**
 * Signup modal copy must follow the CTA plan intent (Free / Pro / Trial).
 * Run: npm run test:signup-intent-copy
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium, devices } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 4730 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-signup-intent-${process.pid}.json`);

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  fs.rmSync(STORE_PATH, { force: true });
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: "signup-intent-admin@example.com",
      ADMIN_PASSWORD: "signup-intent-pass",
      ADMIN_ACCESS_CODE: "signup-intent-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function readSignupCopy(page) {
  return page.evaluate(() => {
    const title = document.querySelector("#authTitle")?.textContent?.trim() || "";
    const noteEl = document.querySelector("#authFoundingContinueNote");
    return {
      title,
      note: noteEl?.textContent?.trim() || "",
      noteHidden: Boolean(noteEl?.hidden),
      intent: noteEl?.dataset?.signupIntent || "",
      modalOpen: document.querySelector("#authModal")?.classList.contains("open") === true,
    };
  });
}

async function closeSignup(page) {
  await page.locator("#closeModal").click();
  await page.waitForFunction(() => !document.querySelector("#authModal")?.classList.contains("open"), null, { timeout: 5000 });
}

async function assertIntent(page, label, expected) {
  const copy = await readSignupCopy(page);
  assert.equal(copy.modalOpen, true, `${label}: modal open`);
  assert.match(copy.title, expected.title, `${label}: title`);
  assert.equal(copy.noteHidden, false, `${label}: note visible`);
  assert.match(copy.note, expected.note, `${label}: note`);
  if (expected.intent) assert.equal(copy.intent, expected.intent, `${label}: intent attr`);
}

async function runViewport(browser, viewportName, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof window.openAuthModal === "function" || document.querySelector("[data-action='start-free']"), null, { timeout: 20000 });

  // Free pricing CTA
  await page.locator("#homePricing [data-plan='Free'][data-action='start-free']").click();
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await assertIntent(page, `${viewportName} free pricing`, {
    title: /Create Your Free Little Learner Hub Account/i,
    note: /Create your free account to start exploring Little Learner Hub/i,
    intent: "free",
  });
  await closeSignup(page);

  // Hero Start Free
  await page.locator("#homeHero [data-action='start-free']").first().click();
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await assertIntent(page, `${viewportName} hero start free`, {
    title: /Create Your Free Little Learner Hub Account/i,
    note: /Create your free account to start exploring Little Learner Hub/i,
    intent: "free",
  });
  await closeSignup(page);

  // Header Sign Up
  await page.locator(".llh-public-nav-actions [data-action='start-free']").click();
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await assertIntent(page, `${viewportName} header sign up`, {
    title: /Create Your Free Little Learner Hub Account/i,
    note: /Create your free account to start exploring Little Learner Hub/i,
    intent: "free",
  });
  await closeSignup(page);

  // Pro Monthly CTA
  await page.locator("#homePricing [data-checkout-plan='monthly']").click();
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await assertIntent(page, `${viewportName} pro monthly`, {
    title: /Continue with Pro/i,
    note: /Create your account to continue with Pro membership/i,
    intent: "monthly",
  });
  await closeSignup(page);

  // After Pro close, Free must not retain Pro copy
  await page.locator("#homePricing [data-plan='Free'][data-action='start-free']").click();
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await assertIntent(page, `${viewportName} free after pro`, {
    title: /Create Your Free Little Learner Hub Account/i,
    note: /Create your free account to start exploring Little Learner Hub/i,
    intent: "free",
  });
  await closeSignup(page);

  // Trial CTA (synthetic button uses the real click handler)
  await page.evaluate(() => {
    const existing = document.querySelector("[data-testid='signup-intent-trial-cta']");
    if (existing) existing.remove();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-start-pro-trial", "1");
    btn.setAttribute("data-testid", "signup-intent-trial-cta");
    btn.textContent = "Start Trial";
    btn.style.position = "fixed";
    btn.style.left = "8px";
    btn.style.bottom = "8px";
    btn.style.zIndex = "99999";
    document.body.appendChild(btn);
  });
  await page.locator("[data-testid='signup-intent-trial-cta']").click();
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await assertIntent(page, `${viewportName} trial`, {
    title: /7-day Pro trial/i,
    note: /credit card is required/i,
    intent: "trial",
  });
  await closeSignup(page);

  console.log(`PASS  ${viewportName} signup intent copy`);
  await context.close();
}

async function main() {
  // Static contract first
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /function signupIntentPresentation/);
  assert.match(appJs, /setPreferredSignupPlan\(intent \|\| "free"\)/);
  assert.match(appJs, /setPreferredSignupPlan\("trial"\)/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("#signupButton"), appJs.indexOf("#closeModal")),
    /setPreferredSignupPlan\("founding"\)/,
  );

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(child);
    await runViewport(browser, "desktop", { width: 1280, height: 900 });
    await runViewport(browser, "mobile", devices["iPhone 13"].viewport || { width: 390, height: 844 });
    console.log("\nAll signup intent copy tests passed.");
  } finally {
    await browser.close().catch(() => {});
    if (child.exitCode === null) child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
