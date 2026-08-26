/**
 * Central visual prompt builder for LLH Admin AI / Operator pipelines.
 *
 * Selects asset-mode-specific templates. Does NOT generate pixels.
 * Text overlays belong in PDF/layout — model output should stay text-free
 * unless the asset mode explicitly allows illustration-only labels.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const ASSET_MODES = Object.freeze({
  REALISTIC_ACTIVITY_PHOTO: "REALISTIC_ACTIVITY_PHOTO",
  REALISTIC_ACTIVITY_EXAMPLE: "REALISTIC_ACTIVITY_EXAMPLE",
  REALISTIC_LESSON_COVER: "REALISTIC_LESSON_COVER",
  TEACHING_CARD_ILLUSTRATED: "TEACHING_CARD_ILLUSTRATED",
  PICTURE_CARD_REALISTIC: "PICTURE_CARD_REALISTIC",
  ACTION_CARD_ILLUSTRATED: "ACTION_CARD_ILLUSTRATED",
  HIGH_CONTRAST_INFANT: "HIGH_CONTRAST_INFANT",
  PRINTABLE_CUTOUT: "PRINTABLE_CUTOUT",
  DRAMATIC_PLAY_VISUAL: "DRAMATIC_PLAY_VISUAL",
  VISUAL_STRIP: "VISUAL_STRIP",
  MATCHING_SORTING_CARD: "MATCHING_SORTING_CARD",
  TEACHER_DOCUMENTATION_CARD: "TEACHER_DOCUMENTATION_CARD",
});

const REALISTIC_PHOTO_EXCLUSIONS = Object.freeze([
  "extra fingers or missing fingers",
  "merged or malformed hands",
  "extra arms or duplicated limbs",
  "distorted or uncanny faces",
  "plastic-looking skin",
  "fake AI stock-photo faces",
  "floating objects",
  "duplicated toys or materials",
  "random unrelated toys or clutter",
  "unreadable generated text",
  "gibberish signs or labels",
  "logos or watermarks",
  "cartoon or illustration rendering",
  "storybook or fantasy elements",
  "over-staged smiling-at-camera stock poses",
  "luxury fake daycare staging",
  "materials not listed for this activity",
]);

const PRINTABLE_VISUAL_EXCLUSIONS = Object.freeze([
  "embedded generated text or words inside the artwork",
  "gibberish lettering",
  "watermarks or logos",
  "mixed illustration styles within one pack",
  "decorative clipart filler",
  "cluttered backgrounds",
  "tiny unsafe toddler manipulative pieces",
  "unclear subject",
  "random unrelated objects",
]);

const GENERIC_OPENER_RE = /^Realistic childcare classroom photograph for a /i;

function text(value, max = 2000) {
  return schema.text(value, max);
}

function oneLine(value, max = 1200) {
  return text(value, max).replace(/\s+/g, " ").trim();
}

function lines(value) {
  if (Array.isArray(value)) return value.map((v) => text(v, 240)).filter(Boolean);
  return text(value, 1200).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function normalizeAgeBand(raw) {
  const s = text(raw, 80).toLowerCase();
  if (/infant|0.?6\s*month|baby/.test(s)) return { key: "infant", label: text(raw, 80) || "Infant" };
  if (/toddler|12.?24|18.?24/.test(s)) return { key: "toddler", label: text(raw, 80) || "Toddler" };
  if (/preschool|3.?4|4.?5/.test(s)) return { key: "preschool", label: text(raw, 80) || "Preschool" };
  if (/pre-k|prek|kindergarten/.test(s)) return { key: "prek", label: text(raw, 80) || "Pre-K" };
  return { key: "early_childhood", label: text(raw, 80) || "Early childhood" };
}

function ageSafetyRules(ageBand) {
  const key = ageBand?.key || "early_childhood";
  if (key === "infant") {
    return [
      "Supervised infant-safe setup only",
      "No choking-size loose parts",
      "Realistic floor or low-table infant scale",
      "Simple high-contrast focal subject when infants are shown",
    ];
  }
  if (key === "toddler") {
    return [
      "Large toddler-scale materials only",
      "No worksheets or pencil-paper academic tasks",
      "No tiny cut pieces or choking hazards",
      "One clear action at a time when children are shown",
    ];
  }
  if (key === "preschool" || key === "prek") {
    return [
      "Hands-on play-based materials",
      "Developmentally appropriate preschool scale",
      "Avoid worksheet-heavy school look unless explicitly requested",
    ];
  }
  return ["Developmentally appropriate early-childhood scale and supervision"];
}

function validatePromptContext(input = {}) {
  const missing = [];
  const title = text(input.activityTitle, 180);
  const materials = oneLine(input.materials, 400);
  const setup = oneLine(input.setup, 400);
  const steps = oneLine(input.steps, 400);
  const ownerBrief = oneLine(input.ownerBrief, 800);
  if (!title) missing.push("activityTitle");
  if (!materials && !setup && !ownerBrief) missing.push("materials_or_setup");
  if (!steps && !oneLine(input.description, 400) && !oneLine(input.objective, 400) && !ownerBrief) {
    missing.push("action_context");
  }
  return {
    ok: missing.length === 0,
    missing,
    shouldBlockGeneration: missing.includes("activityTitle")
      || (missing.includes("materials_or_setup") && missing.includes("action_context")),
  };
}

function realisticCompositionBlock(ageBand, purpose = "setup") {
  const purposeLine = purpose === "example"
    ? "Show a believable in-process or finished example using the same listed materials."
    : "Show the exact invitation/setup a teacher would prepare before children begin.";
  return [
    purposeLine,
    "Documentary candid teacher-resource photography, not glossy stock photography.",
    "Medium close-up or medium shot with the activity setup clearly visible.",
    "Natural soft daylight, realistic proportions, shallow-to-moderate depth of field.",
    "Natural early-childhood classroom background; slightly imperfect real arrangement.",
    "If children appear: supervised, age-appropriate proportions, hands/material interaction visible when helpful.",
    "Do NOT render text, titles, labels, logos, or watermarks inside the image.",
  ].join(" ");
}

function buildRealisticActivityPhoto(input, purpose = "setup") {
  const ageBand = normalizeAgeBand(input.ageBand);
  const title = text(input.activityTitle, 180);
  const materials = lines(input.materials).join(", ");
  const setup = oneLine(input.setup, 500);
  const steps = lines(input.steps).slice(0, 5).join("; ");
  const objective = oneLine(input.objective, 240);
  const description = oneLine(input.description, 240);
  const action = steps || description || objective;
  const ownerBrief = oneLine(input.ownerBrief, 800);

  if (ownerBrief) {
    return [
      `Documentary-style realistic childcare classroom photograph for ${ageBand.label}.`,
      `Activity: “${title}”.`,
      `OWNER DIRECTION: ${ownerBrief}`,
      materials ? `Only these materials may appear: ${materials}.` : "",
      setup ? `Setup: ${setup}` : "",
      action ? `Children/teacher action to show: ${action}.` : "",
      realisticCompositionBlock(ageBand, purpose),
      ...ageSafetyRules(ageBand),
      `Exclude: ${REALISTIC_PHOTO_EXCLUSIONS.join("; ")}.`,
    ].filter(Boolean).join(" ");
  }

  return [
    `Documentary-style realistic childcare classroom photograph of ${ageBand.label} doing “${title}”.`,
    setup || `Show the exact physical setup for “${title}” at child-appropriate height.`,
    materials ? `Only these materials visible: ${materials}.` : "",
    action ? `Show what the child/children are doing: ${action}.` : "",
    text(input.lessonTheme, 80) ? `Lesson theme ${text(input.lessonTheme, 80)} — show the activity, not decorative theme art.` : "",
    realisticCompositionBlock(ageBand, purpose),
    ...ageSafetyRules(ageBand),
    `Exclude: ${REALISTIC_PHOTO_EXCLUSIONS.join("; ")}.`,
  ].filter(Boolean).join(" ");
}

function buildRealisticLessonCover(input) {
  const ageBand = normalizeAgeBand(input.ageBand);
  const title = text(input.lessonTitle, 180);
  const rep = text(input.representativeActivityTitle || input.activityTitle, 180);
  const materials = lines(input.materials).slice(0, 6).join(", ");
  return [
    `Realistic warm childcare classroom cover photograph for lesson “${title}” (${ageBand.label}).`,
    rep ? `Representative activity: “${rep}”.` : "",
    materials ? `Visible materials from the lesson: ${materials}.` : "",
    "Candid documentary classroom photography showing a developmentally appropriate hands-on activity.",
    "Inviting but believable — not generic smiling-child stock art, not cartoon cover art.",
    "No decorative title graphics; no text rendered in the image.",
    `Exclude: ${REALISTIC_PHOTO_EXCLUSIONS.join("; ")}.`,
  ].filter(Boolean).join(" ");
}

function buildIllustratedTeachingCard(input) {
  const ageBand = normalizeAgeBand(input.ageBand);
  const subject = text(input.visualSubject || input.visualConcept || input.activityTitle, 160);
  return [
    `Clean modern educational illustration for childcare printable card (${ageBand.label}).`,
    `Subject: ${subject}.`,
    text(input.printablePurpose, 200) ? `Purpose: ${text(input.printablePurpose, 200)}.` : "",
    "Flat consistent line weight, simple shapes, inclusive representation, plain light background.",
    "One clear central subject; high visual contrast; no decorative filler.",
    "No embedded text — captions added later by PDF renderer.",
    `Exclude: ${PRINTABLE_VISUAL_EXCLUSIONS.join("; ")}; no storybook fantasy style.`,
  ].filter(Boolean).join(" ");
}

function buildActionCardIllustrated(input) {
  const action = text(input.visualSubject || input.visualConcept || input.activityTitle, 120);
  return [
    `Clean educational action illustration showing the action “${action}” for toddler/preschool prompt cards.`,
    "The visual must make the action understandable without reading words.",
    "Simple anatomically normal hands only if hands are shown; otherwise show the action with objects only.",
    "Plain light background, one action, large clear composition, no embedded text.",
    `Exclude: ${PRINTABLE_VISUAL_EXCLUSIONS.join("; ")}; no malformed fingers; no photorealistic uncanny hands.`,
  ].join(" ");
}

function buildPictureCardRealistic(input) {
  const ageBand = normalizeAgeBand(input.ageBand);
  const subject = text(input.visualSubject || input.visualConcept, 160);
  return [
    `Realistic isolated childcare printable picture card (${ageBand.label}).`,
    `Single clear subject: ${subject}.`,
    "Front view, plain light background, large central visual, high contrast, text-free artwork.",
    `For printable pack “${text(input.printableTitle, 100)}”.`,
    `Exclude: ${PRINTABLE_VISUAL_EXCLUSIONS.join("; ")}.`,
  ].filter(Boolean).join(" ");
}

function buildHighContrastInfant(input) {
  const subject = text(input.visualSubject || input.visualConcept, 120);
  return [
    "High-contrast black-and-white infant visual card.",
    subject ? `Bold simple subject: ${subject}.` : "Bold simple shape for visual tracking.",
    "Minimal details, no clutter, no embedded text, no complex full-color scene.",
    "Exclude: clutter, gradients, tiny details, embedded text, cartoon mascots.",
  ].filter(Boolean).join(" ");
}

function buildPrintableCutout(input) {
  const ageBand = normalizeAgeBand(input.ageBand);
  const subject = text(input.visualSubject || input.visualConcept, 120);
  return [
    `Printable cutout/manipulative visual (${ageBand.label}).`,
    `Subject: ${subject}.`,
    "Clean edges, plain white margin space for cutting, consistent scale, no background clutter.",
    ageBand.key === "toddler" ? "Large safe toddler size — no tiny pieces." : "",
    "No embedded text; labels added by layout system.",
    `Exclude: ${PRINTABLE_VISUAL_EXCLUSIONS.join("; ")}.`,
  ].filter(Boolean).join(" ");
}

function buildDramaticPlayVisual(input) {
  const ageBand = normalizeAgeBand(input.ageBand);
  const subject = text(input.visualSubject || input.visualConcept || input.activityTitle, 160);
  return [
    `Classroom dramatic-play visual (${ageBand.label}) for “${subject}”.`,
    "Large clear icon/illustration matching the play prop or station — usable when printed.",
    "Minimal decoration, plain background, NO readable text baked into the artwork.",
    "Titles and labels will be added by PDF renderer afterward.",
    `Exclude: ${PRINTABLE_VISUAL_EXCLUSIONS.join("; ")}; no fake logos; no gibberish signage.`,
  ].filter(Boolean).join(" ");
}

function buildVisualStrip(input) {
  const step = text(input.stepLabel || input.visualSubject, 120);
  const index = Number(input.stepIndex) || 1;
  return [
    `Sequential step ${index} visual for childcare printable strip.`,
    step ? `This step shows: ${step}.` : "",
    "Must differ clearly from other steps; consistent viewpoint/style; simple short scene.",
    "No embedded text or numbers in the artwork.",
    `Exclude: ${PRINTABLE_VISUAL_EXCLUSIONS.join("; ")}; no repeated identical panels.`,
  ].filter(Boolean).join(" ");
}

function buildMatchingSortingCard(input) {
  return buildIllustratedTeachingCard({
    ...input,
    printablePurpose: input.printablePurpose || "Matching or sorting card — visually distinct category item.",
  });
}

function buildTeacherDocumentationCard(input) {
  const ageBand = normalizeAgeBand(input.ageBand);
  return [
    `Simple practical teacher documentation card frame (${ageBand.label}).`,
    "Plenty of white space for writing/photos; minimal decoration; text added by renderer not image model.",
    "Exclude: decorative clutter, embedded gibberish text, mixed styles.",
  ].join(" ");
}

function resolvePrintableAssetMode(input = {}) {
  const concept = text(input.visualConcept || input.visualSubject, 160).toLowerCase();
  const title = text(input.printableTitle, 120).toLowerCase();
  const pageType = text(input.pageType, 40).toLowerCase();
  if (/high.?contrast|infant/.test(concept) || input.ageBandKey === "infant") return ASSET_MODES.HIGH_CONTRAST_INFANT;
  if (/sequenc|strip|step/.test(pageType) || /step \d|sequence/.test(concept)) return ASSET_MODES.VISUAL_STRIP;
  if (/dramatic|station sign|play pack|menu|order ticket/.test(title + concept)) return ASSET_MODES.DRAMATIC_PLAY_VISUAL;
  if (/matching|sorting|habitat|category|pair/.test(pageType + concept)) return ASSET_MODES.MATCHING_SORTING_CARD;
  if (/documentation|gallery|photo label|i made this/.test(title + concept)) return ASSET_MODES.TEACHER_DOCUMENTATION_CARD;
  if (/cutout|manipulative|token|piece|sorting card|shape|symbol/.test(pageType + concept)) return ASSET_MODES.PRINTABLE_CUTOUT;
  if (/squeeze|stack|stick|press|roll|build|choose|calm|wash/.test(concept)) return ASSET_MODES.ACTION_CARD_ILLUSTRATED;
  if (/realistic|photo|classroom/.test(text(input.styleMode, 40).toLowerCase())) return ASSET_MODES.PICTURE_CARD_REALISTIC;
  return ASSET_MODES.TEACHING_CARD_ILLUSTRATED;
}

/**
 * @param {object} input
 * @returns {{ assetMode: string, generationPrompt: string, negativePrompt: string, warnings: string[], missingContext: string[], textGeneratedByModel: boolean, fallbackRecommended: string|null }}
 */
function buildVisualPrompt(input = {}) {
  const mode = text(input.assetMode, 80) || resolvePrintableAssetMode(input);
  const context = validatePromptContext(input);
  const warnings = [];
  if (context.missing.length) {
    warnings.push(`missing_context:${context.missing.join(",")}`);
  }

  let generationPrompt = "";
  let negativePrompt = "";
  let fallbackRecommended = null;

  switch (mode) {
    case ASSET_MODES.REALISTIC_ACTIVITY_EXAMPLE:
      generationPrompt = buildRealisticActivityPhoto(input, "example");
      negativePrompt = REALISTIC_PHOTO_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.REALISTIC_LESSON_COVER:
      generationPrompt = buildRealisticLessonCover(input);
      negativePrompt = REALISTIC_PHOTO_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.ACTION_CARD_ILLUSTRATED:
      generationPrompt = buildActionCardIllustrated(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.concat(["malformed photorealistic hands"]).join("; ");
      fallbackRecommended = "illustrated_action_card_if_hands_fail";
      break;
    case ASSET_MODES.PICTURE_CARD_REALISTIC:
      generationPrompt = buildPictureCardRealistic(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.HIGH_CONTRAST_INFANT:
      generationPrompt = buildHighContrastInfant(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.PRINTABLE_CUTOUT:
      generationPrompt = buildPrintableCutout(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.DRAMATIC_PLAY_VISUAL:
      generationPrompt = buildDramaticPlayVisual(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.VISUAL_STRIP:
      generationPrompt = buildVisualStrip(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.MATCHING_SORTING_CARD:
      generationPrompt = buildMatchingSortingCard(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.TEACHER_DOCUMENTATION_CARD:
      generationPrompt = buildTeacherDocumentationCard(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.TEACHING_CARD_ILLUSTRATED:
      generationPrompt = buildIllustratedTeachingCard(input);
      negativePrompt = PRINTABLE_VISUAL_EXCLUSIONS.join("; ");
      break;
    case ASSET_MODES.REALISTIC_ACTIVITY_PHOTO:
    default:
      generationPrompt = buildRealisticActivityPhoto(input, text(input.imagePurpose, 20) === "example" ? "example" : "setup");
      negativePrompt = REALISTIC_PHOTO_EXCLUSIONS.join("; ");
      break;
  }

  return {
    assetMode: mode,
    generationPrompt: oneLine(generationPrompt, 4000),
    negativePrompt,
    warnings,
    missingContext: context.missing,
    shouldBlockGeneration: context.shouldBlockGeneration,
    textGeneratedByModel: false,
    fallbackRecommended,
  };
}

function isGenericLegacyActivityPrompt(prompt) {
  return GENERIC_OPENER_RE.test(text(prompt, 500));
}

function assessPromptQuality(bundle = {}) {
  const prompt = text(bundle.generationPrompt, 4000);
  const issues = [];
  if (!prompt) issues.push("empty_prompt");
  if (isGenericLegacyActivityPrompt(prompt)) issues.push("generic_legacy_opener");
  if (/REALISTIC_ACTIVITY|ACTIVITY_PHOTO/i.test(bundle.assetMode || "")) {
    if (!/Documentary-style realistic/i.test(prompt)) issues.push("missing_documentary_standard");
    if (!/Exclude:/i.test(prompt)) issues.push("missing_exclusions");
    if (!/materials|setup|OWNER DIRECTION/i.test(prompt)) issues.push("missing_setup_materials");
  }
  if (/CARD|PRINTABLE|CUTOUT|STRIP|DRAMATIC/i.test(bundle.assetMode || "")) {
    if (!/no embedded text|text added|text-free|No embedded text/i.test(prompt)) issues.push("missing_text_free_rule");
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  ASSET_MODES,
  REALISTIC_PHOTO_EXCLUSIONS,
  PRINTABLE_VISUAL_EXCLUSIONS,
  buildVisualPrompt,
  validatePromptContext,
  assessPromptQuality,
  isGenericLegacyActivityPrompt,
  normalizeAgeBand,
  resolvePrintableAssetMode,
};
