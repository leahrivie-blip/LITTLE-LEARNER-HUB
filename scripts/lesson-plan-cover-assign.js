/**
 * Deterministic lesson-plan cover assignment for imports.
 *
 * Reuses the existing illustrated JPG/SVG library — never calls image APIs,
 * never writes new image files, and never duplicates assets on disk.
 *
 * Priority (same as display resolver):
 *   1. Explicit coverImageUrl already on the plan
 *   2. Catalog match by exact title → /images/lesson-covers/{slug}.jpg
 *   3. Theme/title keyword rules → illustrated JPG when available, else SVG
 *   4. Age-group illustrated fallback (generic-* SVG)
 *   5. Brand default SVG
 *
 * Browser: globalThis.LlhLessonPlanCoverAssign
 * Node: module.exports
 */
(function lessonPlanCoverAssignModule() {
  "use strict";

  const path = typeof require === "function" ? require("path") : null;
  const fs = typeof require === "function" ? require("fs") : null;

  const coversApi = (typeof globalThis !== "undefined" && globalThis.LlhLessonPlanCovers)
    || (typeof require === "function" ? require("./lesson-plan-covers.js") : null);
  const catalogApi = (typeof globalThis !== "undefined" && globalThis.LlhLessonPlanCoverCatalog)
    || (typeof require === "function" ? require("./lesson-plan-cover-catalog.js") : null);

  const ROOT = path ? path.join(__dirname, "..") : "";

  function assetExists(url) {
    if (!fs || !path || !ROOT) return true;
    const rel = String(url || "").replace(/^\//, "");
    if (!rel || rel.includes("..")) return false;
    return fs.existsSync(path.join(ROOT, rel));
  }

  /**
   * Resolve + verify a cover for a lesson plan without mutating it.
   * @returns {{
   *   url: string,
   *   alt: string,
   *   source: "uploaded"|"mapped"|"default"|"generated",
   *   position: string,
   *   reusedExistingAsset: boolean,
   *   assetExists: boolean,
   *   quality: "illustrated"|"theme"|"age-fallback"|"default"|"custom",
   * }}
   */
  function resolveAssignableCover(planOrResource = {}) {
    const entry = planOrResource && typeof planOrResource === "object" ? planOrResource : {};
    const plan = entry._curriculumLessonPlan && typeof entry._curriculumLessonPlan === "object"
      ? entry._curriculumLessonPlan
      : entry;
    const rawExplicit = String(plan.coverImageUrl || entry.coverImageUrl || "").trim();
    const explicit = isUsableCoverUrl(rawExplicit) ? rawExplicit : "";
    // Ignore non-durable covers (e.g. data:) so mapping can assign a real asset.
    const resolveInput = explicit
      ? entry
      : {
          ...entry,
          coverImageUrl: "",
          thumbnailUrl: "",
          ...(entry._curriculumLessonPlan
            ? {
                _curriculumLessonPlan: {
                  ...entry._curriculumLessonPlan,
                  coverImageUrl: "",
                  thumbnailUrl: "",
                },
              }
            : {}),
        };
    const resolved = coversApi.resolveLessonPlanCover(resolveInput);
    const exists = assetExists(resolved.url) || /^https?:\/\//i.test(resolved.url);

    let quality = "default";
    if (explicit) {
      quality = "custom";
    } else if (catalogApi?.getPlanCoverByTitle?.(plan.title || entry.title)) {
      quality = "illustrated";
    } else if (resolved.source === "mapped" && String(resolved.url).endsWith(".jpg")) {
      quality = "illustrated";
    } else if (resolved.source === "mapped") {
      quality = "theme";
    } else if (resolved.source === "default") {
      quality = String(resolved.url).includes("generic-") ? "age-fallback" : "default";
    }

    return {
      url: resolved.url,
      alt: resolved.alt,
      source: resolved.source === "uploaded" && !explicit ? "mapped" : resolved.source,
      position: resolved.position || "center",
      reusedExistingAsset: !explicit,
      assetExists: exists,
      quality,
    };
  }

  /**
   * Fields to merge onto a lesson plan before save.
   * Leaves an existing coverImageUrl untouched.
   */
  function isUsableCoverUrl(value) {
    const url = String(value || "").trim();
    if (!url) return false;
    // Match server sanitizer: never treat data: URLs as durable lesson covers.
    if (/^data:/i.test(url)) return false;
    return url.startsWith("/") || /^(https?:)?\/\//i.test(url);
  }

  function assignCoverFields(planOrResource = {}, options = {}) {
    const entry = planOrResource && typeof planOrResource === "object" ? planOrResource : {};
    const force = Boolean(options.force);
    const existingUrl = String(entry.coverImageUrl || "").trim();
    if (isUsableCoverUrl(existingUrl) && !force) {
      return {
        coverImageUrl: existingUrl,
        coverImageAlt: String(entry.coverImageAlt || "").trim()
          || `Cover illustration for ${entry.title || "lesson plan"}`,
        coverImageSource: String(entry.coverImageSource || "uploaded").trim() || "uploaded",
        coverImagePosition: String(entry.coverImagePosition || "center").trim() || "center",
        _coverAssign: {
          assigned: false,
          reason: "already-set",
          quality: "custom",
          reusedExistingAsset: false,
          assetExists: assetExists(existingUrl) || /^https?:\/\//i.test(existingUrl),
        },
      };
    }

    const resolved = resolveAssignableCover(entry);
    const source = resolved.source === "uploaded" ? "mapped" : (resolved.source || "mapped");
    return {
      coverImageUrl: resolved.url,
      coverImageAlt: resolved.alt,
      coverImageSource: source === "default" ? "default" : "mapped",
      coverImagePosition: resolved.position || "center",
      _coverAssign: {
        assigned: true,
        reason: force ? "forced" : "auto",
        quality: resolved.quality,
        reusedExistingAsset: true,
        assetExists: resolved.assetExists,
      },
    };
  }

  function applyCoverToPlan(plan, options = {}) {
    const fields = assignCoverFields(plan, options);
    const next = { ...plan, ...fields };
    delete next._coverAssign;
    return { plan: next, meta: fields._coverAssign };
  }

  /**
   * Scan a batch for cover readiness. Flags plans that only get age/default fallbacks
   * so operators can add catalog art later — import still proceeds with a valid cover.
   */
  function auditBatchCovers(plans = []) {
    const rows = [];
    const urlCounts = new Map();
    for (const plan of plans) {
      const fields = assignCoverFields(plan);
      const url = fields.coverImageUrl;
      urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
      rows.push({
        title: plan.title || "",
        age: plan.age || "",
        theme: plan.theme || "",
        coverImageUrl: url,
        quality: fields._coverAssign.quality,
        assetExists: fields._coverAssign.assetExists,
        needsCustomArt: ["age-fallback", "default"].includes(fields._coverAssign.quality),
      });
    }
    const missingAssets = rows.filter((row) => !row.assetExists);
    const needsCustomArt = rows.filter((row) => row.needsCustomArt);
    const reusedUrls = [...urlCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([url, count]) => ({ url, count }));

    return {
      planCount: rows.length,
      illustratedCount: rows.filter((r) => r.quality === "illustrated" || r.quality === "theme" || r.quality === "custom").length,
      needsCustomArtCount: needsCustomArt.length,
      missingAssetCount: missingAssets.length,
      // Reusing the same theme cover across related plans is intentional — not a file duplicate.
      sharedCoverAssignments: reusedUrls,
      newImageFilesCreated: 0,
      rows,
      missingAssets,
      needsCustomArt,
      ok: missingAssets.length === 0,
    };
  }

  const api = {
    resolveAssignableCover,
    assignCoverFields,
    applyCoverToPlan,
    auditBatchCovers,
    assetExists,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhLessonPlanCoverAssign = api;
  }
})();
