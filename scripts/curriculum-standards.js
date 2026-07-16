/**
 * Little Learner Hub Curriculum Standards (canonical).
 *
 * Use when auditing, generating, or upgrading lesson plans.
 * Every activity must be developmentally appropriate for the assigned age group.
 * Do not simply add more content — verify content matches how children learn at that age.
 *
 * Browser: globalThis.CurriculumStandards (optional)
 * Node: module.exports
 */
(function curriculumStandardsModule() {
  "use strict";

  const PLACEHOLDER_RE =
    /lorem ipsum|\btodo\b|\btbd\b|placeholder|coming soon|\[insert|xxx+|FIXME|TODO:|N\/A\b|TBD\b|to be (added|filled|completed)|fill in|add here/i;

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

  /** Required weekly (lesson-plan level) fields — gold standard. */
  const WEEKLY_REQUIRED_FIELDS = [
    { key: "weeklyOverview", label: "Weekly Overview" },
    { key: "objectives", label: "Learning Objectives" },
    { key: "learningDomains", label: "Learning Domains", kind: "array" },
    { key: "weeklyMaterials", label: "Weekly Materials" },
    { key: "vocabularyWords", label: "Vocabulary", aliases: ["vocabulary"] },
    { key: "books", label: "Books", kind: "books" },
    { key: "songs", label: "Songs", kind: "songs" },
    { key: "familyConnection", label: "Family Connection" },
    { key: "observationOpportunities", label: "Observation Opportunities" },
    { key: "adaptations", label: "Adaptations" },
  ];

  /** Required daily section fields — gold standard. */
  const DAILY_REQUIRED_FIELDS = [
    { key: "theme", label: "Daily Theme" },
    { key: "objectives", label: "Daily Objectives" },
    { key: "vocabulary", label: "Daily Vocabulary" },
    { key: "materials", label: "Daily Materials" },
    { key: "learningDomains", label: "Daily Learning Domains", kind: "array" },
    { key: "circleTime", label: "Circle Time", kind: "arrayOrText" },
    { key: "outdoorPlay", label: "Outdoor Play" },
    { key: "observations", label: "Observation Opportunities", kind: "arrayOrText", aliases: ["observationOpportunities"] },
    { key: "adaptations", label: "Adaptations" },
    { key: "safetyNotes", label: "Safety Notes" },
  ];

  /** Required fields on every activity — gold standard. */
  const ACTIVITY_REQUIRED_FIELDS = [
    { key: "title", label: "Activity Name", aliases: ["name"] },
    { key: "activityCategory", label: "Category", aliases: ["category"] },
    { key: "objective", label: "Objective" },
    { key: "description", label: "Description" },
    { key: "materials", label: "Materials" },
    { key: "setup", label: "Setup" },
    { key: "steps", label: "Directions", aliases: ["directions"] },
    { key: "teacherRole", label: "Teacher Role" },
    { key: "learningGoals", label: "Learning Goals", kind: "arrayOrText" },
    { key: "observationOpportunities", label: "Observation Opportunities" },
    { key: "adaptations", label: "Adaptations" },
    { key: "safetyNotes", label: "Safety Notes" },
  ];

  /**
   * Age-band standards keyed by resolved band id.
   * Bands: infant-0-6 | infant-6-12 | infant | toddler | preschool
   */
  const AGE_BANDS = {
    "infant-0-6": {
      id: "infant-0-6",
      label: "Infant 0–6 Months",
      family: "Infant",
      activityLengthMinutes: { min: 1, max: 5 },
      focusAreas: [
        "Bonding and attachment",
        "Visual tracking",
        "Tummy time",
        "Sensory exploration",
        "Listening to music",
        "Language exposure",
        "Reaching and grasping",
        "Cause and effect",
      ],
      appropriateActivities: [
        "High contrast cards",
        "Mirror exploration",
        "Soft sensory fabrics",
        "Tummy time activities",
        "Lullabies and songs",
        "Gentle movement",
        "Peek-a-boo",
        "Tracking toys with eyes",
        "Texture exploration",
      ],
      avoid: [
        "Worksheets",
        "Crafts requiring products",
        "Scissors",
        "Glue",
        "Small manipulatives",
        "Group games requiring sharing",
        "Activities requiring sitting independently",
      ],
      avoidPatterns: [
        /\bworksheet/i,
        /\bscissors?\b/i,
        /\bglue\b/i,
        /\bgluestick/i,
        /\bcraft\b/i,
        /\bcut(ting)?\b/i,
        /\bcoloring (page|sheet)\b/i,
        /\btrace\b|\btracing\b/i,
        /\bwriting\b|\bpencil\b|\bcrayon\b/i,
        /\bbead\b|\bpompom\b|\bgoogly\b|\bbutton\b/i,
        /\bgroup (game|activity|project).{0,40}\bshar(e|ing)\b/i,
        /\bforced sharing\b|\brequire[sd]? to share\b/i,
        /\bsit(ting)? independently\b/i,
        /\bsensory bin\b/i,
        /\bcrawl(ing)? course\b/i,
        /\bstacking cups?\b/i,
        /\blarge blocks?\b/i,
      ],
      requiredPlanComponents: [],
      notes:
        "Caregiver-led, floor-based, sensory-safe only. Short bursts (1–5 minutes). No product crafts, no small parts, no independent sitting expectations.",
    },
    "infant-6-12": {
      id: "infant-6-12",
      label: "Infant 6–12 Months",
      family: "Infant",
      activityLengthMinutes: { min: 3, max: 8 },
      focusAreas: [
        "Crawling",
        "Pulling up",
        "Container play",
        "Object permanence",
        "Early communication",
        "Fine motor exploration",
        "Sensory discovery",
      ],
      appropriateActivities: [
        "Crawling courses",
        "Sensory bins with safe materials",
        "Stacking cups",
        "Large blocks",
        "Container filling and dumping",
        "Music exploration",
        "Cause-and-effect toys",
        "Peek-a-boo games",
        "Water exploration",
      ],
      avoid: [
        "Worksheets",
        "Complex crafts",
        "Small choking hazards",
        "Activities requiring long attention spans",
      ],
      avoidPatterns: [
        /\bworksheet/i,
        /\bscissors?\b/i,
        /\bglue\b/i,
        /\bcomplex craft/i,
        /\bcut(ting)?\b/i,
        /\btrace\b|\btracing\b/i,
        /\bwriting\b|\bpencil\b/i,
        /\bbead\b|\bpompom\b|\bgoogly\b|\bbutton\b|\bmarble\b/i,
        /\bchoking\b/i,
        /\b20[-– ]?minute/i,
        /\b15[-– ]?minute/i,
      ],
      requiredPlanComponents: [],
      notes:
        "Mobile infants: crawling, pulling up, fill/dump, object permanence. Keep materials large and choke-safe. Activities 3–8 minutes.",
    },
    infant: {
      id: "infant",
      label: "Infant (0–12 Months)",
      family: "Infant",
      activityLengthMinutes: { min: 1, max: 8 },
      focusAreas: [
        "Bonding and attachment",
        "Sensory exploration",
        "Tummy time / early mobility",
        "Language exposure",
        "Reaching, grasping, and cause and effect",
      ],
      appropriateActivities: [
        "High contrast / mirror / soft textures",
        "Tummy time and gentle movement",
        "Songs, lullabies, peek-a-boo",
        "Safe container play and large stacking (older infants)",
        "Tracking and cause-and-effect toys",
      ],
      avoid: [
        "Worksheets",
        "Crafts requiring products",
        "Scissors",
        "Glue",
        "Small manipulatives / choking hazards",
        "Group games requiring sharing",
        "Activities requiring sitting independently (younger infants)",
        "Long attention-span activities",
      ],
      avoidPatterns: [
        /\bworksheet/i,
        /\bscissors?\b/i,
        /\bglue\b/i,
        /\bcut(ting)?\b/i,
        /\btrace\b|\btracing\b/i,
        /\bwriting\b|\bpencil\b/i,
        /\bbead\b|\bpompom\b|\bgoogly\b|\bbutton\b|\bmarble\b/i,
      ],
      requiredPlanComponents: [],
      notes:
        "When exact infant range is unknown, keep activities safe for both 0–6 and 6–12: caregiver-led, sensory-safe, short (1–8 min), no worksheets/crafts/small parts. Prefer specifying Infant 0–6 Months or Infant 6–12 Months.",
    },
    toddler: {
      id: "toddler",
      label: "Toddlers (1–2 Years)",
      family: "Toddler",
      activityLengthMinutes: { min: 5, max: 15 },
      focusAreas: [
        "Movement",
        "Language development",
        "Sensory learning",
        "Dramatic play",
        "Social interaction",
        "Independence",
      ],
      appropriateActivities: [
        "Sensory bins",
        "Sticker activities",
        "Painting",
        "Gross motor games",
        "Music and movement",
        "Animal walks",
        "Pretend play",
        "Building activities",
        "Process art",
        "Simple science exploration",
      ],
      avoid: [
        "Long seated activities",
        "Worksheets",
        "Excessive teacher-directed instruction",
        "Tiny pieces",
      ],
      avoidPatterns: [
        /\bworksheet/i,
        /\btrace\b|\btracing\b/i,
        /\bwrite(r|s|ing)?\b.*\bletter/i,
        /\bkindergarten\b/i,
        /\btiny (pieces?|parts?|beads?)\b/i,
        /\bsmall beads?\b|\bpompoms?\b|\bgoogly eyes?\b/i,
        /\blong seated\b|\bsit for 20\b/i,
      ],
      requiredPlanComponents: [
        { id: "movement", label: "Movement", patterns: [/gross motor|movement|animal walk|dance|jump|crawl|run|outdoor|music and movement|obstacle/i] },
        { id: "sensory", label: "Sensory play", patterns: [/sensory|texture|water play|sand|bin|paint|messy|feel/i] },
        { id: "fine-motor", label: "Fine motor activity", patterns: [/fine motor|sticker|stack|build|grasp|pinch|tear|pour|thread|manipulate/i] },
        { id: "social", label: "Social interaction", patterns: [/social|peer|together|share|parallel play|dramatic|pretend|greeting|circle/i] },
      ],
      notes:
        "Every toddler lesson plan should include movement, sensory play, a fine motor activity, and social interaction. Keep activities 5–15 minutes; avoid worksheets and tiny pieces.",
    },
    preschool: {
      id: "preschool",
      label: "Preschool (3–5 Years)",
      family: "Preschool",
      activityLengthMinutes: { min: 10, max: 25 },
      focusAreas: [
        "Kindergarten readiness",
        "STEM",
        "Problem solving",
        "Literacy",
        "Math",
        "Cooperative play",
        "Creativity",
      ],
      appropriateActivities: [
        "Science experiments",
        "Letter exploration",
        "Name recognition",
        "Counting activities",
        "Sorting activities",
        "Building challenges",
        "Dramatic play centers",
        "Open-ended art",
        "Group projects",
        "Simple engineering activities",
      ],
      avoid: [
        "Worksheets as the primary activity",
        "Activities that are entirely teacher-led",
        "Busy work",
      ],
      avoidPatterns: [
        /\bworksheet as (the )?primary\b/i,
        /\bbusy work\b/i,
        /\bentirely teacher[- ]led\b/i,
        /\belementary\b|\bgrade[- ]?level\b/i,
      ],
      /** Soft worksheet flag — worksheets OK only if not the primary/only activity. */
      softAvoidPatterns: [/\bworksheet/i],
      requiredPlanComponents: [
        { id: "literacy", label: "Literacy component", patterns: [/literacy|letter|name recognition|read|book|phon|vocabulary|print|story/i] },
        { id: "math", label: "Math component", patterns: [/math|count|number|sort|pattern|measure|more|less|shape/i] },
        { id: "stem", label: "STEM/science component", patterns: [/stem|science|experiment|engineer|build|investigate|predict|observe|cause/i] },
        { id: "fine-motor", label: "Fine motor activity", patterns: [/fine motor|cut|draw|write|lace|pinch|bead|trace|manipulate|hand/i] },
        { id: "gross-motor", label: "Gross motor activity", patterns: [/gross motor|outdoor|movement|run|jump|dance|obstacle|ball|climb/i] },
        { id: "sel", label: "Social-emotional component", patterns: [/social|emotional|feelings?|friend|cooperat|share|calm|empathy|self[- ]reg/i] },
      ],
      notes:
        "Every preschool lesson plan should include literacy, math, STEM/science, fine motor, gross motor, and social-emotional components. Activities 10–25 minutes. Worksheets must not be the primary activity.",
    },
  };

  function asText(value) {
    if (value == null) return "";
    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          if (entry == null) return "";
          if (typeof entry === "string") return entry;
          if (typeof entry === "object") {
            return [entry.title, entry.author, entry.notes, entry.name, entry.description].filter(Boolean).join(" ");
          }
          return String(entry);
        })
        .join("\n");
    }
    if (typeof value === "object") {
      return [value.title, value.author, value.notes, value.name, value.description].filter(Boolean).join(" ");
    }
    return String(value);
  }

  function hasContent(value, kind) {
    if (kind === "books" || kind === "songs") {
      if (!Array.isArray(value) || !value.length) return false;
      return value.some((entry) => String(entry?.title || "").trim());
    }
    if (kind === "array") {
      if (Array.isArray(value)) return value.some((entry) => String(entry || "").trim());
      return Boolean(String(value || "").trim());
    }
    if (kind === "arrayOrText") {
      if (Array.isArray(value)) return value.some((entry) => String(entry || "").trim());
      return Boolean(String(value || "").trim());
    }
    return Boolean(asText(value).trim());
  }

  function fieldValue(obj, field) {
    if (!obj || typeof obj !== "object") return undefined;
    if (obj[field.key] != null && obj[field.key] !== "") return obj[field.key];
    if (Array.isArray(field.aliases)) {
      for (const alias of field.aliases) {
        if (obj[alias] != null && obj[alias] !== "") return obj[alias];
      }
    }
    return obj[field.key];
  }

  /**
   * Resolve age string to a standards band.
   * Prefers exact infant ranges when present.
   */
  function resolveAgeBand(ageRaw) {
    const raw = String(ageRaw || "").trim();
    const lower = raw.toLowerCase().replace(/[–—]/g, "-");
    if (!raw) return AGE_BANDS.preschool;

    if (/infant/.test(lower)) {
      if (/0\s*-\s*6|0\s*to\s*6|birth\s*-\s*6|newborn/.test(lower)) return AGE_BANDS["infant-0-6"];
      if (/6\s*-\s*12|6\s*to\s*12|7\s*-\s*12|8\s*-\s*12|9\s*-\s*12|10\s*-\s*12/.test(lower)) {
        return AGE_BANDS["infant-6-12"];
      }
      return AGE_BANDS.infant;
    }
    if (/toddler|12\s*-\s*24|12\s*-\s*36|1\s*-\s*2|1\s*-\s*3|young toddler|older toddler/.test(lower)) {
      return AGE_BANDS.toddler;
    }
    if (/preschool|pre-?k|3\s*-\s*5|3\s*-\s*4|4\s*-\s*5/.test(lower)) {
      return AGE_BANDS.preschool;
    }
    return AGE_BANDS.preschool;
  }

  function countNumberedSteps(stepsText) {
    const text = String(stepsText || "");
    const numbered = text.match(/(?:^|\n)\s*(?:\d+[\).\]]|step\s*\d+)/gi);
    if (numbered && numbered.length) return numbered.length;
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length;
  }

  function activityBlob(activity) {
    return [
      activity?.title,
      activity?.name,
      activity?.activityCategory,
      activity?.category,
      activity?.objective,
      activity?.description,
      activity?.materials,
      activity?.setup,
      activity?.steps,
      activity?.directions,
      activity?.teacherRole,
      asText(activity?.learningGoals),
      activity?.observationOpportunities,
      activity?.adaptations,
      activity?.safetyNotes,
    ].join("\n");
  }

  function planTextBlob(plan) {
    const parts = [JSON.stringify(plan || {})];
    return parts.join("\n");
  }

  function findAvoidHits(text, band) {
    const hits = [];
    const patterns = Array.isArray(band.avoidPatterns) ? band.avoidPatterns : [];
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        hits.push(pattern.source);
      }
    }
    return hits;
  }

  function findSoftAvoidHits(text, band) {
    const hits = [];
    const patterns = Array.isArray(band.softAvoidPatterns) ? band.softAvoidPatterns : [];
    for (const pattern of patterns) {
      if (pattern.test(text)) hits.push(pattern.source);
    }
    return hits;
  }

  function missingRequiredFields(obj, fields, pathPrefix) {
    const issues = [];
    for (const field of fields) {
      const value = fieldValue(obj, field);
      const filled = hasContent(value, field.kind);
      const text = asText(value);
      if (!filled) {
        issues.push({
          severity: "high",
          code: "missing_gold_field",
          detail: `${pathPrefix}: missing ${field.label}`,
          field: field.key,
        });
        continue;
      }
      if (PLACEHOLDER_RE.test(text)) {
        issues.push({
          severity: "high",
          code: "placeholder",
          detail: `${pathPrefix}: ${field.label} contains placeholder text`,
          field: field.key,
        });
      }
    }
    return issues;
  }

  function auditActivityGoldStandard(activity, pathPrefix, band) {
    const issues = missingRequiredFields(activity, ACTIVITY_REQUIRED_FIELDS, pathPrefix);
    const steps = fieldValue(activity, ACTIVITY_REQUIRED_FIELDS.find((f) => f.key === "steps"));
    const stepCount = countNumberedSteps(steps);
    if (asText(steps).trim() && (stepCount < 3 || stepCount > 12)) {
      // Gold standard asks for 3–5 numbered directions; allow up to ~8–12 for rich plans.
      if (stepCount < 3) {
        issues.push({
          severity: "high",
          code: "insufficient_directions",
          detail: `${pathPrefix}: directions must include 3–5 numbered steps (found ${stepCount})`,
        });
      }
    }

    const blob = activityBlob(activity);
    if (PLACEHOLDER_RE.test(blob)) {
      if (!issues.some((i) => i.code === "placeholder")) {
        issues.push({
          severity: "high",
          code: "placeholder",
          detail: `${pathPrefix}: activity contains placeholder text`,
        });
      }
    }

    const avoidHits = findAvoidHits(blob, band);
    for (const hit of avoidHits) {
      issues.push({
        severity: "high",
        code: "age_inappropriate",
        detail: `${pathPrefix}: content may violate ${band.label} avoid list (matched /${hit}/)`,
      });
    }

    return issues;
  }

  function auditDayGoldStandard(dayPlan, dayName, band) {
    const issues = missingRequiredFields(dayPlan, DAILY_REQUIRED_FIELDS, dayName);
    const items = Array.isArray(dayPlan?.items) ? dayPlan.items : [];
    if (!items.length) {
      issues.push({
        severity: "high",
        code: "empty_weekday",
        detail: `${dayName}: no activities`,
      });
      return { issues, items };
    }
    items.forEach((item, index) => {
      const name = String(item?.title || item?.name || `activity ${index + 1}`).trim();
      issues.push(...auditActivityGoldStandard(item, `${dayName} "${name}"`, band));
    });
    return { issues, items };
  }

  function collectPlanComponentCoverage(plan, band) {
    const required = Array.isArray(band.requiredPlanComponents) ? band.requiredPlanComponents : [];
    if (!required.length) return { required: [], found: [], missing: [] };

    const blob = planTextBlob(plan);
    const found = [];
    const missing = [];
    for (const component of required) {
      const matched = (component.patterns || []).some((pattern) => pattern.test(blob));
      if (matched) found.push(component.id);
      else missing.push(component);
    }
    return { required, found, missing };
  }

  /**
   * Full gold-standard + developmental audit for a structured curriculum lesson plan.
   */
  function auditLessonPlanAgainstStandards(plan, options = {}) {
    const source = options.source || plan?.id || "(plan)";
    const issues = [];
    const band = resolveAgeBand(plan?.age);
    const title = plan?.title || "(untitled)";

    if (!String(plan?.title || "").trim()) {
      issues.push({ severity: "high", code: "missing_title", detail: "Missing title" });
    }
    if (!String(plan?.age || "").trim()) {
      issues.push({ severity: "high", code: "missing_age", detail: "Missing age group" });
    }

    issues.push(...missingRequiredFields(plan, WEEKLY_REQUIRED_FIELDS, "Weekly"));

    const dailyPlans = plan?.dailyPlans || {};
    let totalActivities = 0;
    for (const day of WEEKDAYS) {
      const dayPlan = dailyPlans[day] || {};
      const { issues: dayIssues, items } = auditDayGoldStandard(dayPlan, day, band);
      issues.push(...dayIssues);
      totalActivities += items.length;
    }

    if (totalActivities === 0) {
      issues.push({
        severity: "critical",
        code: "no_activities",
        detail: "Plan has no weekday activities at all (overview-only risk)",
      });
    }

    const coverage = collectPlanComponentCoverage(plan, band);
    for (const component of coverage.missing) {
      issues.push({
        severity: "high",
        code: "missing_age_component",
        detail: `Plan missing required ${band.label} component: ${component.label}`,
        field: component.id,
      });
    }

    // Preschool: worksheets should not dominate.
    if (band.id === "preschool") {
      const softHits = findSoftAvoidHits(planTextBlob(plan), band);
      if (softHits.length) {
        const activityTexts = WEEKDAYS.flatMap((day) => {
          const items = Array.isArray(dailyPlans[day]?.items) ? dailyPlans[day].items : [];
          return items.map((item) => activityBlob(item));
        });
        const worksheetPrimary = activityTexts.length > 0
          && activityTexts.every((text) => /\bworksheet/i.test(text));
        if (worksheetPrimary) {
          issues.push({
            severity: "high",
            code: "worksheet_primary",
            detail: "Preschool plan uses worksheets as the primary activity across all activities",
          });
        } else {
          issues.push({
            severity: "medium",
            code: "worksheet_present",
            detail: "Preschool plan mentions worksheets — ensure they are not the primary activity",
          });
        }
      }
    }

    if (PLACEHOLDER_RE.test(planTextBlob(plan))) {
      if (!issues.some((i) => i.code === "placeholder")) {
        issues.push({
          severity: "high",
          code: "placeholder",
          detail: "Plan contains placeholder text",
        });
      }
    }

    const highOrCritical = issues.filter((i) => i.severity === "high" || i.severity === "critical").length;

    return {
      id: plan?.id || source,
      title,
      age: plan?.age || "",
      ageBand: band.id,
      ageBandLabel: band.label,
      source,
      activityCount: totalActivities,
      issueCount: issues.length,
      blockingIssueCount: highOrCritical,
      complete: highOrCritical === 0,
      componentCoverage: {
        found: coverage.found,
        missing: coverage.missing.map((c) => c.id),
      },
      issues,
    };
  }

  /** Prompt block for AI generation / upgrade flows. */
  function buildAgeStandardsPromptBlock(ageRaw) {
    const band = resolveAgeBand(ageRaw);
    const length = band.activityLengthMinutes;
    const lines = [
      `CURRICULUM STANDARDS — ${band.label} (REQUIRED)`,
      `Activity length: ${length.min}–${length.max} minutes.`,
      "Do not simply add more content. Verify content matches how children actually learn at this age.",
      "",
      "Focus areas:",
      ...band.focusAreas.map((item) => `* ${item}`),
      "",
      "Appropriate activities:",
      ...band.appropriateActivities.map((item) => `* ${item}`),
      "",
      "Avoid:",
      ...band.avoid.map((item) => `* ${item}`),
    ];

    if (band.requiredPlanComponents.length) {
      lines.push("", `Every ${band.family.toLowerCase()} lesson plan must include:`);
      for (const component of band.requiredPlanComponents) {
        lines.push(`* ${component.label}`);
      }
    }

    if (band.notes) {
      lines.push("", `Notes: ${band.notes}`);
    }

    return lines.join("\n");
  }

  function buildGoldStandardPromptBlock() {
    return [
      "GOLD STANDARD REQUIREMENTS — every lesson plan must contain:",
      "",
      "Weekly Section:",
      ...WEEKLY_REQUIRED_FIELDS.map((f) => `* ${f.label}`),
      "",
      "Daily Section (Monday–Friday):",
      ...DAILY_REQUIRED_FIELDS.map((f) => `* ${f.label}`),
      "",
      "Every Activity Must Include:",
      ...ACTIVITY_REQUIRED_FIELDS.map((f) => `* ${f.label}`),
      "* Directions: 3–5 numbered steps",
      "",
      "No blank fields. No placeholder text. No incomplete activities.",
      "A substitute teacher must be able to teach successfully using only this lesson plan.",
    ].join("\n");
  }

  function buildFullCurriculumStandardsPrompt(ageRaw) {
    return [
      buildAgeStandardsPromptBlock(ageRaw),
      "",
      "⸻",
      "",
      buildGoldStandardPromptBlock(),
    ].join("\n");
  }

  /** Compact age guide for multi-age system prompts. */
  function buildAllAgeStandardsPromptBlock() {
    return [
      "CRITICAL — DEVELOPMENTAL APPROPRIATENESS (Little Learner Hub Curriculum Standards):",
      "All content MUST match the child's stated age group. Never suggest activities outside the correct range.",
      "Do not simply add more content — verify activities match how children learn at that age.",
      "",
      "INFANT 0–6 MONTHS — Focus: bonding, visual tracking, tummy time, sensory exploration, music, language exposure, reaching/grasping, cause and effect.",
      "Appropriate: high-contrast cards, mirrors, soft fabrics, tummy time, lullabies, gentle movement, peek-a-boo, eye tracking, texture exploration.",
      "Avoid: worksheets, product crafts, scissors, glue, small manipulatives, sharing games, independent sitting.",
      "Length: 1–5 minutes.",
      "",
      "INFANT 6–12 MONTHS — Focus: crawling, pulling up, container play, object permanence, early communication, fine motor, sensory discovery.",
      "Appropriate: crawling courses, safe sensory bins, stacking cups, large blocks, fill/dump, music, cause-and-effect toys, peek-a-boo, water exploration.",
      "Avoid: worksheets, complex crafts, choking hazards, long attention spans.",
      "Length: 3–8 minutes.",
      "",
      "TODDLERS (1–2 YEARS) — Focus: movement, language, sensory, dramatic play, social interaction, independence.",
      "Appropriate: sensory bins, stickers, painting, gross motor, music/movement, animal walks, pretend play, building, process art, simple science.",
      "Avoid: long seated activities, worksheets, excessive teacher-directed instruction, tiny pieces.",
      "Length: 5–15 minutes.",
      "Every toddler lesson plan must include: Movement, Sensory play, Fine motor activity, Social interaction.",
      "",
      "PRESCHOOL (3–5 YEARS) — Focus: kindergarten readiness, STEM, problem solving, literacy, math, cooperative play, creativity.",
      "Appropriate: science experiments, letter/name exploration, counting, sorting, building challenges, dramatic play, open-ended art, group projects, simple engineering.",
      "Avoid: worksheets as the primary activity, entirely teacher-led activities, busy work.",
      "Length: 10–25 minutes.",
      "Every preschool lesson plan must include: Literacy, Math, STEM/science, Fine motor, Gross motor, Social-emotional.",
      "",
      buildGoldStandardPromptBlock(),
    ].join("\n");
  }

  const api = {
    PLACEHOLDER_RE,
    WEEKDAYS,
    WEEKLY_REQUIRED_FIELDS,
    DAILY_REQUIRED_FIELDS,
    ACTIVITY_REQUIRED_FIELDS,
    AGE_BANDS,
    resolveAgeBand,
    countNumberedSteps,
    auditLessonPlanAgainstStandards,
    buildAgeStandardsPromptBlock,
    buildGoldStandardPromptBlock,
    buildFullCurriculumStandardsPrompt,
    buildAllAgeStandardsPromptBlock,
    hasContent,
    asText,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.CurriculumStandards = api;
  }
})();
