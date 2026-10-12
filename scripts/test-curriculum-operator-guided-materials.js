#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const commandApi = require("./curriculum-operator-command.js");
const guided = require("./curriculum-operator-guided-materials.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const printablesApi = require("./curriculum-operator-printables.js");
const jobStatus = require("./curriculum-operator-job-status-presenter.js");

const HALLOWEEN = "Make a preschool Halloween lesson. Use these four activities: pumpkin color sorting, leaf-and-pumpkin stamping, spider web fine-motor play, and a Halloween story walk. Use the book Room on the Broom. Make a realistic cover photo with preschool children doing Halloween activities. Make a printable with pumpkin color cards and spider web counting cards.";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

console.log("Guided materials — conversational brief");
const briefResult = createApi.parseCreationBrief(HALLOWEEN);
ok(briefResult.ok, "Halloween brief parses");
ok(briefResult.brief.requestedActivities.length === 4, "four supplied activities extracted");
ok(briefResult.brief.requestedActivities.some((a) => /pumpkin color sorting/i.test(a)), "activity title preserved");
ok(briefResult.brief.activityTarget === 4, "activity target matches supplied count");
ok(briefResult.brief.suppliedBooks.some((b) => /Room on the Broom/i.test(b.title)), "supplied book captured");
ok(briefResult.brief.explicitPrintables.length >= 1, "printable request captured");
ok(briefResult.brief.ownerMaterials?.activities?.length === 4, "owner materials activities stored");
ok(briefResult.guidedUnderstanding?.text.includes("Here is what I understood"), "plain-language summary");
ok(briefResult.guidedUnderstanding?.sections?.books?.length >= 1, "summary lists books");

console.log("Owner confirmation before mutation");
const parsed = commandApi.parseOperatorCommand(HALLOWEEN, { phase: 7, lessonPlans: [] });
ok(parsed.command.intent === "create_lesson", "create lesson intent");
ok(parsed.confirmReasons.includes(guided.GUIDED_CONFIRM_REASON), "guided confirmation required before run");
ok(parsed.needsConfirmation === true, "needsConfirmation set");
const confirmed = commandApi.parseOperatorCommand(HALLOWEEN, { phase: 7, lessonPlans: [], confirmGuidedMaterials: true });
ok(!confirmed.confirmReasons.includes(guided.GUIDED_CONFIRM_REASON), "confirm clears guided gate");

console.log("Reference image instructions");
const refCmd = "Use this picture as a reference. Re-create the scene as a realistic childcare activity photo, but do not add text, logos, strange objects, or unrelated materials.";
const refBrief = createApi.parseCreationBrief(refCmd, {
  attachments: [{ id: "att-1", fileName: "owner-ref.jpg", purpose: "reference", instructions: "Match layout and colors only" }],
});
ok(refBrief.brief.ownerMaterials.referenceImages.length === 1, "uploaded reference preserved");
ok(/reference|re-create/i.test(refBrief.brief.ownerMaterials.images[0]?.instructions || ""), "reference image instructions");

console.log("Printable specification + one pack scope");
const printCmd = "Make a printable like this example. Use the same learning purpose and layout structure, but create original child-safe artwork and text. Make it letter-size and tell me how many pages it has.";
const printBrief = createApi.parseCreationBrief(printCmd);
ok(printBrief.brief.ownerMaterials.printables.length >= 1, "printable spec preserved");
ok(printBrief.brief.ownerMaterials.printables[0].letterSize === true, "letter-size requested");

console.log("Owner review — optional song/book failure");
ok(
  orchestrator.classifyFullKitOwnerReview({
    kitScope: { songs: true, books: true, printables: true, images: true },
    textOk: true,
    textRan: true,
    songsBooksOk: false,
    songsBooksRan: true,
    printablesOk: true,
    printablesRan: true,
    imagesOk: true,
    imagesRan: true,
    finalVerificationOk: true,
    partialErrors: ["songs_books failed"],
  }) === "PARTIAL",
  "optional song/book failure does not yield READY_FOR_OWNER_REVIEW",
);
ok(
  orchestrator.classifyFullKitOwnerReview({
    kitScope: { printables: true },
    textOk: true,
    textRan: true,
    printablesOk: true,
    printablesRan: true,
    finalVerificationOk: true,
  }) === "READY_FOR_OWNER_REVIEW",
  "READY when required phases succeed",
);

console.log("Printable terminal failure fails closed");
ok(
  printablesApi.isPrintableActionTerminalFailure("blocked"),
  "blocked is terminal failure",
);
ok(
  printablesApi.hasRequiredPrintableActionFailure([{
    status: "blocked",
    spec: { ownerExplicitPrintable: true },
    decision: "CREATE",
  }]),
  "required printable blocked detected",
);

console.log("Guided progress labels");
const fakeJob = {
  status: "running",
  lessonResults: [{
    creationBrief: { guidedWorkflow: true },
    ownerReviewStatus: "PARTIAL",
    actions: [{ type: "printable.generatePages", status: "running" }],
  }],
};
ok(/printable/i.test(jobStatus.currentStepLabel(fakeJob)), "simple status shows printable step");

console.log(`\nGuided materials passed ${passed} assertions`);
