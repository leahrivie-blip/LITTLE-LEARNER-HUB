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
    enrichmentMedia,
    persistEnrichmentPhotoVariants,
  } = deps;

  function readQueue(siteContent) {
    return model.normalizeQueue(siteContent?.curriculumDraftReviews);
  }

  async function pageCountFromPdfBuffer(buffer) {
    try {
      const { PDFDocument } = require("pdf-lib");
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      return doc.getPageCount() || 0;
    } catch {
      const marker = Buffer.from(buffer).toString("latin1").match(/\/Type\s*\/Page\b/g);
      return marker ? marker.length : 0;
    }
  }

  function pagesComplete(approval, pageCount) {
    const viewed = Array.isArray(approval?.pagesViewed)
      ? approval.pagesViewed.map(Number).filter((n) => n > 0)
      : [];
    const count = Number(pageCount) || Number(approval?.pageCount) || 0;
    if (!count || viewed.length < count) return false;
    for (let i = 1; i <= count; i += 1) {
      if (!viewed.includes(i)) return false;
    }
    return true;
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

  function score(plan, activities, enrichmentDraft, resources, entry = null) {
    try {
      const qualityApi = require("../scripts/teaching-kit-quality-review.js");
      const enrichmentApi = loadEnrichmentHelpers();
      const statusApi = require("../scripts/teaching-kit-status.js");
      const flat = enrichmentApi.flattenLessonActivities
        ? enrichmentApi.flattenLessonActivities(plan, activities, enrichmentDraft)
        : activities;
      // Same authoritative path as Teaching Kit Enrichment Editor.
      const evaluated = qualityApi.evaluateTeachingKit
        ? qualityApi.evaluateTeachingKit(plan, flat, enrichmentDraft, {
          ignoredCodes: Array.isArray(enrichmentDraft?.week?.qualityReviewIgnored)
            ? enrichmentDraft.week.qualityReviewIgnored
            : [],
          resources: resources || [],
        })
        : null;
      const report = evaluated?.report || qualityApi.buildQualityReport(plan, flat, enrichmentDraft, {
        ignoredCodes: Array.isArray(enrichmentDraft?.week?.qualityReviewIgnored)
          ? enrichmentDraft.week.qualityReviewIgnored
          : [],
        resources: resources || [],
      });
      const printableApprovalStatuses = entry?.resourceApprovals && typeof entry.resourceApprovals === "object"
        ? Object.values(entry.resourceApprovals).map((row) => row?.status || "pending")
        : null;
      const summaryForStatus = {
        ...(evaluated?.summary || {}),
        hasDraftOnlyPrintables: Boolean(evaluated?.summary?.hasDraftOnlyPrintables),
        missingPrintables: Boolean(evaluated?.summary?.missingPrintables),
        incompleteActivities: Number(evaluated?.summary?.incompleteActivities) || 0,
      };
      const canonical = statusApi.buildLessonStatus({
        plan,
        activities: flat,
        enrichmentDraft,
        upgradeSummary: summaryForStatus,
        qualityReport: report,
      });
      // Hard rule: never advertise Publish Ready while blocked.
      const workflow = (canonical.blocksPublish || report.blocksPublish)
        && /publish\s*ready|ready for owner/i.test(String(canonical.workflow || ""))
        ? "Needs Changes"
        : canonical.workflow;
      return {
        scores: model.buildScores(report, {
          workflow,
          blocking: canonical.blocking,
          activityCount: flat.length,
          hasDraftOnlyPrintables: summaryForStatus.hasDraftOnlyPrintables,
          missingPrintables: summaryForStatus.missingPrintables,
          incompleteActivities: summaryForStatus.incompleteActivities,
          hasRejectedPrintables: Array.isArray(printableApprovalStatuses)
            && printableApprovalStatuses.some((status) => /revision_requested|rejected|needs_replacement/i.test(String(status || ""))),
          printableApprovalStatuses,
        }),
        qualityResults: {
          overallScore: report.overallScore,
          overallLabel: report.overallLabel,
          publishReadiness: report.publishReadiness,
          blocksPublish: report.blocksPublish === true || canonical.blocksPublish === true,
          structuralScore: report.completionPercent,
          premiumScore: report.premiumReadinessPercent,
          workflow,
          libraryStatus: canonical.libraryStatus || canonical.blocking,
          activityCount: flat.length,
          blockingDetails: model.plainLanguageBlockers(report),
          scoringSource: "evaluateTeachingKit",
        },
      };
    } catch {
      return { scores: model.buildScores(null), qualityResults: null };
    }
  }

  /**
   * Resolve seed:// image refs to persisted enrichment media assets (never leave data: blobs).
   */
  async function attachSeedImages(enrichmentDraft, { lessonPlanId, packageId, store }) {
    if (!enrichmentMedia || typeof persistEnrichmentPhotoVariants !== "function") {
      return enrichmentDraft;
    }
    const draft = model.cloneJson(enrichmentDraft || {});
    const acts = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    const seedDir = path.join(SEED_ROOT, packageId);
    for (const [activityKey, act] of Object.entries(acts)) {
      if (!act || typeof act !== "object") continue;
      for (const field of ["exampleImageUrl", "setupImageUrl"]) {
        const raw = String(act[field] || "").trim();
        const match = raw.match(/^seed:\/\/[^/]+\/(.+)$/i);
        if (!match) continue;
        const filePath = path.join(seedDir, match[1]);
        if (!fs.existsSync(filePath)) {
          act[field] = "";
          continue;
        }
        const buffer = fs.readFileSync(filePath);
        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        const parsed = enrichmentMedia.parseEnrichmentUploadDataUrl(dataUrl);
        if (!parsed?.ok) {
          act[field] = "";
          continue;
        }
        const variants = await enrichmentMedia.buildEnrichmentVariants(parsed.buffer);
        const assetId = enrichmentMedia.enrichmentMediaAssetId();
        await persistEnrichmentPhotoVariants({
          assetId,
          lessonPlanId,
          activityKey,
          field,
          fileName: path.basename(filePath),
          variants,
          store,
        });
        const mediaUrl = enrichmentMedia.enrichmentMediaUrl(assetId, "full");
        const thumbUrl = enrichmentMedia.enrichmentMediaUrl(assetId, "thumb");
        act[field] = mediaUrl;
        if (field === "exampleImageUrl") {
          act.exampleMediaAssetId = assetId;
          act.exampleImageThumbUrl = thumbUrl;
        } else {
          act.setupMediaAssetId = assetId;
          act.setupImageThumbUrl = thumbUrl;
        }
      }
    }
    return draft;
  }

  async function loadSeedPackage(packageId) {
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
    // Align printable IDs with the draft resource we actually create (not legacy proof IDs).
    if (!enrichmentDraft.week || typeof enrichmentDraft.week !== "object") enrichmentDraft.week = {};
    enrichmentDraft.week.printableIds = [seed.resourceId];
    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
    // Proposed daily plan + remove decisions keep queue/editor activity counts aligned
    // without mutating the published lesson body.
    if (parsed.plan?.dailyPlans && typeof parsed.plan.dailyPlans === "object") {
      enrichmentDraft.week.proposedDailyPlans = model.cloneJson(parsed.plan.dailyPlans);
    }
    if (decisions.length) {
      enrichmentDraft.week.activityDecisions = model.cloneJson(decisions);
      enrichmentDraft.week.removedActivityTitles = decisions
        .filter((d) => String(d?.decision || "").toLowerCase() === "remove")
        .map((d) => String(d?.title || "").trim())
        .filter(Boolean);
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    let pageCount = Number(parsed.pageCount) || 0;
    if (!pageCount) pageCount = await pageCountFromPdfBuffer(pdfBuffer);
    return {
      seed,
      enrichmentDraft,
      planSnapshot: parsed.plan || null,
      decisions,
      pdf: {
        fileName: seed.pdfFile,
        dataUrl: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
        sha256: require("crypto").createHash("sha256").update(pdfBuffer).digest("hex"),
        pageCount,
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
    let pageCount = Number(meta.pageCount) || 0;
    if (!pageCount && parsed.buffer) pageCount = await pageCountFromPdfBuffer(parsed.buffer);
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
      pageCount: pageCount || meta.pageCount || existing?.pageCount || 0,
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

    const enrichmentDraftRaw = packagePayload?.enrichmentDraft || body.enrichmentDraft;
    let enrichmentPrepared = enrichmentDraftRaw;
    if (packagePayload?.seed?.packageId && packagePayload?.enrichmentDraft) {
      enrichmentPrepared = await attachSeedImages(packagePayload.enrichmentDraft, {
        lessonPlanId,
        packageId: packagePayload.seed.packageId,
        store,
      });
    }
    // Normalize plan first so flattenLessonActivities uses sourceKey ids (planId:itemId).
    const planForKeys = normalizedCurriculumLessonPlan({ ...plan }) || plan;
    const enrichmentApi = loadEnrichmentHelpers();
    enrichmentPrepared = model.remapEnrichmentActivitiesToPlan(
      planForKeys,
      (curriculum.activities || []).filter((a) => a.lessonPlanId === lessonPlanId),
      enrichmentPrepared,
      enrichmentApi,
    );
    const enrichmentDraft = model.sanitizeDraft(
      enrichmentPrepared,
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
          pageCount: packagePayload.pdf.pageCount || undefined,
          printingInstructions: "Print US Letter, color optional, cut on solid lines.",
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

    const queue = readQueue(store.siteContent);
    const existingIdx = queue.findIndex((item) => item.submissionKey === submissionKey
      || (item.lessonPlanId === lessonPlanId && !["published", "discarded", "rolled_back"].includes(item.status)
        && item.batchId === (body.batchId || item.batchId)));
    const priorResourceIds = existingIdx >= 0 ? (queue[existingIdx].draftResourceIds || []) : [];
    const mergedResourceIds = [...new Set([...priorResourceIds, ...draftResourceIds])];

    const scored = score(
      saved,
      (store.siteContent.curriculum.activities || []).filter((a) => a.lessonPlanId === lessonPlanId),
      saved.enrichmentDraft,
      store.siteContent.curriculum.resources || [],
      existingIdx >= 0 ? queue[existingIdx] : null,
    );
    const lessonActs = (store.siteContent.curriculum.activities || []).filter((a) => a.lessonPlanId === lessonPlanId);
    const stats = model.buildStats(
      saved.enrichmentDraft,
      mergedResourceIds,
      store.siteContent.curriculum.resources || [],
      saved,
      lessonActs,
    );

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
          publishedStatus: saved.status || prior.publishedStatus || "published",
          submissionKey,
          revisionId,
          revisionNumber: (Number(prior.revisionNumber) || Math.max(1, (prior.versions || []).length + 1)) + 1,
          batchId: body.batchId || prior.batchId,
          batchName: body.batchName || prior.batchName,
          source: body.source || prior.source,
          status: prior.status === "revision_requested" || prior.status === "revised" ? "revised" : "submitted",
          updatedAt: now,
          enrichmentDraft: saved.enrichmentDraft,
          draftResourceIds: mergedResourceIds,
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
        publishedStatus: saved.status || "published",
        submissionKey,
        revisionId,
        revisionNumber: 1,
        batchId: body.batchId || "",
        batchName: body.batchName || "Curriculum draft batch",
        source: body.source || "curriculum-tool",
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
        enrichmentDraft: saved.enrichmentDraft,
        draftResourceIds: mergedResourceIds,
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

    // Post-publish rollback restores the entire previous customer-visible lesson + resources.
    if (action === "rollback" && entry.status === "published" && entry.publishSnapshot) {
      const snap = entry.publishSnapshot;
      const restorePublished = snap.enrichmentPublishedBefore
        ? model.cloneJson(snap.enrichmentPublishedBefore)
        : null;
      const restoreDraftFromPublish = snap.enrichmentPublishedApplied
        ? model.cloneJson(snap.enrichmentPublishedApplied)
        : (snap.enrichmentDraftBefore ? model.cloneJson(snap.enrichmentDraftBefore) : null);
      const restoreResourceIds = Array.isArray(snap.draftResourceIds)
        ? snap.draftResourceIds.map(String)
        : (entry.draftResourceIds || []);
      const resourcesMeta = Array.isArray(snap.resourcesMeta) ? snap.resourcesMeta : [];
      let resources = [...(curriculum.resources || [])];
      resources = resources.map((r) => {
        const meta = resourcesMeta.find((m) => m.id === r.id);
        if (!meta) return r;
        // Revert draft printables that were published with this disposable publish.
        if (restoreResourceIds.includes(r.id) && String(meta.status || "") === "draft") {
          return normalizedCurriculumResource({
            ...r,
            status: "draft",
            publishedAt: "",
            updatedAt: now,
          });
        }
        if (meta.status && meta.status !== r.status) {
          return normalizedCurriculumResource({
            ...r,
            status: meta.status,
            publishedAt: meta.status === "published" ? (r.publishedAt || now) : "",
            updatedAt: now,
          });
        }
        return r;
      });
      const nextPlan = normalizedCurriculumLessonPlan({
        ...plan,
        enrichmentPublished: restorePublished,
        enrichmentDraft: model.enrichmentHasContent(restoreDraftFromPublish)
          ? { ...restoreDraftFromPublish, updatedAt: now, lastEditedBy: sessionEmail }
          : null,
        resourceIds: Array.isArray(snap.resourceIdsBefore) ? [...snap.resourceIdsBefore] : (plan.resourceIds || []),
        updatedAt: plan.updatedAt,
      });
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
        const err = new Error("Totals changed during publish rollback.");
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
      const queue = readQueue(store.siteContent);
      const idx = queue.findIndex((item) => item.id === entry.id);
      const updated = model.normalizeEntry({
        ...entry,
        status: "rolled_back",
        updatedAt: now,
        enrichmentDraft: saved?.enrichmentDraft || null,
        draftResourceIds: restoreResourceIds,
        publishSnapshot: null,
        resourceApprovals: {},
        notesHistory: [
          { at: now, by: sessionEmail, action: "rollback_publish", note: notes || "Rolled back published disposable Teaching Kit" },
          ...(entry.notesHistory || []),
        ].slice(0, 50),
      });
      if (idx >= 0) queue[idx] = updated;
      writeQueue(store, queue, now);
      appendEnrichmentEditorAudit(store, {
        action: "draft_review_rollback_publish",
        lessonPlanId: entry.lessonPlanId,
        versionId: entry.revisionId,
        adminEmail: sessionEmail,
        fingerprint: afterPub,
        note: `publish rollback ${entry.id}`,
      });
      await writeStoreAsync(store);
      return {
        entry: model.listItem(updated),
        publishedUnchanged: beforePub === afterPub,
        customerRestored: true,
        previousEnrichmentPublishedRestored: true,
        lessonCountUnchanged: true,
        activityCountUnchanged: true,
        siteContentUpdatedAt: store.siteContent.updatedAt,
      };
    }

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
    let siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());

    // record-printable-pages is intentionally omitted: page inspection persists without stamp races.
    if (["submit", "submit-seed", "save-edited", "request-revision", "discard", "rollback", "add-notes", "mark-in-review", "approve", "publish", "approve-printable", "request-printable-revision", "replace-printable", "ready-for-approval"].includes(action)) {
      if (!tokenOk && curriculumConcurrencyConflict(siteContent, body.expectedUpdatedAt)) {
        curriculumConflictResponse(response, siteContent);
        return;
      }
    }

    if (action === "list") {
      const items = readQueue(siteContent).map(model.listItem).filter(Boolean);
      jsonResponse(response, 200, {
        ok: true,
        phase: 2,
        publishAvailable: true,
        approveAvailable: true,
        publishConfirmPhrase: model.PUBLISH_CONFIRM_PHRASE,
        publishUnavailableReason: "Publish stays disabled while hard blockers remain, and requires owner Approve + typed confirmation.",
        items,
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
      const enrichmentDraft = entry.enrichmentDraft || plan?.enrichmentDraft || null;
      const enrichmentApi = loadEnrichmentHelpers();
      const flat = enrichmentApi.flattenLessonActivities
        ? enrichmentApi.flattenLessonActivities(
          plan,
          (curriculum.activities || []).filter((a) => a.lessonPlanId === entry.lessonPlanId),
          enrichmentDraft,
        )
        : [];
      jsonResponse(response, 200, {
        ok: true,
        phase: 2,
        publishAvailable: true,
        approveAvailable: true,
        publishConfirmPhrase: model.PUBLISH_CONFIRM_PHRASE,
        entry,
        listItem: model.listItem(entry),
        lessonPlan: plan,
        draftResources: resources,
        enrichmentDraft,
        activityCount: flat.length,
        activities: flat.map((a) => ({
          id: a.id,
          itemId: a.itemId,
          title: a.title,
          dayOfWeek: a.dayOfWeek,
        })),
        revisionHistory: [
          {
            revisionId: entry.revisionId,
            revisionNumber: entry.revisionNumber,
            status: entry.status,
            updatedAt: entry.updatedAt,
            newest: true,
          },
          ...(entry.versions || []).map((v, idx) => ({
            revisionId: v.versionId || v.revisionId || `v-${idx}`,
            revisionNumber: Math.max(1, (entry.revisionNumber || 1) - idx - 1),
            status: v.status || "prior",
            updatedAt: v.savedAt || v.updatedAt || "",
            note: v.note || "",
            newest: false,
          })),
        ],
      });
      return;
    }

    if (action === "submit-seed") {
      const batchId = normalizedShortText(body.batchId, 120) || `seed-${new Date().toISOString().slice(0, 10)}`;
      const batchName = normalizedShortText(body.batchName, 180) || "Phase 1 seed — Apples + All About Me";
      const results = [];
      for (const seed of model.LOCAL_SEED_PACKAGES) {
        const packagePayload = await loadSeedPackage(seed.packageId);
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
        if (body.packageId) packagePayload = await loadSeedPackage(String(body.packageId).toLowerCase());
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

    if (action === "mark-in-review" || action === "add-notes" || action === "request-revision" || action === "save-edited" || action === "approve-printable" || action === "request-printable-revision" || action === "record-printable-pages" || action === "ready-for-approval") {
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
      let resourceApprovals = { ...(entry.resourceApprovals || {}) };
      let imageApprovals = { ...(entry.imageApprovals || {}) };

      if (action === "save-edited") {
        let plan = (siteContent.curriculum?.lessonPlans || []).find((p) => p.id === entry.lessonPlanId);
        // Prefer an explicit enrichmentDraft from the owner editor so queue + plan stay aligned.
        // Never auto-publish; this only refreshes the draft review item / enrichmentDraft overlay.
        if (body.enrichmentDraft && typeof body.enrichmentDraft === "object") {
          enrichmentDraft = model.sanitizeDraft
            ? model.sanitizeDraft(body.enrichmentDraft, { lastEditedBy: sessionEmail })
            : model.cloneJson(body.enrichmentDraft);
          if (plan) {
            const curriculum = cloneJson(siteContent.curriculum || { lessonPlans: [], activities: [], resources: [] });
            const planIdx = (curriculum.lessonPlans || []).findIndex((p) => p.id === entry.lessonPlanId);
            if (planIdx >= 0) {
              curriculum.lessonPlans[planIdx] = {
                ...curriculum.lessonPlans[planIdx],
                enrichmentDraft: model.cloneJson(enrichmentDraft),
                updatedAt: now,
              };
              const writeResult = writeSiteCurriculum(store, curriculum, { updatedAt: now });
              if (writeResult?.ok === false) {
                jsonResponse(response, 409, {
                  error: writeResult.error || "Could not save enrichment draft onto the lesson.",
                  code: writeResult.code || "curriculum_write_blocked",
                });
                return;
              }
              siteContent = normalizedSiteContent(store.siteContent || defaultSiteContentStore());
              plan = (siteContent.curriculum?.lessonPlans || []).find((p) => p.id === entry.lessonPlanId) || plan;
            }
          }
        } else {
          enrichmentDraft = plan?.enrichmentDraft || entry.enrichmentDraft;
        }
        versions = pushVersion(entry, "Owner saved edited draft", now);
        const scored = score(
          plan,
          (siteContent.curriculum?.activities || []).filter((a) => a.lessonPlanId === entry.lessonPlanId),
          enrichmentDraft,
          siteContent.curriculum?.resources || [],
          entry,
        );
        scores = scored.scores;
        qualityResults = scored.qualityResults;
        stats = model.buildStats(
          enrichmentDraft,
          draftResourceIds,
          siteContent.curriculum?.resources || [],
          plan,
          (siteContent.curriculum?.activities || []).filter((a) => a.lessonPlanId === entry.lessonPlanId),
        );
      }

      if (action === "record-printable-pages") {
        const resourceId = normalizedShortText(body.resourceId, 160);
        if (!resourceId || !(entry.draftResourceIds || []).includes(resourceId)) {
          jsonResponse(response, 400, { error: "Unknown draft printable.", code: "printable_not_found" });
          return;
        }
        const resource = (siteContent.curriculum?.resources || []).find((r) => r.id === resourceId);
        const pageCount = Number(body.pageCount) || Number(resource?.pageCount) || 0;
        const pagesViewed = Array.isArray(body.pagesViewed)
          ? [...new Set(body.pagesViewed.map(Number).filter((n) => n > 0 && (!pageCount || n <= pageCount)))]
          : [];
        const prev = resourceApprovals[resourceId] || { status: "pending" };
        resourceApprovals[resourceId] = {
          ...prev,
          status: prev.status || "pending",
          pageCount,
          pagesViewed,
          pagesComplete: pagesComplete({ pagesViewed, pageCount }, pageCount),
          checklist: body.checklist && typeof body.checklist === "object" ? body.checklist : (prev.checklist || {}),
          pagesUpdatedAt: now,
          by: sessionEmail,
        };
        // Opening/recording pages never auto-approves.
        if (resourceApprovals[resourceId].status === "approved" && !resourceApprovals[resourceId].pagesComplete) {
          resourceApprovals[resourceId].status = "pending";
        }
      }

      if (action === "approve-printable" || action === "request-printable-revision") {
        const resourceId = normalizedShortText(body.resourceId, 160);
        if (!resourceId || !(entry.draftResourceIds || []).includes(resourceId)) {
          jsonResponse(response, 400, { error: "Unknown draft printable.", code: "printable_not_found" });
          return;
        }
        if (action === "approve-printable") {
          const resource = (siteContent.curriculum?.resources || []).find((r) => r.id === resourceId);
          const pageCount = Number(resource?.pageCount) || Number(resourceApprovals[resourceId]?.pageCount) || 0;
          const approval = resourceApprovals[resourceId] || {};
          if (!pageCount || !pagesComplete(approval, pageCount)) {
            jsonResponse(response, 400, {
              ok: false,
              code: "pages_not_reviewed",
              error: "Inspect every PDF page thumbnail/preview before approving this printable. Opening the file alone is not enough.",
              pageCount,
              pagesViewed: approval.pagesViewed || [],
            });
            return;
          }
        }
        const prev = resourceApprovals[resourceId] || {};
        resourceApprovals[resourceId] = {
          ...prev,
          status: action === "approve-printable" ? "approved" : "revision_requested",
          at: now,
          by: sessionEmail,
          note: notes,
          pagesComplete: action === "approve-printable" ? true : Boolean(prev.pagesComplete),
        };
      }

      if (body.imageKey && body.imageApprovalStatus) {
        imageApprovals[String(body.imageKey)] = {
          status: String(body.imageApprovalStatus),
          at: now,
          by: sessionEmail,
          note: notes,
        };
      }

      let status = entry.status;
      if (action === "mark-in-review") status = "in_review";
      if (action === "request-revision") status = "revision_requested";
      if (action === "ready-for-approval") status = "ready_for_owner_approval";
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
        resourceApprovals,
        imageApprovals,
        reviewNotes: notes || entry.reviewNotes,
        notesHistory: notes || action.startsWith("approve") || action.startsWith("request")
          ? [{ at: now, by: sessionEmail, action, note: notes }, ...(entry.notesHistory || [])].slice(0, 50)
          : entry.notesHistory,
      });
      queue[idx] = updated;
      // Page inspection must not bump siteContent.updatedAt (avoids stamp races with Approve/Publish).
      if (action === "record-printable-pages") {
        writeQueue(store, queue, null);
      } else {
        writeQueue(store, queue, now);
      }
      await writeStoreAsync(store);
      jsonResponse(response, 200, {
        ok: true,
        action,
        entry: updated,
        listItem: model.listItem(updated),
        siteContentUpdatedAt: store.siteContent.updatedAt,
        publishedUntouched: true,
      });
      return;
    }

    if (action === "replace-printable") {
      const { queue, idx, entry } = findEntry();
      if (!entry) {
        jsonResponse(response, 404, { error: "Draft not found.", code: "not_found" });
        return;
      }
      const resourceId = normalizedShortText(body.resourceId, 160);
      if (!resourceId || !(entry.draftResourceIds || []).includes(resourceId)) {
        jsonResponse(response, 400, { error: "Unknown draft printable.", code: "printable_not_found" });
        return;
      }
      const plan = (siteContent.curriculum?.lessonPlans || []).find((p) => p.id === entry.lessonPlanId);
      if (!plan) {
        jsonResponse(response, 404, { error: "Lesson not found.", code: "lesson_not_found" });
        return;
      }
      const dataUrl = body.fileData || body.dataUrl || "";
      const now = new Date().toISOString();
      const existing = (siteContent.curriculum?.resources || []).find((r) => r.id === resourceId);
      try {
        const nextCurriculum = await upsertDraftPdf({
          curriculum: siteContent.curriculum,
          plan,
          resourceId,
          title: body.title || existing?.title || "Printable",
          fileName: body.fileName || existing?.fileName || "printable.pdf",
          dataUrl,
          now,
          meta: {
            resourceType: existing?.resourceType,
            description: existing?.description,
            ageGroup: existing?.ageGroup,
            theme: existing?.theme,
            pageCount: body.pageCount,
            printingInstructions: body.printingInstructions || existing?.printingInstructions || "",
          },
        });
        // Keep enrichment draft / queue entry; only swap the draft PDF bytes + reset page review.
        const writeResult = writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
        if (writeResult.wipeBlocked) {
          jsonResponse(response, 409, { error: "Curriculum wipe blocked.", code: "curriculum_wipe_blocked" });
          return;
        }
        const replaced = (store.siteContent.curriculum.resources || []).find((r) => r.id === resourceId);
        const resourceApprovals = {
          ...(entry.resourceApprovals || {}),
          [resourceId]: {
            status: "pending",
            pagesViewed: [],
            pageCount: Number(replaced?.pageCount) || 0,
            pagesComplete: false,
            checklist: {},
            at: now,
            by: sessionEmail,
            note: "PDF replaced — re-inspect every page before approve",
          },
        };
        const updated = model.normalizeEntry({
          ...entry,
          updatedAt: now,
          resourceApprovals,
          notesHistory: [
            { at: now, by: sessionEmail, action: "replace-printable", note: `Replaced ${resourceId}` },
            ...(entry.notesHistory || []),
          ].slice(0, 50),
        });
        queue[idx] = updated;
        writeQueue(store, queue, now);
        await writeStoreAsync(store);
        jsonResponse(response, 200, {
          ok: true,
          action,
          entry: updated,
          listItem: model.listItem(updated),
          resourceId,
          pageCount: Number(replaced?.pageCount) || 0,
          lessonDraftPreserved: true,
          enrichmentDraftPreserved: model.enrichmentHasContent(entry.enrichmentDraft),
          siteContentUpdatedAt: store.siteContent.updatedAt,
        });
      } catch (error) {
        jsonResponse(response, error.status || 400, {
          ok: false,
          error: error.message || "Replace failed",
          code: error.code || "replace_failed",
        });
      }
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

    if (action === "preview" || action === "printable-review" || action === "image-review") {
      const { entry } = findEntry();
      if (!entry) {
        jsonResponse(response, 404, { error: "Draft not found.", code: "not_found" });
        return;
      }
      const curriculum = siteContent.curriculum || {};
      const plan = (curriculum.lessonPlans || []).find((p) => p.id === entry.lessonPlanId) || null;
      const enrichmentDraft = entry.enrichmentDraft || plan?.enrichmentDraft || null;
      const enrichmentApi = loadEnrichmentHelpers();
      const resources = (curriculum.resources || []).filter((r) => (
        (entry.draftResourceIds || []).includes(r.id) || (r.lessonPlanIds || []).includes(entry.lessonPlanId)
      ));
      const flat = enrichmentApi.flattenLessonActivities
        ? enrichmentApi.flattenLessonActivities(
          plan,
          (curriculum.activities || []).filter((a) => a.lessonPlanId === entry.lessonPlanId),
          enrichmentDraft,
        )
        : [];

      if (action === "preview") {
        const week = enrichmentDraft?.week || {};
        const hideEmpty = (value) => {
          if (value == null) return false;
          if (typeof value === "string") return Boolean(value.trim());
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === "object") return Object.keys(value).length > 0;
          return true;
        };
        const preview = {
          title: plan?.title || entry.title,
          age: plan?.age || entry.age,
          theme: plan?.theme || entry.theme,
          overview: week.weeklyOverview || plan?.weeklyOverview || "",
          objectives: week.objectives || plan?.objectives || "",
          materials: week.weeklyMaterials || plan?.weeklyMaterials || "",
          familyConnection: week.familyConnection || plan?.familyConnection || "",
          teacherToolkit: week.teacherToolkit || null,
          songs: Array.isArray(week.songs) ? week.songs : (plan?.songs || []),
          books: Array.isArray(week.books) ? week.books : (plan?.books || []),
          weekdays: {},
          activities: flat.map((act) => {
            const patch = enrichmentDraft?.activities?.[act.id] || enrichmentDraft?.activities?.[act.itemId] || {};
            return {
              id: act.id,
              itemId: act.itemId,
              title: act.title,
              dayOfWeek: act.dayOfWeek,
              objective: patch.objective || act.objective || "",
              materials: patch.materials || act.materials || "",
              setupImageUrl: patch.setupImageUrl || act.setupImageUrl || "",
              exampleImageUrl: patch.exampleImageUrl || act.exampleImageUrl || "",
              observationPrompts: patch.observationPrompts || act.observationOpportunities || "",
              teacherTips: patch.teacherTips || act.teacherTips || [],
            };
          }),
          printables: resources.map((r) => ({
            id: r.id,
            title: r.title,
            status: r.status,
            pageCount: r.pageCount || 0,
            printingInstructions: r.printingInstructions || "",
          })),
        };
        ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
          const proposed = week.proposedDailyPlans?.[day] || plan?.dailyPlans?.[day] || null;
          if (!proposed) return;
          const dayActs = preview.activities.filter((a) => a.dayOfWeek === day);
          preview.weekdays[day] = {
            theme: proposed.theme || "",
            objectives: proposed.objectives || "",
            materials: proposed.materials || "",
            activities: dayActs,
          };
        });
        Object.keys(preview).forEach((key) => {
          if (key === "weekdays" || key === "activities" || key === "printables") return;
          if (!hideEmpty(preview[key])) delete preview[key];
        });
        jsonResponse(response, 200, {
          ok: true,
          action,
          ownerOnly: true,
          entry: model.listItem(entry),
          preview,
        });
        return;
      }

      if (action === "printable-review") {
        jsonResponse(response, 200, {
          ok: true,
          action,
          entry: model.listItem(entry),
          reviewMode: "every_page_thumbnail",
          note: "Approve requires inspecting every page. Opening the PDF alone does not mark a printable reviewed.",
          printables: resources.map((r) => {
            const approval = entry.resourceApprovals?.[r.id] || { status: "pending" };
            const pageCount = Number(r.pageCount) || Number(approval.pageCount) || 0;
            return {
              id: r.id,
              title: r.title || r.id,
              type: r.resourceType || r.resourceCategory || "Printable",
              status: r.status,
              pageCount,
              printingInstructions: r.printingInstructions || "",
              linkedActivities: flat.filter((a) => {
                const patch = enrichmentDraft?.activities?.[a.id] || {};
                const ids = Array.isArray(patch.printableIds) ? patch.printableIds : (weekPrintableIds(enrichmentDraft));
                return ids.includes(r.id);
              }).map((a) => ({ id: a.id, title: a.title, dayOfWeek: a.dayOfWeek })),
              approval: {
                ...approval,
                pagesComplete: pagesComplete(approval, pageCount),
              },
              dimensions: "US Letter (8.5 × 11 in)",
              publicAccess: isCurriculumResourcePublic(r.status) ? "published" : "owner-only (404 for customers)",
              ownerOnly: !isCurriculumResourcePublic(r.status),
              downloadPath: `/api/admin/curriculum/resources/file?id=${encodeURIComponent(r.id)}`,
              checklistHints: [
                "branding",
                "website address",
                "cut lines",
                "margins",
                "labels",
                "illustrations",
              ],
            };
          }),
        });
        return;
      }

      // image-review
      const images = [];
      const pushImage = (row) => images.push(row);
      if (plan?.coverImageUrl) {
        pushImage({
          group: "Cover",
          url: plan.coverImageUrl,
          thumbUrl: plan.coverImageUrl,
          caption: plan.coverImageCaption || "Lesson cover",
          altText: plan.coverImageAlt || plan.title || "Cover",
          linkedActivity: "",
          purpose: "cover",
          requirement: "optional",
          status: "published",
          approval: entry.imageApprovals?.cover || { status: "pending" },
        });
      }
      flat.forEach((act) => {
        const patch = enrichmentDraft?.activities?.[act.id] || enrichmentDraft?.activities?.[act.itemId] || {};
        const req = String(patch.imageRequirement || act.imageRequirement || "not_needed");
        [
          ["setupImageUrl", "setupImageThumbUrl", "Activity setup images", "setup"],
          ["exampleImageUrl", "exampleImageThumbUrl", "Finished-example images", "finished_example"],
          ["processImageUrl", "processImageThumbUrl", "Activity process images", "process"],
        ].forEach(([field, thumbField, group, purpose]) => {
          const url = patch[field] || act[field] || "";
          if (!url && !["required", "setup_only", "example_only"].includes(req) && purpose !== "process") return;
          if (!url && purpose === "process") return;
          pushImage({
            group,
            url,
            thumbUrl: patch[thumbField] || url,
            caption: patch[`${purpose}Caption`] || `${act.title} · ${purpose}`,
            altText: patch[`${purpose}Alt`] || `${act.title} ${purpose} image`,
            linkedActivity: act.title,
            activityKey: act.id,
            purpose,
            requirement: req,
            status: url ? "draft" : "missing",
            approval: entry.imageApprovals?.[`${act.id}:${purpose}`] || { status: url ? "pending" : "missing" },
          });
        });
      });
      resources.forEach((r) => {
        if (r.previewImageUrl || r.thumbnailUrl) {
          pushImage({
            group: "Printable illustrations",
            url: r.previewImageUrl || r.thumbnailUrl,
            thumbUrl: r.thumbnailUrl || r.previewImageUrl,
            caption: r.title || "Printable",
            altText: r.title || "Printable illustration",
            linkedActivity: "",
            purpose: "printable_illustration",
            requirement: "optional",
            status: r.status,
            approval: entry.imageApprovals?.[`printable:${r.id}`] || { status: "pending" },
          });
        }
      });
      jsonResponse(response, 200, {
        ok: true,
        action,
        entry: model.listItem(entry),
        images,
        groups: ["Cover", "Printable illustrations", "Activity setup images", "Activity process images", "Finished-example images"],
      });
      return;
    }

    if (action === "approve" || action === "publish") {
      const { queue, idx, entry } = findEntry();
      if (!entry) {
        jsonResponse(response, 404, { error: "Draft not found.", code: "not_found" });
        return;
      }
      const now = new Date().toISOString();
      const curriculum = siteContent.curriculum || {};
      const plan = (curriculum.lessonPlans || []).find((p) => p.id === entry.lessonPlanId) || null;
      const scored = score(
        plan,
        (curriculum.activities || []).filter((a) => a.lessonPlanId === entry.lessonPlanId),
        entry.enrichmentDraft || plan?.enrichmentDraft,
        curriculum.resources || [],
        entry,
      );
      const stats = model.buildStats(
        entry.enrichmentDraft || plan?.enrichmentDraft,
        entry.draftResourceIds || [],
        curriculum.resources || [],
        plan,
        (curriculum.activities || []).filter((a) => a.lessonPlanId === entry.lessonPlanId),
      );

      if (action === "approve") {
        const remaining = (scored.scores?.blockerDetails || []).filter((b) => {
          if (b.code !== "draft_printables_only") return true;
          const ids = entry.draftResourceIds || [];
          if (!ids.length) return true;
          return ids.some((id) => entry.resourceApprovals?.[id]?.status !== "approved");
        });
        if (remaining.length) {
          jsonResponse(response, 400, {
            ok: false,
            code: "hard_blockers",
            error: "Cannot approve while hard blockers remain.",
            blockers: remaining,
          });
          return;
        }
        const updated = model.normalizeEntry({
          ...entry,
          status: "approved",
          approvedAt: now,
          updatedAt: now,
          scores: scored.scores,
          stats,
          qualityResults: scored.qualityResults,
          notesHistory: [
            { at: now, by: sessionEmail, action: "approve", note: String(body.reviewNotes || "").trim() },
            ...(entry.notesHistory || []),
          ].slice(0, 50),
        });
        queue[idx] = updated;
        writeQueue(store, queue, now);
        await writeStoreAsync(store);
        jsonResponse(response, 200, {
          ok: true,
          action,
          entry: updated,
          listItem: model.listItem(updated),
          siteContentUpdatedAt: store.siteContent.updatedAt,
        });
        return;
      }

      // publish
      const confirm = String(body.confirmPhrase || body.confirmationPhrase || "").trim();
      if (confirm !== model.PUBLISH_CONFIRM_PHRASE) {
        jsonResponse(response, 400, {
          ok: false,
          code: "confirm_phrase_required",
          error: `Type exactly: ${model.PUBLISH_CONFIRM_PHRASE}`,
          publishConfirmPhrase: model.PUBLISH_CONFIRM_PHRASE,
        });
        return;
      }
      if (entry.status !== "approved" && body.forceApproved !== true) {
        jsonResponse(response, 400, {
          ok: false,
          code: "approve_required",
          error: "Owner must Approve before Publish.",
        });
        return;
      }
      const draftResourceIds = entry.draftResourceIds || [];
      const remaining = (scored.scores?.blockerDetails || []).filter((b) => {
        if (b.code !== "draft_printables_only") return true;
        if (!draftResourceIds.length) return true;
        return draftResourceIds.some((id) => entry.resourceApprovals?.[id]?.status !== "approved");
      });
      if (remaining.length) {
        jsonResponse(response, 400, {
          ok: false,
          code: "hard_blockers",
          error: "Publish disabled while hard blockers remain.",
          blockers: remaining,
        });
        return;
      }

      const unapprovedPrintables = draftResourceIds.filter((id) => {
        const approval = entry.resourceApprovals?.[id];
        return !(approval && approval.status === "approved");
      });
      // Publish draft printables only when owner explicitly includes them after approval.
      const publishPrintables = body.publishPrintables === true;
      if (draftResourceIds.length && unapprovedPrintables.length) {
        jsonResponse(response, 400, {
          ok: false,
          code: "printable_dependency",
          error: "Draft printables must be approved in Printable Review before they can publish with the lesson.",
          unapprovedPrintables,
        });
        return;
      }
      if (draftResourceIds.length && !publishPrintables) {
        jsonResponse(response, 400, {
          ok: false,
          code: "printable_publish_confirmation",
          error: "This lesson has approved draft printables. Confirm publishPrintables:true to make them customer-visible, or publish enrichment only after detaching them.",
          approvedPrintables: draftResourceIds,
        });
        return;
      }

      const beforePub = model.publishedBodyFingerprint(plan);
      const appliedEnrichment = model.cloneJson(entry.enrichmentDraft || plan.enrichmentDraft || {});
      const publishSnapshot = {
        at: now,
        by: sessionEmail,
        publishedBodyFingerprint: beforePub,
        enrichmentDraftBefore: plan?.enrichmentDraft ? model.cloneJson(plan.enrichmentDraft) : null,
        enrichmentPublishedBefore: plan?.enrichmentPublished ? model.cloneJson(plan.enrichmentPublished) : null,
        enrichmentPublishedApplied: appliedEnrichment,
        draftResourceIds: [...draftResourceIds],
        resourceIdsBefore: Array.isArray(plan?.resourceIds) ? [...plan.resourceIds] : [],
        resourcesMeta: (curriculum.resources || [])
          .filter((r) => draftResourceIds.includes(r.id) || (plan?.resourceIds || []).includes(r.id))
          .map((r) => ({ id: r.id, status: r.status, title: r.title || "", pageCount: Number(r.pageCount) || 0 })),
        lessonPlan: model.cloneJson({
          ...plan,
          enrichmentDraft: undefined,
          enrichmentPublished: plan?.enrichmentPublished || null,
        }),
      };

      let nextPlan = normalizedCurriculumLessonPlan({
        ...plan,
        enrichmentPublished: appliedEnrichment,
        enrichmentDraft: null,
        resourceIds: Array.from(new Set([
          ...(Array.isArray(plan?.resourceIds) ? plan.resourceIds : []),
          ...(publishPrintables ? draftResourceIds : []),
        ])),
        updatedAt: now,
        publishedAt: plan.publishedAt || now,
      });
      let resources = [...(curriculum.resources || [])];
      if (publishPrintables) {
        resources = resources.map((r) => {
          if (!draftResourceIds.includes(r.id)) return r;
          return normalizedCurriculumResource({
            ...r,
            status: "published",
            publishedAt: now,
            updatedAt: now,
          });
        });
      }

      const nextCurriculum = normalizedCurriculumStore({
        ...curriculum,
        lessonPlans: (curriculum.lessonPlans || []).map((item) => (
          item.id === entry.lessonPlanId ? nextPlan : item
        )),
        resources,
        updatedAt: now,
      });
      const integrity = assertCurriculumIntegrityOrError(nextCurriculum);
      if (integrity) {
        jsonResponse(response, 400, integrity);
        return;
      }
      const writeResult = writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
      if (writeResult.wipeBlocked) {
        jsonResponse(response, 409, { error: "Curriculum wipe blocked.", code: "curriculum_wipe_blocked" });
        return;
      }

      const updated = model.normalizeEntry({
        ...entry,
        status: "published",
        publishedAt: now,
        updatedAt: now,
        publishSnapshot,
        enrichmentDraft: null,
        scores: scored.scores,
        stats,
        qualityResults: scored.qualityResults,
        notesHistory: [
          { at: now, by: sessionEmail, action: "publish", note: publishPrintables ? "Published with printables" : "Published lesson enrichment only" },
          ...(entry.notesHistory || []),
        ].slice(0, 50),
      });
      queue[idx] = updated;
      writeQueue(store, queue, now);
      appendEnrichmentEditorAudit(store, {
        action: "draft_review_publish",
        lessonPlanId: entry.lessonPlanId,
        versionId: entry.revisionId,
        adminEmail: sessionEmail,
        fingerprint: model.publishedBodyFingerprint(nextPlan),
        note: "Owner publish from Draft Review Queue",
      });
      await writeStoreAsync(store);
      jsonResponse(response, 200, {
        ok: true,
        action,
        entry: updated,
        listItem: model.listItem(updated),
        publishedResources: publishPrintables ? draftResourceIds : [],
        customerVisible: {
          lessonPlanId: entry.lessonPlanId,
          title: entry.title,
          enrichmentPublished: true,
          printablesPublished: publishPrintables ? draftResourceIds : [],
        },
        siteContentUpdatedAt: store.siteContent.updatedAt,
      });
      return;
    }

    jsonResponse(response, 400, {
      error: "Unknown action.",
      code: "unsupported_action",
      allowed: model.OWNER_ACTIONS || model.PHASE1_ACTIONS,
    });
  }

  function weekPrintableIds(enrichmentDraft) {
    const week = enrichmentDraft?.week && typeof enrichmentDraft.week === "object" ? enrichmentDraft.week : {};
    return Array.isArray(week.printableIds) ? week.printableIds.map(String) : [];
  }

  return { handle };
}

module.exports = { createDraftReviewApi, SEED_ROOT };
