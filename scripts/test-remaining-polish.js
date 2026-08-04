#!/usr/bin/env node
/**
 * Remaining provider polish — skeletons, banner stacking, brand chrome,
 * Child Profiles heading cleanup, Messages loading, shell cache.
 * Run: npm run test:remaining-polish
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
const SHELL = "20260804-remaining-polish-r1";
const PORT = 19810 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-remaining-polish-${crypto.randomBytes(4).toString("hex")}.json`);

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitBoot(child) {
  for (let i = 0; i < 160; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("boot timeout");
}

function staticChecks() {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const msg = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "llh-shell-manifest.json"), "utf8"));

  assert.match(app, /function llhSkeletonHtml/);
  assert.match(app, /suppressMetaCookieNoticeForBannerStack/);
  assert.match(app, /child-page-header--actions-only/);
  assert.match(app, /llhSkeletonHtml\(\{ rows: 5, label: "Loading your messages/);
  assert.doesNotMatch(app, /<h2>Children<\/h2>/);
  assert.match(css, /\.llh-skeleton-bar/);
  assert.match(css, /\.nav-icon[\s\S]*var\(--llh-primary/);
  assert.match(css, /\.doc-helpers-child-picker select[\s\S]*max-width:\s*min\(100%,\s*420px\)/);
  assert.match(css, /curriculum-activity-viewer \.curriculum-activity-card/);
  assert.match(msg, /admin-conversations-layout[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(indexHtml, new RegExp(`SHELL_VERSION = "${SHELL}"`));
  assert.match(sw, new RegExp(`SHELL_VERSION = "${SHELL}"`));
  assert.equal(manifest.version, SHELL);
  console.log("PASS static remaining polish markers");
}

async function browserChecks() {
  fs.writeFileSync(STORE, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    await waitBoot(child);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => typeof llhSkeletonHtml === "function" && typeof openAuthModal === "function", null, { timeout: 60000 });

    const skeleton = await page.evaluate(() => llhSkeletonHtml({ rows: 3, label: "Loading…", variant: "calendar" }));
    assert.match(skeleton, /llh-skeleton--calendar/);
    assert.match(skeleton, /llh-loading-spinner/);

    // Seed a logged-in Free member so member-update banner can show and suppress cookie.
    await page.evaluate(() => {
      localStorage.removeItem("llhMetaCookieNoticeDismissed");
      localStorage.removeItem("llhMemberUpdateBannerDismissedAt");
      const email = "polish-provider@example.com";
      const account = {
        email,
        plan: "Free",
        firstName: "Pat",
        lastName: "Provider",
        name: "Pat Provider",
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({ [email]: account }));
      document.body.classList.add("user-authenticated");
      if (typeof loadAccountState === "function") loadAccountState(email);
      if (typeof refreshMemberUpdateBanner === "function") refreshMemberUpdateBanner();
      if (typeof ensureMetaCookieNotice === "function") ensureMetaCookieNotice();
    });
    await page.waitForTimeout(200);
    const stack = await page.evaluate(() => {
      const member = document.querySelector("#memberUpdateBanner");
      const cookie = document.getElementById("llhMetaCookieNotice");
      return {
        memberVisible: Boolean(member && !member.hidden),
        cookieVisible: Boolean(cookie && !cookie.hidden && cookie.style.display !== "none"),
        navIconColor: getComputedStyle(document.querySelector(".nav-icon") || document.documentElement).color,
      };
    });
    if (stack.memberVisible) {
      assert.equal(stack.cookieVisible, false, "cookie must not stack with member update banner");
    }

    // Children list: no duplicate Children h2
    await page.evaluate(() => {
      if (typeof setView === "function") setView("children");
      if (typeof renderChildManagement === "function") renderChildManagement();
    });
    await page.waitForTimeout(150);
    const childrenHeadings = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll("#view-children h2")).map((el) => (el.textContent || "").trim());
      return titles;
    });
    assert.ok(childrenHeadings.includes("Child Profiles"), "Child Profiles heading present");
    assert.ok(!childrenHeadings.includes("Children"), "duplicate Children heading removed");

    // Nav icon uses lavender, not legacy soft blue
    const iconRgb = await page.evaluate(() => {
      const icon = document.querySelector(".nav-link:not(.active) .nav-icon");
      return icon ? getComputedStyle(icon).color : "";
    });
    assert.ok(iconRgb.includes("123") || iconRgb.includes("7b") || /rgb\(\s*123,\s*107,\s*181\s*\)/i.test(iconRgb), `nav icon should be lavender, got ${iconRgb}`);

    console.log("PASS browser remaining polish checks");
    await context.close();
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

async function main() {
  staticChecks();
  await browserChecks();
  console.log("All remaining polish checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
