/**
 * Binder Builder — deterministic lesson → binder display helpers.
 *
 * Selects and organizes existing source fields for physical-binder presentation.
 * Does not rewrite educational content with AI. Does not mutate source lessons.
 * Does not surface giant materials / preparation lists.
 */
(function (root, factory) {
  const api = factory(
    root && root.LLHBinderBuilderModel
      ? root.LLHBinderBuilderModel
      : (typeof require === "function" ? require("./binder-builder-model.js") : null),
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHBinderBuilderTransform = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (model) {
  "use strict";

  if (!model) {
    throw new Error("LLHBinderBuilderModel is required.");
  }

  const {
    WEEKDAYS,
    WEEKDAY_LABELS,
    LEARNING_CENTER_KEYS,
    LEARNING_CENTER_LABELS,
    DEFAULT_DESCRIPTOR,
    DEFAULT_WELCOME_COPY,
    normalizeBinderDraft,
  } = model;

  function asText(value) {
    if (Array.isArray(value)) {
      return value.map((item) => asText(item)).filter(Boolean).join("\n");
    }
    if (value && typeof value === "object") {
      return asText(value.label || value.text || value.title || value.prompt || value.step || "");
    }
    return String(value == null ? "" : value).trim();
  }

  function firstMeaningful(...candidates) {
    for (let i = 0; i < candidates.length; i += 1) {
      const value = asText(candidates[i]);
      if (value) return value;
    }
    return "";
  }

  function pickOverrideOrSource(overrideValue, sourceValue, useSource) {
    const override = asText(overrideValue);
    if (override) return { text: override, origin: "override" };
    if (useSource === false) return { text: "", origin: "empty" };
    const source = asText(sourceValue);
    if (source) return { text: source, origin: "source" };
    return { text: "", origin: "empty" };
  }

  function findSourceActivity(lesson, dayKey, sourceItemId, title) {
    const dayPlan = lesson?.dailyPlans?.[dayKey] || {};
    const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
    if (sourceItemId) {
      const byId = items.find((item) => String(item.itemId || item.id || "") === String(sourceItemId));
      if (byId) return byId;
    }
    if (title) {
      const byTitle = items.find((item) => asText(item.title).toLowerCase() === title.toLowerCase());
      if (byTitle) return byTitle;
    }
    return null;
  }

  function activityIntroduction(item) {
    return firstMeaningful(item?.description, item?.purpose, item?.objective);
  }

  function activityWhatWereDoing(item) {
    return firstMeaningful(item?.description, item?.purpose);
  }

  function activityHowTo(item) {
    return firstMeaningful(
      item?.steps,
      item?.directions,
      item?.teacherRole,
      item?.teacherLanguage,
      item?.setup,
    );
  }

  function activityLearning(item) {
    return firstMeaningful(
      item?.learningGoals,
      item?.objective,
      item?.purpose,
      Array.isArray(item?.learningDomains) ? item.learningDomains.join(", ") : "",
    );
  }

  function activityQuestions(item) {
    return firstMeaningful(item?.teacherLanguage, item?.teacherTips);
  }

  function activitySupport(item) {
    return firstMeaningful(item?.extraSupport, item?.adaptations, item?.ageModifications, item?.mixedAgeAdaptations);
  }

  /**
   * Short activity-level materials only — never weeklyMaterials / shopping lists.
   * @param {object|null|undefined} item
   */
  function activityMaterials(item) {
    return firstMeaningful(
      item?.materials,
      item?.materialsNeeded,
      item?.whatYouNeed,
      item?.materialsList,
    );
  }

  function activityCategoryLabel(item) {
    return firstMeaningful(item?.activityCategory, item?.category, item?.type);
  }

  function activityChallenge(item) {
    return firstMeaningful(item?.extensions, item?.challengeExtension);
  }

  function activitySafety(item) {
    return firstMeaningful(item?.safetyNotes);
  }

  function activityCleanup(item) {
    return firstMeaningful(item?.cleanupTips, item?.cleanup, item?.resetNotes);
  }

  function activityImage(item) {
    const url = firstMeaningful(item?.exampleImageUrl, item?.setupImageUrl);
    if (!url) return { url: "", alt: "", source: "" };
    return {
      url,
      alt: firstMeaningful(item?.exampleImageAlt, item?.setupImageAlt, item?.title) || "Activity image",
      source: "lesson",
    };
  }

  /**
   * Day divider description from meaningful lesson fields — never a generic filler for every day.
   * @param {object} dayPlan
   * @param {string} dayKey
   */
  function dayDescriptionFromSource(dayPlan, dayKey) {
    const focus = firstMeaningful(dayPlan?.theme, dayPlan?.focus, dayPlan?.title);
    const fromItems = Array.isArray(dayPlan?.items)
      ? dayPlan.items.map((item) => asText(item.title)).filter(Boolean).slice(0, 3).join(", ")
      : "";
    const circle = firstMeaningful(dayPlan?.circleTime);
    const invite = firstMeaningful(dayPlan?.invitationToPlay);
    const sentence = firstMeaningful(
      dayPlan?.objectives,
      circle,
      invite,
      fromItems ? `Explore through ${fromItems}.` : "",
      focus ? `Focus on ${focus}.` : "",
    );
    return sentence;
  }

  function dayTitleFromSource(dayPlan) {
    const firstActivityTitle = Array.isArray(dayPlan?.items) && dayPlan.items[0]
      ? asText(dayPlan.items[0].title)
      : "";
    return firstMeaningful(dayPlan?.theme, dayPlan?.focus, dayPlan?.title, firstActivityTitle);
  }

  /**
   * Day-divider images must be true day-level assets only.
   * Never inherit the first activity image (Phase 1 print polish).
   * Owner may still set dayDraft.imageOverride explicitly.
   */
  function dayImageFromSource(_dayPlan) {
    return { url: "", alt: "", source: "" };
  }

  /**
   * Infer learning-center blurbs from day activity categories when Owner has not authored centers.
   * Returns only populated categories — never filler.
   * @param {object} lesson
   */
  function inferLearningCenters(lesson) {
    /** @type {Record<string, string[]>} */
    const buckets = {};
    LEARNING_CENTER_KEYS.forEach((key) => { buckets[key] = []; });

    const categoryMap = {
      Art: "art",
      "Sensory Play": "sensory",
      Sensory: "sensory",
      "Dramatic Play": "dramaticPlay",
      Literacy: "booksLiteracy",
      "Fine Motor": "fineMotor",
      "STEM/Discovery": "scienceNature",
      "Gross Motor": "grossMotor",
      "Outdoor Play": "outdoorPlay",
      "Music & Movement": "grossMotor",
      "Open-Ended Exploration": "manipulatives",
    };

    WEEKDAYS.forEach((day) => {
      const items = Array.isArray(lesson?.dailyPlans?.[day]?.items) ? lesson.dailyPlans[day].items : [];
      items.forEach((item) => {
        const key = categoryMap[asText(item.activityCategory)] || "";
        if (!key || !buckets[key]) return;
        const title = asText(item.title);
        if (title && !buckets[key].includes(title)) buckets[key].push(title);
      });
    });

    /** @type {Record<string, string>} */
    const result = {};
    LEARNING_CENTER_KEYS.forEach((key) => {
      if (buckets[key].length) {
        result[key] = buckets[key].slice(0, 4).join(" · ");
      }
    });
    return result;
  }

  /**
   * Resolve a binder draft against a live lesson into a print-ready document model.
   * @param {object} draftInput
   * @param {object|null|undefined} lesson
   * @param {{ qrSvgByUrl?: Record<string, string> }} [options]
   */
  function buildBinderDocument(draftInput, lesson, options = {}) {
    const draft = normalizeBinderDraft(draftInput);
    const plan = lesson && typeof lesson === "object" ? lesson : null;
    const qrSvgByUrl = options.qrSvgByUrl && typeof options.qrSvgByUrl === "object"
      ? options.qrSvgByUrl
      : {};

    const coverUrl = firstMeaningful(draft.coverImage?.url, plan?.coverImageUrl);
    const coverAlt = firstMeaningful(draft.coverImage?.alt, plan?.coverImageAlt, draft.title);

    const weekFocus = pickOverrideOrSource(
      draft.weekFocusOverride,
      firstMeaningful(plan?.weeklyOverview, plan?.theme),
      true,
    );
    const developmentalFocus = pickOverrideOrSource(
      draft.developmentalFocusOverride,
      firstMeaningful(plan?.objectives, Array.isArray(plan?.learningDomains) ? plan.learningDomains.join(", ") : ""),
      true,
    );

    const days = WEEKDAYS.map((dayKey) => {
      const dayDraft = draft.days[dayKey] || { dayKey, activities: [] };
      const dayPlan = plan?.dailyPlans?.[dayKey] || {};
      const titlePick = pickOverrideOrSource(dayDraft.titleOverride, dayTitleFromSource(dayPlan), true);
      const descriptionPick = pickOverrideOrSource(
        dayDraft.descriptionOverride,
        dayDescriptionFromSource(dayPlan, dayKey),
        true,
      );
      const imageOverride = dayDraft.imageOverride?.url ? dayDraft.imageOverride : null;
      const image = imageOverride || dayImageFromSource(dayPlan);

      const activities = (Array.isArray(dayDraft.activities) ? dayDraft.activities : [])
        .filter((act) => act && act.omit !== true)
        .map((act) => {
          const source = findSourceActivity(plan, dayKey, act.sourceItemId, act.title);
          const useSource = act.useSource !== false;
          const title = firstMeaningful(act.title, source?.title) || "Activity";
          const introduction = pickOverrideOrSource(act.introductionOverride, activityIntroduction(source), useSource);
          const whatWereDoing = pickOverrideOrSource(act.whatWereDoingOverride, activityWhatWereDoing(source), useSource);
          const howToDoIt = pickOverrideOrSource(act.howToDoItOverride, activityHowTo(source), useSource);
          const learning = pickOverrideOrSource(act.learningOverride, activityLearning(source), useSource);
          const questions = pickOverrideOrSource(act.questionsOverride, activityQuestions(source), useSource);
          const support = pickOverrideOrSource(act.supportOverride, activitySupport(source), useSource);
          const challenge = pickOverrideOrSource(act.challengeOverride, activityChallenge(source), useSource);
          const safety = pickOverrideOrSource(act.safetyOverride, activitySafety(source), useSource);
          const cleanup = pickOverrideOrSource(act.cleanupOverride, activityCleanup(source), useSource);
          const imagePick = act.imageOverride?.url
            ? act.imageOverride
            : (useSource ? activityImage(source) : { url: "", alt: "", source: "" });
          const materials = pickOverrideOrSource(act.materialsOverride, activityMaterials(source), useSource);
          const category = firstMeaningful(act.activityCategory, activityCategoryLabel(source));
          const included = asText(act.includedResources);
          return {
            id: act.id,
            sourceItemId: act.sourceItemId,
            title,
            category,
            introduction,
            whatWereDoing,
            howToDoIt,
            learning,
            materials,
            questions,
            support,
            challenge,
            safety,
            cleanup,
            includedResources: included,
            image: imagePick,
            hasAnyTeachingContent: Boolean(
              introduction.text
              || whatWereDoing.text
              || howToDoIt.text
              || learning.text
              || questions.text,
            ),
          };
        });

      return {
        dayKey,
        label: WEEKDAY_LABELS[dayKey],
        title: titlePick,
        description: descriptionPick,
        image,
        activities,
      };
    });

    const books = (Array.isArray(draft.books) ? draft.books : [])
      .filter((book) => book && book.omit !== true)
      .map((book) => {
        const source = Array.isArray(plan?.books) && book.sourceIndex >= 0
          ? plan.books[book.sourceIndex]
          : (Array.isArray(plan?.books) ? plan.books.find((b) => asText(b.title) === book.title) : null);
        const useSource = book.useSource !== false;
        const resourceUrl = firstMeaningful(book.resourceUrl, source?.resourceUrl, source?.externalUrl, source?.videoUrl);
        const connection = pickOverrideOrSource(
          book.connectionOverride,
          firstMeaningful(source?.whyThisBook, source?.notes),
          useSource,
        );
        const beforeReading = pickOverrideOrSource(
          book.beforeReadingOverride,
          firstMeaningful(source?.beforeReadingQuestions),
          useSource,
        );
        const afterReading = pickOverrideOrSource(
          book.afterReadingOverride,
          firstMeaningful(source?.afterReadingQuestions),
          useSource,
        );
        const questions = pickOverrideOrSource(
          book.questionsOverride,
          firstMeaningful(source?.duringReadingPrompts, source?.afterReadingQuestions),
          useSource,
        );
        const alternative = pickOverrideOrSource(
          book.alternativeBookOverride,
          firstMeaningful(source?.alternativeBooks),
          useSource,
        );
        const qrSvg = resourceUrl && book.qrEnabled !== false
          ? (qrSvgByUrl[resourceUrl] || qrSvgByUrl[asText(book.resourceUrl)] || "")
          : "";
        return {
          id: book.id,
          title: firstMeaningful(book.title, source?.title),
          author: firstMeaningful(book.author, source?.author),
          connection,
          beforeReading,
          afterReading,
          questions,
          alternative,
          resourceUrl,
          qrEnabled: book.qrEnabled !== false && Boolean(resourceUrl),
          qrSvg,
        };
      })
      .filter((book) => book.title);

    const songs = (Array.isArray(draft.songs) ? draft.songs : [])
      .filter((song) => song && song.omit !== true)
      .map((song) => {
        const source = Array.isArray(plan?.songs) && song.sourceIndex >= 0
          ? plan.songs[song.sourceIndex]
          : (Array.isArray(plan?.songs) ? plan.songs.find((s) => asText(s.title) === song.title) : null);
        const useSource = song.useSource !== false;
        const resourceUrl = firstMeaningful(
          song.resourceUrl,
          source?.audioUrl,
          source?.externalReference,
          source?.resourceUrl,
        );
        const whenToUse = pickOverrideOrSource(song.whenToUseOverride, source?.whenToUse, useSource);
        const movements = pickOverrideOrSource(song.movementsOverride, source?.motions, useSource);
        const directions = pickOverrideOrSource(
          song.directionsOverride,
          firstMeaningful(source?.teacherDirections, source?.notes),
          useSource,
        );
        const allowLyrics = song.allowPrintLyrics === true || source?.allowPrintLyrics === true;
        const lyrics = allowLyrics
          ? pickOverrideOrSource(song.lyricsOverride, source?.lyrics, useSource)
          : { text: "", origin: "empty" };
        const qrSvg = resourceUrl && song.qrEnabled !== false
          ? (qrSvgByUrl[resourceUrl] || qrSvgByUrl[asText(song.resourceUrl)] || "")
          : "";
        return {
          id: song.id,
          title: firstMeaningful(song.title, source?.title),
          whenToUse,
          movements,
          directions,
          lyrics,
          resourceUrl,
          qrEnabled: song.qrEnabled !== false && Boolean(resourceUrl),
          qrSvg,
        };
      })
      .filter((song) => song.title);

    const authoredCenters = draft.learningCenters || {};
    const inferred = inferLearningCenters(plan);
    const learningCenters = LEARNING_CENTER_KEYS
      .map((key) => {
        const text = firstMeaningful(authoredCenters[key], inferred[key]);
        if (!text) return null;
        return { key, label: LEARNING_CENTER_LABELS[key], text };
      })
      .filter(Boolean);

    const familyConnection = pickOverrideOrSource(
      draft.familyConnectionOverride,
      plan?.familyConnection,
      true,
    );

    const skills = pickOverrideOrSource(
      draft.skillsPracticedOverride,
      firstMeaningful(
        Array.isArray(plan?.learningDomains) ? plan.learningDomains.join(", ") : "",
        plan?.objectives,
      ),
      true,
    );

    const explored = pickOverrideOrSource(
      draft.endOfWeekOverride,
      firstMeaningful(plan?.weeklyOverview, plan?.theme, draft.title),
      true,
    );

    const noticed = pickOverrideOrSource(
      draft.noticedOverride,
      plan?.observationOpportunities,
      true,
    );

    return {
      draftId: draft.id,
      sourceLessonId: draft.sourceLessonId || plan?.id || "",
      title: firstMeaningful(draft.title, plan?.title) || "Lesson Binder",
      ageGroup: firstMeaningful(draft.ageGroup, plan?.age),
      theme: firstMeaningful(draft.theme, plan?.theme),
      coverDescriptor: firstMeaningful(draft.coverDescriptor) || DEFAULT_DESCRIPTOR,
      coverImage: {
        url: coverUrl,
        alt: coverAlt || "Lesson cover",
        hasImage: Boolean(coverUrl),
      },
      personalization: {
        teacherName: asText(draft.personalization?.teacherName),
        classroomName: asText(draft.personalization?.classroomName),
        programName: asText(draft.personalization?.programName),
        subtitle: asText(draft.personalization?.subtitle),
      },
      // Honor explicit blank binder welcome; only default when the field is missing.
      welcomeCopy: draft.welcomeCopy == null ? DEFAULT_WELCOME_COPY : asText(draft.welcomeCopy),
      weekFocus,
      developmentalFocus,
      sections: draft.sections,
      days,
      books,
      songs,
      learningCenters,
      familyConnection,
      endOfWeek: {
        explored,
        skills,
        noticed,
        notesAreaEnabled: draft.notesAreaEnabled !== false,
      },
      brandName: "Little Learner Hub",
    };
  }

  /**
   * Content pages only (no cover / TOC). Used by finalizePrintPagePlan.
   * Daily teaching pages stay required when dailyPlans is enabled (default true).
   * @param {object} document
   */
  function buildContentPagePlan(document) {
    const doc = document || {};
    const sections = doc.sections || {};
    /** @type {Array<{ type: string, dayKey?: string, label: string, activityId?: string, sourceItemId?: string }>} */
    const pages = [];

    if (sections.welcome !== false) {
      pages.push({ type: "welcome", label: "How to Use This Binder" });
    }
    if (sections.weekAtAGlance !== false) {
      pages.push({ type: "weekAtAGlance", label: "Week at a Glance" });
    }
    if (sections.weeklyGridCalendar !== false) {
      pages.push({ type: "weeklyGridCalendar", label: "Weekly Grid Calendar" });
    }

    WEEKDAYS.forEach((dayKey) => {
      const day = (doc.days || []).find((item) => item.dayKey === dayKey);
      if (sections.dailyDividers !== false) {
        pages.push({
          type: "dayDivider",
          dayKey,
          label: `${WEEKDAY_LABELS[dayKey]} Divider`,
        });
      }
      if (sections.dailyPlans !== false) {
        const activities = Array.isArray(day?.activities) ? day.activities : [];
        activities.forEach((activity) => {
          pages.push({
            type: "dayPlans",
            dayKey,
            activityId: activity.id,
            sourceItemId: asText(activity.sourceItemId),
            label: `${WEEKDAY_LABELS[dayKey]} · ${activity.title || "Activity"}`,
          });
        });
      }
    });

    if (sections.books !== false && Array.isArray(doc.books) && doc.books.length) {
      pages.push({ type: "books", label: "Story Time" });
    }
    if (sections.songs !== false && Array.isArray(doc.songs) && doc.songs.length) {
      pages.push({ type: "songs", label: "Music & Movement" });
    }
    if (sections.learningCenters === true && Array.isArray(doc.learningCenters) && doc.learningCenters.length) {
      pages.push({ type: "learningCenters", label: "Learning Centers" });
    }
    if (sections.familyConnection !== false && asText(doc.familyConnection?.text)) {
      pages.push({ type: "familyConnection", label: "Family Connection" });
    }
    if (sections.endOfWeek !== false) {
      pages.push({ type: "endOfWeek", label: "End of Week" });
    }

    return pages;
  }

  /**
   * Ordered page list for preview/print (excludes disabled optional sections).
   * Includes cover. Print HTML adds TOC via finalizePrintPagePlan.
   * @param {object} document
   */
  function buildPagePlan(document) {
    const pages = [{ type: "cover", label: "Front Cover" }, ...buildContentPagePlan(document)];
    pages.forEach((page, index) => {
      page.pageNumber = index + 1;
    });
    return pages;
  }

  return {
    asText,
    firstMeaningful,
    pickOverrideOrSource,
    buildBinderDocument,
    buildContentPagePlan,
    buildPagePlan,
    dayDescriptionFromSource,
    dayImageFromSource,
    dayTitleFromSource,
    activityHowTo,
    activityIntroduction,
    activityMaterials,
    inferLearningCenters,
  };
});
