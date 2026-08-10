/**
 * Wave 2 — Connected Paperwork UX helpers (presentation only).
 *
 * Different surfaces (Paperwork HQ, Child Profile, Staff Profile, My Paperwork,
 * Family Hub) are views into the SAME canonical records:
 *   - Child/family: programData[programId].child.data.Documents[]
 *   - Staff:        programData[programId].forms.staffDocuments[]
 *
 * Does NOT create stores, dual-write, or new persisted status enums.
 * Rails like "Awaiting Signature", "Due Soon", "Overdue", "Not Opened" are
 * derived presentation buckets over normalizeFormStatus / existing lifecycle.
 */
(function paperworkSurfacesModule(root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../server/forms-lib.js"));
  } else {
    root.LlhPaperworkSurfaces = factory(root.LlhFormsLib || {
      normalizeFormStatus: root.normalizeFormLifecycleStatus
        || function fallbackNormalize(status) {
          const key = String(status || "").trim().toLowerCase();
          const aliases = {
            draft: "draft",
            needed: "assigned",
            assigned: "assigned",
            requested: "assigned",
            notified: "assigned",
            "action needed": "assigned",
            viewed: "in_progress",
            in_progress: "in_progress",
            "in progress": "in_progress",
            received: "submitted",
            submitted: "submitted",
            signed: "submitted",
            completed: "completed",
            on_file: "completed",
            reviewed: "completed",
            needs_correction: "needs_correction",
            declined: "declined",
            expired: "expired",
          };
          return aliases[key] || key.replace(/\s+/g, "_") || "assigned";
        },
      isFormOverdue: function fallbackOverdue(doc, todayIso) {
        const due = String(doc?.dueDate || "").slice(0, 10);
        if (!due) return false;
        const today = String(todayIso || new Date().toISOString().slice(0, 10)).slice(0, 10);
        if (due >= today) return false;
        if (doc.signedAt || doc.providerReviewed) return false;
        const n = (root.normalizeFormLifecycleStatus || String)(doc.status);
        return n !== "completed" && n !== "declined" && n !== "expired";
      },
      isParentActionableStatus: function fallbackActionable(status, opts) {
        if (opts && opts.signedAt) return false;
        const n = (root.normalizeFormLifecycleStatus || String)(status);
        return ["draft", "assigned", "in_progress", "needs_correction"].includes(n);
      },
      isTerminalFormStatus: function fallbackTerminal(status) {
        const n = (root.normalizeFormLifecycleStatus || String)(status);
        return n === "completed" || n === "declined" || n === "expired";
      },
      formStatusLabel: function fallbackLabel(status) {
        return String(status || "Assigned");
      },
      FORM_STATUSES: {
        DRAFT: "draft",
        ASSIGNED: "assigned",
        IN_PROGRESS: "in_progress",
        SUBMITTED: "submitted",
        COMPLETED: "completed",
        NEEDS_CORRECTION: "needs_correction",
        DECLINED: "declined",
        EXPIRED: "expired",
      },
    });
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function factory(formsLib) {
  "use strict";

  const HQ_RAILS = Object.freeze([
    { id: "needs_attention", label: "Needs Attention" },
    { id: "awaiting_signature", label: "Awaiting Signature" },
    { id: "not_opened", label: "Not Opened" },
    { id: "in_progress", label: "In Progress" },
    { id: "due_soon", label: "Due Soon" },
    { id: "overdue", label: "Overdue" },
    { id: "needs_correction", label: "Needs Correction" },
    { id: "completed", label: "Completed" },
    { id: "archived", label: "Archived" },
  ]);

  const CHILD_BUCKETS = Object.freeze([
    { id: "needs_action", label: "Needs Action" },
    { id: "in_progress", label: "In Progress" },
    { id: "completed", label: "Completed" },
    { id: "uploads", label: "Uploads" },
    { id: "archived", label: "Archived" },
  ]);

  const STAFF_BUCKETS = Object.freeze([
    { id: "needs_signature", label: "Needs Signature" },
    { id: "assigned", label: "Assigned" },
    { id: "due_soon", label: "Due Soon" },
    { id: "overdue", label: "Overdue" },
    { id: "completed", label: "Completed" },
    { id: "archived", label: "Archived" },
  ]);

  const FAMILY_BUCKETS = Object.freeze([
    { id: "needs_attention", label: "Needs Attention" },
    { id: "needs_signature", label: "Needs Signature" },
    { id: "in_progress", label: "In Progress" },
    { id: "completed", label: "Completed" },
  ]);

  const DUE_SOON_DAYS = 7;

  function todayIso(now) {
    const d = now instanceof Date ? now : new Date();
    return d.toISOString().slice(0, 10);
  }

  function addDaysIso(iso, days) {
    const base = String(iso || todayIso()).slice(0, 10);
    const dt = new Date(`${base}T12:00:00.000Z`);
    dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
    return dt.toISOString().slice(0, 10);
  }

  function statusOf(doc) {
    return formsLib.normalizeFormStatus(doc?.status);
  }

  function isCompleted(doc) {
    const n = statusOf(doc);
    return Boolean(doc?.providerReviewed) || n === formsLib.FORM_STATUSES.COMPLETED;
  }

  function isArchived(doc) {
    return Boolean(doc?.archived);
  }

  function hasBeenOpened(doc) {
    return Boolean(
      doc?.viewedAt
      || doc?.firstOpenedAt
      || doc?.openedAt
      || String(doc?.parentProgressText || "").trim()
      || doc?.signedAt
      || statusOf(doc) === formsLib.FORM_STATUSES.IN_PROGRESS
      || statusOf(doc) === formsLib.FORM_STATUSES.SUBMITTED
      || statusOf(doc) === formsLib.FORM_STATUSES.COMPLETED,
    );
  }

  function isAwaitingSignature(doc) {
    if (doc?.signedAt || isCompleted(doc) || isArchived(doc)) return false;
    if (statusOf(doc) === formsLib.FORM_STATUSES.NEEDS_CORRECTION) return true;
    return formsLib.isParentActionableStatus(doc?.status, { signedAt: doc?.signedAt });
  }

  function isDueSoon(doc, today = todayIso()) {
    if (isArchived(doc) || isCompleted(doc) || doc?.signedAt) return false;
    if (formsLib.isFormOverdue(doc, today)) return false;
    const due = String(doc?.dueDate || "").slice(0, 10);
    if (!due) return false;
    const horizon = addDaysIso(today, DUE_SOON_DAYS);
    return due >= today && due <= horizon;
  }

  function looksLikeUpload(doc) {
    if (!doc) return false;
    if (doc.uploadUrl || doc.fileUrl || doc.attachmentUrl || doc.storageKey) return true;
    if (doc.sourceType === "upload" || doc.kind === "upload" || doc.documentKind === "upload") return true;
    const cat = String(doc.category || "").toLowerCase();
    return cat.includes("upload") || cat.includes("scan") || cat.includes("photo copy");
  }

  function needsProviderAttention(doc, today = todayIso()) {
    if (isArchived(doc)) return false;
    const n = statusOf(doc);
    const signedNeedsReview = (n === formsLib.FORM_STATUSES.SUBMITTED || Boolean(doc.signedAt)) && !doc.providerReviewed;
    if (signedNeedsReview) return true;
    if (formsLib.isFormOverdue(doc, today)) return true;
    if (n === formsLib.FORM_STATUSES.NEEDS_CORRECTION) return true;
    return false;
  }

  /** Ordered primary HQ rail for a row (single chip). */
  function primaryHqRail(doc, today = todayIso()) {
    if (isArchived(doc)) return "archived";
    if (isCompleted(doc)) return "completed";
    const n = statusOf(doc);
    if (n === formsLib.FORM_STATUSES.NEEDS_CORRECTION) return "needs_correction";
    if (formsLib.isFormOverdue(doc, today)) return "overdue";
    if ((n === formsLib.FORM_STATUSES.SUBMITTED || Boolean(doc.signedAt)) && !doc.providerReviewed) {
      return "needs_attention";
    }
    if (isDueSoon(doc, today)) return "due_soon";
    if (n === formsLib.FORM_STATUSES.IN_PROGRESS) return "in_progress";
    if (isAwaitingSignature(doc) && !hasBeenOpened(doc)) return "not_opened";
    if (isAwaitingSignature(doc)) return "awaiting_signature";
    if (n === formsLib.FORM_STATUSES.ASSIGNED || n === formsLib.FORM_STATUSES.DRAFT) return "not_opened";
    return "needs_attention";
  }

  /** All HQ rails a document matches (for counts / multi-rail filters). */
  function hqRailsForDoc(doc, today = todayIso()) {
    const rails = new Set();
    if (isArchived(doc)) {
      rails.add("archived");
      return [...rails];
    }
    if (needsProviderAttention(doc, today)) rails.add("needs_attention");
    if (isAwaitingSignature(doc)) rails.add("awaiting_signature");
    if (isAwaitingSignature(doc) && !hasBeenOpened(doc)) rails.add("not_opened");
    if (statusOf(doc) === formsLib.FORM_STATUSES.IN_PROGRESS && !doc.signedAt) rails.add("in_progress");
    if (isDueSoon(doc, today)) rails.add("due_soon");
    if (formsLib.isFormOverdue(doc, today)) rails.add("overdue");
    if (statusOf(doc) === formsLib.FORM_STATUSES.NEEDS_CORRECTION) rails.add("needs_correction");
    if (isCompleted(doc)) rails.add("completed");
    return [...rails];
  }

  function childBucketsForDoc(doc, today = todayIso()) {
    const buckets = new Set();
    if (isArchived(doc)) {
      buckets.add("archived");
      return [...buckets];
    }
    if (looksLikeUpload(doc)) buckets.add("uploads");
    if (isCompleted(doc)) {
      buckets.add("completed");
      return [...buckets];
    }
    if (statusOf(doc) === formsLib.FORM_STATUSES.IN_PROGRESS) buckets.add("in_progress");
    if (
      isAwaitingSignature(doc)
      || formsLib.isFormOverdue(doc, today)
      || statusOf(doc) === formsLib.FORM_STATUSES.NEEDS_CORRECTION
      || ((statusOf(doc) === formsLib.FORM_STATUSES.SUBMITTED || doc.signedAt) && !doc.providerReviewed)
    ) {
      buckets.add("needs_action");
    }
    if (!buckets.size) buckets.add("needs_action");
    return [...buckets];
  }

  function staffBucketsForDoc(doc, today = todayIso()) {
    const buckets = new Set();
    if (isArchived(doc)) {
      buckets.add("archived");
      return [...buckets];
    }
    if (isCompleted(doc)) {
      buckets.add("completed");
      return [...buckets];
    }
    if (formsLib.isFormOverdue(doc, today)) buckets.add("overdue");
    if (isDueSoon(doc, today)) buckets.add("due_soon");
    if (isAwaitingSignature(doc) && !doc.signedAt) buckets.add("needs_signature");
    if (
      statusOf(doc) === formsLib.FORM_STATUSES.ASSIGNED
      || statusOf(doc) === formsLib.FORM_STATUSES.DRAFT
      || statusOf(doc) === formsLib.FORM_STATUSES.IN_PROGRESS
    ) {
      buckets.add("assigned");
    }
    if (!buckets.size && !isCompleted(doc)) buckets.add("assigned");
    return [...buckets];
  }

  function familyBucketsForDoc(doc) {
    // Caller must already ACL-filter (shareWithFamily === true ∩ household).
    const buckets = new Set();
    if (isCompleted(doc) || doc?.signedAt) {
      buckets.add("completed");
      return [...buckets];
    }
    const n = statusOf(doc);
    if (n === formsLib.FORM_STATUSES.IN_PROGRESS || String(doc?.parentProgressText || "").trim()) {
      buckets.add("in_progress");
    }
    if (isAwaitingSignature(doc) || n === formsLib.FORM_STATUSES.NEEDS_CORRECTION) {
      buckets.add("needs_signature");
      buckets.add("needs_attention");
    }
    if (!buckets.size) buckets.add("needs_attention");
    return [...buckets];
  }

  function enrichCanonicalRow(doc, meta = {}) {
    const today = meta.today || todayIso();
    const assigneeType = doc.assigneeType
      || (doc.assigneeEmail ? "staff" : "child");
    return {
      ...doc,
      recordId: String(doc.id || ""),
      canonicalStore: assigneeType === "staff" ? "forms.staffDocuments" : "child.Documents",
      assigneeType,
      childId: String(doc.childId || ""),
      assigneeEmail: String(doc.assigneeEmail || "").toLowerCase(),
      childName: meta.childName || doc.childName || "",
      familyLabel: meta.familyLabel || doc.familyLabel || "",
      classroomId: meta.classroomId || doc.classroomId || "",
      classroomName: meta.classroomName || doc.classroomName || "",
      staffName: meta.staffName || doc.staffName || doc.assigneeLabel || "",
      lifecycleStatus: statusOf(doc),
      statusLabel: doc.statusLabel || formsLib.formStatusLabel(doc.status),
      primaryRail: primaryHqRail(doc, today),
      hqRails: hqRailsForDoc(doc, today),
      childBuckets: childBucketsForDoc(doc, today),
      staffBuckets: staffBucketsForDoc(doc, today),
      familyBuckets: familyBucketsForDoc(doc),
      overdue: formsLib.isFormOverdue(doc, today),
      dueSoon: isDueSoon(doc, today),
      signatureStatus: doc.signedAt
        ? "signed"
        : (isAwaitingSignature(doc) ? "awaiting" : (isCompleted(doc) ? "complete" : "none")),
      completedDate: String(doc.completedAt || (doc.providerReviewed ? (doc.reviewedAt || doc.signedAt || "") : "") || "").slice(0, 10),
    };
  }

  /**
   * Build unified Paperwork HQ rows from canonical child + staff docs.
   * Does not copy records — returns enriched views of the same IDs.
   */
  function buildPaperworkHqRows({
    childDocuments = [],
    staffDocuments = [],
    children = [],
    households = [],
    classrooms = [],
    staffDirectory = [],
    today = todayIso(),
  } = {}) {
    const childById = new Map((Array.isArray(children) ? children : []).map((c) => [String(c.id), c]));
    const roomById = new Map((Array.isArray(classrooms) ? classrooms : []).map((r) => [String(r.id), r]));
    const staffByEmail = new Map(
      (Array.isArray(staffDirectory) ? staffDirectory : []).map((s) => [String(s.email || "").toLowerCase(), s]),
    );
    const familyByChild = new Map();
    (Array.isArray(households) ? households : []).forEach((hh) => {
      const label = hh.name || hh.familyName || hh.label || "Family";
      const ids = Array.isArray(hh.childIds) && hh.childIds.length
        ? hh.childIds
        : (Array.isArray(hh.children) ? hh.children.map((c) => c?.id) : []);
      ids.forEach((id) => {
        if (id) familyByChild.set(String(id), label);
      });
    });

    const childRows = (Array.isArray(childDocuments) ? childDocuments : [])
      .filter((doc) => doc && doc.id)
      .map((doc) => {
        const child = childById.get(String(doc.childId || ""));
        const classroomId = String(child?.classroomId || doc.classroomId || "");
        const room = roomById.get(classroomId);
        return enrichCanonicalRow(doc, {
          today,
          childName: child?.name || doc.childName || "Child",
          familyLabel: familyByChild.get(String(doc.childId || "")) || "",
          classroomId,
          classroomName: room?.name || child?.classroomName || "",
        });
      });

    const staffRows = (Array.isArray(staffDocuments) ? staffDocuments : [])
      .filter((doc) => doc && doc.id)
      .map((doc) => {
        const email = String(doc.assigneeEmail || "").toLowerCase();
        const staff = staffByEmail.get(email);
        return enrichCanonicalRow({ ...doc, assigneeType: "staff" }, {
          today,
          staffName: staff?.name || email || "Staff",
        });
      });

    return [...childRows, ...staffRows].sort((a, b) => (
      String(b.updatedAt || b.signedAt || b.assignedAt || "").localeCompare(
        String(a.updatedAt || a.signedAt || a.assignedAt || ""),
      )
    ));
  }

  function railCounts(rows) {
    const counts = Object.fromEntries(HQ_RAILS.map((r) => [r.id, 0]));
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      (row.hqRails || hqRailsForDoc(row)).forEach((rail) => {
        if (counts[rail] != null) counts[rail] += 1;
      });
    });
    return counts;
  }

  function matchesHqFilters(row, filters = {}) {
    const rail = String(filters.rail || "needs_attention");
    const rails = row.hqRails || hqRailsForDoc(row);
    if (rail && rail !== "all" && !rails.includes(rail)) return false;

    const childId = String(filters.childId || "").trim();
    if (childId && String(row.childId || "") !== childId) return false;

    const family = String(filters.family || "").trim().toLowerCase();
    if (family && String(row.familyLabel || "").toLowerCase() !== family) return false;

    const staff = String(filters.staffEmail || "").trim().toLowerCase();
    if (staff && String(row.assigneeEmail || "").toLowerCase() !== staff) return false;

    const classroomId = String(filters.classroomId || "").trim();
    if (classroomId && String(row.classroomId || "") !== classroomId) return false;

    const type = String(filters.formType || "").trim().toLowerCase();
    if (type) {
      const hay = `${row.category || ""} ${row.title || ""} ${row.templateId || ""}`.toLowerCase();
      if (!hay.includes(type) && String(row.category || "").toLowerCase() !== type) return false;
    }

    const status = String(filters.status || "").trim().toLowerCase();
    if (status && status !== "all" && statusOf(row) !== status && String(row.status || "").toLowerCase() !== status) {
      return false;
    }

    const dueFrom = String(filters.dueFrom || "").slice(0, 10);
    const dueTo = String(filters.dueTo || "").slice(0, 10);
    const due = String(row.dueDate || "").slice(0, 10);
    if (dueFrom && (!due || due < dueFrom)) return false;
    if (dueTo && (!due || due > dueTo)) return false;

    const q = String(filters.query || "").trim().toLowerCase();
    if (q) {
      const hay = [
        row.title,
        row.category,
        row.statusLabel,
        row.childName,
        row.familyLabel,
        row.staffName,
        row.assigneeEmail,
        row.classroomName,
        row.recordId,
      ].map((p) => String(p || "").toLowerCase()).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function filterHqRows(rows, filters = {}) {
    return (Array.isArray(rows) ? rows : []).filter((row) => matchesHqFilters(row, filters));
  }

  function filterByBucket(rows, bucketKey, bucketFnName) {
    const key = String(bucketKey || "all");
    if (key === "all") return Array.isArray(rows) ? rows : [];
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const buckets = row[bucketFnName] || [];
      return buckets.includes(key);
    });
  }

  function sameRecordId(a, b) {
    return String(a?.id || a?.recordId || "") === String(b?.id || b?.recordId || "")
      && String(a?.id || a?.recordId || "") !== "";
  }

  /** Staff self-service: only own assigneeEmail. Managers use full list separately. */
  function staffSelfServiceDocuments(staffDocuments = [], actorEmail = "") {
    const email = String(actorEmail || "").trim().toLowerCase();
    if (!email) return [];
    return (Array.isArray(staffDocuments) ? staffDocuments : []).filter(
      (doc) => String(doc?.assigneeEmail || "").trim().toLowerCase() === email,
    );
  }

  /** Teachers must not browse peer staff paperwork. */
  function canBrowseStaffPaperwork(role = "") {
    const r = String(role || "").trim().toLowerCase();
    return r === "owner" || r === "director" || r === "admin";
  }

  return {
    HQ_RAILS,
    CHILD_BUCKETS,
    STAFF_BUCKETS,
    FAMILY_BUCKETS,
    DUE_SOON_DAYS,
    todayIso,
    statusOf,
    isCompleted,
    isArchived,
    hasBeenOpened,
    isAwaitingSignature,
    isDueSoon,
    looksLikeUpload,
    needsProviderAttention,
    primaryHqRail,
    hqRailsForDoc,
    childBucketsForDoc,
    staffBucketsForDoc,
    familyBucketsForDoc,
    enrichCanonicalRow,
    buildPaperworkHqRows,
    railCounts,
    matchesHqFilters,
    filterHqRows,
    filterByBucket,
    sameRecordId,
    staffSelfServiceDocuments,
    canBrowseStaffPaperwork,
  };
}));
