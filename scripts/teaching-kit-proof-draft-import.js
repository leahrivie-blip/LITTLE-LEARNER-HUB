/**
 * Owner-only Proof Draft Import helpers (Amazing Apples + All About Me only).
 *
 * Safety contract:
 * - Never creates lessons
 * - Never publishes lessons or resources
 * - Never touches Farm Animals
 * - Enrichment lands in enrichmentDraft only
 * - Printables land as status=draft only
 * - Packages are an explicit allowlist of two proof lessons
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PROOF_ROOT = path.join(ROOT, "docs/teaching-kit/qa/next-10-gold-upgrade/proof");

const CONFIRM_ENRICHMENT_PHRASE = "IMPORT ENRICHMENT DRAFT";
const CONFIRM_PRINTABLE_PHRASE = "IMPORT DRAFT PRINTABLE";

const BLOCKED_LESSON_IDS = Object.freeze([
  "cur-lp-preschool-farm-animals",
  "cur-lp-toddler-farm-friends",
]);

const PROOF_PACKAGES = Object.freeze([
  {
    packageId: "amazing-apples",
    lessonPlanId: "cur-lp-toddler-amazing-apples",
    expectedTitle: "Amazing Apples",
    expectedAge: "Toddler",
    expectedTheme: "Apples",
    enrichmentRelativePath: "amazing-apples/enrichment-draft.json",
    pdfRelativePath: "amazing-apples/Amazing-Apples-Picture-Card-Pack.pdf",
    resourceId: "cur-res-proof-amazing-apples-picture-cards",
    resourceTitle: "Amazing Apples Picture Card Pack",
    resourceType: "Picture cards",
    pageCount: 6,
    printingInstructions: "US Letter, color preferred. Cut on guides. Laminate optional for centers.",
    description: "Color cards, life-cycle sequence, and growth panels for Amazing Apples toddler week.",
  },
  {
    packageId: "all-about-me",
    lessonPlanId: "cur-lp-preschool-all-about-me",
    expectedTitle: "All About Me",
    expectedAge: "Preschool",
    expectedTheme: "All About Me",
    enrichmentRelativePath: "all-about-me/enrichment-draft.json",
    pdfRelativePath: "all-about-me/All-About-Me-Picture-Card-Pack.pdf",
    resourceId: "cur-res-proof-all-about-me-picture-cards",
    resourceTitle: "All About Me Picture Card Pack",
    resourceType: "Picture cards",
    pageCount: 16,
    printingInstructions: "US Letter, color preferred. Cut on guides. Laminate optional for centers.",
    description: "Inclusive faces, families, interests, and affirmation cards for All About Me preschool week.",
  },
]);

function packageById(packageId) {
  const id = String(packageId || "").trim().toLowerCase();
  return PROOF_PACKAGES.find((item) => item.packageId === id) || null;
}

function listPackageSummaries() {
  return PROOF_PACKAGES.map((pkg) => ({
    packageId: pkg.packageId,
    lessonPlanId: pkg.lessonPlanId,
    expectedTitle: pkg.expectedTitle,
    expectedAge: pkg.expectedAge,
    expectedTheme: pkg.expectedTheme,
    resourceId: pkg.resourceId,
    resourceTitle: pkg.resourceTitle,
    enrichmentPath: pkg.enrichmentRelativePath,
    pdfPath: pkg.pdfRelativePath,
    pageCount: pkg.pageCount,
  }));
}

function sha256Short(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 24);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function normalizeMatchText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Customer-visible published body (excludes admin-only enrichment draft channels).
 * resourceIds and updatedAt are tracked separately: draft printable linking appends
 * an ID and may bump updatedAt without changing published lesson content.
 */
function publishedLessonBodyPayload(plan) {
  if (!plan || typeof plan !== "object") return {};
  const {
    enrichmentDraft: _d,
    enrichmentDraftUndo: _u,
    enrichmentPublishHistory: _h,
    enrichmentPublished: _p,
    resourceIds: _r,
    updatedAt: _updatedAt,
    ...rest
  } = plan;
  return cloneJson(rest);
}

function publishedLessonBodyFingerprint(plan) {
  return sha256Short(JSON.stringify(publishedLessonBodyPayload(plan)));
}

function activityLinkFingerprint(plan, activities) {
  const planId = String(plan?.id || "");
  const linked = (activities || [])
    .filter((item) => item && item.lessonPlanId === planId)
    .map((item) => ({
      id: item.id,
      itemId: item.itemId || "",
      sourceKey: item.sourceKey || "",
      title: item.title || "",
      dayOfWeek: item.dayOfWeek || "",
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const dailyKeys = [];
  const days = plan?.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  Object.keys(days).sort().forEach((day) => {
    (days[day]?.items || []).forEach((item) => {
      dailyKeys.push({
        day,
        itemId: item.itemId || item.id || "",
        title: item.title || "",
      });
    });
  });
  return {
    fingerprint: sha256Short(JSON.stringify({ linked, dailyKeys })),
    linkedActivityCount: linked.length,
    dailyItemCount: dailyKeys.length,
    dailyKeys,
  };
}

function loadPackageFiles(packageId) {
  const pkg = packageById(packageId);
  if (!pkg) {
    const error = new Error(`Unknown proof package: ${packageId}`);
    error.code = "unknown_package";
    throw error;
  }
  if (BLOCKED_LESSON_IDS.includes(pkg.lessonPlanId)) {
    const error = new Error("Blocked lesson — Farm Animals and related lessons cannot be imported.");
    error.code = "blocked_lesson";
    throw error;
  }
  const enrichmentPath = path.join(PROOF_ROOT, pkg.enrichmentRelativePath);
  const pdfPath = path.join(PROOF_ROOT, pkg.pdfRelativePath);
  if (!fs.existsSync(enrichmentPath)) {
    const error = new Error(`Missing enrichment package file: ${pkg.enrichmentRelativePath}`);
    error.code = "missing_enrichment_file";
    throw error;
  }
  if (!fs.existsSync(pdfPath)) {
    const error = new Error(`Missing PDF package file: ${pkg.pdfRelativePath}`);
    error.code = "missing_pdf_file";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(enrichmentPath, "utf8"));
  } catch (err) {
    const error = new Error(`Invalid enrichment JSON: ${err.message}`);
    error.code = "invalid_enrichment_json";
    throw error;
  }
  const enrichmentDraft = parsed?.enrichmentDraft && typeof parsed.enrichmentDraft === "object"
    ? parsed.enrichmentDraft
    : null;
  if (!enrichmentDraft) {
    const error = new Error("Package enrichmentDraft is missing.");
    error.code = "missing_enrichment_draft";
    throw error;
  }
  const packagePlanId = String(parsed.planId || parsed.plan?.id || "").trim();
  if (packagePlanId && packagePlanId !== pkg.lessonPlanId) {
    const error = new Error(
      `Package planId mismatch: package says ${packagePlanId}, allowlist expects ${pkg.lessonPlanId}`,
    );
    error.code = "package_plan_id_mismatch";
    throw error;
  }
  const pdfBuffer = fs.readFileSync(pdfPath);
  return {
    pkg,
    enrichmentDraft,
    packageMeta: {
      planId: packagePlanId || pkg.lessonPlanId,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      packageTitle: parsed.plan?.title || pkg.expectedTitle,
      packageAge: parsed.plan?.age || pkg.expectedAge,
      packageTheme: parsed.plan?.theme || pkg.expectedTheme,
    },
    pdf: {
      path: pdfPath,
      fileName: path.basename(pdfPath),
      byteLength: pdfBuffer.length,
      sha256: crypto.createHash("sha256").update(pdfBuffer).digest("hex"),
      dataUrl: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    },
  };
}

function matchProductionLesson(plan, pkg) {
  const errors = [];
  if (!plan) {
    errors.push({
      code: "lesson_not_found",
      message: `Production lesson ${pkg.lessonPlanId} was not found. Import never creates lessons.`,
    });
    return { ok: false, errors };
  }
  if (BLOCKED_LESSON_IDS.includes(plan.id) || BLOCKED_LESSON_IDS.includes(pkg.lessonPlanId)) {
    errors.push({
      code: "blocked_lesson",
      message: "Farm Animals (and related) lessons are blocked from this import.",
    });
  }
  if (String(plan.id) !== pkg.lessonPlanId) {
    errors.push({
      code: "lesson_id_mismatch",
      message: `Lesson id mismatch: found ${plan.id}, expected ${pkg.lessonPlanId}`,
    });
  }
  if (normalizeMatchText(plan.age || plan.ageBucket) !== normalizeMatchText(pkg.expectedAge)) {
    errors.push({
      code: "age_mismatch",
      message: `Age mismatch: found "${plan.age || plan.ageBucket}", expected "${pkg.expectedAge}"`,
    });
  }
  if (normalizeMatchText(plan.theme) !== normalizeMatchText(pkg.expectedTheme)) {
    errors.push({
      code: "theme_mismatch",
      message: `Theme mismatch: found "${plan.theme}", expected "${pkg.expectedTheme}"`,
    });
  }
  if (normalizeMatchText(plan.title) !== normalizeMatchText(pkg.expectedTitle)) {
    errors.push({
      code: "title_mismatch",
      message: `Title mismatch: found "${plan.title}", expected "${pkg.expectedTitle}"`,
    });
  }
  return { ok: errors.length === 0, errors };
}

function collectLocalFileUrls(value, out = []) {
  if (typeof value === "string") {
    if (/^file:\/\//i.test(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectLocalFileUrls(item, out));
    return out;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectLocalFileUrls(item, out));
  }
  return out;
}

function stripLocalFileUrls(value) {
  if (typeof value === "string") {
    return /^file:\/\//i.test(value) ? "" : value;
  }
  if (Array.isArray(value)) return value.map((item) => stripLocalFileUrls(item));
  if (value && typeof value === "object") {
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = stripLocalFileUrls(value[key]);
    });
    return next;
  }
  return value;
}

function sanitizeEnrichmentDraftForImport(draft, { lastEditedBy = "" } = {}) {
  const cleaned = stripLocalFileUrls(cloneJson(draft || {}));
  cleaned.updatedAt = new Date().toISOString();
  if (lastEditedBy) cleaned.lastEditedBy = lastEditedBy;
  cleaned.importChannel = "proof_draft_import";
  cleaned.importBatch = "proof-two-revision";
  return cleaned;
}

function summarizeEnrichmentFields(draft) {
  const activities = draft?.activities && typeof draft.activities === "object" ? draft.activities : {};
  const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
  const activityKeys = Object.keys(activities);
  const weekKeys = Object.keys(week).filter((key) => {
    const value = week[key];
    if (value == null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
  const fieldTouches = [];
  activityKeys.forEach((key) => {
    const act = activities[key] || {};
    Object.keys(act).forEach((field) => {
      fieldTouches.push({ scope: "activity", activityKey: key, field });
    });
  });
  weekKeys.forEach((field) => fieldTouches.push({ scope: "week", field }));
  return {
    activityKeyCount: activityKeys.length,
    weekKeyCount: weekKeys.length,
    activityKeys: activityKeys.slice(0, 200),
    weekKeys,
    fieldTouchCount: fieldTouches.length,
    fieldTouches: fieldTouches.slice(0, 400),
  };
}

function activityKeyCoverage(plan, draft) {
  const days = plan?.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  const productionKeys = new Set();
  Object.keys(days).forEach((day) => {
    (days[day]?.items || []).forEach((item) => {
      const itemId = item.itemId || item.id || "";
      if (!itemId) return;
      productionKeys.add(`${plan.id}:${day}:${itemId}`);
      productionKeys.add(itemId);
    });
  });
  const draftKeys = Object.keys(draft?.activities || {});
  const matched = [];
  const unmatched = [];
  draftKeys.forEach((key) => {
    if (productionKeys.has(key)) matched.push(key);
    else unmatched.push(key);
  });
  return {
    productionKeyCount: productionKeys.size,
    draftActivityKeyCount: draftKeys.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatchedSample: unmatched.slice(0, 40),
  };
}

function buildDryRunReport({ plan, activities, packagePayload, existingResource }) {
  const { pkg, enrichmentDraft, packageMeta, pdf } = packagePayload;
  const match = matchProductionLesson(plan, pkg);
  const localFileUrls = collectLocalFileUrls(enrichmentDraft);
  const sanitizedDraft = sanitizeEnrichmentDraftForImport(enrichmentDraft);
  const enrichmentSummary = summarizeEnrichmentFields(sanitizedDraft);
  const coverage = activityKeyCoverage(plan, sanitizedDraft);
  const publishedFingerprint = publishedLessonBodyFingerprint(plan);
  const activityFp = activityLinkFingerprint(plan, activities);
  const previousDraftFingerprint = enrichmentDraftHasContent(plan?.enrichmentDraft)
    ? sha256Short(JSON.stringify(plan.enrichmentDraft))
    : "";
  const nextDraftFingerprint = sha256Short(JSON.stringify(sanitizedDraft));

  const enrichmentChanges = [
    {
      channel: "enrichmentDraft",
      action: previousDraftFingerprint ? "replace_enrichment_draft" : "set_enrichment_draft",
      beforeFingerprint: previousDraftFingerprint || null,
      afterFingerprint: nextDraftFingerprint,
      ...enrichmentSummary,
    },
  ];
  if (localFileUrls.length) {
    enrichmentChanges.push({
      channel: "enrichmentDraft.media",
      action: "strip_local_file_urls",
      count: localFileUrls.length,
      sample: localFileUrls.slice(0, 8),
      note: "file:// example images are stripped on import; re-attach via Enrichment Editor if needed.",
    });
  }

  const printableChanges = [];
  if (existingResource) {
    printableChanges.push({
      channel: "resource",
      action: existingResource.status === "published"
        ? "blocked_published_resource"
        : "replace_draft_pdf_and_relink",
      resourceId: pkg.resourceId,
      beforeStatus: existingResource.status || "",
      afterStatus: "draft",
      pdfSha256: pdf.sha256,
      pdfBytes: pdf.byteLength,
    });
  } else {
    printableChanges.push({
      channel: "resource",
      action: "create_draft_printable_and_link",
      resourceId: pkg.resourceId,
      afterStatus: "draft",
      title: pkg.resourceTitle,
      pdfSha256: pdf.sha256,
      pdfBytes: pdf.byteLength,
      lessonPlanId: pkg.lessonPlanId,
    });
  }
  printableChanges.push({
    channel: "lesson.resourceIds",
    action: "ensure_linked",
    resourceId: pkg.resourceId,
    note: "Draft resource id is appended for Admin linking. Public library still hides non-published resources.",
  });

  const blocked = !match.ok
    || (existingResource && existingResource.status === "published");

  return {
    ok: match.ok,
    blocked,
    blockReasons: [
      ...match.errors,
      ...(existingResource && existingResource.status === "published"
        ? [{
          code: "resource_already_published",
          message: `Resource ${pkg.resourceId} is already published. This workflow never creates temporary published records or overwrites published printables.`,
        }]
        : []),
    ],
    packageId: pkg.packageId,
    lessonPlanId: pkg.lessonPlanId,
    packageMeta,
    match,
    before: {
      publishedBodyFingerprint: publishedFingerprint,
      activityLinkFingerprint: activityFp.fingerprint,
      linkedActivityCount: activityFp.linkedActivityCount,
      dailyItemCount: activityFp.dailyItemCount,
      enrichmentDraftFingerprint: previousDraftFingerprint || null,
      resourceIds: Array.isArray(plan?.resourceIds) ? [...plan.resourceIds] : [],
      existingResource: existingResource
        ? {
          id: existingResource.id,
          status: existingResource.status,
          title: existingResource.title,
          updatedAt: existingResource.updatedAt || "",
        }
        : null,
    },
    enrichmentWouldChange: enrichmentChanges,
    printableWouldChange: printableChanges,
    activityKeyCoverage: coverage,
    publishedFieldsPreserved: [
      "title", "age", "theme", "status", "dailyPlans", "books", "songs",
      "weeklyOverview", "objectives", "weeklyMaterials", "vocabularyWords",
      "familyConnection", "observationOpportunities", "adaptations",
      "learningDomains", "coverImageUrl", "coverImageAlt", "activityIds",
      "teachingKit (published)", "calendar references", "version history entries retained",
    ],
    neverDoes: [
      "create_duplicate_lesson",
      "replace_published_lesson",
      "publish_enrichment",
      "publish_printable",
      "create_temporary_published_resource",
      "modify_farm_animals",
      "import_other_eight_lessons",
    ],
    confirmPhrases: {
      enrichment: CONFIRM_ENRICHMENT_PHRASE,
      printable: CONFIRM_PRINTABLE_PHRASE,
    },
  };
}

function enrichmentDraftHasContent(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
  const activities = draft.activities && typeof draft.activities === "object" && !Array.isArray(draft.activities)
    ? draft.activities
    : {};
  if (Object.keys(activities).length > 0) {
    return Object.values(activities).some((act) => act && typeof act === "object" && Object.keys(act).length > 0);
  }
  const week = draft.week && typeof draft.week === "object" && !Array.isArray(draft.week) ? draft.week : {};
  return Object.keys(week).some((key) => {
    const value = week[key];
    if (value == null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}

function buildRollbackInstructions({ lessonPlanId, rollbackId, resourceId, publishedBodyFingerprint }) {
  return {
    enrichmentDraft: {
      endpoint: "POST /api/admin/curriculum/enrichment-rollback",
      body: {
        planId: lessonPlanId,
        versionId: rollbackId,
      },
      note: "Restores the pre-import enrichmentDraft snapshot only. Does not publish. Does not delete the draft printable.",
    },
    printable: {
      endpoint: "POST /api/admin/curriculum/resources/tk-printable",
      unlinkBody: {
        action: "unlink",
        lessonPlanId,
        resourceId,
      },
      note: "Unlink or archive the draft printable after review. Never required to restore published lesson body.",
    },
    publishedBodyFingerprint,
    reminder: "Published lesson body must remain unchanged. If publishedBodyFingerprint differs after import, stop and investigate before any further writes.",
  };
}

module.exports = {
  PROOF_ROOT,
  PROOF_PACKAGES,
  BLOCKED_LESSON_IDS,
  CONFIRM_ENRICHMENT_PHRASE,
  CONFIRM_PRINTABLE_PHRASE,
  packageById,
  listPackageSummaries,
  loadPackageFiles,
  matchProductionLesson,
  publishedLessonBodyFingerprint,
  publishedLessonBodyPayload,
  activityLinkFingerprint,
  sanitizeEnrichmentDraftForImport,
  collectLocalFileUrls,
  buildDryRunReport,
  enrichmentDraftHasContent,
  buildRollbackInstructions,
  sha256Short,
};
