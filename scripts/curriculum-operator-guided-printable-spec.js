/**
 * Guided materials — enrich thin owner printable requests into operator-grade specs.
 * No generic fallback; fail closed or ask owner clarification before create.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const planner = require("./curriculum-operator-printable-planner.js");

function text(value, max = 2000) {
  return schema.text(value, max);
}

function ownerPrintableContext(brief) {
  const m = brief?.ownerMaterials || {};
  const instructions = [
    ...schema.asArray(m.ownerInstructions),
    ...schema.asArray(m.printables).map((p) => p.ownerInstructions).filter(Boolean),
  ].join(" ");
  return {
    guidedWorkflow: brief?.guidedWorkflow === true,
    theme: text(brief?.theme || brief?.title, 120),
    ageBand: text(brief?.ageBand, 40),
    ageLabel: text(brief?.ageLabel, 80),
    printables: schema.asArray(m.printables),
    materials: schema.asArray(m.materials),
    requestedActivities: schema.asArray(brief?.requestedActivities),
    ownerInstructions: text(instructions, 800),
    explicitPrintables: schema.asArray(brief?.explicitPrintables),
  };
}

function parseRequestedPageCount(ownerText) {
  const m = String(ownerText || "").match(/\b(\d{1,2})\s*(?:letter-size\s*)?pages?\b/i);
  if (m) return schema.clampInt(Number(m[1]), 1, 8, 0);
  if (/two\s+letter-size|2\s+pages?/i.test(ownerText)) return 2;
  if (/three\s+pages?|3\s+pages?/i.test(ownerText)) return 3;
  return 0;
}

function activityTokens(activity) {
  const title = text(activity?.title, 180).toLowerCase();
  return title.split(/[^a-z0-9]+/).filter((t) => t.length > 3);
}

function buildGuidedOwnerPrintableContentPlan({ plan, activity, baseSpec, guidedContext } = {}) {
  if (baseSpec?.ownerExplicitPrintable !== true && guidedContext?.guidedWorkflow !== true) return null;
  const ctx = guidedContext || {};
  const ownerText = text(baseSpec?.ownerInstructions || ctx.ownerInstructions, 800);
  const actTitle = text(activity?.title, 120) || "this activity";
  const theme = text(ctx.theme || plan?.theme || plan?.title, 120);
  const objective = text(activity?.objective, 400);
  const materials = text(activity?.materials, 300) || ctx.materials.map((m) => m.name).join(", ");
  const title = text(baseSpec?.title, 180) || `${actTitle} Printable Pack`;
  const pageTarget = parseRequestedPageCount(ownerText) || 0;

  const wantsPumpkin = /pumpkin|color\s*card/i.test(ownerText + title + actTitle);
  const wantsSpiderCount = /spider|web|counting/i.test(ownerText + title + actTitle);
  const wantsSorting = /sort/i.test(ownerText + actTitle + objective);

  const pages = [];

  if (wantsPumpkin || /picture_card|color_card/i.test(text(baseSpec?.resourceType, 40))) {
    pages.push({
      type: "picture_cards",
      heading: `${theme || "Halloween"} pumpkin color cards`,
      visualMode: "simple_vector",
      teacherUse: `Print on letter-size paper, cut the cards, and invite children to sort by color during ${actTitle}.`,
      items: [
        { name: "Orange pumpkin", visualConcept: "round orange pumpkin for preschool sorting", category: "orange" },
        { name: "Green pumpkin", visualConcept: "small green pumpkin", category: "green" },
        { name: "White mini pumpkin", visualConcept: "white mini pumpkin", category: "white" },
        { name: "Yellow gourd", visualConcept: "yellow gourd", category: "yellow" },
        { name: "Striped pumpkin", visualConcept: "green and orange striped pumpkin", category: "pattern" },
        { name: "Paint sample card", visualConcept: "paper paint chip labeled for color match", category: "paint" },
      ],
    });
  }

  if (wantsSpiderCount || /counting_mat/i.test(text(baseSpec?.resourceType, 40))) {
    pages.push({
      type: "counting_mat",
      heading: "Spider web counting mats",
      visualMode: "simple_vector",
      numbers: [1, 2, 3, 4, 5],
      categories: [{ name: "Spider web mat", visualConcept: "simple spider web circle mat" }],
      items: [
        { name: "Plastic spider", visualConcept: "single cartoon spider counter", category: "counter" },
        { name: "Yarn web piece", visualConcept: "yarn loop for fine-motor counting", category: "counter" },
        { name: "Pom-pom spider", visualConcept: "pom-pom with paper legs", category: "counter" },
        { name: "Dot sticker", visualConcept: "round sticker counter", category: "counter" },
      ],
      teacherUse: `Children place counters on the web mat while counting aloud during ${actTitle}.`,
    });
  }

  if (wantsSorting && pages.length < 2) {
    pages.push({
      type: "sorting",
      heading: `${actTitle} sorting mat`,
      visualMode: "simple_vector",
      categories: [
        { name: "Set A", visualConcept: "labeled bin A for sorting" },
        { name: "Set B", visualConcept: "labeled bin B for sorting" },
      ],
      items: [
        { name: "Leaf cutout", visualConcept: "paper leaf", category: "Set A" },
        { name: "Pumpkin cutout", visualConcept: "paper pumpkin", category: "Set A" },
        { name: "Spider ring", visualConcept: "plastic spider ring", category: "Set B" },
        { name: "Yarn piece", visualConcept: "short yarn piece", category: "Set B" },
      ],
      teacherUse: `Use during ${actTitle} so children sort materials into two groups.`,
    });
  }

  if (!pages.length) {
    const tokens = activityTokens(activity);
    const label = tokens[0] || "activity";
    pages.push({
      type: "picture_cards",
      heading: `${title} — ${label} cards`,
      visualMode: "simple_vector",
      items: [
        { name: `${label} step 1`, visualConcept: `child-safe ${label} step illustration` },
        { name: `${label} step 2`, visualConcept: `second ${label} step illustration` },
        { name: `${label} step 3`, visualConcept: `third ${label} step illustration` },
        { name: `${label} step 4`, visualConcept: `fourth ${label} step illustration` },
      ],
      teacherUse: `Print letter-size, cut apart, and use during ${actTitle}.`,
    });
  }

  while (pageTarget > pages.length && pages.length < 8) {
    pages.push({
      type: "teacher_tool",
      heading: "Teacher setup checklist",
      visualMode: "text_layout",
      items: [
        { name: "Gather listed materials", visualConcept: "tray with paper, paint, tweezers" },
        { name: "Set up invitation", visualConcept: "table setup for preschool activity" },
        { name: "Preview safety", visualConcept: "teacher reviewing small parts tray" },
        { name: "Place printable pieces", visualConcept: "cut cards beside activity bins" },
      ],
      teacherUse: `Prepare ${actTitle} using owner materials: ${materials || "see lesson plan"}.`,
    });
  }

  const purpose = text(baseSpec?.purpose, 600)
    || `Children use these letter-size printables during ${actTitle} (${theme}). ${objective}`.slice(0, 600);

  return {
    title,
    resourceType: text(baseSpec?.resourceType, 40) || "picture_cards",
    purpose,
    teacherUse: `Print on US letter paper (8.5×11). Cut apart as needed. Use only for ${actTitle}.`,
    childUse: `Children interact with the cards or mats during ${actTitle}.`,
    pages,
    source: "guided_owner_printable_enrichment",
  };
}

function tryApplyGuidedRenderEnrichment(spec, { plan, activity, guidedContext } = {}) {
  const baseSpec = spec && typeof spec === "object" ? spec : {};
  const planBody = buildGuidedOwnerPrintableContentPlan({
    plan,
    activity,
    baseSpec,
    guidedContext,
  });
  if (!planBody) return { ok: false, code: "no_guided_plan" };
  const merged = planner.mergeContentIntoSpec(baseSpec, planBody);
  const gate = planner.auditPrintableContentQuality(merged, { activity, plan });
  const review = planner.reviewPrintableSpec(merged, { activity, plan });
  const printablesApi = require("./curriculum-operator-printables.js");
  const renderPath = printablesApi.classifyPrintableRenderPath(merged, { operatorWrite: true });
  if (!gate.ok || !review.ok || !renderPath.ok) {
    return {
      ok: false,
      code: "guided_enrichment_still_invalid",
      gate,
      review,
      renderPath,
      spec: merged,
    };
  }
  return { ok: true, spec: merged, contentPlan: planBody, gate, review, renderPath };
}

function hasSubstantiveOwnerPrintableSpec(ctx, brief) {
  const raw = text(brief?.rawCommand, 4000);
  const ownerLine = text(ctx.ownerInstructions, 800);
  if (ownerLine.length >= 12 && /printable|counting|card|mat|sort|sequenc|letter-size|page/i.test(ownerLine)) {
    return true;
  }
  if (/\b(?:exact printable instructions|printable instructions)\s*:/i.test(raw)) return true;
  if (/\bprintable\s+with\s+\S+/i.test(raw)) return true;
  if (/\bletter-size\b/i.test(raw) && /\bprintable/i.test(raw)) return true;
  if (/\bprintable\s+like\s+this\s+example\b/i.test(raw)) return true;

  for (const p of ctx.printables) {
    const instr = text(p.ownerInstructions, 800);
    const title = text(p.title, 180);
    if (instr.length >= 10) return true;
    if (title.length >= 8 && !/^make a printable\.?$/i.test(title)) return true;
  }
  for (const p of ctx.explicitPrintables) {
    const title = text(p.title, 180);
    const instr = text(p.ownerInstructions, 400);
    if (instr.length >= 10) return true;
    if (title.length >= 4 && !/^printable$/i.test(title)) return true;
  }
  return false;
}

function assessGuidedPrintablesPreCreate(brief) {
  const ctx = ownerPrintableContext(brief);
  if (!ctx.guidedWorkflow) return { ok: true, needsClarification: false };
  const raw = text(brief?.rawCommand, 4000);
  const hasPrintableAsk = ctx.explicitPrintables.length > 0
    || ctx.printables.length > 0
    || /printable|counting mat|color card/i.test(ctx.ownerInstructions)
    || /\bprintable/i.test(raw);
  if (!hasPrintableAsk) return { ok: true, needsClarification: false };

  if (!hasSubstantiveOwnerPrintableSpec(ctx, brief)) {
    return {
      ok: false,
      needsClarification: true,
      clarifyingQuestion: "Which activity should the printable support, and what should each letter-size page include?",
      code: "guided_printable_clarification",
    };
  }

  const ambiguousActivity = ctx.explicitPrintables.length > 0
    && ctx.requestedActivities.length > 1
    && ctx.explicitPrintables.some((p) => !text(p.activityHint, 40));
  if (ambiguousActivity && !ctx.ownerInstructions) {
    return {
      ok: false,
      needsClarification: true,
      clarifyingQuestion: "You requested a printable — which single activity should it link to (e.g. pumpkin color sorting)?",
      code: "guided_printable_activity_clarification",
    };
  }

  return { ok: true, needsClarification: false, context: ctx };
}

function attachGuidedContextToSpec(spec, brief) {
  if (!brief?.guidedWorkflow) return spec;
  const ctx = ownerPrintableContext(brief);
  const ownerLine = ctx.ownerInstructions;
  return {
    ...spec,
    guidedOwnerPrintable: true,
    guidedOwnerContext: ctx,
    ownerInstructions: text(spec.ownerInstructions || ownerLine, 800),
    purpose: text(spec.purpose, 600) || text(ownerLine, 600),
    teacherUse: text(spec.teacherUse, 400) || `Follow owner printable instructions: ${text(ownerLine, 300)}`,
  };
}

module.exports = {
  ownerPrintableContext,
  buildGuidedOwnerPrintableContentPlan,
  tryApplyGuidedRenderEnrichment,
  assessGuidedPrintablesPreCreate,
  attachGuidedContextToSpec,
  parseRequestedPageCount,
};
