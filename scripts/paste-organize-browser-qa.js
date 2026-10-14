#!/usr/bin/env node
/**
 * End-to-end browser QA for Paste and Organize (PR #892).
 * Usage: node scripts/paste-organize-browser-qa.js
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { ensureEnrichmentEditorOpen, clickEnrichmentMode, hideCookieConsentChrome } = require("./test-helpers/tk-enrich-playwright.js");

const ROOT = path.join(__dirname, "..");
const FIXTURE = path.join(ROOT, "scripts/fixtures/my-first-halloween-infant-paste.txt");
const ARTIFACT_DIR = "/opt/cursor/artifacts/paste-organize-browser-qa";

const ADMIN = {
  email: process.env.LLH_SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "",
  password: process.env.LLH_SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "PasteQaAdmin!234",
  accessCode: process.env.LLH_SMOKE_ADMIN_CODE || process.env.ADMIN_ACCESS_CODE || "PASTEQA1",
};

const results = { passed: [], failed: [], warnings: [], consoleErrors: [] };

function pass(name, detail = "") {
  results.passed.push({ name, detail });
  console.log(`PASS: ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.failed.push({ name, detail });
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}
function warn(name, detail = "") {
  results.warnings.push({ name, detail });
  console.warn(`WARN: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForServer(baseUrl, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server did not become ready");
}

function startServer() {
  const port = 20620 + Math.floor(Math.random() * 40);
  const baseUrl = `http://127.0.0.1:${port}`;
  const storePath = path.join(ROOT, "server/data/.paste-organize-browser-qa-store.json");
  fs.writeFileSync(
    storePath,
    JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2),
  );
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: baseUrl,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.accessCode,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(d));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 90000);
    (async () => {
      try {
        for (let i = 0; i < 100; i += 1) {
          if (child.exitCode !== null) throw new Error("Server exited early");
          try {
            await waitForServer(baseUrl, 500);
            clearTimeout(timeout);
            resolve({ child, baseUrl, storePath });
            return;
          } catch (_) {
            await new Promise((r) => setTimeout(r, 200));
          }
        }
        throw new Error("Server did not become ready");
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    })();
    child.on("error", reject);
  });
}

async function adminLogin(page, baseUrl) {
  await page.addInitScript(() => {
    try { localStorage.setItem("llhMetaCookieNoticeDismissed", "1"); } catch { /* ignore */ }
  });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
  await page.evaluate(() => setView("admin"));
  await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
  await page.fill('input[name="adminEmail"]', ADMIN.email);
  await page.fill('input[name="adminPassword"]', ADMIN.password);
  await page.fill('input[name="adminCode"]', ADMIN.accessCode);
  await page.click("#adminUnlockForm button[type='submit']");
  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
  await page.evaluate(() => {
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
  });
  await hideCookieConsentChrome(page);
  await page.waitForFunction(
    () => typeof globalThis.LLHLessonPasteOrganizerParser?.parseDeterministicPaste === "function",
    null,
    { timeout: 45000 },
  );
}

async function screenshot(page, name) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function run() {
  if (!ADMIN.email) {
    fail("Admin credentials", "Set LLH_SMOKE_ADMIN_EMAIL (owner alias) for enrichment editor QA");
    process.exit(1);
  }
  if (!fs.existsSync(FIXTURE)) {
    fail("fixture", FIXTURE);
    process.exit(1);
  }
  const pasteText = fs.readFileSync(FIXTURE, "utf8");
  let server;
  const browser = await chromium.launch({ headless: true });
  try {
    server = await startServer();
    const { baseUrl } = server;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") results.consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => results.consoleErrors.push(String(err.message || err)));

    await adminLogin(page, baseUrl);

    const createBtn = page.locator("#adminCreateCurriculumLessonPlanButton");
    await createBtn.waitFor({ state: "visible", timeout: 15000 });
    await createBtn.click();
    await page.waitForTimeout(600);

    const pasteStart = page.locator("[data-paste-organize-start]");
    if (!(await pasteStart.isVisible())) {
      fail("Paste and Organize entry visible");
    } else {
      pass("Paste and Organize entry visible");
      await pasteStart.click();
    }

    await page.locator("#adminPasteOrganizeText").waitFor({ state: "visible" });
    await page.locator("#adminPasteOrganizeText").fill(pasteText);
    await page.locator("[data-paste-organize-parse]").click();
    await page.waitForTimeout(1500);

    const reviewBody = (await page.locator(".lesson-paste-organizer-review").textContent()) || "";
    if (/My First Halloween/i.test(reviewBody)) pass("Review lesson title");
    else fail("Review lesson title");

    const activityChecks = [
      "Pumpkin Footprint Keepsake",
      "Orange and Black Texture Exploration",
      "Ghost Peekaboo and Face-to-Face Movement",
      "Pumpkin Water Painting",
      "Halloween Color Scarf Movement",
    ];
    for (const t of activityChecks) {
      if (reviewBody.includes(t)) pass(`Review activity: ${t}`);
      else fail(`Review activity visible: ${t}`);
    }
    if (/Gentle Halloween Sensory/i.test(reviewBody)) pass("Review theme");
    else fail("Review theme");
    if (/Infant 0/i.test(reviewBody)) pass("Review age group");
    else fail("Review age group");
    if (/Setup image brief/i.test(reviewBody) && /Finished example brief/i.test(reviewBody)) {
      pass("Review shows image brief fields in structure preview");
    } else warn("Review image brief rows", "check structure preview section");
    if (/Gentle Halloween family photo strip/i.test(reviewBody)) pass("Review printable in preview");
    else fail("Review printable in preview");
    if (/Cover image instructions/i.test(reviewBody) && /Realistic photo/i.test(reviewBody)) {
      pass("Review cover image instructions");
    } else fail("Review cover image instructions");

    await screenshot(page, "01-review");

    const saveDraft = page.locator("[data-paste-organize-save-draft]");
    if (await saveDraft.isDisabled()) fail("Save draft enabled after clean parse");
    else {
      pass("Save draft enabled");
      await saveDraft.click();
      await page.waitForFunction(
        () => Boolean(
          window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId
          || (typeof curriculumLessonPlansForAdmin === "function"
            && curriculumLessonPlansForAdmin().some((p) => /My First Halloween/i.test(p.title || ""))),
        ),
        null,
        { timeout: 45000 },
      );
      pass("Draft saved (editor or curriculum list)");
    }

    let lessonId = "";
    try {
      await ensureEnrichmentEditorOpen(page, { timeoutMs: 25000 });
      pass("Enrichment editor open after save");
      lessonId = await page.evaluate(() => window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "");
      lessonId = await page.evaluate(() => window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "");
      const shell = page.locator(".tk-enrich-shell");
      const editorText = (await shell.textContent()) || "";
      if (editorText.includes("Pumpkin Footprint Keepsake")) pass("Editor shows Monday activity title");
      else fail("Editor activity title");

      const setupBrief = page.locator("[data-image-brief-setup]").first();
      const exampleBrief = page.locator("[data-image-brief-example]").first();
      await setupBrief.scrollIntoViewIfNeeded().catch(() => {});
      if (await setupBrief.count()) {
        const v = await setupBrief.inputValue().catch(() => "");
        if (v.length > 15) pass("Image setup brief in editor", v.slice(0, 60));
        else fail("Image setup brief in editor", v || "(empty)");
      } else fail("Image setup brief field present");

      await exampleBrief.scrollIntoViewIfNeeded().catch(() => {});
      if (await exampleBrief.count()) {
        const v = await exampleBrief.inputValue().catch(() => "");
        if (v.length > 10) pass("Image example brief in editor");
        else fail("Image example brief empty");
      } else fail("Image example brief field present");

      const monObjective = page.locator('[data-core-field="objective"]').first();
      if (await monObjective.isVisible()) {
        const ov = await monObjective.inputValue().catch(() => "");
        if (/bonding|footprint/i.test(ov)) pass("Monday objective in editor", ov.slice(0, 55));
        else fail("Monday objective in editor", ov);
      }

      const hasGeneratedImage = await page.evaluate(() => {
        const shell = document.querySelector(".tk-enrich-shell");
        return Boolean(shell?.textContent?.includes("Generated") && shell?.querySelector("img[src*='http']"));
      });
      if (!hasGeneratedImage) pass("No false generated activity images shown");
      else warn("Generated images", "unexpected image URLs in editor");

      await clickEnrichmentMode(page, "week");
      await page.waitForTimeout(400);
      const weekSection = page.locator("#tk-week-printables, [data-enrich-week-printables]");
      if (await weekSection.isVisible().catch(() => false)) {
        pass("Week printables section visible");
        const weekText = (await weekSection.textContent()) || "";
        if (/Gentle Halloween family photo strip/i.test(weekText)) pass("Printable idea visible in Week tab");
        else fail("Printable idea in Week tab", weekText.slice(0, 120));
      } else fail("Week printables section");

      const weekBooks = page.locator("#tk-week-books");
      if ((await weekBooks.textContent().catch(() => "")).includes("Peek-a-Who")) pass("Week books visible");
      else warn("Week books", "Peek-a-Who not visible in Week tab");

      const coverField = page.locator("[data-week-cover-image-instructions]");
      await coverField.scrollIntoViewIfNeeded().catch(() => {});
      const coverBefore = await coverField.inputValue().catch(() => "");
      if (/Realistic photo/i.test(coverBefore)) pass("Cover image instructions populated in Week tab");
      else fail("Cover instructions in Week tab", coverBefore.slice(0, 80));
      const coverEdit = `${coverBefore}\nBrowser QA cover edit line.`;
      await coverField.fill(coverEdit);
      await page.locator("[data-enrich-save-draft]").click();
      await page.waitForTimeout(2500);

      await screenshot(page, "02-enrichment-editor");

      await page.evaluate(async () => {
        if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
          await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true });
        }
      });
      await page.waitForTimeout(1000);
    } catch (err) {
      fail("Enrichment editor after save", String(err.message || err));
    }

    if (lessonId) {
      await page.evaluate(async () => {
        if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
          await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true });
        }
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        if (typeof renderAdminCurriculumLessonPlanManager === "function") {
          renderAdminCurriculumLessonPlanManager();
        }
        if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
      });
      const editBtn = page.locator(`[data-curriculum-lesson-edit="${lessonId}"]`);
      await editBtn.waitFor({ state: "visible", timeout: 20000 });
      await editBtn.click();
      try {
        await ensureEnrichmentEditorOpen(page, { timeoutMs: 20000 });
        pass("Reopened draft via Lesson Plans Edit");
        await page.locator('[data-core-field="objective"]').first().waitFor({ state: "visible", timeout: 10000 });
        const reopenObjective = await page.locator('[data-core-field="objective"]').first().inputValue();
        if (/bonding|footprint/i.test(reopenObjective)) pass("Reopen: objective still populated");
        else fail("Reopen: objective", reopenObjective);

        const tuesdayTab = page.locator('[data-enrich-activity-id="tuesday"], [data-activity-day="tuesday"]').first();
        if (await tuesdayTab.isVisible().catch(() => false)) {
          await tuesdayTab.click();
          await page.waitForTimeout(400);
        } else {
          await page.evaluate(() => {
            const ed = window.LLHTeachingKitEnrichmentEditor;
            if (ed?.jumpToActivity) ed.jumpToActivity("tuesday");
          });
          await page.waitForTimeout(400);
        }
        const shellText = (await page.locator(".tk-enrich-shell").textContent()) || "";
        if (/Orange and Black Texture/i.test(shellText)) pass("Reopen: Tuesday activity content present");
        else fail("Reopen: Tuesday activity");

        await clickEnrichmentMode(page, "week");
        const printableAfterReopen = (await page.locator("#tk-week-printables").textContent()) || "";
        if (/family photo strip/i.test(printableAfterReopen)) pass("Reopen: printable still visible");
        else fail("Reopen: printable missing");

        const coverAfterReopen = await page.locator("[data-week-cover-image-instructions]").inputValue().catch(() => "");
        if (/Browser QA cover edit line/i.test(coverAfterReopen)) pass("Reopen: cover instructions edit preserved");
        else fail("Reopen: cover instructions", coverAfterReopen.slice(0, 100));

        await screenshot(page, "03-reopen-draft");
        await page.evaluate(async () => {
          if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
            await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true });
          }
        });
      } catch (err) {
        fail("Reopen draft via admin UI", String(err.message || err));
      }
    } else fail("Captured lesson id after save");

    await page.evaluate(async () => {
      if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
        await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true });
      }
      if (typeof resetAdminCreateLessonPlanUi === "function") resetAdminCreateLessonPlanUi();
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
    });
    await page.waitForSelector("#adminCreateCurriculumLessonPlanButton", { timeout: 20000 });
    await createBtn.click();
    await page.waitForSelector("[data-paste-organize-start]", { timeout: 10000 });
    await page.locator("[data-paste-organize-start]").click();
    const conflictPaste =
      "Title:\nDup Obj\n\nAge Group:\nInfant 0–12 Months\n\nTheme:\nFall\n\nMonday:\nActivity name:\nOne\nActivity objective:\nFirst objective here.\nActivity objective:\nSecond different objective.\nMaterials:\nYarn\nSafety and supervision:\nAdult holds all items.\nStep-by-step directions:\n1. Do one thing.\n";
    await page.locator("#adminPasteOrganizeText").fill(conflictPaste);
    await page.locator("[data-paste-organize-parse]").click();
    await page.waitForTimeout(800);
    const conflictBody = (await page.locator(".lesson-paste-organizer-review").textContent()) || "";
    if (/CONFLICTS/i.test(conflictBody) && /daily\.monday\.dailyObjective|Conflict/i.test(conflictBody)) {
      pass("Duplicate objective shows conflict in review");
    } else fail("Duplicate objective conflict UI");
    const saveConflict = page.locator("[data-paste-organize-save-draft]");
    if (await saveConflict.isDisabled()) pass("Save blocked on unresolved conflicts");
    else fail("Save should be blocked on conflicts");

    await page.locator("[data-paste-organize-back]").click();
    await page.waitForTimeout(300);
    await page.locator("[data-create-lesson-cancel]").click();
    await createBtn.click();
    await page.waitForSelector("[data-create-lesson-start-blank]", { timeout: 10000 });
    const blankOpened = await page.evaluate(async () => {
      if (typeof startBlankAdminCurriculumLessonPlan !== "function") return false;
      await startBlankAdminCurriculumLessonPlan();
      return Boolean(window.LLHTeachingKitEnrichmentEditor?.isOpen?.());
    });
    if (blankOpened) pass("Start Blank still opens enrichment editor");
    else fail("Start Blank regression");
    if (blankOpened) {
      await page.evaluate(() => window.LLHTeachingKitEnrichmentEditor?.close?.({ force: true, abandonUnsaved: true }));
    }

    await context.close();
  } finally {
    await browser.close();
    if (server?.child) server.child.kill("SIGTERM");
  }

  console.log("\n=== SUMMARY ===");
  console.log("Passed:", results.passed.length);
  console.log("Failed:", results.failed.length);
  console.log("Warnings:", results.warnings.length);
  console.log("Console errors:", results.consoleErrors.length);
  if (results.consoleErrors.length) console.log(results.consoleErrors.slice(0, 8).join("\n"));
  process.exit(results.failed.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
