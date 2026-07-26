/**
 * Admin Workspace — calm, separate Platform Admin UI for testing hosts.
 * Loaded lazily via platform-perf.js when an admin workspace view opens.
 */
(function initAdminWorkspace(global) {
  const VIEWS = Object.freeze([
    "admin-home",
    "admin-testers",
    "admin-content",
    "admin-feedback",
    "admin-health",
    "admin-advanced",
    "admin-role-preview",
  ]);

  const LOAD_TIMEOUT_MS = 12000;
  const TESTING_LAB_DISABLED_MSG = "Testing Lab is disabled in the Render testing environment.";
  const state = {
    home: null,
    health: null,
    loading: {},
    errors: {},
    feedbackFilter: { status: "", unreadOnly: false },
    feedbackThreads: [],
    feedbackActiveId: "",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function adminToken() {
    return global.localStorage?.getItem("llhAdminToken") || global.sessionStorage?.getItem("llhAdminToken") || "";
  }

  function adminHeaders() {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    const token = adminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function apiFetch(path, options = {}, timeoutMs = LOAD_TIMEOUT_MS) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? global.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(path, {
        ...options,
        headers: { ...adminHeaders(), ...(options.headers || {}) },
        cache: "no-store",
        signal: controller?.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || `Request failed (${response.status})`);
      return data;
    } finally {
      if (timer) global.clearTimeout(timer);
    }
  }

  function isAdminWorkspaceView(view) {
    return VIEWS.includes(String(view || "").trim());
  }

  function isRolePreviewActive() {
    return Boolean(global.sessionStorage?.getItem("llhRolePreviewMembershipId"));
  }

  function isTesterSandboxSession() {
    try {
      const email = String(global.localStorage?.getItem("llhUser") || "").trim().toLowerCase();
      return email.endsWith("@example.invalid");
    } catch {
      return false;
    }
  }

  function isAdminWorkspaceMode() {
    const active = global.document?.querySelector(".active-view")?.id?.replace("view-", "") || "";
    return (
      typeof global.isAdminUnlocked === "function"
      && global.isAdminUnlocked()
      && typeof global.hasAdminFullAccess === "function"
      && global.hasAdminFullAccess()
      && !isRolePreviewActive()
      && !isTesterSandboxSession()
      && (isAdminWorkspaceView(active) || active === "admin" && global.__llhAdminWorkspaceLegacy)
    );
  }

  function refreshAdminWorkspaceNav() {
    const nav = global.document?.querySelector("#adminWorkspaceNav");
    const platformNav = global.document?.querySelector("#platformNav");
    const pilotNavs = global.document?.querySelectorAll("#pilotProviderNav, #pilotStaffNav, #pilotParentNav");
    const active = global.document?.querySelector(".active-view")?.id?.replace("view-", "") || "";
    const mode = isAdminWorkspaceMode();
    global.document?.body?.classList.toggle("admin-workspace-active", mode);
    if (nav) nav.hidden = !mode;
    if (platformNav) platformNav.hidden = mode || (typeof global.pilotIsProviderNow === "function" && (global.pilotIsProviderNow() || global.pilotIsParentNow?.()));
    pilotNavs?.forEach((el) => {
      if (mode) el.hidden = true;
    });
    if (nav) {
      nav.querySelectorAll("[data-admin-workspace-nav]").forEach((btn) => {
        const view = btn.getAttribute("data-view");
        btn.classList.toggle("active", view === active);
      });
    }
  }

  function shellHtml(title, subtitle, bodyHtml) {
    return `
      <div class="aw-page">
        <header class="aw-page-header">
          <p class="eyebrow">Platform Admin</p>
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="muted-copy aw-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        </header>
        ${bodyHtml}
      </div>
    `;
  }

  function statusPill(label, stateKey) {
    const cls = `aw-status aw-status--${escapeHtml(stateKey || "missing")}`;
    return `<span class="${cls}">${escapeHtml(label)}</span>`;
  }

  async function loadHome() {
    state.loading.home = true;
    state.errors.home = "";
    try {
      state.home = await apiFetch("/api/admin/workspace/home");
    } catch (error) {
      state.errors.home = error.name === "AbortError" ? "Loading timed out. Tap Retry or open System Health." : (error.message || "Could not load Admin Home.");
      state.home = null;
    }
    state.loading.home = false;
  }

  function homeHtml() {
    if (state.loading.home) {
      return shellHtml("Admin Home", "Loading your testing overview…", `<div class="aw-loading-card">Loading…</div>`);
    }
    if (state.errors.home) {
      return shellHtml("Admin Home", "", `
        <div class="aw-error-card">
          <p>${escapeHtml(state.errors.home)}</p>
          <button type="button" class="primary-button" data-aw-retry-home>Try Again</button>
          <button type="button" class="ghost-button" data-view="admin-home">Return to Admin Home</button>
        </div>
      `);
    }
    const h = state.home || {};
    const ts = h.testingStatus || {};
    const next = h.nextAction || "preview";
    const nextButtons = {
      setup_testing_site: { label: "Set Up Testing Site", action: "data-aw-onboard" },
      add_tester: { label: "Add Home Daycare Tester", action: "data-view=\"admin-testers\"" },
      view_feedback: { label: "View New Feedback", action: "data-view=\"admin-feedback\"" },
      preview: { label: "Preview as a User", action: "data-view=\"admin-role-preview\"" },
    };
    const nextBtn = nextButtons[next] || nextButtons.preview;
    const attention = Array.isArray(h.needsAttention) ? h.needsAttention : [];
    const counts = h.contentCounts || {};
    return shellHtml(
      "Admin Home",
      "A calm starting point for managing the testing website — no provider tools mixed in.",
      `
        <section class="aw-section aw-start-here">
          <h3>Start Here</h3>
          <p class="muted-copy">Your most important next step:</p>
          <button type="button" class="primary-button aw-primary-cta" ${nextBtn.action}>${escapeHtml(nextBtn.label)}</button>
        </section>

        <section class="aw-section">
          <h3>Testing Status</h3>
          <ul class="aw-status-grid">
            <li><span>Testing database</span>${statusPill(ts.testingDatabase?.label || "—", ts.testingDatabase?.state)}</li>
            <li><span>Testing Lab</span>${statusPill(ts.testingLab?.label || "—", ts.testingLab?.state)}</li>
            <li><span>Tester setup</span>${statusPill(ts.testerSetup?.label || "—", ts.testerSetup?.state)}</li>
            <li><span>Fake accounts created</span><strong>${escapeHtml(String(ts.fakeAccountCount ?? 0))}</strong></li>
            <li><span>Latest deployed version</span><code>${escapeHtml((h.deployedCommit || "not reported").slice(0, 12))}</code></li>
            <li><span>Last release test</span>${ts.lastReleaseTest ? statusPill(ts.lastReleaseTest.ok ? "Passed" : "Failed", ts.lastReleaseTest.ok ? "working" : "attention") : statusPill("Not recorded", "missing")}</li>
            <li><span>Open feedback</span><strong>${escapeHtml(String(ts.openFeedbackCount ?? 0))}</strong></li>
            <li><span>Failed syncs</span><strong>${escapeHtml(String(ts.pendingFailedSaves ?? 0))}</strong></li>
          </ul>
        </section>

        <section class="aw-section">
          <h3>Quick Actions</h3>
          <div class="aw-quick-actions">
            <button type="button" class="ghost-button" data-view="admin-testers">Add Tester</button>
            <button type="button" class="ghost-button" data-view="admin-testers">Manage Testers</button>
            <button type="button" class="ghost-button" data-aw-preview-role="solo_provider">Preview Home Daycare Provider</button>
            <button type="button" class="ghost-button" data-aw-preview-role="parent_guardian">Preview Parent</button>
            <button type="button" class="ghost-button" data-aw-preview-role="solo_provider">Preview Daily Care</button>
            <button type="button" class="ghost-button" data-view="admin-feedback">Review Feedback</button>
            <button type="button" class="ghost-button" data-aw-admin-content-section="lesson-plans">Manage Lesson Plans</button>
            <button type="button" class="ghost-button" data-aw-admin-content-section="activities">Manage Activities</button>
          </div>
        </section>

        <section class="aw-section">
          <h3>Needs Attention</h3>
          ${attention.length ? `
            <ul class="aw-attention-list">
              ${attention.map((item) => `
                <li>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                  ${item.envVar ? `<p class="aw-env-hint">Add environment variable: <code>${escapeHtml(item.envVar)}=true</code> on Render (testing service only).</p>` : ""}
                  <p class="muted-copy">${escapeHtml(item.ownerAction || "")}</p>
                </li>
              `).join("")}
            </ul>
          ` : `<p class="aw-all-good">Everything is working.</p>`}
        </section>

        <section class="aw-section">
          <h3>Recent Activity</h3>
          ${(h.recentActivity || []).length ? `
            <ul class="aw-activity-list">
              ${h.recentActivity.map((row) => `<li>${escapeHtml(row.summary || row.action || JSON.stringify(row))}</li>`).join("")}
            </ul>
          ` : `<p class="muted-copy">No recent admin activity recorded yet.</p>`}
        </section>

        <section class="aw-section aw-content-counts">
          <h3>Content on this testing site</h3>
          <p class="muted-copy">${escapeHtml(counts.lessonPlans || 0)} lesson plans · ${escapeHtml(counts.activities || 0)} activities</p>
        </section>
      `,
    );
  }

  async function renderHome(mount) {
    mount.innerHTML = homeHtml();
    bindCommon(mount);
    mount.querySelector("[data-aw-retry-home]")?.addEventListener("click", async () => {
      await loadHome();
      renderHome(mount);
    });
    mount.querySelector("[data-aw-onboard]")?.addEventListener("click", async () => {
      const cta = mount.querySelector(".aw-start-here");
      cta?.querySelector(".aw-onboard-error")?.remove();
      try {
        await apiFetch("/api/testing-lab/onboard-everything", { method: "POST", body: "{}" });
        state.home = null;
        await loadHome();
        renderHome(mount);
      } catch (error) {
        const msg = error.message || "Setup failed.";
        cta?.insertAdjacentHTML("beforeend", `<p class="tf-error aw-onboard-error">${escapeHtml(msg)}</p>`);
      }
    });
  }

  async function renderTesters(mount) {
    mount.innerHTML = shellHtml(
      "Testers",
      "Create isolated fake home daycare testers with connected children and guardians.",
      `<div class="aw-testers-mount" id="awTestersLabMount"><p class="muted-copy">Loading tester tools…</p></div>`,
    );
    bindCommon(mount);
    const labMount = mount.querySelector("#awTestersLabMount");
    if (typeof global.renderTestingLabTesterPanel === "function") {
      await global.renderTestingLabTesterPanel(labMount);
    } else {
      labMount.innerHTML = `<p class="tf-error">Tester tools failed to load. Refresh the page or open Advanced Tools.</p>`;
    }
  }

  function contentHtml() {
    const c = state.home?.contentCounts || {};
    const gate = state.home?.testingLabGate;
    const envBlocked = gate?.checks?.find((row) => row.key === "env_preview" && !row.ok);
    const gateBanner = envBlocked ? `
      <div class="aw-warning-card">
        <p><strong>${escapeHtml(TESTING_LAB_DISABLED_MSG)}</strong></p>
        <p class="muted-copy">In Render → your testing web service → Environment, add <code>ALLOW_TESTING_LAB_ADMIN_PREVIEW=true</code> and redeploy. Content counts below still load from Admin Home.</p>
      </div>
    ` : "";
    return shellHtml(
      "Content",
      "Lesson plans, activities, curriculum organization, and forms on this testing site.",
      `
        ${gateBanner}
        <div class="aw-content-sections">
          <section class="aw-content-section" id="aw-content-lesson-plans">
            <h3>Lesson Plans</h3>
            <p class="muted-copy">${escapeHtml(c.lessonPlans ?? 0)} lesson plans in the testing library.</p>
            <button type="button" class="primary-button" data-aw-legacy-admin data-aw-admin-focus="lessons">Open Lesson Plan Manager</button>
          </section>
          <section class="aw-content-section" id="aw-content-activities">
            <h3>Activities</h3>
            <p class="muted-copy">${escapeHtml(c.activities ?? 0)} activities available for providers.</p>
            <button type="button" class="ghost-button" data-aw-legacy-admin data-aw-admin-focus="activities">Open Activity Manager</button>
          </section>
          <section class="aw-content-section" id="aw-content-curriculum">
            <h3>Curriculum organization</h3>
            <p class="muted-copy">${escapeHtml(c.monthlyCurriculum ?? 0)} monthly curriculum units · ${escapeHtml(c.printables ?? 0)} printables</p>
            <button type="button" class="ghost-button" data-aw-legacy-admin data-aw-admin-focus="curriculum">Open Curriculum Tools</button>
          </section>
          <section class="aw-content-section" id="aw-content-forms">
            <h3>Forms &amp; templates</h3>
            <p class="muted-copy">${escapeHtml(c.forms ?? 0)} forms · ${escapeHtml(c.announcements ?? 0)} announcements</p>
            <button type="button" class="ghost-button" data-aw-legacy-admin data-aw-admin-focus="forms">Open Forms Library</button>
          </section>
        </div>
        <div class="aw-count-row aw-content-summary">
          <div class="aw-count-card"><strong>${escapeHtml(c.lessonPlans ?? "—")}</strong><span>Lesson Plans</span></div>
          <div class="aw-count-card"><strong>${escapeHtml(c.activities ?? "—")}</strong><span>Activities</span></div>
          <div class="aw-count-card"><strong>${escapeHtml(c.monthlyCurriculum ?? 0)}</strong><span>Monthly Curriculum</span></div>
          <div class="aw-count-card"><strong>${escapeHtml(c.forms ?? 0)}</strong><span>Forms</span></div>
        </div>
      `,
    );
  }

  async function renderFeedback(mount) {
    mount.innerHTML = shellHtml("Feedback", "Testing Feedback inbox — testers never see admin notes.", `<div id="awFeedbackMount"><p class="muted-copy">Loading feedback…</p></div>`);
    bindCommon(mount);
    const fbMount = mount.querySelector("#awFeedbackMount");
    if (typeof global.renderTestingLabFeedbackPanel === "function") {
      await global.renderTestingLabFeedbackPanel(fbMount);
    } else {
      fbMount.innerHTML = `<p class="tf-error">Feedback panel failed to load.</p>`;
    }
  }

  async function loadHealth() {
    state.loading.health = true;
    state.errors.health = "";
    try {
      state.health = await apiFetch("/api/admin/workspace/health");
    } catch (error) {
      state.errors.health = error.name === "AbortError" ? "Health check timed out." : (error.message || "Could not load health.");
      state.health = null;
    }
    state.loading.health = false;
  }

  function healthHtml() {
    if (state.loading.health) {
      return shellHtml("System Health", "", `<div class="aw-loading-card">Checking systems…</div>`);
    }
    if (state.errors.health) {
      return shellHtml("System Health", "", `
        <div class="aw-error-card">
          <p>${escapeHtml(state.errors.health)}</p>
          <button type="button" class="primary-button" data-aw-retry-health>Retry</button>
        </div>
      `);
    }
    const cards = state.health?.cards || [];
    return shellHtml(
      "System Health",
      "Plain-language status for the testing website.",
      `
        <div class="aw-health-grid">
          ${cards.map((card) => `
            <article class="aw-health-card aw-health-card--${escapeHtml(card.state)}">
              <h4>${escapeHtml(card.label)}</h4>
              ${statusPill(card.stateLabel || card.state, card.state)}
              <p>${escapeHtml(card.detail || "")}</p>
              ${card.ownerAction ? `<p class="aw-owner-action"><strong>What to do:</strong> ${escapeHtml(card.ownerAction)}</p>` : ""}
              ${card.envVar ? `<p class="aw-env-hint">Set <code>${escapeHtml(card.envVar)}=true</code> on Render.</p>` : ""}
            </article>
          `).join("")}
        </div>
      `,
    );
  }

  async function renderHealth(mount) {
    mount.innerHTML = healthHtml();
    bindCommon(mount);
    mount.querySelector("[data-aw-retry-health]")?.addEventListener("click", async () => {
      await loadHealth();
      renderHealth(mount);
    });
  }

  function advancedHtml() {
    return shellHtml(
      "Advanced Tools",
      "",
      `
        <div class="aw-warning-card">
          <strong>Advanced tools contain detailed business and technical information.</strong>
          <p>Most testing tasks can be completed from Admin Home.</p>
        </div>
        <details class="aw-advanced-section" open>
          <summary>Users and Memberships</summary>
          <button type="button" class="ghost-button" data-view="admin" data-aw-legacy-admin>Open Owner Command Center</button>
        </details>
        <details class="aw-advanced-section">
          <summary>Billing and Stripe</summary>
          <button type="button" class="ghost-button" data-view="admin" data-aw-legacy-admin>Billing analytics (legacy dashboard)</button>
        </details>
        <details class="aw-advanced-section">
          <summary>Website Analytics</summary>
          <button type="button" class="ghost-button" data-view="admin" data-aw-legacy-admin>Traffic & analytics (legacy)</button>
        </details>
        <details class="aw-advanced-section">
          <summary>Feature Flags & Testing Lab</summary>
          <button type="button" class="ghost-button" data-view="testing-lab">Testing Lab (full)</button>
        </details>
        <details class="aw-advanced-section">
          <summary>Technical Diagnostics</summary>
          <button type="button" class="ghost-button" data-view="owner-testing-home">Owner Testing Home (legacy)</button>
        </details>
      `,
    );
  }

  async function renderAdvanced(mount) {
    mount.innerHTML = advancedHtml();
    bindCommon(mount);
  }

  async function renderRolePreview(mount) {
    mount.innerHTML = shellHtml(
      "Preview as a User",
      "See the testing site exactly as a tester would — with a clear escape back to Admin.",
      `<div id="awRolePreviewMount"><p class="muted-copy">Loading preview options…</p></div>
       <div class="aw-preview-escape">
         <button type="button" class="primary-button" data-aw-return-admin>Return to Admin Home</button>
       </div>`,
    );
    bindCommon(mount);
    const rpMount = mount.querySelector("#awRolePreviewMount");
    if (typeof global.renderTestingLabRolePreviewPanel === "function") {
      await global.renderTestingLabRolePreviewPanel(rpMount);
    } else {
      rpMount.innerHTML = `
        <div class="aw-quick-actions">
          <button type="button" class="ghost-button" data-aw-preview-role="solo_provider">Solo Home Daycare Provider</button>
          <button type="button" class="ghost-button" data-aw-preview-role="home_daycare_staff">Home Daycare Staff</button>
          <button type="button" class="ghost-button" data-aw-preview-role="parent_guardian">Parent/Guardian</button>
          <button type="button" class="ghost-button" data-aw-preview-role="curriculum_only">Curriculum Only</button>
        </div>
      `;
    }
    mount.querySelector("[data-aw-return-admin]")?.addEventListener("click", () => exitRolePreviewAndReturnAdmin());
  }

  async function exitRolePreviewAndReturnAdmin() {
    global.sessionStorage?.removeItem("llhRolePreviewMembershipId");
    try {
      await apiFetch("/api/testing-lab/role-preview/exit", { method: "POST", body: "{}" }, 5000);
    } catch { /* local escape already happened */ }
    try { global.refreshTopNavExitPreview?.(); } catch { /* */ }
    try { global.refreshTestingIdentityBanner?.(); } catch { /* */ }
    if (typeof global.setView === "function") global.setView("admin-home", { replaceHistory: true });
  }

  async function startRolePreview(targetKind) {
    try {
      const data = await apiFetch("/api/testing-lab/role-preview/start", {
        method: "POST",
        body: JSON.stringify({ targetKind }),
      });
      if (data.preview?.membershipId) {
        global.sessionStorage?.setItem("llhRolePreviewMembershipId", data.preview.membershipId);
      }
      try { global.refreshTopNavExitPreview?.(); } catch { /* */ }
      try { global.refreshTestingIdentityBanner?.(); } catch { /* */ }
      if (typeof global.setView === "function") {
        global.setView(targetKind === "parent_guardian" ? "pilot-parent-home" : "pilot-families", { fromAdminPreview: true });
      }
    } catch (error) {
      global.alert?.(error.message || "Preview failed.");
    }
  }

  function openLegacyAdminDashboard(focus) {
    global.__llhAdminWorkspaceLegacy = true;
    global.__llhAdminContentFocus = focus || "";
    if (typeof global.setView === "function") {
      global.setView("admin", { adminWorkspaceContext: true, replaceHistory: false });
    }
  }

  function openAdminContentSection(sectionId) {
    if (typeof global.setView !== "function") return;
    global.setView("admin-content");
    global.requestAnimationFrame(() => {
      const el = global.document?.getElementById(`aw-content-${sectionId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function bindCommon(mount) {
    mount.querySelectorAll("[data-aw-preview-role]").forEach((btn) => {
      btn.addEventListener("click", () => startRolePreview(btn.getAttribute("data-aw-preview-role")));
    });
    mount.querySelectorAll("[data-aw-admin-content-section]").forEach((btn) => {
      btn.addEventListener("click", () => openAdminContentSection(btn.getAttribute("data-aw-admin-content-section")));
    });
    mount.querySelectorAll("[data-aw-legacy-admin]").forEach((btn) => {
      btn.addEventListener("click", () => openLegacyAdminDashboard(btn.getAttribute("data-aw-admin-focus") || ""));
    });
    mount.querySelectorAll("[data-view]").forEach((btn) => {
      if (btn.hasAttribute("data-admin-workspace-nav")) return;
      btn.addEventListener("click", (event) => {
        const view = btn.getAttribute("data-view");
        if (!view || typeof global.setView !== "function") return;
        event.preventDefault();
        if (isAdminWorkspaceMode()) {
          if (view === "lessons" || view === "activities") {
            openAdminContentSection(view === "lessons" ? "lesson-plans" : "activities");
            return;
          }
          if (view === "child-tools-daily-logs") {
            startRolePreview("solo_provider");
            return;
          }
          if (view === "testing-lab" || view === "owner-testing-home") {
            global.setView(view, { skipAdminWorkspaceRedirect: true, adminGateDiagnostic: true });
            return;
          }
        }
        global.setView(view);
      });
    });
  }

  function exitAdminWorkspace() {
    if (typeof global.lockAdminSession === "function") {
      global.lockAdminSession();
      return;
    }
    global.localStorage?.removeItem("llhAdminUnlocked");
    global.localStorage?.removeItem("llhAdminToken");
    if (typeof global.setView === "function") global.setView("home", { replaceHistory: true });
  }

  async function renderPage(view) {
    const mount = global.document?.querySelector(`#view-${view}`);
    if (!mount) return;
    refreshAdminWorkspaceNav();
    if (view === "admin-home") {
      if (!state.home && !state.loading.home) await loadHome();
      await renderHome(mount);
      return;
    }
    if (view === "admin-testers") return renderTesters(mount);
    if (view === "admin-content") {
      if (!state.home) await loadHome();
      mount.innerHTML = contentHtml();
      bindCommon(mount);
      return;
    }
    if (view === "admin-feedback") return renderFeedback(mount);
    if (view === "admin-health") {
      if (!state.health && !state.loading.health) await loadHealth();
      return renderHealth(mount);
    }
    if (view === "admin-advanced") return renderAdvanced(mount);
    if (view === "admin-role-preview") return renderRolePreview(mount);
  }

  function renderAdminErrorScreen(message) {
    const mount = global.document?.querySelector(".active-view");
    if (!mount) return;
    mount.innerHTML = shellHtml(
      "Something went wrong",
      "",
      `
        <div class="aw-error-card">
          <p>${escapeHtml(message || "This admin screen could not load.")}</p>
          <button type="button" class="primary-button" data-view="admin-home">Return to Admin Home</button>
          <button type="button" class="ghost-button" data-aw-retry-view>Try Again</button>
        </div>
      `,
    );
    bindCommon(mount);
  }

  global.LLHAdminWorkspace = {
    VIEWS,
    isAdminWorkspaceView,
    isAdminWorkspaceMode,
    refreshAdminWorkspaceNav,
    renderPage,
    renderAdminErrorScreen,
    exitAdminWorkspace,
    exitRolePreviewAndReturnAdmin,
    startRolePreview,
  };

  global.document?.addEventListener("click", (event) => {
    const navBtn = event.target.closest("[data-admin-workspace-nav]");
    if (navBtn) {
      event.preventDefault();
      const view = navBtn.getAttribute("data-view");
      if (view && typeof global.setView === "function") global.setView(view);
      return;
    }
    if (event.target.closest("[data-aw-exit-admin]")) {
      event.preventDefault();
      exitAdminWorkspace();
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
