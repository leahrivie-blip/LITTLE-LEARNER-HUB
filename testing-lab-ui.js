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
    createdOrgId: "",
    orgLogins: [],
    orgLoginsOrgId: "",
    sandboxAccounts: [],
    sandboxRoleCatalog: [],
    sandboxNotice: "",
    pilotWizardResult: null,
    pilotWizardError: "",
    onboardResult: null,
    aiStatus: null,
    aiScenarios: [],
    aiRunsByScenario: {},
    aiPromptWorkflow: "classroom_assistant",
    aiPromptVersions: [],
    aiUsage: null,
    aiError: "",
    tfThreads: [],
    tfFilter: { status: "", category: "", unreadOnly: false, retestRequested: false },
    tfActiveThreadId: "",
    tfActiveThread: null,
    tfMessages: [],
    tfNotes: [],
    tfReplyText: "",
    tfNoteText: "",
    tfError: "",
    tfUnreadCount: 0,
    deviceSession: null,
    preview: null,
    saveStatus: "idle",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Testing Lab's role preview writes directly to sessionStorage without
  // going through any of app.js's own preview-mode setters, so the global
  // top-nav "Exit Preview" escape button and testing-identity role banner
  // (both live in app.js/index.html, outside this module) would otherwise
  // never learn that a preview just started or ended. Every call here is
  // optional-chained — this module must keep working standalone (e.g. in
  // this file's own unit tests) even where those globals don't exist.
  function notifyGlobalPreviewChrome() {
    try { global.refreshTopNavExitPreview?.(); } catch { /* */ }
    try { global.refreshTestingIdentityBanner?.(); } catch { /* */ }
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
      ["ai", "AI Outcomes"],
      ["feedback", "Testing Feedback"],
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

  const AI_WORKFLOW_LABELS = {
    classroom_assistant: "Classroom Assistant",
    professional_draft: "Professional drafts",
    lesson_plan_assist: "Lesson plan / activity assistance",
    form_builder: "Form Builder",
  };

  const TF_CATEGORY_LABELS = {
    bug: "Bug",
    confusing_screen: "Confusing screen",
    missing_feature: "Missing feature",
    layout_problem: "Layout problem",
    ai_result: "AI result",
    suggestion: "Suggestion",
    other: "Other",
  };

  const TF_STATUS_LABELS = {
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
    closed: "Closed",
  };

  function aiRunSummaryHtml(run) {
    if (!run) return "<p class=\"muted-copy\">Not run yet.</p>";
    return `
      <div class="tl-ai-run">
        <p class="muted-copy">Model: ${escapeHtml(run.model || "—")} · Latency: ${escapeHtml(String(run.latencyMs || 0))}ms · Est. cost: ${escapeHtml((run.costCents || 0).toFixed(4))}¢ · Tokens: ${escapeHtml(String(run.tokensUsed?.total || 0))}</p>
        ${(run.warnings || []).length ? `<p class="tl-ai-warning">⚠ ${escapeHtml(run.warnings.join(" · "))}</p>` : ""}
        <div class="tl-ai-compare">
          <div>
            <h5>Heuristic result</h5>
            <pre class="tl-ai-json">${escapeHtml(JSON.stringify(run.heuristicResult, null, 2)).slice(0, 1200)}</pre>
          </div>
          <div>
            <h5>OpenAI result</h5>
            <pre class="tl-ai-json">${run.aiResult ? escapeHtml(JSON.stringify(run.aiResult, null, 2)).slice(0, 1200) : "<em>Unavailable — see warnings above.</em>"}</pre>
          </div>
        </div>
        <div class="tl-actions-row">
          <button type="button" class="ghost-button" data-tl-ai-rate="${escapeHtml(run.id)}" data-tl-ai-rating="helpful">Helpful</button>
          <button type="button" class="ghost-button" data-tl-ai-rate="${escapeHtml(run.id)}" data-tl-ai-rating="needs_changes">Needs changes</button>
          <button type="button" class="ghost-button" data-tl-ai-rate="${escapeHtml(run.id)}" data-tl-ai-rating="not_usable">Not usable</button>
          ${run.rating ? `<span class="dc-badge">Rated: ${escapeHtml(run.rating)}</span>` : ""}
        </div>
      </div>
    `;
  }

  function aiOutcomesHtml() {
    const status = state.aiStatus;
    return `
      <section class="tl-section" data-tl-ai-outcomes>
        <h3>AI Outcomes — testing only</h3>
        <p class="muted-copy">Compare the heuristic result with a real, structured OpenAI response on fake scenarios only. Nothing here ever saves, sends, publishes, bills, or diagnoses automatically.</p>
        ${status ? `
          <div class="tl-status-row">
            <article class="dc-metric-card tl-metric"><p class="dc-metric-label">AI testing enabled</p><p class="dc-metric-value">${status.enabled ? "Yes" : "No"}</p></article>
            <article class="dc-metric-card tl-metric"><p class="dc-metric-label">Model configured</p><p class="dc-metric-value">${escapeHtml(status.model || "—")}</p></article>
            <article class="dc-metric-card tl-metric"><p class="dc-metric-label">Testing key present</p><p class="dc-metric-value">${status.hasApiKey ? "Yes" : "No"}</p></article>
            <article class="dc-metric-card tl-metric"><p class="dc-metric-label">Total AI requests so far</p><p class="dc-metric-value">${escapeHtml(String(status.usageTotals?.totalRequests || 0))}</p></article>
            <article class="dc-metric-card tl-metric"><p class="dc-metric-label">Estimated total cost</p><p class="dc-metric-value">${escapeHtml((status.usageTotals?.estimatedCostCents || 0).toFixed(4))}¢</p></article>
          </div>
          ${!status.enabled ? `<p class="tl-ai-warning">⚠ AI testing is off (${escapeHtml(status.reason || "unknown reason")}). Turn on the "aiTesting" flag and confirm a testing OPENAI_API_KEY is set — the heuristic system keeps working either way.</p>` : ""}
        ` : "<p class=\"muted-copy\">Loading status…</p>"}

        <h4>Usage limits, by organization</h4>
        <p class="muted-copy">Sanitized counts only — never a prompt, a completion, or any other private provider entry. Limits: ${escapeHtml(String(state.aiUsage?.limits?.perTesterPerMinute ?? 5))}/minute per tester, ${escapeHtml(String(state.aiUsage?.limits?.perOrganizationPerMinute ?? 20))}/minute per organization, ${escapeHtml(String(state.aiUsage?.limits?.perOrganizationPerDay ?? 200))}/day per organization.</p>
        <ul class="fh-card-list">
          ${(state.aiUsage?.organizations || []).map((org) => `
            <li class="fh-card static">
              <strong>${escapeHtml(org.organizationId)}</strong>
              <span class="dc-badge">This minute: ${escapeHtml(String(org.perMinute?.count || 0))} / ${escapeHtml(String(org.perMinute?.max || 0))}</span>
              <span class="dc-badge">Today: ${escapeHtml(String(org.perDay?.count || 0))} / ${escapeHtml(String(org.perDay?.max || 0))}</span>
            </li>
          `).join("") || "<li class=\"muted-copy\">No AI testing activity yet for any organization.</li>"}
        </ul>

        <h4>Fake scenario library</h4>
        <ul class="fh-card-list">
          ${(state.aiScenarios || []).map((scenario) => `
            <li class="fh-card static" data-tl-ai-scenario="${escapeHtml(scenario.id)}">
              <strong>${escapeHtml(scenario.label)}</strong>
              <span class="dc-badge">${escapeHtml(AI_WORKFLOW_LABELS[scenario.workflowType] || scenario.workflowType)}</span>
              <p class="muted-copy">"${escapeHtml(scenario.inputText).slice(0, 140)}${scenario.inputText.length > 140 ? "…" : ""}"</p>
              <div class="tl-actions-row">
                <button type="button" class="ghost-button" data-tl-ai-run="${escapeHtml(scenario.id)}">Run this scenario</button>
              </div>
              ${aiRunSummaryHtml(state.aiRunsByScenario[scenario.id])}
            </li>
          `).join("") || "<li class=\"muted-copy\">Loading scenarios…</li>"}
        </ul>

        <h4>Prompt versions</h4>
        <select data-tl-ai-prompt-workflow>
          ${Object.entries(AI_WORKFLOW_LABELS).map(([key, label]) => `<option value="${escapeHtml(key)}" ${state.aiPromptWorkflow === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
        </select>
        <ul class="fh-card-list">
          ${(state.aiPromptVersions || []).map((version) => `
            <li class="fh-card static">
              <strong>${version.active ? "● Active" : "Inactive"} — ${escapeHtml(version.createdAt || "")}</strong>
              <p class="muted-copy">${escapeHtml(version.text || "").slice(0, 220)}</p>
              ${!version.active ? `<button type="button" class="ghost-button" data-tl-ai-rollback="${escapeHtml(version.id)}">Roll back to this version</button>` : ""}
            </li>
          `).join("") || "<li class=\"muted-copy\">No versions saved yet — one is created automatically on first use.</li>"}
        </ul>
        <textarea data-tl-ai-new-prompt-text rows="4" placeholder="Write a new prompt version for this workflow…" style="width:100%;"></textarea>
        <button type="button" class="primary-button" data-tl-ai-save-prompt>Save as new version</button>
        ${state.aiError ? `<p class="tl-ai-warning">⚠ ${escapeHtml(state.aiError)}</p>` : ""}
      </section>
    `;
  }

  function testingFeedbackThreadListHtml() {
    return `
      <section class="tl-section" data-tl-testing-feedback>
        <h3>Testing Feedback — inbox</h3>
        <p class="muted-copy">Every tester's feedback thread, across every fake organization. Testers only ever see their own thread — never this list, never another tester's thread, never a private note.</p>
        <div class="tl-actions-row">
          <select data-tf-admin-filter-status>
            <option value="">All statuses</option>
            ${Object.entries(TF_STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${state.tfFilter.status === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
          </select>
          <select data-tf-admin-filter-category>
            <option value="">All categories</option>
            ${Object.entries(TF_CATEGORY_LABELS).map(([key, label]) => `<option value="${key}" ${state.tfFilter.category === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
          </select>
          <label class="tl-check"><input type="checkbox" data-tf-admin-filter-unread ${state.tfFilter.unreadOnly ? "checked" : ""}/> Unread only</label>
          <label class="tl-check"><input type="checkbox" data-tf-admin-filter-retest ${state.tfFilter.retestRequested ? "checked" : ""}/> Retest requested</label>
          <button type="button" class="ghost-button" data-tf-admin-apply-filters>Apply filters</button>
        </div>
        ${state.tfError ? `<p class="tl-ai-warning">⚠ ${escapeHtml(state.tfError)}</p>` : ""}
        <ul class="fh-card-list">
          ${(state.tfThreads || []).map((thread) => `
            <li class="fh-card static" data-tf-admin-thread="${escapeHtml(thread.id)}">
              <strong>${escapeHtml(thread.subject)}</strong>
              <span class="dc-badge">${escapeHtml(TF_CATEGORY_LABELS[thread.category] || thread.category)}</span>
              <span class="dc-badge">${escapeHtml(TF_STATUS_LABELS[thread.status] || thread.status)}</span>
              ${thread.retestRequested ? `<span class="dc-badge">Retest requested</span>` : ""}
              ${thread.adminUnread ? `<span class="dc-badge">Unread</span>` : ""}
              <p class="muted-copy">${escapeHtml(thread.testerEmail)} · org ${escapeHtml(thread.organizationId)} · ${escapeHtml(thread.context?.role || "")} · ${escapeHtml(thread.context?.device || "")} · ${escapeHtml(thread.context?.page || "")}</p>
              <div class="tl-actions-row">
                <button type="button" class="ghost-button" data-tf-admin-open="${escapeHtml(thread.id)}">Open thread</button>
              </div>
            </li>
          `).join("") || "<li class=\"muted-copy\">No feedback threads yet.</li>"}
        </ul>
      </section>
    `;
  }

  function testingFeedbackThreadDetailHtml() {
    const thread = state.tfActiveThread;
    if (!thread) return `<p class="muted-copy">Loading…</p>`;
    return `
      <section class="tl-section" data-tl-testing-feedback-detail>
        <button type="button" class="ghost-button" data-tf-admin-back>← Back to inbox</button>
        <h3>${escapeHtml(thread.subject)}</h3>
        <p class="muted-copy">
          Tester: ${escapeHtml(thread.testerEmail)} (${escapeHtml(thread.testerRole || "role unknown")}) ·
          Org: ${escapeHtml(thread.organizationId)} ·
          Page: ${escapeHtml(thread.context?.page || "—")} ·
          Device: ${escapeHtml(thread.context?.device || "—")} ·
          Filed: ${escapeHtml(thread.createdAt || "—")} ·
          Deployed commit: <code>${escapeHtml(thread.context?.deployedCommit || "unknown")}</code>
          ${thread.context?.online === false ? " · Offline when filed" : ""}
        </p>
        ${(thread.context?.recentFailedRequests?.length || thread.context?.recentConsoleErrors?.length) ? `
          <details class="tl-feedback-diagnostics">
            <summary>Sanitized diagnostics (no names, messages, tokens, or form contents)</summary>
            ${thread.context?.recentFailedRequests?.length ? `
              <p><strong>Recent failed requests</strong></p>
              <ul>${thread.context.recentFailedRequests.map((item) => `<li><code>${escapeHtml(item.name || "")}</code> → ${escapeHtml(String(item.status ?? ""))}</li>`).join("")}</ul>
            ` : ""}
            ${thread.context?.recentConsoleErrors?.length ? `
              <p><strong>Recent console error types</strong></p>
              <ul>${thread.context.recentConsoleErrors.map((item) => `<li>${escapeHtml(item.type || "error")}: ${escapeHtml(item.message || "")}</li>`).join("")}</ul>
            ` : ""}
          </details>
        ` : ""}
        <div class="tl-actions-row">
          <label>Status
            <select data-tf-admin-status>
              ${Object.entries(TF_STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${thread.status === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
            </select>
          </label>
          <label class="tl-check"><input type="checkbox" data-tf-admin-retest ${thread.retestRequested ? "checked" : ""}/> Request a retest</label>
        </div>
        <h4>Conversation (the tester sees everything in this section)</h4>
        <div class="tl-status-row">
          ${(state.tfMessages || []).map((message) => `
            <div class="fh-card static">
              <strong>${message.senderType === "admin" ? "You (admin)" : escapeHtml(thread.testerEmail)}</strong>
              <p>${escapeHtml(message.body)}</p>
              ${message.screenshotDataUrl ? `<img src="${escapeHtml(message.screenshotDataUrl)}" alt="Tester-attached screenshot" style="max-width:220px;border-radius:8px;display:block;margin-top:6px;" />` : ""}
              <span class="muted-copy">${escapeHtml(message.createdAt || "")}</span>
            </div>
          `).join("") || "<p class=\"muted-copy\">No messages yet.</p>"}
        </div>
        <textarea data-tf-admin-reply-text rows="3" placeholder="Reply to the tester…" style="width:100%;"></textarea>
        <button type="button" class="primary-button" data-tf-admin-send-reply>Send reply (tester will see this)</button>

        <h4>Private notes — the tester NEVER sees this section</h4>
        <div class="tl-status-row">
          ${(state.tfNotes || []).map((note) => `
            <div class="fh-card static">
              <strong>Private note</strong>
              <p>${escapeHtml(note.body)}</p>
              <span class="muted-copy">${escapeHtml(note.createdAt || "")}</span>
            </div>
          `).join("") || "<p class=\"muted-copy\">No private notes yet.</p>"}
        </div>
        <textarea data-tf-admin-note-text rows="2" placeholder="Private note (never shown to the tester)…" style="width:100%;"></textarea>
        <button type="button" class="ghost-button" data-tf-admin-add-note>Save private note</button>
        ${state.tfError ? `<p class="tl-ai-warning">⚠ ${escapeHtml(state.tfError)}</p>` : ""}
      </section>
    `;
  }

  function testingFeedbackInboxHtml() {
    return state.tfActiveThreadId ? testingFeedbackThreadDetailHtml() : testingFeedbackThreadListHtml();
  }

  function accountsHtml() {
    return `
      <section class="tl-section" data-tl-accounts>
        <h3>Fake tester organizations</h3>
        <p class="muted-copy">Create a brand-new fake tester organization (or reset an existing one), then generate separate logins for each role. Nothing here ever touches a real organization or a real password.</p>
        <div class="tl-actions-row" data-tl-create-org-row>
          <label>Organization type
            <select data-tl-org-type>
              <option value="home_daycare">Solo Home Daycare</option>
              <option value="small_center">Multi-Classroom Center</option>
            </select>
          </label>
          <label>Label (optional)
            <input type="text" data-tl-org-label placeholder="e.g. acme-testers" maxlength="40" />
          </label>
          <button type="button" class="primary-button" data-tl-create-org>Create / reset fake organization</button>
        </div>
        ${state.createdOrgId ? `<p class="tl-onetime" data-tl-created-org><strong>Ready:</strong> organization <code>${escapeHtml(state.createdOrgId)}</code>. Use "Generate core role logins" below for this org, or pick individual accounts.</p>` : ""}

        <h3>Actual fake login accounts</h3>
        <p class="muted-copy">Real authentication flow. Passwords are never stored in fixtures, and a previously-issued password can never be viewed again — only a fresh reissue shows a new one. Copy immediately.</p>
        ${state.oneTimePassword ? `
          <div class="tl-onetime" data-tl-onetime>
            <p><strong>Temporary password for ${escapeHtml(state.issuedEmail)}</strong> (shown once)</p>
            <code data-tl-onetime-value>${escapeHtml(state.oneTimePassword)}</code>
            <button type="button" class="ghost-button" data-tl-copy-password="${escapeHtml(state.oneTimePassword)}">Copy</button>
            <button type="button" class="ghost-button" data-tl-clear-password>Clear from screen</button>
          </div>
        ` : ""}
        ${(state.orgLogins || []).length ? `
          <div class="tl-onetime" data-tl-org-logins>
            <p><strong>Fresh logins for ${escapeHtml(state.orgLoginsOrgId || "this organization")}</strong> (shown once each — copy now)</p>
            <table class="tl-onboard-table">
              <thead><tr><th>Role</th><th>Email</th><th>Temporary password</th><th></th></tr></thead>
              <tbody>
                ${state.orgLogins.map((login) => `
                  <tr>
                    <td>${escapeHtml(login.role || login.kind)}</td>
                    <td>${escapeHtml(login.email)}</td>
                    <td><code>${escapeHtml(login.temporaryPassword)}</code></td>
                    <td><button type="button" class="ghost-button" data-tl-copy-password="${escapeHtml(login.temporaryPassword)}">Copy</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
            <button type="button" class="ghost-button" data-tl-clear-org-logins>Clear from screen</button>
          </div>
        ` : ""}
        <ul class="fh-card-list">
          ${(state.dashboard?.accounts || []).map((row) => `
            <li class="fh-card static" data-tl-account="${escapeHtml(row.id)}">
              <strong>${escapeHtml(row.displayName || row.kind)}</strong>
              <span class="dc-badge">${escapeHtml(row.kind)}</span>
              <span class="dc-badge">${row.active === false ? "Suspended/ended" : "Active"}</span>
              <p class="muted-copy">${escapeHtml(row.email)} · org <code>${escapeHtml(row.organizationId)}</code>${row.role ? ` · role ${escapeHtml(row.role)}` : ""}</p>
              <div class="tl-actions-row">
                <button type="button" class="ghost-button" data-tl-select-account="${escapeHtml(row.id)}">Select</button>
                <button type="button" class="ghost-button" data-tl-issue-password="${escapeHtml(row.id)}">${row.hasPassword ? "Reissue password" : "Issue password"}</button>
                <button type="button" class="ghost-button" data-tl-revoke="${escapeHtml(row.id)}">Revoke session</button>
                ${row.active === false
                  ? `<button type="button" class="ghost-button" data-tl-reactivate="${escapeHtml(row.id)}">Reactivate</button>`
                  : `<button type="button" class="ghost-button" data-tl-suspend="${escapeHtml(row.id)}">Suspend</button>`}
                <button type="button" class="ghost-button" data-tl-end-account="${escapeHtml(row.id)}">End account</button>
              </div>
            </li>
          `).join("") || "<li class=\"muted-copy\">Load a scenario first.</li>"}
        </ul>
        ${(state.dashboard?.accounts || []).length ? `
          <button type="button" class="primary-button" data-tl-issue-org-logins="${escapeHtml(state.dashboard.accounts[0]?.organizationId || "")}">Generate fresh logins for every role in this organization</button>
        ` : ""}
      </section>
      ${homeDaycarePilotWizardHtml()}
      ${sandboxManagerHtml()}
    `;
  }

  /**
   * "Add External Tester" wizard — Home Daycare Pilot preset. One admin
   * action creates the isolated fake org, the sandbox account (approved for
   * ONLY Solo Home Daycare Provider + Parent/Guardian), a starting set of
   * connected fake children/guardians, and issues the one-time password —
   * everything server/external-tester-sandbox-api.js#handleCreatePilot does
   * in one call. The password/welcome message are shown exactly once.
   */
  function homeDaycarePilotWizardHtml() {
    const result = state.pilotWizardResult;
    return `
      <section class="tl-section" data-tl-pilot-wizard>
        <h3>Add External Tester — Home Daycare Pilot</h3>
        <p class="muted-copy">
          Creates one connected, isolated fake home-daycare organization for this tester —
          she can work as Solo Home Daycare Provider (add fake children/guardians), then switch
          to Parent/Guardian and see the SAME linked information. Fake data only.
        </p>
        ${!result ? `
          <form data-tl-pilot-create class="mini-form">
            <label>Tester name<input name="testerName" required placeholder="e.g. Jordan Rivera" /></label>
            <label>Tester email<input name="email" required type="email" placeholder="jordan.rivera@example.invalid" /></label>
            <label>Starting fake children<input name="childCount" type="number" min="1" max="6" value="2" /></label>
            <button class="primary-button" type="submit">Create Home Daycare Pilot</button>
          </form>
        ` : `
          <div class="tl-notice-card">
            <p><strong>Created — copy this now, the password will not be shown again.</strong></p>
            <p>Login email: <code>${escapeHtml(result.account.email)}</code></p>
            <p>Temporary password: <code data-tl-pilot-password>${escapeHtml(result.temporaryPassword)}</code>
              <button type="button" class="ghost-button" data-tl-copy-password="${escapeHtml(result.temporaryPassword)}">Copy password</button>
            </p>
            <label>Welcome message
              <textarea readonly rows="8" data-tl-pilot-welcome>${escapeHtml(result.welcomeMessage)}</textarea>
            </label>
            <button type="button" class="ghost-button" data-tl-copy-welcome>Copy welcome message</button>
            <p class="muted-copy">Starting fixtures: ${result.children.length} fake child(ren), ${result.guardians.length} fake guardian(s), already linked.</p>
            <button type="button" class="ghost-button" data-tl-pilot-new">Add another External Tester</button>
          </div>
        `}
        ${state.pilotWizardError ? `<p class="tf-error">${escapeHtml(state.pilotWizardError)}</p>` : ""}
      </section>
    `;
  }

  function sandboxRoleLabel(key) {
    return (state.sandboxRoleCatalog || []).find((entry) => entry.key === key)?.label || key;
  }

  function sandboxRoleCheckboxesHtml(namePrefix, checkedKeys = []) {
    const checked = new Set(checkedKeys);
    const catalog = state.sandboxRoleCatalog || [];
    return catalog.map(({ key, label }) => `
      <label class="tl-check">
        <input type="checkbox" data-sandbox-role-checkbox="${namePrefix}" value="${escapeHtml(key)}" ${checked.has(key) ? "checked" : ""} />
        ${escapeHtml(label || key)}
      </label>
    `).join("") || "<p class=\"muted-copy\">Loading role catalog…</p>";
  }

  function sandboxManagerHtml() {
    return `
      <section class="tl-section" data-tl-sandbox-manager>
        <h3>External Tester Sandbox — one login, admin-chosen roles</h3>
        <p class="muted-copy">
          One external tester login that switches ONLY among the roles you approve below —
          never Platform Admin, never Testing Lab Admin, never AI Outcomes Admin, never another
          organization. Enforced on the server, not just hidden in the browser.
        </p>
        <div class="tl-actions-row" data-tl-create-sandbox-row>
          <label>Organization id
            <input type="text" data-sandbox-org-id placeholder="e.g. ${escapeHtml(state.createdOrgId || state.dashboard?.accounts?.[0]?.organizationId || "org_tester_...")}" value="${escapeHtml(state.createdOrgId || "")}" />
          </label>
          <label>Tester email
            <input type="text" data-sandbox-email placeholder="e.g. sandbox.tester1@example.invalid" />
          </label>
          <label>Display name
            <input type="text" data-sandbox-display-name placeholder="External Tester" />
          </label>
        </div>
        <p class="muted-copy">Allowed roles for this tester:</p>
        <div class="tl-actions-row" data-sandbox-create-roles>
          ${sandboxRoleCheckboxesHtml("create")}
        </div>
        <button type="button" class="primary-button" data-tl-create-sandbox>Create External Tester Sandbox</button>
        ${state.sandboxNotice ? `<p class="muted-copy" role="status">${escapeHtml(state.sandboxNotice)}</p>` : ""}

        <h4>Existing External Tester Sandbox accounts</h4>
        <ul class="fh-card-list">
          ${(state.sandboxAccounts || []).map((row) => `
            <li class="fh-card static" data-tl-sandbox-account="${escapeHtml(row.id)}">
              <strong>${escapeHtml(row.email)}</strong>
              <span class="dc-badge">${row.active === false ? "Suspended/ended" : "Active"}</span>
              <p class="muted-copy">Org <code>${escapeHtml(row.organizationId)}</code> · currently viewing as <strong>${escapeHtml(row.activeRoleLabel || "—")}</strong></p>
              <p class="muted-copy">Approved roles: ${(row.allowedRoleKeys || []).length ? (row.allowedRoleKeys.map((k) => escapeHtml(sandboxRoleLabel(k))).join(", ")) : "(none — login blocked)"}</p>
              <div class="tl-actions-row" data-sandbox-edit-roles="${escapeHtml(row.id)}">
                ${sandboxRoleCheckboxesHtml(`edit-${row.id}`, row.allowedRoleKeys || [])}
              </div>
              <div class="tl-actions-row">
                <button type="button" class="ghost-button" data-tl-save-sandbox-roles="${escapeHtml(row.id)}">Save allowed roles</button>
                <button type="button" class="ghost-button" data-tl-issue-password="${escapeHtml(row.id)}">${row.hasPassword ? "Reissue password" : "Issue password"}</button>
                ${row.active === false
                  ? `<button type="button" class="ghost-button" data-tl-reactivate="${escapeHtml(row.id)}">Reactivate</button>`
                  : `<button type="button" class="ghost-button" data-tl-suspend="${escapeHtml(row.id)}">Suspend</button>`}
                <button type="button" class="ghost-button" data-tl-end-account="${escapeHtml(row.id)}">End account</button>
              </div>
            </li>
          `).join("") || "<li class=\"muted-copy\">No External Tester Sandbox accounts yet.</li>"}
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
    if (state.panel === "ai") return aiOutcomesHtml();
    if (state.panel === "feedback") return testingFeedbackInboxHtml();
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
          ${previewActive ? `<button type="button" class="primary-button tl-touch" data-tl-exit-preview-mobile>Exit Role Preview</button>` : ""}
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
        if (state.panel === "ai") {
          await loadAiOutcomesData();
        }
        if (state.panel === "feedback") {
          state.tfActiveThreadId = "";
          state.tfActiveThread = null;
          await loadTestingFeedbackAdminThreads();
        }
        if (state.panel === "accounts") {
          await loadSandboxAccounts();
        }
        render(mount);
      });
    });

    function tfFilterQuery() {
      const params = new URLSearchParams();
      if (state.tfFilter.status) params.set("status", state.tfFilter.status);
      if (state.tfFilter.category) params.set("category", state.tfFilter.category);
      if (state.tfFilter.unreadOnly) params.set("unreadOnly", "true");
      if (state.tfFilter.retestRequested) params.set("retestRequested", "true");
      const query = params.toString();
      return query ? `?${query}` : "";
    }

    async function loadTestingFeedbackAdminThreads() {
      try {
        const data = await api("GET", `/api/testing-feedback/admin/threads${tfFilterQuery()}`);
        state.tfThreads = data.threads || [];
        state.tfUnreadCount = data.unreadCount || 0;
        state.tfError = "";
      } catch (error) {
        state.tfError = error.message;
      }
    }

    async function loadSandboxAccounts() {
      try {
        const data = await api("GET", "/api/external-tester/list");
        state.sandboxAccounts = data.accounts || [];
        state.sandboxRoleCatalog = data.roleCatalog || [];
      } catch (error) {
        state.error = error.message;
      }
    }

    async function openTestingFeedbackAdminThread(threadId) {
      try {
        const data = await api("GET", `/api/testing-feedback/admin/threads/${threadId}`);
        state.tfActiveThreadId = threadId;
        state.tfActiveThread = data.thread;
        state.tfMessages = data.messages || [];
        state.tfNotes = data.notes || [];
        state.tfError = "";
        if (data.thread.adminUnread) await api("POST", `/api/testing-feedback/admin/threads/${threadId}/read`, {});
      } catch (error) {
        state.tfError = error.message;
      }
      render(mount);
    }

    mount.querySelectorAll("[data-tf-admin-open]").forEach((btn) => {
      btn.addEventListener("click", () => openTestingFeedbackAdminThread(btn.getAttribute("data-tf-admin-open")));
    });
    mount.querySelector("[data-tf-admin-back]")?.addEventListener("click", async () => {
      state.tfActiveThreadId = "";
      state.tfActiveThread = null;
      await loadTestingFeedbackAdminThreads();
      render(mount);
    });
    mount.querySelector("[data-tf-admin-apply-filters]")?.addEventListener("click", async () => {
      state.tfFilter.status = mount.querySelector("[data-tf-admin-filter-status]")?.value || "";
      state.tfFilter.category = mount.querySelector("[data-tf-admin-filter-category]")?.value || "";
      state.tfFilter.unreadOnly = Boolean(mount.querySelector("[data-tf-admin-filter-unread]")?.checked);
      state.tfFilter.retestRequested = Boolean(mount.querySelector("[data-tf-admin-filter-retest]")?.checked);
      await loadTestingFeedbackAdminThreads();
      render(mount);
    });
    mount.querySelector("[data-tf-admin-send-reply]")?.addEventListener("click", async () => {
      const text = String(mount.querySelector("[data-tf-admin-reply-text]")?.value || "").trim();
      if (!text || !state.tfActiveThreadId) return;
      try {
        await api("POST", `/api/testing-feedback/admin/threads/${state.tfActiveThreadId}/reply`, { body: text });
        await openTestingFeedbackAdminThread(state.tfActiveThreadId);
      } catch (error) {
        state.tfError = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tf-admin-add-note]")?.addEventListener("click", async () => {
      const text = String(mount.querySelector("[data-tf-admin-note-text]")?.value || "").trim();
      if (!text || !state.tfActiveThreadId) return;
      try {
        await api("POST", `/api/testing-feedback/admin/threads/${state.tfActiveThreadId}/notes`, { body: text });
        await openTestingFeedbackAdminThread(state.tfActiveThreadId);
      } catch (error) {
        state.tfError = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tf-admin-status]")?.addEventListener("change", async (event) => {
      if (!state.tfActiveThreadId) return;
      try {
        await api("POST", `/api/testing-feedback/admin/threads/${state.tfActiveThreadId}/status`, { status: event.target.value });
        await openTestingFeedbackAdminThread(state.tfActiveThreadId);
      } catch (error) {
        state.tfError = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tf-admin-retest]")?.addEventListener("change", async (event) => {
      if (!state.tfActiveThreadId) return;
      try {
        await api("POST", `/api/testing-feedback/admin/threads/${state.tfActiveThreadId}/retest`, { retestRequested: event.target.checked });
        await openTestingFeedbackAdminThread(state.tfActiveThreadId);
      } catch (error) {
        state.tfError = error.message;
        render(mount);
      }
    });

    async function loadAiOutcomesData() {
      try {
        state.aiStatus = await api("GET", "/api/ai-testing/status");
        const scenarioData = await api("GET", "/api/ai-testing/scenarios");
        state.aiScenarios = scenarioData.scenarios || [];
        const promptData = await api("GET", `/api/ai-testing/prompts/${state.aiPromptWorkflow}/versions`);
        state.aiPromptVersions = promptData.versions || [];
        state.aiUsage = await api("GET", "/api/ai-testing/admin/usage");
        state.aiError = "";
      } catch (error) {
        state.aiError = error.message;
      }
    }
    mount.querySelectorAll("[data-tl-ai-run]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const scenarioId = btn.getAttribute("data-tl-ai-run");
        try {
          const result = await api("POST", `/api/ai-testing/scenarios/${scenarioId}/run`, {});
          state.aiRunsByScenario[scenarioId] = result.run;
          state.aiError = result.aiSucceeded ? "" : `AI unavailable for this run: ${result.aiError || "unknown reason"} (heuristic result shown; nothing was lost).`;
        } catch (error) {
          state.aiError = error.message;
        }
        render(mount);
      });
    });
    mount.querySelectorAll("[data-tl-ai-rate]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const runId = btn.getAttribute("data-tl-ai-rate");
        const rating = btn.getAttribute("data-tl-ai-rating");
        try {
          const result = await api("POST", `/api/ai-testing/runs/${runId}/rate`, { rating });
          Object.keys(state.aiRunsByScenario).forEach((scenarioId) => {
            if (state.aiRunsByScenario[scenarioId]?.id === runId) state.aiRunsByScenario[scenarioId] = result.run;
          });
        } catch (error) {
          state.aiError = error.message;
        }
        render(mount);
      });
    });
    mount.querySelector("[data-tl-ai-prompt-workflow]")?.addEventListener("change", async (event) => {
      state.aiPromptWorkflow = event.target.value;
      try {
        const promptData = await api("GET", `/api/ai-testing/prompts/${state.aiPromptWorkflow}/versions`);
        state.aiPromptVersions = promptData.versions || [];
      } catch (error) {
        state.aiError = error.message;
      }
      render(mount);
    });
    mount.querySelector("[data-tl-ai-save-prompt]")?.addEventListener("click", async () => {
      const textarea = mount.querySelector("[data-tl-ai-new-prompt-text]");
      const text = textarea?.value || "";
      if (!text.trim()) return;
      try {
        await api("POST", `/api/ai-testing/prompts/${state.aiPromptWorkflow}/versions`, { text });
        const promptData = await api("GET", `/api/ai-testing/prompts/${state.aiPromptWorkflow}/versions`);
        state.aiPromptVersions = promptData.versions || [];
        state.notice = "New prompt version saved and made active.";
      } catch (error) {
        state.aiError = error.message;
      }
      render(mount);
    });
    mount.querySelectorAll("[data-tl-ai-rollback]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const versionId = btn.getAttribute("data-tl-ai-rollback");
        try {
          await api("POST", `/api/ai-testing/prompts/${state.aiPromptWorkflow}/rollback`, { versionId });
          const promptData = await api("GET", `/api/ai-testing/prompts/${state.aiPromptWorkflow}/versions`);
          state.aiPromptVersions = promptData.versions || [];
          state.notice = "Rolled back to the selected prompt version.";
        } catch (error) {
          state.aiError = error.message;
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
    mount.querySelector("[data-tl-return-admin]")?.addEventListener("click", () => {
      // The local escape (clearing the preview flag) must NEVER depend on this
      // network call succeeding — a slow/failing request here was previously
      // able to leave an admin stuck unable to return, since state.preview was
      // only cleared inside the try block, after the awaited call.
      global.sessionStorage?.removeItem("llhRolePreviewMembershipId");
      state.preview = null;
      state.notice = "Returned to administrator account.";
      notifyGlobalPreviewChrome();
      render(mount);
      api("POST", `${BASE}/role-preview/exit`, {}).catch(() => {
        // Local escape already happened above — server confirmation is best-effort only.
      });
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
    mount.querySelectorAll("[data-tl-suspend]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api("POST", `${BASE}/accounts/suspend`, { accountId: btn.getAttribute("data-tl-suspend") });
          state.notice = "Account suspended — login blocked until reactivated. No password was changed or shown.";
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelectorAll("[data-tl-reactivate]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api("POST", `${BASE}/accounts/reactivate`, { accountId: btn.getAttribute("data-tl-reactivate") });
          state.notice = "Account reactivated.";
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelectorAll("[data-tl-end-account]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api("POST", `${BASE}/accounts/end`, { accountId: btn.getAttribute("data-tl-end-account") });
          state.notice = "Account ended — every stored credential was cleared. Issue a brand-new password to bring it back.";
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelector("[data-tl-create-org]")?.addEventListener("click", async () => {
      try {
        const scenario = mount.querySelector("[data-tl-org-type]")?.value || "home_daycare";
        const label = String(mount.querySelector("[data-tl-org-label]")?.value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
        const organizationId = `org_tester_${label || scenario}_${Date.now().toString(36)}`;
        const data = await api("POST", `${BASE}/seed`, { scenario, organizationId, reset: true });
        state.createdOrgId = data.organizationId || organizationId;
        state.notice = `Fake organization ready: ${state.createdOrgId}`;
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelectorAll("[data-tl-issue-org-logins]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const organizationId = btn.getAttribute("data-tl-issue-org-logins") || state.createdOrgId;
          if (!organizationId) { state.error = "No organization selected yet — create or load one first."; render(mount); return; }
          const data = await api("POST", `${BASE}/accounts/issue-passwords-for-org`, { organizationId });
          state.orgLogins = data.logins || [];
          state.orgLoginsOrgId = organizationId;
          state.notice = `${state.orgLogins.length} fresh password(s) issued — copy them now, they will not be shown again.`;
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelector("[data-tl-clear-org-logins]")?.addEventListener("click", () => {
      state.orgLogins = [];
      state.orgLoginsOrgId = "";
      render(mount);
    });
    mount.querySelectorAll("[data-tl-copy-password]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const value = btn.getAttribute("data-tl-copy-password") || "";
        try {
          await global.navigator?.clipboard?.writeText?.(value);
          state.notice = "Copied to clipboard.";
        } catch {
          state.notice = "Could not access the clipboard — copy the password manually before leaving this screen.";
        }
        render(mount);
      });
    });
    mount.querySelector("[data-tl-pilot-create]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      try {
        const result = await api("POST", "/api/external-tester/create-pilot", {
          testerName: data.get("testerName"),
          email: String(data.get("email") || "").trim().toLowerCase(),
          childCount: Number(data.get("childCount")) || 2,
        });
        state.pilotWizardResult = result;
        state.pilotWizardError = "";
        await loadSandboxAccounts();
        render(mount);
      } catch (error) {
        state.pilotWizardError = error.message;
        render(mount);
      }
    });
    mount.querySelector("[data-tl-pilot-new]")?.addEventListener("click", () => {
      state.pilotWizardResult = null;
      render(mount);
    });
    mount.querySelector("[data-tl-copy-welcome]")?.addEventListener("click", async () => {
      try {
        await global.navigator?.clipboard?.writeText?.(state.pilotWizardResult?.welcomeMessage || "");
        state.notice = "Welcome message copied to clipboard.";
      } catch {
        state.notice = "Could not access the clipboard — copy the welcome message manually before leaving this screen.";
      }
      render(mount);
    });
    mount.querySelector("[data-tl-create-sandbox]")?.addEventListener("click", async () => {
      try {
        const organizationId = String(mount.querySelector("[data-sandbox-org-id]")?.value || "").trim();
        const email = String(mount.querySelector("[data-sandbox-email]")?.value || "").trim().toLowerCase();
        const displayName = String(mount.querySelector("[data-sandbox-display-name]")?.value || "").trim();
        const allowedRoleKeys = Array.from(mount.querySelectorAll('[data-sandbox-role-checkbox="create"]:checked')).map((el) => el.value);
        if (!organizationId || !email) {
          state.error = "An organization id and tester email are both required.";
          render(mount);
          return;
        }
        const data = await api("POST", "/api/external-tester/create", { organizationId, email, displayName, allowedRoleKeys });
        state.sandboxNotice = `Created ${data.account.email} — currently viewing as ${data.account.activeRoleLabel || "(no role approved yet)"}. Use "Issue password" below to generate its one-time login.`;
        await loadSandboxAccounts();
        render(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelectorAll("[data-tl-save-sandbox-roles]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const accountId = btn.getAttribute("data-tl-save-sandbox-roles");
          const allowedRoleKeys = Array.from(mount.querySelectorAll(`[data-sandbox-role-checkbox="edit-${accountId}"]:checked`)).map((el) => el.value);
          const data = await api("POST", "/api/external-tester/set-allowed-roles", { accountId, allowedRoleKeys });
          state.sandboxNotice = `Updated allowed roles for ${data.account.email}.`;
          await loadSandboxAccounts();
          render(mount);
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
          notifyGlobalPreviewChrome();
          render(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    // "Exit Role Preview" exists in two places (the desktop Quick Role Preview
    // panel and the phone-only mobile summary bar) with DISTINCT attributes
    // (data-tl-exit-preview / data-tl-exit-preview-mobile) — never the same
    // attribute value on two different elements — so automated tests and
    // assistive tech never hit an ambiguous multi-match. Both call this same
    // handler. The local escape (clearing the sessionStorage flag) always
    // happens FIRST and unconditionally, so it can never be blocked by a
    // failing/slow network call to the server-side exit endpoint.
    async function exitRolePreview() {
      const previewId = state.preview?.id;
      global.sessionStorage?.removeItem("llhRolePreviewMembershipId");
      state.preview = null;
      state.notice = "Exited role preview.";
      notifyGlobalPreviewChrome();
      render(mount);
      try {
        await api("POST", `${BASE}/role-preview/exit`, { previewId });
      } catch {
        // Local escape already happened above — server confirmation is best-effort only.
      }
    }
    mount.querySelectorAll("[data-tl-exit-preview], [data-tl-exit-preview-mobile]").forEach((btn) => {
      btn.addEventListener("click", () => { exitRolePreview(); });
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

  async function renderTestingLabPage(mountEl, options = {}) {
    const mount = mountEl || document.querySelector("#view-testing-lab");
    if (!mount) return;
    // Lets a deep link (e.g. the Owner Testing Home's "Add a Home Daycare
    // Tester" card) open the wizard directly instead of always landing on
    // the generic home panel first.
    state.panel = options.initialPanel || "home";
    await refresh(mount);
    // The dashboard/release-readiness fetch above is common to every
    // panel — each panel's OWN data (accounts, feedback threads, AI
    // outcomes, ...) is normally loaded by the [data-tl-panel] click
    // handler, which a deep link bypasses entirely. Mirror that same
    // per-panel load here so "Add a Home Daycare Tester"/"View Testing
    // Feedback"/"Test as a Role" show real, populated data immediately
    // instead of an empty panel.
    if (state.panel === "feedback") {
      state.tfActiveThreadId = "";
      state.tfActiveThread = null;
      try {
        const data = await api("GET", "/api/testing-feedback/admin/threads");
        state.tfThreads = data.threads || [];
        state.tfUnreadCount = data.unreadCount || 0;
        state.tfError = "";
      } catch (error) {
        state.tfError = error.message;
      }
    } else if (state.panel === "accounts") {
      try {
        const data = await api("GET", "/api/external-tester/list");
        state.sandboxAccounts = data.accounts || [];
        state.sandboxRoleCatalog = data.roleCatalog || [];
      } catch (error) {
        state.error = error.message;
      }
    }
    render(mount);
  }

  global.renderTestingLabPage = renderTestingLabPage;
})(typeof window !== "undefined" ? window : globalThis);
