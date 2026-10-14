/**
 * Apply owner-reviewed organizer mapping to canonical lesson paste shape (draft only).
 */
"use strict";

const structurePaste = require("./curriculum-lesson-structure-paste.js");
const manifest = require("./lesson-paste-organizer-manifest.js");

function text(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function emptyDailyPlans() {
  const out = {};
  manifest.WEEKDAYS.forEach((day) => {
    out[day] = { theme: "", items: [] };
  });
  return out;
}

function firstLine(value) {
  return text(String(value || "").split("\n")[0], 200);
}

function restLines(value) {
  return String(value || "").split("\n").slice(1).join("\n").trim();
}

function applyOwnerDecisions(parseResult, decisions = {}) {
  const values = { ...(parseResult.values || {}) };
  const unsorted = [...(parseResult.report?.unsorted || [])];
  const resolvedUnsorted = [];

  unsorted.forEach((item) => {
    const choice = decisions[item.id];
    if (!choice || choice === "delete") return;
    if (choice === "unsorted") {
      resolvedUnsorted.push(item);
      return;
    }
    if (choice === "weeklyMaterials") {
      const prev = values["global.weeklyMaterials"]?.value || "";
      values["global.weeklyMaterials"] = { value: prev ? `${prev}\n\n${item.text}` : item.text, occurrences: [] };
      return;
    }
    if (choice === "books" || choice === "songs" || choice === "printables" || choice === "familyConnection") {
      const path = choice === "familyConnection" ? "global.familyConnection" : `global.weekly${choice.charAt(0).toUpperCase()}${choice.slice(1)}`;
      const prev = values[path]?.value || "";
      values[path] = { value: prev ? `${prev}\n\n${item.text}` : item.text, occurrences: [] };
      return;
    }
    if (manifest.WEEKDAYS.includes(choice)) {
      const path = `daily.${choice}.activity1`;
      if (!values[path]?.value) {
        values[path] = { value: item.text, occurrences: [] };
      } else {
        resolvedUnsorted.push({ ...item, reason: "day_activity_slot_full" });
      }
    }
  });

  return { values, unresolvedUnsorted: resolvedUnsorted };
}

function buildParsedShapeFromOrganizer(parseResult, options = {}) {
  const { values, unresolvedUnsorted } = applyOwnerDecisions(parseResult, options.ownerDecisions || {});
  const lesson = {
    title: text(values["global.title"]?.value, 200),
    theme: text(values["global.theme"]?.value, 200) || (options.themeMarkedUnknown ? "Unknown" : ""),
    age: text(values["global.ageGroup"]?.value, 120) || (options.ageMarkedUnknown ? "Unknown" : ""),
    weeklyOverview: text(values["global.weeklyFocus"]?.value, 4000),
    objectives: text(values["global.weeklyObjectives"]?.value, 4000),
    weeklyMaterials: text(values["global.weeklyMaterials"]?.value, 4000),
    teacherPreparation: text(values["global.weeklyPreparation"]?.value, 4000),
    familyConnection: text(values["global.familyConnection"]?.value, 4000),
    prepChecklist: [],
    observationFocus: text(values["global.weeklySafety"]?.value, 2000) ? [values["global.weeklySafety"].value] : [],
    milestones: [],
    rejectedMilestones: [],
    coverImageUrl: "",
    coverManualUpload: text(values["global.cover"]?.value, 500)
      ? { reason: "Cover text supplied — upload in Visual Production.", raw: values["global.cover"].value }
      : null,
  };

  const dailyPlans = emptyDailyPlans();
  const generateId = structurePaste.generateItemId || (() => `cur-act-${Date.now()}`);

  manifest.WEEKDAYS.forEach((day) => {
    ["activity1", "activity2", "activity3"].forEach((slot) => {
      const raw = values[`daily.${day}.${slot}`]?.value;
      if (!raw) return;
      const title = firstLine(raw);
      if (!title) return;
      const durationRaw = text(values[`daily.${day}.durationMinutes`]?.value, 40);
      const durationMatch = durationRaw.match(/(\d+)/);
      const item = {
        itemId: generateId(),
        title,
        objective: text(values[`daily.${day}.dailyObjective`]?.value, 800),
        description: text(values[`daily.${day}.dailyFocus`]?.value, 4000)
          || text(values[`daily.${day}.directions`]?.value, 4000),
        materials: text(values[`daily.${day}.materials`]?.value, 2000) || text(lesson.weeklyMaterials, 500),
        preparation: text(values[`daily.${day}.preparation`]?.value, 2000),
        setup: text(values[`daily.${day}.setup`]?.value, 2000),
        steps: text(values[`daily.${day}.directions`]?.value, 4000) || restLines(raw),
        teacherLanguage: text(values[`daily.${day}.teacherQuestions`]?.value, 2000),
        observationOpportunities: text(values[`daily.${day}.observation`]?.value, 2000),
        safetyNotes: text(values[`daily.${day}.safety`]?.value, 2000),
        vocabulary: text(values[`daily.${day}.vocabulary`]?.value, 1000),
        cleanupTips: text(values[`daily.${day}.cleanup`]?.value, 1000),
        indoorAlternatives: text(values[`daily.${day}.indoorAlternative`]?.value, 2000),
        outdoorAlternatives: text(values[`daily.${day}.outdoorAlternative`]?.value, 2000),
        adaptations: text(values[`daily.${day}.supportModification`]?.value, 2000),
        extensions: text(values[`daily.${day}.challengeExtension`]?.value, 2000),
        mixedAgeAdaptations: text(values[`daily.${day}.mixedAgeAdaptation`]?.value, 2000),
      };
      if (text(values[`daily.${day}.activityCategory`]?.value)) {
        item.activityCategory = text(values[`daily.${day}.activityCategory`].value, 500);
      }
      if (text(values[`daily.${day}.ageModifications`]?.value)) {
        item.ageModifications = text(values[`daily.${day}.ageModifications`].value, 200);
      }
      if (durationMatch) item.durationMinutes = Number(durationMatch[1]);
      if (text(values[`daily.${day}.imageRequirement`]?.value)) {
        item.imageRequirement = text(values[`daily.${day}.imageRequirement`].value, 200);
      }
      if (text(values[`daily.${day}.imageBriefSetup`]?.value)) {
        item.imageBriefSetup = text(values[`daily.${day}.imageBriefSetup`].value, 2000);
      }
      if (text(values[`daily.${day}.imageBriefExample`]?.value)) {
        item.imageBriefExample = text(values[`daily.${day}.imageBriefExample`].value, 2000);
      }
      dailyPlans[day].items.push(item);
    });
  });

  const books = (parseResult.books || []).map((b) => ({
    title: b.title || firstLine(b.body),
    body: b.body,
    assignedDay: b.assignedDay || "",
  }));
  const songs = (parseResult.songs || []).map((s) => ({
    title: s.title || firstLine(s.body),
    body: s.body,
    assignedDay: s.assignedDay || "",
  }));
  const printableIdeas = (parseResult.printables || []).map((p) => ({
    title: p.title || firstLine(p.body),
    body: p.body,
    assignedDay: p.assignedDay || "",
  }));

  return {
    lesson,
    dailyPlans,
    books,
    songs,
    printableIdeas,
    unrecognized: unresolvedUnsorted.map((u) => ({ heading: u.heading, body: u.text })),
    errors: [],
    importHistory: {
      kind: "paste_organize",
      manifestVersion: parseResult.manifestVersion,
      originalPaste: parseResult.originalText,
      savedAt: options.now || new Date().toISOString(),
      mappedFieldPaths: Object.keys(values),
    },
  };
}

function validateBeforeSave(parseResult, options = {}) {
  const issues = [];
  if (!parseResult?.values?.["global.title"]?.value) issues.push({ code: "missing_title", message: "Title is required." });
  const age = parseResult?.values?.["global.ageGroup"]?.value;
  const theme = parseResult?.values?.["global.theme"]?.value;
  if (!age && !options.ageMarkedUnknown) issues.push({ code: "missing_age", message: "Age group is required or mark unknown." });
  if (!theme && !options.themeMarkedUnknown) issues.push({ code: "missing_theme", message: "Theme is required or mark unknown." });
  (parseResult.report?.conflicts || []).forEach((c) => {
    issues.push({ code: "conflict", message: `Conflict at ${c.path || c.type}` });
  });
  (parseResult.report?.unsorted || []).forEach((u) => {
    const decision = options.ownerDecisions?.[u.id];
    if (!decision || decision === "unsorted") {
      issues.push({ code: "unsorted", message: `Unsorted content at line ${u.line}` });
    }
  });
  (parseResult.report?.unresolvedDates || []).forEach((d) => {
    issues.push({ code: "unresolved_date", message: d.text });
  });
  return { ok: issues.length === 0, issues };
}

function buildDraftLessonPlan(parseResult, options = {}) {
  const validation = validateBeforeSave(parseResult, options);
  if (!validation.ok) {
    return { ok: false, validation, lessonPlan: null };
  }
  const parsed = buildParsedShapeFromOrganizer(parseResult, options);
  const lessonPlan = structurePaste.buildCanonicalLessonPlan(parsed, {
    id: options.id,
    now: options.now,
  });
  lessonPlan.pasteOrganizerImport = parsed.importHistory;
  if (lessonPlan.enrichmentDraft && typeof lessonPlan.enrichmentDraft === "object") {
    lessonPlan.enrichmentDraft.pasteOrganizerImport = parsed.importHistory;
  }
  lessonPlan.status = "draft";
  lessonPlan.publishedAt = null;
  return { ok: true, validation, parsed, lessonPlan };
}

/** Same section order as the lesson editor (deterministic, no invented text). */
function buildStructurePreview(parseResult, options = {}) {
  const parsed = buildParsedShapeFromOrganizer(parseResult, options);
  const warn = (label, reason) => ({ label, value: "", warning: reason });
  const field = (label, value, missingReason) => {
    const v = text(value, 500);
    return v ? { label, value: v, warning: "" } : warn(label, missingReason || "missing");
  };

  const overview = [
    field("Title", parsed.lesson.title, "required — title missing"),
    field("Theme", parsed.lesson.theme, "required or mark unknown"),
    field("Age group", parsed.lesson.age, "required or mark unknown"),
    field("Weekly objectives", parsed.lesson.objectives),
    field("Weekly materials", parsed.lesson.weeklyMaterials),
    field("Family connection", parsed.lesson.familyConnection),
    field("Safety", (parsed.lesson.observationFocus || [])[0]),
    field("Teacher notes", parseResult.values?.["global.teacherNotes"]?.value),
    parsed.lesson.coverManualUpload?.raw
      ? field("Cover image instructions", parsed.lesson.coverManualUpload.raw)
      : field("Cover image instructions", parseResult.values?.["global.cover"]?.value),
  ];

  const days = manifest.WEEKDAYS.map((day) => {
    const plan = parsed.dailyPlans[day] || { items: [] };
    const activities = (plan.items || []).flatMap((item, index) => {
      const prefix = `Activity ${index + 1}`;
      const rows = [field(`${prefix} — Title`, item.title, "activity needs a title")];
      if (text(item.objective)) rows.push(field(`${prefix} — Objective`, item.objective));
      if (text(item.materials)) rows.push(field(`${prefix} — Materials`, item.materials));
      if (text(item.preparation)) rows.push(field(`${prefix} — Preparation`, item.preparation));
      if (text(item.steps)) rows.push(field(`${prefix} — Instructions`, item.steps));
      if (text(item.safetyNotes)) rows.push(field(`${prefix} — Safety`, item.safetyNotes));
      if (text(item.ageModifications)) rows.push(field(`${prefix} — Recommended age`, item.ageModifications));
      if (item.durationMinutes != null && item.durationMinutes !== "") {
        rows.push(field(`${prefix} — Duration`, `${item.durationMinutes} minutes`));
      }
      if (text(item.observationOpportunities)) {
        rows.push(field(`${prefix} — Observation`, item.observationOpportunities));
      }
      if (text(item.imageRequirement)) rows.push(field(`${prefix} — Image requirement`, item.imageRequirement));
      if (text(item.imageBriefSetup)) rows.push(field(`${prefix} — Setup image brief`, item.imageBriefSetup));
      if (text(item.imageBriefExample)) {
        rows.push(field(`${prefix} — Finished example brief`, item.imageBriefExample));
      }
      if (text(item.activityCategory)) rows.push(field(`${prefix} — Category`, item.activityCategory));
      return rows;
    });
    return {
      day,
      activities: activities.length ? activities : [warn("Activities", "no labeled activities for this day")],
    };
  });

  const conflictFields = (parseResult.report?.conflicts || []).map((c) => field(
    `Conflict — ${c.path || c.type}`,
    (c.values || []).join(" | "),
    "resolve before save",
  ));
  const unsupportedFields = (parseResult.report?.unsupportedStorage || []).map((row) => field(
    row.label || "Unsupported",
    row.detail || "",
    "not stored in lesson schema",
  ));

  return {
    sections: [
      { id: "overview", title: "Overview", fields: overview },
      ...(conflictFields.length ? [{ id: "conflicts", title: "Conflicts", fields: conflictFields }] : []),
      ...(unsupportedFields.length ? [{ id: "unsupported", title: "Unsupported", fields: unsupportedFields }] : []),
      ...days.map((d) => ({
        id: d.day,
        title: d.day.charAt(0).toUpperCase() + d.day.slice(1),
        fields: d.activities,
      })),
      {
        id: "books",
        title: "Books",
        fields: parsed.books.length
          ? parsed.books.map((b) => field(b.title || "Book", b.body))
          : [warn("Books", "optional — none mapped")],
      },
      {
        id: "songs",
        title: "Songs",
        fields: parsed.songs.length
          ? parsed.songs.map((s) => field(s.title || "Song", s.body))
          : [warn("Songs", "optional — none mapped")],
      },
      {
        id: "printables",
        title: "Printables",
        fields: parsed.printableIdeas.length
          ? parsed.printableIdeas.map((p) => field(p.title || "Printable", p.body))
          : [warn("Printables", "optional — none mapped")],
      },
      {
        id: "family",
        title: "Family Activities",
        fields: [field("Family connection", parsed.lesson.familyConnection)],
      },
      {
        id: "materials",
        title: "Materials",
        fields: [field("Weekly materials", parsed.lesson.weeklyMaterials)],
      },
      {
        id: "safety",
        title: "Safety",
        fields: [field("Weekly safety", (parsed.lesson.observationFocus || [])[0])],
      },
      {
        id: "teacherNotes",
        title: "Teacher Notes",
        fields: [field("Notes", parseResult.values?.["global.teacherNotes"]?.value)],
      },
    ],
  };
}

function buildPrintPreviewHtml(parseResult, options = {}) {
  const preview = buildStructurePreview(parseResult, options);
  const sections = preview.sections.map((section) => {
    const rows = section.fields.map((f) => {
      const warnMark = f.warning ? ` <span class="warn">⚠ ${f.warning}</span>` : "";
      const body = f.value ? `<div class="value">${String(f.value).replace(/</g, "&lt;")}</div>` : "";
      return `<div class="field"><strong>${section.title} — ${f.label}</strong>${warnMark}${body}</div>`;
    }).join("");
    return `<section><h2>${section.title}</h2>${rows}</section>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Lesson paste preview</title>
<style>body{font-family:system-ui,sans-serif;margin:1.5rem;max-width:48rem} h2{text-transform:capitalize;border-bottom:1px solid #ccc}
.warn{color:#a40;font-size:0.9rem}.value{white-space:pre-wrap;margin:0.25rem 0 1rem}</style></head>
<body><h1>Paste &amp; Organize — Print Preview (draft)</h1>${sections}</body></html>`;
}

const api = {
  applyOwnerDecisions,
  buildParsedShapeFromOrganizer,
  validateBeforeSave,
  buildDraftLessonPlan,
  buildStructurePreview,
  buildPrintPreviewHtml,
};
module.exports = api;
if (typeof globalThis !== "undefined") globalThis.LLHLessonPasteOrganizerApply = api;
