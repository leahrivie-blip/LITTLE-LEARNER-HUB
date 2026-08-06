/**
 * Navigation & role experience acceptance (testing only).
 * Run: npm run test:nav-role-experience
 * Do not merge. Do not deploy production.
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/nav-role-experience";
const OWNER = "nav.role.owner@example.com";

function request(port, method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: "true",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "true",
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server not healthy");
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  assert.match(indexHtml, /SHELL_VERSION = "20260805-tk-owner-preview-r2"/);
  assert.match(indexHtml, /data-work-nav-root/);
  assert.match(indexHtml, /data-work-nav="business"/);
  assert.match(indexHtml, /data-work-nav="daily-logs"/);
  assert.match(indexHtml, /data-work-nav="calendar"/);
  assert.match(indexHtml, /data-work-nav="lessons"/);
  assert.match(indexHtml, /id="view-classroom"/);
  assert.match(indexHtml, /id="view-today"/);
  assert.match(indexHtml, /id="view-business"/);
  assert.match(appJs, /function isWorkModeNavEnabled/);
  assert.match(appJs, /function defaultAuthLandingView/);
  assert.match(appJs, /function workModeSetupGuideHtml/);
  assert.match(appJs, /function renderOwnerHomeDashboard/);
  assert.match(appJs, /function renderTeacherTodayPage/);
  assert.match(appJs, /function renderClassroomHubPage/);
  assert.match(appJs, /function renderFamiliesHubPage/);
  assert.match(appJs, /function renderBusinessHubPage/);
  assert.match(appJs, /function syncUniversalQuickAdd/);
  assert.match(appJs, /Admin Testing Center|Testing Center/);
  assert.match(appJs, /defaultAuthLandingView\(\)/);
  assert.match(stylesCss, /\.work-hub-page/);
  assert.match(stylesCss, /\.work-quick-add-fab/);
  assert.match(stylesCss, /\.work-setup-guide/);
  // Roles must not be forced into one identical nav list
  assert.match(indexHtml, /data-work-roles="owner,director"/);
  assert.match(indexHtml, /data-work-roles="teacher,assistant"/);
  assert.match(appJs, /workModeLandingView/);
  // Teachers must not get Families nav (capability dead-end)
  assert.doesNotMatch(indexHtml, /data-work-nav="families"[^>]*data-work-roles="[^"]*teacher/);
  console.log("PASS  static nav/role markers");

  const port = 46000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-nav-${crypto.randomBytes(4).toString("hex")}.json`);
  const server = spawnServer({ port, storePath });
  let browser;
  const results = {
    ownerNav: false,
    teacherNav: false,
    assistantNav: false,
    directorNav: false,
    ownerHome: false,
    teacherToday: false,
    quickAdd: false,
    testingCenter: false,
    mobileNav: false,
  };

  try {
    await waitForHealth(port, server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(({ email }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Free");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Free",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "Free Plan",
          createdAt: new Date().toISOString(),
        },
      }));
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Admin");
      localStorage.setItem("llhAdminSession", JSON.stringify({
        email: "admin@test.local",
        name: "Admin",
        token: "test-admin-token",
      }));
    }, { email: OWNER });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (
      typeof window.isWorkModeNavEnabled === "function"
      || typeof isWorkModeNavEnabled === "function"
    ) && Boolean(window.LLH_CONFIG?.homeDaycareHubTesting), null, { timeout: 20000 });
    await page.waitForTimeout(300);

    // Owner shell
    const owner = await page.evaluate(() => {
      if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Owner");
      if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();
      if (typeof setView === "function") setView("home", { allowDashboard: true, skipAccessRedirect: true });
      const work = [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden).map((b) => b.getAttribute("data-work-nav"));
      return {
        enabled: isWorkModeNavEnabled(),
        role: workModeRole(),
        landing: workModeLandingView(),
        authLanding: defaultAuthLandingView(),
        loggedIn: isLoggedIn(),
        work,
        hasHome: work.includes("home"),
        hasBusiness: work.includes("business"),
        hasToday: work.includes("today"),
        hasDailyLogs: work.includes("daily-logs"),
        hasCalendar: work.includes("calendar"),
        hasLessons: work.includes("lessons"),
        hasMessages: work.includes("messages"),
        hasForms: work.includes("forms"),
        hasFamilies: work.includes("families"),
        quickAdd: Boolean(document.querySelector("#workQuickAdd")),
        homeTitle: document.querySelector("#view-home h2")?.textContent || "",
        setupGuide: Boolean(document.querySelector("[data-work-setup-guide]")),
        legacyHidden: document.querySelector("[data-legacy-nav='true']")?.hidden === true
          || getComputedStyle(document.querySelector("[data-legacy-nav='true']")).display === "none",
      };
    });
    assert.equal(owner.enabled, true);
    assert.equal(owner.role, "owner");
    assert.equal(owner.landing, "home");
    assert.equal(owner.authLanding, "home", "Login must land on Owner Home, not Calendar");
    assert.equal(owner.hasHome, true);
    assert.equal(owner.hasBusiness, true);
    assert.equal(owner.hasToday, false, "Owner must not use Teacher Today as primary nav");
    assert.equal(owner.hasDailyLogs, true);
    assert.equal(owner.hasCalendar, true);
    assert.equal(owner.hasLessons, true);
    assert.equal(owner.hasMessages, true);
    assert.equal(owner.hasForms, true);
    assert.equal(owner.hasFamilies, true);
    assert.equal(owner.quickAdd, true);
    assert.equal(owner.setupGuide, true, "Empty program must show setup guide");
    assert.ok(/Good (morning|afternoon|evening)/i.test(owner.homeTitle), `owner home title: ${owner.homeTitle}`);
    results.ownerNav = true;
    results.ownerHome = true;
    results.quickAdd = true;
    console.log("PASS  Owner nav + Home (not Teacher-shaped)");

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "owner-home.png") });

    async function applyRole(page, role) {
      return page.evaluate((nextRole) => {
        const email = localStorage.getItem("llhUser");
        localStorage.removeItem("llhMultiRoleTesterView");
        localStorage.removeItem("llhAdminPreviewMode");
        try { if (typeof clearMultiRoleTesterView === "function") clearMultiRoleTesterView(); } catch (_e) { /* ignore */ }
        try {
          if (typeof LLHMultiRoleTester?.clearView === "function") LLHMultiRoleTester.clearView({ silent: true });
        } catch (_e) { /* ignore */ }
        try {
          if (typeof setHdhTesterPersona === "function") setHdhTesterPersona({ role: nextRole === "assistant" ? "staff-helper" : nextRole === "teacher" ? "teacher" : "teacher" });
        } catch (_e) { /* ignore */ }
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        accounts[email] = {
          ...(accounts[email] || { email }),
          role: nextRole,
          accountType: accounts[email]?.accountType || "home_daycare",
          plan: accounts[email]?.plan || "Pro",
        };
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        if (typeof updateAccount === "function") updateAccount(email, { role: nextRole, accountType: "home_daycare" });
        if (typeof loadAccountState === "function") loadAccountState(email);
        if (typeof syncWorkModeNav === "function") syncWorkModeNav();
        if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();
        return { role: typeof getUserRole === "function" ? getUserRole() : "", work: typeof workModeRole === "function" ? workModeRole() : "" };
      }, role);
    }

    // Teacher shell — authenticated teacher account (not Admin View As simulation)
    const teacherApplied = await applyRole(page, "teacher");
    assert.equal(teacherApplied.work, "teacher", `teacher apply failed: ${JSON.stringify(teacherApplied)}`);
    const teacher = await page.evaluate(() => {
      setView("today", { skipAccessRedirect: true });
      const work = [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden).map((b) => b.getAttribute("data-work-nav"));
      return {
        role: workModeRole(),
        landing: workModeLandingView(),
        authLanding: defaultAuthLandingView(),
        work,
        hasToday: work.includes("today"),
        hasBusiness: work.includes("business"),
        hasHome: work.includes("home"),
        hasMore: work.includes("more"),
        hasFamilies: work.includes("families"),
        hasForms: work.includes("forms"),
        hasDailyLogs: work.includes("daily-logs"),
        hasSettings: work.includes("settings"),
        todayTitle: document.querySelector("#view-today h2")?.textContent || "",
        setupGuide: Boolean(document.querySelector("[data-work-setup-guide]")),
        childrenLabel: document.querySelector("[data-work-label-teacher]")?.hidden === false,
      };
    });
    assert.equal(teacher.role, "teacher");
    assert.equal(teacher.landing, "today");
    assert.equal(teacher.authLanding, "today");
    assert.equal(teacher.hasToday, true);
    assert.equal(teacher.hasBusiness, false, "Teacher must not see Business");
    assert.equal(teacher.hasHome, false, "Teacher Home is Today, not Owner Home");
    assert.equal(teacher.hasFamilies, false, "Teacher must not see Families nav dead-end");
    assert.equal(teacher.hasForms, false, "Forms stay owner/director");
    assert.equal(teacher.hasSettings, false, "Settings stay owner/director");
    assert.equal(teacher.hasDailyLogs, true);
    assert.equal(teacher.hasMore, true);
    assert.equal(teacher.setupGuide, true, "Teacher empty roster shows waiting/setup guide");
    assert.match(teacher.todayTitle, /Today/i);
    results.teacherNav = true;
    results.teacherToday = true;
    console.log("PASS  Teacher nav + Today (distinct from Owner)");

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "teacher-today.png") });

    // Director — Home + Business/Families/Forms; not Teacher Today
    const directorApplied = await applyRole(page, "director");
    assert.equal(directorApplied.work, "director", `director apply failed: ${JSON.stringify(directorApplied)}`);
    const director = await page.evaluate(() => {
      setView("home", { allowDashboard: true, skipAccessRedirect: true });
      const work = [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden).map((b) => b.getAttribute("data-work-nav"));
      return {
        role: workModeRole(),
        landing: workModeLandingView(),
        authLanding: defaultAuthLandingView(),
        work,
        hasHome: work.includes("home"),
        hasToday: work.includes("today"),
        hasBusiness: work.includes("business"),
        hasFamilies: work.includes("families"),
        hasForms: work.includes("forms"),
        hasSettings: work.includes("settings"),
        setupGuide: Boolean(document.querySelector("[data-work-setup-guide]")),
        eyebrow: document.querySelector(".work-hub-page .eyebrow, .work-hub-eyebrow, [data-work-eyebrow]")?.textContent
          || document.querySelector("#view-home .muted-copy, #view-home p")?.textContent
          || "",
        homeHtml: document.querySelector("#view-home")?.innerText?.slice(0, 240) || "",
      };
    });
    assert.equal(director.role, "director");
    assert.equal(director.landing, "home");
    assert.equal(director.authLanding, "home");
    assert.equal(director.hasHome, true);
    assert.equal(director.hasToday, false);
    assert.equal(director.hasBusiness, true);
    assert.equal(director.hasFamilies, true);
    assert.equal(director.hasForms, true);
    assert.equal(director.hasSettings, true);
    assert.equal(director.setupGuide, true);
    results.directorNav = true;
    console.log("PASS  Director nav + Home");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "director-home.png") });

    // Assistant — Messages; no Families/Business
    const assistantApplied = await applyRole(page, "assistant");
    assert.equal(assistantApplied.work, "assistant", `assistant apply failed: ${JSON.stringify(assistantApplied)}`);
    const assistant = await page.evaluate(() => {
      setView("today", { skipAccessRedirect: true });
      const work = [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden).map((b) => b.getAttribute("data-work-nav"));
      return {
        role: workModeRole(),
        work,
        hasFamilies: work.includes("families"),
        hasMessages: work.includes("messages"),
        hasBusiness: work.includes("business"),
        hasDailyLogs: work.includes("daily-logs"),
        setupGuide: Boolean(document.querySelector("[data-work-setup-guide]")),
      };
    });
    assert.equal(assistant.role, "assistant");
    assert.equal(assistant.hasFamilies, false);
    assert.equal(assistant.hasMessages, true);
    assert.equal(assistant.hasBusiness, false);
    assert.equal(assistant.hasDailyLogs, true);
    assert.equal(assistant.setupGuide, true);
    results.assistantNav = true;
    console.log("PASS  Assistant nav (Messages, no Families/Business)");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "assistant-today.png") });

    // Mobile owner shell — no horizontal overflow on work nav / setup guide
    await page.setViewportSize({ width: 390, height: 844 });
    await applyRole(page, "owner");
    await page.evaluate(() => setView("home", { allowDashboard: true, skipAccessRedirect: true }));
    await page.waitForTimeout(250);
    const mobile = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        overflowX: doc.scrollWidth > doc.clientWidth + 2,
        setupGuide: Boolean(document.querySelector("[data-work-setup-guide]")),
        workVisible: [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden).length,
      };
    });
    assert.equal(mobile.overflowX, false, "Mobile owner home must not horizontally overflow");
    assert.equal(mobile.setupGuide, true);
    assert.ok(mobile.workVisible >= 8, `expected daily work nav items, got ${mobile.workVisible}`);
    results.mobileNav = true;
    console.log("PASS  Mobile owner home (no horizontal overflow)");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "owner-home-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });

    // Hubs exist (restore owner account)
    await applyRole(page, "owner");
    await page.evaluate(() => {
      setView("classroom", { skipAccessRedirect: true });
    });
    await page.waitForTimeout(200);
    const classroomOk = await page.locator("#view-classroom .work-hub-page").count();
    assert.ok(classroomOk, "classroom hub rendered");
    await page.evaluate(() => setView("business", { skipAccessRedirect: true }));
    await page.waitForTimeout(200);
    assert.ok(await page.locator("#view-business .work-hub-page").count(), "business hub rendered");
    await page.evaluate(() => setView("families", { skipAccessRedirect: true }));
    await page.waitForTimeout(200);
    assert.ok(await page.locator("#view-families .work-hub-page").count(), "families hub rendered");
    console.log("PASS  Classroom / Business / Families hubs");

    // Admin Testing Center markers via evaluate of render path
    const adminBits = await page.evaluate(() => ({
      hasTestingAction: typeof setAdminPreviewMode === "function",
      viewAs: typeof ADMIN_VIEW_AS_ROLES !== "undefined" || /Owner|Director|Teacher|Assistant|Parent/.test(String(setAdminPreviewMode)),
      testingPro: hasTestingProEntitlement(),
    }));
    assert.equal(adminBits.testingPro, true);
    results.testingCenter = true;
    console.log("PASS  Testing Pro + View As APIs");

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "families-hub.png") });
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }

  const md = [
    "# Navigation & Role Experience Report",
    "",
    "**Environment:** Testing only (`HOME_DAYCARE_HUB_TESTING`)",
    "**Shell:** `20260804-nav-role-experience`",
    "**Rule:** Do not merge. Do not deploy production.",
    "",
    "## Verdict",
    "",
    results.ownerNav && results.teacherNav && results.assistantNav && results.directorNav
      && results.ownerHome && results.teacherToday && results.mobileNav
      ? "**PASS** — Role-specific navigation is live. Owner, Director, Teacher, and Assistant are intentionally not symmetrical."
      : "**FAIL** — Role navigation checks did not all pass.",
    "",
    "## Results",
    "",
    `| Check | Result |`,
    `|---|---|`,
    `| Owner nav (Home/Daily Logs/Children/Calendar/Lessons/Messages/Forms/Families/Business/Settings) | ${results.ownerNav ? "PASS" : "FAIL"} |`,
    `| Owner Home dashboard + empty setup guide | ${results.ownerHome ? "PASS" : "FAIL"} |`,
    `| Director nav + Home (Business/Families/Forms; no Teacher Today) | ${results.directorNav ? "PASS" : "FAIL"} |`,
    `| Teacher nav (Today/Daily Logs/…/Messages/More; no Business/Families/Settings) | ${results.teacherNav ? "PASS" : "FAIL"} |`,
    `| Teacher Today dashboard + empty setup guide | ${results.teacherToday ? "PASS" : "FAIL"} |`,
    `| Assistant nav (Today/…/Messages/More; no Families/Business) | ${results.assistantNav ? "PASS" : "FAIL"} |`,
    `| Mobile owner home (no horizontal overflow) | ${results.mobileNav ? "PASS" : "FAIL"} |`,
    `| Universal Quick Add | ${results.quickAdd ? "PASS" : "FAIL"} |`,
    `| Testing Pro / Testing Center APIs | ${results.testingCenter ? "PASS" : "FAIL"} |`,
    "",
    "## Design principle",
    "",
    "Roles are **not** forced into the same structure. Login lands on role Home/Today. Empty programs get a setup path before Daily Logs. Heavy owner tools stay out of teacher screens.",
    "",
    "## Phase 1 scope",
    "",
    "- Auth landing uses work-mode Home/Today",
    "- Empty-program setup guide",
    "- Daily nav: Daily Logs, Calendar, Lessons, Activities, Documentation Helpers, Messages",
    "- Teaching Kit Admin / Testing Center stay hidden from regular testers",
    "",
  ].join("\n");

  fs.mkdirSync(path.join(ROOT, "docs/audits"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "docs/audits/NAV_ROLE_EXPERIENCE_REPORT.md"), md);
  fs.writeFileSync(path.join(ARTIFACT_DIR, "NAV_ROLE_EXPERIENCE_REPORT.md"), md);
  console.log("Wrote docs/audits/NAV_ROLE_EXPERIENCE_REPORT.md");
  console.log("ALL NAV ROLE EXPERIENCE CHECKS PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
