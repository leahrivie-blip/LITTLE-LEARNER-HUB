/**
 * Phase 19 — shared accessibility helpers (browser).
 * Not a WCAG certification claim — practical foundations for keyboard, focus, dialogs, errors.
 */
(function initPlatformA11y(global) {
  const LIVE_ID = "llh-a11y-live-region";

  function ensureLiveRegion() {
    let el = document.getElementById(LIVE_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = LIVE_ID;
    el.className = "llh-a11y-live visually-hidden";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    document.body.appendChild(el);
    return el;
  }

  function announce(message, { assertive = false } = {}) {
    const el = ensureLiveRegion();
    el.setAttribute("aria-live", assertive ? "assertive" : "polite");
    el.textContent = "";
    window.setTimeout(() => {
      el.textContent = String(message || "").trim();
    }, 20);
  }

  function getFocusable(container) {
    if (!container) return [];
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    return Array.from(container.querySelectorAll(selector)).filter((el) => {
      if (el.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function trapFocus(dialogEl, event) {
    if (!dialogEl || event.key !== "Tab") return;
    const focusable = getFocusable(dialogEl);
    if (!focusable.length) {
      event.preventDefault();
      dialogEl.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openDialog(dialogEl, { labelId, restoreFocus = true } = {}) {
    if (!dialogEl) return () => {};
    const previouslyFocused = document.activeElement;
    dialogEl.setAttribute("role", "dialog");
    dialogEl.setAttribute("aria-modal", "true");
    if (labelId) dialogEl.setAttribute("aria-labelledby", labelId);
    dialogEl.hidden = false;
    dialogEl.removeAttribute("aria-hidden");
    const focusable = getFocusable(dialogEl);
    (focusable[0] || dialogEl).focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      trapFocus(dialogEl, event);
    };
    document.addEventListener("keydown", onKey);
    function close() {
      document.removeEventListener("keydown", onKey);
      dialogEl.hidden = true;
      dialogEl.setAttribute("aria-hidden", "true");
      if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    }
    return close;
  }

  function renderErrorSummary(container, errors = []) {
    if (!container) return;
    const list = Array.isArray(errors) ? errors.filter((e) => e && e.message) : [];
    if (!list.length) {
      container.innerHTML = "";
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.setAttribute("role", "alert");
    container.setAttribute("aria-live", "assertive");
    container.classList.add("llh-error-summary");
    container.innerHTML = `
      <h2 class="llh-error-summary__title">Please fix the following</h2>
      <ul class="llh-error-summary__list">
        ${list.map((err) => {
          const fieldId = String(err.fieldId || "").replace(/"/g, "");
          const msg = String(err.message || "").replace(/</g, "&lt;");
          return `<li><a href="#${fieldId}">${msg}</a></li>`;
        }).join("")}
      </ul>
    `;
    const firstLink = container.querySelector("a");
    if (firstLink) firstLink.focus();
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function ensureSkipLink() {
    if (document.getElementById("llh-skip-to-main")) return;
    const link = document.createElement("a");
    link.id = "llh-skip-to-main";
    link.className = "llh-skip-link";
    link.href = "#main-content";
    link.textContent = "Skip to main content";
    document.body.insertBefore(link, document.body.firstChild);
    const main = document.querySelector("main.main, main, #main-content");
    if (main && !main.id) main.id = "main-content";
    if (main && !main.getAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  }

  function statusWithText(label, tone = "info") {
    const tones = {
      success: "Success",
      warning: "Warning",
      error: "Error",
      info: "Info",
      loading: "Loading",
      empty: "Empty",
    };
    const text = tones[tone] || "Info";
    return `<span class="llh-status-pill llh-status-pill--${tone}" data-status-tone="${tone}"><span class="llh-status-pill__label">${text}:</span> ${String(label || "").replace(/</g, "&lt;")}</span>`;
  }

  const api = {
    ensureLiveRegion,
    announce,
    getFocusable,
    trapFocus,
    openDialog,
    renderErrorSummary,
    prefersReducedMotion,
    ensureSkipLink,
    statusWithText,
    featureMarker: "phase19-platform-resilience",
  };

  global.LLHPlatformA11y = api;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureSkipLink();
      ensureLiveRegion();
    });
  } else {
    ensureSkipLink();
    ensureLiveRegion();
  }
})(typeof window !== "undefined" ? window : globalThis);
