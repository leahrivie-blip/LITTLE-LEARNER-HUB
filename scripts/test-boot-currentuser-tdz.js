#!/usr/bin/env node
/**
 * Regression: boot must not TDZ-crash when curriculum library cache is present.
 *
 * Cold-start hydration fills siteContentState.curriculumLibrary before loadResources().
 * loadCurriculumManagedActivities() calls isProUser() → currentAccount() → currentUser.
 * currentUser must be initialized before that path runs.
 *
 * Run: node scripts/test-boot-currentuser-tdz.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19610 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-boot-tdz-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "boot-tdz@test.local",
  password: "boot-tdz-pass",
  code: "boot-tdz-code",
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
        timeout: 15000,
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
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
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

function assertSourceOrder() {
  const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const authMarker = "Auth session must be initialized before boot cache + loadResources()";
  const authIdx = src.indexOf(authMarker);
  assert.ok(authIdx > 0, "missing auth boot-order comment");
  const slice = src.slice(authIdx, authIdx + 2500);
  const userIdx = slice.indexOf('let currentUser = localStorage.getItem("llhUser")');
  const resourcesIdx = slice.indexOf("let resources = loadResources()");
  assert.ok(userIdx >= 0, "currentUser declaration missing near boot");
  assert.ok(resourcesIdx >= 0, "resources declaration missing near boot");
  assert.ok(userIdx < resourcesIdx, "currentUser must be declared before loadResources()");
}

async function browserBootWithCache() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error && error.message ? error.message : error)));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem("llhUser", "boot-tdz-user@example.com");
    localStorage.setItem("llhPlan", "Free");
    localStorage.setItem("llhAccounts", JSON.stringify({
      "boot-tdz-user@example.com": {
        email: "boot-tdz-user@example.com",
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
    }));
    localStorage.setItem("llhCurriculumLibraryCacheV1", JSON.stringify({
      lessonPlans: [{
        id: "plan-boot-tdz",
        title: "Boot TDZ Plan",
        age: "Toddler",
        theme: "Science",
        plan: "Pro",
        status: "published",
        locked: true,
      }],
      activities: [{
        id: "act-boot-tdz",
        lessonPlanId: "plan-boot-tdz",
        title: "Boot TDZ Activity",
        activityCategory: "STEM",
        dayOfWeek: "monday",
        plan: "Pro",
        locked: true,
        parentTitle: "Boot TDZ Plan",
        parentAge: "Toddler",
        parentPlan: "Pro",
      }],
      resources: [],
      updatedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    }));
  });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => ({
    user: localStorage.getItem("llhUser"),
    authenticated: document.body.classList.contains("user-authenticated"),
    activeView: document.querySelector(".active-view")?.id || "",
    hasLoginButton: Boolean(document.querySelector("#loginBtn, [data-action='login'], .auth-login")),
    bodyText: (document.body?.innerText || "").slice(0, 240),
  }));

  await browser.close();
  return { pageErrors, state };
}

async function main() {
  assertSourceOrder();
  const child = startServer();
  try {
    await waitForBoot(child);
    const { pageErrors, state } = await browserBootWithCache();
    const tdz = pageErrors.filter((message) => /currentUser|before initialization/i.test(message));
    assert.equal(tdz.length, 0, `TDZ page errors: ${tdz.join(" | ")}`);
    assert.equal(state.user, "boot-tdz-user@example.com");
    assert.ok(
      state.authenticated || /calendar|planning|lesson|account/i.test(`${state.activeView} ${state.bodyText}`),
      `app did not boot a usable logged-in shell: ${JSON.stringify(state)}`,
    );
    console.log("boot-currentuser-tdz: PASS");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("boot-currentuser-tdz: FAIL");
  console.error(error);
  process.exit(1);
});
