/**
 * Phase 9 Family Hub — mobile-first testing preview UI.
 * Navigation: Home, Children, Forms, Calendar, Account.
 * No Messages / Media / Billing. Fake data only.
 */
(function initFamilyHubUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Data Only.";
  const state = {
    tab: "home",
    home: null,
    children: [],
    selectedChildId: "",
    childDetail: null,
    forms: [],
    formFilter: "action_needed",
    formDetail: null,
    documents: [],
    calendar: [],
    account: null,
    messages: [],
    enrollmentCases: [],
    enrollmentDetail: null,
    recordsList: [],
    recordDetail: null,
    messageThread: null,
    messageDraft: "",
    notifications: [],
    unreadMessages: 0,
    loading: false,
    error: "",
    notice: "",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function memberAuthHeaders() {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    const token = global.localStorage?.getItem("llhMemberSessionToken") || "";
    const email = global.localStorage?.getItem("llhUser") || "";
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (email) headers.Authorization = `Bearer test:${email}`;
    if (state.selectedChildId) headers["x-llh-selected-child-id"] = state.selectedChildId;
    return headers;
  }

  async function api(method, path, body) {
    const response = await fetch(path, {
      method,
      headers: memberAuthHeaders(),
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.code = data.code;
      error.payload = data;
      throw error;
    }
    return data;
  }

  function childSwitcherHtml(children, selectedChildId) {
    if (!children || children.length < 2) return "";
    return `
      <label class="fh-child-switcher">
        <span>Child</span>
        <select data-fh-child-switch>
          ${children.map((child) => `
            <option value="${escapeHtml(child.childId)}"${child.childId === selectedChildId ? " selected" : ""}>
              ${escapeHtml(child.displayName || "Child")}
            </option>
          `).join("")}
        </select>
      </label>
    `;
  }

  function navHtml() {
    // Phase 11 nav decision: Messages replaces Calendar in the bottom bar (max five).
    // Calendar remains available under Account.
    const unread = state.unreadMessages || state.home?.unreadMessages || 0;
    const items = [
      ["home", "Home"],
      ["children", "Children"],
      ["forms", "Forms"],
      ["messages", `Messages${unread ? ` (${unread})` : ""}`],
      ["account", "Account"],
    ];
    return `
      <nav class="fh-bottom-nav" aria-label="Family Hub">
        ${items.map(([id, label]) => `
          <button type="button" class="fh-nav-btn${state.tab === id ? " active" : ""}" data-fh-tab="${id === "messages" ? "messages" : id.split(" ")[0]}">
            <span class="fh-nav-label">${id === "messages" ? "Messages" : label}${id === "messages" && unread ? `<span class="fh-badge">${unread}</span>` : ""}</span>
          </button>
        `).join("")}
      </nav>
      <aside class="fh-sidebar" aria-label="Family Hub">
        <p class="fh-brand">Family Hub</p>
        ${[["home", "Home"], ["children", "Children"], ["forms", "Forms"], ["messages", "Messages"], ["account", "Account"]].map(([id, label]) => `
          <button type="button" class="fh-side-btn${state.tab === id ? " active" : ""}" data-fh-tab="${id}">${label}${id === "messages" && unread ? ` · ${unread}` : ""}</button>
        `).join("")}
        <p class="fh-roadmap muted-copy">Calendar is under Account. Billing arrives later.</p>
      </aside>
    `;
  }

  function homeHtml() {
    const data = state.home;
    if (!data) return `<p class="muted-copy">Loading…</p>`;
    return `
      <section class="fh-panel">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1 class="fh-welcome">${escapeHtml(data.welcome || "Welcome")}</h1>
        ${childSwitcherHtml(data.children, data.selectedChildId)}
        ${data.empty ? `<p class="fh-empty">${escapeHtml(data.emptyMessage || "Nothing needs your attention right now.")}</p>` : ""}
        <section class="fh-section">
          <h2>Messages ${(data.unreadMessages || 0) ? `<span class="fh-badge">${escapeHtml(String(data.unreadMessages))}</span>` : ""}</h2>
          <button type="button" class="primary-button fh-touch" data-fh-tab="messages">Open Messages</button>
        </section>
        <section class="fh-section">
          <h2>Enrollment</h2>
          <p class="muted-copy">Application progress, tours, offers, and checklist (testing only).</p>
          <button type="button" class="primary-button fh-touch" data-fh-tab="enrollment">Open enrollment checklist</button>
        </section>
        <section class="fh-section">
          <h2>Documents</h2>
          <p class="muted-copy">Family-visible records for your children (testing only).</p>
          <button type="button" class="primary-button fh-touch" data-fh-tab="records">Open Documents</button>
        </section>
        <section class="fh-section">
          <h2>Action Needed</h2>
          ${!(data.actionNeeded || []).length ? `<p class="muted-copy">You're all caught up.</p>` : `
            <ul class="fh-card-list">
              ${(data.actionNeeded || []).map((item) => `
                <li>
                  <button type="button" class="fh-card" data-fh-open-task="${escapeHtml(item.href)}" data-fh-task-id="${escapeHtml(item.id)}" data-fh-child="${escapeHtml(item.childId || "")}">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(String(item.kind || "").replace(/_/g, " "))}</span>
                  </button>
                </li>
              `).join("")}
            </ul>
          `}
        </section>
        <section class="fh-section">
          <h2>Forms to complete</h2>
          <ul class="fh-card-list">
            ${(data.formsToComplete || []).map((row) => `
              <li><button type="button" class="fh-card" data-fh-open-form="${escapeHtml(row.assignmentId)}">${escapeHtml(row.formTitle)}</button></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Awaiting another signature</h2>
          <ul class="fh-card-list">
            ${(data.awaitingSignature || []).map((row) => `
              <li><button type="button" class="fh-card" data-fh-open-form="${escapeHtml(row.assignmentId)}">${escapeHtml(row.formTitle)}</button></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Returned forms</h2>
          <ul class="fh-card-list">
            ${(data.returnedForms || []).map((row) => `
              <li><button type="button" class="fh-card" data-fh-open-form="${escapeHtml(row.assignmentId)}">${escapeHtml(row.formTitle)} — needs correction</button></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Recent updates</h2>
          <ul class="fh-card-list">
            ${(data.recentUpdates || []).map((row) => `
              <li class="fh-card static">
                <strong>${escapeHtml(row.title)}</strong>
                <span>${escapeHtml((row.sharedAt || row.occurredAt || "").slice(0, 10))}${row.isCorrection ? " · corrected" : ""}</span>
                <p class="muted-copy">${escapeHtml(row.message || "")}</p>
                <button type="button" class="fh-link-btn" data-fh-ack="update" data-fh-ack-id="${escapeHtml(row.id)}">Acknowledge</button>
              </li>
            `).join("") || "<li class=\"muted-copy\">No updates yet</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Today’s Daily Report</h2>
          ${data.todaysDailyReport ? `
            <div class="fh-card static">
              <strong>${escapeHtml(data.todaysDailyReport.date || "")}</strong>
              <p>Arrival: ${escapeHtml(data.todaysDailyReport.arrival || "—")} · Mood: ${escapeHtml(data.todaysDailyReport.mood || "—")}</p>
              <p>${escapeHtml(data.todaysDailyReport.teacherNote || data.todaysDailyReport.activities || "")}</p>
              <button type="button" class="fh-link-btn" data-fh-ack="daily_report" data-fh-ack-id="${escapeHtml(data.todaysDailyReport.id)}">Acknowledge</button>
            </div>
          ` : `<p class="muted-copy">No Daily Report shared for today.</p>`}
        </section>
        <section class="fh-section">
          <h2>Photos and Videos</h2>
          <ul class="fh-card-list">
            ${(data.familyMedia || []).map((row) => `
              <li class="fh-card static">
                <strong>${escapeHtml(row.caption || row.kind)}</strong>
                <span>${escapeHtml(row.placeholderLabel || "")}</span>
              </li>
            `).join("") || "<li class=\"muted-copy\">No family-visible media</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Shared observations</h2>
          <ul class="fh-card-list">
            ${(data.sharedObservations || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.text || "")}</strong></li>
            `).join("") || "<li class=\"muted-copy\">None shared</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Shared goals</h2>
          <ul class="fh-card-list">
            ${(data.sharedGoals || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.description || "")}</strong><span>${escapeHtml(row.learningDomain || "")}</span></li>
            `).join("") || "<li class=\"muted-copy\">None shared</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Upcoming</h2>
          <ul class="fh-card-list">
            ${(data.upcomingCalendar || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml((row.startsAt || "").slice(0, 10))}</span></li>
            `).join("") || "<li class=\"muted-copy\">No upcoming items</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Document requests</h2>
          <ul class="fh-card-list">
            ${(data.documentRequests || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.status)}</span></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Pending information changes</h2>
          <ul class="fh-card-list">
            ${(data.pendingChangeRequests || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.type.replace(/_/g, " "))}</strong><span>Pending provider review</span></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Recent approved records</h2>
          <ul class="fh-card-list">
            ${(data.recentApproved || []).map((row) => `
              <li><button type="button" class="fh-card" data-fh-open-form="${escapeHtml(row.assignmentId)}">${escapeHtml(row.formTitle)}</button></li>
            `).join("") || "<li class=\"muted-copy\">None yet</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h2>Program contact</h2>
          <p><strong>${escapeHtml(data.programContact?.programName || "")}</strong></p>
          <p class="muted-copy">${escapeHtml(data.programContact?.note || "")}</p>
        </section>
        <p class="fh-roadmap muted-copy">${escapeHtml(data.roadmapNote || "")}</p>
      </section>
    `;
  }

  function childrenHtml() {
    if (state.childDetail) {
      const c = state.childDetail.child || {};
      return `
        <section class="fh-panel">
          <button type="button" class="ghost-button" data-fh-back-children>← All children</button>
          <div class="fh-child-hero">
            <div class="fh-avatar" aria-hidden="true">${escapeHtml(c.profileInitial || "?")}</div>
            <div>
              <h1>${escapeHtml(c.displayName || "")}</h1>
              <p class="muted-copy">${escapeHtml(c.classroom || "")} · ${escapeHtml(c.program || "")}</p>
              <p>${escapeHtml(c.relationship || "")} · ${escapeHtml(c.accessLevelLabel || "")}</p>
            </div>
          </div>
          ${c.allergySummary ? `<p class="fh-safety"><strong>Allergy / safety:</strong> ${escapeHtml(c.allergySummary)}</p>` : ""}
          <p><strong>Emergency:</strong> ${escapeHtml(c.emergencySummary || "On file with the program.")}</p>
          <p><strong>Authorized pickup:</strong> ${escapeHtml(c.authorizedPickupSummary || "Managed by the program.")}</p>
          <h2>Assigned forms</h2>
          <ul class="fh-card-list">
            ${(state.childDetail.forms || []).map((row) => `
              <li><button type="button" class="fh-card" data-fh-open-form="${escapeHtml(row.assignmentId)}">${escapeHtml(row.formTitle)} · ${escapeHtml(row.statusLabel)}</button></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
          <h2>Family-visible documents</h2>
          <ul class="fh-card-list">
            ${(state.childDetail.documents || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.status)}</span></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
          <h2>Updates</h2>
          <ul class="fh-card-list">
            ${(state.childDetail.recentUpdates || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.message || "")}</span></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
          <h2>Daily Reports</h2>
          <ul class="fh-card-list">
            ${(state.childDetail.dailyReports || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.date || "")}</strong><span>${escapeHtml(row.teacherNote || row.activities || "")}</span></li>
            `).join("") || "<li class=\"muted-copy\">None shared</li>"}
          </ul>
          <h2>Photos and Videos</h2>
          <ul class="fh-card-list">
            ${(state.childDetail.familyMedia || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.caption || row.kind)}</strong></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
          <h2>Shared observations</h2>
          <ul class="fh-card-list">
            ${(state.childDetail.sharedObservations || []).map((row) => `
              <li class="fh-card static">${escapeHtml(row.text || "")}</li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
          <h2>Shared goals</h2>
          <ul class="fh-card-list">
            ${(state.childDetail.sharedGoals || []).map((row) => `
              <li class="fh-card static">${escapeHtml(row.description || "")}</li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
          <form class="fh-form" data-fh-upload>
            <h3>Upload requested document (testing)</h3>
            <input type="hidden" name="childId" value="${escapeHtml(c.id)}" />
            <label>Title <input name="title" required placeholder="Document title" /></label>
            <button type="submit" class="primary-button">Submit for provider review</button>
          </form>
        </section>
      `;
    }
    return `
      <section class="fh-panel">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1>Children</h1>
        <ul class="fh-card-list">
          ${(state.children || []).map((child) => `
            <li>
              <button type="button" class="fh-card" data-fh-open-child="${escapeHtml(child.childId)}">
                <strong>${escapeHtml(child.displayName)}</strong>
                <span>${escapeHtml(child.accessLevelLabel || child.accessLevel || "")}</span>
              </button>
            </li>
          `).join("") || "<li class=\"muted-copy\">No children available for your account.</li>"}
        </ul>
      </section>
    `;
  }

  function formsHtml() {
    if (state.formDetail) {
      const detail = state.formDetail;
      const form = detail.form || {};
      const response = detail.response || {};
      return `
        <section class="fh-panel">
          <button type="button" class="ghost-button" data-fh-back-forms>← Forms</button>
          <h1>${escapeHtml(form.title || "Form")}</h1>
          <p class="muted-copy">Status: ${escapeHtml(response.status || "")}</p>
          <form class="fh-form" data-fh-form-save data-assignment="${escapeHtml(detail.assignment?.id || "")}">
            ${(detail.fields || detail.sections || []).length ? "" : ""}
            <p class="muted-copy">Complete required fields, then sign and submit. Exact form version is preserved.</p>
            <textarea name="answersNote" rows="4" placeholder="Testing answers (JSON or notes)">${escapeHtml(JSON.stringify(response.answers || {}, null, 2))}</textarea>
            <label>Typed signature <input name="signerName" required value="${escapeHtml(detail.contactName || "")}" /></label>
            <div class="fh-form-actions">
              <button type="submit" class="ghost-button" data-fh-save-only>Save draft</button>
              <button type="button" class="primary-button" data-fh-submit-form>Sign & submit</button>
            </div>
          </form>
          ${response.status === "approved" || response.status === "submitted" || response.status === "under_review" ? `
            <button type="button" class="ghost-button" data-fh-view-doc="${escapeHtml(detail.assignment?.id || "")}">View / print document</button>
          ` : ""}
        </section>
      `;
    }
    const filters = [
      ["action_needed", "Action needed"],
      ["in_progress", "In progress"],
      ["submitted", "Submitted"],
      ["returned", "Returned"],
      ["approved", "Approved"],
      ["archived", "Archived"],
      ["all", "All"],
    ];
    return `
      <section class="fh-panel">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1>Forms</h1>
        ${childSwitcherHtml(state.home?.children || state.children, state.selectedChildId)}
        <div class="fh-filters">
          ${filters.map(([id, label]) => `
            <button type="button" class="fh-filter${state.formFilter === id ? " active" : ""}" data-fh-form-filter="${id}">${label}</button>
          `).join("")}
        </div>
        <ul class="fh-card-list">
          ${(state.forms || []).map((row) => `
            <li>
              <button type="button" class="fh-card" data-fh-open-form="${escapeHtml(row.assignmentId)}">
                <strong>${escapeHtml(row.formTitle)}</strong>
                <span>${escapeHtml(row.statusLabel)}${row.dueAt ? ` · due ${(row.dueAt || "").slice(0, 10)}` : ""}</span>
              </button>
            </li>
          `).join("") || "<li class=\"muted-copy\">No forms in this filter.</li>"}
        </ul>
      </section>
    `;
  }

  function calendarHtml() {
    return `
      <section class="fh-panel">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1>Calendar</h1>
        ${childSwitcherHtml(state.home?.children || state.children, state.selectedChildId)}
        <ul class="fh-card-list">
          ${(state.calendar || []).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.title)}</strong>
              <span>${escapeHtml((row.startsAt || "").slice(0, 10))} · ${escapeHtml(row.eventType)}</span>
            </li>
          `).join("") || "<li class=\"muted-copy\">No family-visible events.</li>"}
        </ul>
      </section>
    `;
  }

  function accountHtml() {
    const data = state.account;
    if (!data) return `<p class="muted-copy">Loading…</p>`;
    return `
      <section class="fh-panel">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1>Account</h1>
        <p><strong>${escapeHtml(data.account?.displayName || "")}</strong></p>
        <p class="muted-copy">${escapeHtml(data.account?.email || "")}</p>
        <h2>Connected children</h2>
        <ul class="fh-card-list">
          ${(data.children || []).map((child) => `
            <li class="fh-card static"><strong>${escapeHtml(child.displayName)}</strong><span>${escapeHtml(child.accessLevelLabel || "")}</span></li>
          `).join("")}
        </ul>
        <h2>Household contacts</h2>
        ${(data.households || []).map((hh) => `
          <div class="fh-section">
            <h3>${escapeHtml(hh.displayName)}</h3>
            <ul class="fh-card-list">
              ${(hh.contacts || []).map((c) => `
                <li class="fh-card static">${escapeHtml(c.displayName)} · ${escapeHtml(c.relationshipDefault || "")}</li>
              `).join("")}
            </ul>
          </div>
        `).join("") || "<p class=\"muted-copy\">No household contacts listed.</p>"}
        <form class="fh-form" data-fh-change-request>
          <h2>Request an information change</h2>
          <label>Type
            <select name="type">
              <option value="contact_info">Contact information</option>
              <option value="emergency_contact">Emergency contact</option>
              <option value="authorized_pickup_add">Add authorized pickup</option>
              <option value="authorized_pickup_remove">Remove authorized pickup</option>
            </select>
          </label>
          <label>Child
            <select name="childId">
              ${(data.children || []).map((child) => `<option value="${escapeHtml(child.childId)}">${escapeHtml(child.displayName)}</option>`).join("")}
            </select>
          </label>
          <label>Details <textarea name="details" rows="3" required></textarea></label>
          <button type="submit" class="primary-button">Submit for provider review</button>
        </form>
        <h2>Pending requests</h2>
        <ul class="fh-card-list">
          ${(data.changeRequests || []).filter((row) => row.status === "pending").map((row) => `
            <li class="fh-card static">${escapeHtml(row.type.replace(/_/g, " "))} · pending</li>
          `).join("") || "<li class=\"muted-copy\">None</li>"}
        </ul>
        <form class="fh-form" data-fh-notif-prefs>
          <h2>Notification preferences</h2>
          <p class="muted-copy">Saved for a later phase — nothing is sent now.</p>
          <label class="fh-check"><input type="checkbox" name="email" ${data.notificationPreferences?.channels?.email ? "checked" : ""}/> Email</label>
          <label class="fh-check"><input type="checkbox" name="sms" ${data.notificationPreferences?.channels?.sms ? "checked" : ""}/> SMS</label>
          <label class="fh-check"><input type="checkbox" name="push" ${data.notificationPreferences?.channels?.push ? "checked" : ""}/> Push</label>
          <label class="fh-check"><input type="checkbox" name="immediate" ${data.notificationPreferences?.cadence?.immediate ? "checked" : ""}/> Immediate</label>
          <label class="fh-check"><input type="checkbox" name="dailyDigest" ${data.notificationPreferences?.cadence?.dailyDigest ? "checked" : ""}/> Daily digest</label>
          <label class="fh-check"><input type="checkbox" name="weeklyDigest" ${data.notificationPreferences?.cadence?.weeklyDigest ? "checked" : ""}/> Weekly digest</label>
          <button type="submit" class="ghost-button">Save preferences</button>
        </form>
        <form class="fh-form" data-fh-password>
          <h2>Change testing password</h2>
          <label>Current <input type="password" name="currentPassword" required autocomplete="current-password" /></label>
          <label>New <input type="password" name="newPassword" required minlength="10" autocomplete="new-password" /></label>
          <button type="submit" class="ghost-button">Update password</button>
        </form>
        <section class="fh-section">
          <h2>Calendar</h2>
          <p class="muted-copy">Calendar lives here so Messages can stay in the main navigation (max five items).</p>
          <button type="button" class="ghost-button" data-fh-open-calendar>Open calendar</button>
        </section>
        <button type="button" class="primary-button" data-fh-sign-out>Sign out</button>
      </section>
    `;
  }

  function enrollmentHtml() {
    const cases = state.enrollmentCases || [];
    if (state.enrollmentDetail) {
      const detail = state.enrollmentDetail;
      const c = detail.case || {};
      const offer = detail.offer;
      const packet = detail.packet;
      return `
        <section class="fh-panel">
          <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
          <button type="button" class="ghost-button" data-fh-back-enrollment>← Checklist</button>
          <h1>${escapeHtml(c.childName || "Enrollment")}</h1>
          <p class="muted-copy">${escapeHtml(c.statusLabel || "")}</p>
          <p class="muted-copy">Start date: ${escapeHtml(c.desiredStartDate || "—")}</p>
          ${detail.tour ? `<p>Tour: ${escapeHtml(detail.tour.status)} ${escapeHtml((detail.tour.scheduledAt || "").slice(0, 16))}</p>` : ""}
          <h2>Checklist</h2>
          <ul class="fh-card-list">
            ${(detail.checklist || []).map((item) => `
              <li class="fh-card static">
                <strong>${escapeHtml(item.label || item.labelFriendly || item.key)}</strong>
                <span>${escapeHtml(item.status || "")}</span>
                ${item.returnedReason ? `<p>${escapeHtml(item.returnedReason)}</p>` : ""}
              </li>
            `).join("")}
          </ul>
          ${packet ? `
            <h2>Forms</h2>
            <ul class="fh-card-list">
              ${(packet.items || []).map((item) => `
                <li class="fh-card static">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.status)}</span>
                  ${item.status === "in_progress" || item.status === "not_started" || item.status === "returned" ? `
                    <button type="button" class="ghost-button" data-fh-en-save="${escapeHtml(item.key)}">Save progress</button>
                  ` : ""}
                </li>
              `).join("")}
            </ul>
          ` : ""}
          ${offer ? `
            <h2>Fake enrollment offer</h2>
            <p class="muted-copy">${escapeHtml(offer.fakeLabel || "")}</p>
            <p>Start ${escapeHtml(offer.proposedStartDate || "")} · ${escapeHtml(offer.schedule || "")}</p>
            <p>Simulated tuition $${escapeHtml(String(offer.tuitionAmountSimulated || 0))} (no real charge)</p>
            ${offer.status === "sent_testing" ? `
              <button type="button" class="primary-button" data-fh-en-accept-offer="${escapeHtml(offer.id)}">Accept offer</button>
              <button type="button" class="ghost-button" data-fh-en-decline-offer="${escapeHtml(offer.id)}">Decline</button>
            ` : `<p>Status: ${escapeHtml(offer.status)}</p>`}
          ` : ""}
          <p class="muted-copy">${escapeHtml((detail.case && detail.case.programContactNote) || c.programContactNote || "")}</p>
        </section>
      `;
    }
    return `
      <section class="fh-panel">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1>Enrollment</h1>
        <p class="muted-copy">Only your household applications are shown.</p>
        <ul class="fh-card-list">
          ${cases.map((row) => `
            <li>
              <button type="button" class="fh-card" data-fh-open-enrollment="${escapeHtml(row.id)}">
                <strong>${escapeHtml(row.childName || "Application")}</strong>
                <span>${escapeHtml(row.statusLabel || row.stage || "")}</span>
              </button>
            </li>
          `).join("") || "<li class=\"muted-copy\">No enrollment applications yet.</li>"}
        </ul>
      </section>
    `;
  }

  function recordsHtml() {
    if (state.recordDetail) {
      const r = state.recordDetail.record || state.recordDetail || {};
      return `
        <section class="fh-panel">
          <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
          <button type="button" class="ghost-button" data-fh-back-records>← Documents</button>
          <h1>${escapeHtml(r.title || "Document")}</h1>
          <p class="muted-copy">${escapeHtml(r.category || "")} · ${escapeHtml(r.status || "")}</p>
          <p class="muted-copy">Expires: ${escapeHtml(r.expirationDate || "—")}</p>
        </section>
      `;
    }
    const records = state.recordsList || [];
    return `
      <section class="fh-panel">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1>Documents</h1>
        <p class="muted-copy">Only family-visible records for your children are shown.</p>
        <ul class="fh-card-list">
          ${records.map((row) => `
            <li>
              <button type="button" class="fh-card" data-fh-open-record="${escapeHtml(row.id)}">
                <strong>${escapeHtml(row.title || "Document")}</strong>
                <span>${escapeHtml(row.status || "")} · ${escapeHtml(row.category || "")}</span>
              </button>
            </li>
          `).join("") || "<li class=\"muted-copy\">No documents yet.</li>"}
        </ul>
      </section>
    `;
  }

    function messagesHtml() {
    if (state.messageThread) {
      const thread = state.messageThread;
      const conv = thread.conversation || {};
      return `
        <section class="fh-panel">
          <button type="button" class="ghost-button" data-fh-back-messages>← Inbox</button>
          <h1>${escapeHtml(conv.subject || "Conversation")}</h1>
          <p class="muted-copy">${escapeHtml(conv.participantSummary || "")}</p>
          <ul class="fh-card-list fh-message-list">
            ${(thread.messages || []).map((msg) => `
              <li class="fh-card static ${msg.withdrawn ? "fh-withdrawn" : ""}">
                <strong>${escapeHtml(msg.withdrawn ? (msg.withdrawnNotice || "Withdrawn") : (msg.senderRole || "Message"))}</strong>
                <span>${escapeHtml((msg.sentAt || "").slice(0, 16).replace("T", " "))}${msg.edited ? " · Edited" : ""}</span>
                ${msg.withdrawn ? "" : `<p>${escapeHtml(msg.body || "")}</p>`}
              </li>
            `).join("") || "<li class=\"muted-copy\">No messages yet</li>"}
          </ul>
          ${thread.canReply ? `
            <form class="fh-form" data-fh-reply>
              <label>Reply <textarea name="body" rows="3" required placeholder="Write a reply">${escapeHtml(state.messageDraft || "")}</textarea></label>
              <div class="fu-actions">
                <button type="button" class="ghost-button" data-fh-save-draft>Save draft</button>
                <button type="submit" class="primary-button">Send</button>
              </div>
            </form>
          ` : `<p class="muted-copy">Replies are not enabled for this conversation.</p>`}
        </section>
      `;
    }
    return `
      <section class="fh-panel">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1>Messages ${(state.unreadMessages || 0) ? `<span class="fh-badge">${escapeHtml(String(state.unreadMessages))}</span>` : ""}</h1>
        ${childSwitcherHtml(state.home?.children || state.children, state.selectedChildId)}
        <form class="fh-form" data-fh-msg-search>
          <label>Search <input name="q" placeholder="Search conversations" /></label>
        </form>
        <button type="button" class="ghost-button" data-fh-start-message>Message your program</button>
        <ul class="fh-card-list">
          ${(state.messages || []).map((row) => `
            <li>
              <button type="button" class="fh-card" data-fh-open-message="${escapeHtml(row.id)}">
                <strong>${escapeHtml(row.subject || "Conversation")}</strong>
                <span>${escapeHtml(row.announcement ? "Announcement" : row.type || "")} · ${escapeHtml((row.lastActivityAt || "").slice(0, 10))}</span>
              </button>
            </li>
          `).join("") || "<li class=\"muted-copy\">No conversations yet.</li>"}
        </ul>
        <h2>Notifications</h2>
        <ul class="fh-card-list">
          ${(state.notifications || []).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.title || "")}</strong>
              <span>${escapeHtml(row.preview || "")}</span>
              ${row.read ? "" : `<button type="button" class="fh-link-btn" data-fh-open-note="${escapeHtml(row.id)}">Open</button>`}
            </li>
          `).join("") || "<li class=\"muted-copy\">No notifications</li>"}
        </ul>
      </section>
    `;
  }

  function bodyHtml() {
    if (state.tab === "home") return homeHtml();
    if (state.tab === "children") return childrenHtml();
    if (state.tab === "forms") return formsHtml();
    if (state.tab === "messages") return messagesHtml();
    if (state.tab === "enrollment") return enrollmentHtml();
    if (state.tab === "records") return recordsHtml();
    if (state.tab === "calendar") return calendarHtml();
    if (state.tab === "account") return accountHtml();
    return "";
  }

  async function refresh() {
    state.loading = true;
    state.error = "";
    render();
    try {
      if (state.tab === "home") {
        const q = state.selectedChildId ? `?childId=${encodeURIComponent(state.selectedChildId)}` : "";
        state.home = await api("GET", `/api/family-hub/home${q}`);
        state.children = state.home.children || [];
        state.unreadMessages = state.home.unreadMessages || 0;
        if (state.home.selectedChildId) state.selectedChildId = state.home.selectedChildId;
      } else if (state.tab === "children") {
        if (state.childDetail) {
          /* keep detail */
        } else {
          const data = await api("GET", "/api/family-hub/children");
          state.children = data.children || [];
        }
      } else if (state.tab === "forms") {
        if (!state.formDetail) {
          const q = new URLSearchParams({
            filter: state.formFilter || "all",
            ...(state.selectedChildId ? { childId: state.selectedChildId } : {}),
          });
          const data = await api("GET", `/api/family-hub/forms?${q}`);
          state.forms = data.forms || [];
          state.children = data.children || state.children;
          if (data.selectedChildId) state.selectedChildId = data.selectedChildId;
        }
      } else if (state.tab === "calendar") {
        const q = state.selectedChildId ? `?childId=${encodeURIComponent(state.selectedChildId)}` : "";
        const data = await api("GET", `/api/family-hub/calendar${q}`);
        state.calendar = data.events || [];
        if (data.selectedChildId) state.selectedChildId = data.selectedChildId;
      } else if (state.tab === "enrollment") {
        if (!state.enrollmentDetail) {
          const data = await api("GET", "/api/family-hub/enrollment");
          state.enrollmentCases = data.cases || [];
        }
      } else if (state.tab === "records") {
        if (!state.recordDetail) {
          const q = state.selectedChildId ? `?childId=${encodeURIComponent(state.selectedChildId)}` : "";
          const data = await api("GET", `/api/family-hub/records${q}`);
          state.recordsList = data.records || [];
          state.children = data.children || state.children;
        }
      } else if (state.tab === "messages") {
        if (!state.messageThread) {
          const q = state.selectedChildId ? `?childId=${encodeURIComponent(state.selectedChildId)}` : "";
          const data = await api("GET", `/api/family-hub/messages${q}`);
          state.messages = data.conversations || [];
          state.unreadMessages = data.unreadMessages || 0;
          state.children = data.children || state.children;
          const notes = await api("GET", "/api/family-hub/notifications");
          state.notifications = notes.notifications || [];
        }
      } else if (state.tab === "account") {
        state.account = await api("GET", "/api/family-hub/account");
        state.children = state.account.children || [];
      }
    } catch (error) {
      state.error = error.message || "Could not load Family Hub.";
    } finally {
      state.loading = false;
      render();
    }
  }

  function render() {
    const section = document.querySelector("#view-family-hub");
    if (!section) return;
    section.hidden = false;
    section.setAttribute("aria-hidden", "false");
    section.innerHTML = `
      <div class="fh-shell">
        ${navHtml()}
        <main class="fh-main">
          ${state.error ? `<p class="fh-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          ${state.notice ? `<p class="fh-notice" role="status">${escapeHtml(state.notice)}</p>` : ""}
          ${state.loading ? `<p class="muted-copy">Loading…</p>` : ""}
          ${bodyHtml()}
        </main>
      </div>
    `;
    bind(section);
  }

  function setTab(tab) {
    state.tab = tab;
    state.formDetail = null;
    state.childDetail = null;
    state.messageThread = null;
    state.enrollmentDetail = null;
    state.recordDetail = null;
    state.notice = "";
    refresh();
  }

  function bind(root) {
    root.querySelectorAll("[data-fh-tab]").forEach((button) => {
      button.addEventListener("click", () => setTab(button.getAttribute("data-fh-tab")));
    });
    root.querySelector("[data-fh-open-calendar]")?.addEventListener("click", () => setTab("calendar"));
    root.querySelectorAll("[data-fh-open-message]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          state.messageThread = await api("GET", `/api/family-hub/messages/${encodeURIComponent(button.getAttribute("data-fh-open-message"))}`);
          state.unreadMessages = Math.max(0, (state.unreadMessages || 1) - 1);
          render();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelector("[data-fh-back-messages]")?.addEventListener("click", () => {
      state.messageThread = null;
      refresh();
    });

    root.querySelectorAll("[data-fh-open-enrollment]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          state.enrollmentDetail = await api("GET", `/api/family-hub/enrollment/${encodeURIComponent(button.getAttribute("data-fh-open-enrollment"))}`);
          render();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelector("[data-fh-back-enrollment]")?.addEventListener("click", () => {
      state.enrollmentDetail = null;
      refresh();
    });
    root.querySelectorAll("[data-fh-open-record]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          state.recordDetail = await api("GET", `/api/family-hub/records/${encodeURIComponent(button.getAttribute("data-fh-open-record"))}`);
          render();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelector("[data-fh-back-records]")?.addEventListener("click", () => {
      state.recordDetail = null;
      refresh();
    });
    root.querySelectorAll("[data-fh-en-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        const caseId = state.enrollmentDetail?.case?.id;
        if (!caseId) return;
        try {
          await api("POST", `/api/family-hub/enrollment/${encodeURIComponent(caseId)}/packet-progress`, {
            key: button.getAttribute("data-fh-en-save"),
            status: "in_progress",
          });
          state.enrollmentDetail = await api("GET", `/api/family-hub/enrollment/${encodeURIComponent(caseId)}`);
          state.notice = "Progress saved.";
          render();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelectorAll("[data-fh-en-accept-offer]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("POST", `/api/family-hub/enrollment/offers/${encodeURIComponent(button.getAttribute("data-fh-en-accept-offer"))}/respond`, {
            accept: true,
            acknowledgment: "I acknowledge this fake testing offer.",
          });
          const caseId = state.enrollmentDetail?.case?.id;
          state.enrollmentDetail = await api("GET", `/api/family-hub/enrollment/${encodeURIComponent(caseId)}`);
          state.notice = "Offer accepted (testing — no charge).";
          render();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelectorAll("[data-fh-en-decline-offer]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("POST", `/api/family-hub/enrollment/offers/${encodeURIComponent(button.getAttribute("data-fh-en-decline-offer"))}/respond`, {
            decline: true,
            reason: "Declined in testing.",
          });
          const caseId = state.enrollmentDetail?.case?.id;
          state.enrollmentDetail = await api("GET", `/api/family-hub/enrollment/${encodeURIComponent(caseId)}`);
          state.notice = "Offer declined.";
          render();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelector("[data-fh-reply]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target;
      const body = new FormData(form).get("body");
      try {
        await api("POST", `/api/family-hub/messages/${encodeURIComponent(state.messageThread.conversation.id)}/reply`, { body });
        state.messageDraft = "";
        state.messageThread = await api("GET", `/api/family-hub/messages/${encodeURIComponent(state.messageThread.conversation.id)}`);
        state.notice = "Message sent to your in-app inbox (not emailed).";
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-save-draft]")?.addEventListener("click", async () => {
      const form = root.querySelector("[data-fh-reply]");
      const body = form ? new FormData(form).get("body") : "";
      try {
        await api("POST", "/api/family-hub/messages/draft", {
          conversationId: state.messageThread.conversation.id,
          body,
        });
        state.messageDraft = String(body || "");
        state.notice = "Draft autosaved.";
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-start-message]")?.addEventListener("click", async () => {
      try {
        const childId = state.selectedChildId || state.children?.[0]?.childId || state.home?.selectedChildId;
        const created = await api("POST", "/api/family-hub/messages/start", {
          childId,
          subject: "Message to program",
          body: "Hello — testing family message (fixture).",
        });
        state.messageThread = await api("GET", `/api/family-hub/messages/${encodeURIComponent(created.conversation.id)}`);
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelectorAll("[data-fh-open-note]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const opened = await api("GET", `/api/family-hub/notifications/${encodeURIComponent(button.getAttribute("data-fh-open-note"))}/open`);
          if (opened.notification?.conversationId) {
            state.messageThread = await api("GET", `/api/family-hub/messages/${encodeURIComponent(opened.notification.conversationId)}`);
          }
          await refresh();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelector("[data-fh-child-switch]")?.addEventListener("change", async (event) => {
      state.selectedChildId = event.target.value;
      state.formDetail = null;
      state.childDetail = null;
      state.notice = "";
      await refresh();
    });
    root.querySelectorAll("[data-fh-open-task]").forEach((button) => {
      button.addEventListener("click", () => {
        const href = button.getAttribute("data-fh-open-task");
        const childId = button.getAttribute("data-fh-child");
        if (childId) state.selectedChildId = childId;
        if (href === "home") {
          refresh();
          return;
        }
        setTab(href === "children" ? "children" : href === "account" ? "account" : "forms");
      });
    });
    root.querySelectorAll("[data-fh-ack]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("POST", "/api/family-hub/acknowledge", {
            targetType: button.getAttribute("data-fh-ack"),
            targetId: button.getAttribute("data-fh-ack-id"),
            childId: state.selectedChildId,
          });
          state.notice = "Acknowledged. This is not a legal signature.";
          await refresh();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelectorAll("[data-fh-open-child]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-fh-open-child");
        state.selectedChildId = id;
        try {
          state.childDetail = await api("GET", `/api/family-hub/children/${encodeURIComponent(id)}`);
          render();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelector("[data-fh-back-children]")?.addEventListener("click", () => {
      state.childDetail = null;
      refresh();
    });
    root.querySelectorAll("[data-fh-form-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.formFilter = button.getAttribute("data-fh-form-filter");
        state.formDetail = null;
        refresh();
      });
    });
    root.querySelectorAll("[data-fh-open-form]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-fh-open-form");
        state.tab = "forms";
        try {
          state.formDetail = await api("GET", `/api/family-hub/forms/${encodeURIComponent(id)}`);
          render();
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });
    root.querySelector("[data-fh-back-forms]")?.addEventListener("click", () => {
      state.formDetail = null;
      refresh();
    });
    root.querySelector("[data-fh-form-save]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const assignmentId = form.getAttribute("data-assignment");
      let answers = {};
      try { answers = JSON.parse(form.answersNote.value); } catch { answers = { notes: form.answersNote.value }; }
      try {
        await api("POST", `/api/family-hub/forms/${encodeURIComponent(assignmentId)}/save-draft`, { answers });
        state.notice = "Draft saved.";
        state.formDetail = await api("GET", `/api/family-hub/forms/${encodeURIComponent(assignmentId)}`);
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-submit-form]")?.addEventListener("click", async () => {
      const form = root.querySelector("[data-fh-form-save]");
      if (!form) return;
      const assignmentId = form.getAttribute("data-assignment");
      let answers = {};
      try { answers = JSON.parse(form.answersNote.value); } catch { answers = { notes: form.answersNote.value }; }
      try {
        await api("POST", `/api/family-hub/forms/${encodeURIComponent(assignmentId)}/submit`, {
          answers,
          signature: { signerName: form.signerName.value, signatureType: "typed", typedName: form.signerName.value },
        });
        state.notice = "Form signed and submitted.";
        state.formDetail = await api("GET", `/api/family-hub/forms/${encodeURIComponent(assignmentId)}`);
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-view-doc]")?.addEventListener("click", async () => {
      const id = root.querySelector("[data-fh-view-doc]").getAttribute("data-fh-view-doc");
      try {
        const doc = await api("GET", `/api/family-hub/forms/${encodeURIComponent(id)}/document`);
        state.notice = doc.frozen ? "Locked approved document ready." : "Submitted document view ready.";
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-upload]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("POST", "/api/family-hub/documents/upload", {
          childId: form.childId.value,
          title: form.title.value,
        });
        state.notice = "Upload submitted for provider review (not auto-approved).";
        state.childDetail = await api("GET", `/api/family-hub/children/${encodeURIComponent(form.childId.value)}`);
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-change-request]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("POST", "/api/family-hub/account/change-request", {
          type: form.type.value,
          childId: form.childId.value,
          payload: { details: form.details.value },
        });
        state.notice = "Change request submitted for provider review.";
        state.account = await api("GET", "/api/family-hub/account");
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-notif-prefs]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("POST", "/api/family-hub/account/notification-preferences", {
          channels: { email: form.email.checked, sms: form.sms.checked, push: form.push.checked },
          cadence: { immediate: form.immediate.checked, dailyDigest: form.dailyDigest.checked, weeklyDigest: form.weeklyDigest.checked },
        });
        state.notice = "Preferences saved. Nothing was sent.";
        state.account = await api("GET", "/api/family-hub/account");
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-password]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("POST", "/api/family-hub/account/change-password", {
          currentPassword: form.currentPassword.value,
          newPassword: form.newPassword.value,
        });
        state.notice = "Password updated.";
        form.reset();
        render();
      } catch (error) {
        state.error = error.message;
        render();
      }
    });
    root.querySelector("[data-fh-sign-out]")?.addEventListener("click", () => {
      try {
        global.localStorage?.removeItem("llhMemberSessionToken");
        global.localStorage?.removeItem("llhUser");
      } catch { /* ignore */ }
      if (typeof setView === "function") setView("home", { allowDashboard: true, skipExpansionFeatureRedirect: true });
    });
  }

  function renderFamilyHubPage() {
    state.tab = state.tab || "home";
    refresh();
  }

  global.renderFamilyHubPage = renderFamilyHubPage;
  global.familyHubUiState = state;
})(typeof window !== "undefined" ? window : globalThis);
