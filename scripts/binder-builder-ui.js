/**
 * Owner Admin — Binder Builder UI.
 *
 * Workflow: Select Lesson → Configure → Review Content → Preview → Readiness → Print.
 * Draft state lives in module memory; chrome-only updates never wipe typed fields.
 */
(function initBinderBuilderUi(global) {
  "use strict";

  const STEPS = Object.freeze([
    { id: "select", label: "1. Select Lesson" },
    { id: "configure", label: "2. Configure Binder" },
    { id: "review", label: "3. Review Content" },
    { id: "preview", label: "4. Preview Binder" },
    { id: "readiness", label: "5. Binder Readiness" },
    { id: "print", label: "6. Print / Export" },
  ]);

  const state = {
    mounted: false,
    step: "select",
    busy: false,
    message: "",
    isError: false,
    lessons: [],
    drafts: [],
    filters: { q: "", age: "", status: "", plan: "" },
    selectedLessonId: "",
    lesson: null,
    draft: null,
    readiness: null,
    previewHtml: "",
    previewPages: [],
    /** @type {Record<string, string>} */
    qrSvgByUrl: {},
    lastSavedAt: "",
  };

  function model() {
    return global.LLHBinderBuilderModel;
  }
  function transform() {
    return global.LLHBinderBuilderTransform;
  }
  function readinessApi() {
    return global.LLHBinderBuilderReadiness;
  }
  function qrApi() {
    return global.LLHBinderBuilderQr;
  }
  function printApi() {
    return global.LLHBinderBuilderPrint;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function host() {
    return document.getElementById("adminBinderBuilderApp");
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

  async function api(action, extra) {
    const token = adminToken();
    if (!token) throw new Error("Admin session required.");
    if (!isOwner()) throw new Error("Binder Builder is restricted to the owner account.");
    const response = await fetch("/api/admin/curriculum/binder-builder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error || `Binder Builder failed (${response.status})`);
    }
    return json;
  }

  function setMessage(text, isError) {
    state.message = String(text || "");
    state.isError = Boolean(isError);
    const el = host()?.querySelector("[data-bb-message]");
    if (!el) return;
    el.hidden = !state.message;
    el.classList.toggle("is-error", state.isError);
    el.classList.toggle("is-ok", !state.isError && Boolean(state.message));
    el.textContent = state.message;
  }

  function collectConfigureFields(root) {
    if (!state.draft || !model()) return;
    const draft = model().normalizeBinderDraft(state.draft);
    const get = (name) => root.querySelector(`[data-bb-field="${name}"]`);
    const val = (name) => String(get(name)?.value || "");

    draft.title = val("title") || draft.title;
    draft.coverDescriptor = val("coverDescriptor") || draft.coverDescriptor;
    // Honor explicit blank welcome; do not treat "" as falsy fallback to prior text.
    draft.welcomeCopy = val("welcomeCopy");
    draft.weekFocusOverride = val("weekFocusOverride");
    draft.developmentalFocusOverride = val("developmentalFocusOverride");
    draft.familyConnectionOverride = val("familyConnectionOverride");
    draft.endOfWeekOverride = val("endOfWeekOverride");
    draft.skillsPracticedOverride = val("skillsPracticedOverride");
    draft.noticedOverride = val("noticedOverride");
    draft.personalization = {
      teacherName: val("teacherName"),
      classroomName: val("classroomName"),
      programName: val("programName"),
      subtitle: val("subtitle"),
    };
    draft.sections = {
      welcome: Boolean(root.querySelector('[data-bb-section="welcome"]')?.checked),
      weekAtAGlance: Boolean(root.querySelector('[data-bb-section="weekAtAGlance"]')?.checked),
      dailyDividers: Boolean(root.querySelector('[data-bb-section="dailyDividers"]')?.checked),
      dailyPlans: true,
      books: Boolean(root.querySelector('[data-bb-section="books"]')?.checked),
      songs: Boolean(root.querySelector('[data-bb-section="songs"]')?.checked),
      learningCenters: Boolean(root.querySelector('[data-bb-section="learningCenters"]')?.checked),
      familyConnection: Boolean(root.querySelector('[data-bb-section="familyConnection"]')?.checked),
      endOfWeek: Boolean(root.querySelector('[data-bb-section="endOfWeek"]')?.checked),
    };
    draft.notesAreaEnabled = Boolean(root.querySelector('[data-bb-field="notesAreaEnabled"]')?.checked);

    model().LEARNING_CENTER_KEYS.forEach((key) => {
      const input = root.querySelector(`[data-bb-center="${key}"]`);
      if (input) draft.learningCenters[key] = String(input.value || "");
    });

    state.draft = draft;
  }

  function collectReviewFields(root) {
    if (!state.draft || !model()) return;
    const draft = model().normalizeBinderDraft(state.draft);

    root.querySelectorAll("[data-bb-day]").forEach((dayEl) => {
      const dayKey = dayEl.getAttribute("data-bb-day");
      if (!dayKey || !draft.days[dayKey]) return;
      draft.days[dayKey].titleOverride = String(dayEl.querySelector('[data-bb-day-field="titleOverride"]')?.value || "");
      draft.days[dayKey].descriptionOverride = String(dayEl.querySelector('[data-bb-day-field="descriptionOverride"]')?.value || "");
    });

    root.querySelectorAll("[data-bb-activity]").forEach((actEl) => {
      const dayKey = actEl.getAttribute("data-bb-day");
      const actId = actEl.getAttribute("data-bb-activity");
      const day = draft.days[dayKey];
      if (!day) return;
      const activity = (day.activities || []).find((item) => item.id === actId);
      if (!activity) return;
      const list = (field) => String(actEl.querySelector(`[data-bb-act-field="${field}"]`)?.value || "")
        .split(/\n+/).map((value) => value.trim()).filter(Boolean);
      activity.activityTitle = String(actEl.querySelector('[data-bb-act-field="activityTitle"]')?.value || "");
      activity.activityDescription = String(actEl.querySelector('[data-bb-act-field="activityDescription"]')?.value || "");
      activity.materials = list("materials");
      activity.materialAlternatives = list("materialAlternatives");
      activity.teacherPrep = String(actEl.querySelector('[data-bb-act-field="teacherPrep"]')?.value || "");
      activity.setup = String(actEl.querySelector('[data-bb-act-field="setup"]')?.value || "");
      activity.steps = list("steps");
      activity.cleanup = String(actEl.querySelector('[data-bb-act-field="cleanup"]')?.value || "");
      activity.observation = String(actEl.querySelector('[data-bb-act-field="observation"]')?.value || "");
      activity.familyConnection = String(actEl.querySelector('[data-bb-act-field="familyConnection"]')?.value || "");
      activity.introductionOverride = String(actEl.querySelector('[data-bb-act-field="introductionOverride"]')?.value || "");
      activity.whatWereDoingOverride = String(actEl.querySelector('[data-bb-act-field="whatWereDoingOverride"]')?.value || "");
      activity.howToDoItOverride = String(actEl.querySelector('[data-bb-act-field="howToDoItOverride"]')?.value || "");
      activity.learningOverride = String(actEl.querySelector('[data-bb-act-field="learningOverride"]')?.value || "");
      activity.questionsOverride = String(actEl.querySelector('[data-bb-act-field="questionsOverride"]')?.value || "");
      activity.supportOverride = String(actEl.querySelector('[data-bb-act-field="supportOverride"]')?.value || "");
      activity.challengeOverride = String(actEl.querySelector('[data-bb-act-field="challengeOverride"]')?.value || "");
      activity.cleanupOverride = String(actEl.querySelector('[data-bb-act-field="cleanupOverride"]')?.value || "");
      activity.includedResources = String(actEl.querySelector('[data-bb-act-field="includedResources"]')?.value || "");
      activity.omit = Boolean(actEl.querySelector('[data-bb-act-field="omit"]')?.checked);
    });

    root.querySelectorAll("[data-bb-book]").forEach((bookEl) => {
      const bookId = bookEl.getAttribute("data-bb-book");
      const book = (draft.books || []).find((item) => item.id === bookId);
      if (!book) return;
      book.title = String(bookEl.querySelector('[data-bb-book-field="title"]')?.value || "");
      book.author = String(bookEl.querySelector('[data-bb-book-field="author"]')?.value || "");
      book.connectionOverride = String(bookEl.querySelector('[data-bb-book-field="connectionOverride"]')?.value || "");
      book.beforeReadingOverride = String(bookEl.querySelector('[data-bb-book-field="beforeReadingOverride"]')?.value || "");
      book.afterReadingOverride = String(bookEl.querySelector('[data-bb-book-field="afterReadingOverride"]')?.value || "");
      book.questionsOverride = String(bookEl.querySelector('[data-bb-book-field="questionsOverride"]')?.value || "");
      book.resourceUrl = String(bookEl.querySelector('[data-bb-book-field="resourceUrl"]')?.value || "").trim();
      book.qrEnabled = Boolean(bookEl.querySelector('[data-bb-book-field="qrEnabled"]')?.checked);
      book.omit = Boolean(bookEl.querySelector('[data-bb-book-field="omit"]')?.checked);
    });

    root.querySelectorAll("[data-bb-song]").forEach((songEl) => {
      const songId = songEl.getAttribute("data-bb-song");
      const song = (draft.songs || []).find((item) => item.id === songId);
      if (!song) return;
      song.title = String(songEl.querySelector('[data-bb-song-field="title"]')?.value || "");
      song.whenToUseOverride = String(songEl.querySelector('[data-bb-song-field="whenToUseOverride"]')?.value || "");
      song.movementsOverride = String(songEl.querySelector('[data-bb-song-field="movementsOverride"]')?.value || "");
      song.directionsOverride = String(songEl.querySelector('[data-bb-song-field="directionsOverride"]')?.value || "");
      song.resourceUrl = String(songEl.querySelector('[data-bb-song-field="resourceUrl"]')?.value || "").trim();
      song.qrEnabled = Boolean(songEl.querySelector('[data-bb-song-field="qrEnabled"]')?.checked);
      song.omit = Boolean(songEl.querySelector('[data-bb-song-field="omit"]')?.checked);
      song.allowPrintLyrics = Boolean(songEl.querySelector('[data-bb-song-field="allowPrintLyrics"]')?.checked);
      song.lyricsOverride = String(songEl.querySelector('[data-bb-song-field="lyricsOverride"]')?.value || "");
    });

    root.querySelectorAll("[data-bb-printable]").forEach((el) => {
      const printable = (draft.printables || []).find((item) => item.id === el.getAttribute("data-bb-printable"));
      if (!printable) return;
      printable.name = String(el.querySelector('[data-bb-printable-field="name"]')?.value || "");
      printable.description = String(el.querySelector('[data-bb-printable-field="description"]')?.value || "");
      printable.referenceUrl = String(el.querySelector('[data-bb-printable-field="referenceUrl"]')?.value || "").trim();
      printable.include = Boolean(el.querySelector('[data-bb-printable-field="include"]')?.checked);
    });
    root.querySelectorAll("[data-bb-card]").forEach((el) => {
      const card = (draft.cards || []).find((item) => item.id === el.getAttribute("data-bb-card"));
      if (!card) return;
      card.title = String(el.querySelector('[data-bb-card-field="title"]')?.value || "");
      card.description = String(el.querySelector('[data-bb-card-field="description"]')?.value || "");
      card.referenceUrl = String(el.querySelector('[data-bb-card-field="referenceUrl"]')?.value || "").trim();
      card.include = Boolean(el.querySelector('[data-bb-card-field="include"]')?.checked);
    });

    state.draft = draft;
  }

  function harvestOpenForm() {
    const root = host();
    if (!root || !state.draft) return;
    if (state.step === "configure") collectConfigureFields(root);
    if (state.step === "review") collectReviewFields(root);
  }

  async function ensureQrSvgs() {
    if (!state.draft || !qrApi()) return;
    const urls = [];
    (state.draft.books || []).forEach((book) => {
      if (book.resourceUrl && book.qrEnabled !== false) urls.push(book.resourceUrl);
    });
    (state.draft.songs || []).forEach((song) => {
      if (song.resourceUrl && song.qrEnabled !== false) urls.push(song.resourceUrl);
    });
    const unique = [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))];
    await Promise.all(unique.map(async (url) => {
      const checked = qrApi().validateBinderUrl(url);
      if (!checked.ok) return;
      if (state.qrSvgByUrl[url]) return;
      try {
        if (qrApi().renderQrSvg) {
          state.qrSvgByUrl[url] = await qrApi().renderQrSvg(checked.url);
        } else {
          const result = await api("qr-svg", { url: checked.url });
          state.qrSvgByUrl[url] = result.svg || "";
        }
      } catch {
        // readiness will flag; do not embed broken QR
      }
    }));
  }

  async function loadLessons() {
    const result = await api("list-lessons", { ...state.filters });
    state.lessons = Array.isArray(result.lessons) ? result.lessons : [];
  }

  async function loadDrafts() {
    const result = await api("list-drafts");
    state.drafts = Array.isArray(result.drafts) ? result.drafts : [];
  }

  async function selectLesson(lessonId) {
    state.selectedLessonId = String(lessonId || "");
    const result = await api("get-lesson", { lessonId: state.selectedLessonId });
    state.lesson = result.lesson || null;
    if (!state.lesson) throw new Error("Lesson could not be loaded.");
    const created = await api("create-draft", { lessonId: state.selectedLessonId });
    state.draft = created.draft;
    state.lesson = created.lesson || state.lesson;
    state.lastSavedAt = state.draft?.savedAt || "";
    state.step = "configure";
    setMessage(`Binder draft created for “${state.draft.title}”.`, false);
  }

  async function openDraft(draftId) {
    const result = await api("get-draft", { draftId });
    state.draft = result.draft;
    state.lesson = result.lesson || null;
    state.selectedLessonId = state.draft?.sourceLessonId || "";
    state.lastSavedAt = state.draft?.savedAt || "";
    state.step = "configure";
    setMessage("Binder draft reopened.", false);
  }

  async function saveDraft() {
    harvestOpenForm();
    if (!state.draft) throw new Error("No binder draft to save.");
    const result = await api("save-draft", { draft: state.draft });
    state.draft = result.draft;
    state.lastSavedAt = state.draft.savedAt || "";
    setMessage("Binder draft saved.", false);
  }

  async function regeneratePreview() {
    harvestOpenForm();
    if (!state.draft) throw new Error("No binder draft.");
    // Refresh lesson so preview reflects latest source content without mutating it.
    if (state.draft.sourceLessonId) {
      try {
        const lessonResult = await api("get-lesson", { lessonId: state.draft.sourceLessonId });
        state.lesson = lessonResult.lesson || state.lesson;
      } catch {
        // keep prior lesson; readiness will report
      }
    }
    await ensureQrSvgs();
    const result = await api("preview", { draft: state.draft });
    state.previewHtml = result.html || "";
    state.previewPages = Array.isArray(result.pages) ? result.pages : [];
    state.readiness = result.readiness || null;
    // Prefer client print build when modules available (keeps QR cache).
    if (printApi() && state.draft) {
      const local = printApi().buildBinderPrintHtml(state.draft, state.lesson, {
        qrSvgByUrl: state.qrSvgByUrl,
        mode: "preview",
        assetOrigin: typeof window !== "undefined" ? window.location.origin : "",
      });
      state.previewHtml = local.html;
      state.previewPages = local.pages;
    }
  }

  function renderSteps() {
    return [
      `<ol class="bb-steps" data-bb-admin-chrome>`,
      ...STEPS.map((step) => [
        `<li>`,
        `<button type="button" data-bb-step="${esc(step.id)}" class="${state.step === step.id ? "is-active" : ""}"${!state.draft && step.id !== "select" ? " disabled" : ""}>${esc(step.label)}</button>`,
        `</li>`,
      ].join("")),
      `</ol>`,
    ].join("");
  }

  function renderSelect() {
    const cards = state.lessons.map((lesson) => {
      const selected = lesson.id === state.selectedLessonId ? " is-selected" : "";
      const thumb = lesson.coverImageUrl
        ? `<img src="${esc(lesson.coverImageUrl)}" alt="${esc(lesson.coverImageAlt || lesson.title)}" loading="lazy" onerror="this.remove()">`
        : "";
      return [
        `<button type="button" class="bb-lesson-card${selected}" data-bb-select-lesson="${esc(lesson.id)}" aria-pressed="${selected ? "true" : "false"}">`,
        `<div class="bb-lesson-thumb">${thumb}</div>`,
        `<div class="bb-lesson-body">`,
        `<strong>${esc(lesson.title)}</strong>`,
        `<div class="bb-lesson-meta">${esc(lesson.age || "—")} · ${esc(lesson.theme || "Theme TBD")}</div>`,
        `<div class="bb-lesson-meta">${esc(lesson.status || "")} · ${esc(lesson.plan || "")}</div>`,
        `</div>`,
        `</button>`,
      ].join("");
    }).join("") || `<p class="bb-empty-note">No lessons match these filters.</p>`;

    const drafts = state.drafts.map((draft) => [
      `<div class="bb-draft-row">`,
      `<div><strong>${esc(draft.title)}</strong><div class="bb-lesson-meta">${esc(draft.ageGroup || "")} · saved ${esc(draft.savedAt || draft.updatedAt || "—")}</div></div>`,
      `<div class="bb-toolbar" style="margin:0">`,
      `<button type="button" class="ghost-button" data-bb-open-draft="${esc(draft.id)}">Open</button>`,
      `<button type="button" class="ghost-button" data-bb-duplicate-draft="${esc(draft.id)}">Duplicate</button>`,
      `<button type="button" class="ghost-button" data-bb-delete-draft="${esc(draft.id)}">Delete</button>`,
      `</div>`,
      `</div>`,
    ].join("")).join("") || `<p class="bb-empty-note">No saved binder drafts yet.</p>`;

    return [
      `<div class="bb-panel">`,
      `<div class="bb-filters" data-bb-admin-chrome>`,
      `<label>Search title<input data-bb-filter="q" value="${esc(state.filters.q)}" placeholder="Search lessons"></label>`,
      `<label>Age group<select data-bb-filter="age"><option value="">All ages</option><option value="Infant"${state.filters.age === "Infant" ? " selected" : ""}>Infant</option><option value="Toddler"${state.filters.age === "Toddler" ? " selected" : ""}>Toddler</option><option value="Preschool"${state.filters.age === "Preschool" ? " selected" : ""}>Preschool</option></select></label>`,
      `<label>Status<select data-bb-filter="status"><option value="">All statuses</option><option value="published"${state.filters.status === "published" ? " selected" : ""}>Published</option><option value="draft"${state.filters.status === "draft" ? " selected" : ""}>Draft</option><option value="featured"${state.filters.status === "featured" ? " selected" : ""}>Featured</option></select></label>`,
      `<label>Access<select data-bb-filter="plan"><option value="">All plans</option><option value="Free"${state.filters.plan === "Free" ? " selected" : ""}>Free</option><option value="Pro"${state.filters.plan === "Pro" ? " selected" : ""}>Pro</option></select></label>`,
      `</div>`,
      `<div class="bb-lesson-grid">${cards}</div>`,
      `<h3 style="margin-top:1.4rem">Saved Binder Drafts</h3>`,
      `<div class="bb-draft-list">${drafts}</div>`,
      `</div>`,
    ].join("");
  }

  function renderConfigure() {
    const draft = state.draft;
    if (!draft) return `<p class="bb-message is-error">Select a lesson first.</p>`;
    const s = draft.sections || {};
    const centers = model().LEARNING_CENTER_KEYS.map((key) => [
      `<label class="bb-field">${esc(model().LEARNING_CENTER_LABELS[key])}`,
      `<textarea data-bb-center="${esc(key)}" rows="2">${esc(draft.learningCenters?.[key] || "")}</textarea>`,
      `</label>`,
    ].join("")).join("");

    return [
      `<div class="bb-panel">`,
      `<p class="bb-lesson-meta">Source lesson: <strong>${esc(draft.title)}</strong> (${esc(draft.ageGroup || "—")}) · draft id ${esc(draft.id)}</p>`,
      `<div class="bb-config-grid">`,
      `<div>`,
      `<label class="bb-field">Binder title<input data-bb-field="title" value="${esc(draft.title)}"></label>`,
      `<label class="bb-field">Cover descriptor<input data-bb-field="coverDescriptor" value="${esc(draft.coverDescriptor)}"></label>`,
      `<label class="bb-field">Optional subtitle<input data-bb-field="subtitle" value="${esc(draft.personalization?.subtitle || "")}"></label>`,
      `<label class="bb-field">Teacher name<input data-bb-field="teacherName" value="${esc(draft.personalization?.teacherName || "")}"></label>`,
      `<label class="bb-field">Classroom name<input data-bb-field="classroomName" value="${esc(draft.personalization?.classroomName || "")}"></label>`,
      `<label class="bb-field">Program / center name<input data-bb-field="programName" value="${esc(draft.personalization?.programName || "")}"></label>`,
      `<label class="bb-field">Welcome / How to Use copy<textarea data-bb-field="welcomeCopy" rows="8">${esc(draft.welcomeCopy)}</textarea></label>`,
      `<label class="bb-field">Week focus override<textarea data-bb-field="weekFocusOverride" rows="3" placeholder="Leave blank to use lesson weekly overview">${esc(draft.weekFocusOverride || "")}</textarea></label>`,
      `<label class="bb-field">Learning focus override<textarea data-bb-field="developmentalFocusOverride" rows="3">${esc(draft.developmentalFocusOverride || "")}</textarea></label>`,
      `<label class="bb-field">Family Connection override<textarea data-bb-field="familyConnectionOverride" rows="3">${esc(draft.familyConnectionOverride || "")}</textarea></label>`,
      `<label class="bb-field">End of week — This Week We Explored<textarea data-bb-field="endOfWeekOverride" rows="3">${esc(draft.endOfWeekOverride || "")}</textarea></label>`,
      `<label class="bb-field">Skills we practiced override<textarea data-bb-field="skillsPracticedOverride" rows="2">${esc(draft.skillsPracticedOverride || "")}</textarea></label>`,
      `<label class="bb-field">Things you may have noticed override<textarea data-bb-field="noticedOverride" rows="2">${esc(draft.noticedOverride || "")}</textarea></label>`,
      `</div>`,
      `<div>`,
      `<h3>Section controls</h3>`,
      `<div class="bb-section-toggles">`,
      `<label><input type="checkbox" data-bb-section="welcome"${s.welcome !== false ? " checked" : ""}> Welcome Page</label>`,
      `<label><input type="checkbox" data-bb-section="weekAtAGlance"${s.weekAtAGlance !== false ? " checked" : ""}> Week at a Glance</label>`,
      `<label><input type="checkbox" data-bb-section="dailyDividers"${s.dailyDividers !== false ? " checked" : ""}> Daily Dividers</label>`,
      `<label><input type="checkbox" checked disabled> Daily teaching pages (required)</label>`,
      `<label><input type="checkbox" data-bb-section="books"${s.books !== false ? " checked" : ""}> Story Time</label>`,
      `<label><input type="checkbox" data-bb-section="songs"${s.songs !== false ? " checked" : ""}> Music &amp; Movement</label>`,
      `<label><input type="checkbox" data-bb-section="learningCenters"${s.learningCenters === true ? " checked" : ""}> Learning Centers</label>`,
      `<label><input type="checkbox" data-bb-section="familyConnection"${s.familyConnection !== false ? " checked" : ""}> Family Connection</label>`,
      `<label><input type="checkbox" data-bb-section="endOfWeek"${s.endOfWeek !== false ? " checked" : ""}> End of Week</label>`,
      `<label><input type="checkbox" data-bb-field="notesAreaEnabled"${draft.notesAreaEnabled !== false ? " checked" : ""}> Printable notes area</label>`,
      `</div>`,
      `<h3 style="margin-top:1rem">Learning Centers (optional)</h3>`,
      `<div class="bb-review-stack">${centers}</div>`,
      `</div>`,
      `</div>`,
      `</div>`,
    ].join("");
  }

  function originNote(hasOverride) {
    return hasOverride
      ? `<span class="bb-origin bb-origin-override">Binder override</span>`
      : `<span class="bb-origin bb-origin-source">Using lesson content</span>`;
  }

  function renderReview() {
    const draft = state.draft;
    const lesson = state.lesson;
    if (!draft) return `<p class="bb-message is-error">Select a lesson first.</p>`;
    const doc = transform()?.buildBinderDocument(draft, lesson);

    const days = (model().WEEKDAYS || []).map((dayKey) => {
      const dayDraft = draft.days[dayKey];
      const dayDoc = (doc?.days || []).find((item) => item.dayKey === dayKey);
      const activities = (dayDraft?.activities || []).map((act) => {
        const resolved = (dayDoc?.activities || []).find((item) => item.id === act.id);
        return [
          `<div class="bb-review-card" data-bb-activity="${esc(act.id)}" data-bb-day="${esc(dayKey)}">`,
          `<h3>${esc(act.title || resolved?.title || "Activity")}</h3>`,
          originNote(Boolean(act.howToDoItOverride || act.introductionOverride)),
          `<label class="bb-field">Activity title<input data-bb-act-field="activityTitle" value="${esc(act.activityTitle || "")}" placeholder="${esc(resolved?.title || act.title || "")}"></label>`,
          `<label class="bb-field">Activity description<textarea data-bb-act-field="activityDescription" rows="2">${esc(act.activityDescription || "")}</textarea></label>`,
          `<label class="bb-field">Materials (one per line; add/remove lines)<textarea data-bb-act-field="materials" rows="3">${esc((act.materials || []).join("\n"))}</textarea></label>`,
          `<label class="bb-field">Budget-friendly alternatives (one per line; add/remove lines)<textarea data-bb-act-field="materialAlternatives" rows="2">${esc((act.materialAlternatives || []).join("\n"))}</textarea></label>`,
          `<label class="bb-field">Teacher preparation<textarea data-bb-act-field="teacherPrep" rows="2">${esc(act.teacherPrep || "")}</textarea></label>`,
          `<label class="bb-field">Setup<textarea data-bb-act-field="setup" rows="2">${esc(act.setup || "")}</textarea></label>`,
          `<label class="bb-field">Steps (one per line)<textarea data-bb-act-field="steps" rows="4">${esc((act.steps || []).join("\n"))}</textarea></label>`,
          `<label class="bb-field">Cleanup<textarea data-bb-act-field="cleanup" rows="2">${esc(act.cleanup || "")}</textarea></label>`,
          `<label class="bb-field">Observation notes<textarea data-bb-act-field="observation" rows="2">${esc(act.observation || "")}</textarea></label>`,
          `<label class="bb-field">Family connection<textarea data-bb-act-field="familyConnection" rows="2">${esc(act.familyConnection || "")}</textarea></label>`,
          `<label class="bb-field">Introduction override<textarea data-bb-act-field="introductionOverride" rows="2">${esc(act.introductionOverride || "")}</textarea></label>`,
          `<label class="bb-field">What We're Doing override<textarea data-bb-act-field="whatWereDoingOverride" rows="2">${esc(act.whatWereDoingOverride || "")}</textarea></label>`,
          `<label class="bb-field">How To Do It override<textarea data-bb-act-field="howToDoItOverride" rows="3">${esc(act.howToDoItOverride || "")}</textarea></label>`,
          `<label class="bb-field">Learning override<textarea data-bb-act-field="learningOverride" rows="2">${esc(act.learningOverride || "")}</textarea></label>`,
          `<label class="bb-field">Teacher questions override<textarea data-bb-act-field="questionsOverride" rows="2">${esc(act.questionsOverride || "")}</textarea></label>`,
          `<label class="bb-field">Support override<textarea data-bb-act-field="supportOverride" rows="2">${esc(act.supportOverride || "")}</textarea></label>`,
          `<label class="bb-field">Challenge override<textarea data-bb-act-field="challengeOverride" rows="2">${esc(act.challengeOverride || "")}</textarea></label>`,
          `<label class="bb-field">Included with this activity (prepared resources)<textarea data-bb-act-field="includedResources" rows="2" placeholder="Color matching cards&#10;Art template">${esc(act.includedResources || "")}</textarea></label>`,
          `<label><input type="checkbox" data-bb-act-field="omit"${act.omit ? " checked" : ""}> Omit from binder</label>`,
          `<button type="button" class="ghost-button" data-bb-reset-activity="${esc(act.id)}" data-bb-day="${esc(dayKey)}">Reset activity overrides to source</button>`,
          `<p class="bb-lesson-meta">Source preview: ${esc((resolved?.howToDoIt?.text || "").slice(0, 160) || "No directions in source.")}</p>`,
          `</div>`,
        ].join("");
      }).join("");

      return [
        `<section class="bb-review-card" data-bb-day="${esc(dayKey)}">`,
        `<h3>${esc(model().WEEKDAY_LABELS[dayKey])}</h3>`,
        `<label class="bb-field">Divider title override<input data-bb-day-field="titleOverride" value="${esc(dayDraft?.titleOverride || "")}" placeholder="${esc(dayDoc?.title?.text || "")}"></label>`,
        `<label class="bb-field">Divider description override<textarea data-bb-day-field="descriptionOverride" rows="2">${esc(dayDraft?.descriptionOverride || "")}</textarea></label>`,
        activities || `<p class="bb-empty-note">No activities on this day.</p>`,
        `</section>`,
      ].join("");
    }).join("");

    const books = (draft.books || []).map((book) => {
      const checked = qrApi()?.validateBinderUrl(book.resourceUrl || "") || { ok: !book.resourceUrl, error: "" };
      return [
        `<div class="bb-review-card" data-bb-book="${esc(book.id)}">`,
        `<h3>${esc(book.title)}</h3>`,
        originNote(Boolean(book.connectionOverride || book.resourceUrl)),
        `<label class="bb-field">Book title<input data-bb-book-field="title" value="${esc(book.title || "")}"></label>`,
        `<label class="bb-field">Author<input data-bb-book-field="author" value="${esc(book.author || "")}"></label>`,
        `<label class="bb-field">Connection override<textarea data-bb-book-field="connectionOverride" rows="2">${esc(book.connectionOverride || "")}</textarea></label>`,
        `<label class="bb-field">Before reading<textarea data-bb-book-field="beforeReadingOverride" rows="2">${esc(book.beforeReadingOverride || "")}</textarea></label>`,
        `<label class="bb-field">Questions<textarea data-bb-book-field="questionsOverride" rows="2">${esc(book.questionsOverride || "")}</textarea></label>`,
        `<label class="bb-field">After reading<textarea data-bb-book-field="afterReadingOverride" rows="2">${esc(book.afterReadingOverride || "")}</textarea></label>`,
        `<label class="bb-field">Approved YouTube / resource URL<input data-bb-book-field="resourceUrl" value="${esc(book.resourceUrl || "")}" placeholder="https://www.youtube.com/watch?v=…"></label>`,
        book.resourceUrl && !checked.ok ? `<p class="bb-url-warn" data-bb-url-warn>Invalid approved URL — QR will not print. ${esc(checked.error || "")}</p>` : "",
        !book.resourceUrl ? `<p class="bb-url-hint">No approved URL yet — story prints without a QR (no placeholder).</p>` : "",
        `<label><input type="checkbox" data-bb-book-field="qrEnabled"${book.qrEnabled !== false ? " checked" : ""}> Print QR when URL is valid</label>`,
        `<label><input type="checkbox" data-bb-book-field="omit"${book.omit ? " checked" : ""}> Omit from binder</label>`,
        `<button type="button" class="ghost-button" data-bb-remove="book:${esc(book.id)}">Remove book</button>`,
        `</div>`,
      ].join("");
    }).join("") || `<p class="bb-empty-note">No books on this lesson.</p>`;

    const songs = (draft.songs || []).map((song) => {
      const checked = qrApi()?.validateBinderUrl(song.resourceUrl || "") || { ok: !song.resourceUrl, error: "" };
      return [
        `<div class="bb-review-card" data-bb-song="${esc(song.id)}">`,
        `<h3>${esc(song.title)}</h3>`,
        originNote(Boolean(song.directionsOverride || song.resourceUrl)),
        `<label class="bb-field">Song title<input data-bb-song-field="title" value="${esc(song.title || "")}"></label>`,
        `<label class="bb-field">When to use<textarea data-bb-song-field="whenToUseOverride" rows="2" placeholder="Morning Meeting, Transition…">${esc(song.whenToUseOverride || "")}</textarea></label>`,
        `<label class="bb-field">Movement directions<textarea data-bb-song-field="movementsOverride" rows="2">${esc(song.movementsOverride || "")}</textarea></label>`,
        `<label class="bb-field">Teacher directions override<textarea data-bb-song-field="directionsOverride" rows="2">${esc(song.directionsOverride || "")}</textarea></label>`,
        `<label class="bb-field">Approved YouTube / resource URL<input data-bb-song-field="resourceUrl" value="${esc(song.resourceUrl || "")}" placeholder="https://www.youtube.com/watch?v=…"></label>`,
        song.resourceUrl && !checked.ok ? `<p class="bb-url-warn" data-bb-url-warn>Invalid approved URL — QR will not print. ${esc(checked.error || "")}</p>` : "",
        !song.resourceUrl ? `<p class="bb-url-hint">No approved URL yet — song prints without a QR (no placeholder).</p>` : "",
        `<label><input type="checkbox" data-bb-song-field="qrEnabled"${song.qrEnabled !== false ? " checked" : ""}> Print QR when URL is valid</label>`,
        `<label><input type="checkbox" data-bb-song-field="allowPrintLyrics"${song.allowPrintLyrics ? " checked" : ""}> Include lyrics</label>`,
        `<label class="bb-field">Lyrics<textarea data-bb-song-field="lyricsOverride" rows="3">${esc(song.lyricsOverride || "")}</textarea></label>`,
        `<label><input type="checkbox" data-bb-song-field="omit"${song.omit ? " checked" : ""}> Omit from binder</label>`,
        `<button type="button" class="ghost-button" data-bb-remove="song:${esc(song.id)}">Remove song</button>`,
        `</div>`,
      ].join("");
    }).join("") || `<p class="bb-empty-note">No songs on this lesson.</p>`;

    const printables = (draft.printables || []).map((item) => [
      `<div class="bb-review-card" data-bb-printable="${esc(item.id)}">`,
      `<label class="bb-field">Printable name<input data-bb-printable-field="name" value="${esc(item.name || "")}"></label>`,
      `<label class="bb-field">Description<textarea data-bb-printable-field="description" rows="2">${esc(item.description || "")}</textarea></label>`,
      `<label class="bb-field">Approved URL / reference<input data-bb-printable-field="referenceUrl" value="${esc(item.referenceUrl || "")}"></label>`,
      `<label><input type="checkbox" data-bb-printable-field="include"${item.include !== false ? " checked" : ""}> Include in binder</label>`,
      `<button type="button" class="ghost-button" data-bb-remove="printable:${esc(item.id)}">Remove printable</button>`,
      `</div>`,
    ].join("")).join("");
    const cards = (draft.cards || []).map((item) => [
      `<div class="bb-review-card" data-bb-card="${esc(item.id)}">`,
      `<label class="bb-field">Card title<input data-bb-card-field="title" value="${esc(item.title || "")}"></label>`,
      `<label class="bb-field">Description<textarea data-bb-card-field="description" rows="2">${esc(item.description || "")}</textarea></label>`,
      `<label class="bb-field">Approved URL / reference<input data-bb-card-field="referenceUrl" value="${esc(item.referenceUrl || "")}"></label>`,
      `<label><input type="checkbox" data-bb-card-field="include"${item.include !== false ? " checked" : ""}> Include in binder</label>`,
      `<button type="button" class="ghost-button" data-bb-remove="card:${esc(item.id)}">Remove card</button>`,
      `</div>`,
    ].join("")).join("");

    return [
      `<div class="bb-panel bb-review-stack">`,
      `<p class="bb-lesson-meta">Binder-only edits never change the source lesson. Leave overrides blank to use lesson content.</p>`,
      days,
      `<h3>Story Time</h3><button type="button" class="ghost-button" data-bb-add="book">Add book</button>${books}`,
      `<h3>Music &amp; Movement</h3><button type="button" class="ghost-button" data-bb-add="song">Add song</button>${songs}`,
      `<h3>Printables</h3><button type="button" class="ghost-button" data-bb-add="printable">Add printable</button>${printables}`,
      `<h3>Cards</h3><button type="button" class="ghost-button" data-bb-add="card">Add card</button>${cards}`,
      `</div>`,
    ].join("");
  }

  function renderPreview() {
    const pages = (state.previewPages || []).length
      ? state.previewPages
      : (state.draft && transform() ? transform().buildPagePlan(transform().buildBinderDocument(state.draft, state.lesson)) : []);
    const pageList = pages.map((page, index) => {
      const movable = Boolean(page.pageId);
      return [
        `<li${movable ? ` draggable="true" data-bb-page-order="${esc(page.pageId)}"` : ""}>`,
        `${index + 1}. ${esc(page.label)}`,
        movable ? ` <button type="button" class="ghost-button" data-bb-page-move="${esc(page.pageId)}" data-bb-direction="up" aria-label="Move ${esc(page.label)} up">↑</button>` : "",
        movable ? ` <button type="button" class="ghost-button" data-bb-page-move="${esc(page.pageId)}" data-bb-direction="down" aria-label="Move ${esc(page.label)} down">↓</button>` : "",
        `</li>`,
      ].join("");
    }).join("");
    return [
      `<div class="bb-panel">`,
      `<ol class="bb-issue-list">${pageList || "<li>Generate preview to see page order.</li>"}</ol>`,
      `<div class="bb-preview-frame" data-bb-preview-frame>${state.previewHtml || "<p class=\"bb-empty-note\">Preview not generated yet.</p>"}</div>`,
      `</div>`,
    ].join("");
  }

  function renderReadiness() {
    const report = state.readiness;
    if (!report) {
      return `<div class="bb-panel"><p class="bb-empty-note">Run readiness from the toolbar.</p></div>`;
    }
    const pillClass = report.status === "READY" ? "is-ready" : "is-review";
    const issues = (report.issues || []).map((issue) => (
      `<li class="${issue.severity === "block" ? "is-block" : "is-warn"}"><strong>${esc(issue.section)}:</strong> ${esc(issue.message)}</li>`
    )).join("") || `<li>No issues found.</li>`;
    return [
      `<div class="bb-panel bb-readiness">`,
      `<div class="bb-status-pill ${pillClass}" data-bb-readiness-status>${esc(report.status)}</div>`,
      `<p>${report.canPrint ? "Binder can be printed." : "Fix blocking issues before printing."}</p>`,
      `<ul class="bb-issue-list">${issues}</ul>`,
      `</div>`,
    ].join("");
  }

  function renderPrintStep() {
    return [
      `<div class="bb-panel">`,
      `<p>Print uses US Letter portrait. Admin controls stay off the printed pages.</p>`,
      `<aside class="bb-print-settings" data-bb-print-settings>`,
      `<h3>Print settings (required for a clean PDF)</h3>`,
      `<ul>`,
      `<li><strong>Paper:</strong> US Letter (8.5 × 11)</li>`,
      `<li><strong>Layout:</strong> Portrait</li>`,
      `<li><strong>Scale:</strong> 100% / Actual size</li>`,
      `<li><strong>Margins:</strong> None / Default (Binder Builder already includes page margins)</li>`,
      `<li><strong>Background graphics:</strong> ON</li>`,
      `<li><strong>Headers and footers:</strong> OFF — turn these off in your browser print dialog. Binder Builder cannot remove browser-added date/URL/Page X chrome. Use Save as PDF after disabling them.</li>`,
      `</ul>`,
      `<p class="bb-lesson-meta">Controlled PDF tip: In Chrome/Edge choose Print → Destination “Save as PDF”, then uncheck “Headers and footers”. The binder footer already shows centered “Little Learner Hub” and “Page N”.</p>`,
      `</aside>`,
      `<div class="bb-toolbar">`,
      `<button type="button" class="primary-button" data-bb-action="print">Print / Save PDF</button>`,
      `</div>`,
      `</div>`,
    ].join("");
  }

  function renderBody() {
    if (state.step === "select") return renderSelect();
    if (state.step === "configure") return renderConfigure();
    if (state.step === "review") return renderReview();
    if (state.step === "preview") return renderPreview();
    if (state.step === "readiness") return renderReadiness();
    if (state.step === "print") return renderPrintStep();
    return "";
  }

  function render() {
    const root = host();
    if (!root) return;
    if (!isOwner()) {
      root.innerHTML = `<div class="bb-admin"><p class="bb-message is-error">Binder Builder is available to the owner account only.</p></div>`;
      return;
    }
    root.innerHTML = [
      `<div class="bb-admin" data-bb-root>`,
      `<header class="bb-admin-header" data-bb-admin-chrome>`,
      `<div>`,
      `<h2>Binder Builder</h2>`,
      `<p>Create a polished physical lesson-plan binder from an existing curriculum lesson. Binder-only edits never change the source lesson.</p>`,
      `</div>`,
      `<div class="bb-toolbar">`,
      `<button type="button" class="ghost-button" data-bb-action="save" ${state.draft ? "" : "disabled"}>Save Draft</button>`,
      `<button type="button" class="ghost-button" data-bb-action="preview" ${state.draft ? "" : "disabled"}>Refresh Preview</button>`,
      `<button type="button" class="ghost-button" data-bb-action="readiness" ${state.draft ? "" : "disabled"}>Run Readiness</button>`,
      `</div>`,
      `</header>`,
      renderSteps(),
      `<p class="bb-message${state.isError ? " is-error" : state.message ? " is-ok" : ""}" data-bb-message ${state.message ? "" : "hidden"}>${esc(state.message)}</p>`,
      `<div data-bb-body>${renderBody()}</div>`,
      `</div>`,
      `<div class="bb-print-host" id="bbPrintHost" hidden></div>`,
    ].join("");
    bind(root);
  }

  /**
   * Chrome-only status update — does not replace open form fields.
   */
  function renderChromeOnly() {
    const root = host();
    if (!root) return;
    const msg = root.querySelector("[data-bb-message]");
    if (msg) {
      msg.hidden = !state.message;
      msg.classList.toggle("is-error", state.isError);
      msg.classList.toggle("is-ok", !state.isError && Boolean(state.message));
      msg.textContent = state.message;
    }
    root.querySelectorAll("[data-bb-step]").forEach((button) => {
      const id = button.getAttribute("data-bb-step");
      button.classList.toggle("is-active", id === state.step);
      button.disabled = !state.draft && id !== "select";
    });
  }

  async function runAction(action) {
    if (state.busy) return;
    state.busy = true;
    try {
      if (action === "save") {
        await saveDraft();
        await loadDrafts();
        renderChromeOnly();
        return;
      }
      if (action === "preview") {
        await regeneratePreview();
        state.step = "preview";
        setMessage("Preview updated.", false);
        render();
        return;
      }
      if (action === "readiness") {
        harvestOpenForm();
        await ensureQrSvgs();
        if (readinessApi()) {
          state.readiness = readinessApi().evaluateBinderReadiness(state.draft, state.lesson);
        } else {
          const result = await api("readiness", { draft: state.draft });
          state.readiness = result.readiness;
        }
        state.step = "readiness";
        setMessage(`Readiness: ${state.readiness?.status || "unknown"}`, false);
        render();
        return;
      }
      if (action === "print") {
        harvestOpenForm();
        await ensureQrSvgs();
        if (state.readiness && state.readiness.canPrint === false) {
          setMessage("Resolve blocking readiness issues before printing.", true);
          renderChromeOnly();
          return;
        }
        const assetOrigin = typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "";
        const built = printApi().buildBinderPrintHtml(state.draft, state.lesson, {
          qrSvgByUrl: state.qrSvgByUrl,
          mode: "print",
          assetOrigin,
        });
        const printHost = document.getElementById("bbPrintHost") || host()?.querySelector(".bb-print-host");
        if (!printHost) throw new Error("Print host missing.");
        printHost.hidden = false;
        printHost.innerHTML = built.html;
        document.body.classList.add("printing-binder-builder");
        const imageResults = printApi().waitForPrintImages
          ? await printApi().waitForPrintImages(printHost, { timeoutMs: 25000 })
          : { loaded: [], failed: [], timedOut: [] };
        if (readinessApi()?.applyImageLoadResults) {
          const base = state.readiness || readinessApi().evaluateBinderReadiness(state.draft, state.lesson);
          state.readiness = readinessApi().applyImageLoadResults(base, imageResults);
        }
        if ((imageResults.failed || []).length || (imageResults.timedOut || []).length) {
          setMessage(
            `Print opened with ${(imageResults.failed || []).length + (imageResults.timedOut || []).length} image load failure(s). Review readiness — failed images were not left as empty content claims.`,
            true,
          );
        }
        const cleanup = () => {
          document.body.classList.remove("printing-binder-builder");
          printHost.hidden = true;
          printHost.innerHTML = "";
          window.removeEventListener("afterprint", cleanup);
        };
        window.addEventListener("afterprint", cleanup);
        window.print();
        setTimeout(cleanup, 1000);
        if (!((imageResults.failed || []).length || (imageResults.timedOut || []).length)) {
          setMessage("Print dialog opened.", false);
        }
        renderChromeOnly();
      }
    } catch (error) {
      setMessage(error?.message || "Binder Builder action failed.", true);
      renderChromeOnly();
    } finally {
      state.busy = false;
    }
  }

  function bind(root) {
    root.querySelectorAll("[data-bb-step]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-bb-step");
        if (!next) return;
        harvestOpenForm();
        state.step = next;
        render();
      });
    });

    root.querySelectorAll("[data-bb-action]").forEach((button) => {
      button.addEventListener("click", () => {
        runAction(button.getAttribute("data-bb-action"));
      });
    });

    root.querySelectorAll("[data-bb-filter]").forEach((input) => {
      const apply = async () => {
        const key = input.getAttribute("data-bb-filter");
        if (!key) return;
        // Preserve typed filter values in state BEFORE re-render
        state.filters[key] = String(input.value || "");
        try {
          await loadLessons();
          render();
        } catch (error) {
          setMessage(error?.message || "Could not load lessons.", true);
          renderChromeOnly();
        }
      };
      input.addEventListener(input.tagName === "SELECT" ? "change" : "change", apply);
      if (input.tagName === "INPUT") {
        let timer = null;
        input.addEventListener("input", () => {
          state.filters.q = String(input.value || "");
          clearTimeout(timer);
          timer = setTimeout(apply, 350);
        });
      }
    });

    root.querySelectorAll("[data-bb-select-lesson]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (state.busy) return;
        state.busy = true;
        try {
          await selectLesson(button.getAttribute("data-bb-select-lesson"));
          await loadDrafts();
          render();
        } catch (error) {
          setMessage(error?.message || "Could not open lesson.", true);
          render();
        } finally {
          state.busy = false;
        }
      });
    });

    root.querySelectorAll("[data-bb-open-draft]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await openDraft(button.getAttribute("data-bb-open-draft"));
          render();
        } catch (error) {
          setMessage(error?.message || "Could not open draft.", true);
          renderChromeOnly();
        }
      });
    });

    root.querySelectorAll("[data-bb-duplicate-draft]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("duplicate-draft", { draftId: button.getAttribute("data-bb-duplicate-draft") });
          await loadDrafts();
          setMessage("Draft duplicated.", false);
          render();
        } catch (error) {
          setMessage(error?.message || "Duplicate failed.", true);
          renderChromeOnly();
        }
      });
    });

    root.querySelectorAll("[data-bb-delete-draft]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!window.confirm("Delete this binder draft? The source lesson will not be changed.")) return;
        try {
          await api("delete-draft", { draftId: button.getAttribute("data-bb-delete-draft") });
          await loadDrafts();
          setMessage("Draft deleted.", false);
          render();
        } catch (error) {
          setMessage(error?.message || "Delete failed.", true);
          renderChromeOnly();
        }
      });
    });

    root.querySelectorAll("[data-bb-reset-activity]").forEach((button) => {
      button.addEventListener("click", () => {
        harvestOpenForm();
        const dayKey = button.getAttribute("data-bb-day");
        const actId = button.getAttribute("data-bb-reset-activity");
        const day = state.draft?.days?.[dayKey];
        const activity = (day?.activities || []).find((item) => item.id === actId);
        if (!activity) return;
        activity.introductionOverride = "";
        activity.whatWereDoingOverride = "";
        activity.howToDoItOverride = "";
        activity.learningOverride = "";
        activity.questionsOverride = "";
        activity.supportOverride = "";
        activity.challengeOverride = "";
        activity.safetyOverride = "";
        activity.cleanupOverride = "";
        activity.useSource = true;
        setMessage("Activity overrides cleared — using lesson content.", false);
        render();
      });
    });

    root.querySelectorAll("[data-bb-add]").forEach((button) => {
      button.addEventListener("click", () => {
        harvestOpenForm();
        const type = button.getAttribute("data-bb-add");
        if (!state.draft || !model()) return;
        if (type === "book") state.draft.books.push(model().normalizeBinderDraft({ ...state.draft, books: [{ title: "New Book" }] }).books[0]);
        if (type === "song") state.draft.songs.push(model().normalizeBinderDraft({ ...state.draft, songs: [{ title: "New Song" }] }).songs[0]);
        if (type === "printable") state.draft.printables.push(model().normalizePrintable({ name: "New Printable" }));
        if (type === "card") state.draft.cards.push(model().normalizeCard({ title: "New Card" }));
        render();
      });
    });

    root.querySelectorAll("[data-bb-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        harvestOpenForm();
        const [type, id] = String(button.getAttribute("data-bb-remove") || "").split(":");
        if (!state.draft || !id) return;
        const key = type === "book" ? "books" : type === "song" ? "songs" : `${type}s`;
        if (!Array.isArray(state.draft[key])) return;
        state.draft[key] = state.draft[key].filter((item) => item.id !== id);
        render();
      });
    });

    const reorderPage = (pageId, direction) => {
      harvestOpenForm();
      if (!state.draft || !transform()) return;
      const pages = transform().buildContentPagePlan(transform().buildBinderDocument(state.draft, state.lesson));
      const order = pages.map((page) => page.pageId).filter(Boolean);
      const current = order.indexOf(pageId);
      const target = direction === "up" ? current - 1 : current + 1;
      if (current < 0 || target < 0 || target >= order.length) return;
      [order[current], order[target]] = [order[target], order[current]];
      state.draft.pageOrder = order;
      state.previewPages = [];
      render();
    };
    root.querySelectorAll("[data-bb-page-move]").forEach((button) => {
      button.addEventListener("click", () => reorderPage(
        button.getAttribute("data-bb-page-move"),
        button.getAttribute("data-bb-direction"),
      ));
    });
    root.querySelectorAll("[data-bb-page-order]").forEach((item) => {
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", item.getAttribute("data-bb-page-order") || "");
      });
      item.addEventListener("dragover", (event) => event.preventDefault());
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        const from = event.dataTransfer?.getData("text/plain");
        const to = item.getAttribute("data-bb-page-order");
        if (!from || !to || from === to || !state.draft || !transform()) return;
        harvestOpenForm();
        const order = transform().buildContentPagePlan(transform().buildBinderDocument(state.draft, state.lesson))
          .map((page) => page.pageId).filter(Boolean);
        const fromIndex = order.indexOf(from);
        const toIndex = order.indexOf(to);
        if (fromIndex < 0 || toIndex < 0) return;
        order.splice(fromIndex, 1);
        order.splice(toIndex, 0, from);
        state.draft.pageOrder = order;
        state.previewPages = [];
        render();
      });
    });

    // Live URL validation without full re-render (trim pasted whitespace before validating)
    root.querySelectorAll('[data-bb-book-field="resourceUrl"], [data-bb-song-field="resourceUrl"]').forEach((input) => {
      input.addEventListener("input", () => {
        const wrap = input.closest(".bb-review-card");
        if (!wrap || !qrApi()) return;
        let warn = wrap.querySelector(".bb-url-warn");
        const value = String(input.value || "").trim();
        if (!value) {
          if (warn) warn.remove();
          return;
        }
        const checked = qrApi().validateBinderUrl(value);
        if (checked.ok) {
          if (warn) warn.remove();
          return;
        }
        if (!warn) {
          warn = document.createElement("p");
          warn.className = "bb-url-warn";
          input.parentElement?.appendChild(warn);
        }
        warn.textContent = checked.error || "Invalid URL";
      });
    });
  }

  async function mount() {
    const root = host();
    if (!root) return;
    // If already mounted with an open draft/form, avoid wiping typed fields on admin re-renders.
    if (state.mounted && root.querySelector("[data-bb-root]") && state.draft && (state.step === "configure" || state.step === "review")) {
      harvestOpenForm();
      renderChromeOnly();
      return;
    }
    state.mounted = true;
    if (!isOwner()) {
      render();
      return;
    }
    try {
      await Promise.all([loadLessons(), loadDrafts()]);
      render();
    } catch (error) {
      state.message = error?.message || "Binder Builder failed to load.";
      state.isError = true;
      render();
    }
  }

  // Expose for tests
  global.LLHBinderBuilderUi = {
    mount,
    getState: () => state,
    harvestOpenForm,
    renderChromeOnly,
    // test helpers
    __setStateForTests(partial) {
      Object.assign(state, partial || {});
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
