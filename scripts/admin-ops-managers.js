/**
 * Testing-only Admin Depth managers: Programs, Staff, Children, Families.
 * Fenced by isHomeDaycareHubTestingEnabled() — never used on production.
 */
(function initAdminOpsManagers(global) {
  const STATE_KEY = "llhAdminOpsManagersUi_v1";

  const state = {
    bundle: null,
    loading: false,
    error: "",
    ownerEmail: "",
    search: { programs: "", staff: "", children: "", families: "" },
    filter: { programs: "all", staff: "all", children: "all", families: "all" },
    selected: { programs: "", staff: "", children: "", families: "" },
    panel: { programs: "overview", staff: "overview", children: "overview", families: "overview" },
    selectedIds: { staff: new Set(), children: new Set(), families: new Set(), waitlist: new Set() },
    message: "",
  };

  function isTestingAdmin() {
    return typeof global.isHomeDaycareHubTestingEnabled === "function"
      && global.isHomeDaycareHubTestingEnabled();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function adminToken() {
    try {
      const raw = localStorage.getItem("llhAdminSession");
      const session = raw ? JSON.parse(raw) : null;
      return session?.token || "";
    } catch (_error) {
      return "";
    }
  }

  function adminSessionEmail() {
    try {
      const raw = localStorage.getItem("llhAdminSession");
      const session = raw ? JSON.parse(raw) : null;
      return String(session?.email || "").trim().toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  function readUiPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
      if (raw && typeof raw === "object") {
        if (raw.ownerEmail) state.ownerEmail = String(raw.ownerEmail);
        if (raw.panel) Object.assign(state.panel, raw.panel);
      }
    } catch (_error) { /* ignore */ }
  }

  function writeUiPrefs() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        ownerEmail: state.ownerEmail,
        panel: state.panel,
      }));
    } catch (_error) { /* ignore */ }
  }

  function statusPill(label, tone = "neutral") {
    return `<span class="admin-ops-pill admin-ops-pill--${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function toneForStatus(value) {
    const v = String(value || "").toLowerCase();
    if (/active|enrolled|present|complete|clear|ready|ok|approved|signed/.test(v)) return "ok";
    if (/pending|wait|invited|requested|review|expir|due|needed|draft/.test(v)) return "warn";
    if (/inactive|absent|expired|revoked|denied|missing|risk|failed/.test(v)) return "bad";
    return "neutral";
  }

  function shortDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "—";
    return raw.slice(0, 10);
  }

  function daysUntil(value) {
    const t = Date.parse(value || "");
    if (!Number.isFinite(t)) return null;
    return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
  }

  function pageHeading(eyebrow, title, detail, actionsHtml = "") {
    return `
      <header class="admin-cc-page-heading">
        <div>
          <p class="admin-cc-kicker">${escapeHtml(eyebrow)}</p>
          <h2>${escapeHtml(title)}</h2>
          <p class="admin-cc-lede">${detail}</p>
        </div>
        ${actionsHtml ? `<div class="admin-cc-heading-actions">${actionsHtml}</div>` : ""}
      </header>
    `;
  }

  async function fetchBundle(ownerEmail) {
    const token = adminToken();
    if (!token) throw new Error("Unlock Admin to load program managers.");
    const email = encodeURIComponent(ownerEmail || adminSessionEmail());
    const response = await fetch(`/api/admin/ops-managers?ownerEmail=${email}&_=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Could not load ops managers (${response.status})`);
    return data;
  }

  async function saveOps(patch, logActivity) {
    const token = adminToken();
    if (!token) throw new Error("Unlock Admin to save.");
    const response = await fetch("/api/admin/ops-managers", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ownerEmail: state.ownerEmail || adminSessionEmail(),
        ...patch,
        logActivity: logActivity || undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "Could not save.");
    if (state.bundle) state.bundle.ops = data.ops || state.bundle.ops;
    return data;
  }

  async function ensureBundle(force) {
    if (!force && state.bundle && !state.loading) return state.bundle;
    state.loading = true;
    state.error = "";
    try {
      readUiPrefs();
      if (!state.ownerEmail) state.ownerEmail = adminSessionEmail();
      state.bundle = await fetchBundle(state.ownerEmail);
      if (!state.ownerEmail) state.ownerEmail = state.bundle.ownerEmail || adminSessionEmail();
      writeUiPrefs();
      return state.bundle;
    } catch (error) {
      state.error = error.message || "Could not load managers.";
      throw error;
    } finally {
      state.loading = false;
    }
  }

  function programOptionsHtml() {
    const programs = state.bundle?.programs || [];
    if (!programs.length) {
      return `<option value="${escapeHtml(state.ownerEmail)}">${escapeHtml(state.ownerEmail || "Current program")}</option>`;
    }
    return programs.map((p) => `
      <option value="${escapeHtml(p.ownerEmail)}" ${p.ownerEmail === state.ownerEmail ? "selected" : ""}>
        ${escapeHtml(p.programName || p.ownerEmail)} (${escapeHtml(p.ownerEmail)})
      </option>
    `).join("");
  }

  function toolbarHtml(area, options = {}) {
    const filters = options.filters || [
      { value: "all", label: "All" },
    ];
    return `
      <div class="admin-ops-toolbar">
        <label class="admin-ops-search">
          <span>Search</span>
          <input type="search" data-ops-search="${area}" value="${escapeHtml(state.search[area] || "")}" placeholder="${escapeHtml(options.placeholder || "Search…")}" />
        </label>
        <label class="admin-ops-filter">
          <span>Filter</span>
          <select data-ops-filter="${area}">
            ${filters.map((f) => `<option value="${escapeHtml(f.value)}" ${state.filter[area] === f.value ? "selected" : ""}>${escapeHtml(f.label)}</option>`).join("")}
          </select>
        </label>
        <label class="admin-ops-filter admin-ops-owner">
          <span>Program</span>
          <select data-ops-owner>
            ${programOptionsHtml()}
          </select>
        </label>
        <div class="admin-ops-toolbar-actions">
          ${options.bulkHtml || ""}
          <button type="button" class="ghost-button" data-ops-refresh="${area}">Refresh</button>
        </div>
      </div>
      ${state.message ? `<p class="admin-ops-flash" role="status">${escapeHtml(state.message)}</p>` : ""}
    `;
  }

  function activityListHtml(items, empty = "No recent activity yet.") {
    const list = Array.isArray(items) ? items.slice(0, 12) : [];
    if (!list.length) return `<p class="muted-copy">${escapeHtml(empty)}</p>`;
    return `
      <ul class="admin-ops-activity">
        ${list.map((item) => `
          <li>
            <strong>${escapeHtml(item.action || "Update")}</strong>
            <span>${escapeHtml(shortDate(item.at))} · ${escapeHtml(item.area || "ops")}</span>
            ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
          </li>
        `).join("")}
      </ul>
    `;
  }

  function metricStrip(items) {
    return `
      <section class="admin-ops-metrics" aria-label="Snapshot">
        ${items.map((item) => `
          <article class="admin-ops-metric">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            <small>${escapeHtml(item.detail || "")}</small>
          </article>
        `).join("")}
      </section>
    `;
  }

  function quickActionsHtml(actions) {
    return `
      <div class="admin-ops-quick">
        ${actions.map((action) => {
          if (action.tab) {
            return `<button type="button" class="admin-cc-quick" data-admin-section-tab="${escapeHtml(action.tab)}" ${action.focus ? `data-admin-cc-focus="${escapeHtml(action.focus)}"` : ""}>${escapeHtml(action.label)}</button>`;
          }
          return `<button type="button" class="admin-cc-quick" data-ops-action="${escapeHtml(action.action)}" ${action.id ? `data-ops-id="${escapeHtml(action.id)}"` : ""}>${escapeHtml(action.label)}</button>`;
        }).join("")}
      </div>
    `;
  }

  function emptyState(title, detail) {
    return `
      <div class="admin-ops-empty">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
    `;
  }

  function loadingHtml(targetLabel) {
    return `
      ${pageHeading("Programs", targetLabel, "Loading live program data for this testing sandbox…")}
      <div class="admin-cc-panel"><p class="muted-copy">Loading…</p></div>
    `;
  }

  function errorHtml(targetLabel, error) {
    return `
      ${pageHeading("Programs", targetLabel, "Could not load this manager.")}
      <div class="admin-cc-panel">
        <p class="muted-copy">${escapeHtml(error)}</p>
        <button type="button" class="primary-button" data-ops-refresh="programs">Retry</button>
      </div>
    `;
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function childAttendanceStatus(child, attendance) {
    const today = todayKey();
    const rows = (attendance || []).filter((a) => String(a.childId) === String(child.id) && String(a.date || "").slice(0, 10) === today);
    const row = rows[rows.length - 1];
    if (!row) return "not_arrived";
    if (/absent/i.test(String(row.status || ""))) return "absent";
    if (row.pickup) return "checked_out";
    return "checked_in";
  }

  function familyHubForChild(childId) {
    const households = state.bundle?.families?.households || [];
    return households.find((h) => (h.childIds || []).map(String).includes(String(childId))
      || (h.children || []).some((c) => String(c.id) === String(childId))) || null;
  }

  function softHouseholdsFromChildren(profiles) {
    const map = new Map();
    (profiles || []).forEach((child) => {
      if (!child || child.archived) return;
      const key = String(child.parentInfo || child.familyKey || child.id || "").trim().toLowerCase() || String(child.id);
      if (!map.has(key)) {
        map.set(key, {
          id: `soft-${key}`,
          label: child.parentInfo || "Family",
          parentInfo: child.parentInfo || "",
          email: "",
          phone: "",
          children: [],
          status: "profile-linked",
          soft: true,
        });
      }
      map.get(key).children.push({ id: child.id, name: child.name || "Child" });
    });
    return Array.from(map.values());
  }

  /* ── Programs ─────────────────────────────────────────────────────────── */

  function renderProgramsManager(target) {
    if (!target || !isTestingAdmin()) return;
    target.innerHTML = loadingHtml("Programs");
    ensureBundle(false)
      .then(() => paintPrograms(target))
      .catch((error) => {
        target.innerHTML = errorHtml("Programs", error.message || state.error);
        bindCommon(target, "programs");
      });
  }

  function paintPrograms(target) {
    const bundle = state.bundle;
    const programs = (bundle.programs || []).filter((p) => {
      const q = state.search.programs.trim().toLowerCase();
      if (q && !`${p.programName} ${p.ownerEmail} ${p.programType}`.toLowerCase().includes(q)) return false;
      if (state.filter.programs === "with-children" && !(p.childCount > 0)) return false;
      if (state.filter.programs === "with-staff" && !(p.staffCount > 1)) return false;
      return true;
    });
    const selected = programs.find((p) => p.ownerEmail === state.ownerEmail) || programs[0] || {
      ownerEmail: bundle.ownerEmail,
      programName: bundle.program?.name,
      childCount: (bundle.children?.profiles || []).filter((c) => !c.archived).length,
      staffCount: (bundle.staff?.members || []).length + 1,
      pendingInvites: (bundle.staff?.invites || []).filter((i) => i.status === "pending").length,
      familyHubCount: (bundle.families?.households || []).length,
      programType: bundle.program?.settings?.programType || bundle.program?.accountType || "",
      plan: bundle.program?.plan || "",
    };
    state.ownerEmail = selected.ownerEmail || state.ownerEmail;
    const settings = bundle.program?.settings || {};
    const ops = bundle.ops || defaultLocalOps();
    const profiles = (bundle.children?.profiles || []).filter((c) => !c.archived);
    const enrolled = profiles.filter((c) => !/wait|inquiry|lead/i.test(String(c.enrollmentStatus || c.status || "enrolled")));
    const capacity = Number(ops.capacity?.licensedCapacity || 0);
    const openSlots = capacity ? Math.max(0, capacity - enrolled.length) : "—";
    const waitlist = ops.waitlist || [];
    const panel = state.panel.programs || "overview";

    target.innerHTML = `
      ${pageHeading(
        "Programs",
        "Program manager",
        "Settings, licensing, capacity, enrollment, and waitlist for the selected testing program.",
        `<button type="button" class="ghost-button" data-admin-section-tab="staff">Staff</button>
         <button type="button" class="ghost-button" data-admin-section-tab="admin-children">Children</button>
         <button type="button" class="primary-button" data-ops-action="save-program-settings">Save settings</button>`,
      )}
      ${toolbarHtml("programs", {
        placeholder: "Search programs…",
        filters: [
          { value: "all", label: "All programs" },
          { value: "with-children", label: "Has children" },
          { value: "with-staff", label: "Has staff" },
        ],
      })}
      ${metricStrip([
        { label: "Enrolled", value: String(enrolled.length), detail: "Active child profiles" },
        { label: "Capacity", value: capacity ? String(capacity) : "Not set", detail: "Licensed seats" },
        { label: "Open slots", value: String(openSlots), detail: capacity ? "Licensed − enrolled" : "Set capacity" },
        { label: "Waitlist", value: String(waitlist.filter((w) => w.status !== "enrolled").length), detail: "Active leads" },
        { label: "Staff", value: String(selected.staffCount || 0), detail: `${selected.pendingInvites || 0} pending invites` },
        { label: "Family Hub", value: String(selected.familyHubCount || 0), detail: "Household logins" },
      ])}
      <div class="admin-ops-layout">
        <section class="admin-ops-list-panel">
          <h3>Programs</h3>
          <div class="admin-ops-table-wrap">
            <table class="admin-ops-table">
              <thead>
                <tr><th>Program</th><th>Type</th><th>Children</th><th>Staff</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${programs.map((p) => `
                  <tr class="${p.ownerEmail === state.ownerEmail ? "is-selected" : ""}" data-ops-select-program="${escapeHtml(p.ownerEmail)}">
                    <td>
                      <strong>${escapeHtml(p.programName || "Program")}</strong>
                      <div class="admin-ops-sub">${escapeHtml(p.ownerEmail)}</div>
                    </td>
                    <td>${escapeHtml(p.programType || "—")}</td>
                    <td>${escapeHtml(String(p.childCount || 0))}</td>
                    <td>${escapeHtml(String(p.staffCount || 0))}</td>
                    <td>${statusPill(p.plan || "active", "ok")}</td>
                  </tr>
                `).join("") || `<tr><td colspan="5">${emptyState("No programs found", "Seed demo data from Testing Center or create a provider account.")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
        <section class="admin-ops-detail-panel">
          <div class="admin-ops-tabs" role="tablist">
            ${["overview", "settings", "licensing", "capacity", "enrollment", "waitlist", "stats"].map((tab) => `
              <button type="button" class="admin-ops-tab ${panel === tab ? "is-active" : ""}" data-ops-panel="programs" data-ops-panel-value="${tab}">${tab[0].toUpperCase()}${tab.slice(1)}</button>
            `).join("")}
          </div>
          <div class="admin-ops-detail-body">
            ${paintProgramPanel(panel, { selected, settings, ops, profiles, enrolled, waitlist, capacity, openSlots, bundle })}
          </div>
        </section>
      </div>
    `;
    bindCommon(target, "programs");
  }

  function defaultLocalOps() {
    return {
      capacity: { licensedCapacity: 0, agesServed: "", notes: "" },
      licensing: { licenseNumber: "", authority: "", expiresAt: "", status: "unknown", notes: "" },
      waitlist: [],
      staffCompliance: {},
      activity: [],
    };
  }

  function paintProgramPanel(panel, ctx) {
    const { selected, settings, ops, profiles, enrolled, waitlist, capacity, openSlots, bundle } = ctx;
    if (panel === "settings") {
      return `
        <form class="admin-ops-form" data-ops-form="program-settings">
          <label>Program name<input name="programName" value="${escapeHtml(settings.programName || selected.programName || "")}" /></label>
          <label>Program type
            <select name="programType">
              ${["Home daycare", "Family childcare", "Childcare center", "Preschool classroom"].map((t) => `
                <option value="${escapeHtml(t)}" ${(settings.programType || "") === t ? "selected" : ""}>${escapeHtml(t)}</option>
              `).join("")}
            </select>
          </label>
          <label>Phone<input name="phone" value="${escapeHtml(settings.phone || "")}" /></label>
          <label>Address<input name="address" value="${escapeHtml(settings.address || "")}" /></label>
          <label>City<input name="city" value="${escapeHtml(settings.city || "")}" /></label>
          <label>State<input name="state" value="${escapeHtml(settings.state || "")}" /></label>
          <label>Communication tone<input name="communicationTone" value="${escapeHtml(settings.communicationTone || "Warm and friendly")}" /></label>
          <p class="muted-copy">Settings save into Admin ops notes for this sandbox owner when member Program Settings are not open. Use related Staff / Children tools for day-to-day work.</p>
          <button type="submit" class="primary-button">Save program settings</button>
        </form>
        ${quickActionsHtml([
          { tab: "staff", label: "Manage staff" },
          { tab: "admin-children", label: "Manage children" },
          { tab: "admin-families", label: "Manage families" },
          { tab: "forms-ai-builder", label: "AI form shortcut" },
        ])}
      `;
    }
    if (panel === "licensing") {
      const lic = ops.licensing || {};
      const days = daysUntil(lic.expiresAt);
      const tone = days == null ? "neutral" : days < 0 ? "bad" : days < 60 ? "warn" : "ok";
      return `
        <form class="admin-ops-form" data-ops-form="licensing">
          <div class="admin-ops-inline-status">${statusPill(lic.status || "unknown", toneForStatus(lic.status))} ${days != null ? statusPill(days < 0 ? "Expired" : `${days} days left`, tone) : ""}</div>
          <label>License number<input name="licenseNumber" value="${escapeHtml(lic.licenseNumber || "")}" /></label>
          <label>Licensing authority<input name="authority" value="${escapeHtml(lic.authority || "")}" /></label>
          <label>Expires<input name="expiresAt" type="date" value="${escapeHtml(shortDate(lic.expiresAt) === "—" ? "" : shortDate(lic.expiresAt))}" /></label>
          <label>Status
            <select name="status">
              ${["unknown", "active", "pending", "expired", "probation"].map((s) => `<option value="${s}" ${(lic.status || "unknown") === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </label>
          <label>Notes<textarea name="notes" rows="3">${escapeHtml(lic.notes || "")}</textarea></label>
          <button type="submit" class="primary-button">Save licensing</button>
        </form>
      `;
    }
    if (panel === "capacity") {
      return `
        <form class="admin-ops-form" data-ops-form="capacity">
          <label>Licensed capacity<input name="licensedCapacity" type="number" min="0" value="${escapeHtml(String(ops.capacity?.licensedCapacity || 0))}" /></label>
          <label>Ages served<input name="agesServed" value="${escapeHtml(ops.capacity?.agesServed || "")}" placeholder="e.g. 6 weeks – 5 years" /></label>
          <label>Notes<textarea name="notes" rows="3">${escapeHtml(ops.capacity?.notes || "")}</textarea></label>
          <p class="muted-copy">Enrolled now: <strong>${enrolled.length}</strong> · Open slots: <strong>${escapeHtml(String(openSlots))}</strong></p>
          <button type="submit" class="primary-button">Save capacity</button>
        </form>
      `;
    }
    if (panel === "enrollment") {
      return `
        <div class="admin-ops-table-wrap">
          <table class="admin-ops-table">
            <thead><tr><th>Child</th><th>Classroom</th><th>Status</th><th>Family</th><th></th></tr></thead>
            <tbody>
              ${profiles.map((child) => `
                <tr>
                  <td><strong>${escapeHtml(child.name || "Child")}</strong></td>
                  <td>${escapeHtml(child.classroomName || child.classroom || child.classroomId || "—")}</td>
                  <td>${statusPill(child.enrollmentStatus || child.status || "enrolled", toneForStatus(child.enrollmentStatus || child.status || "enrolled"))}</td>
                  <td>${escapeHtml(child.parentInfo || "—")}</td>
                  <td><button type="button" class="ghost-button" data-admin-section-tab="admin-children" data-ops-select-child="${escapeHtml(child.id)}">Open</button></td>
                </tr>
              `).join("") || `<tr><td colspan="5">${emptyState("No enrolled children", "Seed demo children from Testing Center.")}</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }
    if (panel === "waitlist") {
      return `
        <form class="admin-ops-form admin-ops-inline-form" data-ops-form="waitlist-add">
          <label>Child name<input name="childName" required placeholder="Child name" /></label>
          <label>Guardian<input name="guardianName" placeholder="Guardian" /></label>
          <label>Email<input name="email" type="email" placeholder="parent@email.com" /></label>
          <label>Desired start<input name="desiredStart" type="date" /></label>
          <label>Classroom<input name="classroom" placeholder="Infant / Toddler…" /></label>
          <button type="submit" class="primary-button">Add to waitlist</button>
        </form>
        <div class="admin-ops-bulk-row">
          <button type="button" class="ghost-button" data-ops-action="waitlist-mark-contacted">Mark contacted</button>
          <button type="button" class="ghost-button" data-ops-action="waitlist-remove-selected">Remove selected</button>
        </div>
        <div class="admin-ops-table-wrap">
          <table class="admin-ops-table">
            <thead><tr><th></th><th>Child</th><th>Guardian</th><th>Start</th><th>Status</th><th>Classroom</th></tr></thead>
            <tbody>
              ${waitlist.map((item) => `
                <tr>
                  <td><input type="checkbox" data-ops-check="waitlist" value="${escapeHtml(item.id)}" /></td>
                  <td><strong>${escapeHtml(item.childName)}</strong><div class="admin-ops-sub">${escapeHtml(item.email || item.phone || "")}</div></td>
                  <td>${escapeHtml(item.guardianName || "—")}</td>
                  <td>${escapeHtml(shortDate(item.desiredStart))}</td>
                  <td>${statusPill(item.status || "waiting", toneForStatus(item.status))}</td>
                  <td>${escapeHtml(item.classroom || "—")}</td>
                </tr>
              `).join("") || `<tr><td colspan="6">${emptyState("Waitlist is empty", "Add families waiting for a seat.")}</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }
    if (panel === "stats") {
      const rooms = bundle.classrooms || [];
      return `
        <div class="admin-ops-stats-grid">
          <article><h4>Enrollment</h4><p>${enrolled.length} enrolled · ${waitlist.length} waitlist · capacity ${capacity || "unset"}</p></article>
          <article><h4>Classrooms</h4><p>${rooms.length || 0} rooms configured</p><ul>${rooms.slice(0, 8).map((r) => `<li>${escapeHtml(r.name || r.id)}</li>`).join("") || "<li>None yet</li>"}</ul></article>
          <article><h4>Family Hub</h4><p>${(bundle.families?.households || []).length} household logins</p></article>
          <article><h4>Licensing</h4><p>${escapeHtml(ops.licensing?.status || "unknown")} · expires ${escapeHtml(shortDate(ops.licensing?.expiresAt))}</p></article>
        </div>
        <h4>Recent activity</h4>
        ${activityListHtml(ops.activity)}
      `;
    }
    // overview
    return `
      <div class="admin-ops-overview">
        <p><strong>${escapeHtml(selected.programName || "Program")}</strong> · ${escapeHtml(selected.ownerEmail || "")}</p>
        <p class="muted-copy">${escapeHtml(settings.programType || selected.programType || "Program")} · ${escapeHtml(settings.city || "")} ${escapeHtml(settings.state || "")}</p>
        ${statusPill(ops.licensing?.status || "licensing unknown", toneForStatus(ops.licensing?.status))}
        ${capacity ? statusPill(`${openSlots} open of ${capacity}`, openSlots === 0 ? "warn" : "ok") : statusPill("Capacity not set", "warn")}
        <h4>Quick actions</h4>
        ${quickActionsHtml([
          { action: "panel-programs-waitlist", label: "Open waitlist" },
          { action: "panel-programs-capacity", label: "Edit capacity" },
          { action: "panel-programs-licensing", label: "Licensing" },
          { tab: "staff", label: "Staff" },
          { tab: "admin-children", label: "Children" },
          { tab: "admin-families", label: "Families" },
          { tab: "forms-center", label: "Forms Center" },
          { tab: "forms-ai-builder", label: "AI documentation" },
          { tab: "dashboard", label: "Seed demo data", focus: "view-as" },
        ])}
        <h4>Related records</h4>
        <ul class="admin-ops-related">
          <li>${enrolled.length} enrolled children</li>
          <li>${(bundle.staff?.members || []).length} active staff members</li>
          <li>${(bundle.families?.households || []).length} Family Hub households</li>
          <li>${(bundle.classrooms || []).length} classrooms</li>
        </ul>
        <h4>Recent activity</h4>
        ${activityListHtml(ops.activity)}
      </div>
    `;
  }

  /* ── Staff ────────────────────────────────────────────────────────────── */

  function renderStaffManager(target) {
    if (!target || !isTestingAdmin()) return;
    target.innerHTML = loadingHtml("Staff");
    ensureBundle(false)
      .then(() => paintStaff(target))
      .catch((error) => {
        target.innerHTML = errorHtml("Staff", error.message || state.error);
        bindCommon(target, "staff");
      });
  }

  function staffRows(bundle) {
    const ops = bundle.ops || defaultLocalOps();
    const compliance = ops.staffCompliance || {};
    const trainings = bundle.staff?.trainings || [];
    const ownerEmail = bundle.ownerEmail;
    const rows = [];
    rows.push({
      id: `member:${ownerEmail}`,
      email: ownerEmail,
      name: "Program owner",
      role: "owner",
      status: "active",
      classroomName: "",
      kind: "member",
      joinedAt: "",
    });
    (bundle.staff?.members || []).forEach((m) => {
      rows.push({
        id: `member:${m.email}`,
        email: m.email,
        name: m.name || m.email,
        role: m.role || "teacher",
        status: "active",
        classroomName: m.classroomName || "",
        classroomId: m.classroomId || "",
        kind: "member",
        joinedAt: m.joinedAt || "",
      });
    });
    (bundle.staff?.invites || []).forEach((inv) => {
      rows.push({
        id: `invite:${inv.id}`,
        email: inv.email,
        name: inv.email,
        role: inv.role || "teacher",
        status: inv.status || "pending",
        classroomName: inv.classroomName || "",
        classroomId: inv.classroomId || "",
        kind: "invite",
        joinedAt: inv.invitedAt || "",
        inviteId: inv.id,
      });
    });
    return rows.map((row) => {
      const c = compliance[String(row.email || "").toLowerCase()] || {};
      const staffTrainings = trainings.filter((t) => String(t.staffEmail || "").toLowerCase() === String(row.email || "").toLowerCase());
      const cpr = staffTrainings.find((t) => /cpr/i.test(String(t.type || "")));
      const expiredTraining = staffTrainings.find((t) => t.expired);
      return {
        ...row,
        compliance: c,
        trainings: staffTrainings,
        cprExpiresAt: cpr?.expiresAt || "",
        cprExpired: Boolean(cpr?.expired),
        hasExpiredTraining: Boolean(expiredTraining),
        backgroundCheckStatus: c.backgroundCheckStatus || "unknown",
        timeOff: Array.isArray(c.timeOff) ? c.timeOff : [],
      };
    });
  }

  function paintStaff(target) {
    const bundle = state.bundle;
    let rows = staffRows(bundle);
    const q = state.search.staff.trim().toLowerCase();
    if (q) rows = rows.filter((r) => `${r.name} ${r.email} ${r.role} ${r.classroomName}`.toLowerCase().includes(q));
    if (state.filter.staff === "pending") rows = rows.filter((r) => r.status === "pending");
    if (state.filter.staff === "active") rows = rows.filter((r) => r.status === "active");
    if (state.filter.staff === "expiring") {
      rows = rows.filter((r) => r.cprExpired || r.hasExpiredTraining || /expired|due/i.test(r.backgroundCheckStatus)
        || (daysUntil(r.cprExpiresAt) != null && daysUntil(r.cprExpiresAt) < 45)
        || (daysUntil(r.compliance.backgroundCheckExpiresAt) != null && daysUntil(r.compliance.backgroundCheckExpiresAt) < 45));
    }
    const selectedId = state.selected.staff || rows[0]?.id || "";
    state.selected.staff = selectedId;
    const selected = rows.find((r) => r.id === selectedId) || rows[0] || null;
    const panel = state.panel.staff || "overview";
    const rooms = bundle.classrooms || [];

    target.innerHTML = `
      ${pageHeading(
        "Programs",
        "Staff manager",
        "Roles, classroom assignments, training, certifications, CPR, background checks, and time off.",
        `<button type="button" class="ghost-button" data-admin-section-tab="programs">Programs</button>
         <button type="button" class="primary-button" data-ops-action="staff-add-training">Log training</button>`,
      )}
      ${toolbarHtml("staff", {
        placeholder: "Search staff…",
        filters: [
          { value: "all", label: "All staff" },
          { value: "active", label: "Active" },
          { value: "pending", label: "Pending invites" },
          { value: "expiring", label: "Expiring / overdue" },
        ],
        bulkHtml: `
          <button type="button" class="ghost-button" data-ops-action="staff-bulk-remind">Remind selected</button>
          <button type="button" class="ghost-button" data-ops-action="staff-bulk-clear-check">Mark BG clear</button>
        `,
      })}
      ${metricStrip([
        { label: "Active", value: String(rows.filter((r) => r.status === "active").length), detail: "Owner + members" },
        { label: "Pending", value: String(rows.filter((r) => r.status === "pending").length), detail: "Invites" },
        { label: "CPR risk", value: String(rows.filter((r) => r.cprExpired || (daysUntil(r.cprExpiresAt) != null && daysUntil(r.cprExpiresAt) < 30)).length), detail: "Expired or under 30 days" },
        { label: "BG checks", value: String(rows.filter((r) => /clear|complete/i.test(r.backgroundCheckStatus)).length), detail: "Marked clear" },
        { label: "Time off", value: String(rows.reduce((n, r) => n + r.timeOff.filter((t) => t.status !== "denied").length, 0)), detail: "Open requests" },
      ])}
      <div class="admin-ops-layout">
        <section class="admin-ops-list-panel">
          <div class="admin-ops-table-wrap">
            <table class="admin-ops-table">
              <thead><tr><th></th><th>Staff</th><th>Role</th><th>Classroom</th><th>Status</th><th>CPR</th></tr></thead>
              <tbody>
                ${rows.map((row) => `
                  <tr class="${row.id === selectedId ? "is-selected" : ""}" data-ops-select-staff="${escapeHtml(row.id)}">
                    <td><input type="checkbox" data-ops-check="staff" value="${escapeHtml(row.email)}" /></td>
                    <td><strong>${escapeHtml(row.name || row.email)}</strong><div class="admin-ops-sub">${escapeHtml(row.email)}</div></td>
                    <td>${escapeHtml(row.role)}</td>
                    <td>${escapeHtml(row.classroomName || "Unassigned")}</td>
                    <td>${statusPill(row.status, toneForStatus(row.status))}</td>
                    <td>${row.cprExpiresAt ? statusPill(shortDate(row.cprExpiresAt), row.cprExpired ? "bad" : "ok") : statusPill("Missing", "warn")}</td>
                  </tr>
                `).join("") || `<tr><td colspan="6">${emptyState("No staff yet", "Invite staff from the member Staff page or Testing Center.")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
        <section class="admin-ops-detail-panel">
          <div class="admin-ops-tabs">
            ${["overview", "roles", "assignments", "training", "compliance", "timeoff", "history"].map((tab) => `
              <button type="button" class="admin-ops-tab ${panel === tab ? "is-active" : ""}" data-ops-panel="staff" data-ops-panel-value="${tab}">${tab === "timeoff" ? "Time off" : tab[0].toUpperCase() + tab.slice(1)}</button>
            `).join("")}
          </div>
          <div class="admin-ops-detail-body">
            ${selected ? paintStaffPanel(panel, selected, { rooms, bundle }) : emptyState("Select a staff member", "Choose someone from the list.")}
          </div>
        </section>
      </div>
    `;
    bindCommon(target, "staff");
  }

  function paintStaffPanel(panel, person, ctx) {
    const { rooms, bundle } = ctx;
    const c = person.compliance || {};
    if (panel === "roles") {
      return `
        <p><strong>${escapeHtml(person.name || person.email)}</strong></p>
        <p>Current role: ${statusPill(person.role, "neutral")}</p>
        <p class="muted-copy">Permissions by role</p>
        <ul class="admin-ops-related">
          <li><strong>Owner</strong> — billing, staff invites, full program data</li>
          <li><strong>Director</strong> — staff invites, classrooms, children, Family Hub</li>
          <li><strong>Teacher</strong> — assigned classroom children, logs, curriculum</li>
          <li><strong>Assistant</strong> — supporting access in assigned rooms</li>
        </ul>
        <label class="admin-ops-form-field">Permissions notes
          <textarea data-ops-field="permissionsNotes" rows="3">${escapeHtml(c.permissionsNotes || "")}</textarea>
        </label>
        <button type="button" class="primary-button" data-ops-action="staff-save-compliance" data-ops-id="${escapeHtml(person.email)}">Save permissions notes</button>
        ${quickActionsHtml([
          { tab: "dashboard", label: "Multi-Role Tester", focus: "view-as" },
          { tab: "users", label: "Open Users" },
        ])}
      `;
    }
    if (panel === "assignments") {
      return `
        <p>Classroom: <strong>${escapeHtml(person.classroomName || "Unassigned")}</strong></p>
        <p class="muted-copy">Assignments come from staff invites / member records. Rooms available on this program:</p>
        <ul class="admin-ops-related">
          ${(rooms || []).map((r) => `<li>${escapeHtml(r.name || r.id)}${String(r.id) === String(person.classroomId) ? " · current" : ""}</li>`).join("") || "<li>No classrooms yet</li>"}
        </ul>
        ${quickActionsHtml([
          { tab: "admin-classrooms", label: "Classrooms" },
          { tab: "admin-children", label: "Children by room" },
        ])}
      `;
    }
    if (panel === "training") {
      return `
        <form class="admin-ops-form" data-ops-form="staff-training" data-ops-id="${escapeHtml(person.email)}">
          <label>Type
            <select name="type">
              ${["CPR", "First Aid", "Bloodborne Pathogens", "Safe Sleep", "Child Abuse Prevention", "Other"].map((t) => `<option value="${t}">${t}</option>`).join("")}
            </select>
          </label>
          <label>Completed<input name="completedAt" type="date" value="${escapeHtml(todayKey())}" /></label>
          <label>Expires<input name="expiresAt" type="date" /></label>
          <label>Notes<input name="notes" /></label>
          <button type="submit" class="primary-button">Save training (local ops log)</button>
        </form>
        <div class="admin-ops-table-wrap">
          <table class="admin-ops-table">
            <thead><tr><th>Type</th><th>Completed</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              ${(person.trainings || []).map((t) => `
                <tr>
                  <td>${escapeHtml(t.type)}</td>
                  <td>${escapeHtml(shortDate(t.completedAt))}</td>
                  <td>${escapeHtml(shortDate(t.expiresAt))}</td>
                  <td>${statusPill(t.expired ? "expired" : "valid", t.expired ? "bad" : "ok")}</td>
                </tr>
              `).join("") || `<tr><td colspan="4">No trainings logged yet.</td></tr>`}
            </tbody>
          </table>
        </div>
        <p class="muted-copy">CPR expiration: ${person.cprExpiresAt ? escapeHtml(shortDate(person.cprExpiresAt)) : "not recorded"}</p>
      `;
    }
    if (panel === "compliance") {
      return `
        <form class="admin-ops-form" data-ops-form="staff-compliance" data-ops-id="${escapeHtml(person.email)}">
          <label>Background check status
            <select name="backgroundCheckStatus">
              ${["unknown", "clear", "pending", "expired", "needs_renewal"].map((s) => `<option value="${s}" ${(person.backgroundCheckStatus || "unknown") === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </label>
          <label>BG check expires<input name="backgroundCheckExpiresAt" type="date" value="${escapeHtml(shortDate(c.backgroundCheckExpiresAt) === "—" ? "" : shortDate(c.backgroundCheckExpiresAt))}" /></label>
          <label>Notes<textarea name="notes" rows="3">${escapeHtml(c.notes || "")}</textarea></label>
          <button type="submit" class="primary-button">Save compliance</button>
        </form>
        ${statusPill(`Certifications: ${(person.trainings || []).length}`, "neutral")}
        ${statusPill(`CPR: ${person.cprExpiresAt ? shortDate(person.cprExpiresAt) : "missing"}`, person.cprExpired ? "bad" : person.cprExpiresAt ? "ok" : "warn")}
      `;
    }
    if (panel === "timeoff") {
      return `
        <form class="admin-ops-form" data-ops-form="staff-timeoff" data-ops-id="${escapeHtml(person.email)}">
          <label>Start<input name="startDate" type="date" required /></label>
          <label>End<input name="endDate" type="date" required /></label>
          <label>Status
            <select name="status">
              <option value="requested">requested</option>
              <option value="approved">approved</option>
              <option value="denied">denied</option>
            </select>
          </label>
          <label>Notes<input name="notes" /></label>
          <button type="submit" class="primary-button">Add time off</button>
        </form>
        <ul class="admin-ops-activity">
          ${(person.timeOff || []).map((t) => `
            <li>
              <strong>${escapeHtml(shortDate(t.startDate))} → ${escapeHtml(shortDate(t.endDate))}</strong>
              <span>${statusPill(t.status, toneForStatus(t.status))}</span>
              ${t.notes ? `<p>${escapeHtml(t.notes)}</p>` : ""}
            </li>
          `).join("") || "<li>No time-off requests.</li>"}
        </ul>
      `;
    }
    if (panel === "history") {
      const activity = (bundle.ops?.activity || []).filter((a) => /staff/i.test(a.area || "") || String(a.relatedId || "").includes(person.email));
      return activityListHtml(activity, "No staff activity logged yet.");
    }
    return `
      <p><strong>${escapeHtml(person.name || person.email)}</strong></p>
      <p>${statusPill(person.role)} ${statusPill(person.status, toneForStatus(person.status))} ${statusPill(person.classroomName || "Unassigned")}</p>
      <p class="muted-copy">${escapeHtml(person.email)}${person.joinedAt ? ` · since ${escapeHtml(shortDate(person.joinedAt))}` : ""}</p>
      <h4>Quick actions</h4>
      ${quickActionsHtml([
        { action: "panel-staff-training", label: "Training / CPR" },
        { action: "panel-staff-compliance", label: "Background check" },
        { action: "panel-staff-timeoff", label: "Time off" },
        { tab: "dashboard", label: "Invite / simulate role", focus: "view-as" },
        { tab: "forms-ai-builder", label: "AI staff form" },
      ])}
      <h4>Related</h4>
      <ul class="admin-ops-related">
        <li>${(person.trainings || []).length} training records</li>
        <li>Background check: ${escapeHtml(person.backgroundCheckStatus)}</li>
        <li>${(person.timeOff || []).length} time-off entries</li>
      </ul>
    `;
  }

  /* ── Children ─────────────────────────────────────────────────────────── */

  function renderChildrenManager(target) {
    if (!target || !isTestingAdmin()) return;
    target.innerHTML = loadingHtml("Children");
    ensureBundle(false)
      .then(() => paintChildren(target))
      .catch((error) => {
        target.innerHTML = errorHtml("Children", error.message || state.error);
        bindCommon(target, "children");
      });
  }

  function paintChildren(target) {
    const bundle = state.bundle;
    const attendance = bundle.children?.attendance || [];
    const goals = bundle.children?.goals || [];
    const documents = bundle.children?.documents || [];
    let rows = (bundle.children?.profiles || []).filter((c) => c && !c.archived).map((child) => {
      const hub = familyHubForChild(child.id);
      const att = childAttendanceStatus(child, attendance);
      const childGoals = goals.filter((g) => String(g.childId) === String(child.id));
      const childDocs = documents.filter((d) => String(d.childId) === String(child.id));
      const formsNeeded = childDocs.filter((d) => /needed|pending|draft/i.test(String(d.status || "needed")));
      return {
        ...child,
        attendanceStatus: att,
        familyHub: hub,
        goals: childGoals,
        documents: childDocs,
        formsNeededCount: formsNeeded.length,
      };
    });
    const q = state.search.children.trim().toLowerCase();
    if (q) rows = rows.filter((r) => `${r.name} ${r.parentInfo} ${r.classroomName || r.classroom || ""} ${r.allergies || ""}`.toLowerCase().includes(q));
    if (state.filter.children === "present") rows = rows.filter((r) => r.attendanceStatus === "checked_in");
    if (state.filter.children === "allergies") rows = rows.filter((r) => String(r.allergies || "").trim());
    if (state.filter.children === "forms") rows = rows.filter((r) => r.formsNeededCount > 0);
    if (state.filter.children === "no-hub") rows = rows.filter((r) => !r.familyHub);

    const selectedId = state.selected.children || rows[0]?.id || "";
    state.selected.children = selectedId;
    const selected = rows.find((r) => String(r.id) === String(selectedId)) || rows[0] || null;
    const panel = state.panel.children || "overview";

    target.innerHTML = `
      ${pageHeading(
        "Programs",
        "Children manager",
        "Enrollment, family links, classrooms, attendance, forms, medical info, goals, and Family Hub status.",
        `<button type="button" class="ghost-button" data-admin-section-tab="admin-families">Families</button>
         <button type="button" class="primary-button" data-admin-section-tab="forms-ai-builder">AI documentation</button>`,
      )}
      ${toolbarHtml("children", {
        placeholder: "Search children…",
        filters: [
          { value: "all", label: "All children" },
          { value: "present", label: "Checked in today" },
          { value: "allergies", label: "Has allergies" },
          { value: "forms", label: "Forms needed" },
          { value: "no-hub", label: "No Family Hub" },
        ],
        bulkHtml: `
          <button type="button" class="ghost-button" data-ops-action="children-bulk-tag">Flag selected</button>
          <button type="button" class="ghost-button" data-admin-section-tab="forms-center">Bulk forms</button>
        `,
      })}
      ${metricStrip([
        { label: "Children", value: String(rows.length), detail: "Active profiles" },
        { label: "In care", value: String(rows.filter((r) => r.attendanceStatus === "checked_in").length), detail: "Checked in today" },
        { label: "Allergies", value: String(rows.filter((r) => String(r.allergies || "").trim()).length), detail: "Flagged" },
        { label: "Forms due", value: String(rows.reduce((n, r) => n + r.formsNeededCount, 0)), detail: "Needed / pending" },
        { label: "Family Hub", value: String(rows.filter((r) => r.familyHub).length), detail: "Linked households" },
      ])}
      <div class="admin-ops-layout">
        <section class="admin-ops-list-panel">
          <div class="admin-ops-table-wrap">
            <table class="admin-ops-table">
              <thead><tr><th></th><th>Child</th><th>Classroom</th><th>Attendance</th><th>Family Hub</th><th>Alerts</th></tr></thead>
              <tbody>
                ${rows.map((row) => `
                  <tr class="${String(row.id) === String(selectedId) ? "is-selected" : ""}" data-ops-select-child="${escapeHtml(row.id)}">
                    <td><input type="checkbox" data-ops-check="children" value="${escapeHtml(row.id)}" /></td>
                    <td><strong>${escapeHtml(row.name || "Child")}</strong><div class="admin-ops-sub">${escapeHtml(row.parentInfo || "No guardian listed")}</div></td>
                    <td>${escapeHtml(row.classroomName || row.classroom || row.classroomId || "—")}</td>
                    <td>${statusPill(row.attendanceStatus.replace(/_/g, " "), toneForStatus(row.attendanceStatus))}</td>
                    <td>${row.familyHub ? statusPill(row.familyHub.status || "linked", "ok") : statusPill("none", "warn")}</td>
                    <td>
                      ${row.allergies ? statusPill("Allergy", "bad") : ""}
                      ${row.formsNeededCount ? statusPill(`${row.formsNeededCount} forms`, "warn") : ""}
                    </td>
                  </tr>
                `).join("") || `<tr><td colspan="6">${emptyState("No children yet", "Seed demo children from Testing Center.")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
        <section class="admin-ops-detail-panel">
          <div class="admin-ops-tabs">
            ${["overview", "enrollment", "family", "attendance", "forms", "medical", "goals", "timeline", "ai"].map((tab) => `
              <button type="button" class="admin-ops-tab ${panel === tab ? "is-active" : ""}" data-ops-panel="children" data-ops-panel-value="${tab}">${tab === "ai" ? "AI docs" : tab[0].toUpperCase() + tab.slice(1)}</button>
            `).join("")}
          </div>
          <div class="admin-ops-detail-body">
            ${selected ? paintChildPanel(panel, selected, bundle) : emptyState("Select a child", "Choose a child from the list.")}
          </div>
        </section>
      </div>
    `;
    bindCommon(target, "children");
  }

  function paintChildPanel(panel, child, bundle) {
    if (panel === "enrollment") {
      return `
        <p><strong>${escapeHtml(child.name || "Child")}</strong></p>
        <p>Status: ${statusPill(child.enrollmentStatus || child.status || "enrolled", toneForStatus(child.enrollmentStatus || child.status || "enrolled"))}</p>
        <p>Classroom: ${escapeHtml(child.classroomName || child.classroom || child.classroomId || "Unassigned")}</p>
        <p>Start / DOB: ${escapeHtml(shortDate(child.startDate || child.enrollmentDate))} / ${escapeHtml(shortDate(child.dob || child.birthday))}</p>
      `;
    }
    if (panel === "family") {
      const hub = child.familyHub;
      return `
        <p>Guardian / family link: <strong>${escapeHtml(child.parentInfo || "Not listed")}</strong></p>
        <p>Family Hub: ${hub ? `${statusPill(hub.status, toneForStatus(hub.status))} ${escapeHtml(hub.email || hub.label || "")}` : statusPill("Not invited", "warn")}</p>
        ${quickActionsHtml([
          { tab: "admin-families", label: "Open Families" },
          { tab: "add-tester", label: "Invite tester family" },
        ])}
      `;
    }
    if (panel === "attendance") {
      const rows = (bundle.children?.attendance || [])
        .filter((a) => String(a.childId) === String(child.id))
        .slice(-14)
        .reverse();
      return `
        <p>Today: ${statusPill(child.attendanceStatus.replace(/_/g, " "), toneForStatus(child.attendanceStatus))}</p>
        <ul class="admin-ops-activity">
          ${rows.map((a) => `<li><strong>${escapeHtml(shortDate(a.date))}</strong> <span>${escapeHtml(a.status || (a.pickup ? "checked out" : "present"))}</span></li>`).join("") || "<li>No attendance history.</li>"}
        </ul>
      `;
    }
    if (panel === "forms") {
      return `
        <div class="admin-ops-table-wrap">
          <table class="admin-ops-table">
            <thead><tr><th>Form</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              ${(child.documents || []).map((d) => `
                <tr>
                  <td>${escapeHtml(d.title || d.name || "Form")}</td>
                  <td>${statusPill(d.statusLabel || d.status || "needed", toneForStatus(d.status))}</td>
                  <td>${escapeHtml(shortDate(d.updatedAt || d.signedAt))}</td>
                </tr>
              `).join("") || `<tr><td colspan="3">No forms on file.</td></tr>`}
            </tbody>
          </table>
        </div>
        ${quickActionsHtml([
          { tab: "forms-center", label: "Forms Center" },
          { tab: "forms-ai-builder", label: "AI Form Builder" },
        ])}
      `;
    }
    if (panel === "medical") {
      return `
        <article class="admin-ops-note">
          <h4>Allergies</h4>
          <p>${escapeHtml(child.allergies || "None listed")}</p>
        </article>
        <article class="admin-ops-note">
          <h4>Medical</h4>
          <p>${escapeHtml(child.medical || child.medicalNotes || child.medications || "None listed")}</p>
        </article>
        <article class="admin-ops-note">
          <h4>Doctor / emergency</h4>
          <p>${escapeHtml(child.doctor || child.emergencyContact || "—")}</p>
        </article>
      `;
    }
    if (panel === "goals") {
      return `
        <ul class="admin-ops-activity">
          ${(child.goals || []).map((g) => `
            <li>
              <strong>${escapeHtml(g.title || g.goal || "Goal")}</strong>
              <span>${escapeHtml(g.status || "active")}</span>
              ${g.notes ? `<p>${escapeHtml(g.notes)}</p>` : ""}
            </li>
          `).join("") || "<li>No goals yet.</li>"}
        </ul>
      `;
    }
    if (panel === "timeline") {
      const events = [];
      (child.documents || []).forEach((d) => events.push({ at: d.updatedAt || d.signedAt || d.createdAt, action: d.title || "Form", detail: d.statusLabel || d.status || "" }));
      (child.goals || []).forEach((g) => events.push({ at: g.updatedAt || g.createdAt, action: g.title || "Goal", detail: g.status || "" }));
      (bundle.children?.attendance || [])
        .filter((a) => String(a.childId) === String(child.id))
        .slice(-8)
        .forEach((a) => events.push({ at: a.date, action: "Attendance", detail: a.status || "recorded" }));
      events.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
      return activityListHtml(events, "No timeline events yet.");
    }
    if (panel === "ai") {
      return `
        <p class="muted-copy">Draft documentation for ${escapeHtml(child.name || "this child")} without leaving Admin.</p>
        ${quickActionsHtml([
          { tab: "forms-ai-builder", label: "Open AI Form Builder" },
          { tab: "forms-center", label: "Forms Center" },
          { tab: "curriculum-lesson-plans", label: "Lesson notes", focus: "teaching-kit" },
        ])}
        <article class="admin-ops-note">
          <h4>Suggested prompts</h4>
          <ul class="admin-ops-related">
            <li>Daily summary for ${escapeHtml(child.name || "child")}</li>
            <li>Allergy-aware meal note</li>
            <li>Goal progress update</li>
            <li>Family message about forms due</li>
          </ul>
        </article>
      `;
    }
    return `
      <p><strong>${escapeHtml(child.name || "Child")}</strong></p>
      <p>${statusPill(child.enrollmentStatus || "enrolled", "ok")} ${statusPill((child.attendanceStatus || "").replace(/_/g, " "), toneForStatus(child.attendanceStatus))} ${child.allergies ? statusPill("Allergy alert", "bad") : ""}</p>
      <p class="muted-copy">Classroom ${escapeHtml(child.classroomName || child.classroom || "—")} · Family ${escapeHtml(child.parentInfo || "—")}</p>
      <h4>Quick actions</h4>
      ${quickActionsHtml([
        { action: "panel-children-medical", label: "Allergies / medical" },
        { action: "panel-children-forms", label: "Forms" },
        { action: "panel-children-ai", label: "AI documentation" },
        { tab: "admin-families", label: "Family record" },
      ])}
      <h4>Related</h4>
      <ul class="admin-ops-related">
        <li>${(child.documents || []).length} forms</li>
        <li>${(child.goals || []).length} goals</li>
        <li>Family Hub: ${child.familyHub ? escapeHtml(child.familyHub.status) : "not linked"}</li>
      </ul>
    `;
  }

  /* ── Families ─────────────────────────────────────────────────────────── */

  function renderFamiliesManager(target) {
    if (!target || !isTestingAdmin()) return;
    target.innerHTML = loadingHtml("Families");
    ensureBundle(false)
      .then(() => paintFamilies(target))
      .catch((error) => {
        target.innerHTML = errorHtml("Families", error.message || state.error);
        bindCommon(target, "families");
      });
  }

  function paintFamilies(target) {
    const bundle = state.bundle;
    const profiles = (bundle.children?.profiles || []).filter((c) => c && !c.archived);
    const hubHomes = bundle.families?.households || [];
    const soft = softHouseholdsFromChildren(profiles).filter((s) => {
      return !hubHomes.some((h) => (h.children || []).some((c) => s.children.some((sc) => String(sc.id) === String(c.id))));
    });
    let rows = [
      ...hubHomes.map((h) => ({
        id: h.id,
        label: h.label || h.email || "Family",
        email: h.email || "",
        phone: h.phone || "",
        guardianEmails: h.guardianEmails || [],
        children: h.children || [],
        status: h.status || "invited",
        invitedAt: h.invitedAt || "",
        lastAccessAt: h.lastAccessAt || "",
        magicUrl: h.magicUrl || "",
        soft: false,
        familyRequests: h.familyRequests || [],
      })),
      ...soft.map((s) => ({
        ...s,
        guardianEmails: [],
        invitedAt: "",
        lastAccessAt: "",
        magicUrl: "",
        familyRequests: [],
      })),
    ];
    const q = state.search.families.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => `${r.label} ${r.email} ${r.phone} ${(r.children || []).map((c) => c.name).join(" ")}`.toLowerCase().includes(q));
    }
    if (state.filter.families === "hub") rows = rows.filter((r) => !r.soft);
    if (state.filter.families === "soft") rows = rows.filter((r) => r.soft);
    if (state.filter.families === "active") rows = rows.filter((r) => r.status === "active");
    if (state.filter.families === "invited") rows = rows.filter((r) => r.status === "invited");

    const selectedId = state.selected.families || rows[0]?.id || "";
    state.selected.families = selectedId;
    const selected = rows.find((r) => String(r.id) === String(selectedId)) || rows[0] || null;
    const panel = state.panel.families || "overview";
    const packets = bundle.families?.packets || [];

    target.innerHTML = `
      ${pageHeading(
        "Programs",
        "Families manager",
        "Guardians, contacts, pickup permissions, messages, forms, Family Hub access, and invitations.",
        `<button type="button" class="ghost-button" data-admin-section-tab="admin-children">Children</button>
         <button type="button" class="primary-button" data-admin-section-tab="add-tester">Invite family</button>`,
      )}
      ${toolbarHtml("families", {
        placeholder: "Search families…",
        filters: [
          { value: "all", label: "All families" },
          { value: "hub", label: "Family Hub" },
          { value: "soft", label: "Profile-linked only" },
          { value: "active", label: "Active access" },
          { value: "invited", label: "Invited" },
        ],
        bulkHtml: `
          <button type="button" class="ghost-button" data-ops-action="families-bulk-remind">Remind selected</button>
          <button type="button" class="ghost-button" data-admin-section-tab="messages-conversations">Message families</button>
        `,
      })}
      ${metricStrip([
        { label: "Families", value: String(rows.length), detail: "Hub + profile links" },
        { label: "Hub access", value: String(hubHomes.length), detail: "Household logins" },
        { label: "Active", value: String(hubHomes.filter((h) => h.status === "active").length), detail: "Logged in" },
        { label: "Invited", value: String(hubHomes.filter((h) => h.status === "invited").length), detail: "Awaiting first login" },
        { label: "Packets", value: String(packets.length), detail: "Form packets" },
      ])}
      <div class="admin-ops-layout">
        <section class="admin-ops-list-panel">
          <div class="admin-ops-table-wrap">
            <table class="admin-ops-table">
              <thead><tr><th></th><th>Family</th><th>Guardians</th><th>Children</th><th>Access</th></tr></thead>
              <tbody>
                ${rows.map((row) => `
                  <tr class="${String(row.id) === String(selectedId) ? "is-selected" : ""}" data-ops-select-family="${escapeHtml(row.id)}">
                    <td><input type="checkbox" data-ops-check="families" value="${escapeHtml(row.id)}" /></td>
                    <td><strong>${escapeHtml(row.label)}</strong><div class="admin-ops-sub">${escapeHtml(row.email || row.phone || (row.soft ? "Profile-linked" : ""))}</div></td>
                    <td>${escapeHtml((row.guardianEmails || []).join(", ") || row.email || "—")}</td>
                    <td>${escapeHtml((row.children || []).map((c) => c.name).join(", ") || "—")}</td>
                    <td>${statusPill(row.soft ? "profile" : (row.status || "invited"), toneForStatus(row.soft ? "pending" : row.status))}</td>
                  </tr>
                `).join("") || `<tr><td colspan="5">${emptyState("No families yet", "Invite a Family Hub household or add parent info on child profiles.")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
        <section class="admin-ops-detail-panel">
          <div class="admin-ops-tabs">
            ${["overview", "guardians", "contacts", "pickup", "messages", "forms", "payments", "access", "invitations", "history"].map((tab) => `
              <button type="button" class="admin-ops-tab ${panel === tab ? "is-active" : ""}" data-ops-panel="families" data-ops-panel-value="${tab}">${tab[0].toUpperCase()}${tab.slice(1)}</button>
            `).join("")}
          </div>
          <div class="admin-ops-detail-body">
            ${selected ? paintFamilyPanel(panel, selected, { packets, bundle }) : emptyState("Select a family", "Choose a household from the list.")}
          </div>
        </section>
      </div>
    `;
    bindCommon(target, "families");
  }

  function paintFamilyPanel(panel, family, ctx) {
    const { packets, bundle } = ctx;
    const childIds = new Set((family.children || []).map((c) => String(c.id)));
    const familyPackets = (packets || []).filter((p) => childIds.has(String(p.childId)) || String(p.householdId) === String(family.id));

    if (panel === "guardians") {
      return `
        <ul class="admin-ops-related">
          <li>Primary: ${escapeHtml(family.email || family.label || "—")}</li>
          ${(family.guardianEmails || []).map((g) => `<li>${escapeHtml(g)}</li>`).join("")}
        </ul>
        <p class="muted-copy">Guardian labels and second contacts are managed through Family Hub invites and child profiles.</p>
      `;
    }
    if (panel === "contacts") {
      return `
        <p>Email: <strong>${escapeHtml(family.email || "—")}</strong></p>
        <p>Phone: <strong>${escapeHtml(family.phone || "—")}</strong></p>
        <p class="muted-copy">Additional contacts can be stored on each child profile (emergency / pickup).</p>
      `;
    }
    if (panel === "pickup") {
      const kids = (bundle.children?.profiles || []).filter((c) => childIds.has(String(c.id)));
      return `
        <ul class="admin-ops-related">
          ${kids.map((c) => `<li><strong>${escapeHtml(c.name)}</strong> — pickup: ${escapeHtml(c.pickupAuthorized || c.authorizedPickup || c.emergencyContact || "See profile / forms")}</li>`).join("") || "<li>No linked children.</li>"}
        </ul>
        ${quickActionsHtml([{ tab: "forms-center", label: "Pickup authorization forms" }])}
      `;
    }
    if (panel === "messages") {
      return `
        <p class="muted-copy">Open Messages to continue family conversations. Recent Family Hub requests:</p>
        <ul class="admin-ops-activity">
          ${(family.familyRequests || []).map((r) => `
            <li><strong>${escapeHtml(r.type || r.title || "Request")}</strong><span>${escapeHtml(shortDate(r.createdAt))}</span><p>${escapeHtml(r.detail || r.message || "")}</p></li>
          `).join("") || "<li>No Family Hub requests.</li>"}
        </ul>
        ${quickActionsHtml([{ tab: "messages-conversations", label: "Open Messages" }])}
      `;
    }
    if (panel === "forms") {
      return `
        <div class="admin-ops-table-wrap">
          <table class="admin-ops-table">
            <thead><tr><th>Packet / form</th><th>Child</th><th>Status</th></tr></thead>
            <tbody>
              ${familyPackets.map((p) => `
                <tr>
                  <td>${escapeHtml(p.title || "Packet")}</td>
                  <td>${escapeHtml(p.childName || p.childId || "—")}</td>
                  <td>${statusPill(p.status || "open", toneForStatus(p.status))}</td>
                </tr>
              `).join("") || `<tr><td colspan="3">No packets yet.</td></tr>`}
            </tbody>
          </table>
        </div>
        ${quickActionsHtml([
          { tab: "forms-center", label: "Forms Center" },
          { tab: "forms-ai-builder", label: "AI Form Builder" },
        ])}
      `;
    }
    if (panel === "payments") {
      return `
        <article class="admin-ops-note">
          <h4>Payments (future-ready)</h4>
          <p>Tuition and payment collection will attach here. For now this surface tracks readiness only — no charges are processed from Admin Depth.</p>
          ${statusPill("Not enabled", "neutral")}
          <ul class="admin-ops-related">
            <li>Household: ${escapeHtml(family.label)}</li>
            <li>Billing contact: ${escapeHtml(family.email || "—")}</li>
            <li>Children: ${(family.children || []).length}</li>
          </ul>
        </article>
      `;
    }
    if (panel === "access") {
      return `
        <p>Family Hub status: ${statusPill(family.soft ? "profile only" : family.status, toneForStatus(family.soft ? "pending" : family.status))}</p>
        <p>Last access: ${escapeHtml(shortDate(family.lastAccessAt) || "never")}</p>
        ${family.magicUrl ? `<p class="muted-copy">Magic link available for testing handoff.</p>` : ""}
        ${quickActionsHtml([
          { tab: "dashboard", label: "View As Parent", focus: "view-as" },
          { tab: "add-tester", label: "Invite / re-invite" },
        ])}
      `;
    }
    if (panel === "invitations") {
      return `
        <p>Invited: ${escapeHtml(shortDate(family.invitedAt) || (family.soft ? "n/a" : "—"))}</p>
        <p>Status: ${statusPill(family.soft ? "not invited" : family.status, toneForStatus(family.status))}</p>
        ${quickActionsHtml([
          { tab: "add-tester", label: "Send invitation" },
          { tab: "dashboard", label: "Testing Center" },
        ])}
      `;
    }
    if (panel === "history") {
      const activity = (bundle.ops?.activity || []).filter((a) => /famil/i.test(a.area || "") || String(a.relatedId) === String(family.id));
      return activityListHtml(activity.length ? activity : [
        family.invitedAt ? { at: family.invitedAt, action: "Invited to Family Hub", area: "families" } : null,
        family.lastAccessAt ? { at: family.lastAccessAt, action: "Last Family Hub access", area: "families" } : null,
      ].filter(Boolean), "No family activity yet.");
    }
    return `
      <p><strong>${escapeHtml(family.label)}</strong></p>
      <p>${statusPill(family.soft ? "profile-linked" : family.status, toneForStatus(family.status))} ${(family.children || []).length} children</p>
      <p class="muted-copy">${escapeHtml(family.email || "")}${family.phone ? ` · ${escapeHtml(family.phone)}` : ""}</p>
      <h4>Quick actions</h4>
      ${quickActionsHtml([
        { action: "panel-families-access", label: "Family Hub access" },
        { action: "panel-families-forms", label: "Forms / packets" },
        { action: "panel-families-messages", label: "Messages" },
        { tab: "admin-children", label: "Children" },
        { tab: "forms-ai-builder", label: "AI family update" },
      ])}
      <h4>Children</h4>
      <ul class="admin-ops-related">
        ${(family.children || []).map((c) => `<li>${escapeHtml(c.name || c.id)}</li>`).join("") || "<li>None linked</li>"}
      </ul>
    `;
  }

  /* ── Classrooms (light but real) ──────────────────────────────────────── */

  function renderClassroomsManager(target) {
    if (!target || !isTestingAdmin()) return;
    target.innerHTML = loadingHtml("Classrooms");
    ensureBundle(false)
      .then(() => {
        const rooms = state.bundle.classrooms || [];
        const profiles = (state.bundle.children?.profiles || []).filter((c) => !c.archived);
        target.innerHTML = `
          ${pageHeading("Programs", "Classrooms", "Room structure linked to staff assignments and child enrollment.",
            `<button type="button" class="ghost-button" data-admin-section-tab="staff">Staff assignments</button>
             <button type="button" class="ghost-button" data-admin-section-tab="admin-children">Children</button>`)}
          ${toolbarHtml("programs", { placeholder: "Search programs…", filters: [{ value: "all", label: "All" }] })}
          ${metricStrip([
            { label: "Rooms", value: String(rooms.length), detail: "Configured" },
            { label: "Assigned children", value: String(profiles.filter((c) => c.classroomId || c.classroom).length), detail: "With classroom" },
            { label: "Unassigned", value: String(profiles.filter((c) => !c.classroomId && !c.classroom).length), detail: "Need a room" },
          ])}
          <div class="admin-cc-panel">
            <div class="admin-ops-table-wrap">
              <table class="admin-ops-table">
                <thead><tr><th>Classroom</th><th>Children</th><th>Staff</th><th></th></tr></thead>
                <tbody>
                  ${rooms.map((room) => {
                    const kids = profiles.filter((c) => String(c.classroomId) === String(room.id) || String(c.classroom || "").toLowerCase() === String(room.name || "").toLowerCase());
                    const staff = staffRows(state.bundle).filter((s) => String(s.classroomId) === String(room.id) || String(s.classroomName || "").toLowerCase() === String(room.name || "").toLowerCase());
                    return `
                      <tr>
                        <td><strong>${escapeHtml(room.name || room.id)}</strong></td>
                        <td>${kids.length}</td>
                        <td>${staff.map((s) => escapeHtml(s.email)).join(", ") || "—"}</td>
                        <td><button type="button" class="ghost-button" data-admin-section-tab="admin-children">View children</button></td>
                      </tr>
                    `;
                  }).join("") || `<tr><td colspan="4">${emptyState("No classrooms", "Create classrooms in Schedule / Program Settings, then refresh.")}</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        `;
        bindCommon(target, "programs");
      })
      .catch((error) => {
        target.innerHTML = errorHtml("Classrooms", error.message || state.error);
        bindCommon(target, "programs");
      });
  }

  /* ── Binding / actions ────────────────────────────────────────────────── */

  function checkedValues(root, group) {
    return Array.from(root.querySelectorAll(`[data-ops-check="${group}"]:checked`)).map((el) => el.value);
  }

  function bindCommon(root, area) {
    if (!root) return;

    root.querySelector("[data-ops-search]")?.addEventListener("input", (event) => {
      state.search[area] = event.target.value || "";
      repaint(area, root);
    });
    root.querySelector("[data-ops-filter]")?.addEventListener("change", (event) => {
      state.filter[area] = event.target.value || "all";
      repaint(area, root);
    });
    root.querySelector("[data-ops-owner]")?.addEventListener("change", async (event) => {
      state.ownerEmail = event.target.value || "";
      writeUiPrefs();
      state.bundle = null;
      state.message = "Switched program.";
      await ensureBundle(true).catch(() => {});
      repaint(area, root);
    });
    root.querySelectorAll("[data-ops-refresh]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.bundle = null;
        state.message = "Refreshing…";
        root.querySelector(".admin-ops-flash")?.replaceWith?.(Object.assign(document.createElement("p"), { className: "admin-ops-flash", textContent: "Refreshing…" }));
        try {
          await ensureBundle(true);
          state.message = "Updated.";
        } catch (error) {
          state.message = error.message || "Refresh failed.";
        }
        repaint(area, root);
      });
    });

    root.querySelectorAll("[data-ops-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-ops-panel");
        const value = btn.getAttribute("data-ops-panel-value");
        if (key && value) {
          state.panel[key] = value;
          writeUiPrefs();
          repaint(key, root);
        }
      });
    });

    root.querySelectorAll("[data-ops-select-program]").forEach((row) => {
      row.addEventListener("click", async () => {
        const email = row.getAttribute("data-ops-select-program");
        if (!email || email === state.ownerEmail) return;
        state.ownerEmail = email;
        writeUiPrefs();
        state.bundle = null;
        await ensureBundle(true).catch(() => {});
        paintPrograms(root);
      });
    });
    root.querySelectorAll("[data-ops-select-staff]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("input")) return;
        state.selected.staff = row.getAttribute("data-ops-select-staff") || "";
        paintStaff(root);
      });
    });
    root.querySelectorAll("[data-ops-select-child]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("input,button")) return;
        state.selected.children = row.getAttribute("data-ops-select-child") || "";
        paintChildren(root);
      });
    });
    root.querySelectorAll("[data-ops-select-family]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("input")) return;
        state.selected.families = row.getAttribute("data-ops-select-family") || "";
        paintFamilies(root);
      });
    });

    root.querySelectorAll("[data-ops-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(root, area, btn.getAttribute("data-ops-action"), btn));
    });

    root.querySelectorAll("form[data-ops-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        handleForm(root, area, form).catch((error) => {
          state.message = error.message || "Save failed.";
          repaint(area, root);
        });
      });
    });
  }

  function repaint(area, root) {
    if (area === "programs") paintPrograms(root);
    else if (area === "staff") paintStaff(root);
    else if (area === "children") paintChildren(root);
    else if (area === "families") paintFamilies(root);
  }

  async function handleAction(root, area, action, btn) {
    if (!action) return;
    if (action.startsWith("panel-")) {
      const parts = action.slice("panel-".length).split("-");
      const key = parts[0];
      const value = parts.slice(1).join("-");
      if (key && value) {
        state.panel[key] = value;
        writeUiPrefs();
        repaint(key, root);
      }
      return;
    }

    if (action === "waitlist-mark-contacted" || action === "waitlist-remove-selected") {
      const ids = new Set(checkedValues(root, "waitlist"));
      const waitlist = [...(state.bundle?.ops?.waitlist || [])];
      const next = action === "waitlist-remove-selected"
        ? waitlist.filter((item) => !ids.has(item.id))
        : waitlist.map((item) => (ids.has(item.id) ? { ...item, status: "contacted" } : item));
      await saveOps({ waitlist: next }, {
        area: "programs",
        action: action === "waitlist-remove-selected" ? "Removed waitlist entries" : "Marked waitlist contacted",
        detail: `${ids.size} selected`,
      });
      state.message = "Waitlist updated.";
      await ensureBundle(true);
      paintPrograms(root);
      return;
    }

    if (action === "staff-bulk-clear-check") {
      const emails = checkedValues(root, "staff");
      const compliance = { ...(state.bundle?.ops?.staffCompliance || {}) };
      emails.forEach((email) => {
        const key = String(email || "").toLowerCase();
        compliance[key] = {
          ...(compliance[key] || {}),
          backgroundCheckStatus: "clear",
          backgroundCheckExpiresAt: compliance[key]?.backgroundCheckExpiresAt || "",
          timeOff: compliance[key]?.timeOff || [],
          notes: compliance[key]?.notes || "",
          permissionsNotes: compliance[key]?.permissionsNotes || "",
        };
      });
      await saveOps({ staffCompliance: compliance }, {
        area: "staff",
        action: "Marked background checks clear",
        detail: `${emails.length} staff`,
      });
      state.message = "Background checks updated.";
      await ensureBundle(true);
      paintStaff(root);
      return;
    }

    if (action === "staff-bulk-remind" || action === "families-bulk-remind" || action === "children-bulk-tag") {
      const group = action.startsWith("staff") ? "staff" : action.startsWith("families") ? "families" : "children";
      const ids = checkedValues(root, group);
      await saveOps({}, {
        area: group,
        action: action.replace(/-/g, " "),
        detail: `${ids.length} selected`,
      });
      state.message = ids.length ? `Logged action for ${ids.length} selected.` : "Select rows first.";
      await ensureBundle(true);
      repaint(area, root);
      return;
    }

    if (action === "staff-save-compliance") {
      const email = btn?.getAttribute("data-ops-id") || "";
      const notes = root.querySelector("[data-ops-field='permissionsNotes']")?.value || "";
      const compliance = { ...(state.bundle?.ops?.staffCompliance || {}) };
      const key = String(email || "").toLowerCase();
      compliance[key] = {
        ...(compliance[key] || {}),
        permissionsNotes: notes,
        backgroundCheckStatus: compliance[key]?.backgroundCheckStatus || "unknown",
        backgroundCheckExpiresAt: compliance[key]?.backgroundCheckExpiresAt || "",
        timeOff: compliance[key]?.timeOff || [],
        notes: compliance[key]?.notes || "",
      };
      await saveOps({ staffCompliance: compliance }, {
        area: "staff",
        action: "Updated permissions notes",
        relatedId: email,
      });
      state.message = "Permissions notes saved.";
      await ensureBundle(true);
      paintStaff(root);
      return;
    }

    if (action === "staff-add-training") {
      state.panel.staff = "training";
      writeUiPrefs();
      paintStaff(root);
      return;
    }

    if (action === "save-program-settings") {
      const form = root.querySelector("form[data-ops-form='program-settings']");
      if (form) {
        await handleForm(root, area, form);
      } else {
        state.panel.programs = "settings";
        writeUiPrefs();
        paintPrograms(root);
      }
    }
  }

  async function handleForm(root, area, form) {
    const kind = form.getAttribute("data-ops-form");
    const data = new FormData(form);
    const get = (name) => String(data.get(name) || "").trim();

    if (kind === "program-settings") {
      const settings = {
        ...(state.bundle?.program?.settings || {}),
        programName: get("programName"),
        programType: get("programType"),
        phone: get("phone"),
        address: get("address"),
        city: get("city"),
        state: get("state"),
        communicationTone: get("communicationTone"),
      };
      // Persist as licensing notes companion + activity; also try member save when available.
      await saveOps({
        licensing: {
          ...(state.bundle?.ops?.licensing || {}),
          notes: [
            state.bundle?.ops?.licensing?.notes || "",
            `Program settings snapshot: ${settings.programName} · ${settings.programType} · ${settings.city} ${settings.state}`,
          ].filter(Boolean).join("\n").slice(0, 2000),
        },
      }, {
        area: "programs",
        action: "Updated program settings snapshot",
        detail: settings.programName,
      });
      try {
        if (typeof global.saveProgramSettings === "function" && global.currentUser) {
          global.saveProgramSettings(settings);
        }
      } catch (_error) { /* optional */ }
      state.message = "Program settings saved.";
      await ensureBundle(true);
      paintPrograms(root);
      return;
    }

    if (kind === "licensing") {
      await saveOps({
        licensing: {
          licenseNumber: get("licenseNumber"),
          authority: get("authority"),
          expiresAt: get("expiresAt"),
          status: get("status") || "unknown",
          notes: get("notes"),
        },
      }, { area: "programs", action: "Updated licensing" });
      state.message = "Licensing saved.";
      await ensureBundle(true);
      paintPrograms(root);
      return;
    }

    if (kind === "capacity") {
      await saveOps({
        capacity: {
          licensedCapacity: Number(get("licensedCapacity") || 0),
          agesServed: get("agesServed"),
          notes: get("notes"),
        },
      }, { area: "programs", action: "Updated capacity" });
      state.message = "Capacity saved.";
      await ensureBundle(true);
      paintPrograms(root);
      return;
    }

    if (kind === "waitlist-add") {
      const waitlist = [...(state.bundle?.ops?.waitlist || [])];
      waitlist.unshift({
        id: `wait-${Date.now()}`,
        childName: get("childName") || "Child",
        guardianName: get("guardianName"),
        email: get("email"),
        phone: "",
        desiredStart: get("desiredStart"),
        classroom: get("classroom"),
        status: "waiting",
        notes: "",
        createdAt: new Date().toISOString(),
        priority: waitlist.length + 1,
      });
      await saveOps({ waitlist }, {
        area: "programs",
        action: "Added waitlist entry",
        detail: get("childName"),
      });
      state.message = "Added to waitlist.";
      await ensureBundle(true);
      paintPrograms(root);
      return;
    }

    if (kind === "staff-compliance") {
      const email = form.getAttribute("data-ops-id") || "";
      const key = String(email).toLowerCase();
      const compliance = { ...(state.bundle?.ops?.staffCompliance || {}) };
      compliance[key] = {
        ...(compliance[key] || {}),
        backgroundCheckStatus: get("backgroundCheckStatus") || "unknown",
        backgroundCheckExpiresAt: get("backgroundCheckExpiresAt"),
        notes: get("notes"),
        permissionsNotes: compliance[key]?.permissionsNotes || "",
        timeOff: compliance[key]?.timeOff || [],
      };
      await saveOps({ staffCompliance: compliance }, {
        area: "staff",
        action: "Updated staff compliance",
        relatedId: email,
      });
      state.message = "Compliance saved.";
      await ensureBundle(true);
      paintStaff(root);
      return;
    }

    if (kind === "staff-timeoff") {
      const email = form.getAttribute("data-ops-id") || "";
      const key = String(email).toLowerCase();
      const compliance = { ...(state.bundle?.ops?.staffCompliance || {}) };
      const current = compliance[key] || {
        backgroundCheckStatus: "unknown",
        backgroundCheckExpiresAt: "",
        notes: "",
        permissionsNotes: "",
        timeOff: [],
      };
      const timeOff = Array.isArray(current.timeOff) ? current.timeOff.slice() : [];
      timeOff.unshift({
        id: `pto-${Date.now()}`,
        startDate: get("startDate"),
        endDate: get("endDate"),
        status: get("status") || "requested",
        notes: get("notes"),
      });
      compliance[key] = { ...current, timeOff };
      await saveOps({ staffCompliance: compliance }, {
        area: "staff",
        action: "Added time off",
        relatedId: email,
        detail: `${get("startDate")} → ${get("endDate")}`,
      });
      state.message = "Time off added.";
      await ensureBundle(true);
      paintStaff(root);
      return;
    }

    if (kind === "staff-training") {
      const email = form.getAttribute("data-ops-id") || "";
      // Prefer live HDH trainings API when member auth is available; always log activity.
      let posted = false;
      try {
        if (typeof global.staffAuthHeaders === "function") {
          const headers = await global.staffAuthHeaders();
          if (headers) {
            const response = await fetch("/api/home-daycare-hub/staff-trainings", {
              method: "POST",
              headers,
              body: JSON.stringify({
                staffEmail: email,
                staffName: email,
                type: get("type") || "Other",
                completedAt: get("completedAt"),
                expiresAt: get("expiresAt"),
                notes: get("notes"),
              }),
            });
            posted = response.ok;
          }
        }
      } catch (_error) {
        posted = false;
      }
      await saveOps({}, {
        area: "staff",
        action: posted ? "Logged staff training" : "Noted staff training (ops log)",
        relatedId: email,
        detail: `${get("type")} · expires ${get("expiresAt") || "n/a"}`,
      });
      state.message = posted ? "Training saved." : "Training noted in activity (member auth needed for full training store).";
      await ensureBundle(true);
      paintStaff(root);
    }
  }

  global.AdminOpsManagers = {
    renderPrograms: renderProgramsManager,
    renderStaff: renderStaffManager,
    renderChildren: renderChildrenManager,
    renderFamilies: renderFamiliesManager,
    renderClassrooms: renderClassroomsManager,
    ensureBundle,
  };
})(typeof window !== "undefined" ? window : globalThis);
