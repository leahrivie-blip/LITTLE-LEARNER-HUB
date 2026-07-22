/**
 * Phase 10 — Provider Family Updates review/sharing controls (Director Center tab).
 * Fake data only. No notifications. No public media URLs.
 */
(function initFamilyUpdatesUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Data Only.";
  const state = {
    queue: null,
    config: null,
    loading: false,
    error: "",
    notice: "",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.code = data.code;
      throw error;
    }
    return data;
  }

  function panelHtml() {
    const q = state.queue || {};
    const cfg = state.config || q.sharingConfig || {};
    return `
      <section class="fu-panel" data-fu-root>
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h2>Family Updates — Review &amp; Sharing</h2>
        <p class="muted-copy">Approve updates, Daily Reports, and media before families see them. Internal notes never appear in Family Hub.</p>
        <div class="fu-config">
          <h3>Sharing configuration</h3>
          <label class="fu-check">
            <input type="checkbox" data-fu-teachers-direct ${cfg.teachersCanShareDirectly ? "checked" : ""} />
            Teachers can share directly
          </label>
          <label class="fu-check">
            <input type="checkbox" data-fu-require-approval ${cfg.requireDirectorApproval !== false ? "checked" : ""} />
            Require director approval
          </label>
          <button type="button" class="primary-button" data-fu-save-config>Save sharing settings</button>
        </div>
        <section class="fu-section">
          <h3>Updates awaiting review</h3>
          <ul class="fh-card-list">
            ${(q.updatesForReview || []).map((row) => `
              <li class="fh-card static">
                <strong>${escapeHtml(row.title)}</strong>
                <span>${escapeHtml(row.message || "")}</span>
                <p class="muted-copy">Internal note (families never see): ${escapeHtml(row.internalNote || "—")}</p>
                <div class="fu-actions">
                  <button type="button" class="ghost-button" data-fu-approve="${escapeHtml(row.id)}">Approve</button>
                  <button type="button" class="primary-button" data-fu-share="${escapeHtml(row.id)}">Share with family</button>
                </div>
              </li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
        <section class="fu-section">
          <h3>Daily Reports awaiting review</h3>
          <ul class="fh-card-list">
            ${(q.dailyReportsForReview || []).map((row) => `
              <li class="fh-card static">
                <strong>Daily log ${escapeHtml(row.dailyLogId)}</strong>
                <button type="button" class="primary-button" data-fu-share-daily="${escapeHtml(row.dailyLogId)}">Make family visible</button>
              </li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
        <section class="fu-section">
          <h3>Media awaiting review</h3>
          <ul class="fh-card-list">
            ${(q.mediaForReview || []).map((row) => `
              <li class="fh-card static">
                <strong>${escapeHtml(row.caption || row.fileName || row.kind)}</strong>
                <span>${escapeHtml(row.placeholderLabel || "")}</span>
                <button type="button" class="primary-button" data-fu-share-media="${escapeHtml(row.id)}">Share (consent required)</button>
              </li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
        <section class="fu-section">
          <h3>Family concern / correction requests</h3>
          <ul class="fh-card-list">
            ${(q.concernRequests || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.targetType)}</strong><span>${escapeHtml(row.message || "")}</span></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        </section>
      </section>
    `;
  }

  async function refresh() {
    state.loading = true;
    state.error = "";
    try {
      await api("POST", "/api/director-center/family-updates/seed", {});
      state.queue = await api("GET", "/api/director-center/family-updates/review-queue");
      state.config = state.queue.sharingConfig || null;
    } catch (error) {
      state.error = error.message || "Could not load Family Updates.";
    } finally {
      state.loading = false;
    }
  }

  function bind(root) {
    root.querySelector("[data-fu-save-config]")?.addEventListener("click", async () => {
      try {
        const teachersCanShareDirectly = root.querySelector("[data-fu-teachers-direct]")?.checked === true;
        const requireDirectorApproval = root.querySelector("[data-fu-require-approval]")?.checked !== false;
        state.config = (await api("PATCH", "/api/director-center/family-updates/config", {
          teachersCanShareDirectly,
          requireDirectorApproval,
        })).sharingConfig;
        state.notice = "Sharing settings saved.";
        await refresh();
        global.renderDirectorCenterPreviewUI?.();
      } catch (error) {
        state.error = error.message;
        global.renderDirectorCenterPreviewUI?.();
      }
    });
    root.querySelectorAll("[data-fu-approve]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api("POST", `/api/director-center/family-updates/updates/${encodeURIComponent(button.getAttribute("data-fu-approve"))}/approve`, {});
        await refresh();
        global.renderDirectorCenterPreviewUI?.();
      });
    });
    root.querySelectorAll("[data-fu-share]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-fu-share");
        await api("POST", `/api/director-center/family-updates/updates/${encodeURIComponent(id)}/approve`, {}).catch(() => ({}));
        await api("POST", `/api/director-center/family-updates/updates/${encodeURIComponent(id)}/share`, {});
        await refresh();
        global.renderDirectorCenterPreviewUI?.();
      });
    });
    root.querySelectorAll("[data-fu-share-daily]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api("POST", "/api/director-center/family-updates/daily-reports/share", {
          dailyLogId: button.getAttribute("data-fu-share-daily"),
          visibility: "family_visible",
        });
        await refresh();
        global.renderDirectorCenterPreviewUI?.();
      });
    });
    root.querySelectorAll("[data-fu-share-media]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("POST", `/api/director-center/family-updates/media/${encodeURIComponent(button.getAttribute("data-fu-share-media"))}/share`, {
            visibility: "family_visible",
            downloadPermission: true,
          });
          state.notice = "Media shared with permitted families.";
        } catch (error) {
          state.error = error.message;
        }
        await refresh();
        global.renderDirectorCenterPreviewUI?.();
      });
    });
  }

  global.renderFamilyUpdatesTab = async function renderFamilyUpdatesTab(container) {
    if (!container) return;
    if (!state.queue && !state.loading) await refresh();
    container.innerHTML = `
      ${state.error ? `<p class="fh-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      ${state.notice ? `<p class="fh-notice">${escapeHtml(state.notice)}</p>` : ""}
      ${state.loading ? `<p class="muted-copy">Loading…</p>` : panelHtml()}
    `;
    const root = container.querySelector("[data-fu-root]");
    if (root) bind(root);
  };

  global.refreshFamilyUpdatesTab = refresh;
})(typeof window !== "undefined" ? window : globalThis);
