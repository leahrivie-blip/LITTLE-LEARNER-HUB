/**
 * Wave 3 — Form Builder + unified Template Library helpers (browser + Node).
 * Presentation / client validation only. Authoritative writes go through
 * /api/program-forms/templates (programData.forms.templates[]).
 */
(function formBuilderLibModule(root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../server/form-fields-lib.js"));
  } else {
    const fallback = {
      FIELD_TYPES: [
        "info", "short_text", "long_text", "number", "date", "time",
        "checkbox", "yes_no", "radio", "dropdown", "initials", "signature", "file",
      ],
      normalizeFormFields: function normalizeFormFields(fields) {
        return Array.isArray(fields) ? fields : [];
      },
      normalizeFormField: function normalizeFormField(field, opts) {
        return { ...(field || {}), order: opts?.order || 0 };
      },
      newFieldId: function newFieldId() {
        return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      },
      validateAiStructuredDraft: function validateAiStructuredDraft(draft) {
        return {
          title: String(draft?.title || "Custom form"),
          category: String(draft?.category || "Other"),
          bodyText: String(draft?.bodyText || draft?.body || ""),
          body: String(draft?.bodyText || draft?.body || ""),
          fields: Array.isArray(draft?.fields) ? draft.fields : [],
          requiresSignature: draft?.requiresSignature !== false,
        };
      },
      extractStructuredDraftFromAiText: function extractStructuredDraftFromAiText(text) {
        const raw = String(text || "");
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const jsonCandidate = fence
          ? fence[1]
          : (raw.match(/\{[\s\S]*"fields"\s*:\s*\[[\s\S]*][\s\S]*\}/) || [])[0];
        if (!jsonCandidate) return { bodyText: raw.trim(), fields: [], meta: {} };
        try {
          const parsed = JSON.parse(jsonCandidate);
          const fields = Array.isArray(parsed.fields) ? parsed.fields : [];
          const bodyText = String(parsed.bodyText || parsed.body || parsed.instructions || "")
            || raw.replace(fence ? fence[0] : jsonCandidate, "").trim();
          return {
            bodyText,
            fields,
            meta: {
              title: parsed.title || "",
              category: parsed.category || "",
              requiresSignature: parsed.requiresSignature !== false,
            },
          };
        } catch (_error) {
          return { bodyText: raw.trim(), fields: [], meta: {} };
        }
      },
      cleanText: function cleanText(value, max) {
        return String(value || "").trim().slice(0, max || 200);
      },
      normalizeFieldType: function normalizeFieldType(raw) {
        const key = String(raw || "").trim().toLowerCase();
        const aliases = {
          informational: "info", text: "short_text", textarea: "long_text",
          yesno: "yes_no", "yes/no": "yes_no", select: "dropdown",
          multiple_choice: "radio", upload: "file",
        };
        if (this.FIELD_TYPES.includes(key)) return key;
        return aliases[key] || key;
      },
    };
    root.LlhFormBuilder = factory(root.LlhFormFieldsLib || fallback);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function factory(fieldsLib) {
  "use strict";

  const FIELD_TYPE_LABELS = Object.freeze({
    info: "Informational text",
    short_text: "Short text",
    long_text: "Long text",
    number: "Number",
    date: "Date",
    time: "Time",
    checkbox: "Checkbox",
    yes_no: "Yes / No",
    radio: "Multiple choice",
    dropdown: "Dropdown",
    initials: "Initials",
    signature: "Signature",
    file: "File upload (placeholder)",
  });

  const LIBRARY_CATEGORIES = Object.freeze([
    { id: "my_templates", label: "My Templates" },
    { id: "child", label: "Child Forms" },
    { id: "family", label: "Family Forms" },
    { id: "staff", label: "Staff Forms" },
    { id: "permissions", label: "Permissions" },
    { id: "health", label: "Health & Safety" },
    { id: "enrollment", label: "Enrollment" },
    { id: "policies", label: "Policies / Acknowledgments" },
    { id: "starter", label: "Starter Pack" },
    { id: "system", label: "System Library" },
  ]);

  function fieldTypeLabel(type) {
    return FIELD_TYPE_LABELS[type] || String(type || "Field");
  }

  function inferLibraryCategory(template = {}) {
    if (template.libraryCategory) return String(template.libraryCategory);
    if (template.sourceType === "starter" || template.packFormId) return "starter";
    if (template.sourceType === "system" || template.sourceType === "cms") return "system";
    if (template.sourceType === "provider" || !template.sourceType) {
      const cat = String(template.category || "").toLowerCase();
      if (/staff/.test(cat)) return "staff";
      if (/enroll/.test(cat)) return "enrollment";
      if (/permission|photo|field trip|sunscreen|diaper/.test(cat)) return "permissions";
      if (/allergy|medical|medication|incident|safe sleep|health/.test(cat)) return "health";
      if (/handbook|policy|ack/.test(cat)) return "policies";
      if (/family|parent/.test(cat)) return "family";
      return "my_templates";
    }
    return "my_templates";
  }

  function createEmptyField(type = "short_text") {
    const t = fieldsLib.normalizeFieldType
      ? (fieldsLib.normalizeFieldType(type) || "short_text")
      : type;
    const needsOptions = t === "radio" || t === "dropdown";
    return fieldsLib.normalizeFormField({
      id: fieldsLib.newFieldId("fld"),
      type: t,
      label: fieldTypeLabel(t),
      helpText: "",
      required: t !== "info" && t !== "file",
      options: needsOptions
        ? [
          { id: "opt_1", label: "Option 1", value: "Option 1" },
          { id: "opt_2", label: "Option 2", value: "Option 2" },
        ]
        : [],
      order: 0,
    }, { order: 0, strict: false });
  }

  function reorderFields(fields, fromIndex, toIndex) {
    const list = Array.isArray(fields) ? fields.slice() : [];
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return list;
    const [item] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, item);
    return list.map((field, index) => ({ ...field, order: index }));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Recipient preview HTML — never saves/assigns. */
  function renderPreviewHtml(template = {}, { escape = escapeHtml } = {}) {
    const title = escape(template.title || "Form preview");
    const body = escape(template.body || template.bodyText || "");
    const fields = Array.isArray(template.fields) ? [...template.fields].sort((a, b) => a.order - b.order) : [];
    const fieldHtml = fields.map((field) => {
      const req = field.required ? '<span class="fb-required" aria-label="required">*</span>' : "";
      const help = field.helpText ? `<p class="muted-copy fb-help">${escape(field.helpText)}</p>` : "";
      const label = `<label class="fb-preview-label"><span>${escape(field.label || "Field")}${req}</span>`;
      if (field.type === "info") {
        return `<div class="fb-preview-field fb-preview-info"><p>${escape(field.label)}</p>${help}</div>`;
      }
      if (field.type === "long_text") {
        return `<div class="fb-preview-field">${label}${help}<textarea rows="3" disabled placeholder="${escape(field.placeholder || "")}"></textarea></label></div>`;
      }
      if (field.type === "checkbox") {
        return `<div class="fb-preview-field"><label><input type="checkbox" disabled /> ${escape(field.label)}${req}</label>${help}</div>`;
      }
      if (field.type === "yes_no") {
        return `<div class="fb-preview-field">${label}${help}
          <div class="fb-preview-choices"><label><input type="radio" disabled name="${escape(field.id)}" /> Yes</label>
          <label><input type="radio" disabled name="${escape(field.id)}" /> No</label></div></label></div>`;
      }
      if (field.type === "radio") {
        return `<div class="fb-preview-field">${label}${help}<div class="fb-preview-choices">${(field.options || []).map((opt) => (
          `<label><input type="radio" disabled name="${escape(field.id)}" /> ${escape(opt.label)}</label>`
        )).join("")}</div></label></div>`;
      }
      if (field.type === "dropdown") {
        return `<div class="fb-preview-field">${label}${help}<select disabled><option>Select…</option>${(field.options || []).map((opt) => (
          `<option>${escape(opt.label)}</option>`
        )).join("")}</select></label></div>`;
      }
      if (field.type === "signature") {
        return `<div class="fb-preview-field fb-preview-signature">${label}${help}
          <div class="fb-signature-placeholder" aria-hidden="true">Signature area</div>
          <p class="muted-copy">Signature capture comes in a later wave — placeholder only.</p></label></div>`;
      }
      if (field.type === "initials") {
        return `<div class="fb-preview-field">${label}${help}<input type="text" disabled maxlength="8" placeholder="Initials" /></label></div>`;
      }
      if (field.type === "file") {
        return `<div class="fb-preview-field">${label}${help}<input type="file" disabled /><p class="muted-copy">File upload comes later — placeholder only.</p></label></div>`;
      }
      const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "time" ? "time" : "text";
      return `<div class="fb-preview-field">${label}${help}<input type="${inputType}" disabled placeholder="${escape(field.placeholder || "")}" /></label></div>`;
    }).join("");

    return `
      <article class="fb-preview" data-form-preview="true">
        <header class="fb-preview-head">
          <p class="eyebrow">Preview</p>
          <h3>${title}</h3>
          <p class="muted-copy">Recipient view — nothing is saved or sent from Preview.</p>
        </header>
        ${body ? `<div class="fb-preview-body"><pre class="fh-form-pre">${body}</pre></div>` : ""}
        <div class="fb-preview-fields">${fieldHtml || '<p class="muted-copy">No structured fields on this form.</p>'}</div>
        ${template.requiresSignature !== false ? `<p class="muted-copy fb-preview-sign-note">Signature required (placeholder).</p>` : ""}
      </article>
    `;
  }

  /**
   * Build unified library rows from provider + starter + system sources.
   * Does not copy into a new store — returns view models with sourceKind.
   */
  function buildUnifiedTemplateLibrary({
    providerTemplates = [],
    starterPack = [],
    systemForms = [],
    query = "",
    category = "all",
    accountType = "home_daycare",
  } = {}) {
    const rows = [];
    (Array.isArray(providerTemplates) ? providerTemplates : []).forEach((tpl) => {
      if (tpl?.archived) return;
      rows.push({
        ...tpl,
        sourceKind: "my_templates",
        libraryCategory: inferLibraryCategory({ ...tpl, sourceType: "provider" }),
        readOnly: false,
        canEdit: true,
        canDuplicate: true,
      });
    });
    (Array.isArray(starterPack) ? starterPack : []).forEach((pack) => {
      rows.push({
        id: pack.id,
        title: pack.title,
        category: pack.category || "Other",
        description: pack.description || "",
        body: "",
        fields: [],
        sourceType: "starter",
        sourceKind: "starter",
        libraryCategory: "starter",
        packFormId: pack.id,
        resourceId: pack.resourceId || "",
        readOnly: true,
        canEdit: false,
        canDuplicate: true,
      });
    });
    (Array.isArray(systemForms) ? systemForms : []).forEach((form) => {
      rows.push({
        id: form.id,
        title: form.title || form.name || "Form",
        category: form.group || form.category || "System",
        description: form.description || "",
        body: "",
        fields: [],
        sourceType: "system",
        sourceKind: "system",
        libraryCategory: "system",
        resourceId: form.id,
        readOnly: true,
        canEdit: false,
        canDuplicate: true,
      });
    });

    const q = String(query || "").trim().toLowerCase();
    const cat = String(category || "all");
    return rows.filter((row) => {
      if (cat === "my_templates" && row.sourceKind !== "my_templates") return false;
      if (cat === "starter" && row.sourceKind !== "starter") return false;
      if (cat === "system" && row.sourceKind !== "system") return false;
      if (cat !== "all" && !["my_templates", "starter", "system"].includes(cat)) {
        if (inferLibraryCategory(row) !== cat && row.libraryCategory !== cat) return false;
      }
      // Home daycare: hide dense system catalog by default unless filtered.
      if (accountType === "home_daycare" && cat === "all" && row.sourceKind === "system") return false;
      if (!q) return true;
      const hay = `${row.title} ${row.category} ${row.description} ${row.libraryCategory}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function applyFieldPatch(fields, fieldId, patch = {}) {
    const list = Array.isArray(fields) ? fields.slice() : [];
    return list.map((field) => {
      if (String(field.id) !== String(fieldId)) return field;
      const next = { ...field, ...patch, id: field.id };
      if (patch.options) next.options = patch.options;
      return fieldsLib.normalizeFormField
        ? fieldsLib.normalizeFormField(next, { order: field.order, strict: false })
        : next;
    });
  }

  return {
    FIELD_TYPE_LABELS,
    LIBRARY_CATEGORIES,
    fieldTypeLabel,
    inferLibraryCategory,
    createEmptyField,
    reorderFields,
    renderPreviewHtml,
    buildUnifiedTemplateLibrary,
    applyFieldPatch,
    fieldsLib,
    normalizeFormFields: (...args) => fieldsLib.normalizeFormFields(...args),
    validateAiStructuredDraft: (...args) => fieldsLib.validateAiStructuredDraft(...args),
    extractStructuredDraftFromAiText: (...args) => fieldsLib.extractStructuredDraftFromAiText(...args),
  };
}));
