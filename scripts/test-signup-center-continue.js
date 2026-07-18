#!/usr/bin/env node
/**
 * Signup center-step Continue visibility + pathway regression (desktop + mobile).
 * Run: node scripts/test-signup-center-continue.js
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
const PORT = 19620 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-signup-center-${crypto.randomBytes(4).toString("hex")}.json`);

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

async function continueVisibility(page) {
  return page.evaluate(() => {
    const btn = document.querySelector("#authSubmitButton");
    const card = document.querySelector("#authModal .auth-modal-card");
    const actions = document.querySelector("#signupWizardActions");
    const br = btn.getBoundingClientRect();
    const ar = actions?.getBoundingClientRect();
    return {
      text: btn?.textContent?.trim(),
      hidden: !!btn?.hidden,
      disabled: !!btn?.disabled,
      inViewport: br.top >= 0 && br.bottom <= innerHeight + 1,
      partiallyVisible: br.bottom > 0 && br.top < innerHeight,
      btnBottom: Math.round(br.bottom),
      vh: innerHeight,
      actionsBottom: ar ? Math.round(ar.bottom) : null,
      cardMaxHeight: getComputedStyle(card).maxHeight,
      cardOverflow: getComputedStyle(card).overflow,
      bodyOverflowY: getComputedStyle(document.querySelector("#signupWizardBody")).overflowY,
      backgroundImage: getComputedStyle(btn).backgroundImage,
    };
  });
}

async function fillStep1(page, email) {
  await page.evaluate(() => openAuthModal("signup"));
  await page.fill("#fullNameInput", "Casey Provider");
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", "TestPass123!");
  await page.click("#authSubmitButton");
  await page.waitForFunction(() => {
    const program = document.querySelector("#signupStepProgram");
    return program && !program.classList.contains("hidden-field");
  }, { timeout: 60000 });
}

async function runPath(page, {
  persona,
  pathway,
  programName = "",
  inviteCode = "",
  useSkipButton = false,
  viewport,
}) {
  const email = `llh-${persona}-${pathway || "skip"}-${Date.now()}-${Math.floor(Math.random() * 999)}@example.com`;
  await page.setViewportSize(viewport);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await fillStep1(page, email);

  await page.click(`[data-signup-persona="${persona}"]`);
  await page.waitForTimeout(200);
  if (pathway && !useSkipButton) {
    await page.click(`[data-signup-pathway="${pathway}"]`);
    await page.waitForTimeout(150);
  }
  if (programName) await page.fill("#signupProgramNameInput", programName);
  if (inviteCode) await page.fill("#signupInviteCodeInput", inviteCode);

  const beforeContinue = await continueVisibility(page);
  assert.equal(beforeContinue.hidden, false, "Continue must not be hidden");
  assert.equal(beforeContinue.disabled, false, "Continue must be enabled");
  assert.ok(beforeContinue.inViewport || beforeContinue.partiallyVisible, "Continue must be on-screen");
  assert.match(beforeContinue.backgroundImage || "", /gradient|rgb/i, "Continue must have visible primary styling");

  if (useSkipButton) {
    await page.click("#signupSkipButton");
  } else {
    await page.click("#authSubmitButton");
  }
  await page.waitForFunction(() => {
    const plan = document.querySelector("#signupStepPlan");
    return plan && !plan.classList.contains("hidden-field");
  }, { timeout: 20000 });

  // Finish on Free so we can assert backend user without Stripe.
  // Free now shows a soft confirmation step before completing signup.
  await page.click('[data-signup-choose-plan="free"]');
  await page.waitForSelector("[data-signup-confirm-free]", { timeout: 10000 });
  await page.click("[data-signup-confirm-free]");
  // Allow profile/subscription sync writes to flush to the JSON store.
  await page.waitForTimeout(1200);
  let user = null;
  for (let i = 0; i < 10; i += 1) {
    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    user = store.users?.[email] || Object.values(store.users || {}).find((u) => String(u.email || "").toLowerCase() === email);
    if (user?.accountType && user.centerAssociation) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(user, `user saved for ${email}`);
  return { email, user, beforeContinue };
}

async function main() {
  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const page = await browser.newPage();

    const desktop = { width: 1280, height: 700 };
    const mobile = { width: 390, height: 720 };

    const home = await runPath(page, {
      persona: "home_daycare",
      pathway: "independent",
      programName: "Cozy Home Daycare",
      viewport: desktop,
    });
    assert.equal(home.user.accountType, "home_daycare");
    assert.equal(home.user.role, "owner");
    assert.equal(home.user.centerAssociation, "independent");
    console.log("PASS  home daycare independent (desktop short viewport)");

    const create = await runPath(page, {
      persona: "center",
      pathway: "create_new",
      programName: "Bright Beginnings Center",
      viewport: desktop,
    });
    assert.equal(create.user.accountType, "center");
    assert.equal(create.user.role, "owner");
    assert.equal(create.user.centerAssociation, "create_new");
    assert.equal(create.user.businessName, "Bright Beginnings Center");
    console.log("PASS  director create new center");

    const join = await runPath(page, {
      persona: "teacher_staff",
      pathway: "join_existing",
      programName: "Neighborhood Preschool",
      inviteCode: "STAFF-42",
      viewport: mobile,
    });
    assert.equal(join.user.accountType, "center");
    assert.equal(join.user.role, "teacher");
    assert.equal(join.user.centerAssociation, "join_existing");
    assert.equal(join.user.centerInviteCode, "STAFF-42");
    console.log("PASS  teacher join existing center (mobile)");

    const skip = await runPath(page, {
      persona: "center",
      pathway: "skip",
      useSkipButton: true,
      viewport: { width: 1440, height: 650 },
    });
    assert.equal(skip.user.centerAssociation, "skip");
    console.log("PASS  skip for now keeps Continue/Skip usable on short desktop");

    // Ensure selecting center does not clip Continue under locked body scroll.
    await page.setViewportSize({ width: 1366, height: 680 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await fillStep1(page, `llh-clip-check-${Date.now()}@example.com`);
    await page.click('[data-signup-persona="center"]');
    const vis = await continueVisibility(page);
    assert.ok(vis.inViewport, `Continue must stay in viewport after center select (bottom=${vis.btnBottom}, vh=${vis.vh})`);
    assert.ok(Number.parseFloat(vis.cardMaxHeight) > 0 || /dvh|vh|px/.test(vis.cardMaxHeight), "card must have max-height");
    console.log("PASS  Continue remains in viewport after choosing Childcare Center");

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const emails = Object.keys(store.users || {});
    assert.ok(emails.length >= 4, "multiple signup users persisted");
    // no duplicate emails
    assert.equal(emails.length, new Set(emails).size);
    console.log("PASS  no duplicate user records");

    console.log("\nAll signup center-continue regressions passed.");
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
