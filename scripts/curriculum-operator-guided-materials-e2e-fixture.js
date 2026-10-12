"use strict";

const DISPOSABLE_TITLE_PREFIX = "Halloween Guided Materials QA ";

const HALLOWEEN_GUIDED_COMMAND = "Make a preschool Halloween lesson with theme Halloween. Use these four activities: pumpkin color sorting, leaf-and-pumpkin stamping, spider web fine-motor play, and a Halloween story walk. Materials: paint, paper, tweezers, yarn. Use the book Room on the Broom. I found some ideas online about process art. Use this picture as a reference. Exact picture instructions: no logos or text overlays, match the reference composition only. Exact printable instructions: letter-size pumpkin color cards and spider web counting cards, original artwork only. Keep valid existing printables. Replace the old spider counting mat only if it does not match my mats. Make a realistic cover photo with preschool children doing Halloween activities. Make a printable with pumpkin color cards and spider web counting cards. Leave unpublished for my review.";

function buildDisposableGuidedQaTitle(runId) {
  return `${DISPOSABLE_TITLE_PREFIX}${runId}`;
}

function isDisposableGuidedMaterialsQaTitle(title) {
  const t = String(title || "").trim();
  return t.startsWith(DISPOSABLE_TITLE_PREFIX) && t.length > DISPOSABLE_TITLE_PREFIX.length + 8;
}

function buildGuidedCreateCommand(disposableTitle) {
  return HALLOWEEN_GUIDED_COMMAND.replace(
    "Make a preschool Halloween lesson with theme Halloween.",
    `Create a complete lesson titled "${disposableTitle}" for preschool Halloween.`,
  );
}

module.exports = {
  DISPOSABLE_TITLE_PREFIX,
  HALLOWEEN_GUIDED_COMMAND,
  buildDisposableGuidedQaTitle,
  buildGuidedCreateCommand,
  isDisposableGuidedMaterialsQaTitle,
};
