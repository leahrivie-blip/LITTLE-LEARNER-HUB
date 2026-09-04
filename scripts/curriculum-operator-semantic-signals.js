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

function hasExclusiveOnly(folded, topic) {
  return new RegExp(String.raw`\b(?:images?|pictures?|photos?|visuals?|vocab(?:ulary)?|printables?|cover|text|content)\s+only\b`).test(folded)
    || new RegExp(String.raw`\bonly\s+(?:the\s+|activity\s+)?${topic}\b`).test(folded)
    || new RegExp(String.raw`\bnothing\s+(?:else\s+)?except\s+(?:the\s+|activity\s+)?${topic}\b`).test(folded)
    || /\b(?:dont|do not|never)\s+change\s+anything\s+else\b/.test(folded)
    || /\bkeep\s+everything\s+else\s+exactly\s+the\s+same\b/.test(folded)
    || /\bleave\s+everything\s+else\b/.test(folded)
    || /\bchange\s+nothing\s+else\b/.test(folded);
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
  function positivelyRequested(topic) {
    if (negationVariants(topic).test(folded)) return false;
    if (new RegExp(String.raw`\bleave\s+(?:the\s+)?${topic}\s+alone\b`).test(folded)) return false;
    return new RegExp(String.raw`\b(?:fix|make|generate|create|upgrade|add|finish|regenerate|improve|complete|fill|replace)\b[^.]{0,56}\b${topic}\b`).test(folded);
  }
  const mentionsOtherKitWork = positivelyRequested("printables?")
    || positivelyRequested("songs?")
    || positivelyRequested("books?")
    || positivelyRequested("vocab(?:ulary)?")
    || /\b(?:upgrade|finish|fix)\s+(?:the\s+)?(?:whole\s+)?teaching\s+kit\b/.test(folded)
    || /\bupgrade\s+activities\b/.test(folded);
  const impliedImageRepair = (/\b(?:images?|pictures?|photos?|pics|visuals?|cartoons?)\b/.test(folded)
      || /\brealistic\b/.test(folded))
    && !mentionsOtherKitWork
    && (/\breplace\b/.test(folded) || /\bfix\b/.test(folded) || /\bmake\b/.test(folded)
      || /\bkeep\s+(?:the\s+)?good\b/.test(folded) || /\baudit\b/.test(folded)
      || /\bcartoons?\b/.test(folded) || /\brealistic\b/.test(folded));
  const imagesOnly = hasExclusiveOnly(folded, imageTopic.source)
    || impliedImageRepair
    || (/\b(?:images?|pictures?|photos?|pics|visuals?)\b/.test(folded)
      && (/\b(?:nothing|anything)\s+else\b/.test(folded)
        || /\b(?:dont|do not|never)\s+change\s+anything\s+else\b/.test(folded)
        || /\bchange\s+nothing\s+else\b/.test(folded)
        || /\bimages?\s+only\b/.test(folded)
        || /\bpictures?\s+only\b/.test(folded)
        || /\bfix\s+activity\s+photos?\s+only\b/.test(folded)));
  const auditImagesOnly = /\baudit\b/.test(folded)
    && /\b(?:images?|pictures?|photos?)\b/.test(folded)
    && (/\bdont\s+replace\b/.test(folded)
      || /\bdo not\s+replace\b/.test(folded)
      || !/\b(?:replace|generate|create|fix|make)\b/.test(folded));
  const vocabWorkEarly = /\bvocab(?:ulary|ularies)?\b/.test(folded)
    && !inExclusionList(folded, "vocab(?:ulary|ularies)?");
  const coverHint = !inExclusionList(folded, "cover")
    && (/\b(?:update|replace|fix|make|change|create)\b.{0,40}\bcover\b/.test(folded)
      || /\brealistic_lesson_cover\b/i.test(raw)
      || /\brealistic\s+lesson\s+cover\b/.test(folded));
  const multiCapability = [
    vocabWorkEarly,
    coverHint,
    positivelyRequested("books?"),
    positivelyRequested("songs?"),
    positivelyRequested("printables?"),
    impliedImageRepair || /\b(?:images?|pictures?|photos?)\b/.test(folded),
  ].filter(Boolean).length > 1;
  const exclusiveImages = exclusiveImageRepairCommand(folded) && !mentionsOtherKitWork;
  const imagesOnlyResolved = exclusiveImages
    ? true
    : (auditImagesOnly || multiCapability ? false : imagesOnly);

  const vocabWork = /\bvocab(?:ulary|ularies)?\b/.test(folded);
  const exclusiveVocabLanguage = /\bvocab(?:ulary|ularies)?\s+only\b/.test(folded)
    || /\bonly\s+(?:the\s+)?vocab/.test(folded)
    || /\bfix\s+(?:the\s+)?vocab/.test(folded)
    || /\bupgrade\s+(?:the\s+)?vocab/.test(folded)
    || /\brepair\s+(?:the\s+)?vocab/.test(folded)
    || /\btarget\s*:\s*vocab/.test(folded)
    || (vocabWork && /\b(?:nothing|anything)\s+else\b/.test(folded) && !/\b(?:images?|pictures?|photos?|cover|printables?)\b/.test(folded));
  const vocabOnly = vocabWork
    && exclusiveVocabLanguage
    && !multiCapability
    && !positivelyRequested("images?")
    && !positivelyRequested("pictures?")
    && !positivelyRequested("photos?")
    && !coverHint;
  const printablesOnly = /\bprintables?\s+only\b/.test(folded)
    || (/\bprintables?\b/.test(folded) && /\b(?:dont|do not)\s+change\s+(?:the\s+)?(?:lesson\s+)?text\b/.test(folded)
      && !/\bimages?\b/.test(folded));

  const keepGoodImages = /\bkeep\s+(?:the\s+)?good\b/.test(folded)
    || /\bdont\s+replace\s+(?:the\s+)?good\b/.test(folded)
    || /\bleave\s+(?:those|the)\s+(?:good\s+)?pictures?\s+alone\b/.test(folded);
  const replaceBadImages = /\breplace\s+(?:the\s+)?(?:bad|cartoon|generic|fake|weak)\b/.test(folded)
    || /\bfix\s+(?:the\s+)?(?:bad|cartoon|weak)\b/.test(folded)
    || /\bregenerate\s+(?:the\s+)?(?:weak|bad|remaining)\b/.test(folded)
    || /\bweak(?:est)?\s+(?:remaining\s+)?activity\s+(?:images?|pictures?|photos?)\b/.test(folded)
    || /\bno\s+cartoons?\b/.test(folded)
    || /\brealistic\b/.test(folded);
  const generateMissingImages = /\bmissing\b/.test(folded) && /\b(?:images?|pictures?|photos?)\b/.test(folded);

  const exclude = {
    printables: inExclusionList(folded, "printables?")
      || imagesOnlyResolved
      || vocabOnly,
    songs: inExclusionList(folded, "songs?") || imagesOnlyResolved || vocabOnly,
    books: inExclusionList(folded, "books?") || imagesOnlyResolved || vocabOnly,
    vocabulary: inExclusionList(folded, "vocab(?:ulary)?")
      || imagesOnlyResolved,
    text: /\bdont\s+change\s+(?:lesson\s+)?text\b/.test(folded)
      || /\bno\s+text\s+changes?\b/.test(folded)
      || /\bdont\s+change\s+lesson\s+content\b/.test(folded)
      || inExclusionList(folded, "(?:activity\\s+)?text")
      || inExclusionList(folded, "(?:weekly\\s+)?content")
      || imagesOnlyResolved,
    activities: /\bdont\s+upgrade\s+activities\b/.test(folded)
      || /\bdont\s+change\s+activity\s+(?:text|content)\b/.test(folded)
      || inExclusionList(folded, "activity\\s+(?:text|content)")
      || imagesOnlyResolved
      || vocabOnly,
    cover: inExclusionList(folded, "cover")
      || (imagesOnlyResolved && !/\bcover\b/.test(folded)),
    publish: /\bdont\s+publ/.test(folded)
      || /\bdo not publ/.test(folded)
      || /\bnever\s+(?:auto[\s-]?)?publish\b/.test(folded)
      || /\bdo not publish\b/i.test(raw)
      || /\bdon['’]?t\s+publish\b/i.test(raw),
  };

  const coverRequested = (/\b(?:update|replace|fix|make|change|create)\b.{0,40}\bcover\b/.test(folded)
    || /\bcover\s+too\b/.test(folded)
    || /\brealistic\s+cover\b/.test(folded)
    || /\brealistic_lesson_cover\b/i.test(raw)
    || /\brealistic\s+lesson\s+cover\b/.test(folded))
    && !exclude.cover;

  const publishRequested = /\bpublish\s+(?:everything|now|all|automatically)\b/.test(folded)
    && !exclude.publish;
  const publishConflict = exclude.publish && /\bpublish\s+(?:everything|now|all)\b/.test(folded);

  const fullKitRequested = (/\bfull\s+teaching\s+kit\b/.test(folded)
    || /\bfix\s+.+\s+completely\b/.test(folded)
    || /\bupgrade\s+the\s+whole\s+teaching\s+kit\b/.test(folded)
    || /\bupgrade\s+the\s+existing\b/.test(folded)
    || /\beverything\s+missing\b/.test(folded)
    || (multiCapability && /\bsave\s+directly\s+to\s+the\s+editable\s+draft\b/.test(folded)))
    && !imagesOnlyResolved
    && !vocabOnly
    && !printablesOnly
    && !/\bnothing\s+else\b/.test(folded);

  const collection = /\b(?:all|my|our|published)\s+free\b/.test(folded)
    || /\bfree\s+(?:lessons?|plans?|curriculum|lesson)\b/.test(folded)
    || /\bpublished\s+free\b/.test(folded)
    || /\bpublished\s+free\b/i.test(raw)
    || /\bfree\s+lesson[\s-]?plans?\b/i.test(raw)
    || /\bmy\s+free\b/i.test(raw);

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
    keepGoodImages,
    replaceBadImages,
    generateMissingImages,
    coverRequested,
    exclude,
    publishRequested,
    publishConflict,
    fullKitRequested,
    collection,
    sameAsPrevious,
    doTheSame,
    ambiguousBare,
    metaInstruction: isMetaInstruction(raw, folded)
      || /\buse the following example\b/.test(folded)
      || /\bdont\s+run\s+it\b/.test(folded)
      || /\bdo not\s+run\s+it\b/.test(folded),
    imageWork: /\b(?:images?|pictures?|photos?|pics|visuals?|cartoons?)\b/.test(folded),
    realistic: /\brealistic\b/.test(folded) || /\breal\b/.test(folded),
    noCartoons: /\bno\s+cartoons?\b/.test(folded) || /\bcartoons?\b/.test(folded),
  };
}

module.exports = {
  SEMANTIC_VERSION,
  extractSignals,
  extractExampleSpan,
  foldCommandText: lexicon.foldCommandText,
};
