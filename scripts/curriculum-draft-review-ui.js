/**
 * Admin → Content → Draft Review Queue (Phase 1).
 * Delivery tool only — Open Review uses the real Teaching Kit Enrichment Editor.
 */
(function initCurriculumDraftReviewUi(global) {
  "use strict";

  const STATUS_ORDER = [
    "submitted", "in_review", "revision_requested", "revised",
    "ready_for_owner_approval", "approved", "published",
    "discarded", "rolled_back", "failed_validation",
  ];

  const STATUS_LABELS = {
    submitted: "Submitted",
    in_review: "In Review",
    revision_requested: "Revision Requested",
    revised: "Revised",
    ready_for_owner_approval: "Ready for Owner Approval",
    approved: "Approved",
    published: "Published",
    discarded: "Discarded",
    rolled_back: "Rolled Back",
    failed_validation: "Failed Validation",
  };

  const state = {
    items: [],
    selectedId: "",
    detail: null,
    compare: null,
    busy: false,
    loading: false,
    message: "",
    isSuccess: false,
    filterStatus: "",
    reviewNotes: "",
    previewViewport: "desktop",
    publishUnavailableReason: "Publishing will be added only after the queue workflow is approved (Phase 2).",
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isOwner() {
    try {
      if (typeof isTeachingKitPrintableOwnerClient === "function") {
        return isTeachingKitPrintableOwnerClient();
      }
      const session = typeof adminSession === "function" ? adminSession() : null;
      return String(session?.email || "").trim().toLowerCase() === "leahivie@icloud.com";
    } catch {
      return false;
    }
  }

  async function api(action, extra = {}) {
    const token = (typeof adminSession === "function" ? adminSession()?.token : "") || "";
    if (!token) throw new Error("Admin session required.");
    if (!isOwner()) throw new Error("Draft Review Queue is restricted to the owner account.");
    const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
      ? curriculumExpectedUpdatedAt()
      : "";
    const response = await fetch("/api/admin/curriculum/draft-review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, expectedUpdatedAt, ...extra }),
    });
    const json = await response.json().catch(() => ({}));
    if (json.curriculum && typeof applyCurriculumState === "function") {
      applyCurriculumState(json.curriculum, { siteContentUpdatedAt: json.siteContentUpdatedAt });
    } else if (json.siteContentUpdatedAt && typeof siteContentState !== "undefined" && siteContentState) {
      siteContentState.updatedAt = json.siteContentUpdatedAt;
    }
    if (!response.ok) throw new Error(json.error || `Draft Review failed (${response.status})`);
    return json;
  }

  async function refreshList() {
    const data = await api("list");
    state.items = Array.isArray(data.items) ? data.items : [];
    if (data.publishUnavailableReason) state.publishUnavailableReason = data.publishUnavailableReason;
  }

  async function openDetail(id) {
    state.selectedId = id;
    const data = await api("get", { id });
    state.detail = data;
    state.compare = null;
    state.reviewNotes = data.entry?.reviewNotes || "";
  }

  function scoreCell(value) {
    if (value == null || value === "") return "—";
    return `${Number(value)}%`;
  }

  function formatDate(value) {
    const text = String(value || "").trim();
    return text ? text.slice(0, 10) : "—";
  }

  function statusBadge(item) {
    const status = item.status || "";
    const label = item.statusLabel || STATUS_LABELS[status] || status;
    return `<span class="tag tk-draft-status tk-draft-status--${esc(status)}">${esc(label)}</span>`;
  }

  function scoreBadge(label, value) {
    const n = Number(value);
    const tone = !Number.isFinite(n) ? "na" : (n >= 90 ? "high" : (n >= 70 ? "mid" : "low"));
    return `<span class="tk-draft-score tk-draft-score--${tone}"><em>${esc(label)}</em> ${esc(scoreCell(value))}</span>`;
  }

  function blockersText(item) {
    const list = item.blockers || item.scores?.blockers || [];
    return list.length ? list.slice(0, 3).join("; ") : "None";
  }

  function notesStatus(item) {
    return text(item.reviewNotes) ? "Notes added" : "No notes yet";
  }

  function text(value) {
    return String(value || "").trim();
  }

  function renderEmpty() {
    return `
      <div class="tk-draft-review-empty access-notice" role="status">
        <strong>No drafts waiting</strong>
        <p class="muted-copy">When Cursor or an authorized curriculum process upgrades a lesson, it appears here for your review. Published lessons stay unchanged until you approve publishing later.</p>
        <button type="button" class="primary-button" data-draft-review-seed ${state.busy ? "disabled" : ""}>Submit Phase 1 seed (Apples + All About Me)</button>
      </div>
    `;
  }

  function renderMobileCards(items) {
    return `
      <div class="tk-draft-review-cards" aria-label="Draft review cards">
        ${items.map((item) => `
          <article class="tk-draft-review-card ${state.selectedId === item.id ? "is-selected" : ""}">
            <header>
              <h4>${esc(item.title || "Untitled")}</h4>
              ${statusBadge(item)}
            </header>
            <p class="muted-copy">${esc(item.age || "")} · Submitted ${esc(formatDate(item.submittedAt))}</p>
            <p class="tk-draft-review-card-meta"><span>Batch / revision</span><code>${esc(item.revisionId || item.batchId || "—")}</code></p>
            <div class="tk-draft-score-row">
              ${scoreBadge("Structural", item.structuralScore)}
              ${scoreBadge("Premium", item.premiumScore)}
            </div>
            <dl class="tk-draft-review-card-stats">
              <div><dt>Blockers</dt><dd>${esc(blockersText(item))}</dd></div>
              <div><dt>Activities changed</dt><dd>${Number(item.changedActivities || 0)}</dd></div>
              <div><dt>Printables</dt><dd>${Number(item.printables || 0)}</dd></div>
              <div><dt>Missing images</dt><dd>${Number(item.missingRequiredImages || 0)}</dd></div>
              <div><dt>Revision notes</dt><dd>${esc(notesStatus(item))}</dd></div>
            </dl>
            <button type="button" class="primary-button tk-draft-open-review" data-draft-review-open-kit="${esc(item.id)}">Open Review</button>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderQueueTable(items) {
    const rows = items.map((item) => `
      <tr class="${state.selectedId === item.id ? "is-selected" : ""}">
        <td><strong>${esc(item.title || "Untitled")}</strong><br><small>${esc(item.lessonPlanId || "")}</small></td>
        <td>${esc(item.age || "")}</td>
        <td>${esc(formatDate(item.submittedAt))}</td>
        <td><code>${esc(item.revisionId || item.batchId || "—")}</code></td>
        <td>${statusBadge(item)}</td>
        <td>${scoreBadge("Structural", item.structuralScore)}</td>
        <td>${scoreBadge("Premium", item.premiumScore)}</td>
        <td class="tk-draft-blockers">${esc(blockersText(item))}</td>
        <td>${Number(item.changedActivities || 0)}</td>
        <td>${Number(item.printables || 0)}</td>
        <td>${Number(item.missingRequiredImages || 0)}</td>
        <td>${esc(notesStatus(item))}</td>
        <td class="tk-draft-actions-col">
          <button type="button" class="primary-button" data-draft-review-open-kit="${esc(item.id)}">Open Review</button>
        </td>
      </tr>
    `).join("");
    return `
      <div class="admin-table-wrap tk-draft-review-table-wrap tk-draft-review-desktop-only">
        <table class="admin-table tk-draft-review-table">
          <thead>
            <tr>
              <th>Lesson</th><th>Age</th><th>Submitted</th><th>Batch / Revision</th><th>Status</th>
              <th>Structural</th><th>Premium</th><th>Blockers</th>
              <th>Activities</th><th>Printables</th><th>Missing images</th><th>Notes</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="tk-draft-review-mobile-only">${renderMobileCards(items)}</div>
    `;
  }

  function renderDetail() {
    const data = state.detail;
    if (!data?.entry) return "";
    const entry = data.entry;
    const resources = Array.isArray(data.draftResources) ? data.draftResources : [];
    const compareHtml = state.compare ? `
      <div class="tk-draft-review-compare access-notice">
        <strong>Compare vs published</strong>
        <p class="muted-copy">Activity keys touched: ${Number(state.compare.compare?.activityKeysTouched || 0)} · Week fields: ${Number(state.compare.compare?.weekFieldsTouched || 0)}</p>
        <ul class="tk-draft-compare-list">
          ${(state.compare.compare?.weekFields || []).slice(0, 20).map((f) => `<li>Week · ${esc(f)}</li>`).join("")}
          ${(state.compare.compare?.changedFields || []).slice(0, 30).map((f) => `<li>${esc(f.scope)} · ${esc(f.key)} · ${esc(f.field)}</li>`).join("")}
        </ul>
      </div>
    ` : "";
    return `
      <section class="tk-draft-review-detail access-notice" aria-label="Draft review detail">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Draft Review · ${esc(entry.statusLabel || STATUS_LABELS[entry.status] || entry.status)}</p>
            <strong>${esc(entry.title)}</strong>
            <p class="muted-copy">${esc(entry.age)} · ${esc(entry.theme)} · Submitted ${esc(formatDate(entry.submittedAt))}</p>
            <p class="muted-copy">Revision <code>${esc(entry.revisionId || "—")}</code></p>
          </div>
          <button type="button" class="ghost-button" data-draft-review-close-detail>Back to queue</button>
        </div>
        <div class="tk-draft-score-row" style="margin-bottom:0.75rem;">
          ${scoreBadge("Structural", entry.scores?.structuralScore)}
          ${scoreBadge("Premium", entry.scores?.premiumScore)}
        </div>
        <p class="muted-copy">${esc(entry.scores?.note || "Authoritative Teaching Kit editor scores. Draft printables never count as published.")}</p>
        <div class="form-actions tk-draft-review-actions">
          <button type="button" class="primary-button" data-draft-review-open-editor>Open Teaching Kit Review</button>
          <button type="button" class="ghost-button" data-draft-review-preview-viewport="desktop">Preview desktop</button>
          <button type="button" class="ghost-button" data-draft-review-preview-viewport="mobile">Preview mobile</button>
          <button type="button" class="ghost-button" data-draft-review-compare>Compare vs published</button>
          <button type="button" class="ghost-button" data-draft-review-save-edited ${state.busy ? "disabled" : ""}>Save edited draft</button>
          <button type="button" class="ghost-button" data-draft-review-mark-in-review ${state.busy ? "disabled" : ""}>Mark In Review</button>
        </div>
        <div class="tk-draft-review-resources">
          <h4>Draft printables</h4>
          ${resources.length ? resources.map((r) => `
            <div class="tk-draft-review-resource-row">
              <strong>${esc(r.title || r.id)}</strong>
              <small>${esc(r.status)} · public ${esc(r.publicAccess || "404")}</small>
              <button type="button" class="ghost-button" data-draft-review-open-resource="${esc(r.id)}">Preview / Download</button>
            </div>
          `).join("") : `<p class="muted-copy">No draft printables linked.</p>`}
        </div>
        <label class="tk-draft-notes-label">
          <span>Owner review notes</span>
          <textarea rows="4" data-draft-review-notes placeholder="What should change before the next revision?">${esc(state.reviewNotes || "")}</textarea>
        </label>
        <div class="form-actions tk-draft-review-actions">
          <button type="button" class="ghost-button" data-draft-review-add-notes ${state.busy ? "disabled" : ""}>Add review notes</button>
          <button type="button" class="primary-button" data-draft-review-request-revision ${state.busy ? "disabled" : ""}>Request revision</button>
          <button type="button" class="ghost-button" data-draft-review-discard ${state.busy ? "disabled" : ""}>Discard</button>
          <button type="button" class="ghost-button" data-draft-review-rollback ${state.busy ? "disabled" : ""}>Roll back</button>
        </div>
        <p class="muted-copy">${esc(state.publishUnavailableReason)}</p>
        <div class="form-actions tk-draft-review-phase2" title="Phase 2">
          <button type="button" class="ghost-button" disabled>Approve (unavailable in Phase 1)</button>
          <button type="button" class="ghost-button" disabled>Publish (unavailable in Phase 1)</button>
        </div>
        ${compareHtml}
      </section>
    `;
  }

  function render() {
    const host = document.querySelector("#adminDraftReviewQueueApp");
    if (!host) return;
    if (!isOwner()) {
      host.innerHTML = `
        <div class="access-notice" role="status">
          <strong>Draft Review Queue</strong>
          <p class="muted-copy">Owner-only. Sign in as leahivie@icloud.com to review incoming curriculum drafts.</p>
        </div>`;
      return;
    }
    const filtered = state.items.filter((item) => (
      !state.filterStatus || item.status === state.filterStatus
    )).sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    const msg = state.message
      ? `<div class="form-message ${state.isSuccess ? "success" : "error"}" role="status">${esc(state.message)}</div>`
      : "";
    const loading = state.loading || state.busy
      ? `<p class="muted-copy tk-draft-loading" role="status">Working…</p>`
      : "";
    host.innerHTML = `
      <div class="tk-draft-review-queue">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Curriculum · Owner only</p>
            <h3>Draft Review Queue</h3>
            <p class="muted-copy">Proposed Teaching Kit upgrades land here as drafts. Open Review launches the real Teaching Kit editor.</p>
          </div>
        </div>
        ${msg}
        ${loading}
        <div class="form-actions tk-draft-review-actions">
          <button type="button" class="primary-button" data-draft-review-refresh ${state.busy ? "disabled" : ""}>Refresh queue</button>
          <button type="button" class="ghost-button" data-draft-review-seed ${state.busy ? "disabled" : ""}>Submit Phase 1 seed (Apples + All About Me)</button>
          <label class="tk-draft-filter">Status
            <select data-draft-review-filter>
              <option value="">All</option>
              ${STATUS_ORDER.map((s) => `<option value="${s}" ${state.filterStatus === s ? "selected" : ""}>${STATUS_LABELS[s] || s}</option>`).join("")}
            </select>
          </label>
        </div>
        ${state.selectedId && state.detail
          ? renderDetail()
          : (filtered.length ? renderQueueTable(filtered) : renderEmpty())}
      </div>
    `;
  }

  async function run(actionFn, successMessage) {
    if (state.busy) return;
    state.busy = true;
    state.loading = true;
    state.message = "";
    render();
    try {
      await actionFn();
      state.message = successMessage || "Done.";
      state.isSuccess = true;
    } catch (error) {
      state.message = error.message || "Draft Review action failed.";
      state.isSuccess = false;
    } finally {
      state.busy = false;
      state.loading = false;
      render();
    }
  }

  async function mount() {
    if (!isOwner()) { render(); return; }
    await run(async () => { await refreshList(); }, "Queue loaded.");
  }

  function openTeachingKit(viewport) {
    const lessonPlanId = state.detail?.entry?.lessonPlanId;
    if (!lessonPlanId) return;
    if (viewport) state.previewViewport = viewport;
    if (global.LLHTeachingKitEnrichmentEditor?.open) {
      global.LLHTeachingKitEnrichmentEditor.open(lessonPlanId);
      setTimeout(() => {
        if (viewport) {
          document.querySelector('[data-enrich-mode="preview"]')?.click?.();
          document.querySelector(`[data-preview-viewport="${state.previewViewport}"]`)?.click?.();
        }
      }, 450);
      return;
    }
    state.message = "Teaching Kit Enrichment Editor is not available.";
    state.isSuccess = false;
    render();
  }

  async function openReviewKit(id) {
    await openDetail(id);
    await api("mark-in-review", { id }).catch(() => {});
    openTeachingKit();
  }

  document.addEventListener("click", async (event) => {
    const openKit = event.target.closest("[data-draft-review-open-kit]");
    if (openKit) {
      const id = openKit.getAttribute("data-draft-review-open-kit");
      await run(async () => { await openReviewKit(id); }, "Opened Teaching Kit Review.");
      return;
    }
    if (event.target.closest("[data-draft-review-close-detail]")) {
      state.selectedId = "";
      state.detail = null;
      state.compare = null;
      render();
      return;
    }
    if (event.target.closest("[data-draft-review-refresh]")) {
      await run(async () => {
        state.selectedId = "";
        state.detail = null;
        await refreshList();
      }, "Queue refreshed.");
      return;
    }
    if (event.target.closest("[data-draft-review-seed]")) {
      if (!window.confirm("Submit Amazing Apples + All About Me as drafts? Published lessons will not change.")) return;
      await run(async () => {
        await api("submit-seed", {
          batchName: "Phase 1 seed — Apples + All About Me",
          source: "cursor-agent",
        });
        await refreshList();
        if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent().catch(() => {});
      }, "Seed packages submitted.");
      return;
    }
    if (event.target.closest("[data-draft-review-open-editor]")) {
      openTeachingKit();
      return;
    }
    const vp = event.target.closest("[data-draft-review-preview-viewport]");
    if (vp) {
      openTeachingKit(vp.getAttribute("data-draft-review-preview-viewport") || "desktop");
      return;
    }
    if (event.target.closest("[data-draft-review-compare]")) {
      await run(async () => {
        state.compare = await api("compare", { id: state.selectedId });
      }, "Compare ready.");
      return;
    }
    if (event.target.closest("[data-draft-review-save-edited]")) {
      await run(async () => {
        await api("save-edited", { id: state.selectedId, reviewNotes: state.reviewNotes });
        await openDetail(state.selectedId);
        await refreshList();
      }, "Edited draft saved.");
      return;
    }
    if (event.target.closest("[data-draft-review-mark-in-review]")) {
      await run(async () => {
        await api("mark-in-review", { id: state.selectedId });
        await openDetail(state.selectedId);
        await refreshList();
      }, "Marked In Review.");
      return;
    }
    const resBtn = event.target.closest("[data-draft-review-open-resource]");
    if (resBtn) {
      const resourceId = resBtn.getAttribute("data-draft-review-open-resource");
      if (typeof openCurriculumResourceFile === "function") openCurriculumResourceFile(resourceId);
      else {
        const token = adminSession()?.token || "";
        window.open(`/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}&adminToken=${encodeURIComponent(token)}`, "_blank");
      }
      return;
    }
    if (event.target.closest("[data-draft-review-add-notes]")) {
      await run(async () => {
        await api("add-notes", { id: state.selectedId, reviewNotes: state.reviewNotes });
        await openDetail(state.selectedId);
        await refreshList();
      }, "Review notes saved.");
      return;
    }
    if (event.target.closest("[data-draft-review-request-revision]")) {
      await run(async () => {
        await api("request-revision", { id: state.selectedId, reviewNotes: state.reviewNotes });
        await openDetail(state.selectedId);
        await refreshList();
      }, "Revision requested.");
      return;
    }
    if (event.target.closest("[data-draft-review-discard]")) {
      if (!window.confirm("Discard this draft? Published lesson stays unchanged.")) return;
      await run(async () => {
        await api("discard", { id: state.selectedId, reviewNotes: state.reviewNotes });
        state.selectedId = "";
        state.detail = null;
        await refreshList();
        if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent().catch(() => {});
      }, "Draft discarded.");
      return;
    }
    if (event.target.closest("[data-draft-review-rollback]")) {
      if (!window.confirm("Roll back to the prior draft version? Published lesson stays unchanged.")) return;
      await run(async () => {
        await api("rollback", { id: state.selectedId });
        state.selectedId = "";
        state.detail = null;
        await refreshList();
        if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent().catch(() => {});
      }, "Rolled back.");
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-draft-review-notes]")) state.reviewNotes = event.target.value || "";
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-draft-review-filter]")) {
      state.filterStatus = event.target.value || "";
      render();
    }
  });

  global.LLHDraftReviewQueue = { mount, render, state, isOwner };
})(typeof window !== "undefined" ? window : globalThis);
