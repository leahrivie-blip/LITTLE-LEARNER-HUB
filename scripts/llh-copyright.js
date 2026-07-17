/**
 * Shared copyright notice for Little Learner Hub surfaces.
 * Browser: globalThis.LlhCopyright
 * Node: module.exports
 */
(function llhCopyrightModule() {
  "use strict";

  const YEAR = 2026;
  const TEXT = `© ${YEAR} Little Learner Hub by Leah. All Rights Reserved.`;
  const NOTICE_LONG = `${TEXT} Lesson plans, activities, printables, and other platform content are protected intellectual property. Unauthorized copying, sharing, resale, or redistribution is prohibited.`;
  const PDF_FOOTER = TEXT;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function noticeHtml(className = "llh-copyright-notice") {
    return `<p class="${className}">${escapeHtml(TEXT)}</p>`;
  }

  function noticeBlockHtml(className = "llh-copyright-block") {
    return `
      <footer class="${className}" aria-label="Copyright">
        <p class="llh-copyright-notice">${escapeHtml(TEXT)}</p>
      </footer>
    `;
  }

  const api = {
    YEAR,
    TEXT,
    NOTICE_LONG,
    PDF_FOOTER,
    escapeHtml,
    noticeHtml,
    noticeBlockHtml,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhCopyright = api;
  }
})();
