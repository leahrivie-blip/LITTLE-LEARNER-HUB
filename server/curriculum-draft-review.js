/**
 * Owner-only Curriculum Draft Review Queue API (Phase 1).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const model = require("../scripts/curriculum-draft-review.js");

const SEED_ROOT = path.join(__dirname, "..", "docs", "curriculum-draft-review", "seed");

function createDraftReviewApi(deps) {
  const {
    readJson,
    jsonResponse,
    readStore,
    writeStoreAsync,
    requireTeachingKitOwnerAdminSession,
    teachingKit,
    normalizeEmail,
    normalizedSiteContent,
    defaultSiteContentStore,
    curriculumConcurrencyConflict,
    curriculumConflictResponse,
    normalizedShortText,
    normalizedCurriculumStore,
    normalizedCurriculumLessonPlan,
    normalizedCurriculumResource,
    writeSiteCurriculum,
    linkCurriculumResourceToLessonPlan,
    unlinkCurriculumResourceFromLessonPlan, // used by discard/rollback
    parseCurriculumPdfUploadDataUrl,
    sanitizeCurriculumUploadFileName,
    persistCurriculumUploadToMediaAsset,
    usePostgresStore,
    MAX_CURRICULUM_UPLOAD_MB,
    assertCurriculumIntegrityOrError,
    curriculumResourceMetadata,
    cloneJson,
    appendEnrichmentEditorAudit,
    loadEnrichmentHelpers,
    isCurriculumResourcePublic,
    crypto,
  } = deps;

  function readQueue(siteContent) {
    return model.normalizeQueue(siteContent?.curriculumDraftReviews);
  }

  function writeQueue(store, queue, stamp) {
    store.siteContent = store.siteContent || defaultSiteContentStore();
    store.siteContent.curriculumDraftReviews = model.normalizeQueue(queue);
    if (stamp) store.siteContent.updatedAt = stamp;
  }

  function requireOwner(request, body, response) {
    const session = requireTeachingKitOwnerAdminSession(request, body, response);
    if (!session) return null;
    const email = normalizeEmail(session.email || "");
    if (!teachingKit.isTeachingKitOwnerPreviewEmail(email)) {
      jsonResponse(response, 403, {
        error: "Draft Review Queue is restricted to the owner account.",
        code: "teaching_kit_owner_required",
      });
      return null;
    }
    return session;
  }

  function acceptSubmitToken(request, body) {
    const configured = String(process.env.CURRICULUM_DRAFT_SUBMIT_TOKEN || "").trim();
    if (!configured) return false;
    const provided = String(
      request?.headers?.["x-llh-curriculum-submit-token"] || body?.submitToken || "",
    ).trim();
    if (!provided || provided.length !== configured.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(configured));
    } catch {
      return false;
    }
  }

  function score(plan, activities, enrichmentDraft, resources) {
    try {
      const qualityApi = require("../scripts/teaching-kit-quality-review.js");
      const enrichmentApi = loadEnrichmentHelpers();
      const flat = enrichmentApi.flattenLessonActivities
        ? enrichmentApi.flattenLessonActivities(plan, activities)
        : activities;
      const report = qualityApi.buildQualityReport(plan, flat, enrichmentDraft, {
        ignoredCodes: Array.isArray(enrichmentDraft?.week?.qualityReviewIgnored)
          ? enrichmentDraft.week.qualityReviewIgnored
          : [],
        resources: resources || [],
      });
      return { scores: model.buildScores(report), qualityResults: {
        overallScore: report.overallScore,
        overallLabel: report.overallLabel,
        publishReadiness: report.publishReadiness,
        blocksPublish: report.blocksPublish === true,
      } };
    } catch {
      return { scores: model.buildScores(null), qualityResults: null };
    }
  }

  function loadSeedPackage(packageId) {
    const seed = model.LOCAL_SEED_PACKAGES.find((p) => p.packageId === packageId);
    if (!seed) {
      const err = new Error(`Unknown seed package: ${packageId}`);
      err.code = "unknown_seed";
      err.status = 400;
      throw err;
    }
    const dir = path.join(SEED_ROOT, seed.relativeDir);
    const enrichmentPath = path.join(dir, "enrichment-draft.json");
    const pdfPath = path.join(dir, seed.pdfFile);
    if (!fs.existsSync(enrichmentPath) || !fs.existsSync(pdfPath)) {
      const err = new Error(`Seed files missing for ${packageId}`);
      err.code = "seed_missing";
      err.status = 400;
      throw err;
    }
    const parsed = JSON.parse(fs.readFileSync(enrichmentPath, "utf8"));
    const enrichmentDraft = parsed.enrichmentDraft;
    if (!model.enrichmentHasContent(enrichmentDraft)) {
      const err = new Error("Seed enrichmentDraft empty");
      err.code = "empty_draft";
      err.status = 400;
      throw err;
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    return {
      seed,
      enrichmentDraft,
      pdf: {
        fileName: seed.pdfFile,
        dataUrl: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
        sha256: require("crypto").createHash("sha256").update(pdfBuffer).digest("hex"),
      },
    };
  }

  async function upsertDraftPdf({ curriculum, plan, resourceId, title, fileName, dataUrl, now, meta = {} }) {
    const existing = (curriculum.resources || []).find((r) => r.id === resourceId) || null;
    if (existing?.status === "published") {
      const err = new Error(`Resource ${resourceId} is published — will not overwrite.`);
      err.code = "resource_already_published";
      err.status = 409;
      throw err;
    }
    const parsed = parseCurriculumPdfUploadDataUrl(dataUrl);
    if (!parsed) {
      const err = new Error(`Valid PDF required (max ${MAX_CURRICULUM_UPLOAD_MB} MB).`);
      err.code = "invalid_pdf";
      err.status = 400;
      throw err;
    }
    let pdfFields;
    if (usePostgresStore()) {
      const stored = await persistCurriculumUploadToMediaAsset({
        resourceId,
        parsed,
        fileName: sanitizeCurriculumUploadFileName(fileName || "printable.pdf"),
      });
      pdfFields = {
        fileData: "",
        mediaAssetId: stored.mediaAssetId,
        mediaUrl: stored.mediaUrl,
        mimeType: "application/pdf",
        fileName: stored.fileName,
      };
    } else {
      pdfFields = {
        fileData: parsed.fileData,
        mediaAssetId: "",
        mediaUrl: "",
        mimeType: "application/pdf",
        fileName: sanitizeCurriculumUploadFileName(fileName || "printable.pdf"),
      };
    }
    const resource = normalizedCurriculumResource({
      ...existing,
      id: resourceId,
      title: title || existing?.title || "Printable",
      resourceCategory: "Printables",
      resourceType: meta.resourceType || "Picture cards",
      description: meta.description || "",
      ageGroup: meta.ageGroup || plan.age || "",
      theme: meta.theme || plan.theme || "",
      pageCount: meta.pageCount,
      printingInstructions: meta.printingInstructions || "",
      accessLevel: "pro",
      ...pdfFields,
      status: "draft",
      publishedAt: "",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lessonPlanIds: existing?.lessonPlanIds || [],
    });
    let next = normalizedCurriculumStore({
      ...curriculum,
      resources: [...(curriculum.resources || []).filter((r) => r.id !== resourceId), resource],
      updatedAt: now,
    });
    next = linkCurriculumResourceToLessonPlan(next, resourceId, plan.id) || next;
    next = normalizedCurriculumStore({
      ...next,
      resources: (next.resources || []).map((r) => (
        r.id === resourceId ? normalizedCurriculumResource({ ...r, status: "draft", publishedAt: "" }) : r
      )),
      updatedAt: now,
    });
    return next;
  }

  function pushVersion(entry, note, now) {
    const versions = [
      {
        versionId: model.generateId("cdr-ver"),
        savedAt: now,
        note: note || "",
        status: entry.status,
        enrichmentDraft: entry.enrichmentDraft,
        draftResourceIds: entry.draftResourceIds || [],
        reviewNotes: entry.reviewNotes || "",
        scores: entry.scores,
        stats: entry.stats,
        qualityResults: entry.qualityResults,
      },
      ...(entry.versions || []),
    ].slice(0, 30);
    return versions;
  }

  async function applySubmit({ store, siteContent, sessionEmail, body, packagePayload }) {
    const now = new Date().toISOString();
    const lessonPlanId = normalizedShortText(body.lessonPlanId || packagePayload?.seed?.lessonPlanId, 160);
    if (!lessonPlanId) {
      const err = new Error("lessonPlanId is required.");
      err.code = "lesson_required";
      err.status = 400;
      throw err;
    }
    if (body.createAsNewLesson === true) {
      const err = new Error("Create as new lesson is not available in Phase 1.");
      err.code = "create_new_blocked";
      err.status = 400;
      throw err;
    }

    let curriculum = siteContent.curriculum || { lessonPlans: [], activities: [], resources: [] };
    const plan = (curriculum.lessonPlans || []).find((p) => p.id === lessonPlanId) || null;
    const match = model.matchLesson(plan, {
      lessonPlanId,
      title: body.title || packagePayload?.seed?.title,
      age: body.age || packagePayload?.seed?.age,
      theme: body.theme || packagePayload?.seed?.theme,
    });
    if (!match.ok) {
      const err = new Error("Lesson validation failed.");
      err.code = "failed_validation";
      err.status = 409;
      err.errors = match.errors;
      throw err;
    }

    const lessonCountBefore = (curriculum.lessonPlans || []).length;
    const activityCountBefore = (curriculum.activities || []).length;
    const activities = (curriculum.activities || []).filter((a) => a.lessonPlanId === lessonPlanId);
    const beforePub = model.publishedBodyFingerprint(plan);
    const beforeActs = model.activityLinkFingerprint(plan, activities);
    const previousDraft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? cloneJson(plan.enrichmentDraft)
      : null;

    const enrichmentDraft = model.sanitizeDraft(
      packagePayload?.enrichmentDraft || body.enrichmentDraft,
      { lastEditedBy: sessionEmail, batchId: body.batchId || "" },
    );
    if (!model.enrichmentHasContent(enrichmentDraft)) {
      const err = new Error("enrichmentDraft is empty.");
      err.code = "empty_draft";
      err.status = 400;
      throw err;
    }

    const submissionKey = normalizedShortText(
      body.submissionKey || body.revisionId || `${lessonPlanId}:${body.batchId || "default"}`,
      200,
    ) || `${lessonPlanId}:default`;
    const revisionId = model.generateId("cdr-rev");

    const snapshots = {
      publishedBodyFingerprint: beforePub,
      activityLinkFingerprint: beforeActs,
      enrichmentDraftBefore: previousDraft,
      resourceIdsBefore: Array.isArray(plan.resourceIds) ? [...plan.resourceIds] : [],
      resourcesMeta: (curriculum.resources || [])
        .filter((r) => (plan.resourceIds || []).includes(r.id) || (r.lessonPlanIds || []).includes(lessonPlanId))
        .map((r) => ({
          id: r.id,
          status: r.status,
          mediaAssetId: r.mediaAssetId || "",
          fileDataPresent: Boolean(r.fileData),
          title: r.title || "",
          fileName: r.fileName || "",
          lessonPlanIds: r.lessonPlanIds || [],
        })),
      lessonCount: lessonCountBefore,
      activityCount: activityCountBefore,
    };

    const draftResourceIds = [];
    if (packagePayload?.pdf && packagePayload?.seed) {
      curriculum = await upsertDraftPdf({
        curriculum,
        plan,
        resourceId: packagePayload.seed.resourceId,
        title: packagePayload.seed.resourceTitle,
        fileName: packagePayload.pdf.fileName,
        dataUrl: packagePayload.pdf.dataUrl,
        now,
        meta: {
          ageGroup: packagePayload.seed.age,
          theme: packagePayload.seed.theme,
        },
      });
      draftResourceIds.push(packagePayload.seed.resourceId);
    } else if (Array.isArray(body.printables)) {
      for (const printable of body.printables) {
        const resourceId = normalizedShortText(printable.id || printable.resourceId, 160);
        if (!resourceId) continue;
        curriculum = await upsertDraftPdf({
          curriculum,
          plan,
          resourceId,
          title: printable.title,
          fileName: printable.fileName,
          dataUrl: printable.fileData,
          now,
          meta: printable,
        });
        draftResourceIds.push(resourceId);
      }
    }

    const history = Array.isArray(plan.enrichmentPublishHistory) ? plan.enrichmentPublishHistory : [];
    const draftPlan = normalizedCurriculumLessonPlan({
      ...plan,
      enrichmentDraft: { ...enrichmentDraft, updatedAt: now, lastEditedBy: sessionEmail },
      enrichmentPublishHistory: [
        {
          versionId: revisionId,
          // Keep ≤20 chars — enrichment rollback truncates kind via normalizedShortText(..., 20).
          kind: "draft_review",
          publishedAt: now,
          publishedBy: sessionEmail,
          fingerprint: `draft-review-before:${beforePub}`,
          lessonPlanId,
          snapshot: {
            enrichmentDraft: previousDraft || {},
            publishedBodyFingerprint: beforePub,
            activityLinkFingerprint: beforeActs,
            resourceIds: snapshots.resourceIdsBefore,
          },
        },
        ...history,
      ].slice(0, 40),
      updatedAt: plan.updatedAt,
    });

    curriculum = normalizedCurriculumStore({
      ...curriculum,
      lessonPlans: (curriculum.lessonPlans || []).map((item) => (
        item.id === lessonPlanId ? { ...draftPlan, updatedAt: plan.updatedAt } : item
      )),
      updatedAt: now,
    });

    if ((curriculum.lessonPlans || []).length !== lessonCountBefore
      || (curriculum.activities || []).length !== activityCountBefore) {
      const err = new Error("Lesson/activity totals changed — refusing write.");
      err.code = "totals_changed";
      err.status = 500;
      throw err;
    }
    const integrity = assertCurriculumIntegrityOrError(curriculum);
    if (integrity) {
      const err = new Error(integrity.error || "Integrity failed");
      err.code = "integrity_failed";
      err.status = 400;
      throw err;
    }
    const writeResult = writeSiteCurriculum(store, curriculum, { updatedAt: now });
    if (writeResult.wipeBlocked) {
      const err = new Error("Curriculum wipe blocked.");
      err.code = "curriculum_wipe_blocked";
      err.status = 409;
      throw err;
    }

    const saved = (store.siteContent.curriculum.lessonPlans || []).find((p) => p.id === lessonPlanId);
    const afterPub = model.publishedBodyFingerprint(saved);
    if (afterPub !== beforePub) {
      const err = new Error("Published body fingerprint changed — abort.");
      err.code = "published_body_changed";
      err.status = 500;
      throw err;
    }
    const afterActs = model.activityLinkFingerprint(
      saved,
      (store.siteContent.curriculum.activities || []).filter((a) => a.lessonPlanId === lessonPlanId),
    );
    if (afterActs !== beforeActs) {
      const err = new Error("Activity links changed — abort.");
      err.code = "activity_links_changed";
      err.status = 500;
      throw err;
    }

    const scored = score(
      saved,
      (store.siteContent.curriculum.activities || []).filter((a) => a.lessonPlanId === lessonPlanId),
      saved.enrichmentDraft,
      store.siteContent.curriculum.resources || [],
    );
    const stats = model.buildStats(saved.enrichmentDraft, draftResourceIds);

    const queue = readQueue(store.siteContent);
    const existingIdx = queue.findIndex((item) => item.submissionKey === submissionKey
      || (item.lessonPlanId === lessonPlanId && !["published", "discarded", "rolled_back"].includes(item.status)
        && item.batchId === (body.batchId || item.batchId)));

    let entry;
    let idempotent = false;
    if (existingIdx >= 0) {
      const prior = queue[existingIdx];
      // Exact same enrichment fingerprint → idempotent no-op version bump avoid
      const priorFp = model.draftContentFingerprint(prior.enrichmentDraft);
      const nextFp = model.draftContentFingerprint(saved.enrichmentDraft);
      if (priorFp === nextFp && prior.submissionKey === submissionKey) {
        idempotent = true;
        entry = prior;
      } else {
        entry = model.normalizeEntry({
          ...prior,
          title: saved.title,
          age: saved.age,
          theme: saved.theme,
          submissionKey,
          revisionId,
          batchId: body.batchId || prior.batchId,
          batchName: body.batchName || prior.batchName,
          source: body.source || prior.source,
          status: prior.status === "revision_requested" ? "revised" : "submitted",
          updatedAt: now,
          enrichmentDraft: saved.enrichmentDraft,
          draftResourceIds: [...new Set([...(prior.draftResourceIds || []), ...draftResourceIds])],
          versions: pushVersion(prior, "Revised submission", now),
          snapshots,
          scores: scored.scores,
          stats,
          qualityResults: scored.qualityResults,
        });
        queue[existingIdx] = entry;
      }
    } else {
      entry = model.normalizeEntry({
        id: model.generateId("cdr"),
        lessonPlanId,
        title: saved.title,
        age: saved.age,
        theme: saved.theme,
        submissionKey,
        revisionId,
        batchId: body.batchId || "",
        batchName: body.batchName || "Curriculum draft batch",
        source: body.source || "curriculum-tool",
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
        enrichmentDraft: saved.enrichmentDraft,
        draftResourceIds,
        versions: [],
        snapshots,
        scores: scored.scores,
        stats,
        qualityResults: scored.qualityResults,
        reviewNotes: "",
        notesHistory: [],
      });
      queue.unshift(entry);
    }

    writeQueue(store, queue, now);
    appendEnrichmentEditorAudit(store, {
      action: "draft_review_submit",
      lessonPlanId,
      versionId: revisionId,
      adminEmail: sessionEmail,
      fingerprint: afterPub,
      note: idempotent ? "Idempotent submit" : "Draft Review submit — published unchanged",
    });
    await writeStoreAsync(store);

    return {
      entry: model.listItem(entry),
      detail: entry,
      idempotent,
      publishedUnchanged: true,
      activityLinksUnchanged: true,
      lessonCountUnchanged: true,
      activityCountUnchanged: true,
      revisionId,
      siteContentUpdatedAt: store.siteContent.updatedAt,
    };
  }

  async function fullRollbackOrDiscard({ store, siteContent, entry, sessionEmail, action, notes }) {
    const now = new Date().toISOString();
    let curriculum = siteContent.curriculum || {};
    const plan = (curriculum.lessonPlans || []).find((p) => p.id === entry.lessonPlanId);
    if (!plan) {
      const err = new Error("Lesson not found.");
      err.code = "lesson_not_found";
      err.status = 404;
      throw err;
    }
    const beforePub = model.publishedBodyFingerprint(plan);
    const lessonCountBefore = (curriculum.lessonPlans || []).length;
    const activityCountBefore = (curriculum.activities || []).length;

    let targetState = null;
    if (action === "rollback" && Array.isArray(entry.versions) && entry.versions.length) {
      targetState = entry.versions[0];
    }

    const restoreDraft = action === "rollback" && targetState
      ? targetState.enrichmentDraft
      : (entry.snapshots?.enrichmentDraftBefore || null);

    const restoreResourceIds = action === "rollback" && targetState
      ? (targetState.draftResourceIds || [])
      : [];

    // Restore enrichment draft
    let nextPlan = normalizedCurriculumLessonPlan({
      ...plan,
      enrichmentDraft: model.enrichmentHasContent(restoreDraft)
        ? { ...restoreDraft, updatedAt: now, lastEditedBy: sessionEmail }
        : null,
      updatedAt: plan.updatedAt,
    });

    // Restore printable links from snapshot metadata where possible
    let resources = [...(curriculum.resources || [])];
    const snapMeta = entry.snapshots?.resourcesMeta || [];
    const managedIds = new Set([...(entry.draftResourceIds || []), ...restoreResourceIds]);

    if (action === "discard") {
      resources = resources.map((r) => {
        if (!managedIds.has(r.id) || r.status === "published") return r;
        return normalizedCurriculumResource({
          ...r,
          status: "archived",
          lessonPlanIds: (r.lessonPlanIds || []).filter((id) => id !== entry.lessonPlanId),
          updatedAt: now,
        });
      });
      nextPlan = {
        ...nextPlan,
        resourceIds: (nextPlan.resourceIds || []).filter((id) => !managedIds.has(id)),
        updatedAt: plan.updatedAt,
      };
    } else if (action === "rollback") {
      // Unlink draft resources not in restore set; re-link restore set
      for (const rid of managedIds) {
        if (!restoreResourceIds.includes(rid)) {
          const cur = unlinkCurriculumResourceFromLessonPlan(
            { ...curriculum, lessonPlans: [nextPlan], resources },
            rid,
            entry.lessonPlanId,
          );
          if (cur) {
            nextPlan = cur.lessonPlans.find((p) => p.id === entry.lessonPlanId) || nextPlan;
            resources = cur.resources;
          }
        }
      }
      // Restore prior resource files from snapshot when we still have them in store
      resources = resources.map((r) => {
        const meta = snapMeta.find((m) => m.id === r.id);
        if (!meta || r.status === "published") return r;
        if (restoreResourceIds.includes(r.id)) {
          return normalizedCurriculumResource({
            ...r,
            status: "draft",
            publishedAt: "",
            updatedAt: now,
          });
        }
        return r;
      });
    }

    curriculum = normalizedCurriculumStore({
      ...curriculum,
      lessonPlans: (curriculum.lessonPlans || []).map((item) => (
        item.id === entry.lessonPlanId ? { ...nextPlan, updatedAt: plan.updatedAt } : item
      )),
      resources,
      updatedAt: now,
    });

    if ((curriculum.lessonPlans || []).length !== lessonCountBefore
      || (curriculum.activities || []).length !== activityCountBefore) {
      const err = new Error("Totals changed during rollback/discard.");
      err.code = "totals_changed";
      err.status = 500;
      throw err;
    }

    const writeResult = writeSiteCurriculum(store, curriculum, { updatedAt: now });
    if (writeResult.wipeBlocked) {
      const err = new Error("Wipe blocked");
      err.code = "curriculum_wipe_blocked";
      err.status = 409;
      throw err;
    }

    const saved = (store.siteContent.curriculum.lessonPlans || []).find((p) => p.id === entry.lessonPlanId);
    const afterPub = model.publishedBodyFingerprint(saved);
    const nextStatus = action === "rollback" ? "rolled_back" : "discarded";

    const queue = readQueue(store.siteContent);
    const idx = queue.findIndex((item) => item.id === entry.id);
    const updated = model.normalizeEntry({
      ...entry,
      status: nextStatus,
      updatedAt: now,
      enrichmentDraft: saved?.enrichmentDraft || null,
      draftResourceIds: action === "rollback" ? restoreResourceIds : [],
      reviewNotes: action === "rollback" && targetState ? (targetState.reviewNotes || "") : entry.reviewNotes,
      scores: action === "rollback" && targetState ? targetState.scores : entry.scores,
      stats: action === "rollback" && targetState ? targetState.stats : entry.stats,
      qualityResults: action === "rollback" && targetState ? targetState.qualityResults : entry.qualityResults,
      notesHistory: [
        { at: now, by: sessionEmail, action, note: notes || "" },
        ...(entry.notesHistory || []),
      ].slice(0, 50),
      versions: action === "rollback" ? (entry.versions || []).slice(1) : pushVersion(entry, "Before discard", now),
    });
    if (idx >= 0) queue[idx] = updated;
    writeQueue(store, queue, now);
    appendEnrichmentEditorAudit(store, {
      action: action === "rollback" ? "draft_review_rollback" : "draft_review_discard",
      lessonPlanId: entry.lessonPlanId,
      versionId: entry.revisionId,
      adminEmail: sessionEmail,
      fingerprint: afterPub,
      note: `${action} ${entry.id}`,
    });
    await writeStoreAsync(store);

    return {
      entry: model.listItem(updated),
      publishedUnchanged: beforePub === afterPub,
      lessonCountUnchanged: true,
      activityCountUnchanged: true,
      siteContentUpdatedAt: store.siteContent.updatedAt,
    };
  }

  async function handle(request, response) {
    const body = await readJson(request);
    const action = normalizedShortText(body.action, 40).toLowerCase() || "list";
    const gate = model.phaseGate(action);
    if (gate.blocked) {
      jsonResponse(response, 400, gate);
      return;
    }

    const tokenOk = ["submit", "submit-seed"].includes(action) && acceptSubmitToken(request, body);
    let sessionEmail = "";
    if (tokenOk) {
      sessionEmail = teachingKit.TEACHING_KIT_OWNER_PREVIEW_EMAIL || "leahivie@icloud.com";
    } else {
      const session = requireOwner(request, body, response);
      if (!session) return;
      sessionEmail = normalizeEmail(session.email || "");
    }

    const store = readStore();
    const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());

    if (["submit", "submit-seed", "save-edited", "request-revision", "discard", "rollback", "add-notes", "mark-in-review"].includes(action)) {
      if (!tokenOk && curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
        curriculumConflictResponse(response, siteContent);
        return;
      }
    }

    if (action === "list") {
      jsonResponse(response, 200, {
        ok: true,
        phase: 1,
        publishAvailable: false,
        approveAvailable: false,
        publishUnavailableReason: "Publishing will be added only after the queue workflow is approved (Phase 2).",
        items: readQueue(siteContent).map(model.listItem).filter(Boolean),
        statuses: model.STATUSES.map((s) => ({ id: s, label: model.statusLabel(s) })),
      });
      return;
    }

    if (action === "get" || action === "compare") {
      const queue = readQueue(siteContent);
      const id = normalizedShortText(body.id || body.draftReviewId, 160);
      const lessonPlanId = normalizedShortText(body.lessonPlanId, 160);
      const entry = queue.find((item) => item.id === id)
        || queue.find((item) => item.lessonPlanId === lessonPlanId && !["published", "discarded", "rolled_back"].includes(item.status));
      if (!entry) {
        jsonResponse(response, 404, { error: "Draft not found.", code: "not_found" });
        return;
      }
      const curriculum = siteContent.curriculum || {};
      const plan = (curriculum.lessonPlans || []).find((p) => p.id === entry.lessonPlanId) || null;
      const resources = (curriculum.resources || [])
        .filter((r) => (entry.draftResourceIds || []).includes(r.id) || (r.lessonPlanIds || []).includes(entry.lessonPlanId))
        .map((r) => ({
          ...curriculumResourceMetadata(r),
          status: r.status,
          publicAccess: isCurriculumResourcePublic(r.status) ? "published" : "404",
        }));
      if (action === "compare") {
        jsonResponse(response, 200, {
          ok: true,
          entry: model.listItem(entry),
          compare: model.buildCompare(plan, entry.enrichmentDraft || plan?.enrichmentDraft),
          publishedBodyFingerprint: model.publishedBodyFingerprint(plan),
        });
        return;
      }
      jsonResponse(response, 200, {
        ok: true,
        phase: 1,
        publishAvailable: false,
        entry,
        lessonPlan: plan,
        draftResources: resources,
        enrichmentDraft: entry.enrichmentDraft || plan?.enrichmentDraft || null,
      });
      return;
    }

    if (action === "submit-seed") {
      const batchId = normalizedShortText(body.batchId, 120) || `seed-${new Date().toISOString().slice(0, 10)}`;
      const batchName = normalizedShortText(body.batchName, 180) || "Phase 1 seed — Apples + All About Me";
      const results = [];
      for (const seed of model.LOCAL_SEED_PACKAGES) {
        const packagePayload = loadSeedPackage(seed.packageId);
        const live = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
        const result = await applySubmit({
          store,
          siteContent: live,
          sessionEmail,
          body: {
            lessonPlanId: seed.lessonPlanId,
            title: seed.title,
            age: seed.age,
            theme: seed.theme,
            batchId,
            batchName,
            source: body.source || "cursor-agent",
            submissionKey: `${seed.lessonPlanId}:${batchId}`,
          },
          packagePayload,
        });
        results.push(result.entry);
      }
      jsonResponse(response, 200, {
        ok: true,
        action: "submit-seed",
        phase: 1,
        autoPublished: false,
        batchId,
        items: results,
        siteContentUpdatedAt: store.siteContent.updatedAt,
      });
      return;
    }

    if (action === "submit") {
      try {
        let packagePayload = null;
        if (body.packageId) packagePayload = loadSeedPackage(String(body.packageId).toLowerCase());
        const result = await applySubmit({ store, siteContent, sessionEmail, body, packagePayload });
        jsonResponse(response, 200, { ok: true, action: "submit", phase: 1, autoPublished: false, ...result });
      } catch (error) {
        jsonResponse(response, error.status || 400, {
          ok: false,
          error: error.message || "Submit failed",
          code: error.code || "submit_failed",
          errors: error.errors,
        });
      }
      return;
    }

    const findEntry = () => {
      const queue = readQueue(siteContent);
      const id = normalizedShortText(body.id || body.draftReviewId, 160);
      const idx = queue.findIndex((item) => item.id === id);
      return { queue, idx, entry: idx >= 0 ? queue[idx] : null };
    };

    if (action === "mark-in-review" || action === "add-notes" || action === "request-revision" || action === "save-edited") {
      const { queue, idx, entry } = findEntry();
      if (!entry) {
        jsonResponse(response, 404, { error: "Draft not found.", code: "not_found" });
        return;
      }
      const now = new Date().toISOString();
      const notes = String(body.reviewNotes || body.notes || "").trim();

      if (action === "request-revision" && notes.length < 3) {
        jsonResponse(response, 400, { error: "Review notes are required.", code: "notes_required" });
        return;
      }

      let enrichmentDraft = entry.enrichmentDraft;
      let scores = entry.scores;
      let stats = entry.stats;
      let qualityResults = entry.qualityResults;
      let draftResourceIds = entry.draftResourceIds;
      let versions = entry.versions;

      if (action === "save-edited") {
        const plan = (siteContent.curriculum?.lessonPlans || []).find((p) => p.id === entry.lessonPlanId);
        enrichmentDraft = plan?.enrichmentDraft || entry.enrichmentDraft;
        versions = pushVersion(entry, "Owner saved edited draft", now);
        const scored = score(
          plan,
          (siteContent.curriculum?.activities || []).filter((a) => a.lessonPlanId === entry.lessonPlanId),
          enrichmentDraft,
          siteContent.curriculum?.resources || [],
        );
        scores = scored.scores;
        qualityResults = scored.qualityResults;
        stats = model.buildStats(enrichmentDraft, draftResourceIds);
      }

      let status = entry.status;
      if (action === "mark-in-review") status = "in_review";
      if (action === "request-revision") status = "revision_requested";
      if (action === "save-edited" && status === "revision_requested") status = "revised";
      if (action === "save-edited" && status === "submitted") status = "in_review";

      const updated = model.normalizeEntry({
        ...entry,
        status,
        updatedAt: now,
        enrichmentDraft,
        draftResourceIds,
        versions,
        scores,
        stats,
        qualityResults,
        reviewNotes: notes || entry.reviewNotes,
        notesHistory: notes
          ? [{ at: now, by: sessionEmail, action, note: notes }, ...(entry.notesHistory || [])].slice(0, 50)
          : entry.notesHistory,
      });
      queue[idx] = updated;
      writeQueue(store, queue, now);
      await writeStoreAsync(store);
      jsonResponse(response, 200, {
        ok: true,
        action,
        entry: model.listItem(updated),
        siteContentUpdatedAt: store.siteContent.updatedAt,
        publishedUntouched: true,
      });
      return;
    }

    if (action === "discard" || action === "rollback") {
      const { entry } = findEntry();
      if (!entry) {
        jsonResponse(response, 404, { error: "Draft not found.", code: "not_found" });
        return;
      }
      try {
        const result = await fullRollbackOrDiscard({
          store,
          siteContent,
          entry,
          sessionEmail,
          action,
          notes: String(body.reviewNotes || body.notes || "").trim(),
        });
        jsonResponse(response, 200, { ok: true, action, ...result });
      } catch (error) {
        jsonResponse(response, error.status || 400, {
          ok: false,
          error: error.message || "Failed",
          code: error.code || "action_failed",
        });
      }
      return;
    }

    jsonResponse(response, 400, {
      error: "Unknown action.",
      code: "unsupported_action",
      allowed: model.PHASE1_ACTIONS,
    });
  }

  return { handle };
}

module.exports = { createDraftReviewApi, SEED_ROOT };
