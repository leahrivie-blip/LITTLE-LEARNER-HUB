/**
 * Human-action teaching-card visuals for Priority 1 printable builders.
 *
 * Blocks primitive SVG "bubble people" (circle head + rectangle body).
 * Routes human social/action cards through Visual Production planning
 * (realistic OR quality educational illustration). Object/hands SVG
 * fallbacks are allowed; geometric humans are not.
 *
 * Does not generate pixels, mutate lessons, publish, or rewrite PDF layout.
 */
"use strict";

const teachingCard = require("../visual-production-teaching-card-prompt.js");
const visualPlan = require("../visual-production-plan.js");

/** Icon keys in build-priority1-printables-v2.js that drew circle-head humans. */
const PRIMITIVE_HUMAN_SVG_ICON_KEYS = Object.freeze([
  "carry",
  "share",
  "cheer",
  "gentle",
  "stretch",
  "jump",
  "tiptoe",
  "freeze",
  "fly",
]);

/** Human-action card titles that must not use primitive SVG people. */
const HUMAN_ACTION_CARD_TITLES = Object.freeze([
  "Help Carry",
  "Share a Turn",
  "Clean Up",
  "Cheer a Friend",
  "Gentle Hands",
  "Kind Hands",
  "Stretch Tall",
  "Jump Soft",
  "Tiptoe",
  "Freeze",
  "Fly Arms",
]);

/** @typedef {"TEACHING_CARD_REALISTIC"|"TEACHING_CARD_ILLUSTRATED"|"OBJECT_CARD_REALISTIC"|"OBJECT_CARD_ILLUSTRATED"|"REALISTIC_HANDS_OBJECT"} TeachingCardVisualFamily */

const TEACHING_CARD_ILLUSTRATED = "TEACHING_CARD_ILLUSTRATED";
const TEACHING_CARD_ILLUSTRATED_PRESET = "teaching_card_illustrated";

const ILLUSTRATED_REQUIRED = Object.freeze([
  "Warm, professional early-childhood educational illustration",
  "high-quality children's picture-book / teacher-resource illustration",
  "soft hand-drawn texture",
  "natural child proportions",
  "clear expressive body language",
  "simple daycare environment",
  "one immediately understandable action",
  "age-appropriate materials",
  "clean composition readable at small card size",
  "Children should look individually drawn rather than like repeated vector templates",
]);

const ILLUSTRATED_FORBIDDEN = Object.freeze([
  "circle-head rectangle-body figures",
  "bubble characters",
  "geometric people",
  "stick figures",
  "emoji faces",
  "flat corporate vectors",
  "generic clip art",
  "Canva-style people",
  "glossy 3D cartoons",
  "floating explanatory arrows",
]);

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
function normalizeKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * @param {string} iconKey
 * @returns {boolean}
 */
function isPrimitiveHumanSvgIconKey(iconKey) {
  return PRIMITIVE_HUMAN_SVG_ICON_KEYS.includes(String(iconKey || "").trim());
}

/**
 * @param {string} title
 * @returns {boolean}
 */
function isHumanActionCardTitle(title) {
  const key = normalizeKey(title);
  if (HUMAN_ACTION_CARD_TITLES.some((t) => normalizeKey(t) === key)) return true;
  return teachingCard.isTeachingCardConcept(title);
}

/**
 * Hard block: printable builders must not resolve these icon keys to SVG people.
 * @param {string} iconKey
 */
function assertNotPrimitiveHumanSvgIcon(iconKey) {
  if (isPrimitiveHumanSvgIconKey(iconKey)) {
    const err = new Error(
      `Blocked primitive SVG human icon "${iconKey}". Human-action cards must use Visual Production (realistic or quality illustrated) or hands/object fallback — never circle-head rectangle-body figures.`,
    );
    err.code = "primitive_human_svg_blocked";
    throw err;
  }
}

/**
 * Object / hands-only SVG bodies (no circle-head people). Safe for cut sheets.
 * @type {Readonly<Record<string, string>>}
 */
const HANDS_OBJECT_SVG = Object.freeze({
  carry: `
    <rect x="-70" y="-10" width="140" height="70" rx="14" fill="#fb923c" stroke="#c2410c" stroke-width="5"/>
    <ellipse cx="-55" cy="40" rx="28" ry="16" fill="#fda4af"/>
    <ellipse cx="55" cy="40" rx="28" ry="16" fill="#fcd34d"/>
    <text x="0" y="-40" text-anchor="middle" font-family="Arial" font-size="22" fill="#9a3412">carry together</text>`,
  share: `
    <rect x="-35" y="-25" width="70" height="50" rx="10" fill="#60a5fa" stroke="#1d4ed8" stroke-width="4"/>
    <circle cx="-10" cy="-5" r="10" fill="#f97316"/>
    <circle cx="12" cy="5" r="8" fill="#eab308"/>
    <ellipse cx="-70" cy="35" rx="26" ry="16" fill="#fda4af"/>
    <ellipse cx="70" cy="35" rx="26" ry="16" fill="#fcd34d"/>
    <text x="0" y="-55" text-anchor="middle" font-family="Arial" font-size="22" fill="#1e3a8a">share the toy</text>`,
  cleanup: `
    <rect x="-80" y="10" width="110" height="70" rx="12" fill="#a16207"/>
    <ellipse cx="-25" cy="10" rx="55" ry="18" fill="#ca8a04"/>
    <circle cx="40" cy="-30" r="28" fill="#ef4444"/>
    <ellipse cx="70" cy="40" rx="24" ry="14" fill="#fda4af"/>
    <text x="0" y="-70" text-anchor="middle" font-family="Arial" font-size="22" fill="#166534">into the basket</text>`,
  cheer: `
    <ellipse cx="-45" cy="20" rx="28" ry="18" fill="#fda4af"/>
    <ellipse cx="45" cy="20" rx="28" ry="18" fill="#fda4af"/>
    <path d="M-55 -10 Q-45 -40 -30 -10" fill="none" stroke="#ea580c" stroke-width="8" stroke-linecap="round"/>
    <path d="M55 -10 Q45 -40 30 -10" fill="none" stroke="#ea580c" stroke-width="8" stroke-linecap="round"/>
    <rect x="-35" y="50" width="70" height="40" rx="8" fill="#a78bfa"/>
    <text x="0" y="-55" text-anchor="middle" font-family="Arial" font-size="22" fill="#6b21a8">clap for a friend</text>`,
  gentle: `
    <ellipse cx="-40" cy="10" rx="32" ry="20" fill="#fda4af"/>
    <ellipse cx="40" cy="10" rx="32" ry="20" fill="#fcd34d"/>
    <ellipse cx="0" cy="-20" rx="40" ry="28" fill="#fdba74"/>
    <text x="0" y="70" text-anchor="middle" font-family="Arial" font-size="22" fill="#9a3412">soft hands</text>`,
  stretch: `
    <ellipse cx="0" cy="50" rx="30" ry="16" fill="#fda4af"/>
    <rect x="-12" y="-40" width="24" height="90" rx="10" fill="#60a5fa"/>
    <path d="M-12 -20 L-70 -70" stroke="#60a5fa" stroke-width="12" stroke-linecap="round"/>
    <path d="M12 -20 L70 -70" stroke="#60a5fa" stroke-width="12" stroke-linecap="round"/>
    <text x="0" y="-95" text-anchor="middle" font-family="Arial" font-size="22" fill="#1e40af">reach tall</text>`,
  jump: `
    <ellipse cx="0" cy="70" rx="40" ry="12" fill="#94a3b8" opacity="0.45"/>
    <ellipse cx="-20" cy="40" rx="18" ry="12" fill="#065f46"/>
    <ellipse cx="20" cy="40" rx="18" ry="12" fill="#065f46"/>
    <text x="0" y="-20" text-anchor="middle" font-family="Arial" font-size="22" fill="#166534">soft jump</text>`,
  tiptoe: `
    <ellipse cx="-18" cy="50" rx="20" ry="10" fill="#9d174d"/>
    <ellipse cx="18" cy="50" rx="20" ry="10" fill="#9d174d"/>
    <path d="M-40 20 Q0 0 40 20" fill="none" stroke="#94a3b8" stroke-width="3" stroke-dasharray="6 4"/>
    <text x="0" y="-20" text-anchor="middle" font-family="Arial" font-size="22" fill="#9d174d">quiet feet</text>`,
  freeze: `
    <rect x="-40" y="-30" width="80" height="100" rx="12" fill="#fde68a" stroke="#ca8a04" stroke-width="5"/>
    <text x="0" y="30" text-anchor="middle" font-family="Arial" font-size="36" font-weight="700" fill="#a16207">!</text>
    <text x="0" y="-55" text-anchor="middle" font-family="Arial" font-size="22" fill="#a16207">freeze still</text>`,
  fly: `
    <path d="M-90 0 L-10 20" stroke="#7c3aed" stroke-width="14" stroke-linecap="round"/>
    <path d="M90 0 L10 20" stroke="#7c3aed" stroke-width="14" stroke-linecap="round"/>
    <ellipse cx="0" cy="45" rx="28" ry="16" fill="#fda4af"/>
    <text x="0" y="-40" text-anchor="middle" font-family="Arial" font-size="22" fill="#5b21b6">arms wide</text>`,
});

/**
 * Review placeholder panel when no VP asset is available (never bubble people).
 * @param {{ title: string, plannedStyle: string, sceneDescription: string }} input
 * @returns {string} SVG fragment centered at 0,0-ish within card panel
 */
function reviewPlaceholderSvg(input) {
  const title = text(input.title).slice(0, 40);
  const style = text(input.plannedStyle).slice(0, 36);
  return `
    <rect x="-160" y="-120" width="320" height="240" rx="18" fill="#f8fafc" stroke="#64748b" stroke-width="4" stroke-dasharray="10 8"/>
    <text x="0" y="-50" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#334155">Visual Production required</text>
    <text x="0" y="-15" text-anchor="middle" font-family="Arial" font-size="18" fill="#475569">${escapeXml(title)}</text>
    <text x="0" y="20" text-anchor="middle" font-family="Arial" font-size="16" fill="#64748b">${escapeXml(style)}</text>
    <text x="0" y="55" text-anchor="middle" font-family="Arial" font-size="15" fill="#94a3b8">Owner review · no bubble SVG</text>
    <text x="0" y="85" text-anchor="middle" font-family="Arial" font-size="14" fill="#94a3b8">Do not publish until image attached</text>`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * Select intentional visual family for a teaching/object card.
 * Pack-level: pass `packStyle` to keep one family across the set.
 *
 * @param {object} input
 * @returns {{ family: TeachingCardVisualFamily, apiVisualStyle: string, preset: string, requiresHumanScene: boolean, allowsHandsObjectFallback: boolean, sceneDescription: string, diversityContext: string, generationPrompt: string, negativePrompt: string }}
 */
function selectTeachingCardVisual(input) {
  const s = input && typeof input === "object" ? input : {};
  const title = text(s.title || s.activityTitle);
  const packStyle = text(s.packStyle || s.packVisualFamily);
  const preferIllustrated = /\billustrat|cartoon|drawn\b/i.test(text(s.preferStyle || s.selectedStyle));
  const objectOnly = /\bapple|truck|tool|food|animal|object\b/i.test(title) && !isHumanActionCardTitle(title);
  const handsOk = /\bclean up|gentle hands|kind hands\b/i.test(title);

  /** @type {TeachingCardVisualFamily} */
  let family;
  if (packStyle && ["TEACHING_CARD_REALISTIC", "TEACHING_CARD_ILLUSTRATED", "OBJECT_CARD_REALISTIC", "OBJECT_CARD_ILLUSTRATED", "REALISTIC_HANDS_OBJECT"].includes(packStyle)) {
    family = /** @type {TeachingCardVisualFamily} */ (packStyle);
  } else if (objectOnly) {
    family = preferIllustrated ? "OBJECT_CARD_ILLUSTRATED" : "OBJECT_CARD_REALISTIC";
  } else if (handsOk && s.preferHandsFallback === true) {
    family = "REALISTIC_HANDS_OBJECT";
  } else if (preferIllustrated || text(s.selectedStyle) === TEACHING_CARD_ILLUSTRATED) {
    family = "TEACHING_CARD_ILLUSTRATED";
  } else {
    family = "TEACHING_CARD_REALISTIC";
  }

  const planned = visualPlan.planVisualProduction({
    activityTitle: title,
    ageBand: s.ageBand || "toddler_12_24",
    activityCategory: s.activityCategory || "Social-Emotional",
    setSize: Number(s.setSize || 6),
    selectedStyle: family === "TEACHING_CARD_ILLUSTRATED"
      ? "SOFT_EDUCATIONAL_ILLUSTRATION"
      : family === "OBJECT_CARD_ILLUSTRATED"
        ? "SIMPLE_OBJECT_ILLUSTRATION"
        : family === "OBJECT_CARD_REALISTIC" || family === "REALISTIC_HANDS_OBJECT"
          ? "REALISTIC_OBJECT_PHOTO"
          : "TEACHING_CARD_REALISTIC",
    preferHandsFallback: family === "REALISTIC_HANDS_OBJECT" || s.preferHandsFallback === true,
  });

  let generationPrompt = planned.generationPrompt;
  let negativePrompt = planned.negativePrompt;
  let apiVisualStyle = planned.apiVisualStyle;
  let preset = planned.plannedStyle === "TEACHING_CARD_REALISTIC" ? "teaching_card_realistic" : String(planned.plannedStyle || "").toLowerCase();

  if (family === "TEACHING_CARD_ILLUSTRATED") {
    apiVisualStyle = "SOFT_EDUCATIONAL_ILLUSTRATION";
    preset = TEACHING_CARD_ILLUSTRATED_PRESET;
    const scene = planned.sceneDescription;
    generationPrompt = [
      "Warm, professional early-childhood educational illustration.",
      "",
      "Show:",
      scene,
      "",
      "Style:",
      "high-quality children's picture-book / teacher-resource illustration,",
      "soft hand-drawn texture,",
      "natural child proportions,",
      "clear expressive body language,",
      "simple daycare environment,",
      "one immediately understandable action,",
      "age-appropriate materials,",
      "clean composition readable at small card size.",
      "",
      "Children should look individually drawn rather than like repeated vector templates.",
      "",
      `Diversity (set-aware): ${planned.diversityContext}`,
      "",
      "Avoid:",
      ILLUSTRATED_FORBIDDEN.join(", ") + ".",
    ].join("\n");
    negativePrompt = ILLUSTRATED_FORBIDDEN.join("; ");
  }

  return {
    family,
    apiVisualStyle,
    preset,
    requiresHumanScene: family === "TEACHING_CARD_REALISTIC" || family === "TEACHING_CARD_ILLUSTRATED",
    allowsHandsObjectFallback: family === "REALISTIC_HANDS_OBJECT" || handsOk || family.startsWith("OBJECT_"),
    sceneDescription: planned.sceneDescription,
    diversityContext: planned.diversityContext,
    generationPrompt,
    negativePrompt,
    printableNeed: planned.printableNeed,
    validation: planned.validation,
  };
}

/**
 * Resolve what the printable builder may draw for a card icon slot.
 * Never returns a primitive human SVG key.
 *
 * @param {object} input
 * @returns {{ mode: "hands_object"|"review_placeholder"|"object_ok", iconKey: string|null, bodySvg: string, visual: ReturnType<typeof selectTeachingCardVisual> }}
 */
function resolvePrintableCardVisual(input) {
  const s = input && typeof input === "object" ? input : {};
  const requestedIcon = text(s.iconKey || s.icon);
  if (isPrimitiveHumanSvgIconKey(requestedIcon)) {
    // Blocked path — do not pass through to SVG person renderer.
  } else if (requestedIcon && !isHumanActionCardTitle(s.title || "")) {
    return {
      mode: "object_ok",
      iconKey: requestedIcon,
      bodySvg: "",
      visual: selectTeachingCardVisual({ ...s, title: s.title || requestedIcon }),
    };
  }

  const visual = selectTeachingCardVisual(s);
  const title = text(s.title);
  const mapKey = requestedIcon && HANDS_OBJECT_SVG[requestedIcon]
    ? requestedIcon
    : mapTitleToHandsKey(title);

  // Interim cut sheets: hands/object SVG is allowed (never bubble people).
  // Final art still comes from Visual Production (realistic or illustrated).
  if (mapKey && HANDS_OBJECT_SVG[mapKey]) {
    return {
      mode: "hands_object",
      iconKey: null,
      bodySvg: HANDS_OBJECT_SVG[mapKey],
      visual,
    };
  }

  return {
    mode: "review_placeholder",
    iconKey: null,
    bodySvg: reviewPlaceholderSvg({
      title,
      plannedStyle: visual.family,
      sceneDescription: visual.sceneDescription,
    }),
    visual,
  };
}

/**
 * @param {string} title
 * @returns {string}
 */
function mapTitleToHandsKey(title) {
  const key = normalizeKey(title);
  if (key.includes("carry")) return "carry";
  if (key.includes("share")) return "share";
  if (key.includes("clean")) return "cleanup";
  if (key.includes("cheer")) return "cheer";
  if (key.includes("gentle") || key.includes("kind hands")) return "gentle";
  if (key.includes("stretch")) return "stretch";
  if (key.includes("jump")) return "jump";
  if (key.includes("tiptoe")) return "tiptoe";
  if (key.includes("freeze")) return "freeze";
  if (key.includes("fly")) return "fly";
  return "";
}

/**
 * Pack-level style lock: first card decides family for the set.
 * @param {Array<{ title: string }>} cards
 * @param {object} [options]
 * @returns {{ packStyle: TeachingCardVisualFamily, cards: Array<object> }}
 */
function planTeachingCardPackVisuals(cards, options) {
  const list = Array.isArray(cards) ? cards : [];
  const opts = options && typeof options === "object" ? options : {};
  const first = list[0] || { title: "Teaching card" };
  const packDecision = selectTeachingCardVisual({
    ...opts,
    title: first.title,
    setSize: list.length || Number(opts.setSize || 6),
  });
  const packStyle = packDecision.family;
  const plannedCards = list.map((card, index) => {
    const resolved = resolvePrintableCardVisual({
      ...opts,
      ...card,
      packStyle,
      setSize: list.length,
      cardIndex: index,
    });
    return {
      title: text(card.title),
      subtitle: text(card.subtitle),
      accent: card.accent,
      panel: card.panel,
      ...resolved,
    };
  });
  return { packStyle, cards: plannedCards, packDecision };
}

/**
 * Build illustrated teaching-card prompt (quality illustration, not bubble vector).
 * @param {object} input
 */
function buildTeachingCardIllustratedPrompt(input) {
  return selectTeachingCardVisual({
    ...(input && typeof input === "object" ? input : {}),
    selectedStyle: TEACHING_CARD_ILLUSTRATED,
  });
}

module.exports = {
  PRIMITIVE_HUMAN_SVG_ICON_KEYS,
  HUMAN_ACTION_CARD_TITLES,
  TEACHING_CARD_ILLUSTRATED,
  TEACHING_CARD_ILLUSTRATED_PRESET,
  ILLUSTRATED_REQUIRED,
  ILLUSTRATED_FORBIDDEN,
  HANDS_OBJECT_SVG,
  text,
  normalizeKey,
  isPrimitiveHumanSvgIconKey,
  isHumanActionCardTitle,
  assertNotPrimitiveHumanSvgIcon,
  selectTeachingCardVisual,
  resolvePrintableCardVisual,
  planTeachingCardPackVisuals,
  buildTeachingCardIllustratedPrompt,
  reviewPlaceholderSvg,
};
