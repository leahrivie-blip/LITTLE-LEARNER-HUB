/**
 * Phase 4.6 — printable visual assets (generated_asset mode only).
 *
 * Reuses Phase 3 image generation via injected generateVisual.
 * Never attaches visuals to activity photo fields.
 * CI uses deterministic fixture PNGs (no live OpenAI).
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const DEFAULT_MAX_VISUALS_PER_PACK = 8;
const DEFAULT_MAX_VISUALS_PER_JOB = 24;

/** Tiny deterministic PNG (solid soft blue) for CI embeds — not a geometric “concept substitute”. */
const FIXTURE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH26AAAAAElFTkSuQmCC";

function text(value, max = 500) {
  return schema.text(value, max);
}

function fixturePngBuffer() {
  return Buffer.from(FIXTURE_PNG_BASE64, "base64");
}

function visualConceptKey(concept, name = "") {
  return text(`${name}|${concept}`, 160).toLowerCase().replace(/[^a-z0-9|]+/g, "-");
}

function isRecognitionCriticalPage(page) {
  const type = text(page?.type || page?.kind, 40);
  return /matching_pairs|flashcards|picture_cards|pretend_food_cards|emotion_cards|sequencing|scavenger/i.test(type)
    || page?.visualMode === "generated_asset";
}

function justifyGeneratedAsset(page, itemOrSide) {
  const mode = text(page?.visualMode, 40);
  if (mode === "text_layout" || mode === "simple_vector") return false;
  if (mode === "generated_asset") return true;
  // Unspecified: only recognition-critical page types may request assets.
  return isRecognitionCriticalPage(page) && Boolean(text(itemOrSide?.visualConcept, 80));
}

/**
 * Collect unique visual generation requests from an enriched spec.
 */
function collectRequiredVisuals(spec, { plan, activity } = {}) {
  const requests = [];
  const seen = new Set();
  schema.asArray(spec?.pages).forEach((page, pageIndex) => {
    const pageKey = `p${page.index || pageIndex + 1}:${text(page.type || page.kind, 40)}`;
    const pushItem = (item, role) => {
      if (!item || !justifyGeneratedAsset(page, item)) return;
      const concept = text(item.visualConcept || item.name, 160);
      const name = text(item.name, 80);
      if (!concept || concept.length < 4) return;
      // Reject vague concepts
      if (/^(weather picture|picture|icon|image|drawing)$/i.test(concept)) return;
      const key = visualConceptKey(concept, name);
      if (seen.has(key)) {
        requests.push({
          key,
          reuse: true,
          pageKey,
          role,
          name,
          visualConcept: concept,
        });
        return;
      }
      seen.add(key);
      requests.push({
        key,
        reuse: false,
        pageKey,
        role,
        name,
        visualConcept: concept,
        ageBand: text(spec?.ageBand || plan?.age || activity?.age, 80),
        purpose: text(spec?.purpose, 200),
        printableTitle: text(spec?.title, 120),
        activityId: text(activity?.id, 160),
        generationReason: "recognition_critical_printable_card",
      });
    };

    schema.asArray(page.items).forEach((it) => pushItem(it, "item"));
    schema.asArray(page.pairs).forEach((pair) => {
      pushItem(pair.left, "pair_left");
      pushItem(pair.right, "pair_right");
    });
    schema.asArray(page.categories).forEach((cat) => pushItem(cat, "category"));
  });
  return requests;
}

function assessVisualScope(requests, {
  maxPerPack = DEFAULT_MAX_VISUALS_PER_PACK,
  maxPerJob = DEFAULT_MAX_VISUALS_PER_JOB,
  alreadyUsed = 0,
} = {}) {
  const unique = schema.asArray(requests).filter((r) => !r.reuse);
  if (unique.length > maxPerPack) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Pack requests ${unique.length} unique visuals (max ${maxPerPack}).`,
      planned: unique.length,
    };
  }
  if (alreadyUsed + unique.length > maxPerJob) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Job visual budget exceeded (${alreadyUsed + unique.length} > ${maxPerJob}).`,
      planned: unique.length,
    };
  }
  return { ok: true, planned: unique.length };
}

function buildVisualPrompt(req) {
  return [
    text(req.visualConcept, 160),
    "isolated, clear front view, child-recognizable, printable card illustration",
    "consistent flat childcare printable style, plain light background",
    `for printable “${text(req.printableTitle, 80)}”`,
    `age: ${text(req.ageBand, 40)}`,
    "no text overlay, no watermark, no collage",
  ].filter(Boolean).join(", ");
}

/**
 * Generate or reuse printable visuals. Never writes activity image fields.
 */
async function materializePrintableVisuals({
  spec,
  plan,
  activity,
  generateVisual,
  visualCache = new Map(),
  limits = {},
  alreadyUsed = 0,
  forceFixture = false,
} = {}) {
  const requests = collectRequiredVisuals(spec, { plan, activity });
  const scope = assessVisualScope(requests, {
    maxPerPack: Number(limits.maxPrintableVisualsPerPack) || DEFAULT_MAX_VISUALS_PER_PACK,
    maxPerJob: Number(limits.maxPrintableVisualsPerJob) || DEFAULT_MAX_VISUALS_PER_JOB,
    alreadyUsed,
  });
  if (!scope.ok) return { ok: false, code: scope.code, error: scope.reason, usage: { generations: 0 } };

  const requiredGenerated = requests.filter((r) => justifyGeneratedAsset(
    { visualMode: "generated_asset", type: "picture_cards" },
    { visualConcept: r.visualConcept, name: r.name },
  ) || r.generationReason);
  // Only pages marked generated_asset produce generations — filter to those whose page mode is generated_asset
  const pageModes = new Map();
  schema.asArray(spec.pages).forEach((p, i) => {
    pageModes.set(`p${p.index || i + 1}:${text(p.type || p.kind, 40)}`, text(p.visualMode, 40));
  });
  const toGenerate = [];
  const keyToBuffer = new Map(visualCache);
  let generations = 0;

  for (const req of requests) {
    const mode = pageModes.get(req.pageKey) || "";
    if (mode !== "generated_asset") continue;
    if (keyToBuffer.has(req.key)) continue;
    if (req.reuse && keyToBuffer.has(req.key)) continue;
    toGenerate.push(req);
  }

  for (const req of toGenerate) {
    if (keyToBuffer.has(req.key)) continue;
    let buffer = null;
    if (forceFixture || typeof generateVisual !== "function") {
      buffer = fixturePngBuffer();
    } else {
      // eslint-disable-next-line no-await-in-loop
      const out = await generateVisual({
        prompt: buildVisualPrompt(req),
        printableTitle: req.printableTitle,
        pageKey: req.pageKey,
        visualConcept: req.visualConcept,
        ageBand: req.ageBand,
        purpose: req.purpose,
        itemName: req.name,
        generationReason: req.generationReason,
        mock: forceFixture,
      });
      buffer = out?.buffer || null;
    }
    if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
      return {
        ok: false,
        code: "visual_generation_failed",
        error: `Required visual failed for “${req.name}” (${req.visualConcept}).`,
        usage: { generations },
      };
    }
    keyToBuffer.set(req.key, buffer);
    generations += 1;
    visualCache.set(req.key, buffer);
  }

  // Attach buffers onto spec clone
  const next = JSON.parse(JSON.stringify(spec));
  const missing = [];
  schema.asArray(next.pages).forEach((page, pageIndex) => {
    if (text(page.visualMode, 40) !== "generated_asset") return;
    const pageKey = `p${page.index || pageIndex + 1}:${text(page.type || page.kind, 40)}`;
    const attach = (item) => {
      if (!item) return;
      const key = visualConceptKey(item.visualConcept || item.name, item.name);
      const buf = keyToBuffer.get(key);
      if (!buf) {
        missing.push(`${pageKey}:${item.name}`);
        return;
      }
      item.visualAssetKey = key;
      item.visualPngBase64 = buf.toString("base64");
    };
    schema.asArray(page.items).forEach(attach);
    schema.asArray(page.pairs).forEach((pair) => {
      attach(pair.left);
      attach(pair.right);
    });
    schema.asArray(page.categories).forEach(attach);
  });

  if (missing.length) {
    return {
      ok: false,
      code: "missing_required_visual",
      error: `Missing required printable visuals: ${missing.slice(0, 6).join(", ")}`,
      usage: { generations },
    };
  }

  return {
    ok: true,
    spec: next,
    usage: { generations, cached: requests.filter((r) => r.reuse).length },
    visualCache,
    requests: toGenerate,
  };
}

function validateEmbeddedVisuals(spec) {
  const errors = [];
  schema.asArray(spec?.pages).forEach((page, pageIndex) => {
    if (text(page.visualMode, 40) !== "generated_asset") return;
    const check = (item, label) => {
      if (!item) return;
      if (!item.visualPngBase64 || String(item.visualPngBase64).length < 20) {
        errors.push(`missing_embed:${pageIndex + 1}:${label}`);
      }
    };
    schema.asArray(page.items).forEach((it, i) => check(it, it.name || `item${i}`));
    schema.asArray(page.pairs).forEach((pair, i) => {
      check(pair.left, `pair${i}.left`);
      check(pair.right, `pair${i}.right`);
    });
  });
  return { ok: errors.length === 0, errors };
}

module.exports = {
  DEFAULT_MAX_VISUALS_PER_PACK,
  DEFAULT_MAX_VISUALS_PER_JOB,
  fixturePngBuffer,
  visualConceptKey,
  justifyGeneratedAsset,
  collectRequiredVisuals,
  assessVisualScope,
  buildVisualPrompt,
  materializePrintableVisuals,
  validateEmbeddedVisuals,
};
