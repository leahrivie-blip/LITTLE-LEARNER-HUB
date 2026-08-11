/**
 * Admin → Content → Draft Review Queue (owner workflow).
 * Open Review launches the real Teaching Kit Enrichment Editor for the queued draft.
 */
(function initCurriculumDraftReviewUi(global) {
  "use strict";

  const STATUS_ORDER = [
    "submitted", "in_review", "revision_requested", "revised",
    "ready_for_owner_approval", "approved", "published",
    "discarded", "rolled_back", "failed_validation",
  ];

  const STATUS_LABELS = {
    submitted: "Draft",
    in_review: "Ready for Owner Review",
    revision_requested: "Needs Changes",
    revised: "Ready for Owner Review",
    ready_for_owner_approval: "Ready for Owner Review",
    approved: "Approved",
    published: "Published",
    discarded: "Discarded",
    rolled_back: "Draft",
    failed_validation: "Blocked",
  };

  const PUBLISH_PHRASE = "PUBLISH TEACHING KIT";

  const state = {
    items: [],
    selectedId: "",
    detail: null,
    compare: null,
    preview: null,
    printableReview: null,
    printableViewers: {},
    imageReview: null,
    busy: false,
    loading: false,
    message: "",
    isSuccess: false,
    filterStatus: "",
    reviewNotes: "",
    previewViewport: "desktop",
    publishConfirm: "",
    publishPanelOpen: false,
    publishUnavailableReason: "Publish stays disabled while hard blockers remain.",
    publishConfirmPhrase: PUBLISH_PHRASE,
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function text(value) {
    return String(value || "").trim();
  }

  function isOwner() {
    try {
      if (typeof isTeachingKitPrintableOwnerClient === "function") {
        return isTeachingKitPrintableOwnerClient();
      }
      const session = typeof adminSession === "function" ? adminSession() : null;
      const email = String(session?.email || "").trim().toLowerCase();
      return [
        "leahivie@icloud.com",
        "leahrivie@icloud.com",
        "leahrivie@gmail.com",
        "little.learners.hub.customer@gmail.com",
      ].includes(email);
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
    if (data.publishConfirmPhrase) state.publishConfirmPhrase = data.publishConfirmPhrase;
  }

  async function openDetail(id) {
    state.selectedId = id;
    const data = await api("get", { id });
    state.detail = data;
    state.compare = null;
    state.preview = null;
    state.printableReview = null;
    state.printableViewers = {};
    state.imageReview = null;
    state.publishPanelOpen = false;
    state.publishConfirm = "";
    state.reviewNotes = data.entry?.reviewNotes || "";
    render();
  }

  function scoreCell(value) {
    if (value == null || value === "") return "—";
    return `${Number(value)}%`;
  }

  function formatDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "—";
    return raw.length >= 16 ? `${raw.slice(0, 10)} ${raw.slice(11, 16)}` : raw.slice(0, 10);
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

  function blockerDetails(item) {
    const details = item.blockerDetails || item.scores?.blockerDetails || [];
    if (details.length) return details;
    return (item.blockers || item.scores?.blockers || []).map((code) => ({ code, message: code }));
  }

  function blockersText(item) {
    const list = blockerDetails(item);
    return list.length ? list.slice(0, 4).map((b) => b.message || b.code).join("; ") : "None";
  }

  function notesStatus(item) {
    return text(item.reviewNotes) ? "Notes added" : "No notes yet";
  }

  function hardBlocked(item) {
    if (item.publishReady === true) return false;
    const details = blockerDetails(item);
    return details.length > 0 || /blocked/i.test(String(item.libraryStatus || ""));
  }

  function renderEmpty() {
    return `
      <div class="tk-draft-review-empty access-notice" role="status">
        <strong>No drafts waiting</strong>
        <p class="muted-copy">When Cursor upgrades a lesson, it appears here for your review. Published lessons stay unchanged until you Approve and Publish.</p>
        <button type="button" class="primary-button" data-draft-review-seed ${state.busy ? "disabled" : ""}>Submit seed (Apples + All About Me)</button>
      </div>
    `;
  }

  function renderRowStats(item) {
    return `
      <div><dt>Blockers</dt><dd>${esc(blockersText(item))}</dd></div>
      <div><dt>Activities</dt><dd>${Number(item.activityCount || item.changedActivities || 0)} total · +${Number(item.activitiesAdded || 0)} / −${Number(item.activitiesRemoved || 0)} / ↔${Number(item.activitiesReplaced || 0)} / keep ${Number(item.activitiesPreserved || 0)}</dd></div>
      <div><dt>Printables</dt><dd>${Number(item.printables || 0)} files · ${Number(item.printablePages || 0)} pages</dd></div>
      <div><dt>Images</dt><dd>${Number(item.requiredImages || 0)} required · ${Number(item.missingRequiredImages || 0)} missing</dd></div>
      <div><dt>Revision notes</dt><dd>${esc(notesStatus(item))}</dd></div>
      <div><dt>Last updated</dt><dd>${esc(formatDate(item.updatedAt || item.submittedAt))}</dd></div>
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
            <p class="muted-copy">${esc(item.age || "")} · ${esc(item.theme || "")} · Submitted ${esc(formatDate(item.submittedAt))}</p>
            <p class="tk-draft-review-card-meta"><span>Batch / rev</span><code>${esc(item.batchId || "—")} · r${esc(item.revisionNumber || 1)}</code></p>
            <p class="muted-copy">Published version: ${esc(item.publishedStatusLabel || item.publishedStatus || "—")}</p>
            <div class="tk-draft-score-row">
              ${scoreBadge("Structural", item.structuralScore)}
              ${scoreBadge("Premium", item.premiumScore)}
            </div>
            <dl class="tk-draft-review-card-stats">${renderRowStats(item)}</dl>
            <button type="button" class="primary-button tk-draft-open-review" data-draft-review-open-kit="${esc(item.id)}">Open Review</button>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderQueueTable(items) {
    const rows = items.map((item) => `
      <tr class="${state.selectedId === item.id ? "is-selected" : ""}">
        <td class="tk-draft-actions-col">
          <button type="button" class="primary-button" data-draft-review-open-kit="${esc(item.id)}">Open Review</button>
        </td>
        <td><strong>${esc(item.title || "Untitled")}</strong><br><small>${esc(item.lessonPlanId || "")}</small></td>
        <td>${esc(item.age || "")}</td>
        <td>${esc(item.theme || "")}</td>
        <td>${esc(formatDate(item.submittedAt))}</td>
        <td><code>${esc(item.batchId || "—")}</code><br><small>r${esc(item.revisionNumber || 1)}</small></td>
        <td>${statusBadge(item)}</td>
        <td>${esc(item.publishedStatusLabel || item.publishedStatus || "—")}</td>
        <td>${scoreBadge("S", item.structuralScore)} ${scoreBadge("P", item.premiumScore)}</td>
        <td class="tk-draft-blockers">${esc(blockersText(item))}</td>
        <td>${Number(item.activityCount || 0)} <small>(+${Number(item.activitiesAdded || 0)}/−${Number(item.activitiesRemoved || 0)}/↔${Number(item.activitiesReplaced || 0)})</small></td>
        <td>${Number(item.printables || 0)} / ${Number(item.printablePages || 0)}p</td>
        <td>${Number(item.requiredImages || 0)} req · ${Number(item.missingRequiredImages || 0)} miss</td>
        <td>${esc(notesStatus(item))}<br><small>${esc(formatDate(item.updatedAt))}</small></td>
      </tr>
    `).join("");
    return `
      <div class="admin-table-wrap tk-draft-review-table-wrap tk-draft-review-desktop-only">
        <table class="admin-table tk-draft-review-table">
          <thead>
            <tr>
              <th></th><th>Lesson</th><th>Age</th><th>Theme</th><th>Submitted</th><th>Batch / Rev</th>
              <th>Draft status</th><th>Published</th><th>Scores</th><th>Blockers</th>
              <th>Activities</th><th>Printables</th><th>Images</th><th>Notes / Updated</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="tk-draft-review-mobile-only">${renderMobileCards(items)}</div>
    `;
  }

  function renderBlockerList(entry) {
    const details = blockerDetails(entry);
    if (!details.length) return `<p class="muted-copy">No hard blockers.</p>`;
    return `
      <ul class="tk-draft-blocker-list">
        ${details.map((b) => `
          <li>
            <strong>${esc(b.message || b.code)}</strong>
            ${b.suggestion ? `<span class="muted-copy"> — ${esc(b.suggestion)}</span>` : ""}
            ${b.activityTitle || b.activityKey ? `
              <button type="button" class="ghost-button" data-draft-review-goto-activity="${esc(b.activityKey || "")}" data-activity-title="${esc(b.activityTitle || "")}">
                Open ${esc(b.activityTitle || "activity")}
              </button>` : ""}
          </li>
        `).join("")}
      </ul>
    `;
  }

  function renderPreviewPanel() {
    const preview = state.preview?.preview;
    if (!preview) return "";
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    return `
      <section class="tk-draft-preview-panel access-notice" aria-label="Owner Teaching Kit preview">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Owner-only preview · what customers would receive</p>
            <strong>${esc(preview.title || "")}</strong>
          </div>
          <button type="button" class="ghost-button" data-draft-review-close-preview>Close preview</button>
        </div>
        ${preview.overview ? `<div><h4>Overview</h4><p>${esc(preview.overview)}</p></div>` : ""}
        ${preview.objectives ? `<div><h4>Objectives</h4><p>${esc(preview.objectives)}</p></div>` : ""}
        ${preview.materials ? `<div><h4>Materials</h4><p>${esc(preview.materials)}</p></div>` : ""}
        <div><h4>Weekly Plan</h4>
          ${days.map((day) => {
            const d = preview.weekdays?.[day];
            if (!d) return "";
            return `<article class="tk-draft-preview-day"><h5>${esc(day)}</h5>
              ${d.theme ? `<p><strong>Focus:</strong> ${esc(d.theme)}</p>` : ""}
              ${(d.activities || []).map((a) => `<p>· ${esc(a.title)}${a.objective ? ` — ${esc(a.objective)}` : ""}</p>`).join("")}
            </article>`;
          }).join("")}
        </div>
        ${(preview.songs || []).length ? `<div><h4>Songs</h4>${preview.songs.map((s) => `<p>${esc(typeof s === "string" ? s : (s.title || JSON.stringify(s)))}</p>`).join("")}</div>` : ""}
        ${(preview.books || []).length ? `<div><h4>Books</h4>${preview.books.map((b) => `<p>${esc(b.title || b)}${b.author ? ` — ${esc(b.author)}` : ""}</p>`).join("")}</div>` : ""}
        ${preview.teacherToolkit ? `<div><h4>Teacher Toolkit</h4><p class="muted-copy">Toolkit present for this draft.</p></div>` : ""}
        ${preview.familyConnection ? `<div><h4>Family connection</h4><p>${esc(preview.familyConnection)}</p></div>` : ""}
        ${(preview.printables || []).length ? `<div><h4>Printables</h4>${preview.printables.map((p) => `<p>${esc(p.title)} (${esc(p.status)} · ${Number(p.pageCount || 0)} pages)</p>`).join("")}</div>` : ""}
        ${(preview.activities || []).some((a) => a.setupImageUrl || a.exampleImageUrl) ? `
          <div><h4>Example images</h4>
            <div class="tk-draft-image-grid">
              ${preview.activities.filter((a) => a.setupImageUrl || a.exampleImageUrl).map((a) => `
                <figure>
                  <img src="${esc(a.exampleImageUrl || a.setupImageUrl)}" alt="${esc(a.title)}" loading="lazy" />
                  <figcaption>${esc(a.title)}</figcaption>
                </figure>
              `).join("")}
            </div>
          </div>` : ""}
      </section>
    `;
  }

  function renderPrintablePanel() {
    const rows = state.printableReview?.printables || [];
    if (!state.printableReview) return "";
    const pdfApi = global.LLHCurriculumDraftPrintableReview;
    return `
      <section class="tk-draft-printable-panel access-notice" aria-label="Printable review">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Printable review</p>
            <strong>Every page must be visible</strong>
            <p class="muted-copy">Complete page count, thumbnails, large preview, zoom, download, and system print. Opening the file alone does not mark a printable reviewed.</p>
          </div>
          <button type="button" class="ghost-button" data-draft-review-close-printable>Close</button>
        </div>
        ${rows.length ? rows.map((r) => {
          const viewer = state.printableViewers[r.id];
          if (pdfApi && viewer) return pdfApi.renderCard(viewer);
          return `
            <article class="tk-draft-printable-card">
              <h4>${esc(r.title)}</h4>
              <p class="muted-copy">${esc(r.type)} · ${Number(r.pageCount || 0)} pages · loading page viewer…</p>
            </article>
          `;
        }).join("") : `<p class="muted-copy">No draft printables linked.</p>`}
      </section>
    `;
  }

  async function ensurePrintableViewers() {
    const pdfApi = global.LLHCurriculumDraftPrintableReview;
    const rows = state.printableReview?.printables || [];
    if (!pdfApi || !rows.length) return;
    for (const row of rows) {
      if (!state.printableViewers[row.id]) {
        state.printableViewers[row.id] = pdfApi.createViewerState(row);
      } else {
        state.printableViewers[row.id].printable = row;
      }
    }
    render();
    await Promise.all(rows.map(async (row) => {
      const viewer = state.printableViewers[row.id];
      if (!viewer || viewer.pdfDoc || viewer.loading || viewer.error) return;
      await pdfApi.loadDocument(viewer);
      if (viewer.pageCount && state.selectedId) {
        try {
          await pdfApi.persistProgress(api, state.selectedId, viewer);
        } catch { /* non-blocking */ }
      }
    }));
    render();
  }

  function renderImagePanel() {
    if (!state.imageReview) return "";
    const groups = state.imageReview.groups || [];
    const images = state.imageReview.images || [];
    return `
      <section class="tk-draft-image-panel access-notice" aria-label="Image review">
        <div class="section-heading">
          <div><p class="eyebrow">Image review</p><strong>All draft images</strong></div>
          <button type="button" class="ghost-button" data-draft-review-close-images>Close</button>
        </div>
        ${groups.map((group) => {
          const rows = images.filter((img) => img.group === group);
          if (!rows.length) return "";
          return `
            <div class="tk-draft-image-group">
              <h4>${esc(group)}</h4>
              <div class="tk-draft-image-grid">
                ${rows.map((img) => `
                  <figure>
                    ${img.url ? `<img src="${esc(img.thumbUrl || img.url)}" alt="${esc(img.altText || img.caption || "")}" loading="lazy" />` : `<div class="tk-draft-image-missing">Missing required image</div>`}
                    <figcaption>
                      <strong>${esc(img.caption || img.purpose)}</strong><br>
                      <small>${esc(img.linkedActivity || "—")} · ${esc(img.requirement)} · ${esc(img.status)}</small>
                      ${img.activityKey ? `<button type="button" class="ghost-button" data-draft-review-goto-activity="${esc(img.activityKey)}">Open activity</button>` : ""}
                    </figcaption>
                  </figure>
                `).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </section>
    `;
  }

  function renderComparePanel() {
    if (!state.compare?.compare) return "";
    const c = state.compare.compare;
    const readable = c.readable || {};
    const section = (label, rows) => rows?.length ? `
      <div><h5>${esc(label)}</h5>
        <ul>${rows.map((r) => `<li><strong>${esc(r.title)}</strong>${r.note ? ` — ${esc(r.note)}` : ""}</li>`).join("")}</ul>
      </div>` : "";
    return `
      <div class="tk-draft-review-compare access-notice">
        <strong>Compare vs published</strong>
        <p class="muted-copy">${esc((c.summaryLines || []).join(" · "))}</p>
        ${section("Added", readable.added)}
        ${section("Removed", readable.removed)}
        ${section("Replaced", readable.replaced)}
        ${section("Rewritten", readable.rewritten)}
        ${section("Improved", readable.improved)}
        ${section("Unchanged", readable.unchanged)}
      </div>
    `;
  }

  function renderPublishPanel(entry) {
    if (!state.publishPanelOpen) return "";
    const blocked = hardBlocked(entry);
    return `
      <section class="tk-draft-publish-panel access-notice" aria-label="Publish confirmation">
        <strong>Publish confirmation</strong>
        <p>Lesson: <strong>${esc(entry.title)}</strong> (${esc(entry.age)} · ${esc(entry.theme)})</p>
        <p class="muted-copy">Customer-visible after publish: Teaching Kit enrichment for this lesson${(entry.draftResourceIds || state.detail?.entry?.draftResourceIds || []).length ? " and approved draft printables (if you confirm below)" : ""}.</p>
        ${blocked ? `<p class="form-message error">Publish disabled — hard blockers remain.</p>` : ""}
        <label>Type <code>${esc(state.publishConfirmPhrase || PUBLISH_PHRASE)}</code> to confirm
          <input type="text" data-draft-review-publish-confirm value="${esc(state.publishConfirm)}" autocomplete="off" />
        </label>
        <label class="tk-draft-check">
          <input type="checkbox" data-draft-review-publish-printables /> Also publish approved draft printables
        </label>
        <div class="form-actions">
          <button type="button" class="ghost-button" data-draft-review-publish-cancel>Cancel</button>
          <button type="button" class="primary-button" data-draft-review-publish-confirm-btn ${blocked || state.busy ? "disabled" : ""}>Publish</button>
        </div>
      </section>
    `;
  }

  function renderDetail() {
    const data = state.detail;
    if (!data?.entry) return "";
    const entry = data.entry;
    const list = data.listItem || entry;
    const history = Array.isArray(data.revisionHistory) ? data.revisionHistory : [];
    return `
      <section class="tk-draft-review-detail access-notice" aria-label="Draft review detail">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Draft Review · ${esc(entry.statusLabel || STATUS_LABELS[entry.status] || entry.status)}</p>
            <strong>${esc(entry.title)}</strong>
            <p class="muted-copy">${esc(entry.age)} · ${esc(entry.theme)} · Submitted ${esc(formatDate(entry.submittedAt))} · Updated ${esc(formatDate(entry.updatedAt))}</p>
            <p class="muted-copy">Batch <code>${esc(entry.batchId || "—")}</code> · Revision <code>r${esc(entry.revisionNumber || 1)}</code> · ${esc(entry.revisionId || "")}</p>
            <p class="muted-copy">Published-version status: ${esc(list.publishedStatusLabel || entry.publishedStatus || "—")}</p>
            <p class="muted-copy">Canonical activities in this draft: <strong>${Number(data.activityCount || list.activityCount || 0)}</strong></p>
          </div>
          <div class="form-actions">
            <button type="button" class="ghost-button" data-draft-review-back-content>Back to Content Home</button>
            <button type="button" class="ghost-button" data-draft-review-close-detail>Back to queue</button>
          </div>
        </div>
        <div class="tk-draft-score-row" style="margin-bottom:0.75rem;">
          ${scoreBadge("Structural", entry.scores?.structuralScore ?? list.structuralScore)}
          ${scoreBadge("Premium", entry.scores?.premiumScore ?? list.premiumScore)}
          ${statusBadge(list)}
        </div>
        <p class="muted-copy">${esc(entry.scores?.note || "Scores are diagnostic only. Hard blockers control readiness. One owner status only — never Publish Ready while blocked.")}</p>
        <div><h4>Blockers</h4>${renderBlockerList(list)}</div>
        <div class="form-actions tk-draft-review-actions">
          <button type="button" class="primary-button" data-draft-review-open-editor>Open Review</button>
          <button type="button" class="primary-button" data-draft-review-preview>Preview Teaching Kit</button>
          <button type="button" class="ghost-button" data-draft-review-printables>Printable review</button>
          <button type="button" class="ghost-button" data-draft-review-images>Image review</button>
          <button type="button" class="ghost-button" data-draft-review-compare>Compare vs published</button>
          <button type="button" class="ghost-button" data-draft-review-save-edited ${state.busy ? "disabled" : ""}>Save edited draft</button>
          <button type="button" class="ghost-button" data-draft-review-mark-in-review ${state.busy ? "disabled" : ""}>Mark In Review</button>
          <button type="button" class="ghost-button" data-draft-review-ready ${state.busy ? "disabled" : ""}>Ready for Owner Approval</button>
        </div>
        ${renderPreviewPanel()}
        ${renderPrintablePanel()}
        ${renderImagePanel()}
        ${renderComparePanel()}
        <div>
          <h4>Revision history</h4>
          <ul class="tk-draft-revision-history">
            ${history.map((h) => `<li>${h.newest ? "<strong>Newest · </strong>" : ""}${esc(h.revisionId || "")} · r${esc(h.revisionNumber || "")} · ${esc(h.status || "")} · ${esc(formatDate(h.updatedAt))}${h.note ? ` — ${esc(h.note)}` : ""}</li>`).join("") || "<li class=\"muted-copy\">No prior versions</li>"}
          </ul>
        </div>
        <label class="tk-draft-notes-label">
          <span>Owner review notes</span>
          <textarea rows="4" data-draft-review-notes placeholder="What should change before the next revision?">${esc(state.reviewNotes || "")}</textarea>
        </label>
        <div class="form-actions tk-draft-review-actions">
          <button type="button" class="ghost-button" data-draft-review-add-notes ${state.busy ? "disabled" : ""}>Add review notes</button>
          <button type="button" class="primary-button" data-draft-review-request-revision ${state.busy ? "disabled" : ""}>Request revision</button>
          <button type="button" class="ghost-button" data-draft-review-discard ${state.busy ? "disabled" : ""}>Discard draft</button>
          <button type="button" class="ghost-button" data-draft-review-rollback ${state.busy ? "disabled" : ""}>Roll back draft</button>
        </div>
        <div class="form-actions tk-draft-review-actions">
          <button type="button" class="primary-button" data-draft-review-approve ${state.busy || hardBlocked(list) ? "disabled" : ""}>Approve</button>
          <button type="button" class="primary-button" data-draft-review-open-publish ${state.busy || entry.status !== "approved" || hardBlocked(list) ? "disabled" : ""}>Publish…</button>
        </div>
        <p class="muted-copy">${esc(state.publishUnavailableReason)}</p>
        ${renderPublishPanel(entry)}
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
            <p class="muted-copy">Open Review launches the real Teaching Kit editor for the exact queued draft.</p>
          </div>
          <button type="button" class="ghost-button" data-draft-review-back-content>Back to Content Home</button>
        </div>
        ${msg}
        ${loading}
        <div class="form-actions tk-draft-review-actions">
          <button type="button" class="primary-button" data-draft-review-refresh ${state.busy ? "disabled" : ""}>Refresh queue</button>
          <button type="button" class="ghost-button" data-draft-review-seed ${state.busy ? "disabled" : ""}>Submit seed (Apples + All About Me)</button>
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
    if (state.busy) {
      // Never silently ignore Open Review while a prior refresh/action is in flight.
      const started = Date.now();
      while (state.busy && Date.now() - started < 10000) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      if (state.busy) {
        state.message = "Still working on the previous action — try again in a moment.";
        state.isSuccess = false;
        render();
        return;
      }
    }
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
      // Keep Teaching Kit overlay on top; remounting the queue under it is fine, but
      // do not wipe the success/error message when the editor owns the screen.
      if (!(global.LLHTeachingKitEnrichmentEditor?.isOpen?.())) {
        render();
      } else {
        // Light status update only — avoid replacing DOM under an open editor unnecessarily.
        const host = document.querySelector("#adminDraftReviewQueueApp .form-message");
        if (host) {
          host.className = `form-message ${state.isSuccess ? "success" : "error"}`;
          host.textContent = state.message || "";
        }
      }
    }
  }

  async function mount() {
    if (!isOwner()) { render(); return; }
    await run(async () => { await refreshList(); }, "Queue loaded.");
  }

  function openTeachingKit(options = {}) {
    const lessonPlanId = state.detail?.entry?.lessonPlanId || state.detail?.lessonPlan?.id;
    const draftReviewId = state.detail?.entry?.id || state.selectedId;
    if (!lessonPlanId) {
      state.message = "Missing lesson id for this draft.";
      state.isSuccess = false;
      render();
      return false;
    }
    const enrichmentDraft = state.detail?.enrichmentDraft
      || state.detail?.entry?.enrichmentDraft
      || null;
    const lessonPlan = state.detail?.lessonPlan
      ? {
        ...state.detail.lessonPlan,
        enrichmentDraft: enrichmentDraft || state.detail.lessonPlan.enrichmentDraft || null,
      }
      : (typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(lessonPlanId) : null);
    if (!lessonPlan) {
      state.message = "Lesson shell missing for this draft. Refresh the queue and try Open Review again.";
      state.isSuccess = false;
      render();
      return false;
    }
    if (!enrichmentDraft && !options.allowMissingEnrichmentDraft) {
      state.message = "This queue item is missing its enrichment draft overlay.";
      state.isSuccess = false;
      render();
      return false;
    }
    const approvals = state.detail?.entry?.resourceApprovals || state.detail?.resourceApprovals || {};
    const printableApprovalStatuses = Object.values(approvals).map((row) => row?.status || "pending");
    const draftResourceIds = state.detail?.entry?.draftResourceIds
      || state.detail?.draftResourceIds
      || [];

    // Prefer the focused Lesson Review & Editor (one section at a time). Fall back to Enrichment Editor.
    if (global.LLHLessonReviewEditor?.open) {
      const openedReview = global.LLHLessonReviewEditor.open(lessonPlanId, {
        ownerDraftReview: true,
        draftReviewId,
        returnToQueue: true,
        enrichmentDraft,
        lessonPlan,
        draftResourceIds,
        resourceApprovals: approvals,
        sectionId: options.mode === "preview" ? "publish" : (options.sectionId || "basics"),
        ...options,
      });
      if (openedReview) {
        if (options.mode === "preview") {
          setTimeout(() => {
            document.querySelector('[data-lre-viewport="desktop"]')?.click?.();
          }, 200);
        }
        return true;
      }
    }

    if (!global.LLHTeachingKitEnrichmentEditor?.open) {
      state.message = "Lesson Review / Teaching Kit editor is not available in this build.";
      state.isSuccess = false;
      render();
      return false;
    }
    const opened = global.LLHTeachingKitEnrichmentEditor.open(lessonPlanId, {
      ownerDraftReview: true,
      draftReviewId,
      returnToQueue: true,
      printableApprovalStatuses,
      enrichmentDraft,
      lessonPlan,
      ...options,
    });
    if (opened === false) {
      state.message = "Could not open Teaching Kit editor for this draft. Confirm you are signed in as the owner and hard-refresh if the Enrichment Editor flag is off.";
      state.isSuccess = false;
      render();
      return false;
    }
    if (options.mode === "preview") {
      setTimeout(() => {
        document.querySelector('[data-enrich-mode="preview"]')?.click?.();
        document.querySelector(`[data-preview-viewport="${state.previewViewport}"]`)?.click?.();
      }, 450);
    }
    return true;
  }

  async function openReviewKit(id) {
    await openDetail(id);
    await api("mark-in-review", { id }).catch(() => {});
    // Ensure client curriculum includes the lesson shell; draft overlay comes from the queue entry.
    // Never hang Open Review on a slow/stalled admin content fetch.
    if (typeof loadAdminSiteContent === "function") {
      try {
        await Promise.race([
          loadAdminSiteContent(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("content_load_timeout")), 8000)),
        ]);
      } catch (_error) {
        /* open still uses queue draft / lessonPlan from detail */
      }
    }
    const opened = openTeachingKit();
    if (!opened) throw new Error(state.message || "Open Review failed.");
  }

  function goToContentHome() {
    try {
      if (global.LLHLessonReviewEditor?.isOpen?.()) {
        global.LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true });
      }
      if (global.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
        global.LLHTeachingKitEnrichmentEditor.close({
          force: true,
          abandonUnsaved: true,
          skipReturnNavigation: true,
        });
      }
    } catch (_error) { /* continue navigation */ }
    if (typeof setAdminGroup === "function") {
      setAdminGroup("content", { forceDefault: true });
      return;
    }
    if (typeof setAdminSectionTab === "function") {
      setAdminSectionTab("content-home");
    }
  }

  document.addEventListener("click", async (event) => {
    const openKit = event.target.closest("[data-draft-review-open-kit]");
    if (openKit) {
      const id = openKit.getAttribute("data-draft-review-open-kit");
      await run(async () => { await openReviewKit(id); }, "Opened Teaching Kit Review.");
      return;
    }
    if (event.target.closest("[data-draft-review-back-content]")) {
      event.preventDefault();
      goToContentHome();
      return;
    }
    if (event.target.closest("[data-draft-review-close-detail]")) {
      state.selectedId = "";
      state.detail = null;
      state.compare = null;
      state.preview = null;
      state.printableReview = null;
      state.imageReview = null;
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
          batchName: "Owner workflow seed — Apples + All About Me",
          source: "cursor-agent",
        });
        await refreshList();
        if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent().catch(() => {});
      }, "Seed packages submitted.");
      return;
    }
    if (event.target.closest("[data-draft-review-open-editor]")) {
      await run(async () => {
        const opened = openTeachingKit();
        if (!opened) throw new Error(state.message || "Open Review failed.");
      }, "Opened Lesson Review.");
      return;
    }
    if (event.target.closest("[data-draft-review-preview]")) {
      await run(async () => {
        state.preview = await api("preview", { id: state.selectedId });
        state.printableReview = null;
        state.imageReview = null;
      }, "Owner preview ready.");
      return;
    }
    if (event.target.closest("[data-draft-review-close-preview]")) {
      state.preview = null;
      render();
      return;
    }
    if (event.target.closest("[data-draft-review-printables]")) {
      await run(async () => {
        state.printableReview = await api("printable-review", { id: state.selectedId });
        state.printableViewers = {};
        state.preview = null;
        state.imageReview = null;
      }, "Printable review loaded.");
      await ensurePrintableViewers();
      return;
    }
    if (event.target.closest("[data-draft-review-close-printable]")) {
      state.printableReview = null;
      state.printableViewers = {};
      render();
      return;
    }

    const pdfApi = global.LLHCurriculumDraftPrintableReview;
    const pdfResource = (el) => el?.getAttribute?.("data-pdf-resource") || "";
    const viewerFor = (resourceId) => state.printableViewers[resourceId];

    const openPageBtn = event.target.closest("[data-pdf-open-page]");
    if (openPageBtn && pdfApi) {
      const resourceId = pdfResource(openPageBtn);
      const viewer = viewerFor(resourceId);
      if (viewer) {
        await pdfApi.openPage(viewer, openPageBtn.getAttribute("data-pdf-open-page"));
        render();
        await pdfApi.paintPreviewCanvas(viewer);
        await pdfApi.persistProgress(api, state.selectedId, viewer).catch(() => {});
        render();
      }
      return;
    }
    if (event.target.closest("[data-pdf-close]") && pdfApi) {
      const resourceId = pdfResource(event.target.closest("[data-pdf-close]"));
      const viewer = viewerFor(resourceId);
      if (viewer) {
        pdfApi.closePreview(viewer);
        await pdfApi.persistProgress(api, state.selectedId, viewer).catch(() => {});
        render();
      }
      return;
    }
    if (event.target.closest("[data-pdf-prev]") && pdfApi) {
      const resourceId = pdfResource(event.target.closest("[data-pdf-prev]"));
      const viewer = viewerFor(resourceId);
      if (viewer) {
        await pdfApi.openPage(viewer, Math.max(1, viewer.previewPage - 1));
        render();
        await pdfApi.paintPreviewCanvas(viewer);
        await pdfApi.persistProgress(api, state.selectedId, viewer).catch(() => {});
        render();
      }
      return;
    }
    if (event.target.closest("[data-pdf-next]") && pdfApi) {
      const resourceId = pdfResource(event.target.closest("[data-pdf-next]"));
      const viewer = viewerFor(resourceId);
      if (viewer) {
        await pdfApi.openPage(viewer, Math.min(viewer.pageCount, viewer.previewPage + 1));
        render();
        await pdfApi.paintPreviewCanvas(viewer);
        await pdfApi.persistProgress(api, state.selectedId, viewer).catch(() => {});
        render();
      }
      return;
    }
    if (event.target.closest("[data-pdf-zoom-in]") && pdfApi) {
      const resourceId = pdfResource(event.target.closest("[data-pdf-zoom-in]"));
      const viewer = viewerFor(resourceId);
      if (viewer) {
        viewer.zoom = Math.min(2.8, (viewer.zoom || 1) + 0.2);
        render();
        await pdfApi.paintPreviewCanvas(viewer);
      }
      return;
    }
    if (event.target.closest("[data-pdf-zoom-out]") && pdfApi) {
      const resourceId = pdfResource(event.target.closest("[data-pdf-zoom-out]"));
      const viewer = viewerFor(resourceId);
      if (viewer) {
        viewer.zoom = Math.max(0.6, (viewer.zoom || 1) - 0.2);
        render();
        await pdfApi.paintPreviewCanvas(viewer);
      }
      return;
    }
    const downloadBtn = event.target.closest("[data-pdf-download]");
    if (downloadBtn && pdfApi) {
      await pdfApi.downloadPdf(downloadBtn.getAttribute("data-pdf-download"));
      return;
    }
    const printBtn = event.target.closest("[data-pdf-print]");
    if (printBtn && pdfApi) {
      const resourceId = printBtn.getAttribute("data-pdf-print");
      const viewer = viewerFor(resourceId);
      if (viewer) {
        await pdfApi.systemPrint(viewer);
        await pdfApi.persistProgress(api, state.selectedId, viewer).catch(() => {});
        render();
      }
      return;
    }
    const checkEl = event.target.closest("[data-pdf-check]");
    if (checkEl) {
      const resourceId = checkEl.getAttribute("data-pdf-resource");
      const viewer = viewerFor(resourceId);
      if (viewer) {
        viewer.checklist[checkEl.getAttribute("data-pdf-check")] = Boolean(checkEl.checked);
        await pdfApi.persistProgress(api, state.selectedId, viewer).catch(() => {});
      }
      return;
    }
    if (event.target.closest("[data-draft-review-images]")) {
      await run(async () => {
        state.imageReview = await api("image-review", { id: state.selectedId });
        state.preview = null;
        state.printableReview = null;
      }, "Image review loaded.");
      return;
    }
    if (event.target.closest("[data-draft-review-close-images]")) {
      state.imageReview = null;
      render();
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
    if (event.target.closest("[data-draft-review-ready]")) {
      await run(async () => {
        await api("ready-for-approval", { id: state.selectedId, reviewNotes: state.reviewNotes });
        await openDetail(state.selectedId);
        await refreshList();
      }, "Marked Ready for Owner Approval.");
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
    const approvePrintable = event.target.closest("[data-draft-review-approve-printable]");
    if (approvePrintable) {
      const resourceId = approvePrintable.getAttribute("data-draft-review-approve-printable");
      const viewer = state.printableViewers[resourceId];
      if (viewer && pdfApi && !pdfApi.allPagesViewed(viewer)) {
        state.message = "Inspect every page before approving this printable.";
        state.isSuccess = false;
        render();
        return;
      }
      await run(async () => {
        if (viewer && pdfApi) {
          await pdfApi.persistProgress(api, state.selectedId, viewer).catch(() => {});
        }
        await api("approve-printable", { id: state.selectedId, resourceId, reviewNotes: state.reviewNotes });
        state.printableReview = await api("printable-review", { id: state.selectedId });
        await openDetail(state.selectedId);
        state.printableReview = await api("printable-review", { id: state.selectedId });
        await refreshList();
      }, "Printable approved after full page inspection.");
      ensurePrintableViewers();
      return;
    }
    const revisePrintable = event.target.closest("[data-draft-review-revise-printable]");
    if (revisePrintable) {
      const resourceId = revisePrintable.getAttribute("data-draft-review-revise-printable");
      await run(async () => {
        await api("request-printable-revision", {
          id: state.selectedId,
          resourceId,
          reviewNotes: state.reviewNotes || "Please revise this printable.",
        });
        state.printableReview = await api("printable-review", { id: state.selectedId });
        await openDetail(state.selectedId);
        await refreshList();
      }, "Printable revision requested.");
      return;
    }
    const gotoAct = event.target.closest("[data-draft-review-goto-activity]");
    if (gotoAct) {
      openTeachingKit();
      const key = gotoAct.getAttribute("data-draft-review-goto-activity");
      if (key) {
        setTimeout(() => {
          const match = Array.from(document.querySelectorAll("[data-enrich-activity-key], [data-activity-key]"))
            .find((el) => el.getAttribute("data-enrich-activity-key") === key || el.getAttribute("data-activity-key") === key);
          match?.click?.();
          match?.scrollIntoView?.({ block: "center" });
        }, 600);
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
      const isPublished = state.detail?.entry?.status === "published" || state.detail?.status === "published";
      const msg = isPublished
        ? "Roll back this published Teaching Kit? Customer-visible enrichment, printables, images, and links return to the previous set."
        : "Roll back to the prior draft version? Published lesson body stays unchanged.";
      if (!window.confirm(msg)) return;
      await run(async () => {
        await api("rollback", { id: state.selectedId });
        state.selectedId = "";
        state.detail = null;
        await refreshList();
        if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent().catch(() => {});
      }, isPublished ? "Published Teaching Kit rolled back to previous set." : "Rolled back.");
      return;
    }
    if (event.target.closest("[data-draft-review-approve]")) {
      await run(async () => {
        await api("approve", { id: state.selectedId, reviewNotes: state.reviewNotes });
        await openDetail(state.selectedId);
        await refreshList();
      }, "Draft approved.");
      return;
    }
    if (event.target.closest("[data-draft-review-open-publish]")) {
      state.publishPanelOpen = true;
      state.publishConfirm = "";
      render();
      return;
    }
    if (event.target.closest("[data-draft-review-publish-cancel]")) {
      state.publishPanelOpen = false;
      state.publishConfirm = "";
      render();
      return;
    }
    if (event.target.closest("[data-draft-review-publish-confirm-btn]")) {
      const publishPrintables = Boolean(document.querySelector("[data-draft-review-publish-printables]")?.checked);
      await run(async () => {
        await api("publish", {
          id: state.selectedId,
          confirmPhrase: state.publishConfirm,
          publishPrintables,
        });
        state.publishPanelOpen = false;
        state.publishConfirm = "";
        await openDetail(state.selectedId);
        await refreshList();
        if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent().catch(() => {});
      }, "Published.");
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-draft-review-notes]")) state.reviewNotes = event.target.value || "";
    if (event.target.matches("[data-draft-review-publish-confirm]")) state.publishConfirm = event.target.value || "";
  });

  document.addEventListener("change", async (event) => {
    if (event.target.matches("[data-draft-review-filter]")) {
      state.filterStatus = event.target.value || "";
      render();
      return;
    }
    if (event.target.matches("[data-pdf-replace-input]") && event.target.files?.[0]) {
      const resourceId = event.target.getAttribute("data-pdf-replace-input");
      const file = event.target.files[0];
      await run(async () => {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not read PDF file."));
          reader.readAsDataURL(file);
        });
        await api("replace-printable", {
          id: state.selectedId,
          resourceId,
          fileData: dataUrl,
          fileName: file.name,
        });
        delete state.printableViewers[resourceId];
        await openDetail(state.selectedId);
        state.printableReview = await api("printable-review", { id: state.selectedId });
      }, "Draft PDF replaced — lesson draft preserved. Re-inspect every page.");
      ensurePrintableViewers();
    }
  });

  global.LLHDraftReviewQueue = { mount, render, state, isOwner, openDetail, refreshList };
})(typeof window !== "undefined" ? window : globalThis);
