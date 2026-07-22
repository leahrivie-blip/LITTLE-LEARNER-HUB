/**
 * Phase 12 — Director Center Enrollment pipeline tab.
 */
(function initEnrollmentUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Data Only. Not a real enrollment.";
  const state = {
    pipeline: null,
    caseDetail: null,
    reports: null,
    filter: "",
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
    if (state.caseDetail) {
      const c = state.caseDetail.case || {};
      const guidance = state.caseDetail.capacityGuidance || {};
      const packet = state.caseDetail.packet;
      const offer = state.caseDetail.offer;
      const waitlist = state.caseDetail.waitlist;
      return `
        <section class="en-panel" data-en-root>
          <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
          <button type="button" class="ghost-button" data-en-back>← Pipeline</button>
          <h2>${escapeHtml(c.childName || "Enrollment case")}</h2>
          <p class="muted-copy">${escapeHtml(c.guardianName || "")} · ${escapeHtml(c.stage || "")}</p>
          <p class="muted-copy">Desired start: ${escapeHtml(c.desiredStartDate || "—")} · Schedule: ${escapeHtml(c.desiredSchedule || "—")}</p>
          ${guidance.warning ? `<p class="en-capacity-warn">${escapeHtml(guidance.warning)}</p>` : ""}
          ${c.internalNotes ? `<p class="fm-internal"><strong>Internal note:</strong> ${escapeHtml(c.internalNotes)}</p>` : ""}
          ${waitlist ? `<p>Waitlist: ${escapeHtml(waitlist.status)} · priority category (internal): ${escapeHtml(waitlist.priorityCategory || "")}</p>` : ""}
          ${packet ? `
            <h3>Application packet</h3>
            <ul class="fh-card-list">
              ${(packet.items || []).map((item) => `
                <li class="fh-card static">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.status)}</span>
                  ${item.formVersionId ? `<span class="muted-copy">Version ${escapeHtml(item.formVersionId)}</span>` : ""}
                </li>
              `).join("")}
            </ul>
          ` : ""}
          ${offer ? `
            <h3>Offer (testing — no real charge)</h3>
            <p>${escapeHtml(offer.status)} · Tuition sim $${escapeHtml(String(offer.tuitionAmountSimulated || 0))}</p>
          ` : ""}
          <div class="fu-actions">
            <button type="button" class="ghost-button" data-en-preview-convert>Preview conversion</button>
            <button type="button" class="primary-button" data-en-confirm-convert>Confirm enrollment</button>
          </div>
          <pre class="en-audit muted-copy">${escapeHtml(JSON.stringify(state.caseDetail.conversion || state.notice || "", null, 2))}</pre>
        </section>
      `;
    }

    const cases = state.pipeline?.cases || [];
    return `
      <section class="en-panel" data-en-root>
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <div class="fu-toolbar">
          <h2>Enrollment pipeline</h2>
          <button type="button" class="ghost-button" data-en-seed>Reset fixtures</button>
          <button type="button" class="ghost-button" data-en-reports>Reports</button>
        </div>
        <label class="fh-search">Search families
          <input type="search" data-en-filter value="${escapeHtml(state.filter)}" placeholder="Family, child, email" />
        </label>
        <div class="en-pipeline-list">
          ${cases.map((row) => `
            <button type="button" class="fh-card en-case-row" data-en-open="${escapeHtml(row.id)}">
              <strong>${escapeHtml(row.childName)}</strong>
              <span>${escapeHtml(row.guardianName)}</span>
              <span class="dc-badge">${escapeHtml(row.stage)}</span>
              <span class="muted-copy">${escapeHtml(row.desiredStartDate || "")}</span>
            </button>
          `).join("") || `<p class="muted-copy">No enrollment cases yet.</p>`}
        </div>
        ${state.reports ? `
          <div class="en-reports">
            <h3>Testing reports</h3>
            <pre class="muted-copy">${escapeHtml(JSON.stringify(state.reports.reports || state.reports, null, 2))}</pre>
          </div>
        ` : ""}
        ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
        ${state.notice ? `<p class="muted-copy">${escapeHtml(state.notice)}</p>` : ""}
      </section>
    `;
  }

  async function loadPipeline() {
    state.loading = true;
    state.error = "";
    try {
      const q = state.filter ? `?family=${encodeURIComponent(state.filter)}` : "";
      state.pipeline = await api("GET", `/api/director-center/enrollment/pipeline${q}`);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
    }
  }

  async function render(mount) {
    if (!mount) return;
    if (!state.pipeline && !state.caseDetail) await loadPipeline();
    mount.innerHTML = panelHtml();
    bind(mount);
  }

  function bind(root) {
    root.querySelector("[data-en-back]")?.addEventListener("click", async () => {
      state.caseDetail = null;
      await loadPipeline();
      render(root);
    });
    root.querySelector("[data-en-seed]")?.addEventListener("click", async () => {
      await api("POST", "/api/director-center/enrollment/seed", { reset: true });
      state.notice = "Fixtures reset.";
      await loadPipeline();
      render(root);
    });
    root.querySelector("[data-en-reports]")?.addEventListener("click", async () => {
      state.reports = await api("GET", "/api/director-center/enrollment/reports");
      render(root);
    });
    root.querySelector("[data-en-filter]")?.addEventListener("change", async (event) => {
      state.filter = event.target.value || "";
      await loadPipeline();
      render(root);
    });
    root.querySelectorAll("[data-en-open]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.caseDetail = await api("GET", `/api/director-center/enrollment/cases/${encodeURIComponent(button.getAttribute("data-en-open"))}`);
        render(root);
      });
    });
    root.querySelector("[data-en-preview-convert]")?.addEventListener("click", async () => {
      const id = state.caseDetail?.case?.id;
      if (!id) return;
      const preview = await api("POST", `/api/director-center/enrollment/cases/${encodeURIComponent(id)}/conversion/preview`, {});
      state.caseDetail.conversion = preview;
      state.notice = `Duplicate warnings: ${(preview.summary?.duplicateWarnings || []).length}`;
      render(root);
    });
    root.querySelector("[data-en-confirm-convert]")?.addEventListener("click", async () => {
      const id = state.caseDetail?.case?.id;
      if (!id) return;
      try {
        const result = await api("POST", `/api/director-center/enrollment/cases/${encodeURIComponent(id)}/conversion/confirm`, {
          acknowledgeDuplicates: true,
        });
        state.notice = `Enrolled. Child ${result.permanentIds?.childId || ""}`;
        state.caseDetail = await api("GET", `/api/director-center/enrollment/cases/${encodeURIComponent(id)}`);
        state.caseDetail.conversion = result;
        render(root);
      } catch (error) {
        state.error = error.message;
        render(root);
      }
    });
  }

  global.renderEnrollmentTab = async function renderEnrollmentTab(mount) {
    state.caseDetail = null;
    await loadPipeline();
    await render(mount);
  };
})(typeof window !== "undefined" ? window : globalThis);
