/**
 * Owner-only Lesson Review & Editor — one section at a time.
 * Entry: Lesson Plans → Edit, or Draft Review → Open Review.
 * Never auto-publishes. Does not mutate customer Teaching Kit flags.
 */
(function initLessonReviewEditor(global) {
  "use strict";

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const SECTION_DEFS = [
    { id: "basics", label: "Basics & Cover", blurb: "Title, age group, theme, cover image, and draft status for this lesson." },
    { id: "overview", label: "Overview", blurb: "The weekly story teachers read first — overview, vocabulary, and adaptations." },
    { id: "objectives", label: "Learning Objectives", blurb: "What children practice this week. Use clear, observable language." },
    { id: "materials", label: "Materials, Preparation & Safety", blurb: "Weekly materials, prep notes, and safety — not a copy of each daily list." },
    { id: "monday", label: "Monday", blurb: "Monday focus, schedule pieces, book, song, and that day’s activities." },
    { id: "tuesday", label: "Tuesday", blurb: "Tuesday focus, schedule pieces, book, song, and that day’s activities." },
    { id: "wednesday", label: "Wednesday", blurb: "Wednesday focus, schedule pieces, book, song, and that day’s activities." },
    { id: "thursday", label: "Thursday", blurb: "Thursday focus, schedule pieces, book, song, and that day’s activities." },
    { id: "friday", label: "Friday", blurb: "Friday focus, schedule pieces, book, song, and that day’s activities." },
    { id: "reusable", label: "Reusable Activities", blurb: "Cross-day or reusable activity notes that are not tied to a single weekday." },
    { id: "songs", label: "Songs", blurb: "Verified song details, motions, teaching directions, and weekday placement." },
    { id: "books", label: "Books", blurb: "Complete book details and discussion prompts teachers can use aloud." },
    { id: "printables", label: "Printables", blurb: "Linked printable packs with page previews and owner approval actions." },
    { id: "images", label: "Example Images", blurb: "Real classroom example images labeled by activity and purpose." },
    { id: "toolkit", label: "Teacher Toolkit", blurb: "Prep checklist, tips, and binder-ready teacher supports." },
    { id: "family", label: "Family Connection", blurb: "Simple home connection ideas families can try without special materials." },
    { id: "quality", label: "Quality Review", blurb: "Honest blockers. Click any item to jump to the exact section or activity." },
    { id: "publish", label: "Preview & Publish", blurb: "Compare draft vs published, preview layouts, and confirm before publishing." },
  ];

  const ACTIVITY_SUBSECTIONS = [
    { id: "core", label: "Core activity" },
    { id: "materials", label: "Materials and setup" },
    { id: "directions", label: "Directions" },
    { id: "guidance", label: "Teacher guidance" },
    { id: "learning", label: "Learning and observation" },
    { id: "adaptations", label: "Adaptations" },
    { id: "cleanup", label: "Setting and cleanup" },
    { id: "images", label: "Images" },
  ];

  const NO_IMAGE_CATEGORIES = /circle|song|music|movement|conversation|discussion|book|story|talk|greeting|transition/i;
  const MAY_NEED_IMAGE = /art|craft|paint|collage|sensory|setup|printable|project|build|construct|science|experiment/i;

  const state = {
    open: false,
    planId: "",
    draft: null,
    originalSnapshot: "",
    sectionId: "basics",
    openActivityKey: "",
    screenshotMode: false,
    dirty: false,
    saving: false,
    statusText: "",
    isSuccess: false,
    ownerApprovals: {},
    ownerDraftReview: false,
    draftReviewId: "",
    returnToQueue: false,
    previewViewport: "desktop",
    publishConfirm: "",
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

  function host() {
    return document.querySelector("#adminLessonReviewEditorHost");
  }

  function isOwner() {
    try {
      if (typeof isTeachingKitPrintableOwnerClient === "function") {
        return isTeachingKitPrintableOwnerClient() === true;
      }
      const session = typeof adminSession === "function" ? adminSession() : null;
      return [
        "leahivie@icloud.com",
        "leahrivie@icloud.com",
        "leahrivie@gmail.com",
        "little.learners.hub.customer@gmail.com",
      ].includes(String(session?.email || "").trim().toLowerCase());
    } catch {
      return false;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  function emptyDay() {
    return {
      theme: "",
      objectives: "",
      materials: "",
      vocabulary: "",
      books: [],
      songs: [],
      circleTime: [],
      transitions: [],
      outdoorPlay: "",
      familyConnection: "",
      observations: [],
      adaptations: "",
      safetyNotes: "",
      learningDomains: [],
      items: [],
      schedule: "",
      preparation: "",
      teacherQuestions: "",
      observationFocus: "",
    };
  }

  function ensurePlanShape(plan) {
    const next = clone(plan) || {};
    next.dailyPlans = next.dailyPlans && typeof next.dailyPlans === "object" ? next.dailyPlans : {};
    WEEKDAYS.forEach((day) => {
      next.dailyPlans[day] = { ...emptyDay(), ...(next.dailyPlans[day] || {}) };
      if (!Array.isArray(next.dailyPlans[day].items)) next.dailyPlans[day].items = [];
      if (!Array.isArray(next.dailyPlans[day].books)) next.dailyPlans[day].books = [];
      if (!Array.isArray(next.dailyPlans[day].songs)) next.dailyPlans[day].songs = [];
      if (!Array.isArray(next.dailyPlans[day].observations)) next.dailyPlans[day].observations = [];
      if (!Array.isArray(next.dailyPlans[day].circleTime)) next.dailyPlans[day].circleTime = [];
      if (!Array.isArray(next.dailyPlans[day].transitions)) next.dailyPlans[day].transitions = [];
    });
    if (!Array.isArray(next.books)) next.books = [];
    if (!Array.isArray(next.songs)) next.songs = [];
    if (!Array.isArray(next.resourceIds)) next.resourceIds = [];
    if (!Array.isArray(next.learningDomains)) next.learningDomains = [];
    if (!next.teachingKit || typeof next.teachingKit !== "object") next.teachingKit = { schemaVersion: 1 };
    if (!next.teachingKit.teacherToolkit || typeof next.teachingKit.teacherToolkit !== "object") {
      next.teachingKit.teacherToolkit = {};
    }
    return next;
  }

  function activityKey(day, item, index) {
    return text(item?.itemId) || text(item?.id) || `${day}:${index}`;
  }

  function flattenActivities(plan) {
    const list = [];
    WEEKDAYS.forEach((day) => {
      const items = Array.isArray(plan?.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items : [];
      items.forEach((item, index) => {
        list.push({
          ...item,
          dayOfWeek: day,
          _key: activityKey(day, item, index),
          _index: index,
        });
      });
    });
    return list;
  }

  function linkedResources(plan) {
    const planId = text(plan?.id);
    const byId = new Map();
    const fromHelper = typeof curriculumResourcesForLesson === "function"
      ? curriculumResourcesForLesson(planId)
      : [];
    fromHelper.forEach((row) => byId.set(row.id, row));
    const all = typeof effectiveCurriculum === "function"
      ? (effectiveCurriculum().resources || [])
      : [];
    (plan?.resourceIds || []).forEach((id) => {
      if (byId.has(id)) return;
      const found = all.find((row) => row.id === id);
      if (found) byId.set(id, found);
    });
    return [...byId.values()];
  }

  function fieldFilled(value) {
    if (Array.isArray(value)) return value.some((item) => fieldFilled(item));
    if (value && typeof value === "object") {
      return Object.values(value).some((item) => fieldFilled(item));
    }
    return text(value).length >= 3;
  }

  function meaningfulText(value, minWords = 3) {
    const words = text(value).split(/\s+/).filter(Boolean);
    return words.length >= minWords;
  }

  function bookComplete(book) {
    return meaningfulText(book?.title, 1)
      && meaningfulText(book?.author || book?.by || "Author", 1)
      && meaningfulText(book?.discussionPrompts || book?.discussion || book?.questions, 4);
  }

  function songComplete(song) {
    const lyricsOk = meaningfulText(song?.lyrics, 4) || /public\s*domain|verified|original/i.test(text(song?.rights || song?.source || song?.notes));
    return meaningfulText(song?.title, 1)
      && lyricsOk
      && meaningfulText(song?.motions || song?.actions || song?.teachingDirections || song?.directions, 3);
  }

  function imageRequirementForActivity(item) {
    const forced = text(item?.imageRequirement || item?.ownerImageRequirement);
    if (forced) return forced;
    const hay = `${item?.title || ""} ${item?.activityCategory || ""} ${item?.description || ""}`;
    if (NO_IMAGE_CATEGORIES.test(hay) && !MAY_NEED_IMAGE.test(hay)) return "no_image_needed";
    if (MAY_NEED_IMAGE.test(hay)) return "example_recommended";
    return "optional";
  }

  function activityWarnings(item) {
    const warnings = [];
    if (!meaningfulText(item?.title, 1)) warnings.push("Add an activity name.");
    if (!meaningfulText(item?.objective || item?.description, 4)) warnings.push("Add a clear objective or description.");
    if (!meaningfulText(item?.materials, 2)) warnings.push("List the materials for this activity.");
    if (!meaningfulText(item?.steps || item?.directions, 4)) warnings.push("Add step-by-step directions.");
    const req = imageRequirementForActivity(item);
    const hasImage = Boolean(text(item?.exampleImageUrl || item?.setupImageUrl || item?.imageUrl));
    const noImageNeeded = req === "no_image_needed" || item?.noImageNeeded === true;
    if ((req === "example_recommended" || req === "required") && !hasImage && !noImageNeeded) {
      warnings.push("This activity likely needs an example image (or mark No image needed).");
    }
    return warnings;
  }

  function activityStatus(item) {
    const warnings = activityWarnings(item);
    const approvals = state.ownerApprovals[`activity:${item._key}`];
    if (approvals === "approved" && !warnings.length) return "Approved";
    if (!meaningfulText(item?.title, 1) && !meaningfulText(item?.steps || item?.directions, 1)) return "Not Started";
    if (warnings.length) return "Needs Work";
    return "Complete";
  }

  function sectionRequiredChecks(sectionId, plan) {
    const missing = [];
    const warnings = [];
    let required = 0;
    let complete = 0;
    const bump = (ok, label, isWarning = false) => {
      required += 1;
      if (ok) complete += 1;
      else if (isWarning) warnings.push(label);
      else missing.push(label);
    };

    if (sectionId === "basics") {
      bump(meaningfulText(plan.title, 1), "Lesson title");
      bump(meaningfulText(plan.age, 1), "Age group");
      bump(meaningfulText(plan.theme, 1), "Theme");
      bump(Boolean(text(plan.coverImageUrl)), "Cover image", true);
    } else if (sectionId === "overview") {
      bump(meaningfulText(plan.weeklyOverview, 8), "Weekly overview (a short paragraph teachers can scan)");
      bump(meaningfulText(plan.vocabularyWords, 3), "Weekly vocabulary");
      bump(meaningfulText(plan.adaptations, 4), "Adaptations", true);
    } else if (sectionId === "objectives") {
      bump(meaningfulText(plan.objectives, 6), "Weekly learning objectives");
      bump((plan.learningDomains || []).length > 0, "At least one learning domain");
    } else if (sectionId === "materials") {
      bump(meaningfulText(plan.weeklyMaterials, 6), "Weekly materials list");
      bump(meaningfulText(plan.observationOpportunities, 4), "Observation opportunities", true);
    } else if (WEEKDAYS.includes(sectionId)) {
      const day = plan.dailyPlans?.[sectionId] || emptyDay();
      bump(meaningfulText(day.theme || day.focus, 1), "Daily focus");
      bump(meaningfulText(day.objectives, 4), "Daily objectives");
      bump(meaningfulText(day.materials, 3), "Daily materials (day-specific only — not the full weekly list)");
      bump(meaningfulText(day.preparation || day.setup, 3) || (day.circleTime || []).length > 0, "Preparation or circle-time plan");
      bump(meaningfulText(day.schedule, 3) || (day.transitions || []).length > 0 || meaningfulText(day.outdoorPlay, 3), "Schedule / flow for the day");
      bump((day.books || []).some(bookComplete) || (plan.books || []).some(bookComplete), "Book with discussion prompts");
      bump((day.songs || []).some(songComplete) || (plan.songs || []).some(songComplete), "Song with motions or teaching directions");
      const items = Array.isArray(day.items) ? day.items : [];
      bump(items.some((item) => meaningfulText(item?.title, 1)), "At least one named activity");
      bump(meaningfulText(day.observationFocus, 3) || (day.observations || []).some((row) => meaningfulText(row, 3)), "Observation focus");
      bump(meaningfulText(day.teacherQuestions, 3) || items.some((item) => meaningfulText(item?.teacherLanguage, 3)), "Teacher questions / language");
      bump(meaningfulText(day.familyConnection, 3), "Family connection for the day", true);
      items.forEach((item, index) => {
        activityWarnings({ ...item, _key: activityKey(sectionId, item, index) }).forEach((warning) => warnings.push(`${item.title || "Activity"}: ${warning}`));
      });
    } else if (sectionId === "reusable") {
      const reusable = flattenActivities(plan).filter((item) => /reusable|anytime|center/i.test(`${item.title} ${item.activityCategory}`));
      bump(true, "Reusable activities are optional");
      if (!reusable.length) warnings.push("No reusable/anytime activities tagged yet (optional).");
      complete = required;
    } else if (sectionId === "songs") {
      const songs = [...(plan.songs || [])];
      WEEKDAYS.forEach((day) => songs.push(...(plan.dailyPlans?.[day]?.songs || [])));
      bump(songs.length > 0, "At least one song");
      bump(songs.some(songComplete), "Song details with permitted lyrics/motions or verified source");
      songs.filter((song) => !songComplete(song)).forEach((song) => {
        warnings.push(`Song “${song.title || "Untitled"}” is missing lyrics/motions or source notes.`);
      });
    } else if (sectionId === "books") {
      const books = [...(plan.books || [])];
      WEEKDAYS.forEach((day) => books.push(...(plan.dailyPlans?.[day]?.books || [])));
      bump(books.length > 0, "At least one book");
      bump(books.some(bookComplete), "Book with author + discussion prompts");
    } else if (sectionId === "printables") {
      const linked = linkedResources(plan);
      bump(linked.length > 0, "At least one linked printable/resource");
      const pending = linked.filter((row) => !/approved|published/i.test(text(row.status)));
      if (pending.length) warnings.push(`${pending.length} printable(s) still need owner approval or publish.`);
    } else if (sectionId === "images") {
      const acts = flattenActivities(plan);
      const needing = acts.filter((item) => {
        const req = imageRequirementForActivity(item);
        return (req === "example_recommended" || req === "required") && !item.noImageNeeded;
      });
      const withImages = needing.filter((item) => text(item.exampleImageUrl || item.setupImageUrl || item.imageUrl));
      bump(needing.length === 0 || withImages.length === needing.length, "Example images for activities that need them (or mark No image needed)");
      needing.filter((item) => !text(item.exampleImageUrl || item.setupImageUrl || item.imageUrl)).forEach((item) => {
        missing.push(`${item.title || "Activity"} needs an example image or “No image needed”.`);
      });
    } else if (sectionId === "toolkit") {
      const toolkit = plan.teachingKit?.teacherToolkit || {};
      bump(meaningfulText(toolkit.overview || toolkit.summary || plan.weeklyOverview, 4), "Teacher toolkit overview");
      bump(fieldFilled(toolkit.prepChecklist) || meaningfulText(toolkit.preparation, 4), "Prep checklist");
    } else if (sectionId === "family") {
      bump(meaningfulText(plan.familyConnection, 5), "Weekly family connection");
    } else if (sectionId === "quality") {
      const report = evaluateQuality(plan);
      bump(!report.blockers.length, "No hard publish blockers");
      report.blockers.forEach((blocker) => missing.push(blocker.label));
      report.warnings.forEach((warning) => warnings.push(warning.label));
    } else if (sectionId === "publish") {
      const statuses = SECTION_DEFS.filter((row) => row.id !== "publish").map((row) => ({
        id: row.id,
        ...computeSectionStatus(row.id, plan, { skipPublish: true }),
      }));
      const incomplete = statuses.filter((row) => row.status === "Not Started" || row.status === "Needs Work");
      const unapproved = statuses.filter((row) => row.status !== "Approved" && row.id !== "quality" && row.id !== "reusable");
      bump(incomplete.length === 0, "Every required section is complete");
      bump(unapproved.length === 0, "Owner has approved the completed sections", true);
      if (incomplete.length) {
        incomplete.forEach((row) => missing.push(`${row.id}: still ${row.status}`));
      }
    }
    return { required, complete, missing: [...new Set(missing)], warnings: [...new Set(warnings)] };
  }

  function computeSectionStatus(sectionId, plan, options = {}) {
    if (sectionId === "publish" && options.skipPublish) {
      return { status: "Not Started", required: 0, complete: 0, missing: [], warnings: [] };
    }
    const checks = sectionRequiredChecks(sectionId, plan);
    const approval = state.ownerApprovals[`section:${sectionId}`];
    let status = "Not Started";
    if (checks.complete === 0 && checks.missing.length === checks.required) status = "Not Started";
    else if (checks.missing.length) status = "Needs Work";
    else status = "Complete";
    if (approval === "approved" && status === "Complete") status = "Approved";
    if (approval === "rejected") status = "Needs Work";
    return { status, ...checks };
  }

  function evaluateQuality(plan) {
    const blockers = [];
    const warnings = [];
    SECTION_DEFS.forEach((section) => {
      if (section.id === "quality" || section.id === "publish") return;
      const info = computeSectionStatus(section.id, plan, { skipPublish: true });
      if (info.missing.length) {
        blockers.push({
          id: `section:${section.id}`,
          sectionId: section.id,
          label: `${section.label}: ${info.missing[0]}`,
          activityKey: "",
        });
      }
      info.warnings.slice(0, 3).forEach((warning, index) => {
        warnings.push({
          id: `warn:${section.id}:${index}`,
          sectionId: section.id,
          label: `${section.label}: ${warning}`,
          activityKey: "",
        });
      });
    });
    flattenActivities(plan).forEach((item) => {
      activityWarnings(item).forEach((warning, index) => {
        const target = /image/i.test(warning) ? warnings : blockers;
        target.push({
          id: `activity:${item._key}:${index}`,
          sectionId: item.dayOfWeek,
          label: `${item.title || "Activity"} (${item.dayOfWeek}): ${warning}`,
          activityKey: item._key,
        });
      });
    });
    const linked = linkedResources(plan);
    if (linked.some((row) => /rejected|revision/i.test(text(row.status)))) {
      blockers.push({
        id: "printable-rejected",
        sectionId: "printables",
        label: "A printable was rejected or needs changes.",
        activityKey: "",
      });
    }
    if (linked.some((row) => /draft|pending/i.test(text(row.status)))) {
      blockers.push({
        id: "printable-pending",
        sectionId: "printables",
        label: "A printable is still waiting for review/publish.",
        activityKey: "",
      });
    }
    return { blockers, warnings };
  }

  function overallProgress(plan) {
    const rows = SECTION_DEFS.filter((row) => row.id !== "publish").map((row) => computeSectionStatus(row.id, plan));
    const required = rows.reduce((sum, row) => sum + row.required, 0);
    const complete = rows.reduce((sum, row) => sum + row.complete, 0);
    const percent = required ? Math.round((complete / required) * 100) : 0;
    const blockers = evaluateQuality(plan).blockers;
    const incompleteSections = rows.filter((row) => row.status === "Not Started" || row.status === "Needs Work").length;
    const approvedSections = rows.filter((row) => row.status === "Approved").length;
    const publishReady = blockers.length === 0 && incompleteSections === 0;
    return {
      percent,
      required,
      complete,
      blockerCount: blockers.length,
      incompleteSections,
      approvedSections,
      publishReady,
      draftStatus: text(plan.status || "draft"),
    };
  }

  function setField(path, value) {
    const parts = String(path || "").split(".");
    let cursor = state.draft;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
    state.dirty = true;
  }

  function textarea(label, path, value, example = "") {
    return `
      <label class="llh-lre-field">
        <span class="llh-lre-label">${esc(label)}</span>
        ${example ? `<span class="llh-lre-example">Example: ${esc(example)}</span>` : ""}
        <textarea data-lre-path="${esc(path)}" rows="4">${esc(value || "")}</textarea>
      </label>
    `;
  }

  function input(label, path, value, example = "") {
    return `
      <label class="llh-lre-field">
        <span class="llh-lre-label">${esc(label)}</span>
        ${example ? `<span class="llh-lre-example">Example: ${esc(example)}</span>` : ""}
        <input data-lre-path="${esc(path)}" value="${esc(value || "")}" />
      </label>
    `;
  }

  function statusBadge(status) {
    const slug = String(status || "Not Started").toLowerCase().replace(/\s+/g, "-");
    return `<span class="llh-lre-status llh-lre-status--${esc(slug)}">${esc(status)}</span>`;
  }

  function sectionChrome(section, info) {
    return `
      <header class="llh-lre-section-chrome" data-lre-section-chrome>
        <p class="llh-lre-kicker">${esc(state.draft.title || "Untitled lesson")}</p>
        <h2>${esc(section.label)}</h2>
        <p class="muted-copy">${esc(section.blurb)}</p>
        <div class="llh-lre-section-meta">
          ${statusBadge(info.status)}
          <span>${info.complete}/${info.required} required fields complete</span>
          <span>Owner: ${esc(state.ownerApprovals[`section:${section.id}`] || "not reviewed")}</span>
        </div>
        ${info.missing.length ? `<div class="llh-lre-missing" data-lre-missing><strong>Missing:</strong><ul>${info.missing.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>` : `<p class="llh-lre-ok">Required information looks complete for this section.</p>`}
        ${info.warnings.length ? `<div class="llh-lre-warnings"><strong>Quality warnings:</strong><ul>${info.warnings.slice(0, 8).map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>` : ""}
        <div class="llh-lre-approve-row">
          <button type="button" class="ghost-button" data-lre-approve-section="${esc(section.id)}">Mark section Approved</button>
          <button type="button" class="ghost-button" data-lre-reject-section="${esc(section.id)}">Request changes</button>
        </div>
      </header>
    `;
  }

  function renderActivityCard(item) {
    const status = activityStatus(item);
    const warnings = activityWarnings(item);
    const req = imageRequirementForActivity(item);
    return `
      <button type="button" class="llh-lre-activity-card ${state.openActivityKey === item._key ? "is-open" : ""}" data-lre-open-activity="${esc(item._key)}">
        <strong>${esc(item.title || "Untitled activity")}</strong>
        <span>${esc(item.activityCategory || "Activity")}</span>
        <span>${esc(item.dayOfWeek)}</span>
        ${statusBadge(status)}
        <span>Images: ${esc(req.replace(/_/g, " "))}</span>
        <span>${warnings.length} warning${warnings.length === 1 ? "" : "s"}</span>
      </button>
    `;
  }

  function renderOpenActivity(item) {
    if (!item) return "";
    const day = item.dayOfWeek;
    const index = item._index;
    const base = `dailyPlans.${day}.items.${index}`;
    return `
      <article class="llh-lre-activity-editor" data-lre-activity-editor="${esc(item._key)}">
        <div class="llh-lre-activity-editor-head">
          <h3>Editing: ${esc(item.title || "Untitled activity")}</h3>
          <button type="button" class="ghost-button" data-lre-close-activity>Close activity</button>
        </div>
        ${ACTIVITY_SUBSECTIONS.map((sub) => {
          if (sub.id === "core") {
            return `<section class="llh-lre-sub"><h4>${esc(sub.label)}</h4>
              ${input("Activity name", `${base}.title`, item.title, "Mirror Play Faces")}
              ${input("Category", `${base}.activityCategory`, item.activityCategory || "", "Art / Circle Time / Sensory")}
              ${textarea("Objective", `${base}.objective`, item.objective, "Children notice and name feelings on their own faces.")}
              ${textarea("Short description", `${base}.description`, item.description, "A quick teacher-facing summary of the play invitation.")}
            </section>`;
          }
          if (sub.id === "materials") {
            return `<section class="llh-lre-sub"><h4>${esc(sub.label)}</h4>
              ${textarea("Materials for this activity", `${base}.materials`, item.materials, "Hand mirrors, feeling cards, basket")}
              ${textarea("Setup", `${base}.setup`, item.setup, "Place mirrors at child height near the feeling cards.")}
            </section>`;
          }
          if (sub.id === "directions") {
            return `<section class="llh-lre-sub"><h4>${esc(sub.label)}</h4>
              ${textarea("Directions / steps", `${base}.steps`, item.steps, "1. Invite two friends… 2. Model one feeling…")}
            </section>`;
          }
          if (sub.id === "guidance") {
            return `<section class="llh-lre-sub"><h4>${esc(sub.label)}</h4>
              ${textarea("Teacher role", `${base}.teacherRole`, item.teacherRole, "Model, then step back and narrate gently.")}
              ${textarea("Teacher language / questions", `${base}.teacherLanguage`, item.teacherLanguage, "What do your eyebrows do when you feel surprised?")}
            </section>`;
          }
          if (sub.id === "learning") {
            return `<section class="llh-lre-sub"><h4>${esc(sub.label)}</h4>
              ${textarea("Learning goals", `${base}.learningGoalsText`, Array.isArray(item.learningGoals) ? item.learningGoals.join("\n") : (item.learningGoals || ""), "Name two feelings\nNotice a friend’s face")}
              ${textarea("Observation opportunities", `${base}.observationOpportunities`, item.observationOpportunities, "Does the child try a new expression without prompting?")}
              ${textarea("Vocabulary", `${base}.vocabulary`, item.vocabulary, "happy, calm, eyebrows, mirror")}
            </section>`;
          }
          if (sub.id === "adaptations") {
            return `<section class="llh-lre-sub"><h4>${esc(sub.label)}</h4>
              ${textarea("Adaptations", `${base}.adaptations`, item.adaptations, "Offer photos instead of mirrors for children who prefer still images.")}
              ${textarea("Extensions", `${base}.extensions`, item.extensions, "Invite children to draw the face they practiced.")}
              ${textarea("Age modifications", `${base}.ageModifications`, item.ageModifications, "Toddlers: fewer cards. Pre-K: peer coaching.")}
            </section>`;
          }
          if (sub.id === "cleanup") {
            return `<section class="llh-lre-sub"><h4>${esc(sub.label)}</h4>
              ${textarea("Safety notes", `${base}.safetyNotes`, item.safetyNotes, "Use unbreakable mirrors only.")}
              ${textarea("Cleanup / reset", `${base}.cleanup`, item.cleanup || item.resetNotes || "", "Wipe mirrors and return cards to the basket.")}
            </section>`;
          }
          return `<section class="llh-lre-sub"><h4>${esc(sub.label)}</h4>
            ${input("Example image URL", `${base}.exampleImageUrl`, item.exampleImageUrl || "", "Upload via Images section when possible")}
            ${input("Setup image URL", `${base}.setupImageUrl`, item.setupImageUrl || "", "")}
            <label class="llh-lre-check"><input type="checkbox" data-lre-bool="${base}.noImageNeeded" ${item.noImageNeeded ? "checked" : ""} /> No image needed for this activity</label>
            <p class="muted-copy">Circle time, songs, movement, and simple conversations usually do not need an example image. Art setups and unclear end products usually do.</p>
            ${item.exampleImageUrl ? `<img class="llh-lre-thumb" src="${esc(item.exampleImageUrl)}" alt="Example for ${esc(item.title || "activity")}" />` : ""}
            ${item.setupImageUrl ? `<img class="llh-lre-thumb" src="${esc(item.setupImageUrl)}" alt="Setup for ${esc(item.title || "activity")}" />` : ""}
          </section>`;
        }).join("")}
      </article>
    `;
  }

  function renderWeekday(sectionId) {
    const day = state.draft.dailyPlans[sectionId] || emptyDay();
    const items = (day.items || []).map((item, index) => ({
      ...item,
      dayOfWeek: sectionId,
      _key: activityKey(sectionId, item, index),
      _index: index,
    }));
    const open = items.find((item) => item._key === state.openActivityKey) || null;
    const base = `dailyPlans.${sectionId}`;
    return `
      ${input("Daily focus", `${base}.theme`, day.theme, "Faces & Feelings")}
      ${textarea("Daily objectives", `${base}.objectives`, day.objectives, "Children practice naming feelings during play.")}
      ${textarea("Daily materials (day-specific only)", `${base}.materials`, day.materials, "Feeling cards for today’s small group — not the full weekly supply list")}
      ${textarea("Preparation", `${base}.preparation`, day.preparation || "", "Stage mirrors before arrival; print two extra feeling cards.")}
      ${textarea("Schedule / flow", `${base}.schedule`, day.schedule || "", "Arrival → circle song → small groups → outdoor → closing")}
      ${textarea("Book for this day", `${base}.bookNotes`, day.bookNotes || (day.books?.[0]?.title || ""), "The Color Monster — ask: Which color matches your body today?")}
      ${textarea("Song for this day", `${base}.songNotes`, day.songNotes || (day.songs?.[0]?.title || ""), "If You’re Happy and You Know It — add calm/proud verses")}
      <div class="llh-lre-activity-list">
        <h3>Activities</h3>
        <p class="muted-copy">Open one activity at a time. Summary cards stay visible so you can screenshot a single activity cleanly.</p>
        <div class="llh-lre-activity-cards">${items.map(renderActivityCard).join("") || "<p class='muted-copy'>No activities yet for this day.</p>"}</div>
        ${open ? renderOpenActivity(open) : ""}
      </div>
      ${textarea("Observation focus", `${base}.observationFocus`, day.observationFocus || (Array.isArray(day.observations) ? day.observations.join("\n") : ""), "Does the child try a peer’s suggestion?")}
      ${textarea("Teacher questions", `${base}.teacherQuestions`, day.teacherQuestions || "", "What helped your body feel calm?")}
      ${textarea("Family connection", `${base}.familyConnection`, day.familyConnection || "", "Ask at pickup: Which feeling did we practice today?")}
    `;
  }

  function renderBooksSection() {
    const books = state.draft.books || [];
    return `
      <p class="muted-copy">Add complete book details. Discussion prompts should be something a teacher can ask aloud.</p>
      ${books.map((book, index) => `
        <article class="llh-lre-card-block">
          <h3>Book ${index + 1}</h3>
          ${input("Title", `books.${index}.title`, book.title, "The Color Monster")}
          ${input("Author", `books.${index}.author`, book.author || book.by || "", "Anna Llenas")}
          ${textarea("Discussion prompts", `books.${index}.discussionPrompts`, book.discussionPrompts || book.discussion || book.questions || "", "What color is your feeling right now? Where do you feel it in your body?")}
          ${textarea("Notes", `books.${index}.notes`, book.notes || "", "Keep the read-aloud under 8 minutes for toddlers.")}
        </article>
      `).join("") || "<p class='muted-copy'>No weekly books yet. Day-level books still count in section status.</p>"}
      <button type="button" class="ghost-button" data-lre-add-book>+ Add book</button>
    `;
  }

  function renderSongsSection() {
    const songs = state.draft.songs || [];
    return `
      <p class="muted-copy">Only include lyrics you wrote or verified as public-domain / licensed for classroom use.</p>
      ${songs.map((song, index) => `
        <article class="llh-lre-card-block">
          <h3>Song ${index + 1}</h3>
          ${input("Title", `songs.${index}.title`, song.title, "Hello Friends")}
          ${input("Source / rights", `songs.${index}.source`, song.source || song.rights || "", "Original LLH melody · classroom use OK")}
          ${textarea("Lyrics (permitted)", `songs.${index}.lyrics`, song.lyrics || "", "Hello friends, how do you do…")}
          ${textarea("Motions / teaching directions", `songs.${index}.motions`, song.motions || song.teachingDirections || "", "Wave, tap knees, pass a smile")}
          ${input("Weekday placement", `songs.${index}.weekday`, song.weekday || "", "monday")}
        </article>
      `).join("") || "<p class='muted-copy'>No weekly songs yet.</p>"}
      <button type="button" class="ghost-button" data-lre-add-song>+ Add song</button>
    `;
  }

  function renderPrintableIdeaCard(idea) {
    const enrich = global.LLHTeachingKitEnrichment;
    const item = enrich && typeof enrich.normalizePrintableIdea === "function"
      ? enrich.normalizePrintableIdea(idea)
      : (idea && typeof idea === "object" ? idea : (typeof idea === "string" ? { title: idea } : null));
    if (!item) return "";
    const title = esc(item.title || item.name || item.label || "");
    const description = esc(item.description || item.purpose || item.summary || "");
    const type = esc(item.type || item.kind || item.format || "");
    const instructions = esc(item.instructions || item.howTo || item.directions || "");
    const notes = esc(item.notes || "");
    if (!title && !description && !type && !instructions && !notes) return "";
    return `
      <article class="llh-lre-card-block llh-lre-printable-idea" data-lre-printable-idea="1">
        <h3>${title || "Printable idea"}</h3>
        ${type ? `<p><span class="muted-copy">Type</span> ${type}</p>` : ""}
        ${description ? `<p><span class="muted-copy">Description</span> ${description}</p>` : ""}
        ${instructions ? `<p><span class="muted-copy">Instructions</span> ${instructions}</p>` : ""}
        ${notes ? `<p><span class="muted-copy">Notes</span> ${notes}</p>` : ""}
      </article>
    `;
  }

  function renderPrintablesSection() {
    const linked = linkedResources(state.draft);
    const ideaList = Array.isArray(state.draft?.enrichmentDraft?.week?.printableIdeas)
      ? state.draft.enrichmentDraft.week.printableIdeas
      : [];
    const ideaCards = ideaList.map((idea) => renderPrintableIdeaCard(idea)).filter(Boolean).join("");
    return `
      <p class="muted-copy">Printable previews stay inside Admin. Nothing publishes automatically.</p>
      ${ideaCards ? `
        <h3>Printable ideas from upgrade draft</h3>
        <div class="llh-lre-printable-idea-list">${ideaCards}</div>
      ` : ""}
      <div class="llh-lre-printable-list">
        ${linked.map((resource) => {
          const status = text(resource.status || "draft");
          const thumb = resource.previewImageUrl
            || resource.previewUrl
            || state.draft.coverImageUrl
            || "/images/lesson-covers/default.svg";
          return `
            <article class="llh-lre-card-block" data-lre-resource="${esc(resource.id)}">
              <div class="llh-lre-printable-head">
                <img class="llh-lre-thumb" src="${esc(thumb)}" alt="Preview for ${esc(resource.title || "printable")}" />
                <div>
                  <h3>${esc(resource.title || "Printable")}</h3>
                  <p class="muted-copy">${esc(status)} · ${esc(resource.fileName || resource.resourceType || "Printable")}</p>
                  ${statusBadge(/published/i.test(status) ? "Approved" : /reject|revision/i.test(status) ? "Needs Work" : /approved/i.test(status) ? "Approved" : "Needs Work")}
                </div>
              </div>
              <div class="llh-lre-carousel" data-lre-printable-carousel="${esc(resource.id)}">
                <p class="muted-copy">Page thumbnails appear after you open Preview (uses the Admin printable reviewer when available).</p>
              </div>
              <div class="form-actions">
                <button type="button" class="primary-button" data-lre-resource-preview="${esc(resource.id)}">Preview</button>
                <button type="button" class="ghost-button" data-lre-resource-approve="${esc(resource.id)}">Approve</button>
                <button type="button" class="ghost-button" data-lre-resource-changes="${esc(resource.id)}">Request Changes</button>
                <button type="button" class="ghost-button" data-lre-resource-replace="${esc(resource.id)}">Replace</button>
                <button type="button" class="ghost-button" data-lre-resource-unlink="${esc(resource.id)}">Unlink</button>
                <button type="button" class="ghost-button" data-lre-resource-publish="${esc(resource.id)}">Publish Resource</button>
              </div>
            </article>
          `;
        }).join("") || `<p class="muted-copy">No resources linked yet. If a pack appears in the dropdown below, link it here.</p>`}
      </div>
      <div class="form-actions">
        <label class="llh-lre-field">Link existing resource
          <select data-lre-link-resource>
            <option value="">Select a resource…</option>
            ${(typeof curriculumResourcesForAdmin === "function" ? curriculumResourcesForAdmin() : [])
              .filter((row) => !(state.draft.resourceIds || []).includes(row.id))
              .map((row) => `<option value="${esc(row.id)}">${esc(row.title || row.id)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="ghost-button" data-lre-link-resource-btn>Link resource</button>
      </div>
    `;
  }

  function renderImagesSection() {
    const acts = flattenActivities(state.draft);
    return `
      <div class="llh-lre-image-grid">
        ${acts.map((item) => {
          const req = imageRequirementForActivity(item);
          const url = item.exampleImageUrl || item.setupImageUrl || item.imageUrl || "";
          return `
            <article class="llh-lre-card-block">
              <h3>${esc(item.title || "Activity")}</h3>
              <p class="muted-copy">${esc(item.dayOfWeek)} · ${esc(item.activityCategory || "Activity")} · ${esc(req.replace(/_/g, " "))}</p>
              ${url ? `<img class="llh-lre-image" src="${esc(url)}" alt="${esc(item.title || "Activity")} example" />` : `<div class="llh-lre-image llh-lre-image--empty">No image yet</div>`}
              ${input("Example image URL", `dailyPlans.${item.dayOfWeek}.items.${item._index}.exampleImageUrl`, item.exampleImageUrl || "", "")}
              <label class="llh-lre-check"><input type="checkbox" data-lre-bool="dailyPlans.${item.dayOfWeek}.items.${item._index}.noImageNeeded" ${item.noImageNeeded ? "checked" : ""} /> No image needed</label>
              <div class="form-actions">
                <button type="button" class="ghost-button" data-lre-approve-image="${esc(item._key)}">Approve</button>
                <button type="button" class="ghost-button" data-lre-reject-image="${esc(item._key)}">Request Changes</button>
                <button type="button" class="ghost-button" data-lre-clear-image="${esc(item._key)}">Remove</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderQualitySection() {
    const report = evaluateQuality(state.draft);
    return `
      <p class="muted-copy">Click a blocker to open the exact section or activity that needs work.</p>
      <h3>Blockers (${report.blockers.length})</h3>
      <ul class="llh-lre-blocker-list">
        ${report.blockers.map((row) => `
          <li><button type="button" class="llh-lre-blocker-link" data-lre-jump-section="${esc(row.sectionId)}" data-lre-jump-activity="${esc(row.activityKey || "")}">${esc(row.label)}</button></li>
        `).join("") || "<li class='llh-lre-ok'>No hard blockers right now.</li>"}
      </ul>
      <h3>Warnings (${report.warnings.length})</h3>
      <ul class="llh-lre-blocker-list">
        ${report.warnings.map((row) => `
          <li><button type="button" class="llh-lre-blocker-link" data-lre-jump-section="${esc(row.sectionId)}" data-lre-jump-activity="${esc(row.activityKey || "")}">${esc(row.label)}</button></li>
        `).join("") || "<li class='muted-copy'>No quality warnings.</li>"}
      </ul>
    `;
  }

  function renderPublishSection() {
    const progress = overallProgress(state.draft);
    const sections = SECTION_DEFS.filter((row) => row.id !== "publish").map((row) => ({
      ...row,
      ...computeSectionStatus(row.id, state.draft),
    }));
    const linked = linkedResources(state.draft);
    const images = flattenActivities(state.draft).map((item) => ({
      title: item.title,
      ok: Boolean(item.exampleImageUrl || item.setupImageUrl || item.imageUrl || item.noImageNeeded || imageRequirementForActivity(item) === "no_image_needed"),
    }));
    return `
      <div class="llh-lre-publish-grid">
        <article class="llh-lre-card-block">
          <h3>Sections complete</h3>
          <p>${sections.filter((row) => row.status === "Complete" || row.status === "Approved").length} / ${sections.length}</p>
          <h3>Sections approved</h3>
          <p>${progress.approvedSections} / ${sections.length}</p>
          <h3>Outstanding blockers</h3>
          <p>${progress.blockerCount}</p>
        </article>
        <article class="llh-lre-card-block">
          <h3>Printable statuses</h3>
          <ul>${linked.map((row) => `<li>${esc(row.title || row.id)} — ${esc(row.status || "draft")}</li>`).join("") || "<li>None linked</li>"}</ul>
          <h3>Image statuses</h3>
          <ul>${images.map((row) => `<li>${esc(row.title || "Activity")} — ${row.ok ? "OK" : "Needs attention"}</li>`).join("")}</ul>
        </article>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost-button ${state.previewViewport === "desktop" ? "is-active" : ""}" data-lre-viewport="desktop">Desktop preview</button>
        <button type="button" class="ghost-button ${state.previewViewport === "mobile" ? "is-active" : ""}" data-lre-viewport="mobile">Mobile preview</button>
        <button type="button" class="ghost-button ${state.previewViewport === "print" ? "is-active" : ""}" data-lre-viewport="print">Print preview</button>
        <button type="button" class="ghost-button" data-lre-compare>Compare published vs draft</button>
      </div>
      <div class="llh-lre-preview-frame llh-lre-preview-frame--${esc(state.previewViewport)}" data-lre-preview-frame>
        <p class="muted-copy">Preview uses the customer Teaching Kit renderer when available. Viewport: ${esc(state.previewViewport)}.</p>
        <div data-lre-preview-host></div>
      </div>
      <div class="llh-lre-publish-confirm">
        <p><strong>Publish Ready: ${progress.publishReady ? "Yes" : "No"}</strong> — a lesson cannot be Publish Ready while any section is incomplete, blocked, rejected, or waiting on printable/image review.</p>
        <label class="llh-lre-field">Type an owner confirmation to publish
          <input data-lre-publish-confirm placeholder="PUBLISH LESSON" value="${esc(state.publishConfirm)}" />
        </label>
        <button type="button" class="primary-button" data-lre-publish ${progress.publishReady && state.publishConfirm === "PUBLISH LESSON" ? "" : "disabled"}>Publish lesson</button>
        <p class="muted-copy">Publishing is deliberate and never automatic. Prefer Save Draft while reviewing.</p>
      </div>
    `;
  }

  function renderSectionBody(sectionId) {
    const plan = state.draft;
    if (sectionId === "basics") {
      return `
        ${input("Lesson title", "title", plan.title, "All About Me")}
        ${input("Age group", "age", plan.age, "Preschool")}
        ${input("Theme", "theme", plan.theme, "All About Me")}
        ${input("Draft status", "status", plan.status || "draft", "draft")}
        ${input("Cover image URL", "coverImageUrl", plan.coverImageUrl || "", "/images/lesson-covers/...")}
        ${plan.coverImageUrl ? `<img class="llh-lre-cover" src="${esc(plan.coverImageUrl)}" alt="Lesson cover" />` : ""}
      `;
    }
    if (sectionId === "overview") {
      return `
        ${textarea("Weekly overview", "weeklyOverview", plan.weeklyOverview, "This week children explore names, feelings, and what makes each friend unique.")}
        ${textarea("Weekly vocabulary", "vocabularyWords", plan.vocabularyWords, "unique, feelings, family, friends")}
        ${textarea("Adaptations", "adaptations", plan.adaptations, "Offer photo supports for dual-language learners.")}
      `;
    }
    if (sectionId === "objectives") {
      return `
        ${textarea("Learning objectives", "objectives", plan.objectives, "Children will name one feeling and one thing that makes them unique.")}
        ${textarea("Learning domains (comma separated)", "learningDomainsText", (plan.learningDomains || []).join(", "), "Social-Emotional, Language")}
      `;
    }
    if (sectionId === "materials") {
      return `
        ${textarea("Weekly materials", "weeklyMaterials", plan.weeklyMaterials, "Mirrors, name cards, multicultural crayons, family photo frames")}
        ${textarea("Preparation notes", "preparationNotes", plan.preparationNotes || plan.teachingKit?.teacherToolkit?.preparation || "", "Prep name cards before Monday arrival.")}
        ${textarea("Safety notes", "safetyNotes", plan.safetyNotes || "", "Use unbreakable mirrors only.")}
        ${textarea("Observation opportunities", "observationOpportunities", plan.observationOpportunities, "Notice whether children greet friends by name.")}
      `;
    }
    if (WEEKDAYS.includes(sectionId)) return renderWeekday(sectionId);
    if (sectionId === "reusable") {
      const reusable = flattenActivities(plan).filter((item) => /reusable|anytime|center/i.test(`${item.title} ${item.activityCategory}`));
      return `
        <p class="muted-copy">Activities tagged as reusable/anytime/center appear here. Open a weekday to edit the full activity.</p>
        <div class="llh-lre-activity-cards">${reusable.map(renderActivityCard).join("") || "<p class='muted-copy'>No reusable activities tagged yet.</p>"}</div>
      `;
    }
    if (sectionId === "songs") return renderSongsSection();
    if (sectionId === "books") return renderBooksSection();
    if (sectionId === "printables") return renderPrintablesSection();
    if (sectionId === "images") return renderImagesSection();
    if (sectionId === "toolkit") {
      const toolkit = plan.teachingKit?.teacherToolkit || {};
      return `
        ${textarea("Toolkit overview", "teachingKit.teacherToolkit.overview", toolkit.overview || "", "Keep feelings work playful and brief.")}
        ${textarea("Prep checklist", "teachingKit.teacherToolkit.preparation", toolkit.preparation || (Array.isArray(toolkit.prepChecklist) ? toolkit.prepChecklist.join("\n") : ""), "Print cards\nStage mirrors\nCue family note")}
        ${textarea("Teacher tips", "teachingKit.teacherToolkit.tips", toolkit.tips || "", "Narrate feelings without forcing a share.")}
      `;
    }
    if (sectionId === "family") {
      return textarea("Family connection", "familyConnection", plan.familyConnection, "Ask your child which feeling they practiced and draw it together.");
    }
    if (sectionId === "quality") return renderQualitySection();
    if (sectionId === "publish") return renderPublishSection();
    return `<p class="muted-copy">Unknown section.</p>`;
  }

  function renderNav() {
    return `
      <nav class="llh-lre-nav" aria-label="Lesson sections">
        <label class="llh-lre-nav-mobile">Jump to section
          <select data-lre-section-select>
            ${SECTION_DEFS.map((section) => {
              const info = computeSectionStatus(section.id, state.draft);
              return `<option value="${esc(section.id)}" ${state.sectionId === section.id ? "selected" : ""}>${esc(section.label)} · ${esc(info.status)}</option>`;
            }).join("")}
          </select>
        </label>
        <ul class="llh-lre-nav-list">
          ${SECTION_DEFS.map((section) => {
            const info = computeSectionStatus(section.id, state.draft);
            return `
              <li>
                <button type="button" class="llh-lre-nav-btn ${state.sectionId === section.id ? "is-active" : ""}" data-lre-section="${esc(section.id)}">
                  <span>${esc(section.label)}</span>
                  ${statusBadge(info.status)}
                  <small>${info.complete}/${info.required}</small>
                </button>
              </li>
            `;
          }).join("")}
        </ul>
      </nav>
    `;
  }

  function renderHeader(progress) {
    return `
      <header class="llh-lre-header" data-lre-sticky-header>
        <div class="llh-lre-header-main">
          <div>
            <p class="llh-lre-kicker">Lesson Review & Editor · Owner only</p>
            <h1>${esc(state.draft.title || "Untitled lesson")}</h1>
            <p class="muted-copy">${esc(state.draft.age || "Age")} · ${esc(state.draft.theme || "Theme")} · Draft status: ${esc(progress.draftStatus)} · Progress ${progress.percent}% · Blockers ${progress.blockerCount}</p>
          </div>
          <div class="llh-lre-header-actions">
            <button type="button" class="ghost-button" data-lre-preview>Preview</button>
            <button type="button" class="primary-button" data-lre-save-draft ${state.saving ? "disabled" : ""}>Save Draft</button>
            <button type="button" class="ghost-button" data-lre-back>Back to Lesson Plans</button>
            <button type="button" class="ghost-button" data-lre-screenshot-toggle>${state.screenshotMode ? "Exit Screenshot mode" : "Screenshot mode"}</button>
          </div>
        </div>
        ${state.statusText ? `<p class="form-message ${state.isSuccess ? "success" : "error"}" role="status">${esc(state.statusText)}</p>` : ""}
      </header>
    `;
  }

  function mountPreview() {
    const frame = document.querySelector("[data-lre-preview-host]");
    if (!frame) return;
    try {
      if (typeof LLHTeachingKitEnrichmentEditor?.open === "function" && state.sectionId === "publish") {
        frame.innerHTML = `<p class="muted-copy">Use Preview in the header for the full Teaching Kit. Current viewport: <strong>${esc(state.previewViewport)}</strong>.</p>
          <pre class="llh-lre-compare-pre">${esc(JSON.stringify({
            title: state.draft.title,
            age: state.draft.age,
            theme: state.draft.theme,
            activityCount: flattenActivities(state.draft).length,
            resourceCount: linkedResources(state.draft).length,
          }, null, 2))}</pre>`;
      }
    } catch (_error) {
      frame.innerHTML = `<p class="muted-copy">Preview unavailable in this session.</p>`;
    }
  }

  function render() {
    const el = host();
    if (!el || !state.open || !state.draft) return;
    const section = SECTION_DEFS.find((row) => row.id === state.sectionId) || SECTION_DEFS[0];
    const info = computeSectionStatus(section.id, state.draft);
    const progress = overallProgress(state.draft);
    el.hidden = false;
    el.innerHTML = `
      <div class="llh-lre ${state.screenshotMode ? "is-screenshot-mode" : ""}" data-lesson-review-editor>
        ${renderHeader(progress)}
        <div class="llh-lre-layout">
          ${renderNav()}
          <main class="llh-lre-main" data-lre-main>
            ${sectionChrome(section, info)}
            <div class="llh-lre-section-body" data-lre-section-body>
              ${renderSectionBody(section.id)}
            </div>
          </main>
        </div>
      </div>
    `;
    document.body.classList.toggle("llh-lre-open", true);
    document.body.classList.toggle("llh-lre-screenshot", state.screenshotMode);
    if (section.id === "publish") mountPreview();
  }

  function normalizeCollectedPlan(plan) {
    const next = ensurePlanShape(plan);
    if (typeof next.learningDomainsText === "string") {
      next.learningDomains = next.learningDomainsText.split(",").map((part) => part.trim()).filter(Boolean);
      delete next.learningDomainsText;
    }
    WEEKDAYS.forEach((day) => {
      const items = next.dailyPlans[day].items || [];
      items.forEach((item) => {
        if (typeof item.learningGoalsText === "string") {
          item.learningGoals = item.learningGoalsText.split("\n").map((part) => part.trim()).filter(Boolean);
          delete item.learningGoalsText;
        }
      });
    });
    return next;
  }

  async function saveDraft() {
    if (!isOwner()) {
      state.statusText = "Owner login required.";
      state.isSuccess = false;
      render();
      return false;
    }
    if (state.saving) return false;
    const token = (typeof adminSession === "function" ? adminSession()?.token : "") || "";
    const endpoint = global.curriculumLessonPlanConfig?.endpoint || "/api/admin/curriculum/lesson-plans";
    if (!token) {
      state.statusText = "Admin session required to save.";
      state.isSuccess = false;
      render();
      return false;
    }
    state.saving = true;
    state.statusText = "Saving draft…";
    state.isSuccess = true;
    render();
    try {
      const lessonPlan = normalizeCollectedPlan(state.draft);
      const existing = typeof curriculumLessonPlanById === "function"
        ? curriculumLessonPlanById(lessonPlan.id)
        : null;
      // Save Draft never publishes. Explicit publish uses _forcePublish.
      // Preserve already-published lessons so routine draft field saves do not demote Farm Animals / live kits.
      if (state._forcePublish) {
        lessonPlan.status = "published";
      } else if (existing && /^(published|featured)$/i.test(String(existing.status || ""))) {
        lessonPlan.status = existing.status;
      } else {
        lessonPlan.status = "draft";
      }
      const postOnce = async () => {
        const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
          ? curriculumExpectedUpdatedAt()
          : "";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ expectedUpdatedAt, lessonPlan }),
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
      };
      let { response, data } = await postOnce();
      if (response.status === 409 && data?.conflict) {
        if (data.curriculum && typeof applyCurriculumState === "function") {
          applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
        } else if (typeof loadAdminSiteContent === "function") {
          await loadAdminSiteContent().catch(() => {});
        }
        ({ response, data } = await postOnce());
      }
      if (!response.ok) throw new Error(data.error || `Save failed (${response.status})`);
      if (data.curriculum && typeof applyCurriculumState === "function") {
        applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
      } else if (data.siteContentUpdatedAt && typeof siteContentState !== "undefined" && siteContentState) {
        siteContentState.updatedAt = data.siteContentUpdatedAt;
      }
      const saved = data.lessonPlan || lessonPlan;
      state.draft = ensurePlanShape(saved);
      state.originalSnapshot = JSON.stringify(state.draft);
      state.dirty = false;
      state.statusText = "Draft saved. Nothing was published.";
      state.isSuccess = true;
      return true;
    } catch (error) {
      state.statusText = error.message || "Draft save failed.";
      state.isSuccess = false;
      return false;
    } finally {
      state.saving = false;
      state._forcePublish = false;
      render();
    }
  }

  async function publishLesson() {
    const progress = overallProgress(state.draft);
    if (!progress.publishReady) {
      state.statusText = "Publishing is blocked until every section is complete and blockers are cleared.";
      state.isSuccess = false;
      render();
      return;
    }
    if (state.publishConfirm !== "PUBLISH LESSON") {
      state.statusText = "Type PUBLISH LESSON to confirm.";
      state.isSuccess = false;
      render();
      return;
    }
    if (!window.confirm("Publish this lesson for customers now? This is a deliberate owner action.")) return;
    state._forcePublish = true;
    state.draft.status = "published";
    const ok = await saveDraft();
    if (ok) {
      state.statusText = "Lesson published.";
      state.isSuccess = true;
      render();
    }
  }

  function open(planId, options = {}) {
    if (!isOwner()) {
      if (typeof showActionFeedback === "function") {
        showActionFeedback("Lesson Review & Editor is owner-only.");
      }
      return false;
    }
    const incoming = options.lessonPlan && typeof options.lessonPlan === "object"
      ? options.lessonPlan
      : (typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(planId) : null);
    if (!incoming) {
      if (typeof showActionFeedback === "function") showActionFeedback("Lesson not found.");
      return false;
    }
    if (!host()) {
      if (typeof showActionFeedback === "function") showActionFeedback("Lesson Review editor host is missing.");
      return false;
    }
    const plan = ensurePlanShape(incoming);
    if (options.enrichmentDraft && typeof options.enrichmentDraft === "object") {
      plan.enrichmentDraft = clone(options.enrichmentDraft);
    }
    state.open = true;
    state.planId = plan.id || planId;
    state.draft = plan;
    state.originalSnapshot = JSON.stringify(plan);
    state.sectionId = options.sectionId || "basics";
    state.openActivityKey = "";
    state.screenshotMode = false;
    state.dirty = false;
    state.saving = false;
    state.statusText = options.ownerDraftReview
      ? "Draft Review lesson opened. Only one section is shown at a time."
      : "Lesson opened in Review & Editor. Only one section is shown at a time.";
    state.isSuccess = true;
    state.ownerDraftReview = options.ownerDraftReview === true;
    state.draftReviewId = text(options.draftReviewId || "");
    state.returnToQueue = options.returnToQueue === true;
    state.previewViewport = "desktop";
    state.publishConfirm = "";
    if (options.resourceApprovals && typeof options.resourceApprovals === "object") {
      Object.entries(options.resourceApprovals).forEach(([id, row]) => {
        state.ownerApprovals[`resource:${id}`] = row?.status || "pending";
      });
    }
    // Prefer draft-linked resources when queue provides them.
    if (Array.isArray(options.draftResourceIds) && options.draftResourceIds.length) {
      const merged = new Set([...(state.draft.resourceIds || []), ...options.draftResourceIds]);
      state.draft.resourceIds = [...merged];
    }
    render();
    return true;
  }

  async function close({ force = false, skipReturnNavigation = false } = {}) {
    if (!state.open) return true;
    if (state.dirty && !force) {
      const saveFirst = window.confirm("You have unsaved lesson edits. Save draft before leaving?");
      if (saveFirst) {
        const saved = await saveDraft();
        if (!saved) return false;
      } else if (!window.confirm("Leave without saving local edits?")) {
        return false;
      }
    }
    const returnToQueue = state.returnToQueue && !skipReturnNavigation;
    const draftReviewId = state.draftReviewId;
    state.open = false;
    state.dirty = false;
    state.screenshotMode = false;
    state.ownerDraftReview = false;
    state.returnToQueue = false;
    state.draftReviewId = "";
    document.body.classList.remove("llh-lre-open", "llh-lre-screenshot");
    const el = host();
    if (el) {
      el.innerHTML = "";
      el.hidden = true;
    }
    if (returnToQueue && typeof setAdminSectionTab === "function") {
      setAdminSectionTab("curriculum-draft-review");
      if (global.LLHDraftReviewQueue?.openDetail && draftReviewId) {
        Promise.resolve(global.LLHDraftReviewQueue.openDetail(draftReviewId)).catch(() => {});
      }
    } else if (typeof setAdminSectionTab === "function") {
      if (typeof adminCurriculumLessonEditorId !== "undefined") {
        try { adminCurriculumLessonEditorId = ""; } catch (_error) { /* ignore */ }
      }
      setAdminSectionTab("curriculum-lesson-plans");
      if (typeof renderAdminCurriculumLessonPlanManager === "function") {
        renderAdminCurriculumLessonPlanManager();
      }
    }
    return true;
  }

  function findActivity(key) {
    return flattenActivities(state.draft).find((item) => item._key === key) || null;
  }

  function applyPathValue(path, value, isBool = false) {
    if (path.endsWith("learningDomainsText")) {
      setField("learningDomainsText", value);
      state.draft.learningDomains = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
      return;
    }
    if (path.includes(".learningGoalsText")) {
      setField(path, value);
      const itemPath = path.replace(/\.learningGoalsText$/, "");
      const parts = itemPath.split(".");
      let cursor = state.draft;
      parts.forEach((part) => { cursor = cursor[part]; });
      if (cursor && typeof cursor === "object") {
        cursor.learningGoals = String(value || "").split("\n").map((part) => part.trim()).filter(Boolean);
      }
      return;
    }
    setField(path, isBool ? Boolean(value) : value);
  }

  async function onClick(event) {
    if (!state.open) return;
    const t = event.target;
    if (t.closest("[data-lre-back]")) {
      event.preventDefault();
      await close();
      return;
    }
    if (t.closest("[data-lre-save-draft]")) {
      event.preventDefault();
      await saveDraft();
      return;
    }
    if (t.closest("[data-lre-screenshot-toggle]")) {
      state.screenshotMode = !state.screenshotMode;
      render();
      return;
    }
    if (t.closest("[data-lre-preview]")) {
      state.sectionId = "publish";
      render();
      return;
    }
    const sectionBtn = t.closest("[data-lre-section]");
    if (sectionBtn) {
      state.sectionId = sectionBtn.getAttribute("data-lre-section");
      state.openActivityKey = "";
      render();
      return;
    }
    const openAct = t.closest("[data-lre-open-activity]");
    if (openAct) {
      const key = openAct.getAttribute("data-lre-open-activity");
      state.openActivityKey = state.openActivityKey === key ? "" : key;
      render();
      return;
    }
    if (t.closest("[data-lre-close-activity]")) {
      state.openActivityKey = "";
      render();
      return;
    }
    const approveSection = t.closest("[data-lre-approve-section]");
    if (approveSection) {
      const id = approveSection.getAttribute("data-lre-approve-section");
      const info = computeSectionStatus(id, state.draft);
      if (info.missing.length) {
        state.statusText = "Finish required fields before approving this section.";
        state.isSuccess = false;
      } else {
        state.ownerApprovals[`section:${id}`] = "approved";
        state.statusText = `${id} marked Approved.`;
        state.isSuccess = true;
        state.dirty = true;
      }
      render();
      return;
    }
    const rejectSection = t.closest("[data-lre-reject-section]");
    if (rejectSection) {
      const id = rejectSection.getAttribute("data-lre-reject-section");
      state.ownerApprovals[`section:${id}`] = "rejected";
      state.statusText = `${id} marked Needs Work.`;
      state.isSuccess = false;
      state.dirty = true;
      render();
      return;
    }
    const jump = t.closest("[data-lre-jump-section]");
    if (jump) {
      state.sectionId = jump.getAttribute("data-lre-jump-section") || "quality";
      state.openActivityKey = jump.getAttribute("data-lre-jump-activity") || "";
      render();
      return;
    }
    if (t.closest("[data-lre-add-book]")) {
      state.draft.books = Array.isArray(state.draft.books) ? state.draft.books : [];
      state.draft.books.push({ title: "", author: "", discussionPrompts: "", notes: "" });
      state.dirty = true;
      render();
      return;
    }
    if (t.closest("[data-lre-add-song]")) {
      state.draft.songs = Array.isArray(state.draft.songs) ? state.draft.songs : [];
      state.draft.songs.push({ title: "", source: "", lyrics: "", motions: "", weekday: "" });
      state.dirty = true;
      render();
      return;
    }
    if (t.closest("[data-lre-link-resource-btn]")) {
      const select = document.querySelector("[data-lre-link-resource]");
      const id = text(select?.value);
      if (!id) return;
      if (typeof linkCurriculumResourceToLesson === "function") {
        await linkCurriculumResourceToLesson(id, state.planId);
        const refreshed = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(state.planId) : null;
        if (refreshed) state.draft.resourceIds = [...(refreshed.resourceIds || [])];
        else state.draft.resourceIds = [...new Set([...(state.draft.resourceIds || []), id])];
      } else {
        state.draft.resourceIds = [...new Set([...(state.draft.resourceIds || []), id])];
      }
      state.dirty = true;
      state.statusText = "Resource linked.";
      state.isSuccess = true;
      render();
      return;
    }
    const unlink = t.closest("[data-lre-resource-unlink]");
    if (unlink) {
      const id = unlink.getAttribute("data-lre-resource-unlink");
      if (typeof unlinkCurriculumResourceFromLesson === "function") {
        await unlinkCurriculumResourceFromLesson(id, state.planId);
      }
      state.draft.resourceIds = (state.draft.resourceIds || []).filter((row) => row !== id);
      state.dirty = true;
      render();
      return;
    }
    const approveRes = t.closest("[data-lre-resource-approve]");
    if (approveRes) {
      state.ownerApprovals[`resource:${approveRes.getAttribute("data-lre-resource-approve")}`] = "approved";
      state.statusText = "Printable marked Approved (not published).";
      state.isSuccess = true;
      render();
      return;
    }
    const changesRes = t.closest("[data-lre-resource-changes]");
    if (changesRes) {
      state.ownerApprovals[`resource:${changesRes.getAttribute("data-lre-resource-changes")}`] = "rejected";
      state.statusText = "Requested printable changes.";
      state.isSuccess = false;
      render();
      return;
    }
    const previewRes = t.closest("[data-lre-resource-preview]");
    if (previewRes) {
      const id = previewRes.getAttribute("data-lre-resource-preview");
      let opened = false;
      try {
        if (typeof global.LLHDraftPrintableReview?.open === "function") {
          global.LLHDraftPrintableReview.open(id);
          opened = true;
        } else if (typeof openCurriculumResourcePreview === "function") {
          openCurriculumResourcePreview(id);
          opened = true;
        } else if (document.querySelector(`[data-curriculum-resource-open="${id}"]`)) {
          document.querySelector(`[data-curriculum-resource-open="${id}"]`).click();
          opened = true;
        } else {
          const resource = linkedResources(state.draft).find((row) => row.id === id);
          const href = resource?.mediaUrl || resource?.fileData || resource?.previewImageUrl || resource?.previewUrl || "";
          if (href) {
            window.open(href, "_blank", "noopener");
            opened = true;
          }
        }
      } catch (_error) {
        opened = false;
      }
      state.statusText = opened
        ? "Opened printable preview in Admin."
        : "Preview is unavailable for this printable in this session.";
      state.isSuccess = opened;
      render();
      return;
    }
    const publishRes = t.closest("[data-lre-resource-publish]");
    if (publishRes) {
      if (!window.confirm("Publish this resource only? The lesson itself will not publish.")) return;
      state.statusText = "Use Curriculum Resources or Draft Review printable Publish to publish a resource deliberately. Lesson stays unpublished.";
      state.isSuccess = true;
      render();
      return;
    }
    const clearImage = t.closest("[data-lre-clear-image]");
    if (clearImage) {
      const item = findActivity(clearImage.getAttribute("data-lre-clear-image"));
      if (item) {
        const path = `dailyPlans.${item.dayOfWeek}.items.${item._index}`;
        setField(`${path}.exampleImageUrl`, "");
        setField(`${path}.setupImageUrl`, "");
        setField(`${path}.imageUrl`, "");
      }
      render();
      return;
    }
    const viewport = t.closest("[data-lre-viewport]");
    if (viewport) {
      state.previewViewport = viewport.getAttribute("data-lre-viewport") || "desktop";
      render();
      return;
    }
    if (t.closest("[data-lre-compare]")) {
      const existing = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(state.planId) : null;
      const hostEl = document.querySelector("[data-lre-preview-host]");
      if (hostEl) {
        hostEl.innerHTML = `<pre class="llh-lre-compare-pre">${esc(JSON.stringify({
          publishedStatus: existing?.status || "unknown",
          draftTitle: state.draft.title,
          publishedTitle: existing?.title,
          draftActivities: flattenActivities(state.draft).length,
          publishedActivities: existing ? flattenActivities(ensurePlanShape(existing)).length : 0,
          draftResources: (state.draft.resourceIds || []).length,
          publishedResources: (existing?.resourceIds || []).length,
        }, null, 2))}</pre>`;
      }
      return;
    }
    if (t.closest("[data-lre-publish]")) {
      await publishLesson();
    }
  }

  function onChange(event) {
    if (!state.open) return;
    const path = event.target.getAttribute("data-lre-path");
    if (path) {
      applyPathValue(path, event.target.value);
      return;
    }
    const boolPath = event.target.getAttribute("data-lre-bool");
    if (boolPath) {
      applyPathValue(boolPath, event.target.checked, true);
      return;
    }
    if (event.target.matches("[data-lre-section-select]")) {
      state.sectionId = event.target.value;
      state.openActivityKey = "";
      render();
      return;
    }
    if (event.target.matches("[data-lre-publish-confirm]")) {
      state.publishConfirm = event.target.value;
      const btn = document.querySelector("[data-lre-publish]");
      const progress = overallProgress(state.draft);
      if (btn) btn.disabled = !(progress.publishReady && state.publishConfirm === "PUBLISH LESSON");
    }
  }

  document.addEventListener("click", (event) => { void onClick(event); });
  document.addEventListener("change", onChange);
  document.addEventListener("input", (event) => {
    if (!state.open) return;
    if (event.target.matches("[data-lre-publish-confirm]")) onChange(event);
    if (event.target.hasAttribute("data-lre-path")) {
      applyPathValue(event.target.getAttribute("data-lre-path"), event.target.value);
    }
  });

  global.LLHLessonReviewEditor = {
    open,
    close,
    isOpen: () => state.open === true,
    isDirty: () => state.dirty === true,
    render,
    getState: () => ({
      open: state.open,
      planId: state.planId,
      sectionId: state.sectionId,
      screenshotMode: state.screenshotMode,
      dirty: state.dirty,
    }),
    SECTION_DEFS,
    computeSectionStatus: (sectionId, plan) => computeSectionStatus(sectionId, plan || state.draft),
    overallProgress: (plan) => overallProgress(plan || state.draft),
  };
})(typeof window !== "undefined" ? window : globalThis);
