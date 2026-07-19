/**
 * Flexible learning-domain matching for curriculum imports.
 * Flexible on read (synonyms / casing / combined phrases); consistent on save
 * (official Little Learner Hub domain labels only).
 */
(function curriculumLearningDomainsModule() {
  const OFFICIAL_LEARNING_DOMAINS = [
    "Social Emotional",
    "Language & Literacy",
    "Math",
    "Science",
    "Physical Development",
    "Creative Arts",
  ];

  /** Built-in pasted wording → official domain. Keys must be normalizeImportToken() results. */
  const BUILTIN_DOMAIN_ALIASES = {
    math: "Math",
    maths: "Math",
    mathematics: "Math",
    "early math": "Math",
    "early mathematics": "Math",
    numbers: "Math",
    counting: "Math",
    "number skills": "Math",
    numeracy: "Math",
    "number recognition": "Math",
    sorting: "Math",
    patterns: "Math",
    pattern: "Math",
    measurement: "Math",
    measuring: "Math",
    "cognitive math": "Math",
    "math and counting": "Math",

    science: "Science",
    stem: "Science",
    discovery: "Science",
    investigation: "Science",
    investigating: "Science",
    nature: "Science",
    experimenting: "Science",
    experiment: "Science",
    "stem discovery": "Science",
    "science discovery": "Science",

    language: "Language & Literacy",
    literacy: "Language & Literacy",
    reading: "Language & Literacy",
    vocabulary: "Language & Literacy",
    books: "Language & Literacy",
    "pre literacy": "Language & Literacy",
    "pre-literacy": "Language & Literacy",
    "language literacy": "Language & Literacy",
    "literacy language": "Language & Literacy",
    "language and literacy": "Language & Literacy",
    "literacy and language": "Language & Literacy",
    "early literacy": "Language & Literacy",
    communication: "Language & Literacy",

    "fine motor": "Physical Development",
    "fine motors": "Physical Development",
    "small muscles": "Physical Development",
    "hand strength": "Physical Development",
    grasping: "Physical Development",
    cutting: "Physical Development",
    writing: "Physical Development",
    "gross motor": "Physical Development",
    "large motor": "Physical Development",
    "outdoor play": "Physical Development",
    "physical development": "Physical Development",
    "physical development motor": "Physical Development",
    "gross motor movement": "Physical Development",
    physical: "Physical Development",
    motor: "Physical Development",

    "social emotional": "Social Emotional",
    "social-emotional": "Social Emotional",
    sel: "Social Emotional",
    feelings: "Social Emotional",
    friendship: "Social Emotional",
    "self regulation": "Social Emotional",
    "self-regulation": "Social Emotional",
    social: "Social Emotional",
    "social emotional learning": "Social Emotional",

    art: "Creative Arts",
    arts: "Creative Arts",
    creative: "Creative Arts",
    "creative arts": "Creative Arts",
    painting: "Creative Arts",
    crafts: "Creative Arts",
    "process art": "Creative Arts",
    music: "Creative Arts",
    "music movement": "Creative Arts",
    "music and movement": "Creative Arts",
    rhythm: "Creative Arts",
    "dramatic play": "Creative Arts",
    "pretend play": "Creative Arts",
    "role play": "Creative Arts",
    sensory: "Creative Arts",
    "sensory play": "Creative Arts",
    exploration: "Creative Arts",
  };

  /** Ambiguous tokens → choices (do not auto-pick). */
  const AMBIGUOUS_DOMAIN_TOKENS = {
    movement: ["Physical Development", "Creative Arts"],
  };

  function normalizeImportToken(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[/_]+/g, " ")
      .replace(/[-–—]+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitCombinedDomainText(text, aliasMap = null) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const map = aliasMap || buildAliasMap();
    // Split lists, then "A and B" / "A & B" / "A/B" pairs when both sides look like domains.
    const chunks = raw
      .split(/[,;\n|]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const out = [];
    chunks.forEach((chunk) => {
      const normalized = normalizeImportToken(chunk);
      if (!normalized) return;
      // Prefer whole-phrase matches ("music and movement", "literacy language") before splitting.
      if (map[normalized] || AMBIGUOUS_DOMAIN_TOKENS[normalized]) {
        out.push(normalized);
        return;
      }
      const slashParts = normalized.split(/\s+/).filter(Boolean);
      // "literacy language" / "language literacy" style two-word pairs from Literacy/Language
      if (slashParts.length === 2 && map[slashParts[0]] && map[slashParts[1]] && map[slashParts[0]] !== map[slashParts[1]]) {
        slashParts.forEach((part) => out.push(part));
        return;
      }
      if (slashParts.length === 2 && map[slashParts.join(" ")]) {
        out.push(slashParts.join(" "));
        return;
      }
      const andParts = normalized.split(/\s+and\s+/).map((p) => p.trim()).filter(Boolean);
      if (andParts.length > 1 && andParts.every((p) => (map[p] || AMBIGUOUS_DOMAIN_TOKENS[p]) && p.length >= 3 && p.length <= 40)) {
        andParts.forEach((part) => out.push(part));
        return;
      }
      out.push(normalized);
    });
    return out;
  }

  function levenshtein(a, b) {
    const s = String(a || "");
    const t = String(b || "");
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    const rows = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
    for (let i = 0; i <= s.length; i += 1) rows[i][0] = i;
    for (let j = 0; j <= t.length; j += 1) rows[0][j] = j;
    for (let i = 1; i <= s.length; i += 1) {
      for (let j = 1; j <= t.length; j += 1) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + cost,
        );
      }
    }
    return rows[s.length][t.length];
  }

  function buildAliasMap(extraSynonyms = []) {
    const map = { ...BUILTIN_DOMAIN_ALIASES };
    OFFICIAL_LEARNING_DOMAINS.forEach((domain) => {
      map[normalizeImportToken(domain)] = domain;
    });
    (Array.isArray(extraSynonyms) ? extraSynonyms : []).forEach((rule) => {
      if (!rule || rule.disabled) return;
      const from = normalizeImportToken(rule.from || rule.pasted || rule.wording);
      const to = String(rule.to || rule.official || rule.saveAs || "").trim();
      if (!from || !OFFICIAL_LEARNING_DOMAINS.includes(to)) return;
      map[from] = to;
    });
    return map;
  }

  /**
   * @returns {{
   *   domains: string[],
   *   mappings: Array<{ original, token, official, confidence, choices?, note }>,
   *   unmatched: Array<{ original, token, choices }>
   * }}
   */
  function resolveLearningDomainsWithConfidence(text, { synonyms = [] } = {}) {
    const aliasMap = buildAliasMap(synonyms);
    const seen = new Set();
    const domains = [];
    const mappings = [];
    const unmatched = [];
    const originals = String(text || "")
      .split(/[,;\n|]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const processToken = (token, original) => {
      if (!token) return;
      if (AMBIGUOUS_DOMAIN_TOKENS[token] && !aliasMap[token]) {
        unmatched.push({
          original,
          token,
          choices: AMBIGUOUS_DOMAIN_TOKENS[token],
        });
        mappings.push({
          original,
          token,
          official: "",
          confidence: "low",
          choices: AMBIGUOUS_DOMAIN_TOKENS[token],
          note: `"${original}" could mean more than one learning domain. Please choose.`,
        });
        return;
      }

      let official = aliasMap[token] || "";
      let confidence = official ? "high" : "";
      let note = "";

      if (!official) {
        // Fuzzy: close spelling to an alias key or official label
        let best = null;
        let bestDist = Infinity;
        Object.keys(aliasMap).forEach((key) => {
          if (Math.abs(key.length - token.length) > 2) return;
          const dist = levenshtein(token, key);
          if (dist < bestDist && dist <= 2) {
            bestDist = dist;
            best = aliasMap[key];
          }
        });
        if (best) {
          official = best;
          confidence = bestDist === 0 ? "high" : "medium";
          note = bestDist
            ? `"${original}" was mapped to "${official}" (close spelling).`
            : `"${original}" was mapped to "${official}".`;
        }
      } else if (normalizeImportToken(official) !== token) {
        confidence = "high";
        note = `"${original}" was mapped to "${official}".`;
      } else {
        confidence = "high";
        note = `"${original}" matched "${official}".`;
      }

      if (!official) {
        // Partial contains match against official names (e.g. "early math skills")
        const containsHit = OFFICIAL_LEARNING_DOMAINS.find((domain) => {
          const d = normalizeImportToken(domain);
          return token.includes(d) || d.includes(token);
        });
        if (containsHit && token.length >= 4) {
          official = containsHit;
          confidence = "medium";
          note = `"${original}" was mapped to "${official}" (related wording). Review recommended.`;
        }
      }

      if (!official) {
        unmatched.push({ original, token, choices: [...OFFICIAL_LEARNING_DOMAINS] });
        mappings.push({
          original,
          token,
          official: "",
          confidence: "low",
          choices: [...OFFICIAL_LEARNING_DOMAINS],
          note: `"${original}" could not be matched. Original text preserved for review.`,
        });
        return;
      }

      mappings.push({
        original,
        token,
        official,
        confidence: confidence || "high",
        note: note || `"${original}" → ${official}`,
      });
      if (!seen.has(official)) {
        seen.add(official);
        domains.push(official);
      }
    };

    if (!originals.length && String(text || "").trim()) {
      splitCombinedDomainText(text, aliasMap).forEach((token) => processToken(token, text));
    } else {
      originals.forEach((original) => {
        const tokens = splitCombinedDomainText(original, aliasMap);
        if (tokens.length > 1) {
          tokens.forEach((token) => processToken(token, original));
        } else {
          processToken(tokens[0] || normalizeImportToken(original), original);
        }
      });
    }

    return { domains: domains.slice(0, 6), mappings, unmatched };
  }

  function parseLearningDomainsList(text, options = {}) {
    return resolveLearningDomainsWithConfidence(text, options).domains;
  }

  const api = {
    OFFICIAL_LEARNING_DOMAINS,
    BUILTIN_DOMAIN_ALIASES,
    normalizeImportToken,
    splitCombinedDomainText,
    resolveLearningDomainsWithConfidence,
    parseLearningDomainsList,
    buildAliasMap,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.CurriculumLearningDomains = api;
  }
})();
