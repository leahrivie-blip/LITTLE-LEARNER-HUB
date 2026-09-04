/**
 * Small capability lexicon for typo-tolerant token folding.
 * This is NOT a lesson-title dictionary and not a giant misspelling list.
 */
"use strict";

const CAPABILITY_TOKENS = Object.freeze([
  "image", "images", "picture", "pictures", "pics", "photo", "photos", "visual", "visuals",
  "cartoon", "cartoons", "realistic", "real", "generic", "fake",
  "activity", "activities", "lesson", "lessons", "plan", "plans", "curriculum",
  "free", "pro",
  "infant", "toddler", "preschool",
  "publish", "published", "publishing", "review",
  "printable", "printables",
  "vocabulary", "vocab", "word", "words",
  "song", "songs", "book", "books", "cover",
  "keep", "replace", "fix", "upgrade", "audit", "change", "touch", "leave",
  "only", "except", "nothing", "else", "anything", "everything",
  "dont", "never", "not",
  "good", "bad", "missing",
  "text", "content",
]);

function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  const cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = cur[j];
  }
  return prev[t.length];
}

const SHORT_FOLDS = Object.freeze({
  els: "else",
  teh: "the",
  fre: "free",
  pic: "picture",
  pics: "pictures",
  dont: "dont",
  doesnt: "dont",
  kepp: "keep",
});

function foldToken(rawToken) {
  const token = String(rawToken || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!token) return "";
  if (SHORT_FOLDS[token]) return SHORT_FOLDS[token];
  if (CAPABILITY_TOKENS.includes(token)) return token;
  // Short common words must not fuzzy-match into capability tokens (make→fake, look→book).
  if (token.length < 5) return token;
  const maxDist = token.length <= 5 ? 1 : 2;
  let best = token;
  let bestDist = maxDist + 1;
  CAPABILITY_TOKENS.forEach((word) => {
    const dist = levenshtein(token, word);
    if (dist < bestDist && dist <= maxDist) {
      best = word;
      bestDist = dist;
    }
  });
  return best;
}

function foldCommandText(rawCommand) {
  return String(rawCommand || "")
    .replace(/[’']/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => {
      const folded = foldToken(part);
      return folded || part;
    })
    .join(" ");
}

module.exports = {
  CAPABILITY_TOKENS,
  levenshtein,
  foldToken,
  foldCommandText,
};
