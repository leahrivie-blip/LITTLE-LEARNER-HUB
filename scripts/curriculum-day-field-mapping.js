/**
 * Day-field placement validation for lesson plans.
 * Detects family-facing language in classroom schedules, safety language in
 * observations, and adaptation language in family connections.
 *
 * Report-only: never rewrites or publishes curriculum content.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHCurriculumDayFieldMapping = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);

  const FAMILY_FACING = /\b(ask your child|invite families|send (one|a|home)|at home|someone at home|families to|talk about .+ at home|no food needs to be sent|home-language|pickup)\b/i;
  const SAFETY_LANGUAGE = /\b(supervis(e|ion)|choking|allergy|allergies|mouthing-safe|latex|sanitize|sanitation|hazard|sharp edges|staple-free|wipe spills|constant supervision|non-toxic|smocks?|clear (walkways|paths)|keep floors dry)\b/i;
  const ADAPTATION_LANGUAGE = /\b(offer real photos|two-choice|extend with|use fewer|picture(-| )labeled|non-?touch|dot cards|defined building zone|seated movements?|extra processing|larger props|home-language vocabulary|dry (brushing|tracing|fine-motor)|no-water option|partner roles)\b/i;
  const OBSERVATION_LANGUAGE = /\b(listen for|document |notice |watch |record |look for|observable|descriptive words|planning language|negotiation|mark making|grip strength|empathy|counting accuracy)\b/i;
  const OUTDOOR_MOVEMENT = /\b(outdoor|outside|gross motor|run|climb|trail|yard|playground|movement path|nature walk|sidewalk|chalk)\b/i;

  function text(value) {
    if (Array.isArray(value)) {
      return value.map((item) => text(item)).filter(Boolean).join("\n");
    }
    if (value && typeof value === "object") {
      return text(value.label || value.text || value.title || value.prompt || "");
    }
    return String(value == null ? "" : value).trim();
  }

  function clip(value, max = 160) {
    const raw = text(value).replace(/\s+/g, " ");
    if (raw.length <= max) return raw;
    return `${raw.slice(0, max - 1)}…`;
  }

  function dayPlanFor(plan, day) {
    return (plan && plan.dailyPlans && plan.dailyPlans[day]) || {};
  }

  function fieldBundle(dayPlan) {
    return {
      schedule: text(dayPlan.schedule),
      circleTime: text(dayPlan.circleTime),
      outdoorPlay: text(dayPlan.outdoorPlay || dayPlan.outdoor || dayPlan.outdoorOption),
      familyConnection: text(dayPlan.familyConnection),
      observations: text(dayPlan.observations || dayPlan.observationFocus),
      safetyNotes: text(dayPlan.safetyNotes || dayPlan.safety),
      adaptations: text(dayPlan.adaptations || dayPlan.support || dayPlan.challenge || dayPlan.differentiation),
      teacherQuestions: text(dayPlan.suggestedQuestions || dayPlan.teacherQuestions || dayPlan.questions),
      transitions: text(dayPlan.transitions),
    };
  }

  /**
   * Validate one weekday's authored fields for misplaced content.
   * @returns {{ day: string, issues: Array<object>, fields: object }}
   */
  function validateDayFieldMapping(dayPlan, day = "") {
    const fields = fieldBundle(dayPlan || {});
    const issues = [];

    function push(code, field, message, evidence) {
      issues.push({
        code,
        day: day || "",
        field,
        message,
        evidence: clip(evidence),
        expected: expectedFor(field),
      });
    }

    if (fields.schedule && FAMILY_FACING.test(fields.schedule)) {
      push("family_in_schedule", "schedule", "Family-facing phrasing appears inside Schedule.", fields.schedule);
    }
    if (fields.circleTime && FAMILY_FACING.test(fields.circleTime)) {
      push("family_in_circle_time", "circleTime", "Family-facing phrasing appears inside Circle Time.", fields.circleTime);
    }
    if (fields.transitions && FAMILY_FACING.test(fields.transitions)) {
      push("family_in_transitions", "transitions", "Family-facing phrasing appears inside Transitions.", fields.transitions);
    }

    if (fields.outdoorPlay && OBSERVATION_LANGUAGE.test(fields.outdoorPlay) && !OUTDOOR_MOVEMENT.test(fields.outdoorPlay)) {
      push(
        "observation_in_outdoor_play",
        "outdoorPlay",
        "Observation/documentation language appears inside Outdoor Play without outdoor movement cues.",
        fields.outdoorPlay,
      );
    }

    if (fields.familyConnection && ADAPTATION_LANGUAGE.test(fields.familyConnection)) {
      push(
        "adaptation_in_family_connection",
        "familyConnection",
        "Differentiation / adaptation language appears inside Family Connection.",
        fields.familyConnection,
      );
    }
    if (fields.familyConnection && SAFETY_LANGUAGE.test(fields.familyConnection) && !FAMILY_FACING.test(fields.familyConnection)) {
      push(
        "safety_in_family_connection",
        "familyConnection",
        "Safety / material guidance appears inside Family Connection.",
        fields.familyConnection,
      );
    }

    if (fields.observations && SAFETY_LANGUAGE.test(fields.observations) && !OBSERVATION_LANGUAGE.test(fields.observations)) {
      push(
        "safety_in_observations",
        "observations",
        "Safety / material guidance appears inside Observation Focus.",
        fields.observations,
      );
    }

    if (fields.circleTime && ADAPTATION_LANGUAGE.test(fields.circleTime)) {
      push(
        "adaptation_in_circle_time",
        "circleTime",
        "Differentiation language appears inside Circle Time.",
        fields.circleTime,
      );
    }

    if (fields.schedule && SAFETY_LANGUAGE.test(fields.schedule)) {
      push("safety_in_schedule", "schedule", "Safety language appears inside Schedule.", fields.schedule);
    }

    return { day: day || "", issues, fields };
  }

  function expectedFor(field) {
    const map = {
      schedule: "Classroom sequence or routine only",
      circleTime: "Teacher-led group experience only",
      outdoorPlay: "Realistic outdoor movement, exploration, or play",
      familyConnection: "Simple optional home connection written for families",
      observations: "Observable child behavior tied to the day’s objectives",
      safetyNotes: "Hazards, supervision, choking/allergy/sanitation guidance",
      adaptations: "Differentiation / support and challenge only",
      teacherQuestions: "Open-ended prompts used during the activity",
      transitions: "Classroom transition cues only",
    };
    return map[field] || "";
  }

  /**
   * Audit all five weekdays on a lesson plan. Does not mutate the plan.
   */
  function auditLessonDayFieldMappings(plan) {
    const days = WEEKDAYS.map((day) => validateDayFieldMapping(dayPlanFor(plan, day), day));
    const issues = days.flatMap((entry) => entry.issues);
    return {
      planId: text(plan && plan.id),
      title: text(plan && plan.title),
      days,
      issues,
      issueCount: issues.length,
      daysWithIssues: days.filter((entry) => entry.issues.length).map((entry) => entry.day),
      ok: issues.length === 0,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Convert audit issues into quality-review finding shapes (non-mutating). */
  function findingsFromDayFieldAudit(audit, findingFactory) {
    const make = typeof findingFactory === "function"
      ? findingFactory
      : (row) => row;
    return (audit?.issues || []).map((issue) => make({
      code: issue.code,
      section: issue.field === "familyConnection" ? "family"
        : issue.field === "observations" ? "observations"
          : issue.field === "safetyNotes" || issue.code.includes("safety") ? "safety"
            : issue.field === "outdoorPlay" ? "outdoor"
              : "realistic",
      severity: "blocking",
      blocking: true,
      message: `${issue.day ? `${issue.day}: ` : ""}${issue.message}`,
      suggestion: `Move this copy into the correct field (${issue.expected || "see day-field guide"}). Do not leave family, safety, observation, or adaptation language in unrelated sections.`,
      evidence: issue.evidence,
      navigateTo: issue.day ? `week:${issue.day}` : "week:weekly_plan",
      activityKey: "",
    }));
  }

  return {
    WEEKDAYS,
    FAMILY_FACING,
    SAFETY_LANGUAGE,
    ADAPTATION_LANGUAGE,
    OBSERVATION_LANGUAGE,
    validateDayFieldMapping,
    auditLessonDayFieldMappings,
    findingsFromDayFieldAudit,
    expectedFor,
  };
});
