#!/usr/bin/env node
/**
 * Printable Ideas remove-by-id + duplicate/filler cleanup.
 * Fixture title matches Colors All Around Us. Does not publish.
 * Never mutates Linked Resources.
 *
 * Run: npm run test:tk-printable-idea-remove
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const helper = require("./teaching-kit-printable-idea-remove.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6500 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-printable-idea-remove-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-idea-remove-pass",
  code: "tk-idea-remove-code",
};
const LESSON_ID = "cur-lp-colors-all-around-us-fixture";
const GAZE_ID = "cur-res-bright-color-gaze-cards";
const GUIDE_ID = "cur-res-caregiver-color-talk";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
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

async function waitForHealth(child, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function unitTests() {
  const editor = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(editor.includes("data-printable-idea-id"), "cards/buttons carry stable printable idea ids");
  ok(editor.includes("data-printable-idea-cleanup"), "duplicate/filler cleanup control is in the editor");
  ok(editor.includes("removeClickedPrintableIdea"), "clicked Remove uses isolated printable-idea handler");
  ok(editor.includes("resolvePrintableIdeaIdFromEvent"), "remove resolves id from the clicked control");
  ok(!/querySelector\(\s*"\[data-kit-media-remove=\\"printableIdea\\""/.test(editor), "remove does not querySelector the first printable idea");
  ok(appJs.includes("curriculumResourceOpenLock"), "preview open is guarded against duplicate clicks");

  const a = { id: "pi-a", title: "Color Card Idea", purpose: "first" };
  const b = { id: "pi-b", title: "Color Card Idea", purpose: "second duplicate" };
  const unique = { id: "pi-unique", title: "Infant Color Hunt Sheet", purpose: "keep me" };
  const removed = helper.removePrintableIdeaById([a, b, unique], "pi-b");
  ok(removed.removed?.id === "pi-b", "remove targets the clicked duplicate id");
  ok(removed.list.some((item) => item.id === "pi-a"), "same-title sibling is kept");
  ok(removed.list.some((item) => item.id === "pi-unique"), "unique idea is kept");
  ok(!removed.list.some((item) => item.id === "pi-b"), "clicked duplicate is gone");

  const fillers = [
    unique,
    ...Array.from({ length: 14 }, (_, i) => ({ id: `pi-dup-${i}`, title: "Color Card Idea" })),
    ...Array.from({ length: 14 }, (_, i) => ({ id: `pi-fill-${i}`, title: "Filler" })),
  ];
  const cleanup = helper.applyDuplicateFillerCleanup(fillers);
  ok(cleanup.selection.remove.length === 27, `cleanup selects 27 filler/duplicate rows (got ${cleanup.selection.remove.length})`);
  ok(cleanup.list.some((item) => item.id === "pi-unique"), "cleanup keeps the unique idea");
  ok(cleanup.list.filter((item) => item.title === "Color Card Idea").length === 1, "cleanup keeps one copy of a duplicated title");
  ok(!cleanup.list.some((item) => String(item.title).toLowerCase() === "filler"), "cleanup drops placeholder filler titles");
  const again = helper.applyDuplicateFillerCleanup(cleanup.list);
  ok(again.selection.remove.length === 0, "cleanup is idempotent");

  const fakeInner = {
    closest(sel) {
      if (sel === "[data-kit-media-remove=\"printableIdea\"]") {
        return {
          getAttribute(name) {
            return name === "data-printable-idea-id" ? "pi-b" : "";
          },
        };
      }
      return null;
    },
  };
  ok(helper.resolvePrintableIdeaIdFromEvent({ target: fakeInner }) === "pi-b", "event.closest reads the clicked idea id, not the first card");
}

function seedLesson() {
  const ideas = [
    { id: "pi-unique", title: "Infant Color Hunt Sheet", purpose: "Keep this unique idea" },
    { id: "pi-gaze-note", title: "Bright Color Gaze Cards (draft)", purpose: "Planning note only" },
    { id: "pi-guide-note", title: "Caregiver Color Talk Mini Guide (draft)", purpose: "Planning note only" },
    ...Array.from({ length: 14 }, (_, i) => ({ id: `pi-dup-${i}`, title: "Color Card Idea", purpose: "duplicate" })),
    ...Array.from({ length: 14 }, (_, i) => ({ id: `pi-fill-${i}`, title: "Filler", purpose: "filler" })),
  ];
  return {
    id: LESSON_ID,
    title: "Colors All Around Us",
    age: "Infant",
    theme: "Colors",
    plan: "Pro",
    status: "draft",
    resourceIds: [GAZE_ID, GUIDE_ID],
    enrichmentDraft: {
      updatedAt: new Date().toISOString(),
      lastEditedBy: OWNER.email,
      week: { weeklyOverview: "Keep overview", printableIdeas: ideas, books: [{ title: "Keep Book" }], songs: [{ title: "Keep Song" }], milestones: ["Language"] },
      activities: {},
      previewReady: false,
    },
    books: [{ title: "Published Color Book" }],
    songs: [{ title: "Published Color Song" }],
    disposableQaFixture: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  unitTests();

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { teachingKitEnrichmentEditor: false },
      curriculum: {
        lessonPlans: [seedLesson()],
        activities: [{
          id: "cur-act-colors-fixture-1",
          lessonPlanId: LESSON_ID,
          title: "Gaze Play",
          dayOfWeek: "monday",
          status: "draft",
          disposableQaFixture: true,
        }],
        resources: [
          { id: GAZE_ID, title: "Bright Color Gaze Cards", resourceCategory: "Printables", status: "draft", lessonPlanIds: [LESSON_ID], fileName: "gaze.pdf", mimeType: "application/pdf", disposableQaFixture: true },
          { id: GUIDE_ID, title: "Caregiver Color Talk Mini Guide", resourceCategory: "Printables", status: "draft", lessonPlanIds: [LESSON_ID], fileName: "guide.pdf", mimeType: "application/pdf", disposableQaFixture: true },
        ],
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", OWNER);
    ok(login.status === 200, "owner login");
    const token = login.json.token || login.json.adminToken;
    const auth = { Authorization: `Bearer ${token}` };
    const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const plan = site.json.siteContent.curriculum.lessonPlans.find((p) => p.id === LESSON_ID);
    const resourcesBefore = JSON.stringify(site.json.siteContent.curriculum.resources);
    const booksBefore = JSON.stringify(plan.books);
    const publishedStatus = plan.status;
    const ideas = helper.ensurePrintableIdeaIds(plan.enrichmentDraft.week.printableIdeas);
    ok(ideas.length === 31, "fixture has unique + notes + 28 filler/duplicate ideas");
    const cleaned = helper.applyDuplicateFillerCleanup(ideas);
    const nextDraft = JSON.parse(JSON.stringify(plan.enrichmentDraft));
    nextDraft.week.printableIdeas = cleaned.list;
    nextDraft.updatedAt = new Date().toISOString();
    const saved = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: site.json.siteContent.updatedAt,
      lessonPlan: { id: LESSON_ID, enrichmentDraft: nextDraft },
    }, auth);
    ok(saved.status === 200, `enrichment draft save after cleanup (${saved.status})`);
    ok(saved.json?.lessonPlan?.status === publishedStatus, "lesson publish status unchanged");
    const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const planAfter = after.json.siteContent.curriculum.lessonPlans.find((p) => p.id === LESSON_ID);
    const ideasAfter = planAfter.enrichmentDraft.week.printableIdeas || [];
    ok(!ideasAfter.some((item) => String(item.title).toLowerCase() === "filler"), "filler titles gone after reload");
    ok(ideasAfter.some((item) => item.title === "Infant Color Hunt Sheet"), "unique idea remains after reload");
    ok(JSON.stringify(after.json.siteContent.curriculum.resources) === resourcesBefore, "Linked Resources records unchanged");
    ok(JSON.stringify(planAfter.resourceIds) === JSON.stringify([GAZE_ID, GUIDE_ID]), "lesson resourceIds unchanged");
    ok(JSON.stringify(planAfter.books) === booksBefore, "published books unchanged");
    ok(planAfter.status === "draft", "lesson was not published");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
  console.log(`\n${passed} checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
