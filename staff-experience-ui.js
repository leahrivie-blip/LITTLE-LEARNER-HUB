/**
 * Phase 16 — Director Center Staff Experience tab.
 * Directory, schedule manager, self-service, time clock (testing only).
 */
(function initStaffExperienceUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Data Only. Not production staff operations.";
  const state = {
    panel: "directory",
    directory: null,
    selfService: null,
    schedules: null,
    coverage: null,
    profile: null,
    loading: false,
    error: "",
    notice: "",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function adminHeaders() {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    const token = global.localStorage?.getItem("llhAdminToken") || global.sessionStorage?.getItem("llhAdminToken") || "";
    if (token) headers.Authorization = `Bearer ${token}`;
    const preview = global.sessionStorage?.getItem("llhRolePreviewMembershipId") || "";
    if (preview) headers["x-llh-role-preview-membership-id"] = preview;
    return headers;
  }

  async function api(method, path, body) {
    const response = await fetch(path, {
      method,
      headers: adminHeaders(),
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
    return data;
  }

  function panelNav() {
    const items = [
      ["directory", "Directory"],
      ["schedule", "Schedule"],
      ["coverage", "Coverage"],
      ["self", "My Staff Hub"],
    ];
    return `
      <div class="sx-subnav">
        ${items.map(([id, label]) => `
          <button type="button" class="ghost-button${state.panel === id ? " active" : ""}" data-sx-panel="${id}">${label}</button>
        `).join("")}
      </div>
    `;
  }

  function directoryHtml() {
    const data = state.directory;
    if (!data) return `<p class="muted-copy">Loading directory…</p>`;
    const counts = data.counts || {};
    return `
      <section class="sx-section" data-sx-directory>
        <p class="sx-computer-recommended" data-sx-computer-recommended>Computer Recommended for schedule builder, permissions, onboarding, offboarding, and bulk staff administration. Phone focuses on My Staff Hub, clock, and personal schedule.</p>
        <div class="fu-toolbar">
          <h3>Staff directory</h3>
          <button type="button" class="ghost-button" data-sx-seed>Reset fixtures</button>
          <button type="button" class="primary-button" data-sx-invite>Invite staff (no email)</button>
        </div>
        <div class="sx-status-row">
          ${["active", "invited", "onboarding", "on_leave", "substitute", "inactive", "ended", "archived"].map((key) => `
            <button type="button" class="dc-metric-card sx-metric" data-sx-filter-status="${escapeHtml(key)}">
              <p class="dc-metric-label">${escapeHtml(key.replace(/_/g, " "))}</p>
              <p class="dc-metric-value">${escapeHtml(String(counts[key] ?? 0))}</p>
            </button>
          `).join("")}
        </div>
        <p class="muted-copy">Plan staff seats: ${escapeHtml(String(data.limits?.staffUsed ?? 0))}/${escapeHtml(String(data.limits?.staffAccountLimit ?? 0))}</p>
        <ul class="fh-card-list">
          ${(data.staff || []).map((row) => `
            <li class="fh-card static" data-sx-staff="${escapeHtml(row.id)}">
              <strong>${escapeHtml(row.displayName)}</strong>
              <span class="dc-badge">${escapeHtml(row.directoryStatus)}</span>
              <span class="muted-copy">${escapeHtml(row.role)} · ${escapeHtml(row.email)}</span>
              <button type="button" class="ghost-button" data-sx-open-profile="${escapeHtml(row.id)}">Open profile</button>
            </li>
          `).join("") || "<li class=\"muted-copy\">No staff match filters.</li>"}
        </ul>
      </section>
    `;
  }

  function scheduleHtml() {
    const data = state.schedules;
    if (!data) return `<p class="muted-copy">Loading schedule…</p>`;
    return `
      <section class="sx-section" data-sx-schedule data-feature-marker="phase16-schedule-manager">
        <p class="sx-computer-recommended">Computer Recommended for the full schedule builder. Mobile staff see personal shifts only.</p>
        <h3>Schedule manager</h3>
        <ul class="fh-card-list">
          ${(data.schedules || []).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.title)}</strong>
              <span class="dc-badge">${escapeHtml(row.status)}</span>
              <span class="muted-copy">Week of ${escapeHtml(row.weekStart)}</span>
            </li>
          `).join("")}
        </ul>
        <h4>Shifts</h4>
        <ul class="fh-card-list">
          ${(data.shifts || []).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.date)} ${escapeHtml(row.startTime)}–${escapeHtml(row.endTime)}</strong>
              <span class="muted-copy">${row.coverageGap ? "Coverage gap" : "Assigned"} · Room ${escapeHtml(row.classroomId || "—")}</span>
            </li>
          `).join("") || "<li class=\"muted-copy\">No shifts.</li>"}
        </ul>
        ${(data.coverageSuggestions || []).length ? `
          <h4>Coverage suggestions (director action required)</h4>
          <ul class="fh-card-list">
            ${(data.coverageSuggestions || []).map((row) => `
              <li class="fh-card static">
                <strong>Suggested substitute</strong>
                <span class="muted-copy">${escapeHtml(row.reason || "")}</span>
                <button type="button" class="primary-button" data-sx-assign-coverage="${escapeHtml(row.id)}" data-shift="${escapeHtml(row.shiftId)}">Assign (manual)</button>
              </li>
            `).join("")}
          </ul>
        ` : ""}
      </section>
    `;
  }

  function coverageHtml() {
    const data = state.coverage;
    if (!data) return `<p class="muted-copy">Loading coverage…</p>`;
    return `
      <section class="sx-section" data-sx-coverage>
        <h3>Ratio & coverage</h3>
        <p class="muted-copy" data-sx-ratio-disclaimer>${escapeHtml(data.ratioDisclaimer || "")}</p>
        <ul class="fh-card-list">
          ${(data.classrooms || []).map((room) => `
            <li class="fh-card static">
              <strong>${escapeHtml(room.name)}</strong>
              <span class="dc-badge">${escapeHtml(room.ratio?.status || "")}</span>
              <span class="muted-copy">Scheduled ${escapeHtml(String(room.scheduledStaff ?? 0))} · Clocked in ${escapeHtml(String(room.clockedInStaff ?? 0))}</span>
            </li>
          `).join("")}
        </ul>
        <p class="muted-copy">Suggestions never auto-move staff. Auto-move disabled: ${escapeHtml(String(data.autoMoveDisabled))}</p>
      </section>
    `;
  }

  function selfServiceHtml() {
    const data = state.selfService;
    if (!data) return `<p class="muted-copy">Loading My Staff Hub…</p>`;
    return `
      <section class="sx-section sx-self" data-sx-self data-feature-marker="phase16-staff-self-service">
        <h3>My Staff Hub</h3>
        <p class="muted-copy">${escapeHtml(data.profile?.displayName || "")} · ${escapeHtml(data.profile?.role || "")}</p>
        <div class="sx-clock-card">
          <p class="dc-metric-label">Clock status</p>
          <p class="dc-metric-value">${escapeHtml(data.today?.clockStatus || "clocked_out")}</p>
          <div class="sx-actions-row">
            <button type="button" class="primary-button" data-sx-clock="clock_in">Clock in</button>
            <button type="button" class="ghost-button" data-sx-clock="break_start">Start break</button>
            <button type="button" class="ghost-button" data-sx-clock="break_end">End break</button>
            <button type="button" class="ghost-button" data-sx-clock="clock_out">Clock out</button>
          </div>
        </div>
        <h4>My schedule</h4>
        <ul class="fh-card-list">
          ${(data.mySchedule || []).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.date)} ${escapeHtml(row.startTime)}–${escapeHtml(row.endTime)}</strong>
            </li>
          `).join("") || "<li class=\"muted-copy\">No shifts published for you.</li>"}
        </ul>
        <h4>Training / certifications</h4>
        <ul class="fh-card-list">
          ${(data.trainings || []).concat(data.certifications || []).slice(0, 6).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.title)}</strong>
              <span class="dc-badge">${escapeHtml(row.status || "")}</span>
            </li>
          `).join("") || "<li class=\"muted-copy\">None listed.</li>"}
        </ul>
        <h4>What I can access</h4>
        <ul class="fh-card-list">
          ${(data.permissionSummary?.plainLanguage || []).map((line) => `
            <li class="muted-copy">${escapeHtml(line)}</li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function profileHtml() {
    const data = state.profile;
    if (!data) return "";
    return `
      <section class="sx-section" data-sx-profile data-feature-marker="phase16-staff-profile">
        <button type="button" class="ghost-button" data-sx-panel="directory">← Directory</button>
        <h3>${escapeHtml(data.profile?.displayName || "Staff profile")}</h3>
        <p class="muted-copy">${escapeHtml(data.profile?.role || "")} · ${escapeHtml(data.profile?.directoryStatus || "")}</p>
        <p class="muted-copy">Sensitive personnel fields are restricted. Pay hidden: ${escapeHtml(String(data.payHidden))}</p>
        <h4>Permission summary</h4>
        <ul>${(data.permissionSummary?.plainLanguage || []).map((line) => `<li class="muted-copy">${escapeHtml(line)}</li>`).join("")}</ul>
        ${(data.privateNotes || []).length ? `
          <h4>Private director notes</h4>
          <ul class="fh-card-list">
            ${(data.privateNotes || []).map((note) => `
              <li class="fh-card static"><strong>${escapeHtml(note.title)}</strong><span class="muted-copy">${escapeHtml(note.type)}</span></li>
            `).join("")}
          </ul>
        ` : ""}
        ${data.onboarding ? `<p class="muted-copy">Onboarding: ${escapeHtml(data.onboarding.status)}</p>` : ""}
        ${data.offboarding ? `<p class="muted-copy">Offboarded: ${escapeHtml(data.offboarding.endDate)} · history preserved</p>` : ""}
      </section>
    `;
  }

  function rootHtml() {
    return `
      <section class="sx-panel" data-sx-root data-feature-marker="phase16-staff-experience">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <div class="fu-toolbar">
          <h2>Staff Experience</h2>
          <button type="button" class="ghost-button" data-sx-refresh>Refresh</button>
        </div>
        ${panelNav()}
        ${state.profile && state.panel === "profile" ? profileHtml() : ""}
        ${state.panel === "directory" ? directoryHtml() : ""}
        ${state.panel === "schedule" ? scheduleHtml() : ""}
        ${state.panel === "coverage" ? coverageHtml() : ""}
        ${state.panel === "self" ? selfServiceHtml() : ""}
        ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
        ${state.notice ? `<p class="muted-copy">${escapeHtml(state.notice)}</p>` : ""}
      </section>
    `;
  }

  async function loadAll() {
    state.error = "";
    try {
      if (state.panel === "directory" || state.panel === "profile") {
        state.directory = await api("GET", "/api/director-center/staff-experience/directory");
      }
      if (state.panel === "schedule") {
        state.schedules = await api("GET", "/api/director-center/staff-experience/schedules");
      }
      if (state.panel === "coverage") {
        state.coverage = await api("GET", "/api/director-center/staff-experience/coverage");
      }
      if (state.panel === "self") {
        state.selfService = await api("GET", "/api/director-center/staff-experience/self-service");
      }
    } catch (error) {
      state.error = error.message;
    }
  }

  function bind(root) {
    root.querySelectorAll("[data-sx-panel]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.panel = button.getAttribute("data-sx-panel");
        state.profile = null;
        await loadAll();
        render(root);
      });
    });
    root.querySelector("[data-sx-refresh]")?.addEventListener("click", async () => {
      await loadAll();
      render(root);
    });
    root.querySelector("[data-sx-seed]")?.addEventListener("click", async () => {
      await api("POST", "/api/director-center/staff-experience/seed", { reset: true });
      state.notice = "Fixtures reset.";
      await loadAll();
      render(root);
    });
    root.querySelector("[data-sx-invite]")?.addEventListener("click", async () => {
      try {
        await api("POST", "/api/director-center/staff-experience/invite", {
          email: `phase16.invite.${Date.now()}@example.invalid`,
          displayName: "Invited Staff (FAKE)",
          role: "assistant_staff",
        });
        state.notice = "Invitation stored (not emailed).";
        await loadAll();
        render(root);
      } catch (error) {
        state.error = error.message;
        render(root);
      }
    });
    root.querySelectorAll("[data-sx-open-profile]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          state.profile = await api("GET", `/api/director-center/staff-experience/profiles/${encodeURIComponent(button.getAttribute("data-sx-open-profile"))}`);
          state.panel = "profile";
          render(root);
        } catch (error) {
          state.error = error.message;
          render(root);
        }
      });
    });
    root.querySelectorAll("[data-sx-clock]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("POST", "/api/director-center/staff-experience/time-clock", {
            action: button.getAttribute("data-sx-clock"),
          });
          state.notice = "Time entry saved (history preserved).";
          state.selfService = await api("GET", "/api/director-center/staff-experience/self-service");
          render(root);
        } catch (error) {
          state.error = error.message;
          render(root);
        }
      });
    });
    root.querySelectorAll("[data-sx-assign-coverage]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("POST", "/api/director-center/staff-experience/schedules/assign-coverage", {
            suggestionId: button.getAttribute("data-sx-assign-coverage"),
            shiftId: button.getAttribute("data-shift"),
          });
          state.notice = "Coverage assigned manually (no auto-move).";
          state.schedules = await api("GET", "/api/director-center/staff-experience/schedules");
          render(root);
        } catch (error) {
          state.error = error.message;
          render(root);
        }
      });
    });
  }

  async function render(mount) {
    if (!mount) return;
    mount.innerHTML = rootHtml();
    bind(mount);
  }

  global.renderStaffExperienceTab = async function renderStaffExperienceTab(mount) {
    state.panel = "directory";
    state.profile = null;
    state.error = "";
    try {
      state.directory = await api("GET", "/api/director-center/staff-experience/directory");
    } catch {
      state.panel = "self";
      state.directory = null;
    }
    try {
      state.selfService = await api("GET", "/api/director-center/staff-experience/self-service");
      if (!state.directory) state.panel = "self";
    } catch (error) {
      if (!state.directory) state.error = error.message;
    }
    if (state.panel === "schedule") {
      try { state.schedules = await api("GET", "/api/director-center/staff-experience/schedules"); } catch { /* ignore */ }
    }
    await render(mount);
  };
})(typeof window !== "undefined" ? window : globalThis);
