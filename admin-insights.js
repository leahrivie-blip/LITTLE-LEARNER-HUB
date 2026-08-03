/**
 * Admin Dashboard 2.0 — Insights UI (desktop-first).
 * Consumes GET /api/admin/insights. Loaded after admin-workspace.js.
 */
(function adminInsightsModule() {
  const HUB_META = {
    advisor: { title: "AI Business Advisor", blurb: "Morning operating summary and recommended actions." },
    "marketing-funnel": { title: "Marketing Funnel", blurb: "Vertical conversion chart from visit → paid, with drop-off, source filters, and stage drill-down." },
    "feature-usage": { title: "Feature Usage", blurb: "Pages, sessions, features, downloads, and content demand." },
    "user-journey": { title: "User Journey", blurb: "Open a user profile → Journey tab for the full support timeline." },
    "feature-requests": { title: "Feature Request Center", blurb: "Votes, status, estimates, and release notifications." },
    "error-center": { title: "Error Center", blurb: "Production errors, 5xx monitor, browsers, and devices." },
    "search-analytics": { title: "Search Analytics", blurb: "Search demand and content gaps." },
    "email-analytics": { title: "Email Analytics", blurb: "Send, delivery, and campaign performance." },
    "seo-dashboard": { title: "SEO Dashboard", blurb: "Sitemap, robots, and on-site SEO health." },
    "churn-dashboard": { title: "Churn Dashboard", blurb: "Cancellations, retention, and win-back signals." },
    "content-health": { title: "Content Health", blurb: "Lesson/activity performance and update recommendations." },
    "release-center": { title: "Release Center", blurb: "Deploy version, health, and QA checklist." },
  };

  let insightsState = {
    hub: "advisor",
    range: "7d",
    sort: "votes",
    category: "",
    status: "",
    source: "all",
    selectedStage: "",
    cache: null,
    loading: false,
  };

  function esc(value) {
    return typeof escapeHtml === "function" ? escapeHtml(String(value ?? "")) : String(value ?? "");
  }

  function token() {
    try {
      return typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    } catch {
      return "";
    }
  }

  async function fetchInsights(params = {}) {
    const hub = params.hub || insightsState.hub;
    const qs = new URLSearchParams({
      hub,
      range: params.range || insightsState.range,
    });
    if (params.email) qs.set("email", params.email);
    if (hub === "feature-requests") {
      qs.set("sort", params.sort || insightsState.sort || "votes");
      if (params.category || insightsState.category) qs.set("category", params.category || insightsState.category);
      if (params.status || insightsState.status) qs.set("status", params.status || insightsState.status);
    }
    if (hub === "marketing-funnel") {
      const source = params.source || insightsState.source || "all";
      if (source && source !== "all") qs.set("source", source);
      const stage = params.stage || insightsState.selectedStage || "";
      if (stage) qs.set("stage", stage);
    }
    const headers = {};
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`/api/admin/insights?${qs}`, { cache: "no-store", headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Insights failed (${res.status})`);
    return json.insights;
  }

  function rangeToolbar(active) {
    return ["today", "7d", "30d", "all"].map((key) => `
      <button type="button" class="ghost-button admin-insights-range${active === key ? " is-active" : ""}" data-insights-range="${key}">${
        key === "today" ? "Today" : key === "7d" ? "7 days" : key === "30d" ? "30 days" : "All time"
      }</button>
    `).join("");
  }

  function hubSwitcher(active) {
    const order = [
      "advisor",
      "marketing-funnel",
      "feature-usage",
      "feature-requests",
      "error-center",
      "search-analytics",
      "email-analytics",
      "seo-dashboard",
      "churn-dashboard",
      "content-health",
      "release-center",
    ];
    return `
      <div class="admin-insights-hub-switch" role="tablist" aria-label="Insights hubs">
        ${order.map((hub) => `
          <button type="button" class="ghost-button${active === hub ? " is-active" : ""}" data-insights-hub="${hub}">${esc((HUB_META[hub] || {}).title || hub)}</button>
        `).join("")}
      </div>
    `;
  }

  function kpi(label, value) {
    return `<article class="admin-home-card admin-insights-kpi"><p class="eyebrow">${esc(label)}</p><h3>${esc(value)}</h3></article>`;
  }

  function table(headers, rows) {
    if (!rows.length) return `<div class="empty-state">No data in this range yet.</div>`;
    return `
      <div class="admin-users-table-wrap">
        <table class="admin-users-table admin-insights-table">
          <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function pendingNote(text) {
    return `<p class="form-note admin-insights-pending">${esc(text)}</p>`;
  }

  function renderAdvisor(data) {
    const recs = (data.recommendations || []).map((rec, idx) => `
      <article class="admin-home-card admin-insights-rec" data-insights-open-hub="${esc(rec.hub || "advisor")}">
        <p class="eyebrow">${esc(String(rec.priority || "medium").toUpperCase())} · ${idx + 1}</p>
        <h4>${esc(rec.title || "")}</h4>
        <p class="muted-copy">${esc(rec.detail || "")}</p>
        <button type="button" class="ghost-button" data-insights-open-hub="${esc(rec.hub || "advisor")}">Open</button>
      </article>
    `).join("");
    return `
      <section class="admin-insights-hero">
        <p class="eyebrow">AI Business Advisor · ${esc(data.engine || "rules-v1")}</p>
        <h2>${esc(data.headline || "Today's Summary")}</h2>
        <ul class="admin-insights-summary-list">
          ${(data.summaryLines || []).map((line) => `<li>${esc(line)}</li>`).join("")}
        </ul>
        <p class="muted-copy">${esc(data.note || "")}</p>
      </section>
      <div class="admin-home-grid admin-insights-kpi-grid">
        ${kpi("Visitors", data.metrics?.visitors ?? "—")}
        ${kpi("Signups", data.metrics?.signups ?? "—")}
        ${kpi("Trials", data.metrics?.trials ?? "—")}
        ${kpi("Paid", data.metrics?.paid ?? "—")}
        ${kpi("Avg session (min)", data.metrics?.avgSessionMinutes ?? "—")}
        ${kpi("Open requests", data.metrics?.openFeatureRequests ?? "—")}
      </div>
      <div class="section-heading" style="margin-top:20px;">
        <div><p class="eyebrow">Recommendations</p><h3>What to do next</h3></div>
      </div>
      <div class="admin-home-grid">${recs || `<div class="empty-state">No recommendations yet.</div>`}</div>
    `;
  }

  function renderFeatureUsage(data) {
    return `
      ${data.searchInstrumentation === "pending" ? pendingNote("Search no-result tracking is pending client instrumentation.") : ""}
      ${data.favoritesInstrumentation === "pending" ? pendingNote("Favorites ranking uses favorite_* events when available; otherwise empty.") : ""}
      <div class="admin-home-grid admin-insights-kpi-grid">
        ${kpi("Page views", data.totals?.pageViews ?? 0)}
        ${kpi("Sessions", data.sessionCount ?? 0)}
        ${kpi("Avg session (min)", data.avgSessionMinutes ?? 0)}
        ${kpi("Feature events", data.totals?.featureEvents ?? 0)}
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>Most used pages</h4>
          ${table(["Page", "Views"], (data.mostUsedPages || []).map((r) => [r.key, r.count]))}
        </section>
        <section>
          <h4>Least used pages</h4>
          ${table(["Page", "Views"], (data.leastUsedPages || []).map((r) => [r.key, r.count]))}
        </section>
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>Drop-off points</h4>
          ${table(["Last page in session", "Sessions"], (data.dropOffPoints || []).map((r) => [r.page, r.count]))}
        </section>
        <section>
          <h4>Most used features</h4>
          ${table(["Feature", "Count"], (data.mostUsedFeatures || []).map((r) => [r.key, r.count]))}
        </section>
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>Most viewed lessons</h4>
          ${table(["Lesson", "Views"], (data.mostViewedLessons || []).map((r) => [r.key, r.count]))}
        </section>
        <section>
          <h4>Most viewed activities</h4>
          ${table(["Activity", "Views"], (data.mostViewedActivities || []).map((r) => [r.key, r.count]))}
        </section>
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>Most downloaded</h4>
          ${table(["Content", "Downloads"], (data.mostDownloaded || []).map((r) => [r.key, r.count]))}
        </section>
        <section>
          <h4>Most printed</h4>
          ${table(["Content", "Prints"], (data.mostPrinted || []).map((r) => [r.key, r.count]))}
        </section>
      </div>
      <section>
        <h4>Searches with no results</h4>
        ${table(["Query", "Count"], (data.searchNoResults || []).map((r) => [r.key, r.count]))}
      </section>
    `;
  }

  function renderFeatureRequests(data) {
    const cats = [`<option value="">All categories</option>`]
      .concat((data.categories || []).map((c) => `<option value="${esc(c)}" ${data.category === c ? "selected" : ""}>${esc(c)}</option>`))
      .join("");
    const statuses = ["", "New", "Under Review", "Planned", "In Progress", "Completed", "Declined"]
      .map((s) => `<option value="${esc(s)}" ${String(data.status || "") === s || (!s && data.status === "all") ? "selected" : ""}>${s ? (s === "Completed" ? "Released" : s) : "All statuses"}</option>`)
      .join("");
    const sorts = [
      ["votes", "Most requested"],
      ["newest", "Newest"],
      ["category", "Category"],
      ["status", "Status"],
    ].map(([v, l]) => `<option value="${v}" ${data.sort === v ? "selected" : ""}>${l}</option>`).join("");

    const cards = (data.items || []).map((item) => `
      <article class="ticket-card" data-insights-feature-id="${esc(item.id)}">
        <div class="ticket-card-header">
          <div>
            <p class="eyebrow">${esc(item.category)} · ${esc(String(item.votes))} votes · ${esc(item.statusLabel)}</p>
            <h3>${esc(item.title)}</h3>
            <p class="muted-copy">${esc(item.name || "—")} · ${esc(item.email || "")}</p>
          </div>
          <div class="admin-insights-feature-controls">
            <label>Status
              <select data-fr-status="${esc(item.id)}">
                ${["New", "Under Review", "Planned", "In Progress", "Completed", "Declined"].map((s) => `
                  <option value="${s}" ${item.status === s ? "selected" : ""}>${s === "Completed" ? "Released" : s}</option>
                `).join("")}
              </select>
            </label>
            <label>Est. release
              <input type="text" data-fr-estimate="${esc(item.id)}" value="${esc(item.estimatedRelease || "")}" placeholder="e.g. Aug 2026" />
            </label>
            <label class="settings-check-label">
              <input type="checkbox" data-fr-notify="${esc(item.id)}" ${item.notifyOnComplete !== false ? "checked" : ""} />
              Notify on release
            </label>
            <button type="button" class="ghost-button" data-fr-save="${esc(item.id)}">Save</button>
          </div>
        </div>
        <p>${esc(item.description || "")}</p>
        <label>Internal note
          <input type="text" data-fr-note="${esc(item.id)}" placeholder="Add internal note…" />
        </label>
        ${(item.adminNotes || []).length ? `<small class="muted-copy">Notes: ${esc(item.adminNotes.map((n) => n.note).join(" · "))}</small>` : ""}
      </article>
    `).join("");

    return `
      <div class="admin-insights-filters">
        <label>Sort <select id="insightsFrSort">${sorts}</select></label>
        <label>Category <select id="insightsFrCategory">${cats}</select></label>
        <label>Status <select id="insightsFrStatus">${statuses}</select></label>
        <button type="button" class="primary-button" id="insightsFrApply">Apply</button>
      </div>
      <div class="admin-home-grid admin-insights-kpi-grid">
        ${kpi("Total requests", data.total ?? 0)}
        ${(data.statusCounts || []).slice(0, 4).map((s) => kpi(s.key === "Completed" ? "Released" : s.key, s.count)).join("")}
      </div>
      <div class="ticket-list">${cards || `<div class="empty-state">No feature requests yet.</div>`}</div>
      <p class="form-note" id="insightsFrMessage"></p>
    `;
  }

  function renderGenericListHub(title, rows, headers) {
    return `
      <div class="section-heading"><div><h3>${esc(title)}</h3></div></div>
      ${table(headers, rows)}
    `;
  }

  function renderMarketingFunnel(data) {
    const stages = data.stages || [];
    const transitions = data.transitions || [];
    const cta = data.ctaBreakdown || {};
    const timing = data.timing || {};
    const costs = data.costs || {};
    const selected = insightsState.selectedStage || "";
    const source = insightsState.source || data.sourceFilter || "all";
    const sourceOptions = (data.sources || ["all", "TikTok", "Facebook", "Google", "Direct", "Organic", "Other"])
      .map((s) => `<option value="${esc(s)}"${s === source ? " selected" : ""}>${esc(s === "all" ? "All sources" : s)}</option>`)
      .join("");

    const chart = stages.map((stage, index) => {
      const width = Math.max(8, Number(stage.shareOfTop || 0));
      const isSelected = selected === stage.id;
      return `
        <button type="button" class="admin-insights-funnel-bar${isSelected ? " is-selected" : ""}" data-funnel-stage="${esc(stage.id)}" aria-pressed="${isSelected}">
          <div class="admin-insights-funnel-bar-meta">
            <strong>${esc(stage.label)}</strong>
            <span>${esc(stage.count)}${stage.snapshot ? " · current" : ""}</span>
          </div>
          <div class="admin-insights-funnel-bar-track" aria-hidden="true">
            <span style="width:${width}%"></span>
          </div>
          <div class="admin-insights-funnel-bar-rates">
            ${index === 0 ? `<span>Top of funnel</span>` : `
              <span class="admin-insights-funnel-conv">${esc(stage.conversionFromPrevLabel)} convert</span>
              <span class="admin-insights-funnel-drop">${esc(stage.dropOffFromPrevLabel)} drop-off (${esc(stage.dropOffCount)})</span>
            `}
          </div>
        </button>
      `;
    }).join("");

    const people = selected ? (data.stagePeople?.[selected] || []) : [];
    const selectedLabel = stages.find((s) => s.id === selected)?.label || "";
    const peopleRows = people.map((p) => [
      p.name || "—",
      p.email || p.visitorKey || "—",
      p.source || "—",
      p.device || "—",
      p.landingPage || "—",
      p.reachedAt || "—",
      p.exitLabel || "—",
    ]);

    const sourceHeaders = ["Source", "Visitors", "Signups", "Trials", "Paid", "Visit→Paid", "Biggest drop"];
    const sourceRows = (data.bySource || []).map((row) => {
      const worst = (row.transitions || []).slice().sort((a, b) => b.dropOffRate - a.dropOffRate)[0];
      return [
        row.source,
        row.counts?.visitors ?? 0,
        row.counts?.signupCompletions ?? 0,
        row.counts?.trialStarts ?? 0,
        row.counts?.paidConversions ?? 0,
        row.overallConversionRate || "0%",
        worst ? `${worst.fromLabel}→${worst.toLabel} (${worst.dropOffRateLabel})` : "—",
      ];
    });

    return `
      <div class="admin-insights-filters">
        <label>Traffic source
          <select id="insightsFunnelSource">${sourceOptions}</select>
        </label>
        <button type="button" class="ghost-button" data-funnel-apply-source>Apply source</button>
        ${selected ? `<button type="button" class="ghost-button" data-funnel-clear-stage>Clear stage</button>` : ""}
      </div>
      ${data.note ? pendingNote(data.note) : ""}
      ${data.worstDropOff ? `
        <div class="admin-insights-pending">
          Biggest leak: <strong>${esc(data.worstDropOff.fromLabel)} → ${esc(data.worstDropOff.toLabel)}</strong>
          — ${esc(data.worstDropOff.dropOffRateLabel)} drop-off
          (${esc(data.worstDropOff.dropOffCount)} people).
        </div>
      ` : ""}
      <div class="admin-home-grid admin-insights-kpi-grid">
        ${kpi("Visit→paid", data.overallConversionRate || "0%")}
        ${kpi("Start Free CTAs", cta.startFree ?? 0)}
        ${kpi("Start Trial CTAs", cta.startTrial ?? 0)}
        ${kpi("Visit→signup", timing.avgHoursVisitToSignupLabel || "—")}
        ${kpi("Signup→paid", timing.avgHoursSignupToPaidLabel || "—")}
        ${kpi("Cost / signup", costs.costPerSignup != null ? `$${costs.costPerSignup}` : "—")}
        ${kpi("Cost / paid", costs.costPerPaid != null ? `$${costs.costPerPaid}` : "—")}
      </div>
      ${costs.note ? `<p class="muted-copy">${esc(costs.note)}</p>` : ""}
      <section class="admin-insights-funnel-vertical" aria-label="Marketing funnel conversion chart">
        <h4>Conversion chart</h4>
        <p class="muted-copy">Click a stage to see who reached it and where they exited.</p>
        <div class="admin-insights-funnel-bars">${chart || `<div class="empty-state">No funnel traffic in this range yet.</div>`}</div>
      </section>
      <section>
        <h4>Step-to-step conversion & drop-off</h4>
        <div class="admin-insights-funnel-flow">
          ${(transitions || []).map((t) => `
            <div class="admin-insights-funnel-flow-row">
              <span>${esc(t.fromLabel)} → ${esc(t.toLabel)}</span>
              <strong class="admin-insights-funnel-conv">${esc(t.conversionRateLabel)} convert</strong>
              <strong class="admin-insights-funnel-drop">${esc(t.dropOffRateLabel)} drop-off (${esc(t.dropOffCount)})</strong>
            </div>
          `).join("") || `<p class="muted-copy">Not enough stages to compare yet.</p>`}
        </div>
      </section>
      ${selected ? `
        <section class="admin-insights-funnel-drilldown">
          <h4>${esc(selectedLabel)} · people who reached this stage</h4>
          ${table(["Name", "Email / visitor", "Source", "Device", "Landing", "Reached", "Exit"], peopleRows)}
        </section>
      ` : ""}
      <div class="admin-insights-split">
        <section>
          <h4>Device breakdown</h4>
          ${table(["Device", "Events"], (data.deviceBreakdown || []).map((r) => [r.key, r.count]))}
        </section>
        <section>
          <h4>Top landing pages by conversion</h4>
          ${table(["Page", "Visitors", "Signups", "Signup rate", "Paid rate"], (data.topLandingPages || []).map((r) => [r.page, r.visitors, r.signups, r.signupRate, r.paidRate]))}
        </section>
      </div>
      <section>
        <h4>Breakdown by source</h4>
        ${table(sourceHeaders, sourceRows)}
      </section>
    `;
  }

  function renderHubBody(hub, data) {
    switch (hub) {
      case "advisor":
        return renderAdvisor(data || {});
      case "marketing-funnel":
        return renderMarketingFunnel(data || {});
      case "feature-usage":
        return renderFeatureUsage(data || {});
      case "feature-requests":
        return renderFeatureRequests(data || {});
      case "user-journey":
        return `
          <div class="empty-state">
            <p>User Journey timelines live on each member profile.</p>
            <p class="muted-copy">Open Users → select a member → Journey tab.</p>
            <button type="button" class="primary-button" data-insights-open-hub="users">Go to Users</button>
          </div>
        `;
      case "error-center": {
        const d = data || {};
        return `
          ${d.instrumentation?.clientErrors === "pending" ? pendingNote("Client JS error events are pending; server 5xx monitor is live.") : ""}
          <div class="admin-home-grid admin-insights-kpi-grid">
            ${kpi("JS errors", d.javascriptErrors ?? 0)}
            ${kpi("Failed APIs", d.failedApiRequests ?? 0)}
            ${kpi("404s", d.notFoundPages ?? 0)}
            ${kpi("Monitor", d.monitoringOverall || "—")}
          </div>
          <p class="muted-copy">${esc(d.serverMonitor?.detail || "")}</p>
          <div class="admin-insights-split">
            <section><h4>Browsers</h4>${table(["Browser", "Events"], (d.browserBreakdown || []).map((r) => [r.key, r.count]))}</section>
            <section><h4>Devices</h4>${table(["Device", "Events"], (d.deviceBreakdown || []).map((r) => [r.key, r.count]))}</section>
          </div>
          <section><h4>Most common errors</h4>${table(["Error", "Count"], (d.commonErrors || []).map((r) => [r.key, r.count]))}</section>
          <section><h4>Recent</h4>${table(["When", "Type", "Message", "User"], (d.recent || []).map((r) => [r.at, r.name, r.message, r.user || "—"]))}</section>
        `;
      }
      case "search-analytics": {
        const d = data || {};
        return `
          ${d.note ? pendingNote(d.note) : ""}
          <div class="admin-home-grid admin-insights-kpi-grid">
            ${kpi("To lessons", d.leadingToLessonViews ?? 0)}
            ${kpi("To signups", d.leadingToSignups ?? 0)}
            ${kpi("To subscriptions", d.leadingToSubscriptions ?? 0)}
          </div>
          <div class="admin-insights-split">
            <section><h4>Most searched</h4>${table(["Term", "Count"], (d.mostSearched || []).map((r) => [r.key, r.count]))}</section>
            <section><h4>No results</h4>${table(["Term", "Count"], (d.noResults || []).map((r) => [r.key, r.count]))}</section>
          </div>
          <section><h4>Content recommendations</h4>${table(["Query", "Demand", "Suggestion"], (d.contentRecommendations || []).map((r) => [r.query, r.demand, r.suggestion]))}</section>
        `;
      }
      case "email-analytics": {
        const d = data || {};
        const t = d.totals || {};
        return `
          ${d.instrumentation?.note ? pendingNote(d.instrumentation.note) : ""}
          <div class="admin-home-grid admin-insights-kpi-grid">
            ${kpi("Sent", t.sent ?? 0)}
            ${kpi("Delivered", t.delivered ?? 0)}
            ${kpi("Open rate", t.openRate ?? "—")}
            ${kpi("Click rate", t.clickRate ?? "—")}
            ${kpi("Unsubscribes", t.unsubscribes ?? 0)}
          </div>
          <section><h4>By template</h4>${table(["Template", "Sent"], (d.byTemplate || []).map((r) => [r.key, r.count]))}</section>
        `;
      }
      case "seo-dashboard": {
        const d = data || {};
        return `
          ${d.note ? pendingNote(d.note) : ""}
          <div class="admin-home-grid admin-insights-kpi-grid">
            ${kpi("Sitemap URLs", d.indexedPages ?? "—")}
            ${kpi("Sitemap", d.sitemapStatus || "—")}
            ${kpi("Robots", d.robotsStatus || "—")}
            ${kpi("GSC", d.gscConnected ? "Connected" : "Not connected")}
          </div>
        `;
      }
      case "churn-dashboard": {
        const d = data || {};
        return `
          ${d.note ? pendingNote(d.note) : ""}
          <div class="admin-home-grid admin-insights-kpi-grid">
            ${kpi("Monthly cancels", d.monthlyChurnEvents ?? 0)}
            ${kpi("Annual cancels", d.annualChurnEvents ?? 0)}
          </div>
          ${table(
            ["Email", "Reason", "Length (days)", "Trial/Paid", "Last login", "Offer"],
            (d.rows || []).map((r) => [r.email, r.reason, r.subscriptionLengthDays ?? "—", r.trialOrPaid, r.lastLogin || "—", r.offerAccepted ? "Yes" : "No"]),
          )}
        `;
      }
      case "content-health": {
        const d = data || {};
        return `
          <div class="admin-home-grid admin-insights-kpi-grid">
            ${kpi("Lessons", d.lessonCount ?? 0)}
            ${kpi("Activities", d.activityCount ?? 0)}
            ${kpi("Update recs", (d.updateRecommendations || []).length)}
          </div>
          <section><h4>Update recommendations</h4>${table(["Title", "Reason"], (d.updateRecommendations || []).map((r) => [r.title, r.reason]))}</section>
          <section><h4>Top lessons</h4>${table(["Title", "Views", "Downloads", "Prints", "Missing"], (d.lessons || []).slice(0, 40).map((r) => [r.title, r.views, r.downloads, r.prints, (r.missing || []).join(", ") || "—"]))}</section>
        `;
      }
      case "release-center": {
        const d = data || {};
        const cur = d.current || {};
        return `
          <div class="admin-home-grid admin-insights-kpi-grid">
            ${kpi("Version", cur.version || "—")}
            ${kpi("Commit", (cur.commitSha || "").slice(0, 12) || "—")}
            ${kpi("Health", cur.healthStatus || "—")}
          </div>
          <p class="muted-copy">${esc(d.rollbackAvailability || "")}</p>
          <p class="muted-copy">${esc(d.historyNote || "")}</p>
          <section><h4>QA checklist</h4>${table(["Check", "Status"], (d.qaChecklist || []).map((r) => [r.item, r.done === true ? "Pass" : r.done === false ? "Fail" : "—"]))}</section>
        `;
      }
      default:
        return renderGenericListHub(hub, [], ["Info"]);
    }
  }

  function bindFunnelControls(container) {
    container.querySelector("[data-funnel-apply-source]")?.addEventListener("click", () => {
      insightsState.source = container.querySelector("#insightsFunnelSource")?.value || "all";
      insightsState.selectedStage = "";
      renderAdminInsights(container, "marketing-funnel");
    });
    container.querySelector("#insightsFunnelSource")?.addEventListener("change", (event) => {
      insightsState.source = event.target.value || "all";
    });
    container.querySelector("[data-funnel-clear-stage]")?.addEventListener("click", () => {
      insightsState.selectedStage = "";
      renderAdminInsights(container, "marketing-funnel");
    });
    container.querySelectorAll("[data-funnel-stage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const stage = btn.getAttribute("data-funnel-stage") || "";
        insightsState.selectedStage = insightsState.selectedStage === stage ? "" : stage;
        renderAdminInsights(container, "marketing-funnel");
      });
    });
  }

  function bindCommon(container) {
    container.querySelectorAll("[data-insights-range]").forEach((btn) => {
      btn.addEventListener("click", () => {
        insightsState.range = btn.getAttribute("data-insights-range") || "7d";
        renderAdminInsights(container, insightsState.hub);
      });
    });
    container.querySelectorAll("[data-insights-hub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hub = btn.getAttribute("data-insights-hub") || "advisor";
        const tab = hub === "feature-requests" ? "feature-requests-center" : hub;
        if (typeof window.setAdminSectionTab === "function") {
          window.setAdminSectionTab(tab);
        } else {
          renderAdminInsights(container, hub);
        }
      });
    });
    container.querySelectorAll("[data-insights-open-hub]").forEach((el) => {
      el.addEventListener("click", () => {
        const hub = el.getAttribute("data-insights-open-hub");
        if (hub === "users" && typeof window.setAdminSectionTab === "function") {
          window.setAdminSectionTab("users");
          return;
        }
        if (hub && typeof window.setAdminSectionTab === "function") {
          const tab = hub === "feature-requests" ? "feature-requests-center" : hub;
          window.setAdminSectionTab(tab);
        }
      });
    });
  }

  function bindFeatureRequestEditors(container) {
    const apply = container.querySelector("#insightsFrApply");
    apply?.addEventListener("click", () => {
      insightsState.sort = container.querySelector("#insightsFrSort")?.value || "votes";
      insightsState.category = container.querySelector("#insightsFrCategory")?.value || "";
      insightsState.status = container.querySelector("#insightsFrStatus")?.value || "";
      renderAdminInsights(container, "feature-requests");
    });

    container.querySelectorAll("[data-fr-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-fr-save");
        const status = container.querySelector(`[data-fr-status="${CSS.escape(id)}"]`)?.value;
        const estimatedRelease = container.querySelector(`[data-fr-estimate="${CSS.escape(id)}"]`)?.value || "";
        const notifyOnComplete = Boolean(container.querySelector(`[data-fr-notify="${CSS.escape(id)}"]`)?.checked);
        const adminNote = container.querySelector(`[data-fr-note="${CSS.escape(id)}"]`)?.value || "";
        const msg = container.querySelector("#insightsFrMessage");
        try {
          const headers = { "Content-Type": "application/json" };
          const t = token();
          if (t) headers.Authorization = `Bearer ${t}`;
          const res = await fetch("/api/admin/feature-request-update", {
            method: "POST",
            headers,
            body: JSON.stringify({
              id,
              status,
              estimatedRelease,
              notifyOnComplete,
              ...(adminNote ? { adminNote } : {}),
              adminToken: t,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "Update failed");
          if (msg) msg.textContent = "Saved.";
          renderAdminInsights(container, "feature-requests");
        } catch (error) {
          if (msg) msg.textContent = error.message || "Update failed";
        }
      });
    });
  }

  async function renderAdminInsights(target, hub = "advisor") {
    if (!target) return;
    insightsState.hub = hub;
    insightsState.loading = true;
    const meta = HUB_META[hub] || { title: hub, blurb: "" };
    const showRange = !["feature-requests", "email-analytics", "seo-dashboard", "release-center", "user-journey"].includes(hub);
    target.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Admin 2.0 · Insights</p>
          <h3>${esc(meta.title)}</h3>
          <p class="muted-copy">${esc(meta.blurb)}</p>
        </div>
        <div class="admin-insights-toolbar">
          ${showRange ? rangeToolbar(insightsState.range) : ""}
          <button type="button" class="ghost-button" data-insights-refresh>Refresh</button>
        </div>
      </div>
      ${hubSwitcher(hub)}
      <div class="admin-async-state" data-admin-async="loading"><p><strong>Loading insights…</strong></p></div>
    `;
    target.querySelector("[data-insights-refresh]")?.addEventListener("click", () => renderAdminInsights(target, hub));
    bindCommon(target);

    try {
      const insights = await fetchInsights({ hub });
      insightsState.cache = insights;
      insightsState.loading = false;
      const body = renderHubBody(hub, insights.data || {});
      target.innerHTML = `
        <div class="section-heading">
          <div>
            <p class="eyebrow">Admin 2.0 · Insights</p>
            <h3>${esc(meta.title)}</h3>
            <p class="muted-copy">${esc(meta.blurb)} Updated ${esc(insights.updatedAt || "")}.</p>
          </div>
          <div class="admin-insights-toolbar">
            ${showRange ? rangeToolbar(insightsState.range) : ""}
            <button type="button" class="ghost-button" data-insights-refresh>Refresh</button>
          </div>
        </div>
        ${hubSwitcher(hub)}
        <div class="admin-insights-body">${body}</div>
      `;
      bindCommon(target);
      target.querySelector("[data-insights-refresh]")?.addEventListener("click", () => renderAdminInsights(target, hub));
      if (hub === "feature-requests") bindFeatureRequestEditors(target);
      if (hub === "marketing-funnel") bindFunnelControls(target);
    } catch (error) {
      insightsState.loading = false;
      target.innerHTML = `
        <div class="section-heading">
          <div><p class="eyebrow">Admin 2.0</p><h3>${esc(meta.title)}</h3></div>
          <button type="button" class="primary-button" data-insights-refresh>Retry</button>
        </div>
        <div class="admin-async-state is-error"><p><strong>${esc(error.message || "Failed to load insights.")}</strong></p></div>
      `;
      target.querySelector("[data-insights-refresh]")?.addEventListener("click", () => renderAdminInsights(target, hub));
    }
  }

  async function renderUserJourneyInto(container, email) {
    if (!container || !email) return;
    container.innerHTML = `<p class="muted-copy">Loading journey…</p>`;
    try {
      const insights = await fetchInsights({ hub: "user-journey", email });
      const data = insights.data || {};
      if (!data.found) {
        container.innerHTML = `<div class="empty-state">No journey data for this user.</div>`;
        return;
      }
      container.innerHTML = `
        <div class="aup-info-grid admin-insights-journey-grid">
          ${(data.milestones || []).map((m) => `
            <div>
              <span>${esc(m.label)}</span>
              <strong>${esc(m.at ? new Date(m.at).toLocaleString() : (m.detail || "—"))}</strong>
              ${m.at && m.detail ? `<small class="muted-copy">${esc(m.detail)}</small>` : ""}
            </div>
          `).join("")}
        </div>
        <h4 style="margin-top:16px;">Recent activity</h4>
        ${table(["When", "Event", "Detail"], (data.recentActivity || []).map((r) => [r.at, r.name, r.detail || r.path || ""]))}
      `;
    } catch (error) {
      container.innerHTML = `<div class="empty-state">${esc(error.message || "Could not load journey.")}</div>`;
    }
  }

  window.renderAdminInsights = renderAdminInsights;
  window.renderAdminUserJourney = renderUserJourneyInto;
  window.AdminInsights = { renderAdminInsights, renderUserJourneyInto, fetchInsights };
})();
