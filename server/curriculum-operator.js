/**
 * Owner-only AI Curriculum Operator API
 * (Phase 1 audit · Phase 2.5 AI draft upgrades · Phase 3 activity images).
 *
 * Saves enrichmentDraft only. Never publishes.
 * Never mutates printables, access plan, or lesson IDs.
 * Phase 3 images: Visual Production generate → enrichment media → draft attach.
 */
"use strict";

const schema = require("../scripts/curriculum-operator-schema.js");
const commandApi = require("../scripts/curriculum-operator-command.js");
const selectApi = require("../scripts/curriculum-operator-select.js");
const auditApi = require("../scripts/curriculum-operator-audit.js");
const upgradeApi = require("../scripts/curriculum-operator-upgrade.js");
const imagesApi = require("../scripts/curriculum-operator-images.js");
const jobApi = require("../scripts/curriculum-operator-job.js");

const ACTIONS = Object.freeze([
  "parse",
  "plan",
  "run",
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
    callOperatorAi,
    openAiConfigured,
    generateOperatorImage,
    persistEnrichmentPhoto,
    enrichmentMedia,
  } = deps;

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
    return jobApi.normalizeOperatorJobStore(store?.curriculumOperatorJobs);
  }

  async function writeJobs(store, nextJobs) {
    const stamp = jobApi.nowIso();
    store.curriculumOperatorJobs = jobApi.normalizeOperatorJobStore({
      ...nextJobs,
      updatedAt: stamp,
    });
    await writeStoreAsync(store);
    return store.curriculumOperatorJobs;
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
    if (phase < 3) return false;
    if (command?.actions?.touchImages === false) return false;
    return command?.actions?.generateImages === true;
  }

  function buildPlanSummary(command, selection) {
    const upgrade = wantsUpgrade(command);
    const images = wantsImages(command);
    const expected = ["lesson.get", "lesson.audit", "asset.plan", "teachingKit.score"];
    if (upgrade) {
      expected.push(
        "lesson.updateFields",
        "activity.update",
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
    }));
    let phaseNote = "Audit/plan only. No curriculum mutations.";
    if (upgrade && images) {
      phaseNote = "Phase 2.5+3: AI draft text + useful activity images into enrichmentDraft. NOT published. No printables.";
    } else if (upgrade) {
      phaseNote = "Phase 2.5: enrichmentDraft text only. NOT published. No image/printable changes.";
    } else if (images) {
      phaseNote = "Phase 3: activity images only (KEEP/GENERATE/REPLACE/NOT_NEEDED). NOT published. No printables.";
    }
    return {
      task: command.rawCommand,
      intent: command.intent,
      selectionNote: selection.selectionNote,
      lessons,
      candidatesConsidered: selection.candidatesConsidered,
      unresolvedTitles: selection.unresolvedTitles || [],
      needsConfirmation: false,
      confirmReasons: [],
      phase: Number(command.completion?.phase) || 1,
      phaseNote,
      generatesImages: images,
      generatesPrintables: false,
      publishes: false,
    };
  }

  function collectSucceededImageKeys(lr) {
    const keys = new Set();
    schema.asArray(lr?.imageActions).forEach((a) => {
      if (a.status === "success" && a.idempotencyKey) keys.add(a.idempotencyKey);
    });
    return keys;
  }

  async function runImagesForLesson(job, plan, audit, store, sessionEmail, lr) {
    const curriculum = readSiteCurriculum(store);
    const linked = schema.asArray(curriculum.activities).filter((a) => a.lessonPlanId === plan.id);

    const mockGenerate = process.env.NODE_ENV === "test"
      || ["1", "true", "yes"].includes(String(process.env.VISUAL_PRODUCTION_MOCK_GENERATE || "").trim().toLowerCase())
      || ["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_IMAGE_FIXTURE || "").trim().toLowerCase());

    const imageRun = await imagesApi.runImagePlanForLesson({
      plan,
      activities: linked,
      audit,
      limits: job.command.limits,
      replaceBadImages: job.command.actions.replaceBadImages === true,
      touchImages: job.command.actions.touchImages !== false,
      callGenerate: generateOperatorImage,
      persistEnrichmentPhotoVariants: persistEnrichmentPhoto,
      enrichmentMedia,
      store,
      mockGenerate,
      alreadySucceededKeys: collectSucceededImageKeys(lr),
    });

    if (imageRun.code === "SCOPE_REVIEW_REQUIRED") {
      return {
        ok: false,
        scopeReview: true,
        imageRun,
        plan,
        error: imageRun.error,
      };
    }

    let afterPlan = plan;
    let historyId = null;
    if (imageRun.changed) {
      if (typeof saveOperatorEnrichmentDraft !== "function") {
        throw new Error("Draft save helper is not configured for image attach.");
      }
      const saveResult = await saveOperatorEnrichmentDraft({
        store,
        lessonPlanId: plan.id,
        enrichmentDraft: imageRun.enrichmentDraft,
        adminEmail: sessionEmail,
      });
      if (!saveResult?.ok) {
        throw new Error(saveResult?.error || "enrichment_draft image save failed");
      }
      historyId = saveResult.versionId || null;
      afterPlan = saveResult.lessonPlan;
      Object.assign(store, readStore());
    }

    const keepOrSkipIds = schema.asArray(imageRun.actions)
      .filter((a) => {
        const d = imagesApi.normalizeDecision(a.decision);
        return a.status === "skipped" || d === "KEEP" || d === "NOT_NEEDED";
      })
      .map((a) => a.activityId)
      .filter(Boolean);

    const verifiedActions = schema.asArray(imageRun.actions).map((action) => {
      if (action.status !== "success") return action;
      const verification = imagesApi.verifyAttachedImage({
        beforePlan: plan,
        afterPlan,
        activityId: action.activityId,
        field: action.field,
        mediaUrl: action.mediaUrl,
        mediaAssetId: action.mediaAssetId,
        untouchedActivityIds: keepOrSkipIds.filter((id) => id !== action.activityId),
      });
      if (!verification.ok) {
        return {
          ...action,
          status: "failed",
          error: "Post-attach verification failed.",
          retryable: true,
          verification,
        };
      }
      return { ...action, verification, status: "success" };
    });

    const counts = imagesApi.summarizeImageActions(verifiedActions);
    job.costCounters.images = (job.costCounters.images || 0) + Number(imageRun.generations || 0);

    return {
      ok: verifiedActions.every((a) => a.status !== "failed"),
      partial: verifiedActions.some((a) => a.status === "failed")
        && verifiedActions.some((a) => a.status === "success"),
      imageRun: { ...imageRun, actions: verifiedActions, counts },
      afterPlan,
      historyId,
      counts,
    };
  }

  function auditOneLesson(plan, curriculum) {
    const audit = auditApi.auditLesson(plan, curriculum);
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

  async function processOneLesson(job, lr, index, store, sessionEmail) {
    job.progress.lessonIndex = index;
    job.progress.currentLessonId = lr.lessonId;

    const curriculum = readSiteCurriculum(store);
    const plan = schema.asArray(curriculum.lessonPlans).find((p) => p.id === lr.lessonId);
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
    try {
      job.progress.currentAction = "lesson.audit";
      const before = auditOneLesson(plan, curriculum);
      if (!before.verification.ok) {
        return {
          ...lr,
          title: plan.title,
          status: "failed",
          audit: before.audit,
          verification: before.verification,
          beforeScores: before.audit.scores,
          error: "Pre-upgrade audit verification failed.",
          ownerReviewStatus: "BLOCKED",
          actions: markSteps(lr.actions, ["lesson.get", "lesson.audit", "asset.plan", "teachingKit.score"], "failed", {
            error: "verification_failed",
          }),
        };
      }

      job.costCounters.lessonsAudited = (job.costCounters.lessonsAudited || 0) + 1;

      let workingPlan = plan;
      let historyId = null;
      let kept = (before.audit.weeklyContent || []).filter((f) => f.decision === "KEEP").map((f) => f.field);
      let updated = [];
      let aiUsage = null;
      let upgradeVerification = null;
      let ownerReviewStatus = "AUDIT_ONLY";
      let afterScores = before.audit.scores;
      let auditAfter = before.audit;

      // --- Phase 2.5 text upgrade (optional) ---
      if (upgrade) {
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
            error: "Structured AI composer is not configured.",
            ownerReviewStatus: "BLOCKED",
            published: false,
            actions: markSteps(lr.actions, schema.asArray(lr.actions).map((a) => a.type), "failed", {
              error: "ai_composer_unavailable",
              retryable: true,
            }),
          };
        }

        const built = await upgradeApi.buildUpgradeDraft(plan, curriculum, before.audit, {
          upgradeLesson: job.command.actions.upgradeLesson !== false,
          upgradeActivities: job.command.actions.upgradeActivities !== false,
          touchSongs: job.command.actions.checkSongs !== false,
          touchBooks: job.command.actions.checkBooks !== false,
          editedBy: sessionEmail || "curriculum-operator-phase25",
          callAi: callOperatorAi,
        });

        if (built.usage?.calls) {
          job.costCounters.openaiCalls = (job.costCounters.openaiCalls || 0) + Number(built.usage.calls || 0);
        }
        aiUsage = built.usage || null;

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
            error: schema.text(built.error, 500),
            ownerReviewStatus: "BLOCKED",
            published: false,
            aiUsage,
            actions: markSteps(lr.actions, schema.asArray(lr.actions).map((a) => a.type), "failed", {
              error: built.code || "ai_composer_failed",
              retryable: true,
            }),
          };
        }

        kept = built.kept;
        updated = built.changed;

        if (built.changed.length) {
          if (typeof saveOperatorEnrichmentDraft !== "function") {
            throw new Error("Draft save helper is not configured.");
          }
          job.progress.currentAction = "lesson.saveDraft";
          const saveResult = await saveOperatorEnrichmentDraft({
            store,
            lessonPlanId: plan.id,
            enrichmentDraft: built.enrichmentDraft,
            adminEmail: sessionEmail,
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
              generated: [],
              ownerReviewStatus: "BLOCKED",
              readyForReview: false,
              published: false,
              aiUsage,
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
        } else {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
          jobApi.appendLog(job, `No draft text changes needed for “${plan.title}”.`, "info", plan.id);
        }
      }

      // --- Phase 3 activity images (optional) ---
      let imageActions = schema.asArray(lr.imageActions);
      let imageCounts = lr.imageCounts || null;
      let imagesComplete = lr.imagesComplete === true;
      let imageError = null;

      if (images) {
        job.progress.currentAction = "image.inspect";
        // Re-audit working plan so asset plan reflects any text changes
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
            imageActions: imageResult.imageRun?.actions || [],
            imageCounts: imageResult.imageRun?.counts || null,
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
        imagesComplete = imageResult.ok || imageResult.partial;
        if (imageResult.historyId) historyId = imageResult.historyId;
        workingPlan = imageResult.afterPlan;
        const finalAudit = auditOneLesson(workingPlan, readSiteCurriculum(store));
        auditAfter = finalAudit.audit;
        afterScores = finalAudit.audit.scores;
        if (!imageResult.ok) {
          imageError = "One or more image actions failed (existing images preserved).";
          ownerReviewStatus = upgrade ? "PARTIAL" : "PARTIAL";
        } else if (!upgrade) {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
        } else if (ownerReviewStatus === "AUDIT_ONLY") {
          ownerReviewStatus = "READY_FOR_OWNER_REVIEW";
        }
        jobApi.appendLog(
          job,
          `Images for “${plan.title}”: KEEP ${imageCounts.KEEP || 0} · GENERATED/REPLACED ${imageCounts.SUCCESS || 0} · NOT_NEEDED ${imageCounts.NOT_NEEDED || 0} · FAILED ${imageCounts.FAILED || 0}.`,
          imageResult.ok ? "info" : "warn",
          plan.id,
        );
      }

      if (!upgrade && !images) {
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

      const ok = !imageError && (upgradeVerification ? upgradeVerification.ok : true);
      const stepTypes = schema.asArray(lr.actions).map((a) => a.type);
      return {
        ...lr,
        title: plan.title,
        status: ok ? "success" : (imageError && (updated.length || imageCounts?.SUCCESS) ? "success" : "failed"),
        preSnapshotHistoryId: historyId,
        audit: before.audit,
        auditAfter,
        verification: before.verification,
        upgradeVerification,
        beforeScores: before.audit.scores,
        afterScores,
        kept,
        updated,
        generated: [],
        imageActions,
        imageCounts,
        imagesComplete: images ? imagesComplete : undefined,
        ownerReviewStatus: imageError ? "PARTIAL" : ownerReviewStatus,
        readyForReview: ok || Boolean(imageCounts?.SUCCESS) || Boolean(updated.length),
        published: false,
        aiUsage,
        error: ok ? null : (imageError || "Lesson processing incomplete."),
        actions: markSteps(lr.actions, stepTypes, ok ? "success" : "failed", {
          output: {
            changed: updated.length,
            imageCounts,
            ownerReviewStatus: imageError ? "PARTIAL" : ownerReviewStatus,
            published: false,
            historyId,
          },
          error: ok ? null : (imageError ? "image_actions_partial" : "processing_failed"),
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
    let startMsg = "Starting audit-only run.";
    if (upgrade && images) startMsg = "Starting Phase 2.5 draft upgrade + Phase 3 activity images (no publish).";
    else if (upgrade) startMsg = "Starting Phase 2.5 draft upgrade run (no publish).";
    else if (images) startMsg = "Starting Phase 3 activity image run (no publish).";
    jobApi.appendLog(job, startMsg);

    const results = [];
    for (let index = 0; index < job.lessonResults.length; index += 1) {
      const lr = job.lessonResults[index];
      const resumeOk = lr.status === "success"
        && (
          (images && lr.imagesComplete && (lr.auditAfter || lr.audit))
          || (!images && upgrade && lr.auditAfter)
          || (!images && !upgrade && lr.audit)
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
    job.progress = {
      ...job.progress,
      completed,
      failed,
      skipped: results.filter((l) => l.status === "skipped").length,
      remaining: Math.max(0, results.length - completed - failed),
      currentAction: "",
      currentLessonId: "",
    };
    job.status = failed && !completed ? "failed" : "completed";
    job.ownerSummary = jobApi.buildOwnerSummary(job);
    jobApi.appendLog(
      job,
      `Job ${job.status}. Success ${completed}; failed ${failed}. Publish: NOT PUBLISHED.`,
    );
    job.updatedAt = jobApi.nowIso();
    return job;
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

    const phase = schema.clampInt(body.phase, 1, 8, 3);
    const curriculum = typeof readSiteCurriculum === "function"
      ? readSiteCurriculum(store)
      : (store.siteContent?.curriculum || { lessonPlans: [], activities: [], resources: [] });

    if (action === "parse") {
      const parsed = commandApi.parseOperatorCommand(body.command || body.rawCommand || "", {
        currentlySelectedLessonId: body.currentlySelectedLessonId,
        phase,
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
        });

      const command = parsed.command;
      if (!command.rawCommand && !(command.scope.lessonIds?.length || command.scope.titles?.length)) {
        jsonResponse(response, 400, {
          error: "Provide a natural-language command or typed command schema.",
          code: "command_required",
        });
        return;
      }

      if (command.actions.publish || command.completion.publish) {
        parsed.needsConfirmation = true;
        parsed.confirmReasons = [...new Set([...(parsed.confirmReasons || []), "publish_requested"])];
      }

      const selection = selectApi.selectLessons(curriculum, command, {
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

      const mustConfirm = planSummary.needsConfirmation
        && !body.confirm
        && (planSummary.confirmReasons.includes("ambiguous_scope")
          || planSummary.confirmReasons.includes("unexpectedly_large_scope")
          || planSummary.confirmReasons.includes("publish_requested"));

      if (action === "plan" || mustConfirm) {
        const planned = jobApi.createJobFromPlan({
          command,
          planSummary,
          createdBy: session.email,
          status: mustConfirm ? "awaiting_confirm" : "planned",
        });
        if (action === "run" && mustConfirm) {
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
      bag.jobs = [job, ...bag.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
      await writeJobs(store, bag);

      job = await runJob(job, store, session.email);
      const bag2 = readJobs(store);
      bag2.jobs = [job, ...bag2.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
      await writeJobs(store, bag2);

      const upgraded = wantsUpgrade(command);
      jsonResponse(response, 200, {
        ok: true,
        action: "run",
        command,
        planSummary,
        job,
        publishEnabled: false,
        published: false,
        draftOnly: upgraded,
        curriculumUnchanged: !upgraded,
        mutationsEnabled: upgraded,
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
      jsonResponse(response, 200, {
        ok: true,
        action,
        job,
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
    runJob,
    buildPlanSummary,
    wantsUpgrade,
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
