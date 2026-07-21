/**
 * Forms Center Phase 4 admin-preview UI.
 * Manual custom form builder only. Preview responses are not collected.
 */
(function initFormsCenterPreviewUI(global) {
  const API = "/api/forms-center";
  const state = {
    tab: "home",
    home: null,
    forms: [],
    archived: [],
    fieldTypes: [],
    categories: [],
    builder: null,
    versions: [],
    audit: [],
    preview: null,
    previewMode: "desktop",
    filter: { q: "", status: "active", category: "" },
    loading: false,
    saving: false,
    autosaveTimer: null,
    lastSavedAt: "",
    saveStatus: "Saved",
    error: "",
    message: "",
    undoStack: [],
  };

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

  function selectedCategoryLabel(id) {
    return (state.categories.find((item) => item.id === id) || {}).label || labelize(id);
  }

  async function authHeaders() {
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    if (!token || typeof hasAdminFullAccess !== "function" || !hasAdminFullAccess()) {
      throw new Error("Verified admin unlock is required.");
    }
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async function api(method, path, body) {
    const headers = await authHeaders();
    const response = await fetch(path, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  function sectionEl() {
    return document.querySelector("#view-forms-center");
  }

  function setMessage(message, isError = false) {
    state.message = isError ? "" : message;
    state.error = isError ? message : "";
    render();
  }

  function currentBuilderForm() {
    return state.builder?.form || null;
  }

  function currentSnapshot() {
    return state.builder?.snapshot || { sections: [], fields: [] };
  }

  function setSnapshot(snapshot) {
    if (!state.builder) return;
    state.builder.snapshot = {
      source: "draft",
      sections: Array.isArray(snapshot.sections) ? snapshot.sections : [],
      fields: Array.isArray(snapshot.fields) ? snapshot.fields : [],
    };
  }

  function pushUndo() {
    const form = currentBuilderForm();
    if (!form) return;
    state.undoStack.push(JSON.stringify({
      form: {
        title: form.title,
        description: form.description,
        category: form.category,
      },
      snapshot: currentSnapshot(),
    }));
    state.undoStack = state.undoStack.slice(-15);
  }

  function restoreUndo() {
    if (!state.undoStack.length || !state.builder) return;
    const raw = state.undoStack.pop();
    try {
      const restored = JSON.parse(raw);
      Object.assign(state.builder.form, restored.form || {});
      setSnapshot(restored.snapshot || {});
      state.saveStatus = "Unsaved changes";
      scheduleAutosave();
      render();
    } catch {
      /* ignore */
    }
  }

  async function loadCatalog() {
    const catalog = await api("GET", `${API}/field-types`);
    state.fieldTypes = catalog.fieldTypes || [];
    state.categories = catalog.categories || [];
  }

  async function refreshHome() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const [home, forms, archived, audit] = await Promise.all([
        api("GET", `${API}/home`),
        api("GET", `${API}/forms?status=active`),
        api("GET", `${API}/forms?status=archived`),
        api("GET", `${API}/audit`),
      ]);
      state.home = home;
      state.forms = forms.forms || [];
      state.archived = archived.forms || [];
      state.audit = audit.audit || [];
    } catch (error) {
      state.error = error.message || "Could not load Forms Center.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function refreshForms() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const params = new URLSearchParams({
        q: state.filter.q || "",
        status: state.filter.status || "active",
        category: state.filter.category || "",
      });
      const data = await api("GET", `${API}/forms?${params}`);
      if (state.filter.status === "archived") state.archived = data.forms || [];
      else state.forms = data.forms || [];
    } catch (error) {
      state.error = error.message || "Could not load forms.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function openBuilder(formId) {
    state.loading = true;
    state.error = "";
    state.tab = "builder";
    render();
    try {
      const data = await api("GET", `${API}/forms/${encodeURIComponent(formId)}`);
      state.builder = {
        form: data.form,
        snapshot: data.snapshot || { sections: [], fields: [] },
      };
      state.versions = data.versions || [];
      state.preview = null;
      state.undoStack = [];
      state.saveStatus = "Saved";
      state.lastSavedAt = data.form?.updatedAt || "";
    } catch (error) {
      state.error = error.message || "Could not open this form.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function createBlankForm() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const data = await api("POST", `${API}/forms`, {
        title: "Untitled Form",
        category: "custom",
      });
      state.builder = {
        form: data.form,
        snapshot: data.snapshot || { sections: [], fields: [] },
      };
      state.versions = [];
      state.tab = "builder";
      state.saveStatus = "Saved";
      state.lastSavedAt = data.form?.updatedAt || "";
    } catch (error) {
      state.error = error.message || "Could not create a form.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function seedPreview() {
    state.loading = true;
    state.error = "";
    render();
    try {
      await api("POST", `${API}/seed`, {});
      state.message = "Preview forms seeded.";
      await refreshHome();
    } catch (error) {
      state.error = error.message || "Could not seed preview forms.";
      state.loading = false;
      render();
    }
  }

  function normalizedBuilderPayload(autosave = false) {
    const form = currentBuilderForm() || {};
    const snapshot = currentSnapshot();
    return {
      title: form.title || "",
      description: form.description || "",
      category: form.category || "custom",
      sections: snapshot.sections || [],
      fields: (snapshot.fields || []).map((field, index) => ({ ...field, order: index })),
      autosave,
    };
  }

  async function saveDraft({ autosave = false } = {}) {
    const form = currentBuilderForm();
    if (!form || state.saving) return;
    state.saving = true;
    state.saveStatus = autosave ? "Saving..." : "Saving draft...";
    render();
    try {
      const data = await api("POST", `${API}/forms/${encodeURIComponent(form.id)}/save-draft`, normalizedBuilderPayload(autosave));
      state.builder = {
        form: data.form,
        snapshot: data.snapshot,
      };
      state.lastSavedAt = data.savedAt || data.form?.updatedAt || new Date().toISOString();
      state.saveStatus = "Saved";
      state.message = autosave ? "" : "Draft saved.";
    } catch (error) {
      state.saveStatus = "Save failed";
      state.error = error.message || "Could not save draft.";
    } finally {
      state.saving = false;
      render();
    }
  }

  function scheduleAutosave() {
    window.clearTimeout(state.autosaveTimer);
    state.saveStatus = "Unsaved changes";
    state.autosaveTimer = window.setTimeout(() => {
      saveDraft({ autosave: true }).catch(() => {});
    }, 900);
  }

  async function publishForm() {
    const form = currentBuilderForm();
    if (!form) return;
    await saveDraft({ autosave: false });
    state.loading = true;
    render();
    try {
      const data = await api("POST", `${API}/forms/${encodeURIComponent(form.id)}/publish`, {});
      state.builder.form = data.form;
      state.versions = [data.version, ...state.versions.filter((version) => version.id !== data.version.id)]
        .sort((a, b) => (a.versionNumber || 0) - (b.versionNumber || 0));
      state.message = `Published version ${data.version.versionNumber}.`;
      await openPreview(data.form.id, { stayOnBuilder: true });
    } catch (error) {
      state.error = error.message || "Could not publish form.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function startPublishedEdit() {
    const form = currentBuilderForm();
    if (!form) return;
    state.loading = true;
    render();
    try {
      const data = await api("POST", `${API}/forms/${encodeURIComponent(form.id)}/edit-published`, {});
      state.builder = { form: data.form, snapshot: data.snapshot };
      state.message = "Draft version started from the published form.";
    } catch (error) {
      state.error = error.message || "Could not start a draft version.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function duplicateForm(formId) {
    state.loading = true;
    render();
    try {
      const data = await api("POST", `${API}/forms/${encodeURIComponent(formId)}/duplicate`, {});
      state.message = "Form duplicated with new IDs.";
      await openBuilder(data.form.id);
    } catch (error) {
      state.error = error.message || "Could not duplicate form.";
      state.loading = false;
      render();
    }
  }

  async function archiveForm(formId) {
    state.loading = true;
    render();
    try {
      await api("POST", `${API}/forms/${encodeURIComponent(formId)}/archive`, {});
      state.message = "Form archived.";
      await refreshForms();
    } catch (error) {
      state.error = error.message || "Could not archive form.";
      state.loading = false;
      render();
    }
  }

  async function restoreForm(formId) {
    state.loading = true;
    render();
    try {
      await api("POST", `${API}/forms/${encodeURIComponent(formId)}/restore`, {});
      state.message = "Form restored.";
      state.filter.status = "active";
      await refreshHome();
    } catch (error) {
      state.error = error.message || "Could not restore form.";
      state.loading = false;
      render();
    }
  }

  async function openPreview(formId, options = {}) {
    state.loading = true;
    state.error = "";
    if (!options.stayOnBuilder) state.tab = "preview";
    render();
    try {
      const data = await api("GET", `${API}/forms/${encodeURIComponent(formId)}/preview`);
      state.preview = data;
      if (!options.stayOnBuilder) state.tab = "preview";
    } catch (error) {
      state.error = error.message || "Could not load preview.";
    } finally {
      state.loading = false;
      render();
    }
  }

  function updateFormMeta(name, value) {
    const form = currentBuilderForm();
    if (!form) return;
    pushUndo();
    form[name] = value;
    scheduleAutosave();
    render();
  }

  function updateSection(id, patch) {
    const snapshot = currentSnapshot();
    pushUndo();
    setSnapshot({
      ...snapshot,
      sections: (snapshot.sections || []).map((section) => section.id === id ? { ...section, ...patch } : section),
    });
    scheduleAutosave();
    render();
  }

  function updateField(id, patch) {
    const snapshot = currentSnapshot();
    pushUndo();
    setSnapshot({
      ...snapshot,
      fields: (snapshot.fields || []).map((field) => field.id === id ? { ...field, ...patch } : field),
    });
    scheduleAutosave();
    render();
  }

  function addSection() {
    const snapshot = currentSnapshot();
    pushUndo();
    const section = {
      id: `fcsec_local_${Date.now()}`,
      title: `Section ${(snapshot.sections || []).length + 1}`,
      description: "",
      order: (snapshot.sections || []).length,
    };
    setSnapshot({
      ...snapshot,
      sections: [...(snapshot.sections || []), section],
    });
    scheduleAutosave();
    render();
  }

  function addField(type) {
    const snapshot = currentSnapshot();
    const sections = snapshot.sections && snapshot.sections.length ? snapshot.sections : [{ id: `fcsec_local_${Date.now()}`, title: "General", description: "", order: 0 }];
    const meta = state.fieldTypes.find((entry) => entry.type === type) || { type: "short_text", label: "Short answer" };
    pushUndo();
    const field = {
      id: `fcfield_local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: meta.type,
      group: meta.group || "",
      label: meta.label || "New field",
      helpText: "",
      placeholder: "",
      required: false,
      sectionId: sections[0].id,
      order: (snapshot.fields || []).length,
      options: ["single_select", "multi_select", "checkboxes"].includes(meta.type)
        ? [{ label: "Option 1" }, { label: "Option 2" }]
        : (meta.type === "yes_no" ? [{ label: "Yes" }, { label: "No" }] : []),
    };
    setSnapshot({
      sections,
      fields: [...(snapshot.fields || []), field],
    });
    scheduleAutosave();
    render();
  }

  function duplicateField(id) {
    const snapshot = currentSnapshot();
    const source = (snapshot.fields || []).find((field) => field.id === id);
    if (!source) return;
    pushUndo();
    const copy = {
      ...source,
      id: `fcfield_local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label: `${source.label || "Field"} Copy`,
      order: (snapshot.fields || []).length,
    };
    setSnapshot({ ...snapshot, fields: [...snapshot.fields, copy] });
    scheduleAutosave();
    render();
  }

  function deleteField(id) {
    const snapshot = currentSnapshot();
    pushUndo();
    setSnapshot({ ...snapshot, fields: (snapshot.fields || []).filter((field) => field.id !== id) });
    scheduleAutosave();
    render();
  }

  function moveField(id, direction) {
    const snapshot = currentSnapshot();
    const fields = [...(snapshot.fields || [])];
    const index = fields.findIndex((field) => field.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= fields.length) return;
    pushUndo();
    const [field] = fields.splice(index, 1);
    fields.splice(target, 0, field);
    setSnapshot({ ...snapshot, fields: fields.map((item, order) => ({ ...item, order })) });
    scheduleAutosave();
    render();
  }

  function navHtml() {
    const tabs = [
      ["home", "Home"],
      ["forms", "My Forms"],
      ["templates", "Templates"],
      ["archived", "Archived"],
      ["builder", "Create / Edit Builder"],
      ["preview", "Preview"],
    ];
    return `
      <nav class="fc-tabs" aria-label="Forms Center sections">
        ${tabs.map(([id, label]) => `
          <button type="button" class="fc-tab${state.tab === id ? " active" : ""}" data-fc-tab="${id}">${escapeHtml(label)}</button>
        `).join("")}
      </nav>
    `;
  }

  function previewBannerHtml() {
    return `
      <div class="fc-preview-banner">
        <strong>Admin Preview &mdash; Test Data Only</strong>
        <span>No email, Stripe, AI, production child records, or response collection. Signature fields are testing-only placeholders.</span>
        <button type="button" class="ghost-button" data-fc-seed>Seed fixtures</button>
      </div>
    `;
  }

  function metric(label, value, detail = "") {
    return `
      <article class="fc-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </article>
    `;
  }

  function homeHtml() {
    const counts = state.home?.counts || {};
    return `
      <section class="fc-panel">
        <div class="fc-hero">
          <div>
            <p class="eyebrow">Forms Center Phase 4</p>
            <h2>Manual Custom Form Builder</h2>
            <p>Create daycare forms, organize sections and fields, publish immutable versions, and preview only. Responses are not being collected.</p>
          </div>
          <div class="fc-hero-actions">
            <button type="button" class="primary-button" data-fc-create>Create Blank Form</button>
            <button type="button" class="ghost-button" data-fc-seed>Seed Preview Fixtures</button>
          </div>
        </div>
        <div class="fc-metrics">
          ${metric("Total forms", counts.total || 0)}
          ${metric("Published", counts.published || 0)}
          ${metric("Drafts", counts.draft || 0)}
          ${metric("Archived", counts.archived || 0)}
          ${metric("Responses", "0", "Not collected")}
        </div>
      </section>
      <section class="fc-grid-two">
        <div class="fc-panel">
          <h3>Recent forms</h3>
          ${formListHtml(state.home?.recentForms || [], { compact: true })}
        </div>
        <div class="fc-panel">
          <h3>Audit trail</h3>
          <div class="fc-audit-list">
            ${(state.audit || state.home?.audit || []).slice(0, 8).map((row) => `
              <article class="fc-audit-row">
                <strong>${escapeHtml(labelize(row.action))}</strong>
                <span>${escapeHtml(row.message || "")}</span>
                <small>${escapeHtml(row.createdAt || "")}</small>
              </article>
            `).join("") || `<p class="muted-copy">No audit entries yet.</p>`}
          </div>
        </div>
      </section>
    `;
  }

  function filtersHtml(status) {
    return `
      <div class="fc-toolbar">
        <label>
          Search
          <input type="search" value="${escapeHtml(state.filter.q)}" data-fc-filter="q" placeholder="Search forms" />
        </label>
        <label>
          Category
          <select data-fc-filter="category">
            <option value="">All categories</option>
            ${state.categories.map((category) => `
              <option value="${escapeHtml(category.id)}"${state.filter.category === category.id ? " selected" : ""}>${escapeHtml(category.label)}</option>
            `).join("")}
          </select>
        </label>
        <button type="button" class="primary-button" data-fc-apply-filter data-status="${escapeHtml(status)}">Apply</button>
        <button type="button" class="ghost-button" data-fc-create>Create Blank Form</button>
      </div>
    `;
  }

  function statusBadge(status) {
    return `<span class="fc-badge fc-badge-${escapeHtml(status || "draft")}">${escapeHtml(labelize(status || "draft"))}</span>`;
  }

  function formListHtml(forms, options = {}) {
    if (!forms.length) return `<p class="muted-copy">No forms to show.</p>`;
    return `
      <div class="fc-form-list${options.compact ? " compact" : ""}">
        ${forms.map((form) => `
          <article class="fc-form-card">
            <div>
              <div class="fc-card-title-row">
                <h3>${escapeHtml(form.title || "Untitled Form")}</h3>
                ${statusBadge(form.status)}
              </div>
              <p>${escapeHtml(form.description || selectedCategoryLabel(form.category))}</p>
              <div class="fc-card-meta">
                <span>${escapeHtml(selectedCategoryLabel(form.category))}</span>
                <span>${escapeHtml(form.fieldCount || 0)} fields</span>
                <span>${escapeHtml(form.versionCount || 0)} versions</span>
                ${form.sourceFormId ? `<span>Duplicated from ${escapeHtml(form.sourceFormId)}</span>` : ""}
              </div>
            </div>
            <div class="fc-card-actions">
              <button type="button" class="primary-button" data-fc-open="${escapeHtml(form.id)}">Open</button>
              <button type="button" class="ghost-button" data-fc-preview="${escapeHtml(form.id)}">Preview</button>
              <button type="button" class="ghost-button" data-fc-duplicate="${escapeHtml(form.id)}">Duplicate</button>
              ${form.status === "archived"
                ? `<button type="button" class="ghost-button" data-fc-restore="${escapeHtml(form.id)}">Restore</button>`
                : `<button type="button" class="ghost-button" data-fc-archive="${escapeHtml(form.id)}">Archive</button>`}
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  function formsHtml() {
    return `
      <section class="fc-panel">
        <h2>My Forms</h2>
        ${filtersHtml("active")}
        ${formListHtml(state.forms.filter((form) => form.status !== "archived"))}
      </section>
    `;
  }

  function templatesHtml() {
    const templates = state.forms.filter((form) => form.status === "published" || form.sourceFormId);
    return `
      <section class="fc-panel">
        <h2>Templates</h2>
        <p class="muted-copy">Use published preview forms as starting points. Duplicating creates a new form and new permanent field IDs.</p>
        ${formListHtml(templates)}
      </section>
    `;
  }

  function archivedHtml() {
    return `
      <section class="fc-panel">
        <h2>Archived</h2>
        ${filtersHtml("archived")}
        ${formListHtml(state.archived)}
      </section>
    `;
  }

  function fieldTypeChooserHtml() {
    const groups = {};
    state.fieldTypes.forEach((fieldType) => {
      const group = fieldType.group || "other";
      groups[group] = groups[group] || [];
      groups[group].push(fieldType);
    });
    return `
      <div class="fc-field-chooser">
        <label>
          Add field type
          <select data-fc-field-type>
            ${Object.entries(groups).map(([group, items]) => `
              <optgroup label="${escapeHtml(labelize(group))}">
                ${items.map((item) => `<option value="${escapeHtml(item.type)}">${escapeHtml(item.label)}</option>`).join("")}
              </optgroup>
            `).join("")}
          </select>
        </label>
        <button type="button" class="primary-button" data-fc-add-field>Add Field</button>
        <button type="button" class="ghost-button" data-fc-add-section>Add Section</button>
      </div>
    `;
  }

  function sectionOptions(selectedId) {
    return (currentSnapshot().sections || []).map((section) => `
      <option value="${escapeHtml(section.id)}"${selectedId === section.id ? " selected" : ""}>${escapeHtml(section.title || "Section")}</option>
    `).join("");
  }

  function fieldEditorHtml(field, index) {
    const optionText = (field.options || []).map((option) => option.label || option).join("\n");
    const showOptions = ["single_select", "multi_select", "checkboxes"].includes(field.type);
    const signatureNote = ["signature_parent", "signature_provider", "initials"].includes(field.type)
      ? `<p class="fc-field-note">Testing-only signature placeholder. This preview does not collect signatures.</p>`
      : "";
    return `
      <article class="fc-field-row" data-fc-field-id="${escapeHtml(field.id)}">
        <div class="fc-field-row-head">
          <strong>${escapeHtml(index + 1)}. ${escapeHtml(labelize(field.type))}</strong>
          <div class="fc-inline-actions">
            <button type="button" class="ghost-button" data-fc-move-field="up" data-id="${escapeHtml(field.id)}">Up</button>
            <button type="button" class="ghost-button" data-fc-move-field="down" data-id="${escapeHtml(field.id)}">Down</button>
            <button type="button" class="ghost-button" data-fc-duplicate-field="${escapeHtml(field.id)}">Duplicate</button>
            <button type="button" class="ghost-button danger" data-fc-delete-field="${escapeHtml(field.id)}">Delete</button>
          </div>
        </div>
        <div class="fc-builder-grid">
          <label>
            Label
            <input type="text" value="${escapeHtml(field.label || "")}" data-fc-field-input="${escapeHtml(field.id)}" data-prop="label" />
          </label>
          <label>
            Section
            <select data-fc-field-input="${escapeHtml(field.id)}" data-prop="sectionId">
              ${sectionOptions(field.sectionId)}
            </select>
          </label>
          <label>
            Placeholder
            <input type="text" value="${escapeHtml(field.placeholder || "")}" data-fc-field-input="${escapeHtml(field.id)}" data-prop="placeholder" />
          </label>
          <label class="fc-check-label">
            <input type="checkbox" ${field.required ? "checked" : ""} data-fc-field-input="${escapeHtml(field.id)}" data-prop="required" />
            Required
          </label>
        </div>
        <label>
          Help text
          <textarea data-fc-field-input="${escapeHtml(field.id)}" data-prop="helpText">${escapeHtml(field.helpText || "")}</textarea>
        </label>
        ${showOptions ? `
          <label>
            Options (one per line)
            <textarea data-fc-field-input="${escapeHtml(field.id)}" data-prop="optionsText">${escapeHtml(optionText)}</textarea>
          </label>
        ` : ""}
        ${signatureNote}
      </article>
    `;
  }

  function builderHtml() {
    const form = currentBuilderForm();
    if (!form) {
      return `
        <section class="fc-panel fc-empty-builder">
          <h2>Create / Edit Builder</h2>
          <p>Start a blank custom form or open a seeded preview form.</p>
          <button type="button" class="primary-button" data-fc-create>Create Blank Form</button>
        </section>
      `;
    }
    const snapshot = currentSnapshot();
    const fields = snapshot.fields || [];
    return `
      <section class="fc-panel fc-builder">
        <div class="fc-builder-header">
          <div>
            <p class="eyebrow">Create / Edit Builder</p>
            <h2>${escapeHtml(form.title || "Untitled Form")}</h2>
            <p class="muted-copy">Autosave status: <strong>${escapeHtml(state.saveStatus)}</strong>${state.lastSavedAt ? ` · Last saved ${escapeHtml(state.lastSavedAt)}` : ""}</p>
          </div>
          <div class="fc-builder-actions">
            <button type="button" class="ghost-button" data-fc-undo ${state.undoStack.length ? "" : "disabled"}>Undo</button>
            <button type="button" class="ghost-button" data-fc-save-draft>Save Draft</button>
            <button type="button" class="ghost-button" data-fc-builder-preview>Preview</button>
            <button type="button" class="primary-button" data-fc-publish>Publish</button>
          </div>
        </div>
        <div class="fc-builder-grid">
          <label>
            Form title
            <input type="text" value="${escapeHtml(form.title || "")}" data-fc-meta="title" />
          </label>
          <label>
            Category
            <select data-fc-meta="category">
              ${state.categories.map((category) => `<option value="${escapeHtml(category.id)}"${form.category === category.id ? " selected" : ""}>${escapeHtml(category.label)}</option>`).join("")}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea data-fc-meta="description">${escapeHtml(form.description || "")}</textarea>
        </label>
        <div class="fc-section-editor">
          <h3>Sections</h3>
          ${(snapshot.sections || []).map((section) => `
            <article class="fc-section-row">
              <label>
                Section title
                <input type="text" value="${escapeHtml(section.title || "")}" data-fc-section="${escapeHtml(section.id)}" data-prop="title" />
              </label>
              <label>
                Description
                <input type="text" value="${escapeHtml(section.description || "")}" data-fc-section="${escapeHtml(section.id)}" data-prop="description" />
              </label>
            </article>
          `).join("")}
        </div>
        ${fieldTypeChooserHtml()}
        <div class="fc-field-list">
          ${fields.map((field, index) => fieldEditorHtml(field, index)).join("") || `<p class="muted-copy">No fields yet. Add at least one field before publishing.</p>`}
        </div>
        <details class="fc-version-panel" open>
          <summary>Version history (${state.versions.length})</summary>
          ${(state.versions || []).map((version) => `
            <article class="fc-version-row">
              <strong>Version ${escapeHtml(version.versionNumber)}</strong>
              <span>${escapeHtml(version.createdAt || "")}</span>
              <small>${escapeHtml((version.fields || []).length)} fields · immutable snapshot</small>
            </article>
          `).join("") || `<p class="muted-copy">No published versions yet.</p>`}
          ${form.publishedVersionId ? `<button type="button" class="ghost-button" data-fc-edit-published>Start Draft from Published</button>` : ""}
        </details>
      </section>
    `;
  }

  function renderPreviewField(field) {
    const label = escapeHtml(field.label || labelize(field.type));
    const help = field.helpText ? `<small>${escapeHtml(field.helpText)}</small>` : "";
    if (field.type === "content_heading") return `<h3 class="fc-preview-heading">${label}</h3>`;
    if (field.type === "content_paragraph") return `<p class="fc-preview-copy">${escapeHtml(field.helpText || field.label || "")}</p>`;
    if (field.type === "content_divider") return `<hr class="fc-preview-divider" />`;
    if (["signature_parent", "signature_provider", "initials"].includes(field.type)) {
      return `
        <div class="fc-preview-signature">
          <span>${label}</span>
          <strong>Testing-only signature placeholder</strong>
        </div>
      `;
    }
    if (["single_select", "multi_select", "checkboxes", "yes_no"].includes(field.type)) {
      return `
        <fieldset class="fc-preview-field">
          <legend>${label}${field.required ? " *" : ""}</legend>
          ${help}
          <div class="fc-preview-options">
            ${(field.options || []).map((option) => `<label><span></span>${escapeHtml(option.label || option)}</label>`).join("")}
          </div>
        </fieldset>
      `;
    }
    return `
      <label class="fc-preview-field">
        <span>${label}${field.required ? " *" : ""}</span>
        ${help}
        <input type="text" placeholder="${escapeHtml(field.placeholder || "Preview only")}" disabled />
      </label>
    `;
  }

  function previewHtml() {
    const data = state.preview;
    if (!data) {
      return `
        <section class="fc-panel">
          <h2>Preview</h2>
          <p>Select a form and tap Preview. Preview only &mdash; responses are not being collected.</p>
        </section>
      `;
    }
    const snapshot = data.snapshot || {};
    const fields = snapshot.fields || [];
    const sections = snapshot.sections || [];
    return `
      <section class="fc-panel fc-preview-shell">
        <div class="fc-builder-header">
          <div>
            <p class="eyebrow">Preview only</p>
            <h2>${escapeHtml(data.form?.title || "Form Preview")}</h2>
            <p>Preview only &mdash; responses are not being collected. Signature placeholders are labeled testing-only.</p>
          </div>
          <div class="fc-preview-toggle" role="group" aria-label="Preview device size">
            <button type="button" class="${state.previewMode === "desktop" ? "primary-button" : "ghost-button"}" data-fc-preview-mode="desktop">Desktop</button>
            <button type="button" class="${state.previewMode === "mobile" ? "primary-button" : "ghost-button"}" data-fc-preview-mode="mobile">Mobile</button>
          </div>
        </div>
        <div class="fc-preview-frame ${state.previewMode === "mobile" ? "is-mobile" : "is-desktop"}">
          ${sections.map((section) => `
            <section class="fc-preview-section">
              <h3>${escapeHtml(section.title || "Section")}</h3>
              ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
              ${fields.filter((field) => field.sectionId === section.id).map(renderPreviewField).join("")}
            </section>
          `).join("")}
        </div>
      </section>
    `;
  }

  function bodyHtml() {
    if (state.tab === "home") return homeHtml();
    if (state.tab === "forms") return formsHtml();
    if (state.tab === "templates") return templatesHtml();
    if (state.tab === "archived") return archivedHtml();
    if (state.tab === "builder") return builderHtml();
    if (state.tab === "preview") return previewHtml();
    return homeHtml();
  }

  function render() {
    const root = sectionEl();
    if (!root) return;
    root.hidden = false;
    root.removeAttribute("aria-hidden");
    root.innerHTML = `
      <section class="fc-shell">
        ${previewBannerHtml()}
        ${navHtml()}
        ${state.error ? `<div class="fc-alert error" role="alert">${escapeHtml(state.error)}</div>` : ""}
        ${state.message ? `<div class="fc-alert success" role="status">${escapeHtml(state.message)}</div>` : ""}
        ${state.loading ? `<div class="fc-loading">Loading Forms Center...</div>` : ""}
        ${bodyHtml()}
      </section>
    `;
    bind(root);
  }

  function bind(root) {
    if (root.dataset.fcBound === "true") return;
    root.dataset.fcBound = "true";
    root.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-fc-tab]");
      if (tab) {
        state.tab = tab.dataset.fcTab;
        if (state.tab === "home") refreshHome().catch(() => {});
        else if (state.tab === "forms") { state.filter.status = "active"; refreshForms().catch(() => {}); }
        else if (state.tab === "archived") { state.filter.status = "archived"; refreshForms().catch(() => {}); }
        else render();
        return;
      }
      if (event.target.closest("[data-fc-seed]")) { seedPreview().catch(() => {}); return; }
      if (event.target.closest("[data-fc-create]")) { createBlankForm().catch(() => {}); return; }
      const open = event.target.closest("[data-fc-open]");
      if (open) { openBuilder(open.dataset.fcOpen).catch(() => {}); return; }
      const preview = event.target.closest("[data-fc-preview]");
      if (preview) { openPreview(preview.dataset.fcPreview).catch(() => {}); return; }
      const duplicate = event.target.closest("[data-fc-duplicate]");
      if (duplicate) { duplicateForm(duplicate.dataset.fcDuplicate).catch(() => {}); return; }
      const archive = event.target.closest("[data-fc-archive]");
      if (archive) { archiveForm(archive.dataset.fcArchive).catch(() => {}); return; }
      const restore = event.target.closest("[data-fc-restore]");
      if (restore) { restoreForm(restore.dataset.fcRestore).catch(() => {}); return; }
      const apply = event.target.closest("[data-fc-apply-filter]");
      if (apply) { state.filter.status = apply.dataset.status || "active"; refreshForms().catch(() => {}); return; }
      if (event.target.closest("[data-fc-add-field]")) {
        const type = root.querySelector("[data-fc-field-type]")?.value || "short_text";
        addField(type);
        return;
      }
      if (event.target.closest("[data-fc-add-section]")) { addSection(); return; }
      if (event.target.closest("[data-fc-save-draft]")) { saveDraft({ autosave: false }).catch(() => {}); return; }
      if (event.target.closest("[data-fc-publish]")) { publishForm().catch(() => {}); return; }
      if (event.target.closest("[data-fc-builder-preview]")) {
        const form = currentBuilderForm();
        if (form) openPreview(form.id).catch(() => {});
        return;
      }
      if (event.target.closest("[data-fc-edit-published]")) { startPublishedEdit().catch(() => {}); return; }
      if (event.target.closest("[data-fc-undo]")) { restoreUndo(); return; }
      const duplicateFieldBtn = event.target.closest("[data-fc-duplicate-field]");
      if (duplicateFieldBtn) { duplicateField(duplicateFieldBtn.dataset.fcDuplicateField); return; }
      const deleteFieldBtn = event.target.closest("[data-fc-delete-field]");
      if (deleteFieldBtn) { deleteField(deleteFieldBtn.dataset.fcDeleteField); return; }
      const moveBtn = event.target.closest("[data-fc-move-field]");
      if (moveBtn) { moveField(moveBtn.dataset.id, moveBtn.dataset.fcMoveField); return; }
      const previewMode = event.target.closest("[data-fc-preview-mode]");
      if (previewMode) { state.previewMode = previewMode.dataset.fcPreviewMode; render(); }
    });
    root.addEventListener("input", (event) => {
      const filter = event.target.closest("[data-fc-filter]");
      if (filter) {
        state.filter[filter.dataset.fcFilter] = filter.value;
        return;
      }
      const meta = event.target.closest("[data-fc-meta]");
      if (meta) {
        updateFormMeta(meta.dataset.fcMeta, meta.value);
        return;
      }
      const sectionInput = event.target.closest("[data-fc-section]");
      if (sectionInput) {
        updateSection(sectionInput.dataset.fcSection, { [sectionInput.dataset.prop]: sectionInput.value });
        return;
      }
      const fieldInput = event.target.closest("[data-fc-field-input]");
      if (fieldInput) {
        const id = fieldInput.dataset.fcFieldInput;
        const prop = fieldInput.dataset.prop;
        if (prop === "required") updateField(id, { required: fieldInput.checked });
        else if (prop === "optionsText") {
          updateField(id, {
            options: String(fieldInput.value || "")
              .split(/\n+/)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((label) => ({ label })),
          });
        } else {
          updateField(id, { [prop]: fieldInput.value });
        }
      }
    });
    root.addEventListener("change", (event) => {
      const meta = event.target.closest("[data-fc-meta]");
      if (meta) updateFormMeta(meta.dataset.fcMeta, meta.value);
      const fieldInput = event.target.closest("[data-fc-field-input]");
      if (fieldInput && fieldInput.dataset.prop === "sectionId") {
        updateField(fieldInput.dataset.fcFieldInput, { sectionId: fieldInput.value });
      }
    });
  }

  async function init() {
    if (!state.fieldTypes.length) await loadCatalog();
    await refreshHome();
  }

  global.renderFormsCenterPreviewUI = function renderFormsCenterPreviewUI() {
    render();
    init().catch((error) => {
      setMessage(error.message || "Could not load Forms Center.", true);
    });
  };
})(window);
