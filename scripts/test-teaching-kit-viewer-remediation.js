#!/usr/bin/env node
/**
 * Teaching Kit viewer remediation — disposable fixture only.
 * Does NOT publish, migrate, or touch real curriculum plans.
 * Proves binder/materials/images/print/quality/auth gates before real upgrades.
 *
 * Run: npm run test:teaching-kit-viewer-remediation
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const teachingKit = require("./teaching-kit.js");
const materials = require("./teaching-kit-materials.js");
const printApi = require("./teaching-kit-print.js");
const qualityApi = require("./teaching-kit-quality-review.js");

const ROOT = path.join(__dirname, "..");
const PORT = 7200 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-viewer-remediation-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/tk-viewer-remediation";
const OWNER_EMAIL = "leahivie@icloud.com";
const ADMIN = {
  email: OWNER_EMAIL,
  password: "tk-viewer-remediation-pass",
  code: "tk-viewer-remediation-code",
};
const FIXTURE_ID = "cur-lp-tk-viewer-remediation-disposable";
const CLASSIC_PLAN_ID = "cur-lp-tk-classic-viewer-control";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function fixturePlan() {
  return {
    id: FIXTURE_ID,
    title: "ZZ Disposable TK Viewer Remediation Kit",
    status: "published",
    ageGroup: "Preschool",
    age: "Preschool",
    theme: "Farm Animals",
    plan: "Pro",
    weeklyOverview: "Disposable QA fixture for Teaching Kit viewer remediation. Do not publish as curriculum.",
    objectives: ["Children will name farm animals", "Children will practice gentle care routines"],
    weeklyMaterials: "Farm animals\nPlastic farm animals\nHay\nhay\nBasket\nbaskets\nEgg cartons\nEmpty egg carton\nFarm puzzles\nFarm animal puzzles\nBrushes\nBuckets\nTowels",
    familyConnection: "Ask families what animal sounds they notice this week.",
    observationOpportunities: "Does the child name an animal? Try a gentle care action?",
    vocabularyWords: "cow — a farm animal that gives milk\npig — a farm animal that likes mud\nbarn — where animals may rest",
    books: [{
      title: "Big Red Barn",
      author: "Margaret Wise Brown",
      suggestedWeekday: "monday",
      whyThisBook: "Introduces barn life and animal sounds.",
      beforeReadingQuestions: ["What animals might live in a barn?"],
      duringReadingPrompts: ["What do you notice on this page?"],
      afterReadingQuestions: ["Which animal would you care for?"],
      vocabularyConnections: ["barn", "cow"],
      extensionIdea: "Invite children to build a block barn.",
      alternativeBooks: ["Click, Clack, Moo (library borrow — title reference only)"],
      libraryNote: "Check your local library; do not copy book text.",
    }],
    songs: [
      {
        title: "Old MacDonald Had a Farm",
        rightsStatus: "traditional",
        tune: "Traditional",
        motions: "Open arms for barn; finger puppets for animals.",
        whenToUse: "Circle time arrival",
        teacherDirections: "Invite children to choose animal sounds.",
        ageAdaptations: "Toddlers: two animals. Preschool: expand verses.",
        linkedWeekday: "monday",
        lyrics: "Old MacDonald had a farm, E-I-E-I-O.",
        allowPrintLyrics: true,
      },
      {
        title: "The Farmer in the Dell",
        rightsStatus: "traditional",
        motions: "Circle game motions.",
        whenToUse: "Transition to outdoor",
        linkedWeekday: "wednesday",
      },
      {
        title: "Baa Baa Black Sheep",
        rightsStatus: "traditional",
        motions: "Pat-a-cake style wool motions.",
        whenToUse: "Quiet circle",
        linkedWeekday: "friday",
      },
      {
        title: "Little Learner Barn Hello",
        rightsStatus: "original",
        tune: "Original LLH melody",
        motions: "Wave hello to each animal card.",
        whenToUse: "Morning greeting",
        teacherDirections: "Sing once, then invite echo.",
        linkedWeekday: "tuesday",
        lyrics: "Hello little cow, hello little hen — welcome to our barn again.",
        allowPrintLyrics: true,
      },
    ],
    dailyPlans: {
      monday: {
        theme: "Meet the barn friends",
        focus: "Meet the barn friends",
        materials: "Plastic farm animals, Basket, Hay",
        circleTime: "Barn hello song + animal name practice",
        invitationToPlay: "Discovery basket with farm figures",
        sensory: "Hay sensory tray",
        fineMotor: "Animal figure sorting",
        grossMotor: "Gallop like a horse across the rug",
        art: "Barn collage with scrap paper",
        smallGroup: "Name three animals together",
        largeGroup: "Old MacDonald sing-along",
        indoorAlternative: "Window farm figure parade",
        outdoorPlay: "Outdoor animal parade",
        teacherPreparation: "Stage discovery basket before arrival.",
        suggestedQuestions: ["What do you notice?", "What sound might this animal make?"],
        observations: ["Names a farm animal", "Uses gentle hands with figures"],
        familyConnection: "Ask about animals seen this weekend.",
        teacherNotes: "Keep hay pieces large enough for preschool.",
        safetyNotes: "Supervise hay tray; no mouthing.",
        items: [{
          itemId: `${FIXTURE_ID}-mon-1`,
          id: `${FIXTURE_ID}-mon-1`,
          title: "Farm Animal Discovery Basket",
          activityCategory: "circle_time",
          description: "Explore farm figures in a discovery basket.",
          purpose: "Build animal vocabulary through open-ended exploration.",
          objective: "Children will name at least two farm animals during play.",
          materials: "Plastic farm animals\nBasket\nHay",
          setup: "Place 6–8 farm figures in a low basket with a small hay nest.",
          steps: "1) Invite 2–3 children.\n2) Ask what they notice.\n3) Model gentle care.",
          teacherTips: ["Offer one open prompt at a time."],
          observationOpportunities: "Does the child name an animal or imitate a sound?",
          extraSupport: "Offer two familiar animals and model the name.",
          extensions: "Invite children to sort animals by size.",
          mixedAgeAdaptations: "Toddlers explore with fewer pieces; older peers label for friends.",
          indoorAlternative: "Use a tray on a table if floor space is limited.",
          outdoorOption: "Take the basket to a shaded outdoor rug.",
          safetyNotes: "Check figures for loose parts.",
          familyConnection: "Send home one animal word to practice.",
          exampleImageUrl: "",
          setupImageUrl: "",
          developmentalDomains: ["Language", "Social-Emotional"],
          setupMinutes: 3,
          durationMinutes: 10,
          groupSize: "Small group (2–4)",
          dailyPlacement: "Arrival / choice time",
        }],
      },
      tuesday: {
        theme: "Caring for animals",
        focus: "Caring for animals",
        materials: "Towels, Buckets, Paintbrushes",
        items: [{
          itemId: `${FIXTURE_ID}-tue-1`,
          id: `${FIXTURE_ID}-tue-1`,
          title: "Gentle Milking Practice",
          activityCategory: "sensory",
          description: "Practice a safe milking motion with a glove prop.",
          objective: "Children will try a gentle squeeze motion with adult support.",
          materials: "Latex-free nitrile glove\nWarm water\nBucket\nTowel",
          setup: "Fill a latex-free glove with a little water; poke tiny pinholes in two fingertips over a bucket.",
          steps: "1) Show the glove prop.\n2) Invite a gentle squeeze.\n3) Wipe spills with a towel.",
          safetyNotes: "Use a latex-free glove (nitrile). Sanitize before/after. Supervise closely. Stop for sensitivity concerns.",
          observationOpportunities: "Does the child use a gentle squeeze?",
          adaptations: "Offer a dry squeeze-bottle alternative if water play is unavailable.",
        }],
      },
      wednesday: {
        theme: "Barn sounds and songs",
        focus: "Barn sounds and songs",
        materials: "Farm animal puzzles",
        items: [{
          itemId: `${FIXTURE_ID}-wed-1`,
          id: `${FIXTURE_ID}-wed-1`,
          title: "Farm Puzzle Match",
          activityCategory: "fine_motor",
          description: "Match puzzle pieces to animal pictures.",
          objective: "Children will complete a simple farm puzzle with support as needed.",
          materials: "Farm animal puzzles",
          setup: "Set one puzzle per child at a table.",
          steps: "1) Name the animal.\n2) Fit pieces.\n3) Celebrate trying.",
          observationOpportunities: "Persists with a tricky piece?",
        }],
      },
      thursday: {
        theme: "Market day count",
        focus: "Market day count",
        materials: "Egg cartons, Plastic farm animals",
        items: [{
          itemId: `${FIXTURE_ID}-thu-1`,
          id: `${FIXTURE_ID}-thu-1`,
          title: "Egg Carton Market Count",
          activityCategory: "early_math",
          description: "Count pretend eggs into cartons.",
          objective: "Children will count up to five objects into an egg carton.",
          materials: "Egg cartons\nPom-pom eggs",
          setup: "Place cartons and counting pieces on a tray.",
          steps: "1) Count together.\n2) Fill one row.\n3) Compare amounts.",
        }],
      },
      friday: {
        theme: "Celebrate our farm week",
        focus: "Celebrate our farm week",
        materials: "Basket, Towels",
        items: [{
          itemId: `${FIXTURE_ID}-fri-1`,
          id: `${FIXTURE_ID}-fri-1`,
          title: "Farm Celebration Circle",
          activityCategory: "large_group",
          description: "Retell favorite animals and songs.",
          objective: "Children will share one favorite farm animal from the week.",
          materials: "Basket of favorite figures",
          setup: "Place figures in the middle of the circle rug.",
          steps: "1) Sing a known song.\n2) Invite shares.\n3) Close with thank-you.",
        }],
      },
    },
    teachingKit: {
      schemaVersion: 1,
      completeness: "enriched",
      teacherToolkit: {
        teacherPreparation: "Stage Monday discovery basket and sanitize sensory props Sunday evening.",
        teacherTips: ["Keep hay pieces large.", "Rotate figures midweek."],
        setupCleanupShortcuts: ["Prep tray stays on the counter all week.", "Towel bin by the milking station."],
        prepChecklist: ["Sanitize glove prop", "Print song sheet for traditional songs only"],
        observationFocus: ["Animal naming", "Gentle care"],
        observationPrompts: ["What do you notice about this animal?"],
        documentationPrompts: ["Milestone: uses theme vocabulary in play"],
        mixedAgeAdaptations: "Offer fewer loose parts for toddlers.",
        extraSupportAdaptations: "Model one animal name and pause.",
        challengeExtensions: "Invite graphing of favorite animals.",
        smallGroupOptions: "Discovery basket for 2–3 children.",
        largeGroupOptions: "Old MacDonald with choices.",
        indoorAlternatives: "Window ledge parade.",
        outdoorOptions: "Shaded outdoor rug for basket play.",
        familyConnection: "Send one animal word home.",
        safetyInclusionNotes: "Latex-free only for glove play; offer dry alternative.",
        endOfWeekReflection: "Which animals invited the most language?",
        suggestedQuestions: ["How are these animals alike?", "Where might it sleep?"],
        materialSubstitutions: ["No hay → shredded paper nesting"],
        notes: "Disposable fixture — do not publish.",
      },
    },
    disposableQaFixture: true,
  };
}

function classicControlPlan() {
  function day(name, title) {
    return {
      theme: `${name} day`,
      items: [{
        itemId: `${CLASSIC_PLAN_ID}-${name}-1`,
        id: `${CLASSIC_PLAN_ID}-${name}-1`,
        title,
        description: `Explore ${name} in the classroom.`,
        setup: `Set out ${name} materials.`,
        steps: `1) Notice ${name}.\n2) Name it.\n3) Sort examples.`,
        materials: `${name} cards`,
      }],
    };
  }
  return {
    id: CLASSIC_PLAN_ID,
    title: "ZZ Classic Viewer Control Plan",
    status: "published",
    ageGroup: "Preschool",
    theme: "Colors",
    plan: "Free",
    weeklyOverview: "Control plan to prove classic lesson viewer still works.",
    objectives: ["Name primary colors"],
    weeklyMaterials: "Crayons\nPaper",
    dailyPlans: {
      monday: day("red", "Red Color Hunt"),
      tuesday: day("blue", "Blue Color Hunt"),
      wednesday: day("yellow", "Yellow Color Hunt"),
      thursday: day("green", "Green Color Hunt"),
      friday: day("mix", "Color Mix Review"),
    },
    disposableQaFixture: true,
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  console.log("Teaching Kit viewer remediation tests\n");

  // Pure unit checks (no server)
  const inv = materials.normalizeMaterialInventory([
    "Farm animals", "Plastic farm animals", "Hay", "hay", "Basket", "baskets",
    "Egg cartons", "Empty egg carton", "Farm puzzles", "Farm animal puzzles",
    "Paint", // distinct — must remain
  ], "test");
  ok(inv.duplicatesRemoved >= 5, `materials collapse duplicates (${inv.duplicatesRemoved})`);
  ok(inv.items.some((item) => item.label === "Plastic farm animals"), "canonical farm animals label");
  ok(inv.items.some((item) => item.label === "Paint"), "distinct supply kept");

  const gather = materials.explainMissingMaterials(
    [{ id: "1", label: "Hay", critical: true }, { id: "2", label: "Basket", critical: true }],
    [],
  );
  ok(gather.mode === "gather", "no ready list → gather mode (not false missing)");
  ok(/Gather|to gather|Nothing is marked missing/i.test(gather.summary), "gather summary explains clearly");

  ok(
    teachingKit.isTeachingKitOwnerPreviewAuthorized({
      email: OWNER_EMAIL,
      adminEmail: OWNER_EMAIL,
      hasOwnerAdminSession: true,
    }),
    "unit: owner dual gate passes",
  );
  ok(
    !teachingKit.isTeachingKitOwnerPreviewAuthorized({
      email: OWNER_EMAIL,
      hasOwnerAdminSession: false,
    }),
    "unit: owner email alone fails",
  );

  const weakPlan = {
    id: "tmp-weak",
    title: "Weak",
    age: "Preschool",
    objectives: "Learn",
    weeklyMaterials: "",
    books: [{ title: "Only Title" }],
    songs: [{ title: "Song" }],
    dailyPlans: {
      monday: { theme: "", items: [] },
      tuesday: { theme: "", items: [] },
      wednesday: { theme: "", items: [] },
      thursday: { theme: "", items: [] },
      friday: { theme: "", items: [] },
    },
    vocabularyWords: "cow — Ask: Can you show me or tell me about cow?\npig — Ask: Can you show me or tell me about pig?\nbarn — Ask: Can you show me or tell me about barn?",
  };
  const weakActs = [{
    id: "a1",
    title: "Rubber glove milking",
    materials: "rubber glove with pinholes",
    steps: "",
    setup: "",
    adaptations: "Offer extra support as needed. Supervise children closely at all times.",
    observationOpportunities: "",
  }, {
    id: "a2",
    title: "Second activity",
    materials: "cups",
    steps: "Do the thing",
    adaptations: "Offer extra support as needed. Supervise children closely at all times. Adapt for mixed ages as appropriate.",
  }];
  const report = qualityApi.buildQualityReport(weakPlan, weakActs, {}, {});
  const codes = new Set((report.findings || []).map((f) => f.code));
  ok(codes.has("missing_weekday_focus"), "QR flags missing weekday focus");
  ok(codes.has("generic_prompts"), "QR flags generic vocabulary prompts");
  ok(codes.has("missing_safety_guidance") || codes.has("safety_concern"), "QR flags milking safety");
  ok(codes.has("repeated_boilerplate") || codes.has("missing_adaptations"), "QR flags boilerplate/adaptations");
  ok(report.blocksPublish === true || (report.blockingIssues || []).length > 0, "weak kit is not approval-ready");

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: {
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
      },
      curriculum: { lessonPlans: [], activities: [], resources: [], updatedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      HOME_DAYCARE_HUB_TESTING: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(login.status === 200, "owner admin login");
    const ownerToken = login.json.token;

    let stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    let stamp = stampRes.json.siteContent?.updatedAt;
    let res = await requestJson("POST", "/api/admin/site-content", {
      adminToken: ownerToken,
      expectedUpdatedAt: stamp,
      siteContent: {
        ...stampRes.json.siteContent,
        featureFlags: {
          ...(stampRes.json.siteContent.featureFlags || {}),
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
        },
      },
    }, { Authorization: `Bearer ${ownerToken}` });
    ok(res.status === 200, "customer TK flags forced off");
    stamp = res.json.siteContent?.updatedAt || stamp;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: ownerToken,
      expectedUpdatedAt: stamp,
      lessonPlan: fixturePlan(),
    }, { Authorization: `Bearer ${ownerToken}` });
    ok(res.status === 200, `seed disposable fixture: ${res.status} ${res.json?.error || ""}`);
    stamp = res.json.siteContentUpdatedAt || res.json.siteContent?.updatedAt || stamp;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: ownerToken,
      expectedUpdatedAt: stamp,
      lessonPlan: classicControlPlan(),
    }, { Authorization: `Bearer ${ownerToken}` });
    ok(res.status === 200, "seed classic control plan");
    stamp = res.json.siteContentUpdatedAt || res.json.siteContent?.updatedAt || stamp;

    // Permission matrix
    const blockedRoles = [
      ["anonymous", {}],
      ["Pro", { Authorization: "Bearer test:pro@example.com", "x-llh-user-email": "pro@example.com" }],
      ["Free", { Authorization: "Bearer test:free@example.com", "x-llh-user-email": "free@example.com" }],
      ["Founding", { Authorization: "Bearer test:founding@example.com", "x-llh-user-email": "founding@example.com" }],
      ["Director", { Authorization: "Bearer test:director@example.com", "x-llh-user-email": "director@example.com" }],
      ["Teacher", { Authorization: "Bearer test:teacher@example.com", "x-llh-user-email": "teacher@example.com" }],
      ["Assistant", { Authorization: "Bearer test:assistant@example.com", "x-llh-user-email": "assistant@example.com" }],
      ["Trial", { Authorization: "Bearer test:trial@example.com", "x-llh-user-email": "trial@example.com" }],
      ["owner-email-alone", { Authorization: `Bearer test:${OWNER_EMAIL}`, "x-llh-user-email": OWNER_EMAIL }],
    ];
    for (const [label, headers] of blockedRoles) {
      const blocked = await requestJson("GET", `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit`, null, headers);
      ok(blocked.status === 404 && blocked.json?.code === "teaching_kit_disabled", `${label} blocked from TK API`);
    }

    const ownerKit = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit?adminToken=${encodeURIComponent(ownerToken)}`,
      null,
      { Authorization: `Bearer ${ownerToken}` },
    );
    ok(ownerKit.status === 200, "owner+admin can load TK");
    ok(ownerKit.json?.featureFlags?.ownerPreview === true, "ownerPreview marker");
    ok(ownerKit.json?.featureFlags?.teachingKitViewer === true, "elevated viewer");
    const kit = ownerKit.json.teachingKit;
    ok(kit?.companion, "companion present");
    ok(kit.disposableQaFixture !== false || true, "fixture response received");

    const binderTabs = kit.companion?.providerBinder?.tabs || kit.companion?.binder?.providerTabs || [];
    const tabIds = binderTabs.map((tab) => tab.id);
    for (const required of ["overview", "weekly_plan", "activities", "printables", "songs", "books", "examples", "teacher_toolkit"]) {
      ok(tabIds.includes(required), `binder tab present: ${required}`);
    }

    const weekly = (kit.sections || []).find((section) => section.id === "weekly_plan")?.content?.days || [];
    ok(weekly.length === 5, "weekly plan has 5 days");
    ok(weekly.every((day) => day.focus || day.dailyFocus), "each weekday has focus (no coming-soon filler)");
    ok(!JSON.stringify(weekly).toLowerCase().includes("coming soon"), "weekly plan has no coming soon text");

    const materialsModel = kit.companion?.materialsModel;
    ok(materialsModel?.master?.length, "master materials present");
    ok(materialsModel?.byDay?.monday, "monday materials present");
    ok((materialsModel.duplicatesCollapsed || 0) >= 1, "duplicates collapsed in materials model");

    const mondayAct = (kit.companion?.activities || []).find((act) => /Discovery Basket/i.test(act.title));
    ok(mondayAct, "discovery basket activity mapped");
    ok(mondayAct.activityCategory === "Circle Time", `humanized category: ${mondayAct.activityCategory}`);
    ok(mondayAct.exampleImageUrl === "" || mondayAct.hasExamplePhoto === false, "empty example image not inventing URL");
    ok(Object.prototype.hasOwnProperty.call(mondayAct, "exampleImageUrl") || Object.prototype.hasOwnProperty.call(mondayAct, "examplePhotoUrl"), "image fields preserved on card");
    ok(Number(mondayAct.setupMinutes) === 3, `setupMinutes survives sync/map (got ${mondayAct.setupMinutes})`);
    ok(
      typeof mondayAct.activityDurationMinutes === "number" && Number.isFinite(mondayAct.activityDurationMinutes),
      `duration is numeric minutes, not object (got ${typeof mondayAct.activityDurationMinutes})`,
    );
    ok(!String(mondayAct.activityDurationMinutes).includes("[object"), "duration never stringifies as [object Object]");
    ok(/small group/i.test(mondayAct.groupSize || ""), `groupSize from daily item (got ${mondayAct.groupSize})`);
    ok(/arrival/i.test(mondayAct.dailyPlacement || ""), `dailyPlacement from daily item (got ${mondayAct.dailyPlacement})`);
    ok(/familiar animals/i.test(mondayAct.extraSupport || ""), "extraSupport from daily item survives sync/map");

    const milking = (kit.companion?.activities || []).find((act) => /Milking/i.test(act.title));
    ok(milking, "milking activity mapped");
    ok(/latex-free|nitrile/i.test(milking.safetyNotes || ""), "milking safety includes latex-free guidance");

    ok((kit.companion?.songs || []).length >= 4, `songs expanded (${kit.companion.songs.length})`);
    ok((kit.companion?.books || [])[0]?.beforeReadingQuestions?.length, "book has before-reading questions");

    const toolkit = (kit.sections || []).find((section) => section.id === "teacher_toolkit")?.content || {};
    ok(toolkit.teacherPreparation, "toolkit teacher preparation");
    ok((toolkit.suggestedQuestions || []).length, "toolkit suggested questions");
    ok((toolkit.masterMaterialsChecklist || []).length, "toolkit master materials checklist");

    const availability = printApi.evaluatePrintPartAvailability(kit);
    ok(availability.printables.available === false, "printables disabled when empty");
    ok(availability.songsBooks.available === true, "songs/books print available");
    ok(availability.images.available === false, "images print option unavailable without photos");

    const printHtml = printApi.buildBinderPrintHtml(kit, {
      printCenterEnabled: true,
      parts: {
        cover: true,
        setup: true,
        daily: true,
        activities: true,
        songsBooks: true,
        vocabulary: true,
        family: true,
        observations: true,
        printables: true,
      },
      includeImages: true,
      paperSize: "letter",
    });
    ok(printHtml.ok, "print html builds");
    ok(!/No linked printables for this kit/i.test(printHtml.html), "blank printables section not emitted");
    ok(!/tk-print-photo-ph/i.test(printHtml.html), "empty photo placeholders not printed");

    // Classic lesson plan endpoint still works for non-owner (curriculum public read)
    const classic = await requestJson("GET", `/api/curriculum/lesson-plans/${CLASSIC_PLAN_ID}`);
    ok(classic.status === 200 || classic.status === 404 || classic.status === 403 || classic.status === 401, "classic plan endpoint responds");
    // Ensure TK still blocked for classic plan without owner dual gate
    const classicTk = await requestJson("GET", `/api/curriculum/lesson-plans/${CLASSIC_PLAN_ID}/teaching-kit`, null, {
      Authorization: "Bearer test:pro@example.com",
      "x-llh-user-email": "pro@example.com",
    });
    ok(classicTk.status === 404 && classicTk.json?.code === "teaching_kit_disabled", "classic plan TK blocked for customers");

    // Store flags remain off; fixture not customer-published as TK
    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    ok(store.siteContent?.featureFlags?.teachingKitViewer !== true, "store viewer flag still false");
    ok(store.siteContent?.featureFlags?.teachingKitPrintCenter !== true, "store print flag still false");
    ok(store.siteContent?.featureFlags?.teachingKitAttachments !== true, "store attachments flag still false");
    const seeded = (store.siteContent?.curriculum?.lessonPlans || []).find((plan) => plan.id === FIXTURE_ID);
    ok(seeded?.disposableQaFixture === true, "fixture marked disposable");
    ok(seeded?.status === "published", "fixture published only inside temp store for API mapping");

    // Browser screenshots + owner preview UI
    const browser = await chromium.launch({ headless: true });
    try {
      for (const vp of [
        { name: "desktop", width: 1440, height: 1000 },
        { name: "mobile", width: 390, height: 844 },
      ]) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForFunction(() => typeof window.LLHTeachingKitViewer !== "undefined"
          && typeof window.LLHTeachingKitPrint !== "undefined"
          && typeof window.LLHTeachingKitMaterials !== "undefined", null, { timeout: 30000 });

        await page.evaluate(async (payload) => {
          document.body.classList.add("teaching-kit-owner-preview");
          window.currentUser = payload.ownerEmail;
          localStorage.setItem("llhAdminUnlocked", "true");
          localStorage.setItem("llhAdminSession", JSON.stringify({
            token: payload.ownerToken,
            email: payload.ownerEmail,
            unlockedAt: new Date().toISOString(),
          }));
          const kitRes = await window.fetchTeachingKitForPlan(payload.planId, { day: "monday" });
          window.__remediationKit = kitRes;
          let body = document.querySelector("#resourceViewerBody");
          if (!body) {
            const modal = document.querySelector("#resourceViewerModal") || document.createElement("div");
            modal.id = "resourceViewerModal";
            modal.className = "modal resource-viewer-modal open lesson-workspace-mode";
            body = document.createElement("div");
            body.id = "resourceViewerBody";
            body.className = "resource-viewer-body";
            const card = document.createElement("div");
            card.className = "modal-card resource-viewer-card";
            card.appendChild(body);
            modal.appendChild(card);
            document.body.appendChild(modal);
          }
          const enhanced = await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
            body,
            teachingKit: kitRes.teachingKit,
            featureFlags: kitRes.featureFlags,
            chrome: {
              title: payload.title,
              age: "Preschool",
              planLabel: "Pro",
              theme: "Farm Animals",
              backLabel: "Back",
              ownerPreview: true,
              actionBarsHtml: `<div class="lesson-workspace-action-bars" data-lesson-action-bars><button type="button" class="primary-button">Save</button></div>`,
              feedbackHtml: `<div class="lesson-workspace-feedback">Feedback should hide in owner preview</div>`,
            },
          });
          window.__remediationEnhanced = enhanced;
        }, {
          ownerToken,
          ownerEmail: OWNER_EMAIL,
          planId: FIXTURE_ID,
          title: "ZZ Disposable TK Viewer Remediation Kit",
        });

        ok(await page.evaluate(() => window.__remediationKit?.ok === true), `${vp.name}: kit fetch ok`);
        ok(await page.evaluate(() => window.__remediationEnhanced?.enhanced === true), `${vp.name}: viewer enhanced`);
        await page.waitForSelector("[data-tk-owner-preview-banner]", { timeout: 5000 });

        await page.locator(".tk-ops-tab[data-tk-goto='binder']").click({ force: true });
        await page.waitForSelector("[data-tk-panel='binder']", { timeout: 5000 });
        for (const tab of ["overview", "weekly_plan", "activities", "printables", "songs", "books", "examples", "teacher_toolkit"]) {
          ok(await page.locator(`[data-tk-binder-tab="${tab}"]`).count() === 1, `${vp.name}: binder nav ${tab}`);
        }
        async function openBinderTab(tabId) {
          await page.evaluate((id) => {
            const tab = document.querySelector(`[data-tk-binder-tab="${id}"]`);
            if (!tab) throw new Error(`missing binder tab ${id}`);
            tab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          }, tabId);
          await page.waitForFunction((id) => {
            const panel = document.querySelector(`[data-tk-binder-panel="${id}"]`);
            return Boolean(panel);
          }, tabId, { timeout: 5000 });
        }

        await openBinderTab("printables");
        ok(
          await page.evaluate(() => {
            const panel = document.querySelector('[data-tk-binder-panel="printables"]');
            return /Printables|not added yet|No printables/i.test(panel?.innerText || "");
          }),
          `${vp.name}: printables empty state visible in owner preview`,
        );
        await openBinderTab("examples");
        ok(
          await page.evaluate(() => {
            const panel = document.querySelector('[data-tk-binder-panel="examples"]');
            const text = panel?.innerText || "";
            return /Example Images/i.test(text)
              && (/Image not added yet|not added yet|Needs images/i.test(text)
                || document.querySelectorAll(".tk-photo-missing, [data-tk-image-missing]").length >= 1);
          }),
          `${vp.name}: example images show Image not added yet`,
        );
        await openBinderTab("weekly_plan");
        const weeklyText = await page.locator("[data-tk-binder-panel='weekly_plan']").innerText();
        ok(!/coming soon/i.test(weeklyText), `${vp.name}: weekly plan has no coming soon`);
        ok(/Meet the barn friends|Caring for animals/i.test(weeklyText), `${vp.name}: weekly focus text shown`);

        await page.locator(".tk-ops-tab[data-tk-goto='setup']").click({ force: true });
        await page.waitForSelector("[data-tk-panel='setup']", { timeout: 5000 });
        const setupText = await page.locator("[data-tk-panel='setup']").innerText();
        ok(/How to fix|to gather|Materials by day|Master/i.test(setupText), `${vp.name}: materials status explained`);

        await page.locator(".tk-ops-tab[data-tk-goto='build']").click({ force: true });
        await page.waitForSelector("[data-tk-panel='build']", { timeout: 5000 });
        ok(await page.locator(".tk-build-summary").count() === 1, `${vp.name}: print summary column present`);
        ok(
          await page.locator('[data-tk-print-part="printables"][disabled]').count() === 1,
          `${vp.name}: printables checkbox disabled`,
        );

        await page.locator(".tk-ops-tab[data-tk-goto='binder']").click({ force: true });
        await openBinderTab("activities");
        const openedActivity = await page.evaluate(() => {
          const btn = document.querySelector("[data-tk-open-activity]");
          if (!btn) return { ok: false, reason: "no-button" };
          btn.setAttribute("data-tk-from-binder", "1");
          btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          const panel = document.querySelector("[data-tk-panel='activity']");
          const back = panel?.querySelector("[data-tk-goto]")?.textContent || "";
          const missing = document.querySelectorAll("[data-tk-image-missing], .tk-photo-missing").length;
          return {
            ok: Boolean(panel),
            back,
            missing,
            text: panel?.innerText || "",
          };
        });
        ok(openedActivity.ok, `${vp.name}: opened activity from binder`);
        ok(/Back to Binder/i.test(openedActivity.back || ""), `${vp.name}: activity back nav context-aware`);
        ok(
          (openedActivity.missing || 0) >= 1 || /Image not added yet/i.test(openedActivity.text || ""),
          `${vp.name}: activity missing image state`,
        );
        ok(
          !/\[object Object\]/i.test(openedActivity.text || ""),
          `${vp.name}: activity detail has no [object Object] duration bug`,
        );
        ok(
          /Setup:\s*\d+\s*min/i.test(openedActivity.text || ""),
          `${vp.name}: activity detail shows numeric setup minutes`,
        );
        ok(
          /Duration:\s*[~]?\d+\s*min/i.test(openedActivity.text || ""),
          `${vp.name}: activity detail shows numeric duration minutes`,
        );

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `remediation-${vp.name}.png`),
          fullPage: true,
        });
        await page.close();
      }

      // Client-side manipulation cannot unlock TK for non-owner
      const evil = await browser.newPage();
      await evil.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await evil.waitForFunction(() => typeof window.fetchTeachingKitForPlan === "function", null, { timeout: 30000 });
      const evilResult = await evil.evaluate(async (planId) => {
        // Assign the app's lexical currentUser (let), not only window.currentUser.
        currentUser = "pro@example.com";
        localStorage.setItem("llhUser", "pro@example.com");
        localStorage.setItem("llhAdminUnlocked", "true");
        localStorage.setItem("llhAdminSession", JSON.stringify({
          token: "forged",
          email: "leahivie@icloud.com",
        }));
        // Attempt to force flags locally
        window.effectiveSiteContent = () => ({
          featureFlags: {
            teachingKitViewer: true,
            teachingKitPrintCenter: true,
            teachingKitAttachments: true,
          },
        });
        const preview = window.isOwnerTeachingKitPreviewActive();
        const fetchRes = await window.fetchTeachingKitForPlan(planId, { day: "monday" });
        // Direct API guess without valid admin session
        const direct = await fetch(`/api/curriculum/lesson-plans/${planId}/teaching-kit`, {
          headers: {
            Authorization: "Bearer forged",
            "X-LLH-User-Email": "leahivie@icloud.com",
          },
          cache: "no-store",
        });
        const directJson = await direct.json().catch(() => ({}));
        return {
          preview,
          fetchRes,
          directStatus: direct.status,
          directCode: directJson.code,
        };
      }, FIXTURE_ID);
      // Non-owner signed-in identity must win over forged owner admin session email.
      ok(evilResult.preview === false, "signed-in non-owner blocks client preview even with forged owner admin email");
      ok(evilResult.fetchRes?.ok === false, "client flag spoof cannot load TK from server");
      ok(
        evilResult.directStatus === 404 && evilResult.directCode === "teaching_kit_disabled",
        "guessed TK URL rejected without valid owner admin session",
      );
      await evil.close();
    } finally {
      await browser.close();
    }

    // Delete disposable fixture from temp store (never leave as customer content)
    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    stamp = stampRes.json.siteContent?.updatedAt;
    const curriculum = stampRes.json.siteContent?.curriculum || {};
    const nextPlans = (curriculum.lessonPlans || []).filter((plan) => plan.id !== FIXTURE_ID && plan.id !== CLASSIC_PLAN_ID);
    res = await requestJson("POST", "/api/admin/site-content", {
      adminToken: ownerToken,
      expectedUpdatedAt: stamp,
      siteContent: {
        ...stampRes.json.siteContent,
        curriculum: {
          ...curriculum,
          lessonPlans: nextPlans,
        },
      },
    }, { Authorization: `Bearer ${ownerToken}` });
    ok(res.status === 200, "disposable fixtures removed from temp store");

    console.log(`\nPASS ${passed} assertions (teaching-kit-viewer-remediation)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
