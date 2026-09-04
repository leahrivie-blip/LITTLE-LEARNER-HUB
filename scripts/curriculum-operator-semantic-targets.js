/**
 * Authoritative target resolution against the live catalog.
 * The interpreter may name titles/collections; this module decides IDs.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const selectApi = require("./curriculum-operator-select.js");

function text(value, max = 180) {
  return schema.text(value, max);
}

function titleKey(value) {
  return selectApi.normalizeTitleKey(value);
}

function inExampleSpan(title, exampleSpan) {
  if (!exampleSpan || !title) return false;
  return titleKey(exampleSpan).includes(titleKey(title));
}

function catalogRows(lessonPlans = []) {
  return schema.asArray(lessonPlans).map((plan) => ({
    id: text(plan.id, 160),
    title: text(plan.title, 180),
    plan: plan.plan === "Pro" ? "Pro" : "Free",
    status: text(plan.status, 40),
    ageBand: schema.normalizeAgeBand(plan.age || plan.ageBand) || "unspecified",
    archived: plan.status === "archived",
  })).filter((row) => row.id);
}

function resolveRequestedTitles(titles, catalog, exampleSpan) {
  const requested = [];
  const exampleOnly = [];
  const unresolved = [];
  const ambiguous = [];
  schema.asArray(titles).forEach((title) => {
    const key = titleKey(title);
    if (!key) return;
    const matches = catalog.filter((row) => !row.archived && (
      titleKey(row.title) === key
      || titleKey(row.title).includes(key)
      || key.includes(titleKey(row.title))
    ));
    if (inExampleSpan(title, exampleSpan) && matches.length) {
      exampleOnly.push({ title, ids: matches.map((m) => m.id) });
      return;
    }
    if (!matches.length) {
      unresolved.push(title);
      return;
    }
    if (matches.length > 1) {
      ambiguous.push({ title, ids: matches.map((m) => m.id) });
      return;
    }
    requested.push(matches[0]);
  });
  return { requested, exampleOnly, unresolved, ambiguous };
}

function resolveCollection(signals, catalog) {
  if (!signals.collection) return null;
  let rows = catalog.filter((row) => !row.archived);
  if (signals.access === "Free") rows = rows.filter((row) => row.plan === "Free");
  if (signals.access === "Pro") rows = rows.filter((row) => row.plan === "Pro");
  rows = rows.filter((row) => row.status === "published" || row.status === "draft" || !row.status);
  if (signals.ageBand) rows = rows.filter((row) => row.ageBand === signals.ageBand);
  return rows;
}

function assertAccessInvariant(rows, requestedAccess) {
  if (!requestedAccess) return { ok: true };
  const wrong = schema.asArray(rows).filter((row) => row.plan !== requestedAccess);
  if (!wrong.length) return { ok: true };
  return {
    ok: false,
    code: "access_tier_mismatch",
    message: `Requested ${requestedAccess} but resolved ${wrong.map((r) => r.plan).join(", ")}.`,
    wrongIds: wrong.map((r) => r.id),
  };
}

function assertAgeInvariant(rows, requestedAge) {
  if (!requestedAge) return { ok: true };
  const wrong = schema.asArray(rows).filter((row) => row.ageBand && row.ageBand !== requestedAge);
  if (!wrong.length) return { ok: true };
  return {
    ok: false,
    code: "age_band_mismatch",
    message: `Requested ${requestedAge} but resolved ${wrong.map((r) => r.ageBand).join(", ")}.`,
    wrongIds: wrong.map((r) => r.id),
  };
}

function resolveTargets({
  signals = {},
  parsedTitles = [],
  parsedLessonIds = [],
  lessonPlans = [],
  currentlySelectedLessonId = null,
  context = {},
} = {}) {
  const catalog = catalogRows(lessonPlans);
  const byId = new Map(catalog.map((row) => [row.id, row]));
  const outsideExample = signals.exampleSpan
    ? String(signals.raw || "").replace(signals.exampleSpan, "")
    : String(signals.raw || "");
  function mentionedOutsideExample(row) {
    if (!row) return false;
    const key = titleKey(row.title);
    return key && titleKey(outsideExample).includes(key);
  }
  const explicit = schema.asArray(parsedLessonIds)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((row) => !signals.exampleSpan || mentionedOutsideExample(row));

  if (signals.doTheSame && context.previousResolvedTargets?.length) {
    const inheritedOp = context.previousAllowedScopes || context.previousIntent;
    return {
      mode: "context_inherit",
      rows: context.previousResolvedTargets.map((id) => byId.get(id)).filter(Boolean),
      exampleOnly: [],
      unresolved: [],
      ambiguous: [],
      inheritedOperation: inheritedOp || null,
      selection: "explicit_ids",
      lessonIds: context.previousResolvedTargets.slice(),
      titles: [],
    };
  }

  if (signals.sameAsPrevious && schema.asArray(parsedTitles).length) {
    const titled = resolveRequestedTitles(parsedTitles, catalog, signals.exampleSpan);
    return {
      mode: "context_retarget",
      rows: titled.requested,
      exampleOnly: titled.exampleOnly,
      unresolved: titled.unresolved,
      ambiguous: titled.ambiguous,
      inheritedOperation: context.previousIntent || null,
      selection: titled.requested.length === 1 ? "explicit_ids" : "named_titles",
      lessonIds: titled.requested.map((r) => r.id),
      titles: titled.requested.map((r) => r.title),
    };
  }

  if (explicit.length) {
    return {
      mode: "explicit_ids",
      rows: explicit,
      exampleOnly: [],
      unresolved: [],
      ambiguous: [],
      selection: "explicit_ids",
      lessonIds: explicit.map((r) => r.id),
      titles: [],
    };
  }

  if (signals.collection) {
    const collection = resolveCollection(signals, catalog);
    const titledForExamples = resolveRequestedTitles(parsedTitles, catalog, signals.exampleSpan);
    if (collection) {
      return {
        mode: "collection",
        rows: collection,
        exampleOnly: titledForExamples.exampleOnly,
        unresolved: titledForExamples.unresolved,
        ambiguous: titledForExamples.ambiguous,
        selection: "filter",
        lessonIds: [],
        titles: [],
      };
    }
  }

  const titled = resolveRequestedTitles(parsedTitles, catalog, signals.exampleSpan);
  if (titled.requested.length && !signals.collection) {
    return {
      mode: titled.requested.length === 1 ? "unique_title" : "named_titles",
      rows: titled.requested,
      exampleOnly: titled.exampleOnly,
      unresolved: titled.unresolved,
      ambiguous: titled.ambiguous,
      selection: titled.requested.length === 1 ? "explicit_ids" : "named_titles",
      lessonIds: titled.requested.map((r) => r.id),
      titles: titled.requested.map((r) => r.title),
    };
  }

  const collection = resolveCollection(signals, catalog);
  if (collection) {
    return {
      mode: "collection",
      rows: collection,
      exampleOnly: titled.exampleOnly,
      unresolved: titled.unresolved,
      ambiguous: titled.ambiguous,
      selection: "filter",
      lessonIds: [],
      titles: [],
    };
  }

  if (currentlySelectedLessonId && byId.get(currentlySelectedLessonId) && !signals.collection) {
    const row = byId.get(currentlySelectedLessonId);
    return {
      mode: "currently_selected",
      rows: [row],
      exampleOnly: titled.exampleOnly,
      unresolved: [],
      ambiguous: [],
      selection: "currently_selected",
      lessonIds: [row.id],
      titles: [],
    };
  }

  return {
    mode: titled.unresolved.length || titled.ambiguous.length ? "unresolved" : "none",
    rows: [],
    exampleOnly: titled.exampleOnly,
    unresolved: titled.unresolved,
    ambiguous: titled.ambiguous,
    selection: "filter",
    lessonIds: [],
    titles: [],
  };
}

module.exports = {
  catalogRows,
  resolveTargets,
  assertAccessInvariant,
  assertAgeInvariant,
  inExampleSpan,
};
