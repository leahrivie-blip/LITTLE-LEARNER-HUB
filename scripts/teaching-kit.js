/**
 * Little Learner Hub — Teaching Kit canonical config + safe schema helpers.
 *
 * Slice 1A: flags default false, optional teachingKit passthrough, section IDs.
 * Slice 1B: mapLessonPlanToTeachingKit (pure read-model; no UI/API/PDF yet).
 * No viewer, PDF, attachments UI, or migration lives here.
 *
 * Shared by server (require) and browser (LLHTeachingKit global) so section
 * maps cannot silently drift. If a second copy is ever required, add parity tests.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKit = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const FEATURE_FLAG_KEYS = Object.freeze([
    "teachingKitViewer",
    "teachingKitPrintCenter",
    "teachingKitAttachments",
    // Enrichment Editor (admin upgrade workspace). Default false until owner enables per slice.
    "teachingKitEnrichmentEditor",
  ]);

  const COMPLETENESS_VALUES = Object.freeze([
    "legacy_mapped",
    "enriched",
    "complete",
  ]);

  /**
   * Canonical Print Center / binder section registry.
   * Consumers must import from here — do not duplicate lists in app.js or server routes.
   */
  const SECTIONS = Object.freeze([
    Object.freeze({ id: "overview", label: "Weekly Lesson Overview", printDefault: true }),
    Object.freeze({ id: "objectives", label: "Learning Objectives", printDefault: true }),
    Object.freeze({ id: "vocabulary", label: "Vocabulary Words", printDefault: true }),
    Object.freeze({ id: "materials", label: "Materials List", printDefault: true }),
    Object.freeze({ id: "weekly_plan", label: "Monday–Friday Lesson Plans", printDefault: true }),
    Object.freeze({ id: "daily_activities", label: "Daily Activities", printDefault: true }),
    Object.freeze({ id: "circle_time", label: "Circle Time", printDefault: false }),
    Object.freeze({ id: "books", label: "Books", printDefault: true }),
    Object.freeze({ id: "songs", label: "Songs", printDefault: true }),
    Object.freeze({ id: "process_art", label: "Process Art", printDefault: false }),
    Object.freeze({ id: "invitations", label: "Invitations to Play", printDefault: false }),
    Object.freeze({ id: "small_group", label: "Small Group Activities", printDefault: false }),
    Object.freeze({ id: "large_group", label: "Large Group Activities", printDefault: false }),
    Object.freeze({ id: "outdoor", label: "Outdoor Activities", printDefault: false }),
    Object.freeze({ id: "fine_motor", label: "Fine Motor", printDefault: false }),
    Object.freeze({ id: "gross_motor", label: "Gross Motor", printDefault: false }),
    Object.freeze({ id: "sensory", label: "Sensory", printDefault: false }),
    Object.freeze({ id: "stem", label: "STEM", printDefault: false }),
    Object.freeze({ id: "dramatic_play", label: "Dramatic Play", printDefault: false }),
    Object.freeze({ id: "teacher_tips", label: "Teacher Tips", printDefault: false }),
    Object.freeze({ id: "observations", label: "Observation Prompts", printDefault: true }),
    Object.freeze({ id: "family", label: "Family Connection Ideas", printDefault: true }),
    Object.freeze({ id: "extensions", label: "Extension Activities", printDefault: false }),
    Object.freeze({ id: "printables", label: "Printable Resources", printDefault: true }),
    Object.freeze({ id: "examples", label: "Activity Picture Examples", printDefault: false }),
    Object.freeze({ id: "teacher_notes", label: "Teacher Notes", printDefault: false }),
    Object.freeze({ id: "vocab_cards", label: "Vocabulary Cards", printDefault: false }),
    Object.freeze({ id: "family_letter", label: "Family Letter", printDefault: false }),
    Object.freeze({ id: "observation_forms", label: "Observation Forms", printDefault: false }),
  ]);

  /** Map existing activityCategory strings → kit section ids (extensible). */
  const ACTIVITY_CATEGORY_TO_SECTION = Object.freeze({
    "Circle Time": "circle_time",
    "Invitation to Play": "invitations",
    "Open-Ended Exploration": "invitations",
    Sensory: "sensory",
    "Sensory Play": "sensory",
    "Fine Motor": "fine_motor",
    "Gross Motor": "gross_motor",
    Art: "process_art",
    "Process Art": "process_art",
    STEM: "stem",
    "STEM/Discovery": "stem",
    Science: "stem",
    Literacy: "daily_activities",
    "Early Literacy": "daily_activities",
    "Early Math": "daily_activities",
    "Dramatic Play": "dramatic_play",
    "Music and Movement": "circle_time",
    "Music & Movement": "circle_time",
    "Outdoor Play": "outdoor",
    "Small Group": "small_group",
    "Social-Emotional": "daily_activities",
    Cooking: "daily_activities",
    Matching: "daily_activities",
    Sorting: "daily_activities",
    "Parent Connection": "family",
  });

  const ATTACHMENT_TYPES = Object.freeze([
    "printable_pdf",
    "flashcards",
    "poster",
    "name_tags",
    "classroom_labels",
    "matching_cards",
    "coloring_page",
    "cutting_practice",
    "worksheet",
    "visual_schedule",
    "parent_handout",
    "song_lyrics",
    "teacher_instructions",
    "observation_sheet",
    "example_photo",
  ]);

  function defaultTeachingKitFeatureFlags() {
    return {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
      teachingKitEnrichmentEditor: false,
    };
  }

  function normalizedTeachingKitFeatureFlags(value) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      teachingKitViewer: input.teachingKitViewer === true,
      teachingKitPrintCenter: input.teachingKitPrintCenter === true,
      teachingKitAttachments: input.teachingKitAttachments === true,
      teachingKitEnrichmentEditor: input.teachingKitEnrichmentEditor === true,
    };
  }

  /** Admin Enrichment Editor framework (Slice 1+). Never auto-enabled. */
  function isTeachingKitEnrichmentEditorEnabled(flags) {
    return isTeachingKitFlagEnabled(flags, "teachingKitEnrichmentEditor");
  }

  function isTeachingKitFlagEnabled(flags, key) {
    if (!FEATURE_FLAG_KEYS.includes(key)) return false;
    const normalized = normalizedTeachingKitFeatureFlags(flags);
    return normalized[key] === true;
  }

  /** Slice 1C: kit read API is available when viewer or print-center flag is on. */
  function isTeachingKitApiEnabled(flags) {
    return isTeachingKitFlagEnabled(flags, "teachingKitViewer")
      || isTeachingKitFlagEnabled(flags, "teachingKitPrintCenter");
  }

  function clampShortText(value, max) {
    const text = String(value == null ? "" : value).trim();
    if (!text) return "";
    return text.length > max ? text.slice(0, max) : text;
  }

  function normalizedIdList(value, maxItems, maxLen) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (let i = 0; i < value.length && out.length < maxItems; i += 1) {
      const id = clampShortText(value[i], maxLen);
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  }

  /**
   * Optional overlay on a lesson plan. Malformed / unknown shapes → null
   * (caller omits the field so the legacy plan body is unchanged).
   * Does not invent a teachingKit object when the field is absent.
   */
  function normalizedTeachingKitOverlay(value) {
    if (value == null || value === "") return null;
    if (typeof value !== "object" || Array.isArray(value)) return null;

    const schemaVersionRaw = Number(value.schemaVersion);
    const schemaVersion = schemaVersionRaw === 1 ? 1 : 1;
    const completenessRaw = clampShortText(value.completeness, 40);
    const completeness = COMPLETENESS_VALUES.includes(completenessRaw)
      ? completenessRaw
      : "legacy_mapped";

    const sectionOverrides =
      value.sectionOverrides && typeof value.sectionOverrides === "object" && !Array.isArray(value.sectionOverrides)
        ? value.sectionOverrides
        : {};

    const completionRaw = Number(value.completionPercent);
    const completionPercent = Number.isFinite(completionRaw)
      ? Math.max(0, Math.min(100, Math.round(completionRaw)))
      : undefined;
    const out = {
      schemaVersion,
      completeness,
      sectionOverrides,
      attachmentIds: normalizedIdList(value.attachmentIds, 100, 160),
      exampleImageIds: normalizedIdList(value.exampleImageIds, 100, 160),
      updatedAt: clampShortText(value.updatedAt, 80),
      lastEditedBy: clampShortText(value.lastEditedBy, 180),
    };
    if (!out.lastEditedBy) delete out.lastEditedBy;
    if (completionPercent != null) out.completionPercent = completionPercent;
    // Enrichment publish metadata + week fields (must persist — do not write-then-strip).
    const lastAt = clampShortText(value.lastEnrichmentPublishedAt, 80);
    const lastBy = clampShortText(value.lastEnrichmentPublishedBy, 180);
    const lastFp = clampShortText(value.lastEnrichmentPublishFingerprint, 80);
    const lastVer = clampShortText(value.lastEnrichmentVersionId, 80);
    if (lastAt) out.lastEnrichmentPublishedAt = lastAt;
    if (lastBy) out.lastEnrichmentPublishedBy = lastBy;
    if (lastFp) out.lastEnrichmentPublishFingerprint = lastFp;
    if (lastVer) out.lastEnrichmentVersionId = lastVer;
    if (Array.isArray(value.milestones)) {
      out.milestones = value.milestones
        .map((item) => clampShortText(item, 80))
        .filter(Boolean)
        .slice(0, 16);
    }
    if (Array.isArray(value.printableIds)) {
      out.printableIds = normalizedIdList(value.printableIds, 100, 160);
    }
    return out;
  }

  /**
   * Viewer/print gate helper for later slices.
   * Slice 1A: always prefer legacy when flag off or overlay missing/malformed.
   */
  function resolveTeachingKitRenderMode(plan, featureFlags) {
    if (!isTeachingKitFlagEnabled(featureFlags, "teachingKitViewer")) {
      return { mode: "legacy", teachingKit: null, reason: "flag_off" };
    }
    const overlay = normalizedTeachingKitOverlay(plan && plan.teachingKit);
    if (!overlay) {
      return { mode: "legacy", teachingKit: null, reason: "missing_or_malformed" };
    }
    return { mode: "teaching_kit", teachingKit: overlay, reason: "ok" };
  }

  function sectionIds() {
    return SECTIONS.map((section) => section.id);
  }

  function mapActivityCategoryToSection(category) {
    const key = clampShortText(category, 80);
    return ACTIVITY_CATEGORY_TO_SECTION[key] || "daily_activities";
  }

  function loadMapper() {
    if (root && root.LLHTeachingKitMapper && typeof root.LLHTeachingKitMapper.mapLessonPlanToTeachingKit === "function") {
      return root.LLHTeachingKitMapper;
    }
    if (typeof module === "object" && typeof require === "function") {
      try {
        return require("./teaching-kit-mapper.js");
      } catch (_error) {
        return null;
      }
    }
    return null;
  }

  /**
   * Slice 1B read-model. Pure mapping — does not rewrite lesson storage.
   * UI / API / PDF assembly ship in later flagged slices.
   */
  function mapLessonPlanToTeachingKit(plan, activities, resources, options) {
    const mapper = loadMapper();
    if (!mapper || typeof mapper.mapLessonPlanToTeachingKit !== "function") {
      return {
        schemaVersion: 1,
        ok: false,
        reason: "mapper_unavailable",
        sections: [],
        companion: null,
      };
    }
    return mapper.mapLessonPlanToTeachingKit(plan, activities, resources, options, {
      SECTIONS,
      mapActivityCategoryToSection,
    });
  }

  return {
    FEATURE_FLAG_KEYS,
    COMPLETENESS_VALUES,
    SECTIONS,
    ACTIVITY_CATEGORY_TO_SECTION,
    ATTACHMENT_TYPES,
    defaultTeachingKitFeatureFlags,
    normalizedTeachingKitFeatureFlags,
    isTeachingKitFlagEnabled,
    isTeachingKitEnrichmentEditorEnabled,
    isTeachingKitApiEnabled,
    normalizedTeachingKitOverlay,
    resolveTeachingKitRenderMode,
    sectionIds,
    mapActivityCategoryToSection,
    mapLessonPlanToTeachingKit,
  };
});
