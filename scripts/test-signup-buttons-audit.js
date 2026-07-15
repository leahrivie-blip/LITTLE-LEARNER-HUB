#!/usr/bin/env node
/**
 * Click-through audit: every guest signup / Get Started CTA must open #authModal
 * in signup mode on first click (desktop + mobile), without needing force:true.
 *
 * Run: node scripts/test-signup-buttons-audit.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19510 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-signup-audit-${crypto.randomBytes(4).toString("hex")}.json`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
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
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server boot timeout");
}

async function closeAuth(page) {
  const open = await page.locator("#authModal.open").count();
  if (!open) return;
  await page.click("#closeModal");
  await page.waitForSelector("#authModal.open", { state: "hidden", timeout: 5000 });
}

async function ensureHomeGuest(page) {
  await page.evaluate(() => {
    localStorage.removeItem("llhUser");
    localStorage.removeItem("llhAccounts");
    localStorage.removeItem("llhPlan");
    sessionStorage.clear();
    if (typeof closeAuthModal === "function") closeAuthModal();
    if (typeof closeFeaturePreview === "function") closeFeaturePreview();
    if (typeof closeResourceViewer === "function") closeResourceViewer();
    if (typeof setHomePublicMenuOpen === "function") setHomePublicMenuOpen(false);
    if (typeof setView === "function") setView("home");
  });
  await page.waitForSelector("#view-home.active-view", { timeout: 10000 });
}

/**
 * Click a locator without force:true. Reports if Playwright considers it blocked.
 */
async function clickSignupAndExpectModal(page, locator, label) {
  await closeAuth(page);
  const count = await locator.count();
  if (!count) {
    return { skipped: true, label, reason: "not found" };
  }
  const target = locator.first();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(150);

  const box = await target.boundingBox();
  if (!box || box.width < 2 || box.height < 2) {
    return { skipped: true, label, reason: "not visible / zero size" };
  }

  // Detect element covering the click point (common sticky CTA bug).
  const coverInfo = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { covered: true, tag: "null" };
    return {
      covered: false,
      tag: el.tagName,
      id: el.id || "",
      className: String(el.className || "").slice(0, 120),
      text: String(el.textContent || "").trim().slice(0, 60),
    };
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

  let clickError = null;
  try {
    await target.click({ timeout: 5000 });
  } catch (err) {
    clickError = err;
  }

  const modalOpen = await page.locator("#authModal.open").count();
  if (!modalOpen) {
    // One retry after dismissing sticky overlays via evaluate (still counts as failure if needed)
    return {
      ok: false,
      label,
      clickError: clickError ? String(clickError.message || clickError) : null,
      coverInfo,
      reason: "auth modal did not open",
    };
  }

  const title = (await page.locator("#authTitle").innerText()).toLowerCase();
  const isSignup = /create|sign up|free/.test(title) && !/^log in/.test(title);
  if (!isSignup) {
    return { ok: false, label, reason: `expected signup modal, got title: ${title}`, coverInfo };
  }

  await closeAuth(page);
  return { ok: true, label, coverInfo };
}

async function runViewport(browser, viewport, label) {
  const page = await browser.newPage({ viewport });
  const failures = [];
  const passes = [];
  const skipped = [];

  page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof setView === "function" && typeof openAuthModal === "function",
    null,
    { timeout: 30000 },
  );
  await ensureHomeGuest(page);

  const homeSelectors = [
    { sel: "#signupButton", name: "topbar #signupButton" },
    { sel: ".llh-announce-banner [data-checkout-plan='founding']", name: "announce banner founding" },
    { sel: ".llh-public-nav-actions [data-action='start-free']", name: "public nav Get Started" },
    { sel: ".lp-hero-actions [data-action='start-free']", name: "hero Start Free" },
    { sel: "#homeComingSoon [data-checkout-plan='founding']", name: "coming soon founding" },
    { sel: "#homePricing [data-action='start-free']", name: "pricing Create Free Account" },
    { sel: "#homePricing [data-checkout-plan='founding']", name: "pricing founding Claim" },
    { sel: "#homeCompare [data-action='start-free']", name: "compare Create Free Account" },
    { sel: "#homeCompare [data-checkout-plan='founding']", name: "compare Become Founding" },
    { sel: ".llh-final-cta [data-checkout-plan='founding'], .lp-final-cta [data-checkout-plan='founding']", name: "final CTA founding" },
    { sel: ".llh-final-cta [data-action='start-free'], .lp-final-cta [data-action='start-free']", name: "final CTA Create Free" },
    { sel: ".llh-home-footer [data-action='start-free'], footer [data-action='start-free']", name: "footer Sign Up" },
    { sel: ".lp-mobile-sticky-cta [data-checkout-plan='founding']", name: "mobile sticky Get Started" },
  ];

  // Mobile menu signup (open menu first on small screens)
  if (viewport.width <= 900) {
    const toggle = page.locator("#llhPublicMenuToggle");
    if (await toggle.count()) {
      await toggle.click().catch(() => {});
      await page.waitForTimeout(300);
      const mobileSignup = page.locator('#llhPublicMobileMenu [data-action="start-free"]');
      const result = await clickSignupAndExpectModal(page, mobileSignup, `${label}: mobile menu Get Started`);
      if (result.skipped) skipped.push(result);
      else if (result.ok) passes.push(result.label);
      else failures.push(result);
      await page.evaluate(() => {
        if (typeof setHomePublicMenuOpen === "function") setHomePublicMenuOpen(false);
      });
    }
  }

  for (const item of homeSelectors) {
    // Sticky CTA only visible on mobile
    if (item.sel.includes("lp-mobile-sticky") && viewport.width > 760) {
      skipped.push({ skipped: true, label: `${label}: ${item.name}`, reason: "desktop hide" });
      continue;
    }
    // Public nav actions hidden on small screens
    if (item.sel.includes("llh-public-nav-actions") && viewport.width <= 900) {
      skipped.push({ skipped: true, label: `${label}: ${item.name}`, reason: "mobile hide" });
      continue;
    }

    await ensureHomeGuest(page);
    const result = await clickSignupAndExpectModal(page, page.locator(item.sel), `${label}: ${item.name}`);
    if (result.skipped) skipped.push(result);
    else if (result.ok) passes.push(result.label);
    else failures.push(result);
  }

  // Auth mode switch: Log In → Create account
  await ensureHomeGuest(page);
  await page.evaluate(() => openAuthModal("login"));
  await page.waitForSelector("#authModal.open", { timeout: 5000 });
  await page.click("#switchAuthModeButton");
  await page.waitForTimeout(200);
  const switchTitle = (await page.locator("#authTitle").innerText()).toLowerCase();
  if (/create|sign up|free/.test(switchTitle)) {
    passes.push(`${label}: switchAuthMode → signup`);
  } else {
    failures.push({ ok: false, label: `${label}: switchAuthMode → signup`, reason: `title=${switchTitle}` });
  }
  await closeAuth(page);

  // Free lesson preview CTAs (resource viewer) — scope to modal so homepage CTAs are not matched
  await ensureHomeGuest(page);
  const openedPreview = await page.evaluate(async () => {
    const freeLesson = (resources || []).find(
      (r) => r.category === "Lesson Plans" && String(r.plan || "").toLowerCase() === "free",
    );
    if (!freeLesson || typeof openResourceViewer !== "function") return null;
    await openResourceViewer(freeLesson.id);
    return freeLesson.id;
  });
  if (openedPreview) {
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
    await page.waitForTimeout(400);
    const freeCta = page.locator("#resourceViewerModal [data-action='start-free']");
    const foundingCta = page.locator("#resourceViewerModal [data-checkout-plan='founding']");
    for (const [loc, name] of [
      [freeCta, "lesson preview Create Free Account"],
      [foundingCta, "lesson preview founding"],
    ]) {
      const result = await clickSignupAndExpectModal(page, loc, `${label}: ${name}`);
      if (result.skipped) skipped.push(result);
      else if (result.ok) passes.push(result.label);
      else failures.push(result);
      // Re-open viewer if closed by dismissOverlays
      await page.evaluate(async (id) => {
        if (typeof openResourceViewer === "function") await openResourceViewer(id);
      }, openedPreview);
      await page.waitForTimeout(300);
    }
    await page.evaluate(() => {
      if (typeof closeResourceViewer === "function") closeResourceViewer();
    });
  } else {
    skipped.push({ skipped: true, label: `${label}: lesson preview CTAs`, reason: "no free lesson" });
  }

  // Guest Lesson Plan Library: topbar Sign Up + in-library Get Started strip
  await ensureHomeGuest(page);
  await page.evaluate(() => setView("lessons"));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
  await page.waitForTimeout(500);
  for (const [sel, name] of [
    ["#signupButton", "lessons topbar signup"],
    ["#view-lessons .library-upgrade-strip--guest [data-action='start-free']", "lessons guest Get Started strip"],
  ]) {
    const result = await clickSignupAndExpectModal(page, page.locator(sel), `${label}: ${name}`);
    if (result.skipped) skipped.push(result);
    else if (result.ok) passes.push(result.label);
    else failures.push(result);
    await page.evaluate(() => setView("lessons"));
    await page.waitForTimeout(300);
  }

  // Guest Activity Center signup strip
  await page.evaluate(() => setView("activities"));
  await page.waitForSelector("#view-activities.active-view", { timeout: 8000 });
  await page.waitForTimeout(500);
  for (const [sel, name] of [
    ["#signupButton", "activities topbar signup"],
    ["#view-activities .library-upgrade-strip--guest [data-action='start-free']", "activities guest Get Started strip"],
  ]) {
    const result = await clickSignupAndExpectModal(page, page.locator(sel), `${label}: ${name}`);
    if (result.skipped) skipped.push(result);
    else if (result.ok) passes.push(result.label);
    else failures.push(result);
    await page.evaluate(() => setView("activities"));
    await page.waitForTimeout(300);
  }

  // Locked Pro preview upgrade CTA (guest → signup)
  await ensureHomeGuest(page);
  const openedLocked = await page.evaluate(() => {
    const proLesson = (resources || []).find(
      (r) => r.category === "Lesson Plans" && /pro/i.test(String(r.plan || "")) && r._curriculumManaged,
    );
    if (!proLesson || typeof openLockedResourcePreview !== "function") return null;
    openLockedResourcePreview(proLesson);
    return proLesson.id;
  });
  if (openedLocked) {
    await page.waitForSelector("#featurePreviewModal.open", { timeout: 10000 });
    const upgradeBtn = page.locator("#featurePreviewModal [data-checkout-plan], #featurePreviewModal [data-start-pro-trial]").first();
    // Prefer the sticky bar button if present — that's the one users hit; also test in-body.
    const stickyBtn = page.locator("[data-fp-sticky-upgrade] [data-checkout-plan], [data-fp-sticky-upgrade] [data-start-pro-trial]");
    for (const [loc, name] of [
      [stickyBtn, "pro preview sticky upgrade"],
      [upgradeBtn, "pro preview body upgrade"],
    ]) {
      if (!(await loc.count())) {
        skipped.push({ skipped: true, label: `${label}: ${name}`, reason: "not found" });
        continue;
      }
      const result = await clickSignupAndExpectModal(page, loc, `${label}: ${name}`);
      if (result.skipped) skipped.push(result);
      else if (result.ok) passes.push(result.label);
      else failures.push(result);
      await page.evaluate((id) => {
        const pro = (resources || []).find((r) => r.id === id);
        if (pro && typeof openLockedResourcePreview === "function") openLockedResourcePreview(pro);
      }, openedLocked);
      await page.waitForTimeout(300);
    }
    await page.evaluate(() => {
      if (typeof closeFeaturePreview === "function") closeFeaturePreview();
    });
  } else {
    skipped.push({ skipped: true, label: `${label}: pro preview CTAs`, reason: "no pro lesson" });
  }

  // Plans / upgrade pages
  for (const view of ["plans", "upgrade"]) {
    await ensureHomeGuest(page);
    await page.evaluate((v) => setView(v), view);
    await page.waitForSelector(`#view-${view}.active-view`, { timeout: 8000 });
    await page.waitForTimeout(500);
    const founding = page.locator(`#${view === "plans" ? "pricingApp" : "upgradeApp"} [data-checkout-plan="founding"]`);
    const free = page.locator(`#${view === "plans" ? "pricingApp" : "upgradeApp"} [data-plan="Free"], #${view === "plans" ? "pricingApp" : "upgradeApp"} [data-action="start-free"]`);
    for (const [loc, name] of [
      [founding, `${view} founding`],
      [free, `${view} free`],
    ]) {
      const result = await clickSignupAndExpectModal(page, loc, `${label}: ${name}`);
      if (result.skipped) skipped.push(result);
      else if (result.ok) passes.push(result.label);
      else failures.push(result);
      await page.evaluate((v) => setView(v), view);
      await page.waitForTimeout(300);
    }
  }

  await page.close();
  return { label, passes, failures, skipped };
}

async function main() {
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const vp of [
      { width: 1280, height: 900, label: "desktop" },
      { width: 390, height: 844, label: "mobile" },
    ]) {
      console.log(`\n=== ${vp.label} (${vp.width}x${vp.height}) ===`);
      const result = await runViewport(browser, { width: vp.width, height: vp.height }, vp.label);
      results.push(result);
      for (const p of result.passes) console.log(`PASS  ${p}`);
      for (const s of result.skipped) console.log(`SKIP  ${s.label} (${s.reason})`);
      for (const f of result.failures) {
        console.log(`FAIL  ${f.label}`);
        console.log(`      reason: ${f.reason}`);
        if (f.clickError) console.log(`      clickError: ${f.clickError}`);
        if (f.coverInfo) console.log(`      cover: ${JSON.stringify(f.coverInfo)}`);
      }
    }

    const allFailures = results.flatMap((r) => r.failures);
    const allPasses = results.flatMap((r) => r.passes);
    console.log(`\nSummary: ${allPasses.length} passed, ${allFailures.length} failed`);
    if (allFailures.length) {
      process.exitCode = 1;
      console.error("\nSignup button audit FAILED.");
    } else {
      console.log("\nAll signup button audits passed.");
    }
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
    try {
      fs.rmSync(STORE_PATH, { force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
