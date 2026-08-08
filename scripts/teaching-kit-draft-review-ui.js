/**
 * Admin → Curriculum → Draft Review Queue (Phase 1 UI).
 * Owner-only. Full binder preview via Enrichment Live Preview.
 * No approve / publish in Phase 1.
 */
(function initDraftReviewQueueUi(global) {
  "use strict";

  const STATUS_ORDER = [
    "needs_owner_review",
    "revised",
    "incoming",
    "changes_requested",
    "approved_for_publishing",
    "published",
    "rejected",
    "rolled_back",
  ];

  const state = {
    items: [],
    selectedId: "",
    detail: null,
    compare: null,
    busy: false,
    message: "",
    isSuccess: false,
    filterStatus: "",
    reviewNotes: "",
    previewViewport: "desktop",
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
      body: JSON.stringify({
        action,
        expectedUpdatedAt,
        ...extra,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (json.curriculum && typeof applyCurriculumState === "function") {
      applyCurriculumState(json.curriculum, { siteContentUpdatedAt: json.siteContentUpdatedAt });
    } else if (json.siteContentUpdatedAt && typeof siteContentState !== "undefined" && siteContentState) {
      siteContentState.updatedAt = json.siteContentUpdatedAt;
    }
    if (!response.ok) {
      throw new Error(json.error || `Draft Review failed (${response.status})`);
    }
    return json;
  }

  async function refreshList() {
    const data = await api("list");
    state.items = Array.isArray(data.items) ? data.items : [];
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

  function renderQueueTable(items) {
    if (!items.length) {
      return `<p class="muted-copy">No draft packages in the queue yet. Submit the Phase 1 seed packages (Amazing Apples + All About Me) to begin review.</p>`;
    }
    const rows = items.map((item) => `
      <tr class="${state.selectedId === item.id ? "is-selected" : ""}">
        <td><strong>${esc(item.title || "Untitled")}</strong><br><small>${esc(item.lessonPlanId || "")}</small></td>
        <td>${esc(item.age || "")}</td>
        <td>${esc(item.theme || "")}</td>
        <td>${esc(item.publishedVersionLabel || "Published")}</td>
        <td>${esc(item.draftVersionLabel || "Incoming draft")}</td>
        <td>${esc((item.receivedAt || "").slice(0, 10))}</td>
        <td>${esc(item.batchName || item.batchId || "")}</td>
        <td>${esc(item.source || "")}</td>
        <td>${esc(scoreCell(item.structuralScore))}</td>
        <td>${esc(scoreCell(item.premiumScore))}</td>
        <td>${esc((item.blockingIssues || []).slice(0, 2).join("; ") || "—")}</td>
        <td>${Number(item.changedActivities || 0)}</td>
        <td>${Number(item.newPrintables || 0)}</td>
        <td>${Number(item.images || 0)}</td>
        <td>${esc(item.songsBooksStatus || "")}</td>
        <td><span class="tag">${esc(item.statusLabel || item.status || "")}</span></td>
        <td><button type="button" class="primary-button" data-draft-review-open="${esc(item.id)}">Open</button></td>
      </tr>
    `).join("");
    return `
      <div class="admin-table-wrap tk-draft-review-table-wrap">
        <table class="admin-table tk-draft-review-table">
          <thead>
            <tr>
              <th>Lesson</th><th>Age</th><th>Theme</th>
              <th>Published</th><th>Draft</th><th>Received</th>
              <th>Batch</th><th>Source</th>
              <th>Structural</th><th>Premium</th><th>Blockers</th>
              <th>Changed acts</th><th>New printables</th><th>Images</th>
              <th>Songs/Books</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderDetail() {
    const data = state.detail;
    if (!data?.entry) return "";
    const entry = data.entry;
    const resources = Array.isArray(data.draftResources) ? data.draftResources : [];
    const compareHtml = state.compare ? `
      <details open class="tk-draft-review-compare">
        <summary>Compare vs published</summary>
        <p class="muted-copy">Activity keys touched: ${Number(state.compare.compare?.activityKeysTouched || 0)} · Week fields: ${Number(state.compare.compare?.weekFieldsTouched || 0)}</p>
        <pre class="tk-proof-draft-json">${esc(JSON.stringify(state.compare.compare || {}, null, 2))}</pre>
      </details>
    ` : "";
    return `
      <section class="tk-draft-review-detail access-notice" aria-label="Draft review detail">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Draft Review · ${esc(entry.statusLabel || entry.status)}</p>
            <strong>${esc(entry.title)}</strong>
            <p class="muted-copy">${esc(entry.age)} · ${esc(entry.theme)} · Batch ${esc(entry.batchName || entry.batchId || "—")}</p>
            <p class="muted-copy">Rollback ID: <code>${esc(entry.rollbackId || "")}</code></p>
          </div>
          <button type="button" class="ghost-button" data-draft-review-close-detail>Back to queue</button>
        </div>
        <div class="tag-row" style="margin-bottom:0.75rem;">
          <span class="tag">Structural ${esc(scoreCell(entry.scores?.structuralScore))}</span>
          <span class="tag">Premium ${esc(scoreCell(entry.scores?.premiumScore))}</span>
          <span class="tag">${esc(entry.scores?.scoringMode || "actual_draft_catalog")}</span>
        </div>
        <p class="muted-copy">${esc(entry.scores?.note || "Honest actual scores — draft printables never count as published.")}</p>
        <div class="form-actions" style="flex-wrap:wrap;gap:0.5rem;margin:0.75rem 0;">
          <button type="button" class="primary-button" data-draft-review-preview-kit>Preview Teaching Kit</button>
          <button type="button" class="ghost-button" data-draft-review-preview-viewport="desktop">Desktop</button>
          <button type="button" class="ghost-button" data-draft-review-preview-viewport="mobile">Mobile</button>
          <button type="button" class="ghost-button" data-draft-review-compare>Compare vs published</button>
          <button type="button" class="ghost-button" data-draft-review-open-editor>Edit manually</button>
        </div>
        <div class="tk-draft-review-resources">
          <h4>Draft printables &amp; attachments</h4>
          ${resources.length ? resources.map((r) => `
            <div class="tk-draft-review-resource-row">
              <strong>${esc(r.title || r.id)}</strong>
              <small>${esc(r.status)} · public ${esc(r.publicAccess || "404")}</small>
              <button type="button" class="ghost-button" data-draft-review-open-resource="${esc(r.id)}">Preview / Download</button>
            </div>
          `).join("") : `<p class="muted-copy">No draft resources linked.</p>`}
        </div>
        <label style="display:block;margin-top:0.85rem;">
          <span>Owner review notes</span>
          <textarea rows="4" data-draft-review-notes placeholder="What should change before the next revision?">${esc(state.reviewNotes || "")}</textarea>
        </label>
        <div class="form-actions" style="flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem;">
          <button type="button" class="primary-button" data-draft-review-request-revision ${state.busy ? "disabled" : ""}>Request revision</button>
          <button type="button" class="ghost-button" data-draft-review-discard ${state.busy ? "disabled" : ""}>Discard incoming draft</button>
          <button type="button" class="ghost-button" data-draft-review-rollback ${state.busy ? "disabled" : ""}>Roll back</button>
        </div>
        <p class="muted-copy" style="margin-top:0.5rem;">Phase 1: Approve and Publish are disabled until you test this queue. Publishing will remain a separate manual action in Phase 2.</p>
        <div class="form-actions" style="opacity:0.45;pointer-events:none;" title="Phase 2">
          <button type="button" class="ghost-button" disabled>Approve draft (Phase 2)</button>
          <button type="button" class="ghost-button" disabled>Publish (Phase 2 — separate)</button>
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
        </div>
      `;
      return;
    }
    const filtered = state.items.filter((item) => (
      !state.filterStatus || item.status === state.filterStatus
    )).sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    const msg = state.message
      ? `<div class="form-message ${state.isSuccess ? "success" : ""}" role="status">${esc(state.message)}</div>`
      : "";
    host.innerHTML = `
      <div class="tk-draft-review-queue">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Curriculum · Owner only</p>
            <h3>Draft Review Queue</h3>
            <p class="muted-copy">Incoming upgraded lesson packages land here as drafts. Published lessons stay unchanged until you publish separately (Phase 2).</p>
          </div>
        </div>
        ${msg}
        <div class="form-actions" style="flex-wrap:wrap;gap:0.5rem;margin-bottom:0.85rem;">
          <button type="button" class="primary-button" data-draft-review-refresh ${state.busy ? "disabled" : ""}>Refresh queue</button>
          <button type="button" class="ghost-button" data-draft-review-seed ${state.busy ? "disabled" : ""}>Submit Phase 1 seed (Apples + All About Me)</button>
          <label>Status
            <select data-draft-review-filter>
              <option value="">All</option>
              ${STATUS_ORDER.map((s) => `<option value="${s}" ${state.filterStatus === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
            </select>
          </label>
        </div>
        ${state.selectedId && state.detail ? renderDetail() : renderQueueTable(filtered)}
      </div>
    `;
  }

  async function run(actionFn, successMessage) {
    if (state.busy) return;
    state.busy = true;
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
      render();
    }
  }

  async function mount() {
    if (!isOwner()) {
      render();
      return;
    }
    await run(async () => {
      await refreshList();
    }, "Queue loaded.");
  }

  function openPreviewKit() {
    const lessonPlanId = state.detail?.entry?.lessonPlanId;
    if (!lessonPlanId) return;
    if (global.LLHTeachingKitEnrichmentEditor?.open) {
      global.LLHTeachingKitEnrichmentEditor.open(lessonPlanId);
      // Prefer Live Preview tab when available
      setTimeout(() => {
        document.querySelector('[data-enrich-mode="preview"]')?.click?.();
        const vp = state.previewViewport || "desktop";
        document.querySelector(`[data-preview-viewport="${vp}"]`)?.click?.();
      }, 400);
      return;
    }
    state.message = "Enrichment editor is not available. Enable Teaching Kit Enrichment Editor.";
    state.isSuccess = false;
    render();
  }

  document.addEventListener("click", async (event) => {
    const openBtn = event.target.closest("[data-draft-review-open]");
    if (openBtn) {
      const id = openBtn.getAttribute("data-draft-review-open");
      await run(async () => { await openDetail(id); }, "Draft opened.");
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
      if (!window.confirm("Submit Amazing Apples + All About Me into the Draft Review Queue as drafts? Published lessons will not change.")) return;
      await run(async () => {
        await api("submit-seed-packages", {
          batchName: "Proof Two — Draft Review Queue",
          source: "cursor-agent",
        });
        await refreshList();
        if (typeof loadAdminSiteContent === "function") {
          await loadAdminSiteContent().catch(() => {});
        }
      }, "Seed packages submitted to Draft Review Queue.");
      return;
    }
    if (event.target.closest("[data-draft-review-preview-kit]")) {
      openPreviewKit();
      return;
    }
    const vp = event.target.closest("[data-draft-review-preview-viewport]");
    if (vp) {
      state.previewViewport = vp.getAttribute("data-draft-review-preview-viewport") || "desktop";
      openPreviewKit();
      return;
    }
    if (event.target.closest("[data-draft-review-open-editor]")) {
      openPreviewKit();
      return;
    }
    if (event.target.closest("[data-draft-review-compare]")) {
      await run(async () => {
        state.compare = await api("compare", { id: state.selectedId });
      }, "Compare ready.");
      return;
    }
    const resBtn = event.target.closest("[data-draft-review-open-resource]");
    if (resBtn) {
      const resourceId = resBtn.getAttribute("data-draft-review-open-resource");
      if (typeof openCurriculumResourceFile === "function") {
        openCurriculumResourceFile(resourceId);
      } else {
        const token = adminSession()?.token || "";
        window.open(`/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}&adminToken=${encodeURIComponent(token)}`, "_blank");
      }
      return;
    }
    if (event.target.closest("[data-draft-review-request-revision]")) {
      await run(async () => {
        await api("request-revision", {
          id: state.selectedId,
          reviewNotes: state.reviewNotes,
        });
        await openDetail(state.selectedId);
        await refreshList();
      }, "Marked Changes Requested.");
      return;
    }
    if (event.target.closest("[data-draft-review-discard]")) {
      if (!window.confirm("Discard this incoming draft? Published lesson stays unchanged. Draft printables will be archived.")) return;
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
      if (!window.confirm("Roll back enrichment draft to the pre-submit snapshot? Published lesson stays unchanged.")) return;
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
    if (event.target.matches("[data-draft-review-notes]")) {
      state.reviewNotes = event.target.value || "";
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-draft-review-filter]")) {
      state.filterStatus = event.target.value || "";
      render();
    }
  });

  global.LLHDraftReviewQueue = {
    mount,
    render,
    state,
    isOwner,
  };
})(typeof window !== "undefined" ? window : globalThis);
