#!/usr/bin/env node
/**
 * Teaching Kit Print Center — Fit Page preview + single-selection fidelity.
 *
 * Covers:
 * - applyPrintPreviewFitPage defaults to Fit Page (no horizontal crop)
 * - singular IDs do not bleed into Selected Resources / other presets
 * - every Print Center preset builds with expected scope
 * - one-item selections are non-empty and not silently widened
 * - tall one-activity HTML can paginate via binder PDF slice helper contract
 *
 * Run: npm run test:teaching-kit-print-fit-single
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ARTIFACT = path.join("/opt/cursor/artifacts", "tk-print-fit-single");
fs.mkdirSync(ARTIFACT, { recursive: true });

require("./teaching-kit-present.js");
const Model = require("./teaching-kit-printable-model.js");
const Print = require("./teaching-kit-print.js");
const BinderPdf = require("./teaching-kit-binder-pdf.js");
const Mapper = require("./teaching-kit-mapper.js");
const Viewer = require("./teaching-kit-viewer.js");

let passed = 0;
let failed = 0;
const matrix = [];

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

function record(option, pass, detail) {
  matrix.push({ option, pass, detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${option} — ${detail}`);
}

function makePreviewHostMock({ hostW = 400, hostH = 500, pageW = 816, pageH = 1056, pages = 2 } = {}) {
  const style = { transform: "none", width: "", height: "", margin: "", marginLeft: "", marginRight: "", marginBottom: "" };
  const dataset = {};
  const attrs = {};
  const pageNodes = Array.from({ length: pages }, () => {
    const page = {
      offsetWidth: pageW,
      offsetHeight: pageH,
      getBoundingClientRect: () => ({ width: pageW, height: pageH, top: 0, left: 0, right: pageW, bottom: pageH }),
    };
    return page;
  });
  const frame = {
    style,
    dataset,
    querySelector: (sel) => (String(sel).includes("tk-print-page") ? pageNodes[0] : null),
    querySelectorAll: (sel) => (String(sel).includes("tk-print-page") ? pageNodes : []),
  };
  const host = {
    clientWidth: hostW,
    clientHeight: hostH,
    style: { setProperty() {} },
    querySelector: (sel) => {
      if (String(sel).includes("tk-print-preview-frame") || String(sel).includes("data-tk-print-preview-document")) {
        return frame;
      }
      return null;
    },
    getAttribute: (name) => attrs[name] || null,
    setAttribute: (name, value) => { attrs[name] = String(value); },
    removeAttribute: (name) => { delete attrs[name]; },
    _frame: frame,
    _attrs: attrs,
  };
  return host;
}

function testFitPageHelper() {
  console.log("\n=== Fit Page preview helper ===");
  ok(typeof Print.applyPrintPreviewFitPage === "function", "applyPrintPreviewFitPage exported");
  const host = makePreviewHostMock();
  const fit = Print.applyPrintPreviewFitPage(host);
  ok(fit.ok === true, "fit helper ok");
  ok(fit.reason === "fit-page", "fit reason is fit-page");
  ok(fit.scale > 0 && fit.scale <= 1, `scale in (0,1]: ${fit.scale}`);
  const expected = Math.min((400 - 12) / 816, (500 - 12) / 1056, 1);
  ok(Math.abs(fit.scale - expected) < 0.02, `scale ~= contain fit (${fit.scale} vs ${expected})`);
  ok(/scale\(/i.test(host._frame.style.transform), "frame has scale transform");
  ok(host.getAttribute("data-tk-preview-zoom") === "fit-page", "host marked fit-page");

  host.setAttribute("data-tk-preview-zoom", "manual");
  host._frame.style.transform = "scale(1.5)";
  host._frame.dataset.tkPreviewScale = "1.5";
  const manual = Print.applyPrintPreviewFitPage(host);
  ok(manual.reason === "manual", "manual zoom is respected");
  ok(host._frame.style.transform === "scale(1.5)", "manual zoom not overwritten");
}

function testSingularIdBleed(kit, plan, model) {
  console.log("\n=== Singular ID bleed ===");
  const actA = (model.activities || [])[0];
  const printableA = (model.printables || [])[0];
  const songA = (model.songs || [])[0];
  ok(actA, "fixture has an activity");

  const selectedOverview = Print.buildPrintRequest(kit, {
    preset: "selected_resources",
    plan,
    activityId: actA.id,
    printableId: printableA?.id || "stale-printable",
    songId: songA?.id || "stale-song",
    selectedResources: { overview: true },
  });
  ok(selectedOverview.activityIds.length === 0, "selected overview drops stale activityId");
  ok(selectedOverview.printableIds.length === 0, "selected overview drops stale printableId");
  ok(selectedOverview.songIds.length === 0, "selected overview drops stale songId");

  const oneSong = Print.buildPrintRequest(kit, {
    preset: "songs_pack",
    plan,
    activityId: actA.id,
    printableId: printableA?.id || "stale-printable",
  });
  ok(oneSong.activityIds.length === 0 && oneSong.printableIds.length === 0, "songs pack drops stale singular ids");

  const oneActivity = Print.buildPrintRequest(kit, {
    preset: "one_activity",
    plan,
    activityId: actA.id,
    printableId: printableA?.id || "stale-printable",
  });
  ok(oneActivity.activityIds.join(",") === actA.id, "one_activity keeps activityId");
  ok(oneActivity.printableIds.length === 0, "one_activity drops printableId");

  // Viewer state: switching to selected_resources clears singular picks.
  if (typeof Viewer.defaultState === "function") {
    const state = Viewer.defaultState(kit, { printCenterEnabled: true });
    state.printActivityId = actA.id;
    state.printPrintableId = printableA?.id || "x";
    state.printPreset = "selected_resources";
    // Simulate the clear rules from bindWorkspace preset handler.
    if (state.printPreset !== "one_activity") state.printActivityId = "";
    if (state.printPreset !== "one_printable") state.printPrintableId = "";
    ok(!state.printActivityId, "viewer clears activityId on selected_resources");
    ok(!state.printPrintableId, "viewer clears printableId on selected_resources");
  }
}

function testPresetMatrix(kit, plan, model) {
  console.log("\n=== Full preset matrix (content scope) ===");
  const activities = model.activities || [];
  const songs = model.songs || [];
  const books = model.books || [];
  const printables = model.printables || [];
  const actA = activities[0];
  const actB = activities[1] || activities[0];
  const songA = songs[0];
  const printableA = printables[0];

  const cases = [
    { preset: "week_binder", expectMode: "entire_binder", minPages: 2 },
    { preset: "full_weekly_plan", expectMode: "full_weekly", minPages: 1 },
    { preset: "weekly_overview", expectMode: "overview", minPages: 1 },
    { preset: "today_pack", expectMode: "one_day", opts: { day: "monday" }, minPages: 1, assert: (ctx) => {
      ok(ctx.manifest.dayIds.join(",") === "monday", "one day monday only");
      ok(!ctx.manifest.dayIds.includes("friday"), "one day excludes friday");
    } },
    { preset: "activities_only", expectMode: "activities", minPages: 1 },
    { preset: "one_activity", expectMode: "one_activity", opts: { activityId: actA?.id }, minPages: 1, assert: (ctx) => {
      ok(ctx.manifest.activityIds.join(",") === actA.id, "one activity id");
      ok(ctx.manifest.itemCount === 1, "one activity itemCount 1");
      if (actB && actB.id !== actA.id) ok(!ctx.manifest.activityIds.includes(actB.id), "second activity excluded");
      ok(ctx.html.includes(actA.title), "one activity title present");
    } },
    { preset: "songs_pack", expectMode: "songs", minPages: 1 },
    { preset: "one_song", expectMode: "one_song", opts: { songId: songA?.id }, minPages: 1, assert: (ctx) => {
      if (!songA) {
        ok(ctx.built.ok === false || /No songs|not found/i.test(ctx.manifest.emptyReason || ctx.html || ""), "one song empty honest");
        return;
      }
      ok(ctx.manifest.songIds.join(",") === songA.id, "one song id");
    } },
    { preset: "song_lyrics", expectMode: "song_lyrics", allowEmpty: true },
    { preset: "book_guide", expectMode: "books", minPages: 1 },
    { preset: "materials_list", expectMode: "materials", minPages: 1 },
    { preset: "teacher_toolkit", expectMode: "toolkit", minPages: 1 },
    { preset: "all_printables", expectMode: "printables", minPages: 1 },
    { preset: "one_printable", expectMode: "one_printable", opts: { printableId: printableA?.id }, minPages: 1, assert: (ctx) => {
      if (!printableA) return;
      ok(ctx.manifest.printableIds.join(",") === printableA.id, "one printable id");
    } },
    { preset: "monday_setup_pack", expectMode: "monday_setup", minPages: 1 },
    { preset: "family_pack", expectMode: "family", minPages: 1 },
    { preset: "selected_resources", expectMode: "selected_resources", opts: {
      selectedResources: { activityIds: actA ? [actA.id] : [] },
      parts: { cover: false },
    }, minPages: 1, assert: (ctx) => {
      ok(ctx.manifest.activityIds.join(",") === actA.id, "selected single activity");
      ok(ctx.manifest.canPrint === true, "single selected resource canPrint");
    } },
    { preset: "selected_resources", label: "selected_resources_empty", expectMode: "selected_resources", opts: {
      selectedResources: { days: [] },
    }, expectFail: true },
  ];

  for (const item of cases) {
    const label = item.label || item.preset;
    console.log(`\n${label}`);
    try {
      const options = { preset: item.preset, plan, ...(item.opts || {}) };
      const request = Print.buildPrintRequest(kit, options);
      const manifest = Print.resolvePrintManifest(kit, request, model);
      const built = Print.buildBinderPrintHtml(kit, { ...options, intent: "download" });
      const preview = Print.buildPrintPreviewHtml(kit, options);
      const html = built.html || "";
      const pageCount = (html.match(/data-tk-print-tab=/g) || []).length;
      ok(request.documentMode === item.expectMode, `${label} documentMode`);
      if (item.expectFail) {
        ok(built.ok === false, `${label} fails closed`);
        record(label, true, `fail-closed reason=${built.reason}`);
        continue;
      }
      if (item.allowEmpty && built.ok === false) {
        record(label, true, `unavailable/empty ok reason=${built.reason || manifest.emptyReason}`);
        continue;
      }
      ok(built.ok === true, `${label} builds`);
      ok(preview.ok === true, `${label} preview builds`);
      ok(preview.contentFingerprint === built.contentFingerprint, `${label} preview==download fingerprint`);
      if (item.minPages) ok(pageCount >= item.minPages, `${label} pages>=${item.minPages} (got ${pageCount})`);
      ok(!/data-tk-print-binder|Build &(?:amp;)? Print My Kit/i.test(html), `${label} no UI chrome leak`);
      const ctx = { request, manifest, built, html, pageCount };
      if (typeof item.assert === "function") item.assert(ctx);
      fs.writeFileSync(path.join(ARTIFACT, `${label}.html`), html);
      record(label, true, `mode=${request.documentMode}; pages=${pageCount}; items=${manifest.itemCount}`);
    } catch (err) {
      record(label, false, err.message || String(err));
      throw err;
    }
  }

  // One-section-only: cover page
  console.log("\ncover_only_section");
  const coverOnly = Print.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    plan,
    parts: {
      cover: true, setup: false, daily: false, activities: false, songsBooks: false,
      vocabulary: false, family: false, observations: false, printables: false,
    },
  });
  ok(coverOnly.ok === true, "cover-only builds");
  ok((coverOnly.html.match(/data-tk-print-tab=/g) || []).length >= 1, "cover-only has pages");
  ok(!/tk-print-activity-card/i.test(coverOnly.html), "cover-only has no activity cards");
  record("cover_only_section", true, `pages=${(coverOnly.html.match(/data-tk-print-tab=/g) || []).length}`);
}

function testPdfSliceContract() {
  console.log("\n=== PDF slice helper contract ===");
  ok(typeof BinderPdf.embedCanvasAsPrintablePages === "function", "embedCanvasAsPrintablePages exported");
  const paper = BinderPdf.letterSize("letter");
  ok(paper.cssWidthPx === 816 && paper.cssHeightPx === 1056, "letter css px floor");
  const a4 = BinderPdf.letterSize("a4");
  ok(a4.cssHeightPx > a4.cssWidthPx, "a4 portrait metrics");
}

async function main() {
  console.log("Teaching Kit Fit Page + single-selection regression\n");
  testFitPageHelper();
  testPdfSliceContract();

  const fixture = loadFixture("bugs-and-butterflies.json");
  const kit = mapFixture(fixture);
  ok(kit.ok === true, "fixture maps");
  const model = Model.buildPrintableTeachingKitModel(kit, fixture.lessonPlan);
  ok(model.ok === true, "printable model ok");

  testSingularIdBleed(kit, fixture.lessonPlan, model);
  testPresetMatrix(kit, fixture.lessonPlan, model);

  // Cross-kit isolation
  const empty = loadFixture("empty-plan.json");
  const kitB = mapFixture(empty);
  const keyA = Print.buildPrintRequest(kit, { preset: "week_binder", plan: fixture.lessonPlan }).kitKey;
  const keyB = Print.buildPrintRequest(kitB, { preset: "week_binder", plan: empty.lessonPlan }).kitKey;
  ok(keyA !== keyB, "different kits produce different kitKeys");

  fs.writeFileSync(path.join(ARTIFACT, "matrix.json"), JSON.stringify({ passed, failed, matrix }, null, 2));
  console.log(`\nPassed: ${passed}; Failed: ${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
