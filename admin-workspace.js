/**
 * Admin workspace — owner-friendly navigation, landing pages, loading helpers.
 * Scoped to #view-admin only. Loaded after app.js.
 */
(function adminWorkspaceModule() {
  const ADMIN_FETCH_TIMEOUT_MS = 20000;
  const pendingAdminRequests = new Map();

  function adminFetchWithTimeout(url, options = {}, timeoutMs = ADMIN_FETCH_TIMEOUT_MS) {
    const key = `${(options.method || "GET").toUpperCase()}:${url}`;
    if (pendingAdminRequests.has(key)) return pendingAdminRequests.get(key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const token = typeof adminSession === "function" ? adminSession()?.token : "";
    const headers = { ...(options.headers || {}) };
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    const promise = fetch(url, { ...options, headers, signal: controller.signal, cache: "no-store" })
      .finally(() => {
        clearTimeout(timer);
        pendingAdminRequests.delete(key);
      });
    pendingAdminRequests.set(key, promise);
    return promise;
  }

  function adminAsyncShell(message, extraHtml = "") {
    return `
      <div class="admin-async-state" role="status" data-admin-async="loading">
        <p><strong>${escapeHtml(message || "Loading…")}</strong></p>
        ${extraHtml}
      </div>
    `;
  }

  function adminAsyncError(message, retryAttr) {
    return `
      <div class="admin-async-state is-error" role="alert" data-admin-async="error">
        <p><strong>${escapeHtml(message || "Something went wrong.")}</strong></p>
        <p class="muted-copy">Please try again. If this keeps happening, check System Health.</p>
        ${retryAttr ? `<button type="button" class="primary-button" ${retryAttr}>Retry</button>` : ""}
      </div>
    `;
  }

  const THEME_ALIAS_GROUPS = [
    ["Music & Movement", "Music and Movement"],
    ["Five Senses", "My Five Senses", "My Senses"],
    ["Zoo Adventure", "Zoo Adventures"],
  ];

  function normalizeThemeKey(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function collectThemeTaxonomyAudit() {
    const themeCounts = new Map();
    const addTheme = (value, source, id) => {
      const raw = String(value || "").trim();
      if (!raw) return;
      const key = normalizeThemeKey(raw);
      if (!themeCounts.has(key)) themeCounts.set(key, { labels: new Map(), sources: [] });
      const entry = themeCounts.get(key);
      entry.labels.set(raw, (entry.labels.get(raw) || 0) + 1);
      entry.sources.push({ source, id, label: raw });
    };
    try {
      (typeof curriculumLessonPlansForAdmin === "function" ? curriculumLessonPlansForAdmin() : []).forEach((plan) => {
        addTheme(plan.theme, "lesson-plan", plan.id);
      });
    } catch { /* optional */ }
    try {
      (typeof curriculumActivitiesForAdmin === "function" ? curriculumActivitiesForAdmin() : []).forEach((act) => {
        addTheme(act.theme, "activity", act.id);
      });
    } catch { /* optional */ }
    const aliasFindings = THEME_ALIAS_GROUPS.map((group) => {
      const matches = group.map((label) => {
        const key = normalizeThemeKey(label);
        const entry = themeCounts.get(key);
        return { label, count: entry ? [...entry.labels.values()].reduce((a, b) => a + b, 0) : 0 };
      });
      const total = matches.reduce((sum, m) => sum + m.count, 0);
      const variants = matches.filter((m) => m.count > 0);
      return { group, matches, total, variants, needsCleanup: variants.length > 1 };
    }).filter((row) => row.total > 0);
    const nearDuplicates = [];
    const keys = [...themeCounts.keys()];
    keys.forEach((keyA, index) => {
      for (let i = index + 1; i < keys.length; i += 1) {
        const keyB = keys[i];
        if (keyA === keyB) continue;
        if (keyA.includes(keyB) || keyB.includes(keyA)) {
          nearDuplicates.push({ a: themeCounts.get(keyA), b: themeCounts.get(keyB) });
        }
      }
    });
    return { themeCounts, aliasFindings, nearDuplicates };
  }

  function landingCard(title, description, tabId, eyebrow) {
    return `
      <article class="admin-landing-card">
        <p class="eyebrow">${escapeHtml(eyebrow || "Open")}</p>
        <h4>${escapeHtml(title)}</h4>
        <p class="muted-copy">${escapeHtml(description)}</p>
        <button type="button" class="ghost-button" data-admin-landing-tab="${escapeHtml(tabId)}">Open</button>
      </article>
    `;
  }

  function bindLandingTabs(container) {
    if (!container) return;
    container.querySelectorAll("[data-admin-landing-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-admin-landing-tab");
        if (tab && typeof setAdminSectionTab === "function") setAdminSectionTab(tab);
      });
    });
  }

  function renderAdminHomeWorkspace(target) {
    if (!target) return;
    const totals = adminAnalyticsCache?.totals || {};
    const unread = Number(adminNotificationState?.unreadCount || 0);
    const needsAttention = [];
    if (unread) needsAttention.push(`${unread} unread owner alert${unread === 1 ? "" : "s"}`);
    if (adminAnalyticsLastError) needsAttention.push("Analytics could not load");
    if (Number(totals.pastDueUsers || totals.failedPayments || 0) > 0) {
      needsAttention.push(`${Number(totals.pastDueUsers || totals.failedPayments)} billing review item(s)`);
    }
  const openTickets = Number(totals.openSupportTickets || 0);
    if (openTickets) needsAttention.push(`${openTickets} open support ticket(s)`);
    target.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Admin Home</p>
          <h3>Your calm owner workspace</h3>
          <p class="muted-copy">Signed in as ${escapeHtml(adminSession()?.email || adminOwnerAccount?.email || "owner")}. Detailed charts and developer tools live under Advanced.</p>
        </div>
        <div class="account-actions-row">
          <button class="primary-button" type="button" id="adminOpenNotificationsButton">
            Alerts${unread ? ` (${unread})` : ""}
          </button>
          <button class="ghost-button" type="button" id="adminRefreshAnalyticsButton" ${adminAnalyticsLoading ? "disabled" : ""}>
            ${adminAnalyticsLoading ? "Refreshing…" : "Refresh"}
          </button>
          <button class="ghost-button" type="button" id="adminLockButton">Lock Admin</button>
        </div>
      </div>
      <div class="admin-home-grid">
        <article class="admin-home-card">
          <p class="eyebrow">Start Here</p>
          <h4>Today at a glance</h4>
          <p class="muted-copy">Check alerts, messages, and billing before diving into content.</p>
          <ul class="muted-copy">
            <li>${escapeHtml(String(totals.totalRegisteredUsers ?? adminOwnerAccountRows().length))} registered users</li>
            <li>${escapeHtml(String(totals.activeUsersToday ?? "—"))} active today</li>
            <li>${escapeHtml(String(totals.newSignupsToday ?? "—"))} new signups today</li>
          </ul>
        </article>
        <article class="admin-home-card">
          <p class="eyebrow">Needs Attention</p>
          <h4>${needsAttention.length ? "Action recommended" : "All clear"}</h4>
          ${needsAttention.length
            ? `<ul>${needsAttention.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : `<p class="muted-copy">No urgent items right now.</p>`}
          ${needsAttention.length ? `<button type="button" class="ghost-button" data-admin-landing-tab="billing-home">View billing issues</button>` : ""}
        </article>
        <article class="admin-home-card">
          <p class="eyebrow">Business Snapshot</p>
          <h4>Membership overview</h4>
          <p class="muted-copy">Pro ${escapeHtml(String(totals.proUsers ?? "—"))} · Trial ${escapeHtml(String(totals.trialUsers ?? "—"))} · Founding ${escapeHtml(String(totals.foundingMembers ?? "—"))}</p>
          <button type="button" class="ghost-button" data-admin-landing-tab="users">View users</button>
        </article>
        <article class="admin-home-card">
          <p class="eyebrow">System Status</p>
          <h4>${adminAnalyticsCache ? "Connected" : adminAnalyticsLoading ? "Loading…" : "Needs attention"}</h4>
          <p class="muted-copy">${adminAnalyticsCache ? "Live data is available." : (adminAnalyticsLastError || "Server analytics not loaded yet.")}</p>
          <button type="button" class="ghost-button" data-admin-landing-tab="system-health">Open System Health</button>
        </article>
      </div>
      <section class="admin-command-center-card admin-quick-actions-card" aria-label="Quick actions" style="margin-top:16px;">
        <div>
          <p class="eyebrow">Quick Actions</p>
          <h3>Common owner tasks</h3>
        </div>
        <div class="admin-quick-actions-grid">
          <button class="primary-button" type="button" data-admin-quick="upload-lesson">Add lesson plan</button>
          <button class="ghost-button" type="button" data-admin-quick="upload-activity">Add activity</button>
          <button class="ghost-button" type="button" data-admin-quick="users">View users</button>
          <button class="ghost-button" type="button" data-admin-quick="billing">View billing issues</button>
          <button class="ghost-button" type="button" data-admin-quick="inbox">Read messages</button>
          <button class="ghost-button" type="button" data-admin-quick="homepage">Edit homepage</button>
          <button class="ghost-button" type="button" data-admin-quick="announcement">Create announcement</button>
        </div>
      </section>
      <p class="muted-copy" style="margin-top:12px;">
        <button type="button" class="ghost-button" data-admin-landing-tab="dashboard">View full legacy dashboard details</button>
      </p>
    `;
    bindLandingTabs(target);
  }

  function renderAdminContentHome(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Content</p><h3>Content Home</h3><p class="muted-copy">Pick an area to manage. Imports and advanced tools are under Advanced.</p></div>
      </div>
      <div class="admin-card-grid">
        ${landingCard("Lesson Plans", "Play-based curriculum lesson plans.", "curriculum-lesson-plans", "Curriculum")}
        ${landingCard("Activities", "Browse and manage curriculum activities.", "curriculum-activities", "Curriculum")}
        ${landingCard("Curriculum", "Resources and curriculum library tools.", "curriculum-resources", "Curriculum")}
        ${landingCard("Forms and Templates", "Forms library (not legacy uploads).", "forms", "Library")}
        ${landingCard("Printables and Resources", "Printables library and resources.", "printables", "Library")}
        ${landingCard("Menus and Observation Packs", "Menu center and observation packs.", "menus", "Library")}
        ${landingCard("Reviews and Founder Content", "Reviews, founder page, and categories.", "reviews", "Publishing")}
        ${landingCard("Advanced Imports", "Legacy uploads, visibility, and taxonomy cleanup.", "advanced-home", "Advanced")}
      </div>
      <p style="margin-top:12px;"><button type="button" class="ghost-button" data-admin-landing-tab="taxonomy-audit">Theme/category taxonomy audit</button></p>
    `;
    bindLandingTabs(target);
  }

  function renderAdminWebsiteHome(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Website</p><h3>Site Editor</h3><p class="muted-copy">Homepage, pricing, announcements, and promo codes.</p></div>
      </div>
      <div class="admin-card-grid">
        ${landingCard("Homepage", "Hero, trust, journey, and reviews CTA.", "hero", "Public site")}
        ${landingCard("Pricing and Founding", "Pricing tables and founding member section.", "pricing", "Membership")}
        ${landingCard("Announcements", "Site banner and in-app announcements.", "announcement", "Communication")}
        ${landingCard("FAQs", "Frequently asked questions.", "faqs", "Public site")}
        ${landingCard("Reviews", "Homepage reviews and CTA blocks.", "reviews-cta", "Social proof")}
        ${landingCard("Upgrade Messages", "In-app upgrade copy.", "upgrade-msg", "Membership")}
        ${landingCard("Changelog", "What's new changelog entries.", "changelog", "Updates")}
        ${landingCard("Promo Codes", "Create and manage promo codes.", "promo-codes", "Growth")}
        ${landingCard("Media Library", "Image manager for site assets.", "images", "Assets")}
      </div>
    `;
    bindLandingTabs(target);
  }

  function renderAdminAiHome(target) {
    if (!target) return;
    const aiReady = Boolean(adminAiSettingsState?.aiSettings?.enabled);
    const statusLabel = aiReady ? "Ready" : "Needs attention";
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">AI Tools</p><h3>Calm AI workspace</h3><p class="muted-copy">Status: <strong>${statusLabel}</strong>. Prompt management lives under Advanced.</p></div>
      </div>
      <div class="admin-card-grid">
        ${landingCard("Generate Content", "Open AI content tools.", "ai-tools", "Create")}
        ${landingCard("Usage", "Monitor AI usage and limits.", "usage", "Monitor")}
        ${landingCard("Safety and Limits", "Review AI settings and guardrails.", "settings", "Safety")}
      </div>
    `;
    bindLandingTabs(target);
  }

  function renderAdminBillingHome(target) {
    if (!target) return;
    const rows = adminOwnerAccountRows();
    const auditKey = (account) => account?.adminAuditKey || accountProductStatus(account).adminKey;
    const sections = [
      { label: "Active memberships", filter: "pro", count: rows.filter((a) => auditKey(a) === "active").length },
      { label: "Trials", filter: "trial", count: rows.filter((a) => auditKey(a) === "trial").length },
      { label: "Founding members", filter: "founding", count: rows.filter((a) => auditKey(a) === "founding").length },
      { label: "Canceled / inactive", filter: "canceled", count: rows.filter((a) => auditKey(a) === "canceled").length },
      { label: "Needs review", filter: "billing-review", count: rows.filter((a) => ["payment_failed", "past_due", "needs_billing_review"].includes(auditKey(a)) || adminBillingStatusKey(a) === "needs_billing_review").length },
    ];
    target.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Billing</p>
          <h3>Membership and billing overview</h3>
          <p class="muted-copy">Current access, Stripe status, and billing history are kept separate on each user record. Review actions are read-only.</p>
        </div>
      </div>
      <div class="admin-home-grid">
        ${sections.map((section) => `
          <article class="admin-home-card">
            <p class="eyebrow">Section</p>
            <h4>${escapeHtml(section.label)}</h4>
            <p><strong>${section.count}</strong> account(s)</p>
            <button type="button" class="ghost-button" data-admin-billing-filter="${escapeHtml(section.filter)}">View in Users</button>
          </article>
        `).join("")}
      </div>
      <article class="admin-home-card" style="margin-top:14px;">
        <p class="eyebrow">Billing history</p>
        <h4>Historical billing events</h4>
        <p class="muted-copy">Open a user profile to see last failed payment, next retry, and Stripe status without inferring cancellation from elapsed time.</p>
        <button type="button" class="ghost-button" data-admin-landing-tab="users">Open Users</button>
      </article>
    `;
    bindLandingTabs(target);
    target.querySelectorAll("[data-admin-billing-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-admin-billing-filter");
        if (typeof setAdminSectionTab === "function") setAdminSectionTab("users");
        if (filter && typeof window.AdminWorkspace?.focusUsersFilter === "function") {
          window.AdminWorkspace.focusUsersFilter(filter);
        }
      });
    });
  }

  function healthStatusCard(name, status, detail) {
    const normalized = ["working", "attention", "disabled", "not-configured"].includes(status) ? status : "attention";
    const labels = {
      working: "Working",
      attention: "Needs attention",
      disabled: "Disabled",
      "not-configured": "Not configured",
    };
    return `
      <article class="admin-health-card" data-status="${normalized}">
        <p class="eyebrow">${escapeHtml(name)}</p>
        <h4>${escapeHtml(labels[normalized])}</h4>
        <p class="muted-copy">${escapeHtml(detail)}</p>
      </article>
    `;
  }

  function renderAdminSystemHealth(target) {
    if (!target) return;
    const dbOk = Boolean(adminAnalyticsCache);
    const messagesOk = typeof window.renderAdminInbox === "function";
    const billingOk = !adminAnalyticsLastError;
    const aiConfigured = Boolean(adminAiSettingsState?.aiSettings);
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">System Health</p><h3>Plain-language status</h3><p class="muted-copy">No secrets or raw logs are shown here.</p></div>
        <button type="button" class="ghost-button" data-admin-health-refresh>Refresh</button>
      </div>
      <div class="admin-health-grid">
        ${healthStatusCard("Website", "working", "Static app shell is serving.")}
        ${healthStatusCard("Database", dbOk ? "working" : adminAnalyticsLoading ? "attention" : "not-configured", dbOk ? "Server store reachable." : "Waiting for analytics load.")}
        ${healthStatusCard("Admin loading", adminAnalyticsLastError ? "attention" : adminAnalyticsCache ? "working" : "attention", adminAnalyticsLastError || "Admin panels use timeout + retry.")}
        ${healthStatusCard("Messages", messagesOk ? "working" : "disabled", "Admin inbox module loaded.")}
        ${healthStatusCard("Curriculum", "working", "Curriculum managers available in Content.")}
        ${healthStatusCard("Billing connection", billingOk ? "working" : "attention", billingOk ? "Stripe fields available." : "Billing analytics unavailable.")}
        ${healthStatusCard("Email", canUseLaunchBackend() ? "working" : "not-configured", canUseLaunchBackend() ? "Email engagement tools available." : "Local mode — email tools limited.")}
        ${healthStatusCard("AI", aiConfigured ? (adminAiSettingsState?.aiSettings?.enabled ? "working" : "disabled") : "not-configured", aiConfigured ? "AI settings loaded." : "AI settings not loaded yet.")}
      </div>
    `;
    target.querySelector("[data-admin-health-refresh]")?.addEventListener("click", async () => {
      if (typeof loadAdminAnalyticsFromBackend === "function") {
        await loadAdminAnalyticsFromBackend({ force: true }).catch(() => {});
      }
      renderAdminSystemHealth(target);
    });
  }

  function renderAdminAdvancedHome(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Advanced</p><h3>Power tools and diagnostics</h3><p class="muted-copy">Imports, analytics, prompts, backfills, and testing controls.</p></div>
      </div>
      <div class="admin-card-grid">
        ${landingCard("Full Dashboard", "Legacy owner command center with all charts.", "dashboard", "Analytics")}
        ${landingCard("Analytics", "Ad, signup, checkout, and lead tracking.", "analytics", "Analytics")}
        ${landingCard("Support & Feedback", "Tickets, feedback, bugs, and features.", "support", "Support")}
        ${landingCard("Visibility", "Forms and printables visibility.", "visibility", "Content")}
        ${landingCard("Legacy Uploads", "Legacy file storage imports.", "resources", "Imports")}
        ${landingCard("Stripe Backfill", "Recover users from Stripe.", "stripe-backfill", "Billing")}
        ${landingCard("Prompt Management", "AI prompt editor.", "prompts", "AI")}
        ${landingCard("AI Testing", "AI test center (no live calls in tests).", "ai-testing", "AI")}
        ${landingCard("Theme Taxonomy Audit", "Preview-before-confirm theme cleanup.", "taxonomy-audit", "Content")}
        ${landingCard("Settings", "Admin preferences and device trust.", "admin-settings", "Admin")}
      </div>
    `;
    bindLandingTabs(target);
  }

  function renderAdminSettingsLanding(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Settings</p><h3>Admin preferences</h3><p class="muted-copy">Device trust, lock admin, and workspace preferences.</p></div>
      </div>
      <div class="admin-home-grid">
        <article class="admin-home-card">
          <h4>Lock Admin</h4>
          <p class="muted-copy">Revoke this device's admin unlock and require the access code again.</p>
          <button type="button" class="ghost-button" id="adminLockButton">Lock Admin</button>
        </article>
        <article class="admin-home-card">
          <h4>Media Library</h4>
          <p class="muted-copy">Manage site images (formerly under Settings).</p>
          <button type="button" class="ghost-button" data-admin-landing-tab="images">Open Media Library</button>
        </article>
        <article class="admin-home-card">
          <h4>Notifications inbox</h4>
          <p class="muted-copy">Dedicated owner alerts inbox.</p>
          <button type="button" class="ghost-button" data-admin-landing-tab="admin-notifications">Open alerts</button>
        </article>
      </div>
    `;
    bindLandingTabs(target);
  }

  function renderAdminTaxonomyAudit(target) {
    if (!target) return;
    const audit = collectThemeTaxonomyAudit();
    const previewSelections = new Map();
    target.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Taxonomy Audit</p>
          <h3>Theme and category name review</h3>
          <p class="muted-copy">Read-only audit. Cleanup requires preview and confirmation — stored content is never auto-renamed.</p>
        </div>
      </div>
      ${audit.aliasFindings.length ? audit.aliasFindings.map((row) => `
        <article class="admin-home-card" style="margin-bottom:12px;">
          <h4>Possible duplicates: ${escapeHtml(row.group.join(" / "))}</h4>
          <ul>${row.variants.map((v) => `<li><strong>${escapeHtml(v.label)}</strong> — ${v.count} item(s)</li>`).join("")}</ul>
          ${row.needsCleanup ? `
            <label>Preview merge target
              <select data-taxonomy-group="${escapeHtml(row.group[0])}">
                ${row.variants.map((v) => `<option value="${escapeHtml(v.label)}">${escapeHtml(v.label)} (${v.count})</option>`).join("")}
              </select>
            </label>
            <button type="button" class="ghost-button" data-taxonomy-preview="${escapeHtml(row.group[0])}">Preview cleanup</button>
            <p class="muted-copy" data-taxonomy-preview-result="${escapeHtml(row.group[0])}"></p>
          ` : `<p class="muted-copy">Only one variant in use.</p>`}
        </article>
      `).join("") : `<p class="muted-copy">No known alias groups found in current curriculum data.</p>`}
      <p class="form-note">Confirming a cleanup will show affected items first. No changes are written until you explicitly confirm in a future step.</p>
    `;
    target.querySelectorAll("[data-taxonomy-preview]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.getAttribute("data-taxonomy-preview");
        const select = target.querySelector(`[data-taxonomy-group="${group}"]`);
        const result = target.querySelector(`[data-taxonomy-preview-result="${group}"]`);
        const targetLabel = select?.value || group;
        const row = audit.aliasFindings.find((r) => r.group[0] === group);
        if (!row || !result) return;
        const affected = row.variants.filter((v) => v.label !== targetLabel);
        previewSelections.set(group, targetLabel);
        result.textContent = affected.length
          ? `Preview: would rename ${affected.map((v) => `${v.label} (${v.count})`).join(", ")} → ${targetLabel}. Not saved.`
          : "Nothing to change for this group.";
      });
    });
  }

  function renderAdminNotificationsInbox(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Notifications</p><h3>Owner alerts inbox</h3></div>
      </div>
      <div id="adminNotificationCenterDedicated"></div>
    `;
    const panel = document.querySelector("#adminNotificationsPanel");
    if (panel) panel.hidden = true;
    const dedicated = target.querySelector("#adminNotificationCenterDedicated");
    if (typeof renderAdminNotificationCenter === "function") {
      const originalTarget = document.querySelector("#adminNotificationCenter");
      const tempId = "adminNotificationCenter";
      if (dedicated) {
        dedicated.id = "adminNotificationCenter";
        renderAdminNotificationCenter();
        dedicated.id = "adminNotificationCenterDedicated";
        if (originalTarget && dedicated.innerHTML) originalTarget.innerHTML = dedicated.innerHTML;
      }
    }
  }

  function renderAdminUsersCompactTable(target, options = {}) {
    if (!target || !isAdminUnlocked()) return;
    const serverUsers = adminAnalyticsCache?.users || [];
    const serverEmails = new Set(serverUsers.map((u) => u.email).filter(Boolean));
    const localOnlyAccounts = allAccountsList().filter((a) => a.email && !serverEmails.has(a.email));
    const allAccounts = [...serverUsers, ...localOnlyAccounts];
    const auditKey = (account) => account?.adminAuditKey || accountProductStatus(account).adminKey;
    const pageSize = 25;
    let page = 0;
    let query = "";
    let activeFilter = options.filter || "all";

    const buckets = {
      all: allAccounts,
      free: allAccounts.filter((a) => auditKey(a) === "free"),
      trial: allAccounts.filter((a) => auditKey(a) === "trial"),
      pro: allAccounts.filter((a) => auditKey(a) === "active"),
      founding: allAccounts.filter((a) => auditKey(a) === "founding"),
      canceled: allAccounts.filter((a) => auditKey(a) === "canceled"),
      "billing-review": allAccounts.filter((a) => ["payment_failed", "past_due", "needs_billing_review"].includes(auditKey(a)) || adminBillingStatusKey(a) === "needs_billing_review"),
    };

    function filterItems(items) {
      const q = query.trim().toLowerCase();
      if (!q) return items;
      return items.filter((a) => {
        const hay = `${displayUserName(a)} ${a.email || ""} ${a.businessName || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    function paint() {
      const items = filterItems(buckets[activeFilter] || allAccounts);
      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      if (page >= totalPages) page = totalPages - 1;
      const slice = items.slice(page * pageSize, (page + 1) * pageSize);
      target.innerHTML = `
        <div class="section-heading">
          <div><p class="eyebrow">Users</p><h3>Account list</h3><p class="muted-copy">Compact list with search, filters, and pagination. Expand one user at a time for full details.</p></div>
        </div>
        <div class="aup-search-wrap">
          <input class="aup-search-input" id="adminUsersSearch" type="search" placeholder="Search name or email…" value="${escapeHtml(query)}" autocomplete="off" />
        </div>
        <div class="admin-vis-tabs aup-filter-tabs" id="adminUserFilterTabs">
          ${Object.entries({
            all: "All", free: "Free", trial: "Trial", pro: "Pro", founding: "Founding", canceled: "Canceled", "billing-review": "Needs review",
          }).map(([key, label]) => `
            <button class="admin-sub-tab${activeFilter === key ? " active" : ""}" type="button" data-users-filter="${key}">
              ${label} (${(buckets[key] || []).length})
            </button>
          `).join("")}
        </div>
        <div class="admin-users-table-wrap">
          <table class="admin-users-table">
            <thead>
              <tr>
                <th>Name / email</th>
                <th>Current access</th>
                <th>Account status</th>
                <th>Joined</th>
                <th>Last active</th>
                <th>Billing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${slice.length ? slice.map((account) => {
                const email = account.email || "";
                const joined = account.signupAt || account.createdAt
                  ? new Date(account.signupAt || account.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—";
                const billingFlag = ["payment_failed", "past_due", "needs_billing_review"].includes(auditKey(account))
                  || adminBillingStatusKey(account) === "needs_billing_review";
                return `
                  <tr>
                    <td><strong>${escapeHtml(displayUserName(account))}</strong><br><span class="muted-copy">${escapeHtml(email)}</span></td>
                    <td>${escapeHtml(adminCurrentAccessLabel(account))}</td>
                    <td>${escapeHtml(String(account.accountStatus || "Active"))}</td>
                    <td>${escapeHtml(joined)}</td>
                    <td>${escapeHtml(adminUserLastActiveLabel(account))}</td>
                    <td>${billingFlag ? "⚠ Review" : "—"}</td>
                    <td><button type="button" class="ghost-button" data-aup-view="${escapeHtml(email)}">View</button></td>
                  </tr>
                `;
              }).join("") : `<tr><td colspan="7"><div class="empty-state">No users match this filter.</div></td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="admin-users-pagination">
          <span>Showing ${slice.length ? page * pageSize + 1 : 0}–${page * pageSize + slice.length} of ${items.length}</span>
          <div class="account-actions-row">
            <button type="button" class="ghost-button" data-users-page="prev" ${page <= 0 ? "disabled" : ""}>Previous</button>
            <span>Page ${page + 1} of ${totalPages}</span>
            <button type="button" class="ghost-button" data-users-page="next" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
          </div>
        </div>
      `;
      target.querySelector("#adminUsersSearch")?.addEventListener("input", (event) => {
        query = event.target.value;
        page = 0;
        paint();
      });
      target.querySelectorAll("[data-users-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeFilter = btn.getAttribute("data-users-filter") || "all";
          page = 0;
          paint();
        });
      });
      target.querySelector("[data-users-page='prev']")?.addEventListener("click", () => { page -= 1; paint(); });
      target.querySelector("[data-users-page='next']")?.addEventListener("click", () => { page += 1; paint(); });
      target.querySelectorAll("[data-aup-view]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const email = btn.getAttribute("data-aup-view");
          if (email && typeof openAdminUserProfile === "function") openAdminUserProfile(email, "view");
        });
      });
    }

    paint();
  }

  let pendingUsersFilter = null;
  function focusUsersFilter(filter) {
    pendingUsersFilter = filter;
    const target = document.querySelector("#adminUsersApp");
    if (target) renderAdminUsersCompactTable(target, { filter });
  }

  function activateWorkspaceShell() {
    const view = document.querySelector("#view-admin");
    if (view) view.classList.add("admin-workspace-active");
  }

  function updateSidebarNotificationBadge() {
    const badge = document.querySelector("#adminSidebarNotifBadge");
    if (!badge) return;
    const count = Number(adminNotificationState?.unreadCount || 0);
    badge.hidden = count <= 0;
    badge.textContent = count > 99 ? "99+" : String(count);
  }

  window.AdminWorkspace = {
    ADMIN_FETCH_TIMEOUT_MS,
    adminFetchWithTimeout,
    adminAsyncShell,
    adminAsyncError,
    renderAdminHomeWorkspace,
    renderAdminContentHome,
    renderAdminWebsiteHome,
    renderAdminAiHome,
    renderAdminBillingHome,
    renderAdminSystemHealth,
    renderAdminAdvancedHome,
    renderAdminSettingsLanding,
    renderAdminTaxonomyAudit,
    renderAdminNotificationsInbox,
    renderAdminUsersCompactTable,
    focusUsersFilter,
    activateWorkspaceShell,
    updateSidebarNotificationBadge,
    collectThemeTaxonomyAudit,
    bindLandingTabs,
  };
})();
