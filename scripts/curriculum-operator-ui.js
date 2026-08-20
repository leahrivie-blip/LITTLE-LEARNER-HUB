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
    publishModal: null,
    publishResult: null,
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

  async function ownerPublishApi(action, extra = {}) {
    const token = adminToken();
    if (!token) throw new Error("Admin session required.");
    if (!isOwner()) throw new Error("Owner publish is restricted to the owner account.");
    const response = await fetch("/api/admin/curriculum/operator-owner-publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(json.error || `Owner publish failed (${response.status})`);
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

  function renderOwnerReviewPanel(lr) {
    const review = lr.ownerReviewStatus || "";
    const lessonId = (lr.auditAfter || lr.audit)?.lessonId || lr.createdLessonId || lr.lessonId || "";
    const publishedUi = state.publishResult?.lessonId === lessonId && state.publishResult?.published;
    if (publishedUi) {
      const ui = state.publishResult.ui || {};
      return `
        <section class="co-owner-review">
          <h5>PUBLISHED</h5>
          <p>Published: ${esc(ui.publishedAt || "just now")}</p>
          <p>Access: ${esc(ui.accessPlan || lr.audit?.accessPlan || "")}</p>
          <p>Prepared by: ${esc(ui.preparedBy || "AI Curriculum Operator")}</p>
          <p>Verified: ✓</p>
          <div class="account-actions-row">
            <button type="button" class="ghost-button" data-co-open-lesson="${esc(lessonId)}">Open Full Lesson</button>
          </div>
        </section>`;
    }
    if (review !== "READY_FOR_OWNER_REVIEW") {
      return `<p class="muted-copy"><strong>Publish: NOT PUBLISHED.</strong> ${
        review === "PARTIAL" || review === "BLOCKED" || review === "SCOPE_REVIEW_REQUIRED" || review === "RUNNING"
          ? `Publish disabled (${esc(review)}).`
          : ""
      }</p>`;
    }
    const audit = lr.auditAfter || lr.audit || {};
    const readiness = lr.afterScores?.premiumReadinessPercent ?? audit?.scores?.premiumReadinessPercent ?? "—";
    const publishNote = lr.publishRequested
      ? "<p class=\"access-notice\"><strong>READY FOR REVIEW — PUBLISH REQUESTED</strong> (Owner confirmation still required)</p>"
      : "";
    const changes = Array.isArray(lr.updated) ? lr.updated : [];
    const kept = Array.isArray(lr.kept) ? lr.kept : [];
    return `
      <section class="co-owner-review">
        ${publishNote}
        <h5>${esc(audit.title || lr.title || "Lesson")}</h5>
        <p class="co-status-pill">READY FOR OWNER REVIEW</p>
        <p>Teaching Kit ${esc(readiness)}%</p>
        <ul class="co-review-checks">
          <li>Content — Weekly plan ${audit.weeklyContent ? "✓" : "·"} · Activities ✓ · Songs ${lr.songsBooksComplete || (lr.songCounts && (lr.songCounts.KEEP || lr.songCounts.ADD)) ? "✓" : "·"} · Books ${lr.songsBooksComplete || (lr.bookCounts && (lr.bookCounts.KEEP || lr.bookCounts.ADD)) ? "✓" : "·"}</li>
          <li>Activity images — ${lr.imagesComplete ? "✓ Verified" : "Needs review"}</li>
          <li>Printables — ${lr.printablesComplete ? "✓ Verified" : "Needs review"}</li>
          <li>Final validation — ${lr.finalVerification?.ok !== false ? "✓ No critical blockers" : "✗ Issues remain"}</li>
          <li>Last Operator job — Completed</li>
        </ul>
        <p><strong>PUBLISH STATUS</strong> — NOT PUBLISHED</p>
        ${changes.length || kept.length ? `
          <details class="co-review-changes">
            <summary>Review Changes</summary>
            ${changes.length ? `<p><strong>Changed:</strong></p><ul>${changes.slice(0, 12).map((c) => `<li>${esc(c.activityTitle || c.path || c)}</li>`).join("")}</ul>` : ""}
            ${kept.length ? `<p><strong>Kept:</strong> ${esc(kept.slice(0, 10).join(", "))}${kept.length > 10 ? "…" : ""}</p>` : ""}
          </details>` : ""}
        <div class="account-actions-row">
          <button type="button" class="ghost-button" data-co-open-lesson="${esc(lessonId)}">Open Full Lesson</button>
          <button type="button" class="ghost-button" data-co-review-changes="${esc(lessonId)}">Review Changes</button>
          <button type="button" class="primary-button" data-co-publish-lesson="${esc(lessonId)}"
            data-co-publish-title="${esc(audit.title || lr.title || "")}"
            data-co-publish-requested="${lr.publishRequested ? "1" : "0"}">Publish Lesson</button>
        </div>
      </section>`;
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
      ${lr.workPlan ? `
      <section>
        <h5>Full-kit work plan</h5>
        <pre class="co-log">${esc((typeof LLHCurriculumOperatorUi !== "undefined" ? "" : "") + (lr.workPlan.title || "") + " · cover " + (lr.workPlan.cover || "LOCKED"))}</pre>
        <p class="muted-copy">Locks:
          images ${lr.kitScope?.locks?.images ? "ON" : "off"} ·
          printables ${lr.kitScope?.locks?.printables ? "ON" : "off"} ·
          songs ${lr.kitScope?.locks?.songs ? "ON" : "off"} ·
          books ${lr.kitScope?.locks?.books ? "ON" : "off"} ·
          cover ${lr.kitScope?.locks?.cover !== false ? "ON" : "off"}
        </p>
      </section>` : ""}
      ${lr.finalVerification ? `
      <section>
        <h5>Verification</h5>
        <p class="muted-copy">${lr.finalVerification.ok ? "✓ Final stored-state verification passed" : "✗ Final verification issues"}
          · Draft saved · Publish: NOT PUBLISHED</p>
      </section>` : ""}
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
          ` : `<p class="muted-copy">Images unchanged in this job.</p>`}
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
        <section>
          <h5>Songs</h5>
          ${lr.songCounts ? `
            <p>KEEP — ${esc(lr.songCounts.KEEP || 0)} · ADD — ${esc(lr.songCounts.ADD || 0)} · IMPROVE — ${esc(lr.songCounts.IMPROVE || 0)} · REPLACE — ${esc(lr.songCounts.REPLACE || 0)} · NOT NEEDED — ${esc(lr.songCounts.NOT_NEEDED || 0)}</p>
            <ul>${(Array.isArray(lr.songActions) ? lr.songActions : []).slice(0, 12).map((s) => `
              <li><strong>${esc((s.weekday || "").charAt(0).toUpperCase() + (s.weekday || "").slice(1))}</strong>
                — ${esc(s.decision)}
                ${s.title || s.existingTitle ? ` · ${esc(s.title || s.existingTitle)}` : ""}
                ${s.status === "success" ? " · ✓ saved" : ""}
                <span class="muted-copy"> — ${esc(s.reason || s.error || "")}</span>
              </li>`).join("")}</ul>
          ` : `<p class="muted-copy">Songs unchanged in this job.</p>`}
        </section>
        <section>
          <h5>Books</h5>
          ${lr.bookCounts ? `
            <p>KEEP — ${esc(lr.bookCounts.KEEP || 0)} · ADD — ${esc(lr.bookCounts.ADD || 0)} · IMPROVE GUIDE — ${esc(lr.bookCounts.IMPROVE_GUIDE || 0)} · REPLACE — ${esc(lr.bookCounts.REPLACE || 0)} · NOT NEEDED — ${esc(lr.bookCounts.NOT_NEEDED || 0)}</p>
            <ul>${(Array.isArray(lr.bookActions) ? lr.bookActions : []).slice(0, 8).map((b) => `
              <li><strong>${esc(b.title || b.existingTitle || "Book")}</strong>
                — ${esc(b.decision)}
                ${b.status === "success" ? " · ✓ saved" : ""}
                <span class="muted-copy"> — ${esc(b.reason || b.error || "")}</span>
              </li>`).join("")}</ul>
          ` : `<p class="muted-copy">Books unchanged in this job.</p>`}
        </section>
      </div>
      <section>
        <h5>Teaching Kit blockers</h5>
        ${((lr.auditAfter || lr.audit)?.teachingKitBlockers || []).length
          ? `<ul>${(lr.auditAfter || lr.audit).teachingKitBlockers.slice(0, 8).map((b) => `<li>${esc(b.message)}</li>`).join("")}</ul>`
          : "<p class=\"muted-copy\">None listed</p>"}
      </section>
      ${renderOwnerReviewPanel(lr)}
      ${review === "READY_FOR_OWNER_REVIEW" ? "" : `
      <div class="account-actions-row">
        <button type="button" class="ghost-button" data-co-open-lesson="${esc((lr.audit || a)?.lessonId || lr.lessonId)}">Open in Enrichment Editor</button>
      </div>`}
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
            <p class="muted-copy">Phase 8: AI jobs still end at <strong>READY FOR OWNER REVIEW</strong> (never auto-publish). You inspect the stored draft, then explicitly Publish through the trusted path — one lesson at a time.</p>
          </div>
        </div>
        ${state.message ? `<p class="access-notice ${state.isError ? "error" : ""}" role="status">${esc(state.message)}</p>` : ""}
        <label class="co-command-label">
          <span>Command</span>
          <textarea id="coCommandInput" rows="3" placeholder="Example: Create a Preschool Bakery lesson with 15 activities and leave it ready for review.">${esc(state.command)}</textarea>
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
            <h4>${plan.createsLesson ? "Create new lesson" : "Execution plan"}</h4>
            ${plan.creationBrief ? `
              <p><strong>Parsed brief:</strong> ${esc(plan.creationBrief.ageBand || "")} · ${esc(plan.creationBrief.accessPlan || "")} · ${esc(plan.creationBrief.title || "")} · ${esc(plan.creationBrief.activityTarget || "")} activities · Draft only</p>
              <p class="muted-copy">Images ${plan.creationBrief.requestedFeatures?.images === false ? "off" : "on"} · Printables ${plan.creationBrief.requestedFeatures?.printables === false ? "off" : "on"} · Songs ${plan.creationBrief.requestedFeatures?.songs === false ? "off" : "on"} · Books ${plan.creationBrief.requestedFeatures?.books === false ? "off" : "on"}</p>
            ` : ""}
            <p>${esc(plan.selectionNote || "")}</p>
            <p class="muted-copy">${esc(plan.lessons?.length || 0)} lesson(s) · candidates considered ${esc(plan.candidatesConsidered || 0)}</p>
            <ol>${(plan.lessons || []).map((l) => `
              <li><strong>${esc(l.title)}</strong> — readiness ${esc(l.readinessPercent)}% · ${esc(l.plan)} · ${esc(l.ageBand)}</li>`).join("")}</ol>
            <p class="muted-copy">${esc(plan.phaseNote || plan.phase1?.note || "")}</p>
          </section>` : ""}
        ${job ? `
          <section class="co-panel">
            <h4>Job ${esc(job.id)}</h4>
            <p>Status: <strong>${esc(job.status)}</strong> · ${esc(job.progress?.completed || 0)}/${esc(job.progress?.lessonCount || 0)} complete · failed ${esc(job.progress?.failed || 0)} · Publish: NOT PUBLISHED</p>
            <pre class="co-log">${esc((job.log || []).slice(-12).map((e) => `${e.at} [${e.level}] ${e.message}`).join("\n"))}</pre>
            <div class="co-lesson-results">${(job.lessonResults || []).map(renderAuditCard).join("")}</div>
            ${(job.lessonResults || []).some((lr) => lr.createdLessonId || (lr.lessonId && String(lr.lessonId).startsWith("cur-lp-"))) ? `
              <p class="muted-copy">Open the new draft in Owner Admin → Curriculum to inspect and manually publish.</p>` : ""}
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
      ${state.publishModal ? `
        <div class="co-publish-modal" role="dialog" aria-modal="true">
          <div class="co-publish-modal-card">
            <h3>${esc(state.publishModal.message || "Publish lesson?")}</h3>
            <p>${esc(state.publishModal.detail || "")}</p>
            <ul>
              <li><strong>Access:</strong> ${esc(state.publishModal.accessPlan || "")}</li>
              <li><strong>Age:</strong> ${esc(state.publishModal.age || "")}</li>
              <li><strong>Activities:</strong> ${esc(state.publishModal.activityCount ?? "")}</li>
              <li><strong>Printables:</strong> ${esc(state.publishModal.printableCount ?? "")}</li>
              <li><strong>Lesson ID:</strong> <code>${esc(state.publishModal.lessonId || "")}</code></li>
            </ul>
            <p class="muted-copy">This action changes the live curriculum.</p>
            <div class="account-actions-row">
              <button type="button" class="ghost-button" id="coPublishCancelBtn">Cancel</button>
              <button type="button" class="primary-button" id="coPublishConfirmBtn" ${state.busy ? "disabled" : ""}>Publish</button>
            </div>
          </div>
        </div>` : ""}
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
        .co-owner-review { margin-top: 1rem; padding-top: .75rem; border-top: 1px dashed rgba(0,0,0,.12); }
        .co-review-checks { margin: .5rem 0; padding-left: 1.1rem; }
        .co-publish-modal { position: fixed; inset: 0; background: rgba(20,16,12,.45); display: flex; align-items: center; justify-content: center; z-index: 80; padding: 1rem; }
        .co-publish-modal-card { background: #fffaf3; max-width: 28rem; width: 100%; padding: 1.25rem; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.18); }
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
    el.querySelector("#coPublishCancelBtn")?.addEventListener("click", () => {
      state.publishModal = null;
      render();
    });
    el.querySelector("#coPublishConfirmBtn")?.addEventListener("click", () => void onConfirmPublish());
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
    el.querySelectorAll("[data-co-review-changes]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".co-lesson-card");
        const details = card?.querySelector(".co-review-changes");
        if (details) details.open = true;
        details?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
    el.querySelectorAll("[data-co-publish-lesson]").forEach((btn) => {
      btn.addEventListener("click", () => void onOpenPublishConfirm(btn.getAttribute("data-co-publish-lesson")));
    });
  }

  async function onOpenPublishConfirm(lessonId) {
    state.busy = true;
    state.message = "";
    state.isError = false;
    render();
    try {
      const lr = (state.job?.lessonResults || []).find((row) => (
        row.lessonId === lessonId || row.createdLessonId === lessonId
        || row.audit?.lessonId === lessonId || row.auditAfter?.lessonId === lessonId
      ));
      const result = await ownerPublishApi("confirm", {
        lessonId,
        ownerReviewStatus: lr?.ownerReviewStatus || "READY_FOR_OWNER_REVIEW",
        publishRequested: lr?.publishRequested === true,
      });
      state.publishModal = {
        ...result.confirmation,
        lessonId,
        reviewedFingerprint: result.confirmation?.fingerprint || result.fingerprint?.fingerprint,
      };
      state.message = "Review the publish confirmation carefully. This changes the live curriculum.";
    } catch (error) {
      state.isError = true;
      state.message = error.message || "Publish eligibility failed.";
      state.publishModal = null;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function onConfirmPublish() {
    if (!state.publishModal?.lessonId) return;
    state.busy = true;
    state.isError = false;
    render();
    try {
      const modal = state.publishModal;
      const result = await ownerPublishApi("publish", {
        lessonId: modal.lessonId,
        confirmPublish: true,
        reviewedFingerprint: modal.reviewedFingerprint || modal.fingerprint,
        title: modal.title,
        age: modal.age,
        accessPlan: modal.accessPlan,
        ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
      });
      state.publishModal = null;
      state.publishResult = {
        lessonId: modal.lessonId,
        published: true,
        ui: result.ui,
      };
      state.message = `PUBLISHED — verified. Access: ${result.ui?.accessPlan || ""}.`;
      await refreshJobs(false);
    } catch (error) {
      state.isError = true;
      const code = error.payload?.code || "";
      if (code === "DRAFT_CHANGED_REVIEW_AGAIN") {
        state.message = "DRAFT_CHANGED_REVIEW_AGAIN — the draft changed since confirmation. Review again before publishing.";
        state.publishModal = null;
      } else if (code === "PUBLISH_VERIFY_FAILED") {
        state.message = "PUBLISH_VERIFY_FAILED — publish did not verify cleanly. Investigate before retrying.";
      } else {
        state.message = error.message || "Publish failed.";
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  async function onParse() {
    state.busy = true;
    state.message = "";
    state.isError = false;
    render();
    try {
      const result = await api("parse", { command: state.command, phase: 7 });
      state.commandParsed = result;
      const planned = await api("plan", { command: state.command, phase: 7 });
      state.planSummary = planned.planSummary;
      state.job = planned.job || null;
      state.message = planned.planSummary?.createsLesson
        ? "Create plan ready. Review the brief, then run the job."
        : "Command interpreted. Review the plan, then run the job.";
    } catch (error) {
      state.isError = true;
      state.message = error.message || "Interpret failed.";
      state.planSummary = error.payload?.planSummary || error.payload?.creationBrief
        ? {
          selectionNote: error.payload?.error || error.message,
          lessons: [],
          creationBrief: error.payload?.creationBrief,
          duplicateMatches: error.payload?.duplicateMatches,
        }
        : state.planSummary;
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
      const result = await api("run", { command: state.command, confirm: true, phase: 7 });
      state.commandParsed = { command: result.command };
      state.planSummary = result.planSummary;
      state.job = result.job;
      if (result.awaitingConfirm) {
        state.message = "Confirmation required before running. Review scope, then confirm.";
      } else if (result.draftOnly) {
        const createdId = result.job?.lessonResults?.[0]?.createdLessonId || result.job?.lessonResults?.[0]?.lessonId;
        const publishRequested = (result.job?.lessonResults || []).some((lr) => lr.publishRequested)
          || (result.command?.confirmations?.reasons || []).includes("publish_requested");
        if (publishRequested) {
          state.message = createdId
            ? `READY FOR REVIEW — PUBLISH REQUESTED (${createdId}). AI did not publish. Confirm Publish in the Owner review panel.`
            : "READY FOR REVIEW — PUBLISH REQUESTED. AI did not publish. Confirm Publish in the Owner review panel.";
        } else {
          state.message = createdId
            ? `Draft lesson created (${createdId}) — READY FOR OWNER REVIEW / NOT PUBLISHED. Open the lesson to inspect.`
            : "Full Teaching Kit draft job complete — NOT PUBLISHED. Open the lesson to review.";
        }
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
