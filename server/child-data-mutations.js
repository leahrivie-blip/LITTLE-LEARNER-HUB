/**
 * Idempotent child-data mutations for Daily Logs / care records.
 * - Append-only creates (new record ids never overwrite other events)
 * - Revision-checked updates (stale edits → conflict, not silent LWW)
 * - Auth/classroom rechecked on every mutation (including retries)
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

function recordRevision(record = {}) {
  const n = Number(record.revision);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function mergeHistory(previousHistory, incomingHistory) {
  const prev = Array.isArray(previousHistory) ? previousHistory : [];
  const next = Array.isArray(incomingHistory) ? incomingHistory : [];
  if (!next.length) return prev.slice(-40);
  // Prefer the longer/newer history trail without dropping prior audit entries.
  const byKey = new Map();
  [...prev, ...next].forEach((item) => {
    if (!item || typeof item !== "object") return;
    const key = `${item.at || ""}|${item.change || ""}|${JSON.stringify(item.after || {})}`;
    byKey.set(key, item);
  });
  return Array.from(byKey.values()).slice(-40);
}

function assertActorMayTouchChild(store, context, childId) {
  const cleanChildId = String(childId || "").trim();
  if (!cleanChildId) {
    return { ok: false, error: "Child id is required." };
  }
  const role = String(context.role || "").toLowerCase();
  if (role === "owner" || role === "director") return { ok: true };
  const actor = store.users?.[context.actorEmail] || {};
  const roomIds = staffClassroomIds(actor);
  if (!roomIds.length) {
    if (role === "teacher" || role === "assistant") {
      return { ok: false, error: "This staff account is not assigned to a classroom yet." };
    }
    return { ok: true };
  }
  const existing = store.programData?.[context.programId]?.child?.data || {};
  const profiles = Array.isArray(existing.Profiles) ? existing.Profiles : [];
  const child = profiles.find((item) => String(item.id || "") === cleanChildId);
  if (!child) {
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
    return { ok: true, assistant: true };
  }
  return { ok: true };
}

function resolveBaseRevision(raw, record) {
  if (raw?.baseRevision != null && raw.baseRevision !== "") {
    const n = Number(raw.baseRevision);
    return Number.isFinite(n) ? Math.floor(n) : NaN;
  }
  if (record?.baseRevision != null && record.baseRevision !== "") {
    const n = Number(record.baseRevision);
    return Number.isFinite(n) ? Math.floor(n) : NaN;
  }
  // Legacy clients sometimes send the revision they last read as record.revision.
  if (record?.revision != null && record.revision !== "") {
    const n = Number(record.revision);
    return Number.isFinite(n) ? Math.floor(n) : NaN;
  }
  return NaN;
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
      results.push({
        ok: false,
        clientMutationId,
        error: `Unsupported store key: ${storeKey}`,
        code: "unsupported_store",
      });
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
        // Auth failures are not idempotent — permission may change; recheck on retry.
        results.push({
          ok: false,
          clientMutationId,
          error: auth.error,
          code: "forbidden",
          authFailed: true,
        });
        continue;
      }
      if (auth.assistant && storeKey === "Profiles") {
        results.push({
          ok: false,
          clientMutationId,
          error: "Assistants cannot delete child profiles.",
          code: "forbidden",
          authFailed: true,
        });
        continue;
      }
      const list = data[storeKey];
      const existing = list.find((item) => String(item.id || "") === recordId);
      if (existing) {
        const previousRevision = recordRevision(existing);
        const baseRevision = resolveBaseRevision(raw, raw.record || {});
        if (!Number.isFinite(baseRevision) || baseRevision !== previousRevision) {
          const conflict = {
            ok: false,
            conflict: true,
            clientMutationId,
            storeKey,
            op: "delete",
            recordId,
            code: "stale_revision",
            error: "This record was updated by someone else. Reload the latest version before deleting.",
            expectedRevision: previousRevision,
            submittedBaseRevision: Number.isFinite(baseRevision) ? baseRevision : null,
            serverRecord: existing,
            at: new Date().toISOString(),
          };
          if (clientMutationId) idem[clientMutationId] = { ...conflict, duplicate: false };
          results.push(conflict);
          continue;
        }
      }
      const beforeCount = list.length;
      data[storeKey] = list.filter((item) => String(item.id || "") !== recordId);
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
      results.push({
        ok: false,
        clientMutationId,
        error: "Upsert requires record.id.",
        code: "invalid_record",
      });
      continue;
    }
    const childId = String(record.childId || "").trim();
    const authChildId = storeKey === "Profiles" ? String(record.id || childId) : childId;
    const auth = assertActorMayTouchChild(store, context, authChildId);
    if (!auth.ok) {
      results.push({
        ok: false,
        clientMutationId,
        error: auth.error,
        code: "forbidden",
        authFailed: true,
      });
      continue;
    }
    if (auth.assistant && storeKey === "Profiles") {
      results.push({
        ok: false,
        clientMutationId,
        error: "Assistants cannot edit child profiles.",
        code: "forbidden",
        authFailed: true,
      });
      continue;
    }

    const list = data[storeKey];
    const idx = list.findIndex((item) => String(item.id || "") === String(record.id));

    // Append-only create path — different event ids never overwrite each other.
    if (idx < 0) {
      const created = {
        ...record,
        id: String(record.id),
        revision: 1,
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: record.updatedAt || new Date().toISOString(),
        history: Array.isArray(record.history) ? record.history.slice(-40) : [],
      };
      delete created.baseRevision;
      list.push(created);
      const result = {
        ok: true,
        clientMutationId,
        storeKey,
        op: "upsert",
        recordId: created.id,
        revision: 1,
        created: true,
        at: new Date().toISOString(),
      };
      if (clientMutationId) idem[clientMutationId] = result;
      results.push(result);
      continue;
    }

    const previous = list[idx];
    const previousRevision = recordRevision(previous);
    const baseRevision = resolveBaseRevision(raw, record);
    if (!Number.isFinite(baseRevision) || baseRevision !== previousRevision) {
      const conflict = {
        ok: false,
        conflict: true,
        clientMutationId,
        storeKey,
        op: "upsert",
        recordId: previous.id,
        code: "stale_revision",
        error: "This record was updated by someone else. Your edit was not saved over their version.",
        expectedRevision: previousRevision,
        submittedBaseRevision: Number.isFinite(baseRevision) ? baseRevision : null,
        serverRecord: previous,
        localAttempt: {
          id: record.id,
          revision: record.revision,
          updatedAt: record.updatedAt,
          summary: record.summary || record.title || "",
        },
        at: new Date().toISOString(),
      };
      if (clientMutationId) idem[clientMutationId] = { ...conflict, duplicate: false };
      results.push(conflict);
      continue;
    }

    const nextRevision = previousRevision + 1;
    const merged = {
      ...previous,
      ...record,
      id: previous.id,
      revision: nextRevision,
      createdAt: previous.createdAt || record.createdAt,
      updatedAt: record.updatedAt || new Date().toISOString(),
      history: mergeHistory(previous.history, record.history),
    };
    delete merged.baseRevision;
    list[idx] = merged;
    const result = {
      ok: true,
      clientMutationId,
      storeKey,
      op: "upsert",
      recordId: merged.id,
      revision: nextRevision,
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
  const conflicts = results.filter((item) => item.conflict).length;
  const applied = results.filter((item) => item.ok && !item.duplicate && !item.conflict).length;
  const duplicates = results.filter((item) => item.duplicate).length;
  const failed = results.filter((item) => !item.ok && !item.conflict).length;
  return {
    ok: conflicts === 0 && failed === 0,
    conflict: conflicts > 0,
    updatedAt,
    programId: context.programId,
    results,
    data,
    applied,
    duplicates,
    failed,
    conflicts,
  };
}

module.exports = {
  CHILD_DATA_KEYS,
  emptyPayload,
  clonePayload,
  applyMutations,
  assertActorMayTouchChild,
  staffClassroomIds,
  recordRevision,
};
