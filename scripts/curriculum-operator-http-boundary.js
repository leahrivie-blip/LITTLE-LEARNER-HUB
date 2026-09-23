"use strict";

const schema = require("./curriculum-operator-schema.js");

async function handleParseRequest({
  body = {}, session = {}, store, curriculum = {}, phase = 7, dependencies = {},
} = {}) {
  const conversation = dependencies.conversationStore;
  const parseCommand = dependencies.parseCommand;
  const profileStore = dependencies.profileStore;
  const now = dependencies.now || (() => Date.now());
  if (!conversation || !parseCommand || !profileStore) throw new TypeError("Operator parse dependencies are required.");
  const ownerId = schema.text(session.email, 160).toLowerCase();
  if (!ownerId) return { statusCode: 401, body: { ok: false, code: "owner_required", error: "Owner authentication is required." } };
  const sessionId = schema.text(body.operatorSessionId, 100);
  const requestId = schema.text(body.requestId, 120);
  const rawText = schema.text(body.command || body.rawCommand || "", 4000);
  if (!rawText) return { statusCode: 400, body: { ok: false, code: "command_required", error: "Enter a message for the operator." } };
  let stored = sessionId ? conversation.loadConversationContext(store, ownerId, sessionId, now()) : null;
  if (requestId && schema.asArray(stored?.messages).some((message) => message.role === "owner" && message.requestId === requestId)) {
    return {
      statusCode: 200,
      body: { ok: true, action: "parse", conversationContext: stored, publishEnabled: false, jobCreated: false, idempotent: true },
    };
  }
  const correction = conversation.parseSemanticCorrection(rawText);
  if (correction.type === "start_over" && sessionId) {
    conversation.clearTemporaryConversation(store, ownerId, sessionId);
    stored = null;
  }
  const lessons = schema.asArray(curriculum.lessonPlans);
  const toddler = correction.affectedTarget === "toddler"
    ? lessons.find((lesson) => /toddler/i.test(lesson.age || ""))
    : null;
  let profile;
  try {
    profile = profileStore.read(store, ownerId);
  } catch (_error) {
    return { statusCode: 503, body: { ok: false, code: "profile_unavailable", error: "Remembered instructions are unavailable; no changes were made." } };
  }
  const parsed = parseCommand(rawText, {
    phase,
    lessonPlans: lessons,
    currentlySelectedLessonId: toddler?.id || body.currentlySelectedLessonId,
    operatorContext: body.operatorContext || (stored?.currentLessonId ? {
      previousIntent: stored.currentOperation || "",
      previousResolvedTargets: [stored.currentLessonId],
      previousExclusions: stored.requestedExclusions || [],
    } : null),
    ownerProfile: profile,
  });
  const target = schema.asArray(parsed.command?.scope?.lessonIds).length === 1
    ? lessons.find((lesson) => lesson.id === parsed.command.scope.lessonIds[0]) : null;
  let context = null;
  if (sessionId) {
    try {
      context = conversation.save(store, {
        ...conversation.applySemanticCorrection(stored || {}, correction),
        ownerId, sessionId,
        currentLessonId: target?.id || stored?.currentLessonId || null,
        currentLessonTitle: target?.title || stored?.currentLessonTitle || null,
        currentOperation: parsed.command?.intent || stored?.currentOperation || null,
        requestedActivities: [...new Set([...(stored?.requestedActivities || []), ...(parsed.command?.scope?.requestedActivities || [])])].slice(0, 24),
        requestedExclusions: [...new Set([...(stored?.requestedExclusions || []), ...(parsed.interpretation?.nextContext?.previousExclusions || [])])],
        imageRequirements: parsed.command?.actions?.generateImages ? "requested" : stored?.imageRequirements || null,
        printableRequirements: parsed.command?.actions?.generatePrintables ? "requested" : stored?.printableRequirements || null,
        unresolvedQuestion: correction.clarificationRequired
          ? correction.responseText
          : (parsed.needsConfirmation ? "I need one detail before I continue: please tell me which lesson you mean." : null),
        messages: [...(stored?.messages || []), {
          role: "owner", requestId, rawText, operation: parsed.command?.intent, resolvedLessonIds: parsed.command?.scope?.lessonIds || [],
        }, {
          role: "operator", operation: parsed.command?.intent, resolvedLessonIds: parsed.command?.scope?.lessonIds || [],
          effectiveInstructionSummary: parsed.effectiveInstructions?.summary || null,
          responseText: correction.responseText || (parsed.needsConfirmation
            ? "I need one detail before I continue: please tell me which lesson you mean."
            : `I understand. ${target ? `You want me to update ${target.title}` : "I have your request"}, and publishing will stay off.`),
        }],
      }, now());
    } catch (_error) {
      return { statusCode: 503, body: { ok: false, code: "conversation_unavailable", error: "Your message could not be saved, so no changes were made." } };
    }
  }
  return {
    statusCode: 200,
    body: { ok: true, action: "parse", ...parsed, conversationContext: context, publishEnabled: false, jobCreated: false },
  };
}

module.exports = { handleParseRequest };
