/**
 * Phase 6 Forms Center admin UI: Send/Assign, Responses Dashboard, and
 * Response Detail/Review. Mounts inside the existing Forms Center shell
 * (#view-forms-center) on the "Responses" tab, and is invoked from a form
 * card's "Send / Assign" button on any other tab.
 *
 * Admin preview only. No email/SMS is sent — assignments and testing links
 * are the only delivery mechanism available in this phase.
 */
(function initFormResponsesUI(global) {
  const API = "/api/forms-center";
  const state = {
    directory: null,
    assignModal: null, // { formId, formTitle, recipientType, ... }
    assignSubmitting: false,
    dashboard: null,
    dashboardLoading: false,
    filter: { q: "", view: "", status: "", formId: "", category: "", childId: "", classroomId: "" },
    selectedIds: new Set(),
    detail: null, // full response detail payload
    detailLoading: false,
    testingLinkResult: null,
    error: "",
    message: "",
    correctionDraftMessage: "",
    voidDraftReason: "",
    noteDraft: "",
    medEntryDraft: null,
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

  async function authHeaders() {
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    if (!token || typeof hasAdminFullAccess !== "function" || !hasAdminFullAccess()) {
      throw new Error("Verified admin unlock is required.");
    }
    return { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  async function api(method, path, body) {
    const headers = await authHeaders();
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

  function mountEl() {
    return document.querySelector("#fc-responses-mount");
  }

  function render() {
    const root = mountEl();
    if (!root) return;
    root.innerHTML = `
      ${state.error ? `<div class="fc-alert error" role="alert">${escapeHtml(state.error)}</div>` : ""}
      ${state.message ? `<div class="fc-alert success" role="status">${escapeHtml(state.message)}</div>` : ""}
      ${dashboardHtml()}
      ${state.assignModal ? assignModalHtml() : ""}
      ${state.detail ? detailModalHtml() : ""}
    `;
    bind(root);
  }

  // ── Dashboard ────────────────────────────────────────────────────────────

  async function refreshDashboard() {
    state.dashboardLoading = true;
    render();
    try {
      const params = new URLSearchParams();
      Object.entries(state.filter).forEach(([key, value]) => { if (value) params.set(key, value); });
      const data = await api("GET", `${API}/responses?${params}`);
      state.dashboard = data;
    } catch (error) {
      state.error = error.message || "Could not load responses.";
    } finally {
      state.dashboardLoading = false;
      render();
    }
  }

  async function loadDirectory() {
    try {
      state.directory = await api("GET", `${API}/recipients-directory`);
    } catch {
      state.directory = { children: [], staff: [], classrooms: [] };
    }
  }

  const STATUS_CARD_ORDER = [
    ["not_started", "Not Started"],
    ["in_progress", "In Progress"],
    ["submitted", "Submitted"],
    ["under_review", "Under Review"],
    ["returned_for_correction", "Returned"],
    ["approved", "Approved"],
    ["expired", "Expired"],
    ["archived", "Archived"],
    ["voided", "Voided"],
  ];

  const VIEW_OPTIONS = [
    ["", "All"],
    ["due_soon", "Due Soon"],
    ["overdue", "Overdue"],
    ["recently_submitted", "Recently Submitted"],
    ["needs_review", "Needs Review"],
    ["returned", "Returned for Correction"],
    ["completed", "Completed"],
    ["archived", "Archived"],
  ];

  function statusPillClass(status) {
    if (["approved"].includes(status)) return "frd-pill-good";
    if (["returned_for_correction", "voided", "expired"].includes(status)) return "frd-pill-warn";
    if (["submitted", "under_review", "corrected_and_resubmitted"].includes(status)) return "frd-pill-info";
    return "frd-pill-neutral";
  }

  function dashboardHtml() {
    const dash = state.dashboard;
    const counts = dash?.counts || {};
    return `
      <section class="fc-panel frd-dashboard">
        <div class="fc-hero">
          <div>
            <p class="eyebrow">Responses</p>
            <h2>Assignments and Responses</h2>
            <p>Track every form sent to a child, guardian, staff member, classroom, or the whole program. Fake preview data only &mdash; no email or SMS is sent.</p>
          </div>
        </div>
        <div class="frd-status-cards">
          ${STATUS_CARD_ORDER.map(([key, label]) => `
            <button type="button" class="frd-status-card ${state.filter.status === key ? "is-active" : ""}" data-frd-status-card="${escapeHtml(key)}">
              <strong>${escapeHtml(counts[key] || 0)}</strong>
              <span>${escapeHtml(label)}</span>
            </button>
          `).join("")}
        </div>
        <div class="frd-toolbar">
          <label>
            Search
            <input type="search" value="${escapeHtml(state.filter.q)}" data-frd-filter="q" placeholder="Search by form, child, or recipient" />
          </label>
          <label>
            View
            <select data-frd-filter="view">
              ${VIEW_OPTIONS.map(([id, label]) => `<option value="${escapeHtml(id)}"${state.filter.view === id ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
            </select>
          </label>
          <label>
            Classroom
            <select data-frd-filter="classroomId">
              <option value="">All classrooms</option>
              ${(state.directory?.classrooms || []).map((room) => `<option value="${escapeHtml(room.id)}"${state.filter.classroomId === room.id ? " selected" : ""}>${escapeHtml(room.name)}</option>`).join("")}
            </select>
          </label>
          <label>
            Child
            <select data-frd-filter="childId">
              <option value="">All children</option>
              ${(state.directory?.children || []).map((child) => `<option value="${escapeHtml(child.id)}"${state.filter.childId === child.id ? " selected" : ""}>${escapeHtml(child.displayName)}</option>`).join("")}
            </select>
          </label>
          <button type="button" class="primary-button" data-frd-search>Search</button>
          <button type="button" class="ghost-button" data-frd-clear-filters>Clear</button>
        </div>
        <div class="frd-bulk-bar${state.selectedIds.size ? " is-visible" : ""}">
          <span>${state.selectedIds.size} selected</span>
          <button type="button" class="ghost-button" data-frd-bulk="mark_under_review">Mark for Review</button>
          <button type="button" class="ghost-button" data-frd-bulk="archive">Archive</button>
        </div>
        ${state.dashboardLoading ? `<div class="fc-loading">Loading responses...</div>` : ""}
        ${responsesListHtml(dash?.responses || [])}
      </section>
    `;
  }

  function responsesListHtml(rows) {
    if (!rows.length) {
      return `
        <div class="fc-panel frd-empty-state">
          <h3>No responses match this view</h3>
          <p class="muted-copy">Try clearing filters, or send a form from My Forms / Program Templates to get started.</p>
        </div>
      `;
    }
    return `
      <div class="frd-response-list">
        ${rows.map((row) => `
          <article class="frd-response-row">
            <label class="frd-select-check">
              <input type="checkbox" data-frd-select="${escapeHtml(row.id)}" ${state.selectedIds.has(row.id) ? "checked" : ""} aria-label="Select response" />
            </label>
            <div class="frd-response-main">
              <div class="frd-response-title-row">
                <strong>${escapeHtml(row.formTitle)}</strong>
                <span class="frd-pill ${statusPillClass(row.status)}">${escapeHtml(row.statusLabel)}</span>
                ${row.overdue ? `<span class="frd-pill frd-pill-warn">Overdue</span>` : ""}
                ${row.newerVersionAvailable ? `<span class="frd-pill frd-pill-info">Newer form version available</span>` : ""}
              </div>
              <div class="frd-response-meta">
                <span>${escapeHtml(labelize(row.recipientType))}: ${escapeHtml(row.recipientLabel)}</span>
                ${row.relatedChildName ? `<span>Child: ${escapeHtml(row.relatedChildName)}</span>` : ""}
                ${row.dueDate ? `<span>Due ${escapeHtml(row.dueDate)}</span>` : ""}
                <span>${escapeHtml(row.progress.completed)}/${escapeHtml(row.progress.total)} required fields</span>
                <span>${escapeHtml(row.signatureCount)} signature${row.signatureCount === 1 ? "" : "s"}</span>
                ${row.awaitingProviderCountersignature ? `<span class="frd-pill frd-pill-warn">Awaiting provider signature</span>` : ""}
              </div>
            </div>
            <div class="frd-response-actions">
              <button type="button" class="ghost-button" data-frd-open="${escapeHtml(row.id)}">Open</button>
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  // ── Assignment (Send / Assign) modal ────────────────────────────────────

  function openAssignModal(formId, formTitle) {
    state.assignModal = {
      formId, formTitle,
      recipientType: "child",
      childIds: [], allVerifiedGuardiansForChild: false, relatedChildId: "",
      guardianIds: [], staffIds: [], classroomIds: [],
      dueDate: "", instructions: "", required: true, reusable: false,
      requiredSignatureRoles: ["parent_guardian"], requireProviderCountersignature: false,
      editableAfterSubmission: false, reminderEnabled: false, reminderDaysBefore: 3,
      versionPolicy: "keep_original_version",
    };
    render();
    if (!state.directory) loadDirectory().then(render);
  }

  function closeAssignModal() {
    state.assignModal = null;
    render();
  }

  function assignModalHtml() {
    const m = state.assignModal;
    const directory = state.directory || { children: [], staff: [], classrooms: [] };
    return `
      <div class="fcl-modal-backdrop" data-frd-modal-backdrop>
        <div class="fcl-modal frd-assign-modal" role="dialog" aria-modal="true" aria-labelledby="frd-assign-title">
          <h3 id="frd-assign-title">Send or Assign "${escapeHtml(m.formTitle)}"</h3>
          <label>
            Recipient type
            <select data-frd-assign-field="recipientType">
              <option value="child"${m.recipientType === "child" ? " selected" : ""}>One or more children</option>
              <option value="guardian"${m.recipientType === "guardian" ? " selected" : ""}>Guardian(s)</option>
              <option value="staff"${m.recipientType === "staff" ? " selected" : ""}>One or more staff members</option>
              <option value="classroom"${m.recipientType === "classroom" ? " selected" : ""}>One or more classrooms</option>
              <option value="program"${m.recipientType === "program" ? " selected" : ""}>Entire program</option>
            </select>
          </label>
          ${assignRecipientPickerHtml(m, directory)}
          <div class="fc-builder-grid">
            <label>
              Due date
              <input type="date" value="${escapeHtml(m.dueDate)}" data-frd-assign-field="dueDate" />
            </label>
            <label class="fc-check-label">
              <input type="checkbox" ${m.required ? "checked" : ""} data-frd-assign-check="required" />
              Required
            </label>
            <label class="fc-check-label">
              <input type="checkbox" ${m.reusable ? "checked" : ""} data-frd-assign-check="reusable" />
              Reusable form
            </label>
            <label class="fc-check-label">
              <input type="checkbox" ${m.requireProviderCountersignature ? "checked" : ""} data-frd-assign-check="requireProviderCountersignature" />
              Require provider countersignature
            </label>
            <label class="fc-check-label">
              <input type="checkbox" ${m.editableAfterSubmission ? "checked" : ""} data-frd-assign-check="editableAfterSubmission" />
              Allow edits after submission
            </label>
            <label class="fc-check-label">
              <input type="checkbox" ${m.reminderEnabled ? "checked" : ""} data-frd-assign-check="reminderEnabled" />
              Reminder (stored only &mdash; not sent in this phase)
            </label>
          </div>
          <label>
            Provider instructions (optional)
            <textarea data-frd-assign-field="instructions">${escapeHtml(m.instructions)}</textarea>
          </label>
          <fieldset class="frd-signature-roles">
            <legend>Required signatures</legend>
            <label class="fc-check-label"><input type="checkbox" ${m.requiredSignatureRoles.includes("parent_guardian") ? "checked" : ""} data-frd-assign-signature-role="parent_guardian" /> Parent / guardian</label>
            <label class="fc-check-label"><input type="checkbox" ${m.requiredSignatureRoles.includes("staff") ? "checked" : ""} data-frd-assign-signature-role="staff" /> Staff</label>
            <label class="fc-check-label"><input type="checkbox" ${m.requiredSignatureRoles.includes("provider") ? "checked" : ""} data-frd-assign-signature-role="provider" /> Provider</label>
          </fieldset>
          <label>
            If a newer form version is published before this is started
            <select data-frd-assign-field="versionPolicy">
              <option value="keep_original_version"${m.versionPolicy === "keep_original_version" ? " selected" : ""}>Keep this assignment on its original version</option>
              <option value="upgrade_to_latest"${m.versionPolicy === "upgrade_to_latest" ? " selected" : ""}>Upgrade unstarted assignments to the newest version</option>
            </select>
          </label>
          <div class="fc-card-actions">
            <button type="button" class="ghost-button" data-frd-cancel-assign>Cancel</button>
            <button type="button" class="primary-button" data-frd-submit-assign ${state.assignSubmitting ? "disabled" : ""}>${state.assignSubmitting ? "Sending…" : "Create Assignment"}</button>
          </div>
        </div>
      </div>
    `;
  }

  function assignRecipientPickerHtml(m, directory) {
    if (m.recipientType === "child") {
      return `
        <fieldset class="frd-recipient-picker">
          <legend>Select one or more children</legend>
          ${(directory.children || []).map((child) => `
            <label class="fc-check-label"><input type="checkbox" ${m.childIds.includes(child.id) ? "checked" : ""} data-frd-assign-recipient="${escapeHtml(child.id)}" /> ${escapeHtml(child.displayName)}</label>
          `).join("") || `<p class="muted-copy">No children available yet.</p>`}
        </fieldset>
      `;
    }
    if (m.recipientType === "guardian") {
      return `
        <label>
          Related child
          <select data-frd-assign-field="relatedChildId">
            <option value="">Select a child</option>
            ${(directory.children || []).map((child) => `<option value="${escapeHtml(child.id)}"${m.relatedChildId === child.id ? " selected" : ""}>${escapeHtml(child.displayName)}</option>`).join("")}
          </select>
        </label>
        <label class="fc-check-label">
          <input type="checkbox" ${m.allVerifiedGuardiansForChild ? "checked" : ""} data-frd-assign-check="allVerifiedGuardiansForChild" />
          Send to all verified guardians connected to this child
        </label>
        ${!m.allVerifiedGuardiansForChild ? `
          <fieldset class="frd-recipient-picker">
            <legend>Or choose specific guardians</legend>
            ${(directory.children.find((c) => c.id === m.relatedChildId)?.guardians || []).map((g) => `
              <label class="fc-check-label">
                <input type="checkbox" ${m.guardianIds.includes(g.guardianId) ? "checked" : ""} ${g.verified ? "" : "disabled"} data-frd-assign-recipient="${escapeHtml(g.guardianId)}" />
                ${escapeHtml(g.displayName)} (${escapeHtml(labelize(g.relationshipLabel))})${!g.verified ? " — restricted / not verified" : ""}
              </label>
            `).join("") || `<p class="muted-copy">Select a child above to see connected guardians.</p>`}
          </fieldset>
        ` : ""}
      `;
    }
    if (m.recipientType === "staff") {
      return `
        <fieldset class="frd-recipient-picker">
          <legend>Select one or more staff members</legend>
          ${(directory.staff || []).map((member) => `
            <label class="fc-check-label"><input type="checkbox" ${m.staffIds.includes(member.id) ? "checked" : ""} data-frd-assign-recipient="${escapeHtml(member.id)}" /> ${escapeHtml(member.displayName)} (${escapeHtml(labelize(member.role))})</label>
          `).join("") || `<p class="muted-copy">No staff available yet.</p>`}
        </fieldset>
      `;
    }
    if (m.recipientType === "classroom") {
      return `
        <fieldset class="frd-recipient-picker">
          <legend>Select one or more classrooms</legend>
          ${(directory.classrooms || []).map((room) => `
            <label class="fc-check-label"><input type="checkbox" ${m.classroomIds.includes(room.id) ? "checked" : ""} data-frd-assign-recipient="${escapeHtml(room.id)}" /> ${escapeHtml(room.name)}</label>
          `).join("") || `<p class="muted-copy">No classrooms available yet.</p>`}
        </fieldset>
      `;
    }
    return `<p class="muted-copy">This form will be assigned once to the entire program.</p>`;
  }

  function currentRecipientIds(m) {
    if (m.recipientType === "child") return m.childIds;
    if (m.recipientType === "guardian") return m.guardianIds;
    if (m.recipientType === "staff") return m.staffIds;
    if (m.recipientType === "classroom") return m.classroomIds;
    return [];
  }

  async function submitAssignment() {
    const m = state.assignModal;
    if (!m || state.assignSubmitting) return;
    if (m.recipientType === "guardian" && !m.relatedChildId) {
      state.error = "Choose the related child before assigning to a guardian.";
      render();
      return;
    }
    state.assignSubmitting = true;
    render();
    try {
      const body = {
        formId: m.formId,
        recipientType: m.recipientType,
        recipientIds: currentRecipientIds(m),
        allVerifiedGuardiansForChild: m.recipientType === "guardian" ? m.allVerifiedGuardiansForChild : false,
        relatedChildId: m.recipientType === "guardian" ? m.relatedChildId : "",
        dueDate: m.dueDate,
        instructions: m.instructions,
        required: m.required,
        reusable: m.reusable,
        requiredSignatureRoles: m.requiredSignatureRoles,
        requireProviderCountersignature: m.requireProviderCountersignature,
        editableAfterSubmission: m.editableAfterSubmission,
        reminderEnabled: m.reminderEnabled,
        reminderDaysBefore: m.reminderDaysBefore,
        versionPolicy: m.versionPolicy,
      };
      const data = await api("POST", `${API}/assignments`, body);
      state.message = `Created ${data.count} assignment${data.count === 1 ? "" : "s"}. Each recipient has a separate, private response.`;
      state.assignModal = null;
      await refreshDashboard();
    } catch (error) {
      state.error = error.message || "Could not create this assignment.";
    } finally {
      state.assignSubmitting = false;
      render();
    }
  }

  // ── Response detail / review ────────────────────────────────────────────

  async function openDetail(responseId) {
    state.detailLoading = true;
    state.testingLinkResult = null;
    state.correctionDraftMessage = "";
    state.voidDraftReason = "";
    state.noteDraft = "";
    render();
    try {
      const data = await api("GET", `${API}/responses/${encodeURIComponent(responseId)}`);
      state.detail = data;
    } catch (error) {
      state.error = error.message || "Could not open this response.";
    } finally {
      state.detailLoading = false;
      render();
    }
  }

  function closeDetail() {
    state.detail = null;
    render();
  }

  async function refreshDetail() {
    if (!state.detail) return;
    const id = state.detail.response.id;
    const data = await api("GET", `${API}/responses/${encodeURIComponent(id)}`);
    state.detail = data;
  }

  async function performResponseAction(action, body) {
    const id = state.detail.response.id;
    try {
      await api("POST", `${API}/responses/${encodeURIComponent(id)}/${action}`, body || {});
      await refreshDetail();
      await refreshDashboard();
      state.message = "Updated.";
    } catch (error) {
      state.error = error.message || "That action could not be completed.";
    } finally {
      render();
    }
  }

  async function issueTestingLink() {
    const assignmentId = state.detail.response.assignment.id;
    try {
      const data = await api("POST", `${API}/assignments/${encodeURIComponent(assignmentId)}/testing-link/issue`, {});
      state.testingLinkResult = data;
      await refreshDetail();
    } catch (error) {
      state.error = error.message || "Could not issue a testing link.";
    } finally {
      render();
    }
  }

  async function revokeTestingLink() {
    const assignmentId = state.detail.response.assignment.id;
    try {
      await api("POST", `${API}/assignments/${encodeURIComponent(assignmentId)}/testing-link/revoke`, {});
      state.testingLinkResult = null;
      await refreshDetail();
      state.message = "Testing link revoked.";
    } catch (error) {
      state.error = error.message || "Could not revoke the testing link.";
    } finally {
      render();
    }
  }

  function detailModalHtml() {
    const detail = state.detail;
    const resp = detail.response;
    const assignment = resp.assignment;
    const isMedLog = /medication/i.test(resp.formTitle || "");
    return `
      <div class="fcl-modal-backdrop" data-frd-modal-backdrop>
        <div class="fcl-modal frd-detail-modal" role="dialog" aria-modal="true" aria-labelledby="frd-detail-title">
          <div class="fc-builder-header">
            <div>
              <p class="eyebrow">${escapeHtml(labelize(resp.recipientType))}: ${escapeHtml(resp.recipientLabel)}</p>
              <h3 id="frd-detail-title">${escapeHtml(resp.formTitle)}</h3>
              <span class="frd-pill ${statusPillClass(resp.status)}">${escapeHtml(resp.statusLabel)}</span>
              ${resp.newerVersionAvailable ? `<span class="frd-pill frd-pill-info">A newer form version is available</span>` : ""}
            </div>
            <button type="button" class="ghost-button" data-frd-close-detail>Close</button>
          </div>
          ${resp.relatedChildName ? `<p><strong>Child:</strong> ${escapeHtml(resp.relatedChildName)}</p>` : ""}
          ${assignment?.dueDate ? `<p><strong>Due:</strong> ${escapeHtml(assignment.dueDate)}</p>` : ""}
          ${resp.returnMessage ? `<div class="fc-alert error">Return message: ${escapeHtml(resp.returnMessage)}</div>` : ""}
          ${resp.voidReason ? `<div class="fc-alert error">Voided: ${escapeHtml(resp.voidReason)}</div>` : ""}

          <h4>Signatures</h4>
          ${(detail.response.signatures || []).length ? `
            <ul class="frd-signature-list">
              ${detail.response.signatures.map((sig) => `
                <li class="${sig.invalidatedAt ? "is-invalidated" : ""}">
                  ${escapeHtml(labelize(sig.signerRole))}: ${escapeHtml(sig.signerName)} &mdash; ${escapeHtml(sig.signedAt)}
                  ${sig.invalidatedAt ? ` <em>(invalidated: ${escapeHtml(sig.invalidatedReason)})</em>` : ""}
                </li>
              `).join("")}
            </ul>
          ` : `<p class="muted-copy">No signatures yet.</p>`}
          ${assignment?.requireProviderCountersignature && resp.awaitingProviderCountersignature ? `<p class="fcl-review-reminder">Awaiting provider countersignature before this can be approved.</p>` : ""}

          <h4>Testing Link (Preview Only &mdash; Fake Data)</h4>
          <div class="frd-testing-link">
            ${state.testingLinkResult ? `
              <p class="fcl-review-reminder">Copy this link now &mdash; it is shown only once. <code class="frd-token-display">${escapeHtml(state.testingLinkResult.recipientPath)}</code></p>
              <button type="button" class="ghost-button" data-frd-copy-link="${escapeHtml(state.testingLinkResult.recipientPath)}">Copy Testing Link</button>
              <a class="ghost-button" href="${escapeHtml(state.testingLinkResult.recipientPath)}" target="_blank" rel="noopener">Open Testing Link</a>
            ` : `
              <p class="muted-copy">${assignment?.testingLinkIssued ? (assignment.testingLinkRevoked ? "Link revoked." : (assignment.testingLinkExpired ? "Link expired." : "A link has been issued. Regenerate to get a fresh copyable link.")) : "No testing link issued yet."}</p>
            `}
            <div class="fc-card-actions">
              <button type="button" class="ghost-button" data-frd-issue-link>${assignment?.testingLinkIssued ? "Regenerate Testing Link" : "Create Testing Link"}</button>
              ${assignment?.testingLinkIssued && !assignment.testingLinkRevoked ? `<button type="button" class="ghost-button danger" data-frd-revoke-link>Revoke Link</button>` : ""}
            </div>
          </div>

          <h4>Internal Notes</h4>
          ${(resp.internalNotes || []).map((note) => `<p class="frd-note">${escapeHtml(note.message)} <small>&mdash; ${escapeHtml(note.authorEmail)}, ${escapeHtml(note.createdAt)}</small></p>`).join("") || `<p class="muted-copy">No internal notes yet.</p>`}
          <label>
            Add an internal note
            <textarea data-frd-note-draft>${escapeHtml(state.noteDraft)}</textarea>
          </label>
          <button type="button" class="ghost-button" data-frd-add-note>Add Note</button>

          ${isMedLog ? medicationLogHtml(detail.medicationLog || []) : ""}

          <h4>Review Actions</h4>
          <div class="frd-review-actions">
            <button type="button" class="ghost-button" data-frd-action="mark-under-review">Mark Under Review</button>
            <button type="button" class="primary-button" data-frd-action="approve">Approve</button>
            <button type="button" class="ghost-button" data-frd-action="reopen">Reopen</button>
            <button type="button" class="ghost-button" data-frd-action="archive">Archive</button>
            <button type="button" class="ghost-button" data-frd-action="restore">Restore</button>
            <button type="button" class="ghost-button" data-frd-action="mark-expired">Mark Expired</button>
          </div>
          <label>
            Return-for-correction message
            <textarea data-frd-correction-draft>${escapeHtml(state.correctionDraftMessage)}</textarea>
          </label>
          <button type="button" class="ghost-button" data-frd-return-for-correction>Return for Correction</button>
          <label>
            Void reason (required)
            <textarea data-frd-void-draft>${escapeHtml(state.voidDraftReason)}</textarea>
          </label>
          <button type="button" class="ghost-button danger" data-frd-void>Void Response</button>
        </div>
      </div>
    `;
  }

  function medicationLogHtml(entries) {
    return `
      <h4>Medication Administration Log</h4>
      <p class="muted-copy">Recordkeeping only &mdash; not medical advice. Corrections never overwrite the original entry.</p>
      <div class="frd-med-log">
        ${entries.length ? entries.map((entry) => `
          <article class="frd-med-entry${entry.supersededByEntryId ? " is-superseded" : ""}">
            <strong>${escapeHtml(entry.medicationName)}</strong> &mdash; ${escapeHtml(labelize(entry.result))}
            <div>${escapeHtml(entry.logDate)} scheduled ${escapeHtml(entry.scheduledTime)}, given ${escapeHtml(entry.actualTime)} by ${escapeHtml(entry.administeredByName)}</div>
            ${entry.notes ? `<small>${escapeHtml(entry.notes)}</small>` : ""}
            ${entry.supersededByEntryId ? `<small class="frd-superseded-note">Corrected by a later entry &mdash; original preserved.</small>` : ""}
          </article>
        `).join("") : `<p class="muted-copy">No medication log entries recorded yet.</p>`}
      </div>
    `;
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  function bind(root) {
    if (root.dataset.frdBound === "true") return;
    root.dataset.frdBound = "true";
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-frd-modal-backdrop]") === event.target) {
        if (state.assignModal) closeAssignModal();
        if (state.detail) closeDetail();
        return;
      }
      const statusCard = event.target.closest("[data-frd-status-card]");
      if (statusCard) {
        state.filter.status = state.filter.status === statusCard.dataset.frdStatusCard ? "" : statusCard.dataset.frdStatusCard;
        refreshDashboard().catch(() => {});
        return;
      }
      if (event.target.closest("[data-frd-search]")) { refreshDashboard().catch(() => {}); return; }
      if (event.target.closest("[data-frd-clear-filters]")) {
        state.filter = { q: "", view: "", status: "", formId: "", category: "", childId: "", classroomId: "" };
        refreshDashboard().catch(() => {});
        return;
      }
      const bulkBtn = event.target.closest("[data-frd-bulk]");
      if (bulkBtn) {
        api("POST", `${API}/responses/bulk`, { ids: [...state.selectedIds], action: bulkBtn.dataset.frdBulk })
          .then(() => { state.selectedIds.clear(); state.message = "Bulk action complete."; return refreshDashboard(); })
          .catch((error) => { state.error = error.message || "Bulk action failed."; render(); });
        return;
      }
      const openBtn = event.target.closest("[data-frd-open]");
      if (openBtn) { openDetail(openBtn.dataset.frdOpen).catch(() => {}); return; }
      if (event.target.closest("[data-frd-close-detail]")) { closeDetail(); return; }
      if (event.target.closest("[data-frd-cancel-assign]")) { closeAssignModal(); return; }
      if (event.target.closest("[data-frd-submit-assign]")) { submitAssignment().catch(() => {}); return; }
      const recipientCheckbox = event.target.closest("[data-frd-assign-recipient]");
      if (recipientCheckbox) {
        const id = recipientCheckbox.dataset.frdAssignRecipient;
        const m = state.assignModal;
        const listKey = m.recipientType === "child" ? "childIds" : m.recipientType === "guardian" ? "guardianIds" : m.recipientType === "staff" ? "staffIds" : "classroomIds";
        const list = m[listKey];
        m[listKey] = list.includes(id) ? list.filter((existing) => existing !== id) : [...list, id];
        render();
        return;
      }
      const sigRole = event.target.closest("[data-frd-assign-signature-role]");
      if (sigRole) {
        const role = sigRole.dataset.frdAssignSignatureRole;
        const m = state.assignModal;
        m.requiredSignatureRoles = m.requiredSignatureRoles.includes(role)
          ? m.requiredSignatureRoles.filter((r) => r !== role)
          : [...m.requiredSignatureRoles, role];
        render();
        return;
      }
      const linkCopyBtn = event.target.closest("[data-frd-copy-link]");
      if (linkCopyBtn) {
        const url = `${window.location.origin}${linkCopyBtn.dataset.frdCopyLink}`;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).catch(() => {});
        state.message = "Testing link copied.";
        render();
        return;
      }
      if (event.target.closest("[data-frd-issue-link]")) { issueTestingLink().catch(() => {}); return; }
      if (event.target.closest("[data-frd-revoke-link]")) { revokeTestingLink().catch(() => {}); return; }
      if (event.target.closest("[data-frd-add-note]")) {
        if (!state.noteDraft.trim()) return;
        performResponseAction("note", { message: state.noteDraft }).then(() => { state.noteDraft = ""; render(); }).catch(() => {});
        return;
      }
      const actionBtn = event.target.closest("[data-frd-action]");
      if (actionBtn) { performResponseAction(actionBtn.dataset.frdAction, {}).catch(() => {}); return; }
      if (event.target.closest("[data-frd-return-for-correction]")) {
        if (!state.correctionDraftMessage.trim()) { state.error = "A correction message is required."; render(); return; }
        performResponseAction("return-for-correction", { message: state.correctionDraftMessage }).then(() => { state.correctionDraftMessage = ""; render(); }).catch(() => {});
        return;
      }
      if (event.target.closest("[data-frd-void]")) {
        if (!state.voidDraftReason.trim()) { state.error = "A void reason is required."; render(); return; }
        performResponseAction("void", { reason: state.voidDraftReason }).then(() => { state.voidDraftReason = ""; render(); }).catch(() => {});
        return;
      }
    });

    root.addEventListener("input", (event) => {
      const filter = event.target.closest("[data-frd-filter]");
      if (filter) { state.filter[filter.dataset.frdFilter] = filter.value; return; }
      const assignField = event.target.closest("[data-frd-assign-field]");
      if (assignField && state.assignModal) { state.assignModal[assignField.dataset.frdAssignField] = assignField.value; render(); return; }
      const assignCheck = event.target.closest("[data-frd-assign-check]");
      if (assignCheck && state.assignModal) { state.assignModal[assignCheck.dataset.frdAssignCheck] = assignCheck.checked; render(); return; }
      if (event.target.closest("[data-frd-note-draft]")) { state.noteDraft = event.target.value; return; }
      if (event.target.closest("[data-frd-correction-draft]")) { state.correctionDraftMessage = event.target.value; return; }
      if (event.target.closest("[data-frd-void-draft]")) { state.voidDraftReason = event.target.value; return; }
      const select = event.target.closest("select[data-frd-select]");
      void select;
    });

    root.addEventListener("change", (event) => {
      const filterSelect = event.target.closest("select[data-frd-filter]");
      if (filterSelect) { state.filter[filterSelect.dataset.frdFilter] = filterSelect.value; refreshDashboard().catch(() => {}); return; }
      const selectCheckbox = event.target.closest("[data-frd-select]");
      if (selectCheckbox) {
        const id = selectCheckbox.dataset.frdSelect;
        if (selectCheckbox.checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
        render();
      }
    });
  }

  global.renderFormResponsesDashboardUI = function renderFormResponsesDashboardUI() {
    render();
    if (!state.dashboard) refreshDashboard().catch(() => {});
    if (!state.directory) loadDirectory().catch(() => {});
  };

  global.openFormAssignmentModal = function openFormAssignmentModal(formId, formTitle) {
    openAssignModal(formId, formTitle);
  };
})(window);
