/**
 * Phase 17 — Director Center Billing Simulator tab.
 * Platform plan catalog/entitlement simulator + provider family tuition overview.
 * Testing only — no Stripe / real payments.
 */
(function initBillingSimulatorUI(global) {
  const PLATFORM_BANNER = "Testing Account — Fake Data Only. Platform subscription simulator (no Stripe).";
  const FAMILY_BANNER = "Testing Only — No Real Payment Will Be Processed.";
  const BASE = "/api/director-center/billing";
  const state = {
    panel: "platform",
    catalog: null,
    overview: null,
    preview: null,
    loading: false,
    error: "",
    notice: "",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function adminHeaders() {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    const token = global.localStorage?.getItem("llhAdminToken") || global.sessionStorage?.getItem("llhAdminToken") || "";
    if (token) headers.Authorization = `Bearer ${token}`;
    const preview = global.sessionStorage?.getItem("llhRolePreviewMembershipId") || "";
    if (preview) headers["x-llh-role-preview-membership-id"] = preview;
    return headers;
  }

  async function api(method, path, body) {
    const response = await fetch(path, {
      method,
      headers: adminHeaders(),
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
    return data;
  }

  function panelNav() {
    return `
      <div class="bs-subnav">
        <button type="button" class="ghost-button${state.panel === "platform" ? " active" : ""}" data-bs-panel="platform">Platform plans</button>
        <button type="button" class="ghost-button${state.panel === "family" ? " active" : ""}" data-bs-panel="family">Family tuition</button>
      </div>
    `;
  }

  function platformHtml() {
    const data = state.catalog;
    if (!data) return `<p class="muted-copy">Loading plan catalog…</p>`;
    const plans = data.catalog?.plans || [];
    const addOn = data.catalog?.classroomAddOn || {};
    const sub = data.currentSubscription || {};
    const usage = data.usage || {};
    return `
      <section class="bs-section" data-feature-marker="phase17-platform-pricing" data-bs-platform>
        <p class="bs-banner">${escapeHtml(data.testingBanner || PLATFORM_BANNER)}</p>
        <p class="bs-computer-recommended" data-bs-computer-recommended>Computer Recommended for plan comparison, entitlement simulation, and downgrade safety preview.</p>
        <div class="fu-toolbar">
          <h3>Plan comparison (testing catalog)</h3>
          <button type="button" class="ghost-button" data-bs-seed>Reset fixtures</button>
        </div>
        <p class="muted-copy">Current simulated usage: ${escapeHtml(String(usage.classrooms ?? 0))} classrooms · ${escapeHtml(String(usage.staff ?? 0))} staff (excl. owner). Recommended: ${escapeHtml(data.recommendedPlan || "")}.</p>
        <p class="muted-copy">Active plan: <strong>${escapeHtml(sub.planKey || "—")}</strong> · ${escapeHtml(sub.billingInterval || "")} · add-ons: ${escapeHtml(String(sub.classroomAddOnQuantity || 0))} · founding: ${escapeHtml(sub.foundingStatus || "none")}</p>
        <div class="bs-plan-grid">
          ${plans.map((plan) => `
            <article class="bs-plan-card" data-bs-plan="${escapeHtml(plan.key)}">
              <h4>${escapeHtml(plan.label)}</h4>
              <p><strong>${escapeHtml(plan.monthlyDisplay || "—")}</strong>/mo · <strong>${escapeHtml(plan.annualDisplay || "n/a")}</strong>/yr</p>
              ${plan.annualSavingsCents ? `<p class="muted-copy">Est. annual savings ${escapeHtml(String((plan.annualSavingsCents / 100).toFixed(2)))}</p>` : ""}
              <p class="muted-copy">Classrooms: ${escapeHtml(String(plan.classroomLimit ?? "—"))} · Staff: ${escapeHtml(String(plan.staffAccountLimit ?? "—"))}</p>
              ${(plan.excludes || []).length ? `<p class="muted-copy">Excludes: ${escapeHtml((plan.excludes || []).join(", "))}</p>` : ""}
              <div class="bs-actions-row">
                <button type="button" class="ghost-button" data-bs-simulate="select_plan" data-plan="${escapeHtml(plan.key)}">Select (sim)</button>
                <button type="button" class="ghost-button" data-bs-simulate="upgrade" data-plan="${escapeHtml(plan.key)}">Upgrade preview</button>
                <button type="button" class="ghost-button" data-bs-downgrade="${escapeHtml(plan.key)}">Downgrade preview</button>
              </div>
            </article>
          `).join("")}
        </div>
        <section class="bs-addon">
          <h4>Classroom add-on</h4>
          <p>${escapeHtml(addOn.label || "Classroom add-on")} — ${(addOn.monthlyPriceCents / 100).toFixed(2)}/mo · +${escapeHtml(String(addOn.classroomsGranted || 1))} classroom · +${escapeHtml(String(addOn.staffAccountsGranted || 2))} staff</p>
          <button type="button" class="ghost-button" data-bs-simulate="add_classroom">Add classroom (sim)</button>
          <button type="button" class="ghost-button" data-bs-simulate="remove_addon">Remove add-on (sim)</button>
        </section>
        <section class="bs-founding">
          <h4>Founding protection</h4>
          <ul>${(data.catalog?.foundingNotes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
          <button type="button" class="ghost-button" data-bs-simulate="founding_active">Simulate founding active</button>
          <button type="button" class="ghost-button" data-bs-simulate="former_founding">Simulate former founding</button>
        </section>
        <section class="bs-sim-actions">
          <h4>Entitlement simulator</h4>
          <div class="bs-actions-row">
            ${["trial", "payment_failure", "past_due", "grace_period", "cancel_at_period_end", "reactivate", "access_ended"].map((action) => `
              <button type="button" class="ghost-button" data-bs-simulate="${escapeHtml(action)}">${escapeHtml(action.replace(/_/g, " "))}</button>
            `).join("")}
          </div>
        </section>
        ${state.preview ? `
          <section class="bs-downgrade-preview" data-bs-downgrade-preview>
            <h4>Downgrade safety preview</h4>
            <p class="muted-copy">Never silently deletes classrooms, staff, children, records, forms, or history.</p>
            <pre class="bs-pre">${escapeHtml(JSON.stringify(state.preview, null, 2))}</pre>
          </section>
        ` : ""}
        <p class="muted-copy">No manipulative countdowns. Stripe untouched. Production catalog unchanged.</p>
      </section>
    `;
  }

  function familyHtml() {
    const data = state.overview;
    if (!data) return `<p class="muted-copy">Loading family billing…</p>`;
    const o = data.overview || {};
    return `
      <section class="bs-section" data-feature-marker="phase17-family-billing" data-bs-family>
        <p class="bs-banner">${escapeHtml(data.testingBanner || FAMILY_BANNER)}</p>
        <p class="bs-computer-recommended" data-bs-computer-recommended>Computer Recommended for aging reports, recurring plans, and provider billing administration.</p>
        <div class="fu-toolbar">
          <h3>Provider family billing overview</h3>
          <button type="button" class="ghost-button" data-bs-seed>Reset fixtures</button>
          <button type="button" class="ghost-button" data-bs-gen-cycle>Generate cycle (idempotent)</button>
        </div>
        <div class="bs-status-row">
          ${[
            ["Outstanding", o.outstandingBalanceCents != null ? `$${(o.outstandingBalanceCents / 100).toFixed(2)}` : "—"],
            ["Open", o.openInvoices],
            ["Past due", o.pastDue],
            ["Failed sims", o.failedSimulations],
            ["Profiles", o.profiles],
            ["Recurring", o.recurringPlans],
            ["Suggestions", o.pendingSuggestions],
          ].map(([label, value]) => `
            <article class="dc-metric-card bs-metric">
              <p class="dc-metric-label">${escapeHtml(label)}</p>
              <p class="dc-metric-value">${escapeHtml(String(value ?? 0))}</p>
            </article>
          `).join("")}
        </div>
        <h4>Invoices</h4>
        <ul class="fh-card-list">
          ${(data.invoices || []).map((inv) => `
            <li class="fh-card static" data-bs-invoice="${escapeHtml(inv.id)}">
              <strong>${escapeHtml(inv.status)}</strong>
              <span>${escapeHtml(inv.balanceDisplay || "")} due ${escapeHtml(inv.dueDate || "")}</span>
              <span class="muted-copy">${escapeHtml((inv.lineItems || []).map((l) => l.chargeType).join(", "))}</span>
              <div class="bs-actions-row">
                <button type="button" class="ghost-button" data-bs-pay="partial" data-invoice="${escapeHtml(inv.id)}">Partial (sim)</button>
                <button type="button" class="ghost-button" data-bs-pay="full" data-invoice="${escapeHtml(inv.id)}">Full (sim)</button>
                <button type="button" class="ghost-button" data-bs-pay="failed" data-invoice="${escapeHtml(inv.id)}">Fail (sim)</button>
              </div>
            </li>
          `).join("") || "<li class=\"muted-copy\">No invoices.</li>"}
        </ul>
        <p class="muted-copy">Teachers/assistants denied by default. Integer cents only. Append-only ledger. No Stripe.</p>
      </section>
    `;
  }

  function bodyHtml() {
    if (state.panel === "family") return familyHtml();
    return platformHtml();
  }

  function render(mount) {
    if (!mount) return;
    mount.innerHTML = `
      <section class="bs-panel">
        <p class="eyebrow">Billing Simulator</p>
        <h2>Platform pricing &amp; family tuition (testing)</h2>
        ${state.error ? `<p class="dc-error">${escapeHtml(state.error)}</p>` : ""}
        ${state.notice ? `<p class="muted-copy">${escapeHtml(state.notice)}</p>` : ""}
        ${panelNav()}
        ${state.loading ? `<p class="muted-copy">Loading…</p>` : bodyHtml()}
      </section>
    `;
    bind(mount);
  }

  function bind(mount) {
    mount.querySelectorAll("[data-bs-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.panel = btn.getAttribute("data-bs-panel");
        refresh(mount);
      });
    });
    mount.querySelector("[data-bs-seed]")?.addEventListener("click", async () => {
      try {
        await api("POST", `${BASE}/seed`, { reset: true });
        state.notice = "Fixtures reset.";
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelectorAll("[data-bs-simulate]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const action = btn.getAttribute("data-bs-simulate");
          const planKey = btn.getAttribute("data-plan") || undefined;
          await api("POST", `${BASE}/platform/simulate`, { action, planKey });
          state.notice = `Simulated: ${action}`;
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelectorAll("[data-bs-downgrade]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const planKey = btn.getAttribute("data-bs-downgrade");
          const data = await api("POST", `${BASE}/platform/simulate`, { action: "downgrade_preview", planKey });
          state.preview = data.preview;
          state.notice = "Downgrade preview ready — nothing deleted.";
          render(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
    mount.querySelector("[data-bs-gen-cycle]")?.addEventListener("click", async () => {
      try {
        const overview = state.overview;
        const recurringId = (overview?.invoices || []).find((i) => i.recurringPlanId)?.recurringPlanId
          || Object.values({})[0];
        // Prefer seed path: re-fetch catalog status then call with first recurring from server seed via overview regenerate
        const statusSeed = await api("POST", `${BASE}/seed`, {});
        const planId = statusSeed.ids?.recurringPlanId;
        if (!planId) throw new Error("No recurring plan in fixtures.");
        const result = await api("POST", `${BASE}/family/generate-cycle`, { recurringPlanId: planId });
        state.notice = result.duplicatePrevented ? "Cycle already exists (idempotent)." : "Cycle generated.";
        await refresh(mount);
      } catch (error) {
        state.error = error.message;
        render(mount);
      }
    });
    mount.querySelectorAll("[data-bs-pay]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const action = btn.getAttribute("data-bs-pay");
          const invoiceId = btn.getAttribute("data-invoice");
          await api("POST", `${BASE}/family/payment-sim`, {
            action,
            invoiceId,
            amountCents: action === "partial" ? 5000 : undefined,
            idempotencyKey: `${action}-${invoiceId}-${Date.now()}`,
          });
          state.notice = `Payment simulation: ${action}`;
          await refresh(mount);
        } catch (error) {
          state.error = error.message;
          render(mount);
        }
      });
    });
  }

  async function refresh(mount) {
    state.loading = true;
    state.error = "";
    render(mount);
    try {
      if (state.panel === "family") {
        state.overview = await api("GET", `${BASE}/family/overview`);
      } else {
        state.catalog = await api("GET", `${BASE}/catalog`);
      }
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      render(mount);
    }
  }

  async function renderBillingSimulatorTab(mountEl) {
    const mount = mountEl || document.querySelector("#dc-billing-simulator-mount");
    if (!mount) return;
    state.panel = "platform";
    state.preview = null;
    await refresh(mount);
  }

  global.renderBillingSimulatorTab = renderBillingSimulatorTab;
})(typeof window !== "undefined" ? window : globalThis);
