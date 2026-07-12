/**
 * Parse preschool Pro lesson plans from raw v3-style paste text.
 */
const fs = require("fs");
const path = require("path");

const PLAN_FIELDS = new Set([
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

const DAY_KEYS = {
  MONDAY: "monday",
  TUESDAY: "tuesday",
  WEDNESDAY: "wednesday",
  THURSDAY: "thursday",
  FRIDAY: "friday",
};

const ACTIVITY_FIELDS = new Set([
  "ACTIVITY_NAME",
  "CATEGORY",
  "OBJECTIVE",
  "DESCRIPTION",
  "MATERIALS",
  "SETUP",
  "DIRECTIONS",
  "TEACHER_ROLE",
  "LEARNING_GOALS",
  "OBSERVATION_OPPORTUNITIES",
]);

const OUTPUT_ORDER = [
  "Fairy Tale Adventures",
  "Dinosaur Discovery",
  "Space Adventure",
  "STEM Explorers",
  "Transportation Adventures",
  "Healthy Habits",
  "Around the World",
  "Ocean Explorers",
  "Seasons of the Year",
  "Kindergarten Readiness",
];

function stripBullet(line) {
  return String(line || "").trim().replace(/^[-*•\t]+\s*/, "");
}

function parseListBlock(lines) {
  return lines
    .map(stripBullet)
    .filter(Boolean);
}

function parseFieldBlock(lines) {
  const fields = {};
  let current = null;
  let bucket = [];

  const flush = () => {
    if (!current) return;
    fields[current] = bucket.slice();
    bucket = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const match = line.match(/^([A-Z][A-Z_ ]+[A-Z]):(?:\s*(.*))?$/);
    if (match && (PLAN_FIELDS.has(match[1]) || ACTIVITY_FIELDS.has(match[1]) || DAY_KEYS[match[1]])) {
      flush();
      current = match[1];
      if (match[2]) bucket.push(match[2]);
      continue;
    }
    if (current) bucket.push(line);
  }
  flush();
  return fields;
}

function parseActivity(blockLines) {
  const fields = parseFieldBlock(blockLines);
  const objective = (fields.OBJECTIVE || []).join("\n").trim();
  const directions = parseListBlock(fields.DIRECTIONS || []);
  return {
    name: (fields.ACTIVITY_NAME || []).join("\n").trim(),
    category: (fields.CATEGORY || []).join("\n").trim(),
    objective,
    description: (fields.DESCRIPTION || []).join("\n").trim() || objective,
    materials: (fields.MATERIALS || []).join("\n").trim(),
    setup: (fields.SETUP || []).join("\n").trim(),
    teacherRole: (fields.TEACHER_ROLE || []).join("\n").trim(),
    directions,
    goals: [objective].filter(Boolean),
    observations: ["Observe participation and engagement."],
  };
}

function parsePlanBody(bodyLines) {
  const fields = parseFieldBlock(bodyLines);
  const days = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
  };

  let dayKey = null;
  let activityLines = [];

  const flushActivity = () => {
    if (!dayKey || !activityLines.length) return;
    const hasName = activityLines.some((l) => /^ACTIVITY_NAME:/.test(l.trim()));
    if (hasName) {
      days[dayKey].push(parseActivity(activityLines));
    }
    activityLines = [];
  };

  for (const raw of bodyLines) {
    const line = raw.trimEnd();
    const dayMatch = line.match(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY):/);
    if (dayMatch) {
      flushActivity();
      dayKey = DAY_KEYS[dayMatch[1]];
      continue;
    }
    if (/^ACTIVITY_NAME:/.test(line.trim())) {
      flushActivity();
      activityLines.push(line);
      continue;
    }
    if (dayKey) activityLines.push(line);
  }
  flushActivity();

  return {
    title: (fields.TITLE || []).join("\n").trim(),
    theme: (fields.THEME || []).join("\n").trim(),
    plan: "Pro",
    status: "published",
    ageGroup: "Preschool 3-5 Years",
    learningDomains: parseListBlock(fields.LEARNING_DOMAINS || []),
    weeklyOverview: (fields.WEEKLY_OVERVIEW || []).join("\n").trim(),
    objectives: parseListBlock(fields.LEARNING_OBJECTIVES || []),
    materials: parseListBlock(fields.WEEKLY_MATERIALS || []),
    vocabulary: parseListBlock(fields.VOCABULARY || []),
    books: parseListBlock(fields.BOOKS || []),
    songs: parseListBlock(fields.SONGS || []),
    familyConnection: (fields.FAMILY_CONNECTION || []).join("\n").trim(),
    observationOpportunities: (fields.OBSERVATION_OPPORTUNITIES || []).join("\n").trim(),
    adaptations: (fields.ADAPTATIONS || []).join("\n").trim(),
    days,
  };
}

function splitPlans(text) {
  const lines = String(text || "").split(/\r?\n/);
  const chunks = [];
  let current = null;

  for (const line of lines) {
    if (/^TITLE:/.test(line.trim())) {
      if (current) chunks.push(current);
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) chunks.push(current);
  return chunks.map(parsePlanBody).filter((p) => p.title);
}

function selectPlans(plans) {
  const byTitle = new Map();
  plans.forEach((plan) => {
    const list = byTitle.get(plan.title) || [];
    list.push(plan);
    byTitle.set(plan.title, list);
  });

  const oceanPlans = byTitle.get("Ocean Explorers") || [];
  const fullOcean = oceanPlans.find((p) => (p.days.wednesday || []).length > 0) || oceanPlans[oceanPlans.length - 1];

  const selected = [];
  OUTPUT_ORDER.forEach((title) => {
    if (title === "Ocean Explorers") {
      if (fullOcean) selected.push(fullOcean);
      return;
    }
    const matches = byTitle.get(title) || [];
    if (matches.length) selected.push(matches[0]);
  });
  return selected;
}

function parsePreschoolProRaw(text) {
  return selectPlans(splitPlans(text));
}

function readPreschoolProRawPaste(filePath) {
  const resolved = filePath || path.join(__dirname, "../data/preschool-pro-raw-paste.txt");
  return fs.readFileSync(resolved, "utf8");
}

module.exports = {
  OUTPUT_ORDER,
  parsePreschoolProRaw,
  readPreschoolProRawPaste,
  selectPlans,
  splitPlans,
};
