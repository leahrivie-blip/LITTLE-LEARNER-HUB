/**
 * Shared Play-Based Curriculum lesson plan import parser/formatter.
 * Used by seed scripts, tests, and import-file conversion.
 * Browser importer logic lives in app.js and should stay in sync.
 */
const crypto = require("crypto");

const PLAY_ACTIVITY_CATEGORIES = [
  "Circle Time",
  "Literacy",
  "Sensory Play",
  "Fine Motor",
  "Gross Motor",
  "Music & Movement",
  "Art",
  "STEM/Discovery",
  "Dramatic Play",
  "Outdoor Play",
  "Open-Ended Exploration",
];

const CURRICULUM_LEARNING_DOMAINS = [
  "Social Emotional",
  "Language & Literacy",
  "Math",
  "Science",
  "Physical Development",
  "Creative Arts",
];

const CURRICULUM_LESSON_STATUSES = ["draft", "published", "featured", "archived"];
const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const CURRICULUM_IMPORT_COLON_SECTION_KEYS = {
  TITLE: "TITLE",
  "AGE GROUP": "AGE_GROUP",
  AGE_GROUP: "AGE_GROUP",
  THEME: "THEME",
  "WEEKLY OVERVIEW": "WEEKLY_OVERVIEW",
  "LEARNING OBJECTIVES": "OBJECTIVES",
  OBJECTIVES: "OBJECTIVES",
  "WEEKLY MATERIALS": "WEEKLY_MATERIALS",
  VOCABULARY: "VOCABULARY",
  BOOKS: "BOOKS",
  SONGS: "SONGS",
  "FAMILY CONNECTION": "FAMILY_CONNECTION",
  "OBSERVATION OPPORTUNITIES": "OBSERVATIONS",
  OBSERVATIONS: "OBSERVATIONS",
  ADAPTATIONS: "ADAPTATIONS",
  PLAN: "PLAN",
  STATUS: "STATUS",
  "LEARNING DOMAINS": "LEARNING_DOMAINS",
  LEARNING_DOMAINS: "LEARNING_DOMAINS",
  MONDAY: "MONDAY",
  TUESDAY: "TUESDAY",
  WEDNESDAY: "WEDNESDAY",
  THURSDAY: "THURSDAY",
  FRIDAY: "FRIDAY",
};

const CURRICULUM_IMPORT_COLON_HEADER_PATTERN = /^(TITLE|AGE GROUP|AGE_GROUP|THEME|WEEKLY OVERVIEW|LEARNING OBJECTIVES|OBJECTIVES|WEEKLY MATERIALS|VOCABULARY|BOOKS|SONGS|FAMILY CONNECTION|OBSERVATION OPPORTUNITIES|OBSERVATIONS|ADAPTATIONS|PLAN|STATUS|LEARNING DOMAINS|LEARNING_DOMAINS|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY):\s*$/i;

function normalizedShortText(value, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizedMultilineText(value, max = 12000) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function emptyCurriculumDailyPlans() {
  return Object.fromEntries(CURRICULUM_WEEKDAYS.map((day) => [day, { items: [] }]));
}

function generateCurriculumItemId() {
  return `item-${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeCurriculumImportAge(ageRaw) {
  const raw = normalizedShortText(ageRaw);
  if (["Infant", "Toddler", "Preschool"].includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower.includes("infant")) return "Infant";
  if (lower.includes("toddler")) return "Toddler";
  if (lower.includes("preschool")) return "Preschool";
  return "";
}

function parseCurriculumImportColonSections(text) {
  const sections = {};
  const lines = String(text || "").split(/\r?\n/);
  let currentKey = "";
  let currentLines = [];

  const flush = () => {
    if (!currentKey) return;
    sections[currentKey] = currentLines.join("\n").trim();
    currentLines = [];
  };

  const normalizeHeaderKey = (header) => {
    const cleaned = String(header || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (CURRICULUM_IMPORT_COLON_SECTION_KEYS[cleaned]) return CURRICULUM_IMPORT_COLON_SECTION_KEYS[cleaned];
    const underscored = cleaned.replace(/ /g, "_");
    if (CURRICULUM_IMPORT_COLON_SECTION_KEYS[underscored]) return CURRICULUM_IMPORT_COLON_SECTION_KEYS[underscored];
    return underscored;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(CURRICULUM_IMPORT_COLON_HEADER_PATTERN);
    if (headerMatch) {
      flush();
      currentKey = normalizeHeaderKey(headerMatch[1]);
      return;
    }
    if (currentKey) currentLines.push(line);
  });
  flush();
  return sections;
}

function parseCurriculumImportBlockSections(text) {
  const sections = {};
  const parts = String(text || "").split(/===([A-Z_]+)===/);
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].trim().toUpperCase();
    const content = (parts[i + 1] || "").trim();
    if (key) sections[key] = content;
  }
  return sections;
}

function extractCurriculumImportSections(text) {
  const raw = String(text || "").trim();
  if (!raw) return {};
  if (/^===([A-Z_]+)===/m.test(raw)) return parseCurriculumImportBlockSections(raw);
  if (/^TITLE:\s*$/m.test(raw)) return parseCurriculumImportColonSections(raw);
  const colonSections = parseCurriculumImportColonSections(raw);
  if (colonSections.TITLE || colonSections.AGE_GROUP) return colonSections;
  return parseCurriculumImportBlockSections(raw);
}

function splitCurriculumImportDayActivities(dayContent) {
  const content = String(dayContent || "").trim();
  if (!content) return [];
  if (/---ACTIVITY---/i.test(content)) {
    return content.split(/---ACTIVITY---/i).map((block) => block.trim()).filter(Boolean);
  }
  if (/^ACTIVITY NAME:/im.test(content)) {
    return content.split(/(?=^ACTIVITY NAME:\s*)/im).map((block) => block.trim()).filter(Boolean);
  }
  return [content];
}

function parseCurriculumImportActivityBlock(block) {
  const lines = String(block || "").split(/\r?\n/);
  const activity = {
    activityCategory: PLAY_ACTIVITY_CATEGORIES[0],
    title: "",
    description: "",
    materials: "",
    setup: "",
    steps: "",
    learningGoals: [],
  };
  let currentField = "";
  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) return;
    const categoryMatch = trimmed.match(/^(?:CATEGORY|Category):\s*(.*)$/i);
    const titleMatch = trimmed.match(/^(?:ACTIVITY NAME|Title):\s*(.*)$/i);
    const descriptionMatch = trimmed.match(/^Description:\s*(.+)$/i);
    const materialsMatch = trimmed.match(/^MATERIALS:\s*(.*)$/i) || trimmed.match(/^Materials:\s*(.*)$/i);
    const setupMatch = trimmed.match(/^SETUP:\s*(.*)$/i);
    const directionsHeaderMatch = trimmed.match(/^(?:DIRECTIONS|Steps):\s*$/i);
    const directionsInlineMatch = trimmed.match(/^(?:DIRECTIONS|Steps):\s*(.+)$/i);
    const goalsHeaderMatch = trimmed.match(/^(?:LEARNING GOAL|LEARNING GOALS|Learning Goals):\s*$/i);
    const goalsInlineMatch = trimmed.match(/^(?:LEARNING GOAL|LEARNING GOALS|Learning Goals):\s*(.+)$/i);
    if (categoryMatch) {
      if (categoryMatch[1]) {
        activity.activityCategory = normalizedShortText(categoryMatch[1]) || activity.activityCategory;
        currentField = "";
      } else {
        currentField = "category";
      }
      return;
    }
    if (titleMatch) {
      if (titleMatch[1]) {
        activity.title = normalizedShortText(titleMatch[1]);
        currentField = "";
      } else {
        currentField = "title";
      }
      return;
    }
    if (descriptionMatch) {
      currentField = "description";
      activity.description = normalizedMultilineText(descriptionMatch[1]);
      return;
    }
    if (materialsMatch) {
      if (materialsMatch[1]) {
        activity.materials = normalizedMultilineText(materialsMatch[1]);
        currentField = "";
      } else {
        currentField = "materials";
      }
      return;
    }
    if (setupMatch) {
      if (setupMatch[1]) {
        activity.setup = normalizedMultilineText(setupMatch[1]);
        currentField = "";
      } else {
        currentField = "setup";
      }
      return;
    }
    if (directionsHeaderMatch) {
      currentField = "steps";
      return;
    }
    if (directionsInlineMatch) {
      currentField = "steps";
      activity.steps = normalizedMultilineText(directionsInlineMatch[1]);
      return;
    }
    if (goalsHeaderMatch) {
      currentField = "learningGoals";
      return;
    }
    if (goalsInlineMatch) {
      currentField = "learningGoals";
      const goal = goalsInlineMatch[1].replace(/^[-*•]\s*/, "").trim();
      if (goal) activity.learningGoals.push(goal);
      return;
    }
    if (currentField === "title" && !activity.title) {
      activity.title = normalizedShortText(trimmed);
      currentField = "";
      return;
    }
    if (currentField === "category") {
      activity.activityCategory = normalizedShortText(trimmed) || activity.activityCategory;
      currentField = "";
      return;
    }
    if (currentField === "steps") {
      activity.steps = [activity.steps, trimmed.replace(/^\d+\.\s*/, "")].filter(Boolean).join("\n");
      return;
    }
    if (currentField === "learningGoals") {
      const goal = trimmed.replace(/^[-*•]\s*/, "").trim();
      if (goal) activity.learningGoals.push(goal);
      return;
    }
    if (currentField === "description") activity.description = [activity.description, trimmed].filter(Boolean).join("\n");
    if (currentField === "materials") activity.materials = [activity.materials, trimmed].filter(Boolean).join("\n");
    if (currentField === "setup") activity.setup = [activity.setup, trimmed].filter(Boolean).join("\n");
  });
  if (!activity.setup && activity.description) activity.setup = activity.description;
  if (!PLAY_ACTIVITY_CATEGORIES.includes(activity.activityCategory)) {
    activity.activityCategory = "Open-Ended Exploration";
  }
  return activity;
}

function parseCurriculumImportListLines(text, { parts = 2 } = {}) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, "").split("|").map((part) => part.trim()))
    .map((chunks) => {
      if (parts === 3) {
        const [title, author, notes] = chunks;
        return title ? { title, author: author || "", notes: notes || "" } : null;
      }
      const [title, notes] = chunks;
      return title ? { title, notes: notes || "" } : null;
    })
    .filter(Boolean);
}

function parseCurriculumLessonPlanImport(text, { existingItemIds = new Map(), generateItemId = generateCurriculumItemId } = {}) {
  const errors = [];
  const warnings = [];
  const sections = extractCurriculumImportSections(text);

  const title = normalizedShortText(sections.TITLE);
  if (!title) errors.push("Missing required section: TITLE:");

  const ageRaw = normalizedShortText(sections.AGE_GROUP);
  const age = normalizeCurriculumImportAge(ageRaw);
  if (!age) warnings.push("AGE GROUP missing or invalid. Expected Infant, Toddler, or Preschool.");

  const theme = normalizedShortText(sections.THEME);
  if (!theme) warnings.push("THEME is empty.");

  const planRaw = normalizedShortText(sections.PLAN);
  const plan = planRaw === "Pro" ? "Pro" : "Free";

  const statusRaw = normalizedShortText(sections.STATUS).toLowerCase();
  const status = CURRICULUM_LESSON_STATUSES.includes(statusRaw) ? statusRaw : "draft";
  if (sections.STATUS && !CURRICULUM_LESSON_STATUSES.includes(statusRaw)) {
    warnings.push("STATUS invalid. Use draft, published, featured, or archived.");
  }

  const learningDomains = String(sections.LEARNING_DOMAINS || "")
    .split(/[,;\n]/)
    .map((item) => normalizedShortText(item))
    .filter((item) => CURRICULUM_LEARNING_DOMAINS.includes(item));

  const dailyPlans = emptyCurriculumDailyPlans();
  let activityCount = 0;
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const dayKey = day.toUpperCase();
    const dayContent = sections[dayKey] || "";
    if (!dayContent) return;
    const blocks = splitCurriculumImportDayActivities(dayContent);
    blocks.forEach((block) => {
      const activity = parseCurriculumImportActivityBlock(block);
      if (!activity.title) {
        warnings.push(`${dayKey}: activity block missing ACTIVITY NAME (skipped).`);
        return;
      }
      const itemKey = `${day}:${activity.title.toLowerCase()}`;
      const itemId = existingItemIds.get(itemKey) || generateItemId();
      dailyPlans[day].items.push({ ...activity, itemId });
      activityCount += 1;
    });
  });
  if (!activityCount) {
    errors.push("At least one ACTIVITY NAME block (or ---ACTIVITY--- with a title) is required under a weekday section.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: {
      title: title || "Untitled Lesson Plan",
      age: age || "Preschool",
      theme,
      plan,
      status,
      learningDomains,
      weeklyOverview: normalizedMultilineText(sections.WEEKLY_OVERVIEW),
      objectives: normalizedMultilineText(sections.OBJECTIVES || sections.LEARNING_OBJECTIVES),
      familyConnection: normalizedMultilineText(sections.FAMILY_CONNECTION),
      weeklyMaterials: normalizedMultilineText(sections.WEEKLY_MATERIALS),
      vocabularyWords: normalizedMultilineText(sections.VOCABULARY),
      observationOpportunities: normalizedMultilineText(sections.OBSERVATIONS || sections.OBSERVATION_OPPORTUNITIES),
      adaptations: normalizedMultilineText(sections.ADAPTATIONS),
      books: parseCurriculumImportListLines(sections.BOOKS, { parts: 3 }),
      songs: parseCurriculumImportListLines(sections.SONGS, { parts: 2 }),
      dailyPlans,
      _activityCount: activityCount,
    },
  };
}

function formatImportSection(header, content = "") {
  return `${header}:\n${String(content || "").trim()}\n`;
}

function formatImportActivity(activity = {}) {
  const setup = activity.setup || activity.description || "";
  const goals = Array.isArray(activity.learningGoals) ? activity.learningGoals.filter(Boolean) : [];
  const directions = String(activity.steps || "").trim();
  const numberedDirections = directions
    ? directions.split(/\r?\n/).map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      return /^\d+\.\s/.test(trimmed) ? trimmed : `${index + 1}. ${trimmed}`;
    }).filter(Boolean).join("\n")
    : "";
  return [
    "ACTIVITY NAME:",
    activity.title || "",
    "CATEGORY:",
    activity.activityCategory || "Open-Ended Exploration",
    "MATERIALS:",
    activity.materials || "",
    "SETUP:",
    setup,
    "DIRECTIONS:",
    numberedDirections,
    "LEARNING GOAL:",
    goals.join("\n"),
  ].join("\n");
}

function formatCurriculumLessonPlanImport(plan = {}) {
  const entry = plan && typeof plan === "object" ? plan : {};
  const sections = [
    formatImportSection("TITLE", entry.title),
    formatImportSection("AGE GROUP", entry.age),
    formatImportSection("THEME", entry.theme),
  ];
  if (entry.plan) sections.push(formatImportSection("PLAN", entry.plan));
  if (entry.status) sections.push(formatImportSection("STATUS", entry.status));
  if (Array.isArray(entry.learningDomains) && entry.learningDomains.length) {
    sections.push(formatImportSection("LEARNING DOMAINS", entry.learningDomains.join(", ")));
  }
  sections.push(
    formatImportSection("WEEKLY OVERVIEW", entry.weeklyOverview),
    formatImportSection("LEARNING OBJECTIVES", entry.objectives),
    formatImportSection("WEEKLY MATERIALS", entry.weeklyMaterials),
    formatImportSection("VOCABULARY", entry.vocabularyWords),
    formatImportSection("BOOKS", (entry.books || []).map((book) => [book.title, book.author, book.notes].filter(Boolean).join(" | ")).join("\n")),
    formatImportSection("SONGS", (entry.songs || []).map((song) => [song.title, song.notes].filter(Boolean).join(" | ")).join("\n")),
    formatImportSection("FAMILY CONNECTION", entry.familyConnection),
    formatImportSection("OBSERVATION OPPORTUNITIES", entry.observationOpportunities),
    formatImportSection("ADAPTATIONS", entry.adaptations),
  );
  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].forEach((dayKey) => {
    const day = dayKey.toLowerCase();
    const items = Array.isArray(entry.dailyPlans?.[day]?.items) ? entry.dailyPlans[day].items : [];
    const dayBody = items.length ? items.map((item) => formatImportActivity(item)).join("\n\n") : "";
    sections.push(formatImportSection(dayKey, dayBody));
  });
  return `${sections.join("\n").trim()}\n`;
}

module.exports = {
  PLAY_ACTIVITY_CATEGORIES,
  CURRICULUM_LEARNING_DOMAINS,
  CURRICULUM_WEEKDAYS,
  parseCurriculumLessonPlanImport,
  formatCurriculumLessonPlanImport,
  formatImportActivity,
};
