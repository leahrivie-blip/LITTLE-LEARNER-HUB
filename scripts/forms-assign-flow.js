/**
 * Wave 4 — Confirm & Send assignment workflow helpers (browser + Node).
 * One modular flow for Paperwork HQ / Template Library / Child / Staff / AI.
 * Does not create a second assignment system.
 */
(function formsAssignFlowModule(root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LlhFormsAssignFlow = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  "use strict";

  const STEPS = Object.freeze([
    "form",
    "recipients",
    "configure",
    "review",
    "success",
  ]);

  function newIdempotencyKey() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `send_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function createAssignFlowState(seed = {}) {
    return {
      open: false,
      step: "form",
      entryPoint: seed.entryPoint || "template_library",
      formSpec: seed.formSpec || null,
      templateId: seed.templateId || "",
      audience: seed.audience || "family", // family | staff
      mode: seed.mode || (seed.audience === "staff" ? "staff" : "children"),
      assignmentScope: seed.assignmentScope || "child", // child | household
      childIds: Array.isArray(seed.childIds) ? seed.childIds.map(String) : [],
      householdIds: Array.isArray(seed.householdIds) ? seed.householdIds.map(String) : [],
      classroomIds: Array.isArray(seed.classroomIds) ? seed.classroomIds.map(String) : [],
      staffEmails: Array.isArray(seed.staffEmails) ? seed.staffEmails.map(String) : [],
      dueDate: seed.dueDate || "",
      shareWithFamily: seed.shareWithFamily !== false,
      requiresSignature: seed.requiresSignature !== false,
      recipientSearch: "",
      preview: null,
      expected: null,
      result: null,
      error: "",
      sending: false,
      idempotencyKey: "",
      dirtyRev: 0,
    };
  }

  function touchState(state, patch = {}) {
    const next = { ...state, ...patch, dirtyRev: Number(state.dirtyRev || 0) + 1 };
    return next;
  }

  function groupChildrenByClassroom(children = [], classrooms = []) {
    const roomNames = new Map(
      (Array.isArray(classrooms) ? classrooms : []).map((room) => [
        String(room.id || room.classroomId || ""),
        String(room.name || room.title || room.id || "Classroom"),
      ]),
    );
    const groups = new Map();
    (Array.isArray(children) ? children : []).filter((c) => c && !c.archived).forEach((child) => {
      const roomId = String(child.classroomId || child.classroom || "unassigned");
      if (!groups.has(roomId)) {
        groups.set(roomId, {
          id: roomId,
          label: roomNames.get(roomId) || (roomId === "unassigned" ? "Unassigned" : roomId),
          children: [],
        });
      }
      groups.get(roomId).children.push(child);
    });
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  function householdSummary(households = [], childIds = []) {
    const wanted = new Set((Array.isArray(childIds) ? childIds : []).map(String));
    const list = Array.isArray(households) ? households : [];
    let count = 0;
    list.forEach((hh) => {
      const ids = Array.isArray(hh.childIds) && hh.childIds.length
        ? hh.childIds.map(String)
        : (Array.isArray(hh.children) ? hh.children.map((c) => String(c?.id || "")) : []);
      if (!wanted.size) return;
      if (ids.some((id) => wanted.has(id))) count += 1;
    });
    return count;
  }

  function filterBySearch(items, search, pickLabel) {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => String(pickLabel(item) || "").toLowerCase().includes(q));
  }

  function buildTargetPayload(state) {
    return {
      audience: state.audience,
      mode: state.mode,
      assignmentScope: state.audience === "staff" ? "staff" : state.assignmentScope,
      childIds: state.childIds,
      householdIds: state.householdIds,
      classroomIds: state.classroomIds,
      classroomId: state.classroomIds[0] || "",
      staffEmails: state.staffEmails,
    };
  }

  function buildConfirmPayload(state) {
    const formSpec = state.formSpec || {};
    return {
      idempotencyKey: state.idempotencyKey || newIdempotencyKey(),
      templateId: state.templateId || formSpec.templateId || "",
      formSpec: {
        title: formSpec.title,
        category: formSpec.category,
        body: formSpec.body || formSpec.bodyText || formSpec.draftText || "",
        draftText: formSpec.draftText || formSpec.body || formSpec.bodyText || "",
        fields: Array.isArray(formSpec.fields) ? formSpec.fields : [],
        templateId: state.templateId || formSpec.templateId || "",
        packFormId: formSpec.packFormId || "",
        resourceId: formSpec.resourceId || "",
        contentVersion: formSpec.contentVersion || 1,
        requiresSignature: state.requiresSignature !== false,
        notes: formSpec.notes || "Assigned via Confirm & Send.",
      },
      target: buildTargetPayload(state),
      dueDate: state.dueDate || "",
      shareWithFamily: state.audience === "staff" ? false : state.shareWithFamily === true,
      requiresSignature: state.requiresSignature !== false,
      expected: state.expected || state.preview?.counts || {},
    };
  }

  function confirmSummaryLines(state, preview) {
    const counts = preview?.counts || state.expected || {};
    const lines = [];
    if (state.audience === "staff") {
      lines.push(`${Number(counts.staffCount || 0)} staff member${Number(counts.staffCount) === 1 ? "" : "s"}`);
      lines.push(`This will create: ${Number(counts.assignmentCount || 0)} staff assignment${Number(counts.assignmentCount) === 1 ? "" : "s"}`);
    } else if (state.assignmentScope === "household") {
      lines.push(`${Number(counts.householdCount || 0)} household${Number(counts.householdCount) === 1 ? "" : "s"}`);
      lines.push(`${Number(counts.childCount || 0)} children covered`);
      lines.push(`This will create: ${Number(counts.assignmentCount || 0)} household-level assignment${Number(counts.assignmentCount) === 1 ? "" : "s"}`);
    } else {
      lines.push(`${Number(counts.childCount || 0)} children`);
      lines.push(`${Number(counts.householdCount || 0)} households`);
      lines.push(`This will create: ${Number(counts.assignmentCount || 0)} child-specific assignment${Number(counts.assignmentCount) === 1 ? "" : "s"}`);
    }
    return lines;
  }

  function modeLabel(mode, audience) {
    const key = String(mode || "");
    if (audience === "staff") {
      if (key === "all_teachers") return "All Teachers";
      if (key === "all_staff") return "All Staff";
      if (key === "classroom_staff") return "Staff in selected classroom";
      return "Selected staff";
    }
    if (key === "program") return "All families in the program";
    if (key === "classroom" || key === "classrooms") return "Selected classroom(s)";
    if (key === "household" || key === "families" || key === "family") return "Selected families";
    return "Selected children / families";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderWizardHtml(state, ctx = {}) {
    if (!state?.open) return "";
    const isCenter = Boolean(ctx.isCenter);
    const formSpec = state.formSpec || {};
    const title = formSpec.title || "Form";
    const children = Array.isArray(ctx.children) ? ctx.children : [];
    const staff = Array.isArray(ctx.staff) ? ctx.staff : [];
    const classrooms = Array.isArray(ctx.classrooms) ? ctx.classrooms : [];
    const households = Array.isArray(ctx.households) ? ctx.households : [];
    const groups = groupChildrenByClassroom(children, classrooms);
    const search = state.recipientSearch || "";
    const step = state.step || "recipients";

    const stepIndicator = `
      <ol class="llh-assign-steps" aria-label="Assignment steps">
        <li class="${step === "recipients" || step === "form" ? "is-current" : ""}">Recipients</li>
        <li class="${step === "configure" ? "is-current" : ""}">Configure</li>
        <li class="${step === "review" ? "is-current" : ""}">Review</li>
        <li class="${step === "success" ? "is-current" : ""}">Done</li>
      </ol>`;

    let body = "";
    if (step === "success" && state.result) {
      const r = state.result;
      body = `
        <div class="llh-assign-success" data-assign-success>
          <h3>Sent successfully</h3>
          <p>${escapeHtml(r.title || title)}</p>
          <ul>
            ${r.audience === "staff"
              ? `<li>${Number(r.createdCount || 0) + Number(r.refreshedCount || 0)} staff assignment${(Number(r.createdCount || 0) + Number(r.refreshedCount || 0)) === 1 ? "" : "s"}</li>`
              : `<li>${Number(r.counts?.assignmentCount || r.createdCount || 0)} assignment${Number(r.counts?.assignmentCount || r.createdCount || 0) === 1 ? "" : "s"} created</li>
                 <li>${Number(r.counts?.householdCount || 0)} household${Number(r.counts?.householdCount || 0) === 1 ? "" : "s"}</li>`}
            ${r.refreshedCount ? `<li>${Number(r.refreshedCount)} already-open assignment${Number(r.refreshedCount) === 1 ? "" : "s"} refreshed (no duplicates)</li>` : ""}
          </ul>
          <div class="llh-assign-actions">
            <button type="button" class="primary-button" data-assign-goto-hq>View in Paperwork HQ</button>
            <button type="button" class="ghost-button" data-assign-close>Done</button>
          </div>
        </div>`;
    } else if (step === "review") {
      const preview = state.preview || {};
      const lines = confirmSummaryLines(state, preview);
      body = `
        <div class="llh-assign-review" data-assign-review>
          <h3>${escapeHtml(title)}</h3>
          <p class="muted-copy">Sending to: ${escapeHtml(modeLabel(state.mode, state.audience))}</p>
          <ul>
            ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
            <li>Due: ${escapeHtml(state.dueDate || "No due date")}</li>
            <li>Signature: ${state.requiresSignature !== false ? "Required" : "No signature required"}</li>
            ${state.audience === "family"
              ? `<li>Visibility: ${state.shareWithFamily ? "Family Hub" : "Internal only (not shared with family)"}</li>`
              : "<li>Visibility: My Paperwork (staff only)</li>"}
          </ul>
          ${state.error ? `<p class="form-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          <div class="llh-assign-actions">
            <button type="button" class="ghost-button" data-assign-back ${state.sending ? "disabled" : ""}>Back</button>
            <button type="button" class="primary-button" data-assign-confirm ${state.sending ? "disabled" : ""}>
              ${state.sending ? "Sending…" : "Confirm &amp; Send"}
            </button>
          </div>
        </div>`;
    } else if (step === "configure") {
      body = `
        <div class="llh-assign-configure" data-assign-configure>
          <h3>Configure assignment</h3>
          <label>Due date (optional)
            <input type="date" name="assignDueDate" value="${escapeHtml(state.dueDate || "")}" data-assign-due />
          </label>
          <label class="settings-check-label">
            <input type="checkbox" data-assign-signature ${state.requiresSignature !== false ? "checked" : ""} />
            Signature / acknowledgment required
          </label>
          ${state.audience === "family" ? `
          <fieldset class="llh-assign-scope">
            <legend>Is this form about one child, or the whole family?</legend>
            <label class="settings-check-label">
              <input type="radio" name="assignmentScope" value="child" data-assign-scope ${state.assignmentScope !== "household" ? "checked" : ""} />
              Child-specific (one response per child — siblings each get a copy)
            </label>
            <label class="settings-check-label">
              <input type="radio" name="assignmentScope" value="household" data-assign-scope ${state.assignmentScope === "household" ? "checked" : ""} />
              Family / household (one response per family — siblings share one form)
            </label>
          </fieldset>
          <label class="settings-check-label">
            <input type="checkbox" data-assign-share ${state.shareWithFamily ? "checked" : ""} />
            Show in Family Hub (share with family)
          </label>` : `<p class="muted-copy">Staff paperwork never appears in Family Hub.</p>`}
          <div class="llh-assign-actions">
            <button type="button" class="ghost-button" data-assign-back>Back</button>
            <button type="button" class="primary-button" data-assign-next-review>Review</button>
          </div>
        </div>`;
    } else {
      // recipients
      const audienceToggle = `
        <div class="llh-assign-audience">
          <button type="button" class="ghost-button ${state.audience === "family" ? "is-selected" : ""}" data-assign-audience="family">Families / Children</button>
          <button type="button" class="ghost-button ${state.audience === "staff" ? "is-selected" : ""}" data-assign-audience="staff">Staff</button>
        </div>`;

      let picker = "";
      if (state.audience === "staff") {
        const filteredStaff = filterBySearch(staff, search, (s) => `${s.name} ${s.email} ${s.role}`);
        picker = `
          <label>Quick select
            <select data-assign-mode>
              <option value="staff" ${state.mode === "staff" ? "selected" : ""}>Selected staff</option>
              <option value="all_teachers" ${state.mode === "all_teachers" ? "selected" : ""}>All Teachers</option>
              <option value="all_staff" ${state.mode === "all_staff" ? "selected" : ""}>All Staff</option>
              ${isCenter ? `<option value="classroom_staff" ${state.mode === "classroom_staff" ? "selected" : ""}>Staff in a classroom</option>` : ""}
            </select>
          </label>
          <label>Search staff<input type="search" data-assign-search value="${escapeHtml(search)}" placeholder="Name or email" /></label>
          <div class="llh-assign-pick-grid" data-assign-staff-list>
            ${filteredStaff.map((member) => `
              <label class="area-check">
                <input type="checkbox" data-assign-staff value="${escapeHtml(member.email)}" ${state.staffEmails.includes(member.email) ? "checked" : ""} />
                <span>${escapeHtml(member.name || member.email)} · ${escapeHtml(member.role || "staff")}</span>
              </label>`).join("") || '<p class="muted-copy">No staff available.</p>'}
          </div>`;
      } else if (isCenter) {
        picker = `
          <label>Quick select
            <select data-assign-mode>
              <option value="children" ${state.mode === "children" ? "selected" : ""}>Selected children</option>
              <option value="classrooms" ${state.mode === "classrooms" || state.mode === "classroom" ? "selected" : ""}>Classroom families</option>
              <option value="program" ${state.mode === "program" ? "selected" : ""}>All families in the program</option>
            </select>
          </label>
          <label>Search<input type="search" data-assign-search value="${escapeHtml(search)}" placeholder="Child or room" /></label>
          <div class="llh-assign-groups">
            ${groups.map((group) => {
              const visibleChildren = filterBySearch(group.children, search, (c) => `${c.name} ${group.label}`);
              if (search && !visibleChildren.length) return "";
              const allSelected = group.children.every((c) => state.childIds.includes(String(c.id)));
              return `
                <details class="llh-assign-group" data-assign-classroom-group="${escapeHtml(group.id)}" open>
                  <summary>
                    <label class="area-check" onclick="event.stopPropagation()">
                      <input type="checkbox" data-assign-classroom value="${escapeHtml(group.id)}" ${state.classroomIds.includes(group.id) || allSelected ? "checked" : ""} />
                      <span><strong>${escapeHtml(group.label)}</strong> · ${group.children.length} ${group.children.length === 1 ? "child" : "children"}</span>
                    </label>
                  </summary>
                  <div class="llh-assign-pick-grid">
                    ${visibleChildren.map((child) => `
                      <label class="area-check">
                        <input type="checkbox" data-assign-child value="${escapeHtml(child.id)}" ${state.childIds.includes(String(child.id)) ? "checked" : ""} />
                        <span>${escapeHtml(child.name || "Child")}</span>
                      </label>`).join("")}
                  </div>
                </details>`;
            }).join("") || '<p class="muted-copy">Add children to classrooms to use grouped selection.</p>'}
          </div>`;
      } else {
        // Home Daycare — simple list
        const filtered = filterBySearch(children, search, (c) => c.name);
        const hhCount = householdSummary(households, state.childIds);
        picker = `
          <label>Quick select
            <select data-assign-mode>
              <option value="children" ${state.mode === "children" ? "selected" : ""}>Selected children / families</option>
              <option value="program" ${state.mode === "program" ? "selected" : ""}>All families</option>
            </select>
          </label>
          <label>Search<input type="search" data-assign-search value="${escapeHtml(search)}" placeholder="Child name" /></label>
          <p class="muted-copy">${state.childIds.length} selected${hhCount ? ` · ~${hhCount} households` : ""}</p>
          <div class="llh-assign-pick-grid">
            ${filtered.map((child) => `
              <label class="area-check">
                <input type="checkbox" data-assign-child value="${escapeHtml(child.id)}" ${state.childIds.includes(String(child.id)) ? "checked" : ""} />
                <span>${escapeHtml(child.name || "Child")}</span>
              </label>`).join("") || '<p class="muted-copy">Add a child first.</p>'}
          </div>`;
      }

      body = `
        <div class="llh-assign-recipients" data-assign-recipients>
          <h3>Choose recipients</h3>
          <p class="muted-copy">Form: <strong>${escapeHtml(title)}</strong></p>
          ${audienceToggle}
          ${picker}
          ${state.error ? `<p class="form-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          <div class="llh-assign-actions">
            <button type="button" class="ghost-button" data-assign-close>Cancel</button>
            <button type="button" class="primary-button" data-assign-next-configure>Next</button>
          </div>
        </div>`;
    }

    return `
      <section class="llh-assign-flow panel-card" data-assign-flow data-assign-step="${escapeHtml(step)}">
        <header class="llh-assign-flow-header">
          <strong>Assign / Send</strong>
          <button type="button" class="ghost-button" data-assign-close aria-label="Close">Close</button>
        </header>
        ${stepIndicator}
        ${body}
      </section>`;
  }

  return {
    STEPS,
    newIdempotencyKey,
    createAssignFlowState,
    touchState,
    groupChildrenByClassroom,
    householdSummary,
    buildTargetPayload,
    buildConfirmPayload,
    confirmSummaryLines,
    modeLabel,
    renderWizardHtml,
    filterBySearch,
  };
}));
