#!/usr/bin/env node
/**
 * Owner-approved replacement:
 *   cur-lp-infant-tummy-time-adventures
 *   "Tummy Time Adventures" → "Tiny Artist Studio"
 *
 * Preserves: lesson id, Free/Pro plan, publication status, resourceIds / Linked Resources.
 * Does NOT create, link, unlink, publish, or modify printables/resources.
 *
 * Usage:
 *   node scripts/replace-tummy-time-with-tiny-artist-studio.js --validate-only
 *   node scripts/replace-tummy-time-with-tiny-artist-studio.js --images-only
 *   node scripts/replace-tummy-time-with-tiny-artist-studio.js --store=/path/to/launch-store.json
 *   SITE_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_ACCESS_CODE=… \
 *     node scripts/replace-tummy-time-with-tiny-artist-studio.js --remote
 *   SITE_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_ACCESS_CODE=… \
 *     node scripts/replace-tummy-time-with-tiny-artist-studio.js --images-only --remote
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const LESSON_ID = "cur-lp-infant-tummy-time-adventures";
const OLD_TITLE = "Tummy Time Adventures";
const NEW_TITLE = "Tiny Artist Studio";
const PASTE_PATH = path.join(
  ROOT,
  "scripts/curriculum-lesson-replacements/tiny-artist-studio.structure-paste.txt",
);
const CORE_IMPORT_PATH = path.join(
  ROOT,
  "scripts/curriculum-infant-core-imports/infant-tummy-time-adventures.txt",
);
const SAMPLE_IMPORT_PATH = path.join(
  ROOT,
  "scripts/curriculum-import-samples/infant-batch-jul2026/03-tummy-time-adventures.txt",
);
const REPORT_PATH = path.join("/opt/cursor/artifacts/tiny-artist-studio/replacement-report.json");
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_THEMES = {
  monday: "Tiny Hands",
  tuesday: "Tiny Toes",
  wednesday: "Color Magic",
  thursday: "Baby Makes a Mark",
  friday: "My First Masterpiece",
};

const IMAGE_DIR_REL = "images/teaching-kit-drafts/tiny-artist-studio";
const IMAGE_URL_BASE = `/${IMAGE_DIR_REL}`;
const COVER_FILENAME = "tiny-artist-studio-cover.png";
const COVER_IMAGE_URL = `${IMAGE_URL_BASE}/${COVER_FILENAME}`;

/** @type {Readonly<Record<string, string>>} */
const ACTIVITY_EXAMPLE_IMAGE_FILES = Object.freeze({
  "Love Grows Here Handprint Flower": "love-grows-here.png",
  "You Make My Heart Flutter Footprint Butterfly": "you-make-my-heart-flutter.png",
  "Watch Me Grow Footprint Flower": "watch-me-grow.png",
  "Our Little Busy Bee Footprint": "our-little-busy-bee.png",
  "Our Little Sunshine Handprint Art": "our-little-sunshine.png",
  "Little Feet Leave Big Impressions": "little-feet-leave-big-impressions.png",
  "Baby Artist Photo and Artwork": "my-first-masterpiece.png",
});

require(path.join(ROOT, "scripts/curriculum-week-kit-paste.js"));
require(path.join(ROOT, "scripts/teaching-kit-paste-import.js"));
require(path.join(ROOT, "scripts/curriculum-lesson-import-parser.js"));
const {
  parseFullLessonStructurePaste,
  buildCanonicalLessonPlan,
} = require(path.join(ROOT, "scripts/curriculum-lesson-structure-paste.js"));

function text(value) {
  return String(value == null ? "" : value).trim();
}

function sortedResourceIds(resources) {
  return (Array.isArray(resources) ? resources : [])
    .map((item) => text(item && item.id))
    .filter(Boolean)
    .sort();
}

function assertUnchangedResourceCatalog(beforeResources, afterResources) {
  if (JSON.stringify(sortedResourceIds(beforeResources)) !== JSON.stringify(sortedResourceIds(afterResources))) {
    throw new Error("Resource IDs changed unexpectedly");
  }
}

function argValue(flag) {
  const hit = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : "";
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function requestJson(baseUrl, method, route, body, headers = {}) {
  const url = new URL(route, baseUrl);
  const lib = url.protocol === "https:" ? https : http;
  const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": payload.length }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json, text: raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function adminLogin(baseUrl) {
  const email = text(process.env.ADMIN_EMAIL);
  const password = text(process.env.ADMIN_PASSWORD);
  const code = text(process.env.ADMIN_ACCESS_CODE);
  if (!text(baseUrl) || !email || !password || !code) {
    throw new Error("Remote apply requires SITE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE");
  }
  const login = await requestJson(baseUrl, "POST", "/api/admin/login", {
    email,
    password,
    code,
  });
  const token = login.json?.token || login.json?.adminToken || "";
  if (login.status !== 200 || !token) {
    throw new Error(`Admin login failed: ${login.status} ${String(login.text || "").slice(0, 200)}`);
  }
  return token;
}

function adminAuthHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function extractActivityMultilineFields(pasteText) {
  const source = String(pasteText || "").replace(/\r\n/g, "\n");
  const chunks = source.split(/(?=^Activity name:\s*)/m).filter((chunk) => /^Activity name:/m.test(chunk));
  const byTitle = new Map();
  const stop = [
    "Activity name",
    "Category/developmental domain",
    "Recommended age",
    "Estimated duration",
    "Activity objective",
    "What children will do",
    "Materials",
    "Teacher preparation",
    "Setup",
    "Step-by-step directions",
    "Suggested questions to ask",
    "Learning and observation focus",
    "Safety and supervision",
    "Cleanup",
    "Teacher tips",
    "Vocabulary",
    "Image requirement",
    "Setup example brief",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Books",
    "Songs",
    "Printable ideas",
  ].map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const fieldNames = [
    "materials",
    "steps",
    "teacherLanguage",
    "observationOpportunities",
    "vocabulary",
    "safetyNotes",
    "cleanupTips",
    "description",
    "setup",
    "preparation",
    "imageBriefSetup",
    "objective",
  ];
  const headingByField = {
    materials: "Materials",
    steps: "Step-by-step directions",
    teacherLanguage: "Suggested questions to ask",
    observationOpportunities: "Learning and observation focus",
    vocabulary: "Vocabulary",
    safetyNotes: "Safety and supervision",
    cleanupTips: "Cleanup",
    description: "What children will do",
    setup: "Setup",
    preparation: "Teacher preparation",
    imageBriefSetup: "Setup example brief",
    objective: "Activity objective",
  };
  chunks.forEach((chunk) => {
    const titleMatch = chunk.match(/^Activity name:\s*(.+)$/m);
    const title = text(titleMatch && titleMatch[1]);
    if (!title) return;
    const fields = {};
    fieldNames.forEach((key) => {
      const heading = headingByField[key];
      const re = new RegExp(
        `^${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:\\s*\\n?([\\s\\S]*?)(?=\\n(?:${stop}):|(?![\\s\\S]))`,
        "im",
      );
      const hit = chunk.match(re);
      if (hit) fields[key] = String(hit[1] || "").replace(/^\n+|\n+$/g, "");
    });
    const tips = chunk.match(
      new RegExp(`^Teacher tips:\\s*\\n?([\\s\\S]*?)(?=\\n(?:${stop}):|(?![\\s\\S]))`, "im"),
    );
    if (tips) {
      fields.teacherTips = String(tips[1] || "")
        .split(/\n+/)
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean);
    }
    byTitle.set(title.toLowerCase(), fields);
  });
  return byTitle;
}

function restoreMultilineFields(parsed, pasteText) {
  const byTitle = extractActivityMultilineFields(pasteText);
  WEEKDAYS.forEach((day) => {
    (parsed.dailyPlans?.[day]?.items || []).forEach((item) => {
      const extra = byTitle.get(text(item.title).toLowerCase());
      if (!extra) return;
      Object.keys(extra).forEach((key) => {
        if (extra[key] == null || extra[key] === "") return;
        item[key] = extra[key];
      });
    });
  });
  return parsed;
}

function loadPaste() {
  const pasteText = fs.readFileSync(PASTE_PATH, "utf8");
  let parsed = parseFullLessonStructurePaste(pasteText, {
    generateItemId: (() => {
      let n = 0;
      return () => {
        n += 1;
        return `item-infant-tiny-artist-studio-${String(n).padStart(2, "0")}`;
      };
    })(),
  });
  parsed = restoreMultilineFields(parsed, pasteText);
  parsed = applyApprovedCategories(parsed);
  return { pasteText, parsed };
}

function activityTitlesByDay(dailyPlans) {
  const out = {};
  WEEKDAYS.forEach((day) => {
    out[day] = (dailyPlans?.[day]?.items || []).map((item) => text(item.title)).filter(Boolean);
  });
  return out;
}

function imageDiskPath(filename) {
  return path.join(ROOT, IMAGE_DIR_REL, filename);
}

function imagePublicUrl(filename) {
  return `${IMAGE_URL_BASE}/${filename}`;
}

function verifyTinyArtistStudioImageFiles() {
  const required = [COVER_FILENAME, ...Object.values(ACTIVITY_EXAMPLE_IMAGE_FILES)];
  const unique = [...new Set(required)];
  const missing = unique.filter((filename) => !fs.existsSync(imageDiskPath(filename)));
  if (missing.length) {
    throw new Error(`Missing Tiny Artist Studio image file(s): ${missing.join(", ")}`);
  }
  const activityFiles = Object.values(ACTIVITY_EXAMPLE_IMAGE_FILES);
  if (activityFiles.includes(COVER_FILENAME)) {
    throw new Error("Cover file must not be assigned as an activity example image");
  }
  return unique;
}

/**
 * @param {object | null | undefined} plan
 * @returns {Map<string, {exampleImageUrl: string, setupImageUrl: string, exampleMediaAssetId: string, setupMediaAssetId: string}>}
 */
function collectActivityImageState(plan) {
  /** @type {Map<string, {exampleImageUrl: string, setupImageUrl: string, exampleMediaAssetId: string, setupMediaAssetId: string}>} */
  const byTitle = new Map();
  const remember = (title, rec) => {
    const key = text(title);
    if (!key || !rec || typeof rec !== "object") return;
    const prev = byTitle.get(key) || {
      exampleImageUrl: "",
      setupImageUrl: "",
      exampleMediaAssetId: "",
      setupMediaAssetId: "",
    };
    byTitle.set(key, {
      exampleImageUrl: text(rec.exampleImageUrl) || prev.exampleImageUrl,
      setupImageUrl: text(rec.setupImageUrl) || prev.setupImageUrl,
      exampleMediaAssetId: text(rec.exampleMediaAssetId) || prev.exampleMediaAssetId,
      setupMediaAssetId: text(rec.setupMediaAssetId) || prev.setupMediaAssetId,
    });
  };
  WEEKDAYS.forEach((day) => {
    (plan?.dailyPlans?.[day]?.items || []).forEach((item) => remember(item.title, item));
  });
  Object.values(plan?.enrichmentDraft?.activities || {}).forEach((act) => remember(act?.title, act));
  Object.values(plan?.enrichmentPublished?.activities || {}).forEach((act) => remember(act?.title, act));
  return byTitle;
}

function copyImageStateOnto(rec, state) {
  if (!rec || typeof rec !== "object" || !state) return;
  if (state.exampleImageUrl) rec.exampleImageUrl = state.exampleImageUrl;
  if (state.setupImageUrl) rec.setupImageUrl = state.setupImageUrl;
  if (state.exampleMediaAssetId) rec.exampleMediaAssetId = state.exampleMediaAssetId;
  if (state.setupMediaAssetId) rec.setupMediaAssetId = state.setupMediaAssetId;
}

function preserveExistingActivityImages(existing, next) {
  const byTitle = collectActivityImageState(existing);
  WEEKDAYS.forEach((day) => {
    (next?.dailyPlans?.[day]?.items || []).forEach((item) => {
      copyImageStateOnto(item, byTitle.get(text(item.title)));
    });
  });
  Object.values(next?.enrichmentDraft?.activities || {}).forEach((act) => {
    copyImageStateOnto(act, byTitle.get(text(act?.title)));
  });
  Object.values(next?.enrichmentPublished?.activities || {}).forEach((act) => {
    copyImageStateOnto(act, byTitle.get(text(act?.title)));
  });
}

function listPlanActivities(plan) {
  /** @type {Array<{title: string, day: string, exampleImageUrl: string, setupImageUrl: string}>} */
  const rows = [];
  WEEKDAYS.forEach((day) => {
    (plan?.dailyPlans?.[day]?.items || []).forEach((item) => {
      rows.push({
        title: text(item.title),
        day,
        exampleImageUrl: text(item.exampleImageUrl),
        setupImageUrl: text(item.setupImageUrl),
      });
    });
  });
  return rows;
}

/**
 * Cover + mapped activity example images only. Does not create activities or printables.
 * @param {object} plan
 */
function assignTinyArtistStudioImages(plan) {
  verifyTinyArtistStudioImageFiles();
  const previousCover = text(plan.coverImageUrl);
  plan.coverImageUrl = COVER_IMAGE_URL;
  plan.coverSource = plan.coverSource || "uploaded";
  plan.coverQualityStatus = plan.coverQualityStatus || "good";

  /** @type {Array<{title: string, location: string, file: string, url: string, previous: string}>} */
  const replaced = [];
  const applyMappedExample = (rec, title, location) => {
    if (!rec || typeof rec !== "object") return;
    const file = ACTIVITY_EXAMPLE_IMAGE_FILES[title];
    if (!file) return;
    if (file === COVER_FILENAME) {
      throw new Error(`Refusing to assign cover file to activity "${title}"`);
    }
    const url = imagePublicUrl(file);
    const previous = text(rec.exampleImageUrl) || "(none)";
    rec.exampleImageUrl = url;
    replaced.push({ title, location, file, url, previous });
  };

  WEEKDAYS.forEach((day) => {
    (plan?.dailyPlans?.[day]?.items || []).forEach((item) => {
      applyMappedExample(item, text(item.title), `dailyPlans.${day}`);
    });
  });
  Object.entries(plan?.enrichmentDraft?.activities || {}).forEach(([key, act]) => {
    applyMappedExample(act, text(act?.title), `enrichmentDraft.activities.${key}`);
  });
  Object.entries(plan?.enrichmentPublished?.activities || {}).forEach(([key, act]) => {
    applyMappedExample(act, text(act?.title), `enrichmentPublished.activities.${key}`);
  });

  return {
    coverAssigned: COVER_IMAGE_URL,
    previousCover: previousCover || "(none)",
    replaced,
    activities: listPlanActivities(plan),
  };
}

function validateParsed(parsed) {
  const errors = [];
  if (!parsed.ok) errors.push(...(parsed.errors || ["parse failed"]));
  if (text(parsed.lesson?.title) !== NEW_TITLE) {
    errors.push(`Expected title ${NEW_TITLE}, got ${parsed.lesson?.title}`);
  }
  if (!/Infant 0/i.test(text(parsed.lesson?.age))) {
    errors.push(`Expected Infant 0–6 Months age band, got ${parsed.lesson?.age}`);
  }
  const byDay = activityTitlesByDay(parsed.dailyPlans);
  const allTitles = [];
  WEEKDAYS.forEach((day) => {
    if (byDay[day].length !== 3) {
      errors.push(`${day} has ${byDay[day].length} activities (expected 3)`);
    }
    allTitles.push(...byDay[day]);
  });
  if (allTitles.length !== 15) errors.push(`Expected 15 activities, got ${allTitles.length}`);
  if (new Set(allTitles).size !== allTitles.length) {
    errors.push("Activity titles are not unique");
  }
  if ((parsed.unrecognized || []).length) {
    errors.push(
      `Unrecognized headings: ${parsed.unrecognized
        .map((row) => row.heading)
        .slice(0, 8)
        .join(", ")}`,
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    byDay,
    allTitles,
    activityCount: allTitles.length,
    books: (parsed.books || []).map((b) => b.title),
    songs: (parsed.songs || []).map((s) => s.title),
    printableIdeas: (parsed.printableIdeas || []).map((p) => p.title),
  };
}

function buildEnrichmentActivities(dailyPlans) {
  const activities = {};
  WEEKDAYS.forEach((day) => {
    (dailyPlans?.[day]?.items || []).forEach((item) => {
      if (!item?.itemId) return;
      activities[item.itemId] = {
        title: item.title || "",
        dayOfWeek: day,
        activityCategory: item.activityCategory || "",
        ageModifications: item.ageModifications || "",
        durationMinutes: item.durationMinutes || "",
        objective: item.objective || "",
        description: item.description || "",
        materials: item.materials || "",
        preparation: item.preparation || "",
        setup: item.setup || "",
        steps: item.steps || "",
        teacherLanguage: item.teacherLanguage || "",
        observationOpportunities: item.observationOpportunities || "",
        safetyNotes: item.safetyNotes || "",
        cleanupTips: item.cleanupTips || "",
        teacherTips: Array.isArray(item.teacherTips) ? item.teacherTips.slice() : [],
        vocabulary: item.vocabulary || "",
        observationPrompts: Array.isArray(item.observationPrompts)
          ? item.observationPrompts.slice()
          : [],
        imageRequirement: item.imageRequirement || "required",
        imageBriefSetup: item.imageBriefSetup || "",
        imageBriefExample: item.imageBriefExample || "",
        settingTags: ["indoor", "small_group"],
      };
    });
  });
  return activities;
}

function mergeOntoExisting(existing, parsed) {
  const now = new Date().toISOString();
  const canonical = buildCanonicalLessonPlan(parsed, {
    id: LESSON_ID,
    now,
    lastEditedBy: "owner-approved-tiny-artist-studio-replacement",
  });
  const enrichmentActivities = buildEnrichmentActivities(canonical.dailyPlans);
  const weekDraft = {
    ...(canonical.enrichmentDraft?.week || {}),
    weeklyOverview: parsed.lesson.weeklyOverview || "",
    objectives: parsed.lesson.objectives || "",
    weeklyMaterials: parsed.lesson.weeklyMaterials || "",
    familyConnection: parsed.lesson.familyConnection || "",
    teacherPreparation: parsed.lesson.teacherPreparation || "",
    teacherToolkit: {
      prepChecklist: Array.isArray(parsed.lesson.prepChecklist)
        ? parsed.lesson.prepChecklist.slice()
        : [],
      observationFocus: Array.isArray(parsed.lesson.observationFocus)
        ? parsed.lesson.observationFocus.slice()
        : [],
      teacherPreparation: parsed.lesson.teacherPreparation || "",
    },
  };

  // Preserve entitlement / identity / linked resources. Replace lesson content only.
  const merged = {
    ...existing,
    id: LESSON_ID,
    title: NEW_TITLE,
    theme: NEW_TITLE,
    age: parsed.lesson.age || existing.age,
    plan: existing.plan || "Free",
    status: existing.status || "published",
    weeklyOverview: parsed.lesson.weeklyOverview || "",
    objectives: parsed.lesson.objectives || "",
    weeklyMaterials: parsed.lesson.weeklyMaterials || "",
    familyConnection: parsed.lesson.familyConnection || "",
    observationOpportunities: (parsed.lesson.observationFocus || []).join("\n"),
    dailyPlans: canonical.dailyPlans,
    resourceIds: Array.isArray(existing.resourceIds) ? existing.resourceIds.slice() : [],
    createdAt: existing.createdAt || now,
    publishedAt: existing.publishedAt || existing.createdAt || now,
    updatedAt: now,
    coverImageUrl: COVER_IMAGE_URL,
    coverImageAlt: "Tiny Artist Studio infant handprint and footprint butterfly artwork",
    coverImagePosition: existing.coverImagePosition || "center",
    coverQualityStatus: "good",
    coverSource: "uploaded",
    teachingKit: existing.teachingKit && typeof existing.teachingKit === "object"
      ? {
          ...existing.teachingKit,
          // Keep existing printableIds linkage untouched.
          printableIds: Array.isArray(existing.teachingKit.printableIds)
            ? existing.teachingKit.printableIds.slice()
            : existing.teachingKit.printableIds,
        }
      : existing.teachingKit,
    enrichmentDraft: {
      activities: enrichmentActivities,
      week: weekDraft,
      updatedAt: now,
      lastEditedBy: "owner-approved-tiny-artist-studio-replacement",
      previewReady: true,
      draftOnly: true,
      neverAutoPublish: true,
    },
    // Keep any previously published enrichment metadata keys as-is on the plan object,
    // but customer-facing dailyPlans content is fully replaced above.
  };
  preserveExistingActivityImages(existing, merged);
  assignTinyArtistStudioImages(merged);
  return merged;
}

function mapToApprovedCategory(raw) {
  const value = text(raw).toLowerCase();
  if (!value) return "Sensory Play";
  if (/(art|keepsake|handprint|footprint|creative sensory|sponge print|sunshine|busy bee|butterfly|flower)/i.test(value)) {
    return "Art";
  }
  if (/(literacy|language|gallery|book)/i.test(value)) return "Literacy";
  if (/(sensory|texture|tactile|visual attention|visual development|body awareness)/i.test(value)) {
    return "Sensory Play";
  }
  if (/(visual tracking|rolling color|stem)/i.test(value)) return "STEM/Discovery";
  if (/(identity|documentation|photo|open-ended)/i.test(value)) return "Open-Ended Exploration";
  if (/(music|song|movement)/i.test(value)) return "Music & Movement";
  if (/(gross motor|kick)/i.test(value)) return "Gross Motor";
  if (/(fine motor)/i.test(value)) return "Fine Motor";
  if (/(circle)/i.test(value)) return "Circle Time";
  if (/(outdoor)/i.test(value)) return "Outdoor Play";
  if (/(dramatic)/i.test(value)) return "Dramatic Play";
  return "Sensory Play";
}

function applyApprovedCategories(parsed) {
  WEEKDAYS.forEach((day) => {
    (parsed.dailyPlans?.[day]?.items || []).forEach((item) => {
      const rich = text(item.activityCategory);
      const approved = mapToApprovedCategory(rich || item.title);
      if (rich && rich !== approved) {
        item.activityCategoryNote = rich;
      }
      item.activityCategory = approved;
    });
  });
  return parsed;
}

function toLegacyImportText(parsed, validation) {
  const lines = [];
  const push = (label, value) => {
    lines.push(`${label}:`);
    lines.push(text(value));
    lines.push("");
  };
  push("TITLE", NEW_TITLE);
  push("AGE_GROUP", parsed.lesson.age || "Infant 0–6 Months");
  push("THEME", NEW_TITLE);
  push("PLAN", "Free");
  push("STATUS", "published");
  push(
    "LEARNING_DOMAINS",
    ["Physical Development", "Language & Literacy", "Social Emotional", "Creative Arts"].join("\n"),
  );
  push("WEEKLY_OVERVIEW", parsed.lesson.weeklyOverview);
  push("LEARNING_OBJECTIVES", parsed.lesson.objectives);
  push("WEEKLY_MATERIALS", parsed.lesson.weeklyMaterials);
  push(
    "VOCABULARY",
    ["Hand", "Foot", "Toes", "Color", "Press", "Pat", "Soft", "Look", "Paint", "Art"].join("\n"),
  );
  push(
    "BOOKS",
    (parsed.books || [])
      .map((book) => (book.author ? `${book.title} | ${book.author}` : book.title))
      .join("\n"),
  );
  push("SONGS", (parsed.songs || []).map((song) => song.title).join("\n"));
  push("FAMILY_CONNECTION", parsed.lesson.familyConnection);
  push("OBSERVATION_OPPORTUNITIES", (parsed.lesson.observationFocus || []).join("\n"));
  push(
    "ADAPTATIONS",
    "Follow baby's cues. Keep sessions short. Never force hands or feet open. Stop for distress, mouthing of paint, or overstimulation.",
  );

  WEEKDAYS.forEach((day) => {
    const label = day.toUpperCase();
    lines.push(`${label}:`);
    lines.push("");
    push("DAILY_THEME", `${NEW_TITLE}: ${DAY_THEMES[day]}`);
    push("DAILY_OBJECTIVES", `Explore ${DAY_THEMES[day]} through caregiver-assisted infant art and sensory play.`);
    push(
      "DAILY_LEARNING_DOMAINS",
      "Physical Development, Language & Literacy, Social Emotional, Creative Arts",
    );
    push("DAILY_MATERIALS", parsed.lesson.weeklyMaterials);
    push(
      "DAILY_VOCABULARY",
      ["Hand", "Foot", "Toes", "Color", "Press", "Pat", "Soft", "Look"].join("\n"),
    );
    push(
      "CIRCLE_TIME",
      `Welcome song connected to Tiny Artist Studio.\nTalk about today's focus: ${DAY_THEMES[day]}.\nInvite calm looking, kicking, or hand awareness with caregiver support.`,
    );
    push(
      "OUTDOOR_PLAY",
      "If weather allows, enjoy a brief shaded outdoor looking/listening moment connected to color or texture, with continuous supervision.",
    );
    push(
      "DAILY_OBSERVATIONS",
      (parsed.lesson.observationFocus || []).slice(0, 4).join("\n"),
    );
    push(
      "DAILY_ADAPTATIONS",
      "Follow baby's cues. Keep sessions short. Never force hands or feet open.",
    );
    push(
      "SAFETY_NOTES",
      "Supervise closely. Use program-approved materials only. Sensory bags must stay sealed and secured.",
    );

    (parsed.dailyPlans?.[day]?.items || []).forEach((item) => {
      push("ACTIVITY_NAME", item.title);
      push("CATEGORY", mapToApprovedCategory(item.activityCategoryNote || item.activityCategory || item.title));
      push("OBJECTIVE", item.objective || "");
      push("DESCRIPTION", item.description || "");
      push("MATERIALS", item.materials || "");
      push("SETUP", item.setup || "");
      push("TEACHER_ROLE", item.teacherLanguage || item.preparation || "");
      const steps = text(item.steps)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      push(
        "DIRECTIONS",
        steps.length
          ? steps.map((line, idx) => `${idx + 1}. ${line.replace(/^\d+\.\s*/, "")}`).join("\n")
          : "",
      );
      push(
        "LEARNING_GOALS",
        text(item.observationOpportunities)
          .split(/[,;\n]+/)
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => `- ${part}`)
          .join("\n") || "- Sensory exploration\n- Caregiver bonding",
      );
      push("OBSERVATION_OPPORTUNITIES", item.observationOpportunities || "");
      push("ADAPTATIONS", "Follow baby's cues and keep the experience brief.");
      push("SAFETY_NOTES", item.safetyNotes || "Supervise closely.");
    });
  });

  void validation;
  return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
}

function snapshotLesson(plan, curriculum) {
  const byDay = activityTitlesByDay(plan?.dailyPlans);
  const linked = Array.isArray(plan?.resourceIds) ? plan.resourceIds.slice() : [];
  const resourceTitles = linked.map((id) => {
    const resource = (curriculum?.resources || []).find((item) => item.id === id);
    return resource ? resource.title : id;
  });
  return {
    id: plan?.id || "",
    title: plan?.title || "",
    age: plan?.age || "",
    plan: plan?.plan || "",
    status: plan?.status || "",
    activityCount: WEEKDAYS.reduce((sum, day) => sum + byDay[day].length, 0),
    byDay,
    activityTitles: WEEKDAYS.flatMap((day) => byDay[day]),
    resourceIds: linked,
    resourceTitles,
    coverImageUrl: plan?.coverImageUrl || "",
    activityImages: listPlanActivities(plan),
    enrichmentDraftPrintableIdeaCount: Array.isArray(plan?.enrichmentDraft?.week?.printableIdeas)
      ? plan.enrichmentDraft.week.printableIdeas.length
      : 0,
  };
}

function applyToStore(storePath, parsed) {
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  if (!store.siteContent || typeof store.siteContent !== "object") store.siteContent = {};
  if (!store.siteContent.curriculum || typeof store.siteContent.curriculum !== "object") {
    throw new Error("Store has no curriculum");
  }
  const curriculum = store.siteContent.curriculum;
  curriculum.lessonPlans = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
  curriculum.activities = Array.isArray(curriculum.activities) ? curriculum.activities : [];
  curriculum.resources = Array.isArray(curriculum.resources) ? curriculum.resources : [];

  const resourcesBefore = JSON.stringify(curriculum.resources);
  const otherPlansBefore = curriculum.lessonPlans
    .filter((plan) => plan.id !== LESSON_ID)
    .map((plan) => ({ id: plan.id, title: plan.title, updatedAt: plan.updatedAt }));

  let idx = curriculum.lessonPlans.findIndex((plan) => plan.id === LESSON_ID);
  if (idx < 0) {
    idx = curriculum.lessonPlans.findIndex(
      (plan) => text(plan.title).toLowerCase() === OLD_TITLE.toLowerCase(),
    );
  }
  if (idx < 0) {
    throw new Error(`Lesson ${LESSON_ID} / "${OLD_TITLE}" not found in store`);
  }

  const before = snapshotLesson(curriculum.lessonPlans[idx], curriculum);
  const merged = mergeOntoExisting(curriculum.lessonPlans[idx], parsed);
  curriculum.lessonPlans[idx] = merged;

  // Resync top-level curriculum activities for this lesson only.
  const now = merged.updatedAt;
  const kept = curriculum.activities.filter((act) => act.lessonPlanId !== LESSON_ID);
  const nextActs = [];
  WEEKDAYS.forEach((day) => {
    (merged.dailyPlans?.[day]?.items || []).forEach((item, index) => {
      const activityId = `${LESSON_ID}:${item.itemId || `item-${day}-${index + 1}`}`;
      nextActs.push({
        id: activityId,
        itemId: item.itemId,
        lessonPlanId: LESSON_ID,
        title: item.title || "",
        dayOfWeek: day,
        activityCategory: item.activityCategory || "",
        objective: item.objective || "",
        description: item.description || "",
        materials: item.materials || "",
        setup: item.setup || "",
        steps: item.steps || "",
        teacherLanguage: item.teacherLanguage || "",
        observationOpportunities: item.observationOpportunities || "",
        vocabulary: item.vocabulary || "",
        safetyNotes: item.safetyNotes || "",
        cleanupTips: item.cleanupTips || "",
        teacherTips: Array.isArray(item.teacherTips) ? item.teacherTips.slice() : [],
        imageRequirement: item.imageRequirement || "",
        imageBriefSetup: item.imageBriefSetup || "",
        setupImageUrl: item.setupImageUrl || "",
        exampleImageUrl: item.exampleImageUrl || "",
        status: merged.status || "published",
        plan: merged.plan || "Free",
        age: merged.age || "",
        createdAt: now,
        updatedAt: now,
        publishedAt: merged.status === "published" ? merged.publishedAt || now : "",
      });
    });
  });
  curriculum.activities = kept.concat(nextActs);
  merged.activityIds = nextActs.map((act) => act.id);
  curriculum.lessonPlans[idx] = merged;
  store.siteContent.updatedAt = now;
  curriculum.updatedAt = now;

  if (JSON.stringify(curriculum.resources) !== resourcesBefore) {
    throw new Error("Resources changed unexpectedly — aborting write");
  }
  const otherPlansAfter = curriculum.lessonPlans
    .filter((plan) => plan.id !== LESSON_ID)
    .map((plan) => ({ id: plan.id, title: plan.title, updatedAt: plan.updatedAt }));
  if (JSON.stringify(otherPlansBefore) !== JSON.stringify(otherPlansAfter)) {
    throw new Error("Another lesson changed unexpectedly — aborting write");
  }

  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
  const after = snapshotLesson(merged, curriculum);
  return { before, after, storePath };
}

async function applyRemote(parsed) {
  const baseUrl = text(process.env.SITE_URL || process.env.LLH_PROD_URL);
  const token = await adminLogin(baseUrl);
  const auth = adminAuthHeaders(token);
  const site = await requestJson(baseUrl, "GET", `/api/admin/site-content?t=${Date.now()}`, null, auth);
  if (site.status !== 200) {
    throw new Error(`site-content load failed: ${site.status} ${String(site.text || "").slice(0, 200)}`);
  }
  const siteContent = site.json.siteContent || site.json;
  const curriculum = siteContent.curriculum || site.json.curriculum || {};
  const expectedUpdatedAt = siteContent.updatedAt || site.json.updatedAt || site.json.siteContentUpdatedAt || "";
  const existing = (curriculum?.lessonPlans || []).find((plan) => plan.id === LESSON_ID);
  if (!existing) throw new Error(`Remote lesson ${LESSON_ID} not found`);
  if (text(existing.title) !== OLD_TITLE && text(existing.title) !== NEW_TITLE) {
    throw new Error(`Refusing to overwrite unexpected title "${existing.title}"`);
  }
  const tinyDup = (curriculum.lessonPlans || []).filter(
    (plan) => plan.id !== LESSON_ID && text(plan.title).toLowerCase() === NEW_TITLE.toLowerCase(),
  );
  if (tinyDup.length) {
    throw new Error("Another Tiny Artist Studio lesson already exists — aborting");
  }
  if (text(existing.plan) !== "Free") throw new Error(`Refusing to change plan from ${existing.plan}`);
  if (text(existing.status) !== "published") throw new Error(`Refusing to change status from ${existing.status}`);
  const resourcesBefore = curriculum.resources || [];
  const otherPlansBefore = (curriculum.lessonPlans || [])
    .filter((plan) => plan.id !== LESSON_ID)
    .map((plan) => ({ id: plan.id, title: plan.title, updatedAt: plan.updatedAt }));
  const before = snapshotLesson(existing, curriculum);
  const merged = mergeOntoExisting(existing, parsed);
  if (merged.id !== LESSON_ID) throw new Error("Refusing to change lesson ID");
  if (text(merged.plan) !== "Free") throw new Error("Refusing to change Free/Pro");
  if (text(merged.status) !== "published") throw new Error("Refusing to change publish status");
  if (JSON.stringify(merged.resourceIds || []) !== JSON.stringify(existing.resourceIds || [])) {
    throw new Error("Refusing to change resourceIds");
  }
  const save = await requestJson(baseUrl, "POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt,
    lessonPlan: merged,
  }, auth);
  if (save.status !== 200) {
    throw new Error(`Save failed: ${save.status} ${String(save.text || "").slice(0, 400)}`);
  }
  const afterCurriculum = save.json.curriculum || curriculum;
  assertUnchangedResourceCatalog(resourcesBefore, afterCurriculum.resources || []);
  const otherPlansAfter = (afterCurriculum.lessonPlans || [])
    .filter((plan) => plan.id !== LESSON_ID)
    .map((plan) => ({ id: plan.id, title: plan.title, updatedAt: plan.updatedAt }));
  if (JSON.stringify(otherPlansBefore) !== JSON.stringify(otherPlansAfter)) {
    throw new Error("Another lesson changed unexpectedly");
  }
  const afterPlan = (afterCurriculum.lessonPlans || []).find((plan) => plan.id === LESSON_ID)
    || save.json.lessonPlan;
  const after = snapshotLesson(afterPlan, afterCurriculum);
  return { before, after, mode: "remote", baseUrl };
}

function findLessonIndex(lessonPlans) {
  let idx = lessonPlans.findIndex((plan) => plan.id === LESSON_ID);
  if (idx < 0) {
    idx = lessonPlans.findIndex(
      (plan) => text(plan.title).toLowerCase() === NEW_TITLE.toLowerCase(),
    );
  }
  if (idx < 0) {
    idx = lessonPlans.findIndex(
      (plan) => text(plan.title).toLowerCase() === OLD_TITLE.toLowerCase(),
    );
  }
  return idx;
}

function identityGuard(before, after) {
  if (before.id !== after.id) throw new Error("Lesson ID changed");
  if (before.title !== after.title) throw new Error("Lesson title changed");
  if (before.plan !== after.plan) throw new Error("Free/Pro plan changed");
  if (before.status !== after.status) throw new Error("Publication status changed");
  if (JSON.stringify(before.resourceIds) !== JSON.stringify(after.resourceIds)) {
    throw new Error("Linked Resources / resourceIds changed");
  }
  if (JSON.stringify(before.activityTitles) !== JSON.stringify(after.activityTitles)) {
    throw new Error("Activity titles changed");
  }
}

function applyImagesToCurriculumActivities(curriculum, plan) {
  const byTitle = collectActivityImageState(plan);
  (curriculum.activities || []).forEach((act) => {
    if (!act || act.lessonPlanId !== LESSON_ID) return;
    const state = byTitle.get(text(act.title));
    copyImageStateOnto(act, state);
    const file = ACTIVITY_EXAMPLE_IMAGE_FILES[text(act.title)];
    if (file) act.exampleImageUrl = imagePublicUrl(file);
  });
}

function applyImagesOnlyToStore(storePath) {
  verifyTinyArtistStudioImageFiles();
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  if (!store.siteContent?.curriculum) throw new Error("Store has no curriculum");
  const curriculum = store.siteContent.curriculum;
  curriculum.lessonPlans = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
  curriculum.activities = Array.isArray(curriculum.activities) ? curriculum.activities : [];
  curriculum.resources = Array.isArray(curriculum.resources) ? curriculum.resources : [];

  const resourcesBefore = JSON.stringify(curriculum.resources);
  const otherPlansBefore = curriculum.lessonPlans
    .filter((plan) => plan.id !== LESSON_ID)
    .map((plan) => ({ id: plan.id, title: plan.title, updatedAt: plan.updatedAt }));

  const idx = findLessonIndex(curriculum.lessonPlans);
  if (idx < 0) throw new Error(`Lesson ${LESSON_ID} / "${NEW_TITLE}" not found in store`);

  const before = snapshotLesson(curriculum.lessonPlans[idx], curriculum);
  const merged = JSON.parse(JSON.stringify(curriculum.lessonPlans[idx]));
  const imageReport = assignTinyArtistStudioImages(merged);
  merged.updatedAt = new Date().toISOString();
  curriculum.lessonPlans[idx] = merged;
  applyImagesToCurriculumActivities(curriculum, merged);

  const after = snapshotLesson(merged, curriculum);
  identityGuard(before, after);
  if (JSON.stringify(curriculum.resources) !== resourcesBefore) {
    throw new Error("Resources changed unexpectedly — aborting write");
  }
  const otherPlansAfter = curriculum.lessonPlans
    .filter((plan) => plan.id !== LESSON_ID)
    .map((plan) => ({ id: plan.id, title: plan.title, updatedAt: plan.updatedAt }));
  if (JSON.stringify(otherPlansBefore) !== JSON.stringify(otherPlansAfter)) {
    throw new Error("Another lesson changed unexpectedly — aborting write");
  }

  store.siteContent.updatedAt = merged.updatedAt;
  curriculum.updatedAt = merged.updatedAt;
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
  return { before, after, storePath, imageReport, mode: "store-images-only" };
}

async function applyImagesOnlyRemote() {
  verifyTinyArtistStudioImageFiles();
  const baseUrl = text(process.env.SITE_URL || process.env.LLH_PROD_URL);
  const token = await adminLogin(baseUrl);
  const auth = adminAuthHeaders(token);
  const site = await requestJson(baseUrl, "GET", `/api/admin/site-content?t=${Date.now()}`, null, auth);
  if (site.status !== 200) {
    throw new Error(`site-content load failed: ${site.status}`);
  }
  const siteContent = site.json.siteContent || site.json;
  const curriculum = siteContent.curriculum || site.json.curriculum || {};
  const expectedUpdatedAt = siteContent.updatedAt || site.json.updatedAt || site.json.siteContentUpdatedAt || "";
  const existing = (curriculum?.lessonPlans || []).find((plan) => plan.id === LESSON_ID);
  if (!existing) throw new Error(`Remote lesson ${LESSON_ID} not found`);
  const resourcesBefore = curriculum.resources || [];
  const before = snapshotLesson(existing, curriculum);
  const merged = JSON.parse(JSON.stringify(existing));
  const imageReport = assignTinyArtistStudioImages(merged);
  merged.updatedAt = new Date().toISOString();
  identityGuard(before, snapshotLesson(merged, curriculum));
  if (JSON.stringify(merged.resourceIds || []) !== JSON.stringify(existing.resourceIds || [])) {
    throw new Error("Refusing to change resourceIds");
  }
  const save = await requestJson(baseUrl, "POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt,
    lessonPlan: merged,
  }, auth);
  if (save.status !== 200) {
    throw new Error(`Save failed: ${save.status} ${save.text.slice(0, 400)}`);
  }
  const afterCurriculum = save.json.curriculum || curriculum;
  assertUnchangedResourceCatalog(resourcesBefore, afterCurriculum.resources || []);
  const afterPlan = (afterCurriculum.lessonPlans || []).find((plan) => plan.id === LESSON_ID)
    || save.json.lessonPlan;
  const after = snapshotLesson(afterPlan, afterCurriculum);
  identityGuard(before, after);
  return { before, after, imageReport, mode: "remote-images-only", baseUrl };
}

function writeImportSources(parsed, validation) {
  const legacy = toLegacyImportText(parsed, validation);
  fs.writeFileSync(CORE_IMPORT_PATH, legacy);
  fs.writeFileSync(SAMPLE_IMPORT_PATH, legacy);
  return { coreImportPath: CORE_IMPORT_PATH, sampleImportPath: SAMPLE_IMPORT_PATH };
}

function patchBlueprints(validation) {
  const filePath = path.join(ROOT, "scripts/lib/truncated-week-completion-data.js");
  let source = fs.readFileSync(filePath, "utf8");
  const startMarker = '  "cur-lp-infant-tummy-time-adventures": {';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error("BLUEPRINTS entry for tummy-time not found");
  const nextKey = source.indexOf('\n  "cur-lp-infant-', start + startMarker.length);
  if (nextKey < 0) throw new Error("Could not find end of tummy-time BLUEPRINTS entry");
  const actLines = (day) => validation.byDay[day]
    .map((title, index) => {
      const item = null;
      void item;
      return `        act("Sensory Play", ${JSON.stringify(title)}, ${JSON.stringify(`Infant art experience: ${title}.`)}, ${JSON.stringify(`Caregiver-assisted Tiny Artist Studio experience focused on ${title}.`)}, ["Program-approved washable paint", "Cardstock or sensory materials", "Warm washcloth"], "Prepare materials before baby participates.", ["Securely support baby.", "Follow the activity steps.", "Narrate calmly.", "Watch for comfort cues.", "Clean promptly."], "Never force hands or feet; stop for distress.", ["Sensory exploration", "Body awareness", "Caregiver bonding"], ["Looks", "Reaches or kicks", "Shows interest"], INFANT_DEFAULT_ADAPT, INFANT_DEFAULT_SAFE)${index < 2 ? "," : ""}`;
    })
    .join("\n");
  const replacement = `  "cur-lp-infant-tummy-time-adventures": {
    sourceFile: "03-tummy-time-adventures.txt",
    sourceDir: "infant-batch-jul2026",
    plan: "Free",
    age: "Infant 0-6 Months",
    dayThemes: {
      monday: "Tiny Hands",
      tuesday: "Tiny Toes",
      wednesday: "Color Magic",
      thursday: "Baby Makes a Mark",
      friday: "My First Masterpiece"
    },
    days: {
      monday: [
${actLines("monday")}
      ],
      tuesday: [
${actLines("tuesday")}
      ],
      wednesday: [
${actLines("wednesday")}
      ],
      thursday: [
${actLines("thursday")}
      ],
      friday: [
${actLines("friday")}
      ]
    },
  },`;
  source = `${source.slice(0, start)}${replacement}${source.slice(nextKey)}`;
  fs.writeFileSync(filePath, source);
  return filePath;
}

async function ensureLocalSeededStore() {
  const storePath = path.join(ROOT, "server/data/launch-store.json");
  const port = 4317;
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_PROVIDER: "local-json",
    ADMIN_EMAIL: "tiny-artist-admin@test.local",
    ADMIN_PASSWORD: "tiny-artist-admin-pass",
    ADMIN_ACCESS_CODE: "tiny-artist-admin-code",
  };
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const health = await requestJson(`http://127.0.0.1:${port}`, "GET", "/api/health");
      if (health.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // keep waiting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) {
    child.kill("SIGTERM");
    throw new Error("Local server failed to start for seed");
  }
  // Touch admin site-content so infant core seed has run and store exists.
  await requestJson(`http://127.0.0.1:${port}`, "POST", "/api/admin/session", {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    code: env.ADMIN_ACCESS_CODE,
  });
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  if (!fs.existsSync(storePath)) {
    throw new Error(`Expected store at ${storePath}`);
  }
  return storePath;
}

async function main() {
  const { parsed } = loadPaste();
  const validation = validateParsed(parsed);
  if (!validation.ok) {
    console.error("VALIDATION FAILED");
    validation.errors.forEach((err) => console.error(` - ${err}`));
    process.exit(1);
  }

  const mappedMissing = Object.keys(ACTIVITY_EXAMPLE_IMAGE_FILES).filter(
    (title) => !validation.allTitles.includes(title),
  );
  if (mappedMissing.length) {
    throw new Error(`Mapped activity title(s) not in lesson: ${mappedMissing.join(", ")}`);
  }

  const verifiedFiles = verifyTinyArtistStudioImageFiles();

  if (hasFlag("--images-only")) {
    const report = {
      lessonId: LESSON_ID,
      mode: "images-only",
      verifiedFiles,
      coverAssigned: COVER_IMAGE_URL,
      mappedExampleImages: ACTIVITY_EXAMPLE_IMAGE_FILES,
      printablesOrResourcesChanged: false,
      otherLessonsChanged: false,
      lessonTextChanged: false,
      activityTextChanged: false,
      freeProChanged: false,
    };
    if (hasFlag("--validate-only")) {
      fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
      fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const applied = hasFlag("--remote")
      ? await applyImagesOnlyRemote()
      : await (async () => {
        let storePath = argValue("--store");
        if (!storePath) storePath = await ensureLocalSeededStore();
        return applyImagesOnlyToStore(storePath);
      })();
    Object.assign(report, {
      mode: applied.mode,
      storePath: applied.storePath || "",
      planBefore: applied.before.plan,
      planAfter: applied.after.plan,
      statusBefore: applied.before.status,
      statusAfter: applied.after.status,
      coverBefore: applied.before.coverImageUrl,
      coverAfter: applied.after.coverImageUrl,
      imageReport: applied.imageReport,
      before: applied.before,
      after: applied.after,
    });
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const importWrite = writeImportSources(parsed, validation);
  const blueprintsPath = patchBlueprints(validation);

  const report = {
    lessonId: LESSON_ID,
    oldTitle: OLD_TITLE,
    newTitle: NEW_TITLE,
    ageBand: parsed.lesson.age,
    activityCount: validation.activityCount,
    activityCountByWeekday: Object.fromEntries(
      WEEKDAYS.map((day) => [day, validation.byDay[day].length]),
    ),
    activityTitles: validation.allTitles,
    books: validation.books,
    songs: validation.songs,
    printableIdeas: validation.printableIdeas,
    printablesOrResourcesChanged: false,
    otherLessonsChanged: false,
    importWrite,
    blueprintsPath,
    validation,
    coverAssigned: COVER_IMAGE_URL,
    verifiedFiles,
  };

  if (hasFlag("--validate-only")) {
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (hasFlag("--remote")) {
    const remote = await applyRemote(parsed);
    Object.assign(report, {
      mode: "remote",
      planBefore: remote.before.plan,
      planAfter: remote.after.plan,
      statusBefore: remote.before.status,
      statusAfter: remote.after.status,
      coverBefore: remote.before.coverImageUrl,
      coverAfter: remote.after.coverImageUrl,
      before: remote.before,
      after: remote.after,
      printablesOrResourcesChanged: JSON.stringify(remote.before.resourceIds)
        !== JSON.stringify(remote.after.resourceIds)
        ? "resourceIds changed unexpectedly"
        : false,
    });
  } else {
    let storePath = argValue("--store");
    if (!storePath) storePath = await ensureLocalSeededStore();
    const local = applyToStore(storePath, parsed);
    Object.assign(report, {
      mode: "store",
      storePath: local.storePath,
      planBefore: local.before.plan,
      planAfter: local.after.plan,
      statusBefore: local.before.status,
      statusAfter: local.after.status,
      coverBefore: local.before.coverImageUrl,
      coverAfter: local.after.coverImageUrl,
      before: local.before,
      after: local.after,
      printablesOrResourcesChanged: JSON.stringify(local.before.resourceIds)
        !== JSON.stringify(local.after.resourceIds)
        ? "resourceIds changed unexpectedly"
        : false,
    });
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
