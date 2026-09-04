"use strict";

/**
 * Expand thin/blank Owner Admin activity fields using the existing approved concept.
 * Never invents a new activity — only deepens fields for the same title/steps/materials.
 */

const {
  text,
  lines,
  wordCount,
  sentenceCount,
  auditActivityContentQuality,
  activityExpectsCleanup,
  activityExpectsSubstitutions,
  activityExpectsChallenge,
} = require("./content-quality.js");

function stripStepNum(s) {
  return text(s).replace(/^\d+\.\s*/, "");
}

function materialList(activity) {
  return lines(activity.materials).filter((m) => !/^(none|n\/?a)\.?$/i.test(m));
}

function firstMaterials(activity, n = 3) {
  return materialList(activity).slice(0, n);
}

function stepVerbs(activity, n = 4) {
  return lines(activity.steps || activity.directions)
    .map(stripStepNum)
    .filter(Boolean)
    .slice(0, n);
}

function keepIfGood(current, minWords, builder) {
  const cur = text(current);
  if (wordCount(cur) >= minWords && sentenceCount(cur) >= (minWords >= 30 ? 2 : 1)) return cur;
  return builder(cur);
}

function expandObjective(activity) {
  return keepIfGood(activity.objective, 10, (cur) => {
    const title = text(activity.title);
    const domain = text(activity.activityCategory) || "learning";
    if (cur && wordCount(cur) >= 6 && !/^children will (learn about|explore)\b/i.test(cur)) {
      return `${cur} Teachers support this ${domain.toLowerCase()} goal during “${title}” with concrete language and unhurried turns.`;
    }
    return `Children practice a clear ${domain.toLowerCase()} goal during “${title}”: noticing, trying, and communicating with adult support — not producing a perfect product.`;
  });
}

function expandDescription(activity) {
  return keepIfGood(activity.description, 35, (cur) => {
    const title = text(activity.title);
    const steps = stepVerbs(activity);
    const mats = firstMaterials(activity);
    const lead = cur
      || `Children engage with “${title}” as a hands-on classroom invitation.`;
    const doLine = steps.length
      ? `They ${steps.slice(0, 3).map((s) => s.charAt(0).toLowerCase() + s.slice(1)).join("; ")}.`
      : `They explore the invitation at their own pace while teachers stay close.`;
    const matLine = mats.length
      ? `Materials such as ${mats.join(", ")} are ready so children can jump in without waiting on adult hunting.`
      : `The space is cleared and inviting so children can join without waiting.`;
    const close =
      "Teachers narrate actions, offer short turns, and keep the focus on process, language, and joyful participation.";
    return [lead, doLine, matLine, close].join(" ");
  });
}

function expandPreparation(activity) {
  return keepIfGood(activity.preparation || activity.prep, 12, (cur) => {
    const mats = firstMaterials(activity, 4);
    const bits = [];
    if (cur) bits.push(cur.replace(/\.$/, ""));
    if (mats.length) bits.push(`Stage ${mats.join(", ")} within reach before children arrive`);
    bits.push("Preview the first two steps so you can coach without pausing the group");
    bits.push("Set aside wipes or a reset tray for quick mid-activity tidy");
    return `${bits.join(". ")}.`;
  });
}

function expandSetup(activity) {
  return keepIfGood(activity.setup, 15, (cur) => {
    const mats = firstMaterials(activity, 3);
    const title = text(activity.title);
    const base = cur && wordCount(cur) >= 4 && !/^(circle on rug|open space|small table)\.?$/i.test(cur)
      ? cur.replace(/\.$/, "")
      : `Arrange a clear invitation for “${title}” at child height`;
    const matPart = mats.length
      ? ` with ${mats.join(", ")} placed where children can see and reach them`
      : "";
    return `${base}${matPart}. Leave an open place for the teacher to sit beside children, demonstrate once, then step back so children can try.`;
  });
}

function expandSteps(activity) {
  const existing = lines(activity.steps || activity.directions);
  const substantial = existing.filter((s) => wordCount(stripStepNum(s)) >= 4);
  if (existing.length >= 3 && substantial.length >= 2) {
    return existing.map((s, i) => (/^\d+\./.test(s) ? s : `${i + 1}. ${s}`)).join("\n");
  }
  const title = text(activity.title);
  const mats = firstMaterials(activity, 2);
  const seed = existing.map(stripStepNum).filter(Boolean);
  const built = [
    seed[0] || `Invite children to the “${title}” space and point out what is ready`,
    seed[1] || (mats.length
      ? `Show how to use ${mats[0]} once, then hand materials to waiting children`
      : "Model the first action once, then invite children to try"),
    seed[2] || "Stay beside the group, narrating what you notice and offering the next short turn",
    seed[3] || "Offer one choice or challenge for children who are ready for more",
    seed[4] || "Close by helping children notice what they did and reset one material together",
  ];
  return built.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

function expandTeacherLanguage(activity) {
  const existing = lines(activity.teacherLanguage);
  const useful = existing.filter((p) => wordCount(p) >= 3 && !/^(what do you see\??)$/i.test(p));
  if (useful.length >= 3) return useful.join("\n");
  const title = text(activity.title);
  const mats = firstMaterials(activity, 2);
  const extras = [
    `I notice you trying something new in “${title}.”`,
    mats[0] ? `You can use the ${mats[0].toLowerCase()} like this — your turn.` : "Would you like a turn next, or do you want to watch one more time?",
    "Tell me what your hands are doing.",
    "What should we try together?",
  ];
  return [...useful, ...extras].slice(0, 4).join("\n");
}

function expandObservation(activity) {
  return keepIfGood(activity.observationOpportunities, 18, (cur) => {
    const domain = text(activity.activityCategory) || "development";
    const title = text(activity.title);
    const lead = cur
      ? cur.replace(/\.$/, "")
      : `Watch how children engage during “${title}”`;
    return [
      `${lead}.`,
      `Notice ${domain.toLowerCase()} behaviors such as persistence, tool or body control, turn-taking, and new words.`,
      "Jot who initiates, who imitates, and who needs a quieter entry or one-on-one support.",
    ].join(" ");
  });
}

function expandObservationPrompts(activity) {
  const existing = Array.isArray(activity.observationPrompts)
    ? activity.observationPrompts.map(text).filter(Boolean)
    : [];
  if (existing.length >= 2 && existing.every((p) => wordCount(p) >= 4)) return existing.slice(0, 4);
  const title = text(activity.title);
  const fromObs = lines(expandObservation(activity)).filter((l) => wordCount(l) >= 4);
  const built = [
    ...existing,
    ...fromObs,
    `How does this child enter and stay with “${title}”?`,
    "What language, gestures, or problem-solving do you hear or see?",
    "What support helped this child succeed today?",
  ];
  return [...new Set(built.map(text).filter(Boolean))].slice(0, 4);
}

function expandSafety(activity) {
  return keepIfGood(activity.safetyNotes, 8, (cur) => {
    const mats = firstMaterials(activity, 2);
    const bits = [];
    if (cur && !/^supervise/i.test(cur)) bits.push(cur.replace(/\.$/, ""));
    bits.push("Stay within arm’s reach and keep pathways clear");
    if (mats.length) bits.push(`Check ${mats[0].toLowerCase()} for damage before and after use`);
    bits.push("Stop the invitation if materials become a mouthing or crowding hazard");
    return `${bits.join(". ")}.`;
  });
}

function expandCleanup(activity) {
  if (!activityExpectsCleanup(activity)) {
    return text(activity.cleanupTips || activity.cleanup) || "N/A — no materials to put away.";
  }
  return keepIfGood(activity.cleanupTips || activity.cleanup, 8, (cur) => {
    const mats = firstMaterials(activity, 3);
    if (cur && wordCount(cur) >= 5) {
      return `${cur.replace(/\.$/, "")}. Invite children to help return one item to its labeled spot before leaving the area.`;
    }
    if (mats.length) {
      return `Invite children to help return ${mats.join(", ")} to labeled bins; wipe surfaces and reset the invitation for the next group.`;
    }
    return "Invite children to help reset the space; wipe surfaces and clear the floor path for the next transition.";
  });
}

function expandTips(activity) {
  const tips = Array.isArray(activity.teacherTips)
    ? activity.teacherTips.map(text).filter(Boolean)
    : lines(activity.teacherTips);
  const good = tips.filter((t) => wordCount(t) >= 8);
  if (good.length >= 2) return good.slice(0, 4);
  const title = text(activity.title);
  const mats = firstMaterials(activity, 1);
  const extras = [
    `Keep “${title}” short and repeatable — toddlers and preschoolers learn through another joyful turn.`,
    mats[0]
      ? `Place spare ${mats[0].toLowerCase()} in a teacher basket so you can refresh without leaving the group.`
      : "Model once, then narrate child attempts instead of correcting every move.",
    "If the group crowds, split into two short rounds rather than stretching one long wait.",
  ];
  return [...good, ...extras].slice(0, 3);
}

function expandSubstitutions(activity) {
  if (!activityExpectsSubstitutions(activity)) return Array.isArray(activity.substitutions) ? activity.substitutions : [];
  const existing = Array.isArray(activity.substitutions) ? activity.substitutions.filter((s) => s && (s.need || s.from) && (s.use || s.to)) : [];
  if (existing.length) return existing;
  const mats = firstMaterials(activity, 3);
  if (!mats.length) {
    return [{ need: "Specialized props", use: "Household look-alikes or teacher-made picture cards" }];
  }
  return mats.slice(0, 2).map((m) => ({
    need: m,
    use: `A classroom stand-in with the same job (safe, similar size, easy to clean)`,
  }));
}

function expandAdaptations(activity) {
  return keepIfGood(activity.adaptations || activity.supportAdaptations, 10, (cur) => {
    const title = text(activity.title);
    if (cur) {
      return `${cur.replace(/\.$/, "")}. Offer hand-over-hand or a smaller set of choices for children who need a quieter entry into “${title}.”`;
    }
    return `Simplify “${title}” by offering fewer materials at once, sitting beside the child, and narrating one step at a time. Allow watching first, then a short coached turn.`;
  });
}

function expandExtensions(activity) {
  if (!activityExpectsChallenge(activity)) return text(activity.extensions || activity.addedChallenge);
  return keepIfGood(activity.extensions || activity.addedChallenge, 8, (cur) => {
    const title = text(activity.title);
    if (cur) {
      return `${cur.replace(/\.$/, "")}. Invite ready children to teach a peer or add one more detail to their idea during “${title}.”`;
    }
    return `For children ready for more during “${title},” add a second step, a peer teaching role, or a comparison question (“same or different?”) after their first successful turn.`;
  });
}

function expandMixedAge(activity) {
  return keepIfGood(activity.mixedAgeAdaptations || activity.mixedAge, 8, (cur) => {
    if (cur && wordCount(cur) >= 8) return cur;
    return "Younger children watch, co-participate, and use fewer materials; older children name more words, take longer turns, and help reset.";
  });
}

function expandVocabulary(activity) {
  const existing = Array.isArray(activity.vocabulary)
    ? activity.vocabulary.map(text).filter(Boolean)
    : text(activity.vocabulary).split(/[,;\n]+/).map(text).filter(Boolean);
  if (existing.length >= 4) return existing.slice(0, 8);
  const titleWords = text(activity.title)
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, "").toLowerCase())
    .filter((w) => w.length > 3 && !/(with|from|about|little|workshop)/.test(w));
  const mats = firstMaterials(activity, 3).map((m) => m.split(/\s+/)[0].toLowerCase());
  const bank = ["try", "gentle", "together", "next", "wait", "clean", "share", "notice", "build", "choose"];
  return [...new Set([...existing, ...titleWords.slice(0, 3), ...mats, ...bank])].slice(0, 8);
}

function expandIndoorOutdoor(activity) {
  const indoor = text(activity.indoorAlternatives)
    || "Run the same invitation indoors at a table, rug, or wall station with materials contained on trays.";
  const outdoor = text(activity.outdoorAlternatives)
    || "Take the same idea outdoors when weather allows — use a clear boundary and the same coaching language.";
  return {
    indoorAlternatives: wordCount(activity.indoorAlternatives) >= 8
      ? text(activity.indoorAlternatives)
      : indoor,
    outdoorAlternatives: wordCount(activity.outdoorAlternatives) >= 8
      ? text(activity.outdoorAlternatives)
      : outdoor,
  };
}

/**
 * Build an enrichment patch that only deepens thin/blank fields for one live activity.
 */
function expandActivityForOwnerQuality(activity) {
  const io = expandIndoorOutdoor(activity);
  const observationOpportunities = expandObservation(activity);
  const observationPrompts = expandObservationPrompts({
    ...activity,
    observationOpportunities,
  });
  const patch = {
    objective: expandObjective(activity),
    description: expandDescription(activity),
    materials: text(activity.materials) || materialList(activity).join("\n") || "Classroom materials listed for this invitation",
    preparation: expandPreparation(activity),
    setup: expandSetup(activity),
    steps: expandSteps(activity),
    teacherLanguage: expandTeacherLanguage(activity),
    observationOpportunities,
    observationPrompts,
    safetyNotes: expandSafety(activity),
    cleanupTips: expandCleanup(activity),
    teacherTips: expandTips(activity),
    substitutions: expandSubstitutions(activity),
    adaptations: expandAdaptations(activity),
    extensions: expandExtensions(activity),
    supportAdaptations: expandAdaptations(activity),
    addedChallenge: expandExtensions(activity),
    mixedAgeAdaptations: expandMixedAge(activity),
    vocabulary: expandVocabulary(activity),
    indoorAlternatives: io.indoorAlternatives,
    outdoorAlternatives: io.outdoorAlternatives,
  };

  // Preserve strong existing list/text when already meeting quality after expansion check.
  const preview = { ...activity, ...patch, vocabulary: Array.isArray(patch.vocabulary) ? patch.vocabulary.join(", ") : patch.vocabulary };
  const audit = auditActivityContentQuality(preview);
  if (!audit.ok) {
    // One more pass on remaining thin fields — description/setup often need the second sentence boost.
    if (audit.thin.some((t) => t.startsWith("description"))) {
      patch.description = `${patch.description} Children may repeat the invitation; celebrate another try instead of rushing to a finished look.`;
    }
    if (audit.thin.some((t) => t.startsWith("setup"))) {
      patch.setup = `${patch.setup} Keep backups in a teacher basket just behind the invitation.`;
    }
    if (audit.thin.some((t) => t.startsWith("observationOpportunities"))) {
      patch.observationOpportunities = `${patch.observationOpportunities} Note peer interactions and any safety coaching you provide.`;
    }
  }
  return patch;
}

module.exports = {
  expandActivityForOwnerQuality,
};
