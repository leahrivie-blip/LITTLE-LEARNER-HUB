/**
 * Classroom Assistant foundation.
 * Fake/testing only. Local deterministic parsing only; no live AI or outbound services.
 */

const crypto = require("node:crypto");

const TESTING_BANNER = "Testing Account - Fake Data Only. Not production operations.";
const FEATURE_MARKER = "phase-ca-classroom-assistant";
const PHONE_MARKER = "phase-ca-classroom-assistant-mobile";

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayDate(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  return date.toISOString().slice(0, 10);
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

const STORE_MAP_KEYS = [
  "parsedPlans",
  "mealLogs",
  "activityLogs",
  "observations",
  "dailySummaries",
  "diaperLogs",
  "pottyLogs",
  "medicationLogs",
  "attendanceNotes",
  "communicationDrafts",
  "lessonPlanDrafts",
  "suggestionActions",
  "offlineSynced",
];

const INCLUDED_CAPABILITIES = Object.freeze([
  "group_meals",
  "group_activities",
  "naps",
  "diaper_changes",
  "potty_logs",
  "medication_logs",
  "attendance",
  "daily_summaries",
  "checked_in_awareness",
  "individual_exceptions",
  "professional_parent_messages",
  "incident_reports",
  "behavior_reports",
  "observations",
  "developmental_notes",
  "documentation",
  "difficult_family_wording",
  "preview_before_save",
  "admin_lesson_curriculum",
  "smart_suggestions",
  "offline_sync",
]);

function ensureClassroomAssistantStore(store) {
  if (!store || typeof store !== "object") throw new Error("store required");
  if (!store.classroomAssistant || typeof store.classroomAssistant !== "object") {
    store.classroomAssistant = {
      parsedPlans: {},
      mealLogs: {},
      activityLogs: {},
      observations: {},
      dailySummaries: {},
      diaperLogs: {},
      pottyLogs: {},
      medicationLogs: {},
      attendanceNotes: {},
      communicationDrafts: {},
      lessonPlanDrafts: {},
      suggestionActions: {},
      offlineSynced: {},
      history: [],
      meta: {
        createdAt: nowIso(),
        fakeDataOnly: true,
        liveAiUsed: false,
        featureMarker: FEATURE_MARKER,
        offlineCapable: true,
      },
    };
  }
  const ca = store.classroomAssistant;
  for (const key of STORE_MAP_KEYS) {
    if (!ca[key] || typeof ca[key] !== "object") ca[key] = {};
  }
  if (!Array.isArray(ca.history)) ca.history = [];
  if (!ca.meta || typeof ca.meta !== "object") ca.meta = {};
  ca.meta.fakeDataOnly = true;
  ca.meta.liveAiUsed = false;
  ca.meta.featureMarker = FEATURE_MARKER;
  ca.meta.offlineCapable = true;
  ca.meta.includedCapabilities = [...INCLUDED_CAPABILITIES];
  ca.meta.updatedAt = nowIso();
  return ca;
}

function childDisplayName(child) {
  return cleanText(child?.displayName || child?.name || [child?.firstName, child?.lastName].filter(Boolean).join(" ") || child?.firstName || child?.id || "", 120);
}

function childrenForOrg(store, organizationId) {
  const byId = {};
  for (const source of [store.previewChildren, store.children, store.childRecords]) {
    for (const child of listValues(source)) {
      if (!child || child.organizationId !== organizationId || !child.id) continue;
      byId[child.id] = { ...(byId[child.id] || {}), ...child, displayName: childDisplayName(child) };
    }
  }
  return Object.values(byId);
}

function getCheckedInChildren(store, organizationId, { date } = {}) {
  const targetDate = cleanText(date || todayDate(), 40);
  const childMap = new Map(childrenForOrg(store, organizationId).map((child) => [child.id, child]));
  return listValues(store.todayHub?.attendance)
    .filter((row) => (
      row
      && row.organizationId === organizationId
      && row.date === targetDate
      && row.status === "checked_in"
      && row.childId
    ))
    .map((row) => {
      const child = childMap.get(row.childId) || { id: row.childId, organizationId, displayName: row.childName || row.childId };
      return {
        id: row.childId,
        childId: row.childId,
        organizationId,
        displayName: childDisplayName(child),
        firstName: cleanText(child.firstName || childDisplayName(child).split(/\s+/)[0] || "", 80),
        classroomId: row.classroomId || child.classroomId || "",
        attendanceId: row.id,
        status: row.status,
      };
    });
}

function wordsForName(name) {
  return cleanText(name, 120).toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
}

function normalizeChild(child) {
  const displayName = childDisplayName(child);
  const firstName = cleanText(child.firstName || displayName.split(/\s+/)[0] || "", 80);
  return {
    ...child,
    id: child.id || child.childId,
    childId: child.id || child.childId,
    displayName,
    firstName,
    aliases: [...new Set([displayName, firstName, child.name].filter(Boolean).map((value) => cleanText(value, 120).toLowerCase()))],
  };
}

function nameRegex(alias) {
  return new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
}

function findNamedChildren(text, children) {
  const normalizedText = String(text || "");
  return children.filter((child) => child.aliases.some((alias) => alias && nameRegex(alias).test(normalizedText)));
}

function findChildByName(name, children) {
  const wanted = cleanText(name, 120).toLowerCase();
  if (!wanted) return null;
  return children.find((child) => child.aliases.includes(wanted))
    || children.find((child) => child.aliases.some((alias) => alias && wanted.startsWith(alias)))
    || null;
}

function extractTime(text) {
  const match = String(text || "").match(/\b(?:at|around|about)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i)
    || String(text || "").match(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\b/i);
  if (!match) return "";
  const hour = match[1];
  const min = match[2] || "00";
  const suffix = match[3] ? ` ${match[3].replace(/\./g, "").toLowerCase()}` : "";
  return `${hour}:${min}${suffix}`;
}

function splitList(text) {
  return cleanText(text, 300)
    .replace(/\band\b/gi, ",")
    .split(/[,;]/)
    .map((item) => cleanText(item.replace(/^(had|ate|with)\s+/i, ""), 80).toLowerCase())
    .filter(Boolean);
}

function extractFoods(text) {
  const source = String(text || "");
  const foodAfterHad = source.match(/\b(?:everyone|all of the children|the children)\s+(?:had|ate)\s+(.+?)(?:\.|$| except\b)/i);
  const mealFood = source.match(/\bhad\s+(.+?)\s+for\s+(breakfast|lunch|snack|dinner)\b/i)
    || source.match(/\b(pizza|bananas?|apples?|milk|crackers?|yogurt|sandwich(?:es)?|pasta|rice|cereal)\s+for\s+(breakfast|lunch|snack|dinner)\b/i);
  const raw = foodAfterHad?.[1] || mealFood?.[1] || "";
  const foods = splitList(raw.replace(/\b(his|her|their|breakfast|lunch|snack|dinner)\b/gi, ""));
  if (!foods.length && /\bpizza\b/i.test(source)) foods.push("pizza");
  return [...new Set(foods)].slice(0, 12);
}

function extractMealType(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("breakfast")) return "breakfast";
  if (lower.includes("lunch")) return "lunch";
  if (lower.includes("snack")) return "snack";
  if (lower.includes("dinner")) return "dinner";
  if (/\bmilk|bananas?|apples?|pizza|ate|food|meal\b/i.test(lower)) return "meal";
  return "";
}

function buildDailySummary({ text, meal, activity, nap, diaper, potty, medication, attendance }) {
  const note = cleanText(text, 1200);
  const dailyReport = [];
  const meals = [];
  const activities = [];
  const observations = [];
  const parentReport = [];
  const documentation = [];
  const timeline = [];
  if (meal) {
    meals.push(`${meal.mealType || "Meal"}${meal.time ? ` at ${meal.time}` : ""}: ${(meal.foods || []).join(", ") || "food served"}.`);
    timeline.push({ type: "meal", label: meal.mealType || "meal", time: meal.time || "" });
  }
  if (activity) {
    activities.push(activity.title || "Classroom activity");
    timeline.push({ type: "activity", label: activity.title || "activity", time: activity.time || "" });
    for (const item of [...(activity.highlights || []), ...(activity.exceptions || [])]) {
      if (item.observation) observations.push(`${item.childName}: ${item.note}`);
    }
  }
  if (nap) {
    dailyReport.push(nap.groupSlept === false ? "Nap/rest was noted with exceptions." : "Nap/rest was recorded.");
    timeline.push({ type: "nap", label: "Nap/rest", time: nap.time || "" });
  }
  if (diaper) {
    dailyReport.push(`Diaper care logged${diaper.time ? ` at ${diaper.time}` : ""}.`);
    timeline.push({ type: "diaper", label: diaper.status || "diaper", time: diaper.time || "" });
  }
  if (potty) {
    dailyReport.push(`Potty learning logged${potty.time ? ` at ${potty.time}` : ""}.`);
    timeline.push({ type: "potty", label: potty.result || "potty", time: potty.time || "" });
  }
  if (medication) {
    documentation.push(`Medication log preview: ${medication.medicationName || "medication"} (review required).`);
    timeline.push({ type: "medication", label: medication.medicationName || "medication", time: medication.time || "" });
  }
  if (attendance) {
    dailyReport.push(attendance.summary || "Attendance note recorded.");
    timeline.push({ type: "attendance", label: attendance.action || "attendance", time: attendance.time || "" });
  }
  if (note) {
    dailyReport.push(note);
    parentReport.push(note);
    documentation.push("Review this classroom note before sharing or filing.");
  }
  return { dailyReport, activities, meals, observations, parentReport, documentation, timeline };
}

function suggestionSet({ meal, activity, nap, diaper, potty, medication, attendance, difficult }) {
  const ranked = [
    { type: "parent_message", label: "Parent message", oneClick: true, always: true },
    { type: "daily_report", label: "Daily report", oneClick: true, always: true },
    { type: "observation", label: "Observation", oneClick: true, always: true },
    { type: "documentation", label: "Documentation", oneClick: true, always: true },
    { type: "developmental_note", label: "Developmental note", oneClick: true, always: true },
    { type: "behavior_report", label: "Behavior note", oneClick: true, always: Boolean(difficult) || Boolean(activity?.exceptions?.length) },
    { type: "incident_report", label: "Incident report", oneClick: true, always: Boolean(difficult) },
    { type: "portfolio", label: "Portfolio entry", oneClick: true, always: Boolean(activity) },
  ];
  if (meal) ranked.push({ type: "documentation", label: "Meal documentation", oneClick: true, always: false });
  if (nap) ranked.push({ type: "milestone", label: "Rest routine note", oneClick: true, always: false });
  if (diaper || potty) ranked.push({ type: "developmental_note", label: "Care / potty note", oneClick: true, always: false });
  if (medication) ranked.push({ type: "documentation", label: "Medication documentation", oneClick: true, always: false });
  if (attendance) ranked.push({ type: "daily_report", label: "Attendance summary", oneClick: true, always: false });
  if (difficult) ranked.push({ type: "parent_message", label: "Difficult conversation wording", oneClick: true, always: false });

  const seen = new Set();
  const out = [];
  for (const row of ranked) {
    if (seen.has(row.type)) continue;
    seen.add(row.type);
    out.push({
      type: row.type,
      label: row.label,
      oneClick: true,
      recommended: row.always === true || Boolean(difficult && (row.type === "incident_report" || row.type === "behavior_report" || row.type === "parent_message")),
    });
  }
  // Always offer the core family/communication set after every entry.
  for (const core of [
    ["parent_message", "Parent message"],
    ["incident_report", "Incident report"],
    ["observation", "Observation"],
    ["behavior_report", "Behavior note"],
    ["developmental_note", "Developmental note"],
    ["daily_report", "Daily report"],
    ["documentation", "Documentation"],
  ]) {
    if (seen.has(core[0])) continue;
    seen.add(core[0]);
    out.push({ type: core[0], label: core[1], oneClick: true, recommended: false });
  }
  return out;
}

const EXAMPLE_PROMPTS = Object.freeze([
  {
    id: "meal",
    label: "Group meal",
    text: "Breakfast was at 8:30. Everyone had bananas, apples, and milk. Timmy decided not to eat his breakfast.",
  },
  {
    id: "activity",
    label: "Activity highlight",
    text: "Today we went on a walk and looked for butterflies. Everyone loved it. Susan was especially excited and pointed them out to all her friends.",
  },
  {
    id: "nap",
    label: "Nap exception",
    text: "Everyone had a great nap except Ava, who slept for only 20 minutes.",
  },
  {
    id: "summary",
    label: "Daily summary",
    text: "Today we painted, played outside, and had pizza for lunch. Everyone enjoyed painting except Jack, who preferred reading books.",
  },
  {
    id: "care",
    label: "Care logs",
    text: "Changed Timmy's diaper at 10:15. Wet. Ava used the potty successfully at 10:40.",
  },
  {
    id: "difficult",
    label: "Hard conversation",
    text: "Timmy bit a friend today during block play and was upset afterward. We stayed calm, separated the children, and comforted both.",
  },
]);

function detectDifficultSituation(text) {
  const source = String(text || "");
  const lower = source.toLowerCase();
  const kinds = [];
  if (/\b(bit|bite|bitten|hit|hitting|pushed|pushing|kicked|scratch|fought|fight)\b/i.test(source)) kinds.push("peer_conflict");
  if (/\b(upset|cried|crying|tantrum|meltdown|anxious|afraid|scared|refused|wouldn't)\b/i.test(source)) kinds.push("emotional_support");
  if (/\b(accident|fell|fall|bump|bruise|injury|injured|bleed|blood|incident)\b/i.test(source)) kinds.push("incident_care");
  if (/\b(behavior|redirect|limits|sharing|took a turn)\b/i.test(source)) kinds.push("guidance");
  if (!kinds.length) return null;
  return {
    detected: true,
    kinds,
    needsSensitiveWording: true,
    guidance: "Use calm, factual, non-blaming language. Focus on care provided and partnership with families.",
  };
}

function childFirst(name) {
  return cleanText(String(name || "").split(/\s+/)[0] || name || "your child", 80);
}

function buildProfessionalDrafts(plan, { children = [] } = {}) {
  const note = cleanText(plan?.sourceText || "", 1200);
  const named = findNamedChildren(note, (children || []).map(normalizeChild));
  const focus = named[0] || null;
  const focusName = focus ? childFirst(focus.displayName) : "your child";
  const mealBit = plan?.meal
    ? `${plan.meal.mealType || "Meal"}${plan.meal.time ? ` around ${plan.meal.time}` : ""}${(plan.meal.foods || []).length ? ` with ${(plan.meal.foods || []).join(", ")}` : ""}.`
    : "";
  const activityBit = plan?.activity ? `We spent time with ${plan.activity.title || "classroom activities"}.` : "";
  const napBit = plan?.nap?.exceptions?.[0]
    ? `${childFirst(plan.nap.exceptions[0].childName)} rested for about ${plan.nap.exceptions[0].durationMinutes} minutes.`
    : plan?.nap
      ? "Rest time went well overall."
      : "";
  const drafts = {
    parent_message: {
      type: "parent_message",
      title: "Parent message",
      tone: "warm_professional",
      body: cleanText([
        `Hello — a quick update from our classroom today.`,
        activityBit,
        mealBit,
        napBit,
        focus ? `We wanted to share a note about ${focusName}.` : "",
        "Please let us know if you have any questions. Thank you for partnering with us.",
      ].filter(Boolean).join(" "), 1200),
    },
    daily_report: {
      type: "daily_report",
      title: "Daily report summary",
      tone: "factual",
      body: cleanText((plan?.dailySummary?.dailyReport || [note]).join(" "), 1200),
    },
    observation: {
      type: "observation",
      title: "Observation",
      tone: "developmental",
      body: cleanText(
        plan?.activity?.highlights?.[0]?.note
          || plan?.activity?.exceptions?.[0]?.note
          || `Observation from classroom note: ${note}`,
        1200,
      ),
    },
    developmental_note: {
      type: "developmental_note",
      title: "Developmental note",
      tone: "supportive",
      body: cleanText([
        focus ? `${focusName} showed growth opportunities during today's routines.` : "Developmental note from today's classroom routines.",
        plan?.potty ? `Potty learning: ${plan.potty.result || "attempt noted"}.` : "",
        plan?.activity?.highlights?.[0]?.note || "",
        "We will continue offering practice and encouragement.",
      ].filter(Boolean).join(" "), 1200),
    },
    documentation: {
      type: "documentation",
      title: "Documentation entry",
      tone: "record",
      body: cleanText(`Classroom Assistant documentation preview: ${note}`, 1200),
    },
    incident_report: {
      type: "incident_report",
      title: "Incident report wording",
      tone: "calm_factual",
      body: cleanText([
        "Incident report draft (review required):",
        `What happened: ${note}`,
        "Immediate care/response: Staff stayed with the child, provided comfort/first aid as needed, and supervised the group.",
        "Follow-up: Family will be informed with facts only. No blame language used.",
      ].join(" "), 1400),
    },
    behavior_report: {
      type: "behavior_report",
      title: "Behavior note for families",
      tone: "partnership",
      body: cleanText([
        `Behavior partnership note about ${focusName}:`,
        `Today we noticed: ${note}`,
        "How we supported: We used calm redirection, offered choices, and stayed nearby.",
        "How families can help: Consistent language at home and celebrating small successes together.",
      ].join(" "), 1400),
    },
  };
  if (plan?.difficultSituation) {
    drafts.difficult_family_wording = {
      type: "difficult_family_wording",
      title: "Help with difficult family wording",
      tone: "empathetic_clear",
      body: cleanText([
        `Hello — I wanted to share something from today involving ${focusName} with care and clarity.`,
        `In our own words: ${note}`,
        "We stayed calm, kept everyone safe, and supported the children involved.",
        "We value our partnership and are happy to talk through what we saw and how we can support together.",
      ].join(" "), 1400),
      kinds: plan.difficultSituation.kinds || [],
    };
  }
  return drafts;
}

function parseMeal(text, children) {
  const mealType = extractMealType(text);
  if (!mealType) return null;
  const exceptions = [];
  const exceptionPatterns = [
    /\b([A-Z][a-z]+)\s+(?:decided\s+not\s+to|did\s+not|didn't|would\s+not|wouldn't|refused|declined|chose\s+not\s+to)\s+(?:eat|have|want)([^.]*)/g,
    /\bexcept\s+([A-Z][a-z]+)(?:,\s*who)?\s+(?:did\s+not|didn't|would\s+not|wouldn't|refused|declined|chose\s+not\s+to)\s+(?:eat|have|want)([^.]*)/g,
  ];
  for (const pattern of exceptionPatterns) {
    for (const match of String(text || "").matchAll(pattern)) {
      const child = findChildByName(match[1], children);
      if (!child || exceptions.some((row) => row.childId === child.id)) continue;
      exceptions.push({
        childId: child.id,
        childName: child.displayName,
        ate: false,
        note: cleanText(`${child.firstName || child.displayName} ${match[0].replace(new RegExp(`^${match[1]}\\s*`, "i"), "")}`, 240),
      });
    }
  }
  const groupAte = /\b(everyone|all|all children)\b.+\b(had|ate|enjoyed)\b/i.test(text) || exceptions.length > 0;
  return {
    mealType,
    time: extractTime(text),
    foods: extractFoods(text),
    groupAte,
    exceptions,
  };
}

function parseActivity(text, children) {
  const lower = String(text || "").toLowerCase();
  const hasActivity = /\b(walk|butterfl|paint|played|play|outside|outdoor|activity|read|books|music|dance|garden|looked for|block play)\b/i.test(text);
  if (!hasActivity) return null;
  let title = "Classroom activity";
  const went = String(text || "").match(/\b(?:we|children|class)\s+went\s+on\s+a\s+([^.]*)/i);
  const todayWe = String(text || "").match(/\btoday\s+we\s+([^.]*)/i);
  if (went) title = cleanText(went[1].replace(/\band\s+looked\s+for\s+/i, "and looked for "), 120);
  else if (todayWe) title = cleanText(todayWe[1].replace(/\b(everyone|all)\b.*$/i, ""), 120);
  if (/walk/i.test(title) && /butterfl/i.test(lower)) title = "Walk and butterfly search";
  if (/paint/i.test(lower) && /outside/i.test(lower)) title = "Painting and outdoor play";
  const groupEnjoyed = /\b(everyone|all children|the children)\s+(loved|enjoyed|had fun|liked)\b/i.test(text)
    ? true
    : undefined;
  const exceptions = [];
  const highlights = [];
  const exceptPattern = /\bexcept\s+([A-Z][a-z]+)(?:,\s*who)?\s+([^.]*)/g;
  for (const match of String(text || "").matchAll(exceptPattern)) {
    const child = findChildByName(match[1], children);
    if (!child || exceptions.some((row) => row.childId === child.id)) continue;
    exceptions.push({
      childId: child.id,
      childName: child.displayName,
      note: cleanText(match[2] || match[0], 240),
      observation: true,
    });
  }
  const highlightPattern = /\b([A-Z][a-z]+)\s+(?:was|were)\s+(especially\s+)?(excited|interested|proud|focused|curious|happy)([^.]*)/g;
  for (const match of String(text || "").matchAll(highlightPattern)) {
    const child = findChildByName(match[1], children);
    if (!child || highlights.some((row) => row.childId === child.id)) continue;
    highlights.push({
      childId: child.id,
      childName: child.displayName,
      note: cleanText(match[0], 240),
      observation: true,
    });
  }
  const incidentPattern = /\b([A-Z][a-z]+)\s+(fell|bumped|scraped|tripped|got hurt)([^.]*)/gi;
  for (const match of String(text || "").matchAll(incidentPattern)) {
    const child = findChildByName(match[1], children);
    if (!child || highlights.some((row) => row.childId === child.id)) continue;
    highlights.push({
      childId: child.id,
      childName: child.displayName,
      note: cleanText(match[0], 240),
      observation: true,
      incident: true,
    });
  }
  if (!exceptions.length && !highlights.length && findNamedChildren(text, children).length === 1 && /especially|excited|interested|preferred/i.test(text)) {
    const child = findNamedChildren(text, children)[0];
    highlights.push({ childId: child.id, childName: child.displayName, note: cleanText(text, 240), observation: true });
  }
  return {
    title,
    time: extractTime(text),
    groupEnjoyed,
    exceptions,
    highlights,
  };
}

function parseNap(text, children) {
  if (!/\bnap|slept|rest\b/i.test(text)) return null;
  const exceptions = [];
  const napPattern = /\bexcept\s+([A-Z][a-z]+)(?:,\s*who)?\s+slept\s+for\s+(?:only\s+)?(\d+)\s*(minutes?|mins?|hours?|hrs?)?/gi;
  for (const match of String(text || "").matchAll(napPattern)) {
    const child = findChildByName(match[1], children);
    if (!child) continue;
    let duration = Number(match[2]) || 0;
    if (/hour|hr/i.test(match[3] || "")) duration *= 60;
    exceptions.push({
      childId: child.id,
      childName: child.displayName,
      durationMinutes: duration,
      note: cleanText(match[0], 240),
    });
  }
  return {
    groupSlept: /\beveryone\b.+\b(great\s+nap|slept|rested|nap)\b/i.test(text) || exceptions.length > 0,
    time: extractTime(text),
    exceptions,
  };
}

function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => cleanText(part, 500))
    .filter(Boolean);
}

function parseDiaper(text, children) {
  if (!/\bdiaper|nappy|changed\b/i.test(text)) return null;
  const entries = [];
  let groupApplied = false;
  let status = "checked";
  let time = "";
  const parts = sentences(text);
  for (let index = 0; index < parts.length; index += 1) {
    const sentence = parts[index];
    if (!/\bdiaper|nappy|changed\b/i.test(sentence)) continue;
    let localStatus = status;
    const statusMatch = sentence.match(/\b(wet|soiled|dirty|bm|bowel|dry)\b/i)
      || (parts[index + 1] || "").match(/^(wet|soiled|dirty|bm|bowel|dry)\.?$/i);
    if (statusMatch) {
      localStatus = statusMatch[1].toLowerCase().replace("dirty", "soiled").replace("bm", "soiled").replace("bowel", "soiled");
      status = localStatus;
    }
    time = time || extractTime(sentence);
    if (/\b(everyone|all children|class)\b.+\b(diaper|changed|check)\b/i.test(sentence)) groupApplied = true;
    for (const child of findNamedChildren(sentence, children)) {
      if (entries.some((row) => row.childId === child.id)) continue;
      entries.push({
        childId: child.id,
        childName: child.displayName,
        status: localStatus,
        note: cleanText([sentence, statusMatch && !/\b(wet|soiled|dirty|bm|bowel|dry)\b/i.test(sentence) ? parts[index + 1] : ""].filter(Boolean).join(" "), 240),
      });
    }
  }
  if (!entries.length && !groupApplied) return null;
  return {
    groupApplied,
    status,
    time: time || extractTime(text),
    entries,
    exceptions: [],
  };
}

function parsePotty(text, children) {
  if (!/\bpotty|toilet|bathroom\b/i.test(text)) return null;
  const entries = [];
  let groupApplied = false;
  let result = "attempt";
  let time = "";
  const parts = sentences(text);
  let inPottyContext = false;
  for (const sentence of parts) {
    const mentionsPotty = /\bpotty|toilet|bathroom\b/i.test(sentence);
    if (mentionsPotty) inPottyContext = true;
    if (!mentionsPotty && !inPottyContext) continue;
    if (!mentionsPotty && inPottyContext && !/\b(made it|accident|success|successful|dry|wet pants|missed|changed clothes)\b/i.test(sentence)) {
      continue;
    }
    const success = /\b(successful|success|dry|used the potty|went potty|made it)\b/i.test(sentence);
    const accident = /\b(accident|had an accident|wet pants|missed)\b/i.test(sentence);
    if (accident) result = "accident";
    else if (success) result = "success";
    time = time || extractTime(sentence);
    if (/\b(everyone|all children)\b.+\b(potty|toilet)\b/i.test(sentence)) groupApplied = true;
    for (const child of findNamedChildren(sentence, children)) {
      if (entries.some((row) => row.childId === child.id)) continue;
      entries.push({
        childId: child.id,
        childName: child.displayName,
        result: accident ? "accident" : success ? "success" : "attempt",
        note: cleanText(sentence, 240),
      });
    }
    if (/\bwe cleaned|changed clothes|comforted\b/i.test(sentence)) inPottyContext = false;
  }
  if (!entries.length && !groupApplied) return null;
  return {
    groupApplied,
    result,
    time: time || extractTime(text),
    entries,
  };
}

function parseMedication(text, children) {
  if (!/\b(medication|medicine|meds|inhaler|epipen|vitamin|dose|prescribed)\b/i.test(text)) return null;
  const entries = [];
  let medicationName = "medication";
  let time = "";
  let note = "";
  for (const sentence of sentences(text)) {
    if (!/\b(medication|medicine|meds|inhaler|epipen|vitamin|dose|prescribed)\b/i.test(sentence)) continue;
    const medMatch = sentence.match(/\b(?:gave|administered|had)\s+(?:him|her|them|[A-Z][a-z]+)?\s*(?:his|her|their)?\s*(?:prescribed\s+)?([A-Za-z][A-Za-z0-9\s-]{1,40}?)(?:\s+at\b|\s+for\b|\.|$)/i)
      || sentence.match(/\b(vitamin|inhaler|epipen|medication|medicine)\b/i);
    medicationName = cleanText(medMatch?.[1] || medicationName, 80);
    time = extractTime(sentence) || time;
    note = cleanText(sentence, 240);
    for (const child of findNamedChildren(sentence, children)) {
      if (entries.some((row) => row.childId === child.id)) continue;
      entries.push({
        childId: child.id,
        childName: child.displayName,
        medicationName,
        note,
      });
    }
  }
  if (!entries.length && !note) return null;
  return {
    medicationName,
    time: time || extractTime(text),
    requiresExtraReview: true,
    entries,
    note: note || cleanText(text, 240),
  };
}

function parseAttendance(text, children) {
  if (!/\b(checked in|check[- ]?in|checked out|check[- ]?out|absent|attendance|here today|arrived)\b/i.test(text)) return null;
  const entries = [];
  let groupHere = false;
  let summary = "";
  for (const sentence of sentences(text)) {
    if (!/\b(checked in|check[- ]?in|checked out|check[- ]?out|absent|attendance|here today|arrived)\b/i.test(sentence)) continue;
    const time = extractTime(sentence);
    summary = cleanText(sentence, 240);
    if (/\b(everyone|all children)\s+(is|are|was|were)?\s*(here|present|checked in)\b/i.test(sentence)) {
      groupHere = true;
    }
    for (const match of sentence.matchAll(/\b([A-Z][a-z]+)\s+(?:checked in|arrived|came in)\b/gi)) {
      const child = findChildByName(match[1], children);
      if (!child) continue;
      entries.push({ childId: child.id, childName: child.displayName, action: "checked_in", time, note: cleanText(match[0], 240) });
    }
    for (const match of sentence.matchAll(/\b([A-Z][a-z]+)\s+(?:checked out|left|went home)\b/gi)) {
      const child = findChildByName(match[1], children);
      if (!child) continue;
      entries.push({ childId: child.id, childName: child.displayName, action: "checked_out", time, note: cleanText(match[0], 240) });
    }
    for (const match of sentence.matchAll(/\b([A-Z][a-z]+)\s+(?:is|was)\s+absent\b/gi)) {
      const child = findChildByName(match[1], children);
      if (!child) continue;
      entries.push({ childId: child.id, childName: child.displayName, action: "absent", time, note: cleanText(match[0], 240) });
    }
  }
  if (!entries.length && !groupHere) return null;
  return {
    groupHere,
    action: groupHere ? "checked_in" : (entries[0]?.action || "attendance_note"),
    time: entries.find((row) => row.time)?.time || "",
    entries,
    summary: summary || cleanText(text, 240),
  };
}

function parseNaturalNote(text, { organizationId = "", children = [], checkedInIds = [], now } = {}) {
  const clean = cleanText(text, 3000);
  const normalizedChildren = (Array.isArray(children) ? children : []).map(normalizeChild).filter((child) => child.id);
  const checkedSet = new Set((checkedInIds || []).map(String));
  const checkedChildren = normalizedChildren.filter((child) => checkedSet.has(String(child.id)));
  const meal = parseMeal(clean, normalizedChildren);
  const activity = parseActivity(clean, normalizedChildren);
  const nap = parseNap(clean, normalizedChildren);
  const diaper = parseDiaper(clean, normalizedChildren);
  const potty = parsePotty(clean, normalizedChildren);
  const medication = parseMedication(clean, normalizedChildren);
  const attendance = parseAttendance(clean, normalizedChildren);
  const difficultSituation = detectDifficultSituation(clean);
  const named = findNamedChildren(clean, normalizedChildren);
  const namedIds = named.map((child) => child.id);
  const hasGroupAction = [meal?.groupAte, activity?.groupEnjoyed, nap?.groupSlept, diaper?.groupApplied, potty?.groupApplied, attendance?.groupHere]
    .some((value) => value === true)
    || /\b(everyone|all children|the children)\b/i.test(clean);
  const targetSet = new Set(hasGroupAction ? checkedChildren.map((child) => child.id) : []);
  for (const id of namedIds) targetSet.add(id);
  for (const entry of [...(diaper?.entries || []), ...(potty?.entries || []), ...(medication?.entries || []), ...(attendance?.entries || [])]) {
    if (entry.childId) targetSet.add(entry.childId);
  }
  const unmatchedNames = [];
  for (const word of clean.match(/\b[A-Z][a-z]{2,}\b/g) || []) {
    if (["Breakfast", "Today", "Everyone", "Ava", "Timmy", "Susan", "Jack"].includes(word)) {
      if (findChildByName(word, normalizedChildren)) continue;
    }
    if (!findChildByName(word, normalizedChildren) && !["Breakfast", "Today", "Everyone", "Changed", "Gave"].includes(word)) unmatchedNames.push(word);
  }
  const dailySummary = buildDailySummary({ text: clean, meal, activity, nap, diaper, potty, medication, attendance });
  const plan = {
    id: newId("caplan"),
    planId: "",
    organizationId,
    sourceText: clean,
    createdAt: now ? new Date(now).toISOString() : nowIso(),
    requiresReview: true,
    previewOnly: true,
    liveAiUsed: false,
    localDeterministicParsing: true,
    offlineCapable: true,
    meal,
    activity,
    nap,
    diaper,
    potty,
    medication,
    attendance,
    difficultSituation,
    dailySummary,
    suggestions: suggestionSet({ meal, activity, nap, diaper, potty, medication, attendance, difficult: Boolean(difficultSituation) }),
    targets: [...targetSet],
    confidence: {
      level: clean ? "medium" : "low",
      notes: [
        "Local deterministic parser only.",
        "Review before save is required.",
        hasGroupAction ? "Group entries target checked-in children for today." : "Only named children are targeted.",
        medication ? "Medication logs always require extra review." : "",
      ].filter(Boolean),
      unmatchedNames: [...new Set(unmatchedNames)].slice(0, 8),
    },
  };
  plan.planId = plan.id;
  plan.professionalDrafts = buildProfessionalDrafts(plan, { children: normalizedChildren });
  plan.examplePrompts = EXAMPLE_PROMPTS;
  return plan;
}

function targetNames(children, ids) {
  const byId = new Map((children || []).map((child) => [child.id || child.childId, childDisplayName(child)]));
  return (ids || []).map((id) => byId.get(id) || id);
}

function createApplyResult({ plan, applied = false, errors = [], created = {} } = {}) {
  return {
    ok: applied && errors.length === 0,
    applied,
    confirmRequired: !applied,
    errors,
    planId: plan?.id || plan?.planId || "",
    liveAiUsed: false,
    created: {
      mealLogIds: created.mealLogIds || [],
      activityLogIds: created.activityLogIds || [],
      observationIds: created.observationIds || [],
      dailySummaryIds: created.dailySummaryIds || [],
      diaperLogIds: created.diaperLogIds || [],
      pottyLogIds: created.pottyLogIds || [],
      medicationLogIds: created.medicationLogIds || [],
      attendanceNoteIds: created.attendanceNoteIds || [],
      communicationDraftIds: created.communicationDraftIds || [],
      suggestionActionIds: created.suggestionActionIds || [],
    },
    testingBanner: TESTING_BANNER,
  };
}

function appendHistory(ca, entry) {
  ca.history.unshift({ id: newId("cahist"), at: nowIso(), ...entry });
  ca.history = ca.history.slice(0, 200);
}

function writePreviewDailyLog(store, childId, row) {
  if (!store.previewDailyLogs || typeof store.previewDailyLogs !== "object") return;
  store.previewDailyLogs[row.id] = { ...row, childId, testingOnly: true };
}

function writePreviewObservation(store, childId, row) {
  if (!store.previewObservations || typeof store.previewObservations !== "object") return;
  store.previewObservations[row.id] = { ...row, childId, testingOnly: true };
}

function exceptionIds(items = []) {
  return new Set((items || []).map((item) => item.childId).filter(Boolean));
}

function applyParsedPlan(store, plan, { confirm = false, organizationId = "", actorEmail = "" } = {}) {
  const ca = ensureClassroomAssistantStore(store);
  if (confirm !== true) {
    return createApplyResult({ plan, applied: false, errors: ["confirm_true_required"] });
  }
  if (!plan || typeof plan !== "object") {
    return createApplyResult({ plan: {}, applied: false, errors: ["plan_required"] });
  }
  const orgId = organizationId || plan.organizationId || "";
  if (plan.organizationId && orgId && plan.organizationId !== orgId) {
    return createApplyResult({ plan, applied: false, errors: ["cross_org_denied"] });
  }
  const children = childrenForOrg(store, orgId);
  const childIds = (Array.isArray(plan.targets) ? plan.targets : []).filter(Boolean);
  const created = {
    mealLogIds: [],
    activityLogIds: [],
    observationIds: [],
    dailySummaryIds: [],
    diaperLogIds: [],
    pottyLogIds: [],
    medicationLogIds: [],
    attendanceNoteIds: [],
    communicationDraftIds: [],
    suggestionActionIds: [],
  };
  const at = nowIso();
  const mealExceptionIds = exceptionIds(plan.meal?.exceptions);
  const activityExceptionIds = exceptionIds(plan.activity?.exceptions);
  const napExceptionIds = exceptionIds(plan.nap?.exceptions);

  if (plan.meal) {
    for (const childId of childIds) {
      const exception = (plan.meal.exceptions || []).find((row) => row.childId === childId);
      const row = {
        id: newId("cameal"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        childId,
        childName: targetNames(children, [childId])[0],
        mealType: plan.meal.mealType || "meal",
        time: plan.meal.time || "",
        foods: plan.meal.foods || [],
        ate: exception ? exception.ate !== false : plan.meal.groupAte !== false,
        note: exception?.note || "",
        groupApplied: !mealExceptionIds.has(childId),
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
      };
      ca.mealLogs[row.id] = row;
      created.mealLogIds.push(row.id);
      writePreviewDailyLog(store, childId, row);
    }
  }

  if (plan.activity) {
    for (const childId of childIds) {
      const exception = (plan.activity.exceptions || []).find((row) => row.childId === childId);
      const highlight = (plan.activity.highlights || []).find((row) => row.childId === childId);
      const row = {
        id: newId("caact"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        childId,
        childName: targetNames(children, [childId])[0],
        title: plan.activity.title || "Classroom activity",
        time: plan.activity.time || "",
        enjoyed: exception ? false : plan.activity.groupEnjoyed === true ? true : undefined,
        note: exception?.note || highlight?.note || "",
        groupApplied: !activityExceptionIds.has(childId),
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
      };
      ca.activityLogs[row.id] = row;
      created.activityLogIds.push(row.id);
      writePreviewDailyLog(store, childId, row);
    }
    for (const item of [...(plan.activity.highlights || []), ...(plan.activity.exceptions || [])]) {
      const row = {
        id: newId("caobs"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        childId: item.childId,
        childName: item.childName || targetNames(children, [item.childId])[0],
        note: item.note || plan.activity.title || "Classroom observation",
        observation: true,
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
      };
      ca.observations[row.id] = row;
      created.observationIds.push(row.id);
      writePreviewObservation(store, item.childId, row);
    }
  }

  if (plan.nap) {
    for (const childId of childIds) {
      const exception = (plan.nap.exceptions || []).find((row) => row.childId === childId);
      const row = {
        id: newId("casum"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        childId,
        childName: targetNames(children, [childId])[0],
        bucket: "nap",
        note: exception?.note || (plan.nap.groupSlept ? "Slept/rested with the group." : "Rest time noted."),
        durationMinutes: exception?.durationMinutes || null,
        groupApplied: !napExceptionIds.has(childId),
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
      };
      ca.dailySummaries[row.id] = row;
      created.dailySummaryIds.push(row.id);
      writePreviewDailyLog(store, childId, row);
    }
  }

  if (plan.diaper) {
    const diaperTargets = plan.diaper.groupApplied
      ? childIds
      : (plan.diaper.entries || []).map((row) => row.childId).filter(Boolean);
    for (const childId of [...new Set(diaperTargets)]) {
      const entry = (plan.diaper.entries || []).find((row) => row.childId === childId);
      const row = {
        id: newId("cadpr"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        childId,
        childName: targetNames(children, [childId])[0],
        status: entry?.status || plan.diaper.status || "checked",
        time: plan.diaper.time || "",
        note: entry?.note || "",
        groupApplied: plan.diaper.groupApplied === true,
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
      };
      ca.diaperLogs[row.id] = row;
      created.diaperLogIds.push(row.id);
      writePreviewDailyLog(store, childId, row);
    }
  }

  if (plan.potty) {
    const pottyTargets = plan.potty.groupApplied
      ? childIds
      : (plan.potty.entries || []).map((row) => row.childId).filter(Boolean);
    for (const childId of [...new Set(pottyTargets)]) {
      const entry = (plan.potty.entries || []).find((row) => row.childId === childId);
      const row = {
        id: newId("capot"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        childId,
        childName: targetNames(children, [childId])[0],
        result: entry?.result || plan.potty.result || "attempt",
        time: plan.potty.time || "",
        note: entry?.note || "",
        groupApplied: plan.potty.groupApplied === true,
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
      };
      ca.pottyLogs[row.id] = row;
      created.pottyLogIds.push(row.id);
      writePreviewDailyLog(store, childId, row);
    }
  }

  if (plan.medication) {
    const medTargets = (plan.medication.entries || []).map((row) => row.childId).filter(Boolean);
    for (const childId of [...new Set(medTargets.length ? medTargets : childIds)]) {
      const entry = (plan.medication.entries || []).find((row) => row.childId === childId);
      const row = {
        id: newId("camed"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        childId,
        childName: targetNames(children, [childId])[0],
        medicationName: entry?.medicationName || plan.medication.medicationName || "medication",
        time: plan.medication.time || "",
        note: entry?.note || plan.medication.note || "",
        requiresExtraReview: true,
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
      };
      ca.medicationLogs[row.id] = row;
      created.medicationLogIds.push(row.id);
      writePreviewDailyLog(store, childId, row);
    }
  }

  if (plan.attendance) {
    const attendanceTargets = plan.attendance.groupHere
      ? childIds
      : (plan.attendance.entries || []).map((row) => row.childId).filter(Boolean);
    for (const childId of [...new Set(attendanceTargets)]) {
      const entry = (plan.attendance.entries || []).find((row) => row.childId === childId);
      const row = {
        id: newId("caatt"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        childId,
        childName: targetNames(children, [childId])[0],
        action: entry?.action || plan.attendance.action || "attendance_note",
        time: entry?.time || plan.attendance.time || "",
        note: entry?.note || plan.attendance.summary || "",
        groupApplied: plan.attendance.groupHere === true,
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
      };
      ca.attendanceNotes[row.id] = row;
      created.attendanceNoteIds.push(row.id);
      writePreviewDailyLog(store, childId, row);
    }
  }

  if (plan.professionalDrafts && typeof plan.professionalDrafts === "object") {
    for (const draft of Object.values(plan.professionalDrafts)) {
      if (!draft || typeof draft !== "object") continue;
      const row = {
        id: newId("cacomm"),
        organizationId: orgId,
        planId: plan.id || plan.planId || "",
        type: draft.type || "documentation",
        title: draft.title || draft.type || "Draft",
        tone: draft.tone || "",
        body: draft.body || "",
        actorEmail: cleanText(actorEmail, 160).toLowerCase(),
        createdAt: at,
        testingOnly: true,
        liveAiUsed: false,
        previewShared: false,
      };
      ca.communicationDrafts[row.id] = row;
      created.communicationDraftIds.push(row.id);
    }
  }

  const summary = {
    id: newId("casum"),
    organizationId: orgId,
    planId: plan.id || plan.planId || "",
    childIds,
    buckets: plan.dailySummary || {},
    sourceText: plan.sourceText || "",
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    createdAt: at,
    testingOnly: true,
    liveAiUsed: false,
  };
  ca.dailySummaries[summary.id] = summary;
  created.dailySummaryIds.push(summary.id);
  ca.parsedPlans[plan.id || plan.planId || newId("caplan")] = { ...plan, appliedAt: at, appliedBy: actorEmail, previewOnly: false, liveAiUsed: false };
  appendHistory(ca, { type: "plan_applied", organizationId: orgId, planId: plan.id || plan.planId || "", childIds });
  return createApplyResult({ plan, applied: true, created });
}

function createOfflineQueueItem({ text = "", plan = null, organizationId = "", action = "apply_plan" } = {}) {
  return {
    id: newId("caoffline"),
    organizationId: cleanText(organizationId, 80),
    action: cleanText(action, 40) || "apply_plan",
    text: cleanText(text, 3000),
    plan: plan && typeof plan === "object" ? plan : null,
    createdAt: nowIso(),
    status: "pending_sync",
    liveAiUsed: false,
    testingOnly: true,
  };
}

function mergeOfflineQueue(existing = [], incoming = []) {
  const byId = new Map();
  for (const row of [...(existing || []), ...(incoming || [])]) {
    if (!row || !row.id) continue;
    byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

function pendingOfflineItems(queue = []) {
  return (queue || []).filter((row) => row && row.status === "pending_sync");
}

function markOfflineItemSynced(queue = [], itemId, syncedAt = nowIso()) {
  return (queue || []).map((row) => (
    row?.id === itemId
      ? { ...row, status: "synced", syncedAt, liveAiUsed: false }
      : row
  ));
}

function syncOfflineQueue(store, queue = [], { confirm = false, organizationId = "", actorEmail = "" } = {}) {
  if (confirm !== true) {
    return { ok: false, code: "confirm_required", syncedIds: [], remaining: pendingOfflineItems(queue), liveAiUsed: false };
  }
  const ca = ensureClassroomAssistantStore(store);
  const syncedIds = [];
  const errors = [];
  let working = [...(queue || [])];
  for (const item of pendingOfflineItems(working)) {
    if (item.organizationId && organizationId && item.organizationId !== organizationId) {
      errors.push({ id: item.id, code: "cross_org_denied" });
      continue;
    }
    const plan = item.plan || parseNaturalNote(item.text || "", {
      organizationId,
      children: childrenForOrg(store, organizationId),
      checkedInIds: getCheckedInChildren(store, organizationId, {}).map((child) => child.id),
    });
    const result = applyParsedPlan(store, plan, { confirm: true, organizationId, actorEmail });
    if (!result.ok) {
      errors.push({ id: item.id, code: result.errors?.[0] || "apply_failed" });
      continue;
    }
    working = markOfflineItemSynced(working, item.id);
    const synced = {
      id: item.id,
      organizationId,
      planId: result.planId,
      syncedAt: nowIso(),
      testingOnly: true,
      liveAiUsed: false,
    };
    ca.offlineSynced[item.id] = synced;
    syncedIds.push(item.id);
  }
  appendHistory(ca, { type: "offline_sync", organizationId, syncedIds });
  return {
    ok: errors.length === 0,
    syncedIds,
    remaining: pendingOfflineItems(working),
    queue: working,
    errors,
    liveAiUsed: false,
    testingBanner: TESTING_BANNER,
  };
}

function parseLessonPlanPaste(text) {
  const raw = cleanText(text, 5000);
  const lines = String(text || "").split(/\r?\n/).map((line) => cleanText(line, 300)).filter(Boolean);
  const first = lines[0] || "Imported classroom lesson plan";
  const titleLine = lines.find((line) => /^title\s*:/i.test(line));
  const title = cleanText((titleLine ? titleLine.replace(/^title\s*:/i, "") : first).replace(/^#+\s*/, ""), 160) || "Imported classroom lesson plan";
  const ageLine = lines.find((line) => /\bage\s*(group|range)?\s*:/i.test(line) || /\b(infant|toddler|preschool|pre-k|school age)\b/i.test(line));
  const domainLine = lines.find((line) => /\b(domain|learning area|standard)\b/i.test(line));
  const materialLine = lines.find((line) => /\bmaterials?\s*:/i.test(line));
  const objectiveLine = lines.find((line) => /\b(objective|goal)s?\s*:/i.test(line));
  const vocabLine = lines.find((line) => /\b(vocabulary|words)\s*:/i.test(line));
  const adaptLine = lines.find((line) => /\b(adaptation|accommodation|modification)s?\s*:/i.test(line));
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const activitiesByDay = {};
  for (const day of weekdays) {
    const line = lines.find((item) => item.toLowerCase().startsWith(`${day}:`) || item.toLowerCase().startsWith(`${day} -`));
    if (line) activitiesByDay[day] = [cleanText(line.replace(new RegExp(`^${day}\\s*[:-]\\s*`, "i"), ""), 500)];
  }
  const activityLines = lines.filter((line) => /\b(activity|circle|art|music|sensory|outdoor|small group|read)\b/i.test(line)).slice(0, 8);
  return {
    id: newId("calpdraft"),
    title,
    ageGroups: splitList(ageLine ? ageLine.replace(/^.*?:/, "") : "Toddler, Preschool"),
    learningDomains: splitList(domainLine ? domainLine.replace(/^.*?:/, "") : "Language, social-emotional, motor, cognitive"),
    activitiesByDay,
    activities: activityLines.length ? activityLines : ["Read together, offer open-ended play, and observe child interests."],
    materials: splitList(materialLine ? materialLine.replace(/^.*?:/, "") : "books, paper, crayons, blocks, outdoor materials"),
    objectives: splitList(objectiveLine ? objectiveLine.replace(/^.*?:/, "") : "Support language, peer interaction, and hands-on exploration"),
    vocabulary: splitList(vocabLine ? vocabLine.replace(/^.*?:/, "") : "notice, compare, describe, create"),
    adaptations: splitList(adaptLine ? adaptLine.replace(/^.*?:/, "") : "Offer choices, simplify materials, provide quiet participation options"),
    sourceText: raw,
    requiresReview: true,
    liveAiUsed: false,
    localDeterministicParsing: true,
    computerRecommended: true,
    reviewNote: "Review on a computer before saving to curriculum.",
    createdAt: nowIso(),
  };
}

function createLessonPlanDraftFromPaste(store, text, { organizationId = "", actorEmail = "" } = {}) {
  const ca = ensureClassroomAssistantStore(store);
  const draft = {
    ...parseLessonPlanPaste(text),
    organizationId,
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    status: "draft_review_required",
    testingOnly: true,
  };
  ca.lessonPlanDrafts[draft.id] = draft;
  appendHistory(ca, { type: "lesson_plan_draft_created", organizationId, draftId: draft.id });
  return draft;
}

function confirmLessonPlanDraft(store, draftOrId, { confirm = false, organizationId = "", actorEmail = "" } = {}) {
  const ca = ensureClassroomAssistantStore(store);
  if (confirm !== true) {
    return { ok: false, code: "confirm_required", error: "Review and confirm before saving the lesson plan draft.", liveAiUsed: false };
  }
  const draft = typeof draftOrId === "string" ? ca.lessonPlanDrafts[draftOrId] : draftOrId;
  if (!draft || typeof draft !== "object") return { ok: false, code: "draft_not_found", error: "Draft not found.", liveAiUsed: false };
  const orgId = organizationId || draft.organizationId || "";
  if (draft.organizationId && orgId && draft.organizationId !== orgId) {
    return { ok: false, code: "cross_org_denied", error: "Draft belongs to another organization.", liveAiUsed: false };
  }
  const saved = {
    ...draft,
    organizationId: orgId,
    status: "saved_fake_curriculum",
    requiresReview: false,
    confirmedAt: nowIso(),
    confirmedBy: cleanText(actorEmail, 160).toLowerCase(),
    liveAiUsed: false,
    testingOnly: true,
  };
  ca.lessonPlanDrafts[saved.id] = saved;
  appendHistory(ca, { type: "lesson_plan_draft_confirmed", organizationId: orgId, draftId: saved.id });
  return { ok: true, draft: saved, liveAiUsed: false, testingBanner: TESTING_BANNER };
}

module.exports = {
  TESTING_BANNER,
  FEATURE_MARKER,
  PHONE_MARKER,
  INCLUDED_CAPABILITIES,
  STORE_MAP_KEYS,
  EXAMPLE_PROMPTS,
  ensureClassroomAssistantStore,
  getCheckedInChildren,
  parseNaturalNote,
  createApplyResult,
  applyParsedPlan,
  parseLessonPlanPaste,
  createLessonPlanDraftFromPaste,
  confirmLessonPlanDraft,
  createOfflineQueueItem,
  mergeOfflineQueue,
  pendingOfflineItems,
  markOfflineItemSynced,
  syncOfflineQueue,
  buildProfessionalDrafts,
  detectDifficultSituation,
  newId,
  nowIso,
  todayDate,
  cleanText,
  childrenForOrg,
};
