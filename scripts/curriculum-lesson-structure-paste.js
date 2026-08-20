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

  function weekKitApi() {
    if (typeof globalThis !== "undefined" && globalThis.LLHCurriculumWeekKitPaste) {
      return globalThis.LLHCurriculumWeekKitPaste;
    }
    if (typeof require === "function") {
      try { return require("./curriculum-week-kit-paste.js"); } catch (_error) { return null; }
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
    return parseWeekdayExact(raw);
  }

  function parseWeekdayExact(raw) {
    const cleaned = text(raw).toLowerCase().replace(/[:：]+$/g, "");
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

  /** @typedef {{ display: string, bucket: string }} CanonicalAgeBand */

  const CANONICAL_AGE_BANDS = Object.freeze([
    Object.freeze({ display: "Infant 0–6 Months", bucket: "Infant" }),
    Object.freeze({ display: "Infant 6–12 Months", bucket: "Infant" }),
    Object.freeze({ display: "Infant", bucket: "Infant" }),
    Object.freeze({ display: "Toddler 12–24 Months", bucket: "Toddler" }),
    Object.freeze({ display: "Toddler 24–36 Months", bucket: "Toddler" }),
    Object.freeze({ display: "Toddler", bucket: "Toddler" }),
    Object.freeze({ display: "Preschool 3–4 Years", bucket: "Preschool" }),
    Object.freeze({ display: "Preschool 4–5 Years", bucket: "Preschool" }),
    Object.freeze({ display: "Preschool", bucket: "Preschool" }),
  ]);

  const CANONICAL_AGE_BAND_LABELS = Object.freeze(CANONICAL_AGE_BANDS.map((entry) => entry.display));

  const LESSON_HEADING_ALIASES = Object.freeze({
    "lesson plan name": "title",
    "lesson name": "title",
    "lesson title": "title",
    "lesson plan title": "title",
    "plan title": "title",
    title: "title",
    theme: "theme",
    "weekly theme": "theme",
    "unit theme": "theme",
    "age band": "age",
    "age range": "age",
    "recommended age": "age",
    "age group": "age",
    ages: "age",
    "developmental age": "age",
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
    books: "books",
    book: "books",
    "book title": "books",
    songs: "songs",
    song: "songs",
    "song title": "songs",
    "printable ideas": "printableIdeas",
    "printable idea": "printableIdeas",
    "idea title": "printableIdeas",
    "linked resources": "linkedResources",
    "linked resource": "linkedResources",
    "resource title": "linkedResources",
    "cover image": "coverImageUrl",
    "cover image url": "coverImageUrl",
    "cover photo": "coverImageUrl",
    "cover photo url": "coverImageUrl",
    "lesson cover": "coverImageUrl",
    "lesson cover url": "coverImageUrl",
    "cover alt": "coverImageAlt",
    "cover alt text": "coverImageAlt",
    "cover image alt": "coverImageAlt",
    "image position": "coverImagePosition",
    "cover image position": "coverImagePosition",
    "cover quality": "coverQualityStatus",
    "printable name": "pendingPrintables",
    "printable title": "pendingPrintables",
    "linked printable": "linkedResources",
    "printable link": "pendingPrintables",
    "resource id": "linkedResources",
    "book prompts": "bookPrompts",
    "book prompt": "bookPrompts",
  });

  const NESTED_BODY_HEADINGS = Object.freeze(new Set([
    "activity name", "name", "weekday", "activity weekday", "category", "developmental domain",
    "category/domain", "category domain",
    "category/developmental domain", "category / developmental domain", "category developmental domain",
    "recommended age", "age",
    "estimated duration", "duration", "activity objective", "objective", "what children will do", "materials",
    "teacher preparation", "teacher prep", "setup", "step-by-step directions", "step by step directions", "steps",
    "suggested questions to ask", "suggested questions", "questions",
    "learning and observation focus", "observation focus",
    "safety and supervision", "safety", "cleanup", "indoor option", "indoor", "outdoor option", "outdoor",
    "indoor/outdoor options", "indoor outdoor options",
    "teacher tips", "tips", "supply substitutions", "substitutions", "support adaptations", "added challenge",
    "mixed-age adaptations", "mixed age adaptations", "mixed-age", "observation prompts", "vocabulary",
    "vocabulary words", "image requirement", "image request", "setup example brief", "finished example brief",
    "setup image", "setup image url", "setup photo", "setup photo url", "example image", "example image url", "example images",
    "finished example image", "finished example photo", "author", "why this book", "book questions", "discussion questions",
    "lyrics", "song lyrics", "how to use", "tune", "song url", "book url", "teacher directions", "instructions",
    "purpose / description", "purpose", "notes", "type", "rights status", "rights / licensing",
    "day association", "teacher notes", "printable description", "printable pdf",
    "printable cover image url", "resource placement",
  ]));

  const LESSON_HEADING_BY_NORMALIZED = Object.freeze((() => {
    const out = {};
    Object.keys(LESSON_HEADING_ALIASES).forEach((key) => {
      out[normalizeHeading(key)] = LESSON_HEADING_ALIASES[key];
    });
    return out;
  })());

  const NESTED_BODY_HEADING_NORMALIZED = Object.freeze((() => {
    const out = new Set();
    NESTED_BODY_HEADINGS.forEach((key) => out.add(normalizeHeading(key)));
    return out;
  })());

  function normalizePasteHeading(raw) {
    return normalizeHeading(raw);
  }

  function headingFieldId(label) {
    const normalized = normalizePasteHeading(label);
    if (Object.prototype.hasOwnProperty.call(LESSON_HEADING_BY_NORMALIZED, normalized)) {
      return LESSON_HEADING_BY_NORMALIZED[normalized];
    }
    const weekday = parseWeekdayExact(normalized);
    if (weekday) return `weekday:${weekday}`;
    return "";
  }

  function isActivityStartHeading(label) {
    const key = normalizePasteHeading(label);
    return key === "activity name" || key === "name";
  }

  function isNestedBodyHeading(label) {
    const normalized = normalizePasteHeading(label);
    if (NESTED_BODY_HEADING_NORMALIZED.has(normalized)) return true;
    const kit = weekKitApi();
    if (kit && kit.ACTIVITY_ITEM_ALIASES && Object.prototype.hasOwnProperty.call(kit.ACTIVITY_ITEM_ALIASES, normalized)) {
      return true;
    }
    return false;
  }

  function isActivityFieldHeading(label) {
    return isActivityStartHeading(label) || isNestedBodyHeading(label);
  }

  function structureParserState(current) {
    if (isInsideActivityBlock(current)) return "ACTIVITY";
    return "TOP_LEVEL_LESSON";
  }

  function stripHeadingDecorators(raw) {
    return String(raw || "")
      .trim()
      .replace(/^#+\s*/, "")
      .replace(/^\*\*(.+?)\*\*$/, "$1")
      .replace(/^[_*]+|[_*]+$/g, "")
      .trim();
  }

  function looksLikeBareHeadingCandidate(trimmed) {
    if (!trimmed || trimmed.length > 80) return false;
    if (/[.!?]$/.test(trimmed)) return false;
    if (trimmed.split(/\s+/).length > 8) return false;
    return /^[A-Za-z][A-Za-z0-9 /&'’:,-]*$/.test(trimmed);
  }

  function parseStructureHeadingLine(trimmed) {
    const cleaned = stripHeadingDecorators(trimmed);
    if (!cleaned) return null;
    const headingMatch = cleaned.match(/^(.{1,80}?)\s*:\s*(.*)$/);
    if (headingMatch) {
      const labelPart = headingMatch[1].trim();
      const rest = headingMatch[2];
      const fieldId = headingFieldId(labelPart);
      const nestedKeep = isNestedBodyHeading(labelPart);
      const isActivityStart = isActivityStartHeading(labelPart);
      if (fieldId || nestedKeep || isActivityStart || (/^[A-Za-z][A-Za-z0-9 /&'-]{0,60}$/.test(labelPart) && rest === "")) {
        return { labelPart, rest, fieldId, nestedKeep, isActivityStart };
      }
    }
    if (!looksLikeBareHeadingCandidate(cleaned)) return null;
    const labelPart = cleaned.replace(/[:：]+$/g, "").trim();
    const fieldId = headingFieldId(labelPart);
    const nestedKeep = isNestedBodyHeading(labelPart);
    const isActivityStart = isActivityStartHeading(labelPart);
    if (!fieldId && !nestedKeep && !isActivityStart) return null;
    return { labelPart, rest: "", fieldId, nestedKeep, isActivityStart };
  }

  function isInsideWeekdaySection(current) {
    return Boolean(current?.fieldId && String(current.fieldId).startsWith("weekday:"));
  }

  function isInsideActivityBlock(current) {
    return current?.fieldId === "activityBlock";
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

    function startSection(headingRaw, fieldId, rest) {
      flush();
      current = { headingRaw, fieldId: fieldId || "" };
      if (rest) bodyLines.push(rest);
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      const heading = parseStructureHeadingLine(trimmed);
      if (heading) {
        const { labelPart, rest, fieldId, nestedKeep, isActivityStart } = heading;
        const parserState = structureParserState(current);

        if (parserState === "ACTIVITY") {
          if (isActivityStart) {
            startSection(labelPart, "activityBlock", rest);
            return;
          }
          // Activity fields stay on the current activity, even when the same
          // heading is also a top-level lesson field (Age, Materials, Observation focus).
          if (isActivityFieldHeading(labelPart) || fieldId.startsWith("weekday:")) {
            bodyLines.push(line);
            return;
          }
          if (fieldId) {
            startSection(labelPart, fieldId, rest);
            return;
          }
          bodyLines.push(line);
          return;
        }

        if (isActivityStart && !isInsideWeekdaySection(current)) {
          startSection(labelPart, "activityBlock", rest);
          return;
        }

        if (fieldId) {
          if (nestedKeep && isInsideWeekdaySection(current)) {
            bodyLines.push(line);
            return;
          }
          startSection(labelPart, fieldId, rest);
          return;
        }

        if (nestedKeep && isInsideWeekdaySection(current)) {
          bodyLines.push(line);
          return;
        }

        if (!nestedKeep && rest === "") {
          startSection(labelPart, "", "");
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

  /**
   * Collapse human-readable age wording for unique alias lookup.
   * Does not fuzzy-match or guess across overlapping bands.
   * @param {unknown} raw
   * @returns {string}
   */
  function normalizeAgeAliasKey(raw) {
    return String(raw == null ? "" : raw)
      .trim()
      .toLowerCase()
      .replace(/[–—−]/g, "-")
      .replace(/[_/:：,()]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * @param {string} key
   * @returns {{ family: "" | "infant" | "toddler" | "preschool", start: string, end: string, unit: "" | "month" | "year" }}
   */
  function parseAgeAliasParts(key) {
    const family = /\binfants?\b/.test(key)
      ? "infant"
      : /\btoddlers?\b/.test(key)
        ? "toddler"
        : /\bpre-?schools?\b|\bpre-?k\b|\bprek\b/.test(key)
          ? "preschool"
          : "";
    const range = key.match(/(\d+)\s*-\s*(\d+)\s*(months?|years?|m|y)?\b/);
    if (!range) return { family, start: "", end: "", unit: "" };
    const unitRaw = String(range[3] || "");
    const unit = /^(m|month|months)$/.test(unitRaw) ? "month" : /^(y|year|years)$/.test(unitRaw) ? "year" : "";
    return { family, start: range[1], end: range[2], unit };
  }

  /**
   * Unique range fingerprints for existing canonical bands only.
   * @type {Readonly<Record<string, string>>}
   */
  const UNIQUE_AGE_RANGE_TO_DISPLAY = Object.freeze({
    "0-6": "Infant 0–6 Months",
    "0-6|month": "Infant 0–6 Months",
    "6-12": "Infant 6–12 Months",
    "6-12|month": "Infant 6–12 Months",
    "12-24": "Toddler 12–24 Months",
    "12-24|month": "Toddler 12–24 Months",
    "1-2|year": "Toddler 12–24 Months",
    "24-36": "Toddler 24–36 Months",
    "24-36|month": "Toddler 24–36 Months",
    "2-3|year": "Toddler 24–36 Months",
    "3-4": "Preschool 3–4 Years",
    "3-4|year": "Preschool 3–4 Years",
    "4-5": "Preschool 4–5 Years",
    "4-5|year": "Preschool 4–5 Years",
  });

  const FAMILY_ONLY_AGE_DISPLAY = Object.freeze({
    infant: "Infant",
    toddler: "Toddler",
    preschool: "Preschool",
  });

  const DISPLAY_TO_BAND = Object.freeze((() => {
    const out = {};
    CANONICAL_AGE_BANDS.forEach((entry) => {
      out[entry.display] = entry;
    });
    return out;
  })());

  /**
   * Map human-readable age wording onto an existing canonical LLH age band.
   * Returns empty display when the value is missing, unknown, or ambiguous.
   * @param {unknown} raw
   * @returns {{ display: string, bucket: string, raw: string }}
   */
  function resolveAgeBandAlias(raw) {
    const original = text(raw);
    if (!original) return { display: "", bucket: "", raw: original };
    const key = normalizeAgeAliasKey(original);
    const exactCanonical = CANONICAL_AGE_BANDS.find((entry) => (
      normalizeAgeAliasKey(entry.display) === key
      || normalizeAgeAliasKey(entry.display.replace(/–/g, "-")) === key
    ));
    if (exactCanonical) return { display: exactCanonical.display, bucket: exactCanonical.bucket, raw: original };

    const parts = parseAgeAliasParts(key);
    if (parts.start && parts.end) {
      const rangeKey = `${parts.start}-${parts.end}`;
      const unitKey = parts.unit ? `${rangeKey}|${parts.unit}` : rangeKey;
      const display = UNIQUE_AGE_RANGE_TO_DISPLAY[unitKey] || "";
      if (!display) return { display: "", bucket: "", raw: original };
      const band = DISPLAY_TO_BAND[display];
      if (!band) return { display: "", bucket: "", raw: original };
      if (parts.family && parts.family !== band.bucket.toLowerCase()) {
        return { display: "", bucket: "", raw: original };
      }
      return { display: band.display, bucket: band.bucket, raw: original };
    }
    if (parts.family && FAMILY_ONLY_AGE_DISPLAY[parts.family]) {
      const display = FAMILY_ONLY_AGE_DISPLAY[parts.family];
      const band = DISPLAY_TO_BAND[display];
      return band
        ? { display: band.display, bucket: band.bucket, raw: original }
        : { display: "", bucket: "", raw: original };
    }
    return { display: "", bucket: "", raw: original };
  }

  function mapAgeBand(raw) {
    const mapped = resolveAgeBandAlias(raw);
    return { display: mapped.display, bucket: mapped.bucket, raw: mapped.raw };
  }

  function unrecognizedAgeBandError(raw) {
    const pasted = text(raw);
    const choices = CANONICAL_AGE_BAND_LABELS.join("\n");
    if (pasted) {
      return `Could not recognize age band “${pasted}”.\nChoose one of:\n${choices}`;
    }
    return `Age band was not recognized.\nChoose one of:\n${choices}`;
  }

  function isPlaceholderPasteValue(raw) {
    const kit = weekKitApi();
    if (kit && typeof kit.isPlaceholderPasteValue === "function") return kit.isPlaceholderPasteValue(raw);
    const value = text(raw).toLowerCase().replace(/[.]+$/g, "");
    return !value || /^(none|none yet|n\/a|na|not yet|n a|no image required yet)$/.test(value);
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
      theme: "",
      age: "",
      ageDisplay: "",
      ageRaw: "",
      weeklyOverview: "",
      objectives: "",
      weeklyMaterials: "",
      teacherPreparation: "",
      prepChecklist: [],
      observationFocus: [],
      familyConnection: "",
      milestones: [],
      rejectedMilestones: [],
      coverImageUrl: "",
      coverImageAlt: "",
      coverImagePosition: "",
      coverQualityStatus: "",
      coverManualUpload: null,
    };
    const dailyPlans = emptyDailyPlans();
    const usedItemIds = new Set();
    const kit = weekKitApi();
    const bookBodies = [];
    const songBodies = [];
    const ideaBodies = [];
    const linkedBodies = [];
    const pendingPrintableBodies = [];
    const kitUnsupported = [];

    function uniqueItemId() {
      let id = generateId();
      while (usedItemIds.has(id)) id = generateId();
      usedItemIds.add(id);
      return id;
    }

    function addActivity(day, titleOrFields) {
      const fields = titleOrFields && typeof titleOrFields === "object"
        ? titleOrFields
        : { title: titleOrFields };
      const name = text(fields.title);
      if (!name || !dailyPlans[day]) return;
      const item = {
        itemId: uniqueItemId(),
        title: name,
        objective: text(fields.objective),
        description: String(fields.description || "").trim(),
        materials: String(fields.materials || "").trim(),
        setup: String(fields.setup || "").trim(),
        steps: String(fields.steps || "").trim(),
        teacherRole: "",
        teacherLanguage: String(fields.teacherLanguage || "").trim(),
        observationOpportunities: String(fields.observationOpportunities || "").trim(),
        vocabulary: String(fields.vocabulary || "").trim(),
        safetyNotes: String(fields.safetyNotes || "").trim(),
        familyConnection: "",
      };
      [
        "activityCategory", "ageModifications", "durationMinutes", "preparation",
        "cleanupTips", "indoorAlternatives", "outdoorAlternatives", "adaptations",
        "extensions", "mixedAgeAdaptations",
      ].forEach((key) => {
        if (String(fields[key] || "").trim()) item[key] = String(fields[key]).trim();
      });
      if (Array.isArray(fields.teacherTips) && fields.teacherTips.length) item.teacherTips = fields.teacherTips.slice();
      if (Array.isArray(fields.observationPrompts) && fields.observationPrompts.length) {
        item.observationPrompts = fields.observationPrompts.slice();
      }
      if (text(fields.imageRequirement)) item.imageRequirement = text(fields.imageRequirement);
      if (String(fields.imageBriefSetup || "").trim()) item.imageBriefSetup = String(fields.imageBriefSetup).trim();
      if (String(fields.imageBriefExample || "").trim()) item.imageBriefExample = String(fields.imageBriefExample).trim();
      if (Array.isArray(fields.substitutions) && fields.substitutions.length) {
        item.substitutions = fields.substitutions.slice();
      }
      if (fields.durationMinutes != null && fields.durationMinutes !== "") {
        item.durationMinutes = fields.durationMinutes;
      }
      if (fields.setupImageUpload) item.setupImageUpload = fields.setupImageUpload;
      if (fields.exampleImageUpload) item.exampleImageUpload = fields.exampleImageUpload;
      dailyPlans[day].items.push(item);
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
      if (fieldId === "title") {
        const nextTitle = text(body);
        if (nextTitle) lesson.title = nextTitle;
      } else if (fieldId === "theme") {
        const nextTheme = text(body);
        if (nextTheme) lesson.theme = nextTheme;
      } else if (fieldId === "age") {
        const mapped = mapAgeBand(body);
        lesson.ageRaw = mapped.raw || text(body);
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
      } else if (fieldId === "bookPrompts") {
        unrecognized.push({
          heading: section.headingRaw || "Book prompts",
          body: (text(body) || "Book prompts is not a stored book field.").slice(0, 240),
        });
      } else if (fieldId === "books") {
        const packed = kit && typeof kit.labeledSectionBody === "function"
          ? kit.labeledSectionBody(section)
          : `${section.headingRaw}:\n${body}`;
        if (String(packed || "").trim()) bookBodies.push(packed);
      } else if (fieldId === "songs") {
        const packed = kit && typeof kit.labeledSectionBody === "function"
          ? kit.labeledSectionBody(section)
          : `${section.headingRaw}:\n${body}`;
        if (String(packed || "").trim()) songBodies.push(packed);
      } else if (fieldId === "printableIdeas") {
        const packed = kit && typeof kit.labeledSectionBody === "function"
          ? kit.labeledSectionBody(section)
          : `${section.headingRaw}:\n${body}`;
        if (String(packed || "").trim()) ideaBodies.push(packed);
      } else if (fieldId === "linkedResources") {
        if (!isPlaceholderPasteValue(body)) {
          const packed = kit && typeof kit.labeledSectionBody === "function"
            ? kit.labeledSectionBody(section)
            : `${section.headingRaw}:\n${body}`;
          if (String(packed || "").trim()) linkedBodies.push(packed);
        }
      } else if (fieldId === "activityBlock") {
        if (kit && typeof kit.parseStructuredActivities === "function") {
          const source = `Activity name:\n${body}`;
          const parsedDay = kit.parseStructuredActivities(source, "");
          (parsedDay.records || []).forEach((record) => {
            const day = parseWeekdayExact(record.dayOfWeek);
            if (day) addActivity(day, record);
            else {
              unrecognized.push({
                heading: record.title || section.headingRaw || "Activity",
                body: "Activity weekday was missing. Add Monday–Friday so this activity can be placed.",
              });
            }
          });
          (parsedDay.unsupported || []).forEach((row) => kitUnsupported.push(row));
        } else if (text(body)) {
          unrecognized.push({ heading: section.headingRaw || "Activity name", body: text(body).slice(0, 240) });
        }
      } else if (fieldId === "pendingPrintables") {
        pendingPrintableBodies.push(`${section.headingRaw}:\n${body}`);
      } else if (fieldId === "coverImageUrl") {
        if (kit && typeof kit.parseCoverOrUrl === "function") {
          const cover = kit.parseCoverOrUrl(body);
          if (cover.ok) lesson.coverImageUrl = cover.url;
          else if (cover.manualUpload) lesson.coverManualUpload = cover;
        }
      } else if (fieldId === "coverImageAlt") {
        lesson.coverImageAlt = text(body);
      } else if (fieldId === "coverImagePosition") {
        const pos = text(body).toLowerCase();
        if (["center", "top", "bottom", "left", "right"].includes(pos)) lesson.coverImagePosition = pos;
        else if (text(body)) unrecognized.push({ heading: section.headingRaw, body: text(body) });
      } else if (fieldId === "coverQualityStatus") {
        const quality = text(body).toLowerCase().replace(/\s+/g, "_");
        if (["good", "needs_upgrade", "missing"].includes(quality)) lesson.coverQualityStatus = quality;
        else if (text(body)) unrecognized.push({ heading: section.headingRaw, body: text(body) });
      } else if (fieldId.startsWith("weekday:")) {
        const day = fieldId.slice("weekday:".length);
        const useStructured = kit && typeof kit.parseStructuredActivities === "function"
          && (
            (typeof kit.looksLikeStructuredActivityFields === "function" && kit.looksLikeStructuredActivityFields(body))
            || (typeof kit.hasExplicitActivityStart === "function" && kit.hasExplicitActivityStart(body))
            || /\bactivity\s*name\b/i.test(body)
          );
        if (useStructured) {
          const parsedDay = kit.parseStructuredActivities(body, day);
          (parsedDay.records || []).forEach((record) => addActivity(day, record));
          (parsedDay.unsupported || []).forEach((row) => kitUnsupported.push(row));
        } else {
          listLines(body).forEach((line) => addActivity(day, line));
        }
      }
    });

    let books = [];
    let songs = [];
    let printableIdeas = [];
    let linkedResources = { resolved: [], unresolved: [], unsupported: [] };
    let pendingPrintables = [];
    if (kit) {
      if (bookBodies.length) {
        const parsedBooks = kit.parseBooksSection(bookBodies.join("\n\n"));
        books = parsedBooks.records || [];
        kitUnsupported.push(...(parsedBooks.unsupported || []));
      }
      if (songBodies.length) {
        const parsedSongs = kit.parseSongsSection(songBodies.join("\n\n"));
        songs = parsedSongs.records || [];
        kitUnsupported.push(...(parsedSongs.unsupported || []));
      }
      if (ideaBodies.length) {
        const parsedIdeas = kit.parsePrintableIdeasSection(ideaBodies.join("\n\n"));
        printableIdeas = parsedIdeas.records || [];
        kitUnsupported.push(...(parsedIdeas.unsupported || []));
      }
      if (linkedBodies.length) {
        linkedResources = kit.parseLinkedResourcesSection(
          linkedBodies.join("\n\n"),
          options.existingResources,
          {
            ageDisplay: lesson.ageDisplay || lesson.age,
            existingResourceIds: options.existingLesson?.resourceIds || options.existingResourceIds || [],
          },
        );
        kitUnsupported.push(...(linkedResources.unsupported || []));
      }
      if (pendingPrintableBodies.length && typeof kit.parsePendingPrintableSection === "function") {
        const pendingParsed = kit.parsePendingPrintableSection(
          pendingPrintableBodies.join("\n\n"),
          options.existingResources,
          { ageDisplay: lesson.ageDisplay || lesson.age },
        );
        pendingPrintables = pendingParsed.pending || [];
        if ((pendingParsed.resolved || []).length) {
          linkedResources.resolved = (linkedResources.resolved || []).concat(pendingParsed.resolved);
        }
        kitUnsupported.push(...(pendingParsed.unsupported || []));
      }
    } else if (bookBodies.length || songBodies.length || ideaBodies.length || linkedBodies.length) {
      unrecognized.push({
        heading: "Week kit",
        body: "Week-kit parser did not load; books/songs/ideas/resources were not placed.",
      });
    }

    const activities = [];
    WEEKDAYS.forEach((day) => {
      (dailyPlans[day].items || []).forEach((item) => {
        activities.push({ dayOfWeek: day, title: item.title, itemId: item.itemId });
      });
    });

    (kitUnsupported || []).forEach((row) => {
      if (row && (text(row.heading) || text(row.body))) {
        unrecognized.push({
          heading: row.heading || "Unsupported field",
          body: text(row.body).slice(0, 240) + (row.note ? ` (${row.note})` : ""),
        });
      }
    });

    const errors = [];
    if (!lesson.title && text(lesson.theme)) lesson.title = text(lesson.theme);
    if (!lesson.title) errors.push("Lesson title is required.");
    if (!lesson.age) errors.push(unrecognizedAgeBandError(lesson.ageRaw || ""));

    return {
      ok: errors.length === 0,
      errors,
      unrecognized,
      lesson,
      dailyPlans,
      activities,
      activityCount: activities.length,
      books,
      songs,
      printableIdeas,
      linkedResources,
      pendingPrintables,
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
    const linked = parsed?.linkedResources || { resolved: [], unresolved: [] };
    const resolvedAll = linked.resolved || [];
    const unresolvedAll = linked.unresolved || [];
    const activityMediaWarnings = [];
    WEEKDAYS.forEach((day) => {
      (parsed?.dailyPlans?.[day]?.items || []).forEach((item) => {
        if (item?.setupImageUpload) {
          activityMediaWarnings.push({
            title: item.title,
            kind: "setup",
            actionRequired: item.setupImageUpload.actionRequired || "manual upload required",
            raw: item.setupImageUpload.raw || "",
          });
        }
        if (item?.exampleImageUpload) {
          activityMediaWarnings.push({
            title: item.title,
            kind: "finished",
            actionRequired: item.exampleImageUpload.actionRequired || "manual upload required",
            raw: item.exampleImageUpload.raw || "",
          });
        }
      });
    });
    return {
      title: lesson.title || "",
      age: lesson.ageDisplay || lesson.age || "",
      recognized,
      byDay,
      activityCount: parsed?.activityCount || 0,
      books: (parsed?.books || []).map((item) => item.title),
      songs: (parsed?.songs || []).map((item) => item.title),
      printableIdeas: (parsed?.printableIdeas || []).map((item) => item.title),
      linkedResources: {
        resolved: resolvedAll.filter((item) => !item.alreadyLinked).map((item) => item.resource?.title || item.entry?.title || ""),
        alreadyLinked: resolvedAll.filter((item) => item.alreadyLinked).map((item) => item.resource?.title || item.entry?.title || ""),
        unresolved: unresolvedAll.filter((item) => !item.ambiguous).map((item) => ({
          title: item.entry?.title || "",
          reason: item.reason || "",
        })),
        ambiguous: unresolvedAll.filter((item) => item.ambiguous).map((item) => ({
          title: item.entry?.title || "",
          reason: item.reason || "",
          candidates: item.candidates || [],
        })),
        destination: "Lesson → Linked Resources → Printables",
      },
      unrecognized: parsed?.unrecognized || [],
      rejectedMilestones: lesson.rejectedMilestones || [],
      coverImageUrl: lesson.coverImageUrl || "",
      coverManualUpload: lesson.coverManualUpload || null,
      pendingPrintables: parsed?.pendingPrintables || [],
      activityMediaWarnings,
      errors: parsed?.errors || [],
    };
  }

  function looksLikeImageUploadRef(raw) {
    const value = text(raw);
    if (!value) return false;
    if (/^https?:\/\//i.test(value)) return true;
    if (/^\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/.test(value)) return true;
    return /\.(png|jpe?g|gif|webp|heic|bmp|svg)(?:\?.*)?$/i.test(value);
  }

  function briefFromUploadRef(uploadRef) {
    if (!uploadRef || typeof uploadRef !== "object") return "";
    const raw = text(uploadRef.raw);
    if (!raw || looksLikeImageUploadRef(raw) || isPlaceholderPasteValue(raw)) return "";
    return raw;
  }

  function cloneDailyPlansWithoutUploadRefs(dailyPlans) {
    const source = dailyPlans && typeof dailyPlans === "object" ? dailyPlans : emptyDailyPlans();
    const next = emptyDailyPlans();
    WEEKDAYS.forEach((day) => {
      const dayPlan = source[day] && typeof source[day] === "object" ? source[day] : { items: [] };
      next[day] = {
        ...dayPlan,
        items: (dayPlan.items || []).map((item) => {
          if (!item || typeof item !== "object") return item;
          const cloned = { ...item };
          const setupBrief = briefFromUploadRef(cloned.setupImageUpload);
          const exampleBrief = briefFromUploadRef(cloned.exampleImageUpload);
          if (setupBrief && !text(cloned.imageBriefSetup)) cloned.imageBriefSetup = setupBrief;
          if (exampleBrief && !text(cloned.imageBriefExample)) cloned.imageBriefExample = exampleBrief;
          delete cloned.setupImageUpload;
          delete cloned.exampleImageUpload;
          return cloned;
        }),
      };
    });
    return next;
  }

  function activityDraftPatchFromItem(item, day) {
    if (!item || typeof item !== "object") return null;
    const patch = {};
    [
      "title", "activityCategory", "ageModifications", "objective", "description",
      "materials", "preparation", "setup", "steps", "teacherLanguage", "observationOpportunities",
      "safetyNotes", "cleanupTips", "indoorAlternatives", "outdoorAlternatives", "adaptations",
      "extensions", "mixedAgeAdaptations", "vocabulary", "imageRequirement",
      "imageBriefSetup", "imageBriefExample",
    ].forEach((key) => {
      if (item[key] != null && String(item[key]).trim() !== "") patch[key] = item[key];
    });
    if (item.durationMinutes != null && item.durationMinutes !== "") {
      patch.durationMinutes = item.durationMinutes;
    }
    if (day) patch.dayOfWeek = day;
    if (Array.isArray(item.teacherTips) && item.teacherTips.length) {
      patch.teacherTips = item.teacherTips.slice();
    }
    if (Array.isArray(item.observationPrompts) && item.observationPrompts.length) {
      patch.observationPrompts = item.observationPrompts.slice();
    }
    if (Array.isArray(item.substitutions) && item.substitutions.length) {
      patch.substitutions = item.substitutions.slice();
    }
    const keys = Object.keys(patch);
    if (!keys.length) return null;
    const identityOnly = keys.every((key) => key === "title" || key === "dayOfWeek");
    return identityOnly ? null : patch;
  }

  function buildActivityDraftMap(dailyPlans) {
    const activitiesDraft = {};
    const source = dailyPlans && typeof dailyPlans === "object" ? dailyPlans : emptyDailyPlans();
    WEEKDAYS.forEach((day) => {
      (source[day]?.items || []).forEach((item) => {
        const id = text(item?.itemId);
        const patch = activityDraftPatchFromItem(item, day);
        if (id && patch) activitiesDraft[id] = patch;
      });
    });
    return activitiesDraft;
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
    if ((parsed?.books || []).length) weekDraft.books = parsed.books.slice();
    if ((parsed?.songs || []).length) weekDraft.songs = parsed.songs.slice();
    if ((parsed?.printableIdeas || []).length) weekDraft.printableIdeas = parsed.printableIdeas.slice();

    const plan = {
      title: lesson.title || "Untitled Lesson Plan",
      age: lesson.age || "",
      theme: lesson.theme || "",
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
      dailyPlans: cloneDailyPlansWithoutUploadRefs(parsed?.dailyPlans),
      resourceIds: [],
      createdAt: now,
      updatedAt: now,
    };
    if (text(lesson.coverImageUrl)) plan.coverImageUrl = lesson.coverImageUrl;
    if (text(lesson.coverImageAlt)) plan.coverImageAlt = lesson.coverImageAlt;
    if (text(lesson.coverImagePosition)) plan.coverImagePosition = lesson.coverImagePosition;
    if (text(lesson.coverQualityStatus)) plan.coverQualityStatus = lesson.coverQualityStatus;
    if (id) plan.id = id;
    const activitiesDraft = buildActivityDraftMap(plan.dailyPlans);
    if (Object.keys(weekDraft).length || Object.keys(activitiesDraft).length) {
      plan.enrichmentDraft = {
        activities: activitiesDraft,
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
      age: text(options.age) || "",
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

  const MASTER_PASTE_ASSET_FIELDS = Object.freeze([
    "setupImageUrl",
    "exampleImageUrl",
    "setupMediaAssetId",
    "exampleMediaAssetId",
  ]);

  const MASTER_PASTE_LESSON_COMPARE_FIELDS = Object.freeze([
    ["title", "Title"],
    ["age", "Age band"],
    ["weeklyOverview", "Weekly overview"],
    ["objectives", "Learning objectives"],
    ["weeklyMaterials", "Materials list"],
    ["familyConnection", "Family connection"],
  ]);

  /**
   * Deterministic activity identity for Master Paste replace.
   * Does not parse paste — callers must use parseFullLessonStructurePaste.
   * @param {unknown} title
   * @returns {string}
   */
  function normalizeActivityMatchTitle(title) {
    return text(title).toLowerCase();
  }

  /**
   * @param {unknown} dailyPlans
   * @returns {{ day: string, index: number, title: string, itemId: string, item: object }[]}
   */
  function listIncomingMasterPasteActivities(dailyPlans) {
    const source = dailyPlans && typeof dailyPlans === "object" ? dailyPlans : {};
    /** @type {{ day: string, index: number, title: string, itemId: string, item: object }[]} */
    const out = [];
    WEEKDAYS.forEach((day) => {
      const items = Array.isArray(source[day]?.items) ? source[day].items : [];
      items.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const title = text(item.title);
        if (!title) return;
        out.push({
          day,
          index,
          title,
          itemId: text(item.itemId),
          item,
        });
      });
    });
    return out;
  }

  /**
   * @param {unknown} existingActivities
   * @returns {{ id: string, itemId: string, title: string, dayOfWeek: string, setupImageUrl: string, exampleImageUrl: string, setupMediaAssetId: string, exampleMediaAssetId: string, _idx: number }[]}
   */
  function listExistingActivitiesForMasterPasteMatch(existingActivities) {
    const rows = Array.isArray(existingActivities) ? existingActivities : [];
    return rows
      .filter((item) => item && typeof item === "object" && String(item.status || "") !== "archived")
      .map((item, index) => ({
        id: text(item.id),
        itemId: text(item.itemId),
        title: text(item.title),
        dayOfWeek: text(item.dayOfWeek).toLowerCase(),
        setupImageUrl: String(item.setupImageUrl || ""),
        exampleImageUrl: String(item.exampleImageUrl || ""),
        setupMediaAssetId: String(item.setupMediaAssetId || ""),
        exampleMediaAssetId: String(item.exampleMediaAssetId || ""),
        _idx: index,
      }))
      .filter((item) => item.title);
  }

  /**
   * Match incoming parsed activities to existing lesson activities.
   * Unique weekday+title (including equal-count order) wins; unique title is a
   * weekday-move fallback. Duplicate counts that cannot be paired fail closed.
   * @param {unknown} existingActivities
   * @param {unknown} incomingDailyPlans
   */
  function matchMasterPasteActivitiesToExisting(existingActivities, incomingDailyPlans) {
    const existing = listExistingActivitiesForMasterPasteMatch(existingActivities);
    const incoming = listIncomingMasterPasteActivities(incomingDailyPlans);
    /** @type {Map<string, typeof existing>} */
    const existingByDayTitle = new Map();
    /** @type {Map<string, typeof incoming>} */
    const incomingByDayTitle = new Map();
    existing.forEach((row) => {
      const key = `${row.dayOfWeek}::${normalizeActivityMatchTitle(row.title)}`;
      const list = existingByDayTitle.get(key) || [];
      list.push(row);
      existingByDayTitle.set(key, list);
    });
    incoming.forEach((row) => {
      const key = `${row.day}::${normalizeActivityMatchTitle(row.title)}`;
      const list = incomingByDayTitle.get(key) || [];
      list.push(row);
      incomingByDayTitle.set(key, list);
    });

    const usedExisting = new Set();
    const matchedIncoming = new Set();
    const blockedIncoming = new Set();
    /** @type {{ incoming: object, existing: object, strategy: string }[]} */
    const matches = [];
    /** @type {{ title: string, day: string, reason: string }[]} */
    const details = [];

    function markMatch(inc, ex, strategy) {
      usedExisting.add(ex._idx);
      matchedIncoming.add(`${inc.day}:${inc.index}`);
      matches.push({ incoming: inc, existing: ex, strategy });
    }

    const dayTitleKeys = new Set([...existingByDayTitle.keys(), ...incomingByDayTitle.keys()]);
    dayTitleKeys.forEach((key) => {
      const exRows = (existingByDayTitle.get(key) || []).filter((row) => !usedExisting.has(row._idx));
      const inRows = (incomingByDayTitle.get(key) || []).filter((row) => !matchedIncoming.has(`${row.day}:${row.index}`));
      if (!exRows.length && !inRows.length) return;
      if (exRows.length && inRows.length && exRows.length !== inRows.length) {
        inRows.forEach((row) => {
          blockedIncoming.add(`${row.day}:${row.index}`);
          details.push({
            title: row.title,
            day: row.day,
            reason: "ambiguous_day_title_count",
          });
        });
        return;
      }
      if (exRows.length && inRows.length && exRows.length === inRows.length) {
        inRows.forEach((row, index) => markMatch(row, exRows[index], "day_title"));
      }
    });

    const remainingIncoming = incoming.filter((row) => (
      !matchedIncoming.has(`${row.day}:${row.index}`) && !blockedIncoming.has(`${row.day}:${row.index}`)
    ));
    const remainingExisting = existing.filter((row) => !usedExisting.has(row._idx));
    /** @type {Map<string, typeof remainingExisting>} */
    const existingByTitle = new Map();
    /** @type {Map<string, typeof remainingIncoming>} */
    const incomingByTitle = new Map();
    remainingExisting.forEach((row) => {
      const key = normalizeActivityMatchTitle(row.title);
      const list = existingByTitle.get(key) || [];
      list.push(row);
      existingByTitle.set(key, list);
    });
    remainingIncoming.forEach((row) => {
      const key = normalizeActivityMatchTitle(row.title);
      const list = incomingByTitle.get(key) || [];
      list.push(row);
      incomingByTitle.set(key, list);
    });
    remainingIncoming.forEach((row) => {
      if (matchedIncoming.has(`${row.day}:${row.index}`) || blockedIncoming.has(`${row.day}:${row.index}`)) return;
      const key = normalizeActivityMatchTitle(row.title);
      const exRows = (existingByTitle.get(key) || []).filter((item) => !usedExisting.has(item._idx));
      const inRows = incomingByTitle.get(key) || [];
      if (exRows.length === 1 && inRows.length === 1) {
        markMatch(row, exRows[0], "title");
        return;
      }
      if (exRows.length > 0 && inRows.length > 0 && (exRows.length !== 1 || inRows.length !== 1)) {
        details.push({
          title: row.title,
          day: row.day,
          reason: "ambiguous_title",
        });
      }
    });

    if (details.length) {
      return {
        ok: false,
        errors: details.map((item) => (
          `Ambiguous activity mapping for “${item.title}” (${item.day}). Lesson was not replaced.`
        )),
        details,
        matches: [],
        added: [],
        removed: [],
      };
    }

    const added = incoming.filter((row) => (
      !matchedIncoming.has(`${row.day}:${row.index}`) && !blockedIncoming.has(`${row.day}:${row.index}`)
    ));
    const removed = existing.filter((row) => !usedExisting.has(row._idx));
    return {
      ok: true,
      errors: [],
      details: [],
      matches,
      added,
      removed,
    };
  }

  /**
   * Reuse existing activity itemIds + asset fields on the canonical plan
   * produced by buildCanonicalLessonPlan. Does not re-parse paste.
   * @param {object} incomingPlan
   * @param {ReturnType<typeof matchMasterPasteActivitiesToExisting>} matchResult
   */
  function applyMasterPasteActivityMatches(incomingPlan, matchResult) {
    const plan = incomingPlan && typeof incomingPlan === "object" ? { ...incomingPlan } : {};
    if (!matchResult || matchResult.ok !== true) return plan;
    /** @type {Map<string, object>} */
    const byIncomingItemId = new Map();
    (matchResult.matches || []).forEach((row) => {
      const incomingId = text(row?.incoming?.itemId);
      if (incomingId) byIncomingItemId.set(incomingId, row.existing);
    });
    const sourcePlans = plan.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
    const nextDaily = emptyDailyPlans();
    /** @type {Record<string, string>} */
    const itemIdRemap = {};
    WEEKDAYS.forEach((day) => {
      const dayPlan = sourcePlans[day] && typeof sourcePlans[day] === "object" ? sourcePlans[day] : { items: [] };
      nextDaily[day] = {
        ...dayPlan,
        items: (Array.isArray(dayPlan.items) ? dayPlan.items : []).map((item) => {
          if (!item || typeof item !== "object") return item;
          const existing = byIncomingItemId.get(text(item.itemId));
          if (!existing) return { ...item };
          const preservedId = text(existing.itemId) || text(item.itemId);
          if (text(item.itemId) && preservedId && text(item.itemId) !== preservedId) {
            itemIdRemap[text(item.itemId)] = preservedId;
          }
          const next = { ...item, itemId: preservedId };
          MASTER_PASTE_ASSET_FIELDS.forEach((field) => {
            next[field] = existing[field] || "";
          });
          return next;
        }),
      };
    });
    plan.dailyPlans = nextDaily;
    const draft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object" && !Array.isArray(plan.enrichmentDraft)
      ? { ...plan.enrichmentDraft }
      : null;
    if (draft) {
      const activities = draft.activities && typeof draft.activities === "object" && !Array.isArray(draft.activities)
        ? { ...draft.activities }
        : {};
      Object.keys(itemIdRemap).forEach((fromId) => {
        const toId = itemIdRemap[fromId];
        if (!toId || fromId === toId) return;
        if (activities[fromId] && typeof activities[fromId] === "object") {
          activities[toId] = { ...(activities[toId] || {}), ...activities[fromId] };
          delete activities[fromId];
        }
      });
      plan.enrichmentDraft = { ...draft, activities };
    }
    return plan;
  }

  /**
   * Owner-only replace preview. Parser output is passed through unchanged.
   * @param {object} existingSnapshot
   * @param {object} parsed
   * @param {ReturnType<typeof matchMasterPasteActivitiesToExisting>} [matchResult]
   */
  function buildMasterPasteReplaceComparison(existingSnapshot, parsed, matchResult) {
    const existing = existingSnapshot && typeof existingSnapshot === "object" ? existingSnapshot : {};
    const lesson = parsed?.lesson || {};
    const preview = buildStructurePreview(parsed);
    const match = matchResult && typeof matchResult === "object"
      ? matchResult
      : matchMasterPasteActivitiesToExisting(existing.activities || [], parsed?.dailyPlans);
    const existingWeekdays = existing.weekdayCounts && typeof existing.weekdayCounts === "object"
      ? existing.weekdayCounts
      : masterPasteWeekdayCountsFromActivities(existing.activities || []);
    const incomingWeekdays = masterPasteWeekdayCountsFromParsed(parsed);
    const sectionsChanging = [];
    MASTER_PASTE_LESSON_COMPARE_FIELDS.forEach(([key, label]) => {
      const before = text(existing[key] || (key === "age" ? existing.age : ""));
      const after = text(lesson[key] || (key === "age" ? lesson.ageDisplay || lesson.age : ""));
      if (before !== after) sectionsChanging.push(label);
    });
    if ((existing.milestones || []).join("|") !== (lesson.milestones || []).join("|")) {
      sectionsChanging.push("Milestones");
    }
    const preservedImages = (match.matches || []).filter((row) => (
      text(row.existing?.setupImageUrl) || text(row.existing?.exampleImageUrl)
    )).map((row) => row.existing.title);
    return {
      ok: match.ok !== false,
      errors: match.errors || [],
      existingTitle: existing.title || "",
      incomingTitle: preview.title || lesson.title || "",
      existingAge: existing.age || "",
      incomingAge: preview.age || lesson.age || "",
      existingActivityCount: Number(existing.activityCount) || (Array.isArray(existing.activities) ? existing.activities.length : 0),
      incomingActivityCount: Number(preview.activityCount) || 0,
      existingWeekdays,
      incomingWeekdays,
      updated: (match.matches || []).map((row) => ({
        title: row.incoming.title,
        day: row.incoming.day,
        existingId: row.existing.id || "",
        existingItemId: row.existing.itemId || "",
      })),
      added: (match.added || []).map((row) => ({ title: row.title, day: row.day })),
      removed: (match.removed || []).map((row) => ({ title: row.title, day: row.dayOfWeek })),
      sectionsChanging,
      preserved: {
        lessonId: existing.id || "",
        plan: existing.plan === "Pro" ? "Pro" : "Free",
        coverImageUrl: existing.coverImageUrl || "",
        resourceIds: Array.isArray(existing.resourceIds) ? existing.resourceIds.slice() : [],
        activityImages: preservedImages,
      },
      preview,
    };
  }

  function masterPasteWeekdayCountsFromParsed(parsed) {
    const counts = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, total: 0 };
    WEEKDAYS.forEach((day) => {
      const items = parsed?.dailyPlans?.[day]?.items;
      counts[day] = Array.isArray(items) ? items.length : 0;
      counts.total += counts[day];
    });
    return counts;
  }

  function masterPasteWeekdayCountsFromActivities(activities) {
    const counts = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, total: 0 };
    (Array.isArray(activities) ? activities : []).forEach((item) => {
      const day = text(item?.dayOfWeek).toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(counts, day) || day === "total") return;
      counts[day] += 1;
      counts.total += 1;
    });
    return counts;
  }

  return {
    WEEKDAYS,
    WEEKDAY_LABEL,
    LESSON_HEADING_ALIASES,
    CANONICAL_AGE_BANDS,
    CANONICAL_AGE_BAND_LABELS,
    normalizePasteHeading,
    normalizeTitleKey,
    resolveAgeBandAlias,
    mapAgeBand,
    parseFullLessonStructurePaste,
    buildStructurePreview,
    buildCanonicalLessonPlan,
    buildBlankLessonPlan,
    activityDraftPatchFromItem,
    buildActivityDraftMap,
    findDuplicateLessonTitle,
    generateItemId,
    normalizeActivityMatchTitle,
    listIncomingMasterPasteActivities,
    matchMasterPasteActivitiesToExisting,
    applyMasterPasteActivityMatches,
    buildMasterPasteReplaceComparison,
  };
});
