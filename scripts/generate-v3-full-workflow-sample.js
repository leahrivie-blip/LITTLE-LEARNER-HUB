#!/usr/bin/env node
/**
 * Generates the full v3 workflow sample (15 activities, Mon–Fri).
 * Run: node scripts/generate-v3-full-workflow-sample.js > scripts/curriculum-import-samples/label-only-full-workflow-v3.txt
 */
const { formatCurriculumLessonPlanImportV3 } = require("./curriculum-lesson-import-parser.js");

const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const categories = ["Sensory Play", "Fine Motor", "Literacy", "Gross Motor", "Art", "STEM/Discovery"];
const dailyPlans = Object.fromEntries(days.map((day) => [day, { items: [] }]));

days.forEach((day, dayIndex) => {
  for (let i = 1; i <= 3; i += 1) {
    const n = dayIndex * 3 + i;
    dailyPlans[day].items.push({
      title: `${day.charAt(0).toUpperCase() + day.slice(1)} Activity ${i}`,
      activityCategory: categories[(n - 1) % categories.length],
      objective: `Children will practice skill ${n} through guided play.`,
      description: `Teachers invite children to explore activity ${n} in small groups.`,
      materials: `Material A${n}, Material B${n}, basket ${n}`,
      setup: `Prepare station ${n} before children arrive.`,
      steps: `1. Introduce activity ${n}.\n2. Model the first step.\n3. Invite children to try.\n4. Reflect together.`,
      teacherRole: `Observe, narrate, and ask open-ended questions during activity ${n}.`,
      learningGoals: [`Goal ${n}a`, `Goal ${n}b`],
      observationOpportunities: `Watch for engagement and language during activity ${n}.`,
    });
  }
});

const plan = {
  title: "V3 Full Workflow Sample",
  age: "Preschool 3–4 Years",
  theme: "Discovery Week",
  plan: "Free",
  status: "published",
  learningDomains: ["Science", "Language & Literacy", "Creative Arts"],
  weeklyOverview: "A complete sample week used to verify the v3 import workflow end to end.",
  objectives: "- Explore materials with curiosity\n- Use descriptive language\n- Practice cooperation",
  weeklyMaterials: "Bins, scoops, paper, crayons, blocks, books, songs chart",
  vocabularyWords: "explore, compare, share, observe, create",
  books: [
    { title: "Book One", author: "Author One", notes: "Morning read aloud" },
    { title: "Book Two", author: "Author Two", notes: "Small group" },
    { title: "Book Three", author: "Author Three", notes: "Closing circle" },
  ],
  songs: [
    { title: "Song One", notes: "Welcome song" },
    { title: "Song Two", notes: "Transition song" },
    { title: "Song Three", notes: "Goodbye song" },
  ],
  familyConnection: "Ask families to send one object related to the theme.",
  observationOpportunities: "Note language, cooperation, and persistence across the week.",
  adaptations: "Offer larger grips and visual supports as needed.",
  dailyPlans,
};

process.stdout.write(formatCurriculumLessonPlanImportV3(plan));
