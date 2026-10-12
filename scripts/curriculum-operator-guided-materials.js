/**
 * Guided “plan it with my materials” intake — conversational owner supplies
 * activities, books, printables, images, and instructions; operator preserves them.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
function createApi() {
  return require("./curriculum-operator-create.js");
}

const knowledge = require("./curriculum-operator-childcare-knowledge.js");
const ageSafety = require("./curriculum-operator-guided-age-safety.js");

const FIELDS_AI_FILLS = Object.freeze(knowledge.fieldsAiShouldFill());

const GUIDED_CONFIRM_REASON = "guided_materials_confirmation_required";

function text(value, max = 2000) {
  return schema.text(value, max);
}

function splitList(raw) {
  return String(raw || "")
    .split(/\s*,\s*|\s+(?:and|&)\s+/i)
    .map((item) => text(item, 180).replace(/^(?:and|&)\s+/i, "").trim())
    .filter((item) => item.length >= 2);
}

function extractSuppliedActivities(rawCommand) {
  const raw = text(rawCommand, 4000);
  const fromCreate = createApi().extractRequestedActivities(raw);
  const patterns = [
    /\buse\s+these\s+(?:\d+\s+)?activities?\s*:?\s*([^.!?]{3,900})/i,
    /\b(?:four|five|six|seven|eight|three|two|\d{1,2})\s+activities?\s*:?\s*([^.!?]{3,900})/i,
    /\bactivity\s+ideas?\s*:?\s*([^.!?]{3,900})/i,
    /\bhere\s+are\s+(?:\d+\s+)?activity\s+ideas?\s*:?\s*([^.!?]{3,900})/i,
  ];
  let merged = [...fromCreate];
  patterns.forEach((re) => {
    const m = raw.match(re);
    if (m) merged = merged.concat(splitList(m[1]));
  });
  const seen = new Set();
  return merged
    .map((title) => text(title, 180))
    .filter((title) => {
      const key = title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return title.length >= 3;
    })
    .slice(0, 24)
    .map((title) => ({
      title,
      preserveCore: true,
      ownerInstructions: "",
      section: "daily_activity",
    }));
}

function extractSuppliedBooks(rawCommand) {
  const raw = text(rawCommand, 4000);
  const books = [];
  const seen = new Set();
  const push = (title, link = "", notes = "") => {
    const t = text(title, 180);
    if (!t || t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    books.push({
      title: t,
      link: text(link, 500),
      notes: text(notes, 400),
      section: "book_resource",
    });
  };
  let m = raw.match(/\buse\s+the\s+book\s+(.+?)(?:\.|,|\s+make\b|\s+with\b|$)/i);
  if (m) push(m[1]);
  m = raw.match(/\bbook\s+(?:title|titles)?\s*:?\s*([^.!?]{3,400})/i);
  if (m) splitList(m[1]).forEach((t) => push(t));
  const linkRe = /(https?:\/\/[^\s)]+)[^\n]{0,80}\bbook\b|(?:book|read)\s+(https?:\/\/[^\s)]+)/gi;
  let linkMatch = linkRe.exec(raw);
  while (linkMatch) {
    const link = linkMatch[1] || linkMatch[2];
    push("Linked book", link, "Owner supplied link");
    linkMatch = linkRe.exec(raw);
  }
  const quoted = raw.match(/book\s+[“"]([^”"]{2,120})[”"]/i);
  if (quoted) push(quoted[1]);
  m = raw.match(/\b(?:three|five|\d{1,2})\s+book\s+ideas?\s*:?\s*([^.!?]{3,500})/i);
  if (m) splitList(m[1]).forEach((t) => push(t));
  return books.slice(0, 12);
}

function extractPrintableSpecifications(rawCommand, explicitPrintables = []) {
  const raw = text(rawCommand, 4000);
  const specs = [];
  const seen = new Set();
  explicitPrintables.forEach((req) => {
    const title = text(req.title, 180);
    if (!title) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    specs.push({
      title,
      activityHint: text(req.activityHint, 120),
      resourceType: text(req.resourceType, 40) || "other",
      ownerExplicitPrintable: req.ownerExplicitPrintable === true,
      letterSize: /\bletter[- ]size\b/i.test(raw),
      pageCountRequested: /\bhow many pages\b/i.test(raw),
      ownerInstructions: "",
      section: "printable_resource",
    });
  });
  const multi = raw.match(/\bprintable\s+with\s+(.+?)(?:\.|$)/i);
  if (multi) {
    splitList(multi[1]).forEach((part) => {
      const title = text(part, 180);
      if (!title || seen.has(title.toLowerCase())) return;
      seen.add(title.toLowerCase());
      specs.push({
        title: title.charAt(0).toUpperCase() + title.slice(1),
        activityHint: "",
        resourceType: /count/i.test(title) ? "counting_mat" : (/sequenc|sort|color|card/i.test(title) ? "picture_cards" : "other"),
        ownerExplicitPrintable: true,
        letterSize: /\bletter[- ]size\b/i.test(raw),
        pageCountRequested: true,
        ownerInstructions: text(raw.match(/\bmake\s+a\s+printable\s+like\s+this\s+example[^.!?]*/i)?.[0] || "", 400),
        section: "printable_resource",
      });
    });
  }
  const likeExample = /\bprintable\s+like\s+this\s+example\b/i.test(raw);
  if (likeExample && !specs.length) {
    specs.push({
      title: "Owner-requested printable",
      activityHint: "",
      resourceType: "other",
      ownerExplicitPrintable: true,
      letterSize: true,
      pageCountRequested: true,
      ownerInstructions: "Match learning purpose and layout structure with original child-safe artwork (no copyrighted copy).",
      section: "printable_resource",
    });
  }
  return specs.slice(0, 6);
}

function extractSuppliedMaterials(rawCommand) {
  const raw = text(rawCommand, 4000);
  const items = [];
  const m = raw.match(/\bmaterials?\s*:?\s*([^.!?]{3,500})/i);
  if (m) splitList(m[1]).forEach((t) => items.push({ name: text(t, 120), section: "activity_materials" }));
  return items.slice(0, 24);
}

function extractKeepReplaceDirectives(rawCommand) {
  const raw = text(rawCommand, 4000);
  const keep = [];
  const replace = [];
  const keepRe = /\bkeep\s+(?:the\s+)?(?:existing\s+)?(.+?)(?:\.|,|\s+but\b|\s+and\b|\s+replace\b|$)/gi;
  let m = keepRe.exec(raw);
  while (m) {
    keep.push({ target: text(m[1], 120), section: "asset_preserve" });
    m = keepRe.exec(raw);
  }
  const replaceRe = /\breplace\s+(?:the\s+)?(.+?)(?:\.|,|\s+with\b|\s+only\b|$)/gi;
  m = replaceRe.exec(raw);
  while (m) {
    replace.push({ target: text(m[1], 120), section: "asset_replace", requiresEvidence: true });
    m = replaceRe.exec(raw);
  }
  if (/\bkeep valid existing\b/i.test(raw)) keep.push({ target: "valid existing assets", section: "asset_preserve" });
  return { keep: keep.slice(0, 12), replace: replace.slice(0, 12) };
}

function extractOwnerResearchNotes(rawCommand) {
  const raw = text(rawCommand, 4000);
  const notes = [];
  const patterns = [
    /\b(?:i found|i researched|here is what i found|already know)\s+([^.!?]{10,500})/i,
    /\bresearch notes?\s*:?\s*([^.!?]{10,500})/i,
  ];
  patterns.forEach((re) => {
    const m = raw.match(re);
    if (m) notes.push({ text: text(m[1], 500), section: "owner_research_context", fabricated: false });
  });
  return notes.slice(0, 6);
}

function extractExactPictureInstructions(rawCommand) {
  const raw = text(rawCommand, 4000);
  const lines = [];
  const re = /\b(?:exact picture instructions|picture instructions|for the image)\s*:?\s*([^.!?]{10,500})/gi;
  let m = re.exec(raw);
  while (m) {
    lines.push(text(m[1], 500));
    m = re.exec(raw);
  }
  if (/\bdo not add text, logos/i.test(raw)) {
    lines.push(text(raw.match(/\bdo not add text[^.!?]*/i)?.[0] || "", 400));
  }
  return lines.slice(0, 6);
}

function extractExactPrintableInstructions(rawCommand) {
  const raw = text(rawCommand, 4000);
  const lines = [];
  const re = /\b(?:exact printable instructions|printable instructions)\s*:?\s*([^.!?]{10,500})/gi;
  let m = re.exec(raw);
  while (m) {
    lines.push(text(m[1], 500));
    m = re.exec(raw);
  }
  return lines.slice(0, 6);
}

function extractImageRequests(rawCommand) {
  const raw = text(rawCommand, 4000);
  const images = [];
  if (/\b(cover\s+(?:photo|image)|realistic\s+cover)\b/i.test(raw)) {
    images.push({
      kind: "cover",
      instructions: text(raw.match(/\b(?:make|create)\s+(?:a\s+)?realistic\s+cover[^.!?]*/i)?.[0] || "Realistic cover photo matching lesson theme.", 400),
      section: "cover_image",
    });
  }
  if (/\b(reference|this\s+picture|uploaded|attached)\b/i.test(raw) && /\b(image|photo|picture|scene)\b/i.test(raw)) {
    images.push({
      kind: "activity_reference",
      instructions: text(
        raw.match(/\buse\s+this\s+(?:picture|image|photo)[^.!?]*/i)?.[0]
        || raw.match(/\bre-create\s+the\s+scene[^.!?]*/i)?.[0]
        || "Use owner reference for composition and style only; no logos, text overlays, or copyrighted copy.",
        500,
      ),
      section: "activity_image",
    });
  }
  if (/\brealistic\s+(?:childcare|activity)\s+photo\b/i.test(raw)) {
    images.push({
      kind: "activity",
      instructions: text(raw.match(/\brealistic[^.!?]*(?:photo|image)[^.!?]*/i)?.[0] || "Realistic exact-activity childcare photo.", 400),
      section: "activity_image",
    });
  }
  return images.slice(0, 8);
}

function normalizeAttachments(attachments = []) {
  return schema.asArray(attachments)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const id = text(item.id || item.attachmentId || `att-${index + 1}`, 80);
      const purpose = text(item.purpose || item.role || "reference", 40).toLowerCase();
      return {
        id,
        fileName: text(item.fileName || item.name, 180),
        mimeType: text(item.mimeType || item.type, 80),
        purpose,
        ownerInstructions: text(item.instructions || item.caption || "", 500),
        section: purpose.includes("printable") ? "printable_reference" : "image_reference",
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function detectOwnerSuppliedContent(rawCommand, attachments = []) {
  const raw = text(rawCommand, 4000);
  const activities = extractSuppliedActivities(raw);
  const books = extractSuppliedBooks(raw);
  const explicit = createApi().extractExplicitPrintableRequests(raw);
  const printables = extractPrintableSpecifications(raw, explicit);
  const images = extractImageRequests(raw);
  const referenceImages = normalizeAttachments(attachments);
  return (
    activities.length > 0
    || books.length > 0
    || printables.length > 0
    || images.length > 0
    || referenceImages.length > 0
    || /\b(fill in|missing steps|keep the activity idea|place it into the lesson)\b/i.test(raw)
  );
}

function enrichCreationBrief(brief, rawCommand, options = {}) {
  const raw = text(rawCommand, 4000);
  const activities = extractSuppliedActivities(raw);
  const books = extractSuppliedBooks(raw);
  const explicit = schema.asArray(brief.explicitPrintables).length
    ? brief.explicitPrintables
    : createApi().extractExplicitPrintableRequests(raw);
  const printables = extractPrintableSpecifications(raw, explicit);
  const images = extractImageRequests(raw);
  const referenceImages = normalizeAttachments(options.attachments);
  const materials = extractSuppliedMaterials(raw);
  const keepReplace = extractKeepReplaceDirectives(raw);
  const researchNotes = extractOwnerResearchNotes(raw);
  const pictureInstructions = extractExactPictureInstructions(raw);
  const printableInstructions = extractExactPrintableInstructions(raw);
  if (printableInstructions.length) {
    const exactPrintableText = printableInstructions.join(" ");
    printables.forEach((p) => {
      // eslint-disable-next-line no-param-reassign
      p.ownerInstructions = exactPrintableText;
    });
  }
  if (pictureInstructions.length) {
    images.forEach((img, i) => {
      if (!img.instructions || img.instructions.length < 20) {
        // eslint-disable-next-line no-param-reassign
        img.instructions = pictureInstructions[i] || pictureInstructions[0];
      }
    });
  }
  const ownerInstructions = [];
  const actInstr = raw.match(/\b(?:exact instructions|instructions for)[^.!?]{0,40}:?\s*([^.!?]{10,500})/i);
  if (actInstr) ownerInstructions.push(text(actInstr[1], 500));
  const keepIdea = raw.match(/\bkeep the activity idea[^.!?]*/i);
  if (keepIdea) ownerInstructions.push(text(keepIdea[0], 300));
  pictureInstructions.forEach((line) => ownerInstructions.push(`Picture: ${line}`));
  printableInstructions.forEach((line) => ownerInstructions.push(`Printable: ${line}`));

  const requestedActivities = [...schema.asArray(brief.requestedActivities)];
  activities.forEach((a) => {
    if (!requestedActivities.some((t) => t.toLowerCase() === a.title.toLowerCase())) {
      requestedActivities.push(a.title);
    }
  });

  const ownerMaterials = {
    activities,
    books,
    materials,
    printables,
    images,
    referenceImages,
    keep: keepReplace.keep,
    replace: keepReplace.replace,
    researchNotes,
    ownerInstructions,
    fieldsAiWillFill: FIELDS_AI_FILLS.slice(),
    fieldsOwnerSupplied: [
      ...(activities.length ? ["activity titles and core ideas"] : []),
      ...(materials.length ? ["listed materials"] : []),
      ...(books.length ? ["book titles/links"] : []),
      ...(printables.length ? ["printable specifications"] : []),
      ...(images.length || referenceImages.length ? ["image/reference instructions"] : []),
      ...(keepReplace.keep.length ? ["assets marked keep"] : []),
    ],
    preserveExistingLessonContent: keepReplace.replace.length === 0,
    replaceOnlyWithEvidence: true,
  };

  const researchContext = [
    ...schema.asArray(brief.researchContext),
    ...books.map((b) => ({
      type: "owner_book",
      title: b.title,
      url: b.link || "",
      summary: b.notes || "Owner-supplied book for this lesson.",
      source: "owner_materials",
    })),
    ...printables.map((p) => ({
      type: "owner_printable",
      title: p.title,
      summary: p.ownerInstructions || "Owner-requested printable.",
      source: "owner_materials",
    })),
    ...researchNotes.map((n) => ({
      type: "owner_research",
      title: "Owner research note",
      summary: n.text,
      source: "owner_materials",
    })),
  ].slice(0, 12);

  const nextBrief = {
    ...brief,
    requestedActivities: requestedActivities.slice(0, 24),
    explicitPrintables: printables
      .filter((p) => p.ownerExplicitPrintable)
      .map((p) => ({
        activityHint: p.activityHint || activities[0]?.title || "activity",
        title: p.title,
        resourceType: p.resourceType,
        ownerExplicitPrintable: true,
        replaceOnly: false,
      })),
    suppliedBooks: books,
    ownerMaterials,
    researchContext,
    guidedWorkflow: true,
  };
  if (books.length) nextBrief.requestedFeatures = { ...nextBrief.requestedFeatures, books: true };
  if (printables.length) nextBrief.requestedFeatures = { ...nextBrief.requestedFeatures, printables: true };
  if (images.length) nextBrief.requestedFeatures = { ...nextBrief.requestedFeatures, images: true, cover: images.some((i) => i.kind === "cover") || nextBrief.coverRequested };
  if (nextBrief.requestedActivities.length >= 3) {
    nextBrief.activityTarget = nextBrief.requestedActivities.length;
  }
  nextBrief.childcareKnowledgeBand = knowledge.mapSchemaAgeBand(nextBrief.ageBand).key;
  nextBrief.guidedValidation = ageSafety.validateGuidedBrief(nextBrief);
  return nextBrief;
}

function buildUnderstandingSummary(brief) {
  const m = brief?.ownerMaterials || {};
  const lines = [
    "Here is what I understood",
    "",
    `Theme: ${text(brief?.theme || brief?.title, 120) || "(needs theme)"}`,
    `Age group: ${text(brief?.ageLabel || brief?.ageBand, 80) || "(needs age group)"}`,
    "",
    "Activities supplied by you:",
    ...(m.activities?.length
      ? m.activities.map((a) => `• ${a.title}`)
      : ["• (none listed — I will not invent unrelated activities to pad the lesson)"]),
    "",
    "Books supplied by you:",
    ...(m.books?.length ? m.books.map((b) => `• ${b.title}${b.link ? ` (${b.link})` : ""}`) : ["• none"]),
    "",
    "Printables requested:",
    ...(m.printables?.length ? m.printables.map((p) => `• ${p.title}${p.letterSize ? " (letter-size)" : ""}`) : ["• none"]),
    "",
    "Images requested:",
    ...(m.images?.length ? m.images.map((i) => `• ${i.kind}: ${i.instructions}`) : ["• none unless missing images are needed"]),
    ...(m.referenceImages?.length
      ? ["Reference uploads:", ...m.referenceImages.map((r) => `• ${r.fileName || r.id}: ${r.ownerInstructions || "style/composition reference only"}`)]
      : []),
    ...(m.materials?.length
      ? ["Materials you listed:", ...m.materials.map((x) => `• ${x.name}`)]
      : []),
    ...(m.keep?.length
      ? ["Keep unchanged:", ...m.keep.map((x) => `• ${x.target}`)]
      : []),
    ...(m.replace?.length
      ? ["Replace only with evidence:", ...m.replace.map((x) => `• ${x.target}`)]
      : []),
    ...(brief?.guidedValidation?.safetyWarnings?.length
      ? ["Safety notes:", ...brief.guidedValidation.safetyWarnings.map((w) => `• ${w}`)]
      : []),
    ...(brief?.guidedValidation?.uncertainties?.length
      ? ["Needs your confirmation (not guessed):", ...brief.guidedValidation.uncertainties.map((u) => `• ${u}`)]
      : []),
    "",
    "I will fill in:",
    ...FIELDS_AI_FILLS.map((f) => `• ${f}`),
    "",
    "I will keep unchanged unless you ask otherwise:",
    ...(m.fieldsOwnerSupplied?.length ? m.fieldsOwnerSupplied.map((f) => `• ${f}`) : ["• your supplied titles and core ideas"]),
    "• publish status (draft only)",
    "",
    "Confirm before I create or modify the lesson. Nothing will publish automatically.",
  ];
  return {
    title: "Here is what I understood",
    text: lines.join("\n"),
    sections: {
      theme: text(brief?.theme || brief?.title, 120),
      ageGroup: text(brief?.ageLabel || brief?.ageBand, 80),
      activities: schema.asArray(m.activities).map((a) => a.title),
      books: schema.asArray(m.books),
      printables: schema.asArray(m.printables),
      images: schema.asArray(m.images),
      referenceImages: schema.asArray(m.referenceImages),
      aiFills: FIELDS_AI_FILLS.slice(),
      unchanged: schema.asArray(m.fieldsOwnerSupplied),
      materials: schema.asArray(m.materials),
      keep: schema.asArray(m.keep),
      replace: schema.asArray(m.replace),
      validation: brief?.guidedValidation || null,
    },
    requiresConfirmation: true,
  };
}

function appendGuidedSummaryToOwnerText(ownerSummaryText, brief) {
  if (!brief?.guidedWorkflow) return ownerSummaryText;
  const guided = buildUnderstandingSummary(brief);
  return `${guided.text}\n\n---\n\n${text(ownerSummaryText, 3000)}`;
}

const GUIDED_PROGRESS_STEPS = Object.freeze([
  { key: "organize", label: "Organizing lesson" },
  { key: "fill", label: "Filling missing teaching details" },
  { key: "images", label: "Creating images" },
  { key: "printables", label: "Creating printables" },
  { key: "save", label: "Saving draft" },
  { key: "review", label: "Ready for review" },
]);

function mapJobActionToGuidedStep(actionType) {
  const key = text(actionType, 80).toLowerCase();
  if (!key) return "";
  if (/creation\.|lesson\.create|activity\.|upgrade|composer|batch/.test(key)) return "organize";
  if (/upgrade|text|objective|material|step|vocab/.test(key)) return "fill";
  if (/^image/.test(key)) return "images";
  if (/^printable/.test(key)) return "printables";
  if (/save|persist|verification/.test(key)) return "save";
  return "";
}

function guidedProgressFromJob(job) {
  const lr = schema.asArray(job?.lessonResults)[0];
  const actions = schema.asArray(lr?.actions);
  let current = "organize";
  actions.forEach((a) => {
    const step = mapJobActionToGuidedStep(a.type);
    if (step) current = step;
  });
  const review = text(lr?.ownerReviewStatus, 40).toUpperCase();
  if (review === "READY_FOR_OWNER_REVIEW") current = "review";
  else if (job?.status === "completed" || job?.status === "failed") {
    const last = actions.filter((a) => a.status === "failed").pop();
    if (last) current = mapJobActionToGuidedStep(last.type) || current;
  }
  const idx = GUIDED_PROGRESS_STEPS.findIndex((s) => s.key === current);
  return {
    steps: GUIDED_PROGRESS_STEPS.map((s, i) => ({
      ...s,
      state: i < idx ? "done" : (i === idx ? "current" : "pending"),
    })),
    currentLabel: GUIDED_PROGRESS_STEPS.find((s) => s.key === current)?.label || GUIDED_PROGRESS_STEPS[0].label,
  };
}

module.exports = {
  GUIDED_CONFIRM_REASON,
  FIELDS_AI_FILLS,
  GUIDED_PROGRESS_STEPS,
  extractSuppliedActivities,
  extractSuppliedMaterials,
  extractKeepReplaceDirectives,
  extractOwnerResearchNotes,
  extractExactPictureInstructions,
  extractExactPrintableInstructions,
  extractSuppliedBooks,
  extractPrintableSpecifications,
  extractImageRequests,
  detectOwnerSuppliedContent,
  enrichCreationBrief,
  buildUnderstandingSummary,
  appendGuidedSummaryToOwnerText,
  guidedProgressFromJob,
  mapJobActionToGuidedStep,
};
