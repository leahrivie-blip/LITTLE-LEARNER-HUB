/**
 * AI Guide (testing-only) — Phase 1 helpers and route handlers.
 * Fence with AI_GUIDE_ENABLED + AI_GUIDE_TESTING_ONLY (or AI_GUIDE_ENABLED alone in NODE_ENV=test).
 */
const crypto = require("node:crypto");

const AI_GUIDE_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.AI_GUIDE_ENABLED || "").trim().toLowerCase(),
);
const AI_GUIDE_TESTING_ONLY = ["1", "true", "yes", "on"].includes(
  String(process.env.AI_GUIDE_TESTING_ONLY || "true").trim().toLowerCase(),
);
const AI_GUIDE_MODEL = String(process.env.AI_MODEL || process.env.OPENAI_MODEL || "").trim();
const AI_DAILY_USER_LIMIT = Math.max(1, Number(process.env.AI_DAILY_USER_LIMIT || 40));
const AI_MONTHLY_PROGRAM_LIMIT = Math.max(1, Number(process.env.AI_MONTHLY_PROGRAM_LIMIT || 2000));
const AI_MAX_INPUT_CHARS = Math.max(200, Number(process.env.AI_MAX_INPUT_CHARS || 4000));
const AI_LOG_PROMPT_CONTENT = ["1", "true", "yes", "on"].includes(
  String(process.env.AI_LOG_PROMPT_CONTENT || "").trim().toLowerCase(),
);

const PHASE1_FEATURES = Object.freeze([
  {
    id: "lesson",
    category: "Lesson Planning",
    title: "Lesson plan draft",
    blurb: "Draft play-based days and weeks that match your room.",
    backendTool: "lesson",
    lengths: ["quick", "standard", "detailed"],
  },
  {
    id: "activity",
    category: "Activities",
    title: "Activity idea",
    blurb: "Turn interests and materials into ready-to-run invitations.",
    backendTool: "activity",
    lengths: ["quick", "standard", "detailed"],
  },
  {
    id: "observation",
    category: "Observations",
    title: "Observation draft",
    blurb: "Turn rough notes into clear, respectful observation drafts.",
    backendTool: "observation",
    lengths: ["quick", "standard", "detailed"],
  },
  {
    id: "parentMessage",
    category: "Parent Communication",
    title: "Parent message",
    blurb: "Warm, clear family messages you review before sending.",
    backendTool: "parentMessage",
    lengths: ["quick", "standard", "detailed"],
  },
  {
    id: "incident",
    category: "Incident and Injury Documentation",
    title: "Incident narrative helper",
    blurb: "Organize facts into a careful draft — never assigns blame.",
    backendTool: "incidentReport",
    lengths: ["quick", "standard", "detailed"],
  },
  {
    id: "form",
    category: "Forms",
    title: "Form draft helper",
    blurb: "Suggest sections and fields for enrollment and program forms.",
    backendTool: "form",
    lengths: ["quick", "standard", "detailed"],
  },
]);

const CATEGORIES = Object.freeze([
  { id: "lesson-planning", label: "Lesson Planning", blurb: "Draft play-based days and weeks that match your room.", featureIds: ["lesson"] },
  { id: "activities", label: "Activities", blurb: "Turn interests and materials into ready-to-run invitations.", featureIds: ["activity"] },
  { id: "observations", label: "Observations", blurb: "Turn rough notes into clear, respectful observation drafts.", featureIds: ["observation"] },
  { id: "daily-reports", label: "Daily Reports", blurb: "Coming in Phase 2 — summarize the day from facts you enter.", featureIds: [], phase: 2 },
  { id: "parent-communication", label: "Parent Communication", blurb: "Warm, clear family messages you review before sending.", featureIds: ["parentMessage"] },
  { id: "incident", label: "Incident and Injury Documentation", blurb: "Organize facts into a careful draft — never assigns blame.", featureIds: ["incident"] },
  { id: "behavior", label: "Behavior and Support", blurb: "Coming in Phase 2 — objective notes and support ideas.", featureIds: [], phase: 2 },
  { id: "development", label: "Child Development", blurb: "Coming in Phase 2 — summaries from observations you select.", featureIds: [], phase: 2 },
  { id: "forms", label: "Forms", blurb: "Suggest sections and fields for enrollment and program forms.", featureIds: ["form"] },
  { id: "policies", label: "Policies and Handbooks", blurb: "Coming in Phase 2 — draft policy language for review.", featureIds: [], phase: 2 },
  { id: "staff", label: "Staff and Classroom Communication", blurb: "Coming in Phase 2 — announcements and substitute notes.", featureIds: [], phase: 2 },
  { id: "enrollment", label: "Enrollment and Family Communication", blurb: "Coming in Phase 2 — inquiry and welcome drafts.", featureIds: [], phase: 2 },
  { id: "admin-writing", label: "Administrative Writing", blurb: "Coming in Phase 2 — short practical admin notes.", featureIds: [], phase: 2 },
]);

const ROBOTIC_PHRASES = Object.freeze([
  "it is important to note",
  "furthermore",
  "moreover",
  "this comprehensive activity",
  "holistic development",
  "multifaceted",
  "exceptional ability",
  "facilitate",
  "strategically designed",
]);

const WRITING_PREAMBLE = `Write like an experienced childcare professional. Use natural, clear language. Keep the response practical and concise. Do not use robotic, academic, legal, or overly formal wording. Do not invent facts. Use only information provided by the user or approved source records.

Sound like a teacher or director wrote it: warm, professional, specific to childcare, and short enough to actually use.

Avoid phrases such as: "It is important to note," "Furthermore," "Moreover," "This comprehensive…," "holistic," "multifaceted," "exceptional ability," "facilitate," "strategically designed," long introductions, repeated summaries, and exaggerated claims.

Never automatically send, publish, sign, approve, file, diagnose, or claim legal/licensing compliance.`;

const FEATURE_PROMPTS = Object.freeze({
  lesson: `${WRITING_PREAMBLE}

You help draft play-based childcare lesson plans for Little Learner Hub.
Include only sections that fit the request. Never leave blank weekdays if a full week is requested.
Avoid worksheets as the primary experience. Do not invent unverified state standards.
Call out adult supervision and safety. Keep plans practical and printable.
Mark the result as a draft for provider review.`,
  activity: `${WRITING_PREAMBLE}

Draft one practical childcare activity with: title, purpose, materials, setup, steps, teacher role, open-ended questions, adaptations, safety notes, and cleanup.
Keep directions short and realistic. Do not invent materials the provider did not list as available unless marked as suggestions.`,
  observation: `${WRITING_PREAMBLE}

Turn provider notes into an objective observation draft.
Separate observed facts from light interpretation. Never invent quotes, actions, dates, or skills.
Do not diagnose or use labels like bad, aggressive, lazy, delayed, manipulative, or spoiled.
Use strengths-based language. If a developmental connection is inferred, mark it clearly for review.`,
  parentMessage: `${WRITING_PREAMBLE}

Draft a family-facing message from the provider's notes.
Never threaten families, invent policy, or admit legal responsibility.
Preserve specific facts. Do not add events that were not provided.
This is a draft only — the provider must review before sending.`,
  incident: `${WRITING_PREAMBLE}

Organize provider-entered incident facts into a factual narrative draft.
Do not invent time, injury details, care provided, or notification.
Do not diagnose, assign blame, or say the child is "fine" or that no further treatment is needed.
If critical fields are missing, write a partial draft and list short missing-information prompts.
Include a one-line reminder to follow emergency procedures when appropriate.
AI cannot sign, approve, or close the report.`,
  form: `${WRITING_PREAMBLE}

Help draft a childcare form outline: purpose sentence, suggested sections, and fields.
Clearly state this is a draft requiring professional review and is not legally compliant or licensing-approved.
Do not request unnecessary Social Security numbers or financial account details.
Never claim state approval.`,
});

const REVISION_INSTRUCTIONS = Object.freeze({
  make_shorter: "Make the draft shorter while keeping every provided fact.",
  add_detail: "Add a little more practical detail without inventing facts.",
  make_professional: "Improve clarity and grammar without making it formal, robotic, or longer.",
  make_family_friendly: "Make the wording warmer and easier for families, without inventing facts.",
  make_warmer: "Make the tone warmer while staying professional and factual.",
  make_direct: "Make the wording more direct and clear.",
  simpler_words: "Use simpler everyday words.",
  remove_edu_wording: "Remove academic or heavy educational jargon.",
  facts_only: "Keep only the facts. Remove interpretation and fluff.",
  missing_info_prompts: "Keep the draft, and add a short list of missing-information questions the provider should answer.",
});

function isAiGuideEnabled() {
  if (!AI_GUIDE_ENABLED) return false;
  if (process.env.NODE_ENV === "test") return true;
  return AI_GUIDE_TESTING_ONLY;
}

function defaultAiGuideSettings() {
  const features = {};
  PHASE1_FEATURES.forEach((feature) => {
    features[feature.id] = { enabled: true };
  });
  return {
    masterEnabled: true,
    testingOnly: true,
    emergencyKillSwitch: false,
    dailyUserLimit: AI_DAILY_USER_LIMIT,
    monthlyProgramLimit: AI_MONTHLY_PROGRAM_LIMIT,
    maxInputChars: AI_MAX_INPUT_CHARS,
    features,
    promptTemplateVersion: "phase1-v1",
  };
}

function ensureAiGuideCollections(store) {
  store.aiGuideDrafts = Array.isArray(store.aiGuideDrafts) ? store.aiGuideDrafts : [];
  store.aiGuideFeedback = Array.isArray(store.aiGuideFeedback) ? store.aiGuideFeedback : [];
  store.aiGuideUsage = Array.isArray(store.aiGuideUsage) ? store.aiGuideUsage : [];
  store.aiGuideSettings = store.aiGuideSettings && typeof store.aiGuideSettings === "object"
    ? { ...defaultAiGuideSettings(), ...store.aiGuideSettings, features: { ...defaultAiGuideSettings().features, ...(store.aiGuideSettings.features || {}) } }
    : defaultAiGuideSettings();
  return store;
}

function aiGuideStatus() {
  const enabled = isAiGuideEnabled();
  return {
    enabled,
    ready: enabled,
    testingOnly: true,
    phase: 1,
    features: enabled ? PHASE1_FEATURES.map((f) => f.id) : [],
    envVars: ["AI_GUIDE_ENABLED", "AI_GUIDE_TESTING_ONLY"],
    note: enabled
      ? "AI Guide testing surfaces are ON. Keep off on live production."
      : "AI Guide is OFF. Set AI_GUIDE_ENABLED=true (and AI_GUIDE_TESTING_ONLY=true) only on the testing service.",
  };
}

function findFeature(featureId) {
  return PHASE1_FEATURES.find((item) => item.id === featureId) || null;
}

function normalizeLength(value) {
  const raw = String(value || "standard").trim().toLowerCase();
  if (raw === "quick" || raw === "detailed") return raw;
  return "standard";
}

function lengthInstruction(length) {
  if (length === "quick") return "Length mode: Quick — use 1–3 sentences (or a very short bullet list if needed).";
  if (length === "detailed") return "Length mode: Detailed — include useful detail, but stay practical and concise.";
  return "Length mode: Standard — one short useful paragraph or a concise completed section. Default.";
}

function containsRoboticPhrases(text) {
  const lower = String(text || "").toLowerCase();
  return ROBOTIC_PHRASES.filter((phrase) => lower.includes(phrase));
}

function localFallbackDraft(featureId, notes, length) {
  const clean = String(notes || "").trim();
  const prefix = length === "quick" ? "" : "AI was unavailable, so this is a local starter draft for review.\n\n";
  if (featureId === "observation") {
    return `${prefix}During classroom play, we noticed: ${clean || "[add what you observed]"}. We will continue offering similar experiences and watching for growth.`;
  }
  if (featureId === "parentMessage") {
    return `${prefix}Hi! ${clean || "[add your update]"}\n\nThank you!`;
  }
  if (featureId === "incident") {
    return `${prefix}Incident draft (review carefully):\n${clean || "[add time, place, what happened, care provided, and family notification]"}\n\nMissing information prompts:\n- What time did this happen?\n- What care was provided?\n- Was the family notified?\n\nFollow emergency procedures and contact emergency services when appropriate.`;
  }
  if (featureId === "activity") {
    return `${prefix}Activity idea draft\nPurpose: Support exploration based on your notes.\nProvider notes: ${clean || "[add interest, materials, age]"}\nTeacher role: Follow the children's ideas and ask simple open-ended questions.\nSafety: Supervise closely and adapt materials for the age group.`;
  }
  if (featureId === "lesson") {
    return `${prefix}Lesson plan starter draft\nOverview: ${clean || "[add age group, interests, and goals]"}\nKeep experiences play-based, practical, and supervised. Fill each day before using with children.`;
  }
  if (featureId === "form") {
    return `${prefix}Form outline draft (not legally reviewed)\nPurpose: ${clean || "[describe the form]"}\nSuggested sections: Child information, Family contacts, Permissions, Signatures.\nDraft—review against your state requirements and program policies before publishing.`;
  }
  return `${prefix}${clean || "Add your notes, then regenerate."}`;
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

function countUsage(entries, predicate) {
  return (entries || []).filter(predicate).length;
}

function publicDraft(draft) {
  if (!draft) return null;
  return {
    id: draft.id,
    featureId: draft.featureId,
    category: draft.category,
    title: draft.title || "",
    childName: draft.childName || "",
    ageGroup: draft.ageGroup || "",
    length: draft.length || "standard",
    notes: draft.notes || "",
    outputText: draft.editedOutputText || draft.outputText || "",
    originalOutputText: draft.outputText || "",
    generatedByAi: Boolean(draft.generatedByAi),
    localFallback: Boolean(draft.localFallback),
    generatedAt: draft.generatedAt || "",
    requestedByEmail: draft.requestedByEmail || "",
    regenerateCount: Number(draft.regenerateCount || 0),
    editedAfterGeneration: Boolean(draft.editedAfterGeneration),
    reviewAcknowledgedAt: draft.reviewAcknowledgedAt || "",
    status: draft.status || "draft",
    missingInfoPrompts: Array.isArray(draft.missingInfoPrompts) ? draft.missingInfoPrompts : [],
    sourceLabel: draft.sourceLabel || "AI Guide",
  };
}

function createAiGuideHandlers(deps) {
  const {
    readStore,
    writeStoreAsync,
    jsonResponse,
    readJson,
    normalizeEmail,
    generateOpenAiContent,
    resolveIdentity,
    requireAdmin,
  } = deps;

  function requireGuideEnv(response) {
    if (!isAiGuideEnabled()) {
      jsonResponse(response, 404, { error: "AI Guide is only available on the testing site." });
      return false;
    }
    return true;
  }

  function requireGuide(response) {
    if (!requireGuideEnv(response)) return false;
    const store = ensureAiGuideCollections(readStore());
    if (store.aiGuideSettings.emergencyKillSwitch || store.aiGuideSettings.masterEnabled === false) {
      jsonResponse(response, 503, { error: "AI Guide is temporarily disabled by an administrator." });
      return false;
    }
    return true;
  }

  async function identityOr401(request, response) {
    try {
      return await resolveIdentity(request);
    } catch (_error) {
      jsonResponse(response, 401, { error: "Please sign in to use AI Guide." });
      return null;
    }
  }

  function usageAllowed(store, email) {
    const settings = store.aiGuideSettings;
    const daily = countUsage(store.aiGuideUsage, (row) => row.email === email && row.day === dayKey() && row.ok);
    const monthly = countUsage(store.aiGuideUsage, (row) => row.day && String(row.day).startsWith(monthKey()) && row.ok);
    if (daily >= Number(settings.dailyUserLimit || AI_DAILY_USER_LIMIT)) {
      return { allowed: false, reason: `Daily AI Guide limit reached (${settings.dailyUserLimit}/day).` };
    }
    if (monthly >= Number(settings.monthlyProgramLimit || AI_MONTHLY_PROGRAM_LIMIT)) {
      return { allowed: false, reason: `Monthly AI Guide program limit reached.` };
    }
    return { allowed: true, daily, monthly };
  }

  async function handleConfig(request, response) {
    if (!requireGuide(response)) return;
    const store = ensureAiGuideCollections(readStore());
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const usage = usageAllowed(store, identity.email);
    jsonResponse(response, 200, {
      ok: true,
      status: aiGuideStatus(),
      categories: CATEGORIES,
      features: PHASE1_FEATURES.map((feature) => ({
        ...feature,
        enabled: store.aiGuideSettings.features?.[feature.id]?.enabled !== false,
      })),
      defaults: { length: "standard" },
      limits: {
        dailyUserLimit: store.aiGuideSettings.dailyUserLimit,
        monthlyProgramLimit: store.aiGuideSettings.monthlyProgramLimit,
        maxInputChars: store.aiGuideSettings.maxInputChars,
        dailyUsed: usage.daily || 0,
        monthlyUsed: usage.monthly || 0,
      },
      reviewBanner: "AI-generated draft. Review for accuracy before saving, sharing, signing, or using.",
    });
  }

  async function handleGenerate(request, response) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const body = await readJson(request);
    const feature = findFeature(String(body.featureId || "").trim());
    if (!feature) {
      jsonResponse(response, 400, { error: "Choose a supported AI Guide feature." });
      return;
    }
    const store = ensureAiGuideCollections(readStore());
    if (store.aiGuideSettings.features?.[feature.id]?.enabled === false) {
      jsonResponse(response, 503, { error: "That AI Guide feature is turned off." });
      return;
    }
    const gate = usageAllowed(store, identity.email);
    if (!gate.allowed) {
      jsonResponse(response, 429, { error: gate.reason, code: "ai_guide_limit" });
      return;
    }
    const notes = String(body.notes || body.prompt || "").trim().slice(0, Number(store.aiGuideSettings.maxInputChars || AI_MAX_INPUT_CHARS));
    if (!notes) {
      jsonResponse(response, 400, { error: "Add a short description or notes first." });
      return;
    }
    const length = normalizeLength(body.length);
    const childName = String(body.childName || "").trim().slice(0, 80);
    const ageGroup = String(body.ageGroup || body.age || "").trim().slice(0, 40);
    const context = String(body.context || "").trim().slice(0, 500);
    const tone = String(body.tone || "").trim().slice(0, 40);
    const start = Date.now();
    let output = "";
    let localFallback = false;
    let model = AI_GUIDE_MODEL || "local-fallback";
    const userPrompt = [
      lengthInstruction(length),
      childName ? `Child (optional): ${childName}` : "",
      ageGroup ? `Age group: ${ageGroup}` : "",
      tone ? `Tone: ${tone}` : "",
      context ? `Extra context: ${context}` : "",
      `Provider notes:\n${notes}`,
      "Return only the draft the provider can copy and edit. No preamble about being an AI.",
    ].filter(Boolean).join("\n\n");

    try {
      const aiResult = await generateOpenAiContent({
        tool: feature.backendTool,
        prompt: `${FEATURE_PROMPTS[feature.id]}\n\n${userPrompt}`,
        age: ageGroup,
        email: identity.email,
      });
      output = String(aiResult.output || "").trim();
      model = aiResult.model || model;
    } catch (error) {
      localFallback = true;
      output = localFallbackDraft(feature.id, notes, length);
      if (!output) {
        jsonResponse(response, 503, { error: error.message || "AI Guide is unavailable right now." });
        return;
      }
    }

    const robotic = containsRoboticPhrases(output);
    if (robotic.length && !localFallback) {
      // Soft rewrite request via local cleanup — strip common openers without inventing facts.
      output = output
        .replace(/^it is important to note that\s+/i, "")
        .replace(/\bfurthermore,\s*/gi, "")
        .replace(/\bmoreover,\s*/gi, "")
        .trim();
    }

    const missingInfoPrompts = [];
    if (feature.id === "incident") {
      const lower = `${notes}\n${output}`.toLowerCase();
      if (!/\b\d{1,2}:\d{2}|\b\d{1,2}\s*(am|pm)\b|\btime\b/.test(lower)) missingInfoPrompts.push("What time did this happen?");
      if (!/wash|bandage|ice|cleaned|care|first aid/.test(lower)) missingInfoPrompts.push("What care was provided?");
      if (!/call|called|notified|text|emailed|parent|family/.test(lower)) missingInfoPrompts.push("Was the family notified?");
    }

    const draft = {
      id: `aig_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      featureId: feature.id,
      category: feature.category,
      title: feature.title,
      childName,
      ageGroup,
      length,
      notes: AI_LOG_PROMPT_CONTENT ? notes : notes.slice(0, 240),
      outputText: output,
      editedOutputText: output,
      generatedByAi: !localFallback,
      localFallback,
      generatedAt: new Date().toISOString(),
      requestedByEmail: identity.email,
      regenerateCount: 0,
      editedAfterGeneration: false,
      reviewAcknowledgedAt: "",
      status: "draft",
      missingInfoPrompts,
      model,
      sourceLabel: localFallback ? "Local starter draft" : "AI Guide",
    };

    store.aiGuideDrafts.unshift(draft);
    store.aiGuideDrafts = store.aiGuideDrafts.slice(0, 500);
    store.aiGuideUsage.unshift({
      id: `aigu_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      email: identity.email,
      featureId: feature.id,
      category: feature.category,
      ok: true,
      localFallback,
      latencyMs: Date.now() - start,
      day: dayKey(),
      createdAt: new Date().toISOString(),
    });
    store.aiGuideUsage = store.aiGuideUsage.slice(0, 5000);
    await writeStoreAsync(store);

    jsonResponse(response, 200, {
      ok: true,
      draft: publicDraft(draft),
      reviewBanner: "AI-generated draft. Review for accuracy before saving, sharing, signing, or using.",
      canAutoSend: false,
      canAutoPublish: false,
    });
  }

  async function handleRevise(request, response) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const body = await readJson(request);
    const store = ensureAiGuideCollections(readStore());
    const draft = store.aiGuideDrafts.find((item) => item.id === body.draftId && item.requestedByEmail === identity.email && !item.deletedAt);
    if (!draft) {
      jsonResponse(response, 404, { error: "Draft not found." });
      return;
    }
    const action = String(body.action || "").trim();
    const instruction = REVISION_INSTRUCTIONS[action];
    if (!instruction) {
      jsonResponse(response, 400, { error: "Choose a supported revision action." });
      return;
    }
    const gate = usageAllowed(store, identity.email);
    if (!gate.allowed) {
      jsonResponse(response, 429, { error: gate.reason, code: "ai_guide_limit" });
      return;
    }
    const feature = findFeature(draft.featureId);
    const current = String(draft.editedOutputText || draft.outputText || "");
    let next = current;
    let localFallback = false;
    try {
      const aiResult = await generateOpenAiContent({
        tool: feature?.backendTool || "observation",
        prompt: `${FEATURE_PROMPTS[draft.featureId] || WRITING_PREAMBLE}\n\nRevision instruction: ${instruction}\n\nCurrent draft:\n${current}\n\nProvider notes:\n${draft.notes || ""}`,
        age: draft.ageGroup,
        email: identity.email,
      });
      next = String(aiResult.output || current).trim() || current;
    } catch (_error) {
      localFallback = true;
      if (action === "make_shorter") next = current.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
      else if (action === "facts_only") next = current;
      else if (action === "missing_info_prompts") {
        next = `${current}\n\nMissing information prompts:\n- What else should families or staff know?\n- Which facts still need to be confirmed?`;
      }
    }
    draft.editedOutputText = next;
    draft.regenerateCount = Number(draft.regenerateCount || 0) + 1;
    draft.editedAfterGeneration = true;
    draft.revisionActions = Array.isArray(draft.revisionActions) ? draft.revisionActions : [];
    draft.revisionActions.push({ action, at: new Date().toISOString(), localFallback });
    store.aiGuideUsage.unshift({
      id: `aigu_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      email: identity.email,
      featureId: draft.featureId,
      category: draft.category,
      ok: true,
      revision: action,
      localFallback,
      day: dayKey(),
      createdAt: new Date().toISOString(),
    });
    await writeStoreAsync(store);
    jsonResponse(response, 200, { ok: true, draft: publicDraft(draft) });
  }

  async function handleListDrafts(request, response) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const store = ensureAiGuideCollections(readStore());
    const drafts = store.aiGuideDrafts
      .filter((item) => item.requestedByEmail === identity.email && !item.deletedAt)
      .slice(0, 50)
      .map(publicDraft);
    jsonResponse(response, 200, { ok: true, drafts });
  }

  async function handlePatchDraft(request, response, draftId) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const body = await readJson(request);
    const store = ensureAiGuideCollections(readStore());
    const draft = store.aiGuideDrafts.find((item) => item.id === draftId && item.requestedByEmail === identity.email && !item.deletedAt);
    if (!draft) {
      jsonResponse(response, 404, { error: "Draft not found." });
      return;
    }
    if (typeof body.outputText === "string") {
      draft.editedOutputText = body.outputText.slice(0, 20000);
      draft.editedAfterGeneration = true;
    }
    if (body.acknowledgeReview === true) {
      draft.reviewAcknowledgedAt = new Date().toISOString();
    }
    if (body.status === "used" || body.status === "discarded" || body.status === "draft") {
      draft.status = body.status;
    }
    await writeStoreAsync(store);
    jsonResponse(response, 200, { ok: true, draft: publicDraft(draft) });
  }

  async function handleDeleteDraft(request, response, draftId) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const store = ensureAiGuideCollections(readStore());
    const draft = store.aiGuideDrafts.find((item) => item.id === draftId && item.requestedByEmail === identity.email);
    if (!draft) {
      jsonResponse(response, 404, { error: "Draft not found." });
      return;
    }
    draft.deletedAt = new Date().toISOString();
    draft.status = "discarded";
    await writeStoreAsync(store);
    jsonResponse(response, 200, { ok: true });
  }

  async function handleFeedback(request, response, draftId) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const body = await readJson(request);
    const rating = String(body.rating || "").trim().toLowerCase();
    const allowed = new Set(["helpful", "needs_improvement", "incorrect", "unsafe", "missing_info"]);
    if (!allowed.has(rating)) {
      jsonResponse(response, 400, { error: "Choose a valid feedback rating." });
      return;
    }
    const store = ensureAiGuideCollections(readStore());
    const draft = store.aiGuideDrafts.find((item) => item.id === draftId && item.requestedByEmail === identity.email);
    if (!draft) {
      jsonResponse(response, 404, { error: "Draft not found." });
      return;
    }
    const entry = {
      id: `aigf_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      draftId,
      featureId: draft.featureId,
      rating,
      comment: String(body.comment || "").trim().slice(0, 500),
      userEmail: identity.email,
      createdAt: new Date().toISOString(),
    };
    draft.feedback = { rating, comment: entry.comment, at: entry.createdAt };
    store.aiGuideFeedback.unshift(entry);
    store.aiGuideFeedback = store.aiGuideFeedback.slice(0, 2000);
    await writeStoreAsync(store);
    jsonResponse(response, 200, { ok: true, feedback: entry });
  }

  async function handleAdminOverview(request, response) {
    if (!requireGuideEnv(response)) return;
    if (!(await requireAdmin(request, response))) return;
    const store = ensureAiGuideCollections(readStore());
    const usage = store.aiGuideUsage.slice(0, 200);
    const feedback = store.aiGuideFeedback.slice(0, 100);
    const okCount = usage.filter((row) => row.ok).length;
    jsonResponse(response, 200, {
      ok: true,
      settings: store.aiGuideSettings,
      totals: {
        generations: okCount,
        failures: usage.filter((row) => row.ok === false).length,
        drafts: store.aiGuideDrafts.filter((d) => !d.deletedAt).length,
        feedback: feedback.length,
      },
      recentUsage: usage.map((row) => ({
        featureId: row.featureId,
        category: row.category,
        ok: row.ok,
        localFallback: row.localFallback,
        latencyMs: row.latencyMs,
        revision: row.revision || "",
        day: row.day,
        createdAt: row.createdAt,
      })),
      recentFeedback: feedback.map((row) => ({
        featureId: row.featureId,
        rating: row.rating,
        createdAt: row.createdAt,
        // comments only if short and non-sensitive; still omit email in list
        hasComment: Boolean(row.comment),
      })),
      status: aiGuideStatus(),
    });
  }

  async function handleAdminSettings(request, response) {
    if (!requireGuideEnv(response)) return;
    if (!(await requireAdmin(request, response))) return;
    const store = ensureAiGuideCollections(readStore());
    if (request.method === "GET") {
      jsonResponse(response, 200, { ok: true, settings: store.aiGuideSettings, status: aiGuideStatus() });
      return;
    }
    const body = await readJson(request);
    const next = { ...store.aiGuideSettings };
    if (typeof body.masterEnabled === "boolean") next.masterEnabled = body.masterEnabled;
    if (typeof body.emergencyKillSwitch === "boolean") next.emergencyKillSwitch = body.emergencyKillSwitch;
    if (body.dailyUserLimit != null) next.dailyUserLimit = Math.max(1, Number(body.dailyUserLimit) || next.dailyUserLimit);
    if (body.monthlyProgramLimit != null) next.monthlyProgramLimit = Math.max(1, Number(body.monthlyProgramLimit) || next.monthlyProgramLimit);
    if (body.features && typeof body.features === "object") {
      next.features = { ...next.features };
      Object.entries(body.features).forEach(([key, value]) => {
        if (!findFeature(key)) return;
        next.features[key] = { enabled: value?.enabled !== false };
      });
    }
    store.aiGuideSettings = next;
    await writeStoreAsync(store);
    jsonResponse(response, 200, { ok: true, settings: store.aiGuideSettings });
  }

  return {
    handleConfig,
    handleGenerate,
    handleRevise,
    handleListDrafts,
    handlePatchDraft,
    handleDeleteDraft,
    handleFeedback,
    handleAdminOverview,
    handleAdminSettings,
  };
}

module.exports = {
  isAiGuideEnabled,
  aiGuideStatus,
  defaultAiGuideSettings,
  ensureAiGuideCollections,
  createAiGuideHandlers,
  PHASE1_FEATURES,
  CATEGORIES,
  ROBOTIC_PHRASES,
  containsRoboticPhrases,
  WRITING_PREAMBLE,
  localFallbackDraft,
  normalizeLength,
};
