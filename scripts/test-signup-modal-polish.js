#!/usr/bin/env node
/**
 * Signup modal polish — no horizontal scrollbar, reliable X close, Continue advances.
 * Run: node scripts/test-signup-modal-polish.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19740 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-signup-polish-${crypto.randomBytes(4).toString("hex")}.json`);

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitBoot(child) {
  for (let i = 0; i < 160; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("boot timeout");
}

function staticChecks() {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(css, /#authModal \.signup-wizard-body[\s\S]*overflow-x:\s*hidden/);
  assert.match(css, /#authModal \.close-button[\s\S]*z-index:\s*8/);
  assert.match(css, /#authModal \.panel-form input\[type="checkbox"\][\s\S]*width:\s*auto/);
  assert.match(app, /sendEmailVerification[\s\S]{0,120}\.catch/);
  assert.match(app, /Validate signup Step 1 before disabling/);
  assert.match(app, /event\.target === event\.currentTarget\) closeAuthModal/);
  console.log("PASS static signup polish markers");
}

async function main() {
  staticChecks();
  fs.writeFileSync(STORE, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    await waitBoot(child);
    for (const viewport of [
      { width: 1366, height: 900, label: "desktop" },
      { width: 834, height: 1112, label: "tablet" },
      { width: 390, height: 844, label: "phone" },
    ]) {
      const context = await browser.newContext({ viewport, serviceWorkers: "block" });
      const page = await context.newPage();
      await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => typeof openAuthModal === "function", null, { timeout: 60000 });
      await page.evaluate(() => openAuthModal("signup"));
      await page.waitForSelector("#authModal.open");
      await page.waitForTimeout(200);

      const overflow = await page.evaluate(() => {
        const body = document.querySelector("#signupWizardBody");
        const card = document.querySelector("#authModal .auth-modal-card");
        return {
          bodyOverflowX: body ? body.scrollWidth > body.clientWidth + 1 : true,
          cardOverflowX: card ? card.scrollWidth > card.clientWidth + 1 : true,
        };
      });
      assert.equal(overflow.bodyOverflowX, false, `${viewport.label}: wizard body horizontal overflow`);
      assert.equal(overflow.cardOverflowX, false, `${viewport.label}: card horizontal overflow`);

      // Close via elementFromPoint on the X center — proves hit-testing works.
      const closeHit = await page.evaluate(() => {
        const btn = document.querySelector("#closeModal");
        const r = btn.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          hitClose: el === btn || btn.contains(el),
          z: getComputedStyle(btn).zIndex,
        };
      });
      assert.equal(closeHit.hitClose, true, `${viewport.label}: X not topmost at its center`);
      await page.click("#closeModal");
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.querySelector("#authModal")?.classList.contains("open")), false);

      // Re-open and advance Step 1 → 2 with local auth (no Firebase).
      await page.evaluate(() => openAuthModal("signup"));
      await page.waitForSelector("#authModal.open");
      const email = `signup-polish-${viewport.label}-${Date.now()}@example.com`;
      const nameSel = await page.locator("#fullNameInput").count() ? "#fullNameInput" : "#firstNameInput";
      await page.fill(nameSel, "Polish Tester");
      await page.fill("#emailInput", email);
      await page.fill("#passwordInput", "password123");
      await page.click("#authSubmitButton");
      await page.waitForFunction(() => typeof signupWizardStep !== "undefined" && signupWizardStep === 2, null, { timeout: 15000 });
      const step2 = await page.evaluate(() => ({
        step: signupWizardStep,
        programVisible: !document.querySelector("#signupStepProgram")?.classList.contains("hidden-field"),
      }));
      assert.equal(step2.step, 2, `${viewport.label}: did not advance to Program`);
      assert.equal(step2.programVisible, true, `${viewport.label}: Program panel hidden`);
      console.log(`PASS ${viewport.label} signup modal polish`);
      await context.close();
    }
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
  console.log("All signup modal polish checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
