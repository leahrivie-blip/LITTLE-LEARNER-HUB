/**
 * Testing-only Admin Control Center.
 * Fenced by isHomeDaycareHubTestingEnabled() — never used on production.
 */
(function initAdminControlCenter(global) {
  const OPEN_GROUPS_KEY = "llhAdminControlCenterOpenGroups_v2";

  const NAV_GROUPS = [
    {
      id: "dashboard",
      label: "Dashboard",
      items: [
        { tab: "admin-home", label: "Admin Home" },
        { tab: "system-health", label: "System Health" },
        { tab: "admin-notifications", label: "Notifications" },
      ],
    },
    {
      id: "programs",
      label: "Programs",
      items: [
        { tab: "programs", label: "Programs" },
        { tab: "admin-classrooms", label: "Classrooms" },
        { tab: "staff", label: "Staff" },
        { tab: "admin-children", label: "Children" },
        { tab: "admin-families", label: "Families" },
      ],
    },
    {
      id: "testing",
      label: "Testing",
      items: [
        { tab: "dashboard", label: "Testing Center" },
        { tab: "add-tester", label: "Invite Tester" },
        { tab: "dashboard", label: "Multi-Role Tester", focus: "view-as" },
        { tab: "feedback", label: "Tester Feedback" },
        { tab: "tester-activity", label: "Tester Activity" },
      ],
    },
    {
      id: "curriculum",
      label: "Curriculum",
      items: [
        { tab: "curriculum-lesson-plans", label: "Lesson Plans" },
        { tab: "curriculum-lesson-plans", label: "Teaching Kits", focus: "teaching-kit" },
        { tab: "curriculum-activities", label: "Activities" },
        { tab: "forms-center", label: "Forms Center" },
        { tab: "forms-ai-builder", label: "AI Form Builder" },
        { tab: "curriculum-sync", label: "Curriculum Sync" },
        { tab: "content-health", label: "Content Health" },
      ],
    },
    {
      id: "business",
      label: "Business",
      items: [
        { tab: "users", label: "Users" },
        { tab: "billing-home", label: "Billing" },
        { tab: "trial-usage", label: "Subscriptions" },
        { tab: "marketing-analytics", label: "Marketing" },
        { tab: "emails", label: "Email" },
        { tab: "messages-conversations", label: "Messages" },
        { tab: "analytics", label: "Analytics" },
      ],
    },
    {
      id: "platform",
      label: "Platform",
      items: [
        { tab: "error-center", label: "Error Center" },
        { tab: "release-center", label: "Release Center" },
        { tab: "feature-requests-center", label: "Feature Requests" },
        { tab: "admin-settings", label: "Settings" },
      ],
    },
  ];

  const TAB_TO_GROUP = (() => {
    const map = Object.create(null);
    NAV_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        if (!map[item.tab]) map[item.tab] = group.id;
      });
    });
    return map;
  })();

  const EXTRA_LANDING_TABS = [
    "forms-center",
    "forms-ai-builder",
    "curriculum-sync",
    "add-tester",
    "programs",
    "staff",
    "admin-children",
    "admin-classrooms",
    "admin-families",
    "tester-activity",
  ];

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

  function readOpenGroups() {
    try {
      const raw = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) || "null");
      if (raw && typeof raw === "object") return raw;
    } catch (_error) { /* ignore */ }
    return {
      dashboard: true,
      programs: true,
      testing: true,
      curriculum: true,
      business: false,
      platform: false,
    };
  }

  function writeOpenGroups(state) {
    try {
      localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(state));
    } catch (_error) { /* ignore */ }
  }

  function activeTab() {
    return typeof global.getAdminSectionTab === "function"
      ? global.getAdminSectionTab()
      : (global.adminActiveSectionTab || "admin-home");
  }

  function currentFocus() {
    try { return sessionStorage.getItem("llhAdminCcFocus") || ""; } catch (_error) { return ""; }
  }

  function shellVersion() {
    try {
      const link = document.querySelector('link[href*="llh-admin-workspace.css"]');
      const match = String(link?.href || "").match(/[?&]v=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
    } catch (_error) { /* ignore */ }
    return "testing";
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

  function renderNav(nav, options = {}) {
    if (!nav) return false;
    if (!isTestingAdmin()) return false;
    const currentTab = options.activeTab || activeTab();
    const activeGroup = TAB_TO_GROUP[currentTab] || "dashboard";
    const openGroups = readOpenGroups();
    if (activeGroup) openGroups[activeGroup] = true;
    const unread = Number(options.unreadCount || 0);
    const focus = currentFocus();
    const focusValid = NAV_GROUPS.some((g) => g.items.some((i) => i.tab === currentTab && i.focus === focus));
    const effectiveFocus = focusValid ? focus : "";

    nav.classList.add("admin-control-center-nav");
    document.body.classList.add("llh-admin-control-center");
    document.querySelector("#view-admin")?.classList.add("admin-control-center-active");

    nav.innerHTML = `
      <div class="admin-cc-topbar-mobile">
        <button type="button" class="admin-cc-menu-toggle" data-admin-cc-toggle aria-expanded="false" aria-controls="adminCcNavBody">
          Menu
        </button>
        <div class="admin-cc-mobile-title">
          <strong>Little Learner Hub</strong>
          <span>Admin</span>
        </div>
      </div>
      <div class="admin-sidebar-brand admin-cc-brand">
        <p class="admin-cc-brand-kicker">Little Learner Hub</p>
        <strong>Admin</strong>
        <span>Owner control center · Testing</span>
      </div>
      <div id="adminCcNavBody" class="admin-sidebar-nav admin-cc-nav-body" role="navigation" aria-label="Admin control center">
        ${NAV_GROUPS.map((group) => {
          const open = openGroups[group.id] !== false;
          return `
            <section class="admin-cc-group${open ? " is-open" : ""}" data-admin-cc-group="${group.id}">
              <button type="button" class="admin-cc-group-toggle" data-admin-cc-group-toggle="${group.id}" aria-expanded="${open}">
                <span>${group.label}</span>
                <span class="admin-cc-chevron" aria-hidden="true">${open ? "▾" : "▸"}</span>
              </button>
              <div class="admin-cc-group-items" ${open ? "" : "hidden"}>
                ${group.items.map((item) => {
                  const isActive = currentTab === item.tab && (item.focus || "") === effectiveFocus;
                  const notifBadge = item.tab === "admin-notifications" && unread
                    ? `<span class="admin-nav-badge">${unread > 99 ? "99+" : unread}</span>`
                    : "";
                  return `
                    <button
                      type="button"
                      class="admin-sidebar-btn admin-cc-item${isActive ? " active" : ""}"
                      data-admin-section-tab="${item.tab}"
                      ${item.focus ? `data-admin-cc-focus="${item.focus}"` : ""}
                      aria-current="${isActive ? "page" : "false"}"
                    >
                      <span>${item.label}</span>
                      ${notifBadge}
                    </button>
                  `;
                }).join("")}
              </div>
            </section>
          `;
        }).join("")}
      </div>
      <div class="admin-sidebar-footer admin-cc-footer">
        <button class="ghost-button admin-sidebar-btn" type="button" data-admin-lock>Lock Admin</button>
        <button class="admin-cc-return-link" type="button" data-admin-return-site>Return to site</button>
      </div>
    `;
    return true;
  }

  function wireNav(nav) {
    if (!nav || nav.dataset.adminCcWired === "true") return;
    nav.dataset.adminCcWired = "true";
    nav.addEventListener("click", (event) => {
      const toggleMenu = event.target.closest("[data-admin-cc-toggle]");
      if (toggleMenu) {
        const open = !document.body.classList.contains("admin-cc-drawer-open");
        document.body.classList.toggle("admin-cc-drawer-open", open);
        toggleMenu.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }

      const groupToggle = event.target.closest("[data-admin-cc-group-toggle]");
      if (groupToggle) {
        const groupId = groupToggle.getAttribute("data-admin-cc-group-toggle");
        const section = nav.querySelector(`[data-admin-cc-group="${groupId}"]`);
        const items = section?.querySelector(".admin-cc-group-items");
        const open = !(section?.classList.contains("is-open"));
        section?.classList.toggle("is-open", open);
        if (items) items.hidden = !open;
        groupToggle.setAttribute("aria-expanded", open ? "true" : "false");
        const chevron = groupToggle.querySelector(".admin-cc-chevron");
        if (chevron) chevron.textContent = open ? "▾" : "▸";
        const state = readOpenGroups();
        state[groupId] = open;
        writeOpenGroups(state);
        return;
      }

      const returnSite = event.target.closest("[data-admin-return-site]");
      if (returnSite) {
        event.preventDefault();
        document.body.classList.remove("admin-cc-drawer-open", "llh-admin-control-center");
        if (typeof global.setView === "function") global.setView("home", { allowDashboard: true });
        return;
      }

      const item = event.target.closest("[data-admin-section-tab]");
      if (item) {
        document.body.classList.remove("admin-cc-drawer-open");
        const focus = item.getAttribute("data-admin-cc-focus") || "";
        try {
          if (focus) sessionStorage.setItem("llhAdminCcFocus", focus);
          else sessionStorage.removeItem("llhAdminCcFocus");
        } catch (_error) { /* ignore */ }
      }
    });
  }

  function applyFocusAfterRender() {
    const focus = currentFocus();
    if (!focus) return;
    window.setTimeout(() => {
      if (focus === "view-as") {
        document.querySelector("#adminTestingCenter, .admin-testing-center")?.scrollIntoView({ block: "start", behavior: "smooth" });
        document.querySelector("[data-admin-preview='Owner'], .admin-testing-center-block")?.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (focus === "teaching-kit") {
        document.querySelector("#adminContentManagerApp, .admin-content-manager-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
      } else if (focus === "ai-builder") {
        document.querySelector("#fcAiChat, #feAiBuilder, [data-fc-jump='fcAiChat'], .admin-cc-ai-builder")?.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }, 250);
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

  function renderPlaceholder(target, options) {
    if (!target) return;
    const { eyebrow, title, detail, actions = [] } = options;
    target.innerHTML = `
      ${pageHeading(eyebrow, title, detail)}
      <div class="admin-cc-panel">
        <div class="admin-cc-action-row">
          ${actions.map((action) => `
            <button type="button" class="${action.primary ? "primary-button" : "ghost-button"}" data-admin-section-tab="${action.tab}" ${action.focus ? `data-admin-cc-focus="${action.focus}"` : ""}>
              ${escapeHtml(action.label)}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderFormsCenterAdmin(target) {
    if (!target) return;
    const hub = global.FormsCenter?.hubHtml?.()
      || [
        global.FormsEcosystem?.dashboardHtml?.() || "",
        global.FormsEcosystem?.libraryHtml?.() || "",
      ].join("");
    target.innerHTML = `
      ${pageHeading(
        "Curriculum",
        "Forms Center",
        "Paperwork dashboard for the testing sandbox. Stays inside Admin.",
        `<button type="button" class="ghost-button" data-admin-section-tab="forms-ai-builder">AI Form Builder</button>
         <button type="button" class="ghost-button" data-admin-section-tab="forms">Forms library manager</button>`,
      )}
      <div class="admin-cc-forms-host admin-cc-panel">${hub || `<p class="muted-copy">Forms Center modules are still loading. Refresh Admin, then open this page again.</p>`}</div>
    `;
    try {
      global.FormsCenter?.deepenPlatformConnections?.();
      global.FormsEcosystem?.bind?.(target);
    } catch (_error) { /* ignore */ }
  }

  function renderAiFormBuilderAdmin(target) {
    if (!target) return;
    const builder = global.FormsEcosystem?.aiBuilderHtml?.()
      || global.FormsCenter?.hubHtml?.()
      || "";
    target.innerHTML = `
      ${pageHeading(
        "Curriculum",
        "AI Form Builder",
        "Draft and refine childcare forms with AI — without leaving Admin.",
        `<button type="button" class="ghost-button" data-admin-section-tab="forms-center">Back to Forms Center</button>`,
      )}
      <div class="admin-cc-forms-host admin-cc-panel admin-cc-ai-builder">${builder || `<p class="muted-copy">AI Form Builder is still loading. Open Forms Center, then try again.</p>`}</div>
    `;
    try {
      global.FormsEcosystem?.bind?.(target);
      global.FormsCenter?.deepenPlatformConnections?.();
      window.setTimeout(() => {
        document.querySelector("[data-fc-jump='fcAiChat'], [data-fe-jump='feAiBuilder']")?.click();
      }, 100);
    } catch (_error) { /* ignore */ }
  }

  function renderCurriculumSyncAdmin(target) {
    if (!target) return;
    target.innerHTML = `
      ${pageHeading(
        "Curriculum",
        "Curriculum Sync",
        "Pull production lesson plans into this testing sandbox. Never deletes testing data and never writes to production.",
        `<button type="button" class="ghost-button" data-admin-section-tab="dashboard">Open Testing Center</button>`,
      )}
      <section class="admin-cc-panel admin-testing-center admin-cc-sync-panel">
        <div class="admin-testing-center-block admin-curriculum-sync-block" id="adminCurriculumSyncBlock" data-admin-curriculum-sync>
          <p class="admin-testing-center-label">Production curriculum</p>
          <div id="adminCurriculumSyncStatus" class="admin-curriculum-sync-status" aria-live="polite">
            <p class="muted-copy">Loading sync status…</p>
          </div>
          <div class="account-actions-row admin-preview-mode-row" role="group" aria-label="Curriculum sync">
            <button type="button" class="primary-button" data-admin-testing-action="sync-production-curriculum">Sync Production Curriculum</button>
            <button type="button" class="ghost-button" data-admin-testing-action="refresh-curriculum-sync-status">Refresh status</button>
          </div>
        </div>
      </section>
    `;
    if (typeof global.refreshAdminCurriculumSyncStatus === "function") {
      global.refreshAdminCurriculumSyncStatus().catch(() => {});
    }
  }

  function renderInviteTester(target) {
    renderPlaceholder(target, {
      eyebrow: "Testing",
      title: "Invite Tester",
      detail: "Invite real testers for this sandbox. Role simulation stays in Multi-Role Tester / Testing Center.",
      actions: [
        { tab: "dashboard", label: "Open Testing Center invites", primary: true },
        { tab: "users", label: "View users" },
      ],
    });
  }

  function renderPrograms(target) {
    renderPlaceholder(target, {
      eyebrow: "Programs",
      title: "Programs",
      detail: "Program overview for the testing sandbox. Seed demo data from Testing Center or inspect accounts in Users.",
      actions: [
        { tab: "users", label: "Open Users", primary: true },
        { tab: "staff", label: "Staff" },
        { tab: "admin-classrooms", label: "Classrooms" },
        { tab: "dashboard", label: "Testing Center" },
      ],
    });
  }

  function renderStaff(target) {
    renderPlaceholder(target, {
      eyebrow: "Programs",
      title: "Staff",
      detail: "Staff and role access for testing programs. Use Multi-Role Tester for instant role simulation.",
      actions: [
        { tab: "users", label: "Open Users", primary: true },
        { tab: "dashboard", label: "Multi-Role Tester", focus: "view-as" },
      ],
    });
  }

  function renderChildren(target) {
    renderPlaceholder(target, {
      eyebrow: "Programs",
      title: "Children",
      detail: "Child records used in testing. Seed demo children from Testing Center without leaving Admin.",
      actions: [
        { tab: "dashboard", label: "Seed demo children", primary: true },
        { tab: "admin-families", label: "Families" },
      ],
    });
  }

  function renderClassrooms(target) {
    renderPlaceholder(target, {
      eyebrow: "Programs",
      title: "Classrooms",
      detail: "Classroom structure for testing programs.",
      actions: [
        { tab: "programs", label: "Programs", primary: true },
        { tab: "dashboard", label: "Open Testing Center" },
      ],
    });
  }

  function renderFamilies(target) {
    renderPlaceholder(target, {
      eyebrow: "Programs",
      title: "Families",
      detail: "Family Hub and parent-linked testing accounts. Invite testers or open View As Parent from Testing Center.",
      actions: [
        { tab: "add-tester", label: "Invite Tester", primary: true },
        { tab: "dashboard", label: "Multi-Role / View As Parent", focus: "view-as" },
        { tab: "users", label: "Users" },
      ],
    });
  }

  function renderTesterActivity(target) {
    renderPlaceholder(target, {
      eyebrow: "Testing",
      title: "Tester Activity",
      detail: "Recent tester-related activity from analytics and feedback — stays in Admin.",
      actions: [
        { tab: "analytics", label: "Open Analytics", primary: true },
        { tab: "feedback", label: "Tester Feedback" },
        { tab: "user-health", label: "User Health" },
      ],
    });
  }

  function metricCard(label, value, detail, tab) {
    const tag = tab ? "button" : "article";
    const attrs = tab
      ? `type="button" class="admin-cc-metric admin-cc-metric-btn" data-admin-section-tab="${tab}"`
      : `class="admin-cc-metric"`;
    return `
      <${tag} ${attrs}>
        <span class="admin-cc-metric-label">${escapeHtml(label)}</span>
        <strong class="admin-cc-metric-value">${escapeHtml(value)}</strong>
        <span class="admin-cc-metric-detail">${escapeHtml(detail)}</span>
      </${tag}>
    `;
  }

  async function fetchJson(url, timeoutMs = 12000) {
    const token = adminToken();
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers,
        signal: controller?.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
      return data;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function loadCommandCenterStats() {
    const stats = {
      users: "—",
      activeTesters: "—",
      feedback: "—",
      openIssues: "—",
      prodLessons: "—",
      testLessons: "—",
      syncStatus: "Checking…",
      health: "Checking…",
      aiActivity: "—",
      deploy: shellVersion(),
      unread: "—",
    };

    const tasks = [];

    tasks.push(
      fetchJson(`/api/admin/analytics?_=${Date.now()}`)
        .then((payload) => {
          const data = payload.analytics || payload;
          const totals = data.totals || {};
          const users = Array.isArray(data.users) ? data.users : [];
          const userCount = users.length
            || Number(totals.totalRegisteredUsers || totals.users || totals.totalUsers || 0);
          stats.users = String(userCount || "0");
          const testerish = users.filter((u) => {
            const plan = String(u.membershipPlan || u.plan || "").toLowerCase();
            const email = String(u.email || "").toLowerCase();
            const role = String(u.role || u.accountType || "").toLowerCase();
            return /test|tester|preview/.test(email) || plan.includes("test") || /tester|parent|staff/.test(role);
          });
          stats.activeTesters = String(
            testerish.length
            || Number(totals.activeUsers || totals.activeUsersWeek || totals.active || 0)
            || "0",
          );
          const feedback = Array.isArray(data.feedback) ? data.feedback : [];
          const openFeedback = feedback.filter((f) => !/resolved|archived|closed/i.test(String(f.status || "new")));
          stats.feedback = String(
            openFeedback.length
            || Number(totals.openFeedback || totals.feedback || 0)
            || "0",
          );
          const tickets = Array.isArray(data.supportTickets) ? data.supportTickets : [];
          const openTickets = tickets.filter((t) => !/resolved|closed|archived|complete/i.test(String(t.status || "open")));
          const openIssues = openTickets.length
            + openFeedback.length
            + Number(totals.openSupportTickets || 0)
            + Number(totals.openBugReports || 0)
            + Number(totals.openFeatureRequests || 0);
          stats.openIssues = String(openIssues || "0");
          const events = Array.isArray(data.recentEvents) ? data.recentEvents : [];
          const aiEvents = events.filter((e) => /ai|openai|prompt|form.builder|generate/i.test(String(e.name || e.type || "")));
          stats.aiActivity = aiEvents.length
            ? `${aiEvents.length} recent AI events`
            : (events[0] ? `Last: ${events[0].name || "activity"}` : "No recent AI events");
          if (!stats.testLessons || stats.testLessons === "—") {
            const published = Number(totals.publishedLessonPlans || 0);
            if (published) stats.testLessons = String(published);
          }
        })
        .catch(() => {
          stats.users = "Unavailable";
          stats.feedback = "Unavailable";
        }),
    );

    tasks.push(
      fetchJson("/api/admin/curriculum/production-sync/status")
        .then((data) => {
          const summary = data.summary || {};
          stats.prodLessons = String(summary.productionLessonCount ?? summary.productionPublicLessonCount ?? "—");
          stats.testLessons = String(summary.testingLessonCount ?? "—");
          stats.syncStatus = summary.statusLabel
            || (summary.status === "in_sync" ? "In sync" : String(summary.status || "Unknown"));
        })
        .catch(() => {
          stats.syncStatus = "Unavailable";
        }),
    );

    tasks.push(
      fetchJson("/api/launch-readiness")
        .then((data) => {
          const ready = data.ready === true || data.status === "READY" || data.overall === "READY";
          stats.health = ready ? "Ready" : (data.status || data.overall || "Needs attention");
        })
        .catch(async () => {
          try {
            const health = await fetchJson("/api/health");
            stats.health = health?.ok === false ? "Attention" : "Healthy";
          } catch (_error) {
            stats.health = "Unknown";
          }
        }),
    );

    tasks.push(
      fetchJson("/api/admin/notifications?limit=20")
        .then((data) => {
          stats.unread = String(data.unreadCount ?? (data.items || []).filter((i) => !i.readAt).length ?? "0");
        })
        .catch(() => {
          try {
            stats.unread = String(global.adminNotificationState?.unreadCount ?? "—");
          } catch (_error) {
            stats.unread = "—";
          }
        }),
    );

    await Promise.allSettled(tasks);
    return stats;
  }

  function paintCommandCenter(target, stats, loading) {
    if (!target) return;
    target.innerHTML = `
      ${pageHeading(
        "Dashboard",
        "Admin Home",
        "Your command center for Little Learner Hub. Manage the platform here — the provider site stays separate.",
      )}
      <section class="admin-cc-metrics" aria-label="Platform snapshot">
        ${metricCard("Platform health", loading ? "…" : stats.health, "Launch readiness", "system-health")}
        ${metricCard("Users", loading ? "…" : stats.users, "Accounts on this site", "users")}
        ${metricCard("Active testers", loading ? "…" : stats.activeTesters, "Tester-linked accounts", "dashboard")}
        ${metricCard("New feedback", loading ? "…" : stats.feedback, "Open tester feedback", "feedback")}
        ${metricCard("Production lessons", loading ? "…" : stats.prodLessons, "Source inventory", "curriculum-sync")}
        ${metricCard("Testing lessons", loading ? "…" : stats.testLessons, stats.syncStatus, "curriculum-sync")}
        ${metricCard("Notifications", loading ? "…" : stats.unread, "Unread owner alerts", "admin-notifications")}
        ${metricCard("Open issues", loading ? "…" : stats.openIssues, "Tickets + feedback", "support")}
      </section>

      <div class="admin-cc-home-split">
        <section class="admin-cc-panel">
          <h3>Operations</h3>
          <dl class="admin-cc-dl">
            <div><dt>Curriculum sync</dt><dd>${escapeHtml(loading ? "Checking…" : stats.syncStatus)}</dd></div>
            <div><dt>Latest deploy</dt><dd><code>${escapeHtml(stats.deploy)}</code></dd></div>
            <div><dt>Recent AI activity</dt><dd>${escapeHtml(loading ? "Loading…" : stats.aiActivity)}</dd></div>
          </dl>
        </section>
        <section class="admin-cc-panel">
          <h3>Quick actions</h3>
          <div class="admin-cc-quick-grid">
            <button type="button" class="admin-cc-quick" data-admin-section-tab="dashboard">Testing Center</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="forms-center">Forms Center</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="forms-ai-builder">AI Form Builder</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="curriculum-lesson-plans" data-admin-cc-focus="teaching-kit">Teaching Kits</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="curriculum-sync">Curriculum Sync</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="curriculum-lesson-plans">Lesson Manager</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="users">Users</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="analytics">Analytics</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="messages-conversations">Messages</button>
            <button type="button" class="admin-cc-quick" data-admin-section-tab="feedback">Feedback</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderAdminHomeControlCenter(target) {
    if (!target) return;
    paintCommandCenter(target, {
      users: "…",
      activeTesters: "…",
      feedback: "…",
      openIssues: "…",
      prodLessons: "…",
      testLessons: "…",
      syncStatus: "Checking…",
      health: "Checking…",
      aiActivity: "Loading…",
      deploy: shellVersion(),
      unread: "…",
    }, true);
    loadCommandCenterStats().then((stats) => {
      if (activeTab() !== "admin-home") return;
      paintCommandCenter(target, stats, false);
    });
  }

  function tryRenderLanding(tab, target) {
    if (!isTestingAdmin() || !target) return false;
    if (tab === "admin-home") {
      renderAdminHomeControlCenter(target);
      return true;
    }
    if (tab === "forms-center") {
      renderFormsCenterAdmin(target);
      return true;
    }
    if (tab === "forms-ai-builder") {
      renderAiFormBuilderAdmin(target);
      return true;
    }
    if (tab === "curriculum-sync") {
      renderCurriculumSyncAdmin(target);
      return true;
    }
    if (tab === "add-tester") {
      renderInviteTester(target);
      return true;
    }
    if (tab === "programs") {
      renderPrograms(target);
      return true;
    }
    if (tab === "staff") {
      renderStaff(target);
      return true;
    }
    if (tab === "admin-children") {
      renderChildren(target);
      return true;
    }
    if (tab === "admin-classrooms") {
      renderClassrooms(target);
      return true;
    }
    if (tab === "admin-families") {
      renderFamilies(target);
      return true;
    }
    if (tab === "tester-activity") {
      renderTesterActivity(target);
      return true;
    }
    return false;
  }

  global.AdminControlCenter = {
    NAV_GROUPS,
    TAB_TO_GROUP,
    isTestingAdmin,
    renderNav,
    wireNav,
    applyFocusAfterRender,
    tryRenderLanding,
    EXTRA_LANDING_TABS,
  };
})(typeof window !== "undefined" ? window : globalThis);
