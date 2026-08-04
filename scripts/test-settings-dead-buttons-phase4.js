#!/usr/bin/env node
/**
 * Phase 4 — Settings hub actions must not be dead buttons.
 * Covers: Add to Home Screen, Messages, Send Feedback, FAQ,
 * Business Information & Logo, Staff Accounts & Roles.
 *
 * Run: npm run test:settings-dead-buttons-phase4
 * Never touches production curriculum.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19850 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-settings-p4-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/site-stabilization/phase4";
const OWNER_EMAIL = "settings-owner@phase4.test";
const TEACHER_EMAIL = "settings-teacher@phase4.test";

function request(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
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
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [OWNER_EMAIL]: {
        email: OWNER_EMAIL,
        firstName: "Settings",
        lastName: "Owner",
        plan: "Pro",
        subscriptionStatus: "active",
        stripeSubscriptionStatus: "active",
        role: "owner",
        accountType: "home_daycare",
        signupAt: "2026-01-01T00:00:00.000Z",
      },
      [TEACHER_EMAIL]: {
        email: TEACHER_EMAIL,
        firstName: "Settings",
        lastName: "Teacher",
        plan: "Pro",
        subscriptionStatus: "active",
        role: "teacher",
        accountType: "center",
        linkedProgramOwnerEmail: OWNER_EMAIL,
        signupAt: "2026-01-01T00:00:00.000Z",
      },
    },
    messages: [],
    notifications: [],
    siteContent: {},
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "admin-settings-p4@test.local",
      ADMIN_PASSWORD: "settings-p4-pass",
      ADMIN_ACCESS_CODE: "settings-p4-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
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

async function seedSession(page, email) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((userEmail) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhPlan", "Pro");
    const accounts = {
      [userEmail]: {
        email: userEmail,
        firstName: "Settings",
        lastName: userEmail.includes("teacher") ? "Teacher" : "Owner",
        plan: "Pro",
        subscriptionStatus: "active",
        role: userEmail.includes("teacher") ? "teacher" : "owner",
        accountType: userEmail.includes("teacher") ? "center" : "home_daycare",
        linkedProgramOwnerEmail: userEmail.includes("teacher") ? "settings-owner@phase4.test" : "",
      },
    };
    localStorage.setItem("llhAccounts", JSON.stringify(accounts));
  }, email);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof window.setView === "function" && typeof window.renderSettingsHubPage === "function", null, { timeout: 30000 });
}

function staticChecks() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(appJs, /action: "install-app"/, "Add to Home Screen card");
  assert.match(appJs, /data-install-app="settings"/, "install action wired");
  assert.match(appJs, /title: "Messages"/, "Messages card");
  assert.match(appJs, /action: "feedback"/, "Send Feedback card");
  assert.match(appJs, /data-open-feedback/, "feedback click wiring");
  assert.match(appJs, /title: "FAQ"/, "FAQ card");
  assert.match(appJs, /title: "Business Information & Logo"/, "Business Information card");
  assert.match(appJs, /title: "Staff Accounts & Roles"/, "Staff card");
  assert.match(appJs, /id: "program"/, "Program Settings group anchor id");
  assert.match(appJs, /navOptions\.settingsAnchor = viewButton\.dataset\.settingsAnchor/, "settings anchors pass into setView");
  assert.match(appJs, /resolvedView === "faq"\) renderManagedFaqContent/, "FAQ content renders on enter");
  assert.match(indexHtml, /data-contextual-back="faq"/, "FAQ uses contextual back");
  assert.match(indexHtml, /id="feedbackModal"/, "feedback modal exists");
  assert.match(indexHtml, /id="installAppModal"/, "install modal exists");
  assert.match(indexHtml, /id="view-program-settings"/, "program settings view exists");
  assert.match(indexHtml, /id="view-staff"/, "staff view exists");
  console.log("PASS static Settings action wiring");
}

async function main() {
  staticChecks();
  const child = startServer();
  const results = [];
  let browser;
  try {
    await waitForBoot(child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedSession(page, OWNER_EMAIL);

    await page.evaluate(() => window.setView("settings", { allowDashboard: true }));
    await page.waitForSelector("#view-settings.active-view .settings-hub-card", { timeout: 15000 });

    const titles = await page.$$eval("#view-settings .settings-hub-card strong, #view-settings .settings-hub-card-disabled strong", (els) =>
      els.map((el) => el.childNodes[0]?.textContent?.trim() || el.textContent.trim()));
    for (const required of [
      "Add to Home Screen",
      "Messages",
      "Send Feedback",
      "FAQ",
      "Business Information & Logo",
      "Staff Accounts & Roles",
    ]) {
      assert.ok(titles.some((t) => t.includes(required)), `missing settings card: ${required} in ${titles.join(" | ")}`);
    }
    results.push("owner_sees_all_six_action_cards");

    // Add to Home Screen → opens install modal (no native prompt in headless)
    await page.click('#view-settings [data-install-app="settings"]');
    await page.waitForSelector("#installAppModal:not([hidden])", { timeout: 10000 }).catch(async () => {
      // Some builds use aria/class open state instead of hidden attribute.
      const open = await page.evaluate(() => {
        const modal = document.querySelector("#installAppModal");
        if (!modal) return false;
        return !modal.hasAttribute("hidden") || modal.classList.contains("open") || getComputedStyle(modal).display !== "none";
      });
      assert.ok(open, "install modal should open from Settings");
    });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "01-install-modal.png"), fullPage: false });
    results.push("add_to_home_screen_opens_modal");
    await page.evaluate(() => {
      const modal = document.querySelector("#installAppModal");
      if (modal) {
        modal.hidden = true;
        modal.classList.remove("open");
      }
      document.body.classList.remove("modal-open");
    });

    // Messages
    await page.evaluate(() => window.setView("settings"));
    await page.click('#view-settings [data-view="messages"]');
    await page.waitForFunction(() => document.querySelector("#view-messages")?.classList.contains("active-view"), null, { timeout: 10000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "02-messages.png"), fullPage: false });
    results.push("messages_navigates");

    // Send Feedback
    await page.evaluate(() => window.setView("settings"));
    await page.click('#view-settings [data-open-feedback]');
    await page.waitForFunction(() => {
      const modal = document.querySelector("#feedbackModal");
      if (!modal) return false;
      return !modal.hasAttribute("hidden") || modal.classList.contains("open") || getComputedStyle(modal).display !== "none";
    }, null, { timeout: 10000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "03-feedback-modal.png"), fullPage: false });
    results.push("send_feedback_opens_modal");
    await page.evaluate(() => {
      const modal = document.querySelector("#feedbackModal");
      if (modal) {
        modal.hidden = true;
        modal.classList.remove("open");
      }
      document.body.classList.remove("modal-open");
    });

    // FAQ + back to Settings
    await page.evaluate(() => window.setView("settings"));
    await page.click('#view-settings [data-view="faq"]');
    await page.waitForFunction(() => document.querySelector("#view-faq")?.classList.contains("active-view"), null, { timeout: 10000 });
    const faqItems = await page.locator("#faqList .faq-item, #faqList article").count();
    assert.ok(faqItems > 0, "FAQ list should render content");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "04-faq.png"), fullPage: false });
    await page.click('#view-faq [data-contextual-back="faq"]');
    await page.waitForFunction(() => document.querySelector("#view-settings")?.classList.contains("active-view"), null, { timeout: 10000 });
    results.push("faq_renders_and_back_to_settings");

    // Business Information & Logo
    await page.click('#view-settings [data-view="program-settings"]');
    await page.waitForFunction(() => document.querySelector("#view-program-settings")?.classList.contains("active-view"), null, { timeout: 10000 });
    assert.ok(await page.locator("#programSettingsForm, #view-program-settings form").count() > 0, "program settings form present");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "05-program-settings.png"), fullPage: false });
    results.push("business_information_navigates");

    // Staff Accounts & Roles
    await page.evaluate(() => window.setView("settings"));
    await page.click('#view-settings [data-view="staff"]');
    await page.waitForFunction(() => document.querySelector("#view-staff")?.classList.contains("active-view"), null, { timeout: 10000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "06-staff.png"), fullPage: false });
    results.push("staff_accounts_navigates");

    // Program settings anchor from work-hub style navigation
    await page.evaluate(() => {
      const btn = document.createElement("button");
      btn.setAttribute("data-view", "settings");
      btn.setAttribute("data-settings-anchor", "program");
      btn.textContent = "Program Settings";
      document.body.appendChild(btn);
      btn.click();
      btn.remove();
    });
    await page.waitForFunction(() => document.querySelector("#view-settings")?.classList.contains("active-view"), null, { timeout: 10000 });
    const programGroupVisible = await page.evaluate(() => Boolean(document.querySelector("#settings-program, [data-settings-group=\"program\"]")));
    assert.ok(programGroupVisible, "program settings group anchor must exist");
    results.push("program_settings_anchor_exists");

    // Teacher must not see Staff Accounts card
    await seedSession(page, TEACHER_EMAIL);
    await page.evaluate(() => window.setView("settings", { allowDashboard: true }));
    await page.waitForSelector("#view-settings.active-view", { timeout: 15000 });
    const teacherTitles = await page.$$eval("#view-settings .settings-hub-card strong, #view-settings .settings-hub-card-disabled strong", (els) =>
      els.map((el) => el.textContent.trim()));
    assert.ok(!teacherTitles.some((t) => /Staff Accounts/i.test(t)), `teacher should not see Staff card: ${teacherTitles.join(" | ")}`);
    results.push("teacher_hides_staff_card");

    const report = {
      suite: "settings-dead-buttons-phase4",
      passed: results.length,
      results,
      curriculumUntouched: true,
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "phase4-report.json"), JSON.stringify(report, null, 2));
    console.log(`PASS ${results.length} Settings dead-button assertions`);
    results.forEach((name) => console.log(`  ✓ ${name}`));
    console.log("\nAll Phase 4 Settings action checks passed.");
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message || error);
  process.exitCode = 1;
});
