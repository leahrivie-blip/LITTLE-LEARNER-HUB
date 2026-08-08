#!/usr/bin/env node
/**
 * Teaching Kit Enrichment helpers — unit tests.
 * Run: node scripts/test-teaching-kit-enrichment.js
 *
 * Scoring expectations match structural vs premium readiness (#540):
 * title-only books/songs and missing weekday focus keep structural % low;
 * image briefs / printable ideas never inflate toward Publish Ready.
 */
const assert = require("node:assert/strict");
const enrichment = require("./teaching-kit-enrichment.js");

function samplePlan() {
  return {
    id: "cur-lp-test-enrich",
    title: "Farm Animals",
    age: "Preschool",
    theme: "Farm",
    status: "published",
    plan: "Pro",
    coverImageUrl: "https://example.com/cover.jpg",
    weeklyOverview: "A week of farm fun with sorting, songs, and outdoor play.",
    objectives: "Explore farm animals through play and songs.",
    vocabularyWords: "cow, barn, hay, sort",
    books: [{ title: "Big Red Barn" }],
    songs: [{ title: "Old MacDonald" }],
    familyConnection: "Ask about favorite animals.",
    observationOpportunities: "Watch for sorting skills.",
    weeklyMaterials: "bins, animals",
    resourceIds: ["res-1"],
    // Catalog entry required — bare ids never count as published printables.
    dailyPlans: {
      monday: {
        theme: "Color sorting at the barn",
        items: [
          { itemId: "m1", title: "Color Sorting Barn", activityCategory: "Fine Motor" },
          { itemId: "m2", title: "Barn Songs", activityCategory: "Music and Movement" },
        ],
      },
      tuesday: {
        theme: "Sensory farm textures",
        items: [{ itemId: "t1", title: "Sensory Hay", activityCategory: "Sensory" }],
      },
      wednesday: {
        theme: "Gross motor farm walk",
        items: [{ itemId: "w1", title: "Farm Walk", activityCategory: "Gross Motor" }],
      },
      thursday: {
        theme: "Animal matching games",
        items: [{ itemId: "th1", title: "Animal Matching", activityCategory: "Matching" }],
      },
      friday: {
        theme: "Family farm share",
        items: [{ itemId: "f1", title: "Family Farm Share", activityCategory: "Social-Emotional" }],
      },
    },
  };
}

function completeBook() {
  return {
    title: "Big Red Barn",
    author: "Margaret Wise Brown",
    whyThisBook: "Simple farm vocabulary and predictable rhythm for preschoolers.",
    beforeReadingQuestions: ["What animals might live on a farm?"],
    duringReadingPrompts: ["Point to the barn door."],
    afterReadingQuestions: ["Which animal would you care for?"],
  };
}

function completeSong() {
  return {
    title: "Old MacDonald",
    rightsStatus: "public_domain",
    motions: "Tap knees for each animal sound.",
    whenToUse: "Circle time transition into farm play.",
  };
}

function completeToolkit() {
  return {
    teacherPreparation: "Stage trays before arrival and preview tongs.",
    mixedAgeAdaptations: "Toddlers sort two colors; older peers lead naming.",
    extraSupportAdaptations: "Offer hand-over-hand for tongs as needed.",
    challengeExtensions: "Invite children to invent a new sorting rule.",
    safetyInclusionNotes: "Keep small pieces out of mouths; supervise tongs.",
    endOfWeekReflection: "Which animal words showed up most in play?",
    familyConnection: "Ask families which farm animals children talk about at home.",
    teacherTips: ["Model one sort, then step back."],
    setupCleanupShortcuts: ["Bins on low shelf", "Tongs in caddy"],
    observationFocus: ["Uses animal words", "Takes turns"],
    documentationPrompts: ["Photo of child sorting with peer"],
    materialSubstitutions: [{ need: "hay", use: "shredded paper" }],
  };
}

function publishedResources() {
  return [{ id: "res-1", title: "Farm printable", status: "published", type: "printable" }];
}

function main() {
  const plan = samplePlan();
  const acts = enrichment.flattenLessonActivities(plan, []);
  const resources = publishedResources();
  assert.equal(acts.length, 6, "flattens weekday activities");
  assert.equal(enrichment.hasLinkedPrintable(plan, {}, resources), true, "published resource counts");
  assert.equal(enrichment.hasLinkedPrintable(plan, {}, [{ id: "res-1", status: "draft" }]), false, "draft resource does not count");
  assert.equal(enrichment.hasLinkedPrintable(plan, {}, []), false, "bare id without catalog does not count");

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

  const baselineScores = enrichment.computeReadinessScores(plan, [], null, { resources });
  const pct0 = baselineScores.completionPercent;
  // Title-only books/songs + incomplete toolkit keep structural % intentionally low (#540).
  assert.ok(pct0 < 45, `baseline structural percent stays below Enriched (${pct0})`);
  assert.equal(enrichment.completenessLabelFromPercent(pct0), "Legacy");
  assert.ok(typeof baselineScores.premiumReadinessPercent === "number", "premium readiness exposed");
  assert.ok(baselineScores.completeBooks === 0, "title-only books are incomplete");
  assert.ok(baselineScores.completeSongs === 0, "title-only songs are incomplete");
  assert.ok(baselineScores.imageBriefsOnly === 0, "no image briefs counted as assets at baseline");

  const richDraft = {
    week: {
      weeklyOverview: "A week of farm fun with sorting, songs, and outdoor play for preschoolers.",
      objectives: "Explore farm animals through play, songs, and peer sorting talk.",
      weeklyMaterials: "bins, animals, tongs, trays, cups, mats",
      teacherPreparation: "Stage trays before arrival.",
      books: [completeBook()],
      songs: [completeSong()],
      teacherToolkit: completeToolkit(),
      familyConnection: "Ask about favorite animals at home this week.",
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
      extensions: "Add a third sorting rule for older peers.",
      indoorAlternatives: "Table sort if weather blocks outdoor time.",
      outdoorAlternatives: "Take the sort mats outdoors.",
    }])),
  };
  const richScores = enrichment.computeReadinessScores(plan, [], richDraft, { resources });
  const pctRich = richScores.completionPercent;
  assert.ok(pctRich >= 90, `rich structural enrichment near complete (${pctRich})`);
  assert.ok(richScores.premiumReadinessPercent >= 90, `rich premium readiness (${richScores.premiumReadinessPercent})`);
  assert.equal(enrichment.completenessLabelFromPercent(pctRich), "Complete");
  assert.equal(richScores.completeBooks, 1, "complete book records count");
  assert.equal(richScores.completeSongs, 1, "complete song records count");
  // Unclassified activities expect 0 image slots until owner classifies.
  assert.equal(richScores.expectedSetupImages, 0, "unclassified expects no setup slots");
  assert.equal(richScores.expectedExampleImages, 0, "unclassified expects no example slots");
  assert.equal(richScores.setupImages, 0, "unclassified uploads do not count toward required slots");
  assert.equal(richScores.exampleImages, 0, "unclassified uploads do not count toward required slots");
  assert.equal(richScores.imageReadiness, 100, "zero expected slots → 100% image readiness");

  // Image briefs must not inflate structural completion toward Publish Ready.
  // Only owner-required slots track briefs-only (unclassified never creates image gaps).
  const briefOnly = enrichment.computeReadinessScores(plan, [], {
    week: { printableIdeas: ["Color cards"] },
    activities: Object.fromEntries(acts.map((a) => [a.id, {
      imageRequirement: "required",
      imageBriefSetup: "Two trays on a low table.",
      imageBriefExample: "Child sorting red blocks.",
    }])),
  });
  assert.ok(briefOnly.imageBriefsOnly > 0, "briefs detected");
  assert.equal(briefOnly.imageReadiness, 0, "briefs do not raise image readiness");
  assert.ok(briefOnly.completionPercent < 50, `briefs do not inflate structural % (${briefOnly.completionPercent})`);

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

  const upgrade = enrichment.buildUpgradeSummary(plan, [], null, { resources, skipQualityAttach: true });
  assert.equal(upgrade.completenessLabel, "Legacy");
  assert.equal(upgrade.incompleteActivities, 6);
  // Unclassified activities do not create missing-image gaps.
  assert.equal(upgrade.missingSetupPhotos, 0);
  assert.equal(upgrade.missingExamplePhotos, 0);
  assert.equal(upgrade.needsOwnerClassification, 6);
  assert.equal(upgrade.missingTeacherTips, 6);
  // Title-only catalog rows are incomplete under #540 resource rules.
  assert.equal(upgrade.missingBooks, true);
  assert.equal(upgrade.missingSongs, true);
  assert.equal(upgrade.missingPrintables, false);
  assert.equal(upgrade.missingFamilyConnection, false);
  assert.equal(upgrade.isPublished, true);
  assert.equal(upgrade.needsReview, true);
  assert.ok(!enrichment.matchesUpgradeGapFilter(upgrade, "missing_photos"), "unclassified is not a missing-photo gap");
  assert.ok(enrichment.matchesUpgradeGapFilter(upgrade, "needs_review"));
  assert.ok(enrichment.matchesUpgradeGapFilter(upgrade, "missing_books"));

  // Owner-required slots still surface missing_photos guidance.
  const requiredGap = enrichment.buildUpgradeSummary(plan, [], {
    activities: Object.fromEntries(acts.map((a) => [a.id, { imageRequirement: "required" }])),
  }, { resources, skipQualityAttach: true });
  assert.ok(requiredGap.missingSetupPhotos > 0);
  assert.ok(enrichment.matchesUpgradeGapFilter(requiredGap, "missing_photos"));

  const richSummary = enrichment.buildUpgradeSummary(plan, [], {
    updatedAt: "2026-08-03T12:00:00.000Z",
    lastEditedBy: "owner@example.com",
    ...richDraft,
  }, { resources, skipQualityAttach: true });
  assert.ok(richSummary.completionPercent >= 90, `rich summary percent (${richSummary.completionPercent})`);
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
  // Unclassified + tip is Complete for images (not a missing-photo gap); extras alone without tip stay In Progress.
  assert.equal(enrichment.activityStatus(acts[0], {
    vocabulary: ["cow"],
  }), "in_progress");
  assert.equal(enrichment.activityStatus(acts[0], {
    teacherTips: ["Tip"],
    vocabulary: ["cow"],
  }), "complete");
  assert.equal(enrichment.activityStatus(acts[0], {
    imageRequirement: "required",
    teacherTips: ["Tip"],
    vocabulary: ["cow"],
  }), "in_progress", "owner-required still needs photos");

  console.log(`OK teaching-kit-enrichment (${pct0}% baseline → ${pctRich}% rich; structural/premium scoring ready)`);
}

main();
