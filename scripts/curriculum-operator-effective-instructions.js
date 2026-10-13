"use strict";

const schema = require("./curriculum-operator-schema.js");
const instructionProfile = require("./curriculum-operator-instruction-profile.js");

function buildEffectiveInstructions({ rawCommand = "", profile = null } = {}) {
  const raw = schema.text(rawCommand, 4000);
  const resolvedProfile = profile && typeof profile === "object"
    ? profile
    : instructionProfile.read({}, "");
  const permanentInstructions = instructionProfile.permanentInstructionLines(resolvedProfile);
  const phraseInterpretation = instructionProfile.interpretOwnerPhrases(raw);
  const materials = instructionProfile.resolveMaterialCostMode(raw, permanentInstructions);
  const summaryParts = [];
  if (phraseInterpretation.matched.length) {
    summaryParts.push(`Owner phrases: ${phraseInterpretation.matched.join(", ")}`);
  }
  summaryParts.push(`Permanent curriculum profile v${resolvedProfile.permanentProfileVersion || 1}`);
  return {
    profileLoaded: true,
    profileVersion: Number(resolvedProfile.version || 1),
    permanentProfileVersion: Number(resolvedProfile.permanentProfileVersion || 1),
    permanentInstructions,
    phraseInterpretation,
    materials,
    summary: summaryParts.join(" · "),
    publishRequiresExplicitConfirm: phraseInterpretation.flags.publishExplicit === true || /\bpublish\b/i.test(raw),
    draftOnly: phraseInterpretation.flags.draftReview !== false,
    preserveOwnerActivities: phraseInterpretation.flags.preserveSuppliedActivities !== false,
    fillInBlanks: phraseInterpretation.flags.fillInBlanks === true,
    researchSeparateUntilConfirm: phraseInterpretation.flags.researchSeparate === true,
  };
}

module.exports = { buildEffectiveInstructions };
