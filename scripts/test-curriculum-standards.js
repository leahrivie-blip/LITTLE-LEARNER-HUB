#!/usr/bin/env node
/**
 * Unit tests for Little Learner Hub Curriculum Standards.
 */
const assert = require("assert");
const {
  resolveAgeBand,
  countNumberedSteps,
  auditLessonPlanAgainstStandards,
  buildFullCurriculumStandardsPrompt,
  buildAllAgeStandardsPromptBlock,
  AGE_BANDS,
} = require("./curriculum-standards.js");

function makeActivity(overrides = {}) {
  return {
    title: "Mirror Face Play",
    activityCategory: "Sensory Exploration",
    objective: "Support visual attention and bonding during floor play.",
    description: "Caregiver holds a soft mirror while the infant explores faces.",
    materials: "Unbreakable infant mirror, soft blanket",
    setup: "Place blanket on the floor and sit facing the infant.",
    steps: "1. Sit with the infant on a soft blanket.\n2. Hold the mirror at their eye level.\n3. Smile and narrate what they see.\n4. Pause if the infant looks away.\n5. End with a gentle song.",
    teacherRole: "Stay close, narrate softly, and follow the infant's cues.",
    learningGoals: ["Visual tracking", "Social bonding"],
    observationOpportunities: "Notice whether the infant locks gaze or reaches toward the mirror.",
    adaptations: "For infants who tire quickly, shorten to 1–2 minutes.",
    safetyNotes: "Use only unbreakable mirrors; stay within arm's reach.",
    ...overrides,
  };
}

function makeDay(overrides = {}) {
  return {
    theme: "Faces and Bonding",
    objectives: "Build attachment through responsive face-to-face play.",
    vocabulary: "face, see, smile",
    materials: "Mirror, blanket",
    learningDomains: ["Social Emotional", "Physical Development"],
    circleTime: ["Sing a short hello song while holding the infant."],
    outdoorPlay: "Gentle stroller walk with outdoor sounds narration.",
    observations: ["Watch for eye contact and calm settling."],
    adaptations: "Offer tummy time version if infant prefers floor play.",
    safetyNotes: "Never leave infant unattended on elevated surfaces.",
    items: [makeActivity()],
    ...overrides,
  };
}

function makeCompletePlan(age, activityOverrides = {}) {
  const dailyPlans = {};
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    dailyPlans[day] = makeDay({
      items: [makeActivity(activityOverrides)],
    });
  }
  return {
    id: "test-plan",
    title: "Test Weekly Plan",
    age,
    weeklyOverview: "A week of bonding and sensory exploration.",
    objectives: "Support attachment, tracking, and calm sensory play.",
    learningDomains: ["Social Emotional", "Physical Development", "Language & Literacy"],
    weeklyMaterials: "Mirrors, soft fabrics, rattles",
    vocabularyWords: "see, touch, soft, hello",
    books: [{ title: "Global Babies", author: "The Global Fund for Children" }],
    songs: [{ title: "Twinkle Twinkle Little Star" }],
    familyConnection: "At home, look in a mirror together and name facial features.",
    observationOpportunities: "Document gaze duration and reaching attempts.",
    adaptations: "Offer shorter sessions for easily overstimulated infants.",
    dailyPlans,
  };
}

function testResolveAgeBand() {
  assert.strictEqual(resolveAgeBand("Infant 0–6 Months").id, "infant-0-6");
  assert.strictEqual(resolveAgeBand("Infant 0-6 Months").id, "infant-0-6");
  assert.strictEqual(resolveAgeBand("Infant 6–12 Months").id, "infant-6-12");
  assert.strictEqual(resolveAgeBand("Infant").id, "infant");
  assert.strictEqual(resolveAgeBand("Toddler").id, "toddler");
  assert.strictEqual(resolveAgeBand("Toddlers (1–2 Years)").id, "toddler");
  assert.strictEqual(resolveAgeBand("Preschool").id, "preschool");
  assert.strictEqual(resolveAgeBand("Preschool 3–5 Years").id, "preschool");
  console.log("✓ resolveAgeBand");
}

function testNumberedSteps() {
  assert.strictEqual(countNumberedSteps("1. One\n2. Two\n3. Three"), 3);
  assert.strictEqual(countNumberedSteps("Step 1 do\nStep 2 do\nStep 3 do\nStep 4 do"), 4);
  console.log("✓ countNumberedSteps");
}

function testInfantAvoidWorksheets() {
  const plan = makeCompletePlan("Infant 0–6 Months", {
    title: "Letter Worksheet Time",
    description: "Complete a letter tracing worksheet with scissors and glue.",
    materials: "Worksheet, scissors, glue",
    steps: "1. Hand out worksheets.\n2. Cut with scissors.\n3. Glue pieces down.\n4. Write letters.\n5. Clean up.",
  });
  const result = auditLessonPlanAgainstStandards(plan);
  assert.ok(result.issues.some((i) => i.code === "age_inappropriate"), "expected age_inappropriate for infant worksheet/scissors");
  console.log("✓ infant avoid worksheets/scissors");
}

function testToddlerRequiredComponents() {
  const plan = makeCompletePlan("Toddler", {
    title: "Quiet Looking",
    activityCategory: "Open-Ended Exploration",
    objective: "Look at pictures",
    description: "Children look at picture cards while seated.",
    materials: "Picture cards",
    setup: "Sit at table",
    steps: "1. Sit down.\n2. Look at cards.\n3. Name one picture.\n4. Put cards away.\n5. Wash hands.",
    teacherRole: "Show cards",
    learningGoals: ["Looking"],
    observationOpportunities: "Note attention",
    adaptations: "Fewer cards",
    safetyNotes: "Supervise",
  });
  // Strip language that would accidentally satisfy component patterns
  plan.weeklyOverview = "A calm looking week.";
  plan.objectives = "Practice looking at pictures.";
  plan.familyConnection = "Look at a family photo together.";
  const result = auditLessonPlanAgainstStandards(plan);
  const missing = result.issues.filter((i) => i.code === "missing_age_component");
  assert.ok(missing.length >= 1, "toddler plan missing required components should flag");
  console.log("✓ toddler required components");
}

function testPreschoolGoldStandardPass() {
  const plan = makeCompletePlan("Preschool");
  // Enrich for preschool required components
  for (const day of Object.keys(plan.dailyPlans)) {
    plan.dailyPlans[day].items = [
      makeActivity({
        title: "Letter Sort and Build",
        activityCategory: "Literacy",
        objective: "Explore letters and count sorted groups.",
        description: "Children sort letter cards, count them, then build a block tower challenge outdoors.",
        materials: "Letter cards, counting bears, unit blocks",
        setup: "Prepare literacy table, math tray, and outdoor block area.",
        steps: "1. Read a short letter book together.\n2. Sort letters by name sound.\n3. Count how many are in each group.\n4. Build a cooperative block tower challenge.\n5. Talk about how friends helped and how it felt.",
        teacherRole: "Ask open-ended questions and support cooperative problem solving.",
        learningGoals: ["Letter recognition", "Counting", "Engineering", "Cooperation"],
        observationOpportunities: "Note literacy talk, counting accuracy, and peer collaboration.",
        adaptations: "Offer name cards for children who need more support.",
        safetyNotes: "Keep block builds below shoulder height; supervise outdoor play.",
      }),
    ];
    plan.dailyPlans[day].theme = "Letters, Numbers, and Building";
    plan.dailyPlans[day].objectives = "Practice literacy, math, STEM, and social-emotional skills.";
    plan.dailyPlans[day].circleTime = ["Name song and letter of the day discussion"];
    plan.dailyPlans[day].outdoorPlay = "Gross motor relay with scarves and running games.";
  }
  plan.weeklyOverview = "Children explore literacy, math counting, STEM building, fine motor sorting, gross motor outdoor play, and social-emotional cooperation.";
  plan.objectives = "Literacy letter play; math counting; STEM building; fine motor; gross motor; social-emotional teamwork.";
  const result = auditLessonPlanAgainstStandards(plan);
  assert.strictEqual(result.complete, true, `expected complete preschool plan, issues: ${JSON.stringify(result.issues, null, 2)}`);
  console.log("✓ preschool gold standard pass");
}

function testMissingGoldFields() {
  const plan = makeCompletePlan("Infant 0–6 Months");
  plan.familyConnection = "";
  plan.dailyPlans.monday.safetyNotes = "";
  plan.dailyPlans.monday.items[0].setup = "";
  const result = auditLessonPlanAgainstStandards(plan);
  assert.ok(result.issues.some((i) => i.code === "missing_gold_field"));
  assert.strictEqual(result.complete, false);
  console.log("✓ missing gold fields");
}

function testPromptBuilders() {
  const infant = buildFullCurriculumStandardsPrompt("Infant 0–6 Months");
  assert.ok(infant.includes("Infant 0–6 Months"));
  assert.ok(infant.includes("1–5 minutes") || infant.includes("1-5"));
  assert.ok(infant.includes("Tummy time") || infant.includes("tummy time") || infant.includes("Tummy Time"));
  assert.ok(infant.includes("GOLD STANDARD"));
  const all = buildAllAgeStandardsPromptBlock();
  assert.ok(all.includes("TODDLERS"));
  assert.ok(all.includes("PRESCHOOL"));
  assert.ok(AGE_BANDS.toddler.requiredPlanComponents.length === 4);
  assert.ok(AGE_BANDS.preschool.requiredPlanComponents.length === 6);
  console.log("✓ prompt builders");
}

function main() {
  testResolveAgeBand();
  testNumberedSteps();
  testInfantAvoidWorksheets();
  testToddlerRequiredComponents();
  testPreschoolGoldStandardPass();
  testMissingGoldFields();
  testPromptBuilders();
  console.log("\nAll curriculum standards tests passed.");
}

main();
