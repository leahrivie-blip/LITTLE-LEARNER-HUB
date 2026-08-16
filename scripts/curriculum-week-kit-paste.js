/**
 * Shared week-kit paste helpers for books, songs, printable ideas,
 * linked-resource references, and weekday activity blocks.
 * Pure parsing only. Does not publish, upload files, or invent resources.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHCurriculumWeekKitPaste = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function multiline(value) {
    return String(value == null ? "" : value).replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  }

  function normalizeHeading(raw) {
    return text(raw)
      .toLowerCase()
      .replace(/[_/&]+/g, " ")
      .replace(/[:：]+$/g, "")
      .replace(/[–—−]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function freezeNormalizedAliases(source) {
    const out = {};
    Object.keys(source).forEach((key) => {
      out[normalizeHeading(key)] = source[key];
    });
    return Object.freeze(out);
  }

  const BOOK_HEADING_ALIASES = freezeNormalizedAliases({
    "book title": "title",
    book: "title",
    title: "title",
    author: "author",
    "why this book": "whyThisBook",
    "why it fits": "whyThisBook",
    "book questions": "questions",
    "discussion questions": "questions",
    questions: "questions",
    "teacher notes": "unsupportedBookField",
    "book url": "unsupportedBookField",
    "book link": "unsupportedBookField",
    "day association": "suggestedWeekday",
    "suggested weekday": "suggestedWeekday",
    "suggested day": "suggestedWeekday",
  });

  const SONG_HEADING_ALIASES = freezeNormalizedAliases({
    "song title": "title",
    song: "title",
    title: "title",
    tune: "tuneUnsupported",
    "song url": "urlUnsupported",
    "song link": "urlUnsupported",
    "teacher directions": "teacherDirections",
    description: "whenToUse",
    "how to use": "whenToUse",
    "suggested use": "whenToUse",
    lyrics: "lyrics",
    "teacher notes": "teacherDirections",
    motions: "motions",
    "movement / action prompts": "motions",
    "rights / licensing": "rightsStatus",
    "rights status": "rightsStatus",
    rights: "rightsStatus",
    "day association": "linkedWeekday",
    "linked weekday": "linkedWeekday",
  });

  const IDEA_HEADING_ALIASES = freezeNormalizedAliases({
    "idea title": "title",
    "printable idea": "title",
    title: "title",
    type: "type",
    "purpose / description": "purpose",
    purpose: "purpose",
    description: "purpose",
    instructions: "instructions",
    notes: "notes",
  });

  const LINK_HEADING_ALIASES = freezeNormalizedAliases({
    "linked resource": "title",
    "resource title": "title",
    title: "title",
    "resource type": "resourceType",
    type: "resourceType",
    "resource placement": "placement",
    placement: "placement",
    "resource section": "placement",
    "printable name": "title",
    "printable description": "description",
    description: "description",
    "printable cover image url": "coverUrl",
    "cover image url": "coverUrl",
    "printable pdf": "pdfName",
    pdf: "pdfName",
  });

  const KIT_SECTION_FIELD_IDS = Object.freeze({
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
  });

  const ACTIVITY_ITEM_ALIASES = freezeNormalizedAliases({
    "activity name": "title",
    title: "title",
    weekday: "dayOfWeek",
    category: "activityCategory",
    "developmental domain": "activityCategory",
    "category / developmental domain": "activityCategory",
    "recommended age": "ageModifications",
    "estimated duration": "durationMinutes",
    "activity objective": "objective",
    "what children will do": "description",
    materials: "materials",
    "teacher preparation": "preparation",
    setup: "setup",
    "step-by-step directions": "steps",
    "step by step directions": "steps",
    "suggested questions to ask": "teacherLanguage",
    "suggested questions": "teacherLanguage",
    "learning and observation focus": "observationOpportunities",
    "safety and supervision": "safetyNotes",
    cleanup: "cleanupTips",
    "indoor option": "indoorAlternatives",
    indoor: "indoorAlternatives",
    "outdoor option": "outdoorAlternatives",
    outdoor: "outdoorAlternatives",
    "teacher tips": "teacherTips",
    "supply substitutions": "substitutions",
    "support adaptations": "adaptations",
    "added challenge": "extensions",
    "mixed-age adaptations": "mixedAgeAdaptations",
    "mixed age adaptations": "mixedAgeAdaptations",
    "observation prompts": "observationPrompts",
    vocabulary: "vocabulary",
    "image requirement": "imageRequirement",
    "setup example brief": "imageBriefSetup",
    "finished example brief": "imageBriefExample",
    "example image brief": "imageBriefExample",
    "setup image": "setupImageUpload",
    "setup image url": "setupImageUpload",
    "setup photo": "setupImageUpload",
    "example image": "exampleImageUpload",
    "example image url": "exampleImageUpload",
    "example images": "exampleImageUpload",
    "finished example image": "exampleImageUpload",
    "finished example image url": "exampleImageUpload",
    "finished example photo": "exampleImageUpload",
    "setup photo url": "setupImageUpload",
  });

  const ACTIVITY_START_IDS = Object.freeze(["title"]);

  function splitLabeledSections(pastedText, aliasMap) {
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
        recognized: Boolean(current.fieldId),
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
        const normalized = normalizeHeading(labelPart);
        const fieldId = Object.prototype.hasOwnProperty.call(aliasMap, normalized)
          ? aliasMap[normalized]
          : "";
        if (fieldId || (/^[A-Za-z][A-Za-z0-9 /&'-]{0,60}$/.test(labelPart) && rest === "")) {
          flush();
          current = { headingRaw: labelPart.trim(), fieldId: fieldId || "" };
          if (rest) bodyLines.push(rest);
          return;
        }
      }
      if (current) bodyLines.push(line);
      else if (trimmed) sections.push({ headingRaw: "", fieldId: "", body: trimmed, recognized: false });
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
   * @param {string} body
   * @param {Record<string, string>} aliasMap
   * @param {string[]} startFieldIds
   */
  function parseRecordList(body, aliasMap, startFieldIds) {
    const start = new Set(startFieldIds);
    const sections = splitLabeledSections(body, aliasMap);
    const hasNested = sections.some((section) => section.fieldId && start.has(section.fieldId));
    const unsupported = [];
    if (!hasNested) {
      return {
        records: listLines(body).map((title) => ({ title })),
        unsupported,
      };
    }
    const records = [];
    let current = null;
    function flush() {
      if (current && text(current.title)) records.push(current);
      current = null;
    }
    sections.forEach((section) => {
      if (!section.fieldId) {
        if (text(section.body) || text(section.headingRaw)) {
          unsupported.push({ heading: section.headingRaw || "(untitled)", body: multiline(section.body).slice(0, 240) });
        }
        return;
      }
      if (start.has(section.fieldId)) {
        flush();
        current = { title: text(section.body) };
        return;
      }
      if (!current) {
        unsupported.push({ heading: section.headingRaw, body: multiline(section.body).slice(0, 240) });
        return;
      }
      if (section.fieldId === "tuneUnsupported" || section.fieldId === "unsupportedBookField" || section.fieldId === "urlUnsupported") {
        unsupported.push({
          heading: section.headingRaw,
          body: text(section.body),
          note: section.fieldId === "tuneUnsupported"
            ? "Tune is not a stored song field."
            : section.fieldId === "urlUnsupported"
              ? "Song URL is not a stored song field."
              : "This book field is not stored (teacher notes / book URL).",
        });
        return;
      }
      const value = section.fieldId === "questions" || section.fieldId === "lyrics" || section.fieldId === "instructions"
        || section.fieldId === "notes" || section.fieldId === "purpose" || section.fieldId === "whenToUse"
        || section.fieldId === "teacherDirections" || section.fieldId === "whyThisBook" || section.fieldId === "teacherNotes"
        ? multiline(section.body)
        : text(section.body);
      current[section.fieldId] = value;
    });
    flush();
    return { records, unsupported };
  }

  function normalizeBookRecord(raw) {
    const title = text(raw?.title);
    if (!title) return null;
    const questions = multiline(raw.questions);
    const out = { title };
    if (text(raw.author)) out.author = text(raw.author);
    if (text(raw.whyThisBook)) {
      out.whyThisBook = text(raw.whyThisBook);
      out.whyItFits = out.whyThisBook;
    }
    if (questions) {
      out.questions = questions;
      out.afterReadingQuestions = questions.split(/\n+/).map((line) => text(line)).filter(Boolean);
    }
    const day = text(raw.suggestedWeekday).toLowerCase();
    if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(day)) {
      out.suggestedWeekday = day;
    }
    return out;
  }

  function normalizeSongRecord(raw) {
    const title = text(raw?.title);
    if (!title) return null;
    const out = { title };
    if (text(raw.whenToUse)) out.whenToUse = text(raw.whenToUse);
    if (text(raw.teacherDirections)) out.teacherDirections = text(raw.teacherDirections);
    if (text(raw.motions)) out.motions = text(raw.motions);
    if (multiline(raw.lyrics)) out.lyrics = multiline(raw.lyrics);
    const rights = text(raw.rightsStatus).toLowerCase().replace(/\s+/g, "_");
    const rightsMap = {
      traditional: "traditional",
      public_domain: "public_domain",
      "public-domain": "public_domain",
      original: "original",
      copyrighted_title_only: "copyrighted_title_only",
      "copyrighted — title only (no lyrics)": "copyrighted_title_only",
      licensed: "licensed",
    };
    if (rightsMap[rights] || rightsMap[text(raw.rightsStatus).toLowerCase()]) {
      out.rightsStatus = rightsMap[rights] || rightsMap[text(raw.rightsStatus).toLowerCase()];
    } else if (text(raw.rightsStatus)) {
      out.unresolvedRightsStatus = text(raw.rightsStatus);
    }
    const day = text(raw.linkedWeekday).toLowerCase();
    if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(day)) {
      out.linkedWeekday = day;
    }
    return out;
  }

  function normalizeIdeaRecord(raw) {
    const title = text(raw?.title);
    if (!title) return null;
    const out = { title };
    if (text(raw.type)) out.type = text(raw.type);
    if (text(raw.purpose)) out.purpose = text(raw.purpose);
    if (multiline(raw.instructions)) out.instructions = multiline(raw.instructions);
    if (text(raw.notes)) out.notes = text(raw.notes);
    return out;
  }

  function titleKey(value) {
    return text(value).toLowerCase();
  }

  /**
   * Exact id or exact title only. Age/category used only to uniquify exact title matches.
   * @param {{ title?: string, resourceType?: string, placement?: string }} entry
   * @param {Array<{ id?: string, title?: string, resourceCategory?: string, resourceType?: string, ageGroup?: string }>} resources
   * @param {{ ageDisplay?: string }} [context]
   */
  function resolveExistingResource(entry, resources, context) {
    const catalog = Array.isArray(resources) ? resources : [];
    const rawTitle = text(entry?.title);
    if (!rawTitle) {
      return { ok: false, unresolved: true, reason: "Linked resource title is missing.", entry };
    }
    const idHit = catalog.filter((item) => text(item?.id) === rawTitle);
    let candidates = idHit.length ? idHit : catalog.filter((item) => titleKey(item?.title) === titleKey(rawTitle));
    if (candidates.length > 1 && text(context?.ageDisplay)) {
      const aged = candidates.filter((item) => titleKey(item.ageGroup) === titleKey(context.ageDisplay));
      if (aged.length === 1) candidates = aged;
    }
    if (candidates.length > 1 && text(entry.resourceType)) {
      const typed = candidates.filter((item) => (
        titleKey(item.resourceType) === titleKey(entry.resourceType)
        || titleKey(item.resourceCategory) === titleKey(entry.resourceType)
        || (titleKey(entry.resourceType) === "printable" && titleKey(item.resourceCategory) === "printables")
      ));
      if (typed.length === 1) candidates = typed;
    }
    if (candidates.length === 1) {
      return {
        ok: true,
        resource: candidates[0],
        entry,
        placement: "linked_printables",
      };
    }
    if (candidates.length > 1) {
      return {
        ok: false,
        unresolved: true,
        ambiguous: true,
        reason: `Linked resource ‘${rawTitle}’ matched more than one existing resource.`,
        entry,
        candidates: candidates.map((item) => ({ id: item.id, title: item.title })),
      };
    }
    return {
      ok: false,
      unresolved: true,
      reason: `Linked resource ‘${rawTitle}’ was not found.`,
      entry,
    };
  }

  function parseBooksSection(body) {
    const parsed = parseRecordList(body, BOOK_HEADING_ALIASES, ["title"]);
    return {
      records: parsed.records.map(normalizeBookRecord).filter(Boolean),
      unsupported: parsed.unsupported,
    };
  }

  function parseSongsSection(body) {
    const parsed = parseRecordList(body, SONG_HEADING_ALIASES, ["title"]);
    return {
      records: parsed.records.map(normalizeSongRecord).filter(Boolean),
      unsupported: parsed.unsupported,
    };
  }

  function parsePrintableIdeasSection(body) {
    const parsed = parseRecordList(body, IDEA_HEADING_ALIASES, ["title"]);
    return {
      records: parsed.records.map(normalizeIdeaRecord).filter(Boolean),
      unsupported: parsed.unsupported,
    };
  }

  function parseImageRequirement(raw) {
    const value = text(raw).toLowerCase().replace(/\s+/g, "_");
    const compact = text(raw).toLowerCase();
    const byValue = {
      not_needed: "not_needed",
      example_only: "example_only",
      setup_only: "setup_only",
      required: "required",
      optional: "optional",
      needs_owner_classification: "needs_owner_classification",
    };
    const byLabel = {
      "no image needed": "not_needed",
      "finished example only": "example_only",
      "setup image only": "setup_only",
      "setup + finished example": "required",
      optional: "optional",
      "needs owner classification": "needs_owner_classification",
    };
    return byValue[value] || byLabel[compact] || "";
  }

  function parseCoverOrUrl(raw) {
    const value = text(raw);
    if (!value) return { ok: false, empty: true };
    if (/^https?:\/\//i.test(value) || /^\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/.test(value)) {
      return { ok: true, url: value };
    }
    return {
      ok: false,
      manualUpload: true,
      raw: value,
      reason: "Cover reference detected — manual upload required.",
    };
  }

  function parsePendingPrintableSection(body, resources, context) {
    const linked = parseLinkedResourcesSection(body, resources, context);
    const pending = [];
    const unresolved = [];
    (linked.unresolved || []).forEach((item) => {
      const title = text(item.entry?.title);
      if (!title) return;
      pending.push({
        title,
        description: text(item.entry?.description),
        existingResource: "none",
        pdfUploadRequired: true,
        pdfName: text(item.entry?.pdfName),
        coverDetected: Boolean(text(item.entry?.coverUrl)),
        coverUrl: text(item.entry?.coverUrl),
        actionRequired: "Create / Upload Printable",
        reason: item.reason,
      });
      unresolved.push(item);
    });
    return {
      resolved: linked.resolved || [],
      unresolved,
      pending,
      unsupported: linked.unsupported || [],
    };
  }

  function parseStructuredActivities(body, weekday) {
    const source = String(body || "");
    if (!/activity\s*name\s*:/i.test(source)) {
      return { records: [], unsupported: [] };
    }
    const parsed = parseRecordList(source, ACTIVITY_ITEM_ALIASES, ["title"]);
    const records = parsed.records.map((raw) => {
      const title = text(raw.title);
      if (!title) return null;
      const out = { title, dayOfWeek: weekday || "" };
      [
        "activityCategory", "ageModifications", "durationMinutes", "objective", "description",
        "materials", "preparation", "setup", "steps", "teacherLanguage", "observationOpportunities",
        "safetyNotes", "cleanupTips", "indoorAlternatives", "outdoorAlternatives", "adaptations",
        "extensions", "mixedAgeAdaptations", "vocabulary",
      ].forEach((key) => {
        if (multiline(raw[key])) out[key] = key === "vocabulary" || key === "materials" || key === "steps" || key === "teacherLanguage"
          ? multiline(raw[key])
          : (key === "activityCategory" || key === "ageModifications" || key === "durationMinutes" ? text(raw[key]) : multiline(raw[key]));
      });
      if (multiline(raw.teacherTips)) {
        out.teacherTips = listLines(raw.teacherTips);
      }
      if (multiline(raw.observationPrompts)) {
        out.observationPrompts = listLines(raw.observationPrompts);
      }
      if (text(raw.dayOfWeek)) out.dayOfWeek = text(raw.dayOfWeek).toLowerCase() || weekday;
      const durationMatch = text(raw.durationMinutes).match(/(\d+)/);
      if (durationMatch) out.durationMinutes = Number(durationMatch[1]);
      if (multiline(raw.substitutions)) {
        const subs = [];
        listLines(raw.substitutions).forEach((line) => {
          const arrow = line.match(/^(.+?)\s*(?:→|->|=>|—)\s*(.+)$/);
          if (!arrow) return;
          const need = text(arrow[1].replace(/^if\s+missing:?\s*/i, ""));
          const use = text(arrow[2].replace(/^use\s+instead:?\s*/i, ""));
          if (need && use) subs.push({ need, use });
        });
        if (subs.length) out.substitutions = subs;
      }
      const imageReq = parseImageRequirement(raw.imageRequirement);
      if (imageReq) out.imageRequirement = imageReq;
      else if (text(raw.imageRequirement)) out.unresolvedImageRequirement = text(raw.imageRequirement);
      if (multiline(raw.imageBriefSetup)) out.imageBriefSetup = multiline(raw.imageBriefSetup);
      if (multiline(raw.imageBriefExample)) out.imageBriefExample = multiline(raw.imageBriefExample);
      if (text(raw.setupImageUpload)) {
        out.setupImageUpload = {
          raw: text(raw.setupImageUpload),
          actionRequired: "Activity setup photo — manual upload required.",
        };
      }
      if (text(raw.exampleImageUpload)) {
        out.exampleImageUpload = {
          raw: text(raw.exampleImageUpload),
          actionRequired: "Activity finished example photo — manual upload required.",
        };
      }
      return out;
    }).filter(Boolean);
    return { records, unsupported: parsed.unsupported.slice() };
  }

  function labeledSectionBody(section) {
    const heading = normalizeHeading(section?.headingRaw);
    const startHeadings = new Set([
      "book title", "book", "song title", "song", "idea title", "printable idea",
      "linked resource", "resource title", "printable name",
    ]);
    const body = section?.body || "";
    if (startHeadings.has(heading)) return `${section.headingRaw}:\n${body}`;
    return body;
  }

  function parseLinkedResourcesSection(body, resources, context) {
    const parsed = parseRecordList(body, LINK_HEADING_ALIASES, ["title"]);
    const resolved = [];
    const unresolved = [];
    const existingIds = new Set(
      (Array.isArray(context?.existingResourceIds) ? context.existingResourceIds : []).map(text).filter(Boolean),
    );
    parsed.records.forEach((entry) => {
      const result = resolveExistingResource(entry, resources, context);
      if (result.ok) {
        resolved.push({
          ...result,
          alreadyLinked: existingIds.has(text(result.resource?.id)),
        });
      } else unresolved.push(result);
    });
    return { resolved, unresolved, unsupported: parsed.unsupported };
  }

  function mergeRecordsByTitle(existing, incoming, max) {
    const next = Array.isArray(existing) ? existing.slice() : [];
    incoming.forEach((record) => {
      const key = titleKey(record.title);
      if (!key) return;
      const index = next.findIndex((item) => titleKey(item && item.title) === key);
      if (index >= 0) next[index] = { ...next[index], ...record };
      else next.push(record);
    });
    return next.slice(0, max || 24);
  }

  return {
    BOOK_HEADING_ALIASES,
    SONG_HEADING_ALIASES,
    IDEA_HEADING_ALIASES,
    LINK_HEADING_ALIASES,
    KIT_SECTION_FIELD_IDS,
    ACTIVITY_ITEM_ALIASES,
    ACTIVITY_START_IDS,
    normalizeHeading,
    splitLabeledSections,
    listLines,
    parseRecordList,
    parseBooksSection,
    parseSongsSection,
    parsePrintableIdeasSection,
    parseStructuredActivities,
    labeledSectionBody,
    parsePendingPrintableSection,
    parseImageRequirement,
    parseCoverOrUrl,
    parseLinkedResourcesSection,
    resolveExistingResource,
    mergeRecordsByTitle,
    normalizeBookRecord,
    normalizeSongRecord,
    normalizeIdeaRecord,
  };
});
