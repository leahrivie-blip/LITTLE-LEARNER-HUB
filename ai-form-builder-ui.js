/**
 * Phase 7 AI Form Builder UI — mounts inside Forms Center.
 * Drafting aid only. Never publishes, sends, signs, or overwrites a form.
 * Live AI stays off in testing; mock results are labeled
 * "Testing Preview — AI Not Called."
 */
(function initAiFormBuilderUI(global) {
  const API = "/api/forms-center/ai-builder";
  const state = {
    status: null,
    statusLoading: false,
    generating: false,
    accepting: false,
    error: "",
    message: "",
    form: {
      prompt: "",
      pastedText: "",
      category: "custom",
      intendedRecipient: "guardian",
      involvesChild: true,
      involvesGuardian: true,
      involvesStaff: false,
      involvesClassroom: false,
      involvesProgram: false,
      requestSignatures: true,
      requestInitials: false,
      requestAcknowledgments: true,
      requestDates: true,
      requestAttachments: false,
      requestConditionalQuestions: false,
      filingDestination: "child",
    },
    session: null, // full detail payload
    compareOpen: false,
    categories: [
      { id: "enrollment", label: "Enrollment" },
      { id: "emergency_contacts", label: "Emergency Contacts" },
      { id: "permissions", label: "Permissions" },
      { id: "field_trips", label: "Field Trips" },
      { id: "child_information", label: "Child Information" },
      { id: "health_medication", label: "Health and Medication" },
      { id: "parent_agreements", label: "Parent Agreements" },
      { id: "incident_safety", label: "Incident / Safety" },
      { id: "staff_admin", label: "Staff / Admin" },
      { id: "custom", label: "Custom" },
    ],
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

  function mountEl() {
    return document.querySelector("#fc-ai-builder-mount");
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

  async function loadStatus() {
    state.statusLoading = true;
    render();
    try {
      state.status = await api("GET", `${API}/status`);
      state.error = "";
    } catch (error) {
      state.status = { available: false, message: error.message || "AI Form Builder is unavailable." };
      state.error = error.message || "Could not check AI Form Builder availability.";
    } finally {
      state.statusLoading = false;
      render();
    }
  }

  function buildGenerateBody() {
    return {
      prompt: state.form.prompt,
      pastedText: state.form.pastedText,
      category: state.form.category,
      intendedRecipient: state.form.intendedRecipient,
      involves: {
        child: state.form.involvesChild,
        guardian: state.form.involvesGuardian,
        staff: state.form.involvesStaff,
        classroom: state.form.involvesClassroom,
        program: state.form.involvesProgram,
      },
      requestSignatures: state.form.requestSignatures,
      requestInitials: state.form.requestInitials,
      requestAcknowledgments: state.form.requestAcknowledgments,
      requestDates: state.form.requestDates,
      requestAttachments: state.form.requestAttachments,
      requestConditionalQuestions: state.form.requestConditionalQuestions,
      filingDestination: state.form.filingDestination,
    };
  }

  async function generate() {
    if (state.generating) return;
    state.generating = true;
    state.error = "";
    state.message = "";
    render();
    try {
      const data = await api("POST", `${API}/generate`, buildGenerateBody());
      state.session = data.detail;
      state.message = data.label || "Testing Preview — AI Not Called.";
      state.compareOpen = Boolean(state.form.pastedText);
    } catch (error) {
      state.error = error.message || "Could not generate a draft.";
    } finally {
      state.generating = false;
      render();
    }
  }

  async function regenerate() {
    if (!state.session || state.generating) return;
    state.generating = true;
    state.error = "";
    render();
    try {
      const data = await api("POST", `${API}/sessions/${encodeURIComponent(state.session.id)}/regenerate`, buildGenerateBody());
      state.session = data.detail;
      state.message = data.preservedAcceptedFormId
        ? "New suggestions created without overwriting your accepted draft."
        : (data.label || "Suggestions regenerated.");
    } catch (error) {
      state.error = error.message || "Could not regenerate suggestions.";
    } finally {
      state.generating = false;
      render();
    }
  }

  async function acceptDraft() {
    if (!state.session || state.accepting) return;
    if (state.session.status === "accepted" && state.session.acceptedFormId) {
      openAcceptedInBuilder(state.session.acceptedFormId);
      return;
    }
    state.accepting = true;
    state.error = "";
    render();
    try {
      const data = await api("POST", `${API}/sessions/${encodeURIComponent(state.session.id)}/accept`, {});
      state.session = { ...state.session, ...data.session, acceptedFormId: data.form.id, status: "accepted" };
      state.message = "Your editable program draft is ready. It was not published.";
      // Hand off to the existing Phase 4 Form Builder.
      if (typeof global.openFormsCenterBuilder === "function") {
        await global.openFormsCenterBuilder(data.form.id);
      } else if (typeof global.renderFormsCenterPreviewUI === "function") {
        // Fallback: stash and ask Forms Center to open the builder.
        global.__fcPendingOpenFormId = data.form.id;
      }
    } catch (error) {
      state.error = error.message || "Could not save this draft.";
    } finally {
      state.accepting = false;
      render();
    }
  }

  function openAcceptedInBuilder(formId) {
    if (typeof global.openFormsCenterBuilder === "function") {
      global.openFormsCenterBuilder(formId);
    }
  }

  function startOver() {
    state.session = null;
    state.compareOpen = false;
    state.message = "";
    state.error = "";
    render();
  }

  function removeSuggestedField(sectionIndex, fieldIndex) {
    if (!state.session?.generatedSuggestion?.sections?.[sectionIndex]) return;
    const sections = state.session.generatedSuggestion.sections;
    sections[sectionIndex].fields.splice(fieldIndex, 1);
    state.session.providerEdits = state.session.generatedSuggestion;
    render();
  }

  function moveSuggestedField(sectionIndex, fieldIndex, direction) {
    const fields = state.session?.generatedSuggestion?.sections?.[sectionIndex]?.fields;
    if (!fields) return;
    const target = fieldIndex + (direction === "up" ? -1 : 1);
    if (target < 0 || target >= fields.length) return;
    const tmp = fields[fieldIndex];
    fields[fieldIndex] = fields[target];
    fields[target] = tmp;
    state.session.providerEdits = state.session.generatedSuggestion;
    render();
  }

  function severityClass(severity) {
    if (severity === "high") return "afb-warn-high";
    if (severity === "medium") return "afb-warn-medium";
    return "afb-warn-info";
  }

  function inputFormHtml() {
    const unavailable = state.status && state.status.available === false;
    return `
      <div class="afb-card">
        <div class="afb-card-header">
          <div>
            <p class="eyebrow">AI Form Builder</p>
            <h3>Describe or paste a childcare form</h3>
            <p class="muted-copy">Generate a structured editable draft for review. AI never publishes, sends, signs, or overwrites a form.</p>
          </div>
          <span class="afb-badge">${escapeHtml(state.status?.label || state.status?.message || "Checking availability…")}</span>
        </div>

        ${unavailable ? `
          <div class="fc-alert error" role="alert">${escapeHtml(state.status.message || "AI Form Builder is unavailable.")}</div>
        ` : `
          <div class="afb-banner" role="status">Testing Preview — AI Not Called. Showing deterministic fake suggestions only.</div>

          <label class="afb-label" for="afb-prompt">Describe the form you need</label>
          <textarea id="afb-prompt" class="afb-textarea" data-afb-field="prompt" rows="3" maxlength="4000" placeholder="Example: I need a medication authorization form for parents to complete before we can give medicine at the program.">${escapeHtml(state.form.prompt)}</textarea>

          <label class="afb-label" for="afb-paste">Or paste an existing form / policy text</label>
          <textarea id="afb-paste" class="afb-textarea" data-afb-field="pastedText" rows="6" maxlength="20000" placeholder="Paste form or policy text here. PDF, Word, image, and scanned-form extraction will connect later.">${escapeHtml(state.form.pastedText)}</textarea>

          <div class="afb-grid">
            <label class="afb-label">Category
              <select data-afb-field="category">
                ${state.categories.map((cat) => `<option value="${escapeHtml(cat.id)}"${state.form.category === cat.id ? " selected" : ""}>${escapeHtml(cat.label)}</option>`).join("")}
              </select>
            </label>
            <label class="afb-label">Intended recipient
              <select data-afb-field="intendedRecipient">
                ${["guardian", "child", "staff", "classroom", "program", "family"].map((value) => `<option value="${value}"${state.form.intendedRecipient === value ? " selected" : ""}>${escapeHtml(labelize(value))}</option>`).join("")}
              </select>
            </label>
            <label class="afb-label">File under
              <select data-afb-field="filingDestination">
                ${["child", "staff", "classroom", "program"].map((value) => `<option value="${value}"${state.form.filingDestination === value ? " selected" : ""}>${escapeHtml(labelize(value))} profile</option>`).join("")}
              </select>
            </label>
          </div>

          <fieldset class="afb-fieldset">
            <legend>This form involves</legend>
            ${[
              ["involvesChild", "Child"],
              ["involvesGuardian", "Guardian / family"],
              ["involvesStaff", "Staff"],
              ["involvesClassroom", "Classroom"],
              ["involvesProgram", "Program"],
            ].map(([key, label]) => `
              <label class="afb-check"><input type="checkbox" data-afb-check="${key}"${state.form[key] ? " checked" : ""} /> ${label}</label>
            `).join("")}
          </fieldset>

          <fieldset class="afb-fieldset">
            <legend>Also suggest</legend>
            ${[
              ["requestSignatures", "Signatures"],
              ["requestInitials", "Initials"],
              ["requestAcknowledgments", "Acknowledgments"],
              ["requestDates", "Dates"],
              ["requestAttachments", "Attachments (notes for now)"],
              ["requestConditionalQuestions", "Conditional questions"],
            ].map(([key, label]) => `
              <label class="afb-check"><input type="checkbox" data-afb-check="${key}"${state.form[key] ? " checked" : ""} /> ${label}</label>
            `).join("")}
          </fieldset>

          <div class="afb-actions">
            <button type="button" class="primary-button" data-afb-generate ${state.generating ? "disabled" : ""}>${state.generating ? "Generating…" : "Generate Draft Suggestions"}</button>
          </div>
          <p class="muted-copy">You will review every suggested section and field before saving. Nothing is published automatically.</p>
        `}
      </div>
    `;
  }

  function reviewHtml() {
    const session = state.session;
    if (!session) return "";
    const suggestion = session.generatedSuggestion || {};
    const review = session.review || { warnings: [], recommendations: [] };
    const accepted = session.status === "accepted" && session.acceptedFormId;
    return `
      <div class="afb-card afb-review">
        <div class="afb-card-header">
          <div>
            <p class="eyebrow">Review suggestions</p>
            <h3>${escapeHtml(suggestion.title || "Untitled draft")}</h3>
            <p class="muted-copy">${escapeHtml(suggestion.description || "")}</p>
          </div>
          <span class="afb-badge">${escapeHtml(session.label || "Testing Preview — AI Not Called.")}</span>
        </div>

        <div class="afb-meta-row">
          <span>${escapeHtml(labelize(suggestion.category || ""))}</span>
          <span>Recipient: ${escapeHtml(labelize(suggestion.intendedRecipient || ""))}</span>
          <span>File under: ${escapeHtml(labelize(suggestion.filingDestination || ""))}</span>
          <span>${(suggestion.sections || []).length} sections</span>
        </div>

        <div class="afb-legal" role="note">
          <strong>Provider responsibility:</strong> ${escapeHtml(review.legalReminder || "You are responsible for verifying licensing and legal requirements. An AI-generated form is never legally compliant by itself.")}

        </div>

        ${(review.warnings || []).length ? `
          <div class="afb-warnings">
            <h4>Review before saving</h4>
            <ul>
              ${review.warnings.map((warn) => `<li class="${severityClass(warn.severity)}"><strong>${escapeHtml(labelize(warn.severity || "info"))}:</strong> ${escapeHtml(warn.message)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}

        ${(review.recommendations || []).length ? `
          <div class="afb-recommendations">
            <h4>Suggestions</h4>
            <ul>
              ${review.recommendations.map((row) => `<li>${escapeHtml(row.message)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}

        <div class="afb-instructions">
          <p><strong>Provider instructions:</strong> ${escapeHtml(suggestion.providerInstructions || "—")}</p>
          <p><strong>Family / staff instructions:</strong> ${escapeHtml(suggestion.familyInstructions || "—")}</p>
          ${suggestion.reviewReminder ? `<p><strong>Review reminder:</strong> ${escapeHtml(suggestion.reviewReminder)}</p>` : ""}
          ${suggestion.expirationReminder ? `<p><strong>Expiration reminder:</strong> ${escapeHtml(suggestion.expirationReminder)}</p>` : ""}
        </div>

        <button type="button" class="ghost-button" data-afb-toggle-compare>${state.compareOpen ? "Hide original text" : "Compare with original text"}</button>
        ${state.compareOpen ? `
          <div class="afb-compare">
            <div>
              <h4>Your original description / paste</h4>
              <pre>${escapeHtml(session.originalPrompt || "(none)")}${session.originalPastedText ? `\n\n--- Pasted text ---\n${session.originalPastedText}` : ""}</pre>
            </div>
            <div>
              <h4>Generated structure</h4>
              <pre>${escapeHtml(`Title: ${suggestion.title || ""}\nSections: ${(suggestion.sections || []).map((sec) => sec.title).join(", ")}\nFields: ${(suggestion.sections || []).reduce((sum, sec) => sum + (sec.fields || []).length, 0)}`)}</pre>
            </div>
          </div>
        ` : ""}

        <div class="afb-sections">
          ${(suggestion.sections || []).map((section, sectionIndex) => `
            <section class="afb-section">
              <h4>${escapeHtml(section.title || "Section")}</h4>
              ${section.description ? `<p class="muted-copy">${escapeHtml(section.description)}</p>` : ""}
              <ul class="afb-field-list">
                ${(section.fields || []).map((field, fieldIndex) => `
                  <li>
                    <div>
                      <strong>${escapeHtml(field.label || "Untitled field")}</strong>
                      ${field.required ? `<span class="afb-required">Required</span>` : ""}
                      <div class="muted-copy">${escapeHtml(labelize(field.type))}${field.conditionalOn ? " · Conditional" : ""}${field.helpText ? ` — ${escapeHtml(field.helpText)}` : ""}</div>
                    </div>
                    ${accepted ? "" : `
                      <div class="afb-field-actions">
                        <button type="button" class="ghost-button" data-afb-move-field data-section="${sectionIndex}" data-index="${fieldIndex}" data-dir="up" aria-label="Move field up">Up</button>
                        <button type="button" class="ghost-button" data-afb-move-field data-section="${sectionIndex}" data-index="${fieldIndex}" data-dir="down" aria-label="Move field down">Down</button>
                        <button type="button" class="ghost-button danger" data-afb-remove-field data-section="${sectionIndex}" data-index="${fieldIndex}">Remove</button>
                      </div>
                    `}
                  </li>
                `).join("")}
              </ul>
            </section>
          `).join("")}
        </div>

        <div class="afb-actions">
          ${accepted ? `
            <button type="button" class="primary-button" data-afb-open-builder>Open Draft in Form Builder</button>
            <button type="button" class="ghost-button" data-afb-regenerate>Regenerate into a New Session</button>
            <button type="button" class="ghost-button" data-afb-start-over>Start Over</button>
          ` : `
            <button type="button" class="primary-button" data-afb-accept ${state.accepting ? "disabled" : ""}>${state.accepting ? "Saving…" : "Save as Program Draft"}</button>
            <button type="button" class="ghost-button" data-afb-regenerate ${state.generating ? "disabled" : ""}>Regenerate Suggestions</button>
            <button type="button" class="ghost-button" data-afb-start-over>Start Over</button>
          `}
        </div>
        <p class="muted-copy">Saving creates a new program-owned draft with a permanent ID. You can edit, reorder, and add fields in the Form Builder. Publishing stays manual.</p>
      </div>
    `;
  }

  function render() {
    const root = mountEl();
    if (!root) return;
    root.innerHTML = `
      ${state.error ? `<div class="fc-alert error" role="alert">${escapeHtml(state.error)}</div>` : ""}
      ${state.message ? `<div class="fc-alert success" role="status">${escapeHtml(state.message)}</div>` : ""}
      ${state.statusLoading ? `<div class="fc-loading">Checking AI Form Builder…</div>` : ""}
      ${state.session ? reviewHtml() : inputFormHtml()}
    `;
    bind(root);
  }

  function bind(root) {
    if (root.dataset.afbBound === "true") return;
    root.dataset.afbBound = "true";

    root.addEventListener("input", (event) => {
      const field = event.target.closest("[data-afb-field]");
      if (field) {
        state.form[field.dataset.afbField] = field.value;
      }
    });
    root.addEventListener("change", (event) => {
      const field = event.target.closest("[data-afb-field]");
      if (field) {
        state.form[field.dataset.afbField] = field.value;
        return;
      }
      const check = event.target.closest("[data-afb-check]");
      if (check) {
        state.form[check.dataset.afbCheck] = check.checked;
      }
    });
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-afb-generate]")) { generate().catch(() => {}); return; }
      if (event.target.closest("[data-afb-regenerate]")) { regenerate().catch(() => {}); return; }
      if (event.target.closest("[data-afb-accept]")) { acceptDraft().catch(() => {}); return; }
      if (event.target.closest("[data-afb-start-over]")) { startOver(); return; }
      if (event.target.closest("[data-afb-toggle-compare]")) { state.compareOpen = !state.compareOpen; render(); return; }
      if (event.target.closest("[data-afb-open-builder]")) {
        if (state.session?.acceptedFormId) openAcceptedInBuilder(state.session.acceptedFormId);
        return;
      }
      const removeBtn = event.target.closest("[data-afb-remove-field]");
      if (removeBtn) {
        removeSuggestedField(Number(removeBtn.dataset.section), Number(removeBtn.dataset.index));
        return;
      }
      const moveBtn = event.target.closest("[data-afb-move-field]");
      if (moveBtn) {
        moveSuggestedField(Number(moveBtn.dataset.section), Number(moveBtn.dataset.index), moveBtn.dataset.dir);
      }
    });
  }

  global.renderAiFormBuilderUI = function renderAiFormBuilderUI() {
    render();
    if (!state.status) loadStatus().catch(() => {});
  };
})(window);
