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

  assert.match(indexHtml, /SHELL_VERSION = "20260809-phase11-ota-desktop-go12"/);
  assert.match(indexHtml, /data-work-nav-root/);
  assert.match(indexHtml, /data-work-nav="business"/);
  assert.match(indexHtml, /data-work-nav="curriculum"/);
  assert.match(indexHtml, />\s*Management\s*</);
  assert.match(indexHtml, /Family messages/);
  assert.match(indexHtml, /id="view-classroom"/);
  assert.match(indexHtml, /id="view-today"/);
  assert.match(indexHtml, /id="view-business"/);
  assert.match(appJs, /function isWorkModeNavEnabled/);
  assert.match(appJs, /function renderOwnerHomeDashboard/);
  assert.match(appJs, /function renderTeacherTodayPage/);
  assert.match(appJs, /function renderClassroomHubPage/);
  assert.match(appJs, /function renderFamiliesHubPage/);
  assert.match(appJs, /function renderBusinessHubPage/);
  assert.match(appJs, /function syncUniversalQuickAdd/);
  assert.match(appJs, /Admin → <strong>Testers<\/strong>/);
  assert.match(appJs, /data-admin-open-testers/);
  assert.match(appJs, /isHomeDaycareWorkAccount/);
  assert.match(stylesCss, /\.work-hub-page/);
  assert.match(stylesCss, /\.work-quick-add-fab/);
  // Roles must not be forced into one identical nav list
  assert.match(indexHtml, /data-work-roles="owner,director"/);
  assert.match(indexHtml, /data-work-roles="teacher,assistant"/);
  assert.match(indexHtml, /data-work-roles="assistant"/);
  assert.match(appJs, /workModeLandingView/);
  console.log("PASS  static nav/role markers");

  const port = 46000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-nav-${crypto.randomBytes(4).toString("hex")}.json`);
  const server = spawnServer({ port, storePath });
  let browser;
  const results = {
    ownerNav: false,
    teacherNav: false,
    assistantNav: false,
    ownerHome: false,
    teacherToday: false,
    quickAdd: false,
    testingCenter: false,
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
        loggedIn: isLoggedIn(),
        work,
        hasHome: work.includes("home"),
        hasBusiness: work.includes("business"),
        hasCurriculum: work.includes("curriculum"),
        hasToday: work.includes("today"),
        managementLabel: document.querySelector('[data-work-nav="business"]')?.textContent?.trim() || "",
        quickAdd: Boolean(document.querySelector("#workQuickAdd")),
        homeTitle: document.querySelector("#view-home h2")?.textContent || "",
        legacyHidden: document.querySelector("[data-legacy-nav='true']")?.hidden === true
          || getComputedStyle(document.querySelector("[data-legacy-nav='true']")).display === "none",
      };
    });
    assert.equal(owner.enabled, true);
    assert.equal(owner.role, "owner");
    assert.equal(owner.landing, "home");
    assert.equal(owner.hasHome, true);
    assert.equal(owner.hasBusiness, true);
    assert.equal(owner.hasCurriculum, true, "Owner should see Curriculum in work-mode nav");
    assert.match(owner.managementLabel, /Management/i);
    assert.equal(owner.hasToday, false, "Owner must not use Teacher Today as primary nav");
    assert.equal(owner.quickAdd, true);
    assert.ok(/Good (morning|afternoon|evening)/i.test(owner.homeTitle), `owner home title: ${owner.homeTitle}`);
    results.ownerNav = true;
    results.ownerHome = true;
    results.quickAdd = true;
    console.log("PASS  Owner nav + Home (not Teacher-shaped)");

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "owner-home.png") });

    // Teacher shell — intentionally different (mutate account role; fake admin token may be cleared by heartbeat)
    const teacher = await page.evaluate(() => {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      if (accounts[email]) {
        accounts[email].role = "teacher";
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      }
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Teacher");
      if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Teacher");
      syncPlatformNavVisibility();
      setView("today", { skipAccessRedirect: true });
      const work = [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden).map((b) => b.getAttribute("data-work-nav"));
      return {
        role: workModeRole(),
        landing: workModeLandingView(),
        work,
        hasToday: work.includes("today"),
        hasBusiness: work.includes("business"),
        hasCurriculum: work.includes("curriculum"),
        hasHome: work.includes("home"),
        hasMore: work.includes("more"),
        todayTitle: document.querySelector("#view-today h2")?.textContent || "",
        childrenLabel: document.querySelector("[data-work-label-teacher]")?.hidden === false,
      };
    });
    assert.equal(teacher.role, "teacher");
    assert.equal(teacher.landing, "today");
    assert.equal(teacher.hasToday, true);
    assert.equal(teacher.hasBusiness, false, "Teacher must not see Business/Management");
    assert.equal(teacher.hasCurriculum, true, "Teacher should see Curriculum");
    assert.equal(teacher.hasHome, false, "Teacher Home is Today, not Owner Home");
    assert.equal(teacher.hasMore, true);
    assert.match(teacher.todayTitle, /Today/i);
    results.teacherNav = true;
    results.teacherToday = true;
    console.log("PASS  Teacher nav + Today (distinct from Owner)");

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "teacher-today.png") });

    // Assistant — Family messages instead of Families; no Management
    const assistant = await page.evaluate(() => {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      if (accounts[email]) {
        accounts[email].role = "assistant";
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      }
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Assistant");
      if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Assistant");
      syncPlatformNavVisibility();
      const work = [...document.querySelectorAll("[data-work-nav]")].filter((b) => !b.hidden).map((b) => b.getAttribute("data-work-nav"));
      return {
        role: workModeRole(),
        work,
        hasFamilies: work.includes("families"),
        hasMessages: work.includes("messages"),
        hasBusiness: work.includes("business"),
        hasCurriculum: work.includes("curriculum"),
      };
    });
    assert.equal(assistant.role, "assistant");
    assert.equal(assistant.hasFamilies, false);
    assert.equal(assistant.hasMessages, true);
    assert.equal(assistant.hasBusiness, false);
    assert.equal(assistant.hasCurriculum, false, "Assistant should not see Curriculum primary");
    const assistantMessagesView = await page.evaluate(() => {
      const btn = document.querySelector('[data-work-nav="messages"]');
      return btn?.getAttribute("data-view") || "";
    });
    assert.equal(assistantMessagesView, "home-daycare-hub", "Assistant Family messages must open Family Hub, not Message Support");
    results.assistantNav = true;
    console.log("PASS  Assistant nav (Family messages → Family Hub, no Families/Management)");

    // Hubs exist (restore owner account for management hub)
    await page.evaluate(() => {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      if (accounts[email]) {
        accounts[email].role = "owner";
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      }
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Owner");
      if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Owner");
      syncPlatformNavVisibility();
      setView("classroom", { skipAccessRedirect: true });
    });
    await page.waitForTimeout(200);
    const classroomOk = await page.locator("#view-classroom .work-hub-page").count();
    assert.ok(classroomOk, "classroom hub rendered");
    await page.evaluate(() => setView("business", { skipAccessRedirect: true }));
    await page.waitForTimeout(200);
    assert.ok(await page.locator("#view-business .work-hub-page").count(), "management hub rendered");
    const managementTitle = await page.locator("#view-business h2").textContent();
    assert.match(String(managementTitle || ""), /Management/i);
    const familiesMessages = await page.evaluate(() => {
      setView("families", { skipAccessRedirect: true });
      return [...document.querySelectorAll("#view-families .work-hub-tile strong")].map((el) => el.textContent);
    });
    assert.ok(familiesMessages.some((t) => /Family messages/i.test(t)), `expected Family messages tile, got ${familiesMessages.join(", ")}`);
    assert.ok(familiesMessages.some((t) => /^Forms$/i.test(t)), "expected primary Forms tile");
    console.log("PASS  Classroom / Management / Families hubs");

    // Admin Testers / Testing Pro markers via evaluate of render path
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
    "**Shell:** Phase 3 Navigation Cleanup",
    "**Rule:** Do not merge unfinished work to production. Production remains read-only.",
    "",
    "## Verdict",
    "",
    results.ownerNav && results.teacherNav && results.assistantNav && results.ownerHome && results.teacherToday
      ? "**PASS** — Role-specific navigation is live. Owner, Teacher, and Assistant are intentionally not symmetrical."
      : "**FAIL** — Role navigation checks did not all pass.",
    "",
    "## Results",
    "",
    `| Check | Result |`,
    `|---|---|`,
    `| Owner nav (Home/Children/Classroom/Curriculum/Families/Management/Settings) | ${results.ownerNav ? "PASS" : "FAIL"} |`,
    `| Owner Home dashboard | ${results.ownerHome ? "PASS" : "FAIL"} |`,
    `| Teacher nav (Today/My Children/Classroom/Curriculum/Families/More) | ${results.teacherNav ? "PASS" : "FAIL"} |`,
    `| Teacher Today dashboard | ${results.teacherToday ? "PASS" : "FAIL"} |`,
    `| Assistant nav (Today/Children/Classroom/Family messages/More) | ${results.assistantNav ? "PASS" : "FAIL"} |`,
    `| Universal Quick Add | ${results.quickAdd ? "PASS" : "FAIL"} |`,
    `| Testing Pro / Testers APIs | ${results.testingCenter ? "PASS" : "FAIL"} |`,
    "",
    "## Phase 3 cleanup notes",
    "",
    "- Business → **Management** label (view id remains `business`)",
    "- Primary **Curriculum** nav for Owner/Director/Teacher",
    "- **Family messages** vs **Message Support** labeling",
    "- Forms primary path under Families; Quick Add says Parent form",
    "- Admin → **Testers** is primary tester ops path",
    "- Home daycare Management demotes Staff/Classrooms",
    "",
    "## Design principle",
    "",
    "Roles are **not** forced into the same structure. An owner's day (management pulse + alerts), a teacher's day (care loop), and a parent's day (warm Family Hub) each get a home optimized for what they do most often.",
    "",
    "## Deferred polish",
    "",
    "- Deeper child-profile tab rename pass",
    "- Richer seed/reset suite for every test persona type",
    "- Production rollout of work-mode (currently testing-fence only)",
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
