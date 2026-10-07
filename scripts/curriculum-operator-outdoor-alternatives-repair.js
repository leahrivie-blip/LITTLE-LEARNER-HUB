/**
 * Activity-specific outdoorAlternatives (and paired indoor) too_short repair.
 * Does not weaken the ≥8-word rejectGeneric gate.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const ALTERNATIVES_TOO_SHORT_FIELDS = Object.freeze(["indoorAlternatives", "outdoorAlternatives"]);

function text(value, max = 2000) {
  return schema.text(value, max);
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

/** Repair contract text for Stage 2 / Stage 4 prompts (too_short / missing). */
function outdoorAlternativesRepairQualityInstruction(reason = "too_short") {
  const why = text(reason, 80);
  if (why === "generic_filler") {
    return [
      "The existing outdoorAlternatives text is too generic.",
      "REPLACE it with a practical outdoor adaptation of THIS activity.",
      "Name where outdoors (shaded mat, garden table, playground station), what materials/setup change,",
      "how children complete the same learning goal safely, and one preschool-safe supervision note.",
      "Do not write \"do this outside\" or \"take it outdoors\" filler.",
    ].join(" ");
  }
  return [
    "EXPAND this field into a practical outdoor adaptation of the same activity.",
    "Explain where/how the activity can happen outdoors, what materials or setup change if needed,",
    "and preserve the original learning goal. Do not write generic \"do this outside\" filler.",
    "Include outdoor location/setup, materials or setup changes if needed, the child actions that stay the same,",
    "and preschool-safe supervision (shade, spills, tools, boundaries).",
    "Meet the existing ≥8-word minimum with activity-specific detail — not generic outdoor filler.",
  ].join(" ");
}

function indoorAlternativesRepairQualityInstruction(reason = "too_short") {
  const why = text(reason, 80);
  if (why === "generic_filler") {
    return [
      "The existing indoorAlternatives text is too generic.",
      "REPLACE it with a practical indoor adaptation of THIS activity.",
      "Explain where/how indoors, materials/setup changes, and preserve the learning goal.",
    ].join(" ");
  }
  return [
    "EXPAND this field into a practical indoor adaptation of the same activity.",
    "Explain where/how the activity can happen indoors, what materials or setup change if needed,",
    "and preserve the original learning goal.",
    "Do not merely lengthen the existing sentence. Do not write generic filler such as \"Do this activity indoors.\"",
    "Meet the existing ≥8-word minimum.",
  ].join(" ");
}

function isShallowOutdoorAlternatives(value) {
  const sample = text(value, 2000);
  if (!sample) return true;
  return (
    /\b(do this outside|take it outdoors|move the activity outdoors|outdoor version only)\b/i.test(sample)
    && wordCount(sample) < 20
  );
}

function isShallowIndoorAlternatives(value) {
  const sample = text(value, 2000);
  if (!sample) return true;
  return (
    /\b(do this activity indoors|move the activity inside|use an indoor space)\b/i.test(sample)
    && wordCount(sample) < 20
  );
}

/**
 * @param {object} activity
 * @param {object} brief
 * @returns {string|null}
 */
function synthesizeActivitySpecificOutdoorAlternative(activity, brief = {}) {
  const title = text(activity?.title, 120);
  const materials = text(activity?.materials, 500);
  const setup = text(activity?.setup, 400);
  const description = text(activity?.description, 500);
  const steps = text(activity?.steps, 500);
  const theme = text(brief?.theme || brief?.title, 120);
  const blob = `${title} ${materials} ${setup} ${description} ${steps}`.toLowerCase();

  if (/color|mix|paint|dye|pigment/i.test(blob)) {
    return [
      `Set up a shaded outdoor table for "${title}" with the same color-mixing trays,`,
      "labeled plant/leaf samples, and waterproof mats so children mix plant-inspired colors",
      "outdoors while an adult supervises spills and keeps tools within the marked boundary.",
    ].join(" ");
  }
  if (/seed|plant|sprout|garden|soil|water/i.test(blob)) {
    return [
      `Carry the "${title}" planting trays and watering tools to a shaded garden table or outdoor rug`,
      "so children plant, water, or sequence sprout stages with the same steps while adults",
      "supervise hand-washing and keep soil samples in labeled bins.",
    ].join(" ");
  }
  if (/count|sort|math|pattern|sequenc/i.test(blob)) {
    return [
      `Take "${title}" sorting/counting materials to a shaded outdoor picnic table or mat`,
      "and keep the same learning goal while children use natural props (stones, leaves)",
      "within a marked boundary with an adult nearby for turn-taking.",
    ].join(" ");
  }
  if (/dramatic|pretend|role/i.test(blob)) {
    return [
      `Move the "${title}" dramatic-play props to a shaded outdoor patio or playground station`,
      "with the same roles and scripts while an adult sets a clear boundary and supervises",
      "children as they carry props between stations.",
    ].join(" ");
  }

  const mats = materials.split(/[,;]/).map((s) => text(s, 80)).filter(Boolean).slice(0, 2);
  const matPhrase = mats.length ? mats.join(" and ") : `${theme} materials`;
  return [
    `Take the same "${title}" ${matPhrase} outdoors to a shaded mat or picnic table,`,
    "keep the original objective and steps, and have an adult supervise boundaries,",
    "spills, and turn-taking while children use the familiar setup in fresh air.",
  ].join(" ");
}

function synthesizeActivitySpecificIndoorAlternative(activity, brief = {}) {
  const title = text(activity?.title, 120);
  const theme = text(brief?.theme || brief?.title, 120);
  const materials = text(activity?.materials, 300);
  const mats = materials.split(/[,;]/).map((s) => text(s, 80)).filter(Boolean).slice(0, 2);
  const matPhrase = mats.length ? mats.join(" and ") : `${theme} materials`;
  return [
    `Set up "${title}" at a classroom table or rug with the same ${matPhrase} and learning goal`,
    "while children complete the familiar steps indoors in a small group with teacher coaching.",
  ].join(" ");
}

/**
 * @param {object[]} activities
 * @param {object} brief
 * @param {{
 *   rejectGeneric: Function,
 *   onlyOutlineIds?: string[],
 *   onlySynthWhenUnchangedFromPrior?: boolean,
 *   priorActivities?: object[],
 *   repairOutlineIds?: string[],
 * }} options
 */
function applyTargetedAlternativesTooShortSynthesis(activities, brief, options = {}) {
  const rejectGeneric = options.rejectGeneric;
  if (typeof rejectGeneric !== "function") {
    throw new Error("rejectGeneric is required for alternatives too_short synthesis");
  }
  const only = new Set(schema.asArray(options.onlyOutlineIds).map((id) => text(id, 80)).filter(Boolean));
  const priorById = new Map(
    schema.asArray(options.priorActivities).map((a) => [text(a.outlineId, 80), a]),
  );
  const repairIds = new Set(schema.asArray(options.repairOutlineIds).map((id) => text(id, 80)).filter(Boolean));
  const gateUnchanged = options.onlySynthWhenUnchangedFromPrior === true && repairIds.size > 0;
  return schema.asArray(activities).map((activity) => {
    const next = { ...activity };
    const title = text(next.title, 120);
    const id = text(next.outlineId, 80);
    if (only.size && !only.has(id)) return next;
    if (gateUnchanged && !repairIds.has(id)) return next;

    ALTERNATIVES_TOO_SHORT_FIELDS.forEach((field) => {
      if (gateUnchanged) {
        const priorVal = text(priorById.get(id)?.[field], 2000);
        const nextVal = text(next[field], 2000);
        if (priorVal !== nextVal) return;
      }
      const err = rejectGeneric(`${title}.${field}`, next[field]);
      if (!err || (!/Too short/i.test(err) && !/Generic filler/i.test(err))) return;
      const synthesized = field === "outdoorAlternatives"
        ? synthesizeActivitySpecificOutdoorAlternative(next, brief)
        : synthesizeActivitySpecificIndoorAlternative(next, brief);
      if (!synthesized) return;
      const shallow = field === "outdoorAlternatives"
        ? isShallowOutdoorAlternatives(synthesized)
        : isShallowIndoorAlternatives(synthesized);
      if (shallow) return;
      const synthErr = rejectGeneric(`${title}.${field}`, synthesized);
      if (!synthErr) next[field] = synthesized;
    });
    return next;
  });
}

module.exports = {
  ALTERNATIVES_TOO_SHORT_FIELDS,
  outdoorAlternativesRepairQualityInstruction,
  indoorAlternativesRepairQualityInstruction,
  isShallowOutdoorAlternatives,
  isShallowIndoorAlternatives,
  synthesizeActivitySpecificOutdoorAlternative,
  synthesizeActivitySpecificIndoorAlternative,
  applyTargetedAlternativesTooShortSynthesis,
};
