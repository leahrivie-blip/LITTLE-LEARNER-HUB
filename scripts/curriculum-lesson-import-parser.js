/**
 * Shared Play-Based Curriculum lesson plan import parser (label-only format).
 * Used by browser (global CurriculumLessonImportParser), Node tests, and seed scripts.
 *
 * Policy: paste TITLE:/AGE_GROUP:/MONDAY/ACTIVITY_NAME: style plans exactly as authored.
 * Preserve wording; never regenerate. Unmapped content is reported, not dropped silently.
 * Legacy v1/v2 marker formats are rejected by the public importer entry point.
 */
(function curriculumLessonImportParserModule() {
let nodeCrypto = null;
try {
  nodeCrypto = require("crypto");
} catch {
  nodeCrypto = null;
}

let curriculumSentinel = null;
try {
  curriculumSentinel = require("./curriculum-sentinel.js");
} catch {
  curriculumSentinel = (typeof globalThis !== "undefined" && globalThis.LLHCurriculumSentinel) || null;
}

let learningDomainsApi = null;
try {
  learningDomainsApi = require("./curriculum-learning-domains.js");
} catch {
  learningDomainsApi = null;
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

const ACTIVITY_CATEGORY_ALIASES = {
  "gross motor & movement": "Gross Motor",
  "gross motor and movement": "Gross Motor",
  "gross-motor": "Gross Motor",
  "movement": "Gross Motor",
  "fine motor skills": "Fine Motor",
  "fine-motor": "Fine Motor",
  "sensory": "Sensory Play",
  "sensory bin": "Sensory Play",
  "music and movement": "Music & Movement",
  "music": "Music & Movement",
  "stem": "STEM/Discovery",
  "stem & discovery": "STEM/Discovery",
  "discovery": "STEM/Discovery",
  "science": "STEM/Discovery",
  "math": "STEM/Discovery",
  "mathematics": "STEM/Discovery",
  "engineering": "STEM/Discovery",
  "language & literacy": "Literacy",
  "language and literacy": "Literacy",
  "social-emotional": "Open-Ended Exploration",
  "social emotional": "Open-Ended Exploration",
  "art & creativity": "Art",
  "creative arts": "Art",
  "outdoor": "Outdoor Play",
  "outdoors": "Outdoor Play",
  "dramatic": "Dramatic Play",
  "pretend play": "Dramatic Play",
  "circle": "Circle Time",
  "literacy & language": "Literacy",
  "language": "Literacy",
  "open ended": "Open-Ended Exploration",
  "open-ended": "Open-Ended Exploration",
  "open-ended exploration": "Open-Ended Exploration",
};

const CURRICULUM_LEARNING_DOMAINS = learningDomainsApi?.CURRICULUM_LEARNING_DOMAINS || [
  "Social Emotional",
  "Language & Literacy",
  "Math",
  "Science",
  "Physical Development",
  "Creative Arts",
];
const LEARNING_DOMAIN_ALIASES = learningDomainsApi?.LEARNING_DOMAIN_ALIASES || {
  "fine motor": "Physical Development",
  "gross motor": "Physical Development",
  physical: "Physical Development",
  motor: "Physical Development",
  literacy: "Language & Literacy",
  language: "Language & Literacy",
  "language and literacy": "Language & Literacy",
  social: "Social Emotional",
  "social-emotional": "Social Emotional",
  "social emotional": "Social Emotional",
  sel: "Social Emotional",
  art: "Creative Arts",
  arts: "Creative Arts",
  creative: "Creative Arts",
  maths: "Math",
  mathematics: "Math",
};

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

const V3_LESSON_FIELDS = new Set([
  "TITLE",
  "AGE_GROUP",
  "THEME",
  "PLAN",
  "STATUS",
  "LEARNING_DOMAINS",
  "WEEKLY_OVERVIEW",
  "LEARNING_OBJECTIVES",
  "WEEKLY_MATERIALS",
  "VOCABULARY",
  "BOOKS",
  "SONGS",
  "FAMILY_CONNECTION",
  "OBSERVATION_OPPORTUNITIES",
  "ADAPTATIONS",
]);

const V3_ACTIVITY_FIELDS = new Set([
  "ACTIVITY_NAME",
  "CATEGORY",
  "OBJECTIVE",
  "DESCRIPTION",
  "MATERIALS",
  "SETUP",
  "TEACHER_ROLE",
  "TEACHER_LANGUAGE",
  "DIRECTIONS",
  "LEARNING_GOALS",
  "OBSERVATION_OPPORTUNITIES",
  "VOCABULARY",
  "EXTENSIONS",
  "ADAPTATIONS",
  "SAFETY_NOTES",
  "AGE_MODIFICATIONS",
]);

const V3_DAY_FIELDS = new Set([
  "DAILY_THEME",
  "DAILY_OBJECTIVES",
  "DAILY_VOCABULARY",
  "DAILY_MATERIALS",
  "DAILY_LEARNING_DOMAINS",
  "CIRCLE_TIME",
  "OUTDOOR_PLAY",
  "DAILY_OBSERVATIONS",
  "OBSERVATION_OPPORTUNITIES",
  "DAILY_ADAPTATIONS",
  "ADAPTATIONS",
  "SAFETY_NOTES",
]);

const V3_WEEKDAY_HEADERS = new Set(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);

const V3_FIELD_ALIASES = {
  "LEARNING GOALS": "LEARNING_GOALS",
  "LEARNING GOAL": "LEARNING_GOALS",
  LEARNING_GOAL: "LEARNING_GOALS",
  "LEARNING OBJECTIVES": "LEARNING_OBJECTIVES",
  "AGE GROUP": "AGE_GROUP",
  "ACTIVITY NAME": "ACTIVITY_NAME",
  "WEEKLY OVERVIEW": "WEEKLY_OVERVIEW",
  "WEEKLY MATERIALS": "WEEKLY_MATERIALS",
  "FAMILY CONNECTION": "FAMILY_CONNECTION",
  "OBSERVATION OPPORTUNITIES": "OBSERVATION_OPPORTUNITIES",
  "LEARNING DOMAINS": "LEARNING_DOMAINS",
  "TEACHER ROLE": "TEACHER_ROLE",
  "TEACHER LANGUAGE": "TEACHER_LANGUAGE",
  "DAILY THEME": "DAILY_THEME",
  "DAILY OBJECTIVES": "DAILY_OBJECTIVES",
  "DAILY VOCABULARY": "DAILY_VOCABULARY",
  "DAILY MATERIALS": "DAILY_MATERIALS",
  "DAILY LEARNING DOMAINS": "DAILY_LEARNING_DOMAINS",
  "CIRCLE TIME": "CIRCLE_TIME",
  "OUTDOOR PLAY": "OUTDOOR_PLAY",
  "DAILY OBSERVATIONS": "DAILY_OBSERVATIONS",
  "DAILY ADAPTATIONS": "DAILY_ADAPTATIONS",
  "SAFETY NOTES": "SAFETY_NOTES",
  "AGE MODIFICATIONS": "AGE_MODIFICATIONS",
};

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
  const text = String(value || "").replace(/\r\n?/g, "\n").replace(/\s+$/gm, "");
  if (!text) return "";
  if (curriculumSentinel?.isSentinelValue?.(text)) return "";
  return text.slice(0, max);
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
  return parseCurriculumImportAgeValue(ageRaw).display;
}

function curriculumAgeBucket(ageRaw) {
  return parseCurriculumImportAgeValue(ageRaw).bucket;
}

function parseCurriculumImportAgeValue(ageRaw) {
  const raw = normalizedShortText(ageRaw);
  if (!raw) return { display: "", bucket: "" };
  const accepted = [
    "Infant 0–6 Months",
    "Infant 0-6 Months",
    "Infant 6–12 Months",
    "Infant 6-12 Months",
    "Infant",
    "Toddler 12–24 Months",
    "Toddler 12-24 Months",
    "Toddler 24–36 Months",
    "Toddler 24-36 Months",
    "Toddler",
    "Preschool 3–4 Years",
    "Preschool 3-4 Years",
    "Preschool 4–5 Years",
    "Preschool 4-5 Years",
    "Preschool",
  ];
  const normalizedInput = raw.replace(/\s+/g, " ").trim();
  const exact = accepted.find((entry) => entry.toLowerCase() === normalizedInput.toLowerCase());
  if (exact) {
    return { display: exact.replace(/-/g, "–"), bucket: curriculumAgeBucketFromText(exact) };
  }
  const lower = normalizedInput.toLowerCase();
  if (lower.includes("infant")) return { display: normalizedInput, bucket: "Infant" };
  if (lower.includes("toddler")) return { display: normalizedInput, bucket: "Toddler" };
  if (lower.includes("preschool")) return { display: normalizedInput, bucket: "Preschool" };
  return { display: "", bucket: "" };
}

function curriculumAgeBucketFromText(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("infant")) return "Infant";
  if (lower.includes("toddler")) return "Toddler";
  if (lower.includes("preschool")) return "Preschool";
  return "";
}

function parseLearningDomainsList(text) {
  if (learningDomainsApi?.parseLearningDomainsList) {
    return learningDomainsApi.parseLearningDomainsList(text);
  }
  const seen = new Set();
  const domains = [];
  String(text || "")
    .split(/[,;\n]/)
    .map((item) => normalizedShortText(item))
    .filter(Boolean)
    .forEach((item) => {
      const exact = CURRICULUM_LEARNING_DOMAINS.find((domain) => domain.toLowerCase() === item.toLowerCase());
      const aliased = LEARNING_DOMAIN_ALIASES[item.toLowerCase()];
      const resolved = exact || aliased || "";
      if (!resolved || seen.has(resolved)) return;
      seen.add(resolved);
      domains.push(resolved);
    });
  return domains;
}

function normalizeActivityCategory(raw) {
  const value = normalizedShortText(raw);
  if (!value) return "";
  const exact = PLAY_ACTIVITY_CATEGORIES_V1.find((entry) => entry.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const aliased = ACTIVITY_CATEGORY_ALIASES[value.toLowerCase()];
  if (aliased) return aliased;
  const lower = value.toLowerCase();
  const fuzzy = PLAY_ACTIVITY_CATEGORIES_V1.find((entry) => lower.includes(entry.toLowerCase()) || entry.toLowerCase().includes(lower));
  return fuzzy || "";
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
        if (!title) return null;
        if (curriculumSentinel?.isSentinelValue?.(title)) return null;
        return { title, author: author || "", notes: notes || "" };
      }
      const [title, notes] = chunks;
      if (!title) return null;
      if (curriculumSentinel?.isSentinelValue?.(title)) return null;
      return { title, notes: notes || "" };
    })
    .filter(Boolean)
    .map((entry) => (curriculumSentinel?.normalizeBookOrSongEntry
      ? curriculumSentinel.normalizeBookOrSongEntry(entry)
      : entry))
    .filter(Boolean);
}

function parseTextListItems(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line && !(curriculumSentinel?.isSentinelValue?.(line)));
}

function isV3LabelOnlyFormat(text) {
  const raw = String(text || "");
  if (/@LESSON_PLAN_START@/i.test(raw)) return false;
  // Preferred ChatGPT / current format uses underscore labels (value inline or next line).
  if (/^ACTIVITY_NAME:\s*/im.test(raw)) return true;
  if (/^TITLE:\s*/im.test(raw) && /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY):?\s*$/im.test(raw)) return true;
  if (/^AGE_GROUP:\s*/im.test(raw) && /^LEARNING_OBJECTIVES:\s*/im.test(raw) && !/^ACTIVITY NAME:\s*$/im.test(raw)) {
    return true;
  }
  // TITLE + THEME + weekday headers with underscore activity labels.
  if (/^TITLE:\s*$/im.test(raw) && /^THEME:\s*$/im.test(raw) && /^MONDAY:\s*$/im.test(raw) && /^ACTIVITY_NAME:\s*$/im.test(raw)) {
    return true;
  }
  return false;
}

function detectImportFormat(text) {
  if (/@LESSON_PLAN_START@/i.test(String(text || ""))) return "v2";
  if (isV3LabelOnlyFormat(text)) return "v3";
  return "unsupported";
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

function canonicalV3FieldName(name, allowedFields = null) {
  const upper = String(name || "").trim().toUpperCase().replace(/\s+/g, " ");
  const underscored = upper.replace(/ /g, "_");
  const alias = V3_FIELD_ALIASES[upper] || V3_FIELD_ALIASES[underscored];
  const canonical = alias || underscored;
  if (allowedFields && !allowedFields.has(canonical)) return "";
  return canonical;
}

function parseFieldBlock(text, allowedFields, { lineOffset = 1, context = "", fieldAliases = null } = {}) {
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

  const resolveField = (rawName) => {
    if (fieldAliases) return canonicalV3FieldName(rawName, allowedFields);
    const underscored = String(rawName || "").trim().toUpperCase().replace(/\s+/g, "_");
    return allowedFields.has(underscored) ? underscored : "";
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
    const emptyFieldMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_/ ]*):\s*$/);
    if (emptyFieldMatch) {
      const canonical = resolveField(emptyFieldMatch[1]);
      if (canonical) {
        flush();
        currentField = canonical;
        return;
      }
    }
    const inlineFieldMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_/ ]*):\s+(.+)$/);
    if (inlineFieldMatch) {
      const canonical = resolveField(inlineFieldMatch[1]);
      if (canonical) {
        flush();
        fields[canonical] = preserveMultilineText(inlineFieldMatch[2]);
        currentField = "";
        currentLines = [];
        return;
      }
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
      age: age || ageRaw || "",
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

function splitV3WeekdaySections(text) {
  const lines = String(text || "").split(/\r?\n/);
  const lessonLines = [];
  const daySections = Object.fromEntries(CURRICULUM_WEEKDAYS.map((day) => [day, []]));
  let currentDay = "";
  let lineOffset = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Accept both "MONDAY" and "MONDAY:" as weekday headers.
    const weekdayMatch = trimmed.match(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY):?\s*$/i);
    if (weekdayMatch) {
      currentDay = weekdayMatch[1].toLowerCase();
      return;
    }
    if (currentDay && daySections[currentDay]) {
      daySections[currentDay].push({ line: lineOffset + index, text: line });
    } else {
      lessonLines.push({ line: lineOffset + index, text: line });
    }
  });

  return {
    lessonBody: lessonLines.map((entry) => entry.text).join("\n"),
    lessonLineEntries: lessonLines,
    daySections: Object.fromEntries(
      CURRICULUM_WEEKDAYS.map((day) => [day, daySections[day].map((entry) => entry.text).join("\n")]),
    ),
    dayLineOffsets: Object.fromEntries(
      CURRICULUM_WEEKDAYS.map((day) => {
        const first = daySections[day][0];
        return [day, first ? first.line : null];
      }),
    ),
  };
}

function splitV3DayActivities(dayContent) {
  const content = String(dayContent || "");
  if (!content.trim()) return [];
  // Split before each ACTIVITY_NAME / ACTIVITY NAME, whether the value is inline or on the next line.
  const blocks = content
    .split(/(?=^ACTIVITY[_ ]NAME:\s*)/im)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.filter((block) => /^ACTIVITY[_ ]NAME:\s*/im.test((block.split(/\r?\n/)[0] || "").trim()));
}

function parseV3ActivityBlock(block, { dayKey, lineOffset = 1, existingItemIds = new Map(), generateItemId = generateCurriculumItemId } = {}) {
  const errors = [];
  const warnings = [];
  const { fields, unmapped } = parseFieldBlock(block, V3_ACTIVITY_FIELDS, {
    lineOffset,
    context: `${dayKey}:activity`,
    fieldAliases: V3_FIELD_ALIASES,
  });

  const title = normalizedShortText(fields.ACTIVITY_NAME);
  if (!title) {
    errors.push(`${dayKey}: activity block missing ACTIVITY_NAME.`);
    return { activity: null, errors, warnings, unmapped };
  }

  const categoryRaw = normalizedShortText(fields.CATEGORY);
  const category = normalizeActivityCategory(categoryRaw);
  if (!categoryRaw) {
    errors.push(`${dayKey}: "${title}" is missing CATEGORY.`);
  } else if (!category) {
    errors.push(`${dayKey}: "${title}" has invalid CATEGORY "${categoryRaw}". Use one of: ${PLAY_ACTIVITY_CATEGORIES_V1.join(", ")}.`);
  }

  if (!preserveMultilineText(fields.DESCRIPTION)) {
    errors.push(`${dayKey}: "${title}" is missing DESCRIPTION.`);
  }

  if (!preserveMultilineText(fields.MATERIALS)) {
    errors.push(`${dayKey}: "${title}" is missing MATERIALS.`);
  }

  if (!preserveMultilineText(fields.DIRECTIONS)) {
    errors.push(`${dayKey}: "${title}" is missing DIRECTIONS.`);
  }

  if (!preserveMultilineText(fields.TEACHER_ROLE)) {
    errors.push(`${dayKey}: "${title}" is missing TEACHER_ROLE.`);
  }

  let stepsText = preserveMultilineText(fields.DIRECTIONS);
  let learningGoals = parseActivityGoals(fields.LEARNING_GOALS);
  // Older drafts nested "LEARNING GOAL:" under directions — lift it out when needed.
  if (!learningGoals.length && /learning\s+goals?:/i.test(stepsText)) {
    const split = stepsText.split(/\n(?=LEARNING\s+GOALS?:)/i);
    stepsText = preserveMultilineText(split[0] || "");
    learningGoals = parseActivityGoals((split.slice(1).join("\n") || "").replace(/^LEARNING\s+GOALS?:\s*/i, ""));
  }
  if (!learningGoals.length) {
    errors.push(`${dayKey}: "${title}" is missing LEARNING_GOALS.`);
  }

  const itemKey = `${dayKey}:${title.toLowerCase()}`;
  const itemId = existingItemIds.get(itemKey) || generateItemId();

  const activity = {
    itemId,
    importKey: "",
    activityCategory: category || "",
    title,
    objective: preserveMultilineText(fields.OBJECTIVE),
    description: preserveMultilineText(fields.DESCRIPTION),
    learningDomains: [],
    materials: preserveMultilineText(fields.MATERIALS),
    setup: preserveMultilineText(fields.SETUP),
    steps: stepsText,
    teacherRole: preserveMultilineText(fields.TEACHER_ROLE),
    teacherLanguage: preserveMultilineText(fields.TEACHER_LANGUAGE),
    learningGoals,
    observationOpportunities: preserveMultilineText(fields.OBSERVATION_OPPORTUNITIES),
    vocabulary: preserveMultilineText(fields.VOCABULARY),
    extensions: preserveMultilineText(fields.EXTENSIONS),
    adaptations: preserveMultilineText(fields.ADAPTATIONS),
    safetyNotes: preserveMultilineText(fields.SAFETY_NOTES),
    ageModifications: preserveMultilineText(fields.AGE_MODIFICATIONS),
  };

  return { activity, errors, warnings, unmapped };
}

function splitV3DayPreambleAndActivities(dayContent) {
  const content = String(dayContent || "");
  const match = /^(ACTIVITY[_ ]NAME:\s*)/im.exec(content);
  if (!match) {
    return { preamble: content.trim(), activityContent: "" };
  }
  return {
    preamble: content.slice(0, match.index).trim(),
    activityContent: content.slice(match.index).trim(),
  };
}

function applyV3DayFields(dayPlan, fields = {}) {
  const theme = preserveMultilineText(fields.DAILY_THEME);
  const objectives = preserveMultilineText(fields.DAILY_OBJECTIVES);
  const vocabulary = preserveMultilineText(fields.DAILY_VOCABULARY);
  const materials = preserveMultilineText(fields.DAILY_MATERIALS);
  const learningDomains = parseLearningDomainsList(fields.DAILY_LEARNING_DOMAINS);
  const circleTime = preserveMultilineText(fields.CIRCLE_TIME);
  const outdoorPlay = preserveMultilineText(fields.OUTDOOR_PLAY);
  const observations = preserveMultilineText(fields.DAILY_OBSERVATIONS || fields.OBSERVATION_OPPORTUNITIES);
  const adaptations = preserveMultilineText(fields.DAILY_ADAPTATIONS || fields.ADAPTATIONS);
  const safetyNotes = preserveMultilineText(fields.SAFETY_NOTES);

  if (theme) dayPlan.theme = theme;
  if (objectives) dayPlan.objectives = objectives;
  if (vocabulary) dayPlan.vocabulary = vocabulary;
  if (materials) dayPlan.materials = materials;
  if (learningDomains.length) dayPlan.learningDomains = learningDomains;
  if (circleTime) {
    dayPlan.circleTime = circleTime.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (outdoorPlay) dayPlan.outdoorPlay = outdoorPlay;
  if (observations) {
    dayPlan.observations = observations.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (adaptations) dayPlan.adaptations = adaptations;
  if (safetyNotes) dayPlan.safetyNotes = safetyNotes;
  return dayPlan;
}

function parseCurriculumLessonPlanImportV3(text, options = {}) {
  const {
    existingItemIds = new Map(),
    generateItemId = generateCurriculumItemId,
    existingTitles = [],
  } = options;
  const errors = [];
  const warnings = [];
  const unmapped = [];
  const sectionsDetected = [];
  const raw = String(text || "").trim();

  if (!raw) {
    return {
      ok: false,
      errors: ["Paste is empty. Include a complete lesson plan with TITLE, AGE_GROUP, weekday sections, and activities."],
      warnings,
      unmapped,
      parseReport: { formatVersion: 3, sectionsDetected: [], activityCount: 0, activityLibraryEntries: 0, daysPresent: [] },
      data: null,
    };
  }

  const { lessonBody, daySections, dayLineOffsets } = splitV3WeekdaySections(raw);
  const { fields: lessonFields, unmapped: lessonUnmapped } = parseFieldBlock(lessonBody, V3_LESSON_FIELDS, {
    context: "lesson",
    fieldAliases: V3_FIELD_ALIASES,
  });
  unmapped.push(...lessonUnmapped);

  const title = normalizedShortText(lessonFields.TITLE);
  if (!title) errors.push("Missing required field: TITLE:");
  else sectionsDetected.push("TITLE");

  const ageValue = parseCurriculumImportAgeValue(lessonFields.AGE_GROUP);
  if (!ageValue.display) errors.push("Missing required field: AGE_GROUP.");
  else sectionsDetected.push("AGE_GROUP");

  const theme = normalizedShortText(lessonFields.THEME);
  if (!theme) errors.push("Missing required field: THEME:");
  else sectionsDetected.push("THEME");

  const planRaw = normalizedShortText(lessonFields.PLAN);
  let plan = "";
  if (!planRaw) {
    errors.push("Missing required field: PLAN (Free or Pro).");
  } else if (planRaw === "Pro" || planRaw === "Free") {
    plan = planRaw;
    sectionsDetected.push("PLAN");
  } else {
    errors.push(`PLAN must be Free or Pro (got "${planRaw}").`);
  }

  const statusRaw = normalizedShortText(lessonFields.STATUS).toLowerCase();
  let status = "";
  if (!statusRaw) {
    errors.push("Missing required field: STATUS (draft, published, featured, or archived).");
  } else if (CURRICULUM_LESSON_STATUSES.includes(statusRaw)) {
    status = statusRaw;
    sectionsDetected.push("STATUS");
  } else {
    errors.push(`STATUS must be draft, published, featured, or archived (got "${lessonFields.STATUS}").`);
  }

  if (!preserveMultilineText(lessonFields.WEEKLY_OVERVIEW)) {
    errors.push("Missing required field: WEEKLY_OVERVIEW:");
  } else {
    sectionsDetected.push("WEEKLY_OVERVIEW");
  }

  if (title && existingTitles.map((item) => String(item).trim().toLowerCase()).includes(title.toLowerCase())) {
    warnings.push(`Duplicate lesson plan title "${title}" detected.`);
  }

  if (lessonFields.LEARNING_DOMAINS) sectionsDetected.push("LEARNING_DOMAINS");
  if (lessonFields.WEEKLY_OVERVIEW) sectionsDetected.push("WEEKLY_OVERVIEW");
  if (lessonFields.LEARNING_OBJECTIVES) sectionsDetected.push("LEARNING_OBJECTIVES");
  if (lessonFields.WEEKLY_MATERIALS) sectionsDetected.push("WEEKLY_MATERIALS");
  if (lessonFields.VOCABULARY) sectionsDetected.push("VOCABULARY");
  if (lessonFields.BOOKS) sectionsDetected.push("BOOKS");
  if (lessonFields.SONGS) sectionsDetected.push("SONGS");
  if (lessonFields.FAMILY_CONNECTION) sectionsDetected.push("FAMILY_CONNECTION");
  if (lessonFields.OBSERVATION_OPPORTUNITIES) sectionsDetected.push("OBSERVATION_OPPORTUNITIES");
  if (lessonFields.ADAPTATIONS) sectionsDetected.push("ADAPTATIONS");

  const books = parseCurriculumImportListLines(lessonFields.BOOKS, { parts: 3 });
  const songs = parseCurriculumImportListLines(lessonFields.SONGS, { parts: 2 });

  const dailyPlans = emptyCurriculumDailyPlans();
  let activityCount = 0;
  const daysPresent = [];

  CURRICULUM_WEEKDAYS.forEach((dayKey) => {
    const dayContent = daySections[dayKey] || "";
    if (!dayContent.trim()) return;
    sectionsDetected.push(dayKey.toUpperCase());
    daysPresent.push(dayKey);

    const { preamble, activityContent } = splitV3DayPreambleAndActivities(dayContent);
    if (preamble) {
      const { fields: dayFields, unmapped: dayUnmapped } = parseFieldBlock(preamble, V3_DAY_FIELDS, {
        lineOffset: dayLineOffsets[dayKey] || 1,
        context: `${dayKey}:daily`,
        fieldAliases: V3_FIELD_ALIASES,
      });
      unmapped.push(...dayUnmapped);
      applyV3DayFields(dailyPlans[dayKey], dayFields);
      if (dayFields.DAILY_THEME || dayFields.CIRCLE_TIME || dayFields.OUTDOOR_PLAY) {
        sectionsDetected.push(`${dayKey.toUpperCase()}_DAILY_FIELDS`);
      }
    }

    const activityBlocks = splitV3DayActivities(activityContent || dayContent);
    if (!activityBlocks.length) {
      const trimmed = dayContent.trim();
      if (trimmed) {
        unmapped.push({
          line: dayLineOffsets[dayKey],
          text: trimmed.split(/\r?\n/)[0],
          reason: "unrecognized_line",
          context: `${dayKey}:daily`,
        });
        warnings.push(`${dayKey}: weekday section has content but no ACTIVITY_NAME blocks.`);
      }
      return;
    }

    activityBlocks.forEach((block) => {
      const parsedActivity = parseV3ActivityBlock(block, {
        dayKey,
        lineOffset: dayLineOffsets[dayKey] || 1,
        existingItemIds,
        generateItemId,
      });
      errors.push(...parsedActivity.errors);
      warnings.push(...parsedActivity.warnings);
      unmapped.push(...parsedActivity.unmapped);
      if (parsedActivity.activity) {
        dailyPlans[dayKey].items.push(parsedActivity.activity);
        activityCount += 1;
      }
    });
  });

  if (!activityCount) {
    errors.push("At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.");
  }

  const emptyWeekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"].filter((day) => {
    const items = Array.isArray(dailyPlans?.[day]?.items) ? dailyPlans[day].items : [];
    return !items.length;
  });
  if (emptyWeekdays.length) {
    const labels = emptyWeekdays.map((day) => day.toUpperCase()).join(", ");
    warnings.push(`Optional weekday sections not included: ${labels}. Empty weekday containers are kept; no placeholder activities were added.`);
  }

  const data = {
    _formatVersion: 3,
    title: title || "Untitled Lesson Plan",
    age: ageValue.display || "",
    ageBucket: ageValue.bucket || "",
    theme,
    plan: plan || "Free",
    status: status || "draft",
    learningDomains: parseLearningDomainsList(lessonFields.LEARNING_DOMAINS),
    weeklyOverview: preserveMultilineText(lessonFields.WEEKLY_OVERVIEW),
    objectives: preserveMultilineText(lessonFields.LEARNING_OBJECTIVES),
    weeklyMaterials: preserveMultilineText(lessonFields.WEEKLY_MATERIALS),
    vocabularyWords: preserveMultilineText(lessonFields.VOCABULARY),
    familyConnection: preserveMultilineText(lessonFields.FAMILY_CONNECTION),
    observationOpportunities: preserveMultilineText(lessonFields.OBSERVATION_OPPORTUNITIES),
    adaptations: preserveMultilineText(lessonFields.ADAPTATIONS),
    books,
    songs,
    dailyPlans,
    dailyPlansCompat: flattenDailyPlansForV1Compat(dailyPlans),
    _activityCount: activityCount,
  };

  const parseReport = {
    formatVersion: 3,
    title: data.title,
    age: data.age,
    theme: data.theme,
    plan: data.plan,
    status: data.status,
    activityCount,
    activityLibraryEntries: activityCount,
    daysPresent,
    sectionsDetected,
    weeklyBookCount: books.length,
    weeklySongCount: songs.length,
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

function parseCurriculumLessonPlanImport(text, options = {}) {
  const format = detectImportFormat(text);
  if (format === "v2") {
    return {
      ok: false,
      errors: [
        "Legacy @LESSON_PLAN_START@ marker format is no longer supported. Paste the current label-only format (TITLE:, AGE_GROUP:, MONDAY, ACTIVITY_NAME:, …) instead.",
      ],
      warnings: [],
      unmapped: [],
      parseReport: { formatVersion: 2, rejectedLegacyFormat: true },
      data: null,
    };
  }
  if (format !== "v3") {
    return {
      ok: false,
      errors: [
        "Paste a complete lesson plan using TITLE:, AGE_GROUP:, THEME:, PLAN:, STATUS:, WEEKLY_OVERVIEW:, weekday headers (MONDAY–FRIDAY), and ACTIVITY_NAME: blocks. No special markers are required.",
      ],
      warnings: [],
      unmapped: [],
      parseReport: { formatVersion: 0, rejectedLegacyFormat: true },
      data: null,
    };
  }
  return parseCurriculumLessonPlanImportV3(text, options);
}

function parseCurriculumLessonPlanBulkImport(text, options = {}) {
  const raw = String(text || "").trim();
  if (!raw) {
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
      errors: ["Paste is empty."],
      unmapped: [],
    };
  }
  // Bulk import now expects one or more label-only plans separated by a TITLE: restart.
  const chunks = raw.split(/(?=^TITLE:\s*)/im).map((chunk) => chunk.trim()).filter(Boolean);
  const plans = chunks.length ? chunks : [raw];
  const seenTitles = new Set((options.existingTitles || []).map((title) => String(title).trim().toLowerCase()));
  const results = plans.map((chunk, index) => {
    const parsed = parseCurriculumLessonPlanImport(chunk, {
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
    "ACTIVITY_NAME:",
    activity.title || "",
    "CATEGORY:",
    activity.activityCategory || "Open-Ended Exploration",
    "OBJECTIVE:",
    activity.objective || "",
    "DESCRIPTION:",
    activity.description || "",
    "MATERIALS:",
    activity.materials || "",
    "SETUP:",
    activity.setup || "",
    "TEACHER_ROLE:",
    activity.teacherRole || "",
    "TEACHER_LANGUAGE:",
    activity.teacherLanguage || "",
    "DIRECTIONS:",
    numberedDirections,
    "LEARNING_GOALS:",
    goals.join("\n"),
    "OBSERVATION_OPPORTUNITIES:",
    activity.observationOpportunities || "",
    "VOCABULARY:",
    activity.vocabulary || "",
    "EXTENSIONS:",
    activity.extensions || "",
    "ADAPTATIONS:",
    activity.adaptations || "",
    "SAFETY_NOTES:",
    activity.safetyNotes || "",
    "AGE_MODIFICATIONS:",
    activity.ageModifications || "",
  ].join("\n");
}

function formatCurriculumLessonPlanImportV3(plan = {}) {
  const entry = plan && typeof plan === "object" ? plan : {};
  const sections = [
    formatImportSection("TITLE", entry.title),
    formatImportSection("AGE_GROUP", entry.age),
    formatImportSection("THEME", entry.theme),
  ];
  if (entry.plan) sections.push(formatImportSection("PLAN", entry.plan));
  if (entry.status) sections.push(formatImportSection("STATUS", entry.status));
  if (Array.isArray(entry.learningDomains) && entry.learningDomains.length) {
    sections.push(formatImportSection("LEARNING_DOMAINS", entry.learningDomains.join(", ")));
  }
  sections.push(
    formatImportSection("WEEKLY_OVERVIEW", entry.weeklyOverview),
    formatImportSection("LEARNING_OBJECTIVES", entry.objectives),
    formatImportSection("WEEKLY_MATERIALS", entry.weeklyMaterials),
    formatImportSection("VOCABULARY", entry.vocabularyWords),
    formatImportSection("BOOKS", (entry.books || []).map((book) => [book.title, book.author, book.notes].filter(Boolean).join(" | ")).join("\n")),
    formatImportSection("SONGS", (entry.songs || []).map((song) => [song.title, song.notes].filter(Boolean).join(" | ")).join("\n")),
    formatImportSection("FAMILY_CONNECTION", entry.familyConnection),
    formatImportSection("OBSERVATION_OPPORTUNITIES", entry.observationOpportunities),
    formatImportSection("ADAPTATIONS", entry.adaptations),
  );
  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].forEach((dayKey) => {
    const day = dayKey.toLowerCase();
    const dayPlan = entry.dailyPlans?.[day] || {};
    const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
    const daySectionsOut = [];
    if (dayPlan.theme) daySectionsOut.push(formatImportSection("DAILY_THEME", dayPlan.theme));
    if (dayPlan.objectives) daySectionsOut.push(formatImportSection("DAILY_OBJECTIVES", dayPlan.objectives));
    if (dayPlan.vocabulary) daySectionsOut.push(formatImportSection("DAILY_VOCABULARY", dayPlan.vocabulary));
    if (dayPlan.materials) daySectionsOut.push(formatImportSection("DAILY_MATERIALS", dayPlan.materials));
    if (Array.isArray(dayPlan.learningDomains) && dayPlan.learningDomains.length) {
      daySectionsOut.push(formatImportSection("DAILY_LEARNING_DOMAINS", dayPlan.learningDomains.join(", ")));
    }
    if (Array.isArray(dayPlan.circleTime) ? dayPlan.circleTime.length : dayPlan.circleTime) {
      daySectionsOut.push(formatImportSection(
        "CIRCLE_TIME",
        Array.isArray(dayPlan.circleTime) ? dayPlan.circleTime.join("\n") : dayPlan.circleTime,
      ));
    }
    if (dayPlan.outdoorPlay) daySectionsOut.push(formatImportSection("OUTDOOR_PLAY", dayPlan.outdoorPlay));
    if (Array.isArray(dayPlan.observations) ? dayPlan.observations.length : dayPlan.observations) {
      daySectionsOut.push(formatImportSection(
        "DAILY_OBSERVATIONS",
        Array.isArray(dayPlan.observations) ? dayPlan.observations.join("\n") : dayPlan.observations,
      ));
    }
    if (dayPlan.adaptations) daySectionsOut.push(formatImportSection("DAILY_ADAPTATIONS", dayPlan.adaptations));
    if (dayPlan.safetyNotes) daySectionsOut.push(formatImportSection("SAFETY_NOTES", dayPlan.safetyNotes));
    const activityBlocks = items.map((item) => formatImportActivity(item));
    sections.push(`${dayKey}\n\n${[...daySectionsOut, ...activityBlocks].join("\n").trim()}\n`);
  });
  return `${sections.join("\n").trim()}\n`;
}

function formatCurriculumLessonPlanImport(plan = {}) {
  return formatCurriculumLessonPlanImportV3(plan);
}

const CURRICULUM_LESSON_IMPORT_V2_TEMPLATE = `@LESSON_PLAN_START@
TITLE:
Legacy template retired — use CURRICULUM_LESSON_IMPORT_V3_TEMPLATE
@LESSON_PLAN_END@
`;

const CURRICULUM_LESSON_IMPORT_V3_TEMPLATE = `TITLE:
Ocean Explorers

AGE_GROUP:
Preschool

THEME:
Ocean Life

PLAN:
Pro

STATUS:
Published

LEARNING_DOMAINS:
Science, Language & Literacy, Fine Motor, Gross Motor

WEEKLY_OVERVIEW:
Children will explore ocean animals through hands-on play, movement, literacy, sensory experiences, and creative activities.

LEARNING_OBJECTIVES:
• Identify ocean animals
• Expand vocabulary
• Develop fine motor skills
• Encourage creativity and exploration

WEEKLY_MATERIALS:
Toy ocean animals, blue paper, paint, scissors, glue, sensory bin materials, books

VOCABULARY:
Ocean, Fish, Whale, Shark, Coral Reef

BOOKS:
Commotion in the Ocean
Way Down Deep in the Deep Blue Sea

SONGS:
Baby Shark
A Sailor Went to Sea

FAMILY_CONNECTION:
Encourage families to talk about ocean animals and visit local aquariums or read ocean-themed books together.

OBSERVATION_OPPORTUNITIES:
Observe language development, social interaction, fine motor skills, and participation during activities.

ADAPTATIONS:
Provide visual supports, adaptive tools, sensory alternatives, and additional teacher support as needed.

MONDAY

ACTIVITY_NAME:
Ocean Sensory Bin

CATEGORY:
Sensory Play

DESCRIPTION:
Children explore ocean animals in a sensory bin.

MATERIALS:
Water beads, toy ocean animals

DIRECTIONS:
1. Fill sensory bin.
2. Add ocean animals.
3. Encourage exploration.

TEACHER_ROLE:
Model vocabulary and encourage discussion.

LEARNING_GOALS:
Sensory exploration and vocabulary development.

ACTIVITY_NAME:
Ocean Animal Movement

CATEGORY:
Gross Motor & Movement

DESCRIPTION:
Children move like different ocean animals.

MATERIALS:
Open space

DIRECTIONS:
1. Name an animal.
2. Demonstrate movement.
3. Children copy.

TEACHER_ROLE:
Encourage participation.

LEARNING_GOALS:
Gross motor development.

TUESDAY

ACTIVITY_NAME:
Ocean Painting

CATEGORY:
Fine Motor

DESCRIPTION:
Children paint ocean scenes.

MATERIALS:
Paint, paper, brushes

DIRECTIONS:
1. Discuss ocean animals.
2. Paint ocean scenes.
3. Share artwork.

TEACHER_ROLE:
Support creativity.

LEARNING_GOALS:
Fine motor skills and self-expression.

WEDNESDAY

ACTIVITY_NAME:
Ocean Book Time

CATEGORY:
Literacy

DESCRIPTION:
Children listen to and talk about an ocean story.

MATERIALS:
Ocean book

DIRECTIONS:
1. Read the story.
2. Pause for predictions.
3. Retell with children.

TEACHER_ROLE:
Ask open-ended questions.

LEARNING_GOALS:
Listening comprehension and vocabulary.

THURSDAY

ACTIVITY_NAME:
Coral Reef Collage

CATEGORY:
Art

DESCRIPTION:
Children create a coral reef collage.

MATERIALS:
Paper, glue, tissue paper

DIRECTIONS:
1. Tear paper shapes.
2. Glue onto reef scene.
3. Name colors and textures.

TEACHER_ROLE:
Model tearing and gluing.

LEARNING_GOALS:
Creative expression and fine motor control.

FRIDAY

ACTIVITY_NAME:
Ocean Song Circle

CATEGORY:
Music & Movement

DESCRIPTION:
Children sing and move to ocean songs.

MATERIALS:
Song list, open space

DIRECTIONS:
1. Introduce the song.
2. Add movements.
3. Repeat together.

TEACHER_ROLE:
Lead singing and movement.

LEARNING_GOALS:
Rhythm, listening, and participation.
`;

const api = {
  PLAY_ACTIVITY_CATEGORIES: PLAY_ACTIVITY_CATEGORIES_V1,
  APPROVED_V2_ACTIVITY_CATEGORIES,
  CURRICULUM_LEARNING_DOMAINS,
  CURRICULUM_WEEKDAYS,
  CURRICULUM_LESSON_IMPORT_V2_TEMPLATE,
  CURRICULUM_LESSON_IMPORT_V3_TEMPLATE,
  detectImportFormat,
  isV3LabelOnlyFormat,
  normalizeActivityCategory,
  parseCurriculumImportAgeValue,
  curriculumAgeBucket,
  emptyCurriculumDailyPlans,
  emptyCurriculumDailyPlanDay,
  generateCurriculumItemId,
  parseCurriculumImportListLines,
  parseCurriculumLessonPlanImport,
  parseCurriculumLessonPlanImportV1,
  parseCurriculumLessonPlanImportV2,
  parseCurriculumLessonPlanImportV3,
  parseCurriculumLessonPlanBulkImport,
  formatCurriculumLessonPlanImport,
  formatCurriculumLessonPlanImportV3,
  formatImportActivity,
  curriculumSentinel,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.CurriculumLessonImportParser = api;
}
})();
