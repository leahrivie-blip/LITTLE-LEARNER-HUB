/**
 * Phase 9 — AI review-before-save invariants (TESTING / HDH spine).
 *
 * AI may only propose. Persist / share / assign / publish / charge / delete
 * requires an explicit human action after review.
 *
 * Production remains read-only: do not enable AI Guide or Teaching Kit AI
 * flags on production; never write production env from agents.
 */
"use strict";

const FORBIDDEN_AUTO_ACTIONS = Object.freeze([
  "publish",
  "send",
  "assign",
  "charge",
  "delete",
  "overwrite_production",
  "modify_production_data",
]);

const INVARIANT = Object.freeze({
  id: "ai-review-before-save",
  rule: "AI proposes only; humans review before save/share/publish.",
  productionReadOnly: true,
  realChargesForbidden: true,
  autoPublishForbidden: true,
  autoSendForbidden: true,
  autoAssignForbidden: true,
  autoDeleteForbidden: true,
});

function assertProposalOnly(meta = {}) {
  const action = String(meta.action || "").toLowerCase();
  if (FORBIDDEN_AUTO_ACTIONS.some((item) => action.includes(item))) {
    throw new Error(`AI must not auto-${action}. Review-before-save required.`);
  }
  if (meta.autoPublished === true || meta.autoSaved === true || meta.autoShared === true) {
    throw new Error("AI proposals cannot auto-save, auto-share, or auto-publish.");
  }
  return true;
}

function publicAiProposal(input = {}) {
  return {
    proposalId: String(input.proposalId || input.id || ""),
    source: String(input.source || "ai"),
    tool: String(input.tool || ""),
    outputText: String(input.outputText || input.output || ""),
    status: String(input.status || "proposed"), // proposed | accepted | discarded
    reviewAcknowledgedAt: input.reviewAcknowledgedAt || "",
    shareWithFamily: Boolean(input.shareWithFamily),
    autoPublished: false,
    autoSaved: false,
    autoShared: false,
    testingOnly: true,
  };
}

function canPersistAiProposal(proposal = {}) {
  if (!proposal || !String(proposal.outputText || "").trim()) return false;
  if (proposal.status === "discarded") return false;
  return Boolean(proposal.reviewAcknowledgedAt || proposal.reviewAcknowledged === true);
}

module.exports = {
  FORBIDDEN_AUTO_ACTIONS,
  INVARIANT,
  assertProposalOnly,
  publicAiProposal,
  canPersistAiProposal,
};
