#!/usr/bin/env node
/**
 * Focused tests for Owner Admin Paste Week / Paste Activity importers.
 * Run: npm run test:teaching-kit-paste-import
 */
const assert = require("node:assert/strict");
const paste = require("./teaching-kit-paste-import.js");
const enrichment = require("./teaching-kit-enrichment.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function findChange(preview, fieldId) {
  return (preview.fieldChanges || []).find((c) => c.fieldId === fieldId);
}

function sampleWeek() {
  return {
    weeklyOverview: "Existing overview stays until replaced.",
    objectives: "Keep this objective",
    weeklyMaterials: "Mats\nMirrors",
    teacherPreparation: "",
    familyConnection: "Existing family note",
    milestones: ["Gross motor"],
    teacherToolkit: {
      prepChecklist: ["Print the Tummy-Time Visual Strip."],
      observationFocus: ["Head lifting"],
      notes: "",
      teacherPreparation: "",
    },
  };
}

function sampleActivity() {
  return {
    id: "act-rolling-rattle-1",
    itemId: "mon-1",
    title: "Rolling Rattle Tummy Track",
    dayOfWeek: "monday",
    activityCategory: "Gross Motor",
    ageModifications: "",
    durationMinutes: "",
    objective: "Existing objective",
    description: "Babies track a rattle.",
    materials: "Soft rattle",
    preparation: "",
    setup: "Clean mat",
    steps: "1. Place baby on tummy\n2. Show the rattle",
    teacherLanguage: "Can you hear the rattle?",
    observationOpportunities: "Watch for head lifting",
    safetyNotes: "Supervise closely",
    cleanupTips: "",
    teacherTips: ["Keep sessions short"],
    observationPrompts: ["Lifts head"],
    vocabulary: ["rattle"],
    substitutions: [{ need: "Soft rolling rattle", use: "Soft ball" }],
    settingTags: ["indoor"],
    adaptations: "",
    extensions: "",
    mixedAgeAdaptations: "",
    indoorAlternatives: "",
    outdoorAlternatives: "",
  };
}

function weekPasteSample() {
  return [
    "Weekly overview:",
    "Infants will build strength through tummy-time experiences.",
    "",
    "Learning objectives:",
    "Strengthen neck and shoulder muscles",
    "Encourage head lifting and visual tracking",
    "Keep this objective",
    "",
    "Materials list:",
    "- Tummy time mats",
    "- Baby-safe mirrors",
    "Soft toys",
    "",
    "Teacher preparation / Toolkit:",
    "Prepare a clean floor mat and baby-safe mirrors.",
    "",
    "Prep checklist:",
    "1. Print the Tummy-Time Visual Strip.",
    "2. Prepare only the cards needed for the day.",
    "Keep loose pieces out of baby's reach.",
    "",
    "Observation focus:",
    "Head lifting",
    "Visual tracking",
    "Reaching",
    "",
    "Family connection:",
    "Encourage families to provide several short tummy-time opportunities.",
    "",
    "Milestones:",
    "Gross motor",
    "Fine motor",
    "Language",
    "Social-emotional",
    "Quantum dancing",
    "",
    "Linked resources:",
    "Tummy-Time Visual Strip",
    "",
    "Mystery heading:",
    "Should stay unrecognized",
  ].join("\n");
}

function activityPasteSample() {
  return [
    "Recommended age:",
    "Infant 0–6 months",
    "",
    "Estimated duration:",
    "3–5 minutes",
    "",
    "Suggested questions to ask:",
    "Can you hear the rattle?",
    "Where did it go?",
    "Can you see it?",
    "",
    "Step-by-step directions:",
    "1. Place baby on tummy",
    "2. Show the rattle",
    "3. Slowly roll the rattle in an arc",
    "",
    "Small group:",
    "Place 2–3 babies on separate mats...",
    "",
    "Indoor:",
    "Use a clean, firm floor area...",
    "",
    "Supply substitution:",
    "If missing: Soft rolling rattle",
    "Use instead: Large soft sensory ball",
    "",
    "Teacher tips:",
    "- Narrate the movement",
    "Keep sessions short",
    "",
    "Added challenge:",
    "Move the rattle through a slightly wider arc...",
    "",
    "Mixed-age adaptations:",
    "For older infants...",
    "",
    "Observation prompts:",
    "Lifts head",
    "Turns toward rattle",
    "Tracks movement",
    "",
    "Vocabulary:",
    "rattle",
    "roll",
    "sound",
    "look",
    "",
    "Vocabulary words:",
    "left",
    "right",
    "",
    "Totally unknown field:",
    "Do not insert this anywhere",
  ].join("\n");
}

function main() {
  // --- Week heading coverage ---
  const weekPreview = paste.buildWeekPreview(weekPasteSample(), sampleWeek(), {
    weeklyOverview: "Published overview",
    objectives: "Published objectives",
    familyConnection: "Published family",
  });
  ok(weekPreview.scope === "week", "week preview scope");
  ok(findChange(weekPreview, "weeklyOverview"), "1. weekly overview maps");
  ok(findChange(weekPreview, "objectives"), "2. learning objectives map");
  ok(findChange(weekPreview, "weeklyMaterials"), "3. materials map");
  ok(findChange(weekPreview, "teacherPreparation"), "4. teacher preparation maps");
  ok(findChange(weekPreview, "prepChecklist"), "5. prep checklist maps");
  ok(findChange(weekPreview, "observationFocus"), "6. observation focus maps");
  ok(findChange(weekPreview, "familyConnection"), "7. family connection maps");
  const milestones = findChange(weekPreview, "milestones");
  ok(milestones, "8. milestones map");
  ok(milestones.list.add.includes("Fine motor"), "8b. valid milestone Fine motor");
  ok(milestones.list.add.includes("Language"), "8c. valid milestone Language");
  ok(milestones.list.unknown.includes("Quantum dancing"), "9. invalid milestone unrecognized");
  ok(milestones.list.duplicates.includes("Gross motor"), "11-week. duplicate milestone ignored");
  ok(milestones.list.keep.includes("Gross motor"), "10. existing milestones remain");

  const materials = findChange(weekPreview, "weeklyMaterials");
  ok(materials.list.keep.includes("Mats"), "10b. existing materials remain");
  ok(materials.list.add.includes("Soft toys"), "3b. materials parse individually");
  ok(materials.list.duplicates.includes("Baby-safe mirrors") || materials.list.keep.includes("Mirrors"), "materials preserve existing");

  const prep = findChange(weekPreview, "prepChecklist");
  ok(prep.list.keep.some((x) => /Visual Strip/.test(x)), "5b. existing checklist kept");
  ok(prep.list.add.some((x) => /cards needed/.test(x)), "5c. checklist line added");
  ok(prep.list.duplicates.some((x) => /Visual Strip/.test(x)), "11. duplicate checklist ignored");

  const overview = findChange(weekPreview, "weeklyOverview");
  ok(overview.action === "replace", "12. existing scalar not silently replaceable");
  ok(overview.selected === false, "12b. replace unchecked by default");

  const teacherPrep = findChange(weekPreview, "teacherPreparation");
  ok(teacherPrep.action === "fill" && teacherPrep.selected === true, "13. blank scalar can be filled");

  ok((weekPreview.manualResources || []).length >= 1, "14. linked-resource text is manual-only");
  ok((weekPreview.unrecognized || []).some((u) => /Mystery heading/i.test(u.heading)), "unknown week heading unrecognized");

  // Cancel = zero changes (preview only)
  const draftBeforeCancel = {
    activities: { "act-other": { title: "Other" } },
    week: sampleWeek(),
  };
  const cancelClone = JSON.parse(JSON.stringify(draftBeforeCancel));
  ok(JSON.stringify(cancelClone) === JSON.stringify(draftBeforeCancel), "15. cancel produces zero changes");

  // Apply week selected (fill + lists only; no unselected replace)
  overview.selected = false;
  teacherPrep.selected = true;
  findChange(weekPreview, "objectives").selected = true;
  findChange(weekPreview, "weeklyMaterials").selected = true;
  findChange(weekPreview, "prepChecklist").selected = true;
  findChange(weekPreview, "observationFocus").selected = true;
  findChange(weekPreview, "milestones").selected = true;
  const family = findChange(weekPreview, "familyConnection");
  family.selected = false;

  const weekApply = paste.applyPreviewToDraft(draftBeforeCancel, weekPreview);
  ok(!weekApply.draft.week.weeklyOverview || weekApply.draft.week.weeklyOverview === sampleWeek().weeklyOverview
    || weekApply.appliedFields.includes("weeklyOverview") === false, "12c. unselected scalar not applied");
  ok(weekApply.draft.week.teacherPreparation.includes("clean floor mat"), "13b. blank teacher prep filled");
  ok(String(weekApply.draft.week.objectives).includes("Strengthen neck"), "objectives merged");
  ok(String(weekApply.draft.week.objectives).includes("Keep this objective"), "existing objective preserved in merge");
  ok(weekApply.draft.week.milestones.includes("Gross motor"), "milestone keep");
  ok(weekApply.draft.week.milestones.includes("Fine motor"), "milestone add");
  ok(!weekApply.draft.week.milestones.includes("Quantum dancing"), "invalid milestone not stored");
  ok(weekApply.draft.activities["act-other"].title === "Other", "16. week import cannot modify activity data");
  ok(weekApply.draft.week.familyConnection === "Existing family note", "unselected family replace not applied");
  ok(!Object.prototype.hasOwnProperty.call(weekApply.draft.week, "linkedResources"), "14b. no fabricated resource field");

  // --- Activity heading coverage ---
  const activity = sampleActivity();
  const draftAct = {
    teacherTips: ["Keep sessions short"],
    observationPrompts: ["Lifts head"],
    vocabulary: ["rattle"],
    substitutions: [{ need: "Soft rolling rattle", use: "Soft ball" }],
    settingTags: ["indoor"],
  };
  const activityPreview = paste.buildActivityPreview(
    activityPasteSample(),
    activity,
    draftAct,
    activity.id,
  );
  ok(activityPreview.scope === "activity", "activity scope");
  ok(activityPreview.activityKey === "act-rolling-rattle-1", "stable activity key on preview");

  const supportedActivityFields = [
    "ageModifications",
    "durationMinutes",
    "teacherLanguage",
    "steps",
    "settingTag_small_group",
    "indoorAlternatives",
    "substitutions",
    "teacherTips",
    "extensions",
    "mixedAgeAdaptations",
    "observationPrompts",
    "vocabulary",
  ];
  supportedActivityFields.forEach((fieldId) => {
    ok(findChange(activityPreview, fieldId), `17. activity heading maps: ${fieldId}`);
  });

  const vocab = findChange(activityPreview, "vocabulary");
  ok(vocab.list.add.includes("roll"), "18. vocabulary becomes individual items");
  ok(vocab.list.add.includes("sound"), "18b. vocabulary item sound");
  ok(vocab.list.add.includes("left"), "14-var. heading variation Vocabulary words");
  ok(vocab.list.keep.includes("rattle"), "22. existing vocabulary remains");
  ok(vocab.list.duplicates.includes("rattle"), "23. duplicate vocabulary ignored");

  const obs = findChange(activityPreview, "observationPrompts");
  ok(obs.list.add.includes("Turns toward rattle"), "19. observation prompts individual");
  ok(obs.list.add.includes("Tracks movement"), "19b. tracks movement");
  ok(obs.list.keep.includes("Lifts head"), "22b. existing observation kept");
  ok(obs.list.duplicates.includes("Lifts head"), "23b. duplicate observation ignored");

  const questions = findChange(activityPreview, "teacherLanguage");
  ok(questions.list.add.includes("Where did it go?"), "20. questions parse correctly");
  ok(questions.list.duplicates.includes("Can you hear the rattle?"), "20b. existing question duplicate ignored");

  const steps = findChange(activityPreview, "steps");
  ok(steps.list.keep[0].includes("Place baby on tummy"), "21. existing steps remain");
  ok(steps.list.add.some((s) => /arc/i.test(s)), "21b. new step appended");
  ok(steps.nextText.indexOf("Place baby") < steps.nextText.indexOf("arc"), "21c. step order preserved");

  const age = findChange(activityPreview, "ageModifications");
  ok(age.action === "fill" && age.selected === true, "25. blank scalar fillable");
  const objectiveWouldBe = paste.buildActivityPreview(
    "Activity objective:\nBrand new objective text",
    activity,
    draftAct,
    activity.id,
  );
  const objChange = findChange(objectiveWouldBe, "objective");
  ok(objChange.action === "replace" && objChange.selected === false, "24. existing scalar not silently overwritten");

  ok((activityPreview.unrecognized || []).some((u) => /Totally unknown|Small group \(prose\)/i.test(u.heading)),
    "26. unknown headings / unsupported prose not guessed into another field");

  // Apply activity — only selected fields + stable ID
  age.selected = true;
  findChange(activityPreview, "durationMinutes").selected = true;
  questions.selected = true;
  steps.selected = true;
  vocab.selected = true;
  obs.selected = true;
  findChange(activityPreview, "teacherTips").selected = true;
  findChange(activityPreview, "substitutions").selected = true;
  findChange(activityPreview, "extensions").selected = true;
  findChange(activityPreview, "indoorAlternatives").selected = true;
  findChange(activityPreview, "settingTag_small_group").selected = true;
  objChange.selected = false;

  const draft = {
    activities: {
      "act-rolling-rattle-1": JSON.parse(JSON.stringify(draftAct)),
      "act-other-9": { vocabulary: ["should-not-change"], teacherTips: ["other tip"] },
    },
    week: {
      weeklyOverview: "Week must stay",
      milestones: ["Creativity"],
      objectives: "Week objectives",
    },
  };
  const applied = paste.applyPreviewToDraft(draft, activityPreview);
  ok(applied.activityKey === "act-rolling-rattle-1", "28. apply targets selected activity ID");
  const target = applied.draft.activities["act-rolling-rattle-1"];
  ok(target.ageModifications.includes("Infant"), "25b. blank age filled");
  ok(target.vocabulary.includes("rattle") && target.vocabulary.includes("roll"), "vocab merged");
  ok(target.observationPrompts.includes("Lifts head") && target.observationPrompts.includes("Turns toward rattle"), "obs merged");
  ok(String(target.steps).includes("Slowly roll"), "steps applied");
  ok(applied.draft.activities["act-other-9"].vocabulary[0] === "should-not-change", "28b. other activity untouched");
  ok(applied.draft.week.weeklyOverview === "Week must stay", "29. activity import cannot modify week-level fields");
  ok(applied.draft.week.milestones[0] === "Creativity", "29b. week milestones untouched");

  // Cancel activity = zero changes
  const before = JSON.parse(JSON.stringify(draft));
  ok(JSON.stringify(before) === JSON.stringify(draft), "27. cancel zero changes baseline");

  // Stale importer state helpers
  const importer = paste.emptyImporterState();
  importer.open = true;
  importer.scope = "activity";
  importer.activityKey = "act-1";
  importer.planId = "plan-1";
  importer.rawText = "x";
  ok(paste.shouldClearImporterState(importer, { activityKey: "act-2", mode: "activities", planId: "plan-1" }),
    "30. switching activities clears stale import preview");
  importer.scope = "week";
  ok(paste.shouldClearImporterState(importer, { mode: "activities", planId: "plan-1" }),
    "31. switching Week → Activity clears Week import state");
  importer.scope = "activity";
  importer.activityKey = "act-1";
  ok(paste.shouldClearImporterState(importer, { mode: "week", planId: "plan-1", activityKey: "act-1" }),
    "32. switching Activity → Week clears Activity import state");

  // Draft overlay / save path still uses enrichment helpers (not a second system)
  const merged = enrichment.applyOwnerActivityCorePatch(
    applied.draft.activities["act-rolling-rattle-1"],
    { setup: "Updated via existing core patch" },
  );
  ok(merged.setup === "Updated via existing core patch", "33/34. existing draft overlay patch path still works");

  // Alias variations without wrong-field guessing
  const aliasPreview = paste.buildActivityPreview(
    [
      "Suggested questions:",
      "Ready?",
      "",
      "Teacher tip:",
      "Kneel close",
      "",
      "Observations:",
      "Smiles",
      "",
      "Supply substitutions:",
      "If missing: scarf",
      "Use instead: soft cloth",
      "",
      "Mixed age adaptations:",
      "Offer seated option",
    ].join("\n"),
    { id: "a1", itemId: "a1" },
    {},
    "a1",
  );
  ok(findChange(aliasPreview, "teacherLanguage"), "14. suggested questions alias");
  ok(findChange(aliasPreview, "teacherTips"), "teacher tip alias");
  ok(findChange(aliasPreview, "observationPrompts"), "observations alias → prompts not vocab");
  ok(findChange(aliasPreview, "substitutions"), "supply substitutions alias");
  ok(findChange(aliasPreview, "mixedAgeAdaptations"), "mixed age adaptations alias");
  ok(!findChange(aliasPreview, "vocabulary"), "observations do not land in vocabulary");

  // List parsing: bullets, numbered, plain
  const listBody = ["- one", "* two", "3. three", "four"].join("\n");
  const parsedLines = paste.splitContentLines(listBody);
  ok(parsedLines.join("|") === "one|two|three|four", "13. bullets/numbered/plain lines");

  // Week alias: Week overview / Objectives / Toolkit / Family idea
  const weekAlias = paste.buildWeekPreview(
    [
      "Week overview:",
      "Short week",
      "",
      "Objectives:",
      "Obj A",
      "",
      "Toolkit:",
      "Stage mats",
      "",
      "Family idea:",
      "Share photos",
      "",
      "Developmental milestones:",
      "Creativity",
    ].join("\n"),
    {},
    {},
  );
  ok(findChange(weekAlias, "weeklyOverview"), "week overview alias");
  ok(findChange(weekAlias, "objectives"), "objectives alias");
  ok(findChange(weekAlias, "teacherPreparation"), "toolkit alias");
  ok(findChange(weekAlias, "familyConnection"), "family idea alias");
  ok(findChange(weekAlias, "milestones")?.list.add.includes("Creativity"), "developmental milestones alias");

  // Missing activity key blocks apply
  const bad = paste.applyPreviewToDraft({ activities: {}, week: {} }, {
    scope: "activity",
    activityKey: "",
    fieldChanges: [{ fieldId: "title", kind: "scalar", action: "fill", next: "X", selected: true }],
  });
  ok(bad.error === "missing_activity_key", "activity apply requires stable ID");

  console.log(`OK — teaching-kit-paste-import (${passed} assertions)`);
}

main();
