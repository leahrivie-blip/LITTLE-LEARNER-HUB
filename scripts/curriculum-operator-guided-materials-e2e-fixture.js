"use strict";

const HALLOWEEN_GUIDED_COMMAND = "Make a preschool Halloween lesson. Use these four activities: pumpkin color sorting, leaf-and-pumpkin stamping, spider web fine-motor play, and a Halloween story walk. Materials: paint, paper, tweezers, yarn. Use the book Room on the Broom. Make a realistic cover photo with preschool children doing Halloween activities. Exact printable instructions: letter-size pumpkin color cards and spider web counting cards, original artwork only. Keep valid existing assets. Make a printable with pumpkin color cards and spider web counting cards. Leave unpublished for my review.";

function buildDisposableGuidedQaTitle(runId) {
  return `Guided Materials QA Disposable guided-materials-prod-qa-${runId}`;
}

function buildGuidedCreateCommand(disposableTitle) {
  return HALLOWEEN_GUIDED_COMMAND.replace(
    "Make a preschool Halloween lesson.",
    `Create a complete lesson titled "${disposableTitle}" for preschool.`,
  );
}

module.exports = {
  HALLOWEEN_GUIDED_COMMAND,
  buildDisposableGuidedQaTitle,
  buildGuidedCreateCommand,
};
