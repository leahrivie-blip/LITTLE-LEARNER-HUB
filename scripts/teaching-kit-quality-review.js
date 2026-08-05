/**
 * AI Curriculum Quality Review — specialist-style readiness reports.
 * Evaluates Teaching Kits before publish; never auto-publishes or auto-edits.
 * Per-issue actions (Improve with AI / Ignore / Edit manually) stay draft-only.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitQualityReview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeKey(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function wordCount(value) {
    return text(value).split(/\s+/).filter(Boolean).length;
  }

  function loadReusable() {
    if (root && root.LLHTeachingKitReusableLibrary) return root.LLHTeachingKitReusableLibrary;
    if (typeof module === "object" && typeof require === "function") {
      try { return require("./teaching-kit-reusable-library.js"); } catch (_e) { return null; }
    }
    return null;
  }

  function loadDirector() {
    if (root && root.LLHTeachingKitCurriculumDirector) return root.LLHTeachingKitCurriculumDirector;
    if (typeof module === "object" && typeof require === "function") {
      try { return require("./teaching-kit-curriculum-director.js"); } catch (_e) { return null; }
    }
    return null;
  }

  function loadEnrichment() {
    if (root && root.LLHTeachingKitEnrichment) return root.LLHTeachingKitEnrichment;
    if (typeof module === "object" && typeof require === "function") {
      try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
    }
    return null;
  }

  const SECTIONS = Object.freeze([
    { id: "developmental_fit", label: "Developmental appropriateness" },
    { id: "objectives", label: "Learning objectives" },
    { id: "domain_balance", label: "Developmental domain balance" },
    { id: "play_based", label: "Play-based learning" },
    { id: "fine_motor", label: "Fine motor" },
    { id: "gross_motor", label: "Gross motor" },
    { id: "sensory", label: "Sensory experiences" },
    { id: "literacy", label: "Literacy" },
    { id: "math", label: "Math" },
    { id: "science", label: "Science" },
    { id: "art", label: "Art" },
    { id: "sel", label: "Social-emotional learning" },
    { id: "dramatic_play", label: "Dramatic play" },
    { id: "outdoor", label: "Outdoor learning" },
    { id: "indoor_backup", label: "Indoor backup options" },
    { id: "family", label: "Family connections" },
    { id: "teacher_prep", label: "Teacher preparation" },
    { id: "observations", label: "Observation opportunities" },
    { id: "vocabulary", label: "Vocabulary quality" },
    { id: "books", label: "Books" },
    { id: "songs", label: "Songs" },
    { id: "printables", label: "Printables" },
    { id: "example_images", label: "Example images" },
    { id: "toolkit", label: "Teacher toolkit completeness" },
    { id: "variety", label: "Activity variety" },
    { id: "safety", label: "Safety" },
    { id: "realistic", label: "Realistic classroom implementation" },
    { id: "duplicates", label: "Duplicate / repetitive activities" },
  ]);

  function ageBand(age) {
    const director = loadDirector();
    if (director?.ageBand) return director.ageBand(age);
    const a = normalizeKey(age);
    if (/infant|baby/.test(a)) return "infant";
    if (/toddler|18|24|1\s*[-–]\s*2|2\s*[-–]\s*3/.test(a)) return "toddler";
    if (/pre.?k|preschool|3\s*[-–]\s*5|3\s*[-–]\s*4|4\s*[-–]\s*5/.test(a)) return "preschool";
    return a ? "other" : "unspecified";
  }

  function corpus(plan, activities, draft) {
    const week = draft?.week || {};
    const draftActs = draft?.activities || {};
    const bits = [
      text(plan?.weeklyOverview),
      text(week.weeklyOverview),
      text(plan?.objectives),
      text(week.objectives),
      text(plan?.familyConnection),
      text(week.familyConnection),
      text(plan?.vocabularyWords),
      text(week.teacherPreparation),
      text(week.teacherToolkit?.teacherPreparation),
      ...asArray(week.vocabCards).map((c) => text(c?.title || c)),
      ...asArray(week.printableIdeas).map((p) => text(p)),
      ...asArray(activities).flatMap((act) => {
        const key = text(act.id || act.itemId);
        const patch = draftActs[key] || {};
        return [
          text(act.title),
          text(act.setup || patch.setup),
          text(act.steps || patch.steps),
          text(act.objective || patch.objective),
          text(act.adaptations || patch.adaptations),
          text(act.extraSupport || patch.extraSupport),
          text(act.mixedAgeAdaptations || patch.mixedAgeAdaptations),
          text(act.safetyNotes || patch.safetyNotes),
          text(act.materials || patch.materials),
          ...asArray(patch.teacherTips),
          ...asArray(act.teacherTips),
          ...asArray(patch.observationPrompts),
          text(patch.indoorAlternatives || act.indoorAlternatives || act.indoorAlternative),
          text(patch.outdoorAlternatives || act.outdoorAlternatives || act.outdoorOption),
          text(patch.imageBriefSetup),
          text(patch.imageBriefExample),
        ];
      }),
    ];
    return bits.filter(Boolean).join(" \n ").toLowerCase();
  }

  function hasDomainSignal(corpusText, patterns) {
    return patterns.some((p) => p.test(corpusText));
  }

  function finding({
    code,
    section,
    severity = "medium",
    message,
    suggestion = "",
    blocking = false,
    navigateTo = "",
    publishGate = "",
  }) {
    return {
      id: `${code}-${section}`,
      code,
      section,
      sectionLabel: (SECTIONS.find((s) => s.id === section) || {}).label || section,
      severity, // blocking | high | medium | low
      message,
      suggestion,
      blocking: blocking === true || severity === "blocking",
      navigateTo: text(navigateTo),
      publishGate: text(publishGate) || (blocking || severity === "blocking" ? "hard_blocker" : "quality"),
      status: "pending", // pending | ignored | improved
      actions: ["improve_with_ai", "ignore", "edit_manually"],
    };
  }

  function scoreFromFindings(findings, sectionId) {
    const related = findings.filter((f) => f.section === sectionId && f.status !== "ignored");
    if (!related.length) return 100;
    let penalty = 0;
    related.forEach((f) => {
      if (f.blocking || f.severity === "blocking") penalty += 40;
      else if (f.severity === "high") penalty += 22;
      else if (f.severity === "medium") penalty += 12;
      else penalty += 5;
    });
    return Math.max(0, 100 - penalty);
  }

  /** Serious missing areas that must align Quality Review with Publish when completeness is low. */
  const SERIOUS_GAP_CODES = Object.freeze([
    "weak_objectives",
    "missing_family",
    "missing_books",
    "missing_songs",
    "missing_tips",
    "missing_observations",
    "missing_vocabulary",
    "weak_teacher_prep",
    "missing_materials",
    "domain_imbalance",
    "missing_weekday_focus",
    "missing_activity_instructions",
    "missing_safety_guidance",
    "placeholder_text",
    "copyright_concern",
    "missing_printables",
    "missing_example_images",
    "incomplete_toolkit",
    "incomplete_books",
    "incomplete_songs",
    "image_brief_not_image",
  ]);

  const PUBLISH_READINESS = Object.freeze({
    READY: "ready",
    NEEDS_REVIEW: "needs_review",
    BLOCKED: "blocked",
  });

  function publishReadinessLabel(value) {
    if (value === PUBLISH_READINESS.READY) return "Ready";
    if (value === PUBLISH_READINESS.NEEDS_REVIEW) return "Needs Review";
    return "Blocked";
  }

  function elevateSeriousGapsForPublish(findings, completionPercent, ignoredCodes = []) {
    const list = asArray(findings);
    const ignored = ignoredCodes instanceof Set
      ? ignoredCodes
      : new Set(asArray(ignoredCodes).map((c) => text(c)));
    const active = list.filter((f) => f.status !== "ignored");
    const serious = active.filter((f) => SERIOUS_GAP_CODES.includes(f.code));
    // Mid-completeness kits with multiple serious gaps must not show "No blockers".
    if (completionPercent < 70 && serious.length >= 2) {
      serious.forEach((f) => {
        f.severity = "blocking";
        f.blocking = true;
        f.publishGate = "serious_gaps";
      });
    }
    // Do not re-add if the finding already exists (including ignored) — owner can clear via Ignore.
    if (completionPercent < 50 && !list.some((f) => f.code === "completeness_too_low")) {
      const row = finding({
        code: "completeness_too_low",
        section: "toolkit",
        severity: "blocking",
        blocking: true,
        publishGate: "completeness",
        message: `Teaching Kit completeness is only ${completionPercent}% (below Ready). Improve missing areas before normal publish.`,
        suggestion: "Raise completeness and clear serious gaps, or use an explicit owner override with a written reason.",
      });
      if (ignored.has(row.code)) row.status = "ignored";
      list.push(row);
    }
    return list;
  }

  function finalizePublishGate(reportBase) {
    const findings = asArray(reportBase.findings);
    const activeFindings = findings.filter((f) => f.status !== "ignored");
    const blockingIssues = activeFindings.filter((f) => f.blocking || f.severity === "blocking");
    const highCount = activeFindings.filter((f) => f.severity === "high" || f.blocking).length;
    const medium = activeFindings.filter((f) => f.severity === "medium").length;
    const low = activeFindings.filter((f) => f.severity === "low").length;
    // Educational quality score — never call this "100% quality" from field presence alone.
    // Do not double-count blockers inside highCount — keep relative ranking meaningful.
    const nonBlockingHigh = activeFindings.filter((f) => f.severity === "high" && !f.blocking).length;
    const overallScore = Math.max(
      0,
      Math.min(100, 100 - blockingIssues.length * 7 - nonBlockingHigh * 4 - medium * 2 - low * 1),
    );
    const completionPercent = Number(reportBase.completionPercent) || 0;
    const premiumReadinessPercent = Number(reportBase.premiumReadinessPercent != null
      ? reportBase.premiumReadinessPercent
      : completionPercent) || 0;
    let publishReadiness = PUBLISH_READINESS.BLOCKED;
    // Publish Ready requires zero hard blockers AND premium asset readiness (real images/printables).
    if (
      !blockingIssues.length
      && premiumReadinessPercent >= 90
      && overallScore >= 75
      && highCount === 0
    ) {
      publishReadiness = PUBLISH_READINESS.READY;
    } else if (!blockingIssues.length) {
      publishReadiness = PUBLISH_READINESS.NEEDS_REVIEW;
    }
    let overallLabel = "Not ready";
    if (publishReadiness === PUBLISH_READINESS.READY) overallLabel = "Publish ready";
    else if (blockingIssues.length) overallLabel = "Blocked";
    else if (publishReadiness === PUBLISH_READINESS.NEEDS_REVIEW && overallScore >= 75) overallLabel = "Almost ready";
    else if (overallScore >= 50) overallLabel = "Needs work";

    return {
      ...reportBase,
      findings,
      overallScore,
      overallLabel,
      completionPercent,
      premiumReadinessPercent,
      blockingIssues: blockingIssues.map((f) => ({
        code: f.code,
        message: f.message,
        suggestion: f.suggestion,
        publishGate: f.publishGate || "quality",
        navigateTo: f.navigateTo || "",
      })),
      warnings: activeFindings
        .filter((f) => f.severity === "high" || f.severity === "medium")
        .map((f) => ({ code: f.code, message: f.message, severity: f.severity })),
      publishReadiness,
      publishReadinessLabel: publishReadinessLabel(publishReadiness),
      blocksPublish: publishReadiness === PUBLISH_READINESS.BLOCKED || blockingIssues.length > 0,
      reviewRequired: true,
      autoPublished: false,
      autoChanged: false,
    };
  }

  /**
   * Full specialist-style quality review. Report only — no mutations.
   * Quality Review and Publish share the same blocker / readiness logic.
   */
  function buildQualityReport(plan, activities, enrichmentDraft, options = {}) {
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : {};
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    const draftActs = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    const list = asArray(activities);
    const ignored = new Set(
      asArray(options.ignoredCodes || week.qualityReviewIgnored || []).map((c) => text(c)),
    );
    const band = ageBand(plan?.age);
    const body = corpus(plan, list, draft);
    const findings = [];
    const enrich = loadEnrichment();
    let completionPercent = 0;
    let weekdayCoverageLabel = "";
    let contentCompletionPercent = 0;
    let upgradeSummary = null;
    if (enrich?.buildUpgradeSummary) {
      try {
        upgradeSummary = enrich.buildUpgradeSummary(plan, list, draft);
        completionPercent = Number(upgradeSummary.enrichmentFillPercent ?? upgradeSummary.completionPercent) || 0;
        contentCompletionPercent = Number(upgradeSummary.contentCompletionPercent) || 0;
        weekdayCoverageLabel = String(upgradeSummary.weekdayCoverageLabel || upgradeSummary.weekdayCoverage?.label || "");
      } catch (_error) {
        upgradeSummary = null;
      }
    }
    if (!upgradeSummary && enrich?.computeCompletionPercent) {
      try {
        completionPercent = Number(enrich.computeCompletionPercent(plan, list, draft)) || 0;
        contentCompletionPercent = completionPercent;
      } catch (_error) {
        completionPercent = 0;
      }
    }

    // Developmental appropriateness
    if (band === "infant" && /scissors|worksheet|write your name|count to 20|phonics drill/i.test(body)) {
      findings.push(finding({
        code: "age_mismatch_infant",
        section: "developmental_fit",
        severity: "blocking",
        blocking: true,
        message: "Some activities look too advanced for infants (scissors/worksheets/formal drills).",
        suggestion: "Replace with sensory exploration, caregiver-mediated play, and short responsive interactions.",
      }));
    }
    if (band === "toddler" && /worksheet|write sentences|silent reading|independent research/i.test(body)) {
      findings.push(finding({
        code: "age_mismatch_toddler",
        section: "developmental_fit",
        severity: "high",
        message: "Toddler kit includes formal school-style tasks that may not fit emerging skills.",
        suggestion: "Shift toward short play invitations, large pieces, and modeled language.",
      }));
    }
    if (!text(plan?.age)) {
      findings.push(finding({
        code: "missing_age",
        section: "developmental_fit",
        severity: "blocking",
        blocking: true,
        message: "Age group is missing — cannot confirm developmental appropriateness.",
        suggestion: "Set the target age band before publishing.",
      }));
    }

    // Learning objectives
    const objectives = text(week.objectives || plan?.objectives || plan?.weeklyOverview);
    if (wordCount(objectives) < 8) {
      findings.push(finding({
        code: "weak_objectives",
        section: "objectives",
        severity: "high",
        message: "Learning objectives are missing or too thin.",
        suggestion: "Write 2–4 observable, play-connected objectives for this age group.",
      }));
    } else if (!/will|can|explore|practice|notice|use/i.test(objectives)) {
      findings.push(finding({
        code: "vague_objectives",
        section: "objectives",
        severity: "medium",
        message: "Objectives read vague — strengthen with observable child actions.",
        suggestion: "Use “Children will explore / practice / notice…” language.",
      }));
    }

    // Domain balance + specific domains
    const domainChecks = [
      ["fine_motor", [/pinch|tongs|thread|cut|finger|grasp|bead|tweezer/i], "Add a fine-motor invitation (pinch, place, thread, or tongs)."],
      ["gross_motor", [/march|jump|crawl|stretch|balance|run|dance|obstacle|movement path/i], "Add a gross-motor path or movement game."],
      ["sensory", [/sensory|texture|sand|water|smell|sound|bin|foam|messy/i], "Add a sensory tray or texture exploration."],
      ["literacy", [/vocab|letter|story|book|rhyme|word|read|write|dictate/i], "Strengthen literacy with vocabulary cards or story talk."],
      ["math", [/count|sort|pattern|number|measure|compare|shape/i], "Add a count/sort/pattern math spark."],
      ["science", [/observe|predict|experiment|nature|cause|what happens if|stem|investigate/i], "Add a simple science wonder question or cause/effect invite."],
      ["art", [/paint|draw|collage|process art|clay|crayon|stamp|create/i], "Add process art focused on exploration, not a fixed product."],
      ["sel", [/friend|share|feel|emotion|calm|kind|turn.?taking|comfort|belong/i], "Add an SEL moment (feelings talk, turn-taking, or friendship play)."],
      ["dramatic_play", [/pretend|dramatic|role.?play|kitchen|doctor|costume|prop/i], "Add a dramatic-play prop invitation tied to the theme."],
    ];
    const presentDomains = [];
    domainChecks.forEach(([section, patterns, suggestion]) => {
      if (hasDomainSignal(body, patterns)) presentDomains.push(section);
      else {
        findings.push(finding({
          code: `missing_${section}`,
          section,
          severity: section === "sel" || section === "literacy" ? "high" : "medium",
          message: `Limited or missing ${section.replace(/_/g, " ")} opportunities.`,
          suggestion,
        }));
      }
    });
    if (presentDomains.length < 4) {
      findings.push(finding({
        code: "domain_imbalance",
        section: "domain_balance",
        severity: "high",
        message: `Domain balance is thin (${presentDomains.length} domains detected).`,
        suggestion: "Spread invitations across motor, language, SEL, and creative domains.",
      }));
    }

    // Play-based
    if (!/play|invite|explore|discover|choice|open.?ended/i.test(body)) {
      findings.push(finding({
        code: "not_play_based",
        section: "play_based",
        severity: "high",
        message: "Kit language leans instructional rather than play-based.",
        suggestion: "Rewrite steps as invitations children can choose, repeat, and adapt.",
      }));
    }

    // Outdoor / indoor
    let missingOutdoor = 0;
    let missingIndoor = 0;
    let missingObs = 0;
    let missingTips = 0;
    let realImages = 0;
    let imageBriefsOnly = 0;
    let missingRealSetup = 0;
    let missingRealExample = 0;
    list.forEach((act) => {
      const key = text(act.id || act.itemId);
      const patch = draftActs[key] || {};
      if (!text(patch.outdoorAlternatives || act.outdoorAlternatives || act.outdoorOption) && !/outdoor|sidewalk|garden|yard/i.test(body)) {
        missingOutdoor += 1;
      }
      if (!text(patch.indoorAlternatives || act.indoorAlternatives || act.indoorAlternative)) missingIndoor += 1;
      if (!asArray(patch.observationPrompts).length && !text(act.observationOpportunities)) missingObs += 1;
      if (!asArray(patch.teacherTips).length) missingTips += 1;
      const setupUrl = text(patch.setupImageUrl || act.setupImageUrl || act.setupPhotoUrl);
      const exampleUrl = text(patch.exampleImageUrl || act.exampleImageUrl || act.examplePhotoUrl);
      const setupBrief = text(patch.imageBriefSetup);
      const exampleBrief = text(patch.imageBriefExample);
      if (setupUrl) realImages += 1;
      else {
        missingRealSetup += 1;
        if (setupBrief) imageBriefsOnly += 1;
      }
      if (exampleUrl) realImages += 1;
      else {
        missingRealExample += 1;
        if (exampleBrief) imageBriefsOnly += 1;
      }
    });
    if (!list.length) {
      findings.push(finding({
        code: "no_activities",
        section: "variety",
        severity: "blocking",
        blocking: true,
        message: "No activities found on this lesson.",
        suggestion: "Add weekday activities before publishing a Teaching Kit.",
      }));
    }
    if (missingOutdoor && !/outdoor/i.test(body)) {
      findings.push(finding({
        code: "missing_outdoor",
        section: "outdoor",
        severity: "medium",
        message: "Outdoor learning options are weak or missing.",
        suggestion: "Add a shaded outdoor version of one table invitation.",
      }));
    }
    if (missingIndoor) {
      findings.push(finding({
        code: "missing_indoor_backup",
        section: "indoor_backup",
        severity: "medium",
        message: `${missingIndoor} activit${missingIndoor === 1 ? "y" : "ies"} missing indoor backup options.`,
        suggestion: "Provide an indoor alternative for weather or space limits.",
      }));
    }

    // Family
    if (!(text(week.familyConnection) || text(plan?.familyConnection))) {
      findings.push(finding({
        code: "missing_family",
        section: "family",
        severity: "high",
        message: "Family connection is missing.",
        suggestion: "Add a short at-home talk prompt or simple family activity.",
      }));
    }

    // Teacher prep / toolkit
    const prep = text(week.teacherPreparation)
      || text(week.teacherToolkit?.teacherPreparation)
      || asArray(week.teacherToolkit?.prepChecklist).join(" ");
    if (wordCount(prep) < 8) {
      findings.push(finding({
        code: "weak_teacher_prep",
        section: "teacher_prep",
        severity: "high",
        message: "Teacher preparation is weak or missing.",
        suggestion: "List setup steps, materials staging, and one observation focus.",
      }));
    }
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : (plan?.teachingKit?.teacherToolkit || {});
    const toolkitScore = (
      (text(toolkit.teacherPreparation) || text(week.teacherPreparation) ? 1 : 0)
      + (asArray(toolkit.teacherTips || toolkit.tips).length ? 1 : 0)
      + (asArray(toolkit.setupCleanupShortcuts).length ? 1 : 0)
      + (asArray(toolkit.observationPrompts).length || asArray(toolkit.observationFocus).length ? 1 : 0)
      + (asArray(toolkit.documentationPrompts).length ? 1 : 0)
      + (text(toolkit.mixedAgeAdaptations) ? 1 : 0)
      + (text(toolkit.extraSupportAdaptations || toolkit.extraSupport) ? 1 : 0)
      + (text(toolkit.challengeExtensions || toolkit.extensions) ? 1 : 0)
      + (text(toolkit.safetyInclusionNotes || toolkit.safetyNotes) ? 1 : 0)
      + (text(toolkit.endOfWeekReflection) ? 1 : 0)
      + (text(toolkit.familyConnection) || text(week.familyConnection) || text(plan?.familyConnection) ? 1 : 0)
      + (asArray(toolkit.materialSubstitutions || toolkit.substitutions).length ? 1 : 0)
    );
    if (toolkitScore < 6) {
      findings.push(finding({
        code: "incomplete_toolkit",
        section: "toolkit",
        severity: "blocking",
        blocking: true,
        message: `Teacher Toolkit is incomplete (${toolkitScore}/12 structured areas). Thin prep notes alone are not enough.`,
        suggestion: "Add preparation, tips, substitutions, adaptations, observation/documentation prompts, safety/inclusion, and end-of-week reflection.",
        navigateTo: "week:toolkit",
      }));
    }
    if (missingTips) {
      findings.push(finding({
        code: "missing_tips",
        section: "teacher_prep",
        severity: "medium",
        message: `${missingTips} activit${missingTips === 1 ? "y" : "ies"} missing teacher tips.`,
        suggestion: "Add one practical tip per activity (materials sub, grouping, or language).",
      }));
    }

    // Observations
    if (missingObs) {
      findings.push(finding({
        code: "missing_observations",
        section: "observations",
        severity: "high",
        message: `${missingObs} activit${missingObs === 1 ? "y" : "ies"} missing observation opportunities.`,
        suggestion: "Add prompts like “Does the child use a theme word / try a new action / invite a peer?”",
      }));
    }

    // Vocabulary quality
    const vocab = text(plan?.vocabularyWords) || asArray(week.vocabCards).map((c) => text(c?.title || c)).join(", ");
    if (!vocab) {
      findings.push(finding({
        code: "missing_vocabulary",
        section: "vocabulary",
        severity: "high",
        message: "Vocabulary is missing.",
        suggestion: "Add 4–8 theme words children can use in play.",
      }));
    } else if (vocab.split(/[,·\n]/).map((w) => w.trim()).filter(Boolean).length < 3) {
      findings.push(finding({
        code: "thin_vocabulary",
        section: "vocabulary",
        severity: "medium",
        message: "Vocabulary list is thin.",
        suggestion: "Expand to a small set of useful, speakable theme words.",
      }));
    }

    // Books / songs / printables / images — title-only / idea-only / brief-only never count as complete.
    const bookEntries = asArray(week.books).length ? asArray(week.books) : asArray(plan?.books);
    const songEntries = asArray(week.songs).length ? asArray(week.songs) : asArray(plan?.songs);
    const enrichApi = loadEnrichment();
    const completeBooks = bookEntries.filter((book) => (
      enrichApi?.bookRecordComplete ? enrichApi.bookRecordComplete(book) : (text(book?.title) && text(book?.author)
        && (asArray(book?.afterReadingQuestions || book?.questions || book?.readAloudQuestions).length
          || asArray(book?.beforeReadingQuestions).length))
    ));
    const completeSongs = songEntries.filter((song) => (
      enrichApi?.songRecordComplete ? enrichApi.songRecordComplete(song) : (text(song?.title)
        && text(song?.rightsStatus || song?.copyrightStatus)
        && (text(song?.motions) || text(song?.teacherDirections)))
    ));
    const linkedPrintables = asArray(plan?.resourceIds).length
      || asArray(week.printableIds).length
      || (week.linkedMasterResources && Object.keys(week.linkedMasterResources).length);
    const printableIdeasOnly = !linkedPrintables && (
      asArray(week.printableIdeas).length || asArray(week.printablePacks).length
    );

    if (!bookEntries.length) {
      findings.push(finding({
        code: "missing_books",
        section: "books",
        severity: "blocking",
        blocking: true,
        message: "Books are missing.",
        suggestion: "Add 1–3 age-fit books with why-it-fits plus before/during/after prompts (no copied book text).",
        navigateTo: "week:books",
      }));
    } else if (completeBooks.length < bookEntries.length) {
      findings.push(finding({
        code: "incomplete_books",
        section: "books",
        severity: "blocking",
        blocking: true,
        message: `${bookEntries.length - completeBooks.length} book(s) are title/author-only and missing discussion guides.`,
        suggestion: "Require why-it-fits, before/during/after questions, vocabulary connection, and a substitute title.",
        navigateTo: "week:books",
      }));
    }
    if (!songEntries.length) {
      findings.push(finding({
        code: "missing_songs",
        section: "songs",
        severity: "blocking",
        blocking: true,
        message: "Songs are missing.",
        suggestion: "Add songs with rights status, motions, and teaching directions. Lyrics only when legally allowed.",
        navigateTo: "week:songs",
      }));
    } else if (completeSongs.length < songEntries.length) {
      findings.push(finding({
        code: "incomplete_songs",
        section: "songs",
        severity: "blocking",
        blocking: true,
        message: `${songEntries.length - completeSongs.length} song(s) are title-only or missing rights/teaching metadata.`,
        suggestion: "Require copyright classification, motions, teaching directions, weekday, and age adaptation.",
        navigateTo: "week:songs",
      }));
    }
    if (!linkedPrintables) {
      findings.push(finding({
        code: "missing_printables",
        section: "printables",
        severity: "blocking",
        blocking: true,
        message: printableIdeasOnly
          ? "Printable ideas exist, but no actual printable file/resource is linked."
          : "Printables are missing — ideas alone never count as print-ready.",
        suggestion: "Link a real printable resource (file or generated pack) with preview and print access.",
        navigateTo: "week:printables",
      }));
    }
    if (list.length && (missingRealSetup > 0 || missingRealExample > 0)) {
      findings.push(finding({
        code: "missing_example_images",
        section: "example_images",
        severity: "blocking",
        blocking: true,
        message: `${missingRealSetup} setup photo(s) and ${missingRealExample} finished-example photo(s) still missing as real images.`,
        suggestion: "Upload or generate actual images with caption + alt text. Image briefs do not count as photos.",
        navigateTo: "activities:images",
      }));
    }
    if (imageBriefsOnly > 0) {
      findings.push(finding({
        code: "image_brief_not_image",
        section: "example_images",
        severity: "blocking",
        blocking: true,
        message: `${imageBriefsOnly} image brief(s) are present but do not count as setup/finished photos.`,
        suggestion: "Convert briefs into reviewed, loadable images before Publish Ready.",
        navigateTo: "activities:images",
      }));
    }

    // Weekday focus — "Theme focus coming soon" is a hard blocker.
    const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const placeholderDays = [];
    const missingFocusDays = [];
    weekdays.forEach((day) => {
      const dayPlan = plan?.dailyPlans?.[day] || {};
      const focus = text(dayPlan.theme || dayPlan.focus || dayPlan.objectives || week?.dailyFocus?.[day]);
      if (!focus) missingFocusDays.push(day);
      else if (/coming soon|theme focus coming soon|placeholder|tbd|todo/i.test(focus)) placeholderDays.push(day);
    });
    if (missingFocusDays.length || placeholderDays.length) {
      findings.push(finding({
        code: "missing_weekday_focus",
        section: "weekly_plan",
        severity: "blocking",
        blocking: true,
        message: `Weekday focus incomplete${missingFocusDays.length ? ` (missing: ${missingFocusDays.join(", ")})` : ""}${placeholderDays.length ? ` (placeholder: ${placeholderDays.join(", ")})` : ""}.`,
        suggestion: "Replace “Theme focus coming soon” with a unique daily focus and teacher-facing details for each weekday.",
        navigateTo: "week:weekly_plan",
      }));
    }
    if (/coming soon|lorem ipsum|\[insert|\btbd\b|\btodo\b/i.test(body)) {
      findings.push(finding({
        code: "placeholder_text",
        section: "completeness",
        severity: "blocking",
        blocking: true,
        message: "Placeholder or “coming soon” text is still present in the kit.",
        suggestion: "Remove placeholders before Publish Ready.",
      }));
    }

    // Variety / duplicates / safety / realism
    const titles = list.map((a) => text(a.title).toLowerCase()).filter(Boolean);
    const repeats = titles.filter((t, i) => titles.indexOf(t) !== i);
    if (repeats.length) {
      findings.push(finding({
        code: "repeated_activities",
        section: "duplicates",
        severity: "medium",
        message: `Repeated activity titles: ${[...new Set(repeats)].join(", ")}`,
        suggestion: "Rename or differentiate activities so the week feels varied.",
      }));
    }
    const reusable = loadReusable();
    let similarPairs = 0;
    for (let i = 0; i < titles.length; i += 1) {
      for (let j = i + 1; j < titles.length; j += 1) {
        if (reusable?.jaccard && reusable.jaccard(titles[i], titles[j]) >= 0.7) similarPairs += 1;
      }
    }
    if (similarPairs) {
      findings.push(finding({
        code: "similar_activities",
        section: "duplicates",
        severity: "medium",
        message: `${similarPairs} activity pair(s) look too similar.`,
        suggestion: "Vary materials, grouping, or learning goal so activities don’t feel repetitive.",
      }));
    }
    if (list.length && new Set(titles.map((t) => t.split(" ")[0])).size < Math.min(3, list.length)) {
      findings.push(finding({
        code: "low_variety",
        section: "variety",
        severity: "medium",
        message: "Activity variety looks limited across the week.",
        suggestion: "Mix table, movement, sensory, and dramatic-play invitations.",
      }));
    }
    if (/choking hazard|hot glue|glass|knife|bleach|unsupervised outdoors/i.test(body)
      || (band === "infant" && /small bead|marble|coin|button/i.test(body))) {
      findings.push(finding({
        code: "safety_concern",
        section: "safety",
        severity: "blocking",
        blocking: true,
        message: "Possible safety concern for the selected age group.",
        suggestion: "Remove or substitute hazardous materials; note supervision requirements.",
      }));
    }
    if (/specialty store|must buy|expensive|laminator required|color printer only/i.test(body)) {
      findings.push(finding({
        code: "unrealistic_materials",
        section: "realistic",
        severity: "medium",
        message: "Materials may be unrealistic for typical classrooms.",
        suggestion: "Prefer ordinary, reusable, low-cost classroom materials and substitutions.",
      }));
    }
    if (!text(week.weeklyMaterials || plan?.weeklyMaterials) && list.length) {
      findings.push(finding({
        code: "missing_materials",
        section: "realistic",
        severity: "high",
        message: "Materials checklist is missing.",
        suggestion: "List ordinary materials teachers can stage in 10 minutes.",
      }));
    }

    // Daily materials (weekday focus already enforced above with placeholder hard blockers).
    const dailyPlans = plan?.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
    const missingDailyMaterials = weekdays.filter((day) => {
      const dayPlan = dailyPlans[day] || {};
      return !text(dayPlan.materials);
    });
    if (missingDailyMaterials.length >= 3 && list.length) {
      findings.push(finding({
        code: "missing_daily_materials",
        section: "materials",
        severity: "medium",
        message: `Daily materials missing for ${missingDailyMaterials.length} weekdays.`,
        suggestion: "List Monday–Friday materials separately from the master week list.",
      }));
    }

    // Duplicate materials (safe normalize — report only)
    try {
      const materialsApi = (typeof require === "function" ? require("./teaching-kit-materials.js") : null)
        || (root && root.LLHTeachingKitMaterials);
      if (materialsApi?.normalizeMaterialInventory) {
        const allLabels = [
          ...String(week.weeklyMaterials || plan?.weeklyMaterials || "").split(/[\n,;]+/),
          ...weekdays.flatMap((day) => String(dailyPlans[day]?.materials || "").split(/[\n,;]+/)),
          ...list.flatMap((act) => String(act.materials || "").split(/[\n,;]+/)),
        ].map((item) => text(item)).filter(Boolean);
        const inv = materialsApi.normalizeMaterialInventory(allLabels, "quality");
        if (inv.duplicatesRemoved >= 3) {
          findings.push(finding({
            code: "duplicate_materials",
            section: "materials",
            severity: "medium",
            message: `${inv.duplicatesRemoved} duplicate or near-duplicate material labels detected.`,
            suggestion: "Normalize casing and synonyms (e.g. Hay/hay, Basket/baskets) without deleting distinct supplies.",
          }));
        }
      }
    } catch (_materialsError) {
      /* optional helper */
    }

    // Activity instructions / adaptations / images / safety
    let missingInstructions = 0;
    let missingAdaptations = 0;
    let missingImageAlts = 0;
    let missingObsActivity = 0;
    list.forEach((act) => {
      if (!text(act.steps) && !text(act.setup)) missingInstructions += 1;
      if (!text(act.adaptations) && !text(act.extraSupport) && !text(act.mixedAgeAdaptations)) missingAdaptations += 1;
      if (!text(act.observationOpportunities) && !text(act.observationIdeas) && !asArray(act.observationIdeas).length) {
        missingObsActivity += 1;
      }
      const hasImg = text(act.exampleImageUrl || act.examplePhotoUrl || act.setupImageUrl || act.setupPhotoUrl);
      const hasAlt = text(act.exampleImageAlt || act.exampleAlt || act.setupImageAlt || act.setupAlt);
      if (hasImg && !hasAlt) missingImageAlts += 1;
      const draftAct = draftActs[act.id] || {};
      const draftImg = text(draftAct.exampleImageUrl || draftAct.setupImageUrl);
      const draftAlt = text(draftAct.exampleImageAlt || draftAct.setupImageAlt);
      if (draftImg && !draftAlt) missingImageAlts += 1;
    });
    if (missingInstructions) {
      findings.push(finding({
        code: "missing_activity_instructions",
        section: "activities",
        severity: "high",
        message: `${missingInstructions} activit${missingInstructions === 1 ? "y" : "ies"} missing setup/steps.`,
        suggestion: "Add classroom-ready preparation and step-by-step directions for each activity.",
      }));
    }
    if (missingAdaptations && list.length >= 2) {
      findings.push(finding({
        code: "missing_adaptations",
        section: "activities",
        severity: "medium",
        message: `${missingAdaptations} activit${missingAdaptations === 1 ? "y" : "ies"} missing support/challenge/mixed-age adaptations.`,
        suggestion: "Add differentiation that is specific to the activity — avoid repeated boilerplate.",
      }));
    }
    if (missingImageAlts) {
      findings.push(finding({
        code: "missing_image_alt",
        section: "example_images",
        severity: "medium",
        message: `${missingImageAlts} image(s) missing useful alt text.`,
        suggestion: "Describe what teachers should see in the setup or finished example.",
      }));
    }

    // Boilerplate / generic prompts / raw labels / placeholders
    const genericPromptMatches = body.match(/can you show me or tell me about/gi) || [];
    if (genericPromptMatches.length >= 3) {
      findings.push(finding({
        code: "generic_prompts",
        section: "vocabulary",
        severity: "medium",
        message: `Repeated generic prompt wording appears ${genericPromptMatches.length} times.`,
        suggestion: "Vary prompts (What do you notice? How are these alike? What sound might it make?).",
      }));
    }
    const boilerplateSnippets = [
      /offer extra support as needed/gi,
      /supervise children closely at all times/gi,
      /adapt for mixed ages as appropriate/gi,
      /clean up materials when finished/gi,
    ];
    let boilerplateHits = 0;
    boilerplateSnippets.forEach((re) => {
      const hits = body.match(re) || [];
      if (hits.length >= 2) boilerplateHits += hits.length;
    });
    if (boilerplateHits >= 4) {
      findings.push(finding({
        code: "repeated_boilerplate",
        section: "activities",
        severity: "high",
        message: "Repeated boilerplate adaptation/safety language appears across activities.",
        suggestion: "Replace generic paragraphs with activity-specific guidance (materials, supervision, and next steps).",
      }));
    }
    if (/circle_time|fine_motor|gross_motor|process_art|invitation_to_play/i.test(body)) {
      findings.push(finding({
        code: "raw_internal_labels",
        section: "activities",
        severity: "medium",
        message: "Raw internal category labels (e.g. circle_time) appear in teacher-facing text.",
        suggestion: "Use customer-facing labels such as “Circle Time”.",
      }));
    }
    // Placeholder text already hard-blocked above (stricter #540 wording). Keep copyright + safety gates.
    if (/©|all rights reserved|disney|peppa|frozen lyrics|copyrighted lyrics/i.test(body)) {
      findings.push(finding({
        code: "copyright_concern",
        section: "songs",
        severity: "blocking",
        blocking: true,
        message: "Possible copyrighted lyrics or protected media references detected.",
        suggestion: "Store full lyrics only for original or verified public-domain/traditional songs.",
      }));
    }

    // Latex-free guidance for milking / glove activities
    if (/rubber glove|pinhole|milk(ing)? (cow|station|activity)/i.test(body)
      && !/latex-free|nitrile|vinyl/i.test(body)) {
      findings.push(finding({
        code: "missing_safety_guidance",
        section: "safety",
        severity: "blocking",
        blocking: true,
        message: "Milking / glove activity needs latex-free materials, sanitation, and supervision notes.",
        suggestion: "Require a latex-free glove or safer equivalent, sanitize before/after, and note close supervision.",
      }));
    }

    // Print sections with no resources (when enrichment claims printables)
    if (asArray(week.printableIdeas).length && !asArray(plan?.resourceIds).length) {
      findings.push(finding({
        code: "empty_print_section",
        section: "printables",
        severity: "medium",
        message: "Printable ideas are listed but no printable resources are linked.",
        suggestion: "Link real printables or remove empty print claims before approval.",
      }));
    }

    // Excessive setup / unrealistic daily scheduling
    if (/90 minutes? prep|2 hours? prep|all morning setup/i.test(body)) {
      findings.push(finding({
        code: "excessive_setup",
        section: "realistic",
        severity: "medium",
        message: "Setup time may be unrealistic for a typical childcare morning.",
        suggestion: "Keep Monday prep near 10–20 minutes with shortcuts and substitutions.",
      }));
    }

    // Apply ignored statuses before and after elevation so newly added gate
    // findings (e.g. completeness_too_low) respect qualityReviewIgnored.
    findings.forEach((f) => {
      if (ignored.has(f.code) || ignored.has(f.id)) f.status = "ignored";
    });
    elevateSeriousGapsForPublish(findings, completionPercent, ignored);
    findings.forEach((f) => {
      if (ignored.has(f.code) || ignored.has(f.id)) f.status = "ignored";
    });

    const sectionScores = SECTIONS.map((section) => {
      const score = scoreFromFindings(findings, section.id);
      let status = "strong";
      if (score < 50) status = "weak";
      else if (score < 80) status = "needs_work";
      return { id: section.id, label: section.label, score, status };
    });

    const activeFindings = findings.filter((f) => f.status !== "ignored");
    const missing = activeFindings
      .filter((f) => /^missing_|thin_|weak_|incomplete_|no_|completeness_/.test(f.code))
      .map((f) => f.message);
    const suggestedImprovements = activeFindings
      .filter((f) => text(f.suggestion))
      .map((f) => ({ code: f.code, section: f.section, suggestion: f.suggestion, severity: f.severity }));
    const strengths = sectionScores
      .filter((s) => s.score >= 90)
      .map((s) => s.label)
      .slice(0, 10);
    if (!strengths.length && presentDomains.length) {
      presentDomains.slice(0, 4).forEach((d) => {
        strengths.push(`${d.replace(/_/g, " ")} opportunities present`);
      });
    }

    let premiumReadinessPercent = completionPercent;
    try {
      if (enrich?.computeReadinessScores) {
        premiumReadinessPercent = Number(
          enrich.computeReadinessScores(plan, list, draft).premiumReadinessPercent,
        ) || completionPercent;
      }
    } catch (_error) {
      premiumReadinessPercent = completionPercent;
    }

    return finalizePublishGate({
      planId: text(plan?.id),
      title: text(plan?.title),
      age: text(plan?.age),
      ageBand: band,
      completionPercent,
      enrichmentFillPercent: completionPercent,
      premiumReadinessPercent,
      contentCompletionPercent: contentCompletionPercent || completionPercent,
      weekdayCoverageLabel,
      contentCompletionLabel: weekdayCoverageLabel
        ? `${weekdayCoverageLabel} · structural ${completionPercent}% · premium ${premiumReadinessPercent}%`
        : `Structural ${completionPercent}% · premium readiness ${premiumReadinessPercent}%`,
      sectionScores,
      strengths,
      missing,
      suggestedImprovements,
      findings,
      checkedAt: new Date().toISOString(),
    });
  }

  /**
   * Draft-only AI improvement suggestion for one finding — does not apply itself.
   */
  function buildImprovementSuggestion(findingInput, plan, enrichmentDraft) {
    const f = findingInput && typeof findingInput === "object" ? findingInput : {};
    const theme = text(plan?.theme || plan?.title) || "this theme";
    const age = text(plan?.age) || "preschool";
    const suggestion = text(f.suggestion) || "Improve this section with play-based classroom language.";
    const proposed = [
      `Curriculum specialist revision for ${f.sectionLabel || f.section || "this section"}:`,
      suggestion,
      `Keep it realistic for ${age}, tied to ${theme}, and review before accepting into the draft.`,
    ].join("\n\n");
    return {
      id: `quality-improve-${text(f.code) || "item"}-${Date.now().toString(36)}`,
      source: "quality_review",
      category: "teacher_tips",
      field: f.section === "family" ? "familyConnection"
        : (f.section === "teacher_prep" || f.section === "toolkit" ? "teacherPreparation"
          : (f.section === "objectives" ? "objectives"
            : (f.section === "vocabulary" ? "vocabCards"
              : (f.section === "observations" ? "observationPrompts" : "teacherTips")))),
      fieldLabel: f.sectionLabel || "Quality improvement",
      scope: ["observations", "fine_motor", "gross_motor", "sensory"].includes(f.section) ? "activity" : "week",
      activityKey: "",
      currentValue: "(from quality review)",
      proposedText: proposed,
      proposedValue: proposed,
      decision: "pending",
      selected: true,
      findingCode: f.code,
      autoSaved: false,
      autoPublished: false,
    };
  }

  function applyIssueDecision(report, { findingId, code, decision }) {
    const next = JSON.parse(JSON.stringify(report || {}));
    const findings = asArray(next.findings);
    findings.forEach((f) => {
      if ((findingId && f.id === findingId) || (code && f.code === code)) {
        f.status = decision === "ignore" ? "ignored"
          : (decision === "improved" ? "improved" : "pending");
      }
    });
    const ignoredCodes = findings.filter((f) => f.status === "ignored").map((f) => f.code);
    const gated = finalizePublishGate({
      ...next,
      findings,
      completionPercent: Number(next.completionPercent) || 0,
    });
    gated.ignoredCodes = ignoredCodes;
    return gated;
  }

  /**
   * Library Health Dashboard — quality + coverage + analytics (labeled).
   */
  function buildLibraryHealthDashboard(curriculum = {}, usageByPlanId = {}, options = {}) {
    const plans = asArray(curriculum.lessonPlans);
    const activities = asArray(curriculum.activities);
    const director = loadDirector();
    const enrich = loadEnrichment();
    const analyticsAvailable = options.analyticsAvailable === true
      || Object.keys(usageByPlanId || {}).some((id) => (usageByPlanId[id]?.views || 0) > 0);

    const rows = plans.map((plan) => {
      const planActs = activities.filter((a) => a.lessonPlanId === plan.id);
      const report = buildQualityReport(plan, planActs, plan.enrichmentDraft || null);
      const usage = usageByPlanId[plan.id] || {};
      let completion = report.overallScore;
      if (enrich?.computeCompletionPercent) {
        try {
          completion = Number(enrich.computeCompletionPercent(plan, planActs, plan.enrichmentDraft)) || completion;
        } catch (_e) { /* keep */ }
      }
      return {
        id: plan.id,
        title: text(plan.title),
        theme: text(plan.theme),
        age: text(plan.age),
        qualityScore: report.overallScore,
        qualityLabel: report.overallLabel,
        completionPercent: completion,
        needsReview: report.blocksPublish
          || report.publishReadiness === PUBLISH_READINESS.NEEDS_REVIEW
          || report.overallScore < 75,
        publishReadiness: report.publishReadiness || (report.blocksPublish ? "blocked" : "needs_review"),
        missingBooks: report.findings.some((f) => f.code === "missing_books" && f.status !== "ignored"),
        missingSongs: report.findings.some((f) => f.code === "missing_songs" && f.status !== "ignored"),
        missingPrintables: report.findings.some((f) => f.code === "missing_printables" && f.status !== "ignored"),
        missingExampleImages: report.findings.some((f) => f.code === "missing_example_images" && f.status !== "ignored"),
        missingToolkit: report.findings.some((f) => (f.code === "incomplete_toolkit" || f.code === "weak_teacher_prep") && f.status !== "ignored"),
        duplicateResources: report.findings.some((f) => (f.code === "repeated_activities" || f.code === "similar_activities") && f.status !== "ignored"),
        views: Number(usage.views) || 0,
        assigns: Number(usage.assigns) || 0,
        downloads: Number(usage.downloads) || 0,
        proUpgrades: Number(usage.proUpgrades) || 0,
        blockingCount: report.blockingIssues.length,
      };
    });

    const coverage = director?.buildCoverageDashboard
      ? director.buildCoverageDashboard(curriculum, usageByPlanId)
      : null;
    const business = director?.buildBusinessInsights
      ? director.buildBusinessInsights(usageByPlanId, options.searchGaps || [], curriculum)
      : null;

    const dataQuality = {
      analyticsAvailable,
      analyticsLabel: analyticsAvailable ? "real analytics" : "estimated / unavailable — no usage events in range",
      qualityMethod: "heuristic curriculum specialist rubric (fixture-safe)",
      searchGapsLabel: asArray(options.searchGaps).length
        ? "real search no-result signals"
        : "unavailable — no search gap data",
    };

    return {
      summary: {
        lessonCount: rows.length,
        needingReview: rows.filter((r) => r.needsReview).length,
        averageQuality: rows.length
          ? Math.round(rows.reduce((s, r) => s + r.qualityScore, 0) / rows.length)
          : 0,
        blockingLessons: rows.filter((r) => r.blockingCount > 0).length,
      },
      highestQuality: [...rows].sort((a, b) => (
        (b.qualityScore - a.qualityScore)
        || ((a.blockingCount || 0) - (b.blockingCount || 0))
      )).slice(0, 15),
      lowestQuality: [...rows].sort((a, b) => (
        (a.qualityScore - b.qualityScore)
        || ((b.blockingCount || 0) - (a.blockingCount || 0))
      )).slice(0, 15),
      needingReview: rows.filter((r) => r.needsReview).slice(0, 40),
      missingBooks: rows.filter((r) => r.missingBooks).slice(0, 40),
      missingSongs: rows.filter((r) => r.missingSongs).slice(0, 40),
      missingPrintables: rows.filter((r) => r.missingPrintables).slice(0, 40),
      missingExampleImages: rows.filter((r) => r.missingExampleImages).slice(0, 40),
      missingToolkit: rows.filter((r) => r.missingToolkit).slice(0, 40),
      duplicateResources: rows.filter((r) => r.duplicateResources).slice(0, 40),
      mostViewed: [...rows].sort((a, b) => b.views - a.views).slice(0, 15),
      mostAssigned: [...rows].sort((a, b) => b.assigns - a.assigns).slice(0, 15),
      mostDownloadedPrintables: [...rows].sort((a, b) => b.downloads - a.downloads).slice(0, 15),
      drivingProUpgrades: [...rows].sort((a, b) => b.proUpgrades - a.proUpgrades).filter((r) => r.proUpgrades > 0).slice(0, 15),
      searchedButMissing: asArray(options.searchGaps).slice(0, 20),
      coverageSummary: coverage?.summary || null,
      businessBuildNext: business?.buildNext || [],
      dataQuality,
      rows,
      builtAt: new Date().toISOString(),
    };
  }

  return {
    SECTIONS,
    SERIOUS_GAP_CODES,
    PUBLISH_READINESS,
    publishReadinessLabel,
    elevateSeriousGapsForPublish,
    finalizePublishGate,
    buildQualityReport,
    buildImprovementSuggestion,
    applyIssueDecision,
    buildLibraryHealthDashboard,
    ageBand,
  };
});
