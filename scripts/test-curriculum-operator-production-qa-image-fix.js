#!/usr/bin/env node
/**
 * Reproduces production Operator QA failure:
 * GOOD → KEEP, WRONG-BUT-PRETTY → REPLACE, DRAFT-CLEARED → GENERATE.
 */
"use strict";

const assert = require("node:assert/strict");
const auditApi = require("./curriculum-operator-audit.js");
const images = require("./curriculum-operator-images.js");
const enrichment = require("./teaching-kit-enrichment.js");
const imageMatch = require("./curriculum-operator-existing-image-match.js");
const { parseOperatorCommand } = require("./curriculum-operator-command.js");

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const LESSON_ID = "cur-lp-prod-qa-fixture";
const ACT_GOOD = "cur-act-qa-color-mix";
const ACT_BAD = "cur-act-qa-animal-sort";
const ACT_DRAFT_MISSING = "cur-act-qa-texture";

const activities = [
  {
    id: ACT_GOOD,
    title: "Color Mixing Tray",
    lessonPlanId: LESSON_ID,
    setupImageUrl:
      "/api/media/enrichment-photos/tk-enrich-7fb9e73c1f07b7837458d02ff2bba506?variant=full",
    materials: "Paint trays\nPrimary colors",
    setup: "Low table with paint trays for mixing",
    steps: ["Squeeze paint", "Mix colors"],
  },
  {
    id: ACT_BAD,
    title: "Soft Animal Sorting",
    lessonPlanId: LESSON_ID,
    setupImageUrl:
      "/api/media/enrichment-photos/tk-enrich-9e63542c80aaea9aa6ac48bb3f517c12?variant=full",
    materials: "Soft stuffed animals\nSorting bins",
    setup: "Bins labeled by animal type",
    steps: ["Sort animals into bins"],
  },
  {
    id: ACT_DRAFT_MISSING,
    title: "Texture Touch Exploration",
    lessonPlanId: LESSON_ID,
    setupImageUrl: "/api/media/enrichment-photos/tk-enrich-texture-base-live?variant=full",
    materials: "Fabric squares\nTexture board",
    setup: "Texture board at child height",
    steps: ["Touch and describe textures"],
  },
];

const plan = {
  id: LESSON_ID,
  title: "Operator QA Fixture",
  plan: "Free",
  status: "draft",
  age: "Toddler 1–2 Years",
  activityIds: [ACT_GOOD, ACT_BAD, ACT_DRAFT_MISSING],
  enrichmentDraft: {
    activities: {
      [ACT_DRAFT_MISSING]: {
        setupImageUrl: null,
      },
    },
  },
};

console.log("\nSemantic match adversarial cases");
{
  const mirror = imageMatch.assessActivityImageSemanticMatch(
    { title: "Soft Animal Sorting", materials: "stuffed animals\nsorting bins", setup: "sort into bins" },
    {},
    "/api/media/mirror-toddlers",
  );
  ok(mirror.matches === false, "animal sorting + mirror → mismatch");

  const appleBasket = imageMatch.assessActivityImageSemanticMatch(
    { title: "Apple Stamping", materials: "apples\nstamp pads", setup: "stamp apples" },
    {},
    "/api/media/beautiful-apples-basket",
  );
  ok(appleBasket.matches === false, "apple stamping + basket only → mismatch");

  const storm = imageMatch.assessActivityImageSemanticMatch(
    { title: "Rain Cloud in a Jar", materials: "jar\nwater\nshaving cream", setup: "cloud in jar" },
    {},
    "/api/media/professional-storm-clouds",
  );
  ok(storm.matches === false, "rain cloud jar + storm sky → mismatch");

  const farm = imageMatch.assessActivityImageSemanticMatch(
    { title: "Farm Animal Wash", materials: "toy animals\nsoap water", setup: "wash animals" },
    {},
    "/api/media/beautiful-farm-landscape",
  );
  ok(farm.matches === false, "farm animal wash + landscape → mismatch");

  const goodPaint = imageMatch.assessActivityImageSemanticMatch(
    { title: "Color Mixing Tray", materials: "paint trays", setup: "mix paint" },
    {},
    "/api/media/paint-tray-mixing-colors",
  );
  ok(goodPaint.matches === true, "color mixing + paint tray → match");

  const hashedMirrorWrong = imageMatch.assessActivityImageSemanticMatch(
    { title: "Soft Animal Sorting", materials: "stuffed animals\nsorting bins", setup: "sort into bins" },
    {},
    "/api/media/enrichment-photos/tk-enrich-9e63542c80aaea9aa6ac48bb3f517c12?variant=full",
  );
  ok(hashedMirrorWrong.matches === false, "animal sorting + opaque tk-enrich mirror asset → mismatch");

  const hashedPaintKeep = imageMatch.assessActivityImageSemanticMatch(
    { title: "Color Mixing Tray", materials: "paint trays", setup: "mix paint" },
    {},
    "/api/media/enrichment-photos/tk-enrich-7fb9e73c1f07b7837458d02ff2bba506?variant=full",
  );
  ok(hashedPaintKeep.matches === true, "color mixing + opaque tk-enrich paint asset → keep");

  const registryMirror = imageMatch.assessActivityImageSemanticMatch(
    { title: "Soft Animal Sorting", materials: "stuffed animals\nsorting bins", setup: "sort into bins" },
    {},
    "/api/media/enrichment-photos/tk-enrich-deadbeefdeadbeefdeadbeefdeadbeef?variant=full",
    {
      enrichmentMediaRegistry: {
        "tk-enrich-deadbeefdeadbeefdeadbeefdeadbeef": {
          fileName: "mirror-me.png",
          lessonPlanId: LESSON_ID,
          activityKey: "other-activity",
        },
      },
    },
  );
  ok(registryMirror.matches === false, "registry fileName mirror-me → mismatch for animal sorting");

  const registryRelevant = imageMatch.assessActivityImageSemanticMatch(
    { title: "Soft Animal Sorting", materials: "stuffed animals\nsorting bins", setup: "sort into bins" },
    {},
    "/api/media/enrichment-photos/tk-enrich-cafebabecafebabecafebabecafebabe?variant=full",
    {
      enrichmentMediaRegistry: {
        "tk-enrich-cafebabecafebabecafebabecafebabe": {
          fileName: "soft-animal-sorting-bins.png",
        },
      },
    },
  );
  ok(registryRelevant.matches === true, "registry fileName animal+sort hints → keep");
}

console.log("\nDraft-owned image URL precedence");
{
  const view = enrichment.activityEnrichmentView(activities[2], { setupImageUrl: null });
  ok(view.setupImageUrl === "", "explicit null draft clears effective image");
  const viewMissing = enrichment.activityEnrichmentView(activities[2], {});
  ok(viewMissing.setupImageUrl.includes("texture-base-live"), "absent draft patch inherits live image");
}

console.log("\nProduction QA fixture — audit image decisions");
{
  const audit = auditApi.auditLesson(plan, { activities, resources: [] }, {
    command: { actions: { conservativeFullAudit: true } },
    conservativeOptionalEnrichment: true,
  });
  const byId = new Map(audit.assetPlan.map((row) => [row.activityId, row.image]));
  ok(byId.get(ACT_GOOD)?.decision === "KEEP_EXISTING", "Act1 Color Mixing → KEEP_EXISTING");
  ok(byId.get(ACT_BAD)?.decision === "REPLACE", "Act2 mirror on Animal Sorting → REPLACE");
  ok(byId.get(ACT_DRAFT_MISSING)?.decision === "GENERATE", "Act3 draft-cleared → GENERATE");
  ok(audit.books?.decision === "KEEP", "conservative audit keeps empty books");
}

console.log("\nImage execution planning");
{
  const audit = auditApi.auditLesson(plan, { activities, resources: [] });
  const cmd = "Go through this lesson, keep everything that's good, fix what looks bad, make the pictures actually look like the activities, and leave it ready for me to review.";
  const parsed = parseOperatorCommand(cmd, {
    phase: 7,
    lessonPlans: [plan],
    activities,
    currentlySelectedLessonId: LESSON_ID,
  });
  ok(parsed.interpretation?.primary === "CONSERVATIVE_FULL_AUDIT", "natural command → conservative audit");
  ok(parsed.command.actions.generateSongsBooks !== true, "natural command skips songs/books");
  ok(parsed.command.actions.publish !== true, "natural command publish false");
  ok(String(parsed.command.scope.lessonIds[0] || "") === LESSON_ID, "same lesson id");

  const planned = images.buildImageActionsFromAudit(
    plan,
    activities,
    audit,
    {
      replaceBadImages: true,
      keepGoodImages: true,
      auditExistingImages: true,
      command: parsed.command,
    },
  );
  const map = new Map(planned.map((row) => [row.activityId, row.decision]));
  ok(map.get(ACT_GOOD) === "KEEP", "planned Act1 KEEP");
  ok(map.get(ACT_BAD) === "REPLACE", "planned Act2 REPLACE");
  ok(map.get(ACT_DRAFT_MISSING) === "GENERATE", "planned Act3 GENERATE");
}

console.log(`\nProduction QA image-fix tests passed ${passed} assertions.`);
