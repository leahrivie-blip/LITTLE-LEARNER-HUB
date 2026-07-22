/**
 * Phase 13 — Director Center Records Center tab.
 */
(function initRecordsCenterUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Records Only. Not production file storage.";
  const state = {
    overview: null,
    inbox: null,
    records: null,
    filterStatus: "",
    filterCategory: "",
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

  function panelHtml() {
    const counts = state.overview?.counts || {};
    const inbox = state.inbox?.inbox || [];
    const records = state.records?.records || [];
    const cards = [
      ["unfiled", "Unfiled", counts.unfiled],
      ["needs_review", "Needs review", counts.needsReview],
      ["missing_information", "Missing", counts.missing],
      ["expiring_soon", "Expiring soon", counts.expiringSoon],
      ["expired", "Expired", counts.expired],
      ["approved", "Approved", counts.approved],
      ["archived", "Archived", counts.archived],
    ];
    return `
      <section class="rc-panel" data-rc-root data-feature-marker="phase13-records">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <p class="rc-computer-recommended" data-rc-computer-recommended>Computer Recommended for bulk filing, archival, and complex review workflows. Phone shows summaries and simple review queues only.</p>
        <div class="fu-toolbar">
          <h2>Records Center</h2>
          <button type="button" class="ghost-button" data-rc-seed>Reset fixtures</button>
          <button type="button" class="ghost-button" data-rc-clear-filter>Clear filter</button>
        </div>
        <div class="rc-overview-cards">
          ${cards.map(([status, label, value]) => `
            <button type="button" class="dc-metric-card rc-metric-card" data-rc-filter-status="${escapeHtml(status)}">
              <p class="dc-metric-label">${escapeHtml(label)}</p>
              <p class="dc-metric-value">${escapeHtml(String(value ?? 0))}</p>
            </button>
          `).join("")}
        </div>
        <section class="fh-section rc-phone-summary" data-rc-phone-summary>
          <h3>Phone summary</h3>
          <p class="muted-copy">Unfiled ${escapeHtml(String(counts.unfiled ?? 0))} · Needs review ${escapeHtml(String(counts.needsReview ?? 0))} · Missing ${escapeHtml(String(counts.missing ?? 0))} · Expiring ${escapeHtml(String(counts.expiringSoon ?? 0))}</p>
        </section>
        <section class="fh-section rc-inbox-section">
          <h3>Unfiled Inbox</h3>
          <ul class="fh-card-list">
            ${inbox.map((row) => `
              <li class="fh-card static">
                <strong>${escapeHtml(row.title)}</strong>
                <span class="dc-badge">${escapeHtml(row.status)}</span>
                <span class="muted-copy">${escapeHtml(row.category || "")}</span>
                <label>File to child id
                  <input type="text" data-rc-child-id="${escapeHtml(row.id)}" placeholder="child id" />
                </label>
                <button type="button" class="primary-button" data-rc-file="${escapeHtml(row.id)}">File to child</button>
              </li>
            `).join("") || "<li class=\"muted-copy\">No unfiled uploads.</li>"}
          </ul>
        </section>
        <section class="fh-section">
          <h3>Records ${state.filterStatus ? `<span class="muted-copy">(filter: ${escapeHtml(state.filterStatus)})</span>` : ""}</h3>
          <ul class="fh-card-list">
            ${records.map((row) => `
              <li class="fh-card static">
                <strong>${escapeHtml(row.title)}</strong>
                <span class="dc-badge">${escapeHtml(row.status)}</span>
                <span class="muted-copy">${escapeHtml(row.category || "")}${row.relatedChildId ? ` · child ${escapeHtml(row.relatedChildId)}` : ""}</span>
              </li>
            `).join("") || "<li class=\"muted-copy\">No records match.</li>"}
          </ul>
        </section>
        ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
        ${state.notice ? `<p class="muted-copy">${escapeHtml(state.notice)}</p>` : ""}
      </section>
    `;
  }

  async function loadAll() {
    state.loading = true;
    state.error = "";
    try {
      state.overview = await api("GET", "/api/director-center/records/overview");
      state.inbox = await api("GET", "/api/director-center/records/inbox");
      const params = new URLSearchParams();
      if (state.filterStatus) params.set("status", state.filterStatus);
      if (state.filterCategory) params.set("category", state.filterCategory);
      const q = params.toString() ? `?${params}` : "";
      state.records = await api("GET", `/api/director-center/records/records${q}`);
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
    root.querySelector("[data-rc-seed]")?.addEventListener("click", async () => {
      await api("POST", "/api/director-center/records/seed", { reset: true });
      state.notice = "Fixtures reset.";
      await loadAll();
      render(root);
    });
    root.querySelector("[data-rc-clear-filter]")?.addEventListener("click", async () => {
      state.filterStatus = "";
      state.filterCategory = "";
      await loadAll();
      render(root);
    });
    root.querySelectorAll("[data-rc-filter-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.filterStatus = button.getAttribute("data-rc-filter-status") || "";
        await loadAll();
        render(root);
      });
    });
    root.querySelectorAll("[data-rc-file]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-rc-file");
        const input = root.querySelector(`[data-rc-child-id="${id}"]`);
        const relatedChildId = input?.value?.trim() || "";
        if (!relatedChildId) {
          state.error = "Enter a child id to file this record.";
          render(root);
          return;
        }
        try {
          await api("POST", `/api/director-center/records/records/${encodeURIComponent(id)}/file`, {
            relatedChildId,
            status: "needs_review",
            familyVisibility: false,
          });
          state.notice = `Filed ${id} to child ${relatedChildId}.`;
          await loadAll();
          render(root);
        } catch (error) {
          state.error = error.message;
          render(root);
        }
      });
    });
  }

  global.renderRecordsCenterTab = async function renderRecordsCenterTab(mount) {
    await loadAll();
    await render(mount);
  };
})(typeof window !== "undefined" ? window : globalThis);
