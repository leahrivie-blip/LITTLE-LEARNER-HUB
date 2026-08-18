#!/usr/bin/env node
/**
 * Signup drop-off fix: Start Free completes after account fields,
 * validation stays inline, analytics fire once, no duplicate accounts.
 * Run: npm run test:signup-dropoff-fix
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
const PORT = allocateSafeTestPort(19820, 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-signup-dropoff-${crypto.randomBytes(4).toString("hex")}.json`);

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    throw error;
  }
}

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
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
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
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

function countEvents(list, name) {
  return (list || []).filter((event) => event && event.name === name).length;
}

function readStoreSafe() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function waitForStoreUser(email, { timeoutMs = 4000 } = {}) {
  const started = Date.now();
  let store = null;
  let user = null;
  while (Date.now() - started < timeoutMs) {
    store = readStoreSafe();
    user = store?.users?.[email] || null;
    if (user?.signupAt) return { store, user };
    await new Promise((r) => setTimeout(r, 200));
  }
  return { store, user };
}

function staticChecks() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const insights = fs.readFileSync(path.join(ROOT, "server/admin-insights.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  test("Free-intent helpers exist and stay isolated", () => {
    assert.match(appJs, /function isExplicitFreeSignupIntent/);
    assert.match(appJs, /function isPlausibleSignupEmail/);
    assert.match(appJs, /function trackSignupStartOnce/);
    assert.match(appJs, /function emitSignupCompleteOnce/);
    assert.match(appJs, /isExplicitFreeSignupIntent\(preferredPlan\)/);
    assert.match(appJs, /await finishSignupWithPlan\("free"\)/);
    assert.match(appJs, /signup_form_submit/);
    assert.match(appJs, /signup_landed_free/);
  });

  test("duplicate email is rejected before local overwrite", () => {
    const idx = appJs.indexOf("async function signUpWithProvider");
    const slice = appJs.slice(idx, idx + 1800);
    assert.match(slice, /email-already-in-use/);
    assert.match(slice, /An account already exists for this email/);
    assert.match(slice, /isPlausibleSignupEmail/);
  });

  test("signup-complete is not gated on profile sync", () => {
    const marker = "const result = await signUpWithProvider(email, password, phone, firstName, lastName)";
    const idx = appJs.indexOf(marker);
    assert.ok(idx > 0);
    const slice = appJs.slice(idx, idx + 2800);
    assert.match(slice, /emitSignupCompleteOnce/);
    assert.doesNotMatch(slice, /if \(syncedUser\) \{\s*trackEvent\("account_signup_complete"/);
    assert.match(slice, /signupWizardStep = 2/);
  });

  test("Start Free CTAs still open the same signup modal", () => {
    assert.match(indexHtml, /data-action="start-free"/);
    assert.match(appJs, /data-action='start-free'/);
    assert.match(appJs, /setPreferredSignupPlan\(intent \|\| "free"\)/);
    assert.match(appJs, /openAuthModal\("signup"\)/);
  });

  test("funnel instrumentation is additive", () => {
    assert.match(insights, /SIGNUP_STEP_EVENT_NAMES/);
    assert.match(insights, /signupStepCounts/);
    assert.match(insights, /signup_form_submit/);
    assert.match(insights, /signup_landed_free/);
  });
}

async function openStartFree(page) {
  await page.locator("[data-action='start-free']").first().click();
  await page.waitForSelector("#authModal.open", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#fullNameInput") && !document.querySelector("#signupStepAccount")?.classList.contains("hidden-field"));
}

async function eventNames(page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("llhAnalyticsEvents") || "[]");
    } catch {
      return [];
    }
  });
}

async function main() {
  staticChecks();
  console.log("PASS  static signup drop-off markers");

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);

    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof openAuthModal === "function" && typeof isExplicitFreeSignupIntent === "function", null, { timeout: 30000 });

    await openStartFree(page);
    await page.evaluate(() => {
      if (typeof setAuthMode === "function") setAuthMode("signup");
      if (typeof openAuthModal === "function") openAuthModal("signup");
    });
    const afterOpen = await eventNames(page);
    assert.equal(countEvents(afterOpen, "signup_start"), 1, "signup_start must fire once per session");
    console.log("PASS  analytics signup-start fires once");

    await page.fill("#fullNameInput", "Jordan Provider");
    await page.fill("#emailInput", "not-an-email");
    await page.fill("#passwordInput", "TestPass123!");
    await page.click("#authSubmitButton");
    await page.waitForFunction(() => /valid email/i.test(document.querySelector("#authMessage")?.textContent || ""));
    assert.equal(await page.inputValue("#fullNameInput"), "Jordan Provider");
    assert.equal(await page.inputValue("#emailInput"), "not-an-email");
    assert.equal(await page.inputValue("#passwordInput"), "TestPass123!");
    console.log("PASS  invalid email handled and values preserved");

    await page.fill("#emailInput", "jordan.provider.dropoff@example.com");
    await page.fill("#passwordInput", "short");
    await page.click("#authSubmitButton");
    await page.waitForFunction(() => /8 characters/i.test(document.querySelector("#authMessage")?.textContent || ""));
    assert.equal(await page.inputValue("#emailInput"), "jordan.provider.dropoff@example.com");
    assert.equal(await page.inputValue("#fullNameInput"), "Jordan Provider");
    console.log("PASS  password validation works and values preserved");

    await page.fill("#passwordInput", "TestPass123!");
    const submit = page.locator("#authSubmitButton");
    await Promise.all([
      submit.click(),
      submit.click().catch(() => {}),
    ]);
    await page.waitForFunction(() => {
      const authClosed = !document.querySelector("#authModal")?.classList.contains("open");
      const programHidden = document.querySelector("#signupStepProgram")?.classList.contains("hidden-field");
      const user = localStorage.getItem("llhUser") || "";
      return authClosed && programHidden && /jordan\.provider\.dropoff@example\.com/i.test(user);
    }, { timeout: 20000 });

    const afterSignup = await eventNames(page);
    assert.equal(countEvents(afterSignup, "account_signup_complete"), 1, "signup-complete must fire once");
    assert.equal(countEvents(afterSignup, "signup_form_submit"), 1);
    assert.ok(countEvents(afterSignup, "signup_landed_free") >= 1);
    assert.ok(countEvents(afterSignup, "signup_start") === 1);

    const session = await page.evaluate(() => ({
      user: localStorage.getItem("llhUser"),
      plan: localStorage.getItem("llhPlan"),
      view: document.querySelector(".active-view")?.id || "",
      nuoOpen: document.querySelector("#newUserOnboardingModal")?.classList.contains("open") || false,
    }));
    assert.equal(session.user, "jordan.provider.dropoff@example.com");
    assert.equal(session.plan, "Free");
    assert.match(session.view, /view-lessons|view-calendar/);
    console.log("PASS  free signup authenticates and lands on Free destination");

    const first = await waitForStoreUser("jordan.provider.dropoff@example.com");
    assert.ok(first.user, "server created the Free account");
    assert.equal(first.user.plan || "Free", "Free");
    assert.equal(Object.keys(first.store.users || {}).length, 1, "exactly one account after first signup");
    console.log("PASS  successful signup creates one Free server account");

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.setViewportSize({ width: 1280, height: 800 });
    await page2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page2.waitForFunction(() => typeof openAuthModal === "function", null, { timeout: 30000 });
    await page2.evaluate(() => {
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      accounts["jordan.provider.dropoff@example.com"] = {
        email: "jordan.provider.dropoff@example.com",
        signupAt: new Date().toISOString(),
        passwordHash: "existing",
        plan: "Free",
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
    });
    await page2.locator("[data-action='start-free']").first().click();
    await page2.waitForSelector("#authModal.open");
    await page2.fill("#fullNameInput", "Jordan Two");
    await page2.fill("#emailInput", "jordan.provider.dropoff@example.com");
    await page2.fill("#passwordInput", "TestPass123!");
    await page2.click("#authSubmitButton");
    await page2.waitForFunction(() => /already exists/i.test(document.querySelector("#authMessage")?.textContent || ""));
    assert.equal(await page2.inputValue("#emailInput"), "jordan.provider.dropoff@example.com");
    console.log("PASS  duplicate email handled clearly");
    await ctx2.close();

    const finalRead = await waitForStoreUser("jordan.provider.dropoff@example.com");
    assert.equal(Object.keys(finalRead.store?.users || {}).length, 1, "duplicate submit did not create a second account");

    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    await page3.setViewportSize({ width: 1280, height: 800 });
    await page3.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page3.waitForFunction(() => typeof openAuthModal === "function", null, { timeout: 30000 });
    await page3.evaluate(() => {
      try { sessionStorage.removeItem("llhSignupPreferredPlan"); } catch { /* ignore */ }
      openAuthModal("signup");
    });
    await page3.fill("#fullNameInput", "Casey Neutral");
    await page3.fill("#emailInput", `casey.neutral.${Date.now()}@example.com`);
    await page3.fill("#passwordInput", "TestPass123!");
    await page3.click("#authSubmitButton");
    await page3.waitForFunction(() => {
      const program = document.querySelector("#signupStepProgram");
      return program && !program.classList.contains("hidden-field");
    }, { timeout: 20000 });
    console.log("PASS  non-Free signup still reaches program step");
    await ctx3.close();

    console.log("\nAll signup drop-off fix tests passed.");
  } catch (error) {
    console.error(error);
    console.error(bootLog.slice(-2500));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
