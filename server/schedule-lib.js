/**
 * Unified ScheduleItem helpers (server + shared semantics).
 * Types: lesson_plan, classroom_event, closure, reminder, director_event, family_event.
 * Org/center/classroom IDs are schema-ready but optional for home daycare.
 */

const SCHEDULE_ITEM_TYPES = Object.freeze([
  "lesson_plan",
  "classroom_event",
  "closure",
  "reminder",
  "director_event",
  "family_event",
]);

// Filter/category grouping for the Calendar's show/hide filters. Purely a
// display grouping — does not change storage, lookup, or write behavior.
const SCHEDULE_ITEM_CATEGORIES = Object.freeze({
  lesson_plan: "curriculum",
  classroom_event: "classroom",
  reminder: "classroom",
  closure: "family",
  director_event: "director",
  family_event: "family",
});

function scheduleItemCategory(type) {
  return SCHEDULE_ITEM_CATEGORIES[String(type || "").trim()] || "classroom";
}

const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function clampTime(value) {
  const raw = String(value || "").trim().slice(0, 5);
  return SCHEDULE_TIME_PATTERN.test(raw) ? raw : "";
}

const SCHEDULE_WEEKDAYS = Object.freeze([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
]);

function scheduleRandomId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDailyTeacherNotes() {
  return Object.fromEntries(SCHEDULE_WEEKDAYS.map((day) => [day, ""]));
}

function emptyDailyOps() {
  return Object.fromEntries(
    SCHEDULE_WEEKDAYS.map((day) => [day, { circle: "", activity: "", meal: "", rest: "", support: "", checked: [] }]),
  );
}

function clampString(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function isoDateOnly(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "";
}

function weekEndFromStart(weekStart) {
  const start = isoDateOnly(weekStart);
  if (!start) return "";
  const date = new Date(`${start}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + 4);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeClassroom(entry = {}, index = 0) {
  return {
    id: clampString(entry.id, 80) || (index === 0 ? "classroom-main" : scheduleRandomId("classroom")),
    name: clampString(entry.name, 120) || "Main Classroom",
    organizationId: entry.organizationId ? clampString(entry.organizationId, 80) : null,
    centerId: entry.centerId ? clampString(entry.centerId, 80) : null,
  };
}

function ensureDefaultClassrooms(list) {
  const classrooms = (Array.isArray(list) ? list : []).map(normalizeClassroom).filter((item) => item.id);
  if (!classrooms.length) {
    classrooms.push(normalizeClassroom({ id: "classroom-main", name: "Main Classroom" }));
  }
  return classrooms;
}

function normalizeExecution(raw = {}) {
  const dailyTeacherNotes = emptyDailyTeacherNotes();
  const incoming = raw.dailyTeacherNotes && typeof raw.dailyTeacherNotes === "object" ? raw.dailyTeacherNotes : {};
  SCHEDULE_WEEKDAYS.forEach((day) => {
    dailyTeacherNotes[day] = clampString(incoming[day], 4000);
  });
  const dailyOps = emptyDailyOps();
  const opsIn = raw.dailyOps && typeof raw.dailyOps === "object" ? raw.dailyOps : {};
  SCHEDULE_WEEKDAYS.forEach((day) => {
    const row = opsIn[day] && typeof opsIn[day] === "object" ? opsIn[day] : {};
    dailyOps[day] = {
      circle: clampString(row.circle, 2000),
      activity: clampString(row.activity, 2000),
      meal: clampString(row.meal, 2000),
      rest: clampString(row.rest, 2000),
      support: clampString(row.support, 2000),
      checked: Array.isArray(row.checked)
        ? row.checked.map((id) => clampString(id, 80)).filter(Boolean).slice(0, 100)
        : [],
    };
  });
  return {
    teacherNotes: clampString(raw.teacherNotes, 8000),
    preparationNotes: clampString(raw.preparationNotes, 8000),
    weeklyGoals: clampString(raw.weeklyGoals, 4000),
    weeklyMaterials: clampString(raw.weeklyMaterials, 4000),
    weeklyReminders: clampString(raw.weeklyReminders, 4000),
    dailyTeacherNotes,
    dailyOps,
    observations: (Array.isArray(raw.observations) ? raw.observations : [])
      .filter((item) => item && typeof item === "object")
      .slice(0, 200)
      .map((item) => ({
        id: clampString(item.id, 80) || scheduleRandomId("obs"),
        date: isoDateOnly(item.date),
        dayOfWeek: SCHEDULE_WEEKDAYS.includes(String(item.dayOfWeek || "").toLowerCase())
          ? String(item.dayOfWeek).toLowerCase()
          : "",
        note: clampString(item.note, 4000),
        activityTitle: clampString(item.activityTitle, 200),
        childId: clampString(item.childId, 80),
        childName: clampString(item.childName, 120),
        followUpNeeded: Boolean(item.followUpNeeded),
        createdAt: clampString(item.createdAt, 40),
        updatedAt: clampString(item.updatedAt, 40),
      }))
      .filter((item) => item.note),
  };
}

function normalizeParentPayload(raw = {}) {
  return {
    parentMessage: clampString(raw.parentMessage, 8000),
    visibleEventIds: (Array.isArray(raw.visibleEventIds) ? raw.visibleEventIds : [])
      .map((id) => clampString(id, 80))
      .filter(Boolean)
      .slice(0, 200),
  };
}

function normalizeScheduleItem(raw = {}) {
  const type = SCHEDULE_ITEM_TYPES.includes(String(raw.type || "").trim())
    ? String(raw.type).trim()
    : "classroom_event";
  const weekStartDate = isoDateOnly(raw.weekStartDate) || isoDateOnly(raw.startDate);
  const startDate = isoDateOnly(raw.startDate) || weekStartDate;
  const endDate = isoDateOnly(raw.endDate) || (type === "lesson_plan" ? weekEndFromStart(weekStartDate || startDate) : startDate);
  const now = new Date().toISOString();
  const allDay = raw.allDay !== false;
  const base = {
    id: clampString(raw.id, 80) || scheduleRandomId("sch"),
    type,
    category: scheduleItemCategory(type),
    organizationId: raw.organizationId ? clampString(raw.organizationId, 80) : null,
    centerId: raw.centerId ? clampString(raw.centerId, 80) : null,
    classroomId: clampString(raw.classroomId, 80) || "classroom-main",
    title: clampString(raw.title || raw.lessonPlanTitle, 200),
    startDate,
    endDate,
    weekStartDate: weekStartDate || startDate,
    allDay,
    // Optional timed-block fields (schema-ready; Phase A UI only surfaces these
    // for day-scoped manual items, never for lesson_plan week assignments).
    startTime: allDay ? "" : clampTime(raw.startTime),
    endTime: allDay ? "" : clampTime(raw.endTime),
    notes: clampString(raw.notes, 4000),
    colorTag: clampString(raw.colorTag, 40),
    createdAt: clampString(raw.createdAt, 40) || now,
    updatedAt: clampString(raw.updatedAt, 40) || now,
    assignedBy: clampString(raw.assignedBy, 200),
  };

  if (type === "lesson_plan") {
    return {
      ...base,
      title: clampString(raw.lessonPlanTitle || raw.title, 200) || "Untitled Lesson Plan",
      lessonPlanId: clampString(raw.lessonPlanId, 120),
      lessonPlanTitle: clampString(raw.lessonPlanTitle || raw.title, 200) || "Untitled Lesson Plan",
      lessonPlanPlan: clampString(raw.lessonPlanPlan, 20) || "Free",
      lessonPlanUpdatedAt: clampString(raw.lessonPlanUpdatedAt, 40),
      ageGroup: clampString(raw.ageGroup, 40) || "Preschool",
      snapshot: raw.snapshot && typeof raw.snapshot === "object"
        ? JSON.parse(JSON.stringify(raw.snapshot))
        : null,
      execution: normalizeExecution(raw.execution || {}),
      parent: normalizeParentPayload(raw.parent || {}),
    };
  }

  const nonLessonTitleFallback = {
    closure: "Closure",
    reminder: "Reminder",
    director_event: "Director Item",
    family_event: "Family Event",
  };
  return {
    ...base,
    title: base.title || nonLessonTitleFallback[type] || "Classroom Event",
    eventType: clampString(raw.eventType, 80),
    description: clampString(raw.description || raw.notes, 4000),
    itemsToBring: clampString(raw.itemsToBring, 2000),
    // Optional on non-lesson items (e.g. an "Infant nap training" director item,
    // or "Preschool Picture Day"); empty means "applies to everyone."
    ageGroup: clampString(raw.ageGroup, 40),
  };
}

function mapLegacyEventType(eventType) {
  const value = String(eventType || "").trim();
  if (value === "School Closure") return "closure";
  if (value === "Important Reminder") return "reminder";
  return "classroom_event";
}

function curriculumAssignmentToScheduleItems(assignment = {}, options = {}) {
  const classroomId = options.classroomId || "classroom-main";
  const weekStart = isoDateOnly(assignment.weekStartDate);
  if (!weekStart) return [];
  const items = [];
  const lessonId = clampString(assignment.id, 80) || scheduleRandomId("sch");
  items.push(normalizeScheduleItem({
    id: lessonId,
    type: "lesson_plan",
    classroomId,
    weekStartDate: weekStart,
    startDate: weekStart,
    endDate: weekEndFromStart(weekStart),
    lessonPlanId: assignment.lessonPlanId,
    lessonPlanTitle: assignment.lessonPlanTitle,
    lessonPlanPlan: assignment.lessonPlanPlan,
    lessonPlanUpdatedAt: assignment.lessonPlanUpdatedAt,
    ageGroup: assignment.ageGroup,
    snapshot: assignment.snapshot,
    assignedBy: assignment.assignedBy,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    organizationId: assignment.organizationId || null,
    classroomId: assignment.classroomId || classroomId,
    execution: {
      teacherNotes: assignment.teacherNotes,
      preparationNotes: assignment.preparationNotes,
      dailyTeacherNotes: assignment.dailyTeacherNotes,
      observations: assignment.observations,
    },
    parent: {
      parentMessage: assignment.parentCalendar?.parentMessage || "",
      visibleEventIds: [],
    },
  }));

  const events = Array.isArray(assignment.parentCalendar?.classroomEvents)
    ? assignment.parentCalendar.classroomEvents
    : [];
  events.forEach((event) => {
    const type = mapLegacyEventType(event.eventType);
    const eventId = clampString(event.id, 80) || scheduleRandomId("sch");
    items.push(normalizeScheduleItem({
      id: eventId,
      type,
      classroomId: assignment.classroomId || classroomId,
      title: event.title || event.eventType,
      eventType: event.eventType,
      startDate: event.date || weekStart,
      endDate: event.date || weekStart,
      weekStartDate: weekStart,
      description: event.description,
      itemsToBring: event.itemsToBring,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }));
    const lesson = items[0];
    if (lesson?.parent) {
      lesson.parent.visibleEventIds = [...(lesson.parent.visibleEventIds || []), eventId];
    }
  });
  return items;
}

function mergeWeeklyPlannerIntoLessonItem(item, planner = {}) {
  if (!item || item.type !== "lesson_plan") return item;
  const execution = normalizeExecution(item.execution || {});
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  dayNames.forEach((label, index) => {
    const key = SCHEDULE_WEEKDAYS[index];
    const row = planner.days?.[label] || {};
    execution.dailyOps[key] = {
      ...execution.dailyOps[key],
      circle: clampString(row.circle, 2000) || execution.dailyOps[key].circle,
      activity: clampString(row.activity, 2000) || execution.dailyOps[key].activity,
      meal: clampString(row.meal, 2000),
      rest: clampString(row.rest, 2000),
      support: clampString(row.support, 2000),
      checked: execution.dailyOps[key].checked || [],
    };
  });
  if (!execution.teacherNotes && planner.notes) {
    execution.teacherNotes = clampString(planner.notes, 8000);
  }
  return normalizeScheduleItem({ ...item, execution });
}

function normalizeScheduleDocument(raw = {}) {
  const classrooms = ensureDefaultClassrooms(raw.classrooms);
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizeScheduleItem)
    .filter((item) => item.id && item.startDate)
    .slice(0, 2000);
  items.sort((a, b) => `${a.startDate}-${a.type}-${a.title}`.localeCompare(`${b.startDate}-${b.type}-${b.title}`));
  return {
    classrooms,
    items,
    updatedAt: clampString(raw.updatedAt, 40) || "",
    schemaVersion: 1,
  };
}

function filterScheduleItems(items, query = {}) {
  const list = Array.isArray(items) ? items : [];
  const from = isoDateOnly(query.from);
  const to = isoDateOnly(query.to);
  const classroomId = clampString(query.classroomId, 80);
  const types = String(query.types || "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => SCHEDULE_ITEM_TYPES.includes(part));
  return list.filter((item) => {
    if (classroomId && item.classroomId !== classroomId) return false;
    if (types.length && !types.includes(item.type)) return false;
    if (from && item.endDate < from) return false;
    if (to && item.startDate > to) return false;
    return true;
  });
}

function lessonPlanItemForWeek(items, weekStartDate, classroomId = "classroom-main") {
  const week = isoDateOnly(weekStartDate);
  return (Array.isArray(items) ? items : []).find(
    (item) => item.type === "lesson_plan"
      && item.weekStartDate === week
      && (!classroomId || item.classroomId === classroomId),
  ) || null;
}

function upsertScheduleItem(doc, item) {
  const next = normalizeScheduleDocument(doc);
  const normalized = normalizeScheduleItem(item);
  next.items = next.items.filter((entry) => entry.id !== normalized.id);
  if (normalized.type === "lesson_plan" && normalized.weekStartDate) {
    next.items = next.items.filter(
      (entry) => !(
        entry.type === "lesson_plan"
        && entry.weekStartDate === normalized.weekStartDate
        && entry.classroomId === normalized.classroomId
        && entry.id !== normalized.id
      ),
    );
  }
  next.items.push(normalized);
  next.items.sort((a, b) => `${a.startDate}-${a.type}-${a.title}`.localeCompare(`${b.startDate}-${b.type}-${b.title}`));
  next.updatedAt = new Date().toISOString();
  return { doc: next, item: normalized };
}

function deleteScheduleItem(doc, itemId) {
  const next = normalizeScheduleDocument(doc);
  const id = clampString(itemId, 80);
  next.items = next.items.filter((entry) => entry.id !== id);
  next.updatedAt = new Date().toISOString();
  return next;
}

function migrateCurriculumAssignmentsToSchedule(payload = {}) {
  const classrooms = ensureDefaultClassrooms(payload.classrooms);
  const classroomId = classrooms[0].id;
  if (payload.classrooms?.[0]?.name || payload.classroomLabel) {
    classrooms[0].name = clampString(payload.classrooms?.[0]?.name || payload.classroomLabel, 120) || classrooms[0].name;
  }
  let items = [];
  const assignments = Array.isArray(payload.curriculumAssignments) ? payload.curriculumAssignments : [];
  assignments.forEach((assignment) => {
    items = items.concat(curriculumAssignmentToScheduleItems(assignment, { classroomId }));
  });
  const planner = payload.weeklyPlanner && typeof payload.weeklyPlanner === "object" ? payload.weeklyPlanner : null;
  if (planner?.weekOf && planner?.resourceId) {
    const match = items.find(
      (item) => item.type === "lesson_plan"
        && item.weekStartDate === isoDateOnly(planner.weekOf)
        && item.lessonPlanId === clampString(planner.resourceId, 120),
    );
    if (match) {
      const merged = mergeWeeklyPlannerIntoLessonItem(match, planner);
      items = items.map((item) => (item.id === match.id ? merged : item));
    }
  }
  return normalizeScheduleDocument({
    classrooms,
    items,
    updatedAt: new Date().toISOString(),
  });
}

function scheduleItemToLegacyAssignment(item) {
  if (!item || item.type !== "lesson_plan") return null;
  return {
    id: item.id.startsWith("cwa-") ? item.id : item.id.replace(/^sch-/, "cwa-"),
    weekStartDate: item.weekStartDate,
    ageGroup: item.ageGroup,
    classroomLabel: "",
    lessonPlanId: item.lessonPlanId,
    lessonPlanTitle: item.lessonPlanTitle,
    lessonPlanPlan: item.lessonPlanPlan,
    lessonPlanUpdatedAt: item.lessonPlanUpdatedAt,
    snapshot: item.snapshot,
    organizationId: item.organizationId,
    classroomId: item.classroomId,
    assignedBy: item.assignedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    teacherNotes: item.execution?.teacherNotes || "",
    preparationNotes: item.execution?.preparationNotes || "",
    dailyTeacherNotes: item.execution?.dailyTeacherNotes || emptyDailyTeacherNotes(),
    observations: item.execution?.observations || [],
    parentCalendar: {
      parentMessage: item.parent?.parentMessage || "",
      classroomEvents: [],
      updatedAt: item.updatedAt || "",
    },
  };
}

module.exports = {
  SCHEDULE_ITEM_TYPES,
  SCHEDULE_ITEM_CATEGORIES,
  SCHEDULE_WEEKDAYS,
  scheduleItemCategory,
  scheduleRandomId,
  weekEndFromStart,
  isoDateOnly,
  normalizeClassroom,
  ensureDefaultClassrooms,
  normalizeScheduleItem,
  normalizeScheduleDocument,
  filterScheduleItems,
  lessonPlanItemForWeek,
  upsertScheduleItem,
  deleteScheduleItem,
  curriculumAssignmentToScheduleItems,
  migrateCurriculumAssignmentsToSchedule,
  mergeWeeklyPlannerIntoLessonItem,
  scheduleItemToLegacyAssignment,
  emptyDailyOps,
  emptyDailyTeacherNotes,
};
