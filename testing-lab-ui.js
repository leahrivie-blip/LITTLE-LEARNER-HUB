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
    health: null,
    releaseReadiness: null,
    migrationInspect: null,
    migrationPreview: null,
    migrationReport: null,
    migrationHistory: null,
    lastMigrationBackupId: "",
    restorePreview: null,
    lastBackup: null,
    activityPage: 1,
    activity: null,
    loading: false,
    error: "",
    notice: "",
    oneTimePassword: "",
    issuedEmail: "",
    onboardResult: null,
    deviceSession: null,
    preview: null,
    saveStatus: "idle",
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
      ["health", "Health"],
      ["release", "Release Readiness"],
      ["migration", "Migration"],
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
      <nav class="tl-subnav" aria-label="Testing Lab panels">
        ${items.map(([id, label]) => `
          <button type="button" class="ghost-button tl-touch${state.panel === id ? " active" : ""}" data-tl-panel="${id}" aria-current="${state.panel === id ? "page" : "false"}">${label}</button>
        `).join("")}
      </nav>
    `;
  }

  function onboardResultHtml() {
    if (!state.onboardResult) return "";
    const r = state.onboardResult;
    return `
      <div class="tl-onetime" data-tl-onboard-result>
        <p><strong>Testing environment ready.</strong> ${escapeHtml(r.note || "")}</p>
        <p class="muted-copy">Feature flags enabled: ${escapeHtml((r.featureFlagsEnabled || []).join(", "))}</p>
        <table class="tl-onboard-table">
          <thead>
            <tr><th>Role</th><th>Email</th><th>Temporary password</th><th>Program</th></tr>
          </thead>
          <tbody>
            ${(r.logins || []).map((row) => `
              <tr>
                <td>${escapeHtml(row.role)}</td>
                <td><code>${escapeHtml(row.email)}</code></td>
                <td><code>${escapeHtml(row.temporaryPassword)}</code></td>
                <td class="muted-copy">${escapeHtml(row.program)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${(r.missingRoles || []).length ? `<p class="muted-copy">Could not find fake accounts for: ${escapeHtml(r.missingRoles.join(", "))}</p>` : ""}
        <button type="button" class="ghost-button" data-tl-clear-onboard>Clear from screen</button>
      </div>
    `;
  }

  function homeHtml() {
    const d = state.dashboard?.dashboard || {};
    return `
      <section class="tl-section" data-tl-home>
        <div class="fu-toolbar">
          <h3>Testing Lab dashboard</h3>
          <button type="button" class="primary-button" data-tl-onboard-everything>Get the testing site ready (seed both programs + all logins)</button>
          <button type="button" class="ghost-button" data-tl-quick-start>Quick start (Small Center)</button>
          <button type="button" class="ghost-button" data-tl-return-admin>Return to administrator account</button>
        </div>
        ${onboardResultHtml()}
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
    const preview = state.restorePreview;
    return `
      <section class="tl-section" data-tl-data aria-labelledby="tl-data-heading">
        <h3 id="tl-data-heading">Data controls</h3>
        <p class="muted-copy">Resets and backup/restore simulation only affect validated fake organizations on this test host. Never production, main, real users, or Stripe.</p>
        <div class="tl-actions-row">
          <button type="button" class="ghost-button tl-touch" data-tl-reset-preview>Preview reset impact</button>
          <button type="button" class="primary-button tl-touch" data-tl-reset-confirm>Confirm destructive test-data reset</button>
        </div>
        <h4>Fake backup / restore simulation</h4>
        <p class="muted-copy">Creates a testing-only snapshot label. No real production backup or restore.</p>
        <div class="tl-actions-row">
          <button type="button" class="ghost-button tl-touch" data-tl-backup-simulate>Simulate fake backup</button>
          ${state.lastBackup ? `<button type="button" class="ghost-button tl-touch" data-tl-restore-preview="${escapeHtml(state.lastBackup.id)}">Preview restore</button>` : ""}
          ${preview ? `<button type="button" class="primary-button tl-touch" data-tl-restore-confirm="${escapeHtml(preview.id)}">Confirm fake restore</button>` : ""}
        </div>
        ${state.lastBackup ? `<pre class="tl-pre" aria-label="Last fake backup">${escapeHtml(JSON.stringify(state.lastBackup, null, 2))}</pre>` : ""}
        ${preview ? `<pre class="tl-pre" aria-label="Restore preview">${escapeHtml(JSON.stringify(preview, null, 2))}</pre>` : ""}
      </section>
    `;
  }

  function checklistHtml() {
    const statusLabel = {
      idle: "",
      saving: "Saving…",
      saved: "Saved",
      unsaved: "Unsaved changes",
      retrying: "Retrying…",
      failed: "Save failed — try again",
    }[state.saveStatus] || "";
    return `
      <section class="tl-section" data-tl-checklist aria-labelledby="tl-checklist-heading">
        <h3 id="tl-checklist-heading">Owner test checklist</h3>
        <p class="muted-copy">Manual progress only — unchecked items are not automated failures.</p>
        <p class="tl-save-status" role="status" aria-live="polite" data-save-state="${escapeHtml(state.saveStatus)}">${escapeHtml(statusLabel)}</p>
        <ul class="fh-card-list">
          ${(state.dashboard?.checklist || []).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.item.replace(/_/g, " "))}</strong>
              <span class="llh-status-pill llh-status-pill--info" data-status-tone="info"><span class="llh-status-pill__label">Status:</span> ${escapeHtml(row.status)}</span>
              <label class="visually-hidden" for="tl-note-${escapeHtml(row.item)}">Status for ${escapeHtml(row.item)}</label>
              <select id="tl-note-${escapeHtml(row.item)}" data-tl-note-status="${escapeHtml(row.item)}">
                ${["pass", "needs_change", "bug", "question", "not_tested"].map((s) => `
                  <option value="${s}"${row.status === s ? " selected" : ""}>${s}</option>
                `).join("")}
              </select>
              <button type="button" class="ghost-button tl-touch" data-tl-save-note="${escapeHtml(row.item)}">Save note</button>
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function auditHtml() {
    const page = state.activity || {};
    const items = page.items || state.dashboard?.recentActivity || [];
    return `
      <section class="tl-section" data-tl-audit aria-labelledby="tl-audit-heading">
        <h3 id="tl-audit-heading">Test activity / audit</h3>
        <p class="muted-copy">Paginated to keep large histories from freezing the page.</p>
        <ul class="fh-card-list">
          ${items.map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.action)}</strong>
              <span class="muted-copy">${escapeHtml(row.at || "")}</span>
              <span>${escapeHtml(row.detail || "")}</span>
            </li>
          `).join("") || "<li class=\"muted-copy\">No activity</li>"}
        </ul>
        <div class="tl-actions-row">
          <button type="button" class="ghost-button tl-touch" data-tl-activity-prev ${state.activityPage <= 1 ? "disabled" : ""}>Previous</button>
          <span class="muted-copy">Page ${escapeHtml(String(page.page || state.activityPage))} / ${escapeHtml(String(page.totalPages || 1))}</span>
          <button type="button" class="ghost-button tl-touch" data-tl-activity-next ${page.hasMore === false ? "disabled" : ""}>Next</button>
        </div>
      </section>
    `;
  }

  function healthHtml() {
    const h = state.health || {};
    const flags = h.featureFlags || {};
    const external = h.externalServices || {};
    const failed = h.failedSaves || {};
    const perf = h.performance || {};
    return `
      <section class="tl-section" data-tl-health data-feature-marker="phase19-platform-resilience" aria-labelledby="tl-health-heading">
        <h3 id="tl-health-heading">System health &amp; performance</h3>
        <p class="tl-banner" role="status">${escapeHtml(TESTING_BANNER)}</p>
        <p class="muted-copy">Admin-visible testing summary. External services stay disabled for this workstream. No production backup/restore.</p>
        <div class="tl-status-row" role="list">
          <div class="tl-metric fh-card static" role="listitem">
            <strong>Storage</strong>
            <span>${escapeHtml(h.storage?.provider || "—")}</span>
            <span class="llh-status-pill llh-status-pill--${h.storage?.ready ? "success" : "warning"}"><span class="llh-status-pill__label">${h.storage?.ready ? "Ready" : "Warning"}:</span> ${h.storage?.testingSafe ? "testing-safe" : "check provider"}</span>
          </div>
          <div class="tl-metric fh-card static" role="listitem">
            <strong>Failed saves</strong>
            <span>${escapeHtml(String(failed.openCount ?? 0))} open</span>
            <span class="muted-copy">Sanitized metadata only</span>
          </div>
          <div class="tl-metric fh-card static" role="listitem">
            <strong>Health timing</strong>
            <span>${escapeHtml(String(perf.durationMs ?? "—"))} ms</span>
            <span class="llh-status-pill llh-status-pill--${perf.withinBudget ? "success" : "warning"}"><span class="llh-status-pill__label">${perf.withinBudget ? "Within budget" : "Over budget"}:</span> ${escapeHtml(String(perf.budgetMs || "—"))} ms</span>
          </div>
        </div>
        <h4>Feature flags</h4>
        <ul class="fh-card-list">
          ${Object.entries(flags).map(([key, on]) => `
            <li class="fh-card static"><strong>${escapeHtml(key)}</strong>
              <span class="llh-status-pill llh-status-pill--${on ? "success" : "info"}"><span class="llh-status-pill__label">${on ? "On" : "Off"}:</span> stored</span>
            </li>
          `).join("")}
        </ul>
        <h4>External services</h4>
        <ul class="fh-card-list">
          ${Object.entries(external).map(([key, status]) => `
            <li class="fh-card static"><strong>${escapeHtml(key)}</strong>
              <span class="llh-status-pill llh-status-pill--info"><span class="llh-status-pill__label">Status:</span> ${escapeHtml(status)}</span>
            </li>
          `).join("")}
        </ul>
        <div class="tl-actions-row">
          <button type="button" class="primary-button tl-touch" data-tl-refresh-health>Refresh health</button>
          <button type="button" class="ghost-button tl-touch" data-tl-seed-resilience>Seed resilience fixtures</button>
        </div>
        <pre class="tl-pre" aria-label="Health JSON summary">${escapeHtml(JSON.stringify({
          storage: h.storage,
          backupRestore: h.backupRestore,
          launchReadiness: h.launchReadiness,
          budgets: perf.budgets || null,
        }, null, 2))}</pre>
      </section>
    `;
  }

  function releaseHtml() {
    const r = state.releaseReadiness || {};
    const id = r.identity || {};
    const kills = r.killSwitches || {};
    const flags = r.featureFlags || {};
    const mig = r.migrationReadiness || {};
    const prod = r.productionLock || {};
    return `
      <section class="tl-section" data-tl-release data-feature-marker="phase20-release-readiness" aria-labelledby="tl-release-heading">
        <h3 id="tl-release-heading">Release Readiness Center</h3>
        <p class="tl-banner" role="status">${escapeHtml(TESTING_BANNER)}</p>
        <p class="tl-computer-recommended" data-tl-computer-recommended>Release Readiness is computer recommended</p>
        <p class="muted-copy">Computer-first checklist for safe future integration. Does not deploy, merge to main, or run production migration.</p>
        <div class="tl-status-row" role="list">
          <div class="tl-metric fh-card static" role="listitem">
            <strong>Branch</strong>
            <span>${escapeHtml(id.branchName || "—")}</span>
            <span class="muted-copy">${escapeHtml(id.gitSha || "sha unset")}</span>
          </div>
          <div class="tl-metric fh-card static" role="listitem">
            <strong>Storage</strong>
            <span>${escapeHtml(id.databaseProvider || "—")}</span>
            <span class="llh-status-pill llh-status-pill--${id.liveProduction ? "error" : "success"}"><span class="llh-status-pill__label">${id.liveProduction ? "Live host" : "Testing"}:</span> ${escapeHtml(id.nodeEnv || "")}</span>
          </div>
          <div class="tl-metric fh-card static" role="listitem">
            <strong>Migration</strong>
            <span>${escapeHtml(mig.status || "—")}</span>
            <span class="muted-copy">${escapeHtml(mig.note || "")}</span>
          </div>
        </div>
        <h4>External-service kill switches</h4>
        <ul class="fh-card-list">
          ${Object.entries(kills).map(([key, status]) => `
            <li class="fh-card static"><strong>${escapeHtml(key)}</strong>
              <span class="llh-status-pill llh-status-pill--${status === "disabled" ? "success" : "warning"}"><span class="llh-status-pill__label">Status:</span> ${escapeHtml(status)}</span>
            </li>
          `).join("")}
        </ul>
        <h4>Feature flags</h4>
        <ul class="fh-card-list">
          ${Object.entries(flags).map(([key, on]) => `
            <li class="fh-card static"><strong>${escapeHtml(key)}</strong>
              <span class="llh-status-pill llh-status-pill--${on ? "success" : "info"}"><span class="llh-status-pill__label">${on ? "On" : "Off"}:</span> stored</span>
            </li>
          `).join("")}
        </ul>
        <h4>Production lock</h4>
        <ul class="fh-card-list">
          <li class="fh-card static">Lab rejected on production: <strong>${prod.testingLabRejectedOnProduction ? "yes" : "check"}</strong></li>
          <li class="fh-card static">Migration mutations rejected on production: <strong>${prod.migrationMutationsRejectedOnProduction ? "yes" : "check"}</strong></li>
          <li class="fh-card static">main untouched policy: <strong>${prod.mainUntouched ? "yes" : "check"}</strong></li>
        </ul>
        <h4>Security checklist (summary)</h4>
        <ul class="fh-card-list">
          ${(r.securityChecklist || []).slice(0, 8).map((row) => `
            <li class="fh-card static">
              <strong>${escapeHtml(row.label)}</strong>
              <span class="llh-status-pill llh-status-pill--${row.status === "hardened" ? "success" : "warning"}"><span class="llh-status-pill__label">${escapeHtml(row.status)}:</span> review</span>
            </li>
          `).join("")}
        </ul>
        <h4>Owner manual checklist</h4>
        <ul class="fh-card-list">
          ${(r.ownerManualChecklist || []).map((row) => `
            <li class="fh-card static"><strong>${escapeHtml(row.label)}</strong><span class="muted-copy">${escapeHtml(row.status)}</span></li>
          `).join("")}
        </ul>
        <h4>Known blockers / deferred</h4>
        <ul class="fh-card-list">
          ${(r.knownBlockers || []).map((b) => `<li class="fh-card static">${escapeHtml(b)}</li>`).join("") || "<li class=\"muted-copy\">None flagged for this environment</li>"}
          ${(r.deferredItems || []).slice(0, 6).map((b) => `<li class="fh-card static muted-copy">Deferred: ${escapeHtml(b)}</li>`).join("")}
        </ul>
        <div class="tl-actions-row">
          <button type="button" class="primary-button tl-touch" data-tl-refresh-release>Refresh readiness</button>
          <button type="button" class="ghost-button tl-touch" data-tl-panel="migration">Open migration simulator</button>
        </div>
      </section>
    `;
  }

  function migrationHtml() {
    const insp = state.migrationInspect || {};
    const preview = state.migrationPreview || {};
    const report = state.migrationReport || {};
    return `
      <section class="tl-section" data-tl-migration data-feature-marker="phase20-migration-simulator" aria-labelledby="tl-mig-heading">
        <h3 id="tl-mig-heading">Data migration simulator</h3>
        <p class="tl-banner" role="status">${escapeHtml(TESTING_BANNER)}</p>
        <p class="muted-copy">Inspect and preview fake-organization links only. Never runs a real production migration. Original records are preserved; apply requires explicit confirmation.</p>
        <div class="tl-actions-row">
          <button type="button" class="primary-button tl-touch" data-tl-mig-inspect>Inspect fake org</button>
          <button type="button" class="ghost-button tl-touch" data-tl-mig-preview>Preview migration</button>
          <button type="button" class="ghost-button tl-touch" data-tl-mig-report>Export sanitized report</button>
          <button type="button" class="ghost-button tl-touch" data-tl-mig-history>Show history</button>
        </div>
        ${insp.organizationId ? `
          <h4>Inspection (read-only)</h4>
          <pre class="tl-pre" aria-label="Migration inspection">${escapeHtml(JSON.stringify({
            organizationId: insp.organizationId,
            counts: insp.counts,
            issues: insp.issues,
            classroomLabelMatches: insp.classroomLabelMatches,
            ownershipPreview: insp.ownershipPreview,
          }, null, 2))}</pre>
        ` : ""}
        ${preview.id ? `
          <h4>Preview — confirm required</h4>
          <pre class="tl-pre" aria-label="Migration preview">${escapeHtml(JSON.stringify({
            id: preview.id,
            wouldCreate: preview.wouldCreate,
            wouldUpdate: preview.wouldUpdate,
            wouldSkip: preview.wouldSkip,
            wouldFlag: preview.wouldFlag,
          }, null, 2))}</pre>
          <button type="button" class="primary-button tl-touch" data-tl-mig-apply="${escapeHtml(preview.id)}">Confirm apply fake migration</button>
        ` : ""}
        ${state.lastMigrationBackupId ? `
          <button type="button" class="ghost-button tl-touch" data-tl-mig-rollback="${escapeHtml(state.lastMigrationBackupId)}">Confirm rollback simulation</button>
        ` : ""}
        ${report.reportType ? `
          <h4>Sanitized report</h4>
          <pre class="tl-pre" aria-label="Sanitized migration report">${escapeHtml(JSON.stringify(report, null, 2))}</pre>
        ` : ""}
        ${state.migrationHistory ? `
          <h4>Migration history</h4>
          <ul class="fh-card-list">
            ${(state.migrationHistory.items || []).map((row) => `
              <li class="fh-card static"><strong>${escapeHtml(row.action)}</strong><span class="muted-copy">${escapeHtml(row.at || "")}</span></li>
            `).join("") || "<li class=\"muted-copy\">None</li>"}
          </ul>
        ` : ""}
      </section>
    `;
  }

  function bodyHtml() {
    if (state.panel === "health") return healthHtml();
    if (state.panel === "release") return releaseHtml();
    if (state.panel === "migration") return migrationHtml();
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

  function mobileSummaryHtml() {
    const d = state.dashboard?.dashboard || {};
    const phone = state.releaseReadiness?.phoneSummary || {};
    const apiPreview = d.rolePreview && d.rolePreview.active !== false ? d.rolePreview : null;
    const previewActive = Boolean(
      state.preview?.id
      || apiPreview?.id
      || d.rolePreviewId
      || global.sessionStorage?.getItem("llhRolePreviewMembershipId"),
    );
    const previewKind = state.preview?.targetKind || apiPreview?.targetKind || apiPreview?.label || "";
    const previewLabel = previewActive
      ? (previewKind ? `Active — ${String(previewKind).replace(/_/g, " ")}` : "Active (temporary)")
      : "Not active";
    const orgSafe = d.organizationId && !/prod|live|stripe|customer/i.test(String(d.organizationId))
      ? d.organizationId
      : "";
    const scenarioSafe = d.scenario || "";
    return `
      <section class="tl-mobile-summary" data-feature-marker="phase18-testing-lab-mobile" data-phase20-marker="phase20-release-readiness-mobile" data-tl-mobile-summary>
        <p class="tl-computer-recommended" data-tl-computer-recommended>Testing Lab is computer recommended</p>
        <p class="muted-copy">Release Readiness is computer recommended — open the computer website for full checklists and migration tools.</p>
        <h2>Phone status summary</h2>
        <p class="muted-copy">
          Security review details, migration preview/confirm, Release Readiness checklists, scenario setup,
          fake-account management, role preview, resets, and device testing should be completed on the
          computer website. This phone view is a status summary only.
        </p>
        <ul class="tl-mobile-status fh-card-list">
          <li class="fh-card static">
            <strong>Fake organization</strong>
            <span class="muted-copy">${escapeHtml(orgSafe || "Not loaded on this device")}</span>
          </li>
          <li class="fh-card static">
            <strong>Scenario</strong>
            <span class="muted-copy">${escapeHtml(scenarioSafe ? scenarioSafe.replace(/_/g, " ") : "—")}</span>
          </li>
          <li class="fh-card static">
            <strong>Role preview</strong>
            <span class="muted-copy">${escapeHtml(previewLabel)}</span>
          </li>
          <li class="fh-card static">
            <strong>Migration readiness</strong>
            <span class="muted-copy">${escapeHtml(phone.migrationStatus || state.releaseReadiness?.migrationReadiness?.status || "Open on computer")}</span>
          </li>
          <li class="fh-card static">
            <strong>Kill switches</strong>
            <span class="muted-copy">${phone.killSwitchesOk === false ? "Review on computer" : "Expect disabled on testing"}</span>
          </li>
        </ul>
        <div class="tl-mobile-actions">
          ${previewActive ? `<button type="button" class="primary-button tl-touch" data-tl-exit-preview>Exit Role Preview</button>` : ""}
          <button type="button" class="ghost-button tl-touch" data-tl-return-app>Return to the normal app</button>
        </div>
        <p class="muted-copy">No passwords, tokens, migration controls, or Lab admin tools are shown on phone.</p>
      </section>
    `;
  }

  function render(mount) {
    if (!mount) return;
    // Never keep one-time passwords visible when re-rendering for phone captures.
    mount.innerHTML = `
      <section class="tl-panel" data-feature-marker="phase18-testing-lab" aria-label="Testing and Preview Lab">
        <p class="tl-banner" role="status">${escapeHtml(TESTING_BANNER)}</p>
        ${mobileSummaryHtml()}
        <div class="tl-desktop-lab" data-tl-desktop-lab>
          <p class="eyebrow">Testing and Preview Lab</p>
          <h2>Private testing area</h2>
          ${state.error ? `<div class="llh-error-summary" role="alert"><p class="dc-error">${escapeHtml(state.error)}</p><button type="button" class="ghost-button" data-tl-try-again>Try Again</button></div>` : ""}
          ${state.notice ? `<p class="muted-copy" role="status">${escapeHtml(state.notice)}</p>` : ""}
          ${panelNav()}
          ${state.loading ? `<p class="muted-copy" role="status" aria-live="polite">Loading…</p>` : bodyHtml()}
        </div>
      </section>
    `;
    bind(mount);
  }

  function bind(mount) {
    mount.querySelectorAll("[data-tl-panel]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.panel = btn.getAttribute("data-tl-panel");
        if (state.panel === "health") {
          try {
            state.health = await api("GET", `${BASE}/health`);
          } catch (error) {
            state.error = error.message;
          }
        }
        if (state.panel === "release") {
          try {
            state.releaseReadiness = await api("GET", `${BASE}/release-readiness`);
          } catch (error) {
            state.error = error.message;
          }
        }
        if (state.panel === "audit") {
          try {
            state.activity = await api("GET", `${BASE}/activity?page=${state.activityPage}&pageSize=20`);
          } catch (error) {
            state.error = error.message;
          }
        }
        render(mount);
      });
    });
    mount.querySelector("[data-tl-try-again]")?.addEventListener("click", async () => {
      state.error = "";
      await refresh(mount);
    });
    mount.querySelector("[data-tl-refresh-release]")?.addEventListener("click", async () => {
      try {
        state.releaseReadiness = await api("GET", `${BASE}/release-readiness`);
        state.notice = "Release readiness refreshed.";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-mig-inspect]")?.addEventListener("click", async () => {
      try {
        state.migrationInspect = await api("GET", `${BASE}/migration/inspect`);
        state.notice = "Inspection complete (no mutations).";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-mig-preview]")?.addEventListener("click", async () => {
      try {
        const data = await api("POST", `${BASE}/migration/preview`, {});
        state.migrationPreview = data.preview;
        state.migrationReport = data.report;
        state.notice = "Migration preview ready — confirm required to apply.";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-mig-report]")?.addEventListener("click", async () => {
      try {
        const data = await api("GET", `${BASE}/migration/report`);
        state.migrationReport = data.report;
        state.notice = "Sanitized report exported (no secrets).";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-mig-history]")?.addEventListener("click", async () => {
      try {
        state.migrationHistory = await api("GET", `${BASE}/migration/history`);
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-mig-apply]")?.addEventListener("click", async (event) => {
      try {
        const previewId = event.currentTarget.getAttribute("data-tl-mig-apply");
        const data = await api("POST", `${BASE}/migration/apply`, { previewId, confirm: true });
        state.lastMigrationBackupId = data.backupId || "";
        state.notice = "Fake migration applied (session stamp only).";
        state.migrationHistory = await api("GET", `${BASE}/migration/history`);
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-mig-rollback]")?.addEventListener("click", async (event) => {
      try {
        const backupId = event.currentTarget.getAttribute("data-tl-mig-rollback");
        await api("POST", `${BASE}/migration/rollback`, { backupId, confirm: true });
        state.notice = "Fake migration rollback simulation complete.";
        state.migrationHistory = await api("GET", `${BASE}/migration/history`);
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-refresh-health]")?.addEventListener("click", async () => {
      try {
        state.health = await api("GET", `${BASE}/health`);
        state.notice = "Health refreshed.";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-seed-resilience]")?.addEventListener("click", async () => {
      try {
        await api("POST", `${BASE}/resilience/seed`, {});
        state.health = await api("GET", `${BASE}/health`);
        state.notice = "Resilience fixtures seeded (fake org only).";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-backup-simulate]")?.addEventListener("click", async () => {
      try {
        const data = await api("POST", `${BASE}/backup/simulate`, {});
        state.lastBackup = data.backup;
        state.notice = "Fake backup simulation created.";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-restore-preview]")?.addEventListener("click", async (event) => {
      try {
        const backupId = event.currentTarget.getAttribute("data-tl-restore-preview");
        const data = await api("POST", `${BASE}/restore/preview`, { backupId });
        state.restorePreview = data.preview;
        state.notice = "Restore preview ready — confirm to apply fake snapshot labels.";
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-restore-confirm]")?.addEventListener("click", async (event) => {
      try {
        const previewId = event.currentTarget.getAttribute("data-tl-restore-confirm");
        await api("POST", `${BASE}/restore/confirm`, { previewId, confirm: true });
        state.restorePreview = null;
        state.notice = "Fake restore simulation applied.";
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-activity-prev]")?.addEventListener("click", async () => {
      state.activityPage = Math.max(1, state.activityPage - 1);
      state.activity = await api("GET", `${BASE}/activity?page=${state.activityPage}&pageSize=20`);
      render(mount);
    });
    mount.querySelector("[data-tl-activity-next]")?.addEventListener("click", async () => {
      state.activityPage += 1;
      state.activity = await api("GET", `${BASE}/activity?page=${state.activityPage}&pageSize=20`);
      render(mount);
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
    mount.querySelector("[data-tl-onboard-everything]")?.addEventListener("click", async () => {
      try {
        state.onboardResult = await api("POST", `${BASE}/onboard-everything`, {});
        state.notice = "Testing site ready — copy every password now, shown once.";
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-clear-onboard]")?.addEventListener("click", () => {
      state.onboardResult = null;
      render(mount);
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
    mount.querySelector("[data-tl-return-app]")?.addEventListener("click", () => {
      state.oneTimePassword = "";
      state.issuedEmail = "";
      if (typeof global.setView === "function") {
        global.setView("home");
        return;
      }
      global.location.hash = "#home";
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
    mount.querySelectorAll("[data-tl-exit-preview]").forEach((btn) => {
      btn.addEventListener("click", async () => {
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
        const item = btn.getAttribute("data-tl-save-note");
        const select = mount.querySelector(`[data-tl-note-status="${item}"]`);
        const statusEl = mount.querySelector(".tl-save-status");
        const controller = global.LLHPlatformResilience?.createSaveController?.({
          statusEl,
          onStateChange: (next) => { state.saveStatus = next; },
        });
        const saveFn = async () => {
          await api("POST", `${BASE}/checklist/note`, {
            checklistItem: item,
            status: select?.value || "not_tested",
            body: `Manual note for ${item}`,
          });
          // Scoped draft clear after successful save
          const orgId = state.dashboard?.dashboard?.organizationId || "";
          global.LLHPlatformResilience?.draftStore?.clear?.({
            surface: "testing_lab_checklist",
            organizationId: orgId,
            userId: "admin",
            recordId: item,
          });
        };
        if (controller) {
          const result = await controller.run(saveFn);
          if (!result.ok) {
            state.error = result.error?.message || "Save failed";
            await api("POST", `${BASE}/failed-saves/record`, {
              code: result.error?.code || "save_failed",
              message: result.error?.message || "Save failed",
              surface: "testing_lab_checklist",
              networkState: result.error?.networkState,
            }).catch(() => null);
            render(mount);
            return;
          }
          state.notice = "Checklist note saved.";
          await refresh(mount);
          return;
        }
        try {
          await saveFn();
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
      try {
        state.releaseReadiness = await api("GET", `${BASE}/release-readiness`);
      } catch {
        /* optional for older sessions */
      }
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
