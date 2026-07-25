/**
 * Phase 21 — Provider Productivity, Child-Led Planning, Ease of Use.
 * Fake/testing only. Lesson plans remain optional. No live AI / email / SMS / Stripe.
 */

const crypto = require("node:crypto");

const TESTING_BANNER = "Testing Account — Fake Data Only. Not production operations.";
const FEATURE_MARKER = "phase21-provider-productivity";
const PHONE_MARKER = "phase21-child-led-mobile";

const PLANNING_PREFERENCES = Object.freeze({
  STRUCTURED_LESSON_PLANS: "structured_lesson_plans",
  WEEKLY_ACTIVITY_PLANNING: "weekly_activity_planning",
  CHILD_LED_PLAY_BASED: "child_led_play_based",
  MIXED_FLEXIBLE: "mixed_flexible",
  NOT_SURE_YET: "not_sure_yet",
});

const PLANNING_PREFERENCE_LABELS = Object.freeze({
  [PLANNING_PREFERENCES.STRUCTURED_LESSON_PLANS]: "Structured lesson plans",
  [PLANNING_PREFERENCES.WEEKLY_ACTIVITY_PLANNING]: "Weekly activity planning",
  [PLANNING_PREFERENCES.CHILD_LED_PLAY_BASED]: "Child-led / play-based planning",
  [PLANNING_PREFERENCES.MIXED_FLEXIBLE]: "Mixed / flexible approach",
  [PLANNING_PREFERENCES.NOT_SURE_YET]: "Not sure yet",
});

const PLAY_THEMES = Object.freeze([
  "loose_parts",
  "open_ended_play",
  "outdoor_exploration",
  "sensory_experiences",
  "invitations_to_play",
  "practical_life",
  "gardening",
  "preparing_serving_food",
  "washing_drying_up",
  "cleaning_caring_environment",
  "sorting_washing",
  "independence_self_help",
]);

const INITIATION_MODES = Object.freeze({
  CHILD_INITIATED: "child_initiated",
  ADULT_AVAILABLE: "adult_available",
  INVITATION_OFFERED: "invitation_offered",
});

const SETUP_STEPS = Object.freeze([
  { id: "program_details", label: "Program details", homeDaycare: true, center: true },
  { id: "planning_preference", label: "Planning preference", homeDaycare: true, center: true },
  { id: "classroom_or_home", label: "Classroom or home-daycare setup", homeDaycare: true, center: true },
  { id: "add_staff", label: "Add test staff (optional)", homeDaycare: false, center: true, optional: true },
  { id: "children_guardians", label: "Add children and guardians", homeDaycare: true, center: true },
  { id: "daily_tools", label: "Choose frequently used daily tools", homeDaycare: true, center: true },
  { id: "forms_records", label: "Choose forms and records", homeDaycare: true, center: true },
  { id: "preview_experiences", label: "Preview teacher and family experiences", homeDaycare: true, center: true, optional: true },
  { id: "finish_later", label: "Finish later", homeDaycare: true, center: true, optional: true },
]);

const SEARCH_TYPES = Object.freeze([
  "children", "staff", "classrooms", "activities", "lesson_plans",
  "forms", "documents", "messages", "invoices", "records", "tasks",
]);

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureProductivityStore(store) {
  if (!store || typeof store !== "object") throw new Error("store required");
  if (!store.providerProductivity || typeof store.providerProductivity !== "object") {
    store.providerProductivity = {
      preferences: {},
      interests: {},
      suggestions: {},
      savedIdeas: {},
      planEntries: {},
      whatHappened: {},
      activityMeta: {},
      favorites: {},
      recent: {},
      setupProgress: {},
      quickActions: {},
      filterMemory: {},
      notificationPrefs: {},
      scanJobs: {},
      undoStack: {},
      history: [],
    };
  }
  const pp = store.providerProductivity;
  for (const key of [
    "preferences", "interests", "suggestions", "savedIdeas", "planEntries",
    "whatHappened", "activityMeta", "favorites", "recent", "setupProgress",
    "quickActions", "filterMemory", "notificationPrefs", "scanJobs", "undoStack",
  ]) {
    if (!pp[key] || typeof pp[key] !== "object") pp[key] = {};
  }
  if (!Array.isArray(pp.history)) pp.history = [];
  return pp;
}

function normalizePlanningPreference(value) {
  const key = cleanText(value, 80);
  if (Object.values(PLANNING_PREFERENCES).includes(key)) return key;
  return PLANNING_PREFERENCES.NOT_SURE_YET;
}

function getOrgPreference(store, organizationId) {
  const pp = ensureProductivityStore(store);
  const existing = pp.preferences[organizationId];
  if (existing) return existing;
  return {
    organizationId,
    planningPreference: PLANNING_PREFERENCES.NOT_SURE_YET,
    lessonPlansOptional: true,
    programStyle: "unknown",
    updatedAt: null,
  };
}

function setOrgPreference(store, organizationId, patch = {}) {
  const pp = ensureProductivityStore(store);
  const current = getOrgPreference(store, organizationId);
  const next = {
    ...current,
    organizationId,
    planningPreference: normalizePlanningPreference(patch.planningPreference ?? current.planningPreference),
    lessonPlansOptional: true,
    programStyle: cleanText(patch.programStyle ?? current.programStyle, 40) || "unknown",
    updatedAt: nowIso(),
  };
  pp.preferences[organizationId] = next;
  appendHistory(pp, { type: "preference_updated", organizationId, planningPreference: next.planningPreference });
  return next;
}

function shortcutsForPreference(preference) {
  const pref = normalizePlanningPreference(preference);
  return {
    showLessonPlans: true,
    lessonPlansOptional: true,
    emphasizeActivities: pref !== PLANNING_PREFERENCES.STRUCTURED_LESSON_PLANS,
    emphasizeChildLed: pref === PLANNING_PREFERENCES.CHILD_LED_PLAY_BASED || pref === PLANNING_PREFERENCES.MIXED_FLEXIBLE,
    emphasizeWeeklyActivities: pref === PLANNING_PREFERENCES.WEEKLY_ACTIVITY_PLANNING || pref === PLANNING_PREFERENCES.MIXED_FLEXIBLE,
    suggestedHomePanel: pref === PLANNING_PREFERENCES.CHILD_LED_PLAY_BASED
      ? "child_led"
      : pref === PLANNING_PREFERENCES.WEEKLY_ACTIVITY_PLANNING
        ? "activities"
        : pref === PLANNING_PREFERENCES.STRUCTURED_LESSON_PLANS
          ? "lesson_plans"
          : "mixed",
  };
}

function createInterestRecord({
  organizationId, childIds = [], classroomId = "", note = "", theme = "", nextStep = "", createdBy = "",
} = {}) {
  return {
    id: newId("ppi"),
    organizationId,
    childIds: (Array.isArray(childIds) ? childIds : []).map((c) => cleanText(c, 80)).filter(Boolean).slice(0, 40),
    classroomId: cleanText(classroomId, 80),
    note: cleanText(note, 800),
    theme: PLAY_THEMES.includes(theme) ? theme : cleanText(theme, 80),
    nextStep: cleanText(nextStep, 400),
    status: "open",
    createdBy: cleanText(createdBy, 120),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

/** Local curated ideas — never calls live AI. Provider must review before save. */
function generatePlaySuggestions(interest) {
  const theme = interest?.theme || "open_ended_play";
  const note = interest?.note || "children's current interests";
  const catalog = {
    loose_parts: [
      { title: "Loose parts tray", prompt: "Offer bowls, lids, fabric, and stones near where children already play. Watch what they build." },
      { title: "Sorting by feel", prompt: "Set out smooth and rough pieces. Listen to the words children use." },
    ],
    open_ended_play: [
      { title: "Follow the block story", prompt: "Sit nearby while children build. Ask one open question only if invited." },
      { title: "Role-play corner refresh", prompt: "Add one everyday prop that matches what you heard children talking about." },
    ],
    outdoor_exploration: [
      { title: "Nature walk notice", prompt: "Walk slowly outdoors. Collect only what children choose to notice together." },
      { title: "Mud kitchen invitation", prompt: "Place bowls and spoons near soil or sand. Stay available, not directing." },
    ],
    sensory_experiences: [
      { title: "Water scoop station", prompt: "Offer cups and funnels. Narrate softly only what children do." },
      { title: "Texture board", prompt: "Invite touching cloth, wood, and paper. Follow their curiosity." },
    ],
    invitations_to_play: [
      { title: "Quiet invitation table", prompt: "Arrange materials without a script. Let children arrive on their own." },
    ],
    practical_life: [
      { title: "Everyday care jobs", prompt: "Invite helping with real care of the space — wiping, sorting, tidying together." },
    ],
    gardening: [
      { title: "Water the plants", prompt: "Children water with small cans. Notice what they observe growing." },
      { title: "Seed sorting", prompt: "Sort seeds by size before planting. Keep it playful, not a worksheet." },
    ],
    preparing_serving_food: [
      { title: "Snack prep helpers", prompt: "Wash fruit or set plates together. Celebrate independence, not perfection." },
    ],
    washing_drying_up: [
      { title: "Wash and dry cups", prompt: "Offer a low basin and towels. Stay close for safety, step back for independence." },
    ],
    cleaning_caring_environment: [
      { title: "Care for our room", prompt: "Wipe tables or sweep together after play. Frame it as caring, not chores." },
    ],
    sorting_washing: [
      { title: "Sort the washing", prompt: "Match socks or fold cloths. Talk about colors and sizes children notice." },
    ],
    independence_self_help: [
      { title: "Coat and shoe practice", prompt: "Allow extra time for dressing. Offer help only when asked." },
    ],
  };
  const ideas = catalog[theme] || catalog.open_ended_play;
  return ideas.map((idea, index) => ({
    id: newId("ppsug"),
    interestId: interest?.id || "",
    organizationId: interest?.organizationId || "",
    title: idea.title,
    prompt: `${idea.prompt} Inspired by: ${cleanText(note, 120)}.`,
    theme,
    source: "local_catalog",
    liveAiUsed: false,
    requiresProviderReview: true,
    reviewed: false,
    saved: false,
    createdAt: nowIso(),
    rank: index + 1,
  }));
}

function createPlanEntry({
  organizationId, activityId = "", suggestionId = "", interestId = "", title = "",
  target = "today", childIds = [], classroomId = "", initiationMode = INITIATION_MODES.CHILD_INITIATED, createdBy = "",
} = {}) {
  return {
    id: newId("ppe"),
    organizationId,
    activityId: cleanText(activityId, 80),
    suggestionId: cleanText(suggestionId, 80),
    interestId: cleanText(interestId, 80),
    title: cleanText(title, 200),
    target: ["today", "weekly", "next_step"].includes(target) ? target : "today",
    childIds: (Array.isArray(childIds) ? childIds : []).map((c) => cleanText(c, 80)).filter(Boolean).slice(0, 40),
    classroomId: cleanText(classroomId, 80),
    initiationMode: Object.values(INITIATION_MODES).includes(initiationMode) ? initiationMode : INITIATION_MODES.CHILD_INITIATED,
    formalLessonPlanRequired: false,
    createdBy: cleanText(createdBy, 120),
    createdAt: nowIso(),
  };
}

function createWhatHappened({
  organizationId, planEntryId = "", interestId = "", note = "", childIds = [], createdBy = "",
} = {}) {
  return {
    id: newId("pph"),
    organizationId,
    planEntryId: cleanText(planEntryId, 80),
    interestId: cleanText(interestId, 80),
    note: cleanText(note, 1000),
    childIds: (Array.isArray(childIds) ? childIds : []).map((c) => cleanText(c, 80)).filter(Boolean).slice(0, 40),
    formalLessonPlanRequired: false,
    createdBy: cleanText(createdBy, 120),
    createdAt: nowIso(),
  };
}

function activityCatalogSeed() {
  return [
    { id: "act_loose_parts_tray", title: "Loose parts tray", age: "Toddler–Preschool", interest: "building", skill: "fine motor", setting: "indoor", indoorOutdoor: "indoor", timeMinutes: 15, materials: "bowls, lids, fabric, stones", adultInvolvement: "low", prep: "low", everydayMaterials: true, themes: ["loose_parts", "open_ended_play"], developmentalResult: "exploration" },
    { id: "act_mud_kitchen", title: "Mud kitchen invitation", age: "Toddler–Preschool", interest: "outdoors", skill: "sensory", setting: "outdoor", indoorOutdoor: "outdoor", timeMinutes: 20, materials: "bowls, spoons, soil or sand", adultInvolvement: "available", prep: "low", everydayMaterials: true, themes: ["outdoor_exploration", "invitations_to_play"], developmentalResult: "sensory" },
    { id: "act_snack_prep", title: "Snack prep helpers", age: "Preschool", interest: "food", skill: "independence", setting: "indoor", indoorOutdoor: "indoor", timeMinutes: 10, materials: "fruit, plates, child-safe tools", adultInvolvement: "nearby", prep: "low", everydayMaterials: true, themes: ["preparing_serving_food", "practical_life"], developmentalResult: "self_help" },
    { id: "act_plant_water", title: "Water the plants", age: "Toddler–Preschool", interest: "gardening", skill: "care", setting: "indoor or outdoor", indoorOutdoor: "both", timeMinutes: 10, materials: "small watering can", adultInvolvement: "low", prep: "low", everydayMaterials: true, themes: ["gardening", "independence_self_help"], developmentalResult: "responsibility" },
    { id: "act_wash_cups", title: "Wash and dry cups", age: "Preschool", interest: "helping", skill: "practical life", setting: "indoor", indoorOutdoor: "indoor", timeMinutes: 15, materials: "basin, towel, cups", adultInvolvement: "nearby", prep: "low", everydayMaterials: true, themes: ["washing_drying_up", "practical_life"], developmentalResult: "self_help" },
    { id: "act_sort_washing", title: "Sort the washing", age: "Toddler–Preschool", interest: "helping", skill: "matching", setting: "indoor", indoorOutdoor: "indoor", timeMinutes: 10, materials: "cloths or socks", adultInvolvement: "low", prep: "low", everydayMaterials: true, themes: ["sorting_washing", "independence_self_help"], developmentalResult: "classification" },
  ];
}

function filterActivities(activities, filters = {}) {
  const q = cleanText(filters.q, 80).toLowerCase();
  return (activities || []).filter((act) => {
    if (filters.age && !String(act.age || "").toLowerCase().includes(String(filters.age).toLowerCase())) return false;
    if (filters.interest && !String(act.interest || "").toLowerCase().includes(String(filters.interest).toLowerCase())) return false;
    if (filters.skill && !String(act.skill || "").toLowerCase().includes(String(filters.skill).toLowerCase())) return false;
    if (filters.setting && !String(act.setting || "").toLowerCase().includes(String(filters.setting).toLowerCase())) return false;
    if (filters.indoorOutdoor && filters.indoorOutdoor !== "any") {
      const io = String(act.indoorOutdoor || "");
      if (filters.indoorOutdoor !== io && io !== "both") return false;
    }
    if (filters.timeMinutes && Number(act.timeMinutes) > Number(filters.timeMinutes)) return false;
    if (filters.adultInvolvement && !String(act.adultInvolvement || "").includes(String(filters.adultInvolvement))) return false;
    if (filters.everydayMaterials === true && act.everydayMaterials !== true) return false;
    if (filters.prep && filters.prep !== act.prep) return false;
    if (filters.developmentalResult && act.developmentalResult !== filters.developmentalResult) return false;
    if (q) {
      const hay = [act.title, act.materials, act.interest, act.skill, ...(act.themes || [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function activitiesForSameResult(activities, developmentalResult) {
  return (activities || []).filter((a) => a.developmentalResult === developmentalResult);
}

function toggleFavorite(store, { organizationId, userKey, itemType, itemId }) {
  const pp = ensureProductivityStore(store);
  const key = `${organizationId}::${userKey}`;
  if (!pp.favorites[key]) pp.favorites[key] = [];
  const list = pp.favorites[key];
  const existing = list.findIndex((f) => f.itemType === itemType && f.itemId === itemId);
  if (existing >= 0) {
    list.splice(existing, 1);
    return { favorited: false, favorites: list };
  }
  list.unshift({ itemType, itemId, at: nowIso() });
  pp.favorites[key] = list.slice(0, 50);
  pushRecent(store, { organizationId, userKey, itemType, itemId });
  return { favorited: true, favorites: pp.favorites[key] };
}

function pushRecent(store, { organizationId, userKey, itemType, itemId }) {
  const pp = ensureProductivityStore(store);
  const key = `${organizationId}::${userKey}`;
  if (!pp.recent[key]) pp.recent[key] = [];
  pp.recent[key] = [
    { itemType, itemId, at: nowIso() },
    ...pp.recent[key].filter((r) => !(r.itemType === itemType && r.itemId === itemId)),
  ].slice(0, 30);
  return pp.recent[key];
}

function getFavorites(store, organizationId, userKey) {
  return ensureProductivityStore(store).favorites[`${organizationId}::${userKey}`] || [];
}

function getRecent(store, organizationId, userKey) {
  return ensureProductivityStore(store).recent[`${organizationId}::${userKey}`] || [];
}

function setupStepsForProgram(programStyle = "home_daycare") {
  const isHome = ["home_daycare", "solo", "childminder"].includes(programStyle);
  return SETUP_STEPS.filter((step) => (isHome ? step.homeDaycare : step.center));
}

function getSetupProgress(store, organizationId) {
  const pp = ensureProductivityStore(store);
  return pp.setupProgress[organizationId] || {
    organizationId, programStyle: "home_daycare", completedStepIds: [], skippedStepIds: [], status: "not_started", updatedAt: null,
  };
}

function updateSetupProgress(store, organizationId, patch = {}) {
  const pp = ensureProductivityStore(store);
  const current = getSetupProgress(store, organizationId);
  const programStyle = cleanText(patch.programStyle ?? current.programStyle, 40) || "home_daycare";
  const completed = new Set(current.completedStepIds || []);
  const skipped = new Set(current.skippedStepIds || []);
  if (patch.completeStepId) { completed.add(cleanText(patch.completeStepId, 80)); skipped.delete(cleanText(patch.completeStepId, 80)); }
  if (patch.skipStepId) skipped.add(cleanText(patch.skipStepId, 80));
  if (Array.isArray(patch.completedStepIds)) patch.completedStepIds.forEach((id) => completed.add(cleanText(id, 80)));
  const steps = setupStepsForProgram(programStyle);
  const required = steps.filter((s) => !s.optional).map((s) => s.id);
  const doneRequired = required.every((id) => completed.has(id) || skipped.has(id));
  const next = {
    organizationId, programStyle,
    completedStepIds: [...completed], skippedStepIds: [...skipped],
    status: patch.finishLater ? "saved_for_later" : doneRequired ? "ready" : (completed.size || skipped.size) ? "in_progress" : "not_started",
    updatedAt: nowIso(),
  };
  pp.setupProgress[organizationId] = next;
  appendHistory(pp, { type: "setup_updated", organizationId, status: next.status });
  return {
    ...next,
    steps: steps.map((step) => ({ ...step, completed: completed.has(step.id), skipped: skipped.has(step.id) })),
    progressPercent: Math.round(((completed.size + skipped.size) / Math.max(steps.length, 1)) * 100),
  };
}

function defaultNotificationPrefs(organizationId, userKey) {
  return {
    organizationId, userKey, groupRelated: true, avoidDuplicates: true, summaryMode: "daily", showUrgentSeparately: true,
    categories: { attendance: true, forms: true, messages: true, billing: false, licensing: true, childLedIdeas: true },
    outboundEmail: false, outboundSms: false, outboundPush: false, updatedAt: null,
  };
}

function getNotificationPrefs(store, organizationId, userKey) {
  const key = `${organizationId}::${userKey}`;
  return ensureProductivityStore(store).notificationPrefs[key] || defaultNotificationPrefs(organizationId, userKey);
}

function setNotificationPrefs(store, organizationId, userKey, patch = {}) {
  const pp = ensureProductivityStore(store);
  const key = `${organizationId}::${userKey}`;
  const current = getNotificationPrefs(store, organizationId, userKey);
  const next = {
    ...current, ...patch, organizationId, userKey,
    outboundEmail: false, outboundSms: false, outboundPush: false,
    categories: { ...current.categories, ...(patch.categories || {}) },
    updatedAt: nowIso(),
  };
  pp.notificationPrefs[key] = next;
  return next;
}

function groupNotifications(items = [], prefs = {}) {
  const urgent = []; const general = []; const seen = new Set();
  for (const item of (Array.isArray(items) ? items : [])) {
    const dedupeKey = cleanText(item.dedupeKey || `${item.category}:${item.title}`, 200);
    if (prefs.avoidDuplicates !== false && seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    (item.urgent ? urgent : general).push(item);
  }
  return { urgent, general, summaryMode: prefs.summaryMode || "daily", outboundDisabled: true };
}

function rememberFilter(store, organizationId, userKey, surface, filters) {
  const pp = ensureProductivityStore(store);
  const key = `${organizationId}::${userKey}::${surface}`;
  pp.filterMemory[key] = { filters: filters || {}, updatedAt: nowIso() };
  return pp.filterMemory[key];
}

function getRememberedFilter(store, organizationId, userKey, surface) {
  return ensureProductivityStore(store).filterMemory[`${organizationId}::${userKey}::${surface}`] || null;
}

function createScanJob({ organizationId, fileName = "fake-scan.jpg", createdBy = "" } = {}) {
  return {
    id: newId("ppscan"), organizationId,
    fileName: cleanText(fileName, 120) || "fake-scan.jpg",
    fakeOnly: true, status: "stored_fake",
    createdBy: cleanText(createdBy, 120), createdAt: nowIso(),
    note: "Fake file only — no real camera upload or cloud OCR in Phase 21.",
  };
}

function pushUndo(store, organizationId, action) {
  const pp = ensureProductivityStore(store);
  if (!pp.undoStack[organizationId]) pp.undoStack[organizationId] = [];
  pp.undoStack[organizationId].unshift({ id: newId("ppundo"), ...action, at: nowIso() });
  pp.undoStack[organizationId] = pp.undoStack[organizationId].slice(0, 20);
  return pp.undoStack[organizationId][0];
}

function popUndo(store, organizationId) {
  const pp = ensureProductivityStore(store);
  const stack = pp.undoStack[organizationId] || [];
  const item = stack.shift();
  pp.undoStack[organizationId] = stack;
  return item || null;
}

function appendHistory(pp, entry) {
  pp.history = [{ id: newId("pphist"), at: nowIso(), ...entry }, ...(pp.history || [])].slice(0, 200);
}

function universalSearch(store, {
  organizationId, role = "director", query = "", allowedTypes = SEARCH_TYPES,
  membershipClassroomIds = null, guardianChildIds = null,
} = {}) {
  const q = cleanText(query, 80).toLowerCase();
  if (!q || q.length < 2) return { ok: true, query: q, groups: [], truncated: false };

  const roleKey = cleanText(role, 40).toLowerCase();
  const isDirector = ["director", "owner", "director_owner", "admin"].includes(roleKey);
  const isTeacher = ["lead_teacher", "teacher", "assistant", "assistant_staff"].includes(roleKey);
  const isGuardian = ["parent", "guardian", "parent_guardian"].includes(roleKey);

  const permitted = new Set();
  for (const type of allowedTypes) {
    if (!SEARCH_TYPES.includes(type)) continue;
    if (type === "invoices" && !isDirector) continue;
    if (type === "staff" && isGuardian) continue;
    if (isGuardian && !["children", "forms", "documents", "messages", "records", "tasks", "activities"].includes(type)) continue;
    permitted.add(type);
  }

  const groups = [];
  const match = (text) => String(text || "").toLowerCase().includes(q);

  if (permitted.has("children")) {
    const children = listValues(store.children || store.previewChildren || {})
      .filter((c) => c.organizationId === organizationId)
      .filter((c) => {
        if (isGuardian && Array.isArray(guardianChildIds)) return guardianChildIds.includes(c.id);
        if (isTeacher && Array.isArray(membershipClassroomIds) && c.classroomId) return membershipClassroomIds.includes(c.classroomId);
        return isDirector || isTeacher || isGuardian;
      })
      .filter((c) => match(c.displayName || c.firstName || c.name || c.id))
      .slice(0, 8)
      .map((c) => ({ id: c.id, title: c.displayName || c.firstName || c.name || c.id, type: "children" }));
    if (children.length) groups.push({ type: "children", results: children });
  }

  if (permitted.has("staff") && !isGuardian) {
    const staff = listValues(store.staffPreviewRecords || store.staff || {})
      .filter((s) => s.organizationId === organizationId)
      .filter((s) => match(s.displayName || s.name || s.email || s.id))
      .slice(0, 8)
      .map((s) => ({ id: s.id, title: s.displayName || s.name || s.email || s.id, type: "staff" }));
    if (staff.length) groups.push({ type: "staff", results: staff });
  }

  if (permitted.has("classrooms") && !isGuardian) {
    const rooms = listValues(store.classrooms || {})
      .filter((r) => r.organizationId === organizationId && !r.archivedAt)
      .filter((r) => !(isTeacher && Array.isArray(membershipClassroomIds)) || membershipClassroomIds.includes(r.id))
      .filter((r) => match(r.name || r.label || r.id))
      .slice(0, 8)
      .map((r) => ({ id: r.id, title: r.name || r.label || r.id, type: "classrooms" }));
    if (rooms.length) groups.push({ type: "classrooms", results: rooms });
  }

  if (permitted.has("activities")) {
    const acts = filterActivities(activityCatalogSeed(), { q }).slice(0, 8)
      .map((a) => ({ id: a.id, title: a.title, type: "activities" }));
    if (acts.length) groups.push({ type: "activities", results: acts });
  }

  if (permitted.has("lesson_plans") && !isGuardian) {
    const plans = listValues(store.siteContent?.curriculum?.lessonPlans || {})
      .filter((p) => match(p.title || p.id)).slice(0, 8)
      .map((p) => ({ id: p.id, title: p.title || p.id, type: "lesson_plans" }));
    if (plans.length) groups.push({ type: "lesson_plans", results: plans });
  }

  if (permitted.has("forms")) {
    const forms = listValues(store.formsCenter?.forms || store.formDefinitions || {})
      .filter((f) => !f.organizationId || f.organizationId === organizationId)
      .filter((f) => match(f.title || f.name || f.id)).slice(0, 8)
      .map((f) => ({ id: f.id, title: f.title || f.name || f.id, type: "forms" }));
    if (forms.length) groups.push({ type: "forms", results: forms });
  }

  if (permitted.has("tasks")) {
    const tasks = listValues(store.todayHub?.tasks || {})
      .filter((t) => t.organizationId === organizationId)
      .filter((t) => match(t.title || t.label || t.id)).slice(0, 8)
      .map((t) => ({ id: t.id, title: t.title || t.label || t.id, type: "tasks" }));
    if (tasks.length) groups.push({ type: "tasks", results: tasks });
  }

  if (permitted.has("records")) {
    const records = listValues(store.recordsCenter?.records || {})
      .filter((r) => r.organizationId === organizationId)
      .filter((r) => !(isGuardian && Array.isArray(guardianChildIds) && r.childId) || guardianChildIds.includes(r.childId))
      .filter((r) => match(r.title || r.label || r.id)).slice(0, 8)
      .map((r) => ({ id: r.id, title: r.title || r.label || r.id, type: "records" }));
    if (records.length) groups.push({ type: "records", results: records });
  }

  if (permitted.has("invoices") && isDirector) {
    const invoices = listValues(store.billingSimulator?.invoices || {})
      .filter((inv) => inv.organizationId === organizationId)
      .filter((inv) => match(inv.label || inv.id || inv.familyName)).slice(0, 8)
      .map((inv) => ({ id: inv.id, title: inv.label || inv.familyName || inv.id, type: "invoices" }));
    if (invoices.length) groups.push({ type: "invoices", results: invoices });
  }

  return {
    ok: true, query: q, groups, truncated: false,
    permissionNote: "Results respect role, organization, classroom, child, and feature permissions.",
  };
}

function quickActionsForRole(role, preference) {
  const pref = normalizePlanningPreference(preference);
  const actions = [
    { id: "mark_attendance", label: "Mark attendance", phone: true },
    { id: "add_observation", label: "Record interest / observation", phone: true },
    { id: "browse_activities", label: "Browse activities", phone: true },
    { id: "open_search", label: "Search", phone: true },
    { id: "open_favorites", label: "Favorites", phone: true },
  ];
  if (pref === PLANNING_PREFERENCES.CHILD_LED_PLAY_BASED || pref === PLANNING_PREFERENCES.MIXED_FLEXIBLE) {
    actions.unshift({ id: "child_led_flow", label: "Child-led ideas", phone: true });
  }
  if (pref === PLANNING_PREFERENCES.STRUCTURED_LESSON_PLANS) {
    actions.push({ id: "open_lesson_plans", label: "Lesson plans (optional)", phone: false });
  }
  const roleKey = cleanText(role, 40).toLowerCase();
  if (["director", "owner", "director_owner"].includes(roleKey)) {
    actions.push({ id: "guided_setup", label: "Guided setup", phone: false, computerRecommended: true });
    actions.push({ id: "bulk_assign", label: "Bulk assign", phone: false, computerRecommended: true });
  }
  return actions;
}

function phoneSummary(store, organizationId) {
  const pref = getOrgPreference(store, organizationId);
  const setup = getSetupProgress(store, organizationId);
  return {
    featureMarker: PHONE_MARKER,
    computerRecommended: false,
    headline: "Child-led & activity tools work on your phone",
    planningPreference: pref.planningPreference,
    planningLabel: PLANNING_PREFERENCE_LABELS[pref.planningPreference],
    lessonPlansOptional: true,
    setupStatus: setup.status,
    note: "Complex setup and bulk admin are computer-recommended. Daily child-led ideas, activities, search, and favorites stay phone-friendly.",
  };
}

module.exports = {
  TESTING_BANNER, FEATURE_MARKER, PHONE_MARKER,
  PLANNING_PREFERENCES, PLANNING_PREFERENCE_LABELS, PLAY_THEMES, INITIATION_MODES, SETUP_STEPS, SEARCH_TYPES,
  ensureProductivityStore, normalizePlanningPreference, getOrgPreference, setOrgPreference, shortcutsForPreference,
  createInterestRecord, generatePlaySuggestions, createPlanEntry, createWhatHappened,
  activityCatalogSeed, filterActivities, activitiesForSameResult,
  toggleFavorite, pushRecent, getFavorites, getRecent,
  setupStepsForProgram, getSetupProgress, updateSetupProgress,
  getNotificationPrefs, setNotificationPrefs, groupNotifications,
  rememberFilter, getRememberedFilter, createScanJob, pushUndo, popUndo,
  universalSearch, quickActionsForRole, phoneSummary, newId, nowIso, cleanText,
};
