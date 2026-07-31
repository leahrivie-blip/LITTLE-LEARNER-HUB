#!/usr/bin/env node
/**
 * Unit checks for dynamic SEO curriculum hub helpers.
 * Run: node scripts/test-seo-curriculum-hub.js
 */
const assert = require("node:assert/strict");
const hub = require("../server/seo-curriculum.js");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const snapshot = {
  updatedAt: "2026-07-30T12:00:00.000Z",
  freeLessonPlanIds: ["lp-infant-free", "lp-toddler-free"],
  lessonPlans: [
    {
      id: "lp-infant-free",
      title: "Animal Sounds Discovery",
      age: "Infant",
      theme: "Animals",
      locked: false,
      status: "featured",
      weeklyOverview: "Babies explore animal sounds through songs and soft toys.",
      learningDomains: ["Language & Literacy", "Social Emotional"],
      updatedAt: "2026-07-30T11:00:00.000Z",
    },
    {
      id: "lp-infant-pro",
      title: "Black and White Discovery",
      age: "Infant",
      theme: "Contrast",
      locked: true,
      status: "published",
      weeklyOverview: "High-contrast visual play for young infants.",
      learningDomains: ["Cognitive"],
      updatedAt: "2026-07-29T11:00:00.000Z",
    },
    {
      id: "lp-toddler-free",
      title: "Colors Everywhere",
      age: "Toddler",
      theme: "Colors",
      locked: false,
      status: "published",
      weeklyOverview: "Toddlers sort and name colors during play.",
      learningDomains: ["Math"],
      updatedAt: "2026-07-28T11:00:00.000Z",
    },
    {
      id: "lp-preschool-pro",
      title: "Community Helpers",
      age: "Preschool",
      theme: "Community",
      locked: true,
      status: "published",
      weeklyOverview: "Preschoolers learn about helpers in their community.",
      learningDomains: ["Social Studies"],
      updatedAt: "2026-07-27T11:00:00.000Z",
    },
  ],
  activities: [
    {
      id: "act-1",
      title: "Morning Hello Song",
      activityCategory: "Circle Time",
      lessonPlanId: "lp-toddler-free",
      parentTitle: "Colors Everywhere",
      parentAge: "Toddler",
      locked: false,
      updatedAt: "2026-07-28T11:00:00.000Z",
    },
    {
      id: "act-2",
      title: "Water Bead Exploration",
      activityCategory: "Sensory Play",
      lessonPlanId: "lp-preschool-pro",
      parentTitle: "Community Helpers",
      parentAge: "Preschool",
      locked: true,
      updatedAt: "2026-07-27T11:00:00.000Z",
    },
    {
      id: "act-3",
      title: "Process Painting Collage",
      activityCategory: "Art",
      lessonPlanId: "lp-preschool-pro",
      parentTitle: "Community Helpers",
      parentAge: "Preschool",
      locked: true,
      updatedAt: "2026-07-27T10:00:00.000Z",
    },
    {
      id: "act-4",
      title: "Sticker Sorting",
      activityCategory: "Art",
      lessonPlanId: "lp-toddler-free",
      parentTitle: "Colors Everywhere",
      parentAge: "Toddler",
      locked: false,
      updatedAt: "2026-07-26T10:00:00.000Z",
    },
  ],
  series: [],
};

test("hub defines eight public routes", () => {
  assert.equal(hub.hubPages().length, 8);
  assert.equal(hub.hubPageRoutes().length, 8);
  for (const page of hub.hubPages()) {
    assert.match(page.path, /^\//);
    assert.ok(page.title && page.description && page.h1 && page.intro);
    assert.ok(Array.isArray(page.faq) && page.faq.length >= 3);
  }
});

test("infant page features only infant lesson plans and prefers free first", () => {
  const page = hub.getHubPage("/infant-lesson-plans");
  const helpers = hub.buildSnapshotHelpers(snapshot);
  const lessons = hub.selectLessonsForPage(page, helpers);
  assert.deepEqual(lessons.map((item) => item.id), ["lp-infant-free", "lp-infant-pro"]);
});

test("sensory page filters Sensory Play activities", () => {
  const page = hub.getHubPage("/sensory-activities");
  const helpers = hub.buildSnapshotHelpers(snapshot);
  const activities = hub.selectActivitiesForPage(page, helpers);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].title, "Water Bead Exploration");
});

test("process art prefers process-style titles but keeps other Art activities", () => {
  const page = hub.getHubPage("/process-art-activities");
  const helpers = hub.buildSnapshotHelpers(snapshot);
  const activities = hub.selectActivitiesForPage(page, helpers);
  assert.equal(activities[0].title, "Process Painting Collage");
  assert.ok(activities.some((item) => item.title === "Sticker Sorting"));
});

test("renderHubPageBody includes live titles and related links", () => {
  const page = hub.getHubPage("/daycare-curriculum");
  const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const rendered = hub.renderHubPageBody(page, snapshot, { escapeHtml });
  assert.match(rendered.bodyHtml, /Animal Sounds Discovery/);
  assert.match(rendered.bodyHtml, /Colors Everywhere/);
  assert.match(rendered.bodyHtml, /Community Helpers/);
  assert.match(rendered.bodyHtml, /\/infant-lesson-plans/);
  assert.match(rendered.bodyHtml, /signup=1/);
  assert.ok(rendered.listItems.length >= 4);
  assert.ok(rendered.faqItems.length >= 3);
});

if (!process.exitCode) {
  console.log("\nAll SEO curriculum hub unit tests passed.");
}
