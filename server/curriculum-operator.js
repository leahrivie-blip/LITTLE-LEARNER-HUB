/**
 * Owner-only AI Curriculum Operator API
 * (Phase 1–8: audit → upgrades → images → printables → songs/books → full kit →
 *  new draft create → Owner-gated manual publish bridge).
 *
 * Saves enrichmentDraft / trusted draft create only from AI jobs. Never publishes
 * from Operator job actions. Phase 8 Owner publish is a separate API.
 */
"use strict";

const schema = require("../scripts/curriculum-operator-schema.js");
const commandApi = require("../scripts/curriculum-operator-command.js");
const selectApi = require("../scripts/curriculum-operator-select.js");
const auditApi = require("../scripts/curriculum-operator-audit.js");
const upgradeApi = require("../scripts/curriculum-operator-upgrade.js");
const imagesApi = require("../scripts/curriculum-operator-images.js");
const printablesApi = require("../scripts/curriculum-operator-printables.js");
const songsBooksApi = require("../scripts/curriculum-operator-songs-books.js");
const orchestrator = require("../scripts/curriculum-operator-orchestrator.js");
const jobApi = require("../scripts/curriculum-operator-job.js");
const createApi = require("../scripts/curriculum-operator-create.js");
const createArchitect = require("../scripts/curriculum-operator-create-architect.js");
const connectedUpgradeApi = require("../scripts/curriculum-operator-connected-upgrade.js");
const lessonRead = require("../scripts/curriculum-operator-lesson-read.js");
const printableAgeBand = require("../scripts/curriculum-operator-printable-age-band.js");
const allowlistApi = require("../scripts/curriculum-operator-mutation-allowlist.js");
const executionScopeApi = require("../scripts/curriculum-operator-execution-scope.js");
const vocabSurgicalApi = require("../scripts/curriculum-operator-vocab-surgical-apply.js");

const ACTIONS = Object.freeze([
  "parse",
  "plan",
  "run",
  "connected_plan",
  "connected_run",
  "list",
  "get",
  "resume",
  "cancel",
]);

function createCurriculumOperatorApi(deps) {
  const {
    readJson,
    jsonResponse,
    readStore,
    writeStoreAsync,
    requireTeachingKitOwnerAdminSession,
    teachingKit,
    normalizeEmail,
    readSiteCurriculum,
    saveOperatorEnrichmentDraft,
    createOperatorLessonPlan,
    callOperatorAi,
    openAiConfigured,
    generateOperatorImage,
    persistEnrichmentPhoto,
    enrichmentMedia,
    createOperatorPrintableResource,
    readOperatorPrintableFile,
    unlinkOperatorPrintableResource,
    applyOperatorConnectedEnrichment,
    applyOperatorConnectedActivityImages,
    operatorJobStore = null,
  } = deps;

  function printableCallAi() {
    return async (systemPrompt, userPrompt) => {
      const forceFixture = process.env.NODE_ENV === "test"
        || ["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_AI_FIXTURE || "").trim().toLowerCase())
        || ["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_PRINTABLE_FIXTURE || "").trim().toLowerCase());
      const planner = require("../scripts/curriculum-operator-printable-planner.js");
      if (forceFixture) {
        if (/REVISION MODE|Revise this printable/i.test(String(systemPrompt || "") + String(userPrompt || ""))) {
          return planner.buildOperatorPrintableAiRevisionFixtureResponse(userPrompt);
        }
        return planner.buildOperatorPrintableAiFixtureResponse(userPrompt);
      }
      if (typeof callOperatorAi === "function") {
        return callOperatorAi(systemPrompt, userPrompt);
      }
      throw new Error("Printable content planner AI is not configured.");
    };
  }

  function songsBooksCallAi() {
    return async (systemPrompt, userPrompt) => {
      const forceFixture = process.env.NODE_ENV === "test"
        || ["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_AI_FIXTURE || "").trim().toLowerCase())
        || ["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_SONGS_BOOKS_FIXTURE || "").trim().toLowerCase());
      if (forceFixture) {
        return songsBooksApi.buildOperatorSongBookAiFixtureResponse(userPrompt);
      }
      if (typeof callOperatorAi === "function") {
        return callOperatorAi(systemPrompt, userPrompt);
      }
      throw new Error("Songs/books planner AI is not configured.");
    };
  }

  function requireOwner(request, body, response) {
    const session = requireTeachingKitOwnerAdminSession(request, body, response);
    if (!session) return null;
    const email = normalizeEmail(session.email || "");
    if (!teachingKit.isTeachingKitOwnerPreviewEmail(email)) {
      jsonResponse(response, 403, {
        error: "AI Curriculum Operator is restricted to the owner account.",
        code: "teaching_kit_owner_required",
      });
      return null;
    }
    return { ...session, email };
  }

  function requireFlag(store, response) {
    const flags = store?.siteContent?.featureFlags || {};
    if (!teachingKit.isTeachingKitCurriculumOperatorEnabled(flags)) {
      jsonResponse(response, 404, {
        error: "AI Curriculum Operator is disabled.",
        code: "curriculum_operator_disabled",
      });
      return false;
    }
    return true;
  }

  function readJobs(store) {
    const legacy = jobApi.normalizeOperatorJobStore(store?.curriculumOperatorJobs);
    if (operatorJobStore && typeof operatorJobStore.mergeWithLegacyBag === "function") {
      return operatorJobStore.mergeWithLegacyBag(legacy);
    }
    return legacy;
  }

  async function writeJobs(store, nextJobs) {
    const stamp = jobApi.nowIso();
    const previous = jobApi.normalizeOperatorJobStore(store?.curriculumOperatorJobs);
    const normalized = jobApi.normalizeOperatorJobStore({
      ...nextJobs,
      updatedAt: stamp,
    });
    const jobStoreApi = require("./curriculum-operator-job-store.js");
    // Only jobs created or advanced in THIS mutation — never bulk-seed legacy history.
    const changedJobs = jobStoreApi.selectJobsChangedInWrite(previous, normalized);

    const canPersist = Boolean(
      operatorJobStore
      && typeof operatorJobStore.canSafelyPersistDedicated === "function"
      && operatorJobStore.canSafelyPersistDedicated(),
    );
    const canCap = Boolean(
      operatorJobStore
      && typeof operatorJobStore.canSafelyCapHotStore === "function"
      && operatorJobStore.canSafelyCapHotStore(),
    );
    const requiresPostgres = Boolean(
      operatorJobStore
      && typeof operatorJobStore.requiresDurableBackend === "function"
      && operatorJobStore.requiresDurableBackend(),
    );

    if (canPersist && changedJobs.length) {
      try {
        await operatorJobStore.upsertJobs(changedJobs);
      } catch (error) {
        const err = new Error(
          error?.message || "Could not persist curriculum operator jobs to dedicated storage.",
        );
        err.code = error?.code || "operator_job_persist_failed";
        err.cause = error;
        throw err;
      }
    } else if (requiresPostgres && !canPersist && changedJobs.length) {
      console.warn(
        "[curriculum-operator] dedicated Postgres job store not ready — "
        + "preserving full llh_store jobs (no dedicated dual-write; no hot-cap)",
      );
    }

    // Stage 1: hot-store cutover is disabled. Keep FULL legacy-compatible bag always.
    // Stage 2 may enable canSafelyCapHotStore only after explicit migrate+verify.
    if (canCap) {
      store.curriculumOperatorJobs = jobStoreApi.buildHotStoreJobBag(normalized).bag;
    } else {
      store.curriculumOperatorJobs = normalized;
    }

    await writeStoreAsync(store);
    return store.curriculumOperatorJobs;
  }

  function getJobMutationAllowlist(job) {
    if (job?.mutationAllowlist?.version) {
      return allowlistApi.resumeUsesOriginalAllowlist(job);
    }
    return allowlistApi.buildMutationAllowlist(job?.command || {}, {
      lessonIds: job?.command?.scope?.lessonIds,
    });
  }

  function appendMutationViolationsToLessonResult(job, lessonId, violations = []) {
    if (!violations.length) return;
    job.lessonResults = schema.asArray(job.lessonResults).map((row) => {
      if (text(row.lessonId, 160) !== text(lessonId, 160)) return row;
      return allowlistApi.attachViolationsToLessonResult(row, violations);
    });
  }

  async function saveDraftGuarded({
    job,
    store,
    lessonPlanId,
    enrichmentDraft,
    adminEmail,
    beforePlan,
    stage = "enrichmentDraft.save",
  }) {
    const allowlist = getJobMutationAllowlist(job);
    const gate = allowlistApi.validateEnrichmentDraftSave({
      beforeDraft: beforePlan?.enrichmentDraft,
      afterDraft: enrichmentDraft,
      beforePlan,
      allowlist,
      lessonId: lessonPlanId,
      stage,
      command: job?.command || {},
    });
    if (gate.violations?.length) {
      appendMutationViolationsToLessonResult(job, lessonPlanId, gate.violations);
    }
    if (typeof saveOperatorEnrichmentDraft !== "function") {
      return { ok: false, error: "Draft save helper is not configured.", mutationGate: gate };
    }
    return saveOperatorEnrichmentDraft({
      store,
      lessonPlanId,
      enrichmentDraft: gate.filteredDraft || enrichmentDraft,
      adminEmail,
    }).then((result) => ({ ...result, mutationGate: gate }));
  }

  function text(value, max = 4000) {
    return schema.text(value, max);
  }

  function wantsUpgrade(command) {
    const phase = Number(command?.completion?.phase) || 1;
    return phase >= 2
      && command?.actions?.saveDraft === true
      && (command?.actions?.upgradeLesson || command?.actions?.upgradeActivities)
      && command?.actions?.touchDraft !== false;
  }

  function wantsImages(command) {
    const phase = Number(command?.completion?.phase) || 1;
    if (!(phase === 3 || phase >= 6)) return false;
    if (command?.actions?.touchImages === false) return false;
    return command?.actions?.generateImages === true;
  }

  function wantsPrintables(command) {
    const phase = Number(command?.completion?.phase) || 1;
    if (!(phase === 4 || phase >= 6)) return false;
    if (command?.actions?.touchPrintables === false) return false;
    return command?.actions?.generatePrintables === true;
  }

  function wantsSongsBooks(command) {
    const phase = Number(command?.completion?.phase) || 1;
    if (!(phase === 5 || phase >= 6)) return false;
    if (command?.actions?.touchSongs === false && command?.actions?.touchBooks === false) return false;
    return command?.actions?.generateSongsBooks === true;
  }

  function wantsCreate(command) {
    const phase = Number(command?.completion?.phase) || 1;
    return phase >= 7 && command?.actions?.createLesson === true;
  }

  function buildPlanSummary(command, selection) {
    const upgrade = wantsUpgrade(command);
    const images = wantsImages(command);
    const printables = wantsPrintables(command);
    const songsBooks = wantsSongsBooks(command);
    const create = wantsCreate(command);
    const phase = Number(command.completion?.phase) || 1;
    const kitScope = orchestrator.normalizeKitScopeFlags(command.actions || {});
    const expected = create
      ? ["lesson.create", "lesson.validate"]
      : ["lesson.get", "lesson.audit", "asset.plan", "teachingKit.score"];
    if (upgrade) {
      expected.push("lesson.updateFields", "lesson.saveDraft", "lesson.validate");
      if (executionScopeApi.activityUpdatesAllowed(command)) {
        expected.push("activity.update");
      }
    }
    if (songsBooks) {
      expected.push(
        "song.audit",
        "song.upsert",
        "book.audit",
        "book.upsert",
        "lesson.saveDraft",
        "lesson.validate",
      );
    }
    if (images) {
      expected.push(
        "image.inspect",
        "image.generate",
        "image.upload",
        "image.attachToActivity",
        "lesson.validate",
      );
    }
    if (printables) {
      expected.push(
        "printable.plan",
        "printable.generatePages",
        "printable.buildPdf",
        "printable.upload",
        "printable.attach",
        "printable.verify",
      );
    }
    if (phase >= 6) expected.push("lesson.validate");
    const lessons = schema.asArray(selection.selected).map((row) => ({
      id: row.id,
      title: row.title,
      theme: row.theme,
      age: row.age,
      ageBand: row.ageBand,
      plan: row.plan,
      readinessPercent: row.readinessPercent,
      completionPercent: row.completionPercent,
      expectedActions: expected.slice(),
      weakSections: [],
      publishRequested: false,
      kitScope,
      creationBrief: row.creationBrief || null,
      createdLessonId: row.createdLessonId || null,
      creationIdempotencyKey: row.creationIdempotencyKey || null,
    }));
    const phaseNote = executionScopeApi.buildScopeAwarePhaseNote(command);
    return {
      task: command.rawCommand,
      intent: command.intent,
      selectionNote: selection.selectionNote,
      lessons,
      selectedLessonIds: lessons.map((l) => l.id),
      candidatesConsidered: selection.candidatesConsidered,
      unresolvedTitles: selection.unresolvedTitles || [],
      needsConfirmation: false,
      confirmReasons: [],
      phase,
      phaseNote,
      kitScope,
      creationBrief: selection.creationBrief || null,
      pendingCreateId: selection.pendingCreateId || null,
      createdLessonId: selection.createdLessonId || null,
      generatesImages: images,
      generatesPrintables: printables,
      generatesSongsBooks: songsBooks,
      publishes: false,
      createsLesson: create,
    };
  }

  function collectSucceededImageKeys(lr) {
    const keys = new Set();
    schema.asArray(lr?.imageActions).forEach((a) => {
      if (a.status === "success" && a.idempotencyKey) keys.add(a.idempotencyKey);
    });
    return keys;
  }

  function collectSucceededPrintableKeys(lr) {
    const keys = new Set();
    schema.asArray(lr?.printableActions).forEach((a) => {
      if (a.status === "success" && a.idempotencyKey) keys.add(a.idempotencyKey);
    });
    return keys;
  }

  function collectSucceededSongBookKeys(lr) {
    const keys = new Set();
    schema.asArray(lr?.songActions).forEach((a) => {
      if (a.status === "success" && a.idempotencyKey) keys.add(a.idempotencyKey);
    });
    schema.asArray(lr?.bookActions).forEach((a) => {
      if (a.status === "success" && a.idempotencyKey) keys.add(a.idempotencyKey);
    });
    return keys;
  }

  async function runSongsBooksForLesson(job, plan, audit, store, sessionEmail, lr) {
    const curriculum = readSiteCurriculum(store);
    const linked = schema.asArray(curriculum.activities).filter((a) => a.lessonPlanId === plan.id);
    const lockedAudit = { ...(audit || {}) };
    if (job.command?.actions?.touchBooks === false) {
      lockedAudit.books = schema.normalizeFieldDecision({
        field: "books",
        decision: "KEEP",
        reason: "Books locked by command exclusion.",
        preview: audit?.books?.preview || "",
      });
    }
    if (job.command?.actions?.touchSongs === false) {
      lockedAudit.songs = schema.asArray(audit?.songs).map((s) => schema.normalizeFieldDecision({
        ...s,
        decision: "KEEP",
        reason: "Songs locked by command exclusion.",
      }));
    }
    const planned = await songsBooksApi.planSongsAndBooks({
      plan,
      activities: linked,
      audit: lockedAudit,
      callAi: songsBooksCallAi(),
      alreadySucceededKeys: collectSucceededSongBookKeys(lr),
    });

    if (planned.usage) {
      job.costCounters.songPlannerCalls = (job.costCounters.songPlannerCalls || 0)
        + Number(planned.usage.songPlannerCalls || 0);
      job.costCounters.bookGuideCalls = (job.costCounters.bookGuideCalls || 0)
        + Number(planned.usage.bookGuideCalls || 0);
      job.costCounters.songsCreated = (job.costCounters.songsCreated || 0)
        + Number(planned.usage.songsCreated || 0);
      job.costCounters.songsImproved = (job.costCounters.songsImproved || 0)
        + Number(planned.usage.songsImproved || 0);
      job.costCounters.booksLinked = (job.costCounters.booksLinked || 0)
        + Number(planned.usage.booksLinked || 0);
      job.costCounters.bookGuidesImproved = (job.costCounters.bookGuidesImproved || 0)
        + Number(planned.usage.bookGuidesImproved || 0);
      job.costCounters.openaiCalls = (job.costCounters.openaiCalls || 0)
        + Number(planned.usage.songPlannerCalls || 0);
    }

    const counts = songsBooksApi.summarizeSongBookActions(planned.songActions, planned.bookActions);
    if (!planned.ok && !planned.skipped) {
      return {
        ok: false,
        partial: false,
        songBookRun: planned,
        afterPlan: plan,
        historyId: null,
        counts,
        error: planned.error || "Songs/books planning failed.",
      };
    }

    let afterPlan = plan;
    let historyId = null;
    if (planned.changed && planned.enrichmentDraft) {
      const saveResult = await saveDraftGuarded({
        job,
        store,
        lessonPlanId: plan.id,
        enrichmentDraft: planned.enrichmentDraft,
        adminEmail: sessionEmail,
        beforePlan: plan,
        stage: "songsBooks.save",
      });
      if (!saveResult?.ok) {
        throw new Error(saveResult?.error || "enrichment_draft save failed");
      }
      historyId = saveResult.versionId || null;
      afterPlan = saveResult.lessonPlan;
      Object.assign(store, readStore());
    }

    const verification = songsBooksApi.verifySongBookJobDraft({
      beforePlan: plan,
      afterPlan,
      songActions: planned.songActions,
      bookActions: planned.bookActions,
    });
    const songActions = schema.asArray(planned.songActions).map((a) => {
      if (a.status === "success" && !verification.ok) {
        return { ...a, status: "failed", error: "post_save_verification_failed" };
      }
      return a;
    });
    const bookActions = schema.asArray(planned.bookActions).map((a) => {
      if (a.status === "success" && !verification.ok) {
        return { ...a, status: "failed", error: "post_save_verification_failed" };
      }
      return a;
    });
    const finalCounts = songsBooksApi.summarizeSongBookActions(songActions, bookActions);
    const ok = verification.ok && (planned.ok || planned.skipped);
    return {
      ok,
      partial: !ok && (
        songActions.some((a) => a.status === "success")
        || bookActions.some((a) => a.status === "success")
      ),
      songBookRun: {
        ...planned,
        songActions,
        bookActions,
        jobVerification: verification,
      },
      afterPlan,
      historyId,
      counts: finalCounts,
      error: ok ? null : (planned.error || "Post-save songs/books verification failed."),
    };
  }

  async function runPrintablesForLesson(job, plan, audit, store, sessionEmail, lr) {
    const curriculum = readSiteCurriculum(store);
    const linked = schema.asArray(curriculum.activities).filter((a) => a.lessonPlanId === plan.id);
    const hardMax = Number(job.command?.limits?.maxPrintableGenerations)
      || schema.DEFAULT_LIMITS.maxPrintableGenerations;
    const alreadyUsed = Number(job.costCounters?.printables) || 0;
    const remaining = Math.max(0, hardMax - alreadyUsed);
    const lessonCount = Math.max(1, Number(job.lessonResults?.length) || Number(job.progress?.lessonCount) || 1);

    const printableRun = await printablesApi.runPrintablePlanForLesson({
      plan,
      activities: linked,
      audit,
      curriculum,
      limits: {
        ...(job.command.limits || {}),
        maxPrintableGenerations: remaining,
      },
      lessonCount,
      command: job.command || null,
      touchPrintables: true,
      replaceWeakPrintables: true,
      alreadySucceededKeys: collectSucceededPrintableKeys(lr),
      createPrintableResource: createOperatorPrintableResource
        ? async (payload) => createOperatorPrintableResource({ ...payload, store, adminEmail: sessionEmail })
        : null,
      readResourceFile: readOperatorPrintableFile
        ? async (payload) => readOperatorPrintableFile({ ...payload, store })
        : null,
      unlinkPrintableResource: unlinkOperatorPrintableResource
        ? async (payload) => unlinkOperatorPrintableResource({ ...payload, store, adminEmail: sessionEmail })
        : null,
      saveDraft: async ({ enrichmentDraft }) => {
        const saveResult = await saveDraftGuarded({
          job,
          store,
          lessonPlanId: plan.id,
          enrichmentDraft,
          adminEmail: sessionEmail,
          beforePlan: plan,
          stage: "printables.save",
        });
        if (!saveResult?.ok) return { ok: false, error: saveResult?.error || "save failed" };
        Object.assign(store, readStore());
        const reloaded = schema.asArray(readSiteCurriculum(store).lessonPlans).find((p) => p.id === plan.id);
        return {
          ok: true,
          enrichmentDraft: reloaded?.enrichmentDraft || enrichmentDraft,
          lessonPlan: reloaded,
          versionId: saveResult.versionId,
        };
      },
      callAi: printableCallAi(),
      useContentPlanner: true,
      generatePrintableVisual: typeof generateOperatorImage === "function"
        ? async ({ prompt, mock }) => generateOperatorImage({ prompt, mock })
        : null,
    });

    if (printableRun.code === "SCOPE_REVIEW_REQUIRED") {
      return {
        ok: false,
        scopeReview: true,
        printableRun,
        plan,
        error: printableRun.error,
        printableBudgetDiagnostics: printableRun.printableBudgetDiagnostics || null,
      };
    }

    Object.assign(store, readStore());
    const afterPlan = schema.asArray(readSiteCurriculum(store).lessonPlans).find((p) => p.id === plan.id) || plan;
    const resourcesAfter = schema.asArray(readSiteCurriculum(store).resources);
    const jobVerification = printablesApi.verifyPrintableJobDraft({
      beforePlan: plan,
      afterPlan,
      actions: printableRun.actions,
      resourcesAfter,
    });

    const verifiedActions = schema.asArray(printableRun.actions).map((action) => {
      if (action.status !== "success") return action;
      if (!jobVerification.ok) {
        return {
          ...action,
          status: "failed",
          error: "Post-save printable verification failed.",
          retryable: true,
          verification: jobVerification,
          preservedExisting: Boolean(action.preservedExisting),
        };
      }
      return { ...action, verification: jobVerification, status: "success" };
    });

    const counts = printablesApi.summarizePrintableActions(verifiedActions);
    job.costCounters.printables = (job.costCounters.printables || 0) + Number(printableRun.generations || 0);

    return {
      ok: verifiedActions.every((a) => a.status !== "failed") && jobVerification.ok,
      partial: verifiedActions.some((a) => a.status === "failed")
        && verifiedActions.some((a) => a.status === "success"),
      printableRun: { ...printableRun, actions: verifiedActions, counts, jobVerification },
      afterPlan,
      historyId: null,
      counts,
      printableBudgetDiagnostics: printableRun.printableBudgetDiagnostics || null,
      error: jobVerification.ok ? null : "Post-save printable verification failed.",
    };
  }

  async function runImagesForLesson(job, plan, audit, store, sessionEmail, lr) {
    const curriculum = readSiteCurriculum(store);
    const linked = schema.asArray(curriculum.activities).filter((a) => a.lessonPlanId === plan.id);

    const mockGenerate = process.env.NODE_ENV === "test"
      || ["1", "true", "yes"].includes(String(process.env.VISUAL_PRODUCTION_MOCK_GENERATE || "").trim().toLowerCase())
      || ["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_IMAGE_FIXTURE || "").trim().toLowerCase());

    const hardMax = Number(job.command?.limits?.maxImageGenerations) || schema.DEFAULT_LIMITS.maxImageGenerations;
    const alreadyUsed = Number(job.costCounters?.images) || 0;
    const remainingGenerations = Math.max(0, hardMax - alreadyUsed);
    const lessonCount = Math.max(1, Number(job.lessonResults?.length) || Number(job.progress?.lessonCount) || 1);

    const imageRun = await imagesApi.runImagePlanForLesson({
      plan,
      activities: linked,
      audit,
      limits: {
        ...(job.command.limits || {}),
        maxImageGenerations: remainingGenerations,
      },
      lessonCount,
      command: job.command || null,
      replaceBadImages: job.command.actions.replaceBadImages === true,
      touchImages: job.command.actions.touchImages !== false,
      callGenerate: generateOperatorImage,
      persistEnrichmentPhotoVariants: persistEnrichmentPhoto,
      enrichmentMedia,
      store,
      mockGenerate,
      preferPublicMediaUrls: imagesApi.commandRequestsConnectedAutoApply(job.command),
      alreadySucceededKeys: collectSucceededImageKeys(lr),
    });

    if (imageRun.code === "SCOPE_REVIEW_REQUIRED") {
      return {
        ok: false,
        scopeReview: true,
        imageRun,
        plan,
        error: imageRun.error,
        imageBudgetDiagnostics: imageRun.imageBudgetDiagnostics || null,
      };
    }

    let afterPlan = plan;
    let historyId = null;
    let connectedImageApply = null;
    const connectedAutoApply = imagesApi.commandRequestsConnectedAutoApply(job.command);

    if (imageRun.changed) {
      if (connectedAutoApply && typeof applyOperatorConnectedActivityImages === "function") {
        // Direct draft lesson save for connected auto-apply — owner sees images
        // in the normal lesson editor without a separate Apply Enrichment click.
        connectedImageApply = await applyOperatorConnectedActivityImages({
          store,
          lessonPlanId: plan.id,
          imageActions: imageRun.actions,
          enrichmentDraft: imageRun.enrichmentDraft,
          adminEmail: sessionEmail,
        });
        if (!connectedImageApply?.ok) {
          throw new Error(connectedImageApply?.error || "connected activity image draft save failed");
        }
        Object.assign(store, readStore());
        const reloaded = schema.asArray(readSiteCurriculum(store).lessonPlans)
          .find((p) => p.id === plan.id);
        if (!reloaded) {
          throw new Error("Post-save reload failed: lesson missing from store.");
        }
        afterPlan = reloaded;
      } else {
        const saveResult = await saveDraftGuarded({
          job,
          store,
          lessonPlanId: plan.id,
          enrichmentDraft: imageRun.enrichmentDraft,
          adminEmail: sessionEmail,
          beforePlan: plan,
          stage: "images.save",
        });
        if (!saveResult?.ok) {
          throw new Error(saveResult?.error || "enrichment_draft image save failed");
        }
        historyId = saveResult.versionId || null;
        // Reload from persistence abstraction — do not trust the in-memory mutate alone.
        Object.assign(store, readStore());
        const reloaded = schema.asArray(readSiteCurriculum(store).lessonPlans)
          .find((p) => p.id === plan.id);
        if (!reloaded) {
          throw new Error("Post-save reload failed: lesson missing from store.");
        }
        afterPlan = reloaded;
      }
    }

    Object.assign(store, readStore());
    const curriculumAfter = readSiteCurriculum(store);
    const activitiesAfterReload = schema.asArray(curriculumAfter.activities)
      .filter((a) => a.lessonPlanId === plan.id);
    if (connectedAutoApply && connectedImageApply?.ok) {
      const reloadedPlan = schema.asArray(curriculumAfter.lessonPlans).find((p) => p.id === plan.id);
      if (reloadedPlan) afterPlan = reloadedPlan;
    }

    const jobVerification = connectedAutoApply && connectedImageApply?.ok
      ? imagesApi.verifyConnectedImageJobRecords({
        beforePlan: plan,
        afterPlan,
        afterActivities: activitiesAfterReload,
        actions: imageRun.actions,
      })
      : imagesApi.verifyImageJobDraft({
        beforePlan: plan,
        afterPlan,
        actions: imageRun.actions,
      });

    let restoredDraft = null;
    const verifiedActions = schema.asArray(imageRun.actions).map((action) => {
      if (action.status !== "success") return action;
      const assetField = action.field === "exampleImageUrl" ? "exampleMediaAssetId" : "setupMediaAssetId";

      if (connectedAutoApply && connectedImageApply?.ok) {
        const liveAct = activitiesAfterReload.find((a) => schema.text(a.id, 160) === schema.text(action.activityId, 160));
        const attachedOk = schema.text(liveAct?.[action.field], 500) === schema.text(action.mediaUrl, 500)
          && schema.text(liveAct?.[assetField], 160) === schema.text(action.mediaAssetId, 160)
          && !imagesApi.isAdminOnlyEnrichmentMediaUrl(liveAct?.[action.field]);
        if (attachedOk) {
          return {
            ...action,
            verification: jobVerification,
            status: "success",
            persistedToLessonRecords: true,
          };
        }
        return {
          ...action,
          status: "failed",
          error: "Connected direct draft save did not show intended media on activity.",
          retryable: true,
          verification: jobVerification,
          preservedExisting: Boolean(action.previousUrl),
        };
      }

      const afterAct = afterPlan?.enrichmentDraft?.activities?.[action.activityId] || {};
      const attachedOk = schema.text(afterAct[action.field], 500) === schema.text(action.mediaUrl, 500)
        && schema.text(afterAct[assetField], 160) === schema.text(action.mediaAssetId, 160);

      if (attachedOk) {
        return { ...action, verification: jobVerification, status: "success" };
      }

      // Attach did not land on the reloaded draft — restore prior REPLACE media when possible.
      if (!restoredDraft) {
        restoredDraft = afterPlan?.enrichmentDraft && typeof afterPlan.enrichmentDraft === "object"
          ? JSON.parse(JSON.stringify(afterPlan.enrichmentDraft))
          : { week: {}, activities: {} };
      }
      if (action.previousUrl) {
        if (!restoredDraft.activities[action.activityId]) restoredDraft.activities[action.activityId] = {};
        restoredDraft.activities[action.activityId][action.field] = action.previousUrl;
      }
      return {
        ...action,
        status: "failed",
        error: "Post-save reload did not show intended media on activity.",
        retryable: true,
        verification: jobVerification,
        preservedExisting: Boolean(action.previousUrl),
      };
    });

    if (restoredDraft && typeof saveOperatorEnrichmentDraft === "function") {
      const restoreSave = await saveOperatorEnrichmentDraft({
        store,
        lessonPlanId: plan.id,
        enrichmentDraft: restoredDraft,
        adminEmail: sessionEmail,
      });
      if (restoreSave?.ok) {
        Object.assign(store, readStore());
        afterPlan = schema.asArray(readSiteCurriculum(store).lessonPlans)
          .find((p) => p.id === plan.id) || afterPlan;
      }
    }

    const counts = imagesApi.summarizeImageActions(verifiedActions);
    job.costCounters.images = (job.costCounters.images || 0) + Number(imageRun.generations || 0);

    const ok = jobVerification.ok && verifiedActions.every((a) => a.status !== "failed");
    return {
      ok,
      partial: verifiedActions.some((a) => a.status === "failed")
        && verifiedActions.some((a) => a.status === "success"),
      imageRun: { ...imageRun, actions: verifiedActions, counts, jobVerification },
      afterPlan,
      historyId,
      counts,
      imageBudgetDiagnostics: imageRun.imageBudgetDiagnostics || null,
      connectedImageApply,
      error: ok ? null : "Post-save image job verification failed.",
    };
  }

  function auditOneLesson(plan, curriculum, options = {}) {
    const audit = auditApi.auditLesson(plan, curriculum, options);
    const verification = auditApi.verifyAuditAgainstPlan(plan, audit);
    audit.verification = verification;
    return { audit, verification };
  }

  function markSteps(actions, types, status, extra = {}) {
    return schema.asArray(actions).map((s) => (
      types.includes(s.type)
        ? { ...s, status, ...extra }
        : s
    ));
  }

  /**
   * Phase 7: brief → duplicate check → base content → trusted create → ID verify.
   * Idempotent: if lessonCreated + createdLessonId, skip create and return that lesson.
   */
  async function ensureCreatedLesson(job, lr, store, sessionEmail) {
    const curriculum = readSiteCurriculum(store);
    if (lr.lessonCreated && lr.createdLessonId) {
      const existing = schema.asArray(curriculum.lessonPlans).find((p) => p.id === lr.createdLessonId);
      if (existing) {
        jobApi.appendLog(job, `Resume: reusing created lesson ${lr.createdLessonId} (no second create).`, "info", lr.createdLessonId);
        return {
          ok: true,
          resumed: true,
          lr: {
            ...lr,
            lessonId: lr.createdLessonId,
            title: existing.title,
            lessonCreated: true,
            idsVerified: lr.idsVerified === true,
            creationBriefComplete: true,
            duplicateCheckComplete: true,
            baseContentComplete: true,
            textComplete: true,
          },
          plan: existing,
          curriculum,
        };
      }
    }

    const briefResult = createApi.parseCreationBrief(job.command?.rawCommand || "", {
      defaultAccessPlan: "Free",
    });
    if (!briefResult.ok) {
      return {
        ok: false,
        code: briefResult.code || "NEEDS_OWNER_INPUT",
        error: `Needs owner input: ${(briefResult.needsOwnerInput || []).join(", ")}`,
        lr: {
          ...lr,
          status: "failed",
          ownerReviewStatus: "BLOCKED",
          creationBriefComplete: false,
          error: `Needs owner input: ${(briefResult.needsOwnerInput || []).join(", ")}`,
          code: "NEEDS_OWNER_INPUT",
        },
      };
    }
    const brief = briefResult.brief;
    job.progress.currentAction = "creation.brief";
    jobApi.appendLog(
      job,
      `Creation brief: ${brief.title} · ${brief.ageBand} · ${brief.accessPlan} · ${brief.activityTarget} activities`,
      "info",
    );

    const dup = createApi.findCreationDuplicates(brief, curriculum);
    job.progress.currentAction = "creation.duplicate_check";
    if (!dup.ok) {
      const allowAnyway = /\b(separate|anyway|still create|force create|not a duplicate)\b/i.test(job.command?.rawCommand || "")
        || job.command?.confirmations?.planAcknowledged === true
        || schema.asArray(job.command?.confirmations?.reasons).includes("possible_duplicate_ack");
      if (!allowAnyway) {
        return {
          ok: false,
          code: "POSSIBLE_DUPLICATE",
          error: dup.message,
          lr: {
            ...lr,
            status: "failed",
            ownerReviewStatus: "BLOCKED",
            creationBriefComplete: true,
            duplicateCheckComplete: true,
            creationBrief: brief,
            error: dup.message,
            code: "POSSIBLE_DUPLICATE",
            audit: { duplicateMatches: dup.matches, level: dup.level },
          },
        };
      }
      jobApi.appendLog(job, `Duplicate warning acknowledged — continuing create (${dup.message}).`, "warn");
    }

    const stagedComposer = require("../scripts/curriculum-operator-staged-composer.js");
    const contentBuilt = await createArchitect.composeNewLessonContent(brief, {
      priorProgress: {
        creationBlueprintComplete: lr.creationBlueprintComplete === true,
        creationBlueprint: lr.creationBlueprint || null,
        activityExpansionBatches: lr.activityExpansionBatches || null,
      },
      callAi: typeof callOperatorAi === "function"
        ? async (systemPrompt, userPrompt, aiOptions = {}) => {
          // Prefer staged fixtures in fixture mode so Stage 1/2 prompts are not
          // answered with a full single-shot lesson dump.
          if (createArchitect.isCreateFixtureMode()) {
            return stagedComposer.buildStagedFixtureResponse(userPrompt);
          }
          return callOperatorAi(systemPrompt, userPrompt, {
            maxOutputTokens: Number(aiOptions.maxOutputTokens) > 0
              ? Number(aiOptions.maxOutputTokens)
              : 12000,
            returnMeta: aiOptions.returnMeta === true,
          });
        }
        : undefined,
    });
    job.progress.currentAction = "creation.base_content";
    if (contentBuilt.progress) {
      lr.creationBlueprintComplete = contentBuilt.progress.creationBlueprintComplete === true;
      lr.creationBlueprint = contentBuilt.progress.creationBlueprint || null;
      lr.activityExpansionBatches = contentBuilt.progress.activityExpansionBatches || null;
    }
    if (contentBuilt.stagedDiagnostics) {
      lr.stagedDiagnostics = contentBuilt.stagedDiagnostics;
    }
    if (contentBuilt.usage) {
      const u = contentBuilt.usage;
      job.costCounters.lessonArchitectCalls = (job.costCounters.lessonArchitectCalls || 0)
        + Number(u.lessonArchitectCalls || 0);
      job.costCounters.lessonRevisionCalls = (job.costCounters.lessonRevisionCalls || 0)
        + Number(u.lessonRevisionCalls || 0);
      job.costCounters.lessonArchitectureCalls = (job.costCounters.lessonArchitectureCalls || 0)
        + Number(u.lessonArchitectureCalls || 0);
      job.costCounters.activityExpansionCalls = (job.costCounters.activityExpansionCalls || 0)
        + Number(u.activityExpansionCalls || 0);
      job.costCounters.activityRepairCalls = (job.costCounters.activityRepairCalls || 0)
        + Number(u.activityRepairCalls || 0);
      job.costCounters.activitiesRequested = Number(u.activitiesRequested || job.costCounters.activitiesRequested || 0);
      job.costCounters.activitiesCompleted = Number(u.activitiesCompleted || job.costCounters.activitiesCompleted || 0);
      job.costCounters.outputTruncationCount = (job.costCounters.outputTruncationCount || 0)
        + Number(u.outputTruncationCount || 0);
      job.costCounters.openaiCalls = (job.costCounters.openaiCalls || 0)
        + Number(u.openaiCalls || 0);
    }
    if (brief.researchRequested) {
      jobApi.appendLog(job, "Research requested: RESEARCH_NOT_AVAILABLE (no approved research mechanism).", "info");
    }
    if (!contentBuilt.ok) {
      return {
        ok: false,
        code: contentBuilt.code || "AI_CREATION_FAILED",
        error: contentBuilt.error || "AI lesson architect failed.",
        lr: {
          ...lr,
          status: "failed",
          ownerReviewStatus: "BLOCKED",
          creationBriefComplete: true,
          duplicateCheckComplete: true,
          baseContentComplete: false,
          lessonCreated: false,
          creationBrief: brief,
          error: contentBuilt.error || "AI lesson architect failed.",
          code: contentBuilt.code || "AI_CREATION_FAILED",
          aiUsage: contentBuilt.usage || null,
          stagedDiagnostics: contentBuilt.stagedDiagnostics || lr.stagedDiagnostics || null,
          creationBlueprintComplete: contentBuilt.progress?.creationBlueprintComplete === true,
          creationBlueprint: contentBuilt.progress?.creationBlueprint || lr.creationBlueprint || null,
          activityExpansionBatches: contentBuilt.progress?.activityExpansionBatches || lr.activityExpansionBatches || null,
        },
      };
    }
    jobApi.appendLog(
      job,
      `AI staged composer ok (${contentBuilt.source || "ai"}; activities=${contentBuilt.activityCount}${contentBuilt.revised ? "; repaired" : ""}; arch=${contentBuilt.usage?.lessonArchitectureCalls || 0}; expand=${contentBuilt.usage?.activityExpansionCalls || 0}).`,
      "info",
    );

    if (typeof createOperatorLessonPlan !== "function") {
      return {
        ok: false,
        code: "create_helper_missing",
        error: "Trusted lesson create helper is not configured.",
        lr: {
          ...lr,
          status: "failed",
          ownerReviewStatus: "BLOCKED",
          creationBriefComplete: true,
          duplicateCheckComplete: true,
          baseContentComplete: true,
          creationBrief: brief,
          error: "Trusted lesson create helper is not configured.",
        },
      };
    }

    const payload = createApi.buildLessonPlanPayload(brief, contentBuilt.content, {
      editedBy: sessionEmail || "curriculum-operator-phase7",
    });
    job.progress.currentAction = "lesson.create";
    const created = await createOperatorLessonPlan({
      store,
      lessonPlan: payload,
      adminEmail: sessionEmail,
    });
    if (!created?.ok) {
      return {
        ok: false,
        code: created?.code || "create_failed",
        error: created?.error || "Trusted lesson create failed.",
        lr: {
          ...lr,
          status: "failed",
          ownerReviewStatus: "BLOCKED",
          creationBriefComplete: true,
          duplicateCheckComplete: true,
          baseContentComplete: true,
          lessonCreated: false,
          creationBrief: brief,
          creationIdempotencyKey: brief.idempotencyKey,
          error: created?.error || "Trusted lesson create failed.",
        },
      };
    }

    Object.assign(store, readStore());
    const afterCurriculum = readSiteCurriculum(store);
    const plan = schema.asArray(afterCurriculum.lessonPlans).find((p) => p.id === created.createdLessonId);
    const activities = schema.asArray(afterCurriculum.activities).filter((a) => a.lessonPlanId === created.createdLessonId);
    const idCheck = createApi.validateCreatedIds(plan, activities);
    if (!idCheck.ok) {
      return {
        ok: false,
        code: "ids_invalid",
        error: "Created lesson IDs failed verification.",
        lr: {
          ...lr,
          lessonId: created.createdLessonId,
          createdLessonId: created.createdLessonId,
          title: plan?.title || brief.title,
          status: "failed",
          ownerReviewStatus: "BLOCKED",
          creationBriefComplete: true,
          duplicateCheckComplete: true,
          baseContentComplete: true,
          lessonCreated: true,
          idsVerified: false,
          creationBrief: brief,
          creationIdempotencyKey: brief.idempotencyKey,
          textComplete: true,
          error: "Created lesson IDs failed verification.",
        },
      };
    }

    const quality = createApi.qualityReviewNewLesson({ brief, lessonPlan: plan, activities });
    jobApi.appendLog(
      job,
      `Created draft “${plan.title}” (${created.createdLessonId}) with ${activities.length} activities. Quality: ${quality.ok ? "ok" : quality.issues.join(",")}`,
      quality.ok ? "info" : "warn",
      created.createdLessonId,
    );

    return {
      ok: true,
      resumed: false,
      lr: {
        ...lr,
        lessonId: created.createdLessonId,
        createdLessonId: created.createdLessonId,
        title: plan.title,
        creationBriefComplete: true,
        duplicateCheckComplete: true,
        baseContentComplete: true,
        lessonCreated: true,
        idsVerified: true,
        textComplete: true,
        creationBrief: brief,
        creationIdempotencyKey: brief.idempotencyKey,
        qualityReview: quality,
      },
      plan,
      curriculum: afterCurriculum,
      quality,
    };
  }

  async function processOneLesson(job, lr, index, store, sessionEmail) {
    job.progress.lessonIndex = index;
    job.progress.currentLessonId = lr.lessonId;

    const creating = wantsCreate(job.command);
    let workingLr = lr;
    let curriculum = readSiteCurriculum(store);
    let plan = schema.asArray(curriculum.lessonPlans).find((p) => p.id === workingLr.lessonId);

    if (creating) {
      const ensured = await ensureCreatedLesson(job, workingLr, store, sessionEmail);
      if (!ensured.ok) {
        return {
          ...ensured.lr,
          published: false,
          actions: markSteps(workingLr.actions, schema.asArray(workingLr.actions).map((a) => a.type), "failed", {
            error: ensured.code || "create_failed",
            retryable: ensured.code !== "POSSIBLE_DUPLICATE" && ensured.code !== "NEEDS_OWNER_INPUT",
          }),
        };
      }
      workingLr = ensured.lr;
      plan = ensured.plan;
      curriculum = ensured.curriculum;
      job.progress.currentLessonId = workingLr.lessonId;
      // Persist createdLessonId on job before kit steps (resume safety)
      job.lessonResults = schema.asArray(job.lessonResults).map((row, i) => (
        i === index ? { ...row, ...workingLr } : row
      ));
      // Use created lesson identity for the rest of this function (kit finish).
      lr = workingLr;
    }

    if (!plan) {
      jobApi.appendLog(job, `Lesson not found: ${lr.lessonId}`, "error", lr.lessonId);
      return {
        ...lr,
        status: "failed",
        error: "Lesson plan not found.",
        actions: markSteps(lr.actions, schema.asArray(lr.actions).map((a) => a.type), "failed", {
          error: "lesson_not_found",
        }),
      };
    }

    const upgrade = wantsUpgrade(job.command);
    const images = wantsImages(job.command);
    const printables = wantsPrintables(job.command);
    const songsBooks = wantsSongsBooks(job.command);
    try {
      job.progress.currentAction = "lesson.audit";
      const auditOptions = {
        command: job.command,
        weeklyFieldScope: job.command?.actions?.weeklyFieldScope,
        explicitVocabularyRepair: lessonRead.commandRequestsVocabularyRepair(job.command),
      };
      const before = auditOneLesson(plan, curriculum, auditOptions);
      if (!before.verification.ok) {
        return {
          ...workingLr,
          title: plan.title,
          status: "failed",
          audit: before.audit,
          verification: before.verification,
          beforeScores: before.audit.scores,
          error: "Pre-upgrade audit verification failed.",
          ownerReviewStatus: "BLOCKED",
          actions: markSteps(workingLr.actions, ["lesson.get", "lesson.audit", "asset.plan", "teachingKit.score", "lesson.create", "lesson.validate"], "failed", {
            error: "verification_failed",
          }),
        };
      }

      job.costCounters.lessonsAudited = (job.costCounters.lessonsAudited || 0) + 1;

      const phaseNum = Number(job.command?.completion?.phase) || Number(job.phase) || 1;
      const kitScope = orchestrator.normalizeKitScopeFlags(job.command.actions || {});
      const mutationAllowlist = getJobMutationAllowlist(job);
      lr.snapshotUpdatedAt = lr.snapshotUpdatedAt || plan.updatedAt || null;
      const latestPlanRow = schema.asArray(readSiteCurriculum(store).lessonPlans).find((p) => p.id === plan.id);
      if (allowlistApi.detectStaleLessonVersion(lr.snapshotUpdatedAt, latestPlanRow?.updatedAt)) {
        return {
          ...lr,
          title: plan.title,
          status: "failed",
          error: "STALE_LESSON_VERSION — lesson changed since job snapshot; refusing content mutation.",
          ownerReviewStatus: "BLOCKED",
          actions: markSteps(lr.actions, schema.asArray(lr.actions).map((a) => a.type), "failed", {
            error: "stale_lesson_version",
            retryable: false,
          }),
        };
      }
      const workPlan = orchestrator.buildFullKitWorkPlan({
        plan,
        audit: before.audit,
        kitScope,
        command: job.command,
      });
      let coverPlan = null;
      if (job.command.actions?.connectedUpgrade) {
        coverPlan = connectedUpgradeApi.buildCoverPlan(plan, curriculum, { command: job.command });
        workPlan.coverPlan = coverPlan;
        workPlan.cover = coverPlan.decision === "GENERATE"
          ? "GENERATE_REALISTIC_LESSON_COVER"
          : (coverPlan.decision === "REPLACE" || coverPlan.decision === "REPLACE_REQUESTED"
            ? "REPLACE_WITH_ACTIVITY_IMAGE"
            : "KEEP_EXISTING");
      }
      jobApi.appendLog(job, `Work plan for “${plan.title}”: ${orchestrator.summarizeWorkPlanForOwner(workPlan).split("\n").slice(1, 4).join(" · ")}`, "info", plan.id);

      let workingPlan = plan;
      let historyId = null;
      let kept = (before.audit.weeklyContent || []).filter((f) => f.decision === "KEEP").map((f) => f.field);
      let updated = [];
      let intended = null;
      let aiUsage = null;
      let composerDiagnostics = null;
      let upgradeVerification = null;
      let ownerReviewStatus = creating ? "PARTIAL" : "AUDIT_ONLY";
      let afterScores = before.audit.scores;
      let auditAfter = before.audit;
      let textComplete = lr.textComplete === true || creating;
      let textOk = true;
      let textRan = false;

      // --- Phase 2.5 text upgrade (optional; skipped for Phase 7 create — base content already written) ---
      if (upgrade && !textComplete) {
        textRan = true;
        job.progress.currentAction = "lesson.updateFields";
        if (typeof callOperatorAi !== "function") {
          jobApi.appendLog(job, "AI composer unavailable — refusing deterministic filler.", "error", plan.id);
          return {
            ...lr,
            title: plan.title,
            status: "failed",
            audit: before.audit,
            verification: before.verification,
            beforeScores: before.audit.scores,
            afterScores: before.audit.scores,
            workPlan,
            kitScope,
            error: "Structured AI composer is not configured.",
            ownerReviewStatus: "BLOCKED",
            published: false,
            textComplete: false,
            actions: markSteps(lr.actions, schema.asArray(lr.actions).map((a) => a.type), "failed", {
              error: "ai_composer_unavailable",
              retryable: true,
            }),
          };
        }

        const built = await upgradeApi.buildUpgradeDraft(plan, curriculum, before.audit, {
          upgradeLesson: job.command.actions.upgradeLesson !== false,
          upgradeActivities: job.command.actions.upgradeActivities !== false,
          // Phase 6: songs/books owned by Phase 5 step when enabled
          touchSongs: songsBooks ? false : (job.command.actions.touchSongs !== false && job.command.actions.checkSongs !== false),
          touchBooks: songsBooks ? false : (job.command.actions.touchBooks !== false && job.command.actions.checkBooks !== false),
          editedBy: sessionEmail || (phaseNum >= 6 ? "curriculum-operator-phase6" : "curriculum-operator-phase25"),
          callAi: callOperatorAi,
          command: job.command,
          weeklyFieldScope: job.command?.actions?.weeklyFieldScope,
          mutationAllowlist,
        });

        if (schema.asArray(built.mutationViolations).length) {
          appendMutationViolationsToLessonResult(job, plan.id, built.mutationViolations);
        }

        if (built.usage?.calls) {
          job.costCounters.openaiCalls = (job.costCounters.openaiCalls || 0) + Number(built.usage.calls || 0);
        }
        aiUsage = built.usage || null;
        composerDiagnostics = built.composerDiagnostics || null;

        if (built.aiFailed) {
          jobApi.appendLog(
            job,
            `AI composer failed for “${plan.title}”: ${built.error}. Draft unchanged.`,
            "error",
            plan.id,
          );
          return {
            ...lr,
            title: plan.title,
            status: "failed",
            audit: before.audit,
            verification: before.verification,
            beforeScores: before.audit.scores,
            afterScores: before.audit.scores,
            kept: built.kept,
            updated: [],
            workPlan,
            kitScope,
            error: schema.text(built.error, 500),
            ownerReviewStatus: "BLOCKED",
            published: false,
            aiUsage,
            composerDiagnostics,
            textComplete: false,
            actions: markSteps(lr.actions, schema.asArray(lr.actions).map((a) => a.type), "failed", {
              error: built.code || "ai_composer_failed",
              retryable: true,
            }),
          };
        }

        kept = built.kept;
        updated = built.changed;
        intended = built.intended;

        if (built.changed.length) {
          const deferVocabDraft = vocabSurgicalApi.shouldDeferVocabDraftPersist(job.command, mutationAllowlist);
          if (deferVocabDraft) {
            // Vocabulary-only connected auto-apply: stage intended cards only.
            // Surgical apply writes teachingKit.vocabCards + vocabularyWords (and mirrors
            // draft.week.vocabCards) without a broad enrichmentDraft save that would bump
            // operatorPhase / draft updatedAt unnecessarily.
            ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
            upgradeVerification = {
              ok: true,
              checks: [{
                ok: true,
                code: "vocab_surgical_deferred",
                message: "Vocabulary staged for surgical connected auto-apply; intermediate draft persist deferred.",
              }],
            };
            jobApi.appendLog(
              job,
              `Vocabulary staged for surgical connected auto-apply on “${plan.title}” (intermediate draft not written). NOT published.`,
              "info",
              plan.id,
            );
          } else {
          job.progress.currentAction = "lesson.saveDraft";
          const saveResult = await saveDraftGuarded({
            job,
            store,
            lessonPlanId: plan.id,
            enrichmentDraft: built.enrichmentDraft,
            adminEmail: sessionEmail,
            beforePlan: plan,
            stage: "textUpgrade.save",
          });
          if (!saveResult?.ok) {
            throw new Error(saveResult?.error || "enrichment_draft save failed");
          }
          historyId = saveResult.versionId || null;
          workingPlan = saveResult.lessonPlan;
          Object.assign(store, readStore());
          const afterCurriculum = readSiteCurriculum(store);
          job.progress.currentAction = "lesson.validate";
          const after = auditOneLesson(workingPlan, afterCurriculum);
          auditAfter = after.audit;
          afterScores = after.audit.scores;
          upgradeVerification = upgradeApi.verifyUpgradeResult({
            beforePlan: plan,
            afterPlan: workingPlan,
            intended: built.intended,
            changed: built.changed,
            keepSnapshots: built.keepSnapshots,
          });
          ownerReviewStatus = upgradeApi.classifyOwnerReviewStatus({
            beforeScores: before.audit.scores,
            afterScores: after.audit.scores,
            verification: upgradeVerification,
            blockers: after.audit.teachingKitBlockers,
          });
          if (!upgradeVerification.ok) {
            textOk = false;
            jobApi.appendLog(job, `Post-save text verification failed for “${plan.title}”.`, "warn", plan.id);
            return {
              ...lr,
              title: plan.title,
              status: "failed",
              preSnapshotHistoryId: historyId,
              audit: before.audit,
              auditAfter,
              verification: after.verification,
              upgradeVerification,
              beforeScores: before.audit.scores,
              afterScores,
              kept,
              updated,
              intended: built.intended,
              generated: [],
              workPlan,
              kitScope,
              ownerReviewStatus: "BLOCKED",
              readyForReview: false,
              published: false,
              aiUsage,
              textComplete: false,
              error: "Post-save verification failed.",
              actions: markSteps(lr.actions, schema.asArray(lr.actions).map((a) => a.type), "failed", {
                error: "upgrade_verification_failed",
                retryable: true,
              }),
            };
          }
          jobApi.appendLog(
            job,
            `Upgraded “${plan.title}” draft via structured AI — ${before.audit.scores?.premiumReadinessPercent}% → ${afterScores?.premiumReadinessPercent}% · ${ownerReviewStatus}. NOT published.`,
            "info",
            plan.id,
          );
          }
        } else {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
          jobApi.appendLog(job, `No draft text changes needed for “${plan.title}”.`, "info", plan.id);
        }
        textComplete = true;
      } else if (upgrade && textComplete) {
        jobApi.appendLog(job, `Skipping text upgrade for “${plan.title}” (already complete).`, "info", plan.id);
      }

      // --- Phase 5 songs + books BEFORE assets (Phase 6 order) ---
      let songActions = schema.asArray(lr.songActions);
      let bookActions = schema.asArray(lr.bookActions);
      let songCounts = lr.songCounts || null;
      let bookCounts = lr.bookCounts || null;
      let songsBooksComplete = lr.songsBooksComplete === true;
      let songsBooksError = null;
      let songsBooksOk = true;
      let songsBooksRan = false;

      if (songsBooks && !songsBooksComplete) {
        if (!allowlistApi.phaseAllowed("songs", mutationAllowlist)
          && !allowlistApi.phaseAllowed("books", mutationAllowlist)) {
          songsBooksComplete = true;
          jobApi.appendLog(job, `Songs/books skipped for “${plan.title}” — excluded by mutation allowlist.`, "info", plan.id);
        } else {
        songsBooksRan = true;
        job.progress.currentAction = "song.audit";
        const sbAuditSource = auditOneLesson(workingPlan, readSiteCurriculum(store));
        const sbResult = await runSongsBooksForLesson(
          job,
          workingPlan,
          sbAuditSource.audit,
          store,
          sessionEmail,
          lr,
        );

        songActions = sbResult.songBookRun.songActions || [];
        bookActions = sbResult.songBookRun.bookActions || [];
        songCounts = sbResult.counts?.songCounts || null;
        bookCounts = sbResult.counts?.bookCounts || null;
        songsBooksComplete = sbResult.ok || sbResult.partial;
        songsBooksOk = Boolean(sbResult.ok);
        if (sbResult.historyId) historyId = sbResult.historyId;
        workingPlan = sbResult.afterPlan;
        const finalAudit = auditOneLesson(workingPlan, readSiteCurriculum(store));
        auditAfter = finalAudit.audit;
        afterScores = finalAudit.audit.scores;
        if (!sbResult.ok) {
          songsBooksError = sbResult.error || "One or more song/book actions failed.";
          ownerReviewStatus = "PARTIAL";
        } else if (!upgrade && !images && !printables) {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
        } else if (ownerReviewStatus === "AUDIT_ONLY") {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
        }
        jobApi.appendLog(
          job,
          `Songs/books for “${plan.title}”: songs KEEP ${songCounts?.KEEP || 0} · ADD ${songCounts?.ADD || 0} · IMPROVE ${songCounts?.IMPROVE || 0} · books KEEP ${bookCounts?.KEEP || 0} · ADD ${bookCounts?.ADD || 0} · IMPROVE_GUIDE ${bookCounts?.IMPROVE_GUIDE || 0}.`,
          sbResult.ok ? "info" : "warn",
          plan.id,
        );
        }
      } else if (songsBooks && songsBooksComplete) {
        jobApi.appendLog(job, `Skipping songs/books for “${plan.title}” (already complete).`, "info", plan.id);
      }

      // --- Phase 3 activity images (optional; uses post-text/post-song stored content) ---
      let imageActions = schema.asArray(lr.imageActions);
      let imageBudgetDiagnostics = lr.imageBudgetDiagnostics || null;
      let imageCounts = lr.imageCounts || null;
      let imagesComplete = lr.imagesComplete === true;
      let imageError = null;
      let imagesOk = true;
      let imagesRan = false;

      if (images && !imagesComplete) {
        if (!allowlistApi.phaseAllowed("images", mutationAllowlist)) {
          imagesComplete = true;
          jobApi.appendLog(job, `Images skipped for “${plan.title}” — excluded by mutation allowlist.`, "info", plan.id);
        } else {
        imagesRan = true;
        job.progress.currentAction = "image.inspect";
        const imageAuditSource = auditOneLesson(workingPlan, readSiteCurriculum(store));
        const imageResult = await runImagesForLesson(
          job,
          workingPlan,
          imageAuditSource.audit,
          store,
          sessionEmail,
          lr,
        );

        if (imageResult.scopeReview) {
          jobApi.appendLog(job, `Image scope review required: ${imageResult.error}`, "warn", plan.id);
          return {
            ...lr,
            title: plan.title,
            status: "failed",
            audit: before.audit,
            auditAfter: imageAuditSource.audit,
            verification: before.verification,
            beforeScores: before.audit.scores,
            afterScores: imageAuditSource.audit.scores,
            kept,
            updated,
            workPlan,
            kitScope,
            textComplete,
            songsBooksComplete: songsBooks ? songsBooksComplete : undefined,
            songActions,
            bookActions,
            songCounts,
            bookCounts,
            imageActions: imageResult.imageRun?.actions || [],
            imageCounts: imageResult.imageRun?.counts || null,
            imageBudgetDiagnostics: imageResult.imageBudgetDiagnostics
              || imageResult.imageRun?.imageBudgetDiagnostics
              || null,
            imagesComplete: false,
            error: schema.text(imageResult.error, 500),
            ownerReviewStatus: "BLOCKED",
            published: false,
            aiUsage,
            code: "SCOPE_REVIEW_REQUIRED",
            actions: markSteps(lr.actions, ["image.inspect", "image.generate", "image.upload", "image.attachToActivity"], "failed", {
              error: "SCOPE_REVIEW_REQUIRED",
              retryable: false,
            }),
          };
        }

        imageActions = imageResult.imageRun.actions;
        imageCounts = imageResult.counts;
        imageBudgetDiagnostics = imageResult.imageBudgetDiagnostics
          || imageResult.imageRun?.imageBudgetDiagnostics
          || null;
        imagesComplete = imageResult.ok || imageResult.partial;
        imagesOk = Boolean(imageResult.ok);
        if (imageResult.historyId) historyId = imageResult.historyId;
        workingPlan = imageResult.afterPlan;
        const finalAudit = auditOneLesson(workingPlan, readSiteCurriculum(store));
        auditAfter = finalAudit.audit;
        afterScores = finalAudit.audit.scores;
        if (!imageResult.ok) {
          imageError = "One or more image actions failed (existing images preserved).";
          ownerReviewStatus = "PARTIAL";
        } else if (!upgrade && !songsBooks && !printables) {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
        } else if (ownerReviewStatus === "AUDIT_ONLY") {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
        }
        if (imageBudgetDiagnostics?.imageBudgetApplied) {
          jobApi.appendLog(
            job,
            `Image soft budget applied: ${imageBudgetDiagnostics.imageCandidatesTotal} candidates → budget ${imageBudgetDiagnostics.imageBudget}; deferred ${schema.asArray(imageBudgetDiagnostics.budgetDeferredActivityIds).length}.`,
            "info",
            plan.id,
          );
        }
        jobApi.appendLog(
          job,
          `Images for “${plan.title}”: KEEP ${imageCounts.KEEP || 0} · GENERATED/REPLACED ${imageCounts.SUCCESS || 0} · NOT_NEEDED ${imageCounts.NOT_NEEDED || 0} · FAILED ${imageCounts.FAILED || 0}.`,
          imageResult.ok ? "info" : "warn",
          plan.id,
        );
        }
      } else if (images && imagesComplete) {
        jobApi.appendLog(job, `Skipping images for “${plan.title}” (already complete).`, "info", plan.id);
      }

      // --- Phase 4 printables ---
      let printableActions = schema.asArray(lr.printableActions);
      let printableCounts = lr.printableCounts || null;
      let printableBudgetDiagnostics = lr.printableBudgetDiagnostics || null;
      let printablesComplete = lr.printablesComplete === true;
      let printableError = null;
      let printablesOk = true;
      let printablesRan = false;

      if (printables && !printablesComplete) {
        if (!allowlistApi.phaseAllowed("printables", mutationAllowlist)) {
          printablesComplete = true;
          jobApi.appendLog(job, `Printables skipped for “${plan.title}” — excluded by mutation allowlist.`, "info", plan.id);
        } else {
        printablesRan = true;
        job.progress.currentAction = "printable.plan";
        const printableAuditSource = auditOneLesson(workingPlan, readSiteCurriculum(store));
        const printableResult = await runPrintablesForLesson(
          job,
          workingPlan,
          printableAuditSource.audit,
          store,
          sessionEmail,
          lr,
        );

        if (printableResult.scopeReview) {
          jobApi.appendLog(job, `Printable scope review required: ${printableResult.error}`, "warn", plan.id);
          return {
            ...lr,
            title: plan.title,
            status: "failed",
            audit: before.audit,
            auditAfter: printableAuditSource.audit,
            beforeScores: before.audit.scores,
            afterScores: printableAuditSource.audit.scores,
            kept,
            updated,
            workPlan,
            kitScope,
            textComplete,
            songsBooksComplete: songsBooks ? songsBooksComplete : undefined,
            songActions,
            bookActions,
            songCounts,
            bookCounts,
            imageActions,
            imageCounts,
            imageBudgetDiagnostics,
            imagesComplete: images ? imagesComplete : undefined,
            printableActions: printableResult.printableRun?.actions || [],
            printableCounts: printableResult.printableRun?.counts || null,
            printableBudgetDiagnostics: printableResult.printableBudgetDiagnostics
              || printableResult.printableRun?.printableBudgetDiagnostics
              || null,
            printablesComplete: false,
            error: schema.text(printableResult.error, 500),
            ownerReviewStatus: "BLOCKED",
            published: false,
            aiUsage,
            code: "SCOPE_REVIEW_REQUIRED",
            actions: markSteps(lr.actions, ["printable.plan", "printable.generatePages", "printable.upload", "printable.attach"], "failed", {
              error: "SCOPE_REVIEW_REQUIRED",
              retryable: false,
            }),
          };
        }

        printableActions = printableResult.printableRun.actions;
        printableCounts = printableResult.counts;
        printableBudgetDiagnostics = printableResult.printableBudgetDiagnostics
          || printableResult.printableRun?.printableBudgetDiagnostics
          || null;
        printablesComplete = printableResult.ok || printableResult.partial;
        printablesOk = Boolean(printableResult.ok);
        workingPlan = printableResult.afterPlan;
        const finalAudit = auditOneLesson(workingPlan, readSiteCurriculum(store));
        auditAfter = finalAudit.audit;
        afterScores = finalAudit.audit.scores;
        if (!printableResult.ok) {
          printableError = printableResult.error || "One or more printable actions failed (existing resources preserved).";
          ownerReviewStatus = "PARTIAL";
        } else if (!upgrade && !images && !songsBooks) {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
        } else if (ownerReviewStatus === "AUDIT_ONLY") {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
        }
        if (printableBudgetDiagnostics?.printableBudgetApplied) {
          jobApi.appendLog(
            job,
            `Printable soft budget applied: ${printableBudgetDiagnostics.plannedPackCountBeforeBudget} packs / ~${printableBudgetDiagnostics.estimatedPageCountBeforeBudget} pages → soft ${printableBudgetDiagnostics.printableSoftPackBudget} packs / ${printableBudgetDiagnostics.printableSoftPageBudget} pages; deferred ${schema.asArray(printableBudgetDiagnostics.deferredPrintableCandidateIds).length}.`,
            "info",
            plan.id,
          );
        }
        jobApi.appendLog(
          job,
          `Printables for “${plan.title}”: KEEP ${printableCounts.KEEP || 0} · CREATE ${printableCounts.CREATE || 0} · REPLACE ${printableCounts.REPLACE || 0} · NOT NEEDED ${printableCounts.NOT_NEEDED || 0} · FAILED ${printableCounts.FAILED || 0}.`,
          printableResult.ok ? "info" : "warn",
          plan.id,
        );
        }
      } else if (printables && printablesComplete) {
        jobApi.appendLog(job, `Skipping printables for “${plan.title}” (already complete).`, "info", plan.id);
      }

      if (!upgrade && !images && !printables && !songsBooks) {
        jobApi.appendLog(
          job,
          `Audited “${plan.title}” — ${before.audit.currentStatus}.`,
          "info",
          plan.id,
        );
        return {
          ...lr,
          title: plan.title,
          status: "success",
          audit: before.audit,
          verification: before.verification,
          beforeScores: before.audit.scores,
          afterScores: before.audit.scores,
          kept,
          updated: [],
          generated: [],
          workPlan,
          kitScope,
          ownerReviewStatus: "AUDIT_ONLY",
          readyForReview: false,
          published: false,
          actions: markSteps(
            lr.actions,
            ["lesson.get", "lesson.audit", "asset.plan", "teachingKit.score"],
            "success",
            { output: { scores: before.audit.scores } },
          ),
        };
      }

      // Connected upgrade: dedicated REALISTIC_LESSON_COVER generation when explicitly requested.
      if (job.command.actions?.connectedUpgrade && coverPlan?.decision === "GENERATE"
        && allowlistApi.phaseAllowed("cover", mutationAllowlist)) {
        const coverCurriculum = readSiteCurriculum(store);
        const crypto = require("crypto");
        const path = require("path");
        const lessonCoverMedia = require("./lesson-cover-media.js");
        const persistCoverFn = async ({ buffer, mimeType, fileName }) => {
          const id = `lesson-cover-${crypto.randomBytes(16).toString("hex")}`;
          try {
            const storePath = process.env.LLH_STORE_PATH
              || path.join(process.cwd(), "server/data/launch-store.json");
            const dir = lessonCoverMedia.localCoverDirFromStorePath(storePath);
            lessonCoverMedia.writeLocalLessonCover(dir, id, {
              mimeType: mimeType || "image/png",
              buffer,
              fileName: fileName || "lesson-cover.png",
            });
            return { ok: true, id, url: lessonCoverMedia.lessonCoverMediaUrl(id) };
          } catch (error) {
            return { ok: false, code: "cover_persist_failed", error: error.message };
          }
        };
        const generatedCover = await connectedUpgradeApi.runDedicatedLessonCoverGeneration({
          plan: workingPlan,
          curriculum: coverCurriculum,
          coverPlan,
          apiKey: process.env.OPENAI_API_KEY || "",
          mockGenerate: process.env.VISUAL_PRODUCTION_MOCK_GENERATE === "1",
          persistCoverFn,
        });
        if (generatedCover?.ok) {
          coverPlan = generatedCover.coverPlan;
          const currentDraft = workingPlan.enrichmentDraft && typeof workingPlan.enrichmentDraft === "object"
            ? workingPlan.enrichmentDraft
            : {};
          const nextDraft = connectedUpgradeApi.applyCoverToEnrichmentDraft(currentDraft, coverPlan);
          const coverSave = await saveDraftGuarded({
            job,
            store,
            lessonPlanId: plan.id,
            enrichmentDraft: nextDraft,
            adminEmail: sessionEmail,
            beforePlan: workingPlan,
            stage: "cover.save",
          });
          if (coverSave?.ok) {
            Object.assign(store, readStore());
            workingPlan = schema.asArray(readSiteCurriculum(store).lessonPlans).find((p) => p.id === plan.id)
              || workingPlan;
          }
        } else {
          jobApi.appendLog(
            job,
            `Dedicated lesson cover generation skipped/failed: ${schema.text(generatedCover?.error || generatedCover?.code, 240)}`,
            "warn",
            plan.id,
          );
        }
      } else if (job.command.actions?.connectedUpgrade
        && (coverPlan?.decision === "REPLACE" || coverPlan?.decision === "REPLACE_REQUESTED")
        && allowlistApi.phaseAllowed("cover", mutationAllowlist)) {
        const coverCurriculum = readSiteCurriculum(store);
        const currentCoverPlan = coverPlan || connectedUpgradeApi.buildCoverPlan(workingPlan, coverCurriculum, {
          command: job.command,
        });
        if (currentCoverPlan.decision === "REPLACE" || currentCoverPlan.decision === "REPLACE_REQUESTED") {
          const preferIds = schema.asArray(imageActions)
            .filter((a) => a.status === "success")
            .map((a) => a.activityId);
          const best = connectedUpgradeApi.pickBestActivityImageForCover(
            workingPlan,
            coverCurriculum,
            preferIds,
          );
          if (best?.url) {
            coverPlan = {
              ...currentCoverPlan,
              decision: "REPLACE",
              proposedCoverImageUrl: best.url,
              sourceActivityId: best.activityId,
              sourceActivityTitle: best.title,
            };
            const currentDraft = workingPlan.enrichmentDraft && typeof workingPlan.enrichmentDraft === "object"
              ? workingPlan.enrichmentDraft
              : {};
            const nextDraft = connectedUpgradeApi.applyCoverToEnrichmentDraft(currentDraft, coverPlan);
            const coverSave = await saveDraftGuarded({
              job,
              store,
              lessonPlanId: plan.id,
              enrichmentDraft: nextDraft,
              adminEmail: sessionEmail,
              beforePlan: workingPlan,
              stage: "cover.replace.save",
            });
            if (coverSave?.ok) {
              Object.assign(store, readStore());
              workingPlan = schema.asArray(readSiteCurriculum(store).lessonPlans).find((p) => p.id === plan.id)
                || workingPlan;
            }
          } else {
            coverPlan = currentCoverPlan;
          }
        } else {
          coverPlan = currentCoverPlan;
        }
      }

      // Final stored-state reload + Teaching Kit audit (Phase 6)
      Object.assign(store, readStore());
      const reloaded = schema.asArray(readSiteCurriculum(store).lessonPlans).find((p) => p.id === plan.id) || workingPlan;
      workingPlan = reloaded;
      const finalAuditOptions = {
        connectedOperatorPath: job.command?.actions?.connectedUpgrade === true,
        skipWeekdayFocusBlocker: job.command?.actions?.connectedUpgrade === true,
        printablesExcluded: kitScope?.locks?.printables === true,
        printableMutations: Number(printableCounts?.CREATE || 0) + Number(printableCounts?.REPLACE || 0),
        command: job.command,
        weeklyFieldScope: job.command?.actions?.weeklyFieldScope,
        explicitVocabularyRepair: lessonRead.commandRequestsVocabularyRepair(job.command),
      };
      const finalKitAudit = auditOneLesson(workingPlan, readSiteCurriculum(store), finalAuditOptions);
      auditAfter = finalKitAudit.audit;
      afterScores = finalKitAudit.audit.scores;

      const finalVerification = orchestrator.verifyFullKitStoredState({
        beforePlan: plan,
        afterPlan: workingPlan,
        kitScope,
      });
      const partialErrors = [imageError, printableError, songsBooksError].filter(Boolean);
      const criticalBlockers = schema.asArray(finalKitAudit.audit?.teachingKitBlockers)
        .filter((b) => /critical|broken|missing required/i.test(String(b?.message || b || "")));

      if (phaseNum >= 6) {
        ownerReviewStatus = orchestrator.classifyFullKitOwnerReview({
          kitScope,
          textOk: textOk && (upgradeVerification ? upgradeVerification.ok : true),
          textRan: textRan || (upgrade && textComplete) || creating,
          songsBooksOk,
          songsBooksRan: songsBooksRan || (songsBooks && songsBooksComplete),
          imagesOk,
          imagesRan: imagesRan || (images && imagesComplete),
          printablesOk,
          printablesRan: printablesRan || (printables && printablesComplete),
          finalVerificationOk: finalVerification.ok,
          criticalBlockers,
          partialErrors,
        });
        if (creating && lr.qualityReview && lr.qualityReview.ok === false) {
          ownerReviewStatus = ownerReviewStatus === "BLOCKED" ? "BLOCKED" : "PARTIAL";
        }
        if (creating && (!lr.lessonCreated || !lr.idsVerified)) {
          ownerReviewStatus = "BLOCKED";
        }
      }

      const combinedError = imageError || printableError || songsBooksError
        || (!finalVerification.ok ? "Final stored-state verification failed." : null);
      const ok = !combinedError && (upgradeVerification ? upgradeVerification.ok : true) && finalVerification.ok
        && (!creating || (lr.lessonCreated && lr.idsVerified));
      const stepTypes = schema.asArray(lr.actions).map((a) => a.type);
      return {
        ...lr,
        title: plan.title,
        lessonId: plan.id,
        createdLessonId: creating ? (lr.createdLessonId || plan.id) : lr.createdLessonId,
        lessonCreated: creating ? true : lr.lessonCreated,
        idsVerified: creating ? true : lr.idsVerified,
        status: ok || ownerReviewStatus === "PARTIAL" || ownerReviewStatus === "READY_FOR_OWNER_REVIEW"
          ? "success"
          : "failed",
        preSnapshotHistoryId: historyId,
        audit: before.audit,
        auditAfter,
        verification: before.verification,
        upgradeVerification,
        beforeScores: before.audit.scores,
        afterScores,
        kept,
        updated,
        intended,
        generated: [],
        workPlan,
        coverPlan,
        kitScope,
        executionScope: workPlan.executionScope || null,
        lessonReadiness: auditAfter?.lessonReadiness || null,
        reportConsistency: auditAfter?.reportConsistency || null,
        imageActions,
        imageCounts,
        imageBudgetDiagnostics,
        imagesComplete: images ? imagesComplete : undefined,
        printableActions,
        printableCounts,
        printableBudgetDiagnostics,
        printablesComplete: printables ? printablesComplete : undefined,
        songActions,
        bookActions,
        songCounts,
        bookCounts,
        songsBooksComplete: songsBooks ? songsBooksComplete : undefined,
        textComplete: (upgrade || creating) ? textComplete : undefined,
        finalVerification,
        finalVerificationComplete: finalVerification.ok,
        ownerReviewStatus: combinedError && ownerReviewStatus !== "BLOCKED" ? "PARTIAL" : ownerReviewStatus,
        readyForReview: ownerReviewStatus === "READY_FOR_OWNER_REVIEW",
        published: false,
        aiUsage,
        composerDiagnostics,
        error: ok ? null : (combinedError || "Lesson processing incomplete."),
        actions: markSteps(lr.actions, stepTypes, ok || ownerReviewStatus === "PARTIAL" ? "success" : "failed", {
          output: {
            changed: updated.length,
            imageCounts,
            printableCounts,
            songCounts,
            bookCounts,
            ownerReviewStatus,
            published: false,
            historyId,
            createdLessonId: creating ? plan.id : undefined,
          },
          error: ok ? null : (combinedError ? "actions_partial" : "processing_failed"),
          retryable: !ok,
        }),
      };
    } catch (error) {
      jobApi.appendLog(job, `Lesson error: ${error.message}`, "error", lr.lessonId);
      return {
        ...lr,
        title: plan.title,
        status: "failed",
        error: schema.text(error.message, 500),
        ownerReviewStatus: "BLOCKED",
        published: false,
        actions: markSteps(lr.actions, schema.asArray(lr.actions).map((a) => a.type), "failed", {
          error: schema.text(error.message, 300),
          retryable: true,
        }),
      };
    }
  }

  async function runJob(job, store, sessionEmail) {
    job.status = "running";
    const upgrade = wantsUpgrade(job.command);
    const images = wantsImages(job.command);
    const printables = wantsPrintables(job.command);
    const songsBooks = wantsSongsBooks(job.command);
    const create = wantsCreate(job.command);
    const phaseNum = Number(job.command?.completion?.phase) || Number(job.phase) || 1;
    jobApi.appendLog(job, executionScopeApi.buildRunStartLogMessage(job.command));

    const results = [];
    for (let index = 0; index < job.lessonResults.length; index += 1) {
      const lr = job.lessonResults[index];
      const resumeOk = lr.status === "success"
        && (
          (phaseNum >= 6 && lr.finalVerificationComplete
            && (!create || (lr.lessonCreated && lr.idsVerified))
            && (!upgrade || lr.textComplete !== false)
            && (!songsBooks || lr.songsBooksComplete)
            && (!images || lr.imagesComplete)
            && (!printables || lr.printablesComplete)
            && (lr.auditAfter || lr.audit))
          || (phaseNum < 6 && songsBooks && lr.songsBooksComplete && (lr.auditAfter || lr.audit))
          || (phaseNum < 6 && printables && lr.printablesComplete && (lr.auditAfter || lr.audit))
          || (phaseNum < 6 && images && lr.imagesComplete && (lr.auditAfter || lr.audit))
          || (phaseNum < 6 && !images && !printables && !songsBooks && upgrade && lr.auditAfter)
          || (phaseNum < 6 && !images && !printables && !songsBooks && !upgrade && lr.audit)
        );
      if (resumeOk) {
        results.push(lr);
        continue;
      }
      const latest = readStore();
      Object.assign(store, latest);
      // eslint-disable-next-line no-await-in-loop
      const next = await processOneLesson(job, lr, index, store, sessionEmail);
      results.push(next);
      job.lessonResults = results.concat(job.lessonResults.slice(results.length));
      const completed = results.filter((l) => l.status === "success").length;
      const failed = results.filter((l) => l.status === "failed").length;
      job.progress = {
        ...job.progress,
        completed,
        failed,
        skipped: results.filter((l) => l.status === "skipped").length,
        remaining: Math.max(0, job.lessonResults.length - completed - failed),
      };
      const bag = readJobs(store);
      bag.jobs = bag.jobs.map((j) => (j.id === job.id ? jobApi.normalizeOperatorJob(job) : j));
      if (!bag.jobs.some((j) => j.id === job.id)) bag.jobs = [job, ...bag.jobs].slice(0, 100);
      // eslint-disable-next-line no-await-in-loop
      await writeJobs(store, bag);
    }

    job.lessonResults = results;
    const completed = results.filter((l) => l.status === "success").length;
    const failed = results.filter((l) => l.status === "failed").length;
    const allowlist = getJobMutationAllowlist(job);
    const completionEval = allowlistApi.evaluateJobCompletionStatus(results, job.command, allowlist);
    const contentGaps = completionEval.contentGaps
      || results.some((l) => l.contentPersistenceIncomplete === true);
    job.progress = {
      ...job.progress,
      completed,
      failed,
      skipped: results.filter((l) => l.status === "skipped").length,
      remaining: Math.max(0, results.length - completed - failed),
      currentAction: "",
      currentLessonId: "",
    };
    job.status = failed && !completed
      ? "failed"
      : (contentGaps ? "completed_with_gaps" : "completed");
    job.contentPersistenceIncomplete = contentGaps;
    job.ownerSummary = jobApi.buildOwnerSummary(job);
    jobApi.appendLog(
      job,
      `Job ${job.status}. Success ${completed}; failed ${failed}. Publish: NOT PUBLISHED.`,
    );
    job.updatedAt = jobApi.nowIso();
    return job;
  }

  async function tryConnectedAutoApply(job, store, sessionEmail) {
    const applied = [];
    const skipped = [];
    const refreshed = [];
    const actions = job?.command?.actions || {};
    if (actions.planOnly || actions.connectedAutoApply === false) return { applied, skipped, refreshed };
    const autoApplyRequested = actions.connectedAutoApply === true || actions.connectedUpgrade === true;
    if (!autoApplyRequested) return { applied, skipped, refreshed };
    for (let i = 0; i < schema.asArray(job.lessonResults).length; i += 1) {
      const lr = job.lessonResults[i];
      const gate = connectedUpgradeApi.canAutoApplyConnectedEnrichment(lr, job);
      if (!gate.ok) {
        skipped.push({ lessonId: lr.lessonId, ...gate });
        continue;
      }
      if (typeof applyOperatorConnectedEnrichment !== "function") {
        skipped.push({
          lessonId: lr.lessonId,
          ok: false,
          code: "apply_helper_missing",
          message: "Connected apply helper is not configured.",
        });
        continue;
      }
      Object.assign(store, readStore());
      const curriculumBefore = readSiteCurriculum(store);
      const beforePlan = schema.asArray(curriculumBefore.lessonPlans).find((p) => p.id === lr.lessonId) || null;
      if (allowlistApi.detectStaleLessonVersion(lr.snapshotUpdatedAt, beforePlan?.updatedAt)) {
        skipped.push({
          lessonId: lr.lessonId,
          ok: false,
          code: "STALE_LESSON_VERSION",
          message: "Lesson changed since job snapshot; connected auto-apply blocked.",
        });
        continue;
      }
      const mutationAllowlist = getJobMutationAllowlist(job);
      const result = await applyOperatorConnectedEnrichment({
        store,
        lessonPlanId: lr.lessonId,
        adminEmail: sessionEmail,
        operatorJobId: job.id,
        mutationAllowlist,
        lessonResult: lr,
        command: job.command || null,
      });
      if (result?.ok) {
        applied.push({ lessonId: lr.lessonId, ...result });
        Object.assign(store, readStore());
        const curriculum = readSiteCurriculum(store);
        const reloadedPlan = schema.asArray(curriculum.lessonPlans).find((p) => p.id === lr.lessonId);
        if (reloadedPlan) {
          const requestedFieldSuccess = schema.asArray(lr.composerDiagnostics?.accepted)
            .filter((row) => row.scope === "week" && row.field)
            .map((row) => ({ field: row.field, action: row.action || "SUCCESS" }));
          const nextLr = connectedUpgradeApi.refreshLessonResultPostApply(lr, reloadedPlan, curriculum, {
            command: job.command,
            beforePlan: beforePlan || {},
            requestedFieldSuccess,
            printablesExcluded: lr.kitScope?.locks?.printables === true,
            printableMutations: 0,
            mutationAllowlist,
          });
          nextLr.proposedChanges = schema.asArray(lr.updated).slice();
          nextLr.persistedChanges = schema.asArray(nextLr.persistedDiff);
          nextLr.updated = nextLr.persistedChanges;
          if (nextLr.contentPersistenceIncomplete) {
            nextLr.ownerReviewStatus = nextLr.ownerReviewStatus === "BLOCKED"
              ? "BLOCKED"
              : "PARTIAL";
          }
          job.lessonResults[i] = nextLr;
          refreshed.push({
            lessonId: lr.lessonId,
            lessonReadiness: nextLr.lessonReadiness,
            persistenceMismatches: nextLr.persistenceMismatches,
          });
        }
      } else {
        skipped.push({ lessonId: lr.lessonId, ...result });
      }
    }
    return { applied, skipped, refreshed };
  }

  async function handle(request, response) {
    const body = await readJson(request);
    const session = requireOwner(request, body, response);
    if (!session) return;

    const store = readStore();
    if (!requireFlag(store, response)) return;

    const action = schema.text(body.action, 40).toLowerCase() || "list";
    if (!ACTIONS.includes(action)) {
      jsonResponse(response, 400, { error: "Unknown operator action.", code: "unknown_action", actions: ACTIONS });
      return;
    }

    const phase = schema.clampInt(body.phase, 1, 8, 7);
    const curriculum = typeof readSiteCurriculum === "function"
      ? readSiteCurriculum(store)
      : (store.siteContent?.curriculum || { lessonPlans: [], activities: [], resources: [] });

    if (action === "connected_plan") {
      const lessonId = schema.text(body.lessonId, 160);
      if (!lessonId) {
        jsonResponse(response, 400, {
          ok: false,
          code: "lesson_id_required",
          error: "lessonId required.",
        });
        return;
      }
      const bundle = connectedUpgradeApi.buildConnectedUpgradePlan(curriculum, lessonId);
      if (!bundle.ok) {
        jsonResponse(response, 404, { ok: false, ...bundle });
        return;
      }
      jsonResponse(response, 200, {
        ok: true,
        action,
        lessonId: bundle.lessonId,
        title: bundle.title,
        accessPlan: bundle.accessPlan,
        ownerPlan: connectedUpgradeApi.summarizePlanForOwner(bundle),
        workPlan: bundle.workPlan,
        coverPlan: bundle.coverPlan,
        ownerSummary: bundle.ownerSummary,
        publishEnabled: false,
        autoPublish: false,
      });
      return;
    }

    if (action === "connected_run") {
      const lessonId = schema.text(body.lessonId, 160);
      if (!lessonId) {
        jsonResponse(response, 400, {
          ok: false,
          code: "lesson_id_required",
          error: "lessonId required.",
        });
        return;
      }
      if (body.planAcknowledged !== true) {
        jsonResponse(response, 409, {
          ok: false,
          code: "plan_ack_required",
          error: "Review the upgrade plan and confirm before running.",
        });
        return;
      }
      const bundle = connectedUpgradeApi.buildConnectedUpgradePlan(curriculum, lessonId);
      if (!bundle.ok) {
        jsonResponse(response, 404, { ok: false, ...bundle });
        return;
      }
      const command = {
        ...bundle.command,
        confirmations: {
          ...(bundle.command.confirmations || {}),
          planAcknowledged: true,
        },
      };
      const selection = selectApi.selectLessons(curriculum, command);
      const planSummary = buildPlanSummary(command, selection);
      let job = jobApi.createJobFromPlan({
        command,
        planSummary,
        createdBy: session.email,
        status: "running",
      });
      job.connectedPlan = connectedUpgradeApi.summarizePlanForOwner(bundle);
      const bag = readJobs(store);
      bag.jobs = [job, ...bag.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
      await writeJobs(store, bag);
      job = await runJob(job, store, session.email);
      const bag2 = readJobs(store);
      bag2.jobs = [job, ...bag2.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
      await writeJobs(store, bag2);
      await writeStoreAsync(store);
      const autoApply = await tryConnectedAutoApply(job, store, session.email);
      if (autoApply.applied.length) await writeStoreAsync(store);
      jsonResponse(response, 200, {
        ok: true,
        action,
        lessonId: bundle.lessonId,
        title: bundle.title,
        job,
        connectedPlan: job.connectedPlan || connectedUpgradeApi.summarizePlanForOwner(bundle),
        autoApply,
        publishEnabled: false,
        published: false,
        autoPublish: false,
      });
      return;
    }

    if (action === "parse") {
      const parsed = commandApi.parseOperatorCommand(body.command || body.rawCommand || "", {
        currentlySelectedLessonId: body.currentlySelectedLessonId,
        phase,
        lessonPlans: schema.asArray(curriculum?.lessonPlans),
      });
      jsonResponse(response, 200, {
        ok: true,
        action,
        ...parsed,
        publishEnabled: false,
      });
      return;
    }

    if (action === "plan" || action === "run") {
      const parsed = body.command && typeof body.command === "object"
        ? {
          command: schema.normalizeOperatorCommand(body.command, { phase }),
          needsConfirmation: body.forceConfirm === true,
          confirmReasons: schema.asArray(body.command?.confirmations?.reasons),
          ambiguous: false,
        }
        : commandApi.parseOperatorCommand(body.command || body.rawCommand || "", {
          currentlySelectedLessonId: body.currentlySelectedLessonId,
          phase,
          lessonPlans: schema.asArray(curriculum?.lessonPlans),
        });

      let command = parsed.command;
      if (!command.rawCommand && !(command.scope.lessonIds?.length || command.scope.titles?.length)
        && !wantsCreate(command)) {
        jsonResponse(response, 400, {
          error: "Provide a natural-language command or typed command schema.",
          code: "command_required",
        });
        return;
      }

      if (action === "run" && allowlistApi.isRunBlockedByConfirmations(parsed.confirmReasons, parsed.parseSafety)) {
        jsonResponse(response, 409, {
          ok: false,
          code: parsed.parseSafety?.blocked ? "PARSED_INTENT_CONTRADICTION" : "RUN_BLOCKED",
          error: "Dangerous interpretation — Run is blocked until scope/contradiction issues are resolved.",
          command,
          confirmReasons: parsed.confirmReasons || [],
          parseSafety: parsed.parseSafety || null,
          runBlocked: true,
          needsConfirmation: true,
        });
        return;
      }

      if (action === "run") {
        const revalidated = allowlistApi.revalidateRunScope(command, {
          phase,
          lessonPlans: schema.asArray(curriculum?.lessonPlans),
          currentlySelectedLessonId: body.currentlySelectedLessonId,
        });
        if (!revalidated.ok) {
          jsonResponse(response, 409, {
            ok: false,
            code: revalidated.code || "RUN_BLOCKED",
            error: "Run blocked by pre-mutation safety revalidation.",
            command: revalidated.reparsed?.command || command,
            confirmReasons: revalidated.reparsed?.confirmReasons || parsed.confirmReasons || [],
            parseSafety: revalidated.reparsed?.parseSafety || parsed.parseSafety || null,
            runBlocked: true,
          });
          return;
        }
        parsed.command = revalidated.command;
        command = revalidated.command;
      }

      if (command.actions.publish || command.completion.publish) {
        parsed.needsConfirmation = true;
        parsed.confirmReasons = [...new Set([...(parsed.confirmReasons || []), "publish_requested"])];
      }

      if (schema.asArray(parsed.confirmReasons).includes("scope_review_required")) {
        parsed.needsConfirmation = true;
      }

      let selection;
      if (wantsCreate(command)) {
        const inheritParent = parsed.ownerIntent?.inheritFromLesson
          ? schema.asArray(curriculum?.lessonPlans).find((p) => p.id === parsed.ownerIntent.inheritFromLesson.lessonId)
          : null;
        const briefResult = createApi.parseCreationBrief(command.rawCommand || "", {
          defaultAccessPlan: inheritParent?.plan === "Pro" ? "Pro" : (parsed.ownerIntent?.inheritFromLesson?.accessPlan || "Free"),
          parentLesson: inheritParent || undefined,
          ageBand: parsed.ownerIntent?.inheritFromLesson?.ageBand || undefined,
        });
        if (!briefResult.ok) {
          const ageOnly = (briefResult.needsOwnerInput || []).length === 1
            && briefResult.needsOwnerInput[0] === "age_band";
          const ownerInput = ageOnly
            ? printableAgeBand.buildPrintableAgeBandOwnerInputError({
              debug: {
                lessonId: null,
                lessonTitle: briefResult.brief?.title || null,
                rawAgeFields: printableAgeBand.pickRawAgeFields(null),
                acceptedAgeBands: printableAgeBand.SUPPORTED_AGE_BANDS,
                reason: "creation_brief_missing_age_band",
              },
            })
            : null;
          jsonResponse(response, 409, {
            ok: false,
            code: "NEEDS_OWNER_INPUT",
            error: `Needs owner input: ${(briefResult.needsOwnerInput || []).join(", ")}`,
            command,
            needsOwnerInput: briefResult.needsOwnerInput,
            creationBrief: briefResult.brief,
            ...(ownerInput ? { ageBandDebug: ownerInput } : {}),
          });
          return;
        }
        const dup = createApi.findCreationDuplicates(briefResult.brief, curriculum);
        if (!dup.ok) {
          const ack = body.confirmDuplicate === true
            || /\b(separate|anyway|still create|force create|not a duplicate)\b/i.test(command.rawCommand || "");
          if (!ack && !body.confirm) {
            parsed.needsConfirmation = true;
            parsed.confirmReasons = [...new Set([...(parsed.confirmReasons || []), "possible_duplicate"])];
            jsonResponse(response, 409, {
              ok: false,
              code: "POSSIBLE_DUPLICATE",
              error: dup.message,
              command,
              creationBrief: briefResult.brief,
              duplicateMatches: dup.matches,
              duplicateLevel: dup.level,
              needsConfirmation: true,
              confirmReasons: parsed.confirmReasons,
            });
            return;
          }
        }
        // Cost/scope: single lesson create only; large activity targets still ok within clamp
        const estimatedCalls = 2
          + (wantsSongsBooks(command) ? 2 : 0)
          + (wantsImages(command) ? Math.min(briefResult.brief.activityTarget || 12, command.limits.maxImageGenerations) : 0)
          + (wantsPrintables(command) ? Math.min(8, command.limits.maxPrintableGenerations) : 0);
        if (estimatedCalls > command.limits.maxOpenAiCalls) {
          jsonResponse(response, 409, {
            ok: false,
            code: "SCOPE_REVIEW_REQUIRED",
            error: "Planned create job exceeds OpenAI call budget.",
            needsConfirmation: true,
            confirmReasons: ["unexpectedly_large_scope"],
          });
          return;
        }
        selection = {
          selected: [{
            id: "pending-create",
            title: briefResult.brief.title,
            theme: briefResult.brief.theme,
            age: briefResult.brief.ageLabel,
            ageBand: briefResult.brief.ageBand,
            plan: briefResult.brief.accessPlan,
            readinessPercent: 0,
            completionPercent: 0,
            creationBrief: briefResult.brief,
            creationIdempotencyKey: briefResult.brief.idempotencyKey,
          }],
          selectionNote: `Create new draft lesson “${briefResult.brief.title}” (${briefResult.brief.ageBand}, ${briefResult.brief.accessPlan}, ${briefResult.brief.activityTarget} activities).`,
          candidatesConsidered: schema.asArray(curriculum.lessonPlans).length,
          unresolvedTitles: [],
          ambiguous: false,
          creationBrief: briefResult.brief,
          pendingCreateId: "pending-create",
        };
      } else {
        selection = selectApi.selectLessons(curriculum, command, {
          currentlySelectedLessonId: body.currentlySelectedLessonId,
        });
        if (selection.ambiguous || !selection.selected.length) {
          jsonResponse(response, 409, {
            ok: false,
            code: selection.selected.length ? "ambiguous_scope" : "no_lessons_selected",
            error: selection.selected.length
              ? "Command scope is ambiguous. Narrow the request."
              : (selection.selectionNote || "No lessons matched this command."),
            command,
            selection,
            needsConfirmation: true,
            confirmReasons: ["ambiguous_scope"],
          });
          return;
        }
      }

      if (selection.selected.length > command.limits.hardMaxLessons) {
        jsonResponse(response, 409, {
          ok: false,
          code: "unexpectedly_large_scope",
          error: `Scope exceeds hard max of ${command.limits.hardMaxLessons} lessons.`,
          needsConfirmation: true,
          confirmReasons: ["unexpectedly_large_scope"],
        });
        return;
      }

      const planSummary = buildPlanSummary(command, selection);
      planSummary.needsConfirmation = Boolean(parsed.needsConfirmation);
      planSummary.confirmReasons = parsed.confirmReasons || [];

      const scopeContradiction = executionScopeApi.detectPlannedScopeContradiction(command, planSummary);
      if (scopeContradiction.blocked) {
        jsonResponse(response, 409, {
          ok: false,
          code: "PLANNED_SCOPE_CONTRADICTION",
          error: "Execution plan contradicts parsed weekly scope. Re-interpret before Run.",
          command,
          planSummary,
          contradictions: scopeContradiction.contradictions,
          confirmReasons: [...new Set([...(parsed.confirmReasons || []), ...scopeContradiction.confirmReasons])],
          runBlocked: true,
        });
        return;
      }

      const mustConfirm = planSummary.needsConfirmation
        && !body.confirm
        && (planSummary.confirmReasons.includes("ambiguous_scope")
          || planSummary.confirmReasons.includes("unexpectedly_large_scope")
          || planSummary.confirmReasons.includes("publish_requested")
          || planSummary.confirmReasons.includes("scope_review_required")
          || planSummary.confirmReasons.includes("possible_duplicate"));

      if (action === "plan" || mustConfirm) {
        const planned = jobApi.createJobFromPlan({
          command,
          planSummary,
          createdBy: session.email,
          status: mustConfirm ? "awaiting_confirm" : "planned",
        });
        if (action === "plan" || (action === "run" && mustConfirm)) {
          const bag = readJobs(store);
          bag.jobs = [planned, ...bag.jobs.filter((j) => j.id !== planned.id)].slice(0, 100);
          await writeJobs(store, bag);
        }
        jsonResponse(response, 200, {
          ok: true,
          action,
          awaitingConfirm: mustConfirm,
          command,
          planSummary,
          job: mustConfirm || action === "plan" ? planned : null,
          publishEnabled: false,
          note: planSummary.phaseNote,
        });
        return;
      }

      let job = jobApi.createJobFromPlan({
        command,
        planSummary,
        createdBy: session.email,
        status: "running",
      });
      const bag = readJobs(store);
      const activeLock = jobApi.findActiveMutationJobForLessons(bag.jobs, planSummary.selectedLessonIds, {
        excludeJobId: job.id,
      });
      if (activeLock) {
        jsonResponse(response, 409, {
          ok: false,
          code: "LESSON_MUTATION_IN_PROGRESS",
          error: `Another Operator job is already mutating lesson ${activeLock.lessonId}.`,
          blockingJobId: activeLock.job.id,
          lessonId: activeLock.lessonId,
          runBlocked: true,
        });
        return;
      }
      bag.jobs = [job, ...bag.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
      await writeJobs(store, bag);

      job = await runJob(job, store, session.email);
      const bag2 = readJobs(store);
      bag2.jobs = [job, ...bag2.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
      await writeJobs(store, bag2);

      // Natural-language connected upgrades reuse the same auto-apply path as connected_run.
      let autoApply = { applied: [], skipped: [] };
      const cmdActions = job?.command?.actions || {};
      const shouldAutoApply = !cmdActions.planOnly
        && cmdActions.connectedAutoApply !== false
        && (cmdActions.connectedAutoApply === true || cmdActions.connectedUpgrade === true);
      if (shouldAutoApply) {
        autoApply = await tryConnectedAutoApply(job, store, session.email);
        if (autoApply.applied.length) await writeStoreAsync(store);
        const bag3 = readJobs(store);
        bag3.jobs = [job, ...bag3.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
        await writeJobs(store, bag3);
      }

      const upgraded = wantsUpgrade(command);
      const songsBooks = wantsSongsBooks(command);
      const printables = wantsPrintables(command);
      const images = wantsImages(command);
      const created = wantsCreate(command);
      jsonResponse(response, 200, {
        ok: true,
        action: "run",
        command,
        planSummary,
        job,
        autoApply,
        publishEnabled: false,
        published: false,
        draftOnly: upgraded || songsBooks || printables || images || created,
        curriculumUnchanged: !(upgraded || songsBooks || printables || images || created),
        mutationsEnabled: upgraded || songsBooks || printables || images || created,
      });
      return;
    }

    if (action === "list") {
      const bag = readJobs(store);
      jsonResponse(response, 200, {
        ok: true,
        action,
        jobs: bag.jobs.map((j) => ({
          id: j.id,
          status: j.status,
          phase: j.phase,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
          rawCommand: j.command?.rawCommand,
          progress: j.progress,
          mutationsEnabled: j.mutationsEnabled === true,
          publishEnabled: false,
        })),
      });
      return;
    }

    if (action === "get") {
      const bag = readJobs(store);
      const job = bag.jobs.find((j) => j.id === schema.text(body.jobId, 80));
      if (!job) {
        jsonResponse(response, 404, { error: "Job not found.", code: "job_not_found" });
        return;
      }
      jsonResponse(response, 200, { ok: true, action, job });
      return;
    }

    if (action === "resume") {
      const bag = readJobs(store);
      let job = bag.jobs.find((j) => j.id === schema.text(body.jobId, 80));
      if (!job) {
        jsonResponse(response, 404, { error: "Job not found.", code: "job_not_found" });
        return;
      }
      if (job.status === "awaiting_confirm" && !body.confirm) {
        jsonResponse(response, 409, {
          ok: false,
          code: "awaiting_confirm",
          error: "Confirm the planned job before resuming.",
          job,
        });
        return;
      }
      job = await runJob(jobApi.normalizeOperatorJob(job), store, session.email);
      bag.jobs = bag.jobs.map((j) => (j.id === job.id ? job : j));
      await writeJobs(store, bag);

      // Preserve connectedAutoApply across plan → resume (same path as action=run).
      let autoApply = { applied: [], skipped: [] };
      const cmdActions = job?.command?.actions || {};
      const shouldAutoApply = !cmdActions.planOnly
        && cmdActions.connectedAutoApply !== false
        && (cmdActions.connectedAutoApply === true || cmdActions.connectedUpgrade === true);
      if (shouldAutoApply) {
        autoApply = await tryConnectedAutoApply(job, store, session.email);
        if (autoApply.applied.length) await writeStoreAsync(store);
        const bagAfter = readJobs(store);
        bagAfter.jobs = [job, ...bagAfter.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
        await writeJobs(store, bagAfter);
      }

      jsonResponse(response, 200, {
        ok: true,
        action,
        job,
        autoApply,
        published: false,
      });
      return;
    }

    if (action === "cancel") {
      const bag = readJobs(store);
      const idx = bag.jobs.findIndex((j) => j.id === schema.text(body.jobId, 80));
      if (idx < 0) {
        jsonResponse(response, 404, { error: "Job not found.", code: "job_not_found" });
        return;
      }
      const job = jobApi.normalizeOperatorJob(bag.jobs[idx]);
      job.status = "cancelled";
      jobApi.appendLog(job, "Cancelled by owner.");
      bag.jobs[idx] = job;
      await writeJobs(store, bag);
      jsonResponse(response, 200, { ok: true, action, job });
    }
  }

  return {
    handle,
    ACTIONS,
    readJobs,
    writeJobs,
    runJob,
    buildPlanSummary,
    wantsUpgrade,
    wantsImages,
    wantsPrintables,
    wantsSongsBooks,
    wantsCreate,
  };
}

function mergeStorePreserveCurriculumOperatorJobs(incomingStore, storeCache) {
  if (!incomingStore || typeof incomingStore !== "object") return incomingStore;
  const cached = jobApi.normalizeOperatorJobStore(storeCache?.curriculumOperatorJobs);
  const incoming = Object.prototype.hasOwnProperty.call(incomingStore, "curriculumOperatorJobs")
    ? jobApi.normalizeOperatorJobStore(incomingStore.curriculumOperatorJobs)
    : null;
  if (!incoming) {
    if (!cached.jobs.length) return incomingStore;
    return { ...incomingStore, curriculumOperatorJobs: cached };
  }
  const byId = new Map();
  function keepNewer(item) {
    if (!item?.id) return;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      return;
    }
    const existingMs = Date.parse(existing.updatedAt || "") || 0;
    const nextMs = Date.parse(item.updatedAt || "") || 0;
    if (nextMs >= existingMs) byId.set(item.id, item);
  }
  cached.jobs.forEach(keepNewer);
  incoming.jobs.forEach(keepNewer);
  return {
    ...incomingStore,
    curriculumOperatorJobs: {
      jobs: Array.from(byId.values()).slice(0, 100),
      updatedAt: incoming.updatedAt || cached.updatedAt || jobApi.nowIso(),
    },
  };
}

module.exports = {
  createCurriculumOperatorApi,
  mergeStorePreserveCurriculumOperatorJobs,
  ACTIONS,
};
