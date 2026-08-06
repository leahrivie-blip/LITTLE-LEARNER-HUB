/**
 * Idempotent child-data mutations for Daily Logs / care records.
 * Prevents duplicate applies on network retries and reduces multi-writer clobbering.
 */

const CHILD_DATA_KEYS = [
  "Profiles",
  "Observations",
  "SupportPlans",
  "Goals",
  "Differentiations",
  "Attendance",
  "Meals",
  "MealPresets",
  "Reports",
  "Communications",
  "Naps",
  "Diapers",
  "ActivityLogs",
  "Photos",
  "Documents",
];

const IDEMPOTENCY_LIMIT = 800;

function emptyPayload() {
  return CHILD_DATA_KEYS.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});
}

function clonePayload(data) {
  const base = emptyPayload();
  CHILD_DATA_KEYS.forEach((key) => {
    base[key] = Array.isArray(data?.[key])
      ? data[key].map((item) => (item && typeof item === "object" ? { ...item } : {}))
      : [];
  });
  return base;
}

function pruneIdempotency(map = {}) {
  const entries = Object.entries(map || {});
  if (entries.length <= IDEMPOTENCY_LIMIT) return map || {};
  entries.sort((a, b) => String(a[1]?.at || "").localeCompare(String(b[1]?.at || "")));
  return Object.fromEntries(entries.slice(-IDEMPOTENCY_LIMIT));
}

function staffClassroomIds(user = {}) {
  const raw = Array.isArray(user.classroomIds) ? user.classroomIds : [];
  return raw.map((id) => String(id || "").trim()).filter(Boolean);
}

function assertActorMayTouchChild(store, context, childId) {
  const cleanChildId = String(childId || "").trim();
  if (!cleanChildId) {
    return { ok: false, error: "Child id is required." };
  }
  const role = String(context.role || "").toLowerCase();
  if (role === "owner" || role === "director") return { ok: true };
  // Teachers/assistants may only mutate children in assigned classrooms.
  const actor = store.users?.[context.actorEmail] || {};
  const roomIds = staffClassroomIds(actor);
  if (!roomIds.length) {
    // No room assignment yet — deny writes to protect other rooms' children.
    if (role === "teacher" || role === "assistant") {
      return { ok: false, error: "This staff account is not assigned to a classroom yet." };
    }
    return { ok: true };
  }
  const existing = store.programData?.[context.programId]?.child?.data || {};
  const profiles = Array.isArray(existing.Profiles) ? existing.Profiles : [];
  const child = profiles.find((item) => String(item.id || "") === cleanChildId);
  if (!child) {
    // Allow creating records only when profile already exists in assigned room.
    return { ok: false, error: "Child not found in this program." };
  }
  const childRoomId = String(child.classroomId || "").trim();
  const childRoomName = String(child.classroom || "").trim();
  const allowed = roomIds.includes(childRoomId)
    || (childRoomName && roomIds.includes(childRoomName));
  if (!allowed) {
    return { ok: false, error: "You can only update children in your assigned classroom." };
  }
  if (role === "assistant") {
    // Assistants may log care; they cannot change Profiles / Documents ownership fields.
    return { ok: true, assistant: true };
  }
  return { ok: true };
}

function applyMutations(store, context, mutations = []) {
  if (!Array.isArray(mutations) || !mutations.length) {
    return { ok: false, error: "No mutations provided." };
  }
  store.programData = store.programData || {};
  store.programData[context.programId] = store.programData[context.programId] || { programId: context.programId };
  const bucket = store.programData[context.programId];
  const data = clonePayload(bucket.child?.data || emptyPayload());
  let idem = pruneIdempotency(bucket.childIdempotency || {});
  const results = [];

  for (const raw of mutations.slice(0, 200)) {
    const clientMutationId = String(raw?.clientMutationId || "").trim().slice(0, 120);
    const storeKey = String(raw?.storeKey || "").trim();
    const op = String(raw?.op || "upsert").trim().toLowerCase();
    if (!CHILD_DATA_KEYS.includes(storeKey)) {
      results.push({ ok: false, clientMutationId, error: `Unsupported store key: ${storeKey}` });
      continue;
    }
    if (clientMutationId && idem[clientMutationId]) {
      results.push({ ...idem[clientMutationId], duplicate: true });
      continue;
    }

    if (op === "delete") {
      const recordId = String(raw.recordId || raw?.record?.id || "").trim();
      const childId = String(raw.childId || raw?.record?.childId || "").trim();
      const auth = assertActorMayTouchChild(store, context, childId);
      if (!auth.ok) {
        results.push({ ok: false, clientMutationId, error: auth.error });
        continue;
      }
      if (auth.assistant && storeKey === "Profiles") {
        results.push({ ok: false, clientMutationId, error: "Assistants cannot delete child profiles." });
        continue;
      }
      const beforeCount = data[storeKey].length;
      data[storeKey] = data[storeKey].filter((item) => String(item.id || "") !== recordId);
      const result = {
        ok: true,
        clientMutationId,
        storeKey,
        op: "delete",
        recordId,
        removed: beforeCount !== data[storeKey].length,
        at: new Date().toISOString(),
      };
      if (clientMutationId) idem[clientMutationId] = result;
      results.push(result);
      continue;
    }

    const record = raw.record && typeof raw.record === "object" ? { ...raw.record } : null;
    if (!record || !record.id) {
      results.push({ ok: false, clientMutationId, error: "Upsert requires record.id." });
      continue;
    }
    const childId = String(record.childId || "").trim();
    // Profiles upserts use record.id as child id.
    const authChildId = storeKey === "Profiles" ? String(record.id || childId) : childId;
    const auth = assertActorMayTouchChild(store, context, authChildId);
    if (!auth.ok) {
      results.push({ ok: false, clientMutationId, error: auth.error });
      continue;
    }
    if (auth.assistant && storeKey === "Profiles") {
      results.push({ ok: false, clientMutationId, error: "Assistants cannot edit child profiles." });
      continue;
    }

    const list = data[storeKey];
    const idx = list.findIndex((item) => String(item.id || "") === String(record.id));
    if (idx >= 0) {
      const previous = list[idx];
      const incomingUpdated = String(record.updatedAt || record.createdAt || "");
      const previousUpdated = String(previous.updatedAt || previous.createdAt || "");
      // Last-write-wins by updatedAt when both exist; otherwise accept mutation.
      if (incomingUpdated && previousUpdated && incomingUpdated < previousUpdated) {
        const result = {
          ok: true,
          clientMutationId,
          storeKey,
          op: "upsert",
          recordId: previous.id,
          skippedStale: true,
          at: new Date().toISOString(),
        };
        if (clientMutationId) idem[clientMutationId] = result;
        results.push(result);
        continue;
      }
      list[idx] = {
        ...previous,
        ...record,
        id: previous.id,
        createdAt: previous.createdAt || record.createdAt,
        history: Array.isArray(record.history) ? record.history : previous.history,
      };
    } else {
      list.push(record);
    }
    const result = {
      ok: true,
      clientMutationId,
      storeKey,
      op: "upsert",
      recordId: record.id,
      at: new Date().toISOString(),
    };
    if (clientMutationId) idem[clientMutationId] = result;
    results.push(result);
  }

  const updatedAt = new Date().toISOString();
  bucket.child = {
    data,
    updatedAt,
    updatedByUid: context.actorUid || "",
    updatedByEmail: context.actorEmail || "",
  };
  bucket.childIdempotency = pruneIdempotency(idem);
  return {
    ok: true,
    updatedAt,
    programId: context.programId,
    results,
    data,
    applied: results.filter((item) => item.ok && !item.duplicate && !item.skippedStale).length,
    duplicates: results.filter((item) => item.duplicate).length,
    failed: results.filter((item) => !item.ok).length,
  };
}

module.exports = {
  CHILD_DATA_KEYS,
  emptyPayload,
  clonePayload,
  applyMutations,
  assertActorMayTouchChild,
  staffClassroomIds,
};
