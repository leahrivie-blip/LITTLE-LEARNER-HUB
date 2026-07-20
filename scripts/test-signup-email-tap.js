#!/usr/bin/env node
/**
 * Regression: Founding/signup Account step must keep Email tappable on short phones.
 * Bug: sticky Continue + help chrome crushed the wizard body and covered #emailInput.
 * Run: node scripts/test-signup-email-tap.js
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
const PORT = 19920 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-signup-email-tap-${crypto.randomBytes(4).toString("hex")}.json`);

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

async function inspectEmailTapTarget(page) {
  return page.evaluate(() => {
    const input = document.querySelector("#emailInput");
    const help = document.querySelector(".auth-help-links");
    const body = document.querySelector("#signupWizardBody");
    if (!input || !body) return { missing: true };
    const r = input.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return {
      missing: false,
      disabled: input.disabled,
      readOnly: input.readOnly,
      helpHidden: Boolean(help?.hidden || help?.classList.contains("hidden-field")),
      bodyHeight: Math.round(br.height),
      emailInBody: r.top >= br.top - 2 && r.bottom <= br.bottom + 2,
      topIsEmail: top === input,
      topTag: top ? `${top.tagName.toLowerCase()}#${top.id || ""}` : null,
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
    };
  });
}

async function openFoundingSignup(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('.llh-announce-banner [data-checkout-plan="founding"], #homePricing [data-checkout-plan="founding"], [data-checkout-plan="founding"]:not(#freePlanReminderPrimary)').first().click({ force: true });
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await page.waitForFunction(() => {
    const step = document.querySelector("#signupStepAccount");
    return step && !step.classList.contains("hidden-field");
  }, { timeout: 10000 });
}

async function assertEmailTappable(page, label) {
  const info = await inspectEmailTapTarget(page);
  assert.equal(info.missing, false, `${label}: email field missing`);
  assert.equal(info.disabled, false, `${label}: email disabled`);
  assert.equal(info.readOnly, false, `${label}: email readonly`);
  assert.equal(info.helpHidden, true, `${label}: help links must stay hidden during signup`);
  assert.ok(info.bodyHeight >= 200, `${label}: wizard body too short (${info.bodyHeight}px)`);
  assert.equal(info.topIsEmail, true, `${label}: email covered by ${info.topTag}`);

  const probeEmail = `tap-ok-${Date.now()}@example.com`;
  await page.click("#emailInput", { timeout: 3000 });
  await page.keyboard.type(probeEmail, { delay: 10 });
  const value = await page.inputValue("#emailInput");
  assert.equal(value, probeEmail, `${label}: typed email did not stick`);
  return info;
}

async function main() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(appJs, /help\.hidden = inWizard/);
  assert.match(css, /#authModal \.signup-wizard-body/);
  assert.match(css, /min-height:\s*min\(320px,\s*42dvh\)/);
  assert.match(indexHtml, /styles\.css\?v=20260720-messaging-merge/);
  assert.match(indexHtml, /app\.js\?v=20260720-messaging-merge/);

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const page = await browser.newPage();

    await openFoundingSignup(page, { width: 390, height: 640 });
    const short = await assertEmailTappable(page, "short-mobile");
    console.log("PASS short-mobile", short);

    await openFoundingSignup(page, { width: 390, height: 560 });
    const shorter = await assertEmailTappable(page, "shorter-mobile");
    console.log("PASS shorter-mobile", shorter);

    await openFoundingSignup(page, { width: 1280, height: 800 });
    const desktop = await assertEmailTappable(page, "desktop");
    console.log("PASS desktop", desktop);

    // Finish step 1 with the hotmail-style address from support, then reach plan chooser.
    await page.fill("#fullNameInput", "Awesome Mumma");
    await page.fill("#emailInput", "awesomemumma82-probe@example.com");
    await page.fill("#passwordInput", "TestPass123!");
    await page.click("#authSubmitButton");
    await page.waitForFunction(() => {
      const program = document.querySelector("#signupStepProgram");
      return program && !program.classList.contains("hidden-field");
    }, { timeout: 60000 });
    await page.click('[data-signup-persona="home_daycare"]');
    await page.click('[data-signup-pathway="independent"]');
    await page.fill("#signupProgramNameInput", "Home Daycare");
    await page.click("#authSubmitButton");
    await page.waitForFunction(() => {
      const plan = document.querySelector("#signupStepPlan");
      return plan && !plan.classList.contains("hidden-field");
    }, { timeout: 20000 });
    const planText = await page.locator("#signupPlanChooser").innerText();
    assert.match(planText, /Claim My Founding Spot|Founding Member/);
    console.log("PASS founding plan chooser reachable after account email entry");
    console.log("\nAll signup email tap tests passed.");
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
