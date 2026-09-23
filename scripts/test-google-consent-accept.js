#!/usr/bin/env node
/**
 * Google consent Accept must be clickable when Meta notice would otherwise overlap.
 * Run: node scripts/test-google-consent-accept.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(5400, 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-consent-accept-${crypto.randomBytes(4).toString("hex")}.json`);

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, "{}\n");
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: "consent-accept@test.local",
      ADMIN_PASSWORD: "consent-accept-pass",
      ADMIN_ACCESS_CODE: "consent-accept-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitHealth(child) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.exitCode}`);
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 200));
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitHealth(child);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("llhGoogleConsent");
        localStorage.removeItem("llhMetaCookieNoticeDismissed");
      } catch { /* ignore */ }
    });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("#llhGoogleConsentBanner", { timeout: 15000 });

    // Force a Meta notice into the DOM to reproduce the historical overlap race.
    await page.evaluate(() => {
      if (document.getElementById("llhMetaCookieNotice")) return;
      const notice = document.createElement("aside");
      notice.id = "llhMetaCookieNotice";
      notice.className = "llh-meta-cookie-notice";
      notice.innerHTML = "<p>Meta notice overlap probe</p><button type=\"button\">Got it</button>";
      document.body.appendChild(notice);
      document.body.classList.add("has-meta-cookie-notice");
    });

    const accept = page.locator('#llhGoogleConsentBanner [data-google-consent="accept"]');
    await assert.doesNotReject(
      () => accept.click({ timeout: 10000 }),
      "Google consent Accept must be clickable over Meta notice",
    );

    await page.waitForFunction(() => !document.getElementById("llhGoogleConsentBanner"), null, { timeout: 5000 });
    const granted = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("llhGoogleConsent") || "null")?.granted === true;
      } catch {
        return false;
      }
    });
    assert.equal(granted, true, "Accept must persist Google consent granted=true");
    assert.equal(
      await page.evaluate(() => window.LLHGoogleConsent?.hasConsent?.() === true),
      true,
      "LLHGoogleConsent.hasConsent() must be true after Accept",
    );

    console.log("PASS  Google consent Accept clickable and functional");
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
