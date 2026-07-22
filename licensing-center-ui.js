/**
 * Phase 14 — Director Center Licensing Center tab.
 * Configurable readiness only. Not legal compliance guidance.
 */
(function initLicensingCenterUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Licensing Data Only. Not legal compliance guidance.";
  const DISCLAIMER = "Licensing requirements vary. Verify all requirements with your state, territory, local licensing agency, and applicable programs. Little Learner Hub does not guarantee licensing compliance.";
  const state = {
    dashboard: null,
    requirements: null,
    filterStatus: "",
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
    const counts = state.dashboard?.counts || {};
    const cards = state.dashboard?.cards || [
      { key: "missing", label: "Missing", filterStatus: "missing", count: counts.missing },
      { key: "expiringSoon", label: "Expiring soon", filterStatus: "expiring_soon", count: counts.expiringSoon },
      { key: "expired", label: "Expired", filterStatus: "expired", count: counts.expired },
      { key: "ready", label: "Ready", filterStatus: "ready", count: counts.ready },
    ];
    const requirements = state.requirements?.requirements || [];
    return `
      <section class="lc-panel" data-lc-root data-feature-marker="phase14-licensing">
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <p class="muted-copy" data-lc-disclaimer>${escapeHtml(DISCLAIMER)}</p>
        <p class="lc-computer-recommended" data-lc-computer-recommended>Computer Recommended for state configuration, inspection packets, and reports. Phone shows missing/expiring summaries and simple assigned tasks only.</p>
        <div class="fu-toolbar">
          <h2>Licensing Center</h2>
          <button type="button" class="primary-button" data-lc-prepare>Prepare for visit</button>
          <button type="button" class="ghost-button" data-lc-seed>Reset fixtures</button>
          <button type="button" class="ghost-button" data-lc-clear-filter>Clear filter</button>
        </div>
        <p class="muted-copy">${escapeHtml(state.dashboard?.wording?.overall || "Ready based on configured checklist — not a universal compliance label")}</p>
        <div class="lc-overview-cards">
          ${cards.map((card) => `
            <button type="button" class="dc-metric-card lc-metric-card" data-lc-filter-status="${escapeHtml(card.filterStatus || card.key)}">
              <p class="dc-metric-label">${escapeHtml(card.label)}</p>
              <p class="dc-metric-value">${escapeHtml(String(card.count ?? 0))}</p>
            </button>
          `).join("")}
        </div>
        <section class="fh-section lc-phone-summary" data-lc-phone-summary>
          <h3>Phone summary</h3>
          <p class="muted-copy">Missing ${escapeHtml(String(counts.missing ?? 0))} · Expiring ${escapeHtml(String(counts.expiringSoon ?? 0))} · Expired ${escapeHtml(String(counts.expired ?? 0))} · Ready ${escapeHtml(String(counts.ready ?? 0))}</p>
        </section>
        <section class="fh-section lc-requirements-section">
          <h3>Requirements ${state.filterStatus ? `<span class="muted-copy">(filter: ${escapeHtml(state.filterStatus)})</span>` : ""}</h3>
          <ul class="fh-card-list" data-lc-requirements>
            ${requirements.map((row) => `
              <li class="fh-card static" data-lc-req="${escapeHtml(row.id)}">
                <strong>${escapeHtml(row.title)}</strong>
                <span class="dc-badge">${escapeHtml(row.status)}</span>
                <span class="muted-copy">${escapeHtml(row.scope || "")} · ${escapeHtml(row.category || "")}${row.connectedRecordId ? ` · record ${escapeHtml(row.connectedRecordId)}` : ""}</span>
              </li>
            `).join("") || "<li class=\"muted-copy\">No requirements match.</li>"}
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
      state.dashboard = await api("GET", "/api/director-center/licensing/dashboard");
      const params = new URLSearchParams();
      if (state.filterStatus) params.set("status", state.filterStatus);
      const q = params.toString() ? `?${params}` : "";
      state.requirements = await api("GET", `/api/director-center/licensing/requirements${q}`);
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
    root.querySelector("[data-lc-seed]")?.addEventListener("click", async () => {
      await api("POST", "/api/director-center/licensing/seed", { reset: true });
      state.notice = "Fixtures reset.";
      await loadAll();
      render(root);
    });
    root.querySelector("[data-lc-clear-filter]")?.addEventListener("click", async () => {
      state.filterStatus = "";
      await loadAll();
      render(root);
    });
    root.querySelectorAll("[data-lc-filter-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.filterStatus = button.getAttribute("data-lc-filter-status") || "";
        await loadAll();
        render(root);
      });
    });
    root.querySelector("[data-lc-prepare]")?.addEventListener("click", async () => {
      try {
        const result = await api("POST", "/api/director-center/licensing/inspection/prepare", {
          inspectionDate: new Date().toISOString().slice(0, 10),
          childCategories: ["Immunization and Health"],
          staffCategories: ["Staff Training and Certifications"],
          facilityCategories: ["Facility and Safety"],
          includeIdentifyingInfo: false,
        });
        state.notice = `Inspection packet prepared (${result.packet?.id || "ok"}). Inspector token is time-limited and revocable.`;
        await loadAll();
        render(root);
      } catch (error) {
        state.error = error.message;
        render(root);
      }
    });
  }

  global.renderLicensingCenterTab = async function renderLicensingCenterTab(mount) {
    await loadAll();
    await render(mount);
  };
})(typeof window !== "undefined" ? window : globalThis);
