#!/usr/bin/env node
/**
 * TikTok conversion hero: Start Free / Preview CTAs, sticky clearance, social proof.
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
  assert.match(indexHtml, /Spend Less Time Planning\. More Time Teaching\./);
  assert.match(indexHtml, /Start Free/);
  assert.match(indexHtml, /Hundreds of childcare providers already use Little Learner Hub to save hours every week/);
  assert.doesNotMatch(indexHtml, /See why hundreds of childcare providers/);
  assert.match(indexHtml, /all built by a childcare provider who understands your day/);
  assert.match(indexHtml, /Explore the Curriculum/);
  assert.doesNotMatch(indexHtml, /127 lesson plans/);
  assert.doesNotMatch(indexHtml, /2,110 activities/);
  assert.doesNotMatch(indexHtml, /llh-hero-support/);

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  const report = { ok: true, checks: [] };
  try {
    await waitForBoot(child);

    const viewports = [
      { name: "desktop", width: 1280, height: 800 },
      { name: "mobile-360", width: 360, height: 740 },
      { name: "mobile-390", width: 390, height: 844 },
      { name: "mobile-430", width: 430, height: 932 },
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
      // Cookie notice sits above the sticky CTA and would falsely fail clearance checks.
      await page.evaluate(() => {
        try { localStorage.setItem("llhMetaCookieNoticeDismissed", "1"); } catch { /* ignore */ }
        document.getElementById("llhMetaCookieNotice")?.remove();
      });
      if (isMobile) {
        await page.waitForSelector("#homeLessonPreviewGrid [data-home-open-preview]", { timeout: 20000 });
      }

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

        const socialEl = document.querySelector(".llh-hero-social-proof");
        const socialRect = socialEl?.getBoundingClientRect();
        const socialStyles = socialEl ? getComputedStyle(socialEl) : null;
        const socialOverflows = Boolean(
          socialEl
          && (
            socialEl.scrollWidth > socialEl.clientWidth + 1
            || (socialRect && (socialRect.left < 4 || socialRect.right > window.innerWidth - 4))
          )
        );

        const order = [
          document.querySelector("#homeHero .lp-hero-headline"),
          document.querySelector("#homeHero .lp-hero-sub"),
          document.querySelector("#homeHero .llh-hero-primary-cta"),
          document.querySelector("#homeHero .llh-hero-social-proof"),
          document.querySelector("#homeHero .llh-hero-secondary-cta"),
          document.querySelector("#homeHero .llh-hero-curriculum-preview"),
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
          social: socialEl?.innerText?.trim() || "",
          socialOverflows,
          socialPadInline: socialStyles ? Number.parseFloat(socialStyles.paddingLeft) : 0,
          curriculum: document.querySelector(".llh-hero-curriculum-preview")?.innerText?.replace(/\s+/g, " ").trim() || "",
          orderOk,
          navLogin: Boolean(document.querySelector(".llh-public-nav [data-action='open-login']")),
          navSignup: Boolean(document.querySelector(".llh-public-nav [data-action='start-free']")),
          pagePadBottom: Number.parseFloat(getComputedStyle(document.querySelector(".landing-home")).paddingBottom) || 0,
        };
      });

      assert.match(hero.headline, /Spend Less Time Planning\. More Time Teaching\./);
      assert.match(hero.sub, /all built by a childcare provider who understands your day/i);
      assert.equal(hero.startFreeCount, 1);
      assert.equal(hero.previewInHero, 1);
      assert.equal(hero.pricingInHero, false);
      assert.equal(hero.overflowX, false);
      assert.equal(hero.orderOk, true);
      assert.equal(hero.social, "Hundreds of childcare providers already use Little Learner Hub to save hours every week.");
      assert.equal(hero.socialOverflows, false, `social proof should not overflow on ${viewport.name}`);
      assert.ok(hero.socialPadInline >= 10, "social proof needs horizontal padding");
      assert.match(hero.curriculum, /Explore the Curriculum/i);
      assert.doesNotMatch(hero.curriculum, /\d+\s+lesson plans/i);
      assert.doesNotMatch(hero.curriculum, /\d[\d,]*\s+activities/i);
      assert.equal(hero.navLogin, true);
      assert.equal(hero.navSignup, true);

      let clearance = null;
      if (isMobile) {
        assert.equal(hero.stickyVisible, true);
        assert.match(hero.stickyText, /Start Free/);
        assert.doesNotMatch(hero.stickyText, /Preview Free Lesson Plans/);
        assert.equal(hero.previewCountVisible, 1);
        assert.equal(hero.startAboveFold, true);
        assert.ok(hero.stickyHeight > 0 && hero.stickyHeight <= 64, `sticky height ${hero.stickyHeight}px too tall on ${viewport.name}`);
        assert.ok(hero.pagePadBottom >= hero.stickyHeight + 24, `page padding ${hero.pagePadBottom} should clear sticky ${hero.stickyHeight}`);

        // Position first View Lesson Plan fully above the sticky bar, then verify.
        clearance = await page.evaluate(async () => {
          const sticky = document.querySelector(".lp-mobile-sticky-cta");
          const btn = document.querySelector("#homeLessonPreviewGrid [data-home-open-preview]");
          if (!sticky || !btn) return { ok: false, reason: "missing sticky or view button" };

          const margin = 20;
          const stickyTop = () => sticky.getBoundingClientRect().top;
          // Scroll so button bottom sits just above sticky top.
          btn.scrollIntoView({ block: "end", inline: "nearest" });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

          let guard = 0;
          while (guard < 40) {
            const btnRect = btn.getBoundingClientRect();
            const targetBottom = stickyTop() - margin;
            const delta = btnRect.bottom - targetBottom;
            if (Math.abs(delta) <= 2 && btnRect.top >= 0) break;
            window.scrollBy(0, delta);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            guard += 1;
          }

          const stickyRect = sticky.getBoundingClientRect();
          const btnRect = btn.getBoundingClientRect();
          const covered = btnRect.bottom > stickyRect.top - 1;
          const clickable = (() => {
            const x = btnRect.left + btnRect.width / 2;
            const y = btnRect.top + btnRect.height / 2;
            const el = document.elementFromPoint(x, y);
            return Boolean(el && (el === btn || btn.contains(el)));
          })();

          // End-of-page: footer and last interactive content must clear sticky.
          window.scrollTo(0, document.documentElement.scrollHeight);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const stickyEnd = sticky.getBoundingClientRect();
          const footer = document.querySelector(".llh-footer-copy, .llh-home-footer");
          const footerRect = footer?.getBoundingClientRect();
          const footerClear = Boolean(footerRect && footerRect.bottom <= stickyEnd.top + 1);

          const lastBtn = [...document.querySelectorAll(".landing-home button, .landing-home a.llh-btn, .landing-home .lp-btn-primary")]
            .filter((el) => {
              if (sticky.contains(el)) return false;
              const style = getComputedStyle(el);
              return style.display !== "none" && style.visibility !== "hidden";
            })
            .pop();
          // Re-check last content after scrolling to end — last non-sticky control should be above sticky.
          const lastRect = lastBtn?.getBoundingClientRect();
          const lastClear = Boolean(!lastRect || lastRect.bottom <= stickyEnd.top + 1);

          // Return to the View Lesson Plan clear position for screenshot.
          btn.scrollIntoView({ block: "end", inline: "nearest" });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          guard = 0;
          while (guard < 40) {
            const r = btn.getBoundingClientRect();
            const targetBottom = sticky.getBoundingClientRect().top - margin;
            const delta = r.bottom - targetBottom;
            if (Math.abs(delta) <= 2 && r.top >= 0) break;
            window.scrollBy(0, delta);
            await new Promise((raf) => requestAnimationFrame(() => requestAnimationFrame(raf)));
            guard += 1;
          }

          const finalBtn = btn.getBoundingClientRect();
          const finalSticky = sticky.getBoundingClientRect();
          return {
            ok: !covered && clickable && footerClear && lastClear && finalBtn.bottom <= finalSticky.top - 1,
            covered,
            clickable,
            footerClear,
            lastClear,
            btnBottom: Math.round(finalBtn.bottom),
            stickyTop: Math.round(finalSticky.top),
            stickyHeight: Math.round(finalSticky.height),
            gap: Math.round(finalSticky.top - finalBtn.bottom),
          };
        });

        assert.equal(clearance.ok, true, `sticky clearance failed on ${viewport.name}: ${JSON.stringify(clearance)}`);
        assert.equal(clearance.covered, false, `View Lesson Plan covered by sticky on ${viewport.name}`);
        assert.equal(clearance.clickable, true, `View Lesson Plan not clickable on ${viewport.name}`);
        assert.equal(clearance.footerClear, true, `footer not clear of sticky on ${viewport.name}`);
        assert.ok(clearance.gap >= 16, `expected >=16px gap above sticky, got ${clearance.gap}`);
      }

      // Start Free opens signup
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click("#homeHero .llh-hero-primary-cta");
      await page.waitForSelector("#authModal.open", { timeout: 8000 });
      await page.click("#closeModal");
      await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 }).catch(() => {});

      // Preview Free Lesson Plans opens the lesson library
      await page.click("#homeHero .llh-hero-secondary-cta");
      await page.waitForFunction(() => {
        const lessons = document.querySelector("#view-lessons");
        return Boolean(lessons?.classList.contains("active-view"));
      }, null, { timeout: 15000 });

      await page.evaluate(() => {
        document.querySelector("[data-home-nav='home']")?.click();
      });
      await page.waitForTimeout(400);
      await page.click(".llh-public-nav [data-action='open-login']");
      await page.waitForSelector("#authModal.open", { timeout: 8000 });
      await page.click("#closeModal");

      // Screenshot: on mobile, show View Lesson Plan fully above sticky.
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForSelector("#homeHero .lp-hero-headline");
      if (isMobile) {
        await page.waitForSelector("#homeLessonPreviewGrid [data-home-open-preview]", { timeout: 20000 });
        await page.evaluate(async () => {
          const sticky = document.querySelector(".lp-mobile-sticky-cta");
          const btn = document.querySelector("#homeLessonPreviewGrid [data-home-open-preview]");
          const margin = 24;
          btn.scrollIntoView({ block: "end" });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          for (let i = 0; i < 50; i += 1) {
            const btnRect = btn.getBoundingClientRect();
            const targetBottom = sticky.getBoundingClientRect().top - margin;
            const delta = btnRect.bottom - targetBottom;
            if (Math.abs(delta) <= 1 && btnRect.top >= 8) break;
            window.scrollBy(0, delta);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          }
          // Ensure the full card button remains clear before capture.
          const check = (() => {
            const b = btn.getBoundingClientRect();
            const s = sticky.getBoundingClientRect();
            return b.bottom <= s.top - 16;
          })();
          if (!check) {
            window.scrollBy(0, 30);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          }
        });
        await page.waitForTimeout(120);
      }
      const shotPath = path.join(OUT_DIR, `tiktok-hero-${viewport.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      report.checks.push({ viewport: viewport.name, shotPath, hero, clearance, consoleErrors });
      const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR|Stripe|Failed to load resource/i.test(e));
      assert.equal(realErrors.length, 0, realErrors.join("\n"));
      await page.close();
      console.log(`PASS ${viewport.name}`);
    }

    // Convenience aliases
    fs.copyFileSync(path.join(OUT_DIR, "tiktok-hero-mobile-390.png"), path.join(OUT_DIR, "tiktok-hero-mobile.png"));
    fs.copyFileSync(path.join(OUT_DIR, "tiktok-hero-mobile-360.png"), path.join(OUT_DIR, "tiktok-hero-android-360.png"));
    fs.copyFileSync(path.join(OUT_DIR, "tiktok-hero-mobile-390.png"), path.join(OUT_DIR, "tiktok-hero-iphone-14.png"));
    fs.copyFileSync(path.join(OUT_DIR, "tiktok-hero-mobile-430.png"), path.join(OUT_DIR, "tiktok-hero-iphone-pro-max.png"));
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
