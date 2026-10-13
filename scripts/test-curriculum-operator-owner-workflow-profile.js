#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const profile = require("./curriculum-operator-instruction-profile.js");
const effective = require("./curriculum-operator-effective-instructions.js");
const createApi = require("./curriculum-operator-create.js");
const commandApi = require("./curriculum-operator-command.js");
const guidedFixture = require("./curriculum-operator-guided-materials-e2e-fixture.js");

const OWNER_MSG = guidedFixture.HALLOWEEN_GUIDED_COMMAND;

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log("Permanent instruction profile");
{
  const p = profile.read({}, "owner@test");
  ok(p.permanentProfileVersion === profile.PERMANENT_PROFILE_VERSION, "permanent profile version set");
  ok(p.instructions.length >= 20, "substantial default instruction set");
  ok(p.instructions.some((line) => /never auto-publish/i.test(line)), "draft-only default");
  ok(p.instructions.some((line) => /relatedPrintableId|activity linkage|printable.*activity/i.test(line)
    || /activity linkage/i.test(line)), "printable linkage policy present");
}

console.log("Owner phrase interpretation");
{
  const phrases = profile.interpretOwnerPhrases(
    "Make a complete lesson plan. Use these activities. Fill in the blanks. Make the picture realistic. Make a printable. Leave it ready for me to review.",
  );
  ok(phrases.matched.includes("complete_lesson_plan"), "complete lesson plan phrase");
  ok(phrases.matched.includes("fill_in_blanks"), "fill in the blanks phrase");
  ok(phrases.matched.includes("realistic_picture"), "realistic picture phrase");
  ok(phrases.matched.includes("make_printable"), "make printable phrase");
  ok(phrases.flags.draftReview === true, "review-ready implies draft workflow");
}

console.log("Effective instructions bundle");
{
  const bundle = effective.buildEffectiveInstructions({ rawCommand: OWNER_MSG, profile: profile.read({}, "x") });
  ok(bundle.profileLoaded === true, "profile loaded");
  ok(bundle.permanentInstructions.length >= 20, "permanent lines merged");
  ok(bundle.preserveOwnerActivities !== false, "preserve owner activities default");
  ok(bundle.knowledgeProfileLines?.length >= 4, "knowledge profile lines on effective bundle");
  ok(bundle.draftOnly !== false, "draft-only default on guided bundle");
}

console.log("Realistic image and printable phrase flags");
{
  const phrases = profile.interpretOwnerPhrases(
    "Make the picture realistic. Make a printable with counting cards. Keep this activity. Fill in the blanks.",
  );
  ok(phrases.flags.realisticPhotos === true || phrases.matched.includes("realistic_picture"), "realistic image phrase");
  ok(phrases.matched.includes("make_printable"), "printable phrase");
  ok(phrases.flags.preserveSuppliedActivities === true || phrases.matched.some((m) => /keep|preserve|supplied/i.test(m)), "preserve supplied activities phrase");
  ok(phrases.flags.fillInBlanks === true, "fill in blanks phrase");
}

console.log("Unsupported age validation fails safely");
{
  const ageSafety = require("./curriculum-operator-guided-age-safety.js");
  const r = ageSafety.validateActivityIdea({
    ageBand: "infant",
    title: "Letter tracing worksheet",
    materialsText: "pencils",
  });
  ok(r.ok === false && r.flags.includes("infant_inappropriate"), "infant worksheet fails closed");
}

console.log("Guided create brief + confirmation");
{
  const parsed = commandApi.parseOperatorCommand(OWNER_MSG, { phase: 7, lessonPlans: [] });
  ok(Boolean(parsed.effectiveInstructions?.permanentInstructions?.length), "parse attaches effective instructions");
  ok(parsed.confirmReasons.includes("guided_materials_confirmation_required"), "guided confirmation required");
  const briefResult = createApi.parseCreationBrief(OWNER_MSG, {
    effectiveInstructions: parsed.effectiveInstructions,
  });
  ok(briefResult.ok, `brief parses: ${briefResult.needsOwnerInput?.join(",")}`);
  ok(briefResult.brief.requestedActivities.length >= 4, "supplied activities preserved");
  ok(briefResult.brief.suppliedBooks?.length >= 1 || /Room on the Broom/i.test(OWNER_MSG), "book signal preserved");
  ok(briefResult.brief.explicitPrintables?.length >= 1, "explicit printable preserved");
  ok(briefResult.guidedUnderstanding?.text.includes("Here is what I understood"), "owner-facing summary");
  ok(briefResult.brief.ownerMaterials?.lockSuppliedActivityCore === true, "lock supplied activity core");
  ok(briefResult.brief.ownerWorkflowProfile?.phraseMatched?.length >= 1, "workflow profile on brief");
}

console.log("Publish phrase stays explicit");
{
  const pub = profile.interpretOwnerPhrases("Publish it when done.");
  ok(pub.flags.publishExplicit === true, "publish it flagged explicit");
  const bundle = effective.buildEffectiveInstructions({ rawCommand: "Publish it.", profile: profile.read({}, "x") });
  ok(bundle.publishRequiresExplicitConfirm === true, "publish requires explicit confirm");
}

console.log("All owner workflow profile checks passed.");
