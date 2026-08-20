/**
 * Owner Admin — AI Curriculum Operator UI (Phase 1).
 * Command → plan → audit jobs. Never mutates curriculum from the client.
 */
(function initCurriculumOperatorUi(global) {
  "use strict";

  const state = {
    mounted: false,
    busy: false,
    command: "",
    message: "",
    isError: false,
    planSummary: null,
    commandParsed: null,
    job: null,
    jobs: [],
    flagEnabled: false,
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function host() {
    return document.getElementById("adminCurriculumOperatorApp");
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

  function flagOn() {
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

  async function api(action, extra = {}) {
    const token = adminToken();
    if (!token) throw new Error("Admin session required.");
    if (!isOwner()) throw new Error("AI Curriculum Operator is restricted to the owner account.");
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

  function decisionClass(decision) {
    const d = String(decision || "").toUpperCase();
    if (d === "KEEP" || d === "KEEP_EXISTING") return "keep";
    if (d === "FILL" || d === "MISSING" || d === "NOT_NEEDED") return "fill";
    if (d === "IMPROVE") return "improve";
    if (d === "REPLACE" || d === "WRONG" || d === "REMOVE" || d === "GENERATE" || d === "CREATE") return "replace";
    return "other";
  }

  function renderFieldList(fields) {
    if (!fields?.length) return "<p class=\"muted-copy\">None</p>";
    return `<ul class="co-field-list">${fields.map((f) => `
      <li data-decision="${esc(decisionClass(f.decision))}">
        <strong>${esc(f.label || f.field)}</strong>: ${esc(f.decision)}
        <span class="muted-copy"> — ${esc(f.reason || "")}</span>
      </li>`).join("")}</ul>`;
  }

  function renderAuditCard(lr) {
    const a = lr.auditAfter || lr.audit;
    const before = lr.beforeScores || lr.audit?.scores || {};
    const after = lr.afterScores || a?.scores || {};
    if (!a && !lr.audit) {
      return `<article class="co-lesson-card"><h4>${esc(lr.title || lr.lessonId)}</h4>
        <p class="muted-copy">${esc(lr.status)}${lr.error ? `: ${esc(lr.error)}` : ""}</p></article>`;
    }
    const scope = (lr.audit || a)?.estimatedJobScope || {};
    const imgs = (lr.audit || a)?.images || {};
    const prints = (lr.audit || a)?.printables?.counts || {};
    const review = lr.ownerReviewStatus || "AUDIT_ONLY";
    const changed = Array.isArray(lr.updated) ? lr.updated : [];
    const kept = Array.isArray(lr.kept) ? lr.kept : [];
    return `<article class="co-lesson-card">
      <header class="co-lesson-card-head">
        <div>
          <h4>${esc((lr.audit || a)?.title || lr.title)}</h4>
          <p class="muted-copy">${esc((lr.audit || a)?.age || "")} · ${esc((lr.audit || a)?.accessPlan || "")}</p>
          <p class="muted-copy">Readiness ${esc(before.premiumReadinessPercent ?? "—")}% → ${esc(after.premiumReadinessPercent ?? "—")}%</p>
        </div>
        <span class="co-status-pill">${esc(review)}</span>
      </header>
      ${changed.length ? `
      <section>
        <h5>Changed (${changed.length})</h5>
        <ul>${changed.slice(0, 16).map((c) => `<li><code>${esc(c.path || c)}</code>${c.activityTitle ? ` — ${esc(c.activityTitle)}` : ""}</li>`).join("")}</ul>
      </section>` : ""}
      ${kept.length ? `
      <section>
        <h5>Kept</h5>
        <p class="muted-copy">${esc(kept.slice(0, 12).join(", "))}${kept.length > 12 ? "…" : ""}</p>
      </section>` : ""}
      <div class="co-grid">
        <section>
          <h5>Weekly content</h5>
          ${renderFieldList((lr.auditAfter || lr.audit)?.weeklyContent)}
        </section>
        <section>
          <h5>Activities</h5>
          <p>${esc((lr.auditAfter || lr.audit)?.activities?.strong || 0)} strong · ${esc((lr.auditAfter || lr.audit)?.activities?.incomplete || 0)} incomplete · ${esc((lr.auditAfter || lr.audit)?.activities?.weakGeneric || 0)} weak/generic</p>
        </section>
        <section>
          <h5>Activity images</h5>
          ${lr.imageCounts ? `
            <p>KEEP — ${esc(lr.imageCounts.KEEP || 0)} · GENERATED — ${esc(lr.imageCounts.GENERATE || 0)} · REPLACED — ${esc(lr.imageCounts.REPLACE || 0)} · NOT NEEDED — ${esc(lr.imageCounts.NOT_NEEDED || 0)} · FAILED — ${esc(lr.imageCounts.FAILED || 0)}</p>
          ` : `<p class="muted-copy">Images unchanged in Phase 4 printable jobs.</p>`}
        </section>
        <section>
          <h5>Printables</h5>
          ${lr.printableCounts ? `
            <p>KEEP — ${esc(lr.printableCounts.KEEP || 0)} · CREATE — ${esc(lr.printableCounts.CREATE || 0)} · REPLACE — ${esc(lr.printableCounts.REPLACE || 0)} · NOT NEEDED — ${esc(lr.printableCounts.NOT_NEEDED || 0)} · FAILED — ${esc(lr.printableCounts.FAILED || 0)}</p>
            <ul>${(Array.isArray(lr.printableActions) ? lr.printableActions : []).slice(0, 16).map((pr) => `
              <li><strong>${esc(pr.activityTitle || pr.activityId)}</strong>
                — ${esc(pr.decision)}
                ${pr.spec?.title || pr.title ? ` · ${esc(pr.spec?.title || pr.title)}` : ""}
                ${pr.pageCount ? ` · ${esc(pr.pageCount)} pages` : ""}
                <span class="muted-copy"> — ${esc(pr.reason || pr.error || "")}</span>
                ${pr.previewVerified ? " · preview ✓" : ""}
                ${pr.downloadVerified ? " · download ✓" : ""}
              </li>`).join("")}</ul>
          ` : `<p class="muted-copy">Planning: KEEP ${esc(prints.KEEP_EXISTING || prints.KEEP || 0)} · CREATE ${esc(prints.CREATE || 0)} · REPLACE ${esc(prints.REPLACE || 0)}.</p>`}
        </section>
      </div>
      <section>
        <h5>Teaching Kit blockers</h5>
        ${((lr.auditAfter || lr.audit)?.teachingKitBlockers || []).length
          ? `<ul>${(lr.auditAfter || lr.audit).teachingKitBlockers.slice(0, 8).map((b) => `<li>${esc(b.message)}</li>`).join("")}</ul>`
          : "<p class=\"muted-copy\">None listed</p>"}
      </section>
      <p class="muted-copy"><strong>Publish: NOT PUBLISHED.</strong>
        ${lr.upgradeVerification?.ok === false ? " Post-save verification reported issues." : ""}
        ${lr.preSnapshotHistoryId ? ` Recovery snapshot: ${esc(lr.preSnapshotHistoryId)}` : ""}</p>
      <div class="account-actions-row">
        <button type="button" class="ghost-button" data-co-open-lesson="${esc((lr.audit || a)?.lessonId || lr.lessonId)}">Open in Enrichment Editor</button>
      </div>
    </article>`;
  }

  function render() {
    const el = host();
    if (!el) return;
    state.flagEnabled = flagOn();

    if (!isOwner()) {
      el.innerHTML = `<div class="access-notice"><strong>Owner only</strong>
        <p class="muted-copy">AI Curriculum Operator is restricted to the owner admin account.</p></div>`;
      return;
    }
    if (!state.flagEnabled) {
      el.innerHTML = `<div class="access-notice"><strong>Operator disabled</strong>
        <p class="muted-copy">Enable <code>teachingKitCurriculumOperator</code> in Admin Workspace feature flags to use this tool. Default remains off.</p></div>`;
      return;
    }

    const plan = state.planSummary;
    const job = state.job;
    el.innerHTML = `
      <div class="co-operator">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Content · Owner</p>
            <h3>AI Curriculum Operator</h3>
            <p class="muted-copy">Phase 4: interpret commands, audit, and create/replace only useful <strong>activity-driven printables</strong> as draft resources. <strong>No publishing. No new lessons. No activity image regeneration.</strong></p>
          </div>
        </div>
        ${state.message ? `<p class="access-notice ${state.isError ? "error" : ""}" role="status">${esc(state.message)}</p>` : ""}
        <label class="co-command-label">
          <span>Command</span>
          <textarea id="coCommandInput" rows="3" placeholder="Example: Upgrade the 5 weakest Toddler Pro lessons.">${esc(state.command)}</textarea>
        </label>
        <div class="account-actions-row">
          <button type="button" class="ghost-button" id="coParseBtn" ${state.busy ? "disabled" : ""}>Interpret</button>
          <button type="button" class="primary-button" id="coRunBtn" ${state.busy ? "disabled" : ""}>Run job</button>
          <button type="button" class="ghost-button" id="coRefreshJobsBtn" ${state.busy ? "disabled" : ""}>Refresh jobs</button>
        </div>
        ${state.commandParsed ? `
          <section class="co-panel">
            <h4>Interpreted command</h4>
            <pre class="co-json">${esc(JSON.stringify(state.commandParsed.command, null, 2))}</pre>
            ${(state.commandParsed.command?.parsedNotes || []).map((n) => `<p class="muted-copy">${esc(n)}</p>`).join("")}
          </section>` : ""}
        ${plan ? `
          <section class="co-panel">
            <h4>Execution plan</h4>
            <p>${esc(plan.selectionNote || "")}</p>
            <p class="muted-copy">${esc(plan.lessons?.length || 0)} lesson(s) · candidates considered ${esc(plan.candidatesConsidered || 0)}</p>
            <ol>${(plan.lessons || []).map((l, i) => `
              <li><strong>${esc(l.title)}</strong> — readiness ${esc(l.readinessPercent)}% · ${esc(l.plan)} · ${esc(l.ageBand)}</li>`).join("")}</ol>
            <p class="muted-copy">${esc(plan.phaseNote || plan.phase1?.note || "")}</p>
          </section>` : ""}
        ${job ? `
          <section class="co-panel">
            <h4>Job ${esc(job.id)}</h4>
            <p>Status: <strong>${esc(job.status)}</strong> · ${esc(job.progress?.completed || 0)}/${esc(job.progress?.lessonCount || 0)} complete · failed ${esc(job.progress?.failed || 0)} · Publish: NOT PUBLISHED</p>
            <pre class="co-log">${esc((job.log || []).slice(-12).map((e) => `${e.at} [${e.level}] ${e.message}`).join("\n"))}</pre>
            <div class="co-lesson-results">${(job.lessonResults || []).map(renderAuditCard).join("")}</div>
            ${job.status === "awaiting_confirm" ? `
              <button type="button" class="primary-button" id="coConfirmResumeBtn">Confirm &amp; run</button>` : ""}
          </section>` : ""}
        <section class="co-panel">
          <h4>Recent jobs</h4>
          ${(state.jobs || []).length ? `<ul>${state.jobs.slice(0, 8).map((j) => `
            <li><button type="button" class="linkish" data-co-load-job="${esc(j.id)}">${esc(j.id)}</button>
              — ${esc(j.status)} — ${esc(j.rawCommand || "").slice(0, 80)}</li>`).join("")}</ul>`
            : "<p class=\"muted-copy\">No jobs yet.</p>"}
        </section>
      </div>
      <style>
        .co-operator textarea { width: 100%; max-width: 52rem; }
        .co-panel { margin: 1.25rem 0; padding: 1rem 0; border-top: 1px solid rgba(0,0,0,.08); }
        .co-json, .co-log { background: rgba(0,0,0,.04); padding: .75rem; overflow: auto; max-height: 16rem; font-size: .85rem; }
        .co-lesson-card { border: 1px solid rgba(0,0,0,.08); border-radius: 12px; padding: 1rem; margin: 1rem 0; }
        .co-lesson-card-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
        .co-status-pill { display: inline-block; padding: .25rem .6rem; border-radius: 999px; background: #f3e8d8; font-size: .85rem; }
        .co-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; }
        .co-field-list { list-style: none; padding: 0; margin: 0; }
        .co-field-list li { margin: .35rem 0; }
        .co-field-list li[data-decision="keep"] strong { color: #1f6b3a; }
        .co-field-list li[data-decision="improve"] strong { color: #8a5a00; }
        .co-field-list li[data-decision="replace"] strong { color: #8a1f1f; }
        .co-field-list li[data-decision="fill"] strong { color: #1f4b8a; }
        .co-action-list { margin: .25rem 0 0 1.1rem; }
        button.linkish { background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 0; font: inherit; }
      </style>
    `;

    el.querySelector("#coCommandInput")?.addEventListener("input", (e) => {
      state.command = e.target.value;
    });
    el.querySelector("#coParseBtn")?.addEventListener("click", () => void onParse());
    el.querySelector("#coRunBtn")?.addEventListener("click", () => void onRun());
    el.querySelector("#coRefreshJobsBtn")?.addEventListener("click", () => void refreshJobs());
    el.querySelector("#coConfirmResumeBtn")?.addEventListener("click", () => void onConfirmResume());
    el.querySelectorAll("[data-co-load-job]").forEach((btn) => {
      btn.addEventListener("click", () => void loadJob(btn.getAttribute("data-co-load-job")));
    });
    el.querySelectorAll("[data-co-open-lesson]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-co-open-lesson");
        if (typeof openOwnerTeachingKitEditor === "function") {
          openOwnerTeachingKitEditor(id);
        } else if (typeof setAdminSectionTab === "function") {
          setAdminSectionTab("curriculum-lesson-plans");
        }
      });
    });
  }

  async function onParse() {
    state.busy = true;
    state.message = "";
    state.isError = false;
    render();
    try {
      const result = await api("parse", { command: state.command, phase: 3 });
      state.commandParsed = result;
      const planned = await api("plan", { command: state.command, phase: 3 });
      state.planSummary = planned.planSummary;
      state.job = planned.job || null;
      state.message = "Command interpreted. Review the plan, then run the job.";
    } catch (error) {
      state.isError = true;
      state.message = error.message || "Interpret failed.";
      state.planSummary = error.payload?.planSummary || null;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function onRun() {
    state.busy = true;
    state.message = "";
    state.isError = false;
    render();
    try {
      const result = await api("run", { command: state.command, confirm: true, phase: 3 });
      state.commandParsed = { command: result.command };
      state.planSummary = result.planSummary;
      state.job = result.job;
      if (result.awaitingConfirm) {
        state.message = "Confirmation required before running. Review scope, then confirm.";
      } else if (result.draftOnly) {
        state.message = "Draft upgrade job complete. Enrichment drafts updated only — NOT PUBLISHED. No images/printables changed.";
      } else {
        state.message = "Audit job complete. No curriculum data was changed.";
      }
      await refreshJobs(false);
    } catch (error) {
      state.isError = true;
      state.message = error.message || "Run failed.";
      state.planSummary = error.payload?.selection ? {
        selectionNote: error.payload.selection.selectionNote,
        lessons: error.payload.selection.selected || [],
        candidatesConsidered: error.payload.selection.candidatesConsidered,
      } : state.planSummary;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function onConfirmResume() {
    if (!state.job?.id) return;
    state.busy = true;
    render();
    try {
      const result = await api("resume", { jobId: state.job.id, confirm: true });
      state.job = result.job;
      state.message = "Confirmed job finished. Publish remains blocked.";
      await refreshJobs(false);
    } catch (error) {
      state.isError = true;
      state.message = error.message || "Resume failed.";
    } finally {
      state.busy = false;
      render();
    }
  }

  async function loadJob(jobId) {
    state.busy = true;
    render();
    try {
      const result = await api("get", { jobId });
      state.job = result.job;
      state.command = result.job?.command?.rawCommand || state.command;
      state.planSummary = result.job?.planSummary || null;
      state.message = `Loaded job ${jobId}.`;
    } catch (error) {
      state.isError = true;
      state.message = error.message || "Could not load job.";
    } finally {
      state.busy = false;
      render();
    }
  }

  async function refreshJobs(doRender = true) {
    try {
      const result = await api("list");
      state.jobs = result.jobs || [];
    } catch (error) {
      if (doRender) {
        state.isError = true;
        state.message = error.message || "Could not list jobs.";
      }
    }
    if (doRender) render();
  }

  async function mount() {
    state.mounted = true;
    state.flagEnabled = flagOn();
    render();
    if (state.flagEnabled && isOwner()) {
      await refreshJobs();
    }
  }

  global.LLHCurriculumOperatorUi = { mount };
})(typeof window !== "undefined" ? window : globalThis);
