#!/usr/bin/env node
/**
 * Apply Teaching Kit DRAFT repairs to the LIVE Owner Admin store.
 *
 * Source of truth: GET /api/admin/site-content on SITE_URL (production by default).
 * Persist via: POST /api/admin/curriculum/lesson-plans  saveMode=enrichment_draft
 *
 * Does NOT publish enrichment.
 * Does NOT change lesson.status (customer published lessons stay published).
 * Keys every activity patch by live store activity.id (cur-act-*).
 *
 * Required env:
 *   ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_ACCESS_CODE
 * Optional:
 *   SITE_URL (default https://littlelearnershubbyleah.com)
 *   LLH_APPLY_PRODUCTION_DRAFTS=1  (required safety latch)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const enrichment = require("./teaching-kit-enrichment.js");
const { completeWeekMetaForAdmin } = require("./lib/teaching-kit-premium-drafts/shared.js");

const ROOT = path.join(__dirname, "..");
const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "leahivie@icloud.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const OUT_DIR = path.join(ROOT, "curriculum-drafts/teaching-kits-premium");
const TARGET_IDS = [
  "cur-lp-infant-colors-all-around-us",
  "cur-lp-infant-black-white-discovery",
  "cur-lp-preschool-community-helpers",
  "cur-lp-preschool-weather-watchers",
];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const CORE = enrichment.OWNER_CORE_ACTIVITY_REQUIRED_FIELDS.map((f) => f.key);

function text(v) {
  return String(v == null ? "" : v).trim();
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, SITE_URL);
    const lib = u.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = { raw: raw.slice(0, 400) }; }
          resolve({ status: res.statusCode, json, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function isInfant(plan) {
  return /infant|0\s*[–-]\s*6/i.test(String(plan.age || ""));
}

function numberedSteps(steps) {
  const lines = String(steps || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  return lines
    .map((line, i) => (/^\d+\./.test(line) ? line : `${i + 1}. ${line}`))
    .join("\n");
}

function contentForActivity(plan, storeAct, day) {
  const infant = isInfant(plan);
  const title = text(storeAct.title);
  const category = text(storeAct.activityCategory) || (infant ? "Sensory Play" : "Open-Ended Exploration");
  const existing = {
    objective: text(storeAct.objective),
    description: text(storeAct.description),
    materials: text(storeAct.materials),
    setup: text(storeAct.setup),
    steps: text(storeAct.steps),
    safetyNotes: text(storeAct.safetyNotes),
    observationOpportunities: text(storeAct.observationOpportunities),
  };

  // Age-appropriate rewrites for known product-heavy titles (same activity ID).
  const rewrite = rewriteIfNeeded(title, infant);

  const objective = rewrite.objective || existing.objective || (
    infant
      ? `Support looking and responsive interaction during ${title}.`
      : `Explore ${title} through play, language, and investigation.`
  );
  const description = rewrite.description || existing.description || (
    infant
      ? `The caregiver offers a brief, child-led experience while narrating gently. The infant may look, track, or reach when ready — there is no required response.`
      : `Children explore materials and ideas connected to ${title}, talking with peers and teachers as they play.`
  );
  const materials = rewrite.materials || existing.materials || "Classroom materials listed for this activity";
  const preparation = rewrite.preparation || (
    infant
      ? "Gather mouth-safe materials and inspect for loose parts.\nChoose a calm, well-lit floor space.\nPlan a short burst between care routines."
      : "Gather center materials and label any specialty props.\nStage the invitation at child height.\nPreview open-ended questions."
  );
  const setup = rewrite.setup || existing.setup || (
    infant
      ? "Position the infant safely within arm’s reach and present one focal material in comfortable visual range."
      : "Arrange materials in an invitation children can enter independently with teacher support nearby."
  );
  const steps = numberedSteps(rewrite.steps || existing.steps || (
    infant
      ? "Settle the infant comfortably.\nPresent one material slowly.\nNarrate what you see the infant do.\nPause and watch for engagement cues.\nStop when the infant looks away or fussiness begins."
      : "Introduce the invitation briefly.\nInvite children to explore.\nAsk one open-ended question.\nSupport peer talk and problem solving.\nHelp children reset materials."
  ));
  const teacherLanguage = rewrite.teacherLanguage || (
    infant
      ? `Look — here’s something for ${title}.\nCan you see it moving?\nYou looked right at it!\nI’m with you.`
      : `What do you notice?\nWhat might we try next?\nHow does this helper/weather idea connect to our community?`
  );
  const observation = rewrite.observation || existing.observationOpportunities || (
    infant
      ? "Visual attention or brief tracking\nChanges in interest or disengagement cues\nReaching or head movement when ready"
      : "Theme vocabulary in play\nCollaboration or problem solving\nUse of materials with purpose"
  );
  const safety = rewrite.safetyNotes || existing.safetyNotes || (
    infant
      ? "Constant adult supervision. Mouth-safe, large materials only. Keep fabric away from face/airway. Stop at distress cues."
      : "Supervise tools and active play. Allergy-aware art materials. Keep pathways clear."
  );
  const cleanup = rewrite.cleanupTips || (
    infant
      ? "Sanitize mouthed materials.\nReturn cards/scarves to a labeled tray.\nWipe the mat if needed."
      : "Return props to labeled bins.\nWipe tables.\nPhotograph work before teardown when useful."
  );
  const age = rewrite.ageModifications || (
    infant
      ? "Infant 0–6 months (younger: look/listen only; older: may reach or bat when ready)"
      : "Preschool 3–5"
  );
  const duration = rewrite.durationMinutes != null
    ? rewrite.durationMinutes
    : (infant ? 4 : 15);

  const needsImage = /basket|center|clinic|map|collage|art|sensory|pinwheel|chart|sort|mirror|tummy|scarf track|pattern|gallery|market|post office|obstacle|relay|dress-up|drum|paint|tools|city/i.test(title)
    && !/song|cuddle|lullaby|hello with caregiver|interview|celebration|yoga|book nook|board book|page party|page replay|stroll|parade/i.test(title);
  const needsPrintable = /card|chart|map|contrast|pattern|weather|helper|dress|symbol|strip|matching|sort/i.test(`${title} ${materials}`);

  return {
    title,
    dayOfWeek: day,
    activityCategory: rewrite.activityCategory || category,
    ageModifications: age,
    durationMinutes: duration,
    objective,
    description,
    materials,
    preparation,
    setup,
    steps,
    teacherLanguage,
    observationOpportunities: observation,
    safetyNotes: safety,
    cleanupTips: cleanup,
    teacherTips: rewrite.teacherTips || (
      infant
        ? [
          "Follow the infant’s alert window — stop early rather than push.",
          "Your face and voice matter more than perfect materials.",
        ]
        : [
          "Keep the experience open-ended; avoid one “right” product.",
          "Capture one language quote during play.",
        ]
    ),
    adaptations: rewrite.adaptations || (
      infant
        ? "Younger infants: closer, slower, shorter. Reduce to one focal item if overstimulated."
        : "Offer picture supports, shorter turns, or a quieter station nearby."
    ),
    extensions: rewrite.extensions || (
      infant
        ? "If the infant is reaching, widen the tracking arc slightly."
        : "Invite children to document or teach a peer one discovery."
    ),
    mixedAgeAdaptations: infant
      ? "Pair looking experiences with caregiver hold for less mobile infants."
      : "Younger preschoolers explore props; older peers can lead a short report.",
    substitutions: rewrite.substitutions || [
      { need: "Specialty prop", use: "Classroom substitute from the theme basket" },
    ],
    vocabulary: rewrite.vocabulary || (infant
      ? ["look", "see", "watch"]
      : text(plan.vocabularyWords).split(/\n/).map(text).filter(Boolean).slice(0, 4)),
    observationPrompts: observation.split(/\n/).map(text).filter(Boolean).slice(0, 3),
    settingTags: infant ? ["small_group", "indoor"] : ["small_group", "indoor", "center"],
    imageRequirement: needsImage ? "required" : "not_needed",
    imageBriefSetup: needsImage ? `Setup illustration for ${title}` : "",
    imageBriefExample: "",
    indoorAlternatives: "Use the same invitation indoors near a window or calm mat.",
    outdoorAlternatives: infant
      ? "Shaded outdoor look with the same material if weather and supervision allow."
      : "Move the investigation outdoors when weather/safety allow.",
    _needsImage: needsImage,
    _needsPrintable: needsPrintable,
  };
}

function rewriteIfNeeded(title, infant) {
  const t = title.toLowerCase();
  if (!infant && t.includes("firefighter rescue relay")) {
    return {
      activityCategory: "Art",
      objective: "Explore rescue/helper colors through open-ended collage — not a race or product craft.",
      description: "Children choose red/yellow/black/blue papers and collage freely while talking about helpers who keep people safe. There is no model product to copy.",
      materials: "Construction paper scraps (red/yellow/black/blue)\nGlue sticks\nTape\nLarge paper\nOptional helper picture cards (draft printable)",
      preparation: "Set a process-art tray with mixed color scraps.\nRemove any sample “finished firefighter” craft.\nPost a simple prompt: “What colors help us feel safe?”",
      setup: "Open art table with color trays and blank paper; helper cards nearby for talk, not matching worksheets.",
      steps: "Invite children to choose colors freely.\nCollage without a model product.\nTalk about helpers who keep people safe.\nAsk what colors they chose and why.\nDisplay many different outcomes together.",
      teacherLanguage: "What colors did you choose?\nWho helps keep people safe in our community?\nHow is your collage different from your friend’s?",
      observation: "Makes independent visual choices\nUses helper vocabulary\nAccepts multiple outcomes",
      safetyNotes: "Supervise glue; keep scissors adult-only unless children are ready and supervised.",
      cleanupTips: "Dry collages flat; return scraps to trays.",
      durationMinutes: 15,
      ageModifications: "Preschool 3–5",
      vocabulary: ["helper", "safe", "color", "collage"],
    };
  }
  if (!infant && t.includes("community helper matching")) {
    return {
      activityCategory: "Open-Ended Exploration",
      objective: "Talk about helpers and tools using picture cards during open play — not a graded matching worksheet.",
      description: "Children explore helper and tool cards in a basket, inventing connections in conversation and play.",
      materials: "Helper picture cards (draft printable)\nOptional real props\nBasket",
      preparation: "Print/cut draft helper cards.\nPlace in a basket with 2–3 props.",
      setup: "Low table or rug with card basket; no answer key sheet.",
      steps: "Invite children to choose cards.\nTalk about who uses which tools.\nAct out a helper job.\nSort only if children invent sorting.\nPut cards away together.",
      teacherLanguage: "Who might use this tool?\nWhat job helps our neighborhood?\nCan you show me with your body?",
      observation: "Helper vocabulary\nFlexible thinking\nPeer conversation",
      durationMinutes: 12,
      ageModifications: "Preschool 3–5",
    };
  }
  if (!infant && (t.includes("cloud cotton art") || t.includes("rainbow after rain"))) {
    return {
      activityCategory: "Art",
      objective: "Explore weather ideas through process art with many possible outcomes.",
      description: "Children use loose parts and paint/collage materials to explore clouds, rain, or light after rain. Teachers do not provide a single finished model to copy.",
      materials: t.includes("cloud")
        ? "Blue/gray paper\nCotton or tissue\nGlue\nCrayons"
        : "Watercolor or tempera\nPaper\nBrushes\nOptional collage scraps",
      preparation: "Stage open-ended art trays.\nRemove sample “perfect rainbow/cloud” products.",
      setup: "Art table with materials in reach; drying rack ready.",
      steps: "Invite children to explore materials.\nTalk about weather words as they work.\nAccept every outcome.\nAsk what weather their work reminds them of.\nDisplay a variety of pieces.",
      teacherLanguage: "What weather are you thinking about?\nWhat happened when the colors mixed?\nHow does your picture feel — calm, stormy, bright?",
      observation: "Process over product\nWeather vocabulary\nFine-motor exploration",
      durationMinutes: 15,
      ageModifications: "Preschool 3–5",
    };
  }
  if (!infant && t.includes("chef's kitchen")) {
    return {
      activityCategory: "Dramatic Play",
      objective: "Practice grocery/food-helper roles with language and cooperation.",
      description: "Children run a pretend market/kitchen, taking orders, sorting play food, and thanking helpers.",
      materials: "Play food\nBaskets\nMenus/signs (draft printable optional)\nAprons",
      preparation: "Stage dramatic-play kitchen/market.\nAdd simple open signs.",
      setup: "Dramatic-play area with labeled zones.",
      steps: "Choose roles.\nTake orders or stock shelves.\nUse helper vocabulary.\nSwitch roles.\nReset the center.",
      teacherLanguage: "What does the grocery helper do?\nHow can we help a customer?\nWhat should we thank our chef for?",
      durationMinutes: 15,
      ageModifications: "Preschool 3–5",
    };
  }
  if (infant && /scarf|track|visual/i.test(t)) {
    return {
      preparation: "Choose one clean, lightweight scarf.\nInspect for loose threads.\nClear a calm mat space.",
      teacherLanguage: "Look at the bright scarf.\nCan you see it moving?\nHere it comes across.\nYou watched it!",
      cleanupTips: "Shake out scarf; sanitize if mouthed; store flat.",
      durationMinutes: 3,
      ageModifications: "Infant 0–6 months (younger: look only; older: may bat scarf)",
    };
  }
  return {};
}

function buildProposedDailyPlans(plan, storeActsByItemId, patchesByActivityId, extraMonday) {
  const proposed = {};
  WEEKDAYS.forEach((day) => {
    const items = (plan.dailyPlans?.[day]?.items || []).map((item) => {
      const store = storeActsByItemId.get(item.itemId);
      const activityId = store?.id;
      const patch = patchesByActivityId[activityId] || {};
      return {
        ...item,
        ...patch,
        itemId: item.itemId,
        activityId,
        id: activityId,
        dayOfWeek: day,
        title: patch.title || item.title,
      };
    });
    if (day === "monday" && extraMonday) {
      items.push(extraMonday);
    }
    proposed[day] = {
      theme: plan.dailyPlans?.[day]?.theme || plan.dailyPlans?.[day]?.focus || "",
      focus: plan.dailyPlans?.[day]?.focus || "",
      objectives: plan.dailyPlans?.[day]?.objectives || "",
      items,
    };
  });
  return proposed;
}

function blankCountForMerged(storeAct, patch) {
  const model = enrichment.mapActivityToOwnerEditorModel(storeAct, patch, { age: storeAct.age });
  return CORE.filter((k) => !enrichment.computeActivityCompletion(storeAct, patch, null).model
    || !text(model[k])).length;
}

function auditPlan(plan, activities, draft) {
  const list = enrichment.flattenLessonActivities(plan, activities, draft);
  const rows = list.map((act) => {
    const key = text(act.id) || text(act.itemId);
    const patch = draft?.activities?.[key] || {};
    const completion = enrichment.computeActivityCompletion(act, patch, plan);
    const status = enrichment.activityStatus(act, patch);
    return {
      day: act.dayOfWeek,
      activityId: act.id,
      itemId: act.itemId,
      title: act.title,
      corePercent: completion.percent,
      missing: completion.missing,
      sidebarStatus: status,
      blankCoreCount: completion.missing.length,
    };
  });
  return {
    activityCount: rows.length,
    dayCounts: Object.fromEntries(WEEKDAYS.map((d) => [d, rows.filter((r) => r.day === d).length])),
    blankCoreCells: rows.reduce((n, r) => n + r.blankCoreCount, 0),
    activitiesWithBlanks: rows.filter((r) => r.blankCoreCount > 0).length,
    sidebarCompleteDespiteCoreGaps: rows.filter((r) => r.sidebarStatus === "complete" && r.blankCoreCount > 0).length,
    rows,
  };
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (res.status !== 200 || !(res.json?.token || res.json?.adminToken)) {
    throw new Error(`Admin login failed (${res.status}): ${res.json?.error || "no token"}`);
  }
  return res.json.token || res.json.adminToken;
}

async function loadAdminSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error(`site-content failed ${res.status}`);
  return res.json.siteContent;
}

async function saveEnrichmentDraft(token, planId, enrichmentDraft, expectedUpdatedAt) {
  const res = await requestJson(
    "POST",
    "/api/admin/curriculum/lesson-plans",
    {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
      lessonPlan: {
        id: planId,
        enrichmentDraft,
      },
    },
    { Authorization: `Bearer ${token}` },
  );
  return res;
}

async function uploadPrintable(token, lessonPlanId, title, pdfPath, expectedUpdatedAt) {
  const buf = fs.readFileSync(pdfPath);
  const fileData = `data:application/pdf;base64,${buf.toString("base64")}`;
  const res = await requestJson(
    "POST",
    "/api/admin/curriculum/resources/tk-printable",
    {
      action: "create",
      lessonPlanId,
      title,
      status: "draft",
      fileName: path.basename(pdfPath),
      fileData,
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
    },
    { Authorization: `Bearer ${token}` },
  );
  return res;
}

async function uploadSetupPhoto(token, lessonPlanId, activityKey, pngPath) {
  const buf = fs.readFileSync(pngPath);
  const fileData = `data:image/png;base64,${buf.toString("base64")}`;
  return requestJson(
    "POST",
    "/api/admin/curriculum/enrichment-photos/upload",
    {
      adminToken: token,
      lessonPlanId,
      activityKey,
      field: "setupImageUrl",
      fileName: path.basename(pngPath),
      fileData,
    },
    { Authorization: `Bearer ${token}` },
  );
}

function printableFilesForKit(planId) {
  const map = {
    "cur-lp-infant-colors-all-around-us": [
      ["Bright Color Gaze Cards (draft)", "printables/colors-all-around-us/bright-color-gaze-cards.pdf"],
      ["Caregiver Color Talk Mini Guide (draft)", "printables/colors-all-around-us/caregiver-color-talk-mini-guide.pdf"],
    ],
    "cur-lp-infant-black-white-discovery": [
      ["High-Contrast Pattern & Face Cards (draft)", "printables/black-white-discovery/high-contrast-pattern-and-face-cards.pdf"],
      ["Tummy-Time Visual Strip (draft)", "printables/black-white-discovery/tummy-time-visual-strip.pdf"],
    ],
    "cur-lp-preschool-community-helpers": [
      ["Community Helper Picture Cards (draft)", "printables/community-helpers/community-helper-picture-cards.pdf"],
      ["Helper Place Signs (draft)", "printables/community-helpers/helper-place-signs.pdf"],
    ],
    "cur-lp-preschool-weather-watchers": [
      ["Weather Symbol Cards (draft)", "printables/weather-watchers/weather-symbol-cards.pdf"],
      ["Weekly Weather Observation Chart (draft)", "printables/weather-watchers/weekly-weather-observation-chart.pdf"],
      ["Clothing for Weather Cards (draft)", "printables/weather-watchers/clothing-for-weather-cards.pdf"],
    ],
  };
  return (map[planId] || []).map(([title, rel]) => [title, path.join(OUT_DIR, rel)]);
}

function imageFileForTitle(planId, title) {
  const folder = {
    "cur-lp-infant-colors-all-around-us": "colors-all-around-us",
    "cur-lp-infant-black-white-discovery": "black-white-discovery",
    "cur-lp-preschool-community-helpers": "community-helpers",
    "cur-lp-preschool-weather-watchers": "weather-watchers",
  }[planId];
  if (!folder) return null;
  const dir = path.join(ROOT, "images/teaching-kit-drafts", folder);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
  const needle = title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const hit = files.find((f) => {
    const stem = f.replace(/-setup\.png$/i, "").replace(/-/g, " ");
    return needle.includes(stem.split(" ")[0]) || stem.split(" ").some((w) => w.length > 4 && needle.includes(w));
  });
  return hit ? path.join(dir, hit) : null;
}

function weekMetaForPlan(plan, printableIds) {
  const infant = isInfant(plan);
  const base = completeWeekMetaForAdmin({
    id: plan.id,
    title: plan.title,
    age: plan.age,
    weeklyOverview: plan.weeklyOverview || plan.enrichmentDraft?.week?.weeklyOverview || (
      infant
        ? "Brief looking, tracking, tummy time, and caregiver language — not drills or crafts."
        : "Play-based theme exploration across dramatic play, investigation, literacy, and process art."
    ),
    objectives: plan.objectives || "Support engagement, language, and developmentally appropriate exploration.",
    weeklyMaterials: plan.weeklyMaterials || "",
    vocabularyWords: plan.vocabularyWords || "",
    familyConnection: plan.familyConnection || (
      infant
        ? "Invite families to narrate one color or pattern moment at home — playful, not a quiz."
        : "Invite families to share one theme observation from the neighborhood or sky."
    ),
    adaptations: plan.adaptations || "",
    safetyNotes: plan.safetyNotes || "",
    teacherPreparation: plan.enrichmentDraft?.week?.teacherPreparation
      || "Gather specialty materials; print draft resources; stage calm invitations.",
    observationOpportunities: plan.observationOpportunities || "",
    books: plan.enrichmentDraft?.week?.books || plan.books || [],
    songs: plan.enrichmentDraft?.week?.songs || plan.songs || [],
    teacherToolkit: plan.enrichmentDraft?.week?.teacherToolkit || plan.teachingKit?.teacherToolkit || {},
    printableIdeas: plan.enrichmentDraft?.week?.printableIdeas || [],
    vocabCards: plan.enrichmentDraft?.week?.vocabCards || [],
    milestones: plan.enrichmentDraft?.week?.milestones || [],
  });
  return {
    ...base,
    printableIds,
  };
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    console.error("Refusing to write: set LLH_APPLY_PRODUCTION_DRAFTS=1");
    process.exit(2);
  }
  if (!ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    console.error("ADMIN_PASSWORD and ADMIN_ACCESS_CODE are required");
    process.exit(2);
  }

  const token = await login();
  let site = await loadAdminSite(token);
  const before = {};
  const after = {};
  const results = [];

  for (const planId of TARGET_IDS) {
    site = await loadAdminSite(token); // fresh concurrency stamp
    const curriculum = site.curriculum || {};
    const plan = (curriculum.lessonPlans || []).find((p) => p.id === planId);
    if (!plan) throw new Error(`Missing plan ${planId} on ${SITE_URL}`);
    const storeActs = (curriculum.activities || []).filter((a) => a.lessonPlanId === planId && a.status !== "archived");
    const byItemId = new Map(storeActs.map((a) => [a.itemId, a]));
    const priorDraft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? plan.enrichmentDraft
      : { activities: {}, week: {} };

    before[planId] = auditPlan(plan, curriculum.activities || [], priorDraft);

    // Upload draft printables first (best-effort).
    const printableIds = [...(priorDraft.week?.printableIds || [])];
    for (const [title, pdfPath] of printableFilesForKit(planId)) {
      if (!fs.existsSync(pdfPath)) continue;
      if (printableIds.length >= printableFilesForKit(planId).length) break;
      const up = await uploadPrintable(token, planId, title, pdfPath, site.updatedAt);
      if (up.status === 200) {
        const rid = up.json?.resource?.id || up.json?.resourceId;
        if (rid && !printableIds.includes(rid)) printableIds.push(rid);
        site = up.json?.siteContent || (await loadAdminSite(token));
      } else {
        results.push({ planId, printableError: up.json?.error || up.status, title });
      }
    }

    site = await loadAdminSite(token);
    const plan2 = site.curriculum.lessonPlans.find((p) => p.id === planId);
    const storeActs2 = (site.curriculum.activities || []).filter((a) => a.lessonPlanId === planId && a.status !== "archived");
    const byItemId2 = new Map(storeActs2.map((a) => [a.itemId, a]));

    const patches = {};
    const imageJobs = [];
    WEEKDAYS.forEach((day) => {
      (plan2.dailyPlans?.[day]?.items || []).forEach((item) => {
        const store = byItemId2.get(item.itemId);
        if (!store?.id) throw new Error(`${planId} missing store activity for ${item.itemId}`);
        const patch = contentForActivity(plan2, { ...item, ...store, title: item.title || store.title }, day);
        // Keep materials note about draft printables when relevant.
        if (patch._needsPrintable && printableIds.length) {
          const note = "Printable (draft): see Teaching Kit linked draft resources";
          if (!String(patch.materials).includes("Printable (draft)")) {
            patch.materials = `${patch.materials}\n${note}`;
          }
        }
        const { _needsImage, _needsPrintable, ...clean } = patch;
        patches[store.id] = {
          ...(priorDraft.activities?.[store.id] || {}),
          ...clean,
        };
        if (_needsImage) {
          const img = imageFileForTitle(planId, item.title || store.title);
          if (img) imageJobs.push({ activityKey: store.id, img, title: item.title });
        }
      });
    });

    // Colors: add missing Monday activity in draft proposed plans only.
    let extraMonday = null;
    if (planId === "cur-lp-infant-colors-all-around-us") {
      const mondayCount = (plan2.dailyPlans?.monday?.items || []).length;
      if (mondayCount < 3) {
        const itemId = "item-infant-colors-face-to-face-color-talk-draft";
        extraMonday = {
          itemId,
          id: itemId,
          activityId: itemId,
          dayOfWeek: "monday",
          title: "Face-to-Face Color Talk",
          activityCategory: "Social Emotional",
          ageModifications: "Infant 0–6 months",
          durationMinutes: 3,
          objective: "Pair caregiver face and a single bright cloth for social looking.",
          description: "Caregiver holds infant or sits face-to-face, shows one cloth briefly, then returns to face/voice. No naming quiz.",
          materials: "One bright cloth\nFloor mat or caregiver hold",
          preparation: "Choose one cloth color.\nWash hands; settle for a short awake window.",
          setup: "Sit face-to-face with infant supported; keep cloth to the side until ready.",
          steps: "1. Smile and greet the infant.\n2. Show one cloth briefly near your face.\n3. Narrate color gently.\n4. Hide cloth and return to face.\n5. Stop at look-away cues.",
          teacherLanguage: "Hello! I see you.\nLook — a bright cloth.\nBack to my face — hi!",
          observationOpportunities: "Looks between face and cloth\nSocial smiling/cooing\nDisengagement cues",
          safetyNotes: "Support head/body; never leave infant unattended; keep cloth off face/airway.",
          cleanupTips: "Sanitize cloth if mouthed.",
          teacherTips: ["Face is the richest visual — cloth is secondary."],
          imageRequirement: "not_needed",
        };
        patches[itemId] = { ...extraMonday };
      }
    }

    const proposedDailyPlans = buildProposedDailyPlans(plan2, byItemId2, patches, extraMonday);
    const weekBase = weekMetaForPlan(plan2, printableIds);

    const enrichmentDraft = {
      ...priorDraft,
      updatedAt: new Date().toISOString(),
      lastEditedBy: ADMIN_EMAIL,
      previewReady: true,
      draftOnly: true,
      neverAutoPublish: true,
      activities: {
        ...(priorDraft.activities || {}),
        ...patches,
      },
      week: {
        ...(priorDraft.week || {}),
        weeklyOverview: weekBase.weeklyOverview,
        objectives: Array.isArray(weekBase.objectives) ? weekBase.objectives.join("\n") : weekBase.objectives,
        weeklyMaterials: Array.isArray(weekBase.weeklyMaterials) ? weekBase.weeklyMaterials.join("\n") : weekBase.weeklyMaterials,
        familyConnection: weekBase.familyConnection,
        adaptations: weekBase.adaptations,
        vocabularyWords: Array.isArray(weekBase.vocabularyWords) ? weekBase.vocabularyWords.join("\n") : weekBase.vocabularyWords,
        teacherPreparation: Array.isArray(weekBase.teacherPreparation) ? weekBase.teacherPreparation.join("\n") : weekBase.teacherPreparation,
        books: weekBase.books,
        songs: weekBase.songs,
        teacherToolkit: weekBase.teacherToolkit,
        printableIdeas: weekBase.printableIdeas,
        printableIds,
        vocabCards: weekBase.vocabCards,
        milestones: weekBase.milestones,
        proposedDailyPlans,
        fieldOwnership: {
          objectives: true,
          weeklyOverview: true,
          weeklyMaterials: true,
          familyConnection: true,
        },
      },
      meta: {
        purpose: "Production Admin draft repair — enrichment_draft only; not published",
        sourceLessonId: planId,
        repairedAt: new Date().toISOString(),
        environment: SITE_URL,
      },
    };

    const save = await saveEnrichmentDraft(token, planId, enrichmentDraft, site.updatedAt);
    if (save.status !== 200) {
      throw new Error(`${planId} draft save failed ${save.status}: ${save.json?.error || save.raw?.slice?.(0, 200)}`);
    }
    if (save.json?.publishedUnchanged !== true && save.json?.saveMode !== "enrichment_draft") {
      // still ok if enrichment_draft
    }

    // Best-effort photo uploads (may fail if enrichment editor flag off).
    const photoResults = [];
    for (const job of imageJobs) {
      const photo = await uploadSetupPhoto(token, planId, job.activityKey, job.img);
      photoResults.push({
        title: job.title,
        activityKey: job.activityKey,
        status: photo.status,
        error: photo.json?.error || null,
        mediaUrl: photo.json?.mediaUrl || null,
      });
      if (photo.status === 200 && photo.json?.mediaUrl) {
        // Merge URL into draft and re-save once after loop for efficiency — collect first.
        patches[job.activityKey].setupImageUrl = photo.json.mediaUrl;
        patches[job.activityKey].setupMediaAssetId = photo.json.mediaAssetId || "";
        patches[job.activityKey].imageRequirement = "required";
      }
    }
    if (photoResults.some((p) => p.status === 200)) {
      enrichmentDraft.activities = { ...enrichmentDraft.activities, ...patches };
      site = await loadAdminSite(token);
      const save2 = await saveEnrichmentDraft(token, planId, enrichmentDraft, site.updatedAt);
      if (save2.status !== 200) {
        results.push({ planId, photoSaveError: save2.json?.error || save2.status });
      }
    }

    site = await loadAdminSite(token);
    const planAfter = site.curriculum.lessonPlans.find((p) => p.id === planId);
    after[planId] = auditPlan(planAfter, site.curriculum.activities || [], planAfter.enrichmentDraft);
    results.push({
      planId,
      title: planAfter.title,
      lessonStatus: planAfter.status,
      enrichmentPublished: Boolean(planAfter.enrichmentPublished),
      lastEditedBy: planAfter.enrichmentDraft?.lastEditedBy,
      printableIds,
      photoResults,
      before: {
        activityCount: before[planId].activityCount,
        blankCoreCells: before[planId].blankCoreCells,
        activitiesWithBlanks: before[planId].activitiesWithBlanks,
        sidebarCompleteDespiteCoreGaps: before[planId].sidebarCompleteDespiteCoreGaps,
      },
      after: {
        activityCount: after[planId].activityCount,
        blankCoreCells: after[planId].blankCoreCells,
        activitiesWithBlanks: after[planId].activitiesWithBlanks,
        dayCounts: after[planId].dayCounts,
        sidebarCompleteDespiteCoreGaps: after[planId].sidebarCompleteDespiteCoreGaps,
      },
      activityIds: after[planId].rows.map((r) => ({
        day: r.day,
        activityId: r.activityId,
        itemId: r.itemId,
        title: r.title,
        corePercent: r.corePercent,
        missing: r.missing,
      })),
    });
  }

  const report = {
    ok: results.every((r) => r.after && r.after.blankCoreCells === 0 && r.after.activityCount >= 15),
    environment: SITE_URL,
    endpointRead: "GET /api/admin/site-content",
    endpointWrite: "POST /api/admin/curriculum/lesson-plans (saveMode=enrichment_draft)",
    publishedEnrichment: false,
    customerLessonStatusUnchanged: results.every((r) => r.lessonStatus === "published"),
    results,
    before,
    after,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "production-admin-repair-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    ok: report.ok,
    environment: report.environment,
    summary: results.map((r) => ({
      id: r.planId,
      beforeBlanks: r.before.blankCoreCells,
      afterBlanks: r.after.blankCoreCells,
      count: r.after.activityCount,
      dayCounts: r.after.dayCounts,
      printables: r.printableIds,
      photosOk: (r.photoResults || []).filter((p) => p.status === 200).length,
      photosFail: (r.photoResults || []).filter((p) => p.status !== 200).length,
    })),
  }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
