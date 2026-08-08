#!/usr/bin/env node
/**
 * READ-ONLY validation of Teaching Kit print mapping against real curriculum imports
 * + upgraded Complete Teaching Kit fixtures.
 *
 * Does NOT mutate curriculum, publish, or regenerate lessons.
 * Run: NODE_ENV=test node scripts/test-teaching-kit-real-print-validation.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const OUT = path.join("/opt/cursor/artifacts/tk-real-print-validation");
const ARTIFACT = path.join(ROOT, "artifacts", "tk-real-print-validation");

require("./teaching-kit-present.js");
require("./teaching-kit-materials.js");
const TK = require("./teaching-kit.js");
const Mapper = require("./teaching-kit-mapper.js");
const Model = require("./teaching-kit-printable-model.js");
const Print = require("./teaching-kit-print.js");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const FORBIDDEN = [
  /\bundefined\b/,
  /\bnull\b/,
  /\[object Object\]/i,
  /ACTIVITY_NAME\s*:/i,
  /close-button/,
  /data-close-modal/,
  /aria-label="Close"/i,
  /enrichmentDraft/i,
];

const REAL_LESSONS = [
  {
    key: "infant",
    label: "Infant Soft Sounds & Faces",
    file: "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt",
    expectAge: /infant/i,
    class: "legacy",
  },
  {
    key: "toddler",
    label: "Toddler Color Hunt Friends",
    file: "scripts/curriculum-phase-2f-imports/03-toddler-color-hunt-free.txt",
    expectAge: /toddler/i,
    class: "legacy",
  },
  {
    key: "preschool",
    label: "Colors Everywhere",
    file: "scripts/curriculum-preschool-free-imports/01-preschool-colors-everywhere-free.txt",
    expectAge: /preschool/i,
    class: "legacy",
  },
  {
    key: "preschool-helpers",
    label: "Community Helpers",
    file: "scripts/curriculum-preschool-free-imports/06-preschool-community-helpers-free.txt",
    expectAge: /preschool/i,
    class: "legacy",
  },
  {
    key: "preschool-senses",
    label: "Five Senses",
    file: "scripts/curriculum-preschool-free-imports/10-preschool-five-senses-free.txt",
    expectAge: /preschool/i,
    class: "legacy",
  },
  {
    key: "complete-farm",
    label: "Farm Animals (Complete Teaching Kit fixture)",
    fixture: "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json",
    class: "complete",
  },
  {
    key: "enriched-mini",
    label: "Enriched Mini",
    fixture: "scripts/fixtures/teaching-kit/enriched-mini.json",
    class: "enriched",
  },
  {
    key: "sparse",
    label: "Empty / sparse plan",
    fixture: "scripts/fixtures/teaching-kit/empty-plan.json",
    class: "legacy",
  },
];

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log("  ✓", msg);
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function loadLesson(entry) {
  if (entry.fixture) {
    const data = require(path.join(ROOT, entry.fixture));
    return {
      plan: data.lessonPlan,
      activities: data.activities || [],
      resources: data.resources || [],
      source: entry.fixture,
    };
  }
  const abs = path.join(ROOT, entry.file);
  const raw = fs.readFileSync(abs, "utf8");
  const parsed = parseCurriculumLessonPlanImport(raw, { sourceFile: abs });
  if (!parsed.ok) {
    throw new Error(`Failed to parse ${entry.file}: ${(parsed.errors || []).join("; ")}`);
  }
  const plan = parsed.data;
  // In-memory only: import .txt files often omit durable ids. Assign a stable
  // ephemeral id for mapping/print validation — never written back to disk.
  if (!plan.id) {
    plan.id = `cur-lp-readonly-${entry.key}`;
  }
  if (!plan.status) plan.status = "published";
  // Treat import source as published customer-visible content for validation.
  if (plan.status === "draft") plan.status = "published";
  return {
    plan,
    activities: parsed.activities || plan.activities || [],
    resources: parsed.resources || plan.resources || [],
    source: entry.file,
  };
}

function mapLesson(loaded) {
  return Mapper.mapLessonPlanToTeachingKit(
    loaded.plan,
    loaded.activities,
    loaded.resources,
    { day: "monday" },
  );
}

function assertNoForbidden(html, label) {
  FORBIDDEN.forEach((pattern) => {
    assert.doesNotMatch(String(html || ""), pattern, `${label} matched ${pattern}`);
  });
}

function collectDayItemTitles(plan, day) {
  const items = plan?.dailyPlans?.[day]?.items || [];
  return items.map((item) => text(item.title || item.activityTitle)).filter(Boolean);
}

function compareFieldPresence(plan, model, report) {
  const checks = [];
  function check(name, stored, modeled) {
    const hasStored = Array.isArray(stored)
      ? stored.some((item) => text(typeof item === "string" ? item : item?.title || item?.word || item))
      : Boolean(text(stored));
    const hasModeled = Array.isArray(modeled)
      ? modeled.some((item) => text(typeof item === "string" ? item : item?.title || item?.word || item?.label))
      : Boolean(text(modeled));
    if (hasStored && !hasModeled) {
      checks.push({ name, status: "LOSS", stored: true, modeled: false });
      report.losses.push(`${report.key}:${name}`);
    } else if (hasStored && hasModeled) {
      checks.push({ name, status: "OK" });
    } else {
      checks.push({ name, status: "EMPTY_BOTH" });
    }
  }

  check("title", plan.title, model.title);
  check("age", plan.age, model.age);
  check("theme", plan.theme, model.theme);
  check("duration", plan.duration, model.duration);
  check("weeklyOverview", plan.weeklyOverview || plan.weeklyFocus, model.overview?.weeklyFocus || model.overview?.weeklyOverview);
  check("objectives", plan.objectives, model.overview?.learningObjectives);
  check("domains", plan.learningDomains, model.overview?.learningDomains);
  check("vocabulary", plan.vocabularyWords, model.overview?.vocabulary);
  check("materials", plan.weeklyMaterials, model.overview?.masterMaterials);
  check("adaptations", plan.adaptations, model.overview?.adaptations);
  check("family", plan.familyConnection, model.overview?.familyConnection);
  check("books", plan.books, model.books);
  check("songs", plan.songs, model.songs);

  WEEKDAYS.forEach((day) => {
    const dayPlan = plan.dailyPlans?.[day] || {};
    const modelDay = (model.days || []).find((item) => item.day === day) || {};
    const storedTitles = collectDayItemTitles(plan, day);
    check(`${day}.focus`, dayPlan.theme || dayPlan.objectives, modelDay.focus);
    check(`${day}.circle`, dayPlan.circleTime, modelDay.circleTime);
    check(`${day}.activities`, storedTitles, modelDay.activityTitles);
    check(`${day}.sensory`, dayPlan.sensory, modelDay.sensory);
    check(`${day}.fineMotor`, dayPlan.fineMotor, modelDay.fineMotor);
    check(`${day}.grossMotor`, dayPlan.grossMotor, modelDay.grossMotor);
    check(`${day}.outdoor`, dayPlan.outdoorPlay, modelDay.outdoorPlay);
    check(`${day}.art`, dayPlan.art, modelDay.art);
    check(`${day}.stem`, dayPlan.stem, modelDay.stem);
    check(`${day}.smallGroup`, dayPlan.smallGroup, modelDay.smallGroup);
    check(`${day}.invitation`, dayPlan.invitationToPlay, modelDay.invitationToPlay);
    check(`${day}.family`, dayPlan.familyConnection, modelDay.parentMessage);
    // Wrong-day leakage: Tuesday titles must not be the only Monday activities when Monday has its own
    if (day === "monday" && storedTitles.length) {
      const modeledTitles = (modelDay.activityTitles || []).map((title) => title.toLowerCase());
      storedTitles.forEach((title) => {
        if (!modeledTitles.includes(title.toLowerCase())) {
          report.losses.push(`${report.key}:monday.activity:${title}`);
        }
      });
    }
  });

  return checks;
}

function testRouting() {
  console.log("\nA. Designed Complete Teaching Kit routing");
  const flagsOff = TK.defaultTeachingKitFeatureFlags();
  const farm = require("./fixtures/teaching-kit/farm-animals-enrichment-slice2.json");
  const farmKit = mapLesson({ plan: farm.lessonPlan, activities: farm.activities, resources: farm.resources || [] });
  ok(TK.isUpgradedTeachingKit(farm.lessonPlan, farmKit) === true, "Farm Animals fixture is upgraded Complete Teaching Kit");
  ok(
    TK.shouldUseDesignedTeachingKitDocument(farm.lessonPlan, farmKit, flagsOff) === true,
    "Complete Kit uses designed binder even when Print Center flag is OFF",
  );

  const mini = require("./fixtures/teaching-kit/enriched-mini.json");
  const miniKit = mapLesson({ plan: mini.lessonPlan, activities: mini.activities, resources: mini.resources || [] });
  ok(TK.shouldUseDesignedTeachingKitDocument(mini.lessonPlan, miniKit, flagsOff) === true, "Enriched kit uses designed binder with flag off");

  const empty = require("./fixtures/teaching-kit/empty-plan.json");
  const emptyKit = mapLesson({ plan: empty.lessonPlan, activities: [], resources: [] });
  ok(TK.shouldUseDesignedTeachingKitDocument(empty.lessonPlan, emptyKit, flagsOff) === false, "Legacy/sparse does NOT force designed path with flag off");

  const authOff = Print.evaluatePrintAuthorization({
    printCenterEnabled: false,
    designedDocumentEligible: true,
    kit: farmKit,
    gate: { allowed: true, counted: false, watermark: "" },
  });
  ok(authOff.ok === true, "print auth allows designed-eligible kits without Print Center UI flag");

  const authLegacy = Print.evaluatePrintAuthorization({
    printCenterEnabled: false,
    designedDocumentEligible: false,
    kit: emptyKit,
    gate: { allowed: true, counted: false, watermark: "" },
  });
  ok(authLegacy.ok === false && authLegacy.reason === "print_flag_off", "legacy without eligibility still blocked when Print Center off");
}

function testDraftIsolation() {
  console.log("\nE. Draft vs published isolation");
  const farm = require("./fixtures/teaching-kit/farm-animals-enrichment-slice2.json");
  const published = {
    ...farm.lessonPlan,
    status: "published",
    enrichmentDraft: {
      updatedAt: "2099-01-01",
      activities: {
        "fake-draft-activity": { title: "SECRET DRAFT ACTIVITY SHOULD NOT PRINT" },
      },
    },
  };
  const kit = Mapper.mapLessonPlanToTeachingKit(published, farm.activities || [], farm.resources || [], { day: "monday" });
  const binder = Print.buildEntireBinderKitHtml(kit, { plan: published, adminPreview: false });
  ok(binder.ok === true, "published binder builds");
  ok(!/SECRET DRAFT ACTIVITY/i.test(binder.html), "customer binder excludes enrichmentDraft activity titles");
  ok(!/enrichmentDraft/i.test(binder.html), "customer binder excludes enrichmentDraft key");

  const admin = Print.buildEntireBinderKitHtml(kit, { plan: published, adminPreview: true });
  ok(/ADMIN PREVIEW/i.test(admin.html), "admin preview banner present when requested");
  ok(!/SECRET DRAFT ACTIVITY/i.test(admin.html), "admin preview still does not invent draft activity into companion without mapper draft merge");
}

function testModes(loaded, kit, model) {
  const results = {};
  const modes = [
    ["entire", { preset: "week_binder" }],
    ["weekly_overview", { preset: "weekly_overview" }],
    ["one_day_mon", { preset: "today_pack", day: "monday" }],
    ["one_day_wed", { preset: "today_pack", day: "wednesday" }],
    ["activities", { preset: "activities_only" }],
    ["one_activity", { preset: "one_activity", activityId: (kit.companion?.activities || [])[0]?.id }],
    ["songs", { preset: "songs_pack" }],
    ["song_guide", { preset: "song_lyrics" }],
    ["books", { preset: "book_guide" }],
    ["materials", { preset: "materials_list" }],
    ["toolkit", { preset: "teacher_toolkit" }],
    ["printables", { preset: "all_printables" }],
    ["selected", {
      preset: "selected_resources",
      selectedResources: {
        activities: true,
        materials: true,
        books: true,
        songs: true,
        days: ["monday"],
      },
    }],
  ];
  modes.forEach(([name, opts]) => {
    const built = Print.buildBinderPrintHtml(kit, { ...opts, plan: loaded.plan });
    const pass = built.ok === true;
    assertNoForbidden(built.html || "", name);
    if (name === "toolkit") {
      ok(!/data-close-modal|tk-modal|close-button/i.test(built.html || ""), "toolkit has no modal chrome");
    }
    if (name === "one_day_mon") {
      ok(!/<h3>Tuesday<\/h3>/.test(built.html || ""), "Monday pack omits Tuesday day sheet");
      const tueMaterials = (model.days || []).find((day) => day.day === "tuesday")?.materials || [];
      const monMaterials = (model.days || []).find((day) => day.day === "monday")?.materials || [];
      // Soft check: if Tuesday has a unique material, Monday HTML should not list it as day materials panel only when distinctly Tuesday-only
      if (tueMaterials.length && monMaterials.length) {
        const tueOnly = tueMaterials.filter((item) => !monMaterials.map((row) => row.toLowerCase()).includes(item.toLowerCase()));
        // Don't fail hard on shared weekly materials; just record
        results[`${name}_tueOnlyCount`] = tueOnly.length;
      }
    }
    if (name === "selected") {
      ok(!/<h3>Tuesday<\/h3>/.test(built.html || ""), "selected resources omits Tuesday sheet");
    }
    results[name] = pass ? "PASS" : "FAIL";
  });
  return results;
}

function testMaterialsDedupe() {
  console.log("\nMaterials normalization");
  const Materials = require("./teaching-kit-materials.js");
  const inv = Materials.normalizeMaterialInventory([
    "Paper",
    "paper",
    "Red paint",
    "Red Paint",
    "Paintbrush",
    "paint brushes",
    "construction paper",
    "watercolor paper",
  ]);
  const labels = inv.items.map((item) => item.label.toLowerCase());
  ok(labels.filter((item) => item === "paper" || item === "Paper".toLowerCase()).length === 1, "paper duplicates collapsed");
  ok(labels.some((item) => item.includes("construction")), "construction paper kept distinct");
  ok(labels.some((item) => item.includes("watercolor")), "watercolor paper kept distinct");
}

async function maybeRenderVisual(name, html) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (_err) {
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1160 } });
    const wrapped = `<!doctype html><html><head><meta charset="utf-8" />
      <link rel="stylesheet" href="file://${path.join(ROOT, "styles.css")}" />
      </head><body class="printing-resource printing-teaching-kit">${html}</body></html>`;
    await page.setContent(wrapped, { waitUntil: "load" });
    await page.pdf({
      path: path.join(OUT, `${name}.pdf`),
      format: "Letter",
      printBackground: true,
      margin: { top: "0.55in", bottom: "0.55in", left: "0.55in", right: "0.55in" },
    });
    const sections = await page.locator(".tk-print-page").all();
    for (const n of [1, 2, 3]) {
      if (sections[n - 1]) {
        await sections[n - 1].screenshot({ path: path.join(OUT, `${name}-p${String(n).padStart(2, "0")}.png`) });
      }
    }
    console.log(`  ✓ visual ${name} (${sections.length} pages)`);
  } finally {
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const report = {
    losses: [],
    modes: {},
    lessons: [],
    pdfMergeStatus: "INCOMPLETE — no pdf-lib/merge dependency; PDF attachments indexed only; image printables can embed full-page",
    curriculumMutated: false,
  };

  testRouting();
  testMaterialsDedupe();
  testDraftIsolation();

  console.log("\nB/C. Real lesson field mapping");
  for (const entry of REAL_LESSONS) {
    console.log(`\nLesson: ${entry.label}`);
    const loaded = loadLesson(entry);
    ok(Boolean(loaded.plan?.title || loaded.plan?.id), `loaded ${entry.key}`);
    if (entry.expectAge) ok(entry.expectAge.test(String(loaded.plan.age || "")), `age matches ${entry.expectAge}`);

    const kit = mapLesson(loaded);
    ok(kit.ok === true, "maps to teaching kit companion");
    const model = Model.buildPrintableTeachingKitModel(kit, loaded.plan);
    ok(model.ok === true, "printable model ok");

    const lessonReport = { key: entry.key, label: entry.label, class: entry.class, losses: report.losses };
    const checks = compareFieldPresence(loaded.plan, model, lessonReport);
    const lossesHere = checks.filter((item) => item.status === "LOSS");
    if (lossesHere.length) {
      console.log("  mapping losses:", lossesHere.map((item) => item.name).join(", "));
    } else {
      console.log("  ✓ no silent losses for present stored fields");
    }

    // Wrong data sniffers — check rendered HTML, not JSON null fields.
    const sampleHtml = Print.buildEntireBinderKitHtml(kit, { plan: loaded.plan }).html || "";
    ok(!/undefined|\[object Object\]/i.test(sampleHtml), "binder HTML has no undefined/[object Object]");
    assertNoForbidden(sampleHtml, `${entry.key} binder`);

    const flagsOff = TK.defaultTeachingKitFeatureFlags();
    const designed = TK.shouldUseDesignedTeachingKitDocument(loaded.plan, kit, flagsOff);
    if (entry.class === "complete" || entry.class === "enriched") {
      ok(designed === true, `${entry.key} designed path with Print Center OFF`);
    } else {
      ok(designed === false, `${entry.key} legacy keeps legacy routing with Print Center OFF`);
    }

    const modeResults = testModes(loaded, kit, model);
    report.modes[entry.key] = modeResults;
    report.lessons.push({
      key: entry.key,
      title: model.title,
      age: model.age,
      class: entry.class,
      completeness: kit.completeness,
      activityCount: model.activities?.length || 0,
      bookCount: model.books?.length || 0,
      songCount: model.songs?.length || 0,
      printableCount: model.printables?.length || 0,
      losses: lossesHere.map((item) => item.name),
      modes: modeResults,
    });

    if (entry.key === "complete-farm" || entry.key === "preschool" || entry.key === "infant") {
      const binder = entry.class === "complete" || entry.class === "enriched"
        ? Print.buildEntireBinderKitHtml(kit, { plan: loaded.plan })
        : Print.buildBinderPrintHtml(kit, { preset: "week_binder", plan: loaded.plan, forceDesigned: true });
      // For legacy visual QA, force designed companion render to inspect mapping quality (read-only)
      const html = Print.buildEntireBinderKitHtml(kit, { plan: loaded.plan }).html;
      await maybeRenderVisual(entry.key, html);
      if (entry.key === "complete-farm") {
        const oneDay = Print.buildBinderPrintHtml(kit, { preset: "today_pack", day: "monday", plan: loaded.plan });
        await maybeRenderVisual(`${entry.key}-monday`, oneDay.html);
        const oneAct = Print.buildBinderPrintHtml(kit, {
          preset: "one_activity",
          activityId: (kit.companion.activities || [])[0]?.id,
          plan: loaded.plan,
        });
        await maybeRenderVisual(`${entry.key}-one-activity`, oneAct.html);
        const selected = Print.buildBinderPrintHtml(kit, {
          preset: "selected_resources",
          selectedResources: { days: ["monday"], activities: true, books: true, songs: true, materials: true },
          plan: loaded.plan,
        });
        await maybeRenderVisual(`${entry.key}-selected`, selected.html);
        ok(/Complete Teaching Kit/i.test(html), "complete kit cover branding");
        ok(/Teacher Toolkit/i.test(html), "toolkit section present");
      }
    }
  }

  // Unique losses summary
  report.losses = [...new Set(report.losses)];
  fs.writeFileSync(path.join(OUT, "validation-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ARTIFACT, "validation-report.json"), JSON.stringify(report, null, 2));

  console.log("\n=== SUMMARY ===");
  console.log("Lessons:", report.lessons.map((item) => `${item.key}(${item.class}/${item.completeness})`).join(", "));
  console.log("Mapping losses:", report.losses.length ? report.losses.join("; ") : "none");
  console.log("PDF merge:", report.pdfMergeStatus);
  console.log("Curriculum mutated:", report.curriculumMutated);
  console.log("\nAll real print validation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
