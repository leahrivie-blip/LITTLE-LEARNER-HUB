#!/usr/bin/env node
/**
 * Regression: staff Account / Staff management must not call undefined roleLabel().
 * Run: NODE_ENV=test node scripts/test-staff-account-role-label.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(5200, 400);
const STORE = path.join(os.tmpdir(), `llh-staff-role-${crypto.randomBytes(4).toString("hex")}.json`);

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const next = source.indexOf("\nfunction ", start + 10);
  return source.slice(start, next > 0 ? next : undefined);
}

function sourceChecks() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const accountFn = extractFunction(appJs, "renderAccountPage");
  assert.match(accountFn, /roleDisplayLabel\(account\)/);
  assert.doesNotMatch(accountFn, /roleLabel\(getUserRole/);
  assert.doesNotMatch(accountFn, /\$\{escapeHtml\(roleLabel\(/);

  const staffFn = extractFunction(appJs, "renderStaffManagementPage");
  assert.match(staffFn, /roleDisplayLabel\(activeRole\)/);
  assert.doesNotMatch(staffFn, /roleLabel\(activeRole\)/);

  console.log("PASS  staff account/management pages use roleDisplayLabel, not undefined roleLabel()");
}

async function waitForBoot() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("boot timeout");
}

async function browserCheck() {
  let playwright;
  try { playwright = require("playwright"); } catch { playwright = null; }
  if (!playwright) {
    console.log("SKIP  browser check (playwright not installed)");
    return;
  }
  const staffAccount = {
    email: "staff@rolelabel.test",
    plan: "Free",
    role: "teacher",
    linkedProgramOwnerEmail: "owner@rolelabel.test",
  };
  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      "owner@rolelabel.test": {
        email: "owner@rolelabel.test",
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        role: "owner",
        updatedAt: new Date().toISOString(),
      },
      [staffAccount.email]: {
        ...staffAccount,
        updatedAt: new Date().toISOString(),
      },
    },
  }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    await waitForBoot();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err.message || err)));
    await page.addInitScript((account) => {
      localStorage.setItem("llhUser", account.email);
      localStorage.setItem("llhPlan", "Free");
      localStorage.setItem("llhAccounts", JSON.stringify({ [account.email]: account }));
    }, staffAccount);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof renderAccountPage === "function" && typeof currentAccount === "function", null, { timeout: 30000 });
    const result = await page.evaluate((account) => {
      localStorage.setItem("llhUser", account.email);
      const all = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      all[account.email] = { ...(all[account.email] || {}), ...account };
      localStorage.setItem("llhAccounts", JSON.stringify(all));
      if (typeof currentUser === "string") currentUser = account.email;
      if (typeof updateAccount === "function") updateAccount(account.email, account);
      renderAccountPage();
      const host = document.querySelector("#accountProgramConnection");
      return {
        text: host ? String(host.textContent || "") : "",
        hidden: host ? Boolean(host.hidden) : true,
        role: typeof roleDisplayLabel === "function" ? roleDisplayLabel(account) : "",
      };
    }, staffAccount);
    assert.equal(pageErrors.some((msg) => /roleLabel is not defined/i.test(msg)), false, `pageerror: ${pageErrors.join(" | ")}`);
    assert.equal(result.hidden, false, "linked staff should show the program connection block");
    assert.match(result.text, /connected to/i);
    assert.match(result.text, /Lead Teacher|Director|Assistant/i);
    assert.doesNotMatch(result.text, /undefined/i);
    assert.ok(result.role, "roleDisplayLabel should resolve a visible role");
    console.log("PASS  staff account page renders program connection without roleLabel crash");
  } finally {
    await browser.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 250));
    }
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

async function main() {
  sourceChecks();
  await browserCheck();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
