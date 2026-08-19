/**
 * Visual production briefs for Little Learner Hub lesson assets.
 *
 * Owner visual instructions are the source of truth. This module structures
 * those instructions into a typed VisualBrief and builds generation-ready
 * prompts without inventing visual direction.
 *
 * Does not generate pixels, attach assets, publish lessons, or mutate
 * existing image / printable / resource records.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHVisualProductionBrief = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @typedef {"ACTIVITY_IMAGE"|"PRINTABLE_PAGE"|"PRINTABLE_CARDS"|"HANDPRINT_FOOTPRINT_TEMPLATE"|"VISUAL_STRIP"|"LESSON_COVER"} VisualAssetType */
  /** @typedef {"REALISTIC_PHOTO"|"REALISTIC_CLASSROOM"|"FLAT_2D_ILLUSTRATION"|"CLEAN_PRINTABLE"|"SIMPLE_CHILDCARE_GRAPHIC"} VisualStyle */
  /** @typedef {"DRAFT"|"READY_FOR_REVIEW"|"NEEDS_REVIEW"|"APPROVED"|"GENERATED"|"ATTACHED"} VisualBriefStatus */

  const ASSET_TYPES = Object.freeze(/** @type {const} */ ([
    "ACTIVITY_IMAGE",
    "PRINTABLE_PAGE",
    "PRINTABLE_CARDS",
    "HANDPRINT_FOOTPRINT_TEMPLATE",
    "VISUAL_STRIP",
    "LESSON_COVER",
  ]));

  const VISUAL_STYLES = Object.freeze(/** @type {const} */ ([
    "REALISTIC_PHOTO",
    "REALISTIC_CLASSROOM",
    "FLAT_2D_ILLUSTRATION",
    "CLEAN_PRINTABLE",
    "SIMPLE_CHILDCARE_GRAPHIC",
  ]));

  const STATUSES = Object.freeze(/** @type {const} */ ([
    "DRAFT",
    "READY_FOR_REVIEW",
    "NEEDS_REVIEW",
    "APPROVED",
    "GENERATED",
    "ATTACHED",
  ]));

  const STATUS_LABELS = Object.freeze({
    DRAFT: "Draft",
    READY_FOR_REVIEW: "Ready for Review",
    NEEDS_REVIEW: "Needs Review",
    APPROVED: "Approved",
    GENERATED: "Generated",
    ATTACHED: "Attached",
  });

  const REALISTIC_STYLES = Object.freeze(new Set(["REALISTIC_PHOTO", "REALISTIC_CLASSROOM"]));
  const FLAT_PRINTABLE_STYLES = Object.freeze(new Set([
    "FLAT_2D_ILLUSTRATION",
    "CLEAN_PRINTABLE",
    "SIMPLE_CHILDCARE_GRAPHIC",
  ]));

  const REALISTIC_REQUIRED = Object.freeze([
    "realistic daycare or preschool environment",
    "real physical materials",
    "believable scale",
    "natural classroom lighting",
    "slightly imperfect real-world arrangement",
    "clear activity focus",
    "realistic textures",
  ]);

  const REALISTIC_FORBIDDEN = Object.freeze([
    "glossy CGI",
    "fake 3D cartoon objects",
    "blob characters",
    "plastic-looking people",
    "uncanny faces",
    "malformed hands",
    "extra fingers",
    "floating objects",
    "fantasy lighting",
    "artificial shine",
    "obvious AI artifacts",
    "excessively staged Pinterest-style scenes",
  ]);

  const FLAT_REQUIRED = Object.freeze([
    "flat 2D artwork",
    "crisp clean lines",
    "simple childcare-friendly design",
    "white or very light background",
    "high readability",
    "large elements",
    "uncluttered layout",
    "print-friendly design",
  ]);

  const FLAT_FORBIDDEN = Object.freeze([
    "puffy 3D cartoons",
    "blob/cartoon mascot style",
    "gradients unless explicitly requested",
    "shiny surfaces",
    "random text",
    "unnecessary decorations",
    "tiny crowded objects",
    "fake shadows or depth effects",
  ]);

  /** Permanent site credit. Never shorten or invent a different URL. */
  const BRAND_URL = "littlelearnershubbyleah.com";
  const BRANDING_REQUIRED = Object.freeze([
    `small but clearly readable website credit along the bottom edge: ${BRAND_URL}`,
    "place the credit on the bottom edge without covering important activity content",
    "keep placement consistent, intentional, and professional — not a large advertisement",
  ]);
  const BRANDING_FORBIDDEN = Object.freeze([
    "omitting littlelearnershubbyleah.com",
    "shortened or invented website URL",
    "large advertisement-style branding overlay",
  ]);
  const OMIT_BRANDING_PATTERN = /\b(?:omit|skip|without|no)\s+(?:the\s+)?(?:website(?:\s+credit)?|branding|url|littlelearnershubbyleah\.com)\b/i;

  const ASSET_TYPE_PATTERNS = Object.freeze([
    { type: "PRINTABLE_CARDS", pattern: /\b(printable\s+cards?|vocab(?:ulary)?\s+cards?|matching\s+cards?|card\s+set|flash\s*cards?)\b/i },
    { type: "HANDPRINT_FOOTPRINT_TEMPLATE", pattern: /\b(hand\s*-?\s*print|foot\s*-?\s*print|handprint|footprint)\b/i },
    { type: "VISUAL_STRIP", pattern: /\b(visual\s+strip|high[-\s]?contrast\s+strip|b\/w\s+strip|black\s+and\s+white\s+strip)\b/i },
    { type: "LESSON_COVER", pattern: /\b(lesson\s+cover|cover\s+image|cover\s+photo|cover\s+art)\b/i },
    { type: "ACTIVITY_IMAGE", pattern: /\b(activity\s+image|activity\s+photo|setup\s+(?:image|photo)|classroom\s+photo)\b/i },
    { type: "PRINTABLE_PAGE", pattern: /\b(printable(?:\s+page)?|white\s+page|coloring\s+page|template\s+page)\b/i },
  ]);

  const STYLE_PATTERNS = Object.freeze([
    { style: "REALISTIC_CLASSROOM", pattern: /\b(realistic\s+daycare|realistic\s+classroom|teacher\s+took\s+the\s+photo|daycare\s+setup|preschool\s+(?:setup|classroom))\b/i },
    { style: "REALISTIC_PHOTO", pattern: /\b(realistic\s+photo|photorealistic|real\s+photo|photograph)\b/i },
    { style: "FLAT_2D_ILLUSTRATION", pattern: /\b(flat\s*2d|2d\s+illustration|flat\s+illustration|flat\s+2-?d\s+artwork)\b/i },
    { style: "CLEAN_PRINTABLE", pattern: /\b(clean\s+printable|white\s+page|print[-\s]?friendly|simple\s+printable)\b/i },
    { style: "SIMPLE_CHILDCARE_GRAPHIC", pattern: /\b(simple\s+childcare(?:\s+graphic)?|simple\s+graphic|childcare[-\s]?friendly\s+(?:graphic|design))\b/i },
  ]);

  const VAGUE_PATTERN = /\b(maybe|perhaps|something\s+like|similar\s+to|whatever|i\s+guess|or\s+so|kind\s+of|sort\s+of|you\s+decide|up\s+to\s+you)\b/i;
  const NO_PEOPLE_PATTERN = /\b(no\s+(?:children|kids|people|child|faces)|without\s+(?:children|kids|people)|do\s+not\s+add\s+(?:children|people|kids))\b/i;
  const PEOPLE_REQUEST_PATTERN = /\b(include\s+(?:a\s+)?(?:child|children|kids|teacher|caregiver)|with\s+(?:a\s+)?(?:child|children|kids|teacher)|teacher(?:'s)?\s+hands?)\b/i;
  const FORBIDDEN_LINE_PATTERN = /^\s*(?:absolutely\s+)?(?:no|never|without|do\s+not\s+(?:include|add|use)|don't\s+(?:include|add|use))\b/i;

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function text(value) {
    return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function oneLine(value) {
    return text(value).replace(/\s+/g, " ").trim();
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeTitleKey(value) {
    return oneLine(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  /**
   * @param {unknown} value
   * @param {readonly string[]} allowed
   * @returns {string}
   */
  function pickAllowed(value, allowed) {
    const raw = text(value);
    return allowed.includes(raw) ? raw : "";
  }

  /**
   * @param {unknown} value
   * @returns {string[]}
   */
  function uniqueStrings(value) {
    const list = Array.isArray(value) ? value : (text(value) ? [value] : []);
    const seen = new Set();
    /** @type {string[]} */
    const out = [];
    list.forEach((item) => {
      const line = oneLine(item);
      if (!line) return;
      const key = line.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(line);
    });
    return out;
  }

  /**
   * @param {string} instruction
   * @returns {string[]}
   */
  function splitInstructionBlocks(instruction) {
    const raw = text(instruction);
    if (!raw) return [];
    const chunks = raw.split(/\n\s*\n+/).map((block) => text(block)).filter(Boolean);
    return chunks.length ? chunks : [raw];
  }

  /**
   * @param {string} block
   * @returns {{ title: string, bodyLines: string[] }}
   */
  function splitTitleAndBody(block) {
    const lines = text(block).split("\n").map((line) => text(line)).filter(Boolean);
    if (!lines.length) return { title: "", bodyLines: [] };
    const first = lines[0];
    const titled = /[:.]$/.test(first) || (first.length <= 80 && lines.length > 1 && ASSET_TYPE_PATTERNS.some((row) => row.pattern.test(lines[1])));
    if (titled) {
      return { title: first.replace(/[:.]\s*$/, "").trim(), bodyLines: lines.slice(1) };
    }
    return { title: "", bodyLines: lines };
  }

  /**
   * @param {string} source
   * @returns {VisualAssetType[]}
   */
  function detectAssetTypes(source) {
    /** @type {VisualAssetType[]} */
    const found = [];
    ASSET_TYPE_PATTERNS.forEach((row) => {
      if (row.pattern.test(source) && !found.includes(row.type)) found.push(/** @type {VisualAssetType} */ (row.type));
    });
    return found;
  }

  /**
   * @param {string} source
   * @returns {VisualStyle[]}
   */
  function detectVisualStyles(source) {
    /** @type {VisualStyle[]} */
    const found = [];
    STYLE_PATTERNS.forEach((row) => {
      if (row.pattern.test(source) && !found.includes(row.style)) found.push(/** @type {VisualStyle} */ (row.style));
    });
    return found;
  }

  /**
   * @param {string} source
   * @returns {string[]}
   */
  function extractForbiddenFromOwner(source) {
    const lines = text(source).split("\n").map((line) => text(line)).filter(Boolean);
    /** @type {string[]} */
    const out = [];
    lines.forEach((line) => {
      if (FORBIDDEN_LINE_PATTERN.test(line)) out.push(line.replace(/[.]+$/, "").trim());
    });
    const inline = source.match(/\b(?:absolutely\s+)?no\s+[^.!\n]+/gi) || [];
    inline.forEach((item) => {
      const cleaned = oneLine(item).replace(/[.]+$/, "");
      if (cleaned) out.push(cleaned);
    });
    return uniqueStrings(out);
  }

  /**
   * @param {string[]} bodyLines
   * @returns {{ materials: string[], composition: string[], environment: string[], required: string[] }}
   */
  function extractContentLines(bodyLines) {
    /** @type {string[]} */
    const materials = [];
    /** @type {string[]} */
    const composition = [];
    /** @type {string[]} */
    const environment = [];
    /** @type {string[]} */
    const required = [];
    bodyLines.forEach((line) => {
      if (!line) return;
      if (ASSET_TYPE_PATTERNS.some((row) => row.pattern.test(line) && oneLine(line).length < 40)) return;
      if (STYLE_PATTERNS.some((row) => row.pattern.test(line) && oneLine(line).length < 50)) return;
      if (FORBIDDEN_LINE_PATTERN.test(line)) return;
      required.push(line);
      if (/\b(bin|oats|scoop|cow|pig|horse|paint|paper|trunk|card|tray|bowl|spoon|glue|crayon|block|toy)\b/i.test(line)) {
        materials.push(line);
      }
      if (/\b(centered|bottom|top|left|right|filled|shallow|large\s+(?:blank|empty)|layout|border|title)\b/i.test(line)) {
        composition.push(line);
      }
      if (/\b(table|classroom|daycare|preschool|mat|rug|shelf|daylight|lighting|outdoor|window)\b/i.test(line)) {
        environment.push(line);
      }
    });
    return { materials, composition, environment, required };
  }

  /**
   * @param {string} source
   * @param {string[]} bodyLines
   * @returns {string}
   */
  function extractPeople(source, bodyLines) {
    if (NO_PEOPLE_PATTERN.test(source)) {
      const ownerLine = bodyLines.find((line) => NO_PEOPLE_PATTERN.test(line));
      return ownerLine || "No people. Do not add people.";
    }
    if (PEOPLE_REQUEST_PATTERN.test(source)) {
      const ownerLine = bodyLines.find((line) => PEOPLE_REQUEST_PATTERN.test(line));
      return ownerLine || oneLine(source.match(PEOPLE_REQUEST_PATTERN)?.[0] || "");
    }
    return "If people are not necessary, do not add people.";
  }

  /**
   * @param {VisualStyle|""} visualStyle
   * @returns {string}
   */
  function realismLevelForStyle(visualStyle) {
    if (REALISTIC_STYLES.has(visualStyle)) return "realistic_classroom_photo";
    if (visualStyle === "FLAT_2D_ILLUSTRATION") return "flat_2d_illustration";
    if (visualStyle === "CLEAN_PRINTABLE") return "clean_printable";
    if (visualStyle === "SIMPLE_CHILDCARE_GRAPHIC") return "simple_childcare_graphic";
    return "";
  }

  /**
   * @param {object} params
   * @param {VisualAssetType|""} params.assetType
   * @param {VisualStyle|""} params.visualStyle
   * @param {string} params.activityName
   * @param {string[]} params.requiredElements
   * @param {string[]} params.forbiddenElements
   * @param {string} params.people
   * @param {string} params.environment
   * @param {string} params.composition
   * @param {string} params.materials
   * @param {string} params.printableLayout
   * @param {string} params.subject
   * @param {string} params.originalInstruction
   * @returns {{ generationPrompt: string, negativePrompt: string }}
   */
  function buildGenerationPrompts(params) {
    const style = params.visualStyle;
    const styleRequired = REALISTIC_STYLES.has(style)
      ? REALISTIC_REQUIRED
      : (FLAT_PRINTABLE_STYLES.has(style) ? FLAT_REQUIRED : []);
    const styleForbidden = REALISTIC_STYLES.has(style)
      ? REALISTIC_FORBIDDEN
      : (FLAT_PRINTABLE_STYLES.has(style) ? FLAT_FORBIDDEN : []);
    const ownerLines = text(params.originalInstruction).split("\n").map((line) => text(line)).filter(Boolean);

    const promptParts = [
      "OWNER VISUAL DIRECTION (source of truth — preserve exactly, do not reinterpret):",
      ...ownerLines.map((line) => `- ${line}`),
      "",
      "STRUCTURED REQUIREMENTS:",
      params.activityName ? `- Activity name: ${params.activityName}` : "",
      params.assetType ? `- Asset type: ${params.assetType}` : "",
      params.visualStyle ? `- Visual style: ${params.visualStyle}` : "",
      params.subject ? `- Subject: ${params.subject}` : "",
      params.composition ? `- Composition: ${params.composition}` : "",
      params.materials ? `- Materials: ${params.materials}` : "",
      params.environment ? `- Environment: ${params.environment}` : "",
      params.people ? `- People: ${params.people}` : "",
      params.printableLayout ? `- Printable layout: ${params.printableLayout}` : "",
      params.requiredElements.length ? `- Required elements: ${params.requiredElements.join("; ")}` : "",
      params.forbiddenElements.length ? `- Forbidden elements: ${params.forbiddenElements.join("; ")}` : "",
    ].filter((line, index, all) => !(line === "" && all[index - 1] === ""));

    if (styleRequired.length) {
      promptParts.push("", "MANDATORY STYLE RULES:");
      styleRequired.forEach((rule) => promptParts.push(`- Require: ${rule}`));
    }
    promptParts.push("- Do not invent extra subjects, decorations, people, or props beyond the owner direction.");
    if (params.includeBranding !== false) {
      promptParts.push("", "PERMANENT BRANDING (required unless the owner explicitly omitted it for this asset):");
      BRANDING_REQUIRED.forEach((rule) => promptParts.push(`- Require: ${rule}`));
      promptParts.push(`- Use the exact spelling ${BRAND_URL}. Never shorten or invent a different URL.`);
    }

    const negative = uniqueStrings([
      ...params.forbiddenElements,
      ...styleForbidden,
      ...(params.includeBranding === false ? [] : BRANDING_FORBIDDEN),
    ]);

    return {
      generationPrompt: promptParts.filter((line) => line !== undefined).join("\n").trim(),
      negativePrompt: negative.join("; "),
    };
  }

  /**
   * @param {object} [activity]
   * @returns {{ id: string, itemId: string, title: string }}
   */
  function activityRef(activity) {
    const entry = activity && typeof activity === "object" ? activity : {};
    return {
      id: text(entry.id || entry.activityId),
      itemId: text(entry.itemId),
      title: text(entry.title || entry.activityName || entry.name),
    };
  }

  /**
   * @param {string} activityName
   * @param {object[]} activities
   * @returns {{ activityId: string, reviewFlag: string }}
   */
  function matchActivity(activityName, activities) {
    const want = normalizeTitleKey(activityName);
    if (!want) return { activityId: "", reviewFlag: "" };
    const list = Array.isArray(activities) ? activities.map(activityRef).filter((item) => item.title) : [];
    const exact = list.filter((item) => normalizeTitleKey(item.title) === want);
    if (exact.length === 1) return { activityId: exact[0].id || exact[0].itemId, reviewFlag: "" };
    if (exact.length > 1) return { activityId: "", reviewFlag: "ambiguous_activity_match" };
    const partial = list.filter((item) => {
      const have = normalizeTitleKey(item.title);
      return have.includes(want) || want.includes(have);
    });
    if (partial.length === 1) return { activityId: partial[0].id || partial[0].itemId, reviewFlag: "" };
    if (partial.length > 1) return { activityId: "", reviewFlag: "ambiguous_activity_match" };
    return { activityId: "", reviewFlag: "unmatched_activity" };
  }

  /**
   * Convert one owner visual instruction into a VisualBrief without inventing direction.
   *
   * @param {object} input
   * @param {string} [input.lessonId]
   * @param {string} [input.instruction]
   * @param {string} [input.activityId]
   * @param {string} [input.activityName]
   * @param {string} [input.assetType]
   * @param {string} [input.visualStyle]
   * @param {object[]} [input.activities]
   * @param {string} [input.now]
   * @param {string} [input.id]
   * @returns {VisualBrief}
   */
  function createVisualBriefFromInstruction(input) {
    const source = input && typeof input === "object" ? input : {};
    const originalInstruction = text(source.instruction || source.originalInstruction);
    const now = text(source.now) || new Date().toISOString();
    const { title, bodyLines } = splitTitleAndBody(originalInstruction);
    const activityName = text(source.activityName) || title;
    const allText = [originalInstruction, activityName].filter(Boolean).join("\n");

    const bodyText = bodyLines.join("\n");
    const bodyTypes = detectAssetTypes(bodyText);
    const allTypes = detectAssetTypes(allText);
    const detectedTypes = bodyTypes.length ? bodyTypes : allTypes;
    const bodyStyles = detectVisualStyles(bodyText);
    const allStyles = detectVisualStyles(allText);
    const detectedStyles = bodyStyles.length ? bodyStyles : allStyles;
    /** @type {string[]} */
    const reviewFlags = [];

    let assetType = pickAllowed(source.assetType, ASSET_TYPES);
    if (!assetType) {
      if (detectedTypes.length === 1) assetType = detectedTypes[0];
      else if (detectedTypes.length > 1) reviewFlags.push("conflicting_asset_type");
      else reviewFlags.push("missing_asset_type");
    }

    let visualStyle = pickAllowed(source.visualStyle, VISUAL_STYLES);
    if (!visualStyle) {
      if (detectedStyles.length === 1) visualStyle = detectedStyles[0];
      else if (detectedStyles.length > 1) reviewFlags.push("conflicting_visual_style");
      else reviewFlags.push("missing_visual_style");
    }

    const content = extractContentLines(bodyLines.length ? bodyLines : originalInstruction.split("\n").map((line) => text(line)).filter(Boolean));
    const people = extractPeople(allText, bodyLines);
    const ownerForbidden = extractForbiddenFromOwner(originalInstruction);
    const styleForbidden = REALISTIC_STYLES.has(visualStyle)
      ? REALISTIC_FORBIDDEN.slice()
      : (FLAT_PRINTABLE_STYLES.has(visualStyle) ? FLAT_FORBIDDEN.slice() : []);
    const includeBranding = !OMIT_BRANDING_PATTERN.test(originalInstruction);
    const forbiddenElements = uniqueStrings([
      ...ownerForbidden,
      ...styleForbidden,
      ...(includeBranding ? BRANDING_FORBIDDEN : []),
    ]);
    const requiredElements = uniqueStrings([
      ...(REALISTIC_STYLES.has(visualStyle) ? REALISTIC_REQUIRED : []),
      ...(FLAT_PRINTABLE_STYLES.has(visualStyle) ? FLAT_REQUIRED : []),
      ...(includeBranding ? BRANDING_REQUIRED : []),
      ...content.required,
    ]);

    const printableLayout = (assetType === "PRINTABLE_PAGE"
      || assetType === "PRINTABLE_CARDS"
      || assetType === "HANDPRINT_FOOTPRINT_TEMPLATE"
      || assetType === "VISUAL_STRIP")
      ? uniqueStrings(content.composition.length ? content.composition : content.required).join(" ")
      : "";

    const subject = uniqueStrings([
      activityName,
      ...content.required.slice(0, 4),
    ]).join(". ");

    let activityId = text(source.activityId);
    const match = matchActivity(activityName, source.activities || []);
    if (!activityId && match.activityId) activityId = match.activityId;
    if (activityName && (source.activities || []).length && match.reviewFlag) {
      reviewFlags.push(match.reviewFlag);
    }
    if (assetType === "ACTIVITY_IMAGE" && activityName && !activityId && match.reviewFlag === "unmatched_activity") {
      reviewFlags.push("unmatched_activity");
    }
    if (!text(source.lessonId)) reviewFlags.push("missing_lesson_id");
    if (VAGUE_PATTERN.test(originalInstruction)) reviewFlags.push("ambiguous_owner_language");
    if (!originalInstruction) reviewFlags.push("missing_instruction");
    if (NO_PEOPLE_PATTERN.test(allText) && PEOPLE_REQUEST_PATTERN.test(allText) && !NO_PEOPLE_PATTERN.test(people)) {
      reviewFlags.push("ambiguous_people");
    }

    const uniqueFlags = uniqueStrings(reviewFlags);
    const prompts = buildGenerationPrompts({
      assetType,
      visualStyle,
      activityName,
      requiredElements: content.required,
      forbiddenElements,
      people,
      environment: uniqueStrings(content.environment).join(" "),
      composition: uniqueStrings(content.composition).join(" "),
      materials: uniqueStrings(content.materials).join(" "),
      printableLayout,
      subject,
      originalInstruction,
      includeBranding,
    });

    const status = uniqueFlags.length || !assetType || !visualStyle || !originalInstruction
      ? "NEEDS_REVIEW"
      : "READY_FOR_REVIEW";

    return normalizeVisualBrief({
      id: text(source.id),
      lessonId: text(source.lessonId),
      activityId,
      activityName,
      assetType,
      visualStyle,
      subject,
      composition: uniqueStrings(content.composition).join(" "),
      materials: uniqueStrings(content.materials).join(" "),
      environment: uniqueStrings(content.environment).join(" "),
      people,
      realismLevel: realismLevelForStyle(visualStyle),
      printableLayout,
      requiredElements,
      forbiddenElements,
      generationPrompt: prompts.generationPrompt,
      negativePrompt: prompts.negativePrompt,
      status,
      originalInstruction,
      reviewFlags: uniqueFlags,
      createdAt: now,
      updatedAt: now,
    }, { now });
  }

  /**
   * @param {string} instruction
   * @param {object} [context]
   * @returns {ReturnType<typeof createVisualBriefFromInstruction>[]}
   */
  function createVisualBriefsFromInstructions(instruction, context) {
    const blocks = splitInstructionBlocks(instruction);
    const shared = context && typeof context === "object" ? context : {};
    return blocks.map((block) => createVisualBriefFromInstruction({
      ...shared,
      instruction: block,
    }));
  }

  /**
   * @param {unknown} value
   * @param {{ now?: string, preserveId?: boolean }} [options]
   * @returns {VisualBrief}
   */
  function normalizeVisualBrief(value, options) {
    const entry = value && typeof value === "object" ? value : {};
    const now = text(options?.now) || new Date().toISOString();
    const assetType = pickAllowed(entry.assetType, ASSET_TYPES);
    const visualStyle = pickAllowed(entry.visualStyle, VISUAL_STYLES);
    const status = pickAllowed(entry.status, STATUSES) || "DRAFT";
    const id = text(entry.id) || `vb-${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-6)}`;
    return {
      id,
      lessonId: text(entry.lessonId).slice(0, 160),
      activityId: text(entry.activityId).slice(0, 160),
      activityName: text(entry.activityName).slice(0, 180),
      assetType,
      visualStyle,
      subject: text(entry.subject).slice(0, 4000),
      composition: text(entry.composition).slice(0, 4000),
      materials: text(entry.materials).slice(0, 4000),
      environment: text(entry.environment).slice(0, 4000),
      people: text(entry.people).slice(0, 1000),
      realismLevel: text(entry.realismLevel).slice(0, 80),
      printableLayout: text(entry.printableLayout).slice(0, 4000),
      requiredElements: uniqueStrings(entry.requiredElements).slice(0, 40),
      forbiddenElements: uniqueStrings(entry.forbiddenElements).slice(0, 40),
      generationPrompt: text(entry.generationPrompt).slice(0, 12000),
      negativePrompt: text(entry.negativePrompt).slice(0, 4000),
      status: /** @type {VisualBriefStatus} */ (status),
      originalInstruction: text(entry.originalInstruction).slice(0, 12000),
      reviewFlags: uniqueStrings(entry.reviewFlags).slice(0, 20),
      createdAt: text(entry.createdAt) || now,
      updatedAt: text(entry.updatedAt) || now,
    };
  }

  /**
   * @param {unknown} value
   * @returns {{ briefs: ReturnType<typeof normalizeVisualBrief>[], updatedAt: string }}
   */
  function normalizeVisualProductionStore(value) {
    const entry = value && typeof value === "object" ? value : {};
    const briefs = Array.isArray(entry.briefs) ? entry.briefs.map((item) => normalizeVisualBrief(item)) : [];
    return {
      briefs,
      updatedAt: text(entry.updatedAt),
    };
  }

  /**
   * Admin review card — never includes generated pixels or attachment side effects.
   *
   * @param {ReturnType<typeof normalizeVisualBrief>} brief
   */
  function toReviewCard(brief) {
    const item = normalizeVisualBrief(brief);
    return {
      id: item.id,
      lessonId: item.lessonId,
      activityId: item.activityId,
      activityName: item.activityName,
      assetType: item.assetType,
      visualStyle: item.visualStyle,
      originalInstruction: item.originalInstruction,
      structuredBrief: {
        subject: item.subject,
        composition: item.composition,
        materials: item.materials,
        environment: item.environment,
        people: item.people,
        realismLevel: item.realismLevel,
        printableLayout: item.printableLayout,
        requiredElements: item.requiredElements,
      },
      generationPrompt: item.generationPrompt,
      negativePrompt: item.negativePrompt,
      forbiddenElements: item.forbiddenElements,
      status: item.status,
      statusLabel: STATUS_LABELS[item.status] || item.status,
      reviewFlags: item.reviewFlags,
      canApprove: item.status === "READY_FOR_REVIEW",
      canGenerate: false,
      canAttach: false,
      generateBlockedReason: item.status === "APPROVED"
        ? "No image-generation provider is configured. This brief stays APPROVED until a real provider exists. Nothing will be attached."
        : "Approve this planned visual before any generation action.",
      attachBlockedReason: "Assets are never attached automatically. Attachment requires GENERATED status plus an explicit target asset identified by the owner.",
    };
  }

  /**
   * Explicit status transitions only. READY_FOR_REVIEW never becomes APPROVED automatically.
   *
   * @param {ReturnType<typeof normalizeVisualBrief>} brief
   * @param {VisualBriefStatus} nextStatus
   * @param {object} [options]
   * @returns {{ ok: boolean, brief: ReturnType<typeof normalizeVisualBrief>, error?: string }}
   */
  function transitionVisualBriefStatus(brief, nextStatus, options) {
    const current = normalizeVisualBrief(brief);
    const next = pickAllowed(nextStatus, STATUSES);
    const opts = options && typeof options === "object" ? options : {};
    const now = text(opts.now) || new Date().toISOString();
    if (!next) return { ok: false, brief: current, error: "Unknown status." };

    /** @type {Record<string, string[]>} */
    const allowed = {
      DRAFT: ["READY_FOR_REVIEW", "NEEDS_REVIEW"],
      READY_FOR_REVIEW: ["NEEDS_REVIEW", "APPROVED"],
      NEEDS_REVIEW: ["READY_FOR_REVIEW", "DRAFT"],
      APPROVED: ["GENERATED", "NEEDS_REVIEW", "READY_FOR_REVIEW"],
      GENERATED: ["ATTACHED", "NEEDS_REVIEW"],
      ATTACHED: ["NEEDS_REVIEW"],
    };
    if (current.status === next) return { ok: true, brief: current };
    if (!(allowed[current.status] || []).includes(next)) {
      return { ok: false, brief: current, error: `Cannot move from ${current.status} to ${next}.` };
    }
    if (current.status === "READY_FOR_REVIEW" && next === "APPROVED" && opts.confirmApprove !== true) {
      return { ok: false, brief: current, error: "Approval requires an explicit confirmApprove step." };
    }
    if (current.status === "APPROVED" && next === "GENERATED") {
      return {
        ok: false,
        brief: current,
        error: "No image-generation provider is configured in this project. Status stays APPROVED. Nothing was generated or attached.",
      };
    }
    if (next === "ATTACHED") {
      return { ok: false, brief: current, error: "Attachment is blocked. Identify an exact existing asset for replacement and confirm attach; this workflow does not auto-attach." };
    }
    if (next === "READY_FOR_REVIEW" && (current.reviewFlags.length || !current.assetType || !current.visualStyle || !current.originalInstruction)) {
      return {
        ok: false,
        brief: current,
        error: "Cannot mark READY_FOR_REVIEW while required fields are missing or flagged NEEDS_REVIEW.",
      };
    }
    return {
      ok: true,
      brief: normalizeVisualBrief({ ...current, status: next, updatedAt: now }, { now }),
    };
  }

  /**
   * Owner field edits never skip to APPROVED / GENERATED / ATTACHED.
   *
   * @param {ReturnType<typeof normalizeVisualBrief>} brief
   * @param {object} patch
   */
  function applyVisualBriefPatch(brief, patch) {
    const current = normalizeVisualBrief(brief);
    const incoming = patch && typeof patch === "object" ? patch : {};
    const now = text(incoming.updatedAt) || new Date().toISOString();
    const next = normalizeVisualBrief({
      ...current,
      ...incoming,
      id: current.id,
      lessonId: text(incoming.lessonId) || current.lessonId,
      status: current.status === "APPROVED" || current.status === "GENERATED" || current.status === "ATTACHED"
        ? "READY_FOR_REVIEW"
        : current.status,
      createdAt: current.createdAt,
      updatedAt: now,
    }, { now });
    if (incoming.status && incoming.status !== current.status) {
      return { ok: false, brief: current, error: "Use the explicit status transition action. Edits cannot approve, generate, or attach." };
    }
    if (!next.assetType || !next.visualStyle || !next.originalInstruction || next.reviewFlags.length) {
      next.status = "NEEDS_REVIEW";
    } else if (next.status === "DRAFT") {
      next.status = "READY_FOR_REVIEW";
    }
    return { ok: true, brief: next };
  }

  return {
    ASSET_TYPES,
    VISUAL_STYLES,
    STATUSES,
    STATUS_LABELS,
    REALISTIC_REQUIRED,
    REALISTIC_FORBIDDEN,
    FLAT_REQUIRED,
    FLAT_FORBIDDEN,
    BRAND_URL,
    BRANDING_REQUIRED,
    BRANDING_FORBIDDEN,
    text,
    normalizeVisualBrief,
    normalizeVisualProductionStore,
    createVisualBriefFromInstruction,
    createVisualBriefsFromInstructions,
    toReviewCard,
    transitionVisualBriefStatus,
    applyVisualBriefPatch,
    matchActivity,
  };
});
