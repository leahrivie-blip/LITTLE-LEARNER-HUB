#!/usr/bin/env node
/**
 * Live testing-site tester invite timing repro (read/measure only).
 * Usage: ACCEPT_URL=... TESTER_EMAIL=... node scripts/repro-live-tester-invite-timings.js
 */
"use strict";

const { chromium } = require("playwright");

const ACCEPT_URL = process.env.ACCEPT_URL || "";
const TESTER_EMAIL = process.env.TESTER_EMAIL || process.env.TESTER || "";
const PASSWORD = process.env.TESTER_PASSWORD || "SunshineDaycare9!";

if (!ACCEPT_URL || !TESTER_EMAIL) {
  console.error("ACCEPT_URL and TESTER_EMAIL (or TESTER) required");
  process.exit(1);
}

function now() {
  return Date.now();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  const timings = {};
  const network = [];

  page.on("request", (req) => {
    const url = req.url();
    if (!/little-learner-hub-testing|\/api\//.test(url)) return;
    req._llhStarted = Date.now();
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (!/little-learner-hub-testing|\/api\//.test(url)) return;
    const req = res.request();
    const started = req._llhStarted || Date.now();
    const entry = {
      method: req.method(),
      url: url.replace(/^https:\/\/little-learner-hub-testing\.onrender\.com/, ""),
      status: res.status(),
      ms: Date.now() - started,
    };
    network.push(entry);
    if (/\/api\//.test(entry.url) || /app\.js|llh-shell|index/.test(entry.url)) {
      console.log(`NET ${entry.method} ${entry.status} ${entry.ms}ms ${entry.url.slice(0, 120)}`);
    }
  });

  const t0 = now();
  console.log("Opening", ACCEPT_URL);
  await page.goto(ACCEPT_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  timings.domContentLoaded = now() - t0;

  // Wait for invite panel or auth
  const panelSel = "#hdhTesterInviteAcceptPanel, [data-tester-invite-signup]";
  try {
    await page.waitForSelector(panelSel, { timeout: 90000 });
    timings.invitePanelVisible = now() - t0;
  } catch (error) {
    timings.invitePanelVisible = null;
    timings.invitePanelError = String(error.message || error);
  }

  // Capture body text snippet
  const bodyText = await page.locator("body").innerText().catch(() => "");
  console.log("BODY_SNIPPET:", bodyText.slice(0, 400).replace(/\s+/g, " "));

  const createBtn = page.locator("[data-tester-invite-signup]").first();
  if (await createBtn.count()) {
    await createBtn.click();
    timings.createAccountClicked = now() - t0;
    await page.waitForSelector("#authForm, #emailInput", { timeout: 30000 });
    timings.authModalVisible = now() - t0;
    await page.fill("#emailInput", TESTER_EMAIL);
    // name field may be fullName or firstName
    if (await page.locator("#fullNameInput").count()) {
      await page.fill("#fullNameInput", "Jamie Rivera");
    } else if (await page.locator("#firstNameInput").count()) {
      await page.fill("#firstNameInput", "Jamie");
      if (await page.locator("#lastNameInput").count()) await page.fill("#lastNameInput", "Rivera");
    }
    await page.fill("#passwordInput", PASSWORD);
    const submit = page.locator("#authSubmitButton");
    await submit.click();
    timings.passwordSubmit = now() - t0;

    // Watch messages
    for (let i = 0; i < 90; i += 1) {
      const msg = await page.locator("#authMessage").innerText().catch(() => "");
      const gate = await page.locator("#appBootGateMessage").innerText().catch(() => "");
      const inviteMsg = await page.locator("#hdhTesterInviteAcceptMessage").innerText().catch(() => "");
      const ready = await page.evaluate(() => document.body.classList.contains("app-boot-ready"));
      const hasKids = await page.locator("#view-children.active-view, [data-view='children'].active, .child-page-header").count();
      console.log(`T+${now() - t0}ms msg="${msg}" gate="${gate}" invite="${inviteMsg}" bootReady=${ready} kidsUI=${hasKids}`);
      if (/could not|failed|try again|error/i.test(`${msg} ${gate} ${inviteMsg}`)) {
        timings.errorVisible = now() - t0;
        timings.errorText = `${msg} | ${gate} | ${inviteMsg}`;
        break;
      }
      if (ready && (hasKids || /program is ready|Welcome/i.test(`${msg} ${inviteMsg}`))) {
        timings.usable = now() - t0;
        break;
      }
      // Still signing?
      if (/signing you in|saving your password|opening your testing|creating your account|verifying/i.test(`${msg} ${gate}`)) {
        timings.lastBusyMessage = `${msg || gate}`;
        timings.lastBusyAt = now() - t0;
      }
      await page.waitForTimeout(1000);
    }
  } else {
    console.log("No create-account button — panel state unexpected");
  }

  console.log("\nTIMINGS_MS", JSON.stringify(timings, null, 2));
  const apiCalls = network.filter((n) => n.url.startsWith("/api/"));
  console.log("\nAPI_CALLS", JSON.stringify(apiCalls, null, 2));
  const repeats = {};
  apiCalls.forEach((n) => {
    const key = `${n.method} ${n.url.split("?")[0]}`;
    repeats[key] = (repeats[key] || 0) + 1;
  });
  console.log("\nAPI_REPEAT_COUNTS", JSON.stringify(repeats, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
