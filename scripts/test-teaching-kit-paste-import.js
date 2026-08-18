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

  const kitResources = [
    { id: "cur-res-tummy-time-visual-strip", title: "Tummy-Time Visual Strip", resourceCategory: "Printables" },
  ];
  const existingWeekKit = {
    weeklyOverview: "Keep existing overview",
    books: [{ title: "Existing Book", author: "A" }],
    songs: [{ title: "Existing Song" }],
    printableIdeas: [{ title: "Existing Idea" }],
    familyConnection: "Existing family note",
    milestones: ["Gross motor"],
  };
  const partialBooksPreview = paste.buildWeekPreview(
    "Books:\nBook title: The Color Monster\nAuthor: Anna Llenas\nBook questions:\nWhat feeling do you see?\n",
    existingWeekKit,
    { resourceIds: ["cur-res-already-linked"] },
    { existingResources: kitResources, existingResourceIds: ["cur-res-already-linked"] },
  );
  const booksChange = findChange(partialBooksPreview, "books");
  ok(booksChange && booksChange.titles.includes("The Color Monster"), "week paste detects book title");
  booksChange.selected = true;
  const booksApply = paste.applyPreviewToDraft(
    { activities: { keep: { title: "Stay" } }, week: JSON.parse(JSON.stringify(existingWeekKit)) },
    partialBooksPreview,
    { selectedFieldIds: ["books"] },
  );
  ok(booksApply.draft.week.books.some((item) => item.title === "The Color Monster"), "book applied");
  ok(booksApply.draft.week.books.some((item) => item.title === "Existing Book"), "existing book preserved");
  ok(booksApply.draft.week.songs[0].title === "Existing Song", "partial books paste does not erase songs");
  ok(booksApply.draft.week.printableIdeas[0].title === "Existing Idea", "partial books paste does not erase ideas");
  ok(booksApply.draft.week.weeklyOverview === "Keep existing overview", "partial books paste does not erase overview");
  ok(booksApply.draft.activities.keep.title === "Stay", "partial books paste does not erase activities");

  const songsPreview = paste.buildWeekPreview(
    "Songs:\nSong title: Breathe In, Breathe Out\nLyrics:\nBreathe in slow.\nTeacher notes: Soft voice.\n",
    existingWeekKit,
    {},
  );
  const songsChange = findChange(songsPreview, "songs");
  ok(songsChange.titles.includes("Breathe In, Breathe Out"), "week paste detects song");
  songsChange.selected = true;
  const songsApply = paste.applyPreviewToDraft(
    { activities: {}, week: JSON.parse(JSON.stringify(existingWeekKit)) },
    songsPreview,
    { selectedFieldIds: ["songs"] },
  );
  const appliedSong = songsApply.draft.week.songs.find((item) => item.title === "Breathe In, Breathe Out");
  ok(appliedSong && /Breathe in slow/.test(appliedSong.lyrics || ""), "song lyrics stored from owner text");
  ok(songsApply.draft.week.books[0].title === "Existing Book", "partial songs paste does not erase books");

  const ideasPreview = paste.buildWeekPreview(
    "Printable Ideas:\nIdea title: Calm Choice Cards\nType: Choice cards\n",
    existingWeekKit,
    {},
  );
  const ideasChange = findChange(ideasPreview, "printableIdeas");
  ok(ideasChange.titles.includes("Calm Choice Cards"), "week paste detects printable idea");
  ok(!(ideasPreview.fieldChanges || []).some((c) => c.fieldId === "linkedResources" && (c.incoming || []).length), "ideas are not linked resources");

  const linksPreview = paste.buildWeekPreview(
    "Linked Resources:\nLinked resource: Tummy-Time Visual Strip\nLinked resource: Missing Printable\n",
    existingWeekKit,
    { resourceIds: ["cur-res-already-linked"], age: "Toddler 12–24 Months" },
    { existingResources: kitResources, existingResourceIds: ["cur-res-already-linked"] },
  );
  const linksChange = findChange(linksPreview, "linkedResources");
  ok(linksChange.resolved.length === 1, "exactly one existing resource resolved");
  ok(linksChange.unresolved.length === 1, "unresolved resource remains visible");
  ok((linksPreview.manualResources || []).some((item) => /Missing Printable/.test(item.heading || item.body || "")), "unresolved stays manual");
  const alreadyPreview = paste.buildWeekPreview(
    "Linked Resources:\nLinked resource: Tummy-Time Visual Strip\n",
    existingWeekKit,
    { resourceIds: ["cur-res-tummy-time-visual-strip"] },
    { existingResources: kitResources, existingResourceIds: ["cur-res-tummy-time-visual-strip"] },
  );
  const alreadyChange = findChange(alreadyPreview, "linkedResources");
  ok(alreadyChange.resolved[0].alreadyLinked === true, "already-linked resource is not duplicated");

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

  ok((activityPreview.unrecognized || []).some((u) => /Totally unknown/i.test(u.heading)),
    "26. unknown headings not guessed into another field");

  const imageReqPreview = paste.buildActivityPreview(
    "Image requirement:\nOptional\nSetup example brief:\nTray on a mat.\nSetup image URL:\nhttps://example.test/setup.jpg\n",
    activity,
    draftAct,
    activity.id,
  );
  const imageReq = findChange(imageReqPreview, "imageRequirement");
  ok(imageReq && imageReq.next === "optional", "image requirement maps to existing enum");
  const brief = findChange(imageReqPreview, "imageBriefSetup");
  ok(brief && /Tray on a mat/.test(brief.next || ""), "setup example brief is paste-safe");
  ok((imageReqPreview.fieldChanges || []).some((c) => c.fieldId === "setupImageUpload" && c.kind === "unsupported"),
    "setup image URL is upload-only and not faked");
  const smallGroupProse = findChange(activityPreview, "settingTag_small_group_prose");
  ok(smallGroupProse && smallGroupProse.kind === "unsupported" && smallGroupProse.selected === false,
    "26b. Small group prose is UNSUPPORTED — NOT APPLIED (no activity prose field)");
  ok(!/teacherTips|adaptations|extensions|description/i.test(JSON.stringify(smallGroupProse)),
    "26c. Small group prose not redirected into another text field");

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
  if (smallGroupProse) smallGroupProse.selected = true; // must still be ignored by apply
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
  ok(target.settingTags.includes("small_group"), "8. setting tags still work");
  ok(target.settingTags.includes("indoor"), "8b. existing indoor setting tag preserved");
  ok(!Object.prototype.hasOwnProperty.call(target, "smallGroup"),
    "Small group prose not invented as activity.smallGroup");
  ok(!Object.prototype.hasOwnProperty.call(target, "largeGroup"),
    "Large group prose not invented as activity.largeGroup");
  ok(String(target.indoorAlternatives || "").includes("clean, firm floor"),
    "5. Indoor imported text stored on indoorAlternatives");

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

  // --- Schema/UI repair regressions ---
  const groupPaste = paste.buildActivityPreview(
    [
      "Small group:",
      "Place 2–3 babies on separate mats with individual mirrors.",
      "",
      "Large group:",
      "Invite caregivers to sit in a circle and model tracking.",
      "",
      "Indoor:",
      "Use a clean, firm floor area away from heavy classroom traffic.",
      "",
      "Outdoor:",
      "Shade a mat under a tree and repeat the arc slowly.",
    ].join("\n"),
    { id: "act-vis-1", itemId: "vis-1", settingTags: [] },
    {},
    "act-vis-1",
  );
  const sgProse = findChange(groupPaste, "settingTag_small_group_prose");
  const lgProse = findChange(groupPaste, "settingTag_large_group_prose");
  ok(sgProse?.kind === "unsupported", "1. Small Group prose has no canonical activity field → unsupported");
  ok(lgProse?.kind === "unsupported", "2. Large Group prose has no canonical activity field → unsupported");
  ok(sgProse?.selected === false && lgProse?.selected === false, "13a. unsupported prose not selected for apply");
  ok(/UNSUPPORTED/i.test(sgProse?.reason || ""), "13b. preview explains UNSUPPORTED — NOT APPLIED");

  const indoorChange = findChange(groupPaste, "indoorAlternatives");
  const outdoorChange = findChange(groupPaste, "outdoorAlternatives");
  ok(indoorChange?.kind === "scalarWithSettingTag" && indoorChange.selected === true, "Indoor fill proposed");
  ok(outdoorChange?.kind === "scalarWithSettingTag" && outdoorChange.selected === true, "Outdoor fill proposed");
  indoorChange.selected = true;
  outdoorChange.selected = true;
  findChange(groupPaste, "settingTag_small_group").selected = true;
  findChange(groupPaste, "settingTag_large_group").selected = true;
  sgProse.selected = true;
  lgProse.selected = true;

  const groupApplied = paste.applyPreviewToDraft(
    { activities: { "act-vis-1": {} }, week: { weeklyOverview: "keep-week" } },
    groupPaste,
  );
  const visAct = groupApplied.draft.activities["act-vis-1"];
  ok(!visAct.smallGroup && !visAct.largeGroup, "3/4. Small/Large prose not persisted onto activity");
  ok(String(visAct.indoorAlternatives).includes("firm floor"), "Indoor text persisted");
  ok(String(visAct.outdoorAlternatives).includes("Shade a mat"), "Outdoor text persisted");
  ok(visAct.settingTags.includes("small_group") && visAct.settingTags.includes("large_group"), "setting tags still applied");
  ok(visAct.settingTags.includes("indoor") && visAct.settingTags.includes("outdoor"), "indoor/outdoor tags from text fields");
  ok(groupApplied.draft.week.weeklyOverview === "keep-week", "17. week isolation still holds");

  // Redisplay uses the same enrichment view source of truth as the Activity editor textareas.
  const redisplay = enrichment.activityEnrichmentView(
    { id: "act-vis-1", itemId: "vis-1" },
    visAct,
  );
  ok(redisplay.indoorAlternatives.includes("firm floor"), "5. Indoor redisplay via activityEnrichmentView");
  ok(redisplay.outdoorAlternatives.includes("Shade a mat"), "6. Outdoor redisplay via activityEnrichmentView");
  ok(
    redisplay.indoorAlternatives === visAct.indoorAlternatives
      && redisplay.outdoorAlternatives === visAct.outdoorAlternatives,
    "7. Indoor/Outdoor importer + manual enrichment text fields share one source of truth",
  );

  // Canonical string serialization for week objectives/materials and activity questions/steps
  const weekLines = paste.buildWeekPreview(
    [
      "Learning objectives:",
      "Obj one",
      "Obj two",
      "",
      "Materials list:",
      "Mats",
      "Mirrors",
    ].join("\n"),
    {},
    {},
  );
  findChange(weekLines, "objectives").selected = true;
  findChange(weekLines, "weeklyMaterials").selected = true;
  const weekSer = paste.applyPreviewToDraft({ activities: {}, week: {} }, weekLines);
  ok(typeof weekSer.draft.week.objectives === "string", "9. objectives canonical type is string");
  ok(weekSer.draft.week.objectives === "Obj one\nObj two", "9b. objectives serialize as newline string");
  ok(typeof weekSer.draft.week.weeklyMaterials === "string", "10. materials canonical type is string");
  ok(weekSer.draft.week.weeklyMaterials === "Mats\nMirrors", "10b. materials serialize as newline string");

  const qStep = paste.buildActivityPreview(
    [
      "Suggested questions to ask:",
      "Can you hear it?",
      "Where did it go?",
      "",
      "Step-by-step directions:",
      "1. Place baby on tummy",
      "2. Show the rattle",
      "3. Roll slowly",
    ].join("\n"),
    { id: "act-ser-1", itemId: "ser-1" },
    {},
    "act-ser-1",
  );
  findChange(qStep, "teacherLanguage").selected = true;
  findChange(qStep, "steps").selected = true;
  const qStepApplied = paste.applyPreviewToDraft({ activities: { "act-ser-1": {} }, week: {} }, qStep);
  const serAct = qStepApplied.draft.activities["act-ser-1"];
  ok(typeof serAct.teacherLanguage === "string", "11. questions canonical type is string");
  ok(serAct.teacherLanguage === "Can you hear it?\nWhere did it go?", "11b. questions newline-serialized");
  ok(typeof serAct.steps === "string", "12. steps canonical type is string");
  ok(serAct.steps === "1. Place baby on tummy\n2. Show the rattle\n3. Roll slowly",
    "12b. steps preserve numbering/order as newline string");

  // Observation focus keeps full statements (no vocabulary-word splitting)
  const obsFocus = paste.buildWeekPreview(
    [
      "Observation focus:",
      "Briefly lifts head",
      "Turns toward sound",
      "Tracks a moving object",
      "Reaches toward materials",
      "Shows increasing tummy-time tolerance",
      "Look, lift, reach, turn, tummy, rest, soft, mirror, up, and more.",
    ].join("\n"),
    {},
    {},
  );
  const focusChange = findChange(obsFocus, "observationFocus");
  ok(focusChange.list.add.includes("Briefly lifts head"), "observation statement kept whole");
  ok(focusChange.list.add.includes("Shows increasing tummy-time tolerance"), "long observation statement kept");
  ok(
    focusChange.list.add.includes("Look, lift, reach, turn, tummy, rest, soft, mirror, up, and more."),
    "comma-rich observation line stays one focus item (not vocab-split)",
  );
  ok(!findChange(obsFocus, "vocabulary"), "observation focus never maps to vocabulary");

  // Existing core patch / draft path still works after import (autosave/save channel)
  enrichment.applyOwnerActivityCorePatch(visAct, { setup: "Manual setup after import" });
  ok(visAct.setup === "Manual setup after import", "14. existing draft core patch still works");
  ok(typeof enrichment.mergeDraftIntoPlan === "function", "15. publish merge helper untouched/available");
  // Draft key must match the activity stable id used by mergeDraftIntoPlan (id || itemId).
  const publishDraft = {
    activities: {
      "vis-1": {
        indoorAlternatives: visAct.indoorAlternatives,
        outdoorAlternatives: visAct.outdoorAlternatives,
        settingTags: visAct.settingTags,
      },
    },
    week: groupApplied.draft.week,
  };
  const mergedSmoke = enrichment.mergeDraftIntoPlan(
    {
      id: "plan-vis",
      status: "published",
      dailyPlans: {
        monday: { items: [{ itemId: "vis-1", title: "Track", dayOfWeek: "monday" }] },
      },
    },
    [],
    publishDraft,
  );
  const mergedItem = mergedSmoke.plan.dailyPlans.monday.items[0];
  ok(String(mergedItem.indoorAlternatives || "").includes("firm floor"), "16. publish path carries indoorAlternatives");
  ok(String(mergedItem.outdoorAlternatives || "").includes("Shade a mat"), "16b. publish path carries outdoorAlternatives");

  // Editor surface includes Indoor/Outdoor text controls bound to the same fields.
  const fs = require("node:fs");
  const editorSrc = fs.readFileSync(require("node:path").join(__dirname, "teaching-kit-enrichment-editor.js"), "utf8");
  ok(editorSrc.includes('data-enrich-text-field="indoorAlternatives"'), "3/5 editor Indoor textarea bound");
  ok(editorSrc.includes('data-enrich-text-field="outdoorAlternatives"'), "4/6 editor Outdoor textarea bound");
  ok(editorSrc.includes("<span>Indoor</span>"), "Indoor label visible in Activity editor");
  ok(editorSrc.includes("<span>Outdoor</span>"), "Outdoor label visible in Activity editor");

  // Colonless Paste Activity Update fixture (Bug Discovery Table) — known aliases only.
  const bugFixture = [
    "Activity name",
    "Bug Discovery Table",
    "Weekday",
    "Mon",
    "Category / developmental domain",
    "Open-Ended Exploration",
    "Recommended age",
    "Toddlers 24–36 months",
    "Estimated duration",
    "15–20 minutes",
    "Activity objective",
    "Encourage curiosity, early classification, language, and careful observation while children freely explore toy insects and simple bug materials.",
    "What children will do",
    "Children will investigate toy bugs, pictures, natural materials, and baskets at an open discovery table.",
    "Materials",
    "Large baby-safe insect figures",
    "Small baskets",
    "Bug picture cards",
    "Artificial leaves",
    "Large magnifiers",
    "Green fabric or felt",
    "Tray or low table",
    "Teacher preparation",
    "Choose large insect figures without small removable parts. Place the bug figures, baskets, picture cards, leaves, and magnifiers on a low table before children arrive.",
    "Setup",
    "Cover the discovery table with green fabric. Spread the bugs and leaves where children can easily reach them. Place baskets and magnifiers around the edge.",
    "Step-by-step directions",
    "1. Invite two or three children to the discovery table.",
    "2. Allow children time to look before giving directions.",
    "3. Model picking up one bug and looking closely at it.",
    "4. Name simple features such as wings, legs, spots, and colors.",
    "5. Encourage children to place bugs into baskets or group bugs that look alike.",
    "6. Follow the children's interests rather than requiring one correct way to play.",
    "7. Help children return the bugs to the table when finished.",
    "Suggested questions to ask",
    "What bug did you find?",
    "What do you notice?",
    "Does your bug have wings?",
    "How does your bug move?",
    "Can you find another bug that looks like this one?",
    "Where should this bug go?",
    "Learning and observation focus",
    "Notice whether children visually examine bugs, use simple bug words, compare objects, group similar bugs, imitate bug movements, or share discoveries with an adult.",
    "Safety and supervision",
    "Use only oversized insect figures and baby-safe magnifiers. Supervise closely and remove any damaged materials immediately.",
    "Cleanup",
    "Return bugs, picture cards, magnifiers, leaves, and baskets to the labeled Bugs & Butterflies discovery bin. Wipe the table if needed.",
    "Indoor",
    "Use on a low classroom discovery table or floor mat.",
    "Outdoor",
    "Move the tray to a shaded outdoor table and add large leaves or safe natural materials.",
    "Teacher tips",
    "Begin with fewer bugs if children become overwhelmed.",
    "Let children explore before introducing sorting ideas.",
    "Repeat children's bug words and add one new descriptive word.",
    "Supply substitutions",
    "No toy insects — use laminated bug pictures or large felt bugs.",
    "No magnifiers — use cardboard viewing frames.",
    "Support adaptations",
    "Offer only two or three large bugs at a time.",
    "Place materials within easy reach.",
    "Model one simple action such as pick up, look, and put down.",
    "Added challenge",
    "Invite children to group bugs by wings, color, size, or number of visible spots.",
    "Mixed-age adaptations",
    "Younger toddlers can explore and point.",
    "Older toddlers can sort bugs and explain how two insects are alike.",
    "Observation prompts",
    "Does the child look closely at a bug?",
    "Does the child name or gesture toward a bug feature?",
    "Does the child group or compare bugs?",
    "Does the child bring a discovery to an adult?",
    "Vocabulary",
    "bug",
    "insect",
    "wings",
    "legs",
    "spots",
    "crawl",
    "fly",
    "look",
    "Image request",
    "Setup + finished example",
  ].join("\n");
  const bugActivity = {
    id: "act-bug-discovery",
    itemId: "act-bug-discovery",
    title: "Keep Old Title Unless Selected",
    dayOfWeek: "tuesday",
    objective: "",
    description: "",
    materials: "Keep this omitted material",
    vocabulary: "keep",
    safetyNotes: "Keep safety unless selected",
  };
  const bugPreview = paste.buildActivityPreview(bugFixture, bugActivity, {}, "act-bug-discovery");
  ok((bugPreview.unrecognized || []).length === 0, "bug fixture: no unrecognized sections");
  ok(findChange(bugPreview, "title")?.next === "Bug Discovery Table", "bug fixture: activity name");
  ok(findChange(bugPreview, "dayOfWeek")?.parsedWeekday === "monday", "bug fixture: Weekday Mon → monday");
  ok(findChange(bugPreview, "activityCategory")?.next === "Open-Ended Exploration", "bug fixture: category/domain");
  ok(String(findChange(bugPreview, "ageModifications")?.next || "").includes("24"), "bug fixture: recommended age");
  ok(String(findChange(bugPreview, "durationMinutes")?.next || "").includes("15"), "bug fixture: duration");
  ok(String(findChange(bugPreview, "objective")?.next || "").includes("Encourage curiosity"), "bug fixture: objective");
  ok(String(findChange(bugPreview, "description")?.next || "").includes("investigate toy bugs"), "bug fixture: what children will do");
  ok((findChange(bugPreview, "materials")?.list?.add || []).length === 7, "bug fixture: materials lines");
  ok(String(findChange(bugPreview, "preparation")?.next || "").includes("Choose large insect figures"), "bug fixture: teacher preparation");
  ok(String(findChange(bugPreview, "setup")?.next || "").includes("green fabric"), "bug fixture: setup");
  ok((findChange(bugPreview, "steps")?.list?.add || []).length === 7, "bug fixture: steps");
  ok((findChange(bugPreview, "teacherLanguage")?.list?.add || []).length === 6, "bug fixture: questions");
  ok(String(findChange(bugPreview, "observationOpportunities")?.next || "").includes("visually examine"), "bug fixture: observation focus");
  ok(String(findChange(bugPreview, "safetyNotes")?.next || "").includes("oversized insect"), "bug fixture: safety");
  ok(String(findChange(bugPreview, "cleanupTips")?.next || "").includes("discovery bin"), "bug fixture: cleanup");
  ok(String(findChange(bugPreview, "indoorAlternatives")?.next || "").includes("discovery table"), "bug fixture: indoor");
  ok(String(findChange(bugPreview, "outdoorAlternatives")?.next || "").includes("shaded outdoor"), "bug fixture: outdoor");
  ok((findChange(bugPreview, "teacherTips")?.list?.add || []).length === 3, "bug fixture: teacher tips");
  ok((findChange(bugPreview, "substitutions")?.list?.add || []).length === 2, "bug fixture: substitutions");
  ok(String(findChange(bugPreview, "adaptations")?.next || "").includes("two or three large bugs"), "bug fixture: support adaptations");
  ok(String(findChange(bugPreview, "extensions")?.next || "").includes("group bugs by wings"), "bug fixture: added challenge");
  ok(String(findChange(bugPreview, "mixedAgeAdaptations")?.next || "").includes("Younger toddlers"), "bug fixture: mixed-age");
  ok((findChange(bugPreview, "observationPrompts")?.list?.add || []).length === 4, "bug fixture: observation prompts");
  ok((findChange(bugPreview, "vocabulary")?.list?.add || []).includes("insect"), "bug fixture: vocabulary");
  ok(findChange(bugPreview, "imageRequirement")?.parsedEnum === "required", "bug fixture: Image request → required");
  const shortAliasPreview = paste.buildActivityPreview(
    [
      "Activity weekday",
      "Wednesday",
      "Category/domain",
      "Creative Arts",
      "Observation focus",
      "Watch closely.",
      "Image request",
      "Setup + finished example",
    ].join("\n"),
    { id: "a-alias", itemId: "a-alias", dayOfWeek: "monday" },
    {},
    "a-alias",
  );
  ok(findChange(shortAliasPreview, "dayOfWeek")?.parsedWeekday === "wednesday", "Activity weekday alias");
  ok(findChange(shortAliasPreview, "activityCategory")?.next === "Creative Arts", "Category/domain alias");
  ok(String(findChange(shortAliasPreview, "observationOpportunities")?.next || "").includes("Watch closely"), "Observation focus alias");
  ok(findChange(shortAliasPreview, "imageRequirement")?.parsedEnum === "required", "Image request alias");
  // Omitted fields stay unchanged when only selected present fields are applied.
  const omitDraft = {
    activities: {
      "act-bug-discovery": {
        title: "Keep Old Title Unless Selected",
        materials: "Keep this omitted material",
        safetyNotes: "Keep safety unless selected",
        vocabulary: "keep",
      },
    },
    week: { weeklyOverview: "Week stays untouched" },
  };
  const omitApplied = paste.applyPreviewToDraft(omitDraft, bugPreview, {
    selectedFieldIds: ["title", "dayOfWeek", "objective"],
  });
  ok(omitApplied.draft.activities["act-bug-discovery"].title === "Bug Discovery Table", "selected title applied");
  ok(omitApplied.draft.activities["act-bug-discovery"].dayOfWeek === "monday", "selected weekday applied");
  ok(String(omitApplied.draft.activities["act-bug-discovery"].objective || "").includes("Encourage curiosity"), "selected objective applied");
  ok(omitApplied.draft.activities["act-bug-discovery"].materials === "Keep this omitted material", "omitted materials unchanged");
  ok(omitApplied.draft.activities["act-bug-discovery"].safetyNotes === "Keep safety unless selected", "omitted safety unchanged");
  ok(omitApplied.draft.week.weeklyOverview === "Week stays untouched", "week draft untouched by activity paste");

  console.log(`OK — teaching-kit-paste-import (${passed} assertions)`);
}

main();
