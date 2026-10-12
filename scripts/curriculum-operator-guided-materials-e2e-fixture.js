"use strict";

const DISPOSABLE_TITLE_PREFIX = "Halloween Guided Materials QA ";

/** Base phrasing matches unit-test HALLOWEEN command (create_lesson + guided confirm). */
const HALLOWEEN_GUIDED_COMMAND = "Make a preschool Halloween lesson. Theme Halloween. Use these four activities: pumpkin color sorting, leaf-and-pumpkin stamping, spider web fine-motor play, and a Halloween story walk. Materials: paint, paper, tweezers, yarn. Use the book Room on the Broom. I found some ideas online about process art. Use this picture as a reference for the activity image. Exact picture instructions: no logos or text overlays, match the reference composition only. Make a realistic cover photo with preschool children doing Halloween activities. Exact printable instructions: letter-size pumpkin color cards and spider web counting cards, original artwork only. Keep valid existing printables. Keep the spider counting mat unless audit shows mismatch. Make a printable with pumpkin color cards and spider web counting cards. Draft only for my review.";

function buildDisposableGuidedQaTitle(runId) {
  return `${DISPOSABLE_TITLE_PREFIX}${runId}`;
}

function isDisposableGuidedMaterialsQaTitle(title) {
  const t = String(title || "").trim();
  return t.startsWith(DISPOSABLE_TITLE_PREFIX) && t.length > DISPOSABLE_TITLE_PREFIX.length + 8;
}

function buildGuidedCreateCommand(disposableTitle) {
  return HALLOWEEN_GUIDED_COMMAND.replace(
    "Make a preschool Halloween lesson.",
    `Make a preschool Halloween lesson titled "${disposableTitle}".`,
  );
}

module.exports = {
  DISPOSABLE_TITLE_PREFIX,
  HALLOWEEN_GUIDED_COMMAND,
  buildDisposableGuidedQaTitle,
  buildGuidedCreateCommand,
  isDisposableGuidedMaterialsQaTitle,
};
