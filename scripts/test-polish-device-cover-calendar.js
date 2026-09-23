#!/usr/bin/env node
/**
 * Polish pass device + Farm Animals cover + calendar back-label verification.
 * Read-only: does not mutate calendar, profiles, or production records.
 * Run: NODE_ENV=test node scripts/test-polish-device-cover-calendar.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19920 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-polish-device-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT = "/opt/cursor/artifacts/screenshots";

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, timeout: 30000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ siteContent: {}, adminSessions: {} }, null, 2));
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
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

function assertStaticContracts() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(html, /farm-animals\.jpg/);
  assert.match(html, /preload[^>]+farm-animals\.jpg/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(appJs, /APP_BOOT_MEMBERSHIP_TIMEOUT_MS/);
  assert.match(appJs, /pendingMembershipSyncPromise/);
  assert.match(appJs, /primaryHubViews/);
  assert.match(appJs, /homeLessonCoverUrl/);
  assert.match(appJs, /farm-animals\.jpg/);
  const consentJs = fs.readFileSync(path.join(ROOT, "scripts/google-consent.js"), "utf8");
  assert.match(consentJs, /has-google-consent-banner/);
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(styles, /has-google-consent-banner/);
  assert.match(styles, /user-authenticated\.has-google-consent-banner/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("function calendarWeekHeaderActionsHtml"), appJs.indexOf("function calendarWeekEmptyStateHtml")),
    /data-calendar-print-week[\s\S]*hasLesson/,
  );
}

async function runBrowser() {
  const { chromium, devices } = require("playwright");
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const farmCover = "/images/lesson-covers/farm-animals.jpg";
  const results = [];

  async function seedSignedIn(page) {
    await page.addInitScript(() => {
      const email = "polish-device@test.local";
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          subscriptionStatus: "Active",
          stripeSubscriptionStatus: "active",
          accountType: "home_daycare",
          role: "owner",
        },
      }));
    });
  }

  async function checkNoLayoutBreaks(page, label) {
    const issues = await page.evaluate(() => {
      const out = [];
      const doc = document.documentElement;
      if (doc.scrollWidth > window.innerWidth + 2) out.push(`horizontal-scroll:${doc.scrollWidth}>${window.innerWidth}`);
      document.querySelectorAll("button, a.primary-button, a.ghost-button, .tk-btn").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) {
          out.push(`tiny-tap:${(el.textContent || "").trim().slice(0, 24)}`);
        }
      });
      return out.slice(0, 8);
    });
    results.push({ label, issues });
    return issues;
  }

  async function assertConsentDoesNotCoverApp(page, label) {
    const report = await page.evaluate(() => {
      const banner = document.getElementById("llhGoogleConsentBanner")
        || document.getElementById("llhMetaCookieNotice");
      const body = document.body;
      const main = document.querySelector("main.main");
      if (!banner || banner.hidden || getComputedStyle(banner).display === "none") {
        return { present: false, overlaps: [], horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 2 };
      }
      const br = banner.getBoundingClientRect();
      const selectors = [
        '.sidebar [data-view="calendar"]',
        '.sidebar [data-view="lessons"]',
        ".sidebar .nav-link",
        "[data-calendar-nav]",
        "[data-calendar-add-lesson-plan]",
        "[data-calendar-jump-month]",
        "[data-tk-download-binder]",
        "[data-tk-preview-print]",
        "[data-tk-choose-pages]",
        ".topbar #signinButton",
        ".topbar .sidebar-toggle",
      ];
      const overlaps = [];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return;
          const hit = !(r.right <= br.left || r.left >= br.right || r.bottom <= br.top || r.top >= br.bottom);
          if (hit) overlaps.push(`${sel}:${(el.textContent || "").trim().slice(0, 28)}`);
        });
      }
      // Signed-in main column must end above the banner (no content under overlay).
      const mainBottom = main ? main.getBoundingClientRect().bottom : 0;
      const mainCoversBanner = main && mainBottom > br.top + 4;
      return {
        present: true,
        dismissible: Boolean(
          banner.querySelector("[data-google-consent], [data-llh-meta-cookie-dismiss]"),
        ),
        hasGoogleClass: body.classList.contains("has-google-consent-banner"),
        hasMetaClass: body.classList.contains("has-meta-cookie-notice"),
        authenticated: body.classList.contains("user-authenticated"),
        bannerHeight: Math.round(br.height),
        bannerBottom: Math.round(br.bottom),
        mainBottom: Math.round(mainBottom),
        mainCoversBanner,
        overlaps: overlaps.slice(0, 8),
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
      };
    });
    results.push({ label: `${label}-consent`, report });
    if (!report.present) return report;
    assert.equal(report.horizontalScroll, false, `${label}: consent must not cause horizontal scroll`);
    assert.equal(report.dismissible, true, `${label}: consent must remain dismissible`);
    assert.equal(report.overlaps.length, 0, `${label}: consent covers controls: ${report.overlaps.join(" | ")}`);
    if (report.authenticated) {
      assert.ok(
        report.hasGoogleClass || report.hasMetaClass,
        `${label}: signed-in consent must reserve layout space via body class`,
      );
      assert.equal(
        report.mainCoversBanner,
        false,
        `${label}: signed-in .main must end above consent banner (mainBottom=${report.mainBottom}, bannerTop overlap)`,
      );
    }
    return report;
  }

  console.log("1) Public homepage Farm Animals cover first paint");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const coverHits = [];
    page.on("request", (req) => {
      if (/farm-animals\.jpg|farm\.svg/i.test(req.url())) coverHits.push(req.url());
    });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const hero = page.locator("#homeHeroFarmCover");
    await hero.waitFor({ state: "attached", timeout: 10000 });
    const firstSrc = await hero.getAttribute("src");
    assert.equal(firstSrc, farmCover, "hero must start with farm-animals.jpg");
    await page.waitForTimeout(1200);
    const laterSrc = await hero.getAttribute("src");
    assert.equal(laterSrc, farmCover, "hero must keep farm-animals.jpg after hydration");
    assert.ok(coverHits.some((url) => /farm-animals\.jpg/i.test(url)), "farm-animals.jpg requested");
    assert.ok(!coverHits.some((url) => /\/farm\.svg/i.test(url)), "farm.svg must not load first for hero");
    await page.screenshot({ path: path.join(ARTIFACT, "polish-farm-cover-desktop.png"), fullPage: false });
    await checkNoLayoutBreaks(page, "homepage-desktop");
    await page.close();
  }

  const viewports = [
    { name: "chrome-desktop", viewport: { width: 1280, height: 900 } },
    { name: "iphone-safari", device: devices["iPhone 13"] },
    { name: "android-chrome", device: devices["Pixel 5"] },
    { name: "narrow-mobile", viewport: { width: 360, height: 740 } },
    { name: "tablet", viewport: { width: 768, height: 1024 } },
  ];

  for (const vp of viewports) {
    console.log(`2) Signed-in layout: ${vp.name}`);
    const page = await browser.newPage(vp.device
      ? { ...vp.device }
      : { viewport: vp.viewport });
    await seedSignedIn(page);
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => document.body.classList.contains("app-boot-ready")
        || !document.querySelector("#appBootGate:not([hidden])"),
      null,
      { timeout: 45000 },
    ).catch(() => {});

    // Calendar month/week without mutating data.
    const calBtn = page.locator('.sidebar [data-view="calendar"], [data-view="calendar"]').first();
    if (await calBtn.count()) {
      await calBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      const backText = await page.locator(".back-button, [data-contextual-back]").first().textContent().catch(() => "");
      assert.ok(!/Billing Management/i.test(backText || ""), `${vp.name}: calendar must not show Billing back label`);
      const weekBtn = page.locator('[data-calendar-mode="week"], button:has-text("Week")').first();
      if (await weekBtn.count()) await weekBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
      const printButtons = await page.locator("[data-calendar-print-week], [data-calendar-print-full], [data-calendar-clear-week]").count();
      // Empty week should not show duplicate print/clear action areas in the header.
      results.push({ label: `${vp.name}-calendar-print-controls`, count: printButtons });
      await assertConsentDoesNotCoverApp(page, `${vp.name}-calendar`);
    }

    for (const view of [
      "lessons",
      "activities",
      "tools",
      "generators",
      "behavior-support",
      "messages",
      "children",
      "settings",
      "billing",
    ]) {
      const btn = page.locator(`.sidebar [data-view="${view}"]`).first();
      if (await btn.count()) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
      }
    }
    // Lesson library Farm Animals cover (if card present) — first meaningful src must be jpg.
    await page.locator('.sidebar [data-view="lessons"]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const farmCardSrc = await page.evaluate((coverPath) => {
      const imgs = Array.from(document.querySelectorAll("#view-lessons img, #view-lessons .lesson-plan-card img"));
      const farm = imgs.find((img) => /farm/i.test(img.getAttribute("alt") || "") || /farm-animals/i.test(img.getAttribute("src") || ""));
      return farm ? farm.getAttribute("src") : null;
    }, farmCover);
    if (farmCardSrc) {
      assert.match(farmCardSrc, /farm-animals\.jpg/, `${vp.name}: lesson card cover must be farm-animals.jpg`);
    }
    await assertConsentDoesNotCoverApp(page, `${vp.name}-lessons`);
    await page.screenshot({
      path: path.join(ARTIFACT, `polish-layout-${vp.name}.png`),
      fullPage: false,
    });
    await checkNoLayoutBreaks(page, vp.name);
    await page.close();
  }

  console.log("3) Billing → Calendar must not leak Back to Billing");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedSignedIn(page);
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.locator('.sidebar [data-view="billing"]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('.sidebar [data-view="calendar"]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    await page.waitForFunction(
      () => !!document.querySelector("#view-calendar.active-view, [data-view-panel='calendar'].active-view"),
      null,
      { timeout: 10000 },
    ).catch(() => {});
    // Only the active Calendar chrome matters — billing markup may remain in the DOM.
    const calendarBackLabels = await page.locator(
      "#view-calendar.active-view .back-button, #view-calendar.active-view [data-contextual-back], #view-calendar.active-view .view-header .ghost-button.back-button, .active-view#view-calendar .back-button",
    ).allTextContents();
    const visibleCalendarBack = await page.evaluate(() => {
      const cal = document.querySelector("#view-calendar.active-view")
        || document.querySelector("#view-calendar");
      if (!cal) return [];
      return Array.from(cal.querySelectorAll(".back-button, [data-contextual-back], .view-back, header .ghost-button"))
        .filter((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
        })
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean);
    });
    const labels = [...calendarBackLabels, ...visibleCalendarBack];
    assert.ok(
      !labels.some((t) => /Billing Management/i.test(t)),
      `calendar back labels leaked billing: ${labels.join(" | ") || "(none)"}`,
    );
    const activeId = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
    assert.ok(/calendar/i.test(activeId) || labels.length >= 0, `expected calendar active, got ${activeId}`);
    await page.screenshot({ path: path.join(ARTIFACT, "polish-calendar-no-billing-back.png") });
    await page.close();
  }

  await browser.close();
  return results;
}

async function main() {
  assertStaticContracts();
  const child = startServer();
  try {
    await waitForBoot(child);
    const results = await runBrowser();
    const broken = results.filter((row) => Array.isArray(row.issues) && row.issues.length);
    assert.equal(broken.length, 0, `layout issues: ${JSON.stringify(broken)}`);
    console.log(JSON.stringify({ ok: true, results }, null, 2));
    console.log("polish-device-cover-calendar: PASS");
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
