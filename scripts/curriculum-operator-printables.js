/**
 * AI Curriculum Operator — Phase 4 printables only.
 *
 * Inspect → KEEP/CREATE/REPLACE/REMOVE/NOT_NEEDED → spec → generate pages
 * (pdf-lib) → validate → upload via trusted curriculum resource path → link
 * lesson (+ activity association in draft) → reload → verify.
 *
 * Never publishes. Never creates lessons. Never mutates activity images.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const PRINTABLE_WRITE = Object.freeze(["CREATE", "REPLACE"]);
const BRAND_FOOTER = "littlelearnershubbyleah.com";
const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;

function text(value, max = 2000) {
  return schema.text(value, max);
}

function loadPdfLib() {
  try { return require("pdf-lib"); } catch (_e) { return null; }
}

function loadPdfMerge() {
  try { return require("./teaching-kit-printable-pdf-merge.js"); } catch (_e) { return null; }
}

function normalizePrintableDecision(decision) {
  const key = text(decision, 40).toUpperCase().replace(/\s+/g, "_");
  if (key === "KEEP" || key === "KEEP_EXISTING") return "KEEP";
  if (key === "CREATE") return "CREATE";
  if (key === "REPLACE") return "REPLACE";
  if (key === "REMOVE") return "REMOVE";
  if (key === "NOT_NEEDED" || key === "NOTNEEDED") return "NOT_NEEDED";
  return "NOT_NEEDED";
}

function sanitizePrintableFileName(raw, fallback = "printable-pack.pdf") {
  const base = text(raw || fallback, 180)
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const name = base || "printable-pack";
  return `${name}.pdf`;
}

function titleToFileName(title, lessonTitle) {
  const combined = [lessonTitle, title].filter(Boolean).join(" ");
  return sanitizePrintableFileName(combined);
}

/**
 * Build typed printable specification from audit asset-plan item + activity.
 */
function buildPrintableSpec({
  plan,
  activity,
  planItem,
  decision,
  existingResourceIds = [],
}) {
  const activityId = text(planItem?.activityId || activity?.id, 160);
  const lessonId = text(plan?.id, 160);
  const d = normalizePrintableDecision(decision || planItem?.printable?.decision);
  const purpose = text(planItem?.printable?.purpose || planItem?.printable?.reason, 600);
  const resourceType = text(planItem?.printable?.type, 40) || "other";
  const title = text(planItem?.printable?.title, 180)
    || (d === "CREATE" || d === "REPLACE" ? `${text(activity?.title, 120)} Pack` : "");
  const contents = schema.asArray(planItem?.printable?.contents).map((c) => text(c, 120)).filter(Boolean);
  const ageBand = text(plan?.age || activity?.age, 80);
  const pages = contents.length
    ? contents.map((c, i) => ({
      index: i + 1,
      label: c,
      kind: resourceType,
      intentionalBlank: /handprint|footprint|drawing|writing area/i.test(c),
    }))
    : (d === "CREATE" || d === "REPLACE"
      ? [{ index: 1, label: title || "Activity printable", kind: resourceType, intentionalBlank: false }]
      : []);

  const existingIds = schema.asArray(existingResourceIds).map((id) => text(id, 160)).filter(Boolean);
  const spec = {
    lessonId,
    activityIds: activityId ? [activityId] : [],
    printableIdIfExisting: (d === "REPLACE" || d === "KEEP" || d === "REMOVE")
      ? (text(existingIds[0], 160) || null)
      : null,
    decision: d,
    title,
    resourceType: schema.PRINTABLE_TYPES.includes(resourceType) ? resourceType : "other",
    ageBand,
    purpose: purpose || text(planItem?.printable?.reason, 600),
    teacherUse: text(planItem?.printable?.reason, 400),
    childUse: purpose,
    pageCount: pages.length,
    pages,
    cutRequired: /card|cutout|token|piece/i.test(`${resourceType} ${contents.join(" ")}`),
    laminateRecommended: /card|flash|match|sort/i.test(resourceType),
    filename: titleToFileName(title, plan?.title),
    brandingRequired: true,
    reason: text(planItem?.printable?.reason, 600),
    existingResourceIds: existingIds,
  };
  return spec;
}

function isWeakGenericPrintable(resource) {
  const blob = `${resource?.title || ""} ${resource?.description || ""} ${resource?.resourceType || ""}`;
  return /\b(zone\s*sign|helper\s*sign|giant\s*word|classroom\s*sign|generic|help\/wash|training\s*sign)\b/i.test(blob)
    || /\b(HELP|WASH|TRAINING)\b/.test(String(resource?.title || ""))
      && /\bsign/i.test(blob);
}

function idealPrintableForActivity(activity) {
  try {
    const audit = require("./curriculum-operator-audit.js");
    return audit.planPrintableDecision(activity, {}, []) || null;
  } catch (_e) {
    return null;
  }
}

function validatePrintableSpec(spec, { expectedLessonId, knownActivityIds = [] } = {}) {
  const errors = [];
  if (!spec || typeof spec !== "object") return { ok: false, errors: ["missing_spec"] };
  if (!text(spec.lessonId, 160)) errors.push("missing_lesson_id");
  if (expectedLessonId && text(spec.lessonId, 160) !== text(expectedLessonId, 160)) {
    errors.push("wrong_lesson_id");
  }
  if (!text(spec.purpose, 600) && PRINTABLE_WRITE.includes(normalizePrintableDecision(spec.decision))) {
    errors.push("purpose_required");
  }
  if (PRINTABLE_WRITE.includes(normalizePrintableDecision(spec.decision))) {
    if (!text(spec.title, 180)) errors.push("title_required");
    if (!schema.PRINTABLE_TYPES.includes(text(spec.resourceType, 40))) errors.push("unsupported_type");
    if (!Number(spec.pageCount) || Number(spec.pageCount) < 1 || Number(spec.pageCount) > 24) {
      errors.push("invalid_page_count");
    }
    if (!/\.pdf$/i.test(text(spec.filename, 180))) errors.push("unsafe_filename");
    const acts = schema.asArray(spec.activityIds).map((id) => text(id, 160)).filter(Boolean);
    if (!acts.length) errors.push("missing_activity_id");
    const known = new Set(schema.asArray(knownActivityIds).map((id) => text(id, 160)));
    acts.forEach((id) => {
      if (known.size && !known.has(id)) errors.push(`unknown_activity_id:${id}`);
    });
  }
  return { ok: errors.length === 0, errors };
}

function refinePrintableDecision(planItem, activity, linkedResources = [], options = {}) {
  const base = normalizePrintableDecision(planItem?.printable?.decision || "NOT_NEEDED");
  let decision = base;
  let reason = text(planItem?.printable?.reason, 600);
  let printablePatch = { ...(planItem?.printable || {}) };
  const existingIds = schema.asArray(planItem?.printable?.existingResourceIds)
    .map((id) => text(id, 160))
    .filter(Boolean);

  // Only upgrade KEEP → REPLACE when the *activity-linked* resource is weak filler.
  // Do not let unrelated lesson-level zone signs force REPLACE onto CREATE/NOT_NEEDED.
  if (decision === "KEEP" && options.replaceWeakPrintables === true) {
    const weak = schema.asArray(linkedResources).filter((r) => isWeakGenericPrintable(r));
    if (weak.length) {
      decision = "REPLACE";
      reason = "Existing linked printable looks like generic zone/sign filler.";
      weak.forEach((r) => {
        const key = text(r.id, 160);
        if (key && !existingIds.includes(key)) existingIds.push(key);
      });
    }
  }

  if (decision === "REPLACE") {
    schema.asArray(planItem?.printable?.existingResourceIds).forEach((id) => {
      const key = text(id, 160);
      if (key && !existingIds.includes(key)) existingIds.push(key);
    });
    // Rebuild activity-driven content so REPLACE does not keep "Kitchen Zone Signs" as the pack title.
    const ideal = idealPrintableForActivity(activity);
    const idealDecision = normalizePrintableDecision(ideal?.decision);
    if (idealDecision === "NOT_NEEDED") {
      decision = "REMOVE";
      reason = "Generic printable is not useful for this activity; no replacement pack is needed.";
      printablePatch = {
        ...printablePatch,
        decision: "REMOVE",
        reason,
        purpose: "Remove generic filler that does not support the activity.",
        title: text(planItem?.printable?.title || linkedResources[0]?.title, 180),
        type: null,
        contents: [],
        existingResourceIds: existingIds,
      };
    } else if (idealDecision === "CREATE" && ideal) {
      reason = `${reason} Replacing with activity-driven pack.`;
      printablePatch = {
        ...printablePatch,
        decision: "REPLACE",
        reason,
        purpose: text(ideal.purpose, 600),
        title: text(ideal.title, 180),
        type: ideal.type,
        contents: schema.asArray(ideal.contents),
        existingResourceIds: existingIds,
      };
    }
  }

  const spec = buildPrintableSpec({
    plan: options.plan,
    activity,
    planItem: {
      ...planItem,
      printable: {
        ...printablePatch,
        decision,
        reason,
        existingResourceIds: existingIds,
      },
    },
    decision,
    existingResourceIds: existingIds,
  });

  return {
    activityId: text(planItem?.activityId || activity?.id, 160),
    activityTitle: text(planItem?.activityTitle || activity?.title, 180),
    decision,
    reason: reason || spec.reason,
    spec,
    status: "pending",
  };
}

function buildPrintableActionsFromAudit(plan, activities, audit, curriculum, options = {}) {
  const resources = schema.asArray(curriculum?.resources);
  const planResourceIds = new Set(schema.asArray(plan?.resourceIds).map(String));
  const draftIds = new Set(schema.asArray(plan?.enrichmentDraft?.week?.printableIds).map(String));
  const byId = new Map(schema.asArray(activities).map((a) => [text(a.id, 160), a]));
  const actions = [];

  schema.asArray(audit?.assetPlan).forEach((item) => {
    const activityId = text(item.activityId, 160);
    if (!activityId) return;
    const activity = byId.get(activityId);
    if (!activity) return;
    const linked = resources.filter((r) => {
      const ids = schema.asArray(r.lessonPlanIds).map(String);
      return planResourceIds.has(String(r.id)) || draftIds.has(String(r.id)) || ids.includes(String(plan.id));
    });
    // Prefer resources that mention this activity in description (operator association)
    const activityLinked = linked.filter((r) => String(r.description || "").includes(activityId)
      || String(r.activityId || "") === activityId);
    // Pass only activity-linked resources into refine so lesson-level orphans
    // do not override CREATE/NOT_NEEDED. Orphans are handled below as REMOVE.
    actions.push(refinePrintableDecision(item, activity, activityLinked, {
      ...options,
      plan,
    }));
  });

  // Lesson-level weak/generic orphans (no activityId association): REMOVE, do not
  // invent a second random sign pack.
  const claimed = new Set();
  actions.forEach((a) => {
    schema.asArray(a.spec?.existingResourceIds).forEach((id) => claimed.add(String(id)));
    if (a.spec?.printableIdIfExisting) claimed.add(String(a.spec.printableIdIfExisting));
  });
  const lessonResources = resources.filter((r) => {
    const ids = schema.asArray(r.lessonPlanIds).map(String);
    return planResourceIds.has(String(r.id)) || draftIds.has(String(r.id)) || ids.includes(String(plan.id));
  });
  lessonResources.forEach((r) => {
    const rid = text(r.id, 160);
    if (!rid || claimed.has(rid)) return;
    if (!isWeakGenericPrintable(r)) return;
    // Skip if any activity already owns this id via Operator activityId=
    const owned = schema.asArray(activities).some((a) => String(r.description || "").includes(String(a.id))
      || String(r.activityId || "") === String(a.id));
    if (owned) return;
    actions.push({
      activityId: "",
      activityTitle: "Lesson-level printable",
      decision: "REMOVE",
      reason: "Generic lesson-level printable (zone/sign filler) does not support a specific activity.",
      spec: {
        lessonId: text(plan.id, 160),
        activityIds: [],
        printableIdIfExisting: rid,
        decision: "REMOVE",
        title: text(r.title, 180),
        resourceType: "other",
        ageBand: text(plan.age, 80),
        purpose: "Remove generic filler that does not help teachers run an activity.",
        teacherUse: "Do not print.",
        childUse: "",
        pageCount: 0,
        pages: [],
        cutRequired: false,
        laminateRecommended: false,
        filename: sanitizePrintableFileName(text(r.fileName, 120) || "remove.pdf"),
        brandingRequired: false,
        reason: "Generic zone/sign-style resource.",
        existingResourceIds: [rid],
      },
      status: "pending",
    });
    claimed.add(rid);
  });

  return actions;
}

function summarizePrintableActions(actions) {
  const counts = {
    KEEP: 0, CREATE: 0, REPLACE: 0, REMOVE: 0, NOT_NEEDED: 0, FAILED: 0, SUCCESS: 0,
  };
  schema.asArray(actions).forEach((a) => {
    const d = normalizePrintableDecision(a.decision);
    if (counts[d] != null) counts[d] += 1;
    if (a.status === "failed") counts.FAILED += 1;
    if (a.status === "success" && PRINTABLE_WRITE.includes(d)) counts.SUCCESS += 1;
  });
  return counts;
}

function plannedPrintableWriteCount(actions) {
  return schema.asArray(actions)
    .filter((a) => PRINTABLE_WRITE.includes(normalizePrintableDecision(a.decision)))
    .length;
}

function assessPrintableScope({ actions, lessonCount = 1, limits = {} }) {
  const planned = plannedPrintableWriteCount(actions);
  const hardMax = Number(limits.maxPrintableGenerations) || schema.DEFAULT_LIMITS.maxPrintableGenerations;
  const softPerLesson = 5;
  const softMax = Math.max(softPerLesson, Number(lessonCount) * softPerLesson);
  const pageEstimate = schema.asArray(actions)
    .filter((a) => PRINTABLE_WRITE.includes(normalizePrintableDecision(a.decision)))
    .reduce((sum, a) => sum + Math.max(1, Number(a.spec?.pageCount) || 1), 0);
  if (planned > hardMax) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Planned ${planned} printable packs exceeds hard max ${hardMax}.`,
      planned,
      hardMax,
      softMax,
      pageEstimate,
    };
  }
  if (planned > softMax || pageEstimate > softMax * 6) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Planned ${planned} packs / ~${pageEstimate} pages exceeds soft budget for ${lessonCount} lesson(s).`,
      planned,
      hardMax,
      softMax,
      pageEstimate,
    };
  }
  return { ok: true, planned, hardMax, softMax, pageEstimate };
}

function drawFooter(page, font, size = 9) {
  page.drawText(BRAND_FOOTER, {
    x: 36,
    y: 28,
    size,
    font,
  });
}

/**
 * Deterministic multi-page PDF from a validated spec + activity (CI-safe, no live AI).
 */
async function generatePrintablePdfBuffer({ spec, plan, activity }) {
  const pdfLib = loadPdfLib();
  if (!pdfLib?.PDFDocument) throw new Error("pdf-lib is unavailable for printable generation.");
  const validation = validatePrintableSpec(spec, {
    expectedLessonId: plan?.id,
    knownActivityIds: [activity?.id].filter(Boolean),
  });
  if (!validation.ok) {
    const error = new Error(`Invalid printable spec: ${validation.errors.join(", ")}`);
    error.code = "invalid_spec";
    throw error;
  }

  const doc = await pdfLib.PDFDocument.create();
  const font = await doc.embedFont(pdfLib.StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
  const pagesMeta = schema.asArray(spec.pages).length
    ? schema.asArray(spec.pages)
    : Array.from({ length: Number(spec.pageCount) || 1 }, (_, i) => ({
      index: i + 1,
      label: `Page ${i + 1}`,
      kind: spec.resourceType,
    }));

  const age = text(spec.ageBand || plan?.age || activity?.age, 60);
  const objective = text(activity?.objective, 240);
  const materials = text(activity?.materials, 200);

  for (const pageMeta of pagesMeta) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const title = text(spec.title, 100);
    page.drawText(title.slice(0, 70), { x: 36, y: PAGE_HEIGHT - 48, size: 16, font: fontBold });
    page.drawText(`Activity: ${text(activity?.title, 80)}`, { x: 36, y: PAGE_HEIGHT - 72, size: 11, font });
    page.drawText(`Age: ${age}`, { x: 36, y: PAGE_HEIGHT - 88, size: 10, font });
    page.drawText(`Type: ${text(spec.resourceType, 40)} · Page ${pageMeta.index} of ${pagesMeta.length}`, {
      x: 36,
      y: PAGE_HEIGHT - 104,
      size: 10,
      font,
    });

    let y = PAGE_HEIGHT - 140;
    const purpose = text(spec.purpose, 400);
    if (purpose) {
      page.drawText("Purpose:", { x: 36, y, size: 11, font: fontBold });
      y -= 16;
      wrapText(purpose, 70).forEach((line) => {
        page.drawText(line, { x: 36, y, size: 10, font });
        y -= 14;
      });
      y -= 8;
    }
    if (objective) {
      page.drawText("Objective:", { x: 36, y, size: 11, font: fontBold });
      y -= 16;
      wrapText(objective, 70).forEach((line) => {
        page.drawText(line, { x: 36, y, size: 10, font });
        y -= 14;
      });
      y -= 8;
    }

    const label = text(pageMeta.label, 120);
    page.drawText(`This page: ${label}`, { x: 36, y, size: 12, font: fontBold });
    y -= 24;

    // Type-specific usable layout (not giant-word + icon filler).
    const kind = text(pageMeta.kind || spec.resourceType, 40);
    if (/dramatic|menu|order|ticket|recipe/i.test(kind) || /menu|order|ticket|recipe/i.test(label)) {
      y = drawDramaticPlayBlocks(page, font, fontBold, y, label, activity);
    } else if (/match|sort|flash|picture|card|vocab/i.test(kind) || /card|match|sort/i.test(label)) {
      y = drawCardGrid(page, font, fontBold, y, label, activity);
    } else if (/count/i.test(kind) || /count/i.test(label)) {
      y = drawCountingMat(page, font, fontBold, y);
    } else if (/handprint|footprint|art_template/i.test(kind) || pageMeta.intentionalBlank) {
      y = drawIntentionalBlank(page, font, fontBold, y, label);
    } else if (/movement|scavenger/i.test(kind)) {
      y = drawMovementCards(page, font, fontBold, y, activity);
    } else {
      y = drawGenericUsefulPanel(page, font, fontBold, y, label, materials);
    }

    drawFooter(page, font);
    // Keep content above footer margin
    if (y < 48) {
      /* already constrained by layouts */
    }
  }

  const bytes = Buffer.from(await doc.save());
  return {
    buffer: bytes,
    mimeType: "application/pdf",
    pageCount: pagesMeta.length,
    fileName: sanitizePrintableFileName(spec.filename),
    title: text(spec.title, 180),
  };
}

function wrapText(value, width) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((w) => {
    const next = current ? `${current} ${w}` : w;
    if (next.length > width) {
      if (current) lines.push(current);
      current = w;
    } else current = next;
  });
  if (current) lines.push(current);
  return lines.slice(0, 8);
}

function drawDramaticPlayBlocks(page, font, fontBold, startY, label, activity) {
  let y = startY;
  page.drawRectangle({ x: 36, y: y - 160, width: 540, height: 160, borderWidth: 1 });
  page.drawText(label.slice(0, 60), { x: 48, y: y - 24, size: 12, font: fontBold });
  const lines = [
    "Teacher: print, cut if needed, place in the dramatic-play area.",
    `Children use during: ${text(activity?.title, 60)}`,
    "Include: choices children can point to, simple order lines, clear pictures.",
  ];
  let ly = y - 48;
  lines.forEach((line) => {
    page.drawText(line.slice(0, 90), { x: 48, y: ly, size: 10, font });
    ly -= 16;
  });
  // Usable form lines
  for (let i = 0; i < 4; i += 1) {
    page.drawText(`${i + 1}. _______________________________`, { x: 48, y: ly, size: 10, font });
    ly -= 18;
  }
  return ly - 12;
}

function drawCardGrid(page, font, fontBold, startY, label, activity) {
  let y = startY;
  page.drawText("Cut along dashed boxes · laminate if desired", { x: 36, y, size: 10, font });
  y -= 20;
  const labels = [
    text(activity?.title, 28) || "Card A",
    "Match 1",
    "Match 2",
    "Match 3",
    "Match 4",
    "Match 5",
  ];
  let x = 36;
  let rowY = y;
  labels.forEach((lab, i) => {
    if (i && i % 3 === 0) {
      x = 36;
      rowY -= 150;
    }
    page.drawRectangle({ x, y: rowY - 130, width: 170, height: 130, borderWidth: 1 });
    page.drawText(lab.slice(0, 18), { x: x + 10, y: rowY - 24, size: 11, font: fontBold });
    page.drawText(label.slice(0, 22), { x: x + 10, y: rowY - 44, size: 9, font });
    page.drawText("picture area", { x: x + 10, y: rowY - 80, size: 9, font });
    x += 180;
  });
  return rowY - 150;
}

function drawCountingMat(page, font, fontBold, startY) {
  let y = startY;
  page.drawText("Counting mat — place objects in each space", { x: 36, y, size: 11, font: fontBold });
  y -= 24;
  for (let n = 1; n <= 5; n += 1) {
    page.drawRectangle({ x: 36, y: y - 70, width: 540, height: 70, borderWidth: 1 });
    page.drawText(String(n), { x: 48, y: y - 40, size: 28, font: fontBold });
    page.drawText("counting spaces", { x: 100, y: y - 36, size: 10, font });
    y -= 84;
  }
  return y;
}

function drawIntentionalBlank(page, font, fontBold, startY, label) {
  let y = startY;
  page.drawText(label.slice(0, 70), { x: 36, y, size: 12, font: fontBold });
  y -= 20;
  page.drawText("Intentional work area for the child’s print / drawing.", { x: 36, y, size: 10, font });
  y -= 16;
  page.drawRectangle({ x: 72, y: 120, width: 468, height: y - 140, borderWidth: 1 });
  return 100;
}

function drawMovementCards(page, font, fontBold, startY, activity) {
  let y = startY;
  const moves = ["Stretch tall", "March in place", "Reach high", "Spin gently", "Balance", "Freeze"];
  moves.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 36 + col * 270;
    const boxY = y - row * 120;
    page.drawRectangle({ x, y: boxY - 100, width: 250, height: 100, borderWidth: 1 });
    page.drawText(m, { x: x + 16, y: boxY - 36, size: 14, font: fontBold });
    page.drawText(text(activity?.title, 30), { x: x + 16, y: boxY - 56, size: 9, font });
  });
  return y - 380;
}

function drawGenericUsefulPanel(page, font, fontBold, startY, label, materials) {
  let y = startY;
  page.drawRectangle({ x: 36, y: y - 200, width: 540, height: 200, borderWidth: 1 });
  page.drawText(label.slice(0, 60), { x: 48, y: y - 28, size: 12, font: fontBold });
  page.drawText("Teacher preparation checklist", { x: 48, y: y - 52, size: 11, font: fontBold });
  const items = [
    materials ? `Materials: ${materials.slice(0, 80)}` : "Gather listed materials",
    "Preview the activity steps",
    "Set out this printable where children can reach it",
    "Invite children to use the printable during the activity",
  ];
  let ly = y - 76;
  items.forEach((item, idx) => {
    page.drawText(`${idx + 1}. ${item.slice(0, 85)}`, { x: 48, y: ly, size: 10, font });
    ly -= 18;
  });
  return ly - 20;
}

async function validateGeneratedPdf(buffer, { expectedPageCount, fileName }) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  pass(Buffer.isBuffer(buffer) && buffer.length > 100, "buffer", "PDF buffer present.");
  pass(/\w.*\.pdf$/i.test(String(fileName || "")),
    "filename", "Filename looks like a readable PDF name.");
  pass(!/^(printable|file\d+|generated-final|resource-\d+)\.pdf$/i.test(String(fileName || "")),
    "filename_quality", "Filename is not a generic placeholder.");

  let pageCount = 0;
  try {
    const merge = loadPdfMerge();
    if (merge?.inspectPdfPages) {
      const inspected = await merge.inspectPdfPages(buffer);
      pageCount = Number(inspected.pageCount) || 0;
      pass(inspected.ok === true, "inspect_ok", "PDF inspect succeeded.");
      pass(pageCount === Number(expectedPageCount), "page_count", `Page count ${pageCount} matches expected ${expectedPageCount}.`);
      pass(pageCount > 0, "not_empty", "PDF is not empty.");
      pass(pageCount === Number(expectedPageCount) && pageCount > 0, "no_missing_pages", "No missing pages vs expected count.");
      const sizes = schema.asArray(inspected.pages);
      pass(sizes.every((p) => p.width >= 500 && p.height >= 700), "letter_size", "Pages look US Letter-ish.");
      const idxs = sizes.map((p) => p.index).filter((n) => n != null);
      if (idxs.length) {
        pass(new Set(idxs).size === idxs.length, "no_duplicate_page_index", "No duplicate page indices.");
      }
    } else {
      const pdfLib = loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(buffer);
      pageCount = doc.getPageCount();
      pass(pageCount === Number(expectedPageCount), "page_count", `Page count ${pageCount} matches expected.`);
      pass(pageCount > 0, "not_empty", "PDF is not empty.");
    }
  } catch (error) {
    pass(false, "inspect_error", text(error?.message || "PDF inspect failed", 200));
  }
  // Reject zero-byte / near-empty "blank" PDFs that somehow pass page count.
  pass(Buffer.isBuffer(buffer) && buffer.length > 400, "not_blank_pdf", "PDF is not an accidental blank stub.");
  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed, pageCount };
}

function bufferToPdfDataUrl(buffer) {
  return `data:application/pdf;base64,${Buffer.from(buffer).toString("base64")}`;
}

function linkPrintableIntoEnrichmentDraft(draftInput, {
  lessonId,
  expectedLessonId,
  activityId,
  resourceId,
  title,
}) {
  if (text(lessonId, 160) !== text(expectedLessonId, 160)) {
    return { ok: false, code: "wrong_lesson_id", error: "Lesson ID mismatch; refuse printable link." };
  }
  const actId = text(activityId, 160);
  const resId = text(resourceId, 160);
  if (!actId) return { ok: false, code: "missing_activity_id", error: "Activity ID required." };
  if (!resId) return { ok: false, code: "missing_resource_id", error: "Resource ID required." };

  const draft = draftInput && typeof draftInput === "object"
    ? JSON.parse(JSON.stringify(draftInput))
    : { week: {}, activities: {} };
  if (!draft.week || typeof draft.week !== "object") draft.week = {};
  if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};
  const ids = schema.asArray(draft.week.printableIds).map((id) => text(id, 160)).filter(Boolean);
  if (!ids.includes(resId)) ids.push(resId);
  draft.week.printableIds = ids.slice(0, 100);
  if (!draft.activities[actId] || typeof draft.activities[actId] !== "object") {
    draft.activities[actId] = {};
  }
  // Association only — do not invent a second storage system.
  draft.activities[actId].relatedPrintableId = resId;
  draft.activities[actId].relatedPrintableTitle = text(title, 180);
  draft.updatedAt = new Date().toISOString();
  draft.operatorPhase = 4;
  return { ok: true, enrichmentDraft: draft };
}

function verifyPrintableJobDraft({
  beforePlan,
  afterPlan,
  actions = [],
  resourcesAfter = [],
}) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  pass(beforePlan?.id && beforePlan.id === afterPlan?.id, "lesson_id", "Lesson ID unchanged.");
  pass(text(beforePlan?.age) === text(afterPlan?.age), "age", "Age unchanged.");
  pass(
    (beforePlan?.plan === "Pro" ? "Pro" : "Free") === (afterPlan?.plan === "Pro" ? "Pro" : "Free"),
    "access_plan",
    "Access plan unchanged.",
  );
  pass(text(beforePlan?.title) === text(afterPlan?.title), "title", "Title unchanged.");
  pass(afterPlan?.status === beforePlan?.status, "publish_status", "Publish status unchanged.");
  pass(
    text(beforePlan?.weeklyOverview, 500) === text(afterPlan?.weeklyOverview, 500),
    "published_weekly_overview",
    "Published weeklyOverview unchanged.",
  );

  // Image fields must not change in Phase 4.
  const beforeActs = beforePlan?.enrichmentDraft?.activities || {};
  const afterActs = afterPlan?.enrichmentDraft?.activities || {};
  const allIds = new Set([...Object.keys(beforeActs), ...Object.keys(afterActs)]);
  allIds.forEach((id) => {
    const b = beforeActs[id] || {};
    const a = afterActs[id] || {};
    pass(
      text(b.setupImageUrl, 500) === text(a.setupImageUrl, 500)
        && text(b.exampleImageUrl, 500) === text(a.exampleImageUrl, 500),
      `images_locked_${id}`,
      `Activity ${id} images unchanged during printable job.`,
    );
  });

  schema.asArray(actions).forEach((action) => {
    const d = normalizePrintableDecision(action.decision);
    if (action.status !== "success" || !PRINTABLE_WRITE.includes(d)) return;
    const resId = text(action.resourceId, 160);
    const resource = schema.asArray(resourcesAfter).find((r) => r.id === resId);
    pass(Boolean(resource), `resource_exists_${resId}`, `Resource ${resId} exists.`);
    if (resource) {
      pass(
        schema.asArray(resource.lessonPlanIds).map(String).includes(String(beforePlan.id))
          || schema.asArray(afterPlan.resourceIds).map(String).includes(String(resId)),
        `resource_linked_${resId}`,
        `Resource linked to lesson ${beforePlan.id}.`,
      );
      pass(text(resource.title, 180) === text(action.spec?.title || action.title, 180)
        || Boolean(text(resource.title, 180)), `resource_title_${resId}`, "Resource has a display title.");
      pass(/\.pdf$/i.test(text(resource.fileName, 180)), `resource_filename_${resId}`, "Resource filename is a PDF.");
      pass(resource.status === "draft" || resource.status === "published", `resource_status_${resId}`, "Resource status is draft/published.");
    }
    const draftIds = schema.asArray(afterPlan?.enrichmentDraft?.week?.printableIds).map(String);
    pass(draftIds.includes(String(resId)), `draft_printableIds_${resId}`, "Draft week.printableIds includes resource.");
    const actPatch = afterActs[text(action.activityId, 160)] || {};
    pass(
      text(actPatch.relatedPrintableId, 160) === resId,
      `activity_link_${action.activityId}`,
      "Activity draft references resource by verified activity ID.",
    );
  });

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed };
}

async function runPrintablePlanForLesson({
  plan,
  activities,
  audit,
  curriculum,
  limits,
  touchPrintables = true,
  replaceWeakPrintables = true,
  createPrintableResource,
  readResourceFile,
  unlinkPrintableResource,
  alreadySucceededKeys = new Set(),
  lessonCount = 1,
  saveDraft,
} = {}) {
  if (touchPrintables === false) {
    return {
      ok: true,
      skipped: true,
      actions: [],
      counts: summarizePrintableActions([]),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
    };
  }

  const actions = buildPrintableActionsFromAudit(plan, activities, audit, curriculum, {
    replaceWeakPrintables,
  });
  const scope = assessPrintableScope({ actions, lessonCount, limits: limits || {} });
  if (!scope.ok) {
    return {
      ok: false,
      code: scope.code,
      error: scope.reason,
      actions,
      counts: summarizePrintableActions(actions),
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      generations: 0,
      scope,
    };
  }

  let draft = plan?.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
    : { week: {}, activities: {} };
  if (!draft.week) draft.week = {};
  if (!draft.activities) draft.activities = {};

  let generations = 0;
  const hardMax = Number(limits?.maxPrintableGenerations) || schema.DEFAULT_LIMITS.maxPrintableGenerations;
  const results = [];
  const knownActivityIds = schema.asArray(activities).map((a) => text(a.id, 160)).filter(Boolean);

  for (const action of actions) {
    const decision = normalizePrintableDecision(action.decision);
    const idempotencyKey = decision === "REMOVE"
      ? `printable:${plan.id}:remove:${schema.asArray(action.spec?.existingResourceIds).join(",")}`
      : `printable:${plan.id}:${action.activityId}:${text(action.spec?.resourceType, 40)}:${text(action.spec?.title, 80)}`;
    if (alreadySucceededKeys.has(idempotencyKey)) {
      results.push({
        ...action,
        decision,
        status: "skipped",
        reason: `${action.reason} (already succeeded; resume skip)`,
        idempotencyKey,
      });
      continue;
    }

    if (decision === "KEEP" || decision === "NOT_NEEDED") {
      results.push({ ...action, decision, status: "skipped", idempotencyKey });
      continue;
    }

    if (decision === "REMOVE") {
      try {
        const oldIds = schema.asArray(action.spec?.existingResourceIds);
        for (const oldId of oldIds) {
          if (typeof unlinkPrintableResource === "function") {
            // eslint-disable-next-line no-await-in-loop
            await unlinkPrintableResource({ lessonPlanId: plan.id, resourceId: oldId });
          }
        }
        const ids = schema.asArray(draft.week.printableIds).filter((id) => !oldIds.map(String).includes(String(id)));
        draft.week.printableIds = ids;
        results.push({
          ...action,
          decision,
          status: "success",
          idempotencyKey,
          removedResourceIds: oldIds,
        });
      } catch (error) {
        results.push({
          ...action,
          decision,
          status: "failed",
          error: text(error.message, 400),
          retryable: true,
          idempotencyKey,
          preservedExisting: true,
        });
      }
      continue;
    }

    if (!PRINTABLE_WRITE.includes(decision)) {
      results.push({ ...action, decision, status: "skipped", idempotencyKey });
      continue;
    }

    if (generations >= hardMax) {
      results.push({
        ...action,
        decision,
        status: "failed",
        error: "maxPrintableGenerations reached",
        retryable: true,
        idempotencyKey,
      });
      continue;
    }

    const existingIds = schema.asArray(action.spec?.existingResourceIds);
    try {
      const activity = schema.asArray(activities).find((a) => text(a.id, 160) === text(action.activityId, 160));
      if (!activity) throw new Error(`Activity ${action.activityId} not found by exact id.`);

      const spec = {
        ...action.spec,
        lessonId: plan.id,
        activityIds: [action.activityId],
        decision,
      };
      const specCheck = validatePrintableSpec(spec, {
        expectedLessonId: plan.id,
        knownActivityIds,
      });
      if (!specCheck.ok) throw new Error(`Invalid printable spec: ${specCheck.errors.join(", ")}`);

      const generated = await generatePrintablePdfBuffer({ spec, plan, activity });
      generations += 1;
      const validated = await validateGeneratedPdf(generated.buffer, {
        expectedPageCount: generated.pageCount,
        fileName: generated.fileName,
      });
      if (!validated.ok) {
        throw new Error(`PDF validation failed: ${validated.failed.map((f) => f.code).join(", ")}`);
      }

      if (typeof createPrintableResource !== "function") {
        throw new Error("Printable upload helper is not configured.");
      }

      const uploaded = await createPrintableResource({
        lessonPlanId: plan.id,
        activityId: action.activityId,
        title: generated.title,
        fileName: generated.fileName,
        fileData: bufferToPdfDataUrl(generated.buffer),
        pageCount: generated.pageCount,
        resourceType: spec.resourceType,
        description: [
          text(spec.purpose, 500),
          `Operator activityId=${action.activityId}`,
          `Operator decision=${decision}`,
        ].join("\n"),
        ageGroup: plan.age || "",
        theme: plan.theme || "",
        printingInstructions: [
          spec.cutRequired ? "Cut apart cards/pieces before use." : "",
          spec.laminateRecommended ? "Laminate for reuse if desired." : "",
        ].filter(Boolean).join(" "),
        disposableQaFixture: true,
        replaceResourceId: decision === "REPLACE" ? existingIds[0] || null : null,
      });

      if (!uploaded?.ok || !uploaded.resourceId) {
        throw new Error(uploaded?.error || "printable upload/link failed");
      }

      // Preview/download verification via injected reader
      if (typeof readResourceFile === "function") {
        const fileCheck = await readResourceFile({ resourceId: uploaded.resourceId, lessonPlanId: plan.id });
        if (!fileCheck?.ok) {
          throw new Error(fileCheck?.error || "preview/download verification failed");
        }
        if (Number(fileCheck.pageCount) && Number(fileCheck.pageCount) !== Number(generated.pageCount)) {
          throw new Error("Downloaded PDF page count mismatch.");
        }
      }

      const linked = linkPrintableIntoEnrichmentDraft(draft, {
        lessonId: plan.id,
        expectedLessonId: plan.id,
        activityId: action.activityId,
        resourceId: uploaded.resourceId,
        title: generated.title,
      });
      if (!linked.ok) throw new Error(linked.error || "draft link failed");
      draft = linked.enrichmentDraft;

      // Safe REPLACE: only unlink old after new resource verified
      if (decision === "REPLACE" && existingIds.length && typeof unlinkPrintableResource === "function") {
        for (const oldId of existingIds) {
          if (oldId === uploaded.resourceId) continue;
          // eslint-disable-next-line no-await-in-loop
          await unlinkPrintableResource({ lessonPlanId: plan.id, resourceId: oldId });
          draft.week.printableIds = schema.asArray(draft.week.printableIds)
            .filter((id) => id !== oldId);
        }
      }

      results.push({
        ...action,
        decision,
        status: "success",
        idempotencyKey,
        resourceId: uploaded.resourceId,
        title: generated.title,
        fileName: generated.fileName,
        pageCount: generated.pageCount,
        spec,
        previewVerified: true,
        downloadVerified: true,
      });
    } catch (error) {
      results.push({
        ...action,
        decision,
        status: "failed",
        error: text(error?.message || "printable action failed", 400),
        retryable: true,
        idempotencyKey,
        preservedExisting: existingIds.length > 0,
      });
    }
  }

  let changed = results.some((r) => r.status === "success");
  if (changed && typeof saveDraft === "function") {
    const saved = await saveDraft({ enrichmentDraft: draft });
    if (!saved?.ok) {
      return {
        ok: false,
        error: saved?.error || "draft save failed after printables",
        actions: results.map((r) => (
          r.status === "success"
            ? { ...r, status: "failed", error: "draft save failed", retryable: true, preservedExisting: true }
            : r
        )),
        counts: summarizePrintableActions(results),
        enrichmentDraft: plan?.enrichmentDraft || null,
        changed: false,
        generations,
        scope,
      };
    }
    draft = saved.enrichmentDraft || draft;
  }

  return {
    ok: results.every((r) => r.status !== "failed"),
    partial: results.some((r) => r.status === "failed") && results.some((r) => r.status === "success"),
    actions: results,
    counts: summarizePrintableActions(results),
    enrichmentDraft: draft,
    changed,
    generations,
    scope,
  };
}

module.exports = {
  PRINTABLE_WRITE,
  BRAND_FOOTER,
  normalizePrintableDecision,
  sanitizePrintableFileName,
  titleToFileName,
  buildPrintableSpec,
  validatePrintableSpec,
  refinePrintableDecision,
  buildPrintableActionsFromAudit,
  summarizePrintableActions,
  plannedPrintableWriteCount,
  assessPrintableScope,
  isWeakGenericPrintable,
  idealPrintableForActivity,
  generatePrintablePdfBuffer,
  validateGeneratedPdf,
  bufferToPdfDataUrl,
  linkPrintableIntoEnrichmentDraft,
  verifyPrintableJobDraft,
  runPrintablePlanForLesson,
};
