/**
 * AI Curriculum Operator — Phase 5 songs + books only.
 *
 * Inspect → KEEP/ADD/IMPROVE/REPLACE/NOT_NEEDED (songs)
 *         → KEEP/ADD/IMPROVE_GUIDE/REPLACE/NOT_NEEDED (books)
 * Write enrichmentDraft.week.songs / .books only.
 * Never invents commercial book titles. Never generates copyrighted lyrics.
 * Never mutates images, printables, publish, or lesson.create.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
const SONG_DECISIONS = Object.freeze(["KEEP", "ADD", "IMPROVE", "REPLACE", "NOT_NEEDED"]);
const BOOK_DECISIONS = Object.freeze(["KEEP", "ADD", "IMPROVE_GUIDE", "REPLACE", "NOT_NEEDED"]);

/** Fixture / trusted titles only — never invent commercial books outside this set in CI. */
const VERIFIED_BOOK_LIBRARY = Object.freeze([
  {
    id: "vb-weather-1",
    title: "What Will the Weather Be?",
    author: "Lynda DeWitt",
    themes: ["weather", "science"],
    ageBands: ["toddler", "preschool"],
  },
  {
    id: "vb-weather-2",
    title: "Rain",
    author: "Robert Kalan",
    themes: ["weather", "rain"],
    ageBands: ["infant", "toddler", "preschool"],
  },
  {
    id: "vb-apple-1",
    title: "Apples and Pumpkins",
    author: "Anne Rockwell",
    themes: ["apples", "fall", "harvest"],
    ageBands: ["toddler", "preschool"],
  },
  {
    id: "vb-feelings-1",
    title: "The Way I Feel",
    author: "Janan Cain",
    themes: ["feelings", "social-emotional"],
    ageBands: ["toddler", "preschool"],
  },
]);

const COPYRIGHT_LYRIC_RE = /\b(disney|peppa|frozen|elsa|spiderman|barbie|let it go|baby shark)\b/i;
const GENERIC_QUESTION_RE = /^(what do you see\??|did you like the story\??|what happened\??)$/i;

function text(value, max = 2000) {
  return schema.text(value, max);
}

function ageKind(ageRaw) {
  const a = text(ageRaw, 80).toLowerCase();
  if (/infant|0\s*[-–]\s*12|baby/i.test(a)) return "infant";
  if (/toddler|12\s*[-–]\s*24|18\s*[-–]\s*24|1\s*[-–]\s*2/i.test(a)) return "toddler";
  if (/preschool|pre-?k|3\s*[-–]\s*5|4\s*[-–]\s*5/i.test(a)) return "preschool";
  return "mixed";
}

function normalizeSongDecision(value) {
  const key = text(value, 40).toUpperCase().replace(/\s+/g, "_");
  if (key === "MISSING" || key === "FILL") return "ADD";
  if (SONG_DECISIONS.includes(key)) return key;
  return "NOT_NEEDED";
}

function normalizeBookDecision(value) {
  const key = text(value, 40).toUpperCase().replace(/\s+/g, "_");
  if (key === "MISSING" || key === "FILL") return "ADD";
  if (key === "IMPROVE") return "IMPROVE_GUIDE";
  if (BOOK_DECISIONS.includes(key)) return key;
  return "NOT_NEEDED";
}

function draftSongs(plan) {
  const week = plan?.enrichmentDraft?.week || {};
  if (schema.asArray(week.songs).length) return schema.asArray(week.songs);
  return schema.asArray(plan?.songs);
}

function draftBooks(plan) {
  const week = plan?.enrichmentDraft?.week || {};
  if (schema.asArray(week.books).length) return schema.asArray(week.books);
  return schema.asArray(plan?.books);
}

function songLooksWeak(song) {
  const blob = `${song?.title || ""} ${song?.notes || ""} ${song?.lyrics || ""}`;
  if (COPYRIGHT_LYRIC_RE.test(blob)) return true;
  if (/lorem|todo|placeholder|tbd|sample song/i.test(blob)) return true;
  if (!text(song?.title, 80)) return true;
  const lyrics = text(song?.lyrics, 800);
  if (lyrics && !/original|public.?domain|traditional/i.test(String(song?.rightsStatus || ""))
    && song?.allowPrintLyrics !== true) {
    // Lyrics present without rights — treat as needing REPLACE with original
    return true;
  }
  return false;
}

function bookGuideLooksThin(book) {
  const why = text(book?.whyThisBook || book?.whyItFits, 400);
  const after = schema.asArray(book?.afterReadingQuestions || book?.questions);
  const before = schema.asArray(book?.beforeReadingQuestions);
  if (!why && after.length < 2 && before.length < 1) return true;
  const genericCount = after.filter((q) => GENERIC_QUESTION_RE.test(text(q, 120))).length;
  if (after.length && genericCount === after.length) return true;
  return false;
}

function isLibrarySearchTitle(title) {
  return /^search (your |the )?classroom library/i.test(text(title, 180));
}

function findVerifiedBook(title, author = "") {
  const t = text(title, 180).toLowerCase();
  const a = text(author, 120).toLowerCase();
  return VERIFIED_BOOK_LIBRARY.find((b) => (
    b.title.toLowerCase() === t
    && (!a || b.author.toLowerCase() === a || a.includes(b.author.toLowerCase().split(" ").pop()))
  )) || null;
}

function matchVerifiedBooksForLesson(plan, limit = 2) {
  const theme = `${text(plan?.theme, 80)} ${text(plan?.title, 120)}`.toLowerCase();
  const age = ageKind(plan?.age);
  return VERIFIED_BOOK_LIBRARY
    .filter((b) => b.ageBands.includes(age) || age === "mixed")
    .filter((b) => b.themes.some((th) => theme.includes(th)) || /weather|apple|feel|friend/i.test(theme))
    .slice(0, limit);
}

/**
 * Build song/book action plan from audit + existing content.
 */
function buildSongBookActionsFromAudit(plan, activities, audit) {
  const songs = draftSongs(plan);
  const books = draftBooks(plan);
  const songActions = [];
  const bookActions = [];

  schema.asArray(audit?.songs).forEach((dayDec) => {
    const day = text(dayDec.field, 40).replace(/^song\./i, "").toLowerCase();
    if (!WEEKDAYS.includes(day)) return;
    const existing = songs.filter((s) => text(s.linkedWeekday || s.suggestedWeekday || s.day, 20).toLowerCase() === day);
    let decision = "NOT_NEEDED";
    let reason = text(dayDec.reason, 400);
    let song = existing[0] || null;

    if (existing.length && !songLooksWeak(existing[0])) {
      decision = "KEEP";
      reason = reason || "Age-appropriate song already linked for this weekday.";
    } else if (existing.length && songLooksWeak(existing[0])) {
      decision = "REPLACE";
      reason = "Existing song looks weak, placeholder, or copyright-risky; replace with an original LLH song.";
    } else if (dayDec.decision === "MISSING" || dayDec.decision === "FILL") {
      // Count existing links plus ADDs already planned in this pass — do not force a song every day.
      const linkedCount = songs.filter((s) => WEEKDAYS.includes(text(s.linkedWeekday || s.day, 20).toLowerCase())).length;
      const plannedAdds = songActions.filter((a) => a.decision === "ADD" || a.decision === "REPLACE").length;
      if (linkedCount + plannedAdds >= 3) {
        decision = "NOT_NEEDED";
        reason = "Week already has several day-linked songs; another song is not required for this day.";
      } else {
        decision = "ADD";
        reason = "No song linked; an original short classroom song would support the day.";
      }
    } else if (dayDec.decision === "IMPROVE") {
      decision = existing.length ? "IMPROVE" : "ADD";
      reason = reason || "Song coverage needs day-linking or a clearer original song.";
    } else if (dayDec.decision === "KEEP") {
      decision = "KEEP";
    }

    songActions.push({
      kind: "song",
      weekday: day,
      decision,
      reason,
      existingTitle: text(song?.title, 120),
      status: "pending",
      idempotencyKey: `song:${plan.id}:${day}:${decision}`,
    });
  });

  const bookDec = audit?.books || {};
  const primary = books[0] || null;
  let bookDecision = "NOT_NEEDED";
  let bookReason = text(bookDec.reason, 400);
  if (primary && findVerifiedBook(primary.title, primary.author)) {
    bookDecision = bookGuideLooksThin(primary) ? "IMPROVE_GUIDE" : "KEEP";
    bookReason = bookDecision === "KEEP"
      ? "Verified age-appropriate book already linked."
      : "Verified book is strong; discussion guide needs age-specific questions.";
  } else if (primary && isLibrarySearchTitle(primary.title)) {
    bookDecision = bookGuideLooksThin(primary) ? "IMPROVE_GUIDE" : "KEEP";
    bookReason = "Classroom-library search prompt is acceptable when no verified title is selected.";
  } else if (primary && !findVerifiedBook(primary.title, primary.author) && !isLibrarySearchTitle(primary.title)) {
    // Unverified commercial-looking title — do not KEEP as verified; IMPROVE_GUIDE only if guide exists else REPLACE with library search / verified
    bookDecision = "REPLACE";
    bookReason = "Book title is not in the verified library; replace with a verified title or classroom-library search prompt.";
  } else if (!primary && (bookDec.decision === "FILL" || bookDec.decision === "MISSING" || !bookDec.decision)) {
    bookDecision = "ADD";
    bookReason = "No book listed; add a verified library match or classroom-library search prompt.";
  } else if (bookDec.decision === "IMPROVE") {
    bookDecision = "IMPROVE_GUIDE";
    bookReason = bookReason || "Book guidance is thin.";
  } else if (bookDec.decision === "KEEP") {
    bookDecision = "KEEP";
  }

  bookActions.push({
    kind: "book",
    decision: bookDecision,
    reason: bookReason,
    existingTitle: text(primary?.title, 180),
    existingAuthor: text(primary?.author, 120),
    status: "pending",
    idempotencyKey: `book:${plan.id}:${bookDecision}:${text(primary?.title, 80) || "none"}`,
  });

  return { songActions, bookActions };
}

function summarizeSongBookActions(songActions, bookActions) {
  const songCounts = { KEEP: 0, ADD: 0, IMPROVE: 0, REPLACE: 0, NOT_NEEDED: 0, FAILED: 0, SUCCESS: 0 };
  const bookCounts = {
    KEEP: 0, ADD: 0, IMPROVE_GUIDE: 0, REPLACE: 0, NOT_NEEDED: 0, FAILED: 0, SUCCESS: 0,
  };
  schema.asArray(songActions).forEach((a) => {
    const d = normalizeSongDecision(a.decision);
    if (songCounts[d] != null) songCounts[d] += 1;
    if (a.status === "failed") songCounts.FAILED += 1;
    if (a.status === "success" && ["ADD", "IMPROVE", "REPLACE"].includes(d)) songCounts.SUCCESS += 1;
  });
  schema.asArray(bookActions).forEach((a) => {
    const d = normalizeBookDecision(a.decision);
    if (bookCounts[d] != null) bookCounts[d] += 1;
    if (a.status === "failed") bookCounts.FAILED += 1;
    if (a.status === "success" && ["ADD", "IMPROVE_GUIDE", "REPLACE"].includes(d)) bookCounts.SUCCESS += 1;
  });
  return { songCounts, bookCounts };
}

function buildOriginalSongForDay({ plan, activities, weekday, age }) {
  const kind = ageKind(age || plan?.age);
  const theme = text(plan?.theme || plan?.title, 80) || "Our Day";
  const dayActs = schema.asArray(activities).filter((a) => text(a.dayOfWeek, 20).toLowerCase() === weekday);
  const focus = text(dayActs[0]?.title || theme, 60);
  const title = kind === "infant"
    ? `${theme} Soft Song`
    : kind === "toddler"
      ? `${theme} Move Along`
      : `${theme} Circle Song`;

  let lyrics;
  let motions;
  if (kind === "infant") {
    lyrics = [
      `Hello little one, ${theme.toLowerCase()} is here,`,
      "Soft and slow, I hold you near.",
      "Listen, listen, soft we sway,",
      "Loving voices guide our day.",
    ].join("\n");
    motions = "Caregiver sways gently, pats rhythm on lap, uses calm voice.";
  } else if (kind === "toddler") {
    lyrics = [
      `${theme}, ${theme}, look and see,`,
      `Clap with me, clap with me!`,
      `We can move and we can play,`,
      `Learning ${focus.toLowerCase()} today!`,
    ].join("\n");
    motions = "Clap on the beat; march in place; freeze on the last word.";
  } else {
    lyrics = [
      `Come to the circle, friends sit near,`,
      `Today we notice ${theme.toLowerCase()} here.`,
      `Use your words and use your eyes,`,
      `Ready, set — we can try!`,
    ].join("\n");
    motions = "Pat knees for verses; point to classroom cues; stand for the last line.";
  }

  return {
    title: text(title, 120),
    linkedWeekday: weekday,
    rightsStatus: "original",
    allowPrintLyrics: true,
    lyrics,
    motions,
    notes: `Original Little Learner Hub classroom song for ${weekday} — supports ${focus}.`,
    teacherDirections: `Sing before or after “${focus}”. Keep it short; invite children to join the motions.`,
    whenToUse: `${weekday} circle / transition`,
    purpose: `Theme vocabulary and participation for ${theme}.`,
    ageBand: text(plan?.age, 80),
  };
}

function buildBookGuideQuestions(book, plan, age) {
  const kind = ageKind(age || plan?.age);
  const theme = text(plan?.theme || plan?.title, 60);
  const title = text(book?.title, 120);
  if (kind === "infant") {
    return {
      beforeReadingQuestions: [`Can you find something in the pictures about ${theme.toLowerCase()}?`],
      duringReadingPrompts: ["Let's point to what we see.", "Listen to this sound word."],
      afterReadingQuestions: ["Can you pat the book gently?", "What did we look at together?"],
      whyThisBook: `Simple shared looking for ${theme}; caregiver names pictures and sounds.`,
    };
  }
  if (kind === "toddler") {
    return {
      beforeReadingQuestions: [
        `What do you think we will see about ${theme.toLowerCase()}?`,
        "Can you show me the cover with your finger?",
      ],
      duringReadingPrompts: [
        "Point to the part that matches our classroom.",
        "Can you copy this word with me?",
      ],
      afterReadingQuestions: [
        `What did the characters notice about ${theme.toLowerCase()}?`,
        "Which picture was your favorite?",
        "How can we use one idea from the book in play?",
        `What word from “${title}” can we say again?`,
      ],
      whyThisBook: `Short, concrete prompts connect “${title}” to our ${theme} week.`,
    };
  }
  return {
    beforeReadingQuestions: [
      `Looking at the cover, what do you predict about ${theme.toLowerCase()}?`,
      "What clues do you notice before we start?",
    ],
    duringReadingPrompts: [
      "What might happen next?",
      "How is this like something we already tried this week?",
    ],
    afterReadingQuestions: [
      `What problem or discovery showed up in “${title}”?`,
      "How is that the same or different from our classroom activity?",
      `Which weather/feeling/idea words can we reuse during play?`,
      "If we wrote one more page, what would you add?",
    ],
    whyThisBook: `Supports ${theme} vocabulary and connects read-aloud talk to classroom investigation.`,
  };
}

function validateSongEntry(song) {
  const errors = [];
  if (!text(song?.title, 120)) errors.push("missing_song_title");
  if (!WEEKDAYS.includes(text(song?.linkedWeekday, 20).toLowerCase())) errors.push("missing_weekday");
  if (COPYRIGHT_LYRIC_RE.test(`${song?.title || ""} ${song?.lyrics || ""}`)) {
    errors.push("copyrighted_lyric_content");
  }
  const rights = text(song?.rightsStatus, 40).toLowerCase();
  if (text(song?.lyrics, 20) && !["original", "public-domain", "public_domain", "traditional"].includes(rights)
    && song?.allowPrintLyrics !== true) {
    errors.push("lyrics_without_rights");
  }
  if (text(song?.lyrics, 800).split(/\n/).filter(Boolean).length > 12) errors.push("song_too_long");
  return { ok: errors.length === 0, errors };
}

function validateBookEntry(book, { allowLibrarySearch = true } = {}) {
  const errors = [];
  const title = text(book?.title, 180);
  if (!title) errors.push("missing_book_title");
  const verified = findVerifiedBook(title, book?.author);
  const librarySearch = isLibrarySearchTitle(title);
  if (!verified && !(allowLibrarySearch && librarySearch)) {
    errors.push("fabricated_or_unverified_book_title");
  }
  if (verified && text(book?.author, 120) && text(book.author, 120).toLowerCase() !== verified.author.toLowerCase()) {
    // Allow minor author variance only if empty; wrong author rejected
    if (text(book.author, 120) && !verified.author.toLowerCase().includes(text(book.author, 40).toLowerCase())
      && !text(book.author, 120).toLowerCase().includes(verified.author.toLowerCase().split(" ").pop())) {
      errors.push("wrong_book_metadata");
    }
  }
  if (/harry potter and the invented|made.?up bestseller|fake book/i.test(title)) {
    errors.push("fabricated_or_unverified_book_title");
  }
  return { ok: errors.length === 0, errors, verified: Boolean(verified), librarySearch };
}

function applySongBookPlanToDraft(previousDraft, { songsToUpsert = [], booksToSet = null } = {}) {
  const draft = previousDraft && typeof previousDraft === "object"
    ? JSON.parse(JSON.stringify(previousDraft))
    : { week: {}, activities: {} };
  if (!draft.week || typeof draft.week !== "object") draft.week = {};
  if (!Array.isArray(draft.week.songs)) draft.week.songs = [];
  const changed = [];

  schema.asArray(songsToUpsert).forEach((song) => {
    const day = text(song.linkedWeekday, 20).toLowerCase();
    const check = validateSongEntry(song);
    if (!check.ok) return;
    // Replace same weekday entries when IMPROVE/REPLACE; skip duplicate ADD
    draft.week.songs = draft.week.songs.filter((s) => text(s.linkedWeekday || s.day, 20).toLowerCase() !== day);
    draft.week.songs.push(song);
    changed.push({ path: `week.songs.${day}`, title: song.title });
  });

  if (Array.isArray(booksToSet)) {
    const validBooks = [];
    booksToSet.forEach((book) => {
      const check = validateBookEntry(book);
      if (!check.ok) return;
      validBooks.push(book);
    });
    if (validBooks.length) {
      draft.week.books = validBooks.slice(0, 5);
      changed.push({ path: "week.books", count: validBooks.length });
    }
  }

  draft.updatedAt = new Date().toISOString();
  draft.operatorPhase = 5;
  return { ok: true, enrichmentDraft: draft, changed };
}

function stripJsonFences(raw) {
  const s = String(raw || "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

function buildSongBookPlannerSystemPrompt(ageRaw) {
  const kind = ageKind(ageRaw);
  return [
    "You are the Little Learner Hub songs+books planner.",
    "Return ONLY JSON with keys: songs[], books[].",
    "Songs must be ORIGINAL classroom songs (rightsStatus original). Never output copyrighted commercial lyrics.",
    "Books must be either a title from verifiedLibrary OR a 'Search your classroom library for …' prompt.",
    "Do not invent commercial published book titles.",
    `Age focus: ${kind}. Keep songs short and singable.`,
    "Song fields: title, linkedWeekday, lyrics, motions, teacherDirections, notes, rightsStatus, allowPrintLyrics.",
    "Book fields: title, author, whyThisBook, beforeReadingQuestions, afterReadingQuestions, suggestedWeekday.",
  ].join("\n");
}

function buildSongBookPlannerUserPrompt(context) {
  return ["Plan songs and books for this lesson.", "Context JSON:", JSON.stringify(context)].join("\n");
}

function buildSongBookContext({ plan, activities, songActions, bookActions }) {
  return {
    lesson: {
      id: text(plan?.id, 160),
      title: text(plan?.title, 180),
      age: text(plan?.age, 80),
      theme: text(plan?.theme, 80),
    },
    activities: schema.asArray(activities).slice(0, 20).map((a) => ({
      id: text(a.id, 160),
      title: text(a.title, 120),
      dayOfWeek: text(a.dayOfWeek, 20),
    })),
    songActions: schema.asArray(songActions).map((a) => ({
      weekday: a.weekday,
      decision: a.decision,
      reason: a.reason,
    })),
    bookActions: schema.asArray(bookActions).map((a) => ({
      decision: a.decision,
      reason: a.reason,
      existingTitle: a.existingTitle,
    })),
    verifiedLibrary: VERIFIED_BOOK_LIBRARY.map((b) => ({
      title: b.title,
      author: b.author,
      themes: b.themes,
    })),
  };
}

function buildOperatorSongBookAiFixtureResponse(userPrompt) {
  let ctx = {};
  try {
    const raw = String(userPrompt || "");
    const start = raw.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < raw.length; i += 1) {
        if (raw[i] === "{") depth += 1;
        if (raw[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            ctx = JSON.parse(raw.slice(start, i + 1));
            break;
          }
        }
      }
    }
  } catch (_e) {
    ctx = {};
  }
  const plan = {
    id: ctx.lesson?.id,
    title: ctx.lesson?.title,
    age: ctx.lesson?.age,
    theme: ctx.lesson?.theme,
  };
  const activities = schema.asArray(ctx.activities);
  const songs = [];
  schema.asArray(ctx.songActions).forEach((a) => {
    const d = normalizeSongDecision(a.decision);
    if (!["ADD", "IMPROVE", "REPLACE"].includes(d)) return;
    songs.push(buildOriginalSongForDay({
      plan,
      activities,
      weekday: text(a.weekday, 20).toLowerCase(),
      age: plan.age,
    }));
  });

  const books = [];
  schema.asArray(ctx.bookActions).forEach((a) => {
    const d = normalizeBookDecision(a.decision);
    if (!["ADD", "IMPROVE_GUIDE", "REPLACE"].includes(d)) return;
    const matches = matchVerifiedBooksForLesson(plan, 1);
    let book;
    if (matches[0]) {
      book = {
        title: matches[0].title,
        author: matches[0].author,
        suggestedWeekday: "tuesday",
        verifiedLibraryId: matches[0].id,
      };
    } else {
      book = {
        title: `Search your classroom library for a ${text(plan.theme || plan.title, 40)} picture book`,
        author: "",
        suggestedWeekday: "tuesday",
      };
    }
    const guide = buildBookGuideQuestions(book, plan, plan.age);
    books.push({ ...book, ...guide });
  });

  return JSON.stringify({
    lessonId: plan.id,
    songs,
    books,
  });
}

function validateSongBookPlannerOutput(rawText, { plan, songActions, bookActions }) {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch (_e) {
    return { ok: false, code: "invalid_json", error: "Songs/books planner output is not valid JSON." };
  }
  if (parsed.lessonId && text(parsed.lessonId, 160) !== text(plan?.id, 160)) {
    return { ok: false, code: "wrong_lesson_id", error: "Planner lessonId mismatch." };
  }

  const writeSongDays = new Set(
    schema.asArray(songActions)
      .filter((a) => ["ADD", "IMPROVE", "REPLACE"].includes(normalizeSongDecision(a.decision)))
      .map((a) => a.weekday),
  );
  const songs = [];
  for (const song of schema.asArray(parsed.songs)) {
    const day = text(song.linkedWeekday || song.day, 20).toLowerCase();
    if (!writeSongDays.has(day) && writeSongDays.size) continue;
    const normalized = {
      ...song,
      linkedWeekday: day,
      rightsStatus: "original",
      allowPrintLyrics: true,
      lyrics: text(song.lyrics, 1200),
      motions: text(song.motions, 400),
      title: text(song.title, 120),
      notes: text(song.notes, 400),
      teacherDirections: text(song.teacherDirections || song.directions, 400),
    };
    const check = validateSongEntry(normalized);
    if (!check.ok) {
      return { ok: false, code: "invalid_song", error: check.errors.join(", ") };
    }
    songs.push(normalized);
  }

  const needsBookWrite = schema.asArray(bookActions).some((a) => (
    ["ADD", "IMPROVE_GUIDE", "REPLACE"].includes(normalizeBookDecision(a.decision))
  ));
  let books = null;
  if (needsBookWrite) {
    books = [];
    for (const book of schema.asArray(parsed.books).slice(0, 3)) {
      const normalized = {
        title: text(book.title, 180),
        author: text(book.author, 120),
        whyThisBook: text(book.whyThisBook, 600),
        beforeReadingQuestions: schema.asArray(book.beforeReadingQuestions).map((q) => text(q, 200)).filter(Boolean).slice(0, 6),
        afterReadingQuestions: schema.asArray(book.afterReadingQuestions || book.questions).map((q) => text(q, 200)).filter(Boolean).slice(0, 8),
        duringReadingPrompts: schema.asArray(book.duringReadingPrompts).map((q) => text(q, 200)).filter(Boolean).slice(0, 6),
        suggestedWeekday: text(book.suggestedWeekday || "tuesday", 20).toLowerCase(),
        notes: text(book.notes, 400),
      };
      const check = validateBookEntry(normalized);
      if (!check.ok) {
        return { ok: false, code: "invalid_book", error: check.errors.join(", ") };
      }
      books.push(normalized);
    }
    if (!books.length) {
      return { ok: false, code: "missing_books", error: "Book write requested but no valid books returned." };
    }
  }

  return { ok: true, songs, books };
}

async function planSongsAndBooks({
  plan,
  activities,
  audit,
  callAi,
  alreadySucceededKeys = new Set(),
} = {}) {
  const { songActions, bookActions } = buildSongBookActionsFromAudit(plan, activities, audit);
  const pendingSongs = songActions.filter((a) => {
    if (alreadySucceededKeys.has(a.idempotencyKey)) {
      a.status = "skipped";
      a.reason = `${a.reason} (resume skip)`;
      return false;
    }
    return ["ADD", "IMPROVE", "REPLACE"].includes(a.decision);
  });
  const pendingBooks = bookActions.filter((a) => {
    if (alreadySucceededKeys.has(a.idempotencyKey)) {
      a.status = "skipped";
      a.reason = `${a.reason} (resume skip)`;
      return false;
    }
    return ["ADD", "IMPROVE_GUIDE", "REPLACE"].includes(a.decision);
  });

  // Mark KEEP/NOT_NEEDED skipped with zero AI
  songActions.forEach((a) => {
    if (["KEEP", "NOT_NEEDED"].includes(a.decision) && a.status === "pending") a.status = "skipped";
  });
  bookActions.forEach((a) => {
    if (["KEEP", "NOT_NEEDED"].includes(a.decision) && a.status === "pending") a.status = "skipped";
  });

  if (!pendingSongs.length && !pendingBooks.length) {
    return {
      ok: true,
      skipped: true,
      songActions,
      bookActions,
      enrichmentDraft: plan?.enrichmentDraft || null,
      changed: false,
      usage: { songPlannerCalls: 0, bookGuideCalls: 0 },
    };
  }

  if (typeof callAi !== "function") {
    return {
      ok: false,
      code: "ai_required",
      error: "Songs/books planner requires callAi.",
      songActions,
      bookActions,
      usage: { songPlannerCalls: 0, bookGuideCalls: 0 },
    };
  }

  const context = buildSongBookContext({ plan, activities, songActions: pendingSongs, bookActions: pendingBooks });
  const system = buildSongBookPlannerSystemPrompt(plan?.age);
  const user = buildSongBookPlannerUserPrompt(context);
  let raw;
  try {
    raw = await callAi(system, user);
  } catch (error) {
    return {
      ok: false,
      code: "ai_call_failed",
      error: text(error?.message || "songs/books AI failed", 400),
      songActions,
      bookActions,
      usage: { songPlannerCalls: 1, bookGuideCalls: pendingBooks.length ? 1 : 0 },
    };
  }

  const validated = validateSongBookPlannerOutput(raw, { plan, songActions: pendingSongs, bookActions: pendingBooks });
  if (!validated.ok) {
    return {
      ok: false,
      ...validated,
      songActions: songActions.map((a) => (
        pendingSongs.some((p) => p.idempotencyKey === a.idempotencyKey)
          ? { ...a, status: "failed", error: validated.error }
          : a
      )),
      bookActions: bookActions.map((a) => (
        pendingBooks.some((p) => p.idempotencyKey === a.idempotencyKey)
          ? { ...a, status: "failed", error: validated.error }
          : a
      )),
      usage: { songPlannerCalls: 1, bookGuideCalls: pendingBooks.length ? 1 : 0 },
    };
  }

  // Deterministic fill if AI returned empty songs for pending days
  let songs = validated.songs;
  if (!songs.length && pendingSongs.length) {
    songs = pendingSongs.map((a) => buildOriginalSongForDay({
      plan,
      activities,
      weekday: a.weekday,
      age: plan?.age,
    }));
  }
  let books = validated.books;
  if (pendingBooks.length && (!books || !books.length)) {
    const match = matchVerifiedBooksForLesson(plan, 1)[0];
    const base = match
      ? { title: match.title, author: match.author, verifiedLibraryId: match.id, suggestedWeekday: "tuesday" }
      : {
        title: `Search your classroom library for a ${text(plan?.theme || plan?.title, 40)} picture book`,
        author: "",
        suggestedWeekday: "tuesday",
      };
    books = [{ ...base, ...buildBookGuideQuestions(base, plan, plan?.age) }];
  }

  const applied = applySongBookPlanToDraft(plan?.enrichmentDraft, {
    songsToUpsert: songs,
    booksToSet: books,
  });

  const songResults = songActions.map((a) => {
    if (!pendingSongs.some((p) => p.idempotencyKey === a.idempotencyKey)) return a;
    const created = songs.find((s) => s.linkedWeekday === a.weekday);
    return {
      ...a,
      status: created ? "success" : "failed",
      title: created?.title,
      song: created || null,
      error: created ? undefined : "song_not_produced",
    };
  });
  const bookResults = bookActions.map((a) => {
    if (!pendingBooks.some((p) => p.idempotencyKey === a.idempotencyKey)) return a;
    const book = schema.asArray(books)[0];
    return {
      ...a,
      status: book ? "success" : "failed",
      title: book?.title,
      author: book?.author,
      book: book || null,
      error: book ? undefined : "book_not_produced",
    };
  });

  return {
    ok: songResults.every((a) => a.status !== "failed") && bookResults.every((a) => a.status !== "failed"),
    songActions: songResults,
    bookActions: bookResults,
    enrichmentDraft: applied.enrichmentDraft,
    changed: applied.changed.length > 0,
    changedPaths: applied.changed,
    usage: {
      songPlannerCalls: 1,
      bookGuideCalls: pendingBooks.length ? 1 : 0,
      songsCreated: songResults.filter((a) => a.status === "success" && a.decision === "ADD").length,
      songsImproved: songResults.filter((a) => a.status === "success" && ["IMPROVE", "REPLACE"].includes(a.decision)).length,
      booksLinked: bookResults.filter((a) => a.status === "success" && ["ADD", "REPLACE"].includes(a.decision)).length,
      bookGuidesImproved: bookResults.filter((a) => a.status === "success" && a.decision === "IMPROVE_GUIDE").length,
    },
  };
}

function verifySongBookJobDraft({ beforePlan, afterPlan, songActions = [], bookActions = [] }) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  pass(beforePlan?.id === afterPlan?.id, "lesson_id", "Lesson ID unchanged.");
  pass(text(beforePlan?.age) === text(afterPlan?.age), "age", "Age unchanged.");
  pass(
    (beforePlan?.plan === "Pro" ? "Pro" : "Free") === (afterPlan?.plan === "Pro" ? "Pro" : "Free"),
    "access_plan",
    "Access plan unchanged.",
  );
  pass(text(beforePlan?.title) === text(afterPlan?.title), "title", "Title unchanged.");
  pass(afterPlan?.status === beforePlan?.status, "publish_status", "Publish status unchanged.");
  pass(
    text(beforePlan?.weeklyOverview, 500) === text(afterPlan?.weeklyOverview, 500),
    "published_weekly_overview",
    "Published weeklyOverview unchanged.",
  );

  // Images + printables untouched
  const beforeActs = beforePlan?.enrichmentDraft?.activities || {};
  const afterActs = afterPlan?.enrichmentDraft?.activities || {};
  Object.keys(beforeActs).forEach((id) => {
    const b = beforeActs[id] || {};
    const a = afterActs[id] || {};
    pass(
      text(b.setupImageUrl, 500) === text(a.setupImageUrl, 500)
        && text(b.exampleImageUrl, 500) === text(a.exampleImageUrl, 500)
        && text(b.relatedPrintableId, 160) === text(a.relatedPrintableId, 160),
      `assets_locked_${id}`,
      `Activity ${id} images/printables unchanged.`,
    );
  });
  const beforePrintableIds = schema.asArray(beforePlan?.enrichmentDraft?.week?.printableIds).map(String).sort().join(",");
  const afterPrintableIds = schema.asArray(afterPlan?.enrichmentDraft?.week?.printableIds).map(String).sort().join(",");
  pass(beforePrintableIds === afterPrintableIds, "printables_unchanged", "Draft printableIds unchanged.");

  const afterSongs = schema.asArray(afterPlan?.enrichmentDraft?.week?.songs);
  schema.asArray(songActions).forEach((action) => {
    if (action.status !== "success") return;
    const found = afterSongs.find((s) => text(s.linkedWeekday, 20).toLowerCase() === action.weekday
      && text(s.title, 120) === text(action.title || action.song?.title, 120));
    pass(Boolean(found), `song_present_${action.weekday}`, `Song for ${action.weekday} present after save.`);
    if (found) {
      pass(text(found.rightsStatus, 40).toLowerCase() === "original", `song_rights_${action.weekday}`, "Song marked original.");
      pass(!COPYRIGHT_LYRIC_RE.test(found.lyrics || ""), `song_copyright_safe_${action.weekday}`, "No copyrighted lyric markers.");
    }
  });

  const afterBooks = schema.asArray(afterPlan?.enrichmentDraft?.week?.books);
  schema.asArray(bookActions).forEach((action) => {
    if (action.status !== "success") return;
    const found = afterBooks.find((b) => text(b.title, 180) === text(action.title || action.book?.title, 180));
    pass(Boolean(found), "book_present", "Book present after save.");
    if (found) {
      const check = validateBookEntry(found);
      pass(check.ok, "book_verified", "Book title is verified or library-search.");
    }
  });

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed };
}

module.exports = {
  WEEKDAYS,
  SONG_DECISIONS,
  BOOK_DECISIONS,
  VERIFIED_BOOK_LIBRARY,
  normalizeSongDecision,
  normalizeBookDecision,
  buildSongBookActionsFromAudit,
  summarizeSongBookActions,
  buildOriginalSongForDay,
  buildBookGuideQuestions,
  validateSongEntry,
  validateBookEntry,
  findVerifiedBook,
  matchVerifiedBooksForLesson,
  isLibrarySearchTitle,
  applySongBookPlanToDraft,
  buildSongBookPlannerSystemPrompt,
  buildSongBookPlannerUserPrompt,
  buildSongBookContext,
  buildOperatorSongBookAiFixtureResponse,
  validateSongBookPlannerOutput,
  planSongsAndBooks,
  verifySongBookJobDraft,
  ageKind,
};
