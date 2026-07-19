/**
 * Phase 1 Monthly Curriculum UI + guided lesson editor helpers.
 * Loaded after app.js. Uses shared CurriculumSeries / CurriculumLearningDomains globals.
 */
(function monthlyCurriculumPhase1Module() {
  const SERIES_AGES = ["Infant", "Toddler", "Preschool"];
  const SERIES_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const SERIES_SEASONS = ["Spring", "Summer", "Fall", "Winter", "Back to School", "Holiday"];
  const SERIES_STATUSES = ["draft", "needs_review", "published", "featured", "archived"];
  const LESSON_EDITOR_STEPS = [
    { id: "basics", label: "Basic information" },
    { id: "weekly", label: "Weekly overview" },
    { id: "days", label: "Monday–Friday" },
    { id: "activities", label: "Activities" },
    { id: "cover", label: "Cover image" },
    { id: "review", label: "Review & publish" },
  ];

  let adminSeriesEditorId = "";
  let adminSeriesDraftLocal = null;
  let adminSeriesLastSavedAt = "";
  let adminSeriesDirty = false;
  let adminSeriesAutosaveTimer = null;
  let adminSeriesPreviewMode = false;
  let adminLessonEditorStep = "basics";
  let lessonLibraryTypeFilter = "all"; // all | weekly | monthly | favorites
  let openMonthlySeriesId = "";

  function esc(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function seriesApi() {
    return globalThis.CurriculumSeries || null;
  }

  function adminToken() {
    return (typeof adminSession === "function" && adminSession()?.token) || "";
  }

  function curriculumSeriesList() {
    const admin = typeof effectiveCurriculum === "function" ? effectiveCurriculum() : null;
    if (admin && Array.isArray(admin.series) && (admin.series.length || adminSession?.()?.token)) {
      return admin.series;
    }
    const lib = typeof effectiveCurriculumLibrary === "function" ? effectiveCurriculumLibrary() : null;
    return Array.isArray(lib?.series) ? lib.series : [];
  }

  function lessonPlansForPicker() {
    if (typeof curriculumLessonPlansForAdmin === "function") return curriculumLessonPlansForAdmin();
    if (typeof effectiveCurriculum === "function") return effectiveCurriculum().lessonPlans || [];
    return [];
  }

  function emptySeriesDraft() {
    const api = seriesApi();
    const weeks = api?.defaultSeriesWeeks?.(4) || [1, 2, 3, 4].map((n) => ({
      weekNumber: n,
      lessonPlanId: "",
      displayOrder: n,
    }));
    return {
      id: "",
      title: "",
      description: "",
      age: "Preschool",
      month: "",
      season: "",
      year: "",
      weekCount: 4,
      overallGoals: "",
      overallMaterials: "",
      coverImageUrl: "",
      coverImageAlt: "",
      coverImageSource: "fallback",
      coverImagePosition: "center",
      plan: "Free",
      status: "draft",
      featured: false,
      displayOrder: 0,
      weeks,
      createdAt: "",
      updatedAt: "",
      publishedAt: "",
    };
  }

  function draftStorageKey(id) {
    return `llhCurriculumSeriesDraft:${id || "new"}`;
  }

  function persistLocalDraft(series) {
    try {
      localStorage.setItem(draftStorageKey(series.id || "new"), JSON.stringify({
        savedAt: new Date().toISOString(),
        series,
      }));
    } catch {
      /* ignore quota */
    }
  }

  function loadLocalDraft(id) {
    try {
      const raw = localStorage.getItem(draftStorageKey(id || "new"));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearLocalDraft(id) {
    try {
      localStorage.removeItem(draftStorageKey(id || "new"));
    } catch {
      /* ignore */
    }
  }

  function seriesFallbackCover(series) {
    return "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#2f6f5e"/><stop offset="100%" stop-color="#f0c75e"/>
        </linearGradient></defs>
        <rect width="1280" height="720" fill="url(#g)"/>
        <text x="640" y="360" text-anchor="middle" fill="#fff" font-size="54" font-family="Georgia, serif">${esc(series?.title || "Monthly Curriculum")}</text>
      </svg>`,
    );
  }

  function seriesCoverUrl(series) {
    const url = String(series?.coverImageUrl || "").trim();
    if (url) return url;
    return seriesFallbackCover(series);
  }

  function markSeriesDirty() {
    adminSeriesDirty = true;
    scheduleSeriesAutosave();
  }

  function scheduleSeriesAutosave() {
    if (adminSeriesAutosaveTimer) clearTimeout(adminSeriesAutosaveTimer);
    adminSeriesAutosaveTimer = setTimeout(() => {
      if (!adminSeriesDraftLocal) return;
      persistLocalDraft(adminSeriesDraftLocal);
      adminSeriesLastSavedAt = new Date().toISOString();
      const stamp = document.querySelector("#adminSeriesLastSaved");
      if (stamp) stamp.textContent = `Last saved: ${new Date(adminSeriesLastSavedAt).toLocaleTimeString()}`;
    }, 800);
  }

  function readSeriesForm() {
    const form = document.querySelector("#adminCurriculumSeriesForm");
    if (!form) return adminSeriesDraftLocal || emptySeriesDraft();
    const weekCount = Number(form.weekCount?.value) === 5 ? 5 : 4;
    const weeks = [];
    for (let n = 1; n <= weekCount; n += 1) {
      const select = form.querySelector(`[name="weekPlan_${n}"]`);
      weeks.push({
        weekNumber: n,
        lessonPlanId: select?.value || "",
        displayOrder: n,
      });
    }
    // Duplicate week warning (same plan in one week slot shouldn't happen via select;
    // also detect two selects somehow sharing — N/A). Check empty vs filled.
    return {
      ...(adminSeriesDraftLocal || emptySeriesDraft()),
      id: form.id?.value || adminSeriesEditorId || "",
      title: form.title?.value || "",
      description: form.description?.value || "",
      age: form.age?.value || "Preschool",
      month: form.month?.value || "",
      season: form.season?.value || "",
      year: form.year?.value || "",
      weekCount,
      overallGoals: form.overallGoals?.value || "",
      overallMaterials: form.overallMaterials?.value || "",
      coverImageUrl: form.coverImageUrl?.value || "",
      coverImageAlt: form.coverImageAlt?.value || "",
      coverImageSource: form.coverImageUrl?.value ? "uploaded" : "fallback",
      plan: form.plan?.value === "Pro" ? "Pro" : "Free",
      status: form.status?.value || "draft",
      featured: Boolean(form.featured?.checked),
      displayOrder: Number(form.displayOrder?.value) || 0,
      weeks,
    };
  }

  function validationErrorsHtml(errors) {
    if (!errors?.length) return "";
    return `<div class="access-notice" role="alert"><strong>Fix before publishing:</strong><ul>${
      errors.map((err) => `<li>${esc(err)}</li>`).join("")
    }</ul></div>`;
  }

  function weekSlotHtml(weekNumber, week, plans) {
    const plan = plans.find((item) => item.id === week.lessonPlanId);
    const options = [
      `<option value="">— Empty week —</option>`,
      ...plans.map((item) => `<option value="${esc(item.id)}" ${item.id === week.lessonPlanId ? "selected" : ""}>${esc(item.title)} (${esc(item.age)} · ${esc(item.status)})</option>`),
    ].join("");
    return `
      <div class="admin-fieldset curriculum-series-week-slot ${week.lessonPlanId ? "is-filled" : "is-empty"}" data-series-week="${weekNumber}">
        <div class="section-heading">
          <strong>Week ${weekNumber}</strong>
          ${week.lessonPlanId ? "" : `<span class="tag tag-hidden">Empty</span>`}
        </div>
        <label>Lesson plan
          <select name="weekPlan_${weekNumber}">${options}</select>
        </label>
        ${plan ? `<p class="muted-copy">${esc(plan.theme || "No theme")} · ${esc(plan.plan || "Free")}</p>` : `<p class="muted-copy">No weekly plan assigned yet.</p>`}
        <div class="account-actions-row">
          <button type="button" class="ghost-button" data-series-clear-week="${weekNumber}" ${week.lessonPlanId ? "" : "disabled"}>Remove from curriculum</button>
        </div>
      </div>
    `;
  }

  function renderSeriesEditor(series) {
    const plans = lessonPlansForPicker().filter((p) => p.status !== "archived");
    const api = seriesApi();
    const publishErrors = api?.validateCurriculumSeriesForPublish?.(series, plans) || [];
    const lastSaved = adminSeriesLastSavedAt
      ? `Last saved: ${new Date(adminSeriesLastSavedAt).toLocaleTimeString()}`
      : "Not saved yet";
    return `
      <form id="adminCurriculumSeriesForm" class="panel-form admin-stacked-form curriculum-series-builder">
        <input type="hidden" name="id" value="${esc(series.id || "")}" />
        <div class="admin-lesson-sticky-bar" role="region" aria-label="Curriculum builder actions">
          <div>
            <strong>${esc(series.title || "New monthly curriculum")}</strong>
            <small id="adminSeriesLastSaved">${esc(lastSaved)}</small>
          </div>
          <div class="account-actions-row">
            <button class="ghost-button" type="button" data-series-back>Cancel</button>
            <button class="ghost-button" type="button" data-series-preview>Preview</button>
            <button class="ghost-button" type="button" data-series-save-draft>Save draft</button>
            <button class="primary-button" type="button" data-series-publish>Publish</button>
          </div>
        </div>
        ${validationErrorsHtml(series.status === "published" || series.status === "featured" ? publishErrors : [])}
        <div class="form-grid-two">
          <label>Curriculum title<input name="title" value="${esc(series.title || "")}" required /></label>
          <label>Age group
            <select name="age">${SERIES_AGES.map((age) => `<option ${series.age === age ? "selected" : ""}>${age}</option>`).join("")}</select>
          </label>
        </div>
        <div class="form-grid-two">
          <label>Month
            <select name="month"><option value="">—</option>${SERIES_MONTHS.map((m) => `<option ${series.month === m ? "selected" : ""}>${m}</option>`).join("")}</select>
          </label>
          <label>Season
            <select name="season"><option value="">—</option>${SERIES_SEASONS.map((s) => `<option ${series.season === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          </label>
        </div>
        <div class="form-grid-two">
          <label>Year (optional)<input name="year" value="${esc(series.year || "")}" placeholder="2026" /></label>
          <label>Week format
            <select name="weekCount">
              <option value="4" ${Number(series.weekCount) !== 5 ? "selected" : ""}>4 weeks</option>
              <option value="5" ${Number(series.weekCount) === 5 ? "selected" : ""}>5 weeks</option>
            </select>
          </label>
        </div>
        <div class="form-grid-two">
          <label>Free / Pro
            <select name="plan"><option ${series.plan !== "Pro" ? "selected" : ""}>Free</option><option ${series.plan === "Pro" ? "selected" : ""}>Pro</option></select>
          </label>
          <label>Status
            <select name="status">${SERIES_STATUSES.map((s) => `<option value="${s}" ${series.status === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}</select>
          </label>
        </div>
        <label class="admin-inline-toggle"><input type="checkbox" name="featured" ${series.featured ? "checked" : ""} /> <span>Featured</span></label>
        <label>Display order<input name="displayOrder" type="number" value="${esc(String(series.displayOrder || 0))}" /></label>
        <label>Description<textarea name="description" rows="3">${esc(series.description || "")}</textarea></label>
        <label>Overall learning goals<textarea name="overallGoals" rows="3">${esc(series.overallGoals || "")}</textarea></label>
        <label>Overall materials<textarea name="overallMaterials" rows="3">${esc(series.overallMaterials || "")}</textarea></label>
        <fieldset class="admin-fieldset">
          <legend>Main cover (16:9)</legend>
          <p class="muted-copy">Upload or paste an image URL. A branded fallback is used when empty. AI cover generation comes in a later phase.</p>
          <label>Cover image URL<input name="coverImageUrl" value="${esc(series.coverImageUrl || "")}" placeholder="https://… or /media/…" /></label>
          <label>Cover alt text<input name="coverImageAlt" value="${esc(series.coverImageAlt || "")}" /></label>
          <div class="curriculum-series-cover-preview">
            <img src="${esc(seriesCoverUrl(series))}" alt="${esc(series.coverImageAlt || series.title || "Curriculum cover")}" style="width:100%;max-width:420px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;" />
          </div>
        </fieldset>
        <div class="curriculum-series-weeks">
          <h4>Weekly lesson plans</h4>
          <p class="muted-copy">Link existing weekly plans. Removing a week does not delete the lesson plan.</p>
          ${(series.weeks || []).map((week) => weekSlotHtml(week.weekNumber, week, plans)).join("")}
        </div>
        ${adminSeriesPreviewMode ? renderSeriesPreview(series, plans) : ""}
      </form>
    `;
  }

  function renderSeriesPreview(series, plans) {
    const byId = new Map(plans.map((p) => [p.id, p]));
    return `
      <div class="admin-fieldset curriculum-series-preview" style="margin-top:1rem;">
        <h4>Collection preview</h4>
        <p><strong>${esc(series.title || "Untitled")}</strong> · ${esc(series.age)} · ${esc(series.month || series.season || "Season TBD")} · ${series.weekCount} weeks · ${esc(series.plan)}</p>
        <ol>
          ${(series.weeks || []).map((week) => {
            const plan = byId.get(week.lessonPlanId);
            return `<li>Week ${week.weekNumber}: ${plan ? esc(plan.title) : "<em>Empty</em>"}</li>`;
          }).join("")}
        </ol>
      </div>
    `;
  }

  function seriesCardHtml(series) {
    const filled = (series.weeks || []).filter((w) => w.lessonPlanId).length;
    return `
      <article class="admin-content-card is-${esc(series.status || "draft")}">
        <div class="admin-mobile-card-body">
          <div>
            <strong>${esc(series.title || "Untitled Curriculum")}</strong>
            <div class="tag-row" style="margin:2px 0 4px">
              <span class="tag">${esc((series.status || "draft").replace(/_/g, " "))}</span>
              <span class="tag">${esc(series.age || "")}</span>
              <span class="tag">${esc(series.plan || "Free")}</span>
              <span class="tag">${series.weekCount || 4} weeks</span>
            </div>
            <small>${esc(series.month || series.season || "No month/season")} · ${filled}/${series.weekCount || 4} weeks filled</small>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-series-edit="${esc(series.id)}">Edit</button>
          <button class="ghost-button" type="button" data-series-duplicate="${esc(series.id)}">Duplicate</button>
        </div>
      </article>
    `;
  }

  function renderSynonymManager() {
    const curriculum = typeof effectiveCurriculum === "function" ? effectiveCurriculum() : {};
    const synonyms = Array.isArray(curriculum.importSynonyms) ? curriculum.importSynonyms : [];
    const domains = (globalThis.CurriculumLearningDomains?.OFFICIAL_LEARNING_DOMAINS)
      || ["Social Emotional", "Language & Literacy", "Math", "Science", "Physical Development", "Creative Arts"];
    return `
      <details class="admin-fieldset" id="adminImportSynonymManager">
        <summary><strong>Importer synonym manager</strong></summary>
        <p class="muted-copy">Teach the importer new wording. Pasted text stays flexible; saved values stay official.</p>
        <form id="adminImportSynonymForm" class="form-grid-two">
          <label>Pasted wording<input name="from" placeholder="e.g. Early Math" required /></label>
          <label>Save as
            <select name="to">${domains.map((d) => `<option>${esc(d)}</option>`).join("")}</select>
          </label>
          <div class="form-actions" style="grid-column:1/-1">
            <button class="primary-button" type="submit">Add synonym</button>
          </div>
        </form>
        <div class="admin-mobile-list" style="margin-top:0.75rem">
          ${synonyms.map((rule) => `
            <article class="admin-content-card">
              <div class="admin-mobile-card-body">
                <strong>${esc(rule.from)}</strong> → ${esc(rule.to)}
                ${rule.disabled ? `<span class="tag">Disabled</span>` : ""}
              </div>
              <div class="form-actions">
                <button type="button" class="ghost-button" data-synonym-toggle="${esc(rule.id)}">${rule.disabled ? "Enable" : "Disable"}</button>
                <button type="button" class="ghost-button" data-synonym-remove="${esc(rule.id)}">Remove</button>
              </div>
            </article>
          `).join("") || `<div class="empty-state">No custom synonyms yet. Built-in matches like Math → Math already work.</div>`}
        </div>
      </details>
    `;
  }

  function renderAdminCurriculumSeriesManager() {
    const target = document.querySelector("#adminCurriculumSeriesApp");
    if (!target) return;
    const seriesList = curriculumSeriesList().slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const editing = adminSeriesEditorId
      ? (adminSeriesDraftLocal || seriesList.find((s) => s.id === adminSeriesEditorId) || emptySeriesDraft())
      : null;
    target.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Content Manager</p>
          <h3>Monthly Curriculum Builder</h3>
          <p class="muted-copy">Group existing weekly lesson plans into Week 1–4/5 collections. Weekly plans are not duplicated.</p>
        </div>
        <button class="ghost-button" type="button" id="adminCreateCurriculumSeriesButton">+ Create monthly curriculum</button>
      </div>
      ${renderSynonymManager()}
      <p class="muted-copy">${seriesList.length} curriculum series</p>
      <div class="admin-mobile-list">
        ${seriesList.map(seriesCardHtml).join("") || `<div class="empty-state">No monthly curriculums yet. Create one to link weekly plans.</div>`}
      </div>
      ${editing ? renderSeriesEditor(editing) : ""}
    `;
  }

  async function saveSeries({ publish = false } = {}) {
    const token = adminToken();
    if (!token) {
      if (typeof showActionFeedback === "function") showActionFeedback("Admin unlock is required.");
      return;
    }
    const series = readSeriesForm();
    if (publish) series.status = series.status === "featured" ? "featured" : "published";
    else if (!["published", "featured"].includes(series.status)) series.status = "draft";

    if (publish) {
      const api = seriesApi();
      const errors = api?.validateCurriculumSeriesForPublish?.(series, lessonPlansForPicker()) || [];
      if (errors.length) {
        if (typeof showActionFeedback === "function") showActionFeedback(errors[0]);
        adminSeriesDraftLocal = series;
        renderAdminCurriculumSeriesManager();
        return;
      }
    }

    // Duplicate week occupancy warning
    const occupied = new Map();
    let dupWarning = "";
    (series.weeks || []).forEach((week) => {
      if (!week.lessonPlanId) return;
      if (occupied.has(week.weekNumber) && occupied.get(week.weekNumber) !== week.lessonPlanId) {
        dupWarning = `Two lesson plans are assigned to Week ${week.weekNumber}.`;
      }
      occupied.set(week.weekNumber, week.lessonPlanId);
    });
    if (dupWarning && publish) {
      if (typeof showActionFeedback === "function") showActionFeedback(dupWarning);
      return;
    }

    const response = await fetch("/api/admin/curriculum/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminToken: token,
        expectedUpdatedAt: typeof curriculumExpectedUpdatedAt === "function" ? curriculumExpectedUpdatedAt() : "",
        series,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const first = data?.validationErrors?.[0] || data?.error || "Could not save curriculum.";
      if (typeof showActionFeedback === "function") showActionFeedback(first);
      if (data.validationErrors?.length) {
        adminSeriesDraftLocal = series;
        renderAdminCurriculumSeriesManager();
      }
      return;
    }
    if (data.curriculum && typeof applyCurriculumState === "function") {
      applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
    }
    adminSeriesEditorId = data.series?.id || series.id;
    adminSeriesDraftLocal = data.series || series;
    adminSeriesDirty = false;
    adminSeriesLastSavedAt = new Date().toISOString();
    clearLocalDraft("new");
    persistLocalDraft(adminSeriesDraftLocal);
    if (typeof showActionFeedback === "function") {
      showActionFeedback(publish ? "Monthly curriculum published." : "Draft saved.");
    }
    if (data.warnings?.length && typeof showActionFeedback === "function") {
      showActionFeedback(data.warnings[0]);
    }
    renderAdminCurriculumSeriesManager();
  }

  async function duplicateSeries(id) {
    const token = adminToken();
    const response = await fetch("/api/admin/curriculum/series/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminToken: token,
        id,
        expectedUpdatedAt: typeof curriculumExpectedUpdatedAt === "function" ? curriculumExpectedUpdatedAt() : "",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (typeof showActionFeedback === "function") showActionFeedback(data?.error || "Duplicate failed.");
      return;
    }
    if (data.curriculum && typeof applyCurriculumState === "function") {
      applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
    }
    adminSeriesEditorId = data.series?.id || "";
    adminSeriesDraftLocal = data.series || null;
    adminSeriesDirty = false;
    renderAdminCurriculumSeriesManager();
    if (typeof showActionFeedback === "function") showActionFeedback("Curriculum duplicated as draft.");
  }

  async function saveSynonym(payload) {
    const token = adminToken();
    const response = await fetch("/api/admin/curriculum/import-synonyms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminToken: token,
        expectedUpdatedAt: typeof curriculumExpectedUpdatedAt === "function" ? curriculumExpectedUpdatedAt() : "",
        synonym: payload,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (typeof showActionFeedback === "function") showActionFeedback(data?.error || "Could not save synonym.");
      return;
    }
    if (data.curriculum && typeof applyCurriculumState === "function") {
      applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
    }
    renderAdminCurriculumSeriesManager();
  }

  function guidedEditorChromeHtml(stepId) {
    const currentIndex = LESSON_EDITOR_STEPS.findIndex((s) => s.id === stepId);
    return `
      <div class="curriculum-guided-progress" role="navigation" aria-label="Lesson plan steps">
        <ol class="curriculum-guided-steps">
          ${LESSON_EDITOR_STEPS.map((step, index) => `
            <li class="${index === currentIndex ? "is-current" : ""} ${index < currentIndex ? "is-done" : ""}">
              <button type="button" class="ghost-button" data-lesson-editor-step="${step.id}">
                <span class="curriculum-guided-num">${index + 1}</span> ${esc(step.label)}
              </button>
            </li>
          `).join("")}
        </ol>
        <p class="muted-copy">Step ${currentIndex + 1} of ${LESSON_EDITOR_STEPS.length}: ${esc(LESSON_EDITOR_STEPS[currentIndex]?.label || "")}. Your work autosaves as you go.</p>
      </div>
    `;
  }

  function applyGuidedLessonEditorStep() {
    const form = document.querySelector("#adminCurriculumLessonPlanForm");
    if (!form) return;
    if (!form.querySelector(".curriculum-guided-progress")) {
      form.insertAdjacentHTML("afterbegin", guidedEditorChromeHtml(adminLessonEditorStep));
    } else {
      const chrome = form.querySelector(".curriculum-guided-progress");
      if (chrome) chrome.outerHTML = guidedEditorChromeHtml(adminLessonEditorStep);
    }
    const show = {
      basics: ["#admin-lesson-basics", "label:has([name=status])", "fieldset.admin-fieldset:has(.curriculum-domain-grid)"],
      weekly: ["#admin-lesson-weekly"],
      days: [".curriculum-daily-editor"],
      activities: [".curriculum-daily-editor"],
      cover: ["#admin-lesson-cover"],
      review: ["#admin-lesson-basics", "#admin-lesson-weekly", ".curriculum-daily-editor", "#admin-lesson-cover", "#admin-lesson-resources"],
    };
    const panels = form.querySelectorAll("#admin-lesson-basics, #admin-lesson-cover, #admin-lesson-weekly, .curriculum-daily-editor, #admin-lesson-resources, fieldset.admin-fieldset");
    panels.forEach((el) => {
      el.hidden = adminLessonEditorStep !== "review";
    });
    (show[adminLessonEditorStep] || []).forEach((sel) => {
      form.querySelectorAll(sel).forEach((el) => {
        el.hidden = false;
      });
    });
    // Always show sticky bar / actions
    form.querySelectorAll(".admin-lesson-sticky-bar, .admin-lesson-form-actions, .curriculum-guided-progress, .curriculum-activity-sync-notice, .back-button, h4, .muted-copy").forEach((el) => {
      el.hidden = false;
    });
  }

  function monthlySeriesCardHtml(series) {
    const cover = seriesCoverUrl(series);
    const weekCount = series.weekCount || (series.weeks || []).length || 4;
    const favId = `series:${series.id}`;
    const isFav = typeof favorites !== "undefined" && Array.isArray(favorites) && favorites.includes(favId);
    return `
      <article class="resource-card lesson-plan-card browse-card has-cover-image netflix-cover-card curriculum-series-card" data-open-monthly-series="${esc(series.id)}">
        <div class="cover-media-wrap">
          <img class="cover-image" src="${esc(cover)}" alt="${esc(series.coverImageAlt || series.title || "Monthly curriculum")}" loading="lazy" />
        </div>
        <div class="resource-card-body">
          <h3>${esc(series.title || "Monthly Curriculum")}</h3>
          <div class="tag-row">
            <span class="tag">${esc(series.age || "")}</span>
            <span class="tag">${esc(series.month || series.season || "")}</span>
            <span class="tag">${weekCount} weeks</span>
            <span class="tag">${esc(series.plan || "Free")}</span>
          </div>
          <button type="button" class="ghost-button favorite-button" data-toggle-series-favorite="${esc(series.id)}" aria-pressed="${isFav}">${isFav ? "★ Saved" : "☆ Favorite"}</button>
        </div>
      </article>
    `;
  }

  function renderMonthlySeriesDetail(series) {
    const plans = (typeof effectiveCurriculumLibrary === "function"
      ? effectiveCurriculumLibrary().lessonPlans
      : []) || [];
    const byId = new Map(plans.map((p) => [p.id, p]));
    const cover = seriesCoverUrl(series);
    return `
      <section class="curriculum-series-detail" data-monthly-series-detail="${esc(series.id)}">
        <button type="button" class="ghost-button back-button" data-close-monthly-series>← Back to Lesson Plans</button>
        <div class="curriculum-series-detail-hero">
          <img src="${esc(cover)}" alt="${esc(series.coverImageAlt || series.title || "")}" style="width:100%;aspect-ratio:16/9;object-fit:cover;" />
        </div>
        <h2>${esc(series.title || "Monthly Curriculum")}</h2>
        <p class="muted-copy">${esc(series.age)} · ${esc(series.month || series.season || "")}${series.year ? ` ${esc(series.year)}` : ""} · ${series.weekCount || 4} weeks · ${esc(series.plan || "Free")}</p>
        ${series.description ? `<p>${esc(series.description)}</p>` : ""}
        ${series.overallGoals ? `<p><strong>Learning goals</strong><br>${esc(series.overallGoals)}</p>` : ""}
        ${series.overallMaterials ? `<p><strong>Materials</strong><br>${esc(series.overallMaterials)}</p>` : ""}
        <div class="curriculum-series-week-list">
          ${(series.weeks || []).map((week) => {
            const plan = byId.get(week.lessonPlanId);
            if (!plan) {
              return `<article class="admin-fieldset is-empty"><strong>Week ${week.weekNumber}</strong><p class="muted-copy">No weekly plan linked.</p></article>`;
            }
            const planCover = (typeof sanitizedImageSource === "function" ? sanitizedImageSource(plan.coverImageUrl) : plan.coverImageUrl) || "";
            return `
              <article class="admin-fieldset curriculum-series-week-card">
                <div class="form-grid-two">
                  <div>
                    ${planCover ? `<img src="${esc(planCover)}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;" />` : ""}
                  </div>
                  <div>
                    <strong>Week ${week.weekNumber}: ${esc(plan.title)}</strong>
                    <p class="muted-copy">${esc(plan.theme || "")}</p>
                    <p>${esc((plan.weeklyOverview || "").slice(0, 220))}${(plan.weeklyOverview || "").length > 220 ? "…" : ""}</p>
                    <div class="account-actions-row">
                      <button type="button" class="primary-button" data-open-week-plan="${esc(plan.id)}">Open Week</button>
                      <button type="button" class="ghost-button" data-curriculum-assign-week="${esc(plan.id)}">Add Week to Calendar</button>
                      <button type="button" class="ghost-button" data-download-week-plan="${esc(plan.id)}">Download Week</button>
                    </div>
                  </div>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function lessonLibraryTypeTabsHtml() {
    const tabs = [
      { id: "all", label: "All" },
      { id: "weekly", label: "Weekly Plans" },
      { id: "monthly", label: "Monthly Curriculums" },
      { id: "favorites", label: "Favorites" },
    ];
    return `
      <div class="lesson-library-type-tabs" role="tablist" aria-label="Lesson plan type">
        ${tabs.map((tab) => `
          <button type="button" class="ghost-button ${lessonLibraryTypeFilter === tab.id ? "is-active" : ""}" data-lesson-library-type="${tab.id}" role="tab" aria-selected="${lessonLibraryTypeFilter === tab.id}">${tab.label}</button>
        `).join("")}
      </div>
    `;
  }

  function publicMonthlySeries() {
    return curriculumSeriesList().filter((s) => ["published", "featured"].includes(s.status));
  }

  // --- Event delegation ---
  document.addEventListener("click", (event) => {
    const createBtn = event.target.closest("#adminCreateCurriculumSeriesButton");
    if (createBtn) {
      adminSeriesEditorId = "new";
      const recovered = loadLocalDraft("new");
      adminSeriesDraftLocal = recovered?.series || emptySeriesDraft();
      adminSeriesDirty = Boolean(recovered);
      adminSeriesPreviewMode = false;
      renderAdminCurriculumSeriesManager();
      return;
    }

    const editBtn = event.target.closest("[data-series-edit]");
    if (editBtn) {
      const id = editBtn.getAttribute("data-series-edit");
      const recovered = loadLocalDraft(id);
      const live = curriculumSeriesList().find((s) => s.id === id);
      adminSeriesEditorId = id;
      adminSeriesDraftLocal = recovered?.series || live || emptySeriesDraft();
      adminSeriesDirty = Boolean(recovered);
      adminSeriesLastSavedAt = recovered?.savedAt || live?.updatedAt || "";
      adminSeriesPreviewMode = false;
      renderAdminCurriculumSeriesManager();
      return;
    }

    const dupBtn = event.target.closest("[data-series-duplicate]");
    if (dupBtn) {
      duplicateSeries(dupBtn.getAttribute("data-series-duplicate"));
      return;
    }

    if (event.target.closest("[data-series-back]")) {
      if (adminSeriesDirty && !window.confirm("You have unsaved curriculum changes. Leave anyway?")) return;
      adminSeriesEditorId = "";
      adminSeriesDraftLocal = null;
      adminSeriesPreviewMode = false;
      renderAdminCurriculumSeriesManager();
      return;
    }

    if (event.target.closest("[data-series-preview]")) {
      adminSeriesDraftLocal = readSeriesForm();
      adminSeriesPreviewMode = !adminSeriesPreviewMode;
      markSeriesDirty();
      renderAdminCurriculumSeriesManager();
      return;
    }

    if (event.target.closest("[data-series-save-draft]")) {
      saveSeries({ publish: false });
      return;
    }

    if (event.target.closest("[data-series-publish]")) {
      saveSeries({ publish: true });
      return;
    }

    const clearWeek = event.target.closest("[data-series-clear-week]");
    if (clearWeek) {
      const n = clearWeek.getAttribute("data-series-clear-week");
      const select = document.querySelector(`[name="weekPlan_${n}"]`);
      if (select) select.value = "";
      adminSeriesDraftLocal = readSeriesForm();
      markSeriesDirty();
      renderAdminCurriculumSeriesManager();
      return;
    }

    const stepBtn = event.target.closest("[data-lesson-editor-step]");
    if (stepBtn) {
      adminLessonEditorStep = stepBtn.getAttribute("data-lesson-editor-step") || "basics";
      applyGuidedLessonEditorStep();
      return;
    }

    const typeTab = event.target.closest("[data-lesson-library-type]");
    if (typeTab) {
      lessonLibraryTypeFilter = typeTab.getAttribute("data-lesson-library-type") || "all";
      openMonthlySeriesId = "";
      if (typeof setView === "function") setView("lessons");
      else if (typeof renderCategoryPage === "function") renderCategoryPage("lessons");
      return;
    }

    const openSeries = event.target.closest("[data-open-monthly-series]");
    if (openSeries) {
      openMonthlySeriesId = openSeries.getAttribute("data-open-monthly-series") || "";
      if (typeof setView === "function") setView("lessons");
      else if (typeof renderCategoryPage === "function") renderCategoryPage("lessons");
      return;
    }

    if (event.target.closest("[data-close-monthly-series]")) {
      openMonthlySeriesId = "";
      if (typeof setView === "function") setView("lessons");
      else if (typeof renderCategoryPage === "function") renderCategoryPage("lessons");
      return;
    }

    const openWeek = event.target.closest("[data-open-week-plan]");
    if (openWeek) {
      const planId = openWeek.getAttribute("data-open-week-plan");
      if (typeof openCurriculumLessonPlan === "function") openCurriculumLessonPlan(planId);
      else if (typeof setView === "function") {
        // Fall back: browse to lesson resource id if mapped
        const resource = (typeof resources !== "undefined" ? resources : []).find((r) => r._curriculumLessonPlan?.id === planId || r.id === planId);
        if (resource && typeof openResource === "function") openResource(resource.id);
      }
      return;
    }

    const favBtn = event.target.closest("[data-toggle-series-favorite]");
    if (favBtn) {
      const id = `series:${favBtn.getAttribute("data-toggle-series-favorite")}`;
      if (typeof favorites !== "undefined" && Array.isArray(favorites)) {
        const idx = favorites.indexOf(id);
        if (idx >= 0) favorites.splice(idx, 1);
        else favorites.push(id);
        if (typeof saveFavorites === "function") saveFavorites();
        if (typeof setView === "function") setView("lessons");
        else if (typeof renderCategoryPage === "function") renderCategoryPage("lessons");
      }
      return;
    }

    const synRemove = event.target.closest("[data-synonym-remove]");
    if (synRemove) {
      saveSynonym({ id: synRemove.getAttribute("data-synonym-remove"), remove: true, from: "x", to: "Math" });
      return;
    }

    const synToggle = event.target.closest("[data-synonym-toggle]");
    if (synToggle) {
      const id = synToggle.getAttribute("data-synonym-toggle");
      const curriculum = typeof effectiveCurriculum === "function" ? effectiveCurriculum() : {};
      const rule = (curriculum.importSynonyms || []).find((item) => item.id === id);
      if (rule) saveSynonym({ ...rule, disabled: !rule.disabled });
      return;
    }

    const downloadWeek = event.target.closest("[data-download-week-plan]");
    if (downloadWeek) {
      const planId = downloadWeek.getAttribute("data-download-week-plan");
      const resource = (typeof resources !== "undefined" ? resources : []).find((r) => r._curriculumLessonPlan?.id === planId || r.id === planId);
      if (resource && typeof downloadLessonPlanWeekly === "function") downloadLessonPlanWeekly(resource);
      else if (resource && typeof downloadResource === "function") downloadResource(resource.id);
      return;
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.closest("#adminCurriculumSeriesForm")) {
      adminSeriesDraftLocal = readSeriesForm();
      if (event.target.name === "weekCount") {
        const api = seriesApi();
        adminSeriesDraftLocal.weeks = api?.mergeSeriesWeeks?.(adminSeriesDraftLocal.weeks, adminSeriesDraftLocal.weekCount)
          || adminSeriesDraftLocal.weeks;
        renderAdminCurriculumSeriesManager();
      }
      markSeriesDirty();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.closest("#adminCurriculumSeriesForm")) {
      adminSeriesDraftLocal = readSeriesForm();
      markSeriesDirty();
    }
  });

  document.addEventListener("submit", (event) => {
    const synForm = event.target.closest("#adminImportSynonymForm");
    if (synForm) {
      event.preventDefault();
      const from = synForm.from?.value || "";
      const to = synForm.to?.value || "";
      saveSynonym({ from, to, field: "learningDomain" });
      synForm.reset();
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (adminSeriesDirty && adminSeriesEditorId) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // Public API for app.js hooks
  globalThis.LLHMonthlyCurriculumPhase1 = {
    renderAdminCurriculumSeriesManager,
    applyGuidedLessonEditorStep,
    lessonLibraryTypeTabsHtml,
    monthlySeriesCardHtml,
    renderMonthlySeriesDetail,
    publicMonthlySeries,
    getLessonLibraryTypeFilter: () => lessonLibraryTypeFilter,
    setLessonLibraryTypeFilter: (value) => { lessonLibraryTypeFilter = value || "all"; },
    getOpenMonthlySeriesId: () => openMonthlySeriesId,
    setOpenMonthlySeriesId: (value) => { openMonthlySeriesId = value || ""; },
    seriesCoverUrl,
    resetLessonEditorStep: () => { adminLessonEditorStep = "basics"; },
  };
})();
