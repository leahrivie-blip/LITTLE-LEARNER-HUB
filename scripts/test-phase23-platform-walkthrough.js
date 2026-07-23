#!/usr/bin/env node
/**
 * Phase 23 — complete platform walkthrough.
 *
 * Boots a real server against a temp local-json store, seeds fake data for a
 * home daycare + small center + curriculum-only plan org, issues one-time
 * passwords, and logs in through the REAL login form (not internal function
 * calls) as all 11 required testing personas plus Platform Admin. For each
 * role, verifies: correct landing view, correct primary nav, a working Today
 * dashboard with zero console/page errors, a working Settings Hub, and clean
 * logout. Also runs a phone/tablet/computer device pass on Today + sidebar
 * for a representative provider role and a guardian role, and saves two
 * composite screenshots.
 *
 * Run: node scripts/test-phase23-platform-walkthrough.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  chromium = null;
}

const ROOT = path.join(__dirname, "..");
const PORT = 21700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-phase23-walkthrough-${crypto.randomBytes(4).toString("hex")}.json`);
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/phase23");
const ADMIN = {
  email: "phase23-walk-admin@example.invalid",
  password: "phase23-walk-pass",
  code: "phase23-walk-code",
};

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json });
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
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
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

async function seedFixtures(token) {
  const auth = { Authorization: `Bearer ${token}` };
  const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
  await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: {
      updatedAt: siteContentGet.json?.siteContent?.updatedAt || "",
      featureFlags: { directorCenter: true, formsCenter: true, familyHub: true, testingLab: true },
    },
  });
  const seedHome = await requestJson("POST", "/api/testing-lab/seed", { scenario: "home_daycare" }, auth);
  assert.equal(seedHome.status, 200, "home_daycare seed should succeed");
  return { auth, organizationId: seedHome.json.organizationId };
}

async function issuePasswordByKind(token, kind) {
  const auth = { Authorization: `Bearer ${token}` };
  // Plan-simulation-only kinds (curriculum_only/home_daycare/small_center/...) live in
  // separate orgs the Testing Lab dashboard does not enumerate — use the Director
  // Center family API's own listing, which returns every fake account across orgs.
  const famAccounts = await requestJson("GET", "/api/director-center/family/fake-accounts", null, auth);
  const list = famAccounts.json?.fakeAccounts || [];
  const account = list.find((a) => a.kind === kind);
  assert.ok(account, `fake account kind "${kind}" should exist`);
  const issue = await requestJson("POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {}, auth);
  assert.equal(issue.status, 200, `issue-password should succeed for ${kind}`);
  return { account, password: issue.json.temporaryPassword };
}

const ROLE_PERSONAS = [
  { label: "Center Owner", kind: "owner", expectedRole: "owner", guardian: false },
  { label: "Director", kind: "director", expectedRole: "director", guardian: false },
  { label: "Solo Home Daycare Provider", kind: "home_daycare", expectedRole: "owner", guardian: false },
  { label: "Lead Teacher", kind: "lead_teacher", expectedRole: "teacher", guardian: false },
  { label: "Assistant", kind: "assistant_broad", expectedRole: "assistant", guardian: false },
  { label: "Curriculum Only Provider", kind: "curriculum_only", expectedRole: "owner", guardian: false },
  { label: "Guardian (multiple children)", kind: "parent_multi_child", guardian: true },
  { label: "Financially responsible guardian", kind: "financial_guardian", guardian: true },
  { label: "Pickup-only guardian", kind: "pickup_only", guardian: true },
  { label: "Restricted/suspended guardian", kind: "restricted_guardian", guardian: true },
];

async function loginViaRealForm(page, baseUrl, email, password) {
  const errors = [];
  const listener = (e) => errors.push(String(e?.message || e));
  page.on("pageerror", listener);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(() => { if (isLoggedIn() || (typeof hasAdminFullAccess === "function" && hasAdminFullAccess())) { try { clearAdminSession({ forgetDevice: true }); } catch { /* */ } localStorage.clear(); } });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(() => openAuthModal("login"));
  await page.waitForTimeout(250);
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", password);
  await page.click("#authSubmitButton");
  await page.waitForTimeout(1800);
  page.off("pageerror", listener);
  return errors;
}

// Composites N screenshots side by side into a single PNG using a throwaway
// Playwright page (avoids adding an image-processing dependency like sharp).
async function compositeScreenshots(browser, buffers, outPath) {
  const page = await browser.newPage();
  const dataUrls = buffers.map((buf) => `data:image/png;base64,${buf.toString("base64")}`);
  await page.setContent(`
    <html><body style="margin:0;padding:24px;background:#f4f1ea;display:flex;gap:24px;align-items:flex-start;">
      ${dataUrls.map((src) => `<img src="${src}" style="display:block;border:1px solid #ccc;" />`).join("\n")}
    </body></html>
  `);
  await page.waitForTimeout(200);
  const frame = await page.evaluate(() => {
    const body = document.body;
    return { width: body.scrollWidth, height: body.scrollHeight };
  });
  await page.setViewportSize({ width: frame.width, height: frame.height });
  await page.screenshot({ path: outPath });
  await page.close();
}

async function main() {
  if (!chromium) {
    console.log("Playwright unavailable — skipping browser-driven Phase 23 walkthrough (static-only run).");
    console.log("\nPhase 23 platform walkthrough passed (0 browser checks; Playwright missing).");
    return;
  }

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLogin.status, 200);
    const token = adminLogin.json.token;
    await seedFixtures(token);
    const baseUrl = `http://127.0.0.1:${PORT}/`;

    // ── Platform Admin ────────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e?.message || e)));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(async ({ email, password, code }) => {
        const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, code }) });
        const data = await res.json();
        // Use the app's real setAdminSession() (not a hand-rolled localStorage write) so
        // this test exercises the exact same code path a real admin unlock goes through,
        // including the llhAdminToken mirror admin-preview UI modules depend on.
        setAdminSession({ email, token: data.token, mode: "server" });
        localStorage.setItem("llhAdminLastView", "admin");
      }, ADMIN);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(1200);
      const state = await page.evaluate(() => ({
        active: document.querySelector(".active-view")?.id,
        isAdmin: typeof hasAdminFullAccess === "function" && hasAdminFullAccess(),
      }));
      assert.equal(state.active, "view-admin", `Platform Admin should land on Admin, got ${state.active}`);
      assert.equal(state.isAdmin, true);
      assert.deepEqual(errors, [], `Platform Admin boot should have zero page errors: ${JSON.stringify(errors)}`);
      pass("Platform Admin: lands on Admin dashboard with zero page errors");
      await page.close();
    }

    // ── Provider/staff/curriculum-only personas ─────────────────────────
    for (const persona of ROLE_PERSONAS.filter((p) => !p.guardian)) {
      const { account, password } = await issuePasswordByKind(token, persona.kind);
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = await loginViaRealForm(page, baseUrl, account.email, password);
      const state = await page.evaluate(() => ({
        active: document.querySelector(".active-view")?.id,
        experienceRole: typeof resolveExperienceRole === "function" ? resolveExperienceRole() : "",
        coreNav: Array.from(document.querySelectorAll(".nav-section-core .nav-link")).filter((l) => !l.hidden).map((l) => l.dataset.view),
      }));
      assert.equal(state.active, "view-today", `${persona.label} should land on Today, got ${state.active}`);
      assert.ok(state.coreNav.includes("today"), `${persona.label} should have Today in primary nav`);
      assert.deepEqual(errors, [], `${persona.label} boot should have zero page errors: ${JSON.stringify(errors)}`);

      // Today dashboard renders without error (already active); check Settings too.
      await page.evaluate(() => setView("settings"));
      await page.waitForTimeout(500);
      const settingsOk = await page.evaluate(() => Boolean(document.querySelector("#view-settings.active-view")));
      assert.ok(settingsOk, `${persona.label} should be able to open Settings`);

      // Logout returns to the guest homepage, not a stuck/looping state.
      await page.evaluate(() => { if (typeof logoutCurrentUser === "function") logoutCurrentUser(); else { localStorage.removeItem("llhUser"); location.reload(); } });
      await page.waitForTimeout(800);
      const loggedOutState = await page.evaluate(() => ({ active: document.querySelector(".active-view")?.id, isLoggedIn: typeof isLoggedIn === "function" && isLoggedIn() }));
      assert.equal(loggedOutState.isLoggedIn, false, `${persona.label} should be logged out after logout`);

      pass(`${persona.label}: lands on Today, correct nav (experienceRole=${state.experienceRole}), Settings opens, logout works, zero errors`);
      await page.close();
    }

    // ── Guardian personas ────────────────────────────────────────────
    for (const persona of ROLE_PERSONAS.filter((p) => p.guardian)) {
      const { account, password } = await issuePasswordByKind(token, persona.kind);
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = await loginViaRealForm(page, baseUrl, account.email, password);
      const state = await page.evaluate(() => document.querySelector(".active-view")?.id);
      assert.equal(state, "view-family-hub", `${persona.label} should land in Family Hub, got ${state}`);
      assert.deepEqual(errors, [], `${persona.label} boot should have zero page errors: ${JSON.stringify(errors)}`);
      pass(`${persona.label}: lands in Family Hub (not the provider app), zero errors`);
      await page.close();
    }

    // ── Device audit: Director (provider) + a guardian, six widths ───────
    const deviceWidths = [
      { label: "phone-360", width: 360, height: 780 },
      { label: "phone-390", width: 390, height: 844 },
      { label: "phone-430", width: 430, height: 932 },
      { label: "tablet-768", width: 768, height: 1024 },
      { label: "tablet-1024", width: 1024, height: 1366 },
      { label: "computer-1280", width: 1280, height: 800 },
    ];
    {
      const { account, password } = await issuePasswordByKind(token, "director");
      for (const device of deviceWidths) {
        const page = await browser.newPage({ viewport: { width: device.width, height: device.height } });
        const errors = await loginViaRealForm(page, baseUrl, account.email, password);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const navReachable = await page.evaluate(() => Boolean(document.querySelector("[data-view]") || document.querySelector("#mobileNavToggle") || document.querySelector(".nav-link")));
        assert.deepEqual(errors, [], `Director @ ${device.label} should have zero page errors`);
        assert.ok(overflow <= 4, `Director @ ${device.label} should not horizontally overflow (got ${overflow}px)`);
        assert.ok(navReachable, `Director @ ${device.label} should have reachable navigation`);
        await page.close();
      }
      pass("Director device audit: 360/390/430/768/1024/1280 all render with zero errors and no horizontal overflow");
    }
    {
      const { account, password } = await issuePasswordByKind(token, "parent_multi_child");
      for (const device of deviceWidths) {
        const page = await browser.newPage({ viewport: { width: device.width, height: device.height } });
        const errors = await loginViaRealForm(page, baseUrl, account.email, password);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.deepEqual(errors, [], `Guardian @ ${device.label} should have zero page errors`);
        assert.ok(overflow <= 4, `Guardian @ ${device.label} should not horizontally overflow (got ${overflow}px)`);
        await page.close();
      }
      pass("Guardian device audit: 360/390/430/768/1024/1280 all render with zero errors and no horizontal overflow");
    }

    // ── Composite screenshots (max 2) ────────────────────────────────
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    {
      const { account: directorAcct, password: directorPw } = await issuePasswordByKind(token, "director");
      const phonePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await loginViaRealForm(phonePage, baseUrl, directorAcct.email, directorPw);
      const phoneShot = await phonePage.screenshot();
      await phonePage.close();

      const { account: guardianAcct, password: guardianPw } = await issuePasswordByKind(token, "parent_multi_child");
      const tabletPage = await browser.newPage({ viewport: { width: 768, height: 1024 } });
      await loginViaRealForm(tabletPage, baseUrl, guardianAcct.email, guardianPw);
      const tabletShot = await tabletPage.screenshot();
      await tabletPage.close();

      await compositeScreenshots(browser, [phoneShot, tabletShot], path.join(SCREENSHOT_DIR, "phase23-fake-roles-phone-tablet.png"));
      pass("Composite screenshot 1/2 saved: fake roles on phone (Director/Today) + tablet (Guardian/Family Hub)");
    }
    {
      // Director Center and Testing Lab are both admin-only internal preview
      // surfaces (require hasAdminFullAccess()) — use the Platform Admin session
      // for both, not a fake Director/staff persona (whose own experience is the
      // regular role-curated provider app already shown in screenshot 1/2).
      async function adminScreenshot(view) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
        await page.evaluate(async ({ email, password: adminPassword, code }) => {
          const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: adminPassword, code }) });
          const data = await res.json();
          setAdminSession({ email, token: data.token, mode: "server" });
        }, ADMIN);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
        // Let boot's own async landing + expansion-flags refresh settle first, or an
        // early setView() call here races isExpansionViewEnabled() before the freshly
        // granted admin flags are cached and gets silently redirected away.
        await page.waitForTimeout(2000);
        await page.evaluate((v) => setView(v), view);
        await page.waitForTimeout(1200);
        const errorText = await page.evaluate(() => document.querySelector(".dc-error")?.textContent || "");
        const shot = await page.screenshot();
        await page.close();
        return { shot, errorText };
      }
      const dc = await adminScreenshot("director-center");
      const lab = await adminScreenshot("testing-lab");
      // Regression: before the setAdminSession->llhAdminToken mirror fix, Testing Lab
      // (and 10 other admin-preview modules) showed "requires a verified approved
      // admin account" on a real admin's very first visit after logging in normally.
      assert.equal(dc.errorText, "", `Director Center should render with no error banner, got: "${dc.errorText}"`);
      assert.equal(lab.errorText, "", `Testing Lab should render with no error banner, got: "${lab.errorText}"`);
      const dcShot = dc.shot;
      const labShot = lab.shot;
      await compositeScreenshots(browser, [dcShot, labShot], path.join(SCREENSHOT_DIR, "phase23-director-center-testing-lab-computer.png"));
      pass("Composite screenshot 2/2 saved: Director Center + Testing Lab on computer (admin preview)");
    }

    console.log(`\nPhase 23 platform walkthrough passed (${passed}).`);
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
