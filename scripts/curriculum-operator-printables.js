/**
 * AI Curriculum Operator — Phase 4 printables only.
 *
 * Inspect → KEEP/CREATE/REPLACE/REMOVE/NOT_NEEDED → spec → generate pages
 * (pdf-lib) → validate → upload via trusted curriculum resource path → link
 * lesson (+ activity association in draft) → reload → verify.
 *
 * Never publishes. Never creates lessons. Never mutates activity images.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const PRINTABLE_WRITE = Object.freeze(["CREATE", "REPLACE"]);
const BRAND_FOOTER = "littlelearnershubbyleah.com";
const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
/** Soft per-lesson printable pack budget — ordinary finish must self-budget to this, not SCOPE_REVIEW. */
const SOFT_PRINTABLE_PACKS_PER_LESSON = 5;
/** Soft page budget = pack soft max × this multiplier (existing assessPrintableScope formula). */
const SOFT_PRINTABLE_PAGES_PER_PACK = 6;
const PRINTABLE_BUDGET_DEFER_REASON = "printable_budget_priority";
const PRINTABLE_IMPORTANCE = Object.freeze({
  REQUIRED: "REQUIRED",
  HIGH_VALUE: "HIGH_VALUE",
  OPTIONAL: "OPTIONAL",
  NOT_NEEDED: "NOT_NEEDED",
});

function text(value, max = 2000) {
  return schema.text(value, max);
}

function softPrintablePackBudget(lessonCount = 1) {
  const n = Math.max(1, Number(lessonCount) || 1);
  return Math.max(SOFT_PRINTABLE_PACKS_PER_LESSON, n * SOFT_PRINTABLE_PACKS_PER_LESSON);
}

function softPrintablePageBudget(lessonCount = 1) {
  return softPrintablePackBudget(lessonCount) * SOFT_PRINTABLE_PAGES_PER_PACK;
}

/**
 * True when the owner explicitly asked for above-soft full printable coverage.
 * Normal create/finish must NOT set this — those self-budget instead of SCOPE_REVIEW.
 */
function commandRequestsFullPrintableCoverage(command) {
  const raw = text(command?.rawCommand || command?.command?.rawCommand || "", 2000);
  if (!raw) return false;
  return /\b(printable|print\s*pack)s?\s+for\s+(all|every|each)\b/i.test(raw)
    || /\b(all|every|each)\s+(\d+\s+)?activit(y|ies).{0,40}\b(printable|print\s*pack)/i.test(raw)
    || /\bgenerate\s+(a\s+)?(printable|print\s*pack)\s+for\s+all\b/i.test(raw)
    || /\bprintable\s+pack\s+for\s+(all|every)\b/i.test(raw);
}

function printableActionPageCount(action) {
  const fromSpec = Number(action?.spec?.pageCount);
  if (Number.isFinite(fromSpec) && fromSpec > 0) return Math.floor(fromSpec);
  const pages = schema.asArray(action?.spec?.pages).length;
  return Math.max(1, pages || 1);
}

function printableCandidateId(action, index = 0) {
  const activityId = text(action?.activityId, 160);
  if (activityId) return activityId;
  const existing = text(
    action?.spec?.printableIdIfExisting || schema.asArray(action?.spec?.existingResourceIds)[0],
    160,
  );
  if (existing) return `resource:${existing}`;
  return `printable-candidate-${index}`;
}

/**
 * Conservative REQUIRED: only when the activity is designed around child-facing
 * pieces that cannot reasonably run without the printable (card/mat activities).
 * Dramatic-play props “benefit from” printables → HIGH_VALUE, not REQUIRED.
 * Do not mark everything REQUIRED — optional over-planning must self-budget.
 */
function printableImportance(action) {
  const decision = normalizePrintableDecision(action?.decision);
  if (decision === "KEEP" || decision === "NOT_NEEDED" || decision === "REMOVE") {
    return PRINTABLE_IMPORTANCE.NOT_NEEDED;
  }
  const type = text(action?.spec?.resourceType || action?.spec?.type, 40).toLowerCase();
  const reason = text(action?.reason || action?.spec?.reason || action?.spec?.purpose, 600).toLowerCase();
  const title = text(action?.activityTitle || action?.spec?.title, 180).toLowerCase();
  const blob = `${type} ${reason} ${title}`;

  if (/counting_mats|matching_cards|sorting_cards|sequencing_cards/.test(type)
    || /needs usable pieces|card\/sorting\/matching activity needs/i.test(blob)) {
    return PRINTABLE_IMPORTANCE.REQUIRED;
  }
  if (decision === "REPLACE" && /generic|zone\/sign|filler|weak/i.test(blob)) {
    return PRINTABLE_IMPORTANCE.HIGH_VALUE;
  }
  if (/dramatic_play/.test(type)
    || /dramatic play benefits from props|menus?, tickets?, food cards/i.test(blob)
    || /picture_cards|visual|teacher.?use|prompt card|sequence|accessibility/i.test(blob)
    || /picture_cards/.test(type)) {
    return PRINTABLE_IMPORTANCE.HIGH_VALUE;
  }
  if (decision === "REPLACE") return PRINTABLE_IMPORTANCE.HIGH_VALUE;
  return PRINTABLE_IMPORTANCE.OPTIONAL;
}

/**
 * Lower number = higher priority. Deterministic; no randomness.
 * Aligns with: required → shared/visual → high-value teacher cards → reusable → optional.
 */
function printableWritePriorityScore(action, activity = {}) {
  const decision = normalizePrintableDecision(action?.decision);
  const importance = printableImportance(action);
  const type = text(action?.spec?.resourceType || action?.spec?.type, 40).toLowerCase();
  const reason = text(action?.reason || action?.spec?.reason, 600);
  const title = text(action?.activityTitle || activity?.title, 180);
  const category = text(activity?.activityCategory || activity?.domain, 80);
  const blob = `${title} ${category} ${type} ${reason}`.toLowerCase();
  const multiActivity = schema.asArray(action?.spec?.activityIds).filter(Boolean).length > 1;

  if (decision === "REPLACE") {
    if (/generic|zone|sign|filler|weak/i.test(reason) || /generic|zone|sign/i.test(blob)) return 1;
    return 2;
  }
  if (!PRINTABLE_WRITE.includes(decision)) return 99;

  if (importance === PRINTABLE_IMPORTANCE.REQUIRED) {
    return multiActivity ? 3 : 4;
  }
  if (multiActivity) return 5;
  if (importance === PRINTABLE_IMPORTANCE.HIGH_VALUE) {
    if (/sequenc|match|sort|count|visual|accessibility|dramatic_play/i.test(blob)) return 6;
    return 7;
  }
  return 8;
}

/**
 * Apply soft pack + page budgets to planned printable CREATE/REPLACE actions.
 * KEEP / REMOVE / existing NOT_NEEDED unchanged. Excess optional writes → NOT_NEEDED
 * with typed reason printable_budget_priority. REQUIRED over soft budget is not silently cut.
 */
function applyPrintableGenerationSoftBudget(actions, options = {}) {
  const list = schema.asArray(actions).map((a) => ({ ...a }));
  const softPackMax = Math.max(0, Number(options.softPackMax) || softPrintablePackBudget(options.lessonCount || 1));
  const softPageMax = Math.max(0, Number(options.softPageMax) || softPrintablePageBudget(options.lessonCount || 1));
  const activityOrder = new Map(
    schema.asArray(options.activities).map((a, index) => [text(a.id || a.itemId, 160), index]),
  );
  const byId = new Map(
    schema.asArray(options.activities).map((a) => [text(a.id || a.itemId, 160), a]),
  );
  const originalActions = schema.asArray(actions);

  const writeIndexes = [];
  list.forEach((action, index) => {
    if (PRINTABLE_WRITE.includes(normalizePrintableDecision(action.decision))) writeIndexes.push(index);
  });

  const ranked = writeIndexes
    .map((index) => {
      const action = list[index];
      const id = printableCandidateId(action, index);
      const activity = byId.get(text(action.activityId, 160)) || {};
      const importance = printableImportance(action);
      return {
        index,
        candidateId: id,
        activityId: text(action.activityId, 160),
        priority: printableWritePriorityScore(action, activity),
        importance,
        pages: printableActionPageCount(action),
        order: activityOrder.has(text(action.activityId, 160))
          ? activityOrder.get(text(action.activityId, 160))
          : 9999,
        idKey: id,
      };
    })
    .sort((a, b) => (
      a.priority - b.priority
      || a.order - b.order
      || String(a.idKey).localeCompare(String(b.idKey))
      || a.index - b.index
    ));

  const requiredRows = ranked.filter((row) => row.importance === PRINTABLE_IMPORTANCE.REQUIRED);
  const requiredPackCount = requiredRows.length;
  const requiredPageCount = requiredRows.reduce((sum, row) => sum + row.pages, 0);
  const requiredOverBudget = requiredPackCount > softPackMax || requiredPageCount > softPageMax;

  const selected = [];
  const deferred = [];
  let packUsed = 0;
  let pageUsed = 0;

  if (requiredOverBudget) {
    // Do not silently drop REQUIRED — caller should SCOPE_REVIEW.
    ranked.forEach((row) => selected.push(row));
  } else {
    ranked.forEach((row) => {
      const nextPacks = packUsed + 1;
      const nextPages = pageUsed + row.pages;
      if (nextPacks <= softPackMax && nextPages <= softPageMax) {
        selected.push(row);
        packUsed = nextPacks;
        pageUsed = nextPages;
      } else {
        deferred.push(row);
      }
    });
  }

  const selectedIds = selected.map((row) => row.candidateId);
  const deferredIds = deferred.map((row) => row.candidateId);
  const requiredIds = requiredRows.map((row) => row.candidateId);
  const reasonByCandidateId = {};

  deferred.forEach((row) => {
    const action = list[row.index];
    const priorDecision = normalizePrintableDecision(action.decision);
    list[row.index] = {
      ...action,
      decision: "NOT_NEEDED",
      priorDecision,
      priorityScore: row.priority,
      printableImportance: row.importance,
      reason: `${PRINTABLE_BUDGET_DEFER_REASON}: deferred optional ${priorDecision} (priority ${row.priority}, ${row.pages}p) to respect soft printable budget ${softPackMax} packs / ${softPageMax} pages.`,
      budgetDeferred: true,
      spec: action.spec ? { ...action.spec, decision: "NOT_NEEDED" } : action.spec,
    };
    reasonByCandidateId[row.candidateId] = PRINTABLE_BUDGET_DEFER_REASON;
  });
  selected.forEach((row) => {
    list[row.index] = {
      ...list[row.index],
      priorityScore: row.priority,
      printableImportance: row.importance,
      budgetSelected: true,
    };
    reasonByCandidateId[row.candidateId] = text(list[row.index].reason, 200) || "selected";
  });

  const plannedBefore = writeIndexes.length;
  const pageEstimateBeforeAccurate = writeIndexes.reduce((sum, index) => (
    sum + printableActionPageCount(originalActions[index])
  ), 0);
  const finalCreateCount = list.filter((a) => normalizePrintableDecision(a.decision) === "CREATE").length;
  const finalReplaceCount = list.filter((a) => normalizePrintableDecision(a.decision) === "REPLACE").length;
  const finalNotNeededCount = list.filter((a) => normalizePrintableDecision(a.decision) === "NOT_NEEDED").length;
  const finalKeepCount = list.filter((a) => normalizePrintableDecision(a.decision) === "KEEP").length;
  const finalPackCount = finalCreateCount + finalReplaceCount;
  const finalEstimatedPageCount = list
    .filter((a) => PRINTABLE_WRITE.includes(normalizePrintableDecision(a.decision)))
    .reduce((sum, a) => sum + printableActionPageCount(a), 0);

  return {
    actions: list,
    diagnostics: {
      printableCandidatesTotal: plannedBefore,
      printableSoftPackBudget: softPackMax,
      printableSoftPageBudget: softPageMax,
      plannedPackCountBeforeBudget: plannedBefore,
      estimatedPageCountBeforeBudget: pageEstimateBeforeAccurate,
      requiredPrintableCandidateIds: requiredIds,
      selectedPrintableCandidateIds: selectedIds,
      deferredPrintableCandidateIds: deferredIds,
      consolidatedPrintableCandidateIds: [],
      finalPackCount,
      finalEstimatedPageCount,
      finalCreateCount,
      finalReplaceCount,
      finalKeepCount,
      finalNotNeededCount,
      printableBudgetApplied: deferred.length > 0,
      printableBudgetReasonByCandidateId: reasonByCandidateId,
      requiredOverBudget,
      explicitScopeOverride: false,
      hardLimitExceeded: false,
    },
    requiredOverBudget,
  };
}

function loadPdfLib() {
  try { return require("pdf-lib"); } catch (_e) { return null; }
}

function loadPdfMerge() {
  try { return require("./teaching-kit-printable-pdf-merge.js"); } catch (_e) { return null; }
}

function normalizePrintableDecision(decision) {
  const key = text(decision, 40).toUpperCase().replace(/\s+/g, "_");
  if (key === "KEEP" || key === "KEEP_EXISTING") return "KEEP";
  if (key === "CREATE") return "CREATE";
  if (key === "REPLACE") return "REPLACE";
  if (key === "REMOVE") return "REMOVE";
  if (key === "NOT_NEEDED" || key === "NOTNEEDED") return "NOT_NEEDED";
  return "NOT_NEEDED";
}

function sanitizePrintableFileName(raw, fallback = "printable-pack.pdf") {
  const base = text(raw || fallback, 180)
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const name = base || "printable-pack";
  return `${name}.pdf`;
}

function titleToFileName(title, lessonTitle) {
  const combined = [lessonTitle, title].filter(Boolean).join(" ");
  return sanitizePrintableFileName(combined);
}

/**
 * Build typed printable specification from audit asset-plan item + activity.
 */
function buildPrintableSpec({
  plan,
  activity,
  planItem,
  decision,
  existingResourceIds = [],
}) {
  const activityId = text(planItem?.activityId || activity?.id, 160);
  const lessonId = text(plan?.id, 160);
  const d = normalizePrintableDecision(decision || planItem?.printable?.decision);
  const purpose = text(planItem?.printable?.purpose || planItem?.printable?.reason, 600);
  const resourceType = text(planItem?.printable?.type, 40) || "other";
  const title = text(planItem?.printable?.title, 180)
    || (d === "CREATE" || d === "REPLACE" ? `${text(activity?.title, 120)} Pack` : "");
  const contents = schema.asArray(planItem?.printable?.contents).map((c) => text(c, 120)).filter(Boolean);
  const ageBand = text(plan?.age || activity?.age, 80);
  const pages = contents.length
    ? contents.map((c, i) => ({
      index: i + 1,
      label: c,
      kind: resourceType,
      intentionalBlank: /handprint|footprint|drawing|writing area/i.test(c),
    }))
    : (d === "CREATE" || d === "REPLACE"
      ? [{ index: 1, label: title || "Activity printable", kind: resourceType, intentionalBlank: false }]
      : []);

  const existingIds = schema.asArray(existingResourceIds).map((id) => text(id, 160)).filter(Boolean);
  const spec = {
    lessonId,
    activityIds: activityId ? [activityId] : [],
    printableIdIfExisting: (d === "REPLACE" || d === "KEEP" || d === "REMOVE")
      ? (text(existingIds[0], 160) || null)
      : null,
    decision: d,
    title,
    resourceType: schema.PRINTABLE_TYPES.includes(resourceType) ? resourceType : "other",
    ageBand,
    purpose: purpose || text(planItem?.printable?.reason, 600),
    teacherUse: text(planItem?.printable?.reason, 400),
    childUse: purpose,
    pageCount: pages.length,
    pages,
    cutRequired: /card|cutout|token|piece/i.test(`${resourceType} ${contents.join(" ")}`),
    laminateRecommended: /card|flash|match|sort/i.test(resourceType),
    filename: titleToFileName(title, plan?.title),
    brandingRequired: true,
    reason: text(planItem?.printable?.reason, 600),
    existingResourceIds: existingIds,
  };
  return spec;
}

function isWeakGenericPrintable(resource) {
  const blob = `${resource?.title || ""} ${resource?.description || ""} ${resource?.resourceType || ""}`;
  return /\b(zone\s*sign|helper\s*sign|giant\s*word|classroom\s*sign|generic|help\/wash|training\s*sign)\b/i.test(blob)
    || /\b(HELP|WASH|TRAINING)\b/.test(String(resource?.title || ""))
      && /\bsign/i.test(blob);
}

function idealPrintableForActivity(activity) {
  try {
    const audit = require("./curriculum-operator-audit.js");
    return audit.planPrintableDecision(activity, {}, []) || null;
  } catch (_e) {
    return null;
  }
}

function validatePrintableSpec(spec, { expectedLessonId, knownActivityIds = [] } = {}) {
  const errors = [];
  if (!spec || typeof spec !== "object") return { ok: false, errors: ["missing_spec"] };
  if (!text(spec.lessonId, 160)) errors.push("missing_lesson_id");
  if (expectedLessonId && text(spec.lessonId, 160) !== text(expectedLessonId, 160)) {
    errors.push("wrong_lesson_id");
  }
  if (!text(spec.purpose, 600) && PRINTABLE_WRITE.includes(normalizePrintableDecision(spec.decision))) {
    errors.push("purpose_required");
  }
  if (PRINTABLE_WRITE.includes(normalizePrintableDecision(spec.decision))) {
    if (!text(spec.title, 180)) errors.push("title_required");
    if (!schema.PRINTABLE_TYPES.includes(text(spec.resourceType, 40))) errors.push("unsupported_type");
    if (!Number(spec.pageCount) || Number(spec.pageCount) < 1 || Number(spec.pageCount) > 24) {
      errors.push("invalid_page_count");
    }
    if (!/\.pdf$/i.test(text(spec.filename, 180))) errors.push("unsafe_filename");
    const acts = schema.asArray(spec.activityIds).map((id) => text(id, 160)).filter(Boolean);
    if (!acts.length) errors.push("missing_activity_id");
    const known = new Set(schema.asArray(knownActivityIds).map((id) => text(id, 160)));
    acts.forEach((id) => {
      if (known.size && !known.has(id)) errors.push(`unknown_activity_id:${id}`);
    });
  }
  return { ok: errors.length === 0, errors };
}

function refinePrintableDecision(planItem, activity, linkedResources = [], options = {}) {
  const base = normalizePrintableDecision(planItem?.printable?.decision || "NOT_NEEDED");
  let decision = base;
  let reason = text(planItem?.printable?.reason, 600);
  let printablePatch = { ...(planItem?.printable || {}) };
  const existingIds = schema.asArray(planItem?.printable?.existingResourceIds)
    .map((id) => text(id, 160))
    .filter(Boolean);

  // Only upgrade KEEP → REPLACE when the *activity-linked* resource is weak filler.
  // Do not let unrelated lesson-level zone signs force REPLACE onto CREATE/NOT_NEEDED.
  if (decision === "KEEP" && options.replaceWeakPrintables === true) {
    const weak = schema.asArray(linkedResources).filter((r) => isWeakGenericPrintable(r));
    if (weak.length) {
      decision = "REPLACE";
      reason = "Existing linked printable looks like generic zone/sign filler.";
      weak.forEach((r) => {
        const key = text(r.id, 160);
        if (key && !existingIds.includes(key)) existingIds.push(key);
      });
    }
  }

  if (decision === "REPLACE") {
    schema.asArray(planItem?.printable?.existingResourceIds).forEach((id) => {
      const key = text(id, 160);
      if (key && !existingIds.includes(key)) existingIds.push(key);
    });
    // Rebuild activity-driven content so REPLACE does not keep "Kitchen Zone Signs" as the pack title.
    const ideal = idealPrintableForActivity(activity);
    const idealDecision = normalizePrintableDecision(ideal?.decision);
    if (idealDecision === "NOT_NEEDED") {
      decision = "REMOVE";
      reason = "Generic printable is not useful for this activity; no replacement pack is needed.";
      printablePatch = {
        ...printablePatch,
        decision: "REMOVE",
        reason,
        purpose: "Remove generic filler that does not support the activity.",
        title: text(planItem?.printable?.title || linkedResources[0]?.title, 180),
        type: null,
        contents: [],
        existingResourceIds: existingIds,
      };
    } else if (idealDecision === "CREATE" && ideal) {
      reason = `${reason} Replacing with activity-driven pack.`;
      printablePatch = {
        ...printablePatch,
        decision: "REPLACE",
        reason,
        purpose: text(ideal.purpose, 600),
        title: text(ideal.title, 180),
        type: ideal.type,
        contents: schema.asArray(ideal.contents),
        existingResourceIds: existingIds,
      };
    }
  }

  const spec = buildPrintableSpec({
    plan: options.plan,
    activity,
    planItem: {
      ...planItem,
      printable: {
        ...printablePatch,
        decision,
        reason,
        existingResourceIds: existingIds,
      },
    },
    decision,
    existingResourceIds: existingIds,
  });

  return {
    activityId: text(planItem?.activityId || activity?.id, 160),
    activityTitle: text(planItem?.activityTitle || activity?.title, 180),
    decision,
    reason: reason || spec.reason,
    spec,
    status: "pending",
  };
}

function buildPrintableActionsFromAudit(plan, activities, audit, curriculum, options = {}) {
  const resources = schema.asArray(curriculum?.resources);
  const planResourceIds = new Set(schema.asArray(plan?.resourceIds).map(String));
  const draftIds = new Set(schema.asArray(plan?.enrichmentDraft?.week?.printableIds).map(String));
  const byId = new Map(schema.asArray(activities).map((a) => [text(a.id, 160), a]));
  const actions = [];

  schema.asArray(audit?.assetPlan).forEach((item) => {
    const activityId = text(item.activityId, 160);
    if (!activityId) return;
    const activity = byId.get(activityId);
    if (!activity) return;
    const linked = resources.filter((r) => {
      const ids = schema.asArray(r.lessonPlanIds).map(String);
      return planResourceIds.has(String(r.id)) || draftIds.has(String(r.id)) || ids.includes(String(plan.id));
    });
    // Prefer resources that mention this activity in description (operator association)
    const activityLinked = linked.filter((r) => String(r.description || "").includes(activityId)
      || String(r.activityId || "") === activityId);
    // Pass only activity-linked resources into refine so lesson-level orphans
    // do not override CREATE/NOT_NEEDED. Orphans are handled below as REMOVE.
    actions.push(refinePrintableDecision(item, activity, activityLinked, {
      ...options,
      plan,
    }));
  });

  // Lesson-level weak/generic orphans (no activityId association): REMOVE, do not
  // invent a second random sign pack.
  const claimed = new Set();
  actions.forEach((a) => {
    schema.asArray(a.spec?.existingResourceIds).forEach((id) => claimed.add(String(id)));
    if (a.spec?.printableIdIfExisting) claimed.add(String(a.spec.printableIdIfExisting));
  });
  const lessonResources = resources.filter((r) => {
    const ids = schema.asArray(r.lessonPlanIds).map(String);
    return planResourceIds.has(String(r.id)) || draftIds.has(String(r.id)) || ids.includes(String(plan.id));
  });
  lessonResources.forEach((r) => {
    const rid = text(r.id, 160);
    if (!rid || claimed.has(rid)) return;
    if (!isWeakGenericPrintable(r)) return;
    // Skip if any activity already owns this id via Operator activityId=
    const owned = schema.asArray(activities).some((a) => String(r.description || "").includes(String(a.id))
      || String(r.activityId || "") === String(a.id));
    if (owned) return;
    actions.push({
      activityId: "",
      activityTitle: "Lesson-level printable",
      decision: "REMOVE",
      reason: "Generic lesson-level printable (zone/sign filler) does not support a specific activity.",
      spec: {
        lessonId: text(plan.id, 160),
        activityIds: [],
        printableIdIfExisting: rid,
        decision: "REMOVE",
        title: text(r.title, 180),
        resourceType: "other",
        ageBand: text(plan.age, 80),
        purpose: "Remove generic filler that does not help teachers run an activity.",
        teacherUse: "Do not print.",
        childUse: "",
        pageCount: 0,
        pages: [],
        cutRequired: false,
        laminateRecommended: false,
        filename: sanitizePrintableFileName(text(r.fileName, 120) || "remove.pdf"),
        brandingRequired: false,
        reason: "Generic zone/sign-style resource.",
        existingResourceIds: [rid],
      },
      status: "pending",
    });
    claimed.add(rid);
  });

  return actions;
}

function summarizePrintableActions(actions) {
  const counts = {
    KEEP: 0, CREATE: 0, REPLACE: 0, REMOVE: 0, NOT_NEEDED: 0,
    FAILED: 0, SUCCESS: 0, BLOCKED: 0, NEEDS_REVISION: 0,
  };
  schema.asArray(actions).forEach((a) => {
    const d = normalizePrintableDecision(a.decision);
    if (counts[d] != null) counts[d] += 1;
    if (a.status === "failed") counts.FAILED += 1;
    if (a.status === "blocked" || a.code === "BLOCKED") counts.BLOCKED += 1;
    if (a.status === "needs_revision" || a.code === "NEEDS_REVISION") counts.NEEDS_REVISION += 1;
    if (a.status === "success" && PRINTABLE_WRITE.includes(d)) counts.SUCCESS += 1;
  });
  return counts;
}

function plannedPrintableWriteCount(actions) {
  return schema.asArray(actions)
    .filter((a) => PRINTABLE_WRITE.includes(normalizePrintableDecision(a.decision)))
    .length;
}

function assessPrintableScope({ actions, lessonCount = 1, limits = {} }) {
  const planned = plannedPrintableWriteCount(actions);
  const hardMax = Number(limits.maxPrintableGenerations) || schema.DEFAULT_LIMITS.maxPrintableGenerations;
  const softMax = softPrintablePackBudget(lessonCount);
  const softPageMax = softPrintablePageBudget(lessonCount);
  const pageEstimate = schema.asArray(actions)
    .filter((a) => PRINTABLE_WRITE.includes(normalizePrintableDecision(a.decision)))
    .reduce((sum, a) => sum + printableActionPageCount(a), 0);
  if (planned > hardMax) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Planned ${planned} printable packs exceeds hard max ${hardMax}.`,
      planned,
      hardMax,
      softMax,
      softPageMax,
      pageEstimate,
    };
  }
  if (planned > softMax || pageEstimate > softPageMax) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Planned ${planned} packs / ~${pageEstimate} pages exceeds soft budget for ${lessonCount} lesson(s).`,
      planned,
      hardMax,
      softMax,
      softPageMax,
      pageEstimate,
    };
  }
  return { ok: true, planned, hardMax, softMax, softPageMax, pageEstimate };
}

function drawFooter(page, font, size = 9) {
  page.drawText(BRAND_FOOTER, {
    x: 36,
    y: 28,
    size,
    font,
  });
}

function pageHasRichOperatorContent(pageMeta) {
  return Boolean(
    schema.asArray(pageMeta?.items).length
    || schema.asArray(pageMeta?.pairs).length
    || schema.asArray(pageMeta?.categories).length
    || schema.asArray(pageMeta?.numbers).length
    || pageMeta?.intentionalBlank === true
    || text(pageMeta?.workAreaLabel, 80),
  );
}

/**
 * Classify render path for a printable spec.
 * GENERIC_FALLBACK is forbidden for Operator CREATE/REPLACE success.
 */
function classifyPrintableRenderPath(spec, { operatorWrite = false } = {}) {
  const pages = schema.asArray(spec?.pages);
  if (!pages.length) {
    return { path: "GENERIC_FALLBACK", ok: false, reason: "no_pages" };
  }
  const thinIndexes = [];
  pages.forEach((p, i) => {
    if (!pageHasRichOperatorContent(p)) thinIndexes.push(i + 1);
  });
  if (thinIndexes.length) {
    return {
      path: "GENERIC_FALLBACK",
      ok: false,
      reason: `thin_pages:${thinIndexes.join(",")}`,
      thinIndexes,
    };
  }
  return {
    path: operatorWrite ? "OPERATOR_ENRICHED_RENDER" : "LEGACY_COMPATIBLE_RENDER",
    ok: true,
  };
}

/**
 * Deterministic multi-page PDF from a validated (optionally AI-enriched) spec.
 * CI-safe: no live AI inside the renderer — content must already be on the spec.
 *
 * @param {object} options
 * @param {boolean} [options.forbidGenericFallback=false] When true (Operator CREATE/REPLACE),
 *   thin specs throw instead of rendering Phase 4 generic templates.
 */
async function generatePrintablePdfBuffer({
  spec,
  plan,
  activity,
  forbidGenericFallback = false,
} = {}) {
  const pdfLib = loadPdfLib();
  if (!pdfLib?.PDFDocument) throw new Error("pdf-lib is unavailable for printable generation.");
  const validation = validatePrintableSpec(spec, {
    expectedLessonId: plan?.id,
    knownActivityIds: [activity?.id].filter(Boolean),
  });
  if (!validation.ok) {
    const error = new Error(`Invalid printable spec: ${validation.errors.join(", ")}`);
    error.code = "invalid_spec";
    throw error;
  }

  const renderPath = classifyPrintableRenderPath(spec, { operatorWrite: forbidGenericFallback });
  if (forbidGenericFallback && !renderPath.ok) {
    const error = new Error(
      `GENERIC_FALLBACK forbidden for Operator CREATE/REPLACE (${renderPath.reason}). NO USEFUL SPEC = NO PRINTABLE.`,
    );
    error.code = "GENERIC_FALLBACK_FORBIDDEN";
    error.renderPath = renderPath.path;
    throw error;
  }

  const doc = await pdfLib.PDFDocument.create();
  const font = await doc.embedFont(pdfLib.StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
  const pagesMeta = schema.asArray(spec.pages).length
    ? schema.asArray(spec.pages)
    : Array.from({ length: Number(spec.pageCount) || 1 }, (_, i) => ({
      index: i + 1,
      label: `Page ${i + 1}`,
      kind: spec.resourceType,
    }));

  const age = text(spec.ageBand || plan?.age || activity?.age, 60);
  const materials = text(activity?.materials, 200);
  const teacherUse = text(spec.teacherUse || spec.purpose, 240);
  const imageCache = new Map();

  async function embedItemImage(item) {
    if (!item?.visualPngBase64) return null;
    const key = text(item.visualAssetKey || item.visualPngBase64.slice(0, 32), 80);
    if (imageCache.has(key)) return imageCache.get(key);
    try {
      const bytes = Buffer.from(String(item.visualPngBase64), "base64");
      const embedded = await doc.embedPng(bytes);
      imageCache.set(key, embedded);
      return embedded;
    } catch (_e) {
      return null;
    }
  }

  for (const pageMeta of pagesMeta) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const title = asciiPdfText(spec.title, 100);
    page.drawText(title.slice(0, 70), { x: 36, y: PAGE_HEIGHT - 48, size: 16, font: fontBold });
    page.drawText(`Activity: ${asciiPdfText(activity?.title, 80)}`, { x: 36, y: PAGE_HEIGHT - 70, size: 11, font });
    page.drawText(`Age: ${asciiPdfText(age, 60)}`, { x: 36, y: PAGE_HEIGHT - 86, size: 10, font });
    const pageType = asciiPdfText(pageMeta.type || pageMeta.kind || spec.resourceType, 40);
    page.drawText(`Page ${pageMeta.index || 1} of ${pagesMeta.length} · ${pageType}`, {
      x: 36,
      y: PAGE_HEIGHT - 102,
      size: 10,
      font,
    });

    let y = PAGE_HEIGHT - 128;
    const heading = asciiPdfText(pageMeta.heading || pageMeta.label, 120);
    if (heading) {
      page.drawText(heading.slice(0, 70), { x: 36, y, size: 13, font: fontBold });
      y -= 20;
    }
    if (teacherUse && (pageMeta.index === 1 || pageMeta.index == null)) {
      wrapText(`Teacher: ${teacherUse}`, 78).slice(0, 2).forEach((line) => {
        page.drawText(asciiPdfText(line, 120), { x: 36, y, size: 9, font });
        y -= 12;
      });
      y -= 6;
    }

    const hasRichContent = pageHasRichOperatorContent(pageMeta);

    if (hasRichContent) {
      // eslint-disable-next-line no-await-in-loop
      y = await drawEnrichedPageContent(page, font, fontBold, y, pageMeta, activity, { embedItemImage });
    } else {
      // LEGACY_COMPATIBLE_RENDER only — never reached for Operator CREATE/REPLACE
      // when forbidGenericFallback is true (thrown above).
      const label = text(pageMeta.label || heading, 120);
      const kind = text(pageMeta.kind || spec.resourceType, 40);
      if (/dramatic|menu|order|ticket|recipe/i.test(kind) || /menu|order|ticket|recipe/i.test(label)) {
        y = drawDramaticPlayBlocks(page, font, fontBold, y, label, activity);
      } else if (/match|sort|flash|picture|card|vocab/i.test(kind) || /card|match|sort/i.test(label)) {
        y = drawCardGrid(page, font, fontBold, y, label, activity);
      } else if (/count/i.test(kind) || /count/i.test(label)) {
        y = drawCountingMat(page, font, fontBold, y);
      } else if (/handprint|footprint|art_template/i.test(kind) || pageMeta.intentionalBlank) {
        y = drawIntentionalBlank(page, font, fontBold, y, label);
      } else if (/movement|scavenger/i.test(kind)) {
        y = drawMovementCards(page, font, fontBold, y, activity);
      } else {
        y = drawGenericUsefulPanel(page, font, fontBold, y, label, materials);
      }
    }

    drawFooter(page, font);
    if (y < 48) {
      /* layouts keep content above footer */
    }
  }

  const bytes = Buffer.from(await doc.save());
  return {
    buffer: bytes,
    mimeType: "application/pdf",
    pageCount: pagesMeta.length,
    fileName: sanitizePrintableFileName(spec.filename || titleToFileName(spec.title, plan?.title)),
    title: text(spec.title, 180),
    renderPath: renderPath.path,
  };
}

async function drawEnrichedPageContent(page, font, fontBold, startY, pageMeta, activity, { embedItemImage } = {}) {
  const type = text(pageMeta.type || pageMeta.kind, 40);
  if (type === "matching_pairs" || schema.asArray(pageMeta.pairs).length) {
    return drawMatchingPairs(page, font, fontBold, startY, pageMeta, { embedItemImage });
  }
  if (type === "sorting" || schema.asArray(pageMeta.categories).length) {
    return drawSortingPack(page, font, fontBold, startY, pageMeta, { embedItemImage });
  }
  if (type === "menu") {
    return drawMenuPage(page, font, fontBold, startY, pageMeta);
  }
  if (type === "order_cards") {
    return drawOrderTickets(page, font, fontBold, startY, pageMeta);
  }
  if (type === "counting_mat" || schema.asArray(pageMeta.numbers).length) {
    return drawCountingMatFromSpec(page, font, fontBold, startY, pageMeta);
  }
  if (type === "handprint_template" || type === "footprint_template" || pageMeta.intentionalBlank) {
    return drawIntentionalBlank(
      page,
      font,
      fontBold,
      startY,
      text(pageMeta.workAreaLabel || pageMeta.heading || "Work area", 120),
    );
  }
  if (type === "movement_cards" || type === "scavenger_hunt") {
    return drawItemsAsCards(page, font, fontBold, startY, pageMeta, { columns: 2, height: 100, embedItemImage });
  }
  if (type === "teacher_tool") {
    return drawGenericUsefulPanel(
      page,
      font,
      fontBold,
      startY,
      text(pageMeta.heading, 80),
      schema.asArray(pageMeta.items).map((i) => i.name).join("; "),
    );
  }
  return drawItemsAsCards(page, font, fontBold, startY, pageMeta, { columns: 3, height: 120, embedItemImage });
}

async function drawMatchingPairs(page, font, fontBold, startY, pageMeta, { embedItemImage } = {}) {
  let y = startY;
  page.drawText("Match each pair · cut apart · laminate if desired", { x: 36, y, size: 10, font });
  y -= 18;
  const pairs = schema.asArray(pageMeta.pairs).slice(0, 8);
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    const rowY = y - (i * 78);
    page.drawRectangle({ x: 36, y: rowY - 64, width: 250, height: 64, borderWidth: 1 });
    page.drawText(asciiPdfText(pair.left?.name, 28), { x: 46, y: rowY - 22, size: 12, font: fontBold });
    page.drawText(asciiPdfText(pair.left?.visualConcept, 40).slice(0, 36), { x: 46, y: rowY - 40, size: 8, font });
    if (typeof embedItemImage === "function" && pair.left?.visualPngBase64) {
      // eslint-disable-next-line no-await-in-loop
      const img = await embedItemImage(pair.left);
      if (img) page.drawImage(img, { x: 200, y: rowY - 58, width: 40, height: 40 });
    }
    page.drawText("<->", { x: 292, y: rowY - 30, size: 12, font: fontBold });
    page.drawRectangle({ x: 326, y: rowY - 64, width: 250, height: 64, borderWidth: 1 });
    page.drawText(asciiPdfText(pair.right?.name, 28), { x: 336, y: rowY - 22, size: 12, font: fontBold });
    page.drawText(asciiPdfText(pair.right?.visualConcept, 40).slice(0, 36), { x: 336, y: rowY - 40, size: 8, font });
    if (typeof embedItemImage === "function" && pair.right?.visualPngBase64) {
      // eslint-disable-next-line no-await-in-loop
      const img = await embedItemImage(pair.right);
      if (img) page.drawImage(img, { x: 520, y: rowY - 58, width: 40, height: 40 });
    }
  }
  return y - (Math.min(8, pairs.length) * 78) - 8;
}

function drawSortingPack(page, font, fontBold, startY, pageMeta, { embedItemImage } = {}) {
  let y = startY;
  page.drawText("Sorting mats", { x: 36, y, size: 11, font: fontBold });
  y -= 16;
  const cats = schema.asArray(pageMeta.categories).slice(0, 4);
  cats.forEach((cat, i) => {
    const x = 36 + (i % 4) * 135;
    page.drawRectangle({ x, y: y - 70, width: 125, height: 70, borderWidth: 1 });
    page.drawText(asciiPdfText(cat.name, 16), { x: x + 8, y: y - 24, size: 12, font: fontBold });
    page.drawText("mat", { x: x + 8, y: y - 42, size: 9, font });
  });
  y -= 90;
  page.drawText("Pieces to sort (cut apart)", { x: 36, y, size: 11, font: fontBold });
  y -= 16;
  return drawItemsAsCards(page, font, fontBold, y, {
    ...pageMeta,
    items: schema.asArray(pageMeta.items),
  }, { columns: 3, height: 90, embedItemImage });
}

function drawMenuPage(page, font, fontBold, startY, pageMeta) {
  let y = startY;
  page.drawRectangle({ x: 72, y: 120, width: 468, height: y - 140, borderWidth: 1.5 });
  page.drawText(asciiPdfText(pageMeta.heading || "Menu", 40), { x: 96, y: y - 36, size: 16, font: fontBold });
  let ly = y - 70;
  schema.asArray(pageMeta.items).slice(0, 10).forEach((item, idx) => {
    page.drawText(`${idx + 1}. ${asciiPdfText(item.name, 40)}`, { x: 96, y: ly, size: 12, font: fontBold });
    ly -= 14;
    page.drawText(asciiPdfText(item.visualConcept, 60).slice(0, 55), { x: 110, y: ly, size: 9, font });
    ly -= 22;
  });
  return 110;
}

function drawOrderTickets(page, font, fontBold, startY, pageMeta) {
  let y = startY;
  const tickets = schema.asArray(pageMeta.items).slice(0, 6);
  tickets.forEach((ticket, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 36 + col * 270;
    const boxY = y - row * 150;
    page.drawRectangle({ x, y: boxY - 130, width: 250, height: 130, borderWidth: 1 });
    page.drawText(asciiPdfText(ticket.name, 28), { x: x + 12, y: boxY - 24, size: 12, font: fontBold });
    page.drawText("Order:", { x: x + 12, y: boxY - 48, size: 10, font });
    page.drawText("1. ____________________", { x: x + 12, y: boxY - 68, size: 10, font });
    page.drawText("2. ____________________", { x: x + 12, y: boxY - 88, size: 10, font });
    page.drawText("3. ____________________", { x: x + 12, y: boxY - 108, size: 10, font });
  });
  return y - (Math.ceil(tickets.length / 2) * 150) - 8;
}

function drawCountingMatFromSpec(page, font, fontBold, startY, pageMeta) {
  let y = startY;
  const nums = schema.asArray(pageMeta.numbers).length
    ? schema.asArray(pageMeta.numbers)
    : [1, 2, 3, 4, 5];
  page.drawText("Place objects in each numbered space", { x: 36, y, size: 10, font });
  y -= 20;
  nums.slice(0, 6).forEach((n) => {
    page.drawRectangle({ x: 36, y: y - 70, width: 540, height: 70, borderWidth: 1 });
    page.drawText(String(n), { x: 48, y: y - 42, size: 28, font: fontBold });
    page.drawText("counting spaces", { x: 100, y: y - 38, size: 10, font });
    y -= 84;
  });
  return y;
}

async function drawItemsAsCards(page, font, fontBold, startY, pageMeta, { columns = 3, height = 120, embedItemImage } = {}) {
  let y = startY;
  page.drawText("Cut along boxes · laminate if desired", { x: 36, y, size: 9, font });
  y -= 16;
  const items = schema.asArray(pageMeta.items).slice(0, columns * 4);
  const width = columns === 2 ? 250 : 170;
  const gap = columns === 2 ? 270 : 180;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = 36 + col * gap;
    const boxY = y - row * (height + 12);
    page.drawRectangle({ x, y: boxY - height, width, height, borderWidth: 1 });
    page.drawText(asciiPdfText(item.name, 22).slice(0, 20), { x: x + 10, y: boxY - 22, size: 11, font: fontBold });
    if (item.category) {
      page.drawText(asciiPdfText(item.category, 20), { x: x + 10, y: boxY - 38, size: 8, font });
    }
    page.drawText(asciiPdfText(item.visualConcept, 40).slice(0, 28), { x: x + 10, y: boxY - 56, size: 8, font });
    if (item.prompt) {
      page.drawText(asciiPdfText(item.prompt, 40).slice(0, 28), { x: x + 10, y: boxY - 74, size: 8, font });
    }
    if (typeof embedItemImage === "function" && item.visualPngBase64) {
      // eslint-disable-next-line no-await-in-loop
      const img = await embedItemImage(item);
      if (img) {
        page.drawImage(img, { x: x + 10, y: boxY - height + 12, width: 48, height: 48 });
      } else {
        page.drawText("[picture]", { x: x + 10, y: boxY - height + 16, size: 8, font });
      }
    } else if (text(pageMeta.visualMode, 40) === "generated_asset") {
      // Required embed missing — leave explicit marker; caller should have blocked earlier.
      page.drawText("[missing visual]", { x: x + 10, y: boxY - height + 16, size: 8, font });
    } else {
      page.drawText("[picture]", { x: x + 10, y: boxY - height + 16, size: 8, font });
    }
  }
  const rows = Math.ceil(items.length / columns) || 1;
  return y - rows * (height + 12) - 8;
}

function asciiPdfText(value, max = 200) {
  return text(value, max)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(value, width) {
  const words = String(asciiPdfText(value, 2000) || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((w) => {
    const next = current ? `${current} ${w}` : w;
    if (next.length > width) {
      if (current) lines.push(current);
      current = w;
    } else current = next;
  });
  if (current) lines.push(current);
  return lines.slice(0, 8);
}

function drawDramaticPlayBlocks(page, font, fontBold, startY, label, activity) {
  let y = startY;
  page.drawRectangle({ x: 36, y: y - 160, width: 540, height: 160, borderWidth: 1 });
  page.drawText(label.slice(0, 60), { x: 48, y: y - 24, size: 12, font: fontBold });
  const lines = [
    "Teacher: print, cut if needed, place in the dramatic-play area.",
    `Children use during: ${text(activity?.title, 60)}`,
    "Include: choices children can point to, simple order lines, clear pictures.",
  ];
  let ly = y - 48;
  lines.forEach((line) => {
    page.drawText(line.slice(0, 90), { x: 48, y: ly, size: 10, font });
    ly -= 16;
  });
  // Usable form lines
  for (let i = 0; i < 4; i += 1) {
    page.drawText(`${i + 1}. _______________________________`, { x: 48, y: ly, size: 10, font });
    ly -= 18;
  }
  return ly - 12;
}

function drawCardGrid(page, font, fontBold, startY, label, activity) {
  let y = startY;
  page.drawText("Cut along dashed boxes · laminate if desired", { x: 36, y, size: 10, font });
  y -= 20;
  const labels = [
    text(activity?.title, 28) || "Card A",
    "Match 1",
    "Match 2",
    "Match 3",
    "Match 4",
    "Match 5",
  ];
  let x = 36;
  let rowY = y;
  labels.forEach((lab, i) => {
    if (i && i % 3 === 0) {
      x = 36;
      rowY -= 150;
    }
    page.drawRectangle({ x, y: rowY - 130, width: 170, height: 130, borderWidth: 1 });
    page.drawText(lab.slice(0, 18), { x: x + 10, y: rowY - 24, size: 11, font: fontBold });
    page.drawText(label.slice(0, 22), { x: x + 10, y: rowY - 44, size: 9, font });
    page.drawText("picture area", { x: x + 10, y: rowY - 80, size: 9, font });
    x += 180;
  });
  return rowY - 150;
}

function drawCountingMat(page, font, fontBold, startY) {
  let y = startY;
  page.drawText("Counting mat - place objects in each space", { x: 36, y, size: 11, font: fontBold });
  y -= 24;
  for (let n = 1; n <= 5; n += 1) {
    page.drawRectangle({ x: 36, y: y - 70, width: 540, height: 70, borderWidth: 1 });
    page.drawText(String(n), { x: 48, y: y - 40, size: 28, font: fontBold });
    page.drawText("counting spaces", { x: 100, y: y - 36, size: 10, font });
    y -= 84;
  }
  return y;
}

function drawIntentionalBlank(page, font, fontBold, startY, label) {
  let y = startY;
  page.drawText(label.slice(0, 70), { x: 36, y, size: 12, font: fontBold });
  y -= 20;
  page.drawText("Intentional work area for the child's print / drawing.", { x: 36, y, size: 10, font });
  y -= 16;
  page.drawRectangle({ x: 72, y: 120, width: 468, height: y - 140, borderWidth: 1 });
  return 100;
}

function drawMovementCards(page, font, fontBold, startY, activity) {
  let y = startY;
  const moves = ["Stretch tall", "March in place", "Reach high", "Spin gently", "Balance", "Freeze"];
  moves.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 36 + col * 270;
    const boxY = y - row * 120;
    page.drawRectangle({ x, y: boxY - 100, width: 250, height: 100, borderWidth: 1 });
    page.drawText(m, { x: x + 16, y: boxY - 36, size: 14, font: fontBold });
    page.drawText(text(activity?.title, 30), { x: x + 16, y: boxY - 56, size: 9, font });
  });
  return y - 380;
}

function drawGenericUsefulPanel(page, font, fontBold, startY, label, materials) {
  let y = startY;
  page.drawRectangle({ x: 36, y: y - 200, width: 540, height: 200, borderWidth: 1 });
  page.drawText(label.slice(0, 60), { x: 48, y: y - 28, size: 12, font: fontBold });
  page.drawText("Teacher preparation checklist", { x: 48, y: y - 52, size: 11, font: fontBold });
  const items = [
    materials ? `Materials: ${materials.slice(0, 80)}` : "Gather listed materials",
    "Preview the activity steps",
    "Set out this printable where children can reach it",
    "Invite children to use the printable during the activity",
  ];
  let ly = y - 76;
  items.forEach((item, idx) => {
    page.drawText(`${idx + 1}. ${item.slice(0, 85)}`, { x: 48, y: ly, size: 10, font });
    ly -= 18;
  });
  return ly - 20;
}

async function validateGeneratedPdf(buffer, { expectedPageCount, fileName }) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  pass(Buffer.isBuffer(buffer) && buffer.length > 100, "buffer", "PDF buffer present.");
  pass(/\w.*\.pdf$/i.test(String(fileName || "")),
    "filename", "Filename looks like a readable PDF name.");
  pass(!/^(printable|file\d+|generated-final|resource-\d+)\.pdf$/i.test(String(fileName || "")),
    "filename_quality", "Filename is not a generic placeholder.");

  let pageCount = 0;
  try {
    const merge = loadPdfMerge();
    if (merge?.inspectPdfPages) {
      const inspected = await merge.inspectPdfPages(buffer);
      pageCount = Number(inspected.pageCount) || 0;
      pass(inspected.ok === true, "inspect_ok", "PDF inspect succeeded.");
      pass(pageCount === Number(expectedPageCount), "page_count", `Page count ${pageCount} matches expected ${expectedPageCount}.`);
      pass(pageCount > 0, "not_empty", "PDF is not empty.");
      pass(pageCount === Number(expectedPageCount) && pageCount > 0, "no_missing_pages", "No missing pages vs expected count.");
      const sizes = schema.asArray(inspected.pages);
      pass(sizes.every((p) => p.width >= 500 && p.height >= 700), "letter_size", "Pages look US Letter-ish.");
      const idxs = sizes.map((p) => p.index).filter((n) => n != null);
      if (idxs.length) {
        pass(new Set(idxs).size === idxs.length, "no_duplicate_page_index", "No duplicate page indices.");
      }
    } else {
      const pdfLib = loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(buffer);
      pageCount = doc.getPageCount();
      pass(pageCount === Number(expectedPageCount), "page_count", `Page count ${pageCount} matches expected.`);
      pass(pageCount > 0, "not_empty", "PDF is not empty.");
    }
  } catch (error) {
    pass(false, "inspect_error", text(error?.message || "PDF inspect failed", 200));
  }
  // Reject zero-byte / near-empty "blank" PDFs that somehow pass page count.
  pass(Buffer.isBuffer(buffer) && buffer.length > 400, "not_blank_pdf", "PDF is not an accidental blank stub.");
  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed, pageCount };
}

function bufferToPdfDataUrl(buffer) {
  return `data:application/pdf;base64,${Buffer.from(buffer).toString("base64")}`;
}

function linkPrintableIntoEnrichmentDraft(draftInput, {
  lessonId,
  expectedLessonId,
  activityId,
  resourceId,
  title,
}) {
  if (text(lessonId, 160) !== text(expectedLessonId, 160)) {
    return { ok: false, code: "wrong_lesson_id", error: "Lesson ID mismatch; refuse printable link." };
  }
  const actId = text(activityId, 160);
  const resId = text(resourceId, 160);
  if (!actId) return { ok: false, code: "missing_activity_id", error: "Activity ID required." };
  if (!resId) return { ok: false, code: "missing_resource_id", error: "Resource ID required." };

  const draft = draftInput && typeof draftInput === "object"
    ? JSON.parse(JSON.stringify(draftInput))
    : { week: {}, activities: {} };
  if (!draft.week || typeof draft.week !== "object") draft.week = {};
  if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};
  const ids = schema.asArray(draft.week.printableIds).map((id) => text(id, 160)).filter(Boolean);
  if (!ids.includes(resId)) ids.push(resId);
  draft.week.printableIds = ids.slice(0, 100);
  if (!draft.activities[actId] || typeof draft.activities[actId] !== "object") {
    draft.activities[actId] = {};
  }
  // Association only — do not invent a second storage system.
  draft.activities[actId].relatedPrintableId = resId;
  draft.activities[actId].relatedPrintableTitle = text(title, 180);
  draft.updatedAt = new Date().toISOString();
  draft.operatorPhase = 4;
  return { ok: true, enrichmentDraft: draft };
}

function verifyPrintableJobDraft({
  beforePlan,
  afterPlan,
  actions = [],
  resourcesAfter = [],
}) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  pass(beforePlan?.id && beforePlan.id === afterPlan?.id, "lesson_id", "Lesson ID unchanged.");
  pass(text(beforePlan?.age) === text(afterPlan?.age), "age", "Age unchanged.");
  pass(
    (beforePlan?.plan === "Pro" ? "Pro" : "Free") === (afterPlan?.plan === "Pro" ? "Pro" : "Free"),
    "access_plan",
    "Access plan unchanged.",
  );
  pass(text(beforePlan?.title) === text(afterPlan?.title), "title", "Title unchanged.");
  pass(afterPlan?.status === beforePlan?.status, "publish_status", "Publish status unchanged.");
  pass(
    text(beforePlan?.weeklyOverview, 500) === text(afterPlan?.weeklyOverview, 500),
    "published_weekly_overview",
    "Published weeklyOverview unchanged.",
  );

  // Image fields must not change in Phase 4.
  const beforeActs = beforePlan?.enrichmentDraft?.activities || {};
  const afterActs = afterPlan?.enrichmentDraft?.activities || {};
  const allIds = new Set([...Object.keys(beforeActs), ...Object.keys(afterActs)]);
  allIds.forEach((id) => {
    const b = beforeActs[id] || {};
    const a = afterActs[id] || {};
    pass(
      text(b.setupImageUrl, 500) === text(a.setupImageUrl, 500)
        && text(b.exampleImageUrl, 500) === text(a.exampleImageUrl, 500),
      `images_locked_${id}`,
      `Activity ${id} images unchanged during printable job.`,
    );
  });

  schema.asArray(actions).forEach((action) => {
    const d = normalizePrintableDecision(action.decision);
    if (action.status !== "success" || !PRINTABLE_WRITE.includes(d)) return;
    const resId = text(action.resourceId, 160);
    const resource = schema.asArray(resourcesAfter).find((r) => r.id === resId);
    pass(Boolean(resource), `resource_exists_${resId}`, `Resource ${resId} exists.`);
    if (resource) {
      pass(
        schema.asArray(resource.lessonPlanIds).map(String).includes(String(beforePlan.id))
          || schema.asArray(afterPlan.resourceIds).map(String).includes(String(resId)),
        `resource_linked_${resId}`,
        `Resource linked to lesson ${beforePlan.id}.`,
      );
      pass(text(resource.title, 180) === text(action.spec?.title || action.title, 180)
        || Boolean(text(resource.title, 180)), `resource_title_${resId}`, "Resource has a display title.");
      pass(/\.pdf$/i.test(text(resource.fileName, 180)), `resource_filename_${resId}`, "Resource filename is a PDF.");
      pass(resource.status === "draft" || resource.status === "published", `resource_status_${resId}`, "Resource status is draft/published.");
    }
    const draftIds = schema.asArray(afterPlan?.enrichmentDraft?.week?.printableIds).map(String);
    pass(draftIds.includes(String(resId)), `draft_printableIds_${resId}`, "Draft week.printableIds includes resource.");
    const actPatch = afterActs[text(action.activityId, 160)] || {};
    pass(
      text(actPatch.relatedPrintableId, 160) === resId,
      `activity_link_${action.activityId}`,
      "Activity draft references resource by verified activity ID.",
    );
  });

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed };
}

async function runPrintablePlanForLesson({
  plan,
  activities,
  audit,
  curriculum,
  limits,
  touchPrintables = true,
  replaceWeakPrintables = true,
  createPrintableResource,
  readResourceFile,
  unlinkPrintableResource,
  alreadySucceededKeys = new Set(),
  lessonCount = 1,
  command = null,
  forceFullPrintableCoverage = false,
  saveDraft,
  callAi = null,
  useContentPlanner = true,
  generatePrintableVisual = null,
  visualCache = null,
} = {}) {
  if (touchPrintables === false) {
    return {
      ok: true,
      skipped: true,
      actions: [],
      counts: summarizePrintableActions([]),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      cost: { printablePlannerCalls: 0, printableRevisionCalls: 0, printableVisualGenerations: 0 },
    };
  }

  const rawActions = buildPrintableActionsFromAudit(plan, activities, audit, curriculum, {
    replaceWeakPrintables,
  });
  const softPackMax = softPrintablePackBudget(lessonCount);
  const softPageMax = softPrintablePageBudget(lessonCount);
  const hardMax = Number(limits?.maxPrintableGenerations) || schema.DEFAULT_LIMITS.maxPrintableGenerations;
  const plannedBeforeBudget = plannedPrintableWriteCount(rawActions);
  const pageEstimateBefore = schema.asArray(rawActions)
    .filter((a) => PRINTABLE_WRITE.includes(normalizePrintableDecision(a.decision)))
    .reduce((sum, a) => sum + printableActionPageCount(a), 0);
  const explicitFullCoverage = forceFullPrintableCoverage === true
    || commandRequestsFullPrintableCoverage(command);

  // Explicit owner request for above-soft full coverage still requires scope review.
  if (explicitFullCoverage && (plannedBeforeBudget > softPackMax || pageEstimateBefore > softPageMax)) {
    const scope = assessPrintableScope({
      actions: rawActions,
      lessonCount: Math.max(1, Number(lessonCount) || 1),
      limits: limits || {},
    });
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      error: scope.reason || `Explicit full-printable request planned ${plannedBeforeBudget} packs / ~${pageEstimateBefore} pages above soft budget.`,
      actions: rawActions,
      counts: summarizePrintableActions(rawActions),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      scope: { ...scope, explicitFullCoverage: true },
      printableBudgetDiagnostics: {
        printableCandidatesTotal: plannedBeforeBudget,
        printableSoftPackBudget: softPackMax,
        printableSoftPageBudget: softPageMax,
        plannedPackCountBeforeBudget: plannedBeforeBudget,
        estimatedPageCountBeforeBudget: pageEstimateBefore,
        requiredPrintableCandidateIds: [],
        selectedPrintableCandidateIds: [],
        deferredPrintableCandidateIds: [],
        consolidatedPrintableCandidateIds: [],
        finalPackCount: plannedBeforeBudget,
        finalEstimatedPageCount: pageEstimateBefore,
        printableBudgetApplied: false,
        requiredOverBudget: false,
        explicitScopeOverride: true,
        hardLimitExceeded: false,
      },
      cost: { printablePlannerCalls: 0, printableRevisionCalls: 0, printableVisualGenerations: 0 },
    };
  }

  // Ordinary finish/create: self-budget optional CREATE/REPLACE to soft pack + page max.
  const budgeted = applyPrintableGenerationSoftBudget(rawActions, {
    softPackMax,
    softPageMax,
    lessonCount,
    activities,
  });
  const actions = budgeted.actions;
  let printableBudgetDiagnostics = budgeted.diagnostics;

  if (budgeted.requiredOverBudget) {
    const scope = assessPrintableScope({
      actions: rawActions,
      lessonCount: Math.max(1, Number(lessonCount) || 1),
      limits: limits || {},
    });
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      error: scope.reason || `Required printable packs exceed soft budget ${softPackMax} packs / ${softPageMax} pages.`,
      actions: rawActions,
      counts: summarizePrintableActions(rawActions),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      scope: { ...scope, requiredOverBudget: true },
      printableBudgetDiagnostics: {
        ...printableBudgetDiagnostics,
        printableBudgetApplied: false,
        requiredOverBudget: true,
        selectedPrintableCandidateIds: printableBudgetDiagnostics.requiredPrintableCandidateIds,
        deferredPrintableCandidateIds: [],
        finalPackCount: plannedBeforeBudget,
        finalEstimatedPageCount: pageEstimateBefore,
      },
      cost: { printablePlannerCalls: 0, printableRevisionCalls: 0, printableVisualGenerations: 0 },
    };
  }

  const plannedAfterBudget = plannedPrintableWriteCount(actions);
  if (plannedAfterBudget > hardMax) {
    const scope = assessPrintableScope({
      actions,
      lessonCount: Math.max(1, Number(lessonCount) || 1),
      limits: limits || {},
    });
    return {
      ok: false,
      code: scope.code || "SCOPE_REVIEW_REQUIRED",
      error: scope.reason,
      actions,
      counts: summarizePrintableActions(actions),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      scope,
      printableBudgetDiagnostics: {
        ...printableBudgetDiagnostics,
        hardLimitExceeded: true,
      },
      cost: { printablePlannerCalls: 0, printableRevisionCalls: 0, printableVisualGenerations: 0 },
    };
  }

  const scope = assessPrintableScope({
    actions,
    lessonCount: Math.max(1, Number(lessonCount) || 1),
    limits: limits || {},
  });
  if (!scope.ok) {
    return {
      ok: false,
      code: scope.code,
      error: scope.reason,
      actions,
      counts: summarizePrintableActions(actions),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      scope,
      printableBudgetDiagnostics,
      cost: { printablePlannerCalls: 0, printableRevisionCalls: 0, printableVisualGenerations: 0 },
    };
  }

  let draft = plan?.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
    : { week: {}, activities: {} };
  if (!draft.week) draft.week = {};
  if (!draft.activities) draft.activities = {};

  let generations = 0;
  let printablePlannerCalls = 0;
  let printableRevisionCalls = 0;
  let printableVisualGenerations = 0;
  const results = [];
  const knownActivityIds = schema.asArray(activities).map((a) => text(a.id, 160)).filter(Boolean);
  const packVisualCache = visualCache instanceof Map ? visualCache : new Map();
  let visualsApi = null;
  try { visualsApi = require("./curriculum-operator-printable-visuals.js"); } catch (_e) { visualsApi = null; }

  for (const action of actions) {
    const decision = normalizePrintableDecision(action.decision);
    const idempotencyKey = decision === "REMOVE"
      ? `printable:${plan.id}:remove:${schema.asArray(action.spec?.existingResourceIds).join(",")}`
      : `printable:${plan.id}:${action.activityId}:${text(action.spec?.resourceType, 40)}:${text(action.spec?.title, 80)}`;
    if (alreadySucceededKeys.has(idempotencyKey)) {
      results.push({
        ...action,
        decision,
        status: "skipped",
        reason: `${action.reason} (already succeeded; resume skip)`,
        idempotencyKey,
      });
      continue;
    }

    if (decision === "KEEP" || decision === "NOT_NEEDED") {
      results.push({ ...action, decision, status: "skipped", idempotencyKey });
      continue;
    }

    if (decision === "REMOVE") {
      try {
        const oldIds = schema.asArray(action.spec?.existingResourceIds);
        for (const oldId of oldIds) {
          if (typeof unlinkPrintableResource === "function") {
            // eslint-disable-next-line no-await-in-loop
            await unlinkPrintableResource({ lessonPlanId: plan.id, resourceId: oldId });
          }
        }
        const ids = schema.asArray(draft.week.printableIds).filter((id) => !oldIds.map(String).includes(String(id)));
        draft.week.printableIds = ids;
        results.push({
          ...action,
          decision,
          status: "success",
          idempotencyKey,
          removedResourceIds: oldIds,
        });
      } catch (error) {
        results.push({
          ...action,
          decision,
          status: "failed",
          error: text(error.message, 400),
          retryable: true,
          idempotencyKey,
          preservedExisting: true,
        });
      }
      continue;
    }

    if (!PRINTABLE_WRITE.includes(decision)) {
      results.push({ ...action, decision, status: "skipped", idempotencyKey });
      continue;
    }

    if (generations >= hardMax) {
      results.push({
        ...action,
        decision,
        status: "failed",
        error: "maxPrintableGenerations reached",
        retryable: true,
        idempotencyKey,
      });
      continue;
    }

    const existingIds = schema.asArray(action.spec?.existingResourceIds);
    try {
      const activity = schema.asArray(activities).find((a) => text(a.id, 160) === text(action.activityId, 160));
      if (!activity) throw new Error(`Activity ${action.activityId} not found by exact id.`);

      const spec = {
        ...action.spec,
        lessonId: plan.id,
        activityIds: [action.activityId],
        decision,
      };
      const specCheck = validatePrintableSpec(spec, {
        expectedLessonId: plan.id,
        knownActivityIds,
      });
      if (!specCheck.ok) throw new Error(`Invalid printable spec: ${specCheck.errors.join(", ")}`);

      // Phase 4.5/4.6: AI enriches CONTENTS; thin specs cannot silently use generic fallback.
      let enrichedSpec = spec;
      let plannerMeta = null;
      if (useContentPlanner !== false) {
        let planner;
        try {
          planner = require("./curriculum-operator-printable-planner.js");
        } catch (_e) {
          planner = null;
        }
        if (planner?.planPrintableContent) {
          const effectiveCallAi = typeof callAi === "function"
            ? callAi
            : async (systemPrompt, userPrompt) => (
              /REVISION MODE|Revise this printable/i.test(systemPrompt + userPrompt)
                ? planner.buildOperatorPrintableAiRevisionFixtureResponse(userPrompt)
                : planner.buildOperatorPrintableAiFixtureResponse(userPrompt)
            );
          // eslint-disable-next-line no-await-in-loop
          const planned = await planner.planPrintableContent({
            plan,
            activity,
            baseSpec: spec,
            callAi: effectiveCallAi,
            usePlanner: true,
            allowRevision: true,
          });
          printablePlannerCalls += Number(planned.usage?.plannerCalls) || 0;
          printableRevisionCalls += Number(planned.usage?.revisionCalls) || 0;

          if (!planned.ok) {
            const blocked = planned.blocked || planned.code === "BLOCKED" || planned.code === "NEEDS_REVISION";
            results.push({
              ...action,
              decision,
              status: planned.code === "NEEDS_REVISION" ? "needs_revision" : "blocked",
              code: planned.code || "BLOCKED",
              error: planned.error || "Printable blocked — inadequate spec after planning/revision.",
              idempotencyKey,
              preservedExisting: true,
              plannerMeta: { usage: planned.usage, gate: planned.gate },
              uploaded: false,
            });
            if (blocked) continue;
            throw new Error(planned.error || planned.code || "printable content planner failed");
          }
          if (!planned.skipped && planned.spec) {
            enrichedSpec = {
              ...planned.spec,
              filename: sanitizePrintableFileName(
                planned.spec.filename || titleToFileName(planned.spec.title, plan?.title),
              ),
              lessonId: plan.id,
              activityIds: [action.activityId],
              decision,
            };
            const recheck = validatePrintableSpec(enrichedSpec, {
              expectedLessonId: plan.id,
              knownActivityIds,
            });
            if (!recheck.ok) {
              results.push({
                ...action,
                decision,
                status: "blocked",
                code: "BLOCKED",
                error: `Enriched printable spec invalid: ${recheck.errors.join(", ")}`,
                idempotencyKey,
                preservedExisting: true,
              });
              continue;
            }
            const pathCheck = classifyPrintableRenderPath(enrichedSpec, { operatorWrite: true });
            if (!pathCheck.ok) {
              results.push({
                ...action,
                decision,
                status: "blocked",
                code: "GENERIC_FALLBACK_FORBIDDEN",
                error: `Thin spec blocked (no generic fallback): ${pathCheck.reason}`,
                idempotencyKey,
                preservedExisting: true,
              });
              continue;
            }
            plannerMeta = {
              contentSource: enrichedSpec.contentSource || "ai_planner",
              visualPlan: enrichedSpec.visualPlan || null,
              gate: planned.gate || null,
              review: planned.review || null,
              usage: planned.usage || null,
              revised: planned.revised === true,
              renderPath: pathCheck.path,
            };
          }
        }
      } else {
        // Planner disabled: still forbid generic fallback success for CREATE/REPLACE.
        const pathCheck = classifyPrintableRenderPath(enrichedSpec, { operatorWrite: true });
        if (!pathCheck.ok) {
          results.push({
            ...action,
            decision,
            status: "blocked",
            code: "GENERIC_FALLBACK_FORBIDDEN",
            error: `Thin spec blocked (no generic fallback): ${pathCheck.reason}`,
            idempotencyKey,
            preservedExisting: true,
          });
          continue;
        }
      }

      // Phase 4.6: materialize generated_asset visuals before PDF (fixture in CI).
      if (visualsApi?.materializePrintableVisuals) {
        const forceFixture = process.env.NODE_ENV === "test"
          || ["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_PRINTABLE_VISUAL_FIXTURE || "").trim().toLowerCase())
          || ["1", "true", "yes"].includes(String(process.env.VISUAL_PRODUCTION_MOCK_GENERATE || "").trim().toLowerCase());
        // eslint-disable-next-line no-await-in-loop
        const visuals = await visualsApi.materializePrintableVisuals({
          spec: enrichedSpec,
          plan,
          activity,
          generateVisual: generatePrintableVisual,
          visualCache: packVisualCache,
          limits: {
            maxPrintableVisualsPerPack: limits?.maxPrintableVisualsPerPack,
            maxPrintableVisualsPerJob: limits?.maxPrintableVisualsPerJob,
          },
          alreadyUsed: printableVisualGenerations,
          forceFixture: forceFixture || typeof generatePrintableVisual !== "function",
        });
        if (!visuals.ok) {
          if (visuals.code === "SCOPE_REVIEW_REQUIRED") {
            return {
              ok: false,
              code: "SCOPE_REVIEW_REQUIRED",
              error: visuals.error,
              actions: results.concat([{
                ...action,
                decision,
                status: "blocked",
                code: "SCOPE_REVIEW_REQUIRED",
                error: visuals.error,
                idempotencyKey,
                preservedExisting: true,
              }]),
              counts: summarizePrintableActions(results),
              enrichmentDraft: plan?.enrichmentDraft || null,
              changed: false,
              generations,
              cost: { printablePlannerCalls, printableRevisionCalls, printableVisualGenerations },
            };
          }
          results.push({
            ...action,
            decision,
            status: "blocked",
            code: visuals.code || "BLOCKED",
            error: visuals.error || "Required printable visual missing.",
            idempotencyKey,
            preservedExisting: true,
          });
          continue;
        }
        enrichedSpec = visuals.spec;
        printableVisualGenerations += Number(visuals.usage?.generations) || 0;
        const embedCheck = visualsApi.validateEmbeddedVisuals(enrichedSpec);
        if (!embedCheck.ok) {
          results.push({
            ...action,
            decision,
            status: "blocked",
            code: "missing_required_visual",
            error: `Visual embed validation failed: ${embedCheck.errors.join(", ")}`,
            idempotencyKey,
            preservedExisting: true,
          });
          continue;
        }
        if (plannerMeta) plannerMeta.visualUsage = visuals.usage;
      }

      const generated = await generatePrintablePdfBuffer({
        spec: enrichedSpec,
        plan,
        activity,
        forbidGenericFallback: true,
      });
      generations += 1;
      const validated = await validateGeneratedPdf(generated.buffer, {
        expectedPageCount: generated.pageCount,
        fileName: generated.fileName,
      });
      if (!validated.ok) {
        throw new Error(`PDF validation failed: ${validated.failed.map((f) => f.code).join(", ")}`);
      }

      if (typeof createPrintableResource !== "function") {
        throw new Error("Printable upload helper is not configured.");
      }

      const uploaded = await createPrintableResource({
        lessonPlanId: plan.id,
        activityId: action.activityId,
        title: generated.title,
        fileName: generated.fileName,
        fileData: bufferToPdfDataUrl(generated.buffer),
        pageCount: generated.pageCount,
        resourceType: enrichedSpec.resourceType,
        description: [
          text(enrichedSpec.purpose, 500),
          `Operator activityId=${action.activityId}`,
          `Operator decision=${decision}`,
          plannerMeta?.contentSource ? `Operator contentSource=${plannerMeta.contentSource}` : "",
          generated.renderPath ? `Operator renderPath=${generated.renderPath}` : "",
        ].filter(Boolean).join("\n"),
        ageGroup: plan.age || "",
        theme: plan.theme || "",
        printingInstructions: [
          enrichedSpec.cutRequired ? "Cut apart cards/pieces before use." : "",
          enrichedSpec.laminateRecommended ? "Laminate for reuse if desired." : "",
        ].filter(Boolean).join(" "),
        // Live Operator drafts must not be disposable QA fixtures — Owner may
        // publish them via Phase 8. Hard-delete semantics are for explicit fixtures only.
        disposableQaFixture: false,
        replaceResourceId: decision === "REPLACE" ? existingIds[0] || null : null,
      });

      if (!uploaded?.ok || !uploaded.resourceId) {
        throw new Error(uploaded?.error || "printable upload/link failed");
      }

      if (typeof readResourceFile === "function") {
        const fileCheck = await readResourceFile({ resourceId: uploaded.resourceId, lessonPlanId: plan.id });
        if (!fileCheck?.ok) {
          throw new Error(fileCheck?.error || "preview/download verification failed");
        }
        if (Number(fileCheck.pageCount) && Number(fileCheck.pageCount) !== Number(generated.pageCount)) {
          throw new Error("Downloaded PDF page count mismatch.");
        }
      }

      const linked = linkPrintableIntoEnrichmentDraft(draft, {
        lessonId: plan.id,
        expectedLessonId: plan.id,
        activityId: action.activityId,
        resourceId: uploaded.resourceId,
        title: generated.title,
      });
      if (!linked.ok) throw new Error(linked.error || "draft link failed");
      draft = linked.enrichmentDraft;

      if (decision === "REPLACE" && existingIds.length && typeof unlinkPrintableResource === "function") {
        for (const oldId of existingIds) {
          if (oldId === uploaded.resourceId) continue;
          // eslint-disable-next-line no-await-in-loop
          await unlinkPrintableResource({ lessonPlanId: plan.id, resourceId: oldId });
          draft.week.printableIds = schema.asArray(draft.week.printableIds)
            .filter((id) => id !== oldId);
        }
      }

      results.push({
        ...action,
        decision,
        status: "success",
        idempotencyKey,
        resourceId: uploaded.resourceId,
        title: generated.title,
        fileName: generated.fileName,
        pageCount: generated.pageCount,
        spec: enrichedSpec,
        plannerMeta,
        previewVerified: true,
        downloadVerified: true,
        renderPath: generated.renderPath,
      });
    } catch (error) {
      const code = error?.code || "";
      const blocked = code === "GENERIC_FALLBACK_FORBIDDEN"
        || code === "missing_required_visual"
        || code === "BLOCKED";
      results.push({
        ...action,
        decision,
        status: blocked ? "blocked" : "failed",
        code: code || undefined,
        error: text(error?.message || "printable action failed", 400),
        retryable: !blocked,
        idempotencyKey,
        preservedExisting: existingIds.length > 0 || blocked,
      });
    }
  }

  let changed = results.some((r) => r.status === "success");
  if (changed && typeof saveDraft === "function") {
    const saved = await saveDraft({ enrichmentDraft: draft });
    if (!saved?.ok) {
      return {
        ok: false,
        error: saved?.error || "draft save failed after printables",
        actions: results.map((r) => (
          r.status === "success"
            ? { ...r, status: "failed", error: "draft save failed", retryable: true, preservedExisting: true }
            : r
        )),
        counts: summarizePrintableActions(results),
        enrichmentDraft: plan?.enrichmentDraft || null,
        changed: false,
        generations,
        scope,
        cost: { printablePlannerCalls, printableRevisionCalls, printableVisualGenerations },
      };
    }
    draft = saved.enrichmentDraft || draft;
  }

  const hasBlocked = results.some((r) => r.status === "blocked" || r.status === "needs_revision");
  const hasFailed = results.some((r) => r.status === "failed");
  return {
    ok: !hasFailed && !hasBlocked,
    partial: (hasFailed || hasBlocked) && results.some((r) => r.status === "success"),
    actions: results,
    counts: summarizePrintableActions(results),
    enrichmentDraft: draft,
    changed,
    generations,
    scope,
    printableBudgetDiagnostics,
    cost: { printablePlannerCalls, printableRevisionCalls, printableVisualGenerations },
  };
}

module.exports = {
  PRINTABLE_WRITE,
  BRAND_FOOTER,
  SOFT_PRINTABLE_PACKS_PER_LESSON,
  SOFT_PRINTABLE_PAGES_PER_PACK,
  PRINTABLE_BUDGET_DEFER_REASON,
  PRINTABLE_IMPORTANCE,
  normalizePrintableDecision,
  sanitizePrintableFileName,
  titleToFileName,
  buildPrintableSpec,
  validatePrintableSpec,
  refinePrintableDecision,
  buildPrintableActionsFromAudit,
  summarizePrintableActions,
  plannedPrintableWriteCount,
  softPrintablePackBudget,
  softPrintablePageBudget,
  commandRequestsFullPrintableCoverage,
  printableActionPageCount,
  printableImportance,
  printableWritePriorityScore,
  applyPrintableGenerationSoftBudget,
  assessPrintableScope,
  isWeakGenericPrintable,
  idealPrintableForActivity,
  pageHasRichOperatorContent,
  classifyPrintableRenderPath,
  generatePrintablePdfBuffer,
  validateGeneratedPdf,
  bufferToPdfDataUrl,
  linkPrintableIntoEnrichmentDraft,
  verifyPrintableJobDraft,
  runPrintablePlanForLesson,
};
