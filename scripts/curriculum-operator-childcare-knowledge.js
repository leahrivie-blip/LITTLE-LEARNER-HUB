/**
 * Structured age-band childcare guidance for guided lesson creation (not live medical advice).
 * Used to fill gaps safely and to validate owner-supplied activity ideas.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const knowledgeProfile = require("./curriculum-operator-knowledge-profile.js");

const BANDS = Object.freeze({
  infant: {
    key: "infant",
    label: "Infants 0–12 months",
    attentionMinutes: [3, 10],
    typicalDurationMinutes: [5, 15],
    motor: "Reach, grasp, mouthing with large safe objects; supported sitting; crawling emerging.",
    language: "Single words, gestures, caregiver narration; no complex questions.",
    socialEmotional: "Secure attachment, co-regulation, parallel awareness.",
    independence: "Fully supported; hand-over-hand only.",
    supervision: "Within arm’s reach; constant sight.",
    materials: "Large, non-mouthable choke-safe items; no small beads, popcorn, loose parts under 1.25 in.",
    safetyFocus: ["choking", "sanitation", "supervision", "allergy", "sensory_overload"],
  },
  young_toddler: {
    key: "young_toddler",
    label: "Young toddlers 12–24 months",
    attentionMinutes: [5, 12],
    typicalDurationMinutes: [8, 20],
    motor: "Walk, stack, fill/dump, scribble; avoid precise cutting.",
    language: "1–2 word phrases; simple choices (this or that).",
    socialEmotional: "Parallel play; brief turn-taking with support.",
    independence: "Heavy modeling; short steps.",
    supervision: "Close supervision; arms-reach for water/climbing.",
    materials: "Large pieces; no tiny choking hazards; blunt tools only.",
    safetyFocus: ["choking", "water", "supervision", "sanitation", "allergy"],
  },
  toddler: {
    key: "toddler",
    label: "Older toddlers 2–3 years",
    attentionMinutes: [8, 15],
    typicalDurationMinutes: [10, 25],
    motor: "Run, climb, early scissors with supervision, pour, stir.",
    language: "Short sentences; who/what/where questions.",
    socialEmotional: "Turn-taking with prompts; naming feelings.",
    independence: "Guided steps with choices.",
    supervision: "Active supervision; water and outdoor extra caution.",
    materials: "Preschool-safe tools; monitor small objects and food crafts.",
    safetyFocus: ["choking", "scissors", "water", "outdoor", "allergy", "sensory"],
  },
  preschool: {
    key: "preschool",
    label: "Preschool 3–5 years",
    attentionMinutes: [10, 25],
    typicalDurationMinutes: [15, 35],
    motor: "Cut, glue, balance, hop, fine-motor crafts.",
    language: "Open questions; sequence and compare language.",
    socialEmotional: "Cooperative play; problem-solving with peers.",
    independence: "Child-led steps with checkpoints.",
    supervision: "Group supervision; clear safety rules before tools/food/water.",
    materials: "Child-safe scissors; allergen-aware snacks; labeled stations.",
    safetyFocus: ["allergy", "scissors", "water", "outdoor", "sanitation", "small_objects"],
  },
  prek_k: {
    key: "prek_k",
    label: "Pre-K / kindergarten readiness 4–6 years",
    attentionMinutes: [15, 30],
    typicalDurationMinutes: [20, 40],
    motor: "Refined fine motor; writing tools; complex movement games.",
    language: "Why/how questions; vocabulary in context.",
    socialEmotional: "Group roles; empathy and conflict scripts.",
    independence: "Multi-step projects with checklists.",
    supervision: "Scanning supervision; review rules for tools and outdoor.",
    materials: "Standard classroom tools with safety briefing.",
    safetyFocus: ["scissors", "allergy", "outdoor", "water", "supervision"],
  },
  mixed: {
    key: "mixed",
    label: "Mixed ages",
    attentionMinutes: [5, 20],
    typicalDurationMinutes: [10, 30],
    motor: "Offer tiered versions (supported vs independent).",
    language: "Layer prompts from simple to complex.",
    socialEmotional: "Buddy pairs; older child helper roles when appropriate.",
    independence: "Choice of challenge level.",
    supervision: "Infant/toddler rules apply to youngest present.",
    materials: "Strictest-youngest-child choke and tool rules.",
    safetyFocus: ["choking", "supervision", "mixed_age_adaptation", "allergy", "scissors", "water"],
  },
});

function mapSchemaAgeBand(ageBand) {
  const key = schema.text(ageBand, 40).toLowerCase();
  if (key === "infant") return BANDS.infant;
  if (key === "toddler") return BANDS.toddler;
  if (key === "preschool") return BANDS.preschool;
  if (key === "school_age") return BANDS.prek_k;
  if (key === "mixed") return BANDS.mixed;
  return BANDS.preschool;
}

function architectGuidanceLines(ageBand, brief = null) {
  const band = mapSchemaAgeBand(ageBand);
  const base = [
    `Age-band guidance (${band.label}): attention ~${band.attentionMinutes[0]}-${band.attentionMinutes[1]} min; activity duration ~${band.typicalDurationMinutes[0]}-${band.typicalDurationMinutes[1]} min.`,
    `Motor: ${band.motor}`,
    `Language/questions: ${band.language}`,
    `Social-emotional: ${band.socialEmotional}`,
    `Independence: ${band.independence}`,
    `Supervision: ${band.supervision}`,
    `Materials: ${band.materials}`,
    "Fill missing objectives, preparation, setup, steps, teacher questions, observation points, safety, cleanup, adaptations, support, challenge, mixed-age options, vocabulary, and family connection using this band — do not replace owner-supplied activity titles or core ideas.",
    "If uncertain about allergens, choking risk, or age fit, note uncertainty in safetyNotes instead of inventing unsafe details.",
    "Do not fabricate book authors, ISBNs, citations, or research sources.",
  ];
  if (brief && typeof brief === "object") {
    return base.concat(knowledgeProfile.architectSupplementLines(brief, { maxLines: 18 }));
  }
  const stage = knowledgeProfile.resolveDevelopmentStage(ageBand, "");
  return base.concat(knowledgeProfile.developmentLinesForStage(
    stage === "infant_all" ? "infant_all" : stage,
    6,
  ));
}

function fieldsAiShouldFill() {
  return [
    "objectives",
    "materials (only gaps — preserve owner-listed materials)",
    "preparation",
    "setup",
    "steps",
    "teacher questions",
    "observation points",
    "safety notes",
    "cleanup",
    "adaptations",
    "support",
    "challenge",
    "mixed-age options",
    "vocabulary",
    "family connection",
    "indoor/outdoor alternatives",
  ];
}

module.exports = {
  BANDS,
  mapSchemaAgeBand,
  architectGuidanceLines,
  fieldsAiShouldFill,
};
