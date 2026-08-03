/**
 * Teaching Kit Enrichment Editor — admin focused workspace.
 * Behind featureFlags.teachingKitEnrichmentEditor (default false).
 * Print Center remains the existing Teaching Kit print path (not a new Enrichment feature).
 */
(function (root) {
  "use strict";

  const api = () => root.LLHTeachingKitEnrichment;
  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const DAY_LABEL = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri" };
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
  /** Draft media blob cache: admin media URL → object URL (Authorization header fetch). */
  const draftMediaBlobCache = new Map();
  const draftMediaBlobInflight = new Map();

  const state = {
    open: false,
    planId: "",
    mode: "activities", // activities | week | preview
    activityIndex: 0,
    dayFilter: "all",
    draft: { activities: {}, week: {}, updatedAt: "", lastEditedBy: "", previewReady: false },
    autosaveTimer: null,
    dirty: false,
    jumpQuery: "",
    jumpOpen: false,
    lightboxUrl: "",
    publishOpen: false,
    statusText: "",
    summaryOpen: true,
    previewViewport: "desktop", // desktop | tablet | mobile
    previewDay: "monday",
    previewUnbind: null,
    pendingCleanupAssetIds: [], // deferred until draft save succeeds
    lastSavedDraft: null,
    aiTray: {
      open: false,
      phase: "idle", // idle | loading | ready | error | timeout
      errorText: "",
      requestId: "",
      activityKey: "",
      scope: "activity",
      suggestions: [],
      abortController: null,
    },
  };

  function isEditorFlagEnabled() {
    const flags = (typeof effectiveSiteContent === "function" ? effectiveSiteContent() : null)?.featureFlags || {};
    if (root.LLHTeachingKit?.isTeachingKitEnrichmentEditorEnabled) {
      return root.LLHTeachingKit.isTeachingKitEnrichmentEditorEnabled(flags) === true;
    }
    return flags.teachingKitEnrichmentEditor === true;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function host() {
    return document.querySelector("#adminTeachingKitEnrichmentHost");
  }

  function getPlan() {
    if (typeof curriculumLessonPlanById === "function") return curriculumLessonPlanById(state.planId);
    return null;
  }

  function getActivities(plan) {
    const enrich = api();
    const storeActs = typeof curriculumActivitiesForLesson === "function"
      ? curriculumActivitiesForLesson(plan.id)
      : [];
    return enrich.flattenLessonActivities(plan, storeActs);
  }

  function draftKey(act) {
    return String(act.id || act.itemId || "").trim();
  }

  function ensureDraftActivity(key) {
    if (!state.draft.activities[key]) state.draft.activities[key] = {};
    return state.draft.activities[key];
  }

  function recomputePercent(plan, activities) {
    return api().computeCompletionPercent(plan, activities, state.draft);
  }

  function markDirty({ autosave = true } = {}) {
    state.dirty = true;
    state.statusText = autosave ? "Unsaved changes…" : "AI suggestions in draft (not saved). Click Save draft when ready.";
    if (autosave) scheduleAutosave();
    else clearTimeout(state.autosaveTimer);
    renderChromeOnly();
    schedulePreviewRefresh();
  }

  function schedulePreviewRefresh() {
    clearTimeout(state._previewTimer);
    state._previewTimer = setTimeout(() => {
      const plan = getPlan();
      if (!plan) return;
      paintLivePreview(plan, getActivities(plan));
    }, 160);
  }

  function scheduleAutosave() {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => {
      void saveDraft({ silent: true });
    }, 1200);
  }

  function resetAiTray() {
    if (state.aiTray.abortController) {
      try { state.aiTray.abortController.abort(); } catch (_error) { /* ignore */ }
    }
    state.aiTray = {
      open: false,
      phase: "idle",
      errorText: "",
      requestId: "",
      activityKey: "",
      scope: "activity",
      suggestions: [],
      abortController: null,
    };
  }

  function currentAiActivityKey(plan) {
    const act = getActivities(plan)[state.activityIndex];
    return act ? draftKey(act) : "";
  }

  async function requestAiSuggestions({ scope = "activity", simulate = "" } = {}) {
    const plan = getPlan();
    if (!plan) return;
    const token = adminToken();
    if (!token) {
      state.statusText = "Admin unlock required for AI suggestions.";
      renderChromeOnly();
      return;
    }
    if (state.aiTray.abortController) {
      try { state.aiTray.abortController.abort(); } catch (_error) { /* ignore */ }
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const activityKey = scope === "week" ? "" : currentAiActivityKey(plan);
    state.aiTray.open = true;
    state.aiTray.phase = "loading";
    state.aiTray.errorText = "";
    state.aiTray.suggestions = [];
    state.aiTray.scope = scope;
    state.aiTray.activityKey = activityKey;
    state.aiTray.requestId = "";
    state.aiTray.abortController = controller;
    state.statusText = "Requesting AI suggestions…";
    render();

    const body = {
      adminToken: token,
      planId: plan.id,
      activityKey,
      scope,
    };
    if (simulate) body.simulate = simulate;

    try {
      const response = await fetch("/api/admin/curriculum/enrichment-ai-suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (controller && controller.signal.aborted) return;
      if (!response.ok) {
        const code = String(data.code || "");
        state.aiTray.phase = code === "enrichment_ai_timeout" ? "timeout" : "error";
        state.aiTray.errorText = data.error || `AI request failed (HTTP ${response.status}). Existing content was not changed.`;
        state.aiTray.requestId = data.requestId || "";
        state.statusText = state.aiTray.phase === "timeout"
          ? "AI timed out — draft unchanged."
          : "AI suggestion failed — draft unchanged.";
        render();
        return;
      }
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions.map((item) => ({
        ...item,
        decision: "pending",
        selected: true,
        editing: false,
        editText: item.proposedText || "",
      })) : [];
      state.aiTray.phase = "ready";
      state.aiTray.suggestions = suggestions;
      state.aiTray.requestId = data.requestId || "";
      state.statusText = data.duplicate
        ? "Reused recent AI suggestions — review before inserting."
        : `AI returned ${suggestions.length} suggestion(s). Nothing saved until you insert.`;
      render();
    } catch (error) {
      if (error && error.name === "AbortError") {
        state.aiTray.phase = "idle";
        state.aiTray.open = false;
        state.statusText = "AI suggestion canceled. Draft unchanged.";
        render();
        return;
      }
      state.aiTray.phase = "error";
      state.aiTray.errorText = networkErrorMessage(error, "AI suggestion failed. Existing content was not changed.");
      state.statusText = "AI suggestion failed — draft unchanged.";
      render();
    }
  }

  function cancelAiSuggestions() {
    if (state.aiTray.abortController) {
      try { state.aiTray.abortController.abort(); } catch (_error) { /* ignore */ }
    }
    resetAiTray();
    state.statusText = "AI suggestion canceled. Draft unchanged.";
    render();
  }

  async function logAiInsert(fields, insertedCount) {
    const token = adminToken();
    if (!token) return;
    try {
      await fetch("/api/admin/curriculum/enrichment-ai-insert-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adminToken: token,
          planId: state.planId,
          activityKey: state.aiTray.activityKey || "",
          requestId: state.aiTray.requestId || "",
          fields,
          insertedCount,
        }),
      });
    } catch (_error) {
      /* logging best-effort */
    }
  }

  function applyAiSuggestionEdits(sug) {
    if (!sug.editing) return sug;
    const textValue = String(sug.editText || "").trim();
    if (sug.field === "substitutions") {
      const parts = textValue.split(/→|->/).map((p) => p.trim());
      if (parts.length >= 2) {
        const need = parts[0].replace(/^No\s+/i, "");
        const use = parts.slice(1).join(" ").replace(/^use\s+/i, "");
        return {
          ...sug,
          proposedText: textValue,
          proposedValue: { need, use },
          editing: false,
        };
      }
    }
    return {
      ...sug,
      proposedText: textValue,
      proposedValue: textValue,
      editing: false,
    };
  }

  async function insertSelectedAiSuggestions() {
    const plan = getPlan();
    const enrich = api();
    if (!plan || !enrich?.applySuggestionsToDraft) return;
    const suggestions = state.aiTray.suggestions.map((sug) => {
      const next = applyAiSuggestionEdits({ ...sug });
      if (next.decision === "discarded") return { ...next, selected: false };
      if (next.selected || next.decision === "accepted") {
        return { ...next, decision: "accepted", selected: true };
      }
      return { ...next, selected: false };
    });
    const toInsert = suggestions.filter((s) => s.selected && s.decision === "accepted");
    if (!toInsert.length) {
      state.statusText = "Select at least one suggestion to insert.";
      renderChromeOnly();
      return;
    }

    // Canonical pure apply (shared with server) — never auto-save / publish.
    const activityKey = state.aiTray.activityKey || currentAiActivityKey(plan);
    const applied = enrich.applySuggestionsToDraft(state.draft, toInsert, { activityKey });
    state.draft = applied.draft;
    const insertedCount = (applied.inserted || []).length;
    await logAiInsert(applied.fields || [], insertedCount);
    resetAiTray();
    markDirty({ autosave: false });
    state.statusText = insertedCount
      ? `Inserted ${insertedCount} AI suggestion(s) into draft only — not saved, not published.`
      : "No suggestions inserted.";
    render();
  }

  function queueMediaCleanup(mediaAssetId) {
    const id = String(mediaAssetId || "").trim();
    if (!id) return;
    if (!state.pendingCleanupAssetIds.includes(id)) {
      state.pendingCleanupAssetIds.push(id);
    }
  }

  async function flushPendingMediaCleanup(planId) {
    const token = adminToken();
    const ids = [...state.pendingCleanupAssetIds];
    state.pendingCleanupAssetIds = [];
    for (const mediaAssetId of ids) {
      try {
        await fetch("/api/admin/curriculum/enrichment-photos/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            adminToken: token,
            mediaAssetId,
            lessonPlanId: planId || state.planId,
            reason: "draft_replace_or_remove",
          }),
        });
      } catch (_error) {
        // Server draft-save cleanup is the safety net; keep going.
      }
    }
  }

  async function saveDraft({ silent = false } = {}) {
    const plan = getPlan();
    if (!plan) return false;
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    const endpoint = root.curriculumLessonPlanConfig?.endpoint || "/api/admin/curriculum/lesson-plans";
    if (!token) {
      state.statusText = "Admin unlock required to save draft.";
      renderChromeOnly();
      return false;
    }
    const activities = getActivities(plan);
    state.draft.completionPercent = recomputePercent(plan, activities);
    state.draft.updatedAt = new Date().toISOString();
    const admin = typeof adminSession === "function" ? adminSession() : null;
    state.draft.lastEditedBy = String(admin?.email || admin?.name || state.draft.lastEditedBy || "admin").trim();
    const draftSnapshot = JSON.parse(JSON.stringify(state.draft));
    try {
      const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
        ? curriculumExpectedUpdatedAt()
        : "";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          saveMode: "enrichment_draft",
          expectedUpdatedAt,
          lessonPlan: {
            id: plan.id,
            enrichmentDraft: state.draft,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (data.curriculum && typeof applyCurriculumState === "function") {
        applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
      }
      state.dirty = false;
      state.lastSavedDraft = draftSnapshot;
      // Only after successful draft save may unused replaced/removed assets be cleaned up.
      await flushPendingMediaCleanup(plan.id);
      state.statusText = silent
        ? `Draft autosaved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Draft saved. Published lesson unchanged until you Publish.";
      render();
      return true;
    } catch (error) {
      // Failed draft save must not erase previously saved photos — keep lastSavedDraft refs
      // and do not flush pending cleanup (old assets may still be referenced server-side).
      state.statusText = networkErrorMessage(error, `Draft save failed: ${error.message || error}`);
      renderChromeOnly();
      return false;
    }
  }

  async function publishEnrichment() {
    const plan = getPlan();
    if (!plan) return;
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    const endpoint = root.curriculumLessonPlanConfig?.endpoint || "/api/admin/curriculum/lesson-plans";
    const saved = await saveDraft({ silent: true });
    if (!saved && state.dirty) {
      state.statusText = "Publish canceled — draft save failed. Previous published lesson unchanged.";
      renderChromeOnly();
      return;
    }
    const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
      ? curriculumExpectedUpdatedAt()
      : "";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        saveMode: "publish_enrichment",
        expectedUpdatedAt,
        publishedBy: state.draft.lastEditedBy || "",
        lessonPlan: { id: plan.id, enrichmentDraft: state.draft },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (data.curriculum && typeof applyCurriculumState === "function") {
      applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
    }
    state.draft = { activities: {}, week: {}, updatedAt: "", lastEditedBy: "", previewReady: false };
    state.lastSavedDraft = null;
    state.pendingCleanupAssetIds = [];
    state.publishOpen = false;
    state.statusText = data.duplicate
      ? "Already published — no duplicate version created."
      : `Published enrichment to providers${data.versionId ? ` (${data.versionId})` : ""}.`;
    render();
    if (typeof showActionFeedback === "function") {
      showActionFeedback(data.duplicate
        ? "Enrichment already published for this lesson."
        : "Teaching Kit enrichment published for this lesson.");
    }
  }

  function open(planId) {
    if (!isEditorFlagEnabled()) {
      if (typeof showActionFeedback === "function") {
        showActionFeedback("Enrichment Editor is disabled (feature flag off).");
      }
      return;
    }
    const plan = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(planId) : null;
    if (!plan) return;
    state.open = true;
    state.planId = planId;
    state.mode = "activities";
    state.dayFilter = "all";
    state.jumpOpen = false;
    state.jumpQuery = "";
    state.lightboxUrl = "";
    state.publishOpen = false;
    state.pendingCleanupAssetIds = [];
    resetAiTray();
    state.lastSavedDraft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
      : null;
    state.draft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
      : { activities: {}, week: {}, updatedAt: "", lastEditedBy: "", previewReady: false };
    if (!state.draft.activities) state.draft.activities = {};
    if (!state.draft.week) state.draft.week = {};
    state.summaryOpen = true;
    state.previewViewport = "desktop";
    state.previewDay = "monday";
    const activities = getActivities(plan);
    state.activityIndex = api().firstIncompleteActivityIndex(activities, state.draft.activities);
    const first = activities[state.activityIndex];
    if (first?.dayOfWeek) state.previewDay = String(first.dayOfWeek);
    state._focusReturn = document.activeElement;
    document.body.classList.add("tk-enrich-open");
    render();
    requestAnimationFrame(() => {
      document.querySelector("[data-enrich-exit]")?.focus?.();
    });
  }

  function close() {
    clearTimeout(state.autosaveTimer);
    clearTimeout(state._previewTimer);
    if (typeof state.previewUnbind === "function") {
      try { state.previewUnbind(); } catch (_error) { /* ignore */ }
    }
    state.previewUnbind = null;
    resetAiTray();
    state.publishOpen = false;
    state.lightboxUrl = "";
    state.jumpOpen = false;
    if (state.dirty) {
      if (!isEditorFlagEnabled()) {
        state.statusText = "Enrichment Editor disabled — unsaved draft kept locally only.";
      } else {
        state.statusText = "Saving draft before exit…";
        void saveDraft({ silent: true });
      }
    }
    state.open = false;
    document.body.classList.remove("tk-enrich-open");
    revokeDraftMediaBlobs();
    const el = host();
    if (el) el.innerHTML = "";
    if (typeof renderAdminCurriculumLessonPlanManager === "function") {
      renderAdminCurriculumLessonPlanManager();
    }
  }

  function filteredActivities(activities) {
    if (state.dayFilter === "all") return activities;
    return activities.filter((a) => String(a.dayOfWeek) === state.dayFilter);
  }

  function adminToken() {
    return typeof adminSession === "function" ? (adminSession()?.token || "") : "";
  }

  function isAdminEnrichmentMediaUrl(url) {
    return String(url || "").includes("/api/admin/media/enrichment-photos/");
  }

  function mediaCacheKey(url) {
    return String(url || "").trim().split("#")[0];
  }

  function resolveDraftMediaDisplayUrl(url) {
    const key = mediaCacheKey(url);
    if (!key) return "";
    if (!isAdminEnrichmentMediaUrl(key)) return key;
    return draftMediaBlobCache.get(key) || "";
  }

  async function fetchDraftMediaBlobUrl(url) {
    const key = mediaCacheKey(url);
    if (!key) return "";
    if (!isAdminEnrichmentMediaUrl(key)) return key;
    if (draftMediaBlobCache.has(key)) return draftMediaBlobCache.get(key);
    if (draftMediaBlobInflight.has(key)) return draftMediaBlobInflight.get(key);
    const token = adminToken();
    if (!token || typeof fetch !== "function") return "";
    const promise = fetch(key, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Draft media HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      draftMediaBlobCache.set(key, objectUrl);
      return objectUrl;
    }).catch((error) => {
      console.warn("[tk-enrich] draft media fetch failed", error.message || error);
      return "";
    }).finally(() => {
      draftMediaBlobInflight.delete(key);
    });
    draftMediaBlobInflight.set(key, promise);
    return promise;
  }

  function hydrateDraftMediaImages(rootEl) {
    const root = rootEl || host();
    if (!root) return;
    root.querySelectorAll("img[data-admin-media-src]").forEach((img) => {
      const src = img.getAttribute("data-admin-media-src") || "";
      if (!src) return;
      void fetchDraftMediaBlobUrl(src).then((objectUrl) => {
        if (!objectUrl || !img.isConnected) return;
        img.src = objectUrl;
        img.hidden = false;
      });
    });
    root.querySelectorAll("img[src*='/api/admin/media/enrichment-photos/']").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (!isAdminEnrichmentMediaUrl(src)) return;
      img.setAttribute("data-admin-media-src", src.split("?")[0]);
      img.removeAttribute("src");
      void fetchDraftMediaBlobUrl(src.split("?")[0]).then((objectUrl) => {
        if (!objectUrl || !img.isConnected) return;
        img.src = objectUrl;
        img.hidden = false;
      });
    });
  }

  function revokeDraftMediaBlobs() {
    draftMediaBlobCache.forEach((objectUrl) => {
      try { URL.revokeObjectURL(objectUrl); } catch (_error) { /* ignore */ }
    });
    draftMediaBlobCache.clear();
    draftMediaBlobInflight.clear();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }

  function validatePhotoFile(file) {
    if (!file) return { ok: false, error: "Choose a photo to upload." };
    const type = String(file.type || "").toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(type)) {
      return { ok: false, error: "Use a JPEG, PNG, WebP, or GIF image." };
    }
    if (Number(file.size || 0) > PHOTO_MAX_BYTES) {
      return { ok: false, error: "Image must be 5 MB or smaller." };
    }
    return { ok: true };
  }

  function mediaAssetField(field) {
    return field === "exampleImageUrl" ? "exampleMediaAssetId" : "setupMediaAssetId";
  }

  function mediaThumbField(field) {
    return field === "exampleImageUrl" ? "exampleImageThumbUrl" : "setupImageThumbUrl";
  }

  async function applyPhoto(key, field, file) {
    const check = validatePhotoFile(file);
    if (!check.ok) {
      state.statusText = check.error;
      renderChromeOnly();
      return;
    }
    const token = adminToken();
    if (!token) {
      state.statusText = "Admin session required to upload photos.";
      renderChromeOnly();
      return;
    }
    const plan = getPlan();
    if (!plan?.id) return;
    state.statusText = "Uploading photo…";
    renderChromeOnly();
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/admin/curriculum/enrichment-photos/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adminToken: token,
          lessonPlanId: plan.id,
          activityKey: key,
          field,
          fileName: file.name || "activity-photo",
          fileData: dataUrl,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        state.statusText = json.error || "Photo upload failed.";
        renderChromeOnly();
        return;
      }
      const draftAct = ensureDraftActivity(key);
      const prevAsset = draftAct[mediaAssetField(field)];
      draftAct[field] = json.mediaUrl || "";
      draftAct[mediaThumbField(field)] = json.thumbUrl || json.mediaUrl || "";
      draftAct[mediaAssetField(field)] = json.mediaAssetId || "";
      // Defer cleanup until draft save succeeds so a failed save keeps the previous photo.
      if (prevAsset && prevAsset !== draftAct[mediaAssetField(field)]) {
        queueMediaCleanup(prevAsset);
      }
      state.statusText = json.optimized
        ? "Photo uploaded (optimized + thumbnail)."
        : "Photo uploaded.";
      markDirty();
      render();
    } catch (error) {
      state.statusText = `Photo upload failed: ${error.message || error}`;
      renderChromeOnly();
    }
  }

  async function removePhoto(key, field) {
    const draftAct = ensureDraftActivity(key);
    const assetId = draftAct[mediaAssetField(field)];
    // Immediately clear draft references; cleanup bytes only after successful draft save.
    draftAct[field] = "";
    draftAct[mediaThumbField(field)] = "";
    draftAct[mediaAssetField(field)] = "";
    if (assetId) queueMediaCleanup(assetId);
    state.statusText = "Photo removed from draft.";
    markDirty();
    render();
  }

  function photoZoneHtml(label, field, view, key) {
    const url = field === "exampleImageUrl" ? view.exampleImageUrl : view.setupImageUrl;
    const thumb = field === "exampleImageUrl" ? view.exampleImageThumbUrl : view.setupImageThumbUrl;
    const displayUrl = thumb || url;
    const fullUrl = url;
    const has = Boolean(url);
    const cachedDisplay = resolveDraftMediaDisplayUrl(displayUrl);
    const cachedFull = resolveDraftMediaDisplayUrl(fullUrl);
    return `
      <div class="tk-enrich-photo" data-photo-field="${esc(field)}" data-photo-key="${esc(key)}" data-photo-full="${esc(fullUrl)}">
        <div class="tk-enrich-photo-label">${esc(label)}</div>
        <div class="tk-enrich-photo-drop ${has ? "has-photo" : ""}" tabindex="0" role="button" aria-label="${esc(label)}">
          ${has
            ? `<img src="${esc(cachedDisplay || "")}" alt="${esc(label)}" data-admin-media-src="${esc(displayUrl)}" data-photo-full="${esc(fullUrl)}" ${cachedDisplay ? "" : "hidden"} onerror="this.classList.add('is-broken');this.alt='Photo unavailable';" />`
            : `<span class="tk-enrich-photo-empty">Drop photo or click to upload<br><small>JPEG, PNG, WebP, GIF · max 5 MB</small></span>`}
          <input type="file" accept="${PHOTO_ACCEPT}" hidden />
        </div>
        <div class="tk-enrich-photo-actions">
          ${has ? `
            <button type="button" class="ghost-button" data-photo-preview>Full size</button>
            <button type="button" class="ghost-button" data-photo-replace>Replace</button>
            <button type="button" class="ghost-button" data-photo-remove>Remove</button>
          ` : `<button type="button" class="ghost-button" data-photo-replace>Upload</button>`}
        </div>
      </div>
    `;
  }

  function formatEditedDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function yn(missing) {
    return missing ? "Missing" : "Ready";
  }

  function renderUpgradeSummary(plan, activities) {
    const summary = api().buildUpgradeSummary(plan, activities, state.draft);
    const rows = [
      ["incomplete", "Incomplete activities", String(summary.incompleteActivities), summary.incompleteActivities > 0],
      ["setup", "Missing setup photos", String(summary.missingSetupPhotos), summary.missingSetupPhotos > 0],
      ["example", "Missing finished example photos", String(summary.missingExamplePhotos), summary.missingExamplePhotos > 0],
      ["tips", "Missing teacher tips", String(summary.missingTeacherTips), summary.missingTeacherTips > 0],
      ["observations", "Missing observation prompts", String(summary.missingObservationPrompts), summary.missingObservationPrompts > 0],
      ["family", "Missing family connections", yn(summary.missingFamilyConnection), summary.missingFamilyConnection],
      ["printables", "Missing printables", yn(summary.missingPrintables), summary.missingPrintables],
      ["books", "Missing books", yn(summary.missingBooks), summary.missingBooks],
      ["songs", "Missing songs", yn(summary.missingSongs), summary.missingSongs],
      ["vocabulary", "Missing vocabulary", yn(summary.missingVocabulary), summary.missingVocabulary],
      ["objectives", "Missing learning objectives", yn(summary.missingLearningObjectives), summary.missingLearningObjectives],
      ["materials", "Missing materials", yn(summary.missingMaterials), summary.missingMaterials],
    ];
    return `
      <aside class="tk-enrich-summary ${state.summaryOpen ? "is-open" : "is-collapsed"}" data-upgrade-summary>
        <div class="tk-enrich-summary-head">
          <div>
            <p class="eyebrow">Upgrade Summary</p>
            <strong>${esc(summary.completenessLabel)} · ${summary.completionPercent}%</strong>
          </div>
          <button type="button" class="ghost-button" data-summary-toggle>${state.summaryOpen ? "Hide" : "Show"}</button>
        </div>
        ${state.summaryOpen ? `
          <div class="tk-enrich-summary-stepper" aria-hidden="true">
            <span class="${summary.completionPercent < 50 ? "is-active" : "is-done"}">Legacy</span>
            <span class="${summary.completionPercent >= 50 && summary.completionPercent < 90 ? "is-active" : summary.completionPercent >= 90 ? "is-done" : ""}">Enriched</span>
            <span class="${summary.completionPercent >= 90 ? "is-active" : ""}">Complete</span>
          </div>
          <div class="tk-enrich-bar" aria-hidden="true"><i style="width:${summary.completionPercent}%"></i></div>
          <dl class="tk-enrich-summary-list">
            ${rows.map(([jump, label, value, warn]) => `
              <div class="tk-enrich-summary-row ${warn ? "is-missing" : "is-ready"}">
                <dt><button type="button" data-summary-jump="${jump}">${esc(label)}</button></dt>
                <dd>${esc(value)}</dd>
              </div>
            `).join("")}
            <div class="tk-enrich-summary-row">
              <dt>Last edited</dt>
              <dd>${esc(formatEditedDate(summary.lastEditedDate))}</dd>
            </div>
            <div class="tk-enrich-summary-row">
              <dt>Last edited by</dt>
              <dd>${esc(summary.lastEditedBy || "—")}</dd>
            </div>
            <div class="tk-enrich-summary-row">
              <dt>Draft or Published</dt>
              <dd>${esc(summary.draftOrPublished)}</dd>
            </div>
          </dl>
          <p class="muted-copy tk-enrich-summary-note">Guidance only — never blocks saving a draft.</p>
        ` : ""}
      </aside>
    `;
  }

  function renderChrome(plan, activities, percent, label) {
    const isPublished = ["published", "featured"].includes(String(plan.status || "").toLowerCase());
    const n = activities.length;
    const idx = Math.min(state.activityIndex, Math.max(0, n - 1));
    return `
      <header class="tk-enrich-chrome">
        <div class="tk-enrich-chrome-top">
          <button type="button" class="ghost-button" data-enrich-exit>← ${esc(plan.title || "Lesson")}</button>
          <div class="tk-enrich-progress-block">
            <div class="tk-enrich-stepper">
              <span class="${percent < 50 ? "is-active" : "is-done"}">Legacy</span>
              <span class="${percent >= 50 && percent < 90 ? "is-active" : percent >= 90 ? "is-done" : ""}">Enriched</span>
              <span class="${percent >= 90 ? "is-active" : ""}">Complete</span>
            </div>
            <div class="tk-enrich-percent-row">
              <strong>Overall ${percent}%</strong>
              <div class="tk-enrich-bar" aria-hidden="true"><i style="width:${percent}%"></i></div>
              <span class="tag">${esc(label)}</span>
            </div>
          </div>
          <div class="tk-enrich-chrome-actions">
            <button type="button" class="ghost-button" data-summary-toggle>Upgrade Summary</button>
            <button type="button" class="primary-button" data-enrich-save-draft>Save draft</button>
            <button type="button" class="primary-button" data-enrich-publish>Publish…</button>
          </div>
        </div>
        <div class="tk-enrich-chrome-sub">
          <div class="tk-enrich-counter">
            <strong>Activity ${n ? idx + 1 : 0} of ${n}</strong>
            <button type="button" class="ghost-button" data-enrich-prev ${idx <= 0 ? "disabled" : ""}>← Previous</button>
            <button type="button" class="ghost-button" data-enrich-next ${idx >= n - 1 ? "disabled" : ""}>Next →</button>
          </div>
          <div class="tk-enrich-jump">
            <button type="button" class="ghost-button" data-enrich-jump-toggle>Jump to…</button>
            ${state.jumpOpen ? `
              <div class="tk-enrich-jump-panel">
                <input type="search" data-enrich-jump-input placeholder="Activity, book, song, printable…" value="${esc(state.jumpQuery)}" />
                <div class="tk-enrich-jump-results" data-enrich-jump-results></div>
              </div>
            ` : ""}
          </div>
          <p class="tk-enrich-status">${esc(state.statusText || "Draft autosave on")}</p>
        </div>
        ${isPublished ? `
          <div class="tk-enrich-published-banner" role="status">
            Your changes are being saved as a draft. The published lesson will remain unchanged until you choose Publish.
          </div>
        ` : ""}
        <nav class="tk-enrich-modes" role="tablist" aria-label="Enrichment modes">
          <button type="button" role="tab" aria-selected="${state.mode === "activities" ? "true" : "false"}" class="${state.mode === "activities" ? "is-active" : ""}" data-enrich-mode="activities">Activities</button>
          <button type="button" role="tab" aria-selected="${state.mode === "week" ? "true" : "false"}" class="${state.mode === "week" ? "is-active" : ""}" data-enrich-mode="week">Week</button>
          <button type="button" role="tab" aria-selected="${state.mode === "preview" ? "true" : "false"}" class="${state.mode === "preview" ? "is-active" : ""}" data-enrich-mode="preview">Live Preview</button>
        </nav>
      </header>
    `;
  }

  function renderActivityMode(plan, activities) {
    const enrich = api();
    const current = activities[state.activityIndex] || null;
    const byDay = WEEKDAYS.map((day) => ({
      day,
      items: activities.filter((a) => a.dayOfWeek === day),
    }));
    const queue = state.dayFilter === "all"
      ? activities
      : activities.filter((a) => a.dayOfWeek === state.dayFilter);

    let stage = `<div class="empty-state">No activities on this lesson yet.</div>`;
    if (current) {
      const key = draftKey(current);
      const view = enrich.activityEnrichmentView(current, state.draft.activities[key]);
      const tags = new Set(view.settingTags);
      stage = `
        <article class="tk-enrich-stage" data-activity-key="${esc(key)}" data-activity-studio>
          <div class="tk-enrich-stage-head">
            <div>
              <h3 data-enrich-title>${esc(current.title)}</h3>
              <p class="muted-copy">${esc(DAY_LABEL[current.dayOfWeek] || current.dayOfWeek)} · ${esc(current.activityCategory || "Activity")}</p>
            </div>
            <button type="button" class="ghost-button" data-ai-suggest="activity">Suggest with AI</button>
          </div>
          <div class="tk-enrich-photo-grid">
            ${photoZoneHtml("Setup photo (before)", "setupImageUrl", view, key)}
            ${photoZoneHtml("Finished example (after)", "exampleImageUrl", view, key)}
          </div>
          <section class="tk-enrich-card-block">
            <h4>Group &amp; setting</h4>
            <p class="muted-copy">Small-group / large-group ideas and indoor / outdoor options.</p>
            <div class="tk-enrich-chips" data-setting-tags>
              ${[["small_group", "Small group"], ["large_group", "Large group"], ["indoor", "Indoor"], ["outdoor", "Outdoor"]].map(([id, label]) => `
                <button type="button" class="tk-enrich-chip ${tags.has(id) ? "is-on" : ""}" data-setting-tag="${id}">${label}</button>
              `).join("")}
            </div>
          </section>
          <section class="tk-enrich-card-block">
            <div class="tk-enrich-card-head">
              <h4>Teacher tips</h4>
            </div>
            <div class="tk-enrich-tip-list">
              ${view.teacherTips.map((tip, i) => `
                <div class="tk-enrich-tip-card">
                  <span>${esc(tip)}</span>
                  <button type="button" data-tip-remove="${i}" aria-label="Remove tip">×</button>
                </div>
              `).join("") || `<p class="muted-copy">Add a short classroom tip.</p>`}
            </div>
            <form class="tk-enrich-inline-add" data-tip-add>
              <input type="text" maxlength="280" placeholder="Add a tip (one line)" />
              <button class="ghost-button" type="submit">Add</button>
            </form>
          </section>
          <section class="tk-enrich-card-block">
            <h4>Supply substitutions</h4>
            <div class="tk-enrich-sub-list">
              ${view.substitutions.map((sub, i) => `
                <div class="tk-enrich-tip-card">
                  <span>No <strong>${esc(sub.need)}</strong> → use <strong>${esc(sub.use)}</strong></span>
                  <button type="button" data-sub-remove="${i}" aria-label="Remove substitution">×</button>
                </div>
              `).join("") || `<p class="muted-copy">Add classroom-friendly swaps.</p>`}
            </div>
            <form class="tk-enrich-inline-add" data-sub-add>
              <input name="need" type="text" placeholder="If missing…" maxlength="120" />
              <input name="use" type="text" placeholder="Use instead…" maxlength="120" />
              <button class="ghost-button" type="submit">Add</button>
            </form>
          </section>
          <section class="tk-enrich-card-block">
            <h4>Observation prompts</h4>
            <div class="tk-enrich-tip-list">
              ${view.observationPrompts.map((prompt, i) => `
                <div class="tk-enrich-tip-card">
                  <span>${esc(prompt)}</span>
                  <button type="button" data-obs-remove="${i}" aria-label="Remove prompt">×</button>
                </div>
              `).join("") || `<p class="muted-copy">Add what to watch for during this activity.</p>`}
            </div>
            <form class="tk-enrich-inline-add" data-obs-add>
              <input type="text" maxlength="280" placeholder="Add an observation prompt" />
              <button class="ghost-button" type="submit">Add</button>
            </form>
          </section>
          <section class="tk-enrich-card-block">
            <h4>Vocabulary for this activity</h4>
            <div class="tk-enrich-vocab-list">
              ${view.vocabulary.map((word, i) => `
                <span class="tk-enrich-vocab-chip">
                  ${esc(word)}
                  <button type="button" data-vocab-remove="${i}" aria-label="Remove ${esc(word)}">×</button>
                </span>
              `).join("") || `<p class="muted-copy">Add words children will hear and use.</p>`}
            </div>
            <form class="tk-enrich-inline-add" data-vocab-add>
              <input type="text" maxlength="80" placeholder="Add a vocabulary word" />
              <button class="ghost-button" type="submit">Add</button>
            </form>
          </section>
          <div class="tk-enrich-stage-nav">
            <button type="button" class="ghost-button" data-enrich-skip>Skip for now</button>
            <button type="button" class="primary-button" data-enrich-save-next>Save &amp; next →</button>
          </div>
        </article>
      `;
    }

    return `
      <div class="tk-enrich-activity-layout">
        <aside class="tk-enrich-queue">
          <div class="tk-enrich-day-chips">
            <button type="button" class="${state.dayFilter === "all" ? "is-on" : ""}" data-day-filter="all">All</button>
            ${WEEKDAYS.map((day) => `
              <button type="button" class="${state.dayFilter === day ? "is-on" : ""}" data-day-filter="${day}">${DAY_LABEL[day]}</button>
            `).join("")}
          </div>
          <ul class="tk-enrich-queue-list">
            ${queue.map((act) => {
              const key = draftKey(act);
              const status = enrich.activityStatus(act, state.draft.activities[key]);
              const globalIndex = activities.findIndex((a) => draftKey(a) === key);
              return `
                <li>
                  <button type="button" class="tk-enrich-queue-item status-${status} ${globalIndex === state.activityIndex ? "is-active" : ""}" data-activity-index="${globalIndex}">
                    <span class="tk-enrich-status-dot" title="${esc(enrich.activityStatusLabel(status))}"></span>
                    <span>
                      <strong>${esc(act.title)}</strong>
                      <small>${esc(DAY_LABEL[act.dayOfWeek] || "")} · ${esc(enrich.activityStatusLabel(status))}</small>
                    </span>
                  </button>
                </li>
              `;
            }).join("")}
          </ul>
        </aside>
        <div class="tk-enrich-stage-wrap">${stage}</div>
        <aside class="tk-enrich-live" data-enrich-live-preview></aside>
      </div>
    `;
  }

  function renderWeekMode(plan) {
    const week = state.draft.week || {};
    const milestones = Array.isArray(week.milestones) ? week.milestones : [];
    const bank = ["Sorting", "Fine motor", "Language", "Social-emotional", "Gross motor", "Creativity", "Self-help"];
    return `
      <div class="tk-enrich-week-layout">
        <div class="tk-enrich-week-ai-bar">
          <p class="muted-copy">AI can suggest family ideas and milestone language. Nothing inserts until you approve.</p>
          <button type="button" class="ghost-button" data-ai-suggest="week">Suggest with AI</button>
        </div>
        <section class="tk-enrich-card-block">
          <h4>Family connection</h4>
          <p class="muted-copy">Current text is kept unless you replace it here.</p>
          ${plan.familyConnection ? `<div class="tk-enrich-current-text">${esc(plan.familyConnection)}</div>` : ""}
          <textarea data-week-family rows="3" placeholder="Optional draft family idea…">${esc(week.familyConnection || "")}</textarea>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Milestones</h4>
          <div class="tk-enrich-chips">
            ${bank.map((m) => `
              <button type="button" class="tk-enrich-chip ${milestones.includes(m) ? "is-on" : ""}" data-milestone="${esc(m)}">${esc(m)}</button>
            `).join("")}
          </div>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Completeness checklist (guidance only)</h4>
          <p class="muted-copy">Never blocks saving a draft. Use it to aim for Complete.</p>
          <ul class="tk-enrich-checklist">
            <li>Cover & week story</li>
            <li>Photos on highlight activities</li>
            <li>Books & songs</li>
            <li>Family idea</li>
            <li>Teacher tips</li>
            <li>Printable linked</li>
            <li>Supply substitutions / group options</li>
          </ul>
          <label class="tk-enrich-check-row">
            <input type="checkbox" data-preview-ready ${week.previewReady || state.draft.previewReady ? "checked" : ""} />
            Preview looks ready
          </label>
        </section>
      </div>
    `;
  }

  function renderPreviewMode() {
    return `
      <div class="tk-enrich-preview-full">
        <div class="tk-enrich-draft-preview-label" role="status">
          <strong>Draft Preview</strong>
          <span>Same Teaching Kit UI providers see — driven by your current draft. The published lesson is unchanged until you Publish.</span>
        </div>
        <div class="tk-enrich-preview-toolbar">
          <div class="tk-enrich-preview-viewports" role="group" aria-label="Preview viewport">
            ${[["desktop", "Desktop"], ["tablet", "Tablet"], ["mobile", "Mobile"]].map(([id, label]) => `
              <button type="button" class="${state.previewViewport === id ? "is-on" : ""}" data-preview-viewport="${id}">${label}</button>
            `).join("")}
          </div>
          <div class="tk-enrich-preview-days" role="group" aria-label="Preview day">
            ${WEEKDAYS.map((day) => `
              <button type="button" class="${state.previewDay === day ? "is-on" : ""}" data-preview-day="${day}">${DAY_LABEL[day]}</button>
            `).join("")}
          </div>
        </div>
        <div class="tk-enrich-preview-frame is-${esc(state.previewViewport)}">
          <div data-enrich-live-preview class="tk-enrich-live is-wide"></div>
        </div>
      </div>
    `;
  }

  function renderAiTray() {
    if (!state.aiTray.open) return "";
    const tray = state.aiTray;
    const selectedCount = (tray.suggestions || []).filter((s) => s.selected && s.decision !== "discarded").length;
    let body = "";
    if (tray.phase === "loading") {
      body = `
        <div class="tk-enrich-ai-status" data-ai-loading>
          <p><strong>Generating suggestions…</strong></p>
          <p class="muted-copy">Existing enrichment stays unchanged. You can cancel anytime.</p>
          <button type="button" class="ghost-button" data-ai-cancel>Cancel</button>
        </div>
      `;
    } else if (tray.phase === "timeout" || tray.phase === "error") {
      body = `
        <div class="tk-enrich-ai-status" data-ai-error>
          <p><strong>${tray.phase === "timeout" ? "AI timed out" : "AI suggestion failed"}</strong></p>
          <p class="muted-copy">${esc(tray.errorText || "Existing content was not changed.")}</p>
          <div class="form-actions">
            <button type="button" class="ghost-button" data-ai-cancel>Close</button>
            <button type="button" class="primary-button" data-ai-retry>Retry</button>
          </div>
        </div>
      `;
    } else {
      const cards = (tray.suggestions || []).map((sug, index) => {
        const discarded = sug.decision === "discarded";
        return `
          <article class="tk-enrich-ai-card ${discarded ? "is-discarded" : ""} ${sug.selected ? "is-selected" : ""}" data-ai-card="${index}">
            <label class="tk-enrich-ai-select">
              <input type="checkbox" data-ai-select="${index}" ${sug.selected && !discarded ? "checked" : ""} ${discarded ? "disabled" : ""} />
              <span>Select</span>
            </label>
            <div class="tk-enrich-ai-meta">
              <strong>${esc(sug.fieldLabel || sug.field)}</strong>
              <span class="muted-copy">${esc(sug.category || "")}</span>
            </div>
            <div class="tk-enrich-ai-compare">
              <div>
                <h5>Current</h5>
                <p>${esc(sug.currentValue || "(empty)")}</p>
              </div>
              <div>
                <h5>Suggested addition</h5>
                ${sug.editing
                  ? `<textarea data-ai-edit-text="${index}" rows="3">${esc(sug.editText || sug.proposedText || "")}</textarea>`
                  : `<p>${esc(sug.proposedText || "")}</p>`}
              </div>
            </div>
            <div class="tk-enrich-ai-card-actions">
              <button type="button" class="ghost-button" data-ai-accept="${index}" ${discarded ? "disabled" : ""}>Accept</button>
              <button type="button" class="ghost-button" data-ai-edit="${index}" ${discarded ? "disabled" : ""}>${sug.editing ? "Done editing" : "Edit"}</button>
              <button type="button" class="ghost-button" data-ai-discard="${index}">Discard</button>
            </div>
          </article>
        `;
      }).join("") || `<p class="muted-copy">No suggestions to review.</p>`;
      body = `
        <p class="muted-copy">Review each suggestion. Inserting adds to the <strong>draft only</strong> — it does not save automatically and never publishes.</p>
        <div class="tk-enrich-ai-list">${cards}</div>
        <div class="form-actions">
          <button type="button" class="ghost-button" data-ai-discard-all>Discard all</button>
          <button type="button" class="ghost-button" data-ai-cancel>Cancel</button>
          <button type="button" class="primary-button" data-ai-insert-selected ${selectedCount ? "" : "disabled"}>Insert selected (${selectedCount})</button>
        </div>
      `;
    }
    return `
      <div class="tk-enrich-modal tk-enrich-ai-modal" data-ai-tray role="dialog" aria-modal="true" aria-labelledby="tk-enrich-ai-title">
        <div class="tk-enrich-modal-card tk-enrich-ai-card-shell" tabindex="-1">
          <h3 id="tk-enrich-ai-title">AI enrichment suggestions</h3>
          <p class="muted-copy">Lesson: <strong>${esc((getPlan() || {}).title || "Current lesson")}</strong> · Scope: ${esc(tray.scope)}${tray.activityKey ? ` · Activity draft only` : ""}</p>
          ${body}
        </div>
      </div>
    `;
  }

  function renderPublishModal(plan, activities) {
    if (!state.publishOpen) return "";
    const summary = api().summarizePublishChanges(plan, activities, state.draft);
    const historyCount = Array.isArray(plan.enrichmentPublishHistory) ? plan.enrichmentPublishHistory.length : 0;
    return `
      <div class="tk-enrich-modal" data-publish-modal role="dialog" aria-modal="true" aria-labelledby="tk-enrich-publish-title">
        <div class="tk-enrich-modal-card" tabindex="-1">
          <h3 id="tk-enrich-publish-title">Publish enrichment for this lesson?</h3>
          <p class="muted-copy">Only <strong>${esc(plan.title || "this lesson")}</strong> will change. Unrelated lessons stay untouched. The current published version is kept for rollback.</p>
          <ul class="tk-enrich-publish-summary">
            <li><strong>What will change:</strong> ${summary.photoChanges} photo update(s), ${summary.tipChanges} tip update(s)</li>
            <li><strong>Linked activities affected:</strong> ${summary.linkedActivitiesAffected}</li>
            <li><strong>Updates a published lesson?</strong> ${summary.isPublished ? "Yes — providers see enrichment only after this publish succeeds" : "No — lesson is not published/featured yet"}</li>
            <li><strong>Teaching Kit completeness:</strong> ${esc(summary.labelBefore)} ${summary.completionBefore}% → ${esc(summary.labelAfter)} ${summary.completionAfter}%</li>
            <li><strong>Prior published version:</strong> ${historyCount ? `${historyCount} snapshot(s) already saved` : "Will be preserved on first publish"}</li>
            <li><strong>Draft photos:</strong> Become provider-visible only after a successful publish (private draft URLs are never exposed)</li>
          </ul>
          <div class="form-actions">
            <button type="button" class="ghost-button" data-publish-cancel>Cancel</button>
            <button type="button" class="primary-button" data-publish-confirm>Publish updates to providers</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLightbox() {
    if (!state.lightboxUrl) return "";
    return `
      <div class="tk-enrich-lightbox" data-lightbox role="dialog" aria-modal="true" aria-label="Photo preview">
        <button type="button" class="ghost-button" data-lightbox-close autofocus>Close</button>
        <img src="${esc(state.lightboxUrl)}" alt="Full size preview" onerror="this.alt='Photo unavailable';this.classList.add('is-broken');" />
      </div>
    `;
  }

  function paintLivePreview(plan, activities) {
    const nodes = document.querySelectorAll("[data-enrich-live-preview]");
    if (!nodes.length) return;
    const viewer = root.LLHTeachingKitViewer;
    const kitApi = root.LLHTeachingKit;
    const enrich = api();
    if (!viewer || !kitApi || !enrich) {
      nodes.forEach((node) => {
        node.innerHTML = `<p class="muted-copy">Teaching Kit viewer unavailable.</p>`;
      });
      return;
    }
    if (typeof state.previewUnbind === "function") {
      try { state.previewUnbind(); } catch (_error) { /* ignore */ }
      state.previewUnbind = null;
    }
    let model;
    try {
      const resources = typeof effectiveCurriculum === "function"
        ? (effectiveCurriculum().resources || []).filter((r) => (plan.resourceIds || []).includes(r.id))
        : [];
      model = enrich.buildTeachingKitPreviewModel(
        plan,
        activities,
        resources,
        state.draft,
        { day: state.previewDay || "monday", includeEmptySections: false },
        kitApi.mapLessonPlanToTeachingKit.bind(kitApi),
      );
    } catch (error) {
      nodes.forEach((node) => {
        node.innerHTML = `<p class="muted-copy">Draft Preview could not render. Legacy lesson is unchanged. ${esc(error.message || error)}</p>`;
      });
      return;
    }
    const teachingKit = {
      ...model.draftKit,
      locked: false,
      ok: model.draftKit?.ok !== false,
    };
    // Fail closed: empty/malformed draft kits never throw into the shell.
    if (!teachingKit.companion) {
      nodes.forEach((node) => {
        node.innerHTML = `<p class="muted-copy">Draft Preview has no companion surface yet. The published Teaching Kit is unchanged.</p>`;
      });
      return;
    }
    const previewActs = teachingKit?.companion?.activities || [];
    const firstEnriched = state.mode === "preview"
      ? previewActs.find((activity) =>
        (activity.teacherPrompts || []).some((prompt) => String(prompt?.text || "").trim())
        || (activity.supplySubstitutions || []).length)
      : null;

    nodes.forEach((node) => {
      node.innerHTML = "";
      node.setAttribute("data-draft-preview", "1");
      const result = viewer.enhanceLessonWorkspace({
        body: node,
        teachingKit,
        featureFlags: { teachingKitViewer: true, teachingKitPrintCenter: true, teachingKitAttachments: false },
        // Open first tip/sub activity so Draft Preview shows real enrichment immediately
        initialActivityId: firstEnriched?.id || "",
        initialDay: state.previewDay || "monday",
        chrome: {
          title: model.merged.plan.title || plan.title,
          age: model.merged.plan.age || plan.age,
          planLabel: model.merged.plan.plan || plan.plan,
          backLabel: "Draft Preview",
          saveButtonHtml: "",
          actionBarsHtml: `<div class="tk-enrich-draft-preview-chip" aria-hidden="true">Draft Preview</div>`,
          feedbackHtml: "",
          copyrightHtml: "",
        },
      });
      if (result && typeof result.then === "function") {
        result.then((resolved) => {
          if (resolved?.unbind) state.previewUnbind = resolved.unbind;
          if (resolved && resolved.enhanced === false) {
            node.innerHTML = `<p class="muted-copy">Draft Preview unavailable (${esc(resolved.reason || "unknown")}). Published lesson unchanged.</p>`;
          } else {
            hydrateDraftMediaImages(node);
          }
        }).catch((error) => {
          node.innerHTML = `<p class="muted-copy">Draft Preview failed safely. ${esc(error.message || error)}</p>`;
        });
      } else if (result?.unbind) {
        state.previewUnbind = result.unbind;
        hydrateDraftMediaImages(node);
      } else {
        hydrateDraftMediaImages(node);
      }
    });
  }

  function renderJumpResults(plan, activities) {
    const panel = document.querySelector("[data-enrich-jump-results]");
    if (!panel) return;
    const hits = api().searchJumpIndex(api().buildJumpIndex(plan, activities, state.draft), state.jumpQuery);
    panel.innerHTML = hits.map((hit) => `
      <button type="button" class="tk-enrich-jump-hit" data-jump-type="${esc(hit.type)}" data-jump-id="${esc(hit.id)}" data-jump-index="${hit.index ?? ""}">
        <strong>${esc(hit.label)}</strong>
        <small>${esc(hit.meta || hit.type)}</small>
      </button>
    `).join("") || `<p class="muted-copy">No matches in this lesson.</p>`;
  }

  function renderChromeOnly() {
    const chrome = document.querySelector(".tk-enrich-chrome");
    const percentEl = chrome?.querySelector(".tk-enrich-percent-row strong");
    const statusEl = chrome?.querySelector(".tk-enrich-status") || document.querySelector(".tk-enrich-status");
    if (statusEl) statusEl.textContent = state.statusText || "";
    const plan = getPlan();
    if (!plan || !percentEl) return;
    const activities = getActivities(plan);
    const percent = recomputePercent(plan, activities);
    const label = api().completenessLabelFromPercent(percent, null);
    percentEl.textContent = `Overall ${percent}%`;
    const bar = chrome.querySelector(".tk-enrich-bar i");
    if (bar) bar.style.width = `${percent}%`;
    const tag = chrome.querySelector(".tk-enrich-percent-row .tag");
    if (tag) tag.textContent = label;
    const summaryPct = document.querySelector("[data-upgrade-summary] .tk-enrich-bar i");
    if (summaryPct) summaryPct.style.width = `${percent}%`;
  }

  function focusActiveDialog() {
    const dialog = document.querySelector("[data-ai-tray] .tk-enrich-modal-card, [data-publish-modal] .tk-enrich-modal-card, [data-lightbox]");
    if (!dialog) return;
    const focusable = dialog.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    (focusable || dialog).focus?.();
  }

  function networkErrorMessage(error, fallback) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "You appear to be offline. Changes stay on this screen — retry when the connection returns.";
    }
    const msg = String(error?.message || error || "");
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return "Network error. Existing content was kept — retry when online.";
    }
    return fallback || msg || "Something went wrong.";
  }

  function render() {
    const el = host();
    if (!el || !state.open) return;
    const plan = getPlan();
    if (!plan) {
      el.innerHTML = `<div class="empty-state">Lesson not found.</div>`;
      return;
    }
    const activities = getActivities(plan);
    if (state.activityIndex >= activities.length) state.activityIndex = Math.max(0, activities.length - 1);
    const percent = recomputePercent(plan, activities);
    // Quality checklist % drives the label (not Phase-1 legacy_mapped overlay).
    const label = api().completenessLabelFromPercent(percent, null);
    const body = state.mode === "week"
      ? renderWeekMode(plan)
      : state.mode === "preview"
        ? renderPreviewMode()
        : renderActivityMode(plan, activities);
    el.innerHTML = `
      <div class="tk-enrich-shell">
        ${renderChrome(plan, activities, percent, label)}
        <div class="tk-enrich-main">
          ${renderUpgradeSummary(plan, activities)}
          <div class="tk-enrich-body">${body}</div>
        </div>
        ${renderPublishModal(plan, activities)}
        ${renderAiTray()}
        ${renderLightbox()}
      </div>
    `;
    if (state.jumpOpen) renderJumpResults(plan, activities);
    requestAnimationFrame(() => {
      paintLivePreview(plan, activities);
      hydrateDraftMediaImages(el);
    });
    if (state.aiTray.open || state.publishOpen || state.lightboxUrl) {
      requestAnimationFrame(() => focusActiveDialog());
    }
  }

  function bind() {
    document.addEventListener("click", async (event) => {
      const openBtn = event.target.closest("[data-curriculum-lesson-enrich]");
      if (openBtn) {
        event.preventDefault();
        if (!isEditorFlagEnabled()) {
          if (typeof showActionFeedback === "function") {
            showActionFeedback("Enrichment Editor is disabled (feature flag off).");
          }
          return;
        }
        open(openBtn.getAttribute("data-curriculum-lesson-enrich"));
        return;
      }
      if (!state.open) return;
      if (event.target.closest("[data-enrich-exit]")) {
        close();
        return;
      }
      if (event.target.closest("[data-summary-toggle]")) {
        state.summaryOpen = !state.summaryOpen;
        render();
        return;
      }
      const summaryJump = event.target.closest("[data-summary-jump]");
      if (summaryJump) {
        const jump = summaryJump.getAttribute("data-summary-jump");
        const plan = getPlan();
        const activities = getActivities(plan);
        const weekJumps = new Set(["family", "printables", "books", "songs", "vocabulary", "objectives", "materials"]);
        if (weekJumps.has(jump)) {
          state.mode = "week";
        } else {
          state.mode = "activities";
          const draftActs = state.draft.activities || {};
          let target = -1;
          if (jump === "setup") {
            target = activities.findIndex((a) => !api().activityEnrichmentView(a, draftActs[draftKey(a)]).setupImageUrl);
          } else if (jump === "example") {
            target = activities.findIndex((a) => !api().activityEnrichmentView(a, draftActs[draftKey(a)]).exampleImageUrl);
          } else if (jump === "tips") {
            target = activities.findIndex((a) => !api().activityEnrichmentView(a, draftActs[draftKey(a)]).teacherTips.length);
          } else if (jump === "observations") {
            target = activities.findIndex((a) => {
              const view = api().activityEnrichmentView(a, draftActs[draftKey(a)]);
              return !view.observationPrompts.length && !String(a.observationOpportunities || "").trim();
            });
          } else {
            target = api().firstIncompleteActivityIndex(activities, draftActs);
          }
          if (target >= 0) state.activityIndex = target;
        }
        render();
        return;
      }
      if (event.target.closest("[data-enrich-save-draft]")) {
        await saveDraft({ silent: false });
        return;
      }
      if (event.target.closest("[data-enrich-publish]")) {
        state.publishOpen = true;
        render();
        return;
      }
      if (event.target.closest("[data-publish-cancel]")) {
        state.publishOpen = false;
        render();
        return;
      }
      if (event.target.closest("[data-publish-confirm]")) {
        try {
          await publishEnrichment();
        } catch (error) {
          state.statusText = `Publish failed: ${error.message || error}`;
          render();
        }
        return;
      }
      const modeBtn = event.target.closest("[data-enrich-mode]");
      if (modeBtn) {
        state.mode = modeBtn.getAttribute("data-enrich-mode");
        if (state.mode === "preview") {
          const act = getActivities(getPlan())[state.activityIndex];
          if (act?.dayOfWeek) state.previewDay = String(act.dayOfWeek);
        }
        render();
        return;
      }
      const previewViewport = event.target.closest("[data-preview-viewport]");
      if (previewViewport) {
        state.previewViewport = previewViewport.getAttribute("data-preview-viewport") || "desktop";
        render();
        return;
      }
      const previewDay = event.target.closest("[data-preview-day]");
      if (previewDay) {
        state.previewDay = previewDay.getAttribute("data-preview-day") || "monday";
        render();
        return;
      }
      if (event.target.closest("[data-enrich-prev]")) {
        state.activityIndex = Math.max(0, state.activityIndex - 1);
        state.mode = "activities";
        render();
        return;
      }
      if (event.target.closest("[data-enrich-next]") || event.target.closest("[data-enrich-skip]")) {
        const plan = getPlan();
        const activities = getActivities(plan);
        state.activityIndex = Math.min(activities.length - 1, state.activityIndex + 1);
        state.mode = "activities";
        render();
        return;
      }
      if (event.target.closest("[data-enrich-save-next]")) {
        await saveDraft({ silent: true });
        const plan = getPlan();
        const activities = getActivities(plan);
        const nextIncomplete = activities.findIndex((act, i) => (
          i > state.activityIndex
          && api().activityStatus(act, state.draft.activities[draftKey(act)]) !== "complete"
        ));
        state.activityIndex = nextIncomplete >= 0
          ? nextIncomplete
          : Math.min(activities.length - 1, state.activityIndex + 1);
        state.mode = "activities";
        render();
        return;
      }
      const dayFilter = event.target.closest("[data-day-filter]");
      if (dayFilter) {
        state.dayFilter = dayFilter.getAttribute("data-day-filter");
        render();
        return;
      }
      const queueItem = event.target.closest("[data-activity-index]");
      if (queueItem) {
        state.activityIndex = Number(queueItem.getAttribute("data-activity-index")) || 0;
        state.mode = "activities";
        render();
        return;
      }
      if (event.target.closest("[data-enrich-jump-toggle]")) {
        state.jumpOpen = !state.jumpOpen;
        render();
        return;
      }
      const jumpHit = event.target.closest("[data-jump-type]");
      if (jumpHit) {
        const type = jumpHit.getAttribute("data-jump-type");
        if (type === "activity") {
          state.mode = "activities";
          state.activityIndex = Number(jumpHit.getAttribute("data-jump-index")) || 0;
        } else {
          state.mode = "week";
        }
        state.jumpOpen = false;
        render();
        return;
      }
      const setting = event.target.closest("[data-setting-tag]");
      if (setting) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        if (!act) return;
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const tag = setting.getAttribute("data-setting-tag");
        const current = new Set(api().activityEnrichmentView(act, draftAct).settingTags);
        if (current.has(tag)) current.delete(tag);
        else current.add(tag);
        draftAct.settingTags = [...current];
        markDirty();
        render();
        return;
      }
      const tipRemove = event.target.closest("[data-tip-remove]");
      if (tipRemove) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        view.teacherTips.splice(Number(tipRemove.getAttribute("data-tip-remove")), 1);
        draftAct.teacherTips = view.teacherTips;
        markDirty();
        render();
        return;
      }
      const subRemove = event.target.closest("[data-sub-remove]");
      if (subRemove) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        view.substitutions.splice(Number(subRemove.getAttribute("data-sub-remove")), 1);
        draftAct.substitutions = view.substitutions;
        markDirty();
        render();
        return;
      }
      const obsRemove = event.target.closest("[data-obs-remove]");
      if (obsRemove) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        view.observationPrompts.splice(Number(obsRemove.getAttribute("data-obs-remove")), 1);
        draftAct.observationPrompts = view.observationPrompts;
        markDirty();
        render();
        return;
      }
      const vocabRemove = event.target.closest("[data-vocab-remove]");
      if (vocabRemove) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        view.vocabulary.splice(Number(vocabRemove.getAttribute("data-vocab-remove")), 1);
        draftAct.vocabulary = view.vocabulary;
        markDirty();
        render();
        return;
      }
      if (event.target.closest("[data-ai-suggest]")) {
        const scopeBtn = event.target.closest("[data-ai-suggest]");
        const scope = scopeBtn.getAttribute("data-ai-suggest") === "week" ? "week" : "activity";
        await requestAiSuggestions({ scope });
        return;
      }
      if (event.target.closest("[data-ai-cancel]")) {
        cancelAiSuggestions();
        return;
      }
      if (event.target.closest("[data-ai-retry]")) {
        const scope = state.aiTray.scope || "activity";
        await requestAiSuggestions({ scope });
        return;
      }
      if (event.target.closest("[data-ai-discard-all]")) {
        state.aiTray.suggestions = state.aiTray.suggestions.map((s) => ({ ...s, decision: "discarded", selected: false }));
        state.statusText = "All AI suggestions discarded. Draft unchanged.";
        resetAiTray();
        render();
        return;
      }
      if (event.target.closest("[data-ai-insert-selected]")) {
        await insertSelectedAiSuggestions();
        return;
      }
      const aiAccept = event.target.closest("[data-ai-accept]");
      if (aiAccept) {
        const index = Number(aiAccept.getAttribute("data-ai-accept"));
        const sug = state.aiTray.suggestions[index];
        if (sug) {
          state.aiTray.suggestions[index] = applyAiSuggestionEdits({
            ...sug,
            decision: "accepted",
            selected: true,
          });
          render();
        }
        return;
      }
      const aiDiscard = event.target.closest("[data-ai-discard]");
      if (aiDiscard) {
        const index = Number(aiDiscard.getAttribute("data-ai-discard"));
        const sug = state.aiTray.suggestions[index];
        if (sug) {
          state.aiTray.suggestions[index] = { ...sug, decision: "discarded", selected: false, editing: false };
          render();
        }
        return;
      }
      const aiEdit = event.target.closest("[data-ai-edit]");
      if (aiEdit) {
        const index = Number(aiEdit.getAttribute("data-ai-edit"));
        const sug = state.aiTray.suggestions[index];
        if (sug) {
          if (sug.editing) {
            state.aiTray.suggestions[index] = applyAiSuggestionEdits({ ...sug, editing: true });
          } else {
            state.aiTray.suggestions[index] = {
              ...sug,
              editing: true,
              editText: sug.editText || sug.proposedText || "",
            };
          }
          render();
        }
        return;
      }
      const milestone = event.target.closest("[data-milestone]");
      if (milestone) {
        const m = milestone.getAttribute("data-milestone");
        const list = new Set(state.draft.week.milestones || []);
        if (list.has(m)) list.delete(m);
        else list.add(m);
        state.draft.week.milestones = [...list];
        markDirty();
        render();
        return;
      }
      const photoBox = event.target.closest(".tk-enrich-photo");
      if (photoBox) {
        const key = photoBox.getAttribute("data-photo-key");
        const field = photoBox.getAttribute("data-photo-field");
        const input = photoBox.querySelector('input[type="file"]');
        if (event.target.closest("[data-photo-remove]")) {
          await removePhoto(key, field);
          return;
        }
        if (event.target.closest("[data-photo-preview]")) {
          const view = api().activityEnrichmentView(
            getActivities(getPlan()).find((a) => draftKey(a) === key),
            state.draft.activities[key],
          );
          const full = field === "exampleImageUrl" ? view.exampleImageUrl : view.setupImageUrl;
          const rawFull = full || photoBox.getAttribute("data-photo-full") || "";
          const cached = resolveDraftMediaDisplayUrl(rawFull);
          if (cached) {
            state.lightboxUrl = cached;
            render();
            return;
          }
          void fetchDraftMediaBlobUrl(rawFull).then((objectUrl) => {
            if (!objectUrl) {
              state.statusText = "Photo preview unavailable.";
              renderChromeOnly();
              return;
            }
            state.lightboxUrl = objectUrl;
            render();
          });
          return;
        }
        if (event.target.closest("[data-photo-replace]") || event.target.closest(".tk-enrich-photo-drop")) {
          input?.click();
          return;
        }
      }
      if (event.target.closest("[data-lightbox-close]") || event.target.closest("[data-lightbox]")) {
        if (event.target.closest("[data-lightbox-close]") || event.target.classList.contains("tk-enrich-lightbox")) {
          state.lightboxUrl = "";
          render();
        }
      }
    });

    document.addEventListener("change", async (event) => {
      if (!state.open) return;
      if (event.target.matches("[data-ai-select]")) {
        const index = Number(event.target.getAttribute("data-ai-select"));
        const sug = state.aiTray.suggestions[index];
        if (!sug || sug.decision === "discarded") return;
        state.aiTray.suggestions[index] = {
          ...sug,
          selected: Boolean(event.target.checked),
          decision: event.target.checked ? (sug.decision === "discarded" ? "pending" : sug.decision) : "pending",
        };
        render();
        return;
      }
      if (event.target.matches(".tk-enrich-photo input[type='file']")) {
        const box = event.target.closest(".tk-enrich-photo");
        const file = event.target.files && event.target.files[0];
        await applyPhoto(box.getAttribute("data-photo-key"), box.getAttribute("data-photo-field"), file);
        return;
      }
      if (event.target.matches("[data-preview-ready]")) {
        state.draft.week.previewReady = event.target.checked;
        state.draft.previewReady = event.target.checked;
        markDirty();
      }
    });

    document.addEventListener("input", (event) => {
      if (!state.open) return;
      if (event.target.matches("[data-ai-edit-text]")) {
        const index = Number(event.target.getAttribute("data-ai-edit-text"));
        const sug = state.aiTray.suggestions[index];
        if (!sug) return;
        state.aiTray.suggestions[index] = { ...sug, editText: event.target.value || "" };
        return;
      }
      if (event.target.matches("[data-enrich-jump-input]")) {
        state.jumpQuery = event.target.value || "";
        const plan = getPlan();
        renderJumpResults(plan, getActivities(plan));
        return;
      }
      if (event.target.matches("[data-week-family]")) {
        state.draft.week.familyConnection = event.target.value || "";
        markDirty();
        clearTimeout(state._previewTimer);
        state._previewTimer = setTimeout(() => {
          const plan = getPlan();
          paintLivePreview(plan, getActivities(plan));
        }, 250);
      }
    });

    document.addEventListener("submit", (event) => {
      if (!state.open) return;
      if (event.target.matches("[data-tip-add]")) {
        event.preventDefault();
        const value = String(event.target.querySelector("input")?.value || "").trim();
        if (!value) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        draftAct.teacherTips = [...view.teacherTips, value].slice(0, 5);
        markDirty();
        render();
        return;
      }
      if (event.target.matches("[data-sub-add]")) {
        event.preventDefault();
        const need = String(event.target.querySelector('[name="need"]')?.value || "").trim();
        const use = String(event.target.querySelector('[name="use"]')?.value || "").trim();
        if (!need || !use) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        draftAct.substitutions = [...view.substitutions, { need, use }].slice(0, 12);
        markDirty();
        render();
        return;
      }
      if (event.target.matches("[data-obs-add]")) {
        event.preventDefault();
        const value = String(event.target.querySelector("input")?.value || "").trim();
        if (!value) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        draftAct.observationPrompts = [...view.observationPrompts, value].slice(0, 8);
        markDirty();
        render();
        return;
      }
      if (event.target.matches("[data-vocab-add]")) {
        event.preventDefault();
        const value = String(event.target.querySelector("input")?.value || "").trim();
        if (!value) return;
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        const view = api().activityEnrichmentView(act, draftAct);
        if (!view.vocabulary.map((w) => w.toLowerCase()).includes(value.toLowerCase())) {
          draftAct.vocabulary = [...view.vocabulary, value].slice(0, 16);
        } else {
          draftAct.vocabulary = view.vocabulary;
        }
        markDirty();
        render();
      }
    });


    document.addEventListener("keydown", (event) => {
      if (!state.open) return;
      // Mid-session flag-off closes the editor safely.
      if (!isEditorFlagEnabled()) {
        if (typeof showActionFeedback === "function") {
          showActionFeedback("Enrichment Editor was disabled. Closing without publishing.");
        }
        close();
        return;
      }
      if (event.key === "Escape") {
        if (state.aiTray.open) {
          event.preventDefault();
          cancelAiSuggestions();
          return;
        }
        if (state.publishOpen) {
          event.preventDefault();
          state.publishOpen = false;
          render();
          return;
        }
        if (state.lightboxUrl) {
          event.preventDefault();
          state.lightboxUrl = "";
          render();
          return;
        }
        if (state.jumpOpen) {
          event.preventDefault();
          state.jumpOpen = false;
          render();
          return;
        }
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const tag = String(event.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || event.target?.isContentEditable) return;
        event.preventDefault();
        state.jumpOpen = true;
        render();
        requestAnimationFrame(() => document.querySelector("[data-enrich-jump-input]")?.focus?.());
        return;
      }
      if ((event.key === "Enter" || event.key === " ") && event.target?.closest?.(".tk-enrich-photo-drop")) {
        event.preventDefault();
        const drop = event.target.closest(".tk-enrich-photo-drop");
        drop.querySelector('input[type="file"]')?.click();
      }
      // Simple focus trap inside open dialogs
      if (event.key === "Tab") {
        const dialog = document.querySelector("[data-ai-tray], [data-publish-modal], [data-lightbox]");
        if (!dialog) return;
        const nodes = [...dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
          .filter((el) => !el.disabled && el.offsetParent !== null);
        if (nodes.length < 2) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    document.addEventListener("dragover", (event) => {
      if (!state.open) return;
      const drop = event.target.closest(".tk-enrich-photo-drop");
      if (drop) {
        event.preventDefault();
        drop.classList.add("is-dragover");
      }
    });
    document.addEventListener("dragleave", (event) => {
      const drop = event.target.closest(".tk-enrich-photo-drop");
      if (drop) drop.classList.remove("is-dragover");
    });
    document.addEventListener("drop", async (event) => {
      if (!state.open) return;
      const drop = event.target.closest(".tk-enrich-photo-drop");
      if (!drop) return;
      event.preventDefault();
      drop.classList.remove("is-dragover");
      const box = drop.closest(".tk-enrich-photo");
      const file = event.dataTransfer?.files?.[0];
      await applyPhoto(box.getAttribute("data-photo-key"), box.getAttribute("data-photo-field"), file);
    });
  }

  bind();

  root.LLHTeachingKitEnrichmentEditor = {
    open,
    close,
    isOpen: () => state.open,
    isEnabled: isEditorFlagEnabled,
    sliceFeatures: () => ({
      activityStudio: true,
      livePreview: true,
      photoUpload: true,
      aiSuggest: true,
      publish: true,
      polish: true,
      preserveRemediation: true,
      slice: 7,
    }),
    render,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
