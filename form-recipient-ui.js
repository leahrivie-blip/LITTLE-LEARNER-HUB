/**
 * Phase 6 recipient form-completion experience.
 * Standalone page — no admin session, token-authenticated only. Mobile-first,
 * works on small phones through desktop. Never sends email/SMS/Stripe/AI.
 */
(function initFormRecipientUI(global) {
  const TOKEN_HEADER = "x-llh-form-recipient-token";
  const state = {
    assignmentId: "",
    token: "",
    loading: true,
    error: "",
    payload: null,
    answers: {},
    sectionIndex: 0,
    view: "form", // form | review | document | error
    fieldErrors: {},
    saveStatus: "",
    autosaveTimer: null,
    submitting: false,
    signatures: [], // captured this session, mirrors payload.signatures after refresh
    signatureDraft: { typedName: "", consentGiven: false },
    drawing: { canvas: null, ctx: null, hasStrokes: false, points: [] },
    clearConfirmOpen: false,
    document: null, // the clean read-only document view, once available
    documentLoading: false,
    justSubmitted: false,
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

  function parseHash() {
    const raw = String(global.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw);
    return { assignmentId: params.get("a") || "", token: params.get("t") || "" };
  }

  async function api(method, path, body) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (state.token) headers[TOKEN_HEADER] = state.token;
    const res = await fetch(path, { method, headers, cache: "no-store", body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || `Request failed (${res.status})`);
      error.status = res.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  function root() {
    return document.querySelector("#fr-app");
  }

  function nonInputTypes() {
    return new Set(["content_heading", "content_paragraph", "content_divider"]);
  }

  function fieldsForSection(sectionId) {
    return (state.payload?.version?.fields || []).filter((field) => field.sectionId === sectionId);
  }

  function isFieldEmpty(value) {
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  }

  function validateSection(sectionId) {
    const errors = {};
    fieldsForSection(sectionId).forEach((field) => {
      if (nonInputTypes().has(field.type)) return;
      const value = state.answers[field.id];
      if (field.required && isFieldEmpty(value)) {
        errors[field.id] = `"${field.label}" is required.`;
        return;
      }
      if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors[field.id] = `"${field.label}" needs a valid email address.`;
      }
    });
    return errors;
  }

  // ── Data loading ────────────────────────────────────────────────────────

  async function resolveAssignment() {
    state.loading = true;
    render();
    try {
      const data = await api("GET", `/api/form-recipient/${encodeURIComponent(state.assignmentId)}`);
      state.payload = data;
      state.answers = { ...data.response.answers };
      const sections = data.version?.sections || [];
      const currentId = data.response.currentSectionId;
      state.sectionIndex = Math.max(0, sections.findIndex((s) => s.id === currentId));
      if (state.sectionIndex < 0) state.sectionIndex = 0;
      const editableStatuses = new Set(["not_started", "in_progress", "returned_for_correction"]);
      state.view = editableStatuses.has(data.response.status) ? "form" : "document";
      state.error = "";
    } catch (error) {
      state.error = error.message || "This testing link could not be loaded.";
      state.view = "error";
    } finally {
      state.loading = false;
      if (state.view === "document") await loadDocument();
      render();
    }
  }

  /**
   * The clean, read-only document view — available once the response is no
   * longer editable (submitted or later). Approved responses always show the
   * permanent, frozen snapshot; anything else is rendered live from current
   * data. This is the recipient's own single response only.
   */
  async function loadDocument() {
    state.documentLoading = true;
    try {
      const data = await api("GET", `/api/form-recipient/${encodeURIComponent(state.assignmentId)}/document`);
      state.document = data;
    } catch (error) {
      state.document = null;
      state.error = state.error || error.message || "Could not load your document view.";
    } finally {
      state.documentLoading = false;
    }
  }

  function scheduleAutosave() {
    state.saveStatus = "Unsaved changes";
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = window.setTimeout(() => { saveDraft(true).catch(() => {}); }, 1000);
  }

  async function saveDraft(autosave) {
    if (!state.payload?.response?.editable) return;
    state.saveStatus = autosave ? "Saving…" : "Saving…";
    renderSaveStatusOnly();
    try {
      const currentSection = state.payload.version.sections[state.sectionIndex];
      const data = await api("POST", `/api/form-recipient/${encodeURIComponent(state.assignmentId)}/save-draft`, {
        answers: state.answers,
        currentSectionId: currentSection?.id || "",
        autosave: autosave === true,
      });
      state.saveStatus = `Saved ${new Date(data.savedAt).toLocaleTimeString()}`;
      state.payload.response.status = data.status;
    } catch (error) {
      state.saveStatus = "Save failed — will retry";
      window.clearTimeout(state.autosaveTimer);
      state.autosaveTimer = window.setTimeout(() => { saveDraft(true).catch(() => {}); }, 4000);
    } finally {
      renderSaveStatusOnly();
    }
  }

  function renderSaveStatusOnly() {
    const el = document.querySelector("[data-fr-save-status]");
    if (el) el.textContent = state.saveStatus;
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  function bannerHtml() {
    return `<div class="fr-banner fr-no-print"><span>Testing Preview — Fake Data Only</span><span>No response is ever emailed or texted. Nothing here is real.</span></div>`;
  }

  function headerHtml() {
    const program = state.payload?.program || { name: "Little Learner Hub Preview Program" };
    return `
      <header class="fr-header">
        <div class="fr-logo-placeholder" aria-hidden="true">LL</div>
        <div>
          <h1>${escapeHtml(program.name)}</h1>
          <p>Program logo and branding will appear here once configured.</p>
        </div>
      </header>
    `;
  }

  function errorScreenHtml() {
    return `
      ${bannerHtml()}
      <div class="fr-card fr-error-screen">
        <h2>This link isn't available</h2>
        <p>${escapeHtml(state.error)}</p>
        <p>Please ask your program for a new testing link.</p>
      </div>
    `;
  }

  function renderPreviewField(field, sectionId) {
    const value = state.answers[field.id];
    const error = state.fieldErrors[field.id];
    const requiredMark = field.required ? `<span class="fr-required-star" aria-hidden="true"> *</span>` : "";
    const help = field.helpText ? `<p class="fr-help-text" id="fr-help-${escapeHtml(field.id)}">${escapeHtml(field.helpText)}</p>` : "";
    const describedBy = field.helpText ? `fr-help-${escapeHtml(field.id)}` : "";
    if (field.type === "content_heading") return `<h3 class="fr-content-heading">${escapeHtml(field.label)}</h3>`;
    if (field.type === "content_paragraph") return `<p class="fr-content-paragraph">${escapeHtml(field.helpText || field.label)}</p>`;
    if (field.type === "content_divider") return `<hr class="fr-content-divider" />`;

    const wrapClass = `fr-field${error ? " has-error" : ""}`;
    if (["single_select", "yes_no"].includes(field.type)) {
      return `
        <div class="${wrapClass}" data-fr-field-wrap="${escapeHtml(field.id)}">
          <span class="fr-field-label" id="fr-label-${escapeHtml(field.id)}">${escapeHtml(field.label)}${requiredMark}</span>
          ${help}
          <div class="fr-options" role="radiogroup" aria-labelledby="fr-label-${escapeHtml(field.id)}">
            ${(field.options || []).map((option, index) => `
              <label>
                <input type="radio" name="fr-field-${escapeHtml(field.id)}" value="${escapeHtml(option.label)}" ${value === option.label ? "checked" : ""} data-fr-answer="${escapeHtml(field.id)}" data-fr-answer-kind="single" />
                ${escapeHtml(option.label)}
              </label>
            `).join("")}
          </div>
          ${error ? `<p class="fr-field-error" role="alert">${escapeHtml(error)}</p>` : ""}
        </div>
      `;
    }
    if (["multi_select", "checkboxes"].includes(field.type)) {
      const selected = Array.isArray(value) ? value : [];
      return `
        <div class="${wrapClass}" data-fr-field-wrap="${escapeHtml(field.id)}">
          <span class="fr-field-label" id="fr-label-${escapeHtml(field.id)}">${escapeHtml(field.label)}${requiredMark}</span>
          ${help}
          <div class="fr-options" role="group" aria-labelledby="fr-label-${escapeHtml(field.id)}">
            ${(field.options || []).map((option) => `
              <label>
                <input type="checkbox" value="${escapeHtml(option.label)}" ${selected.includes(option.label) ? "checked" : ""} data-fr-answer="${escapeHtml(field.id)}" data-fr-answer-kind="multi" />
                ${escapeHtml(option.label)}
              </label>
            `).join("")}
          </div>
          ${error ? `<p class="fr-field-error" role="alert">${escapeHtml(error)}</p>` : ""}
        </div>
      `;
    }
    if (["signature_parent", "signature_provider", "initials"].includes(field.type)) {
      return `
        <div class="${wrapClass}" data-fr-field-wrap="${escapeHtml(field.id)}">
          <label class="fr-field-label" for="fr-input-${escapeHtml(field.id)}">${escapeHtml(field.label)}${requiredMark}</label>
          <p class="fr-help-text">Testing-only placeholder — type your name or initials here. Your legal electronic signature is captured separately before submitting.</p>
          <input type="text" id="fr-input-${escapeHtml(field.id)}" value="${escapeHtml(value || "")}" data-fr-answer="${escapeHtml(field.id)}" data-fr-answer-kind="text" aria-describedby="${describedBy}" />
          ${error ? `<p class="fr-field-error" role="alert">${escapeHtml(error)}</p>` : ""}
        </div>
      `;
    }
    const inputType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "date" ? "date" : field.type === "number" ? "number" : "text";
    if (field.type === "long_text") {
      return `
        <div class="${wrapClass}" data-fr-field-wrap="${escapeHtml(field.id)}">
          <label class="fr-field-label" for="fr-input-${escapeHtml(field.id)}">${escapeHtml(field.label)}${requiredMark}</label>
          ${help}
          <textarea id="fr-input-${escapeHtml(field.id)}" data-fr-answer="${escapeHtml(field.id)}" data-fr-answer-kind="text" aria-describedby="${describedBy}" placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value || "")}</textarea>
          ${error ? `<p class="fr-field-error" role="alert">${escapeHtml(error)}</p>` : ""}
        </div>
      `;
    }
    return `
      <div class="${wrapClass}" data-fr-field-wrap="${escapeHtml(field.id)}">
        <label class="fr-field-label" for="fr-input-${escapeHtml(field.id)}">${escapeHtml(field.label)}${requiredMark}</label>
        ${help}
        <input type="${inputType}" id="fr-input-${escapeHtml(field.id)}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(field.placeholder || "")}" data-fr-answer="${escapeHtml(field.id)}" data-fr-answer-kind="text" aria-describedby="${describedBy}" />
        ${error ? `<p class="fr-field-error" role="alert">${escapeHtml(error)}</p>` : ""}
      </div>
    `;
  }

  function progressHtml() {
    const progress = state.payload.response.progress;
    return `
      <div class="fr-progress-track" role="progressbar" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Form completion progress">
        <div class="fr-progress-fill" style="width:${progress.percent}%"></div>
      </div>
      <p class="fr-help-text">${escapeHtml(progress.completed)} of ${escapeHtml(progress.total)} required fields complete</p>
    `;
  }

  function sectionNavHtml() {
    const sections = state.payload.version.sections;
    if (sections.length <= 1) return "";
    return `
      <nav class="fr-section-nav" aria-label="Form sections">
        ${sections.map((section, index) => `
          <button type="button" class="${index === state.sectionIndex ? "is-active" : ""}" data-fr-goto-section="${index}" aria-current="${index === state.sectionIndex ? "step" : "false"}">${escapeHtml(index + 1)}. ${escapeHtml(section.title)}</button>
        `).join("")}
      </nav>
    `;
  }

  function formScreenHtml() {
    const payload = state.payload;
    const sections = payload.version.sections;
    const section = sections[state.sectionIndex];
    const fields = fieldsForSection(section.id);
    const isFirst = state.sectionIndex === 0;
    const isLast = state.sectionIndex === sections.length - 1;
    return `
      ${bannerHtml()}
      ${headerHtml()}
      <div class="fr-card">
        <h2 class="fr-form-title">${escapeHtml(payload.form.title)}</h2>
        <div class="fr-meta-row">
          ${payload.relatedChildName ? `<span>Child: ${escapeHtml(payload.relatedChildName)}</span>` : ""}
          ${payload.assignment.dueDate ? `<span>Due ${escapeHtml(payload.assignment.dueDate)}</span>` : ""}
          <span>${escapeHtml(payload.response.statusLabel)}</span>
        </div>
        ${payload.assignment.instructions ? `<p class="fr-content-paragraph">${escapeHtml(payload.assignment.instructions)}</p>` : ""}
        ${payload.response.returnMessage ? `<p class="fr-error-banner">${escapeHtml(payload.response.returnMessage)}</p>` : ""}
        ${progressHtml()}
        ${sectionNavHtml()}
        <h3 class="fr-section-heading">${escapeHtml(section.title)}</h3>
        ${section.description ? `<p class="fr-section-desc">${escapeHtml(section.description)}</p>` : ""}
        <form data-fr-section-form novalidate>
          ${fields.map((field) => renderPreviewField(field, section.id)).join("")}
        </form>
        <p class="fr-save-status fr-no-print" data-fr-save-status>${escapeHtml(state.saveStatus)}</p>
        <div class="fr-button-row fr-no-print">
          ${!isFirst ? `<button type="button" class="fr-button fr-button-ghost" data-fr-prev>Previous</button>` : ""}
          ${!isLast ? `<button type="button" class="fr-button fr-button-primary" data-fr-next>Next</button>` : `<button type="button" class="fr-button fr-button-primary" data-fr-review>Review Answers</button>`}
          <button type="button" class="fr-button fr-button-ghost" data-fr-save-now>Save and Continue Later</button>
          <button type="button" class="fr-button fr-button-ghost fr-danger" data-fr-clear>Clear Response</button>
        </div>
        ${state.clearConfirmOpen ? `
          <div class="fr-error-banner" role="alertdialog">
            Are you sure you want to clear everything you've entered? This cannot be undone.
            <div class="fr-button-row">
              <button type="button" class="fr-button fr-button-ghost fr-danger" data-fr-confirm-clear>Yes, Clear My Answers</button>
              <button type="button" class="fr-button fr-button-ghost" data-fr-cancel-clear>Cancel</button>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function allAnswersBySection() {
    const sections = state.payload.version.sections;
    return sections.map((section) => ({
      section,
      fields: fieldsForSection(section.id).filter((field) => !nonInputTypes().has(field.type)),
    }));
  }

  function formatAnswer(field, value) {
    if (isFieldEmpty(value)) return "Not answered";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  }

  function requiredSignatureRoles() {
    return (state.payload.assignment.requiredSignatureRoles || []).filter((role) => role !== "provider");
  }

  function signaturesSatisfied() {
    const active = state.payload.signatures || [];
    return requiredSignatureRoles().every((role) => active.some((sig) => sig.signerRole === role));
  }

  function reviewScreenHtml() {
    const grouped = allAnswersBySection();
    const roles = requiredSignatureRoles();
    return `
      ${bannerHtml()}
      ${headerHtml()}
      <div class="fr-card">
        <h2 class="fr-form-title">Review your answers</h2>
        <p class="fr-help-text">Check everything below before submitting. Nothing is sent anywhere outside this testing preview.</p>
        <div class="fr-review-list">
          ${grouped.map(({ section, fields }) => fields.length ? `
            <div class="fr-review-item">
              <strong>${escapeHtml(section.title)} <button type="button" class="fr-button fr-button-ghost" data-fr-edit-section="${escapeHtml(section.id)}" style="min-height:32px;padding:4px 12px;margin-left:8px;">Edit</button></strong>
              ${fields.map((field) => `<div>${escapeHtml(field.label)}: ${escapeHtml(formatAnswer(field, state.answers[field.id]))}</div>`).join("")}
            </div>
          ` : "").join("")}
        </div>

        ${roles.map((role) => signatureBlockHtml(role)).join("")}

        <div class="fr-button-row fr-no-print">
          <button type="button" class="fr-button fr-button-ghost" data-fr-back-to-form>Back to Form</button>
          <button type="button" class="fr-button fr-button-primary" data-fr-submit ${state.submitting || !signaturesSatisfied() ? "disabled" : ""}>${state.submitting ? "Submitting…" : "Submit"}</button>
        </div>
        ${!signaturesSatisfied() ? `<p class="fr-help-text">Complete the required signature(s) above before submitting.</p>` : ""}
      </div>
    `;
  }

  function signatureBlockHtml(role) {
    const already = (state.payload.signatures || []).find((sig) => sig.signerRole === role);
    if (already) {
      return `
        <div class="fr-signature-block">
          <strong>${escapeHtml(labelize(role))} signature captured</strong>
          <p class="fr-help-text">${escapeHtml(already.signerName)} — ${escapeHtml(new Date(already.signedAt).toLocaleString())}</p>
        </div>
      `;
    }
    return `
      <div class="fr-signature-block" data-fr-signature-block="${escapeHtml(role)}">
        <h3 class="fr-content-heading">${escapeHtml(labelize(role))} electronic signature</h3>
        <div class="fr-field">
          <label class="fr-field-label" for="fr-typed-name-${escapeHtml(role)}">Type your full legal name to sign <span class="fr-required-star">*</span></label>
          <input type="text" id="fr-typed-name-${escapeHtml(role)}" data-fr-signature-name="${escapeHtml(role)}" value="${escapeHtml(state.signatureDraft.typedName)}" />
        </div>
        <p class="fr-help-text">Optional: draw your signature below if you're able to. If you can't draw, your typed name above is your signature.</p>
        <canvas class="fr-signature-canvas" data-fr-signature-canvas="${escapeHtml(role)}" width="600" height="140" role="img" aria-label="Optional drawn signature area"></canvas>
        <div class="fr-button-row">
          <button type="button" class="fr-button fr-button-ghost" data-fr-clear-drawing="${escapeHtml(role)}">Clear Drawing</button>
        </div>
        <p class="fr-signature-alt-note">Can't draw a signature? That's OK — your typed name above is a valid electronic signature.</p>
        <div class="fr-consent-row">
          <input type="checkbox" id="fr-consent-${escapeHtml(role)}" data-fr-signature-consent="${escapeHtml(role)}" ${state.signatureDraft.consentGiven ? "checked" : ""} />
          <label for="fr-consent-${escapeHtml(role)}" class="fr-consent-text">${escapeHtml(state.payload.consent.text)}</label>
        </div>
        <div class="fr-button-row">
          <button type="button" class="fr-button fr-button-primary" data-fr-sign="${escapeHtml(role)}">Sign</button>
        </div>
      </div>
    `;
  }

  /**
   * The clean, read-only document view — shown once the response is
   * submitted (or later). Reuses the shared window.LLHFormDocumentView
   * renderer so the recipient's own document, the admin's response detail
   * view, and the standalone admin print/download page all look identical.
   */
  function documentScreenHtml() {
    const status = state.payload?.response?.statusLabel || "Submitted";
    const frozen = state.document?.frozen === true;
    return `
      ${bannerHtml()}
      ${state.justSubmitted ? `
        <div class="fr-card fr-confirmation fr-no-print">
          <h2>Thank you!</h2>
          <p>Your response status is now <strong>${escapeHtml(status)}</strong>.</p>
          <p class="fr-help-text">This is a testing preview. No email or text was sent to anyone.</p>
        </div>
      ` : ""}
      ${headerHtml()}
      ${state.documentLoading ? `<div class="fr-loading">Loading your document…</div>` : ""}
      ${state.document?.content ? `
        <div class="fr-card fdv-page">
          ${window.LLHFormDocumentView.render(state.document.content, { showInternalNotes: false })}
        </div>
        <div class="fr-button-row fr-no-print" style="justify-content:center;">
          <button type="button" class="fr-button fr-button-ghost" data-fr-print>Print</button>
          <button type="button" class="fr-button fr-button-primary" data-fr-print>Download PDF</button>
        </div>
        ${frozen ? `<p class="fr-help-text" style="text-align:center;">This is your permanent, approved document snapshot.</p>` : `<p class="fr-help-text" style="text-align:center;">This document will become a permanent snapshot once your program approves it.</p>`}
      ` : (state.documentLoading ? "" : `
        <div class="fr-card fr-confirmation">
          <p>Your response status is now <strong>${escapeHtml(status)}</strong>.</p>
        </div>
      `)}
    `;
  }

  function render() {
    const el = root();
    if (!el) return;
    if (state.loading && !state.payload) { el.innerHTML = `<div class="fr-loading">Loading your form…</div>`; return; }
    if (state.view === "error") { el.innerHTML = errorScreenHtml(); return; }
    if (state.view === "review") { el.innerHTML = reviewScreenHtml(); bind(el); return; }
    if (state.view === "document") { el.innerHTML = documentScreenHtml(); bind(el); return; }
    el.innerHTML = formScreenHtml();
    bind(el);
    setupDrawingCanvases(el);
  }

  // ── Drawing canvas (accessible fallback: typed name always sufficient) ──

  function setupDrawingCanvases(container) {
    container.querySelectorAll("[data-fr-signature-canvas]").forEach((canvas) => {
      if (canvas.dataset.frBound === "true") return;
      canvas.dataset.frBound = "true";
      const ctx = canvas.getContext("2d");
      ctx.strokeStyle = "#2d3650";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      let drawing = false;
      function point(event) {
        const rect = canvas.getBoundingClientRect();
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
      }
      function start(event) { drawing = true; const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); event.preventDefault(); }
      function move(event) { if (!drawing) return; const p = point(event); ctx.lineTo(p.x, p.y); ctx.stroke(); canvas.dataset.hasStrokes = "true"; event.preventDefault(); }
      function end() { drawing = false; }
      canvas.addEventListener("mousedown", start);
      canvas.addEventListener("mousemove", move);
      canvas.addEventListener("mouseup", end);
      canvas.addEventListener("mouseleave", end);
      canvas.addEventListener("touchstart", start, { passive: false });
      canvas.addEventListener("touchmove", move, { passive: false });
      canvas.addEventListener("touchend", end);
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function goToSection(index) {
    const sections = state.payload.version.sections;
    if (index < 0 || index >= sections.length) return;
    state.sectionIndex = index;
    render();
  }

  function validateCurrentSection() {
    const section = state.payload.version.sections[state.sectionIndex];
    const errors = validateSection(section.id);
    state.fieldErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function goNext() {
    if (!validateCurrentSection()) { render(); return; }
    await saveDraft(false);
    goToSection(state.sectionIndex + 1);
  }

  async function goReview() {
    if (!validateCurrentSection()) { render(); return; }
    await saveDraft(false);
    state.view = "review";
    render();
  }

  async function clearResponse() {
    try {
      await api("POST", `/api/form-recipient/${encodeURIComponent(state.assignmentId)}/clear`, { confirm: true });
      state.clearConfirmOpen = false;
      await resolveAssignment();
    } catch (error) {
      state.error = error.message || "Could not clear this response.";
      render();
    }
  }

  async function signAs(role) {
    const canvas = document.querySelector(`[data-fr-signature-canvas="${role}"]`);
    const drawnDataUrl = canvas && canvas.dataset.hasStrokes === "true" ? canvas.toDataURL("image/png") : "";
    if (!state.signatureDraft.typedName.trim()) { state.error = "Type your full legal name to sign."; render(); return; }
    if (!state.signatureDraft.consentGiven) { state.error = "Check the consent box to sign electronically."; render(); return; }
    try {
      await api("POST", `/api/form-recipient/${encodeURIComponent(state.assignmentId)}/signature`, {
        typedName: state.signatureDraft.typedName,
        consentGiven: true,
        signerRole: role,
        drawnDataUrl,
      });
      state.signatureDraft = { typedName: "", consentGiven: false };
      state.error = "";
      const data = await api("GET", `/api/form-recipient/${encodeURIComponent(state.assignmentId)}`);
      state.payload = data;
      render();
    } catch (error) {
      state.error = error.message || "Could not capture this signature.";
      render();
    }
  }

  async function submitResponse() {
    if (state.submitting) return;
    state.submitting = true;
    render();
    try {
      const data = await api("POST", `/api/form-recipient/${encodeURIComponent(state.assignmentId)}/submit`, { answers: state.answers });
      state.payload.response.status = data.status;
      state.payload.response.statusLabel = data.status === "corrected_and_resubmitted" ? "Corrected and Resubmitted" : "Submitted";
      state.justSubmitted = true;
      state.view = "document";
      await loadDocument();
    } catch (error) {
      if (error.payload?.code === "validation_failed") {
        state.fieldErrors = {};
        (error.payload.errors || []).forEach((entry) => { state.fieldErrors[entry.fieldId] = entry.message; });
        state.view = "form";
        state.sectionIndex = 0;
        state.error = "Please fix the highlighted fields before submitting.";
      } else {
        state.error = error.message || "Could not submit this form.";
      }
    } finally {
      state.submitting = false;
      render();
    }
  }

  function bind(container) {
    if (container.dataset.frBound === "true") return;
    container.dataset.frBound = "true";
    container.addEventListener("click", (event) => {
      if (event.target.closest("[data-fr-next]")) { goNext().catch(() => {}); return; }
      if (event.target.closest("[data-fr-prev]")) { goToSection(state.sectionIndex - 1); return; }
      if (event.target.closest("[data-fr-review]")) { goReview().catch(() => {}); return; }
      if (event.target.closest("[data-fr-back-to-form]")) { state.view = "form"; render(); return; }
      if (event.target.closest("[data-fr-save-now]")) { saveDraft(false).catch(() => {}); return; }
      if (event.target.closest("[data-fr-clear]")) { state.clearConfirmOpen = true; render(); return; }
      if (event.target.closest("[data-fr-cancel-clear]")) { state.clearConfirmOpen = false; render(); return; }
      if (event.target.closest("[data-fr-confirm-clear]")) { clearResponse().catch(() => {}); return; }
      const gotoBtn = event.target.closest("[data-fr-goto-section]");
      if (gotoBtn) { goToSection(Number(gotoBtn.dataset.frGotoSection)); return; }
      const editBtn = event.target.closest("[data-fr-edit-section]");
      if (editBtn) {
        const idx = state.payload.version.sections.findIndex((s) => s.id === editBtn.dataset.frEditSection);
        state.view = "form";
        goToSection(Math.max(0, idx));
        return;
      }
      const clearDrawBtn = event.target.closest("[data-fr-clear-drawing]");
      if (clearDrawBtn) {
        const canvas = container.querySelector(`[data-fr-signature-canvas="${clearDrawBtn.dataset.frClearDrawing}"]`);
        if (canvas) { canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height); canvas.dataset.hasStrokes = "false"; }
        return;
      }
      const signBtn = event.target.closest("[data-fr-sign]");
      if (signBtn) { signAs(signBtn.dataset.frSign).catch(() => {}); return; }
      if (event.target.closest("[data-fr-submit]")) { submitResponse().catch(() => {}); return; }
      if (event.target.closest("[data-fr-print]")) { window.print(); return; }
    });
    container.addEventListener("input", (event) => {
      const answerInput = event.target.closest("[data-fr-answer]");
      if (answerInput && answerInput.dataset.frAnswerKind === "text") {
        state.answers[answerInput.dataset.frAnswer] = answerInput.value;
        scheduleAutosave();
        return;
      }
      const sigName = event.target.closest("[data-fr-signature-name]");
      if (sigName) { state.signatureDraft.typedName = sigName.value; return; }
    });
    container.addEventListener("change", (event) => {
      const radio = event.target.closest('[data-fr-answer-kind="single"]');
      if (radio) { state.answers[radio.dataset.frAnswer] = radio.value; scheduleAutosave(); return; }
      const checkbox = event.target.closest('[data-fr-answer-kind="multi"]');
      if (checkbox) {
        const key = checkbox.dataset.frAnswer;
        const current = Array.isArray(state.answers[key]) ? state.answers[key] : [];
        state.answers[key] = checkbox.checked ? [...current, checkbox.value] : current.filter((v) => v !== checkbox.value);
        scheduleAutosave();
        return;
      }
      const consent = event.target.closest("[data-fr-signature-consent]");
      if (consent) { state.signatureDraft.consentGiven = consent.checked; return; }
    });
  }

  function init() {
    const { assignmentId, token } = parseHash();
    if (!assignmentId || !token) {
      state.error = "This testing link is missing information. Please request a new link from your program.";
      state.view = "error";
      state.loading = false;
      render();
      return;
    }
    state.assignmentId = assignmentId;
    state.token = token;
    resolveAssignment().catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
