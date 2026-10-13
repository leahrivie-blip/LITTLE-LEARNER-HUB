"use strict";

const schema = require("./curriculum-operator-schema.js");

const PERMANENT_PROFILE_VERSION = 2;

/** Permanent Little Learner Hub Curriculum Operator defaults (all owners). */
const DEFAULT_INSTRUCTIONS = Object.freeze([
  "Owner supplies ideas in normal language; organize them into a complete professional draft lesson — never swap her core activity for a different AI idea.",
  "Create and update commands stay draft-only; never auto-publish. Publishing is a separate explicit owner action with confirmation.",
  "Set READY_FOR_OWNER_REVIEW only when required content, assets, validation, and persistence checks pass; required printable or image failures block review-ready status.",
  "Before mutating, summarize what was understood: supplied activities, books, printables, images, what is preserved, what AI fills in, and what needs clarification — plain language, no raw JSON.",
  "Make a lesson plan: complete draft; ask for missing age/theme only when not safely inferable.",
  "Complete lesson plan: weekly objectives, materials, preparation, activities, owner-supplied books, family connection, safety, adaptations — no unrelated filler activities.",
  "Fill in the blanks: preserve all supplied content; complete missing objectives, materials, prep, setup, steps, questions, observations, safety, cleanup, adaptations, support, challenge, mixed-age options, vocabulary, and family connection.",
  "Use these activities / keep this activity: required owner-selected activities — keep titles and core learning ideas; improve wording only for clarity, age fit, safety, or completeness.",
  "Make it better: improve clarity, organization, teacher usefulness, and safety without rewriting strong content or changing learning purpose without asking.",
  "Make it realistic: believable childcare classroom activities, materials, routines, and teacher language — no impossible or unsafe activities.",
  "Realistic activity pictures: believable childcare photographs — not cartoon, clip art, 3D render, or fantasy; natural light; real materials; no text overlays, logos, extra fingers, or wrong activity.",
  "Realistic cover photo: theme-level childcare photo for the lesson age and theme — not a random generic room; no title text or logos unless requested.",
  "Activity picture: show the exact activity, materials, and age group — do not substitute a vaguely related scene.",
  "Use this picture: uploaded image is composition/material/style reference only — original realistic childcare image; no copyrighted logos, characters, or text copy.",
  "Make a printable: original classroom-useful printable for a specific activity; letter-size default; validate PDF, page count, size, content, and activity linkage; no generic unrelated worksheets.",
  "Printable like example: preserve learning purpose and useful layout; original artwork and wording — no near-duplicate or copyrighted copy.",
  "Find books: real theme- and age-appropriate books; preserve owner-supplied books; never invent titles, authors, links, or citations — flag for verification when uncertain.",
  "Research this: research only the requested childcare topic; keep separate from lesson creation until owner confirms; preserve sources; never fabricate citations.",
  "Use what I found: treat owner research, activities, books, images, and printable examples as input — organize, do not restart from generic AI ideas.",
  "Keep what's good: preserve valid activities, images, printables, books, and lesson text; do not regenerate without evidence.",
  "Fix what looks bad / fix the pictures: target only weak fields or images with evidence; never blanket-replace every image or rewrite the whole lesson.",
  "Scoped image fix (e.g. only Activity 3): change only that activity's image; protect all other assets and fields.",
  "Budget-friendly materials only when explicitly requested; otherwise use materials that best fit the activity.",
  "Make it easy: simplify prep and instructions while preserving the learning goal.",
  "Family connection: short optional family extension unless owner asks to change the activity itself.",
  "Lesson text: practical for real childcare teachers; realistic setup, teacher actions, child actions, supervision, allergies, choking risks, tools, water, and outdoor boundaries.",
  "Infants through pre-K: validate attention, motor, language, independence, duration, and safety for the stated age band; mixed-age adaptations when appropriate.",
  "If safety cannot be resolved confidently, fail closed or ask — do not guess unsafe details.",
  "Progress labels stay owner-friendly (understanding, organizing, filling details, age/safety check, images, printables, saving draft, ready for review).",
]);

const OWNER_PHRASE_RULES = Object.freeze([
  { key: "lesson_plan", re: /\bmake\s+(?:a\s+)?lesson\s+plan\b/i, flags: { draftReview: true } },
  { key: "complete_lesson_plan", re: /\b(?:make|create)\s+(?:a\s+)?complete\s+lesson\s+plan\b/i, flags: { completeStructure: true, draftReview: true } },
  { key: "fill_in_blanks", re: /\bfill\s+in\s+the\s+blanks\b/i, flags: { fillInBlanks: true, preserveSuppliedActivities: true } },
  { key: "use_these_activities", re: /\buse\s+these\s+(?:(?:\d+|four|five|six|seven|eight|three|two)\s+)?activities\b/i, flags: { preserveSuppliedActivities: true } },
  { key: "keep_activity", re: /\bkeep\s+this\s+activity\b/i, flags: { preserveSuppliedActivities: true, lockActivityCore: true } },
  { key: "make_better", re: /\bmake\s+it\s+better\b/i, flags: { improveInPlace: true } },
  { key: "make_realistic", re: /\bmake\s+it\s+realistic\b/i, flags: { realisticActivities: true } },
  { key: "realistic_picture", re: /\bmake\s+the\s+(?:picture|photo|image)\s+realistic\b/i, flags: { realisticPhotos: true } },
  { key: "realistic_cover", re: /\bmake\s+the\s+cover\s+photo\s+realistic\b/i, flags: { realisticCover: true } },
  { key: "activity_picture", re: /\bmake\s+the\s+activity\s+picture\b/i, flags: { exactActivityImage: true } },
  { key: "use_this_picture", re: /\buse\s+this\s+(?:picture|image|photo)\b/i, flags: { referenceImage: true } },
  { key: "make_printable", re: /\bmake\s+a\s+printable\b/i, flags: { explicitPrintable: true } },
  { key: "printable_like", re: /\bmake\s+it\s+like\s+this\s+printable\b/i, flags: { printableLikeExample: true } },
  { key: "find_books", re: /\bfind\s+books\b/i, flags: { findBooks: true } },
  { key: "research", re: /\bresearch\s+this\b/i, flags: { researchSeparate: true } },
  { key: "use_what_i_found", re: /\buse\s+what\s+i\s+found\b/i, flags: { ownerResearchInput: true, preserveSuppliedActivities: true } },
  { key: "keep_whats_good", re: /\bkeep\s+what'?s\s+good\b/i, flags: { preserveValidAssets: true } },
  { key: "fix_what_looks_bad", re: /\bfix\s+what\s+looks\s+bad\b/i, flags: { surgicalFix: true } },
  { key: "fix_pictures", re: /\bfix\s+the\s+pictures\b/i, flags: { auditImages: true, surgicalFix: true } },
  { key: "only_fix_activity_image", re: /\bonly\s+fix\s+activity\s+(\d+)(?:'?s)?\s+(?:picture|image|photo)\b/i, flags: { scopedImageFix: true } },
  { key: "budget_friendly", re: /\bmake\s+it\s+budget[\s-]?friendly\b/i, flags: { budgetMaterials: true } },
  { key: "make_easy", re: /\bmake\s+it\s+easy\b/i, flags: { simplifyPrep: true } },
  { key: "family_connection", re: /\badd\s+a\s+family\s+connection\b/i, flags: { familyConnection: true } },
  { key: "ready_for_review", re: /\bleave\s+it\s+ready\s+for\s+(?:me\s+to\s+)?review\b/i, flags: { draftReview: true } },
  { key: "publish", re: /\bpublish\s+it\b/i, flags: { publishExplicit: true } },
]);

function ownerKey(ownerId) {
  return schema.text(ownerId, 160).toLowerCase();
}

function permanentInstructionLines(profile) {
  const custom = schema.asArray(profile?.instructions).map((v) => schema.text(v, 500)).filter(Boolean);
  const merged = [...DEFAULT_INSTRUCTIONS];
  custom.forEach((line) => {
    if (!merged.some((existing) => existing.toLowerCase() === line.toLowerCase())) merged.push(line);
  });
  return merged.slice(0, 120);
}

function interpretOwnerPhrases(rawCommand) {
  const raw = schema.text(rawCommand, 4000);
  const matched = [];
  const flags = {};
  const scoped = { activityIndex: null };
  OWNER_PHRASE_RULES.forEach((rule) => {
    const m = raw.match(rule.re);
    if (!m) return;
    matched.push(rule.key);
    Object.assign(flags, rule.flags || {});
    if (rule.key === "only_fix_activity_image" && m[1]) {
      scoped.activityIndex = Number(m[1]) || null;
    }
  });
  if (!matched.length && /\bdraft\s+only\b/i.test(raw)) flags.draftReview = true;
  if (/\bdo\s+not\s+publish\b/i.test(raw)) flags.draftReview = true;
  return { matched, flags, scoped };
}

function read(store, ownerId) {
  const profile = store?.curriculumOperatorInstructionProfiles?.[ownerKey(ownerId)];
  const base = {
    ownerId: ownerKey(ownerId),
    version: 1,
    permanentProfileVersion: PERMANENT_PROFILE_VERSION,
    instructions: DEFAULT_INSTRUCTIONS.slice(),
    corrections: [],
    updatedAt: null,
  };
  if (!profile) return base;
  return {
    ...base,
    ...profile,
    permanentProfileVersion: PERMANENT_PROFILE_VERSION,
    instructions: schema.asArray(profile.instructions).length
      ? schema.asArray(profile.instructions).map((v) => schema.text(v, 500)).filter(Boolean)
      : DEFAULT_INSTRUCTIONS.slice(),
  };
}

function save(store, ownerId, instructions, corrections = []) {
  const prior = read(store, ownerId);
  const next = {
    ownerId: ownerKey(ownerId),
    version: Number(prior.version || 0) + 1,
    permanentProfileVersion: PERMANENT_PROFILE_VERSION,
    instructions: schema.asArray(instructions).map((v) => schema.text(v, 500)).filter(Boolean).slice(0, 80),
    corrections: schema.asArray(corrections).map((v) => schema.text(v, 500)).filter(Boolean).slice(0, 40),
    updatedAt: new Date().toISOString(),
  };
  store.curriculumOperatorInstructionProfiles = store.curriculumOperatorInstructionProfiles || {};
  store.curriculumOperatorInstructionProfiles[next.ownerId] = next;
  return next;
}

function parseInstructionCommand(raw) {
  const text = schema.text(raw, 4000);
  if (/show me what instructions you (?:currently )?remember/i.test(text)) return { type: "show" };
  if (/start a clean conversation/i.test(text)) return { type: "clean_conversation" };
  if (/forget (?:the )?instructions from this conversation/i.test(text)) return { type: "clear_conversation" };
  const forget = text.match(/\bforget\s+(?:the\s+)?(.+?)(?:\s+rule)?[.!?]*$/i);
  if (forget) return { type: "forget", value: forget[1].trim() };
  const replace = text.match(/\breplace my (.+?) with (.+?)[.!?]*$/i);
  if (replace) return { type: "replace", value: `${replace[1].trim()}: ${replace[2].trim()}` };
  const remember = text.match(/\b(?:remember that|always|do not use)\s+(.+?)[.!?]*$/i);
  if (remember) return { type: "propose", value: remember[1].trim(), requiresConfirmation: true };
  if (/save these as my permanent curriculum instructions/i.test(text)) return { type: "confirm_save" };
  return { type: "none" };
}

function resolveMaterialCostMode(raw, lessonInstructions = []) {
  const command = schema.text(raw, 4000);
  const phraseFlags = interpretOwnerPhrases(command).flags;
  const explicitLowCost = phraseFlags.budgetMaterials === true
    || /\b(?:cheap|low[\s-]?cost|affordable|budget[\s-]?friendly|dollar\s+tree|inexpensive|common household|limited supplies|cheaper alternatives?|substitutions?)\b/i.test(command);
  const rememberedLowCost = schema.asArray(lessonInstructions).some((instruction) => /\b(?:always\s+)?(?:cheap|low[\s-]?cost|affordable|budget[\s-]?friendly|dollar\s+tree|limited supplies)\b/i.test(String(instruction)));
  return {
    requested: explicitLowCost || rememberedLowCost,
    source: explicitLowCost ? "current_request" : (rememberedLowCost ? "lesson_instruction" : "default"),
    preserveStandardMaterials: /\b(?:substitutions?|alternatives?)\b/i.test(command),
    mode: (explicitLowCost || rememberedLowCost) ? "budget_when_requested" : "standard",
  };
}

module.exports = {
  PERMANENT_PROFILE_VERSION,
  DEFAULT_INSTRUCTIONS,
  OWNER_PHRASE_RULES,
  read,
  save,
  parseInstructionCommand,
  resolveMaterialCostMode,
  interpretOwnerPhrases,
  permanentInstructionLines,
};
