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
    recoveryOpen: false,
    compareOpen: false,
    historyDiffVersionId: "",
    statusText: "",
    summaryOpen: false,
    previewViewport: "desktop", // desktop | tablet | mobile
    previewDay: "monday",
    previewUnbind: null,
    pendingCleanupAssetIds: [], // deferred until draft save succeeds
    lastSavedDraft: null,
    saveInFlight: false,
    saveQueued: false,
    /** Monotonic local edit counter — autosave responses older than this must not overwrite. */
    editGeneration: 0,
    /** Request id of the in-flight autosave (ignored if a newer editGeneration exists). */
    saveRequestId: 0,
    lastSaveError: "",
    lessonAnalysis: null,
    analysisOpen: false,
    assistant: {
      tab: "improve", // improve | chat | toolkit | library | quality | images
      chatInput: "",
      chatLog: [],
      improveField: "weeklyOverview",
      improveText: "",
      quality: null,
      connections: [],
      recommendations: [],
      lastImagePreview: "",
      status: "",
    },
    qualityReport: null, // specialist readiness report (teachingKitQualityReview)
    qualityBusy: false,
    aiTray: {
      open: false,
      phase: "idle", // idle | loading | ready | error | timeout
      errorText: "",
      requestId: "",
      activityKey: "",
      scope: "activity",
      suggestions: [],
      abortController: null,
      batchProgress: null, // { processed, total, batchCount, elapsedMs, hasMore }
      generationTiming: null,
      source: "", // "" | "ai-teacher-assistant" | lesson-teacher flows
    },
  };

  function isEditorFlagEnabled() {
    const flags = (typeof effectiveSiteContent === "function" ? effectiveSiteContent() : null)?.featureFlags || {};
    if (root.LLHTeachingKit?.isTeachingKitEnrichmentEditorEnabled) {
      return root.LLHTeachingKit.isTeachingKitEnrichmentEditorEnabled(flags) === true;
    }
    return flags.teachingKitEnrichmentEditor === true;
  }

  function lessonTeacher() {
    return root.LLHTeachingKitAiLessonTeacher || null;
  }

  function teacherAssistant() {
    return root.LLHTeachingKitAiTeacherAssistant || null;
  }

  function reusableLibraryApi() {
    return root.LLHTeachingKitReusableLibrary || null;
  }

  function qualityReviewApi() {
    return root.LLHTeachingKitQualityReview || null;
  }

  function isQualityReviewFlagEnabled() {
    const flags = (typeof effectiveSiteContent === "function" ? effectiveSiteContent() : null)?.featureFlags || {};
    if (root.LLHTeachingKit?.isTeachingKitQualityReviewEnabled) {
      return root.LLHTeachingKit.isTeachingKitQualityReviewEnabled(flags) === true;
    }
    return flags.teachingKitQualityReview === true;
  }

  function ignoredQualityCodes() {
    return Array.isArray(state.draft?.week?.qualityReviewIgnored)
      ? state.draft.week.qualityReviewIgnored
      : [];
  }

  async function runSpecialistQualityReview({ force = false } = {}) {
    if (!isQualityReviewFlagEnabled()) return null;
    const plan = getPlan();
    const apiQr = qualityReviewApi();
    if (!plan || !apiQr?.buildQualityReport) return null;
    // Prefer local specialist report (uses live draft). Server used for improve/decide.
    const activities = getActivities(plan);
    const report = apiQr.buildQualityReport(plan, activities, state.draft, {
      ignoredCodes: ignoredQualityCodes(),
    });
    state.qualityReport = report;
    state.assistant.quality = {
      readinessScore: report.overallScore,
      readinessLabel: report.overallLabel,
      findings: report.findings,
      blocksPublish: report.blocksPublish,
    };
    return report;
  }

  async function callTeacherAssistant(payload) {
    const token = adminToken();
    if (!token) {
      state.assistant.status = "Admin unlock required for AI Teacher Assistant.";
      return null;
    }
    const body = {
      adminToken: token,
      planId: state.planId,
      ...payload,
    };
    const response = await fetch("/api/admin/curriculum/ai-teacher-assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      state.assistant.status = data.error || "AI Teacher Assistant request failed. Draft unchanged.";
      return null;
    }
    return data;
  }

  async function presentAssistantSuggestions(suggestions, { note = "" } = {}) {
    const rows = (Array.isArray(suggestions) ? suggestions : []).map((item) => ({
      ...item,
      decision: "pending",
      selected: true,
      editing: false,
      editText: item.proposedText || "",
      originalBefore: String(item.currentValue || item.current || ""),
    }));
    if (!rows.length) {
      state.assistant.status = note || "No draft suggestions returned.";
      render();
      return;
    }
    state.aiTray.open = true;
    state.aiTray.phase = "ready";
    state.aiTray.scope = rows.some((r) => r.activityKey) ? "lesson" : "week";
    state.aiTray.source = "ai-teacher-assistant";
    state.aiTray.suggestions = rows;
    state.aiTray.errorText = "";
    state.assistant.status = note || `${rows.length} draft suggestion(s) ready for side-by-side review — not published.`;
    state.statusText = state.assistant.status;
    render();
  }

  async function learnFromAcceptedSuggestions(acceptedRows) {
    const token = adminToken();
    if (!token || !Array.isArray(acceptedRows) || !acceptedRows.length) return;
    for (const sug of acceptedRows) {
      const before = String(sug.originalBefore || sug.currentValue || "").trim();
      const after = String(sug.editText || sug.proposedText || sug.proposedValue || "").trim();
      if (!after || after === before || after.startsWith("REUSE:")) continue;
      try {
        await callTeacherAssistant({
          action: "learn_from_me",
          field: sug.field || "",
          before,
          after,
        });
      } catch (_error) {
        /* Best-effort style learning — never block accept. */
      }
    }
  }

  function refreshLessonAnalysis() {
    const plan = getPlan();
    const teacher = lessonTeacher();
    if (!plan || !teacher?.analyzeLessonCompleteness) {
      state.lessonAnalysis = null;
      return null;
    }
    state.lessonAnalysis = teacher.analyzeLessonCompleteness(plan, getActivities(plan), state.draft);
    return state.lessonAnalysis;
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

  function bumpEditGeneration() {
    state.editGeneration += 1;
    return state.editGeneration;
  }

  function markDirty({ autosave = true } = {}) {
    bumpEditGeneration();
    state.dirty = true;
    refreshLessonAnalysis();
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

  /** Markers used to verify the server echoed the draft we just saved. */
  function draftVerificationMarkers(draft) {
    const digests = typeof api().draftVerificationDigests === "function"
      ? api().draftVerificationDigests(draft)
      : {};
    const markers = [];
    Object.keys(digests).forEach((key) => {
      if (key === "__week") {
        const week = digests[key];
        if (week.familyConnection) markers.push(`week:family:${week.familyConnection.slice(0, 80)}`);
        return;
      }
      const act = digests[key];
      if (act.tipsOwned) markers.push(`act:${key}:tipsCount:${act.tipsCount}`);
      if (act.tipsDigest) markers.push(`act:${key}:tips:${act.tipsDigest.slice(0, 80)}`);
      if (act.vocabOwned) markers.push(`act:${key}:vocabCount:${act.vocabCount}`);
      if (act.legacyTip) markers.push(`act:${key}:tip:${act.legacyTip.slice(0, 80)}`);
      if (act.imageBriefSetup) markers.push(`act:${key}:briefSetup:${act.imageBriefSetup.slice(0, 60)}`);
    });
    return markers;
  }

  function draftContainsMarkers(savedDraft, markers, sentDraft = null) {
    if (sentDraft && typeof api().draftEchoMatchesSent === "function") {
      return api().draftEchoMatchesSent(sentDraft, savedDraft);
    }
    if (!markers.length) {
      // Empty intentional save (metadata-only) is allowed when the local draft is also empty.
      return true;
    }
    const haystack = JSON.stringify(savedDraft || {});
    return markers.every((marker) => {
      const parts = marker.split(":");
      // act:<key>:tip:<text> or week:family:<text>
      const text = parts.length >= 4 ? parts.slice(3).join(":") : parts.slice(2).join(":");
      const needle = String(text || "").slice(0, 40);
      return needle && haystack.includes(needle);
    });
  }

  function enrichmentDraftLooksPopulated(draft) {
    if (!draft || typeof draft !== "object") return false;
    const acts = draft.activities && typeof draft.activities === "object" ? Object.keys(draft.activities) : [];
    if (acts.length) return true;
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    return Object.keys(week).some((key) => {
      const value = week[key];
      if (value == null) return false;
      if (typeof value === "string") return Boolean(value.trim());
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") return Object.keys(value).length > 0;
      return true;
    });
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
      source: "",
      suggestions: [],
      abortController: null,
      batchProgress: null,
      generationTiming: null,
    };
  }

  function currentAiActivityKey(plan) {
    const act = getActivities(plan)[state.activityIndex];
    return act ? draftKey(act) : "";
  }

  function mapAiSuggestionRows(items) {
    return (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      decision: "pending",
      selected: true,
      editing: false,
      editText: item.proposedText || "",
    }));
  }

  async function fetchAiSuggestBatch({
    plan,
    token,
    scope,
    activityKey,
    simulate,
    activityOffset = 0,
    activityLimit = 5,
    includeWeek = true,
    signal,
  }) {
    const body = {
      adminToken: token,
      planId: plan.id,
      activityKey,
      scope,
      activityOffset,
      activityLimit,
      includeWeek,
    };
    if (simulate) body.simulate = simulate;
    const response = await fetch("/api/admin/curriculum/enrichment-ai-suggest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  /**
   * Complete Teaching Kit generation: batches every activity behind one review session.
   */
  async function requestCompleteLessonDraft({ simulate = "" } = {}) {
    const plan = getPlan();
    if (!plan) return;
    const token = adminToken();
    if (!token) {
      state.statusText = "Admin unlock required for AI Lesson Teacher.";
      renderChromeOnly();
      return;
    }
    if (state.aiTray.abortController) {
      try { state.aiTray.abortController.abort(); } catch (_error) { /* ignore */ }
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const started = Date.now();
    state.aiTray.open = true;
    state.aiTray.phase = "loading";
    state.aiTray.errorText = "";
    state.aiTray.suggestions = [];
    state.aiTray.scope = "lesson";
    state.aiTray.activityKey = "";
    state.aiTray.requestId = "";
    state.aiTray.abortController = controller;
    state.aiTray.batchProgress = { processed: 0, total: getActivities(plan).length, batchCount: 0, elapsedMs: 0, hasMore: true };
    state.aiTray.generationTiming = null;
    state.statusText = "AI Lesson Teacher is preparing a complete Teaching Kit draft…";
    render();

    const allSuggestions = [];
    const batchTimings = [];
    let offset = 0;
    let hasMore = true;
    let batchCount = 0;
    let lastAnalysis = null;
    let activityTotal = getActivities(plan).length;

    try {
      while (hasMore) {
        if (state.aiTray.abortController !== controller) return;
        if (controller?.signal?.aborted) return;
        batchCount += 1;
        const batchStarted = Date.now();
        const { response, data } = await fetchAiSuggestBatch({
          plan,
          token,
          scope: "lesson",
          activityKey: "",
          simulate,
          activityOffset: offset,
          activityLimit: 5,
          includeWeek: offset === 0,
          signal: controller ? controller.signal : undefined,
        });
        if (state.aiTray.abortController !== controller) return;
        if (controller?.signal?.aborted) return;
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
        if (data.analysis) lastAnalysis = data.analysis;
        const batchRows = mapAiSuggestionRows(data.suggestions);
        allSuggestions.push(...batchRows);
        const batch = data.batch || {};
        activityTotal = Number(batch.activityTotal) || activityTotal;
        const processed = Math.min(activityTotal, Number(batch.nextOffset) || (offset + (batch.processedCount || 0)));
        hasMore = batch.hasMore === true;
        offset = Number(batch.nextOffset) || processed;
        const batchMs = Date.now() - batchStarted;
        batchTimings.push({
          batch: batchCount,
          offset: batch.activityOffset || 0,
          processedCount: batch.processedCount || 0,
          suggestionCount: batchRows.length,
          ms: batchMs,
        });
        state.aiTray.suggestions = allSuggestions.slice();
        state.aiTray.requestId = data.requestId || state.aiTray.requestId;
        state.aiTray.batchProgress = {
          processed,
          total: activityTotal,
          batchCount,
          elapsedMs: Date.now() - started,
          hasMore,
        };
        state.statusText = hasMore
          ? `Preparing complete kit… activities ${processed} of ${activityTotal} (batch ${batchCount}). Review can begin — more rows still loading.`
          : `Complete Teaching Kit draft ready: ${allSuggestions.length} improvement(s) across ${activityTotal} activities.`;
        // Progressive review: show accumulated rows while later batches load.
        state.aiTray.phase = hasMore ? "loading" : "ready";
        render();
      }
      // Prefer editor-local analysis (server draft may differ from in-progress editor draft).
      refreshLessonAnalysis();
      if (!state.lessonAnalysis && lastAnalysis) state.lessonAnalysis = lastAnalysis;
      const elapsedMs = Date.now() - started;
      state.aiTray.generationTiming = {
        elapsedMs,
        batchCount,
        suggestionCount: allSuggestions.length,
        activityTotal,
        batches: batchTimings,
      };
      state.aiTray.phase = "ready";
      state.aiTray.batchProgress = {
        processed: activityTotal,
        total: activityTotal,
        batchCount,
        elapsedMs,
        hasMore: false,
      };
      state.statusText = `Complete Teaching Kit draft ready (${allSuggestions.length} rows, ${batchCount} batch${batchCount === 1 ? "" : "es"}, ${(elapsedMs / 1000).toFixed(1)}s). Nothing publishes until you approve.`;
      render();
    } catch (error) {
      if (state.aiTray.abortController !== controller) return;
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

  function confirmAiAction(scope) {
    const label = scope === "lesson"
      ? "Prepare an AI draft for this lesson? Existing published content will remain unchanged. Suggestions will stay in review until you accept them."
      : scope === "week"
        ? "Generate AI suggestions for the week fields only? Existing published content will remain unchanged. Suggestions stay in review until you accept them."
        : "Generate AI suggestions for this activity? Existing published content will remain unchanged. Suggestions stay in review until you accept them.";
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(label);
    }
    return true;
  }

  async function requestAiSuggestions({ scope = "activity", simulate = "", skipConfirm = false } = {}) {
    // Guard against double-clicks / concurrent full-lesson generations (before confirm).
    if (state._aiInFlight || (state.aiTray.phase === "loading" && state.aiTray.abortController)) {
      state.statusText = "AI is already preparing suggestions. Wait for this run to finish, or press Cancel.";
      renderChromeOnly();
      return;
    }
    state._aiInFlight = true;
    try {
      if (!skipConfirm && !confirmAiAction(scope)) {
        state.statusText = "AI canceled — no suggestions generated. Draft and published content unchanged.";
        renderChromeOnly();
        return;
      }
      if (scope === "lesson") {
        await requestCompleteLessonDraft({ simulate });
        return;
      }
      await requestAiSuggestionsScoped({ scope, simulate });
    } finally {
      state._aiInFlight = false;
    }
  }

  async function requestAiSuggestionsScoped({ scope = "activity", simulate = "" } = {}) {
    if (scope === "lesson") {
      await requestCompleteLessonDraft({ simulate });
      return;
    }
    const plan = getPlan();
    if (!plan) return;
    const token = adminToken();
    if (!token) {
      state.statusText = "Admin unlock required for AI Lesson Teacher.";
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
    state.aiTray.batchProgress = null;
    state.statusText = "Requesting AI suggestions…";
    render();

    try {
      const { response, data } = await fetchAiSuggestBatch({
        plan,
        token,
        scope,
        activityKey,
        simulate,
        activityOffset: 0,
        activityLimit: 5,
        includeWeek: true,
        signal: controller ? controller.signal : undefined,
      });
      if (state.aiTray.abortController !== controller) return;
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
      refreshLessonAnalysis();
      if (!state.lessonAnalysis && data.analysis) state.lessonAnalysis = data.analysis;
      const suggestions = mapAiSuggestionRows(data.suggestions);
      state.aiTray.phase = "ready";
      state.aiTray.suggestions = suggestions;
      state.aiTray.requestId = data.requestId || "";
      state.statusText = data.duplicate
        ? "Reused recent AI draft — review Current vs AI Draft before accepting."
        : `AI returned ${suggestions.length} suggestion(s). Nothing saved until you insert.`;
      render();
    } catch (error) {
      if (state.aiTray.abortController !== controller) return;
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

  async function insertSelectedAiSuggestions({
    acceptAll = false,
    sectionId = "",
    activityKeyFilter = "",
    closeTray = true,
  } = {}) {
    const plan = getPlan();
    const enrich = api();
    const teacher = lessonTeacher();
    if (!plan || !enrich?.applySuggestionsToDraft) return;
    const sectionMatch = String(sectionId || "").trim();
    const activityMatch = String(activityKeyFilter || "").trim();
    const suggestions = state.aiTray.suggestions.map((sug) => {
      const next = applyAiSuggestionEdits({ ...sug });
      if (next.decision === "discarded") return { ...next, selected: false };
      let include = false;
      if (acceptAll) include = true;
      else if (sectionMatch) {
        include = (teacher?.sectionIdForSuggestion?.(next) || "") === sectionMatch
          || (sectionMatch === "week" && (!next.activityKey || next.scope === "week"));
      } else if (activityMatch) {
        include = String(next.activityKey || "") === activityMatch;
      } else if (next.selected || next.decision === "accepted") {
        include = true;
      }
      if (include) return { ...next, decision: "accepted", selected: true };
      return { ...next, selected: false };
    });
    const toInsert = suggestions.filter((s) => s.selected && s.decision === "accepted");
    if (!toInsert.length) {
      state.statusText = "Select at least one suggestion to accept into the draft.";
      renderChromeOnly();
      return;
    }

    const learnFromAssistant = state.aiTray.source === "ai-teacher-assistant";

    // Canonical pure apply — never auto-save / publish. Lesson scope applies per activityKey.
    const activityKey = state.aiTray.activityKey || currentAiActivityKey(plan);
    const applied = (state.aiTray.scope === "lesson" && teacher?.applyLessonTeacherDecisions)
      ? teacher.applyLessonTeacherDecisions(state.draft, toInsert)
      : enrich.applySuggestionsToDraft(state.draft, toInsert, { activityKey });
    state.draft = applied.draft;
    const insertedCount = (applied.inserted || []).length;
    await logAiInsert(applied.fields || [], insertedCount);
    if (learnFromAssistant) {
      void learnFromAcceptedSuggestions(toInsert);
    }
    const insertedIds = new Set(toInsert.map((s) => s.id));
    const remaining = state.aiTray.suggestions
      .map((sug) => applyAiSuggestionEdits({ ...sug }))
      .filter((sug) => !insertedIds.has(sug.id) && sug.decision !== "discarded");
    refreshLessonAnalysis();
    markDirty({ autosave: false });
    const pct = state.lessonAnalysis?.completionPercent;
    const label = sectionMatch
      ? `section “${sectionMatch}”`
      : (activityMatch ? `activity ${activityMatch}` : "selected");
    if (closeTray || !remaining.length || acceptAll) {
      resetAiTray();
      state.statusText = insertedCount
        ? `Accepted ${insertedCount} AI improvement(s) (${label}) into draft only — not published.${pct != null ? ` Completion now ${pct}%.` : ""}`
        : "No suggestions accepted.";
    } else {
      state.aiTray.suggestions = remaining.map((sug) => ({
        ...sug,
        selected: sug.decision !== "discarded",
        decision: sug.decision === "accepted" ? "pending" : sug.decision,
      }));
      state.aiTray.phase = "ready";
      state.statusText = `Accepted ${insertedCount} (${label}) into draft. ${remaining.length} suggestion(s) still in review — not published.`;
    }
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

  async function saveDraft({ silent = false, _retry = false } = {}) {
    const plan = getPlan();
    if (!plan) return false;
    if (state.saveInFlight) {
      state.saveQueued = true;
      return false;
    }
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    const endpoint = root.curriculumLessonPlanConfig?.endpoint || "/api/admin/curriculum/lesson-plans";
    if (!token) {
      state.statusText = "Admin unlock required to save draft.";
      state.lastSaveError = state.statusText;
      renderChromeOnly();
      return false;
    }
    const activities = getActivities(plan);
    state.draft.completionPercent = recomputePercent(plan, activities);
    state.draft.updatedAt = new Date().toISOString();
    const admin = typeof adminSession === "function" ? adminSession() : null;
    state.draft.lastEditedBy = String(admin?.email || admin?.name || state.draft.lastEditedBy || "admin").trim();
    const draftSnapshot = JSON.parse(JSON.stringify(state.draft));
    const markers = draftVerificationMarkers(draftSnapshot);
    const editGenerationAtStart = Number(state.editGeneration || 0);
    const requestId = Number(state.saveRequestId || 0) + 1;
    state.saveRequestId = requestId;
    state.saveInFlight = true;
    state.lastSaveError = "";
    if (!silent) {
      state.statusText = "Saving draft…";
      renderChromeOnly();
    }
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
          adminEmail: state.draft.lastEditedBy || admin?.email || "",
          lessonPlan: {
            id: plan.id,
            enrichmentDraft: draftSnapshot,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      // Stale response: a newer save request superseded this one.
      if (requestId !== state.saveRequestId) {
        return false;
      }
      if (response.status === 409 && !_retry && (data.curriculum || data.code === "curriculum_conflict")) {
        state.saveInFlight = false;
        const overwrite = window.confirm(
          "Another admin updated curriculum while you were editing this lesson.\n\n"
          + "OK — overwrite with YOUR current draft for this lesson only.\n"
          + "Cancel — reload the lesson and discard your unsaved local draft changes.",
        );
        if (!overwrite) {
          if (data.curriculum && typeof applyCurriculumState === "function") {
            applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
          }
          open(plan.id);
          state.statusText = "Reloaded after concurrent edit. Local unsaved draft was not written.";
          state.dirty = false;
          render();
          return false;
        }
        if (data.curriculum && typeof applyCurriculumState === "function") {
          applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
        }
        // Retry once with the same local draft against the refreshed concurrency stamp.
        return saveDraft({ silent, _retry: true });
      }
      if (!response.ok) {
        const err = new Error(data.error || `HTTP ${response.status}`);
        err.code = data.code || "";
        throw err;
      }
      const savedPlan = data.lessonPlan
        || (data.curriculum?.lessonPlans || []).find((item) => item.id === plan.id)
        || null;
      const savedDraft = savedPlan?.enrichmentDraft || null;
      if (!draftContainsMarkers(savedDraft, markers, draftSnapshot)) {
        throw new Error("Draft save verification failed — server did not keep your changes. Unsaved work is still in the editor.");
      }
      if (data.curriculum && typeof applyCurriculumState === "function") {
        applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
      }

      const resolution = typeof api().resolveDraftSaveSuccess === "function"
        ? api().resolveDraftSaveSuccess({
          localDraft: state.draft,
          savedDraft,
          editGenerationAtStart,
          currentEditGeneration: state.editGeneration,
        })
        : {
          draft: state.draft,
          dirty: Number(state.editGeneration) !== editGenerationAtStart,
          remount: false,
          queueResave: Number(state.editGeneration) !== editGenerationAtStart,
          lastSavedDraft: savedDraft,
        };

      // Local edits always win while actively editing. Never replace newer local text/items
      // with an older autosave echo, and never remount the activity editor after save.
      state.draft = resolution.draft;
      if (resolution.lastSavedDraft) {
        state.lastSavedDraft = JSON.parse(JSON.stringify(resolution.lastSavedDraft));
      }
      state.dirty = Boolean(resolution.dirty);
      state.lastSaveError = "";
      // Only after a save that still matches the latest local generation may unused assets be cleaned up.
      if (!resolution.queueResave) {
        await flushPendingMediaCleanup(plan.id);
      }
      state.statusText = silent
        ? `Draft autosaved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Draft saved. Published lesson unchanged until you Publish.";
      // Chrome-only: preserve focus, caret, active activity, and scroll. Never scroll-to-top.
      renderChromeOnly();
      if (resolution.queueResave || state.saveQueued) {
        // Local edits landed during this request — flush the newer snapshot before reporting clean.
        state.saveQueued = false;
        state.saveInFlight = false;
        return saveDraft({ silent: true });
      }
      return true;
    } catch (error) {
      if (requestId !== state.saveRequestId) {
        return false;
      }
      // Failed draft save must not erase previously saved photos — keep lastSavedDraft refs
      // and do not flush pending cleanup (old assets may still be referenced server-side).
      // Keep dirty=true and local state.draft so the admin can retry without losing work.
      state.dirty = true;
      state.lastSaveError = error?.message || String(error);
      state.statusText = networkErrorMessage(error, `Draft save failed: ${error.message || error}. Click Save draft to retry.`);
      renderChromeOnly();
      return false;
    } finally {
      if (requestId === state.saveRequestId) {
        state.saveInFlight = false;
      }
      if (state.saveQueued && requestId === state.saveRequestId && !state.saveInFlight) {
        state.saveQueued = false;
        if (state.dirty) {
          setTimeout(() => {
            void saveDraft({ silent: true });
          }, 0);
        }
      }
    }
  }

  async function publishEnrichment({ ownerOverride = null } = {}) {
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
    const payload = {
      saveMode: "publish_enrichment",
      expectedUpdatedAt,
      publishedBy: state.draft.lastEditedBy || "",
      lessonPlan: { id: plan.id, enrichmentDraft: state.draft },
    };
    if (ownerOverride?.confirmed && ownerOverride.reason) {
      payload.ownerPublishOverride = {
        confirmed: true,
        reason: String(ownerOverride.reason).trim().slice(0, 500),
      };
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
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
      : `Published enrichment to providers${data.versionId ? ` (${data.versionId})` : ""}${data.ownerOverrideApplied ? " (owner override logged)" : ""}.`;
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
    state.editGeneration = 0;
    state.saveRequestId = 0;
    state.lastSavedDraft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
      : null;
    state.draft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
      : { activities: {}, week: {}, updatedAt: "", lastEditedBy: "", previewReady: false };
    if (!state.draft.activities) state.draft.activities = {};
    if (!state.draft.week) state.draft.week = {};
    // Open focused on the activity studio — summary/analysis panels are one click away.
    // Both open by default crushed the editable column and made tip cards unreadable.
    state.summaryOpen = false;
    state.analysisOpen = false;
    state.previewViewport = "desktop";
    state.previewDay = "monday";
    const activities = getActivities(plan);
    state.activityIndex = api().firstIncompleteActivityIndex(activities, state.draft.activities);
    const first = activities[state.activityIndex];
    if (first?.dayOfWeek) state.previewDay = String(first.dayOfWeek);
    const analysis = refreshLessonAnalysis();
    const gaps = analysis?.gapSectionIds?.length || 0;
    // Opening Upgrade Lesson is read-only load only — never auto-run AI, consume usage,
    // create proposals, autosave, or change scores/timestamps.
    state.statusText = gaps
      ? `${gaps} area(s) to improve · Prepare AI Draft when ready (never auto-runs).`
      : "Lesson loaded · edit manually, or Prepare AI Draft when ready.";
    state._focusReturn = document.activeElement;
    state.recoveryOpen = false;
    state.compareOpen = false;
    state.aiConfirmOpen = false;
    state.aiConfirmScope = "";
    document.body.classList.add("tk-enrich-open");
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("beforeunload", onBeforeUnload);
    render();
    requestAnimationFrame(() => {
      document.querySelector("[data-enrich-exit]")?.focus?.();
    });
  }

  function onBeforeUnload(event) {
    if (!state.open || !state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  }

  async function close({ force = false, abandonUnsaved = false } = {}) {
    clearTimeout(state.autosaveTimer);
    clearTimeout(state._previewTimer);
    if (typeof state.previewUnbind === "function") {
      try { state.previewUnbind(); } catch (_error) { /* ignore */ }
    }
    state.previewUnbind = null;
    resetAiTray();
    state.publishOpen = false;
    state.recoveryOpen = false;
    state.compareOpen = false;
    state.lightboxUrl = "";
    state.jumpOpen = false;
    if (state.dirty && !force) {
      if (abandonUnsaved) {
        const leave = window.confirm(
          "Leave without saving local edits? Any draft already saved on the server is kept.",
        );
        if (!leave) return false;
      } else if (!isEditorFlagEnabled()) {
        state.statusText = "Enrichment Editor disabled — unsaved draft kept locally only.";
      } else {
        const saveFirst = window.confirm(
          "You have unsaved enrichment changes. Save draft before leaving?",
        );
        if (!saveFirst) {
          state.statusText = "Stay in the editor to keep editing, or use Cancel to leave without saving.";
          renderChromeOnly();
          return false;
        }
        state.statusText = "Saving draft before exit…";
        renderChromeOnly();
        const saved = await saveDraft({ silent: true });
        if (!saved && state.dirty) {
          state.statusText = `${state.lastSaveError || "Draft save failed."} Stay in the editor to retry, or use Cancel to leave without saving.`;
          renderChromeOnly();
          // Keep the editor open so unsaved work is not discarded silently.
          return false;
        }
      }
    }
    const returnFocus = state._focusReturn;
    state.open = false;
    state.dirty = false;
    state._focusReturn = null;
    document.body.classList.remove("tk-enrich-open");
    window.removeEventListener("beforeunload", onBeforeUnload);
    revokeDraftMediaBlobs();
    const el = host();
    if (el) el.innerHTML = "";
    if (typeof renderAdminCurriculumLessonPlanManager === "function") {
      renderAdminCurriculumLessonPlanManager();
    }
    if (returnFocus && typeof returnFocus.focus === "function") {
      try { returnFocus.focus(); } catch (_error) { /* ignore */ }
    }
    return true;
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

  function renderAssistantPanel(plan) {
    const assistantApi = teacherAssistant();
    if (!assistantApi) return "";
    const tab = state.assistant.tab || "improve";
    const tabs = [
      ["improve", "Make This Better"],
      ["chat", "Teacher Chat"],
      ["toolkit", "Toolkit Builders"],
      ["library", "Reusable Library"],
      ["images", "Example Images"],
      ["quality", "Quality Review"],
    ];
    const improveActions = assistantApi.IMPROVE_ACTIONS || [];
    const builders = assistantApi.TOOLKIT_BUILDERS || [];
    const imageKinds = assistantApi.IMAGE_KINDS || [];
    let body = "";
    if (tab === "improve") {
      const fieldOptions = [
        ["weeklyOverview", "Weekly overview"],
        ["familyConnection", "Family connection"],
        ["teacherPreparation", "Teacher preparation"],
        ["teacherTips", "Teacher tips (current activity)"],
        ["observationPrompts", "Observations (current activity)"],
        ["custom", "Custom pasted text"],
      ];
      body = `
        <p class="muted-copy">Improve one section at a time — not a full regenerate. Results stay in draft until you accept.</p>
        <label class="muted-copy" for="tk-assistant-improve-field">Target section</label>
        <select id="tk-assistant-improve-field" data-assistant-improve-field>
          ${fieldOptions.map(([id, label]) => `
            <option value="${esc(id)}" ${state.assistant.improveField === id ? "selected" : ""}>${esc(label)}</option>
          `).join("")}
        </select>
        <label class="muted-copy" for="tk-assistant-improve-text">Section text</label>
        <textarea id="tk-assistant-improve-text" data-assistant-improve-text rows="3" placeholder="Paste or edit the section you want to improve…">${esc(state.assistant.improveText || "")}</textarea>
        <div class="tk-assistant-action-grid" data-assistant-improve-actions>
          ${improveActions.map((action) => `
            <button type="button" class="ghost-button" data-assistant-improve="${esc(action.id)}">${esc(action.label)}</button>
          `).join("")}
        </div>
      `;
    } else if (tab === "chat") {
      const log = (state.assistant.chatLog || []).map((entry) => `
        <div class="tk-assistant-chat-bubble is-${esc(entry.role)}">
          <strong>${entry.role === "teacher" ? "You" : "AI Teacher"}</strong>
          <p>${esc(entry.text)}</p>
        </div>
      `).join("");
      body = `
        <p class="muted-copy">Ask like a teammate: “I don’t have pom poms,” “We only have 10 minutes,” “Make this easier.” Drafts only.</p>
        <div class="tk-assistant-chat-log" data-assistant-chat-log>${log || `<p class="muted-copy">No messages yet.</p>`}</div>
        <textarea data-assistant-chat-input rows="2" placeholder="Give me another sensory activity…">${esc(state.assistant.chatInput || "")}</textarea>
        <button type="button" class="primary-button" data-assistant-chat-send>Send to AI Teacher</button>
      `;
    } else if (tab === "toolkit") {
      body = `
        <p class="muted-copy">One-click builders. AI prefers your reusable library before inventing something new.</p>
        <div class="tk-assistant-action-grid">
          ${builders.map((builder) => `
            <button type="button" class="ghost-button" data-assistant-toolkit="${esc(builder.id)}">${esc(builder.label)}</button>
          `).join("")}
          <button type="button" class="primary-button" data-assistant-printable-pack>Generate printable pack</button>
        </div>
      `;
    } else if (tab === "library") {
      const connections = state.assistant.connections || [];
      const recs = state.assistant.recommendations || [];
      body = `
        <p class="muted-copy"><strong>Highest-value workflow:</strong> reuse what you already built (printables, vocab, tips) instead of creating 150 near-duplicates.</p>
        <div class="form-actions">
          <button type="button" class="primary-button" data-assistant-refresh-connections>Find lesson connections</button>
          <button type="button" class="ghost-button" data-assistant-save-reusable>Save current tip as reusable</button>
        </div>
        <h5>Connections</h5>
        <ul class="tk-assistant-list">
          ${connections.map((c) => `<li>${esc(c.message || c.title || "")}</li>`).join("") || `<li class="muted-copy">No connections loaded yet.</li>`}
        </ul>
        <h5>Reusable recommendations</h5>
        <ul class="tk-assistant-list">
          ${recs.map((r) => `<li><strong>${esc(r.title)}</strong> · ${esc(r.type)} · score ${esc(String(r.matchScore || ""))}<br/><span class="muted-copy">${esc(r.recommendation || "")}</span></li>`).join("") || `<li class="muted-copy">No recommendations yet.</li>`}
        </ul>
      `;
    } else if (tab === "images") {
      body = `
        <p class="muted-copy">Generate example image drafts (setup, finished craft, invitation, sensory bin, classroom). Approval required before publish.</p>
        <div class="tk-assistant-action-grid">
          ${imageKinds.map((kind) => `
            <button type="button" class="ghost-button" data-assistant-image="${esc(kind)}">${esc(kind.replace(/_/g, " "))}</button>
          `).join("")}
        </div>
        ${state.assistant.lastImagePreview ? `
          <figure class="tk-assistant-image-preview">
            <img src="${esc(state.assistant.lastImagePreview)}" alt="Draft example image preview" />
            <figcaption class="muted-copy">Draft preview only — not published.</figcaption>
          </figure>
        ` : ""}
      `;
    } else if (tab === "quality") {
      const specialistOn = isQualityReviewFlagEnabled();
      const report = state.qualityReport;
      const review = state.assistant.quality;
      body = specialistOn ? `
        <p class="muted-copy">Specialist Quality Review — report only. Improve / Ignore / Edit manually. Blocking issues must be resolved before publish.</p>
        <button type="button" class="primary-button" data-quality-run-publish ${state.qualityBusy ? "disabled" : ""}>${state.qualityBusy ? "Reviewing…" : "Run specialist Quality Review"}</button>
        ${renderQualityReportBlock(report)}
      ` : `
        <p class="muted-copy">Pre-publish readiness check (guidance only). You remain the final reviewer.</p>
        <button type="button" class="primary-button" data-assistant-quality-run>Run quality review</button>
        ${review ? `
          <div class="tk-assistant-quality-score">
            <strong>${esc(String(review.readinessScore))}%</strong>
            <span class="tag">${esc(review.readinessLabel)}</span>
          </div>
          <ul class="tk-assistant-list">
            ${(review.findings || []).map((f) => `
              <li class="severity-${esc(f.severity)}"><strong>${esc(f.severity)}</strong> — ${esc(f.message)}</li>
            `).join("") || `<li class="muted-copy">No issues found.</li>`}
          </ul>
        ` : ""}
      `;
    }
    return `
      <details class="tk-assistant-panel" data-ai-teacher-assistant>
        <summary class="tk-assistant-head">
          <div>
            <p class="eyebrow">AI Teacher Assistant</p>
            <strong>Optional AI tools for ${esc(plan.title || "this lesson")}</strong>
          </div>
        </summary>
        <nav class="tk-assistant-tabs" aria-label="AI Teacher Assistant">
          ${tabs.map(([id, label]) => `
            <button type="button" class="${tab === id ? "is-active" : ""}" data-assistant-tab="${id}">${esc(label)}</button>
          `).join("")}
        </nav>
        <div class="tk-assistant-body">${body}</div>
        ${state.assistant.status ? `<p class="muted-copy tk-assistant-status">${esc(state.assistant.status)}</p>` : ""}
      </details>
    `;
  }

  function renderLessonAnalysisPanel(plan, activities) {
    const analysis = state.lessonAnalysis || refreshLessonAnalysis();
    if (!analysis) return "";
    const counts = analysis.counts || {};
    const sections = Array.isArray(analysis.sections) ? analysis.sections : [];
    return `
      <section class="tk-lesson-teacher-panel ${state.analysisOpen ? "is-open" : "is-collapsed"}" data-lesson-analysis>
        <div class="tk-lesson-teacher-head">
          <div>
            <p class="eyebrow">AI Lesson Teacher</p>
            <strong>Workflow ${esc(analysis.dashboardStage || "Legacy")} · Structural ${analysis.completionPercent}%${analysis.weekdayCoverage ? ` · ${esc(analysis.weekdayCoverage.label)}` : ""}</strong>
            ${state.analysisOpen ? `<p class="muted-copy">Local analysis only — opening never starts AI. Press Prepare AI Draft and confirm to generate suggestions. Existing approved content is preserved.</p>` : ""}
          </div>
          <div class="tk-lesson-teacher-actions">
            ${state.analysisOpen ? `<button type="button" class="primary-button" data-ai-suggest="lesson">Prepare AI Draft</button>` : ""}
            <button type="button" class="ghost-button" data-analysis-toggle>${state.analysisOpen ? "Hide scores" : "Show scores"}</button>
          </div>
        </div>
        <div class="tk-lesson-teacher-counts" aria-label="Section score counts">
          <span class="is-complete"><strong>${counts.complete || 0}</strong> Complete</span>
          <span class="is-needs"><strong>${counts.needs_improvement || 0}</strong> Needs Improvement</span>
          <span class="is-missing"><strong>${counts.missing || 0}</strong> Missing</span>
        </div>
        ${state.analysisOpen ? `
          <ul class="tk-lesson-teacher-sections">
            ${sections.map((section) => `
              <li class="status-${esc(section.status)}" data-analysis-section="${esc(section.id)}">
                <span>${esc(section.label)}</span>
                <strong>${esc(section.statusLabel || section.status)}</strong>
                <small>${esc(section.detail || "")}</small>
              </li>
            `).join("")}
          </ul>
          <p class="muted-copy">Workflow: Analyze → Prepare AI Draft → Side-by-side review → Accept/Reject/Edit → Save draft → Publish only when you approve.</p>
        ` : ""}
      </section>
    `;
  }

  function renderUpgradeSummary(plan, activities) {
    const summary = api().buildUpgradeSummary(plan, activities, state.draft);
    const scores = summary.readinessScores || {};
    const workflow = summary.canonicalStatus?.workflow || summary.dashboardStage || summary.completenessLabel;
    const rows = [
      ["incomplete", "Incomplete activities", String(summary.incompleteActivities), summary.incompleteActivities > 0],
      ["setup", "Missing setup photos (real images)", String(summary.missingSetupPhotos), summary.missingSetupPhotos > 0],
      ["example", "Missing finished example photos", String(summary.missingExamplePhotos), summary.missingExamplePhotos > 0],
      ["briefs", "Image briefs (not photos)", String(summary.imageBriefsNotImages || 0), (summary.imageBriefsNotImages || 0) > 0],
      ["tips", "Missing teacher tips", String(summary.missingTeacherTips), summary.missingTeacherTips > 0],
      ["observations", "Missing observation prompts", String(summary.missingObservationPrompts), summary.missingObservationPrompts > 0],
      ["family", "Missing family connections", yn(summary.missingFamilyConnection), summary.missingFamilyConnection],
      ["printables", "Missing linked printables", yn(summary.missingPrintables), summary.missingPrintables],
      ["books", "Incomplete books", String(summary.incompleteBooks != null ? summary.incompleteBooks : (summary.missingBooks ? "Yes" : "0")), summary.missingBooks || (summary.incompleteBooks || 0) > 0],
      ["songs", "Incomplete songs", String(summary.incompleteSongs != null ? summary.incompleteSongs : (summary.missingSongs ? "Yes" : "0")), summary.missingSongs || (summary.incompleteSongs || 0) > 0],
      ["toolkit", "Missing teacher toolkit", yn(summary.missingTeacherToolkit), summary.missingTeacherToolkit],
      ["vocabulary", "Missing vocabulary", yn(summary.missingVocabulary), summary.missingVocabulary],
      ["objectives", "Missing learning objectives", yn(summary.missingLearningObjectives), summary.missingLearningObjectives],
      ["materials", "Missing materials", yn(summary.missingMaterials), summary.missingMaterials],
      ["ai", "AI Ready", summary.aiReady ? "Ready" : "Not ready", !summary.aiReady],
    ];
    const canRollback = Array.isArray(plan.enrichmentPublishHistory) && plan.enrichmentPublishHistory.length > 0;
    const structural = summary.enrichmentFillPercent ?? summary.completionPercent ?? 0;
    const premium = summary.premiumReadinessPercent ?? 0;
    return `
      <aside class="tk-enrich-summary ${state.summaryOpen ? "is-open" : "is-collapsed"}" data-upgrade-summary>
        <div class="tk-enrich-summary-head">
          <div>
            <p class="eyebrow">Upgrade Summary</p>
            <strong data-workflow-status>${esc(workflow)}</strong>
            <p class="muted-copy">${esc(summary.weekdayCoverageLabel || "Weekday coverage pending")} · ${structural}% structural completion · ${premium}% premium readiness</p>
          </div>
          <button type="button" class="ghost-button" data-summary-toggle>${state.summaryOpen ? "Hide" : "Show"}</button>
        </div>
        ${state.summaryOpen ? `
          <div class="tk-enrich-score-grid" data-readiness-scores>
            <div><span>Structural</span><strong>${scores.structuralCompleteness ?? structural}%</strong></div>
            <div><span>Educational</span><strong>${scores.educationalQuality ?? "—"}%</strong></div>
            <div><span>Activities</span><strong>${scores.activityCompleteness ?? "—"}%</strong></div>
            <div><span>Weekdays</span><strong>${scores.weekdayCompleteness ?? "—"}%</strong></div>
            <div><span>Resources</span><strong>${scores.resourceCompleteness ?? "—"}%</strong></div>
            <div><span>Images</span><strong>${scores.imageReadiness ?? "—"}%</strong></div>
            <div><span>Print</span><strong>${scores.printReadiness ?? "—"}%</strong></div>
            <div><span>Premium readiness</span><strong data-premium-readiness>${premium}%</strong></div>
          </div>
          <div class="tk-enrich-summary-stepper" aria-hidden="true">
            <span class="${/Legacy/i.test(workflow) ? "is-active" : "is-done"}">Legacy</span>
            <span class="${/Draft Started|AI Draft|In Review|Needs Changes|In Progress|Needs Review/i.test(workflow) ? "is-active" : (structural >= 50 ? "is-done" : "")}">In Review</span>
            <span class="${/Publish Ready|Ready for Owner|Ready|Complete/i.test(workflow) ? "is-active" : ""}">Publish Ready</span>
            <span class="${/Published/i.test(workflow) ? "is-active" : ""}">Published</span>
          </div>
          <div class="tk-enrich-bar" aria-hidden="true" title="Premium readiness"><i style="width:${premium}%"></i></div>
          <dl class="tk-enrich-summary-list">
            ${rows.map(([jump, label, value, warn]) => `
              <div class="tk-enrich-summary-row ${warn ? "is-missing" : "is-ready"}">
                <dt><button type="button" data-summary-jump="${jump}">${esc(label)}</button></dt>
                <dd>${esc(value)}</dd>
              </div>
            `).join("")}
            <div class="tk-enrich-summary-row">
              <dt>Last updated</dt>
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
          ${canRollback ? `
            <button type="button" class="ghost-button" data-enrich-rollback>Rollback Last Publish</button>
            <p class="muted-copy">Loads the prior publish backup into a new draft. Providers keep seeing the current published kit until you Publish.</p>
          ` : ""}
          <p class="muted-copy tk-enrich-summary-note">Structural % is field fill only. Publish Ready requires zero hard blockers and real images/printables. Draft save is never blocked.</p>
        ` : ""}
      </aside>
    `;
  }

  function renderChrome(plan, activities, percent, label) {
    const isPublished = ["published", "featured"].includes(String(plan.status || "").toLowerCase());
    const n = activities.length;
    const idx = Math.min(state.activityIndex, Math.max(0, n - 1));
    const historyCount = Array.isArray(plan.enrichmentPublishHistory) ? plan.enrichmentPublishHistory.length : 0;
    const summary = api().buildUpgradeSummary(plan, activities, state.draft);
    const premium = summary.premiumReadinessPercent ?? 0;
    const workflow = summary.canonicalStatus?.workflow || summary.dashboardStage || label;
    const blocked = Boolean(state.qualityReport?.blocksPublish);
    return `
      <header class="tk-enrich-chrome">
        <div class="tk-enrich-chrome-top">
          <div class="tk-enrich-chrome-nav">
            <button type="button" class="ghost-button" data-enrich-exit data-enrich-back-to-list>← Back</button>
            <button type="button" class="ghost-button tk-enrich-chrome-secondary" data-enrich-close title="Close editor">Close</button>
            <span class="tk-enrich-chrome-title">${esc(plan.title || "Lesson")}</span>
          </div>
          <div class="tk-enrich-progress-block">
            <div class="tk-enrich-stepper">
              <span class="${percent < 50 ? "is-active" : "is-done"}">Legacy</span>
              <span class="${percent >= 50 && premium < 90 ? "is-active" : premium >= 90 ? "is-done" : ""}">In Review</span>
              <span class="${premium >= 90 && !blocked ? "is-active" : ""}">Publish Ready</span>
            </div>
            <div class="tk-enrich-percent-row">
              <strong title="Structural completion (field fill)">Completion ${percent}%</strong>
              <span class="muted-copy" data-premium-readiness-chrome title="Premium Teaching Kit readiness">Readiness ${premium}%</span>
              <div class="tk-enrich-bar" aria-hidden="true"><i style="width:${premium}%"></i></div>
              <span class="tag" data-workflow-status-chrome>${esc(workflow)}</span>
            </div>
          </div>
          <div class="tk-enrich-chrome-actions">
            <button type="button" class="primary-button" data-ai-suggest="lesson">Prepare AI Draft</button>
            <button type="button" class="ghost-button" data-summary-toggle>Upgrade Summary</button>
            <button type="button" class="primary-button" data-enrich-save-draft>Save draft</button>
            <button type="button" class="primary-button" data-enrich-publish ${blocked ? "title=\"Resolve hard blockers or use owner override\"" : ""}>Publish…</button>
            <button type="button" class="ghost-button" data-enrich-next-lesson>Next lesson →</button>
          </div>
        </div>
        <details class="tk-enrich-recovery-toolbar" data-enrich-recovery-toolbar>
          <summary>History &amp; Recovery${historyCount ? ` (${historyCount})` : ""}</summary>
          <div class="tk-enrich-recovery-toolbar-actions" aria-label="Version history and recovery">
            <button type="button" class="ghost-button" data-enrich-recovery data-enrich-open-history data-tk-recovery-toolbar>Version History (${historyCount})</button>
            <button type="button" class="ghost-button" data-enrich-recovery data-enrich-open-compare>Compare versions</button>
            <button type="button" class="ghost-button" data-enrich-rollback ${historyCount ? "" : "disabled"}>Rollback Last Publish</button>
            <button type="button" class="ghost-button" data-enrich-discard-draft>Discard Draft</button>
            <button type="button" class="ghost-button" data-enrich-undo-discard ${plan?.enrichmentDraftUndo?.draft ? "" : "disabled"}>Undo Discard</button>
            <span class="muted-copy">Rollback restores into a draft — Publish required before providers see changes.</span>
          </div>
        </details>
        <div class="tk-enrich-chrome-sub">
          <div class="tk-enrich-counter">
            <strong>Activity ${n ? idx + 1 : 0} of ${n}</strong>
            <button type="button" class="ghost-button" data-enrich-prev ${idx <= 0 ? "disabled" : ""}>← Prev</button>
            <button type="button" class="ghost-button" data-enrich-next ${idx >= n - 1 ? "disabled" : ""}>Next →</button>
            <button type="button" class="ghost-button" data-enrich-jump-toggle>Jump…</button>
          </div>
          <div class="tk-enrich-jump">
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
            <button type="button" class="ghost-button" data-ai-suggest="lesson">Prepare full lesson draft</button>
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
          <section class="tk-enrich-card-block">
            <h4>Example image briefs (style guide)</h4>
            <p class="muted-copy">AI drafts classroom-style briefs only — never glossy stock. Upload photos that match, or use the brief when creating images. Briefs do not publish as photos.</p>
            <label class="muted-copy">Setup example brief</label>
            <textarea data-image-brief-setup rows="2" placeholder="Simple tray setup, ordinary materials, natural light…">${esc(view.imageBriefSetup || "")}</textarea>
            <label class="muted-copy">Finished example brief</label>
            <textarea data-image-brief-example rows="2" placeholder="Achievable craft / play result, teacher-manual style…">${esc(view.imageBriefExample || "")}</textarea>
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
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object" ? week.teacherToolkit : {};
    const bank = ["Sorting", "Fine motor", "Language", "Social-emotional", "Gross motor", "Creativity", "Self-help"];
    const draftBooks = Array.isArray(week.books) ? week.books : [];
    const draftSongs = Array.isArray(week.songs) ? week.songs : [];
    const printableIdeas = Array.isArray(week.printableIdeas) ? week.printableIdeas : [];
    const vocabCards = Array.isArray(week.vocabCards) ? week.vocabCards : [];
    return `
      <div class="tk-enrich-week-layout">
        <div class="tk-enrich-week-ai-bar">
          <p class="muted-copy">AI Lesson Teacher drafts missing week + activity pieces (overview, objectives, books, songs, toolkit, family, printables, tips). Nothing inserts until you approve.</p>
          <button type="button" class="primary-button" data-ai-suggest="lesson">Prepare AI Draft</button>
          <button type="button" class="ghost-button" data-ai-suggest="week">Upgrade week only</button>
        </div>
        <section class="tk-enrich-card-block">
          <h4>Weekly overview</h4>
          ${plan.weeklyOverview ? `<div class="tk-enrich-current-text">${esc(plan.weeklyOverview)}</div>` : ""}
          <textarea data-week-overview rows="3" placeholder="Draft weekly overview…">${esc(week.weeklyOverview || "")}</textarea>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Learning objectives</h4>
          ${plan.objectives ? `<div class="tk-enrich-current-text">${esc(plan.objectives)}</div>` : ""}
          <textarea data-week-objectives rows="3" placeholder="Draft objectives…">${esc(week.objectives || "")}</textarea>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Materials list</h4>
          ${plan.weeklyMaterials ? `<div class="tk-enrich-current-text">${esc(plan.weeklyMaterials)}</div>` : ""}
          <textarea data-week-materials rows="3" placeholder="Draft materials list…">${esc(week.weeklyMaterials || "")}</textarea>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Teacher preparation / Toolkit</h4>
          <textarea data-week-teacher-prep rows="2" placeholder="Teacher preparation…">${esc(week.teacherPreparation || toolkit.teacherPreparation || "")}</textarea>
          <label class="muted-copy">Prep checklist (one per line)</label>
          <textarea data-week-toolkit-prep rows="3" placeholder="Print cards…">${esc((toolkit.prepChecklist || []).join("\n"))}</textarea>
          <label class="muted-copy">Observation focus (one per line)</label>
          <textarea data-week-toolkit-focus rows="3" placeholder="Listen for vocabulary…">${esc((toolkit.observationFocus || []).join("\n"))}</textarea>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Family connection</h4>
          <p class="muted-copy">Current text is kept unless you replace it here.</p>
          ${plan.familyConnection ? `<div class="tk-enrich-current-text">${esc(plan.familyConnection)}</div>` : ""}
          <textarea data-week-family rows="3" placeholder="Optional draft family idea…">${esc(week.familyConnection || "")}</textarea>
        </section>
        <section class="tk-enrich-card-block">
          <h4>Draft books / songs / printables</h4>
          <p class="muted-copy">AI inserts appear here for review. Publishing merges by title — never deletes existing lists.</p>
          <ul class="tk-enrich-checklist">
            ${draftBooks.map((book) => `<li><strong>Book:</strong> ${esc(book.title || "")}${book.author ? ` — ${esc(book.author)}` : ""}${book.questions ? ` · ${esc(book.questions)}` : ""}</li>`).join("") || "<li class=\"muted-copy\">No draft books yet</li>"}
            ${draftSongs.map((song) => `<li><strong>Song:</strong> ${esc(song.title || "")}</li>`).join("")}
            ${printableIdeas.map((idea) => `<li><strong>Printable idea:</strong> ${esc(idea)}</li>`).join("")}
            ${vocabCards.map((card) => `<li><strong>Vocab card:</strong> ${esc(card)}</li>`).join("")}
          </ul>
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
          <p class="muted-copy">Never blocks saving a draft. Aim for Ready / Complete before publish.</p>
          <ul class="tk-enrich-checklist">
            <li>Cover & week story</li>
            <li>Setup + finished example images (classroom style)</li>
            <li>Books & songs</li>
            <li>Family idea</li>
            <li>Teacher toolkit</li>
            <li>Printable ideas / linked printables</li>
            <li>Observations · adaptations · indoor/outdoor options</li>
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

  function renderAiSuggestionCard(sug, index) {
    const discarded = sug.decision === "discarded";
    const scopeHint = sug.activityKey
      ? `Activity · ${sug.activityKey}`
      : (sug.scope === "week" || state.aiTray.scope === "lesson" ? "Week" : "Activity");
    return `
      <article class="tk-enrich-ai-card ${discarded ? "is-discarded" : ""} ${sug.selected ? "is-selected" : ""}" data-ai-card="${index}">
        <label class="tk-enrich-ai-select">
          <input type="checkbox" data-ai-select="${index}" ${sug.selected && !discarded ? "checked" : ""} ${discarded ? "disabled" : ""} />
          <span>Select</span>
        </label>
        <div class="tk-enrich-ai-meta">
          <strong>${esc(sug.fieldLabel || sug.field)}</strong>
          <span class="muted-copy">${esc(sug.category || "")}</span>
          <span class="tag">${esc(scopeHint)}</span>
        </div>
        <div class="tk-enrich-ai-compare">
          <div>
            <h5>Current Lesson</h5>
            <p>${esc(sug.currentValue || "(empty)")}</p>
          </div>
          <div>
            <h5>AI Draft</h5>
            ${sug.editing
              ? `<textarea data-ai-edit-text="${index}" rows="3">${esc(sug.editText || sug.proposedText || "")}</textarea>`
              : `<p>${esc(sug.proposedText || "")}</p>`}
          </div>
        </div>
        <div class="tk-enrich-ai-card-actions">
          <button type="button" class="ghost-button" data-ai-accept="${index}" ${discarded ? "disabled" : ""}>Accept</button>
          <button type="button" class="ghost-button" data-ai-edit="${index}" ${discarded ? "disabled" : ""}>${sug.editing ? "Done editing" : "Edit before accept"}</button>
          <button type="button" class="ghost-button" data-ai-discard="${index}">Reject</button>
        </div>
      </article>
    `;
  }

  function renderAiReviewList(tray) {
    const teacher = lessonTeacher();
    const grouped = teacher?.groupSuggestionsForReview
      ? teacher.groupSuggestionsForReview(tray.suggestions)
      : { week: tray.suggestions || [], activities: [] };
    const useGroups = tray.scope === "lesson" && (grouped.week.length || grouped.activities.length);
    if (!useGroups) {
      const cards = (tray.suggestions || []).map((sug, index) => renderAiSuggestionCard(sug, index)).join("")
        || `<p class="muted-copy">No draft improvements for the current gaps. Existing content was preserved.</p>`;
      return `<div class="tk-enrich-ai-list" data-ai-review-list>${cards}</div>`;
    }

    const indexById = new Map((tray.suggestions || []).map((sug, index) => [sug.id, index]));
    const weekCards = grouped.week.map((sug) => renderAiSuggestionCard(sug, indexById.get(sug.id) ?? sug.index)).join("");
    const activityBlocks = grouped.activities.map((group) => {
      const title = (() => {
        const plan = getPlan();
        const act = getActivities(plan).find((a) => draftKey(a) === group.activityKey);
        return act?.title || group.activityKey;
      })();
      const cards = group.rows.map((sug) => renderAiSuggestionCard(sug, indexById.get(sug.id) ?? sug.index)).join("");
      return `
        <section class="tk-enrich-ai-group" data-ai-activity-group="${esc(group.activityKey)}">
          <div class="tk-enrich-ai-group-head">
            <strong>${esc(title)}</strong>
            <button type="button" class="ghost-button" data-ai-accept-activity="${esc(group.activityKey)}">Accept activity</button>
          </div>
          <div class="tk-enrich-ai-list">${cards}</div>
        </section>
      `;
    }).join("");

    const sectionButtons = [
      ["overview", "Overview"],
      ["objectives", "Objectives"],
      ["vocabulary", "Vocabulary"],
      ["materials", "Materials"],
      ["songs", "Songs"],
      ["books", "Books"],
      ["family", "Family"],
      ["printables", "Printables"],
      ["teacher_toolkit", "Toolkit"],
      ["teacher_tips", "Tips"],
      ["images", "Image briefs"],
    ].map(([id, label]) => (
      `<button type="button" class="ghost-button" data-ai-accept-section="${id}">Accept ${esc(label)}</button>`
    )).join("");

    return `
      <div class="tk-enrich-ai-section-bar" data-ai-section-bar>
        <p class="muted-copy">Accept by section (draft only):</p>
        <div class="tk-enrich-ai-section-actions">${sectionButtons}</div>
      </div>
      ${weekCards ? `
        <section class="tk-enrich-ai-group" data-ai-week-group>
          <div class="tk-enrich-ai-group-head">
            <strong>Week &amp; Teaching Kit binder</strong>
            <button type="button" class="ghost-button" data-ai-accept-section="week">Accept week section</button>
          </div>
          <div class="tk-enrich-ai-list">${weekCards}</div>
        </section>
      ` : ""}
      <div class="tk-enrich-ai-list" data-ai-review-list>${activityBlocks || `<p class="muted-copy">No activity drafts in this batch yet.</p>`}</div>
    `;
  }

  function aiSuggestionCounts(tray) {
    const rows = Array.isArray(tray?.suggestions) ? tray.suggestions : [];
    const pending = rows.filter((s) => s.decision === "pending" || !s.decision).length;
    const selected = rows.filter((s) => s.selected && s.decision !== "discarded" && s.decision !== "accepted").length;
    const accepted = rows.filter((s) => s.decision === "accepted").length;
    const edited = rows.filter((s) => s.editing || (s.editText && s.editText !== s.proposedText)).length;
    const rejected = rows.filter((s) => s.decision === "discarded").length;
    const loaded = rows.length;
    const inconsistent = selected > loaded
      || selected > (pending + accepted)
      || pending + accepted + rejected !== loaded
      || loaded < 0;
    return { pending, selected, accepted, edited, rejected, loaded, inconsistent };
  }

  function renderAiTray() {
    if (!state.aiTray.open) return "";
    const tray = state.aiTray;
    const isLesson = tray.scope === "lesson";
    const counts = aiSuggestionCounts(tray);
    const progress = tray.batchProgress;
    const progressLine = progress
      ? `<p class="tk-enrich-ai-progress" data-ai-batch-progress>Activities ${progress.processed}/${progress.total} · ${progress.batchCount} batch${progress.batchCount === 1 ? "" : "es"} · ${(progress.elapsedMs / 1000).toFixed(1)}s${progress.hasMore ? " · loading more…" : ""}</p>`
      : "";
    const countLine = counts.loaded
      ? `<p class="tk-enrich-ai-counts" data-ai-selection-counts>Loaded ${counts.loaded}${progress?.hasMore ? "+" : ""} · Pending ${counts.pending} · Selected ${counts.selected} · Accepted ${counts.accepted} · Edited ${counts.edited} · Rejected ${counts.rejected}${counts.inconsistent ? " · <strong>Counts inconsistent — bulk accept disabled</strong>" : ""}</p>`
      : "";
    let body = "";
    if (tray.phase === "loading" && !(isLesson && (tray.suggestions || []).length)) {
      body = `
        <div class="tk-enrich-ai-status" data-ai-loading>
          <p><strong>${isLesson ? "AI Lesson Teacher is preparing your complete Teaching Kit…" : "Generating suggestions…"}</strong></p>
          <p class="muted-copy">Existing published content stays unchanged. Large lessons process in safe batches behind one review session. You can cancel anytime.</p>
          ${progressLine}
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
      const stillLoading = tray.phase === "loading" && isLesson;
      const bulkDisabled = !counts.pending || counts.inconsistent || stillLoading;
      const selectedDisabled = !counts.selected || counts.inconsistent;
      body = `
        ${progressLine}
        ${countLine}
        ${stillLoading ? `<p class="muted-copy" data-ai-loading>Still preparing remaining activities — counts above are for loaded rows only (not a final total).</p>` : ""}
        <p class="muted-copy">Side-by-side review: accept one row, a section, an activity, or all. Accepting writes to the <strong>draft only</strong> — never auto-saves and never publishes. Legacy content is never deleted.</p>
        ${renderAiReviewList(tray)}
        <div class="form-actions tk-enrich-ai-bulk-actions">
          <button type="button" class="ghost-button" data-ai-reject-all>Reject all</button>
          <button type="button" class="ghost-button" data-ai-accept-all ${bulkDisabled ? "disabled" : ""} title="${counts.inconsistent ? "Selection state inconsistent" : stillLoading ? "Wait for batches to finish" : ""}">Accept all into draft</button>
          <button type="button" class="ghost-button" data-ai-cancel>Close</button>
          <button type="button" class="primary-button" data-ai-insert-selected ${selectedDisabled ? "disabled" : ""}>Accept selected (${counts.selected})</button>
        </div>
      `;
    }
    const analysis = state.lessonAnalysis;
    const analysisLine = analysis
      ? ` · Gaps: ${analysis.gapSectionIds?.length || 0} · Complete ${analysis.counts?.complete || 0} / Needs ${analysis.counts?.needs_improvement || 0} / Missing ${analysis.counts?.missing || 0}`
      : "";
    const timing = tray.generationTiming;
    const timingLine = timing
      ? ` · Generated in ${(timing.elapsedMs / 1000).toFixed(1)}s (${timing.batchCount} batch${timing.batchCount === 1 ? "" : "es"})`
      : "";
    return `
      <div class="tk-enrich-modal tk-enrich-ai-modal ${isLesson ? "is-lesson-teacher" : ""}" data-ai-tray role="dialog" aria-modal="true" aria-labelledby="tk-enrich-ai-title">
        <div class="tk-enrich-modal-card tk-enrich-ai-card-shell" tabindex="-1">
          <h3 id="tk-enrich-ai-title">${isLesson ? "AI Lesson Teacher — Complete kit review" : "AI enrichment suggestions"}</h3>
          <p class="muted-copy">Lesson: <strong>${esc((getPlan() || {}).title || "Current lesson")}</strong> · Scope: ${esc(tray.scope)}${tray.activityKey ? ` · Activity draft only` : ""}${esc(analysisLine)}${esc(timingLine)}</p>
          ${body}
        </div>
      </div>
    `;
  }

  function renderQualityReportBlock(report) {
    if (!report) {
      return `<p class="muted-copy">Run Quality Review before publishing. Report only — it never auto-edits or auto-publishes. Field presence alone is never “100% quality.”</p>`;
    }
    const findings = (report.findings || []).filter((f) => f.status !== "ignored");
    const readiness = report.publishReadinessLabel
      || (report.blocksPublish ? "Blocked" : (report.publishReadiness === "ready" ? "Ready" : "Needs Review"));
    const readinessClass = report.blocksPublish
      ? "is-danger"
      : (report.publishReadiness === "ready" ? "is-ready" : "is-warn");
    const blockers = report.blockingIssues || [];
    return `
      <section class="tk-quality-report" data-quality-report>
        <div class="tk-quality-report-score">
          <strong title="Educational quality score (not field presence)">${esc(String(report.overallScore))}%</strong>
          <span class="tag" title="Educational quality">${esc(report.overallLabel)}</span>
          <span class="tag ${readinessClass}" data-publish-readiness="${esc(report.publishReadiness || "")}">${esc(readiness)}</span>
          <span class="muted-copy" title="Structural vs premium">Structural ${report.completionPercent ?? "—"}% · Premium ${report.premiumReadinessPercent ?? "—"}%</span>
          ${report.blocksPublish
            ? `<span class="tag is-danger">Hard blockers: ${blockers.length}</span>`
            : (report.publishReadiness === "needs_review"
              ? `<span class="tag is-warn">Warnings</span>`
              : `<span class="tag is-ready">No blockers</span>`)}
        </div>
        ${blockers.length ? `
          <div class="tk-quality-hard-blockers" data-hard-blockers>
            <h5>Hard publish blockers</h5>
            <ul>
              ${blockers.map((b) => `
                <li>
                  <button type="button" class="ghost-button" data-blocker-navigate="${esc(b.navigateTo || b.code)}" data-blocker-section="${esc(b.code)}">
                    ${esc(b.message)}
                  </button>
                  ${b.suggestion ? `<p class="muted-copy">${esc(b.suggestion)}</p>` : ""}
                </li>
              `).join("")}
            </ul>
          </div>
        ` : ""}
        <div class="tk-quality-report-grid">
          <div>
            <h5>Strengths</h5>
            <ul>${(report.strengths || []).map((s) => `<li>${esc(s)}</li>`).join("") || `<li class="muted-copy">None called out yet.</li>`}</ul>
          </div>
          <div>
            <h5>Missing</h5>
            <ul>${(report.missing || []).slice(0, 8).map((s) => `<li>${esc(s)}</li>`).join("") || `<li class="muted-copy">None.</li>`}</ul>
          </div>
        </div>
        <h5>Issues</h5>
        <ul class="tk-quality-issue-list">
          ${findings.slice(0, 20).map((f) => `
            <li class="severity-${esc(f.severity)}" data-quality-finding="${esc(f.id)}">
              <strong>${esc(f.severity)}</strong> · ${esc(f.sectionLabel || f.section)} — ${esc(f.message)}
              ${f.suggestion ? `<p class="muted-copy">${esc(f.suggestion)}</p>` : ""}
              <div class="form-actions">
                <button type="button" class="primary-button" data-quality-improve="${esc(f.id)}">Improve with AI</button>
                <button type="button" class="ghost-button" data-quality-ignore="${esc(f.id)}" data-quality-code="${esc(f.code)}">Ignore</button>
                <button type="button" class="ghost-button" data-quality-edit-manual="${esc(f.section)}" data-blocker-navigate="${esc(f.navigateTo || "")}">Edit manually</button>
              </div>
            </li>
          `).join("") || `<li class="muted-copy">No open issues.</li>`}
        </ul>
      </section>
    `;
  }

  function renderPublishModal(plan, activities) {
    if (!state.publishOpen) return "";
    const summary = api().summarizePublishChanges(plan, activities, state.draft);
    const upgrade = api().buildUpgradeSummary(plan, activities, state.draft);
    const historyCount = Array.isArray(plan.enrichmentPublishHistory) ? plan.enrichmentPublishHistory.length : 0;
    const qualityOn = isQualityReviewFlagEnabled();
    const report = state.qualityReport;
    const blocked = qualityOn && report?.blocksPublish;
    const readiness = report?.publishReadinessLabel
      || (blocked ? "Blocked" : (report?.publishReadiness === "ready" ? "Ready" : "Needs Review"));
    const acceptedAi = Number(state.draft?.acceptedAiSuggestionCount || state._acceptedAiCount || 0);
    const manualEdits = Number(state.draft?.manualEditCount || (state.dirty ? 1 : 0));
    const warningCount = (report?.warnings || []).length;
    const blockerCount = (report?.blockingIssues || []).length;
    return `
      <div class="tk-enrich-modal" data-publish-modal role="dialog" aria-modal="true" aria-labelledby="tk-enrich-publish-title">
        <button type="button" class="tk-enrich-modal-backdrop" data-publish-cancel aria-label="Cancel publish"></button>
        <div class="tk-enrich-modal-card tk-enrich-publish-card" tabindex="-1">
          <div class="tk-enrich-publish-scroll">
            <h3 id="tk-enrich-publish-title">Publish enrichment for this lesson?</h3>
            <p class="muted-copy">Only <strong>${esc(plan.title || "this lesson")}</strong> will change. Unrelated lessons stay untouched. AI cannot publish. Save Draft never publishes. Cancel leaves everything unchanged.</p>
            <ul class="tk-enrich-publish-summary">
              <li><strong>Current published version:</strong> ${historyCount ? `${historyCount} snapshot(s) on file` : "None yet — first enrichment publish"}</li>
              <li><strong>Draft version:</strong> ${esc(upgrade.draftOrPublished)} · structural ${upgrade.completionPercent ?? "—"}% · premium ${upgrade.premiumReadinessPercent ?? "—"}%</li>
              <li><strong>Sections changing:</strong> ${summary.photoChanges} photo(s), ${summary.tipChanges} tip(s), ${summary.linkedActivitiesAffected} linked activit${summary.linkedActivitiesAffected === 1 ? "y" : "ies"}</li>
              <li><strong>Accepted AI suggestions (session):</strong> ${acceptedAi}</li>
              <li><strong>Manual edits pending:</strong> ${manualEdits ? "Yes" : "None flagged"}</li>
              <li><strong>Remaining warnings:</strong> ${warningCount}</li>
              <li><strong>Hard blockers:</strong> ${blockerCount}${blocked ? " — Publish disabled until resolved or owner override" : ""}</li>
              <li><strong>Images added/removed:</strong> ${summary.photoChanges} photo field update(s)</li>
              <li><strong>Printables:</strong> ${upgrade.missingPrintables ? "Still missing linked printable resources" : "Linked printable resources present"}</li>
              <li><strong>Customer-visible result:</strong> ${summary.isPublished ? "Providers see enrichment only after this publish succeeds" : "Lesson is not published/featured yet"}</li>
              <li><strong>Publish readiness:</strong> <span data-publish-readiness-label>${esc(qualityOn ? readiness : "Quality Review off")}</span></li>
            </ul>
            ${qualityOn ? `
              <div class="tk-quality-publish-gate">
                <div class="tk-quality-publish-gate-head">
                  <strong>AI Curriculum Quality Review</strong>
                  <button type="button" class="ghost-button" data-quality-run-publish ${state.qualityBusy ? "disabled" : ""}>${state.qualityBusy ? "Reviewing…" : "Run / refresh review"}</button>
                </div>
                <p class="muted-copy">Same blocker logic as Quality Review. Ready / Needs Review / Blocked. Nothing auto-publishes.</p>
                ${renderQualityReportBlock(report)}
                ${blocked ? `
                  <div class="tk-quality-override" data-publish-override>
                    <p class="muted-copy"><strong>Owner override</strong> — blocked lessons cannot publish normally. Override requires an explicit reason and is logged.</p>
                    <label>
                      <input type="checkbox" data-publish-override-confirm />
                      I understand this bypasses Ready/Blocked gates for this lesson only
                    </label>
                    <label>
                      Override reason (required)
                      <textarea data-publish-override-reason rows="2" placeholder="Why publish this incomplete kit now?"></textarea>
                    </label>
                  </div>
                ` : ""}
              </div>
            ` : ""}
          </div>
          <div class="form-actions tk-enrich-publish-actions">
            <button type="button" class="ghost-button" data-publish-cancel autofocus>Cancel</button>
            <button type="button" class="primary-button" data-publish-confirm ${blocked ? "data-requires-override=\"true\"" : ""}>${blocked ? "Publish with owner override" : "Publish updates to providers"}</button>
          </div>
        </div>
      </div>
    `;
  }

  function historyKindLabel(entry) {
    const kind = String(entry?.kind || "publish").toLowerCase();
    if (kind === "draft") return "Draft save backup";
    if (kind === "rollback") return "Rollback checkpoint";
    return "Publish backup";
  }

  function isDraftHistorySnapshot(entry) {
    const kind = String(entry?.kind || "").toLowerCase();
    const snap = entry?.snapshot;
    if (kind === "draft") return true;
    return Boolean(snap?.enrichmentDraft && !snap?.dailyPlans);
  }

  function flattenPublishedSnapshot(snap) {
    const out = {
      familyConnection: String(snap?.familyConnection || ""),
      activities: {},
    };
    const acts = Array.isArray(snap?.activities) ? snap.activities : [];
    acts.forEach((act) => {
      const key = act.itemId || act.id;
      if (!key) return;
      out.activities[key] = {
        teacherTips: Array.isArray(act.teacherTips) ? act.teacherTips.filter(Boolean) : [],
        setupImageUrl: act.setupImageUrl || "",
        exampleImageUrl: act.exampleImageUrl || "",
        observationOpportunities: act.observationOpportunities || "",
        vocabulary: act.vocabulary || "",
        substitutions: Array.isArray(act.substitutions) ? act.substitutions : [],
      };
    });
    WEEKDAYS.forEach((day) => {
      (snap?.dailyPlans?.[day]?.items || []).forEach((item) => {
        const key = item.itemId || item.id || item.title;
        if (!key) return;
        const tips = Array.isArray(item.teacherTips) ? item.teacherTips.filter(Boolean) : [];
        if (!out.activities[key]) {
          out.activities[key] = {
            teacherTips: tips,
            setupImageUrl: item.setupImageUrl || "",
            exampleImageUrl: item.exampleImageUrl || "",
            observationOpportunities: "",
            vocabulary: "",
            substitutions: [],
          };
        } else if (tips.length && !out.activities[key].teacherTips.length) {
          out.activities[key].teacherTips = tips;
        }
      });
    });
    return out;
  }

  function flattenDraftSnapshot(snap) {
    const draft = snap?.enrichmentDraft && typeof snap.enrichmentDraft === "object"
      ? snap.enrichmentDraft
      : (snap && typeof snap === "object" && snap.activities ? snap : {});
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    const acts = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    const out = {
      familyConnection: String(week.familyConnection || draft.familyConnection || ""),
      circleTimePrompt: String(week.circleTimePrompt || ""),
      materials: String(week.materials || ""),
      activities: {},
    };
    Object.keys(acts).forEach((key) => {
      const act = acts[key] || {};
      const tips = Array.isArray(act.teacherTips)
        ? act.teacherTips.filter(Boolean)
        : (act.teacherTip || act.setupTip ? [act.teacherTip || act.setupTip] : []);
      out.activities[key] = {
        teacherTips: tips.map(String),
        setupImageUrl: act.setupImageUrl || "",
        exampleImageUrl: act.exampleImageUrl || "",
        observationOpportunities: act.observationOpportunities || "",
        vocabulary: act.vocabulary || "",
        materials: Array.isArray(act.materials) ? act.materials.join(", ") : String(act.materials || ""),
        substitutions: Array.isArray(act.substitutions) ? act.substitutions : [],
      };
    });
    return out;
  }

  function flattenHistorySnapshot(entry) {
    if (!entry?.snapshot) return { familyConnection: "", activities: {} };
    return isDraftHistorySnapshot(entry)
      ? flattenDraftSnapshot(entry.snapshot)
      : flattenPublishedSnapshot(entry.snapshot);
  }

  function currentLiveFlatten(plan) {
    if (state.draft && (Object.keys(state.draft.activities || {}).length || state.draft.week)) {
      return flattenDraftSnapshot({ enrichmentDraft: state.draft });
    }
    return flattenPublishedSnapshot({
      dailyPlans: plan?.dailyPlans,
      familyConnection: plan?.familyConnection,
      activities: [],
    });
  }

  function diffFlattenedEnrichment(before, after) {
    const lines = [];
    const b = before || { familyConnection: "", activities: {} };
    const a = after || { familyConnection: "", activities: {} };
    if (String(b.familyConnection || "") !== String(a.familyConnection || "")) {
      lines.push(`Family: "${String(b.familyConnection || "").slice(0, 80)}" → "${String(a.familyConnection || "").slice(0, 80)}"`);
    }
    if (b.circleTimePrompt != null || a.circleTimePrompt != null) {
      if (String(b.circleTimePrompt || "") !== String(a.circleTimePrompt || "")) {
        lines.push(`Circle time: "${String(b.circleTimePrompt || "").slice(0, 80)}" → "${String(a.circleTimePrompt || "").slice(0, 80)}"`);
      }
    }
    const keys = new Set([...Object.keys(b.activities || {}), ...Object.keys(a.activities || {})]);
    keys.forEach((key) => {
      const left = b.activities[key] || {};
      const right = a.activities[key] || {};
      const tipL = (left.teacherTips || []).join(" | ");
      const tipR = (right.teacherTips || []).join(" | ");
      if (tipL !== tipR) {
        lines.push(`${key} tips: "${tipL.slice(0, 70)}" → "${tipR.slice(0, 70)}"`);
      }
      if (String(left.setupImageUrl || "") !== String(right.setupImageUrl || "")) {
        lines.push(`${key}: setup photo ${left.setupImageUrl ? "changed/removed" : "added"}`);
      }
      if (String(left.exampleImageUrl || "") !== String(right.exampleImageUrl || "")) {
        lines.push(`${key}: example photo ${left.exampleImageUrl ? "changed/removed" : "added"}`);
      }
      if (String(left.observationOpportunities || "") !== String(right.observationOpportunities || "")) {
        lines.push(`${key}: observations changed`);
      }
      if (String(left.vocabulary || "") !== String(right.vocabulary || "")) {
        lines.push(`${key}: vocabulary changed`);
      }
      if (String(left.materials || "") !== String(right.materials || "")) {
        lines.push(`${key}: materials "${String(left.materials || "").slice(0, 40)}" → "${String(right.materials || "").slice(0, 40)}"`);
      }
      const subL = JSON.stringify(left.substitutions || []);
      const subR = JSON.stringify(right.substitutions || []);
      if (subL !== subR) lines.push(`${key}: substitutions changed`);
    });
    if (!lines.length) lines.push("No field-level differences detected between these snapshots.");
    return lines;
  }

  function renderHistoryDiff(plan, history, entry, index) {
    if (state.historyDiffVersionId !== entry.versionId) return "";
    // Diff this backup against the next-newer state (previous list item, or current live).
    const newer = index === 0 ? null : history[index - 1];
    const olderFlat = flattenHistorySnapshot(entry);
    const newerFlat = newer ? flattenHistorySnapshot(newer) : currentLiveFlatten(plan);
    const label = newer
      ? `Changes from this version → ${historyKindLabel(newer)} (${newer.versionId})`
      : "Changes from this version → current editor / live state";
    const lines = diffFlattenedEnrichment(olderFlat, newerFlat);
    return `
      <div class="tk-enrich-history-diff" data-history-diff="${esc(entry.versionId)}">
        <p class="muted-copy"><strong>${esc(label)}</strong></p>
        <ul>${lines.slice(0, 40).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      </div>
    `;
  }

  function renderRecoveryModal(plan, activities) {
    if (!state.recoveryOpen) return "";
    const history = Array.isArray(plan.enrichmentPublishHistory) ? plan.enrichmentPublishHistory : [];
    const draftActs = state.draft?.activities && typeof state.draft.activities === "object" ? state.draft.activities : {};
    const draftKeys = Object.keys(draftActs);
    const publishedTips = [];
    WEEKDAYS.forEach((day) => {
      (plan.dailyPlans?.[day]?.items || []).forEach((item) => {
        const tips = Array.isArray(item.teacherTips) ? item.teacherTips.filter(Boolean) : [];
        if (tips.length) publishedTips.push({ key: item.itemId || item.title, tips });
      });
    });
    const restorePublishCount = history.filter((entry) => entry.snapshot && !isDraftHistorySnapshot(entry)).length;
    return `
      <div class="tk-enrich-modal" data-recovery-modal role="dialog" aria-modal="true" aria-labelledby="tk-enrich-recovery-title">
        <button type="button" class="tk-enrich-modal-backdrop" data-recovery-close aria-label="Close recovery"></button>
        <div class="tk-enrich-modal-card tk-enrich-recovery-card" tabindex="-1">
          <div class="tk-enrich-publish-scroll">
            <h3 id="tk-enrich-recovery-title">Version history & recovery</h3>
            <p class="muted-copy">Automatic backups before draft saves and publishes. Restore any retained version for <strong>this lesson only</strong>. Restores load into a draft — providers are unchanged until you Publish. Discard Draft never deletes published content.</p>

            <section class="tk-enrich-recovery-section" data-recovery-history>
              <h4>Version History (${history.length} retained)</h4>
              ${history.length ? `
                <ul class="tk-enrich-history-list">
                  ${history.map((entry, index) => {
                    const draftSnap = isDraftHistorySnapshot(entry);
                    const restoreLabel = draftSnap ? "Restore This Draft" : "Restore This Version";
                    return `
                    <li>
                      <strong>${esc(historyKindLabel(entry))}</strong>
                      <code>${esc(entry.versionId || `v${index + 1}`)}</code>
                      <span class="muted-copy">${esc(entry.publishedAt || "")}${entry.publishedBy ? ` · ${esc(entry.publishedBy)}` : ""}${entry.rollbackOf ? ` · of ${esc(entry.rollbackOf)}` : ""}</span>
                      <div class="form-actions">
                        ${entry.snapshot ? `<button type="button" class="ghost-button" data-enrich-restore-version="${esc(entry.versionId)}" data-restore-kind="${draftSnap ? "draft" : "publish"}">${restoreLabel}</button>` : ""}
                        <button type="button" class="ghost-button" data-enrich-history-diff="${esc(entry.versionId)}">${state.historyDiffVersionId === entry.versionId ? "Hide changes" : "Show exact changes"}</button>
                      </div>
                      ${renderHistoryDiff(plan, history, entry, index)}
                    </li>
                  `;
                  }).join("")}
                </ul>
              ` : `<p class="muted-copy">No version snapshots yet. Save a draft or publish to create the first backup.</p>`}
            </section>

            <section class="tk-enrich-recovery-section" data-recovery-compare>
              <h4>Compare Draft vs Published</h4>
              <button type="button" class="ghost-button" data-enrich-compare-toggle>${state.compareOpen ? "Hide compare" : "Show compare"}</button>
              ${state.compareOpen ? `
                <div class="tk-enrich-compare-grid">
                  <div>
                    <strong>Draft tips (${draftKeys.length} activities)</strong>
                    <ul>${draftKeys.slice(0, 12).map((key) => {
                      const tips = Array.isArray(draftActs[key]?.teacherTips)
                        ? draftActs[key].teacherTips.filter(Boolean)
                        : [];
                      const tip = tips[0]
                        || draftActs[key]?.teacherTip
                        || draftActs[key]?.setupTip
                        || "";
                      return `<li><code>${esc(key)}</code>: ${esc(String(tip).slice(0, 140) || "(empty)")}</li>`;
                    }).join("") || "<li class='muted-copy'>No draft activity tips yet.</li>"}</ul>
                    <p class="muted-copy">Family: ${esc(String(state.draft?.week?.familyConnection || "").slice(0, 160) || "(none)")}</p>
                  </div>
                  <div>
                    <strong>Published tips (${publishedTips.length})</strong>
                    <ul>${publishedTips.slice(0, 12).map((row) => `
                      <li><code>${esc(row.key || "")}</code>: ${esc(String(row.tips[0] || "").slice(0, 140))}</li>
                    `).join("") || "<li class='muted-copy'>No published teacher tips on daily items yet.</li>"}</ul>
                    <p class="muted-copy">Family: ${esc(String(plan.familyConnection || "").slice(0, 160) || "(none)")}</p>
                  </div>
                </div>
              ` : ""}
            </section>

            <section class="tk-enrich-recovery-section" data-recovery-compare-publish>
              <h4>Compare Published vs Previous Version</h4>
              ${(() => {
                const publishEntries = history.filter((entry) => entry.snapshot && !isDraftHistorySnapshot(entry));
                if (publishEntries.length < 1) {
                  return `<p class="muted-copy">No publish backups yet — publish once to create a previous-version comparison.</p>`;
                }
                const currentPub = {
                  familyConnection: plan.familyConnection || "",
                  activities: {},
                };
                publishedTips.forEach((row) => {
                  currentPub.activities[row.key] = { teacherTips: row.tips };
                });
                const previous = flattenHistorySnapshot(publishEntries[0]);
                const lines = diffFlattenedEnrichment(previous, currentPub);
                return `
                  <p class="muted-copy">Current published kit vs backup <code>${esc(publishEntries[0].versionId)}</code> (${esc(publishEntries[0].publishedAt || "")}${publishEntries[0].publishedBy ? ` · ${esc(publishEntries[0].publishedBy)}` : ""}).</p>
                  <ul>${lines.slice(0, 30).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
                `;
              })()}
            </section>

            <section class="tk-enrich-recovery-section">
              <h4>Discard Draft</h4>
              <p class="muted-copy">Clears the enrichment draft for this lesson only. Published content stays unchanged. You can undo once if you discard by mistake.</p>
              <div class="form-actions">
                <button type="button" class="ghost-button" data-enrich-discard-draft ${draftKeys.length || state.draft?.week?.familyConnection ? "" : "disabled"}>Discard Draft</button>
                <button type="button" class="ghost-button" data-enrich-undo-discard ${plan?.enrichmentDraftUndo?.draft ? "" : "disabled"}>Undo Discard</button>
              </div>
            </section>

            <section class="tk-enrich-recovery-section">
              <h4>Rollback Last Publish / Restore Previous Version</h4>
              <p class="muted-copy">Loads the most recent publish backup into a <strong>new draft</strong> for this lesson (${restorePublishCount} publish snapshot(s) available). Providers keep the current published kit until you Publish. Cancel or press Escape to close without changes.</p>
              <button type="button" class="ghost-button" data-enrich-rollback ${restorePublishCount ? "" : "disabled"}>Rollback Last Publish</button>
            </section>
          </div>
          <div class="form-actions tk-enrich-publish-actions">
            <button type="button" class="ghost-button" data-recovery-close autofocus>Close</button>
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
    const summary = api().buildUpgradeSummary(plan, activities, state.draft);
    const premium = summary.premiumReadinessPercent ?? percent;
    const workflow = summary.canonicalStatus?.workflow || summary.dashboardStage
      || api().completenessLabelFromPercent(percent, null);
    percentEl.textContent = `Completion ${percent}%`;
    const readinessEl = chrome.querySelector("[data-premium-readiness-chrome]");
    if (readinessEl) readinessEl.textContent = `Readiness ${premium}%`;
    const bar = chrome.querySelector(".tk-enrich-bar i");
    if (bar) bar.style.width = `${premium}%`;
    const tag = chrome.querySelector(".tk-enrich-percent-row .tag");
    if (tag) tag.textContent = workflow;
    const summaryPct = document.querySelector("[data-upgrade-summary] .tk-enrich-bar i");
    if (summaryPct) summaryPct.style.width = `${premium}%`;
  }

  /**
   * Capture scroll / focus / caret so list add-remove remounts do not jump the page
   * or steal the caret. Never force scroll-to-top.
   */
  function captureEditorUi() {
    const el = host();
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const within = Boolean(el && active && typeof el.contains === "function" && el.contains(active));
    let focusSelector = "";
    let selectionStart = null;
    let selectionEnd = null;
    if (within && active) {
      const attrs = [
        "data-image-brief-setup",
        "data-image-brief-example",
        "data-week-family",
        "data-week-overview",
        "data-week-objectives",
        "data-week-materials",
        "data-week-teacher-prep",
        "data-week-toolkit-prep",
        "data-week-toolkit-focus",
        "data-assistant-improve-text",
        "data-enrich-jump-input",
      ];
      for (let i = 0; i < attrs.length; i += 1) {
        if (active.hasAttribute?.(attrs[i])) {
          focusSelector = `[${attrs[i]}]`;
          break;
        }
      }
      if (!focusSelector && active.closest?.("[data-tip-add]")) focusSelector = "[data-tip-add] input";
      else if (!focusSelector && active.closest?.("[data-vocab-add]")) focusSelector = "[data-vocab-add] input";
      else if (!focusSelector && active.closest?.("[data-obs-add]")) focusSelector = "[data-obs-add] input";
      else if (!focusSelector && active.closest?.("[data-sub-add]")) {
        const name = active.getAttribute?.("name");
        focusSelector = name ? `[data-sub-add] [name="${name}"]` : "[data-sub-add] input";
      } else if (!focusSelector && active.id) {
        focusSelector = `#${CSS.escape ? CSS.escape(active.id) : active.id}`;
      }
      if (typeof active.selectionStart === "number") {
        selectionStart = active.selectionStart;
        selectionEnd = active.selectionEnd;
      }
    }
    return {
      hostScrollTop: el?.scrollTop || 0,
      shellScrollTop: el?.querySelector?.(".tk-enrich-shell")?.scrollTop || 0,
      mainScrollTop: el?.querySelector?.(".tk-enrich-main")?.scrollTop || 0,
      bodyScrollTop: el?.querySelector?.(".tk-enrich-body")?.scrollTop || 0,
      stageScrollTop: el?.querySelector?.(".tk-enrich-stage")?.scrollTop || 0,
      windowScrollX: typeof window !== "undefined" ? (window.scrollX || 0) : 0,
      windowScrollY: typeof window !== "undefined" ? (window.scrollY || 0) : 0,
      focusSelector,
      selectionStart,
      selectionEnd,
      activityIndex: state.activityIndex,
      mode: state.mode,
    };
  }

  function restoreEditorUi(snap) {
    if (!snap) return;
    if (typeof snap.activityIndex === "number") state.activityIndex = snap.activityIndex;
    if (snap.mode) state.mode = snap.mode;
    const el = host();
    const applyScroll = (node, value) => {
      if (node && typeof value === "number") node.scrollTop = value;
    };
    applyScroll(el, snap.hostScrollTop);
    applyScroll(el?.querySelector?.(".tk-enrich-shell"), snap.shellScrollTop);
    applyScroll(el?.querySelector?.(".tk-enrich-main"), snap.mainScrollTop);
    applyScroll(el?.querySelector?.(".tk-enrich-body"), snap.bodyScrollTop);
    applyScroll(el?.querySelector?.(".tk-enrich-stage"), snap.stageScrollTop);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo(snap.windowScrollX || 0, snap.windowScrollY || 0);
    }
    if (!snap.focusSelector) return;
    const node = el?.querySelector?.(snap.focusSelector);
    if (!node) return;
    try {
      node.focus({ preventScroll: true });
    } catch (_error) {
      try { node.focus(); } catch (_inner) { /* ignore */ }
    }
    if (
      typeof snap.selectionStart === "number"
      && typeof snap.selectionEnd === "number"
      && typeof node.setSelectionRange === "function"
    ) {
      try { node.setSelectionRange(snap.selectionStart, snap.selectionEnd); } catch (_error) { /* ignore */ }
    }
  }

  function renderPreservingUi() {
    const snap = captureEditorUi();
    render();
    // Restore on next frames so layout can settle without jumping to top.
    restoreEditorUi(snap);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => restoreEditorUi(snap));
    }
  }

  function navigateToEnrichmentTarget(target) {
    const raw = String(target || "").trim();
    if (!raw) return;
    const plan = getPlan();
    const activities = getActivities(plan);
    if (/^week:/i.test(raw) || /books|songs|printables|toolkit|family|vocabulary|objectives|materials|weekly_plan/i.test(raw)) {
      state.mode = "week";
      render();
      const section = raw.replace(/^week:/i, "").toLowerCase();
      const node = document.querySelector(`[data-week-section="${section}"], [data-enrich-week-${section}], [name*="${section}"], #tk-week-${section}`);
      node?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    if (/activities|images|setup|example/i.test(raw)) {
      state.mode = "activities";
      const draftActs = state.draft.activities || {};
      const targetIdx = activities.findIndex((a) => {
        const view = api().activityEnrichmentView(a, draftActs[draftKey(a)]);
        return !view.setupImageUrl || !view.exampleImageUrl;
      });
      if (targetIdx >= 0) state.activityIndex = targetIdx;
      render();
      document.querySelector("[data-enrich-setup-image], [data-enrich-example-image], [data-activity-images]")
        ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    state.mode = "activities";
    render();
  }

  function focusActiveDialog() {
    const dialog = document.querySelector(
      "[data-ai-tray] .tk-enrich-modal-card, [data-publish-modal] .tk-enrich-modal-card, [data-recovery-modal] .tk-enrich-modal-card, [data-lightbox]",
    );
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
          <div class="tk-enrich-body">
            ${renderLessonAnalysisPanel(plan, activities)}
            ${renderAssistantPanel(plan)}
            ${body}
          </div>
        </div>
        ${renderPublishModal(plan, activities)}
        ${renderRecoveryModal(plan, activities)}
        ${renderAiTray()}
        ${renderLightbox()}
      </div>
    `;
    if (state.jumpOpen) renderJumpResults(plan, activities);
    requestAnimationFrame(() => {
      paintLivePreview(plan, activities);
      hydrateDraftMediaImages(el);
    });
    if (state.aiTray.open || state.publishOpen || state.recoveryOpen || state.lightboxUrl) {
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
      if (event.target.closest("[data-enrich-exit]") || event.target.closest("[data-enrich-close]")) {
        void close();
        return;
      }
      if (event.target.closest("[data-enrich-cancel]")) {
        void close({ abandonUnsaved: true });
        return;
      }
      if (event.target.closest("[data-enrich-recovery]")) {
        const openCompare = Boolean(event.target.closest("[data-enrich-open-compare]"));
        state.recoveryOpen = true;
        state.compareOpen = openCompare;
        state.historyDiffVersionId = "";
        render();
        const focusSel = openCompare ? "[data-enrich-compare-toggle]" : "[data-enrich-open-history]";
        document.querySelector(focusSel)?.focus?.();
        return;
      }
      if (event.target.closest("[data-recovery-close]")) {
        state.recoveryOpen = false;
        state.compareOpen = false;
        state.historyDiffVersionId = "";
        render();
        document.querySelector("[data-enrich-recovery]")?.focus?.();
        return;
      }
      if (event.target.closest("[data-enrich-compare-toggle]")) {
        state.compareOpen = !state.compareOpen;
        render();
        return;
      }
      if (event.target.closest("[data-enrich-history-diff]")) {
        const btn = event.target.closest("[data-enrich-history-diff]");
        const versionId = String(btn?.getAttribute("data-enrich-history-diff") || "").trim();
        state.historyDiffVersionId = state.historyDiffVersionId === versionId ? "" : versionId;
        render();
        return;
      }
      if (event.target.closest("[data-enrich-undo-discard]")) {
        const plan = getPlan();
        if (!plan?.id || !plan?.enrichmentDraftUndo?.draft) return;
        try {
          const token = adminToken();
          const endpoint = root.curriculumLessonPlanConfig?.endpoint || "/api/admin/curriculum/lesson-plans";
          const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
            ? curriculumExpectedUpdatedAt()
            : "";
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              saveMode: "enrichment_draft",
              expectedUpdatedAt,
              restoreDiscardedDraft: true,
              lessonPlan: { id: plan.id },
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
          if (data.curriculum && typeof applyCurriculumState === "function") {
            applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
          }
          state.dirty = false;
          state.recoveryOpen = false;
          state.compareOpen = false;
          open(plan.id);
          state.statusText = "Discard undone — previous draft restored.";
        } catch (error) {
          state.statusText = `Undo discard failed: ${error.message || error}`;
          render();
        }
        return;
      }
      if (event.target.closest("[data-enrich-discard-draft]")) {
        const plan = getPlan();
        if (!plan?.id) return;
        if (!window.confirm("Discard the saved enrichment draft for this lesson? Published content stays unchanged. You can Undo Discard once afterward.")) {
          return;
        }
        try {
          const token = adminToken();
          const endpoint = root.curriculumLessonPlanConfig?.endpoint || "/api/admin/curriculum/lesson-plans";
          const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
            ? curriculumExpectedUpdatedAt()
            : "";
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              saveMode: "enrichment_draft",
              expectedUpdatedAt,
              allowEmptyDraftOverwrite: true,
              lessonPlan: {
                id: plan.id,
                enrichmentDraft: {
                  activities: {},
                  week: {},
                  completionPercent: 0,
                  previewReady: false,
                  lastEditedBy: state.draft?.lastEditedBy || "",
                },
              },
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
          if (data.curriculum && typeof applyCurriculumState === "function") {
            applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
          }
          state.dirty = false;
          state.recoveryOpen = false;
          state.compareOpen = false;
          open(plan.id);
          state.statusText = "Saved draft discarded. Published Teaching Kit unchanged.";
        } catch (error) {
          state.statusText = `Discard draft failed: ${error.message || error}`;
          render();
        }
        return;
      }
      if (event.target.closest("[data-enrich-restore-version]")) {
        const btn = event.target.closest("[data-enrich-restore-version]");
        const versionId = String(btn?.getAttribute("data-enrich-restore-version") || "").trim();
        const restoreKind = String(btn?.getAttribute("data-restore-kind") || "publish").trim();
        const plan = getPlan();
        if (!plan?.id || !versionId) return;
        const confirmMsg = restoreKind === "draft"
          ? `Restore draft backup ${versionId} into the editor for this lesson only?\n\nYour current draft will be replaced.\nPublished provider content stays unchanged.`
          : `Restore publish backup ${versionId} into a NEW DRAFT for this lesson only?\n\nProviders keep seeing the current published kit until you Publish.\nYour current draft will be replaced.`;
        if (!window.confirm(confirmMsg)) {
          return;
        }
        try {
          const token = adminToken();
          const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
            ? curriculumExpectedUpdatedAt()
            : "";
          const response = await fetch("/api/admin/curriculum/enrichment-rollback", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              planId: plan.id,
              versionId,
              expectedUpdatedAt,
              publishedBy: state.draft.lastEditedBy || "",
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.status === 409) {
            window.alert("Another admin edited curriculum while you were working. Reloading this lesson — retry restore after review.");
            if (data.curriculum && typeof applyCurriculumState === "function") {
              applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
            }
            open(plan.id);
            state.statusText = "Concurrent edit detected on restore. Reloaded lesson.";
            return;
          }
          if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
          if (data.curriculum && typeof applyCurriculumState === "function") {
            applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
          }
          state.recoveryOpen = false;
          state.compareOpen = false;
          state.historyDiffVersionId = "";
          open(plan.id);
          state.statusText = data.restoredIntoDraft || data.customerVisibleUnchanged
            ? `Restored version ${versionId} into draft. Providers unchanged until Publish.`
            : (data.restoredDraft
              ? `Restored draft version ${versionId}.`
              : `Restored version ${versionId}.`);
        } catch (error) {
          state.statusText = `Restore failed: ${error.message || error}`;
          render();
        }
        return;
      }
      if (event.target.closest("[data-summary-toggle]")) {
        state.summaryOpen = !state.summaryOpen;
        render();
        return;
      }
      const blockerNav = event.target.closest("[data-blocker-navigate]");
      if (blockerNav) {
        navigateToEnrichmentTarget(blockerNav.getAttribute("data-blocker-navigate") || "");
        return;
      }
      const summaryJump = event.target.closest("[data-summary-jump]");
      if (summaryJump) {
        const jump = summaryJump.getAttribute("data-summary-jump");
        const plan = getPlan();
        const activities = getActivities(plan);
        const weekJumps = new Set(["family", "printables", "books", "songs", "vocabulary", "objectives", "materials", "toolkit", "briefs"]);
        if (weekJumps.has(jump) && jump !== "briefs") {
          state.mode = "week";
        } else {
          state.mode = "activities";
          const draftActs = state.draft.activities || {};
          let target = -1;
          if (jump === "setup" || jump === "briefs") {
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
      const scrollTarget = event.target.closest("[data-enrich-scroll-target]");
      if (scrollTarget) {
        const key = scrollTarget.getAttribute("data-enrich-scroll-target") || "";
        const node = key === "history"
          ? document.querySelector("[data-enrich-recovery-toolbar]")
          : (document.querySelector("[data-quality-report]")
            || document.querySelector("[data-quality-run-publish]")
            || document.querySelector("[data-assistant-panel='quality']"));
        if (node?.scrollIntoView) {
          node.scrollIntoView({ behavior: "smooth", block: "start" });
          (node.querySelector?.("button") || node)?.focus?.();
        } else if (key === "quality") {
          state.mode = "week";
          render();
        } else if (key === "history") {
          document.querySelector("[data-enrich-open-history]")?.click?.();
        }
        return;
      }
      if (event.target.closest("[data-enrich-publish]")) {
        state.publishOpen = true;
        render();
        if (isQualityReviewFlagEnabled()) {
          state.qualityBusy = true;
          render();
          try {
            await runSpecialistQualityReview({ force: true });
          } finally {
            state.qualityBusy = false;
            render();
          }
        }
        return;
      }
      if (event.target.closest("[data-quality-run-publish]")) {
        state.qualityBusy = true;
        render();
        try {
          await runSpecialistQualityReview({ force: true });
          state.statusText = state.qualityReport
            ? `Quality Review ${state.qualityReport.overallScore}% · ${state.qualityReport.overallLabel}`
            : "Quality Review finished.";
        } finally {
          state.qualityBusy = false;
          render();
        }
        return;
      }
      const ignoreBtn = event.target.closest("[data-quality-ignore]");
      if (ignoreBtn) {
        const code = ignoreBtn.getAttribute("data-quality-code") || "";
        const id = ignoreBtn.getAttribute("data-quality-ignore") || "";
        if (!state.draft.week) state.draft.week = {};
        const ignored = new Set(ignoredQualityCodes());
        if (code) ignored.add(code);
        state.draft.week.qualityReviewIgnored = [...ignored].slice(0, 80);
        markDirty({ autosave: false });
        const apiQr = qualityReviewApi();
        if (apiQr?.applyIssueDecision && state.qualityReport) {
          state.qualityReport = apiQr.applyIssueDecision(state.qualityReport, {
            findingId: id,
            code,
            decision: "ignore",
          });
        } else {
          await runSpecialistQualityReview({ force: true });
        }
        state.statusText = `Ignored issue${code ? ` (${code})` : ""}. Draft updated — not published.`;
        render();
        return;
      }
      const qualityImproveBtn = event.target.closest("[data-quality-improve]");
      if (qualityImproveBtn) {
        const findingId = qualityImproveBtn.getAttribute("data-quality-improve") || "";
        const finding = (state.qualityReport?.findings || []).find((f) => f.id === findingId);
        if (!finding) return;
        const token = adminToken();
        if (!token) {
          state.statusText = "Admin unlock required for Improve with AI.";
          render();
          return;
        }
        state.qualityBusy = true;
        render();
        try {
          const response = await fetch("/api/admin/curriculum/quality-review", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              adminToken: token,
              action: "improve_issue",
              planId: state.planId,
              finding,
              enrichmentDraft: state.draft,
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            state.statusText = data.error || "Improve with AI failed.";
          } else {
            await presentAssistantSuggestions(data.suggestions || [], {
              note: "Quality improvement draft ready — accept to apply. Not published.",
            });
            return;
          }
        } finally {
          state.qualityBusy = false;
          render();
        }
        return;
      }
      const editManual = event.target.closest("[data-quality-edit-manual]");
      if (editManual) {
        state.publishOpen = false;
        const section = editManual.getAttribute("data-quality-edit-manual") || "";
        if (section === "family" || section === "objectives" || section === "teacher_prep" || section === "toolkit" || section === "vocabulary") {
          state.mode = "week";
        } else {
          state.mode = "activities";
        }
        state.statusText = `Edit manually: open the ${section.replace(/_/g, " ")} section, then re-run Quality Review before publish.`;
        render();
        return;
      }
      if (event.target.closest("[data-enrich-next-lesson]")) {
        const current = getPlan();
        const workspace = root.LLHTeachingKitUpgradeWorkspace;
        const allPlans = typeof curriculumLessonPlansForAdmin === "function"
          ? curriculumLessonPlansForAdmin()
          : [];
        const metaFor = (plan) => {
          const enrich = api();
          const acts = typeof curriculumActivitiesForLesson === "function"
            ? curriculumActivitiesForLesson(plan.id)
            : [];
          const summary = enrich.buildUpgradeSummary(plan, acts, plan.enrichmentDraft || null);
          return { percent: summary.completionPercent, summary };
        };
        const next = workspace?.nextLessonInQueue
          ? workspace.nextLessonInQueue(allPlans, current?.id, metaFor)
          : allPlans.find((plan) => plan.id !== current?.id) || null;
        if (!next) {
          state.statusText = "No next lesson in the upgrade queue.";
          renderChromeOnly();
          return;
        }
        if (state.dirty) {
          const saved = await saveDraft({ silent: true });
          if (!saved) {
            state.statusText = "Save the current draft before moving to the next lesson.";
            renderChromeOnly();
            return;
          }
        }
        open(next.id);
        state.statusText = `Opened next lesson: ${next.title || next.id}`;
        return;
      }
      if (event.target.closest("[data-enrich-rollback]")) {
        const plan = getPlan();
        if (!plan?.id) return;
        if (!window.confirm(
          "Rollback Last Publish for this lesson only?\n\n"
          + "This loads the previous publish backup into a NEW DRAFT.\n"
          + "Providers keep the current published kit until you Publish.\n"
          + "Your current draft will be replaced.",
        )) {
          return;
        }
        try {
          const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
          const expectedUpdatedAt = typeof curriculumExpectedUpdatedAt === "function"
            ? curriculumExpectedUpdatedAt()
            : "";
          const response = await fetch("/api/admin/curriculum/enrichment-rollback", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              planId: plan.id,
              expectedUpdatedAt,
              publishedBy: state.draft.lastEditedBy || "",
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.status === 409) {
            window.alert("Another admin edited curriculum while you were working. Reloading this lesson — retry rollback after review.");
            if (data.curriculum && typeof applyCurriculumState === "function") {
              applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
            }
            open(plan.id);
            state.statusText = "Concurrent edit detected on rollback. Reloaded lesson.";
            return;
          }
          if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
          if (data.curriculum && typeof applyCurriculumState === "function") {
            applyCurriculumState(data.curriculum, { siteContentUpdatedAt: data.siteContentUpdatedAt });
          }
          open(plan.id);
          state.statusText = `Rolled back into draft${data.restoredFromVersionId ? ` (${data.restoredFromVersionId})` : ""}. Providers unchanged until Publish.`;
          if (typeof showActionFeedback === "function") {
            showActionFeedback("Previous publish loaded into draft. Review, then Publish if you want providers to see it.");
          }
        } catch (error) {
          state.statusText = `Rollback failed: ${error.message || error}`;
          render();
        }
        return;
      }
      if (event.target.closest("[data-publish-cancel]")) {
        state.publishOpen = false;
        render();
        document.querySelector("[data-enrich-publish]")?.focus?.();
        return;
      }
      if (event.target.closest("[data-publish-confirm]")) {
        let ownerOverride = null;
        if (isQualityReviewFlagEnabled()) {
          const report = state.qualityReport || await runSpecialistQualityReview({ force: true });
          if (report?.blocksPublish) {
            const confirmed = document.querySelector("[data-publish-override-confirm]")?.checked;
            const reason = String(document.querySelector("[data-publish-override-reason]")?.value || "").trim();
            if (!confirmed || reason.length < 8) {
              state.statusText = "Publish blocked (" + (report.publishReadinessLabel || "Blocked")
                + "). Resolve issues, or confirm owner override with a reason (8+ characters).";
              render();
              return;
            }
            ownerOverride = { confirmed: true, reason };
          }
        }
        try {
          await publishEnrichment({ ownerOverride });
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
        renderPreservingUi();
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
        renderPreservingUi();
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
        renderPreservingUi();
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
        renderPreservingUi();
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
        renderPreservingUi();
        return;
      }
      if (event.target.closest("[data-analysis-toggle]")) {
        state.analysisOpen = !state.analysisOpen;
        render();
        return;
      }
      const assistantTab = event.target.closest("[data-assistant-tab]");
      if (assistantTab) {
        state.assistant.tab = assistantTab.getAttribute("data-assistant-tab") || "improve";
        render();
        return;
      }
      const improveBtn = event.target.closest("[data-assistant-improve]");
      if (improveBtn) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        const key = act ? draftKey(act) : "";
        const field = state.assistant.improveField || "weeklyOverview";
        let currentValue = String(state.assistant.improveText || "").trim();
        let fieldLabel = "Custom text";
        let activityKey = "";
        if (field === "weeklyOverview") {
          currentValue = currentValue || state.draft.week?.weeklyOverview || plan?.weeklyOverview || "";
          fieldLabel = "Weekly overview";
        } else if (field === "familyConnection") {
          currentValue = currentValue || state.draft.week?.familyConnection || plan?.familyConnection || "";
          fieldLabel = "Family connection";
        } else if (field === "teacherPreparation") {
          currentValue = currentValue
            || state.draft.week?.teacherPreparation
            || state.draft.week?.teacherToolkit?.teacherPreparation
            || "";
          fieldLabel = "Teacher preparation";
        } else if (field === "teacherTips") {
          const tips = state.draft.activities?.[key]?.teacherTips;
          currentValue = currentValue || (Array.isArray(tips) ? tips[0] : "") || "";
          fieldLabel = "Teacher tips";
          activityKey = key;
        } else if (field === "observationPrompts") {
          const obs = state.draft.activities?.[key]?.observationPrompts;
          currentValue = currentValue || (Array.isArray(obs) ? obs[0] : "") || "";
          fieldLabel = "Observations";
          activityKey = key;
        }
        const data = await callTeacherAssistant({
          action: "make_better",
          improveAction: improveBtn.getAttribute("data-assistant-improve"),
          currentValue,
          field: field === "custom" ? "teacherTips" : field,
          fieldLabel,
          activityKey,
        });
        if (data) await presentAssistantSuggestions(data.suggestions, { note: "Make This Better draft ready — accept to apply." });
        return;
      }
      if (event.target.closest("[data-assistant-chat-send]")) {
        const message = state.assistant.chatInput || "";
        if (!message.trim()) return;
        state.assistant.chatLog = [
          ...(state.assistant.chatLog || []),
          { role: "teacher", text: message },
        ];
        const act = getActivities(getPlan())[state.activityIndex];
        const data = await callTeacherAssistant({
          action: "teacher_chat",
          message,
          activityKey: act ? draftKey(act) : "",
          currentValue: "",
        });
        if (data) {
          state.assistant.chatLog.push({ role: "ai", text: data.reply || "" });
          state.assistant.chatInput = "";
          await presentAssistantSuggestions(data.suggestions, { note: "Teacher chat draft ready — accept to apply." });
        } else {
          render();
        }
        return;
      }
      const toolkitBtn = event.target.closest("[data-assistant-toolkit]");
      if (toolkitBtn) {
        const act = getActivities(getPlan())[state.activityIndex];
        const data = await callTeacherAssistant({
          action: "toolkit_builder",
          builderId: toolkitBtn.getAttribute("data-assistant-toolkit"),
          activityKey: act ? draftKey(act) : "",
        });
        if (data) {
          await presentAssistantSuggestions(data.suggestions, {
            note: data.suggestions?.[0]?.reuseRecommended
              ? "Reusable library match preferred — review before accepting."
              : "Toolkit builder draft ready.",
          });
        }
        return;
      }
      if (event.target.closest("[data-assistant-printable-pack]")) {
        const data = await callTeacherAssistant({ action: "printable_pack" });
        if (data) {
          if (Array.isArray(data.printablePack) && data.printablePack.length) {
            if (!state.draft.week) state.draft.week = {};
            state.draft.week.printablePacks = [
              ...(Array.isArray(state.draft.week.printablePacks) ? state.draft.week.printablePacks : []),
              {
                id: `pack-${Date.now().toString(36)}`,
                cards: data.printablePack,
                createdAt: new Date().toISOString(),
              },
            ].slice(0, 20);
            markDirty({ autosave: false });
          }
          await presentAssistantSuggestions(data.suggestions, { note: "Printable pack drafted (editable) — not published." });
        }
        return;
      }
      const imageBtn = event.target.closest("[data-assistant-image]");
      if (imageBtn) {
        const act = getActivities(getPlan())[state.activityIndex];
        const data = await callTeacherAssistant({
          action: "example_image",
          imageKind: imageBtn.getAttribute("data-assistant-image"),
          activityKey: act ? draftKey(act) : "",
        });
        if (data) {
          state.assistant.lastImagePreview = data.exampleImage?.previewDataUrl || "";
          await presentAssistantSuggestions(data.suggestions, {
            note: "Example image draft created — approval required before publish.",
          });
        }
        return;
      }
      if (event.target.closest("[data-assistant-quality-run]")) {
        const data = await callTeacherAssistant({ action: "quality_review" });
        if (data) {
          state.assistant.quality = data.review || null;
          state.assistant.connections = data.connections || [];
          state.assistant.status = data.review
            ? `Readiness ${data.review.readinessScore}% · ${data.review.readinessLabel}`
            : "Quality review finished.";
          render();
        }
        return;
      }
      if (event.target.closest("[data-assistant-refresh-connections]")) {
        const data = await callTeacherAssistant({ action: "connections" });
        if (data) {
          state.assistant.connections = data.connections || [];
          state.assistant.recommendations = data.recommendations || [];
          state.assistant.status = `${(data.connections || []).length} connection(s), ${(data.recommendations || []).length} reusable recommendation(s).`;
          render();
        }
        return;
      }
      if (event.target.closest("[data-assistant-save-reusable]")) {
        const act = getActivities(getPlan())[state.activityIndex];
        const key = act ? draftKey(act) : "";
        const tip = (state.draft.activities?.[key]?.teacherTips || [])[0]
          || state.draft.week?.familyConnection
          || state.assistant.improveText
          || "";
        const data = await callTeacherAssistant({
          action: "save_reusable",
          item: {
            type: "teacher_tip",
            title: act?.title ? `${act.title} tip` : "Teacher tip",
            body: tip || "Reusable classroom tip",
            theme: getPlan()?.theme || "",
            age: getPlan()?.age || "",
            sourcePlanId: state.planId,
          },
        });
        if (data?.duplicate) {
          state.assistant.status = data.message || "Similar reusable item already exists.";
        } else if (data?.saved) {
          state.assistant.status = `Saved reusable “${data.saved.title}”. Old lessons unchanged.`;
        }
        render();
        return;
      }
      if (event.target.closest("[data-ai-suggest]")) {
        const scopeBtn = event.target.closest("[data-ai-suggest]");
        if (scopeBtn.disabled || scopeBtn.getAttribute("aria-busy") === "true") return;
        const raw = String(scopeBtn.getAttribute("data-ai-suggest") || "activity");
        const scope = raw === "week" || raw === "lesson" ? raw : "activity";
        scopeBtn.setAttribute("aria-busy", "true");
        try {
          await requestAiSuggestions({ scope });
        } finally {
          scopeBtn.removeAttribute("aria-busy");
        }
        return;
      }
      if (event.target.closest("[data-ai-cancel]")) {
        cancelAiSuggestions();
        return;
      }
      if (event.target.closest("[data-ai-retry]")) {
        const scope = state.aiTray.scope || "activity";
        // Retry is an explicit owner action after a failed/canceled run — no second confirm.
        await requestAiSuggestions({ scope, skipConfirm: true });
        return;
      }
      if (event.target.closest("[data-ai-discard-all]") || event.target.closest("[data-ai-reject-all]")) {
        state.aiTray.suggestions = state.aiTray.suggestions.map((s) => ({ ...s, decision: "discarded", selected: false }));
        state.statusText = "Rejected all AI suggestions. Draft and published content unchanged.";
        resetAiTray();
        render();
        return;
      }
      if (event.target.closest("[data-ai-accept-all]")) {
        await insertSelectedAiSuggestions({ acceptAll: true, closeTray: true });
        return;
      }
      const acceptSection = event.target.closest("[data-ai-accept-section]");
      if (acceptSection) {
        await insertSelectedAiSuggestions({
          sectionId: acceptSection.getAttribute("data-ai-accept-section") || "",
          closeTray: false,
        });
        return;
      }
      const acceptActivity = event.target.closest("[data-ai-accept-activity]");
      if (acceptActivity) {
        await insertSelectedAiSuggestions({
          activityKeyFilter: acceptActivity.getAttribute("data-ai-accept-activity") || "",
          closeTray: false,
        });
        return;
      }
      if (event.target.closest("[data-ai-insert-selected]")) {
        await insertSelectedAiSuggestions({ closeTray: false });
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
      if (event.target.matches("[data-assistant-improve-field]")) {
        state.assistant.improveField = String(event.target.value || "weeklyOverview");
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
      if (event.target.matches("[data-assistant-improve-text]")) {
        state.assistant.improveText = String(event.target.value || "");
        return;
      }
      if (event.target.matches("[data-assistant-chat-input]")) {
        state.assistant.chatInput = String(event.target.value || "");
        return;
      }
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
      if (event.target.matches("[data-image-brief-setup]") || event.target.matches("[data-image-brief-example]")) {
        const plan = getPlan();
        const act = getActivities(plan)[state.activityIndex];
        if (!act) return;
        const key = draftKey(act);
        const draftAct = ensureDraftActivity(key);
        if (event.target.matches("[data-image-brief-setup]")) {
          draftAct.imageBriefSetup = event.target.value || "";
        } else {
          draftAct.imageBriefExample = event.target.value || "";
        }
        markDirty();
        return;
      }
      if (event.target.matches("[data-week-family]")) {
        state.draft.week.familyConnection = event.target.value || "";
        markDirty();
      } else if (event.target.matches("[data-week-overview]")) {
        state.draft.week.weeklyOverview = event.target.value || "";
        markDirty();
      } else if (event.target.matches("[data-week-objectives]")) {
        // Explicit manual edit claims draft ownership; blank does not copy legacy in.
        state.draft.week.objectives = event.target.value || "";
        if (!state.draft.week.fieldOwnership || typeof state.draft.week.fieldOwnership !== "object") {
          state.draft.week.fieldOwnership = {};
        }
        state.draft.week.fieldOwnership.objectives = true;
        markDirty();
      } else if (event.target.matches("[data-week-materials]")) {
        state.draft.week.weeklyMaterials = event.target.value || "";
        markDirty();
      } else if (event.target.matches("[data-week-teacher-prep]")) {
        state.draft.week.teacherPreparation = event.target.value || "";
        if (!state.draft.week.teacherToolkit || typeof state.draft.week.teacherToolkit !== "object") {
          state.draft.week.teacherToolkit = { prepChecklist: [], observationFocus: [], notes: "", teacherPreparation: "" };
        }
        state.draft.week.teacherToolkit.teacherPreparation = event.target.value || "";
        markDirty();
      } else if (event.target.matches("[data-week-toolkit-prep]")) {
        if (!state.draft.week.teacherToolkit || typeof state.draft.week.teacherToolkit !== "object") {
          state.draft.week.teacherToolkit = { prepChecklist: [], observationFocus: [], notes: "", teacherPreparation: "" };
        }
        state.draft.week.teacherToolkit.prepChecklist = String(event.target.value || "")
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 24);
        markDirty();
      } else if (event.target.matches("[data-week-toolkit-focus]")) {
        if (!state.draft.week.teacherToolkit || typeof state.draft.week.teacherToolkit !== "object") {
          state.draft.week.teacherToolkit = { prepChecklist: [], observationFocus: [], notes: "", teacherPreparation: "" };
        }
        state.draft.week.teacherToolkit.observationFocus = String(event.target.value || "")
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 24);
        markDirty();
      } else {
        return;
      }
      clearTimeout(state._previewTimer);
      state._previewTimer = setTimeout(() => {
        const plan = getPlan();
        paintLivePreview(plan, getActivities(plan));
      }, 250);
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
        renderPreservingUi();
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
        renderPreservingUi();
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
        renderPreservingUi();
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
        renderPreservingUi();
      }
    });


    document.addEventListener("keydown", (event) => {
      if (!state.open) return;
      // Mid-session flag-off closes the editor safely.
      if (!isEditorFlagEnabled()) {
        if (typeof showActionFeedback === "function") {
          showActionFeedback("Enrichment Editor was disabled. Closing without publishing.");
        }
        void close({ force: true });
        return;
      }
      if (event.key === "Escape") {
        if (state.aiTray.open) {
          event.preventDefault();
          cancelAiSuggestions();
          document.querySelector("[data-ai-suggest=\"lesson\"]")?.focus?.();
          return;
        }
        if (state.publishOpen) {
          event.preventDefault();
          state.publishOpen = false;
          render();
          document.querySelector("[data-enrich-publish]")?.focus?.();
          return;
        }
        if (state.recoveryOpen) {
          event.preventDefault();
          state.recoveryOpen = false;
          state.compareOpen = false;
          render();
          document.querySelector("[data-enrich-recovery]")?.focus?.();
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
        event.preventDefault();
        void close();
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
        const dialog = document.querySelector("[data-ai-tray], [data-publish-modal], [data-recovery-modal], [data-lightbox]");
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
    saveDraft,
    isOpen: () => state.open,
    isEnabled: isEditorFlagEnabled,
    getDraft: () => state.draft,
    isDirty: () => state.dirty,
    lastSaveError: () => state.lastSaveError,
    getLessonAnalysis: () => state.lessonAnalysis,
    refreshLessonAnalysis,
    requestAiSuggestions,
    insertSelectedAiSuggestions,
    getGenerationTiming: () => state.aiTray.generationTiming,
    sliceFeatures: () => ({
      activityStudio: true,
      livePreview: true,
      photoUpload: true,
      aiSuggest: true,
      aiLessonTeacher: true,
      completeKitGeneration: true,
      aiTeacherAssistant: true,
      reusableLibrary: true,
      aiQualityReview: true,
      libraryHealthDashboard: true,
      publish: true,
      polish: true,
      preserveRemediation: true,
      draftSaveReliability: true,
      draftAutosaveRaceGuard: true,
      slice: 7,
    }),
    getQualityReport: () => state.qualityReport,
    runSpecialistQualityReview,
    render,
    /** Test / debug hooks — not used by production UI. */
    __test: {
      bumpEditGeneration,
      getEditGeneration: () => state.editGeneration,
      getSaveRequestId: () => state.saveRequestId,
      captureEditorUi,
      restoreEditorUi,
      renderPreservingUi,
      draftVerificationMarkers,
      draftContainsMarkers,
      resolveDraftSaveSuccess: (...args) => api().resolveDraftSaveSuccess(...args),
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
