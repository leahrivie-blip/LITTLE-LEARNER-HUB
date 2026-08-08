#!/usr/bin/env node
/**
 * When Firebase Auth is off (testing), local signup must persist a server password
 * so logout/login works. Run: HOME_DAYCARE_HUB_TESTING=1 NODE_ENV=test node scripts/test-local-signup-password-sync.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 4520 + Math.floor(Math.random() * 80);
const STORE = path.join(os.tmpdir(), `llh-local-signup-${process.pid}.json`);
const EMAIL = `provider.home.${Date.now().toString(36)}@llhmail.app`;
const PASSWORD = "LocalSignup!23456";

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), Accept: "application/json" }
          : { Accept: "application/json" },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          let json = {};
          try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode != null) throw new Error("server exited");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /syncPasswordAfterFirebaseAuth\(password, "local_signup"/);
  console.log("PASS  local_signup password sync marker");

  fs.writeFileSync(STORE, JSON.stringify({ users: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "true",
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE,
      DATABASE_PROVIDER: "local-json",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitHealth(child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof openAuthModal === "function" && typeof signUpWithProvider === "function");
    await page.evaluate(async ({ email, password }) => {
      await signUpWithProvider(email, password, "", "Provider", "Home");
    }, { email: EMAIL, password: PASSWORD });

    const login = await request("POST", "/api/auth/password-login", { email: EMAIL, password: PASSWORD });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    assert.equal(login.json.email, EMAIL);
    console.log("PASS  server password-login after local signup");

    // Unauthenticated local sync must stay gated to testing/test env (already on).
    const sync = await request("POST", "/api/auth/sync-password-after-firebase", {
      email: `provider.two.${Date.now().toString(36)}@llhmail.app`,
      newPassword: "AnotherPass!23456",
      source: "local_signup",
    });
    assert.equal(sync.status, 200, JSON.stringify(sync.json));
    console.log("PASS  testing local password sync endpoint");
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
