/**
 * Deterministic semantic signals extracted from owner language.
 * Explicit prohibition/scope/target always beat legacy keyword defaults.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const lexicon = require("./curriculum-operator-semantic-lexicon.js");

const SEMANTIC_VERSION = 1;

const EXAMPLE_SPAN_RE = /\b(?:for example|e\.g\.|eg\.|such as|hypothetical|sample command|as an example|desired test command)\b[\s\S]*/i;
const META_RE = /\b(?:modify the parser|change the parser|trace the architecture|write tests|create a (?:feature )?branch|git checkout|open a pr|pull request|hardcode|cursor agent|engineering instructions?)\b/i;
const CURRICULUM_ACTION_RE = /\b(?:fix|replace|upgrade|audit|finish|create|generate|publish|images?|pictures?|photos?|vocab|printable|lesson|lessons|plans?)\b/i;

function text(value, max = 8000) {
  return schema.text(value, max);
}

function negationVariants(body) {
  return new RegExp(
    String.raw`\b(?:do\s+not|dont|don't|do not|never|no)\s+(?:touch|change|update|make|create|generate|mutate|publish|replace)?\s*(?:the\s+|any\s+|all\s+)?${body}\b`,
    "i",
  );
}

function exclusiveRemainderLanguage(folded) {
  return /\b(?:dont|do not|never)\s+change\s+anything\s+else\b/.test(folded)
    || /\bkeep\s+everything\s+else\s+exactly\s+the\s+same\b/.test(folded)
    || /\bleave\s+everything\s+else\b/.test(folded)
    || /\bchange\s+nothing\s+else\b/.test(folded)
    || /\bleave\s+(?:everything|all)\s+else\s+alone\b/.test(folded);
}

/** True only when THIS topic is the exclusive focus — not when another "X only" topic is named. */
function hasExclusiveOnly(folded, topic) {
  return new RegExp(String.raw`\b${topic}\s+only\b`).test(folded)
    || new RegExp(String.raw`\bonly\s+(?:the\s+|activity\s+|fix\s+(?:the\s+)?)?${topic}\b`).test(folded)
    || new RegExp(String.raw`\bnothing\s+(?:else\s+)?except\s+(?:the\s+|activity\s+)?${topic}\b`).test(folded)
    || (exclusiveRemainderLanguage(folded) && new RegExp(String.raw`\b${topic}\b`).test(folded));
}

function stripCoverImageNouns(folded) {
  return String(folded || "")
    .replace(/\bcover\s+(?:picture|photo|image)s?\b/g, " cover ")
    .replace(/\b(?:picture|photo|image)\s+(?:for\s+(?:the\s+)?)?cover\b/g, " cover ")
    // Cover target description ("to a realistic farm animal photo") is not activity-image work.
    .replace(/\b(?:to|into|with|as)\s+(?:a\s+|an\s+)?realistic\b[^.!?]{0,48}\b(?:picture|photo|image)s?\b/g, " ");
}

/** Strip protective/exclusion clauses so "leave activity pictures alone" is not positive image work.
 * Do NOT strip "keep the good pictures" — that is keep-good image-repair language, not an exclusion.
 */
function stripProtectiveAssetClauses(folded) {
  return String(folded || "")
    .replace(/\bleave\s+(?:every|all|the|any|those|these)?\s*(?:other\s+)?(?:activity\s+)?(?:images?|pictures?|photos?|pics|visuals?)\s+alone\b/g, " ")
    .replace(/\b(?:dont|do not|never)\s+(?:touch|change|update|replace|redo)\s+(?:any|every|all|the|those|these)?\s*(?:other\s+)?(?:activity\s+)?(?:images?|pictures?|photos?|pics|visuals?)\b/g, " ")
    .replace(/\b(?:pictures?|photos?|images?)\s+(?:look|are|seem)\s+good\b/g, " ")
    .replace(/\b(?:dont|do not|never)\s+(?:touch|change|update|replace)\s+(?:any|every|all|the)?\s*cover\b/g, " ")
    .replace(/\bleave\s+(?:the\s+)?cover\s+(?:alone|unchanged|the\s+same)\b/g, " ")
    .replace(/\b(?:dont|do not|never)\s+(?:change|touch|rewrite)\s+(?:the\s+)?(?:lesson\s+)?(?:wording|text|content)\b/g, " ");
}

function extractActivityImageTarget(folded) {
  const ordinalMatch = folded.match(
    /\b(?:fix|replace|update|regenerate|redo)?\s*(?:only\s+)?(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)(?:st|nd|rd|th)?\s+activity(?:\s+(?:picture|photo|image))?\b/,
  );
  const ordinalWords = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
    sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  };
  let activityOrdinal = null;
  if (ordinalMatch) {
    const token = String(ordinalMatch[1] || "");
    activityOrdinal = ordinalWords[token] || Number(token) || null;
    if (!Number.isFinite(activityOrdinal) || activityOrdinal < 1) activityOrdinal = null;
  }
  if (!activityOrdinal) {
    const numberedActivity = folded.match(/\bactivity\s+(\d{1,2})\s*(?:'s|s)?\s+(?:picture|photo|image)\b/);
    if (numberedActivity) activityOrdinal = Number(numberedActivity[1]);
    if (!Number.isFinite(activityOrdinal) || activityOrdinal < 1) activityOrdinal = null;
  }
  let activityTitleHint = "";
  const titled = folded.match(
    /\b(?:fix|replace|update|regenerate)\s+(?:the\s+)?(?:picture|photo|image)\s+for\s+(.+?)\s+only\b/,
  ) || folded.match(
    /\bonly\s+(?:the\s+)?(?:picture|photo|image)\s+(?:for|of)\s+(.+?)(?:\.|$)/,
  ) || folded.match(
    /\bretry\s+only\s+the\s+(.+?)\s+(?:picture|photo|image)\b/,
  );
  if (titled) activityTitleHint = String(titled[1] || "").replace(/\b(?:in|on|for)\s+.+$/, "").trim().slice(0, 120);
  const singleActivityOnly = Boolean(activityOrdinal)
    || Boolean(activityTitleHint)
    || /\bonly\s+(?:the\s+)?(?:one\s+)?(?:activity\s+)?(?:picture|photo|image)\b/.test(folded)
    || (/\b(?:picture|photo|image)\s+only\b/.test(folded) && /\bactivity\b/.test(folded))
    || (/\bchange\s+only\s+activity\s+\d{1,2}\b/.test(folded) && /\b(?:picture|photo|image)\b/.test(folded));
  return { activityOrdinal, activityTitleHint, singleActivityOnly };
}

function requestedAccess(folded, raw) {
  const freePos = /\bfree\b/.test(folded) || /\bfree\b/i.test(raw);
  const proPos = /\bpro\b/.test(folded) || /\bpro\b/i.test(raw);
  const freeNeg = /\b(?:not|never|dont|except)\s+pro\b/.test(folded) || /\bnot\s+pro\b/i.test(raw);
  const proNeg = /\b(?:not|never|dont|except)\s+free\b/.test(folded);
  if (freePos && proPos && freeNeg && !proNeg) return "Free";
  if (freePos && proPos && proNeg && !freeNeg) return "Pro";
  if (freePos && proPos) {
    return { conflict: true, free: true, pro: true };
  }
  if (freePos && !proNeg) return "Free";
  if (proPos && !freeNeg) return "Pro";
  return null;
}

function stripCatalogIds(value) {
  return String(value || "").replace(/\bcur-(?:lp|act)-[a-z0-9-]+\b/gi, " ");
}

function requestedAgeBand(folded, raw, exampleSpan) {
  // Lesson IDs such as cur-lp-infant-colors-all-around-us are not an age request.
  // Folding also splits hyphens into words, so strip IDs from the raw source first.
  const prefix = exampleSpan
    ? String(raw || "").slice(0, Math.max(0, String(raw || "").length - exampleSpan.length))
    : String(raw || "");
  const source = stripCatalogIds(prefix);
  const foldedSource = lexicon.foldCommandText(source);
  if (/\binfant\b/.test(foldedSource) || /\binfant\b/i.test(source)) return "infant";
  if (/\btoddler\b/.test(foldedSource) || /\btoddler\b/i.test(source)) return "toddler";
  if (/\bpreschool\b/.test(foldedSource) || /\bpreschool\b/i.test(source)) return "preschool";
  return null;
}

function inExclusionList(folded, topic) {
  if (negationVariants(topic).test(folded)) return true;
  if (new RegExp(String.raw`\bleave\s+(?:the\s+)?${topic}\s+alone\b`, "i").test(folded)) return true;
  return new RegExp(
    String.raw`\b(?:do\s+not|dont|don't|never)\s+(?:touch|change|update|replace|make|create|generate|mutate)\s+(?:the\s+|any\s+|all\s+)?[^.!?]{0,280}\b${topic}\b`,
    "i",
  ).test(folded);
}

function exclusiveImageRepairCommand(folded) {
  return /\b(?:repair|fix|replace)\s+only\s+(?:the\s+)?(?:bad\s+|cartoon\s+|unrealistic\s+|generic\s+)*(?:activity\s+)?(?:images?|pictures?|photos?|pics|visuals?)\b/.test(folded)
    || /\breplace\s+only\s+(?:the\s+)?(?:cartoon|unrealistic|generic|bad)\b/.test(folded);
}

function extractExampleSpan(raw) {
  const match = String(raw || "").match(EXAMPLE_SPAN_RE);
  return match ? match[0] : "";
}

function isMetaInstruction(raw, folded) {
  const textRaw = String(raw || "");
  if (!META_RE.test(textRaw) && !/\bwrite tests for the operator\b/i.test(textRaw)) return false;
  const hasCurriculumJob = CURRICULUM_ACTION_RE.test(folded)
    && /\b(?:my|our|these|those|published|free|toddler|preschool)\s+(?:lesson|lessons|plans|curriculum)\b/.test(folded);
  return !hasCurriculumJob;
}

function extractSignals(rawCommand) {
  const raw = text(rawCommand, 8000);
  const folded = lexicon.foldCommandText(raw);
  const exampleSpan = extractExampleSpan(raw);
  const access = requestedAccess(folded, raw);
  const ageBand = requestedAgeBand(folded, raw, exampleSpan);

  const imageTopic = /(?:activity\s+)?(?:images?|pictures?|photos?|pics|visuals?)/;
  const withoutCoverImageNouns = stripCoverImageNouns(folded);
  const affirmativeAssetFolded = stripProtectiveAssetClauses(withoutCoverImageNouns);
  function positivelyRequested(topic) {
    if (negationVariants(topic).test(folded)) return false;
    // Handles "don't touch the pictures or printables" (negation spanning an or-list).
    if (inExclusionList(folded, topic)) return false;
    if (new RegExp(String.raw`\bleave\s+(?:the\s+)?${topic}\s+alone\b`).test(folded)) return false;
    if (new RegExp(String.raw`\b${topic}\s+(?:look|are|seem)\s+good\b`).test(folded)) return false;
    return new RegExp(String.raw`\b(?:fix|make|generate|create|upgrade|add|finish|regenerate|improve|complete|fill|replace|check)\b[^.]{0,56}\b${topic}\b`).test(folded);
  }
  const coverExcludedLanguage = inExclusionList(folded, "cover")
    || /\bkeep\s+(?:the\s+)?cover\b/.test(folded)
    || /\bleave\s+(?:the\s+)?cover\s+(?:unchanged|alone|the\s+same)\b/.test(folded);
  const coverAffirmativeFolded = stripProtectiveAssetClauses(folded)
    .replace(/\bkeep\s+(?:the\s+)?cover\b/g, " ")
    .replace(/\bleave\s+(?:the\s+)?cover\s+(?:unchanged|alone|the\s+same)\b/g, " ");
  const coverHint = !coverExcludedLanguage
    && (/\b(?:update|replace|fix|make|change|create|check)\b.{0,40}\bcover(?:\s+(?:picture|photo|image)s?)?\b/.test(coverAffirmativeFolded)
      || /\bcover\s+(?:picture|photo|image)s?\b/.test(coverAffirmativeFolded)
      || /\bonly\s+(?:the\s+)?(?:\w+\s+){0,6}cover(?:\s+(?:picture|photo|image)s?)?\b/.test(coverAffirmativeFolded)
      || /\brealistic_lesson_cover\b/i.test(raw)
      || /\brealistic\s+lesson\s+cover\b/.test(coverAffirmativeFolded)
      || /\bnew\s+cover\b/.test(coverAffirmativeFolded));
  // Protective mentions ("leave activity pictures alone", "pictures look good") are not image work.
  const activityImageMentions = /\b(?:images?|pictures?|photos?|pics|visuals?|cartoons?)\b/.test(affirmativeAssetFolded);
  const printableRequested = positivelyRequested("printables?")
    || /\bjust\s+(?:fix|update|make|improve)\s+(?:the\s+)?printables?\b/.test(folded)
    || /\bfix\s+(?:the\s+)?printables?\b/.test(folded);
  const mentionsOtherKitWork = printableRequested
    || positivelyRequested("songs?")
    || positivelyRequested("books?")
    || positivelyRequested("vocab(?:ulary)?")
    || coverHint
    || /\bmatching\s+printables?\b/.test(folded)
    || (/\bprintables?\b/.test(affirmativeAssetFolded)
      && /\b(?:activities|pictures?|photos?|images?)\b/.test(affirmativeAssetFolded)
      && /\blesson\b/.test(folded))
    || /\b(?:upgrade|finish|fix)\s+(?:the\s+)?(?:whole\s+)?teaching\s+kit\b/.test(folded)
    || /\bupgrade\s+activities\b/.test(folded);
  const impliedImageRepair = activityImageMentions
    && !mentionsOtherKitWork
    && (/\breplace\b/.test(affirmativeAssetFolded) || /\bfix\b/.test(affirmativeAssetFolded) || /\bmake\b/.test(affirmativeAssetFolded)
      || /\bkeep\s+(?:the\s+)?good\b/.test(folded) || /\baudit\b/.test(affirmativeAssetFolded)
      || /\bcheck\b/.test(affirmativeAssetFolded)
      || /\bcartoons?\b/.test(affirmativeAssetFolded)
      || (/\brealistic\b/.test(affirmativeAssetFolded) && activityImageMentions)
      || /\bactually\s+look\s+like\s+the\s+activities\b/.test(folded));
  const imagesOnly = hasExclusiveOnly(folded, imageTopic.source)
    || impliedImageRepair
    || /\bchange\s+only\s+activity\s+\d{1,2}\s*(?:'s|s)?\s+(?:picture|photo|image)\b/.test(folded)
    || (activityImageMentions
      && (/\b(?:nothing|anything)\s+else\b/.test(folded)
        || /\b(?:dont|do not|never)\s+change\s+anything\s+else\b/.test(folded)
        || /\bchange\s+nothing\s+else\b/.test(folded)
        || /\bimages?\s+only\b/.test(folded)
        || /\bpictures?\s+only\b/.test(folded)
        || /\bfix\s+activity\s+photos?\s+only\b/.test(folded)));
  const auditImagesOnly = /\baudit\b/.test(folded)
    && activityImageMentions
    && (/\bdont\s+replace\b/.test(folded)
      || /\bdo not\s+replace\b/.test(folded)
      || !/\b(?:replace|generate|create|fix|make)\b/.test(affirmativeAssetFolded));
  const vocabWorkEarly = /\bvocab(?:ulary|ularies)?\b/.test(folded)
    && !inExclusionList(folded, "vocab(?:ulary|ularies)?");
  const multiCapability = [
    vocabWorkEarly,
    coverHint,
    positivelyRequested("books?"),
    positivelyRequested("songs?"),
    printableRequested,
    impliedImageRepair || activityImageMentions,
  ].filter(Boolean).length > 1;
  const exclusiveImages = exclusiveImageRepairCommand(folded) && !mentionsOtherKitWork;
  const activityTarget = extractActivityImageTarget(folded);

  const vocabWork = /\bvocab(?:ulary|ularies)?\b/.test(folded);
  const exclusiveVocabLanguage = /\bvocab(?:ulary|ularies)?\s+only\b/.test(folded)
    || /\bonly\s+(?:the\s+)?vocab/.test(folded)
    || /\bfix\s+(?:the\s+)?vocab/.test(folded)
    || /\bupgrade\s+(?:the\s+)?vocab/.test(folded)
    || /\brepair\s+(?:the\s+)?vocab/.test(folded)
    || /\btarget\s*:\s*vocab/.test(folded)
    || (vocabWork && /\b(?:nothing|anything)\s+else\b/.test(folded) && !/\b(?:images?|pictures?|photos?|cover|printables?)\b/.test(affirmativeAssetFolded));
  const printablesOnly = /\bprintables?\s+only\b/.test(folded)
    || /\bonly\s+(?:the\s+|fix\s+(?:the\s+)?)?printables?\b/.test(folded)
    || /\bjust\s+(?:fix|update|make|improve)\s+(?:the\s+)?printables?\b/.test(folded)
    || (/\bprintables?\b/.test(folded) && /\b(?:dont|do not)\s+change\s+(?:the\s+)?(?:lesson\s+)?text\b/.test(folded)
      && !activityImageMentions && !coverHint)
    || (printableRequested
      && !activityImageMentions
      && !vocabWork
      && !coverHint
      && (exclusiveRemainderLanguage(folded)
        || /\bpictures?\s+(?:look|are|seem)\s+good\b/.test(folded)
        || /\b(?:dont|do not)\s+(?:change|touch|redo)\s+(?:the\s+)?(?:pictures?|photos?|images?|cover)\b/.test(folded)));
  const vocabOnly = vocabWork
    && exclusiveVocabLanguage
    && !multiCapability
    && !positivelyRequested("images?")
    && !positivelyRequested("pictures?")
    && !positivelyRequested("photos?")
    && !coverHint
    && !printablesOnly;
  const coverOnly = coverHint
    && !activityImageMentions
    && !printablesOnly
    && !vocabOnly
    && (/\bcover\s+only\b/.test(folded)
      || /\bonly\s+(?:the\s+)?(?:\w+\s+){0,6}cover\b/.test(folded)
      || /\bcover\s+(?:picture|photo|image)s?\b/.test(folded)
      || /\bnew\s+cover\b/.test(folded)
      || exclusiveRemainderLanguage(folded)
      || /\bleave\s+(?:every|all|the|any).{0,40}(?:activity\s+)?(?:images?|pictures?|photos?)\s+alone\b/.test(folded));
  const wordingExcluded = /\bdont\s+change\s+(?:the\s+)?(?:lesson\s+)?(?:wording|text|content)\b/.test(folded)
    || /\bno\s+text\s+changes?\b/.test(folded)
    || inExclusionList(folded, "(?:activity\\s+)?text")
    || inExclusionList(folded, "(?:weekly\\s+)?content")
    || inExclusionList(folded, "wording");
  const assetsOnlyMulti = !coverOnly && !printablesOnly && !vocabOnly
    && wordingExcluded
    && (
      (coverHint && activityImageMentions && printableRequested)
      || (coverHint && activityImageMentions)
      || (coverHint && printableRequested)
      || (activityImageMentions && printableRequested)
    );
  const keepGoodImages = /\bkeep\s+(?:the\s+)?good\b/.test(folded)
    || /\bdont\s+replace\s+(?:the\s+)?good\b/.test(folded)
    || /\bleave\s+(?:those|the)\s+(?:good\s+)?pictures?\s+alone\b/.test(folded)
    || /\bkeep\s+(?:whats|what\s+is|everything\s+thats|everything\s+that\s+is)\s+already\s+good\b/.test(folded)
    || /\bkeep\s+everything\s+thats\s+good\b/.test(folded)
    || /\bdont\s+redo\s+things?\s+just\s+because\b/.test(folded)
    || /\bkeep\s+the\s+ones\s+that\s+already\s+work\b/.test(folded);
  const carefulFullAuditEarly = (/\bgo through\b/.test(folded) || /\bcheck\b.{0,40}\bcompletely\b/.test(folded))
    && keepGoodImages
    && (/\bfix what looks bad\b/.test(folded)
      || /\bonly fix whats actually\b/.test(folded)
      || /\bonly fix what is actually\b/.test(folded)
      || /\bmake the pictures actually look like\b/.test(folded)
      || /\bdont redo things just because\b/.test(folded));
  const imagesOnlyResolved = (printablesOnly || vocabOnly || coverOnly || assetsOnlyMulti || carefulFullAuditEarly)
    ? false
    : (exclusiveImages
      ? true
      : (auditImagesOnly || (multiCapability && !activityTarget.singleActivityOnly) ? false : imagesOnly));
  const replaceBadImages = !coverOnly && !printablesOnly && (
    /\breplace\s+(?:the\s+)?(?:bad|cartoon|generic|fake|weak)\b/.test(folded)
    || /\bfix\s+(?:the\s+)?(?:bad|cartoon|weak)\b/.test(folded)
    || /\bregenerate\s+(?:the\s+)?(?:weak|bad|remaining)\b/.test(folded)
    || /\bweak(?:est)?\s+(?:remaining\s+)?activity\s+(?:images?|pictures?|photos?)\b/.test(folded)
    || /\bno\s+cartoons?\b/.test(folded)
    || /\bdoesnt\s+actually\s+show\s+the\s+activity\b/.test(folded)
    || /\bnot\s+just\s+weather\s+pictures\b/.test(folded)
    || /\bactually\s+look\s+like\s+the\s+activities\b/.test(folded)
    || (/\brealistic\b/.test(affirmativeAssetFolded) && activityImageMentions)
    || (keepGoodImages && activityImageMentions)
  );
  const generateMissingImages = (/\bmissing\b/.test(folded) && activityImageMentions)
    || (/\bfix\s+what\s+looks\s+bad\b/.test(folded) && activityImageMentions);
  const retryFailedOnly = /\bretry\b/.test(folded)
    && (/\bfailed\b/.test(folded) || /\balready\s+finished\b/.test(folded));
  const retryCoverOnly = retryFailedOnly
    && /\bcover\b/.test(folded)
    && !/\bprintables?\b/.test(folded);

  const exclude = {
    printables: inExclusionList(folded, "printables?")
      || (imagesOnlyResolved && !printablesOnly && !assetsOnlyMulti)
      || vocabOnly
      || coverOnly,
    songs: inExclusionList(folded, "songs?")
      || imagesOnlyResolved
      || vocabOnly
      || coverOnly
      || assetsOnlyMulti
      || printablesOnly,
    books: inExclusionList(folded, "books?")
      || imagesOnlyResolved
      || vocabOnly
      || coverOnly
      || assetsOnlyMulti
      || printablesOnly,
    vocabulary: inExclusionList(folded, "vocab(?:ulary)?")
      || imagesOnlyResolved
      || coverOnly
      || assetsOnlyMulti
      || printablesOnly,
    text: wordingExcluded
      || imagesOnlyResolved
      || printablesOnly
      || coverOnly
      || assetsOnlyMulti,
    activities: /\bdont\s+upgrade\s+activities\b/.test(folded)
      || /\bdont\s+change\s+activity\s+(?:text|content)\b/.test(folded)
      || inExclusionList(folded, "activity\\s+(?:text|content)")
      || imagesOnlyResolved
      || vocabOnly
      || printablesOnly
      || coverOnly
      || assetsOnlyMulti,
    cover: coverExcludedLanguage
      || /\b(?:do\s+not|dont|don't|never)\b[^.!?]{0,40}\b(?:touch|change|update|replace)\b[^.!?]{0,40}\bcover\b/.test(folded)
      || (imagesOnlyResolved && !/\bcover\b/.test(folded) && !assetsOnlyMulti)
      || (printablesOnly && !assetsOnlyMulti)
      || vocabOnly,
    publish: /\bdont\s+publ/.test(folded)
      || /\bdo not publ/.test(folded)
      || /\b(?:do\s+not|dont|don't|never)\b[^.!?]{0,120}\bpublish\b/.test(folded)
      || /\bnever\s+(?:auto[\s-]?)?publish\b/.test(folded)
      || /\bdo not publish\b/i.test(raw)
      || /\bdon['’]?t\s+publish\b/i.test(raw)
      || /\bleave\s+it\s+(?:as\s+a\s+)?(?:draft|unpublished)\b/.test(folded)
      || /\bready\s+for\s+(?:me\s+to\s+)?(?:look\s+over|review)\b/.test(folded),
  };

  const coverRequested = (coverHint
    || /\bcover\s+too\b/.test(folded)
    || /\brealistic\s+cover\b/.test(folded))
    && !exclude.cover;

  const publishRequested = /\bpublish\s+(?:everything|now|all|automatically)\b/.test(folded)
    && !exclude.publish;
  const publishConflict = exclude.publish && /\bpublish\s+(?:everything|now|all)\b/.test(folded);

  const carefulFullAudit = carefulFullAuditEarly;
  const fullKitRequested = (/\bfull\s+teaching\s+kit\b/.test(folded)
    || (/\bfix\s+.+\s+completely\b/.test(folded) && !wordingExcluded && !assetsOnlyMulti)
    || /\bupgrade\s+the\s+whole\s+teaching\s+kit\b/.test(folded)
    || /\bupgrade\s+the\s+existing\b/.test(folded)
    || /\beverything\s+missing\b/.test(folded)
    || (multiCapability && /\bsave\s+directly\s+to\s+the\s+editable\s+draft\b/.test(folded)))
    && !imagesOnlyResolved
    && !vocabOnly
    && !printablesOnly
    && !coverOnly
    && !assetsOnlyMulti
    && !activityTarget.singleActivityOnly
    && !/\bnothing\s+else\b/.test(folded);

  const publishedOnly = /\bpublished\b/.test(folded) || /\bpublished\b/i.test(raw);
  const collection = /\b(?:all|my|our|published)\s+free\b/.test(folded)
    || /\bfree\s+(?:lessons?|plans?|curriculum|lesson)\b/.test(folded)
    || /\bpublished\s+free\b/.test(folded)
    || /\bpublished\s+free\b/i.test(raw)
    || /\bfree\s+lesson[\s-]?plans?\b/i.test(raw)
    || /\bmy\s+free\b/i.test(raw)
    || /\ball\s+(?:my\s+|our\s+)?(?:published\s+)?(?:free\s+|pro\s+)?(?:preschool\s+|toddler\s+|infant\s+)?(?:lessons?|lesson\s+plans?|plans?)\b/.test(folded)
    || /\bpublished\s+(?:free\s+|pro\s+)?(?:preschool\s+|toddler\s+|infant\s+)?(?:lessons?|lesson\s+plans?|plans?)\b/.test(folded);

  const sameAsPrevious = /\b(?:do|do the)\s+same\b/.test(folded)
    || /\bsame\s+thing\b/.test(folded)
    || /\bnow\s+do\s+the\s+other\b/.test(folded);

  const ambiguousBare = /^(?:fix it|make these better|make those better|update everything|do the same)\.?$/i.test(raw.trim());

  const doTheSame = /\bdo the same\b/.test(folded) || /\bsame thing\b/.test(folded);

  return {
    semanticVersion: SEMANTIC_VERSION,
    raw,
    folded,
    exampleSpan,
    access: access && typeof access === "object" ? null : access,
    accessConflict: Boolean(access && access.conflict),
    ageBand,
    imagesOnly: imagesOnlyResolved,
    auditImagesOnly,
    vocabOnly,
    printablesOnly,
    coverOnly,
    assetsOnlyMulti,
    keepGoodImages,
    replaceBadImages,
    generateMissingImages,
    coverRequested,
    exclude,
    publishRequested,
    publishConflict,
    fullKitRequested,
    carefulFullAudit,
    collection,
    publishedOnly,
    sameAsPrevious,
    doTheSame,
    ambiguousBare,
    activityOrdinal: activityTarget.activityOrdinal,
    activityTitleHint: activityTarget.activityTitleHint,
    singleActivityImageTarget: activityTarget.singleActivityOnly,
    retryFailedOnly,
    retryCoverOnly,
    metaInstruction: isMetaInstruction(raw, folded)
      || /\buse the following example\b/.test(folded)
      || /\bdont\s+run\s+it\b/.test(folded)
      || /\bdo not\s+run\s+it\b/.test(folded),
    imageWork: activityImageMentions,
    realistic: /\brealistic\b/.test(folded) || /\breal\b/.test(folded),
    noCartoons: /\bno\s+cartoons?\b/.test(folded) || /\bcartoons?\b/.test(folded),
  };
}

module.exports = {
  SEMANTIC_VERSION,
  extractSignals,
  extractExampleSpan,
  stripProtectiveAssetClauses,
  extractActivityImageTarget,
  foldCommandText: lexicon.foldCommandText,
};
