/**
 * AI Curriculum Operator — Phase 4.5 printable CONTENT planner.
 *
 * AI (or CI fixture) proposes activity-specific page contents.
 * Deterministic quality gate validates. Trusted pdf-lib renders.
 *
 * Never publishes. Never mutates activity images. Never invents HTML/paths.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const PAGE_TYPES = Object.freeze([
  "menu",
  "order_cards",
  "pretend_food_cards",
  "matching_pairs",
  "sorting",
  "counting_mat",
  "flashcards",
  "picture_cards",
  "movement_cards",
  "emotion_cards",
  "sequencing",
  "handprint_template",
  "footprint_template",
  "scavenger_hunt",
  "dramatic_play_props",
  "teacher_tool",
  "other",
]);

const VISUAL_MODES = Object.freeze([
  "text_layout",
  "simple_vector",
  "generated_asset",
]);

const GIANT_WORD_RE = /^(help|train|go|wash|zone|red|green|yellow|blue|stop|start)$/i;
const FORBIDDEN_INJECTION_RE = /<\/?[a-z]|javascript:|data:text\/html|file:\/\/|\\\\|<\?php/i;

function text(value, max = 2000) {
  return schema.text(value, max);
}

function stripJsonFences(raw) {
  const s = String(raw || "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

function normalizePageType(value) {
  const key = text(value, 40).toLowerCase().replace(/\s+/g, "_");
  if (PAGE_TYPES.includes(key)) return key;
  if (/menu/i.test(key)) return "menu";
  if (/order/i.test(key)) return "order_cards";
  if (/food|pretend/i.test(key)) return "pretend_food_cards";
  if (/match/i.test(key)) return "matching_pairs";
  if (/sort/i.test(key)) return "sorting";
  if (/count/i.test(key)) return "counting_mat";
  if (/flash/i.test(key)) return "flashcards";
  if (/movement|mission/i.test(key)) return "movement_cards";
  if (/emotion|feeling/i.test(key)) return "emotion_cards";
  if (/sequenc/i.test(key)) return "sequencing";
  if (/handprint/i.test(key)) return "handprint_template";
  if (/footprint/i.test(key)) return "footprint_template";
  if (/scavenger/i.test(key)) return "scavenger_hunt";
  if (/dramatic|prop/i.test(key)) return "dramatic_play_props";
  return "other";
}

function normalizeVisualMode(value, pageType) {
  const key = text(value, 40).toLowerCase();
  if (VISUAL_MODES.includes(key)) return key;
  if (/teacher_tool|checklist/i.test(pageType)) return "text_layout";
  if (/menu|order|counting|movement|handprint|footprint/i.test(pageType)) return "simple_vector";
  if (/match|flash|picture|food|emotion|sequenc|scavenger/i.test(pageType)) return "simple_vector";
  return "text_layout";
}

function rejectInjection(value) {
  return FORBIDDEN_INJECTION_RE.test(String(value || ""));
}

function sanitizeItem(raw = {}) {
  const name = text(raw.name || raw.label || raw.word || raw.prompt || raw.action, 80);
  const visualConcept = text(raw.visualConcept || raw.visual || raw.picture || "", 160);
  const pairWith = text(raw.pairWith || raw.match || "", 80);
  const category = text(raw.category || raw.group || "", 60);
  const prompt = text(raw.prompt || raw.teacherPrompt || "", 160);
  if (!name) return null;
  if (rejectInjection(name) || rejectInjection(visualConcept) || rejectInjection(prompt)) return null;
  return {
    name,
    visualConcept: visualConcept || `clear, recognizable illustration of ${name}`,
    pairWith: pairWith || undefined,
    category: category || undefined,
    prompt: prompt || undefined,
  };
}

function normalizeContentPage(raw = {}, index = 1) {
  const type = normalizePageType(raw.type || raw.kind || "other");
  const heading = text(raw.heading || raw.label || raw.title, 120);
  const items = schema.asArray(raw.items || raw.cards || raw.pieces || raw.orders || raw.steps || raw.missions)
    .map((it) => sanitizeItem(typeof it === "string" ? { name: it } : it))
    .filter(Boolean)
    .slice(0, 24);
  const pairs = schema.asArray(raw.pairs).map((p) => {
    if (!p || typeof p !== "object") return null;
    const left = sanitizeItem(p.left || p.a || { name: p.weather || p.helper || p.from });
    const right = sanitizeItem(p.right || p.b || { name: p.clothing || p.tool || p.to });
    if (!left || !right) return null;
    return { left, right };
  }).filter(Boolean).slice(0, 16);
  const categories = schema.asArray(raw.categories || raw.mats).map((c) => {
    if (typeof c === "string") return { name: text(c, 60), visualConcept: `${text(c, 40)} sorting mat` };
    return sanitizeItem(c);
  }).filter(Boolean).slice(0, 8);
  const numbers = schema.asArray(raw.numbers || raw.targets)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 20)
    .slice(0, 10);
  const intentionalBlank = raw.intentionalBlank === true
    || /handprint|footprint|drawing|writing/i.test(type);
  const workAreaLabel = text(raw.workAreaLabel || (intentionalBlank ? "Place child’s print / drawing here" : ""), 120);
  const visualMode = normalizeVisualMode(raw.visualMode, type);
  const teacherUse = text(raw.teacherUse || "", 240);

  return {
    index: Number(raw.index) || index,
    type,
    kind: type,
    label: heading || type,
    heading: heading || type,
    items,
    pairs,
    categories,
    numbers,
    intentionalBlank,
    workAreaLabel,
    visualMode,
    teacherUse,
    needsGeneratedVisual: visualMode === "generated_asset",
  };
}

/**
 * Merge AI content plan into a base Phase 4 printable spec.
 */
function mergeContentIntoSpec(baseSpec, contentPlan) {
  const pages = schema.asArray(contentPlan?.pages).map((p, i) => normalizeContentPage(p, i + 1));
  const title = text(contentPlan?.title || baseSpec?.title, 180);
  const purpose = text(contentPlan?.purpose || baseSpec?.purpose, 600);
  const teacherUse = text(contentPlan?.teacherUse || baseSpec?.teacherUse || purpose, 400);
  const childUse = text(contentPlan?.childUse || baseSpec?.childUse || purpose, 400);
  const resourceType = schema.PRINTABLE_TYPES.includes(text(contentPlan?.resourceType || baseSpec?.resourceType, 40))
    ? text(contentPlan?.resourceType || baseSpec?.resourceType, 40)
    : (baseSpec?.resourceType || "other");
  return {
    ...baseSpec,
    title,
    purpose,
    teacherUse,
    childUse,
    resourceType,
    pageCount: pages.length || Number(baseSpec?.pageCount) || 0,
    pages,
    contentSource: text(contentPlan?.source || "ai_planner", 40),
    visualPlan: {
      generatedAssetPages: pages.filter((p) => p.needsGeneratedVisual).length,
      textOnlyPages: pages.filter((p) => p.visualMode === "text_layout").length,
      simpleVectorPages: pages.filter((p) => p.visualMode === "simple_vector").length,
    },
  };
}

function ageBandKind(ageRaw) {
  const a = text(ageRaw, 80).toLowerCase();
  if (/infant|0\s*[-–]\s*12|baby/i.test(a)) return "infant";
  if (/toddler|12\s*[-–]\s*24|18\s*[-–]\s*24|1\s*[-–]\s*2/i.test(a)) return "toddler";
  if (/preschool|pre-?k|3\s*[-–]\s*5|4\s*[-–]\s*5/i.test(a)) return "preschool";
  return "mixed";
}

/**
 * Deterministic quality gate — reject sparse/generic/mismatched content.
 */
function auditPrintableContentQuality(spec, { activity, plan } = {}) {
  const errors = [];
  const warnings = [];
  const pages = schema.asArray(spec?.pages);
  const activityTitle = text(activity?.title, 180).toLowerCase();
  const ageKind = ageBandKind(spec?.ageBand || plan?.age || activity?.age);
  const purpose = text(spec?.purpose, 600);
  const teacherUse = text(spec?.teacherUse || purpose, 400);

  if (!purpose || purpose.length < 12) errors.push("purpose_too_thin");
  if (!teacherUse || !/print|cut|place|use|children|teacher|during|activity/i.test(teacherUse + purpose)) {
    errors.push("teacher_use_unclear");
  }
  if (!pages.length) errors.push("no_pages");

  let totalContentUnits = 0;
  pages.forEach((page, idx) => {
    const type = normalizePageType(page.type || page.kind);
    const heading = text(page.heading || page.label, 120);
    if (GIANT_WORD_RE.test(heading) && schema.asArray(page.items).length <= 1 && !schema.asArray(page.pairs).length) {
      errors.push(`sparse_giant_word_page:${idx + 1}`);
    }
    if (/zone\s*sign|helper\s*zone|classroom\s*sign/i.test(heading) && !/dramatic|cafe|market|store|restaurant/i.test(activityTitle)) {
      errors.push(`generic_sign_fallback:${idx + 1}`);
    }

    if (type === "matching_pairs") {
      const pairs = schema.asArray(page.pairs);
      if (pairs.length < 3) errors.push(`matching_incomplete:${idx + 1}`);
      else totalContentUnits += pairs.length;
      pairs.forEach((pair) => {
        if (!pair.left?.name || !pair.right?.name) errors.push(`matching_pair_missing_side:${idx + 1}`);
      });
    } else if (type === "sorting") {
      const cats = schema.asArray(page.categories);
      const pieces = schema.asArray(page.items);
      if (cats.length < 2) errors.push(`sorting_missing_categories:${idx + 1}`);
      if (pieces.length < 4) errors.push(`sorting_missing_pieces:${idx + 1}`);
      totalContentUnits += cats.length + pieces.length;
    } else if (type === "menu" || type === "order_cards" || type === "pretend_food_cards" || type === "dramatic_play_props") {
      const items = schema.asArray(page.items);
      if (items.length < 3) errors.push(`dramatic_props_incomplete:${idx + 1}`);
      totalContentUnits += items.length;
    } else if (type === "movement_cards" || type === "scavenger_hunt") {
      const items = schema.asArray(page.items);
      const names = new Set(items.map((i) => text(i.name, 80).toLowerCase()));
      if (items.length < 4) errors.push(`movement_too_few:${idx + 1}`);
      if (names.size < Math.min(4, items.length)) errors.push(`movement_not_distinct:${idx + 1}`);
      totalContentUnits += items.length;
    } else if (type === "flashcards" || type === "picture_cards" || type === "emotion_cards") {
      const items = schema.asArray(page.items);
      if (items.length < 4) errors.push(`cards_too_few:${idx + 1}`);
      if (items.some((i) => GIANT_WORD_RE.test(i.name) && !i.visualConcept)) {
        errors.push(`card_giant_word_only:${idx + 1}`);
      }
      totalContentUnits += items.length;
    } else if (type === "counting_mat") {
      const nums = schema.asArray(page.numbers);
      if (nums.length < 3 && schema.asArray(page.items).length < 3) {
        errors.push(`counting_incomplete:${idx + 1}`);
      }
      totalContentUnits += Math.max(nums.length, schema.asArray(page.items).length);
    } else if (type === "sequencing") {
      if (schema.asArray(page.items).length < 3) errors.push(`sequencing_incomplete:${idx + 1}`);
      totalContentUnits += schema.asArray(page.items).length;
    } else if (type === "handprint_template" || type === "footprint_template") {
      if (!page.intentionalBlank && !page.workAreaLabel) errors.push(`missing_work_area:${idx + 1}`);
      // Intentional work-area pages are complete with a framed blank + supporting labels.
      totalContentUnits += 4;
    } else {
      totalContentUnits += Math.max(1, schema.asArray(page.items).length);
    }
  });

  if (totalContentUnits < 4 && pages.length > 0) errors.push("pack_too_sparse");

  // Age appropriateness
  if (ageKind === "infant") {
    pages.forEach((page, idx) => {
      if (/worksheet|trace|write|cut.?apart|tiny/i.test(`${page.type} ${page.heading}`)) {
        errors.push(`infant_inappropriate:${idx + 1}`);
      }
      if (schema.asArray(page.items).length > 6) warnings.push(`infant_too_many_concepts:${idx + 1}`);
    });
  }
  if (ageKind === "toddler") {
    pages.forEach((page, idx) => {
      if (/worksheet|trace|long writing/i.test(`${page.type} ${page.heading}`)) {
        errors.push(`toddler_inappropriate:${idx + 1}`);
      }
    });
  }

  // Activity relevance — pack title/purpose should relate to distinctive activity words
  const titleBlob = `${text(spec?.title, 180)} ${purpose}`.toLowerCase();
  const stop = new Set(["play", "with", "from", "time", "this", "that", "activity", "children", "little", "group", "week"]);
  const actTokens = activityTitle.split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !stop.has(t));
  const overlap = actTokens.filter((t) => titleBlob.includes(t));
  if (actTokens.length && overlap.length === 0) {
    errors.push("activity_mismatch");
  }

  // Dramatic play packs need more than one page type of prop when multi-page claimed
  const resourceType = text(spec?.resourceType, 40);
  if (/dramatic/i.test(resourceType) && pages.length < 2) {
    errors.push("dramatic_pack_incomplete");
  }

  return {
    ok: errors.length === 0,
    decision: errors.length === 0 ? "PASS" : "REVISE",
    errors,
    warnings,
    totalContentUnits,
  };
}

/**
 * Lightweight second-pass reviewer (deterministic; no extra AI call).
 */
function reviewPrintableSpec(spec, ctx = {}) {
  const gate = auditPrintableContentQuality(spec, ctx);
  return {
    ok: gate.ok,
    decision: gate.decision,
    reasons: gate.ok
      ? ["activity_relevant", "teacher_useful", "complete_enough", "not_filler"]
      : gate.errors,
    gate,
  };
}

function buildPlannerSystemPrompt(ageRaw) {
  const ageKind = ageBandKind(ageRaw);
  return [
    "You are the Little Learner Hub printable CONTENT planner.",
    "Return ONLY valid JSON for one printable pack that supports the given activity.",
    "Do not invent a different activity. Do not output HTML, code, URLs, or file paths.",
    "Every page must have concrete usable content (items, pairs, categories, missions, etc.).",
    "Never produce giant single-word zone/sign filler.",
    `Age band focus: ${ageKind}. Keep content developmentally appropriate.`,
    "visualMode must be text_layout, simple_vector, or generated_asset.",
    "Use generated_asset only when recognizable pictures are essential for child use.",
    "Teacher checklists use text_layout. Matching/picture cards usually simple_vector.",
    "Schema keys: title, resourceType, purpose, teacherUse, childUse, pages[].",
    "pages[].type one of: menu, order_cards, pretend_food_cards, matching_pairs, sorting,",
    "counting_mat, flashcards, picture_cards, movement_cards, emotion_cards, sequencing,",
    "handprint_template, footprint_template, scavenger_hunt, dramatic_play_props, teacher_tool, other.",
    "For matching_pairs include pairs:[{left:{name,visualConcept},right:{name,visualConcept}}].",
    "For sorting include categories:[{name,visualConcept}] and items:[{name,category,visualConcept}].",
  ].join("\n");
}

function buildPlannerUserPrompt(context) {
  return [
    "Plan one activity-driven printable pack for this lesson/activity.",
    "Context JSON:",
    JSON.stringify(context),
  ].join("\n");
}

function buildPlannerContext({ plan, activity, baseSpec }) {
  return {
    lesson: {
      id: text(plan?.id, 160),
      title: text(plan?.title, 180),
      age: text(plan?.age, 80),
      theme: text(plan?.theme, 80),
    },
    activity: {
      id: text(activity?.id, 160),
      title: text(activity?.title, 180),
      category: text(activity?.category, 80),
      objective: text(activity?.objective, 400),
      materials: text(activity?.materials, 300),
      setup: text(activity?.setup, 300),
      steps: text(activity?.steps, 600),
      whatChildrenDo: text(activity?.description || activity?.steps, 400),
    },
    baseDecision: text(baseSpec?.decision, 20),
    baseTitle: text(baseSpec?.title, 180),
    baseType: text(baseSpec?.resourceType, 40),
    basePurpose: text(baseSpec?.purpose, 400),
    requestedPrintable: {
      activityId: text(activity?.id, 160),
      mustSupportActivity: true,
    },
  };
}

function validatePlannerOutput(rawText, { plan, activity, baseSpec }) {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch (_e) {
    return { ok: false, code: "invalid_json", error: "Planner output is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, code: "invalid_shape", error: "Planner output must be an object." };
  }
  if (rejectInjection(JSON.stringify(parsed).slice(0, 4000))) {
    return { ok: false, code: "injection_rejected", error: "Planner output contained forbidden markup/paths." };
  }
  if (parsed.lessonId && text(parsed.lessonId, 160) !== text(plan?.id, 160)) {
    return { ok: false, code: "wrong_lesson_id", error: "Planner lessonId mismatch." };
  }
  if (parsed.activityId && text(parsed.activityId, 160) !== text(activity?.id, 160)) {
    return { ok: false, code: "wrong_activity_id", error: "Planner activityId mismatch." };
  }

  const contentPlan = {
    title: text(parsed.title || baseSpec?.title, 180),
    resourceType: text(parsed.resourceType || baseSpec?.resourceType, 40),
    purpose: text(parsed.purpose || baseSpec?.purpose, 600),
    teacherUse: text(parsed.teacherUse || parsed.purpose, 400),
    childUse: text(parsed.childUse || parsed.purpose, 400),
    pages: schema.asArray(parsed.pages),
    source: "ai_planner",
  };
  if (!contentPlan.pages.length) {
    return { ok: false, code: "missing_pages", error: "Planner returned no pages." };
  }
  const merged = mergeContentIntoSpec(baseSpec, contentPlan);
  const gate = auditPrintableContentQuality(merged, { activity, plan });
  if (!gate.ok) {
    return {
      ok: false,
      code: "quality_gate_failed",
      error: `Printable quality gate: ${gate.errors.join(", ")}`,
      gate,
      spec: merged,
    };
  }
  const review = reviewPrintableSpec(merged, { activity, plan });
  if (!review.ok) {
    return {
      ok: false,
      code: "review_revise",
      error: `Printable review REVISE: ${review.reasons.join(", ")}`,
      review,
      spec: merged,
    };
  }
  return { ok: true, contentPlan, spec: merged, gate, review };
}

/**
 * Activity-specific deterministic fixture for CI / NODE_ENV=test.
 */
function buildOperatorPrintableAiFixtureResponse(userPrompt) {
  let ctx = {};
  try {
    const raw = String(userPrompt || "");
    const idx = raw.indexOf("{");
    if (idx >= 0) ctx = JSON.parse(raw.slice(idx));
  } catch (_e) {
    ctx = {};
  }
  const activity = ctx.activity || {};
  const title = text(activity.title, 180);
  const lower = title.toLowerCase();
  const lessonId = text(ctx.lesson?.id, 160);
  const activityId = text(activity.id, 160);

  let pack;
  if (/cafe|café|restaurant|dramatic|market|bakery/i.test(lower)) {
    pack = {
      title: `${title} Pack`.replace(/\s+Pack Pack$/i, " Pack"),
      resourceType: "dramatic_play_pack",
      purpose: "Children use the menu, order tickets, and pretend food cards during café dramatic play.",
      teacherUse: "Print, cut food cards, place menu at the café table, and give children order tickets.",
      childUse: "Children choose foods from the menu and “write” orders during pretend play.",
      pages: [
        {
          type: "menu",
          heading: "Apple Café Menu",
          visualMode: "simple_vector",
          items: [
            { name: "Apple Slices", visualConcept: "red apple slices on a small plate" },
            { name: "Applesauce", visualConcept: "small bowl of applesauce with spoon" },
            { name: "Apple Muffin", visualConcept: "simple apple muffin" },
            { name: "Apple Juice", visualConcept: "small cup of apple juice" },
          ],
        },
        {
          type: "order_cards",
          heading: "Order Tickets",
          visualMode: "text_layout",
          items: [
            { name: "Table 1 order", visualConcept: "blank order slip with lines" },
            { name: "Table 2 order", visualConcept: "blank order slip with lines" },
            { name: "Takeout order", visualConcept: "blank order slip with lines" },
            { name: "Special order", visualConcept: "blank order slip with lines" },
          ],
        },
        {
          type: "pretend_food_cards",
          heading: "Pretend Apple Foods",
          visualMode: "simple_vector",
          items: [
            { name: "Apple Slices", visualConcept: "cutout apple slices" },
            { name: "Whole Apple", visualConcept: "red apple cutout" },
            { name: "Apple Pie Slice", visualConcept: "triangle pie slice" },
            { name: "Applesauce Cup", visualConcept: "cup of applesauce" },
          ],
        },
      ],
    };
  } else if (/weather|clothing|match/i.test(lower)) {
    pack = {
      title: "Weather Clothing Match Cards",
      resourceType: "matching_cards",
      purpose: "Children match weather pictures to the clothing that fits that weather.",
      teacherUse: "Print, cut pairs, and invite children to match weather to clothing during small group.",
      childUse: "Children find the clothing card that matches each weather card.",
      pages: [
        {
          type: "matching_pairs",
          heading: "Weather / Clothing Match",
          visualMode: "simple_vector",
          pairs: [
            { left: { name: "Sunny", visualConcept: "bright sun" }, right: { name: "Sun hat", visualConcept: "child sun hat" } },
            { left: { name: "Rainy", visualConcept: "rain cloud with drops" }, right: { name: "Raincoat", visualConcept: "yellow raincoat" } },
            { left: { name: "Snowy", visualConcept: "snowflakes" }, right: { name: "Winter coat", visualConcept: "puffy winter coat" } },
            { left: { name: "Windy / Cold", visualConcept: "wind lines and chill" }, right: { name: "Boots", visualConcept: "rain or snow boots" } },
          ],
        },
      ],
    };
  } else if (/sort|color/i.test(lower)) {
    pack = {
      title: `${title} Sorting Pack`,
      resourceType: "sorting_cards",
      purpose: "Children sort pieces onto clear category mats during the activity.",
      teacherUse: "Print mats and pieces; cut pieces; place mats on the table.",
      childUse: "Children place each piece on the matching category mat.",
      pages: [
        {
          type: "sorting",
          heading: "Color Sorting Mats & Pieces",
          visualMode: "simple_vector",
          categories: [
            { name: "Red", visualConcept: "red sorting mat" },
            { name: "Green", visualConcept: "green sorting mat" },
            { name: "Yellow", visualConcept: "yellow sorting mat" },
          ],
          items: [
            { name: "Red apple", category: "Red", visualConcept: "red apple" },
            { name: "Red leaf", category: "Red", visualConcept: "red leaf" },
            { name: "Green apple", category: "Green", visualConcept: "green apple" },
            { name: "Green leaf", category: "Green", visualConcept: "green leaf" },
            { name: "Yellow apple", category: "Yellow", visualConcept: "yellow apple" },
            { name: "Yellow leaf", category: "Yellow", visualConcept: "yellow leaf" },
          ],
        },
      ],
    };
  } else if (/superhero|mission|movement|gross.?motor/i.test(lower)) {
    pack = {
      title: "Superhero Mission Cards",
      resourceType: "movement_cards",
      purpose: "Children draw a mission card and complete a distinct movement or kindness challenge.",
      teacherUse: "Print, cut cards, and offer one mission at a time during training camp.",
      childUse: "Children do the action on their mission card.",
      pages: [
        {
          type: "movement_cards",
          heading: "Mission Cards",
          visualMode: "simple_vector",
          items: [
            { name: "Crawl under the tunnel", visualConcept: "child crawling under hoop tunnel", prompt: "Stay low and keep moving." },
            { name: "Carry a toy to help a friend", visualConcept: "child carrying soft toy", prompt: "Use gentle hands." },
            { name: "Jump over three markers", visualConcept: "child jumping over cones", prompt: "Soft knees." },
            { name: "Deliver the rescue beanbag", visualConcept: "beanbag handoff", prompt: "Walk carefully." },
            { name: "Use kind words", visualConcept: "speech bubble with smile", prompt: "Say something kind." },
            { name: "Balance on one foot", visualConcept: "child balancing", prompt: "Arms out for balance." },
          ],
        },
      ],
    };
  } else if (/handprint|footprint/i.test(lower)) {
    pack = {
      title: `${title} Art Template`,
      resourceType: "handprint_template",
      purpose: "Intentional artwork frame with a clear place for the child’s print.",
      teacherUse: "Print one page per child; guide print placement inside the marked area.",
      childUse: "Child places hand/foot print in the artwork area.",
      pages: [
        {
          type: "handprint_template",
          heading: "Handprint Keepsake",
          visualMode: "text_layout",
          intentionalBlank: true,
          workAreaLabel: "Place handprint here to finish the picture",
          items: [
            { name: "Title banner", visualConcept: "simple decorative banner" },
            { name: "Name line", visualConcept: "line for child’s name" },
          ],
        },
      ],
    };
  } else if (/count/i.test(lower)) {
    pack = {
      title: `${title} Counting Mat`,
      resourceType: "counting_mats",
      purpose: "Children place objects on numbered spaces during the counting activity.",
      teacherUse: "Print mats; provide small manipulatives listed in the activity.",
      childUse: "Children count objects into each numbered space.",
      pages: [
        {
          type: "counting_mat",
          heading: "Count 1–5",
          visualMode: "simple_vector",
          numbers: [1, 2, 3, 4, 5],
          items: [
            { name: "Counting tokens", visualConcept: "simple circle tokens" },
          ],
        },
      ],
    };
  } else if (/emotion|feeling|calm/i.test(lower)) {
    pack = {
      title: `${title} Feeling Cards`,
      resourceType: "emotion_cards",
      purpose: "Children identify and talk about feelings using clearly different emotion cards.",
      teacherUse: "Print and cut; use during circle or calm-down moments.",
      childUse: "Children choose a card that shows how they feel.",
      pages: [
        {
          type: "emotion_cards",
          heading: "Feeling Cards",
          visualMode: "simple_vector",
          items: [
            { name: "Happy", visualConcept: "clear happy face", prompt: "What makes you smile?" },
            { name: "Sad", visualConcept: "clear sad face", prompt: "What helps when you feel sad?" },
            { name: "Mad", visualConcept: "clear mad face", prompt: "How can we calm our body?" },
            { name: "Calm", visualConcept: "clear calm face", prompt: "Show a calm breath." },
            { name: "Excited", visualConcept: "clear excited face", prompt: "How does your body feel?" },
            { name: "Worried", visualConcept: "clear worried face", prompt: "Who can help you?" },
          ],
        },
      ],
    };
  } else {
    // Generic but still content-rich flashcards tied to activity title words
    const words = title.split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
    const items = (words.length ? words : ["Play", "Share", "Listen", "Help"]).map((w) => ({
      name: w.replace(/[^a-zA-Z0-9'-]/g, ""),
      visualConcept: `recognizable picture representing ${w} for ${title}`,
    }));
    while (items.length < 4) {
      items.push({ name: `Concept ${items.length + 1}`, visualConcept: `simple picture for ${title}` });
    }
    pack = {
      title: `${title} Picture Cards`,
      resourceType: "picture_cards",
      purpose: `Children use picture cards that support “${title}”.`,
      teacherUse: "Print, cut, and place cards where children can reach them during the activity.",
      childUse: "Children look at and talk about the picture cards.",
      pages: [
        {
          type: "picture_cards",
          heading: `${title} Cards`,
          visualMode: "simple_vector",
          items,
        },
      ],
    };
  }

  return JSON.stringify({
    lessonId,
    activityId,
    ...pack,
  });
}

/**
 * Plan enriched printable content via injected callAi (fixture in CI).
 */
async function planPrintableContent({
  plan,
  activity,
  baseSpec,
  callAi,
  usePlanner = true,
} = {}) {
  if (usePlanner === false) {
    return { ok: true, skipped: true, spec: baseSpec, usage: { calls: 0 } };
  }
  if (!PRINTABLE_WRITE_DECISION(baseSpec?.decision)) {
    return { ok: true, skipped: true, spec: baseSpec, usage: { calls: 0 } };
  }
  if (typeof callAi !== "function") {
    // Fail closed for CREATE/REPLACE when planner is required — caller may supply fixture callAi.
    return {
      ok: false,
      code: "ai_required",
      error: "Printable content planner requires callAi (fixture or live).",
      usage: { calls: 0 },
    };
  }

  const context = buildPlannerContext({ plan, activity, baseSpec });
  const system = buildPlannerSystemPrompt(plan?.age || activity?.age);
  const user = buildPlannerUserPrompt(context);
  let raw;
  try {
    raw = await callAi(system, user);
  } catch (error) {
    return {
      ok: false,
      code: "ai_call_failed",
      error: text(error?.message || "AI printable planner failed", 400),
      usage: { calls: 1 },
    };
  }

  const validated = validatePlannerOutput(raw, { plan, activity, baseSpec });
  if (!validated.ok) {
    return { ...validated, usage: { calls: 1 } };
  }
  return {
    ok: true,
    spec: validated.spec,
    contentPlan: validated.contentPlan,
    gate: validated.gate,
    review: validated.review,
    usage: { calls: 1 },
  };
}

function PRINTABLE_WRITE_DECISION(decision) {
  const d = text(decision, 20).toUpperCase();
  return d === "CREATE" || d === "REPLACE";
}

module.exports = {
  PAGE_TYPES,
  VISUAL_MODES,
  stripJsonFences,
  normalizePageType,
  normalizeContentPage,
  mergeContentIntoSpec,
  auditPrintableContentQuality,
  reviewPrintableSpec,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  buildPlannerContext,
  validatePlannerOutput,
  buildOperatorPrintableAiFixtureResponse,
  planPrintableContent,
  ageBandKind,
};
