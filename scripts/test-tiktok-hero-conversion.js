#!/usr/bin/env node
/**
 * TikTok conversion hero: Start Free / Preview CTAs, no duplicate Preview on mobile.
 * Screenshots written for approval. Does not merge/deploy.
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
const PORT = 19710 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-tiktok-hero-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = "/opt/cursor/artifacts/screenshots";

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      SITE_URL: `http://127.0.0.1:${PORT}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(indexHtml, /Stop Spending Hours Creating Lesson Plans/);
  assert.match(indexHtml, /Start Free/);
  assert.match(indexHtml, /See why hundreds of childcare providers have already joined/);
  assert.match(indexHtml, /all built by a childcare provider/);
  assert.doesNotMatch(indexHtml, /all in one affordable platform built by a childcare provider/);
  assert.doesNotMatch(indexHtml, /llh-hero-support/);

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  const report = { ok: true, checks: [] };
  try {
    await waitForBoot(child);

    const viewports = [
      { name: "desktop", width: 1280, height: 800 },
      { name: "iphone-14", width: 390, height: 844 },
      { name: "iphone-pro-max", width: 430, height: 932 },
      { name: "android-360", width: 360, height: 740 },
    ];

    for (const viewport of viewports) {
      const isMobile = viewport.name !== "desktop";
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#homeHero .lp-hero-headline", { timeout: 15000 });

      const hero = await page.evaluate(() => {
        const section = document.querySelector("#homeHero");
        const headline = document.querySelector("#homeHero .lp-hero-headline")?.innerText?.trim() || "";
        const sub = document.querySelector("#homeHero .lp-hero-sub")?.innerText?.trim() || "";
        const startFree = [...document.querySelectorAll("#homeHero [data-action='start-free']")];
        const preview = [...document.querySelectorAll("#homeHero [data-view='lessons'], #homeHero [data-home-nav='lessons']")];
        const sticky = document.querySelector(".lp-mobile-sticky-cta");
        const stickyVisible = Boolean(
          sticky
          && getComputedStyle(sticky).display !== "none"
          && getComputedStyle(sticky).visibility !== "hidden"
        );
        const stickyText = sticky?.innerText?.trim() || "";
        const stickyRect = stickyVisible ? sticky.getBoundingClientRect() : null;
        const pricingInHero = /\$19\.99|Founding/i.test(section?.innerText || "");
        const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        const startBtn = document.querySelector("#homeHero .llh-hero-primary-cta");
        const startRect = startBtn?.getBoundingClientRect();
        const startAboveFold = Boolean(startRect && startRect.top >= 0 && startRect.bottom <= window.innerHeight);
        const previewCountVisible = [...document.querySelectorAll("button")].filter((btn) => {
          const t = (btn.innerText || "").trim();
          if (t !== "Preview Free Lesson Plans") return false;
          const style = getComputedStyle(btn);
          return style.display !== "none" && style.visibility !== "hidden" && btn.offsetParent !== null;
        }).length;

        const trustEl = document.querySelector(".llh-hero-trust-line");
        const trustStyles = trustEl ? getComputedStyle(trustEl) : null;
        const trustStacked = Boolean(trustStyles && trustStyles.flexDirection === "column");
        const lookInside = document.querySelector("#homeLessonPlans .lp-section-title");
        const lookInsideRect = lookInside?.getBoundingClientRect();
        const lookInsideVisible = Boolean(
          lookInsideRect
          && lookInsideRect.top < window.innerHeight - (stickyRect?.height || 0) - 8
        );

        // Ensure sticky does not cover hero trust line or Look Inside title at top of page.
        let stickyCoversHeroTrust = false;
        if (stickyRect && trustEl) {
          const trustRect = trustEl.getBoundingClientRect();
          stickyCoversHeroTrust = trustRect.bottom > stickyRect.top + 1;
        }

        // Scroll to bottom and ensure footer/final content is not covered.
        const previousScroll = window.scrollY;
        window.scrollTo(0, document.documentElement.scrollHeight);
        const footer = document.querySelector(".llh-home-footer, .llh-footer-copy, footer");
        const footerRect = footer?.getBoundingClientRect();
        const stickyAfterScroll = stickyVisible ? sticky.getBoundingClientRect() : null;
        const stickyCoversFooter = Boolean(
          stickyAfterScroll
          && footerRect
          && footerRect.bottom > stickyAfterScroll.top + 2
          && footerRect.top < window.innerHeight
        );
        window.scrollTo(0, previousScroll);

        const order = [
          document.querySelector("#homeHero .lp-hero-headline"),
          document.querySelector("#homeHero .lp-hero-sub"),
          document.querySelector("#homeHero .llh-hero-primary-cta"),
          document.querySelector("#homeHero .llh-hero-social-proof"),
          document.querySelector("#homeHero .llh-hero-secondary-cta"),
          document.querySelector("#homeHero .llh-hero-trust-line"),
        ].map((el) => el?.getBoundingClientRect().top ?? Infinity);
        const orderOk = order.every((top, i) => i === 0 || top >= order[i - 1] - 1);

        return {
          headline,
          sub,
          startFreeCount: startFree.length,
          previewInHero: preview.length,
          stickyVisible,
          stickyText,
          stickyHeight: stickyRect ? Math.round(stickyRect.height) : 0,
          pricingInHero,
          overflowX,
          startAboveFold,
          previewCountVisible,
          social: document.querySelector(".llh-hero-social-proof")?.innerText?.trim() || "",
          trust: document.querySelector(".llh-hero-trust-line")?.innerText?.replace(/\s+/g, " ").trim() || "",
          trustStacked,
          lookInsideVisible,
          stickyCoversHeroTrust,
          stickyCoversFooter,
          orderOk,
          navLogin: Boolean(document.querySelector(".llh-public-nav [data-action='open-login']")),
          navSignup: Boolean(document.querySelector(".llh-public-nav [data-action='start-free']")),
        };
      });

      assert.match(hero.headline, /Stop Spending Hours Creating Lesson Plans/);
      assert.match(hero.sub, /all built by a childcare provider/i);
      assert.doesNotMatch(hero.sub, /affordable platform/i);
      assert.equal(hero.startFreeCount, 1);
      assert.equal(hero.previewInHero, 1);
      assert.equal(hero.pricingInHero, false);
      assert.equal(hero.overflowX, false);
      assert.equal(hero.orderOk, true, "hero content order should be headline → sub → Start Free → social → Preview → trust");
      assert.match(hero.social, /hundreds of childcare providers/i);
      assert.match(hero.trust, /127 lesson plans/i);
      assert.match(hero.trust, /Infant/i);
      assert.equal(hero.navLogin, true);
      assert.equal(hero.navSignup, true);
      if (isMobile) {
        assert.equal(hero.stickyVisible, true);
        assert.match(hero.stickyText, /Start Free/);
        assert.doesNotMatch(hero.stickyText, /Preview Free Lesson Plans/);
        assert.equal(hero.previewCountVisible, 1, `expected 1 Preview button on ${viewport.name}, got ${hero.previewCountVisible}`);
        assert.equal(hero.startAboveFold, true, `Start Free should be above the fold on ${viewport.name}`);
        assert.equal(hero.trustStacked, true, `trust line should stack on ${viewport.name}`);
        assert.equal(hero.stickyCoversHeroTrust, false, `sticky should not cover hero trust on ${viewport.name}`);
        assert.equal(hero.stickyCoversFooter, false, `sticky should not cover footer on ${viewport.name}`);
        assert.ok(hero.stickyHeight > 0 && hero.stickyHeight <= 72, `sticky height ${hero.stickyHeight}px should be compact on ${viewport.name}`);
      }

      // Start Free opens signup
      await page.click("#homeHero .llh-hero-primary-cta");
      await page.waitForSelector("#authModal.open", { timeout: 8000 });
      const authTitle = await page.locator("#authTitle").innerText();
      assert.match(authTitle, /Create|Free|Sign|Account|Little Learner/i);
      await page.click("#closeModal");
      await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 }).catch(() => {});

      // Preview Free Lesson Plans opens the lesson library
      await page.click("#homeHero .llh-hero-secondary-cta");
      await page.waitForFunction(() => {
        const lessons = document.querySelector("#view-lessons");
        return Boolean(lessons?.classList.contains("active-view"));
      }, null, { timeout: 15000 });

      // Nav login still works from home
      await page.evaluate(() => {
        document.querySelector("[data-home-nav='home']")?.click();
      });
      await page.waitForTimeout(400);
      await page.click(".llh-public-nav [data-action='open-login']");
      await page.waitForSelector("#authModal.open", { timeout: 8000 });
      await page.click("#closeModal");

      const shotPath = path.join(OUT_DIR, `tiktok-hero-${viewport.name}.png`);
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#homeHero .lp-hero-headline");
      await page.screenshot({ path: shotPath, fullPage: false });
      report.checks.push({ viewport: viewport.name, shotPath, hero, consoleErrors });
      const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR|Stripe|Failed to load resource/i.test(e));
      assert.equal(realErrors.length, 0, realErrors.join("\n"));
      await page.close();
      console.log(`PASS ${viewport.name}`);
    }

    // Keep legacy filenames for PR review convenience
    fs.copyFileSync(path.join(OUT_DIR, "tiktok-hero-iphone-14.png"), path.join(OUT_DIR, "tiktok-hero-mobile.png"));
    fs.writeFileSync(path.join(OUT_DIR, "tiktok-hero-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log("tiktok-hero-conversion: PASS");
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
