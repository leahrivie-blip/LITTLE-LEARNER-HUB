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
  assert.doesNotMatch(indexHtml, /llh-hero-support/);

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  const report = { ok: true, checks: [] };
  try {
    await waitForBoot(child);

    for (const viewport of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
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
        // position:fixed elements often have null offsetParent — use computed display.
        const stickyVisible = Boolean(sticky && getComputedStyle(sticky).display !== "none" && getComputedStyle(sticky).visibility !== "hidden");
        const stickyText = sticky?.innerText?.trim() || "";
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
        return {
          headline,
          sub,
          startFreeCount: startFree.length,
          previewInHero: preview.length,
          stickyVisible,
          stickyText,
          pricingInHero,
          overflowX,
          startAboveFold,
          previewCountVisible,
          social: document.querySelector(".llh-hero-social-proof")?.innerText?.trim() || "",
          trust: document.querySelector(".llh-hero-trust-line")?.innerText?.trim() || "",
          navLogin: Boolean(document.querySelector(".llh-public-nav [data-action='open-login']")),
          navSignup: Boolean(document.querySelector(".llh-public-nav [data-action='start-free']")),
        };
      });

      assert.match(hero.headline, /Stop Spending Hours Creating Lesson Plans/);
      assert.match(hero.sub, /infant, toddler, and preschool/i);
      assert.equal(hero.startFreeCount, 1);
      assert.equal(hero.previewInHero, 1);
      assert.equal(hero.pricingInHero, false);
      assert.equal(hero.overflowX, false);
      assert.match(hero.social, /hundreds of childcare providers/i);
      assert.match(hero.trust, /127 lesson plans/i);
      assert.equal(hero.navLogin, true);
      assert.equal(hero.navSignup, true);
      if (viewport.name === "mobile") {
        assert.equal(hero.stickyVisible, true);
        assert.match(hero.stickyText, /Start Free/);
        assert.doesNotMatch(hero.stickyText, /Preview Free Lesson Plans/);
        // Hero Preview + sticky Start Free — only one Preview visible
        assert.equal(hero.previewCountVisible, 1, `expected 1 Preview button on mobile, got ${hero.previewCountVisible}`);
        assert.equal(hero.startAboveFold, true, "Start Free should be above the fold on mobile");
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
      // Return to home for screenshot
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#homeHero .lp-hero-headline");
      await page.screenshot({ path: shotPath, fullPage: false });
      report.checks.push({ viewport: viewport.name, shotPath, hero, consoleErrors });
      const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR|Stripe|Failed to load resource/i.test(e));
      assert.equal(realErrors.length, 0, realErrors.join("\n"));
      await page.close();
      console.log(`PASS ${viewport.name}`);
    }

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
