/**
 * Review-draft composition policy for new Operator jobs.
 * Authorized successful changes compose into the editable lesson draft.
 * Publish remains owner-only (Phase 8).
 */
"use strict";

const OPERATOR_PLAN_VERSION = 2;

function shouldComposeReviewDraft(command = {}) {
  const actions = command.actions || {};
  if (actions.planOnly === true) return false;
  if (actions.publish === true) return false;
  if (actions.composeReviewDraft === false) return false;
  if (actions.connectedAutoApply === false) return false;
  return actions.composeReviewDraft === true
    || actions.connectedAutoApply === true
    || actions.connectedUpgrade === true;
}

function jobUsesReviewDraftWorkflow(job = {}) {
  const version = Number(job?.operatorPlanVersion || job?.command?.interpretation?.operatorPlanVersion || 0);
  if (version >= OPERATOR_PLAN_VERSION) return true;
  return shouldComposeReviewDraft(job.command || {});
}

function ownerFacingWorkflowCopy() {
  return {
    saveBehavior: "Successful approved AI changes will be saved directly into the lesson draft for your review.",
    publishing: "Nothing will publish automatically.",
    finalAction: "When the job is ready, open the lesson, review the draft, and click Publish.",
    applyEnrichmentRequired: false,
  };
}

function legacyJobNeedsManualApply(job = {}) {
  if (jobUsesReviewDraftWorkflow(job)) return false;
  const actions = job?.command?.actions || {};
  return actions.connectedAutoApply !== true && actions.composeReviewDraft !== true;
}

module.exports = {
  OPERATOR_PLAN_VERSION,
  shouldComposeReviewDraft,
  jobUsesReviewDraftWorkflow,
  ownerFacingWorkflowCopy,
  legacyJobNeedsManualApply,
};
