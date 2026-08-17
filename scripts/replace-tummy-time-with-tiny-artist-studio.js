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
 *   node scripts/replace-tummy-time-with-tiny-artist-studio.js --store=/path/to/launch-store.json
 *   SITE_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_ACCESS_CODE=… \
 *     node scripts/replace-tummy-time-with-tiny-artist-studio.js --remote
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

  // Preserve entitlement / identity / linked resources / covers. Replace lesson content only.
  const coverImageUrl = "/images/lesson-covers/tiny-artist-studio.jpg";
  return {
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
    coverImageUrl,
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
  const email = text(process.env.ADMIN_EMAIL);
  const password = text(process.env.ADMIN_PASSWORD);
  const code = text(process.env.ADMIN_ACCESS_CODE);
  if (!baseUrl || !email || !password || !code) {
    throw new Error("Remote apply requires SITE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE");
  }
  const login = await requestJson(baseUrl, "POST", "/api/admin/session", {
    email,
    password,
    code,
  });
  if (login.status !== 200 || !login.json?.token) {
    throw new Error(`Admin login failed: ${login.status} ${login.text.slice(0, 200)}`);
  }
  const token = login.json.token;
  const site = await requestJson(baseUrl, "POST", "/api/admin/site-content", { adminToken: token });
  if (site.status !== 200) {
    throw new Error(`site-content load failed: ${site.status}`);
  }
  const curriculum = site.json.curriculum || site.json.siteContent?.curriculum;
  const expectedUpdatedAt = site.json.updatedAt || site.json.siteContentUpdatedAt || "";
  const existing = (curriculum?.lessonPlans || []).find((plan) => plan.id === LESSON_ID);
  if (!existing) throw new Error(`Remote lesson ${LESSON_ID} not found`);
  const resourcesBefore = JSON.stringify(curriculum.resources || []);
  const before = snapshotLesson(existing, curriculum);
  const merged = mergeOntoExisting(existing, parsed);
  if (JSON.stringify(merged.resourceIds || []) !== JSON.stringify(existing.resourceIds || [])) {
    throw new Error("Refusing to change resourceIds");
  }
  const save = await requestJson(baseUrl, "POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: merged,
  });
  if (save.status !== 200) {
    throw new Error(`Save failed: ${save.status} ${save.text.slice(0, 400)}`);
  }
  const afterCurriculum = save.json.curriculum || curriculum;
  if (JSON.stringify(afterCurriculum.resources || []) !== resourcesBefore) {
    throw new Error("Remote resources changed unexpectedly");
  }
  const afterPlan = (afterCurriculum.lessonPlans || []).find((plan) => plan.id === LESSON_ID)
    || save.json.lessonPlan;
  const after = snapshotLesson(afterPlan, afterCurriculum);
  return { before, after, mode: "remote", baseUrl };
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
