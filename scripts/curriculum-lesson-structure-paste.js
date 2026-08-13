/**
 * Owner Admin — Paste Full Lesson Plan structure builder.
 *
 * Parses lesson-level headings + weekday activity name lists into the existing
 * canonical lesson/activity schema. Does not invent activity copy, images,
 * printables, or AI content. Does not publish.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHCurriculumLessonStructurePaste = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const WEEKDAY_LABEL = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  function pasteApi() {
    if (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPasteImport) {
      return globalThis.LLHTeachingKitPasteImport;
    }
    if (typeof require === "function") {
      try { return require("./teaching-kit-paste-import.js"); } catch (_error) { return null; }
    }
    return null;
  }

  function importParser() {
    if (typeof globalThis !== "undefined" && globalThis.CurriculumLessonImportParser) {
      return globalThis.CurriculumLessonImportParser;
    }
    if (typeof require === "function") {
      try { return require("./curriculum-lesson-import-parser.js"); } catch (_error) { return null; }
    }
    return null;
  }

  function text(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function normalizeHeading(raw) {
    const api = pasteApi();
    if (api && typeof api.normalizeHeading === "function") return api.normalizeHeading(raw);
    return text(raw)
      .toLowerCase()
      .replace(/[_/&]+/g, " ")
      .replace(/[:：]+$/g, "")
      .replace(/[–—−]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseWeekday(raw) {
    const api = pasteApi();
    if (api && typeof api.parseWeekday === "function") return api.parseWeekday(raw);
    const cleaned = text(raw).toLowerCase();
    if (WEEKDAYS.includes(cleaned)) return cleaned;
    const map = {
      mon: "monday",
      tue: "tuesday",
      tues: "tuesday",
      wed: "wednesday",
      thu: "thursday",
      thur: "thursday",
      thurs: "thursday",
      fri: "friday",
    };
    return map[cleaned] || "";
  }

  function normalizeMilestoneLabel(raw) {
    const api = pasteApi();
    if (api && typeof api.normalizeMilestoneLabel === "function") {
      return api.normalizeMilestoneLabel(raw);
    }
    return "";
  }

  function generateItemId() {
    const parser = importParser();
    if (parser && typeof parser.generateCurriculumItemId === "function") {
      return parser.generateCurriculumItemId();
    }
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      return `item-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    return `item-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  }

  function emptyDailyPlans() {
    const parser = importParser();
    if (parser && typeof parser.emptyCurriculumDailyPlans === "function") {
      return parser.emptyCurriculumDailyPlans();
    }
    const days = {};
    WEEKDAYS.forEach((day) => { days[day] = { items: [] }; });
    return days;
  }

  const LESSON_HEADING_ALIASES = Object.freeze({
    "lesson title": "title",
    title: "title",
    "age band": "age",
    "recommended age": "age",
    "age group": "age",
    age: "age",
    "weekly overview": "weeklyOverview",
    "week overview": "weeklyOverview",
    "learning objectives": "objectives",
    objectives: "objectives",
    materials: "weeklyMaterials",
    "materials list": "weeklyMaterials",
    "teacher preparation": "teacherPreparation",
    "teacher preparation / toolkit": "teacherPreparation",
    "teacher toolkit": "teacherPreparation",
    toolkit: "teacherPreparation",
    "prep checklist": "prepChecklist",
    "preparation checklist": "prepChecklist",
    "observation focus": "observationFocus",
    "observation focuses": "observationFocus",
    "weekly observation focus": "observationFocus",
    "family connection": "familyConnection",
    "family connections": "familyConnection",
    "family idea": "familyConnection",
    milestones: "milestones",
    "developmental milestones": "milestones",
    activities: "activities",
  });

  const LESSON_HEADING_BY_NORMALIZED = Object.freeze((() => {
    const out = {};
    Object.keys(LESSON_HEADING_ALIASES).forEach((key) => {
      out[normalizeHeading(key)] = LESSON_HEADING_ALIASES[key];
    });
    return out;
  })());

  function headingFieldId(label) {
    const normalized = normalizeHeading(label);
    if (Object.prototype.hasOwnProperty.call(LESSON_HEADING_BY_NORMALIZED, normalized)) {
      return LESSON_HEADING_BY_NORMALIZED[normalized];
    }
    const weekday = parseWeekday(normalized);
    if (weekday) return `weekday:${weekday}`;
    return "";
  }

  function splitStructureSections(pastedText) {
    const lines = String(pastedText || "").replace(/\r\n/g, "\n").split("\n");
    const sections = [];
    let current = null;
    const bodyLines = [];

    function flush() {
      if (!current) return;
      sections.push({
        headingRaw: current.headingRaw,
        fieldId: current.fieldId,
        body: bodyLines.join("\n").replace(/^\n+|\n+$/g, ""),
      });
      bodyLines.length = 0;
      current = null;
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      const headingMatch = trimmed.match(/^(.+?)\s*:\s*(.*)$/);
      if (headingMatch) {
        const labelPart = headingMatch[1];
        const rest = headingMatch[2];
        const fieldId = headingFieldId(labelPart);
        const looksLikeHeading = fieldId || (/^[A-Za-z][A-Za-z0-9 /&'-]{0,60}$/.test(labelPart) && rest === "");
        if (looksLikeHeading) {
          flush();
          current = { headingRaw: labelPart.trim(), fieldId: fieldId || "" };
          if (rest) bodyLines.push(rest);
          return;
        }
      }
      if (current) bodyLines.push(line);
      else if (trimmed) {
        sections.push({ headingRaw: "", fieldId: "", body: trimmed });
      }
    });
    flush();
    return sections;
  }

  function listLines(body) {
    return String(body || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
  }

  function mapAgeBand(raw) {
    const parser = importParser();
    if (parser && typeof parser.parseCurriculumImportAgeValue === "function") {
      const parsed = parser.parseCurriculumImportAgeValue(raw);
      const display = text(parsed?.display || "");
      const bucket = text(parsed?.bucket || "");
      return { display: display || bucket, bucket };
    }
    const value = text(raw);
    const lower = value.toLowerCase();
    if (lower.includes("infant")) return { display: value, bucket: "Infant" };
    if (lower.includes("toddler")) return { display: value, bucket: "Toddler" };
    if (lower.includes("preschool")) return { display: value, bucket: "Preschool" };
    return { display: "", bucket: "" };
  }

  function normalizeTitleKey(title) {
    return text(title).toLowerCase();
  }

  function parseFullLessonStructurePaste(pastedText, options = {}) {
    const generateId = typeof options.generateItemId === "function" ? options.generateItemId : generateItemId;
    const sections = splitStructureSections(pastedText);
    const unrecognized = [];
    const lesson = {
      title: "",
      age: "",
      ageDisplay: "",
      weeklyOverview: "",
      objectives: "",
      weeklyMaterials: "",
      teacherPreparation: "",
      prepChecklist: [],
      observationFocus: [],
      familyConnection: "",
      milestones: [],
      rejectedMilestones: [],
    };
    const dailyPlans = emptyDailyPlans();
    const usedItemIds = new Set();

    function uniqueItemId() {
      let id = generateId();
      while (usedItemIds.has(id)) id = generateId();
      usedItemIds.add(id);
      return id;
    }

    function addActivity(day, title) {
      const name = text(title);
      if (!name || !dailyPlans[day]) return;
      dailyPlans[day].items.push({
        itemId: uniqueItemId(),
        title: name,
        objective: "",
        description: "",
        materials: "",
        setup: "",
        steps: "",
        teacherRole: "",
        teacherLanguage: "",
        observationOpportunities: "",
        vocabulary: "",
        safetyNotes: "",
        familyConnection: "",
      });
    }

    sections.forEach((section) => {
      const fieldId = section.fieldId;
      const body = section.body || "";
      if (!fieldId) {
        if (text(body) || text(section.headingRaw)) {
          unrecognized.push({
            heading: section.headingRaw || "(untitled)",
            body: text(body).slice(0, 240),
          });
        }
        return;
      }
      if (fieldId === "title") lesson.title = text(body);
      else if (fieldId === "age") {
        const mapped = mapAgeBand(body);
        lesson.ageDisplay = mapped.display || mapped.bucket;
        lesson.age = mapped.display || mapped.bucket;
      } else if (fieldId === "weeklyOverview") lesson.weeklyOverview = String(body || "").trim();
      else if (fieldId === "objectives") lesson.objectives = listLines(body).join("\n");
      else if (fieldId === "weeklyMaterials") lesson.weeklyMaterials = listLines(body).join("\n");
      else if (fieldId === "teacherPreparation") lesson.teacherPreparation = String(body || "").trim();
      else if (fieldId === "prepChecklist") lesson.prepChecklist = listLines(body);
      else if (fieldId === "observationFocus") lesson.observationFocus = listLines(body);
      else if (fieldId === "familyConnection") lesson.familyConnection = String(body || "").trim();
      else if (fieldId === "milestones") {
        listLines(body).forEach((line) => {
          const mapped = normalizeMilestoneLabel(line);
          if (mapped) {
            if (!lesson.milestones.includes(mapped)) lesson.milestones.push(mapped);
          } else {
            lesson.rejectedMilestones.push(line);
          }
        });
      } else if (fieldId === "activities") {
        listLines(body).forEach((line) => {
          unrecognized.push({ heading: "Activities", body: line });
        });
      } else if (fieldId.startsWith("weekday:")) {
        const day = fieldId.slice("weekday:".length);
        listLines(body).forEach((line) => addActivity(day, line));
      }
    });

    const activities = [];
    WEEKDAYS.forEach((day) => {
      (dailyPlans[day].items || []).forEach((item) => {
        activities.push({ dayOfWeek: day, title: item.title, itemId: item.itemId });
      });
    });

    const errors = [];
    if (!lesson.title) errors.push("Lesson title is required.");
    if (!lesson.age) errors.push("Age band was not recognized.");

    return {
      ok: errors.length === 0,
      errors,
      unrecognized,
      lesson,
      dailyPlans,
      activities,
      activityCount: activities.length,
    };
  }

  function buildStructurePreview(parsed) {
    const lesson = parsed?.lesson || {};
    const byDay = {};
    WEEKDAYS.forEach((day) => {
      byDay[day] = (parsed?.dailyPlans?.[day]?.items || []).map((item) => item.title);
    });
    const recognized = {
      weeklyOverview: Boolean(text(lesson.weeklyOverview)),
      objectives: listLines(lesson.objectives).length,
      weeklyMaterials: listLines(lesson.weeklyMaterials).length,
      teacherPreparation: Boolean(text(lesson.teacherPreparation)),
      familyConnection: Boolean(text(lesson.familyConnection)),
      milestones: Array.isArray(lesson.milestones) ? lesson.milestones.length : 0,
      observationFocus: Array.isArray(lesson.observationFocus) ? lesson.observationFocus.length : 0,
      prepChecklist: Array.isArray(lesson.prepChecklist) ? lesson.prepChecklist.length : 0,
    };
    return {
      title: lesson.title || "",
      age: lesson.ageDisplay || lesson.age || "",
      recognized,
      byDay,
      activityCount: parsed?.activityCount || 0,
      unrecognized: parsed?.unrecognized || [],
      rejectedMilestones: lesson.rejectedMilestones || [],
      errors: parsed?.errors || [],
    };
  }

  function buildCanonicalLessonPlan(parsed, options = {}) {
    const lesson = parsed?.lesson || {};
    const now = options.now || new Date().toISOString();
    const id = text(options.id || "");
    const weekDraft = {};
    if (text(lesson.teacherPreparation)) weekDraft.teacherPreparation = lesson.teacherPreparation;
    if (lesson.prepChecklist?.length) {
      weekDraft.teacherToolkit = Object.assign({}, weekDraft.teacherToolkit, {
        prepChecklist: lesson.prepChecklist.slice(),
      });
    }
    if (lesson.observationFocus?.length) {
      weekDraft.teacherToolkit = Object.assign({}, weekDraft.teacherToolkit, {
        observationFocus: lesson.observationFocus.slice(),
      });
    }
    if (lesson.milestones?.length) weekDraft.milestones = lesson.milestones.slice();

    const plan = {
      title: lesson.title || "Untitled Lesson Plan",
      age: lesson.age || "Preschool",
      theme: "",
      plan: "Free",
      status: "draft",
      learningDomains: [],
      weeklyOverview: lesson.weeklyOverview || "",
      objectives: lesson.objectives || "",
      weeklyMaterials: lesson.weeklyMaterials || "",
      familyConnection: lesson.familyConnection || "",
      observationOpportunities: (lesson.observationFocus || []).join("\n"),
      vocabularyWords: "",
      adaptations: "",
      books: [],
      songs: [],
      dailyPlans: parsed?.dailyPlans || emptyDailyPlans(),
      resourceIds: [],
      createdAt: now,
      updatedAt: now,
    };
    if (id) plan.id = id;
    if (Object.keys(weekDraft).length) {
      plan.enrichmentDraft = {
        activities: {},
        week: weekDraft,
        updatedAt: now,
        lastEditedBy: text(options.lastEditedBy || ""),
        previewReady: false,
        completionPercent: 0,
      };
    }
    return plan;
  }

  function buildBlankLessonPlan(options = {}) {
    const now = options.now || new Date().toISOString();
    const plan = {
      title: text(options.title) || "New Lesson Plan",
      age: text(options.age) || "Preschool",
      theme: "",
      plan: "Free",
      status: "draft",
      learningDomains: [],
      weeklyOverview: "",
      objectives: "",
      weeklyMaterials: "",
      familyConnection: "",
      observationOpportunities: "",
      vocabularyWords: "",
      adaptations: "",
      books: [],
      songs: [],
      dailyPlans: emptyDailyPlans(),
      resourceIds: [],
      createdAt: now,
      updatedAt: now,
    };
    if (text(options.id)) plan.id = text(options.id);
    return plan;
  }

  function findDuplicateLessonTitle(title, existingPlans) {
    const key = normalizeTitleKey(title);
    if (!key) return null;
    const plans = Array.isArray(existingPlans) ? existingPlans : [];
    return plans.find((plan) => normalizeTitleKey(plan?.title) === key) || null;
  }

  return {
    WEEKDAYS,
    WEEKDAY_LABEL,
    LESSON_HEADING_ALIASES,
    normalizeTitleKey,
    mapAgeBand,
    parseFullLessonStructurePaste,
    buildStructurePreview,
    buildCanonicalLessonPlan,
    buildBlankLessonPlan,
    findDuplicateLessonTitle,
    generateItemId,
  };
});
