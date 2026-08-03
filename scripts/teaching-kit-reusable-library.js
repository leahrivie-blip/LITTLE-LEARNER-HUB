/**
 * Teaching Kit Reusable Library + Lesson Connections.
 * Prefer existing approved resources over generating duplicates.
 * Never overwrites published lessons. Pure helpers + optional store shape.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitReusableLibrary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ITEM_TYPES = Object.freeze([
    "observation",
    "teacher_tip",
    "printable",
    "activity",
    "family_connection",
    "setup",
    "toolkit",
    "song",
    "book",
    "vocabulary",
    "image_example",
  ]);

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeKey(value) {
    return text(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenSet(value) {
    return new Set(normalizeKey(value).split(" ").filter((t) => t.length > 2));
  }

  function jaccard(a, b) {
    const A = tokenSet(a);
    const B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let overlap = 0;
    A.forEach((t) => { if (B.has(t)) overlap += 1; });
    return overlap / (A.size + B.size - overlap);
  }

  function emptyLibrary() {
    return {
      items: [],
      updatedAt: "",
    };
  }

  function normalizeItem(raw, index = 0) {
    if (!raw || typeof raw !== "object") return null;
    const type = text(raw.type).toLowerCase().replace(/\s+/g, "_");
    if (!ITEM_TYPES.includes(type)) return null;
    const title = text(raw.title || raw.name).slice(0, 160);
    const body = text(raw.body || raw.text || raw.content).slice(0, 4000);
    if (!title && !body) return null;
    return {
      id: text(raw.id).slice(0, 80) || `reuse-${type}-${index + 1}-${Date.now().toString(36)}`,
      type,
      title: title || body.slice(0, 60),
      body,
      tags: asArray(raw.tags).map((t) => text(t).slice(0, 40)).filter(Boolean).slice(0, 16),
      theme: text(raw.theme).slice(0, 80),
      age: text(raw.age).slice(0, 40),
      sourcePlanId: text(raw.sourcePlanId).slice(0, 160),
      sourceField: text(raw.sourceField).slice(0, 80),
      resourceId: text(raw.resourceId).slice(0, 160),
      createdAt: text(raw.createdAt) || new Date().toISOString(),
      useCount: Math.max(0, Number(raw.useCount) || 0),
    };
  }

  function normalizeLibrary(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const items = asArray(input.items).map(normalizeItem).filter(Boolean).slice(0, 2000);
    return {
      items,
      updatedAt: text(input.updatedAt),
    };
  }

  function saveReusableItem(libraryInput, itemInput) {
    const library = normalizeLibrary(libraryInput);
    const item = normalizeItem(itemInput, library.items.length);
    if (!item) return { library, saved: null, duplicate: null };
    const duplicate = library.items.find((existing) => (
      existing.type === item.type
      && (
        normalizeKey(existing.title) === normalizeKey(item.title)
        || jaccard(existing.title + " " + existing.body, item.title + " " + item.body) >= 0.82
      )
    )) || null;
    if (duplicate) {
      return { library, saved: null, duplicate };
    }
    library.items = [item, ...library.items].slice(0, 2000);
    library.updatedAt = new Date().toISOString();
    return { library, saved: item, duplicate: null };
  }

  function recommendReusable(libraryInput, {
    type = "",
    query = "",
    theme = "",
    age = "",
    limit = 8,
  } = {}) {
    const library = normalizeLibrary(libraryInput);
    const typeKey = text(type).toLowerCase().replace(/\s+/g, "_");
    const q = normalizeKey(query);
    const themeKey = normalizeKey(theme);
    return library.items
      .filter((item) => !typeKey || item.type === typeKey)
      .map((item) => {
        let score = 0;
        if (q) score += jaccard(q, `${item.title} ${item.body} ${item.tags.join(" ")}`) * 3;
        if (themeKey && normalizeKey(item.theme) === themeKey) score += 1.2;
        if (themeKey) score += jaccard(themeKey, item.theme || item.title) * 0.8;
        if (age && normalizeKey(item.age) === normalizeKey(age)) score += 0.5;
        score += Math.min(0.4, (item.useCount || 0) * 0.05);
        return { item, score };
      })
      .filter((row) => row.score > 0.15 || (!q && !themeKey))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(Number(limit) || 8, 24)))
      .map((row) => ({
        ...row.item,
        matchScore: Number(row.score.toFixed(3)),
        recommendation: "Reuse this existing library item instead of creating a duplicate.",
      }));
  }

  /**
   * Scan curriculum for existing printables/songs/books/vocab/activities that match the lesson.
   * Prefer linking over duplicating.
   */
  function findLessonConnections(plan, curriculum = {}, enrichmentDraft = null) {
    const theme = text(plan?.theme || plan?.title);
    const age = text(plan?.age);
    const draftWeek = enrichmentDraft?.week && typeof enrichmentDraft.week === "object"
      ? enrichmentDraft.week
      : {};
    const resources = asArray(curriculum.resources);
    const plans = asArray(curriculum.lessonPlans);
    const activities = asArray(curriculum.activities);

    const connections = [];

    resources.forEach((resource) => {
      const title = text(resource.title || resource.name);
      const score = jaccard(theme, title) + (normalizeKey(title).includes("vocab") ? 0.2 : 0);
      if (score >= 0.2 || normalizeKey(title).includes(normalizeKey(theme).split(" ")[0] || "___")) {
        connections.push({
          kind: "printable_resource",
          message: `We already have this printable: “${title}”. Link it instead of creating another.`,
          resourceId: text(resource.id),
          title,
          score,
        });
      }
    });

    const existingSongs = [
      ...asArray(plan?.songs),
      ...asArray(draftWeek.songs),
      ...plans.flatMap((p) => asArray(p.songs)),
    ];
    const seenSongs = new Set();
    existingSongs.forEach((song) => {
      const title = text(song?.title || song);
      const key = normalizeKey(title);
      if (!title || seenSongs.has(key)) return;
      seenSongs.add(key);
      if (jaccard(theme, title) >= 0.18) {
        connections.push({
          kind: "song",
          message: `This song already exists: “${title}”. Reuse it.`,
          title,
          score: jaccard(theme, title),
        });
      }
    });

    const existingBooks = [
      ...asArray(plan?.books),
      ...asArray(draftWeek.books),
      ...plans.flatMap((p) => asArray(p.books)),
    ];
    const seenBooks = new Set();
    existingBooks.forEach((book) => {
      const title = text(book?.title || book);
      const key = normalizeKey(title);
      if (!title || seenBooks.has(key)) return;
      seenBooks.add(key);
      if (jaccard(theme, title) >= 0.18) {
        connections.push({
          kind: "book",
          message: `We already built this book suggestion: “${title}”.`,
          title,
          score: jaccard(theme, title),
        });
      }
    });

    const vocabBits = [
      text(plan?.vocabularyWords),
      ...asArray(draftWeek.vocabCards),
    ].join(" ");
    if (vocabBits && theme) {
      connections.push({
        kind: "vocabulary",
        message: `Vocabulary already exists for this lesson — extend it instead of starting over.`,
        title: "Existing vocabulary",
        score: 0.5,
        sample: vocabBits.slice(0, 120),
      });
    }

    activities
      .filter((act) => act.lessonPlanId && act.lessonPlanId !== plan?.id)
      .forEach((act) => {
        const title = text(act.title);
        const score = jaccard(theme, title);
        if (score >= 0.35) {
          connections.push({
            kind: "activity",
            message: `We already built a similar activity: “${title}”. Adapt it instead of duplicating.`,
            title,
            activityId: text(act.id),
            score,
          });
        }
      });

    return connections
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
  }

  function preferReusableOverGenerated(suggestions, libraryInput, connections = []) {
    const recommendations = recommendReusable(libraryInput, { limit: 20 });
    const reuseHints = [];
    const kept = asArray(suggestions).map((sug) => {
      const category = text(sug.category);
      const proposed = text(sug.proposedText);
      const typeMap = {
        printable_ideas: "printable",
        vocab_cards: "vocabulary",
        songs: "song",
        books: "book",
        teacher_tips: "teacher_tip",
        observation_prompts: "observation",
        family_connection: "family_connection",
        setup: "setup",
        toolkit_prep: "toolkit",
      };
      const type = typeMap[category] || "";
      const match = recommendations.find((item) => (
        (!type || item.type === type)
        && jaccard(`${item.title} ${item.body}`, proposed) >= 0.4
      ));
      const connection = asArray(connections).find((c) => (
        jaccard(c.title || "", proposed) >= 0.4
        || (type === "printable" && c.kind === "printable_resource")
      ));
      if (match || connection) {
        reuseHints.push({
          suggestionId: sug.id,
          category,
          reusableItemId: match?.id || "",
          connectionKind: connection?.kind || "",
          message: match
            ? `Reuse “${match.title}” from your library instead of a new draft.`
            : (connection?.message || "Reuse an existing resource."),
        });
        return {
          ...sug,
          reuseRecommended: true,
          reusableItemId: match?.id || "",
          proposedText: match
            ? `REUSE: ${match.title}\n${match.body}`
            : `REUSE EXISTING: ${connection.title}\n${connection.message}`,
        };
      }
      return sug;
    });
    return { suggestions: kept, reuseHints };
  }

  return {
    ITEM_TYPES,
    emptyLibrary,
    normalizeLibrary,
    normalizeItem,
    saveReusableItem,
    recommendReusable,
    findLessonConnections,
    preferReusableOverGenerated,
    jaccard,
    normalizeKey,
  };
});
