/**
 * Teaching-card visual prompt builder for Little Learner Hub.
 *
 * Isolated module: converts short card labels into concrete daycare scenes and
 * builds realistic childcare photography prompts. Does not generate pixels,
 * mutate printables, or touch PDF layout.
 *
 * Preset: teaching_card_realistic (VISUAL_STYLES value: TEACHING_CARD_REALISTIC)
 */
"use strict";

/** @typedef {"infant"|"toddler"|"preschool"|"mixed"} TeachingCardAgeBand */
/** @typedef {"daycare"|"preschool"|"classroom"|"mixed"} TeachingCardSetting */

const TEACHING_CARD_PRESET = "teaching_card_realistic";
const TEACHING_CARD_VISUAL_STYLE = "TEACHING_CARD_REALISTIC";

const TEACHING_CARD_STYLE_REQUIRED = Object.freeze([
  "Realistic candid daycare/preschool photography",
  "Natural classroom environment",
  "Age-appropriate children and materials",
  "Natural classroom lighting",
  "Simple composition",
  "The action must be immediately understandable at small printable-card size",
  "One clear subject/action",
  "Minimal background clutter",
  "Natural child posture and proportions",
  "Realistic hands and objects",
  "No text inside the image",
  "No logos inside the image",
]);

const TEACHING_CARD_STYLE_FORBIDDEN = Object.freeze([
  "flat vector illustration",
  "bubble characters",
  "circle heads",
  "rectangle bodies",
  "stick figures",
  "emoji faces",
  "clip art",
  "cartoon children",
  "geometric people",
  "corporate illustration",
  "Canva-style educational graphics",
  "arrows explaining the action",
  "glossy 3D cartoon style",
  "blob characters",
  "icon-only illustrations",
  "generic pastel clip art",
  "fake-looking AI children",
  "overly polished stock-photo smile-at-camera poses",
  "duplicated limbs",
  "impossible objects",
  "overly symmetrical staged composition",
]);

/**
 * Short teaching-card labels → concrete photographic scenes.
 * Prefer full-body/action scenes; fallback scenes use realistic hands + objects.
 * @type {Readonly<Record<string, { scene: string, handsFallback: string }>>}
 */
const TEACHING_CARD_SCENE_LIBRARY = Object.freeze({
  "share a turn": {
    scene:
      "A realistic daycare classroom scene showing one preschool child handing a chunky toy truck to another child who is reaching to receive it. Focus on the natural exchange of the toy. Simple classroom background.",
    handsFallback:
      "A realistic close-up of two young child hands in a daycare classroom: one hand offering a chunky toy truck and the other hand reaching to receive it during share-a-turn play.",
  },
  "help carry": {
    scene:
      "A realistic daycare classroom scene showing two young children carrying a lightweight classroom bin or large foam block together. Natural cooperative movement, simple classroom background.",
    handsFallback:
      "A realistic close-up of two pairs of young child hands carrying a lightweight classroom storage bin together in a daycare room.",
  },
  "clean up": {
    scene:
      "A realistic daycare classroom close-up showing a young child placing a chunky toy into a low woven or plastic classroom storage basket during cleanup time.",
    handsFallback:
      "A realistic close-up of a young child's hands placing a chunky toy into a low classroom storage basket during cleanup.",
  },
  "cheer a friend": {
    scene:
      "A realistic preschool classroom scene showing one young child naturally clapping for another child who just finished stacking a few large blocks. Soft encouragement, not staged performance.",
    handsFallback:
      "A realistic close-up of a young child's hands mid-clap in a preschool classroom, with large classroom blocks softly visible nearby.",
  },
  "gentle hands": {
    scene:
      "A realistic daycare classroom scene showing a young child using soft, careful hands while touching a friend's shoulder or gently holding a soft toy near a peer. Calm, kind interaction.",
    handsFallback:
      "A realistic close-up of a young child's gentle hands carefully holding a soft classroom toy near another child's hand.",
  },
  "stretch tall": {
    scene:
      "A realistic preschool classroom scene showing a young child standing and stretching arms upward toward the ceiling during a movement activity. Natural posture, simple classroom background.",
    handsFallback:
      "A realistic close-up of a young child's arms stretched upward during a classroom movement activity.",
  },
  "jump soft": {
    scene:
      "A realistic preschool classroom scene showing a young child doing a soft, quiet jump on a classroom rug during a movement game. Soft landing, natural energy.",
    handsFallback:
      "A realistic close-up of a young child's feet softly landing on a classroom rug during a quiet jump.",
  },
  "tiptoe": {
    scene:
      "A realistic daycare classroom scene showing a young child walking on tiptoes across a classroom rug during a quiet movement game.",
    handsFallback:
      "A realistic close-up of a young child's feet on tiptoe on a classroom rug.",
  },
  "freeze": {
    scene:
      "A realistic preschool classroom scene showing a young child frozen mid-pose like a statue during a freeze dance or movement game. Still body, natural classroom setting.",
    handsFallback:
      "A realistic close-up of a young child standing completely still on a classroom rug during a freeze game.",
  },
  "fly arms": {
    scene:
      "A realistic preschool classroom scene showing a young child standing with arms stretched out wide like airplane wings during a movement activity.",
    handsFallback:
      "A realistic close-up of a young child's arms stretched wide during a classroom movement activity.",
  },
});

const TEACHING_CARD_CONCEPT_PATTERN = /\b(teaching\s+cards?|action\s+cards?|behavior\s+cards?|routine\s+cards?|kindness\s+(?:mission\s+)?cards?|social[-\s]?emotional\s+cards?|mission\s+cards?|movement\s+(?:action\s+)?cards?|helper\s+cards?|classroom\s+visual\s+cards?)\b/i;

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
function normalizeTitleKey(value) {
  return oneLine(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isTeachingCardConcept(value) {
  const source = text(value);
  if (!source) return false;
  if (TEACHING_CARD_CONCEPT_PATTERN.test(source)) return true;
  const key = normalizeTitleKey(source.split("\n")[0] || source);
  if (TEACHING_CARD_SCENE_LIBRARY[key]) return true;
  // Short social/action labels commonly used on teaching cards
  return /^(help carry|share a turn|clean up|cheer a friend|gentle hands|stretch tall|jump soft|tiptoe|freeze|fly arms)$/i.test(key);
}

/**
 * Convert a short teaching-card concept into an explicit visual scene.
 *
 * @param {object} input
 * @param {string} [input.title]
 * @param {string} [input.actionDescription]
 * @param {TeachingCardAgeBand|string} [input.ageBand]
 * @param {TeachingCardSetting|string} [input.setting]
 * @param {boolean} [input.preferHandsFallback]
 * @returns {{
 *   title: string,
 *   titleKey: string,
 *   sceneDescription: string,
 *   usedSceneLibrary: boolean,
 *   fallbackMode: "full_scene"|"hands_and_objects"|"synthesized",
 *   ageBand: string,
 *   setting: string
 * }}
 */
function normalizeTeachingCardScene(input) {
  const source = input && typeof input === "object" ? input : {};
  const title = oneLine(source.title) || oneLine(source.actionDescription) || "Teaching card";
  const titleKey = normalizeTitleKey(title);
  const ageBand = oneLine(source.ageBand) || "preschool";
  const setting = oneLine(source.setting) || "daycare";
  const explicit = oneLine(source.actionDescription);
  const library = TEACHING_CARD_SCENE_LIBRARY[titleKey];

  if (explicit && explicit.toLowerCase() !== titleKey && explicit.length > title.length + 12) {
    return {
      title,
      titleKey,
      sceneDescription: explicit,
      usedSceneLibrary: false,
      fallbackMode: "full_scene",
      ageBand,
      setting,
    };
  }

  if (library) {
    const preferHands = source.preferHandsFallback === true;
    return {
      title,
      titleKey,
      sceneDescription: preferHands ? library.handsFallback : library.scene,
      usedSceneLibrary: true,
      fallbackMode: preferHands ? "hands_and_objects" : "full_scene",
      ageBand,
      setting,
    };
  }

  const settingLabel = /preschool/i.test(setting) ? "preschool classroom" : "daycare classroom";
  const ageLabel = /infant/i.test(ageBand)
    ? "an infant-safe caregiver-supported moment"
    : /toddler/i.test(ageBand)
      ? "a toddler"
      : "a preschool child";
  return {
    title,
    titleKey,
    sceneDescription: `A realistic ${settingLabel} scene showing ${ageLabel} naturally demonstrating “${title}” with age-appropriate classroom materials. One clear action, simple background, candid childcare photography.`,
    usedSceneLibrary: false,
    fallbackMode: "synthesized",
    ageBand,
    setting,
  };
}

/**
 * Build a generation-ready teaching-card image prompt.
 *
 * @param {object} input
 * @param {string} [input.title]
 * @param {string} [input.actionDescription]
 * @param {TeachingCardAgeBand|string} [input.ageBand]
 * @param {TeachingCardSetting|string} [input.setting]
 * @param {string} [input.visualStyle]
 * @param {boolean} [input.preferHandsFallback]
 * @returns {{
 *   title: string,
 *   visualStyle: string,
 *   preset: string,
 *   sceneDescription: string,
 *   generationPrompt: string,
 *   negativePrompt: string,
 *   usedSceneLibrary: boolean,
 *   fallbackMode: string,
 *   ageBand: string,
 *   setting: string,
 *   styleValid: boolean,
 *   validationErrors: string[]
 * }}
 */
function buildTeachingCardImagePrompt(input) {
  const source = input && typeof input === "object" ? input : {};
  const requestedStyle = text(source.visualStyle) || TEACHING_CARD_VISUAL_STYLE;
  const scene = normalizeTeachingCardScene(source);

  /** @type {string[]} */
  const validationErrors = [];
  if (requestedStyle !== TEACHING_CARD_VISUAL_STYLE) {
    validationErrors.push(`expected_visual_style_${TEACHING_CARD_VISUAL_STYLE}`);
  }

  const generationPrompt = [
    `Create a realistic childcare teaching-card image showing: ${scene.title}.`,
    "",
    "Scene:",
    scene.sceneDescription,
    "",
    "Style:",
    "Realistic candid daycare/preschool photography.",
    "Natural classroom environment.",
    "Age-appropriate children and materials.",
    "Natural lighting.",
    "Simple composition.",
    "The action must be immediately understandable at small printable-card size.",
    "",
    "Composition:",
    "One clear subject/action.",
    "Minimal distractions.",
    "No text inside image.",
    "No logos.",
    "Natural child posture and proportions.",
    "Realistic hands and objects.",
    `Age band: ${scene.ageBand}.`,
    `Setting: ${scene.setting}.`,
    "",
    "MANDATORY STYLE RULES:",
    ...TEACHING_CARD_STYLE_REQUIRED.map((rule) => `- Require: ${rule}`),
    "",
    "STRICTLY AVOID:",
    TEACHING_CARD_STYLE_FORBIDDEN.join(", ") + ".",
  ].join("\n");

  const negativePrompt = TEACHING_CARD_STYLE_FORBIDDEN.join("; ");

  // Lightweight config validation (metadata / prompt construction — no pixel QA)
  if (!/realistic daycare|realistic candid daycare|realistic preschool/i.test(generationPrompt)) {
    validationErrors.push("missing_realistic_daycare_requirement");
  }
  if (!/flat vector|bubble characters|circle heads|rectangle bodies/i.test(generationPrompt)) {
    validationErrors.push("missing_flat_vector_forbidden_constraints");
  }
  if (generationPrompt.trim().toLowerCase() === scene.title.toLowerCase()) {
    validationErrors.push("prompt_is_raw_title_only");
  }
  if (!scene.sceneDescription || scene.sceneDescription.length < 40) {
    validationErrors.push("scene_description_too_short");
  }

  return {
    title: scene.title,
    visualStyle: TEACHING_CARD_VISUAL_STYLE,
    preset: TEACHING_CARD_PRESET,
    sceneDescription: scene.sceneDescription,
    generationPrompt,
    negativePrompt,
    usedSceneLibrary: scene.usedSceneLibrary,
    fallbackMode: scene.fallbackMode,
    ageBand: scene.ageBand,
    setting: scene.setting,
    styleValid: validationErrors.length === 0 && requestedStyle === TEACHING_CARD_VISUAL_STYLE,
    validationErrors,
    requestedVisualStyle: requestedStyle,
  };
}

/**
 * Lightweight gate: confirm a brief/config used the teaching-card realistic preset.
 *
 * @param {object} config
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateTeachingCardPromptConfig(config) {
  const entry = config && typeof config === "object" ? config : {};
  /** @type {string[]} */
  const errors = [];
  const style = text(entry.visualStyle || entry.style);
  const preset = text(entry.preset);
  const prompt = text(entry.generationPrompt);
  if (style !== TEACHING_CARD_VISUAL_STYLE && preset !== TEACHING_CARD_PRESET) {
    errors.push("missing_teaching_card_realistic_preset");
  }
  if (prompt && !/STRICTLY AVOID:[\s\S]*flat vector/i.test(prompt)) {
    errors.push("prompt_missing_flat_vector_ban");
  }
  if (prompt && !/realistic/i.test(prompt)) {
    errors.push("prompt_missing_realistic_requirement");
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  TEACHING_CARD_PRESET,
  TEACHING_CARD_VISUAL_STYLE,
  TEACHING_CARD_STYLE_REQUIRED,
  TEACHING_CARD_STYLE_FORBIDDEN,
  TEACHING_CARD_SCENE_LIBRARY,
  TEACHING_CARD_CONCEPT_PATTERN,
  text,
  normalizeTitleKey,
  isTeachingCardConcept,
  normalizeTeachingCardScene,
  buildTeachingCardImagePrompt,
  validateTeachingCardPromptConfig,
};
