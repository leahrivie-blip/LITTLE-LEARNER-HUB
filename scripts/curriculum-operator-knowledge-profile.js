/**
 * Versioned Curriculum Operator childcare knowledge (modular sections, not one giant prompt).
 * Curriculum / safety / planning only — not medical diagnosis or personal data.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const KNOWLEDGE_PROFILE_VERSION = 1;

const SECTION_IDS = Object.freeze([
  "development",
  "domains",
  "activity_planning",
  "safety_supervision",
  "behavior_guidance",
  "inclusion",
  "books_research",
  "printables",
  "images",
]);

const DEVELOPMENT = Object.freeze({
  infant_0_3: [
    "Short alert attention; relationship-based care, not worksheets.",
    "Tummy time with close supervision; support head/neck; never demand sit/crawl/stand on cue.",
    "Faces, high-contrast objects, slow tracking, gentle talk/sing/read; respond to sounds.",
    "Safe grasping/reaching; calm sensory experiences; no small objects, loose pieces, or unsafe mouthing.",
    "Feeding and sleep routines are individual; learning through touch, movement, sound, interaction.",
  ],
  infant_3_6: [
    "Reaching, grasping, rolling support, tummy-time play, mirror and face-to-face interaction.",
    "Soft textures, simple songs/fingerplays, cause-and-effect toys, picture books, colorful tracking.",
    "One or two materials at a time; constant supervision for mouthing/rolling; no loose sensory-bin fills.",
    "Supported sitting only when developmentally appropriate; safe floor-based movement.",
  ],
  infant_6_12: [
    "Crawling, pulling up, cruising; safe object permanence and large posting/stacking/container play.",
    "Peekaboo, imitate sounds/actions, gestures, board books, music and movement.",
    "Materials too large to swallow; choking treated seriously; floor activities often beat table setups.",
    "Repetition over novelty; edible sensory only when approved; no loose small parts.",
  ],
  young_toddler: [
    "Learn through movement and repetition; activities may last only a few minutes; parallel play is normal.",
    "Simple one-step directions, choices not lectures; large crayons, washable tools, large-piece puzzles.",
    "Fill/dump and one-feature sorting OK; water and play dough need close supervision; small objects unsafe.",
    "No accurate cutting, tracing, counting, or letter writing expectations; transitions need warnings/songs.",
    "Calm guidance for biting/hitting/grabbing; avoid shame or forced apologies; model cleanup.",
  ],
  older_toddler: [
    "Two-step directions with support; pretend play emerging; short cooperative play with help.",
    "Open-ended art over identical crafts; visual demos; questions like “What do you notice?” not correct-answer drills.",
    "Scissors only with close supervision; large beads/small manipulatives may still be unsafe.",
    "Emotional labeling, turn-taking and conflict support; sitting and movement options; clear outdoor boundaries.",
  ],
  preschool_3_4: [
    "Short group activities; attention varies; complex pretend play; multi-step with visual supports.",
    "Patterns, matching, sorting, measurement through real objects; pre-writing via lines, curves, mark-making.",
    "Process art — not identical products; science = notice, predict, test, describe; story props for retell.",
    "Short positive rules; classroom jobs; extensions for ready children; sensory and movement options.",
  ],
  preschool_4_5: [
    "Longer multi-step projects; compare, classify, sequence, predict, and test ideas in play.",
    "Group discussion, story order retell, intentional drawing, meaningful letter/name work with supervision.",
    "Dramatic play with roles/signs/menus; peer problem-solving with coaching; playful kindergarten prep — not pressure.",
  ],
  prek_k: [
    "Multi-step directions, longer groups, story sequencing, rhyme/beginning sounds, meaningful print.",
    "Counting, patterns, problem-solving through play; fine-motor strengthening; self-help and routines.",
    "Collaboration, managing materials, handling mistakes; social-emotional readiness equals worksheet memorization.",
  ],
  mixed: [
    "Strictest-youngest rules for choking, tools, and supervision; tier support/challenge on the same activity idea.",
  ],
});

const DOMAINS = Object.freeze([
  "social-emotional", "language", "cognitive", "early literacy", "early mathematics",
  "science inquiry", "fine motor", "gross motor", "sensory", "creative arts",
  "music and movement", "dramatic play", "self-help", "approaches to learning",
  "executive function", "cultural awareness", "nature and environment",
]);

const ACTIVITY_PLANNING = Object.freeze([
  "Each activity: child actions, teacher prep, materials, realistic duration, simplify/extend, mixed-age adapt, observations, questions, cleanup, safety.",
  "Activity types: sensory, process/open art, fine/gross motor, music/movement, story, dramatic play, blocks, science, nature, math games, water/sand, transitions, calm-down, family extensions.",
]);

const SAFETY_SUPERVISION = Object.freeze([
  "Choking/small parts, balloons, food/allergies, latex, water, sensory bins, play dough, paint, scissors, glue, heat/sharp tools, outdoor boundaries, sun/weather, sanitation, handwashing.",
  "Never diagnose or claim activities treat autism, ADHD, delays, anxiety, or medical conditions.",
  "Flag when direct supervision, one-on-one, pre-cut materials, large pieces only, allergy subs, smaller group, outdoor space, or director approval is required.",
  "Child privacy: no identifying details in plans; photos follow owner image rules.",
]);

const BEHAVIOR_GUIDANCE = Object.freeze([
  "Redirection, positive phrasing, visual schedules, first-then, transition warnings, choices, calm-down spaces, co-regulation, emotion narration, conflict coaching.",
  "No forced sharing, forced eye contact, humiliation, punishment-based plans, or good/bad child language.",
  "Support non-participation, sensory needs, and different communication styles.",
]);

const INCLUSION = Object.freeze([
  "Adapt for motor/sensory/speech/language, ELL, cultural diversity, shy children, movement needs, messy-play avoiders, visual supports, AAC/gestures — without diagnosing.",
]);

const BOOKS_RESEARCH = Object.freeze([
  "Match books to theme and age; preserve owner-supplied titles; never invent authors/links/citations.",
  "Mark unverified books for owner review; keep research separate from lesson creation until confirmed.",
  "Diverse characters; nonfiction when appropriate; before/during/after questions; story props; activity connection.",
]);

const PRINTABLES = Object.freeze([
  "Appropriate: picture/matching/sorting/sequencing cards, story props, visual schedules, mats, patterns, hunts, observation/family pages, dramatic-play signs, age-fit pre-writing.",
  "Avoid: baby worksheets, excessive toddler tracing, generic coloring, age-inappropriate skills, thin meaningless pages, unlinked packs, copyright copy, tiny unsafe pieces.",
  "Required: purpose, age fit, activity link, original content, valid letter-size PDF, page count, week+activity linkage, preview/download verification.",
]);

const IMAGES = Object.freeze([
  "Cover = theme-level realistic childcare photo; activity = exact materials/actions for that activity.",
  "Realistic lighting and expressions; no text/logos/cartoons unless requested; preserve good images; replace only with evidence.",
]);

function resolveDevelopmentStage(ageBand, ageLabel = "") {
  const band = schema.text(ageBand, 40).toLowerCase();
  const label = schema.text(ageLabel, 120).toLowerCase();
  if (band === "infant") {
    if (/0[\s–-]3|birth[\s–-]3/.test(label)) return "infant_0_3";
    if (/3[\s–-]6|4[\s–-]6/.test(label)) return "infant_3_6";
    if (/6[\s–-]12|7[\s–-]12|9[\s–-]12/.test(label)) return "infant_6_12";
    return "infant_all";
  }
  if (band === "toddler") {
    if (/12[\s–-]24|young\s+toddler/.test(label)) return "young_toddler";
    if (/2[\s–-]3|older\s+toddler/.test(label)) return "older_toddler";
    return "older_toddler";
  }
  if (band === "preschool") {
    if (/3[\s–-]4/.test(label) && !/4[\s–-]5/.test(label)) return "preschool_3_4";
    if (/4[\s–-]5|5[\s–-]5/.test(label)) return "preschool_4_5";
    return "preschool_3_4";
  }
  if (band === "school_age") return "prek_k";
  if (band === "mixed") return "mixed";
  return "preschool_3_4";
}

function developmentLinesForStage(stage, maxLines = 12) {
  if (stage === "infant_all") {
    return [
      ...DEVELOPMENT.infant_0_3.slice(0, 3),
      ...DEVELOPMENT.infant_3_6.slice(0, 2),
      ...DEVELOPMENT.infant_6_12.slice(0, 3),
    ].slice(0, maxLines);
  }
  const lines = DEVELOPMENT[stage];
  return schema.asArray(lines).slice(0, maxLines);
}

function getSectionLines(sectionId, maxLines = 20) {
  const id = schema.text(sectionId, 40);
  switch (id) {
    case "development":
      return developmentLinesForStage("preschool_3_4", maxLines);
    case "domains":
      return [`Check which domains an activity supports (do not claim every domain): ${DOMAINS.join(", ")}.`];
    case "activity_planning":
      return ACTIVITY_PLANNING.slice(0, maxLines);
    case "safety_supervision":
      return SAFETY_SUPERVISION.slice(0, maxLines);
    case "behavior_guidance":
      return BEHAVIOR_GUIDANCE.slice(0, maxLines);
    case "inclusion":
      return INCLUSION.slice(0, maxLines);
    case "books_research":
      return BOOKS_RESEARCH.slice(0, maxLines);
    case "printables":
      return PRINTABLES.slice(0, maxLines);
    case "images":
      return IMAGES.slice(0, maxLines);
    default:
      return [];
  }
}

/**
 * Lines injected into architect/upgrade prompts for a lesson brief (capped).
 */
function architectSupplementLines(brief = {}, options = {}) {
  const maxLines = Math.min(40, Math.max(8, Number(options.maxLines) || 24));
  const ageBand = schema.text(brief.ageBand, 40).toLowerCase();
  const stage = resolveDevelopmentStage(ageBand, brief.ageLabel || brief.age);
  const out = [
    `Knowledge profile v${KNOWLEDGE_PROFILE_VERSION} (${stage}).`,
    ...developmentLinesForStage(stage === "infant_all" ? "infant_all" : stage, 8),
    ...SAFETY_SUPERVISION.slice(0, 3),
    ...BEHAVIOR_GUIDANCE.slice(0, 2),
  ];
  if (schema.asArray(brief.explicitPrintables).length || brief.requestedFeatures?.printables) {
    out.push(...PRINTABLES.slice(0, 3));
  }
  if (brief.requestedFeatures?.images || brief.coverRequested) {
    out.push(...IMAGES.slice(0, 2));
  }
  if (schema.asArray(brief.suppliedBooks).length || brief.requestedFeatures?.books) {
    out.push(...BOOKS_RESEARCH.slice(0, 2));
  }
  out.push(...INCLUSION.slice(0, 1));
  out.push(...ACTIVITY_PLANNING.slice(0, 1));
  return [...new Set(out.map((l) => schema.text(l, 500)).filter(Boolean))].slice(0, maxLines);
}

function attachToBrief(brief = {}) {
  const stage = resolveDevelopmentStage(brief.ageBand, brief.ageLabel || brief.age);
  return {
    ...brief,
    knowledgeProfileVersion: KNOWLEDGE_PROFILE_VERSION,
    knowledgeProfileStage: stage,
    knowledgeProfileSections: SECTION_IDS.slice(),
  };
}

function safetyFlagsFromKnowledge({ ageBand, title, materialsText = "", ownerInstructions = "" }) {
  const blob = `${title} ${materialsText} ${ownerInstructions}`.toLowerCase();
  const flags = [];
  const notes = [];
  if (/\b(balloon|latex)\b/i.test(blob)) {
    flags.push("balloon_latex_risk");
    notes.push("Balloons/latex require strict safety policies — confirm program rules.");
  }
  if (/\b(diagnose|treat|therapy for|autism cure|adhd fix)\b/i.test(blob)) {
    flags.push("medical_claim");
    notes.push("Do not claim activities diagnose or treat medical/developmental conditions.");
  }
  if (ageBand === "infant" && /\b(sensory bin|loose rice|beans|water bead)\b/i.test(blob)) {
    flags.push("infant_loose_sensory");
    notes.push("Loose sensory-bin materials are unsafe for infants.");
  }
  if ((ageBand === "toddler" || ageBand === "infant") && /\b(tracing worksheet|write your name|letter worksheet)\b/i.test(blob)) {
    flags.push("worksheet_above_age");
    notes.push("Worksheet-style expectations may be above this age band.");
  }
  return { flags, notes };
}

module.exports = {
  KNOWLEDGE_PROFILE_VERSION,
  SECTION_IDS,
  DOMAINS,
  resolveDevelopmentStage,
  developmentLinesForStage,
  getSectionLines,
  architectSupplementLines,
  attachToBrief,
  safetyFlagsFromKnowledge,
};
