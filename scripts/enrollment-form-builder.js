/**
 * Enrollment Form builder helpers (browser + Node).
 * Builds on Wave 3 Form Builder — does not create a second form engine.
 */
(function enrollmentFormBuilderModule(root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../server/enrollment-form-baseline.js"));
  } else {
    const fallback = root.LlhEnrollmentBaseline || null;
    root.LlhEnrollmentFormBuilder = factory(fallback);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function factory(baseline) {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getBaseline() {
    if (baseline) return baseline;
    if (typeof globalThis !== "undefined" && globalThis.LlhEnrollmentBaseline) {
      return globalThis.LlhEnrollmentBaseline;
    }
    return null;
  }

  function isEnrollmentTemplate(template) {
    const api = getBaseline();
    if (api?.isEnrollmentBaselineTemplate) return api.isEnrollmentBaselineTemplate(template);
    return String(template?.formKind || "") === "enrollment_baseline"
      || String(template?.packFormId || "") === "hdh-pack-enrollment";
  }

  function ensureEnrollmentTemplate(template = {}) {
    const api = getBaseline();
    if (!api) return template;
    if (Array.isArray(template.fields) && template.fields.length && Array.isArray(template.sections)) {
      return api.applyEnrollmentVisibility(template);
    }
    const seeded = api.buildEnrollmentBaselineTemplate({
      id: template.id,
      title: template.title || api.ENROLLMENT_TEMPLATE_TITLE,
      sourceType: template.sourceType || "provider",
      originTemplateId: template.originTemplateId || template.id || "",
    });
    return api.applyEnrollmentVisibility({
      ...seeded,
      ...template,
      fields: (Array.isArray(template.fields) && template.fields.length) ? template.fields : seeded.fields,
      sections: (Array.isArray(template.sections) && template.sections.length) ? template.sections : seeded.sections,
      enrollmentConfig: template.enrollmentConfig || seeded.enrollmentConfig,
      formKind: "enrollment_baseline",
      packFormId: template.packFormId || seeded.packFormId,
      body: template.body || seeded.body,
    });
  }

  function blankLineForField(field) {
    if (!field) return "";
    if (field.type === "info") return String(field.label || "");
    if (field.type === "long_text") {
      return `${field.label}\n________________________________________________________________________\n________________________________________________________________________\n________________________________________________________________________`;
    }
    if (field.type === "checkbox") return `[ ] ${field.label}`;
    if (field.type === "yes_no") return `${field.label}\n[ ] Yes          [ ] No`;
    if (field.type === "signature") {
      return `${field.label}\n________________________________________________    Date __________`;
    }
    if (field.type === "time") {
      return `${field.label}: ______ : ______   [ ] AM   [ ] PM`;
    }
    if (field.type === "date") {
      return `${field.label}: ____ / ____ / ________`;
    }
    if (field.type === "dropdown" || field.type === "radio") {
      const opts = (field.options || []).map((opt) => `[ ] ${opt.label || opt.value}`).join("     ");
      return `${field.label}\n${opts || "____________________"}`;
    }
    return `${field.label}: ________________________________________________`;
  }

  function renderPrintBlankText(template = {}, { programName = "" } = {}) {
    const api = getBaseline();
    const prepared = ensureEnrollmentTemplate(template);
    const sections = (prepared.sections || []).filter((section) => section.visible !== false)
      .sort((a, b) => Number(a.order) - Number(b.order));
    const fields = (prepared.fields || []).filter((field) => field.visible !== false);
    const lines = [];
    lines.push("ENROLLMENT FORM");
    lines.push("============================================================");
    lines.push(`Program: ${String(programName || "").trim() || "____________________________________________"}`);
    lines.push("Child name: ______________________________________________");
    lines.push("Date completed: __________________________________________");
    lines.push("");
    lines.push(api?.BASELINE_DISCLAIMER
      || "Customize this form for your program. State or licensing-specific requirements may need to be added separately.");
    lines.push("");
    // Soft page-break groups for browser print (form feed between major blocks).
    const pageBreakAfter = new Set(["schedule", "household", "medical", "daily_care", "permissions"]);
    sections.forEach((section) => {
      const sectionFields = fields
        .filter((field) => String(field.sectionId || "") === String(section.id))
        .sort((a, b) => Number(a.order) - Number(b.order));
      if (!sectionFields.length) return;
      lines.push("");
      lines.push(String(section.title || section.id).toUpperCase());
      lines.push("------------------------------------------------------------");
      if (section.id === "schedule") {
        // Group weekday rows for readable handwriting
        const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
        days.forEach((day) => {
          const attending = sectionFields.find((f) => f.id === `enroll.schedule.${day}.attending`);
          const arrival = sectionFields.find((f) => f.id === `enroll.schedule.${day}.arrival`);
          const departure = sectionFields.find((f) => f.id === `enroll.schedule.${day}.departure`);
          if (!attending && !arrival && !departure) return;
          const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
          lines.push(`${dayLabel}`);
          if (attending) lines.push(`[ ] Attending`);
          if (arrival) lines.push(`Arrival: ______ : ______   [ ] AM   [ ] PM`);
          if (departure) lines.push(`Departure: ______ : ______   [ ] AM   [ ] PM`);
          lines.push("");
        });
        sectionFields
          .filter((f) => !/\.(monday|tuesday|wednesday|thursday|friday)\./.test(String(f.id)))
          .forEach((field) => {
            lines.push(blankLineForField(field));
            lines.push("");
          });
      } else {
        sectionFields.forEach((field) => {
          // Never print internal IDs
          lines.push(blankLineForField(field));
          lines.push("");
        });
      }
      if (pageBreakAfter.has(section.id)) {
        lines.push("\f");
      }
    });
    lines.push("");
    lines.push("— End of enrollment form —");
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function renderEnrollmentPreviewHtml(template = {}, {
    escape = escapeHtml,
    programName = "",
    mode = "preview",
  } = {}) {
    const prepared = ensureEnrollmentTemplate(template);
    const sections = (prepared.sections || []).filter((section) => section.visible !== false)
      .sort((a, b) => Number(a.order) - Number(b.order));
    const fields = (prepared.fields || []).filter((field) => field.visible !== false);
    const sectionHtml = sections.map((section) => {
      const sectionFields = fields
        .filter((field) => String(field.sectionId || "") === String(section.id))
        .sort((a, b) => Number(a.order) - Number(b.order));
      if (!sectionFields.length) return "";
      const fieldHtml = sectionFields.map((field) => {
        const req = field.required ? '<span class="fb-required" aria-label="required">*</span>' : "";
        const help = field.helpText ? `<p class="muted-copy fb-help">${escape(field.helpText)}</p>` : "";
        if (field.type === "info") {
          return `<div class="fb-preview-field fb-preview-info"><p>${escape(field.label)}</p>${help}</div>`;
        }
        if (field.type === "long_text") {
          return `<div class="fb-preview-field"><label class="fb-preview-label"><span>${escape(field.label)}${req}</span>${help}<textarea rows="3" disabled></textarea></label></div>`;
        }
        if (field.type === "checkbox") {
          return `<div class="fb-preview-field"><label><input type="checkbox" disabled /> ${escape(field.label)}${req}</label>${help}</div>`;
        }
        if (field.type === "yes_no") {
          return `<div class="fb-preview-field"><span class="fb-preview-label">${escape(field.label)}${req}</span>${help}
            <div class="fb-preview-choices"><label><input type="radio" disabled /> Yes</label>
            <label><input type="radio" disabled /> No</label></div></div>`;
        }
        if (field.type === "signature") {
          return `<div class="fb-preview-field fb-preview-signature"><span class="fb-preview-label">${escape(field.label)}${req}</span>${help}
            <div class="fb-signature-placeholder" aria-hidden="true">Signature line</div></div>`;
        }
        const inputType = field.type === "date" ? "date" : field.type === "time" ? "time" : "text";
        if (field.type === "dropdown" || field.type === "radio") {
          return `<div class="fb-preview-field"><span class="fb-preview-label">${escape(field.label)}${req}</span>${help}
            <div class="fb-preview-choices">${(field.options || []).map((opt) => (
              `<label><input type="${field.type === "dropdown" ? "radio" : "radio"}" disabled /> ${escape(opt.label)}</label>`
            )).join("")}</div></div>`;
        }
        return `<div class="fb-preview-field"><label class="fb-preview-label"><span>${escape(field.label)}${req}</span>${help}<input type="${inputType}" disabled /></label></div>`;
      }).join("");
      return `
        <section class="enroll-preview-section" data-enroll-section="${escape(section.id)}">
          <h4>${escape(section.title)}</h4>
          <div class="fb-preview-fields">${fieldHtml}</div>
        </section>`;
    }).join("");

    return `
      <article class="fb-preview enroll-form-preview" data-form-preview="true" data-enroll-mode="${escape(mode)}">
        <header class="fb-preview-head enroll-preview-head">
          <p class="eyebrow">ENROLLMENT FORM</p>
          <h3>${escape(prepared.title || "Enrollment Form")}</h3>
          <p class="muted-copy">${escape(programName || "Program name / logo area")}</p>
          <p class="form-note">${escape(getBaseline()?.BASELINE_DISCLAIMER || "Customize this form for your program.")}</p>
          <p class="muted-copy">Child name: ______________________________</p>
        </header>
        ${sectionHtml || '<p class="muted-copy">No visible sections.</p>'}
      </article>
    `;
  }

  function renderEnrollmentEditorHtml(template = {}, {
    escape = escapeHtml,
    programName = "",
    editingSectionId = "",
    mode = "edit",
  } = {}) {
    const prepared = ensureEnrollmentTemplate(template);
    if (mode === "preview") {
      return renderEnrollmentPreviewHtml(prepared, { escape, programName, mode: "preview" });
    }
    const sections = [...(prepared.sections || [])].sort((a, b) => Number(a.order) - Number(b.order));
    const fields = prepared.fields || [];
    const config = prepared.enrollmentConfig || {};
    const sectionCards = sections.map((section, index) => {
      const sectionFields = fields
        .filter((field) => String(field.sectionId || "") === String(section.id))
        .sort((a, b) => Number(a.order) - Number(b.order));
      const open = String(editingSectionId) === String(section.id);
      const visibleCount = sectionFields.filter((field) => field.visible !== false).length;
      return `
        <article class="enroll-section-card ${section.visible === false ? "is-hidden-section" : ""}" data-enroll-section-card="${escape(section.id)}">
          <header class="enroll-section-card-head">
            <div>
              <strong>${escape(section.title)}</strong>
              <p class="muted-copy">${visibleCount} fields${section.optional ? " · optional section" : ""}${section.visible === false ? " · hidden" : ""}</p>
            </div>
            <div class="hdh-forms-pack-actions">
              <button class="ghost-button" type="button" data-enroll-toggle-section="${escape(section.id)}" data-visible="${section.visible === false ? "1" : "0"}">
                ${section.visible === false ? "Show section" : "Hide section"}
              </button>
              <button class="ghost-button" type="button" data-enroll-move-section-up="${escape(section.id)}" ${index === 0 ? "disabled" : ""}>Move up</button>
              <button class="ghost-button" type="button" data-enroll-move-section-down="${escape(section.id)}" ${index === sections.length - 1 ? "disabled" : ""}>Move down</button>
              <button class="primary-button" type="button" data-enroll-edit-section="${escape(section.id)}">${open ? "Close" : "Edit section"}</button>
            </div>
          </header>
          ${open ? `
            <div class="enroll-section-editor" data-enroll-section-editor="${escape(section.id)}">
              <label>Section title
                <input type="text" maxlength="160" data-enroll-section-title="${escape(section.id)}" value="${escape(section.title)}" />
              </label>
              <div class="enroll-field-list">
                ${sectionFields.map((field) => `
                  <div class="enroll-field-row" data-enroll-field-id="${escape(field.id)}">
                    <div>
                      <strong>${escape(field.label)}</strong>
                      <p class="muted-copy">${escape(field.type)}${field.required ? " · required" : " · optional"}</p>
                    </div>
                    <div class="hdh-forms-pack-actions">
                      <label class="settings-check-label">
                        <input type="checkbox" data-enroll-field-required="${escape(field.id)}" ${field.required ? "checked" : ""} ${field.type === "info" ? "disabled" : ""} />
                        Required
                      </label>
                      <label class="settings-check-label">
                        <input type="checkbox" data-enroll-field-visible="${escape(field.id)}" ${field.visible === false ? "" : "checked"} />
                        Visible
                      </label>
                      <input type="text" maxlength="200" data-enroll-field-label="${escape(field.id)}" value="${escape(field.label)}" aria-label="Field label" />
                    </div>
                  </div>
                `).join("")}
              </div>
              <div class="account-actions-row" style="margin-top:10px;">
                <button class="ghost-button" type="button" data-enroll-add-custom="${escape(section.id)}" data-custom-type="short_text">Add custom question</button>
                <button class="ghost-button" type="button" data-enroll-add-custom="${escape(section.id)}" data-custom-type="long_text">Add multiline question</button>
                <button class="ghost-button" type="button" data-enroll-add-custom="${escape(section.id)}" data-custom-type="yes_no">Add yes/no question</button>
                ${section.id === "permissions" ? `<button class="ghost-button" type="button" data-enroll-add-permission>Add custom permission</button>` : ""}
                ${section.id === "documents" ? `<button class="ghost-button" type="button" data-enroll-add-document>Add custom document</button>` : ""}
                ${section.id === "policies" ? `<button class="ghost-button" type="button" data-enroll-add-policy>Add custom acknowledgment</button>` : ""}
              </div>
            </div>
          ` : ""}
        </article>
      `;
    }).join("");

    return `
      <section class="enroll-form-editor" data-enroll-form-editor="true" data-enroll-mode="edit">
        <header class="enroll-editor-head">
          <p class="eyebrow">ENROLLMENT FORM</p>
          <h3>${escape(prepared.title || "Enrollment Form")}</h3>
          <p class="muted-copy">${escape(programName || "Program name / logo area")}</p>
          <p class="form-note">${escape(getBaseline()?.BASELINE_DISCLAIMER || "Customize this form for your program.")}</p>
          <div class="account-actions-row enroll-editor-actions">
            <button class="ghost-button" type="button" data-enroll-mode="preview">Preview Form</button>
            <button class="ghost-button" type="button" data-enroll-print-blank>Print Blank Form</button>
            <button class="primary-button" type="button" data-enroll-save>Save Changes</button>
          </div>
          <div class="enroll-config-row form-grid-two">
            <label>Minimum emergency contacts
              <input type="number" min="1" max="3" data-enroll-config="minEmergencyContacts" value="${escape(String(config.minEmergencyContacts || 1))}" />
            </label>
            <label>Minimum authorized pickup entries
              <input type="number" min="0" max="3" data-enroll-config="minAuthorizedPickup" value="${escape(String(config.minAuthorizedPickup || 1))}" />
            </label>
            <label class="settings-check-label"><input type="checkbox" data-enroll-config="showInfantToddlerCare" ${config.showInfantToddlerCare !== false ? "checked" : ""} /> Show infant/toddler care fields</label>
            <label class="settings-check-label"><input type="checkbox" data-enroll-config="showOlderChildCare" ${config.showOlderChildCare !== false ? "checked" : ""} /> Show older-child care fields</label>
            <label class="settings-check-label"><input type="checkbox" data-enroll-config="showGenderField" ${config.showGenderField !== false ? "checked" : ""} /> Show gender field</label>
            <label class="settings-check-label"><input type="checkbox" data-enroll-config="showInsuranceField" ${config.showInsuranceField !== false ? "checked" : ""} /> Show health insurance field</label>
          </div>
        </header>
        <div class="enroll-section-list">
          ${sectionCards}
        </div>
      </section>
    `;
  }

  return {
    isEnrollmentTemplate,
    ensureEnrollmentTemplate,
    renderPrintBlankText,
    renderEnrollmentPreviewHtml,
    renderEnrollmentEditorHtml,
    getBaseline,
  };
}));
