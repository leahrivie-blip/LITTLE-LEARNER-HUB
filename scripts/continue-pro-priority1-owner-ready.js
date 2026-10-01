#!/usr/bin/env node
/**
 * Finish Priority 1 owner-review readiness:
 * - ensure printableIds on enrichment drafts
 * - generate any missing curated activity images
 * - set covers from strongest activity photos (resized <2MB)
 * - NEVER publish
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SITE = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";

const P1 = [
  { key: "pet-vet", id: "cur-lp-toddler-pet-vet-clinic", cover: "Veterinarian Dramatic Play Center" },
  { key: "zoo-adventures", id: "cur-lp-toddler-zoo-adventures", cover: "Zoo Keeper Dramatic Play" },
  { key: "camping", id: "cur-lp-toddler-camping-under-the-stars", cover: "Set Up the Campsite" },
  { key: "pirate", id: "cur-lp-toddler-pirate-adventure", cover: "Ocean Adventure Pretend Play" },
  { key: "superhero", id: "cur-lp-toddler-superhero-training-camp", cover: "City Rescue Adventure" },
  { key: "apples-kitchen", id: "cur-lp-toddler-apples-in-the-kitchen", cover: "Little Apple Kitchen" },
  { key: "johnny-appleseed", id: "cur-lp-toddler-johnny-appleseed-apple-fun", cover: "Plant Your Own Apple Seed" },
];

const text = (v) => String(v == null ? "" : v).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function request(method, urlPath, body, headers = {}, binary = false) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, SITE);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: binary ? "*/*" : "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (binary) return resolve({ status: res.statusCode, buf });
          let json = null;
          try {
            json = JSON.parse(buf.toString("utf8"));
          } catch {
            json = { raw: buf.toString("utf8").slice(0, 300) };
          }
          resolve({ status: res.statusCode, json, buf });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function retry(fn, label, tries = 8) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      console.log(JSON.stringify({ retry: label, i: i + 1, err: String(err.message || err).slice(0, 200) }));
      await sleep(3500 * (i + 1));
    }
  }
  throw last;
}

async function login() {
  const r = await request("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (r.status !== 200 || !r.json?.token) throw new Error(`login ${r.status}`);
  return r.json.token;
}

async function loadSite(token) {
  const r = await request("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (r.status !== 200) throw new Error(`site ${r.status}`);
  return r.json.siteContent;
}

async function saveDraft(token, planId, draft, updatedAt) {
  return request(
    "POST",
    "/api/admin/curriculum/lesson-plans",
    {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: updatedAt || "",
      adminEmail: ADMIN_EMAIL,
      lessonPlan: { id: planId, enrichmentDraft: draft },
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function vp(token, body) {
  return request("POST", "/api/admin/curriculum/visual-production", body, {
    Authorization: `Bearer ${token}`,
  });
}

function sanitizeBrief(brief) {
  return String(brief || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^[-*•]\s*/, ""))
    .filter((s) => !/littlelearnershubbyleah\.com|footer\s*:/i.test(s))
    .filter(
      (s) =>
        !/\b(realistic\s+(?:photo|daycare|classroom)|photorealistic|teacher\s+took\s+the\s+photo|daycare\s+setup|preschool\s+(?:setup|classroom))\b/i.test(
          s,
        ),
    )
    .slice(0, 8);
}

function instruction(a) {
  const lines = sanitizeBrief(a.imageBriefSetup || a.imageBriefExample);
  if (!lines.length) lines.push(`${a.title} toddler invitation`);
  return `${a.title}:
Activity image.
Realistic photo.
Show a classroom table or floor invitation with toddler-safe materials.
Use:
${lines.map((s) => `- ${s}`).join("\n")}
- natural indoor light
- believable real-life materials
- realistic scale
- slightly imperfect setup
Do NOT include:
- children
- adults
- cartoon animals
- 3D blob-style artwork
- glossy CGI
- fake plastic-looking scene
- floating objects
- fantasy lighting
- random decorations
- random text
- logos
- website URLs
- overly staged Pinterest-style setup
- obvious AI artifacts
Leave the bottom edge visually clear enough for a footer overlay.`;
}

function pick(upgrade, n = 5) {
  const acts = (upgrade.activities || []).filter((a) => a.imageRequirement && a.imageRequirement !== "not_needed");
  const rank = (a) => {
    const c = String(a.activityCategory || "").toLowerCase();
    if (/dramatic/.test(c)) return 0;
    if (/sensory/.test(c)) return 1;
    if (/art/.test(c)) return 2;
    if (/stem|discovery|open/.test(c)) return 3;
    return 4;
  };
  return acts.sort((a, b) => rank(a) - rank(b)).slice(0, n);
}

async function resizeUnder2Mb(buf) {
  let quality = 82;
  let width = 1400;
  let out = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
  while (out.length > 1.8e6 && (quality > 50 || width > 900)) {
    if (quality > 50) quality -= 8;
    else width = Math.round(width * 0.85);
    out = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  return out;
}

async function genOne(token, lessonId, live, row) {
  const planRes = await vp(token, { action: "plan", lessonId, instruction: instruction(row) });
  if (planRes.status !== 200) throw new Error(`plan ${planRes.status} ${JSON.stringify(planRes.json).slice(0, 120)}`);
  const card = planRes.json.cards?.[0];
  if (!card) throw new Error("no card");
  if (card.status === "NEEDS_REVIEW") throw new Error(`needs_review ${JSON.stringify(card.reviewFlags)}`);
  const ap = await vp(token, { action: "approve", id: card.id, confirmApprove: true });
  if (ap.status !== 200) throw new Error(`approve ${ap.status}`);
  const gen = await vp(token, { action: "generate", id: card.id, confirmGenerate: true });
  if (gen.status !== 200 || !gen.json?.previewUrl) throw new Error(`generate ${gen.status}`);
  const bin = await request("GET", gen.json.previewUrl, null, { Authorization: `Bearer ${token}` }, true);
  if (bin.status !== 200) throw new Error(`dl ${bin.status}`);
  const key = text(live.id) || text(live.itemId);
  const fileData = `data:image/png;base64,${bin.buf.toString("base64")}`;
  const up = await request(
    "POST",
    "/api/admin/curriculum/enrichment-photos/upload",
    {
      adminToken: token,
      lessonPlanId: lessonId,
      activityKey: key,
      field: "setupImageUrl",
      fileName: `${key}-setup.png`,
      fileData,
    },
    { Authorization: `Bearer ${token}` },
  );
  if (up.status !== 200) throw new Error(`up ${up.status} ${JSON.stringify(up.json).slice(0, 120)}`);
  return { key, upload: up.json };
}

async function setCover(token, meta) {
  const sc = await retry(() => loadSite(token), "site-cover");
  const plan = sc.curriculum.lessonPlans.find((p) => p.id === meta.id);
  const liveActs = sc.curriculum.activities.filter((a) => a.lessonPlanId === meta.id && a.status !== "archived");
  const live = liveActs.find((a) => text(a.title).toLowerCase() === text(meta.cover).toLowerCase());
  const key = live ? text(live.id) || text(live.itemId) : "";
  const patch = key ? plan.enrichmentDraft?.activities?.[key] || {} : {};
  let url = text(patch.setupImageUrl) || text(patch.exampleImageUrl);
  let usedTitle = meta.cover;
  if (!url) {
    const any = Object.entries(plan.enrichmentDraft?.activities || {}).find(([, v]) => text(v.setupImageUrl));
    if (any) {
      url = text(any[1].setupImageUrl);
      usedTitle = any[1].title || usedTitle;
    }
  }
  if (!url) return { ok: false, reason: "no image url" };
  const bin = await request("GET", url, null, { Authorization: `Bearer ${token}` }, true);
  if (bin.status !== 200 || !bin.buf.length) return { ok: false, reason: `download ${bin.status}` };
  const jpeg = await resizeUnder2Mb(bin.buf);
  const fileData = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const up = await retry(
    () =>
      request(
        "POST",
        "/api/admin/curriculum/lesson-covers/upload",
        {
          lessonPlanId: meta.id,
          fileName: `${meta.key}-cover.jpg`,
          fileData,
          coverImageAlt: `${plan.title} — ${usedTitle}`,
          coverImagePosition: "center",
          coverQualityStatus: "good",
        },
        { Authorization: `Bearer ${token}` },
      ),
    "cover-up",
  );
  if (up.status !== 200 || !up.json?.url) return { ok: false, reason: `upload ${up.status} ${JSON.stringify(up.json).slice(0, 200)}` };
  const assign = await retry(
    () =>
      request(
        "POST",
        "/api/admin/curriculum/lesson-covers/assign",
        {
          assignments: [
            {
              id: meta.id,
              coverImageUrl: up.json.url,
              coverImageAlt: `${plan.title} — ${usedTitle}`,
              coverImageSource: "uploaded",
              coverImagePosition: "center",
              coverQualityStatus: "good",
            },
          ],
        },
        { Authorization: `Bearer ${token}` },
      ),
    "cover-assign",
  );
  if (assign.status !== 200) return { ok: false, reason: `assign ${assign.status} ${JSON.stringify(assign.json).slice(0, 200)}` };
  return { ok: true, coverImageUrl: up.json.url, coverActivity: usedTitle, bytes: jpeg.length };
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") throw new Error("Set LLH_APPLY_PRODUCTION_DRAFTS=1");
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) throw new Error("Missing admin env");

  let token = await retry(login, "login");
  const report = [];

  for (const meta of P1) {
    console.log(JSON.stringify({ phase: "start", id: meta.id }));
    token = await retry(login, "login-loop");
    let sc = await retry(() => loadSite(token), "site");
    let plan = sc.curriculum.lessonPlans.find((p) => p.id === meta.id);
    if (!plan || plan.plan !== "Pro") throw new Error(`bad plan ${meta.id}`);
    const liveActs = sc.curriculum.activities.filter((a) => a.lessonPlanId === meta.id && a.status !== "archived");
    const draft = JSON.parse(JSON.stringify(plan.enrichmentDraft || { activities: {}, week: {} }));
    draft.activities = draft.activities || {};
    draft.week = draft.week || {};

    const resources = sc.curriculum.resources || [];
    const linked = (plan.resourceIds || [])
      .map((id) => resources.find((r) => r.id === id))
      .filter((r) => r && r.status === "draft");
    draft.week.printableIds = Array.from(new Set([...(draft.week.printableIds || []), ...linked.map((r) => r.id)]));

    const upgrade = JSON.parse(fs.readFileSync(path.join(ROOT, "curriculum-drafts/pro-upgrade", `${meta.key}.upgrade.json`), "utf8"));
    const byTitle = new Map(liveActs.map((a) => [text(a.title).toLowerCase(), a]));
    const targets = pick(upgrade, 5);
    const added = [];
    for (const row of targets) {
      const live = byTitle.get(text(row.title).toLowerCase());
      if (!live) continue;
      const key = text(live.id) || text(live.itemId);
      const prev = draft.activities[key] || {};
      if (text(prev.setupImageUrl) || text(prev.exampleImageUrl)) continue;
      try {
        const result = await retry(() => genOne(token, meta.id, live, row), `gen-${row.title}`, 6);
        draft.activities[key] = {
          ...prev,
          replaceOwned: true,
          setupImageUrl: result.upload.mediaUrl || result.upload.url,
          setupImageThumbUrl: result.upload.thumbUrl || result.upload.mediaUrl,
          setupMediaAssetId: result.upload.mediaAssetId || result.upload.assetId,
          imageRequirement: row.imageRequirement || "recommended",
        };
        if (text(live.itemId) && text(live.itemId) !== key) draft.activities[text(live.itemId)] = { ...draft.activities[key] };
        added.push(row.title);
        console.log(JSON.stringify({ phase: "img_ok", title: row.title }));
        await sleep(1200);
      } catch (err) {
        console.log(JSON.stringify({ phase: "img_fail", title: row.title, err: String(err.message).slice(0, 200) }));
      }
    }

    draft.previewReady = true;
    draft.draftOnly = true;
    draft.neverAutoPublish = true;
    draft.week.coverStatus = "UPDATED_FROM_ACTIVITY_PHOTO";
    draft.week.proposedCoverActivity = meta.cover;
    draft.meta = {
      ...(draft.meta || {}),
      ownerReviewReady: true,
      ownerReviewReadyAt: new Date().toISOString(),
      neverAutoPublish: true,
    };

    sc = await retry(() => loadSite(token), "site-before-save");
    const save = await retry(() => saveDraft(token, meta.id, draft, sc.updatedAt), "save");
    if (save.status !== 200) throw new Error(`save ${meta.id} ${save.status} ${JSON.stringify(save.json).slice(0, 200)}`);

    const cover = await setCover(token, meta);
    console.log(JSON.stringify({ phase: "cover", id: meta.id, cover }));

    sc = await retry(() => loadSite(token), "site-final");
    plan = sc.curriculum.lessonPlans.find((p) => p.id === meta.id);
    const dActs = plan.enrichmentDraft?.activities || {};
    const imgTitles = new Set(
      Object.values(dActs)
        .filter((v) => text(v.setupImageUrl) || text(v.exampleImageUrl))
        .map((v) => text(v.title).toLowerCase()),
    );
    const printableIds = plan.enrichmentDraft?.week?.printableIds || [];
    const printables = printableIds.map((id) => sc.curriculum.resources.find((r) => r.id === id)).filter(Boolean);

    report.push({
      lessonId: meta.id,
      title: plan.title,
      activityCount: liveActs.length,
      imagesAddedThisPass: added,
      imageCountUnique: imgTitles.size,
      printableIds,
      printables: printables.map((r) => ({ id: r.id, title: r.title, status: r.status })),
      cover,
      coverImageUrl: plan.coverImageUrl || "",
      enrichmentPublished: plan.enrichmentPublished === true,
      planStatus: plan.status,
      plan: plan.plan,
      ownerReviewReady: true,
      publishStatus: "NOT PUBLISHED",
    });
  }

  const out = path.join(ROOT, "docs/audits/PRO_PRIORITY1_OWNER_REVIEW_READY_REPORT.json");
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
  console.log("WROTE_REPORT", report.length, out);
}

main().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
