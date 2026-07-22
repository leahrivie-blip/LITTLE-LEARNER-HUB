/**
 * Phase 18 — Testing and Preview Lab UI.
 * Private admin testing area. Never displays passwords after the one-time issue response.
 */
(function initTestingLabUI(global) {
  const TESTING_BANNER = "Private Testing Environment — Fake Data Only";
  const BASE = "/api/testing-lab";
  const state = {
    panel: "home",
    dashboard: null,
    loading: false,
    error: "",
    notice: "",
    oneTimePassword: "",
    issuedEmail: "",
    deviceSession: null,
    preview: null,
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
      ["home", "Home"],
      ["accounts", "Accounts"],
      ["scenarios", "Scenarios"],
      ["preview", "Role Preview"],
      ["device", "Device Preview"],
      ["flags", "Feature States"],
      ["data", "Data Controls"],
      ["checklist", "Test Checklist"],
      ["audit", "Activity"],
    ];
    return `
      <div class="tl-subnav">
        ${items.map(([id, label]) => `
          <button type="button" class="ghost-button${state.panel === id ? " active" : ""}" data-tl-panel="${id}">${label}</button>
        `).join("")}
      </div>
    `;
  }

  function homeHtml() {
    const d = state.dashboard?.dashboard || {};
    return `
      <section class="tl-section" data-tl-home>
        <div class="fu-toolbar">
          <h3>Testing Lab dashboard</h3>
          <button type="button" class="primary-button" data-tl-quick-start>Quick start (Small Center)</button>
          <button type="button" class="ghost-button" data-tl-return-admin>Return to administrator account</button>
        </div>
        <div class="tl-status-row">
          ${[
            ["Organization", d.organizationId || "—"],
            ["Scenario", d.scenario || "—"],
            ["Plan", d.planKey || "—"],
            ["Device", d.device || "—"],
            ["Seed", d.seedStatus || "—"],
            ["Feature state", d.featureState || "—"],
          ].map(([label, value]) => `
            <article class="dc-metric-card tl-metric">
              <p class="dc-metric-label">${escapeHtml(label)}</p>
              <p class="dc-metric-value">${escapeHtml(String(value))}</p>
            </article>
          `).join("")}
        </div>
        <p class="muted-copy">Feature flags (effective): ${escapeHtml(JSON.stringify(state.dashboard?.flags?.effective || {}))}</p>
        <h4>Recent testing activity</h4>
        <ul class="fh-card-list">
          ${(state.dashboard?.recentActivity || []).slice(0, 8).map((row) => `
            <li class="fh-card static"><strong>${escapeHtml(row.action)}</strong><span class="muted-copy">${escapeHtml(row.detail || "")}</span></li>
          `).join("") || "<li class=\"muted-copy\">None yet</li>"}
        </ul>
      </section>
    `;
  }

  function accountsHtml() {
    return `
      <section class="tl-section" data-tl-accounts>
        <h3>Actual fake login accounts</h3>
        <p class="muted-copy">Real authentication flow. Passwords are never stored in fixtures. Issue once, copy immediately.</p>
        ${state.oneTimePassword ? `
          <div class="tl-onetime" data-tl-onetime>
            <p><strong>Temporary password for ${escapeHtml(state.issuedEmail)}</strong> (shown once)</p>
            <code>${escapeHtml(state.oneTimePassword)}</code>
            <button type="button" class="ghost-button" data-tl-clear-password>Clear from screen</button>
          </div>
        ` : ""}
        <ul class="fh-card-list">
          ${(state.dashboard?.accounts || []).map((row) => `
            <li class="fh-card static" data-tl-account="${escapeHtml(row.id)}">
              <strong>${escapeHtml(row.displayName || row.kind)}</strong>
              <span class="dc-badge">${escapeHtml(row.kind)}</span>
              <span class="muted-copy">${escapeHtml(row.email)} · ${escapeHtml(row.label || "")}</span>
              <div class="tl-actions-row">
                <button type="button" class="ghost-button" data-tl-select-account="${escapeHtml(row.id)}">Select</button>
                <button type="button" class="ghost-button" data-tl-issue-password="${escapeHtml(row.id)}">Issue password</button>
                <button type="button" class="ghost-button" data-tl-revoke="${escapeHtml(row.id)}">Revoke session</button>
              </div>
            </li>
          `).join("") || "<li class=\"muted-copy\">Load a scenario first.</li>"}
        </ul>
      </section>
    `;
  }

  function scenariosHtml() {
    return `
      <section class="tl-section" data-tl-scenarios>
        <h3>Organization scenario packs</h3>
        <div class="tl-actions-row">
          ${(state.dashboard?.scenarios || []).map((s) => `
            <button type="button" class="ghost-button" data-tl-load-scenario="${escapeHtml(s.key)}">${escapeHtml(s.label)}</button>
          `).join("")}
        </div>
        <h4>Feature states</h4>
        <select data-tl-feature-state>
          ${(state.dashboard?.featureStates || []).map((s) => `
            <option value="${escapeHtml(s)}"${state.dashboard?.dashboard?.featureState === s ? " selected" : ""}>${escapeHtml(s.replace(/_/g, " "))}</option>
          `).join("")}
        </select>
        <button type="button" class="ghost-button" data-tl-apply-feature-state>Apply feature state label</button>
      </section>
    `;
  }

  function previewHtml() {
    return `
      <section class="tl-section" data-tl-preview>
        <h3>Quick Role Preview</h3>
        <p class="muted-copy">Temporary preview only — does not change the administrator’s stored role. Use Actual Fake Login for end-to-end auth.</p>
        ${state.preview ? `<p class="tl-preview-banner" data-tl-preview-banner>${escapeHtml(state.preview.banner || "")} · expires ${escapeHtml(state.preview.expiresAt || "")}</p>` : ""}
        <div class="tl-actions-row">
          ${(state.dashboard?.rolePreviewTargets || []).map((kind) => `
            <button type="button" class="ghost-button" data-tl-start-preview="${escapeHtml(kind)}">${escapeHtml(kind.replace(/_/g, " "))}</button>
          `).join("")}
        </div>
        <button type="button" class="primary-button" data-tl-exit-preview>Exit Preview</button>
      </section>
    `;
  }

  function deviceHtml() {
    const devices = state.dashboard?.devices || {};
    const session = state.deviceSession;
    return `
      <section class="tl-section" data-tl-device data-feature-marker="phase18-device-preview">
        <h3>Device Preview</h3>
        <p class="tl-computer-recommended" data-tl-computer-recommended>Computer Recommended for managing scenarios and device frames. Phone-sized preview uses the real application UI.</p>
        <p class="muted-copy">Uses the real app UI. An iframe alone does not prove native-app behavior.</p>
        <div class="tl-actions-row">
          ${Object.entries(devices).map(([key, preset]) => `
            <button type="button" class="ghost-button" data-tl-device="${escapeHtml(key)}">${escapeHtml(preset.label)} (${preset.width}×${preset.height})</button>
          `).join("")}
        </div>
        ${session ? `
          <div class="tl-device-frame" style="width:${session.preset.width}px;max-width:100%;height:${Math.min(session.preset.height, 640)}px;" data-tl-device-frame>
            <p class="tl-device-label">${escapeHtml(session.device)} · ${session.preset.width}×${session.preset.height}</p>
            <iframe title="Device preview" src="/#director-center" class="tl-device-iframe"></iframe>
          </div>
          <button type="button" class="ghost-button" data-tl-open-tab>Open preview in browser tab</button>
        ` : ""}
      </section>
    `;
  }

  function flagsHtml() {
    const stored = state.dashboard?.flags?.stored || {};
    return `
      <section class="tl-section" data-tl-flags>
        <h3>Feature flag controls</h3>
        <p class="muted-copy">Production locks remain absolute. Environment secrets are never shown.</p>
        ${["directorCenter", "formsCenter", "familyHub", "testingLab"].map((key) => `
          <label class="tl-check">
            <input type="checkbox" data-tl-flag="${escapeHtml(key)}" ${stored[key] ? "checked" : ""}/>
            ${escapeHtml(key)} (stored)
          </label>
        `).join("")}
        <button type="button" class="primary-button" data-tl-save-flags>Save testing flags</button>
        <pre class="tl-pre">${escapeHtml(JSON.stringify(state.dashboard?.flags?.policy || {}, null, 2))}</pre>
      </section>
    `;
  }

  function dataHtml() {
    return `
      <section class="tl-section" data-tl-data>
        <h3>Data controls</h3>
        <p class="muted-copy">Resets only validated fake organizations on this test host. Never production, main, real users, or Stripe.</p>
        <button type="button" class="ghost-button" data-tl-reset-preview>Preview reset impact</button>
        <button type="button" class="primary-button" data-tl-reset-confirm>Confirm destructive test-data reset</button>
      </section>
    `;
  }

  function checklistHtml() {
    return `
      <section class="tl-section" data-tl-checklist>
        <h3>Owner test checklist</h3>
        <p class="muted-copy">Manual progress only — unchecked items are not automated failures.</p>
        <ul class="fh-card-list">
          ${(state.dashboard?.checklist || []).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.item.replace(/_/g, " "))}</strong>
              <span class="dc-badge">${escapeHtml(row.status)}</span>
              <select data-tl-note-status="${escapeHtml(row.item)}">
                ${["pass", "needs_change", "bug", "question", "not_tested"].map((s) => `
                  <option value="${s}"${row.status === s ? " selected" : ""}>${s}</option>
                `).join("")}
              </select>
              <button type="button" class="ghost-button" data-tl-save-note="${escapeHtml(row.item)}">Save note</button>
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function auditHtml() {
    return `
      <section class="tl-section" data-tl-audit>
        <h3>Test activity / audit</h3>
        <ul class="fh-card-list">
          ${(state.dashboard?.recentActivity || []).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.action)}</strong>
              <span class="muted-copy">${escapeHtml(row.at || "")}</span>
              <span>${escapeHtml(row.detail || "")}</span>
            </li>
          `).join("") || "<li class=\"muted-copy\">No activity</li>"}
        </ul>
      </section>
    `;
  }

  function bodyHtml() {
    if (state.panel === "accounts") return accountsHtml();
    if (state.panel === "scenarios") return scenariosHtml();
    if (state.panel === "preview") return previewHtml();
    if (state.panel === "device") return deviceHtml();
    if (state.panel === "flags") return flagsHtml();
    if (state.panel === "data") return dataHtml();
    if (state.panel === "checklist") return checklistHtml();
    if (state.panel === "audit") return auditHtml();
    return homeHtml();
  }

  function render(mount) {
    if (!mount) return;
    mount.innerHTML = `
      <section class="tl-panel" data-feature-marker="phase18-testing-lab">
        <p class="tl-banner">${escapeHtml(TESTING_BANNER)}</p>
        <p class="eyebrow">Testing and Preview Lab</p>
        <h2>Private testing area</h2>
        ${state.error ? `<p class="dc-error">${escapeHtml(state.error)}</p>` : ""}
        ${state.notice ? `<p class="muted-copy">${escapeHtml(state.notice)}</p>` : ""}
        ${panelNav()}
        ${state.loading ? `<p class="muted-copy">Loading…</p>` : bodyHtml()}
      </section>
    `;
    bind(mount);
  }

  function bind(mount) {
    mount.querySelectorAll("[data-tl-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.panel = btn.getAttribute("data-tl-panel");
        render(mount);
      });
    });
    mount.querySelector("[data-tl-quick-start]")?.addEventListener("click", async () => {
      try {
        await api("POST", `${BASE}/seed`, { scenario: "small_center", reset: true });
        state.notice = "Small Center scenario loaded.";
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-return-admin]")?.addEventListener("click", async () => {
      try {
        await api("POST", `${BASE}/role-preview/exit`, {});
        global.sessionStorage?.removeItem("llhRolePreviewMembershipId");
        state.preview = null;
        state.notice = "Returned to administrator account.";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelectorAll("[data-tl-load-scenario]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api("POST", `${BASE}/seed`, { scenario: btn.getAttribute("data-tl-load-scenario"), reset: true });
          state.notice = "Scenario loaded.";
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelectorAll("[data-tl-issue-password]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const data = await api("POST", `${BASE}/accounts/issue-password`, {
            accountId: btn.getAttribute("data-tl-issue-password"),
            forceChange: true,
          });
          state.oneTimePassword = data.temporaryPassword || "";
          state.issuedEmail = data.email || "";
          state.notice = "Temporary password issued — copy now; it will not be shown again.";
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelector("[data-tl-clear-password]")?.addEventListener("click", () => {
      state.oneTimePassword = "";
      state.issuedEmail = "";
      render(mount);
    });
    mount.querySelectorAll("[data-tl-revoke]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api("POST", `${BASE}/accounts/revoke-session`, { accountId: btn.getAttribute("data-tl-revoke") });
          state.notice = "Fake session revoked.";
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelectorAll("[data-tl-select-account]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api("POST", `${BASE}/accounts/select`, { accountId: btn.getAttribute("data-tl-select-account") });
          state.notice = "Fake account selected.";
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelectorAll("[data-tl-start-preview]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const data = await api("POST", `${BASE}/role-preview/start`, { targetKind: btn.getAttribute("data-tl-start-preview") });
          state.preview = data.preview;
          if (data.preview?.membershipId) {
            global.sessionStorage?.setItem("llhRolePreviewMembershipId", data.preview.membershipId);
          }
          state.notice = "Role preview started (admin stored role unchanged).";
          render(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelector("[data-tl-exit-preview]")?.addEventListener("click", async () => {
      try {
        await api("POST", `${BASE}/role-preview/exit`, { previewId: state.preview?.id });
        global.sessionStorage?.removeItem("llhRolePreviewMembershipId");
        state.preview = null;
        state.notice = "Exited role preview.";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelectorAll("[data-tl-device]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const data = await api("POST", `${BASE}/device`, { device: btn.getAttribute("data-tl-device") });
          state.deviceSession = data.deviceSession;
          state.panel = "device";
          state.notice = "Device selected.";
          render(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelector("[data-tl-open-tab]")?.addEventListener("click", () => {
      const preset = state.deviceSession?.preset;
      const url = `${global.location.origin}/#director-center`;
      global.open(url, "tl-device-preview", preset ? `width=${preset.width},height=${preset.height}` : "");
    });
    mount.querySelector("[data-tl-save-flags]")?.addEventListener("click", async () => {
      try {
        const body = {};
        mount.querySelectorAll("[data-tl-flag]").forEach((input) => {
          body[input.getAttribute("data-tl-flag")] = input.checked;
        });
        await api("POST", `${BASE}/flags`, body);
        state.notice = "Testing flags saved.";
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-reset-preview]")?.addEventListener("click", async () => {
      try {
        const data = await api("POST", `${BASE}/reset`, { confirm: false });
        state.notice = data.previewImpact
          ? `Reset would affect org ${data.previewImpact.organizationId}`
          : (data.error || "Confirmation required");
        render(mount);
      } catch (error) {
        // 400 with preview is expected
        state.notice = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-reset-confirm]")?.addEventListener("click", async () => {
      try {
        await api("POST", `${BASE}/reset`, { confirm: true });
        state.notice = "Test data reset and reseeded.";
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelectorAll("[data-tl-save-note]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const item = btn.getAttribute("data-tl-save-note");
          const select = mount.querySelector(`[data-tl-note-status="${item}"]`);
          await api("POST", `${BASE}/checklist/note`, {
            checklistItem: item,
            status: select?.value || "not_tested",
            body: `Manual note for ${item}`,
          });
          state.notice = "Checklist note saved.";
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelector("[data-tl-apply-feature-state]")?.addEventListener("click", async () => {
      try {
        const select = mount.querySelector("[data-tl-feature-state]");
        await api("POST", `${BASE}/feature-state`, { featureState: select?.value });
        state.notice = "Feature state label applied.";
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
  }

  async function refresh(mount) {
    state.loading = true;
    state.error = "";
    render(mount);
    try {
      state.dashboard = await api("GET", `${BASE}/dashboard`);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      render(mount);
    }
  }

  async function renderTestingLabPage(mountEl) {
    const mount = mountEl || document.querySelector("#view-testing-lab");
    if (!mount) return;
    state.panel = "home";
    await refresh(mount);
  }

  global.renderTestingLabPage = renderTestingLabPage;
})(typeof window !== "undefined" ? window : globalThis);
