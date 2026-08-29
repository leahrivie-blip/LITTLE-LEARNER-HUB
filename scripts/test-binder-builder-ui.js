#!/usr/bin/env node
/**
 * Binder Builder — browser UI regression (Owner Admin entry, form stability, print chrome).
 * Run: npm run test:binder-builder-ui
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");
const { unlockAdminInBrowser } = require("./lib/admin-browser-unlock.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(5300, 400);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-bb-ui-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "binder-ui-pass",
  code: "binder-ui-code",
};

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function seedStore() {
  const lesson = {
    id: "cur-lp-bb-ui-preschool",
    title: "Preschool Binder UI Lesson",
    age: "Preschool",
    theme: "Ocean Friends",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Explore ocean creatures through play.",
    objectives: "Build curiosity and vocabulary.",
    weeklyMaterials: "NEVER PRINT THIS MATERIALS LIST",
    familyConnection: "Talk about water play at home.",
    coverImageUrl: "/images/lesson-covers/default.svg",
    coverImageAlt: "Ocean cover",
    books: [{ title: "Hello Ocean", author: "Test Author", whyThisBook: "Calming water theme." }],
    songs: [{ title: "Row Gently", whenToUse: "Transition", motions: "Row arms.", teacherDirections: "Sing softly." }],
    dailyPlans: {
      monday: {
        theme: "Wave Hello",
        items: [{
          itemId: "act-1",
          title: "Blue Water Bin",
          description: "Explore water with cups.",
          steps: ["Fill a shallow bin.", "Offer cups.", "Talk about pouring."],
          activityCategory: "Sensory Play",
        }],
      },
      tuesday: { theme: "Shell Sort", items: [{ itemId: "act-2", title: "Shell Sorting", description: "Sort shells.", steps: ["Offer shells.", "Sort by size."], activityCategory: "Fine Motor" }] },
      wednesday: { theme: "Fish Move", items: [{ itemId: "act-3", title: "Fish Dance", description: "Move like fish.", steps: ["Wiggle.", "Swim arms."], activityCategory: "Gross Motor" }] },
      thursday: { theme: "Boat Build", items: [{ itemId: "act-4", title: "Block Boats", description: "Build boats.", steps: ["Offer blocks.", "Build."], activityCategory: "Open-Ended Exploration" }] },
      friday: { theme: "Ocean Share", items: [{ itemId: "act-5", title: "Favorite Sea Friend", description: "Share favorites.", steps: ["Circle time share."], activityCategory: "Literacy" }] },
    },
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    siteContent: {
      curriculum: { lessonPlans: [lesson], activities: [], resources: [], series: [] },
      updatedAt: new Date().toISOString(),
    },
    binderBuilder: { drafts: [], updatedAt: "" },
    users: {},
  }, null, 2));
}

function startServer() {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(child) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (child.exitCode != null) throw new Error(`Server exited: ${child.exitCode}`);
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

async function main() {
  console.log("Binder Builder UI tests");
  seedStore();
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(child);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await unlockAdminInBrowser(page, BASE, OWNER);

    await page.evaluate(() => {
      if (typeof setAdminGroup === "function") setAdminGroup("content");
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-binder-builder");
    });
    await page.waitForSelector("#adminBinderBuilderApp .bb-admin", { timeout: 30000 });
    ok(true, "Owner Admin can open Binder Builder");

    const heading = await page.locator("#adminBinderBuilderApp h2").textContent();
    ok(/Binder Builder/i.test(heading || ""), "Binder Builder heading visible");

    // Tablet viewport still usable
    await page.setViewportSize({ width: 900, height: 1100 });
    ok(await page.locator("[data-bb-select-lesson]").count() >= 1, "lesson cards visible on tablet width");

    await page.locator("[data-bb-select-lesson]").first().click();
    await page.waitForSelector('[data-bb-field="welcomeCopy"]', { timeout: 30000 });
    ok(true, "selecting a lesson opens configure step");

    const typed = `Stable welcome copy ${Date.now()} must survive chrome-only re-render.`;
    await page.fill('[data-bb-field="welcomeCopy"]', typed);

    // Simulate admin dashboard re-render / mount without wiping fields
    await page.evaluate(() => {
      if (window.LLHBinderBuilderUi) window.LLHBinderBuilderUi.mount();
    });
    const afterMount = await page.inputValue('[data-bb-field="welcomeCopy"]');
    ok(afterMount === typed, "typed Binder Builder fields remain stable through Admin remount");

    // Explicit blank welcome: clear → save → reopen path → remount → stays blank
    const defaultWelcomeSnippet = "This binder is organized by day";
    await page.fill('[data-bb-field="welcomeCopy"]', "");
    await page.locator('[data-bb-action="save"]').first().click();
    await page.waitForTimeout(400);
    ok((await page.inputValue('[data-bb-field="welcomeCopy"]')) === "", "cleared welcome stays blank after save");
    await page.evaluate(() => {
      if (window.LLHBinderBuilderUi) window.LLHBinderBuilderUi.mount();
    });
    ok((await page.inputValue('[data-bb-field="welcomeCopy"]')) === "", "cleared welcome stays blank after remount");
    await page.locator('[data-bb-step="review"]').click();
    await page.locator('[data-bb-step="configure"]').click();
    await page.waitForSelector('[data-bb-field="welcomeCopy"]', { timeout: 15000 });
    ok((await page.inputValue('[data-bb-field="welcomeCopy"]')) === "", "cleared welcome stays blank after step change");
    await page.locator('[data-bb-action="preview"]').click();
    await page.waitForSelector(".bb-preview-frame .bb-page-cover", { timeout: 30000 });
    const blankPreview = await page.locator(".bb-preview-frame").innerText();
    ok(!new RegExp(defaultWelcomeSnippet, "i").test(blankPreview), "blank welcome preview omits default copy");
    // Return to configure for remaining flow; restore typed content so later remount checks stay meaningful
    await page.locator('[data-bb-step="configure"]').click();
    await page.waitForSelector('[data-bb-field="welcomeCopy"]', { timeout: 15000 });
    await page.fill('[data-bb-field="welcomeCopy"]', typed);
    await page.locator('[data-bb-action="save"]').first().click();
    await page.waitForTimeout(300);

    await page.locator('[data-bb-step="review"]').click();
    await page.waitForSelector("[data-bb-activity]", { timeout: 15000 });
    ok(await page.locator("[data-bb-activity]").count() >= 1, "review shows activities");

    await page.locator('[data-bb-act-field="includedResources"]').first().fill("Color matching cards\nArt template");
    await page.locator('[data-bb-step="configure"]').click();
    await page.locator('[data-bb-step="review"]').click();
    const included = await page.locator('[data-bb-act-field="includedResources"]').first().inputValue();
    ok(/Color matching cards/.test(included), "included resources persist across step changes");

    // Invalid QR warning
    const urlInput = page.locator('[data-bb-book-field="resourceUrl"]').first();
    if (await urlInput.count()) {
      await urlInput.fill("not-a-valid-url");
      await page.waitForTimeout(200);
      ok(await page.locator(".bb-url-warn").count() >= 1, "invalid QR URL shows owner warning");
      await urlInput.fill("https://example.com/story");
      await page.waitForTimeout(200);
    }

    await page.locator('[data-bb-action="preview"]').click();
    await page.waitForSelector(".bb-preview-frame .bb-page-cover", { timeout: 30000 });
    ok(true, "preview binder renders cover");
    ok(await page.locator('.bb-preview-frame [data-bb-page="dayDivider"]').count() === 5, "five day dividers in preview");
    const previewText = await page.locator(".bb-preview-frame").innerText();
    ok(!/NEVER PRINT THIS MATERIALS LIST/i.test(previewText), "materials list absent from preview");
    ok(!/data-bb-admin-chrome/.test(await page.locator(".bb-preview-frame").innerHTML()), "admin chrome not inside preview pages");

    await page.locator('[data-bb-action="readiness"]').click();
    await page.waitForSelector("[data-bb-readiness-status]", { timeout: 15000 });
    const status = await page.locator("[data-bb-readiness-status]").textContent();
    ok(/READY|NEEDS REVIEW/.test(status || ""), "readiness status shown");

    // Print CSS: admin chrome marked for hide
    const printCss = fs.readFileSync(path.join(ROOT, "styles/binder-builder.css"), "utf8");
    ok(/printing-binder-builder/.test(printCss), "print stylesheet hides admin via printing-binder-builder");
    ok(/size:\s*letter/i.test(printCss), "US Letter page size configured");

    // Smaller laptop check
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.locator('[data-bb-step="preview"]').click();
    ok(await page.locator(".bb-preview-frame .bb-page").count() >= 8, "preview pages remain on laptop viewport");

    // Narrow mobile admin usability
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-bb-step="configure"]').click();
    await page.waitForSelector('[data-bb-field="welcomeCopy"]', { timeout: 15000 });
    const welcomeBox = await page.locator('[data-bb-field="welcomeCopy"]').boundingBox();
    const saveBtn = page.locator('[data-bb-action="save"]').first();
    const saveBox = await saveBtn.boundingBox();
    ok(welcomeBox && welcomeBox.width > 200, "welcome field usable on narrow mobile width");
    ok(saveBox && saveBox.x + saveBox.width <= 390 + 1, "save button reachable within mobile viewport");
    const overflowX = await page.evaluate(() => document.querySelector("#adminBinderBuilderApp")?.scrollWidth > document.querySelector("#adminBinderBuilderApp")?.clientWidth + 8);
    ok(!overflowX, "Binder Builder admin does not horizontally overflow on mobile");

    // Public lesson browsing unchanged — homepage still loads
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    ok(true, "public homepage still loads after Binder Builder use");

    console.log(`\nAll Binder Builder UI checks passed (${passed}).`);
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nBinder Builder UI tests failed:", error);
  process.exit(1);
});
