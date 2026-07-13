/**
 * Little Learner Hub — client ScheduleItem layer
 * Cloud-backed source of truth with local cache + Curriculum Planner dual-write bridge.
 */
(function (global) {
  const SCHEDULE_ITEM_TYPES = ["lesson_plan", "classroom_event", "closure", "reminder"];
  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const PLANNER_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  function clamp(value, max = 2000) {
    return String(value || "").trim().slice(0, max);
  }

  function isoDateOnly(value) {
    const raw = String(value || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }

  function weekStartMonday(value = new Date()) {
    const date = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return isoDateOnly(new Date());
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function weekEndFromStart(weekStart) {
    const start = isoDateOnly(weekStart);
    if (!start) return "";
    const date = new Date(`${start}T12:00:00`);
    date.setDate(date.getDate() + 4);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function randomId(prefix) {
    const bytes = new Uint8Array(6);
    (global.crypto || {}).getRandomValues?.(bytes);
    const hex = bytes.length
      ? Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
      : Math.random().toString(16).slice(2, 14);
    return `${prefix}-${hex}`;
  }

  function emptyDoc() {
    return {
      classrooms: [{ id: "classroom-main", name: "Main Classroom", organizationId: null, centerId: null }],
      items: [],
      updatedAt: "",
      schemaVersion: 1,
    };
  }

  function cacheKey(email) {
    return email ? `llhScheduleItems:${email}` : "llhScheduleItems:guest";
  }

  function migrateFlagKey(email) {
    return email ? `llhScheduleMigrated:${email}` : "llhScheduleMigrated:guest";
  }

  function readCache(email) {
    try {
      const raw = global.localStorage?.getItem(cacheKey(email));
      if (!raw) return emptyDoc();
      const parsed = JSON.parse(raw);
      return {
        classrooms: Array.isArray(parsed.classrooms) && parsed.classrooms.length
          ? parsed.classrooms
          : emptyDoc().classrooms,
        items: Array.isArray(parsed.items) ? parsed.items : [],
        updatedAt: String(parsed.updatedAt || ""),
        schemaVersion: 1,
      };
    } catch {
      return emptyDoc();
    }
  }

  function writeCache(email, doc) {
    const payload = {
      classrooms: doc.classrooms?.length ? doc.classrooms : emptyDoc().classrooms,
      items: Array.isArray(doc.items) ? doc.items : [],
      updatedAt: doc.updatedAt || new Date().toISOString(),
      schemaVersion: 1,
    };
    global.localStorage?.setItem(cacheKey(email), JSON.stringify(payload));
    return payload;
  }

  function lessonForWeek(doc, weekStartDate, classroomId) {
    const week = weekStartMonday(weekStartDate);
    const room = classroomId || doc.classrooms?.[0]?.id || "classroom-main";
    return (doc.items || []).find(
      (item) => item.type === "lesson_plan" && item.weekStartDate === week && item.classroomId === room,
    ) || null;
  }

  function itemsInRange(doc, from, to, classroomId) {
    const start = isoDateOnly(from);
    const end = isoDateOnly(to);
    const room = classroomId || "";
    return (doc.items || []).filter((item) => {
      if (room && item.classroomId !== room) return false;
      if (start && item.endDate < start) return false;
      if (end && item.startDate > end) return false;
      return true;
    });
  }

  function upsertLocalItem(doc, item) {
    const next = {
      classrooms: doc.classrooms?.length ? doc.classrooms : emptyDoc().classrooms,
      items: [...(doc.items || [])],
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
    const normalized = {
      ...item,
      id: item.id || randomId("sch"),
      classroomId: item.classroomId || next.classrooms[0].id,
      updatedAt: new Date().toISOString(),
      createdAt: item.createdAt || new Date().toISOString(),
    };
    next.items = next.items.filter((entry) => entry.id !== normalized.id);
    if (normalized.type === "lesson_plan") {
      next.items = next.items.filter(
        (entry) => !(
          entry.type === "lesson_plan"
          && entry.weekStartDate === normalized.weekStartDate
          && entry.classroomId === normalized.classroomId
        ),
      );
    }
    next.items.push(normalized);
    next.items.sort((a, b) => `${a.startDate}-${a.type}`.localeCompare(`${b.startDate}-${b.type}`));
    return { doc: next, item: normalized };
  }

  async function authHeaders(getFirebaseHeaders, email) {
    const firebaseHeaders = typeof getFirebaseHeaders === "function" ? await getFirebaseHeaders() : null;
    if (firebaseHeaders) return firebaseHeaders;
    if (!email) return null;
    return {
      "Content-Type": "application/json",
      "X-LLH-User-Email": email,
      Authorization: `Bearer test:${email}`,
    };
  }

  function mergeScheduleDocs(local = {}, remote = {}) {
    const byId = new Map();
    (Array.isArray(local.items) ? local.items : []).forEach((item) => {
      if (item?.id) byId.set(item.id, item);
    });
    (Array.isArray(remote.items) ? remote.items : []).forEach((item) => {
      if (!item?.id) return;
      const existing = byId.get(item.id);
      if (!existing || String(item.updatedAt || "") >= String(existing.updatedAt || "")) {
        byId.set(item.id, item);
      }
    });
    const items = Array.from(byId.values()).sort((a, b) =>
      `${a.startDate}-${a.type}-${a.title}`.localeCompare(`${b.startDate}-${b.type}-${b.title}`),
    );
    return {
      classrooms: (remote.classrooms && remote.classrooms.length)
        ? remote.classrooms
        : (local.classrooms && local.classrooms.length ? local.classrooms : emptyDoc().classrooms),
      items,
      updatedAt: String(remote.updatedAt || local.updatedAt || ""),
      schemaVersion: 1,
    };
  }

  async function fetchSchedule(getFirebaseHeaders, email, query = {}) {
    const local = readCache(email);
    const headers = await authHeaders(getFirebaseHeaders, email);
    if (!headers) return local;
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.classroomId) params.set("classroomId", query.classroomId);
    if (query.types) params.set("types", query.types);
    const qs = params.toString();
    try {
      const response = await fetch(`/api/schedule${qs ? `?${qs}` : ""}`, { headers });
      if (!response.ok) return local;
      const remote = await response.json();
      const remoteDoc = {
        classrooms: remote.classrooms?.length ? remote.classrooms : emptyDoc().classrooms,
        items: Array.isArray(remote.items) ? remote.items : [],
        updatedAt: remote.updatedAt || "",
        schemaVersion: 1,
      };
      // Filtered queries should not overwrite the full cache with a subset.
      if (query.from || query.to || query.classroomId || query.types) {
        return mergeScheduleDocs(local, remoteDoc);
      }
      const merged = mergeScheduleDocs(local, remoteDoc);
      // Never replace a richer local cache with an empty/stale remote payload.
      if ((local.items || []).length > 0 && (merged.items || []).length === 0) {
        return local;
      }
      writeCache(email, merged);
      return merged;
    } catch {
      return local;
    }
  }

  async function saveSchedule(getFirebaseHeaders, email, doc) {
    const local = writeCache(email, doc);
    const headers = await authHeaders(getFirebaseHeaders, email);
    if (!headers) return local;
    try {
      const response = await fetch("/api/schedule", {
        method: "PUT",
        headers,
        body: JSON.stringify(local),
      });
      if (!response.ok) return local;
      const remote = await response.json();
      return writeCache(email, {
        classrooms: remote.classrooms || local.classrooms,
        items: remote.items || local.items,
        updatedAt: remote.updatedAt || local.updatedAt,
      });
    } catch {
      return local;
    }
  }

  async function upsertItem(getFirebaseHeaders, email, item) {
    const current = readCache(email);
    const { doc, item: saved } = upsertLocalItem(current, item);
    writeCache(email, doc);
    const headers = await authHeaders(getFirebaseHeaders, email);
    if (!headers) return saved;
    try {
      const response = await fetch(`/api/schedule/items/${encodeURIComponent(saved.id)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(saved),
      });
      if (!response.ok) return saved;
      const remote = await response.json();
      if (remote.item) {
        const merged = upsertLocalItem(readCache(email), remote.item);
        writeCache(email, {
          ...merged.doc,
          classrooms: remote.classrooms || merged.doc.classrooms,
          updatedAt: remote.updatedAt || merged.doc.updatedAt,
        });
        return remote.item;
      }
    } catch {
      /* local cache already updated */
    }
    return saved;
  }

  async function assignLessonPlanToWeek(getFirebaseHeaders, email, payload = {}) {
    const weekStart = weekStartMonday(payload.weekStartDate || new Date());
    const current = readCache(email);
    const classroomId = payload.classroomId || current.classrooms[0]?.id || "classroom-main";
    const item = {
      id: payload.id || randomId("sch"),
      type: "lesson_plan",
      organizationId: null,
      centerId: null,
      classroomId,
      title: payload.lessonPlanTitle || payload.title || "Untitled Lesson Plan",
      startDate: weekStart,
      endDate: weekEndFromStart(weekStart),
      weekStartDate: weekStart,
      lessonPlanId: payload.lessonPlanId,
      lessonPlanTitle: payload.lessonPlanTitle || payload.title || "Untitled Lesson Plan",
      lessonPlanPlan: payload.lessonPlanPlan || "Free",
      lessonPlanUpdatedAt: payload.lessonPlanUpdatedAt || "",
      ageGroup: payload.ageGroup || "Preschool",
      snapshot: payload.snapshot || null,
      assignedBy: email || "",
      execution: payload.execution || {
        teacherNotes: "",
        preparationNotes: "",
        weeklyGoals: "",
        weeklyMaterials: "",
        weeklyReminders: "",
        dailyTeacherNotes: Object.fromEntries(WEEKDAYS.map((d) => [d, ""])),
        dailyOps: Object.fromEntries(WEEKDAYS.map((d) => [d, { circle: "", activity: "", meal: "", rest: "", support: "", checked: [] }])),
        observations: [],
      },
      parent: payload.parent || { parentMessage: "", visibleEventIds: [] },
      createdAt: payload.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Preserve execution/parent when replacing same week.
    const existing = lessonForWeek(current, weekStart, classroomId);
    if (existing && payload.preserveExecution !== false) {
      item.id = existing.id;
      item.execution = existing.execution || item.execution;
      item.parent = existing.parent || item.parent;
      item.createdAt = existing.createdAt || item.createdAt;
    }
    return upsertItem(getFirebaseHeaders, email, item);
  }

  async function migrateFromLegacy(getFirebaseHeaders, email, payload = {}) {
    if (!email) return readCache(email);
    if (global.localStorage?.getItem(migrateFlagKey(email)) === "1" && !payload.force) {
      return fetchSchedule(getFirebaseHeaders, email);
    }
    const headers = await authHeaders(getFirebaseHeaders, email);
    const body = {
      curriculumAssignments: payload.curriculumAssignments || [],
      weeklyPlanner: payload.weeklyPlanner || null,
      classroomLabel: payload.classroomLabel || "",
    };
    if (headers) {
      try {
        const response = await fetch("/api/schedule/migrate", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (response.ok) {
          const remote = await response.json();
          const doc = writeCache(email, {
            classrooms: remote.classrooms,
            items: remote.items,
            updatedAt: remote.updatedAt,
          });
          global.localStorage?.setItem(migrateFlagKey(email), "1");
          return doc;
        }
      } catch {
        /* fall through to local migrate */
      }
    }
    // Local fallback migration
    const items = [];
    (body.curriculumAssignments || []).forEach((assignment) => {
      const weekStart = weekStartMonday(assignment.weekStartDate);
      items.push({
        id: assignment.id || randomId("sch"),
        type: "lesson_plan",
        classroomId: "classroom-main",
        organizationId: null,
        centerId: null,
        title: assignment.lessonPlanTitle,
        startDate: weekStart,
        endDate: weekEndFromStart(weekStart),
        weekStartDate: weekStart,
        lessonPlanId: assignment.lessonPlanId,
        lessonPlanTitle: assignment.lessonPlanTitle,
        lessonPlanPlan: assignment.lessonPlanPlan,
        lessonPlanUpdatedAt: assignment.lessonPlanUpdatedAt,
        ageGroup: assignment.ageGroup,
        snapshot: assignment.snapshot,
        assignedBy: assignment.assignedBy || email,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
        execution: {
          teacherNotes: assignment.teacherNotes || "",
          preparationNotes: assignment.preparationNotes || "",
          weeklyGoals: "",
          weeklyMaterials: "",
          weeklyReminders: "",
          dailyTeacherNotes: assignment.dailyTeacherNotes || Object.fromEntries(WEEKDAYS.map((d) => [d, ""])),
          dailyOps: Object.fromEntries(WEEKDAYS.map((d) => [d, { circle: "", activity: "", meal: "", rest: "", support: "", checked: [] }])),
          observations: assignment.observations || [],
        },
        parent: {
          parentMessage: assignment.parentCalendar?.parentMessage || "",
          visibleEventIds: [],
        },
      });
    });
    const doc = writeCache(email, {
      classrooms: [{ id: "classroom-main", name: body.classroomLabel || "Main Classroom", organizationId: null, centerId: null }],
      items,
      updatedAt: new Date().toISOString(),
    });
    global.localStorage?.setItem(migrateFlagKey(email), "1");
    return doc;
  }

  function scheduleItemToLegacyAssignment(item, classroomName) {
    if (!item || item.type !== "lesson_plan") return null;
    return {
      id: String(item.id || "").startsWith("cwa-") ? item.id : `cwa-${String(item.id || "").replace(/^sch-/, "")}`,
      weekStartDate: item.weekStartDate,
      ageGroup: item.ageGroup || "Preschool",
      classroomLabel: classroomName || "",
      lessonPlanId: item.lessonPlanId,
      lessonPlanTitle: item.lessonPlanTitle,
      lessonPlanPlan: item.lessonPlanPlan,
      lessonPlanUpdatedAt: item.lessonPlanUpdatedAt || "",
      snapshot: item.snapshot,
      organizationId: item.organizationId,
      classroomId: item.classroomId,
      assignedBy: item.assignedBy || "",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      teacherNotes: item.execution?.teacherNotes || "",
      preparationNotes: item.execution?.preparationNotes || "",
      dailyTeacherNotes: item.execution?.dailyTeacherNotes || Object.fromEntries(WEEKDAYS.map((d) => [d, ""])),
      observations: item.execution?.observations || [],
      parentCalendar: {
        parentMessage: item.parent?.parentMessage || "",
        classroomEvents: [],
        updatedAt: item.updatedAt || "",
      },
    };
  }

  function buildPlannerFromLessonItem(item) {
    if (!item || item.type !== "lesson_plan") return null;
    const snapshot = item.snapshot || {};
    const days = {};
    PLANNER_DAYS.forEach((label, index) => {
      const key = WEEKDAYS[index];
      const planDay = snapshot.dailyPlans?.[key] || {};
      const ops = item.execution?.dailyOps?.[key] || {};
      const titles = (planDay.items || []).map((entry) => entry.title).filter(Boolean);
      days[label] = {
        circle: ops.circle || planDay.circleTime || "",
        activity: ops.activity || titles.join(" · "),
        meal: ops.meal || "",
        rest: ops.rest || "",
        support: ops.support || "",
      };
    });
    return {
      weekOf: item.weekStartDate,
      ageGroup: item.ageGroup || "Preschool",
      theme: item.lessonPlanTitle || snapshot.theme || "Untitled Week",
      focus: snapshot.theme || "",
      notes: item.execution?.teacherNotes || "",
      resourceId: item.lessonPlanId || "",
      days,
    };
  }

  function monthBounds(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);
    const from = weekStartMonday(start);
    const toDate = new Date(end);
    const toDay = toDate.getDay();
    const add = toDay === 0 ? 0 : 7 - toDay;
    toDate.setDate(toDate.getDate() + add);
    const y = toDate.getFullYear();
    const m = String(toDate.getMonth() + 1).padStart(2, "0");
    const d = String(toDate.getDate()).padStart(2, "0");
    return { from, to: `${y}-${m}-${d}` };
  }

  global.LLHSchedule = {
    SCHEDULE_ITEM_TYPES,
    WEEKDAYS,
    PLANNER_DAYS,
    weekStartMonday,
    weekEndFromStart,
    isoDateOnly,
    randomId,
    emptyDoc,
    readCache,
    writeCache,
    lessonForWeek,
    itemsInRange,
    mergeScheduleDocs,
    fetchSchedule,
    saveSchedule,
    upsertItem,
    assignLessonPlanToWeek,
    migrateFromLegacy,
    scheduleItemToLegacyAssignment,
    buildPlannerFromLessonItem,
    monthBounds,
    clamp,
  };
})(typeof window !== "undefined" ? window : globalThis);
