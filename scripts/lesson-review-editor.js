/**
 * Owner-only Lesson Review & Editor — one section at a time.
 * Entry: Lesson Plans → Edit, or Draft Review → Open Review.
 * Never auto-publishes. Does not mutate customer Teaching Kit flags.
 */
(function initLessonReviewEditor(global) {
  "use strict";

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const SECTION_DEFS = [
    { id: "basics", label: "Lesson overview", blurb: "Title, age, theme, cover, overview, objectives, and weekly materials. Required fields are marked in the section status." },
    { id: "week", label: "Weekly plan", blurb: "Monday–Friday focus and flow. Expand each day to edit without scrolling the whole week at once." },
    { id: "activities", label: "Activities", blurb: "Open one activity at a time. Core fields first, then enrichment and pictures." },
    { id: "books", label: "Books", blurb: "Complete book details and discussion prompts teachers can use aloud." },
    { id: "songs", label: "Songs", blurb: "Verified song details, motions, teaching directions, and weekday placement." },
    { id: "printables", label: "Printables", blurb: "Linked printable packs with page previews and owner approval actions." },
    { id: "family", label: "Family connection", blurb: "Take-home ideas and questions for families. Optional but recommended." },
    { id: "images", label: "Images", blurb: "Cover and activity photos labeled by lesson and activity. Upload replaces only the chosen slot." },
    { id: "toolkit", label: "Teacher notes", blurb: "Prep checklist, tips, and binder-ready teacher supports." },
    { id: "quality", label: "Quality review", blurb: "Honest blockers. Click any item to jump to the exact section or activity." },
    { id: "publish", label: "Review and preview", blurb: "Published-style preview (read-only), compare draft vs published, and confirm before publishing." },
  ];

  const QUICK_NAV = [
    { id: "basics", label: "Cover" },
    { id: "activities", label: "Activities" },
    { id: "books", label: "Books" },
    { id: "printables", label: "Printables" },
    { id: "publish", label: "Preview" },
  ];

  const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

  const IMAGE_REQUIREMENT_OPTIONS = Object.freeze([
    { id: "no_image_needed", label: "No image needed" },
    { id: "optional", label: "Optional" },
    { id: "setup_needed", label: "Setup image needed" },
    { id: "finished_example_needed", label: "Finished example needed" },
    { id: "both_setup_and_finished", label: "Both setup and finished example needed" },
  ]);

  /** Core Activity fields — must be meaningful before an activity counts Complete. */
  const CORE_ACTIVITY_FIELDS = Object.freeze([
    { key: "ageModifications", label: "Recommended age", minWords: 1, example: "Toddler (18–36 months); offer more adult support for younger friends." },
    { key: "durationMinutes", label: "Estimated duration", minWords: 1, example: "10–15 minutes" },
    { key: "objective", label: "Activity objective", minWords: 4, example: "Toddlers practice gentle touch while exploring whole apples with sight and smell." },
    { key: "description", label: "What children will do", minWords: 12, example: "Children sit at a low table with whole apples. They look, touch, and smell the fruit while the teacher narrates stem, skin, cool, and bumpy — without tasting today." },
    { key: "materials", label: "Materials", minWords: 3, example: "Three whole apples with different skins\nWashable placemats\nDamp cloth" },
    { key: "preparation", label: "Teacher preparation", minWords: 4, example: "Wash apples. Stage one apple per placemat before arrival. Keep tasting apples refrigerated for later in the week." },
    { key: "setup", label: "Setup", minWords: 4, example: "Place one apple on each placemat with a damp cloth nearby. Keep tasting for Thursday." },
    { key: "steps", label: "Step-by-step directions", minWords: 10, example: "1. Invite children to look and gently touch.\n2. Narrate stem, skin, cool, bumpy.\n3. Offer a view-finder for close looking.\n4. End before anyone bites; refrigerate leftovers." },
    { key: "teacherLanguage", label: "Teacher questions", minWords: 4, example: "What do you notice with your eyes?\nHow does the apple feel in your hands?\nWhere is the stem?" },
    { key: "observationOpportunities", label: "Learning and observation", minWords: 4, example: "Does the child use new sensory words? Do they stay gentle with the fruit?" },
    { key: "safetyNotes", label: "Safety and supervision", minWords: 4, example: "Whole apples only — no cutting or tasting today. Watch for mouthing. Adult stays at the table." },
    { key: "cleanupTips", label: "Cleanup", minWords: 3, example: "Wipe placemats. Refrigerate apples. Return cloths to laundry basket." },
  ]);

  const ACTIVITY_SUBSECTIONS = [
    { id: "core", label: "Core Activity" },
    { id: "enrichment", label: "Enrichment" },
    { id: "images", label: "Images" },
  ];

  const NO_IMAGE_CATEGORIES = /circle|song|music|movement|conversation|discussion|book|story|talk|greeting|transition|self.?explanatory|sound game|freeze dance|sorting|counting/i;
  const MAY_NEED_IMAGE = /art|craft|paint|collage|sensory|setup|printable|picture card|project|build|construct|science|experiment|invitation|unusual|finished product/i;

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
    customerPreviewOpen: false,
    imagePreviewUrl: "",
    lastSavedAt: "",
    beforeUnloadBound: false,
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
    if (!next.enrichmentDraft || typeof next.enrichmentDraft !== "object") {
      next.enrichmentDraft = { activities: {}, week: {} };
    }
    if (!next.enrichmentDraft.week || typeof next.enrichmentDraft.week !== "object") {
      next.enrichmentDraft.week = {};
    }
    if (!next.enrichmentDraft.activities || typeof next.enrichmentDraft.activities !== "object") {
      next.enrichmentDraft.activities = {};
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

  function meaningfulText(value, minWords = 3, options = {}) {
    const raw = text(value);
    if (!raw) return false;
    if (/^(tbd|todo|n\/?a|none|placeholder|lorem|asdf|xxx|test|add later|coming soon|to be (added|determined)|fix me)\b/i.test(raw)) {
      return false;
    }
    if (/add later|coming soon|to be determined|fill in later|placeholder/i.test(raw) && raw.split(/\s+/).length <= 8) {
      return false;
    }
    if (/^example:/i.test(raw)) return false;
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length < minWords) return false;
    const title = text(options.title || "").toLowerCase().replace(/[^\w\s]/g, "").trim();
    const normalized = raw.toLowerCase().replace(/[^\w\s]/g, "").trim();
    if (title && (normalized === title || normalized === `the ${title}` || normalized === `${title} activity`)) {
      return false;
    }
    return true;
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

  function normalizeImageRequirement(value) {
    const raw = text(value).toLowerCase().replace(/[\s-]+/g, "_");
    if (!raw) return "";
    if (["no_image_needed", "not_needed", "none", "no_image"].includes(raw)) return "no_image_needed";
    if (["optional"].includes(raw)) return "optional";
    if (["setup_needed", "setup_only", "setup_required", "setup"].includes(raw)) return "setup_needed";
    if (["finished_example_needed", "example_only", "example_required", "example_recommended", "finished_example", "example"].includes(raw)) {
      return "finished_example_needed";
    }
    if (["both_setup_and_finished", "setup_and_example", "both", "required"].includes(raw)) {
      return "both_setup_and_finished";
    }
    return raw;
  }

  function imageRequirementForActivity(item) {
    const forced = normalizeImageRequirement(item?.imageRequirement || item?.ownerImageRequirement);
    if (forced) return forced;
    if (item?.noImageNeeded === true) return "no_image_needed";
    const hay = `${item?.title || ""} ${item?.activityCategory || ""} ${item?.description || ""}`;
    if (NO_IMAGE_CATEGORIES.test(hay) && !MAY_NEED_IMAGE.test(hay)) return "no_image_needed";
    if (MAY_NEED_IMAGE.test(hay)) return "finished_example_needed";
    return "optional";
  }

  function imageRequirementLabel(req) {
    return IMAGE_REQUIREMENT_OPTIONS.find((row) => row.id === req)?.label || String(req || "optional").replace(/_/g, " ");
  }

  function coreFieldValue(item, key) {
    if (key === "steps") return item?.steps || item?.directions || "";
    if (key === "cleanupTips") return item?.cleanupTips || item?.cleanup || item?.resetNotes || "";
    if (key === "preparation") return item?.preparation || item?.prep || "";
    if (key === "ageModifications") {
      return item?.ageModifications || item?.recommendedAge || item?.ageBand || item?.ageGroup || "";
    }
    if (key === "durationMinutes") {
      if (item?.durationMinutes === null || item?.durationMinutes === undefined || item?.durationMinutes === "") {
        return text(item?.duration || item?.estimatedDuration || "");
      }
      return String(item.durationMinutes);
    }
    if (key === "observationOpportunities") {
      return Array.isArray(item?.observationOpportunities)
        ? item.observationOpportunities.join("\n")
        : (item?.observationOpportunities || item?.observationFocus || "");
    }
    if (key === "teacherLanguage") return item?.teacherLanguage || item?.teacherQuestions || "";
    return item?.[key] || "";
  }

  function coreFieldMeaningful(item, field) {
    const title = text(item?.title);
    const value = coreFieldValue(item, field.key);
    if (field.key === "durationMinutes") {
      const raw = text(value);
      if (!raw) return false;
      if (/^(tbd|todo|n\/?a|none|placeholder|add later|coming soon|to be (added|determined))$/i.test(raw)) return false;
      return true;
    }
    return meaningfulText(value, field.minWords, { title });
  }

  /**
   * Modular Core Activity validator used by cards, Quality Review, and future lessons.
   * Incomplete Core fields are review warnings by default. Only safety-critical /
   * unrunnable / gold-standard-required gaps become blockers.
   */
  function assessCoreActivity(item, plan = state.draft) {
    const title = text(item?.title);
    const missing = [];
    if (!meaningfulText(title, 1)) missing.push("Activity name");
    CORE_ACTIVITY_FIELDS.forEach((field) => {
      if (!coreFieldMeaningful(item, field)) missing.push(field.label);
    });
    const complete = missing.length === 0;
    const description = coreFieldValue(item, "description");
    const steps = coreFieldValue(item, "steps");
    const safetyNotes = coreFieldValue(item, "safetyNotes");
    const materials = coreFieldValue(item, "materials");
    const age = text(plan?.age || item?.age || item?.ageBand || item?.recommendedAge || "");
    const riskHay = `${age} ${title} ${item?.activityCategory || ""} ${materials} ${description} ${steps}`;
    const elevatedRisk = /infant|toddler|chok|small part|bead|pom.?pom|button|taste|food|eat|cut|scissor|knife|hot|allergen|mouth|coin|marble|glitter|paint|glue/i.test(riskHay);
    const safetyOk = meaningfulText(safetyNotes, 4, { title });
    const safetyCritical = !safetyOk && elevatedRisk;
    const unrunnable = !meaningfulText(steps, 8, { title }) && !meaningfulText(description, 10, { title });
    const goldRequired = item?.coreRequired === true
      || item?.goldStandardRequired === true
      || item?.ownerCoreRequired === true
      || item?.requireCoreComplete === true;
    const tooThin = !complete && (
      missing.length >= 6
      || (Boolean(text(description)) && !meaningfulText(description, 12, { title }))
      || (Boolean(text(steps)) && !meaningfulText(steps, 8, { title }))
    );

    const warnings = missing.map((label) => `Core Activity: add meaningful ${label.toLowerCase()}.`);
    const blockers = [];
    if (safetyCritical) {
      blockers.push("Safety and supervision is missing or too thin for this age/activity risk.");
    }
    if (unrunnable) {
      blockers.push("Provider cannot run this activity — add meaningful “What children will do” and step-by-step directions.");
    }
    if (goldRequired && !complete) {
      blockers.push("Core Activity marked required by gold-standard validation.");
    }

    let statusLabel = "Complete";
    if (!complete) {
      if (safetyCritical) statusLabel = "Missing Safety Detail";
      else if (tooThin || unrunnable) statusLabel = "Too Thin";
      else statusLabel = "Needs Work";
    }

    return {
      complete,
      missing,
      statusLabel,
      warnings,
      blockers,
      tooThin,
      safetyCritical,
      unrunnable,
      goldRequired,
    };
  }

  function coreActivityMissing(item, plan) {
    return assessCoreActivity(item, plan).missing;
  }

  function coreActivityComplete(item, plan) {
    return assessCoreActivity(item, plan).complete;
  }

  function activityWarnings(item, plan) {
    const assessed = assessCoreActivity(item, plan);
    const warnings = assessed.warnings.slice();
    const req = imageRequirementForActivity(item);
    const hasSetup = Boolean(text(item?.setupImageUrl));
    const hasExample = Boolean(text(item?.exampleImageUrl || item?.imageUrl));
    if (req === "setup_needed" && !hasSetup) warnings.push("Add a setup image (or change image requirement).");
    if (req === "finished_example_needed" && !hasExample) warnings.push("Add a finished example image (or change image requirement).");
    if (req === "both_setup_and_finished" && (!hasSetup || !hasExample)) {
      warnings.push("Add both setup and finished example images (or change image requirement).");
    }
    return warnings;
  }

  function activityStatus(item, plan) {
    const warnings = activityWarnings(item, plan);
    const core = assessCoreActivity(item, plan);
    const approvals = state.ownerApprovals[`activity:${item._key}`];
    if (approvals === "approved" && !warnings.length && core.complete) return "Approved";
    if (!meaningfulText(item?.title, 1) && !meaningfulText(coreFieldValue(item, "steps"), 1)) return "Not Started";
    // Never mark Complete while Core Activity fields are thin/filler.
    if (!core.complete || warnings.length) return "Needs Work";
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
      bump(meaningfulText(plan.weeklyOverview, 8), "Weekly overview");
      bump(meaningfulText(plan.objectives, 6), "Weekly learning objectives");
      bump(meaningfulText(plan.weeklyMaterials, 6), "Weekly materials list");
    } else if (sectionId === "family") {
      bump(meaningfulText(plan.familyConnection, 5), "Family connection summary", true);
    } else if (sectionId === "week") {
      WEEKDAYS.forEach((dayId) => {
        const day = plan.dailyPlans?.[dayId] || emptyDay();
        bump(meaningfulText(day.theme || day.focus, 1), `${dayId}: daily focus`);
        bump(meaningfulText(day.objectives, 4), `${dayId}: daily objectives`, true);
        bump(meaningfulText(day.schedule, 3) || (day.transitions || []).length > 0, `${dayId}: schedule / flow`, true);
      });
    } else if (sectionId === "activities") {
      const items = flattenActivities(plan);
      bump(items.some((item) => meaningfulText(item?.title, 1)), "At least one named activity");
      const assessed = items.map((item) => ({ item, core: assessCoreActivity(item, plan) }));
      const incompleteCore = assessed.filter((row) => !row.core.complete);
      // Incomplete Core = owner review warnings by default (not lesson-level blockers).
      // Safety-critical / unrunnable Core gaps are promoted in evaluateQuality via assessCoreActivity.
      bump(incompleteCore.length === 0, "Every activity has a complete Core Activity section", true);
      items.forEach((item) => {
        activityWarnings(item, plan)
          .filter((warning) => !/^Core Activity:/i.test(warning))
          .forEach((warning) => warnings.push(`${item.title || "Activity"}: ${warning}`));
      });
    } else if (sectionId === "songs") {
      const songs = [...(plan.songs || [])];
      WEEKDAYS.forEach((day) => songs.push(...(plan.dailyPlans?.[day]?.songs || [])));
      bump(songs.length > 0, "At least one song");
      bump(songs.some(songComplete), "Song details with permitted lyrics/motions or verified source");
      songs.filter((song) => !songComplete(song)).forEach((song) => {
        warnings.push(`Song “${song.title || "Untitled"}” is missing lyrics/motions or source notes.`);
      });
      mediaImportConflictWarnings(plan, "songs").forEach((warning) => warnings.push(warning));
    } else if (sectionId === "books") {
      const books = [...(plan.books || [])];
      WEEKDAYS.forEach((day) => books.push(...(plan.dailyPlans?.[day]?.books || [])));
      bump(books.length > 0, "At least one book");
      bump(books.some(bookComplete), "Book with author + discussion prompts");
      mediaImportConflictWarnings(plan, "books").forEach((warning) => warnings.push(warning));
    } else if (sectionId === "printables") {
      const linked = linkedResources(plan);
      bump(linked.length > 0, "At least one linked printable/resource");
      const pending = linked.filter((row) => !/approved|published/i.test(text(row.status)));
      if (pending.length) warnings.push(`${pending.length} printable(s) still need owner approval or publish.`);
    } else if (sectionId === "images") {
      const acts = flattenActivities(plan);
      const needing = acts.filter((item) => {
        const req = imageRequirementForActivity(item);
        return ["setup_needed", "finished_example_needed", "both_setup_and_finished"].includes(req);
      });
      needing.forEach((item) => {
        activityWarnings(item).filter((warning) => /image/i.test(warning)).forEach((warning) => missing.push(`${item.title || "Activity"}: ${warning}`));
      });
      bump(needing.length === 0 || missing.length === 0, "Images for activities that need them (or mark No image needed / Optional)");
    } else if (sectionId === "toolkit") {
      const toolkit = plan.teachingKit?.teacherToolkit || {};
      bump(meaningfulText(toolkit.overview || toolkit.summary || plan.weeklyOverview, 4), "Teacher toolkit overview");
      bump(fieldFilled(toolkit.prepChecklist) || meaningfulText(toolkit.preparation, 4), "Prep checklist");
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
    const ownerNotes = [];
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
      info.warnings.slice(0, 6).forEach((warning, index) => {
        warnings.push({
          id: `warn:${section.id}:${index}`,
          sectionId: section.id,
          label: `${section.label}: ${warning}`,
          activityKey: "",
        });
      });
      if (state.ownerApprovals[`section:${section.id}`] === "rejected") {
        ownerNotes.push({
          id: `note:section:${section.id}`,
          sectionId: section.id,
          label: `${section.label}: owner requested changes`,
          activityKey: "",
        });
      }
    });
    flattenActivities(plan).forEach((item) => {
      const core = assessCoreActivity(item, plan);
      // Core gaps are warnings unless assessCoreActivity promotes a safety/unrunnable blocker.
      core.warnings.forEach((warning, index) => {
        warnings.push({
          id: `activity-core:${item._key}:${index}`,
          sectionId: "activities",
          label: `${item.title || "Activity"} (${item.dayOfWeek}): ${warning}`,
          activityKey: item._key,
        });
      });
      core.blockers.forEach((blocker, index) => {
        blockers.push({
          id: `activity-core-block:${item._key}:${index}`,
          sectionId: "activities",
          label: `${item.title || "Activity"} (${item.dayOfWeek}): ${blocker}`,
          activityKey: item._key,
        });
      });
      activityWarnings(item, plan)
        .filter((warning) => !/^Core Activity:/i.test(warning))
        .forEach((warning, index) => {
          warnings.push({
            id: `activity:${item._key}:${index}`,
            sectionId: /image/i.test(warning) ? "images" : "activities",
            label: `${item.title || "Activity"} (${item.dayOfWeek}): ${warning}`,
            activityKey: item._key,
          });
        });
      if (state.ownerApprovals[`activity:${item._key}`] === "rejected") {
        ownerNotes.push({
          id: `note:activity:${item._key}`,
          sectionId: "activities",
          label: `${item.title || "Activity"}: owner requested changes`,
          activityKey: item._key,
        });
      }
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
    return { blockers, warnings, ownerNotes };
  }

  function ownerSummaryStatus(progress) {
    if (progress.publishReady) return "Ready for Owner Review";
    if (progress.blockerCount > 0) return "Blocked";
    if (progress.warningCount > 0) return "Needs Review";
    return "Draft";
  }

  function overallProgress(plan) {
    const rows = SECTION_DEFS.filter((row) => row.id !== "publish").map((row) => computeSectionStatus(row.id, plan));
    const required = rows.reduce((sum, row) => sum + row.required, 0);
    const complete = rows.reduce((sum, row) => sum + row.complete, 0);
    const percent = required ? Math.round((complete / required) * 100) : 0;
    const report = evaluateQuality(plan);
    const incompleteSections = rows.filter((row) => row.status === "Not Started" || row.status === "Needs Work").length;
    const approvedSections = rows.filter((row) => row.status === "Approved").length;
    const publishReady = report.blockers.length === 0 && incompleteSections === 0;
    return {
      percent,
      required,
      complete,
      blockerCount: report.blockers.length,
      warningCount: report.warnings.length,
      ownerNoteCount: (report.ownerNotes || []).length,
      incompleteSections,
      approvedSections,
      publishReady,
      draftStatus: text(plan.status || "draft"),
      summaryStatus: ownerSummaryStatus({
        publishReady,
        blockerCount: report.blockers.length,
        warningCount: report.warnings.length,
      }),
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
    refreshSaveIndicator();
  }

  function adminToken() {
    return (typeof adminSession === "function" ? adminSession()?.token : "") || "";
  }

  function saveStateLabel() {
    if (state.saving) return "Saving…";
    if (state.dirty) return "Needs saving";
    if (state.lastSavedAt) return "Saved";
    return "Saved";
  }

  function refreshSaveIndicator() {
    if (!state.open) return;
    const el = document.querySelector("[data-lre-save-indicator]");
    if (el) el.textContent = saveStateLabel();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
  }

  function validatePhotoFile(file) {
    if (!file) return { ok: false, error: "Choose an image file." };
    if (file.size > PHOTO_MAX_BYTES) return { ok: false, error: "Image must be 5 MB or smaller." };
    const type = String(file.type || "").toLowerCase();
    if (!PHOTO_ACCEPT.split(",").some((part) => type === part.trim())) {
      return { ok: false, error: "Use JPEG, PNG, WebP, or GIF." };
    }
    return { ok: true };
  }

  async function uploadCoverPhoto(file) {
    const token = adminToken();
    if (!token) throw new Error("Admin session required.");
    const compress = typeof global.compressLessonCoverFileForUpload === "function"
      ? global.compressLessonCoverFileForUpload
      : readFileAsDataUrl;
    const fileData = await compress(file);
    const response = await fetch("/api/admin/curriculum/lesson-covers/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fileName: file.name || "lesson-cover", fileData }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || "Cover upload failed.");
    return data.url;
  }

  async function uploadActivityPhoto(activityKey, field, file) {
    const check = validatePhotoFile(file);
    if (!check.ok) throw new Error(check.error);
    const token = adminToken();
    if (!token) throw new Error("Admin session required.");
    const item = findActivity(activityKey);
    if (!item) throw new Error("Activity not found.");
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch("/api/admin/curriculum/enrichment-photos/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        adminToken: token,
        lessonPlanId: state.planId,
        activityKey,
        field,
        fileName: file.name || "activity-photo",
        fileData: dataUrl,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Photo upload failed.");
    const assetId = text(json.mediaAssetId || "");
    const persistedFull = assetId
      ? `/api/media/enrichment-photos/${encodeURIComponent(assetId)}?variant=full`
      : text(json.mediaUrl || "");
    const persistedThumb = assetId
      ? `/api/media/enrichment-photos/${encodeURIComponent(assetId)}?variant=thumb`
      : text(json.thumbUrl || json.mediaUrl || "");
    const path = `dailyPlans.${item.dayOfWeek}.items.${item._index}`;
    setField(`${path}.${field}`, persistedFull);
    if (field === "setupImageUrl") setField(`${path}.setupImageThumbUrl`, persistedThumb);
    if (field === "exampleImageUrl") setField(`${path}.exampleImageThumbUrl`, persistedThumb);
    return persistedFull;
  }

  function renderCoverImageBlock() {
    const plan = state.draft;
    const title = plan.title || "Lesson";
    const url = text(plan.coverImageUrl);
    return `
      <section class="llh-lre-cover-block" data-lre-cover-block aria-labelledby="lre-cover-heading">
        <h3 id="lre-cover-heading">Cover image · ${esc(title)}</h3>
        <p class="muted-copy">This control updates the cover for this lesson only.</p>
        ${url
          ? `<figure class="llh-lre-figure"><img class="llh-lre-cover" src="${esc(url)}" alt="Cover for ${esc(title)}" data-lre-cover-preview /></figure>`
          : `<div class="llh-lre-image llh-lre-image--empty" data-lre-cover-empty>Add picture</div>`}
        <div class="form-actions llh-lre-image-actions">
          <label class="primary-button llh-lre-upload-btn">${url ? "Update picture" : "Add picture"}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-lre-cover-upload />
          </label>
          ${url ? `<button type="button" class="ghost-button" data-lre-cover-preview-btn>Preview</button>` : ""}
          ${url ? `<button type="button" class="ghost-button" data-lre-cover-remove>Remove image</button>` : ""}
        </div>
        ${input("Cover image URL (optional paste)", "coverImageUrl", plan.coverImageUrl || "", "/images/lesson-covers/...")}
      </section>
    `;
  }

  function renderActivityPhotoControl(item, field, label) {
    const url = field === "exampleImageUrl"
      ? text(item.exampleImageUrl || item.imageUrl)
      : text(item.setupImageUrl);
    const activityLabel = `${item.title || "Activity"} · ${item.dayOfWeek} · ${label}`;
    return `
      <div class="llh-lre-photo-slot" data-lre-photo-slot data-lre-photo-field="${esc(field)}" data-lre-photo-activity="${esc(item._key)}">
        <p class="llh-lre-label">${esc(activityLabel)}</p>
        ${url
          ? `<figure class="llh-lre-figure"><img class="llh-lre-image" src="${esc(url)}" alt="${esc(label)} for ${esc(item.title || "activity")}" /></figure>`
          : `<div class="llh-lre-image llh-lre-image--empty">Add picture</div>`}
        <div class="form-actions llh-lre-image-actions">
          <label class="ghost-button llh-lre-upload-btn">${url ? "Update picture" : "Add picture"}
            <input type="file" accept="${PHOTO_ACCEPT}" hidden data-lre-activity-upload data-lre-upload-field="${esc(field)}" data-lre-upload-activity="${esc(item._key)}" />
          </label>
          ${url ? `<button type="button" class="ghost-button" data-lre-activity-preview data-lre-preview-field="${esc(field)}" data-lre-preview-activity="${esc(item._key)}">Preview</button>` : ""}
          ${url ? `<button type="button" class="ghost-button" data-lre-activity-remove-photo data-lre-remove-field="${esc(field)}" data-lre-remove-activity="${esc(item._key)}">Remove image</button>` : ""}
        </div>
      </div>
    `;
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
    const core = assessCoreActivity(item);
    const coreClass = core.complete
      ? "is-complete"
      : (core.safetyCritical ? "is-safety" : (core.tooThin || core.unrunnable ? "is-thin" : "is-incomplete"));
    const domain = item.activityCategory || item.learningDomain || item.domain || "Activity";
    return `
      <button type="button" class="llh-lre-activity-card ${state.openActivityKey === item._key ? "is-open" : ""}" data-lre-open-activity="${esc(item._key)}">
        <strong>${esc(item.title || "Untitled activity")}</strong>
        <span>${esc(item.dayOfWeek || "")}</span>
        <span>${esc(domain)}</span>
        ${statusBadge(status)}
        <span class="llh-lre-core-flag ${coreClass}" data-lre-core-status="${esc(core.statusLabel)}">Core: ${esc(core.statusLabel)}</span>
        <span>Images: ${esc(imageRequirementLabel(req))}</span>
        <span>${warnings.length} warning${warnings.length === 1 ? "" : "s"}</span>
      </button>
    `;
  }

  function renderOpenActivity(item) {
    if (!item) return "";
    const day = item.dayOfWeek;
    const index = item._index;
    const base = `dailyPlans.${day}.items.${index}`;
    const core = assessCoreActivity(item);
    const coreMissing = core.missing;
    const req = imageRequirementForActivity(item);
    const teacherTips = Array.isArray(item.teacherTips) ? item.teacherTips.join("\n") : (item.teacherTips || "");
    const observationPrompts = Array.isArray(item.observationPrompts)
      ? item.observationPrompts.join("\n")
      : (item.observationPrompts || "");
    const substitutions = Array.isArray(item.substitutions)
      ? item.substitutions.map((row) => (typeof row === "string" ? row : `${row?.need || ""} → ${row?.use || ""}`)).join("\n")
      : (item.supplySubstitutions || item.substitutionsText || "");
    const settingTags = Array.isArray(item.settingTags) ? item.settingTags.join(", ") : (item.groupSetting || item.setting || "");
    return `
      <article class="llh-lre-activity-editor" data-lre-activity-editor="${esc(item._key)}">
        <div class="llh-lre-activity-editor-head">
          <div>
            <h3 data-lre-activity-title>Editing: ${esc(item.title || "Untitled activity")}</h3>
            <p class="muted-copy">${esc(day)} · ${esc(item.activityCategory || "Activity")} · Core: ${esc(core.statusLabel)} · Screenshot this activity to ask for help filling it.</p>
          </div>
          <button type="button" class="ghost-button" data-lre-close-activity>Close activity</button>
        </div>
        ${core.blockers.length ? `
          <div class="llh-lre-missing" data-lre-core-blockers>
            <strong>Blocking Core issues:</strong>
            <ul>${core.blockers.map((label) => `<li>${esc(label)}</li>`).join("")}</ul>
          </div>
        ` : ""}
        ${coreMissing.length ? `
          <div class="llh-lre-warnings" data-lre-core-missing>
            <strong>Core Activity review warnings:</strong>
            <ul>${coreMissing.map((label) => `<li>${esc(label)}</li>`).join("")}</ul>
            <p class="muted-copy">These count as review warnings unless they are safety-critical or the activity cannot be run.</p>
          </div>
        ` : `<p class="llh-lre-ok">Core Activity fields look complete for this activity.</p>`}

        <section class="llh-lre-sub llh-lre-core-section llh-lre-core-activity" data-lre-core-section>
          <h4>Core Activity</h4>
          <p class="muted-copy">Fill these first. One-line filler does not count as complete.</p>
          ${input("Activity name", `${base}.title`, item.title, "Apple Investigation")}
          ${input("Weekday", `${base}.dayOfWeek`, item.dayOfWeek || day, "monday")}
          ${input("Category / developmental domain", `${base}.activityCategory`, item.activityCategory || "", "STEM/Discovery")}
          ${CORE_ACTIVITY_FIELDS.map((field) => {
            const pathKey = field.key;
            const value = coreFieldValue(item, field.key);
            const rows = field.key === "description" || field.key === "steps"
              ? 6
              : (field.key === "ageModifications" || field.key === "durationMinutes" ? 2 : 3);
            return `
              <label class="llh-lre-field llh-lre-core-field" data-lre-core-field="${esc(field.key)}">
                <span class="llh-lre-label">${esc(field.label)}</span>
                <span class="llh-lre-example">Example: ${esc(field.example)}</span>
                <textarea data-lre-path="${esc(base)}.${esc(pathKey)}" rows="${rows}">${esc(value)}</textarea>
              </label>
            `;
          }).join("")}
        </section>

        <section class="llh-lre-sub llh-lre-activity-enrichment" data-lre-enrichment-section>
          <h4>Enrichment</h4>
          <p class="muted-copy">Optional depth after Core Activity is solid. Keep tips short and classroom-ready.</p>
          ${textarea("Group and setting", `${base}.groupSetting`, settingTags, "small group, indoor")}
          ${textarea("Teacher tips", `${base}.teacherTips`, teacherTips, "Stay at the table and narrate gently. End before anyone bites.")}
          ${textarea("Teacher role", `${base}.teacherRole`, item.teacherRole || "", "Stay within arm's reach. Model gentle touch and follow each child's comfort level.")}
          ${textarea("Supply substitutions", `${base}.substitutionsText`, substitutions, "No view-finders → use empty paper-towel tubes\nNo placemats → use trays")}
          ${textarea("Observation prompts", `${base}.observationPrompts`, observationPrompts, "Does the child try a new sensory word without prompting?")}
          ${textarea("Vocabulary", `${base}.vocabulary`, item.vocabulary || "", "apple, stem, skin, cool, bumpy")}
          ${textarea("Support adaptations", `${base}.supportAdaptations`, item.supportAdaptations || item.adaptations || "", "Offer hand-over-hand exploring for children who need motor support.")}
          ${textarea("Challenge adaptations", `${base}.challengeAdaptations`, item.challengeAdaptations || item.extensions || "", "Invite children to sort apples by color after looking.")}
        </section>

        <section class="llh-lre-sub" data-lre-images-section>
          <h4>Images</h4>
          <label class="llh-lre-field">
            <span class="llh-lre-label">Image requirement</span>
            <select data-lre-path="${esc(base)}.imageRequirement">
              ${IMAGE_REQUIREMENT_OPTIONS.map((opt) => `<option value="${esc(opt.id)}" ${req === opt.id ? "selected" : ""}>${esc(opt.label)}</option>`).join("")}
            </select>
          </label>
          <p class="muted-copy">Circle time, songs, movement, and obvious activities can be No image needed. Art, unclear finished products, printable/card work, and unusual setups usually need pictures.</p>
          ${renderActivityPhotoControl(item, "setupImageUrl", "Setup photo")}
          ${renderActivityPhotoControl(item, "exampleImageUrl", "Finished example photo")}
          ${textarea("Setup image brief", `${base}.imageBriefSetup`, item.imageBriefSetup || "", "Low table with three whole apples on placemats; damp cloth nearby; no tasting props.")}
          ${textarea("Finished example image brief", `${base}.imageBriefExample`, item.imageBriefExample || "", "Child-led stamp sheet with imperfect apple prints — not an adult craft model.")}
        </section>
      </article>
    `;
  }

  function renderWeekPlan() {
    return `
      <p class="muted-copy">Edit the week rhythm here. Open the Activities section to change individual activity directions.</p>
      ${WEEKDAYS.map((dayId) => {
        const day = state.draft.dailyPlans[dayId] || emptyDay();
        const base = `dailyPlans.${dayId}`;
        const count = Array.isArray(day.items) ? day.items.length : 0;
        const dayLabel = dayId.charAt(0).toUpperCase() + dayId.slice(1);
        return `
          <details class="llh-lre-day-collapse" data-lre-week-day="${esc(dayId)}" open>
            <summary><strong>${esc(dayLabel)}</strong> · ${count} activit${count === 1 ? "y" : "ies"}</summary>
            <div class="llh-lre-day-collapse-body">
              ${input("Daily focus", `${base}.theme`, day.theme || day.focus || "", "Faces & Feelings")}
              ${textarea("Daily objectives", `${base}.objectives`, day.objectives || "", "Children practice naming feelings during play.")}
              ${textarea("Schedule / flow", `${base}.schedule`, day.schedule || "", "Arrival → circle song → small groups → outdoor → closing")}
              ${textarea("Day-specific materials", `${base}.materials`, day.materials || "", "Feeling cards for today’s small group — not the full weekly list")}
            </div>
          </details>
        `;
      }).join("")}
    `;
  }

  function renderActivitiesSection() {
    const items = flattenActivities(state.draft);
    const open = items.find((item) => item._key === state.openActivityKey) || null;
    const coreCompleteCount = items.filter((item) => coreActivityComplete(item)).length;
    return `
      <div class="llh-lre-activity-list">
        <p class="muted-copy">Open one activity at a time. Fill the <strong>Core Activity</strong> fields first — then enrichment. Screenshot mode hides sidebar clutter so you can ask for help on that exact activity.</p>
        <p class="muted-copy">Core complete: ${coreCompleteCount} / ${items.length}</p>
        <div class="llh-lre-activity-cards">${items.map(renderActivityCard).join("") || "<p class='muted-copy'>No activities in this draft yet.</p>"}</div>
        ${open ? renderOpenActivity(open) : ""}
      </div>
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
      ${renderMediaImportRetentionPanel("books")}
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
      ${renderMediaImportRetentionPanel("songs")}
      <button type="button" class="ghost-button" data-lre-add-song>+ Add song</button>
    `;
  }

  function renderPrintableIdeaEditor(idea, index) {
    const enrich = global.LLHTeachingKitEnrichment;
    const item = enrich && typeof enrich.normalizePrintableIdea === "function"
      ? enrich.normalizePrintableIdea(idea)
      : (idea && typeof idea === "object" ? idea : (typeof idea === "string" ? { title: idea } : null));
    if (!item) return "";
    const base = `enrichmentDraft.week.printableIdeas.${index}`;
    const titleVal = item.title || item.name || item.label || "";
    const bodyVal = item.body || "";
    const descriptionVal = item.description || item.purpose || item.summary || bodyVal || "";
    const instructionsVal = item.instructions || item.howTo || item.directions || "";
    const typeVal = item.type || item.kind || item.format || "";
    const notesVal = item.notes || "";
    if (!titleVal && !descriptionVal && !instructionsVal && !typeVal && !notesVal) return "";
    return `
      <article class="llh-lre-card-block llh-lre-printable-idea" data-lre-printable-idea="${esc(String(index))}">
        <h3>Printable idea ${index + 1}</h3>
        <p class="muted-copy">Text-only ideas from paste import — not uploaded PDFs.</p>
        ${input("Title", `${base}.title`, titleVal, "Pumpkin sponge-painting page")}
        ${textarea("Description / purpose", `${base}.body`, bodyVal || descriptionVal, "One sponge per child; orange paint only.")}
        ${textarea("Instructions", `${base}.instructions`, instructionsVal, "Print letter-size; trim with adult scissors only.")}
        ${typeVal || notesVal ? `${input("Type", `${base}.type`, typeVal, "Art page")}
        ${textarea("Notes", `${base}.notes`, notesVal, "Optional classroom notes.")}` : ""}
      </article>
    `;
  }

  function renderPrintablesSection() {
    const linked = linkedResources(state.draft);
    const ideaList = Array.isArray(state.draft?.enrichmentDraft?.week?.printableIdeas)
      ? state.draft.enrichmentDraft.week.printableIdeas
      : [];
    const ideaCards = ideaList.map((idea, index) => renderPrintableIdeaEditor(idea, index)).filter(Boolean).join("");
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
    const lessonTitle = state.draft.title || "Lesson";
    return `
      <p class="muted-copy">Images stay draft-only until owner publish. Each upload is tied to this lesson and one activity slot.</p>
      ${renderCoverImageBlock()}
      <div class="llh-lre-image-grid">
        ${acts.map((item) => {
          const req = imageRequirementForActivity(item);
          const base = `dailyPlans.${item.dayOfWeek}.items.${item._index}`;
          return `
            <article class="llh-lre-card-block">
              <h3>${esc(item.title || "Activity")}</h3>
              <p class="muted-copy">${esc(lessonTitle)} · ${esc(item.dayOfWeek)} · ${esc(item.activityCategory || "Activity")} · ${esc(imageRequirementLabel(req))}</p>
              <label class="llh-lre-field">
                <span class="llh-lre-label">Image requirement</span>
                <select data-lre-path="${esc(base)}.imageRequirement">
                  ${IMAGE_REQUIREMENT_OPTIONS.map((opt) => `<option value="${esc(opt.id)}" ${req === opt.id ? "selected" : ""}>${esc(opt.label)}</option>`).join("")}
                </select>
              </label>
              ${renderActivityPhotoControl(item, "setupImageUrl", "Setup photo")}
              ${renderActivityPhotoControl(item, "exampleImageUrl", "Finished example photo")}
              <div class="form-actions">
                <button type="button" class="ghost-button" data-lre-approve-image="${esc(item._key)}">Approve</button>
                <button type="button" class="ghost-button" data-lre-reject-image="${esc(item._key)}">Request Changes</button>
                <button type="button" class="ghost-button" data-lre-clear-image="${esc(item._key)}">Remove both images</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderQualitySection() {
    const report = evaluateQuality(state.draft);
    const jumpList = (rows, emptyHtml) => `
      <ul class="llh-lre-blocker-list">
        ${(rows || []).map((row) => `
          <li><button type="button" class="llh-lre-blocker-link" data-lre-jump-section="${esc(row.sectionId)}" data-lre-jump-activity="${esc(row.activityKey || "")}">${esc(row.label)}</button></li>
        `).join("") || emptyHtml}
      </ul>
    `;
    return `
      <p class="muted-copy">Core Activity gaps are review warnings by default. Only safety-critical, unrunnable, or gold-standard-required Core issues become blockers.</p>
      <h3>Blocking issues (${report.blockers.length})</h3>
      ${jumpList(report.blockers, "<li class='llh-lre-ok'>No hard blockers right now.</li>")}
      <h3>Review warnings (${report.warnings.length})</h3>
      ${jumpList(report.warnings, "<li class='muted-copy'>No review warnings.</li>")}
      <h3>Owner notes needed (${(report.ownerNotes || []).length})</h3>
      ${jumpList(report.ownerNotes, "<li class='muted-copy'>No owner change requests yet.</li>")}
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
      ok: activityWarnings(item).every((warning) => !/image/i.test(warning)),
    }));
    const ownerStatus = progress.summaryStatus || ownerSummaryStatus(progress);
    return `
      <div class="llh-lre-publish-grid">
        <article class="llh-lre-card-block">
          <h3>Owner status</h3>
          <p>${esc(ownerStatus)}</p>
          <h3>Sections complete</h3>
          <p>${sections.filter((row) => row.status === "Complete" || row.status === "Approved").length} / ${sections.length}</p>
          <h3>Sections approved</h3>
          <p>${progress.approvedSections} / ${sections.length}</p>
          <h3>Blocking issues</h3>
          <p>${progress.blockerCount}</p>
          <h3>Review warnings</h3>
          <p>${progress.warningCount || 0}</p>
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
        <p class="muted-copy">ADMIN PREVIEW — NOT LIVE TO CUSTOMERS. Viewport: ${esc(state.previewViewport)}.</p>
        <div data-lre-preview-host></div>
      </div>
      <div class="llh-lre-publish-confirm">
        <p><strong>Status: ${esc(ownerStatus)}</strong> — a lesson cannot be Ready for Owner Review while any blocker remains. Publish never runs automatically.</p>
        <label class="llh-lre-field">Type an owner confirmation to publish
          <input data-lre-publish-confirm placeholder="PUBLISH LESSON" value="${esc(state.publishConfirm)}" />
        </label>
        <button type="button" class="primary-button" data-lre-publish ${progress.publishReady && state.publishConfirm === "PUBLISH LESSON" ? "" : "disabled"}>Publish lesson</button>
        <p class="muted-copy">Publishing is deliberate and never automatic. Prefer Save Draft while reviewing. Draft Review Publish still requires Approve + typed <code>PUBLISH TEACHING KIT</code>.</p>
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
        ${renderCoverImageBlock()}
        ${textarea(
          "Cover Image Instructions",
          "enrichmentDraft.week.coverImageInstructions",
          plan.enrichmentDraft?.week?.coverImageInstructions || "",
          "Realistic photo of a caregiver and infant doing a calm sensory activity. No masks on infants.",
        )}
        ${textarea("Weekly overview", "weeklyOverview", plan.weeklyOverview, "This week children explore names, feelings, and what makes each friend unique.")}
        ${textarea("Learning objectives", "objectives", plan.objectives, "Children will name one feeling and one thing that makes them unique.")}
        ${textarea("Weekly vocabulary", "vocabularyWords", plan.vocabularyWords, "unique, feelings, family, friends")}
        ${textarea("Weekly materials", "weeklyMaterials", plan.weeklyMaterials, "Mirrors, name cards, multicultural crayons, family photo frames")}
        ${textarea("Adaptations", "adaptations", plan.adaptations, "Offer photo supports for dual-language learners.")}
      `;
    }
    if (sectionId === "family") {
      return `
        ${textarea("Family connection", "familyConnection", plan.familyConnection, "Ask your child which feeling they practiced and draw it together.")}
        <p class="muted-copy">Optional. Day-level family notes remain on each day in Weekly plan and Activities.</p>
      `;
    }
    if (sectionId === "week") return renderWeekPlan();
    if (sectionId === "activities") return renderActivitiesSection();
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

  function renderQuickNav() {
    return `
      <nav class="llh-lre-quick-nav" aria-label="Jump to lesson section">
        ${QUICK_NAV.map((row) => `
          <button type="button" class="ghost-button llh-lre-quick-nav-btn ${state.sectionId === row.id ? "is-active" : ""}" data-lre-quick-nav="${esc(row.id)}">${esc(row.label)}</button>
        `).join("")}
      </nav>
    `;
  }

  function renderHeader(progress) {
    const statusTag = /^(published|featured)$/i.test(String(state.draft.status || "")) ? "Published" : "Draft";
    return `
      <header class="llh-lre-header" data-lre-sticky-header>
        <div class="llh-lre-header-main">
          <div>
            <p class="llh-lre-kicker">Lesson editor · Owner</p>
            <h1>${esc(state.draft.title || "Untitled lesson")}</h1>
            <p class="muted-copy" data-lre-summary-status>
              <span class="tag">${esc(statusTag)}</span>
              ${esc(state.draft.age || "Age")} · ${esc(state.draft.theme || "Theme")}
              · <span data-lre-save-indicator class="llh-lre-save-indicator">${esc(saveStateLabel())}</span>
              · Progress ${progress.percent}% (${progress.complete}/${progress.required} required)
            </p>
          </div>
          <div class="llh-lre-header-actions">
            <button type="button" class="ghost-button" data-lre-preview-lesson>Preview lesson</button>
            <button type="button" class="primary-button" data-lre-save-draft ${state.saving ? "disabled" : ""}>Save</button>
            <button type="button" class="ghost-button" data-lre-back>${state.returnToQueue ? "Back to Draft Review" : "Back to Lesson Plans"}</button>
            <button type="button" class="ghost-button" data-lre-screenshot-toggle>${state.screenshotMode ? "Exit Screenshot mode" : "Screenshot mode"}</button>
          </div>
        </div>
        ${renderQuickNav()}
        ${state.statusText ? `<p class="form-message ${state.isSuccess ? "success" : "error"}" role="status">${esc(state.statusText)}</p>` : ""}
      </header>
    `;
  }

  function renderCustomerPreviewOverlay() {
    if (!state.customerPreviewOpen) return "";
    return `
      <div class="llh-lre-preview-overlay" role="dialog" aria-modal="true" aria-labelledby="lre-preview-title" data-lre-preview-overlay>
        <div class="llh-lre-preview-panel">
          <header class="llh-lre-preview-panel-head">
            <div>
              <p class="llh-lre-kicker" id="lre-preview-title">Preview only — not published</p>
              <p class="muted-copy">Read-only customer-style layout. Saving and publishing are disabled here.</p>
            </div>
            <button type="button" class="primary-button" data-lre-preview-back>Back to editing</button>
          </header>
          <div class="llh-lre-preview-body" data-lre-customer-preview-host tabindex="0"></div>
        </div>
      </div>
    `;
  }

  function renderImageLightbox() {
    if (!state.imagePreviewUrl) return "";
    return `
      <div class="llh-lre-lightbox" data-lre-image-lightbox role="dialog" aria-label="Image preview">
        <button type="button" class="ghost-button" data-lre-lightbox-close>Close preview</button>
        <img src="${esc(state.imagePreviewUrl)}" alt="Image preview" />
      </div>
    `;
  }

  function renderMobileStickyBar() {
    return `
      <div class="llh-lre-mobile-bar" data-lre-mobile-bar aria-label="Lesson actions">
        <button type="button" class="ghost-button" data-lre-preview-lesson>Preview</button>
        <button type="button" class="primary-button" data-lre-save-draft ${state.saving ? "disabled" : ""}>Save</button>
        <label class="ghost-button llh-lre-upload-btn">Photo
          <input type="file" accept="${PHOTO_ACCEPT}" hidden data-lre-mobile-photo />
        </label>
      </div>
    `;
  }

  async function paintCustomerPreview() {
    const hostEl = document.querySelector("[data-lre-customer-preview-host]");
    if (!hostEl || !state.customerPreviewOpen) return;
    hostEl.innerHTML = `<p class="muted-copy">Loading preview…</p>`;
    try {
      const enrich = global.LLHTeachingKitEnrichment;
      const viewer = global.LLHTeachingKitViewer;
      const workspace = global.LLHTeachingKitOwnerWorkspace;
      if (!enrich?.buildTeachingKitPreviewModel || !viewer?.enhanceLessonWorkspace) {
        hostEl.innerHTML = `<p class="muted-copy">Preview requires Teaching Kit scripts. Use Preview as User from Admin if needed.</p>`;
        return;
      }
      const plan = ensurePlanShape(clone(state.draft));
      const activities = flattenActivities(plan);
      const resources = typeof curriculumResourcesForAdmin === "function" ? curriculumResourcesForAdmin() : [];
      const linked = linkedResources(plan);
      const resourceRows = linked.length ? linked : resources.filter((r) => (plan.resourceIds || []).includes(r.id));
      const sanitized = workspace?.sanitizePublicPreviewPlan ? workspace.sanitizePublicPreviewPlan(plan) : plan;
      const model = enrich.buildTeachingKitPreviewModel(
        sanitized,
        activities,
        resourceRows,
        plan.enrichmentDraft || null,
        { preview: true, ownerPreview: true },
        enrich.mapActivityToOwnerEditorModel,
      );
      hostEl.innerHTML = `<div class="llh-teaching-kit-workspace" data-lre-preview-workspace></div>`;
      const mount = hostEl.querySelector("[data-lre-preview-workspace]");
      await viewer.enhanceLessonWorkspace({
        host: mount,
        resource: model.resource,
        lessonPlan: model.lessonPlan,
        mode: "preview",
        readOnly: true,
      });
    } catch (error) {
      hostEl.innerHTML = `<p class="form-message" role="alert">${esc(error.message || "Preview failed.")}</p>`;
    }
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
      <div class="llh-lre ${state.screenshotMode ? "is-screenshot-mode" : ""} ${state.openActivityKey ? "has-open-activity" : ""}" data-lesson-review-editor data-lre-lesson-title="${esc(state.draft.title || "")}">
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
        ${renderMobileStickyBar()}
        ${renderCustomerPreviewOverlay()}
        ${renderImageLightbox()}
      </div>
    `;
    document.body.classList.toggle("llh-lre-open", true);
    document.body.classList.toggle("llh-lre-screenshot", state.screenshotMode);
    if (state.screenshotMode) {
      document.querySelector(".llh-meta-cookie-dismiss, [data-cookie-dismiss], #llhMetaCookieNotice button")?.click?.();
    }
    if (section.id === "publish") mountPreview();
    if (state.customerPreviewOpen) {
      requestAnimationFrame(() => { void paintCustomerPreview(); });
    }
  }

  function bindBeforeUnload() {
    if (state.beforeUnloadBound) return;
    state.beforeUnloadBound = true;
    window.addEventListener("beforeunload", onBeforeUnload);
  }

  function unbindBeforeUnload() {
    if (!state.beforeUnloadBound) return;
    state.beforeUnloadBound = false;
    window.removeEventListener("beforeunload", onBeforeUnload);
  }

  function onBeforeUnload(event) {
    if (!state.open || !state.dirty || state.saving) return;
    event.preventDefault();
    event.returnValue = "";
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
    next.enrichmentDraft = buildEnrichmentDraftFromPlan(next);
    return next;
  }

  function normalizeMediaListTitle(value) {
    return text(value).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function mediaRecordFieldText(record, field, aliases = []) {
    if (!record || typeof record !== "object") return "";
    const keys = [field, ...aliases];
    for (let i = 0; i < keys.length; i += 1) {
      const val = text(record[keys[i]]);
      if (val) return val;
    }
    return "";
  }

  function mediaFieldValuesEquivalent(a, b) {
    const left = text(a);
    const right = text(b);
    if (!left || !right) return left === right;
    if (left === right) return true;
    return normalizeMediaListTitle(left) === normalizeMediaListTitle(right);
  }

  function ensureMediaImportRetention(week) {
    if (!week.mediaImportRetention || typeof week.mediaImportRetention !== "object") {
      week.mediaImportRetention = { books: {}, songs: {} };
    }
    if (!week.mediaImportRetention.books || typeof week.mediaImportRetention.books !== "object") {
      week.mediaImportRetention.books = {};
    }
    if (!week.mediaImportRetention.songs || typeof week.mediaImportRetention.songs !== "object") {
      week.mediaImportRetention.songs = {};
    }
    return week.mediaImportRetention;
  }

  const BOOK_MERGE_FIELDS = Object.freeze([
    { field: "author", aliases: ["by"] },
    { field: "discussionPrompts", aliases: ["discussion", "questions"] },
    { field: "notes", aliases: [] },
    { field: "whyThisBook", aliases: [] },
  ]);

  const SONG_MERGE_FIELDS = Object.freeze([
    { field: "lyrics", aliases: [] },
    { field: "source", aliases: ["rights"] },
    { field: "motions", aliases: ["actions", "teachingDirections", "directions"] },
    { field: "notes", aliases: [] },
  ]);

  function mergeMediaRecordFields(canonRow, weekRow, fieldDefs) {
    const merged = clone(canonRow);
    const conflicts = [];
    fieldDefs.forEach(({ field, aliases }) => {
      const canonVal = mediaRecordFieldText(merged, field, aliases);
      const weekVal = mediaRecordFieldText(weekRow, field, aliases);
      if (!weekVal) return;
      if (!canonVal) {
        merged[field] = weekVal;
        return;
      }
      if (!mediaFieldValuesEquivalent(canonVal, weekVal)) {
        conflicts.push({ field, canonical: canonVal, week: weekVal });
      }
    });
    return { merged, conflicts };
  }

  function findMediaIndexByTitle(list, titleKey) {
    if (!titleKey || !Array.isArray(list)) return -1;
    return list.findIndex((row) => normalizeMediaListTitle(row?.title) === titleKey);
  }

  /** Merge enrichment week lists into canonical plan fields without overwriting owner edits (title-key dedupe). */
  function mergeWeekMediaListIntoPlan(canonical, weekList, options = {}) {
    const kind = options.kind === "songs" ? "songs" : "books";
    const fieldDefs = kind === "songs" ? SONG_MERGE_FIELDS : BOOK_MERGE_FIELDS;
    const enrichmentWeek = options.enrichmentWeek && typeof options.enrichmentWeek === "object"
      ? options.enrichmentWeek
      : null;
    const retention = enrichmentWeek ? ensureMediaImportRetention(enrichmentWeek)[kind] : null;

    const canon = Array.isArray(canonical) ? clone(canonical) : [];
    const week = Array.isArray(weekList) ? weekList : [];
    if (!week.length) return canon;

    const seen = new Set(
      canon.map((row) => normalizeMediaListTitle(row?.title)).filter(Boolean),
    );

    week.forEach((row) => {
      if (!row || typeof row !== "object") return;
      const key = normalizeMediaListTitle(row.title);
      if (!key) return;

      const existingIndex = findMediaIndexByTitle(canon, key);
      if (existingIndex >= 0) {
        const { merged, conflicts } = mergeMediaRecordFields(canon[existingIndex], row, fieldDefs);
        canon[existingIndex] = merged;
        if (retention) {
          if (conflicts.length) {
            retention[key] = {
              title: text(canon[existingIndex].title) || text(row.title) || key,
              snapshot: clone(row),
              conflicts,
            };
          } else {
            delete retention[key];
          }
        }
        return;
      }

      if (seen.has(key)) return;
      seen.add(key);
      canon.push(clone(row));
    });

    return canon;
  }

  function mediaImportConflictWarnings(plan, kind) {
    const bucket = plan?.enrichmentDraft?.week?.mediaImportRetention?.[kind];
    if (!bucket || typeof bucket !== "object") return [];
    return Object.entries(bucket).map(([, row]) => {
      const title = text(row?.title || row?.snapshot?.title || "Untitled");
      const fields = (row?.conflicts || []).map((c) => c.field).filter(Boolean);
      const fieldLabel = fields.length ? fields.join(", ") : "metadata";
      return `Import review: “${title}” still has paste-import ${fieldLabel} that differs from the saved record. Compare the import details shown below and update the fields above if needed.`;
    });
  }

  function reconcileMediaImportRetention(plan) {
    const week = plan?.enrichmentDraft?.week;
    if (!week?.mediaImportRetention) return;
    ["books", "songs"].forEach((kind) => {
      const fieldDefs = kind === "songs" ? SONG_MERGE_FIELDS : BOOK_MERGE_FIELDS;
      const list = kind === "songs" ? (plan.songs || []) : (plan.books || []);
      const bucket = week.mediaImportRetention[kind];
      if (!bucket || typeof bucket !== "object") return;
      Object.keys(bucket).forEach((key) => {
        const entry = bucket[key];
        const canonRow = list.find((row) => normalizeMediaListTitle(row?.title) === key);
        const snapshot = entry?.snapshot;
        if (!canonRow || !snapshot) {
          delete bucket[key];
          return;
        }
        const { conflicts } = mergeMediaRecordFields(canonRow, snapshot, fieldDefs);
        if (!conflicts.length) delete bucket[key];
        else entry.conflicts = conflicts;
      });
    });
  }

  function renderMediaImportRetentionPanel(kind) {
    const bucket = state.draft?.enrichmentDraft?.week?.mediaImportRetention?.[kind];
    if (!bucket || typeof bucket !== "object") return "";
    const rows = Object.values(bucket).filter((row) => row && row.snapshot);
    if (!rows.length) return "";
    const label = kind === "songs" ? "song" : "book";
    return `
      <div class="llh-lre-warnings" data-lre-media-import-retention="${esc(kind)}">
        <strong>Paste import ${label} details to review</strong>
        <p class="muted-copy">These values came from the import draft and differ from the saved ${label} fields above. Nothing here was applied automatically. Edit the fields above or keep your saved version.</p>
        ${rows.map((row) => {
          const title = esc(row.title || row.snapshot?.title || "Untitled");
          const conflictLines = (row.conflicts || []).map((c) => (
            `<li><strong>${esc(c.field)}</strong> (import): ${esc(String(c.week || "").slice(0, 240))}</li>`
          )).join("");
          return `
            <article class="llh-lre-card-block">
              <h4>${title}</h4>
              ${conflictLines ? `<ul>${conflictLines}</ul>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  /** Owner Edit open: surface week kit fields in LRE without replacing dailyPlans / activity bodies. */
  function hydrateOwnerEditWeekFields(plan) {
    const next = ensurePlanShape(plan);
    const enrichmentDraft = next.enrichmentDraft && typeof next.enrichmentDraft === "object"
      ? next.enrichmentDraft
      : null;
    if (!enrichmentDraft?.week || typeof enrichmentDraft.week !== "object") return next;
    const week = enrichmentDraft.week;
    ensureMediaImportRetention(week);
    next.books = mergeWeekMediaListIntoPlan(next.books, week.books, { kind: "books", enrichmentWeek: week });
    next.songs = mergeWeekMediaListIntoPlan(next.songs, week.songs, { kind: "songs", enrichmentWeek: week });
    return next;
  }

  function hydratePlanFromEnrichmentDraft(plan, enrichmentDraft) {
    const next = ensurePlanShape(plan);
    const draft = clone(enrichmentDraft) || {};
    next.enrichmentDraft = draft;
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    if (week.proposedDailyPlans && typeof week.proposedDailyPlans === "object") {
      next.dailyPlans = ensurePlanShape({ dailyPlans: week.proposedDailyPlans }).dailyPlans;
    }
    if (meaningfulText(week.weeklyOverview, 1)) next.weeklyOverview = week.weeklyOverview;
    if (meaningfulText(week.objectives, 1)) next.objectives = week.objectives;
    if (meaningfulText(week.weeklyMaterials, 1)) next.weeklyMaterials = week.weeklyMaterials;
    if (meaningfulText(week.vocabularyWords || week.vocabulary, 1)) {
      next.vocabularyWords = week.vocabularyWords || (Array.isArray(week.vocabCards) ? week.vocabCards.join("\n") : week.vocabulary);
    }
    if (meaningfulText(week.familyConnection, 1)) next.familyConnection = week.familyConnection;
    if (meaningfulText(week.adaptations, 1)) next.adaptations = week.adaptations;
    if (Array.isArray(week.books) && week.books.length) {
      ensureMediaImportRetention(week);
      next.books = mergeWeekMediaListIntoPlan(next.books, week.books, { kind: "books", enrichmentWeek: week });
    }
    if (Array.isArray(week.songs) && week.songs.length) {
      ensureMediaImportRetention(week);
      next.songs = mergeWeekMediaListIntoPlan(next.songs, week.songs, { kind: "songs", enrichmentWeek: week });
    }
    if (week.teacherToolkit && typeof week.teacherToolkit === "object") {
      next.teachingKit = next.teachingKit || { schemaVersion: 1 };
      next.teachingKit.teacherToolkit = {
        ...(next.teachingKit.teacherToolkit || {}),
        ...clone(week.teacherToolkit),
      };
    }
    const overlays = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    WEEKDAYS.forEach((day) => {
      const items = next.dailyPlans[day].items || [];
      items.forEach((item, index) => {
        const keyCandidates = [
          text(item.sourceKey),
          text(item.itemId) ? `${next.id}:${item.itemId}` : "",
          text(item.itemId) ? `${next.id}:${day}:${item.itemId}` : "",
          activityKey(day, item, index),
        ].filter(Boolean);
        const overlay = keyCandidates.map((key) => overlays[key]).find((row) => row && typeof row === "object") || null;
        if (!overlay) return;
        [
          "title", "dayOfWeek", "activityCategory",
          "ageModifications", "recommendedAge", "durationMinutes", "duration", "estimatedDuration",
          "objective", "description", "materials", "preparation", "prep", "setup",
          "steps", "directions", "teacherLanguage", "observationOpportunities",
          "safetyNotes", "cleanupTips", "cleanup", "resetNotes",
          "teacherTips", "teacherRole", "observationPrompts", "vocabulary",
          "supportAdaptations", "challengeAdaptations", "adaptations", "extensions",
          "groupSetting", "settingTags", "substitutions", "substitutionsText",
          "exampleImageUrl", "setupImageUrl", "imageUrl", "imageRequirement",
          "imageBriefSetup", "imageBriefExample",
        ].forEach((field) => {
          if (overlay[field] != null && overlay[field] !== "") item[field] = clone(overlay[field]);
        });
        // Normalize equivalent age/duration aliases into the Open Review Core keys.
        if (!text(item.ageModifications)) {
          const ageAlias = text(overlay.ageModifications || overlay.recommendedAge || item.recommendedAge || item.ageBand);
          if (ageAlias) item.ageModifications = ageAlias;
        }
        if (item.durationMinutes == null || item.durationMinutes === "") {
          const durAlias = overlay.durationMinutes ?? overlay.duration ?? overlay.estimatedDuration ?? item.duration ?? item.estimatedDuration;
          if (durAlias != null && durAlias !== "") item.durationMinutes = durAlias;
        }
        if (overlay.imageRequirement) item.imageRequirement = normalizeImageRequirement(overlay.imageRequirement);
        if (overlay.noImageNeeded === true || normalizeImageRequirement(overlay.imageRequirement) === "no_image_needed") {
          item.noImageNeeded = true;
        }
      });
    });
    return next;
  }

  function buildEnrichmentDraftFromPlan(plan) {
    const existing = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? clone(plan.enrichmentDraft)
      : { activities: {}, week: {} };
    if (!existing.activities || typeof existing.activities !== "object") existing.activities = {};
    if (!existing.week || typeof existing.week !== "object") existing.week = {};
    existing.week.proposedDailyPlans = clone(plan.dailyPlans || {});
    existing.week.weeklyOverview = plan.weeklyOverview || existing.week.weeklyOverview || "";
    existing.week.objectives = plan.objectives || existing.week.objectives || "";
    existing.week.weeklyMaterials = plan.weeklyMaterials || existing.week.weeklyMaterials || "";
    existing.week.vocabularyWords = plan.vocabularyWords || existing.week.vocabularyWords || "";
    existing.week.familyConnection = plan.familyConnection || existing.week.familyConnection || "";
    existing.week.adaptations = plan.adaptations || existing.week.adaptations || "";
    reconcileMediaImportRetention(plan);
    existing.week.books = clone(plan.books || existing.week.books || []);
    existing.week.songs = clone(plan.songs || existing.week.songs || []);
    if (plan.enrichmentDraft?.week?.mediaImportRetention) {
      existing.week.mediaImportRetention = clone(plan.enrichmentDraft.week.mediaImportRetention);
    } else if (!existing.week.mediaImportRetention) {
      existing.week.mediaImportRetention = { books: {}, songs: {} };
    }
    existing.week.teacherToolkit = clone(plan.teachingKit?.teacherToolkit || existing.week.teacherToolkit || {});
    flattenActivities(plan).forEach((item) => {
      const key = text(item.sourceKey) || (text(item.itemId) ? `${plan.id}:${item.itemId}` : item._key);
      const prev = existing.activities[key] && typeof existing.activities[key] === "object"
        ? existing.activities[key]
        : {};
      const imageReq = normalizeImageRequirement(item.imageRequirement || imageRequirementForActivity(item));
      const ageModifications = text(coreFieldValue(item, "ageModifications") || prev.ageModifications || "");
      const durationRaw = coreFieldValue(item, "durationMinutes");
      const durationMinutes = durationRaw !== ""
        ? durationRaw
        : (prev.durationMinutes != null && prev.durationMinutes !== "" ? prev.durationMinutes : "");
      existing.activities[key] = {
        ...prev,
        title: item.title || prev.title || "",
        dayOfWeek: item.dayOfWeek || prev.dayOfWeek || "",
        activityCategory: item.activityCategory || prev.activityCategory || "",
        ageModifications,
        durationMinutes,
        objective: item.objective || "",
        description: item.description || "",
        materials: item.materials || "",
        preparation: item.preparation || item.prep || "",
        setup: item.setup || "",
        steps: item.steps || item.directions || "",
        teacherLanguage: item.teacherLanguage || "",
        observationOpportunities: item.observationOpportunities || "",
        safetyNotes: item.safetyNotes || "",
        cleanupTips: item.cleanupTips || item.cleanup || item.resetNotes || "",
        groupSetting: item.groupSetting || "",
        teacherTips: item.teacherTips || prev.teacherTips || "",
        teacherRole: item.teacherRole || prev.teacherRole || "",
        substitutionsText: item.substitutionsText || "",
        observationPrompts: item.observationPrompts || prev.observationPrompts || "",
        vocabulary: item.vocabulary || "",
        supportAdaptations: item.supportAdaptations || item.adaptations || "",
        challengeAdaptations: item.challengeAdaptations || item.extensions || "",
        adaptations: item.supportAdaptations || item.adaptations || "",
        extensions: item.challengeAdaptations || item.extensions || "",
        imageBriefSetup: item.imageBriefSetup || "",
        imageBriefExample: item.imageBriefExample || "",
        exampleImageUrl: item.exampleImageUrl || "",
        setupImageUrl: item.setupImageUrl || "",
        imageRequirement: imageReq,
        noImageNeeded: imageReq === "no_image_needed",
      };
    });
    existing.updatedAt = new Date().toISOString();
    const admin = typeof adminSession === "function" ? adminSession() : null;
    existing.lastEditedBy = String(admin?.email || existing.lastEditedBy || "owner").trim();
    return existing;
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

      // Draft Review Open Review: persist enrichment draft only — never rewrite published lesson body.
      if (state.ownerDraftReview === true && !state._forcePublish) {
        const enrichmentDraft = buildEnrichmentDraftFromPlan(lessonPlan);
        const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
          ? curriculumExpectedUpdatedAt()
          : "";
        const enrichResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            saveMode: "enrichment_draft",
            expectedUpdatedAt,
            lessonPlan: { id: lessonPlan.id, enrichmentDraft },
          }),
        });
        const enrichData = await enrichResponse.json().catch(() => ({}));
        if (!enrichResponse.ok) throw new Error(enrichData.error || `Draft save failed (${enrichResponse.status})`);
        if (enrichData.curriculum && typeof applyCurriculumState === "function") {
          applyCurriculumState(enrichData.curriculum, { siteContentUpdatedAt: enrichData.siteContentUpdatedAt });
        } else if (enrichData.siteContentUpdatedAt && typeof siteContentState !== "undefined" && siteContentState) {
          siteContentState.updatedAt = enrichData.siteContentUpdatedAt;
        }
        if (state.draftReviewId) {
          const queueExpected = typeof curriculumExpectedUpdatedAt === "function"
            ? curriculumExpectedUpdatedAt()
            : (enrichData.siteContentUpdatedAt || "");
          const queueRes = await fetch("/api/admin/curriculum/draft-review", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: "save-edited",
              id: state.draftReviewId,
              expectedUpdatedAt: queueExpected,
              enrichmentDraft,
            }),
          });
          const queueData = await queueRes.json().catch(() => ({}));
          if (!queueRes.ok) throw new Error(queueData.error || `Draft Review save failed (${queueRes.status})`);
          if (queueData.siteContentUpdatedAt && typeof siteContentState !== "undefined" && siteContentState) {
            siteContentState.updatedAt = queueData.siteContentUpdatedAt;
          }
        }
        state.draft = hydratePlanFromEnrichmentDraft(lessonPlan, enrichmentDraft);
        state.originalSnapshot = JSON.stringify(state.draft);
        state.dirty = false;
        state.lastSavedAt = new Date().toISOString();
        state.statusText = "Draft saved. Published lesson unchanged.";
        state.isSuccess = true;
        return true;
      }

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
      state.lastSavedAt = new Date().toISOString();
      state.statusText = "Draft saved. Nothing was published.";
      state.isSuccess = true;
      refreshSaveIndicator();
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
    let plan = ensurePlanShape(incoming);
    if (options.enrichmentDraft && typeof options.enrichmentDraft === "object") {
      plan = hydratePlanFromEnrichmentDraft(plan, options.enrichmentDraft);
    } else if (plan.enrichmentDraft && typeof plan.enrichmentDraft === "object" && options.ownerDraftReview === true) {
      plan = hydratePlanFromEnrichmentDraft(plan, plan.enrichmentDraft);
    } else if (plan.enrichmentDraft && typeof plan.enrichmentDraft === "object") {
      plan = hydrateOwnerEditWeekFields(plan);
    }
    // Map legacy section ids from older callers onto the simplified menu.
    const sectionAlias = {
      overview: "basics",
      objectives: "basics",
      materials: "basics",
      family: "family",
      monday: "week",
      tuesday: "week",
      wednesday: "week",
      thursday: "week",
      friday: "week",
      reusable: "activities",
      "preview & publish": "publish",
      preview: "publish",
    };
    const requestedSection = text(options.sectionId || "basics").toLowerCase();
    state.open = true;
    state.planId = plan.id || planId;
    state.draft = plan;
    state.originalSnapshot = JSON.stringify(plan);
    state.sectionId = sectionAlias[requestedSection] || requestedSection || "basics";
    if (!SECTION_DEFS.some((row) => row.id === state.sectionId)) state.sectionId = "basics";
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
    bindBeforeUnload();
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
    state.customerPreviewOpen = false;
    state.imagePreviewUrl = "";
    state.screenshotMode = false;
    unbindBeforeUnload();
    state.ownerDraftReview = false;
    state.returnToQueue = false;
    state.draftReviewId = "";
    document.body.classList.remove("llh-lre-open", "llh-lre-screenshot", "tk-editor-focused");
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
    } else if (!skipReturnNavigation && typeof global.restoreAdminLessonListAfterTkEditorClose === "function") {
      global.restoreAdminLessonListAfterTkEditorClose();
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
    if (t.closest("[data-lre-preview-lesson]")) {
      state.customerPreviewOpen = true;
      render();
      return;
    }
    if (t.closest("[data-lre-preview-back]")) {
      state.customerPreviewOpen = false;
      render();
      return;
    }
    if (t.closest("[data-lre-lightbox-close]")) {
      state.imagePreviewUrl = "";
      render();
      return;
    }
    const quickNav = t.closest("[data-lre-quick-nav]");
    if (quickNav) {
      state.sectionId = quickNav.getAttribute("data-lre-quick-nav") || "basics";
      state.openActivityKey = "";
      render();
      return;
    }
    if (t.closest("[data-lre-cover-remove]")) {
      setField("coverImageUrl", "");
      render();
      return;
    }
    if (t.closest("[data-lre-cover-preview-btn]")) {
      const url = text(state.draft.coverImageUrl);
      if (url) {
        state.imagePreviewUrl = url;
        render();
      }
      return;
    }
    const actPreview = t.closest("[data-lre-activity-preview]");
    if (actPreview) {
      const key = actPreview.getAttribute("data-lre-preview-activity");
      const field = actPreview.getAttribute("data-lre-preview-field");
      const item = findActivity(key);
      if (item) {
        const url = field === "exampleImageUrl" ? text(item.exampleImageUrl || item.imageUrl) : text(item.setupImageUrl);
        if (url) {
          state.imagePreviewUrl = url;
          render();
        }
      }
      return;
    }
    const actRemove = t.closest("[data-lre-activity-remove-photo]");
    if (actRemove) {
      const key = actRemove.getAttribute("data-lre-remove-activity");
      const field = actRemove.getAttribute("data-lre-remove-field");
      const item = findActivity(key);
      if (item) {
        const path = `dailyPlans.${item.dayOfWeek}.items.${item._index}`;
        setField(`${path}.${field}`, "");
        if (field === "setupImageUrl") setField(`${path}.setupImageThumbUrl`, "");
        if (field === "exampleImageUrl") setField(`${path}.exampleImageThumbUrl`, "");
      }
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
        const published = existing ? flattenActivities(ensurePlanShape(existing)) : [];
        const draftActs = flattenActivities(state.draft);
        const pubTitles = new Set(published.map((item) => text(item.title).toLowerCase()).filter(Boolean));
        const draftTitles = new Set(draftActs.map((item) => text(item.title).toLowerCase()).filter(Boolean));
        const added = draftActs.filter((item) => !pubTitles.has(text(item.title).toLowerCase()));
        const removed = published.filter((item) => !draftTitles.has(text(item.title).toLowerCase()));
        const list = (rows, empty) => rows.length
          ? `<ul>${rows.map((item) => `<li><strong>${esc(item.title || "Untitled")}</strong> · ${esc(item.dayOfWeek || "")}</li>`).join("")}</ul>`
          : `<p class="muted-copy">${esc(empty)}</p>`;
        hostEl.innerHTML = `
          <div class="llh-lre-compare-readable">
            <p><strong>Published status:</strong> ${esc(existing?.status || "unknown")}</p>
            <p><strong>Draft activities:</strong> ${draftActs.length} · <strong>Published activities:</strong> ${published.length}</p>
            <p><strong>Draft resources:</strong> ${(state.draft.resourceIds || []).length} · <strong>Published resources:</strong> ${(existing?.resourceIds || []).length}</p>
            <h4>Activities added in draft</h4>
            ${list(added, "None")}
            <h4>Activities removed vs published</h4>
            ${list(removed, "None")}
          </div>`;
      }
      return;
    }
    if (t.closest("[data-lre-publish]")) {
      await publishLesson();
    }
  }

  async function onChange(event) {
    if (!state.open) return;
    if (event.target.matches("[data-lre-cover-upload]")) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        state.statusText = "Uploading cover…";
        state.saving = true;
        render();
        const url = await uploadCoverPhoto(file);
        setField("coverImageUrl", url);
        state.statusText = "Cover updated. Save when ready.";
        state.isSuccess = true;
      } catch (error) {
        state.statusText = error.message || "Cover upload failed.";
        state.isSuccess = false;
      } finally {
        state.saving = false;
        render();
      }
      return;
    }
    const actUpload = event.target.matches("[data-lre-activity-upload]") ? event.target : null;
    if (actUpload) {
      const file = actUpload.files?.[0];
      const field = actUpload.getAttribute("data-lre-upload-field");
      const key = actUpload.getAttribute("data-lre-upload-activity");
      actUpload.value = "";
      if (!file || !field || !key) return;
      try {
        state.statusText = "Uploading photo…";
        state.saving = true;
        render();
        await uploadActivityPhoto(key, field, file);
        state.statusText = "Photo updated for this activity only. Save when ready.";
        state.isSuccess = true;
      } catch (error) {
        state.statusText = error.message || "Photo upload failed.";
        state.isSuccess = false;
      } finally {
        state.saving = false;
        render();
      }
      return;
    }
    if (event.target.matches("[data-lre-mobile-photo]")) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (state.openActivityKey) {
        try {
          await uploadActivityPhoto(state.openActivityKey, "setupImageUrl", file);
          state.statusText = "Photo added to open activity.";
          state.isSuccess = true;
        } catch (error) {
          state.statusText = error.message || "Upload failed.";
          state.isSuccess = false;
        }
      } else {
        state.statusText = "Open an activity first, or use Images section.";
        state.isSuccess = false;
      }
      render();
      return;
    }
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
    CORE_ACTIVITY_FIELDS,
    assessCoreActivity,
    hydrateOwnerEditWeekFields,
    mergeWeekMediaListIntoPlan,
    mediaImportConflictWarnings,
    reconcileMediaImportRetention,
    computeSectionStatus: (sectionId, plan) => computeSectionStatus(sectionId, plan || state.draft),
    evaluateQuality: (plan) => evaluateQuality(plan || state.draft),
    overallProgress: (plan) => overallProgress(plan || state.draft),
  };
})(typeof window !== "undefined" ? window : globalThis);
