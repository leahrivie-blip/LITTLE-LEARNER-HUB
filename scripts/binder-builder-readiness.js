/**
 * Binder Builder — readiness checks for print.
 *
 * Surfaces specific warnings. Does not block harmless optional omissions.
 * Strongly warns / blocks only when the binder would be clearly broken.
 */
(function (root, factory) {
  const api = factory(
    root && root.LLHBinderBuilderModel
      ? root.LLHBinderBuilderModel
      : (typeof require === "function" ? require("./binder-builder-model.js") : null),
    root && root.LLHBinderBuilderTransform
      ? root.LLHBinderBuilderTransform
      : (typeof require === "function" ? require("./binder-builder-transform.js") : null),
    root && root.LLHBinderBuilderQr
      ? root.LLHBinderBuilderQr
      : (typeof require === "function" ? require("./binder-builder-qr.js") : null),
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHBinderBuilderReadiness = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (model, transform, qr) {
  "use strict";

  if (!model || !transform || !qr) {
    throw new Error("Binder Builder readiness requires model, transform, and qr modules.");
  }

  const { WEEKDAYS, WEEKDAY_LABELS, normalizeBinderDraft } = model;
  const { buildBinderDocument, buildPagePlan, asText } = transform;
  const { validateBinderUrl } = qr;

  /**
   * @param {object} draftInput
   * @param {object|null|undefined} lesson
   */
  /**
   * Page uniqueness for duplicate detection.
   * Phase 1: dayPlans are one activity per page — distinguish by stable sourceItemId
   * (fallback: binder activityId). Other page types keep type:dayKey identity.
   * @param {{ type?: string, dayKey?: string, sourceItemId?: string, activityId?: string }} page
   */
  function pageUniquenessKey(page) {
    if (!page || typeof page !== "object") return "";
    if (page.type === "dayPlans") {
      const activityIdentity = asText(page.sourceItemId) || asText(page.activityId);
      return `dayPlans:${page.dayKey || ""}:${activityIdentity}`;
    }
    return `${page.type}:${page.dayKey || ""}`;
  }

  /**
   * @param {object} draftInput
   * @param {object|null|undefined} lesson
   */
  function evaluateBinderReadiness(draftInput, lesson) {
    const draft = normalizeBinderDraft(draftInput);
    const document = buildBinderDocument(draft, lesson);
    const pages = buildPagePlan(document);
    /** @type {Array<{ severity: "block"|"warn"|"info", code: string, section: string, message: string }>} */
    const issues = [];

    function add(severity, code, section, message) {
      issues.push({ severity, code, section, message });
    }

    if (!draft.sourceLessonId) {
      add("block", "missing_source_lesson", "Lesson", "No source lesson is linked to this binder draft.");
    } else if (!lesson || !lesson.id) {
      add("block", "lesson_not_found", "Lesson", "The linked lesson could not be loaded. Choose another lesson.");
    }

    if (!document.coverImage?.hasImage) {
      add("warn", "missing_cover", "Front Cover", "Cover image is missing. A fallback cover will print.");
    }

    if (!asText(document.title)) {
      add("block", "missing_title", "Front Cover", "Binder title is missing.");
    }

    if (document.sections.welcome !== false && !asText(document.welcomeCopy)) {
      add("warn", "empty_welcome", "How to Use This Binder", "Welcome page is enabled but has no copy.");
    }

    const seen = new Set();
    pages.forEach((page) => {
      const key = pageUniquenessKey(page);
      if (seen.has(key)) {
        add("block", "duplicate_page", "Preview", `Duplicate page detected (${key}).`);
      }
      seen.add(key);
    });

    WEEKDAYS.forEach((dayKey) => {
      const day = (document.days || []).find((item) => item.dayKey === dayKey);
      const label = WEEKDAY_LABELS[dayKey];
      if (!day) {
        add("block", "missing_day", label, `${label} is missing from the binder model.`);
        return;
      }
      if (document.sections.dailyDividers !== false && !asText(day.title?.text)) {
        add("warn", "missing_day_title", `${label} Divider`, `${label} is missing a daily title/focus.`);
      }
      if (document.sections.dailyPlans !== false) {
        if (!day.activities.length) {
          add("warn", "no_activities", `${label} Activities`, `No activities are assigned to ${label}.`);
        }
        day.activities.forEach((activity) => {
          if (!activity.hasAnyTeachingContent || !asText(activity.howToDoIt?.text)) {
            add(
              "warn",
              "empty_activity_directions",
              `${label} — “${activity.title}”`,
              "Activity directions are missing.",
            );
          }
          if (activity.image?.url && !/^https?:\/\//i.test(activity.image.url) && !activity.image.url.startsWith("/")) {
            add(
              "warn",
              "bad_activity_image",
              `${label} — “${activity.title}”`,
              "Activity image reference looks invalid.",
            );
          } else if (!asText(activity.image?.url)) {
            add(
              "info",
              "no_activity_image_assigned",
              `${label} — “${activity.title}”`,
              "No image is assigned for this activity (frame will be omitted).",
            );
          }
        });
      }
    });

    function normalizeTitleKey(value) {
      return asText(value)
        .toLowerCase()
        .replace(/[’']/g, "'")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }

    if (document.sections.books !== false) {
      const seenBookTitles = new Map();
      (document.books || []).forEach((book) => {
        const section = `Story Time — “${book.title}”`;
        const title = asText(book.title);
        const author = asText(book.author);
        if (/^all$/i.test(title) && /myself/i.test(author)) {
          add(
            "warn",
            "malformed_book_entry",
            section,
            "Book title/author look split incorrectly in source data (owner review). Source lesson was not changed.",
          );
        }
        const key = normalizeTitleKey(`${title} ${author}`);
        if (key && seenBookTitles.has(key)) {
          add(
            "warn",
            "duplicate_book_entry",
            section,
            `Duplicate story entry vs “${seenBookTitles.get(key)}”. Omit extras in Binder Review — do not edit source here.`,
          );
        } else if (key) {
          seenBookTitles.set(key, title);
        }
        // Also catch near-duplicates where malformed title is prefix of another
        const softKey = normalizeTitleKey(title);
        if (softKey && softKey.length <= 3) {
          const fuller = (document.books || []).find((other) => {
            if (other === book) return false;
            return normalizeTitleKey(other.title).startsWith(softKey);
          });
          if (fuller) {
            add(
              "warn",
              "malformed_book_entry",
              section,
              `Likely malformed duplicate of “${asText(fuller.title)}”. Flagged for owner source review.`,
            );
          }
        }
        if (book.qrEnabled) {
          if (!book.resourceUrl) {
            add("warn", "missing_story_qr", section, "QR is enabled but no approved resource URL is configured.");
          } else {
            const checked = validateBinderUrl(book.resourceUrl);
            if (!checked.ok) {
              add("block", "invalid_story_qr", section, `QR URL is invalid. ${checked.error}`);
            }
          }
        }
      });
    }

    if (document.sections.songs !== false) {
      const seenSongTitles = new Map();
      (document.songs || []).forEach((song) => {
        const section = `Music & Movement — “${song.title}”`;
        const key = normalizeTitleKey(song.title);
        if (key && seenSongTitles.has(key)) {
          add(
            "warn",
            "duplicate_song_entry",
            section,
            `Duplicate song entry vs “${seenSongTitles.get(key)}”. Omit extras in Binder Review — source lesson unchanged.`,
          );
        } else if (key) {
          seenSongTitles.set(key, asText(song.title));
        }
        if (song.qrEnabled) {
          if (!song.resourceUrl) {
            add("warn", "missing_song_qr", section, "QR is enabled but no approved resource URL is configured.");
          } else {
            const checked = validateBinderUrl(song.resourceUrl);
            if (!checked.ok) {
              add("block", "invalid_song_qr", section, `QR URL is invalid. ${checked.error}`);
            }
          }
        }
      });
    }

    add(
      "info",
      "printables_not_embedded",
      "Printable Sheets",
      "Binder Builder does not embed activity printable PDF sheets yet. Titles/materials mentions are not included printables. Link approved printable files before claiming a sellable prototype.",
    );

    if (document.sections.learningCenters === true && !(document.learningCenters || []).length) {
      add("info", "empty_centers", "Learning Centers", "Learning Centers is enabled but no center content is populated.");
    }

    if (document.sections.familyConnection !== false && !asText(document.familyConnection?.text)) {
      add("info", "empty_family", "Family Connection", "Family Connection is enabled but has no content.");
    }

    // Unsupported / empty required teaching surface
    const hasAnyActivity = (document.days || []).some((day) => (day.activities || []).length > 0);
    if (!hasAnyActivity) {
      add("block", "empty_binder_activities", "Daily Plans", "This binder has no activities on any day.");
    }

    const blockers = issues.filter((item) => item.severity === "block");
    const warnings = issues.filter((item) => item.severity === "warn");
    const status = blockers.length ? "NEEDS REVIEW" : (warnings.length ? "NEEDS REVIEW" : "READY");

    return {
      status,
      ready: blockers.length === 0,
      canPrint: blockers.length === 0,
      blockers,
      warnings,
      info: issues.filter((item) => item.severity === "info"),
      issues,
      pageCount: pages.length,
      pages,
      documentSummary: {
        title: document.title,
        ageGroup: document.ageGroup,
        sourceLessonId: document.sourceLessonId,
        dayCount: (document.days || []).length,
        bookCount: (document.books || []).length,
        songCount: (document.songs || []).length,
      },
    };
  }

  /**
   * Merge client-side image load results into a readiness object (non-mutating clone).
   * Failed assigned images become warnings and are never treated as successfully included.
   * @param {object} readiness
   * @param {{ loaded?: string[], failed?: string[], timedOut?: string[] }} imageResults
   */
  function applyImageLoadResults(readiness, imageResults) {
    const next = readiness && typeof readiness === "object" ? { ...readiness } : {};
    const issues = Array.isArray(next.issues) ? [...next.issues] : [];
    const failed = [...new Set([...(imageResults?.failed || []), ...(imageResults?.timedOut || [])].filter(Boolean))];
    failed.forEach((url) => {
      issues.push({
        severity: "warn",
        code: "image_load_failed",
        section: "Images",
        message: `Assigned image failed to load before export: ${url}`,
      });
    });
    next.issues = issues;
    next.warnings = issues.filter((item) => item.severity === "warn");
    next.blockers = issues.filter((item) => item.severity === "block");
    next.info = issues.filter((item) => item.severity === "info");
    next.status = next.blockers.length ? "NEEDS REVIEW" : (next.warnings.length ? "NEEDS REVIEW" : "READY");
    next.ready = next.blockers.length === 0;
    next.canPrint = next.blockers.length === 0;
    next.imageLoad = {
      loadedCount: (imageResults?.loaded || []).length,
      failedCount: failed.length,
      failedUrls: failed,
    };
    return next;
  }

  return {
    evaluateBinderReadiness,
    pageUniquenessKey,
    applyImageLoadResults,
  };
});
