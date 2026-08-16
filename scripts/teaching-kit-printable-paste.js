/**
 * Owner Admin — Paste Printable Update.
 *
 * Parses printable metadata headings into the existing Create / Upload Printable
 * draft fields. Does not upload files, publish, or write linked-resource storage.
 * Lesson linking reuses the existing lessonPlanId / resource.lessonPlanIds path.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitPrintablePaste = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @typedef {{ id?: string, title?: string, age?: string, theme?: string, status?: string }} LessonLike */
  /** @typedef {{ id?: string, title?: string, lessonPlanIds?: string[], resourceCategory?: string, status?: string, fileData?: string, previewImageUrl?: string, previewUrl?: string }} ResourceLike */

  const CANONICAL_PRINTABLE_TYPE = "Printable";
  const CANONICAL_ACCESS = Object.freeze(["free", "pro"]);
  const DESTINATION_LINKED_PRINTABLES = "linked_printables";
  const DESTINATION_LABEL = "Linked Resources → Printables";

  const PRINTABLE_HEADING_ALIASES = freezeNormalizedAliases({
    title: "title",
    "printable title": "title",
    "resource title": "title",
    type: "resourceType",
    "resource type": "resourceType",
    "age group": "ageGroup",
    age: "ageGroup",
    "age band": "ageGroup",
    "age range": "ageGroup",
    theme: "theme",
    "lesson theme": "theme",
    description: "description",
    "printable description": "description",
    "resource description": "description",
    "page count": "pageCount",
    pages: "pageCount",
    "number of pages": "pageCount",
    "access level": "accessLevel",
    access: "accessLevel",
    plan: "accessLevel",
    "printing instructions": "printingInstructions",
    "print instructions": "printingInstructions",
    "printing notes": "printingInstructions",
    "link to lesson": "linkToLesson",
    lesson: "linkToLesson",
    "lesson plan": "linkToLesson",
    "teaching kit": "linkToLesson",
    "linked lesson": "linkToLesson",
    "resource placement": "resourcePlacement",
    placement: "resourcePlacement",
    "resource section": "resourcePlacement",
    "link location": "resourcePlacement",
    "link to activity": "linkToActivity",
    "activity name": "linkToActivity",
  });

  const FIELD_LABELS = Object.freeze({
    title: "Title",
    resourceType: "Type",
    ageGroup: "Age group",
    theme: "Theme",
    description: "Description",
    pageCount: "Page count",
    accessLevel: "Access level",
    printingInstructions: "Printing instructions",
    linkToLesson: "Link to lesson",
    resourcePlacement: "Resource placement",
    linkToActivity: "Link to activity",
  });

  const FORM_FIELD_IDS = Object.freeze([
    "title",
    "resourceType",
    "ageGroup",
    "theme",
    "description",
    "pageCount",
    "accessLevel",
    "printingInstructions",
  ]);

  const MANUAL_FILE_FIELDS = Object.freeze(["PDF file", "Preview image"]);

  function pasteWeekApi() {
    if (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPasteImport) {
      return globalThis.LLHTeachingKitPasteImport;
    }
    if (typeof require === "function") {
      try { return require("./teaching-kit-paste-import.js"); } catch (_error) { return null; }
    }
    return null;
  }

  function lessonStructureApi() {
    if (typeof globalThis !== "undefined" && globalThis.LLHCurriculumLessonStructurePaste) {
      return globalThis.LLHCurriculumLessonStructurePaste;
    }
    if (typeof require === "function") {
      try { return require("./curriculum-lesson-structure-paste.js"); } catch (_error) { return null; }
    }
    return null;
  }

  function text(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function multiline(value) {
    return String(value == null ? "" : value).replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  }

  function normalizePasteHeading(raw) {
    const week = pasteWeekApi();
    if (week && typeof week.normalizeHeading === "function") return week.normalizeHeading(raw);
    const lesson = lessonStructureApi();
    if (lesson && typeof lesson.normalizePasteHeading === "function") {
      return lesson.normalizePasteHeading(raw);
    }
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
      out[normalizePasteHeading(key)] = source[key];
    });
    return Object.freeze(out);
  }

  function splitPrintableSections(pastedText) {
    const week = pasteWeekApi();
    if (week && typeof week.splitLabeledSections === "function") {
      return week.splitLabeledSections(pastedText, PRINTABLE_HEADING_ALIASES);
    }
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
        const normalized = normalizePasteHeading(labelPart);
        const fieldId = Object.prototype.hasOwnProperty.call(PRINTABLE_HEADING_ALIASES, normalized)
          ? PRINTABLE_HEADING_ALIASES[normalized]
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

  function resolveAgeBandAlias(raw) {
    const lesson = lessonStructureApi();
    if (lesson && typeof lesson.resolveAgeBandAlias === "function") {
      return lesson.resolveAgeBandAlias(raw);
    }
    return { display: "", bucket: "", raw: text(raw) };
  }

  function canonicalAgeBandLabels() {
    const lesson = lessonStructureApi();
    if (lesson && Array.isArray(lesson.CANONICAL_AGE_BAND_LABELS)) {
      return lesson.CANONICAL_AGE_BAND_LABELS.slice();
    }
    return [];
  }

  /**
   * @param {unknown} raw
   * @param {string[]} [knownTypes]
   * @returns {{ value: string, error: string }}
   */
  function resolvePrintableType(raw, knownTypes) {
    const original = text(raw);
    if (!original) return { value: "", error: "" };
    const known = Array.isArray(knownTypes) && knownTypes.length
      ? knownTypes
      : [CANONICAL_PRINTABLE_TYPE];
    const key = original.toLowerCase();
    const match = known.find((item) => text(item).toLowerCase() === key);
    if (match) return { value: match, error: "" };
    if (key === "printable") return { value: CANONICAL_PRINTABLE_TYPE, error: "" };
    return {
      value: "",
      error: `Type ‘${original}’ was not recognized. Valid values: ${known.join(", ")}.`,
    };
  }

  /**
   * @param {unknown} raw
   * @returns {{ value: string, label: string, error: string }}
   */
  function resolveAccessLevel(raw) {
    const original = text(raw);
    if (!original) return { value: "", label: "", error: "" };
    const key = original.toLowerCase();
    if (key === "free") return { value: "free", label: "Free", error: "" };
    if (key === "pro") return { value: "pro", label: "Pro", error: "" };
    return {
      value: "",
      label: "",
      error: `Access level ‘${original}’ was not recognized. Valid values: Free, Pro.`,
    };
  }

  /**
   * @param {unknown} raw
   * @returns {{ value: number | "", error: string }}
   */
  function parsePageCount(raw) {
    const original = multiline(raw).trim();
    if (!original) return { value: "", error: "" };
    if (!/^\d+$/.test(original)) {
      return { value: "", error: "Page count must be a positive whole number." };
    }
    const n = Number(original);
    if (!Number.isInteger(n) || n < 1) {
      return { value: "", error: "Page count must be a positive whole number." };
    }
    return { value: n, error: "" };
  }

  /**
   * @param {unknown} raw
   * @returns {{ value: string, label: string, error: string }}
   */
  function resolveResourcePlacement(raw) {
    const original = text(raw);
    if (!original) {
      return { value: DESTINATION_LINKED_PRINTABLES, label: DESTINATION_LABEL, error: "" };
    }
    const key = normalizePasteHeading(original)
      .replace(/[→>]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (
      key === "lesson printables"
      || key === "linked resources"
      || key === "printables"
      || key === "linked resources printables"
      || key === "linked resources - printables"
    ) {
      return { value: DESTINATION_LINKED_PRINTABLES, label: DESTINATION_LABEL, error: "" };
    }
    if (key === "printable ideas" || key === "printable idea") {
      return {
        value: "",
        label: "",
        error: "Resource placement ‘Printable Ideas’ is the planning list, not Linked Resources. Use Lesson Printables / Linked Resources → Printables.",
      };
    }
    return {
      value: "",
      label: "",
      error: `Resource placement ‘${original}’ was not recognized. Valid value: Lesson Printables (Linked Resources → Printables).`,
    };
  }

  function lessonTitleKey(title) {
    const lesson = lessonStructureApi();
    if (lesson && typeof lesson.normalizeTitleKey === "function") {
      return lesson.normalizeTitleKey(title);
    }
    return text(title).toLowerCase();
  }

  function lessonAgeDisplay(plan) {
    const mapped = resolveAgeBandAlias(plan?.age || "");
    return mapped.display || text(plan?.age || "");
  }

  /**
   * Resolve a pasted lesson destination against existing lesson IDs.
   * Never uses partial title match. Never guesses among remaining exact candidates.
   *
   * @param {{
   *   pastedLessonRaw?: string,
   *   ageDisplay?: string,
   *   currentLesson?: LessonLike | null,
   *   lessons?: LessonLike[],
   *   ownerChosenLessonId?: string,
   * }} options
   */
  function resolveLinkedLesson(options) {
    const pastedLessonRaw = text(options?.pastedLessonRaw);
    const ageDisplay = text(options?.ageDisplay);
    const current = options?.currentLesson || null;
    const lessons = Array.isArray(options?.lessons) ? options.lessons : [];
    const ownerChosenLessonId = text(options?.ownerChosenLessonId);

    if (ownerChosenLessonId) {
      const chosen = lessons.find((item) => text(item?.id) === ownerChosenLessonId);
      if (chosen) {
        return {
          ok: true,
          lesson: chosen,
          conflict: false,
          ambiguous: false,
          needsOwnerChoice: false,
          error: "",
          candidates: [chosen],
        };
      }
      return {
        ok: false,
        lesson: null,
        conflict: false,
        ambiguous: false,
        needsOwnerChoice: false,
        error: `Chosen lesson ‘${ownerChosenLessonId}’ was not found.`,
        candidates: [],
      };
    }

    /** @type {LessonLike[]} */
    let candidates = [];
    if (pastedLessonRaw) {
      const idHit = lessons.filter((item) => text(item?.id) === pastedLessonRaw);
      if (idHit.length) {
        candidates = idHit;
      } else {
        const titleKey = lessonTitleKey(pastedLessonRaw);
        candidates = lessons.filter((item) => lessonTitleKey(item?.title) === titleKey);
      }
      if (ageDisplay && candidates.length > 1) {
        const aged = candidates.filter((item) => lessonAgeDisplay(item) === ageDisplay);
        if (aged.length === 1) candidates = aged;
        else if (aged.length > 1) candidates = aged;
        else {
          return {
            ok: false,
            lesson: null,
            conflict: false,
            ambiguous: false,
            needsOwnerChoice: false,
            error: `Link to lesson ‘${pastedLessonRaw}’ did not match a lesson with age group ‘${ageDisplay}’.`,
            candidates: [],
          };
        }
      }
    }

    if (current && text(current.id)) {
      if (!pastedLessonRaw) {
        return {
          ok: true,
          lesson: current,
          conflict: false,
          ambiguous: false,
          needsOwnerChoice: false,
          error: "",
          candidates: [current],
          usedCurrentDefault: true,
        };
      }
      const currentInCandidates = candidates.some((item) => text(item?.id) === text(current.id));
      if (currentInCandidates && (candidates.length === 1 || lessonTitleKey(current.title) === lessonTitleKey(pastedLessonRaw))) {
        if (candidates.length === 1 || (ageDisplay && lessonAgeDisplay(current) === ageDisplay) || !ageDisplay) {
          if (candidates.length > 1 && ageDisplay) {
            const agedCurrent = candidates.filter((item) => lessonAgeDisplay(item) === ageDisplay);
            if (agedCurrent.length === 1) {
              return {
                ok: true,
                lesson: agedCurrent[0],
                conflict: false,
                ambiguous: false,
                needsOwnerChoice: false,
                error: "",
                candidates: agedCurrent,
              };
            }
            if (agedCurrent.length > 1 && agedCurrent.some((item) => text(item.id) === text(current.id))) {
              return {
                ok: true,
                lesson: current,
                conflict: false,
                ambiguous: false,
                needsOwnerChoice: false,
                error: "",
                candidates: [current],
                usedCurrentDefault: true,
              };
            }
          } else if (candidates.length === 1) {
            const only = candidates[0];
            if (text(only.id) === text(current.id)) {
              return {
                ok: true,
                lesson: current,
                conflict: false,
                ambiguous: false,
                needsOwnerChoice: false,
                error: "",
                candidates: [current],
              };
            }
          } else if (currentInCandidates) {
            return {
              ok: true,
              lesson: current,
              conflict: false,
              ambiguous: false,
              needsOwnerChoice: false,
              error: "",
              candidates: [current],
              usedCurrentDefault: true,
            };
          }
        }
      }
      if (candidates.length === 1 && text(candidates[0].id) !== text(current.id)) {
        return {
          ok: false,
          lesson: null,
          conflict: true,
          ambiguous: false,
          needsOwnerChoice: true,
          error: `This printable is being created from ${current.title || current.id}, but the pasted destination says ${candidates[0].title || pastedLessonRaw}. Choose which lesson should receive this resource.`,
          candidates: [current, candidates[0]],
          currentLesson: current,
          pastedLesson: candidates[0],
        };
      }
      if (candidates.length > 1) {
        return {
          ok: false,
          lesson: null,
          conflict: false,
          ambiguous: true,
          needsOwnerChoice: true,
          error: `Link to lesson ‘${pastedLessonRaw}’ matched more than one lesson. Choose the exact destination.`,
          candidates,
        };
      }
      if (!candidates.length) {
        return {
          ok: false,
          lesson: null,
          conflict: true,
          ambiguous: false,
          needsOwnerChoice: true,
          error: `This printable is being created from ${current.title || current.id}, but the pasted destination says ${pastedLessonRaw}. Choose which lesson should receive this resource.`,
          candidates: [current],
          currentLesson: current,
          pastedLesson: { title: pastedLessonRaw },
        };
      }
    }

    if (!pastedLessonRaw) {
      return {
        ok: false,
        lesson: null,
        conflict: false,
        ambiguous: false,
        needsOwnerChoice: false,
        error: "Link to lesson is required when Paste Printable Update is not opened from a lesson.",
        candidates: [],
      };
    }
    if (candidates.length === 1) {
      return {
        ok: true,
        lesson: candidates[0],
        conflict: false,
        ambiguous: false,
        needsOwnerChoice: false,
        error: "",
        candidates,
      };
    }
    if (candidates.length > 1) {
      return {
        ok: false,
        lesson: null,
        conflict: false,
        ambiguous: true,
        needsOwnerChoice: true,
        error: `Link to lesson ‘${pastedLessonRaw}’ matched more than one lesson. Choose the exact destination.`,
        candidates,
      };
    }
    return {
      ok: false,
      lesson: null,
      conflict: false,
      ambiguous: false,
      needsOwnerChoice: false,
      error: `Link to lesson ‘${pastedLessonRaw}’ was not recognized.`,
      candidates: [],
    };
  }

  /**
   * @param {ResourceLike | null | undefined} resource
   * @param {string} lessonPlanId
   */
  function existingLessonResourceLink(resource, lessonPlanId) {
    const id = text(lessonPlanId);
    if (!resource || !id) return false;
    return (Array.isArray(resource.lessonPlanIds) ? resource.lessonPlanIds : [])
      .map((item) => text(item))
      .includes(id);
  }

  /**
   * Parse pasted printable metadata. Does not mutate a form.
   * @param {unknown} pastedText
   * @param {{ knownTypes?: string[] }} [parseOptions]
   */
  function parsePrintablePaste(pastedText, parseOptions) {
    const knownTypes = parseOptions?.knownTypes;
    const sections = splitPrintableSections(pastedText);
    /** @type {Record<string, { raw: string, headingRaw: string }>} */
    const included = {};
    const unrecognized = [];
    const errors = [];

    sections.forEach((section) => {
      if (!section.fieldId) {
        if (text(section.body) || text(section.headingRaw)) {
          unrecognized.push({
            heading: section.headingRaw || "(untitled)",
            body: multiline(section.body).slice(0, 400),
          });
        }
        return;
      }
      included[section.fieldId] = {
        raw: section.fieldId === "description" || section.fieldId === "printingInstructions"
          ? multiline(section.body)
          : text(section.body),
        headingRaw: section.headingRaw,
        multilineRaw: multiline(section.body),
      };
    });

    /** @type {Record<string, unknown>} */
    const values = {};
    const includedFieldIds = Object.keys(included);

    if (included.title) values.title = included.title.raw;
    if (included.theme) values.theme = included.theme.raw;

    if (included.resourceType) {
      const typed = resolvePrintableType(included.resourceType.raw, knownTypes);
      if (typed.error) errors.push(typed.error);
      else values.resourceType = typed.value;
    }

    if (included.ageGroup) {
      const mapped = resolveAgeBandAlias(included.ageGroup.multilineRaw || included.ageGroup.raw);
      if (!mapped.display) {
        errors.push(`Age group ‘${text(included.ageGroup.raw)}’ was not recognized.`);
      } else {
        values.ageGroup = mapped.display;
      }
    }

    if (included.description) values.description = included.description.multilineRaw;
    if (included.printingInstructions) {
      values.printingInstructions = included.printingInstructions.multilineRaw;
    }

    if (included.pageCount) {
      const pages = parsePageCount(included.pageCount.raw);
      if (pages.error) errors.push(pages.error);
      else values.pageCount = pages.value;
    }

    if (included.accessLevel) {
      const access = resolveAccessLevel(included.accessLevel.raw);
      if (access.error) errors.push(access.error);
      else values.accessLevel = access.value;
    }

    if (included.resourcePlacement) {
      const placement = resolveResourcePlacement(included.resourcePlacement.raw);
      if (placement.error) errors.push(placement.error);
      else {
        values.resourcePlacement = placement.value;
        values.resourcePlacementLabel = placement.label;
      }
    } else {
      const placement = resolveResourcePlacement("");
      values.resourcePlacementDefault = placement.value;
      values.resourcePlacementLabel = placement.label;
    }

    if (included.linkToLesson) values.linkToLessonRaw = included.linkToLesson.raw;
    if (included.linkToActivity) {
      values.linkToActivityRaw = included.linkToActivity.raw;
      values.activityLinkUnsupported = true;
    }

    return {
      values,
      includedFieldIds,
      unrecognized,
      errors,
      valid: errors.length === 0,
    };
  }

  /**
   * @param {unknown} pastedText
   * @param {{
   *   currentLesson?: LessonLike | null,
   *   lessons?: LessonLike[],
   *   existingResource?: ResourceLike | null,
   *   ownerChosenLessonId?: string,
   *   knownTypes?: string[],
   *   fromLesson?: boolean,
   * }} [options]
   */
  function buildPrintablePastePreview(pastedText, options) {
    const parsed = parsePrintablePaste(pastedText, { knownTypes: options?.knownTypes });
    const fromLesson = options?.fromLesson !== false && Boolean(options?.currentLesson?.id);
    const lessonResult = parsed.valid
      ? resolveLinkedLesson({
        pastedLessonRaw: String(parsed.values.linkToLessonRaw || ""),
        ageDisplay: String(parsed.values.ageGroup || ""),
        currentLesson: options?.currentLesson || null,
        lessons: options?.lessons || [],
        ownerChosenLessonId: options?.ownerChosenLessonId || "",
      })
      : {
        ok: false,
        lesson: options?.currentLesson || null,
        conflict: false,
        ambiguous: false,
        needsOwnerChoice: false,
        error: parsed.errors[0] || "",
        candidates: [],
      };

    if (lessonResult.error && !parsed.errors.includes(lessonResult.error)) {
      parsed.errors.push(lessonResult.error);
    }

    const destinationLabel = String(parsed.values.resourcePlacementLabel || DESTINATION_LABEL);
    const linkedLesson = lessonResult.ok ? lessonResult.lesson : (fromLesson ? options.currentLesson : null);
    const alreadyLinked = existingLessonResourceLink(options?.existingResource, text(linkedLesson?.id));

    const previewRows = [];
    const pushRow = (label, value) => {
      previewRows.push({ label, value: value == null ? "" : String(value) });
    };
    if (parsed.values.title != null) pushRow("Title", parsed.values.title);
    if (parsed.values.resourceType != null) pushRow("Type", parsed.values.resourceType);
    if (parsed.values.ageGroup != null) pushRow("Age group", parsed.values.ageGroup);
    if (parsed.values.theme != null) pushRow("Theme", parsed.values.theme);
    pushRow("Linked lesson", linkedLesson?.title || (parsed.values.linkToLessonRaw ? String(parsed.values.linkToLessonRaw) : (fromLesson ? options.currentLesson?.title : "")));
    pushRow("Destination", destinationLabel);
    if (parsed.values.description != null) pushRow("Description", parsed.values.description);
    if (parsed.values.pageCount != null) pushRow("Page count", parsed.values.pageCount);
    if (parsed.values.accessLevel != null) {
      pushRow("Access", parsed.values.accessLevel === "free" ? "Free" : "Pro");
    }
    if (parsed.values.printingInstructions != null) {
      pushRow("Printing instructions", parsed.values.printingInstructions);
    }
    pushRow("PDF", options?.existingResource && (options.existingResource.fileData || options.existingResource.fileName)
      ? "Keeping existing PDF (not in paste)"
      : "Required — not uploaded yet");
    pushRow("Preview image", options?.existingResource && (options.existingResource.previewImageUrl || options.existingResource.previewUrl)
      ? "Keeping existing preview (not in paste)"
      : "Optional/not uploaded yet");
    pushRow("Status after save", "Draft");

    const detectedCount = parsed.includedFieldIds.filter((id) => FORM_FIELD_IDS.includes(id) || id === "linkToLesson" || id === "resourcePlacement").length;

    return {
      parsed,
      lessonResult,
      linkedLesson: linkedLesson || null,
      destination: DESTINATION_LINKED_PRINTABLES,
      destinationLabel,
      alreadyLinked,
      activityLinkUnsupported: parsed.values.activityLinkUnsupported === true,
      publishes: false,
      statusAfterSave: "draft",
      filesUntouched: true,
      previewRows,
      fieldsDetected: detectedCount,
      fieldsNotIncluded: MANUAL_FILE_FIELDS.slice(),
      canApply: parsed.errors.length === 0 && lessonResult.ok === true && !lessonResult.needsOwnerChoice,
      valid: parsed.errors.length === 0 && lessonResult.ok === true,
    };
  }

  /**
   * Safe merge: only form fields present in the paste. Never touches files or publish flags.
   * @param {Record<string, unknown>} draft
   * @param {ReturnType<typeof buildPrintablePastePreview>} preview
   */
  function applyPrintablePasteToDraft(draft, preview) {
    const next = draft && typeof draft === "object" ? { ...draft } : {};
    const values = preview?.parsed?.values || {};
    const included = new Set(preview?.parsed?.includedFieldIds || []);
    FORM_FIELD_IDS.forEach((fieldId) => {
      if (!included.has(fieldId)) return;
      if (!Object.prototype.hasOwnProperty.call(values, fieldId)) return;
      next[fieldId] = fieldId === "pageCount" ? String(values[fieldId]) : values[fieldId];
    });
    if (preview?.linkedLesson?.id) {
      next.pasteLinkedLessonPlanId = preview.linkedLesson.id;
    }
    if (preview?.destination) {
      next.pasteResourcePlacement = preview.destination;
    }
    return next;
  }

  return {
    CANONICAL_PRINTABLE_TYPE,
    CANONICAL_ACCESS,
    DESTINATION_LINKED_PRINTABLES,
    DESTINATION_LABEL,
    PRINTABLE_HEADING_ALIASES,
    FIELD_LABELS,
    FORM_FIELD_IDS,
    MANUAL_FILE_FIELDS,
    normalizePasteHeading,
    resolveAgeBandAlias,
    resolvePrintableType,
    resolveAccessLevel,
    parsePageCount,
    resolveResourcePlacement,
    resolveLinkedLesson,
    existingLessonResourceLink,
    parsePrintablePaste,
    buildPrintablePastePreview,
    applyPrintablePasteToDraft,
  };
});
