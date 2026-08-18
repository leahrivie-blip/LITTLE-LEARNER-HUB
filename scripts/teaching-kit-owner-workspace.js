/**
 * Owner workspace helpers for the Admin Lesson Plan editor.
 * True publish blockers stay separate from optional todos/notes.
 * Never treat owner notes as public curriculum content.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitOwnerWorkspace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VALID_AGE_BUCKETS = Object.freeze([
    "infant", "toddler", "preschool", "pre-k", "prek", "pre k", "school age", "school-age",
  ]);

  function text(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function isValidAgeBand(value) {
    const raw = text(value);
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (VALID_AGE_BUCKETS.some((bucket) => lower === bucket || lower.startsWith(`${bucket} `) || lower.includes(bucket))) {
      return true;
    }
    return /infant|toddler|preschool|pre-?k|school/i.test(raw);
  }

  function usableActivities(plan, activities) {
    const list = Array.isArray(activities) ? activities : [];
    const fromCatalog = list.filter((item) => text(item?.title) && String(item.status || "").toLowerCase() !== "archived");
    if (fromCatalog.length) return fromCatalog;
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const items = [];
    days.forEach((day) => {
      const dayPlan = plan?.dailyPlans?.[day];
      const dayItems = Array.isArray(dayPlan)
        ? dayPlan
        : (Array.isArray(dayPlan?.items) ? dayPlan.items : []);
      dayItems.forEach((item) => {
        if (text(item?.title)) items.push({ ...item, dayOfWeek: day });
      });
    });
    return items;
  }

  function weekdayCoverage(plan, activities) {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const present = new Set();
    usableActivities(plan, activities).forEach((item) => {
      const day = String(item.dayOfWeek || "").toLowerCase();
      if (days.includes(day)) present.add(day);
    });
    if (!present.size) {
      days.forEach((day) => {
        const dayPlan = plan?.dailyPlans?.[day];
        const items = Array.isArray(dayPlan)
          ? dayPlan
          : (Array.isArray(dayPlan?.items) ? dayPlan.items : []);
        if (items.some((item) => text(item?.title))) present.add(day);
      });
    }
    return { days: days.filter((day) => present.has(day)), count: present.size };
  }

  function collectTruePublishBlockers(plan, activities) {
    const blockers = [];
    const title = text(plan?.title);
    if (!title || /^untitled(\s+lesson(\s+plan)?)?$/i.test(title)) {
      blockers.push({ code: "missing_title", message: "Add lesson title" });
    }
    const ageRaw = text(plan?.age);
    if (!ageRaw) {
      blockers.push({ code: "missing_age", message: "Choose an age band" });
    } else if (!isValidAgeBand(ageRaw)) {
      blockers.push({ code: "missing_age", message: "Choose a valid age band" });
    }
    if (!usableActivities(plan, activities).length) {
      blockers.push({ code: "no_activities", message: "Add at least one valid activity" });
    }
    if (!text(plan?.id)) {
      blockers.push({ code: "missing_identity", message: "Lesson is missing its canonical id" });
    }
    return blockers;
  }

  function optionalEnhancements(plan, activities, resources) {
    const acts = usableActivities(plan, activities);
    const catalog = Array.isArray(resources) ? resources : [];
    const linkedIds = new Set((plan?.resourceIds || []).map((id) => text(id)).filter(Boolean));
    const realPrintables = catalog.filter((item) => (
      linkedIds.has(text(item?.id))
      && /printable/i.test(String(item.resourceCategory || item.resourceType || ""))
      && String(item.status || "").toLowerCase() === "published"
    ));
    const books = Array.isArray(plan?.books) ? plan.books.filter((book) => text(book?.title)) : [];
    const songs = Array.isArray(plan?.songs) ? plan.songs.filter((song) => text(song?.title)) : [];
    const cover = Boolean(text(plan?.coverImageUrl));
    const family = Boolean(text(plan?.familyConnection));
    const hasImages = acts.some((act) => text(act.setupImageUrl) || text(act.exampleImageUrl));
    return {
      cover,
      printables: realPrintables.length > 0,
      printableCount: realPrintables.length,
      books: books.length > 0,
      bookCount: books.length,
      songs: songs.length > 0,
      songCount: songs.length,
      family,
      images: hasImages,
    };
  }

  function coreLessonSnapshot(plan, activities) {
    const acts = usableActivities(plan, activities);
    const coverage = weekdayCoverage(plan, activities);
    return {
      title: Boolean(text(plan?.title) && !/^untitled(\s+lesson(\s+plan)?)?$/i.test(text(plan?.title))),
      age: isValidAgeBand(plan?.age),
      weekdays: coverage.count,
      weekdayLabel: `${coverage.count}/5 weekdays`,
      activities: acts.length,
      activityLabel: `${acts.length} real activit${acts.length === 1 ? "y" : "ies"}`,
    };
  }

  function ownerPublishState(plan, activities, ownerWorkspace, resources) {
    const blockers = collectTruePublishBlockers(plan, activities);
    const status = String(plan?.status || "draft").toLowerCase();
    const published = status === "published" || status === "featured";
    const todos = normalizedOwnerWorkspace(ownerWorkspace).todos;
    const openTodos = todos.filter((todo) => !todo.done);
    const optional = optionalEnhancements(plan, activities, resources);
    let workspaceStatus = "draft";
    if (published) workspaceStatus = "published";
    else if (!blockers.length) workspaceStatus = "ready";
    return {
      workspaceStatus,
      published,
      canPublish: !blockers.length,
      blockers,
      openTodoCount: openTodos.length,
      openTodos,
      optional,
      core: coreLessonSnapshot(plan, activities),
      displayLabel: published ? "Published" : (blockers.length ? "Draft" : "Ready to publish"),
    };
  }

  function newTodoId() {
    return `ow-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function normalizedOwnerTodo(value, index) {
    const entry = value && typeof value === "object" ? value : { text: value };
    const rawText = text(entry.text || entry.title || entry.label);
    if (!rawText) return null;
    const id = text(entry.id) || `ow-${index + 1}`;
    return {
      id: id.slice(0, 80),
      text: rawText.slice(0, 240),
      done: entry.done === true,
      createdAt: text(entry.createdAt).slice(0, 80),
      updatedAt: text(entry.updatedAt).slice(0, 80),
    };
  }

  function normalizedOwnerWorkspace(value) {
    const entry = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const todos = (Array.isArray(entry.todos) ? entry.todos : [])
      .map((item, index) => normalizedOwnerTodo(item, index))
      .filter(Boolean)
      .slice(0, 40);
    return {
      notes: String(entry.notes == null ? "" : entry.notes).slice(0, 8000),
      todos,
      updatedAt: text(entry.updatedAt).slice(0, 80),
    };
  }

  function toggleOwnerTodo(workspace, todoId, done) {
    const next = normalizedOwnerWorkspace(workspace);
    const now = new Date().toISOString();
    next.todos = next.todos.map((todo) => (
      todo.id === todoId ? { ...todo, done: done === true, updatedAt: now } : todo
    ));
    next.updatedAt = now;
    return next;
  }

  function addOwnerTodo(workspace, label) {
    const next = normalizedOwnerWorkspace(workspace);
    const textLabel = text(label);
    if (!textLabel) return next;
    const now = new Date().toISOString();
    next.todos.push({
      id: newTodoId(),
      text: textLabel.slice(0, 240),
      done: false,
      createdAt: now,
      updatedAt: now,
    });
    next.updatedAt = now;
    return next;
  }

  function deleteOwnerTodo(workspace, todoId) {
    const next = normalizedOwnerWorkspace(workspace);
    next.todos = next.todos.filter((todo) => todo.id !== todoId);
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function renameOwnerTodo(workspace, todoId, label) {
    const next = normalizedOwnerWorkspace(workspace);
    const textLabel = text(label);
    if (!textLabel) return deleteOwnerTodo(next, todoId);
    const now = new Date().toISOString();
    next.todos = next.todos.map((todo) => (
      todo.id === todoId ? { ...todo, text: textLabel.slice(0, 240), updatedAt: now } : todo
    ));
    next.updatedAt = now;
    return next;
  }

  function setOwnerNotes(workspace, notes) {
    const next = normalizedOwnerWorkspace(workspace);
    next.notes = String(notes == null ? "" : notes).slice(0, 8000);
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function publicPreviewExcludesOwnerContent(model) {
    const blob = JSON.stringify(model || {});
    return !/"ownerWorkspace"|"My notes"|"Still on my list"|printable suggestion/i.test(blob);
  }

  function sanitizePublicPreviewPlan(plan) {
    const next = plan && typeof plan === "object" ? { ...plan } : {};
    delete next.ownerWorkspace;
    if (next.teachingKit && typeof next.teachingKit === "object") {
      next.teachingKit = { ...next.teachingKit };
      delete next.teachingKit.printableIdeas;
    }
    return next;
  }

  function publishedLinkedResources(plan, resources) {
    const linkedIds = new Set((plan?.resourceIds || []).map((id) => text(id)).filter(Boolean));
    return (Array.isArray(resources) ? resources : []).filter((item) => (
      linkedIds.has(text(item?.id))
      && String(item.status || "").toLowerCase() === "published"
    ));
  }

  function linkedPublishedPrintables(plan, resources) {
    const linkedIds = new Set((plan?.resourceIds || []).map((id) => text(id)).filter(Boolean));
    return (Array.isArray(resources) ? resources : []).filter((item) => (
      linkedIds.has(text(item?.id))
      && String(item.status || "").toLowerCase() === "published"
    ));
  }

  function ownerFacingQualityLabel() {
    return "Quality notes";
  }

  function ownerFacingQualityHeading() {
    return "Optional improvements";
  }

  function ownerFacingLibraryHealthStatus(value) {
    const raw = text(value);
    if (!raw || /blocked|needs changes|library blocked/i.test(raw)) return "Quality notes";
    return raw;
  }

  function activityOptionalCues(activity, draftActivity) {
    const d = draftActivity && typeof draftActivity === "object" ? draftActivity : {};
    const cues = [];
    if (!text(d.setupImageUrl || activity?.setupImageUrl) && !text(d.exampleImageUrl || activity?.exampleImageUrl)) {
      cues.push("Optional: Add image");
    }
    if (!text(d.adaptations || activity?.adaptations)) cues.push("Optional: Add adaptation");
    if (!text(d.observationOpportunities || activity?.observationOpportunities)
      && !(Array.isArray(d.observationPrompts) && d.observationPrompts.length)) {
      cues.push("Optional: Add observation");
    }
    return cues;
  }

  return {
    collectTruePublishBlockers,
    ownerPublishState,
    coreLessonSnapshot,
    optionalEnhancements,
    usableActivities,
    weekdayCoverage,
    isValidAgeBand,
    normalizedOwnerWorkspace,
    normalizedOwnerTodo,
    addOwnerTodo,
    toggleOwnerTodo,
    deleteOwnerTodo,
    renameOwnerTodo,
    setOwnerNotes,
    newTodoId,
    publicPreviewExcludesOwnerContent,
    sanitizePublicPreviewPlan,
    publishedLinkedResources,
    linkedPublishedPrintables,
    activityOptionalCues,
    ownerFacingQualityLabel,
    ownerFacingQualityHeading,
    ownerFacingLibraryHealthStatus,
  };
});
