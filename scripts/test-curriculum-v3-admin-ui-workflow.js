#!/usr/bin/env node
/**
 * Browser regression: existing v3/label-only Admin importer.
 *
 * After a successful import/save this workflow still opens the classic
 * #adminCurriculumLessonPlanForm. Create New Lesson Plan / Full Lesson Paste
 * hand off to the Teaching Kit editor; this importer does not.
 *
 * Run: node scripts/test-curriculum-v3-admin-ui-workflow.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19610 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-v3-ui-${crypto.randomBytes(4).toString("hex")}.json`);
const V3_FULL = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const OCEAN = path.join(ROOT, "scripts/curriculum-import-samples/ocean-explorers-chatgpt-format.txt");
const ADMIN = {
  email: "v3-ui-test@test.local",
  password: "v3-ui-test-pass",
  code: "v3-ui-test-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function labeledField(text, label) {
  const match = String(text || "").match(new RegExp(`^\\s*${label}:\\s*\\n([^\\n]+)`, "im"));
  return String(match && match[1] ? match[1] : "").trim();
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
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
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
      const res = await requestJson("GET", "/api/health");
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

async function snapshotAdminLessons(page) {
  return page.evaluate(() => {
    const plans = typeof curriculumLessonPlansForAdmin === "function" ? curriculumLessonPlansForAdmin() : [];
    return plans.map((plan) => ({
      id: String(plan.id || ""),
      title: String(plan.title || ""),
      status: String(plan.status || "").toLowerCase(),
      updatedAt: String(plan.updatedAt || ""),
    }));
  });
}

async function openAdminImporter(page, { reload = true } = {}) {
  if (reload) {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => setView("admin"));
    const unlockForm = page.locator("#adminUnlockForm");
    if (await unlockForm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[name="adminEmail"]', ADMIN.email);
      await page.fill('input[name="adminPassword"]', ADMIN.password);
      await page.fill('input[name="adminCode"]', ADMIN.code);
      await page.click("#adminUnlockForm button[type='submit']");
      await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
    }
  } else {
    await page.evaluate(() => {
      if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
        window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true });
      }
      if (window.LLHLessonReviewEditor?.isOpen?.()) {
        window.LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true });
      }
      if (typeof adminCurriculumLessonEditorId !== "undefined") adminCurriculumLessonEditorId = "";
      if (typeof adminCurriculumLessonImportDraft !== "undefined") adminCurriculumLessonImportDraft = null;
      if (typeof resetAdminCreateLessonPlanUi === "function") resetAdminCreateLessonPlanUi();
      document.querySelector("#resourceViewerModal.open")?.classList.remove("open");
    });
  }
  await page.evaluate(() => {
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
    if (typeof renderAdminCurriculumLessonPlanManager === "function") renderAdminCurriculumLessonPlanManager();
  });
  await page.waitForSelector("#adminCurriculumLessonImportText", { timeout: 15000 });
  await page.waitForFunction(() => {
    const plans = typeof curriculumLessonPlansForAdmin === "function" ? curriculumLessonPlansForAdmin() : [];
    const loading = typeof adminCurriculumLoading !== "undefined" && adminCurriculumLoading === true;
    const mismatch = typeof adminCurriculumLoadMismatch === "function" ? adminCurriculumLoadMismatch() : null;
    return plans.length > 0 && !loading && !mismatch;
  }, null, { timeout: 30000 });
}

async function importerDebugSnapshot(page) {
  return page.evaluate(() => {
    const textarea = document.querySelector("#adminCurriculumLessonImportText");
    const importMsg = document.querySelector("#adminCurriculumLessonImportMessage");
    const banner = document.querySelector("#adminCurriculumLessonPlanMessage, #adminCurriculumLessonPlanBanner");
    const plans = typeof curriculumLessonPlansForAdmin === "function" ? curriculumLessonPlansForAdmin() : [];
    return {
      pasteLength: String(textarea?.value || "").length,
      importMsg: (importMsg?.textContent || "").slice(0, 240),
      banner: (banner?.textContent || "").slice(0, 240),
      preview: Boolean(document.querySelector(".curriculum-import-preview")),
      classicForm: Boolean(document.querySelector("#adminCurriculumLessonPlanForm")),
      tkOpen: Boolean(window.LLHTeachingKitEnrichmentEditor?.isOpen?.()),
      loading: typeof adminCurriculumLoading !== "undefined" ? adminCurriculumLoading : null,
      lessonCount: plans.length,
      ocean: plans.filter((plan) => /ocean explorers/i.test(plan.title || "")).map((plan) => `${plan.id}:${plan.title}`),
    };
  });
}

async function resolveImportPreviewIfNeeded(page, label, expectDuplicate = false) {
  try {
    await page.waitForFunction((duplicate) => {
      if (document.querySelector(".curriculum-import-preview") || document.querySelector("#adminCurriculumLessonPlanForm")) {
        return true;
      }
      if (duplicate && document.querySelector('[data-import-title-action="new-copy"]')) return true;
      const importMsg = document.querySelector("#adminCurriculumLessonImportMessage")?.textContent || "";
      return /paste a complete lesson plan|import blocked|parser is not available|already in progress/i.test(importMsg);
    }, expectDuplicate, { timeout: 25000 });
  } catch (error) {
    const snap = await importerDebugSnapshot(page);
    throw new Error(`${label}: no preview or classic editor after import click. ${JSON.stringify(snap)} | ${error.message}`);
  }
  const importMsg = await page.locator("#adminCurriculumLessonImportMessage").innerText().catch(() => "");
  if (/paste a complete lesson plan|import blocked|parser is not available/i.test(importMsg)) {
    throw new Error(`${label}: importer rejected paste: ${importMsg}`);
  }

  const previewCount = await page.locator(".curriculum-import-preview").count();
  const duplicateBtn = page.locator('[data-import-title-action="new-copy"]');
  if (previewCount === 0 && !(await duplicateBtn.count()) && !expectDuplicate) return false;

  if (expectDuplicate || await duplicateBtn.count()) {
    await page.evaluate(() => {
      if (typeof handleCurriculumImportDuplicateTitleAction === "function") {
        handleCurriculumImportDuplicateTitleAction("new-copy");
      }
    });
    await page.waitForFunction(() => {
      const preview = window.adminCurriculumLessonImportPreview?.preview
        || (typeof adminCurriculumLessonImportPreview !== "undefined" ? adminCurriculumLessonImportPreview?.preview : null);
      const confirm = document.querySelector("#adminCurriculumLessonConfirmImportButton");
      return Boolean(preview?.canConfirm) || (Boolean(confirm) && !confirm.disabled);
    }, null, { timeout: 10000 });
  }

  await page.evaluate(() => {
    if (typeof confirmCurriculumLessonPlanImport === "function") {
      confirmCurriculumLessonPlanImport();
    }
  });
  return true;
}

async function runImportSaveWorkflow(page, label, pasteText, expectedActivityCount, { reload = true } = {}) {
  const pasteTitle = labeledField(pasteText, "TITLE");
  const pasteStatus = labeledField(pasteText, "STATUS").toLowerCase();
  assert(pasteTitle, `${label}: fixture is missing TITLE`);

  await openAdminImporter(page, { reload });
  const before = await snapshotAdminLessons(page);
  const beforeIds = new Set(before.map((plan) => plan.id));
  const titleAlreadyExists = before.some((plan) => plan.title === pasteTitle);
  const expectedTitle = titleAlreadyExists ? `${pasteTitle} (Import copy)` : pasteTitle;
  const existingSameTitle = before.filter((plan) => plan.title === pasteTitle);

  const preflight = await page.evaluate((text) => {
    if (typeof adminCurriculumLessonImportTextCache !== "undefined") {
      adminCurriculumLessonImportTextCache = text;
    }
    const textarea = document.querySelector("#adminCurriculumLessonImportText");
    if (textarea) {
      textarea.value = text;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    let parsed = null;
    try {
      const built = typeof buildAdminCurriculumImportPreview === "function"
        ? buildAdminCurriculumImportPreview(text)
        : null;
      parsed = built ? {
        canConfirm: Boolean(built.preview?.canConfirm),
        duplicate: built.preview?.duplicateTitle?.status || "",
        existingId: built.preview?.duplicateTitle?.existingPlan?.id || "",
        errors: (built.preview?.errors || []).slice(0, 3).map((item) => item.message || item),
        title: built.preview?.data?.title || "",
      } : { error: "buildAdminCurriculumImportPreview missing" };
    } catch (error) {
      parsed = { error: error.message || String(error) };
    }
    return {
      hasTextarea: Boolean(textarea),
      pasteLength: String(textarea?.value || "").length,
      hasImportFn: typeof importAndSaveCurriculumLessonPlan === "function",
      parsed,
    };
  }, pasteText);
  assert(preflight.hasImportFn, `${label}: importAndSaveCurriculumLessonPlan is not available`);
  assert(!preflight.parsed?.error, `${label}: parser error: ${preflight.parsed?.error || ""}`);
  if (preflight.parsed?.duplicate === "duplicate") {
    const copyResult = await page.evaluate((text) => {
      const built = buildAdminCurriculumImportPreview(text);
      const previewApi = typeof curriculumImportPreviewApi === "function" ? curriculumImportPreviewApi() : null;
      if (!previewApi?.applyImportTitleAction) {
        return { ok: false, error: "preview API missing applyImportTitleAction" };
      }
      const updated = previewApi.applyImportTitleAction(built.preview, "new-copy");
      adminCurriculumLessonImportPreview = { ...built, preview: updated };
      adminCurriculumLessonImportPreviewText = text;
      adminCurriculumLessonImportTextCache = text;
      adminCurriculumLessonImportStep = "preview";
      if (typeof confirmCurriculumLessonPlanImport === "function") {
        confirmCurriculumLessonPlanImport();
      }
      return {
        ok: Boolean(updated?.canConfirm),
        title: updated?.data?.title || "",
        canConfirm: Boolean(updated?.canConfirm),
        editorId: typeof adminCurriculumLessonEditorId !== "undefined" ? adminCurriculumLessonEditorId : "",
        form: Boolean(document.querySelector("#adminCurriculumLessonPlanForm")),
      };
    }, pasteText);
    assert(copyResult.ok, `${label}: could not import duplicate title as a new copy (${copyResult.error || "canConfirm false"})`);
  } else {
    await page.evaluate(() => importAndSaveCurriculumLessonPlan());
    await resolveImportPreviewIfNeeded(page, label, false);
  }

  const afterConfirm = await page.evaluate(() => ({
    editorId: typeof adminCurriculumLessonEditorId !== "undefined" ? adminCurriculumLessonEditorId : "",
    importing: typeof adminCurriculumLessonImporting !== "undefined" ? adminCurriculumLessonImporting : null,
    saving: typeof adminCurriculumLessonSaving !== "undefined" ? adminCurriculumLessonSaving : null,
    importStep: typeof adminCurriculumLessonImportStep !== "undefined" ? adminCurriculumLessonImportStep : "",
    form: Boolean(document.querySelector("#adminCurriculumLessonPlanForm")),
    preview: Boolean(document.querySelector(".curriculum-import-preview")),
    focused: Boolean(document.querySelector("[data-tk-editor-focused-workspace]")),
    lreOpen: Boolean(window.LLHLessonReviewEditor?.isOpen?.()),
    banner: (document.querySelector("#adminCurriculumLessonPlanBanner")?.textContent || "").slice(0, 240),
    appText: (document.querySelector("#adminCurriculumLessonPlanApp")?.innerText || "").slice(0, 320),
  }));

  if (!afterConfirm.form) {
    await page.waitForSelector("#adminCurriculumLessonPlanForm", { state: "attached", timeout: 25000 });
  }

  const saveOutcome = await page.waitForFunction(() => {
    const text = document.querySelector("#adminCurriculumLessonPlanMessage, #adminCurriculumLessonPlanBanner")?.textContent || "";
    if (/❌|did not load|Save failed|timed out/i.test(text)) return { ok: false, text };
    if (/✅/.test(text) || /linked activities synced/i.test(text)) return { ok: true, text };
    return false;
  }, null, { timeout: 60000 });
  const banner = await saveOutcome.jsonValue();
  assert(banner.ok, `${label}: import/save failed: ${banner.text || "no banner"}`);
  assert(!/publish/i.test(banner.text) || /published|featured/.test(pasteStatus), `${label}: save published without a published paste status`);

  const formText = await page.locator("#adminCurriculumLessonPlanForm").innerText();
  assert(!/Render failed/i.test(formText), `${label}: editor shows Render failed`);

  const editor = await page.evaluate(() => {
    const form = document.querySelector("#adminCurriculumLessonPlanForm");
    const editorId = String(typeof adminCurriculumLessonEditorId !== "undefined" ? adminCurriculumLessonEditorId : "");
    const formId = String(form?.querySelector('[name="id"]')?.value || "");
    const tk = window.LLHTeachingKitEnrichmentEditor;
    const plan = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(editorId) : null;
    const acts = typeof curriculumActivitiesForLesson === "function"
      ? curriculumActivitiesForLesson(editorId).filter((item) => String(item.status || "") !== "archived")
      : [];
    const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const byDay = {};
    weekdays.forEach((day) => {
      byDay[day] = acts.filter((item) => String(item.dayOfWeek || "").toLowerCase() === day).map((item) => item.title);
    });
    return {
      classicForm: Boolean(form),
      formId,
      editorId,
      tkOpen: Boolean(tk?.isOpen?.()),
      tkPlanId: String(tk?.getState?.()?.planId || ""),
      title: String(plan?.title || ""),
      status: String(plan?.status || "").toLowerCase(),
      activityCount: acts.length,
      byDay,
      planExists: Boolean(plan),
    };
  });

  assert(editor.classicForm, `${label}: classic lesson editor did not open after v3 import save`);
  assert(!editor.tkOpen && !editor.tkPlanId, `${label}: Teaching Kit editor must not replace the v3 importer save destination`);
  assert(editor.editorId, `${label}: missing plan id after import/save`);
  assert(/^cur-lp-/.test(editor.editorId), `${label}: saved id is not a curriculum lesson id: ${editor.editorId}`);
  assert(editor.formId === editor.editorId, `${label}: opened editor id ${editor.formId} does not match saved lesson ${editor.editorId}`);
  assert(editor.planExists, `${label}: saved lesson ${editor.editorId} is missing from admin curriculum`);
  assert(editor.title === expectedTitle, `${label}: saved title “${editor.title}” does not match “${expectedTitle}”`);
  assert(editor.activityCount === expectedActivityCount, `${label}: expected ${expectedActivityCount} activities, found ${editor.activityCount}`);
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    assert(editor.byDay[day].length > 0, `${label}: missing ${day} activity structure`);
  });
  if (/published|featured/.test(pasteStatus)) {
    assert(/published|featured/.test(editor.status), `${label}: paste status ${pasteStatus} was not persisted`);
  } else {
    assert(editor.status === "draft", `${label}: unpublished paste was saved as ${editor.status}`);
  }

  const after = await snapshotAdminLessons(page);
  const afterIds = after.map((plan) => plan.id);
  const createdIds = afterIds.filter((id) => !beforeIds.has(id));
  assert(createdIds.length === 1, `${label}: expected exactly one new lesson, found ${createdIds.length}: ${createdIds.join(", ")}`);
  assert(createdIds[0] === editor.editorId, `${label}: editor is not showing the newly imported lesson`);
  before.forEach((plan) => {
    const current = after.find((item) => item.id === plan.id);
    assert(current, `${label}: existing lesson ${plan.id} was removed`);
    assert(current.title === plan.title, `${label}: existing lesson ${plan.id} title was overwritten`);
    assert(current.status === plan.status, `${label}: existing lesson ${plan.id} status changed`);
  });
  existingSameTitle.forEach((plan) => {
    const current = after.find((item) => item.id === plan.id);
    assert(current && current.title === pasteTitle, `${label}: original “${pasteTitle}” was overwritten`);
  });

  const publicLibrary = await requestJson("GET", "/api/site-content");
  const publicPlans = publicLibrary.json?.siteContent?.curriculumLibrary?.lessonPlans
    || publicLibrary.json?.curriculumLibrary?.lessonPlans
    || publicLibrary.json?.siteContent?.curriculum?.lessonPlans
    || [];
  const publicHit = publicPlans.some((plan) => plan.id === editor.editorId);
  if (/published|featured/.test(editor.status)) {
    assert(publicHit, `${label}: published import is missing from the public library`);
  } else {
    assert(!publicHit, `${label}: draft import leaked into the public library`);
  }

  await page.evaluate((id) => {
    if (typeof openResourceViewer === "function") openResourceViewer(id);
  }, editor.editorId);
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
  const viewerText = await page.locator("#resourceViewerBody").innerText();
  assert(viewerText.length > 20, `${label}: viewer empty`);
  assert(!/Render failed/i.test(viewerText), `${label}: viewer shows Render failed`);
  assert(viewerText.includes(expectedTitle), `${label}: viewer is not showing the imported lesson`);

  await page.click("#resourceViewerModal .modal-close, #resourceViewerModal button[aria-label='Close']")
    .catch(() => page.keyboard.press("Escape"));
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.log("Playwright not installed — skipping browser UI workflow (install with npm install).");
    return;
  }

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    });
    await context.addInitScript(() => {
      try { localStorage.setItem("llhMetaCookieNoticeDismissed", "1"); } catch { /* ignore */ }
    });
    const page = await context.newPage();
    page.on("dialog", async (dialog) => { await dialog.accept(); });

    console.log("1) Full label-only lesson plan Import & Save");
    await runImportSaveWorkflow(page, "v3-full", fs.readFileSync(V3_FULL, "utf8"), 15, { reload: true });

    console.log("2) ChatGPT Ocean Explorers format Import & Save");
    await runImportSaveWorkflow(page, "ocean-chatgpt", fs.readFileSync(OCEAN, "utf8"), 6, { reload: false });

    console.log("3) Optional fields stripped still Import & Save");
    const minimal = fs.readFileSync(V3_FULL, "utf8")
      .replace(/^TITLE:\n[^\n]+\n/m, "TITLE:\nGarden Scientists Optional Fields Missing\n")
      .replace(/^OBJECTIVE:\n[^\n]+\n/gm, "")
      .replace(/^OBSERVATION_OPPORTUNITIES:\n[^\n]+\n/gm, "")
      .replace(/^SETUP:\n[^\n]+\n/gm, "");
    await runImportSaveWorkflow(page, "v3-minimal-optional", minimal, 15, { reload: false });

    console.log("\nAll label-only admin UI workflow checks passed.");
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
});
