/**
 * Wave 1 — Forms dirty-state / input-integrity foundation.
 * Reusable by later Paperwork HQ / builder surfaces.
 *
 * Lessons from Owner Admin disappearing-text:
 * - Capture drafts before remount
 * - Ignore stale server rehydration when local revision is newer
 * - Stable form/document ids
 */
(function formsDirtyStateModule(global) {
  "use strict";

  const store = new Map();

  function keyFor(formId, fieldId) {
    return `${String(formId || "").trim()}::${String(fieldId || "").trim()}`;
  }

  function touch(formId, fieldId, value) {
    const key = keyFor(formId, fieldId);
    const prev = store.get(key) || { rev: 0, value: "", dirty: false };
    const next = {
      rev: Number(prev.rev || 0) + 1,
      value: value == null ? "" : String(value),
      dirty: true,
      updatedAt: Date.now(),
    };
    store.set(key, next);
    return next;
  }

  function get(formId, fieldId) {
    return store.get(keyFor(formId, fieldId)) || null;
  }

  function clearDirty(formId, fieldId, expectedRev) {
    const key = keyFor(formId, fieldId);
    const prev = store.get(key);
    if (!prev) return;
    if (expectedRev != null && Number(prev.rev) !== Number(expectedRev)) return;
    store.set(key, { ...prev, dirty: false });
  }

  function clearForm(formId) {
    const prefix = `${String(formId || "").trim()}::`;
    [...store.keys()].forEach((key) => {
      if (key.startsWith(prefix)) store.delete(key);
    });
  }

  /**
   * Decide whether a server/hydration payload may overwrite the local field.
   * Returns true when local dirty rev is newer than serverRev (or local dirty with no serverRev).
   */
  function shouldKeepLocal(formId, fieldId, serverRev) {
    const local = get(formId, fieldId);
    if (!local || !local.dirty) return false;
    if (serverRev == null || serverRev === "") return true;
    return Number(local.rev || 0) > Number(serverRev || 0);
  }

  function applyIfNotStale(formId, fieldId, serverValue, serverRev) {
    if (shouldKeepLocal(formId, fieldId, serverRev)) {
      return { applied: false, value: get(formId, fieldId)?.value ?? "", keptLocal: true };
    }
    const key = keyFor(formId, fieldId);
    store.set(key, {
      rev: Number(serverRev || 0),
      value: serverValue == null ? "" : String(serverValue),
      dirty: false,
      updatedAt: Date.now(),
    });
    return { applied: true, value: store.get(key).value, keptLocal: false };
  }

  function captureFormDrafts(formEl, formId) {
    if (!formEl || !formId) return {};
    const out = {};
    formEl.querySelectorAll("input, textarea, select").forEach((el) => {
      const fieldId = el.name || el.id;
      if (!fieldId || el.type === "file") return;
      const value = el.type === "checkbox" || el.type === "radio"
        ? (el.checked ? (el.value || "true") : "")
        : el.value;
      if (el.type === "radio" && !el.checked) return;
      out[fieldId] = touch(formId, fieldId, value);
    });
    return out;
  }

  function restoreFormDrafts(formEl, formId) {
    if (!formEl || !formId) return 0;
    let restored = 0;
    formEl.querySelectorAll("input, textarea, select").forEach((el) => {
      const fieldId = el.name || el.id;
      if (!fieldId) return;
      const local = get(formId, fieldId);
      if (!local || !local.dirty) return;
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = Boolean(local.value) && (el.type === "checkbox" || el.value === local.value);
      } else {
        el.value = local.value;
      }
      restored += 1;
    });
    return restored;
  }

  function hasDirty(formId = "") {
    const prefix = formId ? `${String(formId).trim()}::` : "";
    for (const [key, row] of store.entries()) {
      if (!row || !row.dirty) continue;
      if (!prefix || key.startsWith(prefix)) return true;
    }
    return false;
  }

  function installLeaveGuard() {
    if (typeof window === "undefined" || window.__llhFormsDirtyLeaveGuard) return;
    window.__llhFormsDirtyLeaveGuard = true;
    window.addEventListener("beforeunload", (event) => {
      // Wave 8 — warn on browser close/refresh when builder/assign drafts are dirty.
      if (!hasDirty("formBuilder") && !hasDirty("assignFlow")) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  const api = {
    touch,
    get,
    clearDirty,
    clearForm,
    shouldKeepLocal,
    applyIfNotStale,
    captureFormDrafts,
    restoreFormDrafts,
    hasDirty,
    installLeaveGuard,
    _store: store,
  };

  global.FormsDirtyState = api;
  global.LlhFormsDirtyState = api;
  global.LLHFormsDirtyState = api;
  if (typeof window !== "undefined") {
    try { installLeaveGuard(); } catch (_e) { /* ignore */ }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
