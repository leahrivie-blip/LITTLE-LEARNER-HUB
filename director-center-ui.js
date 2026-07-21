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
        const data = await api("GET", `/api/director-center/staff?${params}`);
        state.staff = data.staff || [];
        state.limits = data.limits;
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
      } else if (state.tab === "roles_permissions") {
        state.roles = await api("GET", "/api/director-center/roles-permissions");
        state.limits = await api("GET", "/api/director-center/limits");
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
      ["children", "Children and Assignments"],
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
    const limits = state.limits || state.overview?.limits;
    if (!limits) return "";
    const notes = [];
    if (limits.classroomNearLimit && limits.messages?.classroomWarning) notes.push(limits.messages.classroomWarning);
    if (limits.staffNearLimit && limits.messages?.staffWarning) notes.push(limits.messages.staffWarning);
    if (limits.classroomAtLimit && limits.messages?.classroomBlocked) notes.push(limits.messages.classroomBlocked);
    if (limits.staffAtLimit && limits.messages?.staffBlocked) notes.push(limits.messages.staffBlocked);
    if (limits.messages?.homeDaycareUpgrade) notes.push(limits.messages.homeDaycareUpgrade);
    if (limits.upgradeRecommendation?.recommendUpgrade) notes.push(limits.upgradeRecommendation.message);
    if (!notes.length) {
      return `
        <div class="dc-limits-banner dc-limits-ok">
          Plan preview: ${escapeHtml(limits.planLabel)} · Classrooms ${limits.classroomsUsed}/${limits.classroomLimit} · Staff ${limits.staffUsed}/${limits.staffAccountLimit}
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
              ${room.status === "archived"
                ? `<button type="button" class="primary-button" data-dc-restore-classroom="${escapeHtml(room.id)}">Restore</button>`
                : `<button type="button" class="ghost-button" data-dc-archive-classroom="${escapeHtml(room.id)}">Archive</button>`}
              <button type="button" class="ghost-button" data-dc-open-calendar>Open Calendar</button>
            </div>
          </div>
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
            <option value="active">Active</option>
            <option value="invitation_pending">Invitation pending</option>
            <option value="deactivated">Deactivated</option>
            <option value="inactive">Inactive</option>
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
          <label>Classroom IDs (comma-separated, optional) <input name="classroomIds" placeholder="classroom_..." /></label>
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
                ${member.status === "invitation_pending" ? `<button type="button" class="ghost-button" data-dc-staff-action="resend_invite" data-id="${escapeHtml(member.id)}">Resend</button>` : ""}
                ${member.status === "invitation_pending" ? `<button type="button" class="ghost-button" data-dc-staff-action="cancel_invite" data-id="${escapeHtml(member.id)}">Cancel</button>` : ""}
                ${member.status === "active" ? `<button type="button" class="ghost-button" data-dc-staff-action="deactivate" data-id="${escapeHtml(member.id)}">Deactivate</button>` : ""}
                ${member.status === "deactivated" ? `<button type="button" class="ghost-button" data-dc-staff-action="restore" data-id="${escapeHtml(member.id)}">Restore</button>` : ""}
              </div>
            </article>
          `).join("") || `<div class="dc-empty">No staff match these filters.</div>`}
        </div>
      </section>
    `;
  }

  function childrenHtml() {
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
              ${(state.classrooms || []).filter((r) => r.status === "active").map((room) => `
                <option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>
              `).join("")}
            </select>
          </label>
          <label>Child IDs (comma-separated) <input name="childIds" placeholder="Leave blank to create one" /></label>
          <label>Or create child name <input name="displayName" /></label>
          <button class="primary-button" type="submit">Save assignments</button>
        </form>
        <div class="dc-card-list">
          ${(state.children || []).map((child) => `
            <article class="dc-card">
              <div>
                <h4>${escapeHtml(child.displayName)}</h4>
                <p>ID: ${escapeHtml(child.id)}</p>
                <p>Classroom: ${escapeHtml(child.classroomName || "Unassigned")}</p>
                <p>History: ${(child.history || []).length} assignment record(s)</p>
              </div>
              <div class="dc-inline-actions">
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
    const limits = state.limits || {};
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
            <p>${escapeHtml(limits.limits?.planLabel || limits.planLabel || "")}</p>
            <p>Classrooms ${escapeHtml(limits.limits?.classroomsUsed ?? limits.classroomsUsed ?? 0)} / ${escapeHtml(limits.limits?.classroomLimit ?? limits.classroomLimit ?? 0)}</p>
            <p>Staff ${escapeHtml(limits.limits?.staffUsed ?? limits.staffUsed ?? 0)} / ${escapeHtml(limits.limits?.staffAccountLimit ?? limits.staffAccountLimit ?? 0)}</p>
            <p class="muted-copy">No Stripe products created. Founding Member $9.99 base remains untouched.</p>
            <h5>Permission keys</h5>
            <ul class="dc-list compact">
              ${Object.keys(catalog.actions || {}).slice(0, 12).map((key) => `<li>${escapeHtml(catalog.actions[key])}</li>`).join("")}
            </ul>
          </section>
        </div>
      </section>
    `;
  }

  function bodyHtml() {
    if (state.tab === "overview") return overviewHtml();
    if (state.tab === "classrooms") return classroomsHtml();
    if (state.tab === "staff") return staffHtml();
    if (state.tab === "children") return childrenHtml();
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
          <p>Private admin-preview workflow. Forms Center and Family Hub remain OFF. Production stays locked.</p>
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
      refreshTab().catch(() => {});
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
      const classroomIds = String(data.get("classroomIds") || "").split(",").map((v) => v.trim()).filter(Boolean);
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
      const childIds = String(data.get("childIds") || "").split(",").map((v) => v.trim()).filter(Boolean);
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
