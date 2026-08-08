/**
 * Owner-only Curriculum Draft Review Queue API (Phase 1).
 * Factory so server/index.js can inject store helpers without circular requires.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const draftReview = require("../scripts/teaching-kit-draft-review.js");
const proofPackages = require("../scripts/teaching-kit-proof-draft-import.js");

const ROOT = path.join(__dirname, "..");

function createCurriculumDraftReviewApi(deps) {
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
    parseCurriculumPdfUploadDataUrl,
    sanitizeCurriculumUploadFileName,
    persistCurriculumUploadToMediaAsset,
    usePostgresStore,
    MAX_CURRICULUM_UPLOAD_MB,
    assertCurriculumIntegrityOrError,
    curriculumResourceMetadata,
    cloneJson,
    enrichmentDraftHasContent,
    appendEnrichmentEditorAudit,
    loadEnrichmentHelpers,
    isCurriculumResourcePublic,
    crypto,
  } = deps;

  function readQueue(siteContent) {
    return draftReview.normalizeDraftReviewQueue(siteContent?.curriculumDraftReviews);
  }

  function writeQueue(store, queue, stamp) {
    store.siteContent = store.siteContent || defaultSiteContentStore();
    store.siteContent.curriculumDraftReviews = draftReview.normalizeDraftReviewQueue(queue);
    if (stamp) store.siteContent.updatedAt = stamp;
  }

  function requireOwner(request, body, response) {
    const session = requireTeachingKitOwnerAdminSession(request, body, response);
    if (!session) return null;
    const email = normalizeEmail(session.email || "");
    if (!teachingKit.isTeachingKitOwnerPreviewEmail(email)) {
      jsonResponse(response, 403, {
        error: "Curriculum Draft Review is restricted to the owner account.",
        code: "teaching_kit_owner_required",
      });
      return null;
    }
    return session;
  }

  /** Optional automated submit credential (server env only — never shipped to frontend). */
  function acceptSubmitCredential(request, body) {
    const configured = String(process.env.CURRICULUM_DRAFT_SUBMIT_TOKEN || "").trim();
    if (!configured) return false;
    const header = String(request?.headers?.["x-llh-curriculum-submit-token"] || "").trim();
    const bodyToken = String(body?.submitToken || "").trim();
    const provided = header || bodyToken;
    if (!provided || provided.length !== configured.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(configured));
    } catch {
      return false;
    }
  }

  function scoreEntry(plan, activities, enrichmentDraft, resources) {
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
      return draftReview.buildScoresSummary(report);
    } catch {
      return draftReview.buildScoresSummary(null);
    }
  }

  async function upsertDraftPrintable({
    curriculum,
    plan,
    resourceSpec,
    pdfDataUrl,
    now,
  }) {
    const resourceId = normalizedShortText(resourceSpec.id || resourceSpec.resourceId, 160);
    if (!resourceId) {
      const err = new Error("Printable resource id required.");
      err.code = "resource_id_required";
      throw err;
    }
    const existing = (curriculum.resources || []).find((item) => item.id === resourceId) || null;
    if (existing && existing.status === "published") {
      const err = new Error(`Resource ${resourceId} is already published — Draft Review will not overwrite it.`);
      err.code = "resource_already_published";
      throw err;
    }
    const parsedPdf = parseCurriculumPdfUploadDataUrl(pdfDataUrl);
    if (!parsedPdf) {
      const err = new Error(`A valid PDF is required (max ${MAX_CURRICULUM_UPLOAD_MB} MB).`);
      err.code = "invalid_pdf";
      throw err;
    }
    let pdfFields;
    if (usePostgresStore()) {
      const stored = await persistCurriculumUploadToMediaAsset({
        resourceId,
        parsed: parsedPdf,
        fileName: sanitizeCurriculumUploadFileName(resourceSpec.fileName || "printable.pdf"),
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
        fileData: parsedPdf.fileData,
        mediaAssetId: "",
        mediaUrl: "",
        mimeType: "application/pdf",
        fileName: sanitizeCurriculumUploadFileName(resourceSpec.fileName || "printable.pdf"),
      };
    }
    const resource = normalizedCurriculumResource({
      ...existing,
      id: resourceId,
      title: resourceSpec.title || existing?.title || "Printable",
      resourceCategory: "Printables",
      resourceType: resourceSpec.resourceType || "Picture cards",
      description: resourceSpec.description || "",
      ageGroup: resourceSpec.ageGroup || plan.age || "",
      theme: resourceSpec.theme || plan.theme || "",
      pageCount: resourceSpec.pageCount,
      printingInstructions: resourceSpec.printingInstructions || "",
      accessLevel: "pro",
      ...pdfFields,
      status: "draft",
      publishedAt: "",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lessonPlanIds: existing?.lessonPlanIds || [],
      originalFileName: resourceSpec.fileName || existing?.originalFileName || "",
    });
    let next = normalizedCurriculumStore({
      ...curriculum,
      resources: [...(curriculum.resources || []).filter((item) => item.id !== resourceId), resource],
      updatedAt: now,
    });
    next = linkCurriculumResourceToLessonPlan(next, resourceId, plan.id) || next;
    next = normalizedCurriculumStore({
      ...next,
      resources: (next.resources || []).map((item) => (
        item.id === resourceId
          ? normalizedCurriculumResource({ ...item, status: "draft", publishedAt: "" })
          : item
      )),
      updatedAt: now,
    });
    return { curriculum: next, resourceId };
  }

  async function submitPackage({
    store,
    siteContent,
    sessionEmail,
    body,
    packagePayload,
  }) {
    const now = new Date().toISOString();
    const lessonPlanId = normalizedShortText(
      body.lessonPlanId || packagePayload?.pkg?.lessonPlanId,
      160,
    );
    const createAsNew = body.createAsNewLesson === true;
    if (createAsNew) {
      const err = new Error("Create as new lesson is not available in Phase 1.");
      err.code = "create_new_blocked_phase1";
      err.status = 400;
      throw err;
    }
    if (draftReview.BLOCKED_LESSON_IDS.includes(lessonPlanId)) {
      const err = new Error("Blocked lesson.");
      err.code = "blocked_lesson";
      err.status = 403;
      throw err;
    }

    let curriculum = siteContent.curriculum || { lessonPlans: [], activities: [], resources: [] };
    const plan = (curriculum.lessonPlans || []).find((item) => item.id === lessonPlanId) || null;
    const expected = packagePayload?.pkg || {
      lessonPlanId,
      expectedTitle: body.expectedTitle,
      expectedAge: body.expectedAge,
      expectedTheme: body.expectedTheme,
    };
    const match = draftReview.matchLessonGuard(plan, expected);
    if (!match.ok) {
      const err = new Error("Lesson match failed.");
      err.code = "match_failed";
      err.status = 409;
      err.errors = match.errors;
      throw err;
    }

    const lessonCountBefore = (curriculum.lessonPlans || []).length;
    const activities = (curriculum.activities || []).filter((item) => item.lessonPlanId === lessonPlanId);
    const beforePublished = draftReview.publishedLessonBodyFingerprint(plan);
    const beforeActivities = draftReview.activityLinkFingerprint(plan, activities);
    const previousDraft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? cloneJson(plan.enrichmentDraft)
      : null;

    const enrichmentDraft = draftReview.sanitizeEnrichmentDraftForQueue(
      packagePayload?.enrichmentDraft || body.enrichmentDraft,
      { lastEditedBy: sessionEmail, batchId: body.batchId || "" },
    );
    if (!draftReview.enrichmentDraftHasContent(enrichmentDraft)
      && !enrichmentDraftHasContent(enrichmentDraft)) {
      const err = new Error("enrichmentDraft is empty.");
      err.code = "enrichment_draft_empty";
      err.status = 400;
      throw err;
    }

    const rollbackId = draftReview.generateRollbackId();
    const snapshots = {
      publishedBodyFingerprint: beforePublished,
      activityLinkFingerprint: beforeActivities.fingerprint,
      enrichmentDraftBefore: previousDraft,
      resourceIdsBefore: Array.isArray(plan.resourceIds) ? [...plan.resourceIds] : [],
      resourcesMeta: (curriculum.resources || [])
        .filter((r) => (plan.resourceIds || []).includes(r.id) || (r.lessonPlanIds || []).includes(lessonPlanId))
        .map((r) => ({
          id: r.id,
          status: r.status,
          mediaAssetId: r.mediaAssetId || "",
          title: r.title || "",
          fileName: r.fileName || "",
        })),
      publishedLessonExcerpt: {
        id: plan.id,
        title: plan.title,
        age: plan.age,
        theme: plan.theme,
        status: plan.status,
        updatedAt: plan.updatedAt,
      },
    };

    const draftResourceIds = [];
    if (packagePayload?.pdf && packagePayload?.pkg) {
      const result = await upsertDraftPrintable({
        curriculum,
        plan,
        resourceSpec: {
          id: packagePayload.pkg.resourceId,
          title: packagePayload.pkg.resourceTitle,
          resourceType: packagePayload.pkg.resourceType,
          description: packagePayload.pkg.description,
          ageGroup: packagePayload.pkg.expectedAge,
          theme: packagePayload.pkg.expectedTheme,
          pageCount: packagePayload.pkg.pageCount,
          printingInstructions: packagePayload.pkg.printingInstructions,
          fileName: packagePayload.pdf.fileName,
        },
        pdfDataUrl: packagePayload.pdf.dataUrl,
        now,
      });
      curriculum = result.curriculum;
      draftResourceIds.push(result.resourceId);
    } else if (Array.isArray(body.printables)) {
      for (const printable of body.printables) {
        const result = await upsertDraftPrintable({
          curriculum,
          plan,
          resourceSpec: printable,
          pdfDataUrl: printable.fileData,
          now,
        });
        curriculum = result.curriculum;
        draftResourceIds.push(result.resourceId);
      }
    }

    // Apply enrichmentDraft only (published body fields untouched).
    const previousHistory = Array.isArray(plan.enrichmentPublishHistory)
      ? plan.enrichmentPublishHistory
      : [];
    const historyEntry = {
      versionId: rollbackId,
      kind: "draft_review_snapshot",
      publishedAt: now,
      publishedBy: sessionEmail,
      fingerprint: `draft-review-before:${beforePublished}`,
      lessonPlanId,
      snapshot: {
        enrichmentDraft: previousDraft || {},
        publishedBodyFingerprint: beforePublished,
        activityLinkFingerprint: beforeActivities.fingerprint,
        resourceIds: snapshots.resourceIdsBefore,
      },
    };
    const draftPlan = normalizedCurriculumLessonPlan({
      ...plan,
      enrichmentDraft: {
        ...enrichmentDraft,
        updatedAt: now,
        lastEditedBy: sessionEmail,
      },
      enrichmentPublishHistory: [historyEntry, ...previousHistory].slice(0, 40),
      updatedAt: plan.updatedAt,
    });

    curriculum = normalizedCurriculumStore({
      ...curriculum,
      lessonPlans: (curriculum.lessonPlans || []).map((item) => (
        item.id === lessonPlanId ? { ...draftPlan, updatedAt: plan.updatedAt } : item
      )),
      updatedAt: now,
    });

    if ((curriculum.lessonPlans || []).length !== lessonCountBefore) {
      const err = new Error("Lesson count changed — refusing write.");
      err.code = "lesson_count_changed";
      err.status = 500;
      throw err;
    }
    const integrityError = assertCurriculumIntegrityOrError(curriculum);
    if (integrityError) {
      const err = new Error(integrityError.error || "Integrity failed");
      err.code = integrityError.code || "integrity_failed";
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

    const savedPlan = (store.siteContent.curriculum.lessonPlans || []).find((item) => item.id === lessonPlanId);
    const afterPublished = draftReview.publishedLessonBodyFingerprint(savedPlan);
    if (afterPublished !== beforePublished) {
      const err = new Error("Published body fingerprint changed unexpectedly — refusing to keep write.");
      err.code = "published_body_changed";
      err.status = 500;
      throw err;
    }

    const scores = scoreEntry(
      savedPlan,
      (store.siteContent.curriculum.activities || []).filter((a) => a.lessonPlanId === lessonPlanId),
      savedPlan.enrichmentDraft,
      store.siteContent.curriculum.resources || [],
    );
    const stats = draftReview.buildQueueStats(savedPlan.enrichmentDraft, draftResourceIds);

    const queue = readQueue(store.siteContent);
    const existingIdx = queue.findIndex((item) => item.lessonPlanId === lessonPlanId
      && !["published", "rejected", "rolled_back"].includes(item.status));
    let entry;
    if (existingIdx >= 0) {
      const prior = queue[existingIdx];
      const versions = [
        {
          versionId: `cdr-ver-${crypto.randomBytes(6).toString("hex")}`,
          savedAt: now,
          note: "Replaced by revised submission",
          enrichmentDraft: prior.enrichmentDraft,
          scores: prior.scores,
        },
        ...(prior.draftVersions || []),
      ].slice(0, 20);
      entry = draftReview.normalizeDraftReviewEntry({
        ...prior,
        title: savedPlan.title,
        age: savedPlan.age,
        theme: savedPlan.theme,
        batchId: body.batchId || prior.batchId,
        batchName: body.batchName || prior.batchName,
        source: body.source || prior.source || "cursor-agent",
        status: prior.status === "changes_requested" ? "revised" : "needs_owner_review",
        updatedAt: now,
        rollbackId,
        enrichmentDraft: savedPlan.enrichmentDraft,
        draftResourceIds: [...new Set([...(prior.draftResourceIds || []), ...draftResourceIds])],
        draftVersions: versions,
        snapshots,
        scores,
        stats,
        reviewNotes: prior.reviewNotes || "",
      });
      queue[existingIdx] = entry;
    } else {
      entry = draftReview.normalizeDraftReviewEntry({
        id: draftReview.generateDraftReviewId(),
        lessonPlanId,
        title: savedPlan.title,
        age: savedPlan.age,
        theme: savedPlan.theme,
        batchId: body.batchId || packagePayload?.enrichmentDraft?.batchId || "",
        batchName: body.batchName || "Curriculum draft batch",
        source: body.source || "cursor-agent",
        status: "needs_owner_review",
        receivedAt: now,
        updatedAt: now,
        rollbackId,
        enrichmentDraft: savedPlan.enrichmentDraft,
        draftResourceIds,
        draftVersions: [],
        snapshots,
        scores,
        stats,
        reviewNotes: "",
        ownerNotesHistory: [],
      });
      queue.unshift(entry);
    }

    writeQueue(store, queue, now);
    appendEnrichmentEditorAudit(store, {
      action: "draft_review_submit",
      lessonPlanId,
      versionId: rollbackId,
      adminEmail: sessionEmail,
      fingerprint: afterPublished,
      note: `Draft Review Queue submit (${entry.status}) — published unchanged.`,
    });
    await writeStoreAsync(store);

    return {
      entry: draftReview.queueListItem(entry),
      detail: entry,
      publishedUnchanged: true,
      rollbackId,
      draftResourceIds,
      siteContentUpdatedAt: store.siteContent.updatedAt,
    };
  }

  async function handle(request, response) {
    const body = await readJson(request);
    const action = normalizedShortText(body.action, 40).toLowerCase() || "list";

    const phaseBlock = draftReview.phase1BlocksAction(action);
    if (phaseBlock.blocked) {
      jsonResponse(response, 400, phaseBlock);
      return;
    }

    const submitCredOk = action === "submit" || action === "submit-seed-packages"
      ? acceptSubmitCredential(request, body)
      : false;
    let session = null;
    let sessionEmail = "";
    if (submitCredOk) {
      sessionEmail = teachingKit.TEACHING_KIT_OWNER_PREVIEW_EMAIL || "leahivie@icloud.com";
    } else {
      session = requireOwner(request, body, response);
      if (!session) return;
      sessionEmail = normalizeEmail(session.email || "");
    }

    const store = readStore();
    const siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());

    if (["submit", "submit-seed-packages", "request-revision", "discard", "rollback"].includes(action)) {
      if (!submitCredOk && curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
        curriculumConflictResponse(response, siteContent);
        return;
      }
    }

    if (action === "list") {
      const queue = readQueue(siteContent);
      jsonResponse(response, 200, {
        ok: true,
        phase: 1,
        publishAvailable: false,
        approveAvailable: false,
        items: queue.map(draftReview.queueListItem).filter(Boolean),
        statuses: draftReview.DRAFT_REVIEW_STATUSES.map((s) => ({
          id: s,
          label: draftReview.statusLabel(s),
        })),
      });
      return;
    }

    if (action === "get" || action === "preview" || action === "compare") {
      const queue = readQueue(siteContent);
      const id = normalizedShortText(body.id || body.draftReviewId, 160);
      const lessonPlanId = normalizedShortText(body.lessonPlanId, 160);
      const entry = queue.find((item) => item.id === id)
        || queue.find((item) => item.lessonPlanId === lessonPlanId && !["published", "rejected", "rolled_back"].includes(item.status))
        || null;
      if (!entry) {
        jsonResponse(response, 404, { error: "Draft review entry not found.", code: "not_found" });
        return;
      }
      const curriculum = siteContent.curriculum || {};
      const plan = (curriculum.lessonPlans || []).find((p) => p.id === entry.lessonPlanId) || null;
      const activities = (curriculum.activities || []).filter((a) => a.lessonPlanId === entry.lessonPlanId);
      const resources = (curriculum.resources || []).filter((r) => (
        (entry.draftResourceIds || []).includes(r.id)
        || (plan?.resourceIds || []).includes(r.id)
        || (r.lessonPlanIds || []).includes(entry.lessonPlanId)
      ));
      const draftResources = resources.map((r) => ({
        ...curriculumResourceMetadata(r),
        status: r.status,
        isDraft: r.status !== "published",
        publicAccess: isCurriculumResourcePublic(r.status) ? "published" : "404",
      }));

      if (action === "compare") {
        jsonResponse(response, 200, {
          ok: true,
          entry: draftReview.queueListItem(entry),
          compare: draftReview.buildCompareSummary(plan, entry.enrichmentDraft || plan?.enrichmentDraft),
          snapshots: entry.snapshots,
          publishedBodyFingerprint: draftReview.publishedLessonBodyFingerprint(plan),
        });
        return;
      }

      jsonResponse(response, 200, {
        ok: true,
        phase: 1,
        publishAvailable: false,
        approveAvailable: false,
        entry,
        lessonPlan: plan,
        activities,
        draftResources,
        enrichmentDraft: entry.enrichmentDraft || plan?.enrichmentDraft || null,
        previewHint: {
          openEnrichmentEditor: true,
          lessonPlanId: entry.lessonPlanId,
          viewports: ["desktop", "tablet", "mobile"],
          note: "Use Preview Teaching Kit for the full binder. Draft printables are admin-only (public 404).",
        },
      });
      return;
    }

    if (action === "submit-seed-packages") {
      const batchId = normalizedShortText(body.batchId, 120)
        || `draft-review-seed-${new Date().toISOString().slice(0, 10)}`;
      const batchName = normalizedShortText(body.batchName, 180) || "Proof Two — Draft Review Queue";
      const results = [];
      let stamp = siteContent.updatedAt;
      for (const seed of draftReview.PHASE1_SEED_PACKAGES) {
        const packagePayload = proofPackages.loadPackageFiles(seed.packageId);
        // Refresh site content between submits
        const live = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
        const result = await submitPackage({
          store,
          siteContent: live,
          sessionEmail,
          body: {
            lessonPlanId: seed.lessonPlanId,
            batchId,
            batchName,
            source: body.source || "cursor-agent",
            expectedUpdatedAt: stamp,
          },
          packagePayload,
        });
        stamp = result.siteContentUpdatedAt;
        results.push(result.entry);
      }
      jsonResponse(response, 200, {
        ok: true,
        action: "submit-seed-packages",
        phase: 1,
        batchId,
        batchName,
        items: results,
        publishedUnchanged: true,
        autoPublished: false,
        siteContentUpdatedAt: store.siteContent.updatedAt,
      });
      return;
    }

    if (action === "submit") {
      let packagePayload = null;
      if (body.packageId) {
        packagePayload = proofPackages.loadPackageFiles(String(body.packageId).toLowerCase());
      }
      try {
        const result = await submitPackage({
          store,
          siteContent,
          sessionEmail,
          body,
          packagePayload,
        });
        jsonResponse(response, 200, {
          ok: true,
          action: "submit",
          phase: 1,
          autoPublished: false,
          publishIncluded: false,
          ...result,
        });
      } catch (error) {
        jsonResponse(response, error.status || 400, {
          ok: false,
          error: error.message || "Submit failed",
          code: error.code || "submit_failed",
          errors: error.errors || undefined,
        });
      }
      return;
    }

    if (action === "request-revision") {
      const queue = readQueue(siteContent);
      const id = normalizedShortText(body.id || body.draftReviewId, 160);
      const idx = queue.findIndex((item) => item.id === id);
      if (idx < 0) {
        jsonResponse(response, 404, { error: "Draft review entry not found.", code: "not_found" });
        return;
      }
      const notes = String(body.reviewNotes || body.notes || "").trim();
      if (notes.length < 3) {
        jsonResponse(response, 400, {
          error: "Add review notes before requesting revision.",
          code: "notes_required",
        });
        return;
      }
      const now = new Date().toISOString();
      const entry = {
        ...queue[idx],
        status: "changes_requested",
        statusLabel: draftReview.statusLabel("changes_requested"),
        reviewNotes: notes,
        updatedAt: now,
        ownerNotesHistory: [
          { at: now, by: sessionEmail, action: "request_revision", note: notes },
          ...(queue[idx].ownerNotesHistory || []),
        ].slice(0, 50),
      };
      queue[idx] = draftReview.normalizeDraftReviewEntry(entry);
      writeQueue(store, queue, now);
      await writeStoreAsync(store);
      jsonResponse(response, 200, {
        ok: true,
        action: "request-revision",
        entry: draftReview.queueListItem(queue[idx]),
        siteContentUpdatedAt: store.siteContent.updatedAt,
        publishedUntouched: true,
      });
      return;
    }

    if (action === "discard" || action === "rollback") {
      const queue = readQueue(siteContent);
      const id = normalizedShortText(body.id || body.draftReviewId, 160);
      const idx = queue.findIndex((item) => item.id === id);
      if (idx < 0) {
        jsonResponse(response, 404, { error: "Draft review entry not found.", code: "not_found" });
        return;
      }
      const entry = queue[idx];
      const now = new Date().toISOString();
      let curriculum = siteContent.curriculum || {};
      const plan = (curriculum.lessonPlans || []).find((p) => p.id === entry.lessonPlanId);
      if (!plan) {
        jsonResponse(response, 404, { error: "Lesson not found.", code: "lesson_not_found" });
        return;
      }
      const beforePublished = draftReview.publishedLessonBodyFingerprint(plan);
      const restoreDraft = entry.snapshots?.enrichmentDraftBefore && typeof entry.snapshots.enrichmentDraftBefore === "object"
        ? entry.snapshots.enrichmentDraftBefore
        : null;
      const nextPlan = normalizedCurriculumLessonPlan({
        ...plan,
        enrichmentDraft: draftReview.enrichmentDraftHasContent(restoreDraft) ? {
          ...restoreDraft,
          updatedAt: now,
          lastEditedBy: sessionEmail,
        } : null,
        updatedAt: plan.updatedAt,
      });
      curriculum = normalizedCurriculumStore({
        ...curriculum,
        lessonPlans: (curriculum.lessonPlans || []).map((item) => (
          item.id === entry.lessonPlanId ? { ...nextPlan, updatedAt: plan.updatedAt } : item
        )),
        // Keep draft resources as draft/archived — do not publish; unlink from lesson if discard
        resources: (curriculum.resources || []).map((r) => {
          if (!(entry.draftResourceIds || []).includes(r.id)) return r;
          if (action === "discard" && r.status !== "published") {
            return normalizedCurriculumResource({
              ...r,
              status: "archived",
              lessonPlanIds: (r.lessonPlanIds || []).filter((lid) => lid !== entry.lessonPlanId),
              updatedAt: now,
            });
          }
          return r;
        }),
        updatedAt: now,
      });
      // Also remove draft resource ids from lesson resourceIds on discard
      if (action === "discard") {
        curriculum = normalizedCurriculumStore({
          ...curriculum,
          lessonPlans: (curriculum.lessonPlans || []).map((item) => {
            if (item.id !== entry.lessonPlanId) return item;
            return {
              ...item,
              resourceIds: (item.resourceIds || []).filter((rid) => !(entry.draftResourceIds || []).includes(rid)),
              updatedAt: plan.updatedAt,
            };
          }),
        });
      }

      const writeResult = writeSiteCurriculum(store, curriculum, { updatedAt: now });
      if (writeResult.wipeBlocked) {
        jsonResponse(response, 409, { error: "Wipe blocked", code: "curriculum_wipe_blocked" });
        return;
      }
      const saved = (store.siteContent.curriculum.lessonPlans || []).find((p) => p.id === entry.lessonPlanId);
      const afterPublished = draftReview.publishedLessonBodyFingerprint(saved);
      const nextStatus = action === "rollback" ? "rolled_back" : "rejected";
      queue[idx] = draftReview.normalizeDraftReviewEntry({
        ...entry,
        status: nextStatus,
        updatedAt: now,
        enrichmentDraft: saved?.enrichmentDraft || null,
        ownerNotesHistory: [
          {
            at: now,
            by: sessionEmail,
            action,
            note: String(body.reviewNotes || body.notes || "").trim() || (action === "rollback" ? "Rolled back to pre-submit snapshot" : "Discarded incoming draft"),
          },
          ...(entry.ownerNotesHistory || []),
        ].slice(0, 50),
      });
      writeQueue(store, queue, now);
      appendEnrichmentEditorAudit(store, {
        action: action === "rollback" ? "draft_review_rollback" : "draft_review_discard",
        lessonPlanId: entry.lessonPlanId,
        versionId: entry.rollbackId,
        adminEmail: sessionEmail,
        fingerprint: afterPublished,
        note: `${action} Draft Review entry ${entry.id}`,
      });
      await writeStoreAsync(store);
      jsonResponse(response, 200, {
        ok: true,
        action,
        entry: draftReview.queueListItem(queue[idx]),
        publishedUnchanged: beforePublished === afterPublished,
        siteContentUpdatedAt: store.siteContent.updatedAt,
      });
      return;
    }

    jsonResponse(response, 400, {
      error: "Unknown Draft Review action.",
      code: "unsupported_action",
      allowed: draftReview.PHASE1_ACTIONS,
    });
  }

  return { handle, readQueue };
}

module.exports = {
  createCurriculumDraftReviewApi,
  ROOT,
};
