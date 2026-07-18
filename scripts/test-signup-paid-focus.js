#!/usr/bin/env node
/**
 * Signup plan step: paid-first conversion UX + Free confirmation.
 * Run: node scripts/test-signup-paid-focus.js
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
const PORT = 19940 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-signup-paid-${crypto.randomBytes(4).toString("hex")}.json`);

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
  throw new Error("boot timeout");
}

async function reachPlanStep(page, email) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => openAuthModal("signup"));
  await page.waitForSelector("#authModal.open");
  await page.fill("#fullNameInput", "Conversion Tester");
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", "TestPass123!");
  await page.click("#authSubmitButton");
  await page.waitForFunction(() => !document.querySelector("#signupStepProgram")?.classList.contains("hidden-field"), { timeout: 60000 });
  await page.click('[data-signup-persona="home_daycare"]');
  await page.click('[data-signup-pathway="independent"]');
  await page.fill("#signupProgramNameInput", "Sunny Home Daycare");
  await page.click("#authSubmitButton");
  await page.waitForFunction(() => !document.querySelector("#signupStepPlan")?.classList.contains("hidden-field"), { timeout: 20000 });
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /function showSignupFreeConfirm/);
  assert.match(appJs, /signup-plan-grid--paid-first/);
  console.log("PASS static markers");

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);

    for (const viewport of [
      { width: 1280, height: 800, label: "desktop" },
      { width: 390, height: 720, label: "mobile" },
    ]) {
      const page = await browser.newPage({ viewport });
      const email = `paid-focus-${viewport.label}-${Date.now()}@example.com`;
      await reachPlanStep(page, email);

      const layout = await page.evaluate(() => {
        const main = document.querySelector("#signupPlanChooserMain");
        const founding = document.querySelector(".signup-plan-card--founding");
        const pro = document.querySelector(".signup-plan-card--pro");
        const free = document.querySelector(".signup-plan-card--preview");
        const trust = document.querySelector(".signup-plan-trust");
        const text = main?.innerText || "";
        const foundingTop = founding?.getBoundingClientRect().top ?? 9999;
        const freeTop = free?.getBoundingClientRect().top ?? -1;
        return {
          hasFounding: Boolean(founding),
          hasPro: Boolean(pro),
          hasFreePreview: Boolean(free),
          hasTrust: Boolean(trust),
          paidBeforeFree: foundingTop < freeTop,
          textSnippet: text.slice(0, 500),
          variant: main?.dataset.signupVariant || "",
        };
      });
      assert.equal(layout.hasFounding, true, `${viewport.label}: founding card`);
      assert.equal(layout.hasPro, true, `${viewport.label}: pro card shown with founding`);
      assert.equal(layout.hasFreePreview, true, `${viewport.label}: free preview`);
      assert.equal(layout.hasTrust, true, `${viewport.label}: trust points`);
      assert.equal(layout.paidBeforeFree, true, `${viewport.label}: paid cards above Free`);
      assert.match(layout.textSnippet, /Stop spending hours planning each week|Unlock the complete/i);
      console.log(`PASS ${viewport.label} paid-first layout`);

      // Free confirmation path
      await page.click('[data-signup-choose-plan="free"]');
      await page.waitForSelector("#signupFreeConfirm:not([hidden])", { timeout: 5000 });
      const confirmVisible = await page.evaluate(() => {
        const confirm = document.querySelector("#signupFreeConfirm");
        const main = document.querySelector("#signupPlanChooserMain");
        return {
          confirmHidden: confirm?.hidden,
          mainHidden: main?.hidden,
          hasContinue: Boolean(document.querySelector("[data-signup-confirm-free]")),
          hasUpgrade: Boolean(document.querySelector("[data-signup-upgrade-instead]")),
          text: confirm?.innerText || "",
        };
      });
      assert.equal(confirmVisible.confirmHidden, false);
      assert.equal(confirmVisible.mainHidden, true);
      assert.equal(confirmVisible.hasContinue, true);
      assert.equal(confirmVisible.hasUpgrade, true);
      assert.match(confirmVisible.text, /You’re choosing the Free Plan|Continue with Free|Upgrade Instead/i);
      console.log(`PASS ${viewport.label} free confirmation`);

      // Upgrade Instead returns to the paid-first chooser (easy to reconsider, not forced checkout).
      await page.click("[data-signup-upgrade-instead]");
      await page.waitForFunction(() => {
        const confirm = document.querySelector("#signupFreeConfirm");
        const main = document.querySelector("#signupPlanChooserMain");
        return Boolean(confirm?.hidden) && main && !main.hidden;
      }, { timeout: 5000 });
      const afterUpgrade = await page.evaluate(() => ({
        modalOpen: document.querySelector("#authModal")?.classList.contains("open"),
        confirmHidden: document.querySelector("#signupFreeConfirm")?.hidden,
        mainVisible: !document.querySelector("#signupPlanChooserMain")?.hidden,
        hasFoundingCta: Boolean(document.querySelector('[data-signup-choose-plan="founding"]')),
      }));
      assert.equal(afterUpgrade.modalOpen, true);
      assert.equal(afterUpgrade.confirmHidden, true);
      assert.equal(afterUpgrade.mainVisible, true);
      assert.equal(afterUpgrade.hasFoundingCta, true);
      console.log(`PASS ${viewport.label} upgrade instead returns to chooser`);

      await page.close();
    }

    // Full Free path still completes signup.
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const freeEmail = `free-confirm-complete-${Date.now()}@example.com`;
    await reachPlanStep(page, freeEmail);
    await page.click('[data-signup-choose-plan="free"]');
    await page.click("[data-signup-confirm-free]");
    await page.waitForTimeout(1200);
    let user = null;
    for (let i = 0; i < 12; i += 1) {
      const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
      user = store.users?.[freeEmail];
      if (user) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(user, "free confirm continue should create user");
    console.log("PASS free confirm continue creates account");

    console.log("\nAll signup paid-focus tests passed.");
  } catch (error) {
    console.error(error);
    if (bootLog) console.error(bootLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
  }
}

main();
