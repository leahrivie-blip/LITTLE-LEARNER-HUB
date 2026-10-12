/**
 * Guided materials — scope owner picture/reference instructions to the intended activity.
 * Visual QA retry hints (no generic fallback images).
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

function normalizeActivityKey(title) {
  return schema.text(title, 180).toLowerCase().replace(/^a\s+/, "").replace(/\s+/g, " ").trim();
}

function ownerPictureLines(brief) {
  const lines = schema.asArray(brief?.ownerMaterials?.ownerInstructions)
    .map((line) => schema.text(line, 500))
    .filter((line) => /^picture\s*:/i.test(line));
  return lines.map((line) => line.replace(/^picture\s*:\s*/i, "").trim()).filter(Boolean);
}

function ownerRequestedReferenceImage(rawCommand) {
  const raw = schema.text(rawCommand, 4000);
  return /\b(use\s+this\s+picture|reference\s+for\s+the\s+activity\s+image|uploaded|attached)\b/i.test(raw)
    && /\b(image|photo|picture)\b/i.test(raw);
}

function briefRaw(brief) {
  return schema.text(brief?.rawCommand, 4000);
}

function referenceTargetActivityTitle(brief) {
  const acts = schema.asArray(brief?.ownerMaterials?.activities);
  if (acts.length) return schema.text(acts[0].title, 180);
  const first = schema.asArray(brief?.requestedActivities)[0];
  return schema.text(first, 180);
}

function activityMatchesReferenceTarget(activity, brief) {
  const target = normalizeActivityKey(referenceTargetActivityTitle(brief));
  const actKey = normalizeActivityKey(activity?.title);
  if (!target || !actKey) return false;
  return actKey === target
    || actKey.includes(target)
    || target.includes(actKey);
}

function stripReferenceCompositionPhrases(text) {
  return schema.text(text, 800)
    .replace(/\bmatch\s+the\s+reference\s+composition\s+only\b/gi, "")
    .replace(/\buse\s+this\s+picture\s+as\s+a\s+reference[^.]*\.?/gi, "")
    .replace(/\breference\s+composition\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function guidedOwnerBriefForActivity({ brief, activity, concept, field }) {
  const base = schema.text(concept, 800);
  if (brief?.guidedWorkflow !== true) return base;

  const pictureLines = ownerPictureLines(brief);
  const referenceRequested = ownerRequestedReferenceImage(briefRaw(brief)) || pictureLines.some((l) => /reference|composition/i.test(l));
  const isReferenceTarget = activityMatchesReferenceTarget(activity, brief);

  let ownerExtra = pictureLines.join(" ");
  if (referenceRequested && !isReferenceTarget) {
    ownerExtra = stripReferenceCompositionPhrases(ownerExtra);
  }
  if (referenceRequested && isReferenceTarget && ownerExtra) {
    ownerExtra = `${ownerExtra} Match reference composition only for this activity; do not depict a different activity.`;
  }

  const actTitle = schema.text(activity?.title, 180);
  const materials = schema.text(activity?.materials, 400);
  const setup = schema.text(activity?.setup, 400);
  const steps = schema.text(activity?.steps, 400);

  let activitySpecific = "";
  if (/story\s*walk/i.test(actTitle + base)) {
    activitySpecific = "Show a preschool story walk: large story sheets or pages placed along a floor path, children stopping to read/discuss — not coloring worksheets at a table.";
  }

  const parts = [base, ownerExtra, activitySpecific].filter(Boolean);
  const merged = parts.join(" ").replace(/\s+/g, " ").trim();
  return merged || base;
}

function visualQaRetryOwnerBrief(visualQa, priorBrief) {
  const reasons = schema.asArray(visualQa?.blockReasons).length
    ? visualQa.blockReasons
    : schema.text(visualQa?.error, 600).split(";").map((s) => s.trim()).filter(Boolean);
  if (!reasons.length) return priorBrief;
  const fix = reasons.map((r) => r.replace(/^[^:]+:\s*/, "").trim() || r).join("; ");
  return `${schema.text(priorBrief, 700)} CORRECTION REQUIRED (visual QA): ${fix}. Depict only this activity's setup and listed materials.`;
}

function assessGuidedImagePreCreate(brief) {
  if (brief?.guidedWorkflow !== true) return { ok: true };
  const imgs = schema.asArray(brief?.ownerMaterials?.images);
  const hasCover = imgs.some((i) => i.kind === "cover");
  const hasRef = imgs.some((i) => i.kind === "activity_reference");
  if (hasRef && !referenceTargetActivityTitle(brief)) {
    return {
      ok: false,
      needsClarification: true,
      code: "guided_image_activity_clarification",
      clarifyingQuestion: "Which activity should the reference picture apply to?",
    };
  }
  if (hasCover && !schema.text(brief?.title || brief?.theme, 120)) {
    return { ok: false, needsClarification: true, code: "guided_image_clarification" };
  }
  return { ok: true, hasCover, hasRef };
}

module.exports = {
  normalizeActivityKey,
  ownerPictureLines,
  referenceTargetActivityTitle,
  activityMatchesReferenceTarget,
  guidedOwnerBriefForActivity,
  visualQaRetryOwnerBrief,
  assessGuidedImagePreCreate,
  stripReferenceCompositionPhrases,
};
