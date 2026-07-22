/**
 * Director Center Phase 2 admin-preview UI.
 * Fake preview data only. Requires verified admin + directorCenter preview access.
 */
(function initDirectorCenterPreviewUI(global) {
  const state = {
    tab: "overview",
    overview: null,
    classrooms: [],
    staff: [],
    children: [],
    programProfile: null,
    roles: null,
    limits: null,
    selectedClassroomId: "",
    classroomDetail: null,
    editingClassroom: false,
    assigningStaffId: "",
    expandedChildId: "",
    addonQty: 1,
    loading: false,
    error: "",
    scenario: "small_center",
    filters: {
      classroomStatus: "active",
      classroomQ: "",
      staffRole: "",
      staffStatus: "",
      staffQ: "",
      childQ: "",
      childUnassigned: false,
      childClassroomId: "",
    },
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function setTab(tab) {
    state.tab = tab;
    state.selectedClassroomId = "";
    state.classroomDetail = null;
    render();
    refreshTab().catch((error) => {
      state.error = error.message || "Could not load Director Center.";
      render();
    });
  }

  async function refreshTab() {
    state.loading = true;
    state.error = "";
    render();
    try {
      if (state.tab === "overview") {
        state.overview = await api("GET", "/api/director-center/overview");
        state.limits = state.overview.limits;
      } else if (state.tab === "classrooms") {
        const params = new URLSearchParams({
          status: state.filters.classroomStatus || "all",
          q: state.filters.classroomQ || "",
        });
        const data = await api("GET", `/api/director-center/classrooms?${params}`);
        state.classrooms = data.classrooms || [];
        state.limits = data.limits;
      } else if (state.tab === "staff") {
        const params = new URLSearchParams({
          role: state.filters.staffRole || "",
          status: state.filters.staffStatus || "",
          q: state.filters.staffQ || "",
        });
        const [data, classroomsData] = await Promise.all([
          api("GET", `/api/director-center/staff?${params}`),
          api("GET", "/api/director-center/classrooms?status=active"),
        ]);
        state.staff = data.staff || [];
        state.limits = data.limits;
        state.classrooms = classroomsData.classrooms || [];
      } else if (state.tab === "children") {
        const params = new URLSearchParams({
          q: state.filters.childQ || "",
          unassigned: state.filters.childUnassigned ? "1" : "",
          classroomId: state.filters.childClassroomId || "",
        });
        const [childrenData, classroomsData] = await Promise.all([
          api("GET", `/api/director-center/children?${params}`),
          api("GET", "/api/director-center/classrooms?status=active"),
        ]);
        state.children = childrenData.children || [];
        state.classrooms = classroomsData.classrooms || [];
      } else if (state.tab === "program_profile") {
        const data = await api("GET", "/api/director-center/program-profile");
        state.programProfile = data.programProfile;
        state.limits = data.limits;
      } else if (state.tab === "families") {
        if (typeof global.ensureFamilyFoundationLoaded === "function") {
          await global.ensureFamilyFoundationLoaded();
        } else if (typeof global.refreshFamilyFoundationTab === "function") {
          await global.refreshFamilyFoundationTab();
        }
      } else if (state.tab === "family_updates") {
        if (typeof global.refreshFamilyUpdatesTab === "function") {
          await global.refreshFamilyUpdatesTab();
        }
      } else if (state.tab === "family_messaging") {
        if (typeof global.refreshFamilyMessagingTab === "function") {
          await global.refreshFamilyMessagingTab();
        }
      } else if (state.tab === "enrollment") {
        // Enrollment tab loads via renderEnrollmentTab after paint.
      } else if (state.tab === "records_center") {
        // Records Center tab loads via renderRecordsCenterTab after paint.
      } else if (state.tab === "licensing_center") {
        // Licensing Center tab loads via renderLicensingCenterTab after paint.
      } else if (state.tab === "today_hub") {
        // Today Hub tab loads via renderTodayHubTab after paint.
      } else if (state.tab === "staff_experience") {
        // Staff Experience tab loads via renderStaffExperienceTab after paint.
      } else if (state.tab === "billing") {
        // Billing Simulator tab loads via renderBillingSimulatorTab after paint.
      } else if (state.tab === "roles_permissions") {
        state.roles = await api("GET", "/api/director-center/roles-permissions");
        state.limits = await api("GET", `/api/director-center/limits?additionalClassrooms=${encodeURIComponent(state.addonQty || 0)}`);
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  function metricCard(label, value, detail = "") {
    return `
      <article class="dc-metric-card">
        <p class="dc-metric-label">${escapeHtml(label)}</p>
        <p class="dc-metric-value">${escapeHtml(value)}</p>
        ${detail ? `<p class="dc-metric-detail">${escapeHtml(detail)}</p>` : ""}
      </article>
    `;
  }

  function statusBadge(status) {
    const key = String(status || "active").toLowerCase();
    return `<span class="dc-badge dc-badge-${escapeHtml(key.replace(/_/g, "-"))}">${escapeHtml(key.replace(/_/g, " "))}</span>`;
  }

  function navHtml() {
    const tabs = [
      ["overview", "Overview"],
      ["classrooms", "Classrooms"],
      ["staff", "Staff"],
      ["staff_experience", "Staff Hub"],
      ["billing", "Billing"],
      ["children", "Children and Assignments"],
      ["families", "Families"],
      ["family_updates", "Family Updates"],
      ["family_messaging", "Family Messaging"],
      ["today_hub", "Today"],
      ["enrollment", "Enrollment"],
      ["records_center", "Records"],
      ["licensing_center", "Licensing"],
      ["program_profile", "Program Profile"],
      ["roles_permissions", "Roles and Permissions"],
    ];
    return `
      <nav class="dc-subnav" aria-label="Director Center sections">
        ${tabs.map(([id, label]) => `
          <button type="button" class="dc-subnav-btn${state.tab === id ? " active" : ""}" data-dc-tab="${id}">${label}</button>
        `).join("")}
      </nav>
    `;
  }

  function limitsBanner() {
    const raw = state.limits || state.overview?.limits;
    const limits = raw?.limits && typeof raw.limits === "object" ? raw.limits : raw;
    if (!limits) return "";
    const notes = [];
    if (limits.classroomNearLimit && limits.messages?.classroomWarning) notes.push(limits.messages.classroomWarning);
    if (limits.staffNearLimit && limits.messages?.staffWarning) notes.push(limits.messages.staffWarning);
    if (limits.classroomAtLimit && limits.messages?.classroomBlocked) notes.push(limits.messages.classroomBlocked);
    if (limits.staffAtLimit && limits.messages?.staffBlocked) notes.push(limits.messages.staffBlocked);
    if (limits.messages?.homeDaycareUpgrade) notes.push(limits.messages.homeDaycareUpgrade);
    if (limits.upgradeRecommendation?.recommendUpgrade) notes.push(limits.upgradeRecommendation.message);
    if (raw?.upgradeRecommendation?.recommendUpgrade) notes.push(raw.upgradeRecommendation.message);
    if (!notes.length) {
      return `
        <div class="dc-limits-banner dc-limits-ok">
          Plan preview: ${escapeHtml(limits.planLabel || "")} · Classrooms ${escapeHtml(limits.classroomsUsed ?? 0)}/${escapeHtml(limits.classroomLimit ?? 0)} · Staff ${escapeHtml(limits.staffUsed ?? 0)}/${escapeHtml(limits.staffAccountLimit ?? 0)}
        </div>
      `;
    }
    return `
      <div class="dc-limits-banner dc-limits-warn">
        <strong>Plan limits (preview only)</strong>
        <ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
      </div>
    `;
  }

  function overviewHtml() {
    const data = state.overview;
    if (!data) return `<p class="muted-copy">Loading overview…</p>`;
    const profile = data.programProfile || {};
    const metrics = data.metrics || {};
    return `
      <section class="dc-panel">
        <div class="dc-program-hero">
          <div class="dc-logo-fallback" aria-hidden="true">${escapeHtml((profile.programName || "P").slice(0, 1))}</div>
          <div>
            <h3>${escapeHtml(profile.programName || data.organization?.name || "Preview Program")}</h3>
            <p>${escapeHtml(profile.directorOwnerName || "")} · ${escapeHtml(profile.programType || "")}</p>
          </div>
        </div>
        <div class="dc-metric-grid">
          ${metricCard("Active classrooms", `${metrics.activeClassrooms}/${metrics.classroomLimit}`)}
          ${metricCard("Staff accounts", `${metrics.staffAccounts}/${metrics.staffAccountLimit}`)}
          ${metricCard("Active children", metrics.activeChildren)}
          ${metricCard("Unassigned children", metrics.unassignedChildren)}
          ${metricCard("Staff without rooms", metrics.staffWithoutAssignments)}
        </div>
        <div class="dc-quick-actions">
          <button type="button" class="primary-button" data-dc-tab="classrooms">Add Classroom</button>
          <button type="button" class="ghost-button" data-dc-tab="staff">Invite Staff</button>
          <button type="button" class="ghost-button" data-dc-tab="staff">Assign Staff</button>
          <button type="button" class="ghost-button" data-dc-tab="children">Assign Children</button>
          <button type="button" class="ghost-button" data-dc-open-teacher-center>Open Teacher Classroom Experience</button>
          <button type="button" class="ghost-button" data-dc-open-calendar>View Classroom Calendars</button>
          <button type="button" class="ghost-button" data-dc-tab="program_profile">Edit Program Profile</button>
        </div>
        <div class="dc-two-col">
          <section>
            <h4>Current curriculum</h4>
            <ul class="dc-list">
              ${(data.classrooms || []).map((room) => `
                <li>
                  <strong>${escapeHtml(room.name)}</strong>
                  <span>${escapeHtml(room.currentCurriculum?.lessonPlanTitle || "No plan assigned")}</span>
                </li>
              `).join("") || "<li>No active classrooms</li>"}
            </ul>
          </section>
          <section>
            <h4>Needs attention</h4>
            <ul class="dc-list">
              ${(data.attention || []).map((item) => `<li>${statusBadge(item.severity)} ${escapeHtml(item.label)}</li>`).join("") || "<li>All clear in this preview</li>"}
            </ul>
            <h4>Recent activity</h4>
            <ul class="dc-list">
              ${(data.recentActivity || []).map((item) => `
                <li><strong>${escapeHtml(item.classroomName || "")}</strong> · ${escapeHtml(item.label || item.type)}</li>
              `).join("") || "<li>No recent activity</li>"}
            </ul>
          </section>
        </div>
      </section>
    `;
  }

  function classroomsHtml() {
    if (state.classroomDetail) {
      const detail = state.classroomDetail;
      const room = detail.classroom || {};
      return `
        <section class="dc-panel">
          <button type="button" class="ghost-button" data-dc-back-classrooms>← Back to classrooms</button>
          <div class="dc-detail-header">
            <div>
              <h3>${escapeHtml(room.name)}</h3>
              <p>${escapeHtml(room.ageGroupDefault || "")} · Capacity ${escapeHtml(room.capacity ?? "—")} · Enrollment ${escapeHtml(room.enrollmentCount ?? 0)}</p>
              ${statusBadge(room.status)}
            </div>
            <div class="dc-inline-actions">
              ${room.status !== "archived" ? `<button type="button" class="ghost-button" data-dc-toggle-edit-classroom>Edit classroom</button>` : ""}
              ${room.status === "archived"
                ? `<button type="button" class="primary-button" data-dc-restore-classroom="${escapeHtml(room.id)}">Restore</button>`
                : `<button type="button" class="ghost-button" data-dc-archive-classroom="${escapeHtml(room.id)}">Archive</button>`}
              <button type="button" class="ghost-button" data-dc-open-calendar>Open Calendar</button>
            </div>
          </div>
          ${state.editingClassroom && room.status !== "archived" ? `
            <form id="dcEditClassroomForm" class="dc-form dc-form-visible">
              <h4>Edit classroom</h4>
              <label>Name <input name="name" required maxlength="80" value="${escapeHtml(room.name || "")}" /></label>
              <label>Age group <input name="ageGroupDefault" maxlength="40" value="${escapeHtml(room.ageGroupDefault || "")}" /></label>
              <label>Capacity <input name="capacity" type="number" min="0" value="${escapeHtml(room.capacity ?? "")}" /></label>
              <label>Color <input name="color" type="color" value="${escapeHtml(room.color || "#8b6be8")}" /></label>
              <label>Description <textarea name="description" rows="2">${escapeHtml(room.description || "")}</textarea></label>
              <div class="dc-inline-actions">
                <button class="primary-button" type="submit">Save changes</button>
                <button class="ghost-button" type="button" data-dc-toggle-edit-classroom>Cancel</button>
              </div>
            </form>
          ` : ""}
          <div class="dc-two-col">
            <section>
              <h4>Lead Teachers</h4>
              <ul class="dc-list">${(detail.leadTeachers || []).map((m) => `<li>${escapeHtml(m.displayName || m.userEmail)} · ${escapeHtml(m.role)}</li>`).join("") || "<li>None</li>"}</ul>
              <h4>Assistants / Staff</h4>
              <ul class="dc-list">${(detail.assistants || []).map((m) => `<li>${escapeHtml(m.displayName || m.userEmail)}</li>`).join("") || "<li>None</li>"}</ul>
              <h4>Assigned children</h4>
              <ul class="dc-list">${(detail.children || []).map((c) => `<li><button type="button" class="linkish" data-dc-open-child="${escapeHtml(c.id)}">${escapeHtml(c.displayName)}</button></li>`).join("") || "<li>None</li>"}</ul>
            </section>
            <section>
              <h4>Weekly curriculum</h4>
              <p>${escapeHtml(detail.weeklyCurriculum?.lessonPlanTitle || "No lesson plan assigned")}</p>
              <h4>Assigned lesson plans</h4>
              <ul class="dc-list">${(detail.assignedLessonPlans || []).map((p) => `<li>${escapeHtml(p.lessonPlanTitle || p.weekLabel)}</li>`).join("") || "<li>None</li>"}</ul>
              <h4>Recent Daily Reports</h4>
              <ul class="dc-list">${(detail.recentDailyReports || []).map((p) => `<li>${escapeHtml(p.label)}</li>`).join("") || "<li>None in preview</li>"}</ul>
              <h4>Recent observations</h4>
              <ul class="dc-list">${(detail.recentObservations || []).map((p) => `<li>${escapeHtml(p.label)}</li>`).join("") || "<li>None in preview</li>"}</ul>
              <p class="muted-copy">Calendar and child profile deep-links are available in the Teacher Classroom Phase 3 preview.</p>
            </section>
          </div>
        </section>
      `;
    }
    return `
      <section class="dc-panel">
        <div class="dc-toolbar">
          <input type="search" placeholder="Search classrooms" value="${escapeHtml(state.filters.classroomQ)}" data-dc-filter="classroomQ" />
          <select data-dc-filter="classroomStatus">
            <option value="active"${state.filters.classroomStatus === "active" ? " selected" : ""}>Active</option>
            <option value="archived"${state.filters.classroomStatus === "archived" ? " selected" : ""}>Archived</option>
            <option value="all"${state.filters.classroomStatus === "all" ? " selected" : ""}>All</option>
          </select>
          <button type="button" class="primary-button" data-dc-show-create-classroom>Add Classroom</button>
        </div>
        <form id="dcCreateClassroomForm" class="dc-form" hidden>
          <h4>Create classroom</h4>
          <label>Name <input name="name" required maxlength="80" /></label>
          <label>Age group <input name="ageGroupDefault" maxlength="40" /></label>
          <label>Capacity <input name="capacity" type="number" min="0" /></label>
          <label>Color <input name="color" type="color" value="#8b6be8" /></label>
          <label>Description <textarea name="description" rows="2"></textarea></label>
          <button class="primary-button" type="submit">Save classroom</button>
        </form>
        <div class="dc-card-list">
          ${(state.classrooms || []).map((room) => `
            <article class="dc-card">
              <div>
                <h4>${escapeHtml(room.name)}</h4>
                <p>${escapeHtml(room.ageGroupDefault || "")} · ${escapeHtml(room.enrollmentCount || 0)} enrolled · Cap ${escapeHtml(room.capacity ?? "—")}</p>
                ${statusBadge(room.status)}
              </div>
              <div class="dc-inline-actions">
                <button type="button" class="ghost-button" data-dc-open-classroom="${escapeHtml(room.id)}">Open</button>
              </div>
            </article>
          `).join("") || `<div class="dc-empty">No classrooms match these filters.</div>`}
        </div>
      </section>
    `;
  }

  function classroomCheckboxList(selectedIds = []) {
    const selected = new Set((selectedIds || []).map(String));
    const rooms = (state.classrooms || []).filter((room) => room.status === "active");
    if (!rooms.length) return `<p class="muted-copy">No active classrooms available.</p>`;
    return `
      <div class="dc-checkbox-grid" role="group" aria-label="Classrooms">
        ${rooms.map((room) => `
          <label class="dc-check">
            <input type="checkbox" name="classroomIds" value="${escapeHtml(room.id)}"${selected.has(String(room.id)) ? " checked" : ""} />
            ${escapeHtml(room.name)}
          </label>
        `).join("")}
      </div>
    `;
  }

  function staffHtml() {
    return `
      <section class="dc-panel">
        <div class="dc-toolbar">
          <input type="search" placeholder="Search staff" value="${escapeHtml(state.filters.staffQ)}" data-dc-filter="staffQ" />
          <select data-dc-filter="staffRole">
            <option value="">All roles</option>
            <option value="director"${state.filters.staffRole === "director" ? " selected" : ""}>Director</option>
            <option value="lead_teacher"${state.filters.staffRole === "lead_teacher" ? " selected" : ""}>Lead Teacher</option>
            <option value="assistant"${state.filters.staffRole === "assistant" ? " selected" : ""}>Assistant/Staff</option>
          </select>
          <select data-dc-filter="staffStatus">
            <option value="">All statuses</option>
            <option value="active"${state.filters.staffStatus === "active" ? " selected" : ""}>Active</option>
            <option value="invitation_pending"${state.filters.staffStatus === "invitation_pending" ? " selected" : ""}>Invitation pending</option>
            <option value="deactivated"${state.filters.staffStatus === "deactivated" ? " selected" : ""}>Deactivated</option>
            <option value="inactive"${state.filters.staffStatus === "inactive" ? " selected" : ""}>Inactive</option>
          </select>
          <button type="button" class="primary-button" data-dc-show-invite-staff>Invite Staff</button>
        </div>
        <form id="dcInviteStaffForm" class="dc-form" hidden>
          <h4>Invite staff (preview — no email sent)</h4>
          <label>Email <input name="email" type="email" required /></label>
          <label>Name <input name="displayName" /></label>
          <label>Role
            <select name="role">
              <option value="lead_teacher">Lead Teacher</option>
              <option value="assistant_staff">Assistant/Staff</option>
              <option value="director">Director</option>
            </select>
          </label>
          <fieldset class="dc-fieldset">
            <legend>Assign classrooms (optional)</legend>
            ${classroomCheckboxList([])}
          </fieldset>
          <button class="primary-button" type="submit">Create preview invite</button>
        </form>
        <div class="dc-card-list">
          ${(state.staff || []).map((member) => `
            <article class="dc-card">
              <div>
                <h4>${escapeHtml(member.displayName || member.userEmail)}</h4>
                <p>${escapeHtml(member.userEmail)} · ${escapeHtml(member.role)}</p>
                <p>Classrooms: ${escapeHtml((member.assignedClassrooms || []).map((c) => c.name).join(", ") || "None")}</p>
                ${statusBadge(member.status)}
                ${member.isBillingOwner ? `<span class="dc-badge dc-badge-info">Billing owner</span>` : ""}
              </div>
              <div class="dc-inline-actions">
                ${["active", "invitation_pending"].includes(member.status)
                  ? `<button type="button" class="ghost-button" data-dc-assign-staff="${escapeHtml(member.id)}">Assign classrooms</button>`
                  : ""}
                ${member.status === "invitation_pending" ? `<button type="button" class="ghost-button" data-dc-staff-action="resend_invite" data-id="${escapeHtml(member.id)}">Resend</button>` : ""}
                ${member.status === "invitation_pending" ? `<button type="button" class="ghost-button" data-dc-staff-action="cancel_invite" data-id="${escapeHtml(member.id)}">Cancel</button>` : ""}
                ${member.status === "active" ? `<button type="button" class="ghost-button" data-dc-staff-action="deactivate" data-id="${escapeHtml(member.id)}">Deactivate</button>` : ""}
                ${member.status === "deactivated" ? `<button type="button" class="ghost-button" data-dc-staff-action="restore" data-id="${escapeHtml(member.id)}">Restore</button>` : ""}
              </div>
              ${state.assigningStaffId === member.id ? `
                <form class="dc-form dc-form-visible" data-dc-assign-staff-form="${escapeHtml(member.id)}">
                  <h4>Assign classrooms for ${escapeHtml(member.displayName || member.userEmail)}</h4>
                  ${classroomCheckboxList((member.assignedClassrooms || []).map((c) => c.id))}
                  <div class="dc-inline-actions">
                    <button class="primary-button" type="submit">Save classroom assignments</button>
                    <button class="ghost-button" type="button" data-dc-assign-staff="">Cancel</button>
                  </div>
                </form>
              ` : ""}
            </article>
          `).join("") || `<div class="dc-empty">No staff match these filters.</div>`}
        </div>
      </section>
    `;
  }

  function childrenHtml() {
    const activeRooms = (state.classrooms || []).filter((r) => r.status === "active");
    return `
      <section class="dc-panel">
        <div class="dc-toolbar">
          <input type="search" placeholder="Search children" value="${escapeHtml(state.filters.childQ)}" data-dc-filter="childQ" />
          <label class="dc-check"><input type="checkbox" data-dc-filter-bool="childUnassigned"${state.filters.childUnassigned ? " checked" : ""} /> Unassigned only</label>
          <select data-dc-filter="childClassroomId">
            <option value="">All classrooms</option>
            ${(state.classrooms || []).map((room) => `
              <option value="${escapeHtml(room.id)}"${state.filters.childClassroomId === room.id ? " selected" : ""}>${escapeHtml(room.name)}</option>
            `).join("")}
          </select>
          <button type="button" class="primary-button" data-dc-show-assign-children>Assign Children</button>
        </div>
        <form id="dcAssignChildrenForm" class="dc-form" hidden>
          <h4>Assign / move children</h4>
          <label>Classroom
            <select name="classroomId" required>
              ${activeRooms.map((room) => `
                <option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>
              `).join("")}
            </select>
          </label>
          <fieldset class="dc-fieldset">
            <legend>Select children to assign / move</legend>
            <div class="dc-checkbox-grid">
              ${(state.children || []).map((child) => `
                <label class="dc-check">
                  <input type="checkbox" name="childIds" value="${escapeHtml(child.id)}" />
                  ${escapeHtml(child.displayName)} (${escapeHtml(child.classroomName || "Unassigned")})
                </label>
              `).join("") || `<p class="muted-copy">No children loaded yet.</p>`}
            </div>
          </fieldset>
          <label>Or create child name <input name="displayName" placeholder="Creates one new preview child" /></label>
          <button class="primary-button" type="submit">Save assignments</button>
        </form>
        <div class="dc-card-list">
          ${(state.children || []).map((child) => `
            <article class="dc-card">
              <div>
                <h4>${escapeHtml(child.displayName)}</h4>
                <p>Classroom: ${escapeHtml(child.classroomName || "Unassigned")}</p>
                <p>History: ${(child.history || []).length} assignment record(s)</p>
                ${state.expandedChildId === child.id ? `
                  <ul class="dc-list compact">
                    ${(child.history || []).map((row) => {
                      const roomName = row.classroomName
                        || (state.classrooms || []).find((room) => room.id === row.classroomId)?.name
                        || row.classroomId
                        || "Classroom";
                      const status = row.status || (row.endsAt || row.endDate ? "historical" : "active");
                      const start = String(row.startsAt || row.startDate || row.assignedAt || "").slice(0, 10) || "—";
                      const end = String(row.endsAt || row.endDate || "").slice(0, 10);
                      return `
                      <li>
                        ${escapeHtml(roomName)}
                        · ${escapeHtml(status)}
                        · ${escapeHtml(start)}
                        ${end ? `→ ${escapeHtml(end)}` : ""}
                      </li>`;
                    }).join("") || "<li>No history rows</li>"}
                  </ul>
                ` : ""}
              </div>
              <div class="dc-inline-actions">
                <button type="button" class="ghost-button" data-dc-toggle-child-history="${escapeHtml(child.id)}">${state.expandedChildId === child.id ? "Hide history" : "View history"}</button>
                <button type="button" class="ghost-button" data-dc-open-child="${escapeHtml(child.id)}">Open Child Profile</button>
              </div>
            </article>
          `).join("") || `<div class="dc-empty">No children match these filters.</div>`}
        </div>
      </section>
    `;
  }

  function programProfileHtml() {
    const profile = state.programProfile || {};
    return `
      <section class="dc-panel">
        <form id="dcProgramProfileForm" class="dc-form dc-form-visible">
          <h4>Program Profile</h4>
          <label>Program name <input name="programName" value="${escapeHtml(profile.programName || "")}" required /></label>
          <label>Director / owner name <input name="directorOwnerName" value="${escapeHtml(profile.directorOwnerName || "")}" /></label>
          <label>Address <input name="address" value="${escapeHtml(profile.address || "")}" /></label>
          <label>Phone <input name="phone" value="${escapeHtml(profile.phone || "")}" /></label>
          <label>Email <input name="email" type="email" value="${escapeHtml(profile.email || "")}" /></label>
          <label>License number <input name="licenseNumber" value="${escapeHtml(profile.licenseNumber || "")}" /></label>
          <label>Website <input name="website" value="${escapeHtml(profile.website || "")}" /></label>
          <label>Program type
            <select name="programType">
              ${["home_daycare", "childcare_center", "single_provider", "preschool", "after_school", "other"].map((type) => `
                <option value="${type}"${profile.programType === type ? " selected" : ""}>${type.replace(/_/g, " ")}</option>
              `).join("")}
            </select>
          </label>
          <label>Physical location ID <input name="physicalLocationId" value="${escapeHtml(profile.physicalLocationId || "")}" /></label>
          <label>Logo URL (optional) <input name="logoUrl" value="${escapeHtml(profile.logoUrl || "")}" /></label>
          <p class="muted-copy">Classroom count updates automatically from active classrooms: ${escapeHtml(profile.classroomCount ?? 0)}</p>
          <button class="primary-button" type="submit">Save Program Profile</button>
        </form>
      </section>
    `;
  }

  function rolesHtml() {
    const catalog = state.roles?.catalog || {};
    const limitsPayload = state.limits || {};
    const limits = limitsPayload.limits || limitsPayload;
    const actions = catalog.actions || {};
    const rolePermissions = catalog.rolePermissions || {};
    const roleKeys = Object.keys(rolePermissions);
    const actionKeys = Object.keys(actions);
    const addOn = limitsPayload.classroomAddOn || {};
    const upgrade = limitsPayload.upgradeRecommendation || {};
    const qty = Number(state.addonQty || 0);
    const unitPrice = Number(addOn.monthlyPriceCents || 0);
    const stayCost = qty * unitPrice;
    return `
      <section class="dc-panel">
        <h4>Roles &amp; permissions (future enforcement model)</h4>
        <p class="muted-copy">Phase 2 remains admin-preview only. These rules are enforced in server-side access checks for future member traffic.</p>
        <div class="dc-two-col">
          <section>
            <h5>Director / Owner</h5>
            <ul class="dc-list"><li>View entire organization</li><li>Manage classrooms, staff, children, Program Profile, permissions</li></ul>
            <h5>Lead Teacher</h5>
            <ul class="dc-list"><li>Assigned classrooms only</li><li>Assigned children, lesson plans, Daily Reports, observations</li></ul>
            <h5>Assistant / Staff</h5>
            <ul class="dc-list"><li>Assigned classrooms with limited actions</li><li>Cannot manage billing, staff, classrooms, Program Profile, or org permissions</li></ul>
          </section>
          <section>
            <h5>Plan limit preview</h5>
            <p>${escapeHtml(limits.planLabel || "")}</p>
            <p>Classrooms ${escapeHtml(limits.classroomsUsed ?? 0)} / ${escapeHtml(limits.classroomLimit ?? 0)}</p>
            <p>Staff ${escapeHtml(limits.staffUsed ?? 0)} / ${escapeHtml(limits.staffAccountLimit ?? 0)}</p>
            <p class="muted-copy">No Stripe products created. Founding Member $9.99 base remains untouched.</p>
          </section>
        </div>
        <section class="dc-addon-sim">
          <h5>Classroom add-on simulation (preview only)</h5>
          <p class="muted-copy">Simulate buying extra classrooms. No checkout, no Stripe products, no charges.</p>
          <label>Additional classrooms
            <input type="number" min="0" max="20" value="${escapeHtml(qty)}" data-dc-addon-qty />
          </label>
          <button type="button" class="ghost-button" data-dc-run-addon-sim>Update simulation</button>
          <ul class="dc-list">
            <li>Add-on unit (monthly preview): $${escapeHtml(((unitPrice || 0) / 100).toFixed(2))}</li>
            <li>Simulated stay-with-add-ons cost: $${escapeHtml(((stayCost || 0) / 100).toFixed(2))} / month</li>
            <li>${upgrade.recommendUpgrade
              ? `Recommendation: ${escapeHtml(upgrade.message || "Upgrade may save money vs stacking add-ons.")}`
              : "Recommendation: Stay on current plan + add-ons for this simulated quantity (or choose 1+ classrooms to compare)."}</li>
          </ul>
        </section>
        <section class="dc-matrix-wrap">
          <h5>Permission matrix</h5>
          <div class="dc-table-scroll">
            <table class="dc-matrix">
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  ${roleKeys.map((role) => `<th scope="col">${escapeHtml(String(role).replace(/_/g, " "))}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${actionKeys.map((action) => `
                  <tr>
                    <th scope="row">${escapeHtml(actions[action] || action)}</th>
                    ${roleKeys.map((role) => {
                      const allowedActions = Array.isArray(rolePermissions[role])
                        ? rolePermissions[role]
                        : Object.keys(rolePermissions[role] || {}).filter((key) => rolePermissions[role][key]);
                      const actionValue = actions[action] || action;
                      const allowed = allowedActions.includes(actionValue) || allowedActions.includes(action);
                      return `<td>${allowed ? "✓" : "—"}</td>`;
                    }).join("")}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    `;
  }

  function bodyHtml() {
    if (state.tab === "overview") return overviewHtml();
    if (state.tab === "classrooms") return classroomsHtml();
    if (state.tab === "staff") return staffHtml();
    if (state.tab === "children") return childrenHtml();
    if (state.tab === "families") {
      if (typeof global.renderFamilyFoundationTabHtml === "function") {
        return global.renderFamilyFoundationTabHtml();
      }
      return `<p class="muted-copy">Family foundation UI is not loaded.</p>`;
    }
    if (state.tab === "family_updates") {
      return `<div id="dc-family-updates-mount" class="dc-family-updates-mount"><p class="muted-copy">Loading Family Updates…</p></div>`;
    }
    if (state.tab === "family_messaging") {
      return `<div id="dc-family-messaging-mount" class="dc-family-updates-mount"><p class="muted-copy">Loading Family Messaging…</p></div>`;
    }
    if (state.tab === "enrollment") {
      return `<div id="dc-enrollment-mount" class="dc-family-updates-mount"><p class="muted-copy">Loading Enrollment…</p></div>`;
    }
    if (state.tab === "records_center") {
      return `<div id="dc-records-center-mount" class="dc-family-updates-mount"><p class="muted-copy">Loading Records Center…</p></div>`;
    }
    if (state.tab === "licensing_center") {
      return `<div id="dc-licensing-center-mount" class="dc-family-updates-mount"><p class="muted-copy">Loading Licensing Center…</p></div>`;
    }
    if (state.tab === "today_hub") {
      return `<div id="dc-today-hub-mount" class="dc-family-updates-mount"><p class="muted-copy">Loading Today Hub…</p></div>`;
    }
    if (state.tab === "staff_experience") {
      return `<div id="dc-staff-experience-mount" class="dc-family-updates-mount"><p class="muted-copy">Loading Staff Experience…</p></div>`;
    }
    if (state.tab === "billing") {
      return `<div id="dc-billing-simulator-mount" class="dc-family-updates-mount"><p class="muted-copy">Loading Billing Simulator…</p></div>`;
    }
    if (state.tab === "program_profile") return programProfileHtml();
    if (state.tab === "roles_permissions") return rolesHtml();
    return "";
  }

  function render() {
    const section = document.querySelector("#view-director-center");
    if (!section) return;
    if (typeof isExpansionFeatureEnabled === "function" && !isExpansionFeatureEnabled("directorCenter")) {
      section.innerHTML = `
        <section class="dc-shell">
          <div class="page-title">
            <p class="eyebrow">Director Center</p>
            <h2>Unavailable</h2>
            <p>Director Center is not available in this environment.</p>
          </div>
        </section>
      `;
      return;
    }
    section.innerHTML = `
      <section class="dc-shell">
        <div class="page-title">
          <p class="eyebrow">Director Center</p>
          <h2>Admin Preview — Test Data Only</h2>
          <p>Private admin-preview workflow. Family Hub remains OFF. Production stays locked.</p>
        </div>
        <div class="dc-preview-bar">
          <label>Preview scenario
            <select data-dc-scenario>
              <option value="home_daycare"${state.scenario === "home_daycare" ? " selected" : ""}>Home Daycare</option>
              <option value="small_center"${state.scenario === "small_center" ? " selected" : ""}>Small Center</option>
              <option value="growing_center"${state.scenario === "growing_center" ? " selected" : ""}>Growing Center</option>
              <option value="large_center"${state.scenario === "large_center" ? " selected" : ""}>Large Center</option>
              <option value="at_limit"${state.scenario === "at_limit" ? " selected" : ""}>At Limit</option>
            </select>
          </label>
          <button type="button" class="ghost-button" data-dc-seed>Load fake preview data</button>
        </div>
        ${limitsBanner()}
        ${navHtml()}
        ${state.error ? `<p class="dc-error">${escapeHtml(state.error)}</p>` : ""}
        ${state.loading ? `<p class="muted-copy">Loading…</p>` : ""}
        ${bodyHtml()}
      </section>
    `;
    bind();
    if (state.tab === "families" && typeof global.bindFamilyFoundationTab === "function") {
      global.bindFamilyFoundationTab(section.querySelector("[data-ff-shell]") || section);
    }
    if (state.tab === "family_updates" && typeof global.renderFamilyUpdatesTab === "function") {
      global.renderFamilyUpdatesTab(section.querySelector("#dc-family-updates-mount") || section);
    }
    if (state.tab === "family_messaging" && typeof global.renderFamilyMessagingTab === "function") {
      global.renderFamilyMessagingTab(section.querySelector("#dc-family-messaging-mount") || section);
    }
    if (state.tab === "enrollment" && typeof global.renderEnrollmentTab === "function") {
      global.renderEnrollmentTab(section.querySelector("#dc-enrollment-mount") || section);
    }
    if (state.tab === "records_center" && typeof global.renderRecordsCenterTab === "function") {
      global.renderRecordsCenterTab(section.querySelector("#dc-records-center-mount") || section);
    }
    if (state.tab === "licensing_center" && typeof global.renderLicensingCenterTab === "function") {
      global.renderLicensingCenterTab(section.querySelector("#dc-licensing-center-mount") || section);
    }
    if (state.tab === "today_hub" && typeof global.renderTodayHubTab === "function") {
      global.renderTodayHubTab(section.querySelector("#dc-today-hub-mount") || section);
    }
    if (state.tab === "staff_experience" && typeof global.renderStaffExperienceTab === "function") {
      global.renderStaffExperienceTab(section.querySelector("#dc-staff-experience-mount") || section);
    }
    if (state.tab === "billing" && typeof global.renderBillingSimulatorTab === "function") {
      global.renderBillingSimulatorTab(section.querySelector("#dc-billing-simulator-mount") || section);
    }
  }

  function bind() {
    const root = document.querySelector("#view-director-center");
    if (!root || root.dataset.dcBound === "1") {
      // rebind each render
    }
    root.querySelectorAll("[data-dc-tab]").forEach((button) => {
      button.addEventListener("click", () => setTab(button.getAttribute("data-dc-tab")));
    });
    root.querySelector("[data-dc-seed]")?.addEventListener("click", async () => {
      try {
        const scenario = root.querySelector("[data-dc-scenario]")?.value || "small_center";
        state.scenario = scenario;
        await api("POST", "/api/director-center/seed", { scenario });
        state.tab = "overview";
        await refreshTab();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-dc-scenario]")?.addEventListener("change", (event) => {
      state.scenario = event.target.value;
    });
    root.querySelectorAll("[data-dc-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        state.filters[input.getAttribute("data-dc-filter")] = input.value;
        refreshTab().catch(() => {});
      });
      if (input.tagName === "INPUT" && input.type === "search") {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            state.filters[input.getAttribute("data-dc-filter")] = input.value;
            refreshTab().catch(() => {});
          }
        });
      }
    });
    root.querySelectorAll("[data-dc-filter-bool]").forEach((input) => {
      input.addEventListener("change", () => {
        state.filters[input.getAttribute("data-dc-filter-bool")] = input.checked;
        refreshTab().catch(() => {});
      });
    });
    root.querySelector("[data-dc-show-create-classroom]")?.addEventListener("click", () => {
      const form = root.querySelector("#dcCreateClassroomForm");
      if (form) form.hidden = !form.hidden;
    });
    root.querySelector("#dcCreateClassroomForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      try {
        await api("POST", "/api/director-center/classrooms", {
          name: data.get("name"),
          ageGroupDefault: data.get("ageGroupDefault"),
          capacity: data.get("capacity"),
          color: data.get("color"),
          description: data.get("description"),
        });
        await refreshTab();
      } catch (error) {
        window.alert(error.payload?.error || error.message);
      }
    });
    root.querySelectorAll("[data-dc-open-classroom]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          state.classroomDetail = await api("GET", `/api/director-center/classrooms/${button.getAttribute("data-dc-open-classroom")}`);
          render();
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
    root.querySelector("[data-dc-back-classrooms]")?.addEventListener("click", () => {
      state.classroomDetail = null;
      state.editingClassroom = false;
      refreshTab().catch(() => {});
    });
    root.querySelectorAll("[data-dc-toggle-edit-classroom]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editingClassroom = !state.editingClassroom;
        render();
      });
    });
    root.querySelector("#dcEditClassroomForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const roomId = state.classroomDetail?.classroom?.id;
      if (!roomId) return;
      const data = new FormData(event.target);
      try {
        await api("PATCH", `/api/director-center/classrooms/${roomId}`, {
          name: data.get("name"),
          ageGroupDefault: data.get("ageGroupDefault"),
          capacity: data.get("capacity"),
          color: data.get("color"),
          description: data.get("description"),
        });
        state.editingClassroom = false;
        state.classroomDetail = await api("GET", `/api/director-center/classrooms/${roomId}`);
        render();
      } catch (error) {
        window.alert(error.payload?.error || error.message);
      }
    });
    root.querySelector("[data-dc-archive-classroom]")?.addEventListener("click", async (event) => {
      const id = event.currentTarget.getAttribute("data-dc-archive-classroom");
      try {
        const preview = await api("POST", `/api/director-center/classrooms/${id}/archive`, {});
        if (preview.requiresConfirmation) {
          const ok = window.confirm(`${preview.warning}\n\nAssigned children: ${preview.assignedChildren}\nAssigned staff: ${preview.assignedStaff}\n\nArchive now? History is preserved.`);
          if (!ok) return;
          await api("POST", `/api/director-center/classrooms/${id}/archive`, { confirm: true });
          state.classroomDetail = null;
          await refreshTab();
        }
      } catch (error) {
        window.alert(error.message);
      }
    });
    root.querySelector("[data-dc-restore-classroom]")?.addEventListener("click", async (event) => {
      const id = event.currentTarget.getAttribute("data-dc-restore-classroom");
      try {
        await api("POST", `/api/director-center/classrooms/${id}/restore`, {});
        state.classroomDetail = await api("GET", `/api/director-center/classrooms/${id}`);
        render();
      } catch (error) {
        window.alert(error.payload?.error || error.message);
      }
    });
    root.querySelector("[data-dc-show-invite-staff]")?.addEventListener("click", () => {
      const form = root.querySelector("#dcInviteStaffForm");
      if (form) form.hidden = !form.hidden;
    });
    root.querySelector("#dcInviteStaffForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const classroomIds = data.getAll("classroomIds").map((v) => String(v).trim()).filter(Boolean);
      try {
        await api("POST", "/api/director-center/staff/invite", {
          email: data.get("email"),
          displayName: data.get("displayName"),
          role: data.get("role"),
          classroomIds,
        });
        await refreshTab();
      } catch (error) {
        window.alert(error.payload?.error || error.message);
      }
    });
    root.querySelectorAll("[data-dc-assign-staff]").forEach((button) => {
      button.addEventListener("click", () => {
        state.assigningStaffId = button.getAttribute("data-dc-assign-staff") || "";
        render();
      });
    });
    root.querySelectorAll("[data-dc-assign-staff-form]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const staffId = form.getAttribute("data-dc-assign-staff-form");
        const classroomIds = new FormData(form).getAll("classroomIds").map((v) => String(v).trim()).filter(Boolean);
        try {
          await api("PATCH", `/api/director-center/staff/${staffId}`, { classroomIds });
          state.assigningStaffId = "";
          await refreshTab();
        } catch (error) {
          window.alert(error.payload?.error || error.message);
        }
      });
    });
    root.querySelectorAll("[data-dc-staff-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("PATCH", `/api/director-center/staff/${button.getAttribute("data-id")}`, {
            status: button.getAttribute("data-dc-staff-action"),
          });
          await refreshTab();
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
    root.querySelector("[data-dc-show-assign-children]")?.addEventListener("click", () => {
      const form = root.querySelector("#dcAssignChildrenForm");
      if (form) form.hidden = !form.hidden;
    });
    root.querySelector("#dcAssignChildrenForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const childIds = data.getAll("childIds").map((v) => String(v).trim()).filter(Boolean);
      try {
        await api("POST", "/api/director-center/children/assign", {
          classroomId: data.get("classroomId"),
          childIds,
          displayName: data.get("displayName"),
        });
        await refreshTab();
      } catch (error) {
        window.alert(error.message);
      }
    });
    root.querySelectorAll("[data-dc-toggle-child-history]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-dc-toggle-child-history") || "";
        state.expandedChildId = state.expandedChildId === id ? "" : id;
        render();
      });
    });
    root.querySelector("[data-dc-addon-qty]")?.addEventListener("change", (event) => {
      state.addonQty = Math.max(0, Number(event.target.value) || 0);
    });
    root.querySelector("[data-dc-run-addon-sim]")?.addEventListener("click", async () => {
      const input = root.querySelector("[data-dc-addon-qty]");
      state.addonQty = Math.max(0, Number(input?.value) || 0);
      try {
        state.limits = await api("GET", `/api/director-center/limits?additionalClassrooms=${encodeURIComponent(state.addonQty)}`);
        render();
      } catch (error) {
        window.alert(error.message);
      }
    });
    root.querySelector("#dcProgramProfileForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target).entries());
      try {
        await api("PATCH", "/api/director-center/program-profile", data);
        await refreshTab();
        window.alert("Program Profile saved (preview only).");
      } catch (error) {
        window.alert(error.message);
      }
    });
    root.querySelectorAll("[data-dc-open-calendar]").forEach((button) => {
      button.addEventListener("click", () => {
        if (typeof setView === "function") setView("calendar");
      });
    });
    root.querySelectorAll("[data-dc-open-teacher-center]").forEach((button) => {
      button.addEventListener("click", () => {
        if (typeof setView === "function") setView("teacher-center");
      });
    });
    root.querySelectorAll("[data-dc-open-child]").forEach((button) => {
      button.addEventListener("click", () => {
        if (typeof setView === "function") setView("children");
      });
    });
  }

  global.renderDirectorCenterPreviewUI = function renderDirectorCenterPreviewUI() {
    render();
    refreshTab().catch((error) => {
      state.error = error.message || "Could not load Director Center preview.";
      render();
    });
  };
})(window);
