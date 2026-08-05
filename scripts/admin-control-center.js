/**
 * Testing-only Admin Control Center navigation.
 * Loaded after app.js. Fenced by isHomeDaycareHubTestingEnabled().
 */
(function initAdminControlCenter(global) {
  const OPEN_GROUPS_KEY = "llhAdminControlCenterOpenGroups";

  const NAV_GROUPS = [
    {
      id: "overview",
      label: "Overview",
      items: [
        { tab: "admin-home", label: "Admin Home" },
        { tab: "system-health", label: "System Health" },
        { tab: "admin-notifications", label: "Notifications" },
      ],
    },
    {
      id: "users-programs",
      label: "Users and Programs",
      items: [
        { tab: "users", label: "Users" },
        { tab: "programs", label: "Programs" },
        { tab: "staff", label: "Staff" },
        { tab: "admin-children", label: "Children" },
        { tab: "admin-classrooms", label: "Classrooms" },
      ],
    },
    {
      id: "testing",
      label: "Testing",
      items: [
        { tab: "dashboard", label: "Testing Center" },
        { tab: "add-tester", label: "Add Tester" },
        { tab: "dashboard", label: "View As", focus: "view-as" },
        { tab: "feedback", label: "Tester Feedback" },
        { tab: "tester-activity", label: "Tester Activity" },
      ],
    },
    {
      id: "curriculum",
      label: "Curriculum",
      items: [
        { tab: "curriculum-lesson-plans", label: "Lesson Plans" },
        { tab: "curriculum-lesson-plans", label: "Teaching Kit Editor", focus: "teaching-kit" },
        { tab: "curriculum-activities", label: "Activities" },
        { tab: "forms-center", label: "Forms Center" },
        { tab: "curriculum-sync", label: "Curriculum Sync" },
        { tab: "content-health", label: "Content Health" },
      ],
    },
    {
      id: "business",
      label: "Business",
      items: [
        { tab: "billing-home", label: "Billing" },
        { tab: "trial-usage", label: "Subscriptions" },
        { tab: "marketing-analytics", label: "Marketing" },
        { tab: "emails", label: "Email" },
        { tab: "analytics", label: "Analytics" },
        { tab: "messages-conversations", label: "Messages" },
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

  function isTestingAdmin() {
    return typeof global.isHomeDaycareHubTestingEnabled === "function"
      && global.isHomeDaycareHubTestingEnabled();
  }

  function readOpenGroups() {
    try {
      const raw = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) || "null");
      if (raw && typeof raw === "object") return raw;
    } catch (_error) { /* ignore */ }
    return {
      overview: true,
      "users-programs": true,
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

  function renderNav(nav, options = {}) {
    if (!nav) return false;
    if (!isTestingAdmin()) return false;
    const currentTab = options.activeTab || activeTab();
    const activeGroup = TAB_TO_GROUP[currentTab] || "overview";
    const openGroups = readOpenGroups();
    if (activeGroup) openGroups[activeGroup] = true;
    const unread = Number(options.unreadCount || 0);

    nav.classList.add("admin-control-center-nav");
    document.body.classList.add("llh-admin-control-center");
    document.querySelector("#view-admin")?.classList.add("admin-control-center-active");

    nav.innerHTML = `
      <div class="admin-cc-topbar-mobile">
        <button type="button" class="admin-cc-menu-toggle" data-admin-cc-toggle aria-expanded="false" aria-controls="adminCcNavBody">
          Menu
        </button>
        <div class="admin-cc-mobile-title">
          <strong>Admin Control Center</strong>
          <span>Testing</span>
        </div>
      </div>
      <div class="admin-sidebar-brand admin-cc-brand">
        <strong>Admin Control Center</strong>
        <span>Testing · separate from member site</span>
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
                  let focus = "";
                  try { focus = sessionStorage.getItem("llhAdminCcFocus") || ""; } catch (_error) { focus = ""; }
                  const focusValid = NAV_GROUPS.some((g) => g.items.some((i) => i.tab === currentTab && i.focus === focus));
                  const effectiveFocus = focusValid ? focus : "";
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
        <button class="primary-button admin-sidebar-btn" type="button" data-admin-return-site>Return to site</button>
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
        if (focus) {
          try { sessionStorage.setItem("llhAdminCcFocus", focus); } catch (_error) { /* ignore */ }
        } else {
          try { sessionStorage.removeItem("llhAdminCcFocus"); } catch (_error) { /* ignore */ }
        }
      }
    });
  }

  function applyFocusAfterRender() {
    let focus = "";
    try { focus = sessionStorage.getItem("llhAdminCcFocus") || ""; } catch (_error) { focus = ""; }
    if (!focus) return;
    window.setTimeout(() => {
      if (focus === "view-as") {
        document.querySelector("#adminTestingCenter, .admin-testing-center")?.scrollIntoView({ block: "start", behavior: "smooth" });
        document.querySelector("[data-admin-preview='Owner'], .admin-testing-center-block")?.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (focus === "teaching-kit") {
        document.querySelector("#adminContentManagerApp, .admin-content-manager-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }, 250);
  }

  function renderPlaceholder(target, options) {
    if (!target) return;
    const { eyebrow, title, detail, actions = [] } = options;
    target.innerHTML = `
      <div class="section-heading admin-cc-page-heading">
        <div>
          <p class="eyebrow">${eyebrow}</p>
          <h3>${title}</h3>
          <p class="muted-copy">${detail}</p>
        </div>
      </div>
      <div class="admin-cc-action-row">
        ${actions.map((action) => `
          <button type="button" class="${action.primary ? "primary-button" : "ghost-button"}" data-admin-section-tab="${action.tab}">
            ${action.label}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderFormsCenterAdmin(target) {
    if (!target) return;
    const hub = global.FormsCenter?.hubHtml?.()
      || [
        global.FormsEcosystem?.dashboardHtml?.() || "",
        global.FormsEcosystem?.libraryHtml?.() || "",
        global.FormsEcosystem?.aiBuilderHtml?.() || "",
      ].join("");
    target.innerHTML = `
      <div class="section-heading admin-cc-page-heading">
        <div>
          <p class="eyebrow">Curriculum</p>
          <h3>Forms Center</h3>
          <p class="muted-copy">Admin view of the Forms Center paperwork system. Stays inside Admin — does not open the member site.</p>
        </div>
        <div class="account-actions-row">
          <button type="button" class="ghost-button" data-admin-section-tab="forms">Open Forms library manager</button>
        </div>
      </div>
      <div class="admin-cc-forms-host">${hub || `<p class="muted-copy">Forms Center modules are still loading. Refresh Admin, then open this page again.</p>`}</div>
    `;
    try {
      global.FormsCenter?.deepenPlatformConnections?.();
      global.FormsEcosystem?.bind?.(target);
    } catch (_error) { /* ignore */ }
  }

  function renderCurriculumSyncAdmin(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading admin-cc-page-heading">
        <div>
          <p class="eyebrow">Curriculum</p>
          <h3>Curriculum Sync</h3>
          <p class="muted-copy">Pull production lesson plans into this testing sandbox. Never deletes testing data and never writes to production.</p>
        </div>
        <div class="account-actions-row">
          <button type="button" class="ghost-button" data-admin-section-tab="dashboard">Open full Testing Center</button>
        </div>
      </div>
      <section class="section-block admin-testing-center admin-cc-sync-panel">
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

  function renderAddTester(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading admin-cc-page-heading">
        <div>
          <p class="eyebrow">Testing</p>
          <h3>Add Tester</h3>
          <p class="muted-copy">Invite real testers from Admin without dropping into the member site. Role simulation stays in Testing Center → View As.</p>
        </div>
      </div>
      <div class="admin-cc-home-grid">
        <article class="admin-cc-home-card">
          <p class="eyebrow">Invite</p>
          <h4>Family Hub / tester invites</h4>
          <p class="muted-copy">Open Testing Center to send invites and manage tester access for this sandbox.</p>
          <button type="button" class="primary-button" data-admin-section-tab="dashboard" data-admin-cc-focus="view-as">Open Testing Center</button>
        </article>
        <article class="admin-cc-home-card">
          <p class="eyebrow">Accounts</p>
          <h4>Existing users</h4>
          <p class="muted-copy">Review accounts already on the testing site.</p>
          <button type="button" class="ghost-button" data-admin-section-tab="users">Open Users</button>
        </article>
      </div>
    `;
  }

  function renderPrograms(target) {
    renderPlaceholder(target, {
      eyebrow: "Users and Programs",
      title: "Programs",
      detail: "Program overview for testing. Manage linked users and staff from Users, or open Testing Center to seed demo data.",
      actions: [
        { tab: "users", label: "Open Users", primary: true },
        { tab: "dashboard", label: "Testing Center" },
        { tab: "staff", label: "Staff" },
      ],
    });
  }

  function renderStaff(target) {
    renderPlaceholder(target, {
      eyebrow: "Users and Programs",
      title: "Staff",
      detail: "Staff and role access for testing programs. Use Users for account records and Testing Center → View As for role simulation.",
      actions: [
        { tab: "users", label: "Open Users", primary: true },
        { tab: "dashboard", label: "View As roles" },
      ],
    });
  }

  function renderChildren(target) {
    renderPlaceholder(target, {
      eyebrow: "Users and Programs",
      title: "Children",
      detail: "Admin overview for child records used in testing. Seed demo children from Testing Center without leaving Admin.",
      actions: [
        { tab: "dashboard", label: "Seed demo children", primary: true },
        { tab: "users", label: "Open Users" },
      ],
    });
  }

  function renderClassrooms(target) {
    renderPlaceholder(target, {
      eyebrow: "Users and Programs",
      title: "Classrooms",
      detail: "Classroom structure for testing programs. Use Testing Center tools and Users to inspect linked accounts.",
      actions: [
        { tab: "dashboard", label: "Open Testing Center", primary: true },
        { tab: "programs", label: "Programs" },
      ],
    });
  }

  function renderTesterActivity(target) {
    renderPlaceholder(target, {
      eyebrow: "Testing",
      title: "Tester Activity",
      detail: "Review recent tester-related activity from analytics and user health without leaving the Admin shell.",
      actions: [
        { tab: "analytics", label: "Open Analytics", primary: true },
        { tab: "user-health", label: "User Health" },
        { tab: "feedback", label: "Tester Feedback" },
      ],
    });
  }

  function renderAdminHomeControlCenter(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading admin-cc-page-heading">
        <div>
          <p class="eyebrow">Overview</p>
          <h3>Admin Home</h3>
          <p class="muted-copy">Separate control center for testing. Use the Admin sidebar to move between sections — you will not be sent back to the member site.</p>
        </div>
      </div>
      <div class="admin-cc-home-grid">
        <article class="admin-cc-home-card">
          <p class="eyebrow">Testing</p>
          <h4>Testing Center</h4>
          <p class="muted-copy">View As, Testing Pro, invites, and curriculum sync.</p>
          <button type="button" class="primary-button" data-admin-section-tab="dashboard">Open Testing Center</button>
        </article>
        <article class="admin-cc-home-card">
          <p class="eyebrow">Curriculum</p>
          <h4>Teaching Kit &amp; Forms</h4>
          <p class="muted-copy">Lesson plans, Teaching Kit editor, and Forms Center.</p>
          <div class="admin-cc-action-row">
            <button type="button" class="ghost-button" data-admin-section-tab="curriculum-lesson-plans">Lesson Plans</button>
            <button type="button" class="ghost-button" data-admin-section-tab="forms-center">Forms Center</button>
          </div>
        </article>
        <article class="admin-cc-home-card">
          <p class="eyebrow">Users</p>
          <h4>Accounts &amp; programs</h4>
          <p class="muted-copy">Users, staff, and program tools for the testing sandbox.</p>
          <button type="button" class="ghost-button" data-admin-section-tab="users">Open Users</button>
        </article>
        <article class="admin-cc-home-card">
          <p class="eyebrow">Platform</p>
          <h4>Health &amp; alerts</h4>
          <p class="muted-copy">System health and owner notifications.</p>
          <div class="admin-cc-action-row">
            <button type="button" class="ghost-button" data-admin-section-tab="system-health">System Health</button>
            <button type="button" class="ghost-button" data-admin-section-tab="admin-notifications">Notifications</button>
          </div>
        </article>
      </div>
    `;
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
    if (tab === "curriculum-sync") {
      renderCurriculumSyncAdmin(target);
      return true;
    }
    if (tab === "add-tester") {
      renderAddTester(target);
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
    EXTRA_LANDING_TABS: [
      "forms-center",
      "curriculum-sync",
      "add-tester",
      "programs",
      "staff",
      "admin-children",
      "admin-classrooms",
      "tester-activity",
    ],
  };
})(typeof window !== "undefined" ? window : globalThis);
