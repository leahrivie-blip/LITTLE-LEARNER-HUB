/**
 * Shared Play-Based Curriculum lesson plan import parser (v1 colon + v2 strict markers).
 * Used by browser (global CurriculumLessonImportParser), Node tests, and seed scripts.
 *
 * v2 policy: preserve wording exactly; never regenerate; unmapped content is reported, not dropped silently.
 */
(function curriculumLessonImportParserModule() {
let nodeCrypto = null;
try {
  nodeCrypto = require("crypto");
} catch {
  nodeCrypto = null;
}

const PLAY_ACTIVITY_CATEGORIES_V1 = [
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

const APPROVED_V2_ACTIVITY_CATEGORIES = [
  "Sensory Play",
  "Gross Motor",
  "Fine Motor",
  "Music & Movement",
  "Dramatic Play",
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
const DAY_MARKER_PREFIX = {
  monday: "MONDAY",
  tuesday: "TUESDAY",
  wednesday: "WEDNESDAY",
  thursday: "THURSDAY",
  friday: "FRIDAY",
};

const V2_MARKERS = {
  LESSON_PLAN_START: "@LESSON_PLAN_START@",
  LESSON_PLAN_END: "@LESSON_PLAN_END@",
  WEEKLY_START: "@WEEKLY_START@",
  WEEKLY_END: "@WEEKLY_END@",
  WEEKLY_BOOKS_START: "@WEEKLY_BOOKS_START@",
  WEEKLY_BOOKS_END: "@WEEKLY_BOOKS_END@",
  WEEKLY_SONGS_START: "@WEEKLY_SONGS_START@",
  WEEKLY_SONGS_END: "@WEEKLY_SONGS_END@",
  ACTIVITY_START: "@ACTIVITY_START@",
  ACTIVITY_END: "@ACTIVITY_END@",
};

const V2_LESSON_FIELDS = new Set(["TITLE", "AGE_GROUP", "THEME", "PLAN", "STATUS"]);
const V2_WEEKLY_FIELDS = new Set([
  "LEARNING_DOMAINS",
  "WEEKLY_OVERVIEW",
  "WEEKLY_OBJECTIVES",
  "WEEKLY_MATERIALS",
  "WEEKLY_VOCABULARY",
  "FAMILY_CONNECTION",
  "OBSERVATION_OPPORTUNITIES",
  "ADAPTATIONS",
]);
const V2_DAY_FIELDS = new Set([
  "DAILY_THEME",
  "DAILY_OBJECTIVES",
  "DAILY_MATERIALS",
  "DAILY_VOCABULARY",
  "DAILY_LEARNING_DOMAINS",
  "OUTDOOR_PLAY",
  "DAILY_FAMILY_CONNECTION",
  "DAILY_ADAPTATIONS",
  "SAFETY_NOTES",
]);
const V2_ACTIVITY_FIELDS = new Set([
  "ACTIVITY_NAME",
  "CATEGORY",
  "LEARNING_DOMAINS",
  "MATERIALS",
  "SETUP",
  "DIRECTIONS",
  "TEACHER_ROLE",
  "TEACHER_LANGUAGE",
  "LEARNING_GOAL",
  "VOCABULARY",
  "EXTENSIONS",
  "ADAPTATIONS",
  "SAFETY_NOTES",
  "AGE_MODIFICATIONS",
  "IMPORT_KEY",
]);

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedShortText(value, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizedMultilineText(value, max = 12000) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function preserveMultilineText(value, max = 12000) {
  return String(value || "").replace(/\r\n?/g, "\n").replace(/\s+$/gm, "").slice(0, max);
}

function generateCurriculumItemId() {
  if (nodeCrypto?.randomBytes) {
    return `item-${nodeCrypto.randomBytes(8).toString("hex")}`;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return `item-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `item-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

function emptyCurriculumDailyPlanDay() {
  return {
    theme: "",
    objectives: "",
    materials: "",
    vocabulary: "",
    learningDomains: [],
    books: [],
    songs: [],
    circleTime: [],
    transitions: [],
    outdoorPlay: "",
    familyConnection: "",
    observations: [],
    adaptations: "",
    safetyNotes: "",
    items: [],
  };
}

function emptyCurriculumDailyPlans() {
  return Object.fromEntries(CURRICULUM_WEEKDAYS.map((day) => [day, emptyCurriculumDailyPlanDay()]));
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

function parseLearningDomainsList(text) {
  return String(text || "")
    .split(/[,;\n]/)
    .map((item) => normalizedShortText(item))
    .filter((item) => CURRICULUM_LEARNING_DOMAINS.includes(item));
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

function parseTextListItems(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function detectImportFormat(text) {
  if (/@LESSON_PLAN_START@/i.test(String(text || ""))) return "v2";
  return "v1";
}

function isKnownMarkerLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("@") || !trimmed.endsWith("@")) return false;
  return /^@[A-Z0-9_]+@$/.test(trimmed);
}

function extractMarkedRegion(text, startMarker, endMarker, { lineOffset = 1 } = {}) {
  const source = String(text || "");
  const re = new RegExp(`${escapeRegex(startMarker)}\\s*([\\s\\S]*?)\\s*${escapeRegex(endMarker)}`, "i");
  const match = source.match(re);
  if (!match) {
    return { content: "", before: source, after: "", found: false, unmapped: [] };
  }
  const index = match.index ?? 0;
  const before = source.slice(0, index);
  const after = source.slice(index + match[0].length);
  const unmapped = [];
  const beforeLines = before.split(/\r?\n/);
  beforeLines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    unmapped.push({
      line: idx + lineOffset,
      text: line,
      reason: "content_outside_marked_region",
      context: `${startMarker}`,
    });
  });
  return {
    content: match[1].trim(),
    before,
    after,
    found: true,
    unmapped,
  };
}

function extractAllMarkedRegions(text, startMarker, endMarker) {
  const source = String(text || "");
  const re = new RegExp(`${escapeRegex(startMarker)}\\s*([\\s\\S]*?)\\s*${escapeRegex(endMarker)}`, "gi");
  const regions = [];
  let match;
  while ((match = re.exec(source)) !== null) {
    regions.push({
      content: match[1].trim(),
      index: match.index,
      length: match[0].length,
    });
  }
  return regions;
}

function parseFieldBlock(text, allowedFields, { lineOffset = 1, context = "" } = {}) {
  const fields = {};
  const unmapped = [];
  const lines = String(text || "").split(/\r?\n/);
  let currentField = "";
  let currentLines = [];

  const flush = () => {
    if (!currentField) return;
    fields[currentField] = preserveMultilineText(currentLines.join("\n"));
    currentField = "";
    currentLines = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (isKnownMarkerLine(trimmed)) {
      flush();
      unmapped.push({
        line: lineOffset + index,
        text: line,
        reason: "unexpected_marker",
        context,
      });
      return;
    }
    const fieldMatch = trimmed.match(/^([A-Z][A-Z0-9_]*):\s*$/);
    if (fieldMatch && allowedFields.has(fieldMatch[1])) {
      flush();
      currentField = fieldMatch[1];
      return;
    }
    if (currentField) {
      currentLines.push(line);
      return;
    }
    if (trimmed) {
      unmapped.push({
        line: lineOffset + index,
        text: line,
        reason: "unrecognized_line",
        context,
      });
    }
  });
  flush();
  return { fields, unmapped };
}

function parseActivityGoals(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function parseV2ActivityBlock(block, { dayKey, lineOffset = 1, existingItemIds = new Map(), generateItemId = generateCurriculumItemId } = {}) {
  const errors = [];
  const warnings = [];
  const { fields, unmapped } = parseFieldBlock(block, V2_ACTIVITY_FIELDS, {
    lineOffset,
    context: `${dayKey}:activity`,
  });

  const title = normalizedShortText(fields.ACTIVITY_NAME);
  if (!title) {
    errors.push(`${dayKey}: activity block missing ACTIVITY_NAME.`);
    return { activity: null, errors, warnings, unmapped };
  }

  const category = normalizedShortText(fields.CATEGORY);
  if (!category) {
    errors.push(`${dayKey}: "${title}" is missing CATEGORY.`);
  } else if (!APPROVED_V2_ACTIVITY_CATEGORIES.includes(category)) {
    errors.push(`${dayKey}: "${title}" has invalid CATEGORY "${category}". Use one of: ${APPROVED_V2_ACTIVITY_CATEGORIES.join(", ")}.`);
  }

  if (!preserveMultilineText(fields.DIRECTIONS)) {
    errors.push(`${dayKey}: "${title}" is missing DIRECTIONS.`);
  }

  const importKey = normalizedShortText(fields.IMPORT_KEY);
  const itemKey = importKey || `${dayKey}:${title.toLowerCase()}`;
  const itemId = existingItemIds.get(itemKey) || generateItemId();

  const activity = {
    itemId,
    importKey,
    activityCategory: category || "",
    title,
    learningDomains: parseLearningDomainsList(fields.LEARNING_DOMAINS),
    materials: preserveMultilineText(fields.MATERIALS),
    setup: preserveMultilineText(fields.SETUP),
    steps: preserveMultilineText(fields.DIRECTIONS),
    teacherRole: preserveMultilineText(fields.TEACHER_ROLE),
    teacherLanguage: preserveMultilineText(fields.TEACHER_LANGUAGE),
    learningGoals: parseActivityGoals(fields.LEARNING_GOAL),
    vocabulary: preserveMultilineText(fields.VOCABULARY),
    extensions: preserveMultilineText(fields.EXTENSIONS),
    adaptations: preserveMultilineText(fields.ADAPTATIONS),
    safetyNotes: preserveMultilineText(fields.SAFETY_NOTES),
    ageModifications: preserveMultilineText(fields.AGE_MODIFICATIONS),
    description: "",
  };

  return { activity, errors, warnings, unmapped };
}

function dayListMarkers(dayPrefix) {
  return {
    booksStart: `@${dayPrefix}_BOOKS_START@`,
    booksEnd: `@${dayPrefix}_BOOKS_END@`,
    songsStart: `@${dayPrefix}_SONGS_START@`,
    songsEnd: `@${dayPrefix}_SONGS_END@`,
    circleStart: `@${dayPrefix}_CIRCLE_TIME_START@`,
    circleEnd: `@${dayPrefix}_CIRCLE_TIME_END@`,
    transitionsStart: `@${dayPrefix}_TRANSITIONS_START@`,
    transitionsEnd: `@${dayPrefix}_TRANSITIONS_END@`,
    observationsStart: `@${dayPrefix}_OBSERVATIONS_START@`,
    observationsEnd: `@${dayPrefix}_OBSERVATIONS_END@`,
    dayStart: `@${dayPrefix}_START@`,
    dayEnd: `@${dayPrefix}_END@`,
  };
}

function removeMarkedRegion(text, startMarker, endMarker) {
  const re = new RegExp(`${escapeRegex(startMarker)}\\s*[\\s\\S]*?\\s*${escapeRegex(endMarker)}`, "i");
  return String(text || "").replace(re, "").trim();
}

function parseV2DaySection(dayKey, dayBody, options = {}) {
  const dayPrefix = DAY_MARKER_PREFIX[dayKey];
  const markers = dayListMarkers(dayPrefix);
  const errors = [];
  const warnings = [];
  const unmapped = [];
  const day = emptyCurriculumDailyPlanDay();
  let working = String(dayBody || "").trim();
  if (!working) {
    return { day, errors, warnings, unmapped, activityCount: 0 };
  }

  const pullRegion = (start, end) => {
    const region = extractMarkedRegion(working, start, end);
    if (!region.found) return "";
    working = removeMarkedRegion(working, start, end);
    return region.content;
  };

  day.books = parseCurriculumImportListLines(pullRegion(markers.booksStart, markers.booksEnd), { parts: 3 });
  day.songs = parseCurriculumImportListLines(pullRegion(markers.songsStart, markers.songsEnd), { parts: 2 });
  day.circleTime = parseTextListItems(pullRegion(markers.circleStart, markers.circleEnd));
  day.transitions = parseTextListItems(pullRegion(markers.transitionsStart, markers.transitionsEnd));
  day.observations = parseTextListItems(pullRegion(markers.observationsStart, markers.observationsEnd));

  const activityRegions = extractAllMarkedRegions(working, V2_MARKERS.ACTIVITY_START, V2_MARKERS.ACTIVITY_END)
    .sort((a, b) => a.index - b.index);
  let activityCount = 0;
  activityRegions.forEach((region) => {
    const parsedActivity = parseV2ActivityBlock(region.content, {
      dayKey,
      existingItemIds: options.existingItemIds,
      generateItemId: options.generateItemId,
    });
    errors.push(...parsedActivity.errors);
    warnings.push(...parsedActivity.warnings);
    unmapped.push(...parsedActivity.unmapped);
    if (parsedActivity.activity) {
      day.items.push(parsedActivity.activity);
      activityCount += 1;
    }
  });
  working = String(working).replace(
    new RegExp(`${escapeRegex(V2_MARKERS.ACTIVITY_START)}\\s*[\\s\\S]*?\\s*${escapeRegex(V2_MARKERS.ACTIVITY_END)}`, "gi"),
    "",
  ).trim();

  const { fields, unmapped: fieldUnmapped } = parseFieldBlock(working, V2_DAY_FIELDS, {
    context: `${dayPrefix}:daily`,
  });
  unmapped.push(...fieldUnmapped);
  day.theme = preserveMultilineText(fields.DAILY_THEME);
  day.objectives = preserveMultilineText(fields.DAILY_OBJECTIVES);
  day.materials = preserveMultilineText(fields.DAILY_MATERIALS);
  day.vocabulary = preserveMultilineText(fields.DAILY_VOCABULARY);
  day.learningDomains = parseLearningDomainsList(fields.DAILY_LEARNING_DOMAINS);
  day.outdoorPlay = preserveMultilineText(fields.OUTDOOR_PLAY);
  day.familyConnection = preserveMultilineText(fields.DAILY_FAMILY_CONNECTION);
  day.adaptations = preserveMultilineText(fields.DAILY_ADAPTATIONS);
  day.safetyNotes = preserveMultilineText(fields.SAFETY_NOTES);

  return { day, errors, warnings, unmapped, activityCount };
}

function flattenDailyPlansForV1Compat(dailyPlans) {
  const compat = emptyCurriculumDailyPlans();
  CURRICULUM_WEEKDAYS.forEach((day) => {
    compat[day] = { items: Array.isArray(dailyPlans?.[day]?.items) ? dailyPlans[day].items : [] };
  });
  return compat;
}

function parseCurriculumLessonPlanImportV2(text, { existingItemIds = new Map(), generateItemId = generateCurriculumItemId, existingTitles = [] } = {}) {
  const errors = [];
  const warnings = [];
  const unmapped = [];
  const sectionsDetected = [];

  const lessonRegion = extractMarkedRegion(text, V2_MARKERS.LESSON_PLAN_START, V2_MARKERS.LESSON_PLAN_END);
  if (!lessonRegion.found) {
    return {
      ok: false,
      errors: ["Missing @LESSON_PLAN_START@ / @LESSON_PLAN_END@ markers."],
      warnings,
      unmapped,
      parseReport: { formatVersion: 2, sectionsDetected: [], activityCount: 0, activityLibraryEntries: 0, daysPresent: [] },
      data: null,
    };
  }
  unmapped.push(...lessonRegion.unmapped);
  if (lessonRegion.after.trim()) {
    lessonRegion.after.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      unmapped.push({
        line: index + 1,
        text: line,
        reason: "content_after_lesson_plan_end",
        context: "lesson_plan",
      });
    });
  }

  let working = lessonRegion.content;
  const metaSplitIndex = working.search(/@WEEKLY_START@/i);
  const metaRegion = metaSplitIndex >= 0 ? working.slice(0, metaSplitIndex) : working;
  const { fields: metaFields, unmapped: metaUnmapped } = parseFieldBlock(metaRegion, V2_LESSON_FIELDS, {
    context: "lesson_metadata",
  });
  unmapped.push(...metaUnmapped);

  const title = normalizedShortText(metaFields.TITLE);
  if (!title) errors.push("Missing required field: TITLE:");
  if (title) sectionsDetected.push("TITLE");

  const age = normalizeCurriculumImportAge(metaFields.AGE_GROUP);
  if (!age) errors.push("AGE_GROUP is missing or invalid. Expected Infant, Toddler, or Preschool.");
  else sectionsDetected.push("AGE_GROUP");

  const theme = normalizedShortText(metaFields.THEME);
  if (!theme) warnings.push("THEME is empty.");

  const planRaw = normalizedShortText(metaFields.PLAN);
  let plan = "Free";
  if (planRaw) {
    if (planRaw === "Pro" || planRaw === "Free") plan = planRaw;
    else errors.push(`PLAN must be Free or Pro (got "${planRaw}").`);
  }

  const statusRaw = normalizedShortText(metaFields.STATUS).toLowerCase();
  let status = "draft";
  if (statusRaw) {
    if (CURRICULUM_LESSON_STATUSES.includes(statusRaw)) status = statusRaw;
    else errors.push(`STATUS must be draft, published, featured, or archived (got "${metaFields.STATUS}").`);
  }

  if (existingTitles.map((item) => String(item).trim().toLowerCase()).includes(title.toLowerCase())) {
    warnings.push(`Duplicate lesson plan title "${title}" detected.`);
  }

  const weeklyRegion = extractMarkedRegion(working, V2_MARKERS.WEEKLY_START, V2_MARKERS.WEEKLY_END);
  let weeklyFields = {};
  let weeklyBooks = [];
  let weeklySongs = [];
  if (weeklyRegion.found) {
    sectionsDetected.push("WEEKLY");
    let weeklyWorking = weeklyRegion.content;
    const booksRegion = extractMarkedRegion(weeklyWorking, V2_MARKERS.WEEKLY_BOOKS_START, V2_MARKERS.WEEKLY_BOOKS_END);
    if (booksRegion.found) {
      weeklyBooks = parseCurriculumImportListLines(booksRegion.content, { parts: 3 });
      weeklyWorking = removeMarkedRegion(weeklyWorking, V2_MARKERS.WEEKLY_BOOKS_START, V2_MARKERS.WEEKLY_BOOKS_END);
      sectionsDetected.push("WEEKLY_BOOKS");
    }
    const songsRegion = extractMarkedRegion(weeklyWorking, V2_MARKERS.WEEKLY_SONGS_START, V2_MARKERS.WEEKLY_SONGS_END);
    if (songsRegion.found) {
      weeklySongs = parseCurriculumImportListLines(songsRegion.content, { parts: 2 });
      weeklyWorking = removeMarkedRegion(weeklyWorking, V2_MARKERS.WEEKLY_SONGS_START, V2_MARKERS.WEEKLY_SONGS_END);
      sectionsDetected.push("WEEKLY_SONGS");
    }
    const parsedWeekly = parseFieldBlock(weeklyWorking, V2_WEEKLY_FIELDS, { context: "weekly" });
    weeklyFields = parsedWeekly.fields;
    unmapped.push(...parsedWeekly.unmapped);
  } else {
    warnings.push("Missing @WEEKLY_START@ / @WEEKLY_END@ section.");
  }

  const dailyPlans = emptyCurriculumDailyPlans();
  let activityCount = 0;
  const daysPresent = [];

  CURRICULUM_WEEKDAYS.forEach((dayKey) => {
    const dayPrefix = DAY_MARKER_PREFIX[dayKey];
    const dayRegion = extractMarkedRegion(working, `@${dayPrefix}_START@`, `@${dayPrefix}_END@`);
    if (!dayRegion.found) return;
    sectionsDetected.push(dayPrefix);
    daysPresent.push(dayKey);
    const parsedDay = parseV2DaySection(dayKey, dayRegion.content, { existingItemIds, generateItemId });
    dailyPlans[dayKey] = parsedDay.day;
    activityCount += parsedDay.activityCount;
    errors.push(...parsedDay.errors);
    warnings.push(...parsedDay.warnings);
    unmapped.push(...parsedDay.unmapped);
  });

  if (!activityCount) {
    errors.push("At least one @ACTIVITY_START@ block with ACTIVITY_NAME is required.");
  }

  const data = {
    _formatVersion: 2,
    title: title || "Untitled Lesson Plan",
    age: age || "",
    theme,
    plan,
    status,
    learningDomains: parseLearningDomainsList(weeklyFields.LEARNING_DOMAINS),
    weeklyOverview: preserveMultilineText(weeklyFields.WEEKLY_OVERVIEW),
    objectives: preserveMultilineText(weeklyFields.WEEKLY_OBJECTIVES),
    weeklyMaterials: preserveMultilineText(weeklyFields.WEEKLY_MATERIALS),
    vocabularyWords: preserveMultilineText(weeklyFields.WEEKLY_VOCABULARY),
    familyConnection: preserveMultilineText(weeklyFields.FAMILY_CONNECTION),
    observationOpportunities: preserveMultilineText(weeklyFields.OBSERVATION_OPPORTUNITIES),
    adaptations: preserveMultilineText(weeklyFields.ADAPTATIONS),
    books: weeklyBooks,
    songs: weeklySongs,
    dailyPlans,
    dailyPlansCompat: flattenDailyPlansForV1Compat(dailyPlans),
    _activityCount: activityCount,
  };

  const parseReport = {
    formatVersion: 2,
    title: data.title,
    age: data.age,
    plan: data.plan,
    status: data.status,
    activityCount,
    activityLibraryEntries: activityCount,
    daysPresent,
    sectionsDetected,
    weeklyBookCount: weeklyBooks.length,
    weeklySongCount: weeklySongs.length,
    unmappedLineCount: unmapped.length,
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    unmapped,
    parseReport,
    data,
  };
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
    activityCategory: PLAY_ACTIVITY_CATEGORIES_V1[0],
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
  if (!PLAY_ACTIVITY_CATEGORIES_V1.includes(activity.activityCategory)) {
    activity.activityCategory = "Open-Ended Exploration";
  }
  return activity;
}

function parseCurriculumLessonPlanImportV1(text, { existingItemIds = new Map(), generateItemId = generateCurriculumItemId } = {}) {
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
    unmapped: [],
    parseReport: {
      formatVersion: 1,
      title: title || "Untitled Lesson Plan",
      activityCount,
      activityLibraryEntries: activityCount,
      daysPresent: CURRICULUM_WEEKDAYS.filter((day) => dailyPlans[day].items.length > 0),
      sectionsDetected: Object.keys(sections),
      unmappedLineCount: 0,
    },
    data: {
      _formatVersion: 1,
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
      dailyPlansCompat: flattenDailyPlansForV1Compat(dailyPlans),
      _activityCount: activityCount,
    },
  };
}

function parseCurriculumLessonPlanImport(text, options = {}) {
  if (detectImportFormat(text) === "v2") {
    const blocks = extractAllMarkedRegions(text, V2_MARKERS.LESSON_PLAN_START, V2_MARKERS.LESSON_PLAN_END);
    if (blocks.length > 1) {
      return {
        ok: false,
        errors: [`Detected ${blocks.length} lesson plans. Use parseCurriculumLessonPlanBulkImport() for multi-plan paste.`],
        warnings: [],
        unmapped: [],
        parseReport: { formatVersion: 2, lessonPlanCount: blocks.length },
        data: null,
      };
    }
    return parseCurriculumLessonPlanImportV2(text, options);
  }
  return parseCurriculumLessonPlanImportV1(text, options);
}

function parseCurriculumLessonPlanBulkImport(text, options = {}) {
  const raw = String(text || "");
  const blocks = extractAllMarkedRegions(raw, V2_MARKERS.LESSON_PLAN_START, V2_MARKERS.LESSON_PLAN_END);
  const unmapped = [];
  if (!blocks.length) {
    return {
      ok: false,
      lessonPlans: [],
      summary: {
        lessonPlanCount: 0,
        readyCount: 0,
        errorCount: 0,
        activityCount: 0,
        duplicateTitleWarnings: 0,
        unmappedLineCount: 0,
      },
      errors: ["No @LESSON_PLAN_START@ / @LESSON_PLAN_END@ blocks detected."],
      unmapped: [],
    };
  }

  const seenTitles = new Set((options.existingTitles || []).map((title) => String(title).trim().toLowerCase()));
  const results = blocks.map((block, index) => {
    const wrapped = `${V2_MARKERS.LESSON_PLAN_START}\n${block.content}\n${V2_MARKERS.LESSON_PLAN_END}`;
    const parsed = parseCurriculumLessonPlanImportV2(wrapped, {
      ...options,
      existingTitles: [...seenTitles],
    });
    if (parsed.data?.title) {
      const key = parsed.data.title.trim().toLowerCase();
      if (seenTitles.has(key)) {
        parsed.warnings.push(`Duplicate title "${parsed.data.title}" within bulk import (plan #${index + 1}).`);
      }
      seenTitles.add(key);
    }
    return { index: index + 1, ...parsed };
  });

  const summary = {
    lessonPlanCount: results.length,
    readyCount: results.filter((item) => item.ok).length,
    errorCount: results.filter((item) => !item.ok).length,
    activityCount: results.reduce((sum, item) => sum + (item.parseReport?.activityCount || 0), 0),
    duplicateTitleWarnings: results.reduce((sum, item) => sum + item.warnings.filter((w) => w.includes("Duplicate")).length, 0),
    unmappedLineCount: results.reduce((sum, item) => sum + (item.unmapped?.length || 0), 0),
  };

  return {
    ok: summary.errorCount === 0,
    lessonPlans: results,
    summary,
    errors: summary.errorCount ? [`${summary.errorCount} of ${summary.lessonPlanCount} lesson plans contain errors.`] : [],
    unmapped: results.flatMap((item) => item.unmapped || []),
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

const CURRICULUM_LESSON_IMPORT_V2_TEMPLATE = `@LESSON_PLAN_START@

TITLE:
Your Lesson Plan Title

AGE_GROUP:
Preschool

THEME:
Your Theme

PLAN:
Pro

STATUS:
draft

@WEEKLY_START@
LEARNING_DOMAINS:
Science, Language & Literacy

WEEKLY_OVERVIEW:
Write the weekly overview here.

WEEKLY_OBJECTIVES:
Objective one
Objective two

WEEKLY_MATERIALS:
Material one, material two

WEEKLY_VOCABULARY:
word one, word two

@WEEKLY_BOOKS_START@
Book Title | Author | Notes
@WEEKLY_BOOKS_END@

@WEEKLY_SONGS_START@
Song Title | Notes
@WEEKLY_SONGS_END@

FAMILY_CONNECTION:
Weekly family connection text.

OBSERVATION_OPPORTUNITIES:
Weekly observation notes.

ADAPTATIONS:
Weekly adaptations.
@WEEKLY_END@

@MONDAY_START@
DAILY_THEME:
Monday focus

@MONDAY_BOOKS_START@
Monday Book | Author | Notes
@MONDAY_BOOKS_END@

@MONDAY_SONGS_START@
Monday Song | Notes
@MONDAY_SONGS_END@

@ACTIVITY_START@
ACTIVITY_NAME:
Sample Activity
CATEGORY:
Sensory Play
MATERIALS:
Materials list
SETUP:
Setup text
DIRECTIONS:
1. Step one
2. Step two
LEARNING_GOAL:
Goal one
@ACTIVITY_END@
@MONDAY_END@

@LESSON_PLAN_END@
`;

const api = {
  PLAY_ACTIVITY_CATEGORIES: PLAY_ACTIVITY_CATEGORIES_V1,
  APPROVED_V2_ACTIVITY_CATEGORIES,
  CURRICULUM_LEARNING_DOMAINS,
  CURRICULUM_WEEKDAYS,
  CURRICULUM_LESSON_IMPORT_V2_TEMPLATE,
  detectImportFormat,
  emptyCurriculumDailyPlans,
  emptyCurriculumDailyPlanDay,
  generateCurriculumItemId,
  parseCurriculumImportListLines,
  parseCurriculumLessonPlanImport,
  parseCurriculumLessonPlanImportV1,
  parseCurriculumLessonPlanImportV2,
  parseCurriculumLessonPlanBulkImport,
  formatCurriculumLessonPlanImport,
  formatImportActivity,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.CurriculumLessonImportParser = api;
}
})();
