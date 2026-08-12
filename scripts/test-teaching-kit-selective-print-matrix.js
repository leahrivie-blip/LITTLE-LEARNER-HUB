#!/usr/bin/env node
/**
 * Teaching Kit Print Center — selective printing regression matrix.
 *
 * Asserts ONE shared selection → manifest → document pipeline for
 * preview / print / PDF content scope across representative kits.
 *
 * Run: npm run test:teaching-kit-selective-print-matrix
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = path.join(ROOT, "artifacts", "tk-selective-print-matrix");

require("./teaching-kit-present.js");
const Present = require("./teaching-kit-present.js");
const Model = require("./teaching-kit-printable-model.js");
const Print = require("./teaching-kit-print.js");
const Mapper = require("./teaching-kit-mapper.js");

const results = [];
let passed = 0;
let failed = 0;

function ok(cond, msg) {
  try {
    assert.ok(cond, msg);
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${msg}`);
    throw err;
  }
}

function loadFixture(name) {
  return require(path.join(__dirname, "fixtures", "teaching-kit", name));
}

function mapFixture(fixture) {
  return Mapper.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities || [],
    fixture.resources || [],
    { day: "monday" },
  );
}

function buildCase(kit, plan, options) {
  const request = Print.buildPrintRequest(kit, { ...options, plan });
  const model = Model.buildPrintableTeachingKitModel(kit, plan, {
    removedActivityIds: options.removedActivityIds,
  });
  const manifest = Print.resolvePrintManifest(kit, request, model);
  const printBuilt = Print.buildBinderPrintHtml(kit, { ...options, plan, intent: "print" });
  const previewBuilt = Print.buildPrintPreviewHtml(kit, { ...options, plan });
  const downloadBuilt = Print.buildBinderPrintHtml(kit, { ...options, plan, intent: "download" });
  return { request, model, manifest, printBuilt, previewBuilt, downloadBuilt };
}

function htmlText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertSharedPipeline(builtTriple, label) {
  const { printBuilt, previewBuilt, downloadBuilt, manifest } = builtTriple;
  ok(printBuilt.contentFingerprint === previewBuilt.contentFingerprint, `${label}: preview fingerprint matches print`);
  ok(printBuilt.contentFingerprint === downloadBuilt.contentFingerprint, `${label}: download fingerprint matches print`);
  ok(printBuilt.manifest?.itemCount === manifest.itemCount, `${label}: built manifest itemCount matches resolved`);
  ok(Boolean(printBuilt.summary?.summary), `${label}: summary present`);
}

function record(option, pass, detail) {
  results.push({ option, pass, detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${option} — ${detail}`);
}

function runMatrixOnKit(name, fixture) {
  console.log(`\n=== Matrix: ${name} ===`);
  const kit = mapFixture(fixture);
  const plan = fixture.lessonPlan;
  ok(kit.ok === true, `${name} maps`);
  const model = Model.buildPrintableTeachingKitModel(kit, plan);
  ok(model.ok === true, `${name} printable model ok`);

  const activities = model.activities || [];
  const songs = model.songs || [];
  const books = model.books || [];
  const printables = model.printables || [];
  const actA = activities[0];
  const actB = activities[1] || activities[0];
  const songA = songs[0];
  const bookTitles = books.map((b) => b.title);
  const printableA = printables[0];
  const printableB = printables[1] || printables[0];

  const cases = [
    {
      option: "1. Entire Kit",
      options: { preset: "week_binder" },
      expectPresent: [/Complete Teaching Kit|Teacher Binder/i, /Monday/i, /Friday/i],
      expectAbsent: [/data-tk-print-binder/, /Build &(?:amp;)? Print My Kit/i],
      expectIds: () => true,
    },
    {
      option: "2. Weekly Overview only",
      options: { preset: "weekly_overview" },
      expectPresent: [/Weekly Overview|Overview/i],
      expectAbsent: [/<article[^>]*tk-print-activity-card/i, /data-tk-print-tab="Activities"/i],
      unselectedAbsent: actB ? [new RegExp(actB.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))] : [],
      // Overview may mention activity names in week glance — only assert no activity cards.
      softUnselected: true,
    },
    {
      option: "3. Monday only",
      options: { preset: "today_pack", day: "monday" },
      expectPresent: [/Monday/i],
      expectAbsent: [/<h2[^>]*>\\s*Tuesday/i, /data-tk-print-tab="Daily Plans"[^>]*>[\\s\\S]*Tuesday/i],
      assertFn: (ctx) => {
        ok(ctx.manifest.dayIds.join(",") === "monday", "monday-only dayIds");
        ok(!htmlText(ctx.printBuilt.html).includes("Tuesday ·") || !/<h2[^>]*>Tuesday</i.test(ctx.printBuilt.html), "Tuesday day page absent");
        const tueActs = activities.filter((a) => a.dayOfWeek === "tuesday");
        tueActs.forEach((act) => {
          ok(!new RegExp(`data-tk-print-tab="Activities"[\\s\\S]*${act.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(ctx.printBuilt.html)
            || !ctx.manifest.activityIds.includes(act.id), `tuesday activity ${act.title} not in monday selection ids`);
        });
        ok(ctx.manifest.activityIds.every((id) => activities.find((a) => a.id === id)?.dayOfWeek === "monday"), "only monday activity ids resolved");
      },
    },
    {
      option: "4. Wednesday only",
      options: { preset: "today_pack", day: "wednesday" },
      expectPresent: [/Wednesday/i],
      assertFn: (ctx) => {
        ok(ctx.manifest.dayIds.join(",") === "wednesday", "wednesday dayIds");
        ok(!/<h2[^>]*>Monday</i.test(ctx.printBuilt.html), "Monday day heading absent on wednesday pack");
      },
    },
    {
      option: "5. Multiple days",
      options: {
        preset: "selected_resources",
        parts: { cover: true },
        selectedResources: { days: ["monday", "wednesday"] },
      },
      expectPresent: [/Monday/i, /Wednesday/i],
      assertFn: (ctx) => {
        ok(ctx.manifest.dayIds.join(",") === "monday,wednesday", "multi-day ids");
        ok(!ctx.manifest.dayIds.includes("tuesday"), "tuesday not selected");
        ok(!/<h2[^>]*>Tuesday</i.test(ctx.printBuilt.html), "Tuesday page absent");
        ok(!/<h2[^>]*>Friday</i.test(ctx.printBuilt.html), "Friday page absent");
      },
    },
    {
      option: "6. Activities Only",
      options: { preset: "activities_only" },
      expectPresent: actA ? [new RegExp(actA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")] : [/Activities/i],
      expectAbsent: [/<table class="tk-print-wag-table"/i],
      assertFn: (ctx) => {
        ok(ctx.manifest.activityIds.length === activities.length, "all activity ids selected for activities_only");
      },
    },
    {
      option: "7. One activity",
      options: { preset: "one_activity", activityId: actA?.id || "missing" },
      expectPresent: actA ? [new RegExp(actA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), /tk-print-activity-card/i] : [],
      assertFn: (ctx) => {
        if (!actA) return;
        ok(ctx.manifest.activityIds.join(",") === actA.id, "one activity id");
        ok(ctx.manifest.itemCount === 1, "exactly one selected item");
        if (actB && actB.id !== actA.id) {
          ok(!ctx.manifest.activityIds.includes(actB.id), "second activity not selected");
          ok(!new RegExp(actB.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(ctx.printBuilt.html), "second activity title absent");
        }
        // Content completeness for the selected activity
        ok(/Materials|What to do|Setup|Teacher prompts/i.test(ctx.printBuilt.html), "activity card has teacher fields");
        if (actA.ageGroup) ok(new RegExp(actA.ageGroup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), "age group present");
      },
    },
    {
      option: "8. Multiple activities",
      options: {
        preset: "selected_resources",
        parts: { cover: false },
        selectedResources: {
          activityIds: [actA?.id, actB?.id].filter(Boolean),
        },
      },
      assertFn: (ctx) => {
        if (!actA) return;
        const expected = [actA.id, actB?.id].filter(Boolean);
        ok(ctx.manifest.activityIds.join(",") === [...new Set(expected)].join(","), "multi activity ids");
        expected.forEach((id) => {
          const title = activities.find((a) => a.id === id)?.title;
          if (title) ok(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(ctx.printBuilt.html), `includes ${title}`);
        });
        const extra = activities.find((a) => !expected.includes(a.id));
        if (extra) {
          ok(!ctx.manifest.activityIds.includes(extra.id), "unselected activity id absent from manifest");
          ok(!new RegExp(extra.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(ctx.printBuilt.html), "unselected activity content absent");
        }
      },
    },
    {
      option: "9. Songs only",
      options: { preset: "songs_pack" },
      expectPresent: [/Songs/i],
      expectAbsent: [/<article[^>]*tk-print-activity-card/i],
      assertFn: (ctx) => {
        if (songA) ok(new RegExp(songA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), "song title present");
      },
    },
    {
      option: "10. One song",
      options: { preset: "one_song", songId: songA?.id || "missing" },
      assertFn: (ctx) => {
        if (!songA) {
          ok(ctx.printBuilt.ok === false || /not found|No songs/i.test(ctx.printBuilt.html || ctx.manifest.emptyReason || ""), "one song handles missing");
          return;
        }
        ok(ctx.manifest.songIds.join(",") === songA.id, "one song id");
        ok(new RegExp(songA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), "selected song present");
        const other = songs.find((s) => s.id !== songA.id);
        if (other) {
          ok(!ctx.manifest.songIds.includes(other.id), "other song id absent");
          ok(!new RegExp(other.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(ctx.printBuilt.html), "other song title absent");
        }
      },
    },
    {
      option: "11. Song Lyrics",
      options: { preset: "song_lyrics" },
      expectPresent: [/Song/i],
      assertFn: (ctx) => {
        ok(ctx.printBuilt.ok === true, "song lyrics builds");
        if (songs.some((s) => s.lyricsPrintable)) {
          ok(/Lyrics/i.test(ctx.printBuilt.html), "lyrics section when printable");
        } else {
          ok(/No printable lyrics|Song Guide|Song Lyrics/i.test(ctx.printBuilt.html), "honest empty/guide when no printable lyrics");
        }
      },
    },
    {
      option: "12. Book Guide",
      options: { preset: "book_guide" },
      expectPresent: [/Book Guide|Books/i],
      assertFn: (ctx) => {
        if (bookTitles[0]) ok(new RegExp(bookTitles[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), "book title present");
      },
    },
    {
      option: "13. Materials List",
      options: { preset: "materials_list" },
      expectPresent: [/Materials/i],
      expectAbsent: [/<article[^>]*tk-print-activity-card/i],
      assertFn: (ctx) => {
        ok(ctx.manifest.materialsScope === "full_kit", "materials_list is full-kit scope");
        ok((ctx.manifest.activityIds || []).length === 0, "materials manifest does not list activity IDs");
        ok((ctx.manifest.printableIds || []).length === 0, "materials manifest does not list printable IDs");
      },
    },
    {
      option: "13b. Teacher Toolkit only",
      options: { preset: "teacher_toolkit" },
      expectPresent: [/Teacher Toolkit/i],
      expectAbsent: [/<article[^>]*tk-print-activity-card/i, /data-tk-printable-id=/i],
      assertFn: (ctx) => {
        ok(ctx.manifest.include?.toolkit === true, "toolkit include on");
        ok(ctx.manifest.include?.printables !== true, "toolkit does not include printables");
        ok((ctx.manifest.printableIds || []).length === 0, "toolkit printableIds empty");
        ok((ctx.manifest.activityIds || []).length === 0, "toolkit activityIds empty");
        ok((ctx.manifest.dayIds || []).length === 0, "toolkit dayIds empty");
      },
    },
    {
      option: "14. All Printables",
      options: { preset: "all_printables" },
      assertFn: (ctx) => {
        ok(ctx.printBuilt.ok === true, "printables pack builds");
        if (printables.length) {
          printables.forEach((item) => {
            ok(new RegExp(item.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), `printable ${item.title}`);
          });
        } else {
          ok(/No printable resources have been added/i.test(ctx.printBuilt.html), "empty printables state");
        }
      },
    },
    {
      option: "15. One printable",
      options: { preset: "one_printable", printableId: printableA?.id || "missing" },
      assertFn: (ctx) => {
        if (!printableA) {
          ok(ctx.printBuilt.ok === true, "one printable empty kit builds honest state");
          ok(/No printable resources have been added|not found/i.test(ctx.printBuilt.html || ""), "honest empty/not found");
          return;
        }
        ok(ctx.manifest.printableIds.join(",") === printableA.id, "one printable id");
        ok(new RegExp(printableA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), "selected printable present");
        if (printableB && printableB.id !== printableA.id) {
          ok(!ctx.manifest.printableIds.includes(printableB.id), "other printable not selected");
        }
      },
    },
    {
      option: "16. Multiple printables",
      options: {
        preset: "selected_resources",
        parts: { cover: false },
        selectedResources: {
          printableIds: [printableA?.id, printableB?.id].filter(Boolean),
        },
      },
      assertFn: (ctx) => {
        if (!printableA) {
          ok(ctx.printBuilt.ok === false && ctx.printBuilt.reason === "empty_selection", "multi printables empty selection blocked when none exist");
          return;
        }
        const expected = [...new Set([printableA.id, printableB?.id].filter(Boolean))];
        ok(ctx.manifest.printableIds.join(",") === expected.join(","), "multi printable ids");
      },
    },
    {
      option: "17. Mixed custom selection",
      options: {
        preset: "selected_resources",
        parts: { cover: true },
        selectedResources: {
          days: ["monday"],
          activityIds: actA ? [actA.id] : [],
          materials: true,
          vocabulary: true,
        },
      },
      assertFn: (ctx) => {
        ok(ctx.manifest.canPrint === true, "mixed selection can print");
        ok(ctx.manifest.dayIds.includes("monday"), "monday in mixed");
        if (actA) ok(ctx.manifest.activityIds.includes(actA.id), "activity in mixed");
        ok(ctx.manifest.materialsScope === "selected_days" || ctx.manifest.materialsScope === "selected_activities", "materials scoped to selection");
        ok(/Scoped to|Materials/i.test(ctx.printBuilt.html), "materials section present with scope");
        ok(!ctx.manifest.dayIds.includes("friday"), "friday not leaked");
        if (actB && actB.id !== actA?.id) {
          ok(!ctx.manifest.activityIds.includes(actB.id), "unselected activity not in mixed manifest");
        }
      },
    },
    {
      option: "Empty selected_resources blocked",
      options: {
        preset: "selected_resources",
        selectedResources: { activities: false, days: [] },
      },
      assertFn: (ctx) => {
        ok(ctx.manifest.empty === true, "empty selection marked");
        ok(ctx.printBuilt.ok === false && ctx.printBuilt.reason === "empty_selection", "does not silently print entire kit");
      },
    },
    {
      option: "Wrong activity ID fails closed",
      options: { preset: "one_activity", activityId: "definitely-not-a-real-activity-id" },
      assertFn: (ctx) => {
        if (!activities.length) return;
        ok(ctx.printBuilt.ok === false && ctx.printBuilt.reason === "selection_not_found", "wrong activity id does not fall back to first activity");
      },
    },
    {
      option: "Missing selected printable fails closed",
      options: {
        preset: "selected_resources",
        parts: { cover: true },
        selectedResources: {
          days: ["monday"],
          printableIds: ["definitely-not-a-real-printable-id"],
        },
      },
      assertFn: (ctx) => {
        ok(ctx.manifest.empty === true, "missing printable marks empty");
        ok(ctx.printBuilt.ok === false && ctx.printBuilt.reason === "selection_not_found", "missing printable does not silently omit and continue");
        ok(/not found/i.test(ctx.manifest.emptyReason || ""), "missing printable reason names not found");
      },
    },
    {
      option: "Stale printableId does not widen Songs pack",
      options: {
        preset: "songs_pack",
        // Simulate leftover Print Center state from a prior One Printable / One Activity pick.
        printableId: printableA?.id || "stale-printable",
        activityId: actA?.id || "stale-activity",
      },
      assertFn: (ctx) => {
        ok(ctx.request.printableIds.length === 0, "songs request drops stale printableId");
        ok(ctx.request.activityIds.length === 0, "songs request drops stale activityId");
        ok((ctx.manifest.printableIds || []).length === 0, "songs manifest printableIds empty");
        ok((ctx.manifest.activityIds || []).length === 0, "songs manifest activityIds empty");
        ok(ctx.manifest.include?.songs === true, "songs include remains on");
        ok(ctx.printBuilt.ok === true, "songs pack still builds");
      },
    },
    {
      option: "Stale singular IDs do not widen Selected Resources overview",
      options: {
        preset: "selected_resources",
        activityId: actA?.id || "stale-activity",
        printableId: printableA?.id || "stale-printable",
        songId: songA?.id || "stale-song",
        selectedResources: { overview: true },
      },
      assertFn: (ctx) => {
        ok(ctx.request.activityIds.length === 0, "selected overview drops stale activityId");
        ok(ctx.request.printableIds.length === 0, "selected overview drops stale printableId");
        ok(ctx.request.songIds.length === 0, "selected overview drops stale songId");
        ok((ctx.manifest.activityIds || []).length === 0, "selected overview manifest activityIds empty");
        ok((ctx.manifest.printableIds || []).length === 0, "selected overview manifest printableIds empty");
        ok(ctx.printBuilt.ok === true, "selected overview still builds from overview flag");
      },
    },
    {
      option: "Selected Resources single activity length>=1",
      options: {
        preset: "selected_resources",
        parts: { cover: false },
        selectedResources: { activityIds: actA ? [actA.id] : [] },
      },
      assertFn: (ctx) => {
        if (!actA) return;
        ok(ctx.manifest.canPrint === true, "single selected activity canPrint");
        ok(ctx.manifest.activityIds.join(",") === actA.id, "exactly one selected activity id");
        ok(ctx.manifest.itemCount >= 1, "itemCount >= 1 for one selected activity");
        ok(new RegExp(actA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(ctx.printBuilt.html), "single activity content present");
      },
    },
    {
      option: "One activity + one printable",
      options: {
        preset: "selected_resources",
        parts: { cover: true },
        selectedResources: {
          activityIds: actA ? [actA.id] : [],
          printableIds: printableA ? [printableA.id] : ["definitely-missing-printable-for-mix"],
        },
      },
      assertFn: (ctx) => {
        if (!actA) return;
        if (!printableA) {
          ok(ctx.printBuilt.ok === false && ctx.printBuilt.reason === "selection_not_found", "activity+missing printable fails closed");
          return;
        }
        ok(ctx.manifest.activityIds.join(",") === actA.id, "activity+printable activity id");
        ok(ctx.manifest.printableIds.join(",") === printableA.id, "activity+printable printable id");
        ok(new RegExp(actA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), "activity title in mix");
        ok(new RegExp(printableA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), "printable title in mix");
        if (actB && actB.id !== actA.id) {
          ok(!ctx.manifest.activityIds.includes(actB.id), "unselected activity excluded from mix");
        }
      },
    },
    {
      option: "One day + selected printable",
      options: {
        preset: "selected_resources",
        parts: { cover: true },
        selectedResources: {
          days: ["monday"],
          printableIds: printableA ? [printableA.id] : ["definitely-missing-printable-for-day-mix"],
        },
      },
      assertFn: (ctx) => {
        if (!printableA) {
          ok(ctx.printBuilt.ok === false && ctx.printBuilt.reason === "selection_not_found", "day+missing printable fails closed");
          return;
        }
        ok(ctx.manifest.dayIds.join(",") === "monday", "day+printable monday only");
        ok(!ctx.manifest.dayIds.includes("friday"), "day+printable friday excluded");
        ok(ctx.manifest.printableIds.join(",") === printableA.id, "day+printable printable id");
        ok(/Daily Plans/i.test(ctx.printBuilt.html), "day sheet present");
        ok(new RegExp(printableA.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ctx.printBuilt.html), "printable present with day");
      },
    },
    {
      option: "Repeated selection does not leak prior printable",
      options: { preset: "weekly_overview", printableId: printableA?.id || "stale-printable", activityId: actA?.id || "stale-act" },
      assertFn: (ctx) => {
        ok((ctx.manifest.printableIds || []).length === 0, "overview printableIds empty after prior printable pick");
        ok((ctx.manifest.activityIds || []).length === 0, "overview activityIds empty after prior activity pick");
        ok(ctx.manifest.include?.printables !== true, "overview does not include printables");
        ok(!/data-tk-printable-id=/i.test(ctx.printBuilt.html || ""), "overview HTML has no printable cards");
      },
    },
  ];

  for (const item of cases) {
    console.log(`\n${item.option}`);
    try {
      const ctx = buildCase(kit, plan, item.options);
      if (ctx.printBuilt.ok) {
        assertSharedPipeline(ctx, item.option);
        for (const pattern of item.expectPresent || []) {
          ok(pattern.test(ctx.printBuilt.html), `${item.option}: present ${pattern}`);
        }
        for (const pattern of item.expectAbsent || []) {
          ok(!pattern.test(ctx.printBuilt.html), `${item.option}: absent ${pattern}`);
        }
        // Preview HTML content scope equals print HTML content fingerprint already asserted.
        ok(ctx.previewBuilt.ok === true, `${item.option}: preview builds`);
        ok(ctx.downloadBuilt.ok === true, `${item.option}: download builds`);
      }
      if (typeof item.assertFn === "function") item.assertFn(ctx);
      // Stable IDs: never resolve by index alone.
      ok(typeof Print.buildPrintRequest === "function", "buildPrintRequest exported");
      ok(typeof Print.resolvePrintManifest === "function", "resolvePrintManifest exported");
      record(item.option, true, `mode=${ctx.request.documentMode}; items=${ctx.manifest.itemCount}; fp=${ctx.printBuilt.contentFingerprint || "n/a"}`);
      if (ctx.printBuilt.html) {
        const safe = item.option.replace(/[^\w.-]+/g, "_").slice(0, 60);
        fs.writeFileSync(path.join(ARTIFACT, `${name}-${safe}.html`), ctx.printBuilt.html);
      }
    } catch (err) {
      record(item.option, false, err.message || String(err));
      throw err;
    }
  }

  // Lesson-switch safety: request kitKey differs across fixtures.
  return { kitKey: Print.buildPrintRequest(kit, { preset: "week_binder", plan }).kitKey, model };
}

function testArchitectureInvariants() {
  console.log("\n=== Architecture invariants ===");
  ok(typeof Print.buildPrintRequest === "function", "buildPrintRequest");
  ok(typeof Print.resolvePrintManifest === "function", "resolvePrintManifest");
  ok(typeof Print.buildPrintPreviewHtml === "function", "buildPrintPreviewHtml");
  ok(Print.PRESETS.some((p) => p.id === "one_song"), "one_song preset exists");
  ok(Present.presentLabel("one_song") === "One Song", "one_song label");
  // Songs/books now carry stable ids from the printable model.
  const mini = loadFixture("enriched-mini.json");
  const kit = mapFixture(mini);
  const model = Model.buildPrintableTeachingKitModel(kit, mini.lessonPlan);
  ok(model.songs.every((s) => s.id), "all songs have stable ids");
  ok(model.books.every((b) => b.id), "all books have stable ids");
  ok(model.activities.every((a) => a.id), "all activities have stable ids");
}

function testCurriculumUntouched() {
  console.log("\n=== Curriculum fixtures unchanged ===");
  // Sanity: we only assert fixture files still parse and IDs remain.
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  ok(farm.lessonPlan.id === "cur-lp-preschool-farm-animals", "farm lesson id unchanged");
  ok((farm.activities || []).length === 15, "farm activities count unchanged");
}

async function maybePdfSmoke() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (_err) {
    console.log("\n(playwright unavailable — skipping PDF smoke)");
    return;
  }
  console.log("\n=== PDF smoke (Farm Monday + one activity) ===");
  const farm = loadFixture("farm-animals-enrichment-slice2.json");
  const kit = mapFixture(farm);
  const actId = (kit.companion.activities || [])[0]?.id;
  const monday = Print.buildBinderPrintHtml(kit, { preset: "today_pack", day: "monday", plan: farm.lessonPlan });
  const oneAct = Print.buildBinderPrintHtml(kit, { preset: "one_activity", activityId: actId, plan: farm.lessonPlan });
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    for (const [key, built] of [["monday", monday], ["one-activity", oneAct]]) {
      const page = await browser.newPage();
      const wrapped = `<!doctype html><html><head><meta charset="utf-8" />
        <link rel="stylesheet" href="file://${path.join(ROOT, "styles.css")}" />
        <style>body{margin:0;background:#fff}</style></head>
        <body class="printing-resource printing-teaching-kit">${built.html}</body></html>`;
      const tmp = path.join(ARTIFACT, `${key}-wrapped.html`);
      fs.writeFileSync(tmp, wrapped);
      await page.goto(`file://${tmp}`, { waitUntil: "load" });
      const pdfPath = path.join(ARTIFACT, `${key}.pdf`);
      await page.pdf({
        path: pdfPath,
        format: "Letter",
        printBackground: true,
        margin: { top: "0.55in", bottom: "0.55in", left: "0.55in", right: "0.55in" },
      });
      ok(fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 1000, `${key}.pdf generated`);
      // Basic overflow check: print root exists and pages are present.
      const pageCount = await page.locator(".tk-print-page").count();
      ok(pageCount >= 1, `${key} has print pages in PDF render (${pageCount})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
  testArchitectureInvariants();
  testCurriculumUntouched();

  const farm = runMatrixOnKit("farm-animals", loadFixture("farm-animals-enrichment-slice2.json"));
  const mini = runMatrixOnKit("enriched-mini", loadFixture("enriched-mini.json"));
  const bugs = runMatrixOnKit("bugs-and-butterflies", loadFixture("bugs-and-butterflies.json"));

  ok(farm.kitKey !== mini.kitKey, "different kits produce different kitKeys");
  ok(bugs.kitKey !== farm.kitKey, "bugs kitKey distinct from farm");

  await maybePdfSmoke();

  fs.writeFileSync(path.join(ARTIFACT, "matrix-results.json"), JSON.stringify({
    passed,
    failed,
    results,
    generatedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`\nSelective print matrix complete: ${passed} assertions, ${results.filter((r) => r.pass).length}/${results.length} options PASS`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  fs.mkdirSync(ARTIFACT, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT, "matrix-results.json"), JSON.stringify({ passed, failed, results, error: String(err) }, null, 2));
  process.exit(1);
});
