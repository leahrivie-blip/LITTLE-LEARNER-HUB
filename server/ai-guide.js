/**
 * AI Guide (testing-only) — Phases 1–3 helpers and route handlers.
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
    phase: 1,
  },
  {
    id: "activity",
    category: "Activities",
    title: "Activity idea",
    blurb: "Turn interests and materials into ready-to-run invitations.",
    backendTool: "activity",
    lengths: ["quick", "standard", "detailed"],
    phase: 1,
  },
  {
    id: "observation",
    category: "Observations",
    title: "Observation draft",
    blurb: "Turn rough notes into clear, respectful observation drafts.",
    backendTool: "observation",
    lengths: ["quick", "standard", "detailed"],
    phase: 1,
  },
  {
    id: "parentMessage",
    category: "Parent Communication",
    title: "Parent message",
    blurb: "Warm, clear family messages you review before sending.",
    backendTool: "parentMessage",
    lengths: ["quick", "standard", "detailed"],
    phase: 1,
  },
  {
    id: "incident",
    category: "Incident and Injury Documentation",
    title: "Incident narrative helper",
    blurb: "Organize facts into a careful draft — never assigns blame.",
    backendTool: "incidentReport",
    lengths: ["quick", "standard", "detailed"],
    phase: 1,
  },
  {
    id: "form",
    category: "Forms",
    title: "Form draft helper",
    blurb: "Suggest sections and fields for enrollment and program forms.",
    backendTool: "form",
    lengths: ["quick", "standard", "detailed"],
    phase: 1,
  },
]);

const PHASE2_FEATURES = Object.freeze([
  {
    id: "daily",
    category: "Daily Reports",
    title: "Daily report draft",
    blurb: "Summarize the day from facts you enter — nothing invented.",
    backendTool: "daily",
    lengths: ["quick", "standard", "detailed"],
    phase: 2,
  },
  {
    id: "behaviorNote",
    category: "Behavior and Support",
    title: "Behavior & support note",
    blurb: "Objective notes and support ideas — no labels or diagnoses.",
    backendTool: "behaviorNote",
    lengths: ["quick", "standard", "detailed"],
    phase: 2,
  },
  {
    id: "developmentSummary",
    category: "Child Development",
    title: "Development summary",
    blurb: "Summaries from observations you select — educational only.",
    backendTool: "observation",
    lengths: ["quick", "standard", "detailed"],
    phase: 2,
    needsSourceRecords: true,
  },
  {
    id: "policyHandbook",
    category: "Policies and Handbooks",
    title: "Policy / handbook draft",
    blurb: "Draft policy language labeled for review against your state.",
    backendTool: "form",
    lengths: ["quick", "standard", "detailed"],
    phase: 2,
    needsState: true,
  },
  {
    id: "enrollmentMessage",
    category: "Enrollment and Family Communication",
    title: "Enrollment message",
    blurb: "Inquiry, tour, waitlist, and welcome message drafts.",
    backendTool: "parentMessage",
    lengths: ["quick", "standard", "detailed"],
    phase: 2,
  },
  {
    id: "staffMessage",
    category: "Staff and Classroom Communication",
    title: "Staff / classroom note",
    blurb: "Announcements, agendas, and substitute notes.",
    backendTool: "parentMessage",
    lengths: ["quick", "standard", "detailed"],
    phase: 2,
  },
  {
    id: "adminWriting",
    category: "Administrative Writing",
    title: "Admin writing helper",
    blurb: "Short practical admin notes and reminders.",
    backendTool: "parentMessage",
    lengths: ["quick", "standard", "detailed"],
    phase: 2,
  },
]);

const ALL_FEATURES = Object.freeze([...PHASE1_FEATURES, ...PHASE2_FEATURES]);

const CATEGORIES = Object.freeze([
  { id: "lesson-planning", label: "Lesson Planning", blurb: "Draft play-based days and weeks that match your room.", featureIds: ["lesson"], phase: 1 },
  { id: "activities", label: "Activities", blurb: "Turn interests and materials into ready-to-run invitations.", featureIds: ["activity"], phase: 1 },
  { id: "observations", label: "Observations", blurb: "Turn rough notes into clear, respectful observation drafts.", featureIds: ["observation"], phase: 1 },
  { id: "daily-reports", label: "Daily Reports", blurb: "Summarize the day from facts you enter — nothing invented.", featureIds: ["daily"], phase: 2 },
  { id: "parent-communication", label: "Parent Communication", blurb: "Warm, clear family messages you review before sending.", featureIds: ["parentMessage"], phase: 1 },
  { id: "incident", label: "Incident and Injury Documentation", blurb: "Organize facts into a careful draft — never assigns blame.", featureIds: ["incident"], phase: 1 },
  { id: "behavior", label: "Behavior and Support", blurb: "Objective notes and support ideas — no labels or diagnoses.", featureIds: ["behaviorNote"], phase: 2 },
  { id: "development", label: "Child Development", blurb: "Summaries from observations you select — educational only.", featureIds: ["developmentSummary"], phase: 2 },
  { id: "forms", label: "Forms", blurb: "Suggest sections and fields for enrollment and program forms.", featureIds: ["form"], phase: 1 },
  { id: "policies", label: "Policies and Handbooks", blurb: "Draft policy language labeled for review against your state.", featureIds: ["policyHandbook"], phase: 2 },
  { id: "staff", label: "Staff and Classroom Communication", blurb: "Announcements, agendas, and substitute notes.", featureIds: ["staffMessage"], phase: 2 },
  { id: "enrollment", label: "Enrollment and Family Communication", blurb: "Inquiry, tour, waitlist, and welcome message drafts.", featureIds: ["enrollmentMessage"], phase: 2 },
  { id: "admin-writing", label: "Administrative Writing", blurb: "Short practical admin notes and reminders.", featureIds: ["adminWriting"], phase: 2 },
  { id: "ask-program", label: "Ask About My Program", blurb: "Read-only answers from records you authorize — never changes anything.", featureIds: ["askProgram"], phase: 3, askMode: true },
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
  daily: `${WRITING_PREAMBLE}

Draft a daily report using ONLY facts the provider entered.
Do not invent meals, naps, moods, diapers, outdoor time, or activities that were not provided.
Leave clear blanks or missing-information prompts for anything not entered.
Keep the tone warm and family-friendly. This is a draft for review — never auto-send.`,
  behaviorNote: `${WRITING_PREAMBLE}

Draft an objective behavior and support note from provider facts.
Describe what happened and what the teacher did to support the child.
Do not use labels like aggressive, manipulative, bad, or defiant. Do not diagnose.
Do not recommend punishment, restraint, or exclusion. Keep it educational and supportive.
Mark any suggested next steps clearly for provider review.`,
  developmentSummary: `${WRITING_PREAMBLE}

Write an educational development summary using ONLY the selected observation source records and provider notes.
Do not invent skills, milestones, or concerns. Separate facts from light interpretation.
Do not diagnose or claim delay/giftedness. Label inferred connections as "for review."
If source records are thin, say what is known and list what still needs observation.`,
  policyHandbook: `${WRITING_PREAMBLE}

Draft handbook or policy language for a childcare program.
Always include a clear disclaimer that this is a draft for professional/legal review and is not state-approved or licensing-compliant advice.
If a US state is provided, keep language general to that state's context without inventing specific regulation numbers.
Never invent legal requirements. Prefer practical, plain-language policy sections providers can edit.`,
  enrollmentMessage: `${WRITING_PREAMBLE}

Draft an enrollment or family-inquiry message (tour reply, waitlist, welcome, or tour follow-up).
Warm and clear. Do not invent tuition, openings, or policies. Do not auto-enroll anyone.
This is a draft only — the provider reviews before sending.`,
  staffMessage: `${WRITING_PREAMBLE}

Draft a staff or classroom communication (announcement, agenda, substitute note, or reminder).
Keep it short and actionable. Do not invent schedules, ratios, or medical details.
This is a draft for the director/provider to review before sharing with staff.`,
  adminWriting: `${WRITING_PREAMBLE}

Draft a short practical administrative note or reminder for a childcare program.
Keep it clear and usable. Do not invent compliance claims, billing amounts, or legal advice.
Draft only — provider review required before use.`,
  askProgram: `${WRITING_PREAMBLE}

Answer the provider's question using ONLY the authorized source records and notes they supplied.
Be read-only: never suggest that you sent a message, changed enrollment, filed a report, or updated records.
Cite which source records you used (by title/date/type). If records are insufficient, say what is missing.
Refuse requests to mutate data, contact families, change billing, or diagnose children.`,
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

const DEMO_FIXTURES = Object.freeze([
  { id: "fix-obs-infant", featureId: "observation", label: "Infant tummy-time note", notes: "Ava (8 months) pushed up on tummy for about 2 minutes, reached for a soft rattle, then rested on her side." },
  { id: "fix-obs-toddler", featureId: "observation", label: "Toddler persistence", notes: "Maya stacked blocks; they fell; she tried again three times and made a tower of five." },
  { id: "fix-daily", featureId: "daily", label: "Preschool day facts", notes: "Outdoor 9:30–10:15. Painted with watercolors. Ate most of lunch. Nap 12:30–2:00. Happy at pickup." },
  { id: "fix-incident", featureId: "incident", label: "Playground scrape", notes: "10:15 playground. Eli tripped while running and scraped left knee. Washed and bandaged. Mom called at 10:25." },
  { id: "fix-behavior", featureId: "behaviorNote", label: "Sharing support", notes: "During block play, Jordan grabbed a block from a peer. Teacher knelt, named the feeling, offered a turn timer, and practiced asking for a turn." },
  { id: "fix-parent", featureId: "parentMessage", label: "Hard drop-off", notes: "Noah had a hard drop-off but settled after blocks and is playing with the group." },
  { id: "fix-lesson", featureId: "lesson", label: "Families week", notes: "Toddler room, families theme, play-based, outdoor morning, avoid worksheets." },
  { id: "fix-enroll", featureId: "enrollmentMessage", label: "Tour follow-up", notes: "Thanks for touring yesterday. Share next steps for applying and what to bring to orientation." },
]);

const US_STATES = Object.freeze([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

function isAiGuideEnabled() {
  if (!AI_GUIDE_ENABLED) return false;
  if (process.env.NODE_ENV === "test") return true;
  return AI_GUIDE_TESTING_ONLY;
}

function defaultAiGuideSettings() {
  const features = {};
  ALL_FEATURES.forEach((feature) => {
    features[feature.id] = { enabled: true };
  });
  features.askProgram = { enabled: true };
  return {
    masterEnabled: true,
    testingOnly: true,
    emergencyKillSwitch: false,
    dailyUserLimit: AI_DAILY_USER_LIMIT,
    monthlyProgramLimit: AI_MONTHLY_PROGRAM_LIMIT,
    maxInputChars: AI_MAX_INPUT_CHARS,
    features,
    promptTemplateVersion: "phase3-v1",
    askEnabled: true,
    insightsEnabled: true,
  };
}

function ensureAiGuideCollections(store) {
  store.aiGuideDrafts = Array.isArray(store.aiGuideDrafts) ? store.aiGuideDrafts : [];
  store.aiGuideFeedback = Array.isArray(store.aiGuideFeedback) ? store.aiGuideFeedback : [];
  store.aiGuideUsage = Array.isArray(store.aiGuideUsage) ? store.aiGuideUsage : [];
  store.aiGuideTemplates = Array.isArray(store.aiGuideTemplates) ? store.aiGuideTemplates : [];
  store.aiGuideAskLog = Array.isArray(store.aiGuideAskLog) ? store.aiGuideAskLog : [];
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
    phase: 3,
    phasesComplete: [1, 2, 3],
    features: enabled ? [...ALL_FEATURES.map((f) => f.id), "askProgram"] : [],
    envVars: ["AI_GUIDE_ENABLED", "AI_GUIDE_TESTING_ONLY"],
    note: enabled
      ? "AI Guide Phases 1–3 testing surfaces are ON. Keep off on live production."
      : "AI Guide is OFF. Set AI_GUIDE_ENABLED=true (and AI_GUIDE_TESTING_ONLY=true) only on the testing service.",
  };
}

function findFeature(featureId) {
  if (featureId === "askProgram") {
    return {
      id: "askProgram",
      category: "Ask About My Program",
      title: "Ask About My Program",
      blurb: "Read-only answers from authorized records.",
      backendTool: "observation",
      lengths: ["quick", "standard", "detailed"],
      phase: 3,
      askMode: true,
    };
  }
  return ALL_FEATURES.find((item) => item.id === featureId) || null;
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

function normalizeSourceRecords(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((item, index) => ({
    id: String(item?.id || `src_${index + 1}`).slice(0, 80),
    type: String(item?.type || "note").slice(0, 40),
    title: String(item?.title || item?.label || "Source").slice(0, 120),
    summary: String(item?.summary || item?.text || "").trim().slice(0, 800),
    date: String(item?.date || "").slice(0, 40),
  })).filter((item) => item.summary);
}

function formatSourceRecords(records) {
  if (!records.length) return "";
  return records.map((item, index) => (
    `${index + 1}. [${item.type}] ${item.title}${item.date ? ` (${item.date})` : ""}\n${item.summary}`
  )).join("\n\n");
}

function localFallbackDraft(featureId, notes, length, extras = {}) {
  const clean = String(notes || "").trim();
  const prefix = length === "quick" ? "" : "AI was unavailable, so this is a local starter draft for review.\n\n";
  const sources = Array.isArray(extras.sourceRecords) ? extras.sourceRecords : [];
  if (featureId === "observation") {
    return `${prefix}During classroom play, we noticed: ${clean || "[add what you observed]"}. We will continue offering similar experiences and watching for growth.`;
  }
  if (featureId === "parentMessage" || featureId === "enrollmentMessage") {
    return `${prefix}Hi! ${clean || "[add your update]"}\n\nThank you!`;
  }
  if (featureId === "staffMessage" || featureId === "adminWriting") {
    return `${prefix}Team note draft:\n${clean || "[add the reminder or announcement]"}\n\nPlease review before sharing.`;
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
  if (featureId === "daily") {
    return `${prefix}Daily report draft (facts only):\n${clean || "[add meals, naps, activities, mood, and outdoor time that actually happened]"}\n\nMissing information prompts:\n- What did they eat?\n- Did they nap? When?\n- Any family notes for pickup?`;
  }
  if (featureId === "behaviorNote") {
    return `${prefix}Behavior support draft:\nWhat happened: ${clean || "[describe the observable moment]"}\nTeacher support: [describe what the teacher said/did]\nNext step for review: Practice the same support strategy and note what helps.\n\nDo not label or diagnose. Review before saving to the child file.`;
  }
  if (featureId === "developmentSummary") {
    const sourceBlock = sources.length
      ? sources.map((s) => `- ${s.title}: ${s.summary}`).join("\n")
      : "- [select observation source records]";
    return `${prefix}Development summary draft (educational only):\nBased on selected records:\n${sourceBlock}\n\nProvider notes: ${clean || "[optional focus]"}\n\nFor review: which skills should we watch next? This is not a diagnosis.`;
  }
  if (featureId === "policyHandbook") {
    const state = extras.state ? ` for ${extras.state}` : "";
    return `${prefix}Policy draft${state} (not legally reviewed / not licensing-approved):\nTopic: ${clean || "[policy topic]"}\nSuggested sections: Purpose, Who it applies to, Everyday practice, Family communication, Questions.\n\nDisclaimer: Review with a qualified professional against your state requirements before publishing.`;
  }
  if (featureId === "askProgram") {
    const cites = sources.length
      ? sources.map((s) => `- ${s.type}: ${s.title}`).join("\n")
      : "- No source records were attached.";
    return `${prefix}Read-only answer draft:\nBased on the records you shared, here is what is known about: ${clean || "[your question]"}.\n\nSources used:\n${cites}\n\nI cannot change records, send messages, or update enrollment from this answer.`;
  }
  return `${prefix}${clean || "Add your notes, then regenerate."}`;
}

function buildInsights(payload = {}) {
  const children = Array.isArray(payload.children) ? payload.children : [];
  const forms = Array.isArray(payload.forms) ? payload.forms : [];
  const observations = Array.isArray(payload.observations) ? payload.observations : [];
  const suggestions = [];

  children.slice(0, 20).forEach((child) => {
    const name = String(child.name || "Child").slice(0, 60);
    const childForms = forms.filter((f) => f.childId === child.id || f.childName === name);
    const childObs = observations.filter((o) => o.childId === child.id || o.childName === name);
    if (!childForms.length) {
      suggestions.push({
        id: `insight_forms_${child.id || name}`,
        type: "missing_forms",
        title: `Forms may be missing for ${name}`,
        detail: "No form records were attached for this child in the insight request. Review enrollment and permission forms.",
        childName: name,
      });
    }
    if (!childObs.length) {
      suggestions.push({
        id: `insight_obs_${child.id || name}`,
        type: "missing_observations",
        title: `No recent observations listed for ${name}`,
        detail: "Consider adding a short observation this week if the child was in care.",
        childName: name,
      });
    }
  });

  if (!suggestions.length) {
    suggestions.push({
      id: "insight_ok",
      type: "ok",
      title: "No obvious gaps from the records you shared",
      detail: "Attach child, form, and observation summaries for more specific documentation insights. AI never changes records from this view.",
    });
  }

  return suggestions.slice(0, 25);
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
    state: draft.state || "",
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
    sourceRecords: Array.isArray(draft.sourceRecords) ? draft.sourceRecords : [],
    citations: Array.isArray(draft.citations) ? draft.citations : [],
    sourceLabel: draft.sourceLabel || "AI Guide",
    askMode: Boolean(draft.askMode),
  };
}

function publicTemplate(template) {
  if (!template) return null;
  return {
    id: template.id,
    featureId: template.featureId,
    title: template.title || "",
    notes: template.notes || "",
    length: template.length || "standard",
    tone: template.tone || "",
    ageGroup: template.ageGroup || "",
    state: template.state || "",
    createdAt: template.createdAt || "",
    updatedAt: template.updatedAt || "",
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

  function scrubRobotic(output) {
    return String(output || "")
      .replace(/^it is important to note that\s+/i, "")
      .replace(/\bfurthermore,\s*/gi, "")
      .replace(/\bmoreover,\s*/gi, "")
      .trim();
  }

  function collectMissingPrompts(featureId, notes, output, extras = {}) {
    const missingInfoPrompts = [];
    const lower = `${notes}\n${output}`.toLowerCase();
    if (featureId === "incident") {
      if (!/\b\d{1,2}:\d{2}|\b\d{1,2}\s*(am|pm)\b|\btime\b/.test(lower)) missingInfoPrompts.push("What time did this happen?");
      if (!/wash|bandage|ice|cleaned|care|first aid/.test(lower)) missingInfoPrompts.push("What care was provided?");
      if (!/call|called|notified|text|emailed|parent|family/.test(lower)) missingInfoPrompts.push("Was the family notified?");
    }
    if (featureId === "daily") {
      if (!/eat|lunch|breakfast|snack|meal/.test(lower)) missingInfoPrompts.push("What did they eat?");
      if (!/nap|sleep|rest/.test(lower)) missingInfoPrompts.push("Did they nap? When?");
    }
    if (featureId === "policyHandbook" && !extras.state) {
      missingInfoPrompts.push("Which US state should this policy draft consider?");
    }
    if (featureId === "developmentSummary" && !(extras.sourceRecords || []).length) {
      missingInfoPrompts.push("Which observation records should this summary use?");
    }
    return missingInfoPrompts;
  }

  async function handleConfig(request, response) {
    if (!requireGuide(response)) return;
    const store = ensureAiGuideCollections(readStore());
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const usage = usageAllowed(store, identity.email);
    const templates = store.aiGuideTemplates
      .filter((item) => item.ownerEmail === identity.email && !item.deletedAt)
      .slice(0, 40)
      .map(publicTemplate);
    jsonResponse(response, 200, {
      ok: true,
      status: aiGuideStatus(),
      categories: CATEGORIES,
      features: ALL_FEATURES.map((feature) => ({
        ...feature,
        enabled: store.aiGuideSettings.features?.[feature.id]?.enabled !== false,
      })),
      askEnabled: store.aiGuideSettings.askEnabled !== false && store.aiGuideSettings.features?.askProgram?.enabled !== false,
      insightsEnabled: store.aiGuideSettings.insightsEnabled !== false,
      states: US_STATES,
      demoFixtures: DEMO_FIXTURES,
      templates,
      defaults: { length: "standard" },
      limits: {
        dailyUserLimit: store.aiGuideSettings.dailyUserLimit,
        monthlyProgramLimit: store.aiGuideSettings.monthlyProgramLimit,
        maxInputChars: store.aiGuideSettings.maxInputChars,
        dailyUsed: usage.daily || 0,
        monthlyUsed: usage.monthly || 0,
      },
      reviewBanner: "AI-generated draft. Review for accuracy before saving, sharing, signing, or using.",
      canAutoSend: false,
      canAutoPublish: false,
    });
  }

  async function runGeneration({ identity, store, feature, body }) {
    const notes = String(body.notes || body.prompt || body.question || "").trim().slice(0, Number(store.aiGuideSettings.maxInputChars || AI_MAX_INPUT_CHARS));
    if (!notes) {
      return { errorStatus: 400, error: "Add a short description or notes first." };
    }
    const length = normalizeLength(body.length);
    const childName = String(body.childName || "").trim().slice(0, 80);
    const ageGroup = String(body.ageGroup || body.age || "").trim().slice(0, 40);
    const context = String(body.context || "").trim().slice(0, 500);
    const tone = String(body.tone || "").trim().slice(0, 40);
    const state = String(body.state || "").trim().toUpperCase().slice(0, 2);
    const sourceRecords = normalizeSourceRecords(body.sourceRecords);
    if (feature.needsState && state && !US_STATES.includes(state)) {
      return { errorStatus: 400, error: "Choose a valid US state abbreviation for policy drafts." };
    }
    const start = Date.now();
    let output = "";
    let localFallback = false;
    let model = AI_GUIDE_MODEL || "local-fallback";
    const userPrompt = [
      lengthInstruction(length),
      childName ? `Child (optional): ${childName}` : "",
      ageGroup ? `Age group: ${ageGroup}` : "",
      tone ? `Tone: ${tone}` : "",
      state ? `State context (draft only, not legal advice): ${state}` : "",
      context ? `Extra context: ${context}` : "",
      sourceRecords.length ? `Authorized source records (use only these; cite them):\n${formatSourceRecords(sourceRecords)}` : "",
      feature.askMode ? `Provider question:\n${notes}` : `Provider notes:\n${notes}`,
      feature.askMode
        ? "Return a read-only answer with a Sources used list. Do not claim you changed any records."
        : "Return only the draft the provider can copy and edit. No preamble about being an AI.",
    ].filter(Boolean).join("\n\n");

    try {
      const aiResult = await generateOpenAiContent({
        tool: feature.backendTool || "observation",
        prompt: `${FEATURE_PROMPTS[feature.id] || WRITING_PREAMBLE}\n\n${userPrompt}`,
        age: ageGroup,
        email: identity.email,
      });
      output = String(aiResult.output || "").trim();
      model = aiResult.model || model;
    } catch (_error) {
      localFallback = true;
      output = localFallbackDraft(feature.id, notes, length, { state, sourceRecords });
    }

    if (containsRoboticPhrases(output).length && !localFallback) {
      output = scrubRobotic(output);
    }

    const missingInfoPrompts = collectMissingPrompts(feature.id, notes, output, { state, sourceRecords });
    const citations = sourceRecords.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      date: item.date,
    }));

    const draft = {
      id: `aig_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      featureId: feature.id,
      category: feature.category,
      title: feature.title,
      childName,
      ageGroup,
      state: feature.needsState ? state : "",
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
      sourceRecords,
      citations,
      askMode: Boolean(feature.askMode),
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
      askMode: Boolean(feature.askMode),
    });
    store.aiGuideUsage = store.aiGuideUsage.slice(0, 5000);
    await writeStoreAsync(store);
    return { draft };
  }

  async function handleGenerate(request, response) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const body = await readJson(request);
    const feature = findFeature(String(body.featureId || "").trim());
    if (!feature || feature.askMode) {
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
    const result = await runGeneration({ identity, store, feature, body });
    if (result.errorStatus) {
      jsonResponse(response, result.errorStatus, { error: result.error });
      return;
    }
    jsonResponse(response, 200, {
      ok: true,
      draft: publicDraft(result.draft),
      reviewBanner: "AI-generated draft. Review for accuracy before saving, sharing, signing, or using.",
      canAutoSend: false,
      canAutoPublish: false,
    });
  }

  async function handleAsk(request, response) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const store = ensureAiGuideCollections(readStore());
    if (store.aiGuideSettings.askEnabled === false || store.aiGuideSettings.features?.askProgram?.enabled === false) {
      jsonResponse(response, 503, { error: "Ask About My Program is turned off." });
      return;
    }
    const gate = usageAllowed(store, identity.email);
    if (!gate.allowed) {
      jsonResponse(response, 429, { error: gate.reason, code: "ai_guide_limit" });
      return;
    }
    const body = await readJson(request);
    const feature = findFeature("askProgram");
    const result = await runGeneration({
      identity,
      store,
      feature,
      body: { ...body, notes: body.question || body.notes, featureId: "askProgram" },
    });
    if (result.errorStatus) {
      jsonResponse(response, result.errorStatus, { error: result.error });
      return;
    }
    store.aiGuideAskLog.unshift({
      id: `ask_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      email: identity.email,
      draftId: result.draft.id,
      question: String(body.question || body.notes || "").slice(0, 240),
      sourceCount: (result.draft.sourceRecords || []).length,
      createdAt: new Date().toISOString(),
      mutated: false,
    });
    store.aiGuideAskLog = store.aiGuideAskLog.slice(0, 1000);
    await writeStoreAsync(store);
    jsonResponse(response, 200, {
      ok: true,
      draft: publicDraft(result.draft),
      readOnly: true,
      canMutate: false,
      canAutoSend: false,
      canAutoPublish: false,
      reviewBanner: "Read-only AI answer. Review sources before using. Nothing was changed.",
    });
  }

  async function handleInsights(request, response) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const store = ensureAiGuideCollections(readStore());
    if (store.aiGuideSettings.insightsEnabled === false) {
      jsonResponse(response, 503, { error: "Documentation insights are turned off." });
      return;
    }
    const body = await readJson(request);
    const insights = buildInsights(body || {});
    jsonResponse(response, 200, {
      ok: true,
      insights,
      canMutate: false,
      note: "Insights are suggestions only. AI Guide never files forms or changes records.",
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

  async function handleListTemplates(request, response) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const store = ensureAiGuideCollections(readStore());
    const templates = store.aiGuideTemplates
      .filter((item) => item.ownerEmail === identity.email && !item.deletedAt)
      .slice(0, 40)
      .map(publicTemplate);
    jsonResponse(response, 200, { ok: true, templates });
  }

  async function handleSaveTemplate(request, response) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const body = await readJson(request);
    const feature = findFeature(String(body.featureId || "").trim());
    if (!feature || feature.askMode) {
      jsonResponse(response, 400, { error: "Choose a feature to save as a template." });
      return;
    }
    const notes = String(body.notes || "").trim().slice(0, AI_MAX_INPUT_CHARS);
    if (!notes) {
      jsonResponse(response, 400, { error: "Add notes before saving a template." });
      return;
    }
    const store = ensureAiGuideCollections(readStore());
    const now = new Date().toISOString();
    const template = {
      id: `aigt_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ownerEmail: identity.email,
      featureId: feature.id,
      title: String(body.title || feature.title).trim().slice(0, 80) || feature.title,
      notes,
      length: normalizeLength(body.length),
      tone: String(body.tone || "").trim().slice(0, 40),
      ageGroup: String(body.ageGroup || "").trim().slice(0, 40),
      state: String(body.state || "").trim().toUpperCase().slice(0, 2),
      createdAt: now,
      updatedAt: now,
    };
    store.aiGuideTemplates.unshift(template);
    store.aiGuideTemplates = store.aiGuideTemplates.slice(0, 200);
    await writeStoreAsync(store);
    jsonResponse(response, 200, { ok: true, template: publicTemplate(template) });
  }

  async function handleDeleteTemplate(request, response, templateId) {
    if (!requireGuide(response)) return;
    const identity = await identityOr401(request, response);
    if (!identity) return;
    const store = ensureAiGuideCollections(readStore());
    const template = store.aiGuideTemplates.find((item) => item.id === templateId && item.ownerEmail === identity.email);
    if (!template) {
      jsonResponse(response, 404, { error: "Template not found." });
      return;
    }
    template.deletedAt = new Date().toISOString();
    await writeStoreAsync(store);
    jsonResponse(response, 200, { ok: true });
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
        templates: store.aiGuideTemplates.filter((t) => !t.deletedAt).length,
        askQueries: store.aiGuideAskLog.length,
      },
      recentUsage: usage.map((row) => ({
        featureId: row.featureId,
        category: row.category,
        ok: row.ok,
        localFallback: row.localFallback,
        latencyMs: row.latencyMs,
        revision: row.revision || "",
        askMode: Boolean(row.askMode),
        day: row.day,
        createdAt: row.createdAt,
      })),
      recentFeedback: feedback.map((row) => ({
        featureId: row.featureId,
        rating: row.rating,
        createdAt: row.createdAt,
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
    if (typeof body.askEnabled === "boolean") next.askEnabled = body.askEnabled;
    if (typeof body.insightsEnabled === "boolean") next.insightsEnabled = body.insightsEnabled;
    if (body.dailyUserLimit != null) next.dailyUserLimit = Math.max(1, Number(body.dailyUserLimit) || next.dailyUserLimit);
    if (body.monthlyProgramLimit != null) next.monthlyProgramLimit = Math.max(1, Number(body.monthlyProgramLimit) || next.monthlyProgramLimit);
    if (body.features && typeof body.features === "object") {
      next.features = { ...next.features };
      Object.entries(body.features).forEach(([key, value]) => {
        if (!findFeature(key) && key !== "askProgram") return;
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
    handleAsk,
    handleInsights,
    handleRevise,
    handleListDrafts,
    handlePatchDraft,
    handleDeleteDraft,
    handleFeedback,
    handleListTemplates,
    handleSaveTemplate,
    handleDeleteTemplate,
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
  PHASE2_FEATURES,
  ALL_FEATURES,
  CATEGORIES,
  ROBOTIC_PHRASES,
  containsRoboticPhrases,
  WRITING_PREAMBLE,
  localFallbackDraft,
  normalizeLength,
  buildInsights,
  DEMO_FIXTURES,
};
