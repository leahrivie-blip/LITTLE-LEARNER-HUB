#!/usr/bin/env node
/**
 * Normalize Toddler Apple Unit raw pastes into v3 curriculum import files.
 *
 * Reads: scripts/curriculum-import-samples/toddler-apple-unit-raw.txt
 * Writes: scripts/curriculum-toddler-pro-imports/12–15-toddler-*-pro.txt
 *
 * Run: node scripts/build-toddler-apple-unit-imports.js
 */
const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const RAW_PATH = path.join(__dirname, "curriculum-import-samples/toddler-apple-unit-raw.txt");
const OUT_DIR = path.join(__dirname, "curriculum-toddler-pro-imports");

const PLANS = [
  {
    file: "12-toddler-amazing-apples-pro.txt",
    title: "Amazing Apples",
  },
  {
    file: "13-toddler-apple-orchard-adventure-pro.txt",
    title: "Apple Orchard Adventure",
  },
  {
    file: "14-toddler-apples-in-the-kitchen-pro.txt",
    title: "Apples in the Kitchen",
  },
  {
    file: "15-toddler-johnny-appleseed-apple-fun-pro.txt",
    title: "Johnny Appleseed & Apple Fun",
  },
];

const KNOWN_LABELS = new Set([
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
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "DAILY_THEME",
  "DAILY_OBJECTIVES",
  "DAILY_VOCABULARY",
  "DAILY_MATERIALS",
  "DAILY_LEARNING_DOMAINS",
  "CIRCLE_TIME",
  "OUTDOOR_PLAY",
  "ACTIVITY",
  "CATEGORY",
  "ACTIVITY_NAME",
  "OBJECTIVE",
  "DESCRIPTION",
  "MATERIALS",
  "SETUP",
  "DIRECTIONS",
  "TEACHER_ROLE",
  "LEARNING_GOALS",
  "SAFETY_NOTES",
  "DAILY_OBSERVATION_OPPORTUNITIES",
  "DAILY_OBSERVATIONS",
  "DAILY_ADAPTATIONS",
]);

const CATEGORY_MAP = {
  science: "STEM/Discovery",
  math: "STEM/Discovery",
  mathematics: "STEM/Discovery",
  "cooking experience": "Open-Ended Exploration",
  cooking: "Open-Ended Exploration",
  "health & nutrition": "Open-Ended Exploration",
  "health and nutrition": "Open-Ended Exploration",
  "social-emotional": "Open-Ended Exploration",
  "social-emotional learning": "Open-Ended Exploration",
  "language & literacy": "Literacy",
  "language and literacy": "Literacy",
  art: "Art",
  "sensory play": "Sensory Play",
  "music & movement": "Music & Movement",
  "music and movement": "Music & Movement",
  "dramatic play": "Dramatic Play",
  "fine motor": "Fine Motor",
  "gross motor": "Gross Motor",
  "stem/discovery": "STEM/Discovery",
  "open-ended exploration": "Open-Ended Exploration",
  literacy: "Literacy",
};

function normalizeLabelLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return "";
  if (/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  // Drop numbered ACTIVITY headers like "ACTIVITY 1"
  if (/^ACTIVITY\s+\d+$/i.test(trimmed)) return "";
  const bare = trimmed.match(/^([A-Z][A-Z0-9_/ ]+)$/);
  if (bare) {
    const key = bare[1].trim().toUpperCase().replace(/\s+/g, "_");
    if (KNOWN_LABELS.has(key) || KNOWN_LABELS.has(bare[1].trim().toUpperCase())) {
      return `${key}:`;
    }
  }
  const withColon = trimmed.match(/^([A-Za-z][A-Za-z0-9_/ ]*):\s*(.*)$/);
  if (withColon) {
    const key = withColon[1].trim().toUpperCase().replace(/\s+/g, "_");
    if (KNOWN_LABELS.has(key)) {
      const rest = withColon[2] || "";
      return rest ? `${key}:\n${rest}` : `${key}:`;
    }
  }
  return line.replace(/\s+$/g, "");
}

function mapCategoryValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return raw;
  const mapped = CATEGORY_MAP[raw.toLowerCase()];
  return mapped || raw;
}

function normalizePlanText(raw) {
  const lines = String(raw || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let previousLabel = "";
  for (const line of lines) {
    const normalized = normalizeLabelLine(line);
    if (normalized === "") {
      if (line.trim() === "") out.push("");
      continue;
    }
    if (normalized.includes("\n")) {
      const [label, ...rest] = normalized.split("\n");
      out.push(label);
      previousLabel = label.replace(/:$/, "");
      rest.forEach((part) => out.push(part));
      continue;
    }
    if (/^[A-Z0-9_]+:$/.test(normalized)) {
      previousLabel = normalized.slice(0, -1);
      out.push(normalized);
      continue;
    }
    if (previousLabel === "CATEGORY") {
      out.push(mapCategoryValue(normalized));
      previousLabel = "";
      continue;
    }
    if (previousLabel === "PLAN") {
      out.push("Pro");
      previousLabel = "";
      continue;
    }
    if (previousLabel === "STATUS") {
      out.push("published");
      previousLabel = "";
      continue;
    }
    if (previousLabel === "AGE_GROUP") {
      out.push("Toddler");
      previousLabel = "";
      continue;
    }
    if (previousLabel === "THEME") {
      out.push("Apples");
      previousLabel = "";
      continue;
    }
    out.push(normalized.replace(/^[-*•]\s*/, ""));
    if (!/^[A-Z0-9_]+:$/.test(normalized)) previousLabel = "";
  }

  let text = out.join("\n");
  text = text.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  text = text.replace(/^PLAN:\n.+$/m, "PLAN:\nPro");
  text = text.replace(/^STATUS:\n.+$/m, "STATUS:\npublished");
  text = text.replace(/^AGE_GROUP:\n.+$/m, "AGE_GROUP:\nToddler");
  text = text.replace(/^THEME:\n.+$/m, "THEME:\nApples");
  // Parser splits activities on ACTIVITY_NAME — category must follow the name
  text = text.replace(
    /^CATEGORY:\n([^\n]+)\n\nACTIVITY_NAME:\n([^\n]+)/gm,
    "ACTIVITY_NAME:\n$2\nCATEGORY:\n$1"
  );
  text = text.replace(/^DAILY_OBSERVATION_OPPORTUNITIES:$/gm, "DAILY_OBSERVATIONS:");
  text = relocateTrailingDayFields(text);
  text = text.replace(/([^\n])\n(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)\n/g, "$1\n\n$2\n");
  return text;
}

function relocateTrailingDayFields(text) {
  const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const lines = String(text || "").split("\n");
  const dayStarts = [];
  lines.forEach((line, idx) => {
    if (weekdays.includes(line.trim())) dayStarts.push(idx);
  });
  if (!dayStarts.length) return text;

  const before = lines.slice(0, dayStarts[0]).join("\n");
  const dayBlocks = dayStarts.map((start, i) => {
    const end = i + 1 < dayStarts.length ? dayStarts[i + 1] : lines.length;
    return lines.slice(start, end);
  });

  const rebuilt = dayBlocks.map((blockLines) => {
    const firstActivityIdx = blockLines.findIndex((line) => line.trim() === "ACTIVITY_NAME:");
    if (firstActivityIdx < 0) return blockLines.join("\n");

    const preamble = blockLines.slice(0, firstActivityIdx);
    const activityText = blockLines.slice(firstActivityIdx).join("\n");

    const trailing = {
      DAILY_OBSERVATIONS: "",
      DAILY_ADAPTATIONS: "",
      SAFETY_NOTES: "",
    };
    let cleaned = activityText;
    const dailyObsIdx = cleaned.lastIndexOf("\nDAILY_OBSERVATIONS:\n");
    if (dailyObsIdx >= 0) {
      const trailingText = cleaned.slice(dailyObsIdx + 1);
      cleaned = cleaned.slice(0, dailyObsIdx).trimEnd();
      const fieldBlocks = trailingText.split(/(?=^(?:DAILY_OBSERVATIONS|DAILY_ADAPTATIONS|SAFETY_NOTES):)/m);
      fieldBlocks.forEach((block) => {
        const m = block.match(/^(DAILY_OBSERVATIONS|DAILY_ADAPTATIONS|SAFETY_NOTES):\n([\s\S]*)$/);
        if (!m) return;
        trailing[m[1]] = m[2].trim();
      });
    }

    const insert = [];
    if (trailing.DAILY_OBSERVATIONS) {
      insert.push("DAILY_OBSERVATIONS:", trailing.DAILY_OBSERVATIONS, "");
    }
    if (trailing.DAILY_ADAPTATIONS) {
      insert.push("DAILY_ADAPTATIONS:", trailing.DAILY_ADAPTATIONS, "");
    }
    if (trailing.SAFETY_NOTES) {
      insert.push("SAFETY_NOTES:", trailing.SAFETY_NOTES, "");
    }

    return [...preamble, ...insert, ...cleaned.split("\n")].join("\n").replace(/\n{3,}/g, "\n\n");
  });

  return [before, ...rebuilt].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function splitRawPlans(raw) {
  return String(raw || "")
    .split(/\n\s*Next one\s*\n/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function extractTitle(text) {
  const match = String(text).match(/^TITLE:\s*\n(.+)$/m) || String(text).match(/^TITLE\s*\n(.+)$/m);
  return match ? match[1].trim() : "";
}

function main() {
  if (!fs.existsSync(RAW_PATH)) {
    console.error(`Missing raw paste: ${RAW_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(RAW_PATH, "utf8");
  const chunks = splitRawPlans(raw);
  if (chunks.length !== PLANS.length) {
    console.error(`Expected ${PLANS.length} plans separated by "Next one", found ${chunks.length}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = [];

  chunks.forEach((chunk, index) => {
    const meta = PLANS[index];
    const normalized = normalizePlanText(chunk);
    const title = extractTitle(normalized);
    if (title && title !== meta.title) {
      console.warn(`Warning: chunk ${index + 1} title "${title}" != expected "${meta.title}"`);
    }
    const parsed = parseCurriculumLessonPlanImport(normalized);
    if (!parsed.ok) {
      console.error(`Parse failed for ${meta.file}:`);
      (parsed.errors || []).slice(0, 30).forEach((err) => console.error(`  - ${err}`));
      process.exit(1);
    }
    const outPath = path.join(OUT_DIR, meta.file);
    fs.writeFileSync(outPath, normalized, "utf8");
    const activityCount = parsed.parseReport?.activityCount
      || Object.values(parsed.data?.dailyPlans || {}).reduce((sum, day) => sum + (day.items || []).length, 0);
    report.push({
      file: meta.file,
      title: parsed.data.title,
      activityCount,
      plan: parsed.data.plan,
      status: parsed.data.status,
      warnings: parsed.warnings || [],
    });
    console.log(`Wrote ${meta.file} (${parsed.data.title}, ${activityCount} activities)`);
    if (parsed.warnings?.length) {
      parsed.warnings.slice(0, 8).forEach((w) => console.log(`  warn: ${w}`));
    }
  });

  const reportPath = path.join(__dirname, "data/toddler-apple-unit-import-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), plans: report }, null, 2));
  console.log(`\nSuccess: ${report.length} Toddler Apple Unit import files ready.`);
}

main();
