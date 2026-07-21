/**
 * Phase 1 Monthly Curriculum UI (polished) + guided lesson editor helpers.
 * Loaded after app.js. Uses CurriculumSeries / CurriculumLearningDomains / LlhLessonPlanCovers.
 */
(function monthlyCurriculumPhase1Module() {
  const SERIES_AGES = ["Infant", "Toddler", "Preschool"];
  const SERIES_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const SERIES_SEASONS = ["Spring", "Summer", "Fall", "Winter", "Back to School", "Holiday"];
  const SERIES_STATUSES = ["draft", "needs_review", "published", "featured", "archived"];
  const OFFICIAL_DOMAINS = [
    "Social Emotional",
    "Language & Literacy",
    "Math",
    "Science",
    "Physical Development",
    "Creative Arts",
  ];
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
  let lessonLibraryTypeFilter = "plans";
  let openMonthlySeriesId = "";

  function normalizeLessonLibraryTypeFilter(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "curriculum" || raw === "monthly") return "curriculum";
    if (raw === "favorites" || raw === "saved") return "favorites";
    // Legacy All / Weekly tabs collapse into Lesson Plans.
    if (raw === "all" || raw === "weekly" || raw === "plans" || raw === "lessons") return "plans";
    return "plans";
  }

  lessonLibraryTypeFilter = normalizeLessonLibraryTypeFilter(lessonLibraryTypeFilter);
  let monthlyLibraryFilters = {
    month: "",
    season: "",
    age: "",
    plan: "",
    theme: "",
  };

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

  function coversApi() {
    return globalThis.LlhLessonPlanCovers || null;
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

  function publicLessonPlans() {
    const lib = typeof effectiveCurriculumLibrary === "function" ? effectiveCurriculumLibrary() : null;
    return Array.isArray(lib?.lessonPlans) ? lib.lessonPlans : [];
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
      theme: "",
      age: "Preschool",
      month: "",
      season: "",
      year: String(new Date().getFullYear()),
      weekCount: 4,
      overallGoals: "",
      overallMaterials: "",
      familyConnection: "",
      learningDomains: [],
      books: [],
      songs: [],
      coverImageUrl: "",
      coverImageAlt: "",
      coverImageSource: "mapped",
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
    } catch { /* ignore */ }
  }

  function loadLocalDraft(id) {
    try {
      const raw = localStorage.getItem(draftStorageKey(id || "new"));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearLocalDraft(id) {
    try { localStorage.removeItem(draftStorageKey(id || "new")); } catch { /* ignore */ }
  }

  function seriesWithLinkedWeekThemes(series) {
    const plans = lessonPlansForPicker();
    const linkedPlans = (series?.weeks || [])
      .map((week) => plans.find((plan) => plan.id === week.lessonPlanId))
      .filter(Boolean);
    const weekThemes = linkedPlans.map((plan) => [plan.title, plan.theme].filter(Boolean).join(" ")).filter(Boolean);
    return {
      ...series,
      linkedPlans,
      weekThemes,
    };
  }

  function resolveSeriesCover(series) {
    const enriched = seriesWithLinkedWeekThemes(series || {});
    const api = coversApi();
    if (api?.resolveCurriculumSeriesCover) {
      return api.resolveCurriculumSeriesCover(enriched);
    }
    const url = String(series?.coverImageUrl || "").trim();
    if (url) {
      return { url, alt: series.coverImageAlt || series.title || "Monthly curriculum", source: "uploaded", position: "center" };
    }
    return {
      url: api?.DEFAULT_COVER || "/images/lesson-covers/default.svg",
      alt: series?.title || "Monthly curriculum",
      source: "default",
      position: "center",
    };
  }

  function seriesCoverUrl(series) {
    return resolveSeriesCover(series).url;
  }

  function resolvePlanCover(plan) {
    if (typeof resolveLessonPlanCoverForResource === "function") {
      return resolveLessonPlanCoverForResource(plan);
    }
    const api = coversApi();
    if (api?.resolveLessonPlanCover) return api.resolveLessonPlanCover(plan);
    return { url: plan?.coverImageUrl || "/images/lesson-covers/default.svg", alt: plan?.title || "", position: "center" };
  }

  function shortSummary(text, max = 140) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
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

  function parseTextLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
  }

  function booksFromTextarea(value) {
    return parseTextLines(value).slice(0, 20).map((line) => {
      const [title, author, notes] = line.split("|").map((part) => part.trim());
      return { title, author: author || "", notes: notes || "" };
    }).filter((entry) => entry.title);
  }

  function songsFromTextarea(value) {
    return parseTextLines(value).slice(0, 20).map((line) => {
      const [title, notes] = line.split("|").map((part) => part.trim());
      return { title, notes: notes || "" };
    }).filter((entry) => entry.title);
  }

  function booksToTextarea(books) {
    return (books || []).map((book) => [book.title, book.author, book.notes].filter(Boolean).join(" | ")).join("\n");
  }

  function songsToTextarea(songs) {
    return (songs || []).map((song) => [song.title, song.notes].filter(Boolean).join(" | ")).join("\n");
  }

  function readSeriesForm() {
    const form = document.querySelector("#adminCurriculumSeriesForm");
    if (!form) return adminSeriesDraftLocal || emptySeriesDraft();
    const weekCount = Number(form.weekCount?.value) === 5 ? 5 : 4;
    const weeks = [];
    for (let n = 1; n <= weekCount; n += 1) {
      const select = form.querySelector(`[name="weekPlan_${n}"]`);
      const labelInput = form.querySelector(`[name="weekLabel_${n}"]`);
      weeks.push({
        weekNumber: n,
        lessonPlanId: select?.value || "",
        displayOrder: n,
        label: labelInput?.value || "",
      });
    }
    const selectedDomains = [...form.querySelectorAll('input[name="learningDomains"]:checked')].map((el) => el.value);
    const coverUrl = form.coverImageUrl?.value || "";
    return {
      ...(adminSeriesDraftLocal || emptySeriesDraft()),
      id: form.id?.value || adminSeriesEditorId || "",
      title: form.title?.value || "",
      description: form.description?.value || "",
      theme: form.theme?.value || "",
      age: form.age?.value || "Preschool",
      month: form.month?.value || "",
      season: form.season?.value || "",
      year: form.year?.value || "",
      weekCount,
      overallGoals: form.overallGoals?.value || "",
      overallMaterials: form.overallMaterials?.value || "",
      familyConnection: form.familyConnection?.value || "",
      learningDomains: selectedDomains,
      books: booksFromTextarea(form.booksText?.value || ""),
      songs: songsFromTextarea(form.songsText?.value || ""),
      coverImageUrl: coverUrl,
      coverImageAlt: form.coverImageAlt?.value || "",
      coverImageSource: coverUrl ? (form.coverImageSource?.value || "uploaded") : "mapped",
      plan: form.plan?.value === "Pro" ? "Pro" : "Free",
      status: form.status?.value || "draft",
      featured: Boolean(form.featured?.checked),
      displayOrder: Number(form.displayOrder?.value) || 0,
      weeks,
    };
  }

  function autoTitle(series) {
    if (series.title && series.title !== "Untitled Curriculum") return series.title;
    const parts = [series.month || series.season, series.age, "Curriculum"].filter(Boolean);
    return parts.join(" ") || "Monthly Curriculum";
  }

  function pullOverviewFromWeeks(series, plans) {
    const linked = (series.weeks || [])
      .map((week) => plans.find((plan) => plan.id === week.lessonPlanId))
      .filter(Boolean);
    if (!linked.length) return series;
    const domains = new Set(series.learningDomains || []);
    const books = [...(series.books || [])];
    const songs = [...(series.songs || [])];
    const materials = [];
    const goals = [];
    const family = [];
    linked.forEach((plan) => {
      (plan.learningDomains || []).forEach((domain) => domains.add(domain));
      (plan.books || []).forEach((book) => {
        if (book?.title && !books.some((entry) => entry.title === book.title)) books.push(book);
      });
      (plan.songs || []).forEach((song) => {
        if (song?.title && !songs.some((entry) => entry.title === song.title)) songs.push(song);
      });
      if (plan.weeklyMaterials) materials.push(plan.weeklyMaterials);
      if (plan.objectives) goals.push(plan.objectives);
      if (plan.familyConnection) family.push(plan.familyConnection);
    });
    return {
      ...series,
      title: autoTitle(series),
      theme: series.theme || linked.map((plan) => plan.theme).filter(Boolean).slice(0, 4).join(" · "),
      description: series.description || linked.map((plan) => plan.theme || plan.title).filter(Boolean).join(" → "),
      overallGoals: series.overallGoals || goals.slice(0, 3).join("\n\n"),
      overallMaterials: series.overallMaterials || materials.slice(0, 3).join("\n\n"),
      familyConnection: series.familyConnection || family[0] || "",
      learningDomains: [...domains].slice(0, 6),
      books: books.slice(0, 12),
      songs: songs.slice(0, 12),
    };
  }

  function applySuggestedCover(series) {
    const resolved = resolveSeriesCover({ ...series, coverImageUrl: "" });
    return {
      ...series,
      coverImageUrl: resolved.url.startsWith("data:") ? "" : resolved.url,
      coverImageAlt: series.coverImageAlt || resolved.alt || "",
      coverImageSource: resolved.source || "mapped",
      coverImagePosition: resolved.position || "center",
    };
  }

  function validationErrorsHtml(errors) {
    if (!errors?.length) return "";
    return `<div class="access-notice" role="alert"><strong>Fix before publishing:</strong><ul>${
      errors.map((err) => `<li>${esc(err)}</li>`).join("")
    }</ul></div>`;
  }

  function weekSlotHtml(weekNumber, week, plans, ageFilter) {
    const plan = plans.find((item) => item.id === week.lessonPlanId);
    const filtered = ageFilter
      ? plans.filter((item) => String(item.age || "").toLowerCase().includes(ageFilter.toLowerCase()) || item.id === week.lessonPlanId)
      : plans;
    const options = [
      `<option value="">— Empty week —</option>`,
      ...filtered.map((item) => `<option value="${esc(item.id)}" ${item.id === week.lessonPlanId ? "selected" : ""}>${esc(item.title)} (${esc(item.age)} · ${esc(item.status)})</option>`),
    ].join("");
    return `
      <div class="admin-fieldset curriculum-series-week-slot ${week.lessonPlanId ? "is-filled" : "is-empty"}" data-series-week="${weekNumber}">
        <div class="section-heading">
          <strong>Week ${weekNumber}</strong>
          ${week.lessonPlanId ? `<span class="tag">Linked</span>` : `<span class="tag tag-hidden">Empty</span>`}
        </div>
        <label>Week label (optional)
          <input name="weekLabel_${weekNumber}" value="${esc(week.label || "")}" placeholder="e.g. Familiar Faces & Bonding" />
        </label>
        <label>Lesson plan
          <select name="weekPlan_${weekNumber}">${options}</select>
        </label>
        ${plan
          ? `<p class="muted-copy"><strong>${esc(plan.theme || plan.title)}</strong><br>${esc(shortSummary(plan.weeklyOverview || plan.objectives, 120))}</p>`
          : `<p class="muted-copy">No weekly plan assigned yet. Pick any existing lesson plan — this is a playlist link, not a copy.</p>`}
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
    const cover = resolveSeriesCover(series);
    const selectedDomains = new Set(series.learningDomains || []);
    return `
      <form id="adminCurriculumSeriesForm" class="panel-form admin-stacked-form curriculum-series-builder">
        <input type="hidden" name="id" value="${esc(series.id || "")}" />
        <input type="hidden" name="coverImageSource" value="${esc(series.coverImageSource || "mapped")}" />
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
        <div class="account-actions-row" style="margin-bottom:0.75rem;flex-wrap:wrap;gap:8px">
          <button type="button" class="ghost-button" data-series-auto-title>Suggest title</button>
          <button type="button" class="ghost-button" data-series-suggest-cover>Suggest cartoon cover</button>
          <button type="button" class="ghost-button" data-series-pull-weeks>Fill overview from linked weeks</button>
        </div>
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
          <label>Theme / focus<input name="theme" value="${esc(series.theme || "")}" placeholder="Fall Leaves · Apples · Pumpkins" /></label>
          <label>Free / Pro
            <select name="plan"><option ${series.plan !== "Pro" ? "selected" : ""}>Free</option><option ${series.plan === "Pro" ? "selected" : ""}>Pro</option></select>
          </label>
        </div>
        <details class="admin-fieldset" open>
          <summary><strong>1. Link weekly plans</strong></summary>
          <p class="muted-copy">Choose existing published plans. Removing a week never deletes the lesson plan. Pickers prefer the curriculum age group.</p>
          ${(series.weeks || []).map((week) => weekSlotHtml(week.weekNumber, week, plans, series.age)).join("")}
        </details>
        <details class="admin-fieldset" open>
          <summary><strong>2. Monthly overview</strong></summary>
          <label>Description / Monthly overview<textarea name="description" rows="3" placeholder="What this month is about…">${esc(series.description || "")}</textarea></label>
          <label>Overall learning goals<textarea name="overallGoals" rows="3">${esc(series.overallGoals || "")}</textarea></label>
          <label>Overall materials<textarea name="overallMaterials" rows="3">${esc(series.overallMaterials || "")}</textarea></label>
          <label>Family connection<textarea name="familyConnection" rows="2">${esc(series.familyConnection || "")}</textarea></label>
          <fieldset class="admin-fieldset">
            <legend>Developmental domains</legend>
            <div class="curriculum-domain-grid">
              ${OFFICIAL_DOMAINS.map((domain) => `
                <label class="admin-inline-toggle">
                  <input type="checkbox" name="learningDomains" value="${esc(domain)}" ${selectedDomains.has(domain) ? "checked" : ""} />
                  <span>${esc(domain)}</span>
                </label>
              `).join("")}
            </div>
          </fieldset>
          <label>Books <small class="muted-copy">(one per line: Title | Author | Notes)</small>
            <textarea name="booksText" rows="3">${esc(booksToTextarea(series.books))}</textarea>
          </label>
          <label>Songs <small class="muted-copy">(one per line: Title | Notes)</small>
            <textarea name="songsText" rows="3">${esc(songsToTextarea(series.songs))}</textarea>
          </label>
        </details>
        <details class="admin-fieldset">
          <summary><strong>3. Cover & publishing</strong></summary>
          <p class="muted-copy">Uses the same themed cartoon cover library as weekly lesson plans. Suggest a cover from month/season, or paste an existing image URL.</p>
          <label>Cover image URL<input name="coverImageUrl" value="${esc(series.coverImageUrl || "")}" placeholder="/images/lesson-covers/…" /></label>
          <label>Cover alt text<input name="coverImageAlt" value="${esc(series.coverImageAlt || "")}" /></label>
          <div class="curriculum-series-cover-preview">
            <img src="${esc(cover.url)}" alt="${esc(cover.alt)}" style="width:100%;max-width:420px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;" />
          </div>
          <div class="form-grid-two">
            <label>Status
              <select name="status">${SERIES_STATUSES.map((s) => `<option value="${s}" ${series.status === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}</select>
            </label>
            <label>Display order<input name="displayOrder" type="number" value="${esc(String(series.displayOrder || 0))}" /></label>
          </div>
          <label class="admin-inline-toggle"><input type="checkbox" name="featured" ${series.featured ? "checked" : ""} /> <span>Featured</span></label>
        </details>
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
    const cover = resolveSeriesCover(series);
    return `
      <article class="admin-content-card is-${esc(series.status || "draft")}">
        <div class="admin-mobile-card-body" style="gap:12px">
          <img src="${esc(cover.url)}" alt="" width="120" height="68" style="width:120px;height:68px;object-fit:cover;border-radius:8px;flex:0 0 auto;" />
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
    return `
      <details class="admin-fieldset" id="adminImportSynonymManager">
        <summary><strong>Importer synonym manager</strong></summary>
        <p class="muted-copy">Teach the importer new wording for learning domains or field headings. Pasted text stays flexible; saved values stay official.</p>
        <form id="adminImportSynonymForm" class="form-grid-two">
          <label>Pasted wording<input name="from" placeholder="e.g. Early Math or Learning Goals" required /></label>
          <label>Type
            <select name="field">
              <option value="learningDomain">Learning domain value</option>
              <option value="headingAlias">Field heading alias</option>
            </select>
          </label>
          <label>Save as (domain or FIELD_KEY)
            <input name="to" list="adminImportSynonymTargets" placeholder="Math or LEARNING_OBJECTIVES" required />
            <datalist id="adminImportSynonymTargets">
              ${OFFICIAL_DOMAINS.map((d) => `<option value="${esc(d)}"></option>`).join("")}
              <option value="LEARNING_OBJECTIVES"></option>
              <option value="WEEKLY_MATERIALS"></option>
              <option value="TEACHER_ROLE"></option>
              <option value="DIRECTIONS"></option>
              <option value="OBSERVATION_OPPORTUNITIES"></option>
              <option value="ADAPTATIONS"></option>
              <option value="SAFETY_NOTES"></option>
              <option value="FAMILY_CONNECTION"></option>
            </datalist>
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
                <span class="tag">${esc(rule.field || "learningDomain")}</span>
                ${rule.disabled ? `<span class="tag">Disabled</span>` : ""}
              </div>
              <div class="form-actions">
                <button type="button" class="ghost-button" data-synonym-toggle="${esc(rule.id)}">${rule.disabled ? "Enable" : "Disable"}</button>
                <button type="button" class="ghost-button" data-synonym-remove="${esc(rule.id)}">Remove</button>
              </div>
            </article>
          `).join("") || `<div class="empty-state">No custom synonyms yet. Built-in domain and heading matches already work.</div>`}
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
          <p class="muted-copy">Link existing weekly plans into a month. Use the helper buttons to auto-fill title, cover, and overview.</p>
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
    let series = readSeriesForm();
    if (!series.coverImageUrl) series = applySuggestedCover(series);
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
    form.querySelectorAll("#admin-lesson-basics, #admin-lesson-cover, #admin-lesson-weekly, .curriculum-daily-editor, #admin-lesson-resources, fieldset.admin-fieldset").forEach((el) => {
      el.hidden = adminLessonEditorStep !== "review";
    });
    (show[adminLessonEditorStep] || []).forEach((sel) => {
      form.querySelectorAll(sel).forEach((el) => { el.hidden = false; });
    });
    form.querySelectorAll(".admin-lesson-sticky-bar, .admin-lesson-form-actions, .curriculum-guided-progress, .curriculum-activity-sync-notice, .back-button, h4, .muted-copy").forEach((el) => {
      el.hidden = false;
    });
  }

  function monthlySeriesCardHtml(series) {
    const cover = resolveSeriesCover(series);
    const weekCount = series.weekCount || (series.weeks || []).length || 4;
    const favId = `series:${series.id}`;
    const isFav = typeof favorites !== "undefined" && Array.isArray(favorites) && favorites.includes(favId);
    const planBadge = series.plan === "Pro" ? "Pro" : "Free";
    const monthLabel = series.month || series.season || "Monthly";
    const ageLabel = series.ageDetail
      ? `${series.age} (${series.ageDetail})`
      : (series.age || "Preschool");
    const progress = readCurriculumProgress(series.id);
    const progressLabel = curriculumProgressSummary(series, progress);
    return `
      <article
        class="resource-card lesson-plan-card browse-card has-cover-image netflix-cover-card curriculum-series-card curriculum-series-card--large"
        data-open-monthly-series="${esc(series.id)}"
        role="button"
        tabindex="0"
        aria-label="Open ${esc(series.title || "monthly curriculum")}"
      >
        <div class="browse-card-cover lesson-plan-card__cover-wrap">
          <img
            class="lesson-plan-card__cover"
            src="${esc(cover.url)}"
            alt="${esc(cover.alt || series.title || "Monthly curriculum")}"
            width="640"
            height="360"
            loading="lazy"
            decoding="async"
            style="object-position:${esc(cover.position || "center")}"
          />
          <div class="browse-card-cover-scrim" aria-hidden="true"></div>
          <span class="browse-card-badge ${planBadge === "Pro" ? "is-pro" : "is-free"}">${esc(planBadge)}</span>
          <button
            class="lesson-plan-save-btn browse-card-save ${isFav ? "is-saved" : ""}"
            type="button"
            data-toggle-series-favorite="${esc(series.id)}"
            aria-label="${isFav ? "Remove from favorites" : "Save curriculum"}"
            aria-pressed="${isFav}"
          >${isFav ? "★" : "☆"}</button>
          <div class="browse-card-cover-overlay">
            <span class="browse-card-age">${esc(ageLabel)} · ${esc(monthLabel)}</span>
            <h3 class="browse-card-title-overlay">${esc(series.title || "Monthly Curriculum")}</h3>
            <p class="browse-card-activity-count">${weekCount} weeks · ${esc(progressLabel)}</p>
          </div>
        </div>
        <div class="browse-card-always-actions lesson-plan-card-actions curriculum-series-card-actions">
          <button type="button" class="primary-button" data-open-monthly-series="${esc(series.id)}">View Curriculum</button>
          <button type="button" class="ghost-button" data-start-curriculum="${esc(series.id)}">Start Curriculum</button>
          <button type="button" class="ghost-button" data-schedule-entire-month="${esc(series.id)}">Assign to Calendar</button>
        </div>
      </article>
    `;
  }

  function listBlock(title, items, mapper) {
    if (!items?.length) return "";
    return `
      <section class="curriculum-series-detail-block">
        <h3>${esc(title)}</h3>
        <ul>${items.map((item) => `<li>${esc(mapper(item))}</li>`).join("")}</ul>
      </section>
    `;
  }

  function curriculumProgressKey(seriesId) {
    return `llhCurriculumProgress:${String(seriesId || "").trim()}`;
  }

  function readCurriculumProgress(seriesId) {
    try {
      const raw = localStorage.getItem(curriculumProgressKey(seriesId));
      if (!raw) return { startedAt: "", completedWeeks: [], lastOpenedWeek: 0 };
      const parsed = JSON.parse(raw);
      return {
        startedAt: String(parsed.startedAt || ""),
        completedWeeks: Array.isArray(parsed.completedWeeks)
          ? parsed.completedWeeks.map(Number).filter((n) => n >= 1 && n <= 5)
          : [],
        lastOpenedWeek: Number(parsed.lastOpenedWeek) || 0,
      };
    } catch {
      return { startedAt: "", completedWeeks: [], lastOpenedWeek: 0 };
    }
  }

  function writeCurriculumProgress(seriesId, progress) {
    localStorage.setItem(curriculumProgressKey(seriesId), JSON.stringify({
      startedAt: progress.startedAt || "",
      completedWeeks: progress.completedWeeks || [],
      lastOpenedWeek: progress.lastOpenedWeek || 0,
      updatedAt: new Date().toISOString(),
    }));
  }

  function startCurriculumProgress(seriesId) {
    const current = readCurriculumProgress(seriesId);
    if (!current.startedAt) current.startedAt = new Date().toISOString();
    if (!current.lastOpenedWeek) current.lastOpenedWeek = 1;
    writeCurriculumProgress(seriesId, current);
    return current;
  }

  function markCurriculumWeekComplete(seriesId, weekNumber) {
    const current = startCurriculumProgress(seriesId);
    const week = Number(weekNumber) || 0;
    if (week && !current.completedWeeks.includes(week)) {
      current.completedWeeks = [...current.completedWeeks, week].sort((a, b) => a - b);
    }
    current.lastOpenedWeek = week || current.lastOpenedWeek;
    writeCurriculumProgress(seriesId, current);
    return current;
  }

  function curriculumProgressSummary(series, progress) {
    const weekCount = Number(series?.weekCount) || (series?.weeks || []).length || 4;
    const completed = (progress?.completedWeeks || []).filter((n) => n <= weekCount).length;
    const started = Boolean(progress?.startedAt);
    if (!started && completed === 0) return `0 of ${weekCount} weeks started`;
    if (completed >= weekCount) return `All ${weekCount} weeks completed`;
    if (completed === 0) return `Started · Week 1 of ${weekCount}`;
    return `Week ${completed} of ${weekCount} completed`;
  }

  function weekDisplayLabel(week, plan) {
    return String(week?.label || plan?.theme || plan?.title || "Weekly lesson plan").trim();
  }

  function renderMonthlySeriesDetail(series) {
    const plans = publicLessonPlans();
    const byId = new Map(plans.map((p) => [p.id, p]));
    const cover = resolveSeriesCover(series);
    const weekCount = series.weekCount || 4;
    const progress = readCurriculumProgress(series.id);
    const progressLabel = curriculumProgressSummary(series, progress);
    const timeline = (series.weeks || []).map((week) => {
      const plan = byId.get(week.lessonPlanId);
      return {
        weekNumber: week.weekNumber,
        label: weekDisplayLabel(week, plan),
        completed: (progress.completedWeeks || []).includes(Number(week.weekNumber)),
      };
    });
    const skills = Array.isArray(series.learningDomains) ? series.learningDomains : [];
    return `
      <section class="curriculum-series-detail curriculum-series-detail--premium" data-monthly-series-detail="${esc(series.id)}">
        <button type="button" class="ghost-button back-button" data-close-monthly-series>← Back to Curriculum</button>
        <div class="curriculum-series-detail-hero">
          <img src="${esc(cover.url)}" alt="${esc(cover.alt || series.title || "")}" />
          <div class="curriculum-series-detail-hero-copy">
            <p class="eyebrow">Monthly Curriculum</p>
            <h2>${esc(series.title || "Monthly Curriculum")}</h2>
            <p class="muted-copy">${esc(series.age)}${series.ageDetail ? ` (${esc(series.ageDetail)})` : ""} · ${weekCount} weeks · ${esc(series.plan || "Free")}</p>
            <p class="curriculum-progress-pill" data-curriculum-progress="${esc(series.id)}">${esc(progressLabel)}</p>
            <div class="account-actions-row curriculum-series-detail-actions">
              <button type="button" class="primary-button" data-start-curriculum="${esc(series.id)}">Start Curriculum</button>
              <button type="button" class="ghost-button" data-schedule-entire-month="${esc(series.id)}">Assign to Calendar</button>
              <button type="button" class="ghost-button" data-toggle-series-favorite="${esc(series.id)}">☆ Favorite</button>
            </div>
          </div>
        </div>

        <section class="curriculum-series-detail-block">
          <h3>About this curriculum</h3>
          <p>${esc(series.description || "A playful month of weekly themes for your classroom.")}</p>
        </section>

        ${skills.length ? `
          <section class="curriculum-series-detail-block">
            <h3>Skills covered</h3>
            <div class="tag-row">${skills.map((domain) => `<span class="tag">${esc(domain)}</span>`).join("")}</div>
          </section>
        ` : ""}

        ${series.overallGoals ? `<section class="curriculum-series-detail-block"><h3>Learning goals</h3><p>${esc(series.overallGoals)}</p></section>` : ""}
        ${series.overallMaterials ? `<section class="curriculum-series-detail-block"><h3>Materials</h3><p>${esc(series.overallMaterials)}</p></section>` : ""}
        ${series.familyConnection ? `<section class="curriculum-series-detail-block"><h3>Family connection</h3><p>${esc(series.familyConnection)}</p></section>` : ""}
        ${listBlock("Books", series.books, (book) => [book.title, book.author].filter(Boolean).join(" — "))}
        ${listBlock("Songs", series.songs, (song) => song.title)}

        <section class="curriculum-series-detail-block">
          <h3>Month at a glance</h3>
          <ol class="curriculum-series-timeline">
            ${timeline.map((item) => `
              <li class="${item.completed ? "is-complete" : ""}">
                <span class="curriculum-series-timeline-week">Week ${item.weekNumber}</span>
                <span class="curriculum-series-timeline-label">${esc(item.label)}</span>
                ${item.completed ? `<span class="tag">Done</span>` : ""}
              </li>
            `).join("")}
          </ol>
        </section>

        <div class="curriculum-series-week-list">
          <h3>Weekly lesson plans</h3>
          ${(series.weeks || []).map((week) => {
            const plan = byId.get(week.lessonPlanId);
            if (!plan) {
              const requested = week.label || week.missingPlanTitle || "";
              return `
                <article class="curriculum-series-week-mini is-empty" data-curriculum-week="${week.weekNumber}">
                  <strong>Week ${week.weekNumber}</strong>
                  <p class="muted-copy">${requested
                    ? `Needs exact plan: “${esc(requested)}” (not auto-linked).`
                    : "No weekly plan linked yet."}</p>
                </article>
              `;
            }
            const planCover = resolvePlanCover(plan);
            const summary = shortSummary(plan.weeklyOverview || plan.objectives || plan.theme, 160);
            const label = weekDisplayLabel(week, plan);
            const done = (progress.completedWeeks || []).includes(Number(week.weekNumber));
            return `
              <article class="curriculum-series-week-mini ${done ? "is-complete" : ""}" data-curriculum-week="${week.weekNumber}">
                <div class="curriculum-series-week-mini-media">
                  <img src="${esc(planCover.url)}" alt="${esc(planCover.alt || plan.title)}" loading="lazy" />
                </div>
                <div class="curriculum-series-week-mini-body">
                  <p class="eyebrow">Week ${week.weekNumber}${done ? " · Completed" : ""}</p>
                  <strong>${esc(label)}</strong>
                  <p class="muted-copy">${esc(plan.title)}${plan.theme ? ` · ${esc(plan.theme)}` : ""}</p>
                  <p>${esc(summary)}</p>
                  <div class="account-actions-row">
                    <button type="button" class="primary-button" data-open-week-plan="${esc(plan.id)}" data-curriculum-series-id="${esc(series.id)}" data-curriculum-week-number="${week.weekNumber}">View Lesson Plan</button>
                    <button type="button" class="ghost-button" data-curriculum-assign-week="${esc(plan.id)}" data-curriculum-series-id="${esc(series.id)}" data-curriculum-week-number="${week.weekNumber}">Use This Plan</button>
                    <button type="button" class="ghost-button" data-mark-curriculum-week-complete="${esc(series.id)}" data-curriculum-week-number="${week.weekNumber}">${done ? "Completed" : "Mark Complete"}</button>
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
      { id: "plans", label: "Lesson Plans" },
      { id: "curriculum", label: "Curriculum" },
      { id: "favorites", label: "Favorites" },
    ];
    const active = normalizeLessonLibraryTypeFilter(lessonLibraryTypeFilter);
    return `
      <div class="lesson-library-type-tabs netflix-library-tabs" role="tablist" aria-label="Lesson library sections" data-netflix-library-tabs>
        ${tabs.map((tab) => `
          <button type="button" class="ghost-button netflix-library-tab ${active === tab.id ? "is-active" : ""}" data-lesson-library-type="${tab.id}" role="tab" aria-selected="${active === tab.id ? "true" : "false"}">${tab.label}</button>
        `).join("")}
      </div>
    `;
  }

  function featuredCurriculumBannerHtml(seriesList) {
    const list = Array.isArray(seriesList) ? seriesList : [];
    const featured = list.find((item) => item.featured || item.status === "featured") || list[0];
    if (!featured) return "";
    const cover = resolveSeriesCover(featured);
    const weekCount = featured.weekCount || (featured.weeks || []).length || 4;
    const blurb = String(featured.description || featured.theme || "A full month of ready-to-teach weekly themes.")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return `
      <section class="library-featured-banner has-cover-image netflix-featured-banner curriculum-featured-banner" aria-label="Featured monthly curriculum">
        <div class="library-featured-banner-media">
          <img
            class="library-featured-banner-image"
            src="${esc(cover.url)}"
            alt="${esc(cover.alt || featured.title || "Monthly curriculum")}"
            width="960"
            height="540"
            loading="eager"
            decoding="async"
            style="object-position:${esc(cover.position || "center")}"
          />
          <div class="library-featured-banner-scrim" aria-hidden="true"></div>
          <span class="browse-card-badge library-featured-banner-badge ${featured.plan === "Pro" ? "is-pro" : "is-free"}">${esc(featured.plan || "Free")}</span>
          <div class="library-featured-banner-overlay">
            <p class="library-featured-banner-eyebrow">Featured Curriculum</p>
            <span class="browse-card-age">${esc(featured.age || "")}${featured.month ? ` · ${esc(featured.month)}` : ""}</span>
            <h3 class="browse-card-title-overlay">${esc(featured.title || "Monthly Curriculum")}</h3>
          </div>
        </div>
        <div class="library-featured-banner-copy">
          <p class="library-featured-banner-blurb">${esc(blurb)}</p>
          <div class="library-featured-banner-actions">
            <button type="button" class="primary-button" data-start-curriculum="${esc(featured.id)}">Start Curriculum</button>
            <button type="button" class="ghost-button" data-open-monthly-series="${esc(featured.id)}">View Curriculum</button>
            <button type="button" class="ghost-button" data-schedule-entire-month="${esc(featured.id)}">Assign to Calendar</button>
          </div>
          <p class="muted-copy">${weekCount} weekly lesson plans included</p>
        </div>
      </section>
    `;
  }

  function buildCurriculumBrowseRows(seriesList) {
    const list = Array.isArray(seriesList) ? seriesList : [];
    const rows = [];
    const byAge = (age) => list.filter((item) => String(item.age || "").toLowerCase() === age.toLowerCase());
    const infant = byAge("Infant");
    const toddler = byAge("Toddler");
    const preschool = byAge("Preschool");
    if (infant.length) rows.push({ key: "curriculum-infant", title: "Infant Curriculums", seriesItems: infant });
    if (toddler.length) rows.push({ key: "curriculum-toddler", title: "Toddler Curriculums", seriesItems: toddler });
    if (preschool.length) rows.push({ key: "curriculum-preschool", title: "Preschool Curriculums", seriesItems: preschool });
    if (!rows.length && list.length) {
      rows.push({ key: "curriculum-all", title: "Monthly Curriculums", seriesItems: list });
    }
    return rows;
  }

  function curriculumBrowseRowsHtml(seriesList) {
    const rows = buildCurriculumBrowseRows(seriesList);
    if (!rows.length) {
      return `<div class="empty-state">No monthly curriculums published yet.</div>`;
    }
    return rows.map((row) => {
      const trackId = `browse-track-${row.key}`;
      return `
        <section class="browse-row" data-browse-row="${esc(row.key)}">
          <div class="browse-row-header">
            <h3>${esc(row.title)}</h3>
          </div>
          <div class="browse-row-track-wrap">
            <button type="button" class="browse-row-arrow is-prev" data-browse-scroll="${esc(trackId)}" data-browse-dir="-1" aria-label="Scroll ${esc(row.title)} left">‹</button>
            <div class="browse-row-track" id="${esc(trackId)}">
              ${(row.seriesItems || []).map((entry) => monthlySeriesCardHtml(entry)).join("")}
            </div>
            <button type="button" class="browse-row-arrow is-next" data-browse-scroll="${esc(trackId)}" data-browse-dir="1" aria-label="Scroll ${esc(row.title)} right">›</button>
          </div>
        </section>
      `;
    }).join("");
  }

  function monthlyLibraryFiltersHtml(seriesList) {
    const themes = [...new Set(seriesList.map((s) => s.theme).filter(Boolean))].sort();
    return `
      <div class="monthly-library-filters" role="group" aria-label="Monthly curriculum filters">
        <label><span>Month</span>
          <select data-monthly-filter="month">
            <option value="">All months</option>
            ${SERIES_MONTHS.map((m) => `<option value="${m}" ${monthlyLibraryFilters.month === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </label>
        <label><span>Season</span>
          <select data-monthly-filter="season">
            <option value="">All seasons</option>
            ${SERIES_SEASONS.map((s) => `<option value="${s}" ${monthlyLibraryFilters.season === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
        <label><span>Age</span>
          <select data-monthly-filter="age">
            <option value="">All ages</option>
            ${SERIES_AGES.map((a) => `<option value="${a}" ${monthlyLibraryFilters.age === a ? "selected" : ""}>${a}</option>`).join("")}
          </select>
        </label>
        <label><span>Access</span>
          <select data-monthly-filter="plan">
            <option value="">Free & Pro</option>
            <option value="Free" ${monthlyLibraryFilters.plan === "Free" ? "selected" : ""}>Free</option>
            <option value="Pro" ${monthlyLibraryFilters.plan === "Pro" ? "selected" : ""}>Pro</option>
          </select>
        </label>
        <label><span>Theme</span>
          <select data-monthly-filter="theme">
            <option value="">All themes</option>
            ${themes.map((t) => `<option value="${esc(t)}" ${monthlyLibraryFilters.theme === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
          </select>
        </label>
      </div>
    `;
  }

  function filterPublicMonthlySeries(list) {
    return (list || []).filter((series) => {
      if (monthlyLibraryFilters.month && series.month !== monthlyLibraryFilters.month) return false;
      if (monthlyLibraryFilters.season && series.season !== monthlyLibraryFilters.season) return false;
      if (monthlyLibraryFilters.age && series.age !== monthlyLibraryFilters.age) return false;
      if (monthlyLibraryFilters.plan && series.plan !== monthlyLibraryFilters.plan) return false;
      if (monthlyLibraryFilters.theme && String(series.theme || "") !== monthlyLibraryFilters.theme) return false;
      return true;
    });
  }

  function publicMonthlySeries() {
    return curriculumSeriesList().filter((s) => ["published", "featured"].includes(s.status));
  }

  function firstMondayOfMonth(year, monthName) {
    const monthIndex = SERIES_MONTHS.indexOf(monthName);
    if (monthIndex < 0) return "";
    const date = new Date(Date.UTC(Number(year) || new Date().getFullYear(), monthIndex, 1));
    const day = date.getUTCDay();
    const offset = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function addDaysIso(iso, days) {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  async function scheduleEntireMonth(seriesId) {
    const series = publicMonthlySeries().find((entry) => entry.id === seriesId)
      || curriculumSeriesList().find((entry) => entry.id === seriesId);
    if (!series) {
      if (typeof showActionFeedback === "function") showActionFeedback("Curriculum not found.");
      return;
    }
    if (!isLoggedIn?.() && !hasAdminFullAccess?.()) {
      if (typeof openAuthModal === "function") openAuthModal("login");
      return;
    }
    const linked = (series.weeks || []).filter((week) => week.lessonPlanId);
    if (!linked.length) {
      if (typeof showActionFeedback === "function") showActionFeedback("This curriculum has no weekly plans to schedule.");
      return;
    }
    const suggested = series.month
      ? firstMondayOfMonth(series.year || new Date().getFullYear(), series.month)
      : "";
    const startInput = window.prompt(
      `Schedule “${series.title}” starting which Monday? (YYYY-MM-DD)`,
      suggested || (typeof curriculumPlannerSelectedWeek !== "undefined" ? curriculumPlannerSelectedWeek : ""),
    );
    if (!startInput) return;
    const api = typeof getScheduleApi === "function" ? getScheduleApi() : null;
    const startWeek = api?.weekStartMonday?.(startInput) || startInput;
    const confirmed = window.confirm(
      `Add ${linked.length} weekly plans to your calendar starting ${startWeek}? Weeks that already have a plan will be replaced after you confirm each conflict.`,
    );
    if (!confirmed) return;

    let scheduled = 0;
    let skipped = 0;
    for (const week of linked) {
      const weekStart = addDaysIso(startWeek, (Number(week.weekNumber) - 1) * 7);
      try {
        if (typeof addCurriculumLessonPlanToMainCalendar === "function") {
          await addCurriculumLessonPlanToMainCalendar({
            resourceId: week.lessonPlanId,
            weekStartDate: weekStart,
            ageGroup: series.age,
          });
          scheduled += 1;
        } else if (typeof assignScheduleLessonPlan === "function") {
          await assignScheduleLessonPlan({
            resourceId: week.lessonPlanId,
            weekStartDate: weekStart,
            ageGroup: series.age,
            replaceExisting: true,
          });
          scheduled += 1;
        }
      } catch (error) {
        if (error?.code === "cancelled") skipped += 1;
        else {
          console.warn("Schedule month week failed", week, error);
          skipped += 1;
        }
      }
    }
    if (typeof showActionFeedback === "function") {
      showActionFeedback(
        skipped
          ? `Scheduled ${scheduled} week${scheduled === 1 ? "" : "s"}; ${skipped} skipped.`
          : `Scheduled ${scheduled} week${scheduled === 1 ? "" : "s"} on your calendar.`,
      );
    }
    if (typeof setView === "function" && scheduled) {
      // Stay on curriculum detail; user can open calendar from feedback.
    }
  }

  function rerenderLessons() {
    if (typeof setView === "function") setView("lessons");
    else if (typeof renderCategoryPage === "function") renderCategoryPage("lessons");
  }

  const TAB_ORDER = ["plans", "curriculum", "favorites"];
  let swipeStartX = 0;
  let swipeStartY = 0;
  document.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch || !event.target.closest?.("#view-lessons")) return;
    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
  }, { passive: true });
  document.addEventListener("touchend", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch || !event.target.closest?.("#view-lessons")) return;
    if (event.target.closest?.(".browse-row-track, input, textarea, select, button, a")) return;
    const dx = touch.clientX - swipeStartX;
    const dy = touch.clientY - swipeStartY;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    const current = normalizeLessonLibraryTypeFilter(lessonLibraryTypeFilter);
    const index = TAB_ORDER.indexOf(current);
    if (index < 0) return;
    const next = dx < 0
      ? TAB_ORDER[Math.min(TAB_ORDER.length - 1, index + 1)]
      : TAB_ORDER[Math.max(0, index - 1)];
    if (next === current) return;
    lessonLibraryTypeFilter = next;
    openMonthlySeriesId = "";
    if (typeof lessonLibraryViewAllKey !== "undefined") lessonLibraryViewAllKey = "";
    rerenderLessons();
  }, { passive: true });

  document.addEventListener("click", (event) => {
    if (event.target.closest("#adminCreateCurriculumSeriesButton")) {
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

    if (event.target.closest("[data-series-auto-title]")) {
      adminSeriesDraftLocal = readSeriesForm();
      adminSeriesDraftLocal.title = autoTitle({ ...adminSeriesDraftLocal, title: "" });
      markSeriesDirty();
      renderAdminCurriculumSeriesManager();
      return;
    }

    if (event.target.closest("[data-series-suggest-cover]")) {
      adminSeriesDraftLocal = applySuggestedCover(readSeriesForm());
      markSeriesDirty();
      renderAdminCurriculumSeriesManager();
      return;
    }

    if (event.target.closest("[data-series-pull-weeks]")) {
      adminSeriesDraftLocal = pullOverviewFromWeeks(readSeriesForm(), lessonPlansForPicker());
      markSeriesDirty();
      renderAdminCurriculumSeriesManager();
      if (typeof showActionFeedback === "function") showActionFeedback("Pulled overview details from linked weeks.");
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
      lessonLibraryTypeFilter = normalizeLessonLibraryTypeFilter(typeTab.getAttribute("data-lesson-library-type"));
      openMonthlySeriesId = "";
      if (typeof lessonLibraryViewAllKey !== "undefined") lessonLibraryViewAllKey = "";
      rerenderLessons();
      return;
    }

    const openSeries = event.target.closest("[data-open-monthly-series]");
    if (openSeries) {
      event.preventDefault();
      openMonthlySeriesId = openSeries.getAttribute("data-open-monthly-series") || "";
      rerenderLessons();
      return;
    }

    if (event.target.closest("[data-close-monthly-series]")) {
      openMonthlySeriesId = "";
      rerenderLessons();
      return;
    }

    const scheduleMonth = event.target.closest("[data-schedule-entire-month]");
    if (scheduleMonth) {
      event.preventDefault();
      event.stopPropagation();
      const seriesId = scheduleMonth.getAttribute("data-schedule-entire-month");
      startCurriculumProgress(seriesId);
      scheduleEntireMonth(seriesId);
      rerenderLessons();
      return;
    }

    const startCurriculum = event.target.closest("[data-start-curriculum]");
    if (startCurriculum) {
      event.preventDefault();
      event.stopPropagation();
      const seriesId = startCurriculum.getAttribute("data-start-curriculum");
      startCurriculumProgress(seriesId);
      openMonthlySeriesId = seriesId;
      if (typeof showActionFeedback === "function") {
        showActionFeedback("Curriculum started. Open Week 1 whenever you are ready.");
      }
      rerenderLessons();
      return;
    }

    const markComplete = event.target.closest("[data-mark-curriculum-week-complete]");
    if (markComplete) {
      event.preventDefault();
      event.stopPropagation();
      const seriesId = markComplete.getAttribute("data-mark-curriculum-week-complete");
      const weekNumber = markComplete.getAttribute("data-curriculum-week-number");
      markCurriculumWeekComplete(seriesId, weekNumber);
      if (typeof showActionFeedback === "function") {
        showActionFeedback(`Week ${weekNumber} marked complete.`);
      }
      rerenderLessons();
      return;
    }

    const openWeek = event.target.closest("[data-open-week-plan]");
    if (openWeek) {
      const planId = openWeek.getAttribute("data-open-week-plan");
      const seriesId = openWeek.getAttribute("data-curriculum-series-id");
      const weekNumber = openWeek.getAttribute("data-curriculum-week-number");
      if (seriesId) {
        const progress = startCurriculumProgress(seriesId);
        progress.lastOpenedWeek = Number(weekNumber) || progress.lastOpenedWeek || 1;
        writeCurriculumProgress(seriesId, progress);
      }
      const resource = (typeof resources !== "undefined" ? resources : []).find((r) => (
        r._curriculumLessonPlan?.id === planId || r.id === planId
      ));
      const targetId = resource?.id || planId;
      if (typeof openResourceViewer === "function") {
        openResourceViewer(targetId);
      } else {
        const proxy = document.createElement("button");
        proxy.setAttribute("data-view-resource", targetId);
        document.body.appendChild(proxy);
        proxy.click();
        proxy.remove();
      }
      return;
    }

    const favBtn = event.target.closest("[data-toggle-series-favorite]");
    if (favBtn) {
      event.preventDefault();
      event.stopPropagation();
      const id = `series:${favBtn.getAttribute("data-toggle-series-favorite")}`;
      if (typeof favorites !== "undefined" && Array.isArray(favorites)) {
        const idx = favorites.indexOf(id);
        if (idx >= 0) favorites.splice(idx, 1);
        else favorites.push(id);
        if (typeof saveFavorites === "function") saveFavorites();
        rerenderLessons();
      }
      return;
    }

    const synRemove = event.target.closest("[data-synonym-remove]");
    if (synRemove) {
      saveSynonym({ id: synRemove.getAttribute("data-synonym-remove"), remove: true });
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
    const filterEl = event.target.closest("[data-monthly-filter]");
    if (filterEl) {
      const key = filterEl.getAttribute("data-monthly-filter");
      monthlyLibraryFilters = { ...monthlyLibraryFilters, [key]: filterEl.value || "" };
      rerenderLessons();
      return;
    }
    if (event.target.closest("#adminCurriculumSeriesForm")) {
      adminSeriesDraftLocal = readSeriesForm();
      if (event.target.name === "weekCount" || event.target.name === "age" || event.target.name === "month" || event.target.name === "season") {
        if (event.target.name === "weekCount") {
          const api = seriesApi();
          adminSeriesDraftLocal.weeks = api?.mergeSeriesWeeks?.(adminSeriesDraftLocal.weeks, adminSeriesDraftLocal.weekCount)
            || adminSeriesDraftLocal.weeks;
        }
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
      saveSynonym({
        from: synForm.from?.value || "",
        to: synForm.to?.value || "",
        field: synForm.field?.value || "learningDomain",
      });
      synForm.reset();
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (adminSeriesDirty && adminSeriesEditorId) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  globalThis.LLHMonthlyCurriculumPhase1 = {
    renderAdminCurriculumSeriesManager,
    applyGuidedLessonEditorStep,
    lessonLibraryTypeTabsHtml,
    monthlyLibraryFiltersHtml,
    monthlySeriesCardHtml,
    featuredCurriculumBannerHtml,
    curriculumBrowseRowsHtml,
    buildCurriculumBrowseRows,
    renderMonthlySeriesDetail,
    publicMonthlySeries,
    filterPublicMonthlySeries,
    normalizeLessonLibraryTypeFilter,
    getLessonLibraryTypeFilter: () => normalizeLessonLibraryTypeFilter(lessonLibraryTypeFilter),
    setLessonLibraryTypeFilter: (value) => {
      lessonLibraryTypeFilter = normalizeLessonLibraryTypeFilter(value);
    },
    getOpenMonthlySeriesId: () => openMonthlySeriesId,
    setOpenMonthlySeriesId: (value) => { openMonthlySeriesId = value || ""; },
    getMonthlyLibraryFilters: () => ({ ...monthlyLibraryFilters }),
    seriesCoverUrl,
    resolveSeriesCover,
    scheduleEntireMonth,
    resetLessonEditorStep: () => { adminLessonEditorStep = "basics"; },
  };
})();
