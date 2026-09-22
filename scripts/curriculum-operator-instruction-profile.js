"use strict";

const schema = require("./curriculum-operator-schema.js");

const DEFAULT_INSTRUCTIONS = Object.freeze([
  "Use realistic exact-activity photos, never cartoons.",
  "Complete Teaching Kits include objectives, materials, prep, setup, steps, questions, observations, safety, cleanup, indoor/outdoor alternatives, tips, substitutions, support, challenge, mixed-age adaptations, and vocabulary.",
  "Use low-cost practical materials and matching printables.",
  "Preserve strong existing content; do not rewrite everything unnecessarily.",
  "Do not change covers unless explicitly requested.",
  "Keep all AI work as a draft for owner review. Never auto-publish.",
]);

function ownerKey(ownerId) {
  return schema.text(ownerId, 160).toLowerCase();
}

function read(store, ownerId) {
  const profile = store?.curriculumOperatorInstructionProfiles?.[ownerKey(ownerId)];
  if (profile) return profile;
  return { ownerId: ownerKey(ownerId), version: 1, instructions: DEFAULT_INSTRUCTIONS.slice(), corrections: [], updatedAt: null };
}

function save(store, ownerId, instructions, corrections = []) {
  const prior = read(store, ownerId);
  const next = {
    ownerId: ownerKey(ownerId),
    version: Number(prior.version || 0) + 1,
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

module.exports = { DEFAULT_INSTRUCTIONS, read, save, parseInstructionCommand };
