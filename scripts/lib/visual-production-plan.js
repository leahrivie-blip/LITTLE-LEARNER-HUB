/**
 * Visual Production planning layer for Little Learner Hub.
 *
 * Decides WHAT should be made (purpose, printable need, style, scene) BEFORE
 * image generation. Does not generate pixels, mutate lessons, publish, or
 * rebuild PDF/printable layout systems.
 *
 * Reuses teaching-card scene normalization when applicable.
 */
"use strict";

const teachingCard = require("./visual-production-teaching-card-prompt.js");

/** @typedef {"PRINTABLE_REQUIRED"|"PRINTABLE_HELPFUL"|"PRINTABLE_NOT_NEEDED"} PrintableNeed */
/** @typedef {"infant"|"toddler_12_24"|"toddler_2_3"|"preschool"|"mixed"} AgeBandPlan */
/** @typedef {"teacher_support"|"child_matching"|"child_sorting"|"dramatic_play"|"visual_schedule"|"classroom_routine"|"communication_support"|"literacy_support"|"early_math"|"stem_prompt"|"movement_prompt"|"conversation_support"|"family_connection"|"display_resource"|"documentation"|"open_ended_play_support"|"activity_photo"|"none"} VisualPurpose */
/** @typedef {"REALISTIC_ACTIVITY_PHOTO"|"REALISTIC_OBJECT_PHOTO"|"REALISTIC_HANDS_ACTION"|"SOFT_EDUCATIONAL_ILLUSTRATION"|"PLAYFUL_CHILDCARE_ILLUSTRATION"|"SIMPLE_OBJECT_ILLUSTRATION"|"PRINTABLE_ICON_SET"|"PROCESS_ART_EXAMPLE"|"CLEAN_CLASSROOM_DIAGRAM"|"TEACHING_CARD_REALISTIC"} PlannedVisualStyle */

const PLAN_VERSION = "visual-plan-v1";

const PRINTABLE_NEEDS = Object.freeze([
  "PRINTABLE_REQUIRED",
  "PRINTABLE_HELPFUL",
  "PRINTABLE_NOT_NEEDED",
]);

const PLANNED_VISUAL_STYLES = Object.freeze([
  "REALISTIC_ACTIVITY_PHOTO",
  "REALISTIC_OBJECT_PHOTO",
  "REALISTIC_HANDS_ACTION",
  "SOFT_EDUCATIONAL_ILLUSTRATION",
  "PLAYFUL_CHILDCARE_ILLUSTRATION",
  "SIMPLE_OBJECT_ILLUSTRATION",
  "PRINTABLE_ICON_SET",
  "PROCESS_ART_EXAMPLE",
  "CLEAN_CLASSROOM_DIAGRAM",
  "TEACHING_CARD_REALISTIC",
]);

/** Map planning styles → existing Visual Production API styles. */
const PLANNED_TO_API_STYLE = Object.freeze({
  REALISTIC_ACTIVITY_PHOTO: "REALISTIC_CLASSROOM",
  REALISTIC_OBJECT_PHOTO: "REALISTIC_PHOTO",
  REALISTIC_HANDS_ACTION: "TEACHING_CARD_REALISTIC",
  SOFT_EDUCATIONAL_ILLUSTRATION: "SOFT_EDUCATIONAL_ILLUSTRATION",
  PLAYFUL_CHILDCARE_ILLUSTRATION: "PLAYFUL_CHILDCARE_ILLUSTRATION",
  SIMPLE_OBJECT_ILLUSTRATION: "SIMPLE_OBJECT_ILLUSTRATION",
  PRINTABLE_ICON_SET: "CLEAN_PRINTABLE",
  PROCESS_ART_EXAMPLE: "REALISTIC_PHOTO",
  CLEAN_CLASSROOM_DIAGRAM: "CLEAN_PRINTABLE",
  TEACHING_CARD_REALISTIC: "TEACHING_CARD_REALISTIC",
});

const ILLUSTRATION_FORBIDDEN = Object.freeze([
  "bubble heads",
  "circle-head people",
  "rectangle bodies",
  "emoji faces",
  "generic clip art",
  "flat corporate vectors",
  "blob characters",
  "generic Canva people",
  "geometric stick characters",
  "overly simplistic human forms",
  "identical character templates reused on every card",
  "arrows explaining the action when the pose can show it",
]);

const ILLUSTRATION_REQUIRED = Object.freeze([
  "warm hand-drawn children's educational illustration",
  "believable human proportions for the selected art style",
  "expressive but natural faces",
  "varied poses",
  "visible hands when relevant",
  "clear action without relying on arrows",
  "soft texture and imperfect hand-created feeling",
  "simple purposeful classroom backgrounds",
  "professional early-childhood teacher-resource aesthetic",
]);

const ACTIVITY_PHOTO_REQUIRED = Object.freeze([
  "show the activity happening, not a posed portrait",
  "hands actively manipulating materials when possible",
  "actual classroom setup with believable furniture",
  "imperfect child-created work when art is involved",
  "realistic amount of supplies",
  "natural classroom lighting",
  "candid composition",
  "age-appropriate body positioning",
]);

const ACTIVITY_PHOTO_FORBIDDEN = Object.freeze([
  "looking directly at camera",
  "staged stock-photo smiles",
  "perfect Pinterest rooms",
  "luxury daycare interiors",
  "perfectly aligned materials",
  "fake oversized classroom spaces",
  "unrealistic cleanliness during messy play",
  "glossy product photography",
  "unnecessary decorative props",
  "preschool worksheet tasks for toddlers/infants",
]);

/** Practical format patterns (usability inspiration — never copy copyrighted works). */
const FORMAT_PATTERNS = Object.freeze([
  "matching cards",
  "sorting mats",
  "visual routine cards",
  "simple choice boards",
  "picture menus",
  "dramatic-play signs",
  "conversation cards",
  "sequencing cards",
  "simple scavenger hunts",
  "classroom labels",
  "visual strips",
  "teacher prompt cards",
  "movement cards",
  "large group-game cards",
  "play mats",
  "building challenge cards",
  "observation sheets",
  "parent/family extension cards",
  "process-art display pages",
  "emotion visuals",
  "role badges",
]);

const SCENE_LIBRARY = Object.freeze({
  ...Object.fromEntries(
    Object.entries(teachingCard.TEACHING_CARD_SCENE_LIBRARY || {}).map(([key, value]) => [
      key,
      { scene: value.scene, handsFallback: value.handsFallback },
    ]),
  ),
  "construction truck track painting": {
    scene:
      "Toddler hands guiding a chunky toy construction truck through washable paint onto large butcher paper on a classroom table or floor mat, leaving imperfect tire-track marks. Chunky toddler-safe truck, paint tray, and large paper visible. Realistic daycare photography.",
    handsFallback:
      "Close-up of toddler hands rolling a chunky toy truck through washable paint onto large paper, creating imperfect tracks.",
  },
  "sponge brick printing": {
    scene:
      "Toddler hands pressing a large rectangular sponge covered in washable red paint onto butcher paper, creating imperfect brick-shaped marks in a daycare classroom.",
    handsFallback:
      "Close-up of toddler hands pressing a paint-covered rectangular sponge onto paper, leaving imperfect brick prints.",
  },
  "brick printing": {
    scene:
      "Toddler hands pressing a large rectangular sponge covered in washable red paint onto butcher paper, creating imperfect brick-shaped marks in a daycare classroom.",
    handsFallback:
      "Close-up of toddler hands pressing a paint-covered rectangular sponge onto paper, leaving imperfect brick prints.",
  },
  "community helper pretend play": {
    scene:
      "Toddlers or preschoolers in a daycare dramatic-play area using simple helper props (soft hats, badges, or tools) during community-helper pretend play. Natural interaction with props, simple classroom background.",
    handsFallback:
      "Close-up of child hands holding a simple pretend helper badge or tool in a daycare dramatic-play center.",
  },
  "block carrying": {
    scene:
      "A toddler carrying one lightweight large foam or cardboard block across a daycare classroom floor. Chunky toddler-safe block, natural walking posture.",
    handsFallback:
      "Close-up of toddler hands holding a lightweight large foam block.",
  },
});

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function oneLine(value) {
  return text(value).replace(/\s+/g, " ").trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeKey(value) {
  return oneLine(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * @param {unknown} value
 * @returns {AgeBandPlan}
 */
function normalizeAgeBand(value) {
  const raw = oneLine(value).toLowerCase();
  if (/infant|0\s*[-–]\s*12|0\s*to\s*12|baby/.test(raw)) return "infant";
  if (/12\s*[-–]\s*24|12\s*to\s*24|young\s+toddler|1\s*[-–]\s*2/.test(raw)) return "toddler_12_24";
  if (/2\s*[-–]\s*3|24\s*[-–]\s*36|older\s+toddler|two\s+year/.test(raw)) return "toddler_2_3";
  if (/preschool|3\s*[-–]\s*5|pre\s*-?\s*k/.test(raw)) return "preschool";
  if (/toddler/.test(raw)) return "toddler_12_24";
  return "mixed";
}

/**
 * @param {AgeBandPlan} ageBand
 * @returns {string[]}
 */
function ageAccuracyRules(ageBand) {
  if (ageBand === "infant") {
    return [
      "Infant-appropriate only: floor-based exploration, tummy time, reaching, grasping, caregiver-supported interaction",
      "Very simple sensory materials",
      "No preschool table tasks, worksheets, pencils, or writing",
      "No tiny manipulatives",
    ];
  }
  if (ageBand === "toddler_12_24") {
    return [
      "Toddler 12–24 months: chunky materials, whole-hand grasp, carrying, pushing, filling/dumping, stacking, large marks, basic pretend play",
      "Very short activities",
      "No kindergarten worksheets, pencils, writing requirements, or tiny pieces",
      "No precise cutting/coloring expectations for the child",
    ];
  }
  if (ageBand === "toddler_2_3") {
    return [
      "Toddler 2–3: deliberate pretend play, simple matching/sorting, larger collaborative art, basic tool use, short sequences",
      "No writing worksheets unless explicitly and developmentally appropriate",
      "Avoid tiny manipulatives",
    ];
  }
  if (ageBand === "preschool") {
    return [
      "Preschool: dramatic play, sorting/matching, early literacy/math prompts, collaborative building, simple challenges allowed",
      "Still avoid overly academic worksheet look unless the resource is intentionally early-learning practice",
    ];
  }
  return ["Use developmentally appropriate materials and poses for the stated age band"];
}

/**
 * @param {object} input
 * @returns {string}
 */
function collectContextText(input) {
  const s = input && typeof input === "object" ? input : {};
  return [
    s.lessonTitle,
    s.activityTitle,
    s.activityName,
    s.objective,
    s.activityDescription,
    s.whatChildrenDo,
    s.materials,
    s.setup,
    s.steps,
    s.questions,
    s.observationFocus,
    s.safety,
    s.vocabulary,
    s.imageRequest,
    s.exampleImages,
    s.imageBriefSetup,
    s.imageBriefExample,
    s.lessonTheme,
    s.weekday,
    s.category,
    s.activityCategory,
  ]
    .map((v) => text(v))
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {object} input
 * @returns {{ childDoing: string, materials: string, skill: string, bestMoment: string, needsImage: boolean }}
 */
function understandActivity(input) {
  const s = input && typeof input === "object" ? input : {};
  const title = oneLine(s.activityTitle || s.activityName || s.title);
  const ctx = collectContextText(s).toLowerCase();
  const materials = oneLine(s.materials) || extractMaterialsGuess(ctx, title);
  const childDoing = oneLine(s.whatChildrenDo || s.activityDescription || s.steps)
    || deriveActionFromTitle(title);
  const skill = oneLine(s.objective) || deriveSkill(ctx, title);
  const bestMoment = deriveBestMoment(title, childDoing, materials);
  const needsImage = !(
    /\b(song only|hello song|goodbye song|conversation circle|circle talk only)\b/i.test(ctx)
    && !/\b(art|paint|sensory|dramatic|build|match|sort|print)\b/i.test(ctx)
  );
  return { childDoing, materials, skill, bestMoment, needsImage };
}

/**
 * @param {string} ctx
 * @param {string} title
 * @returns {string}
 */
function extractMaterialsGuess(ctx, title) {
  const bits = [];
  if (/truck|vehicle/.test(ctx) || /truck/.test(title.toLowerCase())) bits.push("chunky toy truck");
  if (/paint/.test(ctx) || /paint|printing|brick/.test(title.toLowerCase())) bits.push("washable paint");
  if (/paper|butcher/.test(ctx) || /paint|print/.test(title.toLowerCase())) bits.push("large paper");
  if (/sponge|brick/.test(ctx) || /brick|sponge/.test(title.toLowerCase())) bits.push("large rectangular sponge");
  if (/block/.test(ctx) || /block/.test(title.toLowerCase())) bits.push("lightweight large foam/cardboard blocks");
  if (/basket|bin|cleanup|clean up/.test(ctx) || /clean up/.test(title.toLowerCase())) bits.push("low classroom storage basket");
  return bits.join(", ");
}

/**
 * @param {string} title
 * @returns {string}
 */
function deriveActionFromTitle(title) {
  const key = normalizeKey(title);
  if (SCENE_LIBRARY[key]) return SCENE_LIBRARY[key].scene;
  return `Children engaging in “${title}” with age-appropriate classroom materials`;
}

/**
 * @param {string} ctx
 * @param {string} title
 * @returns {string}
 */
function deriveSkill(ctx, title) {
  if (/share|turn|kind|friend|gentle|cheer|help/.test(ctx + title.toLowerCase())) return "social-emotional / cooperation";
  if (/match|sort|same|different/.test(ctx)) return "matching / sorting / early cognition";
  if (/paint|art|print|collage|stamp/.test(ctx + title.toLowerCase())) return "creative / sensory-motor";
  if (/build|block|truck|construct/.test(ctx + title.toLowerCase())) return "gross/fine motor / STEM play";
  if (/dramatic|pretend|café|helper|menu/.test(ctx + title.toLowerCase())) return "dramatic play / language";
  if (/count|number|pattern/.test(ctx)) return "early math";
  return "early childhood learning through play";
}

/**
 * @param {string} title
 * @param {string} childDoing
 * @param {string} materials
 * @returns {string}
 */
function deriveBestMoment(title, childDoing, materials) {
  if (materials) return `The clearest teaching moment: ${childDoing} with ${materials} visible and in use.`;
  return `The clearest teaching moment that shows what children are doing during ${title}.`;
}

/**
 * @param {object} input
 * @param {ReturnType<typeof understandActivity>} understood
 * @returns {{ need: PrintableNeed, reason: string, suggestedFormat: string, visualPurpose: VisualPurpose }}
 */
function classifyPrintableNeed(input, understood) {
  const s = input && typeof input === "object" ? input : {};
  const title = normalizeKey(s.activityTitle || s.activityName || s.title);
  const ctx = collectContextText(s).toLowerCase();
  const category = normalizeKey(s.activityCategory || s.category);
  const forced = oneLine(s.printableNeed).toUpperCase();
  if (PRINTABLE_NEEDS.includes(forced)) {
    return {
      need: /** @type {PrintableNeed} */ (forced),
      reason: "Owner override",
      suggestedFormat: oneLine(s.suggestedFormat) || "",
      visualPurpose: /** @type {VisualPurpose} */ (oneLine(s.visualPurpose) || "none"),
    };
  }

  // Explicit teaching-card / matching resources
  if (
    teachingCard.isTeachingCardConcept(title)
    || teachingCard.isTeachingCardConcept(ctx)
    || /\b(emotion|matching|sequence|choice board|flash\s*card|mission card|movement card)\b/i.test(ctx)
  ) {
    return {
      need: "PRINTABLE_HELPFUL",
      reason: "Teaching/matching/social visual supports the activity",
      suggestedFormat: /\bemotion\b/i.test(ctx) ? "emotion visuals" : "teaching/action cards",
      visualPurpose: "communication_support",
    };
  }

  if (/\b(café|cafe|menu|restaurant|order ticket|dramatic play|community helper|vet clinic|grocery)\b/i.test(ctx + " " + title)) {
    return {
      need: "PRINTABLE_HELPFUL",
      reason: "Dramatic play benefits from simple props (menu, badges, role cards)",
      suggestedFormat: /\bmenu|café|cafe\b/i.test(ctx + title) ? "picture menus" : "role badges / dramatic-play signs",
      visualPurpose: "dramatic_play",
    };
  }

  if (/\b(match|sorting mat|sequence|scavenger|bingo|visual schedule|routine card)\b/i.test(ctx)) {
    return {
      need: "PRINTABLE_REQUIRED",
      reason: "Activity depends on visual matching/sorting/sequence supports",
      suggestedFormat: "matching cards",
      visualPurpose: "child_matching",
    };
  }

  // Process art / sensory / movement / simple carry — usually no printable
  if (
    /\b(paint|track painting|sponge|brick printing|sensory bin|water play|outdoor|music|song|dance|carry|block carrying|obstacle)\b/i.test(ctx + " " + title)
    || /art|sensory|music|movement|outdoor/.test(category)
  ) {
    // Exception: if owner already linked printable ideas
    if (/\b(printable|picture cards|menu|matching)\b/i.test(oneLine(s.existingPrintableLinks || s.printableIdeas))) {
      return {
        need: "PRINTABLE_HELPFUL",
        reason: "Existing printable reference present",
        suggestedFormat: "follow existing printable intent",
        visualPurpose: "teacher_support",
      };
    }
    return {
      need: "PRINTABLE_NOT_NEEDED",
      reason: "Hands-on process/sensory/movement activity is complete without a filler printable",
      suggestedFormat: "",
      visualPurpose: "activity_photo",
    };
  }

  if (/\b(conversation|circle time only|discussion)\b/i.test(ctx) && !/\bcard|visual\b/i.test(ctx)) {
    return {
      need: "PRINTABLE_NOT_NEEDED",
      reason: "Conversation/routine activity does not require a printable",
      suggestedFormat: "",
      visualPurpose: "none",
    };
  }

  return {
    need: "PRINTABLE_NOT_NEEDED",
    reason: "No clear teacher/child print need identified — avoid filler",
    suggestedFormat: "",
    visualPurpose: understood.needsImage ? "activity_photo" : "none",
  };
}

/**
 * @param {object} input
 * @param {{ need: PrintableNeed, visualPurpose: VisualPurpose, suggestedFormat: string }} printable
 * @param {AgeBandPlan} ageBand
 * @returns {PlannedVisualStyle}
 */
function selectPlannedStyle(input, printable, ageBand) {
  const s = input && typeof input === "object" ? input : {};
  const override = oneLine(s.selectedStyle || s.plannedVisualStyle || s.visualStyle);
  if (PLANNED_VISUAL_STYLES.includes(override)) return /** @type {PlannedVisualStyle} */ (override);

  const title = normalizeKey(s.activityTitle || s.activityName || s.title);
  const ctx = collectContextText(s).toLowerCase();
  const assetHint = oneLine(s.assetType).toUpperCase();

  if (teachingCard.isTeachingCardConcept(title) || printable.visualPurpose === "communication_support") {
    if (/\billustration|illustrated|cartoon\b/i.test(ctx)) return "SOFT_EDUCATIONAL_ILLUSTRATION";
    return "TEACHING_CARD_REALISTIC";
  }
  if (printable.visualPurpose === "dramatic_play" || /\bmenu|badge|ticket\b/i.test(printable.suggestedFormat)) {
    return "PLAYFUL_CHILDCARE_ILLUSTRATION";
  }
  if (printable.need !== "PRINTABLE_NOT_NEEDED" && /\bmatch|object card|flash\b/i.test(printable.suggestedFormat + ctx)) {
    return ageBand === "infant" ? "SIMPLE_OBJECT_ILLUSTRATION" : "SOFT_EDUCATIONAL_ILLUSTRATION";
  }
  if (assetHint === "LESSON_COVER") return "REALISTIC_ACTIVITY_PHOTO";
  if (/\bpaint|print|art|messy|track painting|sponge\b/i.test(ctx + " " + title)) return "PROCESS_ART_EXAMPLE";
  if (/\bno children|materials only|object photo|setup only\b/i.test(ctx)) return "REALISTIC_OBJECT_PHOTO";
  if (printable.visualPurpose === "activity_photo" || printable.need === "PRINTABLE_NOT_NEEDED") {
    return "REALISTIC_ACTIVITY_PHOTO";
  }
  return "REALISTIC_ACTIVITY_PHOTO";
}

/**
 * @param {object} input
 * @returns {{ sceneDescription: string, usedLibrary: boolean, fallbackMode: string }}
 */
function normalizeScene(input) {
  const s = input && typeof input === "object" ? input : {};
  const title = oneLine(s.activityTitle || s.activityName || s.title);
  const key = normalizeKey(title);
  const explicit = oneLine(s.sceneDescription || s.imageRequest || s.imageBriefSetup || s.exampleImages || s.actionDescription);
  const ageBand = normalizeAgeBand(s.ageBand || s.ageGroup);
  const preferHands = s.preferHandsFallback === true;

  if (explicit && explicit.length > 40 && normalizeKey(explicit) !== key) {
    return { sceneDescription: explicit, usedLibrary: false, fallbackMode: "owner_or_brief" };
  }

  const library = SCENE_LIBRARY[key];
  if (library) {
    return {
      sceneDescription: preferHands ? library.handsFallback : library.scene,
      usedLibrary: true,
      fallbackMode: preferHands ? "hands_and_objects" : "full_scene",
    };
  }

  if (teachingCard.isTeachingCardConcept(title)) {
    const built = teachingCard.normalizeTeachingCardScene({
      title,
      actionDescription: explicit,
      ageBand: ageBand.startsWith("toddler") ? "toddler" : ageBand,
      setting: "daycare",
      preferHandsFallback: preferHands,
    });
    return {
      sceneDescription: built.sceneDescription,
      usedLibrary: built.usedSceneLibrary,
      fallbackMode: built.fallbackMode,
    };
  }

  const materials = oneLine(s.materials);
  const doing = oneLine(s.whatChildrenDo || s.activityDescription);
  const ageLabel = ageBand === "infant"
    ? "an infant-care moment"
    : ageBand === "preschool"
      ? "a preschool classroom moment"
      : "a toddler classroom moment";
  return {
    sceneDescription: `A realistic ${ageLabel} showing ${doing || `children doing “${title}”`}${materials ? ` using ${materials}` : ""}. One clear action, natural daycare environment, candid composition.`,
    usedLibrary: false,
    fallbackMode: "synthesized",
  };
}

/**
 * Set-level diversity guidance — distribute across a pack; do not tokenize one image.
 * @param {object} [input]
 * @returns {string}
 */
function buildDiversityContext(input) {
  const s = input && typeof input === "object" ? input : {};
  if (oneLine(s.diversityContext)) return oneLine(s.diversityContext);
  const setSize = Number(s.setSize || s.cardCount || 0);
  if (setSize >= 2) {
    return [
      `Across this set of ${setSize} visuals, naturally vary child appearance (skin tones, hair colors/textures/styles, facial features, clothing, apparent gender presentation, and body types).`,
      "Do not force every demographic trait into a single image.",
      "Do not reuse one identical character template on every card.",
      "Do not label or call out protected characteristics.",
      "Representation should feel natural for a real childcare community.",
    ].join(" ");
  }
  return [
    "If children appear, use a believable childcare-community appearance.",
    "Do not default to the same character look every time.",
    "Do not tokenize diversity or label protected characteristics.",
  ].join(" ");
}

/**
 * Research/format influence: suggest useful TYPE patterns without copying designs.
 * @param {string} suggestedFormat
 * @param {VisualPurpose} purpose
 * @returns {string}
 */
function researchFormatGuidance(suggestedFormat, purpose) {
  const match = FORMAT_PATTERNS.find((pattern) => suggestedFormat.toLowerCase().includes(pattern.split(" ")[0]));
  const pattern = match || (purpose === "dramatic_play"
    ? "picture menus / role badges"
    : purpose === "child_matching"
      ? "matching cards"
      : purpose === "communication_support"
        ? "visual routine / emotion / action cards"
        : "");
  if (!pattern) {
    return "Prefer practical early-childhood formats teachers actually use; never copy another seller's artwork, text, or branded layout.";
  }
  return `Useful format pattern to emulate (structure/usability only, never copy artwork/text/branding): ${pattern}. Prefer easy-prep, readable, reusable classroom value over decorative novelty.`;
}

/**
 * @param {object} input
 * @returns {object}
 */
function buildVisualProductionPrompt(input) {
  const s = input && typeof input === "object" ? input : {};
  const plannedStyle = /** @type {PlannedVisualStyle} */ (
    PLANNED_VISUAL_STYLES.includes(oneLine(s.selectedStyle))
      ? oneLine(s.selectedStyle)
      : "REALISTIC_ACTIVITY_PHOTO"
  );
  const apiStyle = PLANNED_TO_API_STYLE[plannedStyle] || "REALISTIC_CLASSROOM";
  const ageBand = normalizeAgeBand(s.ageBand);
  const scene = oneLine(s.sceneDescription) || "A clear childcare classroom activity moment.";
  const diversity = oneLine(s.diversityContext) || buildDiversityContext(s);
  const isIllustration = /ILLUSTRATION|ICON_SET|DIAGRAM/.test(plannedStyle);
  const isTeaching = plannedStyle === "TEACHING_CARD_REALISTIC" || plannedStyle === "REALISTIC_HANDS_ACTION";

  /** @type {string[]} */
  const require = [];
  /** @type {string[]} */
  const avoid = [];

  if (isIllustration) {
    require.push(...ILLUSTRATION_REQUIRED);
    avoid.push(...ILLUSTRATION_FORBIDDEN);
  } else if (isTeaching) {
    require.push(...(teachingCard.TEACHING_CARD_STYLE_REQUIRED || []));
    avoid.push(...(teachingCard.TEACHING_CARD_STYLE_FORBIDDEN || []));
  } else {
    require.push(...ACTIVITY_PHOTO_REQUIRED);
    avoid.push(...ACTIVITY_PHOTO_FORBIDDEN);
    avoid.push(...ILLUSTRATION_FORBIDDEN);
  }

  require.push(...ageAccuracyRules(ageBand));

  if (s.resourceDimensions || s.assetType === "PRINTABLE_CARDS") {
    require.push(
      "Readable at small printable-card size",
      "One primary subject/action",
      "Clean silhouette / strong subject-background separation",
      "Minimal background clutter",
      "No tiny text inside the generated image",
      "No logos",
    );
  }

  const compositionHints = [
    "Vary composition appropriately: close-up hands, waist-level action, seated floor play, tabletop work, side view, or natural two-child interaction — avoid the same left-character / right-object / center-arrow template every time.",
  ];

  const ownerImageRequest = oneLine(s.imageRequest || s.imageBriefSetup || s.exampleImages);
  const generationPrompt = [
    `Create a Little Learner Hub ${oneLine(s.assetType) || "visual"} for: ${oneLine(s.activityTitle || s.lessonTitle) || "classroom resource"}.`,
    "",
    "Scene:",
    scene,
    ownerImageRequest ? `Owner image request / example intent (preserve): ${ownerImageRequest}` : "",
    "",
    `Planned style: ${plannedStyle} (API style: ${apiStyle})`,
    `Age band: ${ageBand}`,
    oneLine(s.objective) ? `Objective: ${oneLine(s.objective)}` : "",
    oneLine(s.materials) ? `Materials: ${oneLine(s.materials)}` : "",
    oneLine(s.visualPurpose) ? `Visual purpose: ${oneLine(s.visualPurpose)}` : "",
    oneLine(s.researchGuidance) ? `Format guidance: ${oneLine(s.researchGuidance)}` : "",
    "",
    "Style rules:",
    ...require.map((line) => `- Require: ${line}`),
    "",
    "Composition:",
    ...compositionHints.map((line) => `- ${line}`),
    "",
    "Diversity (set-aware):",
    `- ${diversity}`,
    "",
    "STRICTLY AVOID:",
    avoid.join(", ") + ".",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    plannedStyle,
    apiVisualStyle: apiStyle,
    generationPrompt,
    negativePrompt: avoid.join("; "),
    ageBand,
  };
}

/**
 * Lightweight prompt/preset validation (no computer vision).
 * @param {object} plan
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateVisualPlan(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  /** @type {string[]} */
  const errors = [];
  if (!oneLine(p.sceneDescription) || oneLine(p.sceneDescription).length < 30) {
    errors.push("scene_too_short");
  }
  if (!PLANNED_VISUAL_STYLES.includes(oneLine(p.plannedStyle))) {
    errors.push("missing_planned_style");
  }
  const prompt = oneLine(p.generationPrompt);
  if (!prompt || prompt.toLowerCase() === normalizeKey(p.activityTitle)) {
    errors.push("prompt_is_raw_title");
  }
  if (/ILLUSTRATION|ICON/.test(oneLine(p.plannedStyle)) && !/bubble|circle-head|Canva|clip art/i.test(prompt)) {
    errors.push("illustration_missing_bubble_ban");
  }
  if (/toddler_12_24|infant/.test(oneLine(p.ageBand)) && /worksheet|pencil|writing requirement/i.test(prompt) && !/no .*worksheet|avoid .*worksheet|No .*worksheet/i.test(prompt)) {
    errors.push("age_risk_worksheet_language");
  }
  if (p.printableNeed === "PRINTABLE_NOT_NEEDED" && p.assetType === "PRINTABLE_CARDS" && p.forcePrintable !== true) {
    errors.push("printable_not_needed_but_cards_requested");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Central planner: activity context → printable decision → style → scene → prompt.
 * @param {object} input
 * @returns {object}
 */
function planVisualProduction(input) {
  const s = input && typeof input === "object" ? input : {};
  const activityTitle = oneLine(s.activityTitle || s.activityName || s.title);
  const ageBand = normalizeAgeBand(s.ageBand || s.ageGroup);
  const understood = understandActivity(s);
  const printable = classifyPrintableNeed(s, understood);
  const plannedStyle = selectPlannedStyle(s, printable, ageBand);
  const scene = normalizeScene({ ...s, activityTitle });
  const diversityContext = buildDiversityContext(s);
  const researchGuidance = researchFormatGuidance(printable.suggestedFormat, printable.visualPurpose);

  const assetType = oneLine(s.assetType)
    || (printable.need === "PRINTABLE_NOT_NEEDED" ? "ACTIVITY_IMAGE" : "PRINTABLE_CARDS");

  const prompt = buildVisualProductionPrompt({
    ...s,
    activityTitle,
    ageBand,
    assetType,
    selectedStyle: oneLine(s.selectedStyle) || plannedStyle,
    sceneDescription: scene.sceneDescription,
    visualPurpose: printable.visualPurpose,
    diversityContext,
    researchGuidance,
    materials: understood.materials || oneLine(s.materials),
    objective: understood.skill || oneLine(s.objective),
  });

  const plan = {
    planVersion: PLAN_VERSION,
    lessonTitle: oneLine(s.lessonTitle),
    activityTitle,
    activityId: oneLine(s.activityId),
    lessonId: oneLine(s.lessonId),
    ageBand,
    understood,
    printableNeed: printable.need,
    printableReason: printable.reason,
    suggestedFormat: printable.suggestedFormat,
    visualPurpose: printable.visualPurpose,
    plannedStyle: prompt.plannedStyle,
    apiVisualStyle: prompt.apiVisualStyle,
    sceneDescription: scene.sceneDescription,
    sceneFallbackMode: scene.fallbackMode,
    usedSceneLibrary: scene.usedLibrary,
    diversityContext,
    researchGuidance,
    generationPrompt: prompt.generationPrompt,
    negativePrompt: prompt.negativePrompt,
    assetType,
    ownerOverride: {
      style: Boolean(oneLine(s.selectedStyle || s.plannedVisualStyle)),
      printableNeed: Boolean(oneLine(s.printableNeed)),
      scene: Boolean(oneLine(s.sceneDescription)),
    },
  };

  const validation = validateVisualPlan(plan);
  return { ...plan, validation };
}

module.exports = {
  PLAN_VERSION,
  PRINTABLE_NEEDS,
  PLANNED_VISUAL_STYLES,
  PLANNED_TO_API_STYLE,
  FORMAT_PATTERNS,
  ILLUSTRATION_FORBIDDEN,
  ILLUSTRATION_REQUIRED,
  ACTIVITY_PHOTO_REQUIRED,
  ACTIVITY_PHOTO_FORBIDDEN,
  text,
  normalizeKey,
  normalizeAgeBand,
  ageAccuracyRules,
  understandActivity,
  classifyPrintableNeed,
  selectPlannedStyle,
  normalizeScene,
  buildDiversityContext,
  researchFormatGuidance,
  buildVisualProductionPrompt,
  validateVisualPlan,
  planVisualProduction,
};
