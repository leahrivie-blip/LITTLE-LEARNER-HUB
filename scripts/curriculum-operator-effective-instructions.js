"use strict";

const schema = require("./curriculum-operator-schema.js");
const instructionProfile = require("./curriculum-operator-instruction-profile.js");
const knowledgeProfile = require("./curriculum-operator-knowledge-profile.js");

const EFFECTIVE_KNOWLEDGE_MAX_LINES = 12;

function inferAgeBandFromCommand(raw) {
  const t = schema.text(raw, 4000).toLowerCase();
  if (/\binfant\b/.test(t)) return "infant";
  if (/\btoddler\b/.test(t)) return "toddler";
  if (/\bpreschool\b/.test(t)) return "preschool";
  if (/\bschool[- ]?age\b/.test(t)) return "school_age";
  if (/\bmixed[- ]?age/.test(t)) return "mixed";
  return "";
}

function buildEffectiveInstructions({ rawCommand = "", profile = null } = {}) {
  const raw = schema.text(rawCommand, 4000);
  const resolvedProfile = profile && typeof profile === "object"
    ? profile
    : instructionProfile.read({}, "");
  const permanentInstructions = instructionProfile.permanentInstructionLines(resolvedProfile);
  const phraseInterpretation = instructionProfile.interpretOwnerPhrases(raw);
  const materials = instructionProfile.resolveMaterialCostMode(raw, permanentInstructions);
  const ageBand = inferAgeBandFromCommand(raw);
  const knowledgeProfileLines = knowledgeProfile.architectSupplementLines({
    ageBand: ageBand || "preschool",
    requestedFeatures: {
      printables: /\bprintable\b/i.test(raw),
      images: /\b(realistic|picture|image|cover|photo)\b/i.test(raw),
      books: /\bbook\b/i.test(raw),
    },
  }, { maxLines: EFFECTIVE_KNOWLEDGE_MAX_LINES });
  const summaryParts = [];
  if (phraseInterpretation.matched.length) {
    summaryParts.push(`Owner phrases: ${phraseInterpretation.matched.join(", ")}`);
  }
  summaryParts.push(`Permanent curriculum profile v${resolvedProfile.permanentProfileVersion || 1}`);
  summaryParts.push(`Childcare knowledge profile v${knowledgeProfile.KNOWLEDGE_PROFILE_VERSION}`);
  return {
    profileLoaded: true,
    profileVersion: Number(resolvedProfile.version || 1),
    permanentProfileVersion: Number(resolvedProfile.permanentProfileVersion || 1),
    knowledgeProfileVersion: knowledgeProfile.KNOWLEDGE_PROFILE_VERSION,
    knowledgeProfileLines,
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
