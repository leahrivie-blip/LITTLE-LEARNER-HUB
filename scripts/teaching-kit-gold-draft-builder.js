/**
 * Teaching Kit gold enrichment draft builder (Farm Animals–style).
 * Pure CommonJS — draft upgrades only. Never publishes. Never invents image URLs.
 */
"use strict";

const LAST_EDITED_BY = "leahivie@icloud.com (draft upgrade assistant)";
const SCHEMA_VERSION = "gold-upgrade-batch-1";

const text = (v) => String(v == null ? "" : v).trim();
const asArray = (v) => (Array.isArray(v) ? v : []);

function uniqStrings(list, max) {
  const out = [];
  const seen = new Set();
  asArray(list).forEach((item) => {
    const v = text(item);
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  });
  return typeof max === "number" ? out.slice(0, max) : out;
}

function ageBandOf(value) {
  const raw = text(value).toLowerCase();
  if (/infant|0\s*-\s*6|0\s*-\s*12|6\s*-\s*12/.test(raw)) return "infant";
  if (/toddler/.test(raw)) return "toddler";
  return "preschool";
}

function activityBlob(activity) {
  return [activity?.title, activity?.activityCategory, activity?.category, activity?.description, activity?.objective, activity?.domain]
    .map(text).join(" ").toLowerCase();
}

/** Owner heuristics — always classified (never needs_owner_classification). */
function classifyImageRequirement(activity) {
  const blob = activityBlob(activity);
  if (/circle|morning meeting|\bsong\b|sing along|rhyme|chant|book|read-?aloud|story|conversation|movement|freeze dance|yoga|charades|gross motor/.test(blob)) {
    return "not_needed";
  }
  if (/mural|collage|self-?portrait|process art|\bcraft\b|open art|finished (product|example)|visual final/.test(blob)) {
    return "example_only";
  }
  if (/stem|laboratory|marble run|ramp|invitation to play|sensory bin|muddy|complicated|experiment|pour(ing)? station|water table/.test(blob)) {
    return /stem|laboratory|marble|ramp|experiment|complicated/.test(blob) ? "required" : "setup_only";
  }
  if (/dramatic play|pretend|discovery basket|provocation|loose parts|fine motor station/.test(blob)) {
    return /discovery basket|provocation|loose parts/.test(blob) ? "setup_only" : "optional";
  }
  if (/sensory|science|cooking|construction/.test(blob)) return "setup_only";
  if (/art|paint|draw|stamp|sculpt/.test(blob)) return "example_only";
  if (/sort|match|count|game|bingo|puzzle|literacy|social-?emotional|care|groom/.test(blob)) return "not_needed";
  return "optional";
}

function buildCompleteSong({ title, theme, day, originalLyrics, traditional } = {}) {
  const themeLabel = text(theme) || "the week";
  const songTitle = text(title) || `${text(theme) || "Theme"} Circle Song`;
  const isTraditional = traditional === true;
  const rightsStatus = isTraditional ? "public_domain" : "original";
  const dayPlacement = text(day) || "monday";
  const lyrics = text(originalLyrics);
  const out = {
    title: songTitle,
    rightsStatus,
    motions: isTraditional
      ? `Keep motions simple and theme-linked for ${themeLabel} (tap, sway, or gesture key words).`
      : `Model one motion per verse; invite children to add a gentle ${themeLabel} gesture.`,
    teacherDirections: `Introduce the title, model once at a slow pace, then invite join-in. Place on ${dayPlacement}.`,
    whenToUse: "Circle time transition or mid-morning reset before centers.",
    suggestedPace: "Slow and clear; pause for participation.",
    transitionPurpose: `Bridge into ${themeLabel} play with shared voice and motion.`,
    dayPlacement,
  };
  if (lyrics) out.lyrics = lyrics;
  return out;
}

function asPromptList(value, fallback) {
  const list = Array.isArray(value) ? uniqStrings(value) : uniqStrings(text(value).split(/\n+|;\s*/).filter(Boolean));
  return list.length ? list : [fallback];
}

function buildCompleteBook({ title, author, why, before, during, after, vocab, day, substitute } = {}) {
  return {
    title: text(title),
    author: text(author),
    whyThisBook: text(why) || "Supports the day's vocabulary and play invitation.",
    beforeReadingQuestions: asPromptList(before, "What do you notice on the cover?"),
    duringReadingPrompts: asPromptList(during, "What is happening on this page?"),
    afterReadingQuestions: asPromptList(after, "What part would you try in play today?"),
    vocabularyConnection: text(vocab),
    weekdayPlacement: text(day) || "monday",
    substituteTitle: text(substitute),
  };
}

function buildTeacherToolkit({ theme, ageBand } = {}) {
  const themeLabel = text(theme) || "this theme";
  const band = ageBandOf(ageBand);
  const prep = {
    infant: `Stage soft materials at floor level before arrival. Follow infant cues; keep ${themeLabel} invitations short and responsive.`,
    toddler: `Prep one tray at a time at toddler height. Keep ${themeLabel} materials chunky, washable, and mouthing-safe.`,
    preschool: `Stage centers before arrival and preview one open-ended ${themeLabel} invitation; step back so children lead.`,
  };
  const mixed = {
    infant: "Pair floor play with a nearby toddler shelf; older peers model gentle touch only with adult nearby.",
    toddler: "Younger toddlers explore with larger pieces; older peers get a second sorting rule or helper job.",
    preschool: "Offer a simpler parallel tray for younger friends and a design challenge for older preschoolers.",
  };
  return {
    teacherPreparation: prep[band],
    prepChecklist: [
      "Set materials at child height before arrival",
      `Preview one ${themeLabel} invitation aloud`,
      "Place cleanup caddy near the play space",
      "Review allergy and supervision notes for the day",
    ],
    observationFocus: [
      `Uses ${themeLabel} vocabulary in play`,
      "Persists with a material or peer exchange",
      "Shows interest or curiosity during invitations",
    ],
    observationPrompts: [
      "What language or gestures appear during play?",
      "How does the child enter and leave the invitation?",
      "Where do peers support or extend the idea?",
    ],
    documentationPrompts: [
      "Capture one moment of child-led exploration (with permission).",
      "Note a verbatim quote or gesture tied to the theme.",
    ],
    teacherTips: [
      "Model once, then narrate what you notice.",
      "Offer two choices instead of open-ended demands.",
      "Keep transitions short with a familiar song cue.",
    ],
    setupCleanupShortcuts: [
      "Trays labeled and stacked by day",
      "Damp cloth + bin for quick reset",
      "Spare substitution basket on the shelf",
    ],
    materialSubstitutions: [
      { need: "specialty tray", use: "cookie sheet or shallow lid" },
      { need: "theme props", use: "printed picture cards or recycled clean containers" },
    ],
    mixedAgeAdaptations: mixed[band],
    extraSupportAdaptations: "Sit beside, shorten the invitation, and offer hand-under-hand only when welcomed.",
    challengeExtensions: `Invite children to invent a new ${themeLabel} rule, map, or story for peers.`,
    safetyInclusionNotes: band === "preschool"
      ? "Supervise tools and active play; review allergies; keep pathways clear; use inclusive language."
      : "Supervise mouthing; avoid choking hazards; keep pathways clear; use inclusive, affirming language.",
    endOfWeekReflection: `Which ${themeLabel} words and strategies showed up most in play?`,
    familyConnection: `Share one ${themeLabel} word or song to try at home during ordinary routines.`,
    notes: "Draft toolkit for owner review — enrichment draft only.",
  };
}

function pickUniqueTips(candidates, usedTipsSet, count) {
  const used = usedTipsSet instanceof Set ? usedTipsSet : new Set();
  const picked = [];
  for (const tip of candidates) {
    const t = text(tip);
    if (!t) continue;
    const key = t.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    picked.push(t);
    if (picked.length >= count) break;
  }
  let n = 0;
  while (picked.length < count) {
    n += 1;
    const fallback = `Stay present and narrate one clear choice without taking over (${n}).`;
    used.add(fallback.toLowerCase());
    picked.push(fallback);
  }
  return picked;
}

function vocabForActivity(activity, theme, ageBand) {
  const themeWord = (text(theme).split(/\s+/)[0] || "explore").toLowerCase();
  const titleBits = text(activity?.title).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3).slice(0, 2);
  const band = ageBandOf(ageBand);
  const base = band === "infant"
    ? ["look", "touch", "soft", themeWord, "more"]
    : band === "toddler"
      ? ["mine", "help", "gentle", themeWord, "next"]
      : ["notice", "compare", "plan", themeWord, "share"];
  return uniqStrings([...titleBits, ...base], 5);
}

function adaptationsFor(ageBand, theme) {
  const band = ageBandOf(ageBand);
  const t = text(theme) || "the materials";
  if (band === "infant") {
    return {
      adaptations: `Follow the infant's gaze and pace; offer ${t} for short, supported exploration.`,
      extensions: "Add a second soft prop only if the infant stays engaged.",
      indoorAlternatives: "Floor mat invitation with one clear visual focus.",
      outdoorAlternatives: "Shaded blanket with the same soft materials when weather allows.",
      cleanupTip: "Wipe mouthed items immediately; return extras to a closed bin.",
      safetyNotes: "Stay within arm's reach; no small parts; watch for overstimulation.",
    };
  }
  if (band === "toddler") {
    return {
      adaptations: `Keep turns short and materials large enough for safe grasp while exploring ${t}.`,
      extensions: "Add a helper job or a second simple matching rule for older toddlers.",
      indoorAlternatives: "Table or rug version with fewer pieces if the room is busy.",
      outdoorAlternatives: "Move the tray to a shaded outdoor table for fresh-air play.",
      cleanupTip: "Use a two-bin reset: keep / wash.",
      safetyNotes: "Assume mouthing; avoid choking hazards; supervise closely.",
    };
  }
  return {
    adaptations: `Offer a parallel simpler tray and sit nearby for peer entry into ${t}.`,
    extensions: "Invite children to document or redesign the invitation for a friend.",
    indoorAlternatives: "Compress to a tabletop center if space is limited.",
    outdoorAlternatives: "Take clipboards or trays outdoors for related noticing.",
    cleanupTip: "Assign a child reset job with a photo cue on the shelf.",
    safetyNotes: "Supervise tools and active movement; review allergies before taste or soil play.",
  };
}

function settingTagsFor(activity) {
  const blob = activityBlob(activity);
  const tags = [/circle|large group|song|dance|celebration/.test(blob) ? "large_group" : "small_group"];
  tags.push(/outdoor|garden|nature walk|playground/.test(blob) ? "outdoor" : "indoor");
  if (/sensory|stem|art|science/.test(blob)) tags.push("center");
  return uniqStrings(tags);
}

function imageBriefsFor(requirement, activity, theme) {
  const title = text(activity?.title) || "activity";
  const t = text(theme) || "theme";
  const out = {};
  if (requirement === "required" || requirement === "setup_only") {
    out.imageBriefSetup = `Low table or floor setup for ${title}: ordinary ${t} materials, natural light, no staged clutter.`;
  }
  if (requirement === "required" || requirement === "example_only") {
    out.imageBriefExample = `Child-led ${title} in progress or finished process sample — real classroom materials, not stock art.`;
  }
  return out;
}

function buildActivityPatch(activity, { ageBand, theme, usedTipsSet } = {}) {
  const act = activity && typeof activity === "object" ? activity : {};
  const band = ageBandOf(ageBand || act.age);
  const themeLabel = text(theme) || "theme";
  const title = text(act.title) || "this activity";
  const teacherTips = pickUniqueTips([
    `Set materials for ${title} at child height before the invitation.`,
    `Model one move for ${title}, then step back and narrate.`,
    `Keep ${title} turns short so every child can enter.`,
    `Offer a substitution basket beside ${title}.`,
    `Place a cleanup cue photo near the ${title} shelf.`,
    `Preview the ${themeLabel} vocabulary word before ${title}.`,
    `Watch for peer coaching during ${title} and name it aloud.`,
    `Limit adult talk; use one open question during ${title}.`,
  ], usedTipsSet, 2);

  const materials = uniqStrings(text(act.materials).split(/,|\n/).map(text).filter(Boolean));
  const substitutions = [
    { need: materials[0] || "specialty prop", use: materials[0] ? "classroom substitute from the spare basket" : "picture card or recycled clean container" },
    { need: materials[1] || "tray", use: materials[1] ? "simple household stand-in" : "cookie sheet or shallow lid" },
  ];

  const existingReq = text(act.imageRequirement);
  const imageRequirement = existingReq && existingReq !== "needs_owner_classification"
    ? existingReq
    : classifyImageRequirement(act);
  const ageBits = adaptationsFor(band, themeLabel);

  return {
    teacherTips,
    substitutions,
    settingTags: settingTagsFor(act),
    observationPrompts: uniqStrings([
      text(act.observationOpportunities),
      `How does the child engage with ${title}?`,
      `What ${themeLabel} words or gestures appear?`,
      "Do they persist, request help, or invite a peer?",
    ], 3),
    vocabulary: vocabForActivity(act, themeLabel, band),
    imageRequirement,
    indoorAlternatives: ageBits.indoorAlternatives,
    outdoorAlternatives: ageBits.outdoorAlternatives,
    adaptations: ageBits.adaptations,
    extensions: ageBits.extensions,
    cleanupTip: ageBits.cleanupTip,
    safetyNotes: ageBits.safetyNotes,
    ...imageBriefsFor(imageRequirement, act, themeLabel),
  };
}

function mergeSongFromPack(entry, theme, bannedSet) {
  const title = text(entry?.title);
  if (!title || bannedSet.has(title.toLowerCase())) return null;
  return buildCompleteSong({
    title,
    theme,
    day: entry.day || entry.dayPlacement || entry.weekdayPlacement,
    originalLyrics: entry.lyrics || entry.originalLyrics,
    traditional: entry.traditional === true || /public_domain|traditional/i.test(text(entry.rightsStatus)),
  });
}

function mergeBookFromPack(entry) {
  if (!entry || !text(entry.title)) return null;
  return buildCompleteBook({
    title: entry.title,
    author: entry.author,
    why: entry.why || entry.whyThisBook,
    before: entry.before || entry.beforeReadingQuestions,
    during: entry.during || entry.duringReadingPrompts,
    after: entry.after || entry.afterReadingQuestions,
    vocab: entry.vocab || entry.vocabularyConnection,
    day: entry.day || entry.weekdayPlacement,
    substitute: entry.substitute || entry.substituteTitle,
  });
}

function resolveActivities(plan, activities) {
  if (asArray(activities).length) return asArray(activities);
  const out = [];
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    asArray(plan?.dailyPlans?.[day]?.items).forEach((item, idx) => {
      out.push({ ...item, id: text(item.id || item.itemId) || `${day}-${idx}`, day });
    });
  });
  return out;
}

function buildWeekDraft({ plan, activities, themePack } = {}) {
  const p = plan && typeof plan === "object" ? plan : {};
  const pack = themePack && typeof themePack === "object" ? themePack : {};
  const theme = text(pack.theme) || text(p.theme) || text(p.title) || "Theme";
  const ageBand = ageBandOf(pack.ageBand || p.age);
  const banned = new Set(asArray(pack.bannedSongTitles).map((t) => text(t).toLowerCase()).filter(Boolean));

  const packSongs = asArray(pack.songs).map((s) => mergeSongFromPack(s, theme, banned)).filter(Boolean);
  const planSongs = asArray(p.songs)
    .map((s) => mergeSongFromPack(s, theme, banned))
    .filter(Boolean)
    .filter((s) => !packSongs.some((ps) => ps.title.toLowerCase() === s.title.toLowerCase()));
  const songs = packSongs.length ? packSongs : planSongs;

  const packBooks = asArray(pack.books).map(mergeBookFromPack).filter(Boolean);
  const planBooks = asArray(p.books)
    .map(mergeBookFromPack)
    .filter(Boolean)
    .filter((b) => !packBooks.some((pb) => pb.title.toLowerCase() === b.title.toLowerCase()));

  const toolkit = buildTeacherToolkit({ theme, ageBand });
  if (text(pack.safetyNotes)) toolkit.safetyInclusionNotes = text(pack.safetyNotes);

  const week = {
    weeklyOverview: text(pack.overview) || text(p.weeklyOverview),
    weeklyMaterials: text(pack.materials) || text(p.weeklyMaterials),
    teacherPreparation: toolkit.teacherPreparation,
    familyConnection: text(pack.family) || text(p.familyConnection) || toolkit.familyConnection,
    milestones: asArray(pack.milestones).length ? asArray(pack.milestones) : asArray(p.milestones),
    vocabCards: asArray(pack.vocabCards),
    printableIdeas: asArray(pack.printableIdeas).length ? asArray(pack.printableIdeas) : asArray(p.printableIdeas),
    songs,
    books: [...packBooks, ...planBooks],
    teacherToolkit: toolkit,
  };
  const printableIds = asArray(pack.printableIds).length ? asArray(pack.printableIds) : asArray(p.resourceIds);
  if (printableIds.length) week.printableIds = printableIds.map(text).filter(Boolean);
  return week;
}

function applyOverride(base, override) {
  if (!override || typeof override !== "object") return base;
  const next = { ...base, ...override };
  ["teacherTips", "observationPrompts", "vocabulary", "settingTags", "substitutions"].forEach((key) => {
    if (override[key] != null) next[key] = asArray(override[key]);
  });
  ["setupImageUrl", "exampleImageUrl", "setupPhotoUrl", "examplePhotoUrl"].forEach((key) => {
    if (!text(next[key])) delete next[key];
  });
  return next;
}

function buildGoldEnrichmentDraft(plan, activities, themePack) {
  const p = plan && typeof plan === "object" ? plan : {};
  const pack = themePack && typeof themePack === "object" ? themePack : {};
  const theme = text(pack.theme) || text(p.theme) || text(p.title) || "Theme";
  const ageBand = ageBandOf(pack.ageBand || p.age);
  const list = resolveActivities(p, activities);
  const usedTipsSet = new Set();
  const overrides = pack.activityOverrides && typeof pack.activityOverrides === "object" ? pack.activityOverrides : {};

  const draftActivities = {};
  list.forEach((act) => {
    const key = text(act.id || act.itemId);
    if (!key) return;
    let patch = buildActivityPatch(act, { ageBand, theme, usedTipsSet });
    patch = applyOverride(patch, overrides[key]);
    patch = applyOverride(patch, overrides[text(act.title)]);
    draftActivities[key] = patch;
  });

  const week = buildWeekDraft({ plan: p, activities: list, themePack: pack });
  const enrichmentDraft = {
    activities: draftActivities,
    week,
    updatedAt: new Date().toISOString(),
    lastEditedBy: LAST_EDITED_BY,
    previewReady: false,
    schemaVersion: SCHEMA_VERSION,
  };

  return {
    enrichmentDraft,
    meta: {
      theme,
      ageBand,
      activityCount: Object.keys(draftActivities).length,
      schemaVersion: SCHEMA_VERSION,
      lastEditedBy: LAST_EDITED_BY,
      purpose: "gold-upgrade-batch draft only — not published",
    },
  };
}

module.exports = {
  classifyImageRequirement,
  buildCompleteSong,
  buildCompleteBook,
  buildTeacherToolkit,
  buildActivityPatch,
  buildWeekDraft,
  buildGoldEnrichmentDraft,
};
