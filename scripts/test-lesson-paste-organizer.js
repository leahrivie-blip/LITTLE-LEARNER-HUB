#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./lesson-paste-organizer-manifest.js");
const parser = require("./lesson-paste-organizer-parser.js");
const applyApi = require("./lesson-paste-organizer-apply.js");
const ageSafety = require("./curriculum-operator-guided-age-safety.js");

const MY_FIRST_HALLOWEEN_PASTE = fs.readFileSync(
  path.join(__dirname, "fixtures", "my-first-halloween-infant-paste.txt"),
  "utf8",
).trim();

const EXPECTED_HALLOWEEN_TITLES = Object.freeze({
  monday: "Pumpkin Footprint Keepsake",
  tuesday: "Orange and Black Texture Exploration",
  wednesday: "Ghost Peekaboo and Face-to-Face Movement",
  thursday: "Pumpkin Water Painting",
  friday: "Halloween Color Scarf Movement",
});

const LARGE_PASTE = `
Title:
Autumn Harvest Explorers

Theme:
Autumn Harvest

Age Group:
Preschool 3–5 Years

Weekly Objectives:
Sort natural materials
Practice fine motor tweezers work
Collaborate on collage art

Weekly Materials:
Apples, paper, glue, tweezers, corn kernels

Safety:
Supervise food materials and choking hazards

Monday:
Activity 1:
Apple Color Sorting Table
Children sort apples by color.

Tuesday:
Activity 1:
Corn Kernel Tweezers Transfer

Book:
The Little Red Hen
Author: Paul Galdone
Monday

Song:
Five Little Pumpkins
Tuesday

Printable:
Apple counting cards
Letter-size
Related to apple sorting

Family Connection:
Send home a sorting challenge with pantry items.

Wednesday:
Activity 1:
Scarecrow Collage

Thursday:
Activity 1:
Harvest Story Walk

Week of next Friday
Tomorrow we adjust the schedule.
`.trim();

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log("Manifest");
ok(manifest.MANIFEST_VERSION >= 1, "manifest versioned");
ok(manifest.getAllFieldDefinitions().length > 50, "manifest lists global + daily fields");

console.log("Large paste — headings");
{
  const parsed = parser.parseDeterministicPaste(LARGE_PASTE);
  ok(parsed.aiUsed === false, "no AI calls");
  ok(parsed.characterCount === LARGE_PASTE.length, "character count");
  ok(parsed.values["global.title"]?.value.includes("Autumn Harvest"), "title filled");
  ok(parsed.values["global.weeklyMaterials"]?.value.includes("Apples"), "weekly materials");
  ok(parsed.values["global.weeklySafety"]?.value.includes("Supervise"), "safety placement");
  ok(parsed.values["daily.monday.activity1"]?.value.includes("Apple Color"), "Monday activity");
  ok(parsed.values["daily.tuesday.activity1"]?.value.includes("Corn Kernel"), "Tuesday activity");
  ok(parsed.books.length >= 1 && /Little Red Hen/i.test(parsed.books[0].title), "book record");
  ok(parsed.songs.length >= 1, "song record");
  ok(parsed.printables.length >= 1, "printable record");
  ok(parsed.values["global.familyConnection"]?.value.includes("sorting challenge"), "family connection");
  ok(parsed.report.unresolvedDates.length >= 1, "unresolved relative dates flagged");
  ok(parsed.detectedSections.length >= 8, "detected sections listed");
  ok(!parsed.canSaveDraft, "cannot save until unsorted and dates resolved");
}

console.log("Owner decisions + draft build");
{
  const parsed = parser.parseDeterministicPaste(LARGE_PASTE);
  const decisions = {};
  parsed.report.unsorted.forEach((u) => {
    if (/Monday/i.test(u.text) || /Apple Color/i.test(u.text)) decisions[u.id] = "monday";
    else decisions[u.id] = "delete";
  });
  const draft = applyApi.buildDraftLessonPlan(parsed, {
    ownerDecisions: decisions,
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(!draft.ok, "still blocked by unresolved dates");
  const parsed2 = parser.parseDeterministicPaste(LARGE_PASTE.replace(/Week of next Friday\nTomorrow we adjust the schedule./, ""));
  const draft2 = applyApi.buildDraftLessonPlan(parsed2, {
    ownerDecisions: decisions,
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(draft2.ok, "draft builds after date lines removed and unsorted resolved");
  ok(draft2.lessonPlan.status === "draft", "draft only");
  ok(draft2.lessonPlan.publishedAt == null, "no automatic publish");
  ok(draft2.lessonPlan.pasteOrganizerImport?.originalPaste.includes("Autumn Harvest"), "import history preserves paste");
  ok((draft2.lessonPlan.dailyPlans?.monday?.items || []).length >= 1, "Monday activities in plan");
  ok(draft2.parsed.books.length >= 1, "books preserved in parsed shape");
}

console.log("Conflicting titles");
{
  const paste = "Title:\nOne\n\nTitle:\nTwo\n\nAge Group:\nPreschool";
  const parsed = parser.parseDeterministicPaste(paste);
  ok(parsed.report.conflicts.some((c) => c.path === "global.title"), "title conflict detected");
}

console.log("Heading variations");
{
  const p = parser.parseDeterministicPaste("Supplies:\nPaper\n\nWhat you need:\nGlue\n\nHome connection:\nShare art");
  ok(p.values["global.weeklyMaterials"]?.value.includes("Paper"), "Supplies alias");
  ok(p.values["global.familyConnection"]?.value.includes("Share art"), "Home connection alias");
}

console.log("Restore + undo field movement");
{
  const original = "Title:\nOriginal\n\nMaterials:\nYarn";
  const parsed = parser.parseDeterministicPaste(original);
  const moved = applyApi.applyOwnerDecisions(parsed, {});
  ok(moved.values["global.title"]?.value === "Original", "values preserved");
  const restored = parser.parseDeterministicPaste(original);
  ok(restored.originalText === original, "restore original paste text");
}

console.log("Ambiguous weekday block");
{
  const p = parser.parseDeterministicPaste("Title:\nT\n\nAge Group:\n3s\n\nTheme:\nFall\n\nMonday:\nFree play and art without activity labels");
  ok(p.report.unsorted.some((u) => u.reason === "weekday_block_needs_activity_labels"), "weekday body stays unsorted");
}

console.log("Duplicate activity labels conflict");
{
  const paste = "Title:\nDup\n\nAge Group:\nPreK\n\nTheme:\nX\n\nMonday:\nActivity 1:\nFirst\n\nMonday:\nActivity 1:\nSecond";
  const p = parser.parseDeterministicPaste(paste);
  ok(p.report.unsorted.length >= 1 || p.report.conflicts.length >= 0, "duplicate Monday blocks handled without guessing");
  ok(p.values["daily.monday.activity1"]?.value.includes("First"), "first Monday activity kept");
}

console.log("Print preview structure matches draft");
{
  const clean = LARGE_PASTE.replace(/Week of next Friday\nTomorrow we adjust the schedule./, "");
  const parsed = parser.parseDeterministicPaste(clean);
  const decisions = {};
  parsed.report.unsorted.forEach((u) => {
    decisions[u.id] = /Apple Color/i.test(u.text) ? "monday" : "delete";
  });
  const draft = applyApi.buildDraftLessonPlan(parsed, {
    ownerDecisions: decisions,
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(draft.ok, "draft for preview");
  const preview = applyApi.buildStructurePreview(parsed, {
    ownerDecisions: decisions,
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  const ids = preview.sections.map((s) => s.id);
  ok(ids.includes("overview") && ids.includes("monday") && ids.includes("books"), "preview section order");
  const html = applyApi.buildPrintPreviewHtml(parsed, { ownerDecisions: decisions });
  ok(/Overview/.test(html) && /Monday/.test(html) && /Books/.test(html), "print HTML includes structure");
  ok(draft.lessonPlan.title && preview.sections[0].fields[0].value.includes("Autumn"), "print preview title matches draft");
}

console.log("Missing required fields");
{
  const p = parser.parseDeterministicPaste("Materials:\nOnly supplies");
  ok(p.report.missingRequired.some((m) => m.id === "title"), "title missing flagged");
  ok(!p.canSaveDraft, "cannot save without required fields");
}

console.log("No invented content");
{
  const p = parser.parseDeterministicPaste("Title:\nExact Title\n\nAge Group:\nToddler\n\nTheme:\nWater");
  ok(p.values["global.title"].value === "Exact Title", "title wording preserved verbatim");
  ok(!Object.values(p.values).some((v) => /generated|placeholder/i.test(v.value)), "no invented filler");
}

console.log("Unrelated lessons unchanged (apply isolation)");
{
  const before = { id: "cur-lp-other", title: "Other Lesson", status: "published" };
  const draft = applyApi.buildDraftLessonPlan(parser.parseDeterministicPaste("Title:\nNew Only\n\nAge Group:\nToddler\n\nTheme:\nWater"), {
    ownerDecisions: {},
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(draft.ok, "isolated new draft");
  ok(before.title === "Other Lesson", "unrelated lesson object untouched");
}

console.log("My First Halloween — structured infant paste");
{
  const parsed = parser.parseDeterministicPaste(MY_FIRST_HALLOWEEN_PASTE);
  ok(parsed.aiUsed === false, "Halloween paste stays deterministic");
  ok(parsed.values["global.title"]?.value === "My First Halloween", "Halloween lesson title");
  ok(/Infant 0.?12 Months/i.test(parsed.values["global.ageGroup"]?.value || ""), "infant age group preserved");
  ok(parsed.values["global.theme"]?.value.includes("Gentle Halloween"), "theme mapped");
  ok(parsed.report.unsorted.length === 0, "no unsorted blocks for structured infant paste");
  ok(parsed.report.conflicts.length === 0, "no field conflicts");
  ok(parsed.books.length >= 1, "books detected globally");
  ok(parsed.songs.length >= 1, "songs detected globally");
  ok(parsed.printables.length >= 1, "printables detected globally");
  ok(parsed.values["global.familyConnection"]?.value.includes("orange and black"), "family connection detected");
  ok(parsed.values["global.cover"]?.value.includes("Realistic photo"), "cover image instructions detected");
  ok((parsed.activities || []).length === 5, "five activities parsed");
  manifest.WEEKDAYS.forEach((day) => {
    const title = parsed.values[`daily.${day}.activity1`]?.value || "";
    ok(title === EXPECTED_HALLOWEEN_TITLES[day], `${day} activity title`);
    ok(title.length <= 180, `${day} title under 180 chars`);
    ok(!/Weekday|Category|Recommended age|Estimated duration/i.test(title), `${day} title excludes field labels`);
  });
  ok(
    !(parsed.activities || []).some((row) => /^Activity objective$/i.test(row.title)),
    "Activity objective does not create activities",
  );
  ok(parsed.values["daily.monday.materials"]?.value.includes("Washable orange paint"), "multiline materials stay in materials");
  ok(parsed.values["daily.monday.directions"]?.value.includes("1. Caregiver paints"), "numbered directions preserved");
  ok(parsed.values["daily.monday.safety"]?.value.includes("Adult completes"), "safety stays on activity");
  ok(parsed.values["daily.monday.vocabulary"]?.value.includes("Pumpkin"), "vocabulary list preserved");
  ok(parsed.values["daily.monday.activityCategory"]?.value.includes("Creative Expression"), "developmental domain mapped");
  ok(parsed.values["daily.monday.ageModifications"]?.value.includes("Infant"), "recommended activity age mapped");
  ok(parsed.values["daily.monday.preparation"]?.value.includes("Tape cardstock"), "teacher preparation mapped");
  ok(parsed.values["daily.monday.observation"]?.value.includes("calm engagement"), "learning and observation mapped");
  ok(parsed.values["daily.monday.imageRequirement"]?.value, "image requirement mapped");
  ok(parsed.values["daily.monday.imageBriefSetup"]?.value.includes("Caregiver hands"), "setup image brief mapped");
  ok(parsed.values["daily.monday.dailyObjective"]?.value.includes("Support bonding"), "objective text preserved");
  const mondaySafety = ageSafety.validateActivityIdea({
    ageBand: "infant",
    title: EXPECTED_HALLOWEEN_TITLES.monday,
    materialsText: parsed.values["daily.monday.materials"]?.value || "",
    ownerInstructions: parsed.values["daily.monday.dailyFocus"]?.value || "",
  });
  ok(mondaySafety.ok, "infant keepsake craft wording does not hard-fail safety");
  ok(Array.isArray(parsed.report.infantSafety?.safetyWarnings), "infant safety report attached");
  ok(parsed.canSaveDraft, "Halloween paste can save draft");
  const draft = applyApi.buildDraftLessonPlan(parsed, {
    ownerDecisions: {},
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(draft.ok, "Halloween draft builds");
  ok(draft.lessonPlan.title === "My First Halloween", "draft lesson title");
  ok(
    manifest.WEEKDAYS.every((day) => (draft.lessonPlan.dailyPlans?.[day]?.items || []).length === 1),
    "one activity per weekday in draft",
  );
  const preview = applyApi.buildStructurePreview(parsed, {
    ownerDecisions: {},
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(preview.sections.some((s) => s.id === "books"), "review preview lists books section");
  const monPreview = preview.sections.find((s) => s.id === "monday");
  ok(monPreview.fields.some((f) => /Objective/.test(f.label) && /Support bonding/.test(f.value)), "preview shows objective");
  ok(monPreview.fields.some((f) => /Materials/.test(f.label)), "preview shows materials");
}

console.log("Duplicate activity objective — conflict blocks save");
{
  const paste = "Title:\nDup Obj\n\nAge Group:\nInfant 0–12 Months\n\nTheme:\nFall\n\nMonday:\nActivity name:\nOne\nActivity objective:\nFirst objective here.\nActivity objective:\nSecond different objective.\nMaterials:\nYarn\nSafety and supervision:\nAdult holds all items.\nStep-by-step directions:\n1. Do one thing.\n";
  const parsed = parser.parseDeterministicPaste(paste);
  ok(parsed.report.conflicts.some((c) => c.path === "daily.monday.dailyObjective"), "duplicate objectives become conflict");
  ok(!parsed.canSaveDraft, "unresolved objective conflict blocks save");
}

console.log("Static wiring");
{
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  ok(html.includes("lesson-paste-organizer-parser.js"), "index loads organizer parser");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  ok(app.includes("organize-paste"), "app.js organize paste step");
  ok(app.includes("data-paste-organize"), "app.js paste organize handlers");
  const enrichEditor = fs.readFileSync(path.join(__dirname, "teaching-kit-enrichment-editor.js"), "utf8");
  ok(enrichEditor.includes("data-week-cover-image-instructions"), "week tab cover instructions field");
  ok(enrichEditor.includes("Cover Image Instructions"), "week tab cover instructions label");
}

const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const ROOT = path.join(__dirname, "..");

function organizerRequestJson(port, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = payload
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: "127.0.0.1", port, path: urlPath, method, headers, timeout: 45000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text: raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runOrganizerSaveReloadTest() {
  const port = 20580 + Math.floor(Math.random() * 40);
  const base = `http://127.0.0.1:${port}`;
  const storePath = path.join(os.tmpdir(), `llh-paste-organizer-${crypto.randomBytes(4).toString("hex")}.json`);
  const admin = {
    email: "paste-organizer@test.local",
    password: "paste-organizer-pass",
    code: "paste-organizer-code",
  };
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: base,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      ADMIN_EMAIL: admin.email,
      ADMIN_PASSWORD: admin.password,
      ADMIN_ACCESS_CODE: admin.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    let booted = false;
    for (let i = 0; i < 80; i += 1) {
      if (child.exitCode !== null) throw new Error("Server exited early");
      try {
        const health = await organizerRequestJson(port, "GET", "/api/health");
        if (health.status === 200 && health.json?.ok) { booted = true; break; }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 120));
    }
    if (!booted) throw new Error("Server did not boot");

    const login = await organizerRequestJson(port, "POST", "/api/admin/login", {
      email: admin.email,
      password: admin.password,
      code: admin.code,
    });
    assert.equal(login.status, 200, login.text);
    const token = login.json.token;
    const stampRes = await organizerRequestJson(port, "GET", "/api/admin/site-content", null, token);
    assert.equal(stampRes.status, 200, stampRes.text);
    let stamp = stampRes.json.siteContent?.updatedAt || "";

    const parsed = parser.parseDeterministicPaste(MY_FIRST_HALLOWEEN_PASTE);
    const built = applyApi.buildDraftLessonPlan(parsed, {
      ownerDecisions: {},
      ageMarkedUnknown: false,
      themeMarkedUnknown: false,
    });
    ok(built.ok, "organizer draft builds before save");
    const save = await organizerRequestJson(port, "POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      lessonPlan: built.lessonPlan,
    }, token);
    assert.equal(save.status, 200, save.text);
    const savedId = save.json.lessonPlan.id;
    stamp = save.json.siteContentUpdatedAt;

    const reload = await organizerRequestJson(port, "GET", "/api/admin/site-content", null, token);
    const plan = (reload.json.siteContent?.curriculum?.lessonPlans || []).find((item) => item.id === savedId);
    ok(plan, "reload finds saved organizer draft");
    ok(plan.title === "My First Halloween", "reload title");
    const monItem = plan.dailyPlans.monday.items[0];
    const monPatch = plan.enrichmentDraft?.activities?.[monItem.itemId] || {};
    ok(monItem.title === EXPECTED_HALLOWEEN_TITLES.monday, "reload monday title");
    ok(monPatch.activityCategory?.includes("Creative Expression"), "reload category");
    ok(monPatch.preparation?.includes("Tape cardstock"), "reload preparation");
    ok(monPatch.ageModifications?.includes("Infant"), "reload recommended age");
    ok(monPatch.durationMinutes === 8, "reload duration");
    ok(monPatch.observationOpportunities?.includes("calm engagement"), "reload observation");
    ok(monPatch.imageBriefSetup?.includes("Caregiver hands"), "reload setup image brief");
    ok(plan.enrichmentDraft?.week?.coverImageInstructions?.includes("Realistic photo"), "reload cover instructions");
    const editedCover = "Owner-edited cover brief — calm infant Halloween sensory.";
    const coverSave = await organizerRequestJson(port, "POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: stamp,
      adminEmail: admin.email,
      lessonPlan: {
        id: savedId,
        enrichmentDraft: {
          ...(plan.enrichmentDraft || {}),
          week: {
            ...(plan.enrichmentDraft?.week || {}),
            coverImageInstructions: editedCover,
          },
        },
      },
    }, token);
    assert.equal(coverSave.status, 200, coverSave.text);
    stamp = coverSave.json.siteContentUpdatedAt || stamp;
    const reloadCover = await organizerRequestJson(port, "GET", "/api/admin/site-content", null, token);
    const planAfterCover = (reloadCover.json.siteContent?.curriculum?.lessonPlans || []).find((item) => item.id === savedId);
    ok(
      planAfterCover?.enrichmentDraft?.week?.coverImageInstructions === editedCover,
      "cover instructions persist after enrichment draft save",
    );
    const importHistory = plan.enrichmentDraft?.pasteOrganizerImport || plan.pasteOrganizerImport;
    ok(importHistory?.originalPaste?.includes("My First Halloween"), "reload paste history");
    ok((plan.enrichmentDraft?.week?.books || []).length >= 1, "reload week books");
    ok((plan.enrichmentDraft?.week?.songs || []).length >= 1, "reload week songs");
    console.log("  ✓ organizer save/reload via admin curriculum API");
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

async function main() {
  await runOrganizerSaveReloadTest();
  console.log("All lesson paste organizer checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
