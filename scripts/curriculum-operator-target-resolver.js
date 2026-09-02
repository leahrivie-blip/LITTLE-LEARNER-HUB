/**
 * AI Curriculum Operator — strict target resolution (IDs, titles, counts).
 * IDs are authoritative. No silent fallback to title/catalog slice.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const commandSafety = require("./curriculum-operator-command-safety.js");

const LESSON_ID_RE = /\b(cur-lp-[a-f0-9]{16})\b/gi;
const PROTECTED_LESSON_IDS = Object.freeze(["cur-lp-preschool-farm-animals"]);
const PROTECTED_TITLE_RE = /^farm animals$/i;
const LMW_ID = "cur-lp-549b80f61dfa8d79";
const LMW_PROTECTED_ACTIVITY_IDS = Object.freeze([
  "cur-act-0a02697c73ccac85", // Giant Floor Drawing
  "cur-act-c36723f91d3a9637", // Sponge Squish Painting
]);

const SELECTION_METHODS = Object.freeze({
  EXPLICIT_IDS: "explicit_ids",
  TITLE_MATCH: "title_match",
  AMBIGUOUS: "ambiguous",
  UNRESOLVED: "unresolved",
  CURRENTLY_SELECTED: "currently_selected",
});

const UNRESOLVED_ID_MESSAGE = "The supplied lesson ID was not found. No job was created.";

function text(value, max = 4000) {
  return schema.text(value, max);
}

function normalizeTitleKey(value) {
  return text(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractSuppliedLessonIds(rawCommand) {
  const raw = text(rawCommand);
  const ids = [];
  const re = new RegExp(LESSON_ID_RE.source, "gi");
  let match;
  while ((match = re.exec(raw))) ids.push(String(match[1]).toLowerCase());
  return [...new Set(ids)];
}

function extractQuotedTitles(rawCommand) {
  const titles = [];
  const re = /[“"]([^”"]{2,120})[”"]/g;
  let match;
  while ((match = re.exec(String(rawCommand || "")))) {
    titles.push(match[1].trim());
  }
  return titles;
}

function extractTitleCaseAfterVerb(rawCommand) {
  const raw = String(rawCommand || "");
  const match = raw.match(
    /\b(?:[Cc]heck|[Aa]udit|[Ff]ix|[Rr]eview|[Ii]nspect|[Ff]inish|[Uu]pgrade|[Cc]omplete)\s+([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*){0,5})(?=\s+and\b|[,.!?:]|$|\s+to\b|\s+but\b|\s+for\b)/,
  );
  if (!match) return [];
  const candidate = match[1].trim();
  if (/^(The|All|These|Those|Lessons?|Plans?|Toddler|Preschool|Infant|Pro|Free)\b/.test(candidate)) return [];
  return [candidate];
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Create Maker Station Signs printable for LMW" — artifact name, not a lesson title. */
function isRequestedPrintableArtifactTitle(title, rawCommand) {
  const raw = String(rawCommand || "");
  const escaped = escapeRegExp(title);
  if (!escaped) return false;
  if (!new RegExp(`\\b(?:create|generate|make|add|build|replace)\\s+${escaped}\\s+printables?\\b`, "i").test(raw)) {
    return false;
  }
  return !new RegExp(`\\bfor\\s+${escaped}\\b`, "i").test(raw);
}

function extractSuppliedTitles(rawCommand, extraTitles = []) {
  const raw = text(rawCommand);
  const structured = commandSafety.extractStructuredLessonTitles(raw);
  const quoted = extractQuotedTitles(raw);
  const labeled = [];
  const labeledMatch = raw.match(/\blesson\s*title\s*:\s*([^\n\r]{2,120})/i);
  if (labeledMatch) labeled.push(labeledMatch[1].split(/\n|\.(?:\s|$)/)[0].trim());
  const fromVerb = extractTitleCaseAfterVerb(raw);
  return [...new Set([...structured, ...quoted, ...labeled, ...fromVerb, ...schema.asArray(extraTitles)].map((t) => text(t, 180)).filter(Boolean))]
    .filter((title) => {
      if (commandSafety.isGarbageTitleCandidate(title)) return false;
      if (/cur-lp-[a-f0-9]{16}/i.test(title)) return false;
      if (/^lesson\s+id\b/i.test(title)) return false;
      if (isRequestedPrintableArtifactTitle(title, raw)) return false;
      return true;
    });
}

function catalogRow(plan) {
  return {
    id: text(plan?.id, 160),
    title: text(plan?.title, 180),
    theme: text(plan?.theme, 120),
    age: text(plan?.age, 80),
    ageBand: schema.normalizeAgeBand(plan?.age || plan?.ageBand) || "unspecified",
    accessPlan: plan?.plan === "Pro" ? "Pro" : "Free",
    status: text(plan?.status, 40) || "draft",
  };
}

function isProtectedLesson(plan) {
  const id = text(plan?.id, 160);
  const title = text(plan?.title, 180);
  if (PROTECTED_LESSON_IDS.includes(id)) return true;
  if (PROTECTED_TITLE_RE.test(title)) return true;
  return false;
}

function matchTitleCandidates(title, lessonPlans = []) {
  const key = normalizeTitleKey(title);
  if (!key) return [];
  const plans = schema.asArray(lessonPlans).filter((p) => p && p.status !== "archived");
  const exact = [];
  const loose = [];
  plans.forEach((plan) => {
    const row = catalogRow(plan);
    const titleKey = normalizeTitleKey(row.title);
    if (!titleKey) return;
    if (titleKey === key) exact.push(row);
    else if (titleKey.includes(key) || key.includes(titleKey)) loose.push(row);
  });
  return exact.length ? exact : loose;
}

function classifyNumberedNoun(noun) {
  const key = text(noun, 40).toLowerCase();
  if (/lessons?|plans?/.test(key)) return "lessons";
  if (/images?|pictures?|photos?|visuals?/.test(key)) return "images";
  if (/printables?/.test(key)) return "printables";
  if (/activit/.test(key)) return "activities";
  return null;
}

function parseRequestedCounts(rawCommand) {
  const raw = text(rawCommand);
  const result = {
    lessonCount: null,
    itemCount: null,
    itemKind: null,
    hardCap: null,
    remaining: false,
    countSource: null,
  };

  if (/\ball\s+remaining\s+(activit(?:y|ies)|images?|pictures?|printables?)\b/i.test(raw)) {
    result.remaining = true;
    result.countSource = "all_remaining";
    if (/\bprintables?\b/i.test(raw)) result.itemKind = "printables";
    else if (/\b(?:images?|pictures?|photos?)\b/i.test(raw)) result.itemKind = "images";
    else result.itemKind = "activities";
  }

  if (
    commandSafety.isOneLessonScopeCommand(raw)
    || /\b(?:exactly\s+)?one\s+lesson\b/i.test(raw)
    || /\bexactly\s+one\b/i.test(raw)
  ) {
    result.lessonCount = 1;
    result.countSource = result.countSource || "one_lesson";
  }

  const beyond = raw.match(/\bdo\s+not\s+continue\s+beyond\s+(\d{1,3})\b/i);
  if (beyond) {
    result.hardCap = Number(beyond[1]);
    result.countSource = result.countSource || "hard_cap";
  }

  const numbered = [
    ...raw.matchAll(
      /\b(?:exactly\s+|only\s+|top\s+|first\s+|next\s+)?(\d{1,3})\s+(lessons?|plans?|activit(?:y|ies)|images?|pictures?|photos?|visuals?|printables?)\b/gi,
    ),
  ];
  numbered.forEach((match) => {
    if (/^\d{1,2}\s*[-–]\s*\d{1,2}\s*(?:month|year)/i.test(match[0])) return;
    const n = Number(match[1]);
    if (!Number.isFinite(n)) return;
    const kind = classifyNumberedNoun(match[2]);
    const exactly = /\bexactly\b/i.test(match[0]);
    const only = /\bonly\b/i.test(match[0]);
    if (kind === "lessons") {
      result.lessonCount = n;
      result.countSource = exactly ? "exactly" : (only ? "only" : "numbered");
    } else if (kind) {
      result.itemCount = n;
      result.itemKind = kind;
      result.countSource = exactly ? "exactly" : (only ? "only" : "numbered");
      if (result.lessonCount == null) result.lessonCount = 1;
    }
  });

  if (result.itemCount == null) {
    const onlyBare = raw.match(/\bonly\s+(\d{1,3})\b/i);
    if (onlyBare && !/\b(?:month|year)s?\b/i.test(onlyBare.input.slice(onlyBare.index, onlyBare.index + 24))) {
      result.itemCount = Number(onlyBare[1]);
      result.countSource = result.countSource || "only";
      if (/\b(?:images?|pictures?|photos?|visuals?)\b/i.test(raw)) result.itemKind = "images";
      else if (/\bprintables?\b/i.test(raw)) result.itemKind = "printables";
      else if (/\bactivit/i.test(raw)) result.itemKind = "activities";
    }
  }

  if (result.hardCap != null && result.itemCount == null) {
    result.itemCount = result.hardCap;
    if (!result.itemKind && /\b(?:images?|pictures?|photos?)\b/i.test(raw)) result.itemKind = "images";
  }

  return result;
}

function candidateSummary(row) {
  return {
    id: row.id,
    title: row.title,
    ageGroup: row.age || row.ageBand,
    ageBand: row.ageBand,
    accessLevel: row.accessPlan,
    status: row.status,
    theme: row.theme || "",
  };
}

/**
 * Resolve the owner command to an exact lesson target before planning or job creation.
 * @param {{ rawCommand: string, lessonPlans?: object[], currentlySelectedLessonId?: string }} options
 */
function resolveTargets(options = {}) {
  const raw = text(options.rawCommand, 4000);
  const plans = schema.asArray(options.lessonPlans);
  const byId = new Map(plans.filter((p) => p && p.id).map((p) => [text(p.id, 160), catalogRow(p)]));
  const suppliedLessonIds = extractSuppliedLessonIds(raw);
  const suppliedTitles = extractSuppliedTitles(raw, options.suppliedTitles);
  const counts = parseRequestedCounts(raw);
  const mismatches = [];
  const blockReasons = [];
  const candidates = [];
  const titleMismatches = [];
  let selectionMethod = SELECTION_METHODS.UNRESOLVED;
  let resolved = [];
  let unresolvedLessonIds = [];
  let blockMessage = "";
  let requiresConfirmation = false;

  if (suppliedLessonIds.length) {
    suppliedLessonIds.forEach((id) => {
      const hit = byId.get(id);
      if (hit) resolved.push(hit);
      else unresolvedLessonIds.push(id);
    });
    if (unresolvedLessonIds.length) {
      selectionMethod = SELECTION_METHODS.UNRESOLVED;
      resolved = [];
      blockReasons.push("unresolved_lesson_id");
      blockMessage = UNRESOLVED_ID_MESSAGE;
      mismatches.push(`You supplied lesson ID ${unresolvedLessonIds[0]}, but it could not be resolved.`);
    } else {
      selectionMethod = SELECTION_METHODS.EXPLICIT_IDS;
      suppliedTitles.forEach((title) => {
        const key = normalizeTitleKey(title);
        resolved.forEach((row) => {
          const resolvedKey = normalizeTitleKey(row.title);
          if (key && resolvedKey && key !== resolvedKey && !resolvedKey.includes(key) && !key.includes(resolvedKey)) {
            titleMismatches.push({
              suppliedTitle: title,
              resolvedId: row.id,
              resolvedTitle: row.title,
            });
          }
        });
      });
      if (titleMismatches.length) {
        requiresConfirmation = true;
        blockReasons.push("title_mismatch");
        mismatches.push(
          `Lesson ID ${titleMismatches[0].resolvedId} resolved to “${titleMismatches[0].resolvedTitle}”, which differs from the supplied title “${titleMismatches[0].suppliedTitle}”. Confirm before any mutation.`,
        );
      }
    }
  } else if (suppliedTitles.length) {
    const matched = [];
    const seen = new Set();
    suppliedTitles.forEach((title) => {
      matchTitleCandidates(title, plans).forEach((row) => {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          matched.push(row);
        }
      });
    });
    candidates.push(...matched.map(candidateSummary));
    if (!matched.length) {
      selectionMethod = SELECTION_METHODS.UNRESOLVED;
      blockReasons.push("unresolved_title");
      blockMessage = "No lesson matched the supplied title. No job was created.";
      mismatches.push("The supplied lesson title could not be resolved.");
    } else if (matched.length > 1) {
      selectionMethod = SELECTION_METHODS.AMBIGUOUS;
      resolved = matched;
      blockReasons.push("ambiguous_title");
      blockReasons.push("multiple_lessons_matched");
      blockMessage = "Multiple lessons matched this title. Supply an exact lesson ID or confirm one target. No mutation job was created.";
      mismatches.push(`You requested 1 lesson, but ${matched.length} lessons matched.`);
    } else {
      selectionMethod = SELECTION_METHODS.TITLE_MATCH;
      resolved = matched;
    }
  } else if (options.currentlySelectedLessonId && byId.get(text(options.currentlySelectedLessonId, 160))) {
    const row = byId.get(text(options.currentlySelectedLessonId, 160));
    if (/\b(this|current|selected)\s+lesson\b/i.test(raw)) {
      selectionMethod = SELECTION_METHODS.CURRENTLY_SELECTED;
      resolved = [row];
    } else {
      selectionMethod = "filter";
    }
  } else if (!suppliedLessonIds.length && !suppliedTitles.length) {
    selectionMethod = "filter";
  }

  const requestedLessonCount = counts.lessonCount;
  const resolvedLessonCount = resolved.length;
  if (
    requestedLessonCount != null
    && resolvedLessonCount > 0
    && resolvedLessonCount !== requestedLessonCount
    && selectionMethod !== SELECTION_METHODS.UNRESOLVED
  ) {
    blockReasons.push("count_mismatch");
    mismatches.push(`You requested ${requestedLessonCount} lesson${requestedLessonCount === 1 ? "" : "s"}, but ${resolvedLessonCount} lessons matched.`);
  }

  const protectedHits = [];
  const seenProtected = new Set();
  const pushProtected = (row) => {
    if (!row?.id || seenProtected.has(row.id) || !isProtectedLesson(row)) return;
    seenProtected.add(row.id);
    protectedHits.push(row);
  };
  resolved.forEach(pushProtected);
  const rawKey = normalizeTitleKey(raw);
  plans.forEach((plan) => {
    const row = catalogRow(plan);
    if (!isProtectedLesson(row)) return;
    const titleKey = normalizeTitleKey(row.title);
    if ((titleKey && rawKey.includes(titleKey)) || (row.id && raw.includes(row.id))) {
      pushProtected(row);
    }
  });
  const lessonIds = resolved.map((row) => row.id);

  return {
    suppliedLessonIds,
    suppliedTitles,
    resolvedLessons: resolved,
    resolvedLessonIds: lessonIds,
    unresolvedLessonIds,
    selectionMethod,
    candidates,
    titleMismatches,
    requestedLessonCount,
    requestedItemCount: counts.itemCount,
    itemCountKind: counts.itemKind,
    hardCap: counts.hardCap,
    remaining: counts.remaining,
    countSource: counts.countSource,
    resolvedLessonCount,
    mismatches,
    blockReasons: [...new Set(blockReasons)],
    blockMessage,
    requiresConfirmation,
    protectedLessonIds: protectedHits.map((row) => row.id),
    protectedActivityIds: lessonIds.includes(LMW_ID) ? LMW_PROTECTED_ACTIVITY_IDS.slice() : [],
    selectionNote: selectionNoteFor(selectionMethod, unresolvedLessonIds, resolved),
  };
}

function selectionNoteFor(method, unresolvedLessonIds, resolved) {
  if (method === SELECTION_METHODS.EXPLICIT_IDS) return "Selected by explicit lesson IDs.";
  if (method === SELECTION_METHODS.TITLE_MATCH) return "Selected by lesson title match.";
  if (method === SELECTION_METHODS.AMBIGUOUS) {
    return `Ambiguous title match — ${resolved.length} lessons. Supply an exact lesson ID.`;
  }
  if (method === SELECTION_METHODS.UNRESOLVED && unresolvedLessonIds.length) return UNRESOLVED_ID_MESSAGE;
  if (method === SELECTION_METHODS.UNRESOLVED) return "Lesson target could not be resolved.";
  if (method === SELECTION_METHODS.CURRENTLY_SELECTED) return "Currently selected lesson.";
  return "";
}

function selectionMethodLabel(method) {
  if (method === SELECTION_METHODS.EXPLICIT_IDS) return "Selected by explicit lesson IDs.";
  if (method === SELECTION_METHODS.TITLE_MATCH) return "Selected by lesson title match.";
  if (method === SELECTION_METHODS.AMBIGUOUS) return "Ambiguous title match — exact lesson ID required.";
  if (method === SELECTION_METHODS.UNRESOLVED) return "Target unresolved.";
  if (method === SELECTION_METHODS.CURRENTLY_SELECTED) return "Currently selected lesson.";
  return "";
}

module.exports = {
  LESSON_ID_RE,
  PROTECTED_LESSON_IDS,
  LMW_ID,
  LMW_PROTECTED_ACTIVITY_IDS,
  SELECTION_METHODS,
  UNRESOLVED_ID_MESSAGE,
  extractSuppliedLessonIds,
  extractSuppliedTitles,
  isRequestedPrintableArtifactTitle,
  parseRequestedCounts,
  matchTitleCandidates,
  isProtectedLesson,
  resolveTargets,
  selectionMethodLabel,
  normalizeTitleKey,
};
