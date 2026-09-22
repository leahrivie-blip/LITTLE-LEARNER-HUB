"use strict";

const schema = require("./curriculum-operator-schema.js");

const TTL_MS = 2 * 60 * 60 * 1000;

function key(ownerId, sessionId) {
  return `${schema.text(ownerId, 160).toLowerCase()}:${schema.text(sessionId, 100)}`;
}

function sanitize(context = {}, now = Date.now()) {
  const expiresAt = new Date(now + TTL_MS).toISOString();
  return {
    ownerId: schema.text(context.ownerId, 160).toLowerCase(),
    sessionId: schema.text(context.sessionId, 100),
    currentLessonId: schema.text(context.currentLessonId, 160) || null,
    currentLessonTitle: schema.text(context.currentLessonTitle, 180) || null,
    ageGroup: schema.text(context.ageGroup, 80) || null,
    currentOperation: schema.text(context.currentOperation, 80) || null,
    requestedActivities: schema.asArray(context.requestedActivities).map((v) => schema.text(v, 180)).filter(Boolean).slice(0, 24),
    requestedExclusions: schema.asArray(context.requestedExclusions).map((v) => schema.text(v, 80)).filter(Boolean).slice(0, 20),
    imageRequirements: schema.text(context.imageRequirements, 400) || null,
    printableRequirements: schema.text(context.printableRequirements, 400) || null,
    researchRequested: context.researchRequested === true,
    unresolvedQuestion: schema.text(context.unresolvedQuestion, 400) || null,
    latestDraftJobId: schema.text(context.latestDraftJobId, 100) || null,
    updatedAt: new Date(now).toISOString(),
    expiresAt,
  };
}

function read(store, ownerId, sessionId, now = Date.now()) {
  const record = store?.curriculumOperatorConversations?.[key(ownerId, sessionId)];
  if (!record || Date.parse(record.expiresAt || "") <= now) return null;
  return sanitize({ ...record, ownerId, sessionId }, now);
}

function save(store, context, now = Date.now()) {
  const record = sanitize(context, now);
  if (!record.ownerId || !record.sessionId) return null;
  store.curriculumOperatorConversations = store.curriculumOperatorConversations || {};
  Object.keys(store.curriculumOperatorConversations).forEach((recordKey) => {
    if (Date.parse(store.curriculumOperatorConversations[recordKey]?.expiresAt || "") <= now) {
      delete store.curriculumOperatorConversations[recordKey];
    }
  });
  store.curriculumOperatorConversations[key(record.ownerId, record.sessionId)] = record;
  return record;
}

function clear(store, ownerId, sessionId) {
  if (store?.curriculumOperatorConversations) delete store.curriculumOperatorConversations[key(ownerId, sessionId)];
}

module.exports = { TTL_MS, key, sanitize, read, save, clear };
