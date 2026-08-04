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
          <p class="muted-copy">Signed in as ${escapeHtml(adminSession()?.email || adminOwnerAccount?.email || "owner")}. Start each morning in the AI Business Advisor under Insights.</p>
        </div>
        <div class="account-actions-row">
          <button class="ghost-button" type="button" id="adminRefreshAnalyticsButton" ${adminAnalyticsLoading ? "disabled" : ""}>
            ${adminAnalyticsLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <div class="admin-home-grid">
        <article class="admin-home-card admin-insights-hero-card">
          <p class="eyebrow">AI Business Advisor</p>
          <h4>Morning operating summary</h4>
          <p class="muted-copy">Visitors, signups, trials, paid conversions, content demand, and clear next actions — built from live analytics.</p>
          <ul class="muted-copy">
            <li>${escapeHtml(String(totals.totalRegisteredUsers ?? adminOwnerAccountRows().length))} registered users</li>
            <li>${escapeHtml(String(totals.activeUsersToday ?? "—"))} active today</li>
            <li>${escapeHtml(String(totals.newSignupsToday ?? "—"))} new signups today</li>
          </ul>
          <button type="button" class="primary-button" data-admin-landing-tab="advisor">Open AI Business Advisor</button>
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

  function renderAdminMessagesHome(target) {
    if (!target) return;
    const unread = typeof window.adminMessagesWorkspaceUnreadCount === "function" ? window.adminMessagesWorkspaceUnreadCount() : 0;
    const unreadNote = unread
      ? `<p class="muted-copy"><strong>${unread}</strong> unread conversation${unread === 1 ? "" : "s"}.</p>`
      : "";
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Messages</p><h3>Communications workspace</h3><p class="muted-copy">Member inbox, conversations, templates, and welcome sequences.</p>${unreadNote}</div>
      </div>
      <div class="admin-card-grid">
        ${landingCard("New Messages", "Unread member replies with name, plan, preview, and badge.", "messages-conversations", "Messaging")}
        ${landingCard("Welcome Sent", "Automatic welcome messages — not New Messages until they reply.", "messages-automations", "Messaging")}
        ${landingCard("Support Inbox", "Support, feedback, and submission rows.", "admin-inbox", "Inbox")}
        ${landingCard("Sent & Drafts", "Review sent messages and saved drafts.", "messages-sent", "Messaging")}
        ${landingCard("New Message", "Compose an in-app message to a member.", "messages-compose", "Compose")}
        ${landingCard("Email User", "Send a one-off email when Resend is configured.", "messages-email", "Compose")}
        ${landingCard("Message Templates", "Reusable templates for compose.", "message-templates", "Templates")}
        ${landingCard("Welcome Messages", "Free signup welcome sequence (in-app + email).", "welcome-messages", "Onboarding")}
        ${landingCard("Automations", "Trial and founding member email sequences.", "automations", "Automation")}
      </div>
    `;
    bindLandingTabs(target);
  }

  function renderAdminAiHome(target) {
    if (!target) return;
    const loading = Boolean(adminAiSettingsState?.loading);
    const settingsKnown = adminAiSettingsState?.aiSettings != null;
    const aiReady = Boolean(adminAiSettingsState?.aiSettings?.enabled);
    const statusLabel = loading || !settingsKnown
      ? "Checking…"
      : (aiReady ? "Ready" : "Needs attention");
    const statusDetail = loading || !settingsKnown
      ? "Loading AI readiness…"
      : (aiReady
        ? "Prompt management lives under Advanced."
        : "AI is disabled or unavailable — open Safety and Limits to review settings.");
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">AI Tools</p><h3>Calm AI workspace</h3><p class="muted-copy">Status: <strong>${statusLabel}</strong>. ${statusDetail}</p></div>
      </div>
      <div class="admin-card-grid">
        ${landingCard("Generate Content", "Open AI content tools.", "ai-tools", "Create")}
        ${landingCard("AI Health", "Operational status, errors, and safe test.", "ai-health", "Health")}
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

  function healthStatusCard(name, status, detail, recommendedAction = "") {
    const allowed = [
      "working",
      "healthy",
      "warning",
      "attention",
      "critical",
      "disabled",
      "not-configured",
      "not-verified",
      "unknown",
    ];
    let normalized = allowed.includes(status) ? status : "unknown";
    if (normalized === "healthy") normalized = "working";
    if (normalized === "attention") normalized = "warning";
    if (normalized === "not-verified") normalized = "unknown";
    const labels = {
      working: "Configured and healthy",
      warning: "Warning",
      critical: "Critical",
      disabled: "Disabled",
      "not-configured": "Not configured",
      unknown: "Unable to verify",
    };
    const action = String(recommendedAction || "").trim();
    return `
      <article class="admin-health-card" data-status="${normalized}">
        <p class="eyebrow">${escapeHtml(name)}</p>
        <h4>${escapeHtml(labels[normalized] || "Unable to verify")}</h4>
        <p class="muted-copy">${escapeHtml(detail)}</p>
        ${action ? `<p class="muted-copy"><strong>Recommended:</strong> ${escapeHtml(action)}</p>` : ""}
      </article>
    `;
  }

  function monitorCheckToCard(check) {
    const status = check?.status || check?.state || (check?.ok ? "working" : "unknown");
    const detail = [check?.detail || "", check?.recommendedAction ? "" : ""].filter(Boolean).join(" ");
    return healthStatusCard(
      check?.label || check?.id || "Check",
      status,
      detail || "No detail available.",
      check?.recommendedAction || "",
    );
  }

  function renderAdminSystemHealth(target) {
    if (!target) return;
    const paint = (snapshot) => {
      const cards = snapshot?.cards || {};
      const card = (key, label) => {
        const row = cards[key] || { status: "not-verified", detail: "Not checked yet. Tap Refresh." };
        return healthStatusCard(label, row.status, row.detail);
      };
      const checked = snapshot?.checkedAt
        ? `Last checked ${new Date(snapshot.checkedAt).toLocaleString()}.`
        : "Tap Refresh to run live checks.";
      const monitoring = snapshot?.monitoring || null;
      const monitorChecks = Array.isArray(monitoring?.checks) ? monitoring.checks : [];
      const monitorCards = monitorChecks.length
        ? monitorChecks.map((check) => monitorCheckToCard(check)).join("")
        : `<article class="admin-health-card" data-status="unknown"><p class="eyebrow">Production monitoring</p><h4>Unable to verify</h4><p class="muted-copy">Monitoring snapshot unavailable. Tap Refresh.</p></article>`;
      const overall = monitoring?.overall || "unknown";
      const overallLabel = ({
        healthy: "Healthy",
        warning: "Warning",
        attention: "Warning",
        critical: "Critical",
        unknown: "Unable to verify",
      })[overall] || "Unable to verify";
      const criticalMemory = monitorChecks.find((c) => c.id === "memory" && (c.state === "critical" || c.status === "critical"));
      const alertNote = monitoring?.alerts
        ? (monitoring.alerts.enabled
          ? `Alert emails enabled (cooldown ${monitoring.alerts.cooldownMinutes || 60}m) to the support/admin inbox when critical.`
          : "Alert emails disabled (MONITOR_ALERTS_ENABLED).")
        : "Alert email status unknown.";
      const overallAction = criticalMemory?.recommendedAction
        || (overall === "critical"
          ? "Resolve every Critical card below before treating production as healthy."
          : (overall === "unknown" ? "Refresh checks. Unable to verify must never be treated as healthy." : ""));
      target.innerHTML = `
        <div class="section-heading">
          <div><p class="eyebrow">System Health</p><h3>Verified service status</h3><p class="muted-copy">${escapeHtml(checked)} Status is based on live checks — not UI availability alone.</p></div>
          <button type="button" class="ghost-button" data-admin-health-refresh ${adminSystemHealthLoading ? "disabled" : ""}>${adminSystemHealthLoading ? "Checking…" : "Refresh"}</button>
        </div>
        <section class="admin-command-center-card" aria-label="Production monitoring" style="margin-bottom:16px;" data-overall-health="${escapeHtml(overall)}">
          <div class="section-heading" style="margin-bottom:12px;">
            <div>
              <p class="eyebrow">Production monitoring</p>
              <h3>Overall · ${escapeHtml(overallLabel)}</h3>
              <p class="muted-copy">Read-only checks for health, database, Stripe, Meta tracking, 5xx spikes, memory, and DB storage. ${escapeHtml(alertNote)}</p>
              ${overallAction ? `<p class="muted-copy" data-health-overall-action><strong>Recommended:</strong> ${escapeHtml(overallAction)}</p>` : ""}
            </div>
          </div>
          <div class="admin-health-grid">${monitorCards}</div>
        </section>
        <div class="admin-health-grid">
          ${card("website", "Website / app shell")}
          ${card("database", "Database")}
          ${card("stripeApi", "Stripe API connection")}
          ${card("stripeWebhook", "Stripe webhook health")}
          ${card("resend", "Resend configuration")}
          ${card("emailDelivery", "Recent email delivery")}
          ${card("curriculum", "Curriculum counts")}
          ${card("adminInbox", "Admin inbox loading")}
          ${card("openai", "OpenAI configuration")}
        </div>
      `;
      target.querySelector("[data-admin-health-refresh]")?.addEventListener("click", () => refreshAdminSystemHealth(target));
    };
    if (adminSystemHealthCache && !adminSystemHealthLoading) {
      paint(adminSystemHealthCache);
      return;
    }
    target.innerHTML = adminAsyncShell("Running system health checks…");
    refreshAdminSystemHealth(target);
  }

  let adminSystemHealthCache = null;
  let adminSystemHealthLoading = false;

  async function refreshAdminSystemHealth(target) {
    if (!target) return;
    adminSystemHealthLoading = true;
    paintLoading(target);
    const cards = {};
    const setCard = (key, status, detail) => {
      cards[key] = { status, detail };
    };

    try {
      const healthRes = await adminFetchWithTimeout("/api/health");
      const health = await healthRes.json().catch(() => ({}));
      setCard(
        "website",
        healthRes.ok && health.ok ? "working" : "attention",
        healthRes.ok && health.ok ? `HTTP ${healthRes.status} · ${health.status || "ok"}.` : "App health endpoint did not return OK.",
      );
    } catch {
      setCard("website", "not-verified", "Could not reach /api/health.");
    }

    let launchReady = null;
    try {
      const readyRes = await adminFetchWithTimeout("/api/launch-readiness");
      launchReady = await readyRes.json().catch(() => ({}));
      const db = launchReady?.required?.database;
      setCard(
        "database",
        db?.ready ? "working" : (db ? "attention" : "not-configured"),
        db?.note || (db?.ready ? "Database connection verified." : "Database is not launch-ready."),
      );
      const ai = launchReady?.required?.ai;
      setCard(
        "openai",
        ai?.ready ? "working" : (ai ? "not-configured" : "not-verified"),
        ai?.note || (ai?.ready ? "OpenAI keys and settings configured." : "OpenAI is not configured."),
      );
      const resend = launchReady?.optional?.supportEmail;
      setCard(
        "resend",
        resend?.ready ? "working" : (resend ? "not-configured" : "not-verified"),
        resend?.note || (resend?.ready ? "Resend/email transport configured." : "Resend is not configured."),
      );
    } catch {
      setCard("database", "not-verified", "Launch readiness was not checked.");
      setCard("openai", "not-verified", "OpenAI configuration was not checked.");
      setCard("resend", "not-verified", "Resend configuration was not checked.");
    }

    try {
      const billingRes = await adminFetchWithTimeout("/api/billing-readiness");
      const billing = await billingRes.json().catch(() => ({}));
      const keys = billing?.keysConnected || billing?.stripeKeysConnected;
      if (!keys) {
        setCard("stripeApi", "unknown", "Unable to verify Stripe API key configuration.");
      } else if (keys.ready) {
        setCard("stripeApi", "working", keys.note || "Configured and healthy: Stripe API keys verified.");
      } else {
        setCard("stripeApi", "not-configured", keys.note || "Stripe API keys are missing.");
      }
      const webhook = billing?.webhookReady || billing?.webhookConfigured;
      if (!webhook) {
        setCard("stripeWebhook", "unknown", "Unable to verify Stripe webhook configuration.");
      } else if (webhook.ready) {
        setCard("stripeWebhook", "working", webhook.note || "Configured and healthy: webhook secret configured.");
      } else {
        setCard(
          "stripeWebhook",
          "not-configured",
          webhook.note || "Stripe webhook secret is not configured. Zero recorded failures does not mean webhooks are working.",
        );
      }
    } catch {
      setCard("stripeApi", "unknown", "Unable to verify Stripe API connection.");
      setCard("stripeWebhook", "unknown", "Unable to verify Stripe webhook health.");
    }

    try {
      if (typeof loadAdminAnalyticsFromBackend === "function" && !adminAnalyticsCacheFresh()) {
        await loadAdminAnalyticsFromBackend({ force: false, renderLoading: false }).catch(() => {});
      }
    } catch { /* optional */ }

    const lessonCount = (typeof curriculumLessonPlansForAdmin === "function" ? curriculumLessonPlansForAdmin() : []).length;
    const actCount = (typeof curriculumActivitiesForAdmin === "function" ? curriculumActivitiesForAdmin() : []).length;
    const totals = adminAnalyticsCache?.totals || {};
    setCard(
      "curriculum",
      lessonCount || actCount || totals.curriculumLessonPlans
        ? "working"
        : "attention",
      `${lessonCount || totals.curriculumLessonPlans || 0} lesson plans · ${actCount || totals.curriculumActivities || 0} activities visible to admin.`,
    );

    const inboxState = window.__adminInboxLastLoadOk;
    setCard(
      "adminInbox",
      inboxState === true ? "working" : (inboxState === false ? "attention" : "not-verified"),
      inboxState === true
        ? "Last admin inbox load succeeded."
        : (inboxState === false ? "Last admin inbox load failed — open Messages to retry." : "Open Messages once to verify inbox loading."),
    );

    const emailEvents = Array.isArray(adminAnalyticsCache?.recentEmailEvents) ? adminAnalyticsCache.recentEmailEvents.length : null;
    setCard(
      "emailDelivery",
      emailEvents === null ? "not-verified" : (emailEvents > 0 ? "working" : "attention"),
      emailEvents === null
        ? "Recent delivery history not exposed in analytics."
        : `${emailEvents} recent email event(s) in analytics snapshot.`,
    );

    let monitoring = null;
    try {
      const monitorRes = await adminFetchWithTimeout("/api/admin/production-monitoring");
      const monitorJson = await monitorRes.json().catch(() => ({}));
      if (monitorRes.ok && monitorJson?.monitoring) {
        monitoring = monitorJson.monitoring;
      } else {
        monitoring = {
          overall: "attention",
          checks: [{
            id: "monitoring_api",
            label: "Production monitoring API",
            ok: false,
            detail: monitorRes.status === 401
              ? "Admin session required for monitoring."
              : `Monitoring endpoint returned HTTP ${monitorRes.status}.`,
          }],
        };
      }
    } catch {
      monitoring = {
        overall: "attention",
        checks: [{
          id: "monitoring_api",
          label: "Production monitoring API",
          ok: false,
          detail: "Could not reach /api/admin/production-monitoring.",
        }],
      };
    }

    adminSystemHealthCache = { cards, monitoring, checkedAt: new Date().toISOString() };
    adminSystemHealthLoading = false;
    renderAdminSystemHealth(target);
  }

  function paintLoading(target) {
    target.innerHTML = adminAsyncShell("Running system health checks…");
  }

  function renderAdminAdvancedHome(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Advanced</p><h3>Power tools and diagnostics</h3><p class="muted-copy">Imports, analytics, prompts, backfills, and testing controls.</p></div>
      </div>
      <div class="admin-card-grid">
        ${landingCard("Marketing Analytics", "Live visitors, sources, signups, trials, paid, Meta health.", "marketing-analytics", "Marketing")}
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
    renderAdminMessagesHome,
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
