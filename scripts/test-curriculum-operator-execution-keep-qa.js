#!/usr/bin/env node
/**
 * Curriculum Operator execution-keep QA:
 * KEEP good images, cover-only runnable, assets-only, printable-only,
 * single-activity targeting, NL retry, full natural command, prompts.
 */
"use strict";

const assert = require("node:assert/strict");
const { parseOperatorCommand } = require("./curriculum-operator-command.js");
const images = require("./curriculum-operator-images.js");
const promptBuilder = require("./visual-prompt-builder.js");
const connected = require("./curriculum-operator-connected-upgrade.js");
const assetRetry = require("./curriculum-operator-asset-retry.js");
const lessonRead = require("./curriculum-operator-lesson-read.js");

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const LESSON_ID = "cur-lp-qa-keep-demo";
const lessons = [
  {
    id: LESSON_ID,
    title: "Keep Demo Lesson",
    plan: "Free",
    status: "draft",
    age: "Preschool 3–5 Years",
    theme: "Keep Demo",
    activityIds: ["cur-act-good", "cur-act-bad", "cur-act-missing"],
    coverImageUrl: "/api/media/lesson-covers/lesson-cover-demo",
    coverQualityStatus: "good",
  },
  {
    id: "cur-lp-preschool-farm-animals",
    title: "Farm Animals",
    plan: "Free",
    status: "published",
    age: "Preschool 3–5 Years",
    activityIds: ["cur-act-farm-1", "cur-act-farm-2", "cur-act-farm-3"],
  },
  {
    id: "cur-lp-preschool-weather-watchers",
    title: "Weather Watchers",
    plan: "Free",
    status: "published",
    age: "Preschool 3–5 Years",
    activityIds: ["cur-act-w1", "cur-act-w2", "cur-act-w3", "cur-act-w4"],
  },
  {
    id: "cur-lp-infant-colors-all-around-us",
    title: "Colors All Around Us",
    plan: "Free",
    status: "published",
    age: "Infant 0–6 Months",
    activityIds: ["cur-act-c1"],
  },
];

const activities = [
  {
    id: "cur-act-good",
    title: "Good Activity Photo",
    lessonPlanId: LESSON_ID,
    setupImageUrl: "/api/media/enrichment-photos/tk-enrich-good-photo?variant=full",
    materials: "Tray\nPaint",
    setup: "Low table tray",
    steps: ["Paint", "Stamp"],
    safetyNotes: "Use large toddler-safe tools only; no small choking hazards.",
  },
  {
    id: "cur-act-bad",
    title: "Bad Cartoon Activity",
    lessonPlanId: LESSON_ID,
    setupImageUrl: "https://example.com/cartoon-clipart-theme-art.png",
    materials: "Paper",
    setup: "Table",
  },
  {
    id: "cur-act-missing",
    title: "Missing Photo Activity",
    lessonPlanId: LESSON_ID,
    materials: "Bins",
    setup: "Sensory table",
  },
  { id: "cur-act-farm-1", title: "Farm Animal Discovery Basket", lessonPlanId: "cur-lp-preschool-farm-animals" },
  { id: "cur-act-farm-2", title: "Muddy Animals Wash Laboratory", lessonPlanId: "cur-lp-preschool-farm-animals" },
  { id: "cur-act-farm-3", title: "Build an Animal Shelter STEM Challenge", lessonPlanId: "cur-lp-preschool-farm-animals" },
  { id: "cur-act-w1", title: "Weather Watchers Circle", lessonPlanId: "cur-lp-preschool-weather-watchers" },
  { id: "cur-act-w2", title: "Sunshine Movement Game", lessonPlanId: "cur-lp-preschool-weather-watchers" },
  { id: "cur-act-w3", title: "Rain Cloud in a Jar", lessonPlanId: "cur-lp-preschool-weather-watchers" },
  { id: "cur-act-w4", title: "Windy Day Pinwheel Lab", lessonPlanId: "cur-lp-preschool-weather-watchers" },
  { id: "cur-act-c1", title: "Rainbow Scarf Tracking", lessonPlanId: "cur-lp-infant-colors-all-around-us" },
];

function parse(cmd, extra = {}) {
  return parseOperatorCommand(cmd, {
    phase: 7,
    lessonPlans: lessons,
    activities,
    currentlySelectedLessonId: LESSON_ID,
    ...extra,
  });
}

function actions(parsed) {
  return parsed.command?.actions || {};
}

console.log("\nBug 1 — KEEP good images survives image repair");
{
  const good = images.refineImageDecision(
    { activityId: "cur-act-good", activityTitle: "Good Activity Photo", image: { decision: "KEEP_EXISTING", existingUrl: activities[0].setupImageUrl } },
    activities[0],
    {},
    { replaceBadImages: true, auditExistingImages: true, keepGoodImages: true },
  );
  const bad = images.refineImageDecision(
    { activityId: "cur-act-bad", activityTitle: "Bad Cartoon Activity", image: { decision: "KEEP_EXISTING", existingUrl: activities[1].setupImageUrl } },
    activities[1],
    {},
    { replaceBadImages: true, keepGoodImages: true },
  );
  const missing = images.refineImageDecision(
    { activityId: "cur-act-missing", activityTitle: "Missing Photo Activity", image: { decision: "GENERATE", existingUrl: "" } },
    activities[2],
    {},
    { replaceBadImages: true, keepGoodImages: true },
  );
  ok(good.decision === "KEEP", "GOOD IMAGE → KEEP");
  ok(bad.decision === "REPLACE", "BAD IMAGE → REPLACE");
  ok(missing.decision === "GENERATE", "MISSING IMAGE → GENERATE");
  const p = parse("Go through Farm Animals and check every activity picture. Keep the good ones and replace anything that doesn't actually show the activity. Don't change the lesson plan or cover.");
  const a = actions(p);
  ok(p.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "Test1 primary ACTIVITY_IMAGE_REPAIR");
  ok(a.keepGoodImages === true, "Test1 keepGoodImages true");
  ok(a.replaceBadImages === true, "Test1 replaceBadImages true");
  ok(a.touchCover === false, "Test1 cover off");
  ok(a.upgradeActivities === false, "Test1 text upgrade off");
  ok(a.publish === false, "Test1 no publish");
  const planned = images.buildImageActionsFromAudit(
    { id: LESSON_ID, enrichmentDraft: {} },
    activities.filter((row) => row.lessonPlanId === LESSON_ID),
    {
      assetPlan: [
        { activityId: "cur-act-good", activityTitle: "Good Activity Photo", image: { decision: "KEEP_EXISTING", existingUrl: activities[0].setupImageUrl } },
        { activityId: "cur-act-bad", activityTitle: "Bad Cartoon Activity", image: { decision: "KEEP_EXISTING", existingUrl: activities[1].setupImageUrl } },
        { activityId: "cur-act-missing", activityTitle: "Missing Photo Activity", image: { decision: "GENERATE", existingUrl: "" } },
      ],
    },
    {
      replaceBadImages: true,
      keepGoodImages: true,
      command: p.command,
    },
  );
  ok(planned.find((row) => row.activityId === "cur-act-good")?.decision === "KEEP", "planning KEEP survives for good image");
  ok(planned.find((row) => row.activityId === "cur-act-bad")?.decision === "REPLACE", "planning REPLACE for bad image");
  ok(planned.find((row) => row.activityId === "cur-act-missing")?.decision === "GENERATE", "planning GENERATE for missing");
}

console.log("\nBug 2 — cover-only exclusion language");
{
  const variants = [
    "Change only the Farm Animals cover photo. I want it realistic and to match the lesson. Leave every activity picture alone.",
    "Change only the cover photo. Leave the activity pictures alone.",
    "Fix the cover image but don't touch any activity images.",
    "Replace the cover picture only.",
    "New cover photo. Nothing else.",
  ];
  for (const cmd of variants) {
    const p = parse(cmd);
    const a = actions(p);
    ok(p.interpretation?.primary === "COVER_WORK", `COVER_WORK: ${cmd.slice(0, 48)}`);
    ok(a.touchCover === true, `touchCover: ${cmd.slice(0, 40)}`);
    ok(a.generateImages === false && a.replaceBadImages === false, `no activity images: ${cmd.slice(0, 40)}`);
    ok(a.generatePrintables === false && a.generateSongsBooks === false, `no print/songs: ${cmd.slice(0, 40)}`);
    ok(a.upgradeActivities === false && a.publish === false, `no text/publish: ${cmd.slice(0, 40)}`);
  }
}

console.log("\nBug 3 — COVER_WORK is independently runnable");
{
  const p = parse("Change only the Farm Animals cover photo. Leave every activity picture alone.");
  const a = actions(p);
  ok(a.touchCover === true && a.connectedUpgrade === false, "cover without connectedUpgrade");
  const intent = lessonRead.resolveCoverIntent(p.command);
  ok(intent === "EXPLICIT_REPLACE", "cover intent EXPLICIT_REPLACE");
  const coverPlan = connected.buildCoverPlan(lessons[1], { activities }, { command: p.command, forceReplace: true });
  ok(coverPlan.decision === "GENERATE", "cover plan GENERATE for cover-only");
  ok(a.composeReviewDraft === true, "cover-only composes review draft");
}

console.log("\nBug 4 — assets-only multi-scope");
{
  const p = parse("Check the cover photo, activity pictures, and printables in Farm Animals, but don't change the lesson wording.");
  const a = actions(p);
  ok(p.interpretation?.primary === "ASSETS_ONLY_WORK", "assets-only primary");
  ok(a.touchCover === true && a.generateImages === true && a.generatePrintables === true, "cover+images+printables");
  ok(a.upgradeActivities === false && a.generateSongsBooks === false, "no text/songs/books");
  ok(a.publish === false, "assets-only no publish");
}

console.log("\nBug 5 — printable-only with pictures-look-good protection");
{
  const p = parse("The pictures look good. Just fix the printable in this lesson.");
  const a = actions(p);
  ok(p.interpretation?.primary === "PRINTABLE_WORK", "printable-only primary");
  ok(a.generatePrintables === true, "printables on");
  ok(a.generateImages === false && a.replaceBadImages === false && a.touchCover === false, "images/cover off");
  ok(a.generateSongsBooks === false && a.upgradeActivities === false && a.publish === false, "songs/text/publish off");
}

console.log("\nCapability 6 — single activity image targeting");
{
  const p = parse("Fix only the third activity picture in Weather Watchers. Leave all the other pictures alone.");
  const a = actions(p);
  ok(p.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "single-activity routes image repair");
  ok(String(p.command.scope.targetActivityIds) === "cur-act-w3", "third activity → w3");
  ok(a.touchCover === false && a.generatePrintables === false && a.publish === false, "narrow scope protections");
  const planned = images.buildImageActionsFromAudit(
    { id: "cur-lp-preschool-weather-watchers", enrichmentDraft: {} },
    activities.filter((row) => row.lessonPlanId === "cur-lp-preschool-weather-watchers"),
    {
      assetPlan: [
        { activityId: "cur-act-w1", activityTitle: "Weather Watchers Circle", image: { decision: "KEEP_EXISTING", existingUrl: "/api/media/enrichment-photos/ok1" } },
        { activityId: "cur-act-w2", activityTitle: "Sunshine Movement Game", image: { decision: "KEEP_EXISTING", existingUrl: "/api/media/enrichment-photos/ok2" } },
        { activityId: "cur-act-w3", activityTitle: "Rain Cloud in a Jar", image: { decision: "KEEP_EXISTING", existingUrl: "https://example.com/cartoon-clipart.png" } },
        { activityId: "cur-act-w4", activityTitle: "Windy Day Pinwheel Lab", image: { decision: "KEEP_EXISTING", existingUrl: "/api/media/enrichment-photos/ok4" } },
      ],
    },
    { replaceBadImages: true, keepGoodImages: true, targetActivityIds: ["cur-act-w3"], command: p.command },
  );
  ok(planned.find((row) => row.activityId === "cur-act-w3")?.decision === "REPLACE", "target activity eligible");
  ok(planned.filter((row) => row.activityId !== "cur-act-w3").every((row) => row.decision === "PROTECTED_KEEP"), "other activities protected");
  const titled = parse("Fix the picture for Rain Cloud in a Jar only.", {
    currentlySelectedLessonId: "cur-lp-preschool-weather-watchers",
  });
  ok(String(titled.command.scope.targetActivityIds) === "cur-act-w3", "title target Rain Cloud in a Jar");
}

console.log("\nCapability 7/8 — NL failed-asset retry + cover retry listing");
{
  const clarify = parse("Retry the failed picture only. Don't redo the ones that already finished.");
  ok(clarify.interpretation?.primary === "RETRY_FAILED_ASSETS", "retry primary without context");
  ok(clarify.confirmReasons.includes("retry_asset_clarification_required"), "asks clarification without failed context");
  ok(actions(clarify).generateImages === false, "no blanket regenerate without context");
  const withContext = parse("Retry the failed picture only. Don't redo the ones that already finished.", {
    operatorContext: {
      previousResolvedTargets: [LESSON_ID],
      sourceJobId: "job-demo",
      failedAssets: [{ type: "image", idempotencyKey: "image:demo:cur-act-bad:setupImageUrl", activityTitle: "Bad Cartoon Activity" }],
    },
  });
  ok(actions(withContext).selectedFailedAssetIds?.[0] === "image:demo:cur-act-bad:setupImageUrl", "selects unique failed image");
  ok(actions(withContext).generateImages === true && actions(withContext).generatePrintables === false, "retry image only");
  const coverRetry = parse("Retry the failed cover only.", {
    operatorContext: {
      previousResolvedTargets: [LESSON_ID],
      sourceJobId: "job-demo",
      failedAssets: [{ type: "cover", idempotencyKey: `cover:${LESSON_ID}:generate` }],
    },
  });
  ok(actions(coverRetry).touchCover === true && actions(coverRetry).generateImages === false, "cover retry only");
  const listed = assetRetry.failedAssets({
    lessonResults: [{
      lessonId: LESSON_ID,
      imageActions: [],
      printableActions: [],
      coverAction: { status: "failed", retryable: true, idempotencyKey: `cover:${LESSON_ID}:generate` },
    }],
  }, LESSON_ID);
  ok(listed.some((row) => row.type === "cover"), "failed cover appears in retry list");
}

console.log("\nPrompt quality — safetyNotes + theme cover");
{
  const activityPrompt = promptBuilder.buildVisualPrompt({
    assetMode: promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    ageBand: "Preschool 3–5 Years",
    activityTitle: "Pig Mud Sensory Tray",
    materials: "Tray\nToy pigs\nSafe mud sensory material",
    setup: "Low table with tray",
    steps: ["Explore mud", "Wash hands"],
    safetyNotes: "Use only age-appropriate large manipulatives; no small choking hazards.",
    lessonTheme: "Farm Animals",
  });
  ok(/Pig Mud Sensory Tray/.test(activityPrompt.generationPrompt), "activity prompt includes exact activity");
  ok(/no small choking hazards/i.test(activityPrompt.generationPrompt), "safetyNotes reach activity prompt");
  ok(/Documentary-style realistic/i.test(activityPrompt.generationPrompt), "realistic documentary style");
  const coverPrompt = promptBuilder.buildVisualPrompt({
    assetMode: promptBuilder.ASSET_MODES.REALISTIC_LESSON_COVER,
    lessonTitle: "Farm Animals",
    lessonTheme: "Farm Animals",
    ageBand: "Preschool 3–5 Years",
  });
  ok(/whole lesson theme/i.test(coverPrompt.generationPrompt), "cover prioritizes whole theme");
  ok(/Do NOT recreate one specific activity/i.test(coverPrompt.generationPrompt), "cover avoids single-activity bias");
}

console.log("\nTest 10 — full natural keep-good workflow");
{
  const cmd = "Go through this lesson, keep everything that's good, fix what looks bad, make the pictures actually look like the activities, and leave it ready for me to review.";
  const p = parse(cmd);
  const a = actions(p);
  ok(p.interpretation?.primary === "CONSERVATIVE_FULL_AUDIT", "full natural command → conservative full audit");
  ok(a.generateSongsBooks !== true && a.touchBooks !== true, "full natural no songs/books churn");
  ok(a.keepGoodImages === true, "full natural keepGoodImages");
  ok(a.replaceBadImages === true, "full natural replaceBadImages");
  ok(a.forceReplaceAllImages !== true, "full natural does not forceReplaceAllImages");
  ok(a.publish === false, "full natural no publish");
  ok(a.composeReviewDraft === true, "full natural review draft");
  ok(String(p.command.scope.lessonIds[0] || "") === LESSON_ID, "same existing lesson id");
  const planned = images.buildImageActionsFromAudit(
    { id: LESSON_ID, enrichmentDraft: {} },
    activities.filter((row) => row.lessonPlanId === LESSON_ID),
    {
      assetPlan: [
        { activityId: "cur-act-good", activityTitle: "Good Activity Photo", image: { decision: "KEEP_EXISTING", existingUrl: activities[0].setupImageUrl } },
        { activityId: "cur-act-bad", activityTitle: "Bad Cartoon Activity", image: { decision: "KEEP_EXISTING", existingUrl: activities[1].setupImageUrl } },
        { activityId: "cur-act-missing", activityTitle: "Missing Photo Activity", image: { decision: "GENERATE", existingUrl: "" } },
      ],
    },
    { replaceBadImages: true, keepGoodImages: true, command: p.command },
  );
  ok(planned.find((row) => row.activityId === "cur-act-good")?.decision === "KEEP", "full natural GOOD → KEEP_EXISTING");
  ok(planned.find((row) => row.activityId === "cur-act-bad")?.decision === "REPLACE", "full natural BAD → REPLACE");
  ok(planned.find((row) => row.activityId === "cur-act-missing")?.decision === "GENERATE", "full natural MISSING → GENERATE");
}

console.log("\nMatrix remainder");
{
  const weather = parse("Go through Weather Watchers and make sure the pictures really show each activity, not just weather pictures. Keep the ones that already work.");
  ok(weather.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "Test3 weather image repair");
  ok(actions(weather).keepGoodImages === true, "Test3 keep good");
  ok(actions(weather).touchCover === false, "Test3 cover off");
  const colors = parse("Check Colors All Around Us completely. Don't redo things just because you can. Keep what's already good and only fix what's actually weak, missing, broken, or doesn't match.");
  ok(colors.interpretation?.primary === "CONSERVATIVE_FULL_AUDIT", "Test4 careful full audit");
  ok(actions(colors).keepGoodImages === true, "Test4 keep good");
  ok(actions(colors).publish === false, "Test4 no publish");
}

console.log(`\nExecution-keep QA passed ${passed} assertions.`);
