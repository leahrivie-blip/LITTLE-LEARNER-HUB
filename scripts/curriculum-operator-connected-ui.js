/**
 * Owner Admin — Connected existing-lesson AI upgrade (plan → run → auto-apply).
 */
(function initCurriculumOperatorConnectedUi(global) {
  "use strict";

  const state = {
    open: false,
    busy: false,
    running: false,
    lessonId: "",
    title: "",
    ownerPlan: null,
    message: "",
    isError: false,
    result: null,
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function adminToken() {
    return (typeof adminSession === "function" ? adminSession()?.token : "") || "";
  }

  function isOwner() {
    try {
      if (typeof isTeachingKitPrintableOwnerClient === "function") {
        return isTeachingKitPrintableOwnerClient();
      }
      const session = typeof adminSession === "function" ? adminSession() : null;
      const email = String(session?.email || "").trim().toLowerCase();
      return email === "leahivie@icloud.com";
    } catch {
      return false;
    }
  }

  function operatorFlagOn() {
    try {
      const flags = (typeof effectiveSiteContent === "function"
        ? effectiveSiteContent()?.featureFlags
        : null) || {};
      if (typeof LLHTeachingKit !== "undefined"
        && typeof LLHTeachingKit.isTeachingKitCurriculumOperatorEnabled === "function") {
        return LLHTeachingKit.isTeachingKitCurriculumOperatorEnabled(flags) === true;
      }
      return flags.teachingKitCurriculumOperator === true;
    } catch {
      return false;
    }
  }

  async function operatorApi(action, extra = {}) {
    const token = adminToken();
    if (!token) throw new Error("Admin session required.");
    const response = await fetch("/api/admin/curriculum/operator", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(json.error || `Operator failed (${response.status})`);
      error.payload = json;
      throw error;
    }
    return json;
  }

  function decisionTag(decision) {
    const d = String(decision || "").toUpperCase();
    return `<span class="co-decision co-decision-${esc(d.toLowerCase())}">${esc(d)}</span>`;
  }

  function renderPlanList(label, rows, mapRow) {
    if (!rows?.length) return "";
    return `<section class="co-connected-block">
      <h4>${esc(label)}</h4>
      <ul class="co-field-list">${rows.map(mapRow).join("")}</ul>
    </section>`;
  }

  function renderModal() {
    let host = document.getElementById("coConnectedUpgradeHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "coConnectedUpgradeHost";
      document.body.appendChild(host);
    }
    if (!state.open) {
      host.innerHTML = "";
      host.hidden = true;
      return;
    }
    const plan = state.ownerPlan || {};
    const cover = plan.coverPlan || {};
    const structural = plan.structuralReview || {};
    const structuralFlags = (structural.flags || []).slice(0, 12);
    host.hidden = false;
    host.innerHTML = `
      <div class="co-connected-modal" role="dialog" aria-modal="true" aria-labelledby="co-connected-title">
        <button type="button" class="co-connected-backdrop" data-co-connected-close aria-label="Close"></button>
        <div class="co-connected-panel">
          <header class="co-connected-header">
            <h3 id="co-connected-title">AI Upgrade Lesson</h3>
            <p class="muted-copy"><strong>${esc(state.title || plan.title || "Lesson")}</strong></p>
            <p class="muted-copy">Age: ${esc(plan.age || "—")} · ${esc(plan.accessPlan || "Free")} · Lesson ID ${esc(state.lessonId)}</p>
            ${plan.readiness?.currentStatus ? `<p class="muted-copy">Audit: ${esc(plan.readiness.currentStatus)}</p>` : ""}
          </header>
          ${state.busy ? `<p class="muted-copy" role="status">${state.running ? "Running upgrade… text, songs/books, images, printables, then auto-apply. This may take several minutes." : "Loading upgrade plan…"}</p>` : ""}
          ${state.message ? `<p class="form-message ${state.isError ? "is-error" : "is-success"}" role="status">${esc(state.message)}</p>` : ""}
          ${state.ownerPlan ? `
            <p class="muted-copy">Review the plan below. <strong>No writes occur until Run Upgrade.</strong> Successful runs auto-apply enrichment into this same lesson. <strong>Publish Lesson</strong> remains manual.</p>
            ${structuralFlags.length ? `<section class="co-connected-block co-connected-warning">
              <h4>Owner review recommended</h4>
              <ul class="co-field-list">${structuralFlags.map((f) => `
                <li><span class="muted-copy">${esc(f.code || "review")}</span> ${esc(f.message || "")}</li>
              `).join("")}</ul>
            </section>` : ""}
            ${(plan.blockers || []).length ? renderPlanList("Blockers", plan.blockers.slice(0, 8), (row) => `
              <li><span class="muted-copy">${esc(row.source || "blocker")}</span> ${esc(row.message || "")}</li>
            `) : ""}
            <section class="co-connected-block">
              <h4>Cover</h4>
              <p>${decisionTag(cover.decision)} ${esc(cover.reason || "")}</p>
              ${cover.proposedCoverImageUrl ? `<p class="muted-copy">Proposed from activity: ${esc(cover.sourceActivityTitle || cover.sourceActivityId || "")}</p>` : ""}
            </section>
            ${renderPlanList("Activities already strong (KEEP)", (plan.activitiesStrong || []).slice(0, 12), (row) => `
              <li>${decisionTag("KEEP")} <strong>${esc(row.title || row.activityId || "")}</strong></li>
            `)}
            ${renderPlanList("Activities needing enrichment", (plan.activitiesNeedingWork || []).slice(0, 16), (row) => `
              <li>${decisionTag(row.decision)} <strong>${esc(row.title || row.activityId || "")}</strong>
                <span class="muted-copy">${esc(row.reason || "")}</span></li>
            `)}
            ${renderPlanList("Missing / thin weekly fields", (plan.missingWeeklyFields || []).slice(0, 12), (row) => `
              <li>${decisionTag(row.decision)} <strong>${esc(row.label || row.field || "")}</strong>
                <span class="muted-copy">${esc(row.reason || "")}</span></li>
            `)}
            ${renderPlanList("Image actions", (plan.imageActions || []).slice(0, 20), (row) => `
              <li>${decisionTag(row.decision)} <strong>${esc(row.activityTitle || row.activityId || "")}</strong>
                <span class="muted-copy">${esc(row.reason || "")}</span></li>
            `)}
            ${renderPlanList("Printable actions", (plan.printableActions || []).slice(0, 20), (row) => `
              <li>${decisionTag(row.decision)} <strong>${esc(row.activityTitle || row.activityId || "")}</strong>
                <span class="muted-copy">${esc(row.reason || "")}</span></li>
            `)}
            ${renderPlanList("Songs", (plan.songActions || []).filter((r) => r.decision && r.decision !== "KEEP").slice(0, 8), (row) => `
              <li>${decisionTag(row.decision)} <strong>${esc(row.weekday || row.field || "")}</strong>
                <span class="muted-copy">${esc(row.reason || "")}</span></li>
            `)}
            ${renderPlanList("Books", (plan.bookActions || []).filter((r) => r.decision && r.decision !== "KEEP"), (row) => `
              <li>${decisionTag(row.decision)} <strong>${esc(row.field || "books")}</strong>
                <span class="muted-copy">${esc(row.reason || "")}</span></li>
            `)}
            ${(plan.completenessSections || []).length ? renderPlanList("Thin / missing sections", plan.completenessSections.slice(0, 10), (row) => `
              <li><strong>${esc(row.label || row.id || "")}</strong> <span class="muted-copy">${esc(row.status || "")} — ${esc(row.detail || "")}</span></li>
            `) : ""}
            <pre class="co-log co-connected-summary">${esc(plan.ownerSummary || "")}</pre>
          ` : ""}
          ${state.result?.autoApply ? `
            <section class="co-connected-block">
              <h4>Auto-apply</h4>
              ${state.result.autoApply.applied?.length
                ? `<p class="form-message is-success">Enrichment applied to this lesson. Open the lesson to review, then Publish Lesson when ready. Customers are not published automatically.</p>`
                : `<p class="muted-copy">Auto-apply skipped: ${esc((state.result.autoApply.skipped || []).map((s) => s.code || s.message).join("; ") || "not eligible")}</p>`}
            </section>
          ` : ""}
          <footer class="co-connected-actions">
            <button type="button" class="ghost-button" data-co-connected-close ${state.busy ? "disabled" : ""}>Cancel</button>
            ${state.result?.autoApply?.applied?.length
              ? `<button type="button" class="primary-button" data-co-connected-open-lesson>Open lesson</button>`
              : `<button type="button" class="primary-button" data-co-connected-run ${state.busy || !state.ownerPlan ? "disabled" : ""}>Run Upgrade</button>`}
          </footer>
        </div>
      </div>
    `;
    host.querySelectorAll("[data-co-connected-close]").forEach((btn) => {
      btn.addEventListener("click", () => close());
    });
    host.querySelector("[data-co-connected-run]")?.addEventListener("click", () => void onRun());
    host.querySelector("[data-co-connected-open-lesson]")?.addEventListener("click", () => {
      close();
      if (typeof openOwnerTeachingKitEditor === "function") {
        openOwnerTeachingKitEditor(state.lessonId, { source: "upgrade" });
      }
    });
  }

  async function open(lessonId, title = "") {
    if (!isOwner() || !operatorFlagOn()) {
      if (typeof showActionFeedback === "function") {
        showActionFeedback("AI Upgrade Lesson requires the owner account and Curriculum Operator flag.", null, { allowDuringOverlay: true });
      }
      return;
    }
    state.open = true;
    state.busy = true;
    state.running = false;
    state.lessonId = String(lessonId || "").trim();
    state.title = String(title || "").trim();
    state.ownerPlan = null;
    state.message = "Loading upgrade plan…";
    state.isError = false;
    state.result = null;
    renderModal();
    try {
      const data = await operatorApi("connected_plan", { lessonId: state.lessonId });
      state.ownerPlan = data.ownerPlan || null;
      state.title = data.title || state.title;
      state.message = "Upgrade plan ready. Review, then Run Upgrade.";
      state.isError = false;
    } catch (error) {
      state.message = error.message || "Could not load upgrade plan.";
      state.isError = true;
    } finally {
      state.busy = false;
      renderModal();
    }
  }

  async function onRun() {
    if (state.busy || state.running || !state.lessonId) return;
    state.busy = true;
    state.running = true;
    state.message = "Running full kit upgrade (text, songs/books, images, printables)…";
    state.isError = false;
    renderModal();
    try {
      const data = await operatorApi("connected_run", {
        lessonId: state.lessonId,
        planAcknowledged: true,
      });
      state.result = data;
      const applied = data.autoApply?.applied?.length || 0;
      const skipped = data.autoApply?.skipped?.length || 0;
      state.message = applied
        ? "Upgrade complete. Enrichment applied to this lesson. Review, then Publish Lesson when ready."
        : `Upgrade finished but auto-apply skipped (${skipped} reason(s)). Open Enrichment Editor to apply manually if needed.`;
      state.isError = !applied && skipped > 0;
      if (typeof renderAdminCurriculumLessonPlanManager === "function") {
        renderAdminCurriculumLessonPlanManager();
      }
    } catch (error) {
      state.message = error.message || "Upgrade run failed.";
      state.isError = true;
    } finally {
      state.busy = false;
      state.running = false;
      renderModal();
    }
  }

  function close() {
    state.open = false;
    state.busy = false;
    state.running = false;
    state.message = "";
    state.isError = false;
    renderModal();
  }

  function bind() {
    if (global.__coConnectedUpgradeBound) return;
    global.__coConnectedUpgradeBound = true;
    document.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("[data-curriculum-lesson-ai-upgrade]");
      if (!btn) return;
      event.preventDefault();
      const lessonId = btn.getAttribute("data-curriculum-lesson-ai-upgrade") || "";
      const title = btn.getAttribute("data-lesson-title") || "";
      void open(lessonId, title);
    });
  }

  bind();

  global.LLHCurriculumOperatorConnectedUi = {
    open,
    close,
    bind,
    getState: () => ({ ...state }),
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
