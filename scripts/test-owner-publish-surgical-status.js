#!/usr/bin/env node
/**
 * Regression: surgical curriculum writes must preserve publish identity.
 *
 * Covers the #728 defect class:
 * - Owner publish/status transition applies status + publishedAt
 * - Later surgical writes that omit status must NOT revert published → draft
 * - Ordinary draft mutations preserve identity/relationships without full replace
 *
 * Run: npm run test:owner-publish-surgical-status
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  applySurgicalLessonIdentityFields,
} = require("./curriculum-surgical-lesson-identity.js");

const ROOT = path.join(__dirname, "..");
let passed = 0;

function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function eq(actual, expected, msg) {
  assert.equal(actual, expected, `${msg} (got ${JSON.stringify(actual)})`);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function deepEq(actual, expected, msg) {
  assert.deepEqual(actual, expected, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function baseDraftLesson() {
  const dailyPlans = { monday: { items: [{ itemId: "qa-item-1", title: "A" }] } };
  return {
    id: "cur-lp-surgical-status-fixture",
    title: "Surgical Status Fixture — DO NOT USE",
    age: "Preschool",
    plan: "Free",
    status: "draft",
    publishedAt: "",
    activityIds: ["cur-act-surgical-1", "cur-act-surgical-2"],
    resourceIds: ["cur-res-surgical-1"],
    enrichmentDraft: {
      updatedAt: "2026-08-20T22:00:00.000Z",
      week: { weeklyOverview: "Draft overview" },
      activities: { "qa-item-1": { description: "draft desc" } },
    },
    teachingKit: { schemaVersion: 1, completionPercent: 40 },
    dailyPlans,
    coverImageUrl: "https://example.test/cover.jpg",
    setupImageRefs: ["img-setup-1"],
  };
}

/**
 * Mirrors the three reference-preserving branches in writeSiteCurriculumTouched
 * that previously dropped status/publishedAt.
 */
function surgicalMerge(plan, incomingPlan) {
  if (incomingPlan.dailyPlans === plan.dailyPlans) {
    const linkOnly = (
      incomingPlan.enrichmentDraft === plan.enrichmentDraft
      && incomingPlan.enrichmentPublished === plan.enrichmentPublished
      && incomingPlan.enrichmentDraftUndo === plan.enrichmentDraftUndo
      && incomingPlan.enrichmentPublishHistory === plan.enrichmentPublishHistory
    );
    if (linkOnly) {
      return applySurgicalLessonIdentityFields({
        ...plan,
        resourceIds: Array.isArray(incomingPlan.resourceIds) ? incomingPlan.resourceIds : plan.resourceIds,
        updatedAt: Object.prototype.hasOwnProperty.call(incomingPlan, "updatedAt")
          ? incomingPlan.updatedAt
          : plan.updatedAt,
      }, incomingPlan);
    }
    return applySurgicalLessonIdentityFields({
      ...plan,
      enrichmentDraft: incomingPlan.enrichmentDraft,
      enrichmentDraftUndo: incomingPlan.enrichmentDraftUndo,
      enrichmentPublishHistory: incomingPlan.enrichmentPublishHistory,
      enrichmentPublished: incomingPlan.enrichmentPublished,
      resourceIds: Array.isArray(incomingPlan.resourceIds) ? incomingPlan.resourceIds : plan.resourceIds,
      ownerWorkspace: Object.prototype.hasOwnProperty.call(incomingPlan, "ownerWorkspace")
        ? incomingPlan.ownerWorkspace
        : plan.ownerWorkspace,
      updatedAt: Object.prototype.hasOwnProperty.call(incomingPlan, "updatedAt")
        ? incomingPlan.updatedAt
        : plan.updatedAt,
    }, incomingPlan);
  }
  if (incomingPlan.__llhSurgicalDailyPlans === true) {
    return applySurgicalLessonIdentityFields({
      ...plan,
      enrichmentDraft: Object.prototype.hasOwnProperty.call(incomingPlan, "enrichmentDraft")
        ? incomingPlan.enrichmentDraft
        : plan.enrichmentDraft,
      teachingKit: Object.prototype.hasOwnProperty.call(incomingPlan, "teachingKit")
        ? incomingPlan.teachingKit
        : plan.teachingKit,
      weeklyOverview: Object.prototype.hasOwnProperty.call(incomingPlan, "weeklyOverview")
        ? incomingPlan.weeklyOverview
        : plan.weeklyOverview,
      resourceIds: Array.isArray(incomingPlan.resourceIds) ? incomingPlan.resourceIds : plan.resourceIds,
      dailyPlans: incomingPlan.dailyPlans,
      updatedAt: Object.prototype.hasOwnProperty.call(incomingPlan, "updatedAt")
        ? incomingPlan.updatedAt
        : plan.updatedAt,
    }, incomingPlan);
  }
  throw new Error("unexpected surgical branch");
}

function main() {
  console.log("Owner publish surgical status regression");

  const indexSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  console.log("WIRING");
  {
    ok(indexSrc.includes("curriculum-surgical-lesson-identity.js"),
      "writeSiteCurriculumTouched requires surgical identity helper");
    ok(indexSrc.includes("applySurgicalLessonIdentityFields"),
      "surgical merge paths call applySurgicalLessonIdentityFields");
    ok(!/const applyOwnerPublishIdentity = \(base\) =>/.test(indexSrc),
      "inline applyOwnerPublishIdentity removed (uses shared helper)");
  }

  console.log("A. ORDINARY DRAFT MUTATION");
  {
    const plan = baseDraftLesson();
    const draft = {
      ...plan.enrichmentDraft,
      week: { ...plan.enrichmentDraft.week, weeklyOverview: "Updated draft overview" },
    };
    const incoming = {
      ...plan,
      enrichmentDraft: draft,
      updatedAt: "2026-08-20T22:10:00.000Z",
      // omit status/publishedAt intentionally
    };
    // same dailyPlans reference → enrichment surgical branch
    incoming.dailyPlans = plan.dailyPlans;
    const next = surgicalMerge(plan, incoming);
    eq(next.status, "draft", "draft mutation keeps status=draft");
    eq(next.publishedAt, "", "draft mutation keeps empty publishedAt");
    eq(next.id, plan.id, "draft mutation keeps lessonId");
    eq(next.title, plan.title, "draft mutation keeps title");
    eq(next.age, plan.age, "draft mutation keeps age");
    eq(next.plan, "Free", "draft mutation keeps access plan");
    deepEq(next.activityIds, plan.activityIds, "draft mutation keeps activity IDs");
    deepEq(next.resourceIds, plan.resourceIds, "draft mutation keeps printable/resource IDs");
    eq(next.enrichmentDraft.week.weeklyOverview, "Updated draft overview",
      "draft mutation updates enrichment draft");
    eq(next.coverImageUrl, plan.coverImageUrl, "draft mutation keeps image relationship");
    ok(next.dailyPlans === plan.dailyPlans, "draft mutation keeps dailyPlans by reference");
  }

  console.log("B. OWNER PUBLISH / STATUS TRANSITION");
  {
    const plan = baseDraftLesson();
    const publishedAt = "2026-08-20T22:58:30.583Z";
    const teachingKit = {
      ...plan.teachingKit,
      lastOperatorOwnerPublish: { at: publishedAt, path: "publish_enrichment+status" },
    };
    // Simulate status-only Owner publish: same dailyPlans ref, link-only enrichment refs,
    // but status/publishedAt/teachingKit set on incoming.
    const incoming = {
      ...plan,
      status: "published",
      publishedAt,
      teachingKit,
      updatedAt: publishedAt,
      enrichmentDraft: null,
    };
    incoming.dailyPlans = plan.dailyPlans;
    // Force non-linkOnly so enrichment fields update, still same dailyPlans ref
    const next = surgicalMerge(plan, incoming);
    eq(next.status, "published", "Owner publish surgical write sets status=published");
    eq(next.publishedAt, publishedAt, "Owner publish surgical write sets publishedAt");
    eq(next.teachingKit.lastOperatorOwnerPublish.path, "publish_enrichment+status",
      "Owner publish surgical write keeps teachingKit publish marker");
    eq(next.id, plan.id, "Owner publish keeps lessonId");
    eq(next.title, plan.title, "Owner publish keeps title");
    eq(next.age, plan.age, "Owner publish keeps age / age band");
    eq(next.plan, "Free", "Owner publish keeps access plan");
    deepEq(next.activityIds, plan.activityIds, "Owner publish keeps activity IDs");
    deepEq(next.resourceIds, plan.resourceIds, "Owner publish keeps printable relationships");
    eq(next.coverImageUrl, plan.coverImageUrl, "Owner publish keeps image relationships");
    ok(next.enrichmentDraft === null, "Owner publish can clear enrichment draft");
    ok(next.dailyPlans === plan.dailyPlans, "Owner publish does not replace full lesson dailyPlans object");
  }

  console.log("B2. __llhSurgicalDailyPlans OWNER PUBLISH BRIDGE");
  {
    const plan = baseDraftLesson();
    const publishedAt = "2026-08-20T23:00:00.000Z";
    const incoming = {
      ...plan,
      status: "published",
      publishedAt,
      weeklyOverview: "Merged overview from enrichment",
      enrichmentDraft: null,
      __llhSurgicalDailyPlans: true,
      updatedAt: publishedAt,
    };
    const next = surgicalMerge(plan, incoming);
    eq(next.status, "published", "surgical dailyPlans flag path sets status=published");
    eq(next.publishedAt, publishedAt, "surgical dailyPlans flag path sets publishedAt");
    eq(next.title, plan.title, "surgical dailyPlans flag path preserves title");
    eq(next.age, plan.age, "surgical dailyPlans flag path preserves age");
    deepEq(next.activityIds, plan.activityIds, "surgical dailyPlans flag path preserves activity IDs");
  }

  console.log("C. POST-PUBLISH SURGICAL WRITE MUST NOT REVERT");
  {
    const publishedAt = "2026-08-20T22:58:30.583Z";
    const plan = {
      ...baseDraftLesson(),
      status: "published",
      publishedAt,
      enrichmentDraft: null,
      teachingKit: {
        schemaVersion: 1,
        lastOperatorOwnerPublish: { at: publishedAt, path: "publish_enrichment+status" },
      },
    };
    const incoming = {
      id: plan.id,
      title: plan.title,
      age: plan.age,
      plan: plan.plan,
      activityIds: plan.activityIds,
      resourceIds: ["cur-res-surgical-1", "cur-res-surgical-2"],
      enrichmentDraft: {
        updatedAt: "2026-08-20T23:10:00.000Z",
        week: { weeklyOverview: "Harmless post-publish draft note" },
      },
      updatedAt: "2026-08-20T23:10:00.000Z",
      // deliberately omit status + publishedAt (ordinary later write)
    };
    incoming.dailyPlans = plan.dailyPlans;
    const next = surgicalMerge(plan, incoming);
    eq(next.status, "published", "later surgical write leaves status=published");
    eq(next.publishedAt, publishedAt, "later surgical write leaves publishedAt intact");
    eq(next.id, plan.id, "later surgical write keeps lessonId");
    eq(next.title, plan.title, "later surgical write keeps title");
    eq(next.age, plan.age, "later surgical write keeps age");
    eq(next.plan, "Free", "later surgical write keeps access plan");
    deepEq(next.activityIds, plan.activityIds, "later surgical write keeps activity IDs");
    deepEq(next.resourceIds, ["cur-res-surgical-1", "cur-res-surgical-2"],
      "later surgical write can update printable relationships");
    eq(next.enrichmentDraft.week.weeklyOverview, "Harmless post-publish draft note",
      "later surgical write can update enrichment draft");
    eq(next.teachingKit.lastOperatorOwnerPublish.at, publishedAt,
      "later surgical write preserves teachingKit publish marker when omitted on incoming");
  }

  console.log("HELPER HASOWNPROPERTY SEMANTICS");
  {
    const base = { status: "published", publishedAt: "t1", teachingKit: { a: 1 }, title: "X" };
    const omit = applySurgicalLessonIdentityFields(base, { resourceIds: [] });
    eq(omit.status, "published", "omitted status does not clear published");
    eq(omit.publishedAt, "t1", "omitted publishedAt does not clear stamp");
    const explicit = applySurgicalLessonIdentityFields(base, {
      status: "published",
      publishedAt: "t2",
      teachingKit: { a: 2 },
    });
    eq(explicit.publishedAt, "t2", "explicit publishedAt updates");
    deepEq(explicit.teachingKit, { a: 2 }, "explicit teachingKit updates");
  }

  console.log(`\nSurgical status regression passed ${passed} assertions.`);
}

main();
