/**
 * Owner-only Binder Builder API.
 *
 * Persists binder drafts in an isolated top-level store collection.
 * Never mutates lesson plans, enrichment, publish state, or Free/Pro access.
 */
"use strict";

const crypto = require("node:crypto");
const model = require("../scripts/binder-builder-model.js");
const transform = require("../scripts/binder-builder-transform.js");
const readiness = require("../scripts/binder-builder-readiness.js");
const qr = require("../scripts/binder-builder-qr.js");
const print = require("../scripts/binder-builder-print.js");

const ACTIONS = Object.freeze([
  "list-lessons",
  "get-lesson",
  "list-drafts",
  "get-draft",
  "create-draft",
  "save-draft",
  "duplicate-draft",
  "delete-draft",
  "preview",
  "readiness",
  "qr-svg",
]);

/**
 * @param {object} deps
 */
function createBinderBuilderApi(deps) {
  const {
    readJson,
    jsonResponse,
    readStore,
    writeStoreAsync,
    requireTeachingKitOwnerAdminSession,
    teachingKit,
    normalizeEmail,
    normalizedCurriculumStore,
  } = deps;

  function requireOwner(request, body, response) {
    const session = requireTeachingKitOwnerAdminSession(request, body, response);
    if (!session) return null;
    const email = normalizeEmail(session.email || "");
    if (!teachingKit.isTeachingKitOwnerPreviewEmail(email)) {
      jsonResponse(response, 403, {
        error: "Binder Builder is restricted to the owner account.",
        code: "binder_builder_owner_required",
      });
      return null;
    }
    return session;
  }

  function readBinderStore(store) {
    return model.normalizeBinderDraftStore(store?.binderBuilder);
  }

  function writeBinderStore(store, binderStore, stamp) {
    store.binderBuilder = model.normalizeBinderDraftStore({
      ...binderStore,
      updatedAt: stamp || binderStore.updatedAt || new Date().toISOString(),
    });
  }

  function lessonSummaries(store, query) {
    const curriculum = normalizedCurriculumStore(store?.siteContent?.curriculum);
    const q = String(query?.q || "").trim().toLowerCase();
    const age = String(query?.age || "").trim().toLowerCase();
    const status = String(query?.status || "").trim().toLowerCase();
    const plan = String(query?.plan || "").trim().toLowerCase();

    return (curriculum.lessonPlans || [])
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title || "",
        age: lesson.age || "",
        theme: lesson.theme || "",
        status: lesson.status || "",
        plan: lesson.plan || "",
        coverImageUrl: lesson.coverImageUrl || "",
        coverImageAlt: lesson.coverImageAlt || "",
        updatedAt: lesson.updatedAt || "",
      }))
      .filter((lesson) => {
        if (age && String(lesson.age || "").toLowerCase() !== age) return false;
        if (status && String(lesson.status || "").toLowerCase() !== status) return false;
        if (plan && String(lesson.plan || "").toLowerCase() !== plan) return false;
        if (!q) return true;
        const hay = `${lesson.title} ${lesson.theme} ${lesson.age}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }

  function findLesson(store, lessonId) {
    const curriculum = normalizedCurriculumStore(store?.siteContent?.curriculum);
    const id = String(lessonId || "").trim();
    if (!id) return null;
    return (curriculum.lessonPlans || []).find((item) => String(item?.id || "") === id) || null;
  }

  function findDraft(binderStore, draftId) {
    const id = String(draftId || "").trim();
    if (!id) return null;
    return (binderStore.drafts || []).find((item) => item.id === id) || null;
  }

  async function handle(request, response) {
    const body = await readJson(request);
    const session = requireOwner(request, body, response);
    if (!session) return;

    const action = String(body?.action || "").trim();
    if (!ACTIONS.includes(action)) {
      return jsonResponse(response, 400, { error: "Unknown Binder Builder action.", code: "invalid_action" });
    }

    try {
      if (action === "list-lessons") {
        const store = readStore();
        return jsonResponse(response, 200, {
          lessons: lessonSummaries(store, body),
        });
      }

      if (action === "get-lesson") {
        const store = readStore();
        const lesson = findLesson(store, body.lessonId);
        if (!lesson) {
          return jsonResponse(response, 404, { error: "Lesson not found.", code: "lesson_not_found" });
        }
        return jsonResponse(response, 200, { lesson });
      }

      if (action === "list-drafts") {
        const store = readStore();
        const binderStore = readBinderStore(store);
        return jsonResponse(response, 200, {
          drafts: binderStore.drafts.map((draft) => ({
            id: draft.id,
            title: draft.title,
            sourceLessonId: draft.sourceLessonId,
            ageGroup: draft.ageGroup,
            theme: draft.theme,
            status: draft.status,
            savedAt: draft.savedAt,
            updatedAt: draft.updatedAt,
            coverImageUrl: draft.coverImage?.url || "",
          })),
          updatedAt: binderStore.updatedAt,
        });
      }

      if (action === "get-draft") {
        const store = readStore();
        const binderStore = readBinderStore(store);
        const draft = findDraft(binderStore, body.draftId);
        if (!draft) {
          return jsonResponse(response, 404, { error: "Binder draft not found.", code: "draft_not_found" });
        }
        const lesson = findLesson(store, draft.sourceLessonId);
        return jsonResponse(response, 200, { draft, lesson: lesson || null });
      }

      if (action === "create-draft") {
        const store = readStore();
        const lesson = findLesson(store, body.lessonId);
        if (!lesson) {
          return jsonResponse(response, 404, { error: "Lesson not found.", code: "lesson_not_found" });
        }
        const stamp = new Date().toISOString();
        const draft = model.createDraftFromLesson(lesson, {
          id: `bb-draft-${crypto.randomBytes(8).toString("hex")}`,
          personalization: body.personalization,
        });
        draft.createdAt = stamp;
        draft.updatedAt = stamp;
        draft.savedAt = stamp;

        const binderStore = readBinderStore(store);
        binderStore.drafts = [draft, ...binderStore.drafts].slice(0, 200);
        writeBinderStore(store, binderStore, stamp);
        await writeStoreAsync(store);
        return jsonResponse(response, 200, { draft, lesson });
      }

      if (action === "save-draft") {
        const store = readStore();
        const incoming = model.normalizeBinderDraft(body.draft);
        if (!incoming.id) {
          return jsonResponse(response, 400, { error: "Draft id is required.", code: "missing_draft_id" });
        }
        if (incoming.sourceLessonId) {
          const lesson = findLesson(store, incoming.sourceLessonId);
          if (!lesson) {
            return jsonResponse(response, 404, { error: "Linked lesson not found.", code: "lesson_not_found" });
          }
        }
        const stamp = new Date().toISOString();
        incoming.updatedAt = stamp;
        incoming.savedAt = stamp;

        const binderStore = readBinderStore(store);
        const index = binderStore.drafts.findIndex((item) => item.id === incoming.id);
        if (index >= 0) {
          incoming.createdAt = binderStore.drafts[index].createdAt || stamp;
          binderStore.drafts[index] = incoming;
        } else {
          incoming.createdAt = incoming.createdAt || stamp;
          binderStore.drafts.unshift(incoming);
        }
        binderStore.drafts = binderStore.drafts.slice(0, 200);
        writeBinderStore(store, binderStore, stamp);
        await writeStoreAsync(store);
        return jsonResponse(response, 200, { draft: incoming });
      }

      if (action === "duplicate-draft") {
        const store = readStore();
        const binderStore = readBinderStore(store);
        const existing = findDraft(binderStore, body.draftId);
        if (!existing) {
          return jsonResponse(response, 404, { error: "Binder draft not found.", code: "draft_not_found" });
        }
        const stamp = new Date().toISOString();
        const copy = model.duplicateDraft(existing);
        copy.id = `bb-draft-${crypto.randomBytes(8).toString("hex")}`;
        copy.createdAt = stamp;
        copy.updatedAt = stamp;
        copy.savedAt = stamp;
        binderStore.drafts.unshift(copy);
        binderStore.drafts = binderStore.drafts.slice(0, 200);
        writeBinderStore(store, binderStore, stamp);
        await writeStoreAsync(store);
        return jsonResponse(response, 200, { draft: copy });
      }

      if (action === "delete-draft") {
        const store = readStore();
        const binderStore = readBinderStore(store);
        const before = binderStore.drafts.length;
        binderStore.drafts = binderStore.drafts.filter((item) => item.id !== String(body.draftId || ""));
        if (binderStore.drafts.length === before) {
          return jsonResponse(response, 404, { error: "Binder draft not found.", code: "draft_not_found" });
        }
        const stamp = new Date().toISOString();
        writeBinderStore(store, binderStore, stamp);
        await writeStoreAsync(store);
        return jsonResponse(response, 200, { ok: true });
      }

      if (action === "qr-svg") {
        const checked = qr.validateBinderUrl(body.url);
        if (!checked.ok) {
          return jsonResponse(response, 400, { error: checked.error, code: "invalid_url", ok: false });
        }
        const svg = await qr.renderQrSvg(checked.url, { size: body.size, margin: body.margin });
        return jsonResponse(response, 200, { ok: true, url: checked.url, hostname: checked.hostname, svg });
      }

      if (action === "preview" || action === "readiness") {
        const store = readStore();
        const draft = model.normalizeBinderDraft(body.draft);
        const lesson = draft.sourceLessonId ? findLesson(store, draft.sourceLessonId) : null;
        const report = readiness.evaluateBinderReadiness(draft, lesson);

        /** @type {Record<string, string>} */
        const qrSvgByUrl = {};
        const urls = [];
        (draft.books || []).forEach((book) => {
          if (book.resourceUrl && book.qrEnabled !== false) urls.push(book.resourceUrl);
        });
        (draft.songs || []).forEach((song) => {
          if (song.resourceUrl && song.qrEnabled !== false) urls.push(song.resourceUrl);
        });
        const uniqueUrls = [...new Set(urls.map((item) => String(item || "").trim()).filter(Boolean))];
        await Promise.all(uniqueUrls.map(async (url) => {
          const checked = qr.validateBinderUrl(url);
          if (!checked.ok) return;
          try {
            qrSvgByUrl[url] = await qr.renderQrSvg(checked.url);
          } catch {
            // Readiness already flags invalid QR; skip broken SVG.
          }
        }));

        const assetOrigin = (() => {
          try {
            const host = String(request.headers?.host || "").trim();
            if (!host) return "";
            const proto = String(request.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
            return `${proto}://${host}`;
          } catch {
            return "";
          }
        })();
        const printed = print.buildBinderPrintHtml(draft, lesson, {
          qrSvgByUrl,
          mode: "preview",
          assetOrigin,
        });

        // Snapshot lesson identity fields to prove non-mutation in tests/clients.
        const lessonSnapshot = lesson
          ? {
            id: lesson.id,
            title: lesson.title,
            updatedAt: lesson.updatedAt,
            weeklyMaterials: lesson.weeklyMaterials || "",
          }
          : null;

        return jsonResponse(response, 200, {
          readiness: report,
          pages: printed.pages,
          html: printed.html,
          document: printed.document,
          lessonSnapshot,
        });
      }

      return jsonResponse(response, 400, { error: "Unhandled action.", code: "unhandled_action" });
    } catch (error) {
      return jsonResponse(response, 500, {
        error: error?.message || "Binder Builder request failed.",
        code: "binder_builder_error",
      });
    }
  }

  return {
    handle,
    ACTIONS,
    // Exported for tests
    readBinderStore,
    lessonSummaries,
    findLesson,
  };
}

function mergeStorePreserveBinderBuilder(next, previous) {
  if (!next || typeof next !== "object") return next;
  if (previous && previous.binderBuilder && !next.binderBuilder) {
    next.binderBuilder = previous.binderBuilder;
  }
  return next;
}

module.exports = {
  createBinderBuilderApi,
  mergeStorePreserveBinderBuilder,
};
