/**
 * AI Curriculum Operator — Phase 2.5 structured lesson composer.
 *
 * Reuses the trusted server OpenAI transport (injected callAi) and
 * enrichment-ai-style parse/validate. Returns typed field patches only.
 * Never publishes. Never mutates images, printables, identity, age, or plan.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const WEEK_FIELDS = Object.freeze([
  "weeklyOverview",
  "objectives",
  "weeklyMaterials",
  "teacherPreparation",
  "prepChecklist",
  "observationFocus",
  "familyConnection",
  "milestones",
  "vocabCards",
]);

const ACTIVITY_FIELDS = Object.freeze([
  "objective",
  "description",
  "materials",
  "preparation",
  "setup",
  "steps",
  "teacherLanguage",
  "observationOpportunities",
  "safetyNotes",
  "cleanupTips",
  "teacherTips",
  "vocabulary",
  "indoorAlternatives",
  "outdoorAlternatives",
  "adaptations",
  "extensions",
  "substitutions",
  "observationPrompts",
]);

const WRITE_ACTIONS = Object.freeze(["IMPROVE", "FILL", "REPLACE"]);

const GENERIC_FILLER_RE = /\b(children will (explore|learn about)|set out (the )?materials|encourage children to participate|what do you see\?|have fun exploring)\b/i;

function text(value, max = 8000) {
  return schema.text(value, max);
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function loadStandards() {
  try { return require("./curriculum-standards.js"); } catch (_e) { return null; }
}

function loadEnrichment() {
  try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
}

function stripJsonFences(raw) {
  const s = String(raw || "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

/**
 * Known weekly field aliases used by models / Master Paste wording.
 * Only map supported repository fields — never invent new schema keys.
 */
const WEEK_FIELD_ALIASES = Object.freeze({
  vocabularyWords: "vocabCards",
  vocabulary: "vocabCards",
  materials: "weeklyMaterials",
  overview: "weeklyOverview",
  weeklyoverview: "weeklyOverview",
  learningGoals: "objectives",
  learninggoals: "objectives",
  goals: "objectives",
  teacherPrep: "teacherPreparation",
  teacherprep: "teacherPreparation",
  prep: "teacherPreparation",
  family: "familyConnection",
  familyNotes: "familyConnection",
  observations: "observationFocus",
  observation: "observationFocus",
});

const WEEKLY_CHANGES_KEYS = Object.freeze([
  "weeklyChanges",
  "weekly",
  "weekChanges",
  "week_changes",
  "fieldChanges",
  "changes",
  "fields",
  "updates",
]);

const PAYLOAD_WRAPPER_KEYS = Object.freeze([
  "result",
  "data",
  "output",
  "response",
  "composer",
  "plan",
  "lesson",
  "upgrade",
  "content",
  "enrichmentDraft",
]);

function isWriteAction(action) {
  return WRITE_ACTIONS.includes(text(action, 20).toUpperCase());
}

function looksLikeComposerPayload(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  if (WEEKLY_CHANGES_KEYS.some((k) => obj[k] != null)) return true;
  if (Array.isArray(obj.activities) || Array.isArray(obj.songs) || Array.isArray(obj.books)) return true;
  if (obj.week && typeof obj.week === "object" && !Array.isArray(obj.week)) return true;
  return WEEK_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(obj, field))
    || Object.prototype.hasOwnProperty.call(obj, "vocabularyWords");
}

/**
 * Unwrap one layer of common model wrappers so weeklyChanges is reachable.
 * Does not recursively walk arbitrary trees (avoids accepting unrelated blobs).
 */
function unwrapComposerPayload(parsed) {
  if (!looksLikeComposerPayload(parsed)) {
    for (const key of PAYLOAD_WRAPPER_KEYS) {
      const inner = parsed?.[key];
      if (looksLikeComposerPayload(inner)) {
        return {
          payload: {
            ...parsed,
            ...inner,
            lessonId: inner.lessonId || parsed.lessonId,
            title: inner.title != null ? inner.title : parsed.title,
            age: inner.age != null ? inner.age : parsed.age,
            plan: inner.plan != null ? inner.plan : parsed.plan,
          },
          detectedWrapper: key,
        };
      }
    }
  }
  return { payload: parsed, detectedWrapper: null };
}

function normalizeWeekFieldName(field) {
  const raw = text(field, 80);
  if (!raw) return "";
  if (WEEK_FIELDS.includes(raw)) return raw;
  if (WEEK_FIELD_ALIASES[raw]) return WEEK_FIELD_ALIASES[raw];
  const lower = raw.toLowerCase();
  if (WEEK_FIELD_ALIASES[lower]) return WEEK_FIELD_ALIASES[lower];
  return raw;
}

function changeEntryFingerprint(row) {
  if (row == null) return "";
  if (typeof row === "string" || typeof row === "number") return JSON.stringify({ action: "", value: text(row, 4000) });
  if (Array.isArray(row)) return JSON.stringify({ action: "", value: row.map((v) => text(v, 400)).filter(Boolean) });
  if (typeof row !== "object") return JSON.stringify({ action: "", value: text(row, 400) });
  const action = text(row.action || row.decision, 20).toUpperCase();
  const value = row.value != null ? row.value : (row.text != null ? row.text : row.content);
  if (Array.isArray(value)) {
    return JSON.stringify({ action, value: value.map((v) => text(v, 400)).filter(Boolean) });
  }
  return JSON.stringify({ action, value: text(value, 4000) });
}

/**
 * Convert array-shaped weekly change lists into a field→entry map.
 * Supports rows like { field|name|key, action, value } used by some model outputs.
 * Identical duplicates are deduped; conflicting duplicates hard-reject.
 */
function weeklyChangesFromArray(rows) {
  const source = {};
  const rejected = [];
  const seenFingerprints = {};
  schema.asArray(rows).forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      rejected.push({
        field: `row_${index}`,
        reason: "invalid_change",
        message: `Malformed weekly change row at index ${index}`,
      });
      return;
    }
    if (row.activityId != null || row.activityIds != null) {
      rejected.push({
        field: `row_${index}`,
        reason: "forbidden_field",
        message: `Activity IDs are not allowed inside weekly change arrays (row ${index})`,
      });
      return;
    }
    const rawField = text(row.field || row.name || row.key || row.path, 80)
      .replace(/^week\./, "");
    if (!rawField) {
      rejected.push({
        field: `row_${index}`,
        reason: "unknown_field",
        message: `Weekly change row ${index} missing field name`,
      });
      return;
    }
    if (/image|printable|pdf|cover|lessonId|status|publishedAt|accessPlan|^plan$|^age$|^title$/i.test(rawField)) {
      rejected.push({
        field: rawField,
        reason: "forbidden_field",
        message: `Forbidden weekly array field: ${rawField}`,
      });
      return;
    }
    const canonical = normalizeWeekFieldName(rawField);
    if (!WEEK_FIELDS.includes(canonical)) {
      rejected.push({
        field: rawField,
        reason: "unknown_field",
        message: `Unknown weekly field: ${rawField}`,
      });
      return;
    }
    const hasValue = row.value != null || row.text != null || row.content != null
      || typeof row === "string"
      || Array.isArray(row);
    const action = text(row.action || row.decision, 20).toUpperCase();
    if (action && !isWriteAction(action)) {
      rejected.push({
        field: rawField,
        reason: "invalid_change",
        message: `Unsupported action for ${rawField}: ${action}`,
      });
      return;
    }
    if (!hasValue && action) {
      rejected.push({
        field: rawField,
        reason: "invalid_change",
        message: `Missing value for ${rawField}`,
      });
      return;
    }
    const fingerprint = changeEntryFingerprint(row);
    if (Object.prototype.hasOwnProperty.call(source, canonical)) {
      if (seenFingerprints[canonical] === fingerprint) {
        // Identical duplicate — keep first entry.
        return;
      }
      rejected.push({
        field: rawField,
        reason: "conflict_duplicate",
        message: `Conflicting duplicate weekly field in array: ${canonical}`,
      });
      return;
    }
    source[canonical] = row;
    seenFingerprints[canonical] = fingerprint;
  });
  return { source, rejected };
}

/**
 * Pull weekly change map from weeklyChanges / week / weekly / top-level fields.
 */
function extractWeeklyChangesInput(parsed) {
  const rejected = [];
  let source = null;
  let sourceKey = "";
  let weeklyChangesShape = "absent";

  for (const key of WEEKLY_CHANGES_KEYS) {
    const candidate = parsed?.[key];
    if (Array.isArray(candidate)) {
      const fromArr = weeklyChangesFromArray(candidate);
      source = fromArr.source;
      rejected.push(...fromArr.rejected);
      sourceKey = `${key}[]`;
      weeklyChangesShape = "array";
      break;
    }
    if (candidate && typeof candidate === "object") {
      source = candidate;
      sourceKey = key;
      weeklyChangesShape = "object";
      break;
    }
  }
  if (!source && parsed?.week && typeof parsed.week === "object" && !Array.isArray(parsed.week)) {
    // Prefer change-shaped week objects; still accept content maps.
    source = parsed.week;
    sourceKey = "week";
    weeklyChangesShape = "object";
  }
  if (!source && parsed?.enrichmentDraft?.week
    && typeof parsed.enrichmentDraft.week === "object"
    && !Array.isArray(parsed.enrichmentDraft.week)) {
    source = parsed.enrichmentDraft.week;
    sourceKey = "enrichmentDraft.week";
    weeklyChangesShape = "object";
  }

  if (!source) {
    source = {};
    sourceKey = "top_level_week_fields";
    WEEK_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(parsed, field)) source[field] = parsed[field];
    });
    Object.keys(WEEK_FIELD_ALIASES).forEach((alias) => {
      if (Object.prototype.hasOwnProperty.call(parsed, alias)) source[alias] = parsed[alias];
    });
    if (Object.keys(source).length) weeklyChangesShape = "object";
  }

  const weeklyIn = {};
  Object.keys(source || {}).forEach((rawField) => {
    if (/image|printable|pdf|cover/i.test(rawField)) {
      rejected.push({ field: rawField, reason: "forbidden_field", message: `Forbidden field: ${rawField}` });
      return;
    }
    // Skip nested toolkit containers unless they are known week fields
    if (rawField === "teacherToolkit" || rawField === "fieldOwnership" || rawField === "printableIds") {
      rejected.push({ field: rawField, reason: "unsupported_container", message: `Unsupported week container: ${rawField}` });
      return;
    }
    const field = normalizeWeekFieldName(rawField);
    if (!WEEK_FIELDS.includes(field)) {
      rejected.push({ field: rawField, reason: "unknown_field", message: `Unknown weekly field: ${rawField}` });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(weeklyIn, field) && rawField !== field) {
      // First canonical value wins; alias duplicate ignored.
      rejected.push({ field: rawField, reason: "alias_duplicate", message: `Alias ${rawField} ignored; ${field} already set` });
      return;
    }
    weeklyIn[field] = source[rawField];
  });

  return { weeklyIn, rejected, sourceKey, weeklyChangesShape };
}

function activityChangesShape(parsed) {
  if (!Object.prototype.hasOwnProperty.call(parsed || {}, "activities")) return "absent";
  if (Array.isArray(parsed.activities)) return "array";
  if (parsed.activities && typeof parsed.activities === "object") return "object";
  return "other";
}

/**
 * Non-sensitive composer response-shape diagnostics for Operator jobs.
 * Never include raw AI text, prompts, or secrets.
 */
function buildComposerShapeDiagnostics({
  topLevelKeys,
  detectedWrapper,
  extracted,
  accepted,
  rejected,
  parsed,
  mutationCount,
} = {}) {
  const weeklyAccepted = schema.asArray(accepted).filter((row) => row.scope === "week");
  const activityAccepted = schema.asArray(accepted).filter((row) => row.scope === "activity");
  const rejectionCodes = [...new Set(schema.asArray(rejected).map((row) => text(row.reason, 40)).filter(Boolean))];
  return {
    responseTopLevelKeys: schema.asArray(topLevelKeys).map((k) => text(k, 80)).filter(Boolean).slice(0, 40),
    detectedWrapper: detectedWrapper ? text(detectedWrapper, 40) : null,
    weeklyChangesShape: text(extracted?.weeklyChangesShape || "absent", 20) || "absent",
    weeklySourceKey: text(extracted?.sourceKey, 80) || null,
    normalizedWeeklyFieldNames: Object.keys(extracted?.weeklyIn || {}).slice(0, 32),
    acceptedWeeklyCount: weeklyAccepted.length,
    rejectedWeeklyCount: schema.asArray(rejected).filter((row) => !String(row.field || "").includes(".")).length,
    rejectionReasonCodes: rejectionCodes.slice(0, 24),
    activityChangesShape: activityChangesShape(parsed),
    acceptedActivityCount: activityAccepted.length,
    finalMutationCount: Number(mutationCount) || 0,
    // Detailed rows retained for deterministic tests / safe debugging (no raw AI text).
    expectedKeys: ["lessonId", "weeklyChanges", "activities", "songs", "books"],
    accepted: schema.asArray(accepted).slice(0, 64),
    rejected: schema.asArray(rejected).slice(0, 64).map((row) => ({
      field: text(row.field, 120),
      reason: text(row.reason, 40),
      message: text(row.message, 240),
    })),
  };
}

/**
 * Coerce plain string/array values and {text|content|value} objects into {action,value}.
 */
function coerceChangeEntry(field, raw, requestedAction) {
  const fallbackAction = text(requestedAction, 20).toUpperCase() || "IMPROVE";
  if (raw == null) {
    return { ok: false, error: `Empty change for ${field}` };
  }
  if (typeof raw === "string" || Array.isArray(raw) || typeof raw === "number") {
    return normalizeChangeEntry(field, { action: fallbackAction, value: raw });
  }
  if (typeof raw !== "object") {
    return { ok: false, error: `Malformed change for ${field}` };
  }
  if (raw.action != null || raw.value != null || raw.text != null || raw.content != null || raw.decision != null) {
    const action = text(raw.action || raw.decision, 20).toUpperCase() || fallbackAction;
    const value = raw.value != null ? raw.value : (raw.text != null ? raw.text : raw.content);
    return normalizeChangeEntry(field, { action, value });
  }
  return normalizeChangeEntry(field, raw);
}

function shouldWriteDecision(decision) {
  return ["FILL", "IMPROVE", "REPLACE", "MISSING", "WRONG"].includes(text(decision, 20).toUpperCase());
}

function mapAuditWeekField(field) {
  const f = text(field, 80);
  if (f === "vocabularyWords") return "vocabCards";
  return f;
}

/**
 * Collect only fields the model may write. KEEP fields are context-only.
 */
function collectWorkItems(plan, activities, audit, options = {}) {
  const weekRequests = [];
  const weekKeep = [];
  const activityRequests = [];
  const activityKeep = [];
  const allowedActivityIds = new Set(
    schema.asArray(activities).map((a) => text(a.id || a.itemId, 160)).filter(Boolean),
  );

  if (options.upgradeLesson !== false) {
    const draftWeek = plan?.enrichmentDraft?.week || {};
    schema.asArray(audit?.weeklyContent).forEach((fieldDec) => {
      const field = mapAuditWeekField(fieldDec.field);
      if (!WEEK_FIELDS.includes(field)) return;
      if (!shouldWriteDecision(fieldDec.decision)) {
        weekKeep.push({
          field,
          decision: "KEEP",
          reason: text(fieldDec.reason, 400),
          preview: text(fieldDec.preview, 240),
        });
        return;
      }
      let current = "";
      if (field === "prepChecklist") current = schema.asArray(draftWeek.teacherToolkit?.prepChecklist).join(" ");
      else if (field === "observationFocus") current = schema.asArray(draftWeek.teacherToolkit?.observationFocus).join(" ");
      else if (field === "milestones" || field === "vocabCards") current = schema.asArray(draftWeek[field]).join(" ");
      else current = text(draftWeek[field] || plan?.[field === "vocabCards" ? "vocabularyWords" : field], 2000);
      const decision = text(fieldDec.decision, 20).toUpperCase();
      if (wordCount(current) >= 25 && (decision === "IMPROVE" || decision === "FILL")) {
        weekKeep.push({
          field,
          decision: "KEEP",
          reason: "Existing content is already substantial.",
          preview: text(current, 240),
        });
        return;
      }
      weekRequests.push({
        field,
        action: decision === "MISSING" ? "FILL" : decision,
        reason: text(fieldDec.reason, 400),
        currentPreview: text(fieldDec.preview || current, 240),
      });
    });
  }

  if (options.upgradeActivities !== false) {
    schema.asArray(audit?.activityClassifications).forEach((actClass) => {
      const activityId = text(actClass.activityId, 160);
      if (!activityId || !allowedActivityIds.has(activityId)) return;
      if (actClass.decision === "KEEP") {
        activityKeep.push({ activityId, decision: "KEEP", title: text(actClass.title, 180) });
        return;
      }
      const activity = schema.asArray(activities).find((a) => text(a.id || a.itemId, 160) === activityId);
      const draftAct = (plan?.enrichmentDraft?.activities || {})[activityId] || {};
      const missing = schema.asArray(actClass.missingFields);
      const candidateFields = ACTIVITY_FIELDS.filter((field) => {
        if (missing.includes(field)) return true;
        return ["objective", "description", "materials", "preparation", "setup", "steps",
          "teacherLanguage", "observationOpportunities", "safetyNotes", "cleanupTips"].includes(field);
      });
      const fields = candidateFields.filter((field) => {
        if (missing.includes(field)) return true;
        let current = "";
        if (loadEnrichment()?.getCoreActivityFieldValue) {
          current = loadEnrichment().getCoreActivityFieldValue(activity, draftAct, field);
        } else {
          current = draftAct[field] != null ? draftAct[field] : activity?.[field];
        }
        const words = wordCount(Array.isArray(current) ? current.join(" ") : current);
        // Preserve strong existing content — do not send KEEP-quality fields to the model
        if (words >= 25 && actClass.decision === "IMPROVE") return false;
        if (words >= 12 && actClass.decision !== "REPLACE" && !missing.includes(field)) return false;
        return words < 12 || actClass.decision === "REPLACE" || actClass.decision === "FILL";
      }).map((field) => ({
        field,
        action: missing.includes(field)
          ? "FILL"
          : (actClass.decision === "REPLACE" ? "REPLACE" : (wordCount(
            (draftAct[field] != null ? draftAct[field] : activity?.[field]) || "",
          ) < 8 ? "FILL" : "IMPROVE")),
      }));
      if (!fields.length) {
        activityKeep.push({ activityId, decision: "KEEP", title: text(actClass.title || activity?.title, 180) });
        return;
      }
      activityRequests.push({
        activityId,
        title: text(actClass.title || activity?.title || "", 180),
        decision: text(actClass.decision, 20).toUpperCase(),
        fields,
      });
    });
  }

  const songRequests = [];
  if (options.touchSongs !== false) {
    schema.asArray(audit?.songs).forEach((songDec) => {
      if (!shouldWriteDecision(songDec.decision)) return;
      const day = text(songDec.field).replace(/^song\./, "");
      if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(day)) {
        songRequests.push({ day, action: "FILL" });
      }
    });
  }

  const bookRequest = options.touchBooks !== false
    && audit?.books
    && shouldWriteDecision(audit.books.decision)
    ? { action: text(audit.books.decision, 20).toUpperCase() === "MISSING" ? "FILL" : "IMPROVE" }
    : null;

  return {
    lessonId: text(plan?.id, 160),
    weekRequests,
    weekKeep,
    activityRequests,
    activityKeep,
    songRequests,
    bookRequest,
    hasWork: weekRequests.length + activityRequests.length + songRequests.length + (bookRequest ? 1 : 0) > 0,
  };
}

function activitySnapshot(activity, draftAct) {
  const enrich = loadEnrichment();
  const out = {
    id: text(activity?.id || activity?.itemId, 160),
    title: text(activity?.title, 180),
    dayOfWeek: text(activity?.dayOfWeek || draftAct?.dayOfWeek, 20),
    activityCategory: text(activity?.activityCategory || activity?.category || draftAct?.activityCategory, 80),
    ageModifications: text(activity?.ageModifications || draftAct?.ageModifications, 80),
    durationMinutes: Number(activity?.durationMinutes || draftAct?.durationMinutes) || null,
  };
  ACTIVITY_FIELDS.forEach((key) => {
    let val = "";
    if (enrich?.getCoreActivityFieldValue) {
      val = enrich.getCoreActivityFieldValue(activity, draftAct || {}, key);
    } else {
      val = draftAct?.[key] != null ? draftAct[key] : activity?.[key];
    }
    if (Array.isArray(val)) out[key] = val.slice(0, 12);
    else if (val != null && val !== "") out[key] = typeof val === "string" ? text(val, 1200) : val;
  });
  return out;
}

function buildComposerContext(plan, activities, audit, work) {
  const draft = plan?.enrichmentDraft && typeof plan.enrichmentDraft === "object" ? plan.enrichmentDraft : {};
  const week = draft.week || {};
  const draftActs = draft.activities || {};
  const flat = schema.asArray(activities);

  const weekContext = {};
  WEEK_FIELDS.forEach((field) => {
    if (field === "prepChecklist") {
      weekContext[field] = schema.asArray(week.teacherToolkit?.prepChecklist).slice(0, 12);
      return;
    }
    if (field === "observationFocus") {
      weekContext[field] = schema.asArray(week.teacherToolkit?.observationFocus).slice(0, 12);
      return;
    }
    if (field === "milestones" || field === "vocabCards") {
      weekContext[field] = schema.asArray(week[field]).slice(0, 16);
      return;
    }
    weekContext[field] = text(week[field] || plan?.[field], 1200);
  });

  const dayStructure = {};
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    const items = schema.asArray(plan?.dailyPlans?.[day]?.items);
    dayStructure[day] = items.map((item) => ({
      title: text(item.title, 120),
      itemId: text(item.itemId, 80),
      category: text(item.activityCategory || item.category, 60),
    }));
  });

  return {
    lesson: {
      id: text(plan?.id, 160),
      title: text(plan?.title, 180),
      age: text(plan?.age, 80),
      theme: text(plan?.theme, 120),
      plan: plan?.plan === "Pro" ? "Pro" : "Free",
    },
    currentWeek: weekContext,
    dayStructure,
    activities: flat.map((act) => {
      const id = text(act.id || act.itemId, 160);
      return activitySnapshot(act, draftActs[id] || {});
    }),
    auditSummary: {
      currentStatus: text(audit?.currentStatus, 80),
      scores: audit?.scores || {},
      teachingKitBlockers: schema.asArray(audit?.teachingKitBlockers).slice(0, 8).map((b) => text(b.message || b, 200)),
    },
    keepWeek: work.weekKeep,
    keepActivities: work.activityKeep,
    requestedWeek: work.weekRequests,
    requestedActivities: work.activityRequests,
    requestedSongs: work.songRequests,
    requestedBooks: work.bookRequest,
  };
}

function buildComposerSystemPrompt(ageRaw) {
  const standards = loadStandards();
  const standardsBlock = standards?.buildFullCurriculumStandardsPrompt
    ? standards.buildFullCurriculumStandardsPrompt(ageRaw || "Preschool")
    : "Write developmentally appropriate early childhood curriculum.";

  return [
    "You are the Little Learner Hub AI Curriculum Composer for childcare providers.",
    "Return ONLY valid JSON. No markdown fences. No commentary.",
    "Write substantial, teacher-usable curriculum content — never generic filler.",
    "Priority: (1) teacher usefulness (2) developmental appropriateness (3) activity specificity (4) weekly coherence (5) completeness (6) readiness score.",
    "KEEP means do not rewrite. Only return fields listed under requestedWeek / requestedActivities / requestedSongs / requestedBooks.",
    "Do not change lessonId, title, age, or access plan.",
    "Do not invent image or printable fields.",
    "Do not invent famous copyrighted song lyrics or book titles you do not know exist; for books prefer classroom-library search guidance.",
    "Activities in one week must feel intentionally connected to the theme without repeating the same idea.",
    "",
    "Age / Master standard:",
    standardsBlock,
    "",
    "JSON shape example:",
    '{"lessonId":"...","weeklyChanges":{"weeklyOverview":{"action":"IMPROVE","value":"..."}},"activities":[{"activityId":"...","changes":{"objective":{"action":"FILL","value":"..."},"teacherLanguage":{"action":"IMPROVE","value":"q1\\nq2\\nq3\\nq4"}}}],"songs":[{"linkedWeekday":"monday","title":"Original classroom song","notes":"...","teacherDirections":"..."}],"books":[{"title":"Search classroom library for ...","author":"","notes":"...","whyThisBook":"..."}]}',
  ].join("\n");
}

function buildComposerUserPrompt(context) {
  return [
    "Compose ONLY the requested field changes for this lesson.",
    "Preserve all KEEP content exactly (do not return KEEP fields as replacements).",
    "Make IMPROVE fields substantially better while retaining useful specifics.",
    "Make FILL fields complete enough that a teacher can run the activity from the plan.",
    "Reject generic phrasing like \"Children will explore X\", \"Set out materials\", or \"What do you see?\".",
    "",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function rejectGenericValue(field, value) {
  const sample = Array.isArray(value) ? value.join(" ") : text(value);
  if (!sample) return `Empty value for ${field}`;
  if (GENERIC_FILLER_RE.test(sample) && wordCount(sample) < 40) {
    return `Generic filler rejected for ${field}`;
  }
  if (typeof value === "string" && wordCount(value) < 8
    && !["vocabCards", "vocabulary", "prepChecklist", "milestones"].includes(field)) {
    return `Value too short for ${field}`;
  }
  return null;
}

function normalizeChangeEntry(field, raw) {
  if (!raw || typeof raw !== "object") return { ok: false, error: `Malformed change for ${field}` };
  const action = text(raw.action, 20).toUpperCase();
  if (!isWriteAction(action)) {
    return { ok: false, error: `Unsupported action for ${field}: ${action}` };
  }
  let value = raw.value;
  if (field === "prepChecklist" || field === "observationFocus" || field === "milestones"
    || field === "vocabCards" || field === "teacherTips" || field === "vocabulary"
    || field === "observationPrompts") {
    if (typeof value === "string") {
      value = value.split(/\n|·|;/).map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(value)) return { ok: false, error: `${field} must be an array` };
    value = value.map((v) => text(v, 400)).filter(Boolean).slice(0, 16);
  } else if (field === "substitutions") {
    if (!Array.isArray(value)) return { ok: false, error: "substitutions must be an array" };
    value = value.map((row) => {
      if (typeof row === "string") return { need: text(row, 120), use: "" };
      return { need: text(row?.need, 120), use: text(row?.use, 120) };
    }).filter((row) => row.need).slice(0, 12);
  } else {
    value = text(value, 4000);
  }
  const genericErr = rejectGenericValue(field, value);
  if (genericErr) return { ok: false, error: genericErr };
  return { ok: true, action, value };
}

/**
 * Validate model JSON against the work request. Rejects identity / unknown fields / bad IDs.
 * Normalizes known wrappers / aliases so large valid AI payloads are not discarded as empty_changes.
 */
function validateComposerOutput(rawText, work, plan) {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch (_e) {
    return {
      ok: false,
      code: "malformed_output",
      error: "AI returned malformed JSON.",
      diagnostics: buildComposerShapeDiagnostics({
        topLevelKeys: [],
        detectedWrapper: null,
        extracted: { weeklyChangesShape: "absent", sourceKey: "", weeklyIn: {} },
        accepted: [],
        rejected: [{ field: "root", reason: "malformed_json", message: "malformed JSON" }],
        parsed: null,
        mutationCount: 0,
      }),
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      code: "malformed_output",
      error: "AI returned non-object JSON.",
      diagnostics: buildComposerShapeDiagnostics({
        topLevelKeys: [],
        detectedWrapper: null,
        extracted: { weeklyChangesShape: "absent", sourceKey: "", weeklyIn: {} },
        accepted: [],
        rejected: [{ field: "root", reason: "malformed_json", message: "non-object JSON" }],
        parsed: null,
        mutationCount: 0,
      }),
    };
  }

  const topLevelKeys = Object.keys(parsed);
  const unwrapped = unwrapComposerPayload(parsed);
  const detectedWrapper = unwrapped.detectedWrapper;
  parsed = unwrapped.payload;

  const lessonId = text(parsed.lessonId, 160);
  if (lessonId && lessonId !== work.lessonId) {
    return { ok: false, code: "lesson_id_mismatch", error: "AI attempted to change lessonId." };
  }
  if (parsed.title != null && text(parsed.title, 180) && text(parsed.title, 180) !== text(plan?.title, 180)) {
    return { ok: false, code: "title_mutation", error: "AI attempted to change title." };
  }
  if (parsed.age != null && text(parsed.age, 80) && text(parsed.age, 80) !== text(plan?.age, 80)) {
    return { ok: false, code: "age_mutation", error: "AI attempted to change age." };
  }
  if (parsed.plan != null && text(parsed.plan, 20)) {
    const next = text(parsed.plan, 20) === "Pro" ? "Pro" : "Free";
    const cur = plan?.plan === "Pro" ? "Pro" : "Free";
    if (next !== cur) {
      return { ok: false, code: "access_plan_mutation", error: "AI attempted to change access plan." };
    }
  }

  const allowedWeek = new Map(work.weekRequests.map((r) => [r.field, r]));
  const weeklyChanges = {};
  const accepted = [];
  const rejected = [];
  const extracted = extractWeeklyChangesInput(parsed);

  function shapeDiagnostics(extraRejected = [], mutationCount = 0) {
    return buildComposerShapeDiagnostics({
      topLevelKeys,
      detectedWrapper,
      extracted,
      accepted,
      rejected: [...rejected, ...extraRejected],
      parsed,
      mutationCount,
    });
  }

  // Hard-fail unsupported / forbidden / conflicting week keys (do not silently drop into empty_changes).
  const hardWeekReject = extracted.rejected.find((row) => (
    row.reason === "unknown_field"
    || row.reason === "forbidden_field"
    || row.reason === "conflict_duplicate"
  ));
  if (hardWeekReject) {
    return {
      ok: false,
      code: hardWeekReject.reason,
      error: hardWeekReject.message,
      diagnostics: shapeDiagnostics(extracted.rejected, 0),
    };
  }
  extracted.rejected.forEach((row) => rejected.push(row));

  for (const field of Object.keys(extracted.weeklyIn)) {
    if (/image|printable|pdf|cover/i.test(field)) {
      return {
        ok: false,
        code: "forbidden_field",
        error: `Forbidden field: ${field}`,
        diagnostics: shapeDiagnostics([{ field, reason: "forbidden_field", message: `Forbidden field: ${field}` }]),
      };
    }
    if (!WEEK_FIELDS.includes(field)) {
      return {
        ok: false,
        code: "unknown_field",
        error: `Unknown weekly field: ${field}`,
        diagnostics: shapeDiagnostics([{ field, reason: "unknown_field", message: `Unknown weekly field: ${field}` }]),
      };
    }
    if (!allowedWeek.has(field)) {
      // Soft-skip KEEP / out-of-scope week fields so full-lesson dumps still yield requested mutations.
      rejected.push({
        field,
        reason: "unrequested_field",
        message: `Weekly field not requested (KEEP/out of scope): ${field}`,
      });
      continue;
    }
    const requestedAction = allowedWeek.get(field)?.action || allowedWeek.get(field)?.decision;
    const norm = coerceChangeEntry(field, extracted.weeklyIn[field], requestedAction);
    if (!norm.ok) {
      return {
        ok: false,
        code: "invalid_change",
        error: norm.error,
        diagnostics: shapeDiagnostics([{ field, reason: "invalid_change", message: norm.error }]),
      };
    }
    weeklyChanges[field] = { action: norm.action, value: norm.value };
    accepted.push({ scope: "week", field, action: norm.action });
  }

  const allowedActs = new Map(work.activityRequests.map((r) => [r.activityId, r]));
  const activitiesOut = [];
  for (const row of schema.asArray(parsed.activities)) {
    const activityId = text(row?.activityId || row?.id, 160);
    if (!activityId) {
      return { ok: false, code: "malformed_output", error: "Activity change missing activityId." };
    }
    if (!allowedActs.has(activityId)) {
      return {
        ok: false,
        code: "unknown_activity_id",
        error: `Unknown or KEEP activityId: ${activityId}`,
        diagnostics: shapeDiagnostics([{
          field: activityId,
          reason: "unknown_activity_id",
          message: `Unknown or KEEP activityId: ${activityId}`,
        }], Object.keys(weeklyChanges).length),
      };
    }
    const allowedFields = new Map(allowedActs.get(activityId).fields.map((f) => [f.field, f]));
    const changes = {};
    const rawChanges = row.changes && typeof row.changes === "object" ? row.changes : {};
    // Allow activity fields at top-level of the row (alias shape)
    const fieldSource = Object.keys(rawChanges).length
      ? rawChanges
      : Object.fromEntries(
        ACTIVITY_FIELDS
          .filter((f) => Object.prototype.hasOwnProperty.call(row, f))
          .map((f) => [f, row[f]]),
      );
    for (const field of Object.keys(fieldSource)) {
      if (/image|printable|pdf|cover|setupImage|exampleImage/i.test(field)) {
        return { ok: false, code: "forbidden_field", error: `Forbidden activity field: ${field}` };
      }
      if (!ACTIVITY_FIELDS.includes(field)) {
        return {
          ok: false,
          code: "unknown_field",
          error: `Unknown activity field: ${field}`,
        };
      }
      if (!allowedFields.has(field)) {
        if (!["teacherTips", "vocabulary", "observationPrompts", "substitutions",
          "indoorAlternatives", "outdoorAlternatives", "adaptations", "extensions"].includes(field)) {
          rejected.push({
            field: `${activityId}.${field}`,
            reason: "unrequested_field",
            message: `Activity field not requested: ${activityId}.${field}`,
          });
          continue;
        }
      }
      const requestedAction = allowedFields.get(field)?.action || allowedFields.get(field)?.decision;
      const norm = coerceChangeEntry(field, fieldSource[field], requestedAction);
      if (!norm.ok) {
        return {
          ok: false,
          code: "invalid_change",
          error: `${activityId}.${norm.error}`,
        };
      }
      changes[field] = { action: norm.action, value: norm.value };
      accepted.push({ scope: "activity", activityId, field, action: norm.action });
    }
    if (Object.keys(changes).length) {
      activitiesOut.push({ activityId, changes });
    }
  }

  const songs = [];
  if (work.songRequests.length) {
    const allowedDays = new Set(work.songRequests.map((s) => s.day));
    for (const song of schema.asArray(parsed.songs)) {
      const day = text(song?.linkedWeekday || song?.suggestedWeekday, 20).toLowerCase();
      if (!allowedDays.has(day)) {
        return { ok: false, code: "unrequested_song", error: `Song day not requested: ${day}` };
      }
      songs.push({
        title: text(song.title, 180) || `${text(plan?.theme, 40)} ${day} song`,
        notes: text(song.notes, 600),
        linkedWeekday: day,
        rightsStatus: "original",
        allowPrintLyrics: true,
        teacherDirections: text(song.teacherDirections, 600),
      });
      accepted.push({ scope: "song", field: day });
    }
  } else if (schema.asArray(parsed.songs).length) {
    return {
      ok: false,
      code: "unrequested_songs",
      error: "Songs returned but not requested.",
      diagnostics: shapeDiagnostics([{ field: "songs", reason: "unrequested_songs", message: "Songs returned but not requested." }]),
    };
  }

  let books = null;
  if (work.bookRequest) {
    const list = schema.asArray(parsed.books);
    if (list.length) {
      books = list.slice(0, 3).map((b) => ({
        title: text(b.title, 180),
        author: text(b.author, 120),
        notes: text(b.notes, 800),
        whyThisBook: text(b.whyThisBook, 800),
        beforeReadingQuestions: schema.asArray(b.beforeReadingQuestions).map((q) => text(q, 200)).slice(0, 4),
        duringReadingPrompts: schema.asArray(b.duringReadingPrompts).map((q) => text(q, 200)).slice(0, 4),
        afterReadingQuestions: schema.asArray(b.afterReadingQuestions).map((q) => text(q, 200)).slice(0, 4),
      })).filter((b) => b.title);
      if (books.length) accepted.push({ scope: "books", count: books.length });
    }
  } else if (schema.asArray(parsed.books).length) {
    return {
      ok: false,
      code: "unrequested_books",
      error: "Books returned but not requested.",
      diagnostics: shapeDiagnostics([{ field: "books", reason: "unrequested_books", message: "Books returned but not requested." }]),
    };
  }

  const mutationCount = Object.keys(weeklyChanges).length
    + activitiesOut.reduce((n, row) => n + Object.keys(row.changes || {}).length, 0)
    + songs.length
    + (books && books.length ? books.length : 0);

  const diagnostics = shapeDiagnostics([], mutationCount);

  if (!mutationCount) {
    // Distinguish: work was requested but nothing usable survived normalization/validation.
    return {
      ok: false,
      code: "empty_changes",
      error: "AI returned no usable field changes.",
      diagnostics,
    };
  }

  return {
    ok: true,
    plan: {
      lessonId: work.lessonId,
      weeklyChanges,
      activities: activitiesOut,
      songs,
      books,
    },
    diagnostics,
  };
}

function applyComposerPlanToDraft(previousDraft, validatedPlan, work) {
  const draft = previousDraft && typeof previousDraft === "object"
    ? JSON.parse(JSON.stringify(previousDraft))
    : { week: {}, activities: {} };
  if (!draft.week || typeof draft.week !== "object") draft.week = {};
  if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};

  const changed = [];
  const intended = { week: {}, activities: {} };
  const kept = [
    ...work.weekKeep.map((k) => `week.${k.field}`),
    ...work.activityKeep.map((k) => `activity.${k.activityId}`),
  ];

  Object.entries(validatedPlan.weeklyChanges || {}).forEach(([field, entry]) => {
    if (field === "prepChecklist") {
      if (!draft.week.teacherToolkit || typeof draft.week.teacherToolkit !== "object") draft.week.teacherToolkit = {};
      draft.week.teacherToolkit.prepChecklist = entry.value;
      intended.week.prepChecklist = entry.value;
      changed.push({ path: "week.teacherToolkit.prepChecklist", decision: entry.action, source: "ai" });
      return;
    }
    if (field === "observationFocus") {
      if (!draft.week.teacherToolkit || typeof draft.week.teacherToolkit !== "object") draft.week.teacherToolkit = {};
      draft.week.teacherToolkit.observationFocus = entry.value;
      draft.week.observationOpportunities = Array.isArray(entry.value) ? entry.value.join(" ") : text(entry.value);
      intended.week.observationFocus = entry.value;
      changed.push({ path: "week.teacherToolkit.observationFocus", decision: entry.action, source: "ai" });
      return;
    }
    if (field === "teacherPreparation") {
      draft.week.teacherPreparation = entry.value;
      if (!draft.week.teacherToolkit || typeof draft.week.teacherToolkit !== "object") draft.week.teacherToolkit = {};
      draft.week.teacherToolkit.teacherPreparation = entry.value;
      intended.week.teacherPreparation = entry.value;
      changed.push({ path: "week.teacherPreparation", decision: entry.action, source: "ai" });
      return;
    }
    if (field === "objectives") {
      draft.week.objectives = entry.value;
      if (!draft.week.fieldOwnership || typeof draft.week.fieldOwnership !== "object") draft.week.fieldOwnership = {};
      draft.week.fieldOwnership.objectives = true;
      intended.week.objectives = entry.value;
      changed.push({ path: "week.objectives", decision: entry.action, source: "ai" });
      return;
    }
    draft.week[field] = entry.value;
    intended.week[field] = entry.value;
    changed.push({ path: `week.${field}`, decision: entry.action, source: "ai" });
  });

  schema.asArray(validatedPlan.activities).forEach((row) => {
    const id = text(row.activityId, 160);
    if (!draft.activities[id] || typeof draft.activities[id] !== "object") draft.activities[id] = {};
    const intendedAct = {};
    Object.entries(row.changes || {}).forEach(([field, entry]) => {
      draft.activities[id][field] = entry.value;
      intendedAct[field] = entry.value;
      changed.push({
        path: `activity.${id}.${field}`,
        activityId: id,
        decision: entry.action,
        source: "ai",
      });
    });
    if (Object.keys(intendedAct).length) intended.activities[id] = intendedAct;
  });

  if (schema.asArray(validatedPlan.songs).length) {
    if (!Array.isArray(draft.week.songs)) draft.week.songs = [];
    validatedPlan.songs.forEach((song) => {
      const exists = draft.week.songs.some(
        (s) => text(s.linkedWeekday || s.suggestedWeekday).toLowerCase() === song.linkedWeekday,
      );
      if (exists) return;
      draft.week.songs.push(song);
      changed.push({ path: `week.songs.${song.linkedWeekday}`, decision: "FILL", source: "ai", value: song.title });
    });
  }

  if (schema.asArray(validatedPlan.books).length) {
    draft.week.books = validatedPlan.books;
    intended.week.books = validatedPlan.books;
    changed.push({ path: "week.books", decision: "FILL", source: "ai" });
  }

  return { enrichmentDraft: draft, changed, intended, kept };
}

/**
 * One structured AI call per lesson (or no-op if nothing to write).
 */
async function composeUpgradeContent({
  plan,
  activities,
  audit,
  callAi,
  upgradeLesson = true,
  upgradeActivities = true,
  touchSongs = true,
  touchBooks = true,
} = {}) {
  const work = collectWorkItems(plan, activities, audit, {
    upgradeLesson,
    upgradeActivities,
    touchSongs,
    touchBooks,
  });
  if (!work.hasWork) {
    return {
      ok: true,
      skipped: true,
      code: "NO_CHANGES_NEEDED",
      work,
      usage: { calls: 0, inputChars: 0, outputChars: 0 },
      validatedPlan: null,
    };
  }
  if (typeof callAi !== "function") {
    return {
      ok: false,
      code: "ai_required",
      error: "Structured AI composer requires callAi. Deterministic filler is disabled.",
      work,
      usage: { calls: 0, inputChars: 0, outputChars: 0 },
    };
  }

  const context = buildComposerContext(plan, activities, audit, work);
  const systemPrompt = buildComposerSystemPrompt(plan?.age);
  const userPrompt = buildComposerUserPrompt(context);
  let raw;
  try {
    raw = await callAi(systemPrompt, userPrompt);
  } catch (error) {
    return {
      ok: false,
      code: "ai_call_failed",
      error: text(error?.message || "AI call failed", 500),
      work,
      usage: { calls: 1, inputChars: systemPrompt.length + userPrompt.length, outputChars: 0 },
    };
  }

  const validated = validateComposerOutput(raw, work, plan);
  const usage = {
    calls: 1,
    inputChars: systemPrompt.length + userPrompt.length,
    outputChars: String(raw || "").length,
  };
  if (!validated.ok) {
    return {
      ok: false,
      code: validated.code || "ai_validation_failed",
      error: validated.error || "AI output rejected.",
      work,
      usage,
      diagnostics: validated.diagnostics || null,
      rawPreview: text(raw, 400),
    };
  }
  return {
    ok: true,
    skipped: false,
    work,
    usage,
    validatedPlan: validated.plan,
    diagnostics: validated.diagnostics || null,
  };
}

/**
 * Deterministic structured fixture for NODE_ENV=test / LLH_OPERATOR_AI_FIXTURE.
 * Parses the composer user prompt context and fills only requested fields with
 * lesson-specific (not generic) mock content. Never used as a silent production fallback.
 */
function buildOperatorAiFixtureResponse(userPrompt) {
  let context = {};
  try {
    const jsonStart = String(userPrompt).indexOf("{");
    context = JSON.parse(String(userPrompt).slice(jsonStart));
  } catch (_e) {
    context = {};
  }
  const lesson = context.lesson || {};
  const theme = text(lesson.theme || "theme", 80);
  const age = text(lesson.age || "preschool", 80);
  const weeklyChanges = {};
  schema.asArray(context.requestedWeek).forEach((req) => {
    const field = text(req.field, 80);
    if (field === "prepChecklist" || field === "milestones" || field === "vocabCards" || field === "observationFocus") {
      weeklyChanges[field] = {
        action: req.action || "FILL",
        value: field === "vocabCards"
          ? [theme.toLowerCase(), "observe", "gentle", "share"]
          : [
            `${theme} materials ready for ${age}`,
            `Observe how children engage with ${theme} invitations`,
            "Reset the table between groups",
          ],
      };
      return;
    }
    weeklyChanges[field] = {
      action: req.action || "FILL",
      value: [
        `This ${age} week centers on ${theme} through concrete classroom play.`,
        `Teachers guide noticing, language, and turn-taking while children explore ${theme} materials across the week.`,
        "Each day builds on the previous invitation so the theme stays coherent without repeating the same task.",
      ].join(" "),
    };
  });

  const activities = schema.asArray(context.requestedActivities).map((req) => {
    const title = text(req.title || req.activityId, 120);
    const changes = {};
    schema.asArray(req.fields).forEach((f) => {
      const field = text(f.field, 80);
      if (field === "teacherTips" || field === "vocabulary" || field === "observationPrompts") {
        changes[field] = {
          action: f.action || "FILL",
          value: field === "vocabulary"
            ? [theme.toLowerCase(), "roll", "press", "notice"]
            : [
              `Stay close during ${title} and narrate what children try with the ${theme} materials.`,
              `Offer a simpler and stretch version so mixed ages can join ${title}.`,
            ],
        };
        return;
      }
      if (field === "teacherLanguage") {
        changes[field] = {
          action: f.action || "IMPROVE",
          value: [
            `What happens when you try ${title} with these ${theme} materials?`,
            "How does it feel or move when you change your action?",
            "What track, mark, or change did you notice?",
            "How can we share so everyone gets a turn?",
          ].join("\n"),
        };
        return;
      }
      if (field === "steps") {
        changes[field] = {
          action: f.action || "FILL",
          value: [
            `1. Invite 2–4 children to the ${title} space and name the ${theme} materials.`,
            "2. Model one simple action, then hand materials to children.",
            "3. Coach language, turn-taking, and safe tool use nearby.",
            "4. Ask children what changed and what they want to try next.",
            "5. Give a calm 2-minute warning, then clean up together.",
          ].join("\n"),
        };
        return;
      }
      changes[field] = {
        action: f.action || "FILL",
        value: [
          `For ${title}, prepare ${theme}-related materials sized for ${age}.`,
          "Keep the invitation concrete, short, and play-based so a teacher can run it from this plan without rewriting.",
          `Focus on what children actually do during ${title}: noticing, trying, talking, and repeating.`,
        ].join(" "),
      };
    });
    return { activityId: text(req.activityId, 160), changes };
  });

  const songs = schema.asArray(context.requestedSongs).map((s) => ({
    linkedWeekday: s.day,
    title: `${theme} ${s.day} song`,
    notes: `Original classroom chant for ${theme} circle.`,
    teacherDirections: "Sing once with motions, then invite children to echo one line.",
  }));

  const books = context.requestedBooks
    ? [{
      title: `Search your classroom library for a ${theme} picture book`,
      author: "",
      notes: "Choose a familiar owned book. Ask what children notice on the cover and one detail in the pictures.",
      whyThisBook: "Uses an existing classroom book rather than inventing a title.",
      beforeReadingQuestions: [`What do you notice that connects to ${theme}?`],
      duringReadingPrompts: ["What is happening in this picture?"],
      afterReadingQuestions: ["What part would you like to try in play today?"],
    }]
    : undefined;

  return JSON.stringify({
    lessonId: text(lesson.id, 160),
    weeklyChanges,
    activities,
    songs,
    books,
  });
}

module.exports = {
  WEEK_FIELDS,
  ACTIVITY_FIELDS,
  WRITE_ACTIONS,
  WEEK_FIELD_ALIASES,
  collectWorkItems,
  buildComposerContext,
  buildComposerSystemPrompt,
  buildComposerUserPrompt,
  validateComposerOutput,
  applyComposerPlanToDraft,
  composeUpgradeContent,
  buildOperatorAiFixtureResponse,
  stripJsonFences,
  unwrapComposerPayload,
  extractWeeklyChangesInput,
  normalizeWeekFieldName,
  coerceChangeEntry,
  buildComposerShapeDiagnostics,
  weeklyChangesFromArray,
};
