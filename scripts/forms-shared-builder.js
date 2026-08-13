/**
 * Shared Forms Center helpers (testing-site): branding HTML, blank print, Question Bank UI.
 * Does not create a second Form Builder — extends the existing Wave 3 builder.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../server/forms-branding-lib.js"),
      require("../server/forms-question-bank.js"),
      require("../server/forms-repeat-groups.js"),
      require("../server/forms-starter-lib.js"),
      require("../server/form-fields-lib.js")
    );
  } else {
    root.LlhFormsSharedBuilder = factory(
      root.FormsBrandingLib || null,
      root.FormsQuestionBank || null,
      root.FormsRepeatGroups || null,
      root.FormsStarterLib || null,
      root.LlhFormFieldsLib || null
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  brandingLib,
  questionBank,
  repeatGroups,
  starterLib,
  fieldsLib
) {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolveBranding(programSettings, formOverride) {
    if (!brandingLib || typeof brandingLib.resolveFormsBranding !== "function") {
      const settings = programSettings && typeof programSettings === "object" ? programSettings : {};
      return {
        programName: String(settings.programName || settings.businessName || "").trim(),
        address: String(settings.address || "").trim(),
        phone: String(settings.contactPhone || settings.phone || "").trim(),
        email: String(settings.contactEmail || settings.email || "").trim(),
        website: String(settings.website || "").trim(),
        logoDataUrl: String(settings.logoDataUrl || "").trim(),
        showLogo: Boolean(settings.logoDataUrl),
        showProgramName: true,
        showContact: true,
        headerAlign: "left",
        showLlhFooter: true,
        llhFooterText: "Created with Little Learner Hub"
      };
    }
    return brandingLib.resolveFormsBranding({
      programSettings: programSettings || {},
      formOverride: formOverride || null
    });
  }

  function snapshotBranding(resolved) {
    if (brandingLib && typeof brandingLib.snapshotFormsBranding === "function") {
      return brandingLib.snapshotFormsBranding(resolved);
    }
    return resolved || {};
  }

  function renderBrandingHeaderHtml(branding, opts) {
    const b = branding && typeof branding === "object" ? branding : {};
    const options = opts && typeof opts === "object" ? opts : {};
    const escape = typeof options.escape === "function" ? options.escape : escapeHtml;
    const formTitle = String(options.formTitle || "").trim();
    const align = b.headerAlign === "center" ? "center" : "left";
    const contact = brandingLib && brandingLib.brandingContactLine
      ? brandingLib.brandingContactLine(b)
      : [b.address, b.phone, b.email, b.website].filter(Boolean).join(" · ");
    const logo = b.showLogo && b.logoDataUrl
      ? `<img class="forms-brand-logo" src="${escape(b.logoDataUrl)}" alt="" width="120" height="120" />`
      : "";
    const name = b.showProgramName && b.programName
      ? `<p class="forms-brand-program-name">${escape(b.programName)}</p>`
      : "";
    const title = formTitle ? `<h3 class="forms-brand-form-title">${escape(formTitle)}</h3>` : "";
    const contactHtml = b.showContact !== false && contact
      ? `<p class="forms-brand-contact muted-copy">${escape(contact)}</p>`
      : "";
    if (!logo && !name && !title && !contactHtml) return "";
    return `
      <header class="forms-brand-header" data-forms-branding="true" style="text-align:${align}">
        ${logo}
        ${name}
        ${title}
        ${contactHtml}
      </header>`;
  }

  function renderLlhFooterHtml(branding, opts) {
    const b = branding && typeof branding === "object" ? branding : {};
    if (b.showLlhFooter === false) return "";
    const escape = opts && typeof opts.escape === "function" ? opts.escape : escapeHtml;
    const text = b.llhFooterText || "Created with Little Learner Hub";
    return `<footer class="forms-llh-footer" data-forms-llh-footer="true"><p class="muted-copy">${escape(text)}</p></footer>`;
  }

  function blankLineForField(field) {
    if (!field) return "";
    const label = String(field.label || "Question");
    const type = String(field.type || "short_text");
    if (type === "info") return label;
    if (type === "long_text") {
      const n = Math.min(12, Math.max(3, Number(field.printLines) || 3));
      return `${label}\n${Array.from({ length: n }, () => "________________________________________________________________________").join("\n")}`;
    }
    if (type === "checkbox") return `☐ ${label}`;
    if (type === "yes_no") return `${label}\n☐ Yes          ☐ No`;
    if (type === "signature") {
      return `Signature: ______________________\nDate: ___________________________`;
    }
    if (type === "initials") return `${label}: ______`;
    if (type === "time") return `${label}: ______ : ______   ☐ AM   ☐ PM`;
    if (type === "date") return `${label}: ____ / ____ / ________`;
    if (type === "number") return `${label}: ____________________`;
    if (type === "file") return `${label}\n[Attach document / photo]`;
    if (type === "dropdown" || type === "radio") {
      const opts = Array.isArray(field.options) ? field.options : [];
      const lines = opts.length
        ? opts.map((opt) => `☐ ${opt.label || opt.value || opt}`).join("\n")
        : "☐ ____________________";
      return `${label}\n${lines}`;
    }
    return `${label}: ________________________________________________`;
  }

  function renderPrintBlankText(template, branding) {
    const tpl = template && typeof template === "object" ? template : {};
    const b = branding && typeof branding === "object" ? branding : {};
    const lines = [];
    const header = brandingLib && brandingLib.renderBrandingPlainHeader
      ? brandingLib.renderBrandingPlainHeader(b, { formTitle: tpl.title || "Form" })
      : [b.programName, tpl.title, [b.address, b.phone, b.email].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
    if (header) {
      lines.push(header);
      lines.push("============================================================");
    } else {
      lines.push(String(tpl.title || "Form").toUpperCase());
      lines.push("============================================================");
    }
    const instructions = String(tpl.description || tpl.body || tpl.bodyText || "").trim();
    if (instructions) {
      lines.push(instructions);
      lines.push("");
    }
    const fields = Array.isArray(tpl.fields)
      ? [...tpl.fields].filter((f) => f && f.visible !== false).sort((a, c) => Number(a.order) - Number(c.order))
      : [];
    const sections = Array.isArray(tpl.sections) ? [...tpl.sections].filter((s) => s && s.visible !== false) : [];
    if (sections.length) {
      sections.forEach((section) => {
        const sectionFields = fields.filter((f) => String(f.sectionId || "") === String(section.id));
        if (!sectionFields.length && !section.title) return;
        lines.push("");
        lines.push(String(section.title || "Section").toUpperCase());
        lines.push("------------------------------------------------------------");
        sectionFields.forEach((field) => {
          lines.push(blankLineForField(field));
          lines.push("");
        });
      });
      const orphan = fields.filter((f) => !sections.some((s) => String(s.id) === String(f.sectionId || "")));
      orphan.forEach((field) => {
        lines.push(blankLineForField(field));
        lines.push("");
      });
    } else {
      fields.forEach((field) => {
        lines.push(blankLineForField(field));
        lines.push("");
      });
    }
    if (b.showLlhFooter !== false) {
      lines.push("");
      lines.push(b.llhFooterText || "Created with Little Learner Hub");
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function createBlankFormSeed(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const title = String(options.title || "Untitled form").trim() || "Untitled form";
    const description = String(options.description || "").trim();
    const sectionId = "section_1";
    return {
      title: title,
      description: description,
      category: String(options.category || "Other"),
      body: description || "Add your questions below.",
      bodyText: description || "Add your questions below.",
      fields: [],
      sections: [
        {
          id: sectionId,
          title: "Section 1",
          description: "",
          visible: true,
          order: 0,
          fieldIds: []
        }
      ],
      requiresSignature: true,
      sourceType: "provider",
      branding: { inherit: true, hideAll: false },
      intendedAudience: String(options.intendedAudience || "family"),
      formKind: "custom"
    };
  }

  function renderQuestionBankPickerHtml(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const escape = typeof options.escape === "function" ? options.escape : escapeHtml;
    const query = String(options.query || "");
    const category = String(options.category || "");
    const items = questionBank && typeof questionBank.searchQuestionBank === "function"
      ? questionBank.searchQuestionBank(query, category)
      : [];
    const cats = (questionBank && questionBank.CATEGORIES) || [];
    return `
      <div class="forms-qbank-panel" data-forms-qbank="true">
        <p class="eyebrow">Question Bank</p>
        <h4>Choose From Question Bank</h4>
        <p class="muted-copy">Selecting a question copies it into this form. Later bank changes will not update this form.</p>
        <div class="form-grid-two">
          <label>Search
            <input type="search" data-fb-qbank-query value="${escape(query)}" placeholder="Search questions…" autocomplete="off" />
          </label>
          <label>Category
            <select data-fb-qbank-category>
              <option value="">All categories</option>
              ${cats.map((cat) => `<option value="${escape(cat)}" ${cat === category ? "selected" : ""}>${escape(cat)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="forms-qbank-list">
          ${items.length
            ? items.slice(0, 40).map((item) => `
              <article class="forms-qbank-item">
                <div>
                  <strong>${escape(item.title)}</strong>
                  <p class="muted-copy">${escape(item.category)}</p>
                </div>
                <button class="primary-button" type="button" data-fb-qbank-add="${escape(item.id)}">Add</button>
              </article>`).join("")
            : `<p class="muted-copy">No matching questions.</p>`}
        </div>
        <button class="ghost-button" type="button" data-fb-qbank-close>Back</button>
      </div>`;
  }

  function renderBrandingControlsHtml(override, opts) {
    const o = brandingLib && brandingLib.normalizeFormBrandingOverride
      ? brandingLib.normalizeFormBrandingOverride(override || {})
      : Object.assign({ inherit: true, hideAll: false, showLogo: true, showProgramName: true, showContact: true, headerAlign: "left", showLlhFooter: true }, override || {});
    const escape = opts && typeof opts.escape === "function" ? opts.escape : escapeHtml;
    return `
      <div class="forms-branding-controls" data-forms-branding-controls="true">
        <p class="eyebrow">Form header</p>
        <p class="muted-copy">Uses your Program Settings name, logo, and contact info. Changing these later does not rewrite already-assigned or signed forms.</p>
        <label class="settings-check-label"><input type="checkbox" data-fb-branding="hideAll" ${o.hideAll ? "checked" : ""} /> Hide branding on this form</label>
        <label class="settings-check-label"><input type="checkbox" data-fb-branding="showLogo" ${o.showLogo && !o.hideAll ? "checked" : ""} ${o.hideAll ? "disabled" : ""} /> Show logo</label>
        <label class="settings-check-label"><input type="checkbox" data-fb-branding="showProgramName" ${o.showProgramName && !o.hideAll ? "checked" : ""} ${o.hideAll ? "disabled" : ""} /> Show program name</label>
        <label class="settings-check-label"><input type="checkbox" data-fb-branding="showContact" ${o.showContact && !o.hideAll ? "checked" : ""} ${o.hideAll ? "disabled" : ""} /> Show contact information</label>
        <label>Header alignment
          <select data-fb-branding="headerAlign" ${o.hideAll ? "disabled" : ""}>
            <option value="left" ${o.headerAlign === "left" ? "selected" : ""}>Left</option>
            <option value="center" ${o.headerAlign === "center" ? "selected" : ""}>Center</option>
          </select>
        </label>
      </div>`;
  }

  function copyQuestionBankItem(bankItemId, existingIds) {
    if (!questionBank || typeof questionBank.copyQuestionBankItem !== "function") {
      return { ok: false, error: "Question Bank is unavailable." };
    }
    return questionBank.copyQuestionBankItem(bankItemId, { existingIds: existingIds || [] });
  }

  function expandRepeatGroup(presetId, count, existingIds) {
    if (!repeatGroups || typeof repeatGroups.expandFixedRepeatGroup !== "function") {
      return { ok: false, error: "Repeat groups are unavailable." };
    }
    return repeatGroups.expandFixedRepeatGroup(presetId, count, { existingIds: existingIds || [] });
  }

  function createStarterCopy(key) {
    if (!starterLib || typeof starterLib.createEditableStarterCopy !== "function") {
      return { ok: false, error: "Starter library is unavailable." };
    }
    return starterLib.createEditableStarterCopy(key);
  }

  function listBuiltStarters() {
    if (!starterLib || typeof starterLib.listStarterCatalog !== "function") return [];
    return starterLib.listStarterCatalog().filter((s) => s.built && s.key !== "enrollment");
  }

  function listFutureStarters() {
    if (!starterLib || typeof starterLib.listStartersReadyForContentOnly !== "function") return [];
    return starterLib.listStartersReadyForContentOnly();
  }

  function normalizeFieldList(fields) {
    if (fieldsLib && typeof fieldsLib.normalizeFormFields === "function") {
      return fieldsLib.normalizeFormFields(fields || [], { strict: false });
    }
    return Array.isArray(fields) ? fields : [];
  }

  return {
    escapeHtml: escapeHtml,
    resolveBranding: resolveBranding,
    snapshotBranding: snapshotBranding,
    renderBrandingHeaderHtml: renderBrandingHeaderHtml,
    renderLlhFooterHtml: renderLlhFooterHtml,
    renderPrintBlankText: renderPrintBlankText,
    blankLineForField: blankLineForField,
    createBlankFormSeed: createBlankFormSeed,
    renderQuestionBankPickerHtml: renderQuestionBankPickerHtml,
    renderBrandingControlsHtml: renderBrandingControlsHtml,
    copyQuestionBankItem: copyQuestionBankItem,
    expandRepeatGroup: expandRepeatGroup,
    createStarterCopy: createStarterCopy,
    listBuiltStarters: listBuiltStarters,
    listFutureStarters: listFutureStarters,
    normalizeFieldList: normalizeFieldList,
    listRepeatGroupPresets: repeatGroups && repeatGroups.listRepeatGroupPresets
      ? repeatGroups.listRepeatGroupPresets.bind(repeatGroups)
      : function () { return []; },
    DYNAMIC_REPEATERS_SUPPORTED: false
  };
});
