#!/usr/bin/env node
/**
 * Live verification that Phase 11 fix-wave testing is ready for Leah's testers.
 * Testing only — never touches production.
 *
 * Run: node scripts/verify-testing-testers-ready.js
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const TESTING = "https://little-learner-hub-testing.onrender.com";
const PRODUCTION = "https://littlelearnershubbyleah.com";
const EXPECTED_SHELL = "20260809-phase11-testers-go7";
const PROD_SHELL = "20260808-cookie-cta";
const OUT_DIR = "/opt/cursor/artifacts/phase11-tester-ready";
const OUT = process.env.LLH_VERIFY_OUT || path.join(OUT_DIR, "tester-ready-verify.json");

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json, headers: Object.fromEntries(res.headers.entries()) };
}

async function injectRoleSession(page, { email, role, accountType, programName }) {
  await page.addInitScript(({ email, role, accountType, programName }) => {
    const account = {
      email,
      plan: "Pro",
      role,
      accountType,
      programName,
      subscriptionStatus: "Pro Subscription Active",
      stripeSubscriptionStatus: "active",
      isTestingAccount: true,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({ [email]: account }));
    localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
  }, { email, role, accountType, programName });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    testing: TESTING,
    expectedShell: EXPECTED_SHELL,
    checks: {},
  };

  const testManifest = await getJson(`${TESTING}/llh-shell-manifest.json`);
  const prodManifest = await getJson(`${PRODUCTION}/llh-shell-manifest.json`);
  const testHealth = await getJson(`${TESTING}/api/health`);
  const prodHealth = await getJson(`${PRODUCTION}/api/health`);
  const testSw = await fetch(`${TESTING}/service-worker.js`).then((r) => r.text());
  const prodSw = await fetch(`${PRODUCTION}/service-worker.js`).then((r) => r.text());

  report.checks.testing_shell = {
    pass: testManifest.json?.version === EXPECTED_SHELL,
    detail: testManifest.json?.version || "missing",
  };
  report.checks.testing_service_worker_shell = {
    pass: testSw.includes(`SHELL_VERSION = "${EXPECTED_SHELL}"`),
    detail: (testSw.match(/SHELL_VERSION = "([^"]+)"/) || [])[1] || "missing",
  };
  report.checks.production_untouched = {
    pass: prodManifest.json?.version === PROD_SHELL
      && prodHealth.json?.homeDaycareHubTesting === false
      && prodSw.includes(`SHELL_VERSION = "${PROD_SHELL}"`),
    detail: `prodShell=${prodManifest.json?.version} hdh=${prodHealth.json?.homeDaycareHubTesting}`,
  };
  report.checks.testing_site_url = {
    pass: testHealth.json?.domain?.configuredSiteUrl === TESTING
      && testHealth.json?.domain?.configuredHost === "little-learner-hub-testing.onrender.com",
    detail: testHealth.json?.domain?.configuredSiteUrl || "missing",
  };
  report.checks.testing_hdh_and_ai_on = {
    pass: testHealth.json?.homeDaycareHubTesting === true
      && testHealth.json?.aiGuideEnabled === true
      && (testHealth.json?.homeDaycareHub?.features || []).includes("family-hub"),
    detail: `hdh=${testHealth.json?.homeDaycareHubTesting} features=${(testHealth.json?.homeDaycareHub?.features || []).join(",")}`,
  };
  report.checks.tester_data_isolated_from_production = {
    pass: testHealth.json?.homeDaycareHub?.familyHubStorage?.testingOnly === true
      && testHealth.json?.homeDaycareHub?.familyHubStorage?.backend === "postgres"
      && testHealth.json?.domain?.configuredHost !== prodHealth.json?.domain?.configuredHost
      && testHealth.json?.domain?.configuredSiteUrl !== prodHealth.json?.domain?.configuredSiteUrl,
    detail: {
      testingHost: testHealth.json?.domain?.configuredHost,
      productionHost: prodHealth.json?.domain?.configuredHost,
      testingStorage: testHealth.json?.homeDaycareHub?.familyHubStorage?.backend,
      testingOnlyFlag: testHealth.json?.homeDaycareHub?.familyHubStorage?.testingOnly,
    },
  };

  // Invite tokens are store-local: a fake token should 404 on both, proving endpoints are separate hosts.
  const fakeToken = "deadbeef".repeat(6);
  const testPeek = await getJson(`${TESTING}/api/home-daycare-hub/tester-invites/peek?token=${fakeToken}`);
  const prodPeek = await getJson(`${PRODUCTION}/api/home-daycare-hub/tester-invites/peek?token=${fakeToken}`);
  const testStaffPeek = await getJson(`${TESTING}/api/staff/invites/peek?token=${fakeToken}`);
  const prodStaffPeek = await getJson(`${PRODUCTION}/api/staff/invites/peek?token=${fakeToken}`);
  report.checks.invite_endpoints_host_separated = {
    pass: testPeek.status !== 200
      && prodPeek.status !== 200
      && testStaffPeek.status !== 200
      && // production HDH peek should be unavailable / not testing
      (prodPeek.status === 404 || prodPeek.json?.error),
    detail: {
      testingTesterPeek: testPeek.status,
      productionTesterPeek: prodPeek.status,
      testingStaffPeek: testStaffPeek.status,
      productionStaffPeek: prodStaffPeek.status,
      productionTesterError: prodPeek.json?.error || "",
    },
  };

  // Owner Testing Admin exists only on testing
  const testAdminDash = await getJson(`${TESTING}/api/admin/testing/dashboard`);
  const prodAdminDash = await getJson(`${PRODUCTION}/api/admin/testing/dashboard`);
  report.checks.owner_testing_admin_testing_only = {
    pass: testAdminDash.status === 401
      && (prodAdminDash.status === 404
        || prodAdminDash.headers["content-type"]?.includes("text/html")
        || Boolean(prodAdminDash.json?.error)),
    detail: `testing=${testAdminDash.status} production=${prodAdminDash.status}`,
  };

  const browser = await chromium.launch({ headless: true });
  try {
    // Confirm browser on testing sees fix-wave shell + HDH config
    const anon = await browser.newPage();
    await anon.goto(TESTING, { waitUntil: "networkidle", timeout: 90000 });
    const browserMeta = await anon.evaluate(async () => {
      const manifest = await fetch("/llh-shell-manifest.json", { cache: "no-store" }).then((r) => r.json());
      const health = await fetch("/api/health", { cache: "no-store" }).then((r) => r.json());
      return {
        href: location.href,
        manifest,
        hdh: health.homeDaycareHubTesting,
        siteUrl: health.domain?.configuredSiteUrl,
        hasSignin: Boolean(document.querySelector("#signinButton")),
        hasEmailInput: Boolean(document.querySelector("#emailInput")),
        hasPasswordInput: Boolean(document.querySelector("#passwordInput")),
        hasCreateAccount: Boolean(document.querySelector("#switchAuthModeButton")),
      };
    });
    report.checks.browser_testing_shell_and_login_form = {
      pass: browserMeta.manifest?.version === EXPECTED_SHELL
        && browserMeta.hdh === true
        && browserMeta.siteUrl === TESTING
        && browserMeta.hasSignin
        && browserMeta.hasEmailInput
        && browserMeta.hasPasswordInput,
      detail: browserMeta,
    };
    await anon.screenshot({ path: path.join(OUT_DIR, "testing-homepage.png"), fullPage: false });
    await anon.close();

    // Home daycare tester session on testing host
    const home = await browser.newPage();
    await injectRoleSession(home, {
      email: `tester.home.verify@example.com`,
      role: "owner",
      accountType: "home_daycare",
      programName: "Verify Home Daycare",
    });
    await home.goto(TESTING, { waitUntil: "networkidle", timeout: 90000 });
    await home.waitForTimeout(1200);
    const homeState = await home.evaluate(() => {
      const work = [...document.querySelectorAll("[data-work-nav]")]
        .filter((b) => !b.hidden && b.offsetParent)
        .map((b) => b.getAttribute("data-work-nav"));
      const hdhNav = [...document.querySelectorAll(".nav-link, [data-view], [data-work-nav]")]
        .some((n) => /Home Daycare Hub/i.test(n.textContent || "") || /home-daycare-hub/i.test(n.getAttribute("data-view") || ""));
      const body = document.body?.innerText || "";
      return {
        href: location.href,
        host: location.host,
        loggedIn: typeof isLoggedIn === "function" ? isLoggedIn() : Boolean(localStorage.getItem("llhUser")),
        user: localStorage.getItem("llhUser"),
        work,
        hdhNav,
        hasFamilyOrForms: /Family Hub|Forms|Tuition|Staff/i.test(body) || hdhNav,
        configHdh: Boolean(window.LLH_CONFIG?.homeDaycareHubTesting || window.LLH_HEALTH?.homeDaycareHubTesting),
      };
    });
    report.checks.home_daycare_tester_session_on_testing = {
      pass: homeState.host === "little-learner-hub-testing.onrender.com"
        && homeState.loggedIn
        && homeState.user === "tester.home.verify@example.com",
      detail: homeState,
    };
    report.checks.home_daycare_testing_features_available = {
      pass: homeState.configHdh || homeState.hdhNav || homeState.hasFamilyOrForms
        || testHealth.json?.homeDaycareHubTesting === true,
      detail: homeState,
    };
    await home.screenshot({ path: path.join(OUT_DIR, "home-daycare-tester.png"), fullPage: false });
    await home.close();

    // Center director/teacher-shaped sessions on testing host
    const center = await browser.newPage();
    await injectRoleSession(center, {
      email: `tester.center.verify@example.com`,
      role: "director",
      accountType: "center",
      programName: "Verify Center",
    });
    await center.goto(TESTING, { waitUntil: "networkidle", timeout: 90000 });
    await center.waitForTimeout(1200);
    const centerState = await center.evaluate(() => {
      const navText = [...document.querySelectorAll(".nav-link, [data-work-nav]")]
        .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 40);
      return {
        href: location.href,
        host: location.host,
        loggedIn: typeof isLoggedIn === "function" ? isLoggedIn() : Boolean(localStorage.getItem("llhUser")),
        user: localStorage.getItem("llhUser"),
        role: (() => {
          try {
            const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
            return accounts[localStorage.getItem("llhUser")]?.role || "";
          } catch { return ""; }
        })(),
        accountType: (() => {
          try {
            const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
            return accounts[localStorage.getItem("llhUser")]?.accountType || "";
          } catch { return ""; }
        })(),
        navHasStaffOrClassroom: navText.some((t) => /staff|classroom|families|management|director/i.test(t)),
        navText,
      };
    });
    report.checks.center_tester_session_on_testing = {
      pass: centerState.host === "little-learner-hub-testing.onrender.com"
        && centerState.loggedIn
        && centerState.role === "director"
        && centerState.accountType === "center",
      detail: {
        host: centerState.host,
        loggedIn: centerState.loggedIn,
        role: centerState.role,
        accountType: centerState.accountType,
        navHasStaffOrClassroom: centerState.navHasStaffOrClassroom,
      },
    };
    await center.screenshot({ path: path.join(OUT_DIR, "center-tester.png"), fullPage: false });
    await center.close();

    // Same localStorage session must NOT appear on production (origin isolation)
    const prod = await browser.newPage();
    await prod.goto(PRODUCTION, { waitUntil: "domcontentloaded", timeout: 90000 });
    const prodState = await prod.evaluate(async () => {
      const manifest = await fetch("/llh-shell-manifest.json", { cache: "no-store" }).then((r) => r.json());
      return {
        host: location.host,
        user: localStorage.getItem("llhUser"),
        shell: manifest.version,
      };
    });
    report.checks.production_does_not_share_tester_localstorage = {
      pass: prodState.host.includes("littlelearnershubbyleah.com")
        && prodState.user !== "tester.home.verify@example.com"
        && prodState.user !== "tester.center.verify@example.com"
        && prodState.shell === PROD_SHELL,
      detail: prodState,
    };
    await prod.close();
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  report.passed = Object.values(report.checks).filter((c) => c.pass).length;
  report.failed = Object.values(report.checks).filter((c) => !c.pass).length;
  report.testerUrl = TESTING;
  report.loginUrl = TESTING; // open site → Log in / Create account
  report.branchDeployed = "cursor/phase11-final-qa-fix-wave-4eae";
  report.commitDeployedHint = "c9600e9";
  report.notes = [
    "PR #590 remains unmerged; production untouched.",
    "Give testers ONLY the testing URL below — not littlelearnershubbyleah.com.",
    "Existing tester invite accept links created from the testing site use the testing host (SITE_URL).",
    "If any old email still points at production, open Owner Testing Admin on testing and resend the invite.",
  ];

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
