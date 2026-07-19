/**
 * V4 Smart Import helpers — synonym maps, inference, and flexible section parsing.
 * Loaded after curriculum-lesson-import-parser.js and patches CurriculumLessonImportParser.
 */
(function curriculumLessonImportV4Module() {
  function getBaseApi() {
    if (typeof module !== "undefined" && module.exports && !globalThis.__llhImportParserForV4) {
      // Node: require base once
      try {
        // eslint-disable-next-line global-require
        return require("./curriculum-lesson-import-parser.js");
      } catch {
        return globalThis.CurriculumLessonImportParser || null;
      }
    }
    return globalThis.CurriculumLessonImportParser || null;
  }

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

  const V4_LESSON_FIELD_SYNONYMS = {
    TITLE: ["title", "lesson title", "lesson plan title", "plan title", "name"],
    AGE_GROUP: ["age group", "age", "ages", "age range", "age band", "developmental age"],
    THEME: ["theme", "unit", "unit theme", "weekly theme", "focus", "topic"],
    PLAN: ["plan", "access", "plan type", "membership", "tier", "pricing"],
    STATUS: ["status", "publish status", "visibility"],
    LEARNING_DOMAINS: [
      "learning domains",
      "domains",
      "developmental domains",
      "learning areas",
      "domain",
      "skill area",
      "developmental area",
      "learning domain",
    ],
    WEEKLY_OVERVIEW: [
      "weekly overview",
      "theme overview",
      "theme summary",
      "about this theme",
      "introduction",
      "overview",
      "week overview",
      "about this week",
      "big idea",
      "weekly summary",
    ],
    LEARNING_OBJECTIVES: [
      "learning objectives",
      "learning goals",
      "objectives",
      "educational goals",
      "what children will learn",
      "weekly objectives",
      "goals for the week",
      "children will",
    ],
    WEEKLY_MATERIALS: [
      "weekly materials",
      "materials list",
      "materials needed",
      "needed materials",
      "supplies",
      "prep materials",
      "materials",
    ],
    VOCABULARY: ["vocabulary", "vocab", "weekly vocabulary", "key vocabulary", "words to know"],
    BOOKS: ["books", "read alouds", "read-alouds", "story books", "recommended books", "literature"],
    SONGS: ["songs", "music", "music and songs", "music & songs", "fingerplays", "rhymes", "chants"],
    FAMILY_CONNECTION: [
      "family connection",
      "family engagement",
      "at home activity",
      "home extension",
      "parent connection",
      "family extension",
      "send home",
      "home connection",
    ],
    OBSERVATION_OPPORTUNITIES: [
      "observation opportunities",
      "assessment ideas",
      "observe for",
      "what to watch for",
      "observations",
      "assessment opportunities",
      "assessment",
      "teacher notes",
      "look fors",
      "look-fors",
    ],
    ADAPTATIONS: [
      "adaptations",
      "modifications",
      "differentiation",
      "supports",
      "accommodations",
      "support strategies",
    ],
  };

  const V4_DAY_FIELD_SYNONYMS = {
    THEME: [
      "daily theme",
      "day theme",
      "focus",
      "theme",
      "today's focus",
      "day focus",
      "daily_theme",
    ],
    OBJECTIVES: [
      "daily objectives",
      "day objectives",
      "objectives",
      "goals",
      "learning goals",
      "daily_objectives",
    ],
    LEARNING_DOMAINS: ["learning domains", "domains", "daily domains", "daily learning domains", "daily_learning_domains"],
    MATERIALS: ["daily materials", "materials", "supplies", "materials needed", "daily_materials"],
    VOCABULARY: ["daily vocabulary", "vocabulary", "vocab", "words", "daily_vocabulary"],
    BOOKS: ["books", "read aloud", "read-aloud", "story"],
    SONGS: ["songs", "music", "fingerplays"],
    CIRCLE_TIME: ["circle time", "morning meeting", "group time", "opening circle", "circle", "circle_time"],
    TRANSITIONS: ["transitions", "transition songs", "transition ideas"],
    OUTDOOR_PLAY: ["outdoor play", "outdoors", "outside play", "playground", "outdoor", "outdoor_play"],
    FAMILY_CONNECTION: ["family connection", "home connection", "family engagement", "at home"],
    OBSERVATIONS: [
      "observations",
      "observe for",
      "what to watch for",
      "assessment ideas",
      "daily observations",
      "daily_observations",
      "observation opportunities",
    ],
    ADAPTATIONS: [
      "adaptations",
      "modifications",
      "supports",
      "accommodations",
      "support strategies",
      "daily adaptations",
      "daily_adaptations",
    ],
    SAFETY_NOTES: ["safety notes", "safety", "safety reminders", "safety_notes"],
  };

  const V4_ACTIVITY_FIELD_SYNONYMS = {
    ACTIVITY_NAME: [
      "activity name",
      "activity",
      "activity title",
      "center activity",
      "name",
      "center",
      "station",
    ],
    CATEGORY: ["category", "activity type", "type", "center type"],
    OBJECTIVE: ["objective", "goal", "purpose"],
    DESCRIPTION: [
      "description",
      "overview",
      "about",
      "summary",
      "what children will do",
      "what kids will do",
    ],
    MATERIALS: ["materials", "supplies", "you will need", "items needed", "needed items"],
    SETUP: ["setup", "set up", "preparation", "prep", "prepare"],
    TEACHER_ROLE: [
      "teacher role",
      "teacher tips",
      "teacher notes",
      "teacher support",
      "educator role",
      "facilitator role",
      "adult role",
    ],
    DIRECTIONS: [
      "directions",
      "steps",
      "instructions",
      "how to",
      "procedure",
      "how it works",
    ],
    LEARNING_GOALS: [
      "learning goals",
      "goals",
      "learning outcomes",
      "skills",
      "skills practiced",
    ],
    OBSERVATION_OPPORTUNITIES: ["observation opportunities", "observe for", "what to watch for"],
    VOCABULARY: ["vocabulary", "vocab"],
    EXTENSIONS: ["extensions", "extend the learning", "enrichment"],
    ADAPTATIONS: ["adaptations", "modifications", "accommodations", "support strategies"],
    SAFETY_NOTES: ["safety notes", "safety"],
    TEACHER_LANGUAGE: ["teacher language", "language prompts", "talking points"],
    AGE_MODIFICATIONS: ["age modifications", "age adaptations"],
    LEARNING_DOMAINS: ["learning domains", "domains"],
  };

  const CATEGORY_INFERENCE_RULES = [
    { category: "Fine Motor", patterns: [/play\s*-?\s*dough|playdoh|tweezers|beading|threading|pegboard|scissors|cutting|pinch|pincer|lacing|clothespin/i] },
    { category: "Art", patterns: [/paint(?:ing)?|crayon|collage|marker|stamp(?:ing)?|glitter|draw(?:ing)?|watercolor|coloring/i] },
    { category: "Gross Motor", patterns: [/obstacle\s*course|hop(?:ping)?|jump(?:ing)?|balance\s*beam|crawl(?:ing)?|run(?:ning)?|throw(?:ing)?|kick(?:ing)?|yoga|movement\s*path|relay/i] },
    { category: "STEM/Discovery", patterns: [/science\s*experiment|magnet|sink\s*(?:or|&)\s*float|measure|count(?:ing)?|engineer|build(?:ing)?|hypothesis|observe\s*and\s*record|stem|sort(?:ing)?/i] },
    { category: "Sensory Play", patterns: [/water\s*table|sand\s*table|sensory\s*bin|sensory\s*play|rice\s*bin|oobleck|slime|texture/i] },
    { category: "Dramatic Play", patterns: [/pretend|dramatic\s*play|restaurant|kitchen|doctor\s*office|role\s*-?\s*play|dress\s*-?\s*up|puppet|clinic|shop|cashier/i] },
    { category: "Outdoor Play", patterns: [/nature\s*walk|outdoor|playground|garden(?:ing)?|sidewalk\s*chalk|outside/i] },
    { category: "Music & Movement", patterns: [/music\s*game|sing(?:ing)?|dance|rhythm|instrument|freeze\s*dance|song\s*and\s*move|song\s*circle/i] },
    { category: "Circle Time", patterns: [/circle\s*time|morning\s*meeting|group\s*time|calendar\s*time|greeting\s*song|celebration\s*circle/i] },
    { category: "Literacy", patterns: [/read\s*aloud|letter\s*hunt|phonics|story\s*retell|name\s*writing|alphabet|book\s*walk|shared\s*reading|story\s*time|journal/i] },
  ];

  function normalizeKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[_/]+/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildSynonymLookup(synonymMap) {
    const lookup = new Map();
    Object.entries(synonymMap).forEach(([canonical, synonyms]) => {
      lookup.set(normalizeKey(canonical), canonical);
      (synonyms || []).forEach((syn) => lookup.set(normalizeKey(syn), canonical));
    });
    return lookup;
  }

  const LESSON_LOOKUP = buildSynonymLookup(V4_LESSON_FIELD_SYNONYMS);
  const DAY_LOOKUP = buildSynonymLookup(V4_DAY_FIELD_SYNONYMS);
  const ACTIVITY_LOOKUP = buildSynonymLookup(V4_ACTIVITY_FIELD_SYNONYMS);

  function preserveMultilineText(value, max = 12000) {
    return String(value || "").replace(/\r\n?/g, "\n").replace(/\s+$/gm, "").slice(0, max);
  }

  function normalizedShortText(value, max = 240) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function headingToField(rawHeading, lookup) {
    let key = normalizeKey(rawHeading);
    key = key.replace(/^(the|a|an)\s+/, "");
    if (lookup.has(key)) return lookup.get(key);
    // fuzzy: synonym contained in heading or vice versa
    for (const [syn, canonical] of lookup.entries()) {
      if (key === syn) return canonical;
      if (key.includes(syn) && syn.length >= 4) return canonical;
      if (syn.includes(key) && key.length >= 5) return canonical;
    }
    return "";
  }

  function detectWeekdayHeader(line) {
    const trimmed = String(line || "").trim()
      .replace(/^#+\s*/, "")
      .replace(/\*+/g, "")
      .replace(/:$/, "")
      .trim();
    const map = {
      monday: "monday", mon: "monday",
      tuesday: "tuesday", tue: "tuesday", tues: "tuesday",
      wednesday: "wednesday", wed: "wednesday",
      thursday: "thursday", thu: "thursday", thur: "thursday", thurs: "thursday",
      friday: "friday", fri: "friday",
    };
    const lower = trimmed.toLowerCase();
    if (map[lower]) return map[lower];
    const dayN = lower.match(/^day\s*([1-5])\b/);
    if (dayN) return WEEKDAYS[Number(dayN[1]) - 1];
    const named = lower.match(/^(monday|tuesday|wednesday|thursday|friday)\b/);
    if (named) return named[1];
    return "";
  }

  function isActivityStartLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return false;
    if (/^---+\s*activity\s*---+$/i.test(trimmed)) return true;
    if (/^#{1,3}\s*activity\b/i.test(trimmed)) return true;
    if (/^(activity(?:\s+(?:name|title))?|center(?:\s+activity)?|station)\s*[:\-–]/i.test(trimmed)) return true;
    if (/^activity\s+\d+\s*[:\-–.]/i.test(trimmed)) return true;
    // Bare activity heading with title on same line: "Activity Wave Water Table"
    if (/^activity(?:\s+(?:name|title))?\s+[A-Za-z0-9].{2,80}$/i.test(trimmed) && !/^(activity(?:\s+(?:name|title))?)$/i.test(trimmed)) {
      return true;
    }
    return false;
  }

  function isBareFieldHeading(line, lookup) {
    const trimmed = String(line || "").trim()
      .replace(/^#+\s*/, "")
      .replace(/^\*\*?/, "")
      .replace(/\*\*?$/, "")
      .replace(/:$/, "")
      .trim();
    if (!trimmed || trimmed.length > 60) return "";
    if (/[.!?]$/.test(trimmed)) return "";
    if (trimmed.split(/\s+/).length > 6) return "";
    const key = normalizeKey(trimmed);
    if (!key) return "";
    // Prefer exact synonym hits so prose lines are not swallowed.
    if (lookup.has(key)) return lookup.get(key);
    // ALL_CAPS / Title-Case short labels that fuzzy-match a known field.
    const looksLikeLabel = /^[A-Za-z][A-Za-z0-9_/ &-]{1,58}$/.test(trimmed);
    if (!looksLikeLabel) return "";
    const fuzzy = headingToField(trimmed, lookup);
    if (!fuzzy) return "";
    // Require the synonym itself to be mostly the heading (avoid "About the ocean" → DESCRIPTION).
    for (const [syn, canonical] of lookup.entries()) {
      if (canonical !== fuzzy) continue;
      if (key === syn) return canonical;
      if (syn.length >= 4 && (key === syn || Math.abs(key.length - syn.length) <= 2) && (key.includes(syn) || syn.includes(key))) {
        return canonical;
      }
    }
    return "";
  }

  function splitFlexibleWeekdaySections(text) {
    const lines = String(text || "").split(/\r?\n/);
    const lessonLines = [];
    const daySections = Object.fromEntries(WEEKDAYS.map((day) => [day, []]));
    let currentDay = "";
    lines.forEach((line, index) => {
      const day = detectWeekdayHeader(line);
      // Only treat as weekday header when the line is mostly just the day name
      // or "Day N" / markdown heading for that day.
      const compact = String(line || "").trim().replace(/^#+\s*/, "").replace(/:$/, "").trim();
      const isHeader = day && (
        /^(monday|tuesday|wednesday|thursday|friday|mon|tue|tues|wed|thu|thur|thurs|fri|day\s*[1-5])\b/i.test(compact)
        && compact.length <= 24
      );
      if (isHeader) {
        currentDay = day;
        return;
      }
      if (currentDay) daySections[currentDay].push({ line: index + 1, text: line });
      else lessonLines.push({ line: index + 1, text: line });
    });
    return {
      lessonBody: lessonLines.map((entry) => entry.text).join("\n"),
      daySections: Object.fromEntries(WEEKDAYS.map((day) => [day, daySections[day].map((e) => e.text).join("\n")])),
      dayLineOffsets: Object.fromEntries(WEEKDAYS.map((day) => [day, daySections[day][0]?.line || null])),
    };
  }

  function parseFlexibleFieldBlock(text, lookup, { lineOffset = 1, context = "" } = {}) {
    const fields = {};
    const unmapped = [];
    const lines = String(text || "").split(/\r?\n/);
    let currentField = "";
    let currentLines = [];

    const flush = () => {
      if (!currentField) return;
      const value = preserveMultilineText(currentLines.join("\n"));
      if (fields[currentField]) fields[currentField] = preserveMultilineText(`${fields[currentField]}\n${value}`);
      else fields[currentField] = value;
      currentField = "";
      currentLines = [];
    };

    const tryHeader = (raw) => {
      const cleaned = String(raw || "")
        .replace(/^#+\s*/, "")
        .replace(/^\*\*?/, "")
        .replace(/\*\*?$/, "")
        .replace(/:$/, "")
        .trim();
      return headingToField(cleaned, lookup);
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentField) currentLines.push(line);
        return;
      }

      // Markdown ## Heading
      const md = trimmed.match(/^#{1,3}\s+(.+)$/);
      if (md) {
        const canonical = tryHeader(md[1]);
        if (canonical) {
          flush();
          currentField = canonical;
          return;
        }
      }

      // LABEL: or LABEL: value
      const emptyField = trimmed.match(/^([A-Za-z][A-Za-z0-9_/ &-]{0,60}):\s*$/);
      if (emptyField) {
        const canonical = tryHeader(emptyField[1]);
        if (canonical) {
          flush();
          currentField = canonical;
          return;
        }
      }
      const inlineField = trimmed.match(/^([A-Za-z][A-Za-z0-9_/ &-]{0,60}):\s+(.+)$/);
      if (inlineField) {
        const canonical = tryHeader(inlineField[1]);
        if (canonical) {
          flush();
          fields[canonical] = preserveMultilineText(inlineField[2]);
          currentField = "";
          currentLines = [];
          return;
        }
      }

      // Bold markdown **Label**
      const bold = trimmed.match(/^\*\*([^*]+)\*\*\s*:?\s*(.*)$/);
      if (bold) {
        const canonical = tryHeader(bold[1]);
        if (canonical) {
          flush();
          if (bold[2]) {
            fields[canonical] = preserveMultilineText(bold[2]);
            currentField = "";
            currentLines = [];
          } else {
            currentField = canonical;
          }
          return;
        }
      }

      // Bare heading without colon (ChatGPT / freeform pastes): "TITLE", "Theme Overview", "Materials"
      const bareCanonical = isBareFieldHeading(trimmed, lookup);
      if (bareCanonical) {
        flush();
        currentField = bareCanonical;
        return;
      }

      if (currentField) {
        currentLines.push(line);
        return;
      }

      unmapped.push({
        line: lineOffset + index,
        text: line,
        reason: "unrecognized_line",
        context,
      });
    });
    flush();
    return { fields, unmapped };
  }

  function splitFlexibleDayActivities(dayContent) {
    const content = String(dayContent || "");
    if (!content.trim()) return [];
    // Prefer ACTIVITY_NAME / Activity Title / Center Activity style splits first
    const activityHeaderRe = /^(?:ACTIVITY[_ ]NAME|Activity Name|Activity Title|Center Activity|Activity)\s*:/im;
    if (activityHeaderRe.test(content)) {
      return content
        .split(/(?=^(?:ACTIVITY[_ ]NAME|Activity Name|Activity Title|Center Activity|Activity)\s*:)/im)
        .map((block) => block.trim())
        .filter((block) => activityHeaderRe.test((block.split(/\r?\n/)[0] || "").trim()));
    }
    const lines = content.split(/\r?\n/);
    const blocks = [];
    let current = [];
    const flush = () => {
      const block = current.join("\n").trim();
      if (block) blocks.push(block);
      current = [];
    };
    lines.forEach((line) => {
      if (isActivityStartLine(line) && current.length) {
        flush();
        current.push(line);
        return;
      }
      if (isActivityStartLine(line) && !current.length) {
        current.push(line);
        return;
      }
      current.push(line);
    });
    flush();
    // If no activity markers, treat whole remaining content as non-activity (handled by day fields)
    if (blocks.length === 1 && !isActivityStartLine(blocks[0].split(/\r?\n/)[0] || "")) {
      return [];
    }
    return blocks.filter((block) => {
      const first = (block.split(/\r?\n/)[0] || "").trim();
      return isActivityStartLine(first) || /activity/i.test(first);
    });
  }

  function inferActivityCategory(activity = {}, baseApi) {
    const haystack = [
      activity.title,
      activity.description,
      activity.materials,
      activity.steps,
      activity.objective,
    ].join(" ");
    for (const rule of CATEGORY_INFERENCE_RULES) {
      if (rule.patterns.some((re) => re.test(haystack))) return rule.category;
    }
    if (baseApi?.normalizeActivityCategory) {
      const fromTitle = baseApi.normalizeActivityCategory(activity.title || "");
      if (fromTitle) return fromTitle;
    }
    return "Open-Ended Exploration";
  }

  function inferPlanType(text, explicit) {
    const raw = normalizedShortText(explicit);
    if (/^pro$/i.test(raw)) return { plan: "Pro", inferred: false };
    if (/^free$/i.test(raw)) return { plan: "Free", inferred: false };
    if (/premium|members?\s*only|founding|pro\b/i.test(raw)) return { plan: "Pro", inferred: true, from: raw };
    const body = String(text || "");
    if (/\b(premium|members?\s*only|founding\s*member|\bpro\b)\b/i.test(body) && !/\bfree\b/i.test(raw)) {
      // Prefer explicit free if body mentions free more strongly near plan labels
      if (/\bplan\s*[:\-]?\s*free\b/i.test(body) || /\baccess\s*[:\-]?\s*free\b/i.test(body)) {
        return { plan: "Free", inferred: true };
      }
      if (/\bplan\s*[:\-]?\s*(pro|premium|members?\s*only|founding)\b/i.test(body)) {
        return { plan: "Pro", inferred: true };
      }
    }
    if (/\bfree\b/i.test(body) && /\bplan\b/i.test(body)) return { plan: "Free", inferred: true };
    return { plan: "Free", inferred: !raw, defaulted: true };
  }

  function inferAgeFromText(text, explicit, baseApi) {
    if (baseApi?.parseCurriculumImportAgeValue) {
      const fromExplicit = baseApi.parseCurriculumImportAgeValue(explicit || "");
      if (fromExplicit.display) return { ...fromExplicit, inferred: false };
    }
    const body = String(text || "");
    const patterns = [
      { re: /infant\s*0\s*[-–to]+\s*6\s*months?/i, display: "Infant 0–6 Months", bucket: "Infant" },
      { re: /infant\s*6\s*[-–to]+\s*12\s*months?/i, display: "Infant 6–12 Months", bucket: "Infant" },
      { re: /infant\s*0\s*[-–to]+\s*12\s*months?/i, display: "Infant 0–12 Months", bucket: "Infant" },
      { re: /\binfant\b/i, display: "Infant", bucket: "Infant" },
      { re: /toddler\s*12\s*[-–to]+\s*24/i, display: "Toddler 12–24 Months", bucket: "Toddler" },
      { re: /toddler\s*24\s*[-–to]+\s*36/i, display: "Toddler 24–36 Months", bucket: "Toddler" },
      { re: /\btoddler\b/i, display: "Toddler", bucket: "Toddler" },
      { re: /preschool\s*3\s*[-–to]+\s*4/i, display: "Preschool 3–4 Years", bucket: "Preschool" },
      { re: /preschool\s*4\s*[-–to]+\s*5/i, display: "Preschool 4–5 Years", bucket: "Preschool" },
      { re: /\bpreschool\b|\bpre-?k\b/i, display: "Preschool", bucket: "Preschool" },
    ];
    for (const entry of patterns) {
      if (entry.re.test(body)) return { display: entry.display, bucket: entry.bucket, inferred: true };
    }
    return { display: "Preschool", bucket: "Preschool", inferred: true, defaulted: true };
  }

  function parseActivityGoals(text) {
    return String(text || "")
      .split(/\r?\n|;/)
      .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean);
  }

  function parseTextListItems(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
  }

  function extractActivityTitle(fields, block) {
    if (fields.ACTIVITY_NAME) return normalizedShortText(fields.ACTIVITY_NAME);
    const first = String(block || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
    const fromHeader = first
      .replace(/^#+\s*/, "")
      .replace(/^---+/, "")
      .replace(/---+$/, "")
      .replace(/^(activity(?:\s+(?:name|title))?|center(?:\s+activity)?|station)\s*[:\-–]\s*/i, "")
      .replace(/^activity\s+\d+\s*[:\-–.]\s*/i, "")
      .trim();
    return normalizedShortText(fromHeader);
  }

  function parseV4ActivityBlock(block, { dayKey, lineOffset = 1, existingItemIds, generateItemId, baseApi }) {
    const warnings = [];
    const { fields, unmapped } = parseFlexibleFieldBlock(block, ACTIVITY_LOOKUP, {
      lineOffset,
      context: `${dayKey}:activity`,
    });
    const title = extractActivityTitle(fields, block);
    if (!title) {
      return {
        activity: null,
        errors: [],
        warnings: [`${dayKey}: skipped a block without an activity name.`],
        unmapped,
      };
    }

    let category = "";
    let categoryInferred = false;
    if (fields.CATEGORY) {
      category = baseApi?.normalizeActivityCategory?.(fields.CATEGORY) || "";
      if (!category) {
        category = inferActivityCategory({ title, description: fields.DESCRIPTION, materials: fields.MATERIALS, steps: fields.DIRECTIONS }, baseApi);
        categoryInferred = true;
        warnings.push(`${dayKey}: "${title}" had unrecognized CATEGORY "${fields.CATEGORY}" — inferred ${category}.`);
      }
    } else {
      category = inferActivityCategory({
        title,
        description: fields.DESCRIPTION,
        materials: fields.MATERIALS,
        steps: fields.DIRECTIONS || fields.STEPS,
        objective: fields.OBJECTIVE,
      }, baseApi);
      categoryInferred = true;
      warnings.push(`${dayKey}: "${title}" missing CATEGORY — inferred ${category}.`);
    }

    const learningGoals = parseActivityGoals(fields.LEARNING_GOALS);
    if (!fields.DESCRIPTION) warnings.push(`${dayKey}: "${title}" is missing DESCRIPTION.`);
    if (!fields.MATERIALS) warnings.push(`${dayKey}: "${title}" is missing MATERIALS.`);
    if (!fields.DIRECTIONS) warnings.push(`${dayKey}: "${title}" is missing DIRECTIONS.`);
    if (!fields.TEACHER_ROLE) warnings.push(`${dayKey}: "${title}" is missing TEACHER_ROLE.`);
    if (!learningGoals.length) warnings.push(`${dayKey}: "${title}" is missing LEARNING_GOALS.`);

    const itemKey = `${dayKey}:${title.toLowerCase()}`;
    const itemId = (existingItemIds && existingItemIds.get(itemKey)) || (generateItemId ? generateItemId() : `item-${Date.now().toString(16)}`);

    const activity = {
      itemId,
      importKey: "",
      activityCategory: category || "Open-Ended Exploration",
      title,
      objective: preserveMultilineText(fields.OBJECTIVE),
      description: preserveMultilineText(fields.DESCRIPTION),
      learningDomains: [],
      materials: preserveMultilineText(fields.MATERIALS),
      setup: preserveMultilineText(fields.SETUP),
      steps: preserveMultilineText(fields.DIRECTIONS),
      teacherRole: preserveMultilineText(fields.TEACHER_ROLE),
      teacherLanguage: preserveMultilineText(fields.TEACHER_LANGUAGE),
      learningGoals,
      observationOpportunities: preserveMultilineText(fields.OBSERVATION_OPPORTUNITIES),
      vocabulary: preserveMultilineText(fields.VOCABULARY),
      extensions: preserveMultilineText(fields.EXTENSIONS),
      adaptations: preserveMultilineText(fields.ADAPTATIONS),
      safetyNotes: preserveMultilineText(fields.SAFETY_NOTES),
      ageModifications: preserveMultilineText(fields.AGE_MODIFICATIONS),
      _categoryInferred: categoryInferred,
      _domainMappings: [],
    };

    if (fields.LEARNING_DOMAINS) {
      const resolved = resolveDomainsFlexible(fields.LEARNING_DOMAINS, baseApi);
      activity.learningDomains = resolved.domains;
      activity._domainMappings = resolved.mappings;
      resolved.unmatched.forEach((item) => {
        unmapped.push({
          field: "LEARNING_DOMAINS",
          value: item.original,
          note: `Needs review: "${item.original}" was not matched to an official learning domain.`,
        });
        warnings.push(
          `${dayKey}: "${title}" learning domain "${item.original}" needs review — original text preserved.`,
        );
      });
      resolved.mappings
        .filter((m) => m.confidence === "medium" && m.official)
        .forEach((m) => {
          warnings.push(`${dayKey}: "${title}" — ${m.note}`);
        });
    }

    return { activity, errors: [], warnings, unmapped };
  }

  function resolveDomainsFlexible(text, baseApi) {
    if (baseApi?.resolveLearningDomainsWithConfidence) {
      return baseApi.resolveLearningDomainsWithConfidence(text);
    }
    if (baseApi?.parseLearningDomainsList) {
      const domains = baseApi.parseLearningDomainsList(text);
      return {
        domains,
        mappings: domains.map((official) => ({
          original: official,
          token: official.toLowerCase(),
          official,
          confidence: "high",
          note: `"${official}" matched.`,
        })),
        unmatched: [],
      };
    }
    try {
      // eslint-disable-next-line global-require
      const domainsApi = require("./curriculum-learning-domains.js");
      return domainsApi.resolveLearningDomainsWithConfidence(text);
    } catch {
      return { domains: [], mappings: [], unmatched: [{ original: String(text || ""), token: "", choices: [] }] };
    }
  }

  function applyDayFields(dayPlan, fields, baseApi) {
    if (fields.THEME) dayPlan.theme = preserveMultilineText(fields.THEME);
    if (fields.OBJECTIVES) dayPlan.objectives = preserveMultilineText(fields.OBJECTIVES);
    if (fields.MATERIALS) dayPlan.materials = preserveMultilineText(fields.MATERIALS);
    if (fields.VOCABULARY) dayPlan.vocabulary = preserveMultilineText(fields.VOCABULARY);
    if (fields.OUTDOOR_PLAY) dayPlan.outdoorPlay = preserveMultilineText(fields.OUTDOOR_PLAY);
    if (fields.FAMILY_CONNECTION) dayPlan.familyConnection = preserveMultilineText(fields.FAMILY_CONNECTION);
    if (fields.ADAPTATIONS) dayPlan.adaptations = preserveMultilineText(fields.ADAPTATIONS);
    if (fields.SAFETY_NOTES) dayPlan.safetyNotes = preserveMultilineText(fields.SAFETY_NOTES);
    if (fields.CIRCLE_TIME) dayPlan.circleTime = parseTextListItems(fields.CIRCLE_TIME);
    if (fields.TRANSITIONS) dayPlan.transitions = parseTextListItems(fields.TRANSITIONS);
    if (fields.OBSERVATIONS) dayPlan.observations = parseTextListItems(fields.OBSERVATIONS);
    if (fields.BOOKS && baseApi?.parseCurriculumImportListLines) {
      dayPlan.books = baseApi.parseCurriculumImportListLines(fields.BOOKS, { parts: 3 });
    }
    if (fields.SONGS && baseApi?.parseCurriculumImportListLines) {
      dayPlan.songs = baseApi.parseCurriculumImportListLines(fields.SONGS, { parts: 2 });
    }
    if (fields.LEARNING_DOMAINS) {
      const resolved = resolveDomainsFlexible(fields.LEARNING_DOMAINS, baseApi);
      dayPlan.learningDomains = resolved.domains;
      dayPlan._domainMappings = resolved.mappings;
    }
  }

  function computeQualityReport(data, warnings, inferences, { formatVersion = 4, recognizedFields = [] } = {}) {
    const checks = [];
    const push = (ok, label) => checks.push({ ok: Boolean(ok), label });
    push(data.title && data.title !== "Untitled Lesson Plan", "Title");
    push(data.age, "Age group");
    push(data.theme, "Theme");
    push(data.plan, "Plan type");
    push(data.weeklyOverview, "Weekly overview");
    push(data.objectives, "Learning objectives");
    push(data.weeklyMaterials, "Weekly materials");
    push(data.vocabularyWords, "Vocabulary");
    push(data.familyConnection, "Family connection");
    push(data.observationOpportunities, "Observation opportunities");
    push(data.adaptations, "Adaptations");
    push((data.books || []).length, "Books");
    push((data.songs || []).length, "Songs");

    let daysWithActivities = 0;
    let activities = 0;
    let categoriesAssigned = 0;
    const missingFields = [];
    const dayLabel = (day) => day.charAt(0).toUpperCase() + day.slice(1);
    WEEKDAYS.forEach((day) => {
      const dayPlan = data.dailyPlans?.[day];
      if (!dayPlan) return;
      const itemCount = (dayPlan.items || []).length;
      if (itemCount) {
        daysWithActivities += 1;
        activities += itemCount;
        categoriesAssigned += dayPlan.items.filter((item) => item.activityCategory).length;
        if (!dayPlan.vocabulary) missingFields.push(`${dayLabel(day)} vocabulary`);
        if (!dayPlan.familyConnection && formatVersion >= 5) {
          // Family connection is usually weekly; only flag day-level when format asks for it.
        } else if (!dayPlan.familyConnection && formatVersion < 5) {
          missingFields.push(`${dayLabel(day)} family connection`);
        }
        if (!dayPlan.objectives) missingFields.push(`${dayLabel(day)} objectives`);
        if (!dayPlan.materials) missingFields.push(`${dayLabel(day)} materials`);
        if (formatVersion >= 5) {
          if (!(dayPlan.books || []).length && !(data.books || []).length) {
            missingFields.push(`${dayLabel(day)} books`);
          } else if (!(dayPlan.books || []).length && formatVersion >= 5) {
            // Weekly books cover the week — do not double-count as day gaps.
          }
          dayPlan.items.forEach((item) => {
            if (!item.description) missingFields.push(`${dayLabel(day)} "${item.title}" description`);
            if (!item.materials) missingFields.push(`${dayLabel(day)} "${item.title}" materials`);
            if (!item.steps) missingFields.push(`${dayLabel(day)} "${item.title}" directions`);
          });
        }
      } else if (formatVersion >= 5) {
        missingFields.push(`${dayLabel(day)} activities`);
      }
    });
    push(daysWithActivities >= 1, "At least one weekday with activities");
    push(daysWithActivities >= 5, "All five weekdays present");
    push(activities >= 1, "Activities imported");
    if (formatVersion >= 5) {
      push(activities >= 10, "At least 10 activities");
    }

    const okCount = checks.filter((item) => item.ok).length;
    const qualityScore = Math.round((okCount / Math.max(checks.length, 1)) * 100);
    return {
      ageGroup: data.age || "—",
      planType: data.plan || "—",
      daysImported: daysWithActivities,
      activitiesImported: activities,
      categoriesAssigned,
      missingFieldCount: missingFields.length,
      missingFields: missingFields.slice(0, 30),
      recognizedFields: (recognizedFields || []).slice(0, 40),
      warningCount: (warnings || []).length,
      qualityScore,
      inferences: inferences || [],
      checks,
      formatVersion,
    };
  }

  function flattenDailyPlansForV1Compat(dailyPlans) {
    return Object.fromEntries(
      WEEKDAYS.map((day) => [
        day,
        {
          theme: dailyPlans[day]?.theme || "",
          activities: (dailyPlans[day]?.items || []).map((item) => item.title).filter(Boolean),
        },
      ]),
    );
  }

  function parseCurriculumLessonPlanImportV4(text, options = {}) {
    const baseApi = getBaseApi();
    const {
      existingItemIds = new Map(),
      generateItemId = baseApi?.generateCurriculumItemId,
      existingTitles = [],
      formatVersion: requestedFormatVersion = 4,
    } = options;
    const formatVersion = Number(requestedFormatVersion) === 5 ? 5 : 4;
    const formatLabel = formatVersion === 5 ? "V5 Flexible Import" : "V4 Smart Import";
    const errors = [];
    const warnings = [];
    const unmapped = [];
    const inferences = [];
    const sectionsDetected = [];
    const raw = String(text || "").trim();

    if (!raw) {
      return {
        ok: false,
        errors: ["Paste is empty. Include a lesson title and at least one weekday activity."],
        warnings,
        unmapped,
        parseReport: { formatVersion, formatLabel, sectionsDetected: [], activityCount: 0, activityLibraryEntries: 0, daysPresent: [] },
        data: null,
      };
    }

    const emptyDaily = () => (baseApi?.emptyCurriculumDailyPlans
      ? baseApi.emptyCurriculumDailyPlans()
      : Object.fromEntries(WEEKDAYS.map((day) => [day, {
        theme: "", objectives: "", materials: "", vocabulary: "", learningDomains: [],
        books: [], songs: [], circleTime: [], transitions: [], outdoorPlay: "",
        familyConnection: "", observations: [], adaptations: "", safetyNotes: "", items: [],
      }])));

    const { lessonBody, daySections, dayLineOffsets } = splitFlexibleWeekdaySections(raw);
    const { fields: lessonFields, unmapped: lessonUnmapped } = parseFlexibleFieldBlock(lessonBody, LESSON_LOOKUP, {
      context: "lesson",
    });
    // Soft-unmapped: keep for report but do not block
    lessonUnmapped.forEach((entry) => {
      if (String(entry.text || "").trim().length > 2) unmapped.push(entry);
    });

    let title = normalizedShortText(lessonFields.TITLE);
    if (!title) {
      // First non-empty non-heading line as title fallback
      const firstLine = lessonBody.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^#/.test(l) && !/:$/.test(l));
      title = normalizedShortText(firstLine);
      if (title) {
        warnings.push(`TITLE missing — used first line as title: "${title}".`);
        inferences.push({ field: "title", value: title, reason: "first-line-fallback" });
      }
    }
    if (!title) errors.push("Missing required field: TITLE (or a clear lesson title at the top).");
    else sectionsDetected.push("TITLE");

    const ageValue = inferAgeFromText(raw, lessonFields.AGE_GROUP, baseApi);
    if (ageValue.defaulted) {
      errors.push(
        "Missing required field: AGE_GROUP. Add exactly one of: Infant 0–6 Months, Infant 6–12 Months, Toddler, or Preschool so activities land in the right developmental band.",
      );
    } else if (ageValue.inferred) {
      warnings.push(`AGE_GROUP inferred as ${ageValue.display}.`);
      inferences.push({ field: "age", value: ageValue.display, reason: "detected" });
    } else sectionsDetected.push("AGE_GROUP");

    let theme = normalizedShortText(lessonFields.THEME);
    if (!theme) {
      theme = title || "";
      if (theme) {
        warnings.push("THEME missing — copied from TITLE so activities stay attached to this lesson. Add an explicit THEME when title and theme differ.");
        inferences.push({ field: "theme", value: theme, reason: "title-fallback" });
      } else {
        errors.push(
          "Missing required field: THEME. Add a clear weekly theme (for example: Ocean Explorers) so daily activities map to the right topic — do not leave theme blank.",
        );
      }
    } else sectionsDetected.push("THEME");

    const planInfo = inferPlanType(raw, lessonFields.PLAN);
    if (planInfo.inferred || planInfo.defaulted) {
      warnings.push(planInfo.defaulted
        ? `PLAN missing — defaulted to ${planInfo.plan}.`
        : `PLAN inferred as ${planInfo.plan}.`);
      inferences.push({ field: "plan", value: planInfo.plan, reason: planInfo.defaulted ? "default" : "detected" });
    } else sectionsDetected.push("PLAN");

    const statusRaw = normalizedShortText(lessonFields.STATUS).toLowerCase();
    const status = ["draft", "published", "featured", "archived"].includes(statusRaw) ? statusRaw : "draft";
    if (!statusRaw) {
      warnings.push("STATUS missing — defaulted to draft.");
      inferences.push({ field: "status", value: "draft", reason: "default" });
    } else if (statusRaw !== status) {
      warnings.push(`STATUS "${lessonFields.STATUS}" invalid — defaulted to draft.`);
    } else sectionsDetected.push("STATUS");

    if (!preserveMultilineText(lessonFields.WEEKLY_OVERVIEW)) {
      warnings.push("WEEKLY_OVERVIEW / theme overview missing.");
    } else sectionsDetected.push("WEEKLY_OVERVIEW");

    if (title && existingTitles.map((item) => String(item).trim().toLowerCase()).includes(title.toLowerCase())) {
      warnings.push(`Duplicate lesson plan title "${title}" detected.`);
    }

    [
      "LEARNING_DOMAINS", "LEARNING_OBJECTIVES", "WEEKLY_MATERIALS", "VOCABULARY",
      "BOOKS", "SONGS", "FAMILY_CONNECTION", "OBSERVATION_OPPORTUNITIES", "ADAPTATIONS",
    ].forEach((key) => {
      if (lessonFields[key]) sectionsDetected.push(key);
    });

    const books = baseApi?.parseCurriculumImportListLines
      ? baseApi.parseCurriculumImportListLines(lessonFields.BOOKS, { parts: 3 })
      : [];
    const songs = baseApi?.parseCurriculumImportListLines
      ? baseApi.parseCurriculumImportListLines(lessonFields.SONGS, { parts: 2 })
      : [];

    const dailyPlans = emptyDaily();
    let activityCount = 0;
    const daysPresent = [];
    let categoriesInferred = 0;

    WEEKDAYS.forEach((dayKey) => {
      const dayContent = daySections[dayKey] || "";
      if (!dayContent.trim()) return;
      sectionsDetected.push(dayKey.toUpperCase());
      daysPresent.push(dayKey);

      const activityBlocks = splitFlexibleDayActivities(dayContent);
      // Everything before first activity block = day-level fields
      let dayFieldText = dayContent;
      if (activityBlocks.length) {
        const firstActivityIndex = dayContent.indexOf(activityBlocks[0]);
        dayFieldText = firstActivityIndex >= 0 ? dayContent.slice(0, firstActivityIndex) : "";
      }
      const dayParsed = parseFlexibleFieldBlock(dayFieldText, DAY_LOOKUP, {
        lineOffset: dayLineOffsets[dayKey] || 1,
        context: `${dayKey}:daily`,
      });
      applyDayFields(dailyPlans[dayKey], dayParsed.fields, baseApi);
      // Day unmapped lines that look like labels stay as soft unmapped
      dayParsed.unmapped.forEach((entry) => {
        if (String(entry.text || "").trim().length > 2) unmapped.push(entry);
      });

      if (!activityBlocks.length) {
        const trimmed = dayContent.trim();
        if (trimmed && !dayParsed.fields.THEME && !dayParsed.fields.MATERIALS && !dayParsed.fields.OBJECTIVES) {
          warnings.push(`${dayKey}: weekday section has content but no recognizable activity blocks.`);
        }
        return;
      }

      activityBlocks.forEach((block) => {
        const parsedActivity = parseV4ActivityBlock(block, {
          dayKey,
          lineOffset: dayLineOffsets[dayKey] || 1,
          existingItemIds,
          generateItemId,
          baseApi,
        });
        warnings.push(...parsedActivity.warnings);
        unmapped.push(...parsedActivity.unmapped);
        if (parsedActivity.activity) {
          if (parsedActivity.activity._categoryInferred) categoriesInferred += 1;
          delete parsedActivity.activity._categoryInferred;
          dailyPlans[dayKey].items.push(parsedActivity.activity);
          activityCount += 1;
        }
      });
    });

    if (!activityCount) {
      errors.push("At least one activity with a name is required under a weekday section (Monday–Friday).");
    }

    const domainResolved = lessonFields.LEARNING_DOMAINS
      ? resolveDomainsFlexible(lessonFields.LEARNING_DOMAINS, baseApi)
      : { domains: [], mappings: [], unmatched: [] };
    domainResolved.unmatched.forEach((item) => {
      unmapped.push({
        field: "LEARNING_DOMAINS",
        value: item.original,
        note: `Needs review: "${item.original}" was not matched to an official learning domain.`,
      });
      warnings.push(`Learning domain "${item.original}" needs review — original text preserved.`);
    });
    domainResolved.mappings
      .filter((m) => m.confidence === "medium" && m.official)
      .forEach((m) => warnings.push(m.note));
    const learningDomains = domainResolved.domains;

    const data = {
      _formatVersion: formatVersion,
      title: title || "Untitled Lesson Plan",
      age: ageValue.defaulted ? "" : (ageValue.display || ""),
      ageBucket: ageValue.defaulted ? "" : (ageValue.bucket || ""),
      theme: theme || "",
      plan: planInfo.plan || "Free",
      status,
      learningDomains,
      _domainMappings: domainResolved.mappings,
      weeklyOverview: preserveMultilineText(lessonFields.WEEKLY_OVERVIEW),
      objectives: preserveMultilineText(lessonFields.LEARNING_OBJECTIVES),
      weeklyMaterials: preserveMultilineText(lessonFields.WEEKLY_MATERIALS),
      vocabularyWords: preserveMultilineText(lessonFields.VOCABULARY),
      familyConnection: preserveMultilineText(lessonFields.FAMILY_CONNECTION),
      observationOpportunities: preserveMultilineText(lessonFields.OBSERVATION_OPPORTUNITIES),
      adaptations: preserveMultilineText(lessonFields.ADAPTATIONS),
      books,
      songs,
      dailyPlans,
      dailyPlansCompat: flattenDailyPlansForV1Compat(dailyPlans),
      _activityCount: activityCount,
    };

    const quality = computeQualityReport(data, warnings, inferences, {
      formatVersion,
      recognizedFields: sectionsDetected,
    });
    quality.categoriesInferred = categoriesInferred;

    const parseReport = {
      formatVersion,
      formatLabel,
      title: data.title,
      age: data.age,
      theme: data.theme,
      plan: data.plan,
      status: data.status,
      activityCount,
      activityLibraryEntries: activityCount,
      daysPresent,
      sectionsDetected,
      weeklyBookCount: books.length,
      weeklySongCount: songs.length,
      unmappedLineCount: unmapped.length,
      quality,
      inferences,
    };

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      unmapped,
      parseReport,
      data,
    };
  }

  function parseCurriculumLessonPlanImportV5(text, options = {}) {
    return parseCurriculumLessonPlanImportV4(text, { ...options, formatVersion: 5 });
  }

  const CURRICULUM_LESSON_IMPORT_V5_TEMPLATE = `TITLE:
Ocean Explorers

AGE_GROUP:
Preschool

THEME:
Ocean Life

PLAN:
Pro

STATUS:
published

LEARNING_DOMAINS:
Science, Language & Literacy, Math, Physical Development, Social Emotional, Creative Arts

WEEKLY_OVERVIEW:
Preschoolers explore ocean animals through sensory play, literacy, math sorting, STEM building, movement, and cooperative play. Keep every activity tied to ocean life — no off-theme fillers.

LEARNING_OBJECTIVES:
Identify common ocean animals and habitats
Build ocean vocabulary through books, songs, and play
Practice counting and sorting with shells
Strengthen fine and gross motor skills through ocean centers
Practice cooperation during group ocean projects

WEEKLY_MATERIALS:
Toy ocean animals, blue scarves, shells, sand or kinetic sand, scoops, trays, ocean books, paint, paper, blocks

VOCABULARY:
ocean, wave, shell, fish, whale, coral, swim, float, deep, shore

BOOKS:
Commotion in the Ocean | Giles Andreae
Way Down Deep in the Deep Blue Sea | Jan Peck

SONGS:
A Sailor Went to Sea
Baby Shark

FAMILY_CONNECTION:
Ask families to find one “ocean” word at home (bath time, books, or a walk) and share it tomorrow.

OBSERVATION_OPPORTUNITIES:
Note ocean vocabulary, sorting accuracy, cooperation, and engagement during sensory and movement play.

ADAPTATIONS:
Offer larger scoops, visual step cards, and peer partners. Shorten seated work; extend with an open-ended building challenge.

MONDAY

DAILY_THEME:
Ocean Life: Shell Sort and Ocean Story

DAILY_OBJECTIVES:
Explore shells through sorting and ocean vocabulary
Connect story language to ocean animals

DAILY_VOCABULARY:
ocean, shell, shore, wave

DAILY_MATERIALS:
Shells, trays, ocean book, blue scarves

DAILY_LEARNING_DOMAINS:
Science, Language & Literacy, Math

CIRCLE_TIME:
Hello song and name greeting
Sing “A Sailor Went to Sea”
Preview today’s ocean focus with one shell prop

OUTDOOR_PLAY:
Ocean movement game — swim, float, and crab walk across a safe open space

DAILY_OBSERVATIONS:
Uses ocean words
Sorts shells with purpose
Joins movement play

DAILY_ADAPTATIONS:
Offer hand-over-hand scooping and fewer shell choices

SAFETY_NOTES:
Supervise small shells; use larger shells for younger preschoolers

ACTIVITY_NAME:
Shell Sorting Lab
CATEGORY:
STEM/Discovery
OBJECTIVE:
Sort shells by size or color while using ocean vocabulary.
DESCRIPTION:
Children sort shells into trays and talk about what they notice.
MATERIALS:
Shells, sorting trays
SETUP:
Place trays and shells at a small table before children arrive.
TEACHER_ROLE:
Ask open-ended questions and model ocean words.
DIRECTIONS:
1. Show the shells and name the ocean theme.
2. Invite children to sort by size or color.
3. Count how many are in each tray.
4. Share one discovery with a friend.
5. Clean up shells together.
LEARNING_GOALS:
Sorting
Counting
Ocean vocabulary
OBSERVATION_OPPORTUNITIES:
Sorts with intention
Uses theme words
ADAPTATIONS:
Limit to two categories; extend with a graphing challenge
SAFETY_NOTES:
No shells small enough to choke; supervise closely

TUESDAY
(continue same daily + activity pattern through FRIDAY)
`;

  const CURRICULUM_LESSON_IMPORT_V4_TEMPLATE = `Title:
Ocean Explorers Week

Age Group:
Toddler

Theme Overview:
Children explore ocean animals through sensory play, movement, and books.

Learning Goals:
- Use descriptive words about ocean animals
- Practice scooping and pouring
- Move like ocean creatures

Family Engagement:
Ask families to share a favorite water animal photo.

Observe For:
Language, fine motor control, and cooperative play.

Monday
Daily Theme:
Blue Ocean Day

Daily Objectives:
Explore water textures and ocean words.

Daily Materials:
Water table, scoops, plastic fish

Circle Time:
Welcome song and ocean weather chart

Activity: Wave Water Table
Category:
Sensory Play
Description:
Children scoop and pour at the water table with ocean toys.
Materials:
Water table, cups, fish toys
Directions:
1. Invite children to the water table.
2. Model scooping and pouring.
3. Name ocean animals together.
Teacher Role:
Narrate actions and introduce vocabulary.
Learning Goals:
Fine motor strength and ocean vocabulary

Activity: Ocean Creature Freeze Dance
Description:
Children move like crabs and fish, then freeze when the music stops.
Materials:
Music player
Directions:
1. Play ocean music.
2. Call out animal movements.
3. Freeze and stretch.
Teacher Role:
Model movements and celebrate participation.
Learning Goals:
Gross motor control and listening

Tuesday
Daily Theme:
Shell Sort

Activity Name:
Shell Sorting Tray
Description:
Children sort shells by size and texture.
Materials:
Shells, trays
Directions:
1. Offer a tray of shells.
2. Invite sorting by size.
3. Talk about smooth and rough.
Teacher Role:
Ask open-ended questions.
Learning Goals:
Comparing and describing
`;

  function install(api) {
    if (!api) return null;
    api.parseCurriculumLessonPlanImportV4 = parseCurriculumLessonPlanImportV4;
    api.parseCurriculumLessonPlanImportV5 = parseCurriculumLessonPlanImportV5;
    api.CURRICULUM_LESSON_IMPORT_V4_TEMPLATE = CURRICULUM_LESSON_IMPORT_V4_TEMPLATE;
    api.CURRICULUM_LESSON_IMPORT_V5_TEMPLATE = CURRICULUM_LESSON_IMPORT_V5_TEMPLATE;
    api.V4_LESSON_FIELD_SYNONYMS = V4_LESSON_FIELD_SYNONYMS;
    api.V4_ACTIVITY_FIELD_SYNONYMS = V4_ACTIVITY_FIELD_SYNONYMS;
    api.inferActivityCategory = (activity) => inferActivityCategory(activity, api);
    api.computeImportQualityReport = computeQualityReport;

    const originalParse = api.parseCurriculumLessonPlanImport;
    api.parseCurriculumLessonPlanImport = function parseCurriculumLessonPlanImportWithMode(text, options = {}) {
      const mode = String(options.mode || options.importMode || "auto").toLowerCase();
      if (mode === "v5" || mode === "flexible") {
        return parseCurriculumLessonPlanImportV5(text, options);
      }
      if (mode === "v4" || mode === "smart") {
        return parseCurriculumLessonPlanImportV4(text, options);
      }
      if (mode === "v3" || mode === "strict") {
        const format = api.detectImportFormat(text);
        if (format === "v2") {
          return originalParse(text, options);
        }
        if (format !== "v3") {
          return {
            ok: false,
            errors: [
              "V3 Strict Import requires TITLE:, AGE_GROUP:, THEME:, PLAN:, STATUS:, WEEKLY_OVERVIEW:, weekday headers, and ACTIVITY_NAME: blocks. Switch to V5 Flexible Import for ChatGPT-style pastes.",
            ],
            warnings: [],
            unmapped: [],
            parseReport: { formatVersion: 3, rejectedFlexibleFormat: true },
            data: null,
          };
        }
        return api.parseCurriculumLessonPlanImportV3(text, options);
      }
      // auto: prefer V3 when clearly label-only; otherwise use V5 flexible
      const format = api.detectImportFormat(text);
      if (format === "v3") return api.parseCurriculumLessonPlanImportV3(text, options);
      if (format === "v2") return originalParse(text, options);
      return parseCurriculumLessonPlanImportV5(text, options);
    };

    return api;
  }

  const installed = install(getBaseApi());
  if (typeof module !== "undefined" && module.exports) {
    module.exports = installed || {
      parseCurriculumLessonPlanImportV4,
      parseCurriculumLessonPlanImportV5,
      CURRICULUM_LESSON_IMPORT_V4_TEMPLATE,
      CURRICULUM_LESSON_IMPORT_V5_TEMPLATE,
    };
  }
  if (typeof globalThis !== "undefined" && installed) {
    globalThis.CurriculumLessonImportParser = installed;
  }
})();
