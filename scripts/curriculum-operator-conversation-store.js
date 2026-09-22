"use strict";

const schema = require("./curriculum-operator-schema.js");

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 40;

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
    corrections: schema.asArray(context.corrections).map((v) => schema.text(v, 240)).filter(Boolean).slice(-12),
    messages: schema.asArray(context.messages).map((message, index) => sanitizeMessage(message, {
      ownerId: context.ownerId,
      sessionId: context.sessionId,
      conversationId: context.conversationId,
      now,
      index,
    })).filter(Boolean).slice(-MAX_MESSAGES),
    conversationId: schema.text(context.conversationId, 120) || `co:${schema.text(context.ownerId, 80)}:${schema.text(context.sessionId, 80)}`,
    updatedAt: new Date(now).toISOString(),
    expiresAt,
  };
}

function sanitizeMessage(message = {}, { ownerId, sessionId, conversationId, now, index = 0 } = {}) {
  const role = message.role === "operator" ? "operator" : "owner";
  const createdAt = schema.text(message.createdAt, 40) || new Date(now).toISOString();
  return {
    messageId: schema.text(message.messageId, 120) || `${conversationId || "co"}:${now}:${index}`,
    conversationId: schema.text(message.conversationId, 120) || conversationId || null,
    ownerId: schema.text(message.ownerId, 160).toLowerCase() || schema.text(ownerId, 160).toLowerCase(),
    sessionId: schema.text(message.sessionId, 100) || schema.text(sessionId, 100),
    role,
    rawText: schema.text(message.rawText, 4000),
    parsedIntent: schema.text(message.parsedIntent, 120) || null,
    operation: schema.text(message.operation, 120) || null,
    resolvedLessonIds: schema.asArray(message.resolvedLessonIds).map((v) => schema.text(v, 160)).filter(Boolean).slice(0, 12),
    resolvedActivityIds: schema.asArray(message.resolvedActivityIds).map((v) => schema.text(v, 160)).filter(Boolean).slice(0, 24),
    requestedActivities: schema.asArray(message.requestedActivities).map((v) => schema.text(v, 180)).filter(Boolean).slice(0, 24),
    requestedImages: schema.asArray(message.requestedImages).map((v) => schema.text(v, 180)).filter(Boolean).slice(0, 24),
    requestedPrintables: schema.asArray(message.requestedPrintables).map((v) => schema.text(v, 180)).filter(Boolean).slice(0, 24),
    exclusions: schema.asArray(message.exclusions).map((v) => schema.text(v, 120)).filter(Boolean).slice(0, 24),
    effectiveInstructionSummary: schema.text(message.effectiveInstructionSummary, 800) || null,
    responseText: schema.text(message.responseText, 2000) || null,
    createdAt,
    expiresAt: schema.text(message.expiresAt, 40) || new Date(now + TTL_MS).toISOString(),
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

function loadConversationContext(store, ownerId, sessionId, now = Date.now()) {
  return read(store, ownerId, sessionId, now);
}

function appendConversationMessage(store, ownerId, sessionId, message, now = Date.now()) {
  const current = read(store, ownerId, sessionId, now) || { ownerId, sessionId };
  const next = save(store, {
    ...current,
    messages: [...schema.asArray(current.messages), message],
  }, now);
  return next?.messages?.at(-1) || null;
}

function mergeFollowUpCommand(context = {}, command = {}) {
  const explicitTarget = schema.asArray(command.scope?.lessonIds).length > 0;
  return {
    ...command,
    scope: {
      ...(command.scope || {}),
      lessonIds: explicitTarget ? command.scope.lessonIds : schema.asArray(context.currentLessonId ? [context.currentLessonId] : []),
    },
  };
}

function resolveConversationReferences(context = {}, command = {}) {
  return mergeFollowUpCommand(context, command).scope.lessonIds;
}

function applyConversationCorrections(context = {}, rawText = "") {
  const correction = schema.text(rawText, 400);
  if (!/^(no[,!]?|i meant|that is not|only do|do not|keep )/i.test(correction)) return context;
  return { ...context, corrections: [...schema.asArray(context.corrections), correction].slice(-12) };
}

function clearTemporaryConversation(store, ownerId, sessionId) {
  clear(store, ownerId, sessionId);
}

function summarizeConversationContext(context = {}) {
  return {
    lessonId: context.currentLessonId || null,
    lessonTitle: context.currentLessonTitle || null,
    operation: context.currentOperation || null,
    unresolvedQuestion: context.unresolvedQuestion || null,
    corrections: schema.asArray(context.corrections),
    messageCount: schema.asArray(context.messages).length,
  };
}

module.exports = {
  TTL_MS, key, sanitize, read, save, clear, sanitizeMessage,
  loadConversationContext, appendConversationMessage, mergeFollowUpCommand,
  resolveConversationReferences, applyConversationCorrections,
  clearTemporaryConversation, summarizeConversationContext,
};
