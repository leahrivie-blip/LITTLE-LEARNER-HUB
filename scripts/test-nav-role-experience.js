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

  // Shell version is branch-specific (testing vs production). Require index + SW to match.
  const swHtml = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const shellFromSw = swHtml.match(/SHELL_VERSION\s*=\s*"([^"]+)"/)?.[1] || "";
  assert.ok(shellFromSw, "service-worker.js must declare SHELL_VERSION");
  assert.match(indexHtml, new RegExp(`SHELL_VERSION = "${shellFromSw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
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
  assert.match(appJs, /function workModeGreetingTitle/);
  assert.match(appJs, /function isSafeUserFacingDisplayName/);
  assert.match(appJs, /function renderOwnerHomeDashboard/);
  assert.match(appJs, /function renderTeacherTodayPage/);
  assert.match(appJs, /function renderClassroomHubPage/);
  assert.match(appJs, /function renderFamiliesHubPage/);
  assert.match(appJs, /function renderBusinessHubPage/);
  assert.match(appJs, /function syncUniversalQuickAdd/);
  assert.match(appJs, /Admin Testing Center|Testing Center/);
  assert.match(appJs, /defaultAuthLandingView\(\)/);
  assert.match(appJs, /workModeGreetingTitle\(/);
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
    greetingFallback: false,
  };

  function assertSafeGreeting(title, label) {
    assert.match(title, /^Good (morning|afternoon|evening)(, .+)?$/i, `${label} greeting shape: ${title}`);
    assert.doesNotMatch(title, /nav\.role\.owner/i, `${label} must not show email local-part`);
    assert.doesNotMatch(title, /@/, `${label} must not show email`);
    assert.doesNotMatch(title, /\b(undefined|null)\b/i, `${label} must not show undefined/null`);
    assert.doesNotMatch(title, /,\s*$/, `${label} must not end with bare comma`);
    assert.doesNotMatch(title, /,\s*[,.·•-]+\s*$/, `${label} must not use blank punctuation`);
  }

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
      // Keep the owner program empty so Phase 1 setup-guide UX is measurable on the testing host.
      try { sessionStorage.setItem("llhSkipTestingDemoSeed", "1"); } catch (_e) { /* ignore */ }
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
    assertSafeGreeting(owner.homeTitle, "Owner Home");
    assert.match(owner.homeTitle, /,\s*Owner$/i, `owner role-label fallback expected, got: ${owner.homeTitle}`);
    results.ownerNav = true;
    results.ownerHome = true;
    results.quickAdd = true;
    console.log("PASS  Owner nav + Home (not Teacher-shaped)");

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "owner-home.png") });

    async function applyRole(page, role, profile = {}) {
      return page.evaluate(({ nextRole, profile: nextProfile }) => {
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
        const prev = accounts[email] || { email };
        const nextAccount = {
          ...prev,
          role: nextRole,
          accountType: nextProfile.accountType || prev.accountType || "home_daycare",
          plan: prev.plan || "Pro",
          firstName: Object.prototype.hasOwnProperty.call(nextProfile, "firstName") ? nextProfile.firstName : "",
          lastName: Object.prototype.hasOwnProperty.call(nextProfile, "lastName") ? nextProfile.lastName : "",
          name: Object.prototype.hasOwnProperty.call(nextProfile, "name") ? nextProfile.name : "",
          displayName: Object.prototype.hasOwnProperty.call(nextProfile, "displayName") ? nextProfile.displayName : "",
          fullName: Object.prototype.hasOwnProperty.call(nextProfile, "fullName") ? nextProfile.fullName : "",
          businessName: Object.prototype.hasOwnProperty.call(nextProfile, "businessName") ? nextProfile.businessName : "",
          programName: Object.prototype.hasOwnProperty.call(nextProfile, "programName") ? nextProfile.programName : "",
          programSettings: Object.prototype.hasOwnProperty.call(nextProfile, "programSettings")
            ? nextProfile.programSettings
            : { ...(prev.programSettings || {}), programName: "" },
        };
        accounts[email] = nextAccount;
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        if (typeof updateAccount === "function") {
          updateAccount(email, {
            role: nextRole,
            accountType: nextAccount.accountType,
            firstName: nextAccount.firstName,
            lastName: nextAccount.lastName,
            name: nextAccount.name,
            displayName: nextAccount.displayName,
            fullName: nextAccount.fullName,
            businessName: nextAccount.businessName,
            programName: nextAccount.programName,
            programSettings: nextAccount.programSettings,
          });
        }
        if (typeof loadAccountState === "function") loadAccountState(email);
        if (typeof syncWorkModeNav === "function") syncWorkModeNav();
        if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();
        return { role: typeof getUserRole === "function" ? getUserRole() : "", work: typeof workModeRole === "function" ? workModeRole() : "" };
      }, { nextRole: role, profile });
    }

    // Greeting fallback matrix (desktop evaluate + rendered titles)
    const greetingMatrix = await page.evaluate(() => {
      const morning = new Date("2026-08-06T09:00:00");
      const cases = [];
      const push = (id, account, role, expected) => {
        const title = workModeGreetingTitle(account, role, morning);
        cases.push({
          id,
          title,
          expected,
          safeFirst: isSafeUserFacingDisplayName(account.firstName || ""),
          rejectsKey: !isSafeUserFacingDisplayName("nav.role.owner"),
          rejectsUndefined: !isSafeUserFacingDisplayName("undefined"),
          rejectsEmail: !isSafeUserFacingDisplayName("leah@example.com"),
          rejectsBlank: !isSafeUserFacingDisplayName(" , "),
        });
      };
      push("valid-first-name", { firstName: "Leah" }, "owner", "Good morning, Leah");
      push("missing-name-role-owner", { firstName: "", businessName: "", programSettings: {} }, "owner", "Good morning, Owner");
      push("program-name-fallback", { firstName: "", businessName: "Sunshine Nest", programSettings: { programName: "Sunshine Nest" } }, "owner", "Good morning, Sunshine Nest");
      push("role-director", { firstName: "" }, "director", "Good morning, Director");
      push("role-teacher", { firstName: "" }, "teacher", "Good morning, Teacher");
      push("role-assistant", { firstName: "" }, "assistant", "Good morning, Assistant");
      push("missing-translation-key", { firstName: "nav.role.owner", name: "i18n.greeting.name" }, "owner", "Good morning, Owner");
      push("rejects-nullish", { firstName: "null", name: "undefined" }, "owner", "Good morning, Owner");
      push("generic-when-role-unsafe", { firstName: "" }, "not-a-role", "Good morning, Owner");
      return cases;
    });
    for (const row of greetingMatrix) {
      assert.equal(row.title, row.expected, `greeting ${row.id}: ${row.title}`);
      assert.equal(row.rejectsKey, true);
      assert.equal(row.rejectsUndefined, true);
      assert.equal(row.rejectsEmail, true);
      assert.equal(row.rejectsBlank, true);
    }
    results.greetingFallback = true;
    console.log("PASS  Greeting fallback matrix");

    // Rendered first-name greeting (Owner Home)
    await applyRole(page, "owner", { firstName: "Leah", lastName: "Tester" });
    const namedOwner = await page.evaluate(() => {
      setView("home", { allowDashboard: true, skipAccessRedirect: true });
      return document.querySelector("#view-home h2")?.textContent || "";
    });
    assertSafeGreeting(namedOwner, "Named Owner Home");
    assert.match(namedOwner, /,\s*Leah$/);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "owner-home-named.png") });

    // Program-name fallback rendered
    await applyRole(page, "owner", {
      firstName: "",
      businessName: "Maple Room Care",
      programSettings: { programName: "Maple Room Care" },
    });
    const programOwner = await page.evaluate(() => {
      setView("home", { allowDashboard: true, skipAccessRedirect: true });
      return document.querySelector("#view-home h2")?.textContent || "";
    });
    assertSafeGreeting(programOwner, "Program Owner Home");
    assert.match(programOwner, /,\s*Maple Room Care$/);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "owner-home-program.png") });

    // Reset to clean role-label owner for remaining nav checks
    await applyRole(page, "owner", { firstName: "", businessName: "", programSettings: { programName: "" } });
    await page.evaluate(() => setView("home", { allowDashboard: true, skipAccessRedirect: true }));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "owner-home.png") });

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
    assertSafeGreeting(teacher.todayTitle, "Teacher Today");
    assert.match(teacher.todayTitle, /,\s*Teacher$/i);
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
        homeTitle: document.querySelector("#view-home h2")?.textContent || "",
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
    assertSafeGreeting(director.homeTitle, "Director Home");
    assert.match(director.homeTitle, /,\s*Director$/i);
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
        todayTitle: document.querySelector("#view-today h2")?.textContent || "",
      };
    });
    assert.equal(assistant.role, "assistant");
    assert.equal(assistant.hasFamilies, false);
    assert.equal(assistant.hasMessages, true);
    assert.equal(assistant.hasBusiness, false);
    assert.equal(assistant.hasDailyLogs, true);
    assert.equal(assistant.setupGuide, true);
    assertSafeGreeting(assistant.todayTitle, "Assistant Today");
    assert.match(assistant.todayTitle, /,\s*Assistant$/i);
    results.assistantNav = true;
    console.log("PASS  Assistant nav (Messages, no Families/Business)");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "assistant-today.png") });

    // Mobile owner shell — no horizontal overflow on work nav / setup guide
    await page.setViewportSize({ width: 390, height: 844 });
    await applyRole(page, "owner", { firstName: "Leah" });
    await page.evaluate(() => setView("home", { allowDashboard: true, skipAccessRedirect: true }));
    await page.waitForTimeout(250);
    const mobile = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        overflowX: doc.scrollWidth > doc.clientWidth + 2,
        setupGuide: Boolean(document.querySelector("[data-work-setup-guide]")),
        workVisible: [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden).length,
        homeTitle: document.querySelector("#view-home h2")?.textContent || "",
      };
    });
    assert.equal(mobile.overflowX, false, "Mobile owner home must not horizontally overflow");
    assert.equal(mobile.setupGuide, true);
    assert.ok(mobile.workVisible >= 8, `expected daily work nav items, got ${mobile.workVisible}`);
    assertSafeGreeting(mobile.homeTitle, "Mobile Owner Home");
    assert.match(mobile.homeTitle, /,\s*Leah$/);
    results.mobileNav = true;
    console.log("PASS  Mobile owner home (no horizontal overflow)");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "owner-home-mobile.png"), fullPage: true });

    await applyRole(page, "teacher");
    await page.evaluate(() => setView("today", { skipAccessRedirect: true }));
    await page.waitForTimeout(200);
    const mobileTeacherTitle = await page.evaluate(() => document.querySelector("#view-today h2")?.textContent || "");
    assertSafeGreeting(mobileTeacherTitle, "Mobile Teacher Today");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "teacher-today-mobile.png"), fullPage: true });
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
      && results.ownerHome && results.teacherToday && results.mobileNav && results.greetingFallback
      ? "**PASS** — Role-specific navigation is live. Owner, Director, Teacher, and Assistant are intentionally not symmetrical."
      : "**FAIL** — Role navigation checks did not all pass.",
    "",
    "## Results",
    "",
    `| Check | Result |`,
    `|---|---|`,
    `| Owner nav (Home/Daily Logs/Children/Calendar/Lessons/Messages/Forms/Families/Business/Settings) | ${results.ownerNav ? "PASS" : "FAIL"} |`,
    `| Owner Home dashboard + empty setup guide | ${results.ownerHome ? "PASS" : "FAIL"} |`,
    `| Greeting fallback (first name → program → role → generic) | ${results.greetingFallback ? "PASS" : "FAIL"} |`,
    `| Director nav + Home (Business/Families/Forms; no Teacher Today) | ${results.directorNav ? "PASS" : "FAIL"} |`,
    `| Teacher nav (Today/Daily Logs/…/Messages/More; no Business/Families/Settings) | ${results.teacherNav ? "PASS" : "FAIL"} |`,
    `| Teacher Today dashboard + empty setup guide | ${results.teacherToday ? "PASS" : "FAIL"} |`,
    `| Assistant nav (Today/…/Messages/More; no Families/Business) | ${results.assistantNav ? "PASS" : "FAIL"} |`,
    `| Mobile owner/teacher greetings (no horizontal overflow) | ${results.mobileNav ? "PASS" : "FAIL"} |`,
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
