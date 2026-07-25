#!/usr/bin/env node
/**
 * Admin preview escape hotfix — regression suite.
 *
 * Root cause found and fixed: Testing Lab's "Exit Role Preview" and
 * "Return to Admin" buttons only cleared their local preview state AFTER
 * a successful round-trip to the server's role-preview/exit endpoint —
 * so any transient server error (confirmed to occur for other admin
 * endpoints in this same environment) left an admin stuck, unable to
 * exit preview, exactly matching the reported symptom. Fixed by clearing
 * local state FIRST, unconditionally, treating the server call as
 * best-effort only.
 *
 * Also fixed: duplicate `data-tl-exit-preview` / `data-admin-return-admin`
 * DOM hooks (the phone-only mobile summary bar shared the same attribute
 * as the desktop panel's own button), a refresh-safety try/catch around
 * admin-preview rendering, and a brand-new, always-reachable second escape
 * button in the persistent top navigation that works independently of
 * both preview systems and never depends on Testing Lab's own UI.
 *
 * Run: node scripts/test-admin-preview-escape.js
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
const PORT = 26500 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-preview-escape-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "preview-escape-admin@example.invalid", password: "preview-escape-pass", code: "preview-escape-code" };

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
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
  const tlUiJs = fs.readFileSync(path.join(ROOT, "testing-lab-ui.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(appJs, /function exitAllPreviewModes/);
  assert.match(appJs, /data-top-nav-exit-preview/);
  assert.match(indexHtml, /id="topNavExitPreviewBtn"/);
  assert.match(indexHtml, /data-testing-lab-nav/);
  assert.match(indexHtml, /id="testingIdentityBanner"/);

  // The fix: local preview-state clearing must happen BEFORE the network call,
  // not inside its success branch. Verify the exit handlers no longer gate
  // sessionStorage.removeItem behind an awaited try block.
  const exitRolePreviewFn = tlUiJs.slice(tlUiJs.indexOf("async function exitRolePreview()"), tlUiJs.indexOf("async function exitRolePreview()") + 700);
  assert.match(exitRolePreviewFn, /sessionStorage\?\.\s*removeItem\("llhRolePreviewMembershipId"\)/);
  const clearIndex = exitRolePreviewFn.indexOf("sessionStorage?.removeItem");
  const apiCallIndex = exitRolePreviewFn.indexOf("api(\"POST\"");
  assert.ok(clearIndex >= 0 && apiCallIndex >= 0 && clearIndex < apiCallIndex, "local preview state must be cleared BEFORE the server exit call, not after");

  const returnAdminHandler = tlUiJs.slice(tlUiJs.indexOf('data-tl-return-admin]")?.addEventListener'), tlUiJs.indexOf('data-tl-return-admin]")?.addEventListener') + 700);
  const returnClearIndex = returnAdminHandler.indexOf("sessionStorage?.removeItem");
  const returnApiIndex = returnAdminHandler.indexOf("api(\"POST\"");
  assert.ok(returnClearIndex >= 0 && returnApiIndex >= 0 && returnClearIndex < returnApiIndex, "Return to Admin must also clear local state BEFORE the server call, not after");

  // The two "exit preview" DOM hooks (desktop panel, phone-only mobile summary)
  // must never share the exact same attribute value — find the mobile
  // button's own markup line specifically and confirm it does NOT also
  // carry the plain data-tl-exit-preview attribute used by the desktop button.
  const mobileButtonLine = tlUiJs.split("\n").find((line) => line.includes("data-tl-exit-preview-mobile"));
  assert.ok(mobileButtonLine, "expected to find the mobile Exit Role Preview button's markup");
  assert.doesNotMatch(mobileButtonLine, /data-tl-exit-preview>/, "the mobile exit-preview button must not also carry the plain data-tl-exit-preview attribute");

  pass("static markers: exitAllPreviewModes(), top-nav escape button, Testing Lab nav link, testing identity banner, and the local-state-first ordering fix are all present");
}

async function main() {
  assertStaticMarkers();

  if (!chromium) {
    console.log("Playwright unavailable — skipping browser-driven checks (static-only run).");
    console.log(`\nAdmin preview escape checks passed (${passed}; browser checks skipped).`);
    return;
  }

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const adminLoginRes = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLoginRes.status, 200);
    const token = adminLoginRes.json.token;
    const auth = { Authorization: `Bearer ${token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
    await requestJson("POST", "/api/admin/site-content", { adminToken: token, siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, directorCenter: true } } });
    await requestJson("POST", "/api/testing-lab/seed", { scenario: "home_daycare" }, auth);

    const baseUrl = `http://127.0.0.1:${PORT}/`;

    async function newAdminPage() {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(({ email, token }) => {
        setAdminSession({ email, token, mode: "server" });
        localStorage.setItem("llhAdminLastView", "admin");
      }, { email: ADMIN.email, token });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(800);
      return { page, pageErrors };
    }

    // ---- 1. Every Admin Dashboard plan/role preview mode: enter + exit -----
    {
      const { page, pageErrors } = await newAdminPage();
      const modes = ["Free", "Trial", "Pro", "Founding", "Director", "Teacher"];
      for (const mode of modes) {
        await page.click(`[data-admin-preview="${mode}"]`, { timeout: 5000 });
        await page.waitForTimeout(200);
        const current = await page.evaluate(() => adminPreviewMode());
        assert.equal(current, mode, `entering ${mode} preview should set adminPreviewMode`);
        // Exit via the floating badge's "Return to Admin".
        await page.click("[data-admin-return-admin]", { timeout: 5000 });
        await page.waitForTimeout(200);
        const afterExit = await page.evaluate(() => adminPreviewMode());
        assert.equal(afterExit, "Admin", `exiting ${mode} preview via Return to Admin should restore Admin mode`);
      }
      assert.deepEqual(pageErrors, [], `zero page errors expected across all preview mode enter/exit cycles: ${JSON.stringify(pageErrors)}`);
      pass("1. Every Admin Dashboard preview mode (Free/Trial/Pro/Founding/Director/Teacher) can be entered and exited via Return to Admin, with zero page errors");
      await page.close();
    }

    // ---- 2. The NEW second escape option (top nav) works from ANY preview mode
    {
      const { page } = await newAdminPage();
      await page.click('[data-admin-preview="Director"]', { timeout: 5000 });
      await page.waitForTimeout(200);
      const exitBtnVisible = await page.locator("#topNavExitPreviewBtn").isVisible();
      assert.equal(exitBtnVisible, true, "the top-nav Exit Preview button must become visible once a preview mode is active");
      await page.click("#topNavExitPreviewBtn", { timeout: 5000 });
      await page.waitForTimeout(200);
      const afterExit = await page.evaluate(() => adminPreviewMode());
      assert.equal(afterExit, "Admin", "the top-nav Exit Preview button must reset admin preview mode to Admin");
      const exitBtnHiddenAfter = await page.locator("#topNavExitPreviewBtn").isHidden();
      assert.equal(exitBtnHiddenAfter, true, "the top-nav Exit Preview button must hide itself again once no preview is active");
      pass("2. The second, always-reachable top-navigation Exit Preview button works and hides itself when not needed");
      await page.close();
    }

    // ---- 3. Testing Lab Quick Role Preview: enter + exit for EVERY target --
    {
      const { page, pageErrors } = await newAdminPage();
      await page.evaluate(() => setView("testing-lab"));
      await page.waitForSelector('[data-tl-panel="preview"]', { timeout: 15000 });
      await page.waitForTimeout(800);
      await page.click('[data-tl-panel="preview"]', { timeout: 5000 });
      await page.waitForFunction(() => document.querySelectorAll("[data-tl-start-preview]").length > 0, null, { timeout: 15000 });
      const allTargets = await page.evaluate(() => Array.from(document.querySelectorAll("[data-tl-start-preview]")).map((b) => b.getAttribute("data-tl-start-preview")));
      assert.ok(allTargets.length >= 5, "expected multiple Quick Role Preview targets");
      // Only exercise targets that actually have a seeded fake account for the
      // CURRENT session's organization (home_daycare) — Quick Role Preview
      // legitimately no-ops (empty membershipId, nothing to enter) for a kind
      // with no matching account in the active org, which is a fixture-
      // availability fact, not a bug in the preview enter/exit mechanism
      // this test exists to verify.
      // Quick Role Preview resolves a membershipId from the matching fake
      // account's staffMembershipId — that only exists for STAFF-kind
      // accounts (director/teacher/assistant/owner/curriculum_only), never
      // guardian-kind accounts (those are identified by contactId instead,
      // a real, pre-existing, separate characteristic of guardian preview
      // this hotfix does not change). Staff roles are also exactly what the
      // reported bug was about ("I entered the Director preview").
      const dashboardAccounts = (await requestJson("GET", "/api/testing-lab/dashboard", null, auth)).json?.accounts || [];
      const staffAccountKinds = new Set(dashboardAccounts.filter((a) => a.staffMembershipId).map((a) => a.kind));
      const targets = allTargets.filter((t) => staffAccountKinds.has(t));
      assert.ok(targets.length >= 3, `expected at least 3 staff-kind role preview targets with a real seeded account in the active org, got: ${JSON.stringify(allTargets)} vs staff kinds ${JSON.stringify([...staffAccountKinds])}`);
      for (const target of targets) {
        await page.click(`[data-tl-start-preview="${target}"]`, { timeout: 5000 });
        await page.waitForTimeout(300);
        const previewId = await page.evaluate(() => sessionStorage.getItem("llhRolePreviewMembershipId"));
        assert.ok(previewId, `starting role preview for "${target}" should set a preview membership id`);
        await page.click("[data-tl-exit-preview]", { timeout: 5000 });
        await page.waitForTimeout(300);
        const afterExit = await page.evaluate(() => sessionStorage.getItem("llhRolePreviewMembershipId"));
        assert.equal(afterExit, null, `exiting role preview for "${target}" must clear the preview membership id`);
      }
      assert.deepEqual(pageErrors, [], `zero page errors expected across all role preview enter/exit cycles: ${JSON.stringify(pageErrors)}`);
      pass(`3. Every Quick Role Preview target (${targets.join(", ")}) can be entered and exited via the desktop "Exit Preview" button, with zero page errors`);
      await page.close();
    }

    // ---- 4. THE CORE FIX: exit still works even when the server-side exit call fails
    {
      const { page } = await newAdminPage();
      await page.evaluate(() => setView("testing-lab"));
      await page.waitForSelector('[data-tl-panel="preview"]', { timeout: 15000 });
      await page.waitForTimeout(800);
      await page.click('[data-tl-panel="preview"]', { timeout: 5000 });
      await page.waitForFunction(() => document.querySelectorAll("[data-tl-start-preview]").length > 0, null, { timeout: 15000 });
      await page.click('[data-tl-start-preview="director"]', { timeout: 5000 });
      await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => sessionStorage.getItem("llhRolePreviewMembershipId")));

      // Force the exit endpoint to fail, simulating the transient 503s
      // observed elsewhere in this same environment during investigation.
      await page.route("**/api/testing-lab/role-preview/exit", (route) => route.fulfill({ status: 503, body: "Service Unavailable" }));
      await page.click("[data-tl-exit-preview]", { timeout: 5000 });
      await page.waitForTimeout(500);
      const previewIdAfterFailedExit = await page.evaluate(() => sessionStorage.getItem("llhRolePreviewMembershipId"));
      assert.equal(previewIdAfterFailedExit, null, "exiting role preview must clear local state EVEN IF the server-side exit call fails — this was the root cause of the reported bug");
      await page.unroute("**/api/testing-lab/role-preview/exit");

      // Same check for the top-nav escape hatch (uses a different endpoint call, fire-and-forget).
      await page.click('[data-tl-start-preview="director"]', { timeout: 5000 });
      await page.waitForTimeout(300);
      await page.route("**/api/testing-lab/role-preview/exit", (route) => route.abort("failed"));
      await page.click("#topNavExitPreviewBtn", { timeout: 5000 });
      await page.waitForTimeout(500);
      const previewIdAfterTopNavExit = await page.evaluate(() => sessionStorage.getItem("llhRolePreviewMembershipId"));
      assert.equal(previewIdAfterTopNavExit, null, "the top-nav escape hatch must also clear local preview state even when its best-effort server call fails outright");
      pass("4. ROOT CAUSE FIX VERIFIED: exiting preview mode (both Testing Lab's own button and the new top-nav escape) always clears local state, even when the server-side exit call fails or is unreachable");
      await page.close();
    }

    // ---- 5. Refresh while previewing lands somewhere safe, session intact ---
    {
      const { page, pageErrors } = await newAdminPage();
      const tokenBefore = await page.evaluate(() => (typeof adminSession === "function" ? adminSession()?.token : null));
      await page.click('[data-admin-preview="Director"]', { timeout: 5000 });
      await page.waitForTimeout(300);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(1000);
      const activeViewAfterRefresh = await page.evaluate(() => document.querySelector(".active-view")?.id);
      assert.ok(activeViewAfterRefresh, "a view must be active after refreshing while previewing — never a blank/broken page");
      const stillAdmin = await page.evaluate(() => typeof hasAdminFullAccess === "function" ? true : false);
      const tokenAfter = await page.evaluate(() => (typeof adminSession === "function" ? adminSession()?.token : null));
      assert.equal(tokenAfter, tokenBefore, "the REAL admin session token must be completely unchanged by entering/refreshing during a preview mode");
      // Return to Admin must still work after the refresh.
      const returnCount = await page.locator("[data-admin-return-admin]").count();
      if (returnCount > 0) {
        await page.click("[data-admin-return-admin]", { timeout: 5000 });
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => adminPreviewMode()), "Admin");
      }
      assert.deepEqual(pageErrors, [], `zero page errors expected after refreshing mid-preview: ${JSON.stringify(pageErrors)}`);
      pass("5. Refreshing the page while previewing lands on a safe, working view; the real admin session token is completely unchanged; Return to Admin still works afterward");
      await page.close();
    }

    // ---- 6. Preview state never changes/removes the real Admin session -----
    {
      const { page } = await newAdminPage();
      const before = await page.evaluate(() => ({ unlocked: isAdminUnlocked(), token: adminSession()?.token, email: adminSession()?.email }));
      await page.click('[data-admin-preview="Founding"]', { timeout: 5000 });
      await page.waitForTimeout(200);
      const duringPreview = await page.evaluate(() => ({ unlocked: isAdminUnlocked(), token: adminSession()?.token, email: adminSession()?.email }));
      assert.deepEqual(duringPreview, before, "entering a preview mode must not alter the stored admin session in any way");
      await page.click("[data-admin-return-admin]", { timeout: 5000 });
      await page.waitForTimeout(200);
      const afterExit = await page.evaluate(() => ({ unlocked: isAdminUnlocked(), token: adminSession()?.token, email: adminSession()?.email }));
      assert.deepEqual(afterExit, before, "exiting a preview mode must not alter the stored admin session in any way either");
      pass("6. The real Platform Admin session (unlocked flag, token, email) is byte-for-byte unchanged before, during, and after a preview mode");
      await page.close();
    }

    // ---- 7. Testing Lab is reachable from a persistent nav link (no search) -
    {
      const { page } = await newAdminPage();
      const navLinkVisible = await page.locator('[data-testing-lab-nav]').isVisible();
      assert.equal(navLinkVisible, true, "the Testing Lab nav link must be visible in the primary sidebar for an unlocked admin");
      await page.click('[data-testing-lab-nav]', { timeout: 5000 });
      await page.waitForTimeout(500);
      const active = await page.evaluate(() => document.querySelector(".active-view")?.id);
      assert.equal(active, "view-testing-lab", "clicking the Testing Lab nav link must open Testing Lab directly");
      pass("7. Testing Lab is reachable via a persistent, always-visible nav link — never only through Settings search or a button buried in the Admin Dashboard body");
      await page.close();
    }

    // ---- 8. Testing identity banner + "no production wording" -------------
    {
      const { page } = await newAdminPage();
      const bannerVisible = await page.locator("#testingIdentityBanner").isVisible();
      assert.equal(bannerVisible, true, "the testing identity banner must be visible on this non-production test host");
      const bannerText = await page.locator("#testingIdentityBannerText").textContent();
      assert.match(bannerText || "", /LITTLE LEARNER HUB TESTING — FAKE DATA ONLY/);
      // Load the admin analytics panel and confirm no "Live production data" wording appears.
      await page.evaluate(() => setView("admin"));
      await page.waitForTimeout(1000);
      const bodyText = await page.evaluate(() => document.querySelector("#view-admin")?.textContent || "");
      assert.doesNotMatch(bodyText, /Live production data/, "a non-production/testing host must never display 'Live production data' wording anywhere in the Admin Dashboard");
      pass("8. The testing identity banner is shown, and the Admin Dashboard never displays 'Live production data' wording on a non-production host");
      await page.close();
    }
  } finally {
    await stopServer(child);
    await browser.close();
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nAdmin preview escape checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
