#!/usr/bin/env node
/**
 * Owner/admin draft lesson delete + Name-block parser regression.
 * Run: npm run test:owner-lesson-delete
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { parseFullLessonStructurePaste } = require("./curriculum-lesson-structure-paste.js");
const weekKit = require("./curriculum-week-kit-paste.js");
const { largeNameBlockMasterPaste } = require("./test-master-lesson-activity-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20610 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-lesson-delete-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "owner-lesson-delete-pass",
  code: "owner-lesson-delete-code",
};
const KEEP_ID = "cur-lp-owner-delete-keep";
const JUNK_ID = "cur-lp-owner-delete-junk";
const UI_ID = "cur-lp-owner-delete-ui";
const EXTRA_ID = "cur-lp-owner-delete-extra";
const SHARED_RES_ID = "cur-res-owner-delete-shared";
const JUNK_TITLE = "Things That Go: Art in Motion";
const UI_TITLE = "Delete Me UI Draft";

function requestJson(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = payload
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers, timeout: 45000 },
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
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { teachingKitEnrichmentEditor: true },
      curriculum: { lessonPlans: [], activities: [], resources: [], series: [] },
      updatedAt: "",
    },
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: BASE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
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
    await new Promise((r) => setTimeout(r, 120));
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

function dailyItems(prefix, count) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const plans = {};
  days.forEach((day) => { plans[day] = { items: [] }; });
  for (let i = 0; i < count; i += 1) {
    const day = days[i % days.length];
    plans[day].items.push({
      itemId: `${prefix}-${day}-${i}`,
      title: `${prefix} ${day} ${i + 1}`,
    });
  }
  return plans;
}

function findPlan(curriculum, id) {
  return (curriculum?.lessonPlans || []).find((item) => item.id === id) || null;
}

function findResource(curriculum, id) {
  return (curriculum?.resources || []).find((item) => item.id === id) || null;
}

function assertStaticContract() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const enrichJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const pasteJs = fs.readFileSync(path.join(ROOT, "scripts/curriculum-lesson-structure-paste.js"), "utf8");
  const kitJs = fs.readFileSync(path.join(ROOT, "scripts/curriculum-week-kit-paste.js"), "utf8");
  assert.match(serverJs, /\/api\/admin\/curriculum\/lesson-plans\/delete/);
  assert.match(serverJs, /function handleAdminCurriculumLessonPlanDelete/);
  assert.match(serverJs, /function isSafeSingleLessonDelete/);
  assert.match(appJs, /function deleteAdminCurriculumLessonPlan/);
  assert.match(appJs, /data-curriculum-lesson-delete/);
  assert.match(appJs, /This permanently deletes this lesson plan and its lesson-owned activity records/);
  assert.match(appJs, /if \(!confirmed\) return \{ cancelled: true, ok: false \}/);
  assert.match(enrichJs, /data-enrich-delete-lesson/);
  assert.match(pasteJs, /looksLikeStructuredActivityFields/);
  assert.match(kitJs, /hasExplicitActivityStart/);
  assert.match(kitJs, /name: "title"/);
  console.log("PASS  static contract: delete endpoint, confirm-before-fetch, Name start helpers");
}

function assertNameBlockParser() {
  const paste = typeof largeNameBlockMasterPaste === "function"
    ? largeNameBlockMasterPaste()
    : "";
  assert.ok(paste.includes("Name\nMonday Wheel Painting"), "Name-block fixture loaded");
  const expected = weekKit.countExplicitActivityNameStarts(paste);
  const parsed = parseFullLessonStructurePaste(paste);
  assert.equal(parsed.activityCount, expected);
  assert.ok(expected >= 8);
  assert.ok(!parsed.dailyPlans.monday.items.some((item) => item.title === "15 minutes"));
  console.log(`PASS  parser: Name-block paste yields ${expected} activities`);
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", ADMIN);
  assert.equal(res.status, 200, res.text);
  return res.json.token;
}

async function siteStamp(token) {
  const res = await requestJson("GET", "/api/admin/site-content", null, token);
  assert.equal(res.status, 200, res.text);
  return { stamp: res.json.siteContent?.updatedAt || "", curriculum: res.json.siteContent?.curriculum || {} };
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt,
    lessonPlan,
  }, token);
}

async function deleteLesson(token, lessonPlanId, confirmTitle, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans/delete", {
    lessonPlanId,
    confirmTitle,
    expectedUpdatedAt,
  }, token);
}

async function runServerTests() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const token = await adminLogin();
    let { stamp } = await siteStamp(token);

    const keep = await saveLesson(token, {
      id: KEEP_ID,
      title: "Keep Lesson Plan",
      age: "Preschool",
      status: "published",
      plan: "Free",
      weeklyOverview: "Do not delete me.",
      dailyPlans: dailyItems("keep", 5),
    }, stamp);
    assert.equal(keep.status, 200, keep.text);
    stamp = keep.json.siteContentUpdatedAt;

    const extra = await saveLesson(token, {
      id: EXTRA_ID,
      title: "Extra Untouched Lesson",
      age: "Toddler",
      status: "published",
      plan: "Pro",
      weeklyOverview: "Also stay.",
      dailyPlans: dailyItems("extra", 5),
    }, stamp);
    assert.equal(extra.status, 200, extra.text);
    stamp = extra.json.siteContentUpdatedAt;

    const junk = await saveLesson(token, {
      id: JUNK_ID,
      title: JUNK_TITLE,
      age: "Preschool",
      status: "draft",
      plan: "Pro",
      weeklyOverview: "Broken import draft.",
      dailyPlans: dailyItems("junk", 20),
    }, stamp);
    assert.equal(junk.status, 200, junk.text);
    stamp = junk.json.siteContentUpdatedAt;

    const uiDraft = await saveLesson(token, {
      id: UI_ID,
      title: UI_TITLE,
      age: "Preschool",
      status: "draft",
      plan: "Free",
      weeklyOverview: "UI delete target.",
      dailyPlans: dailyItems("ui", 2),
    }, stamp);
    assert.equal(uiDraft.status, 200, uiDraft.text);
    stamp = uiDraft.json.siteContentUpdatedAt;

    const site = await requestJson("GET", "/api/admin/site-content", null, token);
    const content = site.json.siteContent;
    content.curriculum = {
      ...content.curriculum,
      resources: [
        ...(content.curriculum.resources || []),
        {
          id: SHARED_RES_ID,
          title: "Shared Vehicle Printable",
          resourceCategory: "printables",
          status: "published",
          lessonPlanIds: [KEEP_ID, JUNK_ID],
        },
      ],
    };
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: content,
    }, token);
    assert.equal(touch.status, 200, touch.text);
    stamp = touch.json.siteContent?.updatedAt || stamp;

    const before = await siteStamp(token);
    stamp = before.stamp;
    const beforeKeep = findPlan(before.curriculum, KEEP_ID);
    const beforeExtra = findPlan(before.curriculum, EXTRA_ID);
    const beforeJunkActs = (before.curriculum.activities || []).filter((act) => act.lessonPlanId === JUNK_ID);
    const beforeKeepActs = (before.curriculum.activities || []).filter((act) => act.lessonPlanId === KEEP_ID);
    assert.ok(beforeJunkActs.length >= 20, `expected 20 junk activities, got ${beforeJunkActs.length}`);
    assert.ok(findResource(before.curriculum, SHARED_RES_ID), "shared resource seeded");

    const unauth = await deleteLesson(null, JUNK_ID, JUNK_TITLE, stamp);
    assert.equal(unauth.status, 401);
    assert.equal(unauth.json?.code, "unauthorized");
    console.log("PASS  unauthorized delete is rejected");

    const fake = await deleteLesson("not-a-real-admin-token", JUNK_ID, JUNK_TITLE, stamp);
    assert.equal(fake.status, 401);
    assert.equal(fake.json?.code, "unauthorized");
    console.log("PASS  invalid token cannot delete");

    const afterDenied = await siteStamp(token);
    assert.ok(findPlan(afterDenied.curriculum, JUNK_ID), "denied delete left the draft in place");
    stamp = afterDenied.stamp;

    const publishedConflict = await deleteLesson(token, KEEP_ID, "Keep Lesson Plan", stamp);
    assert.equal(publishedConflict.status, 409);
    assert.equal(publishedConflict.json?.code, "deletion_conflict");
    console.log("PASS  published lesson is not deleted");

    const missing = await deleteLesson(token, "cur-lp-does-not-exist", "Nope", stamp);
    assert.equal(missing.status, 404);
    assert.equal(missing.json?.code, "lesson_not_found");
    console.log("PASS  unknown lesson id returns not found");

    const deleted = await deleteLesson(token, JUNK_ID, JUNK_TITLE, stamp);
    assert.equal(deleted.status, 200, deleted.text);
    assert.equal(deleted.json.deletedPlanId, JUNK_ID);
    assert.ok(!findPlan(deleted.json.curriculum, JUNK_ID));
    assert.ok(findPlan(deleted.json.curriculum, KEEP_ID));
    assert.ok(findPlan(deleted.json.curriculum, EXTRA_ID));
    assert.ok(findPlan(deleted.json.curriculum, UI_ID));
    const afterJunkActs = (deleted.json.curriculum.activities || []).filter((act) => act.lessonPlanId === JUNK_ID);
    const afterKeepActs = (deleted.json.curriculum.activities || []).filter((act) => act.lessonPlanId === KEEP_ID);
    assert.equal(afterJunkActs.length, 0);
    assert.equal(afterKeepActs.length, beforeKeepActs.length);
    assert.deepEqual(
      afterKeepActs.map((act) => act.id).sort(),
      beforeKeepActs.map((act) => act.id).sort(),
    );
    assert.equal(findPlan(deleted.json.curriculum, KEEP_ID).weeklyOverview, beforeKeep.weeklyOverview);
    assert.equal(findPlan(deleted.json.curriculum, EXTRA_ID).weeklyOverview, beforeExtra.weeklyOverview);
    const shared = findResource(deleted.json.curriculum, SHARED_RES_ID);
    assert.ok(shared, "shared resource survived");
    assert.equal(shared.title, "Shared Vehicle Printable");
    assert.ok(shared.lessonPlanIds.includes(KEEP_ID));
    assert.ok(!shared.lessonPlanIds.includes(JUNK_ID));
    console.log("PASS  owner delete removes the exact draft and owned activities only");

    stamp = deleted.json.siteContentUpdatedAt;
    const reload = await siteStamp(token);
    assert.ok(!findPlan(reload.curriculum, JUNK_ID), "refresh does not restore deleted lesson");
    assert.ok(findPlan(reload.curriculum, KEEP_ID));
    assert.ok(findResource(reload.curriculum, SHARED_RES_ID));
    stamp = reload.stamp;
    console.log("PASS  reload keeps the deletion");

    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.addInitScript(() => {
        try { localStorage.setItem("llhMetaCookieNoticeDismissed", "1"); } catch { /* ignore */ }
      });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
      await page.evaluate(() => setView("admin"));
      await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
      await page.fill('input[name="adminEmail"]', ADMIN.email);
      await page.fill('input[name="adminPassword"]', ADMIN.password);
      await page.fill('input[name="adminCode"]', ADMIN.code);
      await page.click("#adminUnlockForm button[type='submit']");
      await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
      await page.evaluate(() => {
        if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      });
      await page.waitForSelector("#adminCreateCurriculumLessonPlanButton", { timeout: 20000 });

      await page.evaluate((id) => {
        adminCurriculumLessonEditorId = id;
        if (typeof renderAdminCurriculumLessonPlanManager === "function") {
          renderAdminCurriculumLessonPlanManager();
        }
      }, UI_ID);
      await page.waitForSelector("[data-curriculum-lesson-delete]", { timeout: 15000 });
      await page.waitForFunction((id) => (
        typeof curriculumLessonPlanById === "function" && Boolean(curriculumLessonPlanById(id))
        && typeof deleteAdminCurriculumLessonPlan === "function"
      ), UI_ID, { timeout: 15000 });
      const cancelResult = await page.evaluate(async (id) => {
        const pending = deleteAdminCurriculumLessonPlan(id);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const dialog = document.querySelector("[data-llh-confirm-dialog]");
        const title = dialog?.querySelector("[data-llh-confirm-title]")?.textContent || "";
        const shown = Boolean(dialog && !dialog.hidden);
        dialog?.querySelector(".llh-confirm-panel [data-llh-confirm-cancel]")?.click();
        const result = await pending;
        return {
          title,
          shown,
          cancelled: result?.cancelled === true,
          stillThere: Boolean(curriculumLessonPlanById(id)),
          stillInEditor: Boolean(document.querySelector("[data-curriculum-lesson-delete]")),
        };
      }, UI_ID);
      assert.equal(cancelResult.shown, true, "one confirmation dialog is shown");
      assert.match(cancelResult.title, /Delete “Delete Me UI Draft”/);
      assert.equal(cancelResult.cancelled, true);
      assert.equal(cancelResult.stillThere, true);
      assert.equal(cancelResult.stillInEditor, true);
      console.log("PASS  cancel confirmation performs no mutation");

      const okResult = await page.evaluate(async (id) => {
        const pending = deleteAdminCurriculumLessonPlan(id);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const okBtn = document.querySelector("[data-llh-confirm-dialog]:not([hidden]) [data-llh-confirm-ok]");
        if (okBtn) okBtn.click();
        const result = await pending;
        return {
          ok: result?.ok === true,
          code: result?.code || "",
          gone: !curriculumLessonPlanById(id),
          list: Boolean(document.querySelector("#adminCreateCurriculumLessonPlanButton")),
          banner: document.querySelector("#adminCurriculumLessonPlanBanner")?.textContent || "",
          clicked: Boolean(okBtn),
        };
      }, UI_ID);
      assert.equal(okResult.ok, true, JSON.stringify(okResult));
      assert.equal(okResult.gone, true, JSON.stringify(okResult));
      assert.equal(okResult.list, true, JSON.stringify(okResult));
      assert.match(okResult.banner, /Deleted “Delete Me UI Draft”/);
      console.log("PASS  UI returns to the lesson list after delete");

      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
      await page.evaluate(() => {
        if (typeof setView === "function") setView("admin");
        if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      });
      await page.waitForSelector("#adminCreateCurriculumLessonPlanButton", { timeout: 20000 });
      const afterReload = await page.evaluate((id) => (
        typeof curriculumLessonPlanById === "function" ? Boolean(curriculumLessonPlanById(id)) : true
      ), UI_ID);
      assert.equal(afterReload, false);
      console.log("PASS  browser refresh does not restore the deleted draft");
      await page.close();
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  assertStaticContract();
  assertNameBlockParser();
  await runServerTests();
  console.log("\nAll owner lesson-delete tests passed.");
}

module.exports = {
  assertNameBlockParser,
};

if (require.main === module) {
  main().catch((error) => {
    console.error("\nFAIL", error);
    process.exitCode = 1;
  });
}
