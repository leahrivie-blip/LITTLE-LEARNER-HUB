/**
 * Teaching Kit Enrichment Editor — admin focused workspace.
 * Slice 1: framework, navigation, progress, draft workflow.
 * Slice 2: Activity Studio foundation (placeholders + tips/subs/settings/obs/vocab).
 * Slice 3: Live Preview (real Teaching Kit viewer) + draft-to-provider parity.
 * Behind featureFlags.teachingKitEnrichmentEditor (default false).
 * Photo upload / AI / publish stay off until later slices.
 */
(function (root) {
  "use strict";

  const api = () => root.LLHTeachingKitEnrichment;
  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const DAY_LABEL = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri" };

  /** Capability gates — later slices flip these on behind review. */
  const SLICE = Object.freeze({
    activityStudio: true, // Slice 2
    livePreview: true, // Slice 3
    photoUpload: false,
    aiSuggest: false,
    publish: false,
  });
  // Back-compat alias used by earlier Slice 1 checks.
  const SLICE1 = SLICE;

  const state = {
    open: false,
    planId: "",
    mode: "activities", // activities | week | preview
    activityIndex: 0,
    dayFilter: "all",
    draft: { activities: {}, week: {}, updatedAt: "", lastEditedBy: "", previewReady: false },
    autosaveTimer: null,
    dirty: false,
    jumpQuery: "",
    jumpOpen: false,
    lightboxUrl: "",
    publishOpen: false,
    statusText: "",
    summaryOpen: true,
    previewViewport: "desktop", // desktop | tablet | mobile
    previewDay: "monday",
    previewUnbind: null,
  };

  function isEditorFlagEnabled() {
    const flags = (typeof effectiveSiteContent === "function" ? effectiveSiteContent() : null)?.featureFlags || {};
    if (root.LLHTeachingKit?.isTeachingKitEnrichmentEditorEnabled) {
      return root.LLHTeachingKit.isTeachingKitEnrichmentEditorEnabled(flags) === true;
    }
    return flags.teachingKitEnrichmentEditor === true;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function host() {
    return document.querySelector("#adminTeachingKitEnrichmentHost");
  }

  function getPlan() {
    if (typeof curriculumLessonPlanById === "function") return curriculumLessonPlanById(state.planId);
    return null;
  }

  function getActivities(plan) {
    const enrich = api();
    const storeActs = typeof curriculumActivitiesForLesson === "function"
      ? curriculumActivitiesForLesson(plan.id)
      : [];
    return enrich.flattenLessonActivities(plan, storeActs);
  }

  function draftKey(act) {
    return String(act.id || act.itemId || "").trim();
  }

  function ensureDraftActivity(key) {
    if (!state.draft.activities[key]) state.draft.activities[key] = {};
    return state.draft.activities[key];
  }

  function recomputePercent(plan, activities) {
    return api().computeCompletionPercent(plan, activities, state.draft);
  }

  function markDirty() {
    state.dirty = true;
    state.statusText = "Unsaved changes…";
    scheduleAutosave();
    renderChromeOnly();
    schedulePreviewRefresh();
  }

  function schedulePreviewRefresh() {
    if (!SLICE.livePreview) return;
    clearTimeout(state._previewTimer);
    state._previewTimer = setTimeout(() => {
      const plan = getPlan();
      if (!plan) return;
      paintLivePreview(plan, getActivities(plan));
    }, 160);
  }

  function scheduleAutosave() {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => {
      void saveDraft({ silent: true });
    }, 1200);
  }

  async function saveDraft({ silent = false } = {}) {
    const plan = getPlan();
    if (!plan) return;
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    const endpoint = root.curriculumLessonPlanConfig?.endpoint || "/api/admin/curriculum/lesson-plans";
    if (!token) {
      state.statusText = "Admin unlock required to save draft.";
      renderChromeOnly();
      return;
    }
    const activities = getActivities(plan);
    state.draft.completionPercent = recomputePercent(plan, activities);
    state.draft.updatedAt = new Date().toISOString();
    const admin = typeof adminSession === "function" ? adminSession() : null;
    state.draft.lastEditedBy = String(admin?.email || admin?.name || state.draft.lastEditedBy || "admin").trim();
    try {
      const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
        ? curriculumExpectedUpdatedAt()
        : "";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          saveMode: "enrichment_draft",
          expectedUpdatedAt,
          lessonPlan: {
            id: plan.id,
            enrichmentDraft: state.draft,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (data.curriculum && typeof applyCurriculumState === "function") {
        applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
      }
      state.dirty = false;
      state.statusText = silent
        ? `Draft autosaved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Draft saved. Published lesson unchanged until you Publish.";
      render();
    } catch (error) {
      state.statusText = `Draft save failed: ${error.message || error}`;
      renderChromeOnly();
    }
  }

  async function publishEnrichment() {
    const plan = getPlan();
    if (!plan) return;
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    const endpoint = root.curriculumLessonPlanConfig?.endpoint || "/api/admin/curriculum/lesson-plans";
    await saveDraft({ silent: true });
    const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
      ? curriculumExpectedUpdatedAt()
      : "";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        saveMode: "publish_enrichment",
        expectedUpdatedAt,
        lessonPlan: { id: plan.id, enrichmentDraft: state.draft },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (data.curriculum && typeof applyCurriculumState === "function") {
      applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
    }
    state.draft = { activities: {}, week: {}, updatedAt: "", previewReady: false };
    state.publishOpen = false;
    state.statusText = "Published enrichment to providers.";
    render();
    if (typeof showActionFeedback === "function") {
      showActionFeedback("Teaching Kit enrichment published for this lesson.");
    }
  }

  function open(planId) {
    if (!isEditorFlagEnabled()) {
      if (typeof showActionFeedback === "function") {
        showActionFeedback("Enrichment Editor is disabled (feature flag off).");
      }
      return;
    }
    const plan = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(planId) : null;
    if (!plan) return;
    state.open = true;
    state.planId = planId;
    state.mode = "activities";
    state.dayFilter = "all";
    state.jumpOpen = false;
    state.jumpQuery = "";
    state.lightboxUrl = "";
    state.publishOpen = false;
    state.draft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
      : { activities: {}, week: {}, updatedAt: "", lastEditedBy: "", previewReady: false };
    if (!state.draft.activities) state.draft.activities = {};
    if (!state.draft.week) state.draft.week = {};
    state.summaryOpen = true;
    state.previewViewport = "desktop";
    state.previewDay = "monday";
    const activities = getActivities(plan);
    state.activityIndex = api().firstIncompleteActivityIndex(activities, state.draft.activities);
    const first = activities[state.activityIndex];
    if (first?.dayOfWeek) state.previewDay = String(first.dayOfWeek);
    document.body.classList.add("tk-enrich-open");
    render();
  }

  function close() {
    clearTimeout(state.autosaveTimer);
    clearTimeout(state._previewTimer);
    if (typeof state.previewUnbind === "function") {
      try { state.previewUnbind(); } catch (_error) { /* ignore */ }
    }
    state.previewUnbind = null;
    if (state.dirty) void saveDraft({ silent: true });
    state.open = false;
    document.body.classList.remove("tk-enrich-open");
    const el = host();
    if (el) el.innerHTML = "";
    if (typeof renderAdminCurriculumLessonPlanManager === "function") {
      renderAdminCurriculumLessonPlanManager();
    }
  }

  function filteredActivities(activities) {
    if (state.dayFilter === "all") return activities;
    return activities.filter((a) => String(a.dayOfWeek) === state.dayFilter);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }

  async function applyPhoto(key, field, file) {
    if (!file || !/^image\//i.test(file.type || "")) return;
    const dataUrl = await readFileAsDataUrl(file);
    ensureDraftActivity(key)[field] = dataUrl;
    markDirty();
    render();
  }

  function photoZoneHtml(label, field, url, key) {
    const has = Boolean(url);
    if (!SLICE.photoUpload) {
      return `
        <div class="tk-enrich-photo is-readonly" data-photo-field="${esc(field)}" data-photo-key="${esc(key)}">
          <div class="tk-enrich-photo-label">${esc(label)}</div>
          <div class="tk-enrich-photo-drop ${has ? "has-photo" : ""}" aria-label="${esc(label)}">
            ${has
              ? `<img src="${esc(url)}" alt="${esc(label)}" />`
              : `<span class="tk-enrich-photo-empty">${esc(label)} placeholder<br><small>Upload arrives in a later slice</small></span>`}
          </div>
          ${has ? `<div class="tk-enrich-photo-actions"><button type="button" class="ghost-button" data-photo-preview>Full size</button></div>` : ""}
        </div>
      `;
    }
    return `
      <div class="tk-enrich-photo" data-photo-field="${esc(field)}" data-photo-key="${esc(key)}">
        <div class="tk-enrich-photo-label">${esc(label)}</div>
        <div class="tk-enrich-photo-drop ${has ? "has-photo" : ""}" tabindex="0" role="button" aria-label="${esc(label)}">
          ${has
            ? `<img src="${esc(url)}" alt="${esc(label)}" />`
            : `<span class="tk-enrich-photo-empty">Drop photo or click to upload</span>`}
          <input type="file" accept="image/*" hidden />
        </div>
        <div class="tk-enrich-photo-actions">
          ${has ? `
            <button type="button" class="ghost-button" data-photo-preview>Full size</button>
            <button type="button" class="ghost-button" data-photo-replace>Replace</button>
            <button type="button" class="ghost-button" data-photo-remove>Remove</button>
          ` : `<button type="button" class="ghost-button" data-photo-replace>Upload</button>`}
        </div>
      </div>
    `;
  }

  function formatEditedDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function yn(missing) {
    return missing ? "Missing" : "Ready";
  }

  function renderUpgradeSummary(plan, activities) {
    const summary = api().buildUpgradeSummary(plan, activities, state.draft);
    const rows = [
      ["incomplete", "Incomplete activities", String(summary.incompleteActivities), summary.incompleteActivities > 0],
      ["setup", "Missing setup photos", String(summary.missingSetupPhotos), summary.missingSetupPhotos > 0],
      ["example", "Missing finished example photos", String(summary.missingExamplePhotos), summary.missingExamplePhotos > 0],
      ["tips", "Missing teacher tips", String(summary.missingTeacherTips), summary.missingTeacherTips > 0],
      ["observations", "Missing observation prompts", String(summary.missingObservationPrompts), summary.missingObservationPrompts > 0],
      ["family", "Missing family connections", yn(summary.missingFamilyConnection), summary.missingFamilyConnection],
      ["printables", "Missing printables", yn(summary.missingPrintables), summary.missingPrintables],
      ["books", "Missing books", yn(summary.missingBooks), summary.missingBooks],
      ["songs", "Missing songs", yn(summary.missingSongs), summary.missingSongs],
      ["vocabulary", "Missing vocabulary", yn(summary.missingVocabulary), summary.missingVocabulary],
      ["objectives", "Missing learning objectives", yn(summary.missingLearningObjectives), summary.missingLearningObjectives],
      ["materials", "Missing materials", yn(summary.missingMaterials), summary.missingMaterials],
    ];
    return `
      <aside class="tk-enrich-summary ${state.summaryOpen ? "is-open" : "is-collapsed"}" data-upgrade-summary>
        <div class="tk-enrich-summary-head">
          <div>
            <p class="eyebrow">Upgrade Summary</p>
            <strong>${esc(summary.completenessLabel)} · ${summary.completionPercent}%</strong>
          </div>
          <button type="button" class="ghost-button" data-summary-toggle>${state.summaryOpen ? "Hide" : "Show"}</button>
        </div>
        ${state.summaryOpen ? `
          <div class="tk-enrich-summary-stepper" aria-hidden="true">
            <span class="${summary.completionPercent < 50 ? "is-active" : "is-done"}">Legacy</span>
            <span class="${summary.completionPercent >= 50 && summary.completionPercent < 90 ? "is-active" : summary.completionPercent >= 90 ? "is-done" : ""}">Enriched</span>
            <span class="${summary.completionPercent >= 90 ? "is-active" : ""}">Complete</span>
          </div>
          <div class="tk-enrich-bar" aria-hidden="true"><i style="width:${summary.completionPercent}%"></i></div>
          <dl class="tk-enrich-summary-list">
            ${rows.map(([jump, label, value, warn]) => `
              <div class="tk-enrich-summary-row ${warn ? "is-missing" : "is-ready"}">
                <dt><button type="button" data-summary-jump="${jump}">${esc(label)}</button></dt>
                <dd>${esc(value)}</dd>
              </div>
            `).join("")}
            <div class="tk-enrich-summary-row">
              <dt>Last edited</dt>
              <dd>${esc(formatEditedDate(summary.lastEditedDate))}</dd>
            </div>
            <div class="tk-enrich-summary-row">
              <dt>Last edited by</dt>
              <dd>${esc(summary.lastEditedBy || "—")}</dd>
            </div>
            <div class="tk-enrich-summary-row">
              <dt>Draft or Published</dt>
              <dd>${esc(summary.draftOrPublished)}</dd>
            </div>
          </dl>
          <p class="muted-copy tk-enrich-summary-note">Guidance only — never blocks saving a draft.</p>
        ` : ""}
      </aside>
    `;
  }

  function renderChrome(plan, activities, percent, label) {
    const isPublished = ["published", "featured"].includes(String(plan.status || "").toLowerCase());
    const n = activities.length;
    const idx = Math.min(state.activityIndex, Math.max(0, n - 1));
    return `
      <header class="tk-enrich-chrome">
        <div class="tk-enrich-chrome-top">
          <button type="button" class="ghost-button" data-enrich-exit>← ${esc(plan.title || "Lesson")}</button>
          <div class="tk-enrich-progress-block">
            <div class="tk-enrich-stepper">
              <span class="${percent < 50 ? "is-active" : "is-done"}">Legacy</span>
              <span class="${percent >= 50 && percent < 90 ? "is-active" : percent >= 90 ? "is-done" : ""}">Enriched</span>
              <span class="${percent >= 90 ? "is-active" : ""}">Complete</span>
            </div>
            <div class="tk-enrich-percent-row">
              <strong>Overall ${percent}%</strong>
              <div class="tk-enrich-bar" aria-hidden="true"><i style="width:${percent}%"></i></div>
              <span class="tag">${esc(label)}</span>
            </div>
          </div>
          <div class="tk-enrich-chrome-actions">
            <button type="button" class="ghost-button" data-summary-toggle>Upgrade Summary</button>
            <button type="button" class="primary-button" data-enrich-save-draft>Save draft</button>
            ${SLICE1.publish
              ? `<button type="button" class="primary-button" data-enrich-publish>Publish…</button>`
              : `<button type="button" class="ghost-button" disabled title="Publishing arrives in a later slice">Publish…</button>`}
          </div>
        </div>
        <div class="tk-enrich-chrome-sub">
          <div class="tk-enrich-counter">
            <strong>Activity ${n ? idx + 1 : 0} of ${n}</strong>
            <button type="button" class="ghost-button" data-enrich-prev ${idx <= 0 ? "disabled" : ""}>← Previous</button>
            <button type="button" class="ghost-button" data-enrich-next ${idx >= n - 1 ? "disabled" : ""}>Next →</button>
          </div>
          <div class="tk-enrich-jump">
            <button type="button" class="ghost-button" data-enrich-jump-toggle>Jump to…</button>
            ${state.jumpOpen ? `
              <div class="tk-enrich-jump-panel">
                <input type="search" data-enrich-jump-input placeholder="Activity, book, song, printable…" value="${esc(state.jumpQuery)}" />
                <div class="tk-enrich-jump-results" data-enrich-jump-results></div>
              </div>
            ` : ""}
          </div>
          <p class="tk-enrich-status">${esc(state.statusText || "Draft autosave on")}</p>
        </div>
        ${isPublished ? `
          <div class="tk-enrich-published-banner" role="status">
            Your changes are being saved as a draft. The published lesson will remain unchanged until you choose Publish.
          </div>
        ` : ""}
        <div class="tk-enrich-slice-banner" role="status">
          Slice 3 Live Preview: same Teaching Kit renderer providers use, driven by your current draft. Photo upload, AI, and Publish stay off until later reviewed slices.
        </div>
        <nav class="tk-enrich-modes" role="tablist">
          <button type="button" class="${state.mode === "activities" ? "is-active" : ""}" data-enrich-mode="activities">Activities</button>
          <button type="button" class="${state.mode === "week" ? "is-active" : ""}" data-enrich-mode="week">Week</button>
          <button type="button" class="${state.mode === "preview" ? "is-active" : ""}" data-enrich-mode="preview">Live Preview</button>
        </nav>
      </header>
    `;
  }

  function renderActivityMode(plan, activities) {
    const enrich = api();
    const current = activities[state.activityIndex] || null;
    const byDay = WEEKDAYS.map((day) => ({
      day,
      items: activities.filter((a) => a.dayOfWeek === day),
    }));
    const queue = state.dayFilter === "all"
      ? activities
      : activities.filter((a) => a.dayOfWeek === state.dayFilter);

    let stage = `<div class="empty-state">No activities on this lesson yet.</div>`;
    if (current) {
      const key = draftKey(current);
      const view = enrich.activityEnrichmentView(current, state.draft.activities[key]);
      const tags = new Set(view.settingTags);
      stage = `
        <article class="tk-enrich-stage" data-activity-key="${esc(key)}" data-activity-studio>
          <h3 data-enrich-title>${esc(current.title)}</h3>
          <p class="muted-copy">${esc(DAY_LABEL[current.dayOfWeek] || current.dayOfWeek)} · ${esc(current.activityCategory || "Activity")}</p>
          <div class="tk-enrich-photo-grid">
            ${photoZoneHtml("Setup photo (before)", "setupImageUrl", view.setupImageUrl, key)}
            ${photoZoneHtml("Finished example (after)", "exampleImageUrl", view.exampleImageUrl, key)}
          </div>
          <section class="tk-enrich-card-block">
            <h4>Group &amp; setting</h4>
            <p class="muted-copy">Small-group / large-group ideas and indoor / outdoor options.</p>
            <div class="tk-enrich-chips" data-setting-tags>
              ${[["small_group", "Small group"], ["large_group", "Large group"], ["indoor", "Indoor"], ["outdoor", "Outdoor"]].map(([id, label]) => `
                <button type="button" class="tk-enrich-chip ${tags.has(id) ? "is-on" : ""}" data-setting-tag="${id}">${label}</button>
              `).join("")}
            </div>
          </section>
          <section class="tk-enrich-card-block">
            <div class="tk-enrich-card-head">
              <h4>Teacher tips</h4>
              ${SLICE.aiSuggest
                ? `<button type="button" class="ghost-button" data-ai-tips>Suggest</button>`
                : `<span class="muted-copy">AI suggest later</span>`}
            </div>
            <div class="tk-enrich-tip-list">
              ${view.teacherTips.map((tip, i) => `
                <div class="tk-enrich-tip-card">
                  <span>${esc(tip)}</span>
                  <button type="button" data-tip-remove="${i}" aria-label="Remove tip">×</button>
                </div>
              `).join("") || `<p class="muted-copy">Add a short classroom tip.</p>`}
            </div>
            <form class="tk-enrich-inline-add" data-tip-add>
              <input type="text" maxlength="280" placeholder="Add a tip (one line)" />
              <button class="ghost-button" type="submit">Add</button>
            </form>
          </section>
          <section class="tk-enrich-card-block">
            <h4>Supply substitutions</h4>
            <div class="tk-enrich-sub-list">
              ${view.substitutions.map((sub, i) => `
                <div class="tk-enrich-tip-card">
                  <span>No <strong>${esc(sub.need)}</strong> → use <strong>${esc(sub.use)}</strong></span>
                  <button type="button" data-sub-remove="${i}">×</button>
                </div>
              `).join("") || `<p class="muted-copy">Add classroom-friendly swaps.</p>`}
            </div>
            <form class="tk-enrich-inline-add" data-sub-add>
              <input name="need" type="text" placeholder="If missing…" maxlength="120" />
              <input name="use" type="text" placeholder="Use instead…" maxlength="120" />
              <button class="ghost-button" type="submit">Add</button>
            </form>
          </section>
          <section class="tk-enrich-card-block">
            <h4>Observation prompts</h4>
            <div class="tk-enrich-tip-list">
              ${view.observationPrompts.map((prompt, i) => `
                <div class="tk-enrich-tip-card">
                  <span>${esc(prompt)}</span>
                  <button type="button" data-obs-remove="${i}" aria-label="Remove prompt">×</button>
                </div>
              `).join("") || `<p class="muted-copy">Add what to watch for during this activity.</p>`}
            </div>
            <form class="tk-enrich-inline-add" data-obs-add>
              <input type="text" maxlength="280" placeholder="Add an observation prompt" />
              <button class="ghost-button" type="submit">Add</button>
            </form>
          </section>
          <section class="tk-enrich-card-block">
            <h4>Vocabulary for this activity</h4>
            <div class="tk-enrich-vocab-list">
              ${view.vocabulary.map((word, i) => `
                <span class="tk-enrich-vocab-chip">
                  ${esc(word)}
                  <button type="button" data-vocab-remove="${i}" aria-label="Remove ${esc(word)}">×</button>
                </span>
              `).join("") || `<p class="muted-copy">Add words children will hear and use.</p>`}
            </div>
            <form class="tk-enrich-inline-add" data-vocab-add>
              <input type="text" maxlength="80" placeholder="Add a vocabulary word" />
              <button class="ghost-button" type="submit">Add</button>
            </form>
          </section>
          <div class="tk-enrich-stage-nav">
            <button type="button" class="ghost-button" data-enrich-prev>← Previous</button>
            <button type="button" class="ghost-button" data-enrich-skip>Skip for now</button>
            <button type="button" class="primary-button" data-enrich-save-next>Save &amp; next →</button>
          </div>
        </article>
      `;
    }

    return `
      <div class="tk-enrich-activity-layout ${SLICE.livePreview ? "" : "is-slice1"}">
        <aside class="tk-enrich-queue">
          <div class="tk-enrich-day-chips">
            <button type="button" class="${state.dayFilter === "all" ? "is-on" : ""}" data-day-filter="all">All</button>
            ${WEEKDAYS.map((day) => `
              <button type="button" class="${state.dayFilter === day ? "is-on" : ""}" data-day-filter="${day}">${DAY_LABEL[day]}</button>
            `).join("")}
          </div>
          <ul class="tk-enrich-queue-list">
            ${queue.map((act) => {
              const key = draftKey(act);
              const status = enrich.activityStatus(act, state.draft.activities[key]);
              const globalIndex = activities.findIndex((a) => draftKey(a) === key);
              return `
                <li>
                  <button type="button" class="tk-enrich-queue-item status-${status} ${globalIndex === state.activityIndex ? "is-active" : ""}" data-activity-index="${globalIndex}">
                    <span class="tk-enrich-status-dot" title="${esc(enrich.activityStatusLabel(status))}"></span>
                    <span>
                      <strong>${esc(act.title)}</strong>
                      <small>${esc(DAY_LABEL[act.dayOfWeek] || "")} · ${esc(enrich.activityStatusLabel(status))}</small>
                    </span>
                  </button>
                </li>
              `;
            }).join("")}
          </ul>
        </aside>
        <div class="tk-enrich-stage-wrap">${stage}</div>
        ${SLICE1.livePreview ? `<aside class="tk-enrich-live" data-enrich-live-preview></aside>` : ""}
      </div>
    `;
  }

  function renderWeekMode(plan) {
    const week = state.draft.week || {};
    const milestones = Array.isArray(week.milestones) ? week.milestones : [];
    const bank = ["Sorting", "Fine motor", "Language", "Social-emotional", "Gross motor", "Creativity", "Self-help"];
    return `
      <div class="tk-enrich-week-layout">
        <section class="tk-enrich-card-block">
          <h4>Family connection</h4>
          <p class="muted-copy">Current text is kept unless you replace it here.</p>
          ${plan.familyConnection ? `<div class="tk-enrich-current-text">${esc(plan.familyConnection)}</div>` : ""}
          <textarea data-week-family rows="3" placeholder="Optional draft family idea…">${esc(week.familyConnection || "")}</textarea>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Milestones</h4>
          <div class="tk-enrich-chips">
            ${bank.map((m) => `
              <button type="button" class="tk-enrich-chip ${milestones.includes(m) ? "is-on" : ""}" data-milestone="${esc(m)}">${esc(m)}</button>
            `).join("")}
          </div>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Completeness checklist (guidance only)</h4>
          <p class="muted-copy">Never blocks saving a draft. Use it to aim for Complete.</p>
          <ul class="tk-enrich-checklist">
            <li>Cover & week story</li>
            <li>Photos on highlight activities</li>
            <li>Books & songs</li>
            <li>Family idea</li>
            <li>Teacher tips</li>
            <li>Printable linked</li>
            <li>Supply substitutions / group options</li>
          </ul>
          <label class="tk-enrich-check-row">
            <input type="checkbox" data-preview-ready ${week.previewReady || state.draft.previewReady ? "checked" : ""} />
            Preview looks ready
          </label>
        </section>
      </div>
    `;
  }

  function renderPreviewMode() {
    if (!SLICE.livePreview) {
      return `
        <div class="tk-enrich-preview-full">
          <div class="empty-state">
            <strong>Live Preview comes in a later slice.</strong>
          </div>
        </div>
      `;
    }
    return `
      <div class="tk-enrich-preview-full">
        <div class="tk-enrich-draft-preview-label" role="status">
          <strong>Draft Preview</strong>
          <span>Same Teaching Kit UI providers see — driven by your current draft. The published lesson is unchanged until you Publish.</span>
        </div>
        <div class="tk-enrich-preview-toolbar">
          <div class="tk-enrich-preview-viewports" role="group" aria-label="Preview viewport">
            ${[["desktop", "Desktop"], ["tablet", "Tablet"], ["mobile", "Mobile"]].map(([id, label]) => `
              <button type="button" class="${state.previewViewport === id ? "is-on" : ""}" data-preview-viewport="${id}">${label}</button>
            `).join("")}
          </div>
          <div class="tk-enrich-preview-days" role="group" aria-label="Preview day">
            ${WEEKDAYS.map((day) => `
              <button type="button" class="${state.previewDay === day ? "is-on" : ""}" data-preview-day="${day}">${DAY_LABEL[day]}</button>
            `).join("")}
          </div>
        </div>
        <div class="tk-enrich-preview-frame is-${esc(state.previewViewport)}">
          <div data-enrich-live-preview class="tk-enrich-live is-wide"></div>
        </div>
      </div>
    `;
  }

  function renderPublishModal(plan, activities) {
    if (!state.publishOpen) return "";
    const summary = api().summarizePublishChanges(plan, activities, state.draft);
    return `
      <div class="tk-enrich-modal" data-publish-modal>
        <div class="tk-enrich-modal-card">
          <h3>Publish enrichment?</h3>
          <ul class="tk-enrich-publish-summary">
            <li><strong>What changed:</strong> ${summary.photoChanges} photo update(s), ${summary.tipChanges} tip update(s)</li>
            <li><strong>Updates a published lesson?</strong> ${summary.isPublished ? "Yes — providers will see enrichment after publish" : "No — lesson is not published"}</li>
            <li><strong>Linked activities affected:</strong> ${summary.linkedActivitiesAffected}</li>
            <li><strong>Teaching Kit completeness:</strong> ${esc(summary.labelBefore)} ${summary.completionBefore}% → ${esc(summary.labelAfter)} ${summary.completionAfter}%</li>
          </ul>
          <div class="form-actions">
            <button type="button" class="ghost-button" data-publish-cancel>Cancel</button>
            <button type="button" class="primary-button" data-publish-confirm>Publish updates to providers</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLightbox() {
    if (!state.lightboxUrl) return "";
    return `
      <div class="tk-enrich-lightbox" data-lightbox>
        <button type="button" class="ghost-button" data-lightbox-close>Close</button>
        <img src="${esc(state.lightboxUrl)}" alt="Full size preview" />
      </div>
    `;
  }

  function paintLivePreview(plan, activities) {
    const nodes = document.querySelectorAll("[data-enrich-live-preview]");
    if (!nodes.length || !SLICE.livePreview) return;
    const viewer = root.LLHTeachingKitViewer;
    const kitApi = root.LLHTeachingKit;
    const enrich = api();
    if (!viewer || !kitApi || !enrich) {
      nodes.forEach((node) => {
        node.innerHTML = `<p class="muted-copy">Teaching Kit viewer unavailable.</p>`;
      });
      return;
    }
    if (typeof state.previewUnbind === "function") {
      try { state.previewUnbind(); } catch (_error) { /* ignore */ }
      state.previewUnbind = null;
    }
    let model;
    try {
      const resources = typeof effectiveCurriculum === "function"
        ? (effectiveCurriculum().resources || []).filter((r) => (plan.resourceIds || []).includes(r.id))
        : [];
      model = enrich.buildTeachingKitPreviewModel(
        plan,
        activities,
        resources,
        state.draft,
        { day: state.previewDay || "monday", includeEmptySections: false },
        kitApi.mapLessonPlanToTeachingKit.bind(kitApi),
      );
    } catch (error) {
      nodes.forEach((node) => {
        node.innerHTML = `<p class="muted-copy">Draft Preview could not render. Legacy lesson is unchanged. ${esc(error.message || error)}</p>`;
      });
      return;
    }
    const teachingKit = {
      ...model.draftKit,
      locked: false,
      ok: model.draftKit?.ok !== false,
    };
    // Fail closed: empty/malformed draft kits never throw into the shell.
    if (!teachingKit.companion) {
      nodes.forEach((node) => {
        node.innerHTML = `<p class="muted-copy">Draft Preview has no companion surface yet. The published Teaching Kit is unchanged.</p>`;
      });
      return;
    }
    const previewActs = teachingKit?.companion?.activities || [];
    const firstEnriched = state.mode === "preview"
      ? previewActs.find((activity) =>
        (activity.teacherPrompts || []).some((prompt) => String(prompt?.text || "").trim())
        || (activity.supplySubstitutions || []).length)
      : null;

    nodes.forEach((node) => {
      node.innerHTML = "";
      node.setAttribute("data-draft-preview", "1");
      const result = viewer.enhanceLessonWorkspace({
        body: node,
        teachingKit,
        featureFlags: { teachingKitViewer: true, teachingKitPrintCenter: true, teachingKitAttachments: false },
        // Open first tip/sub activity so Draft Preview shows real enrichment immediately
        initialActivityId: firstEnriched?.id || "",
        initialDay: state.previewDay || "monday",
        chrome: {
          title: model.merged.plan.title || plan.title,
          age: model.merged.plan.age || plan.age,
          planLabel: model.merged.plan.plan || plan.plan,
          backLabel: "Draft Preview",
          saveButtonHtml: "",
          actionBarsHtml: `<div class="tk-enrich-draft-preview-chip" aria-hidden="true">Draft Preview</div>`,
          feedbackHtml: "",
          copyrightHtml: "",
        },
      });
      if (result && typeof result.then === "function") {
        result.then((resolved) => {
          if (resolved?.unbind) state.previewUnbind = resolved.unbind;
          if (resolved && resolved.enhanced === false) {
            node.innerHTML = `<p class="muted-copy">Draft Preview unavailable (${esc(resolved.reason || "unknown")}). Published lesson unchanged.</p>`;
          }
        }).catch((error) => {
          node.innerHTML = `<p class="muted-copy">Draft Preview failed safely. ${esc(error.message || error)}</p>`;
        });
      } else if (result?.unbind) {
        state.previewUnbind = result.unbind;
      }
    });
  }

  function renderJumpResults(plan, activities) {
    const panel = document.querySelector("[data-enrich-jump-results]");
    if (!panel) return;
    const hits = api().searchJumpIndex(api().buildJumpIndex(plan, activities, state.draft), state.jumpQuery);
    panel.innerHTML = hits.map((hit) => `
      <button type="button" class="tk-enrich-jump-hit" data-jump-type="${esc(hit.type)}" data-jump-id="${esc(hit.id)}" data-jump-index="${hit.index ?? ""}">
        <strong>${esc(hit.label)}</strong>
        <small>${esc(hit.meta || hit.type)}</small>
      </button>
    `).join("") || `<p class="muted-copy">No matches in this lesson.</p>`;
  }

  function renderChromeOnly() {
    const percentEl = document.querySelector(".tk-enrich-percent-row strong");
    const statusEl = document.querySelector(".tk-enrich-status");
    if (statusEl) statusEl.textContent = state.statusText || "";
    const plan = getPlan();
    if (!plan || !percentEl) return;
    const activities = getActivities(plan);
    const percent = recomputePercent(plan, activities);
    percentEl.textContent = `Overall ${percent}%`;
    const bar = document.querySelector(".tk-enrich-bar i");
    if (bar) bar.style.width = `${percent}%`;
  }

  function render() {
    const el = host();
    if (!el || !state.open) return;
    const plan = getPlan();
    if (!plan) {
      el.innerHTML = `<div class="empty-state">Lesson not found.</div>`;
      return;
    }
    const activities = getActivities(plan);
    if (state.activityIndex >= activities.length) state.activityIndex = Math.max(0, activities.length - 1);
    const percent = recomputePercent(plan, activities);
    // Quality checklist % drives the label (not Phase-1 legacy_mapped overlay).
    const label = api().completenessLabelFromPercent(percent, null);
    const body = state.mode === "week"
      ? renderWeekMode(plan)
      : state.mode === "preview"
        ? renderPreviewMode()
        : renderActivityMode(plan, activities);
    el.innerHTML = `
      <div class="tk-enrich-shell">
        ${renderChrome(plan, activities, percent, label)}
        <div class="tk-enrich-main">
          ${renderUpgradeSummary(plan, activities)}
          <div class="tk-enrich-body">${body}</div>
        </div>
        ${renderPublishModal(plan, activities)}
        ${renderLightbox()}
      </div>
    `;
    if (state.jumpOpen) renderJumpResults(plan, activities);
    if (SLICE.livePreview) {
      requestAnimationFrame(() => paintLivePreview(plan, activities));
    }
  }

  function bind() {
    document.addEventListener("click", async (event) => {
      const openBtn = event.target.closest("[data-curriculum-lesson-enrich]");
      if (openBtn) {
        event.preventDefault();
        if (!isEditorFlagEnabled()) {
          if (typeof showActionFeedback === "function") {
            showActionFeedback("Enrichment Editor is disabled (feature flag off).");
          }
          return;
        }
        open(openBtn.getAttribute("data-curriculum-lesson-enrich"));
        return;
      }
      if (!state.open) return;
      if (event.target.closest("[data-enrich-exit]")) {
        close();
        return;
      }
      if (event.target.closest("[data-summary-toggle]")) {
        state.summaryOpen = !state.summaryOpen;
        render();
        return;
      }
      const summaryJump = event.target.closest("[data-summary-jump]");
      if (summaryJump) {
        const jump = summaryJump.getAttribute("data-summary-jump");
        const plan = getPlan();
        const activities = getActivities(plan);
        const weekJumps = new Set(["family", "printables", "books", "songs", "vocabulary", "objectives", "materials"]);
        if (weekJumps.has(jump)) {
          state.mode = "week";
        } else {
          state.mode = "activities";
          const draftActs = state.draft.activities || {};
          let target = -1;
          if (jump === "setup") {
            target = activities.findIndex((a) => !api().activityEnrichmentView(a, draftActs[draftKey(a)]).setupImageUrl);
          } else if (jump === "example") {
            target = activities.findIndex((a) => !api().activityEnrichmentView(a, draftActs[draftKey(a)]).exampleImageUrl);
          } else if (jump === "tips") {
            target = activities.findIndex((a) => !api().activityEnrichmentView(a, draftActs[draftKey(a)]).teacherTips.length);
          } else if (jump === "observations") {
            target = activities.findIndex((a) => {
              const view = api().activityEnrichmentView(a, draftActs[draftKey(a)]);
              return !view.observationPrompts.length && !String(a.observationOpportunities || "").trim();
            });
          } else {
            target = api().firstIncompleteActivityIndex(activities, draftActs);
          }
          if (target >= 0) state.activityIndex = target;
        }
        render();
        return;
      }
      if (event.target.closest("[data-enrich-save-draft]")) {
        await saveDraft({ silent: false });
        return;
      }
      if (event.target.closest("[data-enrich-publish]")) {
        if (!SLICE1.publish) {
          state.statusText = "Publishing is disabled until a later reviewed slice.";
          renderChromeOnly();
          return;
        }
        state.publishOpen = true;
        render();
        return;
      }
      if (event.target.closest("[data-publish-cancel]")) {
        state.publishOpen = false;
        render();
        return;
      }
      if (event.target.closest("[data-publish-confirm]")) {
        try {
          await publishEnrichment();
        } catch (error) {
          state.statusText = `Publish failed: ${error.message || error}`;
          render();
        }
        return;
      }
      const modeBtn = event.target.closest("[data-enrich-mode]");
      if (modeBtn) {
        state.mode = modeBtn.getAttribute("data-enrich-mode");
        if (state.mode === "preview") {
          const act = getActivities(getPlan())[state.activityIndex];
          if (act?.dayOfWeek) state.previewDay = String(act.dayOfWeek);
        }
        render();
        return;
      }
      const previewViewport = event.target.closest("[data-preview-viewport]");
      if (previewViewport) {
        state.previewViewport = previewViewport.getAttribute("data-preview-viewport") || "desktop";
        render();
        return;
      }
      const previewDay = event.target.closest("[data-preview-day]");
      if (previewDay) {
        state.previewDay = previewDay.getAttribute("data-preview-day") || "monday";
        render();
        return;
      }
      if (event.target.closest("[data-enrich-prev]")) {
        state.activityIndex = Math.max(0, state.activityIndex - 1);
        state.mode = "activities";
        render();
        return;
      }
      if (event.target.closest("[data-enrich-next]") || event.target.closest("[data-enrich-skip]")) {
        const plan = getPlan();
        const activities = getActivities(plan);
        state.activityIndex = Math.min(activities.length - 1, state.activityIndex + 1);
        state.mode = "activities";
        render();
        return;
      }
      if (event.target.closest("[data-enrich-save-next]")) {
        await saveDraft({ silent: true });
        const plan = getPlan();
        const activities = getActivities(plan);
        const nextIncomplete = activities.findIndex((act, i) => (
          i > state.activityIndex
          && api().activityStatus(act, state.draft.activities[draftKey(act)]) !== "complete"
        ));
        state.activityIndex = nextIncomplete >= 0
          ? nextIncomplete
          : Math.min(activities.length - 1, state.activityIndex + 1);
        state.mode = "activities";
        render();
        return;
      }
      const dayFilter = event.target.closest("[data-day-filter]");
      if (dayFilter) {
        state.dayFilter = dayFilter.getAttribute("data-day-filter");
        render();
        return;
      }
      const queueItem = event.target.closest("[data-activity-index]");
      if (queueItem) {
        state.activityIndex = Number(queueItem.getAttribute("data-activity-index")) || 0;
        state.mode = "activities";
        render();
        return;
      }
      if (event.target.closest("[data-enrich-jump-toggle]")) {
        state.jumpOpen = !state.jumpOpen;
        render();
        return;
      }
      const jumpHit = event.target.closest("[data-jump-type]");
      if (jumpHit) {
        const type = jumpHit.getAttribute("data-jump-type");
        if (type === "activity") {
          state.mode = "activities";
          state.activityIndex = Number(jumpHit.getAttribute("data-jump-index")) || 0;
        } else {
          state.mode = "week";
        }
        state.jumpOpen = false;
        render();
        return;
      }
      const setting = event.target.closest("[data-setting-tag]");
      if (setting) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        if (!act) return;
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const tag = setting.getAttribute("data-setting-tag");
        const current = new Set(api().activityEnrichmentView(act, draftAct).settingTags);
        if (current.has(tag)) current.delete(tag);
        else current.add(tag);
        draftAct.settingTags = [...current];
        markDirty();
        render();
        return;
      }
      const tipRemove = event.target.closest("[data-tip-remove]");
      if (tipRemove) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        view.teacherTips.splice(Number(tipRemove.getAttribute("data-tip-remove")), 1);
        draftAct.teacherTips = view.teacherTips;
        markDirty();
        render();
        return;
      }
      const subRemove = event.target.closest("[data-sub-remove]");
      if (subRemove) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        view.substitutions.splice(Number(subRemove.getAttribute("data-sub-remove")), 1);
        draftAct.substitutions = view.substitutions;
        markDirty();
        render();
        return;
      }
      const obsRemove = event.target.closest("[data-obs-remove]");
      if (obsRemove) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        view.observationPrompts.splice(Number(obsRemove.getAttribute("data-obs-remove")), 1);
        draftAct.observationPrompts = view.observationPrompts;
        markDirty();
        render();
        return;
      }
      const vocabRemove = event.target.closest("[data-vocab-remove]");
      if (vocabRemove) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        view.vocabulary.splice(Number(vocabRemove.getAttribute("data-vocab-remove")), 1);
        draftAct.vocabulary = view.vocabulary;
        markDirty();
        render();
        return;
      }
      if (event.target.closest("[data-ai-tips]")) {
        if (!SLICE.aiSuggest) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const suggestions = [
          `Prep ${act?.title || "this activity"} before children arrive.`,
          "Offer two choices so every child can join at their level.",
          "Narrate what you see — keep language warm and short.",
        ];
        const approved = window.confirm(
          `Insert these tips into the draft?\n\n• ${suggestions.join("\n• ")}\n\nNothing is inserted unless you OK.`,
        );
        if (!approved) return;
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        draftAct.teacherTips = [...view.teacherTips, ...suggestions].slice(0, 5);
        markDirty();
        render();
        return;
      }
      const milestone = event.target.closest("[data-milestone]");
      if (milestone) {
        const m = milestone.getAttribute("data-milestone");
        const list = new Set(state.draft.week.milestones || []);
        if (list.has(m)) list.delete(m);
        else list.add(m);
        state.draft.week.milestones = [...list];
        markDirty();
        render();
        return;
      }
      const photoBox = event.target.closest(".tk-enrich-photo");
      if (photoBox) {
        const key = photoBox.getAttribute("data-photo-key");
        const field = photoBox.getAttribute("data-photo-field");
        const input = photoBox.querySelector('input[type="file"]');
        if (event.target.closest("[data-photo-remove]")) {
          ensureDraftActivity(key)[field] = "";
          markDirty();
          render();
          return;
        }
        if (event.target.closest("[data-photo-preview]")) {
          state.lightboxUrl = ensureDraftActivity(key)[field]
            || api().activityEnrichmentView(
              getActivities(getPlan()).find((a) => draftKey(a) === key),
              state.draft.activities[key],
            )[field];
          render();
          return;
        }
        if (!SLICE1.photoUpload) return;
        if (event.target.closest("[data-photo-replace]") || event.target.closest(".tk-enrich-photo-drop")) {
          input?.click();
          return;
        }
      }
      if (event.target.closest("[data-lightbox-close]") || event.target.closest("[data-lightbox]")) {
        if (event.target.closest("[data-lightbox-close]") || event.target.classList.contains("tk-enrich-lightbox")) {
          state.lightboxUrl = "";
          render();
        }
      }
    });

    document.addEventListener("change", async (event) => {
      if (!state.open) return;
      if (event.target.matches(".tk-enrich-photo input[type='file']")) {
        if (!SLICE1.photoUpload) return;
        const box = event.target.closest(".tk-enrich-photo");
        const file = event.target.files && event.target.files[0];
        await applyPhoto(box.getAttribute("data-photo-key"), box.getAttribute("data-photo-field"), file);
        return;
      }
      if (event.target.matches("[data-preview-ready]")) {
        state.draft.week.previewReady = event.target.checked;
        state.draft.previewReady = event.target.checked;
        markDirty();
      }
    });

    document.addEventListener("input", (event) => {
      if (!state.open) return;
      if (event.target.matches("[data-enrich-jump-input]")) {
        state.jumpQuery = event.target.value || "";
        const plan = getPlan();
        renderJumpResults(plan, getActivities(plan));
        return;
      }
      if (event.target.matches("[data-week-family]")) {
        state.draft.week.familyConnection = event.target.value || "";
        markDirty();
        clearTimeout(state._previewTimer);
        state._previewTimer = setTimeout(() => {
          const plan = getPlan();
          paintLivePreview(plan, getActivities(plan));
        }, 250);
      }
    });

    document.addEventListener("submit", (event) => {
      if (!state.open) return;
      if (event.target.matches("[data-tip-add]")) {
        event.preventDefault();
        const value = String(event.target.querySelector("input")?.value || "").trim();
        if (!value) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        draftAct.teacherTips = [...view.teacherTips, value].slice(0, 5);
        markDirty();
        render();
        return;
      }
      if (event.target.matches("[data-sub-add]")) {
        event.preventDefault();
        const need = String(event.target.querySelector('[name="need"]')?.value || "").trim();
        const use = String(event.target.querySelector('[name="use"]')?.value || "").trim();
        if (!need || !use) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        draftAct.substitutions = [...view.substitutions, { need, use }].slice(0, 12);
        markDirty();
        render();
        return;
      }
      if (event.target.matches("[data-obs-add]")) {
        event.preventDefault();
        const value = String(event.target.querySelector("input")?.value || "").trim();
        if (!value) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        draftAct.observationPrompts = [...view.observationPrompts, value].slice(0, 8);
        markDirty();
        render();
        return;
      }
      if (event.target.matches("[data-vocab-add]")) {
        event.preventDefault();
        const value = String(event.target.querySelector("input")?.value || "").trim();
        if (!value) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        if (!view.vocabulary.map((w) => w.toLowerCase()).includes(value.toLowerCase())) {
          draftAct.vocabulary = [...view.vocabulary, value].slice(0, 16);
        } else {
          draftAct.vocabulary = view.vocabulary;
        }
        markDirty();
        render();
      }
    });

    document.addEventListener("dragover", (event) => {
      if (!state.open || !SLICE1.photoUpload) return;
      if (event.target.closest(".tk-enrich-photo-drop")) {
        event.preventDefault();
      }
    });
    document.addEventListener("drop", async (event) => {
      if (!state.open || !SLICE1.photoUpload) return;
      const drop = event.target.closest(".tk-enrich-photo-drop");
      if (!drop) return;
      event.preventDefault();
      const box = drop.closest(".tk-enrich-photo");
      const file = event.dataTransfer?.files?.[0];
      await applyPhoto(box.getAttribute("data-photo-key"), box.getAttribute("data-photo-field"), file);
    });
  }

  bind();

  root.LLHTeachingKitEnrichmentEditor = {
    open,
    close,
    isOpen: () => state.open,
    isEnabled: isEditorFlagEnabled,
    sliceFeatures: () => ({ ...SLICE }),
    render,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
