#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 5 — songs + books only.
 * Deterministic fixtures; CI must not call live OpenAI or book search.
 * Run: npm run test:curriculum-operator-phase5
 */
"use strict";

const assert = require("node:assert/strict");
const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const auditApi = require("./curriculum-operator-audit.js");
const songsBooksApi = require("./curriculum-operator-songs-books.js");
const jobApi = require("./curriculum-operator-job.js");
const selectApi = require("./curriculum-operator-select.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "leahivie@icloud.com" };
const LESSON_ID = "cur-lp-operator-songs-books-weather";
const ACT_WIND = "cur-act-weather-wind";
const ACT_REPORT = "cur-act-weather-report";
const KEEP_IMG = "https://cdn.example.test/weather-keep.png";
const KEEP_PRINTABLE = "cur-res-weather-keep";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function seedCurriculum({ withStrongSong = false, withVerifiedBook = false, thinGuide = false } = {}) {
  const now = new Date().toISOString();
  const songs = withStrongSong
    ? [
      {
        title: "Morning Weather Song",
        linkedWeekday: "monday",
        rightsStatus: "original",
        allowPrintLyrics: true,
        lyrics: "Clouds and sun, rain and breeze,\nWeather helpers, sing with me!",
        motions: "Sway arms like wind.",
        notes: "Original LLH circle song.",
      },
      {
        title: "Tuesday Sky Watch",
        linkedWeekday: "tuesday",
        rightsStatus: "original",
        allowPrintLyrics: true,
        lyrics: "Look up high, look down low,\nWeather words help us know!",
        motions: "Point up and down.",
        notes: "Original LLH song.",
      },
      {
        title: "Windy Wednesday Move",
        linkedWeekday: "wednesday",
        rightsStatus: "original",
        allowPrintLyrics: true,
        lyrics: "Wind is moving, soft and strong,\nWe can sway the whole day long!",
        motions: "Sway side to side.",
        notes: "Original LLH song.",
      },
    ]
    : [];
  const books = withVerifiedBook
    ? [{
      title: "What Will the Weather Be?",
      author: "Lynda DeWitt",
      whyThisBook: thinGuide ? "" : "Supports toddler weather observation on Tuesday.",
      beforeReadingQuestions: thinGuide ? [] : ["What weather do you see on the cover?"],
      afterReadingQuestions: thinGuide
        ? ["What do you see?", "Did you like the story?"]
        : [
          "Which weather word can we use at the window?",
          "What should a Weather Reporter notice first?",
          "How is wind different from rain in the pictures?",
        ],
      suggestedWeekday: "tuesday",
    }]
    : [];
  return {
    lessonPlans: [{
      id: LESSON_ID,
      title: "Weather Watchers",
      age: "Toddler 18–24 Months",
      theme: "Weather",
      plan: "Pro",
      status: "published",
      weeklyOverview: "Explore weather through play.",
      objectives: "Children will notice weather words.",
      enrichmentDraft: {
        week: {
          weeklyOverview: "Explore weather through play.",
          printableIds: [KEEP_PRINTABLE],
          songs,
          books,
        },
        activities: {
          [ACT_WIND]: {
            setupImageUrl: KEEP_IMG,
            setupMediaAssetId: "img-keep",
            relatedPrintableId: KEEP_PRINTABLE,
          },
        },
        updatedAt: now,
      },
      resourceIds: [KEEP_PRINTABLE],
      dailyPlans: {
        monday: { items: [{ itemId: "wind", title: "Wind Is Moving", dayOfWeek: "monday" }] },
        tuesday: { items: [{ itemId: "report", title: "Weather Reporter", dayOfWeek: "tuesday" }] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      activityIds: [ACT_WIND, ACT_REPORT],
      updatedAt: now,
      createdAt: now,
    }],
    activities: [
      {
        id: ACT_WIND,
        lessonPlanId: LESSON_ID,
        title: "Wind Is Moving",
        dayOfWeek: "monday",
        category: "Movement",
        objective: "Children notice wind movement.",
        steps: "Sway scarves like wind.",
        setupImageUrl: KEEP_IMG,
        relatedPrintableId: KEEP_PRINTABLE,
      },
      {
        id: ACT_REPORT,
        lessonPlanId: LESSON_ID,
        title: "Weather Reporter",
        dayOfWeek: "tuesday",
        category: "Dramatic Play",
        objective: "Pretend weather reporting.",
        steps: "Use weather words while reporting.",
      },
    ],
    resources: [{
      id: KEEP_PRINTABLE,
      title: "Weather Picture Cards",
      resourceCategory: "Printables",
      resourceType: "picture_cards",
      description: "Keep me",
      lessonPlanIds: [LESSON_ID],
      status: "draft",
      fileName: "weather-cards.pdf",
      fileData: "data:application/pdf;base64,JVBERi0xLjQ=",
      pageCount: 2,
      mimeType: "application/pdf",
    }],
  };
}

async function main() {
  console.log("Curriculum Operator Phase 5 — songs + books");

  console.log("Schema / command");
  const cmd = commandApi.parseOperatorCommand(
    "Finish the songs and books for Weather Watchers.",
    { phase: 5 },
  );
  ok(cmd.command.intent === "finish_songs_books", "finish songs/books intent");
  ok(cmd.command.actions.generateSongsBooks === true, "generateSongsBooks enabled");
  ok(cmd.command.actions.generateImages === false, "Phase 5 blocks images");
  ok(cmd.command.actions.generatePrintables === false, "Phase 5 blocks printables");
  ok(cmd.command.actions.publish === false, "publish blocked");
  ok(cmd.command.actions.createLesson === false, "lesson.create blocked");

  const p4 = schema.normalizeOperatorCommand({
    intent: "finish_songs_books",
    actions: { generateSongsBooks: true, generatePrintables: true },
  }, { phase: 4 });
  ok(p4.actions.generateSongsBooks === false, "phase 4 still blocks songs/books");

  const p5 = schema.normalizeOperatorCommand({
    intent: "finish_songs_books",
    actions: { generateSongsBooks: true, generateImages: true, generatePrintables: true },
  }, { phase: 5 });
  ok(p5.actions.generateSongsBooks === true, "phase 5 enables songs/books");
  ok(p5.actions.generateImages === false && p5.actions.generatePrintables === false, "phase 5 forces images/printables off");

  const p4print = schema.normalizeOperatorCommand({
    intent: "finish_printables",
    actions: { generatePrintables: true },
  }, { phase: 4 });
  ok(p4print.actions.generatePrintables === true, "phase 4 printables still work");

  console.log("Song decisions");
  const emptyCur = seedCurriculum();
  const emptyPlan = emptyCur.lessonPlans[0];
  const emptyAudit = auditApi.auditLesson(emptyPlan, emptyCur);
  const emptyActions = songsBooksApi.buildSongBookActionsFromAudit(
    emptyPlan,
    emptyCur.activities,
    emptyAudit,
  );
  ok(emptyActions.songActions.some((a) => a.decision === "ADD"), "missing songs → ADD for key days");
  ok(emptyActions.songActions.every((a) => a.reason), "every song decision has a reason");
  ok(emptyActions.bookActions[0]?.decision === "ADD", "missing books → ADD");

  const keepCur = seedCurriculum({ withStrongSong: true, withVerifiedBook: true });
  const keepPlan = keepCur.lessonPlans[0];
  const keepAudit = auditApi.auditLesson(keepPlan, keepCur);
  const keepActions = songsBooksApi.buildSongBookActionsFromAudit(
    keepPlan,
    keepCur.activities,
    keepAudit,
  );
  ok(keepActions.songActions.find((a) => a.weekday === "monday")?.decision === "KEEP", "KEEP strong monday song");
  ok(keepActions.bookActions[0]?.decision === "KEEP", "KEEP verified book with guide");

  const thinCur = seedCurriculum({ withVerifiedBook: true, thinGuide: true });
  const thinActions = songsBooksApi.buildSongBookActionsFromAudit(
    thinCur.lessonPlans[0],
    thinCur.activities,
    auditApi.auditLesson(thinCur.lessonPlans[0], thinCur),
  );
  ok(thinActions.bookActions[0]?.decision === "IMPROVE_GUIDE", "thin guide → IMPROVE_GUIDE");

  const weakSongPlan = JSON.parse(JSON.stringify(emptyPlan));
  weakSongPlan.enrichmentDraft.week.songs = [{
    title: "Baby Shark Weather Remix",
    linkedWeekday: "monday",
    lyrics: "Baby shark doo doo — Disney weather!",
    rightsStatus: "",
  }];
  const weakActions = songsBooksApi.buildSongBookActionsFromAudit(
    weakSongPlan,
    emptyCur.activities,
    auditApi.auditLesson(weakSongPlan, emptyCur),
  );
  ok(weakActions.songActions.find((a) => a.weekday === "monday")?.decision === "REPLACE", "copyright-risky song → REPLACE");

  console.log("Original song + copyright safeguards");
  const original = songsBooksApi.buildOriginalSongForDay({
    plan: emptyPlan,
    activities: emptyCur.activities,
    weekday: "monday",
    age: emptyPlan.age,
  });
  ok(original.rightsStatus === "original", "original song marks rightsStatus");
  ok(original.linkedWeekday === "monday", "weekday linking");
  ok(original.lyrics.split("\n").length <= 8, "short original lyrics");
  ok(songsBooksApi.validateSongEntry(original).ok, "original song validates");
  ok(!songsBooksApi.validateSongEntry({
    title: "Let It Go Weather",
    linkedWeekday: "monday",
    rightsStatus: "original",
    lyrics: "Let it go, frozen weather disney elsa!",
    allowPrintLyrics: true,
  }).ok, "copyrighted lyric markers rejected");

  console.log("Book verification");
  ok(songsBooksApi.validateBookEntry({
    title: "What Will the Weather Be?",
    author: "Lynda DeWitt",
  }).ok, "verified library title accepted");
  ok(!songsBooksApi.validateBookEntry({
    title: "The Magical Weather Unicorn Who Saved Tuesday",
    author: "AI Invented",
  }).ok, "fabricated title rejected");
  ok(!songsBooksApi.validateBookEntry({
    title: "What Will the Weather Be?",
    author: "Totally Wrong Author",
  }).ok, "wrong metadata rejected");
  ok(songsBooksApi.validateBookEntry({
    title: "Search your classroom library for a weather picture book",
    author: "",
  }).ok, "classroom-library search prompt accepted");

  console.log("Planner fixture + apply");
  let aiCalls = 0;
  const planned = await songsBooksApi.planSongsAndBooks({
    plan: emptyPlan,
    activities: emptyCur.activities,
    audit: emptyAudit,
    callAi: async (_s, user) => {
      aiCalls += 1;
      return songsBooksApi.buildOperatorSongBookAiFixtureResponse(user);
    },
  });
  ok(planned.ok === true, "planner succeeds with fixture AI");
  ok(aiCalls === 1, "one grouped song/book planner call");
  ok(planned.usage.songPlannerCalls === 1, "tracks songPlannerCalls");
  ok(planned.songActions.some((a) => a.decision === "ADD" && a.status === "success"), "ADD original song success");
  ok(planned.bookActions.some((a) => a.decision === "ADD" && a.status === "success"), "ADD verified book success");
  ok(schema.asArray(planned.enrichmentDraft.week.songs).every((s) => s.rightsStatus === "original"), "draft songs original");
  ok(schema.asArray(planned.enrichmentDraft.week.books).every((b) => (
    songsBooksApi.findVerifiedBook(b.title, b.author) || songsBooksApi.isLibrarySearchTitle(b.title)
  )), "draft books verified or library-search");

  const keepOnly = await songsBooksApi.planSongsAndBooks({
    plan: keepPlan,
    activities: keepCur.activities,
    audit: keepAudit,
    callAi: async () => {
      throw new Error("should not call AI for KEEP-only");
    },
  });
  ok(keepOnly.skipped === true && keepOnly.ok === true, "KEEP/NOT_NEEDED skips AI");
  ok(keepOnly.usage.songPlannerCalls === 0, "KEEP requires no planner calls");

  console.log("Age-appropriate questions");
  const guide = songsBooksApi.buildBookGuideQuestions(
    { title: "Rain", author: "Robert Kalan" },
    emptyPlan,
    "Toddler 18–24 Months",
  );
  ok(guide.afterReadingQuestions.length >= 3, "toddler guide has concrete questions");
  ok(!guide.afterReadingQuestions.every((q) => /what do you see|did you like the story/i.test(q)),
    "avoids only-generic toddler questions");

  console.log("Post-save verification + asset locks");
  const beforeSnap = JSON.parse(JSON.stringify(emptyPlan));
  const afterSnap = {
    ...emptyPlan,
    enrichmentDraft: planned.enrichmentDraft,
  };
  afterSnap.enrichmentDraft.activities = beforeSnap.enrichmentDraft.activities;
  afterSnap.enrichmentDraft.week.printableIds = beforeSnap.enrichmentDraft.week.printableIds;
  const verified = songsBooksApi.verifySongBookJobDraft({
    beforePlan: beforeSnap,
    afterPlan: afterSnap,
    songActions: planned.songActions,
    bookActions: planned.bookActions,
  });
  ok(verified.ok === true, "post-save verification passes");

  const mutatedImages = JSON.parse(JSON.stringify(afterSnap));
  mutatedImages.enrichmentDraft.activities[ACT_WIND].setupImageUrl = "https://cdn.example.test/CHANGED.png";
  const failedAssets = songsBooksApi.verifySongBookJobDraft({
    beforePlan: beforeSnap,
    afterPlan: mutatedImages,
    songActions: planned.songActions,
    bookActions: planned.bookActions,
  });
  ok(failedAssets.ok === false, "image mutation fails verification");

  console.log("Operator job integration");
  let store = {
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true },
      curriculum: seedCurriculum(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  };
  const publishedBefore = {
    status: store.siteContent.curriculum.lessonPlans[0].status,
    title: store.siteContent.curriculum.lessonPlans[0].title,
    age: store.siteContent.curriculum.lessonPlans[0].age,
    plan: store.siteContent.curriculum.lessonPlans[0].plan,
    weeklyOverview: store.siteContent.curriculum.lessonPlans[0].weeklyOverview,
  };
  const imageBefore = store.siteContent.curriculum.lessonPlans[0].enrichmentDraft.activities[ACT_WIND].setupImageUrl;
  const printableBefore = store.siteContent.curriculum.lessonPlans[0].enrichmentDraft.week.printableIds.slice();
  let saveCount = 0;

  const api = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => store,
    writeStoreAsync: async (next) => { store = next; },
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    saveOperatorEnrichmentDraft: async ({ lessonPlanId, enrichmentDraft }) => {
      saveCount += 1;
      const plans = store.siteContent.curriculum.lessonPlans;
      const idx = plans.findIndex((p) => p.id === lessonPlanId);
      const prev = plans[idx];
      plans[idx] = {
        ...prev,
        enrichmentDraft: { ...enrichmentDraft, updatedAt: new Date().toISOString() },
      };
      return { ok: true, lessonPlan: plans[idx], versionId: `sb-${lessonPlanId}`, saveMode: "enrichment_draft" };
    },
  });

  const sbCmd = schema.normalizeOperatorCommand({
    rawCommand: "Finish the songs and books for Weather Watchers.",
    intent: "finish_songs_books",
    scope: { selection: "explicit_ids", lessonIds: [LESSON_ID], count: 1, titles: ["Weather Watchers"] },
    actions: { generateSongsBooks: true, saveDraft: true, generateImages: false, generatePrintables: false },
    completion: { phase: 5 },
  }, { phase: 5 });
  const selection = selectApi.selectLessons(store.siteContent.curriculum, sbCmd);
  const planSummary = api.buildPlanSummary(sbCmd, selection);
  ok(planSummary.generatesSongsBooks === true, "plan summary marks songs/books");
  ok(planSummary.generatesImages === false && planSummary.generatesPrintables === false, "plan summary blocks assets");

  let job = jobApi.createJobFromPlan({
    command: sbCmd,
    planSummary,
    createdBy: OWNER.email,
    status: "running",
  });
  ok(job.lessonResults[0].actions.some((a) => a.type === "song.upsert"), "job includes song.upsert");
  ok(job.lessonResults[0].actions.some((a) => a.type === "book.upsert"), "job includes book.upsert");
  ok(!job.lessonResults[0].actions.some((a) => String(a.type).startsWith("image.")), "no image steps");
  ok(!job.lessonResults[0].actions.some((a) => String(a.type).startsWith("printable.")), "no printable steps");

  const finished = await api.runJob(job, store, OWNER.email);
  ok(finished.status === "completed" || finished.progress.completed === 1, "songs/books job completes");
  const lr = finished.lessonResults[0];
  ok(lr.published === false, "no publish");
  ok(lr.songsBooksComplete === true, "songsBooksComplete");
  ok(lr.songCounts, "songCounts present");
  ok(lr.bookCounts, "bookCounts present");
  const after = store.siteContent.curriculum.lessonPlans[0];
  ok(after.title === publishedBefore.title && after.age === publishedBefore.age, "title/age preserved");
  ok(after.plan === publishedBefore.plan, "access plan preserved");
  ok(after.status === publishedBefore.status, "publish status unchanged");
  ok(after.weeklyOverview === publishedBefore.weeklyOverview, "published weeklyOverview unchanged");
  ok(after.enrichmentDraft.activities[ACT_WIND].setupImageUrl === imageBefore, "activity images untouched");
  ok(JSON.stringify(after.enrichmentDraft.week.printableIds) === JSON.stringify(printableBefore), "printables untouched");
  ok(schema.asArray(after.enrichmentDraft.week.songs).length >= 1, "songs present after save");
  ok(schema.asArray(after.enrichmentDraft.week.books).length >= 1, "books present after save");
  ok(saveCount >= 1, "draft saved");

  // Resume idempotency — no duplicate song/book writes
  const songsBeforeResume = JSON.stringify(after.enrichmentDraft.week.songs);
  const booksBeforeResume = JSON.stringify(after.enrichmentDraft.week.books);
  const savesBefore = saveCount;
  finished.lessonResults = finished.lessonResults.map((row) => ({
    ...row,
    status: "success",
    songsBooksComplete: true,
  }));
  const resumed = await api.runJob(finished, store, OWNER.email);
  ok(resumed.progress.completed === 1, "resume skips completed songs/books lesson");
  ok(saveCount === savesBefore, "resume does not re-save draft");
  ok(JSON.stringify(store.siteContent.curriculum.lessonPlans[0].enrichmentDraft.week.songs) === songsBeforeResume,
    "resume does not duplicate songs");
  ok(JSON.stringify(store.siteContent.curriculum.lessonPlans[0].enrichmentDraft.week.books) === booksBeforeResume,
    "resume does not duplicate books");

  // Wrong day link rejected by validateSongEntry
  ok(!songsBooksApi.validateSongEntry({
    title: "Oops",
    linkedWeekday: "saturday",
    rightsStatus: "original",
    lyrics: "a\nb\nc",
    allowPrintLyrics: true,
  }).ok, "wrong weekday rejected");

  console.log(`\nPhase 5 passed ${passed} assertions`);
}

main().catch((error) => {
  console.error("\nPhase 5 FAILED:", error);
  process.exit(1);
});
