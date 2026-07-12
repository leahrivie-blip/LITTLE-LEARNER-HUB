/**
 * Format preschool lesson plan data into v3 import text.
 */

const DOMAIN_MAP = {
  "Language & Literacy": "Language & Literacy",
  "Physical Development": "Physical Development",
  "Creative Arts": "Creative Arts",
  "Social Emotional Development": "Social Emotional",
  "Science Exploration": "Science",
  "Science & Discovery": "Science",
  "Cognitive Development": "Math",
  "Math Development": "Math",
  "Mathematics": "Math",
};

const CATEGORY_MAP = {
  "Open-Ended Exploration": "Open-Ended Exploration",
  "Creative Arts": "Art",
  "Music & Movement": "Music & Movement",
  "Science Exploration": "STEM/Discovery",
  "Science & Discovery": "STEM/Discovery",
  "Physical Development": "Gross Motor",
  "Gross Motor": "Gross Motor",
  "Language & Literacy": "Literacy",
  "Fine Motor": "Fine Motor",
  "Dramatic Play": "Dramatic Play",
  "Sensory Play": "Sensory Play",
  "Math Development": "Open-Ended Exploration",
  "Mathematics": "Open-Ended Exploration",
};

const DRAMATIC_PLAY_NAMES = new Set([
  "Family Dramatic Play",
  "Paint Store Pretend Play",
  "Feelings Puppets",
  "Number Store Pretend Play",
  "Doctor's Office Dramatic Play",
  "Mail Carrier Center",
  "Chef's Kitchen",
  "Weather Dress-Up Center",
  "Farmer's Market Dramatic Play",
  "Build a Shape Town",
]);

const FINE_MOTOR_COGNITIVE_NAMES = new Set([
  "Pom-Pom Color Sort",
  "Color Pattern Building",
  "Family Graph",
  "Emotion Sorting Center",
  "Beginning Sound Basket",
  "Play Dough Letters",
  "Name Letter Builders",
  "Alphabet Building Challenge",
  "Counting Bear Sorting",
  "Number Play Dough Mats",
  "Build and Count Towers",
  "Shape Sorting Center",
  "Play Dough Shapes",
  "Shape Puzzle Center",
  "Animal Sorting Center",
  "Mystery Sound Match",
  "Smell and Sort",
  "Healthy Helpers Chart",
  "Weather Chart Helpers",
  "Community Helper Matching",
]);

function mapLearningDomains(domains) {
  const mapped = (domains || [])
    .map((d) => DOMAIN_MAP[String(d).trim()])
    .filter(Boolean);
  return [...new Set(mapped)];
}

function mapCategory(original, activityName) {
  const key = String(original || "").trim();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  if (key === "Social Emotional Development") {
    return DRAMATIC_PLAY_NAMES.has(activityName) ? "Dramatic Play" : "Circle Time";
  }
  if (key === "Cognitive Development") {
    return FINE_MOTOR_COGNITIVE_NAMES.has(activityName) ? "Fine Motor" : "Open-Ended Exploration";
  }
  return "Open-Ended Exploration";
}

function formatBookLine(line) {
  const trimmed = String(line || "").trim().replace(/^[-*•]\s*/, "");
  if (!trimmed) return "";
  if (trimmed.includes("|")) return trimmed;
  const byMatch = trimmed.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return `${byMatch[1].trim()} | ${byMatch[2].trim()}`;
  return trimmed;
}

function formatList(lines) {
  return (lines || [])
    .map((line) => String(line).trim().replace(/^[-*•\t]+\s*/, ""))
    .filter(Boolean)
    .join("\n");
}

function formatActivity(activity) {
  const category = mapCategory(activity.category, activity.name);
  const directions = Array.isArray(activity.directions)
    ? activity.directions.map((d, i) => `${i + 1}. ${String(d).replace(/^\d+\.\s*/, "")}`).join("\n")
    : String(activity.directions || "");
  const description = activity.description || activity.objective || activity.name;
  const goalsList = (activity.goals && activity.goals.length)
    ? activity.goals
    : [activity.objective || `Participate in ${activity.name}`];
  const goals = goalsList.map((g) => String(g).replace(/^[-*•\t]+\s*/, "")).join("\n");
  const observationsList = (activity.observations && activity.observations.length)
    ? activity.observations
    : ["Observe participation, engagement, and skill development during this activity."];
  const observations = observationsList.map((o) => String(o).replace(/^[-*•\t]+\s*/, "")).join("\n");

  return [
    "ACTIVITY_NAME:",
    activity.name,
    "CATEGORY:",
    category,
    "OBJECTIVE:",
    activity.objective,
    "DESCRIPTION:",
    description,
    "MATERIALS:",
    activity.materials,
    "SETUP:",
    activity.setup,
    "TEACHER_ROLE:",
    activity.teacherRole,
    "DIRECTIONS:",
    directions,
    "LEARNING_GOALS:",
    goals,
    "OBSERVATION_OPPORTUNITIES:",
    observations,
  ].join("\n");
}

function formatLessonPlan(plan, { planTier = "Free", status = "published", ageGroup = "Preschool" } = {}) {
  const domains = mapLearningDomains(plan.learningDomains);
  const books = (plan.books || []).map(formatBookLine).filter(Boolean).join("\n");
  const songs = formatList(plan.songs);
  const objectives = formatList(plan.objectives);
  const materials = formatList(plan.materials);
  const vocabulary = formatList(plan.vocabulary);
  const tier = plan.plan || planTier;
  const publishStatus = plan.status || status;
  const age = plan.ageGroup || ageGroup;

  const sections = [
    "TITLE:",
    plan.title,
    "",
    "AGE_GROUP:",
    age,
    "",
    "THEME:",
    plan.theme,
    "",
    "PLAN:",
    tier,
    "",
    "STATUS:",
    publishStatus,
    "",
    "LEARNING_DOMAINS:",
    domains.join("\n"),
    "",
    "WEEKLY_OVERVIEW:",
    plan.weeklyOverview,
    "",
    "LEARNING_OBJECTIVES:",
    objectives,
    "",
    "WEEKLY_MATERIALS:",
    materials,
    "",
    "VOCABULARY:",
    vocabulary,
    "",
    "BOOKS:",
    books,
    "",
    "SONGS:",
    songs,
    "",
    "FAMILY_CONNECTION:",
    plan.familyConnection,
    "",
    "OBSERVATION_OPPORTUNITIES:",
    plan.observationOpportunities,
    "",
    "ADAPTATIONS:",
    plan.adaptations,
  ];

  const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  dayOrder.forEach((day) => {
    const activities = plan.days?.[day] || [];
    if (!activities.length) return;
    sections.push("", day.toUpperCase() + ":", "");
    activities.forEach((activity, index) => {
      if (index > 0) sections.push("");
      sections.push(formatActivity(activity));
    });
  });

  return sections.join("\n") + "\n";
}

module.exports = {
  mapLearningDomains,
  mapCategory,
  formatLessonPlan,
};
