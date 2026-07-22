/**
 * Shared, dependency-free renderer for the clean read-only "document view" —
 * used by the admin Responses Dashboard, the standalone recipient page, and
 * the standalone admin print/download page. Renders a paper-style HTML
 * fragment from the structured `content` object returned by
 * GET .../responses/:id/document (admin) or GET .../form-recipient/:id/document
 * (recipient). Never renders raw HTML from user answers — everything is
 * escaped.
 */
(function initFormDocumentView(global) {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function labelize(value) {
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return String(value);
    }
  }

  function statusToneClass(status) {
    if (status === "approved") return "fdv-tone-good";
    if (["returned_for_correction", "voided", "expired", "declined"].includes(status)) return "fdv-tone-warn";
    if (["submitted", "under_review", "corrected_and_resubmitted"].includes(status)) return "fdv-tone-info";
    return "fdv-tone-neutral";
  }

  function fieldHtml(field) {
    if (field.type === "content_heading") return `<h3 class="fdv-content-heading">${escapeHtml(field.label)}</h3>`;
    if (field.type === "content_paragraph") return `<p class="fdv-content-paragraph">${escapeHtml(field.helpText || field.label)}</p>`;
    if (field.type === "content_divider") return `<hr class="fdv-divider" />`;
    return `
      <div class="fdv-qa-row">
        <span class="fdv-qa-label">${escapeHtml(field.label)}${field.required ? ' <span class="fdv-required-star">*</span>' : ""}</span>
        <span class="fdv-qa-answer${field.answerDisplay === "Not answered" ? " is-empty" : ""}">${escapeHtml(field.answerDisplay)}</span>
      </div>
    `;
  }

  function sectionHtml(section) {
    return `
      <section class="fdv-section">
        <h3 class="fdv-section-title">${escapeHtml(section.title)}</h3>
        ${section.description ? `<p class="fdv-section-desc">${escapeHtml(section.description)}</p>` : ""}
        ${(section.fields || []).map(fieldHtml).join("")}
      </section>
    `;
  }

  function signatureHtml(signature) {
    const invalidated = Boolean(signature.invalidatedAt);
    return `
      <div class="fdv-signature-block${invalidated ? " is-invalidated" : ""}">
        <div class="fdv-signature-line">${escapeHtml(signature.signerName)}</div>
        <div class="fdv-signature-meta">
          <span>${escapeHtml(labelize(signature.signerRole))}</span>
          <span>${escapeHtml(formatDate(signature.signedAt))}</span>
        </div>
        ${signature.hasDrawnSignature && signature.drawnDataUrl ? `<img class="fdv-signature-image" src="${escapeHtml(signature.drawnDataUrl)}" alt="Drawn signature" />` : ""}
        ${invalidated ? `<p class="fdv-signature-invalidated">Invalidated: ${escapeHtml(signature.invalidatedReason || "This signature is no longer valid.")}</p>` : ""}
      </div>
    `;
  }

  function correctionHistoryHtml(entries) {
    if (!entries || !entries.length) return "";
    return `
      <section class="fdv-section fdv-history">
        <h3 class="fdv-section-title">Correction History</h3>
        <ul class="fdv-history-list">
          ${entries.map((entry) => `
            <li>
              <strong>${escapeHtml(labelize(entry.action))}</strong>
              <span>${escapeHtml(formatDate(entry.at))}</span>
              ${entry.message ? `<p>${escapeHtml(entry.message)}</p>` : ""}
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function internalNotesHtml(notes) {
    if (!notes || !notes.length) return "";
    return `
      <section class="fdv-section fdv-internal-notes">
        <h3 class="fdv-section-title">Internal Notes (staff only)</h3>
        <ul class="fdv-history-list">
          ${notes.map((note) => `<li><p>${escapeHtml(note.message)}</p><span>${escapeHtml(note.authorEmail)} &middot; ${escapeHtml(formatDate(note.createdAt))}</span></li>`).join("")}
        </ul>
      </section>
    `;
  }

  /**
   * Renders the full paper-style document as an HTML string.
   * options.showInternalNotes: only pass true for the admin-facing view —
   * recipients never see internal staff notes.
   */
  function render(content, options = {}) {
    if (!content) {
      return `<div class="fdv-empty">No document is available yet.</div>`;
    }
    const showInternalNotes = options.showInternalNotes === true;
    return `
      <article class="fdv-document" data-fdv-document>
        <header class="fdv-header">
          <div class="fdv-logo-placeholder" aria-hidden="true">LL</div>
          <div>
            <div class="fdv-program-name">${escapeHtml(content.program?.name || "Little Learner Hub Preview Program")}</div>
            ${content.program?.address ? `<div class="fdv-program-address">${escapeHtml(content.program.address)}</div>` : ""}
          </div>
          <div class="fdv-header-badges">
            <span class="fdv-badge">Version ${escapeHtml(content.version?.versionNumber || 1)}</span>
            <span class="fdv-badge ${statusToneClass(content.status)}">${escapeHtml(content.statusLabel || labelize(content.status))}</span>
          </div>
        </header>

        <h1 class="fdv-title">${escapeHtml(content.form?.title || "Form")}</h1>
        <div class="fdv-meta-row">
          <span>${escapeHtml(labelize(content.recipient?.type))}: ${escapeHtml(content.recipient?.label || "")}</span>
          ${content.relatedChildName ? `<span>Child: ${escapeHtml(content.relatedChildName)}</span>` : ""}
          ${content.relatedClassroomName ? `<span>Classroom: ${escapeHtml(content.relatedClassroomName)}</span>` : ""}
          ${content.dueDate ? `<span>Due: ${escapeHtml(content.dueDate)}</span>` : ""}
        </div>
        <div class="fdv-dates-row">
          ${content.startedAt ? `<span>Started: ${escapeHtml(formatDate(content.startedAt))}</span>` : ""}
          ${content.submittedAt ? `<span>Submitted: ${escapeHtml(formatDate(content.submittedAt))}</span>` : ""}
          ${content.approvedAt ? `<span>Approved: ${escapeHtml(formatDate(content.approvedAt))}</span>` : ""}
          ${content.voidedAt ? `<span>Voided: ${escapeHtml(formatDate(content.voidedAt))} &mdash; ${escapeHtml(content.voidReason || "")}</span>` : ""}
        </div>

        <hr class="fdv-divider" />

        ${(content.sections || []).map(sectionHtml).join("")}

        ${(content.signatures || []).length ? `
          <section class="fdv-section fdv-signatures">
            <h3 class="fdv-section-title">Signatures</h3>
            <div class="fdv-signature-grid">
              ${content.signatures.map(signatureHtml).join("")}
            </div>
          </section>
        ` : ""}

        ${correctionHistoryHtml(content.correctionHistory)}
        ${showInternalNotes ? internalNotesHtml(content.internalNotes) : ""}

        <footer class="fdv-footer">
          <p>${escapeHtml(content.label || "Testing Preview — Fake Data Only")}</p>
          <p class="fdv-generated-at">Document generated ${escapeHtml(formatDate(content.generatedAt))}</p>
        </footer>
      </article>
    `;
  }

  global.LLHFormDocumentView = { render, escapeHtml, formatDate, labelize };
})(window);
