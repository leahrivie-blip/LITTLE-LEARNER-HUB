#!/usr/bin/env node
/**
 * Normalize Infant/Toddler Pro paste files into Gold Standard importer format.
 * Does not invent activities — only remaps fields/categories and reshapes syntax.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGET_DIRS = [
  "scripts/curriculum-infant-pro-batch2-imports",
  "scripts/curriculum-toddler-pro-batch2-imports",
  "scripts/curriculum-toddler-pro-batch3-imports",
];

const CATEGORY_MAP = {
  engineering: "STEM/Discovery",
  science: "STEM/Discovery",
  math: "STEM/Discovery",
  "creative arts": "Art",
  "creative reflection": "Art",
  "cooperative play": "Dramatic Play",
  "social emotional": "Open-Ended Exploration",
  "social-emotional": "Open-Ended Exploration",
  "social-emotional development": "Open-Ended Exploration",
  "language & literacy": "Literacy",
  "language and literacy": "Literacy",
  language: "Literacy",
  "cognitive development": "Open-Ended Exploration",
  "cognitive play": "Open-Ended Exploration",
  "listening game": "Music & Movement",
  "practical life": "Open-Ended Exploration",
  stem: "STEM/Discovery",
};

const ALLOWED = new Set([
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
]);

function mapCategory(raw) {
  const text = String(raw || "").trim();
  if (!text) return "Open-Ended Exploration";
  if (ALLOWED.has(text)) return text;
  const mapped = CATEGORY_MAP[text.toLowerCase()];
  if (mapped) return mapped;
  const lower = text.toLowerCase();
  if (/(stem|engineer|science|math|count|sort)/.test(lower)) return "STEM/Discovery";
  if (/(art|paint|draw|stamp)/.test(lower)) return "Art";
  if (/(music|song|dance|listen)/.test(lower)) return "Music & Movement";
  if (/sensory/.test(lower)) return "Sensory Play";
  if (/liter/.test(lower)) return "Literacy";
  if (/(dramatic|pretend|coop)/.test(lower)) return "Dramatic Play";
  if (/outdoor/.test(lower)) return "Outdoor Play";
  if (/fine/.test(lower)) return "Fine Motor";
  if (/(gross|motor|movement)/.test(lower)) return "Gross Motor";
  if (/circle/.test(lower)) return "Circle Time";
  return "Open-Ended Exploration";
}

function expandDirections(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (/\n\s*\d+[\).\]]/.test(raw)) return raw;
  const parts = raw.match(/\d+[\).\]]\s*[^]+?(?=(?:\s*\d+[\).\]])|$)/g);
  if (parts && parts.length >= 3) {
    return parts.map((part) => {
      const m = part.match(/^(\d+)[\).\]]\s*([\s\S]*)$/);
      if (!m) return part.trim();
      return `${m[1]}. ${m[2].trim()}`;
    }).join("\n");
  }
  const sentences = raw.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 3) {
    return sentences.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join("\n");
  }
  return raw;
}

function renderActivityBlock(fields) {
  const category = mapCategory(fields.CATEGORY || fields.category || "");
  const name = fields.NAME || fields.ACTIVITY_NAME || fields.name || "Activity";
  return [
    "ACTIVITY_NAME:",
    name,
    "CATEGORY:",
    category,
    "OBJECTIVE:",
    fields.OBJECTIVE || fields.objective || "",
    "DESCRIPTION:",
    fields.DESCRIPTION || fields.description || "",
    "MATERIALS:",
    fields.MATERIALS || fields.materials || "",
    "SETUP:",
    fields.SETUP || fields.setup || "",
    "DIRECTIONS:",
    expandDirections(fields.DIRECTIONS || fields.directions || ""),
    "TEACHER_ROLE:",
    fields.TEACHER_ROLE || fields.teacherRole || "",
    "LEARNING_GOALS:",
    fields.LEARNING_GOALS || fields.learningGoals || "",
    "OBSERVATION_OPPORTUNITIES:",
    fields.OBSERVATION_OPPORTUNITIES || fields.observationOpportunities || "",
    "ADAPTATIONS:",
    fields.ADAPTATIONS || fields.adaptations || "",
    "SAFETY_NOTES:",
    fields.SAFETY_NOTES || fields.safetyNotes || "",
    "",
  ].join("\n");
}

function normalizeWeeklyAndDailyLabels(text) {
  return text
    .replace(/^CIRCLE_TIME_IDEAS\s*:/gim, "CIRCLE_TIME:")
    .replace(/^DAILY_OBSERVATION_OPPORTUNITIES\s*:/gim, "DAILY_OBSERVATIONS:")
    .replace(/^PLAN:\s*PRO\s*$/gim, "PLAN: Pro")
    .replace(/^PLAN:\s*FREE\s*$/gim, "PLAN: Free")
    .replace(/^STATUS:\s*Published\s*$/gim, "STATUS: published")
    .replace(/^STATUS:\s*Draft\s*$/gim, "STATUS: draft");
}

function convertPrefixedActivityDays(text) {
  if (!/ACTIVITY_\d+_NAME\s*:/i.test(text)) return text;

  const dayRe = /(?:^|\n)(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)\b[^\n]*/gi;
  const matches = [...text.matchAll(dayRe)];
  if (!matches.length) return text;

  const prefix = text.slice(0, matches[0].index);
  const dayChunks = matches.map((match, index) => {
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return text.slice(start, end).replace(/^\n/, "");
  });

  const convertedDays = dayChunks.map((chunk) => {
    const lines = chunk.split("\n");
    const dayLine = lines[0] || "";
    const rest = lines.slice(1).join("\n");

    const byNum = new Map();
    const activityLineRe = /^ACTIVITY_(\d+)_([A-Z_]+)\s*:\s*(.*)$/gim;
    let match;
    while ((match = activityLineRe.exec(rest))) {
      const num = match[1];
      const field = match[2].toUpperCase();
      const value = match[3].trim();
      if (!byNum.has(num)) byNum.set(num, {});
      byNum.get(num)[field] = value;
    }

    const dayFields = rest
      .replace(/^ACTIVITY_\d+_[A-Z_]+\s*:.*$/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const activities = [...byNum.keys()]
      .sort((a, b) => Number(a) - Number(b))
      .map((num) => renderActivityBlock(byNum.get(num)))
      .join("\n");

    // Normalize day header to bare weekday word + newline fields
    const dayName = dayLine.match(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)/i)?.[1].toUpperCase() || "MONDAY";
    return `${dayName}\n${dayFields}\n\n${activities}`.trim() + "\n";
  });

  return `${prefix.trim()}\n\n${convertedDays.join("\n")}`.trim() + "\n";
}

function convertWrappedActivities(text) {
  // ACTIVITY_1: / CATEGORY: / ACTIVITY_NAME: blocks
  if (!/^ACTIVITY_\d+\s*:/im.test(text) && !/^CATEGORY\s*:/im.test(text)) return text;

  // Remove wrapper-only lines
  let out = text.replace(/^ACTIVITY_\d+\s*:\s*$/gim, "");

  // Rebuild each day so ACTIVITY_NAME always precedes CATEGORY and directions expand.
  const dayRe = /(?:^|\n)(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)\b[^\n]*/gi;
  const matches = [...out.matchAll(dayRe)];
  if (!matches.length) return out;

  const prefix = out.slice(0, matches[0].index);
  const dayChunks = matches.map((match, index) => {
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const end = index + 1 < matches.length ? matches[index + 1].index : out.length;
    return out.slice(start, end).replace(/^\n/, "");
  });

  const converted = dayChunks.map((chunk) => {
    const lines = chunk.split("\n");
    const dayName = (lines[0].match(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)/i)?.[1] || "MONDAY").toUpperCase();
    const body = lines.slice(1).join("\n");

    // Split activities on ACTIVITY_NAME or CATEGORY that begins an activity cluster
    const parts = body.split(/(?=^(?:CATEGORY|ACTIVITY_NAME)\s*:)/im);
    const dayFields = [];
    const activities = [];
    let pending = {};

    const flush = () => {
      if (pending.NAME || pending.ACTIVITY_NAME || pending.CATEGORY) {
        activities.push(renderActivityBlock(pending));
      }
      pending = {};
    };

    for (const part of parts) {
      if (!part.trim()) continue;
      if (!/^(?:CATEGORY|ACTIVITY_NAME)\s*:/im.test(part.trim())) {
        dayFields.push(part.trim());
        continue;
      }
      const fields = {};
      const fieldRe = /^(CATEGORY|ACTIVITY_NAME|OBJECTIVE|DESCRIPTION|MATERIALS|SETUP|DIRECTIONS|TEACHER_ROLE|LEARNING_GOALS|OBSERVATION_OPPORTUNITIES|ADAPTATIONS|SAFETY_NOTES)\s*:\s*([\s\S]*?)(?=^(?:CATEGORY|ACTIVITY_NAME|OBJECTIVE|DESCRIPTION|MATERIALS|SETUP|DIRECTIONS|TEACHER_ROLE|LEARNING_GOALS|OBSERVATION_OPPORTUNITIES|ADAPTATIONS|SAFETY_NOTES)\s*:|$)/gim;
      let m;
      while ((m = fieldRe.exec(part))) {
        const key = m[1].toUpperCase();
        fields[key === "ACTIVITY_NAME" ? "NAME" : key] = m[2].trim();
      }
      if (Object.keys(fields).length) {
        // If we already have a pending activity with a name and this part starts a new one, flush.
        if ((pending.NAME || pending.CATEGORY) && (fields.NAME || fields.CATEGORY) && (pending.NAME && fields.NAME || pending.CATEGORY && fields.CATEGORY && pending.NAME)) {
          flush();
        }
        Object.assign(pending, fields);
        // Heuristic: if we now have NAME + CATEGORY + OBJECTIVE, keep collecting until next activity starts
      }
    }
    flush();

    // Simpler path: if field parser above was flaky, parse sequentially by ACTIVITY_NAME occurrences
    if (!activities.length) {
      const sequential = [];
      const actRe = /(?:^CATEGORY\s*:\s*([^\n]+)\s*\n)?^ACTIVITY_NAME\s*:\s*([^\n]+)([\s\S]*?)(?=(?:^CATEGORY\s*:|^ACTIVITY_NAME\s*:)|$)/gim;
      // Also support CATEGORY after ACTIVITY_NAME
      const blocks = body.split(/(?=^ACTIVITY_NAME\s*:|^CATEGORY\s*:)/im).filter((p) => /ACTIVITY_NAME\s*:|CATEGORY\s*:/i.test(p));
      let current = {};
      for (const block of blocks) {
        const catOnly = block.match(/^CATEGORY\s*:\s*([^\n]+)\s*$/im) && !/ACTIVITY_NAME\s*:/i.test(block);
        if (catOnly) {
          if (current.NAME) sequential.push(renderActivityBlock(current));
          current = { CATEGORY: block.match(/^CATEGORY\s*:\s*([^\n]+)/im)[1].trim() };
          continue;
        }
        const name = block.match(/^ACTIVITY_NAME\s*:\s*([^\n]+)/im)?.[1]?.trim()
          || block.match(/ACTIVITY_NAME\s*:\s*([^\n]+)/im)?.[1]?.trim();
        const category = block.match(/^CATEGORY\s*:\s*([^\n]+)/im)?.[1]?.trim()
          || block.match(/CATEGORY\s*:\s*([^\n]+)/im)?.[1]?.trim()
          || current.CATEGORY
          || "";
        const grab = (field) => {
          const re = new RegExp(`^${field}\\s*:\\s*([\\s\\S]*?)(?=^[A-Z_]+\\s*:|$)`, "im");
          return block.match(re)?.[1]?.trim() || "";
        };
        if (name) {
          if (current.NAME) sequential.push(renderActivityBlock(current));
          current = {
            NAME: name,
            CATEGORY: category,
            OBJECTIVE: grab("OBJECTIVE"),
            DESCRIPTION: grab("DESCRIPTION"),
            MATERIALS: grab("MATERIALS"),
            SETUP: grab("SETUP"),
            DIRECTIONS: grab("DIRECTIONS"),
            TEACHER_ROLE: grab("TEACHER_ROLE"),
            LEARNING_GOALS: grab("LEARNING_GOALS"),
            OBSERVATION_OPPORTUNITIES: grab("OBSERVATION_OPPORTUNITIES"),
            ADAPTATIONS: grab("ADAPTATIONS"),
            SAFETY_NOTES: grab("SAFETY_NOTES"),
          };
        } else if (category) {
          current.CATEGORY = category;
        }
      }
      if (current.NAME) sequential.push(renderActivityBlock(current));
      if (sequential.length) {
        const nonActivity = body
          .split(/(?=^ACTIVITY_NAME\s*:|^CATEGORY\s*:)/im)
          .filter((p) => p.trim() && !/ACTIVITY_NAME\s*:|CATEGORY\s*:/i.test(p.trim()))
          .join("\n")
          .trim();
        return `${dayName}\n${nonActivity}\n\n${sequential.join("\n")}`.trim() + "\n";
      }
    }

    return `${dayName}\n${dayFields.join("\n").trim()}\n\n${activities.join("\n")}`.trim() + "\n";
  });

  return `${prefix.trim()}\n\n${converted.join("\n")}`.trim() + "\n";
}

function ensureMultilineTopFields(text) {
  const fields = [
    "TITLE", "AGE_GROUP", "THEME", "PLAN", "STATUS", "LEARNING_DOMAINS",
    "WEEKLY_OVERVIEW", "LEARNING_OBJECTIVES", "WEEKLY_MATERIALS", "VOCABULARY",
    "BOOKS", "SONGS", "FAMILY_CONNECTION", "OBSERVATION_OPPORTUNITIES", "ADAPTATIONS",
    "DAILY_THEME", "DAILY_OBJECTIVES", "DAILY_VOCABULARY", "DAILY_MATERIALS",
    "DAILY_LEARNING_DOMAINS", "CIRCLE_TIME", "OUTDOOR_PLAY", "DAILY_OBSERVATIONS",
    "DAILY_ADAPTATIONS", "SAFETY_NOTES",
  ];
  let out = text;
  for (const field of fields) {
    out = out.replace(new RegExp(`^(${field})\\s*:\\s*(\\S[^\\n]*)$`, "gim"), (_, f, value) => `${f}:\n${value}`);
  }
  return out;
}

function expandAllDirectionBlocks(text) {
  return text.replace(
    /^DIRECTIONS\s*:\s*\n?([^\n]*(?:\n(?![A-Z_]+\\s*:)[^\n]*)*)/gim,
    (full, body) => {
      const expanded = expandDirections(String(body || "").trim());
      return `DIRECTIONS:\n${expanded}`;
    },
  );
}

function mapStandaloneCategories(text) {
  return text.replace(/^CATEGORY\s*:\s*\n?([^\n]+)$/gim, (_, cat) => `CATEGORY:\n${mapCategory(cat.trim())}`);
}

function normalizeFile(raw) {
  let text = raw.replace(/\r\n/g, "\n");
  if (/scaffold|to be expanded|subsequent commits/i.test(text)) {
    return { text, skipped: true, reason: "scaffold stub" };
  }
  text = normalizeWeeklyAndDailyLabels(text);
  if (/ACTIVITY_\d+_NAME\s*:/i.test(text)) {
    text = convertPrefixedActivityDays(text);
  } else if (/^ACTIVITY_\d+\s*:/im.test(text) || (/^CATEGORY\s*:/im.test(text) && /^ACTIVITY_NAME\s*:/im.test(text))) {
    text = convertWrappedActivities(text);
  } else {
    text = mapStandaloneCategories(text);
  }
  text = ensureMultilineTopFields(text);
  text = expandAllDirectionBlocks(text);
  text = mapStandaloneCategories(text);
  text = text.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return { text, skipped: false };
}

function main() {
  let changed = 0;
  let skipped = 0;
  for (const dirRel of TARGET_DIRS) {
    const dir = path.join(ROOT, dirRel);
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".txt")).sort()) {
      const file = path.join(dir, name);
      const raw = fs.readFileSync(file, "utf8");
      const result = normalizeFile(raw);
      if (result.skipped) {
        skipped += 1;
        console.log(`SKIP  ${path.relative(ROOT, file)} (${result.reason})`);
        continue;
      }
      if (result.text !== raw.replace(/\r\n/g, "\n")) {
        fs.writeFileSync(file, result.text);
        changed += 1;
        console.log(`FIXED ${path.relative(ROOT, file)}`);
      } else {
        console.log(`SAME  ${path.relative(ROOT, file)}`);
      }
    }
  }
  console.log(`\nNormalized ${changed} files · skipped ${skipped} stubs`);
}

main();
