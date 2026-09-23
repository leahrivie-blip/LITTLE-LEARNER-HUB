#!/usr/bin/env node
/**
 * Client regressions for subscription-status Authorization headers and
 * openAuthModal body.auth-modal-open ordering.
 * Run: NODE_ENV=test node scripts/test-subscription-status-client-auth.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(5300, 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-sub-client-auth-${crypto.randomBytes(4).toString("hex")}.json`);
const PAID = "paid.user@client-auth.test";
const FREE = "free.user@client-auth.test";

function request(method, urlPath, { headers = {}, body = null } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
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
    siteContent: {},
    adminSessions: {},
    accounts: {
      [PAID]: {
        email: PAID,
        plan: "Pro",
        subscriptionStatus: "Active",
        name: "Paid User",
        hasProAccess: true,
      },
    },
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE_PATH,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      ADMIN_EMAIL: "client-auth-admin@test.local",
      ADMIN_PASSWORD: "client-auth-admin-pass",
      ADMIN_ACCESS_CODE: "client-auth-admin-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for health");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 250));
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const { chromium } = require("playwright");
  const child = startServer();
  let browser;
  try {
    await waitHealth(child);
    browser = await chromium.launch();
    const page = await browser.newPage();
    const captured = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/subscription-status")) {
        captured.push({
          auth: req.headers().authorization || "",
          emailHdr: req.headers()["x-llh-user-email"] || "",
        });
      }
    });

    // Free local account: headers helper must attach Bearer test: (not email alone).
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((email) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Free");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" },
      }));
    }, FREE);
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.body.classList.contains("app-boot-ready")
        && (!document.querySelector("#appBootGate") || document.querySelector("#appBootGate").hidden),
      null,
      { timeout: 45000 },
    );
    const freeHeaders = await page.evaluate(async () => {
      if (typeof subscriptionStatusAuthHeaders !== "function") {
        throw new Error("subscriptionStatusAuthHeaders missing");
      }
      return subscriptionStatusAuthHeaders();
    });
    assert.ok(freeHeaders.Authorization, "free user must send Authorization");
    assert.match(String(freeHeaders.Authorization), new RegExp(`^Bearer test:${FREE}$`, "i"));
    assert.equal(String(freeHeaders["x-llh-user-email"] || "").toLowerCase(), FREE);
    assert.ok(
      captured.some((row) => /^Bearer test:/i.test(row.auth)),
      "boot membership sync must send Bearer Authorization, not email-only",
    );

    // Paid local account must boot and receive 200 subscription-status (not unauthorized).
    captured.length = 0;
    await page.evaluate((email) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          subscriptionStatus: "Active",
          subscriptionStartedAt: new Date().toISOString(),
        },
      }));
    }, PAID);
    const paidStatus = page.waitForResponse(
      (res) => res.url().includes("/api/subscription-status") && res.request().method() === "GET",
      { timeout: 45000 },
    );
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.body.classList.contains("app-boot-ready")
        && (!document.querySelector("#appBootGate") || document.querySelector("#appBootGate").hidden),
      null,
      { timeout: 45000 },
    );
    const paidRes = await paidStatus;
    assert.equal(paidRes.status(), 200, "paid user subscription-status must not be unauthorized");
    const paidJson = await paidRes.json();
    assert.equal(String(paidJson.email || "").toLowerCase(), PAID);
    assert.ok(
      captured.every((row) => Boolean(row.auth)),
      "paid user must never call subscription-status with only x-llh-user-email",
    );

    // openAuthModal must keep body.auth-modal-open after onboarding close ordering.
    await page.evaluate(() => {
      localStorage.removeItem("llhUser");
      localStorage.removeItem("llhPlan");
      localStorage.setItem("llhAccounts", "{}");
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 30000 });
    const modalState = await page.evaluate(() => {
      if (typeof setView === "function") setView("calendar");
      return {
        authOpen: document.body.classList.contains("auth-modal-open"),
        modalOpen: document.querySelector("#authModal")?.classList.contains("open") === true,
      };
    });
    assert.equal(modalState.modalOpen, true, "protected view must open #authModal");
    assert.equal(modalState.authOpen, true, "body.auth-modal-open must survive NewUserOnboarding.closeModal");

    console.log("PASS  subscription-status client auth + auth-modal ordering");
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
