/**
 * DOM/state-aware readers for Paste Activity smoke assertions.
 *
 * Closed <details> elements often yield empty innerText in Chromium even when
 * the nodes exist. Prefer textContent / value reads so the harness does not
 * false-fail when the Enrichment accordion is collapsed.
 *
 * Browser: pass readPasteImportListFieldsInBrowser to page.evaluate(...).
 * Node: use assertListFieldsFromSnapshot for unit checks.
 */

"use strict";

function readPasteImportListFieldsInBrowser() {
  const obsSection = document.querySelector("[data-import-field='observationPrompts']");
  const vocabSection = document.querySelector("[data-import-field='vocabulary']");
  const observationPrompts = [...(obsSection?.querySelectorAll(".tk-enrich-tip-card span") || [])]
    .map((el) => String(el.textContent || "").trim())
    .filter(Boolean);
  const vocabulary = [...(vocabSection?.querySelectorAll(".tk-enrich-vocab-chip") || [])]
    .map((el) => String(el.textContent || "").replace(/×/g, "").trim())
    .filter(Boolean);
  const indoor = document.querySelector('[data-enrich-text-field="indoorAlternatives"]')?.value || "";
  const challenge = document.querySelector('[data-enrich-text-field="extensions"]')?.value || "";
  const enrichmentOpen = Boolean(document.querySelector('details[data-core-section="enrichment"]')?.open);
  return {
    observationPrompts,
    vocabulary,
    indoor,
    challenge,
    enrichmentOpen,
  };
}

function assertListFieldsFromSnapshot(snapshot, expectations) {
  const obs = Array.isArray(snapshot?.observationPrompts) ? snapshot.observationPrompts : [];
  const vocab = Array.isArray(snapshot?.vocabulary) ? snapshot.vocabulary : [];
  const joinedObs = obs.join("\n");
  const joinedVocab = vocab.join("\n");
  const errors = [];
  for (const needle of expectations.observationPrompts || []) {
    if (!obs.some((item) => item === needle) && !new RegExp(needle, "i").test(joinedObs)) {
      errors.push(`missing observation prompt: ${needle}`);
    }
  }
  for (const needle of expectations.vocabulary || []) {
    if (!vocab.some((item) => item.toLowerCase() === String(needle).toLowerCase())) {
      errors.push(`missing vocabulary: ${needle}`);
    }
  }
  return { ok: errors.length === 0, errors, observationPrompts: obs, vocabulary: vocab };
}

module.exports = {
  readPasteImportListFieldsInBrowser,
  assertListFieldsFromSnapshot,
};
