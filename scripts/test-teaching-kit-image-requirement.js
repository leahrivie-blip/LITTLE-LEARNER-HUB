#!/usr/bin/env node
/**
 * Teaching Kit — per-activity imageRequirement (instructional value).
 * Disposable fixtures only. Never edits production curriculum.
 *
 * Covers every requirement type:
 * - required (setup + example)
 * - setup_only
 * - example_only
 * - optional
 * - not_needed
 *
 * Also proves: briefs never count as images; Optional/Not needed can Complete
 * without photos and do not create image blockers; existing images are not stripped.
 *
 * Run: npm run test:teaching-kit-image-requirement
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const enrich = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");

const FIXTURE_PATH = path.join(__dirname, "fixtures/teaching-kit/image-requirement-types.json");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function loadFixture() {
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  return {
    plan: raw.lessonPlan,
    resources: raw.resources || [],
  };
}

function tipOnlyDraft(activityIds) {
  return Object.fromEntries(activityIds.map((id) => [id, { teacherTips: ["Practical classroom tip"] }]));
}

function main() {
  const { plan, resources } = loadFixture();
  const acts = enrich.flattenLessonActivities(plan, []);
  ok(acts.length === 6, `fixture has 6 activities (got ${acts.length})`);

  const byItem = Object.fromEntries(acts.map((a) => [a.itemId, a]));
  ok(byItem["qa-req-both"].imageRequirement === "required", "required field preserved on flatten");
  ok(byItem["qa-setup-only"].imageRequirement === "setup_only", "setup_only field preserved");
  ok(byItem["qa-example-only"].imageRequirement === "example_only", "example_only field preserved");
  ok(byItem["qa-optional"].imageRequirement === "optional", "optional field preserved");
  ok(byItem["qa-not-needed"].imageRequirement === "not_needed", "not_needed field preserved");

  // Category defaults (no explicit field)
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Art", title: "Paint" }) === "required",
    "Art defaults to required",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Sensory Play", title: "Bin" }) === "required",
    "Sensory defaults to required",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "STEM/Discovery", title: "Magnet" }) === "required",
    "STEM defaults to required",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Dramatic Play", title: "Vet clinic" }) === "required",
    "Dramatic Play defaults to required",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Fine Motor", title: "Printable cutting practice" }) === "required",
    "Printable hands-on defaults to required",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Circle Time", title: "Welcome" }) === "not_needed",
    "Circle Time defaults to not_needed",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Music & Movement", title: "Scarf Freeze Dance" }) === "not_needed",
    "Music & Movement defaults to not_needed",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Literacy", title: "Book discussion" }) === "optional",
    "Book discussion / literacy defaults to optional",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Gross Motor", title: "Simple movement walk" }) === "optional",
    "Simple movement defaults to optional",
  );
  ok(
    enrich.defaultImageRequirementForActivity({ activityCategory: "Matching", title: "Obvious animal game" }) === "optional",
    "Obvious games default to optional",
  );
  ok(
    enrich.resolveImageRequirement(byItem["qa-default-song-movement"], null) === "not_needed",
    "fixture Music & Movement activity resolves to not_needed without explicit field",
  );

  // --- required: needs both photos + tip ---
  const req = byItem["qa-req-both"];
  ok(enrich.activityStatus(req, { teacherTips: ["Tip"] }) === "in_progress", "required + tip only stays in progress");
  ok(
    enrich.activityStatus(req, {
      teacherTips: ["Tip"],
      setupImageUrl: "https://x.test/setup.jpg",
    }) === "in_progress",
    "required + setup only stays in progress",
  );
  ok(
    enrich.activityStatus(req, {
      teacherTips: ["Tip"],
      setupImageUrl: "https://x.test/setup.jpg",
      exampleImageUrl: "https://x.test/example.jpg",
    }) === "complete",
    "required completes with setup + example + tip",
  );
  ok(
    enrich.activityStatus(req, {
      teacherTips: ["Tip"],
      imageBriefSetup: "Tray brief",
      imageBriefExample: "Finished brief",
    }) === "in_progress",
    "required: briefs alone never complete",
  );

  // --- setup_only ---
  const setupOnly = byItem["qa-setup-only"];
  ok(
    enrich.activityStatus(setupOnly, {
      teacherTips: ["Tip"],
      setupImageUrl: "https://x.test/setup.jpg",
    }) === "complete",
    "setup_only completes with setup + tip (no example)",
  );
  ok(
    enrich.activityStatus(setupOnly, {
      teacherTips: ["Tip"],
      exampleImageUrl: "https://x.test/example.jpg",
    }) === "in_progress",
    "setup_only does not complete with example only",
  );

  // --- example_only ---
  const exampleOnly = byItem["qa-example-only"];
  ok(
    enrich.activityStatus(exampleOnly, {
      teacherTips: ["Tip"],
      exampleImageUrl: "https://x.test/example.jpg",
    }) === "complete",
    "example_only completes with example + tip (no setup)",
  );
  ok(
    enrich.activityStatus(exampleOnly, {
      teacherTips: ["Tip"],
      setupImageUrl: "https://x.test/setup.jpg",
    }) === "in_progress",
    "example_only does not complete with setup only",
  );

  // --- optional / not_needed: Complete without images ---
  const optional = byItem["qa-optional"];
  const notNeeded = byItem["qa-not-needed"];
  const songDefault = byItem["qa-default-song-movement"];
  ok(enrich.activityStatus(optional, { teacherTips: ["Tip"] }) === "complete", "optional completes without images");
  ok(enrich.activityStatus(notNeeded, { teacherTips: ["Tip"] }) === "complete", "not_needed completes without images");
  ok(enrich.activityStatus(songDefault, { teacherTips: ["Tip"] }) === "complete", "default not_needed song completes without images");

  // Existing images must remain visible / preserved in the enrichment view.
  const kept = enrich.activityEnrichmentView(optional, {
    teacherTips: ["Tip"],
    setupImageUrl: "https://x.test/kept-setup.jpg",
    exampleImageUrl: "https://x.test/kept-example.jpg",
  });
  ok(kept.setupImageUrl === "https://x.test/kept-setup.jpg", "optional keeps existing setup image");
  ok(kept.exampleImageUrl === "https://x.test/kept-example.jpg", "optional keeps existing example image");
  ok(kept.imageRequirement === "optional", "optional requirement retained");
  ok(enrich.activityStatus(optional, {
    teacherTips: ["Tip"],
    setupImageUrl: "https://x.test/kept-setup.jpg",
    exampleImageUrl: "https://x.test/kept-example.jpg",
  }) === "complete", "optional with existing images still complete");

  // Briefs never raise image readiness / never count as uploaded.
  const briefDraft = {
    activities: Object.fromEntries(acts.map((a) => [a.id, {
      imageRequirement: a.imageRequirement || undefined,
      teacherTips: ["Tip"],
      imageBriefSetup: "Brief setup only",
      imageBriefExample: "Brief example only",
    }])),
  };
  const briefScores = enrich.computeReadinessScores(plan, [], briefDraft, { resources });
  ok(briefScores.imageReadiness === 0, "briefs do not raise image readiness");
  ok(briefScores.setupImages === 0, "briefs are not setup uploads");
  ok(briefScores.exampleImages === 0, "briefs are not example uploads");
  ok(briefScores.imageBriefsOnly > 0, "briefs on required slots are tracked as briefs-only");

  // Optional/not_needed tip-only activities do not create missing photo counts.
  const tipDraft = {
    activities: tipOnlyDraft(acts.map((a) => a.id)),
  };
  // Preserve explicit requirements from fixture via flatten fields on activities.
  acts.forEach((a) => {
    if (a.imageRequirement) tipDraft.activities[a.id].imageRequirement = a.imageRequirement;
  });
  const tipSummary = enrich.buildUpgradeSummary(plan, [], tipDraft, { resources, skipQualityAttach: true });
  ok(tipSummary.missingSetupPhotos === 2, `tip-only missing setup = required slots only (got ${tipSummary.missingSetupPhotos})`);
  ok(tipSummary.missingExamplePhotos === 2, `tip-only missing example = required slots only (got ${tipSummary.missingExamplePhotos})`);
  ok(tipSummary.incompleteActivities === 3, `only required/setup_only/example_only stay incomplete without their photos (got ${tipSummary.incompleteActivities})`);
  ok(tipSummary.imageBriefsNotImages === 0, "no brief blockers when no briefs");

  // Quality review: optional/not_needed must not create image blockers.
  const mixedDraft = {
    week: {
      familyConnection: plan.familyConnection,
      books: plan.books,
      songs: plan.songs,
      weeklyMaterials: plan.weeklyMaterials,
      teacherToolkit: {
        teacherPreparation: "Stage trays before arrival and preview tongs with peers.",
        mixedAgeAdaptations: "Toddlers sort two colors; older peers lead naming games.",
        extraSupportAdaptations: "Offer hand-over-hand for tongs as needed during play.",
        challengeExtensions: "Invite children to invent a new sorting rule together.",
        safetyInclusionNotes: "Keep small pieces out of mouths; supervise tongs closely.",
        endOfWeekReflection: "Which animal words showed up most during free play?",
        familyConnection: plan.familyConnection,
        teacherTips: ["Model one sort, then step back."],
        setupCleanupShortcuts: ["Bins on low shelf", "Tongs in caddy"],
        observationFocus: ["Uses animal words", "Takes turns"],
        documentationPrompts: ["Photo of child sorting with a peer"],
        materialSubstitutions: [{ need: "hay", use: "shredded paper" }],
      },
      printableIds: plan.resourceIds,
    },
    activities: {
      [byItem["qa-req-both"].id]: {
        imageRequirement: "required",
        teacherTips: ["Tip"],
        setupImageUrl: "https://x.test/s.jpg",
        exampleImageUrl: "https://x.test/e.jpg",
        observationPrompts: ["Uses color words?"],
        indoorAlternatives: "Table work if floor is wet.",
        outdoorAlternatives: "Take trays to the patio.",
      },
      [byItem["qa-setup-only"].id]: {
        imageRequirement: "setup_only",
        teacherTips: ["Tip"],
        setupImageUrl: "https://x.test/setup-only.jpg",
        observationPrompts: ["Uses tongs?"],
        indoorAlternatives: "Floor mat sort.",
        outdoorAlternatives: "Sidewalk chalk sort.",
      },
      [byItem["qa-example-only"].id]: {
        imageRequirement: "example_only",
        teacherTips: ["Tip"],
        exampleImageUrl: "https://x.test/example-only.jpg",
        observationPrompts: ["Tries collage?"],
        indoorAlternatives: "Small table collage.",
        outdoorAlternatives: "Clipboards outdoors.",
      },
      [byItem["qa-optional"].id]: {
        imageRequirement: "optional",
        teacherTips: ["Tip"],
        // intentionally no images
        observationPrompts: ["Finds a pair?"],
        indoorAlternatives: "Carpet game.",
        outdoorAlternatives: "Picnic blanket game.",
      },
      [byItem["qa-not-needed"].id]: {
        imageRequirement: "not_needed",
        teacherTips: ["Tip"],
        observationPrompts: ["Sings along?"],
        indoorAlternatives: "Rug circle.",
        outdoorAlternatives: "Porch circle.",
      },
      [byItem["qa-default-song-movement"].id]: {
        teacherTips: ["Tip"],
        observationPrompts: ["Freezes on cue?"],
        indoorAlternatives: "Standing in place.",
        outdoorAlternatives: "Yard dance.",
      },
    },
  };

  const readyScores = enrich.computeReadinessScores(plan, [], mixedDraft, { resources });
  ok(readyScores.incompleteActivities === 0, "mixed requirements can all complete");
  ok(readyScores.imageBriefsOnly === 0, "no brief-only blockers when real required images exist");
  ok(readyScores.expectedSetupImages === 2, `expected setup slots = required + setup_only (got ${readyScores.expectedSetupImages})`);
  ok(readyScores.expectedExampleImages === 2, `expected example slots = required + example_only (got ${readyScores.expectedExampleImages})`);
  ok(readyScores.setupImages === 2, "only required setup slots counted as filled");
  ok(readyScores.exampleImages === 2, "only required example slots counted as filled");
  ok(readyScores.imageReadiness === 100, "image readiness 100 when required slots filled");

  const report = quality.buildQualityReport(plan, acts, mixedDraft, {
    resources,
    skipUpgradeSummary: false,
  });
  const imageBlockers = (report.findings || []).filter((f) => (
    f.blocking
    && (f.code === "missing_example_images" || f.code === "image_brief_not_image")
  ));
  ok(imageBlockers.length === 0, "optional/not_needed activities do not create image blockers");

  const incompleteBlockers = (report.findings || []).filter((f) => f.code === "activities_in_progress" && f.blocking);
  ok(incompleteBlockers.length === 0, "no activities_in_progress blocker when all requirements satisfied");

  // Briefs on optional/not_needed must not create image_brief_not_image blockers.
  const briefOnOptional = {
    ...mixedDraft,
    activities: {
      ...mixedDraft.activities,
      [byItem["qa-optional"].id]: {
        ...mixedDraft.activities[byItem["qa-optional"].id],
        imageBriefSetup: "Optional brief should not block",
        imageBriefExample: "Still not an image",
      },
      [byItem["qa-not-needed"].id]: {
        ...mixedDraft.activities[byItem["qa-not-needed"].id],
        imageBriefSetup: "Not needed brief should not block",
      },
    },
  };
  const briefReport = quality.buildQualityReport(plan, acts, briefOnOptional, {
    resources,
    skipUpgradeSummary: true,
  });
  const briefBlockers = (briefReport.findings || []).filter((f) => f.code === "image_brief_not_image" && f.blocking);
  ok(briefBlockers.length === 0, "briefs on optional/not_needed do not create image blockers");

  // Briefs on required slots still block.
  const briefOnRequired = {
    ...mixedDraft,
    activities: {
      ...mixedDraft.activities,
      [byItem["qa-req-both"].id]: {
        imageRequirement: "required",
        teacherTips: ["Tip"],
        imageBriefSetup: "Needs real photo",
        imageBriefExample: "Needs real photo",
        observationPrompts: ["Uses color words?"],
        indoorAlternatives: "Table work if floor is wet.",
        outdoorAlternatives: "Take trays to the patio.",
      },
    },
  };
  const requiredBriefReport = quality.buildQualityReport(plan, acts, briefOnRequired, {
    resources,
    skipUpgradeSummary: true,
  });
  ok(
    (requiredBriefReport.findings || []).some((f) => f.code === "image_brief_not_image" && f.blocking),
    "briefs on required slots still block publish",
  );
  ok(
    (requiredBriefReport.findings || []).some((f) => f.code === "missing_example_images" && f.blocking),
    "missing real required images still block publish",
  );

  // Labels for UI
  ok(enrich.imageRequirementLabel("required") === "Required: setup and example", "required label");
  ok(enrich.imageRequirementLabel("setup_only") === "Setup image only", "setup_only label");
  ok(enrich.imageRequirementLabel("example_only") === "Finished example only", "example_only label");
  ok(enrich.imageRequirementLabel("optional") === "Optional", "optional label");
  ok(enrich.imageRequirementLabel("not_needed") === "Not needed", "not_needed label");

  console.log(`OK teaching-kit-image-requirement (${passed} assertions)`);
}

main();
