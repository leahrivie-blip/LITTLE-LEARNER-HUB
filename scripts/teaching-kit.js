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
    // Complete Teaching Kit binder authoring in the classic lesson editor. Default false.
    // Independent of teachingKitEnrichmentEditor — never auto-enabled.
    "teachingKitAuthoring",
    // AI Curriculum Director (library-wide intelligence). Default false — never auto-enabled.
    "teachingKitCurriculumDirector",
    // AI Curriculum Quality Review (pre-publish specialist review). Default false — never auto-enabled.
    "teachingKitQualityReview",
    // Owner AI Curriculum Operator (orchestrator jobs). Default false — never auto-enabled.
    "teachingKitCurriculumOperator",
  ]);

  const COMPLETENESS_VALUES = Object.freeze([
    "legacy_mapped",
    "enriched",
    "complete",
  ]);

  /**
   * Provider digital binder tabs (vision alignment).
   * Hide empty tabs for normal users; do not duplicate this list in the viewer.
   */
  const PROVIDER_BINDER_TABS = Object.freeze([
    Object.freeze({ id: "overview", label: "Overview", sectionId: "overview" }),
    Object.freeze({ id: "weekly_plan", label: "Weekly Plan", sectionId: "weekly_plan" }),
    Object.freeze({ id: "activities", label: "Activities", sectionId: "daily_activities" }),
    Object.freeze({ id: "printables", label: "Printables", sectionId: "printables" }),
    Object.freeze({ id: "songs", label: "Songs", sectionId: "songs" }),
    Object.freeze({ id: "books", label: "Books", sectionId: "books" }),
    Object.freeze({ id: "examples", label: "Example Images", sectionId: "examples" }),
    Object.freeze({ id: "teacher_toolkit", label: "Teacher Toolkit", sectionId: "teacher_toolkit" }),
  ]);

  const PROVIDER_BINDER_TAB_IDS = Object.freeze(
    PROVIDER_BINDER_TABS.map((tab) => tab.id),
  );

  /**
   * Curriculum dashboard triage stages (vision alignment).
   * Distinct from quality bands Legacy / Enriched / Complete.
   */
  const DASHBOARD_STAGES = Object.freeze([
    "Legacy",
    "Draft Started",
    "AI Draft Ready",
    "In Review",
    "Needs Changes",
    "Ready for Owner Review",
    "Publish Ready",
    "Published",
    "Archived",
    // Back-compat aliases
    "In Progress",
    "Needs Review",
    "Ready",
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
    Object.freeze({ id: "teacher_toolkit", label: "Teacher Toolkit", printDefault: true }),
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
      teachingKitAuthoring: false,
      teachingKitCurriculumDirector: false,
      teachingKitQualityReview: false,
      teachingKitCurriculumOperator: false,
    };
  }

  function normalizedTeachingKitFeatureFlags(value) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      teachingKitViewer: input.teachingKitViewer === true,
      teachingKitPrintCenter: input.teachingKitPrintCenter === true,
      teachingKitAttachments: input.teachingKitAttachments === true,
      teachingKitEnrichmentEditor: input.teachingKitEnrichmentEditor === true,
      teachingKitAuthoring: input.teachingKitAuthoring === true,
      teachingKitCurriculumDirector: input.teachingKitCurriculumDirector === true,
      teachingKitQualityReview: input.teachingKitQualityReview === true,
      teachingKitCurriculumOperator: input.teachingKitCurriculumOperator === true,
    };
  }

  /** Admin Enrichment Editor framework (Slice 1+). Never auto-enabled. */
  function isTeachingKitEnrichmentEditorEnabled(flags) {
    return isTeachingKitFlagEnabled(flags, "teachingKitEnrichmentEditor");
  }

  /** Classic-editor binder authoring (Complete Teaching Kit System). Never auto-enabled. */
  function isTeachingKitAuthoringEnabled(flags) {
    return isTeachingKitFlagEnabled(flags, "teachingKitAuthoring");
  }

  /** Library-wide AI Curriculum Director. Never auto-enabled. */
  function isTeachingKitCurriculumDirectorEnabled(flags) {
    return isTeachingKitFlagEnabled(flags, "teachingKitCurriculumDirector");
  }

  /** Pre-publish AI Curriculum Quality Review. Never auto-enabled. */
  function isTeachingKitQualityReviewEnabled(flags) {
    return isTeachingKitFlagEnabled(flags, "teachingKitQualityReview");
  }

  /** Owner AI Curriculum Operator orchestrator. Default false. Never auto-publishes. */
  function isTeachingKitCurriculumOperatorEnabled(flags) {
    return isTeachingKitFlagEnabled(flags, "teachingKitCurriculumOperator");
  }

  /**
   * AI suggestion APIs may run for Enrichment Editor OR Binder Authoring.
   * Enrichment Editor flag must still stay off unless explicitly enabled.
   */
  function isTeachingKitAiAssistEnabled(flags) {
    return isTeachingKitEnrichmentEditorEnabled(flags) || isTeachingKitAuthoringEnabled(flags);
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

  /**
   * Owner Preview allowlist — Teaching Kit Viewer / Print Center / Attachments
   * may be exercised by this email only while store customer flags stay false.
   * Do not expand to other admin aliases or roles without an explicit product decision.
   */
  const TEACHING_KIT_OWNER_PREVIEW_EMAIL = "leahivie@icloud.com";

  function isTeachingKitOwnerPreviewEmail(email) {
    return String(email || "").trim().toLowerCase() === TEACHING_KIT_OWNER_PREVIEW_EMAIL;
  }

  /**
   * Server Owner Preview / Teaching Kit owner-admin gate — requires BOTH:
   * 1) authenticated identity email === leahivie@icloud.com
   * 2) valid owner/admin session for that same email
   * Email alone (member login without admin) must not unlock TK while customer flags are off.
   * Admin session alone for a different email must not unlock TK admin tools.
   */
  function isTeachingKitOwnerPreviewAuthorized(options = {}) {
    const email = String(options.email || "").trim().toLowerCase();
    const adminEmail = String(options.adminEmail || "").trim().toLowerCase();
    const hasOwnerAdminSession = options.hasOwnerAdminSession === true
      || (Boolean(options.adminTokenValid) && isTeachingKitOwnerPreviewEmail(adminEmail));
    return isTeachingKitOwnerPreviewEmail(email)
      && hasOwnerAdminSession
      && isTeachingKitOwnerPreviewEmail(adminEmail || email);
  }

  /**
   * Owner Preview: elevate Viewer / Print / Attachments for the allowlisted owner
   * email only. Does not mutate stored site-content flags and does not grant access
   * to other Admins, Founding, Pro, Free, or staff roles.
   */
  function effectiveCustomerTeachingKitFlags(flags, options = {}) {
    const base = normalizedTeachingKitFeatureFlags(flags);
    if (options && options.ownerPreview === true) {
      return {
        ...base,
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: true,
      };
    }
    return base;
  }

  /**
   * Public site-content may expose only customer Teaching Kit flags.
   * Never include owner/admin tooling flags (enrichment, authoring, director, quality).
   * The browser client gates TK mounting on these booleans from /api/site-content.
   */
  function publicCustomerTeachingKitFeatureFlags(flags) {
    const normalized = normalizedTeachingKitFeatureFlags(flags);
    return {
      teachingKitViewer: normalized.teachingKitViewer === true,
      teachingKitPrintCenter: normalized.teachingKitPrintCenter === true,
      teachingKitAttachments: normalized.teachingKitAttachments === true,
    };
  }

  /** Kit read API for a request: global flags OR Owner Preview session. */
  function isTeachingKitApiEnabledForRequest(flags, options = {}) {
    return isTeachingKitApiEnabled(flags) || (options && options.ownerPreview === true);
  }

  /** True when store customer flags are off but Owner Preview is elevating them. */
  function isOwnerOnlyTeachingKitPreview(flags, options = {}) {
    return Boolean(options && options.ownerPreview === true) && !isTeachingKitApiEnabled(flags);
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
    if (Array.isArray(value.vocabCards)) {
      out.vocabCards = value.vocabCards
        .map((card) => {
          if (card == null) return null;
          if (typeof card === "string") {
            const word = clampShortText(card, 120);
            return word ? { word } : null;
          }
          if (typeof card !== "object") return null;
          const word = clampShortText(card.word || card.title || card.term || card.label, 120);
          if (!word) return null;
          const normalized = { word };
          const definition = clampShortText(card.definition || card.meaning, 400);
          const example = clampShortText(card.example || card.sentence, 400);
          if (definition) normalized.definition = definition;
          if (example) normalized.example = example;
          return normalized;
        })
        .filter(Boolean)
        .slice(0, 40);
    }
    if (Array.isArray(value.printableIds)) {
      out.printableIds = normalizedIdList(value.printableIds, 100, 160);
    }
    if (value.teacherToolkit && typeof value.teacherToolkit === "object" && !Array.isArray(value.teacherToolkit)) {
      const toolkit = value.teacherToolkit;
      const listField = (raw, maxItems = 24, maxLen = 280) => (Array.isArray(raw)
        ? raw.map((item) => clampShortText(item, maxLen)).filter(Boolean).slice(0, maxItems)
        : []);
      out.teacherToolkit = {
        prepChecklist: listField(toolkit.prepChecklist),
        observationFocus: listField(toolkit.observationFocus),
        notes: clampShortText(toolkit.notes, 4000),
        teacherPreparation: clampShortText(toolkit.teacherPreparation, 4000),
        teacherTips: listField(toolkit.teacherTips || toolkit.tips),
        setupCleanupShortcuts: listField(toolkit.setupCleanupShortcuts || toolkit.setupShortcuts),
        dailyMaterialsSummary: clampShortText(toolkit.dailyMaterialsSummary, 2000),
        masterMaterialsChecklist: listField(toolkit.masterMaterialsChecklist || toolkit.masterMaterials, 40),
        materialSubstitutions: listField(toolkit.materialSubstitutions || toolkit.substitutions),
        vocabulary: listField(toolkit.vocabulary, 40, 120),
        observationPrompts: listField(toolkit.observationPrompts),
        documentationPrompts: listField(toolkit.documentationPrompts || toolkit.milestonePrompts),
        mixedAgeAdaptations: clampShortText(toolkit.mixedAgeAdaptations, 2000),
        extraSupportAdaptations: clampShortText(toolkit.extraSupportAdaptations || toolkit.extraSupport, 2000),
        challengeExtensions: clampShortText(toolkit.challengeExtensions || toolkit.extensions, 2000),
        smallGroupOptions: clampShortText(toolkit.smallGroupOptions, 2000),
        largeGroupOptions: clampShortText(toolkit.largeGroupOptions, 2000),
        indoorAlternatives: clampShortText(toolkit.indoorAlternatives, 2000),
        outdoorOptions: clampShortText(toolkit.outdoorOptions, 2000),
        familyConnection: clampShortText(toolkit.familyConnection, 2000),
        safetyInclusionNotes: clampShortText(toolkit.safetyInclusionNotes || toolkit.safetyNotes, 2000),
        endOfWeekReflection: clampShortText(toolkit.endOfWeekReflection, 2000),
        suggestedQuestions: listField(toolkit.suggestedQuestions || toolkit.questionsToAsk),
      };
    }
    return out;
  }

  /**
   * True when the lesson is an upgraded Teaching Kit (not raw legacy).
   * Uses stored overlay completeness only — never invents upgrade status.
   * enriched + complete both qualify; legacy_mapped / missing do not.
   */
  function isUpgradedTeachingKit(plan, kit) {
    const fromKit = clampShortText(kit && kit.completeness, 40);
    const overlay = normalizedTeachingKitOverlay(plan && plan.teachingKit);
    const fromPlan = overlay ? clampShortText(overlay.completeness, 40) : "";
    const completeness = COMPLETENESS_VALUES.includes(fromKit)
      ? fromKit
      : (COMPLETENESS_VALUES.includes(fromPlan) ? fromPlan : "legacy_mapped");
    if (completeness === "complete" || completeness === "enriched") return true;
    const percent = Number(
      (kit && kit.completionPercent)
      || (overlay && overlay.completionPercent)
      || 0,
    );
    return Number.isFinite(percent) && percent >= 90;
  }

  /**
   * Designed Teaching Kit HTML document vs legacy text/PDF routing.
   *
   * - Upgraded Complete/Enriched kits ALWAYS use the designed binder for
   *   print/download (Print Center UI flag must not force a Helvetica text dump).
   * - Explicit Print Center / binder intent uses designed HTML from the mapped companion.
   * - Legacy lessons keep backwards-compatible legacy download output unless the
   *   caller is intentionally using Print Center.
   * - teachingKitPrintCenter remains the customer UI rollout switch for Print Center chrome.
   */
  function shouldUseDesignedTeachingKitDocument(plan, kit, featureFlags, options = {}) {
    if (!kit || kit.ok === false || kit.locked || !kit.companion) return false;
    if (options.forceDesigned === true || options.intent === "print_center") return true;
    if (isUpgradedTeachingKit(plan, kit)) return true;
    // Viewer/owner-preview session: customer already in Teaching Kit experience —
    // keep print/download on the same designed document (avoid two designs).
    const flags = normalizedTeachingKitFeatureFlags(featureFlags);
    if (flags.teachingKitViewer === true || options.ownerPreview === true || featureFlags?.ownerPreview === true) {
      return true;
    }
    if (flags.teachingKitPrintCenter === true) return true;
    return false;
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
    PROVIDER_BINDER_TABS,
    PROVIDER_BINDER_TAB_IDS,
    DASHBOARD_STAGES,
    SECTIONS,
    ACTIVITY_CATEGORY_TO_SECTION,
    ATTACHMENT_TYPES,
    defaultTeachingKitFeatureFlags,
    normalizedTeachingKitFeatureFlags,
    isTeachingKitFlagEnabled,
    isTeachingKitEnrichmentEditorEnabled,
    isTeachingKitAuthoringEnabled,
    isTeachingKitCurriculumDirectorEnabled,
    isTeachingKitQualityReviewEnabled,
    isTeachingKitCurriculumOperatorEnabled,
    isTeachingKitAiAssistEnabled,
    isTeachingKitApiEnabled,
    TEACHING_KIT_OWNER_PREVIEW_EMAIL,
    isTeachingKitOwnerPreviewEmail,
    isTeachingKitOwnerPreviewAuthorized,
    effectiveCustomerTeachingKitFlags,
    publicCustomerTeachingKitFeatureFlags,
    isTeachingKitApiEnabledForRequest,
    isOwnerOnlyTeachingKitPreview,
    normalizedTeachingKitOverlay,
    resolveTeachingKitRenderMode,
    isUpgradedTeachingKit,
    shouldUseDesignedTeachingKitDocument,
    sectionIds,
    mapActivityCategoryToSection,
    mapLessonPlanToTeachingKit,
  };
});
