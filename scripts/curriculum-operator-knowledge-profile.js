/**
 * Versioned Curriculum Operator childcare knowledge (modular sections, not one giant prompt).
 * Curriculum / safety / planning only — not medical diagnosis or personal data.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const KNOWLEDGE_PROFILE_VERSION = 2;

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
    "Short periods of alert attention; relationship-based activities, not worksheets.",
    "Tummy time with close supervision; support head and neck control.",
    "Looking at faces and high-contrast objects; tracking slow-moving objects.",
    "Gentle talking, singing, reading; respond to sounds and voices.",
    "Safe grasping and reaching; calm sensory experiences.",
    "No small objects, loose pieces, food placed in mouth, or unsafe textures.",
    "Feeding and sleep routines are individual.",
    "Learning through touch, movement, sound, and interaction.",
    "Never expect sit, crawl, stand, or talk on demand.",
  ],
  infant_3_6: [
    "Reaching and grasping; rolling support; tummy-time play.",
    "Mirror and face-to-face interaction; soft texture exploration.",
    "Simple songs and fingerplays; cause-and-effect toys.",
    "Picture books; tracking colorful objects; reaching toward toys.",
    "Safe floor-based movement; supported sitting only when appropriate.",
    "One or two materials at a time; constant supervision for mouthing and rolling.",
    "No loose sensory-bin materials.",
  ],
  infant_6_12: [
    "Crawling and movement exploration; pulling up and cruising.",
    "Safe object permanence; posting large objects into containers.",
    "Large stacking/nesting toys; simple container play; texture boards and fabric.",
    "Peekaboo; imitating sounds and actions; gestures and early communication.",
    "Board books with simple pictures; music and movement.",
    "Edible sensory only when approved; choking hazards treated extremely seriously.",
    "Materials too large to swallow; floor activities usually better than table.",
    "Repetition over constant novelty.",
  ],
  young_toddler: [
    "Learn through movement and repetition; activities may last only a few minutes.",
    "Parallel play is normal; sharing may not happen yet; language emerging and uneven.",
    "Simple one-step directions; choices instead of long explanations.",
    "Scribbling over drawing a specific object; large crayons and washable tools.",
    "Large-piece puzzles; sorting by one obvious feature; fill and dump play.",
    "Water play and play dough need close supervision; small objects unsafe.",
    "No accurate cutting, tracing, counting, or letter writing expectations.",
    "Songs, gestures, objects, and pictures support language; transition warnings and songs.",
    "Calm immediate guidance for bite/hit/grab/run; no shame or forced apologies.",
    "Movement breaks; simple cleanup modeled by the adult.",
  ],
  older_toddler: [
    "Two-step directions with support; vocabulary building quickly.",
    "Pretend play emerging; short cooperative play with help.",
    "Sorting by color/shape/size; playful counting, not performance.",
    "Matching pictures and objects; painting, stamping, tearing, gluing, play dough.",
    "Scissors with close supervision; large beads/small manipulatives may still be unsafe.",
    "Visual demonstrations; open-ended art over identical crafts.",
    "Questions: “What do you notice?” / “What happened?” — not one correct answer.",
    "Emotional labeling; help with waiting, turns, and conflict.",
    "Sitting and movement options; toileting, handwashing, coat, cleanup routines.",
    "Outdoor activities need clear boundaries; not preschool-level attention yet.",
  ],
  preschool_3_4: [
    "Short group activities; attention varies widely; complex pretend play.",
    "Several steps with visual support; patterns, matching, sorting, simple measurement.",
    "Counting with real objects; some letters, names, sounds, colors, shapes.",
    "Pre-writing: lines, curves, drawing, mark-making; cutting with safety support.",
    "Glue, brushes, rollers, sponges, simple tools; science = notice, predict, test, describe.",
    "Process art — not identical products; story retell with props.",
    "Prediction and explanation questions; adult help with conflict and regulation.",
    "Short positive rules; classroom jobs; extensions for ready children.",
    "Sensory and movement options; not every activity becomes a worksheet.",
  ],
  preschool_4_5: [
    "Longer multi-step projects; explain ideas with increasing detail.",
    "Compare, classify, sequence, describe changes; predict and test ideas.",
    "Group discussions; retell stories in order; intentional drawing details.",
    "Name writing and meaningful letter work; child-safe scissors with supervision.",
    "Count, compare quantities, simple addition through play; patterns, measurement, maps, graphs.",
    "Dramatic play with roles, signs, menus, pretend writing; collaboration with support.",
    "Peer problem-solving with coaching; open-ended challenges.",
    "Concrete safety explanations; no pressure to read/write beyond readiness.",
    "Playful embedded kindergarten preparation.",
  ],
  prek_k: [
    "Multi-step directions; longer group participation; story sequencing.",
    "Beginning sounds and rhyme; name writing and meaningful print.",
    "Counting, comparing, patterns, simple problem-solving through play.",
    "Fine-motor strengthening; cutting and drawing with increasing control.",
    "Collaboration, classroom responsibility, independent routines.",
    "Ask questions and explain thinking; plan and complete projects; manage materials.",
    "Self-help routines; transitions; handle mistakes and try again.",
    "Kindergarten readiness includes social-emotional skills, not worksheets alone.",
  ],
  mixed: [
    "Strictest-youngest rules for choking, tools, and supervision.",
    "Same activity idea with tiered support, challenge, materials, and duration per child.",
  ],
});

const DOMAINS = Object.freeze([
  "social-emotional", "language", "cognitive", "early literacy", "early mathematics",
  "science inquiry", "fine motor", "gross motor", "sensory", "creative arts",
  "music and movement", "dramatic play", "self-help", "approaches to learning",
  "executive function", "cultural awareness", "nature and environment",
]);

const ACTIVITY_PLANNING = Object.freeze([
  "For every activity document: what children do, teacher preparation, materials, realistic duration, what can go wrong, simplify/extend, mixed-age adapt, observations, age-fit questions, cleanup, safety.",
  "Activity types: sensory, process/open art, fine/gross motor, music/movement, story, dramatic play, blocks/construction, science, nature, math games, sorting/matching, cooking/food exploration, water, sand/sensory bin, outdoor, calm-down, social-emotional, small/whole group, individual invitations, transitions.",
  "Routines: arrival, cleanup, handwashing, snack/meal, rest, outdoor boundaries, and transitions are part of realistic planning.",
  "Family communication: optional family extensions without rewriting the classroom activity unless the owner asks.",
]);

const SAFETY_SUPERVISION = Object.freeze([
  "Choking hazards and small loose parts; balloons; food and allergies; latex; water play; sensory materials; play dough; paint; scissors; glue; hot or sharp tools.",
  "Outdoor boundaries; sun and weather; animal/nature materials; cleaning and sanitation; handwashing; body-safety language.",
  "Sleep and safe-rest boundaries; child privacy and identifying information in photos or plans.",
  "Never give medical diagnoses; never claim an activity treats autism, ADHD, delays, anxiety, or other conditions.",
  "State when direct supervision, one-on-one support, pre-cut materials, large materials only, allergy substitutions, smaller group, outdoor space, or director/parent approval is required.",
]);

const BEHAVIOR_GUIDANCE = Object.freeze([
  "Redirection, positive phrasing, visual schedules, first-then language, transition warnings, choice-making, calm-down spaces, co-regulation, modeling, narrating emotions.",
  "Help children solve conflicts and take turns; support children who opt out of participation.",
  "No forced sharing, forced eye contact, humiliation, punishment-based lesson plans, or good/bad child language.",
  "Offer reasonable alternatives (e.g. “Hands are for helping”); respect sensory needs and different communication.",
]);

const INCLUSION = Object.freeze([
  "Adapt for autism-related needs, ADHD traits, speech/language differences, motor differences, sensory sensitivities, visual/hearing differences, ELL, cultural backgrounds, shy/slow-to-warm children, movement needs, messy-play avoiders, visual supports, more/ fewer steps, AAC/gestures — never diagnose from behavior.",
]);

const BOOKS_RESEARCH = Object.freeze([
  "Match books to theme and age; preserve owner-supplied titles; never invent authors/links/citations.",
  "Mark unverified books for owner review; keep research separate from lesson creation until confirmed.",
  "Diverse characters; nonfiction when appropriate; before/during/after questions; story props; activity connection.",
]);

const PRINTABLES = Object.freeze([
  "Appropriate: picture/matching/sorting/sequencing cards, story props, visual schedules, counting mats, pattern cards, bingo/game boards, scavenger hunts, observation sheets, family pages, teacher planning sheets, name/vocabulary cards, dramatic-play signs, simple preschool pre-writing/tracing when age-fit.",
  "Avoid: baby worksheets, excessive toddler tracing, generic unrelated coloring, skills above age, thin repeated pages, unlinked packs, copyright copy, tiny unsafe pieces.",
  "Required: clear purpose, age-appropriate content, specific activity connection, original content, valid letter-size PDF unless requested otherwise, explicit page count, correct activity and week linkage, teacher-use notes when needed, preview and download verification.",
]);

const IMAGES = Object.freeze([
  "Cover image = theme-level realistic childcare photo; activity image = exact activity, materials, and actions for that activity.",
  "Realistic classroom lighting, natural expressions, realistic materials, age-appropriate children.",
  "No text overlays, cartoons, generic scenes, copied reference instructions on wrong activities, logos, duplicate children, distorted hands, or fake writing unless requested.",
  "Preserve valid existing images; replace only with evidence; generate when missing or explicitly requested.",
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
      ...DEVELOPMENT.infant_0_3,
      ...DEVELOPMENT.infant_3_6,
      ...DEVELOPMENT.infant_6_12,
    ].slice(0, maxLines);
  }
  const lines = DEVELOPMENT[stage];
  return schema.asArray(lines).slice(0, maxLines);
}

function getSectionLines(sectionId, options = {}) {
  const maxLines = Number(options.maxLines) || 20;
  const id = schema.text(sectionId, 40);
  switch (id) {
    case "development": {
      const stage = schema.text(options.stage, 40) || "preschool_3_4";
      return developmentLinesForStage(stage, maxLines);
    }
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
    ...developmentLinesForStage(stage === "infant_all" ? "infant_all" : stage, 10),
    ...SAFETY_SUPERVISION.slice(0, 4),
    ...BEHAVIOR_GUIDANCE.slice(0, 3),
    ...ACTIVITY_PLANNING.slice(0, 2),
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
