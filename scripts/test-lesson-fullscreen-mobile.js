#!/usr/bin/env node
/**
 * Mobile lesson viewer must be a true full-screen page:
 * opaque cover, single scroll, pinned header/tabs, actions in flow.
 * Run: node scripts/test-lesson-fullscreen-mobile.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19880 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-fs-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const WIDTHS = [320, 375, 390, 412, 430];
const ADMIN = {
  email: "lesson-fs-admin@test.local",
  password: "lesson-fs-pass",
  code: "lesson-fs-code",
};
const MEMBER = "lesson-fs-member@example.com";

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

async function seedLesson(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(sample, "utf8"));
  assert.equal(parsed.ok, true, parsed.error || "parse failed");
  const bootstrap = await request("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await request("POST", "/api/admin/site-content", {
    body: {
      adminToken: token,
      siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
    },
  });
  const planId = `cur-lp-fs-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Fullscreen Mobile Lesson Plan";
  const save = await request("POST", "/api/admin/curriculum/lesson-plans", {
    body: {
      adminToken: token,
      expectedUpdatedAt: touch.json.siteContent.updatedAt,
      lessonPlan: {
        ...parsed.data,
        id: planId,
        title,
        plan: "Free",
        status: "published",
        age: "Preschool",
        theme: "Fullscreen",
      },
    },
  });
  assert.ok([200, 201].includes(save.status), `seed failed ${save.status}`);
  return { id: planId, title };
}

function staticChecks() {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(css, /body\.lesson-workspace-open/);
  assert.match(css, /lesson-workspace-topchrome/);
  assert.match(css, /visibility:\s*hidden/);
  assert.match(app, /lesson-workspace-open/);
  assert.match(app, /classList\.add\("resource-viewer-open"\)/);
  assert.match(html, /app\.js\?v=20260721-pwa-cold-start/);
  console.log("PASS static fullscreen lesson markers");
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
  await page.waitForFunction(() => typeof isLoggedIn === "function" && isLoggedIn(), null, { timeout: 30000 });
  await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
  await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 15000 });
  await page.fill("#view-lessons.active-view #lessonPlanSearch", lesson.title);
  await page.waitForTimeout(350);
  await page.evaluate(() => window.scrollTo(0, 420));
  await page.waitForTimeout(100);
  const libraryY = await page.evaluate(() => window.scrollY || 0);
  await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: lesson.title }).first().click({ force: true });
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 15000 });
  await page.waitForTimeout(200);
  return libraryY;
}

async function assertFullscreen(page, label) {
  const metrics = await page.evaluate(() => {
    const modal = document.querySelector("#resourceViewerModal");
    const card = document.querySelector(".resource-viewer-card");
    const workspace = document.querySelector(".lesson-workspace");
    const panels = document.querySelector(".lesson-workspace-panels");
    const actions = document.querySelector(".lesson-workspace-action-bars");
    const chrome = document.querySelector(".lesson-workspace-topchrome");
    const main = document.querySelector(".main");
    const mr = modal.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const bg = getComputedStyle(modal).backgroundColor;
    const parseAlpha = (color) => {
      const m = String(color).match(/rgba?\(([^)]+)\)/);
      if (!m) return 1;
      const parts = m[1].split(",").map((p) => p.trim());
      return parts.length === 4 ? Number(parts[3]) : 1;
    };
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      modal: { left: mr.left, top: mr.top, width: mr.width, height: mr.height },
      card: { left: cr.left, top: cr.top, width: cr.width, height: cr.height },
      bgAlpha: parseAlpha(bg),
      bodyClasses: {
        resource: document.body.classList.contains("resource-viewer-open"),
        lesson: document.body.classList.contains("lesson-workspace-open"),
      },
      mainVisibility: main ? getComputedStyle(main).visibility : "missing",
      workspaceOverflowY: workspace ? getComputedStyle(workspace).overflowY : "",
      panelsOverflowY: panels ? getComputedStyle(panels).overflowY : "",
      actionsPosition: actions ? getComputedStyle(actions).position : "",
      chromeSticky: chrome ? getComputedStyle(chrome).position : "",
      chromeTop: chrome ? getComputedStyle(chrome).top : "",
    };
  });

  assert.equal(metrics.bodyClasses.resource, true, `${label}: resource-viewer-open missing`);
  assert.equal(metrics.bodyClasses.lesson, true, `${label}: lesson-workspace-open missing`);
  assert.ok(metrics.modal.left <= 1 && metrics.modal.top <= 1, `${label}: modal not edge-to-edge`);
  assert.ok(Math.abs(metrics.modal.width - metrics.viewport.w) <= 2, `${label}: modal width ${metrics.modal.width}`);
  assert.ok(metrics.modal.height >= metrics.viewport.h - 2, `${label}: modal height ${metrics.modal.height} < ${metrics.viewport.h}`);
  assert.ok(Math.abs(metrics.card.width - metrics.viewport.w) <= 2, `${label}: card not full width`);
  assert.ok(metrics.card.height >= metrics.viewport.h - 2, `${label}: card not full height`);
  assert.ok(metrics.bgAlpha >= 0.99, `${label}: modal background must be opaque (alpha ${metrics.bgAlpha})`);
  assert.equal(metrics.mainVisibility, "hidden", `${label}: library main must be hidden`);
  assert.ok(metrics.workspaceOverflowY === "auto" || metrics.workspaceOverflowY === "scroll", `${label}: workspace should be the page scroller`);
  assert.ok(metrics.panelsOverflowY === "visible" || metrics.panelsOverflowY === "clip" || metrics.panelsOverflowY === "hidden", `${label}: panels must not nest-scroll (${metrics.panelsOverflowY})`);
  // "hidden" would be wrong for panels if we set visible - we set visible. Accept visible.
  assert.equal(metrics.panelsOverflowY, "visible", `${label}: panels overflow should be visible`);
  assert.equal(metrics.actionsPosition, "static", `${label}: actions must be in normal flow`);
  assert.equal(metrics.chromeSticky, "sticky", `${label}: header/tabs chrome should stick`);
  return metrics;
}

async function main() {
  staticChecks();
  const playwright = require("playwright");
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await request("POST", "/api/admin/login", {
      body: { email: ADMIN.email, password: ADMIN.password, code: ADMIN.code },
    });
    assert.equal(login.status, 200);
    const lesson = await seedLesson(login.json.token);
    browser = await playwright.chromium.launch({ headless: true });

    for (const width of WIDTHS) {
      const page = await browser.newPage({
        viewport: { width, height: width <= 375 ? 667 : 844 },
        deviceScaleFactor: 2,
      });
      const libraryY = await openLesson(page, lesson);
      await assertFullscreen(page, `${width}px`);

      // Single-page scroll reaches actions + feedback without a nested scroller.
      await page.evaluate(() => {
        const workspace = document.querySelector(".lesson-workspace");
        workspace.scrollTop = workspace.scrollHeight;
      });
      await page.waitForTimeout(150);
      const endState = await page.evaluate(() => {
        const actions = document.querySelector(".lesson-workspace-action-bars");
        const feedback = document.querySelector("[data-lesson-feedback-root]");
        const ar = actions.getBoundingClientRect();
        const fr = feedback ? feedback.getBoundingClientRect() : null;
        return {
          actionsInView: ar.top < window.innerHeight && ar.bottom > 0,
          feedbackInView: fr ? fr.top < window.innerHeight && fr.bottom > 0 : true,
          panelsScroll: document.querySelector(".lesson-workspace-panels")?.scrollTop || 0,
        };
      });
      assert.equal(endState.actionsInView, true, `${width}: actions should be reachable by page scroll`);
      assert.equal(endState.feedbackInView, true, `${width}: feedback should be reachable by page scroll`);
      assert.equal(endState.panelsScroll, 0, `${width}: nested panels must not scroll`);

      await page.screenshot({ path: path.join(ARTIFACT_DIR, `lesson-fullscreen-${width}.png`), fullPage: false });

      // Close restores library scroll position.
      await page.click("#closeResourceViewer");
      await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
      await page.waitForTimeout(120);
      const restored = await page.evaluate(() => ({
        y: window.scrollY || 0,
        open: document.body.classList.contains("lesson-workspace-open"),
        mainVisibility: getComputedStyle(document.querySelector(".main")).visibility,
        captured: typeof lessonLibraryScrollY === "number" ? lessonLibraryScrollY : null,
      }));
      assert.equal(restored.open, false, `${width}: lesson class cleared`);
      assert.equal(restored.mainVisibility, "visible", `${width}: library visible again`);
      const expectedY = restored.captured == null ? libraryY : restored.captured;
      assert.ok(Math.abs(restored.y - expectedY) <= 12, `${width}: library scroll restored (${expectedY} -> ${restored.y})`);
      console.log(`PASS fullscreen lesson @${width}px`);
      await page.close();
    }

    console.log("\nAll mobile lesson fullscreen checks passed.");
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
