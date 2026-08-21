#!/usr/bin/env node
/**
 * Flash Referral Deal — desktop/mobile UX, Contact prefill, owner toggle.
 * Banner + manual verification only. Does not touch Stripe or billing.
 * Run: npm run test:flash-referral-banner-ux
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19480 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-flash-referral-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "flash-referral-qa@test.local",
  password: "flash-referral-qa-pass",
  code: "flash-referral-qa-code",
};

function requestJson(method, urlPath, body, headers = {}) {
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
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
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

async function launchBrowser(playwright) {
  try {
    return await playwright.chromium.launch({ headless: true });
  } catch {
    return playwright.chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
}

async function measureBanner(page) {
  return page.evaluate(() => {
    const banner = document.querySelector("#llhFlashReferralBanner");
    const nav = document.querySelector(".llh-public-nav");
    const cta = document.querySelector("[data-flash-referral-cta]");
    const home = document.querySelector("#view-home");
    const bannerRect = banner?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const ctaRect = cta?.getBoundingClientRect();
    return {
      homeActive: Boolean(home?.classList.contains("active-view")),
      hidden: Boolean(banner?.hidden),
      display: banner ? getComputedStyle(banner).display : "",
      bannerBottom: bannerRect ? bannerRect.bottom : 0,
      navTop: navRect ? navRect.top : 0,
      overlapsNav: Boolean(bannerRect && navRect && bannerRect.bottom > navRect.top + 1 && bannerRect.top < navRect.bottom - 1),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      ctaHeight: ctaRect ? ctaRect.height : 0,
      ctaWidth: ctaRect ? ctaRect.width : 0,
      howOpen: Boolean(document.querySelector(".llh-flash-referral-how")?.open),
    };
  });
}

async function runViewport(playwright, baseUrl, viewport, label) {
  const browser = await launchBrowser(playwright);
  const page = await browser.newPage({ viewport });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof window.setView === "function", null, { timeout: 45000 });
    await page.waitForSelector("#llhFlashReferralBanner", { timeout: 10000 });

    const initial = await measureBanner(page);
    assert.equal(initial.homeActive, true, `${label}: homepage should be active`);
    assert.equal(initial.hidden, false, `${label}: banner should be visible by default`);
    assert.notEqual(initial.display, "none", `${label}: banner should not be display:none`);
    assert.equal(initial.overlapsNav, false, `${label}: banner must not overlap public nav`);
    assert.ok(initial.bannerBottom <= initial.navTop + 1, `${label}: banner should sit above nav in document flow`);
    assert.ok(initial.scrollWidth <= initial.clientWidth + 1, `${label}: no horizontal overflow`);
    assert.ok(initial.ctaHeight >= 44, `${label}: Refer & Save tap target height ${initial.ctaHeight}`);
    if (label === "mobile") {
      assert.ok(initial.ctaWidth >= 44, `${label}: Refer & Save tap target width ${initial.ctaWidth}`);
    }

    await page.locator(".llh-flash-referral-how summary").click();
    const expanded = await measureBanner(page);
    assert.equal(expanded.howOpen, true, `${label}: How it works should expand`);
    assert.equal(expanded.overlapsNav, false, `${label}: expanded How it works must stay in document flow`);
    assert.ok(expanded.scrollWidth <= expanded.clientWidth + 1, `${label}: expanded content must not overflow`);

    await page.locator(".llh-flash-referral-how summary").click();
    const collapsed = await measureBanner(page);
    assert.equal(collapsed.howOpen, false, `${label}: How it works should collapse`);

    await page.locator("[data-flash-referral-cta]").click();
    await page.waitForFunction(() => document.querySelector("#view-contact")?.classList.contains("active-view"), null, { timeout: 10000 });
    const contact = await page.evaluate(() => {
      const form = document.querySelector("#contactSupportForm");
      const hint = document.querySelector("#flashReferralContactHint");
      const homeBanner = document.querySelector("#llhFlashReferralBanner");
      const home = document.querySelector("#view-home");
      return {
        contactActive: Boolean(document.querySelector("#view-contact")?.classList.contains("active-view")),
        homeActive: Boolean(home?.classList.contains("active-view")),
        bannerInActiveHome: Boolean(home?.classList.contains("active-view") && homeBanner && !homeBanner.hidden),
        hintHidden: Boolean(hint?.hidden),
        hintText: hint?.textContent || "",
        topic: form?.querySelector("select[name='topic']")?.value || "",
        message: form?.querySelector("textarea[name='message']")?.value || "",
      };
    });
    assert.equal(contact.contactActive, true, `${label}: Contact page should load`);
    assert.equal(contact.homeActive, false, `${label}: homepage should not stay active`);
    assert.equal(contact.hintHidden, false, `${label}: referral instruction should be visible on Contact`);
    assert.match(contact.hintText, /name or email of the person you referred/i);
    assert.match(contact.hintText, /manually after owner verification/i);
    assert.equal(contact.topic, "General Questions", `${label}: topic should use existing General Questions option`);
    assert.match(contact.message, /Referred person's name or email/i);
    assert.doesNotMatch(contact.message, /automatic|instant credit|Stripe discount/i);

    await page.evaluate(() => setView("home"));
    await page.waitForFunction(() => document.querySelector("#view-home")?.classList.contains("active-view"), null, { timeout: 10000 });
    await page.evaluate(() => {
      if (typeof openAuthModal === "function") openAuthModal("login");
    });
    await page.waitForSelector("#authModal.open", { timeout: 8000 });
    const loginHidden = await page.evaluate(() => {
      const banner = document.querySelector("#llhFlashReferralBanner");
      return banner ? getComputedStyle(banner).display === "none" : true;
    });
    assert.equal(loginHidden, true, `${label}: banner hides when login is open`);
    await page.evaluate(() => { if (typeof closeAuthModal === "function") closeAuthModal(); });
    await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 }).catch(() => {});

    await page.evaluate(() => {
      if (typeof openAuthModal === "function") openAuthModal("signup");
    });
    await page.waitForSelector("#authModal.open", { timeout: 8000 });
    const signupHidden = await page.evaluate(() => {
      const banner = document.querySelector("#llhFlashReferralBanner");
      return banner ? getComputedStyle(banner).display === "none" : true;
    });
    assert.equal(signupHidden, true, `${label}: banner hides when signup is open`);
    await page.evaluate(() => { if (typeof closeAuthModal === "function") closeAuthModal(); });

    await page.evaluate(() => setView("faq"));
    await page.waitForFunction(() => document.querySelector("#view-faq")?.classList.contains("active-view"), null, { timeout: 10000 });
    const otherView = await page.evaluate(() => {
      const home = document.querySelector("#view-home");
      const banner = document.querySelector("#llhFlashReferralBanner");
      return {
        homeActive: Boolean(home?.classList.contains("active-view")),
        homeDisplay: home ? getComputedStyle(home).display : "",
        bannerDisplay: banner ? getComputedStyle(banner).display : "",
      };
    });
    assert.equal(otherView.homeActive, false, `${label}: homepage inactive on FAQ`);
    assert.equal(otherView.homeDisplay, "none", `${label}: homepage (and banner) hidden on other views`);

    console.log(`PASS ${label} banner UX`);
  } finally {
    await browser.close();
  }
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required for flash referral UX test");
    process.exit(1);
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    const publicBefore = await requestJson("GET", "/api/site-content");
    assert.equal(publicBefore.status, 200, "public site-content should load");
    assert.equal(publicBefore.json.siteContent.flashReferralBannerEnabled, true, "flag defaults ON");

    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert.equal(login.status, 200, `admin login failed: ${login.status}`);
    const token = login.json.token;
    const adminHeaders = { Authorization: `Bearer ${token}` };

    const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert.equal(boot.status, 200, "admin site-content should load");
    const beforeAnnouncement = JSON.stringify(boot.json.siteContent.announcement || {});
    assert.equal(boot.json.siteContent.flashReferralBannerEnabled, true, "admin flag defaults ON");

    const off = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...boot.json.siteContent,
        flashReferralBannerEnabled: false,
        updatedAt: boot.json.siteContent.updatedAt || "",
      },
    }, adminHeaders);
    assert.equal(off.status, 200, `save off failed: ${off.status} ${off.json?.error || ""}`);
    assert.equal(off.json.siteContent.flashReferralBannerEnabled, false, "save persists false");
    assert.equal(JSON.stringify(off.json.siteContent.announcement || {}), beforeAnnouncement, "unrelated announcement settings must not change");

    const publicOff = await requestJson("GET", "/api/site-content");
    assert.equal(publicOff.json.siteContent.flashReferralBannerEnabled, false, "public payload stays off after save");

    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert.equal(reload.json.siteContent.flashReferralBannerEnabled, false, "refresh keeps it off");

    const baseUrl = `http://127.0.0.1:${PORT}`;
    const browser = await launchBrowser(playwright);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForFunction(() => typeof window.renderManagedAnnouncementBanner === "function", null, { timeout: 45000 });
    } catch (error) {
      const title = await page.title().catch(() => "");
      const ready = await page.evaluate(() => document.readyState).catch(() => "");
      throw new Error(`app.js did not boot (${title} readyState=${ready}): ${error.message}`);
    }
    await page.waitForFunction(() => {
      const site = typeof effectiveSiteContent === "function" ? effectiveSiteContent() : null;
      return site && site.flashReferralBannerEnabled === false;
    }, null, { timeout: 20000 });
    const hiddenOff = await page.evaluate(() => Boolean(document.querySelector("#llhFlashReferralBanner")?.hidden));
    assert.equal(hiddenOff, true, "homepage banner hides when owner turns the flag off");
    await browser.close();

    const on = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...reload.json.siteContent,
        flashReferralBannerEnabled: true,
        updatedAt: reload.json.siteContent.updatedAt || "",
      },
    }, adminHeaders);
    assert.equal(on.status, 200, `save on failed: ${on.status}`);
    assert.equal(on.json.siteContent.flashReferralBannerEnabled, true, "turning it back on works");
    assert.equal(JSON.stringify(on.json.siteContent.announcement || {}), beforeAnnouncement, "announcement still unchanged after re-enable");

    console.log("PASS owner toggle persistence");

    await runViewport(playwright, baseUrl, { width: 1280, height: 900 }, "desktop");
    await runViewport(playwright, baseUrl, { width: 390, height: 844 }, "mobile");

    const adminView = await launchBrowser(playwright);
    const adminPage = await adminView.newPage({ viewport: { width: 1280, height: 900 } });
    await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await adminPage.waitForFunction(() => typeof window.setView === "function", null, { timeout: 45000 });
    await adminPage.evaluate((creds) => {
      try {
        localStorage.setItem("llhAdminSession", JSON.stringify({
          email: creds.email,
          token: creds.token,
          unlocked: true,
        }));
      } catch { /* ignore */ }
    }, { email: ADMIN.email, token });
    await adminPage.evaluate(() => setView("admin", { allowAdminForLinkedStaff: true, skipAccessRedirect: true }));
    await adminPage.waitForTimeout(500);
    const adminHidden = await adminPage.evaluate(() => {
      const banner = document.querySelector("#llhFlashReferralBanner");
      const adminActive = Boolean(document.querySelector("#view-admin")?.classList.contains("active-view"));
      return {
        adminActive,
        bannerHiddenByCss: banner ? getComputedStyle(banner).display === "none" : true,
        homeActive: Boolean(document.querySelector("#view-home")?.classList.contains("active-view")),
      };
    });
    assert.equal(adminHidden.adminActive || adminHidden.homeActive === false, true, "Admin workspace is not the public homepage");
    assert.equal(adminHidden.bannerHiddenByCss || adminHidden.homeActive === false, true, "banner does not appear in Admin");
    await adminView.close();
    console.log("PASS admin workspace hides promotional banner");
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
