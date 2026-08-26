/**
 * Attach-time visual quality gate for Operator-generated images.
 *
 * Pipeline: generate → inspect generated image → visual QA → PASS / BLOCK → attach only on PASS.
 *
 * Conservative behavior: insufficient confidence → BLOCK for owner review.
 * Does not generate pixels and does not weaken existing prompt or budget gates.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const promptBuilder = require("./visual-prompt-builder.js");

const VERDICT = Object.freeze({
  PASS: "PASS",
  BLOCK: "BLOCK",
  SKIP: "SKIP",
});

const ACTIVITY_QA_CHECKS = Object.freeze([
  "depicts_requested_activity",
  "materials_reasonably_match",
  "child_age_presentation_appropriate",
  "classroom_setting_plausible",
  "no_obvious_extra_limbs_or_hands",
  "no_obvious_malformed_hands_or_faces",
  "no_obvious_duplicated_people_or_objects",
  "no_floating_or_impossible_objects",
  "no_visible_gibberish_or_generated_text",
  "no_obvious_unsafe_toddler_infant_setup",
  "not_cartoon_when_realistic_requested",
  "not_generic_unrelated_stock_imagery",
]);

const PRINTABLE_QA_CHECKS = Object.freeze([
  "requested_subject_or_action_visible",
  "no_baked_in_text_when_renderer_adds_text",
  "style_matches_requested_asset_mode",
  "no_obvious_anatomy_problems",
  "no_obvious_duplicate_or_malformed_objects",
  "visual_clear_enough_for_intended_age",
  "pack_style_consistent_when_measurable",
]);

const CRITICAL_ACTIVITY_CHECKS = Object.freeze([
  "depicts_requested_activity",
  "not_cartoon_when_realistic_requested",
  "no_obvious_extra_limbs_or_hands",
  "no_obvious_unsafe_toddler_infant_setup",
  "no_visible_gibberish_or_generated_text",
]);

const CRITICAL_PRINTABLE_CHECKS = Object.freeze([
  "requested_subject_or_action_visible",
  "no_baked_in_text_when_renderer_adds_text",
  "style_matches_requested_asset_mode",
]);

const REALISTIC_ACTIVITY_MODES = new Set([
  promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
  promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_EXAMPLE,
  promptBuilder.ASSET_MODES.REALISTIC_LESSON_COVER,
  promptBuilder.ASSET_MODES.PICTURE_CARD_REALISTIC,
]);

const VISION_TIMEOUT_MS = 45000;

function text(value, max = 2000) {
  return schema.text(value, max);
}

function oneLine(value, max = 1200) {
  return text(value, max).replace(/\s+/g, " ").trim();
}

function normalizeConfidence(value) {
  const raw = text(value, 20).toLowerCase();
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "low";
}

function isRealisticActivityMode(assetMode) {
  return REALISTIC_ACTIVITY_MODES.has(text(assetMode, 80));
}

function checksForKind(kind) {
  return kind === "printable_visual" ? PRINTABLE_QA_CHECKS : ACTIVITY_QA_CHECKS;
}

function criticalChecksForKind(kind) {
  return kind === "printable_visual" ? CRITICAL_PRINTABLE_CHECKS : CRITICAL_ACTIVITY_CHECKS;
}

function buildVisionSystemPrompt(kind, assetMode) {
  const mode = text(assetMode, 80) || "UNKNOWN";
  if (kind === "printable_visual") {
    return [
      "You are a conservative childcare printable-artwork QA inspector.",
      "Inspect ONE generated image against the requested printable visual brief.",
      `Requested asset mode: ${mode}.`,
      "Return ONLY valid JSON. Do not guess when uncertain — use low confidence and fail the check.",
      "Never approve baked-in text when the renderer is supposed to add text later.",
      "Never approve obvious anatomy defects, duplicates, or wrong illustration style for the mode.",
    ].join(" ");
  }
  return [
    "You are a conservative childcare activity-photo QA inspector.",
    "Inspect ONE generated image against the requested realistic activity setup brief.",
    `Requested asset mode: ${mode}.`,
    "Return ONLY valid JSON. Do not guess when uncertain — use low confidence and fail the check.",
    "If REALISTIC activity photography was requested, cartoon/illustration/storybook rendering is a BLOCK.",
    "Do not approve generic unrelated daycare stock imagery, gibberish text, extra limbs, or unsafe toddler setups.",
  ].join(" ");
}

function buildVisionUserPrompt(context = {}) {
  const kind = text(context.kind, 40) === "printable_visual" ? "printable_visual" : "activity_photo";
  const lines = [
    "Assess this generated image for attach-time QA.",
    `Kind: ${kind}`,
    `Asset mode: ${text(context.assetMode, 80)}`,
    `Age band: ${text(context.ageBand, 80)}`,
  ];
  if (kind === "activity_photo") {
    lines.push(`Activity title: ${text(context.activityTitle, 180)}`);
    lines.push(`Materials: ${oneLine(context.materials, 400)}`);
    lines.push(`Setup: ${oneLine(context.setup, 400)}`);
    lines.push(`Steps/action: ${oneLine(context.steps, 400)}`);
    lines.push(`Image purpose: ${text(context.imagePurpose, 20) || "setup"}`);
  } else {
    lines.push(`Printable title: ${text(context.printableTitle, 180)}`);
    lines.push(`Visual subject: ${text(context.visualSubject, 180)}`);
    lines.push(`Visual concept: ${text(context.visualConcept, 240)}`);
    lines.push(`Page type: ${text(context.pageType, 40)}`);
  }
  if (context.generationPrompt) {
    lines.push(`Generation prompt excerpt: ${oneLine(context.generationPrompt, 500)}`);
  }
  lines.push("");
  lines.push("Return JSON with this exact shape:");
  lines.push("{");
  lines.push('  "checks": {');
  checksForKind(kind).forEach((id, index, arr) => {
    const comma = index < arr.length - 1 ? "," : "";
    lines.push(`    "${id}": { "pass": true|false, "confidence": "high|medium|low", "note": "short reason" }${comma}`);
  });
  lines.push("  },");
  lines.push('  "summary": "one sentence",');
  lines.push('  "blockReasons": ["..."],');
  lines.push('  "recommendedVerdict": "PASS" | "BLOCK"');
  lines.push("}");
  return lines.join("\n");
}

function stripJsonFences(raw) {
  const s = String(raw || "").trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : s;
}

function defaultCheckRecord() {
  return { pass: false, confidence: "low", note: "missing_assessment" };
}

function normalizeVisionAssessment(raw, kind) {
  const expected = checksForKind(kind);
  let parsed = null;
  try {
    parsed = typeof raw === "string" ? JSON.parse(stripJsonFences(raw)) : raw;
  } catch (_error) {
    parsed = null;
  }
  const checks = {};
  expected.forEach((id) => {
    const row = parsed?.checks?.[id] || parsed?.[id] || {};
    checks[id] = {
      id,
      pass: row.pass === true,
      confidence: normalizeConfidence(row.confidence),
      note: oneLine(row.note || row.reason || "", 240),
    };
  });
  return {
    checks,
    summary: oneLine(parsed?.summary, 400),
    blockReasons: schema.asArray(parsed?.blockReasons).map((r) => oneLine(r, 240)).filter(Boolean),
    recommendedVerdict: text(parsed?.recommendedVerdict, 20).toUpperCase() === "PASS" ? VERDICT.PASS : VERDICT.BLOCK,
    parseOk: Boolean(parsed && parsed.checks),
  };
}

function consolidateAttachVerdict(assessment, kind) {
  const critical = new Set(criticalChecksForKind(kind));
  const failed = [];
  const lowConfidenceCritical = [];
  const lowConfidenceAny = [];

  Object.values(assessment.checks || {}).forEach((row) => {
    if (!row.pass) failed.push(row);
    if (row.confidence === "low") {
      lowConfidenceAny.push(row);
      if (critical.has(row.id)) lowConfidenceCritical.push(row);
    }
  });

  const blockReasons = [...assessment.blockReasons];
  failed.forEach((row) => {
    blockReasons.push(`${row.id}: ${row.note || "failed"}`);
  });
  lowConfidenceCritical.forEach((row) => {
    blockReasons.push(`${row.id}: insufficient confidence (${row.note || "uncertain"})`);
  });

  const hardFail = failed.some((row) => {
    if (critical.has(row.id)) return true;
    return row.confidence === "high";
  });
  const reviewRequired = lowConfidenceCritical.length > 0
    || (!assessment.parseOk)
    || (failed.length >= 2)
    || (assessment.recommendedVerdict === VERDICT.BLOCK && failed.length > 0);

  if (!assessment.parseOk) {
    return {
      verdict: VERDICT.BLOCK,
      reviewRequired: true,
      blockReasons: blockReasons.length ? blockReasons : ["visual_qa_malformed_response"],
      failedChecks: failed,
    };
  }

  if (hardFail || reviewRequired || lowConfidenceCritical.length > 0) {
    return {
      verdict: VERDICT.BLOCK,
      reviewRequired: true,
      blockReasons: blockReasons.length ? blockReasons : ["visual_qa_conservative_block"],
      failedChecks: failed,
    };
  }

  if (failed.length === 1 && failed[0].confidence !== "high") {
    return {
      verdict: VERDICT.BLOCK,
      reviewRequired: true,
      blockReasons,
      failedChecks: failed,
    };
  }

  if (lowConfidenceAny.length > 0) {
    return {
      verdict: VERDICT.BLOCK,
      reviewRequired: true,
      blockReasons: blockReasons.length
        ? blockReasons
        : lowConfidenceAny.map((row) => `${row.id}: low confidence`),
      failedChecks: failed,
    };
  }

  return {
    verdict: VERDICT.PASS,
    reviewRequired: false,
    blockReasons: [],
    failedChecks: [],
  };
}

function bufferToDataUrl(buffer, mimeType = "image/png") {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("Visual QA requires a non-empty image buffer.");
  }
  const mime = text(mimeType, 80) || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function defaultVisionAnalyze({
  apiKey,
  model,
  buffer,
  mimeType,
  context,
} = {}) {
  const key = text(apiKey, 200) || text(process.env.OPENAI_API_KEY, 200);
  if (!key) {
    throw new Error("OPENAI_API_KEY is required for visual attach QA.");
  }
  const kind = text(context?.kind, 40) === "printable_visual" ? "printable_visual" : "activity_photo";
  const visionModel = text(model, 80)
    || text(process.env.LLH_OPERATOR_VISION_MODEL, 80)
    || text(process.env.OPENAI_MODEL, 80)
    || "gpt-4o-mini";
  const systemPrompt = buildVisionSystemPrompt(kind, context?.assetMode);
  const userPrompt = buildVisionUserPrompt(context);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: bufferToDataUrl(buffer, mimeType), detail: "low" },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) {
      const msg = text(data?.error?.message || "Vision QA request failed", 300);
      throw new Error(msg);
    }
    const content = data?.choices?.[0]?.message?.content || "";
    return {
      raw: content,
      model: visionModel,
      usage: data?.usage || null,
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function mockVisionAnalyze(context = {}, options = {}) {
  const kind = text(context.kind, 40) === "printable_visual" ? "printable_visual" : "activity_photo";
  const scenario = text(options.mockScenario || context.mockScenario, 80).toLowerCase();
  const checks = {};
  checksForKind(kind).forEach((id) => {
    checks[id] = { pass: true, confidence: "high", note: "mock pass" };
  });

  if (scenario === "block_cartoon" && kind === "activity_photo") {
    checks.not_cartoon_when_realistic_requested = {
      pass: false,
      confidence: "high",
      note: "Image appears illustrated/cartoon rather than realistic photography.",
    };
  }
  if (scenario === "block_text") {
    const id = kind === "printable_visual"
      ? "no_baked_in_text_when_renderer_adds_text"
      : "no_visible_gibberish_or_generated_text";
    checks[id] = {
      pass: false,
      confidence: "high",
      note: "Readable generated text visible in artwork.",
    };
  }
  if (scenario === "block_materials" && kind === "activity_photo") {
    checks.materials_reasonably_match = {
      pass: false,
      confidence: "high",
      note: "Visible materials do not match requested activity list.",
    };
  }
  if (scenario === "block_subject" && kind === "printable_visual") {
    checks.requested_subject_or_action_visible = {
      pass: false,
      confidence: "high",
      note: "Requested subject/action is not clearly visible.",
    };
  }
  if (scenario === "low_confidence") {
    const first = checksForKind(kind)[0];
    checks[first] = { pass: true, confidence: "low", note: "uncertain mock" };
  }
  if (scenario === "malformed") {
    return { raw: "{not-json", model: "mock", usage: null };
  }

  const failed = Object.values(checks).filter((row) => !row.pass);
  return {
    raw: JSON.stringify({
      checks,
      summary: failed.length ? "Mock visual QA blocked." : "Mock visual QA passed.",
      blockReasons: failed.map((row) => row.note),
      recommendedVerdict: failed.length ? "BLOCK" : "PASS",
    }),
    model: "mock-visual-qa",
    usage: null,
  };
}

/**
 * Assess one generated image buffer before attach/upload.
 *
 * @returns {Promise<{ ok: boolean, verdict: string, reviewRequired: boolean, checks: object[], blockReasons: string[], error?: string, model?: string }>}
 */
async function assessVisualAttachQuality({
  buffer,
  mimeType = "image/png",
  context = {},
  analyzeFn,
  apiKey,
  model,
  mock = false,
  mockScenario,
  skip = false,
} = {}) {
  if (skip === true) {
    return {
      ok: true,
      verdict: VERDICT.SKIP,
      reviewRequired: false,
      checks: [],
      blockReasons: [],
      skipped: true,
    };
  }
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
    return {
      ok: false,
      verdict: VERDICT.BLOCK,
      reviewRequired: true,
      checks: [],
      blockReasons: ["missing_or_tiny_image_buffer"],
      error: "Generated image buffer missing or too small for visual QA.",
    };
  }

  const kind = text(context.kind, 40) === "printable_visual" ? "printable_visual" : "activity_photo";
  let analyzed;
  try {
    if (typeof analyzeFn === "function") {
      analyzed = await analyzeFn({
        buffer,
        mimeType,
        context,
        mockScenario,
      });
    } else if (mock === true || ["1", "true", "yes"].includes(String(process.env.VISUAL_ATTACH_QA_MOCK || "").trim().toLowerCase())) {
      analyzed = mockVisionAnalyze(context, { mockScenario });
    } else {
      analyzed = await defaultVisionAnalyze({ apiKey, model, buffer, mimeType, context });
    }
  } catch (error) {
    return {
      ok: false,
      verdict: VERDICT.BLOCK,
      reviewRequired: true,
      checks: [],
      blockReasons: ["visual_qa_analyze_error"],
      error: oneLine(error?.message || "Visual QA analyze failed", 300),
    };
  }

  const assessment = normalizeVisionAssessment(analyzed?.raw ?? analyzed, kind);
  const consolidated = consolidateAttachVerdict(assessment, kind);
  const checkList = Object.values(assessment.checks);
  const ok = consolidated.verdict === VERDICT.PASS;
  return {
    ok,
    verdict: consolidated.verdict,
    reviewRequired: consolidated.reviewRequired,
    checks: checkList,
    blockReasons: consolidated.blockReasons,
    summary: assessment.summary,
    assetMode: text(context.assetMode, 80),
    kind,
    model: analyzed?.model || model || null,
    realisticActivityMode: isRealisticActivityMode(context.assetMode),
    error: ok
      ? null
      : oneLine(consolidated.blockReasons.join("; ") || "Visual attach QA blocked.", 400),
  };
}

module.exports = {
  VERDICT,
  ACTIVITY_QA_CHECKS,
  PRINTABLE_QA_CHECKS,
  CRITICAL_ACTIVITY_CHECKS,
  CRITICAL_PRINTABLE_CHECKS,
  buildVisionSystemPrompt,
  buildVisionUserPrompt,
  normalizeVisionAssessment,
  consolidateAttachVerdict,
  defaultVisionAnalyze,
  mockVisionAnalyze,
  assessVisualAttachQuality,
  isRealisticActivityMode,
};
