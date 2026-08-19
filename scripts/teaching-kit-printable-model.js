/**
 * Shared normalized printable Teaching Kit view-model.
 * Display/print only — never mutates stored curriculum.
 * Completeness follows real stored companion/plan data (no fabrication).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitPrintableModel = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const DAY_LABELS = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  function presentApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPresent)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-present.js"); } catch (_e) { return null; } })()
      : null);
  }

  function materialsApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitMaterials)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-materials.js"); } catch (_e) { return null; } })()
      : null);
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function presentLabel(value, fallback) {
    const api = presentApi();
    return api?.presentLabel ? api.presentLabel(value, fallback) : (text(value) || text(fallback) || "");
  }

  function presentCopy(value, fallback) {
    const api = presentApi();
    if (api?.presentCopy) return api.presentCopy(value, fallback);
    return text(value) || text(fallback) || "";
  }

  function hasDisplayValue(value) {
    const api = presentApi();
    if (api?.hasDisplayValue) return api.hasDisplayValue(value);
    if (Array.isArray(value)) return value.some((item) => hasDisplayValue(item));
    return Boolean(text(value));
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function weekdayDayPlan(dailyPlans, day) {
    const source = dailyPlans && typeof dailyPlans === "object" && !Array.isArray(dailyPlans)
      ? dailyPlans
      : {};
    const raw = source[day];
    if (Array.isArray(raw)) return { items: raw };
    if (raw && typeof raw === "object") {
      if (Array.isArray(raw.items)) return raw;
      if (Array.isArray(raw.activities)) return { ...raw, items: raw.activities };
      return raw;
    }
    return {};
  }

  function asLines(value) {
    if (Array.isArray(value)) {
      return value.map((item) => presentCopy(typeof item === "string" ? item : item?.title || item?.label || item)).filter(Boolean);
    }
    const raw = presentCopy(value);
    if (!raw) return [];
    return raw.split(/\r?\n+/).map((line) => line.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  }

  function uniqueStrings(values, limit) {
    const mats = materialsApi();
    if (mats?.normalizeMaterialInventory) {
      const inventory = mats.normalizeMaterialInventory(asArray(values).map((value) => text(value)).filter(Boolean));
      const labels = (inventory.items || []).map((item) => item.label).filter(Boolean);
      return Number.isFinite(limit) ? labels.slice(0, limit) : labels;
    }
    const seen = new Set();
    const out = [];
    asArray(values).forEach((value) => {
      const item = text(value);
      if (!item) return;
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return Number.isFinite(limit) ? out.slice(0, limit) : out;
  }

  /** Stable print/selection key — never rely on array index or display order. */
  function stableResourceId(entry, kind, title) {
    const raw = entry && typeof entry === "object" ? entry : {};
    const explicit = text(
      raw.id
      || raw.songId
      || raw.bookId
      || raw.resourceId
      || raw.printableId
      || raw.itemId
      || raw.sourceKey,
    );
    if (explicit) return explicit;
    const slug = text(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72);
    return slug ? `${kind}:${slug}` : "";
  }

  function isImageUrl(url, mimeType) {
    const mime = text(mimeType).toLowerCase();
    if (/^image\//.test(mime)) return true;
    return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(text(url));
  }

  function normalizeActivity(activity) {
    const entry = activity && typeof activity === "object" ? activity : {};
    const materials = asArray(entry.materials).length
      ? asArray(entry.materials).map((item) => presentCopy(item)).filter(Boolean)
      : asLines(entry.materials || entry.materialsText);
    const materialsText = presentCopy(entry.materialsText) || materials.join(" · ");
    const estimatedMinutes = Number(entry.estimatedMinutes || entry.activityDurationMinutes || entry.setupMinutes) || 0;
    const title = presentCopy(entry.title) || "Activity";
    const id = stableResourceId(entry, "activity", title) || text(entry.id);
    const promptSource = asArray(entry.teacherPrompts).length
      ? asArray(entry.teacherPrompts)
      : asLines(entry.teacherLanguage || entry.teacherPromptsText).map((line) => ({ text: line }));
    return {
      id,
      title,
      category: presentLabel(entry.activityCategory || entry.category || entry.sectionId || "", ""),
      ageGroup: presentCopy(entry.ageGroup || entry.age || entry.ageBand || ""),
      dayOfWeek: text(entry.dayOfWeek).toLowerCase(),
      dayLabel: DAY_LABELS[text(entry.dayOfWeek).toLowerCase()] || "",
      objective: presentCopy(entry.learningObjective || entry.objective),
      description: presentCopy(entry.description || entry.purpose),
      materials,
      materialsText,
      setup: presentCopy(entry.setup || entry.preparation),
      steps: Array.isArray(entry.steps) || Array.isArray(entry.directions)
        ? asLines(entry.steps || entry.directions).join("\n")
        : presentCopy(entry.steps || entry.directions),
      teacherRole: presentCopy(entry.teacherRole || entry.teacherSupport),
      teacherPrompts: promptSource.map((prompt) => ({
        label: presentLabel(prompt?.label || "Prompt"),
        text: presentCopy(typeof prompt === "string" ? prompt : prompt?.text),
      })).filter((prompt) => prompt.text),
      learningGoals: asLines(entry.learningGoals),
      developmentalDomains: asLines(entry.developmentalDomains || entry.domains || entry.learningDomains).map((item) => presentLabel(item, item)),
      estimatedMinutes,
      groupSize: presentCopy(entry.groupSize),
      observationIdeas: asLines(entry.observationIdeas || entry.observationOpportunities),
      vocabulary: asLines(entry.vocabulary),
      extensions: presentCopy(entry.extensions || entry.extensionIdeas || entry.challenge),
      familyExtension: presentCopy(entry.familyConnection || entry.familyExtension),
      adaptations: presentCopy(entry.adaptations || entry.extraSupport || entry.mixedAgeAdaptations),
      ageModifications: presentCopy(entry.ageModifications || entry.mixedAgeAdaptations),
      safetyNotes: presentCopy(entry.safetyNotes),
      cleanupTips: asLines(entry.cleanupTips || entry.cleanup || entry.cleanupInstructions || entry.resetInstructions),
      relatedPrintableId: text(entry.relatedPrintableId || entry.printableId || entry.linkedPrintableId),
      relatedPrintableTitle: presentCopy(entry.relatedPrintableTitle || entry.printableTitle),
      examplePhotoUrl: text(entry.examplePhotoUrl || entry.exampleImageUrl),
      exampleAlt: presentCopy(entry.exampleAlt || entry.examplePhotoAlt),
      setupPhotoUrl: text(entry.setupPhotoUrl || entry.setupImageUrl),
      setupAlt: presentCopy(entry.setupAlt || entry.setupPhotoAlt),
    };
  }

  /** Concise instructional summary for daily pages (full card lives in Activities). */
  function activityDailySummary(activity) {
    if (!activity || !activity.title) return null;
    return {
      id: activity.id,
      title: activity.title,
      category: activity.category,
      description: activity.description || activity.objective || "",
      materials: (activity.materials || []).slice(0, 8),
      setup: activity.setup,
      steps: activity.steps,
      teacherPrompts: (activity.teacherPrompts || []).slice(0, 3),
      adaptations: activity.adaptations,
      observationIdeas: (activity.observationIdeas || []).slice(0, 3),
    };
  }

  function normalizeSong(song) {
    const entry = song && typeof song === "object" ? song : { title: song };
    const title = presentCopy(entry.title);
    if (!title) return null;
    const rights = presentApi()?.presentRightsStatus
      ? presentApi().presentRightsStatus(entry.rightsStatus || entry.rightsMode || entry.rights || "")
      : presentLabel(entry.rightsStatus || entry.rightsMode || entry.rights || "", "");
    const lyricsAllowed = entry.lyricsPrintable === true
      || entry.allowPrintLyrics === true
      || /public domain|traditional|original/i.test(rights)
      || /^(original|public[_-]?domain|traditional)$/i.test(text(entry.rightsStatus || entry.rightsMode));
    const linkedDay = text(entry.linkedWeekday || entry.dayOfWeek || entry.day).toLowerCase();
    const lyricsText = lyricsAllowed
      ? presentCopy(entry.lyrics || (String(entry.notes || "").match(/Lyrics:\s*([\s\S]+?)(?:\nMotions:|$)/i)?.[1]))
      : "";
    return {
      id: stableResourceId(entry, "song", title),
      title,
      category: presentLabel(entry.songCategory || entry.category || entry.type || "", ""),
      purpose: presentCopy(entry.purpose || entry.teachingPurpose || entry.concept || entry.whyThisSong),
      notes: presentCopy(entry.notes || entry.teachingNotes || entry.howToUse || entry.teacherDirections || entry.teachingTips),
      motions: presentCopy(entry.motions || entry.actions || entry.movementIdeas),
      props: presentCopy(entry.props || entry.materials),
      vocabulary: asLines(entry.vocabulary || entry.concepts || entry.vocabularyConnections),
      whenToUse: presentCopy(entry.whenToUse || entry.transition || entry.circleTimeUse || entry.bestTime),
      rights,
      lyrics: lyricsText,
      lyricsPrintable: Boolean(lyricsAllowed && lyricsText),
      relatedDay: DAY_LABELS[linkedDay] || "",
      relatedDayKey: WEEKDAYS.includes(linkedDay) ? linkedDay : "",
      relatedDays: [],
    };
  }

  function normalizeBook(book) {
    const entry = book && typeof book === "object" ? book : { title: book };
    const title = presentCopy(entry.title);
    if (!title) return null;
    const linkedDay = text(entry.suggestedWeekday || entry.dayOfWeek || entry.day).toLowerCase();
    const after = asLines(entry.afterReadingQuestions || entry.readAloudQuestions || entry.questions);
    return {
      id: stableResourceId(entry, "book", title),
      title,
      author: presentCopy(entry.author),
      whyThisBook: presentCopy(entry.whyThisBook || entry.whyItFits || entry.purpose || entry.concept || entry.notes),
      beforeReadingQuestions: asLines(entry.beforeReadingQuestions || entry.beforeQuestions || entry.beforeReading),
      duringReadingPrompts: asLines(entry.duringReadingPrompts || entry.duringQuestions || entry.whileReading || entry.duringReading),
      afterReadingQuestions: after,
      readAloudQuestions: after,
      vocabularyConnections: asLines(entry.vocabularyConnections || entry.vocabulary),
      extensionIdeas: asLines(entry.extensionIdeas || entry.extensions || entry.extensionIdea || entry.relatedActivity),
      teacherNotes: presentCopy(entry.teacherNotes),
      relatedDay: DAY_LABELS[linkedDay] || "",
      relatedDayKey: WEEKDAYS.includes(linkedDay) ? linkedDay : "",
      relatedDays: [],
      coverImageUrl: text(entry.coverImageUrl || entry.coverUrl),
      coverImageAlt: presentCopy(entry.coverImageAlt),
    };
  }

  function isPdfPrintableSource(entry, fileData, fileUrl, mimeType) {
    return Boolean(
      /^data:application\/pdf/i.test(fileData)
      || /^data:application\/pdf/i.test(fileUrl)
      || /application\/pdf/i.test(mimeType)
      || /\.pdf(\?|$)/i.test(fileUrl)
      || /\.pdf(\?|$)/i.test(text(entry.fileName)),
    );
  }

  function normalizePrintable(item) {
    const entry = item && typeof item === "object" ? item : {};
    const title = presentCopy(entry.title);
    if (!title) return null;
    const fileData = text(entry.fileData);
    const fileUrl = text(entry.fileUrl || entry.url || entry.downloadUrl || entry.mediaUrl || fileData);
    const coverUrl = text(
      entry.previewImageUrl
      || entry.previewUrl
      || entry.thumbnailUrl
      || entry.coverImageUrl,
    );
    const mimeType = text(entry.mimeType)
      || (/^data:application\/pdf/i.test(fileData) || /\.pdf(\?|$)/i.test(fileUrl) ? "application/pdf" : "");
    const hasPdfAttachment = Boolean(
      isPdfPrintableSource(entry, fileData, fileUrl, mimeType)
      && (fileData || fileUrl),
    );
    // Cover/preview images identify the printable; they must not replace a PDF print source.
    const previewUrl = coverUrl || (hasPdfAttachment ? "" : fileUrl);
    const embedAsImage = !hasPdfAttachment && (
      isImageUrl(previewUrl, mimeType) || isImageUrl(fileUrl, mimeType)
    );
    return {
      id: stableResourceId(entry, "printable", title) || text(entry.id),
      title,
      category: presentLabel(entry.resourceCategory || entry.category || "", "Printable"),
      fileName: text(entry.fileName),
      mimeType,
      pageCount: Number(entry.pageCount) || 0,
      description: presentCopy(entry.description || entry.summary),
      purpose: presentCopy(entry.purpose || entry.whyThisPrintable),
      suggestedUse: presentCopy(entry.suggestedUse || entry.howToUse || entry.useNotes),
      teacherNotes: presentCopy(entry.teacherNotes || entry.instructions),
      printingDirections: presentCopy(
        entry.printingDirections || entry.printingInstructions || entry.printNotes || entry.notes,
      ),
      previewUrl,
      fileUrl,
      fileData,
      relatedActivityId: text(entry.relatedActivityId || entry.activityId),
      usedInWeek: asArray(entry.usedInWeek).map((slot) => ({
        day: text(slot.day),
        dayLabel: presentCopy(slot.dayLabel) || DAY_LABELS[text(slot.day)] || presentLabel(slot.day, ""),
        moment: presentCopy(slot.moment),
      })),
      embedAsImage,
      hasPdfAttachment,
      // True only after merge pipeline successfully plans this attachment.
      hasEmbeddedPages: hasPdfAttachment,
    };
  }

  function resolveDayActivities(modelActivities, activityById) {
    return asArray(modelActivities).map((ref) => {
      if (!ref) return null;
      const id = text(typeof ref === "string" ? ref : ref.id);
      const full = (id && activityById.get(id)) || null;
      if (full) return full;
      const partial = typeof ref === "object" ? normalizeActivity(ref) : null;
      return partial && partial.title ? partial : null;
    }).filter(Boolean);
  }

  function dayFromCompanion(companion, day, plan, activityById) {
    const model = companion?.days?.[day] || {};
    const dayPlan = weekdayDayPlan(plan && plan.dailyPlans, day);
    const dayActivities = resolveDayActivities(model.activities, activityById);
    const materials = uniqueStrings([
      ...asLines(model.materials || dayPlan.materials),
      ...dayActivities.flatMap((activity) => activity.materials || []),
    ], 40);
    return {
      day,
      dayLabel: DAY_LABELS[day],
      focus: presentCopy(model.focus || dayPlan.theme || dayPlan.objectives || dayPlan.dailyTheme),
      objectives: presentCopy(dayPlan.objectives || dayPlan.dailyObjectives),
      // Circle Time must come from the circleTime field only — never transitions.
      circleTime: asLines(dayPlan.circleTime),
      invitationToPlay: presentCopy(dayPlan.invitationToPlay),
      sensory: presentCopy(dayPlan.sensory),
      fineMotor: presentCopy(dayPlan.fineMotor),
      grossMotor: presentCopy(dayPlan.grossMotor),
      outdoorPlay: presentCopy(dayPlan.outdoorPlay || model.outdoorPlay),
      art: presentCopy(dayPlan.art),
      stem: presentCopy(dayPlan.stem),
      smallGroup: presentCopy(dayPlan.smallGroup),
      schedule: asArray(model.schedule).map((slot) => ({
        time: text(slot.time),
        label: presentCopy(slot.label),
        kind: presentLabel(slot.kind || "", ""),
      })).filter((slot) => slot.label),
      activities: dayActivities,
      activitySummaries: dayActivities.map(activityDailySummary).filter(Boolean),
      activityTitles: dayActivities.map((item) => item.title).filter(Boolean),
      books: asArray(model.books).map(normalizeBook).filter(Boolean),
      songs: asArray(model.songs).map(normalizeSong).filter(Boolean),
      materials,
      transitions: asLines(model.transitions),
      observations: asLines(model.observations || dayPlan.observations || dayPlan.observationFocus),
      parentMessage: presentCopy(model.parentMessage || dayPlan.familyConnection),
      adaptations: presentCopy(dayPlan.adaptations),
      safetyNotes: presentCopy(dayPlan.safetyNotes),
      vocabulary: asLines(model.vocabulary || dayPlan.vocabulary),
      teacherNotes: presentCopy(dayPlan.teacherNotes || dayPlan.notes),
      teacherPrep: asLines(dayPlan.teacherPrep || dayPlan.prep),
    };
  }

  function buildOverview(plan, companion, activities) {
    const setup = companion?.mondayMorningSetup || {};
    const materialsModel = companion?.materialsModel || null;
    let masterMaterials = [];
    let masterMaterialsDetailed = [];
    if (materialsModel?.masterDetailed?.length) {
      masterMaterialsDetailed = materialsModel.masterDetailed.map((item) => ({
        label: presentCopy(item.label || item),
        category: presentLabel(item.category || item.group || item.materialCategory || "", ""),
      })).filter((item) => item.label);
      masterMaterials = masterMaterialsDetailed.map((item) => item.label);
    } else if (materialsModel?.master?.length) {
      masterMaterials = materialsModel.master.map((item) => presentCopy(item.label || item)).filter(Boolean);
    } else {
      const mats = materialsApi();
      if (mats?.buildMaterialsModel) {
        const built = mats.buildMaterialsModel(plan, activities || []);
        masterMaterialsDetailed = asArray(built.masterDetailed).map((item) => ({
          label: presentCopy(item.label || item),
          category: presentLabel(item.category || item.group || item.materialCategory || "", ""),
        })).filter((item) => item.label);
        masterMaterials = masterMaterialsDetailed.length
          ? masterMaterialsDetailed.map((item) => item.label)
          : (built.master || []).slice();
      } else {
        masterMaterials = asArray(setup.materials).map((item) => presentCopy(item.label || item)).filter(Boolean);
        asLines(plan?.weeklyMaterials).forEach((line) => masterMaterials.push(line));
        (activities || []).forEach((activity) => {
          (activity.materials || []).forEach((line) => masterMaterials.push(line));
        });
      }
    }
    // Entire Binder / Materials List must include every unique supply — never silently
    // truncate the master list (a prior hard cap of 80 dropped kit materials).
    masterMaterials = uniqueStrings(masterMaterials);
    if (!masterMaterialsDetailed.length) {
      masterMaterialsDetailed = masterMaterials.map((label) => ({ label, category: "" }));
    } else {
      // Keep detailed rows aligned with deduped labels (preserve first category).
      const seen = new Set();
      const allowed = new Set(masterMaterials.map((label) => text(label).toLowerCase()).filter(Boolean));
      masterMaterialsDetailed = masterMaterialsDetailed.filter((item) => {
        const key = text(item.label).toLowerCase();
        if (!key || seen.has(key) || !allowed.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    const weeklyFocus = presentCopy(
      plan?.weeklyFocus
      || plan?.weeklyOverview
      || plan?.focus
      || plan?.themeFocus
      || companion?.binder?.weeklyFocus,
    );

    return {
      description: presentCopy(plan?.description || plan?.summary || companion?.binder?.description),
      weeklyOverview: weeklyFocus,
      weeklyFocus,
      learningObjectives: asLines(plan?.objectives || plan?.weeklyObjectives || plan?.learningObjectives),
      learningDomains: asLines(plan?.learningDomains || plan?.developmentalDomains).map((item) => presentLabel(item, item)),
      vocabulary: asArray(companion?.vocabulary).map((word) => ({
        word: presentCopy(word.word || word),
        definition: presentCopy(word.definition),
        discussionIdea: presentCopy(word.discussionIdea),
      })).filter((word) => word.word),
      masterMaterials,
      masterMaterialsDetailed,
      teacherPrep: asArray(setup.prepTasks).map((task) => ({
        label: presentCopy(task.label),
        minutes: Number(task.minutes) || 0,
        detail: presentCopy(task.detail),
      })).filter((task) => task.label),
      estimatedPrepMinutes: Number(setup.estimatedPrepMinutes) || 0,
      safety: uniqueStrings([
        ...asLines(plan?.safetyNotes),
        ...asArray(setup.safetyNotes).map((item) => presentCopy(item)),
        ...WEEKDAYS.flatMap((day) => asLines(weekdayDayPlan(plan && plan.dailyPlans, day).safetyNotes)),
      ], 20),
      adaptations: presentCopy(plan?.adaptations || plan?.inclusionNotes),
      observationFocus: asLines(plan?.observationOpportunities || plan?.observationFocus),
      familyConnection: presentCopy(plan?.familyConnection || companion?.parentConnection?.readyToSendMessage),
    };
  }

  function buildToolkit(plan, companion, overview) {
    const setup = companion?.mondayMorningSetup || {};
    const toolkit = companion?.binder?.teacherToolkit || companion?.providerBinder?.teacherToolkit || {};
    return {
      mondayMorningSetup: {
        estimatedPrepMinutes: overview.estimatedPrepMinutes,
        materials: overview.masterMaterials,
        prepTasks: overview.teacherPrep,
        printChecklist: asArray(setup.printChecklist).map((item) => ({
          label: presentCopy(item.label),
          usedInWeek: asArray(item.usedInWeek).map((slot) => presentCopy(typeof slot === "string" ? slot : `${slot.dayLabel || slot.day || ""} · ${slot.moment || ""}`)).filter(Boolean),
        })).filter((item) => item.label),
        missingMaterials: asLines(setup.missingMaterials),
      },
      teachingTips: asLines(toolkit.teacherTips || toolkit.tips || plan?.teacherTips),
      cleanup: asLines(toolkit.cleanup || toolkit.cleanupTips),
      observationGuidance: asLines(toolkit.observationFocus || toolkit.observationPrompts || overview.observationFocus),
      adaptations: presentCopy(toolkit.adaptations || overview.adaptations),
      familyResources: presentCopy(toolkit.familyConnection || overview.familyConnection),
      notes: presentCopy(toolkit.notes || toolkit.teacherPreparation),
    };
  }

  function collectExampleImages(activities, printables) {
    const images = [];
    asArray(activities).forEach((activity) => {
      if (activity.examplePhotoUrl) {
        images.push({
          url: activity.examplePhotoUrl,
          alt: activity.exampleAlt || `Example for ${activity.title}`,
          caption: `${activity.title} · Finished example`,
          kind: "Finished Example",
          relatedActivityId: activity.id,
        });
      }
      if (activity.setupPhotoUrl) {
        images.push({
          url: activity.setupPhotoUrl,
          alt: activity.setupAlt || `Setup for ${activity.title}`,
          caption: `${activity.title} · Setup example`,
          kind: "Setup Example",
          relatedActivityId: activity.id,
        });
      }
    });
    asArray(printables).forEach((item) => {
      if (item.previewUrl && item.embedAsImage) {
        images.push({
          url: item.previewUrl,
          alt: item.title,
          caption: `${item.title} · Printable preview`,
          kind: "Printable Preview",
          relatedPrintableId: item.id,
        });
      }
    });
    return images;
  }

  function attachRelatedDays(items, days, pickFromDay) {
    const byTitle = new Map();
    asArray(items).forEach((item) => {
      if (!item?.title) return;
      byTitle.set(item.title.toLowerCase(), item);
      if (item.relatedDayKey && !item.relatedDays.includes(item.relatedDay)) {
        item.relatedDays.push(item.relatedDay);
      }
    });
    asArray(days).forEach((day) => {
      asArray(pickFromDay(day)).forEach((entry) => {
        const title = text(entry?.title || entry).toLowerCase();
        const match = byTitle.get(title);
        if (!match) return;
        if (!match.relatedDays.includes(day.dayLabel)) match.relatedDays.push(day.dayLabel);
        if (!match.relatedDay) {
          match.relatedDay = day.dayLabel;
          match.relatedDayKey = day.day;
        }
      });
    });
    return items;
  }

  /**
   * Validate normalized printable model before rendering.
   * Never invent content — only report gaps and broken optional assets.
   */
  function validatePrintableModel(model) {
    const warnings = [];
    const errors = [];
    if (!model || model.ok === false) {
      return { ok: false, errors: [model?.reason || "unavailable"], warnings: [] };
    }
    if (!text(model.title) || model.title === "Teaching Kit") warnings.push("missing_or_generic_title");
    if (!text(model.age)) warnings.push("missing_age");
    if (!text(model.coverImageUrl)) warnings.push("missing_cover");
    asArray(model.days).forEach((day) => {
      const hasContent = day.focus || day.activities?.length || day.circleTime?.length
        || day.books?.length || day.songs?.length || day.sensory || day.fineMotor
        || day.grossMotor || day.outdoorPlay || day.art || day.stem || day.smallGroup;
      if (!hasContent) warnings.push(`empty_day:${day.day}`);
    });
    asArray(model.activities).forEach((activity) => {
      if (!text(activity.title) || activity.title === "Activity") warnings.push(`activity_missing_title:${activity.id || "?"}`);
    });
    asArray(model.printables).forEach((item) => {
      if (!item.previewUrl && !item.fileUrl) warnings.push(`printable_no_file:${item.id || item.title}`);
    });
    return { ok: errors.length === 0, errors, warnings };
  }

  /**
   * Build normalized printable model from Teaching Kit payload (+ optional plan).
   * @param {object} kit Teaching Kit API payload (with companion)
   * @param {object} [plan] Optional curriculum plan for richer overview fields
   * @param {object} [options]
   */
  function buildPrintableTeachingKitModel(kit, plan, options = {}) {
    const companion = kit?.companion || null;
    if (!kit || kit.ok === false || kit.locked || !companion) {
      return {
        ok: false,
        reason: kit?.locked ? "locked" : "unavailable",
        capabilities: {},
        sections: [],
        validation: { ok: false, errors: ["unavailable"], warnings: [] },
      };
    }

    const sourcePlan = plan && typeof plan === "object" ? plan : {};
    const removed = options.removedActivityIds && typeof options.removedActivityIds === "object"
      ? options.removedActivityIds
      : {};
    const kitAge = presentCopy(sourcePlan.age || kit.age || "");

    const activities = asArray(companion.activities)
      .filter((item) => item && !removed[item.id] && text(item.status).toLowerCase() !== "archived")
      .map((item) => {
        const normalized = normalizeActivity(item);
        if (!normalized.ageGroup && kitAge) normalized.ageGroup = kitAge;
        return normalized;
      });
    const activityById = new Map(activities.map((item) => [item.id, item]));

    let songs = asArray(companion.songs).map(normalizeSong).filter(Boolean);
    let books = asArray(companion.books).map(normalizeBook).filter(Boolean);
    const printables = (() => {
      const rows = asArray(companion.printables).map(normalizePrintable).filter(Boolean);
      const seen = new Set();
      return rows.filter((item) => {
        const key = text(item.id) || text(item.fileUrl) || text(item.previewUrl) || text(item.title).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })();
    const days = WEEKDAYS.map((day) => dayFromCompanion(companion, day, sourcePlan, activityById));
    songs = attachRelatedDays(songs, days, (day) => day.songs);
    books = attachRelatedDays(books, days, (day) => day.books);
    const overview = buildOverview(sourcePlan, companion, activities);
    const toolkit = buildToolkit(sourcePlan, companion, overview);
    const examples = collectExampleImages(activities, printables);
    const duration = presentCopy(sourcePlan.duration || kit.duration || "");

    const capabilities = {
      overview: Boolean(
        overview.description
        || overview.weeklyOverview
        || overview.learningObjectives.length
        || overview.learningDomains.length
        || overview.vocabulary.length
        || overview.masterMaterials.length
        || overview.teacherPrep.length
        || overview.safety.length
        || overview.adaptations
        || overview.observationFocus.length
        || overview.familyConnection
      ),
      weekAtAGlance: days.some((day) => (
        day.focus || day.circleTime.length || day.activities.length || day.books.length || day.songs.length
        || day.sensory || day.fineMotor || day.grossMotor || day.outdoorPlay || day.art || day.stem || day.smallGroup
        || day.invitationToPlay
      )),
      dailyPlans: days.some((day) => (
        day.focus || day.schedule.length || day.activities.length || day.books.length || day.songs.length
        || day.materials.length || day.observations.length || day.parentMessage
        || day.invitationToPlay || day.sensory || day.fineMotor || day.grossMotor || day.outdoorPlay
        || day.art || day.stem || day.smallGroup
      )),
      activities: activities.length > 0,
      printables: printables.length > 0,
      songs: songs.length > 0,
      books: books.length > 0,
      examples: examples.length > 0,
      toolkit: Boolean(
        toolkit.mondayMorningSetup.materials.length
        || toolkit.mondayMorningSetup.prepTasks.length
        || toolkit.mondayMorningSetup.printChecklist.length
        || toolkit.teachingTips.length
        || toolkit.cleanup.length
        || toolkit.observationGuidance.length
        || toolkit.adaptations
        || toolkit.familyResources
        || toolkit.notes
      ),
      materials: overview.masterMaterials.length > 0,
      // Blank planning worksheets are available via Full Weekly / dedicated modes,
      // not as a phantom Entire Kit TOC entry.
      teacherNotes: false,
    };

    const sectionOrder = [
      { id: "cover", label: "Cover", available: true },
      { id: "toc", label: "Table of Contents", available: true },
      { id: "overview", label: "Overview", available: capabilities.overview },
      { id: "weekAtAGlance", label: "Weekly Plan", available: capabilities.weekAtAGlance },
      { id: "dailyPlans", label: "Daily Lesson Pages", available: capabilities.dailyPlans },
      { id: "activities", label: "Reusable Activities", available: capabilities.activities },
      { id: "songs", label: "Songs", available: capabilities.songs },
      { id: "books", label: "Books", available: capabilities.books },
      { id: "toolkit", label: "Teacher Toolkit", available: capabilities.toolkit },
      { id: "materials", label: "Materials", available: capabilities.materials },
      { id: "printables", label: "Printables", available: capabilities.printables },
      { id: "examples", label: "Example Images", available: capabilities.examples },
      { id: "teacherNotes", label: "Teacher Notes / Planning", available: capabilities.teacherNotes },
    ];

    const model = {
      ok: true,
      reason: "ok",
      schemaVersion: 1,
      lessonPlanId: text(kit.lessonPlanId || sourcePlan.id),
      title: presentCopy(kit.title || sourcePlan.title) || "Teaching Kit",
      age: presentCopy(kit.age || sourcePlan.age),
      ageRange: presentCopy(sourcePlan.ageRange || kit.ageRange || ""),
      theme: presentCopy(kit.theme || sourcePlan.theme),
      duration,
      description: overview.description,
      plan: text(kit.plan || sourcePlan.plan) === "Pro" ? "Pro" : "Free",
      coverImageUrl: text(kit.coverImageUrl || sourcePlan.coverImageUrl),
      coverImageAlt: presentCopy(kit.coverImageAlt || sourcePlan.coverImageAlt),
      completeness: text(kit.completeness) || "legacy_mapped",
      footerLabel: text(companion?.binder?.footerLabel) || `${presentCopy(kit.title) || "Teaching Kit"} · Little Learner Hub`,
      brand: "Little Learner Hub",
      packLabel: "Complete Teaching Kit",
      packSubtitle: "Teacher Binder",
      overview,
      days,
      activities,
      songs,
      books,
      printables,
      examples,
      toolkit,
      capabilities,
      sections: sectionOrder.filter((section) => section.available),
      source: {
        hasCompanion: true,
        activityCount: activities.length,
        printableCount: printables.length,
        songCount: songs.length,
        bookCount: books.length,
        imageCount: examples.length,
      },
    };
    model.validation = validatePrintableModel(model);
    return model;
  }

  return {
    WEEKDAYS,
    DAY_LABELS,
    stableResourceId,
    buildPrintableTeachingKitModel,
    validatePrintableModel,
    presentLabel,
    presentCopy,
    hasDisplayValue,
  };
});
