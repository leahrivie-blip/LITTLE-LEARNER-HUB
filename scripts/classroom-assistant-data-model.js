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

function ensureClassroomAssistantStore(store) {
  if (!store || typeof store !== "object") throw new Error("store required");
  if (!store.classroomAssistant || typeof store.classroomAssistant !== "object") {
    store.classroomAssistant = {
      parsedPlans: {},
      mealLogs: {},
      activityLogs: {},
      observations: {},
      dailySummaries: {},
      lessonPlanDrafts: {},
      suggestionActions: {},
      history: [],
      meta: {
        createdAt: nowIso(),
        fakeDataOnly: true,
        liveAiUsed: false,
        featureMarker: FEATURE_MARKER,
      },
    };
  }
  const ca = store.classroomAssistant;
  for (const key of ["parsedPlans", "mealLogs", "activityLogs", "observations", "dailySummaries", "lessonPlanDrafts", "suggestionActions"]) {
    if (!ca[key] || typeof ca[key] !== "object") ca[key] = {};
  }
  if (!Array.isArray(ca.history)) ca.history = [];
  if (!ca.meta || typeof ca.meta !== "object") ca.meta = {};
  ca.meta.fakeDataOnly = true;
  ca.meta.liveAiUsed = false;
  ca.meta.featureMarker = FEATURE_MARKER;
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

function buildDailySummary({ text, meal, activity, nap }) {
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
  if (note) {
    dailyReport.push(note);
    parentReport.push(note);
    documentation.push("Review this classroom note before sharing or filing.");
  }
  return { dailyReport, activities, meals, observations, parentReport, documentation, timeline };
}

function suggestionSet({ meal, activity, nap }) {
  const suggestions = [
    { type: "daily_report", label: "Add to daily reports", oneClick: true },
    { type: "parent_message", label: "Draft parent-friendly note", oneClick: true },
  ];
  if (activity) {
    suggestions.push({ type: "observation", label: "Save activity observation", oneClick: true });
    suggestions.push({ type: "portfolio", label: "Add to portfolio notes", oneClick: true });
  }
  if (meal) suggestions.push({ type: "documentation", label: "File meal documentation", oneClick: true });
  if (nap) suggestions.push({ type: "milestone", label: "Track rest routine", oneClick: true });
  return suggestions;
}

function parseMeal(text, children) {
  const mealType = extractMealType(text);
  if (!mealType) return null;
  const exceptions = [];
  const exceptionPatterns = [
    /\b([A-Z][a-z]+)\s+(?:decided\s+not\s+to|did\s+not|didn't|would\s+not|wouldn't|refused|declined|chose\s+not\s+to)\s+(?:eat|have)([^.]*)/g,
    /\bexcept\s+([A-Z][a-z]+)(?:,\s*who)?\s+(?:did\s+not|didn't|would\s+not|wouldn't|refused|declined|chose\s+not\s+to)\s+(?:eat|have)([^.]*)/g,
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
  const hasActivity = /\b(walk|butterfl|paint|played|outside|activity|read|books|music|dance|garden|looked for)\b/i.test(text);
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
    exceptions,
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
  const named = findNamedChildren(clean, normalizedChildren);
  const namedIds = named.map((child) => child.id);
  const hasGroupAction = [meal?.groupAte, activity?.groupEnjoyed, nap?.groupSlept].some((value) => value === true || value === false)
    || /\b(everyone|all children|the children)\b/i.test(clean);
  const targetSet = new Set(hasGroupAction ? checkedChildren.map((child) => child.id) : []);
  for (const id of namedIds) targetSet.add(id);
  const unmatchedNames = [];
  for (const word of clean.match(/\b[A-Z][a-z]{2,}\b/g) || []) {
    if (["Breakfast", "Today", "Everyone", "Ava", "Timmy", "Susan", "Jack"].includes(word)) {
      if (findChildByName(word, normalizedChildren)) continue;
    }
    if (!findChildByName(word, normalizedChildren) && !["Breakfast", "Today", "Everyone"].includes(word)) unmatchedNames.push(word);
  }
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
    meal,
    activity,
    nap,
    dailySummary: buildDailySummary({ text: clean, meal, activity, nap }),
    suggestions: suggestionSet({ meal, activity, nap }),
    targets: [...targetSet],
    confidence: {
      level: clean ? "medium" : "low",
      notes: [
        "Local deterministic parser only.",
        "Review before save is required.",
        hasGroupAction ? "Group entries target checked-in children for today." : "Only named children are targeted.",
      ],
      unmatchedNames: [...new Set(unmatchedNames)].slice(0, 8),
    },
  };
  plan.planId = plan.id;
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
  const created = { mealLogIds: [], activityLogIds: [], observationIds: [], dailySummaryIds: [], suggestionActionIds: [] };
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
  ensureClassroomAssistantStore,
  getCheckedInChildren,
  parseNaturalNote,
  createApplyResult,
  applyParsedPlan,
  parseLessonPlanPaste,
  createLessonPlanDraftFromPaste,
  confirmLessonPlanDraft,
  newId,
  nowIso,
  todayDate,
  cleanText,
  childrenForOrg,
};
