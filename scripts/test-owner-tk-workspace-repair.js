#!/usr/bin/env node
/**
 * Owner Teaching Kit workspace repair — disposable fixture coverage.
 *
 * Proves:
 * - Open Teaching Kit is the single primary lesson-card CTA
 * - Edit Lesson Basics opens forceClassic Lesson Basics and returns to TK
 * - Owner Live Preview does not silently autosave
 * - Save Draft is visually secondary; Publish remains primary
 * - Publish modal names the lesson + discloses draft printables
 * - Preview banner / Save Draft do not publish
 *
 * Run: npm run test:owner-tk-workspace-repair
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 7700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-tk-ws-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-tk-ws-pass",
  code: "owner-tk-ws-code",
};
const FIXTURE = "cur-lp-owner-tk-ws-fixture";
const SIBLING = "cur-lp-owner-tk-ws-sibling";
const DRAFT_RES = "cur-res-owner-tk-ws-draft";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function fp(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function plan(store, id) {
  return (store?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === id) || null;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const storeSeed = {
    users: {},
    adminSessions: {},
    siteContent: {
      updatedAt: "2026-01-02T00:00:00.000Z",
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitEnrichmentEditor: true,
        playBasedCurriculum: true,
      },
      curriculum: {
        updatedAt: "2026-01-02T00:00:00.000Z",
        lessonPlans: [
          {
            id: FIXTURE,
            title: "Owner Workspace Disposable Fixture",
            age: "Preschool",
            theme: "Workspace Repair",
            plan: "Pro",
            status: "published",
            weeklyOverview: "Published overview — must stay until Publish",
            objectives: "Keep published body",
            weeklyMaterials: "blocks",
            books: [],
            songs: [],
            resourceIds: [DRAFT_RES],
            disposableQaFixture: true,
            enrichmentDraft: {
              updatedAt: "2026-08-11T12:00:00.000Z",
              week: { weeklyOverview: "Draft overview for preview" },
              activities: {
                "item-owner-ws-1": { teacherTips: ["Tip before edit"] },
              },
            },
            enrichmentPublished: {
              week: { weeklyOverview: "Published enrichment overview" },
            },
            dailyPlans: {
              monday: {
                theme: "Mon",
                items: [{
                  itemId: "item-owner-ws-1",
                  title: "Disposable sorting tray",
                  objective: "Sort",
                  materials: "trays",
                  setup: "Lay out",
                  steps: "Sort cards",
                }],
              },
            },
            updatedAt: "2026-08-11T12:00:00.000Z",
            createdAt: "2026-08-11T11:00:00.000Z",
          },
          {
            id: SIBLING,
            title: "Owner Workspace Sibling Fixture",
            age: "Preschool",
            theme: "Sibling",
            plan: "Pro",
            status: "published",
            weeklyOverview: "Sibling must not change",
            ownershipMarker: "sibling-keep",
            disposableQaFixture: true,
            resourceIds: [],
            dailyPlans: { monday: { items: [] } },
            updatedAt: "2026-01-02T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        activities: [],
        resources: [{
          id: DRAFT_RES,
          title: "Disposable Draft Printable",
          type: "Printable",
          status: "draft",
          pageCount: 1,
          lessonPlanIds: [FIXTURE],
          accessLevel: "pro",
          disposableQaFixture: true,
          fileName: "draft.pdf",
          mimeType: "application/pdf",
          fileData: "data:application/pdf;base64,JVBERi0xLjE=",
          updatedAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        }],
        series: [],
      },
    },
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(storeSeed, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", OWNER);
    ok(login.status === 200 && login.json?.token, "owner login");
    const token = login.json.token;

    const siblingBefore = fp(plan(readStore(), SIBLING));
    const publishedOverviewBefore = plan(readStore(), FIXTURE).weeklyOverview;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof setAdminSession === "function" && typeof setView === "function",
      null,
      { timeout: 30000 },
    );
    await page.evaluate(({ owner, ownerToken }) => {
      setAdminSession({
        email: owner.email,
        name: "Owner",
        token: ownerToken,
        mode: "server",
        trustedDevice: true,
      });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
      localStorage.setItem("llhAdminActiveSection", "curriculum-lesson-plans");
    }, { owner: OWNER, ownerToken: token });
    await page.evaluate(async () => {
      if (typeof setView === "function") setView("admin");
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
    });
    await page.waitForSelector(`[data-curriculum-lesson-enrich="${FIXTURE}"]`, { timeout: 20000 });

    const cardCta = await page.evaluate((id) => {
      const openBtn = document.querySelector(`[data-curriculum-lesson-enrich="${id}"]`);
      const editBtn = document.querySelector(`[data-curriculum-lesson-edit="${id}"]`);
      return {
        openLabel: openBtn?.textContent || "",
        editPresent: Boolean(editBtn),
      };
    }, FIXTURE);
    ok(/Open Teaching Kit/i.test(cardCta.openLabel), "lesson card primary CTA is Open Teaching Kit");
    ok(!cardCta.editPresent, "duplicate Edit CTA removed from lesson card");

    await page.click(`[data-curriculum-lesson-enrich="${FIXTURE}"]`);
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 15000 });

    const chrome = await page.evaluate(() => {
      const save = document.querySelector("[data-enrich-save-draft]");
      const publish = document.querySelector("[data-enrich-publish]");
      return {
        kicker: document.querySelector(".tk-enrich-chrome-kicker")?.textContent || "",
        title: document.querySelector(".tk-enrich-chrome-title")?.textContent || "",
        status: document.querySelector("[data-owner-status-line]")?.textContent || "",
        saveClass: save?.className || "",
        publishClass: publish?.className || "",
        basics: Boolean(document.querySelector("[data-enrich-edit-basics]")),
        exit: Boolean(document.querySelector("[data-enrich-exit]")),
      };
    });
    ok(/Teaching Kit Editor/i.test(chrome.kicker), "header kicker Teaching Kit Editor");
    ok(/Owner Workspace Disposable Fixture/i.test(chrome.title), "header shows lesson title");
    ok(/Published to customers/i.test(chrome.status) && /draft/i.test(chrome.status), "status explains published + draft");
    ok(chrome.basics && chrome.exit, "Edit Lesson Basics + Back exit present");
    ok(/ghost-button/.test(chrome.saveClass) && !/primary-button/.test(chrome.saveClass), "Save Draft is secondary");
    ok(/primary-button/.test(chrome.publishClass), "Publish is primary");
    await page.screenshot({ path: path.join(OUT, "owner-tk-workspace-desktop-chrome.png"), fullPage: false });

    // Preview mode must not autosave dirty owner edits.
    await page.click('[data-enrich-mode="preview"]');
    await page.waitForSelector("[data-admin-preview-not-live]", { timeout: 10000 });
    const previewLabel = await page.textContent("[data-admin-preview-not-live]");
    ok(/ADMIN PREVIEW — NOT LIVE TO CUSTOMERS/i.test(previewLabel || ""), "preview labeled NOT LIVE");

    const draftFpBeforePreview = fp(plan(readStore(), FIXTURE).enrichmentDraft);
    await page.evaluate(() => {
      const editor = window.LLHTeachingKitEnrichmentEditor;
      const draft = editor.getDraft?.() || {};
      draft.week = { ...(draft.week || {}), weeklyOverview: `Preview dirty ${Date.now()}` };
      editor.markDirty?.({ autosave: true });
    });
    await page.waitForTimeout(1800);
    const draftFpAfterPreview = fp(plan(readStore(), FIXTURE).enrichmentDraft);
    ok(draftFpBeforePreview === draftFpAfterPreview, "Live Preview dirty edits do not silently persist");
    ok(plan(readStore(), FIXTURE).status === "published", "preview dirty path did not publish lesson");
    ok(plan(readStore(), FIXTURE).weeklyOverview === publishedOverviewBefore, "published body unchanged after preview dirty");

    // Explicit Save Draft persists draft only.
    await page.click('[data-enrich-mode="activities"]');
    await page.evaluate(() => {
      const editor = window.LLHTeachingKitEnrichmentEditor;
      const draft = editor.getDraft?.() || {};
      draft.week = { ...(draft.week || {}), weeklyOverview: "Saved owner draft overview" };
      editor.markDirty?.({ autosave: false });
    });
    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-enrich-status")?.textContent || "";
      return /Draft saved|saved/i.test(text) && !/failed/i.test(text);
    }, null, { timeout: 15000 });
    ok(plan(readStore(), FIXTURE).enrichmentDraft?.week?.weeklyOverview === "Saved owner draft overview", "Save Draft persisted enrichment draft");
    ok(plan(readStore(), FIXTURE).status === "published", "Save Draft did not change lesson status");
    ok(plan(readStore(), FIXTURE).weeklyOverview === publishedOverviewBefore, "Save Draft did not rewrite published overview");
    ok(fp(plan(readStore(), SIBLING)) === siblingBefore, "Save Draft left sibling untouched");

    // Publish modal disclosure
    await page.click("[data-enrich-publish]");
    await page.waitForSelector("[data-publish-modal]", { timeout: 10000 });
    const modalText = await page.textContent("[data-publish-modal]");
    ok(/Owner Workspace Disposable Fixture/i.test(modalText || ""), "publish confirm names the lesson");
    ok(/1 linked draft printable|will also publish/i.test(modalText || ""), "publish confirm discloses draft printable promotion");
    await page.locator(".tk-enrich-publish-actions [data-publish-cancel]").click({ force: true });
    await page.waitForFunction(() => !document.querySelector("[data-publish-modal]"), null, { timeout: 5000 });
    ok(plan(readStore(), FIXTURE).status === "published", "canceled publish left status published");
    ok(
      String(readStore().siteContent.curriculum.resources.find((r) => r.id === DRAFT_RES)?.status) === "draft",
      "canceled publish left printable draft",
    );

    // Edit Lesson Basics → forceClassic → back to TK (no save — avoid demoting published fixture).
    const statusBeforeBasics = plan(readStore(), FIXTURE).status;
    await page.click("[data-enrich-edit-basics]");
    await page.waitForSelector("#adminCurriculumLessonPlanForm", { timeout: 15000 });
    const basics = await page.evaluate(() => ({
      heading: document.querySelector("#adminCurriculumLessonPlanForm h4")?.textContent || "",
      back: document.querySelector("[data-curriculum-lesson-back]")?.textContent || "",
      forceForm: Boolean(document.querySelector('#adminCurriculumLessonPlanForm [name="title"]')),
      dayEditors: document.querySelectorAll("[data-curriculum-day-panel]").length,
      tkOpen: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
    }));
    ok(/Lesson Basics/i.test(basics.heading), "Lesson Basics heading present");
    ok(/Back to Teaching Kit/i.test(basics.back), "Back to Teaching Kit label present");
    ok(basics.forceForm && basics.dayEditors >= 5 && !basics.tkOpen, "forceClassic Lesson Basics form open; TK editor closed");
    await page.screenshot({ path: path.join(OUT, "owner-tk-lesson-basics-desktop.png"), fullPage: false });
    ok(plan(readStore(), FIXTURE).status === statusBeforeBasics, "opening Lesson Basics did not change lesson status");
    ok(fp(plan(readStore(), SIBLING)) === siblingBefore, "opening Lesson Basics left sibling untouched");

    await page.click("[data-curriculum-lesson-back]");
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 15000 });
    ok(true, "Back to Teaching Kit reopened TK workspace");

    // Mobile smoke
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const mobile = await page.evaluate(() => {
      const save = document.querySelector("[data-enrich-save-draft]");
      const publish = document.querySelector("[data-enrich-publish]");
      const status = document.querySelector("[data-owner-status-line], .tk-enrich-published-banner");
      const exit = document.querySelector("[data-enrich-exit]");
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      return {
        saveGhost: save && save.classList.contains("ghost-button"),
        publishPrimary: publish && publish.classList.contains("primary-button"),
        statusVisible: status && status.offsetParent !== null,
        exitVisible: exit && exit.offsetParent !== null,
        overflow,
      };
    });
    ok(mobile.saveGhost && mobile.publishPrimary, "mobile Save Draft secondary / Publish primary");
    ok(mobile.statusVisible, "mobile status/draft banner remains visible");
    ok(mobile.exitVisible, "mobile Back/exit remains visible");
    ok(!mobile.overflow, "mobile Teaching Kit chrome has no horizontal overflow");
    await page.screenshot({ path: path.join(OUT, "owner-tk-workspace-mobile-chrome.png"), fullPage: false });

    console.log(`\nPASS ${passed} checks — owner Teaching Kit workspace repair`);
  } catch (error) {
    console.error("\nFAIL", error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
