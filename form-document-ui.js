/**
 * Standalone admin document/print/download page. Opened in a new tab from
 * the Responses Dashboard so printing never includes the app shell's own
 * chrome (sidebar, header, other modals). Reuses the same verified admin
 * session already stored in this browser's localStorage — no token is passed
 * through the URL.
 */
(function initFormDocumentUI(global) {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function root() {
    return document.querySelector("#fdoc-app");
  }

  function readAdminSession() {
    try {
      return JSON.parse(localStorage.getItem("llhAdminSession") || "null");
    } catch {
      return null;
    }
  }

  function readResponseId() {
    const params = new URLSearchParams(global.location.search);
    return params.get("responseId") || "";
  }

  function renderError(message) {
    root().innerHTML = `
      <div class="fr-card fr-error-screen">
        <h2>Document unavailable</h2>
        <p>${escapeHtml(message)}</p>
        <p class="fr-help-text">Open this page from a response's detail panel inside Forms Center &mdash; Responses.</p>
      </div>
    `;
  }

  function renderDocument(content, meta) {
    root().innerHTML = `
      <div class="fr-banner fr-no-print"><span>Testing Preview — Fake Data Only</span><span>Admin document view &mdash; not sent to anyone.</span></div>
      <div class="fdv-page">
        ${window.LLHFormDocumentView.render(content, { showInternalNotes: true })}
      </div>
      <div class="fr-button-row fr-no-print" style="justify-content:center;">
        <button type="button" class="fr-button fr-button-ghost" data-fdoc-print>Print</button>
        <button type="button" class="fr-button fr-button-primary" data-fdoc-download>Download PDF</button>
        ${meta && meta.frozen === false ? `<span class="fr-help-text">This is a live document view. A permanent snapshot is generated automatically when the response is approved.</span>` : ""}
      </div>
    `;
    root().querySelector("[data-fdoc-print]")?.addEventListener("click", () => global.print());
    root().querySelector("[data-fdoc-download]")?.addEventListener("click", () => global.print());
  }

  async function init() {
    const session = readAdminSession();
    if (!session || !session.token) {
      renderError("You must be signed in as a verified admin in this browser to view this document.");
      return;
    }
    const responseId = readResponseId();
    if (!responseId) {
      renderError("No response was specified.");
      return;
    }
    try {
      const res = await fetch(`/api/forms-center/responses/${encodeURIComponent(responseId)}/document`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      document.title = `${data.content?.form?.title || "Form"} — Little Learner Hub`;
      renderDocument(data.content, data);
    } catch (error) {
      renderError(error.message || "Could not load this document.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
