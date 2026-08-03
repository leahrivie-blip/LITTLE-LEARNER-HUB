#!/usr/bin/env node
/**
 * Teaching Kit Enrichment helpers — unit tests.
 * Run: node scripts/test-teaching-kit-enrichment.js
 */
const assert = require("node:assert/strict");
const enrichment = require("./teaching-kit-enrichment.js");

function samplePlan() {
  return {
    id: "cur-lp-test-enrich",
    title: "Farm Animals",
    age: "Preschool",
    status: "published",
    plan: "Pro",
    coverImageUrl: "https://example.com/cover.jpg",
    weeklyOverview: "A week of farm fun.",
    objectives: "Explore farm animals through play and songs.",
    books: [{ title: "Big Red Barn" }],
    songs: [{ title: "Old MacDonald" }],
    familyConnection: "Ask about favorite animals.",
    observationOpportunities: "Watch for sorting skills.",
    weeklyMaterials: "bins, animals",
    resourceIds: ["res-1"],
    dailyPlans: {
      monday: {
        items: [
          { itemId: "m1", title: "Color Sorting Barn", activityCategory: "Fine Motor" },
          { itemId: "m2", title: "Barn Songs", activityCategory: "Music and Movement" },
        ],
      },
      tuesday: { items: [{ itemId: "t1", title: "Sensory Hay", activityCategory: "Sensory" }] },
      wednesday: { items: [{ itemId: "w1", title: "Farm Walk", activityCategory: "Gross Motor" }] },
      thursday: { items: [{ itemId: "th1", title: "Animal Matching", activityCategory: "Matching" }] },
      friday: { items: [{ itemId: "f1", title: "Family Farm Share", activityCategory: "Social-Emotional" }] },
    },
  };
}

function main() {
  const plan = samplePlan();
  const acts = enrichment.flattenLessonActivities(plan, []);
  assert.equal(acts.length, 6, "flattens weekday activities");

  assert.equal(enrichment.activityStatus(acts[0], null), "not_started");
  assert.equal(
    enrichment.activityStatus(acts[0], { setupImageUrl: "https://x.test/a.jpg" }),
    "in_progress",
  );
  assert.equal(
    enrichment.activityStatus(acts[0], {
      setupImageUrl: "https://x.test/a.jpg",
      exampleImageUrl: "https://x.test/b.jpg",
      teacherTips: ["Prep trays before circle"],
    }),
    "complete",
  );

  const draft = {
    activities: {
      [acts[0].id]: {
        setupImageUrl: "https://x.test/a.jpg",
        exampleImageUrl: "https://x.test/b.jpg",
        teacherTips: ["Tip"],
      },
    },
  };
  const firstIncomplete = enrichment.firstIncompleteActivityIndex(acts, draft.activities);
  assert.equal(firstIncomplete, 1, "skips first complete activity");

  const pct0 = enrichment.computeCompletionPercent(plan, [], null);
  // Week story / books / family / printables score without activity enrichment.
  // Activity photo/tip/depth weights keep a published-but-unenriched plan below Enriched.
  assert.ok(pct0 >= 30 && pct0 < 50, `baseline percent with week basics (${pct0})`);

  const pctRich = enrichment.computeCompletionPercent(plan, [], {
    week: {
      teacherPreparation: "Stage trays before arrival.",
      teacherToolkit: {
        prepChecklist: ["Set bins", "Print vocab cards"],
        observationFocus: ["Uses animal words", "Takes turns"],
      },
    },
    activities: Object.fromEntries(acts.map((a) => [a.id, {
      setupImageUrl: "https://x.test/s.jpg",
      exampleImageUrl: "https://x.test/e.jpg",
      teacherTips: ["Ready"],
      settingTags: ["indoor", "small_group"],
      substitutions: [{ need: "hay", use: "shredded paper" }],
      observationPrompts: ["Listens for animal sounds"],
      setup: "Place bins at child height.",
      steps: "Invite children to sort and name animals.",
      adaptations: "Offer larger pieces for beginners.",
      indoorAlternatives: "Table sort if weather blocks outdoor time.",
      outdoorAlternatives: "Take the sort mats outdoors.",
    }])),
  });
  assert.ok(pctRich >= 90, `rich enrichment near complete (${pctRich})`);
  assert.equal(enrichment.completenessLabelFromPercent(pctRich), "Complete");

  const hits = enrichment.buildJumpIndex(plan, [], null);
  assert.ok(hits.some((h) => h.type === "activity" && /Color Sorting/i.test(h.label)));
  assert.ok(hits.some((h) => h.type === "book"));
  const found = enrichment.searchJumpIndex(hits, "macdonald");
  assert.equal(found.length, 1);

  const summary = enrichment.summarizePublishChanges(plan, [], draft);
  assert.equal(summary.isPublished, true);
  assert.ok(summary.photoChanges >= 2);
  assert.ok(summary.completionAfter > summary.completionBefore);

  const merged = enrichment.mergeDraftIntoPlan(plan, [], {
    activities: {
      [acts[0].id]: {
        setupImageUrl: "https://x.test/a.jpg",
        exampleImageUrl: "https://x.test/b.jpg",
        teacherTips: ["Whisper tip"],
      },
    },
  });
  const mondayItem = merged.plan.dailyPlans.monday.items[0];
  assert.equal(mondayItem.setupImageUrl, "https://x.test/a.jpg");
  assert.ok(merged.plan.teachingKit?.completionPercent >= 0);

  const upgrade = enrichment.buildUpgradeSummary(plan, [], null);
  assert.equal(upgrade.completenessLabel, "Legacy");
  assert.equal(upgrade.incompleteActivities, 6);
  assert.equal(upgrade.missingSetupPhotos, 6);
  assert.equal(upgrade.missingExamplePhotos, 6);
  assert.equal(upgrade.missingTeacherTips, 6);
  assert.equal(upgrade.missingBooks, false);
  assert.equal(upgrade.missingSongs, false);
  assert.equal(upgrade.missingPrintables, false);
  assert.equal(upgrade.missingFamilyConnection, false);
  assert.equal(upgrade.isPublished, true);
  assert.equal(upgrade.needsReview, true);
  assert.ok(enrichment.matchesUpgradeGapFilter(upgrade, "missing_photos"));
  assert.ok(enrichment.matchesUpgradeGapFilter(upgrade, "needs_review"));
  assert.equal(enrichment.matchesUpgradeGapFilter(upgrade, "missing_books"), false);

  const richSummary = enrichment.buildUpgradeSummary(plan, [], {
    updatedAt: "2026-08-03T12:00:00.000Z",
    lastEditedBy: "owner@example.com",
    activities: Object.fromEntries(acts.map((a) => [a.id, {
      setupImageUrl: "https://x.test/s.jpg",
      exampleImageUrl: "https://x.test/e.jpg",
      teacherTips: ["Ready"],
      observationPrompts: ["Watch sorting"],
      settingTags: ["indoor"],
      substitutions: [{ need: "hay", use: "paper" }],
      vocabulary: ["barn", "cow"],
    }])),
  });
  assert.ok(richSummary.completionPercent >= 90);
  assert.equal(richSummary.incompleteActivities, 0);
  assert.equal(richSummary.missingSetupPhotos, 0);
  assert.equal(richSummary.lastEditedBy, "owner@example.com");
  assert.equal(richSummary.hasEnrichmentDraft, true);

  const studioView = enrichment.activityEnrichmentView(acts[0], {
    teacherTips: ["Tip"],
    observationPrompts: ["Watch turns"],
    vocabulary: ["cow", "barn"],
    settingTags: ["small_group", "indoor"],
    substitutions: [{ need: "basket", use: "tray" }],
  });
  assert.deepEqual(studioView.vocabulary, ["cow", "barn"]);
  assert.equal(studioView.observationPrompts.length, 1);
  assert.equal(enrichment.activityStatus(acts[0], {
    teacherTips: ["Tip"],
    vocabulary: ["cow"],
  }), "in_progress");

  console.log(`OK teaching-kit-enrichment (${pct0}% baseline → ${pctRich}% rich; upgrade summary ready)`);
}

main();
