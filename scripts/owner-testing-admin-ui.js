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
    tab: "dashboard",
    dashboard: null,
    testers: [],
    programs: [],
    flags: null,
    audit: [],
    feedback: [],
    selectedEmail: "",
    detail: null,
    selectedProgramId: "",
    programDetail: null,
    loading: false,
    error: "",
    message: "",
    toast: "",
    query: "",
    statusFilter: "",
    feedbackStatus: "",
    /** Last created invite — kept visible so Leah always knows what to send. */
    lastInvite: null,
    /** Generic drafts for every OTA form — survives remounts / tab switches. */
    formDrafts: Object.create(null),
    addFormDraft: null,
    editFormDraft: null,
    focusRestore: null,
    draftListenersBound: false,
  };

  function otaRoot() {
    return document.querySelector("#ownerTestingAdminApp");
  }

  function isTypingInOta() {
    const root = otaRoot();
    const active = document.activeElement;
    if (!root || !active || !root.contains(active)) return false;
    const tag = String(active.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  /** Prefer elements.namedItem so we never collide with form IDL attrs. */
  function formControl(form, fieldName) {
    if (!form || !fieldName) return null;
    const named = form.elements?.namedItem?.(fieldName);
    if (named) {
      if (typeof named.length === "number" && named[0] && !named.tagName) return named[0];
      return named;
    }
    try {
      return form.querySelector(`[name="${CSS.escape(String(fieldName))}"]`);
    } catch {
      return form.querySelector(`[name="${String(fieldName).replace(/"/g, '\\"')}"]`);
    }
  }

  function formDraftKey(form) {
    if (!form) return "";
    if (form.hasAttribute("data-ota-add-form")) return "add";
    if (form.hasAttribute("data-ota-edit-form")) return `edit:${state.selectedEmail || ""}`;
    if (form.hasAttribute("data-ota-create-program-form")) return "create-program";
    if (form.hasAttribute("data-ota-flags-form")) return "flags";
    return form.getAttribute("data-ota-form") || form.id || "";
  }

  function readFormDraft(form) {
    const draft = Object.create(null);
    if (!form) return draft;
    [...(form.elements || [])].forEach((el) => {
      if (!el || !el.name || el.disabled) return;
      const type = String(el.type || "").toLowerCase();
      if (type === "button" || type === "submit" || type === "reset" || type === "file") return;
      if (type === "radio") {
        if (el.checked) draft[el.name] = el.value;
        return;
      }
      if (type === "checkbox") {
        draft[el.name] = Boolean(el.checked);
        return;
      }
      draft[el.name] = el.value || "";
    });
    return draft;
  }

  function applyFormDraft(form, draft) {
    if (!form || !draft) return;
    Object.keys(draft).forEach((name) => {
      const el = formControl(form, name);
      if (!el) return;
      const type = String(el.type || "").toLowerCase();
      if (type === "checkbox") {
        el.checked = Boolean(draft[name]);
        return;
      }
      if (type === "radio") {
        const radios = form.elements?.namedItem?.(name);
        const list = radios && typeof radios.length === "number" && !radios.tagName ? [...radios] : [el];
        list.forEach((radio) => { radio.checked = radio.value === draft[name]; });
        return;
      }
      if (el.tagName === "SELECT") {
        applySelectValue(el, draft[name]);
        return;
      }
      el.value = draft[name] == null ? "" : String(draft[name]);
    });
  }

  function captureFormDrafts() {
    const root = otaRoot();
    if (!root) return;
    root.querySelectorAll("form").forEach((form) => {
      const key = formDraftKey(form);
      if (!key) return;
      state.formDrafts[key] = readFormDraft(form);
    });
    const search = root.querySelector("[data-ota-search]");
    if (search) state.query = search.value || "";
    // Keep legacy mirrors for older restore paths / tests.
    if (state.formDrafts.add) {
      const d = state.formDrafts.add;
      state.addFormDraft = {
        name: d.name || "",
        email: d.email || "",
        programName: d.programName || "",
        programType: d.programType || "home_daycare",
        role: d.role || "owner",
        programMode: d.programMode || "new",
        existingProgramId: d.existingProgramId || "",
        testingCohort: d.testingCohort || "",
        childName: d.childName || "",
        notes: d.notes || "",
        activateNow: Boolean(d.activateNow),
        createSampleData: Boolean(d.createSampleData),
        sendEmail: Boolean(d.sendEmail),
        features: Object.keys(FEATURE_LABELS).reduce((acc, key) => {
          acc[key] = Boolean(d[`feat-${key}`]);
          return acc;
        }, {}),
      };
    }
    const editKey = `edit:${state.selectedEmail || ""}`;
    if (state.formDrafts[editKey] && state.selectedEmail) {
      const d = state.formDrafts[editKey];
      state.editFormDraft = {
        email: state.selectedEmail,
        role: d.role || "",
        accountType: d.accountType || "",
        testingCohort: d.testingCohort || "",
        testingStatus: d.testingStatus || "",
        notes: d.notes || "",
        features: Object.keys(FEATURE_LABELS).reduce((acc, key) => {
          acc[key] = Boolean(d[`feat-${key}`]);
          return acc;
        }, {}),
      };
    }
    const active = document.activeElement;
    if (active && root.contains(active) && active.name) {
      const form = active.closest("form");
      state.focusRestore = {
        formKey: formDraftKey(form),
        name: active.name,
        start: typeof active.selectionStart === "number" ? active.selectionStart : null,
        end: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
      };
    }
  }

  function captureDraftsBeforeUnmount() {
    captureFormDrafts();
  }

  function ensureDraftListeners() {
    if (state.draftListenersBound) return;
    state.draftListenersBound = true;
    const sync = (event) => {
      const root = otaRoot();
      const target = event.target;
      if (!root || !target || !root.contains(target)) return;
      captureFormDrafts();
    };
    document.addEventListener("input", sync, true);
    document.addEventListener("change", sync, true);
  }

  function applySelectValue(select, value) {
    if (!select) return;
    const wanted = String(value ?? "");
    if ([...select.options].some((opt) => opt.value === wanted)) select.value = wanted;
  }

  function restoreFormDrafts() {
    const root = otaRoot();
    if (!root) return;
    root.querySelectorAll("form").forEach((form) => {
      const key = formDraftKey(form);
      if (!key) return;
      applyFormDraft(form, state.formDrafts[key]);
    });
    const search = root.querySelector("[data-ota-search]");
    if (search && state.query) search.value = state.query;
    const focus = state.focusRestore;
    if (focus?.name && focus.formKey) {
      const form = [...root.querySelectorAll("form")].find((f) => formDraftKey(f) === focus.formKey);
      const field = formControl(form, focus.name);
      if (field && typeof field.focus === "function") {
        field.focus();
        try {
          if (focus.start != null && typeof field.setSelectionRange === "function") {
            field.setSelectionRange(focus.start, focus.end ?? focus.start);
          }
        } catch { /* ignore */ }
      }
    }
  }

  function showToast(text) {
    state.toast = String(text || "");
    const root = otaRoot();
    let el = root?.querySelector("[data-ota-toast]");
    if (!el && root) {
      root.insertAdjacentHTML("afterbegin", `<p class="form-message" data-ota-toast role="status"></p>`);
      el = root.querySelector("[data-ota-toast]");
    }
    if (el) {
      el.hidden = !state.toast;
      el.textContent = state.toast;
    }
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      state.toast = "";
      const node = otaRoot()?.querySelector("[data-ota-toast]");
      if (node) { node.hidden = true; node.textContent = ""; }
    }, 3200);
  }

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
      ? `OWNER ADMIN — PREVIEW ONLY (not logged in as ${adminImpersonationState?.account?.name || adminImpersonationState?.email || "tester"})`
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

  async function loadAll({ force = false } = {}) {
    // Never wipe in-progress typing with a loading remount.
    const busy = !force && isTypingInOta();
    if (!busy) {
      state.loading = true;
      state.error = "";
      paint();
    }
    try {
      const [dash, testers, programs, flags, audit, feedback] = await Promise.all([
        api("/api/admin/testing/dashboard"),
        api(`/api/admin/testing/testers?q=${encodeURIComponent(state.query)}&status=${encodeURIComponent(state.statusFilter)}`),
        api(`/api/admin/testing/programs?q=${encodeURIComponent(state.query)}`),
        api("/api/admin/testing/flags"),
        api("/api/admin/testing/audit"),
        api(`/api/admin/testing/feedback?status=${encodeURIComponent(state.feedbackStatus)}`),
      ]);
      state.dashboard = dash.dashboard;
      state.testers = testers.testers || [];
      state.programs = programs.programs || [];
      state.flags = flags;
      state.audit = audit.audit || [];
      state.feedback = feedback.feedback || [];
    } catch (error) {
      state.error = error.message || "Could not load testing admin.";
    } finally {
      state.loading = false;
      if (!isTypingInOta() || force) paint();
    }
  }

  async function openDetail(email) {
    state.selectedEmail = email;
    state.detail = null;
    if (!isTypingInOta()) paint();
    try {
      const data = await api(`/api/admin/testing/testers/${encodeURIComponent(email)}`);
      state.detail = data;
      const inviteUrl = data?.tester?.invite?.acceptUrl || "";
      if (inviteUrl) {
        state.lastInvite = {
          email: data.tester.email,
          name: data.tester.name,
          acceptUrl: inviteUrl,
          programName: data.tester.programName || "",
          accountType: data.tester.accountType || "",
          role: data.tester.role || "",
          emailSent: Boolean(data.tester.invite?.emailSent),
          emailError: data.tester.invite?.emailError || "",
          emailConfigured: data.tester.invite?.emailConfigured,
        };
      }
      paint();
    } catch (error) {
      state.error = error.message;
      paint();
    }
  }

  async function openProgram(programId) {
    state.selectedProgramId = programId;
    state.programDetail = null;
    paint();
    try {
      state.programDetail = await api(`/api/admin/testing/programs/${encodeURIComponent(programId)}`);
      paint();
    } catch (error) {
      state.error = error.message;
      paint();
    }
  }

  function healthChip(ok, label) {
    return `<span class="ota-health ${ok ? "is-ok" : "is-warn"}">${esc(label)}: ${ok ? "OK" : "Off / check"}</span>`;
  }

  function dashboardHtml() {
    const d = state.dashboard || {};
    const health = d.systemHealth || {};
    return `
      <section class="ota-panel">
        <div class="ota-env-pill">ENVIRONMENT: TESTING</div>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Owner Admin</p>
            <h3>Testing control center</h3>
            <p class="muted-copy">Your primary console for testers and test programs. Production is unaffected.</p>
          </div>
          <button type="button" class="ghost-button" data-ota-refresh>Refresh</button>
        </div>
        <div class="ota-quick-actions" role="group" aria-label="Quick actions">
          <button type="button" class="primary-button" data-ota-goto="testers" data-ota-focus-add>Add Tester</button>
          <button type="button" class="ghost-button" data-ota-goto="programs" data-ota-focus-create-program>Create Program</button>
          <button type="button" class="ghost-button" data-ota-goto="viewas">View As</button>
          <button type="button" class="ghost-button" data-ota-goto="flags">Feature Flags</button>
          <button type="button" class="ghost-button" data-ota-goto="feedback">Feedback Inbox</button>
        </div>
        <div class="ota-stat-grid">
          <article><em>Total programs</em><strong>${esc(d.totalPrograms ?? d.programs ?? "—")}</strong></article>
          <article><em>Home Daycares</em><strong>${esc(d.homeDaycares ?? d.byType?.home_daycare ?? "—")}</strong></article>
          <article><em>Centers</em><strong>${esc(d.centers ?? d.byType?.center ?? "—")}</strong></article>
          <article><em>Active testers</em><strong>${esc(d.activeTesters ?? "—")}</strong></article>
          <article><em>Pending invites</em><strong>${esc(d.pendingInvites ?? "—")}</strong></article>
          <article><em>Disabled testers</em><strong>${esc(d.disabledTesters ?? "—")}</strong></article>
          <article><em>Total children</em><strong>${esc(d.totalChildren ?? d.children ?? "—")}</strong></article>
          <article><em>Total families</em><strong>${esc(d.totalFamilies ?? d.families ?? "—")}</strong></article>
          <article><em>Total staff</em><strong>${esc(d.totalStaff ?? d.staff ?? "—")}</strong></article>
          <article><em>Open feedback</em><strong>${esc(d.openFeedback ?? "—")}</strong></article>
        </div>
        <h4>Testing system health</h4>
        <div class="ota-health-row">
          ${healthChip(health.testingFence !== false, "Testing fence")}
          ${healthChip(health.ownerTestingAdmin !== false, "Owner Admin")}
          ${healthChip(health.familyHub !== false, "Family Hub")}
          ${healthChip(health.forms !== false, "Forms")}
          ${healthChip(health.billingTest === true, "Billing test")}
          ${healthChip(health.aiFeatures === true, "AI features")}
          ${healthChip(health.emailConfigured === true || d.emailDeliveryReady === true, "Invite email")}
        </div>
        <div class="ota-dash-columns">
          <div>
            <h4>Recent signups</h4>
            <ul class="ota-audit-list">
              ${(d.recentSignups || []).map((row) => `
                <li><strong>${esc(row.name || row.email)}</strong> · ${esc(row.role)} · ${esc(row.accountType)} · <span class="muted-copy">${esc((row.at || "").slice(0, 16))}</span></li>
              `).join("") || "<li class=\"muted-copy\">No tester signups yet.</li>"}
            </ul>
          </div>
          <div>
            <h4>Recent admin actions</h4>
            <ul class="ota-audit-list">
              ${(d.recentAudit || []).map((row) => `
                <li><strong>${esc(row.action)}</strong> · ${esc(row.targetEmail || "—")} · <span>${esc(row.at || "")}</span><br/><span class="muted-copy">${esc(row.detail || "")}</span></li>
              `).join("") || "<li class=\"muted-copy\">No admin testing actions yet.</li>"}
            </ul>
          </div>
        </div>
      </section>
    `;
  }

  function inviteAccessCardHtml(invite, { heading = "Send this invite link" } = {}) {
    if (!invite?.acceptUrl) return "";
    const emailOff = invite.emailSent
      ? "Invite email was attempted."
      : "Email delivery unavailable on testing. Copy and send this invite link manually.";
    return `
      <section class="ota-panel ota-invite-ready" data-ota-invite-ready>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Next step</p>
            <h3>${esc(heading)}</h3>
            <p class="muted-copy">
              <strong>${esc(invite.name || "Tester")}</strong> · ${esc(invite.email || "")}
              · ${esc(invite.accountType || "")} · ${esc(invite.role || "")}
              · ${esc(invite.programName || "Program")}
            </p>
          </div>
        </div>
        <ol class="ota-invite-steps">
          <li>Copy the invite link below.</li>
          <li>Text or message it to the <strong>tester</strong> only (do not use production).</li>
          <li>They open it on the testing site, create their own password, and enter an empty program they fill themselves.</li>
        </ol>
        <p class="ota-email-unavailable" role="status">
          <strong>Do not open this link yourself to “try it.”</strong>
          Accepting as this email writes into <em>their</em> real testing program — any child you add while sampling stays in their account.
          To preview roles yourself, use Admin → <strong>View As</strong> (or Open tester detail → View as tester).
        </p>
        <div class="ota-invite-box">
          <label>Invite / setup link
            <textarea readonly rows="3" data-ota-invite-textarea>${esc(invite.acceptUrl)}</textarea>
          </label>
          <div class="account-actions-row">
            <button type="button" class="primary-button" data-ota-copy="${esc(invite.acceptUrl)}">Copy Invite Link</button>
            <button type="button" class="ghost-button" data-ota-open-tester="${esc(invite.email || "")}">Open tester detail</button>
            <button type="button" class="ghost-button" data-ota-goto="viewas">Open View As</button>
          </div>
          <p class="ota-email-unavailable" role="status">${esc(emailOff)}</p>
          <p class="muted-copy">Testers with <strong>Multi-role Switch View</strong> see a <strong>Switch View</strong> control in the app header (Owner / Director / Teacher / Assistant / Parent). That is separate from Admin View As.</p>
        </div>
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
            <p class="muted-copy">Creates a <strong>new empty</strong> testing program invite by default. You copy the link and send it — the tester creates their own password and adds their own children. No production accounts.</p>
          </div>
        </div>
        <form data-ota-add-form class="ota-form">
          <div class="ota-form-grid">
            <label>Name<input name="name" required placeholder="Jordan Rivera" autocomplete="off" /></label>
            <label>Email<input name="email" type="email" required placeholder="jordan@providermail.com" autocomplete="off" /></label>
            <label>Program name<input name="programName" placeholder="Sunshine Home Daycare TEST" autocomplete="off" /></label>
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
                <option value="new">Create new test program (recommended)</option>
                <option value="existing">Add to existing test program (shared data)</option>
              </select>
            </label>
            <label>Existing program
              <select name="existingProgramId">
                <option value="">—</option>
                ${programOptions}
              </select>
            </label>
            <label>Testing cohort<input name="testingCohort" placeholder="Family Hub beta" autocomplete="off" /></label>
          </div>
          <fieldset>
            <legend>Feature access</legend>
            <div class="ota-check-grid">${featureChecks({ familyHub: true, forms: true, teacherWorkflow: true, multiRole: true, fullPlatform: false })}</div>
            <p class="muted-copy">Multi-role Switch View lets the tester switch Owner / Director / Teacher / Assistant / Parent inside <em>their</em> sandbox (header control). That is how they preview roles — not Admin View As.</p>
          </fieldset>
          <label>Notes<textarea name="notes" rows="2" placeholder="What should they test?"></textarea></label>
          <label class="ota-check"><input type="checkbox" name="sendEmail" /> Also try invite email if delivery is configured (still show Copy Invite Link)</label>
          <details class="ota-advanced">
            <summary>Advanced (not for real testers)</summary>
            <p class="muted-copy">Leave these off for real providers. They should start empty and add their own children.</p>
            <label class="ota-check"><input type="checkbox" name="createSampleData" /> Pre-seed a sample child / classrooms (owner demos only)</label>
            <label>Starter child name<input name="childName" placeholder="Demo Child" autocomplete="off" /></label>
            <label class="ota-check"><input type="checkbox" name="activateNow" /> Generate instant temp password login (owner debugging only)</label>
            <p class="muted-copy">Do not accept the invite link yourself — that writes into the tester’s program. Use Admin → View As instead.</p>
          </details>
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
              <tr><th>Name</th><th>Email</th><th>Program</th><th>Type</th><th>Role</th><th>Invite / access</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((t) => {
                const inviteUrl = t.invite?.acceptUrl || "";
                const inviteLabel = inviteUrl
                  ? "Invite ready"
                  : (t.status === "invitation_pending" ? "Invite pending" : String(t.status || "").replace(/_/g, " "));
                return `
                <tr>
                  <td><strong>${esc(t.name)}</strong></td>
                  <td>${esc(t.email)}</td>
                  <td>${esc(t.programName || "—")}</td>
                  <td>${esc(t.accountType)}</td>
                  <td>${esc(t.role)}</td>
                  <td>${statusChip(t.status)} <span class="muted-copy">${esc(inviteLabel)}</span></td>
                  <td class="ota-row-actions">
                    ${inviteUrl ? `<button type="button" class="primary-button" data-ota-copy="${esc(inviteUrl)}">Copy Invite Link</button>` : ""}
                    <button type="button" class="ghost-button" data-ota-open-tester="${esc(t.email)}">Open</button>
                  </td>
                </tr>`;
              }).join("") || `<tr><td colspan="7" class="muted-copy">No testers yet. Use Add Tester above.</td></tr>`}
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
    const emailNote = t.invite?.emailSent
      ? "Last email attempt: sent."
      : (t.invite?.emailError
        ? `Email: ${t.invite.emailError}`
        : "Email delivery unavailable on testing. Copy and send this invite link manually.");
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
          <div><em>Name</em><strong>${esc(t.name || "—")}</strong></div>
          <div><em>Email</em><strong>${esc(t.email || "—")}</strong></div>
          <div><em>Home Daycare / Center</em><strong>${esc(t.accountType || "—")}</strong></div>
          <div><em>Role</em><strong>${esc(t.role || "—")}</strong></div>
          <div><em>Program</em><strong>${esc(t.programName || "—")}</strong></div>
          <div><em>Invite / access</em><strong>${esc(String(t.status || "").replace(/_/g, " "))}${inviteUrl ? " · link ready" : ""}</strong></div>
          <div><em>Created</em><strong>${esc(t.createdAt || "—")}</strong></div>
          <div><em>Last login</em><strong>${esc(t.lastLoginAt || "—")}</strong></div>
          <div><em>Cohort</em><strong>${esc(t.testingCohort || "—")}</strong></div>
        </div>
        <p class="muted-copy">${esc(t.notes || "No notes.")}</p>
        ${inviteUrl ? `
          <div class="ota-invite-box">
            <label>Invite / setup link<textarea readonly rows="3">${esc(inviteUrl)}</textarea></label>
            <div class="account-actions-row">
              <button type="button" class="primary-button" data-ota-copy="${esc(inviteUrl)}">Copy Invite Link</button>
              <button type="button" class="ghost-button" data-ota-resend>Regenerate invite link</button>
            </div>
            <p class="ota-email-unavailable" role="status">${esc(emailNote)}</p>
            <p class="muted-copy">Tester opens this testing-site link, creates their own password, then uses normal Log In afterward.</p>
            <p class="ota-email-unavailable" role="status"><strong>Do not sample this link yourself</strong> — accepting as this email writes into their program.</p>
          </div>
        ` : `
          <div class="ota-invite-box">
            <p class="muted-copy">No pending invite link (already accepted, activated, or expired).</p>
            <div class="account-actions-row">
              <button type="button" class="ghost-button" data-ota-resend>Regenerate invite link</button>
            </div>
            <p class="ota-email-unavailable" role="status">Email delivery unavailable on testing. Copy and send the invite link manually after regenerating.</p>
          </div>
        `}
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
            <p class="muted-copy">Turn on <strong>Multi-role Switch View</strong> so this tester can switch roles in the app header. Your Admin → View As is for you only.</p>
          </fieldset>
          <label>Notes<textarea name="notes" rows="2">${esc(t.notes || "")}</textarea></label>
          <div class="account-actions-row">
            <button type="submit" class="primary-button">Save access</button>
            <button type="button" class="ghost-button" data-ota-reset-password>Reset access (temp password)</button>
            <button type="button" class="ghost-button" data-ota-reset-data>Reset demo care data</button>
            <button type="button" class="ghost-button" data-ota-clear-children>Clear children (start empty)</button>
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

  function programDetailHtml() {
    if (!state.selectedProgramId) return "";
    const data = state.programDetail;
    if (!data?.program) {
      return `<section class="ota-panel"><p class="muted-copy">Loading program…</p></section>`;
    }
    const p = data.program;
    return `
      <section class="ota-panel" data-ota-program-detail>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Program detail</p>
            <h3>${esc(p.name)}</h3>
            <p class="muted-copy">${esc(p.accountType)} · owner ${esc(p.ownerEmail)} · ${statusChip(p.status)}</p>
          </div>
          <button type="button" class="ghost-button" data-ota-close-program>Close</button>
        </div>
        <div class="ota-detail-grid">
          <div><em>Staff</em><strong>${esc((data.users || []).length)}</strong></div>
          <div><em>Children</em><strong>${esc((data.children || []).length)}</strong></div>
          <div><em>Classrooms</em><strong>${esc((data.classrooms || []).length)}</strong></div>
          <div><em>Families</em><strong>${esc((data.households || []).length)}</strong></div>
        </div>
        <h4>People</h4>
        <ul class="ota-audit-list">
          ${(data.users || []).map((u) => `
            <li>
              <strong>${esc(u.name)}</strong> · ${esc(u.role)} · ${esc(u.status)}
              <button type="button" class="ghost-button" data-ota-open-tester="${esc(u.email)}">Open tester</button>
              <button type="button" class="ghost-button" data-ota-view-as-tester="${esc(u.email)}">View As</button>
            </li>
          `).join("") || "<li class=\"muted-copy\">No users.</li>"}
        </ul>
        <h4>Children</h4>
        <ul class="ota-audit-list">
          ${(data.children || []).map((c) => `
            <li><strong>${esc(c.name || c.id)}</strong> · ${esc(c.ageGroup || "—")} · room ${esc(c.classroomId || "—")}</li>
          `).join("") || "<li class=\"muted-copy\">No children yet.</li>"}
        </ul>
        <h4>Family Hub households</h4>
        <ul class="ota-audit-list">
          ${(data.households || []).map((h) => `
            <li>
              <strong>${esc(h.label)}</strong> · ${esc(h.email || "—")} · ${esc(h.status)}
              · children: ${esc((h.childNames || []).join(", ") || (h.childIds || []).join(", ") || "—")}
              <div class="account-actions-row" style="margin-top:6px">
                ${h.magicUrl ? `<button type="button" class="ghost-button" data-ota-copy="${esc(h.magicUrl)}">Copy magic link</button>
                <a class="primary-button" href="${esc(h.magicUrl)}" target="_blank" rel="noopener">Open Family Hub preview</a>` : `<span class="muted-copy">No magic link yet</span>`}
              </div>
            </li>
          `).join("") || "<li class=\"muted-copy\">No households for this program yet. Create Family Hub invites while View As that program owner.</li>"}
        </ul>
        <h4>Feature access</h4>
        <p class="muted-copy">Global testing flags + owner overrides. Production unaffected.</p>
        <ul class="ota-audit-list">
          <li>Global: ${esc(Object.entries(data.features?.global || {}).filter(([, v]) => v).map(([k]) => GLOBAL_FLAG_LABELS[k] || k).join(", ") || "defaults")}</li>
          <li>Owner: ${esc(Object.entries(data.features?.owner || {}).filter(([, v]) => v).map(([k]) => FEATURE_LABELS[k] || k).join(", ") || "defaults")}</li>
        </ul>
        <h4>Recent activity</h4>
        <ul class="ota-audit-list">
          ${(data.activity || []).map((row) => `
            <li><strong>${esc(row.action)}</strong> · ${esc(row.targetEmail || "—")} · ${esc(row.at || "")}</li>
          `).join("") || "<li class=\"muted-copy\">No activity.</li>"}
        </ul>
      </section>
    `;
  }

  function programsHtml() {
    return `
      <section class="ota-panel" data-ota-create-program-panel>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Programs</p>
            <h3>Create test program</h3>
            <p class="muted-copy">Shell program for Home Daycare or Center. Add testers afterward or invite an owner email.</p>
          </div>
        </div>
        <form data-ota-create-program-form class="ota-form">
          <div class="ota-form-grid">
            <label>Program name<input name="programName" required placeholder="Sunshine Center TEST" /></label>
            <label>Type
              <select name="programType">
                <option value="home_daycare">Home Daycare</option>
                <option value="center">Center</option>
                <option value="single_provider">Single Provider</option>
              </select>
            </label>
            <label>Owner email (optional)<input name="ownerEmail" type="email" placeholder="owner@example.com" /></label>
            <label>Cohort<input name="testingCohort" placeholder="Week of Aug 10" /></label>
          </div>
          <label class="ota-check"><input type="checkbox" name="createSampleData" /> Seed sample child / classrooms (optional demo)</label>
          <button type="submit" class="primary-button">Create program</button>
          <p class="form-message" data-ota-create-program-message hidden></p>
        </form>
      </section>
      ${programDetailHtml()}
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
              <tr><th>Name</th><th>Type</th><th>Owner</th><th>Staff</th><th>Children</th><th>Status</th><th>Created</th><th></th></tr>
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
                  <td><button type="button" class="ghost-button" data-ota-open-program="${esc(p.id)}">Open</button></td>
                </tr>
              `).join("") || `<tr><td colspan="8" class="muted-copy">No programs yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function feedbackHtml() {
    return `
      <section class="ota-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Testing feedback</p>
            <h3>Feedback inbox</h3>
            <p class="muted-copy">Bugs and notes from the testing site. Prefer items tagged with testing context.</p>
          </div>
          <div class="account-actions-row">
            <select data-ota-feedback-status>
              <option value="">All statuses</option>
              ${["New", "In Progress", "Resolved", "Archived"].map((s) => `
                <option value="${s}" ${state.feedbackStatus === s ? "selected" : ""}>${s}</option>
              `).join("")}
            </select>
            <button type="button" class="ghost-button" data-ota-refresh>Refresh</button>
          </div>
        </div>
        <ul class="ota-audit-list">
          ${(state.feedback || []).map((item) => `
            <li data-ota-feedback-id="${esc(item.id)}">
              <strong>${esc(item.type || "Feedback")}</strong>
              · ${statusChip(item.status || "New")}
              · ${esc(item.email || "—")}
              · ${esc((item.createdAt || "").slice(0, 16))}
              <br/><span>${esc(item.message || "").slice(0, 280)}</span>
              <br/><span class="muted-copy">Page: ${esc(item.page || "—")} · Role: ${esc(item.role || "—")} · ${esc(item.accountType || "")}</span>
              <div class="account-actions-row" style="margin-top:6px">
                <button type="button" class="ghost-button" data-ota-feedback-set="${esc(item.id)}" data-status="In Progress">In Progress</button>
                <button type="button" class="primary-button" data-ota-feedback-set="${esc(item.id)}" data-status="Resolved">Resolved</button>
                <button type="button" class="ghost-button" data-ota-feedback-set="${esc(item.id)}" data-status="Archived">Archive</button>
              </div>
            </li>
          `).join("") || "<li class=\"muted-copy\">No testing feedback yet. Testers can submit via Feedback on the testing site.</li>"}
        </ul>
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
            <p class="eyebrow">View As (Owner Admin only)</p>
            <h3>Preview roles without using the invite link</h3>
            <p class="muted-copy">This is for <strong>you</strong> (Leah / Owner Admin). It does not log you into the tester’s account and does not write into their program.</p>
          </div>
        </div>
        <div class="account-actions-row">
          ${roles.map((role) => `
            <button type="button" class="ghost-button" data-ota-preview-role="${role}">Preview as ${role}</button>
          `).join("")}
          <button type="button" class="primary-button" data-ota-preview-role="Admin">Exit to Admin</button>
        </div>
        <p class="muted-copy">For a specific tester’s plan/chrome, open their detail → <strong>View as tester</strong>.</p>
        <hr style="border:0;border-top:1px solid rgba(0,0,0,0.08);margin:18px 0;" />
        <h4>What testers use to switch roles</h4>
        <p class="muted-copy">
          Testers do <strong>not</strong> get this Admin View As screen.
          When <strong>Multi-role Switch View</strong> is enabled on their access (default for new testers),
          they see a <strong>Switch View</strong> control in the app header after they log into their own account —
          Owner / Director / Teacher / Assistant / Parent inside their sandbox only.
        </p>
        <p class="ota-email-unavailable" role="status">
          Never “sample” their invite link to try roles. That accepts into their program and any children you add stay there.
          If you already did that, open tester detail → <strong>Clear children (start empty)</strong> before they begin.
        </p>
      </section>
    `;
  }

  function paint() {
    ensureBanner();
    ensureViewAsBanner();
    const root = document.querySelector("#ownerTestingAdminApp");
    if (!root) return;
    captureFormDrafts();
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
          ["feedback", "Feedback"],
          ["audit", "Audit Log"],
        ].map(([id, label]) => `
          <button type="button" class="${state.tab === id ? "primary-button" : "ghost-button"}" data-ota-tab="${id}">${label}</button>
        `).join("")}
      </nav>
      ${state.toast ? `<p class="form-message" data-ota-toast role="status">${esc(state.toast)}</p>` : `<p class="form-message" data-ota-toast hidden></p>`}
      ${state.error ? `<p class="form-message" role="alert">${esc(state.error)}</p>` : ""}
      ${state.message ? `<p class="form-message" role="status">${esc(state.message)}</p>` : ""}
      ${state.loading ? `<p class="muted-copy">Loading…</p>` : ""}
      ${state.tab === "dashboard" ? dashboardHtml() : ""}
      ${state.tab === "testers" ? `${inviteAccessCardHtml(state.lastInvite)}${addTesterFormHtml()}${detailHtml()}${testersListHtml()}` : ""}
      ${state.tab === "programs" ? programsHtml() : ""}
      ${state.tab === "flags" ? flagsHtml() : ""}
      ${state.tab === "viewas" ? viewAsHtml() : ""}
      ${state.tab === "feedback" ? feedbackHtml() : ""}
      ${state.tab === "audit" ? auditHtml() : ""}
    `;
    bind(root);
    restoreFormDrafts();
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
        if (["dashboard", "testers", "programs", "flags", "audit", "feedback"].includes(state.tab)) loadAll();
      });
    });
    root.querySelectorAll("[data-ota-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-ota-goto") || "dashboard";
        state.message = "";
        const focusAdd = btn.hasAttribute("data-ota-focus-add");
        const focusProgram = btn.hasAttribute("data-ota-focus-create-program");
        paint();
        loadAll().then(() => {
          if (focusAdd) {
            document.querySelector("[data-ota-add-form] input[name='name']")?.focus();
            document.querySelector("[data-ota-add-panel]")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          if (focusProgram) {
            document.querySelector("[data-ota-create-program-form] input[name='programName']")?.focus();
            document.querySelector("[data-ota-create-program-panel]")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
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
    root.querySelector("[data-ota-feedback-status]")?.addEventListener("change", (event) => {
      state.feedbackStatus = event.target.value || "";
      loadAll();
    });
    root.querySelectorAll("[data-ota-open-tester]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = "testers";
        openDetail(btn.getAttribute("data-ota-open-tester"));
      });
    });
    root.querySelectorAll("[data-ota-open-program]").forEach((btn) => {
      btn.addEventListener("click", () => openProgram(btn.getAttribute("data-ota-open-program")));
    });
    root.querySelector("[data-ota-close-detail]")?.addEventListener("click", () => {
      state.selectedEmail = "";
      state.detail = null;
      paint();
    });
    root.querySelector("[data-ota-close-program]")?.addEventListener("click", () => {
      state.selectedProgramId = "";
      state.programDetail = null;
      paint();
    });
    root.querySelectorAll("[data-ota-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const text = btn.getAttribute("data-ota-copy") || "";
        try {
          await navigator.clipboard.writeText(text);
          showToast("Invite link copied — send it to your tester.");
        } catch {
          const area = root.querySelector("[data-ota-invite-textarea]") || btn.closest(".ota-invite-box")?.querySelector("textarea");
          if (area) {
            area.focus();
            area.select();
          }
          showToast("Select the link and copy it manually.");
        }
      });
    });

    const addForm = root.querySelector("[data-ota-add-form]");
    addForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const val = (name) => formControl(form, name)?.value || "";
      const checked = (name) => Boolean(formControl(form, name)?.checked);
      const body = {
        name: val("name"),
        email: val("email"),
        programName: val("programName"),
        programType: val("programType") || "home_daycare",
        role: val("role") || "owner",
        programMode: val("programMode") || "new",
        existingProgramId: val("existingProgramId"),
        testingCohort: val("testingCohort"),
        childName: val("childName") || "Demo Child",
        notes: val("notes"),
        activateNow: checked("activateNow"),
        createSampleData: checked("createSampleData"),
        sendEmail: checked("sendEmail"),
        features: readFeaturesFromForm(form),
        appOrigin: window.location.origin,
        adminEmail: typeof adminSession === "function" ? adminSession()?.email : "admin",
      };
      try {
        const result = await api("/api/admin/testing/testers", { method: "POST", body });
        const acceptUrl = result.acceptUrl || result.invite?.acceptUrl || "";
        state.lastInvite = acceptUrl ? {
          email: result.tester?.email || body.email,
          name: result.tester?.name || body.name,
          acceptUrl,
          programName: result.tester?.programName || body.programName,
          accountType: result.tester?.accountType || body.programType,
          role: result.tester?.role || body.role,
          emailSent: Boolean(result.email?.sent),
          emailError: result.email?.error || "",
          emailConfigured: result.email?.configured,
        } : null;
        state.addFormDraft = null;
        delete state.formDrafts.add;
        let msg = result.message || "Tester created.";
        if (acceptUrl) {
          msg = result.email?.sent
            ? "Tester created. Invite email sent — you can still Copy Invite Link below."
            : "Tester created. Email delivery unavailable on testing. Copy and send this invite link manually.";
        }
        if (result.temporaryPassword) {
          msg += " Temp password was generated (advanced) — prefer invite link for real testers.";
        }
        showMsg("[data-ota-add-message]", msg, true);
        state.message = msg;
        await loadAll({ force: true });
        if (result.tester?.email) await openDetail(result.tester.email);
        document.querySelector("[data-ota-invite-ready]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        showMsg("[data-ota-add-message]", error.message, false);
      }
    });

    const createProgramForm = root.querySelector("[data-ota-create-program-form]");
    createProgramForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const val = (name) => formControl(form, name)?.value || "";
      const checked = (name) => Boolean(formControl(form, name)?.checked);
      try {
        const result = await api("/api/admin/testing/programs", {
          method: "POST",
          body: {
            programName: val("programName"),
            programType: val("programType"),
            ownerEmail: val("ownerEmail"),
            testingCohort: val("testingCohort"),
            createSampleData: checked("createSampleData"),
            adminEmail: typeof adminSession === "function" ? adminSession()?.email : "admin",
          },
        });
        delete state.formDrafts["create-program"];
        showMsg("[data-ota-create-program-message]", result.message || "Program created.", true);
        await loadAll();
        if (result.program?.id) openProgram(result.program.id);
      } catch (error) {
        showMsg("[data-ota-create-program-message]", error.message, false);
      }
    });

    const editForm = root.querySelector("[data-ota-edit-form]");
    editForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const val = (name) => formControl(form, name)?.value || "";
      try {
        await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}`, {
          method: "PATCH",
          body: {
            role: val("role"),
            accountType: val("accountType"),
            testingCohort: val("testingCohort"),
            testingStatus: val("testingStatus"),
            notes: val("notes"),
            features: readFeaturesFromForm(form),
            adminEmail: typeof adminSession === "function" ? adminSession()?.email : "admin",
          },
        });
        delete state.formDrafts[`edit:${state.selectedEmail || ""}`];
        state.editFormDraft = null;
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
          body: { appOrigin: window.location.origin, sendEmail: false },
        });
        const acceptUrl = result.acceptUrl || "";
        if (acceptUrl) {
          state.lastInvite = {
            email: state.selectedEmail,
            name: state.detail?.tester?.name || state.selectedEmail,
            acceptUrl,
            programName: state.detail?.tester?.programName || "",
            accountType: state.detail?.tester?.accountType || "",
            role: state.detail?.tester?.role || "",
            emailSent: Boolean(result.email?.sent),
            emailError: result.email?.error || "",
          };
        }
        showMsg(
          "[data-ota-detail-message]",
          acceptUrl
            ? "Invite link regenerated. Email delivery unavailable on testing — Copy Invite Link and send it manually."
            : (result.message || "Invite updated."),
          true,
        );
        await openDetail(state.selectedEmail);
        showToast(acceptUrl ? "New invite link ready — copy it below." : "Invite updated.");
      } catch (error) {
        showMsg("[data-ota-detail-message]", error.message, false);
      }
    });

    root.querySelectorAll("[data-ota-feedback-set]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-ota-feedback-set");
        const status = btn.getAttribute("data-status");
        try {
          await api(`/api/admin/testing/feedback/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: { status },
          });
          await loadAll();
        } catch (error) {
          state.error = error.message;
          paint();
        }
      });
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
      const ok = window.confirm("Clear this tester's demo care logs (attendance/meals/naps/activities/reports)? Profiles/children are kept. Testing only.");
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

    root.querySelector("[data-ota-clear-children]")?.addEventListener("click", async () => {
      const ok = window.confirm(
        "Clear ALL children/profiles on this tester’s program so they start empty?\n\n"
        + "Use this if you sampled their invite link and added a child by mistake.\n"
        + "Care logs are also cleared. Testing only — cannot undo.",
      );
      if (!ok) return;
      try {
        const result = await api(`/api/admin/testing/testers/${encodeURIComponent(state.selectedEmail)}/reset-access`, {
          method: "PATCH",
          body: { mode: "children" },
        });
        showMsg("[data-ota-detail-message]", result.message || "Children cleared — tester starts empty.", true);
        await openDetail(state.selectedEmail);
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

    root.querySelectorAll("[data-ota-view-as-tester]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-ota-view-as-tester");
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
    ensureDraftListeners();
    captureFormDrafts();
    if (host.dataset.otaPreferredTab) {
      state.tab = host.dataset.otaPreferredTab;
    }
    ensureBanner();
    state.tab = state.tab || "dashboard";
    paint();
    if (isTestingHost() && adminToken()) loadAll();
  }

  window.OwnerTestingAdmin = {
    renderOwnerTestingAdmin,
    captureDraftsBeforeUnmount,
    ensureBanner,
    ensureViewAsBanner,
    loadAll,
    paint,
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureBanner();
    ensureViewAsBanner();
  });
})();
