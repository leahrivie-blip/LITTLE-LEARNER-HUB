/**
 * Teacher Classroom Phase 3 admin-preview UI.
 * Fake preview data only. Requires verified admin + Director Center preview access.
 */
(function initTeacherCenterPreviewUI(global) {
  const API_PREFIX = "/api/director-center/phase3";
  const ROLE_PREVIEW_KEY = "llhPhase3RolePreviewMembershipId";
  const DAYS = [
    ["monday", "Mon"],
    ["tuesday", "Tue"],
    ["wednesday", "Wed"],
    ["thursday", "Thu"],
    ["friday", "Fri"],
  ];

  const state = {
    tab: "home",
    context: null,
    classrooms: [],
    children: [],
    calendar: null,
    dailyLogs: [],
    observations: [],
    goals: [],
    roleOptions: [],
    selectedClassroomId: "",
    selectedChildId: "",
    childProfile: null,
    childTimeline: [],
    childForms: [],
    childFormsLoading: false,
    activeForm: "",
    loading: false,
    error: "",
    message: "",
    scenario: "small_center",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function roleLabel(role) {
    const key = String(role || "").toLowerCase();
    const labels = {
      director_owner: "Director Owner",
      director: "Director",
      lead_teacher: "Lead Teacher",
      assistant_staff: "Assistant",
    };
    return labels[key] || (key ? key.replace(/_/g, " ") : "Admin");
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function mondayIsoDate(input) {
    const raw = String(input || "").trim();
    const date = raw ? new Date(`${raw.slice(0, 10)}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(date.getTime())) return todayIso();
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + diff);
    return date.toISOString().slice(0, 10);
  }

  function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  async function authHeaders() {
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    if (!token || typeof hasAdminFullAccess !== "function" || !hasAdminFullAccess()) {
      throw new Error("Verified admin unlock is required.");
    }
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    const previewMembershipId = localStorage.getItem(ROLE_PREVIEW_KEY) || "";
    if (previewMembershipId) headers["x-llh-role-preview-membership-id"] = previewMembershipId;
    return headers;
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

  function selectedClassroom() {
    return state.classrooms.find((room) => room.id === state.selectedClassroomId) || state.classrooms[0] || null;
  }

  function childrenForSelectedClassroom() {
    const classroomId = state.selectedClassroomId;
    if (!classroomId) return state.children;
    return state.children.filter((child) => child.classroomId === classroomId);
  }

  function can(action) {
    return state.context?.permissions?.actions?.[action] === true;
  }

  function setMessage(message) {
    state.message = message || "";
    state.error = "";
    render();
  }

  async function loadContext() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const [context, roleOptions] = await Promise.all([
        api("GET", `${API_PREFIX}/context`),
        api("GET", `${API_PREFIX}/role-preview-options`),
      ]);
      state.context = context;
      state.roleOptions = roleOptions.memberships || [];
      state.classrooms = context.classroomsVisible || [];
      if (!state.selectedClassroomId || !state.classrooms.some((room) => room.id === state.selectedClassroomId)) {
        state.selectedClassroomId = state.classrooms[0]?.id || "";
      }
      await refreshTabData();
    } catch (error) {
      state.error = error.message || "Could not load Teacher Classroom.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function refreshTabData() {
    const classroomId = state.selectedClassroomId || selectedClassroom()?.id || "";
    const weekStart = mondayIsoDate();
    const params = classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : "";
    const childrenData = await api("GET", `${API_PREFIX}/children${params}`);
    state.children = childrenData.children || [];
    if (classroomId) {
      state.calendar = await api("GET", `${API_PREFIX}/calendar?classroomId=${encodeURIComponent(classroomId)}&weekStart=${encodeURIComponent(weekStart)}`);
    } else {
      state.calendar = null;
    }
    if (state.tab === "daily-logs" || state.tab === "home") {
      const logs = await api("GET", `${API_PREFIX}/daily-logs${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`);
      state.dailyLogs = logs.dailyLogs || [];
    }
    if (state.tab === "observations" || state.tab === "home") {
      const observations = await api("GET", `${API_PREFIX}/observations`);
      state.observations = observations.observations || [];
    }
    if (state.tab === "goals" || state.tab === "home") {
      const goals = await api("GET", `${API_PREFIX}/goals`);
      state.goals = goals.goals || [];
    }
  }

  async function reload() {
    state.loading = true;
    state.error = "";
    render();
    try {
      await refreshTabData();
    } catch (error) {
      state.error = error.message || "Could not refresh Teacher Classroom.";
    } finally {
      state.loading = false;
      render();
    }
  }

  function previewBannerHtml() {
    const rolePreview = state.context?.rolePreview || {};
    const activeMembershipId = localStorage.getItem(ROLE_PREVIEW_KEY) || "";
    const activeRole = rolePreview.active ? rolePreview.role : "";
    const activeLabel = rolePreview.active ? roleLabel(activeRole) : "Admin";
    return `
      <div class="tc-preview-banner">
        <strong>Admin Preview — Test Data Only</strong>
        <span>No emails, Stripe, AI, or production child records are touched.</span>
      </div>
      <div class="tc-role-banner">
        <label>
          Role preview
          <select data-tc-role-preview>
            <option value="">Admin View</option>
            ${state.roleOptions.map((member) => `
              <option value="${escapeHtml(member.membershipId)}"${activeMembershipId === member.membershipId ? " selected" : ""}>
                ${escapeHtml(roleLabel(member.role))} — ${escapeHtml(member.displayName || member.email || member.membershipId)}
              </option>
            `).join("")}
          </select>
        </label>
        <span class="tc-role-status">${rolePreview.active ? `Previewing ${escapeHtml(activeLabel)}` : "Previewing Admin View"}</span>
        ${activeMembershipId ? `<button type="button" class="ghost-button" data-tc-return-admin>Return to Admin View</button>` : ""}
      </div>
    `;
  }

  function navHtml() {
    const tabs = [
      ["home", "Home"],
      ["calendar", "Calendar"],
      ["children", "Children"],
      ["daily-logs", "Daily Logs"],
      ["observations", "Observations"],
      ["goals", "Goals"],
    ];
    return `
      <nav class="tc-tabs" aria-label="Teacher Classroom sections">
        ${tabs.map(([id, label]) => `
          <button type="button" class="tc-tab${state.tab === id ? " active" : ""}" data-tc-tab="${id}">${escapeHtml(label)}</button>
        `).join("")}
      </nav>
    `;
  }

  function classroomSwitcherHtml() {
    return `
      <div class="tc-classroom-switcher">
        <label>
          Assigned Classroom
          <select data-tc-classroom>
            ${state.classrooms.map((room) => `
              <option value="${escapeHtml(room.id)}"${state.selectedClassroomId === room.id ? " selected" : ""}>${escapeHtml(room.name)}</option>
            `).join("")}
          </select>
        </label>
        <div>
          <strong>${escapeHtml(selectedClassroom()?.name || "No classroom assigned")}</strong>
          <span>${escapeHtml(childrenForSelectedClassroom().length)} children · ${escapeHtml(selectedClassroom()?.ageGroupDefault || "Mixed age")}</span>
        </div>
      </div>
    `;
  }

  function weekGridHtml(assignment) {
    const snapshot = assignment?.snapshot || {};
    const weekly = snapshot.weekly || {};
    return `
      <div class="tc-week-grid">
        ${DAYS.map(([key, label], index) => {
          const day = weekly[key] || {};
          const fallback = `${snapshot.lessonPlanTitle || "Classroom plan"} day ${index + 1}`;
          return `
            <article class="tc-week-cell">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(day.dailyTheme || fallback)}</strong>
              <p>${escapeHtml(day.activity1 || day.circleTime || `${fallback} activity`)}</p>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function todaySummaryHtml() {
    const date = todayIso();
    const todaysLogs = state.dailyLogs.filter((log) => log.date === date).length;
    const events = state.calendar?.events || [];
    const todayEvents = events.filter((event) => event.date === date);
    return `
      <section class="tc-panel">
        <div class="tc-section-heading">
          <div>
            <p class="eyebrow">Today</p>
            <h3>${escapeHtml(selectedClassroom()?.name || "Assigned Classroom")}</h3>
          </div>
          <span class="tc-pill">${escapeHtml(date)}</span>
        </div>
        <div class="tc-metric-grid">
          <article><strong>${escapeHtml(childrenForSelectedClassroom().length)}</strong><span>Assigned children</span></article>
          <article><strong>${escapeHtml(todaysLogs)}</strong><span>Daily logs today</span></article>
          <article><strong>${escapeHtml(todayEvents.length)}</strong><span>Events today</span></article>
        </div>
        <ul class="tc-list">
          ${todayEvents.map((event) => `<li><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.type || "event")}</span></li>`).join("") || "<li>No events scheduled today.</li>"}
        </ul>
      </section>
    `;
  }

  function quickActionsHtml() {
    const firstChild = childrenForSelectedClassroom()[0] || state.children[0] || null;
    return `
      <section class="tc-panel">
        <div class="tc-section-heading">
          <div>
            <p class="eyebrow">Quick actions</p>
            <h3>Classroom shortcuts</h3>
          </div>
        </div>
        <div class="tc-quick-actions">
          <button type="button" class="primary-button" data-tc-open-form="daily-log">Daily Log</button>
          <button type="button" class="ghost-button" data-tc-open-form="observation">Observation</button>
          <button type="button" class="ghost-button" data-tc-open-form="goal">Goal Update</button>
          <button type="button" class="ghost-button" data-tc-open-form="event">Classroom Event</button>
          <button type="button" class="ghost-button" data-tc-tab="calendar">View Lesson Plan</button>
          <button type="button" class="ghost-button" ${firstChild ? `data-tc-open-child="${escapeHtml(firstChild.id)}"` : "disabled"}>Open Child Profile</button>
        </div>
      </section>
    `;
  }

  function homeHtml() {
    return `
      ${classroomSwitcherHtml()}
      ${todaySummaryHtml()}
      <section class="tc-panel">
        <div class="tc-section-heading">
          <div>
            <p class="eyebrow">This Week's Curriculum</p>
            <h3>${escapeHtml(state.calendar?.assignment?.snapshot?.lessonPlanTitle || selectedClassroom()?.currentCurriculum?.lessonPlanTitle || "Classroom Lesson Plan")}</h3>
          </div>
          <button type="button" class="ghost-button" data-tc-tab="calendar">Open calendar</button>
        </div>
        ${weekGridHtml(state.calendar?.assignment)}
      </section>
      ${quickActionsHtml()}
      ${formsHtml()}
    `;
  }

  function childOptionsHtml(multiple) {
    const children = childrenForSelectedClassroom();
    if (multiple) {
      return children.map((child) => `
        <label class="tc-check">
          <input type="checkbox" name="childIds" value="${escapeHtml(child.id)}" ${children.length === 1 ? "checked" : ""}>
          ${escapeHtml(child.displayName)}
        </label>
      `).join("") || `<p class="tc-empty">No children are assigned to this classroom.</p>`;
    }
    return children.map((child) => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.displayName)}</option>`).join("");
  }

  function dailyLogFormHtml() {
    return `
      <form class="tc-form" data-tc-submit="daily-log">
        <div class="tc-form-title">
          <h3>Create daily log</h3>
          <button type="button" class="ghost-button" data-tc-close-form>Back</button>
        </div>
        <fieldset class="tc-fieldset">
          <legend>Children</legend>
          <div class="tc-checkbox-grid">${childOptionsHtml(true)}</div>
        </fieldset>
        <label>Date <input name="date" type="date" value="${escapeHtml(todayIso())}"></label>
        <label>Attendance <select name="attendance"><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option></select></label>
        <label>Meals <input name="meals" placeholder="Lunch and snack notes"></label>
        <label>Activities <textarea name="activities" rows="3" placeholder="What did the group work on?"></textarea></label>
        <label>Mood <input name="mood" placeholder="Calm, curious, busy"></label>
        <label>Teacher notes <textarea name="teacherNotes" rows="3"></textarea></label>
        <button type="submit" class="primary-button">Save daily log</button>
      </form>
    `;
  }

  function observationFormHtml() {
    return `
      <form class="tc-form" data-tc-submit="observation">
        <div class="tc-form-title">
          <h3>Create observation</h3>
          <button type="button" class="ghost-button" data-tc-close-form>Back</button>
        </div>
        <label>Child <select name="childId" required>${childOptionsHtml(false)}</select></label>
        <label>Date <input name="date" type="date" value="${escapeHtml(todayIso())}"></label>
        <label>Observation <textarea name="text" rows="4" required placeholder="What did you notice?"></textarea></label>
        <label>Learning domains <input name="learningDomains" placeholder="Social Emotional, Language"></label>
        <label>Sharing status
          <select name="sharingStatus">
            <option value="private_staff">Private staff note</option>
            <option value="waiting_director_review">Waiting director review</option>
            <option value="shared_with_family">Shared with family (preview only)</option>
          </select>
        </label>
        <button type="submit" class="primary-button">Save observation</button>
      </form>
    `;
  }

  function goalFormHtml() {
    return `
      <form class="tc-form" data-tc-submit="goal">
        <div class="tc-form-title">
          <h3>Create goal</h3>
          <button type="button" class="ghost-button" data-tc-close-form>Back</button>
        </div>
        <label>Child <select name="childId" required>${childOptionsHtml(false)}</select></label>
        <label>Learning domain <input name="learningDomain" value="Social Emotional"></label>
        <label>Goal <textarea name="description" rows="3" required></textarea></label>
        <label>Next step <textarea name="targetOrNextStep" rows="2"></textarea></label>
        <button type="submit" class="primary-button">Save goal</button>
      </form>
    `;
  }

  function eventFormHtml() {
    return `
      <form class="tc-form" data-tc-submit="event">
        <div class="tc-form-title">
          <h3>Create classroom event</h3>
          <button type="button" class="ghost-button" data-tc-close-form>Back</button>
        </div>
        <label>Date <input name="date" type="date" value="${escapeHtml(todayIso())}"></label>
        <label>Title <input name="title" required placeholder="Classroom event"></label>
        <label>Type <input name="type" value="classroom_event"></label>
        <label>Notes <textarea name="notes" rows="3"></textarea></label>
        <button type="submit" class="primary-button">Save event</button>
      </form>
    `;
  }

  function lessonFormHtml() {
    const existingId = state.calendar?.assignment?.id || "";
    return `
      <form class="tc-form" data-tc-submit="${existingId ? "replace-lesson" : "assign-lesson"}">
        <div class="tc-form-title">
          <h3>${existingId ? "Replace lesson plan" : "Assign lesson plan"}</h3>
          <button type="button" class="ghost-button" data-tc-close-form>Back</button>
        </div>
        <label>Lesson title <input name="lessonPlanTitle" required value="${escapeHtml(existingId ? "Replacement Preview Lesson" : "Teacher Center Preview Lesson")}"></label>
        <label>Lesson ID <input name="lessonPlanId" value="${escapeHtml(existingId ? "phase3-replacement-preview" : "phase3-assigned-preview")}"></label>
        <label>Theme <input name="theme" value="Teacher Center"></label>
        ${existingId ? `<input type="hidden" name="assignmentId" value="${escapeHtml(existingId)}">` : ""}
        <p class="muted-copy">${existingId ? "Replacing preserves the old assignment as historical preview data." : "The API fills Monday-Friday snapshot fields if a lesson is sparse."}</p>
        <button type="submit" class="primary-button">${existingId ? "Replace lesson" : "Assign lesson"}</button>
      </form>
    `;
  }

  function progressFormHtml() {
    const openGoals = state.goals.filter((goal) => !state.selectedChildId || goal.childId === state.selectedChildId);
    return `
      <form class="tc-form" data-tc-submit="goal-progress">
        <div class="tc-form-title">
          <h3>Add goal progress</h3>
          <button type="button" class="ghost-button" data-tc-close-form>Back</button>
        </div>
        <label>Goal
          <select name="goalId" required>
            ${openGoals.map((goal) => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.description || goal.learningDomain || goal.id)}</option>`).join("")}
          </select>
        </label>
        <label>Date <input name="date" type="date" value="${escapeHtml(todayIso())}"></label>
        <label>Progress note <textarea name="text" rows="3" required></textarea></label>
        <button type="submit" class="primary-button">Save progress</button>
      </form>
    `;
  }

  function formsHtml() {
    if (!state.activeForm) return "";
    const forms = {
      "daily-log": dailyLogFormHtml,
      observation: observationFormHtml,
      goal: goalFormHtml,
      event: eventFormHtml,
      lesson: lessonFormHtml,
      "goal-progress": progressFormHtml,
    };
    const renderForm = forms[state.activeForm];
    return renderForm ? `<section class="tc-form-shell">${renderForm()}</section>` : "";
  }

  function calendarHtml() {
    const assignment = state.calendar?.assignment || null;
    const events = state.calendar?.events || [];
    return `
      ${classroomSwitcherHtml()}
      <section class="tc-panel">
        <div class="tc-section-heading">
          <div>
            <p class="eyebrow">Calendar</p>
            <h3>${escapeHtml(assignment?.snapshot?.lessonPlanTitle || "No active lesson plan")}</h3>
            <p>${escapeHtml(state.calendar?.weekStartDate || mondayIsoDate())}</p>
          </div>
          ${can("assignLesson") ? `<button type="button" class="primary-button" data-tc-open-form="lesson">${assignment ? "Replace Lesson" : "Assign Lesson"}</button>` : ""}
        </div>
        ${weekGridHtml(assignment)}
      </section>
      <section class="tc-panel">
        <div class="tc-section-heading">
          <h3>Classroom events</h3>
          ${can("addCalendarEvent") ? `<button type="button" class="ghost-button" data-tc-open-form="event">Add Event</button>` : ""}
        </div>
        <ul class="tc-list">
          ${events.map((event) => `<li><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.date)} · ${escapeHtml(event.type)}</span></li>`).join("") || "<li>No calendar events yet.</li>"}
        </ul>
      </section>
      ${formsHtml()}
    `;
  }

  function childrenHtml() {
    if (state.childProfile) return childProfileHtml();
    const children = childrenForSelectedClassroom();
    return `
      ${classroomSwitcherHtml()}
      <section class="tc-panel">
        <div class="tc-section-heading">
          <div>
            <p class="eyebrow">Children</p>
            <h3>Classroom profiles</h3>
          </div>
        </div>
        <div class="tc-child-grid">
          ${children.map((child) => `
            <article class="tc-child-card">
              <div>
                <strong>${escapeHtml(child.displayName)}</strong>
                <span>${escapeHtml(child.ageGroup || "Age group")} · ${escapeHtml(child.classroomName || "Unassigned")}</span>
              </div>
              <button type="button" class="ghost-button" data-tc-open-child="${escapeHtml(child.id)}">Open Profile</button>
            </article>
          `).join("") || `<p class="tc-empty">No children are assigned to this classroom.</p>`}
        </div>
      </section>
    `;
  }

  function redactedValueHtml(value, fallback) {
    if (value && typeof value === "object" && value.redacted === true) {
      return `<span class="tc-redacted">Redacted - ${escapeHtml(value.reason || "permission required")}</span>`;
    }
    if (Array.isArray(value)) return escapeHtml(value.map((item) => item.name || item.label || item).join(", ") || fallback);
    if (value && typeof value === "object") return escapeHtml(value.notes || value.list?.join(", ") || value.people?.map((p) => p.name).join(", ") || fallback);
    return escapeHtml(value || fallback);
  }

  function childProfileHtml() {
    const child = state.childProfile.child || {};
    const profile = child.profile || {};
    return `
      <section class="tc-panel">
        <button type="button" class="ghost-button back-button" data-tc-back-children>Back to Children</button>
        <div class="tc-profile-hero">
          <div>
            <p class="eyebrow">Child profile</p>
            <h3>${escapeHtml(child.displayName)}</h3>
            <p>${escapeHtml(child.ageGroup || "")} · ${escapeHtml(child.classroomName || "")}</p>
          </div>
          <button type="button" class="primary-button" data-tc-open-form="daily-log">Daily Log</button>
        </div>
        <div class="tc-profile-grid">
          <article><strong>Overview</strong><p>${escapeHtml(profile.overview || "No overview yet.")}</p></article>
          <article><strong>Medical</strong><p>${redactedValueHtml(profile.medicalInformation, "No medical notes.")}</p></article>
          <article><strong>Allergies</strong><p>${redactedValueHtml(profile.allergies, "No allergies listed.")}</p></article>
          <article><strong>Emergency contacts</strong><p>${redactedValueHtml(profile.familyEmergencyContacts, "Emergency details unavailable.")}</p></article>
        </div>
      </section>
      <section class="tc-panel">
        <div class="tc-section-heading">
          <h3>Timeline</h3>
          <button type="button" class="ghost-button" data-tc-open-form="goal-progress">Goal Update</button>
        </div>
        <ul class="tc-timeline">
          ${state.childTimeline.map((entry) => `
            <li>
              <span>${escapeHtml(entry.type.replace(/_/g, " "))}</span>
              <strong>${escapeHtml(entry.item?.title || entry.item?.text || entry.item?.description || entry.item?.teacherNotes || entry.item?.classroomLabel || "Timeline item")}</strong>
              <small>${escapeHtml(entry.at || "")}</small>
            </li>
          `).join("") || "<li>No timeline entries yet.</li>"}
        </ul>
      </section>
      ${childFormsHtml()}
      ${formsHtml()}
    `;
  }

  function dailyLogsHtml() {
    return `
      ${classroomSwitcherHtml()}
      <section class="tc-panel">
        <div class="tc-section-heading">
          <div>
            <p class="eyebrow">Daily Logs</p>
            <h3>Care notes</h3>
          </div>
          <button type="button" class="primary-button" data-tc-open-form="daily-log">Create Daily Log</button>
        </div>
        <ul class="tc-list">
          ${state.dailyLogs.map((log) => `<li><strong>${escapeHtml(childName(log.childId))}</strong><span>${escapeHtml(log.date)} · ${escapeHtml(log.attendance || "log")} · ${escapeHtml(log.teacherNotes || log.activities || "")}</span></li>`).join("") || "<li>No daily logs yet.</li>"}
        </ul>
      </section>
      ${formsHtml()}
    `;
  }

  function observationsHtml() {
    return `
      ${classroomSwitcherHtml()}
      <section class="tc-panel">
        <div class="tc-section-heading">
          <div>
            <p class="eyebrow">Observations</p>
            <h3>Learning moments</h3>
          </div>
          <button type="button" class="primary-button" data-tc-open-form="observation">Create Observation</button>
        </div>
        <ul class="tc-list">
          ${state.observations.map((obs) => `<li><strong>${escapeHtml(childName(obs.childId))}</strong><span>${escapeHtml(obs.text || "Observation")} · ${escapeHtml(obs.sharingStatus || "private")}</span></li>`).join("") || "<li>No observations yet.</li>"}
        </ul>
      </section>
      ${formsHtml()}
    `;
  }

  function goalsHtml() {
    return `
      ${classroomSwitcherHtml()}
      <section class="tc-panel">
        <div class="tc-section-heading">
          <div>
            <p class="eyebrow">Goals</p>
            <h3>Development goals</h3>
          </div>
          <div class="tc-inline-actions">
            <button type="button" class="ghost-button" data-tc-open-form="goal-progress">Goal Update</button>
            <button type="button" class="primary-button" data-tc-open-form="goal">Create Goal</button>
          </div>
        </div>
        <ul class="tc-list">
          ${state.goals.map((goal) => `<li><strong>${escapeHtml(childName(goal.childId))}</strong><span>${escapeHtml(goal.description || goal.learningDomain)} · ${escapeHtml((goal.progressNotes || []).length)} progress notes</span></li>`).join("") || "<li>No goals yet.</li>"}
        </ul>
      </section>
      ${formsHtml()}
    `;
  }

  function childName(childId) {
    return state.children.find((child) => child.id === childId)?.displayName || childId || "Child";
  }

  /**
   * Phase 6: Forms/Documents section on the child profile. Reads the same
   * organization-scoped responses the Forms Center Responses dashboard uses,
   * filtered to this permanent child ID — never a name string.
   */
  async function loadChildForms(childId) {
    state.childFormsLoading = true;
    render();
    try {
      const data = await api("GET", `/api/forms-center/children/${encodeURIComponent(childId)}/forms`);
      state.childForms = data.responses || [];
    } catch (error) {
      state.childForms = [];
    } finally {
      state.childFormsLoading = false;
      render();
    }
  }

  function childFormsHtml() {
    return `
      <section class="tc-panel">
        <div class="tc-section-heading">
          <h3>Forms &amp; Documents</h3>
        </div>
        ${state.childFormsLoading ? `<p class="muted-copy">Loading forms...</p>` : ""}
        <ul class="tc-list tc-child-forms-list">
          ${state.childForms.map((row) => `
            <li>
              <strong>${escapeHtml(row.formTitle)}</strong>
              <span>
                ${escapeHtml(row.statusLabel)} ·
                Guardian: ${escapeHtml(row.recipientLabel || "—")} ·
                ${row.submittedAt ? `Submitted ${escapeHtml(row.submittedAt.slice(0, 10))}` : "Not submitted yet"}
                ${row.approvedAt ? ` · Approved ${escapeHtml(row.approvedAt.slice(0, 10))}` : ""}
                · Version ${escapeHtml(row.formVersionNumber)}
                · ${escapeHtml(row.signatureCount)} signature${row.signatureCount === 1 ? "" : "s"}
                ${row.newerVersionAvailable ? " · Newer form version available" : ""}
              </span>
            </li>
          `).join("") || "<li>No forms filed for this child yet.</li>"}
        </ul>
      </section>
    `;
  }

  function activeTabHtml() {
    if (state.loading && !state.context) return `<section class="tc-panel"><p class="muted-copy">Loading Teacher Classroom preview...</p></section>`;
    if (!state.classrooms.length) return `<section class="tc-panel"><p class="tc-empty">No assigned classrooms are visible for this role preview.</p></section>`;
    if (state.tab === "calendar") return calendarHtml();
    if (state.tab === "children") return childrenHtml();
    if (state.tab === "daily-logs") return dailyLogsHtml();
    if (state.tab === "observations") return observationsHtml();
    if (state.tab === "goals") return goalsHtml();
    return homeHtml();
  }

  function render() {
    const root = document.querySelector("#view-teacher-center");
    if (!root) return;
    root.innerHTML = `
      <section class="tc-shell">
        <div class="tc-page-title">
          <div>
            <p class="eyebrow">Teacher Classroom · Phase 3</p>
            <h2>Teacher Classroom Experience</h2>
            <p>Preview classroom curriculum, care notes, child profiles, observations, and goals with role-scoped access.</p>
          </div>
          <button type="button" class="ghost-button" data-tc-seed>Seed Preview Data</button>
        </div>
        ${previewBannerHtml()}
        ${state.error ? `<div class="tc-error">${escapeHtml(state.error)}</div>` : ""}
        ${state.message ? `<div class="tc-message">${escapeHtml(state.message)}</div>` : ""}
        ${navHtml()}
        ${activeTabHtml()}
      </section>
    `;
    bind();
  }

  function formPayload(form) {
    const data = new FormData(form);
    const payload = {};
    data.forEach((value, key) => {
      if (payload[key] !== undefined) {
        payload[key] = Array.isArray(payload[key]) ? payload[key].concat(String(value)) : [payload[key], String(value)];
      } else {
        payload[key] = String(value);
      }
    });
    if (form.querySelectorAll('input[name="childIds"]').length) {
      payload.childIds = Array.from(form.querySelectorAll('input[name="childIds"]:checked')).map((input) => input.value);
    }
    return payload;
  }

  async function submitForm(type, form) {
    const payload = formPayload(form);
    payload.classroomId = state.selectedClassroomId;
    if (type === "observation" && payload.learningDomains) {
      payload.learningDomains = String(payload.learningDomains).split(",").map((item) => item.trim()).filter(Boolean);
    }
    if (type === "daily-log") await api("POST", `${API_PREFIX}/daily-logs`, payload);
    if (type === "observation") await api("POST", `${API_PREFIX}/observations`, payload);
    if (type === "goal") await api("POST", `${API_PREFIX}/goals`, payload);
    if (type === "event") await api("POST", `${API_PREFIX}/calendar/events`, payload);
    if (type === "assign-lesson") {
      payload.weekStart = state.calendar?.weekStartDate || mondayIsoDate();
      await api("POST", `${API_PREFIX}/calendar/assign`, payload);
    }
    if (type === "replace-lesson") {
      const ok = global.confirm("Replace this week's lesson plan? The current assignment will be preserved as history.");
      if (!ok) return;
      payload.confirm = true;
      await api("POST", `${API_PREFIX}/calendar/replace`, payload);
    }
    if (type === "goal-progress") {
      const goalId = payload.goalId;
      delete payload.goalId;
      await api("POST", `${API_PREFIX}/goals/${encodeURIComponent(goalId)}/progress`, payload);
    }
    state.activeForm = "";
    setMessage("Saved preview record.");
    await reload();
  }

  function bind() {
    const root = document.querySelector("#view-teacher-center");
    if (!root) return;
    root.querySelectorAll("[data-tc-tab]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.tab = button.getAttribute("data-tc-tab") || "home";
        state.activeForm = "";
        state.childProfile = null;
        await reload();
      });
    });
    root.querySelector("[data-tc-classroom]")?.addEventListener("change", async (event) => {
      state.selectedClassroomId = event.target.value;
      state.childProfile = null;
      await reload();
    });
    root.querySelector("[data-tc-role-preview]")?.addEventListener("change", async (event) => {
      const value = event.target.value || "";
      if (value) localStorage.setItem(ROLE_PREVIEW_KEY, value);
      else localStorage.removeItem(ROLE_PREVIEW_KEY);
      state.childProfile = null;
      await loadContext();
    });
    root.querySelector("[data-tc-return-admin]")?.addEventListener("click", async () => {
      localStorage.removeItem(ROLE_PREVIEW_KEY);
      state.childProfile = null;
      await loadContext();
    });
    root.querySelector("[data-tc-seed]")?.addEventListener("click", async () => {
      state.loading = true;
      render();
      try {
        await api("POST", `${API_PREFIX}/seed`, { scenario: state.scenario });
        setMessage("Phase 3 preview data seeded.");
        await loadContext();
      } catch (error) {
        state.error = error.message || "Could not seed preview data.";
        state.loading = false;
        render();
      }
    });
    root.querySelectorAll("[data-tc-open-form]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeForm = button.getAttribute("data-tc-open-form") || "";
        render();
      });
    });
    root.querySelectorAll("[data-tc-close-form]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeForm = "";
        render();
      });
    });
    root.querySelectorAll("[data-tc-open-child]").forEach((button) => {
      button.addEventListener("click", async () => {
        const childId = button.getAttribute("data-tc-open-child") || "";
        state.loading = true;
        render();
        try {
          const [profile, timeline] = await Promise.all([
            api("GET", `${API_PREFIX}/children/${encodeURIComponent(childId)}`),
            api("GET", `${API_PREFIX}/children/${encodeURIComponent(childId)}/timeline`),
          ]);
          state.tab = "children";
          state.selectedChildId = childId;
          state.childProfile = profile;
          state.childTimeline = timeline.timeline || [];
        } catch (error) {
          state.error = error.message || "Could not load child profile.";
        } finally {
          state.loading = false;
          render();
        }
        loadChildForms(childId).catch(() => {});
      });
    });
    root.querySelector("[data-tc-back-children]")?.addEventListener("click", () => {
      state.childProfile = null;
      state.selectedChildId = "";
      state.activeForm = "";
      state.childForms = [];
      render();
    });
    root.querySelectorAll("[data-tc-submit]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const type = form.getAttribute("data-tc-submit") || "";
        state.loading = true;
        render();
        try {
          await submitForm(type, form);
        } catch (error) {
          state.error = error.message || "Could not save preview record.";
          state.loading = false;
          render();
        }
      });
    });
  }

  global.renderTeacherCenterPreviewUI = function renderTeacherCenterPreviewUI() {
    render();
    loadContext().catch((error) => {
      state.error = error.message || "Could not load Teacher Classroom.";
      state.loading = false;
      render();
    });
  };
})(window);
