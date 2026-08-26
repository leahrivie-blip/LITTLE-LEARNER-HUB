/**
 * AI Curriculum Operator — read-only lesson audit + future asset plan (Phase 1).
 *
 * Reuses:
 * - curriculum-standards.js
 * - teaching-kit-ai-lesson-teacher.js (analyzeLessonCompleteness)
 * - teaching-kit-quality-review.js (evaluateTeachingKit)
 * - teaching-kit-enrichment.js (completion / flatten)
 *
 * Never mutates curriculum. Never publishes.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

function loadStandards() {
  try { return require("./curriculum-standards.js"); } catch (_e) { return null; }
}
function loadEnrichment() {
  try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
}
function loadTeacher() {
  try { return require("./teaching-kit-ai-lesson-teacher.js"); } catch (_e) { return null; }
}
function loadQuality() {
  try { return require("./teaching-kit-quality-review.js"); } catch (_e) { return null; }
}
function loadOwnerWorkspace() {
  try { return require("./teaching-kit-owner-workspace.js"); } catch (_e) { return null; }
}

const GENERIC_RE = /\b(explore the materials|talk about what you see|let children play|ask children questions|children will learn about|set up the materials|have fun|enjoy the activity)\b/i;
const PLACEHOLDER_RE = /lorem ipsum|\btodo\b|\btbd\b|placeholder|coming soon|\[insert|FIXME|fill in|add here/i;
const PROCESS_ART_RE = /\b(stamp|stamping|paint|painting|process art|sensory|explore|exploration|gross.?motor|outdoor|song|sing|conversation|talk|discuss)\b/i;
const DRAMATIC_PLAY_RE = /\b(dramatic play|cafe|café|restaurant|market|store|bakery|pretend|role.?play|post office|vet|doctor|hospital)\b/i;
const CARD_ACTIVITY_RE = /\b(match|matching|sort|sorting|sequenc|count|flash.?card|scavenger|movement card|vocab)\b/i;
const GENERIC_PRINTABLE_RE = /\b(zone\s*sign|helper\s*sign|giant\s*word|classroom\s*sign|generic)\b/i;

function wordCount(value) {
  return schema.text(value).split(/\s+/).filter(Boolean).length;
}

function meaningful(value, minWords = 8) {
  const t = schema.text(value);
  if (!t) return false;
  if (PLACEHOLDER_RE.test(t)) return false;
  return wordCount(t) >= minWords;
}

function classifyTextField(value, { minStrong = 20, minOk = 8 } = {}) {
  const t = schema.text(value);
  if (!t) return { decision: "FILL", reason: "Field is empty." };
  if (PLACEHOLDER_RE.test(t)) return { decision: "REPLACE", reason: "Contains placeholder text." };
  if (GENERIC_RE.test(t) && wordCount(t) < minStrong) {
    return { decision: "IMPROVE", reason: "Content looks generic / low-detail for teachers." };
  }
  if (wordCount(t) < minOk) return { decision: "IMPROVE", reason: "Too short to be useful for a teacher." };
  if (wordCount(t) < minStrong) return { decision: "IMPROVE", reason: "Present but could be more substantial." };
  return { decision: "KEEP", reason: "Substantial useful content." };
}

function weekFieldValue(plan, draftWeek, key) {
  const week = draftWeek && typeof draftWeek === "object" ? draftWeek : {};
  if (key === "weeklyMaterials") return schema.text(week.weeklyMaterials) || schema.text(plan?.weeklyMaterials);
  if (key === "teacherPreparation") {
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : (plan?.teachingKit?.teacherToolkit || {});
    return schema.text(week.teacherPreparation)
      || schema.text(toolkit.teacherPreparation)
      || schema.text(toolkit.notes);
  }
  if (key === "prepChecklist") {
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : (plan?.teachingKit?.teacherToolkit || {});
    const list = schema.asArray(toolkit.prepChecklist);
    return list.length ? list.join("\n") : "";
  }
  if (key === "observationFocus") {
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : (plan?.teachingKit?.teacherToolkit || {});
    const list = schema.asArray(toolkit.observationFocus);
    return list.length ? list.join("\n") : schema.text(week.observationOpportunities) || schema.text(plan?.observationOpportunities);
  }
  if (key === "milestones") {
    return schema.text(week.milestones) || schema.text(plan?.milestones) || schema.text(plan?.adaptations);
  }
  if (key === "learningDomains") {
    const draftList = schema.asArray(week.learningDomains);
    const planList = schema.asArray(plan?.learningDomains);
    const list = draftList.length ? draftList : planList;
    return list.length ? list.join(", ") : "";
  }
  return schema.text(week[key]) || schema.text(plan?.[key]);
}

function classifyWeeklyFields(plan, draft) {
  const week = draft?.week || {};
  const defs = [
    { field: "weeklyOverview", label: "Weekly overview", minStrong: 25 },
    { field: "objectives", label: "Learning objectives", minStrong: 18 },
    { field: "weeklyMaterials", label: "Materials", minStrong: 12 },
    { field: "learningDomains", label: "Learning domains", minStrong: 1, isDomainList: true },
    { field: "teacherPreparation", label: "Teacher preparation / Toolkit", minStrong: 15 },
    { field: "prepChecklist", label: "Prep checklist", minStrong: 6 },
    { field: "observationFocus", label: "Observation focus", minStrong: 12 },
    { field: "familyConnection", label: "Family connection", minStrong: 15 },
    { field: "milestones", label: "Milestones / adaptations", minStrong: 10 },
    { field: "vocabularyWords", label: "Vocabulary", minStrong: 6 },
  ];
  return defs.map((def) => {
    const value = weekFieldValue(plan, week, def.field);
    if (def.isDomainList) {
      const count = schema.asArray(value ? value.split(/,\s*/) : []).filter(Boolean).length
        || schema.asArray(plan?.learningDomains).length
        || schema.asArray(week?.learningDomains).length;
      const cls = count >= 2
        ? { decision: "KEEP", reason: "Learning domains are present." }
        : (count === 1
          ? { decision: "IMPROVE", reason: "Only one learning domain selected." }
          : { decision: "FILL", reason: "Learning domains are empty." });
      return schema.normalizeFieldDecision({
        field: def.field,
        label: def.label,
        decision: cls.decision,
        reason: cls.reason,
        preview: schema.text(value, 160),
      });
    }
    const cls = classifyTextField(value, { minStrong: def.minStrong, minOk: Math.min(6, def.minStrong) });
    return schema.normalizeFieldDecision({
      field: def.field,
      label: def.label,
      decision: cls.decision,
      reason: cls.reason,
      preview: schema.text(value, 160),
    });
  });
}

function activityBlob(act, patch = {}) {
  return [
    act?.title, act?.objective, act?.description, act?.materials, act?.setup, act?.steps,
    act?.teacherRole, act?.observationOpportunities, act?.safetyNotes, act?.cleanupTips,
    patch?.objective, patch?.description, patch?.materials, patch?.setup, patch?.steps,
    patch?.teacherTips, patch?.observationPrompts,
  ].map((v) => schema.text(v)).filter(Boolean).join("\n");
}

function classifyActivity(act, patch = {}) {
  const enrich = loadEnrichment();
  const view = enrich?.activityEnrichmentView
    ? enrich.activityEnrichmentView(act, patch)
    : act;
  const required = [
    ["objective", view.objective || act.objective],
    ["description", view.description || act.description],
    ["materials", view.materials || act.materials],
    ["setup", view.setup || act.setup],
    ["steps", view.steps || act.steps],
  ];
  const missing = required.filter(([, v]) => !meaningful(v, 5)).map(([k]) => k);
  const blob = activityBlob(act, patch);
  let decision = "KEEP";
  let reason = "Activity fields look substantial.";
  if (missing.length >= 3) {
    decision = "FILL";
    reason = `Missing core fields: ${missing.join(", ")}.`;
  } else if (missing.length) {
    decision = "IMPROVE";
    reason = `Incomplete fields: ${missing.join(", ")}.`;
  } else if (GENERIC_RE.test(blob) && wordCount(blob) < 80) {
    decision = "IMPROVE";
    reason = "Activity content appears generic / thin.";
  } else if (PLACEHOLDER_RE.test(blob)) {
    decision = "REPLACE";
    reason = "Contains placeholder text.";
  }
  return {
    activityId: schema.text(act.id || act.itemId, 160),
    title: schema.text(act.title, 180),
    weekday: schema.text(act.dayOfWeek || act.weekday, 20),
    decision,
    reason,
    missingFields: missing,
  };
}

function planImageDecision(act, patch = {}) {
  const enrich = loadEnrichment();
  const view = enrich?.activityEnrichmentView
    ? enrich.activityEnrichmentView(act, patch)
    : {
      setupImageUrl: act.setupImageUrl,
      exampleImageUrl: act.exampleImageUrl,
      imageRequirement: act.imageRequirement,
    };
  const requirement = enrich?.resolveImageRequirement
    ? enrich.resolveImageRequirement(act, patch)
    : (view.imageRequirement || "recommended");
  const slots = enrich?.imageSlotsForRequirement
    ? enrich.imageSlotsForRequirement(requirement)
    : { needsSetup: true, needsExample: false };
  const hasImage = Boolean(view.setupImageUrl || view.exampleImageUrl);
  const title = schema.text(act.title);
  const blob = activityBlob(act, patch).toLowerCase();
  const likelyProcess = PROCESS_ART_RE.test(title) || PROCESS_ART_RE.test(blob);
  const isSongLike = /\b(song|sing|circle time chant)\b/i.test(title) && wordCount(blob) < 40;

  if (requirement === "not_needed" || requirement === "none") {
    return {
      decision: "NOT_NEEDED",
      reason: "Image requirement marks this activity as not needing a photo.",
      concept: "",
      existingUrl: schema.text(view.setupImageUrl || view.exampleImageUrl, 500),
    };
  }
  if (hasImage) {
    const looksBroken = /example\.com|placeholder|todo|missing|broken/i.test(String(view.setupImageUrl || view.exampleImageUrl || ""))
      || String(view.setupImageUrl || "") === "about:blank";
    const looksThemeArt = /cartoon|clipart|stock|decorat|theme[-_]?art/i.test(String(view.setupImageUrl || view.exampleImageUrl || ""));
    if (looksBroken || looksThemeArt) {
      return {
        decision: "REPLACE",
        reason: looksBroken
          ? "Existing image URL looks broken or placeholder."
          : "Existing image looks like generic theme art rather than the activity.",
        concept: [
          `Realistic childcare classroom activity for ${schema.text(act.age || "the age group", 40)}.`,
          title ? `Showing “${title}”.` : "",
          "Show the actual activity setup/actions, not decorative theme art.",
        ].filter(Boolean).join(" "),
        existingUrl: schema.text(view.setupImageUrl || view.exampleImageUrl, 500),
      };
    }
    return {
      decision: "KEEP_EXISTING",
      reason: "An activity image is already linked and looks usable.",
      concept: "",
      existingUrl: schema.text(view.setupImageUrl || view.exampleImageUrl, 500),
    };
  }
  if (isSongLike
    || /\b(book|read.?aloud|story.?time|discussion|conversation|circle\s+talk)\b/i.test(title)
    || (/\b(movement|gross.?motor|yoga|stretch)\b/i.test(title) && wordCount(blob) < 50)) {
    return {
      decision: "NOT_NEEDED",
      reason: "Song/discussion/movement-style activity; an image provides little teaching value.",
      concept: "",
      existingUrl: "",
    };
  }
  if (isSongLike && !slots.needsSetup) {
    return {
      decision: "NOT_NEEDED",
      reason: "Simple song/conversation-style activity; a photo is optional.",
      concept: "",
      existingUrl: "",
    };
  }
  if (!slots.needsSetup && !slots.needsExample && !likelyProcess) {
    return {
      decision: "NOT_NEEDED",
      reason: "No image slot required for this activity.",
      concept: "",
      existingUrl: "",
    };
  }
  const materials = schema.text(view.materials || act.materials, 200);
  const setup = schema.text(view.setup || act.setup, 200);
  const concept = [
    `Realistic childcare classroom activity for ${schema.text(act.age || "the age group", 40)}.`,
    title ? `Showing “${title}”.` : "",
    materials ? `Materials: ${materials}.` : "",
    setup ? `Setup: ${setup}.` : "",
    "Show the actual activity setup/actions, not decorative theme art. No cartoon style.",
  ].filter(Boolean).join(" ");
  return {
    decision: "GENERATE",
    reason: "A visual of the real activity setup would help teachers run it.",
    concept,
    existingUrl: "",
  };
}

function planPrintableDecision(act, patch = {}, linkedResources = []) {
  const title = schema.text(act.title);
  const blob = activityBlob(act, patch);
  const linked = schema.asArray(linkedResources);
  const weakLinked = linked.filter((r) => GENERIC_PRINTABLE_RE.test(`${r.title || ""} ${r.category || ""}`));
  const strongLinked = linked.filter((r) => !GENERIC_PRINTABLE_RE.test(`${r.title || ""} ${r.category || ""}`));

  if (strongLinked.length) {
    return {
      decision: "KEEP_EXISTING",
      reason: "Useful printable(s) already linked to this activity/lesson context.",
      type: null,
      title: schema.text(strongLinked[0].title, 180),
      contents: [],
      purpose: "Existing linked resource.",
      existingResourceIds: strongLinked.map((r) => r.id).filter(Boolean),
    };
  }
  if (weakLinked.length) {
    return {
      decision: "REPLACE",
      reason: "Linked printable looks generic (zone/sign style) rather than activity-useful.",
      type: "other",
      title: schema.text(weakLinked[0].title, 180),
      contents: [],
      purpose: "Replace generic signage with an activity-driven resource if needed.",
      existingResourceIds: weakLinked.map((r) => r.id).filter(Boolean),
    };
  }

  if (DRAMATIC_PLAY_RE.test(title) || DRAMATIC_PLAY_RE.test(blob)) {
    return {
      decision: "CREATE",
      reason: "Dramatic play benefits from props children can use (menus, tickets, food cards).",
      type: "dramatic_play_pack",
      title: `${title} Dramatic Play Pack`,
      contents: ["menu or choice board", "order ticket / form", "pretend item cards"],
      purpose: "Children use these directly during the dramatic-play activity.",
      existingResourceIds: [],
    };
  }
  if (CARD_ACTIVITY_RE.test(title) || CARD_ACTIVITY_RE.test(blob)) {
    const type = /\bsort/i.test(title + blob) ? "sorting_cards"
      : /\bsequenc/i.test(title + blob) ? "sequencing_cards"
        : /\bcount/i.test(title + blob) ? "counting_mats"
          : /\bmatch/i.test(title + blob) ? "matching_cards"
            : "picture_cards";
    return {
      decision: "CREATE",
      reason: "Card/sorting/matching activity needs usable pieces for children.",
      type,
      title: `${title} Cards`,
      contents: ["clear labeled cards or mats", "enough pieces for small-group use"],
      purpose: "Children manipulate the cards/pieces during the activity.",
      existingResourceIds: [],
    };
  }
  if (PROCESS_ART_RE.test(title) || PROCESS_ART_RE.test(blob)) {
    return {
      decision: "NOT_NEEDED",
      reason: "Open-ended / process activity — a printable usually does not improve it.",
      type: null,
      title: "",
      contents: [],
      purpose: "",
      existingResourceIds: [],
    };
  }
  return {
    decision: "NOT_NEEDED",
    reason: "No clear child-facing or teacher tool printable improves this activity.",
    type: null,
    title: "",
    contents: [],
    purpose: "",
    existingResourceIds: [],
  };
}

function songsByWeekday(plan, draft) {
  const week = draft?.week || {};
  const songs = schema.asArray(week.songs).length ? schema.asArray(week.songs) : schema.asArray(plan?.songs);
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const byDay = {};
  days.forEach((d) => { byDay[d] = []; });
  songs.forEach((song) => {
    const day = schema.text(song.linkedWeekday || song.suggestedWeekday || song.day, 20).toLowerCase();
    if (byDay[day]) byDay[day].push(song);
    else if (!day) {
      // Unassigned — count toward week coverage, not a specific day
      byDay._unassigned = byDay._unassigned || [];
      byDay._unassigned.push(song);
    }
  });
  return days.map((day) => {
    const list = byDay[day] || [];
    if (list.length) {
      return schema.normalizeFieldDecision({
        field: `song.${day}`,
        label: day.charAt(0).toUpperCase() + day.slice(1),
        decision: "KEEP",
        reason: `${list.length} song(s) linked.`,
        preview: schema.text(list[0].title, 120),
      });
    }
    // If the week has several unassigned songs, do not mark every day MISSING harshly
    const unassigned = byDay._unassigned || [];
    if (unassigned.length >= 3) {
      return schema.normalizeFieldDecision({
        field: `song.${day}`,
        label: day.charAt(0).toUpperCase() + day.slice(1),
        decision: "IMPROVE",
        reason: "Songs exist for the week but are not day-linked.",
        preview: "",
      });
    }
    return schema.normalizeFieldDecision({
      field: `song.${day}`,
      label: day.charAt(0).toUpperCase() + day.slice(1),
      decision: "MISSING",
      reason: "No song linked for this weekday.",
      preview: "",
    });
  });
}

function summarizeDecisions(items, key = "decision") {
  const counts = {};
  items.forEach((item) => {
    const d = item[key] || item.decision || "KEEP";
    counts[d] = (counts[d] || 0) + 1;
  });
  return counts;
}

function recommendedFutureActions(audit) {
  const actions = [];
  const push = (type, reason, meta = {}) => {
    actions.push({
      type,
      status: "planned",
      executableInPhase1: schema.isPhase1Executable(type),
      mutation: schema.isMutationAction(type),
      reason,
      ...meta,
    });
  };

  push("lesson.audit", "Completed in this job.", { status: "success" });
  push("teachingKit.score", "Re-score after any future edits.");
  push("asset.plan", "Asset plan captured for images/printables.");

  const weeklyNeeds = (audit.weeklyContent || []).filter((f) => !["KEEP"].includes(f.decision));
  if (weeklyNeeds.length) {
    push("lesson.updateFields", `Upgrade ${weeklyNeeds.length} weekly field(s).`, {
      fields: weeklyNeeds.map((f) => f.field),
    });
  }
  const weakActs = (audit.activityClassifications || []).filter((a) => a.decision !== "KEEP");
  if (weakActs.length) {
    push("activity.update", `Improve ${weakActs.length} activity(ies).`, {
      activityIds: weakActs.map((a) => a.activityId),
    });
  }
  const songGaps = (audit.songs || []).filter((s) => s.decision === "MISSING" || s.decision === "FILL");
  if (songGaps.length) {
    push("song.upsert", `Add or day-link songs for ${songGaps.length} weekday gap(s).`);
  }
  if ((audit.books?.decision && audit.books.decision !== "KEEP")) {
    push("book.upsert", audit.books.reason || "Improve book coverage.");
  }
  const imagesToGen = (audit.assetPlan || []).filter((a) => a.image.decision === "GENERATE" || a.image.decision === "REPLACE");
  if (imagesToGen.length) {
    push("image.generate", `Generate ${imagesToGen.length} justified activity image(s).`, {
      count: imagesToGen.length,
    });
    push("image.upload", "Upload generated images through enrichment media.");
    push("image.attachToActivity", "Attach by exact activity ID after verify.");
  }
  const printCreate = (audit.assetPlan || []).filter((a) => ["CREATE", "REPLACE"].includes(a.printable.decision));
  if (printCreate.length) {
    push("printable.plan", `Plan ${printCreate.length} activity-driven printable(s).`);
    push("printable.generatePages", "Generate pages from validated printable specs.");
    push("printable.buildPdf", "Assemble PDF with correct filename.");
    push("printable.upload", "Upload via existing tk-printable pipeline.");
    push("printable.attach", "Link resource IDs to lesson/activity.");
    push("printable.verify", "Verify stored file, preview, and download.");
  }
  push("lesson.validate", "Re-load and validate before Ready for Review.");
  push("lesson.saveDraft", "Save as enrichment draft only (future phase).");
  // publish intentionally omitted from recommended execution until Phase 8
  return actions;
}

function estimateJobScope(audit) {
  const weeklyNeeds = (audit.weeklyContent || []).filter((f) => f.decision !== "KEEP").length;
  const activitiesNeedingWork = (audit.activityClassifications || []).filter((a) => a.decision !== "KEEP").length;
  const imagesLikely = (audit.assetPlan || []).filter((a) => ["GENERATE", "REPLACE"].includes(a.image.decision)).length;
  const printablesLikely = (audit.assetPlan || []).filter((a) => ["CREATE", "REPLACE"].includes(a.printable.decision)).length;
  const imagesKeep = (audit.assetPlan || []).filter((a) => a.image.decision === "KEEP_EXISTING").length;
  const printablesKeep = (audit.assetPlan || []).filter((a) => a.printable.decision === "KEEP_EXISTING").length;
  return {
    lessonFieldsNeedingWork: weeklyNeeds,
    activitiesNeedingWork,
    imagesLikelyNeeded: imagesLikely,
    imagesKeep,
    printablesLikelyNeeded: printablesLikely,
    printablesKeep,
    songGaps: (audit.songs || []).filter((s) => s.decision === "MISSING").length,
    note: "Estimates only — Phase 1 does not generate assets or mutate lessons.",
  };
}

/**
 * Full read-only audit for one lesson.
 */
function auditLesson(plan, curriculum = {}, options = {}) {
  const enrichment = loadEnrichment();
  const teacher = loadTeacher();
  const quality = loadQuality();
  const standards = loadStandards();
  const ownerWs = loadOwnerWorkspace();
  const resources = schema.asArray(curriculum.resources);
  const activities = schema.asArray(curriculum.activities).filter((a) => a.lessonPlanId === plan.id);
  const draft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? plan.enrichmentDraft
    : {};
  const draftActs = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
  const flat = enrichment?.flattenLessonActivities
    ? enrichment.flattenLessonActivities(plan, activities)
    : activities;

  const weeklyContent = classifyWeeklyFields(plan, draft);
  const activityClassifications = flat.map((act) => {
    const key = schema.text(act.id || act.itemId);
    return classifyActivity(act, draftActs[key] || {});
  });

  const linkedByActivity = new Map();
  const planResourceIds = new Set(schema.asArray(plan.resourceIds).map(String));
  const planResources = resources.filter((r) => planResourceIds.has(String(r.id))
    || String(r.lessonPlanId || "") === String(plan.id));
  planResources.forEach((r) => {
    const actId = schema.text(r.activityId, 160);
    if (!actId) return;
    if (!linkedByActivity.has(actId)) linkedByActivity.set(actId, []);
    linkedByActivity.get(actId).push(r);
  });

  const assetPlan = flat.map((act) => {
    const key = schema.text(act.id || act.itemId);
    const patch = draftActs[key] || {};
    const image = planImageDecision(act, patch);
    const printable = planPrintableDecision(act, patch, linkedByActivity.get(key) || []);
    return schema.normalizeAssetPlanItem({
      activityId: key,
      activityTitle: act.title,
      weekday: act.dayOfWeek,
      image,
      printable,
    });
  });

  // Lesson-level printable recommendations for orphan/generic resources
  const lessonPrintableNotes = planResources.map((r) => {
    const title = schema.text(r.title, 180);
    if (GENERIC_PRINTABLE_RE.test(title)) {
      return {
        resourceId: r.id,
        title,
        decision: "REPLACE",
        reason: "Generic sign-style printable; prefer activity-driven packs.",
      };
    }
    return {
      resourceId: r.id,
      title,
      decision: "KEEP_EXISTING",
      reason: "Existing lesson resource.",
    };
  });

  const songs = songsByWeekday(plan, draft);
  const booksList = schema.asArray(draft.week?.books).length
    ? schema.asArray(draft.week.books)
    : schema.asArray(plan.books);
  let booksDecision = { decision: "FILL", reason: "No books listed." };
  if (booksList.length) {
    const withGuide = booksList.filter((b) => schema.text(b.whyThisBook)
      || schema.asArray(b.beforeReadingQuestions).length
      || schema.asArray(b.afterReadingQuestions).length
      || schema.text(b.notes)).length;
    booksDecision = withGuide
      ? { decision: "KEEP", reason: `${booksList.length} book(s); ${withGuide} with teacher guidance.` }
      : { decision: "IMPROVE", reason: `${booksList.length} book(s) listed but guidance is thin.` };
  }

  let completeness = null;
  if (teacher?.analyzeLessonCompleteness) {
    completeness = teacher.analyzeLessonCompleteness(plan, flat, draft, { resources });
  }

  let qualityEval = null;
  try {
    if (quality?.evaluateTeachingKit) {
      qualityEval = quality.evaluateTeachingKit(plan, flat, draft, { resources });
    }
  } catch (_e) {
    qualityEval = null;
  }

  let standardsAudit = null;
  try {
    if (standards?.auditLessonPlanAgainstStandards) {
      standardsAudit = standards.auditLessonPlanAgainstStandards(plan);
    }
  } catch (_e) {
    standardsAudit = null;
  }

  let trueBlockers = [];
  try {
    if (ownerWs?.collectTruePublishBlockers) {
      trueBlockers = ownerWs.collectTruePublishBlockers(plan, flat) || [];
    }
  } catch (_e) {
    trueBlockers = [];
  }

  const completionPercent = enrichment?.computeCompletionPercent
    ? enrichment.computeCompletionPercent(plan, flat, draft)
    : 0;

  const blockers = [];
  schema.asArray(trueBlockers).forEach((b) => {
    blockers.push({ source: "true_blocker", message: schema.text(b.message || b.code || b, 300) });
  });
  schema.asArray(qualityEval?.blockingIssues || qualityEval?.report?.blockingIssues).forEach((b) => {
    blockers.push({
      source: "quality",
      message: schema.text(b.message || b.detail || b.code || b, 300),
    });
  });
  schema.asArray(standardsAudit?.issues)
    .filter((i) => i.severity === "critical" || i.severity === "high")
    .slice(0, 20)
    .forEach((i) => {
      blockers.push({ source: "standards", message: schema.text(i.detail || i.code, 300) });
    });

  const activityCounts = summarizeDecisions(activityClassifications);
  const imageCounts = summarizeDecisions(assetPlan.map((a) => ({ decision: a.image.decision })));
  const printableCounts = summarizeDecisions(assetPlan.map((a) => ({ decision: a.printable.decision })));

  const needsWork = weeklyContent.some((f) => f.decision !== "KEEP")
    || activityClassifications.some((a) => a.decision !== "KEEP")
    || blockers.length > 0
    || (qualityEval?.blocksPublish === true);

  const statusLabel = !needsWork && completionPercent >= 90 && !qualityEval?.blocksPublish
    ? "Ready for Owner Review (audit only — not published)"
    : blockers.length
      ? "Needs Changes"
      : "Needs Changes";

  const audit = {
    lessonId: plan.id,
    title: schema.text(plan.title, 180),
    theme: schema.text(plan.theme, 120),
    age: schema.text(plan.age, 80),
    accessPlan: plan.plan === "Pro" ? "Pro" : "Free",
    status: schema.text(plan.status, 40),
    currentStatus: statusLabel,
    scores: {
      completionPercent: Math.round(Number(completionPercent) || 0),
      premiumReadinessPercent: Math.round(Number(qualityEval?.premiumReadinessPercent) || Number(completionPercent) || 0),
      qualityScore: Math.round(Number(qualityEval?.report?.overallScore || qualityEval?.summary?.overallScore) || 0),
      blocksPublish: Boolean(qualityEval?.blocksPublish),
      publishReadiness: schema.text(qualityEval?.publishReadiness, 40),
    },
    weeklyContent,
    activities: {
      total: flat.length,
      strong: activityCounts.KEEP || 0,
      incomplete: (activityCounts.FILL || 0) + (activityCounts.MISSING || 0),
      weakGeneric: (activityCounts.IMPROVE || 0) + (activityCounts.REPLACE || 0),
      classifications: activityClassifications,
    },
    activityClassifications,
    songs,
    books: schema.normalizeFieldDecision({
      field: "books",
      label: "Books",
      decision: booksDecision.decision,
      reason: booksDecision.reason,
      preview: booksList.map((b) => b.title).filter(Boolean).slice(0, 5).join(", "),
    }),
    images: imageCounts,
    printables: {
      counts: printableCounts,
      lessonResources: lessonPrintableNotes,
    },
    assetPlan,
    teachingKitBlockers: blockers,
    completenessSections: schema.asArray(completeness?.sections).map((s) => ({
      id: s.id,
      label: s.label,
      status: s.status,
      detail: s.detail,
    })),
    standardsIssueCount: schema.asArray(standardsAudit?.issues).length,
    verification: null,
  };

  audit.estimatedJobScope = estimateJobScope(audit);
  audit.recommendedFutureActions = recommendedFutureActions(audit);
  audit.phase1 = {
    mutationsApplied: false,
    published: false,
    note: "Audit and production plan only. No curriculum data was changed.",
  };
  return audit;
}

/**
 * Post-read verification: confirm the audit reflects the same lesson identity/load.
 */
function verifyAuditAgainstPlan(plan, audit) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  pass(plan && plan.id === audit.lessonId, "lesson_id", "Lesson ID matches audit target.");
  pass(schema.text(plan?.title) === schema.text(audit.title), "title", "Title matches loaded lesson.");
  pass((plan.plan === "Pro" ? "Pro" : "Free") === audit.accessPlan, "access_plan", "Access plan unchanged in audit.");
  pass(Array.isArray(audit.weeklyContent) && audit.weeklyContent.length > 0, "weekly_fields", "Weekly field decisions present.");
  pass(Array.isArray(audit.assetPlan), "asset_plan", "Asset plan present for future image/printable phases.");
  pass(audit.phase1?.mutationsApplied === false, "no_mutations", "Phase 1 recorded no mutations.");
  pass(audit.phase1?.published === false, "not_published", "Phase 1 did not publish.");
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    failed,
    reloadedLessonId: plan?.id || null,
  };
}

module.exports = {
  auditLesson,
  verifyAuditAgainstPlan,
  classifyTextField,
  classifyWeeklyFields,
  classifyActivity,
  planImageDecision,
  planPrintableDecision,
  recommendedFutureActions,
  estimateJobScope,
};
