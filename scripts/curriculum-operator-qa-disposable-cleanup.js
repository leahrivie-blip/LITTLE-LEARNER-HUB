"use strict";

const schema = require("./curriculum-operator-schema.js");

const DISPOSABLE_TITLE_PREFIX = "Spring Planting QA Disposable ";

function isDisposableSpringPlantingQaTitle(title) {
  const sample = schema.text(title, 280);
  return sample.startsWith(DISPOSABLE_TITLE_PREFIX) && /spring-planting-prod-qa-\d+/i.test(sample);
}

/**
 * Require exact id + exact title match (case-sensitive trim) before any cleanup.
 */
function verifyDisposableQaLessonIdentity(plan, { lessonId, exactTitle }) {
  const wantId = schema.text(lessonId, 160);
  const wantTitle = schema.text(exactTitle, 280);
  if (!plan || typeof plan !== "object") {
    return { ok: false, code: "lesson_not_found", lessonId: wantId, exactTitle: wantTitle };
  }
  const gotId = schema.text(plan.id, 160);
  const gotTitle = schema.text(plan.title, 280);
  if (gotId !== wantId) {
    return { ok: false, code: "lesson_id_mismatch", expectedId: wantId, actualId: gotId, actualTitle: gotTitle };
  }
  if (gotTitle !== wantTitle) {
    return { ok: false, code: "lesson_title_mismatch", expectedTitle: wantTitle, actualTitle: gotTitle, lessonId: gotId };
  }
  if (!isDisposableSpringPlantingQaTitle(gotTitle)) {
    return { ok: false, code: "not_disposable_qa_title", actualTitle: gotTitle, lessonId: gotId };
  }
  if (plan.status === "published") {
    return { ok: false, code: "published_lesson_refused", lessonId: gotId, actualTitle: gotTitle };
  }
  return {
    ok: true,
    lessonId: gotId,
    exactTitle: gotTitle,
    status: schema.text(plan.status, 40),
  };
}

function findLessonPlanByExactId(curriculum, lessonId) {
  const want = schema.text(lessonId, 160);
  return (curriculum?.lessonPlans || []).find((p) => schema.text(p?.id, 160) === want) || null;
}

/**
 * @param {object} params
 * @param {Function} params.deleteRequest POST helper returning { status, json }
 * @param {string} params.token
 * @param {object} params.curriculum
 * @param {string} params.lessonId
 * @param {string} params.exactTitle
 * @param {string} params.expectedUpdatedAt site-content stamp
 * @param {boolean} [params.dryRun]
 */
async function deleteVerifiedDisposableQaLesson(params) {
  const lessonId = schema.text(params.lessonId, 160);
  const exactTitle = schema.text(params.exactTitle, 280);
  const plan = findLessonPlanByExactId(params.curriculum, lessonId);
  const verified = verifyDisposableQaLessonIdentity(plan, { lessonId, exactTitle });
  if (!verified.ok) {
    return { ok: false, verified, deleted: false };
  }
  if (params.dryRun === true) {
    return { ok: true, verified, deleted: false, dryRun: true };
  }
  const res = await params.deleteRequest({
    lessonPlanId: lessonId,
    confirmTitle: exactTitle,
    expectedUpdatedAt: params.expectedUpdatedAt,
  }, params.token);
  const deleted = res.status === 200 && res.json?.ok !== false;
  return {
    ok: deleted,
    verified,
    deleted,
    httpStatus: res.status,
    body: res.json,
  };
}

module.exports = {
  DISPOSABLE_TITLE_PREFIX,
  isDisposableSpringPlantingQaTitle,
  verifyDisposableQaLessonIdentity,
  findLessonPlanByExactId,
  deleteVerifiedDisposableQaLesson,
};
