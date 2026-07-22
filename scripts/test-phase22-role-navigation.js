#!/usr/bin/env node
/**
 * Phase 22 — role-based layout, navigation, dashboards, and Settings redesign.
 *
 * Covers: resolveExperienceRole() across roles, role-aware nav grouping
 * (Core vs. More Tools) without weakening the underlying capability gate,
 * the new Today dashboard, and the Settings Hub redesign (groups + search).
 *
 * Run: node scripts/test-phase22-role-navigation.js
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
const PORT = 21200 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-phase22-nav-${crypto.randomBytes(4).toString("hex")}.json`);

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function startServer(users) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function assertStaticMarkers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(appJs, /const EXPERIENCE_ROLES = Object\.freeze/);
  assert.match(appJs, /function resolveExperienceRole/);
  assert.match(appJs, /function syncRoleAwareNavGrouping/);
  assert.match(appJs, /function renderTodayDashboard/);
  assert.match(appJs, /function quickActionsForExperienceRole/);
  assert.match(appJs, /function bindSettingsHubSearch/);
  assert.match(html, /data-view="today"/);
  assert.match(html, /id="view-today" class="view"/);
  assert.match(html, /data-nav-section="more"/);
  pass("static markers present for role resolver, nav grouping, Today dashboard, Settings search");
}

async function openAs(browser, port, account, viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));
  await page.addInitScript((acct) => {
    localStorage.setItem("llhUser", acct.email);
    localStorage.setItem("llhPlan", acct.plan || "Free");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [acct.email]: {
        ...acct,
        subscriptionStatus: acct.plan && acct.plan !== "Free" ? "active" : "Free Plan",
        stripeSubscriptionStatus: acct.plan && acct.plan !== "Free" ? "active" : "",
      },
    }));
  }, account);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  page._pageErrors = pageErrors;
  return page;
}

async function main() {
  assertStaticMarkers();

  const users = {
    "solo@example.com": { email: "solo@example.com", plan: "Free", accountType: "home_daycare", role: "owner" },
    "director@example.com": { email: "director@example.com", plan: "Pro", subscriptionStatus: "active", stripeSubscriptionStatus: "active", accountType: "center", role: "director" },
    "teacher@example.com": { email: "teacher@example.com", plan: "Free", accountType: "center", role: "teacher" },
    "assistant@example.com": { email: "assistant@example.com", plan: "Free", accountType: "center", role: "assistant" },
  };

  const child = startServer(users);
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);

    // Solo provider: universal core items stay primary; center-only tools tucked away.
    {
      const page = await openAs(browser, PORT, users["solo@example.com"]);
      const nav = await page.evaluate(() => ({
        role: resolveExperienceRole(),
        core: Array.from(document.querySelectorAll(".nav-section-core .nav-link")).filter((l) => !l.hidden).map((l) => l.dataset.view),
      }));
      assert.equal(nav.role, "solo_provider");
      ["today", "calendar", "lessons", "activities", "child-tools-daily-logs", "children", "settings"].forEach((view) => {
        assert.ok(nav.core.includes(view), `solo provider primary nav missing ${view}`);
      });
      assert.ok(!nav.core.includes("classrooms"), "solo provider should not see center-only Classrooms as primary (capability-denied anyway)");
      assert.equal(page._pageErrors.length, 0);
      await page.close();
      pass("solo provider: universal daily tools stay primary, center tools absent");
    }

    // Director: admin/ops destinations become primary; still capability-gated, never security-bypassed.
    {
      const page = await openAs(browser, PORT, users["director@example.com"]);
      const nav = await page.evaluate(() => ({
        role: resolveExperienceRole(),
        core: Array.from(document.querySelectorAll(".nav-section-core .nav-link")).filter((l) => !l.hidden).map((l) => l.dataset.view),
        more: Array.from(document.querySelectorAll('[data-nav-section="more"] .nav-link')).filter((l) => !l.hidden).map((l) => l.dataset.view),
      }));
      assert.equal(nav.role, "director");
      ["today", "classrooms", "staff", "families", "enrollment", "forms", "settings"].forEach((view) => {
        assert.ok(nav.core.includes(view), `director primary nav missing ${view}`);
      });
      assert.ok(!nav.core.includes("billing") && !nav.more.includes("billing"), "director (not owner) should never see Billing — matches roleAllowsCapability");
      assert.equal(page._pageErrors.length, 0);
      await page.close();
      pass("director: center-ops tools primary; billing still hidden (owner-only capability, unaffected by nav curation)");
    }

    // Teacher / Assistant: no director-only clutter, even in More Tools.
    for (const [key, expectedRole] of [["teacher@example.com", "lead_teacher"], ["assistant@example.com", "assistant"]]) {
      const page = await openAs(browser, PORT, users[key]);
      const nav = await page.evaluate(() => ({
        role: resolveExperienceRole(),
        allVisible: Array.from(document.querySelectorAll("#platformNav .nav-link")).filter((l) => !l.hidden).map((l) => l.dataset.view),
      }));
      assert.equal(nav.role, expectedRole);
      ["staff", "billing", "classrooms", "families", "enrollment"].forEach((view) => {
        assert.ok(!nav.allVisible.includes(view), `${expectedRole} must not see director-only "${view}" anywhere in the sidebar`);
      });
      assert.ok(nav.allVisible.includes("today"));
      assert.ok(nav.allVisible.includes("child-tools-daily-logs"));
      assert.equal(page._pageErrors.length, 0);
      await page.close();
      pass(`${expectedRole}: director-only tools removed from entire sidebar (not just reordered)`);
    }

    // Today dashboard renders for every role without crashing, with all 5 cards.
    for (const email of Object.keys(users)) {
      const page = await openAs(browser, PORT, users[email]);
      await page.evaluate(() => setView("today"));
      await page.waitForTimeout(800);
      const today = await page.evaluate(() => ({
        active: document.querySelector(".active-view")?.id,
        cardCount: document.querySelectorAll("#todayDashboardApp .today-dashboard-card").length,
        hasNeedsAttention: Boolean(document.querySelector('[data-today-card="needs-attention"]')),
        hasQuickActions: Boolean(document.querySelector('[data-today-card="quick-actions"]')),
      }));
      assert.equal(today.active, "view-today");
      assert.equal(today.cardCount, 5, "Today dashboard should render Needs Attention / Today / Recent / Favorites / Quick Actions");
      assert.ok(today.hasNeedsAttention);
      assert.ok(today.hasQuickActions);
      assert.equal(page._pageErrors.length, 0, `no page errors rendering Today for ${email}`);
      await page.close();
    }
    pass("Today dashboard renders 5 cards with zero page errors for every role");

    // Today dashboard survives repeat navigation without looping (regression for the
    // render -> ensureScheduleLoaded -> render bug found and fixed during Phase 22).
    {
      const page = await openAs(browser, PORT, users["solo@example.com"]);
      for (let i = 0; i < 4; i += 1) {
        await page.evaluate(() => setView("calendar"));
        await page.waitForTimeout(150);
        await page.evaluate(() => setView("today"));
        await page.waitForTimeout(400);
      }
      const stillAlive = await page.evaluate(() => document.title).catch(() => null);
      assert.ok(stillAlive, "browser tab must survive repeated Today navigation");
      assert.equal(page._pageErrors.length, 0);
      await page.close();
      pass("repeated Today navigation does not crash or loop");
    }

    // Settings: grouped + searchable, Cancel Subscription discoverable via search.
    {
      const page = await openAs(browser, PORT, { email: "owner-billing@example.com", plan: "Pro", subscriptionStatus: "active", stripeSubscriptionStatus: "active", accountType: "home_daycare", role: "owner" });
      await page.evaluate(() => setView("settings"));
      await page.waitForTimeout(600);
      const groups = await page.evaluate(() => Array.from(document.querySelectorAll(".settings-hub-group h3")).map((h) => h.textContent));
      [
        "My Account", "Billing and Subscription", "Program", "Staff and Permissions",
        "Children and Families", "Planning Preferences", "Forms and Records",
        "Communication and Notifications", "Privacy and Security", "Integrations",
      ].forEach((title) => assert.ok(groups.includes(title), `Settings missing group "${title}"`));
      await page.evaluate(() => {
        const input = document.querySelector("#settingsHubSearchInput");
        input.value = "cancel";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.waitForTimeout(200);
      const visible = await page.evaluate(() => Array.from(document.querySelectorAll(".settings-hub-card:not([hidden])")).map((c) => c.querySelector("strong")?.textContent));
      assert.ok(visible.some((t) => (t || "").includes("Cancel Subscription")), "searching 'cancel' should surface Cancel Subscription");
      assert.equal(page._pageErrors.length, 0);
      await page.close();
      pass("Settings Hub shows Phase 22 groups; search surfaces Cancel Subscription");
    }

    // Phone viewport smoke: Today + nav + Settings render without horizontal-scroll-causing errors.
    {
      const page = await openAs(browser, PORT, users["solo@example.com"], { width: 390, height: 844 });
      await page.evaluate(() => setView("today"));
      await page.waitForTimeout(500);
      const todayPhone = await page.evaluate(() => document.querySelectorAll("#todayDashboardApp .today-dashboard-card").length);
      assert.equal(todayPhone, 5);
      await page.evaluate(() => setView("settings"));
      await page.waitForTimeout(500);
      const settingsPhoneGroups = await page.evaluate(() => document.querySelectorAll(".settings-hub-group").length);
      assert.ok(settingsPhoneGroups > 0);
      assert.equal(page._pageErrors.length, 0);
      await page.close();
      pass("phone viewport: Today and Settings render without errors");
    }

    // Director-only manage pages carry a "computer recommended" note (device rules).
    {
      const page = await openAs(browser, PORT, users["director@example.com"]);
      await page.evaluate(() => setView("classrooms"));
      await page.waitForTimeout(500);
      const hasNote = await page.evaluate(() => Boolean(document.querySelector(".platform-computer-recommended-note")));
      assert.ok(hasNote, "Classrooms (bulk management) should show a computer-recommended note");
      assert.equal(page._pageErrors.length, 0);
      await page.close();
      pass("device rules: bulk-management pages show a computer-recommended note");
    }
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nPhase 22 role/navigation checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
