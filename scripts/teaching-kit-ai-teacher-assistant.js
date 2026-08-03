/**
 * AI Teacher Assistant — experienced preschool teacher workflows.
 * Make This Better · Teacher Chat · Toolkit builders · Quality Review ·
 * Learn From Me · Example images · Printable packs.
 * Everything stays draft-only until the admin accepts. Never overwrites published lessons.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitAiTeacherAssistant = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function loadReusable() {
    if (root && root.LLHTeachingKitReusableLibrary) return root.LLHTeachingKitReusableLibrary;
    if (typeof module === "object" && typeof require === "function") {
      try { return require("./teaching-kit-reusable-library.js"); } catch (_e) { return null; }
    }
    return null;
  }

  const IMPROVE_ACTIONS = Object.freeze([
    { id: "improve", label: "Improve" },
    { id: "shorten", label: "Shorten" },
    { id: "expand", label: "Expand" },
    { id: "more_play_based", label: "Make more play based" },
    { id: "easier", label: "Make easier" },
    { id: "more_challenging", label: "Make more challenging" },
    { id: "younger", label: "Make for younger children" },
    { id: "older", label: "Make for older children" },
    { id: "add_stem", label: "Add STEM" },
    { id: "add_sensory", label: "Add sensory" },
    { id: "add_literacy", label: "Add literacy" },
    { id: "add_math", label: "Add math" },
    { id: "add_gross_motor", label: "Add gross motor" },
    { id: "add_fine_motor", label: "Add fine motor" },
    { id: "add_outdoor", label: "Add outdoor play" },
    { id: "add_messy", label: "Add messy play" },
    { id: "add_loose_parts", label: "Add loose parts" },
    { id: "add_process_art", label: "Add process art" },
  ]);

  const TOOLKIT_BUILDERS = Object.freeze([
    { id: "vocabulary_cards", label: "Vocabulary cards", field: "vocabCards" },
    { id: "parent_note", label: "Parent note", field: "familyConnection" },
    { id: "family_activity", label: "Family activity", field: "familyConnection" },
    { id: "bulletin_board", label: "Bulletin board ideas", field: "printableIdeas" },
    { id: "classroom_setup", label: "Classroom setup", field: "teacherPreparation" },
    { id: "small_group", label: "Small group ideas", field: "teacherTips" },
    { id: "circle_time", label: "Circle time script", field: "weeklyOverview" },
    { id: "observation_examples", label: "Observation examples", field: "observationPrompts" },
    { id: "documentation", label: "Documentation examples", field: "toolkitObservation" },
    { id: "assessment", label: "Assessment ideas", field: "toolkitObservation" },
  ]);

  const PRINTABLE_PACK_TYPES = Object.freeze([
    "matching_cards",
    "memory_cards",
    "letter_cards",
    "number_cards",
    "pattern_cards",
    "cutting_practice",
    "tracing",
    "posters",
    "labels",
    "classroom_signs",
  ]);

  const IMAGE_KINDS = Object.freeze([
    "finished_craft",
    "setup_photo",
    "invitation_to_play",
    "sensory_bin",
    "classroom_example",
  ]);

  function emptyAssistantState() {
    return {
      reusableLibrary: { items: [], updatedAt: "" },
      stylePreferences: {
        formatting: "",
        wording: "",
        lessonStyle: "",
        activityStyle: "",
        observationStyle: "",
        teacherVoice: "",
        acceptedEditSamples: [],
        updatedAt: "",
      },
      updatedAt: "",
    };
  }

  function normalizeAssistantState(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const reusable = loadReusable();
    const library = reusable?.normalizeLibrary
      ? reusable.normalizeLibrary(input.reusableLibrary || input.library)
      : { items: [], updatedAt: "" };
    const style = input.stylePreferences && typeof input.stylePreferences === "object"
      ? input.stylePreferences
      : {};
    return {
      reusableLibrary: library,
      stylePreferences: {
        formatting: text(style.formatting).slice(0, 800),
        wording: text(style.wording).slice(0, 800),
        lessonStyle: text(style.lessonStyle).slice(0, 800),
        activityStyle: text(style.activityStyle).slice(0, 800),
        observationStyle: text(style.observationStyle).slice(0, 800),
        teacherVoice: text(style.teacherVoice).slice(0, 800),
        acceptedEditSamples: asArray(style.acceptedEditSamples).slice(0, 40).map((sample) => ({
          field: text(sample.field).slice(0, 80),
          before: text(sample.before).slice(0, 600),
          after: text(sample.after).slice(0, 600),
          at: text(sample.at) || "",
        })),
        updatedAt: text(style.updatedAt),
      },
      updatedAt: text(input.updatedAt),
    };
  }

  function applyStyleHints(output, stylePreferences) {
    const style = stylePreferences || {};
    const bits = [
      style.teacherVoice && `Teacher voice: ${style.teacherVoice}`,
      style.wording && `Wording preference: ${style.wording}`,
      style.formatting && `Formatting: ${style.formatting}`,
      style.activityStyle && `Activity style: ${style.activityStyle}`,
      style.observationStyle && `Observation style: ${style.observationStyle}`,
      style.lessonStyle && `Lesson style: ${style.lessonStyle}`,
    ].filter(Boolean);
    if (!bits.length) return output;
    // Soft preference note only — never overwrites published content.
    return `${output}\n\n— Written in your preferred classroom style.`;
  }

  function transformText(sourceText, actionId, context = {}) {
    const source = text(sourceText) || text(context.fallback) || "Invite children to explore with hands-on materials.";
    const theme = text(context.theme) || "this theme";
    const age = text(context.age) || "preschool";
    const action = text(actionId) || "improve";
    let next = source;

    switch (action) {
      case "shorten":
        next = source.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
        if (next.length > 180) next = `${next.slice(0, 177)}…`;
        break;
      case "expand":
        next = `${source}\n\nOffer a second turn with a new material, then invite children to share one discovery with a friend.`;
        break;
      case "more_play_based":
        next = `${source}\n\nKeep it playful: children choose, try, repeat, and laugh — teacher scaffolds with curiosity questions.`;
        break;
      case "easier":
        next = `${source}\n\nSimplify: fewer steps, larger pieces, and one clear success path for emerging skills.`;
        break;
      case "more_challenging":
        next = `${source}\n\nStretch: add a compare/contrast challenge or a “teach a friend” step.`;
        break;
      case "younger":
        next = `For younger ${age} learners: ${source}\n\nShorten the sequence, model hand-over-hand as needed, and celebrate attempts.`;
        break;
      case "older":
        next = `For older ${age} learners: ${source}\n\nInvite planning aloud, peer coaching, and a simple documentation note.`;
        break;
      case "add_stem":
        next = `${source}\n\nSTEM spark: ask “What happens if…?” and test one change with ${theme} materials.`;
        break;
      case "add_sensory":
        next = `${source}\n\nSensory layer: add a texture tray (smooth/rough/soft) related to ${theme}.`;
        break;
      case "add_literacy":
        next = `${source}\n\nLiteracy: introduce 2–3 theme words on cards and invite children to use them while playing.`;
        break;
      case "add_math":
        next = `${source}\n\nMath: count, sort, or make a simple pattern with the materials.`;
        break;
      case "add_gross_motor":
        next = `${source}\n\nGross motor: add a movement path (march, tip-toe, stretch) before the table work.`;
        break;
      case "add_fine_motor":
        next = `${source}\n\nFine motor: pinch, place, twist, or thread one detail with tongs or fingers.`;
        break;
      case "add_outdoor":
        next = `${source}\n\nOutdoor option: move the same invitation to a shaded sidewalk or grass edge.`;
        break;
      case "add_messy":
        next = `${source}\n\nMessy play: add water/soap foam or washable paint with a rinse tub nearby.`;
        break;
      case "add_loose_parts":
        next = `${source}\n\nLoose parts: offer lids, blocks, fabric scraps, and natural pieces for open building.`;
        break;
      case "add_process_art":
        next = `${source}\n\nProcess art: focus on exploring marks and textures — no required “finished look.”`;
        break;
      case "improve":
      default:
        next = `${source}\n\nTeacher tip: preview materials, model once, then step back and narrate children’s thinking.`;
        break;
    }

    return {
      action,
      actionLabel: (IMPROVE_ACTIONS.find((a) => a.id === action) || {}).label || action,
      currentValue: source,
      proposedText: applyStyleHints(next, context.stylePreferences),
      decision: "pending",
      selected: true,
      scope: context.scope || "activity",
      field: context.field || "teacherTips",
      fieldLabel: context.fieldLabel || "Improved draft",
      category: "make_this_better",
      activityKey: text(context.activityKey),
    };
  }

  function buildTeacherChatReply(message, context = {}) {
    const ask = text(message).toLowerCase();
    const theme = text(context.theme) || "the theme";
    const title = text(context.activityTitle) || "this activity";
    let reply = "";
    let draftPatch = null;

    if (/sensory/.test(ask)) {
      reply = `Try a ${theme} sensory tray: two textures, one scoop tool, and a rinse cloth. Keep language simple: “soft,” “bumpy,” “pour.”`;
      draftPatch = { field: "teacherTips", proposedText: reply, category: "teacher_tips" };
    } else if (/pom\s*pom|don't have|do not have|no /.test(ask)) {
      reply = `No problem — substitute with torn paper, cotton balls, bottle caps, or leaves. Same learning goal, ordinary materials.`;
      draftPatch = {
        field: "substitutions",
        proposedText: "No specialty prop → use paper bits, bottle caps, or natural loose parts",
        category: "substitutions",
        proposedValue: { need: "specialty prop", use: "paper bits, bottle caps, or natural loose parts" },
      };
    } else if (/10 minute|ten minute|short on time|only have/.test(ask)) {
      reply = `10-minute version of ${title}: 1) show once, 2) children try one action, 3) quick clean-up song. Skip extensions.`;
      draftPatch = { field: "steps", proposedText: reply, category: "steps" };
    } else if (/absent|half my class|small group|few children/.test(ask)) {
      reply = `With a smaller group, invite longer turns and peer coaching. Set one helper job (materials manager).`;
      draftPatch = { field: "teacherTips", proposedText: reply, category: "group_ideas" };
    } else if (/18|24|toddler|younger|infant/.test(ask)) {
      reply = `For 18–24 months: shorten steps, enlarge pieces, model hand-over-hand, and celebrate attempts over products.`;
      draftPatch = { field: "adaptations", proposedText: reply, category: "adaptations" };
    } else if (/easier|too hard|simplify/.test(ask)) {
      reply = `Make ${title} easier: one material choice, one action, and a clear “all done” basket.`;
      draftPatch = { field: "adaptations", proposedText: reply, category: "adaptations" };
    } else if (/extension|another extension/.test(ask)) {
      reply = `Extension: invite children to teach a friend one step, then draw/dictate what they noticed about ${theme}.`;
      draftPatch = { field: "extensions", proposedText: reply, category: "extensions" };
    } else {
      reply = `Here’s a classroom-ready idea for ${theme}: keep materials ordinary, model once, narrate play, and leave room for children’s choices. Tell me your constraint (time, materials, age) and I’ll tighten it.`;
      draftPatch = { field: "teacherTips", proposedText: reply, category: "teacher_tips" };
    }

    const suggestion = {
      id: `chat-${Date.now().toString(36)}`,
      category: draftPatch.category,
      field: draftPatch.field,
      fieldLabel: "Teacher chat draft",
      scope: text(context.activityKey) ? "activity" : "week",
      activityKey: text(context.activityKey),
      currentValue: text(context.currentValue) || "(empty)",
      proposedText: applyStyleHints(
        text(draftPatch.proposedText),
        context.stylePreferences,
      ),
      proposedValue: draftPatch.proposedValue || draftPatch.proposedText,
      decision: "pending",
      selected: true,
      source: "teacher_chat",
    };

    return {
      reply,
      suggestion,
      autoSaved: false,
      autoPublished: false,
    };
  }

  function buildToolkitItem(builderId, context = {}) {
    const builder = TOOLKIT_BUILDERS.find((b) => b.id === builderId) || TOOLKIT_BUILDERS[0];
    const theme = text(context.theme) || "our theme";
    const lesson = text(context.lessonTitle) || "this lesson";
    const templates = {
      vocabulary_cards: `${theme} · say it, show it, use it in play`,
      parent_note: `Family note: This week we explore ${theme}. Ask your child what they noticed and try one home talk prompt from ${lesson}.`,
      family_activity: `At home: find one object connected to ${theme}, describe it together, and bring a photo or story to share.`,
      bulletin_board: `Bulletin board: “Our ${theme} Discoveries” — photos, child quotes, and 3 vocabulary cards.`,
      classroom_setup: `Setup: stage ${theme} trays at child height, post picture labels, set observation clipboard near the main station.`,
      small_group: `Small group: 2–3 children rotate through a ${theme} invitation; one child leads a turn while others watch.`,
      circle_time: `Circle: Hello song → ${theme} picture talk → one movement → dismissal to centers.`,
      observation_examples: `Observation: Does the child use a ${theme} word, try a new action, or invite a peer?`,
      documentation: `Documentation: Capture one photo + one child quote about ${theme}; note the learning domain.`,
      assessment: `Assessment idea: Note emerging / developing / secure use of ${theme} vocabulary during play.`,
    };
    const proposed = applyStyleHints(templates[builder.id] || templates.vocabulary_cards, context.stylePreferences);
    return {
      id: `toolkit-${builder.id}-${Date.now().toString(36)}`,
      builderId: builder.id,
      category: builder.id === "vocabulary_cards" ? "vocab_cards"
        : (builder.id === "bulletin_board" ? "printable_ideas"
          : (builder.field === "familyConnection" ? "family_connection"
            : (builder.field === "observationPrompts" ? "observation_prompts"
              : (builder.field === "teacherTips" ? "teacher_tips"
                : (builder.field === "toolkitObservation" ? "toolkit_observation"
                  : (builder.field === "teacherPreparation" ? "teacher_preparation" : "weekly_overview")))))),
      field: builder.field,
      fieldLabel: builder.label,
      scope: ["teacherTips", "observationPrompts"].includes(builder.field) ? "activity" : "week",
      activityKey: text(context.activityKey),
      currentValue: text(context.currentValue) || "(empty)",
      proposedText: proposed,
      proposedValue: proposed,
      decision: "pending",
      selected: true,
      source: "toolkit_builder",
    };
  }

  function buildPrintablePack(context = {}) {
    const theme = text(context.theme) || "Theme";
    const cards = PRINTABLE_PACK_TYPES.map((type) => ({
      type,
      title: `${theme} ${type.replace(/_/g, " ")}`,
      editable: true,
      pages: type.includes("cards") ? 4 : 1,
      notes: "Ink-friendly outlines. Edit labels before printing. No copyrighted characters.",
      draftContent: `Editable ${type.replace(/_/g, " ")} for ${theme}. Simple black-line art, large targets, preschool-friendly.`,
    }));
    return {
      id: `print-pack-${Date.now().toString(36)}`,
      theme,
      generatedAt: new Date().toISOString(),
      cards,
      suggestion: {
        id: `printable-pack-${Date.now().toString(36)}`,
        category: "printable_ideas",
        field: "printableIdeas",
        fieldLabel: "Printable pack",
        scope: "week",
        activityKey: "",
        currentValue: "(empty)",
        proposedText: `Complete printable pack for ${theme}: ${PRINTABLE_PACK_TYPES.map((t) => t.replace(/_/g, " ")).join(", ")}. All pages editable.`,
        proposedValue: `Complete printable pack for ${theme}`,
        decision: "pending",
        selected: true,
        source: "printable_pack",
        printablePack: cards,
      },
    };
  }

  function buildExampleImageDraft(kind, context = {}) {
    const safeKind = IMAGE_KINDS.includes(kind) ? kind : "setup_photo";
    const theme = text(context.theme) || "classroom theme";
    const activity = text(context.activityTitle) || "activity";
    const label = safeKind.replace(/_/g, " ");
    const brief = `Classroom-achievable ${label} for ${activity} (${theme}): ordinary materials, natural light, teacher-manual style, no glossy stock look, no AI artifacts.`;
    // Deterministic SVG preview stub — not a published photo. Requires admin approval.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" role="img" aria-label="Draft ${label}">
  <rect width="640" height="400" fill="#f4f7f2"/>
  <rect x="40" y="40" width="560" height="320" rx="12" fill="#fff" stroke="#c5d2c8"/>
  <text x="320" y="170" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#24312a">Draft ${label}</text>
  <text x="320" y="210" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#5b6b62">${activity.replace(/[<>&]/g, "")}</text>
  <text x="320" y="250" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#7a8a80">Needs approval before publish</text>
</svg>`;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    return {
      kind: safeKind,
      brief,
      previewDataUrl: dataUrl,
      approvalRequired: true,
      published: false,
      suggestion: {
        id: `img-${safeKind}-${Date.now().toString(36)}`,
        category: safeKind === "finished_craft" || safeKind === "classroom_example"
          ? "image_brief_example"
          : "image_brief_setup",
        field: safeKind === "finished_craft" || safeKind === "classroom_example"
          ? "imageBriefExample"
          : "imageBriefSetup",
        fieldLabel: `Example image · ${label}`,
        scope: "activity",
        activityKey: text(context.activityKey),
        currentValue: "(empty)",
        proposedText: `${brief}\n\n[Draft preview ready — approve before publish]`,
        proposedValue: brief,
        decision: "pending",
        selected: true,
        source: "example_image",
        exampleImageDraft: {
          kind: safeKind,
          brief,
          previewDataUrl: dataUrl,
          approvalRequired: true,
        },
      },
    };
  }

  function runQualityReview(plan, activities, enrichmentDraft) {
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : {};
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    const draftActs = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    const list = asArray(activities);
    const findings = [];

    const materials = text(week.weeklyMaterials || plan?.weeklyMaterials);
    if (!materials) findings.push({ severity: "high", code: "missing_materials", message: "Missing materials checklist." });

    const titles = list.map((a) => text(a.title).toLowerCase()).filter(Boolean);
    const repeats = titles.filter((t, i) => titles.indexOf(t) !== i);
    if (repeats.length) {
      findings.push({ severity: "medium", code: "repeated_activities", message: `Repeated activity titles: ${[...new Set(repeats)].join(", ")}` });
    }

    let similarPairs = 0;
    const reusable = loadReusable();
    for (let i = 0; i < titles.length; i += 1) {
      for (let j = i + 1; j < titles.length; j += 1) {
        if (reusable?.jaccard && reusable.jaccard(titles[i], titles[j]) >= 0.7) similarPairs += 1;
      }
    }
    if (similarPairs) {
      findings.push({ severity: "medium", code: "similar_activities", message: `${similarPairs} activity pair(s) look too similar.` });
    }

    const milestones = asArray(week.milestones).length || asArray(plan?.teachingKit?.milestones).length;
    if (milestones < 2) {
      findings.push({ severity: "medium", code: "missing_domains", message: "Missing developmental domains (add milestones)." });
    }

    let missingIndoor = 0;
    let missingOutdoor = 0;
    let missingObs = 0;
    list.forEach((act) => {
      const key = text(act.id || act.itemId);
      const patch = draftActs[key] || {};
      if (!text(patch.indoorAlternatives || act.indoorAlternatives)) missingIndoor += 1;
      if (!text(patch.outdoorAlternatives || act.outdoorAlternatives)) missingOutdoor += 1;
      const obs = asArray(patch.observationPrompts);
      if (!obs.length && !text(act.observationOpportunities)) missingObs += 1;
    });
    if (missingIndoor) findings.push({ severity: "medium", code: "missing_indoor", message: `${missingIndoor} activit${missingIndoor === 1 ? "y" : "ies"} missing indoor backup.` });
    if (missingOutdoor) findings.push({ severity: "medium", code: "missing_outdoor", message: `${missingOutdoor} activit${missingOutdoor === 1 ? "y" : "ies"} missing outdoor backup.` });
    if (missingObs) findings.push({ severity: "high", code: "missing_observations", message: `${missingObs} activit${missingObs === 1 ? "y" : "ies"} missing observations.` });

    const vocab = text(plan?.vocabularyWords) || asArray(week.vocabCards).length;
    if (!vocab) findings.push({ severity: "high", code: "missing_vocabulary", message: "Missing vocabulary." });

    const books = asArray(week.books).length || asArray(plan?.books).length;
    const songs = asArray(week.songs).length || asArray(plan?.songs).length;
    if (!books) findings.push({ severity: "high", code: "missing_books", message: "Missing books." });
    if (!songs) findings.push({ severity: "high", code: "missing_songs", message: "Missing songs." });

    const printables = asArray(plan?.resourceIds).length
      || asArray(week.printableIdeas).length
      || asArray(week.printablePacks).length;
    if (!printables) findings.push({ severity: "medium", code: "missing_printables", message: "Printables missing." });

    if (!(text(week.familyConnection) || text(plan?.familyConnection))) {
      findings.push({ severity: "high", code: "missing_family", message: "Family section missing." });
    }

    const prep = text(week.teacherPreparation)
      || text(week.teacherToolkit?.teacherPreparation)
      || asArray(week.teacherToolkit?.prepChecklist).length;
    if (!prep || (typeof prep === "string" && prep.split(/\s+/).length < 8)) {
      findings.push({ severity: "medium", code: "weak_teacher_prep", message: "Teacher preparation weak or missing." });
    }

    const high = findings.filter((f) => f.severity === "high").length;
    const medium = findings.filter((f) => f.severity === "medium").length;
    const readinessScore = Math.max(0, Math.min(100, 100 - high * 12 - medium * 6));
    let readinessLabel = "Not ready";
    if (readinessScore >= 90) readinessLabel = "Publish ready";
    else if (readinessScore >= 75) readinessLabel = "Almost ready";
    else if (readinessScore >= 50) readinessLabel = "Needs work";

    return {
      findings,
      readinessScore,
      readinessLabel,
      checkedAt: new Date().toISOString(),
      blocksPublish: false, // guidance only — admin remains final reviewer
    };
  }

  /**
   * Learn From Me — record accepted rewrites to guide future drafts.
   * Never mutates old lessons; only updates style preference samples.
   */
  function learnFromAcceptedEdit(stylePreferences, { field, before, after } = {}) {
    const style = normalizeAssistantState({ stylePreferences }).stylePreferences;
    const beforeText = text(before);
    const afterText = text(after);
    if (!afterText || afterText === beforeText) return style;
    const sample = {
      field: text(field).slice(0, 80) || "general",
      before: beforeText.slice(0, 600),
      after: afterText.slice(0, 600),
      at: new Date().toISOString(),
    };
    style.acceptedEditSamples = [sample, ...asArray(style.acceptedEditSamples)].slice(0, 40);
    // Lightweight preference inference from rewrites
    if (afterText.length < beforeText.length * 0.7) {
      style.wording = style.wording || "Prefer concise classroom language.";
    }
    if (/\n/.test(afterText) && !/\n/.test(beforeText)) {
      style.formatting = style.formatting || "Prefer short lines / scannable steps.";
    }
    if (/child|children|invite|notice|wonder/i.test(afterText)) {
      style.teacherVoice = style.teacherVoice || "Warm, invitational preschool teacher voice.";
    }
    style.updatedAt = new Date().toISOString();
    return style;
  }

  return {
    IMPROVE_ACTIONS,
    TOOLKIT_BUILDERS,
    PRINTABLE_PACK_TYPES,
    IMAGE_KINDS,
    emptyAssistantState,
    normalizeAssistantState,
    transformText,
    buildTeacherChatReply,
    buildToolkitItem,
    buildPrintablePack,
    buildExampleImageDraft,
    runQualityReview,
    learnFromAcceptedEdit,
    applyStyleHints,
  };
});
