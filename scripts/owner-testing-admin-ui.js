/**
 * Owner Admin — Testing Testers / Programs / Flags / Audit UI (Phase 2).
 * TESTING ONLY. Loaded after app.js + admin-workspace.js.
 */
(function ownerTestingAdminUi() {
  const FEATURE_LABELS = {
    familyHub: "Family Hub",
    forms: "Forms",
    billing: "Billing Testing",
    director: "Director features",
    teacherWorkflow: "Teacher workflow",
    experimentalDailyWorkflow: "Experimental daily workflow",
    multiRole: "Multi-role Switch View",
    aiFeatures: "AI features",
    fullPlatform: "Full platform",
  };

  const GLOBAL_FLAG_LABELS = {
    familyHub: "Family Hub",
    forms: "Forms",
    billing: "Billing (test only)",
    aiFeatures: "AI features",
    experimentalDailyWorkflow: "Experimental daily workflow",
    newNavigation: "New navigation",
    ownerTestingAdmin: "Owner Testing Admin",
  };

  const state = {
    tab: "testers",
    dashboard: null,
    testers: [],
    programs: [],
    flags: null,
    audit: [],
    selectedEmail: "",
    detail: null,
    loading: false,
    error: "",
    message: "",
    query: "",
    statusFilter: "",
  };

  function esc(value) {
    return typeof escapeHtml === "function" ? escapeHtml(String(value ?? "")) : String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function adminToken() {
    return typeof adminSession === "function" ? (adminSession()?.token || "") : "";
  }

  function isTestingHost() {
    return Boolean(window.LLH_CONFIG?.homeDaycareHubTesting)
      || document.body?.classList?.contains("hdh-testing");
  }

  async function api(path, options = {}) {
    const token = adminToken();
    if (!token) throw new Error("Unlock Admin first.");
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };
    const res = await fetch(path, {
      ...options,
      headers,
      cache: "no-store",
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function ensureBanner() {
    let banner = document.querySelector("[data-ota-testing-banner]");
    if (!isTestingHost()) {
      banner?.remove();
      document.body.classList.remove("llh-testing-environment");
      return;
    }
    document.body.classList.add("llh-testing-environment");
    if (!banner) {
      document.body.insertAdjacentHTML("afterbegin", `
        <div class="ota-testing-banner" data-ota-testing-banner role="status">
          <strong>TESTING ENVIRONMENT</strong>
          <span>Fake / tester data only · No production customers · No live billing from this console</span>
        </div>
      `);
    }
  }

  function ensureViewAsBanner() {
    const existing = document.querySelector("[data-ota-view-as-banner]");
    const mode = typeof adminPreviewMode === "function" ? adminPreviewMode() : "Admin";
    const impersonating = typeof isAdminImpersonating === "function" && isAdminImpersonating();
    if (!impersonating && (!mode || mode === "Admin")) {
      existing?.remove();
      return;
    }
    const label = impersonating
      ? `OWNER ADMIN — VIEWING AS ${adminImpersonationState?.account?.name || adminImpersonationState?.email || "TESTER"}`
      : `OWNER ADMIN — VIEWING AS ${mode.toUpperCase()}`;
    if (!existing) {
      document.body.insertAdjacentHTML("afterbegin", `
        <div class="ota-view-as-banner" data-ota-view-as-banner role="status">
          <strong data-ota-view-as-label>${esc(label)}</strong>
          <button type="button" class="primary-button" data-ota-exit-view-as>Exit tester view</button>
        </div>
      `);
    } else {
      const strong = existing.querySelector("[data-ota-view-as-label]");
      if (strong) strong.textContent = label;
    }
  }

  function statusChip(status) {
    return `<span class="ota-status ota-status-${esc(status)}">${esc(String(status || "").replace(/_/g, " "))}</span>`;
  }

  function featureChecks(selected = {}, namePrefix = "feat") {
    return Object.keys(FEATURE_LABELS).map((key) => `
      <label class="ota-check">
        <input type="checkbox" name="${namePrefix}-${key}" ${selected[key] ? "checked" : ""} />
        ${esc(FEATURE_LABELS[key])}
      </label>
    `).join("");
  }

  function readFeaturesFromForm(form, namePrefix = "feat") {
    const features = {};
    Object.keys(FEATURE_LABELS).forEach((key) => {
      features[key] = Boolean(form.querySelector(`[name="${namePrefix}-${key}"]`)?.checked);
    });
    return features;
  }

  async function loadAll() {
    state.loading = true;
    state.error = "";
    paint();
    try {
      const [dash, testers, programs, flags, audit] = await Promise.all([
        api("/api/admin/testing/dashboard"),
        api(`/api/admin/testing/testers?q=${encodeURIComponent(state.query)}&status=${encodeURIComponent(state.statusFilter)}`),
        api(`/api/admin/testing/programs?q=${encodeURIComponent(state.query)}`),
        api("/api/admin/testing/flags"),
        api("/api/admin/testing/audit"),
      ]);
      state.dashboard = dash.dashboard;
      state.testers = testers.testers || [];
      state.programs = programs.programs || [];
      state.flags = flags;
      state.audit = audit.audit || [];
    } catch (error) {
      state.error = error.message || "Could not load testing admin.";
    } finally {
      state.loading = false;
      paint();
    }
  }

  async function openDetail(email) {
    state.selectedEmail = email;
    state.detail = null;
    paint();
    try {
      const data = await api(`/api/admin/testing/testers/${encodeURIComponent(email)}`);
      state.detail = data;
      paint();
    } catch (error) {
      state.error = error.message;
      paint();
    }
  }

  function dashboardHtml() {
    const d = state.dashboard || {};
    return `
      <section class="ota-panel">
        <div class="ota-env-pill">ENVIRONMENT: TESTING</div>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Owner Admin</p>
            <h3>Testing dashboard</h3>
            <p class="muted-copy">Manage testers and test programs without the database. Production is unaffected.</p>
          </div>
          <button type="button" class="ghost-button" data-ota-refresh>Refresh</button>
        </div>
        <div class="ota-stat-grid">
          <article><em>Total testers</em><strong>${esc(d.totalTesters ?? "—")}</strong></article>
          <article><em>Active</em><strong>${esc(d.activeTesters ?? "—")}</strong></article>
          <article><em>Pending invites</em><strong>${esc(d.pendingInvites ?? "—")}</strong></article>
          <article><em>Home daycare</em><strong>${esc(d.byType?.home_daycare ?? "—")}</strong></article>
          <article><em>Centers</em><strong>${esc(d.byType?.center ?? "—")}</strong></article>
          <article><em>Children</em><strong>${esc(d.children ?? "—")}</strong></article>
          <article><em>Families</em><strong>${esc(d.families ?? "—")}</strong></article>
          <article><em>Forms</em><strong>${esc(d.forms ?? "—")}</strong></article>
        </div>
        <h4>Recent admin activity</h4>
        <ul class="ota-audit-list">
          ${(d.recentAudit || []).map((row) => `
            <li><strong>${esc(row.action)}</strong> · ${esc(row.targetEmail || "—")} · <span>${esc(row.at || "")}</span><br/><span class="muted-copy">${esc(row.detail || "")}</span></li>
          `).join("") || "<li class=\"muted-copy\">No admin testing actions yet.</li>"}
        </ul>
      </section>
    `;
  }

  function addTesterFormHtml() {
    const programOptions = (state.programs || []).map((p) => `
      <option value="${esc(p.id)}">${esc(p.name)} (${esc(p.accountType)})</option>
    `).join("");
    return `
      <section class="ota-panel" data-ota-add-panel>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Testers</p>
            <h3>Add tester</h3>
            <p class="muted-copy">Creates a testing invite (and optional instant login). No production accounts.</p>
          </div>
        </div>
        <form data-ota-add-form class="ota-form">
          <div class="ota-form-grid">
            <label>Name<input name="name" required placeholder="Jordan Rivera" /></label>
            <label>Email<input name="email" type="email" required placeholder="jordan@example.com" /></label>
            <label>Program name<input name="programName" placeholder="Sunshine Home Daycare TEST" /></label>
            <label>Program type
              <select name="programType">
                <option value="home_daycare">Home Daycare</option>
                <option value="center">Center</option>
                <option value="single_provider">Single Provider</option>
              </select>
            </label>
            <label>Role
              <select name="role">
                <option value="owner">Owner</option>
                <option value="director">Director</option>
                <option value="teacher">Teacher</option>
                <option value="assistant">Assistant</option>
              </select>
            </label>
            <label>Program setup
              <select name="programMode">
                <option value="new">Create new test program</option>
                <option value="existing">Add to existing test program</option>
              </select>
            </label>
            <label>Existing program
              <select name="existingProgramId">
                <option value="">—</option>
                ${programOptions}
              </select>
            </label>
            <label>Testing cohort<input name="testingCohort" placeholder="Family Hub beta" /></label>
            <label>Starter child name<input name="childName" placeholder="Demo Child" /></label>
          </div>
          <fieldset>
            <legend>Feature access</legend>
            <div class="ota-check-grid">${featureChecks({ familyHub: true, forms: true, teacherWorkflow: true, fullPlatform: false })}</div>
          </fieldset>
          <label>Notes<textarea name="notes" rows="2" placeholder="What should they test?"></textarea></label>
          <label class="ota-check"><input type="checkbox" name="activateNow" /> Generate test login now (temp password — testing only)</label>
          <label class="ota-check"><input type="checkbox" name="createSampleData" checked /> Create sample child / classrooms</label>
          <div class="account-actions-row">
            <button type="submit" class="primary-button">Add tester</button>
          </div>
          <p class="form-message" data-ota-add-message hidden></p>
        </form>
      </section>
    `;
  }

  function testersListHtml() {
    const rows = state.testers || [];
    return `
      <section class="ota-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Testers</p>
            <h3>All testers</h3>
          </div>
          <div class="account-actions-row">
            <input type="search" data-ota-search placeholder="Search name, email, program…" value="${esc(state.query)}" />
            <select data-ota-status-filter>
              <option value="">All statuses</option>
              ${["invitation_pending", "activated", "active", "inactive", "testing_complete", "disabled", "expired", "revoked"].map((s) => `
                <option value="${s}" ${state.statusFilter === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>
              `).join("")}
            </select>
            <button type="button" class="ghost-button" data-ota-refresh>Refresh</button>
          </div>
        </div>
        <div class="ota-table-wrap">
          <table class="ota-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Program</th><th>Type</th><th>Role</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((t) => `
                <tr>
                  <td><strong>${esc(t.name)}</strong></td>
                  <td>${esc(t.email)}</td>
                  <td>${esc(t.programName || "—")}</td>
                  <td>${esc(t.accountType)}</td>
                  <td>${esc(t.role)}</td>
                  <td>${statusChip(t.status)}</td>
                  <td><button type="button" class="ghost-button" data-ota-open-tester="${esc(t.email)}">Open</button></td>
                </tr>
              `).join("") || `<tr><td colspan="7" class="muted-copy">No testers yet. Use Add Tester above.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function detailHtml() {
    if (!state.selectedEmail) return "";
    const data = state.detail;
    if (!data?.tester) {
      return `<section class="ota-panel"><p class="muted-copy">Loading ${esc(state.selectedEmail)}…</p></section>`;
    }
    const t = data.tester;
    const inviteUrl = t.invite?.acceptUrl || "";
    return `
      <section class="ota-panel" data-ota-detail>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Tester detail</p>
            <h3>${esc(t.name)}</h3>
            <p class="muted-copy">${esc(t.email)} · ${statusChip(t.status)}</p>
          </div>
          <button type="button" class="ghost-button" data-ota-close-detail>Close</button>
        </div>
        <div class="ota-detail-grid">
          <div><em>Program</em><strong>${esc(t.programName || "—")}</strong></div>
          <div><em>Account type</em><strong>${esc(t.accountType)}</strong></div>
          <div><em>Role</em><strong>${esc(t.role)}</strong></div>
          <div><em>Created</em><strong>${esc(t.createdAt || "—")}</strong></div>
          <div><em>Last login</em><strong>${esc(t.lastLoginAt || "—")}</strong></div>
          <div><em>Cohort</em><strong>${esc(t.testingCohort || "—")}</strong></div>
        </div>
        <p class="muted-copy">${esc(t.notes || "No notes.")}</p>
        ${inviteUrl ? `
          <div class="ota-invite-box">
            <label>Invite link<textarea readonly rows="2">${esc(inviteUrl)}</textarea></label>
            <button type="button" class="primary-button" data-ota-copy="${esc(inviteUrl)}">Copy invite link</button>
          </div>
        ` : ""}
        <form data-ota-edit-form class="ota-form">
          <div class="ota-form-grid">
            <label>Role
              <select name="role">
                ${["owner", "director", "teacher", "assistant"].map((r) => `<option value="${r}" ${t.role === r ? "selected" : ""}>${r}</option>`).join("")}
              </select>
            </label>
            <label>Account type
              <select name="accountType">
                ${["home_daycare", "center", "single_provider"].map((r) => `<option value="${r}" ${t.accountType === r ? "selected" : ""}>${r}</option>`).join("")}
              </select>
            </label>
            <label>Testing cohort<input name="testingCohort" value="${esc(t.testingCohort || "")}" /></label>
            <label>Status
              <select name="testingStatus">
                ${["active", "inactive", "testing_complete", "disabled"].map((r) => `<option value="${r}" ${t.status === r ? "selected" : ""}>${r}</option>`).join("")}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Feature access</legend>
            <div class="ota-check-grid">${featureChecks(t.features || {})}</div>
          </fieldset>
          <label>Notes<textarea name="notes" rows="2">${esc(t.notes || "")}</textarea></label>
          <div class="account-actions-row">
            <button type="submit" class="primary-button">Save access</button>
            <button type="button" class="ghost-button" data-ota-resend>Resend / recreate invite</button>
            <button type="button" class="ghost-button" data-ota-reset-password>Reset access (temp password)</button>
            <button type="button" class="ghost-button" data-ota-reset-data>Reset demo care data</button>
            <button type="button" class="ghost-button" data-ota-view-as-tester="${esc(t.email)}">View as tester</button>
            ${t.status === "disabled"
              ? `<button type="button" class="primary-button" data-ota-reactivate>Reactivate</button>`
              : `<button type="button" class="ghost-button" data-ota-disable>Disable</button>`}
            <button type="button" class="danger-button" data-ota-archive>Archive (no hard delete)</button>
          </div>
          <p class="form-message" data-ota-detail-message hidden></p>
        </form>
        <h4>Audit for this tester</h4>
        <ul class="ota-audit-list">
          ${(data.audit || []).map((row) => `
            <li><strong>${esc(row.action)}</strong> · ${esc(row.at)} · ${esc(row.detail || "")}</li>
          `).join("") || "<li class=\"muted-copy\">No events yet.</li>"}
        </ul>
      </section>
    `;
  }

  function programsHtml() {
    return `
      <section class="ota-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Programs</p>
            <h3>Test programs</h3>
            <p class="muted-copy">Home daycare and center programs created for testing.</p>
          </div>
        </div>
        <div class="ota-table-wrap">
          <table class="ota-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Owner</th><th>Staff</th><th>Children</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              ${(state.programs || []).map((p) => `
                <tr>
                  <td><strong>${esc(p.name)}</strong>${p.isTestingProgram ? " <span class=\"ota-mini-tag\">TEST</span>" : ""}</td>
                  <td>${esc(p.accountType)}</td>
                  <td>${esc(p.ownerName || p.ownerEmail)}</td>
                  <td>${esc(p.staffCount)}</td>
                  <td>${esc(p.childrenCount)}</td>
                  <td>${statusChip(p.status)}</td>
                  <td>${esc((p.createdAt || "").slice(0, 10))}</td>
                </tr>
              `).join("") || `<tr><td colspan="7" class="muted-copy">No programs yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function flagsHtml() {
    const global = state.flags?.global || {};
    return `
      <section class="ota-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Feature flags</p>
            <h3>Testing flags</h3>
            <p class="muted-copy"><strong>Production: unaffected.</strong> These toggles only apply on the testing environment.</p>
          </div>
        </div>
        <form data-ota-flags-form class="ota-form">
          <div class="ota-check-grid">
            ${Object.keys(GLOBAL_FLAG_LABELS).map((key) => `
              <label class="ota-check">
                <input type="checkbox" name="flag-${key}" ${global[key] !== false ? "checked" : ""} />
                ${esc(GLOBAL_FLAG_LABELS[key])}
                <small>Global testing: ${global[key] !== false ? "ON" : "OFF"} · Production: OFF / unaffected</small>
              </label>
            `).join("")}
          </div>
          <button type="submit" class="primary-button">Save global testing flags</button>
          <p class="form-message" data-ota-flags-message hidden></p>
        </form>
        <h4>Per-tester overrides</h4>
        <p class="muted-copy">Open a tester to change their individual feature access. Below is a quick view.</p>
        <ul class="ota-audit-list">
          ${(state.flags?.testers || []).slice(0, 40).map((t) => `
            <li><strong>${esc(t.name)}</strong> (${esc(t.email)}) — ${esc(Object.entries(t.features || {}).filter(([, v]) => v).map(([k]) => FEATURE_LABELS[k] || k).join(", ") || "defaults")}</li>
          `).join("") || "<li class=\"muted-copy\">No tester feature rows yet.</li>"}
        </ul>
      </section>
    `;
  }

  function auditHtml() {
    return `
      <section class="ota-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Audit log</p>
            <h3>Who changed what</h3>
          </div>
          <button type="button" class="ghost-button" data-ota-refresh>Refresh</button>
        </div>
        <ul class="ota-audit-list">
          ${(state.audit || []).map((row) => `
            <li>
              <strong>${esc(row.action)}</strong>
              · actor ${esc(row.actorEmail)}
              · target ${esc(row.targetEmail || "—")}
              · ${esc(row.at)}
              <br/><span class="muted-copy">${esc(row.detail || "")}</span>
            </li>
          `).join("") || "<li class=\"muted-copy\">No audit events yet.</li>"}
        </ul>
      </section>
    `;
  }

  function viewAsHtml() {
    const roles = ["Owner", "Director", "Teacher", "Assistant", "Parent"];
    return `
      <section class="ota-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">View As</p>
            <h3>Preview real role experiences</h3>
            <p class="muted-copy">Uses the same permission logic as real users. A sticky banner stays visible until you exit.</p>
          </div>
        </div>
        <div class="account-actions-row">
          ${roles.map((role) => `
            <button type="button" class="ghost-button" data-ota-preview-role="${role}">Preview as ${role}</button>
          `).join("")}
          <button type="button" class="primary-button" data-ota-preview-role="Admin">Exit to Admin</button>
        </div>
        <p class="muted-copy">For a specific tester, open their detail page and choose <strong>View as tester</strong>.</p>
      </section>
    `;
  }

  function paint() {
    ensureBanner();
    ensureViewAsBanner();
    const root = document.querySelector("#ownerTestingAdminApp");
    if (!root) return;
    if (!isTestingHost()) {
      root.innerHTML = `
        <section class="ota-panel">
          <div class="ota-env-pill is-prod-warning">NOT THE TESTING HOST</div>
          <h3>Owner Testing Admin is testing-only</h3>
          <p class="muted-copy">This console is disabled unless <code>HOME_DAYCARE_HUB_TESTING</code> is enabled on the testing service.</p>
        </section>
      `;
      return;
    }
    root.innerHTML = `
      <nav class="ota-subnav" aria-label="Testing admin">
        ${[
          ["dashboard", "Dashboard"],
          ["testers", "Testers"],
          ["programs", "Programs"],
          ["flags", "Feature Flags"],
          ["viewas", "View As"],
          ["audit", "Audit Log"],
        ].map(([id, label]) => `
          <button type="button" class="${state.tab === id ? "primary-button" : "ghost-button"}" data-ota-tab="${id}">${label}</button>
        `).join("")}
      </nav>
      ${state.error ? `<p class="form-message" role="alert">${esc(state.error)}</p>` : ""}
      ${state.message ? `<p class="form-message" role="status">${esc(state.message)}</p>` : ""}
      ${state.loading ? `<p class="muted-copy">Loading…</p>` : ""}
      ${state.tab === "dashboard" ? dashboardHtml() : ""}
      ${state.tab === "testers" ? `${addTesterFormHtml()}${detailHtml()}${testersListHtml()}` : ""}
      ${state.tab === "programs" ? programsHtml() : ""}
      ${state.tab === "flags" ? flagsHtml() : ""}
      ${state.tab === "viewas" ? viewAsHtml() : ""}
      ${state.tab === "audit" ? auditHtml() : ""}
    `;
    bind(root);
  }

  function showMsg(sel, text, ok = true) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.style.color = ok ? "" : "#8a1f1f";
  }

  function bind(root) {
    root.querySelectorAll("[data-ota-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-ota-tab");
        state.message = "";
        paint();
        if (["dashboard", "testers", "programs", "flags", "audit"].includes(state.tab)) loadAll();
      });
    });
    root.querySelector("[data-ota-refresh]")?.addEventListener("click", () => loadAll());
    root.querySelector("[data-ota-search]")?.addEventListener("change", (event) => {
      state.query = event.target.value || "";
      loadAll();
    });
    root.querySelector("[data-ota-status-filter]")?.addEventListener("change", (event) => {
      state.statusFilter = event.target.value || "";
      loadAll();
    });
    root.querySelectorAll("[data-ota-open-tester]").forEach((btn) => {
      btn.addEventListener("click", () => openDetail(btn.getAttribute("data-ota-open-tester")));
    });
    root.querySelector("[data-ota-close-detail]")?.addEventListener("click", () => {
      state.selectedEmail = "";
      state.detail = null;
      paint();
    });
    root.querySelectorAll("[data-ota-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const text = btn.getAttribute("data-ota-copy") || "";
        try {
          await navigator.clipboard.writeText(text);
          state.message = "Invite link copied.";
          paint();
        } catch {
          state.message = text;
          paint();
        }
      });
    });

    const addForm = root.querySelector("[data-ota-add-form]");
    addForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = {
        name: form.name.value,
        email: form.email.value,
        programName: form.programName.value,
        programType: form.programType.value,
        role: form.role.value,
        programMode: form.programMode.value,
        existingProgramId: form.existingProgramId.value,
        testingCohort: form.testingCohort.value,
        childName: form.childName.value || "Demo Child",
        notes: form.notes.value,
        activateNow: form.activateNow.checked,
        createSampleData: form.createSampleData.checked,
        features: readFeaturesFromForm(form),
        appOrigin: window.location.origin,
        adminEmail: typeof adminSession === "function" ? adminSession()?.email : "admin",
      };
      try {
        const result = await api("/api/admin/testing/testers", { method: "POST", body });
        let msg = result.message || "Tester created.";
        if (result.acceptUrl) msg += ` Invite: ${result.acceptUrl}`;
        if (result.temporaryPassword) msg += ` Temp password: ${result.temporaryPassword}`;
        showMsg("[data-ota-add-message]", msg, true);
        state.message = msg;
        await loadAll();
        if (result.tester?.email) openDetail(result.tester.email);
      } catch (error) {
        showMsg("[data-ota-add-message]", error.message, false);
      }
    });

    const editForm = root.querySelector("[data-ota-edit-form]");
    editForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}`, {
          method: "PATCH",
          body: {
            role: form.role.value,
            accountType: form.accountType.value,
            testingCohort: form.testingCohort.value,
            testingStatus: form.testingStatus.value,
            notes: form.notes.value,
            features: readFeaturesFromForm(form),
            adminEmail: typeof adminSession === "function" ? adminSession()?.email : "admin",
          },
        });
        showMsg("[data-ota-detail-message]", "Tester access saved.", true);
        await openDetail(state.selectedEmail);
        await loadAll();
      } catch (error) {
        showMsg("[data-ota-detail-message]", error.message, false);
      }
    });

    root.querySelector("[data-ota-resend]")?.addEventListener("click", async () => {
      try {
        const result = await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}/resend`, {
          method: "PATCH",
          body: { appOrigin: window.location.origin },
        });
        showMsg("[data-ota-detail-message]", `${result.message || "Invite resent."} ${result.acceptUrl || ""}`, true);
        await openDetail(state.selectedEmail);
      } catch (error) {
        showMsg("[data-ota-detail-message]", error.message, false);
      }
    });

    root.querySelector("[data-ota-reset-password]")?.addEventListener("click", async () => {
      try {
        const result = await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}/reset-access`, {
          method: "PATCH",
          body: { mode: "password" },
        });
        showMsg("[data-ota-detail-message]", `${result.message} Password: ${result.temporaryPassword || ""}`, true);
      } catch (error) {
        showMsg("[data-ota-detail-message]", error.message, false);
      }
    });

    root.querySelector("[data-ota-reset-data]")?.addEventListener("click", async () => {
      const ok = window.confirm("Clear this tester's demo care logs (attendance/meals/naps/activities/reports)? Profiles are kept. Testing only.");
      if (!ok) return;
      try {
        const result = await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}/reset-access`, {
          method: "PATCH",
          body: { mode: "data" },
        });
        showMsg("[data-ota-detail-message]", result.message || "Demo data reset.", true);
      } catch (error) {
        showMsg("[data-ota-detail-message]", error.message, false);
      }
    });

    root.querySelector("[data-ota-disable]")?.addEventListener("click", async () => {
      try {
        await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}`, {
          method: "PATCH",
          body: { disable: true },
        });
        await openDetail(state.selectedEmail);
        await loadAll();
      } catch (error) {
        showMsg("[data-ota-detail-message]", error.message, false);
      }
    });

    root.querySelector("[data-ota-reactivate]")?.addEventListener("click", async () => {
      try {
        await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}`, {
          method: "PATCH",
          body: { reactivate: true },
        });
        await openDetail(state.selectedEmail);
        await loadAll();
      } catch (error) {
        showMsg("[data-ota-detail-message]", error.message, false);
      }
    });

    root.querySelector("[data-ota-archive]")?.addEventListener("click", async () => {
      const ok = window.confirm("Archive this tester? They will be disabled and pending invites revoked. Data is kept (no hard delete).");
      if (!ok) return;
      try {
        await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}/archive`, {
          method: "PATCH",
          body: {},
        });
        await openDetail(state.selectedEmail);
        await loadAll();
      } catch (error) {
        showMsg("[data-ota-detail-message]", error.message, false);
      }
    });

    root.querySelector("[data-ota-view-as-tester]")?.addEventListener("click", async () => {
      const email = root.querySelector("[data-ota-view-as-tester]")?.getAttribute("data-ota-view-as-tester");
      try {
        await api("/api/admin/testing/view-as-log", {
          method: "POST",
          body: {
            action: "view_as_started",
            targetEmail: email,
            detail: "View as tester",
            mode: "impersonation",
          },
        });
      } catch (_e) { /* non-blocking */ }
      if (typeof startAdminImpersonation === "function") {
        await startAdminImpersonation(email);
        ensureViewAsBanner();
      }
    });

    root.querySelectorAll("[data-ota-preview-role]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const role = btn.getAttribute("data-ota-preview-role");
        try {
          await api("/api/admin/testing/view-as-log", {
            method: "POST",
            body: { action: role === "Admin" ? "view_as_exited" : "view_as_role_preview", detail: role, role },
          });
        } catch (_e) { /* ignore */ }
        if (typeof setAdminPreviewMode === "function") setAdminPreviewMode(role);
        ensureViewAsBanner();
        if (typeof showActionFeedback === "function") {
          showActionFeedback(role === "Admin" ? "Returned to Admin." : `Previewing as ${role}.`);
        }
      });
    });

    const flagsForm = root.querySelector("[data-ota-flags-form]");
    flagsForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const flags = {};
      Object.keys(GLOBAL_FLAG_LABELS).forEach((key) => {
        flags[key] = Boolean(form.querySelector(`[name="flag-${key}"]`)?.checked);
      });
      try {
        await api("/api/admin/testing/flags", { method: "PUT", body: { flags } });
        showMsg("[data-ota-flags-message]", "Testing flags saved. Production unaffected.", true);
        await loadAll();
      } catch (error) {
        showMsg("[data-ota-flags-message]", error.message, false);
      }
    });
  }

  document.addEventListener("click", (event) => {
    const exit = event.target.closest("[data-ota-exit-view-as]");
    if (!exit) return;
    if (typeof isAdminImpersonating === "function" && isAdminImpersonating() && typeof stopAdminImpersonation === "function") {
      stopAdminImpersonation();
    } else if (typeof setAdminPreviewMode === "function") {
      setAdminPreviewMode("Admin");
    }
    ensureViewAsBanner();
    api("/api/admin/testing/view-as-log", {
      method: "POST",
      body: { action: "view_as_exited", detail: "Exit tester view" },
    }).catch(() => {});
  });

  function renderOwnerTestingAdmin(target) {
    const host = target || document.querySelector("#ownerTestingAdminApp");
    if (!host) return;
    if (!host.id) host.id = "ownerTestingAdminApp";
    if (host.dataset.otaPreferredTab) {
      state.tab = host.dataset.otaPreferredTab;
    }
    ensureBanner();
    state.tab = state.tab || "testers";
    paint();
    if (isTestingHost() && adminToken()) loadAll();
  }

  window.OwnerTestingAdmin = {
    renderOwnerTestingAdmin,
    ensureBanner,
    ensureViewAsBanner,
    loadAll,
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureBanner();
    ensureViewAsBanner();
  });
})();
