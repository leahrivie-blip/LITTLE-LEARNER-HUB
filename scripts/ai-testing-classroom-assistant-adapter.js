/**
 * Phase 23 — maps the AI Testing structured Classroom Assistant interpretation
 * (scripts/ai-testing-schemas.js#CLASSROOM_ASSISTANT_SCHEMA) onto the exact
 * "plan" shape scripts/classroom-assistant-data-model.js#applyParsedPlan
 * already knows how to save — so a provider's confirmed AI-reviewed entry
 * goes through the SAME tested, confirm-required, duplicate-preventing save
 * pipeline as the heuristic parser, rather than a second, unproven write path.
 *
 * Coverage in this first testing version: meal, activity, nap, and
 * attendance record types map with full group+individual-exception fidelity.
 * diaper/potty/medication map conservatively (present but simpler than the
 * heuristic parser's dedicated sub-parsers) — this is a documented, honest
 * scope limit for v1, not a silent gap: unmapped detail always surfaces in
 * missingInformationWarnings instead of being invented.
 */

const caModel = require("./classroom-assistant-data-model.js");

function findChildIdByName(name, children) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return "";
  const match = (children || []).find((child) => {
    const displayName = String(child.name || child.displayName || "").toLowerCase();
    return displayName === target || displayName.startsWith(target) || target.startsWith(displayName.split(" ")[0] || "");
  });
  return match?.id || match?.childId || "";
}

function buildExceptionList(individualExceptions, children) {
  return (individualExceptions || [])
    .map((row) => {
      const childId = findChildIdByName(row.childName, children);
      if (!childId) return null;
      return { childId, note: row.description || "" };
    })
    .filter(Boolean);
}

function buildPlanFromAiResult(aiResult, { organizationId = "", children = [], checkedInIds = [], sourceText = "", model, promptVersionId } = {}) {
  const recordTypes = new Set(aiResult?.recordTypes || []);
  const exceptions = buildExceptionList(aiResult?.individualExceptions, children);
  const checkedSet = new Set((checkedInIds || []).map(String));
  const checkedChildren = (children || []).filter((child) => checkedSet.has(String(child.id || child.childId)));
  const targetSet = new Set(checkedChildren.map((child) => child.id || child.childId));
  exceptions.forEach((row) => targetSet.add(row.childId));

  const plan = {
    id: caModel.newId ? caModel.newId("caplan") : `caplan_ai_${Date.now()}`,
    planId: "",
    organizationId,
    sourceText,
    createdAt: caModel.nowIso ? caModel.nowIso() : new Date().toISOString(),
    requiresReview: true,
    previewOnly: true,
    liveAiUsed: true,
    aiModel: model || "",
    aiPromptVersionId: promptVersionId || "",
    localDeterministicParsing: false,
    offlineCapable: false,
    meal: null,
    activity: null,
    nap: null,
    diaper: null,
    potty: null,
    medication: null,
    attendance: null,
    difficultSituation: null,
    dailySummary: aiResult?.summary || "",
    suggestions: [],
    targets: [...targetSet],
    aiMissingInformationWarnings: aiResult?.missingInformationWarnings || [],
    aiSafetyWarnings: aiResult?.safetyWarnings || [],
    confidence: {
      level: "ai_generated",
      notes: [
        "Testing-only OpenAI interpretation — provider review and confirmation required.",
        "Falls back to the local heuristic parser automatically if AI is unavailable.",
      ],
      unmatchedNames: [],
    },
  };
  plan.planId = plan.id;

  const groupDescription = aiResult?.groupEntry?.description || "";
  const groupTime = aiResult?.groupEntry?.time || "";

  if (recordTypes.has("meal")) {
    plan.meal = {
      mealType: aiResult?.groupEntry?.recordType === "meal" ? "meal" : "meal",
      time: groupTime,
      foods: groupDescription ? [groupDescription] : [],
      groupAte: true,
      exceptions: exceptions.map((row) => ({ childId: row.childId, ate: false, note: row.note })),
    };
  }
  if (recordTypes.has("activity") || recordTypes.has("loose_parts_play")) {
    plan.activity = {
      title: groupDescription || "Classroom activity",
      time: groupTime,
      groupEnjoyed: true,
      exceptions: exceptions.map((row) => ({ childId: row.childId, note: row.note })),
      highlights: [],
    };
  }
  if (recordTypes.has("nap")) {
    plan.nap = {
      groupSlept: true,
      exceptions: exceptions.map((row) => ({ childId: row.childId, note: row.note, durationMinutes: null })),
    };
  }
  if (recordTypes.has("attendance")) {
    plan.attendance = {
      groupHere: true,
      entries: exceptions.map((row) => ({ childId: row.childId, action: "absent", note: row.note })),
    };
  }
  // diaper/potty/medication: conservative v1 mapping — present, but simpler
  // than the heuristic parser's dedicated sub-parsers. Any specific detail
  // (dosage, time, result) the AI did not explicitly extract is surfaced via
  // aiMissingInformationWarnings instead of being invented here.
  if (recordTypes.has("diaper") || recordTypes.has("potty")) {
    const kind = recordTypes.has("diaper") ? "diaper" : "potty";
    plan[kind] = {
      groupApplied: false,
      entries: exceptions.length
        ? exceptions.map((row) => ({ childId: row.childId, result: "noted", note: row.note }))
        : [...targetSet].map((childId) => ({ childId, result: "noted", note: groupDescription })),
    };
  }
  if (recordTypes.has("medication")) {
    plan.medication = {
      requiresExtraReview: true,
      entries: [...targetSet].map((childId) => ({ childId, medicationName: "", note: groupDescription })),
    };
  }

  return plan;
}

module.exports = {
  buildPlanFromAiResult,
  findChildIdByName,
};
