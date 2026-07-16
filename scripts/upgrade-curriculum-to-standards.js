#!/usr/bin/env node
/**
 * Upgrade curriculum import lesson plans to Little Learner Hub Curriculum Standards.
 *
 * Rules:
 * - Only fill missing gold-standard fields (do not invent unrelated activities).
 * - Derive day/activity content from the existing theme, age band, and activity text.
 * - Keep developmental appropriateness: infant vs toddler vs preschool wording/safety.
 *
 * Usage:
 *   node scripts/upgrade-curriculum-to-standards.js
 *   DRY_RUN=1 node scripts/upgrade-curriculum-to-standards.js
 */
const fs = require("fs");
const path = require("path");
const {
  parseCurriculumLessonPlanImport,
  formatCurriculumLessonPlanImport,
  CURRICULUM_WEEKDAYS,
} = require("./curriculum-lesson-import-parser.js");
const {
  resolveAgeBand,
  countNumberedSteps,
  auditLessonPlanAgainstStandards,
  asText,
} = require("./curriculum-standards.js");

const ROOT = path.join(__dirname, "..");
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const IMPORT_DIRS = [
  "scripts/curriculum-preschool-free-imports",
  "scripts/curriculum-preschool-pro-imports",
  "scripts/curriculum-preschool-pro-batch2-imports",
  "scripts/curriculum-preschool-holiday-imports",
  "scripts/curriculum-preschool-summer-imports",
  "scripts/curriculum-preschool-priority-imports",
  "scripts/curriculum-toddler-pro-imports",
  "scripts/curriculum-toddler-holiday-imports",
  "scripts/curriculum-phase-2f-imports",
  "scripts/curriculum-infant-summer-imports",
  "scripts/curriculum-infant-holiday-imports",
].map((rel) => path.join(ROOT, rel));

const SKIP_FILES = new Set([
  "legacy-backward-compat-sample.txt",
]);

const DAY_FOCUS = {
  monday: {
    infant: "introduce calm bonding, faces, and soft sensory play",
    toddler: "introduce the theme through movement, sensory play, and simple language",
    preschool: "introduce the theme through literacy, sensory, and language play",
  },
  tuesday: {
    infant: "extend tracking, reaching, and cause-and-effect play",
    toddler: "extend the theme with sorting, building, or simple investigation",
    preschool: "extend the theme with math, STEM, or hands-on investigation",
  },
  wednesday: {
    infant: "explore music, gentle movement, and responsive interaction",
    toddler: "explore the theme through pretend play, music, and discovery",
    preschool: "explore the theme through dramatic play, music, and discovery",
  },
  thursday: {
    infant: "practice tummy time, grasping, and caregiver-supported exploration",
    toddler: "practice fine motor and social interaction connected to the theme",
    preschool: "practice fine motor and social-emotional skills connected to the theme",
  },
  friday: {
    infant: "review familiar songs, faces, and soothing routines",
    toddler: "review, celebrate, and reconnect the theme for families",
    preschool: "review, celebrate, and connect the theme for families",
  },
};

function dayFocusFor(band, dayKey) {
  const entry = DAY_FOCUS[dayKey] || DAY_FOCUS.monday;
  if (band.family === "Infant") return entry.infant;
  if (band.family === "Toddler") return entry.toddler;
  return entry.preschool;
}

function walkTxtFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTxtFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".txt") && !SKIP_FILES.has(entry.name)) acc.push(full);
  }
  return acc;
}

function firstSongTitle(plan) {
  const song = Array.isArray(plan.songs) && plan.songs[0];
  return song?.title || "a familiar classroom song";
}

function firstBookTitle(plan) {
  const book = Array.isArray(plan.books) && plan.books[0];
  if (!book?.title) return "a theme book";
  return book.author ? `${book.title} by ${book.author}` : book.title;
}

function vocabSnippet(plan, limit = 6) {
  const words = String(plan.vocabularyWords || "")
    .split(/\r?\n|,/)
    .map((w) => w.trim())
    .filter(Boolean);
  return words.slice(0, limit).join(", ") || plan.theme || "theme words";
}

function uniqLines(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function ensureNumberedSteps(stepsText, activity, band) {
  const existing = String(stepsText || "").trim();
  const count = countNumberedSteps(existing);
  if (count >= 3) {
    // Normalize to numbered lines when possible.
    const lines = existing.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.map((line, idx) => (/^\d+[\).]/.test(line) ? line : `${idx + 1}. ${line}`)).slice(0, 5).join("\n");
  }

  const title = activity.title || "the activity";
  const materials = activity.materials || "the prepared materials";
  if (band.family === "Infant") {
    return [
      `1. Prepare a calm space and place ${materials.toLowerCase().includes("mat") ? "the mat" : "materials"} within arm's reach.`,
      `2. Invite the infant into ${title} using a soft voice and unhurried pace.`,
      `3. Follow the infant's cues — pause or stop if they look away or fuss.`,
      `4. Narrate one or two simple theme words connected to ${activity.objective || "what they notice"}.`,
      `5. End gently with a brief cuddle, song, or transition cue.`,
    ].join("\n");
  }
  if (band.family === "Toddler") {
    return [
      `1. Show the materials for ${title} and name what children can do.`,
      `2. Model one simple step, then invite toddlers to try.`,
      `3. Stay close and offer help with one-to-two step directions.`,
      `4. Talk about the theme using simple words while children explore.`,
      `5. Help children clean up and transition with a short song or cue.`,
    ].join("\n");
  }
  return [
    `1. Introduce ${title} and connect it to today's theme focus.`,
    `2. Review materials and expectations, then model the first step.`,
    `3. Support children as they explore, asking open-ended theme questions.`,
    `4. Invite children to share one discovery with a peer or the group.`,
    `5. Clean up together and note one skill to celebrate.`,
  ].join("\n");
}

function fillActivityGaps(activity, plan, band, dayKey) {
  const theme = plan.theme || plan.title || "this week's theme";
  const next = { ...activity };
  const title = next.title || "Activity";

  if (!String(next.objective || "").trim()) {
    next.objective = `Support ${theme.toLowerCase()} learning through ${title.toLowerCase()}.`;
  }
  if (!String(next.description || "").trim()) {
    const setup = String(next.setup || "").trim();
    next.description = setup
      ? `${setup} Children explore ${theme.toLowerCase()} through ${title.toLowerCase()}.`
      : `Children explore ${theme.toLowerCase()} during ${title.toLowerCase()} with teacher support.`;
  }
  if (!String(next.setup || "").trim()) {
    next.setup = `Prepare materials for ${title} before children arrive and arrange a clear, supervised space.`;
  }
  if (!String(next.teacherRole || "").trim()) {
    if (band.family === "Infant") {
      next.teacherRole = `Stay within arm's reach, follow the infant's cues, and narrate ${theme.toLowerCase()} softly during ${title.toLowerCase()}.`;
    } else if (band.family === "Toddler") {
      next.teacherRole = `Model simple steps, stay close for support, and use short theme vocabulary during ${title.toLowerCase()}.`;
    } else {
      next.teacherRole = `Facilitate ${title.toLowerCase()}, ask open-ended questions, and connect discoveries back to ${theme.toLowerCase()}.`;
    }
  }
  if (!Array.isArray(next.learningGoals) || !next.learningGoals.filter(Boolean).length) {
    next.learningGoals = uniqLines([
      next.objective,
      `${theme} vocabulary and exploration`,
      band.family === "Infant" ? "Caregiver bonding and sensory attention" : "Hands-on engagement and skill practice",
    ]).slice(0, 3);
  }
  if (!String(next.observationOpportunities || "").trim()) {
    next.observationOpportunities = [
      `Engagement during ${title}`,
      `Use of ${theme.toLowerCase()} vocabulary or interest`,
      band.family === "Infant" ? "Cue reading and calm participation" : "Peer interaction and independence",
    ].join("\n");
  }
  if (!String(next.adaptations || "").trim()) {
    if (band.family === "Infant") {
      next.adaptations = `Shorten to ${band.activityLengthMinutes.min}–${band.activityLengthMinutes.max} minutes. Offer side-lying or supported positions. Stop immediately if the infant shows overstimulation cues.`;
    } else if (band.family === "Toddler") {
      next.adaptations = "Offer larger materials, hand-over-hand support, and a shorter turn. Allow parallel play instead of forced sharing.";
    } else {
      next.adaptations = "Provide visual steps, partner support, or a simplified materials set. Extend with an open-ended challenge for children ready for more.";
    }
  }
  if (!String(next.safetyNotes || "").trim()) {
    if (band.family === "Infant") {
      next.safetyNotes = "Remain within arm's reach at all times. Use only large, choke-safe materials. Never leave an infant unattended on a mat, changing surface, or near water.";
    } else if (band.family === "Toddler") {
      next.safetyNotes = "Supervise closely, keep materials too large to choke on, and clear walkways for active movement. Check outdoor surfaces before play.";
    } else {
      next.safetyNotes = "Supervise tools and materials, review allergy-safe consumables, and keep pathways clear during active or outdoor play.";
    }
  }

  next.steps = ensureNumberedSteps(next.steps || next.directions, next, band);

  // Strip age-inappropriate craft language from infant activities if it slipped into filled text only —
  // do not rewrite existing authored materials lists wholesale.
  return next;
}

function buildDailyTheme(plan, dayKey, items, band) {
  const theme = plan.theme || plan.title || "Weekly Theme";
  const focus = dayFocusFor(band, dayKey);
  const lead = items[0]?.title;
  return lead ? `${theme}: ${lead} and related play (${focus})` : `${theme} — ${focus}`;
}

function buildCircleTime(plan, band, dayKey, items) {
  const theme = plan.theme || plan.title || "our theme";
  const song = firstSongTitle(plan);
  const book = firstBookTitle(plan);
  if (band.family === "Infant") {
    return [
      `Soft hello with each infant's name and a calm face-to-face greeting.`,
      `Hum or sing "${song}" at a low volume while offering gentle movement or visual interest tied to ${theme.toLowerCase()}.`,
      `End with a brief look at ${book} or a theme picture card, watching for engagement cues.`,
    ];
  }
  if (band.family === "Toddler") {
    return [
      `Welcome song and name greeting connected to ${theme.toLowerCase()}.`,
      `Sing "${song}" with simple movements or props.`,
      `Show one prop or picture from today's activity (${items[0]?.title || theme}) and invite toddlers to name what they see.`,
    ];
  }
  return [
    `Morning greeting and brief share connected to ${theme.toLowerCase()}.`,
    `Sing "${song}" and preview today's focus: ${dayFocusFor(band, dayKey)}.`,
    `Read or revisit ${book} and ask 1–2 open-ended theme questions before centers.`,
  ];
}

function buildOutdoorPlay(plan, band, dayKey, items) {
  const theme = plan.theme || plan.title || "the theme";
  if (band.family === "Infant") {
    return `Take infants outdoors for fresh air on a shaded blanket or supervised stroller time. Narrate ${theme.toLowerCase()} sounds and sights for 1–5 minutes, staying within arm's reach and watching for overstimulation.`;
  }
  if (band.family === "Toddler") {
    return `Outdoor gross-motor play tied to ${theme.toLowerCase()}: animal walks, pushing/pulling, or simple theme movement games for 5–15 minutes with close supervision.`;
  }
  return `Outdoor gross-motor exploration connected to ${theme.toLowerCase()} — movement games, collaborative challenges, or nature observation linked to today's indoor activities (${items.map((i) => i.title).filter(Boolean).slice(0, 2).join(" / ") || dayKey}).`;
}

function needsAgeFocusRefresh(dayPlan, band) {
  const blob = [dayPlan.theme, asText(dayPlan.circleTime), dayPlan.outdoorPlay].join(" ");
  if (band.family === "Infant") {
    return /literacy, sensory, and language play|open-ended theme questions before centers|collaborative challenges/i.test(blob);
  }
  if (band.family === "Toddler") {
    return /literacy, sensory, and language play|open-ended theme questions before centers|kindergarten readiness/i.test(blob);
  }
  return false;
}

function fillDayGaps(dayPlan, plan, band, dayKey) {
  const items = Array.isArray(dayPlan.items) ? dayPlan.items.map((item) => fillActivityGaps(item, plan, band, dayKey)) : [];
  const next = { ...dayPlan, items };
  const refreshFocus = needsAgeFocusRefresh(next, band);

  if (!String(next.theme || "").trim() || refreshFocus) {
    next.theme = buildDailyTheme(plan, dayKey, items, band);
  }
  if (!String(next.objectives || "").trim()) {
    const objectives = uniqLines(items.map((item) => item.objective)).slice(0, 3);
    next.objectives = objectives.length
      ? objectives.join("\n")
      : `Explore ${plan.theme || "the weekly theme"} through today's hands-on activities.`;
  }
  if (!String(next.vocabulary || "").trim()) {
    next.vocabulary = vocabSnippet(plan);
  }
  if (!String(next.materials || "").trim()) {
    next.materials = uniqLines(items.map((item) => item.materials)).join("\n") || plan.weeklyMaterials || "Theme materials prepared for the day";
  }
  if (!Array.isArray(next.learningDomains) || !next.learningDomains.length) {
    next.learningDomains = Array.isArray(plan.learningDomains) && plan.learningDomains.length
      ? plan.learningDomains.slice(0, 4)
      : ["Language & Literacy", "Physical Development", "Social Emotional"];
  }
  if (!Array.isArray(next.circleTime) || !next.circleTime.filter(Boolean).length || refreshFocus) {
    next.circleTime = buildCircleTime(plan, band, dayKey, items);
  }
  if (!String(next.outdoorPlay || "").trim() || refreshFocus) {
    next.outdoorPlay = buildOutdoorPlay(plan, band, dayKey, items);
  }
  if (!Array.isArray(next.observations) || !next.observations.filter(Boolean).length) {
    next.observations = uniqLines([
      ...items.map((item) => asText(item.observationOpportunities).split(/\n/)[0]),
      `Participation and interest in ${plan.theme || "theme"} play`,
    ]).slice(0, 4);
  }
  if (!String(next.adaptations || "").trim()) {
    next.adaptations = String(plan.adaptations || "").trim()
      || (band.family === "Infant"
        ? "Offer shorter turns, alternative positions, and reduced sensory input as needed."
        : band.family === "Toddler"
          ? "Provide larger tools, visual cues, and adult co-play without requiring long seated work."
          : "Simplify steps, offer peer buddies, or extend with an open-ended challenge.");
  }
  if (!String(next.safetyNotes || "").trim()) {
    if (band.family === "Infant") {
      next.safetyNotes = "Arm's-reach supervision, choke-safe materials only, supervised tummy time, and no unattended water or elevated surfaces.";
    } else if (band.family === "Toddler") {
      next.safetyNotes = "Close supervision during movement and sensory play; avoid tiny pieces; check outdoor equipment before use.";
    } else {
      next.safetyNotes = "Supervise active play and tools; review allergy considerations; keep aisles clear during centers and outdoor games.";
    }
  }

  return next;
}

function refineInfantAgeLabel(plan) {
  // Keep exact ranges when already set. Only specialize generic "Infant" from content cues.
  const age = String(plan.age || "");
  if (/0\s*[–-]\s*6|6\s*[–-]\s*12/i.test(age)) return age;
  if (!/^infant$/i.test(age.trim())) return age;
  const blob = JSON.stringify(plan).toLowerCase();
  const olderCues = /crawl|pull(?:ing)? up|stacking cups|fill(?:ing)? and dump|container play|object permanence|splash tray|water play/;
  const youngerCues = /tummy time|high[- ]contrast|lullaby|newborn|0–6|face mirror|soft sounds/;
  if (olderCues.test(blob) && !youngerCues.test(blob)) return "Infant 6–12 Months";
  if (youngerCues.test(blob)) return "Infant 0–6 Months";
  return "Infant 0–6 Months";
}

function upgradePlan(plan) {
  const next = {
    ...plan,
    age: refineInfantAgeLabel(plan),
  };
  const band = resolveAgeBand(next.age);
  const dailyPlans = { ...(next.dailyPlans || {}) };
  for (const day of CURRICULUM_WEEKDAYS) {
    dailyPlans[day] = fillDayGaps(dailyPlans[day] || { items: [] }, next, band, day);
  }
  next.dailyPlans = dailyPlans;

  // Ensure weekly gold fields exist when blank (derive from theme only).
  if (!String(next.weeklyOverview || "").trim()) {
    next.weeklyOverview = `This week children explore ${next.theme || next.title} through developmentally appropriate play for ${band.label}.`;
  }
  if (!String(next.objectives || "").trim()) {
    next.objectives = band.focusAreas.slice(0, 4).map((f) => `Support ${f.toLowerCase()} through ${next.theme || "theme"} experiences.`).join("\n");
  }
  if (!String(next.weeklyMaterials || "").trim()) {
    const materials = [];
    for (const day of CURRICULUM_WEEKDAYS) {
      for (const item of dailyPlans[day].items || []) {
        if (item.materials) materials.push(item.materials);
      }
    }
    next.weeklyMaterials = uniqLines(materials).join("\n") || "Theme materials listed in daily activities";
  }
  if (!String(next.vocabularyWords || "").trim()) {
    next.vocabularyWords = String(next.theme || "explore, play, look, listen")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join("\n");
  }
  if ((!Array.isArray(next.books) || !next.books.length) && band.family === "Infant") {
    // Only use a universally appropriate real infant book when none exists.
    next.books = [{ title: "Global Babies", author: "The Global Fund for Children", notes: "Short face-looking moments; pair with theme picture cards already in the plan" }];
  }
  if ((!Array.isArray(next.songs) || !next.songs.length)) {
    next.songs = [{
      title: band.family === "Infant" ? "Twinkle Twinkle Little Star" : "If You're Happy and You Know It",
      notes: `Familiar song; adapt motions/lyrics lightly to ${next.theme || "the classroom theme"}`,
    }];
  }
  if (!String(next.familyConnection || "").trim()) {
    next.familyConnection = `At home, talk about ${next.theme || "this week's theme"} during everyday routines. Invite children to share one favorite classroom discovery.`;
  }
  if (!String(next.observationOpportunities || "").trim()) {
    next.observationOpportunities = `Observe engagement, vocabulary, and skill growth related to ${next.theme || "the weekly theme"} across the week.`;
  }
  if (!String(next.adaptations || "").trim()) {
    next.adaptations = band.family === "Infant"
      ? "Shorten sessions, offer positional support, and follow each infant's cues."
      : band.family === "Toddler"
        ? "Provide larger materials, visual cues, and adult co-play; avoid long seated work."
        : "Simplify multi-step tasks, offer peer support, and extend challenges for children ready for more.";
  }
  if (!Array.isArray(next.learningDomains) || !next.learningDomains.length) {
    next.learningDomains = ["Language & Literacy", "Physical Development", "Social Emotional", "Creative Arts"];
  }

  return next;
}

function processFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseCurriculumLessonPlanImport(raw);
  if (!parsed.data) {
    return { rel, status: "skip", reason: (parsed.errors || []).join("; ") || "no data" };
  }

  const before = auditLessonPlanAgainstStandards(parsed.data, { source: rel });
  const upgraded = upgradePlan(parsed.data);
  const after = auditLessonPlanAgainstStandards(upgraded, { source: rel });

  // Double-check: no age-inappropriate avoid hits introduced by upgrade fills.
  const newAgeHits = after.issues.filter((i) => i.code === "age_inappropriate");
  if (newAgeHits.length) {
    return {
      rel,
      status: "blocked",
      reason: newAgeHits.map((i) => i.detail).join(" | "),
      beforeIssues: before.issueCount,
      afterIssues: after.issueCount,
    };
  }

  const text = formatCurriculumLessonPlanImport(upgraded);
  if (!DRY_RUN) fs.writeFileSync(filePath, text, "utf8");

  return {
    rel,
    status: after.complete ? "complete" : "improved",
    beforeIssues: before.issueCount,
    afterIssues: after.issueCount,
    age: upgraded.age,
    theme: upgraded.theme,
    remaining: after.complete ? [] : after.issues.slice(0, 8).map((i) => i.detail),
  };
}

function main() {
  const files = IMPORT_DIRS.flatMap((dir) => walkTxtFiles(dir));
  const results = files.map(processFile);
  const summary = {
    dryRun: DRY_RUN,
    scanned: results.length,
    complete: results.filter((r) => r.status === "complete").length,
    improved: results.filter((r) => r.status === "improved").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    skipped: results.filter((r) => r.status === "skip").length,
  };
  console.log(JSON.stringify({ summary, results }, null, 2));
  if (summary.blocked) process.exitCode = 1;
}

main();
