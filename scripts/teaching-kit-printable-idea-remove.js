/**
 * Isolated Printable Ideas remove/cleanup helpers.
 * Operates only on enrichmentDraft.week.printableIdeas.
 * Never reads or writes Linked Resources / curriculum.resources / lesson.resourceIds.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitPrintableIdeaRemove = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PLACEHOLDER_TITLE = /^(printable ideas?|untitled|filler|tbd|n\/?a|draft|copy|idea|#?\d+)$/i;

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function printableIdeaTitle(idea) {
    if (idea == null) return "";
    if (typeof idea === "string") return text(idea);
    if (typeof idea !== "object") return "";
    return text(idea.title || idea.name || idea.label);
  }

  function printableIdeaId(idea) {
    if (!idea || typeof idea !== "object") return "";
    return text(idea.id);
  }

  function newPrintableIdeaId() {
    const rand = Math.random().toString(36).slice(2, 10);
    const stamp = Date.now().toString(36);
    return `pi-${stamp}-${rand}`;
  }

  function ensurePrintableIdeaIds(list) {
    const source = Array.isArray(list) ? list : [];
    const used = new Set();
    return source.map((item) => {
      if (item == null) return item;
      if (typeof item === "string") {
        const title = text(item);
        if (!title) return item;
        let id = newPrintableIdeaId();
        while (used.has(id)) id = newPrintableIdeaId();
        used.add(id);
        return { title, id };
      }
      if (typeof item !== "object") return item;
      const next = { ...item };
      let id = text(next.id);
      if (!id || used.has(id)) {
        id = newPrintableIdeaId();
        while (used.has(id)) id = newPrintableIdeaId();
        next.id = id;
      }
      used.add(id);
      return next;
    });
  }

  function resolvePrintableIdeaIdFromEvent(event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return "";
    const button = target.closest("[data-kit-media-remove=\"printableIdea\"]");
    if (!button) return "";
    return text(button.getAttribute("data-printable-idea-id"));
  }

  function removePrintableIdeaById(list, ideaId) {
    const id = text(ideaId);
    const source = Array.isArray(list) ? list : [];
    if (!id) return { list: source.slice(), removed: null, index: -1 };
    const index = source.findIndex((item) => printableIdeaId(item) === id);
    if (index < 0) return { list: source.slice(), removed: null, index: -1 };
    const next = source.slice();
    const removed = next.splice(index, 1)[0];
    return { list: next, removed, index };
  }

  function isPlaceholderTitle(title) {
    const normalized = text(title).toLowerCase();
    if (!normalized) return true;
    return PLACEHOLDER_TITLE.test(normalized);
  }

  function ideaContentKey(idea) {
    return printableIdeaTitle(idea).toLowerCase();
  }

  /**
   * Duplicate/filler selection for one lesson draft list.
   * Keeps the first legitimate unique title; removes placeholders and later duplicates.
   */
  function selectDuplicateFillerPrintableIdeas(list) {
    const source = Array.isArray(list) ? list : [];
    const seenTitles = new Set();
    const remove = [];
    const keep = [];
    source.forEach((idea, index) => {
      const id = printableIdeaId(idea);
      const title = printableIdeaTitle(idea);
      const key = ideaContentKey(idea);
      const record = {
        id,
        index,
        title: title || "(untitled)",
      };
      if (isPlaceholderTitle(title)) {
        remove.push({ ...record, reason: "placeholder" });
        return;
      }
      if (seenTitles.has(key)) {
        remove.push({ ...record, reason: "duplicate_title" });
        return;
      }
      seenTitles.add(key);
      keep.push(record);
    });
    return { keep, remove };
  }

  function applyDuplicateFillerCleanup(list) {
    const sourced = ensurePrintableIdeaIds(Array.isArray(list) ? list : []);
    const selection = selectDuplicateFillerPrintableIdeas(sourced);
    const removeIds = new Set(selection.remove.map((row) => row.id).filter(Boolean));
    const next = sourced.filter((idea) => !removeIds.has(printableIdeaId(idea)));
    return { list: next, selection };
  }

  return {
    printableIdeaTitle,
    printableIdeaId,
    newPrintableIdeaId,
    ensurePrintableIdeaIds,
    resolvePrintableIdeaIdFromEvent,
    removePrintableIdeaById,
    selectDuplicateFillerPrintableIdeas,
    applyDuplicateFillerCleanup,
    isPlaceholderTitle,
  };
});
