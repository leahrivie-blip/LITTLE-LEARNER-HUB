/**
 * Conversion Intelligence — Owner/Admin UI.
 * Consumes GET /api/admin/conversion-intelligence
 */
(function adminConversionIntelligenceModule(root) {
  let state = {
    range: "7d",
    source: "all",
    ageGroup: "all",
    converted: "all",
    startDate: "",
    endDate: "",
    loading: false,
    cache: null,
    journeyEmail: "",
    detailEmail: "",
    scrollRestore: null,
    queue: {
      activated: "all",
      highIntent: "all",
      persona: "all",
      queueAgeGroup: "all",
      queueSource: "all",
      offer: "all",
      leadStatus: "all",
      reason: "all",
      cohort: "all",
      queueConverted: "all",
    },
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

  async function fetchData(params = {}) {
    const qs = new URLSearchParams({
      range: params.range || state.range,
      source: params.source || state.source,
      ageGroup: params.ageGroup || state.ageGroup,
      converted: params.converted || state.converted,
      activated: params.activated || state.queue.activated,
      highIntent: params.highIntent || state.queue.highIntent,
      persona: params.persona || state.queue.persona,
      queueAgeGroup: params.queueAgeGroup || state.queue.queueAgeGroup,
      queueSource: params.queueSource || state.queue.queueSource,
      offer: params.offer || state.queue.offer,
      leadStatus: params.leadStatus || state.queue.leadStatus,
      reason: params.reason || state.queue.reason,
      cohort: params.cohort || state.queue.cohort,
      queueConverted: params.queueConverted || state.queue.queueConverted,
    });
    if (state.range === "custom") {
      if (state.startDate) qs.set("startDate", state.startDate);
      if (state.endDate) qs.set("endDate", state.endDate);
    }
    if (params.journeyEmail || state.journeyEmail) {
      qs.set("journeyEmail", params.journeyEmail || state.journeyEmail);
    }
    if (params.detailEmail || state.detailEmail) {
      qs.set("detailEmail", params.detailEmail || state.detailEmail);
    }
    qs.set("_", String(Date.now()));
    const headers = { "Cache-Control": "no-store" };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`/api/admin/conversion-intelligence?${qs}`, { cache: "no-store", headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Conversion Intelligence failed (${res.status})`);
    return json.data;
  }

  async function postLeadUpdate(payload) {
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch("/api/admin/conversion-leads", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Lead update failed (${res.status})`);
    return json;
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

  function rangeToolbar(active) {
    return ["today", "3d", "7d", "14d", "30d", "all"].map((key) => `
      <button type="button" class="ghost-button admin-insights-range${active === key ? " is-active" : ""}" data-conv-range="${key}">${
        key === "today" ? "Today" : key === "3d" ? "3 days" : key === "7d" ? "7 days" : key === "14d" ? "14 days" : key === "30d" ? "30 days" : "All time"
      }</button>
    `).join("");
  }

  function renderFunnel(funnel) {
    if (!funnel?.stages?.length) return `<div class="empty-state">No funnel data yet.</div>`;
    const biggest = funnel.biggestDropOff || {};
    const bars = funnel.stages.map((stage, index) => {
      const width = funnel.baseCount ? Math.max(4, Math.round((stage.uniqueUsers / funnel.baseCount) * 100)) : 4;
      const isBiggest = biggest.to === stage.label;
      return `
        <button type="button" class="admin-insights-funnel-bar${isBiggest ? " is-selected" : ""}" type="button">
          <div class="admin-insights-funnel-bar-meta">
            <strong>${esc(stage.label)}</strong>
            <span>${esc(stage.uniqueUsers)} users</span>
          </div>
          <div class="admin-insights-funnel-bar-track" aria-hidden="true"><span style="width:${width}%"></span></div>
          <div class="admin-insights-funnel-bar-rates">
            <span>${esc(stage.pctOfSignups)}% of signups</span>
            ${index > 0 ? `<span class="admin-insights-funnel-drop">${esc(stage.dropOffPct)}% drop-off (${esc(stage.dropOffCount)})</span>` : ""}
          </div>
        </button>
      `;
    }).join("");
    return `
      <section class="admin-insights-funnel-vertical" aria-label="Conversion funnel">
        <h4>Conversion Funnel</h4>
        ${biggest.from ? `<p class="form-note admin-insights-pending">Biggest drop-off: <strong>${esc(biggest.from)} → ${esc(biggest.to)}</strong> (${esc(biggest.dropPct)}% lost)</p>` : ""}
        <div class="admin-insights-funnel-bars">${bars}</div>
      </section>
    `;
  }

  function renderToday(today) {
    if (!today) return "";
    const sources = (today.sources || []).map((s) => `${esc(s.source)}: ${esc(s.count)}`).join(" · ") || "—";
    return `
      <section class="admin-home-card">
        <p class="eyebrow">Today's New Users</p>
        <h3>${esc(today.signups)} Free Signups</h3>
        <p class="muted-copy">${sources}</p>
        <ul class="admin-insights-summary-list">
          <li>${esc(today.lessonViewers)} viewed a lesson</li>
          <li>${esc(today.activityViewers)} opened activities</li>
          <li>${esc(today.proEncounters)} encountered Pro</li>
          <li>${esc(today.pricingViews)} viewed pricing</li>
          <li>${esc(today.upgradeClicks)} clicked upgrade</li>
          <li>${esc(today.checkoutStarts)} checkout · ${esc(today.paid)} paid</li>
        </ul>
        <p class="form-note">Biggest drop-off: <strong>${esc(today.biggestDropOff)}</strong></p>
      </section>
    `;
  }

  function renderInsights(insights) {
    const items = Array.isArray(insights) ? insights : [];
    return `
      <section class="admin-home-card">
        <p class="eyebrow">Why Aren't They Buying?</p>
        <ul class="admin-insights-summary-list">
          ${items.map((item) => `<li>${esc(item)}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  function renderJourney(journey) {
    if (!journey?.timeline?.length) {
      return `<div class="empty-state">Select a user or wait for journey data.</div>`;
    }
    return `
      <section class="admin-home-card">
        <p class="eyebrow">User Journey</p>
        <h4>${esc(journey.email)}</h4>
        <ol class="admin-insights-summary-list">
          ${journey.timeline.map((step) => `
            <li><strong>${esc(step.time)}</strong> — ${esc(step.label)}${step.detail ? ` <span class="muted-copy">(${esc(step.detail)})</span>` : ""}</li>
          `).join("")}
        </ol>
        <p class="form-note">${esc(journey.outcome)}</p>
      </section>
    `;
  }

  function optList(values, selected) {
    return (values || []).map((v) => `<option value="${esc(v)}"${String(selected) === String(v) ? " selected" : ""}>${esc(v)}</option>`).join("");
  }

  function optListReasons(reasons, selected) {
    return (reasons || []).map((v) => `<option value="${esc(v)}"${String(selected) === String(v) ? " selected" : ""}>${esc(reasonLabel(v))}</option>`).join("");
  }

  function optListStatuses(statuses, selected) {
    return (statuses || []).map((v) => `<option value="${esc(v)}"${String(selected) === String(v) ? " selected" : ""}>${esc(leadStatusLabel(v))}</option>`).join("");
  }

  /** Owner-facing status label (display only; does not change stored values). */
  function leadStatusLabel(status) {
    const key = String(status || "");
    const map = {
      new: "New signup",
      activated: "Activated",
      high_intent: "High purchase intent",
      follow_up: "Follow-up",
      contacted: "Contacted",
      considering: "Considering",
      not_ready: "Not ready",
      converted: "Converted",
      lost: "Lost",
    };
    return map[key] || key || "—";
  }

  /** Owner-facing reason label (display only). */
  function reasonLabel(reason) {
    const key = String(reason || "");
    const map = {
      price: "Too expensive",
      not_enough_value: "Not enough value",
      needs_different_age_group: "Needs different age group",
      needs_specific_content: "Needs more lesson plans",
      hard_to_use: "Hard to use",
      prefers_current_method: "Prefers current method",
      director_approval: "Director approval needed",
      center_budget: "Center budget",
      not_ready_yet: "Not ready yet",
      technical_issue: "Technical issue",
      just_browsing: "Just looking",
      other: "Other",
    };
    return map[key] || key || "—";
  }

  function queueScrollAnchorForEmail(email) {
    const clean = String(email || "").trim();
    return clean ? `conv-lead-${clean.replace(/[^a-zA-Z0-9@._-]+/g, "-")}` : "convOwnerFollowUp";
  }

  function queueLeadCard(row, statuses, reasons) {
    const email = String(row.email || "");
    const anchorId = queueScrollAnchorForEmail(email);
    const signalHint = row.checkoutStarted === "Yes"
      ? `Checkout started · ${row.proEncounters || 0} Pro encounters`
      : `${row.proEncounters || 0} Pro encounters`;
    return `
      <article class="conv-lead-card" id="${esc(anchorId)}" data-lead-email="${esc(email)}">
        <div class="conv-lead-card-header">
          <strong>${esc(row.user)}</strong>
          <span class="conv-lead-pill">${esc(row.paidFreeLabel || "Free / unpaid")}</span>
        </div>
        <dl class="conv-lead-card-meta">
          <div><dt>Intent</dt><dd>${esc(row.intentLevel || "—")}${row.intentScore != null ? ` (${esc(row.intentScore)})` : ""}</dd></div>
          <div><dt>Persona</dt><dd>${esc(row.persona || "—")}</dd></div>
          <div><dt>Activated</dt><dd>${esc(row.activated ? "Yes" : "No")}${row.activatedAt ? ` · ${esc(row.activatedAt)}` : ""}</dd></div>
          <div><dt>Last active</dt><dd>${esc(row.lastActive || "—")}</dd></div>
          <div><dt>Signals</dt><dd>${esc(signalHint)}</dd></div>
          <div><dt>Follow-up status</dt><dd>
            <select class="conv-lead-select" data-lead-status="${esc(email)}">${optListStatuses(statuses, row.ownerStatus || row.effectiveStatus || "new")}</select>
            <span class="muted-copy">Suggested: ${esc(leadStatusLabel(row.derivedStatus))}</span>
          </dd></div>
          <div><dt>Reason captured</dt><dd>
            <select class="conv-lead-select" data-lead-reason="${esc(email)}"><option value="">—</option>${optListReasons(reasons, row.capturedReason || "")}</select>
            <span class="muted-copy">${esc(row.capturedReason ? reasonLabel(row.capturedReason) : "None recorded")}</span>
          </dd></div>
          ${row.latestNotePreview ? `<div class="conv-lead-note"><dt>Note</dt><dd>${esc(row.latestNotePreview)}</dd></div>` : ""}
        </dl>
        ${(row.categories || []).length ? `<p class="muted-copy conv-lead-cats">${esc((row.categories || []).join(" · "))}</p>` : ""}
        <div class="conv-lead-card-actions">
          <button type="button" class="ghost-button conv-lead-action" data-lead-detail="${esc(email)}">Detail</button>
          <button type="button" class="ghost-button conv-lead-action" data-lead-save="${esc(email)}">Save</button>
          <button type="button" class="ghost-button conv-lead-action" data-lead-note="${esc(email)}">Add Note</button>
        </div>
      </article>
    `;
  }

  function applyScrollRestore() {
    const restore = state.scrollRestore;
    state.scrollRestore = null;
    if (!restore) return;
    requestAnimationFrame(() => {
      if (restore.type === "y") {
        window.scrollTo(0, Number(restore.value) || 0);
        return;
      }
      const target = String(restore.value || "");
      const el = document.getElementById(target)
        || document.querySelector(`[data-lead-email="${CSS.escape(target)}"]`);
      if (el) el.scrollIntoView({ block: "nearest" });
    });
  }

  function renderOwnerWorkflow(data) {
    const summary = data.ownerWorkflowSummary || {};
    const reasonFreq = data.ownerReasonFrequency || [];
    const statuses = data.leadStatuses || ["new", "activated", "high_intent", "follow_up", "contacted", "considering", "not_ready", "converted", "lost"];
    const reasons = data.nonBuyerReasons || [];
    const queue = data.ownerActionQueue || [];
    const lostWf = data.lostUserWorkflow || {};
    const detail = data.conversionLeadDetail;
    const q = state.queue;

    const reasonRollupHtml = reasonFreq.length ? table(
      ["Reason (owner-entered)", "Count"],
      reasonFreq.map((row) => [row.label || reasonLabel(row.reason), row.count]),
    ) : `<div class="empty-state">No owner-entered reasons recorded yet.</div>`;

    const detailHtml = detail ? `
      <section class="admin-home-card" id="convLeadDetail">
        <p class="eyebrow">Conversion Detail — ${esc(detail.emailMasked)}</p>
        <div class="admin-insights-split">
          <div>
            <h4>${esc(detail.layers?.observed?.label || "What happened")}</h4>
            <p class="muted-copy">${esc(detail.layers?.observed?.description || "")}</p>
            <ul class="admin-insights-summary-list">
              <li>Signup: ${esc(detail.layers?.observed?.signupAt)}</li>
              <li>Last active: ${esc(detail.layers?.observed?.lastActive)}</li>
              <li>Lessons / activities: ${esc(detail.layers?.observed?.lessonViews)} / ${esc(detail.layers?.observed?.activityViews)}</li>
              <li>Pro / pricing / upgrade / checkout: ${esc(detail.layers?.observed?.proEncounters)} / ${esc(detail.layers?.observed?.pricingViews)} / ${esc(detail.layers?.observed?.upgradeClicks)} / ${esc(detail.layers?.observed?.checkoutStarts)}</li>
            </ul>
            <ol class="admin-insights-summary-list">
              ${(detail.layers?.observed?.timeline || []).slice(0, 12).map((step) => `
                <li><strong>${esc(step.time)}</strong> — ${esc(step.label)}</li>
              `).join("") || "<li>No timeline events.</li>"}
            </ol>
          </div>
          <div>
            <h4>${esc(detail.layers?.derived?.label || "What the system suggests")}</h4>
            <p class="muted-copy">${esc(detail.layers?.derived?.description || "")}</p>
            <ul class="admin-insights-summary-list">
              <li>Activated: ${esc(detail.layers?.derived?.activated ? "Yes" : "No")} ${detail.layers?.derived?.activatedAt ? `(${esc(detail.layers.derived.activatedAt)})` : ""}</li>
              <li>Persona: ${esc(detail.layers?.derived?.persona)}</li>
              <li>Suggested status: ${esc(leadStatusLabel(detail.layers?.derived?.derivedStatus))}</li>
              <li>Paid (billing): ${esc(detail.layers?.derived?.paidAuthoritative ? "Yes" : "No")}</li>
              <li class="muted-copy">${esc(detail.layers?.derived?.associationNote || "Pre-purchase association (not causal)")}</li>
            </ul>
            <h4>${esc(detail.layers?.ownerEntered?.label || "What you recorded")}</h4>
            <p class="muted-copy">${esc(detail.layers?.ownerEntered?.description || "")}</p>
            <ul class="admin-insights-summary-list">
              <li>Your status: ${esc(leadStatusLabel(detail.layers?.ownerEntered?.status) || "—")}</li>
              <li>Effective status: ${esc(leadStatusLabel(detail.layers?.ownerEntered?.effectiveStatus))}</li>
              <li>Notes: ${(detail.layers?.ownerEntered?.notes || []).length}</li>
              <li>Reasons: ${(detail.layers?.ownerEntered?.reasons || []).map((r) => esc(reasonLabel(r.reason))).join(", ") || "—"}</li>
            </ul>
          </div>
        </div>
        <button type="button" class="ghost-button conv-lead-action" data-conv-clear-detail>Close detail</button>
      </section>
    ` : "";

    const queueRowsHtml = queue.length ? queue.map((row) => {
      const email = String(row.email || "");
      const anchorId = queueScrollAnchorForEmail(email);
      return `
                <tr id="${esc(anchorId)}" data-lead-email="${esc(email)}">
                  <td>${esc(row.user)}<div class="muted-copy">${esc(row.paidFreeLabel || "")}</div></td>
                  <td>${esc(row.signupDate)}</td>
                  <td>${esc(row.persona)}<div class="muted-copy">${esc((row.ageGroups || []).join(", "))}</div></td>
                  <td>${esc(row.activated ? "Yes" : "No")}<div class="muted-copy">${esc(row.activatedAt || "")}</div></td>
                  <td>${esc(row.intentLevel)}${row.intentScore != null ? ` (${esc(row.intentScore)})` : ""}<div class="muted-copy">${esc((row.categories || []).join("; "))}</div></td>
                  <td>${esc(row.checkoutStarted)} · Pro ${esc(row.proEncounters)}</td>
                  <td>
                    <select data-lead-status="${esc(email)}">${optListStatuses(statuses, row.ownerStatus || row.effectiveStatus || "new")}</select>
                    <div class="muted-copy">Suggested: ${esc(leadStatusLabel(row.derivedStatus))}</div>
                  </td>
                  <td>
                    <select data-lead-reason="${esc(email)}"><option value="">—</option>${optListReasons(reasons, row.capturedReason || "")}</select>
                    <div class="muted-copy">${esc(row.capturedReason ? reasonLabel(row.capturedReason) : "None recorded")}</div>
                  </td>
                  <td>${esc(row.latestNotePreview || "—")}<div class="muted-copy">${esc(row.latestNoteAt || "")}</div></td>
                  <td class="conv-queue-actions">
                    <button type="button" class="ghost-button conv-lead-action" data-lead-detail="${esc(email)}">Detail</button>
                    <button type="button" class="ghost-button conv-lead-action" data-lead-save="${esc(email)}">Save</button>
                    <button type="button" class="ghost-button conv-lead-action" data-lead-note="${esc(email)}">Add Note</button>
                  </td>
                </tr>
              `;
    }).join("") : `<tr><td colspan="10"><div class="empty-state">No leads match these filters.</div></td></tr>`;

    const queueCardsHtml = queue.length
      ? queue.map((row) => queueLeadCard(row, statuses, reasons)).join("")
      : `<div class="empty-state">No leads match these filters.</div>`;

    return `
      <section class="admin-home-card" id="convOwnerFollowUp">
        <p class="eyebrow">Owner Follow-Up</p>
        <h4>Who should I pay attention to, and what do I know about why they haven't purchased?</h4>
        <p class="muted-copy">${esc(summary.note || "Owner status supplements analytics; billing remains authoritative for paid conversion.")}</p>
        <div class="admin-home-grid admin-insights-kpi-grid conv-owner-followup-kpis">
          ${kpi("High-intent unpaid", summary.highIntentUnpaid ?? "—")}
          ${kpi("Activated unpaid", summary.activatedUnpaid ?? "—")}
          ${kpi("Checkout unpaid", summary.checkoutStartedUnpaid ?? "—")}
          ${kpi("Follow-up", summary.followUp ?? "—")}
          ${kpi("Contacted", summary.contacted ?? "—")}
          ${kpi("Considering", summary.considering ?? "—")}
          ${kpi("Lost (owner)", summary.lost ?? "—")}
          ${kpi("Converted (billing)", summary.converted ?? "—")}
        </div>
      </section>
      <section class="admin-home-card">
        <h4>Why people aren't buying (owner-entered)</h4>
        <p class="muted-copy">Counts from reasons you recorded — not inferred from behavior.</p>
        ${reasonRollupHtml}
      </section>
      <section>
        <h4>Lost-User Workflow (analysis only)</h4>
        <p class="muted-copy">${esc(lostWf.note || "")}</p>
        ${table(
          ["Group", "Count"],
          (lostWf.groups || []).map((g) => [g.label, g.count]),
        )}
      </section>
      <section id="convOwnerActionQueue">
        <h4>Owner Action Queue</h4>
        <p class="muted-copy">Showing ${esc(queue.length)} of ${esc(data.ownerActionQueueTotal ?? queue.length)} leads · sorted by purchase intent signals. Owner-only.</p>
        <div class="admin-insights-filters conv-queue-filters">
          <label>Activated <select id="convQActivated"><option value="all">All</option><option value="activated"${q.activated === "activated" ? " selected" : ""}>Activated</option><option value="non_activated"${q.activated === "non_activated" ? " selected" : ""}>Not activated</option></select></label>
          <label>High intent <select id="convQHighIntent"><option value="all">All</option><option value="yes"${q.highIntent === "yes" ? " selected" : ""}>High only</option></select></label>
          <label>Persona <select id="convQPersona"><option value="all">All</option>${optList(["home_daycare", "center", "teacher_staff", "unknown"], q.persona)}</select></label>
          <label>Age <select id="convQAge"><option value="all">All</option>${optList(["Infant", "Toddler", "Preschool", "School Age", "Mixed Ages", "All Ages", "Unknown"], q.queueAgeGroup)}</select></label>
          <label>Status <select id="convQStatus"><option value="all">All</option>${optListStatuses(statuses, q.leadStatus === "all" ? "" : q.leadStatus)}</select></label>
          <label>Reason <select id="convQReason"><option value="all">All</option>${optListReasons(reasons, q.reason === "all" ? "" : q.reason)}</select></label>
          <label>Paid <select id="convQConverted"><option value="all">All</option><option value="not_converted"${q.queueConverted === "not_converted" ? " selected" : ""}>Unpaid</option><option value="converted"${q.queueConverted === "converted" ? " selected" : ""}>Paid</option></select></label>
        </div>
        <div class="conv-queue-desktop admin-users-table-wrap">
          <table class="admin-users-table admin-insights-table">
            <thead>
              <tr>
                <th>User</th><th>Signup</th><th>Persona</th><th>Activated</th><th>Intent / cats</th>
                <th>Checkout</th><th>Status</th><th>Reason</th><th>Note</th><th>Act</th>
              </tr>
            </thead>
            <tbody>
              ${queueRowsHtml}
            </tbody>
          </table>
        </div>
        <div class="conv-queue-mobile">
          ${queueCardsHtml}
        </div>
      </section>
      ${detailHtml}
    `;
  }

  function renderBody(data) {
    const cards = data.summaryCards || {};
    const biggest = cards.biggestDropOff || {};
    const activation = data.activation || {};
    const cohorts = data.signupCohorts || {};
    const campaign = data.campaignAttribution || {};
    const ageSeg = data.ageGroupSegmentation || {};
    const lessonAssoc = data.lessonAssociation || data.content || {};
    const lost = data.lostUsers || {};
    return `
      <section class="admin-insights-hero">
        <p class="eyebrow">Conversion Intelligence</p>
        <h3>What are free users doing before they upgrade or disappear?</h3>
        <p class="muted-copy">${esc(data.range?.label || "")} · ${esc(data.sampleSize || 0)} users in sample · Updated ${esc((data.generatedAt || "").slice(0, 16).replace("T", " "))}</p>
      </section>
      <div class="admin-home-grid admin-insights-kpi-grid">
        ${kpi("Free Signups", cards.freeSignups ?? "—")}
        ${kpi("Paid Conversions", cards.paidConversions ?? "—")}
        ${kpi("Free → Paid %", cards.freeToPaidPct != null ? `${cards.freeToPaidPct}%` : "—")}
        ${kpi("Activated", activation.activatedUsers ?? "—")}
        ${kpi("Activation Rate", activation.activationRate ?? "—")}
        ${kpi("Pricing Views", cards.pricingViews ?? "—")}
        ${kpi("Upgrade Clicks", cards.upgradeClicks ?? "—")}
        ${kpi("Checkout Starts", cards.checkoutStarts ?? "—")}
        ${kpi("Biggest Drop-Off", biggest.from ? `${biggest.from} → ${biggest.to}` : "—")}
      </div>
      <div class="admin-insights-split">
        ${renderToday(data.today)}
        ${renderInsights(data.insights)}
      </div>
      ${renderOwnerWorkflow(data)}
      <section class="admin-home-card">
        <p class="eyebrow">Activation</p>
        <h4>Are users reaching value?</h4>
        <p class="muted-copy">${esc(activation.definition || "")}</p>
        <ul class="admin-insights-summary-list">
          <li>Signups: ${esc(activation.signups ?? 0)}</li>
          <li>Activated: ${esc(activation.activatedUsers ?? 0)} (${esc(activation.activationRate ?? "—")})</li>
          <li>Median signup → activation: ${esc(activation.medianSignupToActivation ?? "—")}</li>
          <li>Activated → paid: ${esc(activation.activatedToPaidRate ?? "—")}</li>
          <li>Non-activated → paid: ${esc(activation.nonActivatedToPaidRate ?? "—")}</li>
        </ul>
      </section>
      ${renderFunnel(data.funnel)}
      <section>
        <h4>Signup Cohort Conversion</h4>
        <p class="muted-copy">${esc(cohorts.note || "Immature windows show pending and are excluded from denominators.")}</p>
        ${table(
          ["Cohort (UTC)", "Signups", "Paid 1d", "Rate 1d", "Paid 7d", "Rate 7d", "Paid 30d", "Rate 30d"],
          (cohorts.cohorts || []).map((row) => [
            row.cohort, row.signups,
            row.paidWithin1d, row.rate1d,
            row.paidWithin7d, row.rate7d,
            row.paidWithin30d, row.rate30d,
          ]),
        )}
      </section>
      <div class="admin-insights-split">
        <section>
          <h4>Campaign / Creative (First-Touch)</h4>
          <p class="muted-copy">${esc(campaign.note || "")}</p>
          ${table(
            ["Source", "Medium", "Campaign", "Content", "Signups", "Activated", "Checkout", "Paid", "Conv %"],
            (campaign.firstTouch || []).map((row) => [
              row.source, row.medium, row.campaign, row.content,
              row.signups, row.activated, row.checkoutStarts, row.paid, row.conversionRate,
            ]),
          )}
        </section>
        <section>
          <h4>Later-Touch (Separate — Not First-Touch)</h4>
          ${table(
            ["Source", "Campaign", "Content", "Touch Events", "Paid"],
            (campaign.laterTouch || []).map((row) => [
              row.source, row.campaign, row.content, row.touchEvents, row.paid,
            ]),
          )}
        </section>
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>Persona Conversion</h4>
          ${table(
            ["Persona", "Signups", "Activated", "Pricing", "Checkout", "Paid", "Conv %"],
            (data.personaSegmentation || []).map((row) => [
              row.persona, row.signups, row.activated, row.pricingViews, row.checkoutStarts, row.paid, row.conversionRate,
            ]),
          )}
        </section>
        <section>
          <h4>Age-Group Engagement → Paid</h4>
          <p class="muted-copy">${esc(ageSeg.note || "Users who engaged with content in each age group.")}</p>
          ${table(
            ["Age Group", "Engaged", "Lessons", "Printables", "Pro", "Pricing", "Checkout", "Paid", "Conv %"],
            (ageSeg.rows || []).map((row) => [
              row.ageGroup, row.engagedUsers, row.lessonEngagement, row.printableEngagement,
              row.proEncounters, row.pricingViews, row.checkoutStarts, row.paidConversions, row.conversionRate,
            ]),
          )}
        </section>
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>Offer Attribution</h4>
          ${table(
            ["Offer", "Checkout Starts", "Paid", "Conv %"],
            (data.offerAttribution || []).map((row) => [
              row.offer, row.checkoutStarts, row.paidConversions, row.conversionRate,
            ]),
          )}
        </section>
        <section>
          <h4>Upgrade CTA Performance (with CTR)</h4>
          ${table(
            ["CTA", "Impressions", "Unique Clicks", "CTR", "Checkout", "Purchases", "Conv %"],
            (data.ctaPerformance || []).map((row) => [
              row.cta, row.impressions ?? "—", row.uniqueClicks ?? row.clicks, row.ctr ?? "—",
              row.checkoutStarts, row.purchases, row.conversionRate,
            ]),
          )}
        </section>
      </div>
      <section>
        <h4>Top Lessons — Pre-purchase Association (Not Causal)</h4>
        <p class="muted-copy">${esc(lessonAssoc.associationDisclaimer || "Pre-purchase association (not causal)")}. Pricing window: 7d · Purchase window: 30d.</p>
        ${table(
          ["Lesson", "Unique Viewers", "Saves", "Printables", "Pro", "Pricing ≤7d", "Purchases ≤30d", "Conv %"],
          (lessonAssoc.topLessons || data.content?.topLessons || []).map((row) => [
            row.title,
            row.uniqueViewers ?? row.views,
            row.saves ?? "—",
            row.printableInteractions ?? "—",
            row.proEncounters ?? "—",
            row.pricingViewsWithin7d ?? "—",
            row.purchasesWithin30d ?? row.purchases,
            typeof row.conversionRate === "number" ? `${row.conversionRate}%` : row.conversionRate,
          ]),
        )}
      </section>
      <div class="admin-insights-split">
        <section>
          <h4>Lost-User Lifecycle</h4>
          <p class="muted-copy">${esc(lost.note || "")}</p>
          ${table(
            ["Segment", "Count"],
            (lost.segments || []).map((seg) => [seg.label, seg.count]),
          )}
        </section>
        <section>
          <h4>High-Intent Action Queue (Read-Only)</h4>
          ${table(
            ["User", "Categories", "Intent", "Sessions", "Pricing", "Upgrade", "Checkout"],
            (data.highIntentQueue || []).map((row) => [
              row.user,
              (row.categories || []).join("; "),
              row.intentLevel,
              row.sessions,
              row.pricingViews,
              row.upgradeClicks,
              row.checkoutStarted,
            ]),
          )}
        </section>
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>High-Intent Free Users</h4>
          ${table(
            ["User", "Signup", "Source", "Sessions", "Lessons", "Pro", "Pricing", "Upgrade", "Checkout", "Intent"],
            (data.highIntentUsers || []).map((row) => [
              row.user, row.signupDate, row.source, row.sessions, row.lessonsViewed,
              row.proEncounters, row.pricingViews, row.upgradeClicks, row.checkoutStarted, row.intentLevel,
            ]),
          )}
        </section>
        <section>
          <h4>Checkout Drop-Off</h4>
          <ul class="admin-insights-summary-list">
            <li>Clicked Upgrade: ${esc(data.checkoutDropOff?.upgradeClicked ?? 0)}</li>
            <li>No checkout started: ${esc(data.checkoutDropOff?.clickedUpgradeNoCheckout ?? 0)}</li>
            <li>Checkout started: ${esc(data.checkoutDropOff?.checkoutStarted ?? 0)}</li>
            <li>Started — no confirmed completion: ${esc(data.checkoutDropOff?.checkoutStartedNoCompletion ?? 0)}</li>
            <li>Purchase completed: ${esc(data.checkoutDropOff?.purchaseCompleted ?? 0)}</li>
          </ul>
        </section>
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>Traffic Sources</h4>
          ${table(
            ["Source", "Signups", "Paid", "Conversion %"],
            (data.trafficSources || []).map((row) => [row.source, row.signups, row.paid, `${row.conversionRate}%`]),
          )}
        </section>
        <section>
          <h4>Pro Paywall Encounters</h4>
          ${table(
            ["Feature", "Encounters", "Pricing", "Upgrade", "Purchases"],
            (data.paywall || []).map((row) => [row.featureType, row.encounters, row.pricingVisits, row.upgradeClicks, row.purchases]),
          )}
        </section>
      </div>
      <div class="admin-insights-split">
        <section>
          <h4>Retention</h4>
          <ul class="admin-insights-summary-list">
            <li>1-day return: ${esc(data.retention?.day1Rate)} (${esc(data.retention?.day1Return)}/${esc(data.retention?.signups)})</li>
            <li>3-day return: ${esc(data.retention?.day3Rate)} (${esc(data.retention?.day3Return)}/${esc(data.retention?.signups)})</li>
            <li>7-day return: ${esc(data.retention?.day7Rate)} (${esc(data.retention?.day7Return)}/${esc(data.retention?.signups)})</li>
          </ul>
        </section>
        <section>
          <h4>Time to Value (median)</h4>
          <ul class="admin-insights-summary-list">
            <li>Signup → first lesson: ${esc(data.timeToValue?.signupToFirstLesson)}</li>
            <li>Signup → Pro encounter: ${esc(data.timeToValue?.signupToProEncounter)}</li>
            <li>Signup → pricing: ${esc(data.timeToValue?.signupToPricing)}</li>
            <li>Signup → purchase: ${esc(data.timeToValue?.signupToPurchase)}</li>
          </ul>
        </section>
      </div>
      <section>
        <h4>Recent User Journeys</h4>
        ${(data.recentJourneys || []).map((j) => renderJourney(j)).join("") || `<div class="empty-state">No journeys yet.</div>`}
      </section>
    `;
  }

  function bindEvents(mount) {
    mount.querySelectorAll("[data-conv-range]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.range = btn.getAttribute("data-conv-range") || "7d";
        void reload(mount);
      });
    });
    const sourceSel = mount.querySelector("#convFilterSource");
    const ageSel = mount.querySelector("#convFilterAge");
    const convertedSel = mount.querySelector("#convFilterConverted");
    [sourceSel, ageSel, convertedSel].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => {
        state.source = sourceSel?.value || "all";
        state.ageGroup = ageSel?.value || "all";
        state.converted = convertedSel?.value || "all";
        void reload(mount);
      });
    });

    const mapQueueFilters = () => {
      state.queue.activated = mount.querySelector("#convQActivated")?.value || "all";
      state.queue.highIntent = mount.querySelector("#convQHighIntent")?.value || "all";
      state.queue.persona = mount.querySelector("#convQPersona")?.value || "all";
      state.queue.queueAgeGroup = mount.querySelector("#convQAge")?.value || "all";
      state.queue.leadStatus = mount.querySelector("#convQStatus")?.value || "all";
      state.queue.reason = mount.querySelector("#convQReason")?.value || "all";
      state.queue.queueConverted = mount.querySelector("#convQConverted")?.value || "all";
    };
    ["#convQActivated", "#convQHighIntent", "#convQPersona", "#convQAge", "#convQStatus", "#convQReason", "#convQConverted"].forEach((sel) => {
      const el = mount.querySelector(sel);
      if (!el) return;
      el.addEventListener("change", () => {
        mapQueueFilters();
        state.scrollRestore = { type: "anchor", value: "convOwnerActionQueue" };
        void reload(mount);
      });
    });

    mount.querySelectorAll("[data-lead-detail]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.detailEmail = btn.getAttribute("data-lead-detail") || "";
        state.scrollRestore = { type: "anchor", value: "convLeadDetail" };
        void reload(mount);
      });
    });
    mount.querySelector("[data-conv-clear-detail]")?.addEventListener("click", () => {
      const email = state.detailEmail;
      state.detailEmail = "";
      state.scrollRestore = email
        ? { type: "anchor", value: queueScrollAnchorForEmail(email) }
        : { type: "anchor", value: "convOwnerActionQueue" };
      void reload(mount);
    });

    mount.querySelectorAll("[data-lead-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-lead-save") || "";
        const status = mount.querySelector(`select[data-lead-status="${CSS.escape(email)}"]`)?.value || "";
        const reason = mount.querySelector(`select[data-lead-reason="${CSS.escape(email)}"]`)?.value || "";
        try {
          const payload = { email };
          if (status) payload.status = status;
          if (reason) payload.reason = reason;
          state.scrollRestore = { type: "anchor", value: queueScrollAnchorForEmail(email) };
          await postLeadUpdate(payload);
          void reload(mount);
        } catch (error) {
          window.alert(error.message || "Could not save lead.");
        }
      });
    });

    mount.querySelectorAll("[data-lead-note]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-lead-note") || "";
        const note = window.prompt("Internal owner note (not shown to customer):", "");
        if (note == null || !String(note).trim()) return;
        try {
          state.scrollRestore = { type: "anchor", value: queueScrollAnchorForEmail(email) };
          await postLeadUpdate({ email, note });
          void reload(mount);
        } catch (error) {
          window.alert(error.message || "Could not save note.");
        }
      });
    });
  }

  async function reload(mount) {
    state.loading = true;
    mount.innerHTML = `<p class="muted-copy">Loading Conversion Intelligence…</p>`;
    try {
      const data = await fetchData();
      state.cache = data;
      mount.innerHTML = `
        <div class="admin-insights-toolbar">
          <div>${rangeToolbar(state.range)}</div>
          <div class="admin-insights-filters">
            <label>Source <select id="convFilterSource"><option value="all">All</option>${(data.trafficSources || []).map((s) => `<option value="${esc(s.source)}"${state.source === s.source ? " selected" : ""}>${esc(s.source)}</option>`).join("")}</select></label>
            <label>Age <select id="convFilterAge"><option value="all">All</option><option value="Infant">Infant</option><option value="Toddler">Toddler</option><option value="Preschool">Preschool</option></select></label>
            <label>Converted <select id="convFilterConverted"><option value="all">All</option><option value="converted">Converted</option><option value="not_converted">Not converted</option></select></label>
          </div>
        </div>
        <div class="admin-insights-body">${renderBody(data)}</div>
      `;
      bindEvents(mount);
      applyScrollRestore();
    } catch (error) {
      mount.innerHTML = `<div class="empty-state" role="alert">${esc(error.message || "Could not load Conversion Intelligence.")}</div>`;
    } finally {
      state.loading = false;
    }
  }

  async function renderAdminConversionIntelligence(mount) {
    if (!mount) return;
    if (!state.cache) {
      await reload(mount);
      return;
    }
    await reload(mount);
  }

  root.renderAdminConversionIntelligence = renderAdminConversionIntelligence;
})(typeof window !== "undefined" ? window : globalThis);
