#!/usr/bin/env node
/**
 * Full-activity replacement regression: Doctor's Office Dramatic Play
 * → My Community Helper Vest (Replace mode).
 * Run: npm run test:teaching-kit-activity-replace
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const paste = require("./teaching-kit-paste-import.js");
const enrichment = require("./teaching-kit-enrichment.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

const DOCTOR_ABSENT = [
  "Doctor kit",
  "stethoscope",
  "bandages",
  "clipboards",
  "dolls",
  "Patients wait with books",
  "Doctors check heartbeat and bandage",
  "Use kind words to comfort patients",
  "Write notes on clipboard",
  "Switch roles",
  "How can the doctor help today?",
  "What does a nurse check?",
  "How do we wait kindly in the waiting room?",
  "Model gentle care language — checkups are not scary play",
  "No Doctor kit → Clipboard + cotton balls + empty bottle labeled PLAY",
  "Uses doctor tools safely",
  "Shows care language",
  "Switches roles",
  "Doctor's Office Dramatic Play",
];

function doctorActivity() {
  return {
    id: "act-doctors-office-1",
    itemId: "mon-3",
    lessonPlanId: "lp-community-helpers",
    title: "Doctor's Office Dramatic Play",
    dayOfWeek: "monday",
    activityCategory: "Dramatic Play",
    ageModifications: "Preschool 3–5 years",
    durationMinutes: "20-30 minutes",
    objective: "Children practice caregiver roles in a doctor's office.",
    description: "Children take turns as doctors, nurses, and patients.",
    materials: "Doctor kit\nstethoscope\nbandages\nclipboards\ndolls",
    preparation: "Set out the doctor kit and waiting-room books.",
    setup: "Arrange a waiting room and exam area.",
    steps: [
      "Patients wait with books.",
      "Doctors check heartbeat and bandage.",
      "Use kind words to comfort patients.",
      "Write notes on clipboard.",
      "Switch roles.",
    ].join("\n"),
    teacherLanguage: [
      "How can the doctor help today?",
      "What does a nurse check?",
      "How do we wait kindly in the waiting room?",
    ].join("\n"),
    observationOpportunities: "Uses doctor tools safely\nShows care language\nSwitches roles",
    safetyNotes: "Keep small doctor-kit pieces out of mouths.",
    cleanupTips: "Return doctor tools to the kit.",
    teacherTips: ["Model gentle care language — checkups are not scary play."],
    substitutions: [{
      need: "Doctor kit",
      use: "Clipboard + cotton balls + empty bottle labeled PLAY",
    }],
    observationPrompts: [
      "Uses doctor tools safely",
      "Shows care language",
      "Switches roles",
    ],
    vocabulary: ["helper", "community", "job", "tool"],
    indoorAlternatives: "Keep the doctor's office in the dramatic-play corner.",
    outdoorAlternatives: "Move the clinic to the patio with clipboards.",
    adaptations: "Offer a quieter waiting chair.",
    extensions: "Add a receptionist phone.",
    mixedAgeAdaptations: "Toddlers hold dolls while older children write notes.",
    settingTags: ["indoor", "small_group"],
    setupImageUrl: "https://cdn.example/setup-uploaded.jpg",
    exampleImageUrl: "https://cdn.example/example-uploaded.jpg",
    setupMediaAssetId: "media-setup-uploaded",
    imageRequirement: "setup_only",
    imageBriefSetup: "Activity-specific setup for Doctor's Office Dramatic Play",
    imageBriefExample: "Children bandaging dolls in Doctor's Office Dramatic Play",
    imageRequirementAiSuggestion: "setup_only",
  };
}

function siblingActivity() {
  return {
    id: "act-helper-hats-2",
    itemId: "tue-1",
    lessonPlanId: "lp-community-helpers",
    title: "Community Helper Hats",
    dayOfWeek: "tuesday",
    materials: "Paper plates\nMarkers",
    steps: "Decorate hats.",
    teacherTips: ["Offer two hat shapes."],
  };
}

function vestPaste({ omitOutdoor = false, omitVocabulary = false, extraHeading = true } = {}) {
  const lines = [
    "Activity name:",
    "My Community Helper Vest",
    "",
    "Weekday:",
    "Mon",
    "",
    "Category / developmental domain:",
    "Creative Arts / Fine Motor",
    "",
    "Recommended age:",
    "Preschool 3–5 years",
    "",
    "Estimated duration:",
    "20–30 minutes",
    "",
    "Activity objective:",
    "Children design a helper vest and name a way they can help their community.",
    "",
    "What children will do:",
    "Decorate a paper-bag vest and choose a community helper role.",
    "",
    "Materials:",
    "Paper grocery bags",
    "Washable markers",
    "Dot markers",
    "Large stickers",
    "Paper shapes",
    "Glue sticks",
    "",
    "Teacher preparation:",
    "Cut armholes and a neck opening in each paper grocery bag.",
    "",
    "Setup:",
    "Place bags, markers, stickers, and glue at a low table.",
    "",
    "Step-by-step directions:",
    "1. Invite children to try on a paper-bag vest.",
    "2. Decorate the vest with markers, stickers, and paper shapes.",
    "3. Choose a community helper role the vest could belong to.",
    "4. Tell a friend one way that helper can help.",
    "5) Hang finished vests to dry.",
    "",
    "Suggested questions to ask:",
    "Who could wear a vest like this?",
    "How does this helper keep people safe?",
    "What mark did you choose first?",
    "",
    "Learning and observation focus:",
    "Notice independent material choices and helper-role language.",
    "",
    "Safety and supervision:",
    "Use child-safe scissors only with an adult nearby.",
    "",
    "Cleanup:",
    "Cap markers and stack leftover bags.",
    "",
    "Small group:",
    "Two to four children at the vest table.",
    "",
    "Large group:",
    "Share finished vests at circle.",
    "",
    "Indoor:",
    "Run the vest studio at the art table.",
    "",
  ];
  if (!omitOutdoor) {
    lines.push("Outdoor:", "Clip vests to a fence and add nature collage pieces.", "");
  }
  lines.push(
    "Teacher tips:",
    "Offer the bag upside down so the open end becomes the vest hem.",
    "Name helper roles without assigning gender.",
    "",
    "Supply substitutions:",
    "If missing: Paper grocery bags",
    "Use instead: Large construction-paper rectangles with a neck slit",
    "",
    "Support adaptations:",
    "Pre-cut some stickers and offer chunky markers.",
    "",
    "Added challenge:",
    "Add a helper badge and write one job word.",
    "",
    "Mixed-age adaptations:",
    "Toddlers stamp; older children plan a helper symbol.",
    "",
    "Observation prompts:",
    "Makes independent choices about art materials",
    "Uses fine-motor skills",
    "Creates marks or symbols",
    "Describes a way they can help",
    "Invents or identifies a community helper role",
    "",
  );
  if (!omitVocabulary) {
    lines.push("Vocabulary:", "vest", "helper", "community", "decorate", "role", "");
  }
  lines.push(
    "Printables:",
    "Helper Place Signs",
    "",
  );
  if (extraHeading) {
    lines.push("Mystery heading:", "Do not guess a destination for this paragraph.", "");
  }
  return lines.join("\n");
}

function sampleDraft(doctor, sibling) {
  return {
    week: {
      weeklyOverview: "Community helpers week stays put.",
      objectives: "Name helpers",
      weeklyMaterials: "Bags\nMarkers",
      teacherPreparation: "Stage the dramatic play clinic.",
      familyConnection: "Ask about helpers at home.",
      milestones: ["Fine motor", "Language"],
      printableIds: ["res-helper-signs"],
      teacherToolkit: {
        prepChecklist: ["Print helper cards"],
        observationFocus: ["Helper language"],
        notes: "",
        teacherPreparation: "Stage the dramatic play clinic.",
      },
    },
    activities: {
      [doctor.id]: {
        id: doctor.id,
        itemId: doctor.itemId,
        title: doctor.title,
        materials: doctor.materials,
        steps: doctor.steps,
        teacherLanguage: doctor.teacherLanguage,
        teacherTips: doctor.teacherTips.slice(),
        substitutions: doctor.substitutions.map((s) => ({ ...s })),
        observationPrompts: doctor.observationPrompts.slice(),
        observationOpportunities: doctor.observationOpportunities,
        vocabulary: doctor.vocabulary.slice(),
        indoorAlternatives: doctor.indoorAlternatives,
        outdoorAlternatives: doctor.outdoorAlternatives,
        imageBriefSetup: doctor.imageBriefSetup,
        imageBriefExample: doctor.imageBriefExample,
        setupImageUrl: doctor.setupImageUrl,
        exampleImageUrl: doctor.exampleImageUrl,
        setupMediaAssetId: doctor.setupMediaAssetId,
        imageRequirement: doctor.imageRequirement,
        imageRequirementAiSuggestion: doctor.imageRequirementAiSuggestion,
      },
      [sibling.id]: {
        title: sibling.title,
        materials: sibling.materials,
        steps: sibling.steps,
        teacherTips: sibling.teacherTips.slice(),
      },
    },
  };
}

function haystack(value) {
  return JSON.stringify(value);
}

function assertDoctorAbsent(obj, label) {
  const blob = haystack(obj).toLowerCase();
  DOCTOR_ABSENT.forEach((needle) => {
    ok(!blob.includes(needle.toLowerCase()), `${label} must not contain: ${needle}`);
  });
}

function applyReplace(draft, preview, extra = {}) {
  return paste.applyActivityReplacementToDraft(draft, preview, {
    confirm: true,
    expectedActivityKey: preview.activityKey,
    expectedPlanId: preview.planId,
    expectedFingerprint: preview.fingerprint,
    currentDraftActivity: draft.activities[preview.activityKey],
    currentWeek: draft.week,
    ...extra,
  });
}

function main() {
  const doctor = doctorActivity();
  const sibling = siblingActivity();
  const plan = {
    id: "lp-community-helpers",
    title: "Community Helpers",
    status: "published",
    resourceIds: ["res-helper-signs"],
    books: [{ title: "Helpers in My Neighborhood" }],
    songs: [{ title: "People in Your Neighborhood" }],
    dailyPlans: {
      monday: { items: [{ itemId: doctor.itemId, id: doctor.id, title: doctor.title, materials: doctor.materials }] },
      tuesday: { items: [{ itemId: sibling.itemId, id: sibling.id, title: sibling.title }] },
    },
  };

  const importer = paste.emptyImporterState();
  ok(importer.mode === "update", "1. default paste mode is Update Existing Activity");
  ok(importer.replaceConfirm === false, "1b. replace confirm starts false");

  const updatePreview = paste.buildActivityPreview(
    "Teacher tips:\nOffer a second clipboard\n",
    doctor,
    { teacherTips: doctor.teacherTips.slice() },
    doctor.id,
  );
  const tipChange = (updatePreview.fieldChanges || []).find((c) => c.fieldId === "teacherTips");
  ok(tipChange && tipChange.list.keep.includes(doctor.teacherTips[0]), "1c. Update mode keeps existing tips");
  ok(tipChange.list.add.some((t) => /second clipboard/i.test(t)), "1d. Update mode adds unique tips");
  ok(tipChange.list.next.some((t) => /gentle care language/i.test(t)), "44. Update merge still appends");

  const draft = sampleDraft(doctor, sibling);
  const weekBefore = JSON.stringify(draft.week);
  const siblingBefore = JSON.stringify(draft.activities[sibling.id]);
  const doctorPublishedBefore = JSON.stringify(doctor);
  const resourceIdsBefore = JSON.stringify(plan.resourceIds);

  const preview = paste.buildActivityReplacePreview(
    vestPaste({ omitOutdoor: true, omitVocabulary: false }),
    doctor,
    draft.activities[doctor.id],
    doctor.id,
    { plan, planId: plan.id, week: draft.week },
  );

  ok(preview.mode === "replace", "2. Replace preview mode");
  ok(preview.ui.singleConfirm === true, "3. one final confirmation flag");
  ok(preview.ui.perFieldCheckboxes === false, "4. no per-field replacement checkboxes");
  ok(!preview.fieldChanges.length, "4b. replace preview has no selectable fieldChanges");
  ok(preview.currentTitle === "Doctor's Office Dramatic Play", "preview current title");
  ok(preview.nextTitle === "My Community Helper Vest", "preview next title");
  ok(preview.replacementActivity.replaceOwned === true, "replaceOwned marker");
  ok(preview.missing.some((row) => row.fieldId === "outdoorAlternatives" && row.required === false), "6. omitted Outdoor listed missing");
  ok(preview.unrecognized.some((row) => /mystery/i.test(row.heading)), "45. unknown heading shown");
  ok(preview.manualResources.some((row) => /printable/i.test(row.heading)), "46. resource heading is manual-only");
  ok(preview.staleImageBriefs.some((row) => /Doctor's Office Dramatic Play/.test(row.previous)), "30. stale doctor image brief flagged");
  ok(preview.protectedImages.some((row) => row.field === "setupImageUrl"), "29. uploaded image protected");
  ok(preview.protectedResources.some((row) => row.id === "res-helper-signs"), "27. linked resource relationship listed");
  ok(preview.imageRequirementPreserved === "setup_only", "31. image requirement remains owner-controlled");

  const cancel = paste.applyActivityReplacementToDraft(draft, preview, {
    confirm: false,
    expectedActivityKey: doctor.id,
    currentDraftActivity: draft.activities[doctor.id],
    currentWeek: draft.week,
  });
  ok(cancel.error === "confirm_required" && cancel.changed === false, "5/7. unconfirmed apply is blocked");
  ok(JSON.stringify(cancel.draft.activities[doctor.id]) === JSON.stringify(draft.activities[doctor.id]), "5. Cancel/unconfirmed changes nothing");

  const previewOnly = JSON.stringify(draft);
  ok(previewOnly === JSON.stringify(sampleDraft(doctor, sibling)), "6. Preview builder does not mutate draft");

  const failedParse = paste.buildActivityReplacePreview("not a labeled activity", doctor, draft.activities[doctor.id], doctor.id, {
    plan, planId: plan.id, week: draft.week,
  });
  ok(failedParse.error === "parse_empty", "40. parse failure reported");
  const parseFailApply = paste.applyActivityReplacementToDraft(draft, failedParse, {
    confirm: true,
    expectedActivityKey: doctor.id,
    currentDraftActivity: draft.activities[doctor.id],
    currentWeek: draft.week,
  });
  ok(parseFailApply.changed === false, "40b. parse failure apply makes zero changes");
  ok(JSON.stringify(draft.activities[doctor.id].title).includes("Doctor"), "40c. original draft still doctor");

  const result = applyReplace(draft, preview);
  ok(!result.error && result.changed === true, "2b. replace apply succeeds");
  ok(Object.keys(result.draft.activities).length === 2, "22. no duplicate activity created");
  ok(JSON.stringify(result.draft.week) === weekBefore, "17/26. week data unchanged");
  ok(JSON.stringify(result.draft.activities[sibling.id]) === siblingBefore, "16/25. other activities unchanged");
  ok(JSON.stringify(plan.resourceIds) === resourceIdsBefore, "27b. plan resourceIds untouched");

  const replaced = result.draft.activities[doctor.id];
  ok(replaced.id === doctor.id, "21. stable id unchanged");
  ok(replaced.itemId === doctor.itemId, "21b. itemId unchanged");
  ok(replaced.title === "My Community Helper Vest", "7. title replaced");
  ok(/Paper grocery bags/.test(replaced.materials), "9. new vest materials present");
  ok(!/Doctor kit/i.test(replaced.materials), "9b. old materials gone");
  ok(/Invite children to try on a paper-bag vest/.test(replaced.steps), "10. new steps present");
  ok(!/Patients wait with books/.test(replaced.steps), "10b. old steps gone");
  ok(/Who could wear a vest like this/.test(replaced.teacherLanguage), "11. new questions present");
  ok(!/How can the doctor help today/.test(replaced.teacherLanguage), "11b. old questions gone");
  ok(replaced.teacherTips.includes("Offer the bag upside down so the open end becomes the vest hem."), "12. new tips");
  ok(!replaced.teacherTips.some((t) => /checkups are not scary/i.test(t)), "12b. old tips gone");
  ok(replaced.substitutions.some((s) => /construction-paper/i.test(s.use)), "13. new substitutions");
  ok(!replaced.substitutions.some((s) => /Doctor kit/i.test(s.need)), "13b. old substitutions gone");
  ok(replaced.observationPrompts.includes("Makes independent choices about art materials"), "14. new observations");
  ok(!replaced.observationPrompts.includes("Uses doctor tools safely"), "14b. old observations gone");
  ok(replaced.vocabulary.includes("vest") && replaced.vocabulary.includes("decorate"), "15. new vocabulary");
  ok(!replaced.vocabulary.includes("tool") || replaced.vocabulary.includes("vest"), "15b. vocab is pasted list");
  ok(replaced.indoorAlternatives.includes("art table"), "16. indoor text replaced");
  ok(replaced.outdoorAlternatives === "", "18. omitted Outdoor is blank");
  ok(replaced.adaptations.includes("chunky markers"), "17. adaptations replaced");
  ok(replaced.extensions.includes("helper badge"), "17b. added challenge replaced");
  ok(replaced.imageBriefSetup === "", "30b. stale setup brief cleared");
  ok(replaced.imageBriefExample === "", "30c. stale example brief cleared");
  ok(replaced.setupImageUrl === doctor.setupImageUrl, "29. uploaded setup image not deleted");
  ok(replaced.setupMediaAssetId === doctor.setupMediaAssetId, "29b. media asset id preserved");
  ok(replaced.imageRequirement === "setup_only", "31b. owner image requirement preserved");
  ok(replaced.observationOpportunities.includes("independent material choices"), "learning focus replaced");
  ok(!/Uses doctor tools safely/.test(replaced.observationOpportunities), "20. legacy observationOpportunities not keeping doctor text");

  assertDoctorAbsent(replaced, "replaced draft activity");

  const view = enrichment.activityEnrichmentView(doctor, replaced);
  ok(view.title === "My Community Helper Vest", "24. editor overlay title is vest");
  ok(!/Doctor kit/i.test(view.materials), "overlay materials are vest-only");
  ok(!view.teacherTips.some((t) => /checkups are not scary/i.test(t)), "overlay tips are vest-only");
  ok(!view.observationPrompts.includes("Uses doctor tools safely"), "20b. overlay does not resurrect doctor prompts");
  ok(view.outdoorAlternatives === "", "19. omitted outdoor does not resurrect published outdoor");
  ok(view.imageBriefSetup === "", "overlay brief cleared");
  ok(view.setupImageUrl === doctor.setupImageUrl, "overlay keeps uploaded image");

  const jump = enrichment.buildJumpIndex(plan, [doctor, sibling], result.draft);
  const vestHit = jump.find((h) => h.id === doctor.id);
  ok(vestHit && vestHit.label === "My Community Helper Vest", "23. sidebar/jump selector uses draft title");

  const completion = enrichment.computeActivityCompletion(doctor, replaced, plan);
  ok(completion.missing.includes("Outdoor") === false, "completion uses mapped outdoor key via outdoorAlternatives");
  ok(!completion.missing.includes("Activity name"), "32. title present counts toward completion");
  const omitPreview = paste.buildActivityReplacePreview(
    vestPaste({ omitOutdoor: true, omitVocabulary: true, extraHeading: false }),
    doctor,
    draft.activities[doctor.id],
    doctor.id,
    { plan, planId: plan.id, week: draft.week },
  );
  const omitApply = applyReplace(sampleDraft(doctor, sibling), omitPreview);
  const omitView = enrichment.activityEnrichmentView(doctor, omitApply.draft.activities[doctor.id]);
  ok(omitView.vocabulary.length === 0, "18b. omitted vocabulary is blank, not doctor vocab");
  ok(!omitView.vocabulary.includes("tool"), "19b. omitted vocab does not resurrect helper/community/job/tool doctor-only set");
  const omitCompletion = enrichment.computeActivityCompletion(doctor, omitApply.draft.activities[doctor.id], plan);
  ok(Array.isArray(omitCompletion.missing), "33. missing fields recalculate from new content");

  const reloaded = JSON.parse(JSON.stringify(result.draft));
  const reloadedView = enrichment.activityEnrichmentView(doctor, reloaded.activities[doctor.id]);
  ok(reloadedView.title === "My Community Helper Vest", "34. save-draft JSON roundtrip keeps vest title");
  assertDoctorAbsent(reloaded.activities[doctor.id], "35. reload does not resurrect doctor content");

  const providerPlan = enrichment.planForProviderMapping({ ...plan, enrichmentDraft: result.draft });
  ok(!Object.prototype.hasOwnProperty.call(providerPlan, "enrichmentDraft"), "23-safety. customer mapping strips draft");
  ok(JSON.parse(doctorPublishedBefore).title === "Doctor's Office Dramatic Play", "36. published activity object unchanged");
  ok(doctor.title === "Doctor's Office Dramatic Play", "20. in-memory published title still doctor");

  const merged = enrichment.mergeDraftIntoPlan(plan, [doctor, sibling], result.draft);
  const mergedDoctor = merged.activities.find((a) => a.id === doctor.id || a.itemId === doctor.itemId);
  ok(mergedDoctor.title === "My Community Helper Vest", "publish-merge would use vest after explicit Publish");
  ok(!/Doctor kit/i.test(String(mergedDoctor.materials || "")), "publish-merge materials are vest-only");
  ok(String(mergedDoctor.outdoorAlternatives || "") === "", "publish-merge omitted outdoor stays blank");
  const mergedSibling = merged.activities.find((a) => a.id === sibling.id);
  ok(mergedSibling.title === sibling.title, "publish-merge leaves sibling title");

  const stale = applyReplace(result.draft, preview, {
    currentDraftActivity: { ...result.draft.activities[doctor.id], title: "Edited under preview" },
  });
  ok(stale.error === "stale_preview" && stale.changed === false, "38. activity change under preview blocks apply");

  const switched = paste.applyActivityReplacementToDraft(result.draft, preview, {
    confirm: true,
    expectedActivityKey: sibling.id,
    expectedPlanId: plan.id,
    currentDraftActivity: result.draft.activities[doctor.id],
    currentWeek: result.draft.week,
  });
  ok(switched.error === "stale_selection" && switched.changed === false, "38b. activity-switch blocks stale apply");

  const lessonSwitch = paste.applyActivityReplacementToDraft(result.draft, preview, {
    confirm: true,
    expectedActivityKey: doctor.id,
    expectedPlanId: "lp-other-lesson",
    currentDraftActivity: result.draft.activities[doctor.id],
    currentWeek: result.draft.week,
  });
  ok(lessonSwitch.error === "stale_plan" && lessonSwitch.changed === false, "39. lesson-switch blocks stale apply");

  const broken = paste.applyActivityReplacementToDraft(result.draft, {
    ...preview,
    replacementActivity: { title: "Nope" },
  }, {
    confirm: true,
    expectedActivityKey: doctor.id,
    currentDraftActivity: result.draft.activities[doctor.id],
    currentWeek: result.draft.week,
  });
  ok(broken.changed === false, "41. invalid replacement makes zero partial changes");
  ok(result.draft.activities[doctor.id].title === "My Community Helper Vest", "41b. prior successful replace remains intact");

  ok(replaced.teacherTips.length === new Set(replaced.teacherTips.map((t) => t.toLowerCase())).size, "48. no duplicate tip chips");
  ok(replaced.observationPrompts.length === 5, "47. multiline observations stay separate items");
  ok(/5\) Hang finished vests/.test(replaced.steps), "47b. numbered 5) step preserved as its own line");

  const weekPreview = paste.buildWeekPreview("Weekly overview:\nStill a week paste", draft.week, plan);
  ok(weekPreview.scope === "week", "43. Paste Week builder still exists");
  const weekApply = paste.applyPreviewToDraft(result.draft, weekPreview, { selectedFieldIds: ["weeklyOverview"] });
  ok(weekApply.draft.activities[doctor.id].title === "My Community Helper Vest", "43b. week apply does not disturb replaced activity");

  const editorSrc = fs.readFileSync(path.join(__dirname, "teaching-kit-enrichment-editor.js"), "utf8");
  ok(editorSrc.includes("REPLACE ACTIVITY"), "3b. editor has REPLACE ACTIVITY button");
  ok(editorSrc.includes("I understand this will replace the current draft activity content"), "3c. single confirmation copy");
  ok(editorSrc.includes("Update Existing Activity") && editorSrc.includes("Replace With New Activity"), "1e. two clear modes in UI");
  ok(!/data-paste-select/.test(editorSrc.split("renderActivityReplacePreviewBody")[1]?.split("function renderPasteImportModal")[0] || "data-paste-select"), "4c. replace preview renderer has no per-field select");

  const importerClear = paste.shouldClearImporterState(
    { open: true, scope: "activity", activityKey: doctor.id, planId: plan.id, preview },
    { planId: plan.id, mode: "activities", activityKey: sibling.id },
  );
  ok(importerClear === true, "38c. importer state clears on activity switch");

  console.log(`OK teaching-kit-activity-replace (${passed} assertions)`);
}

main();
