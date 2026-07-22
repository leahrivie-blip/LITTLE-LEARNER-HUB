/**
 * Phase 15 — Director Center Today Hub tab.
 * Role-specific "What do I need to do right now?"
 */
(function initTodayHubUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Data Only. Not production operations.";
  const state = {
    dashboard: null,
    loading: false,
    error: "",
    notice: "",
    collapsed: {
      urgent: false,
      today: false,
      dueSoon: true,
      informational: true,
    },
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

  function taskSection(title, key, tasks) {
    const collapsed = state.collapsed[key];
    return `
      <section class="th-section" data-th-section="${escapeHtml(key)}">
        <button type="button" class="th-section-toggle" data-th-toggle="${escapeHtml(key)}">
          <strong>${escapeHtml(title)}</strong>
          <span class="th-count">${escapeHtml(String((tasks || []).length))}</span>
          <span class="muted-copy">${collapsed ? "Show" : "Hide"}</span>
        </button>
        ${collapsed ? "" : `
          <ul class="fh-card-list th-task-list">
            ${(tasks || []).map((task) => `
              <li class="fh-card static th-task th-priority-${escapeHtml(task.priority || "today")}" data-th-task="${escapeHtml(task.id)}" data-th-href="${escapeHtml(task.href || "")}">
                <strong>${escapeHtml(task.title)}</strong>
                <span class="dc-badge">${escapeHtml(task.priority || "")}</span>
                <span class="muted-copy">${escapeHtml(task.summary || "")}</span>
                <span class="muted-copy">Source: ${escapeHtml(task.source || "")}</span>
                ${task.href ? `<button type="button" class="ghost-button" data-th-open="${escapeHtml(task.href)}">Open</button>` : ""}
              </li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        `}
      </section>
    `;
  }

  function panelHtml() {
    const d = state.dashboard;
    if (!d) {
      return `<section class="th-panel" data-th-root data-feature-marker="phase15-today-hub"><p class="muted-copy">Loading Today Hub…</p></section>`;
    }
    if (d.view === "curriculum") {
      return `
        <section class="th-panel" data-th-root data-feature-marker="phase15-today-hub">
          <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
          <h2>Today — Curriculum Only</h2>
          <p class="muted-copy">${escapeHtml(d.note || "Center operations are hidden.")}</p>
          <ul class="fh-card-list">
            ${(d.quickActions || []).map((a) => `
              <li class="fh-card static"><strong>${escapeHtml(a.label)}</strong></li>
            `).join("")}
          </ul>
        </section>
      `;
    }
    const summary = d.attendanceSummary || {};
    const by = d.tasksByPriority || {};
    return `
      <section class="th-panel" data-th-root data-feature-marker="phase15-today-hub">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <p class="th-computer-recommended" data-th-computer-recommended>Computer Recommended for organization-wide filters, multi-location oversight, and detailed ratio history. Phone focuses on today’s actions, attendance, and quick logs.</p>
        <div class="fu-toolbar">
          <h2>Today Hub</h2>
          <button type="button" class="ghost-button" data-th-seed>Reset fixtures</button>
          <button type="button" class="ghost-button" data-th-refresh>Refresh</button>
        </div>
        <p class="muted-copy">Role: ${escapeHtml(d.view || d.role || "")} · ${escapeHtml(d.date || "")}</p>
        <p class="muted-copy" data-th-ratio-disclaimer>${escapeHtml(d.ratioDisclaimer || "")}</p>

        <section class="th-summary th-phone-friendly">
          <h3>Attendance today</h3>
          <div class="th-metric-row">
            <div class="dc-metric-card th-metric"><p class="dc-metric-label">Expected</p><p class="dc-metric-value">${escapeHtml(String(summary.expected ?? 0))}</p></div>
            <div class="dc-metric-card th-metric"><p class="dc-metric-label">Present</p><p class="dc-metric-value">${escapeHtml(String(summary.present ?? 0))}</p></div>
            <div class="dc-metric-card th-metric"><p class="dc-metric-label">Absent</p><p class="dc-metric-value">${escapeHtml(String(summary.absent ?? 0))}</p></div>
            <div class="dc-metric-card th-metric"><p class="dc-metric-label">Checked out</p><p class="dc-metric-value">${escapeHtml(String(summary.checkedOut ?? 0))}</p></div>
          </div>
        </section>

        <section class="th-classrooms">
          <h3>Classrooms</h3>
          <ul class="fh-card-list">
            ${(d.classrooms || []).map((room) => `
              <li class="fh-card static" data-th-classroom="${escapeHtml(room.classroomId)}">
                <strong>${escapeHtml(room.name)}</strong>
                <span class="dc-badge">${escapeHtml(room.ratio?.status || "")}</span>
                <span class="muted-copy">Present ${escapeHtml(String(room.counts?.present ?? 0))} · Staff ${escapeHtml(String(room.staffOnDuty ?? 0))} · Cap/staff ${escapeHtml(String(room.ratio?.configuredMaxPerStaff ?? "—"))}</span>
                <ul class="th-roster">
                  ${(room.roster || []).slice(0, 8).map((child) => `
                    <li>
                      <span>${escapeHtml(child.childName)}</span>
                      <span class="muted-copy">${escapeHtml(child.status)}</span>
                      <button type="button" class="ghost-button" data-th-att-action="check_in" data-th-att-id="${escapeHtml(child.attendanceId)}">In</button>
                      <button type="button" class="ghost-button" data-th-att-action="mark_absent" data-th-att-id="${escapeHtml(child.attendanceId)}">Absent</button>
                      <button type="button" class="ghost-button" data-th-att-action="check_out" data-th-att-id="${escapeHtml(child.attendanceId)}">Out</button>
                    </li>
                  `).join("") || "<li class=\"muted-copy\">No roster rows</li>"}
                </ul>
              </li>
            `).join("") || "<li class=\"muted-copy\">No classrooms in scope.</li>"}
          </ul>
        </section>

        <section class="th-quick-actions">
          <h3>Quick actions</h3>
          <div class="th-actions-row">
            ${(d.quickActions || []).map((a) => `
              <button type="button" class="ghost-button" data-th-open="${escapeHtml(a.href)}">${escapeHtml(a.label)}</button>
            `).join("")}
          </div>
        </section>

        ${taskSection("Urgent", "urgent", by.urgent)}
        ${taskSection("Today", "today", by.today)}
        ${taskSection("Due Soon", "dueSoon", by.dueSoon)}
        ${taskSection("Informational", "informational", by.informational)}

        ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
        ${state.notice ? `<p class="muted-copy">${escapeHtml(state.notice)}</p>` : ""}
      </section>
    `;
  }

  async function loadDashboard() {
    state.loading = true;
    state.error = "";
    try {
      state.dashboard = await api("GET", "/api/director-center/today/dashboard");
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
    }
  }

  async function render(mount) {
    if (!mount) return;
    mount.innerHTML = panelHtml();
    bind(mount);
  }

  function bind(root) {
    root.querySelector("[data-th-seed]")?.addEventListener("click", async () => {
      await api("POST", "/api/director-center/today/seed", { reset: true });
      state.notice = "Fixtures reset.";
      await loadDashboard();
      render(root);
    });
    root.querySelector("[data-th-refresh]")?.addEventListener("click", async () => {
      await loadDashboard();
      render(root);
    });
    root.querySelectorAll("[data-th-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-th-toggle");
        state.collapsed[key] = !state.collapsed[key];
        render(root);
      });
    });
    root.querySelectorAll("[data-th-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const href = button.getAttribute("data-th-open") || "";
        if (href.startsWith("today")) {
          state.notice = `Opened ${href}`;
          render(root);
          return;
        }
        const tab = href.split("?")[0];
        const tabBtn = document.querySelector(`[data-dc-tab="${tab}"]`);
        if (tabBtn) tabBtn.click();
        else state.notice = `Deep link: ${href}`;
        render(root);
      });
    });
    root.querySelectorAll("[data-th-att-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-th-att-id");
        const action = button.getAttribute("data-th-att-action");
        try {
          await api("POST", `/api/director-center/today/attendance/${encodeURIComponent(id)}/action`, {
            action,
            pickupPerson: action === "check_out" ? "Authorized Pickup (Fixture)" : "",
            pickupVerification: action === "check_out" ? "verified" : undefined,
          });
          state.notice = `Attendance ${action} saved (history preserved).`;
          await loadDashboard();
          render(root);
        } catch (error) {
          state.error = error.message;
          render(root);
        }
      });
    });
  }

  global.renderTodayHubTab = async function renderTodayHubTab(mount) {
    await loadDashboard();
    await render(mount);
  };
})(typeof window !== "undefined" ? window : globalThis);
