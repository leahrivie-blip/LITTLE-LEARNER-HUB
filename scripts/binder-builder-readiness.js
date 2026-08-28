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

    const pageTypes = pages.map((page) => `${page.type}:${page.dayKey || ""}`);
    const seen = new Set();
    pageTypes.forEach((key) => {
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
          }
        });
      }
    });

    if (document.sections.books !== false) {
      (document.books || []).forEach((book) => {
        const section = `Story Time — “${book.title}”`;
        if (book.qrEnabled) {
          if (!book.resourceUrl) {
            add("warn", "missing_story_qr", section, "QR is enabled but no resource URL is configured.");
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
      (document.songs || []).forEach((song) => {
        const section = `Music & Movement — “${song.title}”`;
        if (song.qrEnabled) {
          if (!song.resourceUrl) {
            add("warn", "missing_song_qr", section, "QR is enabled but no resource URL is configured.");
          } else {
            const checked = validateBinderUrl(song.resourceUrl);
            if (!checked.ok) {
              add("block", "invalid_song_qr", section, `QR URL is invalid. ${checked.error}`);
            }
          }
        }
      });
    }

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

  return {
    evaluateBinderReadiness,
  };
});
