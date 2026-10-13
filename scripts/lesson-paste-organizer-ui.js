/**
 * Paste and Organize Lesson Plan — UI fragments (deterministic, no AI).
 */
"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHLessonPasteOrganizerUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPasteStep(ui) {
    const busy = ui.creating ? " disabled" : "";
    const charCount = (ui.pasteText || "").length;
    const sectionCount = ui.organizerParse?.detectedSections?.length || 0;
    return `
      <p class="muted-copy">Paste and Organize uses recognized headings and labels only. Nothing is invented. Unmapped text stays in Unsorted Content until you choose a destination.</p>
      <label>Paste lesson plan text
        <textarea id="adminPasteOrganizeText" rows="18" placeholder="Title:&#10;Autumn Harvest&#10;&#10;Age Group:&#10;Preschool 3–5&#10;&#10;Monday:&#10;Activity 1: Apple sorting">${escapeHtml(ui.pasteText || "")}</textarea>
      </label>
      <p class="muted-copy">Characters: ${charCount} · Detected sections: ${sectionCount}</p>
      <label class="ghost-button" style="display:inline-block;cursor:pointer">
        Upload text file
        <input type="file" accept=".txt,text/plain" id="adminPasteOrganizeFile" hidden${busy ? " disabled" : ""}/>
      </label>
      <div class="form-actions">
        <button type="button" class="ghost-button" data-paste-organize-clear${busy}>Clear text</button>
        <button type="button" class="ghost-button" data-paste-organize-restore${busy}>Restore original paste</button>
        <button type="button" class="ghost-button" data-create-lesson-choose${busy}>Back</button>
        <button type="button" class="primary-button" data-paste-organize-parse${busy}>Organize / Review</button>
        <button type="button" class="ghost-button" data-create-lesson-cancel${busy}>Cancel</button>
      </div>
    `;
  }

  function renderStructurePreviewBlocks(ui) {
    const applyApi = typeof globalThis !== "undefined" ? globalThis.LLHLessonPasteOrganizerApply : null;
    if (!applyApi || !ui.organizerParse) {
      return "<p class=\"muted-copy\">Overview · Monday–Friday · Books · Songs · Printables · Family · Materials · Safety · Teacher Notes</p>";
    }
    const preview = applyApi.buildStructurePreview(ui.organizerParse, {
      ownerDecisions: ui.organizerDecisions || {},
      ageMarkedUnknown: ui.ageMarkedUnknown === true,
      themeMarkedUnknown: ui.themeMarkedUnknown === true,
    });
    return preview.sections.map((section) => `
      <div class="lesson-paste-organizer-section">
        <h5>${escapeHtml(section.title)}</h5>
        <ul>${section.fields.map((f) => {
          const warn = f.warning ? ` <span class="form-message">⚠ ${escapeHtml(f.warning)}</span>` : "";
          const val = f.value ? `: ${escapeHtml(String(f.value).slice(0, 160))}${f.value.length > 160 ? "…" : ""}` : "";
          return `<li><strong>${escapeHtml(f.label)}</strong>${val}${warn}</li>`;
        }).join("")}</ul>
      </div>
    `).join("");
  }

  function renderDecisionButtons(itemId) {
    const actions = [
      ["monday", "Put in Monday"],
      ["tuesday", "Put in Tuesday"],
      ["wednesday", "Put in Wednesday"],
      ["thursday", "Put in Thursday"],
      ["friday", "Put in Friday"],
      ["weeklyMaterials", "Put in Weekly Materials"],
      ["books", "Put in Books"],
      ["songs", "Put in Songs"],
      ["printables", "Put in Printables"],
      ["familyConnection", "Put in Family Connection"],
      ["unsorted", "Leave Unsorted"],
      ["delete", "Delete this text"],
    ];
    return actions.map(([key, label]) =>
      `<button type="button" class="ghost-button" data-paste-organize-decision="${escapeHtml(key)}" data-paste-organize-item="${escapeHtml(itemId)}">${escapeHtml(label)}</button>`,
    ).join(" ");
  }

  function renderReviewStep(ui) {
    const busy = ui.creating ? " disabled" : "";
    const report = ui.organizerParse?.report || {};
    const filled = report.filled || [];
    const missingRequired = report.missingRequired || [];
    const missingOptional = (report.missingOptional || []).slice(0, 12);
    const unsorted = report.unsorted || [];
    const conflicts = report.conflicts || [];
    const unresolvedDates = report.unresolvedDates || [];
    const decisions = ui.organizerDecisions || {};

    return `
      <div class="admin-create-lesson-preview lesson-paste-organizer-review">
        <p class="eyebrow">PASTE &amp; ORGANIZE — REVIEW</p>
        <p class="muted-copy">Draft only. No publish. Original paste preserved in import history.</p>

        <h4>FILLED (${filled.length})</h4>
        <ul>${filled.map((f) => `<li><strong>${escapeHtml(f.path)}</strong>: ${escapeHtml(f.valuePreview || "")}</li>`).join("") || "<li class=\"muted-copy\">None</li>"}</ul>

        <h4>MISSING REQUIRED</h4>
        <ul>${missingRequired.map((m) => `<li class="form-message">⚠ ${escapeHtml(m.label)}</li>`).join("") || "<li class=\"muted-copy\">None</li>"}</ul>
        <label><input type="checkbox" data-paste-organize-age-unknown${busy} ${ui.ageMarkedUnknown ? "checked" : ""}/> Age group unknown</label>
        <label><input type="checkbox" data-paste-organize-theme-unknown${busy} ${ui.themeMarkedUnknown ? "checked" : ""}/> Theme unknown</label>

        <h4>MISSING OPTIONAL (sample)</h4>
        <ul>${missingOptional.map((m) => `<li>${escapeHtml(m.label)}</li>`).join("")}${missingOptional.length ? "" : "<li class=\"muted-copy\">—</li>"}</ul>

        <h4>UNSORTED CONTENT (${unsorted.length})</h4>
        ${unsorted.map((u) => `
          <div class="lesson-paste-organizer-unsorted" data-unsorted-id="${escapeHtml(u.id)}">
            <p><strong>Line ${u.line}</strong> — ${escapeHtml(u.heading)} (${escapeHtml(u.reason)})</p>
            <pre class="paste-organizer-snippet">${escapeHtml((u.text || "").slice(0, 400))}</pre>
            <p>Decision: ${escapeHtml(decisions[u.id] || "none")}</p>
            <div class="form-actions form-actions-wrap">${renderDecisionButtons(u.id)}</div>
          </div>
        `).join("") || "<p class=\"muted-copy\">None</p>"}

        <h4>CONFLICTS (${conflicts.length})</h4>
        <ul>${conflicts.map((c) => `<li>${escapeHtml(c.type)} ${escapeHtml(c.path || "")} ${(c.values || []).map(escapeHtml).join(" | ")}</li>`).join("") || "<li class=\"muted-copy\">None</li>"}</ul>

        <h4>UNRESOLVED DATES</h4>
        <ul>${unresolvedDates.map((d) => `<li>${escapeHtml(d.text)} (${escapeHtml(d.reason)})</li>`).join("") || "<li class=\"muted-copy\">None</li>"}</ul>

        <h4>LESSON STRUCTURE PREVIEW</h4>
        ${renderStructurePreviewBlocks(ui)}
        ${ui.organizerError ? `<p class="form-message" role="alert">${escapeHtml(ui.organizerError)}</p>` : ""}
      </div>
      <div class="form-actions">
        <button type="button" class="ghost-button" data-paste-organize-undo${busy} ${(ui.organizerDecisionHistory || []).length ? "" : "disabled"}>Undo last decision</button>
        <button type="button" class="ghost-button" data-paste-organize-print${busy}>Print preview</button>
        <button type="button" class="ghost-button" data-paste-organize-back${busy}>Back to paste</button>
        <button type="button" class="ghost-button" data-paste-organize-restore${busy}>Restore original paste</button>
        <button type="button" class="primary-button" data-paste-organize-save-draft${busy} ${ui.organizerParse?.canSaveDraft ? "" : "disabled"}>Save draft</button>
        <button type="button" class="ghost-button" data-create-lesson-cancel${busy}>Cancel</button>
      </div>
    `;
  }

  return {
    escapeHtml,
    renderPasteStep,
    renderReviewStep,
  };
});
