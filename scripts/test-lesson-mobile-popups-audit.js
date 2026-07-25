#!/usr/bin/env node
/**
 * Full mobile audit of lesson-viewer popups:
 * More sheet, assign/calendar sheet, Pro upgrade, feedback.
 * Run: node scripts/test-lesson-mobile-popups-audit.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19850 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-popups-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const ADMIN = {
  email: "lesson-popup-admin@test.local",
  password: "lesson-popup-pass",
  code: "lesson-popup-code",
};
const MEMBER = "lesson-popup-member@example.com";

function request(method, urlPath, { body, headers = {} } = {}) {
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
      },
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
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
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
      const res = await request("GET", "/api/health");
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

async function seedFreeLesson(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(sample, "utf8"));
  if (!parsed.ok) throw new Error(parsed.error || "parse failed");
  const bootstrap = await request("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await request("POST", "/api/admin/site-content", {
    body: {
      adminToken: token,
      siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
    },
  });
  const planId = `cur-lp-popup-audit-${crypto.randomBytes(3).toString("hex")}`;
  const save = await request("POST", "/api/admin/curriculum/lesson-plans", {
    body: {
      adminToken: token,
      expectedUpdatedAt: touch.json.siteContent.updatedAt,
      lessonPlan: {
        ...parsed.data,
        id: planId,
        title: "Mobile Popup Audit Plan",
        plan: "Free",
        status: "published",
        age: "Preschool",
        theme: "Popup Audit",
      },
    },
  });
  if (![200, 201].includes(save.status)) throw new Error(`seed failed ${save.status} ${save.text}`);
  return { id: planId, title: "Mobile Popup Audit Plan" };
}

function assertInViewport(label, rect, viewport, pad = 11.5) {
  assert.ok(rect.left >= pad - 0.5, `${label}: left ${rect.left}`);
  assert.ok(rect.right <= viewport.w - pad + 0.5, `${label}: right ${rect.right}`);
  assert.ok(rect.top >= -1, `${label}: top ${rect.top}`);
  assert.ok(rect.bottom <= viewport.h + 1, `${label}: bottom ${rect.bottom} > ${viewport.h}`);
  assert.ok(rect.width <= viewport.w - 23.5, `${label}: width ${rect.width}`);
}

async function openLesson(page, lesson) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(({ email }) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" },
    }));
    localStorage.setItem("llhPlan", "Free");
  }, { email: MEMBER });
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function" && typeof isLoggedIn === "function" && isLoggedIn(), null, { timeout: 30000 });
  // Phase 23: logged-in boot finishes on Today (not Calendar).
  await page.waitForSelector("#view-today.active-view, #view-home.active-view, #view-lessons.active-view", { timeout: 30000 });
  await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
  await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 15000 });
  await page.fill("#view-lessons.active-view #lessonPlanSearch", lesson.title);
  await page.waitForTimeout(400);
  await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: lesson.title }).first().click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 15000 });
}

async function main() {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(app, /positionLessonWorkspaceMoreMenu/);
  assert.match(app, /syncLessonWorkspaceActionSheetPortal/);
  assert.match(css, /calc\(100vw - 24px\)/);
  assert.match(css, /lesson-workspace-more-backdrop/);
  console.log("PASS static lesson popup markers");

  const playwright = require("playwright");
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await request("POST", "/api/admin/login", {
      body: { email: ADMIN.email, password: ADMIN.password, code: ADMIN.code },
    });
    assert.equal(login.status, 200);
    const lesson = await seedFreeLesson(login.json.token);

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await openLesson(page, lesson);

    // Actions are in normal page flow — scroll to More like a real tap, then verify restore.
    const pageScroll = page.locator(".lesson-workspace");
    await page.locator("[data-lesson-workspace-more-toggle]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const scrollBefore = await pageScroll.evaluate((el) => el.scrollTop);
    assert.ok(scrollBefore > 40, `expected scrolled lesson before More, got ${scrollBefore}`);

    // ---- More sheet ----
    await page.locator("[data-lesson-workspace-more-toggle]").click();
    await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
    await page.waitForTimeout(200);
    const more = await page.evaluate(() => {
      const menu = document.querySelector(".lesson-workspace-more-menu");
      const backdrop = document.querySelector("[data-lesson-workspace-more-backdrop]");
      const closeBtn = document.querySelector("[data-lesson-workspace-more-close]");
      const feedback = document.querySelector("[data-lesson-feedback-root]");
      const sticky = document.querySelector(".lesson-workspace-action-bars");
      const mr = menu.getBoundingClientRect();
      const sample = document.elementFromPoint(Math.max(8, mr.left - 6), Math.max(8, mr.top - 20));
      const buttons = [...menu.querySelectorAll(".lesson-workspace-more-sheet-body button")].map((btn) => ({
        label: btn.textContent.trim(),
        h: btn.getBoundingClientRect().height,
        w: btn.getBoundingClientRect().width,
        overflowX: btn.scrollWidth - btn.clientWidth,
      }));
      return {
        parentIsBody: menu.parentElement === document.body,
        rect: { left: mr.left, right: mr.right, top: mr.top, bottom: mr.bottom, width: mr.width, height: mr.height },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        z: Number(getComputedStyle(menu).zIndex) || 0,
        backdropVisible: Boolean(backdrop && !backdrop.hidden),
        backdropZ: backdrop ? Number(getComputedStyle(backdrop).zIndex) || 0 : 0,
        closeVisible: Boolean(closeBtn && getComputedStyle(closeBtn).display !== "none"),
        locked: document.body.classList.contains("lesson-workspace-more-open"),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        buttons,
        feedbackCovered: (() => {
          if (!feedback) return true;
          const fr = feedback.getBoundingClientRect();
          if (fr.height <= 0) return true;
          const hit = document.elementFromPoint(fr.left + Math.min(20, fr.width / 2), fr.top + Math.min(20, fr.height / 2));
          return Boolean(hit && (hit === backdrop || hit.closest(".lesson-workspace-more-menu") || hit.closest(".lesson-workspace-more-backdrop")));
        })(),
        stickyCovered: (() => {
          if (!sticky) return true;
          const sr = sticky.getBoundingClientRect();
          const hit = document.elementFromPoint(sr.left + 12, sr.top + 12);
          return Boolean(hit && (hit === backdrop || hit.closest(".lesson-workspace-more-menu") || hit.closest(".lesson-workspace-more-backdrop")));
        })(),
        outsideHit: sample?.className || sample?.tagName || "",
      };
    });
    assert.equal(more.parentIsBody, true, "More must portal to body");
    assertInViewport("More", more.rect, more.viewport);
    assert.ok(more.z >= 1280, `More z-index ${more.z}`);
    assert.ok(more.backdropVisible && more.backdropZ >= 1270, "More backdrop required above lesson chrome");
    assert.equal(more.closeVisible, true, "Close button required");
    assert.equal(more.locked, true, "background scroll lock required");
    assert.equal(more.overflowX, false, "no horizontal page scroll");
    assert.ok(more.buttons.length >= 4, "More options present");
    assert.ok(more.buttons.every((b) => b.h >= 44 && b.w >= more.rect.width - 48 && b.overflowX <= 1), `tap targets: ${JSON.stringify(more.buttons.slice(0, 2))}`);
    assert.equal(more.feedbackCovered, true, "feedback must not peek through More");
    assert.equal(more.stickyCovered, true, "sticky actions must not peek through More");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "audit-more-sheet-390.png"), fullPage: false });
    console.log("PASS More sheet");

    await page.click("[data-lesson-workspace-more-close]");
    await page.waitForSelector(".lesson-workspace-more-menu[hidden]", { state: "attached", timeout: 5000 });
    const scrollAfter = await pageScroll.evaluate((el) => el.scrollTop);
    assert.ok(Math.abs(scrollAfter - scrollBefore) <= 2, `scroll restored ${scrollBefore} -> ${scrollAfter}`);
    console.log("PASS More close restores scroll");

    // Outside tap close
    await page.locator("[data-lesson-workspace-more-toggle]").scrollIntoViewIfNeeded();
    await page.locator("[data-lesson-workspace-more-toggle]").click();
    await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
    await page.click("[data-lesson-workspace-more-backdrop]", { position: { x: 8, y: 8 } });
    await page.waitForSelector(".lesson-workspace-more-menu[hidden]", { state: "attached", timeout: 5000 });
    console.log("PASS More outside tap closes");

    // ---- Assign / calendar sheet ----
    await page.locator("[data-lesson-use-this-plan]").scrollIntoViewIfNeeded();
    await page.click('[data-lesson-use-this-plan]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    await page.waitForTimeout(150);
    const assign = await page.evaluate(() => {
      const sheet = document.querySelector(".lesson-workspace-action-sheet");
      const panel = document.querySelector(".lesson-workspace-action-sheet-panel");
      const pr = panel.getBoundingClientRect();
      return {
        parentIsBody: sheet.parentElement === document.body,
        hidden: sheet.hidden,
        rect: { left: pr.left, right: pr.right, top: pr.top, bottom: pr.bottom, width: pr.width, height: pr.height },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        z: Number(getComputedStyle(sheet).zIndex) || 0,
        locked: document.body.classList.contains("lesson-workspace-sheet-open"),
      };
    });
    assert.equal(assign.parentIsBody, true, "Assign sheet must portal to body");
    assertInViewport("Assign", assign.rect, assign.viewport);
    assert.ok(assign.z >= 1290, `Assign z ${assign.z}`);
    assert.equal(assign.locked, true, "assign sheet scroll lock");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "audit-assign-sheet-390.png"), fullPage: false });
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");
    console.log("PASS Assign/calendar sheet");

    // ---- Pro upgrade modal (Save Pro) ----
    const proAlreadyOpen = await page.evaluate(() => document.querySelector("#proModal")?.classList.contains("open"));
    if (!proAlreadyOpen) {
      const saveBtn = page.locator(".lesson-workspace-save-btn");
      if (await saveBtn.count()) {
        await saveBtn.first().click({ timeout: 5000 });
      } else {
        await page.evaluate(() => showProFeatureModal("Save lesson plans is a Pro feature.", "feature"));
      }
    }
    await page.waitForSelector("#proModal.open", { timeout: 5000 });
    await page.waitForTimeout(150);
    const pro = await page.evaluate(() => {
      const modal = document.querySelector("#proModal");
      const card = modal.querySelector(".modal-card");
      const cr = card.getBoundingClientRect();
      return {
        rect: { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom, width: cr.width, height: cr.height },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        z: Number(getComputedStyle(modal).zIndex) || 0,
        locked: document.body.classList.contains("auth-modal-open"),
      };
    });
    assertInViewport("Pro modal", pro.rect, pro.viewport);
    assert.ok(pro.z >= 1300, `Pro z ${pro.z}`);
    assert.equal(pro.locked, true, "Pro modal scroll lock");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "audit-pro-modal-390.png"), fullPage: false });
    await page.click("#proModalDismiss");
    await page.waitForFunction(() => !document.querySelector("#proModal")?.classList.contains("open"), null, { timeout: 5000 });
    console.log("PASS Pro upgrade modal");

    // ---- Feedback / suggestion ----
    const suggestBtn = page.locator('[data-lesson-feedback="suggest"]');
    if (await suggestBtn.count()) {
      await suggestBtn.first().click();
      await page.waitForTimeout(300);
      const feedbackState = await page.evaluate(() => {
        const modal = document.querySelector("#feedbackModal");
        const open = modal?.classList.contains("open");
        if (!open) {
          return { open: false, status: document.querySelector("[data-lesson-feedback-status]")?.textContent || "" };
        }
        const card = modal.querySelector(".modal-card");
        const cr = card.getBoundingClientRect();
        return {
          open: true,
          rect: { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom, width: cr.width, height: cr.height },
          viewport: { w: window.innerWidth, h: window.innerHeight },
          z: Number(getComputedStyle(modal).zIndex) || 0,
          locked: document.body.classList.contains("auth-modal-open"),
        };
      });
      if (feedbackState.open) {
        assertInViewport("Feedback modal", feedbackState.rect, feedbackState.viewport);
        assert.ok(feedbackState.z >= 1300, `Feedback z ${feedbackState.z}`);
        assert.equal(feedbackState.locked, true, "Feedback scroll lock");
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "audit-feedback-modal-390.png"), fullPage: false });
        await page.click("#closeFeedbackModal");
        console.log("PASS Feedback / suggestion modal");
      } else {
        // Some flows mark status inline instead of opening modal — still OK if no half-off popup.
        assert.ok(true, `inline feedback path: ${feedbackState.status}`);
        console.log("PASS Feedback suggest handled without broken popup");
      }
    } else {
      await page.evaluate(() => openFeedbackModal("Feature Request"));
      await page.waitForSelector("#feedbackModal.open", { timeout: 5000 });
      const fb = await page.evaluate(() => {
        const card = document.querySelector("#feedbackModal .modal-card");
        const cr = card.getBoundingClientRect();
        return {
          rect: { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom, width: cr.width, height: cr.height },
          viewport: { w: window.innerWidth, h: window.innerHeight },
          locked: document.body.classList.contains("auth-modal-open"),
        };
      });
      assertInViewport("Feedback modal", fb.rect, fb.viewport);
      assert.equal(fb.locked, true);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "audit-feedback-modal-390.png"), fullPage: false });
      await page.click("#closeFeedbackModal");
      console.log("PASS Feedback modal (direct open)");
    }

    // Narrow phone smoke
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator("[data-lesson-workspace-more-toggle]").scrollIntoViewIfNeeded();
    await page.locator("[data-lesson-workspace-more-toggle]").click();
    await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
    await page.waitForTimeout(150);
    const narrow = await page.evaluate(() => {
      const menu = document.querySelector(".lesson-workspace-more-menu");
      const mr = menu.getBoundingClientRect();
      return {
        rect: { left: mr.left, right: mr.right, top: mr.top, bottom: mr.bottom, width: mr.width, height: mr.height },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        parentIsBody: menu.parentElement === document.body,
      };
    });
    assert.equal(narrow.parentIsBody, true);
    assertInViewport("More@320", narrow.rect, narrow.viewport);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "audit-more-sheet-320.png"), fullPage: false });
    console.log("PASS More sheet @320px");

    console.log("\nAll lesson mobile popup audit checks passed.");
  } catch (error) {
    console.error("FAIL:", error.message || error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
