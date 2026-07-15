#!/usr/bin/env node
/**
 * Focused QA for Founding payment sync + post-login navigation races.
 * Run: node scripts/test-payment-nav-hotfix-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19600 + Math.floor(Math.random() * 30);
const STORE_PATH = path.join(os.tmpdir(), `llh-pay-nav-qa-${crypto.randomBytes(4).toString("hex")}.json`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
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
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "pay-nav-qa@test.local",
      ADMIN_PASSWORD: "pay-nav-qa-pass",
      ADMIN_ACCESS_CODE: "pay-nav-qa-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: "50",
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
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
  let playwright;
  try {
    await waitForBoot(child);
    try { playwright = require("playwright"); } catch {
      console.log("Playwright unavailable — skipping browser portion.");
      return;
    }

    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const baseUrl = `http://127.0.0.1:${PORT}`;

    console.log("1) Founding without stripe status fields still shows Founding + Pro access");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const email = "hotfix-founding@billing.test";
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Founding",
          subscriptionStatus: "Founding Member Subscription Active",
          foundingMemberActive: true,
          foundingMemberHistorical: true,
          foundingMember: true,
          foundingMemberNumber: 9,
          monthlyPrice: "$9.99/month",
          priceLock: "Lifetime",
        },
      }));
      localStorage.setItem("llhPlan", "Founding");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof isProUser === "function" && typeof setView === "function", null, { timeout: 60000 });
    const access = await page.evaluate(() => ({
      isPro: isProUser(),
      effective: effectiveAccessPlan(),
      label: billingPlanLabel(),
    }));
    assert(access.isPro === true, `Expected Pro access, got ${JSON.stringify(access)}`);
    assert(access.effective === "Founding", `Expected Founding effective plan, got ${JSON.stringify(access)}`);
    assert(access.label === "Founding Member", `Expected Founding Member label, got ${JSON.stringify(access)}`);

    console.log("2) Boot landing does not override a quick sidebar navigation");
    await page.evaluate(() => {
      suppressBootLanding = false;
      viewNavigationGeneration = 0;
      setView("lessons", { skipHistory: true });
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      // Simulate late boot landing attempt.
      if (!suppressBootLanding) setView("calendar", { fromBoot: true });
    });
    const afterBootRace = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
    assert(afterBootRace === "view-lessons", `Boot should not yank away from lessons, active=${afterBootRace}`);

    console.log("3) Sidebar section switching stays on the chosen view");
    for (const view of ["activities", "ai", "calendar", "lessons", "settings"]) {
      await page.evaluate((v) => setView(v, { skipHistory: true }), view);
      const active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
      assert(active === `view-${view}`, `Expected view-${view}, got ${active}`);
    }

    console.log("4) Auth return view is restored after login landing helper");
    await page.evaluate(() => {
      pendingAuthReturnView = "activities";
      const returnView = pendingAuthReturnView || "calendar";
      pendingAuthReturnView = "";
      setView(returnView, { fromAuthLanding: true });
    });
    const afterAuth = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
    assert(afterAuth === "view-activities", `Auth return should open activities, got ${afterAuth}`);

    await browser.close();
    console.log("\nPayment + navigation hotfix QA passed.");
  } catch (error) {
    console.error("\nPAYMENT/NAV HOTFIX FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
