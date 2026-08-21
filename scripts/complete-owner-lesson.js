#!/usr/bin/env node
/**
 * Complete one Owner Admin lesson (enrichment DRAFT only) from a config module.
 *
 * Usage:
 *   LLH_APPLY_PRODUCTION_DRAFTS=1 node scripts/complete-owner-lesson.js bugs-butterflies
 *   LLH_APPLY_PRODUCTION_DRAFTS=1 node scripts/complete-owner-lesson.js big-feelings
 *   LLH_APPLY_PRODUCTION_DRAFTS=1 node scripts/complete-owner-lesson.js black-white-discovery
 *
 * Does NOT publish enrichment. Does NOT change Free/Pro or lesson status.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  createClient,
  generateRealisticActivityPng,
  compressCoverJpeg,
  mergeActivityPatch,
  text,
} = require("./lib/owner-lesson-complete/runtime.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "curriculum-drafts/owner-lesson-complete");

const CONFIGS = {
  "bugs-butterflies": "./lib/owner-lesson-complete/configs/bugs-butterflies.js",
  "big-feelings": "./lib/owner-lesson-complete/configs/big-feelings.js",
  "black-white-discovery": "./lib/owner-lesson-complete/configs/black-white-discovery.js",
  "toddler-all-about-me": "./lib/owner-lesson-complete/configs/toddler-all-about-me.js",
  "little-makers-workshop": "./lib/owner-lesson-complete/configs/little-makers-workshop.js",
  "farm-animals": "./lib/owner-lesson-complete/configs/farm-animals.js",
};

async function main() {
  const key = String(process.argv[2] || "").trim();
  if (!CONFIGS[key]) {
    console.error("Usage: complete-owner-lesson.js <bugs-butterflies|big-feelings|black-white-discovery|toddler-all-about-me|little-makers-workshop|farm-animals>");
    process.exit(2);
  }
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    console.error("Refusing to write: set LLH_APPLY_PRODUCTION_DRAFTS=1");
    process.exit(2);
  }

  const config = require(CONFIGS[key]);
  const client = createClient();
  const genDir = path.join(OUT_DIR, key, "generated");
  fs.mkdirSync(genDir, { recursive: true });

  const report = {
    startedAt: new Date().toISOString(),
    configKey: key,
    planId: config.planId,
    title: config.title,
    audit: { keep: [], improve: [], replace: [] },
    images: { created: [], skipped: [], failed: [] },
    printables: config.printables?.notes || [],
    cover: null,
    verify: null,
  };

  Object.values(config.activities).forEach((a) => {
    const d = String(a.decision || "improve").toLowerCase();
    if (d === "replace") report.audit.replace.push(a.title || "");
    else if (d === "keep") report.audit.keep.push(a.title || "");
    else report.audit.improve.push(a.title || "");
  });
  // Fix audit titles from keys
  report.audit = { keep: [], improve: [], replace: [] };
  Object.entries(config.activities).forEach(([title, a]) => {
    const d = String(a.decision || "improve").toLowerCase();
    if (d === "replace") report.audit.replace.push(title);
    else if (d === "keep") report.audit.keep.push(title);
    else report.audit.improve.push(title);
  });

  const tokenRef = { token: await client.login() };
  let site = await client.loadAdminSite(tokenRef.token);
  const exactTitleMatches = (site.curriculum.lessonPlans || []).filter((p) =>
    String(p.title || "").trim().toLowerCase() === String(config.title).trim().toLowerCase()
  );
  // All About Me exists as Toddler Pro + Preschool Free — operate by verified planId only.
  if (exactTitleMatches.length > 1 && !config.allowSameTitleDifferentAgeOrStatus) {
    throw new Error(`Duplicate exact titles for “${config.title}”: ${exactTitleMatches.map((p) => p.id).join(", ")}`);
  }
  if (exactTitleMatches.length > 1) {
    console.warn(
      "NOTE same title exists on other IDs (allowed by config):",
      exactTitleMatches.map((p) => `${p.id}/${p.age}/${p.status}/${p.plan}`).join(" | "),
    );
  }
  const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === config.planId);
  if (!plan) throw new Error(`Lesson ${config.planId} not found`);
  if (config.forbidTouchPlanIds) {
    for (const otherId of config.forbidTouchPlanIds) {
      const snap = (site.curriculum.lessonPlans || []).find((p) => p.id === otherId);
      report.guardSnapshots = report.guardSnapshots || {};
      report.guardSnapshots[otherId] = {
        title: snap?.title,
        status: snap?.status,
        plan: snap?.plan,
        updatedAt: snap?.updatedAt,
        coverImageUrl: snap?.coverImageUrl || "",
        enrichmentDraftUpdatedAt: snap?.enrichmentDraft?.updatedAt || "",
      };
    }
  }
  if (String(plan.plan || "") !== String(config.expectedPlan || "")) {
    console.warn(`WARN Free/Pro is ${plan.plan}, config expected ${config.expectedPlan} — preserving live value`);
  }
  if (config.expectedStatus && String(plan.status || "") !== String(config.expectedStatus)) {
    console.warn(`WARN status is ${plan.status}, config expected ${config.expectedStatus} — preserving live value`);
  }

  report.before = {
    id: plan.id,
    title: plan.title,
    age: plan.age,
    status: plan.status,
    plan: plan.plan,
    activityCount: (site.curriculum.activities || []).filter((a) => a.lessonPlanId === config.planId && a.status !== "archived").length,
    hasDraft: !!(plan.enrichmentDraft && Object.keys(plan.enrichmentDraft).length),
    coverImageUrl: plan.coverImageUrl || "",
    resourceIds: plan.resourceIds || [],
  };
  console.log("TARGET", JSON.stringify(report.before, null, 2));

  if (config.renameFromTitle && String(plan.title || "") !== String(config.title)) {
    if (String(plan.title || "") !== String(config.renameFromTitle)) {
      throw new Error(`Expected current title “${config.renameFromTitle}”, found “${plan.title}”`);
    }
    await client.ensureToken(tokenRef);
    site = await client.loadAdminSite(tokenRef.token);
    const renamed = await client.renameLessonTitle(tokenRef.token, config.planId, config.title, site.updatedAt);
    console.log("RENAME", renamed.status, renamed.json?.error || renamed.json?.lessonPlan?.title || config.title);
    if (renamed.status !== 200) {
      throw new Error(`rename failed (${renamed.status}): ${renamed.json?.error || renamed.raw?.slice(0, 200)}`);
    }
    site = await client.loadAdminSite(tokenRef.token);
    const afterRename = (site.curriculum.lessonPlans || []).find((p) => p.id === config.planId);
    if (String(afterRename?.title || "") !== String(config.title)) {
      throw new Error(`rename did not persist; title is still “${afterRename?.title}”`);
    }
    // Archived empty twin must stay archived
    if (config.archivedTwinId) {
      const twin = (site.curriculum.lessonPlans || []).find((p) => p.id === config.archivedTwinId);
      if (String(twin?.status || "") !== "archived") {
        throw new Error(`Archived twin ${config.archivedTwinId} is no longer archived`);
      }
    }
    report.rename = { from: config.renameFromTitle, to: config.title, ok: true };
    // refresh plan pointer
    Object.assign(plan, afterRename);
  }

  // Create missing draft printables if configured
  const createdPrintableIds = [];
  if (Array.isArray(config.printables?.create) && config.printables.create.length) {
    for (const item of config.printables.create) {
      const pdfPath = path.isAbsolute(item.pdfPath)
        ? item.pdfPath
        : path.join(ROOT, item.pdfPath);
      if (!fs.existsSync(pdfPath)) {
        report.printables.push({ title: item.title, error: "missing_file", pdfPath });
        continue;
      }
      await client.ensureToken(tokenRef);
      site = await client.loadAdminSite(tokenRef.token);
      const existing = (site.curriculum.resources || []).find((r) =>
        String(r.title || "").trim().toLowerCase() === String(item.title).trim().toLowerCase()
        && ((r.lessonPlanIds || []).includes(config.planId) || (plan.resourceIds || []).includes(r.id))
      );
      if (existing?.id) {
        createdPrintableIds.push(existing.id);
        report.printables.push({
          title: item.title,
          id: existing.id,
          pages: item.pages,
          decision: "KEEP_EXISTING",
          purpose: item.purpose,
          reused: true,
        });
        continue;
      }
      const up = await client.createPrintable(
        tokenRef.token,
        config.planId,
        item.title,
        pdfPath,
        site.updatedAt,
        item.accessLevel || (config.expectedPlan === "Pro" ? "pro" : "free"),
      );
      if (up.status === 200 && up.json?.resource?.id) {
        createdPrintableIds.push(up.json.resource.id);
        report.printables.push({
          title: item.title,
          id: up.json.resource.id,
          pages: item.pages,
          decision: "NEW",
          purpose: item.purpose,
          teacherUse: item.teacherUse,
          childUse: item.childUse,
          why: item.why,
          status: up.json.resource.status || "draft",
        });
        console.log("PRINTABLE OK", item.title, up.json.resource.id);
      } else {
        report.printables.push({ title: item.title, error: up.json?.error || `HTTP ${up.status}` });
        console.warn("PRINTABLE FAIL", item.title, up.status, up.json?.error);
      }
    }
  }

  const liveActs = (site.curriculum.activities || []).filter((a) => a.lessonPlanId === config.planId && a.status !== "archived");
  const byTitle = new Map(liveActs.map((a) => [String(a.title || "").trim().toLowerCase(), a]));

  const priorDraft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object" ? plan.enrichmentDraft : { activities: {}, week: {} };
  const activities = {};
  const imageJobs = [];

  for (const [title, overlay] of Object.entries(config.activities)) {
    const live = byTitle.get(title.toLowerCase());
    if (!live?.id) {
      console.warn("SKIP missing live activity", title);
      continue;
    }
    const priorAct = priorDraft.activities?.[live.id] || {};
    const patch = mergeActivityPatch(live, { ...overlay, title });
    activities[live.id] = {
      ...priorAct,
      ...patch,
      activityId: live.id,
      itemId: live.itemId,
      sourceKey: `${config.planId}:${live.itemId}`,
    };
    if (live.itemId) activities[live.itemId] = { ...activities[live.id] };

    const planImg = String(overlay.imagePlan || "IMAGE_NOT_NEEDED");
    if (planImg === "IMAGE_NOT_NEEDED") {
      // Explicitly clear prior draft photos for song/movement/etc.
      activities[live.id].setupImageUrl = "";
      activities[live.id].exampleImageUrl = "";
      activities[live.id].setupMediaAssetId = "";
      activities[live.id].exampleMediaAssetId = "";
      activities[live.id].setupImageThumbUrl = "";
      activities[live.id].exampleImageThumbUrl = "";
      if (live.itemId) activities[live.itemId] = { ...activities[live.id] };
      report.images.skipped.push({ title, reason: planImg, clearedPrior: !!(priorAct.setupImageUrl || priorAct.exampleImageUrl) });
    } else if (overlay.reuseExistingSetupImage && (priorAct.setupImageUrl || priorAct.exampleImageUrl)) {
      activities[live.id].setupImageUrl = priorAct.setupImageUrl || priorAct.exampleImageUrl || "";
      activities[live.id].exampleImageUrl = overlay.keepExampleImage === false ? "" : (priorAct.exampleImageUrl || "");
      activities[live.id].setupMediaAssetId = priorAct.setupMediaAssetId || priorAct.exampleMediaAssetId || "";
      activities[live.id].exampleMediaAssetId = overlay.keepExampleImage === false ? "" : (priorAct.exampleMediaAssetId || "");
      if (live.itemId) activities[live.itemId] = { ...activities[live.id] };
      report.images.created.push({
        title,
        activityKey: live.id,
        requirement: planImg,
        source: "reuse_existing_draft",
        url: String(activities[live.id].setupImageUrl).slice(0, 160),
        mediaAssetId: activities[live.id].setupMediaAssetId || "",
      });
      // Download for cover preference if needed
      imageJobs.push({
        activityKey: live.id,
        title,
        brief: overlay.imageBriefSetup || overlay.description || title,
        requirement: planImg,
        reuseUrl: activities[live.id].setupImageUrl,
      });
    } else {
      // Replace path: drop prior mismatched images before generating a new photo.
      activities[live.id].setupImageUrl = "";
      activities[live.id].exampleImageUrl = "";
      activities[live.id].setupMediaAssetId = "";
      activities[live.id].exampleMediaAssetId = "";
      activities[live.id].setupImageThumbUrl = "";
      activities[live.id].exampleImageThumbUrl = "";
      if (live.itemId) activities[live.itemId] = { ...activities[live.id] };
      imageJobs.push({
        activityKey: live.id,
        title,
        brief: overlay.imageBriefSetup || overlay.description || title,
        requirement: planImg,
      });
    }
  }

  const printableIds = [
    ...(config.printables?.keepResourceIds || []),
    ...createdPrintableIds,
    ...((priorDraft.week && priorDraft.week.printableIds) || []),
  ].filter((id, i, arr) => id && arr.indexOf(id) === i);

  let enrichmentDraft = {
    schemaVersion: 1,
    draftOnly: true,
    neverAutoPublish: true,
    previewReady: true,
    updatedAt: new Date().toISOString(),
    lastEditedBy: client.adminEmail || "owner-complete-script",
    activities,
    week: {
      ...(priorDraft.week || {}),
      ...config.week,
      printableIds,
      draftOnly: true,
      neverAutoPublish: true,
    },
    meta: {
      purpose: `${config.title} complete for Owner Admin review — enrichment_draft only`,
      sourceLessonId: config.planId,
      completedAt: new Date().toISOString(),
      configKey: key,
    },
  };

  await client.ensureToken(tokenRef);
  site = await client.loadAdminSite(tokenRef.token);
  let save = await client.saveEnrichmentDraft(tokenRef.token, config.planId, site.updatedAt, enrichmentDraft);
  console.log("SAVE1", save.status, save.json?.saveMode, save.json?.publishedUnchanged, save.json?.error || save.json?.code);
  if (save.status !== 200) {
    throw new Error(`enrichment_draft save failed (${save.status}): ${save.json?.error || save.raw?.slice(0, 300)}`);
  }
  console.log("ENRICHMENT DRAFT SAVED");

  let imgIndex = 0;
  const localByTitle = new Map();
  for (const job of imageJobs) {
    const slug = job.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
    const outPath = path.join(genDir, `${slug}.png`);
    try {
      if (job.reuseUrl) {
        // Pull existing draft photo locally for cover selection only (already attached).
        await client.ensureToken(tokenRef);
        const abs = job.reuseUrl.startsWith("http") ? job.reuseUrl : `${client.siteUrl}${job.reuseUrl}`;
        const res = await fetch(abs, { headers: { Authorization: `Bearer ${tokenRef.token}` } });
        const buf = Buffer.from(await res.arrayBuffer());
        if (!res.ok || buf.length < 10000) throw new Error(`reuse download failed (${res.status})`);
        fs.writeFileSync(outPath, buf);
        localByTitle.set(job.title, outPath);
        console.log("IMAGE REUSE", job.title);
        imgIndex += 1;
        continue;
      }
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
      console.log("GEN START", job.title);
      if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 20000) {
        await generateRealisticActivityPng({
          title: job.title,
          brief: job.brief,
          index: imgIndex,
          outPath,
          ageLabel: config.ageLabel,
        });
      } else {
        console.log("GEN REUSE", job.title);
      }
      const st = fs.statSync(outPath);
      if (st.size < 20000) throw new Error("generated image too small");
      localByTitle.set(job.title, outPath);
      await client.ensureToken(tokenRef);
      const up = await client.uploadSetupPhoto(tokenRef.token, config.planId, job.activityKey, outPath);
      if (up.status === 200 && up.json?.mediaUrl) {
        activities[job.activityKey].setupImageUrl = up.json.mediaUrl;
        activities[job.activityKey].setupMediaAssetId = up.json.mediaAssetId || "";
        if (activities[activities[job.activityKey].itemId]) {
          activities[activities[job.activityKey].itemId].setupImageUrl = up.json.mediaUrl;
          activities[activities[job.activityKey].itemId].setupMediaAssetId = up.json.mediaAssetId || "";
        }
        report.images.created.push({
          title: job.title,
          activityKey: job.activityKey,
          requirement: job.requirement,
          source: "openai_realistic",
          url: String(up.json.mediaUrl).slice(0, 160),
          mediaAssetId: up.json.mediaAssetId || "",
          localPath: outPath,
        });
        console.log("IMAGE OK", job.title);
      } else {
        report.images.failed.push({ title: job.title, error: up.json?.error || `HTTP ${up.status}`, stage: "upload" });
      }
    } catch (error) {
      report.images.failed.push({ title: job.title, error: error.message || String(error), stage: "generate" });
      console.warn("GEN FAIL", job.title, error.message);
    }
    imgIndex += 1;
  }

  enrichmentDraft = {
    ...enrichmentDraft,
    activities: { ...activities },
    week: { ...enrichmentDraft.week, printableIds },
    updatedAt: new Date().toISOString(),
  };
  await client.ensureToken(tokenRef);
  site = await client.loadAdminSite(tokenRef.token);
  save = await client.saveEnrichmentDraft(tokenRef.token, config.planId, site.updatedAt, enrichmentDraft);
  if (save.status !== 200) throw new Error(`post-photo draft save failed (${save.status})`);

  // Cover from preferred generated scene
  let coverSrc = null;
  for (const title of config.imageCoverPreference || []) {
    if (localByTitle.has(title)) {
      coverSrc = localByTitle.get(title);
      report.cover = { selectedActivity: title };
      break;
    }
  }
  if (!coverSrc && report.images.created[0]?.localPath) {
    coverSrc = report.images.created[0].localPath;
    report.cover = { selectedActivity: report.images.created[0].title };
  }
  if (coverSrc) {
    const coverJpg = path.join(genDir, "cover.jpg");
    await compressCoverJpeg(coverSrc, coverJpg);
    await client.ensureToken(tokenRef);
    const coverRes = await client.uploadCoverJpeg(
      tokenRef.token,
      config.planId,
      coverJpg,
      `${config.title} classroom activity`,
    );
    report.cover = {
      ...report.cover,
      uploadStatus: coverRes.upload?.status,
      assignStatus: coverRes.assign?.status,
      ok: coverRes.upload?.status === 200 && coverRes.assign?.status === 200,
      url: coverRes.upload?.json?.url || null,
      coverId: coverRes.upload?.json?.id || null,
      error: coverRes.upload?.json?.error || coverRes.assign?.json?.error || null,
    };
    console.log("COVER", report.cover);
  } else {
    report.cover = { ok: false, error: "no_generated_image_for_cover" };
  }

  await client.ensureToken(tokenRef);
  site = await client.loadAdminSite(tokenRef.token);
  const finalPlan = (site.curriculum.lessonPlans || []).find((p) => p.id === config.planId);
  const draft = finalPlan?.enrichmentDraft || {};
  const draftActKeys = Object.keys(draft.activities || {}).filter((k) => k.startsWith("cur-act-"));
  const withImages = draftActKeys.filter((k) => draft.activities[k]?.setupImageUrl || draft.activities[k]?.exampleImageUrl);
  const linkedRes = (site.curriculum.resources || []).filter((r) =>
    (r.lessonPlanIds || []).includes(config.planId) || (finalPlan.resourceIds || []).includes(r.id)
  );
  const titleDupes = (site.curriculum.lessonPlans || []).filter((p) =>
    String(p.title || "").trim().toLowerCase() === String(finalPlan.title || "").trim().toLowerCase()
  );

  report.verify = {
    id: finalPlan?.id,
    title: finalPlan?.title,
    age: finalPlan?.age,
    status: finalPlan?.status,
    plan: finalPlan?.plan,
    activityCount: liveActs.length,
    draftActivityCount: draftActKeys.length,
    draftActivitiesWithImages: withImages.length,
    coverImageUrl: (finalPlan?.coverImageUrl || "").slice(0, 200),
    linkedResources: linkedRes.map((r) => ({ id: r.id, title: r.title, status: r.status, lessonPlanIds: r.lessonPlanIds || [] })),
    freeProUnchanged: finalPlan?.plan === report.before.plan,
    statusUnchanged: finalPlan?.status === report.before.status,
    idUnchanged: finalPlan?.id === config.planId,
    enrichmentPublished: !!(finalPlan?.enrichmentPublished && Object.keys(finalPlan.enrichmentPublished || {}).length),
    exactTitleCount: titleDupes.length,
  };

  if (!report.verify.freeProUnchanged) throw new Error("Free/Pro changed");
  if (!report.verify.statusUnchanged) throw new Error("Status changed");
  if (report.verify.enrichmentPublished) throw new Error("Enrichment published unexpectedly");
  if (config.renameFromTitle && String(finalPlan?.title || "") !== String(config.title)) {
    throw new Error(`Final title mismatch: expected “${config.title}”`);
  }
  if (config.forbidTouchPlanIds && report.guardSnapshots) {
    report.untouchedGuards = {};
    for (const otherId of config.forbidTouchPlanIds) {
      const snap = (site.curriculum.lessonPlans || []).find((p) => p.id === otherId);
      const before = report.guardSnapshots[otherId] || {};
      const ok = snap
        && snap.status === before.status
        && snap.plan === before.plan
        && String(snap.title || "") === String(before.title || "")
        && String(snap.coverImageUrl || "") === String(before.coverImageUrl || "")
        && String(snap.enrichmentDraft?.updatedAt || "") === String(before.enrichmentDraftUpdatedAt || "");
      report.untouchedGuards[otherId] = { ok, before, after: {
        title: snap?.title, status: snap?.status, plan: snap?.plan,
        coverImageUrl: snap?.coverImageUrl || "",
        enrichmentDraftUpdatedAt: snap?.enrichmentDraft?.updatedAt || "",
      } };
      if (!ok) throw new Error(`Forbidden lesson changed: ${otherId}`);
    }
  }
  if (config.archivedTwinId) {
    const twin = (site.curriculum.lessonPlans || []).find((p) => p.id === config.archivedTwinId);
    if (String(twin?.status || "") !== "archived") {
      throw new Error(`Archived twin ${config.archivedTwinId} was reactivated`);
    }
    report.archivedTwinStillArchived = true;
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = path.join(OUT_DIR, `${key}-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("REPORT", reportPath);
  console.log(JSON.stringify({
    verify: report.verify,
    auditCounts: {
      keep: report.audit.keep.length,
      improve: report.audit.improve.length,
      replace: report.audit.replace.length,
    },
    imagesCreated: report.images.created.length,
    imagesSkipped: report.images.skipped.length,
    cover: report.cover,
  }, null, 2));
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
